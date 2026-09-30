import * as THREE from 'three';
import { makeCanvas, canvasTexture } from '../core/textures.js';

// ------------------------------------------------------------------------------------------------
// Species definitions. Nose points +Z, up is +Y. All dimensions in metres / fractions of body length L.
// ------------------------------------------------------------------------------------------------
export const SPECIES = {
  neon: {
    label: 'Neon tetra', count: 7, L: 0.034, hbox: 0.030, ltot: 1.30,
    // smoother torpedo: more profile knots, rounder head/tail joins
    hy: [[0, 0], [0.03, 0.028], [0.08, 0.070], [0.18, 0.108], [0.38, 0.122], [0.55, 0.112], [0.72, 0.078], [0.88, 0.042], [0.96, 0.030], [1, 0.026]],
    hw: 0.68, belly: 0.94, dy: 0.0,
    caudal: { len: 0.26, spread: 0.13, notch: 0.58 },
    dorsal: { t0: 0.40, t1: 0.58, h: 0.13, sweep: 0.10 },
    anal: { t0: 0.52, t1: 0.72, h: 0.10, sweep: 0.08 },
    pect: { t: 0.24, len: 0.15, w: 0.05 },
    speed: 0.075, turn: 3.2, school: 1.0, yPref: [0.10, 0.33], iri: 0.95, emissive: 0.0,
    dispersion: 0.06,
  },
  platy: {
    label: 'Red platy', count: 3, L: 0.046, hbox: 0.05, ltot: 1.30,
    hy: [[0, 0], [0.04, 0.055], [0.12, 0.11], [0.28, 0.17], [0.45, 0.19], [0.62, 0.165], [0.8, 0.10], [0.92, 0.068], [1, 0.055]],
    hw: 0.58, belly: 0.92, dy: 0.0,
    caudal: { len: 0.27, spread: 0.19, notch: 0.72 },
    dorsal: { t0: 0.36, t1: 0.58, h: 0.16, sweep: 0.12 },
    anal: { t0: 0.52, t1: 0.70, h: 0.10, sweep: 0.06 },
    pect: { t: 0.26, len: 0.16, w: 0.06 },
    speed: 0.060, turn: 2.4, school: 0.5, yPref: [0.07, 0.34], iri: 0.28, emissive: 0.0,
    dispersion: 0.08,
  },
  angel: {
    label: 'Angelfish', count: 2, L: 0.055, hbox: 0.125, ltot: 1.55,
    hy: [[0, 0], [0.03, 0.07], [0.10, 0.22], [0.22, 0.36], [0.40, 0.44], [0.58, 0.40], [0.75, 0.26], [0.90, 0.10], [0.97, 0.055], [1, 0.042]],
    hw: 0.36, belly: 0.92, dy: 0.0,
    caudal: { len: 0.34, spread: 0.30, notch: 0.82 },
    dorsal: { t0: 0.34, t1: 0.86, h: 0.92, sweep: 0.55 },
    anal: { t0: 0.46, t1: 0.92, h: 0.80, sweep: 0.5 },
    pect: { t: 0.30, len: 0.16, w: 0.06 },
    pelvic: { t: 0.32, len: 0.9 },
    speed: 0.038, turn: 1.4, school: 0.4, yPref: [0.16, 0.34], iri: 0.35, emissive: 0.0,
    dispersion: 0.04,
  },
  cory: {
    label: 'Corydoras', count: 2, L: 0.048, hbox: 0.040, ltot: 1.28,
    // blunt rounded snout
    hy: [[0, 0], [0.02, 0.038], [0.06, 0.072], [0.14, 0.115], [0.32, 0.155], [0.5, 0.160], [0.68, 0.125], [0.84, 0.075], [0.94, 0.048], [1, 0.040]],
    hw: 1.08, belly: 0.55, dy: 0.015,
    caudal: { len: 0.24, spread: 0.13, notch: 0.68 },
    dorsal: { t0: 0.30, t1: 0.46, h: 0.18, sweep: 0.14 },
    anal: { t0: 0.6, t1: 0.72, h: 0.06, sweep: 0.05 },
    pect: { t: 0.26, len: 0.17, w: 0.07 },
    barbels: true,
    speed: 0.035, turn: 2.0, school: 0.8, yPref: [0.0, 0.03], iri: 0.05, emissive: 0.0, bottom: true,
    dispersion: 0.0,
  },
};

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

