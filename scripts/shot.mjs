// Screenshot harness for the critic agents.
// usage: node scripts/shot.mjs <prefix> [viewName ...]   (dev server must be running on :5199)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const prefix = process.argv[2] || 'shot';
const wanted = process.argv.slice(3);
const base = process.env.URL || 'http://localhost:5199/?shot=1&q=high';

// name: [camPos, lookAt, advanceSeconds]
const VIEWS = {
  front: [null, null],                                        // default framing
  left: [[-0.75, 0.55, 1.15], [0, 0.2, 0]],
  right: [[0.75, 0.55, 1.15], [0, 0.2, 0]],
  top: [[0, 1.25, 0.55], [0, 0.25, 0]],
  closeL: [[-0.32, 0.22, 0.62], [-0.3, 0.14, 0]],
  closeC: [[0.0, 0.2, 0.6], [0.0, 0.14, 0]],
  closeR: [[0.34, 0.22, 0.62], [0.3, 0.14, 0]],
  room: [[0.0, 0.5, 2.6], [0, 0.1, 0]],
  glass: [[0.15, 0.30, 0.42], [0.1, 0.22, 0]],
  side: [[1.3, 0.3, 0.3], [0, 0.2, -0.05]],
  sand: [[0.0, 0.62, 0.30], [0.0, 0.03, 0.0]],
  feed: [null, null, 'feed'],
  tap: [[0.2, 0.42, 0.9], [0.05, 0.2, 0.0], 'tap'],
  feedClose: [[0.05, 0.48, 0.62], [0.05, 0.36, 0.0], 'feedClose'],
};

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-gpu-rasterization', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[browser]', m.type(), m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => window.__aq && window.__aq.ready, null, { timeout: 60000 });
await page.evaluate(() => { document.getElementById('hint').style.opacity = 0; document.getElementById('veil').style.display = 'none'; });
// let the simulation settle (fish spread out, plants sway, bubbles fill the column)
if (process.env.DBG) await page.evaluate(() => { window.__aqU.uDbg.value = 1; });
await page.evaluate(() => window.__aq.advance(18));
await page.waitForTimeout(1200);

fs.mkdirSync('shots', { recursive: true });
const names = wanted.length ? wanted : ['front', 'left', 'closeC', 'top'];
for (const n of names) {
  let v = VIEWS[n];
  if (!v && /Cam$/.test(n)) v = [null, null, n];
  if (!v) { console.log('unknown view', n); continue; }
  if (v[2] && /Cam$/.test(v[2])) {
    await page.evaluate((k) => { const f = window.__aq.sys.fish.fishes.find((q) => q.key === k); const p = f.pos; window.__aq.setCam([p.x + 0.05, p.y + 0.03, Math.min(p.z + 0.16, 0.42)], [p.x, p.y, p.z]); }, v[2].replace('Cam', ''));
  } else if (v[0]) await page.evaluate(([p, l]) => window.__aq.setCam(p, l), v);
  else await page.evaluate(() => window.__aq.setCam(window.__aq.defaultCam.pos, window.__aq.defaultCam.look));
  if (v[2] === 'feed') await page.evaluate(() => { window.__aq.sys.food.drop(0.02, 0.0, 14); window.__aq.advance(6); });
  if (v[2] === 'feedClose') await page.evaluate(() => { window.__aq.sys.food.drop(0.05, 0.02, 14); window.__aq.advance(4.5); });
  if (v[2] === 'tap') await page.evaluate(() => { window.__aq.sys.fish.scare({ x: 0.05, y: 0.2, z: 0.21 }, 1); window.__aq.advance(0.35); });
  await page.evaluate(() => window.__aq.advance(0.1));
  await page.waitForTimeout(700);
  const file = `shots/${prefix}_${n}.png`;
  await page.screenshot({ path: file });
  console.log('saved', file);
}
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 > 2000) res(n / 2); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));
console.log('headless fps ~', fps.toFixed(0));
await browser.close();
