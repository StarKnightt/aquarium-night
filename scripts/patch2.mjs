import fs from 'node:fs';
let p = 'src/core/waterPatch.js';
let s = fs.readFileSync(p, 'utf8');
const rep = (from, to) => { if (!s.includes(from)) throw new Error('missing: ' + from.slice(0, 70)); s = s.replace(from, to); };

// factor out world-pos vertex patch
rep(`function baseFrag(shader, extra) {`, `function worldPosVertex(vs) {
  return vs
    .replace('#include <common>', '#include <common>\\nvarying vec3 vWPos;')
    .replace(
      '#include <project_vertex>',
      \`#include <project_vertex>
      { vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWPos = (modelMatrix * wp4).xyz; }\`
    );
}

function baseFrag(shader, extra) {`);

// room: also see the water tint when viewed through the glass
rep(`    shader.uniforms.uRoomAmbient = WU.uRoomAmbient;
    baseFrag(shader, 'uniform vec3 uRoomAmbient;');
    shader.fragmentShader = shader.fragmentShader`, `    Object.assign(shader.uniforms, WU);
    shader.vertexShader = worldPosVertex(shader.vertexShader);
    baseFrag(shader, 'uniform vec3 uRoomAmbient;' + waterGLSL);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb = waterFog(gl_FragColor.rgb, vWPos);')`);
fs.writeFileSync(p, s);

p = 'src/systems/room.js';
s = fs.readFileSync(p, 'utf8');
const a = s.indexOf('      vec3 roomEnv(vec3 d) {');
const b = s.indexOf('      void main() {', a);
if (a < 0 || b < 0) throw new Error('glass env markers');
s = s.slice(0, a) + '      ${ENV_GLSL}\n' + s.slice(b);
rep(`import { Q } from '../core/quality.js';`, `import { Q } from '../core/quality.js';\nimport { ENV_GLSL } from '../core/envGLSL.js';`);
fs.writeFileSync(p, s);

p = 'src/main.js';
s = fs.readFileSync(p, 'utf8');
rep(`import { createPost } from './systems/post.js';`, `import { createPost } from './systems/post.js';\nimport { createWater } from './systems/water.js';`);
rep(`console.log('boot: room ok', Math.round(performance.now() - _t0));`, `console.log('boot: room ok', Math.round(performance.now() - _t0));
sys.water = createWater(scene, renderer);`);
fs.writeFileSync(p, s);
console.log('ok');
