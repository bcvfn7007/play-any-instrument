/* Нотные утилиты: частоты, названия, цвета нот и раскладки компьютерной клавиатуры. */
(function () {
  const App = (window.App = window.App || {});

  const LATIN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const RU = ['До', 'До♯', 'Ре', 'Ре♯', 'Ми', 'Фа', 'Фа♯', 'Соль', 'Соль♯', 'Ля', 'Ля♯', 'Си'];
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
    /** mode: 'ru' | 'latin' | 'none' */
    name(m, mode, withOctave) {
      if (mode === 'none') return '';
      const base = (mode === 'latin' ? LATIN : RU)[pc(m)];
      return withOctave ? base + (mode === 'latin' ? App.notes.octave(m) : subOctave(m)) : base;
    },
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
    BracketRight: ']', Equal: '=', Minus: '-', Backquote: '`', Space: 'Пробел',
  };
  const keyLabel = (code) =>
    LABEL[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, '');

  // «Трекерная» хроматическая раскладка: нижний ряд — первая октава, верхний — вторая и дальше.
  const CHROMATIC_LOW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM',
    'Comma', 'KeyL', 'Period', 'Semicolon', 'Slash'];
  const CHROMATIC_HIGH = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7',
    'KeyU', 'KeyI', 'Digit9', 'KeyO', 'Digit0', 'KeyP', 'BracketLeft', 'Equal', 'BracketRight'];

  const chromatic = {};
  CHROMATIC_LOW.forEach((c, i) => (chromatic[c] = i));
  CHROMATIC_HIGH.forEach((c, i) => (chromatic[c] = 12 + i));
  const chromaticLabel = {};
  CHROMATIC_HIGH.forEach((c, i) => (chromaticLabel[12 + i] = keyLabel(c)));
  CHROMATIC_LOW.slice(0, 12).forEach((c, i) => (chromaticLabel[i] = keyLabel(c)));

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

  App.keymap = {
    label: keyLabel,
    chromatic, // code → смещение в полутонах от начальной «До»
    chromaticLabel: (offset) => chromaticLabel[offset] || '',
    diatonic, // code → номер ступени
    diatonicLabel,
    sequence: SEQUENCE,
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
