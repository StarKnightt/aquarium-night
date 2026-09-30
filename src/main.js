import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Q, isDebug, isCine } from './core/quality.js';
import { WU } from './core/waterPatch.js';
import { createRoom } from './systems/room.js';
import { createPost } from './systems/post.js';
import { createWater } from './systems/water.js';
import { createScenery } from './systems/scenery.js';
import { createFood } from './systems/food.js';
import { createFish } from './systems/fish.js';
import { createBubbles } from './systems/bubbles.js';
import { createAudio } from './systems/audio.js';
import { createInteraction, createEventBus } from './systems/interaction.js';
import { createCinematic } from './systems/cinematic.js';
import { createExplore } from './systems/explore.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: isDebug });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = isCine ? 0.92 : 0.84;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.setClearColor(0x000000, 1);

const wantExplore = new URLSearchParams(location.search).has('explore');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, isCine ? 0.012 : 0.03, 40);

// ---- systems (each added in its own gauntlet stage)
const sys = {};
console.log('boot: creating room'); const _t0 = performance.now(); sys.room = createRoom(scene, renderer); console.log('boot: room ok', Math.round(performance.now() - _t0));
sys.water = createWater(scene, renderer);
sys.scenery = createScenery(scene);
const audio = createAudio();
const onSim = (type, d) => {
  if (type === 'drop') audio.drop({ x: d.x });
  else if (type === 'eat') audio.eat({ x: d.x });
  else if (type === 'bubble') audio.bubble({ x: d.x, r: d.r });
  else if (type === 'pop') audio.pop({ x: d.x, r: d.r });
};
sys.food = createFood(scene, { water: sys.water, onEvent: onSim });
sys.fish = createFish(scene, { scenery: sys.scenery, food: sys.food, water: sys.water, onEvent: onSim });
sys.bubbles = createBubbles(scene, { water: sys.water, onEvent: onSim });

// depth-aware god rays: half-res occlusion from sand/rocks/plants/fish bodies
{
  const occ = [];
  if (sys.scenery?.sand) occ.push(sys.scenery.sand);
  if (sys.scenery?.plants) occ.push(sys.scenery.plants);
  sys.scenery?.group?.traverse((o) => {
    if (o.isMesh && o !== sys.scenery.sand && o !== sys.scenery.plants && o.geometry && !o.material?.transparent) occ.push(o);
  });
  for (const k in sys.fish.species) occ.push(sys.fish.species[k].bodyMesh);
  sys.water.setRayOccluders(occ);
}

// ---- camera + orbit (slight orbit only)
const target = new THREE.Vector3(0, 0.2, 0);
const ORBIT = {
  minAz: -0.62, maxAz: 0.62,
  minPol: 0.8, maxPol: 1.32,
  rotateSpeed: 0.45, zoomSpeed: 0.5, damping: 0.06,
};
const controls = new OrbitControls(camera, canvas);
controls.target.copy(target);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = ORBIT.damping;
controls.rotateSpeed = ORBIT.rotateSpeed;
controls.minAzimuthAngle = ORBIT.minAz;
controls.maxAzimuthAngle = ORBIT.maxAz;
controls.minPolarAngle = ORBIT.minPol;
controls.maxPolarAngle = ORBIT.maxPol;
controls.zoomSpeed = ORBIT.zoomSpeed;
controls.enableZoom = true;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
// OrbitControls sets touch-action; reinforce so phones don't scroll/zoom the page
canvas.style.touchAction = 'none';

function applyOrbitLimits() {
  controls.minAzimuthAngle = ORBIT.minAz;
  controls.maxAzimuthAngle = ORBIT.maxAz;
  controls.minPolarAngle = ORBIT.minPol;
  controls.maxPolarAngle = ORBIT.maxPol;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = ORBIT.damping;
  controls.rotateSpeed = ORBIT.rotateSpeed;
  controls.zoomSpeed = ORBIT.zoomSpeed;
}

const post = createPost(renderer, scene, camera); console.log('boot: post ok');
// Keep DoF focus locked to the orbit look-at (tank centre by default; updated by setCam)
post.focusPoint.copy(target);

