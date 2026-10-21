/* Высота звука: алгоритм YIN и превращение «высота + громкость» в ноты. Общий для микрофона и аудиофайлов. */
(function () {
  const App = (window.App = window.App || {});
  const N = App.notes;

  const MIN_F = 40; // ниже «ми» контроктавы бас-гитары
  const MAX_F = 2100; // до₇

  /** Быстрое преобразование Фурье на месте: transform(re, im), длина — степень двойки. */
  function fft(size) {
    const bits = Math.round(Math.log2(size));
    const rev = new Uint32Array(size);
    for (let i = 1; i < size; i++) rev[i] = (rev[i >> 1] >> 1) | ((i & 1) << (bits - 1));
    const cos = new Float64Array(size >> 1);
    const sin = new Float64Array(size >> 1);
    for (let i = 0; i < size >> 1; i++) {
      cos[i] = Math.cos((2 * Math.PI * i) / size);
      sin[i] = -Math.sin((2 * Math.PI * i) / size);
    }
    return function transform(re, im) {
      for (let i = 0; i < size; i++) {
        const j = rev[i];
        if (j > i) {
          let t = re[i];
          re[i] = re[j];
          re[j] = t;
          t = im[i];
          im[i] = im[j];
          im[j] = t;
        }
      }
      for (let len = 2, step = size >> 1; len <= size; len <<= 1, step >>= 1) {
        const span = len >> 1;
        for (let i = 0; i < size; i += len) {
          for (let k = 0, t = 0; k < span; k++, t += step) {
            const a = i + k;
            const b = a + span;
            const xr = re[b] * cos[t] - im[b] * sin[t];
            const xi = re[b] * sin[t] + im[b] * cos[t];
            re[b] = re[a] - xr;
            im[b] = im[a] - xi;
            re[a] += xr;
            im[a] += xi;
          }
        }
      }
    };
  }

  /**
   * Детектор для окон длины size: detect(x, sr) → { freq, clarity } или null, если высоты нет.
   * При частоте выше 32 кГц считает по половине отсчётов — для мелодии этого с запасом.
   * Разностную функцию YIN считает через корреляцию на БПФ: ответ тот же, что у прямого двойного цикла,
   * а окно 4096 считается в 9–10 раз быстрее (на ПК меньше 1 мс) — на телефоне микрофон не тормозит звук и экран.
   */
  function detector(size) {
    const half = new Float32Array(size);
    const cmnd = new Float64Array(size + 2);
    let len = 0;
    let transform = null;
    let re = null;
    let im = null;
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
      // d(τ) = Σ (x[j] − x[j+τ])² по j < w = энергия окна + энергия сдвинутого окна − 2·c(τ),
      // где c(τ) = Σ x[j]·x[j+τ] — корреляция окна со всем куском. Её и считаем через БПФ:
      // окно кладём в re, весь кусок — в im, и оба спектра получаем одним преобразованием.
      let m = 2;
      while (m < n) m <<= 1;
      if (m !== len) {
        len = m;
        transform = fft(m);
        re = new Float64Array(m);
        im = new Float64Array(m);
      }
      for (let i = 0; i < m; i++) {
        re[i] = i < w ? data[i] : 0;
        im[i] = i < n ? data[i] : 0;
      }
      transform(re, im);
      // Спектр корреляции conj(A)·B из Z = A + iB, сразу сопряжённый: тогда обратное БПФ — то же прямое.
      const mid = m >> 1;
      re[0] *= im[0];
      im[0] = 0;
      re[mid] *= im[mid];
      im[mid] = 0;
      for (let k = 1; k < mid; k++) {
        const ar = re[k];
        const ai = im[k];
        const br = re[m - k];
        const bi = im[m - k];
        const p = 0.5 * (ar * bi + ai * br);
        const q = 0.25 * (ar * ar + ai * ai - br * br - bi * bi);
        re[k] = p;
        im[k] = q;
        re[m - k] = p;
        im[m - k] = -q;
      }
      transform(re, im); // теперь re[τ] = m·c(τ)
      let e = 0;
      for (let j = 0; j < w; j++) e += data[j] * data[j];
      const e0 = e;
      let run = 0;
      cmnd[0] = 1;
      for (let tau = 1; tau <= tauMax; tau++) {
        const out = data[tau - 1];
        const inn = data[tau + w - 1];
        e += inn * inn - out * out; // энергия окна, сдвинутого на τ
        const d = Math.max(0, e0 + e - (2 * re[tau]) / m);
        run += d;
        cmnd[tau] = run ? (d * tau) / run : 1;
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
