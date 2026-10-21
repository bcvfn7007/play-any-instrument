/*
 * Мелодия из записи песни, где есть и голос, и музыка.
 * Идея — как в алгоритме Melodia (Salamon, Gómez): для каждого кусочка звука считаем, насколько вероятна
 * каждая высота (сумма гармоник), собираем из вершин «контуры» — плавные линии высоты, — отбрасываем
 * слабые, октавные двойники и случайные, а из оставшихся берём самую заметную линию: обычно это голос.
 * Линии намного слабее голоса (аккомпанемент во вступлении и проигрышах) мелодией не считаем.
 * На ноты линию режем и по смене высоты, и по провалам громкости: «ля-ля» — две ноты.
 * Считается в отдельном потоке (Web Worker), чтобы страница не замирала.
 */
(function () {
  const App = (window.App = window.App || {});

  /* Вся математика — в одной самодостаточной функции: её же исполняет и фоновый поток. */
  function CORE() {
    const SR = 22050;
    const WIN = 1024; // окно 46 мс
    const NFFT = 2048; // с дополнением нулями — точнее частоты
    const HOP = 256; // шаг 11,6 мс
    const BINS = 600; // высоты от 55 до 1760 Гц через 10 центов
    const F_REF = 55;
    const HARM = 20;
    const ALPHA = 0.8;

    function makeFFT(n) {
      const levels = Math.round(Math.log2(n));
      const cos = new Float64Array(n / 2);
      const sin = new Float64Array(n / 2);
      for (let i = 0; i < n / 2; i++) {
        cos[i] = Math.cos((2 * Math.PI * i) / n);
        sin[i] = Math.sin((2 * Math.PI * i) / n);
      }
      const rev = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        let r = 0;
        for (let b = 0; b < levels; b++) r = (r << 1) | ((i >>> b) & 1);
        rev[i] = r;
      }
      return function fft(re, im) {
        for (let i = 0; i < n; i++) {
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
        for (let size = 2; size <= n; size <<= 1) {
          const half = size >> 1;
          const step = n / size;
          for (let i = 0; i < n; i += size) {
            for (let j = i, k = 0; j < i + half; j++, k += step) {
              const l = j + half;
              const tre = re[l] * cos[k] + im[l] * sin[k];
              const tim = im[l] * cos[k] - re[l] * sin[k];
              re[l] = re[j] - tre;
              im[l] = im[j] - tim;
              re[j] += tre;
              im[j] += tim;
            }
          }
        }
      };
    }

    /**
     * left, right — Float32Array с частотой 22050 (right может быть null — моно).
     * progress(доля) — сообщать, сколько сделано. Возвращает высоту по кадрам (в центах от 55 Гц, 0 — тишина).
     */
    let DEBUG = null; // для проверки: сюда складываются промежуточные данные
    // Настройки (подобраны на тестах; для проверки их можно передать в debug.opts).
    let O = null;
    // Проверены на «песнях» из живых записей с известной мелодией: голос (высокий, низкий, с громкими
    // и тихими фразами), саксофон и скрипка поверх пианино, гитары, баса, струнных и барабанов, —
    // и на настоящей инструментальной записи.
    const DEFAULTS = {
      frame: 0.55, // вершины салиентности в кадре: не слабее этой доли от самой сильной
      loudness: 150, // ослабляем низы, как слух (Гц): бас и бочка не должны перекрикивать голос
      lowHz: 0, // ниже этой высоты мелодию не ищем
      voicing: 0.2, // насколько слабее средней может быть линия мелодии (в стандартных отклонениях)
      nearVoicing: 1.2, // …а если она рядом с мелодией по высоте (± 7 полутонов) — то настолько
      // Строже (0,7) — чище вступления у песен с голосом, но в инструментальной музыке, где мелодия
      // ненамного громче аккомпанемента, теряются её куски. Потерять мелодию хуже, чем лишняя нота.
      voiceAbs: 0.5, // линия слабее этой доли от силы голоса — не мелодия (а аккомпанемент во вступлении)
      topShare: 0.15, // сила голоса — по самым сильным линиям, занимающим эту долю всего времени
      voiceWin: 6, // …среди соседей ± столько секунд (0 — по всей песне)
      nearAbs: 1, // а «заполнители пропусков» — не слабее такой доли от этого порога
      dip: 0.65, // провал между нотами — сила мелодии ниже этой доли от соседних мест
      minNote: 0.12, // нота короче (с) — не нота
    };

    /** left, right — каналы песни (right может быть null). */
    function pitchTrack(left, right, progress, debug) {
      DEBUG = debug || null;
      O = Object.assign({}, DEFAULTS, debug && debug.opts);
      // Каналы просто складываем: голос посередине в сумме и так громче инструментов по краям.
      // Строже «вырезать середину» хуже — эхо зала у голоса в каналах разное, и высота начинает прыгать.
      let x = left;
      if (right) {
        x = new Float32Array(left.length);
        for (let i = 0; i < x.length; i++) x[i] = 0.5 * (left[i] + right[i]);
      }
      const fft = makeFFT(NFFT);
      const hann = new Float32Array(WIN);
      for (let i = 0; i < WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1));
      const frames = Math.max(0, Math.floor((x.length - WIN) / HOP));
      const re = new Float64Array(NFFT);
      const im = new Float64Array(NFFT);
      const mag = new Float64Array(NFFT / 2);
      const sal = new Float64Array(BINS);
      const kMin = Math.ceil((F_REF * NFFT) / SR);
      const kMax = Math.floor((5000 * NFFT) / SR);
      const lowBin = O.lowHz > F_REF ? Math.round(120 * Math.log2(O.lowHz / F_REF)) : 0;
      // Слух хуже слышит низы: ослабляем их так же (фильтр второго порядка на частоте O.loudness).
      const weight = new Float64Array(NFFT / 2);
      for (let k = 0; k < NFFT / 2; k++) {
        const f = (k * SR) / NFFT;
        weight[k] = O.loudness ? (f * f) / (f * f + O.loudness * O.loudness) : 1;
      }
      // Окно «±1 полутон» для гармоник: cos² от расстояния.
      const COS2 = new Float64Array(201);
      for (let i = 0; i <= 200; i++) COS2[i] = Math.cos(((i / 200) * Math.PI) / 2) ** 2;
      const peaksPerFrame = []; // для каждого кадра: [бин, салиентность, …]
      const pf = [];
      const pa = [];

      for (let f = 0; f < frames; f++) {
        const o = f * HOP;
        for (let i = 0; i < NFFT; i++) {
          re[i] = i < WIN ? x[o + i] * hann[i] : 0;
          im[i] = 0;
        }
        fft(re, im);
        for (let k = 1; k < NFFT / 2; k++) mag[k] = Math.hypot(re[k], im[k]) * weight[k];
        // Пики спектра.
        pf.length = 0;
        pa.length = 0;
        let top = 0;
        for (let k = Math.max(2, kMin); k < kMax; k++) {
          const b = mag[k];
          if (b > mag[k - 1] && b >= mag[k + 1] && b > 1e-9) {
            const la = Math.log(mag[k - 1] + 1e-12);
            const lb = Math.log(b);
            const lc = Math.log(mag[k + 1] + 1e-12);
            const den = la - 2 * lb + lc;
            const p = den ? (0.5 * (la - lc)) / den : 0;
            const amp = Math.exp(lb - 0.25 * (la - lc) * p);
            pf.push(((k + p) * SR) / NFFT);
            pa.push(amp);
            if (amp > top) top = amp;
          }
        }
        // Салиентность: каждая гармоника голосует за свою основную частоту.
        sal.fill(0);
        const floor = top * 0.01; // −40 дБ от самого громкого пика
        for (let i = 0; i < pf.length; i++) {
          if (pa[i] < floor) continue;
          let w = pa[i];
          for (let h = 1; h <= HARM; h++, w *= ALPHA) {
            const f0 = pf[i] / h;
            if (f0 < F_REF * 0.94) break;
            const b = 120 * Math.log2(f0 / F_REF);
            if (b > BINS + 10) continue;
            const lo = Math.max(0, Math.ceil(b - 10));
            const hi = Math.min(BINS - 1, Math.floor(b + 10));
            for (let j = lo; j <= hi; j++) sal[j] += w * COS2[Math.round(Math.abs(j - b) * 20)];
          }
        }
        // Вершины салиентности в кадре: оставляем близкие к самой сильной.
        let max = 0;
        for (let j = 0; j < BINS; j++) if (sal[j] > max) max = sal[j];
        const list = [];
        if (max > 0) {
          for (let j = Math.max(1, lowBin); j < BINS - 1; j++) {
            if (sal[j] > sal[j - 1] && sal[j] >= sal[j + 1] && sal[j] >= max * O.frame) list.push(j, sal[j]);
          }
        }
        peaksPerFrame.push(list);
        if (progress && f % 300 === 0) progress((f / frames) * 0.7);
      }
      return contours(peaksPerFrame, progress);
    }

    /* ---------- Контуры и выбор мелодии ---------- */

    function contours(peaks, progress) {
      const T = peaks.length;
      // Порог по всей песне: слабые вершины могут только продолжать линию, но не начинать её.
      let n = 0;
      let sum = 0;
      let sum2 = 0;
      peaks.forEach((l) => {
        for (let i = 1; i < l.length; i += 2) {
          n++;
          sum += l[i];
          sum2 += l[i] * l[i];
        }
      });
      if (!n) return { pitch: new Float32Array(T), sal: new Float32Array(T) };
      const mean = sum / n;
      const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
      const strongMin = mean - 0.9 * std;
      // Вершины кадра: [бин, салиентность, сильная?, занята?]
      const P = peaks.map((l) => {
        const out = [];
        for (let i = 0; i < l.length; i += 2) out.push({ b: l[i], s: l[i + 1], strong: l[i + 1] >= strongMin, used: false });
        return out;
      });
      const order = [];
      P.forEach((l, t) => l.forEach((p) => p.strong && order.push([t, p])));
      order.sort((a, b) => b[1].s - a[1].s);
      const STEP = 11; // ≈110 центов за кадр: дальше — уже другая линия
      const GAP = Math.round(0.1 / (HOP / SR)); // не дольше 100 мс на слабых вершинах подряд
      const MIN_LEN = Math.round(0.1 / (HOP / SR));
      const found = [];
      const follow = (t, b, dir, line) => {
        let cur = b;
        let weak = 0;
        const tail = [];
        for (let tt = t + dir; tt >= 0 && tt < T; tt += dir) {
          let best = null;
          P[tt].forEach((p) => {
            if (p.used || Math.abs(p.b - cur) > STEP) return;
            if (!best || Math.abs(p.b - cur) < Math.abs(best.b - cur)) best = p;
          });
          if (!best) break;
          if (best.strong) {
            weak = 0;
            tail.forEach((x) => line.push(x));
            tail.length = 0;
            line.push([tt, best]);
          } else {
            if (++weak > GAP) break;
            tail.push([tt, best]);
          }
          best.used = true;
          cur = best.b;
        }
        tail.forEach(([, p]) => (p.used = false)); // хвост из одних слабых вершин не берём
      };
      order.forEach(([t, p]) => {
        if (p.used) return;
        p.used = true;
        const line = [[t, p]];
        follow(t, p.b, 1, line);
        follow(t, p.b, -1, line);
        if (line.length < MIN_LEN) return;
        line.sort((a, b) => a[0] - b[0]);
        const start = line[0][0];
        const bins = new Float32Array(line[line.length - 1][0] - start + 1);
        const sals = new Float32Array(bins.length);
        line.forEach(([tt, q]) => {
          bins[tt - start] = q.b;
          sals[tt - start] = q.s;
        });
        // Пропуски внутри линии заполняем соседним значением.
        for (let i = 1; i < bins.length; i++) {
          if (!bins[i]) {
            bins[i] = bins[i - 1];
            sals[i] = sals[i - 1] * 0.5;
          }
        }
        let tot = 0;
        let pm = 0;
        for (let i = 0; i < bins.length; i++) {
          tot += sals[i];
          pm += bins[i];
        }
        pm /= bins.length;
        let pd = 0;
        for (let i = 0; i < bins.length; i++) pd += (bins[i] - pm) ** 2;
        found.push({ start, end: start + bins.length, bins, sals, total: tot, mean: tot / bins.length, pitch: pm, dev: Math.sqrt(pd / bins.length) * 10 });
      });
      if (progress) progress(0.8);
      if (!found.length) return { pitch: new Float32Array(T), sal: new Float32Array(T) };

      // Голос или просто музыка: слабые контуры убираем (кроме «живых», с вибрато).
      const ms = found.map((c) => c.mean);
      const mMean = ms.reduce((a, b) => a + b, 0) / ms.length;
      const mStd = Math.sqrt(ms.reduce((a, b) => a + (b - mMean) ** 2, 0) / ms.length);
      // Сила голоса — по самым сильным линиям (с учётом длины). Аккомпанемент во вступлении и проигрышах
      // заметно слабее одного голоса: его ноты разбросаны по многим звукам, а голос — один и громкий.
      // Сравниваем с соседями по времени (± voiceWin с), а не со всей песней: куплет бывает тише припева.
      const topOf = (list) => {
        const sorted = list.slice().sort((a, b) => b.mean - a.mean);
        const total = list.reduce((s, c) => s + c.bins.length, 0);
        let got = 0;
        for (const c of sorted) {
          got += c.bins.length;
          if (got >= total * O.topShare) return c.mean;
        }
        return 0;
      };
      const floorOf = new Map();
      if (O.voiceWin) {
        const win = O.voiceWin / (HOP / SR);
        const mid = (c) => (c.start + c.end) / 2;
        found.forEach((c) => floorOf.set(c, O.voiceAbs * topOf(found.filter((x) => Math.abs(mid(x) - mid(c)) <= win))));
      } else {
        const top = topOf(found);
        found.forEach((c) => floorOf.set(c, O.voiceAbs * top));
      }
      let live = found.filter((c) => c.mean >= floorOf.get(c) && (c.mean >= mMean - O.voicing * mStd || (c.dev > 40 && c.mean >= mMean - mStd)));
      if (DEBUG) {
        DEBUG.peaks = peaks;
        DEBUG.found = found;
        DEBUG.voiced = live.slice();
      }

      // Средняя высота мелодии во времени (сглаженная за 5 секунд).
      const melodyMean = (list) => {
        const w = new Float64Array(T);
        const v = new Float64Array(T);
        list.forEach((c) => {
          for (let i = 0; i < c.bins.length; i++) {
            w[c.start + i] += c.sals[i];
            v[c.start + i] += c.sals[i] * c.bins[i];
          }
        });
        const raw = new Float64Array(T);
        let last = 0;
        for (let t = 0; t < T; t++) {
          if (w[t] > 0) last = v[t] / w[t];
          raw[t] = last;
        }
        let first = raw.find((x) => x > 0) || 0;
        for (let t = 0; t < T && !raw[t]; t++) raw[t] = first;
        const half = Math.round(2.5 / (HOP / SR));
        const out = new Float64Array(T);
        let acc = 0;
        let cnt = 0;
        for (let t = 0; t < T + half; t++) {
          if (t < T) {
            acc += raw[t];
            cnt++;
          }
          if (t - 2 * half - 1 >= 0) {
            acc -= raw[t - 2 * half - 1];
            cnt--;
          }
          const c = t - half;
          if (c >= 0 && c < T) out[c] = acc / cnt;
        }
        return out;
      };
      const distTo = (c, mm) => {
        let d = 0;
        for (let i = 0; i < c.bins.length; i++) d += c.bins[i] - mm[c.start + i];
        return (d / c.bins.length) * 10; // в центах
      };

      // Слабые линии возвращаем, если они рядом с мелодией по высоте и заполняют её пропуски:
      // тихо спетые низкие ноты — тоже мелодия.
      {
        const mm = melodyMean(live);
        const busy = new Uint8Array(T);
        live.forEach((c) => busy.fill(1, c.start, c.end));
        const keep = new Set(live);
        found.forEach((c) => {
          if (keep.has(c) || c.mean < mMean - O.nearVoicing * mStd || c.mean < floorOf.get(c) * O.nearAbs) return;
          if (Math.abs(distTo(c, mm)) > 700) return;
          let taken = 0;
          for (let t = c.start; t < c.end; t++) taken += busy[t];
          if (taken / (c.end - c.start) < 0.3) live.push(c);
        });
      }

      for (let it = 0; it < 3; it++) {
        let mm = melodyMean(live);
        // Октавные двойники: из двух одновременных линий на октаву друг от друга оставляем ту, что ближе к мелодии.
        const drop = new Set();
        for (let i = 0; i < live.length; i++) {
          for (let j = i + 1; j < live.length; j++) {
            const a = live[i];
            const b = live[j];
            const s = Math.max(a.start, b.start);
            const e = Math.min(a.end, b.end);
            if (e - s < 3) continue;
            let d = 0;
            for (let t = s; t < e; t++) d += a.bins[t - a.start] - b.bins[t - b.start];
            d = Math.abs((d / (e - s)) * 10);
            if (Math.abs(d - 1200) < 60) drop.add(Math.abs(distTo(a, mm)) > Math.abs(distTo(b, mm)) ? a : b);
          }
        }
        live = live.filter((c) => !drop.has(c));
        mm = melodyMean(live);
        // Линии дальше октавы от мелодии — это другие инструменты.
        live = live.filter((c) => Math.abs(distTo(c, mm)) < 1200);
      }
      if (progress) progress(0.9);

      if (DEBUG) DEBUG.live = live.slice();
      // В каждом кадре — самая заметная из оставшихся линий.
      const out = new Float32Array(T);
      const outSal = new Float32Array(T); // сила мелодии в кадре — по ней слышно новый слог на той же ноте
      const best = new Float64Array(T);
      live.forEach((c) => {
        for (let i = 0; i < c.bins.length; i++) {
          const t = c.start + i;
          if (c.total > best[t]) {
            best[t] = c.total;
            out[t] = c.bins[i] * 10;
            outSal[t] = c.sals[i];
          }
        }
      });
      return { pitch: out, sal: outSal };
    }

    /* ---------- Линия высоты → ноты ---------- */

    function toNotes(tr) {
      const track = tr.pitch;
      // Певец может петь чуть выше или ниже стандартного строя: находим общий сдвиг.
      let cs = 0;
      let sn = 0;
      for (let t = 0; t < track.length; t++) {
        if (!track[t]) continue;
        const a = ((track[t] % 100) / 100) * 2 * Math.PI;
        cs += Math.cos(a);
        sn += Math.sin(a);
      }
      const tune = ((Math.atan2(sn, cs) / (2 * Math.PI)) * 100 + 100) % 100;
      const off = tune > 50 ? tune - 100 : tune; // центов
      const midiAt = (t) => (track[t] ? 33 + (track[t] - off) / 100 : null); // 55 Гц — это ля₁ (33)
      // Сглаживаем медианой из 5 кадров.
      const m = new Array(track.length).fill(null);
      for (let t = 0; t < track.length; t++) {
        if (!track[t]) continue;
        const w = [];
        for (let k = -2; k <= 2; k++) {
          const v = midiAt(t + k);
          if (v != null) w.push(v);
        }
        w.sort((a, b) => a - b);
        m[t] = w[w.length >> 1];
      }
      return cleanup(segment(m, tr));
    }

    /** Короткие «выбросы»: нота на долю секунды, далеко по высоте от обеих соседних, — это ошибка, а не мелодия. */
    function cleanup(notes) {
      return notes.filter((n, i) => {
        const a = notes[i - 1];
        const b = notes[i + 1];
        if (!a || !b || n[1] >= 0.2) return true;
        const near = n[0] - (a[0] + a[1]) < 0.15 && b[0] - (n[0] + n[1]) < 0.15;
        return !(near && Math.abs(n[2] - a[2]) >= 7 && Math.abs(n[2] - b[2]) >= 7);
      });
    }

    /**
     * Нарезка линии высоты на ноты. Ноту начинает не только новая высота, но и провал громкости
     * мелодии: «ля-ля» — две ноты. А голос, который подъезжает к ноте снизу, начинает её в провале
     * перед подъездом, а не тогда, когда уже доехал.
     * m — высота по кадрам (полутона с дробью, null — тишина), tr.sal — сила мелодии по кадрам.
     */
    function segment(m, tr) {
      const T = m.length;
      const dt = HOP / SR;
      // Сила мелодии, сглаженная по 5 кадрам; тишина считается нулём — это самый глубокий провал.
      const sm = new Float32Array(T);
      for (let t = 0; t < T; t++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) if (t + k >= 0 && t + k < T && m[t + k] != null) s += tr.sal[t + k];
        sm[t] = s / 5;
      }
      const median = (list) => {
        if (!list.length) return 0;
        const a = list.slice().sort((x, y) => x - y);
        return a[a.length >> 1];
      };
      // Провал: сила заметно ниже, чем и до, и после (сравниваем с медианой 35–115 мс по сторонам).
      const valley = (t) => {
        if (sm[t] > sm[t - 1] || sm[t] > sm[t + 1]) return false;
        const L = [];
        const R = [];
        for (let k = 3; k <= 10; k++) {
          if (t - k >= 0) L.push(sm[t - k]);
          if (t + k < T) R.push(sm[t + k]);
        }
        return sm[t] < O.dip * Math.min(median(L), median(R));
      };

      const notes = [];
      let t = 0;
      while (t < T) {
        // Кусок, где мелодия звучит (паузы до 2 кадров не разрывают его).
        while (t < T && m[t] == null) t++;
        if (t >= T) break;
        const a = t;
        let last = t;
        let gap = 0;
        for (; t < T; t++) {
          if (m[t] != null) {
            last = t;
            gap = 0;
          } else if (++gap > 2) break;
        }
        const b = last + 1;

        const valleys = [];
        for (let k = a + 3; k < b - 3; k++) {
          if (!valley(k)) continue;
          const prev = valleys[valleys.length - 1];
          if (prev != null && k - prev < 8) {
            if (sm[k] < sm[prev]) valleys[valleys.length - 1] = k;
          } else valleys.push(k);
        }

        // Смена высоты: новая держится хотя бы 4 кадра (≈45 мс).
        const bounds = [{ at: a, kind: 'start' }];
        const used = new Set();
        let center = null;
        let cand = null;
        let candN = 0;
        for (let k = a; k < b; k++) {
          const v = m[k];
          if (v == null) continue;
          if (center == null) {
            center = Math.round(v);
            continue;
          }
          if (Math.abs(v - center) < 0.65) {
            cand = null;
            candN = 0;
            continue;
          }
          const r = Math.round(v);
          if (r === cand) candN++;
          else {
            cand = r;
            candN = 1;
          }
          if (candN < 4) continue;
          // Если чуть раньше был провал — нота началась в нём (голос подъезжал к ней).
          let at = k - 3;
          for (let i = valleys.length - 1; i >= 0; i--) {
            if (valleys[i] <= at + 2 && valleys[i] >= at - 12 && !used.has(valleys[i])) {
              at = valleys[i];
              used.add(valleys[i]);
              break;
            }
          }
          if (at > bounds[bounds.length - 1].at) bounds.push({ at, kind: 'pitch' });
          center = r;
          cand = null;
          candN = 0;
        }
        // Остальные провалы — та же нота спета ещё раз.
        valleys.forEach((v) => !used.has(v) && bounds.push({ at: v, kind: 'dip' }));
        bounds.sort((x, y) => x.at - y.at);

        let prev = null;
        bounds.forEach((bd, i) => {
          const from = bd.at;
          const to = i + 1 < bounds.length ? bounds[i + 1].at : b;
          if (to - from < 2) return;
          // Высота ноты — по середине: начало (подъезд к ноте) и самый конец не считаем.
          const len = to - from;
          const vals = [];
          for (let k = from + Math.max(2, Math.floor(len * 0.25)); k < to - Math.floor(len * 0.1); k++) if (m[k] != null) vals.push(m[k]);
          if (!vals.length) for (let k = from; k < to; k++) if (m[k] != null) vals.push(m[k]);
          if (!vals.length) return;
          const pitch = Math.round(median(vals));
          const note = { from, to, pitch, kind: bd.kind };
          // Высота «качнулась» и вернулась — это всё та же нота.
          if (prev && prev.pitch === pitch && prev.to === from && note.kind === 'pitch') {
            prev.to = to;
            return;
          }
          notes.push(note);
          prev = note;
        });
      }

      // Слишком короткие кусочки: приклеиваем к соседу той же высоты, остальные выбрасываем.
      const out = [];
      notes.forEach((n, i) => {
        if ((n.to - n.from) * dt >= O.minNote) {
          out.push(n);
          return;
        }
        const p = out[out.length - 1];
        const q = notes[i + 1];
        if (p && p.pitch === n.pitch && p.to === n.from) p.to = n.to;
        else if (q && q.pitch === n.pitch && q.from === n.to) q.from = n.from;
      });
      const r3 = (x) => Math.round(x * 1000) / 1000;
      return out.map((n) => [r3((n.from + 1) * dt), r3((n.to - n.from) * dt), n.pitch, 0.8]);
    }

    return { pitchTrack, toNotes, SR };
  }

  /* ---------- Запуск в фоновом потоке (а если нельзя — прямо здесь) ---------- */

  function run(left, right, onProgress) {
    return new Promise((resolve, reject) => {
      let worker = null;
      try {
        const src = 'const core = (' + CORE.toString() + ')();\n'
          + 'self.onmessage = (e) => { try { const tr = core.pitchTrack(e.data.left, e.data.right, (p) => self.postMessage({ p })); '
          + 'self.postMessage({ notes: core.toNotes(tr) }); } catch (err) { self.postMessage({ error: String(err && err.message || err) }); } };';
        worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      } catch (e) {
        worker = null;
      }
      if (!worker) {
        try {
          const core = CORE();
          resolve(core.toNotes(core.pitchTrack(left, right, onProgress)));
        } catch (e) {
          reject(e);
        }
        return;
      }
      worker.onmessage = (e) => {
        if (e.data.p != null) onProgress(e.data.p);
        else {
          worker.terminate();
          if (e.data.error) reject(new Error(e.data.error));
          else resolve(e.data.notes);
        }
      };
      worker.onerror = (e) => {
        worker.terminate();
        // Поток не запустился (бывает, если страница открыта прямо из файла) — считаем здесь.
        try {
          const core = CORE();
          resolve(core.toNotes(core.pitchTrack(left, right, onProgress)));
        } catch (err) {
          reject(err);
        }
        e.preventDefault();
      };
      worker.postMessage({ left, right });
    });
  }

  App.melody = {
    run,
    SR: 22050,
    /** Для проверки: линия высоты по кадрам (в центах от 55 Гц) без превращения в ноты. */
    track: (left, right, debug) => CORE().pitchTrack(left, right, null, debug),
    /** Для проверки: ноты с другими настройками (opts — как DEFAULTS внутри). */
    notesWith(left, right, opts) {
      const core = CORE();
      return core.toNotes(core.pitchTrack(left, right, null, { opts }));
    },
    /** Для проверки: сама математика — её можно запустить сразу в нескольких фоновых потоках. */
    core: CORE,
  };
})();
