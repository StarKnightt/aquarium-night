import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 220)); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

async function boot() {
  await page.goto('http://localhost:5199/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__aq?.ready && window.__aq.sys?.interaction, null, { timeout: 60000 });
  await page.waitForTimeout(400);
}

function screenOf(x, y, z) {
  return page.evaluate(([x, y, z]) => {
    const cam = window.__aq.camera;
    const vv = cam.position.clone().set(x, y, z);
    vv.project(cam);
    const canvas = document.getElementById('c');
    const rect = canvas.getBoundingClientRect();
    return {
      clientX: rect.left + (vv.x * 0.5 + 0.5) * rect.width,
      clientY: rect.top + (-vv.y * 0.5 + 0.5) * rect.height,
      ndcZ: vv.z,
    };
  }, [x, y, z]);
}

await boot();

const beforeCam = await page.evaluate(() => ({
  pos: window.__aq.camera.position.toArray(),
  az: window.__aq.controls.getAzimuthalAngle(),
  cursor: document.getElementById('c').style.cursor || getComputedStyle(document.getElementById('c')).cursor,
  minAz: window.__aq.controls.minAzimuthAngle,
  maxAz: window.__aq.controls.maxAzimuthAngle,
  favicon: document.querySelector('link[rel="icon"]')?.href?.startsWith('data:') ?? false,
  events: typeof window.__aq.events?.on === 'function',
}));
console.log('BEFORE_CAM', JSON.stringify(beforeCam, null, 2));

const box = await page.locator('#c').boundingBox();
const cx = box.x + box.width * 0.5;
const cy = box.y + box.height * 0.55;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 160, cy - 20, { steps: 25 });
await page.mouse.up();
await page.waitForTimeout(500);

const afterDrag = await page.evaluate(() => ({
  pos: window.__aq.camera.position.toArray(),
  az: window.__aq.controls.getAzimuthalAngle(),
}));
const dragDelta = Math.hypot(
  afterDrag.pos[0] - beforeCam.pos[0],
  afterDrag.pos[1] - beforeCam.pos[1],
  afterDrag.pos[2] - beforeCam.pos[2],
);
console.log('AFTER_DRAG', JSON.stringify({ afterDrag, dragDelta }, null, 2));

// Fresh page for click tests at default framing
await boot();

const waterScr = await screenOf(0.05, 0.415, 0.02);
const glassScr = await screenOf(0.0, 0.20, 0.21);
console.log('TARGETS', JSON.stringify({ waterScr, glassScr }, null, 2));

const flakesBefore = await page.evaluate(() => window.__aq.sys.food.flakes.length);
await page.evaluate(() => {
  window.__aq._feedLog = null;
  window.__aq.events.on('feed', (d) => { window.__aq._feedLog = d; });
  window.__aq._tapLog = null;
  window.__aq.events.on('tap', (d) => { window.__aq._tapLog = d; });
});
await page.mouse.click(waterScr.clientX, waterScr.clientY);
await page.waitForTimeout(250);
const feed = await page.evaluate(() => ({
  flakes: window.__aq.sys.food.flakes.length,
  feedEvt: window.__aq._feedLog,
  tapEvt: window.__aq._tapLog,
}));
console.log('FEED', JSON.stringify({ flakesBefore, feed }, null, 2));

const speedBefore = await page.evaluate(() => {
  const fish = window.__aq.sys.fish.fishes;
  return fish.reduce((a, f) => a + f.spd, 0) / fish.length;
});
await page.mouse.click(glassScr.clientX, glassScr.clientY);
await page.waitForTimeout(80);
await page.evaluate(() => window.__aq.advance(0.35));
const speedSpike = await page.evaluate(() => {
  const fish = window.__aq.sys.fish.fishes;
  return {
    mean: fish.reduce((a, f) => a + f.spd, 0) / fish.length,
    panic: fish.filter((f) => f.panic > 0.01).length,
  };
});
await page.evaluate(() => window.__aq.advance(12));
const speedLater = await page.evaluate(() => {
  const fish = window.__aq.sys.fish.fishes;
  return fish.reduce((a, f) => a + f.spd, 0) / fish.length;
});
console.log('SCARE', JSON.stringify({ speedBefore, speedSpike, speedLater }, null, 2));

// Hover cursor over water
await page.mouse.move(waterScr.clientX, waterScr.clientY);
await page.waitForTimeout(50);
const cursorWater = await page.evaluate(() => document.getElementById('c').style.cursor);
await page.mouse.move(glassScr.clientX, glassScr.clientY);
await page.waitForTimeout(50);
const cursorGlass = await page.evaluate(() => document.getElementById('c').style.cursor);
console.log('CURSORS', { cursorWater, cursorGlass });

await browser.close();
