import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Q } from '../core/quality.js';

// Mild depth-of-field from a dedicated non-MSAA depth prepass (MSAA RTs break depth sampling).
const DoFShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1600, 1 / 900) },
    uDir: { value: new THREE.Vector2(1, 0) },
    uFocus: { value: 1.35 },
    uAperture: { value: 0.004 },
    uMaxBlur: { value: 0.85 },
    uNear: { value: 0.03 },
    uFar: { value: 40 },
    uEnabled: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tDepth;
    uniform vec2 uTexel, uDir;
    uniform float uFocus, uAperture, uMaxBlur, uNear, uFar, uEnabled;
    varying vec2 vUv;
    float linearDepth(float d) {
      float z = d * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }
    float cocAt(vec2 uv) {
      // MeshDepthMaterial BasicDepthPacking stores (1.0 - fragCoordZ) in .r
      float d = 1.0 - texture2D(tDepth, uv).r;
      float z = linearDepth(d);
      float diff = abs(z - uFocus);
      float coc = max(0.0, diff - uFocus * 0.12) / max(uFocus, 0.01) * (uAperture * 110.0);
      return clamp(coc, 0.0, uMaxBlur);
    }
    void main() {
      vec4 center = texture2D(tDiffuse, vUv);
      if (uEnabled < 0.5) { gl_FragColor = center; return; }
      float coc = cocAt(vUv);
      if (coc < 0.12) { gl_FragColor = center; return; }
      vec3 acc = vec3(0.0);
      float wSum = 0.0;
      float taps[7]; taps[0]=-3.0; taps[1]=-2.0; taps[2]=-1.0; taps[3]=0.0; taps[4]=1.0; taps[5]=2.0; taps[6]=3.0;
      float kw[7]; kw[0]=0.05; kw[1]=0.09; kw[2]=0.15; kw[3]=0.22; kw[4]=0.15; kw[5]=0.09; kw[6]=0.05;
      for (int i = 0; i < 7; i++) {
        vec2 uv = vUv + uDir * uTexel * taps[i] * coc;
        float w = kw[i];
        acc += texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb * w;
        wSum += w;
      }
      gl_FragColor = vec4(mix(center.rgb, acc / wSum, smoothstep(0.12, 0.55, coc)), center.a);
    }`,
};

const PhotoShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1.7 },
    uGrain: { value: 0.024 },
    uVig: { value: 0.48 },
    uCA: { value: 0.00035 },
    uBarrel: { value: 0.008 },
    uSoft: { value: 0.12 },
    uHalo: { value: 0.22 },
    uWarm: { value: 0.035 },
    uTexel: { value: new THREE.Vector2(1 / 1600, 1 / 900) },
    // tank AABB in UV (xy = min, zw = max); refraction magnifies inside
    uTankUV: { value: new THREE.Vector4(0.25, 0.2, 0.75, 0.75) },
    uRefract: { value: Q.name === 'high' ? 1.0 : 0.0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uGrain, uVig, uCA, uBarrel, uSoft, uHalo, uWarm, uRefract;
    uniform vec2 uTexel;
    uniform vec4 uTankUV;
    varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d * vec2(uAspect, 1.0), d * vec2(uAspect, 1.0));
      vec2 uv = 0.5 + d * (1.0 + uBarrel * r2);
      // cheap n≈1.33 magnification inside the tank screen rect + edge kink
      if (uRefract > 0.5) {
        vec2 tmin = uTankUV.xy, tmax = uTankUV.zw;
        vec2 tc = (tmin + tmax) * 0.5;
        vec2 th = (tmax - tmin) * 0.5;
        vec2 local = (uv - tc) / max(th, vec2(1e-4));
        float inside = float(abs(local.x) < 1.0 && abs(local.y) < 1.0);
        float edge = 1.0 - max(abs(local.x), abs(local.y));
        // noticeable n≈1.33 magnification; stronger near vertical glass edges
        float mag = 0.945 + 0.035 * smoothstep(0.0, 0.22, edge);
        vec2 refr = tc + (uv - tc) * mix(1.0, mag, inside);
        float side = smoothstep(0.18, 0.0, abs(abs(local.x) - 1.0)) * inside;
        refr.x += local.x * side * 0.028;
        refr.y += side * local.y * 0.006;
        // waterline kink
        float wl = smoothstep(0.09, 0.0, abs(local.y - 0.70)) * inside;
        refr.y -= wl * 0.014;
        refr.x += wl * local.x * 0.006;
        uv = mix(uv, refr, uRefract);
      }
      vec2 off = d * r2 * uCA * 7.0;
      vec3 c;
      c.r = texture2D(tDiffuse, uv + off).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - off).b;
      if (uSoft > 0.01) {
        vec2 t = uTexel * uSoft;
        vec3 blur = c * 0.5
          + texture2D(tDiffuse, uv + vec2(t.x, 0.0)).rgb * 0.125
          + texture2D(tDiffuse, uv - vec2(t.x, 0.0)).rgb * 0.125
          + texture2D(tDiffuse, uv + vec2(0.0, t.y)).rgb * 0.125
          + texture2D(tDiffuse, uv - vec2(0.0, t.y)).rgb * 0.125;
        c = mix(c, blur, 0.4);
      }
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float bright = smoothstep(0.72, 1.25, l);
      c += vec3(0.45, 0.62, 0.95) * bright * bright * uHalo * 0.055;
      c += vec3(0.005, 0.012, 0.018) * (1.0 - smoothstep(0.0, 0.10, l));
      c = mix(c, c * vec3(1.035, 0.985, 0.93), uWarm * smoothstep(0.18, 0.55, l));
      c = (c - 0.5) * 1.06 + 0.5;
      float vig = 1.0 - uVig * smoothstep(0.25, 1.2, r2 * 2.0);
      c *= vig;
      float n1 = hash(floor(gl_FragCoord.xy) + fract(uTime * 0.97) * 113.0);
      float n2 = hash(floor(gl_FragCoord.xy * 0.5) - fract(uTime * 1.31) * 71.0);
      float n = (n1 + n2) * 0.5 - 0.5;
      float shadowGate = 1.0 - smoothstep(0.04, 0.38, l);
      float grainAmt = uGrain * (0.12 + 1.25 * shadowGate) * (1.0 - bright * 0.9);
      c += n * grainAmt;
      c.rg += n * grainAmt * 0.1 * vec2(1.0, -0.55);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  // Colour path: no MSAA on composer RT so depth prepass stays aligned; main renderer already AA-free.
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 0,
    depthBuffer: true,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));

  const useDoF = Q.name === 'high';
  let dofH = null, dofV = null;
  let depthTarget = null;
  let depthScene = null;
  let depthCam = null;
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });

  if (useDoF) {
    // Half-res depth prepass (non-MSAA) — reliable CoC source
    depthTarget = new THREE.WebGLRenderTarget(Math.max(1, size.x * 0.5), Math.max(1, size.y * 0.5), {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
    });
    depthScene = scene;
    depthCam = camera;

    dofH = new ShaderPass(DoFShader);
    dofH.uniforms.tDepth.value = depthTarget.texture;
    dofH.uniforms.uDir.value.set(1, 0);
    composer.addPass(dofH);
    dofV = new ShaderPass(DoFShader);
    dofV.uniforms.tDepth.value = depthTarget.texture;
    dofV.uniforms.uDir.value.set(0, 1);
    composer.addPass(dofV);
  }

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x * Q.bloomScale, size.y * Q.bloomScale),
    Q.name === 'high' ? 0.14 : 0.10,
    0.32,
    1.42
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const photo = new ShaderPass(PhotoShader);
  photo.uniforms.uGrain.value = Q.grain ? (Q.name === 'high' ? 0.018 : 0.026) : 0;
  photo.uniforms.uSoft.value = Q.name === 'high' ? 0.12 : 0.08;
  photo.uniforms.uHalo.value = Q.name === 'high' ? 0.28 : 0.18;
  composer.addPass(photo);

  const focusPoint = new THREE.Vector3(0, 0.2, 0);
  const _ndc = new THREE.Vector3();
  const tankCorners = [
    new THREE.Vector3(-0.5, 0.0, 0.21),
    new THREE.Vector3(0.5, 0.0, 0.21),
    new THREE.Vector3(-0.5, 0.45, 0.21),
    new THREE.Vector3(0.5, 0.45, 0.21),
    new THREE.Vector3(-0.5, 0.0, -0.21),
    new THREE.Vector3(0.5, 0.45, -0.21),
  ];

  return {
    composer, bloom, photo, dofH, dofV, focusPoint,
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      bloom.setSize(w * pr * Q.bloomScale, h * pr * Q.bloomScale);
      photo.uniforms.uAspect.value = w / h;
      const pw = Math.max(1, w * pr), ph = Math.max(1, h * pr);
      photo.uniforms.uTexel.value.set(1 / pw, 1 / ph);
      if (dofH) {
        depthTarget.setSize(Math.max(1, (pw * 0.5) | 0), Math.max(1, (ph * 0.5) | 0));
        dofH.uniforms.uTexel.value.set(1 / pw, 1 / ph);
        dofV.uniforms.uTexel.value.set(1 / pw, 1 / ph);
        dofH.uniforms.uNear.value = camera.near;
        dofH.uniforms.uFar.value = camera.far;
        dofV.uniforms.uNear.value = camera.near;
        dofV.uniforms.uFar.value = camera.far;
      }
    },
    render(dt, t) {
      let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
      for (const c of tankCorners) {
        _ndc.copy(c).project(camera);
        const u = _ndc.x * 0.5 + 0.5;
        const v = _ndc.y * 0.5 + 0.5;
        u0 = Math.min(u0, u); v0 = Math.min(v0, v);
        u1 = Math.max(u1, u); v1 = Math.max(v1, v);
      }
      photo.uniforms.uTankUV.value.set(
        THREE.MathUtils.clamp(u0, 0, 1),
        THREE.MathUtils.clamp(v0, 0, 1),
        THREE.MathUtils.clamp(u1, 0, 1),
        THREE.MathUtils.clamp(v1, 0, 1)
      );

      if (dofH) {
        const dist = camera.position.distanceTo(focusPoint);
        dofH.uniforms.uFocus.value = dist;
        dofV.uniforms.uFocus.value = dist;
        dofH.uniforms.uNear.value = camera.near;
        dofH.uniforms.uFar.value = camera.far;
        dofV.uniforms.uNear.value = camera.near;
        dofV.uniforms.uFar.value = camera.far;

        const prevRT = renderer.getRenderTarget();
        const prevOM = scene.overrideMaterial;
        const prevBG = scene.background;
        const prevAuto = renderer.autoClear;
        scene.overrideMaterial = depthMat;
        scene.background = null;
        renderer.autoClear = true;
        renderer.setRenderTarget(depthTarget);
        renderer.clear();
        renderer.render(scene, camera);
        scene.overrideMaterial = prevOM;
        scene.background = prevBG;
        renderer.autoClear = prevAuto;
        renderer.setRenderTarget(prevRT);
      }
      photo.uniforms.uTime.value = t;
      composer.render(dt);
    },
  };
}