let explore = null;
let baseDist = 1.4;
function frameCamera(keepAngles = false) {
  const aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  camera.fov = aspect < 1 ? 46 : 32;
  camera.updateProjectionMatrix();
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const needW = 1.18;
  const dW = needW / (2 * Math.tan(vfov / 2) * aspect);
  const dH = 0.95 / (2 * Math.tan(vfov / 2));
  baseDist = Math.max(dW, dH, 1.1);
  controls.minDistance = baseDist * 0.7;
  controls.maxDistance = baseDist * 1.2;
  // Re-assert angle clamps unless a free setCam unlocked them (Infinity)
  if (Number.isFinite(controls.minAzimuthAngle)) applyOrbitLimits();
  if (!keepAngles) {
    const polar = 1.18, az = 0;
    camera.position.set(
      target.x + baseDist * Math.sin(polar) * Math.sin(az),
      target.y + baseDist * Math.cos(polar),
      target.z + baseDist * Math.sin(polar) * Math.cos(az)
    );
  }
  controls.update();
}

function resize() {
  // Cinematic capture locks DPR=1 so the canvas pixel size matches the viewport exactly.
  const pr = isCine ? 1 : Math.min(devicePixelRatio || 1, Q.maxDPR) * (window.__aqScale || 1);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize(innerWidth, innerHeight, pr);
  if (!isCine && !(explore?.active || explore?.restoring)) frameCamera(true);
  else if (!isCine) {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  } else {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  sys.water?.resize?.(pr, innerWidth, innerHeight);
}
if (!isCine) frameCamera(false);
resize();
addEventListener('resize', resize);

// Block page pinch-zoom / gesture scroll outside the canvas handlers
addEventListener('gesturestart', (e) => e.preventDefault());
addEventListener('gesturechange', (e) => e.preventDefault());

// ---- interaction (tap feed / glass scare; drag left to OrbitControls) — disabled in cine mode
const events = createEventBus();
if (!isCine) {
  sys.interaction = createInteraction({ canvas, camera, controls, sys, events });
  events.on('tap', ({ point }) => { if (point.y < 0.41) audio.tap({ x: point.x, strength: 1 }); });
}
const sndBtn = document.getElementById('snd');
const setSndIcon = () => {
  document.getElementById('snd-on').style.display = audio.muted ? 'none' : '';
  document.getElementById('snd-off').style.display = audio.muted ? '' : 'none';
};
if (!isCine) {
  const kick = () => { audio.start(); audio.resume(); };
  addEventListener('pointerdown', kick, { once: false, passive: true });
  addEventListener('keydown', kick, { passive: true });
  sndBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  sndBtn.addEventListener('click', () => { if (!audio.started) audio.start(); audio.resume(); audio.setMuted(!audio.muted); setSndIcon(); });
}
window.__audio = audio;

// ---- explore mode (free-fly in/out of tank)
function getHomePose() {
  const aspect = innerWidth / innerHeight;
  const fov = aspect < 1 ? 46 : 32;
  const vfov = THREE.MathUtils.degToRad(fov);
  const needW = 1.18;
  const dW = needW / (2 * Math.tan(vfov / 2) * aspect);
  const dH = 0.95 / (2 * Math.tan(vfov / 2));
  const dist = Math.max(dW, dH, 1.1);
  const polar = 1.18, az = 0;
  return {
    pos: [
      target.x + dist * Math.sin(polar) * Math.sin(az),
      target.y + dist * Math.cos(polar),
      target.z + dist * Math.sin(polar) * Math.cos(az),
    ],
    look: target.toArray(),
    fov,
  };
}

if (!isCine) {
  explore = createExplore({
    canvas, camera, controls, sys, events, audio,
    getHomePose,
    onRestored() {
      applyOrbitLimits();
      sys.interaction?.setEnabled(true);
    },
  });
  const exploreBtn = document.getElementById('explore');
  exploreBtn?.addEventListener('pointerdown', (e) => e.stopPropagation());
  exploreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = !(explore.active || explore.restoring);
    explore.setActive(next);
    sys.interaction?.setEnabled(!next);
    if (!next) applyOrbitLimits();
  });
  if (wantExplore) {
    requestAnimationFrame(() => {
      explore.setActive(true);
      sys.interaction?.setEnabled(false);
    });
  }
} else {
  const el = document.getElementById('explore');
  if (el) { el.style.display = 'none'; el.style.opacity = '0'; }
}

// ---- adaptive resolution scaler (keeps phones smooth; never below 0.6) — off in cine
window.__aqScale = window.__aqScale || 1;
let _ftSum = 0, _ftN = 0, _ftLast = performance.now(), _scaleCool = 0;
function adaptScale(now) {
  if (isCine || window.__cineNoAdapt) return;
  const ft = now - _ftLast;
  _ftLast = now;
  if (ft <= 0 || ft > 120) return;
  _ftSum += ft;
  _ftN++;
  _scaleCool -= ft;
  if (_ftN < 45 || _scaleCool > 0) return; // ~0.75s of samples
  const avg = _ftSum / _ftN;
  _ftSum = 0;
  _ftN = 0;
  const cur = window.__aqScale || 1;
  let next = cur;
  if (avg > 24 && cur > 0.6) next = Math.max(0.6, cur * 0.88);
  else if (avg < 12 && cur < 1) next = Math.min(1, cur * 1.04);
  if (Math.abs(next - cur) > 0.01) {
    window.__aqScale = next;
    _scaleCool = 900;
    resize();
  }
}

