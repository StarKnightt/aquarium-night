/** Grab a handful of cinematic stills at key film times for QA. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('video/stills');
fs.mkdirSync(OUT, { recursive: true });

const TIMES = [
  ['hook0', 0],
  ['hook08', 0.8],
  ['outside', 4.0],
  ['plunge', 7.7],
  ['sand', 10.0],
  ['angel', 13.5],
  ['bubbles', 17.0],
  ['feed', 19.5],
  ['tap', 21.7],
  ['finale', 27.0],
];

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/?cine=1&shot=1&q=high&seed=7', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__cine?.ready && window.__aq?.ready, null, { timeout: 90000 });
await page.evaluate(() => window.__cine.warmup());

const fps = await page.evaluate(() => window.__cine.fps);
let last = -1;
for (const [name, t] of TIMES) {
  const fi = Math.round(t * fps);
  // seek forward only — reload if needed (we go increasing)
  if (fi < last) throw new Error('times must be sorted');
  const dataUrl = await page.evaluate(async (frame) => {
    window.__cine.seek(frame);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.getElementById('c').toDataURL('image/jpeg', 0.93);
  }, fi);
  const file = path.join(OUT, `${name}_f${String(fi).padStart(4, '0')}.jpg`);
  fs.writeFileSync(file, Buffer.from(dataUrl.replace(/^data:image\/jpeg;base64,/, ''), 'base64'));
  console.log('saved', file);
  last = fi;
}
await browser.close();
