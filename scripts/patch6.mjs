import fs from 'node:fs';
let s, p;
const rep = (from, to) => { if (!s.includes(from)) throw new Error('missing: ' + from.slice(0, 70)); s = s.replace(from, to); };
const load = (f) => { p = f; s = fs.readFileSync(f, 'utf8'); };
const save = () => fs.writeFileSync(p, s);

load('src/systems/scenery.js');

// --- module-level rock defs + sand with piles
rep(`/** Height of the sand bed at tank-local (x,z). Slopes up toward the back, rolling dunes, fine ripples. */
export function sandHeight(x, z) {
  const zz = (z + TANK.id) / (2 * TANK.id);          // 0 back -> 1 front
  const slope = 0.030 * Math.pow(1 - zz, 1.6);
  const dunes = fbm2(x * 3.1 + 4.0, z * 4.6 - 2.0, 3) * 0.020;`, `// x, z, sx, sy, sz, tone(rgb), yaw, tilt   — one dominant stone, uneven mass, scattered pebbles
const ROCKS = [
  [-0.17, -0.04, 0.185, 0.118, 0.128, [0.20, 0.19, 0.17], 0.5, 0.10],   // dominant
  [-0.345, -0.085, 0.100, 0.068, 0.084, [0.33, 0.27, 0.20], 2.1, -0.15], // warm tan
  [-0.075, 0.045, 0.058, 0.038, 0.048, [0.23, 0.235, 0.19], 1.0, 0.1],   // olive
  [0.31, -0.06, 0.088, 0.060, 0.075, [0.15, 0.145, 0.15], 4.0, 0.05],    // charcoal
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
  const dunes = fbm2(x * 3.1 + 4.0, z * 4.6 - 2.0, 3) * 0.030;`);
rep(`  return TANK.waterMinY + 0.006 + slope + dunes + mound + ripple;
}`, `  return TANK.waterMinY + 0.006 + slope + dunes + mound + ripple;
}

/** Bed height including little piles of sand banked up against every stone. */
export function sandHeight(x, z) {
  let h = sandBase(x, z);
  for (let i = 0; i < ROCKS.length; i++) {
    const r = ROCKS[i];
    const dx = (x - r[0]) / r[2], dz = (z - r[1]) / r[4];
    const rn = Math.sqrt(dx * dx + dz * dz);
    if (rn < 1.9) {
      const t = Math.min(1, Math.max(0, (1.9 - rn) / 1.05));
      h += r[3] * 0.42 * t * t * (3 - 2 * t) * (0.85 + 0.3 * noise2(x * 40 + i, z * 40));
    }
  }
  return h;
}`);

// --- rock colour: biofilm + wet sheen
rep(`    col[i * 3] = (tone[0] * m + vein * 0.13) * (1 - top * 0.25);
    col[i * 3 + 1] = (tone[1] * m + vein * 0.13) * (1 + top * 0.12);
    col[i * 3 + 2] = (tone[2] * m + vein * 0.12) * (1 - top * 0.35);`, `    // thin olive-brown biofilm on upper faces, patchy
    const film = Math.max(0, fbm3(v.x * 2.4 - s, v.y * 2.4, v.z * 2.4 + s, 3) + 0.05) * (0.35 + 0.65 * Math.max(0, v.y + 0.25));
    const rr = tone[0] * m + vein * 0.10, gg = tone[1] * m + vein * 0.10, bb = tone[2] * m + vein * 0.09;
    col[i * 3] = rr * (1 - film * 0.35) + film * 0.035;
    col[i * 3 + 1] = gg * (1 - film * 0.10) + film * 0.075;
    col[i * 3 + 2] = bb * (1 - film * 0.50) + film * 0.012;`);
rep(`new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.0 }), { key: 'rock' }`, `new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.40, metalness: 0.0 }), { key: 'rock', soft: 0.9 }`);

// --- rocks: use ROCKS, buried deeper
const a = s.indexOf('  const rockDefs = [');
const b = s.indexOf('  const rocks = [];');
s = s.slice(0, a) + '  const rockDefs = ROCKS;\n' + s.slice(b);
rep(`const y = sandHeight(r[0], r[1]) + r[3] * 0.50;`, `const y = sandBase(r[0], r[1]) + r[3] * 0.34;`);
rep(`rocks.push({ x: r[0], z: r[1], top: y + r[3] * 0.92, sx: r[2] });`, `rocks.push({ x: r[0], z: r[1], y, top: y + r[3] * 0.92, sx: r[2], sy: r[3], sz: r[4] });`);

