/* Аудиодвижок: контекст, мастер-шина, реверберация, шины инструментов, голоса, метроном, запись. */
(function () {
  const App = (window.App = window.App || {});

  const MAX_VOICES = 72;
  const audio = (App.audio = {
    ctx: null,
    voices: [],
    settings: { volume: 0.8, reverb: 0.25 },
  });

  let master, limiter, reverbSend, convolver, recordDest;
  const buses = new Map();

  /** Контекст без попытки его запустить — для фоновой загрузки и декодирования. */
  audio.context = function () {
    if (!audio.ctx) init();
    return audio.ctx;
  };

  audio.ensure = function () {
    if (!audio.ctx) init();
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    return audio.ctx;
  };

  function init() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = (audio.ctx = new Ctx({ latencyHint: 'interactive' }));

    master = ctx.createGain();
    master.gain.value = audio.settings.volume;

    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;

    master.connect(limiter);
    limiter.connect(ctx.destination);

    recordDest = ctx.createMediaStreamDestination();
    limiter.connect(recordDest);

    convolver = ctx.createConvolver();
    convolver.buffer = impulse(ctx, 2.6, 2.8);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 1;
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.9;
    reverbSend.connect(convolver);
    convolver.connect(reverbReturn);
    reverbReturn.connect(master);
  }

  // Искусственный «зал»: стерео-шум с экспоненциальным затуханием и мягкой окраской.
  function impulse(ctx, seconds, decay) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += 0.35 * (Math.random() * 2 - 1 - lp);
        const early = i < rate * 0.08 ? 0.6 * Math.random() * (i % 97 === 0 ? 1 : 0.15) : 0;
        d[i] = (lp + early) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  audio.setVolume = function (v) {
    audio.settings.volume = v;
    if (master) master.gain.setTargetAtTime(v, audio.ctx.currentTime, 0.02);
  };

  /** Подмешать внешний звук (микрофон, живой звук друга) в общий выход — он попадёт и в запись. */
  audio.mixIn = function (node) {
    audio.ensure();
    node.connect(master);
  };

  audio.setReverb = function (v) {
    audio.settings.reverb = v;
    buses.forEach((b) => b.updateSend());
  };

  /**
   * Шина инструмента: вход → (эффекты) → мастер + посыл в реверберацию.
   * fx: [{type:'drive', amount}, {type:'peaking'|'lowpass'|'highpass'|'highshelf'|'lowshelf', f, q, g}]
   */
  audio.bus = function (key, opts) {
    audio.ensure();
    if (buses.has(key)) return buses.get(key);
    const ctx = audio.ctx;
    const input = ctx.createGain();
    input.gain.value = (opts && opts.level) || 1;
    let node = input;
    ((opts && opts.fx) || []).forEach((fx) => {
      let n;
      if (fx.type === 'drive') {
        n = ctx.createWaveShaper();
        n.curve = driveCurve(fx.amount || 20);
        n.oversample = '2x';
      } else if (fx.type === 'chorus') {
        n = chorus(ctx, fx);
      } else {
        n = ctx.createBiquadFilter();
        n.type = fx.type;
        n.frequency.value = fx.f;
        if (fx.q != null) n.Q.value = fx.q;
        if (fx.g != null) n.gain.value = fx.g;
      }
      node.connect(n.input || n);
      node = n.output || n;
    });
    const out = ctx.createGain();
    node.connect(out);
    out.connect(master);
    const send = ctx.createGain();
    out.connect(send);
    send.connect(reverbSend);
    const reverbMul = (opts && opts.reverb) != null ? opts.reverb : 1;
    const bus = {
      input,
      updateSend() {
        send.gain.setTargetAtTime(Math.min(1.2, audio.settings.reverb * reverbMul), ctx.currentTime, 0.05);
      },
    };
    bus.updateSend();
    buses.set(key, bus);
    return bus;
  };

  function driveCurve(k) {
    const n = 2048;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return c;
  }

  function chorus(ctx, fx) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    input.connect(dry);
    dry.connect(output);
    [0.012, 0.019].forEach((base, i) => {
      const d = ctx.createDelay(0.05);
      d.delayTime.value = base;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = (fx.rate || 0.6) + i * 0.27;
      const depth = ctx.createGain();
      depth.gain.value = fx.depth || 0.003;
      lfo.connect(depth);
      depth.connect(d.delayTime);
      lfo.start();
      const g = ctx.createGain();
      g.gain.value = 0.45;
      input.connect(d);
      d.connect(g);
      g.connect(output);
    });
    return { input, output };
  }

  /* ---------- Голоса ---------- */

  /** Регистрирует голос для лимита полифонии. voice: {kill(t), endTime, ...} */
  audio.track = function (voice) {
    const now = audio.ctx.currentTime;
    audio.voices = audio.voices.filter((v) => v.endTime == null || v.endTime > now);
    if (audio.voices.length >= MAX_VOICES) {
      const old = audio.voices.shift();
      old.kill(now);
    }
    audio.voices.push(voice);
    return voice;
  };

  audio.killAll = function () {
    if (!audio.ctx) return;
    const now = audio.ctx.currentTime;
    audio.voices.forEach((v) => v.kill(now));
    audio.voices = [];
  };

  /* ---------- Метроном ---------- */

  const metro = (audio.metronome = {
    bpm: 100,
    beats: 4,
    running: false,
    onBeat: null,
    _timer: null,
    _next: 0,
    _beat: 0,
  });

  metro.start = function () {
    const ctx = audio.ensure();
    if (metro.running) return;
    metro.running = true;
    metro._beat = 0;
    metro._next = ctx.currentTime + 0.06;
    metro._timer = setInterval(schedule, 25);
    schedule();
  };

  metro.stop = function () {
    metro.running = false;
    clearInterval(metro._timer);
  };

  function schedule() {
    const ctx = audio.ctx;
    // Вкладка была в фоне, и таймер опаздывал: пропущенные щелчки не играем все разом.
    while (metro._next < ctx.currentTime - 0.05) {
      metro._next += 60 / metro.bpm;
      metro._beat++;
    }
    while (metro._next < ctx.currentTime + 0.12) {
      const accent = metro._beat % metro.beats === 0;
      click(metro._next, accent);
      const beat = metro._beat % metro.beats;
      const delay = Math.max(0, (metro._next - ctx.currentTime) * 1000);
      setTimeout(() => metro.running && metro.onBeat && metro.onBeat(beat, accent), delay);
      metro._next += 60 / metro.bpm;
      metro._beat++;
    }
  }

  function click(t, accent) {
    const ctx = audio.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.3, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.06);
  }

  /* ---------- Запись ---------- */

  const rec = (audio.recorder = { active: false, startedAt: 0 });
  let mediaRecorder = null;
  let chunks = [];

  rec.supported = () => typeof window.MediaRecorder !== 'undefined';

  rec.start = function () {
    audio.ensure();
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    mediaRecorder = new MediaRecorder(recordDest.stream, mimeType ? { mimeType } : undefined);
    chunks = [];
    mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mediaRecorder.start(250);
    rec.active = true;
    rec.startedAt = performance.now();
  };

  /** Останавливает запись и отдаёт {blob, url, duration, ext}. */
  rec.stop = function () {
    return new Promise((resolve) => {
      if (!mediaRecorder) return resolve(null);
      const duration = (performance.now() - rec.startedAt) / 1000;
      mediaRecorder.onstop = () => {
        const type = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        rec.active = false;
        mediaRecorder = null;
        resolve({ blob, url: URL.createObjectURL(blob), duration, ext });
      };
      mediaRecorder.stop();
    });
  };
})();
