import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Q, isDebug } from './core/quality.js';
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

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: isDebug });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.03, 40);

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
  const pr = Math.min(devicePixelRatio || 1, Q.maxDPR) * (window.__aqScale || 1);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize(innerWidth, innerHeight, pr);
  frameCamera(true);
}
frameCamera(false);
resize();
addEventListener('resize', resize);

// Block page pinch-zoom / gesture scroll outside the canvas handlers
addEventListener('gesturestart', (e) => e.preventDefault());
addEventListener('gesturechange', (e) => e.preventDefault());

// ---- interaction (tap feed / glass scare; drag left to OrbitControls)
const events = createEventBus();
sys.interaction = createInteraction({ canvas, camera, controls, sys, events });

// ---- sound: starts on the first user gesture (browser autoplay rules), tap on glass = tiny knock
events.on('tap', ({ point }) => { if (point.y < 0.41) audio.tap({ x: point.x, strength: 1 }); });
const sndBtn = document.getElementById('snd');
const setSndIcon = () => {
  document.getElementById('snd-on').style.display = audio.muted ? 'none' : '';
  document.getElementById('snd-off').style.display = audio.muted ? '' : 'none';
};
const kick = () => { audio.start(); audio.resume(); };
addEventListener('pointerdown', kick, { once: false, passive: true });
addEventListener('keydown', kick, { passive: true });
sndBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
sndBtn.addEventListener('click', () => { if (!audio.started) audio.start(); audio.resume(); audio.setMuted(!audio.muted); setSndIcon(); });
window.__audio = audio;

// ---- adaptive resolution scaler (keeps phones smooth; never below 0.6)
window.__aqScale = window.__aqScale || 1;
let _ftSum = 0, _ftN = 0, _ftLast = performance.now(), _scaleCool = 0;
function adaptScale(now) {
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
let dbgQuad = null;
function frame() {
  const now = performance.now();
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  controls.update();
  if (window.__aqDbg === 'caustics') {
    if (!dbgQuad) {
      dbgQuad = { scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
      dbgQuad.mat = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){vUv=uv*2.0; gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; gl_FragColor = vec4(pow(c*0.5, vec3(1.0/2.2)),1.0);}' });
      dbgQuad.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dbgQuad.mat));
    }
    dbgQuad.mat.uniforms.t.value = sys.water.caustics.rt.texture;
    renderer.setRenderTarget(null); renderer.render(dbgQuad.scene, dbgQuad.cam);
  } else post.render(dt, simTime);
  adaptScale(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const veil = document.getElementById('veil');
setTimeout(() => { veil.style.opacity = 0; }, 300);
setTimeout(() => { veil.style.display = 'none'; }, 2600);
setTimeout(() => { document.getElementById('hint').style.opacity = 0; }, 9000);

// ---- debug/screenshot API (used by the critic harness; harmless in production)
window.__aqU = WU;
window.__aq = {
  ready: true, scene, camera, controls, renderer, sys, events,
  defaultCam: { pos: camera.position.toArray(), look: target.toArray() },
  applyOrbitLimits,
  setCam(pos, look) {
    // Unlock clamps so harness can place arbitrary views; call applyOrbitLimits() to restore.
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minDistance = 0.05;
    controls.maxDistance = 20;
    camera.position.set(...pos);
    controls.target.set(...look);
    controls.update();
  },
  advance(seconds, step = 1 / 30) {
    for (let t = 0; t < seconds; t += step) update(step);
  },
};