// ---- loop
const clock = new THREE.Clock();
let simTime = 0;
function update(dt) {
  simTime += dt;
  WU.uTime.value = simTime;
  for (const k in sys) sys[k].update?.(dt, simTime);
}

// Cinematic mode (?cine=1): scripted camera, no UI, deterministic seek API
let cine = null;
if (isCine) {
  cine = createCinematic({ camera, controls, renderer, post, sys, update, clock });
  window.__cine = {
    duration: cine.duration,
    fps: cine.fps,
    totalFrames: cine.totalFrames,
    warmupSec: cine.warmupSec,
    seek: (i) => cine.seek(i),
    warmup: () => cine.warmup(),
    playLive: () => cine.playLive(),
    renderSoundtrack: () => cine.renderSoundtrack(),
    ready: true,
  };
  // Auto live-preview when opened in a browser (not driven by seek within 2s)
  setTimeout(() => {
    if (cine && !cine.isCapture?.() === false) { /* noop guard */ }
    // If still frozen and no seek happened, start live loop for human preview
    if (cine && cine.isCapture() && !window.__cine._seeked) {
      // keep frozen for harness — recording always calls warmup/seek first
      // For human: ?cine=1&live=1
      if (new URLSearchParams(location.search).has('live')) cine.playLive();
    }
  }, 100);
}

let dbgQuad = null;
function frame() {
  if (cine?.isCapture()) {
    // Deterministic capture owns sim + render via __cine.seek — skip RAF work.
    requestAnimationFrame(frame);
    return;
  }
  const now = performance.now();
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  if (cine) cine.tickLive(simTime);
  else if (explore && (explore.active || explore.restoring)) explore.update(dt);
  else controls.update();
  if (window.__aqDbg === 'caustics') {
    if (!dbgQuad) {
      dbgQuad = { scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
      dbgQuad.mat = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){vUv=uv*2.0; gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; gl_FragColor = vec4(pow(c*0.5, vec3(1.0/2.2)),1.0);}' });
      dbgQuad.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dbgQuad.mat));
    }
    dbgQuad.mat.uniforms.t.value = sys.water.caustics.rt.texture;
    renderer.setRenderTarget(null); renderer.render(dbgQuad.scene, dbgQuad.cam);
  } else {
    sys.water?.updateRayOcclusion?.(camera);
    post.render(dt, simTime);
  }
  adaptScale(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (!isCine) {
  const veil = document.getElementById('veil');
  setTimeout(() => { veil.style.opacity = 0; }, 300);
  setTimeout(() => { veil.style.display = 'none'; }, 2600);
  setTimeout(() => { document.getElementById('hint').style.opacity = 0; }, 9000);
} else {
  // Cine: kill overlays immediately (no fade text)
  for (const id of ['hint', 'snd', 'explore', 'veil']) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.style.opacity = '0'; }
  }
}
// Shot harness: hide UI chrome so stills look like photographs
if (isDebug && !isCine) {
  for (const id of ['hint', 'snd', 'explore', 'veil']) {
    const el = document.getElementById(id);
    if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; }
  }
}

// ---- debug/screenshot API (used by the critic harness; harmless in production)
window.__aqU = WU;
window.__aq = {
  ready: true, scene, camera, controls, renderer, sys, events, explore,
  defaultCam: { pos: camera.position.toArray(), look: target.toArray() },
  applyOrbitLimits,
  setExplore(on) {
    if (!explore) return false;
    const next = !!on;
    explore.setActive(next);
    sys.interaction?.setEnabled(!next);
    if (!next) applyOrbitLimits();
    return explore.active;
  },
  setCam(pos, look) {
    // Unlock clamps so harness can place arbitrary views; call applyOrbitLimits() to restore.
    if (explore?.active) {
      explore.setActive(false, { instant: true });
      sys.interaction?.setEnabled(true);
    }
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minDistance = 0.05;
    controls.maxDistance = 20;
    camera.position.set(...pos);
    controls.target.set(...look);
    post.focusPoint.set(...look);
    controls.update();
  },
  advance(seconds, step = 1 / 30) {
    for (let t = 0; t < seconds; t += step) update(step);
  },
};
