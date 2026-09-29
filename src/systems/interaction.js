import * as THREE from 'three';
import { TANK } from '../core/waterPatch.js';

/**
 * Pointer interaction: tap water to feed, tap glass to scare fish, hover cursors.
 * Drag is left to OrbitControls; we only classify tap vs drag on pointerup.
 * Hot path reuses temps — no per-frame allocations.
 */
export function createInteraction({ canvas, camera, controls, sys, events }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const scarePt = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();

  const SURFACE_Y = TANK.surfaceY;
  const IW = TANK.iw;
  const ID = TANK.id;
  const HALF_W = TANK.halfW;
  const HALF_D = TANK.halfD;
  const HEIGHT = TANK.height;
  const FRONT_Z = HALF_D; // +0.21 outer front glass

  const TAP_PX = 6;
  const TAP_MS = 400;

  let enabled = true;
  let ptrId = -1;
  let downX = 0;
  let downY = 0;
  let downT = 0;
  let dragging = false;
  let hover = 'none'; // 'none' | 'water' | 'glass'

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

  /** Plane hit: origin + t*dir, plane n·p = k. Returns t or -1. */
  function hitPlane(nx, ny, nz, k) {
    const denom = nx * dir.x + ny * dir.y + nz * dir.z;
    if (Math.abs(denom) < 1e-8) return -1;
    const t = (k - (nx * origin.x + ny * origin.y + nz * origin.z)) / denom;
    return t > 1e-5 ? t : -1;
  }

  function pointAt(t) {
    hit.copy(dir).multiplyScalar(t).add(origin);
    return hit;
  }

  /**
   * Resolve tap target. Water surface wins whenever the ray hits it inside the tank rect.
   * Otherwise nearest glass pane (front / left / right).
   * @returns {'water'|'glass'|null}
   */
  function resolveHit(clientX, clientY) {
    castRay(clientX, clientY);

    const tWater = hitPlane(0, 1, 0, SURFACE_Y);
    if (tWater > 0) {
      pointAt(tWater);
      if (hit.x >= -IW && hit.x <= IW && hit.z >= -ID && hit.z <= ID) {
        return 'water';
      }
    }

    let bestT = Infinity;
    let best = null;

    // front glass z = +HALF_D
    const tF = hitPlane(0, 0, 1, FRONT_Z);
    if (tF > 0 && tF < bestT) {
      pointAt(tF);
      if (hit.x >= -HALF_W && hit.x <= HALF_W && hit.y >= 0 && hit.y <= HEIGHT) {
        bestT = tF;
        best = 'glass';
        scarePt.copy(hit);
      }
    }

    // left x = -HALF_W
    const tL = hitPlane(1, 0, 0, -HALF_W);
    if (tL > 0 && tL < bestT) {
      pointAt(tL);
      if (hit.z >= -HALF_D && hit.z <= HALF_D && hit.y >= 0 && hit.y <= HEIGHT) {
        bestT = tL;
        best = 'glass';
        scarePt.copy(hit);
      }
    }

    // right x = +HALF_W
    const tR = hitPlane(1, 0, 0, HALF_W);
    if (tR > 0 && tR < bestT) {
      pointAt(tR);
      if (hit.z >= -HALF_D && hit.z <= HALF_D && hit.y >= 0 && hit.y <= HEIGHT) {
        bestT = tR;
        best = 'glass';
        scarePt.copy(hit);
      }
    }

    if (best === 'glass') hit.copy(scarePt);
    return best;
  }

  function applyCursor() {
    if (dragging) {
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (hover === 'water') canvas.style.cursor = 'crosshair';
    else if (hover === 'glass') canvas.style.cursor = 'pointer';
    else canvas.style.cursor = 'grab';
  }

  function onPointerDown(e) {
    if (!enabled) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (ptrId !== -1) return;
    ptrId = e.pointerId;
    downX = e.clientX;
    downY = e.clientY;
    downT = performance.now();
    dragging = false;
    canvas.style.cursor = 'grabbing';
    try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); }
  }

  function onPointerMove(e) {
    if (!enabled) return;
    if (ptrId === e.pointerId) {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (!dragging && dx * dx + dy * dy > TAP_PX * TAP_PX) {
        dragging = true;
        hover = 'none';
        applyCursor();
      }
      return;
    }
    // hover feedback (mouse only; skip during multi-touch)
    if (e.pointerType === 'touch') return;
    const kind = resolveHit(e.clientX, e.clientY);
    const next = kind || 'none';
    if (next !== hover) {
      hover = next;
      applyCursor();
    }
  }

  function onPointerUp(e) {
    if (!enabled) return;
    if (e.pointerId !== ptrId) return;
    const dt = performance.now() - downT;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    const moved = Math.sqrt(dx * dx + dy * dy);
    const wasTap = !dragging && moved < TAP_PX && dt < TAP_MS;
    ptrId = -1;
    dragging = false;

    if (wasTap) {
      const kind = resolveHit(e.clientX, e.clientY);
      if (kind === 'water') {
        const x = hit.x;
        const z = hit.z;
        sys.food.drop(x, z, 14);
        sys.water.addRipple(x, z, 1);
        events.emit('feed', { x, z });
        events.emit('tap', { point: { x, y: SURFACE_Y, z } });
      } else if (kind === 'glass') {
        scarePt.copy(hit);
        sys.fish.scare(scarePt, 1);
        events.emit('tap', { point: { x: scarePt.x, y: scarePt.y, z: scarePt.z } });
      }
    }

    hover = resolveHit(e.clientX, e.clientY) || 'none';
    applyCursor();
  }

  function onPointerCancel(e) {
    if (!enabled) return;
    if (e.pointerId !== ptrId) return;
    ptrId = -1;
    dragging = false;
    applyCursor();
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('contextmenu', onContextMenu);

  if (typeof controls.addEventListener === 'function') {
    controls.addEventListener('start', () => {
      dragging = true;
      applyCursor();
    });
    controls.addEventListener('end', () => {
      dragging = false;
      applyCursor();
    });
  }

  return {
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) {
        ptrId = -1;
        dragging = false;
        hover = 'none';
        canvas.style.cursor = 'grab';
      } else {
        applyCursor();
      }
    },
    get enabled() { return enabled; },
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}

/** Tiny event bus for sound / analytics subscribers. */
export function createEventBus() {
  const map = new Map();
  return {
    on(type, fn) {
      let set = map.get(type);
      if (!set) { set = new Set(); map.set(type, set); }
      set.add(fn);
      return () => set.delete(fn);
    },
    off(type, fn) {
      map.get(type)?.delete(fn);
    },
    emit(type, detail) {
      const set = map.get(type);
      if (!set) return;
      for (const fn of set) fn(detail);
    },
  };
}
