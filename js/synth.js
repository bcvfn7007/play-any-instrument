/* Синтез звуков: рецепты для клавишных, щипковых, смычковых, духовых, ударных и электронных инструментов. */
(function () {
  const App = (window.App = window.App || {});
  const N = App.notes;

  /* ---------- Общие помощники ---------- */

  const noiseCache = new WeakMap();
  function noise(ctx) {
    let b = noiseCache.get(ctx);
    if (!b) {
      b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseCache.set(ctx, b);
    }
    return b;
  }

  const waveCache = new WeakMap();
  /** Периодическая волна по амплитудам гармоник (кэш на контекст). */
  function wave(ctx, name, harmonics) {
    let m = waveCache.get(ctx);
    if (!m) waveCache.set(ctx, (m = new Map()));
    if (!m.has(name)) {
      const real = new Float32Array(harmonics.length + 1);
      const imag = new Float32Array(harmonics.length + 1);
      harmonics.forEach((a, i) => (imag[i + 1] = a));
      m.set(name, ctx.createPeriodicWave(real, imag));
    }
    return m.get(name);
  }

  function pulseHarmonics(duty, count) {
    const h = [];
    for (let n = 1; n <= count; n++) h.push((2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty));
    return h;
  }

  function hold(param, t) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else {
      const v = param.value;
      param.cancelScheduledValues(t);
      param.setValueAtTime(v, t);
    }
  }

  /** Оболочка голоса: выходной усилитель, список источников, отпускание и «глушение». */
  function makeVoice(ctx, dest) {
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(dest);
    const v = {
      out,
      sources: [],
      endTime: null,
      release: 0.2,
      sustain: false,
      stopped: false,
      killed: false,
      add(src) {
        v.sources.push(src);
        return src;
      },
      /** Назначить окончание после того, как рецепт подключит все источники. */
      autoFinish(at) {
        v.endTime = at;
        queueMicrotask(() => {
          if (!v.stopped) v.finish(at);
        });
      },
      finish(at) {
        v.endTime = at;
        v.sources.forEach((s) => {
          try {
            s.stop(at);
          } catch (e) { /* уже остановлен */ }
        });
        const ms = (at - ctx.currentTime) * 1000 + 300;
        clearTimeout(v._dc);
        v._dc = setTimeout(() => {
          try {
            out.disconnect();
          } catch (e) { /* уже отключён */ }
        }, Math.max(50, ms));
      },
      stop(time) {
        if (!v.sustain || v.stopped) return;
        v.stopped = true;
        const t = Math.max(time, ctx.currentTime);
        hold(out.gain, t);
        out.gain.setTargetAtTime(0, t, v.release / 4);
        v.finish(t + v.release * 1.5 + 0.05);
      },
      kill(time) {
        if (v.killed) return;
        v.killed = v.stopped = true;
        const t = Math.max(time, ctx.currentTime);
        hold(out.gain, t);
        out.gain.setTargetAtTime(0, t, 0.01);
        v.finish(t + 0.08);
      },
    };
    return v;
  }

  function osc(ctx, v, type, freq, t) {
    const o = ctx.createOscillator();
    if (typeof type === 'string') o.type = type;
    else o.setPeriodicWave(type);
    o.frequency.value = freq;
    o.start(t);
    return v.add(o);
  }

  function noiseSrc(ctx, v, t) {
    const s = ctx.createBufferSource();
    s.buffer = noise(ctx);
    s.loop = true;
    s.loopStart = Math.random();
    s.start(t, Math.random() * 1.5);
    return v.add(s);
  }

  function gain(ctx, value) {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  }

  function filter(ctx, type, f, q, g) {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = Math.min(f, ctx.sampleRate / 2 - 100);
    if (q != null) b.Q.value = q;
    if (g != null) b.gain.value = g;
    return b;
  }

  /** Вибрато в центах на набор осцилляторов, с плавным вступлением. */
  function vibrato(ctx, v, targets, t, rate, cents, delay) {
    if (!cents) return;
    const lfo = osc(ctx, v, 'sine', rate, t);
    const depth = gain(ctx, 0);
    depth.gain.setValueAtTime(0, t + (delay || 0));
    depth.gain.linearRampToValueAtTime(cents, t + (delay || 0) + 0.45);
    lfo.connect(depth);
    targets.forEach((o) => depth.connect(o.detune));
  }

  function adsr(param, t, peak, a, d, s) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.setTargetAtTime(peak * s, t + a, Math.max(0.005, d / 3));
  }

  const pitchDecay = (f, base, power) => base * Math.pow(261.6 / f, power == null ? 0.35 : power);
  const velCurve = (vel) => Math.pow(Math.max(0.05, vel), 1.4);

  /* ---------- Модальный синтез (ударные с высотой: маримба, колокола, хэндпан…) ---------- */

  const MODAL = {
    marimba: { p: [[1, 1, 1.1], [3.98, 0.12, 0.22], [9.1, 0.025, 0.07]], noise: 0.04, nf: 3, a: 0.003, level: 0.42 },
    xylophone: { p: [[1, 1, 0.45], [3.0, 0.32, 0.18], [6.1, 0.09, 0.07], [9.3, 0.04, 0.04]], noise: 0.1, nf: 5, a: 0.001, level: 0.36 },
    glockenspiel: { p: [[1, 1, 2.2], [2.76, 0.32, 0.7], [5.4, 0.16, 0.3], [8.93, 0.07, 0.14]], noise: 0.04, nf: 8, a: 0.001, level: 0.24 },
    vibraphone: { p: [[1, 1, 3.4], [3.99, 0.18, 0.7], [10.1, 0.04, 0.15]], noise: 0.02, nf: 4, a: 0.003, level: 0.34, trem: 5.2 },
    celesta: { p: [[1, 1, 1.3], [4.0, 0.28, 0.32], [10, 0.06, 0.08]], noise: 0.05, nf: 6, a: 0.001, level: 0.3 },
    musicbox: { p: [[1, 1, 1.4], [3.0, 0.18, 0.4], [5.06, 0.14, 0.16], [8.1, 0.06, 0.06]], noise: 0.03, nf: 9, a: 0.001, level: 0.28 },
    kalimba: { p: [[1, 1, 1.8], [5.9, 0.16, 0.12], [13.3, 0.05, 0.04]], noise: 0.12, nf: 1.5, a: 0.002, level: 0.4 },
    bell: { p: [[0.5, 0.35, 5], [1, 1, 4], [1.19, 0.45, 3], [1.5, 0.3, 2.4], [2, 0.4, 2.1], [2.5, 0.18, 1.6], [2.67, 0.2, 1.4], [3.01, 0.14, 1.1], [4.07, 0.1, 0.9]], noise: 0.03, nf: 6, a: 0.001, level: 0.16 },
    steelpan: { p: [[1, 1, 1.5], [1.004, 0.4, 1.3], [2, 0.45, 0.9], [3, 0.18, 0.45], [4.02, 0.06, 0.28]], noise: 0.06, nf: 3, a: 0.002, level: 0.28 },
    handpan: { p: [[1, 1, 3.2], [1.0035, 0.45, 2.6], [2, 0.35, 1.9], [3, 0.14, 1.0]], noise: 0.05, nf: 1.2, a: 0.007, level: 0.32 },
    timpani: { p: [[1, 1, 1.9], [1.5, 0.45, 1.3], [1.98, 0.32, 1.0], [2.44, 0.18, 0.7]], noise: 0.25, nf: 0.6, a: 0.004, level: 0.5, drop: 0.03 },
    tubular: { p: [[1, 1, 4.5], [2.76, 0.55, 3], [5.4, 0.35, 1.8], [8.93, 0.18, 1.0], [13.3, 0.08, 0.5]], noise: 0.04, nf: 4, a: 0.001, level: 0.16 },
  };

  function modal(ctx, dest, t, f, vel, o, kind) {
    const spec = MODAL[kind];
    const v = makeVoice(ctx, dest);
    const level = spec.level * velCurve(vel) * (o.level || 1);
    let target = v.out;
    if (spec.trem) {
      const trem = gain(ctx, 1);
      const lfo = osc(ctx, v, 'sine', spec.trem, t);
      const depth = gain(ctx, 0.28);
      lfo.connect(depth);
      depth.connect(trem.gain);
      v.out.disconnect();
      v.out.connect(trem);
      trem.connect(dest);
    }
    v.out.gain.setValueAtTime(0, t);
    v.out.gain.linearRampToValueAtTime(level, t + spec.a);
    let longest = 0;
    const scale = Math.max(0.35, Math.min(2.2, Math.pow(261.6 / f, 0.3)));
    spec.p.forEach(([ratio, amp, decay]) => {
      const pf = f * ratio;
      if (pf > 16000) return;
      const d = decay * scale * (o.decay || 1);
      const bright = ratio > 1.2 ? 0.45 + 0.55 * vel : 1;
      const o1 = osc(ctx, v, 'sine', pf, t);
      if (spec.drop) {
        o1.frequency.setValueAtTime(pf * (1 + spec.drop), t);
        o1.frequency.setTargetAtTime(pf, t, 0.05);
      }
      const g = gain(ctx, 0);
      g.gain.setValueAtTime(amp * bright, t);
      g.gain.setTargetAtTime(0, t + 0.002, d / 4.5);
      o1.connect(g);
      g.connect(target);
      longest = Math.max(longest, d);
    });
    if (spec.noise) {
      const n = noiseSrc(ctx, v, t);
      const bp = filter(ctx, 'bandpass', Math.min(12000, f * spec.nf), 1.2);
      const g = gain(ctx, 0);
      g.gain.setValueAtTime(spec.noise * (0.5 + vel), t);
      g.gain.setTargetAtTime(0, t, 0.008);
      n.connect(bp);
      bp.connect(g);
      g.connect(target);
    }
    v.finish(t + longest + 0.1);
    return v;
  }

  /* ---------- Карплус — Стронг (гитары, арфа, балалайка…) ---------- */

  const ksCache = new Map();
  const KS_LIMIT = 120;

  function ksBuffer(ctx, f, o) {
    const sr = ctx.sampleRate;
    const key = [sr, Math.round(f * 10), o.bright, o.t60, o.pick, o.stretch].join('|');
    if (ksCache.has(key)) {
      const hit = ksCache.get(key);
      ksCache.delete(key);
      ksCache.set(key, hit);
      return hit;
    }
    const P = Math.max(2, Math.floor(sr / f - 0.5));
    const f0 = sr / (P + 0.5);
    const t60 = Math.max(0.25, Math.min(9, o.t60 * Math.pow(220 / f, 0.45)));
    const dur = Math.min(6, t60 * 0.85 + 0.1);
    const len = Math.floor(sr * dur);
    const buffer = ctx.createBuffer(1, len, sr);
    const y = buffer.getChannelData(0);

    const a = 0.04 + 0.96 * o.bright * o.bright;
    const exc = new Float32Array(P);
    let lp = 0;
    let mean = 0;
    for (let i = 0; i < P; i++) {
      lp += a * (Math.random() * 2 - 1 - lp);
      exc[i] = lp;
      mean += lp;
    }
    mean /= P;
    const pp = Math.max(1, Math.round(P * o.pick));
    for (let i = 0; i < P; i++) y[i] = exc[i] - mean - (i >= pp ? (exc[i - pp] - mean) * 0.92 : 0);

    const g = Math.pow(10, -3 / (t60 * f0));
    const s = o.stretch;
    for (let n = P; n < len; n++) {
      y[n] = g * ((1 - s) * y[n - P] + s * (n - P - 1 >= 0 ? y[n - P - 1] : 0));
    }
    let peak = 0;
    for (let i = 0; i < Math.min(len, P * 6); i++) peak = Math.max(peak, Math.abs(y[i]));
    const norm = peak > 0 ? 1 / peak : 1;
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < len; i++) {
      y[i] *= norm;
      if (i > len - fade) y[i] *= (len - i) / fade;
    }
    const hit = { buffer, rate: f / f0, dur };
    ksCache.set(key, hit);
    if (ksCache.size > KS_LIMIT) ksCache.delete(ksCache.keys().next().value);
    return hit;
  }

  const PLUCK = {
    steel: { bright: 0.78, t60: 3.6, pick: 0.17, stretch: 0.42, level: 0.36 },
    nylon: { bright: 0.45, t60: 3.0, pick: 0.24, stretch: 0.5, level: 0.4 },
    electric: { bright: 0.7, t60: 5.0, pick: 0.2, stretch: 0.45, level: 0.32 },
    bass: { bright: 0.42, t60: 4.5, pick: 0.2, stretch: 0.5, level: 0.5 },
    banjo: { bright: 0.97, t60: 1.3, pick: 0.09, stretch: 0.32, level: 0.32 },
    balalaika: { bright: 0.9, t60: 1.6, pick: 0.12, stretch: 0.36, level: 0.34 },
    harp: { bright: 0.38, t60: 4.2, pick: 0.45, stretch: 0.5, level: 0.42 },
    gusli: { bright: 0.66, t60: 4.0, pick: 0.22, stretch: 0.4, level: 0.34 },
    koto: { bright: 0.82, t60: 2.6, pick: 0.14, stretch: 0.38, level: 0.36 },
    sitar: { bright: 0.98, t60: 3.4, pick: 0.07, stretch: 0.25, level: 0.3 },
    harpsichord: { bright: 1.0, t60: 2.2, pick: 0.07, stretch: 0.3, level: 0.26 },
    dulcimer: { bright: 0.9, t60: 2.8, pick: 0.11, stretch: 0.34, level: 0.3 },
  };

  function pluck(ctx, dest, t, f, vel, o, kind) {
    const spec = Object.assign({}, PLUCK[kind] || PLUCK.steel, o);
    const v = makeVoice(ctx, dest);
    const ks = ksBuffer(ctx, f, spec);
    const src = ctx.createBufferSource();
    src.buffer = ks.buffer;
    src.playbackRate.value = ks.rate;
    const tone = filter(ctx, 'lowpass', 1800 + 11000 * vel * vel, 0.5);
    src.connect(tone);
    tone.connect(v.out);
    src.start(t);
    v.add(src);
    v.out.gain.setValueAtTime(spec.level * velCurve(vel), t);
    v.release = 0.12;
    v.finish(t + ks.dur / ks.rate);
    return v;
  }

  /* ---------- Субтрактивные и аддитивные голоса с удержанием ---------- */

  function sustained(ctx, dest, t, f, vel, spec) {
    const v = makeVoice(ctx, dest);
    v.sustain = true;
    v.release = spec.release;
    const level = spec.level * (0.35 + 0.65 * velCurve(vel));
    adsr(v.out.gain, t, level, spec.attack, spec.decay || 0.3, spec.sustainLevel == null ? 0.85 : spec.sustainLevel);
    v.autoFinish(t + (spec.maxTime || 30));
    return v;
  }

  function piano(ctx, dest, t, f, vel, o) {
    const v = makeVoice(ctx, dest);
    v.sustain = true;
    v.release = 0.3;
    const level = 0.3 * velCurve(vel) * (o.level || 1);
    v.out.gain.setValueAtTime(0, t);
    v.out.gain.linearRampToValueAtTime(level, t + 0.003);
    const base = Math.max(0.5, Math.min(5, pitchDecay(f, 1.7, 0.55)));
    const B = 0.00035;
    for (let n = 1; n <= 9; n++) {
      const pf = n * f * Math.sqrt(1 + B * n * n);
      if (pf > 11000) break;
      const amp = (1 / Math.pow(n, 1.25)) * (n === 1 ? 1 : 0.35 + 0.75 * vel);
      const tau = base / (1 + 0.55 * (n - 1));
      const o1 = osc(ctx, v, 'sine', pf, t);
      if (n === 2) o1.detune.value = 3;
      const g = gain(ctx, 0);
      g.gain.setValueAtTime(amp, t);
      g.gain.setTargetAtTime(amp * 0.4, t, tau * 0.12);
      g.gain.setTargetAtTime(0, t + tau * 0.3, tau);
      o1.connect(g);
      g.connect(v.out);
    }
    const n = noiseSrc(ctx, v, t);
    const bp = filter(ctx, 'bandpass', Math.min(9000, f * 3), 0.8);
    const ng = gain(ctx, 0);
    ng.gain.setValueAtTime(0.18 * vel, t);
    ng.gain.setTargetAtTime(0, t, 0.012);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(v.out);
    v.finish(t + base * 5);
    return v;
  }

  function epiano(ctx, dest, t, f, vel) {
    const v = makeVoice(ctx, dest);
    v.sustain = true;
    v.release = 0.28;
    const level = 0.3 * velCurve(vel);
    const decay = Math.max(0.8, Math.min(5, pitchDecay(f, 2.4, 0.4)));
    v.out.gain.setValueAtTime(0, t);
    v.out.gain.linearRampToValueAtTime(level, t + 0.004);
    v.out.gain.setTargetAtTime(0, t + 0.01, decay / 3);

    const car = osc(ctx, v, 'sine', f, t);
    const mod = osc(ctx, v, 'sine', f, t);
    const idx = gain(ctx, 0);
    idx.gain.setValueAtTime(f * (0.6 + 2.6 * vel), t);
    idx.gain.setTargetAtTime(f * 0.25, t, 0.35);
    mod.connect(idx);
    idx.connect(car.frequency);

    const tine = osc(ctx, v, 'sine', f * 14, t);
    const tIdx = gain(ctx, 0);
    tIdx.gain.setValueAtTime(f * 1.4 * vel, t);
    tIdx.gain.setTargetAtTime(0, t, 0.025);
    tine.connect(tIdx);
    tIdx.connect(car.frequency);

    const g = gain(ctx, 1);
    car.connect(g);
    g.connect(v.out);
    v.finish(t + decay * 2);
    return v;
  }

  const ORGAN = {
    drawbar: { r: [0.5, 1, 1.5, 2, 3, 4], a: [0.85, 1, 0.7, 0.55, 0.3, 0.2], attack: 0.006, release: 0.06, click: 0.12, vib: 6.4, cents: 7 },
    church: { r: [0.5, 1, 2, 3, 4, 6, 8], a: [0.75, 1, 0.75, 0.35, 0.45, 0.22, 0.2], attack: 0.07, release: 0.55, click: 0, vib: 0, cents: 0 },
    reed: { r: [1, 2, 3, 4, 5, 6], a: [1, 0.6, 0.5, 0.25, 0.2, 0.12], attack: 0.04, release: 0.12, click: 0, vib: 5, cents: 4 },
  };

  function organ(ctx, dest, t, f, vel, o, kind) {
    const spec = ORGAN[kind] || ORGAN.drawbar;
    const sum = spec.a.reduce((x, y) => x + y, 0);
    const v = sustained(ctx, dest, t, f, 0.9, {
      level: (0.5 / sum) * 0.9, attack: spec.attack, decay: 0.1, sustainLevel: 1, release: spec.release,
    });
    const oscs = [];
    spec.r.forEach((r, i) => {
      if (f * r > 14000) return;
      const o1 = osc(ctx, v, 'sine', f * r, t);
      const g = gain(ctx, spec.a[i]);
      o1.connect(g);
      g.connect(v.out);
      oscs.push(o1);
    });
    vibrato(ctx, v, oscs, t, spec.vib, spec.cents, 0);
    if (spec.click) {
      const n = noiseSrc(ctx, v, t);
      const bp = filter(ctx, 'bandpass', 2500, 0.7);
      const g = gain(ctx, 0);
      g.gain.setValueAtTime(spec.click, t);
      g.gain.setTargetAtTime(0, t, 0.004);
      n.connect(bp);
      bp.connect(g);
      g.connect(v.out);
    }
    return v;
  }

  /** Источник «сырой» волны: несколько осцилляторов с расстройкой. */
  function stack(ctx, v, t, f, parts, into) {
    const oscs = [];
    parts.forEach(([type, ratio, cents, amp]) => {
      const o1 = osc(ctx, v, type, f * ratio, t);
      o1.detune.value = cents;
      const g = gain(ctx, amp);
      o1.connect(g);
      g.connect(into);
      oscs.push(o1);
    });
    return oscs;
  }

  function bowed(ctx, dest, t, f, vel, o) {
    const ens = !!o.ensemble;
    const v = sustained(ctx, dest, t, f, vel, {
      level: o.level || (ens ? 0.11 : 0.16), attack: o.attack || (ens ? 0.32 : 0.09), decay: 0.4, sustainLevel: 0.85,
      release: o.release || (ens ? 0.7 : 0.25),
    });
    const lp = filter(ctx, 'lowpass', Math.min(o.lp || 3400, f * 10), 0.6);
    const body = filter(ctx, 'peaking', o.formant || 2600, 1.2, 5);
    lp.connect(body);
    body.connect(v.out);
    const parts = ens
      ? [['sawtooth', 1, -14, 0.5], ['sawtooth', 1, -5, 0.5], ['sawtooth', 1, 6, 0.5], ['sawtooth', 1, 13, 0.5]]
      : [['sawtooth', 1, -5, 0.7], ['sawtooth', 1, 5, 0.7]];
    const oscs = stack(ctx, v, t, f, parts, lp);
    vibrato(ctx, v, oscs, t, o.vibRate || 5.6, o.vibCents == null ? (ens ? 6 : 14) : o.vibCents, ens ? 0.2 : 0.22);
    if (!ens) {
      const n = noiseSrc(ctx, v, t);
      const bp = filter(ctx, 'bandpass', Math.min(10000, f * 3), 1.5);
      const g = gain(ctx, 0.05 * vel);
      n.connect(bp);
      bp.connect(g);
      g.connect(v.out);
    }
    return v;
  }

  const WIND = {
    flute: { h: [1, 0.22, 0.08, 0.03], breath: 0.1, nq: 1.1, attack: 0.06, release: 0.12, vib: 10, level: 0.24 },
    recorder: { h: [1, 0.4, 0.22, 0.08, 0.04], breath: 0.06, nq: 1.4, attack: 0.03, release: 0.06, vib: 3, level: 0.2 },
    panflute: { h: [1, 0.12, 0.05], breath: 0.22, nq: 0.8, attack: 0.07, release: 0.18, vib: 8, level: 0.24 },
    ocarina: { h: [1, 0.05, 0.08], breath: 0.04, nq: 1.2, attack: 0.04, release: 0.1, vib: 6, level: 0.26 },
    whistle: { h: [1, 0.3, 0.12, 0.05], breath: 0.08, nq: 1.4, attack: 0.025, release: 0.06, vib: 12, level: 0.2 },
  };

  function flute(ctx, dest, t, f, vel, o, kind) {
    const spec = WIND[kind] || WIND.flute;
    const v = sustained(ctx, dest, t, f, vel, {
      level: spec.level, attack: spec.attack, decay: 0.2, sustainLevel: 0.82, release: spec.release,
    });
    const o1 = osc(ctx, v, wave(ctx, 'w-' + kind, spec.h), f, t);
    o1.connect(v.out);
    vibrato(ctx, v, [o1], t, 5, spec.vib, 0.28);
    const n = noiseSrc(ctx, v, t);
    const bp = filter(ctx, 'bandpass', Math.min(11000, f * 2), spec.nq);
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(spec.breath * 2.2, t);
    g.gain.setTargetAtTime(spec.breath, t + 0.02, 0.05);
    n.connect(bp);
    bp.connect(g);
    g.connect(v.out);
    return v;
  }

  const REED = {
    clarinet: { parts: [['square', 1, 0, 0.6], ['triangle', 1, 3, 0.4]], lp: 5, q: 0.6, peak: 1500, pg: 2, attack: 0.04, release: 0.09, vib: 4, level: 0.16 },
    sax: { parts: [['sawtooth', 1, 0, 0.7], ['square', 1, 4, 0.2]], lp: 6, q: 0.9, peak: 1250, pg: 8, attack: 0.05, release: 0.1, vib: 16, level: 0.14, swell: true },
    oboe: { parts: [['sawtooth', 1, 0, 0.7]], lp: 7, q: 1.5, peak: 1400, pg: 10, attack: 0.04, release: 0.08, vib: 10, level: 0.12 },
    bassoon: { parts: [['sawtooth', 1, 0, 0.6], ['square', 1, 0, 0.3]], lp: 4, q: 0.8, peak: 500, pg: 6, attack: 0.05, release: 0.1, vib: 6, level: 0.17 },
    harmonica: { parts: [['square', 1, 0, 0.5], ['sawtooth', 1, 7, 0.3]], lp: 8, q: 0.7, peak: 1800, pg: 7, attack: 0.035, release: 0.08, vib: 0, trem: 5.5, level: 0.13 },
    accordion: { parts: [['sawtooth', 1, -11, 0.45], ['sawtooth', 1, 11, 0.45], ['square', 0.5, 0, 0.25]], lp: 7, q: 0.6, peak: 2200, pg: 4, attack: 0.04, release: 0.09, vib: 0, level: 0.12 },
    bagpipe: { parts: [['sawtooth', 1, 0, 0.6], ['sawtooth', 1, 6, 0.4]], lp: 9, q: 1, peak: 1800, pg: 10, attack: 0.03, release: 0.05, vib: 0, level: 0.1 },
  };

  function reed(ctx, dest, t, f, vel, o, kind) {
    const spec = REED[kind] || REED.clarinet;
    const v = sustained(ctx, dest, t, f, vel, {
      level: spec.level, attack: spec.attack, decay: 0.25, sustainLevel: 0.85, release: spec.release,
    });
    const lp = filter(ctx, 'lowpass', Math.min(7000, f * spec.lp), spec.q);
    const pk = filter(ctx, 'peaking', spec.peak, 1.4, spec.pg);
    lp.connect(pk);
    let last = pk;
    if (spec.trem) {
      const trem = gain(ctx, 0.85);
      const lfo = osc(ctx, v, 'sine', spec.trem, t);
      const d = gain(ctx, 0.15);
      lfo.connect(d);
      d.connect(trem.gain);
      pk.connect(trem);
      last = trem;
    }
    last.connect(v.out);
    if (spec.swell) {
      lp.frequency.setValueAtTime(f * 2, t);
      lp.frequency.linearRampToValueAtTime(Math.min(7000, f * spec.lp), t + 0.12);
    }
    const oscs = stack(ctx, v, t, f, spec.parts, lp);
    vibrato(ctx, v, oscs, t, 5.2, spec.vib, 0.25);
    return v;
  }

  const BRASS = {
    trumpet: { bright: 9, attack: 0.03, level: 0.15, tri: 0 },
    trombone: { bright: 5.5, attack: 0.045, level: 0.17, tri: 0.2 },
    horn: { bright: 3.2, attack: 0.07, level: 0.2, tri: 0.5 },
    tuba: { bright: 3.5, attack: 0.06, level: 0.24, tri: 0.4 },
    section: { bright: 6, attack: 0.05, level: 0.17, tri: 0, ens: true },
  };

  function brass(ctx, dest, t, f, vel, o, kind) {
    const spec = BRASS[kind] || BRASS.trumpet;
    const v = sustained(ctx, dest, t, f, vel, {
      level: spec.level, attack: spec.attack, decay: 0.2, sustainLevel: 0.8, release: 0.12,
    });
    const top = Math.min(6500, f * spec.bright * (0.55 + 0.45 * vel));
    const lp = filter(ctx, 'lowpass', f * 1.2, 1.6);
    lp.frequency.setValueAtTime(f * 1.2, t);
    lp.frequency.linearRampToValueAtTime(top, t + spec.attack + 0.03);
    lp.frequency.setTargetAtTime(top * 0.72, t + spec.attack + 0.05, 0.15);
    lp.connect(v.out);
    const parts = spec.ens
      ? [['sawtooth', 1, -9, 0.4], ['sawtooth', 1, 0, 0.4], ['sawtooth', 1, 9, 0.4]]
      : [['sawtooth', 1, 0, 1 - spec.tri], ['triangle', 1, 0, spec.tri]];
    const oscs = stack(ctx, v, t, f, parts, lp);
    oscs.forEach((x) => {
      const c = x.detune.value;
      x.detune.setValueAtTime(c - 30, t);
      x.detune.linearRampToValueAtTime(c, t + 0.05);
    });
    vibrato(ctx, v, oscs, t, 5.3, 9, 0.35);
    return v;
  }

  function choir(ctx, dest, t, f, vel, o) {
    const v = sustained(ctx, dest, t, f, vel, {
      level: o.level || 0.5, attack: o.attack || 0.25, decay: 0.3, sustainLevel: 0.9, release: 0.5,
    });
    const src = gain(ctx, 1);
    const formants = o.ooh ? [[350, 1, 6], [800, 0.4, 8], [2700, 0.08, 10]] : [[730, 1, 7], [1090, 0.55, 9], [2440, 0.22, 11]];
    formants.forEach(([ff, a, q]) => {
      const bp = filter(ctx, 'bandpass', ff, q);
      const g = gain(ctx, a * 2.2);
      src.connect(bp);
      bp.connect(g);
      g.connect(v.out);
    });
    const oscs = stack(ctx, v, t, f, [['sawtooth', 1, -9, 0.5], ['sawtooth', 1, 0, 0.5], ['sawtooth', 1, 10, 0.5]], src);
    vibrato(ctx, v, oscs, t, 5.1, 14, 0.2);
    return v;
  }

  /** Синтезатор с настраиваемыми параметрами. */
  function lead(ctx, dest, t, f, vel, o) {
    const p = Object.assign({ wave: 'sawtooth', cutoff: 2600, q: 5, attack: 0.008, release: 0.22, detune: 12, unison: 2, env: 1.2, sub: 0.25, glide: 0 }, o);
    const v = sustained(ctx, dest, t, f, vel, {
      level: 0.17 * (p.wave === 'sine' ? 1.8 : p.wave === 'triangle' ? 1.5 : 1), attack: p.attack, decay: 0.35, sustainLevel: 0.75, release: p.release,
    });
    const lp = filter(ctx, 'lowpass', p.cutoff, p.q);
    const peak = Math.min(16000, p.cutoff * (1 + p.env * vel * 2));
    lp.frequency.setValueAtTime(p.cutoff * 0.4, t);
    lp.frequency.linearRampToValueAtTime(peak, t + Math.max(0.01, p.attack));
    lp.frequency.setTargetAtTime(p.cutoff, t + p.attack + 0.01, 0.18);
    lp.connect(v.out);
    const parts = [];
    const n = Math.max(1, p.unison);
    for (let i = 0; i < n; i++) {
      const c = n === 1 ? 0 : -p.detune + (2 * p.detune * i) / (n - 1);
      parts.push([p.wave, 1, c, 0.8 / Math.sqrt(n)]);
    }
    if (p.sub) parts.push(['square', 0.5, 0, p.sub]);
    stack(ctx, v, t, f, parts, lp);
    return v;
  }

  function pad(ctx, dest, t, f, vel, o) {
    const v = sustained(ctx, dest, t, f, vel, { level: 0.17, attack: o.attack || 0.6, decay: 0.8, sustainLevel: 0.9, release: 1.6 });
    const lp = filter(ctx, 'lowpass', Math.min(o.cutoff || 1500, f * 8), 1.2);
    const lfo = osc(ctx, v, 'sine', 0.25, t);
    const lg = gain(ctx, (o.cutoff || 1500) * 0.35);
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lp.connect(v.out);
    stack(ctx, v, t, f, [['sawtooth', 1, -12, 0.4], ['sawtooth', 1, -4, 0.4], ['sawtooth', 1, 5, 0.4], ['sawtooth', 2, 9, 0.15], ['triangle', 0.5, 0, 0.3]], lp);
    return v;
  }

  function chip(ctx, dest, t, f, vel, o) {
    const duty = o.duty || 0.25;
    const v = sustained(ctx, dest, t, f, 0.9, { level: 0.17, attack: 0.003, decay: 0.25, sustainLevel: 0.7, release: 0.05 });
    const o1 = osc(ctx, v, wave(ctx, 'pulse' + duty, pulseHarmonics(duty, 48)), f, t);
    o1.connect(v.out);
    vibrato(ctx, v, [o1], t, 6, 18, 0.35);
    return v;
  }

  function synthBass(ctx, dest, t, f, vel) {
    const v = sustained(ctx, dest, t, f, vel, { level: 0.24, attack: 0.004, decay: 0.3, sustainLevel: 0.7, release: 0.08 });
    const lp = filter(ctx, 'lowpass', 300, 7);
    lp.frequency.setValueAtTime(400 + 2600 * vel, t);
    lp.frequency.setTargetAtTime(Math.max(200, f * 3), t, 0.09);
    lp.connect(v.out);
    stack(ctx, v, t, f, [['sawtooth', 1, 0, 0.6], ['square', 1, 6, 0.3], ['sine', 0.5, 0, 0.5]], lp);
    return v;
  }

  const RECIPES = {
    piano,
    epiano,
    organ: (c, d, t, f, v, o) => organ(c, d, t, f, v, o, 'drawbar'),
    churchOrgan: (c, d, t, f, v, o) => organ(c, d, t, f, v, o, 'church'),
    reedOrgan: (c, d, t, f, v, o) => organ(c, d, t, f, v, o, 'reed'),
    strings: bowed,
    ensemble: (c, d, t, f, v, o) => bowed(c, d, t, f, v, Object.assign({ ensemble: true }, o)),
    choir,
    lead,
    pad,
    chip,
    synthBass,
  };
  Object.keys(MODAL).forEach((k) => (RECIPES[k] = (c, d, t, f, v, o) => modal(c, d, t, f, v, o, k)));
  Object.keys(PLUCK).forEach((k) => (RECIPES['pluck_' + k] = (c, d, t, f, v, o) => pluck(c, d, t, f, v, o, k)));
  Object.keys(WIND).forEach((k) => (RECIPES[k] = (c, d, t, f, v, o) => flute(c, d, t, f, v, o, k)));
  Object.keys(REED).forEach((k) => (RECIPES[k] = (c, d, t, f, v, o) => reed(c, d, t, f, v, o, k)));
  Object.keys(BRASS).forEach((k) => (RECIPES[k] = (c, d, t, f, v, o) => brass(c, d, t, f, v, o, k)));

  /* ---------- Ударные ---------- */

  let openHats = [];

  function metal(ctx, v, t, into, base) {
    [2, 3, 4.16, 5.43, 6.79, 8.21].forEach((r) => {
      const o1 = osc(ctx, v, 'square', (base || 40) * r * 10, t);
      const g = gain(ctx, 0.16);
      o1.connect(g);
      g.connect(into);
    });
  }

  function drumVoice(ctx, dest, t, level, dur) {
    const v = makeVoice(ctx, dest);
    v.out.gain.setValueAtTime(level, t);
    v.autoFinish(t + dur);
    return v;
  }

  function envGain(ctx, t, peak, decay, attack) {
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + (attack || 0.001));
    g.gain.setTargetAtTime(0, t + (attack || 0.001), decay / 4);
    return g;
  }

  function tone(ctx, v, t, into, type, f0, f1, drop, peak, decay) {
    const o1 = osc(ctx, v, type, f0, t);
    o1.frequency.setValueAtTime(f0, t);
    o1.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + drop);
    const g = envGain(ctx, t, peak, decay);
    o1.connect(g);
    g.connect(into);
    return o1;
  }

  function noiseHit(ctx, v, t, into, type, f, q, peak, decay, attack) {
    const n = noiseSrc(ctx, v, t);
    const fl = filter(ctx, type, f, q);
    const g = envGain(ctx, t, peak, decay, attack);
    n.connect(fl);
    fl.connect(g);
    g.connect(into);
  }

  const DRUMS = {
    kick(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.9 * velCurve(vel), 0.7);
      tone(ctx, v, t, v.out, 'sine', 160, 42, 0.11, 1, 0.55);
      noiseHit(ctx, v, t, v.out, 'highpass', 3000, 0.7, 0.25, 0.012);
      return v;
    },
    snare(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.55 * velCurve(vel), 0.45);
      tone(ctx, v, t, v.out, 'triangle', 240, 170, 0.05, 0.7, 0.12);
      noiseHit(ctx, v, t, v.out, 'highpass', 1400, 0.6, 0.9, 0.22);
      noiseHit(ctx, v, t, v.out, 'bandpass', 4500, 1, 0.4, 0.12);
      return v;
    },
    rim(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.45 * velCurve(vel), 0.12);
      tone(ctx, v, t, v.out, 'triangle', 1750, 1600, 0.02, 0.8, 0.035);
      noiseHit(ctx, v, t, v.out, 'bandpass', 3500, 2, 0.6, 0.02);
      return v;
    },
    clap(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 1.5 * velCurve(vel), 0.5);
      [0, 0.011, 0.023].forEach((o) => noiseHit(ctx, v, t + o, v.out, 'bandpass', 1300, 1.2, 0.8, 0.02));
      noiseHit(ctx, v, t + 0.03, v.out, 'bandpass', 1200, 1, 0.6, 0.28);
      return v;
    },
    hatClosed(ctx, d, t, vel) {
      openHats.forEach((h) => h.kill(t));
      openHats = [];
      const v = drumVoice(ctx, d, t, 0.7 * velCurve(vel), 0.15);
      const hp = filter(ctx, 'highpass', 7500, 0.8);
      const g = envGain(ctx, t, 1, 0.05);
      hp.connect(g);
      g.connect(v.out);
      metal(ctx, v, t, hp);
      noiseHit(ctx, v, t, v.out, 'highpass', 9000, 0.7, 0.35, 0.04);
      return v;
    },
    hatOpen(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.56 * velCurve(vel), 0.8);
      const hp = filter(ctx, 'highpass', 7000, 0.8);
      const g = envGain(ctx, t, 1, 0.5);
      hp.connect(g);
      g.connect(v.out);
      metal(ctx, v, t, hp);
      noiseHit(ctx, v, t, v.out, 'highpass', 8500, 0.7, 0.3, 0.45);
      openHats.push(v);
      return v;
    },
    hatPedal(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 1.0 * velCurve(vel), 0.12);
      const hp = filter(ctx, 'highpass', 6000, 0.8);
      const g = envGain(ctx, t, 1, 0.035, 0.006);
      hp.connect(g);
      g.connect(v.out);
      metal(ctx, v, t, hp, 36);
      return v;
    },
    crash(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.3 * velCurve(vel), 2.6);
      const hp = filter(ctx, 'highpass', 4500, 0.6);
      const g = envGain(ctx, t, 1, 2.0);
      hp.connect(g);
      g.connect(v.out);
      metal(ctx, v, t, hp, 43);
      noiseHit(ctx, v, t, v.out, 'highpass', 5000, 0.5, 0.75, 2.2);
      return v;
    },
    ride(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.65 * velCurve(vel), 2.0);
      const bp = filter(ctx, 'bandpass', 8500, 0.9);
      const g = envGain(ctx, t, 1, 1.4);
      bp.connect(g);
      g.connect(v.out);
      metal(ctx, v, t, bp, 47);
      tone(ctx, v, t, v.out, 'sine', 2950, 2950, 0.01, 0.12, 0.9);
      noiseHit(ctx, v, t, v.out, 'highpass', 9000, 0.5, 0.15, 0.6);
      return v;
    },
    tomHigh: (ctx, d, t, vel) => tom(ctx, d, t, vel, 250),
    tomMid: (ctx, d, t, vel) => tom(ctx, d, t, vel, 175),
    tomLow: (ctx, d, t, vel) => tom(ctx, d, t, vel, 115),
    cowbell(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.25 * velCurve(vel), 0.5);
      const bp = filter(ctx, 'bandpass', 900, 2.5);
      const g = envGain(ctx, t, 1, 0.35);
      bp.connect(g);
      g.connect(v.out);
      [560, 845].forEach((f) => osc(ctx, v, 'square', f, t).connect(bp));
      return v;
    },
    bongoHigh: (ctx, d, t, vel) => hand(ctx, d, t, vel, 420, 0.13, 0.25),
    bongoLow: (ctx, d, t, vel) => hand(ctx, d, t, vel, 310, 0.17, 0.25),
    congaHigh: (ctx, d, t, vel) => hand(ctx, d, t, vel, 255, 0.25, 0.3),
    congaLow: (ctx, d, t, vel) => hand(ctx, d, t, vel, 190, 0.32, 0.3),
    djembe(ctx, d, t, vel) {
      const v = hand(ctx, d, t, vel, 95, 0.35, 0.35);
      noiseHit(ctx, v, t, v.out, 'bandpass', 2200, 1, 0.3, 0.05);
      return v;
    },
    cajon(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.7 * velCurve(vel), 0.4);
      tone(ctx, v, t, v.out, 'sine', 120, 70, 0.06, 1, 0.25);
      noiseHit(ctx, v, t, v.out, 'bandpass', 2600, 0.8, 0.35, 0.09);
      return v;
    },
    cajonSlap(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.5 * velCurve(vel), 0.3);
      tone(ctx, v, t, v.out, 'triangle', 300, 220, 0.03, 0.4, 0.08);
      noiseHit(ctx, v, t, v.out, 'bandpass', 3200, 0.9, 1, 0.13);
      return v;
    },
    tambourine(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.45 * velCurve(vel), 0.5);
      [0, 0.012, 0.03].forEach((o, i) => noiseHit(ctx, v, t + o, v.out, 'bandpass', 8500 + i * 900, 3, 1 - i * 0.25, 0.25));
      const hp = filter(ctx, 'highpass', 6500, 1);
      const g = envGain(ctx, t, 0.6, 0.3);
      hp.connect(g);
      g.connect(v.out);
      metal(ctx, v, t, hp, 55);
      return v;
    },
    shaker(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.55 * velCurve(vel), 0.2);
      noiseHit(ctx, v, t, v.out, 'bandpass', 6500, 1.4, 1, 0.07, 0.025);
      return v;
    },
    triangle(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.14 * velCurve(vel), 3);
      [[1250, 1], [3380, 0.5], [5600, 0.3], [7900, 0.2]].forEach(([f, a]) => tone(ctx, v, t, v.out, 'sine', f, f, 0.01, a, 2.6));
      return v;
    },
    woodblock(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.5 * velCurve(vel), 0.15);
      tone(ctx, v, t, v.out, 'sine', 880, 820, 0.02, 1, 0.06);
      tone(ctx, v, t, v.out, 'sine', 2420, 2400, 0.01, 0.3, 0.03);
      return v;
    },
    claves(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.4 * velCurve(vel), 0.15);
      tone(ctx, v, t, v.out, 'sine', 2500, 2450, 0.01, 1, 0.07);
      return v;
    },
    agogo(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.22 * velCurve(vel), 0.6);
      [[920, 1], [2400, 0.4]].forEach(([f, a]) => tone(ctx, v, t, v.out, 'sine', f, f, 0.01, a, 0.45));
      return v;
    },
    guiro(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.9 * velCurve(vel), 0.5);
      for (let i = 0; i < 12; i++) noiseHit(ctx, v, t + i * 0.022, v.out, 'bandpass', 3000 + i * 60, 2, 0.8, 0.012);
      return v;
    },
    snap(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 2.0 * velCurve(vel), 0.15);
      noiseHit(ctx, v, t, v.out, 'bandpass', 2600, 2.5, 1, 0.025);
      return v;
    },
    taiko(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.9 * velCurve(vel), 1.4);
      tone(ctx, v, t, v.out, 'sine', 95, 58, 0.18, 1, 1.0);
      noiseHit(ctx, v, t, v.out, 'lowpass', 600, 0.7, 0.6, 0.25);
      return v;
    },
    bassDrum808(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.85 * velCurve(vel), 1.4);
      tone(ctx, v, t, v.out, 'sine', 110, 46, 0.25, 1, 1.2);
      return v;
    },
    whistle(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.36 * velCurve(vel), 0.5);
      tone(ctx, v, t, v.out, 'sine', 2950, 2880, 0.3, 1, 0.35);
      noiseHit(ctx, v, t, v.out, 'bandpass', 2900, 6, 0.4, 0.3, 0.02);
      return v;
    },
    cuica(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.4 * velCurve(vel), 0.5);
      tone(ctx, v, t, v.out, 'sine', 380, 720, 0.18, 1, 0.25);
      tone(ctx, v, t, v.out, 'sine', 760, 1440, 0.18, 0.3, 0.2);
      return v;
    },

    /* Табла: правый барабан (даян) звенит, левый (баян) гудит и «подтягивается» запястьем. */
    tablaNa(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.42 * velCurve(vel), 1.2);
      [[1, 1, 0.9], [2.02, 0.5, 0.6], [3.01, 0.32, 0.4], [4.2, 0.12, 0.2]].forEach(([r, a, dec]) => tone(ctx, v, t, v.out, 'sine', 520 * r, 520 * r, 0.01, a, dec));
      noiseHit(ctx, v, t, v.out, 'bandpass', 4000, 1.5, 0.5, 0.012);
      return v;
    },
    tablaTin(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.4 * velCurve(vel), 1);
      [[1, 1, 0.75], [2.02, 0.22, 0.3], [3.01, 0.1, 0.18]].forEach(([r, a, dec]) => tone(ctx, v, t, v.out, 'sine', 520 * r, 520 * r, 0.01, a, dec));
      noiseHit(ctx, v, t, v.out, 'bandpass', 2600, 1.2, 0.25, 0.015);
      return v;
    },
    tablaTun(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.45 * velCurve(vel), 1.6);
      tone(ctx, v, t, v.out, 'sine', 525, 520, 0.05, 1, 1.4);
      tone(ctx, v, t, v.out, 'sine', 1050, 1040, 0.05, 0.15, 0.4);
      return v;
    },
    tablaTe(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.45 * velCurve(vel), 0.15);
      noiseHit(ctx, v, t, v.out, 'bandpass', 2500, 1, 1, 0.05);
      tone(ctx, v, t, v.out, 'sine', 700, 600, 0.02, 0.4, 0.05);
      return v;
    },
    tablaGe(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.7 * velCurve(vel), 1.2);
      tone(ctx, v, t, v.out, 'sine', 92, 128, 0.35, 1, 0.9);
      tone(ctx, v, t, v.out, 'sine', 184, 250, 0.35, 0.25, 0.4);
      noiseHit(ctx, v, t, v.out, 'lowpass', 400, 0.7, 0.4, 0.03);
      return v;
    },
    tablaKe(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.6 * velCurve(vel), 0.2);
      tone(ctx, v, t, v.out, 'sine', 140, 110, 0.03, 1, 0.07);
      noiseHit(ctx, v, t, v.out, 'bandpass', 1200, 1, 0.5, 0.03);
      return v;
    },
    tablaDha: (ctx, d, t, vel) => both(DRUMS.tablaNa(ctx, d, t, vel * 0.8), DRUMS.tablaGe(ctx, d, t, vel * 0.8)),
    tablaDhin: (ctx, d, t, vel) => both(DRUMS.tablaTin(ctx, d, t, vel * 0.8), DRUMS.tablaGe(ctx, d, t, vel * 0.8)),

    /* Дарбука: «дум» в центр, «тек» и «ка» — по краю кувшина. */
    darbukaDoum(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.8 * velCurve(vel), 0.9);
      tone(ctx, v, t, v.out, 'sine', 120, 82, 0.08, 1, 0.6);
      noiseHit(ctx, v, t, v.out, 'lowpass', 500, 0.7, 0.5, 0.04);
      return v;
    },
    darbukaTek(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.5 * velCurve(vel), 0.4);
      noiseHit(ctx, v, t, v.out, 'bandpass', 3600, 1.4, 1, 0.045);
      tone(ctx, v, t, v.out, 'sine', 1650, 1650, 0.01, 0.35, 0.18);
      tone(ctx, v, t, v.out, 'triangle', 820, 760, 0.02, 0.4, 0.04);
      return v;
    },
    darbukaKa(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.68 * velCurve(vel), 0.35);
      noiseHit(ctx, v, t, v.out, 'bandpass', 2900, 1.4, 0.8, 0.04);
      tone(ctx, v, t, v.out, 'sine', 1500, 1500, 0.01, 0.25, 0.14);
      return v;
    },
    darbukaSlap(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.55 * velCurve(vel), 0.3);
      noiseHit(ctx, v, t, v.out, 'bandpass', 1700, 1, 1, 0.1);
      tone(ctx, v, t, v.out, 'sine', 260, 210, 0.03, 0.6, 0.12);
      return v;
    },
    darbukaRoll(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.6 * velCurve(vel), 0.55);
      for (let i = 0; i < 7; i++) noiseHit(ctx, v, t + i * 0.042, v.out, 'bandpass', 3400 - i * 60, 1.4, 1 - i * 0.08, 0.03);
      tone(ctx, v, t, v.out, 'sine', 1650, 1650, 0.01, 0.25, 0.4);
      return v;
    },

    /* Русские народные: ложки, трещотка, бубен, бубенцы, коробочка, колокольчик, рубель. */
    spoons(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.6 * velCurve(vel), 0.15);
      tone(ctx, v, t, v.out, 'sine', 1750, 1500, 0.02, 1, 0.035);
      tone(ctx, v, t + 0.018, v.out, 'sine', 2300, 2000, 0.02, 0.7, 0.03);
      noiseHit(ctx, v, t, v.out, 'bandpass', 3200, 2, 0.6, 0.015);
      return v;
    },
    spoonsRoll(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.5 * velCurve(vel), 0.42);
      for (let i = 0; i < 6; i++) {
        const f = i % 2 ? 2200 : 1700;
        tone(ctx, v, t + i * 0.055, v.out, 'sine', f, f * 0.86, 0.02, 1 - i * 0.08, 0.03);
        noiseHit(ctx, v, t + i * 0.055, v.out, 'bandpass', 3200, 2, 0.4, 0.012);
      }
      return v;
    },
    rattle(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.75 * velCurve(vel), 0.4);
      for (let i = 0; i < 14; i++) {
        noiseHit(ctx, v, t + i * 0.022, v.out, 'bandpass', 1900 + Math.random() * 900, 3, 1 - i * 0.04, 0.012);
        tone(ctx, v, t + i * 0.022, v.out, 'triangle', 950 + Math.random() * 300, 900, 0.01, 0.25, 0.01);
      }
      return v;
    },
    buben(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.45 * velCurve(vel), 0.6);
      tone(ctx, v, t, v.out, 'sine', 190, 150, 0.05, 0.8, 0.12);
      [0, 0.012, 0.028].forEach((o, i) => noiseHit(ctx, v, t + o, v.out, 'bandpass', 8000 + i * 900, 3, 0.8 - i * 0.2, 0.22));
      const hp = filter(ctx, 'highpass', 6500, 1);
      const g = envGain(ctx, t, 0.6, 0.3);
      hp.connect(g);
      g.connect(v.out);
      metal(ctx, v, t, hp, 55);
      return v;
    },
    sleighBells(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.32 * velCurve(vel), 0.6);
      for (let i = 0; i < 8; i++) {
        const o = Math.random() * 0.12;
        tone(ctx, v, t + o, v.out, 'sine', 4200 + Math.random() * 1500, 4200, 0.3, 0.35, 0.12);
        noiseHit(ctx, v, t + o, v.out, 'bandpass', 9000, 2, 0.45, 0.04);
      }
      return v;
    },
    korobochka(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.55 * velCurve(vel), 0.15);
      tone(ctx, v, t, v.out, 'sine', 1150, 1100, 0.01, 1, 0.05);
      tone(ctx, v, t, v.out, 'sine', 2750, 2750, 0.01, 0.35, 0.03);
      noiseHit(ctx, v, t, v.out, 'bandpass', 2500, 2, 0.3, 0.01);
      return v;
    },
    smallBell(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.22 * velCurve(vel), 2);
      [[1, 1, 1.5], [2.76, 0.45, 0.8], [5.4, 0.25, 0.4], [8.93, 0.12, 0.2]].forEach(([r, a, dec]) => tone(ctx, v, t, v.out, 'sine', 1850 * r, 1850 * r, 0.01, a, dec));
      return v;
    },
    rubel(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 1.2 * velCurve(vel), 0.65);
      for (let i = 0; i < 9; i++) noiseHit(ctx, v, t + i * 0.06, v.out, 'bandpass', 1300 + i * 40, 2, 0.9, 0.02);
      return v;
    },

    /* Тайко. */
    taikoNagado(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.8 * velCurve(vel), 1);
      tone(ctx, v, t, v.out, 'sine', 140, 92, 0.12, 1, 0.65);
      noiseHit(ctx, v, t, v.out, 'lowpass', 900, 0.7, 0.5, 0.12);
      return v;
    },
    taikoKa(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.5 * velCurve(vel), 0.2);
      tone(ctx, v, t, v.out, 'sine', 1450, 1350, 0.01, 1, 0.05);
      tone(ctx, v, t, v.out, 'sine', 3100, 3100, 0.01, 0.3, 0.03);
      noiseHit(ctx, v, t, v.out, 'bandpass', 3500, 2, 0.5, 0.015);
      return v;
    },
    shime(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.55 * velCurve(vel), 0.35);
      tone(ctx, v, t, v.out, 'sine', 420, 350, 0.03, 1, 0.14);
      tone(ctx, v, t, v.out, 'triangle', 840, 720, 0.03, 0.3, 0.06);
      noiseHit(ctx, v, t, v.out, 'bandpass', 2200, 1.2, 0.8, 0.05);
      return v;
    },
    kane(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.22 * velCurve(vel), 1.5);
      [[1, 1, 1.2], [2.31, 0.6, 0.8], [3.42, 0.4, 0.5], [4.9, 0.2, 0.3]].forEach(([r, a, dec]) => tone(ctx, v, t, v.out, 'sine', 1180 * r, 1180 * r, 0.01, a, dec));
      noiseHit(ctx, v, t, v.out, 'highpass', 6000, 0.7, 0.4, 0.02);
      return v;
    },

    /* Джембе и кахон. */
    djembeTone(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.55 * velCurve(vel), 0.4);
      tone(ctx, v, t, v.out, 'sine', 360, 320, 0.03, 1, 0.2);
      noiseHit(ctx, v, t, v.out, 'bandpass', 1800, 1.2, 0.35, 0.03);
      return v;
    },
    djembeSlap(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.55 * velCurve(vel), 0.25);
      noiseHit(ctx, v, t, v.out, 'bandpass', 2800, 1, 1, 0.07);
      tone(ctx, v, t, v.out, 'sine', 520, 430, 0.02, 0.45, 0.06);
      return v;
    },
    cajonGhost(ctx, d, t, vel) {
      const v = drumVoice(ctx, d, t, 0.25 * velCurve(vel), 0.2);
      noiseHit(ctx, v, t, v.out, 'bandpass', 2400, 0.8, 1, 0.06);
      tone(ctx, v, t, v.out, 'sine', 160, 120, 0.03, 0.5, 0.07);
      return v;
    },
  };

  /** Два удара сразу (например, «дха» на табле — правой и левой рукой). */
  function both(a, b) {
    return {
      sustain: false,
      sources: [],
      endTime: Math.max(a.endTime || 0, b.endTime || 0),
      stop() {},
      kill(t) {
        a.kill(t);
        b.kill(t);
      },
    };
  }

  function tom(ctx, d, t, vel, f) {
    const v = drumVoice(ctx, d, t, 0.6 * velCurve(vel), 0.8);
    tone(ctx, v, t, v.out, 'sine', f * 1.35, f, 0.12, 1, 0.55);
    tone(ctx, v, t, v.out, 'triangle', f * 2.1, f * 1.6, 0.08, 0.15, 0.2);
    noiseHit(ctx, v, t, v.out, 'lowpass', 3000, 0.7, 0.2, 0.05);
    return v;
  }

  function hand(ctx, d, t, vel, f, decay, slap) {
    const v = drumVoice(ctx, d, t, 0.55 * velCurve(vel), decay * 2.5);
    tone(ctx, v, t, v.out, 'sine', f * 1.15, f, 0.04, 1, decay);
    noiseHit(ctx, v, t, v.out, 'bandpass', f * 6, 1.5, slap, 0.02);
    return v;
  }

  /* ---------- Непрерывный голос (терменвокс) ---------- */

  function continuous(ctx, dest, f) {
    const v = makeVoice(ctx, dest);
    v.sustain = true;
    v.release = 0.25;
    const lp = filter(ctx, 'lowpass', 3200, 0.5);
    lp.connect(v.out);
    const o1 = osc(ctx, v, wave(ctx, 'theremin', [1, 0.12, 0.05, 0.02]), f, ctx.currentTime);
    o1.connect(lp);
    vibrato(ctx, v, [o1], ctx.currentTime, 5.8, 9, 0.15);
    v.autoFinish(ctx.currentTime + 3600);
    v.setFreq = (freq, glide) => o1.frequency.setTargetAtTime(freq, ctx.currentTime, glide == null ? 0.03 : glide);
    v.setLevel = (l) => v.out.gain.setTargetAtTime(0.32 * l, ctx.currentTime, 0.03);
    return v;
  }

  /* ---------- Публичный интерфейс ---------- */

  App.synth = {
    makeVoice,
    velCurve,
    recipes: Object.keys(RECIPES),
    drums: Object.keys(DRUMS),
    play(name, midi, vel, dest, t, opts, ctx) {
      ctx = ctx || App.audio.ctx;
      const r = RECIPES[name] || RECIPES.piano;
      return r(ctx, dest, t, N.freq(midi), vel, opts || {});
    },
    drum(name, vel, dest, t, ctx) {
      ctx = ctx || App.audio.ctx;
      return (DRUMS[name] || DRUMS.snare)(ctx, dest, t, vel);
    },
    continuous(dest, f, ctx) {
      return continuous(ctx || App.audio.ctx, dest, f);
    },
    /** Подготовить буферы щипковых заранее, чтобы первое нажатие не тормозило. */
    warm(name, midis, opts, ctx) {
      ctx = ctx || App.audio.ctx;
      const kind = name.startsWith('pluck_') ? name.slice(6) : null;
      if (!kind) return;
      const spec = Object.assign({}, PLUCK[kind], opts);
      midis.forEach((m, i) => setTimeout(() => ksBuffer(ctx, N.freq(m), spec), i * 4));
    },
  };
})();
