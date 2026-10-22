/* Раскладка «установка»: нарисованная барабанная установка — бейте прямо по барабанам и тарелкам. */
(function () {
  const App = window.App;
  App.layouts = App.layouts || {};
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, kids) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    (kids || []).forEach((c) => c && n.append(c));
    return n;
  }

  // Вид со стула барабанщика: хай-хэт слева, напольный том справа, бочка в центре.
  const PIECES = [
    { id: 'kick', kind: 'kick', cx: 500, cy: 450, r: 150, sound: 'kick', keys: ['Space', 'KeyX', 'KeyB'] },
    { id: 'tom1', kind: 'drum', cx: 405, cy: 248, rx: 78, ry: 37, depth: 46, sound: 'tomHigh', keys: ['KeyE'] },
    { id: 'tom2', kind: 'drum', cx: 597, cy: 248, rx: 86, ry: 41, depth: 52, sound: 'tomMid', keys: ['KeyR'] },
    { id: 'floor', kind: 'drum', cx: 760, cy: 418, rx: 110, ry: 52, depth: 84, sound: 'tomLow', keys: ['KeyJ', 'KeyL'] },
    { id: 'snare', kind: 'drum', metal: true, cx: 282, cy: 418, rx: 106, ry: 48, depth: 36, sound: 'snare', rim: 'rim', keys: ['KeyD', 'KeyK'], rimKeys: ['KeyF'] },
    { id: 'hihat', kind: 'hihat', cx: 108, cy: 300, rx: 96, ry: 22, sound: 'hatClosed', open: 'hatOpen', keys: ['KeyA'], openKeys: ['KeyS'] },
    { id: 'crash', kind: 'cymbal', cx: 235, cy: 118, rx: 142, ry: 30, tilt: -8, sound: 'crash', keys: ['KeyQ'] },
    { id: 'splash', kind: 'cymbal', cx: 500, cy: 88, rx: 70, ry: 15, tilt: 0, sound: 'splash', keys: ['KeyW'] },
    { id: 'ride', kind: 'cymbal', cx: 822, cy: 168, rx: 162, ry: 36, tilt: 7, sound: 'ride', bell: 'rideBell', keys: ['KeyP'], bellKeys: ['KeyO'] },
    { id: 'hhpedal', kind: 'pedal', cx: 108, cy: 598, w: 86, h: 34, sound: 'hatPedal', keys: ['KeyZ'] },
    { id: 'kickpedal', kind: 'pedal', cx: 500, cy: 612, w: 86, h: 30, sound: 'kick', keys: [] },
  ];

  const NAMES = {
    kick: App.t('Бочка'), tom1: App.t('Том 1'), tom2: App.t('Том 2'), floor: App.t('Напольный том'), snare: App.t('Малый'), hihat: App.t('Хай-хэт'),
    crash: App.t('Крэш'), splash: App.t('Сплэш'), ride: App.t('Райд'), hhpedal: App.t('Педаль хэта'), kickpedal: App.t('Педаль бочки'),
  };

  App.layouts.kit = function (root, ctx) {
    let hatOpen = ctx.getState('hatOpen', false);

    const svg = el('svg', { viewBox: '0 0 1000 640', class: 'kit', role: 'group', 'aria-label': App.t('Барабанная установка') });
    root.append(svg);
    const groups = {};

    /* ---------- Отрисовка ---------- */

    function defs() {
      return el('defs', null, [
        el('linearGradient', { id: 'kit-shell', x1: 0, x2: 1 }, [
          el('stop', { offset: 0, 'stop-color': '#4a0d1c' }), el('stop', { offset: 0.35, 'stop-color': '#a3243c' }),
          el('stop', { offset: 0.55, 'stop-color': '#c2385a' }), el('stop', { offset: 1, 'stop-color': '#3d0a17' }),
        ]),
        el('linearGradient', { id: 'kit-chrome', x1: 0, x2: 1 }, [
          el('stop', { offset: 0, 'stop-color': '#6d717b' }), el('stop', { offset: 0.45, 'stop-color': '#eef0f4' }),
          el('stop', { offset: 0.6, 'stop-color': '#b9bec8' }), el('stop', { offset: 1, 'stop-color': '#5d616a' }),
        ]),
        el('radialGradient', { id: 'kit-head', cx: 0.45, cy: 0.4, r: 0.65 }, [
          el('stop', { offset: 0, 'stop-color': '#fbf8f1' }), el('stop', { offset: 1, 'stop-color': '#d6d0c2' }),
        ]),
        el('radialGradient', { id: 'kit-front', cx: 0.45, cy: 0.4, r: 0.7 }, [
          el('stop', { offset: 0, 'stop-color': '#3a2c4c' }), el('stop', { offset: 1, 'stop-color': '#171320' }),
        ]),
        el('radialGradient', { id: 'kit-bronze', cx: 0.5, cy: 0.5, r: 0.55 }, [
          el('stop', { offset: 0, 'stop-color': '#ffe7a6' }), el('stop', { offset: 0.2, 'stop-color': '#e3b65a' }),
          el('stop', { offset: 0.75, 'stop-color': '#c48e33' }), el('stop', { offset: 1, 'stop-color': '#8a5e1c' }),
        ]),
      ]);
    }

    function label(p, x, y) {
      const keys = ctx.showKeys() ? hintFor(p) : '';
      const t = el('text', { x, y, class: 'kit-label', 'text-anchor': 'middle' });
      t.append(el('tspan', { x, dy: 0 }, [document.createTextNode(NAMES[p.id])]));
      if (keys) t.append(el('tspan', { x, dy: 24, class: 'kit-key' }, [document.createTextNode(keys)]));
      return t;
    }

    function hintFor(p) {
      const K = App.keymap;
      const k = p.keys.map(K.label).filter(Boolean);
      const extra = (list, word) => list && K.label(list[0]) && k.push(K.label(list[0]) + ' ' + word);
      extra(p.rimKeys, App.t('обод'));
      extra(p.bellKeys, App.t('колокол'));
      extra(p.openKeys, App.t('откр.'));
      return k.join(', ');
    }

    function stands() {
      const g = el('g', { class: 'kit-stands' });
      const line = (x1, y1, x2, y2, w) => g.append(el('line', { x1, y1, x2, y2, 'stroke-width': w || 6 }));
      line(235, 118, 205, 615);
      line(500, 88, 500, 300);
      line(822, 168, 870, 615);
      line(108, 300, 108, 585);
      line(282, 450, 282, 615);
      [[680, 470, 665, 620], [840, 470, 855, 620], [760, 500, 760, 625]].forEach((l) => line(...l, 7));
      line(405, 290, 470, 330, 8);
      line(597, 290, 530, 330, 8);
      // Тренога стоек: маленькие «лапки» у пола.
      [205, 870, 108, 282].forEach((x) => {
        line(x, 615, x - 34, 632, 5);
        line(x, 615, x + 34, 632, 5);
      });
      return g;
    }

    function drum(p) {
      const g = el('g', { class: 'kit-piece kit-drum', 'data-piece': p.id });
      const { cx, cy, rx, ry, depth } = p;
      g.append(el('path', {
        class: 'kit-shell',
        d: `M${cx - rx} ${cy} L${cx - rx} ${cy + depth} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy + depth} L${cx + rx} ${cy} Z`,
        fill: p.metal ? 'url(#kit-chrome)' : 'url(#kit-shell)',
      }));
      g.append(el('ellipse', { cx, cy: cy + depth, rx, ry, class: 'kit-hoop-bottom', fill: 'none' }));
      g.append(el('ellipse', { cx, cy, rx, ry, class: 'kit-head', fill: 'url(#kit-head)' }));
      g.append(el('ellipse', { cx, cy, rx: rx * 0.82, ry: ry * 0.82, class: 'kit-ripple', fill: 'none' }));
      g.append(el('ellipse', { cx, cy, rx, ry, class: 'kit-hoop', fill: 'none' }));
      g.append(label(p, cx, cy + 2));
      return g;
    }

    function kick(p) {
      const g = el('g', { class: 'kit-piece kit-drum kit-kick', 'data-piece': p.id });
      g.append(el('circle', { cx: p.cx, cy: p.cy, r: p.r + 14, fill: 'url(#kit-shell)', class: 'kit-shell' }));
      g.append(el('circle', { cx: p.cx, cy: p.cy, r: p.r, class: 'kit-head kit-front', fill: 'url(#kit-front)' }));
      g.append(el('circle', { cx: p.cx, cy: p.cy, r: p.r * 0.8, class: 'kit-ripple', fill: 'none' }));
      g.append(el('circle', { cx: p.cx, cy: p.cy, r: p.r + 7, class: 'kit-hoop', fill: 'none' }));
      // Надпись на переднем пластике, как у настоящих установок.
      const mark = el('text', { x: p.cx, y: p.cy - 38, class: 'kit-logo', 'text-anchor': 'middle' });
      mark.textContent = App.t('Звукоряд');
      g.append(mark);
      g.append(label(p, p.cx, p.cy + 28));
      return g;
    }

    function cymbal(p, cls) {
      const g = el('g', { class: 'kit-piece kit-cymbal ' + (cls || ''), 'data-piece': p.id });
      const inner = el('g', { class: 'kit-cym', transform: `rotate(${p.tilt || 0} ${p.cx} ${p.cy})` });
      inner.append(el('ellipse', { cx: p.cx, cy: p.cy, rx: p.rx, ry: p.ry, fill: 'url(#kit-bronze)', class: 'kit-bronze' }));
      for (let i = 1; i <= 4; i++) {
        inner.append(el('ellipse', { cx: p.cx, cy: p.cy, rx: p.rx * (0.3 + i * 0.16), ry: p.ry * (0.3 + i * 0.16), class: 'kit-groove', fill: 'none' }));
      }
      inner.append(el('ellipse', { cx: p.cx, cy: p.cy, rx: p.rx * 0.2, ry: p.ry * 0.38, class: 'kit-bell', fill: 'url(#kit-bronze)' }));
      // Наклон задан атрибутом, а качание при ударе — CSS-анимацией на обёртке, чтобы они не мешали друг другу.
      g.append(el('g', { class: 'kit-wobble' }, [inner]));
      g.append(label(p, p.cx, p.cy - p.ry - 12));
      return g;
    }

    function hihat(p) {
      const g = el('g', { class: 'kit-piece kit-cymbal kit-hihat' + (hatOpen ? ' open' : ''), 'data-piece': p.id });
      const bottom = el('g', { class: 'kit-cym' });
      bottom.append(el('ellipse', { cx: p.cx, cy: p.cy + 10, rx: p.rx, ry: p.ry, fill: 'url(#kit-bronze)', class: 'kit-bronze' }));
      const top = el('g', { class: 'kit-cym kit-hat-top' });
      top.append(el('ellipse', { cx: p.cx, cy: p.cy, rx: p.rx, ry: p.ry, fill: 'url(#kit-bronze)', class: 'kit-bronze' }));
      for (let i = 1; i <= 3; i++) top.append(el('ellipse', { cx: p.cx, cy: p.cy, rx: p.rx * (0.35 + i * 0.2), ry: p.ry * (0.35 + i * 0.2), class: 'kit-groove', fill: 'none' }));
      top.append(el('ellipse', { cx: p.cx, cy: p.cy, rx: p.rx * 0.2, ry: p.ry * 0.4, class: 'kit-bell', fill: 'url(#kit-bronze)' }));
      g.append(el('g', { class: 'kit-wobble' }, [bottom, top]), label(p, p.cx, p.cy - p.ry - 16));
      return g;
    }

    function pedal(p) {
      const g = el('g', { class: 'kit-piece kit-pedal', 'data-piece': p.id });
      g.append(el('rect', { x: p.cx - p.w / 2, y: p.cy - p.h / 2, width: p.w, height: p.h, rx: 8, class: 'kit-pedal-plate' }));
      const t = el('text', { x: p.cx, y: p.cy + 6, class: 'kit-pedal-label', 'text-anchor': 'middle' });
      t.textContent = ctx.showKeys() && p.keys[0] ? App.keymap.label(p.keys[0]) : '▼';
      g.append(t);
      return g;
    }

    function render() {
      svg.textContent = '';
      svg.append(defs(), el('ellipse', { cx: 500, cy: 612, rx: 490, ry: 34, class: 'kit-rug' }), stands());
      const byId = Object.fromEntries(PIECES.map((p) => [p.id, p]));
      const order = ['kick', 'tom1', 'tom2', 'floor', 'snare', 'hihat', 'crash', 'splash', 'ride', 'hhpedal', 'kickpedal'];
      order.forEach((id) => {
        const p = byId[id];
        const g = p.kind === 'kick' ? kick(p) : p.kind === 'drum' ? drum(p) : p.kind === 'hihat' ? hihat(p) : p.kind === 'pedal' ? pedal(p) : cymbal(p);
        groups[id] = g;
        svg.append(g);
      });
    }

    /* ---------- Удары ---------- */

    const byId = Object.fromEntries(PIECES.map((p) => [p.id, p]));

    function flash(id, extra) {
      const g = groups[id];
      if (!g) return;
      g.classList.remove('hit', 'hit-rim', 'hit-bell');
      void g.getBBox();
      g.classList.add('hit');
      if (extra) g.classList.add(extra);
    }

    function strike(id, vel, zone) {
      const p = byId[id];
      let sound = p.sound;
      let extra = null;
      if (zone === 'rim' && p.rim) {
        sound = p.rim;
        extra = 'hit-rim';
      } else if (zone === 'bell' && p.bell) {
        sound = p.bell;
        extra = 'hit-bell';
      } else if (p.kind === 'hihat' && (zone === 'open' || (zone !== 'closed' && hatOpen))) {
        sound = p.open;
      }
      ctx.drum(sound, vel);
      flash(id, extra);
      if (id === 'kickpedal') flash('kick');
      if (id === 'hhpedal') flash('hihat');
    }

    // Точка касания в координатах рисунка — чтобы понять, попали в центр, в обод или в колокол.
    function toSvg(x, y) {
      const m = svg.getScreenCTM();
      if (!m) return { x: 0, y: 0 };
      const pt = new DOMPoint(x, y).matrixTransform(m.inverse());
      return { x: pt.x, y: pt.y };
    }

    function where(p, e) {
      const pt = toSvg(e.clientX, e.clientY);
      if (p.kind === 'kick') return Math.hypot(pt.x - p.cx, pt.y - p.cy) / p.r;
      if (p.kind === 'pedal') return 0;
      const a = (-(p.tilt || 0) * Math.PI) / 180;
      const dx = pt.x - p.cx;
      const dy = pt.y - p.cy;
      const x = dx * Math.cos(a) - dy * Math.sin(a);
      const y = dx * Math.sin(a) + dy * Math.cos(a);
      // Ниже верхнего пластика — это уже корпус барабана: считаем ударом по ободу.
      if (p.kind === 'drum' && y > p.ry * 0.6 && Math.hypot(x / p.rx, y / p.ry) > 1) return 1.2;
      return Math.hypot(x / p.rx, y / p.ry);
    }

    App.track(svg, {
      selector: '[data-piece]',
      glide: false,
      down(g, e) {
        const p = byId[g.dataset.piece];
        const d = where(p, e);
        let zone = null;
        if (p.rim && d > 0.84) zone = 'rim';
        if (p.bell && d < 0.24) zone = 'bell';
        const cymbalLike = p.kind === 'cymbal' || p.kind === 'hihat';
        const vel = cymbalLike ? 0.72 + 0.28 * Math.min(1, d) : 1 - 0.3 * Math.min(1, d);
        strike(p.id, Math.max(0.35, vel), zone);
        return null;
      },
      up() {},
    });

    /* ---------- Клавиатура ---------- */

    const codes = {};
    PIECES.forEach((p) => {
      p.keys.forEach((c) => (codes[c] = [p.id, null]));
      (p.rimKeys || []).forEach((c) => (codes[c] = [p.id, 'rim']));
      (p.bellKeys || []).forEach((c) => (codes[c] = [p.id, 'bell']));
      (p.openKeys || []).forEach((c) => (codes[c] = [p.id, 'open']));
    });
    codes.KeyA = ['hihat', 'closed'];

    /* ---------- Хай-хэт: открыт или закрыт ---------- */

    const hat = App.ui.segmented([[false, App.t('Закрыт')], [true, App.t('Открыт')]], hatOpen, (v) => {
      hatOpen = v;
      ctx.setState('hatOpen', v);
      if (groups.hihat) groups.hihat.classList.toggle('open', v);
    }, App.t('Хай-хэт'));
    ctx.deck.append(App.h('span.deck-label', null, App.t('Хай-хэт')), hat.el);

    const K = App.keymap;
    const keysOf = (list) => list.map(K.label).filter(Boolean).join(' ');
    ctx.setHints([
      [K.label('Space'), App.t('бочка')],
      [K.label('KeyD'), App.t('малый')],
      [K.label('KeyF'), App.t('обод')],
      [K.label('KeyA'), App.t('хай-хэт')],
      [K.label('KeyS'), App.t('открытый хай-хэт')],
      [keysOf(['KeyE', 'KeyR', 'KeyJ']), App.t('томы')],
      [keysOf(['KeyQ', 'KeyW', 'KeyP']), App.t('тарелки')],
      [null, App.t('бейте по краю малого — будет удар по ободу, в центр райда — колокол')],
    ]);

    function keyActions() {
      const ZONE = { rim: App.t(' — обод'), bell: App.t(' — колокол'), open: App.t(' — открытый'), closed: App.t(' — закрытый') };
      const items = Object.keys(codes).map((code) => {
        const [id, zone] = codes[code];
        return { code, label: NAMES[id] + (ZONE[zone] || ''), piece: id };
      });
      const order = ['kick', 'snare', 'hihat', 'hhpedal', 'tom1', 'tom2', 'floor', 'crash', 'splash', 'ride'];
      items.sort((a, b) => order.indexOf(a.piece) - order.indexOf(b.piece));
      return [{ title: App.t('Установка'), items }];
    }

    render();
    ctx.preloadDrums([...new Set(PIECES.flatMap((p) => [p.sound, p.rim, p.bell, p.open]).filter(Boolean))]);

    // MIDI: номер ударного General MIDI → деталь установки.
    const GM_TO_PIECE = {};
    PIECES.forEach((p) => [[p.sound, null], [p.rim, 'rim'], [p.bell, 'bell'], [p.open, 'open']].forEach(([s, z]) => {
      const def = s && App.drumkit.sounds[s];
      if (def && !GM_TO_PIECE[def.gm]) GM_TO_PIECE[def.gm] = [p.id, z];
    }));

    return {
      keydown(code, e) {
        const hit = codes[code];
        if (!hit) return false;
        if (!e.repeat) strike(hit[0], App.keyVel(e, 0.9), hit[1]);
        return true;
      },
      keyup: (code) => !!codes[code],
      external(midi, on, vel) {
        if (!on) return;
        const hit = GM_TO_PIECE[midi];
        if (hit) strike(hit[0], vel, hit[1]);
        else {
          const sound = Object.keys(App.drumkit.sounds).find((s) => App.drumkit.sounds[s].gm === midi);
          if (sound) ctx.drum(sound, vel);
        }
      },
      releaseAll() {},
      refresh: render,
      keyActions,
      destroy() {},
    };
  };
})();
