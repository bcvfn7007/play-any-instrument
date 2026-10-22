/* Каталог инструментов: как выглядят, как звучат и на чём играются. */
(function () {
  const App = (window.App = window.App || {});
  const P = (s) => App.notes.parse(s);

  App.families = [
    { id: 'keys', name: App.t('Клавишные'), hue: '#6c68e6' },
    { id: 'plucked', name: App.t('Гитары и щипковые'), hue: '#f5923a' },
    { id: 'bowed', name: App.t('Смычковые'), hue: '#e5484d' },
    { id: 'winds', name: App.t('Духовые'), hue: '#2bb3ad' },
    { id: 'drums', name: App.t('Барабаны и ритм'), hue: '#d65bb5' },
    { id: 'mallets', name: App.t('Звонкие'), hue: '#f2cf3a' },
    { id: 'electronic', name: App.t('Электроника и голос'), hue: '#3b98de' },
  ];

  App.layoutNames = {
    keys: App.t('клавиши'),
    strings: App.t('гриф'),
    pads: App.t('пэды'),
    bars: App.t('пластины'),
    kalimba: App.t('язычки'),
    harp: App.t('струны'),
    circle: App.t('тон-поля'),
    xy: App.t('поле'),
    beat: App.t('секвенсор'),
    kit: App.t('установка'),
  };

  const GUITAR = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
  // Записи держат звук все 3 секунды, поэтому петля берёт длинный ровный кусок середины.
  const SUSTAIN_LOOP = [0.22, 0.88];
  const BODY = [{ type: 'peaking', f: 105, q: 1.1, g: 4 }, { type: 'peaking', f: 2400, q: 0.9, g: 2.5 }, { type: 'lowpass', f: 7500, q: 0.5 }];

  const pads = (rows) => rows.map(([sound, name, vel]) => ({ sound, name, vel }));

  // Пэды идут рядами по 4 — так же, как ряды клавиатуры компьютера (1 2 3 4, Q W E R, A S D F, Z X C V).
  const DRUM_KIT = pads([
    ['crash', App.t('Тарелка крэш')], ['splash', App.t('Сплэш')], ['ride', App.t('Тарелка райд')], ['rideBell', App.t('Колокол райда')],
    ['hatOpen', App.t('Хай-хэт открытый')], ['hatClosed', App.t('Хай-хэт')], ['tomHigh', App.t('Том высокий')], ['tomMid', App.t('Том средний')],
    ['hatPedal', App.t('Хай-хэт педалью')], ['tomLow', App.t('Том напольный')], ['clap', App.t('Хлопок')], ['cowbell', App.t('Ковбелл')],
    ['kick', App.t('Бочка')], ['snare', App.t('Малый барабан')], ['rim', App.t('Удар по ободу')], ['china', App.t('Чайна')],
  ]);

  const PERCUSSION = pads([
    ['bongoHigh', App.t('Бонго высокий')], ['bongoLow', App.t('Бонго низкий')], ['congaMute', App.t('Конга приглушённая')], ['congaHigh', App.t('Конга высокая')],
    ['congaLow', App.t('Конга низкая')], ['timbaleHigh', App.t('Тимбалес высокий')], ['timbaleLow', App.t('Тимбалес низкий')], ['cowbell', App.t('Ковбелл')],
    ['agogo', App.t('Агого')], ['tambourine', App.t('Бубен')], ['shaker', App.t('Маракасы')], ['cabasa', App.t('Кабаса')],
    ['guiro', App.t('Гуиро')], ['claves', App.t('Клавесы')], ['woodblock', App.t('Вуд-блок')], ['triangle', App.t('Треугольник')],
  ]);

  const TR808 = pads([
    ['crash', App.t('Тарелка')], ['hatOpen', App.t('Открытый хэт')], ['hatClosed', App.t('Хай-хэт')], ['cowbell', App.t('Ковбелл')],
    ['tomHigh', App.t('Том высокий')], ['tomMid', App.t('Том средний')], ['tomLow', App.t('Том низкий')], ['congaHigh', App.t('Конга')],
    ['claves', App.t('Клавесы')], ['shaker', App.t('Маракас')], ['rim', App.t('Римшот')], ['clap', App.t('Хлопок')],
    ['kick', App.t('Бочка 808')], ['kick2', App.t('Бочка короткая')], ['snare', App.t('Малый')], ['snare2', App.t('Малый звонкий')],
  ]);

  const LINN = pads([
    ['crash', App.t('Тарелка крэш')], ['ride', App.t('Тарелка райд')], ['hatOpen', App.t('Открытый хэт')], ['hatClosed', App.t('Хай-хэт')],
    ['tomHigh', App.t('Том высокий')], ['tomMid', App.t('Том средний')], ['tomLow', App.t('Том низкий')], ['hatPedal', App.t('Хэт короткий')],
    ['cowbell', App.t('Ковбелл')], ['tambourine', App.t('Бубен')], ['cabasa', App.t('Кабаса')], ['rim', App.t('Палочка по ободу')],
    ['kick', App.t('Бочка')], ['snare', App.t('Малый')], ['snare2', App.t('Малый звонкий')], ['clap', App.t('Хлопок')],
  ]);

  const TABLA = pads([
    ['tablaNa', App.t('На — звонко')], ['tablaTin', App.t('Тин')], ['tablaTun', App.t('Тун — гулко')], ['tablaTe', App.t('Те — глухо')],
    ['tablaGe', App.t('Ге — бас')], ['tablaKe', App.t('Ке — шлепок')], ['tablaDha', App.t('Дха — обе руки')], ['tablaDhin', App.t('Дхин — обе руки')],
  ]);

  const DARBUKA = pads([
    ['darbukaDoum', App.t('Дум — в центр')], ['darbukaTek', App.t('Тек — по краю')], ['darbukaKa', App.t('Ка — другой рукой')], ['darbukaSlap', App.t('Слэп')],
    ['darbukaRoll', App.t('Дробь')], ['darbukaDoum', App.t('Дум тихо'), 0.45], ['darbukaTek', App.t('Тек тихо'), 0.45], ['darbukaKa', App.t('Ка тихо'), 0.45],
  ]);

  const RUSSIAN = pads([
    ['spoons', App.t('Ложки')], ['spoonsRoll', App.t('Ложки, дробь')], ['rattle', App.t('Трещотка')], ['buben', App.t('Бубен')],
    ['sleighBells', App.t('Бубенцы')], ['korobochka', App.t('Коробочка')], ['smallBell', App.t('Колокольчик')], ['rubel', App.t('Рубель')],
  ]);

  const TAIKO = pads([
    ['taiko', App.t('Одайко — большой')], ['taikoNagado', App.t('Нагадо — средний')], ['shime', App.t('Симэ — малый')], ['taikoKa', App.t('Ка — по ободу')],
    ['kane', App.t('Канэ — гонг')], ['taiko', App.t('Одайко тихо'), 0.5], ['taikoNagado', App.t('Нагадо тихо'), 0.5], ['shime', App.t('Симэ тихо'), 0.5],
  ]);

  const HAND_DRUMS = pads([
    ['djembe', App.t('Джембе, бас')], ['djembeTone', App.t('Джембе, тон')], ['djembeSlap', App.t('Джембе, шлепок')], ['shaker', App.t('Шейкер')],
    ['cajon', App.t('Кахон, бас')], ['cajonSlap', App.t('Кахон, шлепок')], ['cajonGhost', App.t('Кахон, тихо')], ['tambourine', App.t('Бубен')],
  ]);

  const SAMPLE_KITS = ['acoustic', 'tr808', 'linn'];

  const list = [
    /* ---- Клавишные ---- */
    { id: 'piano', name: App.t('Пианино'), icon: '🎹', family: 'keys', layout: 'keys', voice: 'piano', gm: 'acoustic_grand_piano', mode: 'sustain', start: 48, tags: 'фортепиано рояль piano', featured: true },
    { id: 'epiano', name: App.t('Электропиано'), icon: '🎹', family: 'keys', layout: 'keys', voice: 'epiano', gm: 'electric_piano_1', mode: 'sustain', start: 48, tags: 'rhodes родес электро' },
    { id: 'organ', name: App.t('Электроорган'), icon: '🎹', family: 'keys', layout: 'keys', voice: 'organ', gm: 'drawbar_organ', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, release: 0.08, tags: 'хаммонд hammond' },
    { id: 'church-organ', name: App.t('Церковный орган'), icon: '⛪', family: 'keys', layout: 'keys', voice: 'churchOrgan', gm: 'church_organ', mode: 'sustain', loop: SUSTAIN_LOOP, start: 36, reverb: 2.4, release: 0.5, tags: 'орган баха' },
    { id: 'harpsichord', name: App.t('Клавесин'), icon: '🎼', family: 'keys', layout: 'keys', voice: 'pluck_harpsichord', gm: 'harpsichord', mode: 'sustain', start: 48, release: 0.12, fx: [{ type: 'highpass', f: 150, q: 0.5 }], tags: 'барокко' },
    { id: 'accordion', name: App.t('Аккордеон'), icon: '🪗', family: 'keys', layout: 'keys', voice: 'accordion', gm: 'accordion', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, tags: 'баян гармонь гармошка' },
    { id: 'celesta', name: App.t('Челеста'), icon: '✨', family: 'keys', layout: 'keys', voice: 'celesta', gm: 'celesta', mode: 'ring', start: 60, tags: 'щелкунчик' },

    /* ---- Гитары и щипковые ---- */
    { id: 'guitar', name: App.t('Акустическая гитара'), icon: '🎸', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: GUITAR, frets: 15, chords: 'guitar', voice: 'pluck_steel', gm: 'acoustic_guitar_steel', mode: 'ring', fx: BODY, start: 40, tags: 'гитара акустика шестиструнка', featured: true },
    { id: 'classical-guitar', name: App.t('Классическая гитара'), icon: '🎸', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: GUITAR, frets: 15, chords: 'guitar', voice: 'pluck_nylon', gm: 'acoustic_guitar_nylon', mode: 'ring', fx: BODY, start: 40, tags: 'испанская нейлон гитара' },
    { id: 'electric-guitar', name: App.t('Электрогитара (рок)'), icon: '⚡', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: GUITAR, frets: 17, chords: 'guitar', voice: 'pluck_electric', gm: 'overdriven_guitar', mode: 'ring', start: 40, fx: [{ type: 'highpass', f: 90, q: 0.7 }, { type: 'drive', amount: 40 }, { type: 'lowpass', f: 4200, q: 0.8 }, { type: 'peaking', f: 900, q: 1, g: 3 }], level: 0.6, tags: 'дисторшн овердрайв рок гитара' },
    { id: 'clean-guitar', name: App.t('Электрогитара (чистая)'), icon: '🎸', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: GUITAR, frets: 17, chords: 'guitar', voice: 'pluck_electric', gm: 'electric_guitar_clean', mode: 'ring', start: 40, fx: [{ type: 'chorus', rate: 0.8, depth: 0.0025 }], tags: 'фанк джаз гитара' },
    { id: 'bass', name: App.t('Бас-гитара'), icon: '🎸', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: ['E1', 'A1', 'D2', 'G2'], frets: 17, voice: 'pluck_bass', gm: 'electric_bass_finger', mode: 'ring', start: 28, fx: [{ type: 'lowpass', f: 3000, q: 0.6 }], tags: 'бас bass' },
    { id: 'ukulele', name: App.t('Укулеле'), icon: '🌺', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: ['G4', 'C4', 'E4', 'A4'], frets: 12, chords: 'ukulele', voice: 'pluck_nylon', voiceOpts: { bright: 0.62, t60: 2 }, gm: 'acoustic_guitar_nylon', mode: 'ring', fx: BODY, start: 60, tags: 'гавайская' },
    { id: 'balalaika', name: App.t('Балалайка'), icon: '🔺', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: ['E4', 'E4', 'A4'], frets: 16, chords: 'auto', voice: 'pluck_balalaika', mode: 'ring', start: 60, fx: [{ type: 'peaking', f: 1800, q: 1, g: 3 }], tags: 'русская народная' },
    { id: 'banjo', name: App.t('Банджо'), icon: '🪕', family: 'plucked', layout: 'strings', alt: ['keys'], tuning: ['G4', 'D3', 'G3', 'B3', 'D4'], frets: 15, chords: 'auto', voice: 'pluck_banjo', gm: 'banjo', mode: 'ring', start: 48, fx: [{ type: 'peaking', f: 2600, q: 1.2, g: 5 }], tags: 'кантри блюграсс' },
    { id: 'harp', name: App.t('Арфа'), icon: '🎼', family: 'plucked', layout: 'harp', alt: ['keys'], scale: 'major', root: 36, voice: 'pluck_harp', gm: 'orchestral_harp', mode: 'ring', reverb: 1.6, start: 48, tags: 'арфа ангел' },
    { id: 'gusli', name: App.t('Гусли'), icon: '🪶', family: 'plucked', layout: 'harp', style: 'gusli', scale: 'major', root: 55, count: 17, voice: 'pluck_gusli', mode: 'ring', reverb: 1.3, start: 55, tags: 'русские народные садко' },
    { id: 'koto', name: App.t('Кото'), icon: '🌸', family: 'plucked', layout: 'harp', style: 'koto', scale: 'hirajoshi', root: 50, count: 13, voice: 'pluck_koto', gm: 'koto', mode: 'ring', reverb: 1.3, start: 50, tags: 'япония японская' },
    { id: 'sitar', name: App.t('Ситар'), icon: '🪔', family: 'plucked', layout: 'keys', voice: 'pluck_sitar', gm: 'sitar', mode: 'ring', start: 48, fx: [{ type: 'peaking', f: 3000, q: 2, g: 6 }], tags: 'индия индийский' },

    /* ---- Смычковые ---- */
    { id: 'violin', name: App.t('Скрипка'), icon: '🎻', family: 'bowed', layout: 'strings', alt: ['keys'], tuning: ['G3', 'D4', 'A4', 'E5'], frets: 14, bowed: true, voice: 'strings', voiceOpts: { lp: 4800, formant: 2900 }, gm: 'violin', mode: 'sustain', loop: SUSTAIN_LOOP, start: 55, tags: 'скрипка violin', featured: true },
    { id: 'viola', name: App.t('Альт'), icon: '🎻', family: 'bowed', layout: 'strings', alt: ['keys'], tuning: ['C3', 'G3', 'D4', 'A4'], frets: 14, bowed: true, voice: 'strings', voiceOpts: { lp: 3600, formant: 2000 }, gm: 'viola', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, tags: 'альт viola' },
    { id: 'cello', name: App.t('Виолончель'), icon: '🎻', family: 'bowed', layout: 'strings', alt: ['keys'], tuning: ['C2', 'G2', 'D3', 'A3'], frets: 14, bowed: true, voice: 'strings', voiceOpts: { lp: 2400, formant: 1200, vibCents: 12 }, gm: 'cello', mode: 'sustain', loop: SUSTAIN_LOOP, start: 36, tags: 'виолончель cello' },
    { id: 'contrabass', name: App.t('Контрабас'), icon: '🎻', family: 'bowed', layout: 'strings', alt: ['keys'], tuning: ['E1', 'A1', 'D2', 'G2'], frets: 14, bowed: true, voice: 'strings', voiceOpts: { lp: 1400, formant: 700, vibCents: 10 }, gm: 'contrabass', mode: 'sustain', loop: SUSTAIN_LOOP, start: 28, tags: 'контрабас' },
    { id: 'string-orchestra', name: App.t('Струнный оркестр'), icon: '🎻', family: 'bowed', layout: 'keys', voice: 'ensemble', gm: 'string_ensemble_1', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, reverb: 1.6, release: 0.5, tags: 'оркестр струнные' },
    { id: 'pizzicato', name: App.t('Пиццикато'), icon: '🎻', family: 'bowed', layout: 'keys', voice: 'pluck_nylon', voiceOpts: { t60: 0.9, bright: 0.5 }, gm: 'pizzicato_strings', mode: 'ring', start: 48, reverb: 1.4, tags: 'щипок оркестр' },

    /* ---- Духовые ---- */
    { id: 'flute', name: App.t('Флейта'), icon: '🪈', family: 'winds', layout: 'keys', voice: 'flute', gm: 'flute', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'флейта' },
    { id: 'recorder', name: App.t('Блокфлейта'), icon: '🪈', family: 'winds', layout: 'keys', voice: 'recorder', gm: 'recorder', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'дудочка свирель сопилка' },
    { id: 'panflute', name: App.t('Флейта Пана'), icon: '🎋', family: 'winds', layout: 'keys', voice: 'panflute', gm: 'pan_flute', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'пан кугиклы' },
    { id: 'ocarina', name: App.t('Окарина'), icon: '🐦', family: 'winds', layout: 'keys', voice: 'ocarina', gm: 'ocarina', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'свистулька зельда' },
    { id: 'clarinet', name: App.t('Кларнет'), icon: '🎶', family: 'winds', layout: 'keys', voice: 'clarinet', gm: 'clarinet', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, tags: 'кларнет' },
    { id: 'oboe', name: App.t('Гобой'), icon: '🎶', family: 'winds', layout: 'keys', voice: 'oboe', gm: 'oboe', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'гобой' },
    { id: 'sax', name: App.t('Саксофон'), icon: '🎷', family: 'winds', layout: 'keys', voice: 'sax', gm: 'alto_sax', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, tags: 'сакс джаз', featured: true },
    { id: 'trumpet', name: App.t('Труба'), icon: '🎺', family: 'winds', layout: 'keys', voice: 'trumpet', gm: 'trumpet', mode: 'sustain', loop: SUSTAIN_LOOP, start: 55, tags: 'труба горн' },
    { id: 'trombone', name: App.t('Тромбон'), icon: '🎺', family: 'winds', layout: 'keys', voice: 'trombone', gm: 'trombone', mode: 'sustain', loop: SUSTAIN_LOOP, start: 40, tags: 'тромбон' },
    { id: 'horn', name: App.t('Валторна'), icon: '📯', family: 'winds', layout: 'keys', voice: 'horn', gm: 'french_horn', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, reverb: 1.4, tags: 'валторна рожок' },
    { id: 'tuba', name: App.t('Туба'), icon: '📯', family: 'winds', layout: 'keys', voice: 'tuba', gm: 'tuba', mode: 'sustain', loop: SUSTAIN_LOOP, start: 28, tags: 'туба' },
    { id: 'harmonica', name: App.t('Губная гармошка'), icon: '🎵', family: 'winds', layout: 'keys', voice: 'harmonica', gm: 'harmonica', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'гармошка блюз' },
    { id: 'bagpipe', name: App.t('Волынка'), icon: '🎶', family: 'winds', layout: 'keys', voice: 'bagpipe', gm: 'bagpipe', mode: 'sustain', loop: SUSTAIN_LOOP, start: 60, tags: 'шотландия' },

    /* ---- Барабаны и ритм ---- */
    { id: 'drums', name: App.t('Барабанная установка'), icon: '🥁', family: 'drums', layout: 'kit', alt: ['pads'], pads: DRUM_KIT, kit: 'acoustic', kits: SAMPLE_KITS, mode: 'oneshot', reverb: 0.5, tags: 'барабаны ударные drums установка', featured: true },
    { id: 'percussion', name: App.t('Латинская перкуссия'), icon: '🪘', family: 'drums', layout: 'pads', pads: PERCUSSION, kit: 'acoustic', mode: 'oneshot', reverb: 0.7, tags: 'перкуссия бонго конга тимбалес бубен маракасы треугольник' },
    { id: 'beatmaker', name: App.t('Драм-машина'), icon: '🎛️', family: 'drums', layout: 'beat', kit: 'acoustic', kits: SAMPLE_KITS, mode: 'oneshot', reverb: 0.4, tags: 'бит ритм секвенсор битмейкер', featured: true },
    { id: 'tr808', name: 'TR-808', icon: '🔴', family: 'drums', layout: 'pads', pads: TR808, kit: 'tr808', mode: 'oneshot', reverb: 0.3, tags: 'драм-машина 808 хип-хоп трэп электронные барабаны roland' },
    { id: 'linndrum', name: App.t('LinnDrum 80-х'), icon: '📼', family: 'drums', layout: 'pads', pads: LINN, kit: 'linn', mode: 'oneshot', reverb: 0.6, tags: 'драм-машина линн 80-е восьмидесятые электронные барабаны' },
    { id: 'hand-drums', name: App.t('Джембе и кахон'), icon: '🪘', family: 'drums', layout: 'pads', pads: HAND_DRUMS, mode: 'oneshot', reverb: 0.6, tags: 'джембе кахон ручные барабаны африка' },
    { id: 'tabla', name: App.t('Табла'), icon: '🪷', family: 'drums', layout: 'pads', pads: TABLA, mode: 'oneshot', reverb: 0.8, tags: 'индия индийские барабаны' },
    { id: 'darbuka', name: App.t('Дарбука'), icon: '🏺', family: 'drums', layout: 'pads', pads: DARBUKA, mode: 'oneshot', reverb: 0.7, tags: 'думбек восток арабские барабаны' },
    { id: 'taiko', name: App.t('Тайко'), icon: '⛩️', family: 'drums', layout: 'pads', pads: TAIKO, mode: 'oneshot', reverb: 1.4, tags: 'япония японские барабаны' },
    { id: 'russian-percussion', name: App.t('Ложки и трещотка'), icon: '🥄', family: 'drums', layout: 'pads', pads: RUSSIAN, mode: 'oneshot', reverb: 0.7, tags: 'русские народные ударные ложки трещотка бубен бубенцы' },
    { id: 'timpani', name: App.t('Литавры'), icon: '🥁', family: 'drums', layout: 'keys', voice: 'timpani', gm: 'timpani', mode: 'ring', start: 36, reverb: 1.6, tags: 'оркестр' },

    /* ---- Звонкие ---- */
    { id: 'xylophone', name: App.t('Ксилофон'), icon: '🌈', family: 'mallets', layout: 'bars', alt: ['keys'], voice: 'xylophone', gm: 'xylophone', mode: 'ring', start: 72, tags: 'ксилофон детский', featured: true },
    { id: 'metallophone', name: App.t('Металлофон'), icon: '🔔', family: 'mallets', layout: 'bars', alt: ['keys'], style: 'metal', voice: 'glockenspiel', gm: 'glockenspiel', mode: 'ring', start: 72, tags: 'глокеншпиль колокольчики' },
    { id: 'marimba', name: App.t('Маримба'), icon: '🪵', family: 'mallets', layout: 'bars', alt: ['keys'], style: 'wood', voice: 'marimba', gm: 'marimba', mode: 'ring', start: 48, tags: 'маримба' },
    { id: 'vibraphone', name: App.t('Вибрафон'), icon: '〰️', family: 'mallets', layout: 'bars', alt: ['keys'], style: 'metal', voice: 'vibraphone', gm: 'vibraphone', mode: 'ring', start: 53, tags: 'вибрафон джаз' },
    { id: 'kalimba', name: App.t('Калимба'), icon: '👐', family: 'mallets', layout: 'kalimba', alt: ['keys'], voice: 'kalimba', gm: 'kalimba', mode: 'ring', start: 60, tags: 'калимба мбира', featured: true },
    { id: 'handpan', name: App.t('Хэндпан'), icon: '🛸', family: 'mallets', layout: 'circle', notes: ['D3', 'A3', 'Bb3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4'], voice: 'handpan', mode: 'ring', reverb: 1.8, tags: 'ханг hang медитация' },
    { id: 'steelpan', name: App.t('Стил-драм'), icon: '🌴', family: 'mallets', layout: 'circle', style: 'steelpan', voice: 'steelpan', gm: 'steel_drums', mode: 'ring', reverb: 1.2, tags: 'карибы тринидад' },
    { id: 'bells', name: App.t('Колокола'), icon: '🔔', family: 'mallets', layout: 'keys', voice: 'tubular', gm: 'tubular_bells', mode: 'ring', start: 60, reverb: 2, tags: 'колокол звон церковь' },
    { id: 'musicbox', name: App.t('Музыкальная шкатулка'), icon: '🎁', family: 'mallets', layout: 'keys', voice: 'musicbox', gm: 'music_box', mode: 'ring', start: 60, reverb: 1.5, tags: 'шкатулка' },

    /* ---- Электроника и голос ---- */
    { id: 'synth', name: App.t('Синтезатор'), icon: '🎛️', family: 'electronic', layout: 'keys', voice: 'lead', mode: 'sustain', start: 48, editable: true, fx: [{ type: 'chorus', rate: 0.5, depth: 0.002 }], tags: 'синт synth лид', featured: true },
    { id: 'synth-bass', name: App.t('Синт-бас'), icon: '🔊', family: 'electronic', layout: 'keys', voice: 'synthBass', mode: 'sustain', start: 36, reverb: 0.3, tags: 'бас электро' },
    { id: 'pad', name: App.t('Космический пэд'), icon: '🌌', family: 'electronic', layout: 'keys', voice: 'pad', mode: 'sustain', start: 48, reverb: 2, fx: [{ type: 'chorus', rate: 0.3, depth: 0.004 }], tags: 'эмбиент космос атмосфера' },
    { id: 'chiptune', name: App.t('8-бит'), icon: '👾', family: 'electronic', layout: 'keys', voice: 'chip', mode: 'sustain', start: 60, reverb: 0.3, tags: 'денди nes игры чиптюн' },
    { id: 'theremin', name: App.t('Терменвокс'), icon: '📡', family: 'electronic', layout: 'xy', low: 48, high: 84, mode: 'sustain', reverb: 1.4, tags: 'термен theremin' },
    { id: 'choir', name: App.t('Хор'), icon: '🎤', family: 'electronic', layout: 'keys', voice: 'choir', gm: 'choir_aahs', mode: 'sustain', loop: SUSTAIN_LOOP, start: 48, reverb: 1.8, release: 0.4, tags: 'голос вокал хор' },
  ];

  /* ---------- Весь оркестр General MIDI ---------- */

  const GM_FAMILIES = [
    [App.t('Фортепиано'), 'piano', 'sustain', 48],
    [App.t('Хроматическая перкуссия'), 'marimba', 'ring', 60],
    [App.t('Органы'), 'organ', 'sustain', 48],
    [App.t('Гитары'), 'pluck_steel', 'ring', 40],
    [App.t('Басы'), 'pluck_bass', 'ring', 28],
    [App.t('Струнные'), 'strings', 'sustain', 48],
    [App.t('Ансамбли'), 'ensemble', 'sustain', 48],
    [App.t('Медные'), 'trumpet', 'sustain', 48],
    [App.t('Язычковые'), 'sax', 'sustain', 48],
    [App.t('Флейты'), 'flute', 'sustain', 60],
    [App.t('Синт-лиды'), 'lead', 'sustain', 48],
    [App.t('Синт-пэды'), 'pad', 'sustain', 48],
    [App.t('Синт-эффекты'), 'pad', 'sustain', 48],
    [App.t('Этнические'), 'pluck_sitar', 'ring', 48],
    [App.t('Перкуссионные'), 'timpani', 'ring', 48],
    [App.t('Звуковые эффекты'), 'pad', 'sustain', 48],
  ];

  const GM_NAMES = [
    App.t('Рояль'), App.t('Яркое фортепиано'), App.t('Электророяль'), App.t('Пианино «хонки-тонк»'), App.t('Электропиано Rhodes'), App.t('Электропиано FM'), App.t('Клавесин'), App.t('Клавинет'),
    App.t('Челеста'), App.t('Глокеншпиль'), App.t('Музыкальная шкатулка'), App.t('Вибрафон'), App.t('Маримба'), App.t('Ксилофон'), App.t('Трубчатые колокола'), App.t('Цимбалы'),
    App.t('Хаммонд-орган'), App.t('Перкуссионный орган'), App.t('Рок-орган'), App.t('Церковный орган'), App.t('Фисгармония'), App.t('Аккордеон'), App.t('Губная гармошка'), App.t('Бандонеон'),
    App.t('Классическая гитара'), App.t('Акустическая гитара'), App.t('Джазовая электрогитара'), App.t('Чистая электрогитара'), App.t('Приглушённая электрогитара'), App.t('Гитара с овердрайвом'), App.t('Гитара с дисторшном'), App.t('Гитарные флажолеты'),
    App.t('Акустический бас'), App.t('Бас-гитара (пальцы)'), App.t('Бас-гитара (медиатор)'), App.t('Безладовый бас'), App.t('Слэп-бас 1'), App.t('Слэп-бас 2'), App.t('Синт-бас 1'), App.t('Синт-бас 2'),
    App.t('Скрипка'), App.t('Альт'), App.t('Виолончель'), App.t('Контрабас'), App.t('Струнные тремоло'), App.t('Струнные пиццикато'), App.t('Арфа'), App.t('Литавры'),
    App.t('Струнный оркестр 1'), App.t('Струнный оркестр 2'), App.t('Синт-струнные 1'), App.t('Синт-струнные 2'), App.t('Хор «а-а»'), App.t('Голос «у-у»'), App.t('Синт-хор'), App.t('Оркестровый удар'),
    App.t('Труба'), App.t('Тромбон'), App.t('Туба'), App.t('Труба с сурдиной'), App.t('Валторна'), App.t('Медная группа'), App.t('Синт-медь 1'), App.t('Синт-медь 2'),
    App.t('Сопрано-саксофон'), App.t('Альт-саксофон'), App.t('Тенор-саксофон'), App.t('Баритон-саксофон'), App.t('Гобой'), App.t('Английский рожок'), App.t('Фагот'), App.t('Кларнет'),
    App.t('Флейта-пикколо'), App.t('Флейта'), App.t('Блокфлейта'), App.t('Флейта Пана'), App.t('Бутылка'), App.t('Сякухати'), App.t('Свисток'), App.t('Окарина'),
    App.t('Лид «квадрат»'), App.t('Лид «пила»'), App.t('Лид «каллиопа»'), App.t('Лид «чифф»'), App.t('Лид «чаранг»'), App.t('Лид «голос»'), App.t('Лид «квинты»'), App.t('Лид «бас и лид»'),
    App.t('Пэд «нью-эйдж»'), App.t('Пэд «тёплый»'), App.t('Пэд «полисинт»'), App.t('Пэд «хор»'), App.t('Пэд «смычок»'), App.t('Пэд «металл»'), App.t('Пэд «ореол»'), App.t('Пэд «свип»'),
    App.t('Эффект «дождь»'), App.t('Эффект «саундтрек»'), App.t('Эффект «кристалл»'), App.t('Эффект «атмосфера»'), App.t('Эффект «яркость»'), App.t('Эффект «гоблины»'), App.t('Эффект «эхо»'), App.t('Эффект «фантастика»'),
    App.t('Ситар'), App.t('Банджо'), App.t('Сямисэн'), App.t('Кото'), App.t('Калимба'), App.t('Волынка'), App.t('Фидл'), App.t('Шехнай'),
    App.t('Колокольчик'), App.t('Агого'), App.t('Стил-драм'), App.t('Вуд-блок'), App.t('Тайко'), App.t('Мелодический том'), App.t('Синт-барабан'), App.t('Обратная тарелка'),
    App.t('Шум ладов'), App.t('Дыхание'), App.t('Морской прибой'), App.t('Пение птиц'), App.t('Телефонный звонок'), App.t('Вертолёт'), App.t('Аплодисменты'), App.t('Выстрел'),
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