// --- plants: denser and fuller
rep(`const tapeC = [0.030, 0.150, 0.035];
  const tapeClusters = [[-0.44, -0.15, 0.06, 26], [0.43, -0.14, 0.055, 24], [-0.10, -0.18, 0.05, 14], [0.17, -0.185, 0.05, 12], [-0.30, -0.185, 0.04, 10]];`, `const tapeC = [0.050, 0.200, 0.045];
  const tapeClusters = [[-0.44, -0.15, 0.07, 46], [0.43, -0.14, 0.065, 42], [-0.10, -0.18, 0.06, 26], [0.17, -0.185, 0.06, 22], [-0.30, -0.185, 0.05, 20], [0.0, -0.19, 0.05, 12]];`);
rep(`const H = Math.min(0.12 + rnd() * 0.24, TANK.surfaceY - base - 0.03 + (rnd() < 0.12 ? 0.05 : 0));
      add(x, z, H, 0.0065 + rnd() * 0.006, 0, { a: rnd() * 6.28, m: 0.12 + rnd() * 0.5 }`, `const H = Math.min(0.14 + rnd() * 0.26, TANK.surfaceY - base - 0.03 + (rnd() < 0.15 ? 0.05 : 0));
      add(x, z, H, 0.0075 + rnd() * 0.007, 0, { a: rnd() * 6.28, m: 0.18 + rnd() * 0.62 }`);
rep(`const swordC = [0.028, 0.120, 0.030];`, `const swordC = [0.045, 0.165, 0.038];`);
rep(`add(cx + Math.cos(a) * 0.006, cz + Math.sin(a) * 0.006, H, (0.030 + rnd() * 0.016) * sc, 1,`, `add(cx + Math.cos(a) * 0.006, cz + Math.sin(a) * 0.006, H, (0.046 + rnd() * 0.022) * sc, 1,`);
rep(`const redC = [0.34, 0.045, 0.04];
  const redBunches = [[0.36, -0.10, 0.028, 26], [0.47, -0.05, 0.02, 14], [-0.19, -0.135, 0.03, 20]];`, `const redC = [0.30, 0.055, 0.045];
  const redBunches = [[0.385, -0.115, 0.032, 60], [0.465, -0.06, 0.022, 26], [-0.26, -0.14, 0.03, 34]];`);
rep(`add(x, z, H, 0.0045 + rnd() * 0.0035, 0, { a: rnd() * 6.28, m: 0.10 + rnd() * 0.25 }, rnd() * 6.28, 1.0 + rnd() * 0.8, jitter(redC, 0.3));`, `const mixG = Math.pow(rnd(), 1.8);
      const cc2 = [redC[0] * (1 - mixG * 0.6) + 0.02 * mixG, redC[1] * (1 - mixG) + 0.11 * mixG, redC[2] + 0.01 * mixG];
      add(x, z, H, 0.0055 + rnd() * 0.004, 0, { a: rnd() * 6.28, m: 0.10 + rnd() * 0.3 }, rnd() * 6.28, 1.0 + rnd() * 0.8, jitter(cc2, 0.22));`);
rep(`const carpetC = [0.05, 0.19, 0.045];
  const nCarpet = Math.round(520 * S);`, `const carpetC = [0.07, 0.24, 0.05];
  const nCarpet = Math.round(2100 * S);`);
rep(`add(x, z, 0.018 + rnd() * 0.030, 0.0022 + rnd() * 0.0015, 0,`, `add(x, z, 0.020 + rnd() * 0.034, 0.0026 + rnd() * 0.0018, 0,`);
rep(`if (noise2(x * 9, z * 9) < -0.10) continue;`, `if (noise2(x * 7, z * 7) < -0.22) continue;`);

