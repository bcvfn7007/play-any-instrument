/* Приложение: главная, экран игры, панели, запись, метроном и настройки. */
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
    keys: {}, // раскладка → свои клавиши {настоящая клавиша: клавиша по умолчанию | null}
    net: { nick: '', auto: false, volume: 0.9 },
    live: { midiOff: [], drumChannel: true, micMode: 'tuner', gate: -50, monitor: false, deviceId: '' },
    learn: { speed: 1, acc: true, accVolume: 0.8 },
  };

  const settings = (App.settings = load());

  function load() {
    const base = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
      const nested = {};
      ['synth', 'net', 'live', 'learn'].forEach((k) => (nested[k] = Object.assign(base[k], saved[k])));
      return Object.assign(base, saved, nested);
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
      App.online.rehome();
      if (opts && opts.onClose) opts.onClose();
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
    document.body.append(dlg);
    dlg.showModal();
    App.online.rehome(); // запрос «пустить?» должен оставаться нажимаемым
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

    const together = h('button.btn.net-home', { type: 'button', title: 'Играть вместе с друзьями по нику', onClick: () => App.online.open() },
      App.icon('users'), h('span.btn-label', null, 'Играть вместе'), h('span.badge', { hidden: true }));
    app.append(h('div.home', null,
      h('header.site-head', null,
        h('a.wordmark', { href: '#/' }, wordmark()),
        h('div.head-actions', null,
          together,
          iconButton('plug', 'Подключить настоящий инструмент: MIDI или микрофон', () => App.live.open(), 'live-btn'),
          iconButton('settings', 'Настройки', () => openSettings()))),
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
    updateNetButtons();
    App.live.decorate();
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

  // Откуда пришла нота, которую сейчас играет раскладка: 'mic' | 'midi' | null (руками).
  let inputFrom = null;
  // «Без звука»: ноту с микрофона засчитываем и подсвечиваем, но не озвучиваем.
  let quiet = false;
  const silentVoice = () => ({ silent: true, sustain: true, endTime: 0, stop() {}, kill() {} });

  function voiceFor(inst, b, midi, vel, t) {
    let v = null;
    if (useSamples(inst)) v = App.sampler.play(inst, midi, vel, b.sample.input, t);
    if (!v) v = App.synth.play(inst.voice || 'piano', midi, vel, b.synth.input, t, voiceOpts(inst));
    return App.audio.track(v);
  }

  function sound(midi, vel, extra) {
    const ac = App.audio.ensure();
    if (quiet) return silentVoice();
    return voiceFor(current.inst, buses(), midi, vel, ac.currentTime + ((extra && extra.delay) || 0));
  }

  /** Нота, сыгранная человеком (пальцем, мышью, клавиатурой, MIDI или микрофоном). */
  function noteOn(midi, vel, extra) {
    const v = sound(midi, vel, extra);
    // Аккорд одной клавишей — это аккомпанемент себе: в «Разучить мелодию» он не ошибка.
    if (!(extra && extra.chord)) App.learn.heard(midi, inputFrom);
    App.online.note(v, current.inst, midi, vel, (extra && extra.delay) || 0);
    return v;
  }

  function releaseVoice(v, inst) {
    if (!v.sustain) {
      v.sustain = true;
      v.release = inst ? inst.release || 0.15 : 0.15;
    }
    v.stop(App.audio.ctx.currentTime);
  }

  function release(v) {
    App.online.off(v);
    releaseVoice(v, current && current.inst);
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
    if (!v) return;
    App.online.kill(v, delay || 0);
    v.kill(App.audio.ctx.currentTime + (delay || 0));
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
    App.online.drum(current.inst, kit, sound, vel, Math.max(0, t - ac.currentTime));
    return App.audio.track(v);
  }

  /** Удар с электронных барабанов (10-й MIDI-канал), когда открыт не барабанный инструмент. */
  function drumGM(note, vel) {
    if (!current) return false;
    const sounds = App.drumkit.sounds;
    const sound = Object.keys(sounds).find((s) => sounds[s].gm === note);
    if (!sound) return false;
    const ac = App.audio.ensure();
    const kit = currentKit() || 'acoustic';
    const b = { synth: App.audio.bus('edrums:synth', { reverb: 0.5 }), sample: App.audio.bus('edrums:sample', { reverb: 0.5 }) };
    let v = null;
    if (settings.source === 'samples') v = App.drumkit.play(kit, sound, vel, b.sample.input, ac.currentTime);
    if (!v) v = App.synth.drum(App.drumkit.fallback(sound), vel, b.synth.input, ac.currentTime);
    App.audio.track(v);
    App.online.drum(current.inst, kit, sound, vel, 0);
    return true;
  }

  function kitSwitch(inst) {
    return h('div.deck-group', null,
      h('span.deck-label', null, 'Звук'),
      App.ui.segmented(inst.kits.map((k) => [k, App.drumkit.kits[k].name]), currentKit(), (v) => {
        settings.drumKit[inst.id] = v;
        save();
        App.online.setInstrument(inst, v);
        if (settings.source === 'samples') App.drumkit.preload(v, current.drumList);
        updateSource();
      }, 'Набор звуков').el);
  }

  function continuous(f) {
    App.audio.ensure();
    const v = App.audio.track(App.synth.continuous(buses().synth.input, f));
    return App.online.continuous(v, current.inst, f);
  }

  /* ---------- Ноты извне: MIDI, микрофон, MIDI-пэды на своих клавишах ---------- */

  /** Нота с MIDI-инструмента или микрофона → текущая раскладка. from: 'midi' | 'mic'. */
  function external(midi, on, vel, from, silent) {
    if (!current || !current.layout || !current.layout.external) return false;
    App.audio.ensure();
    inputFrom = from || null;
    quiet = !!silent;
    try {
      current.layout.external(midi, on, vel);
    } finally {
      inputFrom = null;
      quiet = false;
    }
    return true;
  }

  /** Нажать «клавишу по умолчанию» code — так MIDI-пэд, назначенный на клавишу, бьёт по барабану. */
  function keyAction(code, down, vel) {
    if (!current || !current.layout || !code) return false;
    App.audio.ensure();
    const e = { code, repeat: false, shiftKey: false, velocity: vel };
    return down ? current.layout.keydown(code, e) : current.layout.keyup(code, e);
  }

  function pedal(on) {
    setSustain(on);
    if (current && current.layout && current.layout.setSustain) current.layout.setSustain(on);
  }

  /* ---------- Звук «со стороны»: друзья по сети и аккомпанемент песни ---------- */

  /**
   * Свой набор шин для любого инструмента и общая громкость: так ноты друга или партия
   * аккомпанемента звучат своим инструментом, не мешая вашему.
   */
  function makeEngine(prefix, volume) {
    const all = new Map();
    const level = (b) => {
      const v = volume();
      b.synth.input.gain.value = b.level * v;
      b.sample.input.gain.value = v;
    };
    const busesOf = (inst) => {
      let b = all.get(inst.id);
      if (!b) {
        b = {
          level: inst.level || 1,
          synth: App.audio.bus(prefix + ':' + inst.id + ':synth', { fx: inst.fx, reverb: inst.reverb, level: inst.level }),
          sample: App.audio.bus(prefix + ':' + inst.id + ':sample', { reverb: inst.reverb }),
        };
        all.set(inst.id, b);
        level(b);
      }
      return b;
    };
    return {
      note(inst, midi, vel, delay) {
        const ac = App.audio.ensure();
        return voiceFor(inst, busesOf(inst), midi, vel, ac.currentTime + delay);
      },
      /** Нота в точное время at (по часам звука) длительностью dur секунд. */
      play(inst, midi, vel, at, dur) {
        App.audio.ensure();
        const v = voiceFor(inst, busesOf(inst), midi, vel, at);
        if (dur) {
          v.sustain = true;
          v.release = Math.min(0.3, inst.release || 0.12);
          v.stop(at + dur);
        }
        return v;
      },
      release(v, inst) {
        if (inst.mode === 'sustain') releaseVoice(v, inst);
      },
      kill(v, delay) {
        v.kill(App.audio.ensure().currentTime + delay);
      },
      drum(inst, kit, sound, vel, delay) {
        const ac = App.audio.ensure();
        const t = ac.currentTime + Math.max(0, delay);
        const b = busesOf(inst);
        let v = null;
        if (kit && App.drumkit.kits[kit] && settings.source === 'samples') v = App.drumkit.play(kit, sound, vel, b.sample.input, t);
        if (!v) v = App.synth.drum(App.drumkit.fallback(sound), vel, b.synth.input, t);
        return App.audio.track(v);
      },
      continuous(inst, f) {
        App.audio.ensure();
        return App.audio.track(App.synth.continuous(busesOf(inst).synth.input, f));
      },
      /** Заранее подгружаем записи инструмента. */
      preload(inst, kit) {
        if (settings.source !== 'samples') return;
        if (inst.gm) {
          const from = (inst.start || 48) - 5;
          App.sampler.preload(inst.gm, Array.from({ length: 36 }, (_, i) => from + i));
        }
        if (kit && App.drumkit.kits[kit]) App.drumkit.preload(kit, ['kick', 'snare', 'rim', 'hatClosed', 'hatOpen', 'tomHigh', 'tomMid', 'tomLow', 'crash', 'ride', 'clap']);
      },
      refresh: () => all.forEach(level),
    };
  }

  const remote = makeEngine('net', () => settings.net.volume);
  remote.setVolume = (v) => {
    settings.net.volume = v;
    save();
    remote.refresh();
  };
  const band = makeEngine('acc', () => settings.learn.accVolume);

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
    const band = h('div.band', { hidden: true, role: 'status', 'aria-label': 'Кто играет вместе с вами' });
    const deck = h('div.deck', { role: 'toolbar', 'aria-label': 'Настройки инструмента' });
    const learnBar = h('section.learn', { hidden: true, 'aria-label': 'Разучивание мелодии' });
    const stage = h('main.stage');
    const hints = h('footer.hints', { 'aria-label': 'Подсказки' });
    const page = h('div.play', { style: { '--fam': hueOf(inst) } }, bar.el, band, deck, learnBar, stage, hints);
    app.append(page);
    current = { inst, layoutName, page, bar, band, deck, stage, hints, layout: null, preloadList: [], drumList: [], buses: null };
    App.learn.mount(learnBar);
    mountLayout();
    App.online.renderBand(band);
    App.online.setInstrument(inst, currentKit());
    updateNetButtons();
    App.live.decorate();
    window.scrollTo(0, 0);
  }

  function teardownPlay() {
    if (!current) return;
    App.learn.stop();
    releaseHeld();
    if (current.layout) current.layout.destroy();
    App.keymap.use(null);
    closePopover();
    current = null;
    App.online.setInstrument(null, null);
  }

  /** Свои клавиши хранятся отдельно для каждого вида раскладки (у стил-драма — свои). */
  const schemeOf = (c) => (c.layoutName === 'circle' && c.inst.style === 'steelpan' ? 'steelpan' : c.layoutName);

  function mountLayout() {
    const c = current;
    if (c.layout) {
      releaseHeld();
      c.layout.destroy();
      c.layout = null; // пока строится новая раскладка, старой уже нет
    }
    App.learn.pause();
    c.deck.textContent = '';
    c.stage.textContent = '';
    c.hints.textContent = '';
    c.page.dataset.layout = c.layoutName;
    c.stage.className = 'stage layout-' + c.layoutName + (c.inst.style ? ' style-' + c.inst.style : '');
    if (c.inst.alt) c.deck.append(layoutSwitch(c.inst));
    if (c.inst.kits) c.deck.append(kitSwitch(c.inst));
    App.keymap.use(settings.keys[schemeOf(c)]);
    const factory = App.layouts[c.layoutName];
    c.layout = factory(c.stage, makeCtx(c));
    if (c.layout.keyActions && !coarse) {
      c.hints.append(h('button.hint-edit', { type: 'button', title: 'Назначить свои клавиши для этого инструмента', onClick: () => App.keybind.open() },
        App.icon('keyboard'), 'Свои клавиши'));
      c.hints.hidden = false;
    }
    if (c.inst.editable) c.deck.append(synthEditor());
    // Разучивать можно там, где у каждой ноты своё место: не на барабанах, драм-машине и терменвоксе.
    if (c.layout.highlightNext) {
      c.deck.append(h('button.btn.learn-btn', { type: 'button', title: 'Выбрать песню и сыграть её по подсказкам', onClick: () => App.learn.open() },
        App.icon('note'), 'Разучить мелодию'));
    }
    if (['keys', 'strings', 'bars', 'beat', 'harp', 'kit'].includes(c.layoutName)) {
      c.deck.append(h('span.rotate-tip', null, 'Поверните телефон боком'));
    }
    c.deck.hidden = !c.deck.children.length;
    updateSource();
    App.learn.attach();
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
      /** Название ноты с октавой — даже если подписи на инструменте выключены. */
      noteName: (m) => N.name(m, settings.labels === 'latin' ? 'latin' : 'ru', true),
      showKeys: () => settings.keyHints && !coarse,
      getState: (k, d) => (st[k] !== undefined ? st[k] : d),
      setState(k, v) {
        st[k] = v;
        save();
      },
      setHints: (items) => renderHints(c.hints, items),
      /** Раскладка перерисовалась: сменилась октава или ширина. */
      viewChanged: () => App.learn.viewChanged(),
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
    const edit = el.querySelector('.hint-edit'); // кнопка «Свои клавиши» остаётся, даже если подсказки сменились
    el.textContent = '';
    // Пустая строка вместо клавиш — все клавиши этой подсказки отключены: не показываем её.
    items.filter((it) => it && it[0] !== '').forEach(([keys, text]) => {
      el.append(h('span.hint' + (keys ? '' : '.tip'), null, keys ? h('kbd', null, keys) : null, text));
    });
    if (edit) el.append(edit);
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

  /* ---------- Разучивание мелодий — в learn.js, свои мелодии — в mysongs.js ---------- */

  function plural(n, one, few, many) {
    const a = n % 10;
    const b = n % 100;
    return n + ' ' + (a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many);
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

    const together = iconButton('users', 'Играть вместе', () => App.online.open(), 'net-btn');
    together.append(h('span.badge', { hidden: true }));

    const el = h('header.topbar', null,
      back, title,
      h('div.bar-gap'),
      source,
      vol.el,
      metro,
      rec,
      takesBtn,
      together,
      iconButton('plug', 'Настоящий инструмент: MIDI или микрофон', () => App.live.open(), 'live-btn wide-only'),
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

  // Аккорды одной клавишей есть у всех клавишных, кроме литавр.
  const CHORDS_TIP = 'Кнопка «Аккорды» на панели: цифры 1 … = или кнопки под клавиатурой играют целый аккорд одним нажатием, а буквами можно вести мелодию. Так хватает двух клавиш сразу — обычная клавиатура компьютера больше 2–4 клавиш одновременно часто не берёт.';

  function openHelp() {
    if (!current) return;
    const kind = current.layoutName === 'strings' && current.inst.bowed ? 'bowed' : current.layoutName;
    const how = HOW[kind].concat(kind === 'keys' && current.inst.family !== 'drums' ? [CHORDS_TIP] : []);
    const hints = [...current.hints.querySelectorAll('.hint:not(.tip)')].map((el) => el.cloneNode(true));
    sheet('Как играть: ' + current.inst.name, h('div.help', null,
      h('ul', null, how.map((t) => h('li', null, t))),
      hints.length ? h('h3', null, 'Клавиатура компьютера') : null,
      hints.length ? h('div.help-keys', null, hints) : null,
      hints.length ? h('p.note', null, 'Клавиши работают в любой раскладке — и в русской, и в английской.') : null,
      current.layout.keyActions ? h('button.btn', { type: 'button', onClick: () => App.keybind.open() }, App.icon('keyboard'), 'Назначить свои клавиши') : null,
      App.learn.can() ? h('h3', null, 'Разучить мелодию') : null,
      App.learn.can() ? h('p', null, 'Нажмите «Разучить мелодию» и выберите песню. Нужная нота будет мигать — нажимайте её, и мелодия пойдёт дальше. Кнопка «Послушать, как звучит» сыграет песню, «Темп» замедлит её, а «Повтор куска» поможет выучить трудное место. Можно добавить свою мелодию из интернета (MIDI, ноты MusicXML, запись голоса) и играть на настоящем инструменте через микрофон.') : null,
      h('h3', null, 'Настоящие инструменты'),
      h('p', null, 'MIDI-клавиатура, электронные барабаны или MIDI-гитара подключаются по USB. Обычную гитару, скрипку, флейту или голос сайт слышит через микрофон.'),
      h('button.btn', { type: 'button', onClick: () => App.live.open() }, App.icon('plug'), 'Подключить инструмент'),
      h('h3', null, 'Играть вместе'),
      h('p', null, 'Придумайте ник — друг подключится к вам по нему, и вы услышите друг друга. Регистрация не нужна.'),
      h('button.btn', { type: 'button', onClick: () => App.online.open() }, App.icon('users'), 'Играть вместе')));
  }

  /* ---------- Настройки ---------- */

  function openSettings() {
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
      h('div.field-row', null, h('span.field-label', null, 'Настоящие инструменты'),
        h('button.btn', { type: 'button', onClick: () => { closeDialogs(); App.live.open(); } }, App.icon('plug'), 'MIDI и микрофон'),
        h('p.note', null, App.live.summary())),
      h('div.field-row', null, h('span.field-label', null, 'Играть вместе'),
        h('button.btn', { type: 'button', onClick: () => { closeDialogs(); App.online.open(); } }, App.icon('users'), 'По нику, без регистрации'),
        h('p.note', null, App.online.summary())),
      current && current.layout && current.layout.keyActions ? h('div.field-row', null, h('span.field-label', null, 'Клавиши'),
        h('button.btn', { type: 'button', onClick: () => { closeDialogs(); App.keybind.open(); } }, App.icon('keyboard'), 'Назначить свои клавиши'),
        h('p.note', null, 'Для инструментов с раскладкой «' + App.layoutNames[current.layoutName] + '». Можно назначить и пэды MIDI-барабанов.')) : null,
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

  /* ---------- Кнопки «Играть вместе» ---------- */

  function updateNetButtons() {
    const s = App.online.status();
    document.querySelectorAll('.net-btn, .net-home').forEach((b) => {
      b.dataset.net = s.state;
      const badge = b.querySelector('.badge');
      badge.hidden = !s.count;
      badge.textContent = s.count;
      const label = s.state === 'online' ? 'В сети как «' + s.nick + '»' + (s.count ? ' · вместе с вами: ' + s.count : '') : 'Играть вместе';
      b.title = label;
      b.setAttribute('aria-label', label);
    });
    if (current && current.band) App.online.renderBand(current.band);
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
    // Своя клавиша работает так же, как клавиша по умолчанию, которую она заменяет.
    const code = App.keymap.virtual(e.code);
    if (code && current.layout && current.layout.keydown(code, e)) {
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
    const code = App.keymap.virtual(e.code);
    if (code && current.layout && current.layout.keyup(code, e)) e.preventDefault();
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

  /* ---------- Связь с модулями: свои клавиши, настоящие инструменты, игра вместе ---------- */

  App.shell = {
    settings,
    save,
    toast,
    sheet,
    iconButton,
    closeDialogs,
    plural,
    coarse,
    current: () => current,
    scheme: () => (current ? schemeOf(current) : null),
    isDrums: () => !!current && ['kit', 'pads', 'beat'].includes(current.layoutName),
    /** Раскладку нужно перестроить: сменились свои клавиши. */
    remount() {
      if (current) mountLayout();
    },
    external,
    keyAction,
    drumGM,
    pedal,
    releaseHeld,
    remote,
    band,
    /** Нота текущим инструментом — для «Послушать, как звучит» (не засчитывается и не уходит друзьям). */
    sound: (midi, vel) => sound(midi, vel),
    release,
    netChanged: updateNetButtons,
  };
  App.keybind.init(App.shell);
  App.learn.init(App.shell);
  App.mySongs.init(App.shell);
  App.live.init(App.shell);
  App.online.init(App.shell);

  route();
})();
