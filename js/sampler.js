/* Живые записи инструментов (General MIDI, FluidR3): подгружаются по нотам в фоне, с подменой синтезом. */
(function () {
  const App = (window.App = window.App || {});
  const N = App.notes;

  const BASE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
  const PARALLEL = 6;
  const LOWEST = 21;
  const HIGHEST = 108;

  const buffers = new Map(); // 'gm:midi' → AudioBuffer
  const pending = new Map(); // 'gm:midi' → Promise
  const failures = new Map(); // gm → число ошибок подряд
  const listeners = new Set();
  let queue = [];
  let inFlight = 0;

  const key = (gm, m) => gm + ':' + m;

  const sampler = (App.sampler = {
    enabled: true,
    url: (gm, m) => BASE + gm + '-mp3/' + N.fileName(m) + '.mp3',
  });

  sampler.onChange = (fn) => listeners.add(fn);
  const emit = (gm) => listeners.forEach((fn) => fn(gm));

  sampler.failed = (gm) => (failures.get(gm) || 0) >= 3;

  /** Сколько нот из списка уже загружено. */
  sampler.progress = function (gm, midis) {
    let loaded = 0;
    midis.forEach((m) => buffers.has(key(gm, m)) && loaded++);
    return { loaded, total: midis.length, failed: sampler.failed(gm) };
  };

  /** Поставить ноты в очередь загрузки (новые запросы важнее старых). */
  sampler.preload = function (gm, midis) {
    if (!gm) return;
    if (sampler.failed(gm)) failures.set(gm, 0);
    const wanted = midis.filter((m) => m >= LOWEST && m <= HIGHEST && !buffers.has(key(gm, m)) && !pending.has(key(gm, m)));
    // Сначала середина диапазона — именно там чаще играют.
    const mid = (midis[0] + midis[midis.length - 1]) / 2;
    wanted.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    queue = wanted.map((m) => ({ gm, m })).concat(queue.filter((q) => q.gm !== gm));
    pump();
  };

  function pump() {
    while (inFlight < PARALLEL && queue.length) {
      const job = queue.shift();
      load(job.gm, job.m);
    }
  }

  function load(gm, m) {
    const k = key(gm, m);
    if (buffers.has(k)) return Promise.resolve(buffers.get(k));
    if (pending.has(k)) return pending.get(k);
    if (sampler.failed(gm)) return Promise.resolve(null);
    const ctx = App.audio.context();
    inFlight++;
    const p = fetch(sampler.url(gm, m))
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => {
        buffers.set(k, buf);
        failures.set(gm, 0);
        return buf;
      })
      .catch(() => {
        failures.set(gm, (failures.get(gm) || 0) + 1);
        if (sampler.failed(gm)) queue = queue.filter((q) => q.gm !== gm);
        return null;
      })
      .finally(() => {
        pending.delete(k);
        inFlight--;
        emit(gm);
        pump();
      });
    pending.set(k, p);
    return p;
  }

  /* ---------- Отдельные файлы по адресу (удары барабанов) ---------- */

  const urlBuffers = new Map();
  const urlPending = new Map();

  sampler.cached = (url) => urlBuffers.get(url) || null;
  sampler.groupFailed = (group) => (failures.get(group) || 0) >= 3;
  sampler.resetGroup = (group) => failures.set(group, 0);

  /** Загрузить файл один раз; group — общий счётчик ошибок (например, весь набор барабанов). */
  sampler.fetchUrl = function (url, group) {
    if (urlBuffers.has(url)) return Promise.resolve(urlBuffers.get(url));
    if (urlPending.has(url)) return urlPending.get(url);
    if (sampler.groupFailed(group)) return Promise.resolve(null);
    const ctx = App.audio.context();
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => {
        urlBuffers.set(url, buf);
        failures.set(group, 0);
        return buf;
      })
      .catch(() => {
        failures.set(group, (failures.get(group) || 0) + 1);
        return null;
      })
      .finally(() => {
        urlPending.delete(url);
        emit(group);
      });
    urlPending.set(url, p);
    return p;
  };

  /** Ближайшая загруженная нота в пределах ±range полутонов. */
  function nearest(gm, m, range) {
    for (let d = 0; d <= range; d++) {
      if (buffers.has(key(gm, m - d))) return m - d;
      if (buffers.has(key(gm, m + d))) return m + d;
    }
    return null;
  }

  /**
   * Сыграть ноту из записи. Если её ещё нет — берём соседнюю с подстройкой высоты,
   * иначе возвращаем null, и движок сыграет синтезом.
   */
  sampler.play = function (inst, midi, vel, dest, t) {
    const gm = inst.gm;
    const ctx = App.audio.ctx;
    const m = Math.round(midi);
    if (!buffers.has(key(gm, m))) load(gm, m);
    const src = nearest(gm, m, 5);
    if (src == null) return null;
    const buf = buffers.get(key(gm, src));

    const v = App.synth.makeVoice(ctx, dest);
    v.sustain = inst.mode === 'sustain';
    v.release = inst.release || (v.sustain ? 0.22 : 0.1);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = Math.pow(2, (midi - src) / 12);
    if (inst.loop && v.sustain) {
      s.loop = true;
      s.loopStart = buf.duration * inst.loop[0];
      s.loopEnd = buf.duration * inst.loop[1];
    }
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = Math.min(ctx.sampleRate / 2 - 100, 2500 + 17000 * vel * vel);
    s.connect(tone);
    tone.connect(v.out);
    v.add(s);
    s.start(t);
    // Записи FluidR3 тихие (пик ≈ 0.1) — поднимаем их до уровня синтеза.
    const level = (inst.sampleLevel || 1) * 2.8 * App.synth.velCurve(vel);
    v.out.gain.setValueAtTime(0, t);
    v.out.gain.linearRampToValueAtTime(level, t + 0.003);
    v.finish(s.loop ? t + 60 : t + buf.duration / s.playbackRate.value);
    return v;
  };
})();
