import fs from 'node:fs';
let s, p;
const rep = (from, to) => { if (!s.includes(from)) throw new Error('missing: ' + from.slice(0, 70)); s = s.replace(from, to); };
const load = (f) => { p = f; s = fs.readFileSync(f, 'utf8'); };
const save = () => fs.writeFileSync(p, s);

load('src/systems/room.js');
rep(`new THREE.DirectionalLight(new THREE.Color(0.92, 0.95, 1.0), 2.4)`, `new THREE.DirectionalLight(new THREE.Color(0.95, 0.97, 1.0), 1.05)`);
save();

load('src/systems/water.js');
rep(`gl_FragColor = vec4(acc * uRayGain * 2.2, 1.0);`, `gl_FragColor = vec4(acc * uRayGain * 0.55, 1.0);`);
save();

load('src/core/textures.js');
rep(`const jitter = 0.78 + g * 0.4;
      const k = jitter * (0.82 + patch * 0.3);`, `const jitter = 0.78 + g * 0.4;
      const k = jitter * (0.94 + patch * 0.0);`);
save();

load('src/systems/scenery.js');
rep(`for (let i = 0; i < p.count; i++) p.setY(i, sandHeight(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();`, `const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, sandHeight(x, z));
    // broad tonal patches (darker organic patches, paler ridges) live in vertex colours so the grain texture can tile
    const t = 0.80 + 0.32 * (fbm2(x * 5.5 + 9, z * 7.0, 3) * 0.5 + 0.5) + 0.10 * noise2(x * 22, z * 22);
    const warm = 0.03 * noise2(x * 3 + 7, z * 3);
    col[i * 3] = t * (1 + warm); col[i * 3 + 1] = t; col[i * 3 + 2] = t * (1 - warm);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();`);
rep(`normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.93, metalness: 0 }),`, `normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.93, metalness: 0, vertexColors: true }),`);
save();

load('src/core/waterPatch.js');
rep(`uAmbient: { value: new THREE.Color(0.020, 0.036, 0.046) },`, `uAmbient: { value: new THREE.Color(0.012, 0.020, 0.026) },`);
save();
console.log('ok');