function pushEyeDome(bp, bt, bf, bs, bd, buv, bi, sp, L, side, eyeT, eyeYFrac, eyeR, eyeU, eyeV) {
  const zOf = (t) => L / 2 - t * L;
  const hy = prof(sp.hy, eyeT) * L;
  const hw = hy * sp.hw;
  const dy = sp.dy * L;
  const cx = side * hw * 0.95;
  const cy = dy + eyeYFrac * L;
  const cz = zOf(eyeT);
  const segs = 7, rings = 5;
  const start = bp.length / 3;
  // pole + rings; UV locked to painted eye so dome samples dark cornea
  bp.push(cx + side * eyeR * 0.15, cy, cz + eyeR * 0.35);
  bt.push(eyeT); bf.push(0); bs.push(side); bd.push(0);
  buv.push(eyeU, eyeV);
  for (let r = 1; r <= rings; r++) {
    const pr = (r / rings) * Math.PI * 0.55;
    const rr = Math.sin(pr) * eyeR;
    const zz = Math.cos(pr) * eyeR;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      bp.push(cx + Math.cos(a) * rr * side * 0.35 + side * rr * 0.65, cy + Math.sin(a) * rr, cz + zz * 0.55 + eyeR * 0.2);
      bt.push(eyeT); bf.push(0); bs.push(side); bd.push(0);
      // slight UV bias toward catch-light for upper-front verts
      const catchL = Math.max(0, Math.sin(a) * 0.35 + Math.cos(pr) * 0.2);
      buv.push(eyeU - catchL * 0.012 * side, eyeV - catchL * 0.01);
    }
  }
  // tip to first ring
  for (let j = 0; j < segs; j++) {
    const a = start + 1 + j, b = start + 1 + (j + 1) % segs;
    bi.push(start, a, b);
  }
  for (let r = 0; r < rings - 1; r++) {
    for (let j = 0; j < segs; j++) {
      const a = start + 1 + r * segs + j;
      const b = start + 1 + r * segs + (j + 1) % segs;
      const c = start + 1 + (r + 1) * segs + j;
      const d = start + 1 + (r + 1) * segs + (j + 1) % segs;
      bi.push(a, c, b, b, c, d);
    }
  }
}

