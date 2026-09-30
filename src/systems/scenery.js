import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { TANK, WU, patchWater } from '../core/waterPatch.js';
import { fbm2, fbm3, noise2, mulberry32 } from '../core/noise.js';
import { makeSand } from '../core/textures.js';
import { Q } from '../core/quality.js';

// Iwagumi-ish triangle: main (oyaishi) + secondary (fukuishi) + tertiary + pebbles
// x, z, sx, sy, sz, tone(rgb), yaw, tilt
const ROCKS = [
  [-0.14, -0.03, 0.195, 0.132, 0.118, [0.30, 0.26, 0.21], 0.55, 0.12],  // main
  [-0.34, -0.09, 0.108, 0.078, 0.090, [0.34, 0.28, 0.21], 2.2, -0.18], // secondary
  [0.28, -0.05, 0.095, 0.068, 0.080, [0.20, 0.20, 0.185], 4.1, 0.08],  // tertiary
  [-0.06, 0.05, 0.052, 0.036, 0.044, [0.24, 0.235, 0.19], 1.1, 0.12],
  [0.40, 0.01, 0.046, 0.032, 0.040, [0.31, 0.25, 0.19], 0.4, 0.18],
  [0.18, 0.09, 0.038, 0.024, 0.032, [0.26, 0.24, 0.21], 2.6, 0.05],
  [-0.42, 0.10, 0.034, 0.022, 0.028, [0.20, 0.21, 0.18], 1.5, 0],
  [0.05, 0.15, 0.022, 0.014, 0.018, [0.32, 0.28, 0.22], 0.8, 0],
  [0.36, 0.11, 0.028, 0.018, 0.024, [0.22, 0.21, 0.19], 5.1, 0],
  [-0.02, 0.09, 0.018, 0.012, 0.015, [0.28, 0.26, 0.21], 3.2, 0],
  [-0.25, 0.08, 0.016, 0.010, 0.013, [0.3, 0.27, 0.2], 2.1, 0],
  [0.12, 0.16, 0.014, 0.009, 0.011, [0.24, 0.23, 0.2], 4.3, 0],
  [0.46, 0.10, 0.017, 0.011, 0.014, [0.27, 0.26, 0.22], 1.0, 0],
  [-0.29, 0.16, 0.012, 0.008, 0.010, [0.22, 0.21, 0.2], 3.8, 0],
];

function sandBase(x, z) {
  const zz = (z + TANK.id) / (2 * TANK.id);          // 0 back -> 1 front
  const slope = 0.048 * Math.pow(1 - zz, 1.5);
  const dunes = fbm2(x * 3.1 + 4.0, z * 4.6 - 2.0, 3) * 0.030;
  const mound = Math.exp(-(((x + 0.28) / 0.22) ** 2 + ((z + 0.02) / 0.13) ** 2)) * 0.024
              + Math.exp(-(((x - 0.30) / 0.20) ** 2 + ((z + 0.06) / 0.12) ** 2)) * 0.020;
  const warp = fbm2(x * 6, z * 6, 2) * 5.0;
  const ripple = Math.sin((x * 110 + z * 42 + warp) * 1.0) * 0.0011 * (0.5 + 0.5 * noise2(x * 4, z * 4));
  return TANK.waterMinY + 0.006 + slope + dunes + mound + ripple;
}

/** Open sand height (no rock banks) — for bottom-feeders that should hug the bed. */
export function sandFloor(x, z) {
  return sandBase(x, z);
}

/** Bed height including little piles of sand banked up against every stone. */
export function sandHeight(x, z) {
  let h = sandBase(x, z);
  for (let i = 0; i < ROCKS.length; i++) {
    const r = ROCKS[i];
    const dx = (x - r[0]) / r[2], dz = (z - r[1]) / r[4];
    const rn = Math.sqrt(dx * dx + dz * dz);
    if (rn < 2.15) {
      const t = Math.min(1, Math.max(0, (2.15 - rn) / 1.2));
      h += r[3] * 0.72 * t * t * (3 - 2 * t) * (0.85 + 0.3 * noise2(x * 40 + i, z * 40));
    }
  }
  return h;
}