// --- ferns in crevices + on crowns
rep(`  const fernC = [0.020, 0.085, 0.024];
  const fernOn = [[rocks[0], 6, 0.85], [rocks[3], 6, 0.8], [rocks[1], 4, 0.7]];
  for (const [rk, n, sc] of fernOn) {
    for (let i = 0; i < Math.round(n * Q.plantScale + 2); i++) {
      const a = rnd() * 6.28;
      const rx = rk.x + Math.cos(a) * rk.sx * 0.25, rz = rk.z + Math.sin(a) * rk.sx * 0.2;
      P.add(rx, rz, (0.055 + rnd() * 0.05) * sc, (0.014 + rnd() * 0.008) * sc, 1, { a, m: 0.6 + rnd() * 0.4 }, a + 1.57, 0.5, P.jitter(fernC, 0.2), 0, rk.top - 0.010);
    }
  }`, `  const fernC = [0.030, 0.115, 0.032];
  const fernOn = [[rocks[0], 14, 0.95], [rocks[3], 10, 0.85], [rocks[1], 8, 0.75]];
  for (const [rk, n, sc] of fernOn) {
    for (let i = 0; i < Math.round(n * Q.plantScale + 2); i++) {
      const a = rnd() * 6.28;
      const side = rnd() < 0.6;   // crevice on the flank vs crown
      const rr = side ? 0.78 : 0.25;
      const rx = rk.x + Math.cos(a) * rk.sx * rr, rz = rk.z + Math.sin(a) * rk.sz * rr;
      const yy = side ? rk.y + rk.sy * (0.10 + rnd() * 0.5) : rk.top - 0.012;
      P.add(rx, rz, (0.050 + rnd() * 0.055) * sc, (0.015 + rnd() * 0.010) * sc, 1, { a, m: 0.6 + rnd() * 0.5 }, a + 1.57, 0.5, P.jitter(fernC, 0.2), 0, yy);
    }
  }`);

// --- plumb the softness option into the sand-independent materials
rep(`const blades = [];
  const S = Q.plantScale;`, `const blades = [];
  const S = Q.plantScale;`);
// leaf translucency in the blade fragment
rep(`           diffuseColor.rgb *= vCol * mix(0.55, 1.35, smoothstep(0.0, 1.0, vT)) * veinB;\`
        );`, `           diffuseColor.rgb *= vCol * mix(0.55, 1.45, smoothstep(0.0, 1.0, vT)) * veinB;\`
        );
        // light shining through the leaf blade (translucency): tinted yellow-green, follows the caustic pattern
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          \`#include <emissivemap_fragment>
           { float dpt = max(uBoxMax.y - vWPos.y, 0.0);
             vec3 tl = diffuseColor.rgb * vec3(1.15, 1.1, 0.55) * causticAt(vWPos) * exp(-dpt * 1.3);
             totalEmissiveRadiance += tl * (0.55 + 0.6 * smoothstep(0.1, 1.0, vT)) * 0.45; }\`
        );`);
save();

load('src/core/waterPatch.js');
// caustics: less dispersion handled in generator; add softness option + lower peak
rep(`export function patchWater(material, opts = {}) {
  const { caustics = true, fog = true, vertex = null, extraFrag = '', onShader = null } = opts;`, `export function patchWater(material, opts = {}) {
  const { caustics = true, fog = true, vertex = null, extraFrag = '', onShader = null, soft = 0 } = opts;`);
rep(`\${caustics ? 'directLight.color *= causticAt(vWPos);' : ''}`, `\${caustics ? 'directLight.color *= causticAt(vWPos, ' + soft.toFixed(2) + ');' : ''}`);
rep(`vec3 causticAt(vec3 p) {`, `vec3 causticAt(vec3 p, float soft);
vec3 causticAt(vec3 p) { return causticAt(p, 0.0); }
vec3 causticAt(vec3 p, float soft) {`);
rep(`float lod = clamp(1.2 - depth * 3.0, 0.0, 1.8) + 0.05;`, `float lod = clamp(1.2 - depth * 3.0, 0.0, 1.8) + 0.05 + soft;`);
rep(`vec3 cc = vec3(0.10) + (c * 0.92 + c2 * 0.10) * 2.4 * uCaustGain;`, `vec3 cc = vec3(0.16) + (c * 0.92 + c2 * 0.10) * 2.0 * uCaustGain;
  // desaturate the dispersion fringe a little
  float ccl = dot(cc, vec3(0.333));
  cc = mix(vec3(ccl), cc, 0.6);`);
save();

load('src/systems/water.js');
rep(`float d = 1.0 + 0.06 * float(ch);`, `float d = 1.0 + 0.025 * float(ch);`);
save();

load('src/systems/room.js');
rep(`new THREE.Color(0.95, 0.97, 1.0), 3.6)`, `new THREE.Color(0.95, 0.97, 1.0), 5.0)`);
rep(`vec3 tint = vec3(0.05, 0.50, 0.34) * ab * 0.09;`, `vec3 tint = vec3(0.07, 0.40, 0.26) * ab * 0.055;`);
save();

load('src/core/waterPatch.js');
rep(`uAmbient: { value: new THREE.Color(0.030, 0.050, 0.062) },`, `uAmbient: { value: new THREE.Color(0.055, 0.085, 0.100) },`);
save();

// sand: stronger relief
load('src/systems/scenery.js');
console.log('ok');
