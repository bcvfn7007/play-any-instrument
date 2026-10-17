/* Раскладка «клавиши»: фортепианная клавиатура под ширину экрана. */
(function () {
  const App = window.App;
  const h = App.h;
  const N = App.notes;
  App.layouts = App.layouts || {};

  // Чёрные клавиши стоят не ровно посередине, как на настоящем фортепиано.
  const BLACK_SHIFT = { 1: -0.12, 3: 0.12, 6: -0.14, 8: 0, 10: 0.14 };

  App.layouts.keys = function (root, ctx) {
    const inst = ctx.inst;
    let start = 12 * Math.floor(ctx.getState('start', inst.start || 48) / 12);
    let whites = 14;
    let notes = [];
    const elByMidi = new Map();

    const board = h('div.kb', { role: 'group', 'aria-label': 'Клавиатура' });
    const nowNote = h('span.fall-note');
    const fallboard = h('div.kb-fallboard', { 'aria-hidden': 'true' },
      h('span.fall-name', null, inst.name), nowNote);
    root.append(fallboard, board);

    const basePresser = App.presser(ctx, (m) => elByMidi.get(m));
    const nextMark = App.nextMarker((m) => elByMidi.get(m));
    const presser = Object.assign({}, basePresser, {
      press(midi, vel) {
        nowNote.textContent = N.name(midi, ctx.labelMode() === 'latin' ? 'latin' : 'ru', true);
        nowNote.style.setProperty('--c', N.color(midi));
        nowNote.classList.remove('hit');
        void nowNote.offsetWidth;
        nowNote.classList.add('hit');
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

    ctx.setHints([
      ['Z … M', 'нижняя октава'],
      ['Q … P', 'верхняя октава'],
      ['← →', 'сменить октаву'],
      inst.mode === 'sustain' ? ['Пробел', 'педаль'] : null,
    ]);

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
        const hint = showKeys ? App.keymap.chromaticLabel(midi - start) : '';
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

    const keys = App.keyHolder(
      (code) => {
        const off = App.keymap.chromatic[code];
        if (off == null) return undefined;
        return presser.press(start + off, 0.82);
      },
      (pr) => presser.release(pr)
    );

    const ro = new ResizeObserver(measure);
    ro.observe(root);
    measure();

    return {
      keydown(code) {
        if (code === 'ArrowLeft' || code === 'ArrowRight') {
          shift(code === 'ArrowLeft' ? -1 : 1);
          return true;
        }
        if (code === 'Space' && pedal) {
          ctx.setSustain(true);
          pedal.set(true);
          return true;
        }
        return keys.down(code);
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
      },
      refresh: render,
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
      },
    };
  };
})();
