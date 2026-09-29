import * as THREE from 'three';
import { TANK, WU } from '../core/waterPatch.js';

/**
 * Free-fly explore camera: enter/exit the tank, look, dolly, FOV zoom, WASD,
 * fish follow. OrbitControls stay disabled while active.
 */

const BOUNDS = { x0: -2, x1: 2, y0: -0.55, y1: 1.8, z0: -1.2, z1: 2.5 };
const FOV_MIN = 14;
const FOV_MAX = 70;
const SURFACE_Y = TANK.surfaceY;
const TAP_PX = 8;
const TAP_MS = 380;
const DBL_MS = 320;
const DBL_PX = 28;
const MOVE = 0.55;
const MOVE_FAST = 1.35;
const LOOK_SENS = 0.0024;
const LOOK_TOUCH = 0.0032;
const DOLLY_WHEEL = 0.00055;
const FOV_WHEEL = 0.045;
const DAMP_VEL = 4.2;
const DAMP_LOOK = 10;
const BANK_MAX = 0.07;
const RESTORE_SEC = 1.15;

function hitPlane(origin, dir, nx, ny, nz, k) {
  const denom = nx * dir.x + ny * dir.y + nz * dir.z;
  if (Math.abs(denom) < 1e-8) return -1;
  const t = (k - (nx * origin.x + ny * origin.y + nz * origin.z)) / denom;
  return t > 1e-5 ? t : -1;
}

