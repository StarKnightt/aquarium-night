import * as THREE from 'three';

// Tank dimensions in metres. Tank base sits at y=0, stand below.
export const TANK = {
  halfW: 0.5, halfD: 0.21, height: 0.45, glass: 0.010,
  waterMinY: 0.010, surfaceY: 0.415,
  // inner water box
  iw: 0.49, id: 0.2,
};

// Uniforms shared by every material that lives inside (or looks through) the water.
export const WU = {
  uTime: { value: 0 },
  uCaust: { value: null },
  uBoxMin: { value: new THREE.Vector3(-TANK.iw, TANK.waterMinY, -TANK.id) },
  uBoxMax: { value: new THREE.Vector3(TANK.iw, TANK.surfaceY, TANK.id) },
  uCaustGain: { value: 0.82 },
  uDbg: { value: 0 },
  uRoomAmbient: { value: new THREE.Color(0.012, 0.014, 0.018) },
  uAbsorb: { value: new THREE.Vector3(0.52, 0.23, 0.19) },
  uScatter: { value: new THREE.Color(0.020, 0.045, 0.052) },
  uAmbient: { value: new THREE.Color(0.115, 0.155, 0.170) },
};

const waterGLSL = /* glsl */ `
varying vec3 vWPos;
uniform sampler2D uCaust;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uAbsorb;
uniform vec3 uScatter;
uniform vec3 uAmbient;
uniform float uCaustGain;
uniform float uDbg;
uniform float uTime;

// light reaching a point under the surface: caustic network, sharpening toward the bottom
vec3 causticAt(vec3 p, float soft);
vec3 causticAt(vec3 p) { return causticAt(p, 0.0); }
vec3 causticAt(vec3 p, float soft) {
  float depth = clamp(uBoxMax.y - p.y, 0.0, 0.6);
  vec2 uv = p.xz * 2.0 + vec2(0.13, 0.31);
  float lod = clamp(1.2 - depth * 3.0, 0.0, 1.8) + 0.55 + soft;
  vec3 c = textureLod(uCaust, uv, lod).rgb;
  vec3 c2 = textureLod(uCaust, uv * 0.43 + vec2(0.47, 0.19) + depth * 0.05, lod + 1.8).rgb;
  vec3 cc = vec3(0.30) + (c * 0.78 + c2 * 0.18) * 1.05 * uCaustGain;
  cc = cc / (1.0 + cc * 0.22);
  // desaturate the dispersion fringe a little
  float ccl = dot(cc, vec3(0.333));
  cc = mix(vec3(ccl), cc, 0.45);
  float atten = exp(-depth * 0.9);
  return cc * (0.30 + 0.70 * atten);
}

vec3 waterAmbientAt(vec3 p) {
  float h = clamp((p.y - uBoxMin.y) / (uBoxMax.y - uBoxMin.y), 0.0, 1.0);
  return uAmbient * (0.35 + 0.9 * h);
}

// absorption + in-scatter along the ray from camera through the water box to point p
vec3 waterFog(vec3 col, vec3 p) {
  vec3 ro = cameraPosition;
  vec3 rd = p - ro;
  vec3 inv = 1.0 / (rd + vec3(1e-6));
  vec3 t0 = (uBoxMin - ro) * inv;
  vec3 t1 = (uBoxMax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float te = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
  float tx = min(min(tmax.x, tmax.y), min(tmax.z, 1.0));
  float len = max(tx - te, 0.0) * length(rd);
  vec3 T = exp(-uAbsorb * len);
  // mid-ray height -> more glow near the light
  vec3 mid = ro + rd * (0.5 * (te + tx));
  float h = clamp((mid.y - uBoxMin.y) / (uBoxMax.y - uBoxMin.y), 0.0, 1.0);
  vec3 scat = uScatter * (0.35 + 0.95 * h) * (vec3(1.0) - T);
  return col * T + scat;
}
`;

function worldPosVertex(vs) {
  return vs
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      { vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWPos = (modelMatrix * wp4).xyz; }`
    );
}

function baseFrag(shader, extra) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + extra);
}

/** Material lives IN the water: caustics on the directional light, absorbing fog, ambient. */
export function patchWater(material, opts = {}) {
  const { caustics = true, fog = true, vertex = null, extraFrag = '', onShader = null, soft = 0 } = opts;
  material.fog = false;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, WU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        { vec4 wp4 = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp4 = instanceMatrix * wp4;
          #endif
          vWPos = (modelMatrix * wp4).xyz; }`
      );
    if (vertex) shader.vertexShader = vertex(shader.vertexShader);
    baseFrag(shader, waterGLSL + extraFrag);
    let f = shader.fragmentShader;
    // NB: onBeforeCompile sees UN-EXPANDED #includes, so inline the light chunk before patching it.
    const lfb = THREE.ShaderChunk.lights_fragment_begin
      .replace(
        'getDirectionalLightInfo( directionalLight, directLight );',
        `getDirectionalLightInfo( directionalLight, directLight );
         ${caustics ? 'directLight.color *= causticAt(vWPos, ' + soft.toFixed(2) + ');' : ''}`
      )
      .replace(
        'getPointLightInfo( pointLight, geometryPosition, directLight );',
        'getPointLightInfo( pointLight, geometryPosition, directLight ); directLight.color = vec3(0.0);'
      );
    f = f.replace('#include <lights_fragment_begin>', lfb);
    f = f.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
       reflectedLight.indirectDiffuse += waterAmbientAt(vWPos) * diffuseColor.rgb;`
    );
    if (fog) f = f.replace('#include <fog_fragment>', 'gl_FragColor.rgb = waterFog(gl_FragColor.rgb, vWPos); if (uDbg > 0.5) gl_FragColor.rgb = causticAt(vWPos) * 0.4;');
    shader.fragmentShader = f;
    if (onShader) onShader(shader);
  };
  material.customProgramCacheKey = () => 'water' + (caustics ? 'C' : '') + (fog ? 'F' : '') + (opts.key || '');
  return material;
}

/** Room material: lit only by room lights (point), never by the in-water directional light. */
export function patchRoom(material, opts = {}) {
  const { key = '' } = opts;
  material.fog = false;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, WU);
    shader.vertexShader = worldPosVertex(shader.vertexShader);
    baseFrag(shader, 'uniform vec3 uRoomAmbient;' + waterGLSL);
    const lfb = THREE.ShaderChunk.lights_fragment_begin.replace(
      'getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight ); directLight.color = vec3(0.0);'
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb = waterFog(gl_FragColor.rgb, vWPos);')
      .replace('#include <lights_fragment_begin>', lfb)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
         reflectedLight.indirectDiffuse += uRoomAmbient * diffuseColor.rgb;`
      );
  };
  material.customProgramCacheKey = () => 'room' + key;
  return material;
}

/** Wrap a scene-graph traversal to enable shadows. */
export function shadowify(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; }
  });
}
