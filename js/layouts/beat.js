/* Раскладка «секвенсор»: драм-машина на 16 шагов с готовыми ритмами. */
(function () {
  const App = window.App;
  const h = App.h;
  App.layouts = App.layouts || {};

  const ROWS = [
    ['kick', 'Бочка', '#6c68e6'],
    ['snare', 'Малый', '#d65bb5'],
    ['clap', 'Хлопок', '#c86de0'],
    ['hatClosed', 'Хай-хэт', '#3fbf7f'],
    ['hatOpen', 'Открытый хэт', '#8fcf4c'],
    ['tomLow', 'Том низкий', '#e5484d'],
    ['tomHigh', 'Том высокий', '#f5923a'],
    ['crash', 'Тарелка', '#f2cf3a'],
  ];
  const STEPS = 16;

  // Строки шаблона идут в том же порядке, что и ROWS; «x» — удар.
  const PRESETS = {
    rock: { name: 'Рок', bpm: 110, rows: ['x.......x.x.....', '....x.......x...', '', 'x.x.x.x.x.x.x.x.', '', '', '', 'x...............'] },
    pop: { name: 'Поп', bpm: 100, rows: ['x.....x.x.......', '....x.......x...', '............x...', 'x.x.x.x.x.x.x.x.', '', '', '', ''] },
    hiphop: { name: 'Хип-хоп', bpm: 88, rows: ['x......x..x.....', '....x.......x...', '', 'x.x.x.x.x.x.x.xx', '', '', '', ''] },
    disco: { name: 'Диско', bpm: 120, rows: ['x...x...x...x...', '....x.......x...', '', 'x.x.x.x.x.x.x.x.', '..x...x...x...x.', '', '', ''] },
    house: { name: 'Хаус', bpm: 124, rows: ['x...x...x...x...', '', '....x.......x...', 'x.xxx.xxx.xxx.xx', '..x...x...x...x.', '', '', ''] },
    reggaeton: { name: 'Реггетон', bpm: 95, rows: ['x...x...x...x...', '...x..x....x..x.', '', 'x.x.x.x.x.x.x.x.', '', '', '', ''] },
    funk: { name: 'Фанк', bpm: 104, rows: ['x.x.......x..x..', '....x..x.x..x..x', '', 'xxxxxxxxxxxxxxxx', '', '', '', ''] },
    rolls: { name: 'Сбивка', bpm: 110, rows: ['x...............', '............xxxx', '', 'x.x.x.x.x.x.....', '', '........xx......', '....xx..........', 'x...............'] },
    empty: { name: 'Пусто', bpm: 100, rows: [] },
  };

  const parse = (preset) => ROWS.map((_, r) => {
    const s = preset.rows[r] || '';
    return Array.from({ length: STEPS }, (_, i) => s[i] === 'x');
  });

  App.layouts.beat = function (root, ctx) {
    let pattern = ctx.getState('pattern', null) || parse(PRESETS.rock);
    let bpm = ctx.getState('bpm', PRESETS.rock.bpm);
    let swing = ctx.getState('swing', 0);
    let playing = false;
    let timer = null;
    let step = 0;
    let nextTime = 0;
    const visTimers = [];

    /* ---------- Панель ---------- */

    const playBtn = h('button.btn.primary', { type: 'button', 'aria-pressed': 'false' });
    const setPlayLabel = () => {
      playBtn.textContent = '';
      playBtn.append(App.icon(playing ? 'stop' : 'play'), playing ? 'Стоп' : 'Играть');
      playBtn.setAttribute('aria-pressed', String(playing));
    };
    playBtn.addEventListener('click', () => (playing ? stop() : start()));
    setPlayLabel();

    const tempo = App.ui.slider('Темп', 60, 180, 1, bpm, (v) => {
      bpm = v;
      ctx.setState('bpm', v);
    }, (v) => v + ' уд/мин');
    const swingCtl = App.ui.slider('Свинг', 0, 60, 5, swing, (v) => {
      swing = v;
      ctx.setState('swing', v);
    }, (v) => v + '%');

    const select = h('select.select', { 'aria-label': 'Готовый ритм' },
      h('option', { value: '' }, 'Готовые ритмы…'),
      Object.entries(PRESETS).map(([id, p]) => h('option', { value: id }, p.name)));
    select.addEventListener('change', () => {
      const p = PRESETS[select.value];
      if (!p) return;
      pattern = parse(p);
      bpm = p.bpm;
      tempo.set(bpm);
      save();
      paintAll();
      select.value = '';
    });

    ctx.deck.append(playBtn, select, tempo.el, swingCtl.el);

    /* ---------- Сетка ---------- */

    const grid = h('div.beat', { role: 'grid', 'aria-label': 'Шаги ритма' });
    const cells = [];
    const heads = [];
    ROWS.forEach(([sound, name, color], r) => {
      const key = App.keymap.label('Digit' + (r + 1));
      const head = h('button.beat-head', { type: 'button', style: { '--c': color }, title: 'Послушать: ' + name },
        h('span', null, name), ctx.showKeys() && key ? h('kbd', null, key) : null);
      head.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        App.audio.ensure();
        ctx.drum(sound, 0.9);
        flash(head);
      });
      grid.append(head);
      heads.push(head);
      cells[r] = [];
      for (let i = 0; i < STEPS; i++) {
        const c = h('div.step' + (i % 4 === 0 ? '.downbeat' : ''), {
          role: 'gridcell',
          dataset: { r, i },
          style: { '--c': color },
          'aria-label': name + ', шаг ' + (i + 1),
        });
        grid.append(c);
        cells[r][i] = c;
      }
    });
    root.append(h('div.beat-wrap', null, grid));

    function flash(el) {
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
    }

    function paintAll() {
      cells.forEach((row, r) => row.forEach((c, i) => {
        c.classList.toggle('on', pattern[r][i]);
        c.setAttribute('aria-selected', String(pattern[r][i]));
      }));
    }

    const save = () => ctx.setState('pattern', pattern);

    // Рисование: первая клетка решает, ставим удары или стираем, дальше — по всем, через которые провели.
    let paintValue = null;
    App.track(grid, {
      selector: '.step',
      glide: true,
      down(el) {
        const r = +el.dataset.r;
        const i = +el.dataset.i;
        if (paintValue == null) paintValue = !pattern[r][i];
        pattern[r][i] = paintValue;
        el.classList.toggle('on', paintValue);
        if (paintValue && !playing) ctx.drum(ROWS[r][0], 0.75);
        return null;
      },
      up() {},
    });
    const endPaint = () => {
      if (paintValue != null) save();
      paintValue = null;
    };
    window.addEventListener('pointerup', endPaint);
    window.addEventListener('pointercancel', endPaint);

    /* ---------- Воспроизведение ---------- */

    function start() {
      const ac = App.audio.ensure();
      playing = true;
      step = 0;
      nextTime = ac.currentTime + 0.08;
      timer = setInterval(schedule, 25);
      schedule();
      setPlayLabel();
    }

    function stop() {
      playing = false;
      clearInterval(timer);
      visTimers.splice(0).forEach(clearTimeout);
      grid.querySelectorAll('.now').forEach((c) => c.classList.remove('now'));
      setPlayLabel();
    }

    function schedule() {
      const ac = App.audio.ctx;
      const dur = 60 / bpm / 4;
      while (nextTime < ac.currentTime + 0.12) {
        const s = step % STEPS;
        const t = nextTime + (s % 2 === 1 ? (swing / 100) * dur * 0.5 : 0);
        ROWS.forEach(([sound], r) => {
          if (pattern[r][s]) ctx.drum(sound, s % 4 === 0 ? 0.95 : 0.78, t);
        });
        const delay = Math.max(0, (t - ac.currentTime) * 1000);
        visTimers.push(setTimeout(() => {
          visTimers.shift();
          if (!playing) return;
          grid.querySelectorAll('.now').forEach((c) => c.classList.remove('now'));
          cells.forEach((row) => row[s].classList.add('now'));
        }, delay));
        nextTime += dur;
        step++;
      }
    }

    const DIGITS = ROWS.map((_, r) => 'Digit' + (r + 1));
    ctx.preloadDrums(ROWS.map((r) => r[0]));
    ctx.setHints([
      [App.keymap.label('Space'), 'играть / стоп'],
      [App.keymap.span(DIGITS), 'ударить по звуку вручную'],
      [null, 'нажмите клетку или проведите по ряду, чтобы поставить удары'],
    ]);
    paintAll();

    return {
      keydown(code, e) {
        if (code === 'Space') {
          if (!e.repeat) (playing ? stop : start)();
          return true;
        }
        const m = /^Digit([1-8])$/.exec(code);
        if (m) {
          if (!e.repeat) {
            const r = +m[1] - 1;
            ctx.drum(ROWS[r][0], App.keyVel(e, 0.9));
            flash(heads[r]);
          }
          return true;
        }
        return false;
      },
      keyActions: () => [
        { title: 'Драм-машина', items: [{ code: 'Space', label: 'Играть / стоп' }] },
        { title: 'Ударить вручную', items: ROWS.map(([, name, color], r) => ({ code: DIGITS[r], label: name, color })) },
      ],
      keyup: () => false,
      external(midi, on, vel) {
        if (!on) return;
        const map = { 36: 0, 35: 0, 38: 1, 40: 1, 39: 2, 42: 3, 44: 3, 46: 4, 41: 5, 43: 5, 45: 5, 47: 6, 48: 6, 50: 6, 49: 7, 57: 7 };
        const r = map[midi];
        if (r != null) {
          ctx.drum(ROWS[r][0], vel);
          flash(heads[r]);
        }
      },
      releaseAll() {},
      refresh() {},
      destroy() {
        stop();
        window.removeEventListener('pointerup', endPaint);
        window.removeEventListener('pointercancel', endPaint);
      },
    };
  };
})();
