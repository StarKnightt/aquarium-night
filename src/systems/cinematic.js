import * as THREE from 'three';
import { WU } from '../core/waterPatch.js';

/**
 * Scripted cinematic camera + deterministic frame capture.
 * Activated only via ?cine=1 — does not change the normal interactive experience.
 *
 * Film time t ∈ [0, duration]. Simulation is warmed up before t=0 so the tank is alive.
 * window.__cine = { duration, fps, seek(frameIndex), warmup() }
 */

const FPS = 30;
const WARMUP_SEC = 16;
const DURATION = 28.0; // seconds of film

// ---- easing helpers ----
function smoothstep(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function smootherstep(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function mixV3(out, a, b, t) {
  out.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
  return out;
}

/** Catmull-Rom on an array of [x,y,z] knots; u in [0,1] across the whole path. */
function catmullRom(knots, u, out) {
  const n = knots.length;
  if (n === 1) { out.set(...knots[0]); return out; }
  const uu = THREE.MathUtils.clamp(u, 0, 1) * (n - 1);
  const i = Math.min(Math.floor(uu), n - 2);
  const t = uu - i;
  const p0 = knots[Math.max(i - 1, 0)];
  const p1 = knots[i];
  const p2 = knots[i + 1];
  const p3 = knots[Math.min(i + 2, n - 1)];
  const t2 = t * t, t3 = t2 * t;
  out.set(
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
    0.5 * ((2 * p1[2]) + (-p0[2] + p2[2]) * t + (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 + (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3),
  );
  return out;
}

/**
 * Landscape (16:9) shot keyframes — FOV ~28–40°.
 * pos/look are Catmull-Rom knot lists in metres.
 */
const SHOTS = [
  // ── HOOK 0.0–1.6: already in motion inside — lateral dolly through neon school ──
  {
    id: 'hook',
    t0: 0.0, t1: 1.6,
    pos: [
      [-0.34, 0.185, 0.10],
      [-0.12, 0.200, 0.055],
      [0.14, 0.215, 0.010],
      [0.36, 0.225, -0.035],
    ],
    look: [
      [0.05, 0.14, -0.05],
      [0.20, 0.16, -0.04],
      [0.38, 0.18, -0.03],
      [0.48, 0.17, 0.02],
    ],
    fov0: 40, fov1: 32,
    ease: 'whip',
    shake: 0.40,
    inside: true,
    trackNeon: true,
  },
  // ── MATCH CUT whip through glass → outside wide ──
  {
    id: 'matchCut',
    t0: 1.6, t1: 2.35,
    pos: [
      [0.38, 0.26, 0.10],
      [0.70, 0.48, 1.10],
      [0.25, 0.52, 2.35],
    ],
    look: [
      [0.22, 0.20, -0.04],
      [0.05, 0.20, 0.0],
      [0.0, 0.16, 0.0],
    ],
    fov0: 34, fov1: 32,
    ease: 'smooth',
    shake: 0.22,
    inside: false,
  },
  // ── Outside hero: whole glowing tank with room around it ──
  {
    id: 'outsideWide',
    t0: 2.35, t1: 6.4,
    pos: [
      [0.25, 0.52, 2.35],
      [-0.85, 0.48, 2.05],
      [-0.55, 0.42, 1.70],
      [0.10, 0.38, 1.45],
    ],
    look: [
      [0.0, 0.16, 0.0],
      [0.0, 0.18, 0.0],
      [0.02, 0.20, 0.0],
      [0.0, 0.22, 0.0],
    ],
    fov0: 32, fov1: 30,
    ease: 'smoother',
    shake: 0.07,
    inside: false,
  },
  // ── Crane up + PLUNGE through surface ──
  {
    id: 'plunge',
    t0: 6.4, t1: 8.6,
    pos: [
      [0.10, 0.38, 1.45],
      [0.0, 0.78, 0.70],
      [0.0, 0.58, 0.22],
      [0.02, 0.38, 0.04],
      [0.06, 0.20, 0.02],
    ],
    look: [
      [0.0, 0.22, 0.0],
      [0.0, 0.28, 0.0],
      [0.0, 0.26, -0.02],
      [0.08, 0.16, -0.04],
      [0.14, 0.10, -0.02],
    ],
    fov0: 30, fov1: 38,
    ease: 'plunge',
    shake: 0.30,
    inside: 'cross',
  },
  // ── Sand glide — raised camera, wider lateral corridor over caustics ──
  {
    id: 'sandGlide',
    t0: 8.6, t1: 12.2,
    pos: [
      [0.06, 0.22, 0.04],
      [0.20, 0.20, 0.10],
      [0.34, 0.19, 0.02],
      [0.18, 0.20, -0.08],
      [0.0, 0.22, -0.04],
    ],
    look: [
      [0.26, 0.10, -0.02],
      [0.40, 0.10, -0.02],
      [0.42, 0.12, -0.08],
      [0.12, 0.14, -0.12],
      [-0.12, 0.18, -0.06],
    ],
    fov0: 36, fov1: 32,
    ease: 'smoother',
    shake: 0.14,
    inside: true,
    fill: true,
  },
  // ── Angelfish close-up — lateral track ──
  {
    id: 'angel',
    t0: 12.2, t1: 15.2,
    pos: [
      [0.0, 0.20, -0.04],
      [0.18, 0.24, 0.12],
      [-0.02, 0.26, 0.14],
      [-0.18, 0.24, 0.06],
    ],
    look: [
      [-0.12, 0.16, -0.06],
      [0.02, 0.24, -0.02],
      [-0.14, 0.26, -0.04],
      [-0.28, 0.24, -0.02],
    ],
    fov0: 34, fov1: 30,
    ease: 'smooth',
    shake: 0.14,
    inside: true,
    trackAngel: true,
  },
  // ── Rise with bubbles → underside of surface ──
  {
    id: 'bubbleRise',
    t0: 15.2, t1: 18.4,
    pos: [
      [-0.18, 0.24, 0.06],
      [0.12, 0.22, -0.02],
      [0.22, 0.30, -0.10],
      [0.20, 0.350, -0.10],
    ],
    look: [
      [-0.28, 0.24, -0.02],
      [0.235, 0.32, -0.115],
      [0.235, 0.40, -0.115],
      [0.10, 0.41, -0.04],
    ],
    fov0: 32, fov1: 38,
    ease: 'smoother',
    shake: 0.16,
    inside: true,
  },
  // ── Feeding moment ──
  {
    id: 'feed',
    t0: 18.4, t1: 21.2,
    pos: [
      [0.20, 0.350, -0.10],
      [0.06, 0.30, 0.04],
      [-0.05, 0.26, 0.10],
      [0.08, 0.22, 0.12],
    ],
    look: [
      [0.10, 0.41, -0.04],
      [0.0, 0.38, 0.0],
      [0.0, 0.34, 0.02],
      [0.08, 0.24, 0.16],
    ],
    fov0: 38, fov1: 32,
    ease: 'smooth',
    shake: 0.16,
    inside: true,
  },
  // ── Glass tap / school burst ──
  {
    id: 'tap',
    t0: 21.2, t1: 24.0,
    pos: [
      [0.08, 0.22, 0.12],
      [0.0, 0.21, 0.04],
      [-0.16, 0.21, -0.02],
      [-0.28, 0.23, -0.06],
    ],
    look: [
      [0.08, 0.24, 0.16],
      [0.18, 0.22, 0.10],
      [0.24, 0.20, 0.02],
      [0.05, 0.18, -0.06],
    ],
    fov0: 34, fov1: 36,
    ease: 'smooth',
    shake: 0.30,
    inside: true,
  },
  // ── Finale: pull-back hero wide of whole tank + stand in the room ──
  {
    id: 'finale',
    t0: 24.0, t1: 28.0,
    pos: [
      [-0.28, 0.23, -0.06],
      [0.55, 0.42, 1.20],
      [0.20, 0.48, 2.10],
      [0.0, 0.50, 2.55],
    ],
    look: [
      [0.05, 0.18, -0.06],
      [0.0, 0.18, 0.0],
      [0.0, 0.14, 0.0],
      [0.0, 0.10, 0.0],
    ],
    fov0: 36, fov1: 30,
    ease: 'smoother',
    shake: 0.08,
    inside: false,
  },
];

/** Scripted sim events keyed to film time (seconds). */
const EVENTS = [
  { t: 7.55, type: 'ripple', x: 0.0, z: 0.0, strength: 1.6 },   // plunge splash
  { t: 7.62, type: 'ripple', x: 0.04, z: -0.03, strength: 0.9 },
  { t: 7.70, type: 'ripple', x: -0.03, z: 0.02, strength: 0.7 },
  { t: 18.85, type: 'feed', x: 0.02, z: 0.0, n: 16 },
  { t: 19.15, type: 'feed', x: -0.04, z: 0.03, n: 10 },
  { t: 21.55, type: 'tap', x: 0.05, y: 0.22, z: 0.20, strength: 1.15 },
  { t: 21.55, type: 'ripple', x: 0.05, z: 0.12, strength: 0.55 },
];

function shotEase(kind, u) {
  if (kind === 'whip') {
    // accelerate hard through middle third, ease out
    if (u < 0.15) return smootherstep(0, 0.15, u) * 0.08;
    if (u < 0.55) return 0.08 + smootherstep(0.15, 0.55, u) * 0.72;
    return 0.80 + smootherstep(0.55, 1, u) * 0.20;
  }
  if (kind === 'plunge') {
    // slow crane, then accelerate into the water
    if (u < 0.45) return smootherstep(0, 0.45, u) * 0.38;
    return 0.38 + smootherstep(0.45, 1, u) * 0.62;
  }
  if (kind === 'smoother') return smootherstep(0, 1, u);
  return smoothstep(0, 1, u);
}

function findShot(t) {
  for (const s of SHOTS) {
    if (t >= s.t0 && t < s.t1) return s;
  }
  return SHOTS[SHOTS.length - 1];
}

export function createCinematic({
  camera, controls, renderer, post, sys, update, clock,
}) {
  const _pos = new THREE.Vector3();
  const _look = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _shake = new THREE.Vector3();
  const _angelBias = new THREE.Vector3();

  let captureMode = true; // freeze RAF sim until warmup/seek (deterministic) or playLive()
  let warmed = false;
  let filmFrame = -1;       // last seeked film frame (-1 = none)
  let simStepsDone = 0;     // total fixed-dt steps since boot (warmup + film)
  let eventsFired = new Set();
  let liveStart = 0;
  let didSeek = false;

  // Hide every DOM overlay — no text / UI in the frame
  function hideUI() {
    for (const id of ['hint', 'snd', 'veil']) {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        el.style.opacity = '0';
        el.setAttribute('aria-hidden', 'true');
      }
    }
  }

  function unlockControls() {
    controls.enabled = false;
    controls.enableDamping = false;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minDistance = 0.01;
    controls.maxDistance = 40;
  }

  function applyNearFar() {
    camera.near = 0.012;
    camera.far = 40;
    camera.updateProjectionMatrix();
  }

  /** Raise / disable adaptive quality for capture fidelity. */
  function boostQuality() {
    window.__aqScale = 1;
    window.__cineNoAdapt = true;
    // Hide front-glass meniscus lines — they read as thin edge artifacts in cine.
    if (sys.water?.meniscus) sys.water.meniscus.visible = false;
    if (sys.water?.meniscus2) sys.water.meniscus2.visible = false;
    // gentle film push — slightly brighter for scroll-stop punch
    if (post?.photo?.uniforms) {
      post.photo.uniforms.uGrain.value = 0.026;
      post.photo.uniforms.uVig.value = 0.68;
      post.photo.uniforms.uCA.value = 0.0005;
    }
    if (post?.bloom) {
      post.bloom.strength = 0.27;
      post.bloom.threshold = 1.28;
    }
    if (sys.water?.rays?.mat?.uniforms?.uRayGain) {
      sys.water.rays.mat.uniforms.uRayGain.value = 1.15;
    }
    // Store base ambient so sand-glide fill can restore
    if (!boostQuality._amb) {
      const a = WU?.uAmbient?.value;
      boostQuality._amb = a ? a.clone() : null;
    }
  }

  function fireEvent(ev) {
    if (ev.type === 'ripple') {
      sys.water?.addRipple(ev.x, ev.z, ev.strength ?? 1);
    } else if (ev.type === 'feed') {
      sys.food?.drop(ev.x, ev.z, ev.n ?? 14);
    } else if (ev.type === 'tap') {
      const p = new THREE.Vector3(ev.x, ev.y, ev.z);
      sys.fish?.scare(p, ev.strength ?? 1);
    }
  }

  function processEvents(filmT) {
    for (let i = 0; i < EVENTS.length; i++) {
      const ev = EVENTS[i];
      if (filmT + 1e-6 >= ev.t && !eventsFired.has(i)) {
        eventsFired.add(i);
        fireEvent(ev);
      }
    }
  }

  function fishBias(out, key, pull = 0.4) {
    out.set(0, 0, 0);
    const list = sys.fish?.fishes;
    if (!list) return out;
    let best = null, bestD = 1e9;
    for (const f of list) {
      if (f.key !== key) continue;
      // Prefer fish ahead of / near the look direction
      const d = f.pos.distanceToSquared(_pos);
      if (d < bestD && d > 0.002) { bestD = d; best = f; }
    }
    if (best) {
      out.copy(best.pos).sub(_look).multiplyScalar(pull);
    }
    return out;
  }

  function angelLookBias(out) { return fishBias(out, 'angel', 0.35); }
  function neonLookBias(out) { return fishBias(out, 'neon', 0.55); }

  function handheld(filmT, amount, out) {
    // slow organic drift — deterministic from film time
    const a = filmT * 1.17;
    const b = filmT * 0.83 + 1.7;
    const c = filmT * 1.41 + 0.4;
    const s = 0.0018 * amount;
    out.set(
      Math.sin(a) * s + Math.sin(a * 2.3) * s * 0.35,
      Math.sin(b) * s * 0.7 + Math.cos(c) * s * 0.25,
      Math.cos(a * 0.9) * s * 0.55,
    );
    return out;
  }

  function evalCamera(filmT) {
    const shot = findShot(filmT);
    const uRaw = (filmT - shot.t0) / Math.max(1e-6, shot.t1 - shot.t0);
    const u = shotEase(shot.ease, THREE.MathUtils.clamp(uRaw, 0, 1));
    catmullRom(shot.pos, u, _pos);
    catmullRom(shot.look, u, _look);

    if (shot.trackAngel) {
      angelLookBias(_angelBias);
      _look.add(_angelBias);
    }
    if (shot.trackNeon) {
      neonLookBias(_angelBias);
      _look.add(_angelBias);
      // Nudge camera slightly toward school centroid so frame 0 isn't empty water
      if (filmT < 0.35) {
        const list = sys.fish?.fishes?.filter((f) => f.key === 'neon');
        if (list?.length) {
          let cx = 0, cy = 0, cz = 0;
          for (const f of list) { cx += f.pos.x; cy += f.pos.y; cz += f.pos.z; }
          const n = list.length;
          cx /= n; cy /= n; cz /= n;
          const k = (1 - filmT / 0.35) * 0.45;
          _pos.x = lerp(_pos.x, cx - 0.10, k * 0.5);
          _pos.y = lerp(_pos.y, cy + 0.01, k * 0.35);
          _pos.z = lerp(_pos.z, Math.min(cz + 0.12, 0.16), k * 0.5);
          _look.set(cx, cy, cz);
        }
      }
    }

    handheld(filmT, shot.shake ?? 0.1, _shake);
    _pos.add(_shake);
    // tiny look drift (half amplitude, opposite phase) so shake feels like handheld not float
    _look.x += _shake.x * 0.4;
    _look.y += _shake.y * 0.3;

    // Keep camera inside legal water / room bounds for inside shots
    if (shot.inside === true) {
      _pos.x = THREE.MathUtils.clamp(_pos.x, -0.45, 0.45);
      _pos.y = THREE.MathUtils.clamp(_pos.y, shot.fill ? 0.12 : 0.06, 0.40);
      _pos.z = THREE.MathUtils.clamp(_pos.z, -0.17, 0.17);
    }

    const fov = lerp(shot.fov0, shot.fov1, u);
    return { pos: _pos, look: _look, fov, shot };
  }

  function setCamera(filmT) {
    const { pos, look, fov, shot } = evalCamera(filmT);
    camera.position.copy(pos);
    camera.fov = fov;
    camera.near = 0.012;
    camera.updateProjectionMatrix();
    camera.up.copy(_up);
    camera.lookAt(look);
    controls.target.copy(look);

    // BackSide volume rays overdraw ~6× when the camera is inside the box — tame them.
    const inside =
      pos.x > -0.48 && pos.x < 0.48 &&
      pos.y > 0.02 && pos.y < 0.412 &&
      pos.z > -0.19 && pos.z < 0.19;
    if (sys.water?.rays?.mat?.uniforms?.uRayGain) {
      sys.water.rays.mat.uniforms.uRayGain.value = inside ? 0.20 : 1.15;
    }

    // Sand-glide fill: lift underwater ambient slightly so the floor isn't mud
    const amb = WU.uAmbient?.value;
    if (amb && boostQuality._amb) {
      if (shot.fill) {
        amb.set(
          boostQuality._amb.r * 1.55,
          boostQuality._amb.g * 1.60,
          boostQuality._amb.b * 1.55,
        );
      } else {
        amb.copy(boostQuality._amb);
      }
    }
  }

  const dtFixed = 1 / FPS;
  const warmupSteps = Math.round(WARMUP_SEC * FPS);
  const totalFilmFrames = Math.round(DURATION * FPS);

  /** Advance simulation by n fixed steps (shared path with main loop). */
  function stepSim(n) {
    for (let i = 0; i < n; i++) {
      update(dtFixed);
      simStepsDone++;
      const filmT = (simStepsDone - warmupSteps) * dtFixed;
      if (filmT >= 0) processEvents(filmT);
    }
  }

  function warmup() {
    if (warmed) return;
    hideUI();
    unlockControls();
    applyNearFar();
    boostQuality();
    // settle the tank before t=0
    stepSim(warmupSteps);
    warmed = true;
    filmFrame = -1;
  }

  /**
   * Deterministic seek: advances sim with fixed dt, sets camera, renders once.
   * Must be called in non-decreasing frame order (0,1,2,…). Seeking backward
   * requires a page reload.
   */
  function seek(frameIndex) {
    captureMode = true;
    didSeek = true;
    if (clock) clock.running = false;

    if (!warmed) warmup();

    const fi = Math.max(0, Math.min(totalFilmFrames - 1, frameIndex | 0));
    if (fi < filmFrame) {
      console.warn('[cine] seek() only supports forward seeks; reload to restart');
      return { ok: false, reason: 'backward' };
    }

    // film frame 0 == first frame after warmup; simStepsDone already = warmupSteps
    const targetSteps = warmupSteps + fi;
    const need = targetSteps - simStepsDone;
    if (need > 0) stepSim(need);

    const filmT = fi / FPS;
    processEvents(filmT);
    setCamera(filmT);

    const simTime = simStepsDone * dtFixed;
    post.render(dtFixed, simTime);
    filmFrame = fi;
    return { ok: true, t: filmT, frame: fi };
  }

  /** Live preview: unfreeze RAF and drive camera from wall clock. */
  function playLive() {
    if (!warmed) {
      // fast-forward warmup with fixed steps then play
      warmup();
    }
    captureMode = false;
    if (clock) { clock.running = true; clock.getDelta(); }
    liveStart = performance.now();
    // Align event cursor to t=0 of a fresh loop
    eventsFired = new Set();
  }

  /** Live preview driver (RAF path). Returns whether cine owns the camera. */
  function tickLive(simTime) {
    if (captureMode) return true; // seek owns everything
    if (!warmed) return false;
    const filmT = ((performance.now() - liveStart) / 1000) % DURATION;
    // Re-fire events each loop iteration by resetting set when wrapping
    const prev = tickLive._lastT ?? 0;
    if (filmT < prev - 1) eventsFired = new Set();
    tickLive._lastT = filmT;
    processEvents(filmT);
    setCamera(filmT);
    return true;
  }

  // ---- optional offline soundtrack (no speech) ----
  async function renderSoundtrack() {
    const sr = 44100;
    const len = Math.ceil(DURATION * sr);
    const offline = new OfflineAudioContext(2, len, sr);

    const master = offline.createGain();
    master.gain.value = 0.55;
    const comp = offline.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp); comp.connect(offline.destination);

    // brown-noise bed
    const noiseBuf = offline.createBuffer(1, sr * 4, sr);
    const nd = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < nd.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      nd[i] = last * 3.5;
    }
    const rumble = offline.createBufferSource();
    rumble.buffer = noiseBuf; rumble.loop = true;
    const rlp = offline.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 420;
    const rg = offline.createGain(); rg.gain.value = 0.055;
    rumble.connect(rlp); rlp.connect(rg); rg.connect(master);
    rumble.start(0);

    // motor hum
    const humG = offline.createGain(); humG.gain.value = 0.018;
    const mlp = offline.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 320;
    for (const [f, g] of [[100, 1], [100.7, 0.7], [200.3, 0.35]]) {
      const o = offline.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const og = offline.createGain(); og.gain.value = g;
      o.connect(og); og.connect(mlp); o.start(0); o.stop(DURATION + 0.1);
    }
    mlp.connect(humG); humG.connect(master);

    // trickle
    const white = offline.createBuffer(1, sr, sr);
    const wd = white.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    const trick = offline.createBufferSource();
    trick.buffer = white; trick.loop = true;
    const tbp = offline.createBiquadFilter(); tbp.type = 'bandpass'; tbp.frequency.value = 1600; tbp.Q.value = 1.3;
    const tg = offline.createGain(); tg.gain.value = 0.0035;
    trick.connect(tbp); tbp.connect(tg); tg.connect(master);
    trick.start(0);

    // plunge whoosh ~7.5s
    {
      const t0 = 7.35;
      const src = offline.createBufferSource();
      src.buffer = white;
      const bp = offline.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.7;
      const g = offline.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
      bp.frequency.setValueAtTime(280, t0);
      bp.frequency.exponentialRampToValueAtTime(1800, t0 + 0.55);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + 1.2);
    }

    // glass tap ~21.55s
    {
      const t0 = 21.55;
      const click = offline.createBufferSource();
      click.buffer = white;
      const hp = offline.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
      const g = offline.createGain();
      g.gain.setValueAtTime(0.35, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
      click.connect(hp); hp.connect(g); g.connect(master);
      click.start(t0); click.stop(t0 + 0.05);
      for (const [f0, dur, peak] of [[1600, 0.14, 0.08], [3700, 0.08, 0.04], [180, 0.12, 0.22]]) {
        const o = offline.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(f0, t0);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.96, t0 + dur);
        const og = offline.createGain();
        og.gain.setValueAtTime(0.0001, t0);
        og.gain.linearRampToValueAtTime(peak, t0 + 0.002);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(og); og.connect(master);
        o.start(t0); o.stop(t0 + dur + 0.05);
      }
    }

    // sparse bubble bloops
    for (let i = 0; i < 40; i++) {
      const t0 = 1.5 + Math.random() * (DURATION - 2.5);
      const f0 = 900 + Math.random() * 2200;
      const o = offline.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.4, t0 + 0.05);
      const g = offline.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.025 + Math.random() * 0.02, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + 0.08);
    }

    // fade in / out
    master.gain.setValueAtTime(0.0001, 0);
    master.gain.linearRampToValueAtTime(0.55, 1.2);
    master.gain.setValueAtTime(0.55, DURATION - 1.4);
    master.gain.linearRampToValueAtTime(0.0001, DURATION);

    const rendered = await offline.startRendering();
    return bufferToWav(rendered);
  }

  function bufferToWav(audioBuffer) {
    const numCh = audioBuffer.numberOfChannels;
    const sr = audioBuffer.sampleRate;
    const samples = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = samples * blockAlign;
    const buf = new ArrayBuffer(44 + dataSize);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, numCh, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * blockAlign, true);
    v.setUint16(32, blockAlign, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, dataSize, true);
    const chans = [];
    for (let c = 0; c < numCh; c++) chans.push(audioBuffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < samples; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = Math.max(-1, Math.min(1, chans[c][i]));
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return buf;
  }

  // Kick UI hide immediately so first painted frame has no overlays
  hideUI();
  unlockControls();
  applyNearFar();
  boostQuality();

  return {
    duration: DURATION,
    fps: FPS,
    totalFrames: totalFilmFrames,
    warmupSec: WARMUP_SEC,
    isCapture: () => captureMode,
    enterCapture() { captureMode = true; if (clock) clock.running = false; },
    playLive,
    warmup,
    seek,
    tickLive,
    setCamera,
    renderSoundtrack,
    hideUI,
    evalCamera,
    shots: SHOTS,
    events: EVENTS,
  };
}
