// Quality tiers. Everything is tuned so an RTX 4060 holds 60fps at high and phones hold ~30-60 at low.
const ua = navigator.userAgent || '';
const params = new URLSearchParams(location.search);
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
export const isMobile =
  /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (coarse && Math.min(screen.width, screen.height) < 900);

const forced = params.get('q');
const low = forced ? forced === 'low' : isMobile;

export const Q = low
  ? {
      name: 'low',
      maxDPR: 1.5,
      msaa: 0,
      shadowMap: 1024,
      causticRes: 256,
      bloomScale: 0.5,
      rayBands: 8,
      particles: 80,
      fishSeg: 20,
      fishRing: 9,
      bubbles: 44,
      sandSeg: [110, 48],
      rockSub: 4,
      plantScale: 0.6,
      grain: true,
    }
  : {
      name: 'high',
      maxDPR: 2,
      msaa: 4,
      shadowMap: 2048,
      causticRes: 512,
      bloomScale: 0.75,
      rayBands: 14,
      particles: 130,
      fishSeg: 30,
      fishRing: 12,
      bubbles: 90,
      sandSeg: [200, 90],
      rockSub: 5,
      plantScale: 1,
      grain: true,
    };

export const isDebug = params.has('debug') || params.has('shot');
export const seedParam = Number(params.get('seed') || 7);
