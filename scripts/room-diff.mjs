// Room rigidity diff harness.
// usage: node scripts/room-diff.mjs [url] [label]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { PNG } from 'pngjs';

const url = process.argv[2] || 'http://localhost:5199/?shot=1&q=high';
const label = process.argv[3] || 'meas';
const W = Number(process.env.W || 1600);
const H = Number(process.env.H || 900);
const FLAGS = process.env.FLAGS || ''; // e.g. "grain=0,refract=0,dof=0,soft=0,bloom=0,barrel=0,ca=0"

fs.mkdirSync('shots', { recursive: true });

function decode(buf) {
  return new Promise((res, rej) => {
    new PNG().parse(buf, (err, png) => (err ? rej(err) : res({ w: png.width, h: png.height, data: png.data })));
  });
}

function meanAbs(a, b, mask) {
  let sum = 0, n = 0, max = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    if (!mask(x, y, a.w, a.h)) continue;
    const o = (y * a.w + x) * 4;
    const d = (Math.abs(a.data[o] - b.data[o]) + Math.abs(a.data[o + 1] - b.data[o + 1]) + Math.abs(a.data[o + 2] - b.data[o + 2])) / 3;
    sum += d; n++; if (d > max) max = d;
  }
  return { mean: n ? sum / n : 0, max, n };
}

function roomMask(x, y, w, h) {
  const u = x / w, v = 1 - y / h;
  const inTank = u > 0.22 && u < 0.78 && v > 0.18 && v < 0.72;
  return !inTank && (u < 0.18 || u > 0.82 || v < 0.14 || v > 0.78);
}
function tankMask(x, y, w, h) {
  const u = x / w, v = 1 - y / h;
  return u > 0.30 && u < 0.70 && v > 0.25 && v < 0.65;
}

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(url, { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => window.__aq?.ready, null, { timeout: 60000 });
await page.evaluate(() => {
  for (const id of ['hint', 'veil', 'snd', 'explore']) {
    const el = document.getElementById(id);
    if (el) { el.style.opacity = '0'; el.style.display = id === 'veil' ? 'none' : el.style.display; }
  }
  window.__cineNoAdapt = true;
  window.__aqScale = 1;
});
await page.evaluate(() => {
  window.__aq.advance(14);
  window.__aq.setCam(window.__aq.defaultCam.pos, window.__aq.defaultCam.look);
});
await page.waitForTimeout(300);

const flags = Object.fromEntries(
  FLAGS.split(',').filter(Boolean).map((p) => {
    const [k, v] = p.split('=');
    return [k, Number(v)];
  })
);

const tankUV = await page.evaluate((flags) => {
  const p = window.__aqPost || window.__aq?.post;
  if (!p?.photo) return { err: 'no post' };
  const u = p.photo.uniforms;
  if ('grain' in flags) u.uGrain.value = flags.grain;
  else u.uGrain.value = 0;
  if ('refract' in flags) u.uRefract.value = flags.refract;
  if ('soft' in flags) u.uSoft.value = flags.soft;
  if ('barrel' in flags) u.uBarrel.value = flags.barrel;
  if ('ca' in flags) u.uCA.value = flags.ca;
  if ('halo' in flags) u.uHalo.value = flags.halo;
  if ('dof' in flags && p.dofH) {
    p.dofH.uniforms.uEnabled.value = flags.dof;
    p.dofV.uniforms.uEnabled.value = flags.dof;
  }
  if ('bloom' in flags && p.bloom) {
    p.bloom.strength = flags.bloom;
  }
  // freeze controls
  if (window.__aq.controls) {
    window.__aq.controls.enableDamping = false;
    window.__aq.controls.update();
  }
  return {
    tankUV: u.uTankUV.value.toArray?.() || [...u.uTankUV.value],
    grain: u.uGrain.value,
    refract: u.uRefract.value,
    soft: u.uSoft.value,
    barrel: u.uBarrel.value,
  };
}, flags);
console.log('flags', tankUV);

const bufs = [];
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => {
    // keep camera frozen; advance sim so tank moves
    window.__aq.controls?.update?.();
    window.__aq.advance(1 / 30);
  });
  await page.waitForTimeout(40);
  const buf = await page.screenshot({ type: 'png' });
  fs.writeFileSync(`shots/roomdiff_${label}_${i}.png`, buf);
  bufs.push(buf);
}
const imgs = [];
for (const b of bufs) imgs.push(await decode(b));

const r01 = meanAbs(imgs[0], imgs[1], roomMask);
const r12 = meanAbs(imgs[1], imgs[2], roomMask);
const t01 = meanAbs(imgs[0], imgs[1], tankMask);
const result = {
  label, W, H, FLAGS,
  room_mean: +((r01.mean + r12.mean) / 2).toFixed(4),
  room_01: +r01.mean.toFixed(4),
  room_12: +r12.mean.toFixed(4),
  room_max: +Math.max(r01.max, r12.max).toFixed(2),
  tank_mean_01: +t01.mean.toFixed(4),
};
console.log(JSON.stringify(result, null, 2));
fs.writeFileSync(`shots/roomdiff_${label}.json`, JSON.stringify(result, null, 2));
await browser.close();