// ------------------------------------------------------------------------------------------------
// Rocks: angular river / dragon-stone style — convex hull of jittered points, chamfered edges,
// strata cracks, conchoidal chips, vertex-coloured pores/veins/moss/algae.
// ------------------------------------------------------------------------------------------------
function makeRock(seed, sx, sy, sz, seg, tone) {
  const rnd = mulberry32(seed * 91 + 3);
  const s = seed * 7.31;
  const nPts = Math.max(18, Math.round(14 + seg[0] * 1.4));
  const pts = [];
  // axis-aligned box corners + edge midpoints (hard silhouette)
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    if (x === 0 && y === 0 && z === 0) continue;
    const jx = (rnd() - 0.5) * 0.35, jy = (rnd() - 0.5) * 0.28, jz = (rnd() - 0.5) * 0.35;
    pts.push(new THREE.Vector3(
      (x * 0.72 + jx) * (0.85 + rnd() * 0.25),
      (y * 0.62 + jy) * (0.80 + rnd() * 0.30),
      (z * 0.72 + jz) * (0.85 + rnd() * 0.25),
    ));
  }
  // extra random hull points on ellipsoid (fills convex volume)
  for (let i = 0; i < nPts; i++) {
    const a = rnd() * Math.PI * 2;
    const b = Math.acos(2 * rnd() - 1);
    let x = Math.sin(b) * Math.cos(a);
    let y = Math.cos(b);
    let z = Math.sin(b) * Math.sin(a);
    // squash + angular push toward octahedral directions
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    const oct = Math.pow(ax + ay + az, -0.55);
    const r = (0.55 + rnd() * 0.55) * oct;
    x *= r; y *= r * (0.78 + rnd() * 0.35); z *= r;
    // dragon-stone vertical ridges
    x += Math.sign(x || 1) * Math.pow(Math.abs(x), 0.7) * 0.12 * (rnd() - 0.2);
    pts.push(new THREE.Vector3(x, y, z));
  }
  // conchoidal chip voids: pull a few points inward near a random face
  for (let c = 0; c < 2 + (rnd() * 2) | 0; c++) {
    const cx = (rnd() - 0.5) * 1.4, cy = (rnd() - 0.3) * 1.2, cz = (rnd() - 0.5) * 1.4;
    pts.push(new THREE.Vector3(cx * 0.45, cy * 0.4, cz * 0.45));
  }

  let g = new ConvexGeometry(pts);
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);

  // slight edge chamfer: push vertices toward face-centroid average (one laplacian soften)
  const p = g.attributes.position;
  const idx = g.index;
  const adj = Array.from({ length: p.count }, () => []);
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b);
  }
  const soft = new Float32Array(p.count * 3);
  const v = new THREE.Vector3(), acc = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    acc.set(0, 0, 0);
    const nbs = adj[i];
    for (let k = 0; k < nbs.length; k++) {
      acc.x += p.getX(nbs[k]); acc.y += p.getY(nbs[k]); acc.z += p.getZ(nbs[k]);
    }
    const inv = 1 / Math.max(1, nbs.length);
    soft[i * 3] = v.x * 0.82 + acc.x * inv * 0.18;
    soft[i * 3 + 1] = v.y * 0.82 + acc.y * inv * 0.18;
    soft[i * 3 + 2] = v.z * 0.82 + acc.z * inv * 0.18;
  }
  for (let i = 0; i < p.count; i++) p.setXYZ(i, soft[i * 3], soft[i * 3 + 1], soft[i * 3 + 2]);

  // strata cracks + scale to sx/sy/sz + vertex colours
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const nrm = v.clone().normalize();
    // thin strata recess bands
    const band = Math.sin((v.y * 5.2 + fbm3(v.x + s, v.z, 0, 2) * 0.6) * 14.0);
    const crack = Math.pow(Math.max(0, 1 - Math.abs(band) * 4.2), 2.5);
    v.x *= 1 - crack * 0.04;
    v.y *= 1 - crack * 0.055;
    v.z *= 1 - crack * 0.04;
    // flatten underside slightly so stone sits into banked sand
    if (v.y < -0.15) v.y *= 0.72;
    p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);

    const m = 0.62 + 0.62 * (fbm3(nrm.x * 3.2 + s, nrm.y * 3.2, nrm.z * 3.2, 3) * 0.5 + 0.5);
    const vein = Math.pow(Math.max(0, 1 - Math.abs(Math.sin((nrm.x * 2.6 + nrm.y * 1.4 + fbm3(nrm.x * 2 + s, nrm.y * 2, nrm.z * 2, 2) * 2.2) * 10.0)) * 3.5), 2.0);
    const pore = Math.pow(Math.max(0, fbm3(nrm.x * 26 + s, nrm.y * 26, nrm.z * 26, 2) - 0.36), 1.35);
    const algae = Math.max(0, 0.35 - nrm.y) * (0.35 + 0.65 * (fbm3(nrm.x * 3 - s, nrm.y * 3, nrm.z * 3, 3) * 0.5 + 0.5));
    const lichen = Math.pow(Math.max(0, fbm3(nrm.x * 7 - s, nrm.y * 6, nrm.z * 7, 3) - 0.32), 1.5) * Math.max(0, nrm.y + 0.15);
    const stain = Math.exp(-Math.pow((nrm.y - 0.05) * 3.5, 2.0)) * 0.16;
    let rr = tone[0] * m + vein * 0.16 - pore * 0.14 - crack * 0.08;
    let gg = tone[1] * m + vein * 0.12 - pore * 0.08 - crack * 0.05;
    let bb = tone[2] * m + vein * 0.09 - pore * 0.06 - crack * 0.04;
    rr = rr * (1 - algae * 0.45) + algae * 0.05 - stain * 0.06 + lichen * 0.03;
    gg = gg * (1 - algae * 0.15) + algae * 0.14 + stain * 0.03 + lichen * 0.10;
    bb = bb * (1 - algae * 0.55) + algae * 0.03 - stain * 0.02 + lichen * 0.04;
    col[i * 3] = rr; col[i * 3 + 1] = gg; col[i * 3 + 2] = bb;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  // flat-ish look: average normals per face slightly by not smoothing too much —
  // recompute with crease via angle threshold
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------------
// Plants: instanced organic leaves — midrib crease, cupped cross-section, serrated edges,
// tip float at surface, coherent filter-current sway.
// ------------------------------------------------------------------------------------------------
const BLADE_VERT_FN = /* glsl */ `
attribute vec3 iBase; attribute vec4 iP; attribute vec4 iQ; attribute vec3 iCol;
uniform float uTime;
uniform float uSurfY;
varying float vT; varying float vU; varying vec3 vCol; varying float vShape;
void bladeFrame(float t, float u, out vec3 P, out vec3 N) {
  float H = iP.x, W = iP.y, phase = iP.z, shape = iP.w;
  vec2 lean = iQ.xy; float yaw = iQ.z, stiff = iQ.w;
  float isLeaf = step(0.5, shape);
  float twist = (fract(phase * 7.31) - 0.5) * (2.8 + 1.4 * (1.0 - isLeaf));
  float L2 = dot(lean, lean);
  float k = t * t;
  // tip curl (broad leaves roll back) + tape tip float at surface
  float tipCurl = isLeaf * smoothstep(0.55, 1.0, t) * (0.018 + 0.012 * fract(phase * 3.7));
  float tipFloat = (1.0 - isLeaf) * smoothstep(0.78, 1.0, t) * 0.014;
  vec3 C = vec3(lean.x * 0.95 * k * H, H * (t - 0.28 * L2 * t * t * t) + tipFloat - tipCurl * 0.55, lean.y * 0.95 * k * H);
  vec3 Tn = normalize(vec3(lean.x * 1.9 * t * H, H * (1.0 - 0.75 * L2 * t * t) + tipFloat * 2.0 - tipCurl, lean.y * 1.9 * t * H));
  float T = uTime;
  vec3 wp = iBase;
  float current = sin(T * 0.48 + wp.x * 2.6 + wp.z * 1.8) * 0.72
                + sin(T * 0.27 + wp.x * 1.1 + wp.z * 0.7) * 0.48
                + sin(T * 0.19 + wp.z * 0.55) * 0.22;
  float g1 = sin(T * 0.85 + phase * 6.283 + wp.x * 4.0 + t * 1.6);
  float g2 = sin(T * 0.43 + phase * 11.0 + wp.z * 5.0 - t * 0.9);
  float g3 = sin(T * 2.3 + phase * 23.0 + t * 5.0);
  float amp = H * k * (0.16 * stiff);
  // coherent sheet: neighbours share current; individual flutter is quieter
  C.x += current * amp * 1.15 + (g1 * 0.35 + g2 * 0.22) * amp + g3 * 0.0035 * k * stiff;
  C.z += (g2 * 0.40 + sin(T * 0.7 + phase * 5.0) * 0.25 + current * 0.45) * amp * 0.70;
  C.y -= (abs(g1) + abs(g2)) * amp * 0.08 + abs(current) * amp * 0.04;
  vec3 S = vec3(cos(yaw + twist * t), 0.0, sin(yaw + twist * t));
  S = normalize(S - Tn * dot(S, Tn));
  // width: tape ribbons vs lanceolate leaves; strong serration / waviness on edges
  float wTape = W * (1.0 - smoothstep(0.68, 1.0, t) * 0.95);
  float serrT = sin(t * 28.0 + phase * 9.0) * 0.14 + sin(t * 61.0 + phase * 3.0) * 0.06 + sin(t * 97.0) * 0.03;
  float lance = sin(pow(t, 0.68) * 3.14159);
  float wLeaf = W * (0.06 + 0.94 * lance) * mix(0.22, 1.0, smoothstep(0.04, 0.30, t));
  float w = mix(wTape, wLeaf, isLeaf);
  w *= 1.0 + serrT * mix(0.45, 1.35, isLeaf);
  // asymmetric lobe (one side slightly wider) for organic look
  float asym = 1.0 + (u - 0.5) * (0.12 + 0.18 * fract(phase * 5.1)) * isLeaf;
  w *= asym;
  float uu = u - 0.5;
  float midFold = abs(uu) * 2.0;
  float crease = (1.0 - midFold) * (1.0 - midFold);
  float cup = uu * uu * 4.0;
  vec3 N0 = normalize(cross(Tn, S));
  // deeper V midrib + stronger cupping; tip curls toward underside — crease soft enough to avoid faceting
  float thick = (0.0004 + 0.0014 * crease) * mix(0.35, 1.1, isLeaf);
  float foldAmt = crease * w * mix(0.03, 0.09, isLeaf);
  float cupAmt = cup * w * mix(0.10, 0.38, isLeaf);
  float tipRoll = tipCurl * (0.35 + midFold) * isLeaf;
  vec3 pos = C + S * (uu * w) + N0 * (cupAmt - foldAmt + thick - tipRoll);
  pos += iBase;
  float surfCap = uSurfY - mix(0.0015, 0.004, isLeaf);
  pos.y = min(pos.y, surfCap);
  P = pos;
  // soft crease normals (fragment midrib does the dark line)
  N = normalize(N0 + S * uu * (0.55 + 0.9 * crease) * isLeaf - N0 * crease * 0.55 * isLeaf + Tn * tipCurl * 1.6);
  vT = t; vU = u; vCol = iCol; vShape = shape;
}
`;

