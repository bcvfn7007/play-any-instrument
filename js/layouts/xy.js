/* Раскладка «поле» (терменвокс): по горизонтали — высота, по вертикали — громкость. */
(function () {
  const App = window.App;
  const h = App.h;
  const N = App.notes;
  App.layouts = App.layouts || {};

  const SNAPS = {
    free: null,
    chromatic: App.scales.chromatic,
    major: App.scales.major,
    pentatonic: App.scales.pentatonic,
  };

  App.layouts.xy = function (root, ctx) {
    const inst = ctx.inst;
    const low = inst.low || 48;
    const high = inst.high || 84;
    let snap = ctx.getState('snap', 'free');
    const PAD = 0.03; // поле чуть шире диапазона, чтобы крайние ноты не прилипали к краю
    const toX = (m) => PAD + ((m - low) / (high - low)) * (1 - 2 * PAD);

    const field = h('div.xy', { role: 'application', 'aria-label': 'Поле терменвокса: двигайте пальцем' });
    const guides = h('div.xy-guides');
    field.append(guides, h('div.xy-axis', null, h('span', null, 'громче'), h('span', null, 'тише')));
    root.append(field);

    const seg = App.ui.segmented([
      ['free', 'Плавно', 'Высота меняется без ступенек, как у настоящего терменвокса'],
      ['chromatic', 'По нотам', 'Притягивать к ближайшей ноте'],
      ['major', 'Мажор', 'Только ноты до мажора'],
      ['pentatonic', 'Пентатоника', 'Пять нот — фальшивить невозможно'],
    ], snap, (v) => {
      snap = v;
      ctx.setState('snap', v);
      render();
    }, 'Привязка к нотам');
    ctx.deck.append(seg.el);

    function render() {
      guides.textContent = '';
      // Если места мало, подписываем только До, Ре, Ми, Соль и Ля — между ними всегда есть промежуток.
      const perSemitone = (field.clientWidth || 800) * (1 - 2 * PAD) / (high - low);
      const labelled = perSemitone >= 34 ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 4, 7, 9];
      for (let m = low; m <= high; m++) {
        const allowed = !SNAPS[snap] || SNAPS[snap].includes(N.pc(m));
        if (!allowed) continue;
        const natural = !N.isBlack(m);
        guides.append(h('div.xy-line' + (natural ? '' : '.thin'), { style: { left: toX(m) * 100 + '%', '--c': N.color(m) } },
          labelled.includes(N.pc(m)) ? h('span', null, ctx.label(m, N.pc(m) === 0)) : null));
      }
    }

    function pitchAt(x) {
      const raw = low + (high - low) * Math.max(0, Math.min(1, (x - PAD) / (1 - 2 * PAD)));
      const set = SNAPS[snap];
      if (!set) return raw;
      let best = raw;
      let dist = Infinity;
      for (let m = Math.floor(raw) - 2; m <= Math.ceil(raw) + 2; m++) {
        if (!set.includes(N.pc(m))) continue;
        const d = Math.abs(m - raw);
        if (d < dist) {
          dist = d;
          best = m;
        }
      }
      return best;
    }

    const touches = new Map();

    function place(st, e) {
      const r = field.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      const midi = pitchAt(x);
      st.voice.setFreq(N.freq(midi), snap === 'free' ? 0.015 : 0.04);
      st.voice.setLevel(0.25 + 0.75 * (1 - y));
      st.dot.style.left = x * 100 + '%';
      st.dot.style.top = y * 100 + '%';
      st.dot.style.setProperty('--c', N.color(Math.round(midi)));
      st.dot.dataset.note = ctx.label(Math.round(midi), true);
    }

    field.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      App.audio.ensure();
      try {
        field.setPointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
      const dot = h('div.xy-dot');
      field.append(dot);
      const st = { voice: ctx.continuous(N.freq(low)), dot };
      touches.set(e.pointerId, st);
      place(st, e);
    });
    field.addEventListener('pointermove', (e) => {
      const st = touches.get(e.pointerId);
      if (st) place(st, e);
    });
    const end = (e) => {
      const st = touches.get(e.pointerId);
      if (!st) return;
      touches.delete(e.pointerId);
      st.voice.stop(App.audio.ctx.currentTime);
      st.dot.classList.add('gone');
      setTimeout(() => st.dot.remove(), 300);
    };
    field.addEventListener('pointerup', end);
    field.addEventListener('pointercancel', end);
    field.addEventListener('contextmenu', (e) => e.preventDefault());

    // С клавиатуры: одна «рука», которая плавно переезжает между нотами.
    let kbVoice = null;
    const kbHeld = [];
    function kbUpdate() {
      if (!kbHeld.length) {
        if (kbVoice) kbVoice.stop(App.audio.ctx.currentTime);
        kbVoice = null;
        return;
      }
      const midi = kbHeld[kbHeld.length - 1].midi;
      if (!kbVoice) {
        kbVoice = ctx.continuous(N.freq(midi));
        kbVoice.setLevel(0.8);
      }
      kbVoice.setFreq(N.freq(midi), 0.06);
    }

    const ro = new ResizeObserver(() => render());
    ro.observe(field);

    ctx.setHints([
      [null, 'зажмите поле и ведите: влево-вправо — высота, вверх-вниз — громкость'],
      ['Z … M, Q … P', 'ноты с плавным переходом'],
    ]);
    render();

    return {
      keydown(code, e) {
        const off = App.keymap.chromatic[code];
        if (off == null) return false;
        if (e.repeat || kbHeld.some((k) => k.code === code)) return true;
        kbHeld.push({ code, midi: 48 + off });
        kbUpdate();
        return true;
      },
      keyup(code) {
        const i = kbHeld.findIndex((k) => k.code === code);
        if (i < 0) return false;
        kbHeld.splice(i, 1);
        kbUpdate();
        return true;
      },
      external(midi, on) {
        if (on) kbHeld.push({ code: 'midi' + midi, midi });
        else {
          const i = kbHeld.findIndex((k) => k.code === 'midi' + midi);
          if (i >= 0) kbHeld.splice(i, 1);
        }
        kbUpdate();
      },
      releaseAll() {
        kbHeld.length = 0;
        kbUpdate();
        touches.forEach((st, id) => end({ pointerId: id }));
      },
      refresh: render,
      destroy() {
        ro.disconnect();
        this.releaseAll();
      },
    };
  };
})();
