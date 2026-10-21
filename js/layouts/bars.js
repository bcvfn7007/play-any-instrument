/* Раскладки «пластины» (ксилофон, маримба, металлофон) и «язычки» (калимба). */
(function () {
  const App = window.App;
  const h = App.h;
  const N = App.notes;
  App.layouts = App.layouts || {};

  App.layouts.bars = function (root, ctx) {
    const inst = ctx.inst;
    const style = inst.style || 'rainbow';
    let start = 12 * Math.floor(ctx.getState('start', inst.start || 60) / 12);
    let naturals = 15;
    const elByMidi = new Map();
    let notes = [];

    const board = h('div.xylo.' + style, { role: 'group', 'aria-label': 'Пластины' });
    root.append(board);
    const presser = App.presser(ctx, (m) => elByMidi.get(m));
    const nextMark = App.nextMarker((m) => elByMidi.get(m));
    const octave = App.ui.stepper('Октава', (d) => shift(d));
    ctx.deck.append(octave.el);

    const K = App.keymap;
    ctx.setHints([
      [K.span(K.chromaticLow.slice(0, 12)), 'нижняя октава'],
      [K.span(K.chromaticHigh.slice(0, 17)), 'верхняя октава'],
      [K.span(['ArrowLeft', 'ArrowRight']), 'сменить октаву'],
      [null, 'проведите пальцем по пластинам — получится глиссандо'],
    ]);

    function measure() {
      const w = root.clientWidth || 800;
      const next = Math.max(8, Math.min(22, Math.floor(w / (w < 560 ? 40 : 56))));
      if (next !== naturals || !notes.length) {
        naturals = next;
        start = clampStart(start);
        render();
      }
    }

    /** Какие пластины видны, если ряд начинается с s. */
    function notesFrom(s) {
      const list = [];
      let m = s;
      let count = 0;
      while (count < naturals) {
        list.push(m);
        if (!N.isBlack(m)) count++;
        m++;
      }
      return list;
    }

    /** Ряд не уходит выше До₈ — самой высокой ноты, у которой есть записи и понятное название. */
    function clampStart(s) {
      let max = 96;
      while (max > 24 && notesFrom(max).pop() > 108) max -= 12;
      return Math.max(24, Math.min(max, s));
    }

    function render() {
      board.textContent = '';
      elByMidi.clear();
      const top = h('div.xylo-row.sharps');
      const bottom = h('div.xylo-row.naturals');
      board.append(top, bottom);
      notes = notesFrom(start);
      const w = 100 / naturals;
      let wi = 0;
      const showKeys = ctx.showKeys();
      notes.forEach((midi) => {
        const black = N.isBlack(midi);
        const pos = black ? wi - 0.5 : wi;
        // Чем выше нота, тем короче пластина.
        const len = 100 - (pos / Math.max(1, naturals - 1)) * 38;
        const hint = showKeys ? App.keymap.chromaticLabel(midi - start) : '';
        const el = h('div.bar' + (black ? '.sharp' : ''), {
          dataset: { midi },
          role: 'button',
          'aria-label': N.name(midi, 'ru', true),
          style: { '--c': N.color(midi), left: pos * w + w * 0.08 + '%', width: w * 0.84 + '%', '--len': len + '%' },
        },
        h('span.bar-face', null,
          h('i.bar-pin'), h('i.bar-pin.b'),
          h('span.bar-name', null, ctx.label(midi, N.pc(midi) === 0)),
          hint ? h('span.bar-key', null, hint) : null));
        (black ? top : bottom).append(el);
        elByMidi.set(midi, el);
        if (!black) wi++;
      });
      octave.set(N.name(notes[0], ctx.labelMode() === 'latin' ? 'latin' : 'ru', true) + ' – ' + N.name(notes[notes.length - 1], ctx.labelMode() === 'latin' ? 'latin' : 'ru', true));
      presser.refresh();
      nextMark.apply();
      ctx.preload(notes);
      ctx.viewChanged();
    }

    function shift(d) {
      start = clampStart(start + 12 * d);
      ctx.setState('start', start);
      render();
    }

    const tracker = App.track(board, {
      selector: '.bar',
      glide: true,
      down: (el) => presser.press(+el.dataset.midi, 0.85),
      up: (pr) => presser.release(pr),
    });
    const keys = App.keyHolder((code, e) => {
      const off = App.keymap.chromatic[code];
      return off == null ? undefined : presser.press(start + off, App.keyVel(e, 0.85));
    }, (pr) => presser.release(pr));

    const ro = new ResizeObserver(measure);
    ro.observe(root);
    measure();

    return {
      keydown(code, e) {
        if (code === 'ArrowLeft' || code === 'ArrowRight') {
          shift(code === 'ArrowLeft' ? -1 : 1);
          return true;
        }
        return keys.down(code, e);
      },
      keyup: (code) => keys.up(code),
      external: (midi, on, vel) => presser.external(midi, on, vel),
      releaseAll() {
        keys.releaseAll();
        tracker.releaseAll();
      },
      refresh: render,
      keyActions: () => App.keymap.chromaticActions(start, ctx.noteName)
        .concat([{ title: 'Управление', items: [{ code: 'ArrowLeft', label: 'Октава ниже' }, { code: 'ArrowRight', label: 'Октава выше' }] }]),
      highlightNext: (m) => nextMark.set(m),
      playable: () => notes.slice(),
      playableFrom: (lo) => notesFrom(clampStart(12 * Math.floor(lo / 12))),
      moveTo(lo) {
        start = clampStart(12 * Math.floor(lo / 12));
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

  /* ---------- Калимба: самый длинный язычок в центре, ноты расходятся влево-вправо ---------- */

  App.layouts.kalimba = function (root, ctx) {
    const inst = ctx.inst;
    const base = inst.start || 60;
    const COUNT = 17;
    const degrees = [];
    for (let i = 0; i < COUNT; i++) degrees.push(App.scales.degree(App.scales.major, base, i));
    // Порядок слева направо как у настоящей калимбы: Ре₆ Си₅ … Ре₄ До₄ Ми₄ … Ми₆ (ступени 15 13 … 1 0 2 … 16).
    const order = [];
    for (let i = COUNT - 1; i >= 1; i--) if (i % 2 === 1) order.push(i);
    order.push(0);
    for (let i = 2; i < COUNT; i += 2) order.push(i);

    const elByMidi = new Map();
    const body = h('div.kalimba', { role: 'group', 'aria-label': 'Калимба' },
      h('div.kalimba-hole'));
    const tines = h('div.tines');
    body.append(tines, h('div.kalimba-bridge'));
    root.append(body);
    const presser = App.presser(ctx, (m) => elByMidi.get(m));
    const nextMark = App.nextMarker((m) => elByMidi.get(m));

    function render() {
      tines.textContent = '';
      elByMidi.clear();
      const showKeys = ctx.showKeys();
      order.forEach((d) => {
        const midi = degrees[d];
        const len = 96 - d * 3.1;
        const num = (d % 7) + 1;
        const dots = Math.floor(d / 7);
        const el = h('div.tine', {
          dataset: { midi },
          role: 'button',
          'aria-label': N.name(midi, 'ru', true),
          style: { '--c': N.color(midi), '--len': len + '%' },
        },
        h('span.tine-face', null,
          h('span.tine-num', null, num + (dots ? '·'.repeat(dots) : '')),
          h('span.tine-name', null, ctx.label(midi, false)),
          showKeys ? h('span.tine-key', null, App.keymap.diatonicLabel(d)) : null));
        tines.append(el);
        elByMidi.set(midi, el);
      });
      presser.refresh();
      nextMark.apply();
      ctx.viewChanged();
    }

    const tracker = App.track(tines, {
      selector: '.tine',
      glide: true,
      down: (el) => presser.press(+el.dataset.midi, 0.85),
      up: (pr) => presser.release(pr),
    });
    const keys = App.keyHolder((code, e) => {
      const d = App.keymap.diatonic[code];
      return d == null || d >= COUNT ? undefined : presser.press(degrees[d], App.keyVel(e, 0.85));
    }, (pr) => presser.release(pr));

    const row = (r) => App.keymap.span(App.keymap.diatonicRows[r].slice(0, 7));
    ctx.setHints([
      [row(0), 'первая октава'],
      [row(1), 'вторая октава'],
      [row(2), 'третья октава'],
      [null, 'цифры на язычках — ступени лада, как в сборниках для калимбы'],
    ]);
    render();
    ctx.preload(degrees);

    return {
      keydown: (code, e) => keys.down(code, e),
      keyup: (code) => keys.up(code),
      external: (midi, on, vel) => presser.external(midi, on, vel),
      releaseAll() {
        keys.releaseAll();
        tracker.releaseAll();
      },
      refresh: render,
      keyActions: () => App.keymap.diatonicActions((d) => degrees[d], COUNT, ctx.noteName),
      highlightNext: (m) => nextMark.set(m),
      playable: () => degrees.slice(),
      destroy() {
        keys.releaseAll();
        tracker.releaseAll();
      },
    };
  };
})();
