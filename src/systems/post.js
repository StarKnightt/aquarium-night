import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Q } from '../core/quality.js';

// Final "camera" look: vignette, lens fringing toward the edges, sensor grain, gentle shadow tint.
const PhotoShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1.7 },
    uGrain: { value: 0.03 },
    uVig: { value: 0.75 },
    uCA: { value: 0.0006 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uAspect, uGrain, uVig, uCA;
    varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d * vec2(uAspect, 1.0), d * vec2(uAspect, 1.0));
      vec2 off = d * r2 * uCA * 6.0;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;
      // shadow tint: lift toward cool teal in the deepest blacks (like a night exposure)
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c += vec3(0.002, 0.006, 0.009) * (1.0 - smoothstep(0.0, 0.14, l));
      // vignette
      float vig = 1.0 - uVig * smoothstep(0.18, 1.05, r2 * 2.2);
      c *= vig;
      // luminance dependent grain (shows more in shadows, like high-ISO)
      float n = hash(floor(gl_FragCoord.xy * 0.62) + fract(uTime) * 91.7) + hash(floor(gl_FragCoord.xy * 0.31) - fract(uTime * 1.3) * 53.1) - 1.0;
      c += n * uGrain * (0.2 + 1.0 * (1.0 - smoothstep(0.0, 0.5, l)));
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Q.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * Q.bloomScale, size.y * Q.bloomScale), 0.32, 0.38, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const photo = new ShaderPass(PhotoShader);
  composer.addPass(photo);
  return {
    composer, bloom, photo,
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      bloom.setSize(w * pr * Q.bloomScale, h * pr * Q.bloomScale);
      photo.uniforms.uAspect.value = w / h;
    },
    render(dt, t) {
      photo.uniforms.uTime.value = t;
      composer.render(dt);
    },
  };
}
