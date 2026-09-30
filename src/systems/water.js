import * as THREE from 'three';
import { TANK, WU } from '../core/waterPatch.js';
import { ENV_GLSL } from '../core/envGLSL.js';
import { mulberry32 } from '../core/noise.js';
import { Q } from '../core/quality.js';

// ---------------------------------------------------------------------------------------------
// Caustics: physically motivated. A tileable heightfield of travelling waves is analysed for its
// Hessian; light focuses where det(I + d*H) -> 0. Rendered to a small mip-mapped RT every frame and
// sampled by every material under the water (sand, rocks, plants, fish) and by the god-ray march.
// ---------------------------------------------------------------------------------------------
const NW = 16;
function makeCausticRT(size) {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    generateMipmaps: true,
    depthBuffer: false,
  });
  rt.texture.anisotropy = 4;
  return rt;
}

function createCaustics(renderer) {
  const rnd = mulberry32(99);
  const K = [], C = [], Wv = [], Ph = [];
  for (let i = 0; i < NW; i++) {
    let ix, iy;
    do { ix = Math.round((rnd() * 2 - 1) * 12); iy = Math.round((rnd() * 2 - 1) * 12); } while ((ix === 0 && iy === 0) || ix * ix + iy * iy > 150 || ix * ix + iy * iy < 6);
    const m = Math.hypot(ix, iy);
    K.push(new THREE.Vector2(ix, iy));
    C.push((0.28 + rnd() * 0.22) * (1.0 + 2.4 / m));   // sharper focusing filaments
    Wv.push(0.42 * Math.sqrt(m) * (0.55 + rnd() * 0.7)); // slower, more natural drift
    Ph.push(rnd() * 6.283);
  }
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uK: { value: K }, uC: { value: C }, uW: { value: Wv }, uP: { value: Ph },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      #define NW ${NW}
      uniform float uTime; uniform vec2 uK[NW]; uniform float uC[NW]; uniform float uW[NW]; uniform float uP[NW];
      varying vec2 vUv;
      void main() {
        float hxx = 0.0, hyy = 0.0, hxy = 0.0;
        for (int i = 0; i < NW; i++) {
          vec2 k = uK[i];
          float arg = 6.2831853 * dot(k, vUv) + uW[i] * uTime + uP[i];
          float s = sin(arg) * uC[i];
          vec2 n = normalize(k);
          hxx -= s * n.x * n.x; hyy -= s * n.y * n.y; hxy -= s * n.x * n.y;
        }
        vec3 out3;
        for (int ch = 0; ch < 3; ch++) {
          float d = 1.0 + 0.025 * float(ch);            // slight dispersion per channel
          float det = (1.0 + d * hxx) * (1.0 + d * hyy) - d * d * hxy * hxy;
          float I = 1.0 / (abs(det) + 0.040);
          out3[ch] = I;
        }
        out3 = pow(out3 * 0.048, vec3(1.75));
        out3 = max(out3 - 0.04, 0.0);
        out3 = out3 / (1.0 + out3 * 0.16);
        gl_FragColor = vec4(out3, 1.0);
      }`,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rt = makeCausticRT(Q.causticRes);
  WU.uCaust.value = rt.texture;
  let acc = 0;
  return {
    rt,
    update(dt, t) {
      mat.uniforms.uTime.value = t;
      const prev = renderer.getRenderTarget();
      const prevXR = renderer.xr.enabled;
      renderer.xr.enabled = false;
      const ac = renderer.autoClear; renderer.autoClear = true;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
      renderer.autoClear = ac; renderer.xr.enabled = prevXR;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Water surface: transparent sheet, Fresnel reflection of room + a positional mirror of the light bar
// ---------------------------------------------------------------------------------------------
function createSurface() {
  const geo = new THREE.PlaneGeometry(TANK.iw * 2, TANK.id * 2, 4, 2);
  geo.rotateX(-Math.PI / 2);
  const ripples = [];
  for (let i = 0; i < 8; i++) ripples.push(new THREE.Vector4(0, 0, -100, 0));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uTime: WU.uTime, uRip: { value: ripples }, uCaust: WU.uCaust },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      varying vec3 vW; uniform float uTime; uniform vec4 uRip[8]; uniform sampler2D uCaust;
      ${ENV_GLSL}
      // gradient of the surface height field: gentler filter-flow chop + travelling ripples
      vec2 waveGrad(vec2 p, float t) {
        vec2 g = vec2(0.0);
        vec2 d0 = normalize(vec2(0.18, 1.0));  g += d0 * 0.00055 * 28.0 * cos(dot(d0, p) * 28.0 + t * 1.05 + sin(p.x * 5.0) * 1.0);
        vec2 d1 = normalize(vec2(-0.25, 1.0)); g += d1 * 0.00035 * 48.0 * cos(dot(d1, p) * 48.0 - t * 1.45 + 1.3 + sin(p.x * 9.0) * 1.2);
        vec2 d2 = normalize(vec2(0.35, -1.0)); g += d2 * 0.00022 * 72.0 * cos(dot(d2, p) * 72.0 + t * 1.9 + 2.1);
        vec2 d3 = normalize(vec2(-1.0, -0.15)); g += d3 * 0.00012 * 100.0 * cos(dot(d3, p) * 100.0 - t * 2.5);
        // anisotropic micro-streaks along filter flow
        float flow = smoothstep(0.05, 0.55, p.x);
        g += vec2(1.0, 0.15) * flow * 0.006 * cos(p.x * 160.0 - t * 4.2 + sin(p.y * 30.0) * 1.5);
        for (int i = 0; i < 8; i++) {
          vec4 r = uRip[i];
          float age = t - r.z;
          if (age > 0.0 && age < 5.0) {
            vec2 dv = p - r.xy; float rad = length(dv) + 1e-4;
            float front = age * 0.085;
            float x = (rad - front) * 85.0;
            float env = exp(-x * x * 0.05) * exp(-age * 0.65) * r.w;
            g += (dv / rad) * cos(x) * env * 0.038;
          }
        }
        return g;
      }
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec2 g = waveGrad(vW.xz, uTime);
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        bool below = V.y < 0.0;
        if (below) N = -N;
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 col; float a;
        if (!below) {
          vec3 R = reflect(-V, N);
          vec3 env = roomEnv(R) * vec3(0.34);   // lamps/windows only as faint sheen on a water surface
          // positional mirror of the LED bar — slightly stronger, softer edges, wave-broken ribbon
          float tt = (0.512 - vW.y) / max(R.y, 0.02);
          vec3 hit = vW + R * tt;
          float bx = abs(hit.x) / 0.41, bz = abs(hit.z + 0.06) / 0.032;
          float softX = smoothstep(1.22, 0.55, bx);
          float softZ = smoothstep(1.75, 0.05, bz);
          // broken ribbon: multi-frequency nulls so the bar reads as shimmering segments
          float chop = abs(sin(hit.x * 78.0 + g.x * 160.0 + uTime * 0.85));
          chop *= 0.55 + 0.45 * abs(sin(hit.x * 31.0 - hit.z * 40.0 + g.y * 90.0));
          chop = smoothstep(0.12, 0.85, chop);
          float bar = softX * softZ * chop * step(0.0, R.y);
          env += vec3(0.92, 0.98, 1.22) * 2.2 * bar;
          // faint meniscus darkening near the glass walls
          float edgeX = 0.49 - abs(vW.x);
          float edgeZ = 0.20 - abs(vW.z);
          float meniscus = (1.0 - smoothstep(0.0, 0.055, min(edgeX, edgeZ))) * 0.28;
          // subtle darker refraction band along the far (back) edge
          float farBand = smoothstep(0.0, -0.16, vW.z) * (1.0 - F) * 0.18;
          // softer surface: tone down contrast of env, add film
          col = env * F * 0.85 + vec3(0.006, 0.028, 0.038) * (1.0 - F) * 0.85;
          col += vec3(0.02, 0.04, 0.055) * (1.0 - F) * 0.15; // thin surface film
          col -= vec3(0.010, 0.016, 0.020) * meniscus;
          col -= vec3(0.008, 0.018, 0.024) * farBand;
          a = clamp(F * 0.85 + 0.055 + meniscus * 0.10, 0.0, 0.92);
        } else {
          // seen from below: near mirror (total internal reflection) of the tank interior -> dark teal
          col = vec3(0.012, 0.055, 0.072) * (0.6 + 0.4 * ndv) + vec3(0.9, 1.0, 1.2) * 0.02 * pow(ndv, 8.0);
          a = clamp(0.35 + 0.65 * (1.0 - ndv), 0.0, 0.95);
        }
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, TANK.surfaceY, 0);
  mesh.renderOrder = 3;
  let ri = 0;
  return {
    mesh,
    addRipple(x, z, strength = 1) {
      ripples[ri].set(x, z, WU.uTime.value, strength);
      ri = (ri + 1) % ripples.length;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Volumetric light: ray-march the water volume (back faces, depth tested) summing light that comes
// down through the surface, modulated by the animated caustic pattern -> soft moving shafts.
// ---------------------------------------------------------------------------------------------
function createRays() {
  const size = new THREE.Vector3().subVectors(WU.uBoxMax.value, WU.uBoxMin.value);
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
  geo.translate(0, WU.uBoxMin.value.y + size.y / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: { ...WU, uSteps: { value: Q.rayBands }, uRayGain: { value: 1.35 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      varying vec3 vW;
      uniform sampler2D uCaust; uniform vec3 uBoxMin, uBoxMax, uAbsorb, uScatter; uniform float uSteps, uRayGain, uTime;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 ro = cameraPosition;
        vec3 rd = vW - ro;
        vec3 inv = 1.0 / (rd + vec3(1e-6));
        vec3 t0 = (uBoxMin - ro) * inv, t1 = (uBoxMax - ro) * inv;
        vec3 tmin = min(t0, t1);
        float te = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
        float tx = 1.0;
        float L = length(rd);
        float dt = (tx - te) / uSteps;
        float jit = hash(gl_FragCoord.xy + uTime);
        vec3 acc = vec3(0.0);
        float trans = 1.0;
        // sparse shaft mask: noise-modulated vertical bands tied to caustic pattern
        for (float i = 0.0; i < 20.0; i++) {
          if (i >= uSteps) break;
          float t = te + (i + jit) * dt;
          vec3 p = ro + rd * t;
          float depth = max(uBoxMax.y - p.y, 0.0);
          vec2 uv = p.xz * 2.0 + vec2(0.13, 0.31) + vec2(p.y * 0.05, 0.0);
          float sh = textureLod(uCaust, vec2(uv.x * 0.7, uv.y * 0.15), 2.0).g;
          float sh2 = textureLod(uCaust, vec2(uv.x * 0.37 + 0.31, uv.y * 0.10), 1.4).g;
          float shafts = pow(clamp(sh * 0.55 + sh2 * 0.45, 0.0, 3.0), 2.4);
          // noise sparsity so shafts aren't a uniform fog slab
          float sparse = smoothstep(0.35, 0.85, hash(floor(p.xz * 14.0) + floor(uTime * 0.4)));
          shafts *= 0.45 + 0.55 * sparse;
          float foot = smoothstep(0.55, 0.05, abs(p.x)) * 0.4 + 0.6;
          float zf = smoothstep(0.24, -0.18, p.z) * 0.35 + 0.65;
          float lightAmt = exp(-depth * 2.0) * foot * zf;
          // mild backscatter haze increasing toward far glass
          float farHaze = smoothstep(0.05, -0.18, p.z) * 0.35;
          acc += trans * uScatter * lightAmt * (0.06 + farHaze + 3.4 * shafts) * dt * L;
          trans *= exp(-dot(uAbsorb, vec3(0.33)) * dt * L * 0.55);
        }
        gl_FragColor = vec4(acc * uRayGain * 0.62, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return { mesh, mat };
}

// ---------------------------------------------------------------------------------------------
// Suspended particulate ("marine snow" / micro-debris) catching the light
// ---------------------------------------------------------------------------------------------
function createParticles() {
  const n = Q.particles;
  const rnd = mulberry32(5150);
  const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pos.set([(rnd() * 2 - 1) * TANK.iw, TANK.waterMinY + rnd() * (TANK.surfaceY - TANK.waterMinY), (rnd() * 2 - 1) * TANK.id], i * 3);
    seed.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...WU, uPx: { value: 1.0 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; varying float vA; varying vec3 vWp;
      uniform float uTime, uPx; uniform vec3 uBoxMin, uBoxMax; uniform sampler2D uCaust;
      void main() {
        vec3 p = position;
        float t = uTime;
        p.x += sin(t * (0.05 + aSeed.x * 0.09) + aSeed.y * 40.0) * 0.045 + sin(t * 0.021 + aSeed.w * 30.0) * 0.03;
        p.z += cos(t * (0.04 + aSeed.y * 0.08) + aSeed.z * 40.0) * 0.03;
        float hgt = uBoxMax.y - uBoxMin.y;
        p.y = uBoxMin.y + mod(p.y - uBoxMin.y - t * (0.0035 + aSeed.z * 0.006) + hgt * 8.0, hgt);
        vWp = p;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = clamp((0.0009 + aSeed.w * aSeed.w * 0.0034) * uPx * 900.0 / dist, 1.0, 5.0);
        float depth = uBoxMax.y - p.y;
        float shaft = textureLod(uCaust, vec2(p.x * 1.4 + 0.13, p.y * 0.1 + p.z * 0.2), 1.8).g;
        float lightAmt = exp(-depth * 1.8) * (0.25 + 1.4 * pow(clamp(shaft, 0.0, 2.0), 1.7));
        float tw = 0.6 + 0.4 * sin(t * (0.6 + aSeed.x * 1.5) + aSeed.z * 60.0);
        // fade near glass faces so they do not pop
        float edge = smoothstep(0.0, 0.05, min(uBoxMax.x - abs(p.x), uBoxMax.z - abs(p.z)));
        vA = lightAmt * tw * edge * (0.25 + 0.75 * aSeed.y);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying vec3 vWp;
      uniform vec3 uBoxMin, uBoxMax, uAbsorb;
      void main() {
        vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
        float m = smoothstep(1.0, 0.0, d); m *= m;
        vec3 ro = cameraPosition; float len = distance(ro, vWp) * 0.6;
        vec3 T = exp(-uAbsorb * len * 0.5);
        gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * T * m * vA * 0.6, 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 2;
  return { pts, mat };
}

export function createWater(scene, renderer) {
  const caustics = createCaustics(renderer);
  const surface = createSurface();
  const rays = createRays();
  const particles = createParticles();

  // thin meniscus line where water climbs the front glass
  const meniscus = new THREE.Mesh(
    new THREE.PlaneGeometry(TANK.iw * 2, 0.0035),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.40, 0.55, 0.70), transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  );
  meniscus.position.set(0, TANK.surfaceY - 0.0015, TANK.id + 0.0004);
  const meniscus2 = meniscus.clone();
  meniscus2.material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
  meniscus2.position.y -= 0.0032; meniscus2.scale.y = 1.4; meniscus2.renderOrder = 4;
  meniscus.renderOrder = 4;

  scene.add(surface.mesh, rays.mesh, particles.pts, meniscus, meniscus2);
  return {
    surface, rays, particles, caustics,
    meniscus, meniscus2,
    addRipple: surface.addRipple,
    resize(pxRatio) { particles.mat.uniforms.uPx.value = pxRatio; },
    update(dt, t) { caustics.update(dt, t); },
  };
}
