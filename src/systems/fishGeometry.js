import * as THREE from 'three';
import { makeCanvas, canvasTexture } from '../core/textures.js';

// ------------------------------------------------------------------------------------------------
// Species definitions. Nose points +Z, up is +Y. All dimensions in metres / fractions of body length L.
// ------------------------------------------------------------------------------------------------
export const SPECIES = {
  neon: {
    label: 'Neon tetra', count: 7, L: 0.042, hbox: 0.030, ltot: 1.32,
    // L:H ~4.5:1 — slender tetra; stations: [t, hy, hwMul, belly]
    stations: [
      [0.00, 0.000, 0.40, 1.00],
      [0.04, 0.045, 0.55, 0.95], // snout
      [0.10, 0.095, 0.72, 0.92], // head
      [0.18, 0.118, 0.95, 0.90], // operculum (widest)
      [0.32, 0.125, 0.78, 0.94], // trunk
      [0.50, 0.115, 0.72, 0.95],
      [0.68, 0.085, 0.62, 0.96],
      [0.85, 0.048, 0.50, 0.98],
      [0.94, 0.032, 0.42, 1.00],
      [1.00, 0.024, 0.38, 1.00], // peduncle
    ],
    dy: 0.0,
    caudal: { len: 0.28, spread: 0.14, notch: 0.55 },
    dorsal: { t0: 0.42, t1: 0.62, h: 0.14, sweep: 0.10 },
    anal: { t0: 0.52, t1: 0.74, h: 0.11, sweep: 0.08 },
    adipose: { t0: 0.70, t1: 0.82, h: 0.045, sweep: 0.04 },
    pect: { t: 0.22, len: 0.16, w: 0.055 },
    eye: { t: 0.10, y: 0.025, r: 0.055 },
    scale: 'fine',
    speed: 0.075, turn: 3.2, school: 1.0, yPref: [0.10, 0.33], iri: 1.05, emissive: 0.0,
    dispersion: 0.06,
  },
  platy: {
    label: 'Red platy', count: 3, L: 0.048, hbox: 0.048, ltot: 1.30,
    stations: [
      [0.00, 0.000, 0.45, 1.00],
      [0.05, 0.070, 0.60, 0.92],
      [0.12, 0.130, 0.78, 0.88],
      [0.22, 0.175, 0.95, 0.86],
      [0.40, 0.195, 0.82, 0.90],
      [0.58, 0.175, 0.72, 0.92],
      [0.78, 0.110, 0.58, 0.95],
      [0.92, 0.068, 0.48, 0.98],
      [1.00, 0.050, 0.42, 1.00],
    ],
    dy: 0.0,
    caudal: { len: 0.28, spread: 0.20, notch: 0.72 },
    dorsal: { t0: 0.36, t1: 0.58, h: 0.17, sweep: 0.12 },
    anal: { t0: 0.52, t1: 0.70, h: 0.11, sweep: 0.06 },
    pect: { t: 0.24, len: 0.17, w: 0.06 },
    eye: { t: 0.11, y: 0.032, r: 0.038 },
    scale: 'med',
    speed: 0.060, turn: 2.4, school: 0.5, yPref: [0.07, 0.34], iri: 0.32, emissive: 0.0,
    dispersion: 0.08,
  },
  angel: {
    label: 'Angelfish', count: 2, L: 0.062, hbox: 0.138, ltot: 1.60,
    // tall disc-diamond ~1:1 body; fins double height
    stations: [
      [0.00, 0.000, 0.30, 1.00],
      [0.04, 0.090, 0.42, 0.95],
      [0.12, 0.260, 0.55, 0.92],
      [0.25, 0.400, 0.62, 0.90],
      [0.42, 0.460, 0.58, 0.92], // deepest
      [0.60, 0.400, 0.52, 0.93],
      [0.78, 0.240, 0.42, 0.95],
      [0.92, 0.090, 0.32, 0.98],
      [1.00, 0.040, 0.28, 1.00],
    ],
    dy: 0.0,
    caudal: { len: 0.36, spread: 0.32, notch: 0.85 },
    dorsal: { t0: 0.28, t1: 0.90, h: 1.05, sweep: 0.58 },
    anal: { t0: 0.40, t1: 0.94, h: 0.95, sweep: 0.52 },
    pect: { t: 0.28, len: 0.17, w: 0.06 },
    pelvic: { t: 0.30, len: 1.05 },
    eye: { t: 0.12, y: 0.100, r: 0.058 },
    scale: 'large',
    speed: 0.038, turn: 1.4, school: 0.4, yPref: [0.16, 0.34], iri: 0.42, emissive: 0.0,
    dispersion: 0.04,
  },
  cory: {
    label: 'Corydoras', count: 2, L: 0.050, hbox: 0.042, ltot: 1.28,
    // ~3.5:1 arched back, blunt snout, wide armour
    stations: [
      [0.00, 0.000, 0.55, 0.70],
      [0.03, 0.055, 0.85, 0.55],
      [0.08, 0.095, 1.15, 0.50],
      [0.16, 0.135, 1.25, 0.48], // cheek/operculum wide
      [0.32, 0.165, 1.18, 0.52],
      [0.50, 0.170, 1.10, 0.55], // arched peak
      [0.68, 0.135, 0.95, 0.58],
      [0.84, 0.080, 0.75, 0.65],
      [0.94, 0.048, 0.58, 0.75],
      [1.00, 0.036, 0.48, 0.85],
    ],
    dy: 0.012,
    caudal: { len: 0.24, spread: 0.13, notch: 0.68 },
    dorsal: { t0: 0.28, t1: 0.48, h: 0.22, sweep: 0.16 }, // spiky
    anal: { t0: 0.58, t1: 0.74, h: 0.07, sweep: 0.05 },
    adipose: { t0: 0.72, t1: 0.86, h: 0.06, sweep: 0.05 },
    pect: { t: 0.24, len: 0.18, w: 0.075 },
    barbels: true,
    eye: { t: 0.12, y: 0.042, r: 0.048 },
    scale: 'scute',
    speed: 0.035, turn: 2.0, school: 0.8, yPref: [0.0, 0.03], iri: 0.06, emissive: 0.0, bottom: true,
    dispersion: 0.0,
  },
};


