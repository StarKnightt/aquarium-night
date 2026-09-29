import * as THREE from 'three';
import { SPECIES, buildFishGeometry, paintSkin } from './fishGeometry.js';
import { patchWater, TANK } from '../core/waterPatch.js';
import { sandHeight, sandFloor } from './scenery.js';
import { mulberry32, noise3 } from '../core/noise.js';
import { Q } from '../core/quality.js';

const VERT_DECL = `attribute float aT; attribute float aFin; attribute float aSide; attribute float aDist;
attribute float iPhase; attribute float iAmp; attribute float iBend; attribute float iFlap;`;

/** GPU swimming: S-curve + idle sway, turn-bend, pectoral flap, fin ripples. */
function fishVertex(L) {
  return (vs) =>
    vs
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
        { float L_ = ${L.toFixed(5)};
          float tt = clamp(aT, 0.0, 1.5);
          float ampT = 0.08 + 0.92 * pow(tt, 2.05);
          // travelling wave (stronger toward tail)
          float lat = sin(iPhase - tt * 5.0) * ampT * iAmp * L_ * 0.12;
          // gentle constant S-curve that scales with swim amp / speed (readable in stills)
          float scurve = sin(tt * 6.2831853) * (0.06 + iAmp * 0.12) * L_;
          // idle sway even at low amp
          float idle = sin(iPhase * 0.37 - tt * 2.4) * (0.035 + iAmp * 0.04) * L_;
          lat += scurve + idle;
          // C-bend from turns / startle (stronger factor so tap reads in stills)
          lat += iBend * pow(tt, 1.35) * L_ * 0.95;
          transformed.x += lat;
          transformed.x -= sin(iPhase - 0.3) * (1.0 - min(tt, 1.0)) * iAmp * L_ * 0.010;
          if (aFin > 1.5 && aFin < 2.5) {
            // pectorals: calm delicate flutter; iFlap carries panic flare via rate/amp upstream
            float fl = 0.5 + 0.5 * sin(iFlap + aSide * 0.5);
            float flare = 0.55 + 0.45 * clamp(iAmp, 0.0, 1.8);
            transformed.x += aSide * aDist * fl * L_ * 0.11 * flare;
            transformed.z -= aDist * (1.0 - fl) * L_ * 0.035;
            transformed.y += aDist * (fl - 0.4) * L_ * 0.035;
          } else if (aFin > 2.5) {
            transformed.x += sin(iPhase * 0.55 - tt * 6.5 + aDist * 3.0) * aDist * L_ * 0.040 * (0.35 + iAmp);
          } else if (aFin > 0.5) {
            transformed.x += sin(iPhase - tt * 5.5 - aDist * 2.0) * aDist * L_ * 0.045 * iAmp;
          }
        }`
      );
}

function makeMaterial(key, sp, tex, isFin) {
  const isAngel = key === 'angel';
  const isNeon = key === 'neon';
  const isPlaty = key === 'platy';
  const mat = new THREE.MeshPhysicalMaterial({
    map: isFin ? tex.map : (tex.bodyMap || tex.map),
    roughness: isFin ? 0.62 : (isAngel ? 0.58 : isPlaty ? 0.38 : 0.32),
    metalness: isFin ? 0.0 : (isNeon ? 0.72 : isPlaty ? 0.18 : 0.02),
    metalnessMap: !isFin && tex.metalness ? tex.metalness : null,
    roughnessMap: !isFin && tex.roughness ? tex.roughness : null,
    clearcoat: isFin ? 0.0 : (isAngel ? 0.08 : isPlaty ? 0.32 : isNeon ? 0.55 : 0.28),
    clearcoatRoughness: isAngel ? 0.62 : isNeon ? 0.18 : 0.38,
    iridescence: isFin ? 0 : sp.iri,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: isNeon ? [80, 380] : [180, 560],
    sheen: isPlaty && !isFin ? 0.55 : 0,
    sheenRoughness: 0.4,
    sheenColor: isPlaty ? new THREE.Color(1.0, 0.45, 0.15) : new THREE.Color(0, 0, 0),
    emissive: 0x000000,
    emissiveMap: null,
    emissiveIntensity: 0,
    side: isFin ? THREE.DoubleSide : THREE.DoubleSide,
    transparent: isFin,
    opacity: isFin ? (key === 'angel' ? 0.82 : 0.88) : 1,
    depthWrite: !isFin,
    alphaTest: 0,
  });
  // body must stay opaque regardless of map alpha
  if (!isFin) {
    mat.transparent = false;
    mat.opacity = 1;
    mat.depthWrite = true;
    mat.alphaMap = null;
  }
  return patchWater(mat, {
    key: `fish-${key}-${isFin ? 'f' : 'b'}v6`,
    vertex: fishVertex(sp.L),
    soft: isAngel ? 0.55 : 0.4,
    onShader: isFin
      ? null
      : (shader) => {
          // force fully opaque body even if map samples fringe alpha
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
             diffuseColor.a = 1.0;`
          );
        },
  });
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function createFish(scene, { scenery, food, water, onEvent }) {
  const rnd = mulberry32(777);
  const group = new THREE.Group();
  scene.add(group);

  const fishes = [];
  const species = {};
  const rockSpheres = scenery.rocks.map((r) => ({ p: V(r.x, r.y, r.z), r: Math.max(r.sx, r.sz) * 0.95 + 0.008 }));

  for (const [key, sp] of Object.entries(SPECIES)) {
    const n = sp.count;
    // smoother silhouettes for tetras / angels (faceting was causing hard speculars)
    const seg = Math.max(Q.fishSeg, key === 'angel' || key === 'neon' ? 36 : key === 'platy' ? 32 : Q.fishSeg);
    const ring = Math.max(Q.fishRing, key === 'angel' || key === 'neon' ? 16 : 14);
    const { body, fins } = buildFishGeometry(sp, seg, ring);
    const attrs = {
      iPhase: new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
      iAmp: new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
      iBend: new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
      iFlap: new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
    };
    for (const k in attrs) { attrs[k].setUsage(THREE.DynamicDrawUsage); body.setAttribute(k, attrs[k]); fins.setAttribute(k, attrs[k]); }
    const tex = paintSkin(key, sp);
    const bodyMesh = new THREE.InstancedMesh(body, makeMaterial(key, sp, tex, false), n);
    const finMesh = new THREE.InstancedMesh(fins, makeMaterial(key, sp, tex, true), n);
    finMesh.instanceMatrix = bodyMesh.instanceMatrix;
    bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bodyMesh.castShadow = true;
    bodyMesh.frustumCulled = finMesh.frustumCulled = false;
    finMesh.renderOrder = 2;
    group.add(bodyMesh, finMesh);
    species[key] = { sp, bodyMesh, finMesh, attrs };

    const cx = (rnd() - 0.5) * 0.5, cy = 0.15 + rnd() * 0.15, cz = (rnd() - 0.5) * 0.2;
    for (let i = 0; i < n; i++) {
      const size = 0.9 + rnd() * 0.22;
      let sx = cx + (rnd() - 0.5) * 0.12, sz = cz + (rnd() - 0.5) * 0.08;
      if (sp.bottom) {
        // spawn on open sand away from rock piles
        sx = (rnd() - 0.5) * 0.7; sz = (rnd() - 0.5) * 0.22;
        for (let tries = 0; tries < 12; tries++) {
          let ok = true;
          for (const r of rockSpheres) {
            if (Math.hypot(sx - r.p.x, sz - r.p.z) < r.r + 0.04) { ok = false; break; }
          }
          if (ok) break;
          sx = (rnd() - 0.5) * 0.7; sz = (rnd() - 0.5) * 0.22;
        }
      }
      const f = {
        key, sp, idx: i, size,
        pos: V(sx, cy + (rnd() - 0.5) * 0.08, sz),
        fwd: V(rnd() - 0.5, 0, rnd() - 0.5).normalize(),
        d: V(), tmp: V(), mouth: V(),
        spd: sp.speed * (0.6 + rnd() * 0.5),
        seed: rnd() * 100,
        phase: rnd() * 6.28, flap: rnd() * 6.28, amp: 0.55, bend: 0, bendTarget: 0,
        hunger: 0.5 + rnd() * 0.4, panic: 0, nerve: 0, target: null, tmpTarget: null, tmpDist: 1e9,
        glidePhase: rnd() * 6.28, glideRate: 0.5 + rnd() * 0.6,
        roll: 0, dartBend: 0, bendHold: 0, cool: 0, nibble: 0,
      };
      if (sp.bottom) {
        f.pos.y = sandFloor(f.pos.x, f.pos.z) + 0.0035;
        f.fwd.y = -0.18; f.fwd.normalize();
      }
      fishes.push(f);
      const c = new THREE.Color().setHSL(0.0, 0.0, 0.88 + rnd() * 0.22);
      bodyMesh.setColorAt(i, c);
      finMesh.instanceColor = bodyMesh.instanceColor;
    }
  }

  const m4 = new THREE.Matrix4(), xa = V(), ya = V(), za = V(), sc = V();
  const UP = V(0, 1, 0);
  const axis = V(), old = V(), tmp2 = V(), tmp3 = V();
  const bounds = { x0: -0.455, x1: 0.455, z0: -0.165, z1: 0.17, y1: TANK.surfaceY - 0.022 };

  function assignFood() {
    for (const f of fishes) { f.tmpTarget = null; f.tmpDist = 1e9; }
    const list = food.edible();
    for (const fl of list) {
      let a = null, b = null, c2 = null, da = 1e9, db = 1e9, dc = 1e9;
      for (const f of fishes) {
        if (f.hunger < 0.22 || f.cool > 0) continue;
        const onSand = fl.state === 'sand' || fl.y < sandHeight(fl.x, fl.z) + 0.05;
        if (f.sp.bottom ? !onSand : onSand && fl.state === 'sand') continue;
        const d = Math.hypot(f.pos.x - fl.x, f.pos.y - fl.y, f.pos.z - fl.z);
        if (d > 0.62) continue;
        if (d < da) { c2 = b; dc = db; b = a; db = da; a = f; da = d; }
        else if (d < db) { c2 = b; dc = db; b = f; db = d; }
        else if (d < dc) { c2 = f; dc = d; }
      }
      for (const [f, d] of [[a, da], [b, db], [c2, dc]]) {
        if (f && d < f.tmpDist) { f.tmpTarget = fl; f.tmpDist = d; }
      }
    }
    for (const f of fishes) f.target = f.tmpTarget;
  }

  function steer(f, dt, t) {
    const sp = f.sp, pos = f.pos, fwd = f.fwd, d = f.d.set(0, 0, 0);
    const L = sp.L * f.size;
    const calm = 1 - f.nerve * 0.6;
    d.addScaledVector(fwd, 1.15 + f.panic * 3);
    const nt = t * 0.085 + f.seed;
    f.tmp.set(noise3(nt, 1.3, f.seed * 3.7), noise3(nt * 0.7, 5.1, f.seed) * 0.32, noise3(nt, 9.7, f.seed * 1.9));
    d.addScaledVector(f.tmp, 2.1 * calm * (sp.bottom ? 1.2 : 1));

    let n = 0;
    const cx = tmp2.set(0, 0, 0), al = tmp3.set(0, 0, 0);
    const sepR = L * 2.6, viewR = sp.school > 0.8 ? 0.28 : 0.2;
    for (const g of fishes) {
      if (g === f) continue;
      const dx = g.pos.x - pos.x, dy = g.pos.y - pos.y, dz = g.pos.z - pos.z;
      const dist = Math.hypot(dx, dy, dz);
      const same = g.key === f.key;
      const sr = same ? sepR : L * 2.0;
      if (dist < sr && dist > 1e-5) {
        const w = ((sr - dist) / sr) * 2.4;
        d.x -= dx / dist * w; d.y -= dy / dist * w * 0.7; d.z -= dz / dist * w;
      }
      if (same && dist < viewR) { n++; cx.add(g.pos); al.add(g.fwd); }
    }
    if (n > 0) {
      cx.multiplyScalar(1 / n).sub(pos);
      const coh = 0.75 * sp.school * (1 + f.nerve * 1.4);
      d.addScaledVector(cx.normalize(), coh);
      d.addScaledVector(al.normalize(), 0.9 * sp.school);
    }

    const m = 0.07;
    if (pos.x < bounds.x0 + m) d.x += (bounds.x0 + m - pos.x) * 30;
    if (pos.x > bounds.x1 - m) d.x -= (pos.x - (bounds.x1 - m)) * 30;
    if (pos.z < bounds.z0 + m) d.z += (bounds.z0 + m - pos.z) * 30;
    if (pos.z > bounds.z1 - m) d.z -= (pos.z - (bounds.z1 - m)) * 30;
    const floorY = sandHeight(pos.x, pos.z);
    if (!sp.bottom) {
      const yLo = floorY + 0.035 + L * 0.2, yHi = bounds.y1 - 0.02 - (f.target ? -0.02 : 0);
      if (pos.y < yLo) d.y += (yLo - pos.y) * 55;
      if (pos.y > yHi && !f.target) d.y -= (pos.y - yHi) * 55;
      const lo = Math.max(sp.yPref[0], yLo), hi = sp.yPref[1];
      if (pos.y < lo) d.y += (lo - pos.y) * 3; else if (pos.y > hi && !f.target) d.y -= (pos.y - hi) * 3;
    }
    // rocks — bottom fish only slide sideways (don't climb)
    for (const r of rockSpheres) {
      const rx = pos.x - r.p.x, ry = pos.y - r.p.y, rz = pos.z - r.p.z;
      const dist = Math.hypot(rx, ry, rz), lim = r.r + (sp.bottom ? 0.05 : 0.035) + L * 0.5;
      if (dist < lim && dist > 1e-5) {
        const w = (lim - dist) / lim * (sp.bottom ? 16 : 10);
        d.x += rx / dist * w;
        d.z += rz / dist * w;
        if (!sp.bottom) d.y += ry / dist * w * 0.6;
      }
    }

    let spdMul = 1;
    if (f.target && f.panic < 0.2 && !(f.cool > 0)) {
      const fl = f.target;
      f.mouth.copy(fwd).multiplyScalar(L * 0.5).add(pos);
      const dx = fl.x - f.mouth.x, dy = fl.y - f.mouth.y, dz = fl.z - f.mouth.z;
      const dist = Math.hypot(dx, dy, dz);
      d.set(fwd.x * 0.3, fwd.y * 0.3, fwd.z * 0.3).addScaledVector(tmp2.set(dx, dy, dz).normalize(), 4.2);
      // pitch nose up toward surface flakes
      if (fl.y > pos.y + 0.008) {
        d.y += THREE.MathUtils.clamp((fl.y - pos.y) * 8, 0.4, 2.2);
      }
      // pause to nibble when close
      if (dist < 0.045) {
        spdMul = Math.max(0.12, dist / 0.05) * 0.85;
        f.nibble = Math.max(f.nibble, 0.6);
        if (fl.y > pos.y) d.y += 1.1;
      } else {
        spdMul = dist < 0.06 ? Math.max(0.35, dist / 0.06) * 1.1 : 1.7;
      }
      if (dist < 0.011 * f.size + 0.004) {
        if (food.eat(fl)) {
          f.hunger = Math.max(0, f.hunger - 0.16);
          f.cool = 1.6 + rnd() * 1.8;
          f.nibble = 1;
          f.tmp.set(rnd() - 0.5, (rnd() - 0.5) * 0.4, rnd() - 0.5);
          fwd.addScaledVector(f.tmp, 0.8).normalize();
          f.bendTarget = (rnd() - 0.5) * 2;
          onEvent?.('eat', fl);
        }
      }
    }

    if (f.panic > 0) {
      d.addScaledVector(f.fleeDir, 6 * f.panic);
    }
    if (f.nerve > 0 && !sp.bottom) { d.y -= 0.35 * f.nerve; }

    if (sp.bottom) d.y *= 0.05;
    d.normalize();
    if (d.y > 0.7) { d.y = 0.7; d.normalize(); } else if (d.y < -0.6) { d.y = -0.6; d.normalize(); }

    old.copy(fwd);
    const maxTurn = sp.turn * (1 + f.panic * 3.5) * dt;
    const ang = fwd.angleTo(d);
    if (ang > 1e-4) {
      if (ang <= maxTurn) fwd.copy(d);
      else { axis.crossVectors(fwd, d).normalize(); fwd.applyAxisAngle(axis, maxTurn); }
    }
    fwd.normalize();
    // cory: slight nose-down foraging pose
    if (sp.bottom) {
      fwd.y = THREE.MathUtils.clamp(fwd.y * 0.25 - 0.14, -0.32, 0.04);
      fwd.normalize();
    }
    // feeding nose-up hold
    if (f.nibble > 0.2 && f.target && f.target.y > pos.y) {
      fwd.y = Math.max(fwd.y, 0.35);
      fwd.normalize();
    }
    const yawRate = (Math.sign(old.z * fwd.x - old.x * fwd.z) * Math.min(ang, maxTurn)) / Math.max(dt, 1e-4);

    // bend: hold C-start while panicking so stills (tap @0.35s) still read the bend
    if (f.bendHold > 0 || f.panic > 0.35) {
      if (f.bendHold > 0) f.bendHold -= dt;
      f.bendTarget = f.dartBend !== 0 ? f.dartBend : f.bendTarget;
      if (f.panic > 0.35 && Math.abs(f.dartBend) < 0.4) {
        f.dartBend = (Math.sign(f.bendTarget) || (rnd() < 0.5 ? -1 : 1)) * (1.2 + f.panic);
      }
    } else {
      f.bendTarget = THREE.MathUtils.clamp(yawRate / (sp.turn * 1.2), -1, 1) * 0.9 + f.dartBend;
    }
    f.dartBend *= Math.exp(-dt * (f.bendHold > 0 || f.panic > 0.35 ? 0.35 : 6));

    const glide = 0.5 + 0.5 * Math.sin(t * f.glideRate + f.glidePhase) * Math.sin(t * f.glideRate * 0.43 + f.glidePhase * 1.7);
    let tgt = sp.speed * (0.45 + 0.85 * glide) * calm * spdMul;
    tgt = Math.max(tgt, sp.speed * 0.25);
    tgt += sp.speed * 5.2 * f.panic;
    const k = f.panic > 0.05 ? 14 : 2.2;
    f.spd += (tgt - f.spd) * Math.min(1, dt * k);
    pos.addScaledVector(fwd, f.spd * dt);

    pos.x = THREE.MathUtils.clamp(pos.x, bounds.x0 + 0.01, bounds.x1 - 0.01);
    pos.z = THREE.MathUtils.clamp(pos.z, bounds.z0 + 0.01, bounds.z1 - 0.01);
    if (sp.bottom) {
      // belly ~2–5 mm above open sand (not rock banks)
      const bellyClear = 0.0028 + L * 0.035;
      const ty = sandFloor(pos.x, pos.z) + bellyClear;
      pos.y += (ty - pos.y) * Math.min(1, dt * 18);
      // hard clamp so they never float
      pos.y = Math.min(pos.y, ty + 0.0015);
      pos.y = Math.max(pos.y, ty - 0.0005);
    } else {
      pos.y = THREE.MathUtils.clamp(pos.y, floorY + 0.012 + L * 0.15, TANK.surfaceY - 0.006 - sp.hy[3][1] * L * 0.6);
    }

    const sn = f.spd / sp.speed;
    f.phase += dt * (5.2 + Math.min(sn, 6) * 5.2 + f.panic * 12);
    // calmer pectoral flutter; flare when panicking
    f.flap += dt * ((2.2 + Math.min(sn, 3) * 0.9) * (1 + f.panic * 4.5));
    const ampTarget = THREE.MathUtils.clamp(0.28 + sn * 0.52 + f.panic * 1.1, 0.22, 2.0);
    f.amp += (ampTarget - f.amp) * Math.min(1, dt * 5);
    f.bend += (f.bendTarget - f.bend) * Math.min(1, dt * (f.bendHold > 0 ? 18 : 10));
    f.roll += (THREE.MathUtils.clamp(-yawRate * 0.10, -0.5, 0.5) - f.roll) * Math.min(1, dt * 6);

    f.panic = Math.max(0, f.panic - dt / (1.1 + 0.6 * ((f.seed * 13) % 1)));
    f.nerve = Math.max(0, f.nerve - dt * 0.11);
    if (f.cool > 0) f.cool -= dt;
    if (f.nibble > 0) f.nibble = Math.max(0, f.nibble - dt * 1.4);
    f.hunger = Math.min(1, f.hunger + dt * 0.012);
  }

  function writeInstance(f) {
    const s = species[f.key];
    za.copy(f.fwd);
    xa.crossVectors(UP, za);
    if (xa.lengthSq() < 1e-6) xa.set(1, 0, 0);
    xa.normalize();
    ya.crossVectors(za, xa);
    const cr = Math.cos(f.roll), sr = Math.sin(f.roll);
    tmp2.copy(xa).multiplyScalar(cr).addScaledVector(ya, sr);
    tmp3.copy(ya).multiplyScalar(cr).addScaledVector(xa, -sr);
    m4.makeBasis(tmp2, tmp3, za);
    sc.set(f.size, f.size, f.size);
    m4.scale(sc);
    m4.setPosition(f.pos);
    s.bodyMesh.setMatrixAt(f.idx, m4);
    s.attrs.iPhase.array[f.idx] = f.phase;
    s.attrs.iAmp.array[f.idx] = f.amp;
    s.attrs.iBend.array[f.idx] = f.bend;
    s.attrs.iFlap.array[f.idx] = f.flap;
  }

  /** A tap on the glass: C-start bend hold, divergent flee, flared pecs. */
  function scare(p, strength = 1) {
    for (const f of fishes) {
      const dx = f.pos.x - p.x, dy = f.pos.y - p.y, dz = f.pos.z - p.z;
      const dist = Math.hypot(dx, dy, dz);
      const R = 0.50;
      if (dist < R) {
        const k = 0.45 + 0.55 * (1 - dist / R);
        f.panic = Math.max(f.panic, k * strength);
        f.nerve = 1;
        f.fleeDir = f.fleeDir || V();
        // divergent paths: strong lateral scatter + slight vertical
        f.fleeDir.set(dx, dy * 0.35 - 0.04, dz);
        f.fleeDir.x += (rnd() - 0.5) * 1.1;
        f.fleeDir.z += (rnd() - 0.5) * 1.1;
        f.fleeDir.y += (rnd() - 0.5) * 0.35;
        f.fleeDir.normalize();
        f.fwd.lerp(f.fleeDir, 0.9).normalize();
        f.dartBend = (rnd() < 0.5 ? -1 : 1) * (1.7 + rnd() * 0.6);
        f.bendHold = 0.48 + rnd() * 0.12;
        f.bend = f.dartBend;
        f.bendTarget = f.dartBend;
        f.amp = Math.max(f.amp, 1.65);
        f.spd = Math.max(f.spd, f.sp.speed * 5.5);
        f.target = null;
        f.nibble = 0;
      }
    }
    for (const f of fishes) {
      if (f.panic > 0.2) continue;
      for (const g of fishes) if (g !== f && g.key === f.key && g.panic > 0.5 && f.pos.distanceTo(g.pos) < 0.3) {
        f.panic = Math.max(f.panic, g.panic * 0.6); f.nerve = Math.max(f.nerve, 0.8);
        f.fleeDir = f.fleeDir || V();
        f.fleeDir.copy(g.fleeDir || g.fwd);
        f.fleeDir.x += (rnd() - 0.5) * 0.6; f.fleeDir.z += (rnd() - 0.5) * 0.6; f.fleeDir.normalize();
        f.dartBend = (rnd() < 0.5 ? -1 : 1) * 1.2;
        f.bendHold = 0.18;
        f.spd = Math.max(f.spd, f.sp.speed * 3.5);
      }
    }
  }

  for (const f of fishes) f.fleeDir = V(0, 0, 0);

  function update(dt, t) {
    assignFood();
    for (const f of fishes) { steer(f, dt, t); writeInstance(f); }
    for (const k in species) {
      const s = species[k];
      s.bodyMesh.instanceMatrix.needsUpdate = true;
      for (const a in s.attrs) s.attrs[a].needsUpdate = true;
      if (s.bodyMesh.instanceColor) s.bodyMesh.instanceColor.needsUpdate = true;
    }
  }
  for (const f of fishes) writeInstance(f);

  return { group, fishes, species, scare, update };
}