function makePlants(rnd) {
  // denser cross-section for midrib crease + cupped lamina
  const rows = Q.name === 'high' ? 22 : 14;
  const cols = Q.name === 'high' ? 7 : 5;
  const pos = [], idx = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) pos.push(c / (cols - 1), r / rows, 0);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + 1, c2 = a + cols, d = c2 + 1;
    idx.push(a, b, c2, b, d, c2);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);

  const blades = [];
  const S = Q.plantScale;
  const add = (x, z, H, W, shape, lean, yaw, stiff, col, yOff = 0, yAbs = null) => {
    const y = yAbs !== null ? yAbs : sandHeight(x, z) - 0.003 + yOff;
    blades.push([x, y, z, H, W, rnd(), shape, Math.cos(lean.a) * lean.m, Math.sin(lean.a) * lean.m, yaw, stiff, col[0], col[1], col[2]]);
  };
  const jitter = (c, a = 0.14) => [c[0] * (1 + (rnd() - 0.5) * a * 2), c[1] * (1 + (rnd() - 0.5) * a * 2), c[2] * (1 + (rnd() - 0.5) * a * 2)];
  // hue along age: tip yellower / base deeper
  const ageTint = (base, tipY) => {
    const t = rnd();
    return [
      base[0] * (1 - tipY * 0.15) + 0.12 * tipY * t,
      base[1] * (1 - tipY * 0.05) + 0.04 * tipY,
      base[2] * (1 - tipY * 0.25),
    ];
  };

  // -- tape grass (vallisneria): dense ribbon masses, floating tips
  const tapeC = [0.045, 0.195, 0.042];
  const tapeClusters = [
    [-0.44, -0.15, 0.080, 85], [0.43, -0.14, 0.075, 78], [-0.10, -0.18, 0.070, 55],
    [0.17, -0.185, 0.065, 48], [-0.30, -0.185, 0.060, 42], [0.0, -0.19, 0.055, 30],
    [-0.22, -0.12, 0.048, 24], [0.32, -0.16, 0.045, 22],
  ];
  for (const [cx, cz, rr, n] of tapeClusters) {
    for (let i = 0; i < Math.round(n * S + 2); i++) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()) * rr;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * 0.65;
      const base = sandHeight(x, z);
      const reach = rnd() < 0.32;
      const H = Math.min(0.11 + Math.pow(rnd(), 1.25) * 0.32, TANK.surfaceY - base - (reach ? 0.0015 : 0.024));
      const tipAge = rnd() * 0.65;
      add(x, z, H, 0.007 + rnd() * 0.008, 0, { a: rnd() * 6.28, m: 0.28 + rnd() * 0.75 }, rnd() * 6.28, 0.55 + rnd() * 0.85, ageTint(jitter(tapeC, 0.32), tipAge));
    }
  }
  // -- amazon sword / broad leaves: denser odd-count rosettes, some show undersides
  const swordC = [0.040, 0.175, 0.036];
  const swords = [[0.04, -0.115, 1.05], [0.24, -0.14, 0.9], [-0.43, -0.09, 0.95], [-0.18, -0.13, 0.7]];
  for (const [cx, cz, sc] of swords) {
    const n = Math.round((14 * S) + 7) | 1; // odd
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + rnd() * 0.55;
      const H = (0.11 + rnd() * 0.16) * sc;
      const tip = rnd() < 0.3 ? 0.6 : rnd() * 0.35;
      const leanM = 0.45 + rnd() * 0.65 + (rnd() < 0.18 ? 0.35 : 0); // some heavy lean → underside
      add(cx + Math.cos(a) * 0.009, cz + Math.sin(a) * 0.009, H, (0.046 + rnd() * 0.032) * sc, 1, { a, m: leanM }, a + 1.57, 0.40 + rnd() * 0.40, ageTint(jitter(swordC, 0.22), tip));
    }
  }
  // -- rotala-like: visible stem nodes + tiered leaf whorls
  const redC = [0.24, 0.080, 0.050];
  const stemC = [0.12, 0.06, 0.03];
  const redBunches = [[0.385, -0.115, 0.028, 5], [0.465, -0.06, 0.020, 3], [-0.26, -0.14, 0.026, 4]];
  for (const [cx, cz, rr, stems] of redBunches) {
    for (let s = 0; s < Math.round(stems * S + 1); s++) {
      const sa = rnd() * 6.28, sd = Math.sqrt(rnd()) * rr;
      const sx = cx + Math.cos(sa) * sd, sz = cz + Math.sin(sa) * sd;
      const stemH = 0.12 + rnd() * 0.16;
      // thin stem ribbon (node structure via slight width pulses in shader via phase)
      add(sx, sz, stemH, 0.0016 + rnd() * 0.0006, 0,
        { a: rnd() * 6.28, m: 0.08 + rnd() * 0.18 }, rnd() * 6.28, 0.35 + rnd() * 0.2, jitter(stemC, 0.15));
      const whorls = 5 + Math.floor(rnd() * 5);
      for (let w = 0; w < whorls; w++) {
        const wt = (w + 0.5) / whorls;
        const nLeaf = 3 + (rnd() < 0.4 ? 1 : 0);
        for (let L = 0; L < nLeaf; L++) {
          const a = (L / nLeaf) * 6.28 + w * 0.4 + rnd() * 0.2;
          const leafH = stemH * (0.08 + 0.10 * (1 - wt) + rnd() * 0.04);
          add(sx + Math.cos(a) * 0.003, sz + Math.sin(a) * 0.003, leafH, 0.005 + rnd() * 0.004, 0,
            { a, m: 0.35 + rnd() * 0.5 }, a + 1.2, 1.1 + rnd() * 0.6,
            ageTint(jitter([redC[0] * (1 - wt * 0.3) + 0.02 * wt, redC[1] * (1 - wt) + 0.12 * wt, redC[2]], 0.2), wt * 0.4),
            stemH * wt * 0.85);
        }
      }
    }
  }
  // -- foreground carpet clumps (dense irregular masses)
  const carpetC = [0.08, 0.26, 0.050];
  const nCarpet = Math.round(5200 * S);
  for (let i = 0; i < nCarpet; i++) {
    const x = -0.48 + rnd() * 0.96;
    const z = -0.02 + rnd() * 0.22;
    const dens = fbm2(x * 5 + 3, z * 7, 3) + 0.42
               - 0.85 * Math.max(0, (z - 0.12)) * 3.0
               + 0.65 * Math.exp(-(((x + 0.12) / 0.12) ** 2 + ((z - 0.06) / 0.08) ** 2))
               + 0.55 * Math.exp(-(((x - 0.28) / 0.10) ** 2 + ((z - 0.04) / 0.07) ** 2))
               + 0.35 * Math.exp(-(((x + 0.35) / 0.09) ** 2 + ((z - 0.02) / 0.06) ** 2));
    if (rnd() > dens * 0.92) continue;
    const clump = dens > 0.65;
    const tipY = rnd() * 0.45;
    add(x, z,
      clump ? 0.018 + rnd() * rnd() * 0.055 : 0.010 + rnd() * rnd() * 0.032,
      clump ? 0.0020 + rnd() * 0.0016 : 0.0014 + rnd() * 0.0011,
      0, { a: rnd() * 6.28, m: 0.14 + rnd() * (clump ? 0.45 : 0.70) }, rnd() * 6.28, 0.85 + rnd() * 0.9, ageTint(jitter(carpetC, 0.45), tipY));
  }
  return { geo, blades, add, jitter };
}