// legacy hy accessor for paintSkin silhouette (derived from stations)
for (const sp of Object.values(SPECIES)) {
  sp.hy = sp.stations.map(([t, hy]) => [t, hy]);
  sp.hw = sp.stations[Math.floor(sp.stations.length / 2)][2];
  sp.belly = sp.stations[Math.floor(sp.stations.length / 2)][3];
}

function prof(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const a = pts[i - 1], b = pts[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      const s = k * k * (3 - 2 * k);
      return a[1] + (b[1] - a[1]) * s;
    }
  }
  return pts[pts.length - 1][1];
}

/** Interpolate station [t, hy, hwMul, belly] */
function stationAt(stations, t) {
  if (t <= stations[0][0]) return { hy: stations[0][1], hw: stations[0][2], belly: stations[0][3] };
  for (let i = 1; i < stations.length; i++) {
    if (t <= stations[i][0]) {
      const a = stations[i - 1], b = stations[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      const s = k * k * (3 - 2 * k);
      return {
        hy: a[1] + (b[1] - a[1]) * s,
        hw: a[2] + (b[2] - a[2]) * s,
        belly: a[3] + (b[3] - a[3]) * s,
      };
    }
  }
  const last = stations[stations.length - 1];
  return { hy: last[1], hw: last[2], belly: last[3] };
}

function pushBarbels(bp, bt, bf, bs, bd, buv, bi, sp, L) {
  const zOf = (t) => L / 2 - t * L;
  const dy = sp.dy * L;
  const st = stationAt(sp.stations, 0.04);
  const hy0 = st.hy * L;
  const rows = 5, cols = 3;
  for (const side of [-1, 1]) {
    for (const tier of [0, 1]) {
      const start = bp.length / 3;
      const y0 = dy - hy0 * (0.12 + tier * 0.24);
      const z0 = zOf(0.015);
      for (let r = 0; r <= rows; r++) {
        const u = r / rows;
        const taper = 1 - u * 0.92;
        const len = L * (0.12 + tier * 0.04);
        const droop = u * u * L * 0.045;
        for (let c = 0; c <= cols; c++) {
          const v = c / cols;
          const w = L * 0.007 * taper * (0.4 + 0.6 * Math.sin(v * Math.PI));
          const x = side * (hy0 * st.hw * 0.55 + u * len * 0.55 + (v - 0.5) * w);
          const y = y0 - droop - u * L * 0.022;
          const z = z0 + u * len * 0.85 - (v - 0.5) * w * 0.3;
          bp.push(x, y, z);
          bt.push(0.02 + u * 0.08); bf.push(0); bs.push(side); bd.push(u);
          buv.push(((L / 2 - z) / (L * sp.ltot)), 0.5 + y / sp.hbox);
        }
      }
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const a = start + r * (cols + 1) + c, b = a + 1, c2 = a + cols + 1, d = c2 + 1;
        bi.push(a, b, c2, b, d, c2);
      }
    }
  }
}