export function createExplore({
  canvas, camera, controls, sys, events, audio,
  getHomePose, onUnderwater, onRestored,
}) {
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const wish = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const vel = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const followOff = new THREE.Vector3();
  const homePos = new THREE.Vector3();
  const homeLook = new THREE.Vector3();
  const restoreFrom = new THREE.Vector3();
  const restoreLookFrom = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  let active = false;
  let restoring = false;
  let restoreT = 0;
  let restoreFov0 = 32;
  let restoreFov1 = 32;
  let yaw = 0;
  let pitch = 0;
  let roll = 0;
  let yawVel = 0;
  let pitchVel = 0;
  let fovTarget = camera.fov;
  let baseNear = camera.near;
  let followFish = null;
  let inside = false;
  let rayGainDefault = 1.0;
  let ambBase = null;

  const keys = new Set();
  const pointers = new Map(); // id -> {x,y,sx,sy,t,moved}
  let lookPtr = -1;
  let lastTapT = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let pinchDist0 = 0;
  let pinchActive = false;
  let dollyImpulse = 0;
  let handheldT = 0;
  let enabledListeners = false;

  function setNdc(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    ndc.x = ((clientX - rect.left) / w) * 2 - 1;
    ndc.y = -((clientY - rect.top) / h) * 2 + 1;
  }

  function castRay(clientX, clientY) {
    setNdc(clientX, clientY);
    raycaster.setFromCamera(ndc, camera);
    origin.copy(raycaster.ray.origin);
    dir.copy(raycaster.ray.direction);
  }

  function pointAt(t) {
    return hit.copy(dir).multiplyScalar(t).add(origin);
  }

  /** Same water/glass resolve as interaction — works from inside or outside. */
  function resolveHit(clientX, clientY) {
    castRay(clientX, clientY);
    const IW = TANK.iw;
    const ID = TANK.id;
    const HALF_W = TANK.halfW;
    const HALF_D = TANK.halfD;
    const HEIGHT = TANK.height;

    const tWater = hitPlane(origin, dir, 0, 1, 0, SURFACE_Y);
    if (tWater > 0) {
      pointAt(tWater);
      if (hit.x >= -IW && hit.x <= IW && hit.z >= -ID && hit.z <= ID) {
        // Prefer surface tap only when camera is above (or near) the surface
        if (camera.position.y >= SURFACE_Y - 0.02) return 'water';
      }
    }

    let bestT = Infinity;
    let best = null;
    const panes = [
      [0, 0, 1, HALF_D],
      [1, 0, 0, -HALF_W],
      [1, 0, 0, HALF_W],
      [0, 0, 1, -HALF_D],
    ];
    for (const [nx, ny, nz, k] of panes) {
      const t = hitPlane(origin, dir, nx, ny, nz, k);
      if (t <= 0 || t >= bestT) continue;
      pointAt(t);
      const onPane =
        (nx !== 0
          ? hit.z >= -HALF_D && hit.z <= HALF_D && hit.y >= 0 && hit.y <= HEIGHT
          : hit.x >= -HALF_W && hit.x <= HALF_W && hit.y >= 0 && hit.y <= HEIGHT);
      if (onPane) {
        bestT = t;
        best = 'glass';
        tmp.copy(hit);
      }
    }
    if (best === 'glass') hit.copy(tmp);
    return best;
  }

  function pickFish(clientX, clientY) {
    castRay(clientX, clientY);
    const list = sys.fish?.fishes;
    if (!list) return null;
    let best = null;
    let bestT = Infinity;
    for (const f of list) {
      const R = Math.max(0.018, f.sp.L * f.size * (f.sp.ltot || 1.3) * 0.55);
      // ray-sphere
      const ocx = origin.x - f.pos.x;
      const ocy = origin.y - f.pos.y;
      const ocz = origin.z - f.pos.z;
      const b = ocx * dir.x + ocy * dir.y + ocz * dir.z;
      const c = ocx * ocx + ocy * ocy + ocz * ocz - R * R;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0.02 && t < bestT) {
        bestT = t;
        best = f;
      }
    }
    return best;
  }

  function syncEulerFromCamera() {
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    yaw = euler.y;
    pitch = euler.x;
    roll = 0;
  }

  function applyOrientation() {
    euler.set(pitch, yaw, roll, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    camera.up.set(0, 1, 0);
  }

  function clampPos() {
    const p = camera.position;
    p.x = THREE.MathUtils.clamp(p.x, BOUNDS.x0, BOUNDS.x1);
    p.y = THREE.MathUtils.clamp(p.y, BOUNDS.y0, BOUNDS.y1);
    p.z = THREE.MathUtils.clamp(p.z, BOUNDS.z0, BOUNDS.z1);
  }

  function cancelFollow() {
    followFish = null;
  }

  function startFollow(f) {
    followFish = f;
    followOff.copy(camera.position).sub(f.pos);
    if (followOff.lengthSq() < 1e-4) followOff.set(0.05, 0.02, 0.12);
  }

  function applyTap(clientX, clientY) {
    const kind = resolveHit(clientX, clientY);
    if (kind === 'water') {
      sys.food.drop(hit.x, hit.z, 14);
      sys.water.addRipple(hit.x, hit.z, 1);
      events.emit('feed', { x: hit.x, z: hit.z });
      events.emit('tap', { point: { x: hit.x, y: SURFACE_Y, z: hit.z } });
      return true;
    }
    if (kind === 'glass') {
      sys.fish.scare(hit, 1);
      events.emit('tap', { point: { x: hit.x, y: hit.y, z: hit.z } });
      return true;
    }
    return false;
  }

  function updateUnderwater() {
    const p = camera.position;
    const now =
      p.x > -0.48 && p.x < 0.48 &&
      p.y > 0.02 && p.y < 0.412 &&
      p.z > -0.19 && p.z < 0.19;
    if (now !== inside) {
      inside = now;
      if (sys.water?.rays?.mat?.uniforms?.uRayGain) {
        sys.water.rays.mat.uniforms.uRayGain.value = inside ? 0.20 : rayGainDefault;
      }
      // Hide meniscus lines when submerged — they read as edge artifacts up close
      if (sys.water?.meniscus) sys.water.meniscus.visible = !inside;
      if (sys.water?.meniscus2) sys.water.meniscus2.visible = !inside;
      // Mild fill so submerged views aren't mud-black (default orbit look unchanged)
      const amb = WU?.uAmbient?.value;
      if (amb) {
        if (!ambBase) ambBase = amb.clone();
        if (inside) {
          amb.set(ambBase.r * 1.35, ambBase.g * 1.40, ambBase.b * 1.35);
        } else {
          amb.copy(ambBase);
        }
      }
      audio?.setUnderwater?.(inside);
      onUnderwater?.(inside);
    }
    const wantNear = active || inside ? 0.01 : baseNear;
    if (Math.abs(camera.near - wantNear) > 1e-4) {
      camera.near = wantNear;
      camera.updateProjectionMatrix();
    }
  }

  function onKeyDown(e) {
    if (!active || restoring) return;
    const k = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(k)) {
      keys.add(k);
      cancelFollow();
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onWheel(e) {
    if (!active || restoring) return;
    e.preventDefault();
    cancelFollow();
    const dy = e.deltaY;
    if (e.ctrlKey || e.shiftKey || e.metaKey) {
      fovTarget = THREE.MathUtils.clamp(fovTarget + dy * FOV_WHEEL, FOV_MIN, FOV_MAX);
    } else {
      dollyImpulse += -dy * DOLLY_WHEEL;
    }
  }

  function onPointerDown(e) {
    if (!active || restoring) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointers.set(e.pointerId, {
      x: e.clientX, y: e.clientY,
      sx: e.clientX, sy: e.clientY,
      t: performance.now(), moved: false,
    });
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* */ }
    if (pointers.size === 1) lookPtr = e.pointerId;
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchDist0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchActive = true;
      lookPtr = -1;
    }
  }

  function onPointerMove(e) {
    if (!active || restoring) return;
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!p.moved) {
      const tdx = e.clientX - p.sx;
      const tdy = e.clientY - p.sy;
      if (tdx * tdx + tdy * tdy > TAP_PX * TAP_PX) p.moved = true;
    }

    if (pointers.size === 2 && pinchActive) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchDist0 > 1) {
        const ratio = dist / pinchDist0;
        // pinch out = forward, pinch in = back
        dollyImpulse += (ratio - 1) * 0.35;
        cancelFollow();
      }
      pinchDist0 = dist;
      return;
    }

    if (e.pointerId === lookPtr && p.moved) {
      const sens = e.pointerType === 'touch' ? LOOK_TOUCH : LOOK_SENS;
      yawVel -= dx * sens * 60;
      pitchVel -= dy * sens * 60;
      cancelFollow();
    }
  }

  function onPointerUp(e) {
    if (!active) return;
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* */ }

    if (pointers.size < 2) pinchActive = false;
    if (e.pointerId === lookPtr) lookPtr = pointers.size ? [...pointers.keys()][0] : -1;

    if (restoring) return;

    const dt = performance.now() - p.t;
    const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
    const wasTap = !p.moved && moved < TAP_PX && dt < TAP_MS;

    if (wasTap && pointers.size === 0) {
      const now = performance.now();
      const isDbl =
        now - lastTapT < DBL_MS &&
        Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < DBL_PX;

      if (isDbl) {
        // double-tap: fish follow if hit, else dash forward
        const fish = pickFish(e.clientX, e.clientY);
        if (fish) {
          startFollow(fish);
        } else {
          cancelFollow();
          camera.getWorldDirection(forward);
          vel.addScaledVector(forward, 1.8);
        }
        lastTapT = 0;
      } else {
        // single tap — feed / scare; schedule check so dbl can cancel... fire immediately for glass/water
        applyTap(e.clientX, e.clientY);
        lastTapT = now;
        lastTapX = e.clientX;
        lastTapY = e.clientY;
      }
    }
  }

  function onDblClick(e) {
    if (!active || restoring) return;
    e.preventDefault();
    const fish = pickFish(e.clientX, e.clientY);
    if (fish) startFollow(fish);
  }

  function onContextMenu(e) {
    if (active) e.preventDefault();
  }

  function attach() {
    if (enabledListeners) return;
    enabledListeners = true;
    addEventListener('keydown', onKeyDown);
    addEventListener('keyup', onKeyUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('contextmenu', onContextMenu);
  }

  function detach() {
    if (!enabledListeners) return;
    enabledListeners = false;
    removeEventListener('keydown', onKeyDown);
    removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('dblclick', onDblClick);
    canvas.removeEventListener('contextmenu', onContextMenu);
    pointers.clear();
    keys.clear();
  }

  function setActive(on, opts = {}) {
    if (on === active && !restoring) return active;
    if (on) {
      restoring = false;
      active = true;
      baseNear = 0.03;
      rayGainDefault = sys.water?.rays?.mat?.uniforms?.uRayGain?.value ?? 1.0;
      controls.enabled = false;
      syncEulerFromCamera();
      fovTarget = THREE.MathUtils.clamp(camera.fov, FOV_MIN, FOV_MAX);
      vel.set(0, 0, 0);
      yawVel = 0;
      pitchVel = 0;
      dollyImpulse = 0;
      cancelFollow();
      camera.near = 0.01;
      camera.updateProjectionMatrix();
      attach();
      canvas.style.cursor = 'grab';
      document.getElementById('explore')?.classList.add('on');
    } else {
      active = false;
      cancelFollow();
      detach();
      pointers.clear();
      keys.clear();
      document.getElementById('explore')?.classList.remove('on');
      if (inside) {
        inside = false;
        if (sys.water?.rays?.mat?.uniforms?.uRayGain) {
          sys.water.rays.mat.uniforms.uRayGain.value = rayGainDefault;
        }
        if (sys.water?.meniscus) sys.water.meniscus.visible = true;
        if (sys.water?.meniscus2) sys.water.meniscus2.visible = true;
        if (ambBase && WU?.uAmbient?.value) WU.uAmbient.value.copy(ambBase);
        audio?.setUnderwater?.(false);
        onUnderwater?.(false);
      }
      if (opts.instant) {
        restoring = false;
        const home = getHomePose();
        homePos.set(...home.pos);
        homeLook.set(...home.look);
        restoreFov1 = home.fov;
        finishRestore();
      } else {
        const home = getHomePose();
        homePos.set(...home.pos);
        homeLook.set(...home.look);
        restoreFrom.copy(camera.position);
        camera.getWorldDirection(tmp);
        restoreLookFrom.copy(camera.position).addScaledVector(tmp, 1.2);
        restoreFov0 = camera.fov;
        restoreFov1 = home.fov;
        restoreT = 0;
        restoring = true;
      }
    }
    return active;
  }

  function finishRestore() {
    restoring = false;
    camera.position.copy(homePos);
    controls.target.copy(homeLook);
    camera.fov = restoreFov1;
    camera.near = 0.03;
    camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0);
    camera.lookAt(homeLook);
    controls.enabled = true;
    controls.update();
    syncEulerFromCamera();
    onRestored?.();
  }

  function update(dt) {
    if (restoring) {
      restoreT += dt;
      const u = Math.min(1, restoreT / RESTORE_SEC);
      const s = u * u * (3 - 2 * u);
      camera.position.lerpVectors(restoreFrom, homePos, s);
      lookAt.lerpVectors(restoreLookFrom, homeLook, s);
      camera.up.set(0, 1, 0);
      camera.lookAt(lookAt);
      camera.fov = THREE.MathUtils.lerp(restoreFov0, restoreFov1, s);
      camera.near = THREE.MathUtils.lerp(0.01, 0.03, s);
      camera.updateProjectionMatrix();
      if (u >= 1) finishRestore();
      return;
    }

    if (!active) return;

    handheldT += dt;

    // fish follow
    if (followFish) {
      const f = followFish;
      // gentle orbit
      followOff.applyAxisAngle(up, dt * 0.35);
      tmp.copy(f.pos).add(followOff);
      camera.position.lerp(tmp, 1 - Math.exp(-dt * 3.5));
      lookAt.copy(f.pos);
      camera.up.set(0, 1, 0);
      camera.lookAt(lookAt);
      syncEulerFromCamera();
      clampPos();
      updateUnderwater();
      // still ease FOV
      camera.fov += (fovTarget - camera.fov) * (1 - Math.exp(-dt * 6));
      camera.updateProjectionMatrix();
      return;
    }

    // look damping
    yaw += yawVel * dt;
    pitch += pitchVel * dt;
    pitch = THREE.MathUtils.clamp(pitch, -1.45, 1.45);
    yawVel *= Math.exp(-dt * DAMP_LOOK);
    pitchVel *= Math.exp(-dt * DAMP_LOOK);

    // movement wish
    wish.set(0, 0, 0);
    const fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = fast ? MOVE_FAST : MOVE;
    if (keys.has('KeyW') || keys.has('ArrowUp')) wish.z -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) wish.z += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) wish.x += 1;
    if (keys.has('KeyE')) wish.y += 1;
    if (keys.has('KeyQ')) wish.y -= 1;
    if (wish.lengthSq() > 0) wish.normalize();

    applyOrientation();
    camera.getWorldDirection(forward);
    right.crossVectors(forward, up).normalize();

    // world wish
    tmp.set(0, 0, 0);
    tmp.addScaledVector(right, wish.x);
    tmp.addScaledVector(up, wish.y);
    tmp.addScaledVector(forward, -wish.z);
    if (tmp.lengthSq() > 0) tmp.normalize().multiplyScalar(speed);

    // dolly impulse along view (units ≈ metres of wish speed, not /dt)
    if (Math.abs(dollyImpulse) > 1e-6) {
      tmp.addScaledVector(forward, dollyImpulse * 2.4);
      dollyImpulse *= Math.exp(-dt * 10);
    }

    // accelerate toward wish, damp velocity
    vel.x += (tmp.x - vel.x) * (1 - Math.exp(-dt * 6));
    vel.y += (tmp.y - vel.y) * (1 - Math.exp(-dt * 6));
    vel.z += (tmp.z - vel.z) * (1 - Math.exp(-dt * 6));
    vel.multiplyScalar(Math.exp(-dt * (wish.lengthSq() ? 0.8 : DAMP_VEL * 0.35)));

    camera.position.addScaledVector(vel, dt);

    // subtle handheld drift
    const hs = 0.00022 * (0.35 + Math.min(1, vel.length() * 2));
    camera.position.x += Math.sin(handheldT * 1.17) * hs;
    camera.position.y += Math.sin(handheldT * 0.83 + 1.7) * hs * 0.7;
    camera.position.z += Math.cos(handheldT * 0.91) * hs * 0.55;

    clampPos();

    // banking when strafing
    const targetRoll = -wish.x * BANK_MAX * (fast ? 1.2 : 1);
    roll += (targetRoll - roll) * (1 - Math.exp(-dt * 5));
    applyOrientation();

    // FOV ease
    if (Math.abs(camera.fov - fovTarget) > 0.01) {
      camera.fov += (fovTarget - camera.fov) * (1 - Math.exp(-dt * 6));
      camera.updateProjectionMatrix();
    }

    // keep controls.target roughly ahead so exiting feels ok
    controls.target.copy(camera.position).addScaledVector(forward, 0.8);

    updateUnderwater();
  }

  return {
    get active() { return active; },
    get restoring() { return restoring; },
    get inside() { return inside; },
    setActive,
    toggle() { return setActive(!active && !restoring); },
    /** Re-read yaw/pitch from the current camera (after external lookAt / set). */
    resync() {
      if (!active) return;
      syncEulerFromCamera();
      fovTarget = THREE.MathUtils.clamp(camera.fov, FOV_MIN, FOV_MAX);
      vel.set(0, 0, 0);
      yawVel = 0;
      pitchVel = 0;
      dollyImpulse = 0;
      cancelFollow();
      updateUnderwater();
    },
    update,
    dispose() {
      setActive(false);
      detach();
      if (restoring) finishRestore();
    },
  };
}
