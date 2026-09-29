/**
 * Deterministic cinematic capture → PNG frames → H.264 mp4 (+ optional WAV mux).
 *
 * Usage:
 *   node scripts/cine-record.mjs              # vertical 1080x1920
 *   node scripts/cine-record.mjs --wide       # also / only 1920x1080
 *   node scripts/cine-record.mjs --frames 90  # smoke test first N frames
 *   node scripts/cine-record.mjs --start 0 --frames 60
 *
 * Dev server must be on :5199. Does NOT git push.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VIDEO = path.join(ROOT, 'video');
const FRAMES = path.join(VIDEO, 'frames_v');
const FRAMES_W = path.join(VIDEO, 'frames_w');

const args = process.argv.slice(2);
// bare → vertical; --wide → both; --wide-only → landscape only
const CAPTURE_VERT = args.includes('--wide') || (!args.includes('--wide') && !args.includes('--wide-only'));
const CAPTURE_WIDE = args.includes('--wide') || args.includes('--wide-only');
const framesLimit = (() => {
  const i = args.indexOf('--frames');
  return i >= 0 ? Math.max(1, +args[i + 1]) : null;
})();
const startFrame = (() => {
  const i = args.indexOf('--start');
  return i >= 0 ? Math.max(0, +args[i + 1]) : 0;
})();
const JPEG_Q = 0.92;

fs.mkdirSync(VIDEO, { recursive: true });

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function captureAspect({ width, height, outDir, label, outMp4 }) {
  console.log(`\n=== ${label} ${width}x${height} ===`);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--enable-gpu-rasterization',
      '--no-sandbox',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });

  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) {
      console.log('[browser]', m.type(), m.text().slice(0, 300));
    }
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  const url = `http://localhost:5199/?cine=1&shot=1&q=high&seed=7`;
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__cine && window.__cine.ready && window.__aq && window.__aq.ready, null, { timeout: 90000 });

  // Ensure overlays gone
  await page.evaluate(() => {
    for (const id of ['hint', 'snd', 'veil']) {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.style.opacity = '0'; }
    }
  });

  const meta = await page.evaluate(() => ({
    duration: window.__cine.duration,
    fps: window.__cine.fps,
    totalFrames: window.__cine.totalFrames,
    warmupSec: window.__cine.warmupSec,
  }));
  console.log('cine meta', meta);

  console.log(`warmup ${meta.warmupSec}s …`);
  const tw0 = Date.now();
  await page.evaluate(() => window.__cine.warmup());
  console.log(`warmup done in ${((Date.now() - tw0) / 1000).toFixed(1)}s`);

  // Soundtrack once (vertical pass)
  let wavPath = path.join(VIDEO, 'soundtrack.wav');
  if (label === 'vertical' || !fs.existsSync(wavPath)) {
    console.log('rendering soundtrack…');
    const b64 = await page.evaluate(async () => {
      const buf = await window.__cine.renderSoundtrack();
      const bytes = new Uint8Array(buf);
      let s = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        s += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return btoa(s);
    });
    fs.writeFileSync(wavPath, Buffer.from(b64, 'base64'));
    console.log('wrote', wavPath);
  }

  const last = framesLimit != null
    ? Math.min(meta.totalFrames, startFrame + framesLimit)
    : meta.totalFrames;

  console.log(`capturing frames ${startFrame}..${last - 1} (${last - startFrame} frames)`);
  const t0 = Date.now();

  // Capture via in-page canvas.toDataURL (JPEG) — reliable with preserveDrawingBuffer
  for (let fi = startFrame; fi < last; fi++) {
    const dataUrl = await page.evaluate((frame) => {
      window.__cine.seek(frame);
      const c = document.getElementById('c');
      return c.toDataURL('image/jpeg', 0.88);
    }, fi);

    const b64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    const name = `frame_${String(fi).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, 'base64'));

    if (fi === startFrame || fi % 30 === 0 || fi === last - 1) {
      const elapsed = (Date.now() - t0) / 1000;
      const done = fi - startFrame + 1;
      const rate = done / Math.max(elapsed, 0.01);
      const eta = (last - fi - 1) / Math.max(rate, 0.01);
      console.log(`  frame ${fi}/${last - 1}  ${rate.toFixed(1)} f/s  eta ${eta.toFixed(0)}s`);
    }
  }

  await browser.close();

  // Encode
  const pattern = path.join(outDir, 'frame_%05d.jpg');
  const tmpMp4 = path.join(VIDEO, `_tmp_${label}.mp4`);
  const ffArgs = [
    '-y',
    '-framerate', String(meta.fps),
    '-start_number', String(startFrame),
    '-i', pattern,
    '-i', wavPath,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'medium',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '160k',
    '-shortest',
    '-movflags', '+faststart',
    '-r', String(meta.fps),
    tmpMp4,
  ];
  // If we only captured a partial range, don't mux full audio length oddly — still OK with -shortest
  console.log('ffmpeg encode…');
  const ff = spawnSync('ffmpeg', ffArgs, { stdio: 'inherit' });
  if (ff.status !== 0) {
    // retry without audio if wav somehow missing
    console.warn('mux failed, encoding video-only');
    spawnSync('ffmpeg', [
      '-y', '-framerate', String(meta.fps), '-start_number', String(startFrame),
      '-i', pattern,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'medium',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-movflags', '+faststart', '-r', String(meta.fps), tmpMp4,
    ], { stdio: 'inherit' });
  }
  fs.renameSync(tmpMp4, outMp4);
  console.log('wrote', outMp4);
  spawnSync('ffprobe', ['-hide_banner', outMp4], { stdio: 'inherit' });
  return outMp4;
}

const results = [];
if (CAPTURE_VERT) {
  results.push(await captureAspect({
    width: 1080, height: 1920,
    outDir: FRAMES,
    label: 'vertical',
    outMp4: path.join(VIDEO, 'aquarium_cinematic_vertical.mp4'),
  }));
}
if (CAPTURE_WIDE) {
  results.push(await captureAspect({
    width: 1920, height: 1080,
    outDir: FRAMES_W,
    label: 'wide',
    outMp4: path.join(VIDEO, 'aquarium_cinematic_wide.mp4'),
  }));
}

console.log('\nDone:', results);