/** Build indexed geometry: body + fins + eye layout */
export function buildFishGeometry(sp, seg = 48, ring = 20) {
  const L = sp.L;
  const Ltot = L * sp.ltot;
  const Hbox = sp.hbox;
  const uvOf = (x, y, z) => [(L / 2 - z) / Ltot, 0.5 + y / Hbox];
  const zOf = (t) => L / 2 - t * L;
  const dyOf = () => sp.dy * L;
  const key = Object.keys(SPECIES).find((k) => SPECIES[k] === sp) || 'neon';

  const bp = [], bt = [], bf = [], bs = [], bd = [], buv = [], bi = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const st = stationAt(sp.stations, t);
    const z = zOf(t);
    const hy = st.hy * L;
    const hw = hy * st.hw;
    const gillCrest = Math.exp(-Math.pow((t - 0.18) / 0.04, 2));
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const sy = Math.sin(a);
      const cx = Math.cos(a);
      const pExp = key === 'cory' ? 2.6 : key === 'angel' ? 2.15 : 2.0;
      const rx = Math.sign(cx) * Math.pow(Math.abs(cx), 2 / pExp);
      const ry = Math.sign(sy) * Math.pow(Math.abs(sy), 2 / pExp);
      let mouth = 1.0;
      if (t < 0.06 && sy < -0.1) mouth = 1.0 - (0.06 - t) / 0.06 * (-sy) * 0.45;
      const snoutZ = t < 0.05 ? (key === 'cory' ? 0.006 : 0.004) * L * (1 - t / 0.05) : 0;
      let gillPush = 0;
      if (Math.abs(cx) > 0.55 && t > 0.12 && t < 0.28) {
        gillPush = gillCrest * L * 0.006 * Math.abs(cx);
      }
      let pectBump = 0;
      if (sp.pect && Math.abs(t - sp.pect.t) < 0.04 && sy < -0.1 && Math.abs(cx) > 0.4) {
        pectBump = (1 - Math.abs(t - sp.pect.t) / 0.04) * L * 0.0045 * Math.abs(cx);
      }
      const yScale = sy >= 0 ? 1.0 : st.belly;
      const ridge = sy > 0.75 ? 1.0 + (sy - 0.75) * 0.15 : 1.0;
      const x = (rx * hw + Math.sign(cx || 1) * (gillPush + pectBump)) * mouth;
      const y = dyOf() + ry * hy * yScale * ridge * mouth;
      const lip = (t < 0.045 && Math.abs(sy + 0.3) < 0.2) ? L * 0.004 : 0;
      bp.push(x, y + lip, z + snoutZ);
      bt.push(t); bf.push(0); bs.push(cx > 0.2 ? 1 : cx < -0.2 ? -1 : 0); bd.push(0);
      buv.push(...uvOf(x, y, z));
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + (j + 1) % ring, c = (i + 1) * ring + j, d = (i + 1) * ring + (j + 1) % ring;
    bi.push(a, c, b, b, c, d);
  }
  if (sp.barbels) pushBarbels(bp, bt, bf, bs, bd, buv, bi, sp, L);

  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2));
  body.setAttribute('aT', new THREE.Float32BufferAttribute(bt, 1));
  body.setAttribute('aFin', new THREE.Float32BufferAttribute(bf, 1));
  body.setAttribute('aSide', new THREE.Float32BufferAttribute(bs, 1));
  body.setAttribute('aDist', new THREE.Float32BufferAttribute(bd, 1));
  body.setIndex(bi);
  body.computeVertexNormals();

  const angelThick = sp === SPECIES.angel ? 0.02 * L : 0;
  const fp = [], ft = [], ff = [], fs = [], fd = [], fuv = [], fi = [];
  const hyOf = (t) => stationAt(sp.stations, t).hy * L;
  const gridFin = (baseFn, outerFn, rows, cols, type, side = 0, curve = 0.18, thick = 0, rayAmp = 0.0) => {
    const layers = thick > 0 ? [-1, 1] : [0];
    for (const sx of layers) {
      const start = fp.length / 3;
      for (let r = 0; r <= rows; r++) {
        const s = r / rows;
        const b0 = baseFn(s), o0 = outerFn(s);
        for (let c = 0; c <= cols; c++) {
          const k = c / cols;
          const ke = k * k * (3 - 2 * k);
          const bow = Math.sin(k * Math.PI) * curve * (0.35 + 0.65 * Math.sin(s * Math.PI));
          const ray = rayAmp * Math.sin(s * Math.PI * Math.max(3, cols * 0.55)) * ke * (1 - ke * 0.3);
          let x = b0[0] + (o0[0] - b0[0]) * ke + sx * thick * (1 - ke * 0.55) + ray * (side || (sx || 0.001));
          let y = b0[1] + (o0[1] - b0[1]) * ke + bow * (type === 1 ? (s * 2 - 1) * 0.002 : 0);
          let z = b0[2] + (o0[2] - b0[2]) * ke;
          if (ke > 0.82 && type === 1) {
            const fork = (s - 0.5) * 2;
            y += fork * L * 0.012 * (ke - 0.82) / 0.18;
          }
          const edgeSoft = (c === cols ? 0.90 + 0.10 * Math.sin(s * Math.PI) : 1);
          x = x * edgeSoft + b0[0] * (1 - edgeSoft);
          fp.push(x, y, z);
          ft.push((L / 2 - z) / L); ff.push(type); fs.push(side || sx); fd.push(k);
          fuv.push(...uvOf(x, y, z));
        }
      }
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const a = start + r * (cols + 1) + c, b = a + 1, c2 = a + cols + 1, d = c2 + 1;
        fi.push(a, b, c2, b, d, c2);
      }
    }
  };

  {
    const c = sp.caudal;
    const zb = zOf(1), hy = hyOf(1);
    gridFin(
      (s) => [0, dyOf() + (s * 2 - 1) * hy * 0.9, zb + 0.002 * L],
      (s) => {
        const yy = (s * 2 - 1);
        const lobe = Math.abs(yy);
        const notchK = c.notch + (1 - c.notch) * Math.pow(lobe, 0.72);
        const round = 1 - 0.12 * Math.pow(1 - Math.sin(Math.PI * s), 1.6);
        return [0, dyOf() + yy * c.spread * L * (0.92 + 0.08 * Math.sin(Math.PI * s)), zb - c.len * L * notchK * round];
      },
      16, 10, 1, 0, 0.24, angelThick, L * 0.0012
    );
  }
  {
    const d = sp.dorsal;
    const tipFilament = key === 'angel';
    gridFin(
      (s) => { const t = d.t0 + (d.t1 - d.t0) * s; return [0, dyOf() + hyOf(t) * 0.98, zOf(t)]; },
      (s) => {
        const t = d.t0 + (d.t1 - d.t0) * s;
        const bump = Math.pow(Math.sin(Math.PI * Math.pow(s, tipFilament ? 0.55 : 0.78)), 1.05);
        let h = d.h * L * (0.10 + 0.90 * bump);
        if (tipFilament) h *= 0.30 + 0.70 * Math.pow(s, 0.45) * (1 - 0.25 * s);
        if (key === 'cory') h *= 0.55 + 0.45 * Math.pow(Math.sin(Math.PI * s), 0.6);
        return [0, dyOf() + hyOf(t) * 0.98 + h, zOf(t) - d.sweep * L * bump * (0.35 + 0.65 * s)];
      },
      16, 8, 3, 0, 0.14, angelThick, L * 0.001
    );
  }
  {
    const d = sp.anal;
    gridFin(
      (s) => { const t = d.t0 + (d.t1 - d.t0) * s; return [0, dyOf() - hyOf(t) * stationAt(sp.stations, t).belly * 0.98, zOf(t)]; },
      (s) => {
        const t = d.t0 + (d.t1 - d.t0) * s;
        const bump = Math.pow(Math.sin(Math.PI * Math.pow(s, key === 'angel' ? 0.55 : 0.78)), 1.05);
        let h = d.h * L * (0.10 + 0.90 * bump);
        if (key === 'angel') h *= 0.30 + 0.70 * Math.pow(s, 0.45);
        return [0, dyOf() - hyOf(t) * stationAt(sp.stations, t).belly * 0.98 - h, zOf(t) - d.sweep * L * bump * (0.35 + 0.65 * s)];
      },
      16, 8, 3, 0, 0.14, angelThick, L * 0.001
    );
  }
  if (sp.adipose) {
    const d = sp.adipose;
    gridFin(
      (s) => { const t = d.t0 + (d.t1 - d.t0) * s; return [0, dyOf() + hyOf(t) * 0.95, zOf(t)]; },
      (s) => {
        const t = d.t0 + (d.t1 - d.t0) * s;
        const bump = Math.sin(Math.PI * s);
        return [0, dyOf() + hyOf(t) * 0.95 + d.h * L * bump, zOf(t) - d.sweep * L * bump];
      },
      5, 4, 3, 0, 0.08
    );
  }
  for (const side of [-1, 1]) {
    const p = sp.pect;
    const st = stationAt(sp.stations, p.t);
    const hy0 = st.hy * L, hw0 = hy0 * st.hw;
    gridFin(
      (s) => {
        const pad = Math.sin(s * Math.PI) * 0.15;
        return [side * hw0 * (0.88 + pad * 0.05), dyOf() - hy0 * 0.28, zOf(p.t) - s * p.w * L];
      },
      (s) => {
        const fan = Math.sin(s * Math.PI);
        return [
          side * (hw0 * 0.9 + p.len * L * (0.55 + 0.35 * fan)),
          dyOf() - hy0 * 0.40 - fan * 0.014 * L,
          zOf(p.t) - p.len * L * (0.28 + 0.72 * s),
        ];
      },
      8, 6, 2, side, 0.22, 0, L * 0.0008
    );
  }
  if (sp.pelvic) {
    for (const side of [-1, 1]) {
      const p = sp.pelvic;
      const hy0 = hyOf(p.t);
      gridFin(
        (s) => [side * 0.005, dyOf() - hy0 * 0.85, zOf(p.t) - s * 0.03 * L],
        (s) => [side * 0.008, dyOf() - hy0 * 0.85 - p.len * L * (0.35 + 0.65 * (1 - s * 0.35)), zOf(p.t) - 0.24 * L - s * 0.06 * L],
        6, 6, 3, side, 0.1, angelThick * 0.5
      );
    }
  }

  const fins = new THREE.BufferGeometry();
  fins.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  fins.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
  fins.setAttribute('aT', new THREE.Float32BufferAttribute(ft, 1));
  fins.setAttribute('aFin', new THREE.Float32BufferAttribute(ff, 1));
  fins.setAttribute('aSide', new THREE.Float32BufferAttribute(fs, 1));
  fins.setAttribute('aDist', new THREE.Float32BufferAttribute(fd, 1));
  fins.setIndex(fi);
  fins.computeVertexNormals();

  const eye = sp.eye || { t: 0.1, y: 0.03, r: 0.04 };
  const stE = stationAt(sp.stations, eye.t);
  const eyeLayout = {
    t: eye.t,
    y: dyOf() + eye.y * L,
    z: zOf(eye.t),
    r: eye.r * L,
    xMul: stE.hy * L * stE.hw * 0.92,
  };

  return { body, fins, eyeLayout };
}

