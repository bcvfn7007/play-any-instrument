/* Приложение: главная, экран игры, панели, запись, метроном, MIDI и настройки. */
(function () {
  const App = window.App;
  const h = App.h;
  const N = App.notes;

  /* ---------- Настройки (запоминаются в браузере) ---------- */

  const STORE = 'zvukoryad.v1';
  const DEFAULTS = {
    volume: 0.8,
    reverb: 0.25,
    labels: 'ru',
    keyHints: true,
    source: 'samples',
    theme: 'auto',
    favorites: [],
    recent: [],
    state: {},
    layoutPick: {},
    drumKit: {},
    synth: { wave: 'sawtooth', cutoff: 2600, q: 5, attack: 0.008, release: 0.22, detune: 12 },
    bpm: 100,
    beats: 4,
  };

  const settings = (App.settings = load());

  function load() {
    const base = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
      return Object.assign(base, saved, { synth: Object.assign(base.synth, saved.synth) });
    } catch (e) {
      return base;
    }
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE, JSON.stringify(settings));
      } catch (e) { /* приватный режим — живём без сохранения */ }
    }, 200);
  }

  App.audio.settings.volume = settings.volume;
  App.audio.settings.reverb = settings.reverb;
  App.audio.metronome.bpm = settings.bpm;
  App.audio.metronome.beats = settings.beats;

  const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (navigator.audioSession) {
    try {
      navigator.audioSession.type = 'playback';
    } catch (e) { /* iOS: чтобы звук шёл даже с выключенным звонком */ }
  }

  function applyTheme() {
    if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', settings.theme);
  }
  applyTheme();

  /* ---------- Мелочи интерфейса ---------- */

  const app = document.getElementById('app');

  const toastEl = h('div.toast', { role: 'status', 'aria-live': 'polite' });
  document.body.append(toastEl);
  let toastTimer = null;
  function toast(text, action) {
    toastEl.textContent = '';
    toastEl.append(h('span', null, text));
    if (action) {
      const b = h('button.link', { type: 'button' }, action.label);
      b.addEventListener('click', () => {
        toastEl.classList.remove('show');
        action.run();
      });
      toastEl.append(b);
    }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), action ? 5000 : 2600);
  }
  App.toast = toast;

  function iconButton(icon, label, onClick, cls) {
    const b = h('button.icon-btn' + (cls ? '.' + cls : ''), { type: 'button', 'aria-label': label, title: label }, App.icon(icon));
    if (onClick) b.addEventListener('click', (e) => onClick(e, b));
    return b;
  }

  const familyOf = (inst) => App.families.find((f) => f.id === inst.family);
  const hueOf = (inst) => (familyOf(inst) ? familyOf(inst).hue : '#9a96b8');

  function wordmark() {
    // Восемь букв — восемь нот гаммы до мажор, и у каждой свой цвет.
    const scale = [60, 62, 64, 65, 67, 69, 71, 72];
    return h('span.wordmark-letters', { 'aria-label': 'Звукоряд' },
      [...'Звукоряд'].map((ch, i) => h('span', { style: { '--c': N.color(scale[i]) }, 'aria-hidden': 'true' }, ch)));
  }

  /** Модальная панель: справа на компьютере, снизу на телефоне. */
  function sheet(title, content, opts) {
    releaseHeld();
    const dlg = h('dialog.sheet' + (opts && opts.wide ? '.wide' : ''), { 'aria-label': title });
    const inner = h('div.sheet-inner', null,
      h('div.sheet-head', null, h('h2', null, title), iconButton('close', 'Закрыть', () => dlg.close())),
      h('div.sheet-body', null, content));
    dlg.append(inner);
    dlg.addEventListener('close', () => {
      dlg.remove();
      if (opts && opts.onClose) opts.onClose();
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
    document.body.append(dlg);
    dlg.showModal();
    return dlg;
  }

  const modalOpen = () => !!document.querySelector('dialog[open]');

  /* ---------- Маршруты ---------- */

  function route() {
    const m = /^#\/play\/([\w-]+)/.exec(location.hash);
    if (m) {
      const inst = App.instrumentById[m[1]];
      if (inst) return showPlay(inst);
      toast('Такого инструмента нет — выберите из списка');
      history.replaceState(null, '', '#/');
    }
    showHome();
  }
  window.addEventListener('hashchange', route);

  /* ---------- Главная ---------- */

  let heroKeys = null;

  function showHome() {
    teardownPlay();
    document.title = 'Звукоряд — играйте на любом инструменте';
    app.textContent = '';
    const search = h('input.search-input', {
      type: 'search',
      placeholder: 'Найти: гитара, скрипка, барабаны…',
      'aria-label': 'Найти инструмент',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const results = h('div.results', { hidden: true, 'aria-live': 'polite' });
    const sections = h('div.sections');
    const hero = heroTubes();

    app.append(h('div.home', null,
      h('header.site-head', null,
        h('a.wordmark', { href: '#/' }, wordmark()),
        h('div.head-actions', null, iconButton('settings', 'Настройки', () => openSettings()))),
      h('section.hero', null,
        h('div.hero-text', null,
          h('h1', null, 'На чём сыграем?'),
          h('p.lead', null, 'Выберите инструмент и играйте мышкой, пальцем или клавиатурой компьютера. Устанавливать ничего не нужно.')),
        hero.el),
      h('div.search', null, App.icon('search'), search),
      results,
      sections,
      h('footer.site-foot', null,
        h('p', null, 'Записи живых инструментов — библиотека FluidR3 GM, барабанов — MusyngKite и коллекция драм-машин smpldsnds. Без интернета всё звучит через встроенный синтезатор.'))));

    renderSections(sections);
    search.addEventListener('input', () => filter(search.value, results, sections));
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = results.querySelector('a.tile, a.chip-link');
        if (first) location.hash = first.getAttribute('href');
      }
    });
    heroKeys = hero.keys;
  }

  function heroTubes() {
    const notes = [60, 62, 64, 65, 67, 69, 71, 72];
    const codes = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'];
    const row = h('div.tubes', { role: 'group', 'aria-label': 'Попробуйте: нажмите на трубки или проведите по ним' });
    const els = notes.map((m, i) => {
      const el = h('div.tube', {
        dataset: { midi: m },
        role: 'button',
        'aria-label': N.name(m, 'ru', true),
        style: { '--c': N.color(m), '--len': 100 - i * 7.5 + '%' },
      }, h('span.tube-name', null, N.name(m, settings.labels === 'none' ? 'ru' : settings.labels)),
      coarse ? null : h('span.tube-key', null, App.keymap.label(codes[i])));
      row.append(el);
      return el;
    });
    function hit(i) {
      const ac = App.audio.ensure();
      const v = App.synth.play('marimba', notes[i], 0.9, App.audio.bus('hero', { reverb: 1.3 }).input, ac.currentTime);
      App.audio.track(v);
      const el = els[i];
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
    }
    App.track(row, { selector: '.tube', glide: true, down: (el) => hit(els.indexOf(el)), up: () => {} });
    const held = new Set();
    return {
      el: h('div.hero-play', null, row,
        h('p.hero-caption', null, coarse ? 'Нажмите на трубки — это звучит гамма до мажор.' : 'Нажмите на трубки или клавиши A S D F G H J K — это гамма до мажор.')),
      keys: {
        down(code, e) {
          const i = codes.indexOf(code);
          if (i < 0) return false;
          if (!e.repeat && !held.has(code)) hit(i);
          held.add(code);
          return true;
        },
        up: (code) => held.delete(code),
      },
    };
  }

  function tile(inst) {
    const fav = settings.favorites.includes(inst.id);
    const favBtn = h('button.fav', { type: 'button', 'aria-pressed': String(fav), 'aria-label': (fav ? 'Убрать из избранного: ' : 'В избранное: ') + inst.name, title: fav ? 'Убрать из избранного' : 'В избранное' }, App.icon('star'));
    favBtn.addEventListener('click', () => toggleFav(inst, favBtn));
    return h('div.tile-wrap', { style: { '--fam': hueOf(inst) } },
      h('a.tile', { href: '#/play/' + inst.id },
        h('span.tile-icon', { 'aria-hidden': 'true' }, inst.icon),
        h('span.tile-name', null, inst.name),
        h('span.tile-meta', null, inst.gmFamily ? inst.gmFamily.toLowerCase() : App.layoutNames[inst.layout])),
      favBtn);
  }

  function toggleFav(inst, btn) {
    const i = settings.favorites.indexOf(inst.id);
    if (i >= 0) settings.favorites.splice(i, 1);
    else settings.favorites.unshift(inst.id);
    save();
    const on = i < 0;
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      btn.title = on ? 'Убрать из избранного' : 'В избранное';
    }
    toast(on ? inst.name + ' — в избранном' : inst.name + ' — убрано из избранного');
    const sections = document.querySelector('.sections');
    if (sections && !sections.hidden) {
      const y = window.scrollY;
      renderSections(sections);
      window.scrollTo(0, y);
    }
  }

  const grid = (items) => h('div.tiles', null, items.map(tile));

  function section(title, items, note) {
    return h('section.section', null,
      h('div.section-head', null, h('h2.section-title', null, title), note ? h('p.section-note', null, note) : null),
      grid(items));
  }

  function renderSections(root) {
    root.textContent = '';
    const favs = settings.favorites.map((id) => App.instrumentById[id]).filter(Boolean);
    const recent = settings.recent.map((id) => App.instrumentById[id]).filter(Boolean).filter((i) => !settings.favorites.includes(i.id));
    if (favs.length) root.append(section('Избранное', favs));
    if (recent.length) root.append(section('Недавние', recent.slice(0, 6)));
    App.families.forEach((f) => {
      const items = App.instruments.filter((i) => i.family === f.id);
      root.append(section(f.name, items));
    });
    root.append(gmSection());
  }

  function gmSection() {
    const body = h('div.gm-body', { hidden: true });
    App.gmFamilies.forEach((fam) => {
      const items = App.instruments.filter((i) => i.gmFamily === fam);
      body.append(h('div.gm-group', null, h('h3', null, fam),
        h('div.chips', null, items.map((i) => h('a.chip-link', { href: '#/play/' + i.id }, i.name)))));
    });
    const toggle = h('button.btn', { type: 'button', 'aria-expanded': 'false' }, 'Показать все 128');
    toggle.addEventListener('click', () => {
      const open = body.hidden;
      body.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Свернуть список' : 'Показать все 128';
    });
    return h('section.section.gm', null,
      h('div.section-head', null,
        h('h2.section-title', null, 'Весь оркестр'),
        h('p.section-note', null, '128 инструментов General MIDI — от рояля до вертолёта. На всех играют клавишами.')),
      toggle, body);
  }

  function matches(inst, words) {
    const fam = familyOf(inst);
    const hay = (inst.name + ' ' + (inst.tags || '') + ' ' + (inst.gmFamily || '') + ' ' + (fam ? fam.name : '')).toLowerCase().replace(/ё/g, 'е');
    return words.every((w) => hay.includes(w));
  }

  function filter(q, results, sections) {
    const words = q.trim().toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
    if (!words.length) {
      results.hidden = true;
      sections.hidden = false;
      return;
    }
    const found = App.instruments.filter((i) => matches(i, words));
    results.textContent = '';
    results.hidden = false;
    sections.hidden = true;
    if (!found.length) {
      results.append(h('p.empty', null, 'По запросу «' + q.trim() + '» ничего нет. Попробуйте «гитара», «флейта» или «барабаны».'));
      return;
    }
    const main = found.filter((i) => i.family !== 'gm');
    const gm = found.filter((i) => i.family === 'gm');
    if (main.length) results.append(section('Найдено', main));
    if (gm.length) results.append(section(main.length ? 'Ещё в оркестре' : 'Найдено в оркестре', gm));
  }

  /* ---------- Экран игры ---------- */

  let current = null;
  let sustainOn = false;
  const sustained = new Set();

  function buses() {
    const c = current;
    if (!c.buses) {
      c.buses = {
        synth: App.audio.bus(c.inst.id + ':synth', { fx: c.inst.fx, reverb: c.inst.reverb, level: c.inst.level }),
        sample: App.audio.bus(c.inst.id + ':sample', { reverb: c.inst.reverb }),
      };
    }
    return c.buses;
  }

  const useSamples = (inst) => settings.source === 'samples' && !!inst.gm && !App.sampler.failed(inst.gm);
  const voiceOpts = (inst) => (inst.editable ? settings.synth : inst.voiceOpts);

  function sound(midi, vel, extra) {
    const ac = App.audio.ensure();
    const inst = current.inst;
    const t = ac.currentTime + ((extra && extra.delay) || 0);
    const b = buses();
    let v = null;
    if (useSamples(inst)) v = App.sampler.play(inst, midi, vel, b.sample.input, t);
    if (!v) v = App.synth.play(inst.voice || 'piano', midi, vel, b.synth.input, t, voiceOpts(inst));
    return App.audio.track(v);
  }

  /** Нота, сыгранная человеком (пальцем, мышью, клавиатурой или MIDI). */
  function noteOn(midi, vel, extra) {
    const v = sound(midi, vel, extra);
    learnHeard(midi);
    return v;
  }

  function release(v) {
    if (!v.sustain) {
      v.sustain = true;
      v.release = current ? current.inst.release || 0.15 : 0.15;
    }
    v.stop(App.audio.ctx.currentTime);
  }

  function noteOff(v) {
    if (!v || !current || current.inst.mode !== 'sustain') return;
    if (sustainOn) sustained.add(v);
    else release(v);
  }

  function setSustain(on) {
    sustainOn = on;
    if (!on) {
      sustained.forEach(release);
      sustained.clear();
    }
  }

  function kill(v, delay) {
    if (v) v.kill(App.audio.ctx.currentTime + (delay || 0));
  }

  /** Какой набор записей звучит у барабанов: выбранный человеком или заданный инструментом. */
  function currentKit() {
    const inst = current.inst;
    const pick = settings.drumKit[inst.id];
    return inst.kits && inst.kits.includes(pick) ? pick : inst.kit || null;
  }

  function drum(sound, vel, when) {
    const ac = App.audio.ensure();
    const t = when || ac.currentTime;
    const kit = currentKit();
    let v = null;
    if (kit && settings.source === 'samples') v = App.drumkit.play(kit, sound, vel, buses().sample.input, t);
    if (!v) v = App.synth.drum(App.drumkit.fallback(sound), vel, buses().synth.input, t);
    return App.audio.track(v);
  }

  function kitSwitch(inst) {
    return h('div.deck-group', null,
      h('span.deck-label', null, 'Звук'),
      App.ui.segmented(inst.kits.map((k) => [k, App.drumkit.kits[k].name]), currentKit(), (v) => {
        settings.drumKit[inst.id] = v;
        save();
        if (settings.source === 'samples') App.drumkit.preload(v, current.drumList);
        updateSource();
      }, 'Набор звуков').el);
  }

  function continuous(f) {
    App.audio.ensure();
    return App.audio.track(App.synth.continuous(buses().synth.input, f));
  }

  function releaseHeld() {
    if (current && current.layout) current.layout.releaseAll();
    setSustain(false);
    if (current && current.layout && current.layout.setSustain) current.layout.setSustain(false);
  }

  function pickLayout(inst) {
    const pick = settings.layoutPick[inst.id];
    return pick && (pick === inst.layout || (inst.alt || []).includes(pick)) ? pick : inst.layout;
  }

  function showPlay(inst) {
    teardownPlay();
    heroKeys = null;
    document.title = inst.name + ' — Звукоряд';
    settings.recent = [inst.id].concat(settings.recent.filter((id) => id !== inst.id)).slice(0, 10);
    save();

    app.textContent = '';
    const layoutName = pickLayout(inst);
    const bar = buildBar(inst);
    const deck = h('div.deck', { role: 'toolbar', 'aria-label': 'Настройки инструмента' });
    const learnBar = h('section.learn', { hidden: true, 'aria-label': 'Разучивание мелодии' });
    const stage = h('main.stage');
    const hints = h('footer.hints', { 'aria-label': 'Подсказки' });
    const page = h('div.play', { style: { '--fam': hueOf(inst) } }, bar.el, deck, learnBar, stage, hints);
    app.append(page);
    current = { inst, layoutName, page, bar, deck, stage, hints, layout: null, preloadList: [], drumList: [], buses: null, learnUi: buildLearnBar(learnBar) };
    mountLayout();
    window.scrollTo(0, 0);
  }

  function teardownPlay() {
    if (!current) return;
    stopSong();
    releaseHeld();
    if (current.layout) current.layout.destroy();
    closePopover();
    current = null;
  }

  function mountLayout() {
    const c = current;
    if (c.layout) {
      releaseHeld();
      c.layout.destroy();
      c.layout = null; // пока строится новая раскладка, старой уже нет
    }
    stopDemo();
    hideDone();
    c.deck.textContent = '';
    c.stage.textContent = '';
    c.hints.textContent = '';
    c.page.dataset.layout = c.layoutName;
    c.stage.className = 'stage layout-' + c.layoutName + (c.inst.style ? ' style-' + c.inst.style : '');
    if (c.inst.alt) c.deck.append(layoutSwitch(c.inst));
    if (c.inst.kits) c.deck.append(kitSwitch(c.inst));
    const factory = App.layouts[c.layoutName];
    c.layout = factory(c.stage, makeCtx(c));
    if (c.inst.editable) c.deck.append(synthEditor());
    // Разучивать можно там, где у каждой ноты своё место: не на барабанах, драм-машине и терменвоксе.
    if (c.layout.highlightNext) {
      c.deck.append(h('button.btn.learn-btn', { type: 'button', title: 'Выбрать песню и сыграть её по подсказкам', onClick: openSongs },
        App.icon('note'), 'Разучить мелодию'));
    }
    if (['keys', 'strings', 'bars', 'beat', 'harp', 'kit'].includes(c.layoutName)) {
      c.deck.append(h('span.rotate-tip', null, 'Поверните телефон боком'));
    }
    c.deck.hidden = !c.deck.children.length;
    updateSource();
    learnAttach();
  }

  function makeCtx(c) {
    const inst = c.inst;
    const key = inst.id + ':' + c.layoutName;
    const st = settings.state[key] || (settings.state[key] = {});
    return {
      inst,
      deck: c.deck,
      noteOn,
      noteOff,
      kill,
      drum,
      continuous,
      setSustain,
      toast,
      label: (m, withOct) => N.name(m, settings.labels, withOct),
      labelMode: () => settings.labels,
      showKeys: () => settings.keyHints && !coarse,
      getState: (k, d) => (st[k] !== undefined ? st[k] : d),
      setState(k, v) {
        st[k] = v;
        save();
      },
      setHints: (items) => renderHints(c.hints, items),
      /** Раскладка перерисовалась: сменилась октава или ширина. */
      viewChanged: () => learnViewChanged(),
      preload(midis) {
        c.preloadList = midis;
        if (useSamples(inst)) App.sampler.preload(inst.gm, midis);
        updateSource();
      },
      /** Какие удары понадобятся — чтобы записи барабанов загрузились заранее. */
      preloadDrums(sounds) {
        c.drumList = sounds;
        const kit = currentKit();
        if (kit && settings.source === 'samples') App.drumkit.preload(kit, sounds);
        updateSource();
      },
    };
  }

  function renderHints(el, items) {
    el.textContent = '';
    items.filter(Boolean).forEach(([keys, text]) => {
      el.append(h('span.hint' + (keys ? '' : '.tip'), null, keys ? h('kbd', null, keys) : null, text));
    });
    el.hidden = !el.children.length;
  }

  function layoutSwitch(inst) {
    const names = [inst.layout].concat(inst.alt || []);
    const label = (l) => App.layoutNames[l][0].toUpperCase() + App.layoutNames[l].slice(1);
    return App.ui.segmented(names.map((l) => [l, label(l), 'Играть на раскладке «' + App.layoutNames[l] + '»']), current.layoutName, (v) => {
      settings.layoutPick[inst.id] = v;
      save();
      current.layoutName = v;
      mountLayout();
    }, 'Вид инструмента').el;
  }

  function synthEditor() {
    const s = settings.synth;
    const toPct = (hz) => Math.round((Math.log(hz / 150) / Math.log(14000 / 150)) * 100);
    const fromPct = (p) => 150 * Math.pow(14000 / 150, p / 100);
    return h('div.synth-edit', null,
      App.ui.segmented([['sawtooth', 'Пила'], ['square', 'Квадрат'], ['triangle', 'Треугольник'], ['sine', 'Синус']], s.wave, (v) => {
        s.wave = v;
        save();
      }, 'Форма волны').el,
      App.ui.slider('Фильтр', 0, 100, 1, toPct(s.cutoff), (v) => {
        s.cutoff = fromPct(v);
        save();
      }, (v) => Math.round(fromPct(v)) + ' Гц').el,
      App.ui.slider('Резонанс', 0.5, 18, 0.5, s.q, (v) => {
        s.q = v;
        save();
      }, (v) => v.toFixed(1)).el,
      App.ui.slider('Атака', 0.002, 1.5, 0.002, s.attack, (v) => {
        s.attack = v;
        save();
      }, (v) => Math.round(v * 1000) + ' мс').el,
      App.ui.slider('Затухание', 0.03, 3, 0.01, s.release, (v) => {
        s.release = v;
        save();
      }, (v) => v.toFixed(2) + ' с').el,
      App.ui.slider('Расстройка', 0, 40, 1, s.detune, (v) => {
        s.detune = v;
        save();
      }, (v) => v + ' ц').el);
  }

  /* ---------- Разучивание мелодий ---------- */

  const learn = {
    song: null,
    step: 0, // сколько нот уже сыграно правильно
    shift: 0, // на сколько полутонов мелодия сдвинута под инструмент
    misses: 0,
    done: false,
    lost: false, // мелодия перестала помещаться (сменили октаву или ширину)
    busy: false, // раскладка двигается по нашей просьбе — не пересчитывать
    demo: null,
    doneEl: null,
    tip: null,
    tipTimer: null,
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

  const canLearn = () => !!(current && current.layout && current.layout.highlightNext);
  const noteName = (m) => N.name(m, settings.labels === 'latin' ? 'latin' : 'ru');
  const target = () => learn.song.notes[learn.step][0] + learn.shift;

  function plural(n, one, few, many) {
    const a = n % 10;
    const b = n % 100;
    return n + ' ' + (a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many);
  }

  /**
   * Куда сдвинуть мелодию (в полутонах), чтобы все её ноты были на инструменте.
   * Из подходящих сдвигов берём самый простой: меньше чёрных клавиш, та же тональность,
   * раскладку не двигать, ближе к исходной высоте.
   * move: можно ли попросить раскладку показать другую октаву → { shift, from }.
   * sameKey: только сдвиги на целые октавы от around.
   */
  function planSong(song, opts) {
    const L = current.layout;
    const melody = song.notes.map((n) => n[0]);
    const lo = Math.min(...melody);
    const around = (opts && opts.around) || 0;
    const move = !!(opts && opts.move && L.playableFrom && L.moveTo);
    const now = new Set(L.playable());
    const fits = (have, t) => melody.every((m) => have.has(m + t));
    const less = (a, b) => {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
      return false;
    };
    let best = null;
    for (let t = around - 48; t <= around + 48; t++) {
      if (opts && opts.sameKey && (t - around) % 12) continue;
      const here = fits(now, t);
      if (!here && !(move && fits(new Set(L.playableFrom(lo + t)), t))) continue;
      const black = new Set(melody.filter((m) => N.isBlack(m + t)).map((m) => N.pc(m + t))).size;
      const score = [black, (t - around) % 12 ? 1 : 0, here ? 0 : 1, Math.abs(t - around)];
      if (!best || less(score, best.score)) best = { score, shift: t, from: here ? null : lo + t };
    }
    return best && { shift: best.shift, from: best.from };
  }

  function whyNot(song) {
    const L = current.layout;
    const have = new Set(L.playable().map(N.pc));
    const missing = [...new Set(song.notes.map((n) => N.pc(n[0])))].filter((p) => !have.has(p));
    if (missing.length) return 'Здесь нет ноты ' + missing.map((p) => noteName(60 + p)).join(', ');
    return L.playableFrom ? 'Не помещается на экране — поверните телефон боком' : 'На этом инструменте не хватает нот';
  }

  function openSongs() {
    if (!canLearn()) return;
    let dlg = null;
    const list = h('div.songs');
    let playable = 0;
    App.songs.forEach((song) => {
      const ok = !!planSong(song, { move: true });
      if (ok) playable++;
      const b = h('button.song-item' + (learn.song === song ? '.current' : ''), { type: 'button', disabled: !ok },
        h('span.song-dots', { 'aria-hidden': 'true' }, song.notes.slice(0, 5).map(([m]) => h('i', { style: { '--c': N.color(m) } }))),
        h('span.song-text', null,
          h('b', null, song.title),
          h('small', null, ok ? song.about + ' · ' + plural(song.notes.length, 'нота', 'ноты', 'нот') : whyNot(song))));
      b.addEventListener('click', () => {
        dlg.close();
        startSong(song);
      });
      list.append(b);
    });
    dlg = sheet('Разучить мелодию', h('div', null,
      h('p.note', null, playable
        ? 'Выберите песню. Нужная нота будет мигать на инструменте — нажмите её, и мелодия пойдёт дальше. Ошиблись — не страшно: мелодия подождёт.'
        : 'У этого инструмента особый набор нот, и эти песни на нём не сыграть. Попробуйте пианино, ксилофон или калимбу.'),
      list));
  }

  function startSong(song) {
    if (!canLearn()) return;
    stopDemo();
    hideDone();
    const p = planSong(song, { move: true });
    if (!p) {
      toast(whyNot(song));
      return;
    }
    if (p.from != null) {
      learn.busy = true;
      current.layout.moveTo(p.from);
      learn.busy = false;
    }
    Object.assign(learn, { song, step: 0, shift: p.shift, misses: 0, done: false, lost: false });
    setTip(null);
    renderLearn();
    highlight();
  }

  function stopSong() {
    stopDemo();
    hideDone();
    setTip(null);
    learn.song = null;
    if (canLearn()) current.layout.highlightNext(null);
    renderLearn();
  }

  /** После смены вида инструмента: мелодия переезжает на новую раскладку. */
  function learnAttach() {
    if (!learn.song) return;
    if (!canLearn()) {
      stopSong();
      return;
    }
    const p = planSong(learn.song, { move: true, around: learn.shift });
    if (!p) {
      toast('«' + learn.song.title + '» не помещается на этот вид инструмента');
      stopSong();
      return;
    }
    if (p.from != null) {
      learn.busy = true;
      current.layout.moveTo(p.from);
      learn.busy = false;
    }
    learn.shift = p.shift;
    learn.lost = false;
    renderLearn();
    highlight();
  }

  function learnViewChanged() {
    if (!learn.song || learn.busy || !canLearn()) return;
    // Посреди песни тональность не меняем — только октаву, иначе знакомые ноты вдруг станут другими.
    const p = planSong(learn.song, { around: learn.shift, sameKey: true });
    if (!p || p.shift !== learn.shift) stopDemo();
    learn.lost = !p;
    if (p) learn.shift = p.shift;
    renderLearn();
    highlight();
  }

  function highlight() {
    if (!canLearn() || learn.demo) return;
    const on = learn.song && !learn.done && !learn.lost;
    current.layout.highlightNext(on ? target() : null);
  }

  function learnHeard(midi) {
    if (!learn.song || learn.done || learn.lost || learn.demo) return;
    if (Math.round(midi) !== target()) {
      learn.misses++;
      setTip('Мимо — нужна нота ' + noteName(target()), 1800);
      const now = current.learnUi.notes.querySelector('.now');
      if (now) {
        now.classList.remove('miss');
        void now.offsetWidth;
        now.classList.add('miss');
      }
      return;
    }
    learn.step++;
    if (learn.step >= learn.song.notes.length) {
      finishSong();
      return;
    }
    setTip(null);
    renderLearn();
    highlight();
  }

  function finishSong() {
    learn.done = true;
    setTip(null);
    current.layout.highlightNext(null);
    renderLearn();
    showDone();
  }

  function showDone() {
    hideDone();
    const word = 'Получилось!';
    const scale = [60, 62, 64, 65, 67, 69, 71, 72];
    const again = h('button.btn.primary', { type: 'button', onClick: () => startSong(learn.song) }, App.icon('restart'), 'Ещё раз');
    const other = h('button.btn', { type: 'button', onClick: openSongs }, App.icon('note'), 'Другая мелодия');
    const free = h('button.btn.ghost', { type: 'button', onClick: stopSong }, 'Просто поиграть');
    learn.doneEl = h('div.learn-done', { role: 'status' },
      h('div.learn-card', null,
        h('h2', { 'aria-label': word }, [...word].map((ch, i) => h('span', { style: { '--c': N.color(scale[i % scale.length]) }, 'aria-hidden': 'true' }, ch))),
        h('p', null, 'Вы сыграли «' + learn.song.title + '» от начала до конца' + (learn.misses ? '.' : ' — и ни разу не ошиблись!')),
        h('div.row', null, again, other, free)));
    current.stage.append(learn.doneEl);
  }

  function hideDone() {
    if (learn.doneEl) learn.doneEl.remove();
    learn.doneEl = null;
  }

  /* «Послушать, как звучит»: инструмент сам играет мелодию и показывает, куда нажимать. */

  function toggleDemo() {
    if (learn.demo) {
      stopDemo();
      return;
    }
    if (!learn.song || !canLearn()) return;
    hideDone();
    const song = learn.song;
    const beat = 60 / song.bpm;
    const demo = (learn.demo = { timers: [], voice: null, i: 0 });
    App.audio.ensure();
    let at = 0.12;
    song.notes.forEach(([m, beats], i) => {
      const midi = m + learn.shift;
      demo.timers.push(setTimeout(() => {
        demoRelease(demo);
        demo.voice = sound(midi, 0.8);
        demo.i = i;
        current.layout.highlightNext(midi);
        renderLearn();
      }, at * 1000));
      at += beats * beat;
    });
    demo.timers.push(setTimeout(stopDemo, at * 1000));
    renderLearn();
  }

  function demoRelease(demo) {
    if (demo.voice && current && current.inst.mode === 'sustain') release(demo.voice);
    demo.voice = null;
  }

  function stopDemo() {
    const demo = learn.demo;
    if (!demo) return;
    demo.timers.forEach(clearTimeout);
    demoRelease(demo);
    learn.demo = null;
    renderLearn();
    highlight();
  }

  /* Панель под инструментом: песня, ближайшие ноты, прогресс и кнопки. */

  function buildLearnBar(el) {
    const song = h('button.learn-song', { type: 'button', title: 'Выбрать другую мелодию', onClick: openSongs },
      App.icon('note'), h('span'), App.icon('chevron-down'));
    const notes = h('div.learn-notes', { 'aria-hidden': 'true' });
    const fill = h('i');
    const track = h('div.learn-track', { role: 'progressbar', 'aria-label': 'Сколько нот сыграно', 'aria-valuemin': 0 }, fill);
    const count = h('span.learn-count');
    const listen = h('button.btn', { type: 'button', 'aria-pressed': 'false', onClick: toggleDemo });
    const restart = h('button.btn.learn-restart', { type: 'button', title: 'Начать мелодию сначала', 'aria-label': 'Сначала', onClick: () => learn.song && startSong(learn.song) },
      App.icon('restart'), h('span.btn-label', null, 'Сначала'));
    const quit = iconButton('close', 'Закончить разучивание', stopSong);
    const tip = h('p.learn-tip', { 'aria-live': 'polite' });
    el.append(song, notes, h('div.learn-progress', null, track, count), h('div.learn-actions', null, listen, restart, quit), tip);
    return { el, song, notes, fill, track, count, listen, tip };
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

  function renderLearn() {
    if (!current) return;
    const ui = current.learnUi;
    const song = learn.song;
    ui.el.hidden = !song;
    if (!song) return;

    ui.song.querySelector('span').textContent = song.title;

    ui.notes.textContent = '';
    if (!learn.done || learn.demo) {
      const from = learn.demo ? learn.demo.i : learn.step;
      song.notes.slice(from, from + 4).forEach(([m], k) => {
        const midi = m + learn.shift;
        ui.notes.append(h('span.learn-note' + (k ? '.soon' : '.now'), { style: { '--c': N.color(midi) } }, noteName(midi)));
      });
      const now = ui.notes.firstChild;
      if (now) now.addEventListener('animationend', (e) => e.animationName === 'learn-miss' && now.classList.remove('miss'));
    }

    const total = song.notes.length;
    const played = learn.done ? total : learn.step;
    ui.fill.style.setProperty('--p', (played / total) * 100 + '%');
    ui.track.setAttribute('aria-valuemax', total);
    ui.track.setAttribute('aria-valuenow', played);
    ui.count.textContent = played + ' из ' + total;

    const playing = !!learn.demo;
    const label = playing ? 'Остановить' : 'Послушать, как звучит';
    ui.listen.textContent = '';
    ui.listen.append(App.icon(playing ? 'stop' : 'play'), h('span.btn-label', null, label));
    ui.listen.setAttribute('aria-pressed', String(playing));
    ui.listen.setAttribute('aria-label', label);
    ui.listen.title = playing ? 'Остановить мелодию' : 'Инструмент сам сыграет мелодию и покажет, куда нажимать';

    const kind = current.layoutName === 'strings' && current.inst.bowed ? 'bowed' : current.layoutName;
    let tip = TAP[kind] || 'Нажмите мигающую ноту';
    let warn = false;
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
    } else if (learn.step === 0) {
      tip += '. Не знаете, как звучит мелодия? Нажмите «Послушать»';
    }
    ui.tip.textContent = tip;
    ui.tip.classList.toggle('warn', warn);
  }

  /* ---------- Верхняя панель ---------- */

  function buildBar(inst) {
    const back = h('a.icon-btn.back', { href: '#/', 'aria-label': 'Все инструменты', title: 'Все инструменты' }, App.icon('back'));
    const title = h('button.inst-title', { type: 'button', title: 'Сменить инструмент', 'aria-haspopup': 'dialog' },
      h('span.inst-icon', { 'aria-hidden': 'true' }, inst.icon),
      h('span.inst-name', null, inst.name),
      App.icon('chevron-down'));
    title.addEventListener('click', openSwitcher);

    const source = h('button.source-chip', { type: 'button' }, h('span.dot'), h('span.source-text'));
    source.addEventListener('click', toggleSource);

    const vol = App.ui.slider('Громкость', 0, 1, 0.01, settings.volume, (v) => {
      settings.volume = v;
      App.audio.setVolume(v);
      save();
    }, (v) => Math.round(v * 100));
    vol.el.classList.add('vol', 'wide-only');
    vol.el.prepend(App.icon('volume'));
    vol.el.querySelector('span').remove();

    const metro = iconButton('metronome', 'Метроном', (e, b) => toggleMetronomePanel(b), 'metro-btn');
    if (App.audio.metronome.running) metro.classList.add('active');

    const rec = h('button.rec-btn', { type: 'button', title: 'Записать, что вы играете', 'aria-pressed': 'false' }, App.icon('record'), h('span.rec-label', null, 'Запись'));
    rec.addEventListener('click', toggleRecord);

    const takesBtn = iconButton('tape', 'Мои записи', openRecordings, 'takes-btn');
    takesBtn.append(h('span.badge', { hidden: true }));

    const el = h('header.topbar', null,
      back, title,
      h('div.bar-gap'),
      source,
      vol.el,
      metro,
      rec,
      takesBtn,
      iconButton('help', 'Как играть', openHelp, 'wide-only'),
      iconButton('fullscreen', 'Во весь экран', toggleFullscreen, 'wide-only'),
      iconButton('settings', 'Настройки', () => openSettings()));
    const b = { el, source, rec, takesBtn, metro };
    setTimeout(() => {
      updateRecButton(b);
      updateBadge(b);
    });
    return b;
  }

  /* ---------- Источник звука ---------- */

  let sourceQueued = false;
  App.sampler.onChange(() => {
    if (sourceQueued) return;
    sourceQueued = true;
    // Таймер, а не кадр анимации: в фоновой вкладке кадры не идут, и надпись застревала.
    setTimeout(() => {
      sourceQueued = false;
      updateSource();
    }, 60);
  });

  function updateSource() {
    if (!current) return;
    const chip = current.bar.source;
    const inst = current.inst;
    const text = chip.querySelector('.source-text');
    const kit = currentKit();
    if (!inst.gm && kit) return updateDrumSource(chip, text, kit);
    if (!inst.gm) {
      chip.dataset.state = 'synth';
      text.textContent = 'Синтез';
      chip.title = 'У этого инструмента звук создаётся синтезатором прямо в браузере';
      chip.disabled = true;
      return;
    }
    chip.disabled = false;
    if (settings.source !== 'samples') {
      chip.dataset.state = 'synth';
      text.textContent = 'Синтез';
      chip.title = 'Сейчас играет синтезатор. Нажмите, чтобы включить записи живого инструмента';
      return;
    }
    const p = App.sampler.progress(inst.gm, current.preloadList);
    if (p.failed) {
      chip.dataset.state = 'fail';
      text.textContent = 'Синтез';
      chip.title = 'Записи не загрузились — проверьте интернет. Пока играет синтезатор';
    } else if (p.loaded < p.total) {
      chip.dataset.state = 'loading';
      text.textContent = 'Загрузка ' + Math.round((p.loaded / Math.max(1, p.total)) * 100) + '%';
      chip.title = 'Загружаются записи живого инструмента. Можно играть уже сейчас';
    } else {
      chip.dataset.state = 'live';
      text.textContent = 'Живой звук';
      chip.title = 'Играют записи настоящего инструмента. Нажмите, чтобы переключиться на синтезатор';
    }
  }

  function updateDrumSource(chip, text, kit) {
    chip.disabled = false;
    const p = App.drumkit.progress(kit, current.drumList);
    let state = 'live';
    let label = 'Живой звук';
    let title = 'Играют записи настоящих барабанов. Нажмите, чтобы переключиться на синтезатор';
    if (settings.source !== 'samples') {
      state = 'synth';
      label = 'Синтез';
      title = 'Сейчас барабаны синтезируются. Нажмите, чтобы включить записи настоящих барабанов';
    } else if (p.failed) {
      state = 'fail';
      label = 'Синтез';
      title = 'Записи барабанов не загрузились — проверьте интернет. Пока играет синтезатор';
    } else if (p.loaded < p.total) {
      state = 'loading';
      label = 'Загрузка ' + Math.round((p.loaded / Math.max(1, p.total)) * 100) + '%';
      title = 'Загружаются записи барабанов. Можно играть уже сейчас';
    }
    chip.dataset.state = state;
    text.textContent = label;
    chip.title = title;
  }

  function toggleSource() {
    settings.source = settings.source === 'samples' ? 'synth' : 'samples';
    save();
    if (current && settings.source === 'samples' && currentKit()) App.drumkit.preload(currentKit(), current.drumList);
    if (current && useSamples(current.inst)) App.sampler.preload(current.inst.gm, current.preloadList);
    updateSource();
    toast(settings.source === 'samples' ? 'Включены записи живых инструментов' : 'Включён синтезатор — работает и без интернета');
  }

  /* ---------- Метроном ---------- */

  let popover = null;

  function closePopover() {
    if (!popover) return;
    popover.remove();
    document.removeEventListener('pointerdown', popover._outside, true);
    popover = null;
  }

  function toggleMetronomePanel(anchor) {
    if (popover && popover.classList.contains('metro')) return closePopover();
    closePopover();
    const m = App.audio.metronome;
    const bpmOut = h('output.metro-bpm', null, m.bpm);
    const dots = h('div.metro-dots');
    const renderDots = () => {
      dots.textContent = '';
      for (let i = 0; i < m.beats; i++) dots.append(h('span' + (i === 0 ? '.accent' : '')));
    };
    renderDots();
    const setBpm = (v) => {
      m.bpm = Math.max(30, Math.min(260, Math.round(v)));
      settings.bpm = m.bpm;
      bpmOut.textContent = m.bpm;
      slider.value = m.bpm;
      save();
    };
    const slider = h('input', { type: 'range', min: 30, max: 260, value: m.bpm, 'aria-label': 'Темп, ударов в минуту' });
    slider.addEventListener('input', () => setBpm(+slider.value));
    const taps = [];
    const tap = h('button.btn', { type: 'button', title: 'Нажмите несколько раз в нужном темпе' }, 'Простучать');
    tap.addEventListener('click', () => {
      const now = performance.now();
      if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
      taps.push(now);
      if (taps.length > 5) taps.shift();
      if (taps.length >= 2) setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
    });
    const startBtn = h('button.btn.primary', { type: 'button' });
    const label = () => {
      startBtn.textContent = '';
      startBtn.append(App.icon(m.running ? 'stop' : 'play'), m.running ? 'Остановить' : 'Запустить');
    };
    label();
    startBtn.addEventListener('click', () => {
      if (m.running) m.stop();
      else m.start();
      label();
      if (current) current.bar.metro.classList.toggle('active', m.running);
    });
    const beats = App.ui.segmented([[2, '2'], [3, '3'], [4, '4'], [6, '6']], m.beats, (v) => {
      m.beats = v;
      settings.beats = v;
      save();
      renderDots();
    }, 'Долей в такте');

    popover = h('div.popover.metro', { role: 'dialog', 'aria-label': 'Метроном' },
      h('div.metro-top', null, h('div', null, bpmOut, h('span.metro-unit', null, 'ударов в минуту')), dots),
      h('div.metro-row', null,
        h('button.icon-btn', { type: 'button', 'aria-label': 'Медленнее', onClick: () => setBpm(m.bpm - 1) }, '−'),
        slider,
        h('button.icon-btn', { type: 'button', 'aria-label': 'Быстрее', onClick: () => setBpm(m.bpm + 1) }, '+')),
      h('div.metro-row', null, h('span.metro-unit', null, 'Долей в такте'), beats.el),
      h('div.metro-row', null, tap, startBtn));
    document.body.append(popover);
    const r = anchor.getBoundingClientRect();
    popover.style.top = r.bottom + 8 + 'px';
    popover.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    popover._outside = (e) => {
      if (!popover.contains(e.target) && !anchor.contains(e.target)) closePopover();
    };
    document.addEventListener('pointerdown', popover._outside, true);
    popover._dots = dots;
  }

  App.audio.metronome.onBeat = (beat) => {
    if (current) {
      const b = current.bar.metro;
      b.classList.remove('tick');
      void b.offsetWidth;
      b.classList.add('tick');
    }
    if (popover && popover._dots) {
      [...popover._dots.children].forEach((d, i) => d.classList.toggle('lit', i === beat));
    }
  };

  /* ---------- Запись ---------- */

  const takes = [];
  let recTimer = null;

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  function updateRecButton(b) {
    b = b || (current && current.bar);
    if (!b) return;
    const rec = App.audio.recorder;
    b.rec.classList.toggle('active', rec.active);
    b.rec.setAttribute('aria-pressed', String(rec.active));
    b.rec.querySelector('.rec-label').textContent = rec.active ? fmtTime((performance.now() - rec.startedAt) / 1000) : 'Запись';
    b.rec.title = rec.active ? 'Остановить запись' : 'Записать, что вы играете';
  }

  function updateBadge(b) {
    b = b || (current && current.bar);
    if (!b) return;
    const badge = b.takesBtn.querySelector('.badge');
    badge.hidden = !takes.length;
    badge.textContent = takes.length;
  }

  async function toggleRecord() {
    const rec = App.audio.recorder;
    if (!rec.supported()) {
      toast('Этот браузер не умеет записывать звук. Попробуйте Chrome, Edge или Firefox');
      return;
    }
    if (!rec.active) {
      rec.start();
      recTimer = setInterval(() => updateRecButton(), 250);
      updateRecButton();
      toast('Идёт запись — играйте! Нажмите кнопку ещё раз, чтобы остановить');
      return;
    }
    clearInterval(recTimer);
    const take = await rec.stop();
    updateRecButton();
    if (!take || take.duration < 0.4) return;
    const d = new Date();
    take.title = (current ? current.inst.name : 'Запись') + ', ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const p2 = (n) => String(n).padStart(2, '0');
    const stamp = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '-' + p2(d.getHours()) + '-' + p2(d.getMinutes());
    take.file = 'zvukoryad-' + (current ? current.inst.id : 'take') + '-' + stamp + '.' + take.ext;
    takes.unshift(take);
    updateBadge();
    toast('Запись готова: ' + fmtTime(take.duration), { label: 'Послушать', run: openRecordings });
  }

  function openRecordings() {
    const list = h('div.takes');
    const render = () => {
      list.textContent = '';
      if (!takes.length) {
        list.append(h('p.empty', null, 'Записей пока нет. Нажмите «Запись» на панели, сыграйте что-нибудь и остановите — запись появится здесь.'));
        return;
      }
      takes.forEach((t) => {
        const del = iconButton('trash', 'Удалить запись', () => {
          takes.splice(takes.indexOf(t), 1);
          URL.revokeObjectURL(t.url);
          updateBadge();
          render();
        });
        list.append(h('div.take', null,
          h('div.take-head', null, h('b', null, t.title), h('span.take-len', null, fmtTime(t.duration))),
          h('audio', { controls: true, src: t.url, preload: 'metadata' }),
          h('div.take-actions', null,
            h('a.btn', { href: t.url, download: t.file }, App.icon('download'), 'Скачать'),
            del)));
      });
    };
    render();
    sheet('Мои записи', h('div', null,
      list,
      h('p.note', null, 'Записи хранятся, пока открыта страница. Чтобы сохранить запись насовсем, нажмите «Скачать».')));
  }

  /* ---------- Смена инструмента ---------- */

  function openSwitcher() {
    const input = h('input.search-input', { type: 'search', placeholder: 'Найти инструмент', 'aria-label': 'Найти инструмент', autocomplete: 'off' });
    const list = h('div.switch-list');
    let dlg = null;
    const link = (i) => {
      const a = h('a.switch-item' + (current && current.inst === i ? '.current' : ''), { href: '#/play/' + i.id, style: { '--fam': hueOf(i) } },
        h('span.inst-icon', { 'aria-hidden': 'true' }, i.icon), h('span', null, i.name),
        h('small', null, i.gmFamily ? i.gmFamily.toLowerCase() : App.layoutNames[i.layout]));
      a.addEventListener('click', () => dlg && dlg.close());
      return a;
    };
    const render = () => {
      const words = input.value.trim().toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
      list.textContent = '';
      if (words.length) {
        const found = App.instruments.filter((i) => matches(i, words));
        if (!found.length) list.append(h('p.empty', null, 'Ничего не нашлось'));
        found.forEach((i) => list.append(link(i)));
        return;
      }
      App.families.forEach((f) => {
        list.append(h('h3', null, f.name));
        App.instruments.filter((i) => i.family === f.id).forEach((i) => list.append(link(i)));
      });
      list.append(h('h3', null, 'Весь оркестр'));
      App.instruments.filter((i) => i.family === 'gm').forEach((i) => list.append(link(i)));
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = list.querySelector('a');
        if (first) {
          location.hash = first.getAttribute('href');
          dlg.close();
        }
      }
    });
    render();
    dlg = sheet('Инструменты', h('div.switcher', null, input, list));
    input.focus();
    const cur = list.querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }

  /* ---------- Справка ---------- */

  const HOW = {
    keys: ['Нажимайте на клавиши мышкой или пальцем. Если вести по клавишам не отпуская — получится глиссандо.', 'Чем ниже на клавише нажатие, тем громче звук.', 'Кнопки «Октава» сдвигают клавиатуру выше или ниже.'],
    strings: ['Нажмите на лад — прозвучит нота на этой струне. Самая тонкая струна сверху, как в табулатуре.', 'Выберите аккорд кнопкой под грифом и проведите пальцем по струнам в правой части — это бой.', 'Кнопка аккорда сразу проигрывает его целиком.'],
    bowed: ['Нажмите и держите место на грифе — смычок тянет ноту, пока вы держите.', 'Ведите пальцем вдоль струны — нота плавно сменится, как при игре легато.', 'Можно держать несколько струн сразу.'],
    pads: ['Бейте по пэдам пальцами или мышкой — можно несколькими пальцами одновременно.', 'Удар ближе к центру пэда звучит громче.', 'Расположение пэдов совпадает с рядами клавиатуры компьютера.'],
    kit: ['Бейте прямо по барабанам и тарелкам — можно несколькими пальцами сразу.', 'Удар по краю малого барабана — это удар по ободу, в середину райда — «колокол».', 'Хай-хэт можно открыть переключателем на панели или клавишей S. Педали внизу тоже нажимаются.', 'Переключатель «Звук» меняет набор: настоящая акустика, драм-машина TR-808 или LinnDrum из 80-х.'],
    bars: ['Ударяйте по пластинам. Если провести по ним — получится глиссандо, как палочкой по ксилофону.', 'Верхний ряд — диезы и бемоли, нижний — основные ноты.'],
    kalimba: ['Касайтесь язычков: самый длинный и низкий в центре, ноты расходятся влево и вправо.', 'Проведите по нескольким язычкам — получится перебор.'],
    harp: ['Проведите пальцем или мышкой поперёк струн — они зазвучат по очереди, как настоящая арфа.', 'Можно щипать и отдельные струны.'],
    circle: ['Касайтесь тон-полей ладонью или пальцем.', 'Можно играть несколькими пальцами сразу и проводить по полям.'],
    xy: ['Зажмите поле и ведите: влево-вправо — высота, вверх-вниз — громкость.', 'Режимы «По нотам», «Мажор» и «Пентатоника» помогают попадать в ноты.', 'Можно играть несколькими пальцами сразу.'],
    beat: ['Нажимайте клетки, чтобы поставить удар. Проведите по ряду, чтобы заполнить несколько клеток сразу.', 'Выберите готовый ритм в списке и меняйте его под себя.', 'Ритм сохраняется в этом браузере.'],
  };

  function openHelp() {
    if (!current) return;
    const kind = current.layoutName === 'strings' && current.inst.bowed ? 'bowed' : current.layoutName;
    const hints = [...current.hints.querySelectorAll('.hint:not(.tip)')].map((el) => el.cloneNode(true));
    sheet('Как играть: ' + current.inst.name, h('div.help', null,
      h('ul', null, HOW[kind].map((t) => h('li', null, t))),
      hints.length ? h('h3', null, 'Клавиатура компьютера') : null,
      hints.length ? h('div.help-keys', null, hints) : null,
      hints.length ? h('p.note', null, 'Клавиши работают в любой раскладке — и в русской, и в английской.') : null,
      canLearn() ? h('h3', null, 'Разучить мелодию') : null,
      canLearn() ? h('p', null, 'Нажмите «Разучить мелодию» и выберите песню. Нужная нота будет мигать — нажимайте её, и мелодия пойдёт дальше. Кнопка «Послушать, как звучит» сыграет песню целиком.') : null,
      h('h3', null, 'MIDI-клавиатура'),
      h('p', null, 'Подключите MIDI-клавиатуру к компьютеру и включите её в настройках — играть можно на любом инструменте.')));
  }

  /* ---------- Настройки ---------- */

  let midiAccess = null;
  let midiStatus = 'Не подключена';

  function openSettings() {
    const status = h('p.note', null, midiStatus);
    const midiBtn = h('button.btn', { type: 'button' }, App.icon('midi'), 'Подключить MIDI');
    midiBtn.addEventListener('click', () => connectMidi(status));

    const refresh = () => {
      if (current && current.layout) current.layout.refresh();
    };

    const content = h('div.settings', null,
      h('div.field-row', null,
        App.ui.slider('Громкость', 0, 1, 0.01, settings.volume, (v) => {
          settings.volume = v;
          App.audio.setVolume(v);
          save();
        }, (v) => Math.round(v * 100)).el),
      h('div.field-row', null,
        App.ui.slider('Эхо зала', 0, 1, 0.01, settings.reverb, (v) => {
          settings.reverb = v;
          App.audio.setReverb(v);
          save();
        }, (v) => Math.round(v * 100)).el),
      h('div.field-row', null, h('span.field-label', null, 'Подписи нот'),
        App.ui.segmented([['ru', 'До Ре Ми'], ['latin', 'C D E'], ['none', 'Без подписей']], settings.labels, (v) => {
          settings.labels = v;
          save();
          refresh();
        }, 'Подписи нот').el),
      coarse ? null : h('div.field-row', null, h('span.field-label', null, 'Подсказки клавиш'),
        App.ui.segmented([[true, 'Показывать'], [false, 'Скрыть']], settings.keyHints, (v) => {
          settings.keyHints = v;
          save();
          refresh();
        }, 'Подсказки клавиш').el),
      h('div.field-row', null, h('span.field-label', null, 'Звук'),
        App.ui.segmented([['samples', 'Живые записи'], ['synth', 'Синтезатор']], settings.source, (v) => {
          if (v !== settings.source) toggleSource();
        }, 'Источник звука').el,
        h('p.note', null, 'Живые записи подгружаются из интернета. Синтезатор работает всегда, даже без сети.')),
      h('div.field-row', null, h('span.field-label', null, 'Оформление'),
        App.ui.segmented([['auto', 'Как в системе'], ['dark', 'Тёмное'], ['light', 'Светлое']], settings.theme, (v) => {
          settings.theme = v;
          save();
          applyTheme();
        }, 'Оформление').el),
      h('div.field-row', null, h('span.field-label', null, 'MIDI-клавиатура'), midiBtn, status),
      current ? h('div.field-row.narrow-only', null,
        h('button.btn', { type: 'button', onClick: () => { closeDialogs(); openRecordings(); } }, App.icon('tape'), 'Мои записи'),
        h('button.btn', { type: 'button', onClick: () => { closeDialogs(); openHelp(); } }, App.icon('help'), 'Как играть'),
        h('button.btn', { type: 'button', onClick: () => { closeDialogs(); toggleFullscreen(); } }, App.icon('fullscreen'), 'Во весь экран')) : null,
      h('div.field-row', null,
        h('button.btn.ghost', {
          type: 'button',
          onClick: () => {
            if (!confirm('Сбросить настройки, избранное и сохранённые ритмы?')) return;
            try {
              localStorage.removeItem(STORE);
            } catch (e) { /* ignore */ }
            location.reload();
          },
        }, 'Сбросить всё')));
    sheet('Настройки', content);
  }

  function closeDialogs() {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  }

  /* ---------- MIDI ---------- */

  function connectMidi(statusEl) {
    const set = (t) => {
      midiStatus = t;
      if (statusEl) statusEl.textContent = t;
    };
    if (!navigator.requestMIDIAccess) {
      set('Этот браузер не поддерживает MIDI. Подойдут Chrome, Edge или Opera.');
      return;
    }
    navigator.requestMIDIAccess().then((access) => {
      midiAccess = access;
      const bind = () => {
        const names = [];
        access.inputs.forEach((input) => {
          input.onmidimessage = onMidi;
          names.push(input.name);
        });
        set(names.length ? 'Подключено: ' + names.join(', ') : 'Разрешение есть, но клавиатура не найдена. Подключите её — она появится сама.');
      };
      access.onstatechange = bind;
      bind();
    }).catch(() => set('Браузер не дал доступ к MIDI. Разрешите его в настройках сайта.'));
  }

  function onMidi(e) {
    if (!current || !current.layout) return;
    const [st, d1, d2] = e.data;
    const cmd = st & 0xf0;
    App.audio.ensure();
    const L = current.layout;
    if (cmd === 0x90 && d2 > 0) {
      if (L.external) L.external(d1, true, Math.max(0.15, d2 / 127));
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
      if (L.external) L.external(d1, false, 0);
    } else if (cmd === 0xb0 && d1 === 64) {
      setSustain(d2 >= 64);
      if (L.setSustain) L.setSustain(d2 >= 64);
    }
  }

  if (navigator.permissions && navigator.requestMIDIAccess) {
    navigator.permissions.query({ name: 'midi' }).then((p) => {
      if (p.state === 'granted') connectMidi();
    }).catch(() => {});
  }

  /* ---------- Полный экран ---------- */

  function toggleFullscreen() {
    const d = document;
    if (d.fullscreenElement) {
      d.exitFullscreen();
      return;
    }
    const el = d.documentElement;
    if (!el.requestFullscreen) {
      toast('Этот браузер не умеет переходить во весь экран');
      return;
    }
    el.requestFullscreen().then(() => {
      if (coarse && screen.orientation && screen.orientation.lock && current && current.layoutName !== 'pads') {
        screen.orientation.lock('landscape').catch(() => {});
      }
    }).catch(() => {});
  }

  /* ---------- Клавиатура компьютера ---------- */

  const typing = (el) => el && (el.tagName === 'INPUT' && el.type !== 'range' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') closePopover();
    if (modalOpen() || typing(e.target)) return;
    if (!current) {
      if (e.key === '/') {
        const s = document.querySelector('.home .search-input');
        if (s) {
          e.preventDefault();
          s.focus();
        }
        return;
      }
      if (heroKeys && heroKeys.down(e.code, e)) e.preventDefault();
      return;
    }
    App.audio.ensure();
    if (current.layout && current.layout.keydown(e.code, e)) {
      e.preventDefault();
      const a = document.activeElement;
      if (a && a !== document.body && (a.tagName === 'BUTTON' || a.tagName === 'A' || a.type === 'range')) a.blur();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (!current) {
      if (heroKeys) heroKeys.up(e.code);
      return;
    }
    if (current.layout && current.layout.keyup(e.code, e)) e.preventDefault();
    else if (e.code === 'Space' && !typing(e.target) && !modalOpen()) e.preventDefault();
  });

  window.addEventListener('blur', releaseHeld);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseHeld();
  });

  // Браузеры разрешают звук только после первого касания или клавиши.
  const unlock = () => App.audio.ensure();
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);

  route();
})();