function bladeMaterials() {
  const vertex = (vs) =>
    vs
      .replace('#include <common>', '#include <common>\n' + BLADE_VERT_FN)
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 bP, bN; bladeFrame(position.y, position.x, bP, bN);
         vec3 objectNormal = bN;
         #ifdef USE_TANGENT
           vec3 objectTangent = vec3( tangent.xyz );
         #endif`
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = bP;');
  const mat = patchWater(
    new THREE.MeshPhysicalMaterial({
      roughness: 0.36, metalness: 0.0, side: THREE.DoubleSide,
      clearcoat: 0.18, clearcoatRoughness: 0.62,
    }),
    {
      key: 'blade7', soft: 0.95,
      vertex,
      extraFrag: 'varying float vT; varying float vU; varying vec3 vCol; varying float vShape;',
      onShader(shader) {
        shader.uniforms.uSurfY = { value: TANK.surfaceY };
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           float mid = abs(vU - 0.5);
           float midrib = mix(0.42, 1.0, smoothstep(0.0, 0.085, mid));
           float vLat = abs(sin(vT * 36.0 + (vU - 0.5) * 9.0));
           float vein = mix(0.72, 1.0, smoothstep(0.0, 0.18, vLat));
           float vein2 = mix(0.88, 1.0, smoothstep(0.0, 0.25, abs(sin(vT * 72.0 + mid * 14.0))));
           float edge = smoothstep(0.0, 0.04, vU) * smoothstep(1.0, 0.96, vU);
           vec3 tipCol = mix(vCol, vec3(0.34, 0.48, 0.10), 0.72);
           vec3 baseCol = mix(vCol, vec3(0.008, 0.038, 0.010), 0.55);
           vec3 underCol = mix(vCol, vec3(0.18, 0.28, 0.08), 0.45);
           vec3 leaf = mix(baseCol, tipCol, smoothstep(0.08, 0.92, vT));
           // show underside when strongly cupped (u away from midrib + tip)
           float under = step(0.5, vShape) * smoothstep(0.28, 0.48, mid) * smoothstep(0.55, 0.95, vT);
           leaf = mix(leaf, underCol, under * 0.55);
           float age = smoothstep(0.68, 1.0, vT) * (0.35 + 0.65 * fract(sin(vCol.g * 41.0) * 19.0));
           leaf = mix(leaf, vec3(0.34, 0.22, 0.06), age * 0.7);
           float fleck = step(0.96, fract(sin(dot(vec2(vT, vU) * 36.0 + vCol.r, vec2(12.9, 78.2))) * 43758.5));
           leaf = mix(leaf, vec3(0.04, 0.09, 0.025), fleck * 0.7);
           float mott = 0.9 + 0.1 * sin(vT * 17.0 + vU * 29.0 + vCol.b * 40.0);
           float hole = step(0.5, vShape) * step(0.988, fract(sin(dot(vec2(vT * 8.2, vU * 10.2), vec2(91.7, 53.1))) * 23421.0));
           if (hole > 0.5) discard;
           float bite = step(0.5, vShape) * step(0.992, fract(sin(dot(vec2(vT * 22.0, floor(vU * 2.0)), vec2(41.2, 17.9))) * 9123.0));
           if (bite > 0.5 && mid > 0.38) discard;
           diffuseColor.rgb *= leaf * midrib * vein * vein2 * mott * (0.68 + 0.32 * edge) * mix(0.85, 1.55, vT);`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           { float dpt = max(uBoxMax.y - vWPos.y, 0.0);
             float thin = 0.35 + 1.55 * smoothstep(0.0, 0.42, abs(vU - 0.5));
             vec3 tl = diffuseColor.rgb * vec3(1.55, 1.4, 0.35) * causticAt(vWPos) * exp(-dpt * 0.85);
             totalEmissiveRadiance += tl * thin * (0.55 + 1.2 * smoothstep(0.03, 1.0, vT)) * 1.55;
             float sheen = pow(max(0.0, causticAt(vWPos, 1.7).g), 2.0);
             totalEmissiveRadiance += vec3(0.9, 1.0, 0.7) * sheen * 0.18 * thin; }`
        );
      },
    }
  );
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depthMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = WU.uTime;
    shader.uniforms.uSurfY = { value: TANK.surfaceY };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + BLADE_VERT_FN)
      .replace('#include <begin_vertex>', 'vec3 bP, bN; bladeFrame(position.y, position.x, bP, bN); vec3 transformed = bP;');
  };
  depthMat.customProgramCacheKey = () => 'bladeDepth7';
  return { mat, depthMat };
}