// ------------------------------------------------------------------------------------------------
// Skin textures, painted in code. Texture space: u = nose(0) -> tail fin tip(1), v = vertical.
// ------------------------------------------------------------------------------------------------
function silhouette(ctx, sp, W, H, fill) {
  const L = sp.L, Ltot = L * sp.ltot, Hbox = sp.hbox;
  const uv = (t, y) => [((L / 2 - (L / 2 - t * L)) / Ltot) * W, (0.5 - y / Hbox) * H];
  ctx.beginPath();
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const hy = (sp.stations ? stationAt(sp.stations, t).hy : prof(sp.hy, t)) * L;
    const [x, y] = uv(t, sp.dy * L + hy);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const st = sp.stations ? stationAt(sp.stations, t) : null;
    const hy = (st ? st.hy : prof(sp.hy, t)) * L * (st ? st.belly : sp.belly);
    const [x, y] = uv(t, sp.dy * L - hy);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
}

const rgba = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

function scalePattern(ctx, sp, W, H, alpha, size) {
  ctx.save();
  silhouette(ctx, sp, W, H, null);
  ctx.clip();
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 1;
  const kind = sp.scale || 'med';
  const rowH = kind === 'fine' ? size * 0.45 : kind === 'large' ? size * 0.9 : kind === 'scute' ? size * 1.1 : size * 0.62;
  for (let y = 0; y < H; y += rowH) {
    const odd = Math.round(y / rowH) % 2;
    for (let x = odd * size * 0.5; x < W; x += size) {
      if (kind === 'scute') {
        // two lateral armour rows — rectangular scutes
        ctx.strokeStyle = `rgba(40,30,18,${alpha * 1.4})`;
        ctx.strokeRect(x, y, size * 0.85, rowH * 0.7);
      } else {
        ctx.beginPath(); ctx.arc(x, y, size * 0.55, -0.2, Math.PI * 0.62); ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** Bake a scale-row normal map (tangent-space-ish encoded as RGB). */
function makeScaleNormal(key, sp, W = 512, H = 256) {
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const kind = sp.scale || 'med';
  const rowH = kind === 'fine' ? 4 : kind === 'large' ? 10 : kind === 'scute' ? 12 : 7;
  const colW = kind === 'fine' ? 5 : kind === 'large' ? 12 : kind === 'scute' ? 14 : 8;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const u = x / W, v = y / H;
      // only inside silhouette approx via vertical body band
      let nx = 0, ny = 0;
      if (kind === 'scute') {
        const row = Math.floor(y / rowH), col = Math.floor(x / colW);
        const lx = (x % colW) / colW, ly = (y % rowH) / rowH;
        nx = (lx - 0.5) * 1.6;
        ny = (ly - 0.5) * 1.2;
        // two lateral rows emphasis (mid flanks)
        if (Math.abs(v - 0.5) > 0.28) { nx *= 0.25; ny *= 0.25; }
      } else {
        const row = y / rowH;
        const odd = Math.floor(row) % 2;
        const lx = ((x + odd * colW * 0.5) % colW) / colW;
        const ly = (y % rowH) / rowH;
        // cycloid bump: raised leading edge
        const bump = Math.sin(lx * Math.PI) * Math.sin(ly * Math.PI);
        nx = Math.cos(lx * Math.PI) * 0.9;
        ny = Math.cos(ly * Math.PI) * 0.55 * bump;
      }
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, { srgb: false, aniso: 4 });
}

/** Sphere-mapped eye texture: sclera, iris, pupil, cornea highlight. */
export function makeEyeMap(iris = '#c8d2d8') {
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S * 0.46, S * 0.44, S * 0.05, S * 0.5, S * 0.5, S * 0.5);
  g.addColorStop(0, '#050508');
  g.addColorStop(0.22, '#050508');
  g.addColorStop(0.28, iris);
  g.addColorStop(0.48, iris);
  g.addColorStop(0.62, '#eef2f5');
  g.addColorStop(1, '#d8dee4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.arc(S * 0.34, S * 0.32, S * 0.09, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(200,220,255,0.45)';
  ctx.beginPath(); ctx.arc(S * 0.62, S * 0.58, S * 0.04, 0, 6.3); ctx.fill();
  return canvasTexture(c, { repeat: false, aniso: 2 });
}

function eye(ctx, sp, W, H, tx, ty, r, ring) {
  const L = sp.L, Ltot = L * sp.ltot;
  const x = (tx * L / Ltot) * W, y = (0.5 - (sp.dy * L + ty * L) / sp.hbox) * H;
  // sclera
  ctx.fillStyle = 'rgba(245,248,250,0.92)';
  ctx.beginPath(); ctx.arc(x, y, r * 1.55, 0, Math.PI * 2); ctx.fill();
  // iris
  const iris = ctx.createRadialGradient(x - r * 0.08, y - r * 0.1, r * 0.12, x, y, r * 1.35);
  iris.addColorStop(0, ring); iris.addColorStop(0.45, ring); iris.addColorStop(0.72, '#1a1c20'); iris.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = iris; ctx.beginPath(); ctx.arc(x, y, r * 1.22, 0, Math.PI * 2); ctx.fill();
  // pupil
  ctx.fillStyle = '#020203'; ctx.beginPath(); ctx.arc(x - r * 0.04, y - r * 0.02, r * 0.42, 0, Math.PI * 2); ctx.fill();
  // wet cornea speculars
  ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.36, r * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(210,230,255,0.55)'; ctx.beginPath(); ctx.arc(x + r * 0.22, y + r * 0.16, r * 0.11, 0, Math.PI * 2); ctx.fill();
  // lower lid soft shadow
  ctx.strokeStyle = 'rgba(20,18,16,0.35)'; ctx.lineWidth = r * 0.18;
  ctx.beginPath(); ctx.arc(x, y + r * 0.15, r * 1.05, 0.15, Math.PI - 0.15); ctx.stroke();
}

/** Paint thin fin rays (radial lines from base) into fin regions of the shared UV atlas. */
function paintFinRays(ctx, sp, W, H, key, px, py) {
  const L = sp.L, Ltot = L * sp.ltot;
  const bodyEnd = (L / Ltot) * W;
  const rayCol = {
    neon: 'rgba(220,235,240,0.55)',
    platy: 'rgba(255,200,140,0.5)',
    angel: 'rgba(55,55,62,0.28)',
    cory: 'rgba(255,230,190,0.45)',
  }[key];
  const rayDark = {
    neon: 'rgba(20,30,35,0.5)',
    platy: 'rgba(60,15,5,0.55)',
    angel: 'rgba(20,20,26,0.32)',
    cory: 'rgba(40,28,15,0.5)',
  }[key];
  ctx.save();
  ctx.lineCap = 'round';
  const isAngel = key === 'angel';
  const nCaudal = isAngel ? 9 : 13;
  const nDorsal = isAngel ? 7 : 10;
  const nAnal = isAngel ? 6 : 9;

  // caudal rays from peduncle → tip
  const cx = bodyEnd * 0.98;
  const cy = H * 0.5;
  for (let i = 0; i < nCaudal; i++) {
    const a = -1.05 + (i / Math.max(1, nCaudal - 1)) * 2.1;
    const tipX = bodyEnd + (W - bodyEnd) * 0.92;
    const pairs = isAngel ? [[rayDark, 1.4, 0]] : [[rayDark, 2.0, 0], [rayCol, 1.0, 0.5]];
    for (const [col, w, ox] of pairs) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = (isAngel ? 0.35 : 0.55) + 0.35 * Math.sin((i / Math.max(1, nCaudal - 1)) * Math.PI);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(cx, cy + Math.sin(a) * H * 0.05);
      ctx.quadraticCurveTo(
        cx + (tipX - cx) * 0.4, cy + Math.sin(a) * H * 0.22 + ox,
        tipX, cy + Math.sin(a) * H * 0.40
      );
      ctx.stroke();
    }
  }

  // dorsal rays
  const d = sp.dorsal;
  const d0 = px(d.t0), d1 = px(d.t1);
  for (let i = 0; i < nDorsal; i++) {
    const t = i / Math.max(1, nDorsal - 1);
    const x0 = d0 + (d1 - d0) * t;
    ctx.strokeStyle = rayDark; ctx.globalAlpha = isAngel ? 0.32 : 0.6; ctx.lineWidth = isAngel ? 1.1 : 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, py(prof(sp.hy, d.t0 + (d.t1 - d.t0) * t) * 0.95));
    ctx.lineTo(x0 - d.sweep * (L / Ltot) * W * 0.55 * (0.3 + 0.7 * t), 2 + t * 10);
    ctx.stroke();
    if (!isAngel) { ctx.strokeStyle = rayCol; ctx.lineWidth = 0.8; ctx.stroke(); }
  }
  // anal rays
  const an = sp.anal;
  const a0 = px(an.t0), a1 = px(an.t1);
  for (let i = 0; i < nAnal; i++) {
    const t = i / Math.max(1, nAnal - 1);
    const x0 = a0 + (a1 - a0) * t;
    ctx.strokeStyle = rayDark; ctx.globalAlpha = isAngel ? 0.28 : 0.55; ctx.lineWidth = isAngel ? 1.0 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, py(-prof(sp.hy, an.t0 + (an.t1 - an.t0) * t) * sp.belly * 0.95));
    ctx.lineTo(x0 - an.sweep * (L / Ltot) * W * 0.5 * (0.3 + 0.7 * t), H - 2 - t * 8);
    ctx.stroke();
    if (!isAngel) { ctx.strokeStyle = rayCol; ctx.lineWidth = 0.8; ctx.stroke(); }
  }
  // pectoral suggestion (mid flanks)
  const p = sp.pect;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      ctx.strokeStyle = rayDark; ctx.globalAlpha = isAngel ? 0.25 : 0.45; ctx.lineWidth = 1.1;
      const y0 = py(-prof(sp.hy, p.t) * 0.25);
      ctx.beginPath();
      ctx.moveTo(px(p.t), y0 + side * 2);
      ctx.lineTo(px(p.t + 0.08 + t * 0.06), y0 + side * (8 + t * 18));
      ctx.stroke();
    }
  }
  ctx.restore();
}

