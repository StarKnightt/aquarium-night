import fs from 'node:fs';
let p = 'src/systems/room.js';
let s = fs.readFileSync(p, 'utf8');

const a = s.indexOf("    fragmentShader: /* glsl */ `\n      varying vec3 vN; varying vec3 vW;\n      uniform float uThick;");
const b = s.indexOf("  });\n\nexport function createRoom");
if (a < 0 || b < 0) throw new Error('markers not found');
const newFrag = `    fragmentShader: /* glsl */ \`
      varying vec3 vN; varying vec3 vW;
      uniform float uThick;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      vec3 roomEnv(vec3 d) {
        vec3 c = vec3(0.010, 0.012, 0.017) + vec3(0.02, 0.026, 0.04) * smoothstep(-0.4, 0.9, d.y);
        vec3 ld = normalize(vec3(-0.75, 0.40, 0.75));
        c += vec3(1.0, 0.55, 0.24) * 2.6 * pow(max(dot(d, ld), 0.0), 90.0);
        c += vec3(1.0, 0.50, 0.22) * 0.30 * pow(max(dot(d, ld), 0.0), 7.0);
        vec3 wd = normalize(vec3(0.85, 0.28, 0.5));
        c += vec3(0.30, 0.42, 0.75) * 0.9 * smoothstep(0.90, 0.985, dot(d, wd));
        c += vec3(0.16, 0.24, 0.45) * 0.25 * pow(max(dot(d, wd), 0.0), 5.0);
        vec3 bd = normalize(vec3(0.0, 0.85, 0.1));
        float strip = smoothstep(0.86, 0.97, dot(d, bd)) * smoothstep(0.55, 0.15, abs(d.x));
        c += vec3(0.95, 1.05, 1.35) * 5.0 * strip;
        c += vec3(0.5, 0.42, 0.34) * 0.35 * smoothstep(0.07, 0.0, abs(d.y - 0.10)) * smoothstep(-0.2, 0.9, d.x);
        return c;
      }
      void main() {
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        if (!gl_FrontFacing) N = -N;
        float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
        float F = 0.045 + 0.955 * pow(1.0 - ndv, 5.0);
        N = normalize(N + 0.0025 * vec3(vn(vW.xy * 7.0) - 0.5, vn(vW.yz * 6.0) - 0.5, vn(vW.zx * 5.0) - 0.5));
        vec3 R = reflect(-V, N);
        vec3 refl = roomEnv(R) * (F * 2.6 + 0.02);
        float sm = smoothstep(0.55, 0.95, vn(vW.xy * 22.0 + 3.0) * 0.6 + vn(vW.xy * 60.0) * 0.4) * (0.4 + 0.6 * vn(vW.xy * 4.0));
        vec3 dust = vec3(0.55, 0.65, 0.85) * sm * 0.010 * step(0.5, abs(N.z));
        float path = uThick / max(ndv, 0.03);
        float ab = 1.0 - exp(-path * 46.0);
        vec3 tint = vec3(0.05, 0.50, 0.34) * ab * 0.11;
        float a = clamp(F * 0.6 + ab * 0.22 + 0.012 + sm * 0.01, 0.0, 0.92);
        gl_FragColor = vec4(refl + tint + dust, a);
      }\`,
`;
s = s.slice(0, a) + newFrag + s.slice(b);
const rep = (from, to) => { if (!s.includes(from)) throw new Error('missing: ' + from.slice(0, 60)); s = s.replace(from, to); };
rep('uniforms: { uThick: { value: TANK.glass } },', 'uniforms: { uThick: { value: 0.016 } },');
rep('new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.42, metalness: 0.0, envMap: envTex, envMapIntensity: 0.55 })',
  'new THREE.MeshPhysicalMaterial({ map: woodTex, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.18, envMap: envTex, envMapIntensity: 1.6 })');
rep('new THREE.MeshStandardMaterial({ map: woodTex, color: 0xdcc8b8, roughness: 0.36, envMap: envTex, envMapIntensity: 0.7 })',
  'new THREE.MeshPhysicalMaterial({ map: woodTex, color: 0xdcc8b8, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.25, envMap: envTex, envMapIntensity: 1.2 })');
rep('new THREE.PointLight(new THREE.Color(0.55, 0.78, 1.0), 2.2, 6, 2)', 'new THREE.PointLight(new THREE.Color(0.55, 0.78, 1.0), 1.5, 6, 2)');
rep('makeWall({ base: [92, 100, 112] })', 'makeWall({ base: [70, 80, 96] })');
rep('Math.sin(cp.getX(i) * 44) * 0.028 + Math.sin(cp.getX(i) * 17) * 0.02', 'Math.sin(cp.getX(i) * 40) * 0.05 + Math.sin(cp.getX(i) * 15) * 0.03');

const extras = `  // power lead: from the fixture, sagging over the back of the tank and down the wall to a socket
  {
    const pts = [
      new THREE.Vector3(0.40, 0.512, -0.06), new THREE.Vector3(0.47, 0.50, -0.14), new THREE.Vector3(0.52, 0.42, -0.30),
      new THREE.Vector3(0.56, 0.10, -0.60), new THREE.Vector3(0.60, -0.45, -0.76), new THREE.Vector3(0.62, -0.64, -0.765),
    ];
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.0028, 6), blackMat);
    group.add(cable);
    const outlet = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.115, 0.012), patchRoom(new THREE.MeshStandardMaterial({ color: 0xb9b8b2, roughness: 0.5 }), { key: 'outlet' }));
    outlet.position.set(0.62, -0.62, backZ + 0.006);
    group.add(outlet);
  }
  // soft contact shadow of the cabinet on the floor and wall
  {
    const gtex = makeGlow(128, [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]);
    const cs = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.05), new THREE.MeshBasicMaterial({ map: gtex, transparent: true, depthWrite: false, opacity: 0.95 }));
    cs.rotation.x = -Math.PI / 2; cs.position.set(0, floorY + 0.002, 0.0);
    group.add(cs);
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.7), new THREE.MeshBasicMaterial({ map: gtex, transparent: true, depthWrite: false, opacity: 0.55 }));
    ws.position.set(0, 0.0, backZ + 0.003);
    group.add(ws);
  }

  // ---- lights`;
rep('  // ---- lights', extras);
fs.writeFileSync(p, s);

p = 'src/systems/post.js';
s = fs.readFileSync(p, 'utf8');
rep('uCA: { value: 0.0016 }', 'uCA: { value: 0.0006 }');
rep('new UnrealBloomPass(new THREE.Vector2(size.x * Q.bloomScale, size.y * Q.bloomScale), 0.55, 0.85, 0.92)', 'new UnrealBloomPass(new THREE.Vector2(size.x * Q.bloomScale, size.y * Q.bloomScale), 0.32, 0.38, 1.15)');
rep('float n = hash(gl_FragCoord.xy + fract(uTime) * 91.7) + hash(gl_FragCoord.xy * 0.7 - fract(uTime * 1.3) * 53.1) - 1.0;',
  'float n = hash(floor(gl_FragCoord.xy * 0.62) + fract(uTime) * 91.7) + hash(floor(gl_FragCoord.xy * 0.31) - fract(uTime * 1.3) * 53.1) - 1.0;');
rep('uGrain: { value: 0.035 }', 'uGrain: { value: 0.05 }');
rep('(0.35 + 0.65 * (1.0 - smoothstep(0.0, 0.6, l)))', '(0.2 + 1.0 * (1.0 - smoothstep(0.0, 0.5, l)))');
fs.writeFileSync(p, s);
console.log('patched');
