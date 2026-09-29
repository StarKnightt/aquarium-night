import fs from 'node:fs';
let s, p;
const rep = (from, to) => { if (!s.includes(from)) throw new Error('missing: ' + from.slice(0, 70)); s = s.replace(from, to); };
const load = (f) => { p = f; s = fs.readFileSync(f, 'utf8'); };
const save = () => fs.writeFileSync(p, s);

// ---- caustics: thin bright filament network
load('src/systems/water.js');
rep(`ix = Math.round((rnd() * 2 - 1) * 8); iy = Math.round((rnd() * 2 - 1) * 8); } while ((ix === 0 && iy === 0) || ix * ix + iy * iy > 70 || ix * ix + iy * iy < 3);`,
    `ix = Math.round((rnd() * 2 - 1) * 12); iy = Math.round((rnd() * 2 - 1) * 12); } while ((ix === 0 && iy === 0) || ix * ix + iy * iy > 150 || ix * ix + iy * iy < 6);`);
rep(`C.push((0.16 + rnd() * 0.16) * (1.0 + 2.0 / m));`, `C.push((0.30 + rnd() * 0.26) * (1.0 + 2.6 / m));`);
rep(`float I = 1.0 / max(abs(det), 0.085);`, `float I = 1.0 / (abs(det) + 0.028);`);
rep(`out3 = pow(out3 * 0.155, vec3(1.35));`, `out3 = pow(out3 * 0.075, vec3(1.7));
        out3 = out3 / (1.0 + out3 * 0.11);`);
// rays: streakier and gentler
rep(`float sh = textureLod(uCaust, uv, 3.4).g;             // blurred focus pattern = shaft strength
          float sh2 = textureLod(uCaust, uv * 0.53 + 0.31, 3.0).g;
          float shafts = pow(clamp(sh * 0.6 + sh2 * 0.4, 0.0, 3.0), 1.6);`,
    `float sh = textureLod(uCaust, vec2(uv.x * 0.7, uv.y * 0.15), 2.2).g;   // stretched along depth = vertical streaks
          float sh2 = textureLod(uCaust, vec2(uv.x * 0.37 + 0.31, uv.y * 0.10), 1.6).g;
          float shafts = pow(clamp(sh * 0.55 + sh2 * 0.45, 0.0, 3.0), 1.9);`);
rep(`float foot = smoothstep(0.52, 0.10, abs(p.x)) * 0.6 + 0.4;
          float zf = smoothstep(0.24, -0.18, p.z) * 0.6 + 0.4;`, `float foot = smoothstep(0.55, 0.05, abs(p.x)) * 0.35 + 0.65;
          float zf = smoothstep(0.24, -0.18, p.z) * 0.3 + 0.7;`);
rep(`acc += trans * uScatter * lightAmt * (0.35 + 1.5 * shafts) * dt * L;`, `acc += trans * uScatter * lightAmt * (0.10 + 1.7 * shafts) * dt * L;`);
rep(`gl_FragColor = vec4(acc * uRayGain * 3.0, 1.0);`, `gl_FragColor = vec4(acc * uRayGain * 2.2, 1.0);`);
// surface: tighter mirror of the bar, more visible ripples
rep(`float bx = abs(hit.x) / 0.41, bz = abs(hit.z + 0.06) / 0.034;
          float bar = smoothstep(1.06, 0.9, bx) * smoothstep(1.35, 0.6, bz) * step(0.0, R.y);
          env += vec3(0.85, 0.95, 1.3) * 9.0 * bar;`, `float bx = abs(hit.x) / 0.41, bz = abs(hit.z + 0.06) / 0.03;
          float bar = smoothstep(1.06, 0.9, bx) * smoothstep(1.0, 0.35, bz) * step(0.0, R.y);
          env += vec3(0.95, 1.0, 1.2) * 5.5 * bar;`);
rep(`0.00060 * 38.0`, `0.00090 * 38.0`);
rep(`0.00030 * 97.0`, `0.00050 * 97.0`);
rep(`0.00020 * 143.0`, `0.00042 * 143.0`);
// particles: sparse, only in shafts
rep(`float lightAmt = exp(-depth * 1.8) * (0.5 + 0.5 * smoothstep(0.55, 0.0, abs(p.x)));`, `float shaft = textureLod(uCaust, vec2(p.x * 1.4 + 0.13, p.y * 0.1 + p.z * 0.2), 1.8).g;
        float lightAmt = exp(-depth * 1.8) * (0.25 + 1.4 * pow(clamp(shaft, 0.0, 2.0), 1.7));`);
