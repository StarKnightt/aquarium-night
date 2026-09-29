import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TANK, WU, patchWater } from '../core/waterPatch.js';
import { fbm2, fbm3, noise2, mulberry32 } from '../core/noise.js';
import { makeSand } from '../core/textures.js';
import { Q } from '../core/quality.js';

// x, z, sx, sy, sz, tone(rgb), yaw, tilt   — one dominant stone, uneven mass, scattered pebbles
const ROCKS = [
  [-0.17, -0.04, 0.185, 0.118, 0.128, [0.29, 0.25, 0.20], 0.5, 0.10],   // dominant, warm grey-brown
  [-0.345, -0.085, 0.100, 0.068, 0.084, [0.33, 0.27, 0.20], 2.1, -0.15], // warm tan
  [-0.075, 0.045, 0.058, 0.038, 0.048, [0.23, 0.235, 0.19], 1.0, 0.1],   // olive
  [0.31, -0.06, 0.088, 0.060, 0.075, [0.19, 0.19, 0.18], 4.0, 0.05],    // grey
  [0.415, 0.02, 0.048, 0.034, 0.042, [0.31, 0.25, 0.19], 0.3, 0.2],
  [0.21, 0.10, 0.040, 0.026, 0.034, [0.26, 0.24, 0.21], 2.5, 0],
  [-0.43, 0.11, 0.036, 0.024, 0.030, [0.20, 0.21, 0.18], 1.4, 0],
  [0.06, 0.155, 0.022, 0.015, 0.019, [0.32, 0.28, 0.22], 0.7, 0],
  [0.37, 0.12, 0.030, 0.019, 0.026, [0.22, 0.21, 0.19], 5.2, 0],
  [-0.01, 0.10, 0.020, 0.013, 0.017, [0.28, 0.26, 0.21], 3.3, 0],
  [-0.26, 0.09, 0.017, 0.011, 0.014, [0.3, 0.27, 0.2], 2.0, 0],
  [0.13, 0.17, 0.014, 0.009, 0.012, [0.24, 0.23, 0.2], 4.4, 0],
  [0.47, 0.11, 0.018, 0.012, 0.015, [0.27, 0.26, 0.22], 1.1, 0],
  [-0.30, 0.17, 0.013, 0.009, 0.011, [0.22, 0.21, 0.2], 3.9, 0],
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
      h += r[3] * 0.62 * t * t * (3 - 2 * t) * (0.85 + 0.3 * noise2(x * 40 + i, z * 40));
    }
  }
  return h;
}

