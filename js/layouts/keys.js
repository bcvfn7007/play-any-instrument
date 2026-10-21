/* Раскладка «клавиши»: фортепианная клавиатура под ширину экрана. */
(function () {
  const App = window.App;
  const h = App.h;
  const N = App.notes;
  App.layouts = App.layouts || {};

  // Чёрные клавиши стоят не ровно посередине, как на настоящем фортепиано.
  const BLACK_SHIFT = { 1: -0.12, 3: 0.12, 6: -0.14, 8: 0, 10: 0.14 };

  /*
   * Аккорды одной клавишей: цифры (или кнопки под клавиатурой) играют целый аккорд в нижней октаве,
   * а буквы — мелодию. Обычная клавиатура компьютера берёт только 2–4 клавиши сразу — так их хватает.
   * Первые шесть — аккорды до мажора по ступеням (1 — До, 4 — Фа, 5 — Соль), дальше — частые в простых песнях.
   */
  const CHORDS = [
    ['C', 0, 'maj'], ['Dm', 2, 'min'], ['Em', 4, 'min'], ['F', 5, 'maj'], ['G', 7, 'maj'], ['Am', 9, 'min'],
    ['G7', 7, 'dom7'], ['E', 4, 'maj'], ['E7', 4, 'dom7'], ['D', 2, 'maj'], ['A', 9, 'maj'], ['Hm', 11, 'min'],
  ];
  const INTERVALS = { maj: [0, 4, 7], min: [0, 3, 7], dom7: [0, 4, 7, 10] };
  const KIND = { maj: 'мажор', min: 'минор', dom7: 'септаккорд' };
  const CHORD_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];

  App.layouts.keys = function (root, ctx) {
    const inst = ctx.inst;
    let start = 12 * Math.floor(ctx.getState('start', inst.start || 48) / 12);
    let whites = 14;
    let notes = [];
    const elByMidi = new Map();
    // На литаврах аккорды ни к чему — режим только для мелодических инструментов.
    const canChord = inst.family !== 'drums';
    let chordsOn = canChord && !!ctx.getState('chords', false);

    const board = h('div.kb', { role: 'group', 'aria-label': 'Клавиатура' });
    const nowNote = h('span.fall-note');
    const fallboard = h('div.kb-fallboard', { 'aria-hidden': 'true' },
      h('span.fall-name', null, inst.name), nowNote);
    root.append(fallboard, board);

    const basePresser = App.presser(ctx, (m) => elByMidi.get(m));
    const nextMark = App.nextMarker((m) => elByMidi.get(m));
    function showNow(text, color) {
      nowNote.textContent = text;
      nowNote.style.setProperty('--c', color);
      nowNote.classList.remove('hit');
      void nowNote.offsetWidth;
      nowNote.classList.add('hit');
    }
    const presser = Object.assign({}, basePresser, {
      press(midi, vel) {
        showNow(N.name(midi, ctx.labelMode() === 'latin' ? 'latin' : 'ru', true), N.color(midi));
        return basePresser.press(midi, vel);
      },
    });
    presser.external = (midi, on, vel) => {
      if (on) nowNote.textContent = N.name(midi, ctx.labelMode() === 'latin' ? 'latin' : 'ru', true);
      if (on) nowNote.style.setProperty('--c', N.color(midi));
      basePresser.external(midi, on, vel);
    };
    const octave = App.ui.stepper('Октава', (d) => shift(d));
    ctx.deck.append(octave.el);
    let pedal = null;
    if (inst.mode === 'sustain') {
      pedal = App.ui.toggle('Педаль', false, (on) => ctx.setSustain(on), 'Педаль: ноты тянутся после отпускания (держите Пробел)');
      ctx.deck.append(pedal.el);
    }

    /* ---------- Аккорды одной клавишей ---------- */

    const chordBar = h('div.chords', { role: 'group', 'aria-label': 'Аккорды', hidden: !chordsOn });
    const chordButtons = CHORDS.map(([name, rootPc, kind], i) => {
      const b = h('button.chord', { type: 'button', 'aria-pressed': 'false', dataset: { i }, title: N.name(rootPc, 'ru') + ' ' + KIND[kind] }, h('b', null, name));
      chordBar.append(b);
      return b;
    });
    const chordHeld = CHORDS.map(() => 0); // аккорд могут держать сразу клавиша и палец
    if (canChord) {
      const chordToggle = App.ui.toggle('Аккорды', chordsOn, (on) => setChords(on),
        'Аккорд одной клавишей: цифры 1 … = или кнопки под клавиатурой, а буквами — мелодия');
      ctx.deck.append(chordToggle.el);
      root.append(chordBar);
    }

    /** Ноты аккорда в нижней видимой октаве — их и видно подсвеченными на клавиатуре. */
    const chordNotes = ([, rootPc, kind]) => INTERVALS[kind].map((iv) => start + ((rootPc + iv) % 12)).sort((a, b) => a - b);

    function pressChord(i, vel) {
      const c = CHORDS[i];
      showNow(c[0], N.color(c[1]));
      chordHeld[i]++;
      chordButtons[i].setAttribute('aria-pressed', 'true');
      // Аккорд чуть тише мелодии; { chord } — не засчитывать его ноты в «Разучить мелодию».
      return { chord: i, notes: chordNotes(c).map((m) => basePresser.press(m, vel * 0.8, { chord: true })) };
    }

    function releaseChord(pr) {
      if (!pr) return;
      pr.notes.forEach((p) => basePresser.release(p));
      chordHeld[pr.chord] = Math.max(0, chordHeld[pr.chord] - 1);
      if (!chordHeld[pr.chord]) chordButtons[pr.chord].setAttribute('aria-pressed', 'false');
    }

    /** Подписи клавиш на кнопках аккордов — заново, когда подсказки включили или выключили. */
    function chordKeys() {
      chordButtons.forEach((b, i) => {
        const old = b.querySelector('small');
        if (old) old.remove();
        const key = ctx.showKeys() ? App.keymap.label(CHORD_KEYS[i]) : '';
        if (key) b.append(h('small', null, key));
      });
    }

    function setChords(on) {
      keys.releaseAll(); // цифры меняют смысл — отпускаем всё, что ими держали
      chordTracker.releaseAll();
      chordsOn = on;
      ctx.setState('chords', on);
      chordBar.hidden = !on;
      hints();
      render(); // у чёрных клавиш верхней октавы пропадают подписи цифр — цифры теперь аккорды
    }

    /* ---------- Подсказки ---------- */

    const K = App.keymap;
    function hints() {
      ctx.setHints([
        chordsOn ? [K.span(CHORD_KEYS), 'аккорды'] : null,
        [K.span(K.chromaticLow.slice(0, 12)), 'нижняя октава'],
        [K.span(K.chromaticHigh.slice(0, 17)), chordsOn ? 'мелодия выше аккордов' : 'верхняя октава'],
        [K.span(['ArrowLeft', 'ArrowRight']), 'сменить октаву'],
        inst.mode === 'sustain' ? [K.label('Space'), 'педаль'] : null,
      ]);
    }
    hints();

    /** Подпись на клавише. В режиме аккордов цифры заняты — у таких клавиш остаётся только запасной нижний ряд. */
    function hintFor(off) {
      if (!chordsOn) return K.chromaticLabel(off);
      const main = off < 12 ? K.chromaticLow[off] : K.chromaticHigh[off - 12];
      if (!main || !CHORD_KEYS.includes(main)) return K.chromaticLabel(off);
      return off >= 12 && K.chromaticLow[off] ? K.label(K.chromaticLow[off]) : '';
    }

    function measure() {
      const w = root.clientWidth || 800;
      const target = w < 560 ? 38 : w < 1000 ? 44 : 50;
      const next = Math.max(7, Math.min(52, Math.round(w / target)));
      if (next !== whites || !notes.length) {
        whites = next;
        clampStart();
        render();
      }
    }

    function clampAt(s) {
      let span = 0;
      let count = 0;
      while (count < whites) {
        if (!N.isBlack(s + span)) count++;
        span++;
      }
      const maxStart = 12 * Math.floor((108 - span + 1) / 12);
      return Math.max(12, Math.min(s, Math.max(12, maxStart)));
    }

    function clampStart() {
      start = clampAt(start);
    }

    /** Какие клавиши видны, если клавиатура начинается с s. */
    function notesFrom(s) {
      const list = [];
      let m = s;
      let count = 0;
      while (count < whites) {
        list.push(m);
        if (!N.isBlack(m)) count++;
        m++;
      }
      return list;
    }

    function render() {
      board.textContent = '';
      elByMidi.clear();
      notes = notesFrom(start);
      const whiteW = 100 / whites;
      let wi = 0;
      const showKeys = ctx.showKeys();
      notes.forEach((midi) => {
        const black = N.isBlack(midi);
        const hint = showKeys ? hintFor(midi - start) : '';
        const name = ctx.label(midi, N.pc(midi) === 0);
        const el = h('div.key.' + (black ? 'black' : 'white'), {
          dataset: { midi },
          style: { '--c': N.color(midi) },
          role: 'button',
          'aria-label': N.name(midi, 'ru', true),
        },
        hint ? h('span.key-hint', null, hint) : null,
        black ? null : h('span.key-name', null, name));
        if (black) {
          const bw = whiteW * 0.62;
          el.style.width = bw + '%';
          el.style.left = wi * whiteW - bw / 2 + bw * BLACK_SHIFT[N.pc(midi)] + '%';
        } else {
          el.style.width = `calc(${whiteW}% + 1px)`; // перекрытие на пиксель — без щелей между клавишами
          el.style.left = wi * whiteW + '%';
          wi++;
        }
        board.append(el);
        elByMidi.set(midi, el);
      });
      octave.set(N.name(notes[0], ctx.labelMode() === 'latin' ? 'latin' : 'ru', true) + ' – ' + N.name(notes[notes.length - 1], ctx.labelMode() === 'latin' ? 'latin' : 'ru', true));
      presser.refresh();
      nextMark.apply();
      ctx.preload(notes);
      ctx.viewChanged();
    }

    function shift(d) {
      start += 12 * d;
      clampStart();
      ctx.setState('start', start);
      render();
    }

    const velFrom = (el, e) => {
      const r = el.getBoundingClientRect();
      const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      return 0.62 + 0.38 * y;
    };

    const tracker = App.track(board, {
      selector: '.key',
      glide: true,
      down: (el, e) => presser.press(+el.dataset.midi, velFrom(el, e)),
      up: (pr) => presser.release(pr),
    });

    const chordTracker = App.track(chordBar, {
      selector: '.chord',
      glide: false,
      down: (el) => pressChord(+el.dataset.i, 0.82),
      up: (pr) => releaseChord(pr),
    });

    const keys = App.keyHolder(
      (code, e) => {
        const ci = chordsOn ? CHORD_KEYS.indexOf(code) : -1;
        if (ci >= 0) return pressChord(ci, App.keyVel(e, 0.82));
        const off = App.keymap.chromatic[code];
        if (off == null) return undefined;
        return presser.press(start + off, App.keyVel(e, 0.82));
      },
      (pr) => (pr && pr.notes ? releaseChord(pr) : presser.release(pr))
    );

    const ro = new ResizeObserver(measure);
    ro.observe(root);
    chordKeys();
    measure();

    return {
      keydown(code, e) {
        if (code === 'ArrowLeft' || code === 'ArrowRight') {
          shift(code === 'ArrowLeft' ? -1 : 1);
          return true;
        }
        if (code === 'Space' && pedal) {
          ctx.setSustain(true);
          pedal.set(true);
          return true;
        }
        return keys.down(code, e);
      },
      keyup(code) {
        if (code === 'Space' && pedal) {
          ctx.setSustain(false);
          pedal.set(false);
          return true;
        }
        return keys.up(code);
      },
      external: (midi, on, vel) => presser.external(midi, on, vel),
      setSustain: (on) => pedal && pedal.set(on),
      releaseAll() {
        keys.releaseAll();
        tracker.releaseAll();
        chordTracker.releaseAll();
      },
      refresh() {
        render();
        chordKeys();
      },
      keyActions() {
        const ctl = [{ code: 'ArrowLeft', label: 'Октава ниже' }, { code: 'ArrowRight', label: 'Октава выше' }];
        if (pedal) ctl.push({ code: 'Space', label: 'Педаль (держать)' });
        const notesGroups = App.keymap.chromaticActions(start, ctx.noteName);
        if (!chordsOn) return notesGroups.concat([{ title: 'Управление', items: ctl }]);
        const chordGroup = { title: 'Аккорды', items: CHORDS.map(([name, rootPc], i) => ({ code: CHORD_KEYS[i], label: 'Аккорд ' + name, color: N.color(rootPc) })) };
        const melody = notesGroups.map((g) => Object.assign({}, g, { items: g.items.filter((it) => !CHORD_KEYS.includes(it.code)) })).filter((g) => g.items.length);
        return [chordGroup].concat(melody, [{ title: 'Управление', items: ctl }]);
      },
      highlightNext: (m) => nextMark.set(m),
      playable: () => notes.slice(),
      playableFrom: (lo) => notesFrom(clampAt(12 * Math.floor(lo / 12))),
      moveTo(lo) {
        start = clampAt(12 * Math.floor(lo / 12));
        ctx.setState('start', start);
        render();
      },
      destroy() {
        ro.disconnect();
        keys.releaseAll();
        tracker.releaseAll();
        chordTracker.releaseAll();
      },
    };
  };
})();
