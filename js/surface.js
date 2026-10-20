/* Общие помощники интерфейса: создание элементов, касания и мышь, нажатия нот. */
(function () {
  const App = (window.App = window.App || {});

  /** Короткая запись для создания элементов: h('button.btn.primary', {onClick}, 'Текст'). */
  App.h = function (tag, props, ...kids) {
    const [name, ...classes] = tag.split('.');
    const el = document.createElement(name || 'div');
    if (classes.length) el.className = classes.join(' ');
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'style') {
          for (const s in v) {
            if (s.startsWith('--')) el.style.setProperty(s, v[s]);
            else el.style[s] = v[s];
          }
        } else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    kids.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      el.append(c.nodeType ? c : String(c));
    });
    return el;
  };

  /**
   * Отслеживает касания и мышь внутри root.
   * opts.selector — какие элементы «нажимаются»;
   * opts.glide — true: при скольжении старая нота отпускается, новая нажимается (глиссандо);
   *              false: играет только место первого касания.
   * down(el, e) → объект нажатия, up(press, el, e), move(press, el, e).
   */
  App.track = function (root, opts) {
    const active = new Map();

    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = e.target.closest(opts.selector);
      if (!el || !root.contains(el)) return;
      e.preventDefault();
      App.audio.ensure();
      try {
        root.setPointerCapture(e.pointerId);
      } catch (err) { /* не все браузеры позволяют */ }
      active.set(e.pointerId, { el, press: opts.down(el, e) });
    });

    root.addEventListener('pointermove', (e) => {
      const st = active.get(e.pointerId);
      if (!st) return;
      if (opts.move) opts.move(st.press, st.el, e);
      if (!opts.glide) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const el = hit && hit.closest(opts.selector);
      const next = el && root.contains(el) ? el : null;
      if (next === st.el) return;
      if (st.el) opts.up(st.press, st.el, e);
      st.press = next ? opts.down(next, e) : null;
      st.el = next;
    });

    const end = (e) => {
      const st = active.get(e.pointerId);
      if (!st) return;
      active.delete(e.pointerId);
      if (st.el) opts.up(st.press, st.el, e);
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('lostpointercapture', end);
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    return {
      releaseAll() {
        active.forEach((st) => st.el && opts.up(st.press, st.el, null));
        active.clear();
      },
    };
  };

  /**
   * Проведение пальцем поперёк струн: вызывает hit(i, speed) для каждой пересечённой струны.
   * positions() → массив координат струн по оси (x или y) в пикселях экрана.
   */
  App.trackSweep = function (root, opts) {
    const last = new Map();
    const axis = opts.axis || 'x';
    const coord = (e) => (axis === 'x' ? e.clientX : e.clientY);

    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      App.audio.ensure();
      try {
        root.setPointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
      const pos = opts.positions();
      const c = coord(e);
      let best = -1;
      let dist = Infinity;
      pos.forEach((p, i) => {
        const d = Math.abs(p - c);
        if (d < dist) {
          dist = d;
          best = i;
        }
      });
      const gap = pos.length > 1 ? Math.abs(pos[1] - pos[0]) : 40;
      if (best >= 0 && dist <= gap * 0.75) opts.hit(best, 0.85, e);
      last.set(e.pointerId, { c, t: performance.now() });
    });

    root.addEventListener('pointermove', (e) => {
      const prev = last.get(e.pointerId);
      if (!prev) return;
      const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      const events = coalesced.length ? coalesced : [e];
      const pos = opts.positions();
      let from = prev.c;
      events.forEach((ev) => {
        const c = coord(ev);
        const lo = Math.min(from, c);
        const hi = Math.max(from, c);
        const now = performance.now();
        const speed = Math.abs(c - from) / Math.max(1, now - prev.t);
        const crossed = [];
        pos.forEach((p, i) => p > lo && p <= hi && crossed.push(i));
        if (c < from) crossed.reverse();
        const vel = Math.max(0.45, Math.min(1, 0.55 + speed * 0.25));
        crossed.forEach((i) => opts.hit(i, vel, e));
        from = c;
        prev.t = now;
      });
      prev.c = from;
    });

    const end = (e) => last.delete(e.pointerId);
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  /**
   * Учёт нажатых нот: несколько источников (пальцы, клавиатура, MIDI) могут держать одну ноту.
   * elFor(midi) → элемент, который подсвечивается.
   */
  App.presser = function (ctx, elFor) {
    const counts = new Map();
    const external = new Map();

    function mark(midi, d) {
      const n = Math.max(0, (counts.get(midi) || 0) + d);
      counts.set(midi, n);
      const els = [].concat(elFor(midi) || []);
      els.forEach((el) => {
        el.classList.toggle('on', n > 0);
        if (d > 0) {
          el.classList.remove('hit');
          void el.offsetWidth;
          el.classList.add('hit');
        }
      });
    }

    const p = {
      press(midi, vel, extra) {
        const v = ctx.noteOn(midi, vel == null ? 0.85 : vel, extra);
        mark(midi, 1);
        return { midi, v };
      },
      release(pr) {
        if (!pr) return;
        ctx.noteOff(pr.v);
        mark(pr.midi, -1);
      },
      /** Ноты с MIDI-клавиатуры. */
      external(midi, on, vel) {
        if (on) {
          const stack = external.get(midi) || [];
          stack.push(p.press(midi, vel));
          external.set(midi, stack);
        } else {
          const stack = external.get(midi);
          if (stack && stack.length) p.release(stack.shift());
        }
      },
      refresh() {
        counts.forEach((n, midi) => [].concat(elFor(midi) || []).forEach((el) => el.classList.toggle('on', n > 0)));
      },
      reset() {
        counts.clear();
        external.clear();
      },
    };
    return p;
  };

  /**
   * Подсветка «следующей ноты» в режиме разучивания: класс .next на элементе ноты.
   * set(midi) — одна нота, set([midi, …]) — аккорд, set(null) — погасить. apply() — заново после перерисовки.
   */
  App.nextMarker = function (elFor) {
    let midi = null;
    let marked = [];
    function apply() {
      marked.forEach((el) => el.classList.remove('next'));
      marked = midi == null ? [] : [].concat(midi).flatMap((m) => [].concat(elFor(m) || [])).filter(Boolean);
      marked.forEach((el) => {
        void el.offsetWidth; // пульсация начинается заново, даже если нота повторяется
        el.classList.add('next');
      });
    }
    return {
      set(m) {
        midi = m;
        apply();
      },
      apply,
    };
  };

  /** Сила нажатия: у MIDI-пэда, назначенного на клавишу, она своя; у клавиатуры — d. */
  App.keyVel = (e, d) => (e && e.velocity) || d;

  /** Обработка клавиш компьютера: code → нажатие; повторы автоповтора игнорируются. */
  App.keyHolder = function (pressFn, releaseFn) {
    const held = new Map();
    return {
      down(code, e) {
        if (held.has(code)) return true;
        const pr = pressFn(code, e);
        if (pr === undefined) return false;
        held.set(code, pr);
        return true;
      },
      up(code) {
        if (!held.has(code)) return false;
        releaseFn(held.get(code));
        held.delete(code);
        return true;
      },
      releaseAll() {
        held.forEach((pr) => releaseFn(pr));
        held.clear();
      },
    };
  };

  /* ---------- Элементы панели управления инструментом ---------- */

  const h = App.h;
  App.ui = {
    /** Переключатель октавы: ◀ подпись ▶ */
    stepper(label, onStep, title) {
      const value = h('span.stepper-value');
      const el = h('div.stepper', { role: 'group', 'aria-label': title || label },
        h('span.stepper-label', null, label),
        h('button.icon-btn', { type: 'button', 'aria-label': 'Ниже', title: 'Ниже (←)', onClick: () => onStep(-1) }, svg('chevron-left')),
        value,
        h('button.icon-btn', { type: 'button', 'aria-label': 'Выше', title: 'Выше (→)', onClick: () => onStep(1) }, svg('chevron-right')));
      return { el, set: (t) => (value.textContent = t) };
    },
    toggle(label, initial, onChange, title) {
      const btn = h('button.chip', { type: 'button', 'aria-pressed': String(!!initial), title: title || label }, label);
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(on));
        onChange(on);
      });
      return { el: btn, set: (on) => btn.setAttribute('aria-pressed', String(!!on)) };
    },
    segmented(options, value, onChange, label) {
      const el = h('div.segmented', { role: 'radiogroup', 'aria-label': label || '' });
      const buttons = options.map(([v, text, title]) => {
        const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === value), title: title || text }, text);
        b.addEventListener('click', () => {
          buttons.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          onChange(v);
        });
        el.append(b);
        return b;
      });
      return { el, set: (v) => buttons.forEach((b, i) => b.setAttribute('aria-checked', String(options[i][0] === v))) };
    },
    slider(label, min, max, step, value, onInput, format) {
      const out = h('output');
      const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
      const show = () => (out.textContent = format ? format(+input.value) : input.value);
      input.addEventListener('input', () => {
        show();
        onInput(+input.value);
      });
      show();
      return { el: h('label.slider', null, h('span', null, label), input, out), input, set: (v) => ((input.value = v), show()) };
    },
  };

  /* ---------- Иконки (линейные, 24×24) ---------- */

  const ICONS = {
    'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.9v.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    metronome: '<path d="M8.5 3.5h7l3.5 17H5z"/><path d="M12 15l5-9"/><path d="M7 17h10"/>',
    record: '<circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    'fullscreen-exit': '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    tape: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="8.5" cy="12" r="2"/><circle cx="15.5" cy="12" r="2"/><path d="M8.5 14h7"/>',
    volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    midi: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 7v6M11 7v6M15 7v6M19 7v6"/>',
    note: '<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
    restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
    shuffle: '<path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.5M16.5 7H20M13 9.5C13.9 8 14.9 7 16.5 7M18 4.5L20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.3 2.8-5.2 5.5-5.2s4.9 1.9 5.5 5.2"/><circle cx="16.8" cy="9.3" r="2.5"/><path d="M15.6 14.4c2.6-.2 4.4 1.5 4.9 4.6"/>',
    plug: '<path d="M9 3.5v4.5M15 3.5v4.5"/><path d="M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0z"/><path d="M12 17v3.5"/>',
    mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 9.5h.01M9.3 9.5h.01M12.6 9.5h.01M15.9 9.5h.01M18 9.5h.01M6 12.5h.01M9.3 12.5h.01M12.6 12.5h.01M15.9 12.5h.01M18 12.5h.01M8 15.3h8"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    send: '<path d="M4 12l16-7.5-6 15-2.5-6.2z"/><path d="M11.5 13.3L20 4.5"/>',
    signal: '<path d="M5 18.5a10 10 0 0 1 0-13M8.5 15a5 5 0 0 1 0-6M19 18.5a10 10 0 0 0 0-13M15.5 15a5 5 0 0 0 0-6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  };
  function svg(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'icon');
    s.innerHTML = ICONS[name] || '';
    return s;
  }
  App.icon = svg;
})();
