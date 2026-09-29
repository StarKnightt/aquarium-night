// Everything is synthesised with the Web Audio API — no audio files.
//  * filter hum: motor tone + brown-noise water rumble + trickle from the outflow
//  * bubbles: Minnaert-style rising sine "bloops"
//  * glass tap: click + damped glass partials + a low thump through the water
export function createAudio() {
  let ctx = null, master = null, humGain = null, started = false, muted = false, noiseBuf = null;
  const AC = window.AudioContext || window.webkitAudioContext;

  function makeNoise(seconds, color) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    // crossfade the loop seam
    const f = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[len - f + i] * (1 - k); }
    return buf;
  }

  function loopNoise(color) {
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(4, color);
    src.loop = true;
    src.start();
    return src;
  }

  function start() {
    if (started || !AC) return;
    started = true;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = makeNoise(1, 'white');

    // ---- filter hum bed
    humGain = ctx.createGain(); humGain.gain.value = 1;
    humGain.connect(master);
    // motor: 100/200 Hz with slight beating, through a low-pass so it is felt more than heard
    const motorLP = ctx.createBiquadFilter(); motorLP.type = 'lowpass'; motorLP.frequency.value = 340;
    const motorGain = ctx.createGain(); motorGain.gain.value = 0.020;
    [[100, 1], [100.7, 0.7], [200.3, 0.35], [300.2, 0.12]].forEach(([f, g]) => {
      const o = ctx.createOscillator(); o.type = f > 250 ? 'sine' : 'triangle'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(motorLP); o.start();
    });
    motorLP.connect(motorGain); motorGain.connect(humGain);
    // water rumble: brown noise, slowly breathing
    const rumble = loopNoise('brown');
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 480; rlp.Q.value = 0.6;
    const rg = ctx.createGain(); rg.gain.value = 0.070;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.02;
    lfo.connect(lfoG); lfoG.connect(rg.gain); lfo.start();
    rumble.connect(rlp); rlp.connect(rg); rg.connect(humGain);
    // outflow trickle: band-passed noise with wandering centre + gain
    const trick = loopNoise('white');
    const tbp = ctx.createBiquadFilter(); tbp.type = 'bandpass'; tbp.frequency.value = 1700; tbp.Q.value = 1.4;
    const tg = ctx.createGain(); tg.gain.value = 0.0045;
    const tl = ctx.createOscillator(); tl.frequency.value = 0.37;
    const tlg = ctx.createGain(); tlg.gain.value = 500;
    tl.connect(tlg); tlg.connect(tbp.frequency); tl.start();
    const tl2 = ctx.createOscillator(); tl2.frequency.value = 2.3;
    const tl2g = ctx.createGain(); tl2g.gain.value = 0.0022;
    tl2.connect(tl2g); tl2g.connect(tg.gain); tl2.start();
    trick.connect(tbp); tbp.connect(tg); tg.connect(humGain);
    // little air-pump buzz
    const pump = ctx.createOscillator(); pump.type = 'sawtooth'; pump.frequency.value = 50;
    const pbp = ctx.createBiquadFilter(); pbp.type = 'lowpass'; pbp.frequency.value = 180;
    const pg = ctx.createGain(); pg.gain.value = 0.004;
    pump.connect(pbp); pbp.connect(pg); pg.connect(humGain); pump.start();

    fade(muted ? 0 : 1, 2.5);
  }

  function fade(v, sec = 0.3) {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(v * 0.9, t + sec);
  }

  function pannerFor(x) {
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, x / 0.5)); p.connect(master); return p; }
    return master;
  }

  function envOsc(type, f0, f1, dur, peak, dest, attack = 0.002) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noiseBurst(dur, peak, hp, dest, bp) {
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = bp ? 'bandpass' : 'highpass'; f.frequency.value = hp; if (bp) f.Q.value = bp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  return {
    get started() { return started; },
    get muted() { return muted; },
    start,
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) { muted = m; if (!started && !m) start(); fade(m ? 0 : 1, 0.4); },
    /** Minnaert bubble: f ~ 3.26 / r (r in m) -> 1.2-4.6 kHz, chirping upward as it detaches */
    bubble({ x = 0, r = 0.0015 } = {}) {
      if (!ctx || muted) return;
      const f0 = Math.min(3600, Math.max(700, 3.26 / (r * 2.6))) * (0.9 + Math.random() * 0.2);
      const dest = pannerFor(x);
      const g = ctx.createGain(); g.gain.value = 0.16; g.connect(dest);
      envOsc('sine', f0, f0 * 1.55, 0.05 + r * 25, 0.05 + Math.random() * 0.03, g);
    },
    pop({ x = 0, r = 0.0015 } = {}) {
      if (!ctx || muted) return;
      const dest = pannerFor(x);
      const g = ctx.createGain(); g.gain.value = 0.07; g.connect(dest);
      noiseBurst(0.018, 0.5, 2400, g, 1.2);
      envOsc('sine', 900 + Math.random() * 500, 500, 0.03, 0.25, g);
    },
    /** Knuckle on glass: click + resonant partials + thump */
    tap({ x = 0, strength = 1 } = {}) {
      if (!ctx) return;
      const dest = pannerFor(x);
      const g = ctx.createGain(); g.gain.value = 0.55 * strength; g.connect(dest);
      noiseBurst(0.012, 0.9, 2600, g);
      const base = 1500 + Math.random() * 500;
      envOsc('sine', base, base * 0.985, 0.16, 0.10, g, 0.001);
      envOsc('sine', base * 2.32, base * 2.3, 0.09, 0.05, g, 0.001);
      envOsc('sine', base * 4.16, base * 4.1, 0.05, 0.025, g, 0.001);
      envOsc('sine', 190, 105, 0.13, 0.30, g, 0.003);          // body of the glass / water column
      noiseBurst(0.05, 0.16, 500, g, 0.7);
    },
    drop({ x = 0 } = {}) {
      if (!ctx || muted) return;
      const dest = pannerFor(x);
      const g = ctx.createGain(); g.gain.value = 0.09; g.connect(dest);
      for (let i = 0; i < 5; i++) setTimeout(() => { if (ctx) { noiseBurst(0.02, 0.4, 3200 + Math.random() * 2000, g, 1.5); } }, i * 40 + Math.random() * 50);
    },
    eat({ x = 0 } = {}) {
      if (!ctx || muted) return;
      const dest = pannerFor(x);
      const g = ctx.createGain(); g.gain.value = 0.05; g.connect(dest);
      envOsc('sine', 1400 + Math.random() * 700, 800, 0.025, 0.4, g, 0.001);
    },
  };
}