rep(`gl_PointSize = clamp((0.0018 + aSeed.w * 0.0030) * uPx * 900.0 / dist, 1.2, 5.5);`, `gl_PointSize = clamp((0.0009 + aSeed.w * aSeed.w * 0.0034) * uPx * 900.0 / dist, 1.0, 5.0);`);
rep(`gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * T * m * vA * 0.5, 1.0);`, `gl_FragColor = vec4(vec3(0.85, 0.93, 1.0) * T * m * vA * 0.42, 1.0);`);
// meniscus: bright and dark rim
rep(`meniscus.position.set(0, TANK.surfaceY - 0.0018, TANK.id + 0.0004);`, `meniscus.position.set(0, TANK.surfaceY - 0.0015, TANK.id + 0.0004);
  const meniscus2 = meniscus.clone();
  meniscus2.material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
  meniscus2.position.y -= 0.0032; meniscus2.scale.y = 1.4; meniscus2.renderOrder = 4;`);
rep(`scene.add(surface.mesh, rays.mesh, particles.pts, meniscus);`, `scene.add(surface.mesh, rays.mesh, particles.pts, meniscus, meniscus2);`);
save();

// ---- water colour: desaturated, gentler
load('src/core/waterPatch.js');
rep(`uAbsorb: { value: new THREE.Vector3(1.55, 0.42, 0.30) },`, `uAbsorb: { value: new THREE.Vector3(1.05, 0.34, 0.26) },`);
rep(`uScatter: { value: new THREE.Color(0.030, 0.150, 0.190) },`, `uScatter: { value: new THREE.Color(0.016, 0.052, 0.064) },`);
rep(`uAmbient: { value: new THREE.Color(0.040, 0.085, 0.115) },`, `uAmbient: { value: new THREE.Color(0.020, 0.036, 0.046) },`);
rep(`vec3 cc = mix(vec3(1.0), (c * 0.62 + c2 * 0.38), uCaustGain);
  float atten = exp(-depth * 1.15);
  return cc * (0.30 + 0.70 * atten);`, `vec3 cc = vec3(0.34) + (c * 0.60 + c2 * 0.40) * 1.05 * uCaustGain;
  float atten = exp(-depth * 0.9);
  return cc * (0.30 + 0.70 * atten);`);
rep(`vec2 uv = p.xz * 1.35 + vec2(0.13, 0.31);
  float lod = clamp(1.6 - depth * 3.2, 0.0, 2.2) + 0.2;`, `vec2 uv = p.xz * 2.0 + vec2(0.13, 0.31);
  float lod = clamp(1.2 - depth * 3.0, 0.0, 1.8) + 0.05;`);
save();

// ---- sand darker & warmer, sun less blue and less hot
load('src/core/textures.js');
rep(`[214, 200, 172], [196, 180, 150], [225, 214, 190], [170, 156, 130],
    [238, 232, 214], [150, 140, 120], [92, 84, 74], [205, 188, 160],`, `[176, 152, 116], [160, 138, 104], [188, 168, 132], [132, 116, 92],
    [204, 190, 160], [112, 100, 84], [64, 58, 50], [170, 148, 112],`);
save();
load('src/systems/room.js');
rep(`new THREE.DirectionalLight(new THREE.Color(0.78, 0.88, 1.0), 3.4)`, `new THREE.DirectionalLight(new THREE.Color(0.92, 0.95, 1.0), 2.4)`);
save();

// ---- particle count
load('src/core/quality.js');
rep(`particles: 420,`, `particles: 260,`);
save();
// ---- debug view
load('scripts/shot.mjs');
rep(`  side: [[1.3, 0.3, 0.3], [0, 0.2, -0.05]],`, `  side: [[1.3, 0.3, 0.3], [0, 0.2, -0.05]],
  sand: [[0.0, 0.62, 0.30], [0.0, 0.03, 0.0]],`);
save();
console.log('ok');
