/* Нотные утилиты: частоты, названия, цвета нот и раскладки компьютерной клавиатуры. */
(function () {
  const App = (window.App = window.App || {});

  const LATIN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const RU = ['До', 'До♯', 'Ре', 'Ре♯', 'Ми', 'Фа', 'Фа♯', 'Соль', 'Соль♯', 'Ля', 'Ля♯', 'Си'];
  const SOLFEGE = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  // По-немецки «си» — это H (а B у них — си-бемоль).
  const NAMES = { ru: RU, latin: App.i18n.lang === 'de' ? LATIN.map((n) => (n === 'B' ? 'H' : n)) : LATIN, solfege: SOLFEGE };
  const FILE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const PARSE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };

  // Цвет каждой ступени — как у школьных «бумвекеров»: До красный, Ре оранжевый, Ми жёлтый…
  const COLORS = [
    '#e5484d', '#ef6a3a', '#f5923a', '#f7b23b', '#f2cf3a', '#8fcf4c',
    '#3fbf7f', '#2bb3ad', '#3b98de', '#6c68e6', '#9a5fe0', '#d65bb5',
  ];

  const pc = (m) => ((Math.round(m) % 12) + 12) % 12;

  App.notes = {
    freq: (m) => 440 * Math.pow(2, (m - 69) / 12),
    midiFromFreq: (f) => 69 + 12 * Math.log2(f / 440),
    pc,
    octave: (m) => Math.floor(Math.round(m) / 12) - 1,
    isBlack: (m) => [1, 3, 6, 8, 10].includes(pc(m)),
    color: (m) => COLORS[pc(m)],
    colors: COLORS,
    fileName: (m) => FILE[pc(m)] + (Math.floor(m / 12) - 1),
    /**
     * mode: 'ru' (До Ре Ми) | 'latin' (C D E) | 'solfege' (Do Re Mi) | 'none'.
     * Без режима — как принято в языке интерфейса.
     */
    name(m, mode, withOctave) {
      if (mode === 'none') return '';
      const key = NAMES[mode] ? mode : App.i18n.noteMode;
      const base = NAMES[key][pc(m)];
      return withOctave ? base + (key === 'latin' ? App.notes.octave(m) : subOctave(m)) : base;
    },
    /** Аккорд «Hm» так пишут по-русски и по-немецки, а в остальных языках это «Bm». */
    chordName: (name) => (['ru', 'de'].includes(App.i18n.lang) ? name : name.replace(/^H/, 'B')),
    /** Какими подписями называть ноту в тексте, если человек выбрал «без подписей». */
    shown: (mode) => (mode && mode !== 'none' ? mode : App.i18n.noteMode),
    /** 'C4', 'F#3', 'Bb2' → midi */
    parse(s) {
      const r = /^([A-Ha-h])([#b♯♭]?)(-?\d)$/.exec(s.trim());
      if (!r) return null;
      let n = PARSE[r[1].toUpperCase()];
      if (r[2] === '#' || r[2] === '♯') n++;
      if (r[2] === 'b' || r[2] === '♭') n--;
      return n + (parseInt(r[3], 10) + 1) * 12;
    },
  };

  function subOctave(m) {
    const digits = '₀₁₂₃₄₅₆₇₈₉';
    const o = App.notes.octave(m);
    return o < 0 ? '' : digits[o] || '';
  }

  /* ---------- Клавиатура компьютера (по физическим клавишам, работает в любой раскладке) ---------- */

  const LABEL = {
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[',
    BracketRight: ']', Equal: '=', Minus: '-', Backquote: '`', Backslash: '\\', IntlBackslash: '\\', Space: App.t('Пробел'),
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ShiftLeft: 'Shift', ShiftRight: App.t('Shift справа'),
    Enter: 'Enter', NumpadEnter: 'Num Enter', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', CapsLock: 'Caps',
    NumpadAdd: 'Num +', NumpadSubtract: 'Num −', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num ,',
  };
  // На немецкой клавиатуре (QWERTZ) Z и Y поменяны местами, а справа — умлауты.
  const DE = { KeyZ: 'Y', KeyY: 'Z', Semicolon: 'Ö', Quote: 'Ä', BracketLeft: 'Ü', BracketRight: '+', Minus: 'ß', Equal: '´', Slash: '-', Backquote: '^', Backslash: '#' };
  const local = App.i18n.lang === 'de' ? DE : {};
  /** Название клавиши или MIDI-ноты («Midi36») — как её подписать человеку. */
  const keyName = (code) => {
    if (!code) return '';
    if (local[code]) return local[code];
    if (LABEL[code]) return LABEL[code];
    const midi = /^Midi(\d+)$/.exec(code);
    if (midi) return 'MIDI ' + midi[1];
    if (/^Numpad\d$/.test(code)) return 'Num ' + code.slice(6);
    return code.replace(/^Key/, '').replace(/^Digit/, '');
  };

  /*
   * Свои клавиши. Раскладки работают с «клавишами по умолчанию» (KeyZ — До и т. д.),
   * а человек может сказать: «пусть До играет клавиша A». Для каждой раскладки хранится
   * таблица «настоящая клавиша → клавиша по умолчанию» (null — клавиша ничего не делает).
   */
  let remap = {};
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const virtual = (code) => (own(remap, code) ? remap[code] : code);
  /** Какие настоящие клавиши сейчас делают то же, что клавиша по умолчанию code. */
  const physical = (code) => {
    const list = Object.keys(remap).filter((k) => remap[k] === code);
    if (!own(remap, code)) list.unshift(code);
    return list;
  };
  // На инструменте подписываем клавишу компьютера; назначенный MIDI-пэд не подписываем.
  const keyLabel = (code) => keyName(physical(code).find((p) => !/^Midi\d+$/.test(p)));

  // «Трекерная» хроматическая раскладка: нижний ряд — первая октава, верхний — вторая и дальше.
  const CHROMATIC_LOW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM',
    'Comma', 'KeyL', 'Period', 'Semicolon', 'Slash'];
  const CHROMATIC_HIGH = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7',
    'KeyU', 'KeyI', 'Digit9', 'KeyO', 'Digit0', 'KeyP', 'BracketLeft', 'Equal', 'BracketRight'];

  const chromatic = {};
  CHROMATIC_LOW.forEach((c, i) => (chromatic[c] = i));
  CHROMATIC_HIGH.forEach((c, i) => (chromatic[c] = 12 + i));
  // Подпись на клавише: для первой октавы — нижний ряд, выше — верхний (а если там пусто — другой ряд).
  const chromaticLabel = (offset) => {
    const main = offset < 12 ? CHROMATIC_LOW[offset] : CHROMATIC_HIGH[offset - 12];
    const spare = offset < 12 ? null : CHROMATIC_LOW[offset];
    return keyLabel(main) || keyLabel(spare);
  };

  // Диатоническая раскладка (арфа, калимба, гусли): каждый ряд начинается со своей «До».
  const ROWS = [
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'],
    ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
  ];
  const diatonic = {};
  ROWS.forEach((row, r) => row.forEach((c, i) => (diatonic[c] = r * 7 + i)));
  const diatonicLabel = (degree) => {
    const row = Math.floor(degree / 7);
    const code = ROWS[row] && ROWS[row][degree - row * 7];
    return code ? keyLabel(code) : '';
  };

  // Набор клавиш для пэдов/ячеек по порядку.
  const SEQUENCE = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV',
    'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyB', 'KeyN', 'KeyM', 'Comma'];

  /** Подсказка «от … до» для ряда клавиш: пропускает клавиши, которые отключены. */
  const span = (codes) => {
    const labels = codes.map(keyLabel).filter(Boolean);
    if (labels.length <= 2) return labels.join(' ');
    return labels[0] + ' … ' + labels[labels.length - 1];
  };

  /** Список действий для настройки клавиш: ноты хроматической раскладки от base. */
  function chromaticActions(base, name, only) {
    const item = (code, off) => ({ code, label: name(base + off), color: App.notes.color(base + off) });
    const ok = (off) => !only || only(base + off);
    return [
      { title: App.t('Нижний ряд'), items: CHROMATIC_LOW.map((c, i) => ok(i) && item(c, i)).filter(Boolean) },
      { title: App.t('Верхний ряд'), items: CHROMATIC_HIGH.map((c, i) => ok(12 + i) && item(c, 12 + i)).filter(Boolean) },
    ].filter((g) => g.items.length);
  }

  /** То же для «ступенчатой» раскладки (арфа, калимба): midiOf(ступень) → нота. */
  function diatonicActions(midiOf, count, name) {
    const titles = [App.t('Нижний ряд (Z X C …)'), App.t('Средний ряд (A S D …)'), App.t('Верхний ряд (Q W E …)'), App.t('Цифры')];
    return ROWS.map((row, r) => ({
      title: titles[r],
      items: row.map((code, i) => {
        const d = r * 7 + i;
        if (d >= count) return null;
        const m = midiOf(d);
        return { code, label: name(m), color: App.notes.color(m) };
      }).filter(Boolean),
    })).filter((g) => g.items.length);
  }

  App.keymap = {
    /** Подпись клавиши, которая сейчас делает то же, что клавиша по умолчанию code. */
    label: keyLabel,
    /** Название самой клавиши, без учёта замен. */
    keyName,
    span,
    chromatic, // code → смещение в полутонах от начальной «До»
    chromaticLabel,
    chromaticLow: CHROMATIC_LOW,
    chromaticHigh: CHROMATIC_HIGH,
    chromaticActions,
    diatonic, // code → номер ступени
    diatonicLabel,
    diatonicRows: ROWS,
    diatonicActions,
    sequence: SEQUENCE,
    /** Включить замены клавиш для раскладки: map — {настоящая клавиша: клавиша по умолчанию | null}. */
    use(map) {
      remap = map || {};
    },
    /** Настоящая клавиша → клавиша по умолчанию (null — клавиша отключена). */
    virtual,
    physical,
  };

  /* ---------- Гаммы ---------- */
  App.scales = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 2, 4, 7, 9],
    minorPentatonic: [0, 3, 5, 7, 10],
    hirajoshi: [0, 2, 3, 7, 8],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    /** n-я ступень гаммы от корня → midi */
    degree(scale, root, n) {
      const len = scale.length;
      const oct = Math.floor(n / len);
      return root + oct * 12 + scale[((n % len) + len) % len];
    },
  };
})();