function bodyBaseColor(key) {
  return { neon: '#8fa08c', platy: '#ff7a1a', angel: '#f0ece4', cory: '#c9a878' }[key];
}

export function paintSkin(key, sp) {
  const W = 768, H = 384;
  const L = sp.L, Ltot = L * sp.ltot;
  const px = (t) => (t * L / Ltot) * W;
  const py = (y) => (0.5 - (sp.dy * L + y * L) / sp.hbox) * H;

  // ---- BODY canvas: fully opaque underlay so body mesh never samples alpha < 1
  const bc = makeCanvas(W, H), bctx = bc.getContext('2d');
  bctx.fillStyle = bodyBaseColor(key);
  bctx.fillRect(0, 0, W, H);

  // ---- FIN canvas: translucent membrane
  const fc = makeCanvas(W, H), fctx = fc.getContext('2d');
  fctx.clearRect(0, 0, W, H);
  const finCol = {
    neon: [195, 210, 218, 0.42],
    platy: [255, 130, 60, 0.45],
    angel: [232, 228, 218, 0.92],
    cory: [195, 175, 145, 0.42],
  }[key];
  fctx.fillStyle = rgba(...finCol);
  fctx.fillRect(0, 0, W, H);

  const paintBodyInto = (ctx) => {
    const body = ctx.createLinearGradient(0, py(sp.hy[3][1]), 0, py(-sp.hy[3][1] * sp.belly));
    if (key === 'neon') {
      body.addColorStop(0, '#242e1e'); body.addColorStop(0.35, '#5a6a55'); body.addColorStop(0.55, '#c9d3cf'); body.addColorStop(1, '#e8e4dc');
    } else if (key === 'platy') {
      body.addColorStop(0, '#c44810'); body.addColorStop(0.35, '#f07020'); body.addColorStop(0.7, '#ffb060'); body.addColorStop(1, '#ffe0b0');
    } else if (key === 'angel') {
      body.addColorStop(0, '#8d949a'); body.addColorStop(0.4, '#dfe4e6'); body.addColorStop(1, '#f2f0e8');
    } else {
      body.addColorStop(0, '#6d5533'); body.addColorStop(0.45, '#b08c58'); body.addColorStop(1, '#e2cfa6');
    }
    silhouette(ctx, sp, W, H, body);

    ctx.save();
    silhouette(ctx, sp, W, H, null);
    ctx.clip();

    if (key === 'neon') {
      const rg = ctx.createLinearGradient(px(0.32), 0, px(0.52), 0);
      rg.addColorStop(0, 'rgba(210,25,20,0)'); rg.addColorStop(1, 'rgba(226,28,20,1)');
      ctx.fillStyle = rg;
      ctx.fillRect(px(0.3), py(0.005), px(0.7), H);
      // belly translucency wash (redder, slightly luminous)
      const bel = ctx.createLinearGradient(0, py(0.02), 0, py(-0.12));
      bel.addColorStop(0, 'rgba(200,40,30,0)'); bel.addColorStop(0.5, 'rgba(220,50,35,0.35)'); bel.addColorStop(1, 'rgba(240,90,70,0.55)');
      ctx.fillStyle = bel; ctx.fillRect(0, py(-0.02), W, H);
      ctx.fillStyle = 'rgba(20,28,22,0.55)'; ctx.fillRect(0, 0, W, py(0.045));
      // iridescent neon stripe
      const sg = ctx.createLinearGradient(px(0.12), 0, px(0.95), 0);
      sg.addColorStop(0, 'rgba(40,90,130,0.0)');
      sg.addColorStop(0.12, 'rgba(30,160,220,0.95)');
      sg.addColorStop(0.55, 'rgba(60,200,230,0.95)');
      sg.addColorStop(1, 'rgba(90,180,210,0.6)');
      ctx.strokeStyle = sg; ctx.lineWidth = H * 0.034; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px(0.10), py(0.045)); ctx.quadraticCurveTo(px(0.55), py(0.062), px(0.97), py(0.020)); ctx.stroke();
      ctx.strokeStyle = 'rgba(180,240,255,0.45)'; ctx.lineWidth = H * 0.01;
      ctx.beginPath(); ctx.moveTo(px(0.12), py(0.052)); ctx.quadraticCurveTo(px(0.55), py(0.070), px(0.95), py(0.028)); ctx.stroke();
      // operculum edge + mouth
      ctx.strokeStyle = 'rgba(15,20,18,0.55)'; ctx.lineWidth = H * 0.012;
      ctx.beginPath(); ctx.moveTo(px(0.16), py(0.06)); ctx.quadraticCurveTo(px(0.20), py(0.0), px(0.18), py(-0.05)); ctx.stroke();
      ctx.strokeStyle = 'rgba(30,20,18,0.7)'; ctx.lineWidth = H * 0.008;
      ctx.beginPath(); ctx.moveTo(px(0.01), py(-0.01)); ctx.quadraticCurveTo(px(0.04), py(-0.025), px(0.07), py(-0.015)); ctx.stroke();
      scalePattern(ctx, sp, W, H, 0.12, 6);
    } else if (key === 'platy') {
      // lighter belly fade + warm translucency
      const bel = ctx.createLinearGradient(0, py(0.06), 0, py(-0.14));
      bel.addColorStop(0, 'rgba(255,200,120,0)'); bel.addColorStop(0.35, 'rgba(255,140,70,0.4)'); bel.addColorStop(1, 'rgba(255,210,160,0.75)');
      ctx.fillStyle = bel; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(100,18,0,0.22)'; ctx.fillRect(0, 0, W, py(0.14));
      scalePattern(ctx, sp, W, H, 0.28, 8);
      for (let i = 0; i < 200; i++) {
        const gx = px(0.12 + Math.random() * 0.75), gy = py(-0.08 + Math.random() * 0.2);
        ctx.fillStyle = `rgba(255,248,220,${0.28 + Math.random() * 0.6})`;
        ctx.beginPath(); ctx.arc(gx, gy, 0.6 + Math.random() * 1.8, 0, 6.3); ctx.fill();
      }
      for (let i = 0; i < 22; i++) {
        ctx.fillStyle = 'rgba(30,8,0,0.32)';
        ctx.beginPath(); ctx.arc(px(0.3 + Math.random() * 0.6), py(-0.1 + Math.random() * 0.22), 1.2 + Math.random() * 2, 0, 6.3); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(60,20,10,0.5)'; ctx.lineWidth = H * 0.014;
      ctx.beginPath(); ctx.moveTo(px(0.18), py(0.08)); ctx.quadraticCurveTo(px(0.24), py(0.0), px(0.20), py(-0.08)); ctx.stroke();
      ctx.strokeStyle = 'rgba(40,12,8,0.65)'; ctx.lineWidth = H * 0.01;
      ctx.beginPath(); ctx.moveTo(px(0.01), py(-0.02)); ctx.quadraticCurveTo(px(0.05), py(-0.04), px(0.09), py(-0.02)); ctx.stroke();
    } else if (key === 'angel') {
      const bars = [[0.08, 0.075], [0.44, 0.085], [0.86, 0.06]];
      for (const [t, w] of bars) {
        const g = ctx.createLinearGradient(px(t - w), 0, px(t + w), 0);
        g.addColorStop(0, 'rgba(15,15,18,0)'); g.addColorStop(0.35, 'rgba(15,15,18,0.92)'); g.addColorStop(0.65, 'rgba(15,15,18,0.92)'); g.addColorStop(1, 'rgba(15,15,18,0)');
        ctx.fillStyle = g; ctx.fillRect(px(t - w), 0, px(w * 2), H);
      }
      const gg = ctx.createRadialGradient(px(0.3), py(0.05), 0, px(0.3), py(0.05), px(0.5));
      gg.addColorStop(0, 'rgba(235,170,70,0.5)'); gg.addColorStop(1, 'rgba(235,170,70,0)');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
      // silver iridescent wash
      const ir = ctx.createLinearGradient(0, py(0.2), 0, py(-0.15));
      ir.addColorStop(0, 'rgba(200,220,240,0.0)'); ir.addColorStop(0.45, 'rgba(210,225,240,0.22)'); ir.addColorStop(1, 'rgba(240,245,250,0.12)');
      ctx.fillStyle = ir; ctx.fillRect(0, 0, W, H);
      scalePattern(ctx, sp, W, H, 0.14, 12);
      ctx.strokeStyle = 'rgba(30,30,36,0.45)'; ctx.lineWidth = H * 0.012;
      ctx.beginPath(); ctx.moveTo(px(0.17), py(0.12)); ctx.quadraticCurveTo(px(0.22), py(0.0), px(0.19), py(-0.1)); ctx.stroke();
    } else {
      // corydoras armour plates + speckles
      for (let row = 0; row < 5; row++) {
        const yy = py(0.08 - row * 0.035);
        ctx.strokeStyle = `rgba(55,40,22,${0.35 + row * 0.05})`; ctx.lineWidth = H * 0.018;
        ctx.beginPath();
        ctx.moveTo(px(0.12), yy);
        for (let k = 0; k < 8; k++) {
          const tt = 0.12 + k * 0.1;
          ctx.lineTo(px(tt), yy + Math.sin(k * 1.2) * H * 0.008);
        }
        ctx.stroke();
      }
      for (let i = 0; i < 110; i++) {
        ctx.fillStyle = `rgba(40,28,15,${0.25 + Math.random() * 0.4})`;
        ctx.beginPath(); ctx.arc(px(0.15 + Math.random() * 0.8), py(-0.02 + Math.random() * 0.16), 1.5 + Math.random() * 4, 0, 6.3); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(70,52,30,0.55)'; ctx.lineWidth = H * 0.05;
      ctx.beginPath(); ctx.moveTo(px(0.2), py(0.03)); ctx.lineTo(px(0.98), py(0.02)); ctx.stroke();
      // dorsal spine base plate
      ctx.fillStyle = 'rgba(40,30,18,0.7)'; ctx.beginPath(); ctx.ellipse(px(0.42), py(0.10), px(0.07), H * 0.08, 0, 0, 6.3); ctx.fill();
      ctx.strokeStyle = 'rgba(50,35,20,0.6)'; ctx.lineWidth = H * 0.014;
      ctx.beginPath(); ctx.moveTo(px(0.18), py(0.05)); ctx.quadraticCurveTo(px(0.24), py(-0.02), px(0.20), py(-0.07)); ctx.stroke();
    }
    ctx.restore();

    // orbital socket recess (real eye spheres sit on top)
    const eyeSpec = { neon: [0.10, 0.025, 14], platy: [0.11, 0.032, 12], angel: [0.12, 0.095, 14], cory: [0.12, 0.042, 11] }[key];
    {
      const L = sp.L, Ltot = sp.L * sp.ltot;
      const x = (eyeSpec[0] * L / Ltot) * W;
      const y = (0.5 - (sp.dy * L + eyeSpec[1] * L) / sp.hbox) * H;
      const r = eyeSpec[2];
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.6);
      g.addColorStop(0, 'rgba(8,6,5,0.92)');
      g.addColorStop(0.55, 'rgba(20,16,12,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 1.55, 0, Math.PI * 2); ctx.fill();
    }
  };

  paintBodyInto(bctx);

  // fins: also stamp body silhouette opaque so overlapping UV samples stay solid, then decorate
  fctx.fillStyle = bodyBaseColor(key);
  silhouette(fctx, sp, W, H, fctx.fillStyle);
  paintBodyInto(fctx);

  // re-assert translucent membrane outside body for true fin areas
  fctx.save();
  // punch soft membrane over fin zones with destination-over style: draw rays + edge fade
  paintFinRays(fctx, sp, W, H, key, px, py);

  if (key === 'neon') {
    fctx.fillStyle = 'rgba(210,30,20,0.40)'; fctx.fillRect(px(0.5), py(-0.06), px(0.32), H);
  } else if (key === 'platy') {
    const tg = fctx.createLinearGradient(px(1.0), 0, px(1.28), 0);
    tg.addColorStop(0, 'rgba(255,120,55,0)'); tg.addColorStop(0.55, 'rgba(160,40,15,0)'); tg.addColorStop(1, 'rgba(20,6,5,0.55)');
    fctx.fillStyle = tg; fctx.fillRect(px(1.0), 0, W - px(1.0), H);
  } else if (key === 'angel') {
    // soft membrane wash only — avoid second hard ray grid on top of paintFinRays
    fctx.save(); fctx.globalCompositeOperation = 'source-atop';
    const cg = fctx.createLinearGradient(px(1.0), 0, px(1.34), 0);
    cg.addColorStop(0, 'rgba(240,160,70,0.0)'); cg.addColorStop(1, 'rgba(240,150,60,0.28)');
    fctx.fillStyle = cg; fctx.fillRect(px(1.0), 0, W - px(1.0), H);
    fctx.restore();
  }
  // soften outer membrane: reduce alpha toward canvas edges for fin tips
  fctx.globalCompositeOperation = 'destination-in';
  const edge = fctx.createRadialGradient(W * 0.45, H * 0.5, H * 0.15, W * 0.55, H * 0.5, W * 0.75);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(0.55, 'rgba(0,0,0,0.85)');
  edge.addColorStop(1, 'rgba(0,0,0,0.28)');
  // actually we want fin tips translucent but not erase body — skip global punch; use soft tip wash instead
  fctx.restore();
  fctx.save();
  fctx.globalCompositeOperation = 'destination-out';
  const tipFade = fctx.createLinearGradient(px(1.05), 0, W, 0);
  // angel keeps more tip opacity so tall fins don't ghost at grazing angles
  tipFade.addColorStop(0, 'rgba(0,0,0,0)'); tipFade.addColorStop(1, key === 'angel' ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.45)');
  fctx.fillStyle = tipFade; fctx.fillRect(px(1.02), 0, W - px(1.02), H);
  fctx.restore();

  // ---- maps
  let emissive = null, metalness = null, roughness = null;
  if (key === 'neon') {
    // metalness: bright band on stripe (no emissive — bloom was reading as glow-stick)
    const mc = makeCanvas(W, H), mx = mc.getContext('2d');
    mx.fillStyle = '#0a0a0a'; mx.fillRect(0, 0, W, H);
    mx.save();
    silhouette(mx, sp, W, H, null); mx.clip();
    mx.strokeStyle = '#c8c8c8'; mx.lineWidth = H * 0.036; mx.lineCap = 'round';
    mx.beginPath(); mx.moveTo(px(0.10), py(0.045)); mx.quadraticCurveTo(px(0.55), py(0.062), px(0.97), py(0.020)); mx.stroke();
    mx.strokeStyle = '#e8e8e8'; mx.lineWidth = H * 0.014;
    mx.beginPath(); mx.moveTo(px(0.12), py(0.050)); mx.quadraticCurveTo(px(0.55), py(0.068), px(0.95), py(0.025)); mx.stroke();
    mx.restore();
    metalness = canvasTexture(mc, { repeat: false });

    const rc = makeCanvas(W, H), rx = rc.getContext('2d');
    rx.fillStyle = '#b0b0b0'; rx.fillRect(0, 0, W, H);
    rx.save();
    silhouette(rx, sp, W, H, null); rx.clip();
    rx.strokeStyle = '#3a3a3a'; rx.lineWidth = H * 0.040; rx.lineCap = 'round';
    rx.beginPath(); rx.moveTo(px(0.10), py(0.045)); rx.quadraticCurveTo(px(0.55), py(0.062), px(0.97), py(0.020)); rx.stroke();
    rx.restore();
    roughness = canvasTexture(rc, { repeat: false });
  } else if (key === 'platy') {
    // denser glitter metalness
    const mc = makeCanvas(W, H), mx = mc.getContext('2d');
    mx.fillStyle = '#101010'; mx.fillRect(0, 0, W, H);
    mx.save(); silhouette(mx, sp, W, H, null); mx.clip();
    for (let i = 0; i < 160; i++) {
      mx.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.65})`;
      mx.beginPath(); mx.arc(px(0.15 + Math.random() * 0.7), py(-0.08 + Math.random() * 0.2), 0.55 + Math.random() * 1.4, 0, 6.3); mx.fill();
    }
    mx.restore();
    metalness = canvasTexture(mc, { repeat: false });
  }

  // force body canvas fully opaque (no accidental alpha from gradients)
  const img = bctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
  bctx.putImageData(img, 0, 0);

  const bodyMap = canvasTexture(bc, { repeat: false, aniso: 4 });
  bodyMap.wrapS = bodyMap.wrapT = THREE.ClampToEdgeWrapping;
  const map = canvasTexture(fc, { repeat: false, aniso: 4 });
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const normal = makeScaleNormal(key, sp);
  normal.wrapS = normal.wrapT = THREE.ClampToEdgeWrapping;
  const eyeIris = { neon: '#a8c0d0', platy: '#e6c890', angel: '#d94a2a', cory: '#c9b08a' }[key];
  const eyeMap = makeEyeMap(eyeIris);
  return { map, bodyMap, emissive, metalness, roughness, normal, eyeMap };
}
