/* Каталог инструментов: как выглядят, как звучат и на чём играются. */
(function () {
  const App = (window.App = window.App || {});
  const P = (s) => App.notes.parse(s);

  App.families = [
    { id: 'keys', name: 'Клавишные', hue: '#6c68e6' },
    { id: 'plucked', name: 'Гитары и щипковые', hue: '#f5923a' },
    { id: 'bowed', name: 'Смычковые', hue: '#e5484d' },
    { id: 'winds', name: 'Духовые', hue: '#2bb3ad' },
    { id: 'drums', name: 'Барабаны и ритм', hue: '#d65bb5' },
    { id: 'mallets', name: 'Звонкие', hue: '#f2cf3a' },
    { id: 'electronic', name: 'Электроника и голос', hue: '#3b98de' },
  ];

  App.layoutNames = {
    keys: 'клавиши',
    strings: 'гриф',
    pads: 'пэды',
    bars: 'пластины',
    kalimba: 'язычки',
    harp: 'струны',
    circle: 'тон-поля',
    xy: 'поле',
    beat: 'секвенсор',
  };

  const GUITAR = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
  // Записи держат звук все 3 секунды, поэтому петля берёт длинный ровный кусок середины.
  const SUSTAIN_LOOP = [0.22, 0.88];
  const BODY = [{ type: 'peaking', f: 105, q: 1.1, g: 4 }, { type: 'peaking', f: 2400, q: 0.9, g: 2.5 }, { type: 'lowpass', f: 7500, q: 0.5 }];

  const DRUM_KIT = [
    { sound: 'crash', name: 'Тарелка крэш' },
    { sound: 'ride', name: 'Тарелка райд' },
    { sound: 'hatOpen', name: 'Хай-хэт открытый' },
    { sound: 'hatClosed', name: 'Хай-хэт' },
    { sound: 'tomHigh', name: 'Том высокий' },
    { sound: 'tomMid', name: 'Том средний' },
    { sound: 'tomLow', name: 'Том напольный' },
    { sound: 'hatPedal', name: 'Хай-хэт педалью' },
    { sound: 'kick', name: 'Бочка' },
    { sound: 'snare', name: 'Малый барабан' },
    { sound: 'clap', name: 'Хлопок' },
    { sound: 'rim', name: 'Римшот' },
  ];

  const PERCUSSION = [
    { sound: 'bongoHigh', name: 'Бонго высокий' },
    { sound: 'bongoLow', name: 'Бонго низкий' },
    { sound: 'congaHigh', name: 'Конга высокая' },
    { sound: 'congaLow', name: 'Конга низкая' },
    { sound: 'djembe', name: 'Джембе' },
    { sound: 'cajon', name: 'Кахон' },
    { sound: 'cajonSlap', name: 'Кахон, шлепок' },
    { sound: 'taiko', name: 'Тайко' },
    { sound: 'tambourine', name: 'Бубен' },
    { sound: 'shaker', name: 'Шейкер' },
    { sound: 'triangle', name: 'Треугольник' },
    { sound: 'cowbell', name: 'Ковбелл' },
    { sound: 'woodblock', name: 'Вуд-блок' },
    { sound: 'claves', name: 'Клавесы' },
    { sound: 'agogo', name: 'Агого' },
    { sound: 'guiro', name: 'Гуиро' },
  ];

  const list = [
    /* ---- Клавишные ---- */
    { id: 'piano', name: 'Пианино', icon: '🎹', family: 'keys', layout: 'keys', voice: 'piano', gm: 'acoustic_grand_piano', mode: 'sustain', start: 48, tags: 'фортепиано рояль piano', featured: true },
    { id: 'epiano', name: 'Электропиано', icon: '🎹', family: 'keys', layout: 'keys', voice: 'epiano', gm: 'electric_piano_1', mode: 'sustain', start: 48, tags: 'rhodes родес электро' },
    { id: 'organ', name: 'Электроорган', icon: '🎹', family: 'keys', layout: 'keys', voice: 'organ', gm: 'drawbar_organ', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, release: 0.08, tags: 'хаммонд hammond' },
    { id: 'church-organ', name: 'Церковный орган', icon: '⛪', family: 'keys', layout: 'keys', voice: 'churchOrgan', gm: 'church_organ', mode: 'sustain', loop: SUSTAIN_LOOP, start: 36, reverb: 2.4, release: 0.5, tags: 'орган баха' },
    { id: 'harpsichord', name: 'Клавесин', icon: '🎼', family: 'keys', layout: 'keys', voice: 'pluck_harpsichord', gm: 'harpsichord', mode: 'sustain', start: 48, release: 0.12, fx: [{ type: 'highpass', f: 150, q: 0.5 }], tags: 'барокко' },
    { id: 'accordion', name: 'Аккордеон', icon: '🪗', family: 'keys', layout: 'keys', voice: 'accordion', gm: 'accordion', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, tags: 'баян гармонь гармошка' },
    { id: 'celesta', name: 'Челеста', icon: '✨', family: 'keys', layout: 'keys', voice: 'celesta', gm: 'celesta', mode: 'ring', start: 60, tags: 'щелкунчик' },

    /* ---- Гитары и щипковые ---- */
    { id: 'guitar', name: 'Акустическая гитара', icon: '🎸', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: GUITAR, frets: 15, chords: 'guitar', voice: 'pluck_steel', gm: 'acoustic_guitar_steel', mode: 'ring', fx: BODY, start: 40, tags: 'гитара акустика шестиструнка', featured: true },
    { id: 'classical-guitar', name: 'Классическая гитара', icon: '🎸', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: GUITAR, frets: 15, chords: 'guitar', voice: 'pluck_nylon', gm: 'acoustic_guitar_nylon', mode: 'ring', fx: BODY, start: 40, tags: 'испанская нейлон гитара' },
    { id: 'electric-guitar', name: 'Электрогитара (рок)', icon: '⚡', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: GUITAR, frets: 17, chords: 'guitar', voice: 'pluck_electric', gm: 'overdriven_guitar', mode: 'ring', start: 40, fx: [{ type: 'highpass', f: 90, q: 0.7 }, { type: 'drive', amount: 40 }, { type: 'lowpass', f: 4200, q: 0.8 }, { type: 'peaking', f: 900, q: 1, g: 3 }], level: 0.6, tags: 'дисторшн овердрайв рок гитара' },
    { id: 'clean-guitar', name: 'Электрогитара (чистая)', icon: '🎸', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: GUITAR, frets: 17, chords: 'guitar', voice: 'pluck_electric', gm: 'electric_guitar_clean', mode: 'ring', start: 40, fx: [{ type: 'chorus', rate: 0.8, depth: 0.0025 }], tags: 'фанк джаз гитара' },
    { id: 'bass', name: 'Бас-гитара', icon: '🎸', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: ['E1', 'A1', 'D2', 'G2'], frets: 17, voice: 'pluck_bass', gm: 'electric_bass_finger', mode: 'ring', start: 28, fx: [{ type: 'lowpass', f: 3000, q: 0.6 }], tags: 'бас bass' },
    { id: 'ukulele', name: 'Укулеле', icon: '🌺', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: ['G4', 'C4', 'E4', 'A4'], frets: 12, chords: 'ukulele', voice: 'pluck_nylon', voiceOpts: { bright: 0.62, t60: 2 }, gm: 'acoustic_guitar_nylon', mode: 'ring', fx: BODY, start: 60, tags: 'гавайская' },
    { id: 'balalaika', name: 'Балалайка', icon: '🔺', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: ['E4', 'E4', 'A4'], frets: 16, chords: 'auto', voice: 'pluck_balalaika', mode: 'ring', start: 60, fx: [{ type: 'peaking', f: 1800, q: 1, g: 3 }], tags: 'русская народная' },
    { id: 'banjo', name: 'Банджо', icon: '🪕', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: ['G4', 'D3', 'G3', 'B3', 'D4'], frets: 15, chords: 'auto', voice: 'pluck_banjo', gm: 'banjo', mode: 'ring', start: 48, fx: [{ type: 'peaking', f: 2600, q: 1.2, g: 5 }], tags: 'кантри блюграсс' },
    { id: 'harp', name: 'Арфа', icon: '🎼', family: 'plucked', layout: 'harp', alt: ['keys'], scale: 'major', root: 36, voice: 'pluck_harp', gm: 'orchestral_harp', mode: 'ring', reverb: 1.6, start: 48, tags: 'арфа ангел' },
    { id: 'gusli', name: 'Гусли', icon: '🪶', family: 'plucked', layout: 'harp', style: 'gusli', scale: 'major', root: 55, count: 17, voice: 'pluck_gusli', mode: 'ring', reverb: 1.3, start: 55, tags: 'русские народные садко' },
    { id: 'koto', name: 'Кото', icon: '🌸', family: 'plucked', layout: 'harp', style: 'koto', scale: 'hirajoshi', root: 50, count: 13, voice: 'pluck_koto', gm: 'koto', mode: 'ring', reverb: 1.3, start: 50, tags: 'япония японская' },
    { id: 'sitar', name: 'Ситар', icon: '🪔', family: 'plucked', layout: 'keys', voice: 'pluck_sitar', gm: 'sitar', mode: 'ring', start: 48, fx: [{ type: 'peaking', f: 3000, q: 2, g: 6 }], tags: 'индия индийский' },

    /* ---- Смычковые ---- */
    { id: 'violin', name: 'Скрипка', icon: '🎻', family: 'bowed', layout: 'strings', alt: ['keys'], tuning: ['G3', 'D4', 'A4', 'E5'], frets: 14, bowed: true, voice: 'strings', voiceOpts: { lp: 4800, formant: 2900 }, gm: 'violin', mode: 'sustain', loop: SUSTAIN_LOOP, start: 55, tags: 'скрипка violin', featured: true },
    { id: 'viola', name: 'Альт', icon: '🎻', family: 'bowed', layout: 'strings', alt: ['keys'], tuning: ['C3', 'G3', 'D4', 'A4'], frets: 14, bowed: true, voice: 'strings', voiceOpts: { lp: 3600, formant: 2000 }, gm: 'viola', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, tags: 'альт viola' },
    { id: 'cello', name: 'Виолончель', icon: '🎻', family: 'bowed', layout: 'strings', alt: ['keys'], tuning: ['C2', 'G2', 'D3', 'A3'], frets: 14, bowed: true, voice: 'strings', voiceOpts: { lp: 2400, formant: 1200, vibCents: 12 }, gm: 'cello', mode: 'sustain', loop: SUSTAIN_LOOP, start: 36, tags: 'виолончель cello' },
    { id: 'contrabass', name: 'Контрабас', icon: '🎻', family: 'bowed', layout: 'strings', alt: ['keys'], tuning: ['E1', 'A1', 'D2', 'G2'], frets: 14, bowed: true, voice: 'strings', voiceOpts: { lp: 1400, formant: 700, vibCents: 10 }, gm: 'contrabass', mode: 'sustain', loop: SUSTAIN_LOOP, start: 28, tags: 'контрабас' },
    { id: 'string-orchestra', name: 'Струнный оркестр', icon: '🎻', family: 'bowed', layout: 'keys', voice: 'ensemble', gm: 'string_ensemble_1', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, reverb: 1.6, release: 0.5, tags: 'оркестр струнные' },
    { id: 'pizzicato', name: 'Пиццикато', icon: '🎻', family: 'bowed', layout: 'keys', voice: 'pluck_nylon', voiceOpts: { t60: 0.9, bright: 0.5 }, gm: 'pizzicato_strings', mode: 'ring', start: 48, reverb: 1.4, tags: 'щипок оркестр' },

    /* ---- Духовые ---- */
    { id: 'flute', name: 'Флейта', icon: '🪈', family: 'winds', layout: 'keys', voice: 'flute', gm: 'flute', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'флейта' },
    { id: 'recorder', name: 'Блокфлейта', icon: '🪈', family: 'winds', layout: 'keys', voice: 'recorder', gm: 'recorder', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'дудочка свирель сопилка' },
    { id: 'panflute', name: 'Флейта Пана', icon: '🎋', family: 'winds', layout: 'keys', voice: 'panflute', gm: 'pan_flute', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'пан кугиклы' },
    { id: 'ocarina', name: 'Окарина', icon: '🐦', family: 'winds', layout: 'keys', voice: 'ocarina', gm: 'ocarina', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'свистулька зельда' },
    { id: 'clarinet', name: 'Кларнет', icon: '🎶', family: 'winds', layout: 'keys', voice: 'clarinet', gm: 'clarinet', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, tags: 'кларнет' },
    { id: 'oboe', name: 'Гобой', icon: '🎶', family: 'winds', layout: 'keys', voice: 'oboe', gm: 'oboe', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'гобой' },
    { id: 'sax', name: 'Саксофон', icon: '🎷', family: 'winds', layout: 'keys', voice: 'sax', gm: 'alto_sax', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, tags: 'сакс джаз', featured: true },
    { id: 'trumpet', name: 'Труба', icon: '🎺', family: 'winds', layout: 'keys', voice: 'trumpet', gm: 'trumpet', mode: 'sustain', loop: SUSTAIN_LOOP, start: 55, tags: 'труба горн' },
    { id: 'trombone', name: 'Тромбон', icon: '🎺', family: 'winds', layout: 'keys', voice: 'trombone', gm: 'trombone', mode: 'sustain', loop: SUSTAIN_LOOP, start: 40, tags: 'тромбон' },
    { id: 'horn', name: 'Валторна', icon: '📯', family: 'winds', layout: 'keys', voice: 'horn', gm: 'french_horn', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, reverb: 1.4, tags: 'валторна рожок' },
    { id: 'tuba', name: 'Туба', icon: '📯', family: 'winds', layout: 'keys', voice: 'tuba', gm: 'tuba', mode: 'sustain', loop: SUSTAIN_LOOP, start: 28, tags: 'туба' },
    { id: 'harmonica', name: 'Губная гармошка', icon: '🎵', family: 'winds', layout: 'keys', voice: 'harmonica', gm: 'harmonica', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'гармошка блюз' },
    { id: 'bagpipe', name: 'Волынка', icon: '🎶', family: 'winds', layout: 'keys', voice: 'bagpipe', gm: 'bagpipe', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'шотландия' },

    /* ---- Барабаны и ритм ---- */
    { id: 'drums', name: 'Барабанная установка', icon: '🥁', family: 'drums', layout: 'pads', pads: DRUM_KIT, mode: 'oneshot', reverb: 0.5, tags: 'барабаны ударные drums', featured: true },
    { id: 'percussion', name: 'Перкуссия', icon: '🪘', family: 'drums', layout: 'pads', pads: PERCUSSION, mode: 'oneshot', reverb: 0.7, tags: 'бонго конга джембе кахон бубен шейкер' },
    { id: 'beatmaker', name: 'Драм-машина', icon: '🎛️', family: 'drums', layout: 'beat', mode: 'oneshot', reverb: 0.4, tags: 'бит ритм секвенсор битмейкер', featured: true },
    { id: 'timpani', name: 'Литавры', icon: '🥁', family: 'drums', layout: 'keys', voice: 'timpani', gm: 'timpani', mode: 'ring', start: 36, reverb: 1.6, tags: 'оркестр' },

    /* ---- Звонкие ---- */
    { id: 'xylophone', name: 'Ксилофон', icon: '🌈', family: 'mallets', layout: 'bars', alt: ['keys'], voice: 'xylophone', gm: 'xylophone', mode: 'ring', start: 72, tags: 'ксилофон детский', featured: true },
    { id: 'metallophone', name: 'Металлофон', icon: '🔔', family: 'mallets', layout: 'bars', alt: ['keys'], style: 'metal', voice: 'glockenspiel', gm: 'glockenspiel', mode: 'ring', start: 72, tags: 'глокеншпиль колокольчики' },
    { id: 'marimba', name: 'Маримба', icon: '🪵', family: 'mallets', layout: 'bars', alt: ['keys'], style: 'wood', voice: 'marimba', gm: 'marimba', mode: 'ring', start: 48, tags: 'маримба' },
    { id: 'vibraphone', name: 'Вибрафон', icon: '〰️', family: 'mallets', layout: 'bars', alt: ['keys'], style: 'metal', voice: 'vibraphone', gm: 'vibraphone', mode: 'ring', start: 53, tags: 'вибрафон джаз' },
    { id: 'kalimba', name: 'Калимба', icon: '👐', family: 'mallets', layout: 'kalimba', alt: ['keys'], voice: 'kalimba', gm: 'kalimba', mode: 'ring', start: 60, tags: 'калимба мбира', featured: true },
    { id: 'handpan', name: 'Хэндпан', icon: '🛸', family: 'mallets', layout: 'circle', notes: ['D3', 'A3', 'Bb3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4'], voice: 'handpan', mode: 'ring', reverb: 1.8, tags: 'ханг hang медитация' },
    { id: 'steelpan', name: 'Стил-драм', icon: '🌴', family: 'mallets', layout: 'circle', style: 'steelpan', voice: 'steelpan', gm: 'steel_drums', mode: 'ring', reverb: 1.2, tags: 'карибы тринидад' },
    { id: 'bells', name: 'Колокола', icon: '🔔', family: 'mallets', layout: 'keys', voice: 'tubular', gm: 'tubular_bells', mode: 'ring', start: 60, reverb: 2, tags: 'колокол звон церковь' },
    { id: 'musicbox', name: 'Музыкальная шкатулка', icon: '🎁', family: 'mallets', layout: 'keys', voice: 'musicbox', gm: 'music_box', mode: 'ring', start: 60, reverb: 1.5, tags: 'шкатулка' },

    /* ---- Электроника и голос ---- */
    { id: 'synth', name: 'Синтезатор', icon: '🎛️', family: 'electronic', layout: 'keys', voice: 'lead', mode: 'sustain', start: 48, editable: true, fx: [{ type: 'chorus', rate: 0.5, depth: 0.002 }], tags: 'синт synth лид', featured: true },
    { id: 'synth-bass', name: 'Синт-бас', icon: '🔊', family: 'electronic', layout: 'keys', voice: 'synthBass', mode: 'sustain', start: 36, reverb: 0.3, tags: 'бас электро' },
    { id: 'pad', name: 'Космический пэд', icon: '🌌', family: 'electronic', layout: 'keys', voice: 'pad', mode: 'sustain', start: 48, reverb: 2, fx: [{ type: 'chorus', rate: 0.3, depth: 0.004 }], tags: 'эмбиент космос атмосфера' },
    { id: 'chiptune', name: '8-бит', icon: '👾', family: 'electronic', layout: 'keys', voice: 'chip', mode: 'sustain', start: 60, reverb: 0.3, tags: 'денди nes игры чиптюн' },
    { id: 'theremin', name: 'Терменвокс', icon: '📡', family: 'electronic', layout: 'xy', low: 48, high: 84, mode: 'sustain', reverb: 1.4, tags: 'термен theremin' },
    { id: 'choir', name: 'Хор', icon: '🎤', family: 'electronic', layout: 'keys', voice: 'choir', gm: 'choir_aahs', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, reverb: 1.8, release: 0.4, tags: 'голос вокал хор' },
  ];

  /* ---------- Весь оркестр General MIDI ---------- */

  const GM_FAMILIES = [
    ['Фортепиано', 'piano', 'sustain', 48],
    ['Хроматическая перкуссия', 'marimba', 'ring', 60],
    ['Органы', 'organ', 'sustain', 48],
    ['Гитары', 'pluck_steel', 'ring', 40],
    ['Басы', 'pluck_bass', 'ring', 28],
    ['Струнные', 'strings', 'sustain', 48],
    ['Ансамбли', 'ensemble', 'sustain', 48],
    ['Медные', 'trumpet', 'sustain', 48],
    ['Язычковые', 'sax', 'sustain', 48],
    ['Флейты', 'flute', 'sustain', 60],
    ['Синт-лиды', 'lead', 'sustain', 48],
    ['Синт-пэды', 'pad', 'sustain', 48],
    ['Синт-эффекты', 'pad', 'sustain', 48],
    ['Этнические', 'pluck_sitar', 'ring', 48],
    ['Перкуссионные', 'timpani', 'ring', 48],
    ['Звуковые эффекты', 'pad', 'sustain', 48],
  ];

  const GM_NAMES = [
    'Рояль', 'Яркое фортепиано', 'Электророяль', 'Пианино «хонки-тонк»', 'Электропиано Rhodes', 'Электропиано FM', 'Клавесин', 'Клавинет',
    'Челеста', 'Глокеншпиль', 'Музыкальная шкатулка', 'Вибрафон', 'Маримба', 'Ксилофон', 'Трубчатые колокола', 'Цимбалы',
    'Хаммонд-орган', 'Перкуссионный орган', 'Рок-орган', 'Церковный орган', 'Фисгармония', 'Аккордеон', 'Губная гармошка', 'Бандонеон',
    'Классическая гитара', 'Акустическая гитара', 'Джазовая электрогитара', 'Чистая электрогитара', 'Приглушённая электрогитара', 'Гитара с овердрайвом', 'Гитара с дисторшном', 'Гитарные флажолеты',
    'Акустический бас', 'Бас-гитара (пальцы)', 'Бас-гитара (медиатор)', 'Безладовый бас', 'Слэп-бас 1', 'Слэп-бас 2', 'Синт-бас 1', 'Синт-бас 2',
    'Скрипка', 'Альт', 'Виолончель', 'Контрабас', 'Струнные тремоло', 'Струнные пиццикато', 'Арфа', 'Литавры',
    'Струнный оркестр 1', 'Струнный оркестр 2', 'Синт-струнные 1', 'Синт-струнные 2', 'Хор «а-а»', 'Голос «у-у»', 'Синт-хор', 'Оркестровый удар',
    'Труба', 'Тромбон', 'Туба', 'Труба с сурдиной', 'Валторна', 'Медная группа', 'Синт-медь 1', 'Синт-медь 2',
    'Сопрано-саксофон', 'Альт-саксофон', 'Тенор-саксофон', 'Баритон-саксофон', 'Гобой', 'Английский рожок', 'Фагот', 'Кларнет',
    'Флейта-пикколо', 'Флейта', 'Блокфлейта', 'Флейта Пана', 'Бутылка', 'Сякухати', 'Свисток', 'Окарина',
    'Лид «квадрат»', 'Лид «пила»', 'Лид «каллиопа»', 'Лид «чифф»', 'Лид «чаранг»', 'Лид «голос»', 'Лид «квинты»', 'Лид «бас и лид»',
    'Пэд «нью-эйдж»', 'Пэд «тёплый»', 'Пэд «полисинт»', 'Пэд «хор»', 'Пэд «смычок»', 'Пэд «металл»', 'Пэд «ореол»', 'Пэд «свип»',
    'Эффект «дождь»', 'Эффект «саундтрек»', 'Эффект «кристалл»', 'Эффект «атмосфера»', 'Эффект «яркость»', 'Эффект «гоблины»', 'Эффект «эхо»', 'Эффект «фантастика»',
    'Ситар', 'Банджо', 'Сямисэн', 'Кото', 'Калимба', 'Волынка', 'Фидл', 'Шехнай',
    'Колокольчик', 'Агого', 'Стил-драм', 'Вуд-блок', 'Тайко', 'Мелодический том', 'Синт-барабан', 'Обратная тарелка',
    'Шум ладов', 'Дыхание', 'Морской прибой', 'Пение птиц', 'Телефонный звонок', 'Вертолёт', 'Аплодисменты', 'Выстрел',
  ];

  const GM_FILES = ['acoustic_grand_piano', 'bright_acoustic_piano', 'electric_grand_piano', 'honkytonk_piano', 'electric_piano_1', 'electric_piano_2', 'harpsichord', 'clavinet', 'celesta', 'glockenspiel', 'music_box', 'vibraphone', 'marimba', 'xylophone', 'tubular_bells', 'dulcimer', 'drawbar_organ', 'percussive_organ', 'rock_organ', 'church_organ', 'reed_organ', 'accordion', 'harmonica', 'tango_accordion', 'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_jazz', 'electric_guitar_clean', 'electric_guitar_muted', 'overdriven_guitar', 'distortion_guitar', 'guitar_harmonics', 'acoustic_bass', 'electric_bass_finger', 'electric_bass_pick', 'fretless_bass', 'slap_bass_1', 'slap_bass_2', 'synth_bass_1', 'synth_bass_2', 'violin', 'viola', 'cello', 'contrabass', 'tremolo_strings', 'pizzicato_strings', 'orchestral_harp', 'timpani', 'string_ensemble_1', 'string_ensemble_2', 'synth_strings_1', 'synth_strings_2', 'choir_aahs', 'voice_oohs', 'synth_choir', 'orchestra_hit', 'trumpet', 'trombone', 'tuba', 'muted_trumpet', 'french_horn', 'brass_section', 'synth_brass_1', 'synth_brass_2', 'soprano_sax', 'alto_sax', 'tenor_sax', 'baritone_sax', 'oboe', 'english_horn', 'bassoon', 'clarinet', 'piccolo', 'flute', 'recorder', 'pan_flute', 'blown_bottle', 'shakuhachi', 'whistle', 'ocarina', 'lead_1_square', 'lead_2_sawtooth', 'lead_3_calliope', 'lead_4_chiff', 'lead_5_charang', 'lead_6_voice', 'lead_7_fifths', 'lead_8_bass__lead', 'pad_1_new_age', 'pad_2_warm', 'pad_3_polysynth', 'pad_4_choir', 'pad_5_bowed', 'pad_6_metallic', 'pad_7_halo', 'pad_8_sweep', 'fx_1_rain', 'fx_2_soundtrack', 'fx_3_crystal', 'fx_4_atmosphere', 'fx_5_brightness', 'fx_6_goblins', 'fx_7_echoes', 'fx_8_scifi', 'sitar', 'banjo', 'shamisen', 'koto', 'kalimba', 'bagpipe', 'fiddle', 'shanai', 'tinkle_bell', 'agogo', 'steel_drums', 'woodblock', 'taiko_drum', 'melodic_tom', 'synth_drum', 'reverse_cymbal', 'guitar_fret_noise', 'breath_noise', 'seashore', 'bird_tweet', 'telephone_ring', 'helicopter', 'applause', 'gunshot'];

  // Тонкая настройка стартовой октавы и поведения отдельных инструментов оркестра.
  const GM_START = { 40: 55, 41: 48, 42: 36, 43: 28, 58: 28, 67: 36, 70: 36, 72: 72, 47: 36, 32: 28, 74: 60, 79: 60 };
  const GM_RING = new Set([45, 46, 55, 105, 106, 107, 108, 112, 113, 114, 115, 116, 117, 118, 47, 8, 9, 10, 11, 12, 13, 14, 15]);
  const GM_NO_LOOP = new Set([45, 55, 119, 120, 121, 122, 123, 124, 125, 126, 127, 96, 97, 98, 99, 100, 101, 102, 103]);

  App.gmFamilies = GM_FAMILIES.map((f) => f[0]);

  const gm = GM_FILES.map((file, i) => {
    const fam = GM_FAMILIES[Math.floor(i / 8)];
    const ring = fam[2] === 'ring' || GM_RING.has(i);
    return {
      id: 'gm-' + file.replace(/_+/g, '-'),
      name: GM_NAMES[i],
      icon: '🎼',
      family: 'gm',
      gmFamily: fam[0],
      gmProgram: i + 1,
      layout: 'keys',
      voice: fam[1],
      gm: file,
      mode: ring ? 'ring' : 'sustain',
      loop: ring || GM_NO_LOOP.has(i) ? null : SUSTAIN_LOOP,
      start: GM_START[i] || fam[3],
      tags: file.replace(/_/g, ' '),
    };
  });

  App.instruments = list.concat(gm);
  App.instrumentById = {};
  App.instruments.forEach((inst) => {
    inst.range = inst.range || [21, 108];
    App.instrumentById[inst.id] = inst;
  });

  /* ---------- Аккорды для грифа ---------- */

  App.chordShapes = {
    // Порядок струн — от самой толстой к самой тонкой; -1 — струна не звучит.
    guitar: [
      ['Am', [-1, 0, 2, 2, 1, 0]], ['C', [-1, 3, 2, 0, 1, 0]], ['Dm', [-1, -1, 0, 2, 3, 1]], ['E', [0, 2, 2, 1, 0, 0]],
      ['Em', [0, 2, 2, 0, 0, 0]], ['F', [1, 3, 3, 2, 1, 1]], ['G', [3, 2, 0, 0, 0, 3]], ['D', [-1, -1, 0, 2, 3, 2]],
      ['A', [-1, 0, 2, 2, 2, 0]], ['Hm', [-1, 2, 4, 4, 3, 2]], ['E7', [0, 2, 0, 1, 0, 0]], ['A7', [-1, 0, 2, 0, 2, 0]],
    ],
    ukulele: [
      ['C', [0, 0, 0, 3]], ['Am', [2, 0, 0, 0]], ['F', [2, 0, 1, 0]], ['G', [0, 2, 3, 2]], ['Em', [0, 4, 3, 2]],
      ['Dm', [2, 2, 1, 0]], ['D', [2, 2, 2, 0]], ['A', [2, 1, 0, 0]], ['E7', [1, 2, 0, 2]], ['G7', [0, 2, 1, 2]],
    ],
    auto: [['Am', [9, 0, 4]], ['C', [0, 4, 7]], ['Dm', [2, 5, 9]], ['Em', [4, 7, 11]], ['F', [5, 9, 0]], ['G', [7, 11, 2]], ['D', [2, 6, 9]], ['A', [9, 1, 4]], ['E', [4, 8, 11]]],
  };

  /** Подбирает удобную аппликатуру аккорда для любого строя (для балалайки, банджо…). */
  App.findChord = function (tuning, pcs) {
    const root = pcs[0];
    const strings = tuning.length;
    let best = null;
    const frets = new Array(strings).fill(0);
    const scoreOf = (fr) => {
      const notes = fr.map((f, i) => tuning[i] + f);
      const present = new Set(notes.map((n) => n % 12));
      if (!pcs.every((p) => present.has(p)) && strings >= pcs.length) return -1;
      if (![...present].every((p) => pcs.includes(p))) return -1;
      const lowest = Math.min(...notes);
      const span = Math.max(...fr) - Math.min(...fr.filter((f) => f > 0).concat([Math.max(...fr)]));
      if (span > 3) return -1;
      return 10 - fr.reduce((a, b) => a + b, 0) * 0.5 - span + (lowest % 12 === root ? 4 : 0) + present.size;
    };
    (function rec(i) {
      if (i === strings) {
        const s = scoreOf(frets);
        if (s >= 0 && (!best || s > best.score)) best = { score: s, frets: frets.slice() };
        return;
      }
      for (let f = 0; f <= 5; f++) {
        frets[i] = f;
        rec(i + 1);
      }
    })(0);
    return best ? best.frets : null;
  };
})();