export function createScenery(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const rnd = mulberry32(2024);

  // ---- sand
  const { albedo, normal } = makeSand(Q.name === 'high' ? 2048 : 768);
  albedo.repeat.set(10, 4.5); normal.repeat.set(10, 4.5);
  const w = TANK.iw * 2 - 0.002, d = TANK.id * 2 - 0.002;
  const sgeo = new THREE.PlaneGeometry(w, d, Q.sandSeg[0], Q.sandSeg[1]);
  sgeo.rotateX(-Math.PI / 2);
  const sp = sgeo.attributes.position;
  const scol = new Float32Array(sp.count * 3);
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), z = sp.getZ(i);
    sp.setY(i, sandHeight(x, z));
    const t = 0.78 + 0.38 * (fbm2(x * 5.5 + 9, z * 7.0, 3) * 0.5 + 0.5) + 0.14 * noise2(x * 28, z * 28);
    const warm = 0.05 * noise2(x * 3 + 7, z * 3);
    // tiny grit / detritus dark flecks
    const grit = Math.pow(Math.max(0, noise2(x * 55 + 2, z * 55) - 0.55), 2.0);
    scol[i * 3] = t * (1 + warm) * (1 - grit * 0.45);
    scol[i * 3 + 1] = t * (1 - grit * 0.35);
    scol[i * 3 + 2] = t * (1 - warm) * (1 - grit * 0.25);
  }
  sgeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  sgeo.computeVertexNormals();
  const sandMat = patchWater(
    new THREE.MeshStandardMaterial({
      map: albedo, normalMap: normal, normalScale: new THREE.Vector2(2.1, 2.1),
      roughness: 0.86, metalness: 0, vertexColors: true,
    }),
    {
      key: 'sand3',
      onShader(shader) {
        // bake rock contact list into a small uniform array for AO
        const nR = Math.min(ROCKS.length, 12);
        shader.uniforms.uRockN = { value: nR };
        shader.uniforms.uRocks = { value: ROCKS.slice(0, nR).map((r) => new THREE.Vector4(r[0], r[1], r[2] * 1.15, r[4] * 1.15)) };
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform float uRockN; uniform vec4 uRocks[12];`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           { float g = fract(sin(dot(vWPos.xz * 420.0, vec2(12.9898,78.233))) * 43758.5453);
             float glint = step(0.992, g) * pow(max(0.0, causticAt(vWPos).g), 1.4);
             totalEmissiveRadiance += vec3(0.95, 0.92, 0.82) * glint * 0.55; }`
        );
        // contact AO under rocks + glass-edge fines
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
           { float ao = 1.0;
             for (int i = 0; i < 12; i++) {
               if (float(i) >= uRockN) break;
               vec4 rk = uRocks[i];
               vec2 d = (vWPos.xz - rk.xy) / max(rk.zw, vec2(0.001));
               float rn = length(d);
               ao *= 1.0 - 0.28 * smoothstep(1.5, 0.7, rn);
             }
             float edge = min(0.49 - abs(vWPos.x), 0.20 - abs(vWPos.z));
             ao *= 0.88 + 0.12 * smoothstep(0.0, 0.04, edge);
             reflectedLight.directDiffuse *= ao;
             reflectedLight.indirectDiffuse *= mix(0.7, 1.0, ao); }`
        );
      },
    }
  );
  const sand = new THREE.Mesh(sgeo, sandMat);
  sand.receiveShadow = true;
  group.add(sand);

  // ---- rocks
  const rockMat = patchWater(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.04, flatShading: false }),
    {
      key: 'rock5', soft: 1.35,
      onShader(shader) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
           // pore darkening = rougher; vein = slightly smoother wet look
           float pore = 1.0 - diffuseColor.r;
           roughnessFactor = clamp(roughnessFactor * (0.85 + pore * 0.45), 0.25, 1.0);`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           { float wet = pow(max(0.0, causticAt(vWPos, 1.0).g), 1.6);
             totalEmissiveRadiance += diffuseColor.rgb * wet * 0.22; }`
        );
      },
    }
  );
  const seg = [Q.rockSub * 16, Q.rockSub * 12];
  const rockDefs = ROCKS;
  const rocks = [];
  rockDefs.forEach((r, i) => {
    const g = makeRock(i + 1, r[2], r[3], r[4], seg, r[5]);
    const m = new THREE.Mesh(g, rockMat);
    const y = sandBase(r[0], r[1]) + r[3] * 0.34;
    m.position.set(r[0], y, r[1]);
    m.rotation.set(r[7], r[6], r[7] * 0.6);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    rocks.push({ x: r[0], z: r[1], y, top: y + r[3] * 0.92, sx: r[2], sy: r[3], sz: r[4] });
  });

  // ---- plants
  const P = makePlants(rnd);
  // java fern / anubias: rhizome-hugging clumps on stones (horizontal creep + broad fronds)
  const fernC = [0.028, 0.105, 0.028];
  const anubiasC = [0.035, 0.145, 0.040];
  const fernOn = [[rocks[0], 22, 1.0, true], [rocks[2], 16, 0.9, false], [rocks[1], 14, 0.85, true]];
  for (const [rk, n, sc, isAnub] of fernOn) {
    // rhizome path along rock flank
    const rhizA0 = rnd() * 6.28;
    const rhizLen = 0.55 + rnd() * 0.35;
    const nLeaf = Math.round(n * Q.plantScale + 3);
    for (let i = 0; i < nLeaf; i++) {
      const t = i / Math.max(1, nLeaf - 1);
      const a = rhizA0 + t * rhizLen + (rnd() - 0.5) * 0.35;
      const side = rnd() < 0.72;
      const rr = side ? 0.72 + rnd() * 0.18 : 0.18 + rnd() * 0.2;
      const rx = rk.x + Math.cos(a) * rk.sx * rr;
      const rz = rk.z + Math.sin(a) * rk.sz * rr;
      const yy = side ? rk.y + rk.sy * (0.08 + t * 0.42 + rnd() * 0.12) : rk.top - 0.01 - rnd() * 0.008;
      const col = isAnub ? anubiasC : fernC;
      // anubias: broader shorter; fern: longer lanceolate
      const H = isAnub ? (0.038 + rnd() * 0.042) * sc : (0.055 + rnd() * 0.065) * sc;
      const W = isAnub ? (0.032 + rnd() * 0.022) * sc : (0.018 + rnd() * 0.014) * sc;
      P.add(rx, rz, H, W, 1, { a: a + (rnd() - 0.5) * 0.8, m: 0.55 + rnd() * 0.55 }, a + 1.57 + (rnd() - 0.5) * 0.4, 0.42 + rnd() * 0.25, P.jitter(col, 0.22), 0, yy);
    }
  }
  const nB = P.blades.length;
  const attr = (n, size) => new Float32Array(nB * size);
  const aBase = attr(nB, 3), aP = attr(nB, 4), aQ = attr(nB, 4), aC = attr(nB, 3);
  P.blades.forEach((b, i) => {
    aBase.set([b[0], b[1], b[2]], i * 3);
    aP.set([b[3], b[4], b[5], b[6]], i * 4);
    aQ.set([b[7], b[8], b[9], b[10]], i * 4);
    aC.set([b[11], b[12], b[13]], i * 3);
  });
  P.geo.setAttribute('iBase', new THREE.InstancedBufferAttribute(aBase, 3));
  P.geo.setAttribute('iP', new THREE.InstancedBufferAttribute(aP, 4));
  P.geo.setAttribute('iQ', new THREE.InstancedBufferAttribute(aQ, 4));
  P.geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(aC, 3));
  P.geo.instanceCount = nB;
  const { mat, depthMat } = bladeMaterials();
  const plants = new THREE.Mesh(P.geo, mat);
  plants.frustumCulled = false;
  // soft aquarium look: plants do not cast hard map shadows (scatter + AO carry contact)
  plants.castShadow = false;
  plants.receiveShadow = true;
  plants.customDepthMaterial = depthMat;
  group.add(plants);

  // leaf litter / detritus on sand (sparse organic debris)
  {
    const litterN = Q.name === 'high' ? 110 : 28;
    const litterGeo = new THREE.PlaneGeometry(1, 1);
    const litterMat = patchWater(
      new THREE.MeshStandardMaterial({
        color: 0x5a4020, roughness: 0.85, metalness: 0, side: THREE.DoubleSide,
        transparent: true, opacity: 0.85,
      }),
      { key: 'litter', soft: 1.2 }
    );
    const litter = new THREE.InstancedMesh(litterGeo, litterMat, litterN);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < litterN; i++) {
      const x = (rnd() - 0.5) * 0.9;
      const z = (rnd() - 0.5) * 0.36;
      const y = sandHeight(x, z) + 0.0015;
      dummy.position.set(x, y, z);
      dummy.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.5);
      const s = 0.004 + rnd() * 0.012;
      dummy.scale.set(s * (0.6 + rnd()), s * 0.35, s);
      dummy.updateMatrix();
      litter.setMatrixAt(i, dummy.matrix);
      col.setRGB(0.25 + rnd() * 0.25, 0.14 + rnd() * 0.12, 0.05 + rnd() * 0.06);
      litter.setColorAt(i, col);
    }
    litter.instanceMatrix.needsUpdate = true;
    if (litter.instanceColor) litter.instanceColor.needsUpdate = true;
    litter.castShadow = false;
    litter.receiveShadow = true;
    group.add(litter);
  }

  return { group, sand, rocks, plants, bladeCount: nB, update() {} };
}