// ------------------------------------------------------------------------------------------------
// Rocks: smooth river stones (noise-displaced spheres, vertex-coloured with veining and dusty tops)
// ------------------------------------------------------------------------------------------------
function makeRock(seed, sx, sy, sz, seg, tone) {
  let g = new THREE.SphereGeometry(1, seg[0], seg[1]);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  const s = seed * 7.31;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = fbm3(v.x * 1.25 + s, v.y * 1.25 + s * 0.5, v.z * 1.25 - s, 4) * 0.34
            + fbm3(v.x * 4.0 + s, v.y * 4.0, v.z * 4.0 - s, 3) * 0.055
            + fbm3(v.x * 14 + s, v.y * 14, v.z * 14, 2) * 0.012;
    let r = 1 + n;
    let yy = v.y;
    if (yy < 0) yy *= 0.8;                      // slightly flatter underside
    p.setXYZ(i, v.x * r * sx, yy * r * sy, v.z * r * sz);
    // colour: mottled stone with pale veins, lichen-dusty tops
    const m = 0.78 + 0.5 * (fbm3(v.x * 3.2 + s, v.y * 3.2, v.z * 3.2, 3) * 0.5 + 0.5);
    const vein = Math.pow(Math.max(0, 1 - Math.abs(Math.sin((v.x * 2.1 + v.y * 1.3 + fbm3(v.x * 2 + s, v.y * 2, v.z * 2, 2) * 2.2) * 8.0)) * 3.2), 2.0);
    const top = Math.max(0, v.y) * 0.5;
    // thin olive-brown biofilm on upper faces, patchy
    const film = Math.max(0, fbm3(v.x * 2.4 - s, v.y * 2.4, v.z * 2.4 + s, 3) + 0.05) * (0.35 + 0.65 * Math.max(0, v.y + 0.25));
    const rr = tone[0] * m + vein * 0.10, gg = tone[1] * m + vein * 0.10, bb = tone[2] * m + vein * 0.09;
    col[i * 3] = rr * (1 - film * 0.45) + film * 0.05;
    col[i * 3 + 1] = gg * (1 - film * 0.18) + film * 0.09;
    col[i * 3 + 2] = bb * (1 - film * 0.60) + film * 0.018;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------------
// Plants: one instanced draw call. Every blade is a ribbon evaluated in the vertex shader:
// lean/curl, lance or tape width, cupping, twist, and gentle multi-frequency sway.
// ------------------------------------------------------------------------------------------------
const BLADE_VERT_FN = /* glsl */ `
attribute vec3 iBase; attribute vec4 iP; attribute vec4 iQ; attribute vec3 iCol;
uniform float uTime;
uniform float uSurfY;
varying float vT; varying float vU; varying vec3 vCol;
void bladeFrame(float t, float u, out vec3 P, out vec3 N) {
  float H = iP.x, W = iP.y, phase = iP.z, shape = iP.w;
  vec2 lean = iQ.xy; float yaw = iQ.z, stiff = iQ.w;
  float twist = (fract(phase * 7.31) - 0.5) * 2.2;
  float L2 = dot(lean, lean);
  float k = t * t;
  vec3 C = vec3(lean.x * 0.95 * k * H, H * (t - 0.25 * L2 * t * t * t), lean.y * 0.95 * k * H);
  vec3 Tn = normalize(vec3(lean.x * 1.9 * t * H, H * (1.0 - 0.75 * L2 * t * t), lean.y * 1.9 * t * H));
  // sway: slow drift + secondary wobble + light flutter near the tip, phase-shifted along the blade
  float T = uTime;
  vec3 wp = iBase;
  float g1 = sin(T * 0.85 + phase * 6.283 + wp.x * 4.0 + t * 1.6);
  float g2 = sin(T * 0.43 + phase * 11.0 + wp.z * 5.0 - t * 0.9);
  float g3 = sin(T * 2.3 + phase * 23.0 + t * 5.0);
  float amp = H * k * (0.16 * stiff);
  C.x += (g1 * 0.65 + g2 * 0.35 + 0.30) * amp + g3 * 0.0045 * k * stiff;
  C.z += (g2 * 0.6 + sin(T * 0.7 + phase * 5.0) * 0.4) * amp * 0.55;
  C.y -= (abs(g1) + abs(g2)) * amp * 0.10;
  vec3 S = vec3(cos(yaw + twist * t), 0.0, sin(yaw + twist * t));
  S = normalize(S - Tn * dot(S, Tn));
  float wTape = W * (1.0 - smoothstep(0.72, 1.0, t) * 0.92);
  float lance = sin(pow(t, 0.72) * 3.14159);
  float wLeaf = W * (0.10 + 0.90 * lance) * mix(0.32, 1.0, smoothstep(0.06, 0.34, t));
  float w = mix(wTape, wLeaf, step(0.5, shape));
  float uu = u - 0.5;
  float cup = uu * uu * 4.0;
  vec3 N0 = normalize(cross(Tn, S));
  vec3 pos = C + S * (uu * w) + N0 * (cup * w * 0.22 * step(0.5, shape));
  pos += iBase;
  pos.y = min(pos.y, uSurfY - 0.004);
  P = pos;
  N = normalize(N0 + S * (uu * cup * 0.9) * step(0.5, shape));
  vT = t; vU = u; vCol = iCol;
}
`;

function makePlants(rnd) {
  // ---- blade templates: 3 columns x rows in [u,t]
  const rows = 16, cols = 3;
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

  // -- tape grass (vallisneria), background clusters
  const tapeC = [0.050, 0.200, 0.045];
  const tapeClusters = [[-0.44, -0.15, 0.07, 46], [0.43, -0.14, 0.065, 42], [-0.10, -0.18, 0.06, 26], [0.17, -0.185, 0.06, 22], [-0.30, -0.185, 0.05, 20], [0.0, -0.19, 0.05, 12]];
  for (const [cx, cz, rr, n] of tapeClusters) {
    for (let i = 0; i < Math.round(n * S + 2); i++) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()) * rr;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * 0.6;
      const base = sandHeight(x, z);
      const H = Math.min(0.09 + Math.pow(rnd(), 1.4) * 0.31, TANK.surfaceY - base - 0.03 + (rnd() < 0.15 ? 0.05 : 0));
      add(x, z, H, 0.0075 + rnd() * 0.007, 0, { a: rnd() * 6.28, m: 0.18 + rnd() * 0.62 }, rnd() * 6.28, 0.7 + rnd() * 0.6, jitter(tapeC, 0.25));
    }
  }
  // -- amazon sword rosettes
  const swordC = [0.045, 0.165, 0.038];
  const swords = [[0.04, -0.115, 1.0], [0.24, -0.14, 0.8], [-0.43, -0.09, 0.85]];
  for (const [cx, cz, sc] of swords) {
    const n = Math.round((11 * S) + 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + rnd() * 0.5;
      const H = (0.13 + rnd() * 0.12) * sc;
      add(cx + Math.cos(a) * 0.006, cz + Math.sin(a) * 0.006, H, (0.046 + rnd() * 0.022) * sc, 1, { a, m: 0.45 + rnd() * 0.5 }, a + 1.57, 0.5 + rnd() * 0.3, jitter(swordC, 0.18));
    }
  }
  // -- red stem plant bunches (rotala-like), thin blades in tight whorls
  const redC = [0.22, 0.085, 0.055];
  const redBunches = [[0.385, -0.115, 0.032, 60], [0.465, -0.06, 0.022, 26], [-0.26, -0.14, 0.03, 34]];
  for (const [cx, cz, rr, n] of redBunches) {
    for (let i = 0; i < Math.round(n * S + 3); i++) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()) * rr;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const H = 0.10 + rnd() * 0.17;
      const mixG = Math.pow(rnd(), 1.8);
      const cc2 = [redC[0] * (1 - mixG * 0.6) + 0.02 * mixG, redC[1] * (1 - mixG) + 0.11 * mixG, redC[2] + 0.01 * mixG];
      add(x, z, H, 0.0042 + rnd() * 0.0035, 0, { a: rnd() * 6.28, m: 0.22 + rnd() * 0.45 }, rnd() * 6.28, 1.0 + rnd() * 0.8, jitter(cc2, 0.22));
    }
  }
  // -- foreground carpet (dwarf hairgrass)
  const carpetC = [0.09, 0.25, 0.055];
  const nCarpet = Math.round(3600 * S);
  for (let i = 0; i < nCarpet; i++) {
    const x = -0.48 + rnd() * 0.96;
    const z = -0.02 + rnd() * 0.22;
    const dens = fbm2(x * 6 + 3, z * 8, 2) + 0.55 - 0.9 * Math.max(0, (z - 0.12)) * 3.0 - Math.max(0, 0.2 - Math.abs(x - 0.10)) * 0.0;
    if (rnd() > dens) continue;
    add(x, z, 0.014 + rnd() * rnd() * 0.05, 0.0016 + rnd() * 0.0012, 0, { a: rnd() * 6.28, m: 0.2 + rnd() * 0.6 }, rnd() * 6.28, 0.9 + rnd() * 0.8, jitter(carpetC, 0.3));
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
    new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.0, side: THREE.DoubleSide }),
    {
      key: 'blade', soft: 0.8,
      vertex,
      extraFrag: 'varying float vT; varying float vU; varying vec3 vCol;',
      onShader(shader) {
        shader.uniforms.uSurfY = { value: TANK.surfaceY };
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           float veinB = 1.0 - 0.28 * smoothstep(0.10, 0.0, abs(vU - 0.5));
           diffuseColor.rgb *= vCol * mix(0.85, 1.5, smoothstep(0.0, 1.0, vT)) * veinB;`
        );
        // light shining through the leaf blade (translucency): tinted yellow-green, follows the caustic pattern
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           { float dpt = max(uBoxMax.y - vWPos.y, 0.0);
             vec3 tl = diffuseColor.rgb * vec3(1.15, 1.1, 0.55) * causticAt(vWPos) * exp(-dpt * 1.3);
             totalEmissiveRadiance += tl * (0.55 + 0.6 * smoothstep(0.1, 1.0, vT)) * 0.45; }`
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
  depthMat.customProgramCacheKey = () => 'bladeDepth';
  return { mat, depthMat };
}

export function createScenery(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const rnd = mulberry32(2024);

  // ---- sand
  const { albedo, normal } = makeSand(1024);
  albedo.repeat.set(7, 3); normal.repeat.set(7, 3);
  const w = TANK.iw * 2 - 0.002, d = TANK.id * 2 - 0.002;
  const sgeo = new THREE.PlaneGeometry(w, d, Q.sandSeg[0], Q.sandSeg[1]);
  sgeo.rotateX(-Math.PI / 2);
  const sp = sgeo.attributes.position;
  const scol = new Float32Array(sp.count * 3);
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), z = sp.getZ(i);
    sp.setY(i, sandHeight(x, z));
    const t = 0.80 + 0.32 * (fbm2(x * 5.5 + 9, z * 7.0, 3) * 0.5 + 0.5) + 0.10 * noise2(x * 22, z * 22);
    const warm = 0.03 * noise2(x * 3 + 7, z * 3);
    scol[i * 3] = t * (1 + warm); scol[i * 3 + 1] = t; scol[i * 3 + 2] = t * (1 - warm);
  }
  sgeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  sgeo.computeVertexNormals();
  const sandMat = patchWater(
    new THREE.MeshStandardMaterial({ map: albedo, normalMap: normal, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.93, metalness: 0, vertexColors: true }),
    { key: 'sand' }
  );
  const sand = new THREE.Mesh(sgeo, sandMat);
  sand.receiveShadow = true;
  group.add(sand);

  // ---- rocks
  const rockMat = patchWater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.0 }), { key: 'rock', soft: 1.7 });
  const seg = [Q.rockSub * 14, Q.rockSub * 10];
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
  // java fern / anubias leaves on the two big stones
  const fernC = [0.030, 0.115, 0.032];
  const fernOn = [[rocks[0], 14, 0.95], [rocks[3], 10, 0.85], [rocks[1], 8, 0.75]];
  for (const [rk, n, sc] of fernOn) {
    for (let i = 0; i < Math.round(n * Q.plantScale + 2); i++) {
      const a = rnd() * 6.28;
      const side = rnd() < 0.6;   // crevice on the flank vs crown
      const rr = side ? 0.78 : 0.25;
      const rx = rk.x + Math.cos(a) * rk.sx * rr, rz = rk.z + Math.sin(a) * rk.sz * rr;
      const yy = side ? rk.y + rk.sy * (0.10 + rnd() * 0.5) : rk.top - 0.012;
      P.add(rx, rz, (0.050 + rnd() * 0.055) * sc, (0.024 + rnd() * 0.014) * sc, 1, { a, m: 0.7 + rnd() * 0.5 }, a + 1.57, 0.5, P.jitter(fernC, 0.2), 0, yy);
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
  plants.castShadow = true; plants.receiveShadow = true;
  plants.customDepthMaterial = depthMat;
  group.add(plants);

  return { group, sand, rocks, plants, bladeCount: nB, update() {} };
}
