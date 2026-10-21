/* Раскладка «пэды»: барабанная установка и перкуссия. Сетка 4 колонки повторяет ряды клавиатуры. */
(function () {
  const App = window.App;
  const h = App.h;
  App.layouts = App.layouts || {};

  const LEFT = [
    ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV'],
  ];
  const RIGHT = [
    ['Digit7', 'Digit8', 'Digit9', 'Digit0'],
    ['KeyU', 'KeyI', 'KeyO', 'KeyP'],
    ['KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
    ['KeyM', 'Comma', 'Period', 'Slash'],
  ];

  // Цвет по «семейству» звука: тарелки, хэты, томы, малый, бочка, ручная перкуссия.
  const TINT = {
    crash: '#f2cf3a', ride: '#f7b23b', hatOpen: '#8fcf4c', hatClosed: '#3fbf7f', hatPedal: '#2bb3ad',
    tomHigh: '#f5923a', tomMid: '#ef6a3a', tomLow: '#e5484d', snare: '#d65bb5', rim: '#9a5fe0', clap: '#c86de0',
    kick: '#6c68e6',
  };

  // Номера ударных General MIDI → звук (для MIDI-клавиатур и пэдов).
  const GM_DRUMS = {
    35: 'kick', 36: 'kick', 37: 'rim', 38: 'snare', 39: 'clap', 40: 'snare', 41: 'tomLow', 42: 'hatClosed', 43: 'tomLow',
    44: 'hatPedal', 45: 'tomMid', 46: 'hatOpen', 47: 'tomMid', 48: 'tomHigh', 49: 'crash', 50: 'tomHigh', 51: 'ride',
    52: 'crash', 53: 'ride', 54: 'tambourine', 55: 'crash', 56: 'cowbell', 57: 'crash', 59: 'ride', 60: 'bongoHigh',
    61: 'bongoLow', 62: 'congaHigh', 63: 'congaHigh', 64: 'congaLow', 69: 'cabasa', 70: 'shaker', 75: 'claves',
    76: 'woodblock', 77: 'woodblock', 80: 'triangle', 81: 'triangle', 67: 'agogo', 68: 'agogo', 73: 'guiro', 74: 'guiro',
  };

  App.layouts.pads = function (root, ctx) {
    const pads = ctx.inst.pads;
    const rowsUsed = Math.ceil(pads.length / 4);
    const firstRow = 4 - rowsUsed;
    const grid = h('div.pads', { role: 'group', 'aria-label': 'Пэды', style: { '--rows': rowsUsed } });
    root.append(grid);
    const bySound = new Map();
    const codeToPad = {};
    const padKey = []; // клавиша левой руки для каждого пэда — её и подписываем

    const palette = App.notes.colors;
    pads.forEach((p, i) => {
      const r = Math.floor(i / 4);
      const c = i % 4;
      const left = LEFT[firstRow + r] && LEFT[firstRow + r][c];
      const right = RIGHT[firstRow + r] && RIGHT[firstRow + r][c];
      if (left) codeToPad[left] = i;
      if (right) codeToPad[right] = i;
      padKey[i] = left;
      const tint = TINT[p.sound] || palette[(i * 5) % 12];
      const el = h('button.pad', { type: 'button', dataset: { i }, style: { '--c': tint }, 'aria-label': p.name },
        h('span.pad-name', null, p.name));
      grid.append(el);
      bySound.set(p.sound, el);
    });
    if (bySound.has('kick')) codeToPad.Space = pads.findIndex((p) => p.sound === 'kick');

    /** Подписи клавиш на пэдах — заново, когда подсказки включили или выключили. */
    function keyLabels() {
      grid.querySelectorAll('.pad-key').forEach((el) => el.remove());
      if (!ctx.showKeys()) return;
      [...grid.children].forEach((el, i) => {
        const key = padKey[i] && App.keymap.label(padKey[i]);
        if (key) el.append(h('span.pad-key', null, key));
      });
    }
    keyLabels();

    function hit(i, vel) {
      const p = pads[i];
      if (!p) return;
      ctx.drum(p.sound, vel * (p.vel || 1));
      const el = grid.children[i];
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
    }

    App.track(grid, {
      selector: '.pad',
      glide: false,
      down: (el, e) => {
        const r = el.getBoundingClientRect();
        // Удар ближе к центру пэда — громче, как по настоящему пластику.
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const dist = Math.min(1, Math.hypot(dx, dy));
        const pressure = e.pressure && e.pointerType === 'pen' ? e.pressure : null;
        hit(+el.dataset.i, pressure || 1 - dist * 0.35);
        return null;
      },
      up: () => {},
    });

    const K = App.keymap;
    const keysOf = (row) => row.map(K.label).filter(Boolean).join(' ');
    const right = keysOf(RIGHT[firstRow]);
    ctx.setHints(LEFT.slice(firstRow).map((row, r) => [keysOf(row), 'ряд ' + (r + 1)])
      .concat([bySound.has('kick') ? [K.label('Space'), 'бочка'] : null, right ? [right + ' …', 'вторая рука'] : null]));
    ctx.preloadDrums([...new Set(pads.map((p) => p.sound))]);

    function keyActions() {
      const side = (rows) => rows.slice(firstRow).flatMap((row, r) => row.map((code, c) => {
        const p = pads[r * 4 + c];
        return p && { code, label: p.name, color: grid.children[r * 4 + c].style.getPropertyValue('--c') };
      })).filter(Boolean);
      const groups = [{ title: 'Левая рука', items: side(LEFT) }, { title: 'Правая рука', items: side(RIGHT) }];
      if (bySound.has('kick')) groups.push({ title: 'Ещё', items: [{ code: 'Space', label: 'Бочка' }] });
      return groups;
    }

    return {
      keydown(code, e) {
        const i = codeToPad[code];
        if (i == null) return false;
        if (!e.repeat) hit(i, App.keyVel(e, 0.9));
        return true;
      },
      keyup: (code) => codeToPad[code] != null,
      external(midi, on, vel) {
        if (!on) return;
        const sounds = App.drumkit.sounds;
        const exact = Object.keys(sounds).find((s) => sounds[s].gm === midi);
        // Сначала сам звук, потом похожий (бочка 35 — тоже бочка, малый 40 — тоже малый).
        const i = [exact, GM_DRUMS[midi]].map((s) => pads.findIndex((p) => p.sound === s)).find((x) => x >= 0);
        if (i != null) hit(i, vel);
        // Звука нет на пэдах, но он есть в наборе записей — играем его, а не случайный пэд.
        else if (exact && ctx.inst.kit) ctx.drum(exact, vel);
        else hit(midi % pads.length, vel);
      },
      releaseAll() {},
      refresh: keyLabels,
      keyActions,
      destroy() {},
    };
  };
})();
