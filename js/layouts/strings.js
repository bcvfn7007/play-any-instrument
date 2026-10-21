/* Раскладка «гриф»: лады, аккорды и зона боя для гитар; без ладов и с удержанием для смычковых. */
(function () {
  const App = window.App;
  const h = App.h;
  const N = App.notes;
  App.layouts = App.layouts || {};

  const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
  const CHORD_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];

  function chordList(inst, tuning) {
    if (!inst.chords) return [];
    if (inst.chords === 'auto') {
      return App.chordShapes.auto
        .map(([name, pcs]) => ({ name, frets: App.findChord(tuning, pcs) }))
        .filter((c) => c.frets);
    }
    return (App.chordShapes[inst.chords] || []).map(([name, frets]) => ({ name, frets }));
  }

  App.layouts.strings = function (root, ctx) {
    const inst = ctx.inst;
    const tuning = inst.tuning.map(App.notes.parse);
    const maxFrets = inst.frets || 12;
    let frets = maxFrets;
    const bowed = !!inst.bowed;
    const chords = chordList(inst, tuning);
    let chord = null;
    let kbBase = 12 * Math.ceil(Math.min(...tuning) / 12);
    const voices = new Array(tuning.length).fill(null);
    const cells = []; // cells[s][f]
    const rows = [];
    const nextMark = App.nextMarker((m) => {
      const pos = position(m);
      return pos ? cells[pos.s][pos.f] : null;
    });

    root.classList.add(bowed ? 'is-bowed' : 'is-plucked');
    const neck = h('div.neck', { role: 'group', 'aria-label': 'Гриф' });
    const wrap = h('div.neck-wrap', null, neck);
    root.append(wrap);

    const rowsTemplate = `repeat(${tuning.length}, minmax(0, 1fr)) 18px`;
    neck.style.gridTemplateRows = rowsTemplate;

    let strum = null;
    if (!bowed) {
      strum = h('div.strum', { 'aria-label': 'Зона боя: проведите по струнам' });
      wrap.append(strum);
      strum.style.gridTemplateRows = rowsTemplate;
    }

    // На узком экране показываем меньше ладов, чтобы в них было удобно попадать пальцем.
    function fitFrets() {
      const w = wrap.clientWidth || root.clientWidth || 900;
      const free = w - (strum ? Math.min(190, Math.max(90, w * 0.15)) : 0) - 46;
      return Math.max(5, Math.min(maxFrets, Math.floor(free / 34)));
    }

    function build() {
      frets = fitFrets();
      // Колонки: открытая струна + лады, которые постепенно сужаются, как на настоящем грифе.
      const cols = ['minmax(40px, 7%)'];
      for (let f = 1; f <= frets; f++) cols.push(Math.pow(2, -(f - 1) / 22).toFixed(3) + 'fr');
      neck.style.gridTemplateColumns = cols.join(' ');
      neck.textContent = '';
      if (strum) strum.textContent = '';
      cells.length = 0;
      rows.length = 0;
      // Сверху — самая тонкая струна, как в табулатуре.
      for (let s = 0; s < tuning.length; s++) {
        const row = tuning.length - s;
        cells[s] = [];
        const thick = 1 + (1 - s / Math.max(1, tuning.length - 1)) * 2.2;
        for (let f = 0; f <= frets; f++) {
          const midi = tuning[s] + f;
          const cell = h('div.cell' + (f === 0 ? '.open' : ''), {
            dataset: { s, f },
            style: { gridRow: row, gridColumn: f + 1, '--c': N.color(midi), '--thick': thick + 'px' },
            role: 'button',
            'aria-label': N.name(midi, 'ru', true),
          }, h('span.cell-name', null, ctx.label(midi, f === 0)));
          neck.append(cell);
          cells[s][f] = cell;
        }
        if (strum) {
          const line = h('div.strum-string', { style: { gridRow: row, '--thick': thick + 'px' } });
          strum.append(line);
          rows[s] = line;
        }
      }
      const span = `1 / ${tuning.length + 1}`;
      INLAYS.filter((f) => f <= frets).forEach((f) => neck.append(h('div.inlay', { style: { gridColumn: f + 1, gridRow: span } })));
      if (frets >= 12) neck.append(h('div.inlay.double', { style: { gridColumn: 13, gridRow: span } }));
      for (let f = 1; f <= frets; f++) {
        neck.append(h('div.fret-num', { style: { gridColumn: f + 1, gridRow: tuning.length + 1 } }, f));
      }
      showChord();
      nextMark.apply();
      ctx.viewChanged();
    }

    /* ---------- Звук ---------- */

    function play(s, f, vel, delay) {
      const midi = tuning[s] + f;
      if (voices[s]) ctx.kill(voices[s], delay);
      const v = ctx.noteOn(midi, vel, { delay });
      voices[s] = v;
      const cell = cells[s][f];
      const fire = () => {
        flash(cell);
        if (rows[s]) flash(rows[s]);
      };
      if (delay) setTimeout(fire, delay * 1000);
      else fire();
      return { s, f, v };
    }

    function flash(el) {
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
    }

    function release(pr) {
      if (!pr) return;
      // Гриф могли перестроить, пока лад держали (сменилась ширина) — такой клетки уже может не быть.
      const cell = cells[pr.s] && cells[pr.s][pr.f];
      if (cell) cell.classList.remove('on');
      if (bowed) {
        ctx.noteOff(pr.v);
        if (voices[pr.s] === pr.v) voices[pr.s] = null;
      }
    }

    const fretFor = (s) => (chord ? chord.frets[s] : 0);

    function strumChord(up, vel) {
      const order = tuning.map((_, i) => i);
      if (up) order.reverse();
      let k = 0;
      order.forEach((s) => {
        const f = fretFor(s);
        if (f < 0) return;
        play(s, f, (vel || 0.85) * (up ? 0.85 : 1), k * 0.014);
        k++;
      });
    }

    /* ---------- Аккорды ---------- */

    let chordBar = null;
    const chordButtons = [];
    if (chords.length) {
      chordBar = h('div.chords', { role: 'group', 'aria-label': 'Аккорды' });
      const none = h('button.chord', { type: 'button', 'aria-pressed': 'true', title: 'Открытые струны' }, 'Открытые');
      none.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        App.audio.ensure();
        selectChord(null);
        strumChord(false);
      });
      chordBar.append(none);
      chordButtons.push(none);
      chords.forEach((c, i) => {
        const b = h('button.chord', { type: 'button', 'aria-pressed': 'false', title: 'Аккорд ' + c.name }, h('b', null, c.name));
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          App.audio.ensure();
          selectChord(c);
          strumChord(false);
        });
        chordBar.append(b);
        chordButtons.push(b);
      });
      root.append(chordBar);
      chordKeys();
    }

    /** Подписи клавиш на кнопках аккордов — заново, когда подсказки включили или выключили. */
    function chordKeys() {
      chordButtons.slice(1).forEach((b, i) => {
        const old = b.querySelector('small');
        if (old) old.remove();
        const key = ctx.showKeys() && CHORD_KEYS[i] ? App.keymap.label(CHORD_KEYS[i]) : '';
        if (key) b.append(h('small', null, key));
      });
    }

    function selectChord(c) {
      chord = c;
      chordButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === 0 ? !c : chords[i - 1] === c)));
      showChord();
    }

    function showChord() {
      cells.forEach((row, s) => row.forEach((cell, f) => {
        cell.classList.toggle('in-chord', !!chord && chord.frets[s] === f);
        cell.classList.toggle('muted', !!chord && chord.frets[s] < 0 && f === 0);
      }));
    }

    /* ---------- Ввод ---------- */

    const tracker = App.track(neck, {
      selector: '.cell',
      glide: true,
      down: (el) => {
        const s = +el.dataset.s;
        const f = +el.dataset.f;
        el.classList.add('on');
        return play(s, f, 0.85, 0);
      },
      up: (pr) => release(pr),
    });

    if (strum) {
      App.trackSweep(strum, {
        axis: 'y',
        positions: () => rows.map((r) => {
          const b = r.getBoundingClientRect();
          return b.top + b.height / 2;
        }),
        hit: (s, vel) => {
          const f = fretFor(s);
          if (f >= 0) play(s, f, vel, 0);
        },
      });
    }

    // Ноту с клавиатуры ставим на струну, где она берётся ближе всего к порожку.
    function position(midi) {
      let best = null;
      tuning.forEach((t, s) => {
        const f = midi - t;
        if (f < 0 || f > frets) return;
        if (!best || f < best.f) best = { s, f };
      });
      return best;
    }

    const keys = App.keyHolder(
      (code, e) => {
        if (chords.length && code.startsWith('Digit')) return undefined;
        const off = App.keymap.chromatic[code];
        if (off == null) return undefined;
        const pos = position(kbBase + off);
        if (!pos) return null;
        cells[pos.s][pos.f].classList.add('on');
        return play(pos.s, pos.f, App.keyVel(e, 0.85), 0);
      },
      (pr) => release(pr)
    );

    const external = new Map();

    const K = App.keymap;
    const space = K.label('Space');
    ctx.setHints([
      chords.length ? [K.span(CHORD_KEYS.slice(0, chords.length)), 'аккорды'] : null,
      chords.length && space ? [space, 'бой вниз'] : null,
      chords.length && space ? ['Shift + ' + space, 'бой вверх'] : null,
      [[K.span(K.chromaticLow.slice(0, 12)), K.span(K.chromaticHigh.slice(0, 17))].filter(Boolean).join(', '), 'отдельные ноты'],
      [K.span(['ArrowLeft', 'ArrowRight']), 'октава клавиатуры'],
    ]);

    function keyActions() {
      const groups = [];
      if (chords.length) {
        groups.push({ title: 'Аккорды', items: chords.slice(0, CHORD_KEYS.length).map((c, i) => ({ code: CHORD_KEYS[i], label: 'Аккорд ' + c.name })) });
      }
      if (!bowed) groups.push({ title: 'Бой', items: [{ code: 'Space', label: 'Бой по струнам (с Shift — вверх)' }] });
      K.chromaticActions(kbBase, ctx.noteName, (m) => !!position(m)).forEach((g) => {
        const items = chords.length ? g.items.filter((it) => !it.code.startsWith('Digit')) : g.items;
        if (items.length) groups.push({ title: 'Ноты: ' + g.title.toLowerCase(), items });
      });
      groups.push({ title: 'Управление', items: [{ code: 'ArrowLeft', label: 'Клавиатура на октаву ниже' }, { code: 'ArrowRight', label: 'Клавиатура на октаву выше' }] });
      return groups;
    }

    build();
    const ro = new ResizeObserver(() => {
      if (fitFrets() !== frets) build();
    });
    ro.observe(wrap);
    const all = [];
    tuning.forEach((t) => {
      for (let f = 0; f <= maxFrets; f++) all.push(t + f);
    });
    ctx.preload([...new Set(all)].sort((a, b) => a - b));
    if (inst.voice) App.synth.warm(inst.voice, tuning.concat(tuning.map((t) => t + 2), tuning.map((t) => t + 3)), inst.voiceOpts);

    return {
      keydown(code, e) {
        if (code === 'ArrowLeft' || code === 'ArrowRight') {
          kbBase = Math.max(12, Math.min(96, kbBase + (code === 'ArrowLeft' ? -12 : 12)));
          ctx.toast('Клавиатура: от ' + N.name(kbBase, ctx.labelMode() === 'latin' ? 'latin' : 'ru', true));
          return true;
        }
        if (chords.length) {
          const i = CHORD_KEYS.indexOf(code);
          if (i >= 0 && chords[i]) {
            if (e.repeat) return true;
            selectChord(chords[i]);
            strumChord(e.shiftKey, App.keyVel(e, 0.85));
            return true;
          }
        }
        // У смычковых боя нет: ноты держатся, пока их не отпустят, и пробел оставлял бы их звучать.
        if (code === 'Space' && !bowed) {
          if (!e.repeat) strumChord(e.shiftKey, App.keyVel(e, 0.85));
          return true;
        }
        return keys.down(code, e);
      },
      keyup: (code) => keys.up(code),
      external(midi, on, vel) {
        if (on) {
          const pos = position(midi);
          if (!pos) return;
          release(external.get(midi)); // та же нота пришла ещё раз, не отпущенная
          cells[pos.s][pos.f].classList.add('on');
          external.set(midi, play(pos.s, pos.f, vel, 0));
        } else {
          release(external.get(midi));
          external.delete(midi);
        }
      },
      releaseAll() {
        keys.releaseAll();
        tracker.releaseAll();
      },
      refresh() {
        build();
        chordKeys();
      },
      keyActions,
      highlightNext: (m) => nextMark.set(m),
      playable() {
        const all = new Set();
        tuning.forEach((t) => {
          for (let f = 0; f <= frets; f++) all.add(t + f);
        });
        return [...all];
      },
      destroy() {
        ro.disconnect();
        keys.releaseAll();
        tracker.releaseAll();
      },
    };
  };
})();
