/**
 * Explore-mode behaviour harness.
 * Dev server must be on :5199. Chrome + ANGLE d3d11.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.URL || 'http://localhost:5199/?shot=1&q=high';
const OUT = 'shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
});

const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => errors.push('page:' + e.message.slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('c:' + m.text().slice(0, 300)); });

await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__aq && window.__aq.ready, null, { timeout: 60000 });
await page.evaluate(() => {
  document.getElementById('hint').style.opacity = 0;
  document.getElementById('veil').style.display = 'none';
});
await page.evaluate(() => window.__aq.advance(8));
await page.waitForTimeout(400);

const report = { errors: [], steps: {} };

// 1. Explore toggle exists (icon only)
report.steps.button = await page.evaluate(() => {
  const btn = document.getElementById('explore');
  return {
    exists: !!btn,
    aria: btn?.getAttribute('aria-label') || '',
    text: (btn?.innerText || '').trim(),
    hasSvg: !!btn?.querySelector('svg'),
  };
});

// 2. Enter explore
const before = await page.evaluate(() => {
  const c = window.__aq.camera;
  return { x: c.position.x, y: c.position.y, z: c.position.z, fov: c.fov, near: c.near };
});
await page.click('#explore');
await page.waitForTimeout(200);
report.steps.entered = await page.evaluate(() => ({
  active: !!window.__aq.explore?.active,
  controlsOff: window.__aq.controls.enabled === false,
  btnOn: document.getElementById('explore')?.classList.contains('on'),
  near: window.__aq.camera.near,
}));

// 3. Mouse drag changes orientation
const orientA = await page.evaluate(() => {
  const c = window.__aq.camera;
  return { qx: c.quaternion.x, qy: c.quaternion.y, qz: c.quaternion.z, qw: c.quaternion.w };
});
const box = await page.locator('#c').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 180, box.y + box.height / 2 + 40, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(250);
const orientB = await page.evaluate(() => {
  const c = window.__aq.camera;
  return { qx: c.quaternion.x, qy: c.quaternion.y, qz: c.quaternion.z, qw: c.quaternion.w };
});
report.steps.dragLook = {
  changed: Math.abs(orientA.qy - orientB.qy) + Math.abs(orientA.qx - orientB.qx) > 0.01,
  before: orientA, after: orientB,
};

// 4. WASD moves camera
const posA = await page.evaluate(() => {
  const p = window.__aq.camera.position;
  return { x: p.x, y: p.y, z: p.z };
});
await page.locator('#c').focus();
await page.keyboard.down('KeyW');
await page.waitForTimeout(700);
await page.keyboard.up('KeyW');
await page.waitForTimeout(200);
const posB = await page.evaluate(() => {
  const p = window.__aq.camera.position;
  return { x: p.x, y: p.y, z: p.z };
});
report.steps.wasd = {
  moved: Math.hypot(posA.x - posB.x, posA.y - posB.y, posA.z - posB.z) > 0.02,
  before: posA, after: posB,
};

// 5. Wheel dolly
const posC = await page.evaluate(() => {
  const p = window.__aq.camera.position;
  return { x: p.x, y: p.y, z: p.z };
});
await page.mouse.wheel(0, -800);
await page.waitForTimeout(500);
const posD = await page.evaluate(() => {
  const p = window.__aq.camera.position;
  return { x: p.x, y: p.y, z: p.z };
});
report.steps.wheel = {
  moved: Math.hypot(posC.x - posD.x, posC.y - posD.y, posC.z - posD.z) > 0.01,
  before: posC, after: posD,
};

// 6. Fly into water — start in front of glass, look in, hold W
await page.evaluate(() => {
  const aq = window.__aq;
  if (!aq.explore.active) aq.setExplore(true);
  aq.camera.position.set(0, 0.22, 0.55);
  aq.camera.up.set(0, 1, 0);
  aq.camera.lookAt(0, 0.20, 0);
  aq.explore.resync();
});
await page.locator('#c').focus();
await page.keyboard.down('KeyW');
await page.waitForTimeout(2500);
await page.keyboard.up('KeyW');
await page.waitForTimeout(500);
// If still outside, nudge directly through the glass then resync FX
await page.evaluate(() => {
  const aq = window.__aq;
  const p = aq.camera.position;
  if (!(Math.abs(p.x) < 0.49 && p.y < 0.415 && Math.abs(p.z) < 0.2)) {
    p.set(0.02, 0.22, 0.05);
    aq.camera.up.set(0, 1, 0);
    aq.camera.lookAt(0.1, 0.18, -0.05);
    aq.explore.resync();
    aq.explore.update(1 / 30);
  }
});
await page.waitForTimeout(200);
report.steps.underwater = await page.evaluate(() => {
  const p = window.__aq.camera.position;
  const insideBox =
    Math.abs(p.x) < 0.49 && p.y > 0.02 && p.y < 0.415 && Math.abs(p.z) < 0.2;
  return {
    x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3),
    yBelowSurface: p.y < 0.415,
    inside: insideBox,
    exploreInside: !!window.__aq.explore?.inside,
    rayGain: +window.__aq.sys.water.rays.mat.uniforms.uRayGain.value.toFixed(3),
    near: window.__aq.camera.near,
  };
});

await page.screenshot({ path: `${OUT}/explore_inside.png` });
const statsInside = await page.evaluate(() => {
  const gl = window.__aq.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let r = 0, g = 0, b = 0, n = 0, dark = 0, bright = 0;
  const step = 16;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
      const L = (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
      if (L < 8) dark++;
      if (L > 200) bright++;
      n++;
    }
  }
  return {
    mean: [+(r / n).toFixed(1), +(g / n).toFixed(1), +(b / n).toFixed(1)],
    darkFrac: +(dark / n).toFixed(3),
    brightFrac: +(bright / n).toFixed(3),
  };
});
report.steps.insideLook = statsInside;

// 7. Toggle off restores framing
const exitPos = await page.evaluate(() => {
  const p = window.__aq.camera.position;
  return { x: p.x, y: p.y, z: p.z };
});
await page.click('#explore');
// wait for restore (~1.15s)
await page.waitForTimeout(1600);
report.steps.restored = await page.evaluate((before) => {
  const p = window.__aq.camera.position;
  const home = window.__aq.defaultCam.pos;
  const dist = Math.hypot(p.x - home[0], p.y - home[1], p.z - home[2]);
  return {
    active: !!window.__aq.explore?.active,
    restoring: !!window.__aq.explore?.restoring,
    controlsOn: window.__aq.controls.enabled === true,
    distToHome: +dist.toFixed(3),
    near: window.__aq.camera.near,
    btnOn: document.getElementById('explore')?.classList.contains('on'),
    beforeExit: before,
    after: { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) },
  };
}, exitPos);

await page.screenshot({ path: `${OUT}/explore_restored.png` });

// 8. Phone viewport + touch look
const phone = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
phone.on('pageerror', (e) => errors.push('phone:' + e.message.slice(0, 300)));
phone.on('console', (m) => { if (m.type() === 'error') errors.push('phone-c:' + m.text().slice(0, 200)); });
await phone.goto(BASE + '&explore=1', { waitUntil: 'load', timeout: 60000 });
await phone.waitForFunction(() => window.__aq && window.__aq.ready, null, { timeout: 60000 });
await phone.waitForTimeout(500);
report.steps.phone = await phone.evaluate(() => ({
  exploreBtn: !!document.getElementById('explore'),
  active: !!window.__aq.explore?.active,
}));
const pbox = await phone.locator('#c').boundingBox();
const q0 = await phone.evaluate(() => {
  const c = window.__aq.camera;
  return { qy: c.quaternion.y, qx: c.quaternion.x };
});
await phone.touchscreen.tap(pbox.x + pbox.width / 2, pbox.y + pbox.height / 2);
// drag via mouse API still works for look in explore (pointer events)
await phone.mouse.move(pbox.x + pbox.width / 2, pbox.y + pbox.height / 2);
await phone.mouse.down();
await phone.mouse.move(pbox.x + pbox.width / 2 + 120, pbox.y + pbox.height / 2 + 30, { steps: 10 });
await phone.mouse.up();
await phone.waitForTimeout(200);
const q1 = await phone.evaluate(() => {
  const c = window.__aq.camera;
  return { qy: c.quaternion.y, qx: c.quaternion.x };
});
report.steps.phoneLook = {
  changed: Math.abs(q0.qy - q1.qy) + Math.abs(q0.qx - q1.qx) > 0.01,
  before: q0, after: q1,
};
await phone.screenshot({ path: `${OUT}/explore_phone.png` });
await phone.close();

report.errors = errors;
report.beforeDefault = before;
report.ok =
  report.steps.button.exists &&
  report.steps.button.text === '' &&
  report.steps.entered.active &&
  report.steps.dragLook.changed &&
  report.steps.wasd.moved &&
  report.steps.wheel.moved &&
  report.steps.underwater.inside &&
  report.steps.underwater.yBelowSurface &&
  report.steps.restored.distToHome < 0.15 &&
  !report.steps.restored.active &&
  report.steps.phone.active &&
  report.steps.phoneLook.changed &&
  errors.length === 0;

console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(report.ok ? 0 : 1);
