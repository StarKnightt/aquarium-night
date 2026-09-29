import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TANK, WU, patchRoom, patchWater } from '../core/waterPatch.js';
import { makeWood, makeWall, makeFloor, makeGlow, canvasTexture, makeCanvas } from '../core/textures.js';
import { Q } from '../core/quality.js';
import { ENV_GLSL } from '../core/envGLSL.js';

/** Re-map box UVs to metric planar mapping so textures keep constant scale on any size of box. */
function worldUV(geo, scale = 1) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u * scale, v * scale);
  }
  uv.needsUpdate = true;
  return geo;
}

// Glass panes: reflection of a dim living room, green iron-glass edge tint, near-invisible face-on.
const glassMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
    uniforms: { uThick: { value: 0.016 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      uniform float uThick;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      ${ENV_GLSL}
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
        float gr = max(1.0 / max(ndv, 0.03) - 1.0, 0.0);      // extra path vs face-on: green shows only at the edges
        float ab = 1.0 - exp(-gr * uThick * 34.0);
        vec3 tint = vec3(0.07, 0.40, 0.26) * ab * 0.055;
        float a = clamp(F * 0.6 + ab * 0.30 + 0.004 + sm * 0.01, 0.0, 0.92);
        gl_FragColor = vec4(refl + tint + dust, a);
      }`,
  });

export function createRoom(scene, renderer) {
  const group = new THREE.Group();
  scene.add(group);

  // ---- environment for glossy room surfaces (stand varnish etc.)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // ---- materials
  const woodTex = makeWood({ w: 1024, h: 512, base: [104, 62, 34], dark: [52, 28, 14], seed: 5, ringScale: 0.8 });
  woodTex.repeat.set(1, 1);
  const standMat = patchRoom(
    new THREE.MeshPhysicalMaterial({ map: woodTex, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.18, envMap: envTex, envMapIntensity: 1.6 }),
    { key: 'stand' }
  );
  const doorMat = patchRoom(
    new THREE.MeshPhysicalMaterial({ map: woodTex, color: 0xdcc8b8, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.25, envMap: envTex, envMapIntensity: 1.2 }),
    { key: 'door' }
  );
  const metalMat = patchRoom(
    new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: 1, roughness: 0.32, envMap: envTex, envMapIntensity: 0.9 }),
    { key: 'metal' }
  );
  const blackMat = patchRoom(
    new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.55, metalness: 0.2, envMap: envTex, envMapIntensity: 0.4 }),
    { key: 'black' }
  );

  const wallTex = makeWall({ base: [70, 80, 96] });
  wallTex.repeat.set(3, 2);
  const wallMat = patchRoom(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, metalness: 0 }), { key: 'wall' });
  const floorTex = makeFloor();
  floorTex.repeat.set(3, 3);
  const floorMat = patchRoom(
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5, metalness: 0, envMap: envTex, envMapIntensity: 0.35 }),
    { key: 'floor' }
  );

  // ---- room shell
  const floorY = -0.78;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = floorY;
  const backZ = -0.78;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), wallMat);
  back.position.set(0, floorY + 2, backZ);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), wallMat);
  left.rotation.y = Math.PI / 2; left.position.set(-2.6, floorY + 2, -0.5 + 0);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), wallMat);
  right.rotation.y = -Math.PI / 2; right.position.set(2.6, floorY + 2, -0.5);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), wallMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = floorY + 2.6;
  const baseboard = new THREE.Mesh(new THREE.BoxGeometry(6, 0.10, 0.02), blackMat.clone());
  baseboard.material = patchRoom(new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6 }), { key: 'bb' });
  baseboard.position.set(0, floorY + 0.05, backZ + 0.01);
  group.add(floor, back, left, right, ceil, baseboard);

  // ---- stand (wooden cabinet)
  const stand = new THREE.Group();
  const sw = 1.08, sd = 0.47, top = -0.035, feetH = 0.06;
  const bodyH = top - (floorY + feetH);
  const bodyY = floorY + feetH + bodyH / 2;
  const topBoard = new THREE.Mesh(worldUV(new THREE.BoxGeometry(sw, 0.035, sd), 1.4), standMat);
  topBoard.position.set(0, top - 0.0175, 0);
  const carcass = new THREE.Mesh(worldUV(new THREE.BoxGeometry(sw - 0.02, bodyH - 0.035, sd - 0.02), 1.4), standMat);
  carcass.position.set(0, bodyY - 0.0175, -0.005);
  stand.add(topBoard, carcass);
  // doors
  const dw = (sw - 0.04) / 2 - 0.004, dh = bodyH - 0.09;
  for (const sx of [-1, 1]) {
    const cx = sx * (dw / 2 + 0.004);
    const dy = bodyY - 0.03;
    const frame = new THREE.Mesh(worldUV(new THREE.BoxGeometry(dw, dh, 0.022), 1.4), doorMat);
    frame.position.set(cx, dy, sd / 2 - 0.005);
    const panel = new THREE.Mesh(worldUV(new THREE.BoxGeometry(dw - 0.10, dh - 0.10, 0.008), 1.4), standMat);
    panel.position.set(cx, dy, sd / 2 + 0.008);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.14, 12), metalMat);
    handle.position.set(cx - sx * (dw / 2 - 0.05), top - 0.19, sd / 2 + 0.03);
    stand.add(frame, panel, handle);
    const shadowGap = new THREE.Mesh(new THREE.BoxGeometry(0.004, dh, 0.03), blackMat);
    shadowGap.position.set(sx * (dw + 0.006), dy, sd / 2 - 0.006);
  }
  const gap = new THREE.Mesh(new THREE.BoxGeometry(0.006, dh, 0.03), blackMat);
  gap.position.set(0, bodyY - 0.03, sd / 2 - 0.008);
  stand.add(gap);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, feetH, 0.05), blackMat);
    foot.position.set(sx * (sw / 2 - 0.05), floorY + feetH / 2, sz * (sd / 2 - 0.05));
    stand.add(foot);
  }
  group.add(stand);

  // foam mat under tank
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.012, 0.44), blackMat);
  mat.position.set(0, -0.006 , 0);
  group.add(mat);

  // ---- glass tank
  const glassM = glassMat();
  const tank = new THREE.Group();
  const g = TANK.glass, hw = TANK.halfW, hd = TANK.halfD, H = TANK.height;
  const glassBoxes = [
    [hw * 2, H, g, 0, H / 2, hd - g / 2],            // front
    [hw * 2, H, g, 0, H / 2, -hd + g / 2],           // back
    [g, H, hd * 2 - 2 * g, hw - g / 2, H / 2, 0],    // right
    [g, H, hd * 2 - 2 * g, -hw + g / 2, H / 2, 0],   // left
    [hw * 2 - 2 * g, g, hd * 2 - 2 * g, 0, g / 2, 0],// bottom
  ];
  for (const [w, h, d, x, y, z] of glassBoxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassM);
    m.position.set(x, y, z);
    m.renderOrder = 10;
    tank.add(m);
  }
  // silicone beads (black) at inner corners and bottom seams
  const beadMat = patchRoom(new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.25, metalness: 0 }), { key: 'bead' });
  const bead = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), beadMat);
    m.position.set(x, y, z); tank.add(m);
  };
  const ix = hw - g, iz = hd - g, bh = H - g;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bead(0.005, bh, 0.005, sx * (ix - 0.0025), g + bh / 2, sz * (iz - 0.0025));
  bead(ix * 2, 0.004, 0.004, 0, g + 0.002, iz - 0.002);
  bead(ix * 2, 0.004, 0.004, 0, g + 0.002, -iz + 0.002);
  bead(0.004, 0.004, iz * 2, ix - 0.002, g + 0.002, 0);
  bead(0.004, 0.004, iz * 2, -ix + 0.002, g + 0.002, 0);
  group.add(tank);

  // ---- black backdrop behind back glass with faint teal->black gradient
  const bc = makeCanvas(8, 256);
  const bctx = bc.getContext('2d');
  const grad = bctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0b2230'); grad.addColorStop(0.45, '#04101a'); grad.addColorStop(1, '#010306');
  bctx.fillStyle = grad; bctx.fillRect(0, 0, 8, 256);
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(1.06, 0.48),
    patchWater(new THREE.MeshBasicMaterial({ map: canvasTexture(bc, { repeat: false }), color: 0xffffff }), { caustics: false, key: 'bd' })
  );
  backdrop.position.set(0, 0.225, -hd - 0.012);
  group.add(backdrop);

  // ---- hanging LED light bar
  const fixture = new THREE.Group();
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.026, 0.085),
    patchRoom(new THREE.MeshStandardMaterial({ color: 0x141519, metalness: 0.85, roughness: 0.38, envMap: envTex, envMapIntensity: 0.8 }), { key: 'hous' })
  );
  const lipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.7, 3.4), toneMapped: false });
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.009, 0.004), lipMat);
  lip.position.set(0, -0.0035, 0.0435);
  const emit = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.003, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5.4, 6.4), toneMapped: false }));
  emit.position.set(0, -0.0145, 0);
  fixture.add(housing, lip, emit);
  for (const sx of [-1, 1]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 1.8, 6), blackMat);
    cable.position.set(sx * 0.36, 0.9, 0);
    fixture.add(cable);
  }
  fixture.position.set(0, 0.515, -0.06);
  group.add(fixture);

  // soft glow around the fixture (additive sprites)
  const glowTex = makeGlow(128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.35, 0.55, 0.85), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.22, toneMapped: false }));
  glow.scale.set(1.25, 0.24, 1);
  glow.position.set(0, 0.5, 0.0);
  group.add(glow);

  // ---- floor lamp (far right) and moonlit window + curtain (far left): pure atmosphere
  const lampGroup = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 1.3, 10), metalMat);
  pole.position.set(0, 0.65, 0);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.19, 0.24, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.35, 0.55), side: THREE.DoubleSide, toneMapped: false })
  );
  shade.position.set(0, 1.35, 0);
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.02, 20), blackMat);
  lampGroup.add(pole, shade, lampBase);
  lampGroup.position.set(1.05, floorY, -0.55);
  group.add(lampGroup);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.0, 0.5, 0.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6, toneMapped: false }));
  lampGlow.scale.set(1.6, 1.6, 1);
  lampGlow.position.set(1.05, floorY + 1.35, -0.5);
  group.add(lampGlow);

  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.09, 0.17), toneMapped: false });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.2), winMat);
  win.position.set(-1.25, 0.35, backZ + 0.004);
  const mull = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.2, 0.02), blackMat);
  mull.position.set(-1.25, 0.35, backZ + 0.012);
  const mull2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.02), blackMat);
  mull2.position.set(-1.25, 0.35, backZ + 0.012);
  const curtainMat = patchRoom(new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 1 }), { key: 'curt' });
  const curtainGeo = new THREE.PlaneGeometry(0.34, 1.6, 40, 1);
  const cp = curtainGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 40) * 0.05 + Math.sin(cp.getX(i) * 15) * 0.03);
  curtainGeo.computeVertexNormals();
  const curtain = new THREE.Mesh(curtainGeo, curtainMat);
  curtain.position.set(-0.98, 0.35, backZ + 0.05);
  group.add(win, mull, mull2, curtain);

  // power lead: from the fixture, sagging over the back of the tank and down the wall to a socket
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

  // ---- lights
  // 1) the light that lives in the water (directional, patched materials only)
  const sun = new THREE.DirectionalLight(new THREE.Color(0.95, 0.97, 1.0), 5.0);
  sun.position.set(0.0, 1.25, -0.10);
  sun.target.position.set(0, 0.1, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
  const sc = sun.shadow.camera;
  sc.left = -0.55; sc.right = 0.55; sc.top = 0.26; sc.bottom = -0.26; sc.near = 0.72; sc.far = 1.5;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.002;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  // 2) room lights (point, patched-room materials only)
  const spill = new THREE.PointLight(new THREE.Color(0.55, 0.78, 1.0), 0.20, 6, 2);
  spill.position.set(0, 0.62, 0.15);
  const under = new THREE.PointLight(new THREE.Color(0.15, 0.62, 0.72), 0.18, 2.5, 2);
  under.position.set(0, 0.22, 0.42);
  const lamp = new THREE.PointLight(new THREE.Color(1.0, 0.55, 0.26), 1.0, 7, 2);
  lamp.position.set(1.05, floorY + 1.3, -0.35);
  scene.add(spill, under, lamp);

  return { group, envTex, sun, spill, under, lamp, fixture, glassMaterial: glassM };
}
