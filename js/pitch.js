/* Высота звука: алгоритм YIN и превращение «высота + громкость» в ноты. Общий для микрофона и аудиофайлов. */
(function () {
  const App = (window.App = window.App || {});
  const N = App.notes;

  const MIN_F = 40; // ниже «ми» контроктавы бас-гитары
  const MAX_F = 2100; // до₇

  /**
   * Детектор для окон длины size: detect(x, sr) → { freq, clarity } или null, если высоты нет.
   * При частоте выше 32 кГц считает по половине отсчётов — для мелодии этого с запасом, а вчетверо быстрее.
   */
  function detector(size) {
    const half = new Float32Array(size);
    const diff = new Float32Array(size + 2);
    const cmnd = new Float32Array(size + 2);
    return function detect(x, sr) {
      let data = x;
      let rate = sr;
      let n = x.length;
      if (sr > 32000) {
        n = x.length >> 1;
        for (let i = 0; i < n; i++) half[i] = 0.5 * (x[2 * i] + x[2 * i + 1]);
        data = half;
        rate = sr / 2;
      }
      const tauMin = Math.max(2, Math.floor(rate / MAX_F));
      const tauMax = Math.min(Math.floor(rate / MIN_F), n >> 1);
      const w = n - tauMax;
      for (let tau = 1; tau <= tauMax; tau++) {
        let s = 0;
        for (let j = 0; j < w; j++) {
          const d = data[j] - data[j + tau];
          s += d * d;
        }
        diff[tau] = s;
      }
      let run = 0;
      cmnd[0] = 1;
      for (let tau = 1; tau <= tauMax; tau++) {
        run += diff[tau];
        cmnd[tau] = run ? (diff[tau] * tau) / run : 1;
      }
      let tau = -1;
      for (let t = tauMin; t < tauMax; t++) {
        if (cmnd[t] < 0.15) {
          while (t + 1 < tauMax && cmnd[t + 1] < cmnd[t]) t++;
          tau = t;
          break;
        }
      }
      if (tau < 0) return null;
      const a = cmnd[tau - 1];
      const b = cmnd[tau];
      const c = cmnd[tau + 1];
      const den = a - 2 * b + c;
      const shift = den ? (a - c) / (2 * den) : 0;
      return { freq: rate / (tau + Math.max(-1, Math.min(1, shift))), clarity: 1 - b };
    };
  }

  /** Громкость (дБ) последних count отсчётов. */
  function level(x, count) {
    const from = Math.max(0, x.length - count);
    let sum = 0;
    for (let i = from; i < x.length; i++) sum += x[i] * x[i];
    const rms = Math.sqrt(sum / Math.max(1, x.length - from));
    return rms > 1e-6 ? 20 * Math.log10(rms) : -120;
  }

  /**
   * Из кадров «высота + громкость» — в ноты. Кадр примерно раз в 20 мс.
   * opts.gate() — порог громкости в дБ; opts.change(midi | null, db) — нота сменилась (null — тишина);
   * opts.retrigger(db) — ту же ноту сыграли ещё раз.
   */
  function tracker(opts) {
    const st = { note: null, pitch: null, cand: null, count: 0, quiet: 0, unclear: 0, env: -120 };
    const set = (n, db) => {
      if (n === st.note) return;
      st.note = n;
      opts.change(n, db);
    };
    return {
      get note() {
        return st.note;
      },
      /** Точная высота в полутонах (с дробной частью), сглаженная — для тюнера. */
      get pitch() {
        return st.pitch;
      },
      push(p, db) {
        const prev = st.env;
        st.env = Math.max(db, st.env - 1.5);
        if (db < opts.gate()) {
          st.pitch = null;
          st.cand = null;
          st.count = 0;
          if (++st.quiet >= 4) set(null, db); // ~80 мс тишины — нота кончилась
          return;
        }
        st.quiet = 0;
        const m = p ? N.midiFromFreq(p.freq) : null;
        if (m == null || m < 21 || m > 108) {
          if (++st.unclear >= 8) set(null, db);
          return;
        }
        st.unclear = 0;
        st.pitch = st.pitch != null && Math.abs(st.pitch - m) < 0.5 ? st.pitch * 0.6 + m * 0.4 : m;
        // Держим ноту, пока звук не ушёл заметно дальше соседней, — чтобы вибрато не дробило её.
        if (st.note != null && Math.abs(m - st.note) < 0.7) {
          if (db - prev > 8 && opts.retrigger) opts.retrigger(db); // по струне ударили ещё раз
          st.cand = null;
          st.count = 0;
          return;
        }
        const r = Math.round(m);
        if (r === st.cand) st.count++;
        else {
          st.cand = r;
          st.count = 1;
        }
        if (st.count >= 2) set(r, db);
      },
      /** Забыть всё; звучащую ноту — отпустить. */
      reset() {
        st.pitch = null;
        st.cand = null;
        st.count = 0;
        st.quiet = 0;
        st.unclear = 0;
        set(null, -120);
      },
    };
  }

  App.pitch = { detector, level, tracker, MIN_F, MAX_F };
})();
