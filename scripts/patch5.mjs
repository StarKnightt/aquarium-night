import fs from 'node:fs';
let s, p;
const rep = (from, to) => { if (!s.includes(from)) throw new Error('missing: ' + from.slice(0, 70)); s = s.replace(from, to); };
const load = (f) => { p = f; s = fs.readFileSync(f, 'utf8'); };
const save = () => fs.writeFileSync(p, s);

load('src/core/waterPatch.js');
// single dominant caustic network (2nd layer only as faint break-up), higher contrast, warmer sand
rep(`vec3 c2 = textureLod(uCaust, uv * 0.61 + vec2(0.47, 0.19) + depth * 0.05, lod + 0.7).rgb;
  vec3 cc = vec3(0.34) + (c * 0.60 + c2 * 0.40) * 1.05 * uCaustGain;`, `vec3 c2 = textureLod(uCaust, uv * 0.43 + vec2(0.47, 0.19) + depth * 0.05, lod + 1.5).rgb;
  vec3 cc = vec3(0.22) + (c * 0.92 + c2 * 0.10) * 1.25 * uCaustGain;`);
rep(`uAbsorb: { value: new THREE.Vector3(1.05, 0.34, 0.26) },`, `uAbsorb: { value: new THREE.Vector3(0.55, 0.24, 0.20) },`);
rep(`uScatter: { value: new THREE.Color(0.016, 0.052, 0.064) },`, `uScatter: { value: new THREE.Color(0.012, 0.030, 0.038) },`);
save();

load('src/systems/water.js');
rep(`out3 = pow(out3 * 0.075, vec3(1.7));
        out3 = out3 / (1.0 + out3 * 0.11);`, `out3 = pow(out3 * 0.07, vec3(2.1));
        out3 = out3 / (1.0 + out3 * 0.07);`);
rep(`const NW = 12;`, `const NW = 16;`);
// surface: waves vary along z so the bar mirror stretches into a wavy ribbon; soft env only
rep(`vec2 d0 = normalize(vec2(1.0, 0.35));  g += d0 * 0.00090 * 38.0 * cos(dot(d0, p) * 38.0 + t * 1.30);
        vec2 d1 = normalize(vec2(-0.6, 1.0));  g += d1 * 0.00045 * 61.0 * cos(dot(d1, p) * 61.0 - t * 1.75 + 1.3);
        vec2 d2 = normalize(vec2(0.2, -1.0));  g += d2 * 0.00050 * 97.0 * cos(dot(d2, p) * 97.0 + t * 2.4 + 2.1);
        vec2 d3 = normalize(vec2(-1.0, -0.4)); g += d3 * 0.00042 * 143.0 * cos(dot(d3, p) * 143.0 - t * 3.1);`,
    `vec2 d0 = normalize(vec2(0.18, 1.0));  g += d0 * 0.00085 * 34.0 * cos(dot(d0, p) * 34.0 + t * 1.30 + sin(p.x * 7.0) * 1.2);
        vec2 d1 = normalize(vec2(-0.25, 1.0)); g += d1 * 0.00050 * 58.0 * cos(dot(d1, p) * 58.0 - t * 1.75 + 1.3 + sin(p.x * 11.0) * 1.5);
        vec2 d2 = normalize(vec2(0.35, -1.0)); g += d2 * 0.00030 * 91.0 * cos(dot(d2, p) * 91.0 + t * 2.4 + 2.1);
        vec2 d3 = normalize(vec2(-1.0, -0.15)); g += d3 * 0.00018 * 120.0 * cos(dot(d3, p) * 120.0 - t * 3.1);`);
rep(`vec3 env = roomEnv(R);
          // positional mirror of the LED bar`, `vec3 env = roomEnv(R) * vec3(0.32);   // lamps/windows only as faint sheen on a water surface
          // positional mirror of the LED bar`);
rep(`float bar = smoothstep(1.06, 0.9, bx) * smoothstep(1.0, 0.35, bz) * step(0.0, R.y);
          env += vec3(0.95, 1.0, 1.2) * 5.5 * bar;`, `float bar = smoothstep(1.06, 0.9, bx) * smoothstep(1.25, 0.25, bz) * step(0.0, R.y);
          env += vec3(0.95, 1.0, 1.2) * 4.0 * bar;`);
// rays: sharper/sparser
rep(`float shafts = pow(clamp(sh * 0.55 + sh2 * 0.45, 0.0, 3.0), 1.9);`, `float shafts = pow(clamp(sh * 0.55 + sh2 * 0.45, 0.0, 3.0), 2.7);`);
rep(`(0.10 + 1.7 * shafts)`, `(0.03 + 3.0 * shafts)`);
rep(`vec3(0.85, 0.93, 1.0) * T * m * vA * 0.42`, `vec3(0.9, 0.95, 1.0) * T * m * vA * 0.6`);
rep(`opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  );
  meniscus.position`, `opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  );
  meniscus.position`);
save();

load('src/core/quality.js');
rep(`particles: 260,`, `particles: 130,`);
rep(`particles: 140,`, `particles: 80,`);
save();
console.log('ok');
