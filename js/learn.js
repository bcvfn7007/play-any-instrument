/*
 * Разучивание мелодий: нужная нота (или аккорд) мигает на инструменте, мелодия ждёт, пока вы её нажмёте.
 * Остальные партии песни играют вокруг как аккомпанемент. Есть темп, повтор трудного куска и «Послушать».
 */
(function () {
  const App = (window.App = window.App || {});
  const h = App.h;
  const N = App.notes;

  let shell = null;
  let settings = null;

  const learn = {
    song: null,
    plan: null, // мелодия, разложенная под текущий инструмент
    step: 0, // какой шаг сейчас нужно сыграть
    hits: new Set(), // какие ноты аккорда текущего шага уже нажаты
    good: 0,
    misses: 0,
    done: false,
    lost: false, // мелодия перестала помещаться (сменили октаву или ширину)
    busy: false, // раскладка двигается по нашей просьбе — не пересчитывать
    demo: null,
    loop: null, // { a, b } — повторять шаги с a по b
    doneEl: null,
    tip: null,
    tipTimer: null,
  };
  let ui = null;

  App.learn = {
    init(s) {
      shell = s;
      settings = s.settings;
    },
    mount,
    can: () => canLearn(),
    open: openSongs,
    start: startSong,
    stop: stopSong,
    attach,
    viewChanged,
    heard,
    /** Перед перестройкой раскладки: останавливаем «Послушать» и прячем итог. */
    pause() {
      stopDemo();
      stopAcc();
      hideDone();
    },
    current: () => learn.song,
  };

  const TAP = {
    keys: 'Нажмите мигающую клавишу',
    bars: 'Ударьте по мигающей пластине',
    kalimba: 'Нажмите мигающий язычок',
    harp: 'Заденьте мигающую струну',
    circle: 'Ударьте по мигающему полю',
    strings: 'Прижмите мигающий лад',
    bowed: 'Нажмите мигающее место на грифе',
  };

  const cur = () => shell.current();
  const canLearn = () => !!(cur() && cur().layout && cur().layout.highlightNext);
  const noteName = (m) => N.name(m, settings.labels === 'latin' ? 'latin' : 'ru');
  const stepNow = () => learn.plan.steps[learn.step];
  const allNotes = (song) => song.steps.flatMap((s) => s.notes);

  /* =================== Песня → шаги =================== */

  const builtCache = new Map();

  /** Встроенная песня ([нота, доли] и темп) → общий вид: шаги со временем в секундах. */
  function fromBuiltin(s) {
    if (builtCache.has(s)) return builtCache.get(s);
    const beat = 60 / s.bpm;
    let t = 0;
    const steps = s.notes.map(([m, beats]) => {
      const st = { t, d: beats * beat * 0.9, notes: [m] };
      t += beats * beat;
      return st;
    });
    const song = { id: s.id, title: s.title, about: s.about, bpm: s.bpm, steps, accomp: [], parts: [], builtin: true };
    builtCache.set(s, song);
    return song;
  }

  const less = (a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  };

  /**
   * Мелодия целиком помещается на инструмент: ищем сдвиг (в полутонах).
   * Из подходящих берём самый простой: меньше чёрных клавиш, та же тональность, раскладку не двигать, ближе к исходной высоте.
   * move — можно попросить раскладку показать другую октаву; sameKey — только сдвиги на целые октавы от around.
   */
  function planExact(song, opts) {
    const L = cur().layout;
    const melody = allNotes(song);
    const lo = Math.min(...melody);
    const around = (opts && opts.around) || 0;
    const move = !!(opts && opts.move && L.playableFrom && L.moveTo);
    const now = new Set(L.playable());
    const fits = (have, t) => melody.every((m) => have.has(m + t));
    // Свою мелодию не переносим в другую тональность: аккомпанемент звучит как в оригинале.
    const own = !song.builtin;
    let best = null;
    for (let t = around - 48; t <= around + 48; t++) {
      if ((own || (opts && opts.sameKey)) && (t - around) % 12) continue;
      const here = fits(now, t);
      if (!here && !(move && fits(new Set(L.playableFrom(lo + t)), t))) continue;
      const black = new Set(melody.filter((m) => N.isBlack(m + t)).map((m) => N.pc(m + t))).size;
      const score = own ? [Math.abs(t), here ? 0 : 1] : [black, (t - around) % 12 ? 1 : 0, here ? 0 : 1, Math.abs(t - around)];
      if (!best || less(score, best.score)) best = { score, shift: t, from: here ? null : lo + t };
    }
    return best && { shift: best.shift, from: best.from };
  }

  /** Все ноты, которые раскладка вообще может показать (с прокруткой по октавам). */
  function reachable(L) {
    if (!L.playableFrom || !L.moveTo) return new Set(L.playable());
    const all = new Set();
    for (let lo = 0; lo <= 108; lo += 12) L.playableFrom(lo).forEach((m) => all.add(m));
    return all;
  }

  /**
   * План под инструмент. Если мелодия помещается целиком — как раньше (mode: 'fit').
   * Если нет (большая пьеса) — раскладка будет сама ехать за мелодией (mode: 'follow'),
   * а ноты, которых на инструменте нет, переносятся на октаву или играют сами вместе с аккомпанементом.
   */
  function planSong(song, opts) {
    const exact = planExact(song, opts);
    if (exact) return Object.assign({ mode: 'fit', shift: exact.shift, from: exact.from }, mapSteps(song, (m) => m + exact.shift));
    if (song.builtin) return null; // простые песни играем только целиком, как написаны
    const all = reachable(cur().layout);
    if (!all.size) return null;
    const byPc = {};
    [...all].sort((a, b) => a - b).forEach((m) => (byPc[N.pc(m)] = byPc[N.pc(m)] || []).push(m));
    const fold = (m) => {
      const list = byPc[N.pc(m)];
      if (!list) return null;
      let best = list[0];
      list.forEach((x) => Math.abs(x - m) < Math.abs(best - m) && (best = x));
      return best;
    };
    const notes = allNotes(song);
    const keepKey = song.accomp && song.accomp.length; // с аккомпанементом — только своя тональность
    let best = null;
    for (let t = keepKey ? 0 : -6; t <= (keepKey ? 0 : 6); t++) {
      let lost = 0;
      let moved = 0;
      notes.forEach((m) => {
        const f = fold(m + t);
        if (f == null) lost++;
        else if (f !== m + t) moved++;
      });
      const score = [lost, moved, Math.abs(t)];
      if (!best || less(score, best.score)) best = { score, t };
    }
    if (best.score[0] >= notes.length) return null;
    const t = best.t;
    return Object.assign({ mode: 'follow', shift: t, from: null }, mapSteps(song, (m) => fold(m + t)));
  }

  /** Ноты шагов → под инструмент. Чего сыграть нельзя — звучит само, как аккомпанемент. */
  function mapSteps(song, f) {
    const steps = [];
    const extra = [];
    song.steps.forEach((st) => {
      const notes = [];
      st.notes.forEach((m) => {
        const x = f(m);
        if (x == null) extra.push({ t: st.t, d: st.d, m, v: 0.7, part: -1 });
        else if (!notes.includes(x)) notes.push(x);
      });
      if (notes.length) steps.push({ t: st.t, d: st.d, notes: notes.sort((a, b) => a - b) });
    });
    return { steps, extra };
  }

  function whyNot(song) {
    const L = cur().layout;
    const have = new Set(L.playable().map(N.pc));
    const missing = [...new Set(allNotes(song).map(N.pc))].filter((p) => !have.has(p));
    if (missing.length) return 'Здесь нет ноты ' + missing.map((p) => noteName(60 + p)).join(', ');
    return L.playableFrom ? 'Не помещается на экране — поверните телефон боком' : 'На этом инструменте не хватает нот';
  }

  /* =================== Список песен =================== */

  function songItem(song, plan, opts) {
    const ok = !!plan;
    const notes = allNotes(song);
    const b = h('button.song-item' + (learn.song && learn.song.id === song.id ? '.current' : ''), { type: 'button', disabled: !ok },
      h('span.song-dots', { 'aria-hidden': 'true' }, notes.slice(0, 5).map((m) => h('i', { style: { '--c': N.color(m) } }))),
      h('span.song-text', null,
        h('b', null, song.title),
        h('small', null, ok ? song.about + ' · ' + shell.plural(song.steps.length, 'нота', 'ноты', 'нот') : whyNot(song))));
    b.addEventListener('click', () => {
      shell.closeDialogs();
      startSong(song);
    });
    if (!opts) return b;
    return h('div.song-row', null, b,
      shell.iconButton('settings', 'Изменить: название, партия', () => opts.edit()),
      shell.iconButton('trash', 'Удалить мелодию', () => opts.remove()));
  }

  function openSongs() {
    if (!canLearn()) return;
    const mine = h('div.songs.mine', null, h('p.note', null, 'Загружаем…'));
    const list = h('div.songs');
    let playable = 0;
    App.songs.forEach((s) => {
      const song = fromBuiltin(s);
      const plan = planSong(song, { move: true });
      if (plan) playable++;
      list.append(songItem(song, plan));
    });
    const add = h('button.btn.primary', { type: 'button', onClick: () => App.mySongs.add() }, App.icon('download'), 'Добавить свою мелодию');
    shell.sheet('Разучить мелодию', h('div.learn-sheet', null,
      h('p.note', null, 'Выберите песню. Нужная нота будет мигать на инструменте — нажмите её, и мелодия пойдёт дальше. Ошиблись — не страшно: мелодия подождёт.'),
      h('section.songs-sec', null,
        h('div.songs-head', null, h('h3', null, 'Мои мелодии'), add),
        h('p.note', null, 'Любая песня из интернета: MIDI-файл, ноты MusicXML из MuseScore, запись голоса или ноты текстом.'),
        mine),
      h('section.songs-sec', null,
        h('h3', null, 'Простые песни'),
        playable ? null : h('p.note', null, 'У этого инструмента особый набор нот, и эти песни на нём не сыграть. Попробуйте пианино, ксилофон или калимбу.'),
        list)), { wide: true });
    App.mySongs.list().then((items) => {
      mine.textContent = '';
      if (!items.length) {
        mine.append(h('p.empty', null, 'Пока пусто. Нажмите «Добавить свою мелодию».'));
        return;
      }
      items.forEach(({ rec, song }) => {
        mine.append(songItem(song, planSong(song, { move: true }), {
          edit: () => App.mySongs.edit(rec),
          remove: () => {
            if (!confirm('Удалить «' + rec.title + '» из моих мелодий?')) return;
            App.mySongs.remove(rec.id).then(() => {
              if (learn.song && learn.song.id === rec.id) stopSong();
              shell.closeDialogs();
              openSongs();
            });
          },
        }));
      });
    });
  }

  /* =================== Старт, стоп, смена раскладки =================== */

  function startSong(song, at) {
    if (!canLearn()) return;
    stopDemo();
    stopAcc();
    hideDone();
    const plan = planSong(song, { move: true });
    if (!plan) {
      shell.toast(whyNot(song));
      return;
    }
    moveLayout(plan.from);
    Object.assign(learn, { song, plan, step: Math.min(at || 0, plan.steps.length - 1), hits: new Set(), good: 0, misses: 0, done: false, lost: false, loop: null });
    prepareEvents();
    preloadParts();
    setTip(null);
    renderLearn();
    highlight();
    // Вступление до первой ноты мелодии играет само.
    if (learn.step === 0) queueAcc(-Infinity, learn.plan.steps[0].t);
  }

  function stopSong() {
    stopDemo();
    stopAcc();
    hideDone();
    setTip(null);
    learn.song = null;
    learn.plan = null;
    learn.loop = null;
    if (canLearn()) cur().layout.highlightNext(null);
    renderLearn();
  }

  function moveLayout(from) {
    if (from == null) return;
    learn.busy = true;
    cur().layout.moveTo(from);
    learn.busy = false;
  }

  /** После смены вида инструмента: мелодия переезжает на новую раскладку (с того же места). */
  function attach() {
    if (!learn.song) return;
    if (!canLearn()) {
      stopSong();
      return;
    }
    const t = learn.plan.steps[Math.min(learn.step, learn.plan.steps.length - 1)].t;
    const plan = planSong(learn.song, { move: true, around: learn.plan.shift });
    if (!plan) {
      shell.toast('«' + learn.song.title + '» не помещается на этот вид инструмента');
      stopSong();
      return;
    }
    moveLayout(plan.from);
    learn.plan = plan;
    learn.step = Math.max(0, plan.steps.findIndex((s) => s.t >= t - 0.001));
    learn.hits = new Set();
    learn.lost = false;
    learn.loop = null;
    prepareEvents();
    renderLearn();
    highlight();
  }

  function viewChanged() {
    if (!learn.song || learn.busy || !canLearn() || learn.plan.mode !== 'fit') return;
    // Посреди песни тональность не меняем — только октаву, иначе знакомые ноты вдруг станут другими.
    const p = planExact(learn.song, { around: learn.plan.shift, sameKey: true });
    if (!p || p.shift !== learn.plan.shift) stopDemo();
    learn.lost = !p;
    if (p && p.shift !== learn.plan.shift) {
      Object.assign(learn.plan, { shift: p.shift }, mapSteps(learn.song, (m) => m + p.shift));
      prepareEvents();
    }
    renderLearn();
    highlight();
  }

  /** Показать ноты на инструменте; если их не видно — подвинуть раскладку (большие пьесы). */
  function show(notes) {
    const L = cur().layout;
    if (notes && notes.length && L.moveTo && L.playableFrom) {
      const vis = new Set(L.playable());
      if (!notes.every((m) => vis.has(m))) {
        const lo = Math.min(...notes);
        let at = 12 * Math.floor(lo / 12);
        for (let o = at; o >= lo - 36; o -= 12) {
          const s = new Set(L.playableFrom(o));
          if (notes.every((m) => s.has(m))) {
            at = o;
            break;
          }
        }
        moveLayout(at);
      }
    }
    L.highlightNext(notes && notes.length ? notes : null);
  }

  function highlight() {
    if (!canLearn() || learn.demo) return;
    const on = learn.song && !learn.done && !learn.lost;
    show(on ? stepNow().notes.filter((m) => !learn.hits.has(m)) : null);
  }

  /* =================== Игра человека =================== */

  function heard(midi, from) {
    if (!learn.song || learn.done || learn.lost || learn.demo) return;
    const st = stepNow();
    const want = st.notes.filter((m) => !learn.hits.has(m));
    const r = Math.round(midi);
    // С микрофона — любая октава (голос или гитара могут звучать выше или ниже), и аккорд берётся одной нотой.
    const ok = from === 'mic' ? want.find((m) => N.pc(m) === N.pc(midi)) : want.find((m) => m === r);
    if (ok == null) {
      if (st.notes.includes(r)) return; // повторили уже взятую ноту аккорда — не ошибка
      learn.misses++;
      setTip('Мимо — ' + (want.length > 1 ? 'нужен аккорд ' + want.map(noteName).join(' + ') : 'нужна нота ' + noteName(want[0])), 1800);
      const now = ui.notes.querySelector('.now');
      if (now) {
        now.classList.remove('miss');
        void now.offsetWidth;
        now.classList.add('miss');
      }
      return;
    }
    learn.good++;
    if (from === 'mic') st.notes.forEach((m) => learn.hits.add(m));
    else learn.hits.add(ok);
    if (learn.hits.size < st.notes.length) {
      renderLearn();
      highlight();
      return;
    }
    advance();
  }

  function advance() {
    const steps = learn.plan.steps;
    const from = learn.step;
    learn.step++;
    learn.hits = new Set();
    queueAcc(steps[from].t, learn.step < steps.length ? steps[learn.step].t : Infinity);
    if (learn.loop && learn.step > learn.loop.b) {
      learn.step = learn.loop.a;
      setTip('Ещё раз этот кусок — повтор включён', 1600);
    } else if (learn.step >= steps.length) {
      finishSong();
      return;
    } else setTip(null);
    renderLearn();
    highlight();
  }

  function jumpTo(i) {
    if (!learn.song) return;
    stopDemo();
    stopAcc();
    hideDone();
    learn.done = false;
    learn.step = Math.max(0, Math.min(learn.plan.steps.length - 1, i));
    learn.hits = new Set();
    if (learn.loop && (learn.step < learn.loop.a || learn.step > learn.loop.b)) {
      const len = learn.loop.b - learn.loop.a;
      learn.loop = { a: learn.step, b: Math.min(learn.plan.steps.length - 1, learn.step + len) };
    }
    setTip(null);
    renderLearn();
    highlight();
  }

  function finishSong() {
    learn.done = true;
    setTip(null);
    cur().layout.highlightNext(null);
    renderLearn();
    showDone();
  }

  function showDone() {
    hideDone();
    const word = 'Получилось!';
    const scale = [60, 62, 64, 65, 67, 69, 71, 72];
    const total = learn.good + learn.misses;
    const acc = total ? Math.round((learn.good / total) * 100) : 100;
    const again = h('button.btn.primary', { type: 'button', onClick: () => startSong(learn.song) }, App.icon('restart'), 'Ещё раз');
    const other = h('button.btn', { type: 'button', onClick: openSongs }, App.icon('note'), 'Другая мелодия');
    const free = h('button.btn.ghost', { type: 'button', onClick: stopSong }, 'Просто поиграть');
    learn.doneEl = h('div.learn-done', { role: 'status' },
      h('div.learn-card', null,
        h('h2', { 'aria-label': word }, [...word].map((ch, i) => h('span', { style: { '--c': N.color(scale[i % scale.length]) }, 'aria-hidden': 'true' }, ch))),
        h('p', null, 'Вы сыграли «' + learn.song.title + '» от начала до конца' + (learn.misses ? '.' : ' — и ни разу не ошиблись!')),
        learn.misses ? h('p.learn-score', null, 'Точность ' + acc + '% · ' + shell.plural(learn.misses, 'ошибка', 'ошибки', 'ошибок')) : null,
        h('div.row', null, again, other, free)));
    cur().stage.append(learn.doneEl);
  }

  function hideDone() {
    if (learn.doneEl) learn.doneEl.remove();
    learn.doneEl = null;
  }

  /* =================== Аккомпанемент =================== */

  // Все события «играет само» по времени: партии аккомпанемента и ноты мелодии, которых нет на инструменте.
  let events = [];
  const acc = { queue: [], timer: null, voices: [] };

  function prepareEvents() {
    events = (learn.song.accomp || []).concat(learn.plan.extra || []).sort((a, b) => a.t - b.t);
  }

  function preloadParts() {
    if (settings.source !== 'samples') return;
    const byInst = new Map();
    (learn.song.accomp || []).forEach((e) => {
      const p = learn.song.parts[e.part];
      if (!p || p.drums || !p.inst.gm) return;
      if (!byInst.has(p.inst)) byInst.set(p.inst, new Set());
      byInst.get(p.inst).add(e.m);
    });
    byInst.forEach((set, inst) => App.sampler.preload(inst.gm, [...set].sort((a, b) => a - b)));
  }

  const speed = () => settings.learn.speed || 1;

  /**
   * Сыграть аккомпанемент от момента from до момента to (секунды песни), начиная прямо сейчас.
   * Человек ушёл вперёд — недоигранное от прошлых шагов уже не нужно.
   */
  function queueAcc(from, to, lead) {
    if (!events.length) return;
    const ac = App.audio.ensure();
    const sp = speed();
    const now = ac.currentTime + (lead || 0.02);
    acc.queue = acc.queue.filter((q) => q.at < ac.currentTime + 0.03);
    const start = from === -Infinity ? 0 : from;
    let i = lowerBound(events, from === -Infinity ? -Infinity : from);
    for (; i < events.length && events[i].t < to; i++) {
      const e = events[i];
      if (e.part !== -1 && !settings.learn.acc) continue;
      acc.queue.push({ at: now + Math.max(0, e.t - start) / sp, e });
    }
    acc.queue.sort((a, b) => a.at - b.at);
    if (!acc.timer && acc.queue.length) {
      acc.timer = setInterval(pumpAcc, 40);
      pumpAcc();
    }
  }

  function lowerBound(list, t) {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t < t - 0.0005) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function pumpAcc() {
    const ac = App.audio.ctx;
    const until = ac.currentTime + 0.3;
    while (acc.queue.length && acc.queue[0].at < until) {
      const { at, e } = acc.queue.shift();
      playEvent(e, Math.max(at, ac.currentTime));
    }
    acc.voices = acc.voices.filter((v) => v.endTime == null || v.endTime > ac.currentTime);
    if (!acc.queue.length) {
      clearInterval(acc.timer);
      acc.timer = null;
    }
  }

  function playEvent(e, at) {
    const band = shell.band;
    const dur = e.d / speed();
    if (e.part === -1) {
      acc.voices.push(band.play(cur().inst, e.m, e.v, at, dur));
      return;
    }
    const p = learn.song.parts[e.part];
    if (!p) return;
    if (p.drums) {
      const sound = App.mySongs.drumSound(e.m);
      if (sound) band.drum(p.inst, 'acoustic', sound, e.v, at - App.audio.ctx.currentTime);
      return;
    }
    acc.voices.push(band.play(p.inst, e.m, e.v * 0.9, at, dur));
  }

  function stopAcc() {
    acc.queue = [];
    clearInterval(acc.timer);
    acc.timer = null;
    const now = App.audio.ctx ? App.audio.ctx.currentTime : 0;
    acc.voices.forEach((v) => v.kill(now));
    acc.voices = [];
  }

  /* =================== «Послушать, как звучит» =================== */

  function toggleDemo() {
    if (learn.demo) {
      stopDemo();
      return;
    }
    if (!learn.song || !canLearn()) return;
    hideDone();
    stopAcc();
    const steps = learn.plan.steps;
    const from = learn.done ? 0 : learn.loop ? learn.loop.a : learn.step;
    const to = learn.loop ? learn.loop.b : steps.length - 1;
    const sp = speed();
    const t0 = steps[from].t;
    const lead = 0.15;
    const demo = (learn.demo = { timers: [], voices: [], i: from });
    App.audio.ensure();
    if (learn.song.audio) {
      demoOriginal(demo, from, to, sp);
      return;
    }
    for (let i = from; i <= to; i++) {
      const st = steps[i];
      demo.timers.push(setTimeout(() => {
        demoRelease(demo);
        demo.voices = st.notes.map((m) => shell.sound(m, 0.8));
        demo.i = i;
        show(st.notes);
        renderLearn();
      }, (lead + (st.t - t0) / sp) * 1000));
    }
    const last = steps[to];
    const end = lead + (last.t - t0 + last.d) / sp;
    queueAcc(t0, to + 1 < steps.length ? steps[to + 1].t : Infinity, lead);
    demo.timers.push(setTimeout(() => demoRelease(demo), end * 1000));
    demo.timers.push(setTimeout(() => stopDemo(true), (end + 0.3) * 1000));
    renderLearn();
  }

  /**
   * Мелодия из записи: «Послушать» играет саму песню, а ноты мигают в такт.
   * Подсветку сверяем с часами плеера — так она не убегает, даже если запись подгрузилась не сразу.
   */
  function demoOriginal(demo, from, to, sp) {
    const steps = learn.plan.steps;
    const song = learn.song;
    const audio = new Audio(URL.createObjectURL(song.audio));
    audio.preservesPitch = true; // медленнее — но не ниже
    audio.mozPreservesPitch = true;
    audio.webkitPreservesPitch = true;
    audio.defaultPlaybackRate = sp; // после загрузки браузер берёт скорость отсюда
    audio.playbackRate = sp;
    audio.currentTime = song.audioFrom + Math.max(0, steps[from].t - 0.4);
    demo.audio = audio;
    demo.shown = -1;
    const last = steps[to];
    const endT = to + 1 < steps.length ? steps[to + 1].t : last.t + last.d + 0.6;
    demo.timers.push(setInterval(() => {
      const t = audio.currentTime - song.audioFrom;
      if (audio.ended || t >= endT) {
        stopDemo(true);
        return;
      }
      let k = Math.max(from, demo.i);
      while (k + 1 <= to && steps[k + 1].t <= t) k++;
      if (k !== demo.shown && steps[k].t <= t + 0.03) {
        demo.shown = k;
        demo.i = k;
        show(steps[k].notes);
        renderLearn();
      }
    }, 25));
    audio.play().catch(() => {
      shell.toast('Запись не играет — попробуйте ещё раз');
      stopDemo();
    });
    renderLearn();
  }

  function demoRelease(demo) {
    demo.voices.forEach((v) => cur() && cur().inst.mode === 'sustain' && shell.release(v));
    demo.voices = [];
  }

  function stopDemo(natural) {
    const demo = learn.demo;
    if (!demo) return;
    demo.timers.forEach(clearTimeout);
    if (demo.audio) {
      demo.audio.pause();
      URL.revokeObjectURL(demo.audio.src);
    }
    demoRelease(demo);
    learn.demo = null;
    if (!natural) stopAcc();
    renderLearn();
    highlight();
  }

  /* =================== Панель под инструментом =================== */

  const SPEEDS = [0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5];

  function mount(el) {
    const song = h('button.learn-song', { type: 'button', title: 'Выбрать другую мелодию', onClick: openSongs },
      App.icon('note'), h('span'), App.icon('chevron-down'));
    const notes = h('div.learn-notes', { 'aria-hidden': 'true' });
    const fill = h('i.learn-fill');
    const loopEl = h('i.learn-loop', { hidden: true }, h('b.a'), h('b.b'));
    const track = h('div.learn-track', { role: 'slider', tabindex: 0, 'aria-label': 'Где вы в мелодии. Нажмите, чтобы перейти', 'aria-valuemin': 1 }, loopEl, fill);
    const count = h('span.learn-count');
    const speedSel = h('select.select.learn-speed', { 'aria-label': 'Темп', title: 'Темп: медленнее — легче' },
      SPEEDS.map((v) => h('option', { value: v }, 'Темп ' + Math.round(v * 100) + '%')));
    speedSel.addEventListener('change', () => {
      settings.learn.speed = +speedSel.value;
      shell.save();
    });
    const accBtn = App.ui.toggle('Аккомпанемент', settings.learn.acc, (on) => {
      settings.learn.acc = on;
      shell.save();
      if (!on) stopAcc();
    }, 'Остальные партии песни играют вместе с вами');
    const loopBtn = App.ui.toggle('Повтор куска', false, (on) => toggleLoop(on), 'Повторять трудное место: перетащите края на полоске');
    const listen = h('button.btn', { type: 'button', 'aria-pressed': 'false', onClick: toggleDemo });
    const restart = h('button.btn.learn-restart', { type: 'button', title: 'Начать мелодию сначала', 'aria-label': 'Сначала', onClick: () => learn.song && startSong(learn.song) },
      App.icon('restart'), h('span.btn-label', null, 'Сначала'));
    const quit = shell.iconButton('close', 'Закончить разучивание', stopSong);
    const tip = h('p.learn-tip', { 'aria-live': 'polite' });
    const opts = h('div.learn-opts', null, speedSel, accBtn.el, loopBtn.el);
    el.textContent = '';
    el.append(song, notes, h('div.learn-progress', null, track, count), opts, h('div.learn-actions', null, listen, restart, quit), tip);
    ui = { el, song, notes, fill, track, loopEl, count, listen, tip, speedSel, accBtn, loopBtn };
    trackInput(track);
    renderLearn();
  }

  function toggleLoop(on) {
    if (!learn.song) return;
    if (!on) learn.loop = null;
    else {
      const a = learn.done ? 0 : learn.step;
      learn.loop = { a, b: Math.min(learn.plan.steps.length - 1, a + 11) };
      setTip('Повторяем ноты ' + (learn.loop.a + 1) + '–' + (learn.loop.b + 1) + '. Края куска можно перетащить на полоске', 3500);
      if (learn.done) jumpTo(a);
    }
    renderLearn();
  }

  /** Полоска: нажать — перейти к месту; при повторе — тянуть края куска. */
  function trackInput(track) {
    let drag = null;
    const stepAt = (e) => {
      const r = track.getBoundingClientRect();
      const n = learn.plan.steps.length;
      return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
    };
    track.addEventListener('pointerdown', (e) => {
      if (!learn.song) return;
      e.preventDefault();
      const i = stepAt(e);
      if (learn.loop) {
        const r = track.getBoundingClientRect();
        const n = learn.plan.steps.length;
        const xa = r.left + (learn.loop.a / n) * r.width;
        const xb = r.left + ((learn.loop.b + 1) / n) * r.width;
        if (Math.abs(e.clientX - xa) < 14 || Math.abs(e.clientX - xb) < 14) {
          drag = Math.abs(e.clientX - xa) <= Math.abs(e.clientX - xb) ? 'a' : 'b';
          try {
            track.setPointerCapture(e.pointerId);
          } catch (err) { /* ignore */ }
          return;
        }
      }
      jumpTo(i);
    });
    track.addEventListener('pointermove', (e) => {
      if (!drag || !learn.loop) return;
      const i = stepAt(e);
      if (drag === 'a') learn.loop.a = Math.min(i, learn.loop.b);
      else learn.loop.b = Math.max(i, learn.loop.a);
      renderLearn();
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      if (learn.song && (learn.step < learn.loop.a || learn.step > learn.loop.b)) jumpTo(learn.loop.a);
      setTip('Повторяем ноты ' + (learn.loop.a + 1) + '–' + (learn.loop.b + 1), 2000);
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('keydown', (e) => {
      if (!learn.song) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        jumpTo(learn.step + (e.key === 'ArrowLeft' ? -1 : 1));
      }
    });
  }

  function setTip(text, ms) {
    clearTimeout(learn.tipTimer);
    learn.tip = text;
    if (text && ms) {
      learn.tipTimer = setTimeout(() => {
        learn.tip = null;
        renderLearn();
      }, ms);
    }
    renderLearn();
  }

  const chordName = (notes) => notes.map(noteName).join('+');

  function renderLearn() {
    if (!ui || !ui.el.isConnected || !cur()) return;
    const song = learn.song;
    ui.el.hidden = !song;
    if (!song) return;
    const steps = learn.plan.steps;

    ui.song.querySelector('span').textContent = song.title;

    ui.notes.textContent = '';
    if (!learn.done || learn.demo) {
      const from = learn.demo ? learn.demo.i : learn.step;
      steps.slice(from, from + 4).forEach((st, k) => {
        const left = k || learn.demo ? st.notes : st.notes.filter((m) => !learn.hits.has(m));
        const top = left[left.length - 1] != null ? left[left.length - 1] : st.notes[st.notes.length - 1];
        ui.notes.append(h('span.learn-note' + (k ? '.soon' : '.now') + (st.notes.length > 1 ? '.chord' : ''),
          { style: { '--c': N.color(top) } }, chordName(left.length ? left : st.notes)));
      });
      const now = ui.notes.firstChild;
      if (now) now.addEventListener('animationend', (e) => e.animationName === 'learn-miss' && now.classList.remove('miss'));
    }

    const total = steps.length;
    const at = learn.demo ? learn.demo.i : learn.done ? total : learn.step;
    ui.fill.style.setProperty('--p', (at / total) * 100 + '%');
    ui.track.setAttribute('aria-valuemax', total);
    ui.track.setAttribute('aria-valuenow', Math.min(total, at + 1));
    ui.count.textContent = (learn.done ? total : at) + ' из ' + total;
    ui.loopEl.hidden = !learn.loop;
    if (learn.loop) {
      ui.loopEl.style.left = (learn.loop.a / total) * 100 + '%';
      ui.loopEl.style.width = ((learn.loop.b - learn.loop.a + 1) / total) * 100 + '%';
    }
    ui.loopBtn.set(!!learn.loop);
    ui.loopBtn.el.hidden = total < 6;
    ui.speedSel.value = String(SPEEDS.reduce((a, b) => (Math.abs(b - speed()) < Math.abs(a - speed()) ? b : a)));
    ui.accBtn.el.hidden = !(song.accomp && song.accomp.length);
    ui.accBtn.set(settings.learn.acc);

    const playing = !!learn.demo;
    const label = playing ? 'Остановить' : 'Послушать, как звучит';
    ui.listen.textContent = '';
    ui.listen.append(App.icon(playing ? 'stop' : 'play'), h('span.btn-label', null, label));
    ui.listen.setAttribute('aria-pressed', String(playing));
    ui.listen.setAttribute('aria-label', label);
    ui.listen.title = playing ? 'Остановить мелодию'
      : song.audio ? 'Включить саму запись с этого места — ноты будут мигать в такт'
        : 'Инструмент сам сыграет мелодию с этого места и покажет, куда нажимать';

    const c = cur();
    const kind = c.layoutName === 'strings' && c.inst.bowed ? 'bowed' : c.layoutName;
    let tip = TAP[kind] || 'Нажмите мигающую ноту';
    let warn = false;
    const st = !learn.done && steps[learn.step];
    if (learn.tip) {
      tip = learn.tip;
      warn = true;
    } else if (learn.lost) {
      tip = 'Мелодия не помещается на экране — поверните телефон боком или начните сначала';
      warn = true;
    } else if (playing) {
      tip = 'Слушайте и смотрите, какие ноты мигают. Потом повторите сами';
    } else if (learn.done) {
      tip = 'Мелодия сыграна целиком';
    } else if (st && st.notes.length > 1) {
      tip = 'Аккорд: нажмите все мигающие ноты вместе';
    } else if (learn.step === 0) {
      tip += '. Не знаете, как звучит мелодия? Нажмите «Послушать»';
    }
    ui.tip.textContent = tip;
    ui.tip.classList.toggle('warn', warn);
  }
})();
