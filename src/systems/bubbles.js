import * as THREE from 'three';
import { TANK, WU, patchWater } from '../core/waterPatch.js';
import { sandHeight } from './scenery.js';
import { mulberry32 } from '../core/noise.js';
import { Q } from '../core/quality.js';

/**
 * Air stone + a slow stream of bubbles. Bubbles are shaded billboards (fake glass spheres): rim ring, sharp
 * window highlight, faint refracted second highlight. They wobble, grow slightly with depth loss, and pop at the
 * surface (small ripple).
 */
export function createBubbles(scene, { water, onEvent } = {}) {
  const rnd = mulberry32(4242);
  const group = new THREE.Group();
  scene.add(group);

  const SX = 0.235, SZ = -0.115;               // air stone position, tucked behind the rocks
  const sandY = sandHeight(SX, SZ);

  // ---- air stone (grey porous cylinder half buried) + air line running up the back corner
  const stoneMat = patchWater(new THREE.MeshStandardMaterial({ color: 0x8b8a86, roughness: 0.95 }), { key: 'stone' });
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.02, 20), stoneMat);
  stone.position.set(SX, sandY + 0.004, SZ);
  stone.castShadow = true;
  const tubeMat = patchWater(new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.35 }), { key: 'airline' });
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(SX, sandY + 0.01, SZ),
    new THREE.Vector3(SX + 0.06, sandY + 0.012, SZ - 0.045),
    new THREE.Vector3(0.40, sandY + 0.03, -0.185),
    new THREE.Vector3(0.475, 0.16, -0.192),
    new THREE.Vector3(0.478, 0.36, -0.19),
    new THREE.Vector3(0.47, 0.44, -0.185),
  ]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.0026, 8), tubeMat);
  group.add(stone, tube);

  // ---- bubbles
  const N = Q.bubbles;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const data = new Float32Array(N * 4);
  const iData = new THREE.InstancedBufferAttribute(data, 4);
  iData.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iData', iData);
  geo.instanceCount = N;

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { ...WU },
    vertexShader: /* glsl */ `
      attribute vec4 iData; varying vec2 vUv; varying vec3 vW;
      void main() {
        vec4 mv = viewMatrix * vec4(iData.xyz, 1.0);
        mv.xy += position.xy * iData.w * 2.0;
        vUv = position.xy * 2.0; vW = iData.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vW;
      uniform vec3 uBoxMin, uBoxMax, uAbsorb;
      void main() {
        float r = length(vUv);
        if (r > 1.0) discard;
        vec3 n = vec3(vUv, sqrt(max(1.0 - r * r, 0.0)));
        vec3 L = normalize((viewMatrix * vec4(0.15, 1.0, 0.25, 0.0)).xyz);
        float rim = pow(1.0 - n.z, 2.6);
        float edge = smoothstep(1.0, 0.86, r);
        float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);
        float spec2 = pow(max(dot(reflect(L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0) * 0.35;   // light refracted through to the far wall
        vec3 col = vec3(0.70, 0.86, 1.0) * (rim * 0.55 + 0.03) + vec3(1.0) * spec * 1.8 + vec3(0.6, 0.85, 1.0) * spec2;
        float a = clamp(rim * 0.55 + spec + spec2 * 0.5 + 0.03, 0.0, 0.95) * edge;
        // water absorption between camera and bubble
        float len = distance(cameraPosition, vW);
        col *= exp(-uAbsorb * len * 0.35);
        gl_FragColor = vec4(col * edge, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  group.add(mesh);

  const bubbles = [];
  for (let i = 0; i < N; i++) bubbles.push({ alive: false, x0: 0, z0: 0, y: 0, r: 0, v: 0, ph: rnd() * 6.28, age: 0, born: 0 });
  let spawnAcc = 0;
  const rate = Q.name === 'low' ? 6.5 : 9;

  function spawn(b, t) {
    b.alive = true;
    b.x0 = SX + (rnd() - 0.5) * 0.010;
    b.z0 = SZ + (rnd() - 0.5) * 0.010;
    b.y = sandY + 0.014;
    b.r = 0.0007 + Math.pow(rnd(), 2.0) * 0.0021;     // 0.7 - 2.8 mm radius
    b.v = 0.15 + b.r * 55;                              // bigger bubbles rise faster (~0.15-0.30 m/s)
    b.ph = rnd() * 6.28;
    b.age = 0;
    if (rnd() < 0.55) onEvent?.('bubble', { x: b.x0, y: b.y, z: b.z0, r: b.r });
  }

  function update(dt, t) {
    spawnAcc += dt * rate * (0.75 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.31));
    while (spawnAcc >= 1) {
      spawnAcc -= 1;
      const b = bubbles.find((q) => !q.alive);
      if (!b) break;
      spawn(b, t);
    }
    for (let i = 0; i < N; i++) {
      const b = bubbles[i];
      if (!b.alive) { data[i * 4 + 3] = 0; data[i * 4 + 1] = -5; continue; }
      b.age += dt;
      b.y += b.v * dt;
      const h = b.y - sandY;
      const wob = 0.0025 + h * 0.012;
      const x = b.x0 + Math.sin(b.age * 6.0 + b.ph) * wob + Math.sin(b.age * 1.3 + b.ph * 2.0) * 0.004 * h * 4.0;
      const z = b.z0 + Math.cos(b.age * 5.0 + b.ph) * wob * 0.7;
      const r = b.r * (1 + h * 0.5);
      if (b.y >= TANK.surfaceY - r * 0.5) {
        b.alive = false;
        if (rnd() < 0.45) water?.addRipple(x, z, 0.22);
        if (rnd() < 0.6) onEvent?.('pop', { x, z, r });
        data[i * 4 + 3] = 0; data[i * 4 + 1] = -5;
        continue;
      }
      data[i * 4] = x; data[i * 4 + 1] = b.y; data[i * 4 + 2] = z; data[i * 4 + 3] = r;
    }
    iData.needsUpdate = true;
  }

  return { group, mesh, bubbles, update, stone: { x: SX, z: SZ } };
}
