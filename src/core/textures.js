import * as THREE from 'three';
import { mulberry32, fbm2, noise2 } from './noise.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(canvas, { srgb = true, repeat = true, aniso = 8, mip = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Warm walnut/oak wood with long grain, returns {map, rough} */
export function makeWood({ w = 1024, h = 1024, base = [92, 56, 32], dark = [48, 27, 15], seed = 4, plankCount = 1, ringScale = 1 } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const rnd = mulberry32(seed);
  const off = rnd() * 100;
  const pw = h / plankCount;
  for (let y = 0; y < h; y++) {
    const plank = Math.floor(y / pw);
    const pOff = plank * 17.3 + off;
    const pTone = 0.85 + (mulberry32(seed * 31 + plank)() - 0.5) * 0.3;
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      // stretched noise -> long grain along x
      const warp = fbm2(u * 2.2 + pOff, v * 5.0, 3) * 0.9;
      const rings = Math.sin((v * 46 * ringScale + warp * 9 + pOff) * 1.0) * 0.5 + 0.5;
      const grain = fbm2(u * 3 + pOff, v * 90, 3) * 0.5 + 0.5;
      const fine = noise2(u * 400, v * 6 + pOff) * 0.5 + 0.5;
      let t = 0.55 * grain + 0.35 * rings + 0.10 * fine;
      t = Math.min(1, Math.max(0, t));
      // plank seam
      const edge = Math.min(y % pw, pw - (y % pw));
      const seam = plankCount > 1 && edge < 1.6 ? 0.25 : 1;
      const i = (y * w + x) * 4;
      const k = pTone * seam;
      img.data[i] = (dark[0] + (base[0] - dark[0]) * t) * k;
      img.data[i + 1] = (dark[1] + (base[1] - dark[1]) * t) * k;
      img.data[i + 2] = (dark[2] + (base[2] - dark[2]) * t) * k;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c);
}

/** Painted wall: soft mottling + faint roller texture */
export function makeWall({ w = 512, h = 512, base = [78, 86, 96], seed = 9 } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const m = fbm2(u * 6 + seed, v * 6, 4) * 0.5 + 0.5;
      const f = noise2(u * 260, v * 260) * 0.5 + 0.5;
      const roller = noise2(u * 3, v * 70 + seed) * 0.5 + 0.5;
      const k = 0.86 + m * 0.18 + f * 0.04 + roller * 0.05;
      const i = (y * w + x) * 4;
      img.data[i] = base[0] * k; img.data[i + 1] = base[1] * k; img.data[i + 2] = base[2] * k; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c);
}

/**
 * Fine aquarium sand: albedo + normal map from a grain heightfield.
 * Mix of pale quartz, beige, grey and a few dark grains; sparse sparkle pits.
 */
export function makeSand(size = 1024, seed = 21) {
  const rnd = mulberry32(seed);
  const height = new Float32Array(size * size);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  // grain size classes: fine / medium / coarse / dark grit / pale quartz
  const palette = [
    [176, 152, 116], [160, 138, 104], [188, 168, 132], [132, 116, 92],
    [204, 190, 160], [112, 100, 84], [64, 58, 50], [170, 148, 112],
    [220, 210, 190], [90, 82, 70], [148, 130, 100], [195, 175, 145],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size, v = y / size;
      // grain-size distribution via multi-scale noise
      const fine = noise2(u * 380 + seed, v * 380) * 0.5 + 0.5;
      const med = fbm2(u * 55 + 3, v * 55, 2) * 0.5 + 0.5;
      const coarse = fbm2(u * 14 + 9, v * 14, 3) * 0.5 + 0.5;
      const g = rnd();
      let pIdx = Math.floor(Math.pow(g, 1.35) * (palette.length - 2));
      if (fine > 0.92) pIdx = 8; // pale quartz
      if (g > 0.97) pIdx = 6; // dark grit
      if (coarse > 0.88 && g > 0.6) pIdx = Math.min(palette.length - 1, pIdx + 2);
      const p = palette[pIdx];
      const patch = fbm2(u * 9, v * 9, 3) * 0.5 + 0.5;
      const jitter = 0.74 + fine * 0.22 + med * 0.12;
      // sparse pits
      const pit = Math.pow(Math.max(0, noise2(u * 90 + 2, v * 90) - 0.72), 2.0);
      const k = jitter * (0.92 + patch * 0.08) * (1 - pit * 0.55);
      img.data[i * 4] = Math.min(255, p[0] * k);
      img.data[i * 4 + 1] = Math.min(255, p[1] * k);
      img.data[i * 4 + 2] = Math.min(255, p[2] * k);
      img.data[i * 4 + 3] = 255;
      // height: coarse grains taller, pits lower, quartz slightly proud
      height[i] = (0.35 + med * 0.35 + coarse * 0.25 + fine * 0.15) * (1 - pit * 0.7) + (pIdx === 8 ? 0.08 : 0);
    }
  }
  // sparse shell/rock micro-debris
  for (let n = 0; n < Math.floor(size * size * 0.00035); n++) {
    const cx = (rnd() * size) | 0, cy = (rnd() * size) | 0;
    const rad = 1 + (rnd() * 3) | 0;
    const col = rnd() > 0.5 ? [210, 195, 170] : [70, 62, 52];
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const x = (cx + dx + size) % size, y = (cy + dy + size) % size;
      const i = (y * size + x) * 4;
      const t = 1 - Math.hypot(dx, dy) / (rad + 0.01);
      img.data[i] = img.data[i] * (1 - t) + col[0] * t;
      img.data[i + 1] = img.data[i + 1] * (1 - t) + col[1] * t;
      img.data[i + 2] = img.data[i + 2] * (1 - t) + col[2] * t;
      height[y * size + x] += t * 0.35;
    }
  }
  // sparse bright quartz sparkle glints in albedo (emissive-like bright flecks)
  for (let n = 0; n < Math.floor(size * 0.9); n++) {
    const x = (rnd() * size) | 0, y = (rnd() * size) | 0;
    const i = (y * size + x) * 4;
    img.data[i] = 245; img.data[i + 1] = 240; img.data[i + 2] = 228;
    height[y * size + x] += 0.15;
  }
  ctx.putImageData(img, 0, 0);
  const albedo = canvasTexture(c);

  const nc = makeCanvas(size, size);
  const nctx = nc.getContext('2d');
  const nimg = nctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3.4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 3.4;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      nimg.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  const normal = canvasTexture(nc, { srgb: false });
  return { albedo, normal };
}

/** Dark laminate floor */
export function makeFloor(seed = 12) {
  return makeWood({ w: 1024, h: 1024, base: [70, 56, 44], dark: [36, 28, 22], seed, plankCount: 6, ringScale: 0.5 });
}

/** Soft radial glow sprite texture */
export function makeGlow(size = 128, stops = [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(c, { repeat: false, mip: false });
}

export { makeCanvas };
