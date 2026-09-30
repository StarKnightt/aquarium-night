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

// Glass panes: stronger night-room reflections, green iron edge, dust/spots/fingerprints, visible thickness feel.
const glassMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
    uniforms: { uThick: { value: 0.028 } },
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
        float F = 0.06 + 0.94 * pow(1.0 - ndv, 4.4);
        // micro-waviness + hard-water spots bump the normal
        float spot = smoothstep(0.70, 0.96, vn(vW.xy * 38.0 + 1.7) * 0.55 + vn(vW.xy * 90.0) * 0.45);
        float finger = smoothstep(0.74, 0.98, vn(vW.xy * 9.0 + 4.0)) * smoothstep(0.45, 0.92, vn(vW.xy * 3.2));
        // drip streaks: vertical gravity runs
        float drip = abs(sin(vW.x * 42.0 + vn(vec2(vW.x * 6.0, 2.0)) * 5.0));
        drip = smoothstep(0.88, 1.0, drip) * smoothstep(0.08, 0.35, vW.y) * (1.0 - smoothstep(0.38, 0.46, vW.y));
        N = normalize(N + 0.005 * vec3(vn(vW.xy * 7.0) - 0.5, vn(vW.yz * 6.0) - 0.5, vn(vW.zx * 5.0) - 0.5)
                        + 0.014 * spot * vec3(0.0, 0.4, 0.0)
                        + 0.008 * drip * vec3(0.0, -0.6, 0.0));
        vec3 R = reflect(-V, N);
        vec3 refl = roomEnv(R) * (F * 4.6 + 0.04);
        // warm lamp (right) + cool window (left) + tank LED bar (overhead)
        float lampBlob = pow(max(0.0, R.x * 0.55 + R.y * 0.35 + 0.15), 8.0);
        float winBlob = pow(max(0.0, -R.x * 0.4 + R.y * 0.5 + 0.05), 10.0);
        float ledBlob = pow(max(0.0, R.y * 0.85 - abs(R.x) * 0.25 + 0.05), 14.0);
        refl += vec3(1.0, 0.55, 0.22) * lampBlob * F * 1.55;
        refl += vec3(0.25, 0.40, 0.75) * winBlob * F * 0.6;
        refl += vec3(0.85, 0.95, 1.15) * ledBlob * F * 1.8;
        // corner biofilm / algae haze (inner corners, lower)
        float cx = 0.48 - abs(vW.x);
        float cz = 0.195 - abs(vW.z);
        float corner = (1.0 - smoothstep(0.0, 0.09, min(cx, cz))) * (1.0 - smoothstep(0.22, 0.40, vW.y));
        float bio = corner * (0.4 + 0.6 * vn(vW.xz * 22.0));
        // dust / salt creep near rim + fingerprints + drips
        float nearRim = smoothstep(0.32, 0.44, vW.y) * (1.0 - smoothstep(0.44, 0.48, vW.y));
        float sm = spot * (0.35 + 0.65 * vn(vW.xy * 4.0));
        vec3 dust = vec3(0.62, 0.70, 0.88) * (sm * 0.02 + finger * 0.032 + nearRim * sm * 0.05 + drip * 0.025) * step(0.35, abs(N.z));
        dust += vec3(0.18, 0.32, 0.16) * bio * 0.07;
        float streak = abs(sin(vW.x * 55.0 + vn(vec2(vW.x * 8.0, 0.0)) * 4.0));
        streak = smoothstep(0.82, 1.0, streak) * smoothstep(0.28, 0.42, vW.y) * (1.0 - smoothstep(0.42, 0.48, vW.y));
        dust += vec3(0.7, 0.85, 1.0) * streak * 0.022 * step(0.5, abs(N.z));
        float gr = max(1.0 / max(ndv, 0.025) - 1.0, 0.0);
        float ab = 1.0 - exp(-gr * uThick * 48.0);
        vec3 tint = vec3(0.05, 0.40, 0.26) * ab * 0.14;
        float a = clamp(F * 0.76 + ab * 0.42 + 0.008 + sm * 0.018 + finger * 0.028 + bio * 0.04, 0.0, 0.95);
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
  // visible green glass edge strips at vertical corners (iron glass look) + bevel faces
  {
    const edgeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.10, 0.38, 0.26), transparent: true, opacity: 0.72, depthWrite: false, toneMapped: true,
    });
    const bevelMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.08, 0.28, 0.20), transparent: true, opacity: 0.45, depthWrite: false, toneMapped: true,
    });
    const eh = H - g;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const eg = new THREE.Mesh(new THREE.BoxGeometry(0.0042, eh, 0.0042), edgeMat);
      eg.position.set(sx * (hw - g * 0.12), g + eh / 2, sz * (hd - g * 0.12));
      eg.renderOrder = 11;
      tank.add(eg);
      // outer bevel chamfer strip (reads as thick glass edge)
      const bv = new THREE.Mesh(new THREE.BoxGeometry(0.0065, eh * 0.98, 0.0012), bevelMat);
      bv.position.set(sx * (hw - 0.001), g + eh / 2, sz * (hd - g * 0.5));
      bv.renderOrder = 11;
      tank.add(bv);
      const bh = new THREE.Mesh(new THREE.BoxGeometry(0.0012, eh * 0.98, 0.0065), bevelMat);
      bh.position.set(sx * (hw - g * 0.5), g + eh / 2, sz * (hd - 0.001));
      bh.renderOrder = 11;
      tank.add(bh);
    }
    // top rim polish bevel — thin dark lip only (not a hood)
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(hw * 2 - 0.004, 0.0022, hd * 2 - 0.004),
      patchRoom(new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.35, metalness: 0.4, envMap: envTex, envMapIntensity: 0.6 }), { key: 'rim' })
    );
    rim.position.set(0, H - 0.001, 0);
    tank.add(rim);
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
  // cooler, narrower core so bloom keeps a thin hard LED strip instead of a white slab
  const lipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.85, 2.05, 2.55), toneMapped: false });
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.009, 0.004), lipMat);
  lip.position.set(0, -0.0035, 0.0435);
  const emit = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.003, 0.055), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.5, 4.1), toneMapped: false }));
  emit.position.set(0, -0.0145, 0);
  fixture.add(housing, lip, emit);
  for (const sx of [-1, 1]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 1.8, 6), blackMat);
    cable.position.set(sx * 0.36, 0.9, 0);
    fixture.add(cable);
  }
  fixture.position.set(0, 0.515, -0.06);
  group.add(fixture);

  // soft glow around the fixture — tight core + wide cool veil (halation in-scene)
  const glowTex = makeGlow(128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.45, 0.65, 0.95), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.22, toneMapped: false }));
  glow.scale.set(1.25, 0.26, 1);
  glow.position.set(0, 0.5, 0.0);
  const glowWide = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.28, 0.50, 0.90), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.13, toneMapped: false }));
  glowWide.scale.set(2.05, 0.62, 1);
  glowWide.position.set(0, 0.48, 0.05);
  group.add(glow, glowWide);

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
  // 1) LED as soft area key (directional + large PCF radius for penumbra)
  const sun = new THREE.DirectionalLight(new THREE.Color(0.92, 0.96, 1.0), 2.8);
  sun.position.set(0.0, 1.25, -0.10);
  sun.target.position.set(0, 0.1, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
  const sc = sun.shadow.camera;
  sc.left = -0.55; sc.right = 0.55; sc.top = 0.26; sc.bottom = -0.26; sc.near = 0.72; sc.far = 1.5;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = Q.name === 'high' ? 12 : 5;
  sun.shadow.intensity = 0.32; // soft aquarium fill — umbras never ink-black
  if ('blurSamples' in sun.shadow) sun.shadow.blurSamples = Q.name === 'high' ? 12 : 4;
  sun.intensity = 2.35;
  scene.add(sun, sun.target);

  // 2) room lights — spill of tank glow onto stand/wall/floor + warm lamp + sand bounce
  const spill = new THREE.PointLight(new THREE.Color(0.50, 0.78, 1.05), 0.38, 7, 1.8);
  spill.position.set(0, 0.58, 0.18);
  const under = new THREE.PointLight(new THREE.Color(0.22, 0.72, 0.80), 0.40, 3.2, 1.7);
  under.position.set(0, 0.18, 0.38);
  const bounce = new THREE.PointLight(new THREE.Color(0.55, 0.78, 0.58), 0.42, 1.8, 1.8);
  bounce.position.set(0, 0.04, 0.02);
  const standGlow = new THREE.PointLight(new THREE.Color(0.45, 0.70, 0.95), 0.20, 2.4, 2.0);
  standGlow.position.set(0, 0.02, 0.12);
  const wallWash = new THREE.PointLight(new THREE.Color(0.35, 0.55, 0.85), 0.28, 4.5, 1.6);
  wallWash.position.set(0, 0.55, -0.35);
  const lamp = new THREE.PointLight(new THREE.Color(1.0, 0.55, 0.26), 0.95, 7.5, 1.9);
  lamp.position.set(1.05, floorY + 1.3, -0.35);
  const moon = new THREE.PointLight(new THREE.Color(0.35, 0.45, 0.75), 0.12, 5, 2);
  moon.position.set(-1.2, 0.5, -0.4);
  scene.add(spill, under, bounce, standGlow, wallWash, lamp, moon);

  // projected caustic wash on the wall/ceiling above the tank (signature night-aquarium look)
  {
    const caustPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.6),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: WU.uTime, uCaust: WU.uCaust },
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform float uTime; uniform sampler2D uCaust;
          void main(){
            vec2 uv = vUv * vec2(1.6, 0.9) + vec2(0.1, 0.2);
            float c = texture2D(uCaust, uv + vec2(uTime * 0.01, 0.0)).g;
            float c2 = texture2D(uCaust, uv * 0.55 + vec2(0.3, -uTime * 0.008)).g;
            float m = pow(clamp(c * 0.6 + c2 * 0.4, 0.0, 2.5), 2.2);
            float fall = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y)
                       * smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
            gl_FragColor = vec4(vec3(0.35, 0.65, 0.95) * m * fall * 0.08, 1.0);
          }`,
      })
    );
    caustPlane.position.set(0, 0.95, backZ + 0.005);
    caustPlane.renderOrder = -1;
    group.add(caustPlane);
  }

  // sofa + side-table silhouettes (dim living room presence)
  {
    const sofaMat = patchRoom(new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.92 }), { key: 'sofa' });
    const sofa = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.42, 0.55), sofaMat);
    sofa.position.set(-1.55, floorY + 0.28, 0.55);
    const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 0.12), sofaMat);
    sofaBack.position.set(-1.55, floorY + 0.55, 0.32);
    const tableMat = patchRoom(new THREE.MeshStandardMaterial({ color: 0x2a2218, roughness: 0.55, envMap: envTex, envMapIntensity: 0.4 }), { key: 'table' });
    const sideTable = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.42, 16), tableMat);
    sideTable.position.set(1.35, floorY + 0.21, 0.35);
    // bookshelf block on left wall
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.22), sofaMat);
    shelf.position.set(-2.25, floorY + 0.7, -0.35);
    // TV standby LED glow (tiny red point)
    const tv = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.52, 0.04), blackMat);
    tv.position.set(1.7, floorY + 1.05, backZ + 0.03);
    const standby = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.15, 0.05), toneMapped: false }));
    standby.position.set(2.05, floorY + 0.82, backZ + 0.05);
    // rug under stand
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.3),
      patchRoom(new THREE.MeshStandardMaterial({ color: 0x2c2430, roughness: 1 }), { key: 'rug' })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, floorY + 0.003, 0.15);
    group.add(sofa, sofaBack, sideTable, shelf, tv, standby, rug);
  }

  // tank hardware: lily-pipe outflow, heater, thermometer
  {
    const chrome = patchRoom(new THREE.MeshStandardMaterial({ color: 0xb0b4ba, metalness: 0.95, roughness: 0.28, envMap: envTex, envMapIntensity: 1.2 }), { key: 'pipe' });
    const tube = (r, h, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), chrome);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz); tank.add(m); return m;
    };
    // lily pipe on right rear
    tube(0.006, 0.28, 0.42, 0.22, -0.14);
    tube(0.006, 0.08, 0.42, 0.36, -0.10, Math.PI / 2.6, 0, 0);
    const cup = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 8, 16, Math.PI), chrome);
    cup.position.set(0.42, 0.38, -0.055); cup.rotation.x = Math.PI / 2;
    tank.add(cup);
    // heater tube left rear
    const heater = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.22, 10),
      patchRoom(new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.45, metalness: 0.3, envMap: envTex, envMapIntensity: 0.5 }), { key: 'heat' })
    );
    heater.position.set(-0.44, 0.16, -0.14);
    tank.add(heater);
    // suction cups
    const rub = patchRoom(new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.7 }), { key: 'suc' });
    for (const yy of [0.08, 0.24]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), rub);
      s.position.set(-0.44, yy, -0.155); tank.add(s);
    }
    // stick-on thermometer on front-left glass (inside)
    const thermo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.018, 0.09),
      patchWater(new THREE.MeshBasicMaterial({ color: 0xe8e4d8, transparent: true, opacity: 0.85 }), { caustics: false, key: 'thermo' })
    );
    thermo.position.set(-0.46, 0.28, hd - g - 0.002);
    tank.add(thermo);
  }

  return { group, envTex, sun, spill, under, lamp, bounce, fixture, glassMaterial: glassM };
}
