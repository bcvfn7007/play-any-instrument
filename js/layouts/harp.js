/* Раскладки «струны» (арфа, гусли, кото) и «тон-поля» (хэндпан, стил-драм). */
(function () {
  const App = window.App;
  const h = App.h;
  const N = App.notes;
  App.layouts = App.layouts || {};

  App.layouts.harp = function (root, ctx) {
    const inst = ctx.inst;
    const style = inst.style || 'harp';
    const scale = App.scales[inst.scale || 'major'];
    let rootNote = ctx.getState('root', inst.root || 48);
    let count = inst.count || 0;
    let midis = [];
    const els = [];
    const voices = [];
    const nextMark = App.nextMarker((m) => els[midis.indexOf(m)]);

    const frame = h('div.harp.' + style, { role: 'group', 'aria-label': 'Струны' });
    const field = h('div.harp-strings');
    frame.append(field);
    root.append(frame);

    const clampRoot = (r) => Math.max(24, Math.min(72, r));
    let octave = null;
    if (!inst.count) {
      octave = App.ui.stepper('Октава', (d) => {
        rootNote = clampRoot(rootNote + 12 * d);
        ctx.setState('root', rootNote);
        render();
      });
      ctx.deck.append(octave.el);
    }

    const midisFrom = (r) => {
      const list = [];
      for (let i = 0; i < count; i++) list.push(App.scales.degree(scale, r, i));
      return list;
    };
    // Нижняя струна той же ступени, что и сейчас, — не выше ноты lo.
    const rootFor = (lo) => clampRoot(rootNote + 12 * Math.floor((lo - rootNote) / 12));

    function measure() {
      if (inst.count) {
        if (!midis.length) render();
        return;
      }
      const w = root.clientWidth || 800;
      const next = Math.max(15, Math.min(36, Math.floor(w / 30)));
      if (next !== count) {
        count = next;
        render();
      }
    }

    function render() {
      field.textContent = '';
      els.length = 0;
      midis = [];
      const showKeys = ctx.showKeys();
      for (let i = 0; i < count; i++) {
        const midi = App.scales.degree(scale, rootNote, i);
        midis.push(midi);
        const pc = N.pc(midi);
        // На настоящей арфе «До» — красные струны, «Фа» — синие: так легче ориентироваться.
        const mark = style === 'harp' ? (pc === 0 ? 'c' : pc === 5 ? 'f' : '') : '';
        const t = i / Math.max(1, count - 1);
        const el = h('div.hstring' + (mark ? '.' + mark : ''), {
          dataset: { i },
          style: { '--c': N.color(midi), '--thick': (2.8 - t * 1.6).toFixed(2) + 'px', '--len': (style === 'gusli' ? 100 - t * 48 : style === 'harp' ? 100 - t * 55 : 100) + '%' },
          'aria-label': N.name(midi, 'ru', true),
        },
        h('span.hstring-line'),
        h('span.hstring-name', null, ctx.label(midi, pc === 0)),
        showKeys ? h('span.hstring-key', null, App.keymap.diatonicLabel(i)) : null);
        field.append(el);
        els.push(el);
      }
      if (octave) octave.set(N.name(midis[0], ctx.labelMode() === 'latin' ? 'latin' : 'ru', true) + ' – ' + N.name(midis[midis.length - 1], ctx.labelMode() === 'latin' ? 'latin' : 'ru', true));
      nextMark.apply();
      ctx.preload(midis);
      if (inst.voice) App.synth.warm(inst.voice, midis, inst.voiceOpts);
      ctx.viewChanged();
    }

    function pluck(i, vel) {
      if (i < 0 || i >= midis.length) return;
      if (voices[i]) ctx.kill(voices[i]);
      voices[i] = ctx.noteOn(midis[i], vel);
      const el = els[i];
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
    }

    App.trackSweep(field, {
      axis: 'x',
      positions: () => els.map((el) => {
        const b = el.getBoundingClientRect();
        return b.left + b.width / 2;
      }),
      hit: pluck,
    });

    const held = new Set();
    ctx.setHints([
      ['Z X C V …', 'нижние струны'],
      ['A S D F …', 'средние'],
      ['Q W E R …', 'верхние'],
      [null, 'проведите по струнам пальцем или мышью'],
    ]);

    const ro = new ResizeObserver(measure);
    ro.observe(root);
    measure();

    return {
      keydown(code, e) {
        const d = App.keymap.diatonic[code];
        if (d == null) return false;
        if (!e.repeat && !held.has(code)) pluck(d, 0.85);
        held.add(code);
        return true;
      },
      keyup(code) {
        return held.delete(code);
      },
      external(midi, on, vel) {
        if (!on) return;
        let best = -1;
        midis.forEach((m, i) => {
          if (best < 0 || Math.abs(m - midi) < Math.abs(midis[best] - midi)) best = i;
        });
        if (midis[best] === midi) pluck(best, vel);
        else ctx.noteOn(midi, vel);
      },
      releaseAll: () => held.clear(),
      refresh: render,
      highlightNext: (m) => nextMark.set(m),
      playable: () => midis.slice(),
      playableFrom: octave ? (lo) => midisFrom(rootFor(lo)) : null,
      moveTo: octave
        ? (lo) => {
          rootNote = rootFor(lo);
          ctx.setState('root', rootNote);
          render();
        }
        : null,
      destroy: () => ro.disconnect(),
    };
  };

  /* ---------- Хэндпан и стил-драм ---------- */

  App.layouts.circle = function (root, ctx) {
    const inst = ctx.inst;
    const steel = inst.style === 'steelpan';
    const fields = [];

    if (steel) {
      // Тенор-пан: ноты по кругу квинт, внутреннее кольцо — на октаву выше.
      const fifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
      fifths.forEach((pc, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        fields.push({ midi: 60 + pc, x: 50 + Math.cos(a) * 38, y: 50 + Math.sin(a) * 38, size: 17 });
        fields.push({ midi: 72 + pc, x: 50 + Math.cos(a) * 22, y: 50 + Math.sin(a) * 22, size: 10.5 });
      });
    } else {
      const notes = inst.notes.map(App.notes.parse);
      fields.push({ midi: notes[0], x: 50, y: 50, size: 30, ding: true });
      // Ноты кольца идут зигзагом: снизу справа, снизу слева, и выше по кругу.
      notes.slice(1).forEach((midi, i) => {
        const step = Math.floor(i / 2);
        const side = i % 2 === 0 ? 1 : -1;
        const a = Math.PI / 2 - side * (Math.PI / 8 + (step * Math.PI) / 4);
        fields.push({ midi, x: 50 + Math.cos(a) * 34, y: 50 + Math.sin(a) * 34, size: 21 - i * 0.9 });
      });
    }

    const pan = h('div.pan' + (steel ? '.steel' : '.hand'), { role: 'group', 'aria-label': inst.name });
    const elByMidi = new Map();
    const presser = App.presser(ctx, (m) => elByMidi.get(m));
    const nextMark = App.nextMarker((m) => elByMidi.get(m));
    const box = h('div.pan-box', null, pan);
    root.append(box);

    const HAND_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'];
    const sorted = fields.slice().sort((a, b) => a.midi - b.midi);

    function render() {
      pan.textContent = '';
      elByMidi.clear();
      const showKeys = ctx.showKeys();
      fields.forEach((f) => {
        const idx = sorted.indexOf(f);
        const key = steel ? App.keymap.chromaticLabel(f.midi - 60) : HAND_KEYS[idx] ? App.keymap.label(HAND_KEYS[idx]) : '';
        const el = h('div.field' + (f.ding ? '.ding' : ''), {
          dataset: { midi: f.midi },
          role: 'button',
          'aria-label': N.name(f.midi, 'ru', true),
          style: { left: f.x + '%', top: f.y + '%', width: f.size + '%', '--c': N.color(f.midi) },
        },
        h('span.field-name', null, ctx.label(f.midi, true)),
        showKeys && key ? h('span.field-key', null, key) : null);
        pan.append(el);
        elByMidi.set(f.midi, el);
      });
      presser.refresh();
      nextMark.apply();
      ctx.viewChanged();
    }

    const tracker = App.track(pan, {
      selector: '.field',
      glide: true,
      down: (el) => presser.press(+el.dataset.midi, 0.85),
      up: (pr) => presser.release(pr),
    });
    const keys = App.keyHolder((code) => {
      if (steel) {
        const off = App.keymap.chromatic[code];
        const m = off == null ? null : 60 + off;
        return m != null && elByMidi.has(m) ? presser.press(m, 0.85) : undefined;
      }
      let i = HAND_KEYS.indexOf(code);
      if (i < 0 && /^Digit[1-9]$/.test(code)) i = +code.slice(5) - 1;
      return i >= 0 && sorted[i] ? presser.press(sorted[i].midi, 0.85) : undefined;
    }, (pr) => presser.release(pr));

    ctx.setHints(steel
      ? [['Z … M', 'внешнее кольцо'], ['Q … P', 'внутреннее кольцо'], [null, 'ноты внешнего кольца идут по кругу квинт']]
      : [['A S D F G H J K L', 'от низкой ноты к высокой'], ['1 … 9', 'то же самое'], [null, 'в центре — самая низкая нота, «динг»']]);

    render();
    ctx.preload(fields.map((f) => f.midi));

    return {
      keydown: (code) => keys.down(code),
      keyup: (code) => keys.up(code),
      external: (midi, on, vel) => presser.external(midi, on, vel),
      releaseAll() {
        keys.releaseAll();
        tracker.releaseAll();
      },
      refresh: render,
      highlightNext: (m) => nextMark.set(m),
      playable: () => fields.map((f) => f.midi),
      destroy() {
        keys.releaseAll();
        tracker.releaseAll();
      },
    };
  };
})();
