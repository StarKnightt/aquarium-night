import fs from 'node:fs';
let s, p;
const rep = (from, to) => { if (!s.includes(from)) throw new Error('missing: ' + from.slice(0, 70)); s = s.replace(from, to); };
const load = (f) => { p = f; s = fs.readFileSync(f, 'utf8'); };
const save = () => fs.writeFileSync(p, s);

load('src/core/waterPatch.js');
rep(`vec3 cc = vec3(0.16) + (c * 0.92 + c2 * 0.10) * 2.0 * uCaustGain;`, `vec3 cc = vec3(0.24) + (c * 0.92 + c2 * 0.10) * 1.45 * uCaustGain;
  cc = cc / (1.0 + cc * 0.10);`);
rep(`float lod = clamp(1.2 - depth * 3.0, 0.0, 1.8) + 0.05 + soft;`, `float lod = clamp(1.2 - depth * 3.0, 0.0, 1.8) + 0.30 + soft;`);
rep(`cc = mix(vec3(ccl), cc, 0.6);`, `cc = mix(vec3(ccl), cc, 0.45);`);
rep(`uAmbient: { value: new THREE.Color(0.055, 0.085, 0.100) },`, `uAmbient: { value: new THREE.Color(0.085, 0.120, 0.135) },`);
save();

load('src/systems/scenery.js');
// rocks: duller, warmer, more biofilm
rep(`roughness: 0.40, metalness: 0.0 }), { key: 'rock', soft: 0.9 }`, `roughness: 0.68, metalness: 0.0 }), { key: 'rock', soft: 1.7 }`);
rep(`[-0.17, -0.04, 0.185, 0.118, 0.128, [0.20, 0.19, 0.17], 0.5, 0.10],   // dominant`, `[-0.17, -0.04, 0.185, 0.118, 0.128, [0.29, 0.25, 0.20], 0.5, 0.10],   // dominant, warm grey-brown`);
rep(`[0.15, 0.145, 0.15], 4.0, 0.05],    // charcoal`, `[0.19, 0.19, 0.18], 4.0, 0.05],    // grey`);
rep(`col[i * 3] = rr * (1 - film * 0.35) + film * 0.035;
    col[i * 3 + 1] = gg * (1 - film * 0.10) + film * 0.075;
    col[i * 3 + 2] = bb * (1 - film * 0.50) + film * 0.012;`, `col[i * 3] = rr * (1 - film * 0.45) + film * 0.05;
    col[i * 3 + 1] = gg * (1 - film * 0.18) + film * 0.09;
    col[i * 3 + 2] = bb * (1 - film * 0.60) + film * 0.018;`);
rep(`h += r[3] * 0.42 * t * t * (3 - 2 * t)`, `h += r[3] * 0.62 * t * t * (3 - 2 * t)`);
rep(`if (rn < 1.9) {
      const t = Math.min(1, Math.max(0, (1.9 - rn) / 1.05));`, `if (rn < 2.15) {
      const t = Math.min(1, Math.max(0, (2.15 - rn) / 1.2));`);
save();

load('src/systems/scenery.js');
// tape grass: uneven tops
rep(`const H = Math.min(0.14 + rnd() * 0.26, TANK.surfaceY - base - 0.03 + (rnd() < 0.15 ? 0.05 : 0));`, `const H = Math.min(0.09 + Math.pow(rnd(), 1.4) * 0.31, TANK.surfaceY - base - 0.03 + (rnd() < 0.15 ? 0.05 : 0));`);
// red stems softer/less neon, curvier
rep(`const redC = [0.30, 0.055, 0.045];`, `const redC = [0.22, 0.085, 0.055];`);
rep(`add(x, z, H, 0.0055 + rnd() * 0.004, 0, { a: rnd() * 6.28, m: 0.10 + rnd() * 0.3 }`, `add(x, z, H, 0.0042 + rnd() * 0.0035, 0, { a: rnd() * 6.28, m: 0.22 + rnd() * 0.45 }`);
// fern wider
rep(`(0.015 + rnd() * 0.010) * sc, 1, { a, m: 0.6 + rnd() * 0.5 }`, `(0.024 + rnd() * 0.014) * sc, 1, { a, m: 0.7 + rnd() * 0.5 }`);
// carpet: continuous, uneven, thinner, asymmetric
rep(`const nCarpet = Math.round(2100 * S);`, `const nCarpet = Math.round(3600 * S);`);
rep(`const inLeft = rnd() < 0.72;
    const x = inLeft ? -0.47 + rnd() * 0.36 : 0.16 + rnd() * 0.20;
    const z = 0.02 + rnd() * 0.17;
    if (noise2(x * 7, z * 7) < -0.22) continue;
    add(x, z, 0.020 + rnd() * 0.034, 0.0026 + rnd() * 0.0018, 0,`, `const x = -0.48 + rnd() * 0.96;
    const z = -0.02 + rnd() * 0.22;
    const dens = fbm2(x * 6 + 3, z * 8, 2) + 0.55 - 0.9 * Math.max(0, (z - 0.12)) * 3.0 - Math.max(0, 0.2 - Math.abs(x - 0.10)) * 0.0;
    if (rnd() > dens) continue;
    add(x, z, 0.014 + rnd() * rnd() * 0.05, 0.0016 + rnd() * 0.0012, 0,`);
// carpet colours vary a little more
rep(`const carpetC = [0.07, 0.24, 0.05];`, `const carpetC = [0.09, 0.25, 0.055];`);
// leaves: lift the darkest parts
rep(`mix(0.55, 1.45, smoothstep(0.0, 1.0, vT))`, `mix(0.85, 1.5, smoothstep(0.0, 1.0, vT))`);
save();
console.log('ok');
