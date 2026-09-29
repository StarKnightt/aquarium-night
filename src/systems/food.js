import * as THREE from 'three';
import { TANK, patchWater } from '../core/waterPatch.js';
import { sandHeight } from './scenery.js';
import { mulberry32 } from '../core/noise.js';

/**
 * Fish-food flakes. They fall through air, land on the surface (ripple), float a moment, then sink slowly,
 * tumbling, and finally rest on the sand where bottom feeders find them.
 */
export function createFood(scene, { water, onEvent } = {}) {
  const MAX = 140;
  const rnd = mulberry32(31337);
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = patchWater(
    new THREE.MeshStandardMaterial({
      roughness: 0.55,
      metalness: 0.05,
      side: THREE.DoubleSide,
      vertexColors: false,
      emissive: 0x6a2808,
      emissiveIntensity: 0.45,
    }),
    { key: 'flake2' }
  );
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const flakes = [];
  // brighter so flakes read as food, not glare lines under LED
  const palette = [[0.95, 0.42, 0.10], [0.85, 0.55, 0.12], [0.45, 0.72, 0.14], [0.92, 0.28, 0.12], [0.9, 0.7, 0.22]];
  const dummy = new THREE.Object3D();
  const q = new THREE.Quaternion(), e = new THREE.Euler();

  function drop(x, z, count = 14) {
    for (let i = 0; i < count; i++) {
      if (flakes.length >= MAX) break;
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 0.028;
      flakes.push({
        x: THREE.MathUtils.clamp(x + Math.cos(a) * r, -TANK.iw + 0.01, TANK.iw - 0.01),
        z: THREE.MathUtils.clamp(z + Math.sin(a) * r, -TANK.id + 0.01, TANK.id - 0.01),
        y: TANK.surfaceY + 0.04 + rnd() * 0.06,
        vx: (rnd() - 0.5) * 0.02, vy: 0, vz: (rnd() - 0.5) * 0.02,
        rx: rnd() * 6.28, ry: rnd() * 6.28, rz: rnd() * 6.28, sx: (rnd() - 0.5) * 2.4, sy: (rnd() - 0.5) * 2.4,
        size: 0.0055 + rnd() * 0.0055, state: 'air', t: 0, floatTime: 2.5 + rnd() * 5.0, sinkV: 0.011 + rnd() * 0.010,
        col: palette[Math.floor(rnd() * palette.length)], eaten: false, seed: rnd() * 100, life: 0,
      });
    }
    onEvent?.('drop', { x, z });
  }

  const tmpC = new THREE.Color();
  function update(dt, t) {
    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i];
      f.life += dt;
      if (f.eaten || (f.state === 'sand' && f.life > 60)) { flakes.splice(i, 1); continue; }
      if (f.state === 'air') {
        f.vy -= 9.8 * dt * 0.35;   // small flakes are quickly drag-limited
        f.vy = Math.max(f.vy, -0.9);
        f.y += f.vy * dt; f.x += f.vx * dt; f.z += f.vz * dt;
        if (f.y <= TANK.surfaceY) {
          f.y = TANK.surfaceY - 0.0003; f.state = 'float'; f.t = 0; f.vy = 0;
          if (rnd() < 0.5) water?.addRipple(f.x, f.z, 0.5 + rnd() * 0.4);
        }
      } else if (f.state === 'float') {
        f.t += dt;
        f.x += Math.sin(t * 0.7 + f.seed) * 0.0022 * dt * 6 + f.vx * dt * 0.2;
        f.z += Math.cos(t * 0.6 + f.seed * 1.3) * 0.0016 * dt * 6 + f.vz * dt * 0.2;
        f.y = TANK.surfaceY - 0.0004 + Math.sin(t * 2 + f.seed) * 0.0003;
        f.rx *= 0.98; f.rz *= 0.98;
        if (f.t > f.floatTime) f.state = 'sink';
      } else if (f.state === 'sink') {
        const k = Math.min(1, f.t2 = (f.t2 || 0) + dt);
        f.y -= f.sinkV * dt * (0.4 + 0.6 * Math.min(1, (f.t2 || 0) * 1.2));
        f.x += Math.sin(t * 0.9 + f.seed * 3.0) * 0.0035 * dt + f.vx * dt * 0.1;
        f.z += Math.cos(t * 0.8 + f.seed * 2.0) * 0.0028 * dt;
        f.rx += f.sx * dt * 0.8; f.ry += f.sy * dt * 0.8;
        const floor = sandHeight(f.x, f.z) + f.size * 0.4;
        if (f.y <= floor) { f.y = floor; f.state = 'sand'; f.rx = -1.45 + (rnd() - 0.5) * 0.4; f.rz = rnd() * 6; }
      }
    }
    const n = Math.min(flakes.length, MAX);
    for (let i = 0; i < n; i++) {
      const f = flakes[i];
      e.set(f.rx, f.ry, f.rz);
      q.setFromEuler(e);
      dummy.position.set(f.x, f.y, f.z);
      dummy.quaternion.copy(q);
      const sc = f.size * (f.state === 'sand' ? Math.max(0.35, 1 - Math.max(0, f.life - 25) / 45) : 1);
      dummy.scale.set(sc, sc * 0.8, sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tmpC.setRGB(f.col[0], f.col[1], f.col[2]);
      mesh.setColorAt(i, tmpC);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  return {
    mesh, flakes, drop, update,
    /** flakes fish can currently go for */
    edible() { return flakes.filter((f) => !f.eaten && f.state !== 'air'); },
    eat(f) { if (f.eaten) return false; f.eaten = true; return true; },
  };
}