function pushBarbels(bp, bt, bf, bs, bd, buv, bi, sp, L) {
  // short tapered strips near the mouth (part of body mesh)
  const zOf = (t) => L / 2 - t * L;
  const dy = sp.dy * L;
  const hy0 = prof(sp.hy, 0.04) * L;
  const rows = 4, cols = 3;
  for (const side of [-1, 1]) {
    for (const tier of [0, 1]) {
      const start = bp.length / 3;
      const y0 = dy - hy0 * (0.15 + tier * 0.22);
      const z0 = zOf(0.02);
      for (let r = 0; r <= rows; r++) {
        const u = r / rows;
        const taper = 1 - u * 0.92;
        const len = L * (0.11 + tier * 0.03);
        const droop = u * u * L * 0.04;
        for (let c = 0; c <= cols; c++) {
          const v = c / cols;
          const w = L * 0.006 * taper * (0.4 + 0.6 * Math.sin(v * Math.PI));
          const x = side * (hy0 * sp.hw * 0.55 + u * len * 0.55 + (v - 0.5) * w);
          const y = y0 - droop - u * L * 0.02;
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

/** Build indexed geometry: body + fins, with per-vertex attributes aT/aFin/aSide/aDist */
export function buildFishGeometry(sp, seg = 32, ring = 14) {
  const L = sp.L;
  const Ltot = L * sp.ltot;
  const Hbox = sp.hbox;
  const uvOf = (x, y, z) => [(L / 2 - z) / Ltot, 0.5 + y / Hbox];
  const zOf = (t) => L / 2 - t * L;
  const hyOf = (t) => prof(sp.hy, t) * L;
  const dyOf = () => sp.dy * L;

  // ---- body (fin types: 0)
  const bp = [], bt = [], bf = [], bs = [], bd = [], buv = [], bi = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const z = zOf(t), hy = hyOf(t), hw = hy * sp.hw;
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const sy = Math.sin(a);
      const x = Math.cos(a) * hw;
      const y = dyOf() + (sy >= 0 ? sy * hy : sy * hy * sp.belly);
      bp.push(x, y, z);
      bt.push(t); bf.push(0); bs.push(0); bd.push(0);
      buv.push(...uvOf(x, y, z));
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + (j + 1) % ring, c = (i + 1) * ring + j, d = (i + 1) * ring + (j + 1) % ring;
    bi.push(a, c, b, b, c, d);
  }

  // eye domes (slight protrusion, dark cornea via UV)
  const eyeSpec = {
    neon: [0.085, 0.02, 0.038],
    platy: [0.09, 0.028, 0.036],
    angel: [0.09, 0.085, 0.042],
    cory: [0.11, 0.038, 0.034],
  };
  const key = Object.keys(SPECIES).find((k) => SPECIES[k] === sp) || 'neon';
  const es = eyeSpec[key] || eyeSpec.neon;
  // match body uvOf (v grows with +Y); canvas flipY aligns with painted eye
  const eyeU = (es[0] * L / Ltot);
  const eyeV = 0.5 + (sp.dy * L + es[1] * L) / Hbox;
  for (const side of [-1, 1]) {
    pushEyeDome(bp, bt, bf, bs, bd, buv, bi, sp, L, side, es[0], es[1], es[2] * L, eyeU, eyeV);
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

  // ---- fins — denser grids, curved trailing edges
  // Angel median fins get a tiny ±X slab so grazing angles stay opaque (not paper-thin ghosts).
  const angelThick = sp === SPECIES.angel ? 0.018 * L : 0;
  const fp = [], ft = [], ff = [], fs = [], fd = [], fuv = [], fi = [];
  const gridFin = (baseFn, outerFn, rows, cols, type, side = 0, curve = 0.18, thick = 0) => {
    const layers = thick > 0 ? [-1, 1] : [0];
    for (const sx of layers) {
      const start = fp.length / 3;
      for (let r = 0; r <= rows; r++) {
        const s = r / rows;
        const b = baseFn(s), o = outerFn(s);
        for (let c = 0; c <= cols; c++) {
          const k = c / cols;
          // ease toward tip + soft lateral bow so edges aren't hard triangles
          const ke = k * k * (3 - 2 * k);
          const bow = Math.sin(k * Math.PI) * curve * (0.35 + 0.65 * Math.sin(s * Math.PI));
          const x = b[0] + (o[0] - b[0]) * ke + sx * thick * (1 - ke * 0.55);
          const y = b[1] + (o[1] - b[1]) * ke + bow * (type === 1 ? (s * 2 - 1) * 0.002 : 0);
          const z = b[2] + (o[2] - b[2]) * ke;
          // round the trailing free edge slightly inward at corners
          const edgeSoft = (c === cols ? 0.92 + 0.08 * Math.sin(s * Math.PI) : 1);
          fp.push(x * edgeSoft + b[0] * (1 - edgeSoft), y, z);
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

  // caudal (1): vertical fan behind the peduncle, forked, rounded lobes
  {
    const c = sp.caudal;
    const zb = zOf(1), hy = hyOf(1);
    gridFin(
      (s) => [0, dyOf() + (s * 2 - 1) * hy * 0.9, zb + 0.002 * L],
      (s) => {
        const yy = (s * 2 - 1);
        const spread = c.spread * L;
        const lobe = Math.abs(yy);
        // softer fork + rounded tip
        const notchK = c.notch + (1 - c.notch) * Math.pow(lobe, 0.72);
        const round = 1 - 0.12 * Math.pow(1 - Math.sin(Math.PI * s), 1.6);
        const z = zb - c.len * L * notchK * round;
        return [0, dyOf() + yy * spread * (0.92 + 0.08 * Math.sin(Math.PI * s)), z];
      },
      12, 7, 1, 0, 0.22, angelThick
    );
  }
  // dorsal (3)
  {
    const d = sp.dorsal;
    gridFin(
      (s) => { const t = d.t0 + (d.t1 - d.t0) * s; return [0, dyOf() + hyOf(t) * 0.98, zOf(t)]; },
      (s) => {
        const t = d.t0 + (d.t1 - d.t0) * s;
        const bump = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.78)), 1.05);
        const h = d.h * L * (0.10 + 0.90 * bump) * (sp === SPECIES.angel ? (0.35 + 0.65 * Math.pow(s, 0.5) * (1 - 0.3 * s)) : 1);
        return [0, dyOf() + hyOf(t) * 0.98 + h, zOf(t) - d.sweep * L * bump * (0.35 + 0.65 * s)];
      },
      12, 5, 3, 0, 0.14, angelThick
    );
  }
  // anal (3)
  {
    const d = sp.anal;
    gridFin(
      (s) => { const t = d.t0 + (d.t1 - d.t0) * s; return [0, dyOf() - hyOf(t) * sp.belly * 0.98, zOf(t)]; },
      (s) => {
        const t = d.t0 + (d.t1 - d.t0) * s;
        const bump = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.78)), 1.05);
        const h = d.h * L * (0.10 + 0.90 * bump);
        return [0, dyOf() - hyOf(t) * sp.belly * 0.98 - h, zOf(t) - d.sweep * L * bump * (0.35 + 0.65 * s)];
      },
      12, 5, 3, 0, 0.14, angelThick
    );
  }
  // pectorals (2), mirrored — softer paddle outline
  for (const side of [-1, 1]) {
    const p = sp.pect;
    const hy0 = hyOf(p.t), hw0 = hy0 * sp.hw;
    gridFin(
      (s) => {
        const pad = Math.sin(s * Math.PI) * 0.15;
        return [side * hw0 * (0.88 + pad * 0.05), dyOf() - hy0 * 0.28, zOf(p.t) - s * p.w * L];
      },
      (s) => {
        const fan = Math.sin(s * Math.PI);
        return [
          side * (hw0 * 0.9 + p.len * L * (0.55 + 0.35 * fan)),
          dyOf() - hy0 * 0.40 - fan * 0.012 * L,
          zOf(p.t) - p.len * L * (0.28 + 0.72 * s),
        ];
      },
      6, 4, 2, side, 0.2
    );
  }
  // angelfish pelvic streamers
  if (sp.pelvic) {
    for (const side of [-1, 1]) {
      const p = sp.pelvic;
      const hy0 = hyOf(p.t);
      gridFin(
        (s) => [side * 0.0045, dyOf() - hy0 * 0.85, zOf(p.t) - s * 0.03 * L],
        (s) => [side * 0.0075, dyOf() - hy0 * 0.85 - p.len * L * (0.35 + 0.65 * (1 - s * 0.4)), zOf(p.t) - 0.22 * L - s * 0.05 * L],
        5, 5, 3, side, 0.1, angelThick * 0.55
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
  return { body, fins };
}

// ------------------------------------------------------------------------------------------------
// Skin textures, painted in code. Texture space: u = nose(0) -> tail fin tip(1), v = vertical.
// ------------------------------------------------------------------------------------------------
function silhouette(ctx, sp, W, H, fill) {
  const L = sp.L, Ltot = L * sp.ltot, Hbox = sp.hbox;
  const uv = (t, y) => [((L / 2 - (L / 2 - t * L)) / Ltot) * W, (0.5 - y / Hbox) * H];
  ctx.beginPath();
  const N = 80;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const hy = prof(sp.hy, t) * L;
    const [x, y] = uv(t, sp.dy * L + hy);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const hy = prof(sp.hy, t) * L * sp.belly;
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
  for (let y = 0; y < H; y += size * 0.62) {
    for (let x = (Math.round(y / (size * 0.62)) % 2) * size * 0.5; x < W; x += size) {
      ctx.beginPath(); ctx.arc(x, y, size * 0.55, -0.2, Math.PI * 0.62); ctx.stroke();
    }
  }
  ctx.restore();
}

function eye(ctx, sp, W, H, tx, ty, r, ring) {
  const L = sp.L, Ltot = L * sp.ltot;
  const x = (tx * L / Ltot) * W, y = (0.5 - (sp.dy * L + ty * L) / sp.hbox) * H;
  // iris ring first for contrast, then dark cornea
  const iris = ctx.createRadialGradient(x, y, r * 0.35, x, y, r * 1.4);
  iris.addColorStop(0, '#0a0a0c'); iris.addColorStop(0.42, '#121418'); iris.addColorStop(0.58, ring); iris.addColorStop(0.78, ring); iris.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = iris; ctx.beginPath(); ctx.arc(x, y, r * 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#030304'; ctx.beginPath(); ctx.arc(x, y, r * 0.48, 0, Math.PI * 2); ctx.fill();
  // dome catchlights
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(x - r * 0.30, y - r * 0.34, r * 0.26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(220,235,255,0.55)'; ctx.beginPath(); ctx.arc(x + r * 0.20, y + r * 0.14, r * 0.10, 0, Math.PI * 2); ctx.fill();
}

/** Paint thin fin rays (radial lines from base) into fin regions of the shared UV atlas. */
function paintFinRays(ctx, sp, W, H, key, px, py) {
  const L = sp.L, Ltot = L * sp.ltot;
  const bodyEnd = (L / Ltot) * W;
  const rayCol = {
    neon: 'rgba(220,235,240,0.55)',
    platy: 'rgba(255,200,140,0.5)',
    angel: 'rgba(40,40,48,0.7)',
    cory: 'rgba(255,230,190,0.45)',
  }[key];
  const rayDark = {
    neon: 'rgba(20,30,35,0.5)',
    platy: 'rgba(60,15,5,0.55)',
    angel: 'rgba(15,15,20,0.65)',
    cory: 'rgba(40,28,15,0.5)',
  }[key];
  ctx.save();
  ctx.lineCap = 'round';

  // caudal rays from peduncle → tip (dark + light pair for readability)
  const cx = bodyEnd * 0.98;
  const cy = H * 0.5;
  for (let i = 0; i < 13; i++) {
    const a = -1.05 + (i / 12) * 2.1;
    const tipX = bodyEnd + (W - bodyEnd) * 0.92;
    for (const [col, w, ox] of [[rayDark, 2.0, 0], [rayCol, 1.0, 0.5]]) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.55 + 0.4 * Math.sin((i / 12) * Math.PI);
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
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const x0 = d0 + (d1 - d0) * t;
    ctx.strokeStyle = rayDark; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, py(prof(sp.hy, d.t0 + (d.t1 - d.t0) * t) * 0.95));
    ctx.lineTo(x0 - d.sweep * (L / Ltot) * W * 0.55 * (0.3 + 0.7 * t), 2 + t * 10);
    ctx.stroke();
    ctx.strokeStyle = rayCol; ctx.lineWidth = 0.8; ctx.stroke();
  }
  // anal rays
  const an = sp.anal;
  const a0 = px(an.t0), a1 = px(an.t1);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x0 = a0 + (a1 - a0) * t;
    ctx.strokeStyle = rayDark; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, py(-prof(sp.hy, an.t0 + (an.t1 - an.t0) * t) * sp.belly * 0.95));
    ctx.lineTo(x0 - an.sweep * (L / Ltot) * W * 0.5 * (0.3 + 0.7 * t), H - 2 - t * 8);
    ctx.stroke();
    ctx.strokeStyle = rayCol; ctx.lineWidth = 0.8; ctx.stroke();
  }
  // pectoral suggestion (mid flanks)
  const p = sp.pect;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      ctx.strokeStyle = rayDark; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.1;
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
  return { neon: '#9aa89a', platy: '#ff8a30', angel: '#e8e6e0', cory: '#c4a574' }[key];
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
      ctx.fillStyle = 'rgba(20,28,22,0.55)'; ctx.fillRect(0, 0, W, py(0.045));
      // iridescent stripe — cooler, less white so bloom doesn't make light-sticks
      const sg = ctx.createLinearGradient(px(0.12), 0, px(0.95), 0);
      sg.addColorStop(0, 'rgba(40,90,130,0.0)');
      sg.addColorStop(0.12, 'rgba(45,120,160,0.85)');
      sg.addColorStop(0.55, 'rgba(70,150,175,0.88)');
      sg.addColorStop(1, 'rgba(90,165,185,0.55)');
      ctx.strokeStyle = sg; ctx.lineWidth = H * 0.032; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px(0.10), py(0.045)); ctx.quadraticCurveTo(px(0.55), py(0.062), px(0.97), py(0.020)); ctx.stroke();
      // soft specular edge (not pure white)
      ctx.strokeStyle = 'rgba(200,230,240,0.28)'; ctx.lineWidth = H * 0.007;
      ctx.beginPath(); ctx.moveTo(px(0.12), py(0.052)); ctx.quadraticCurveTo(px(0.55), py(0.070), px(0.95), py(0.028)); ctx.stroke();
    } else if (key === 'platy') {
      // lighter belly fade
      const bel = ctx.createLinearGradient(0, py(0.06), 0, py(-0.14));
      bel.addColorStop(0, 'rgba(255,200,120,0)'); bel.addColorStop(0.45, 'rgba(255,210,140,0.35)'); bel.addColorStop(1, 'rgba(255,235,200,0.7)');
      ctx.fillStyle = bel; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(100,18,0,0.22)'; ctx.fillRect(0, 0, W, py(0.14));
      scalePattern(ctx, sp, W, H, 0.22, 9);
      // micro glitter flecks (more visible sparkle)
      for (let i = 0; i < 180; i++) {
        const gx = px(0.12 + Math.random() * 0.75), gy = py(-0.08 + Math.random() * 0.2);
        ctx.fillStyle = `rgba(255,248,220,${0.28 + Math.random() * 0.6})`;
        ctx.beginPath(); ctx.arc(gx, gy, 0.6 + Math.random() * 1.8, 0, 6.3); ctx.fill();
      }
      for (let i = 0; i < 22; i++) {
        ctx.fillStyle = 'rgba(30,8,0,0.32)';
        ctx.beginPath(); ctx.arc(px(0.3 + Math.random() * 0.6), py(-0.1 + Math.random() * 0.22), 1.2 + Math.random() * 2, 0, 6.3); ctx.fill();
      }
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
      scalePattern(ctx, sp, W, H, 0.10, 14);
    } else {
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = `rgba(40,28,15,${0.25 + Math.random() * 0.35})`;
        ctx.beginPath(); ctx.arc(px(0.15 + Math.random() * 0.8), py(-0.02 + Math.random() * 0.16), 1.5 + Math.random() * 4, 0, 6.3); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(70,52,30,0.5)'; ctx.lineWidth = H * 0.05;
      ctx.beginPath(); ctx.moveTo(px(0.2), py(0.03)); ctx.lineTo(px(0.98), py(0.02)); ctx.stroke();
      ctx.fillStyle = 'rgba(40,30,18,0.6)'; ctx.beginPath(); ctx.ellipse(px(0.42), py(0.10), px(0.07), H * 0.08, 0, 0, 6.3); ctx.fill();
    }
    ctx.restore();

    // eye (both flanks share planar UV)
    const eyeSpec = { neon: [0.085, 0.02, 18, '#c8d2d8'], platy: [0.09, 0.03, 15, '#e6c890'], angel: [0.09, 0.09, 16, '#d94a2a'], cory: [0.11, 0.04, 14, '#c9b08a'] }[key];
    eye(ctx, sp, W, H, eyeSpec[0], eyeSpec[1], eyeSpec[2], eyeSpec[3]);
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
    fctx.save(); fctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 7; i++) {
      fctx.strokeStyle = 'rgba(25,25,30,0.40)'; fctx.lineWidth = 2.2;
      fctx.beginPath(); fctx.moveTo(px(0.5 + i * 0.08), 0); fctx.lineTo(px(0.35 + i * 0.1), H * 0.36); fctx.stroke();
      fctx.beginPath(); fctx.moveTo(px(0.55 + i * 0.07), H); fctx.lineTo(px(0.4 + i * 0.09), H * 0.66); fctx.stroke();
    }
    fctx.restore();
    const cg = fctx.createLinearGradient(px(1.0), 0, px(1.34), 0);
    cg.addColorStop(0, 'rgba(240,160,70,0.0)'); cg.addColorStop(1, 'rgba(240,150,60,0.30)');
    fctx.fillStyle = cg; fctx.fillRect(px(1.0), 0, W - px(1.0), H);
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
  return { map, bodyMap, emissive, metalness, roughness };
}
