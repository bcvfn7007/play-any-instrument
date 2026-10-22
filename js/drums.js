/* Ударные: таблица звуков, наборы живых записей (акустика, TR-808, LinnDrum) и их проигрывание. */
(function () {
  const App = (window.App = window.App || {});
  const N = App.notes;

  /*
   * Каждый звук: gm — номер в карте ударных General MIDI, synth — чем сыграть без записей,
   * group — для «глушения» (закрытый хай-хэт обрывает открытый).
   */
  const SOUNDS = {
    kick: { name: App.t('Бочка'), gm: 36, synth: 'kick' },
    kick2: { name: App.t('Бочка короткая'), gm: 35, synth: 'kick' },
    snare: { name: App.t('Малый барабан'), gm: 38, synth: 'snare' },
    snare2: { name: App.t('Малый, второй'), gm: 40, synth: 'snare' },
    rim: { name: App.t('Удар по ободу'), gm: 37, synth: 'rim' },
    clap: { name: App.t('Хлопок'), gm: 39, synth: 'clap' },
    hatClosed: { name: App.t('Хай-хэт'), gm: 42, synth: 'hatClosed', group: 'hat' },
    hatPedal: { name: App.t('Хай-хэт педалью'), gm: 44, synth: 'hatPedal', group: 'hat' },
    hatOpen: { name: App.t('Хай-хэт открытый'), gm: 46, synth: 'hatOpen', group: 'hat', open: true },
    tomHigh: { name: App.t('Том высокий'), gm: 48, synth: 'tomHigh' },
    tomMid: { name: App.t('Том средний'), gm: 45, synth: 'tomMid' },
    tomLow: { name: App.t('Том напольный'), gm: 41, synth: 'tomLow' },
    crash: { name: App.t('Тарелка крэш'), gm: 49, synth: 'crash' },
    crash2: { name: App.t('Крэш второй'), gm: 57, synth: 'crash' },
    splash: { name: App.t('Сплэш'), gm: 55, synth: 'crash' },
    china: { name: App.t('Чайна'), gm: 52, synth: 'crash' },
    ride: { name: App.t('Тарелка райд'), gm: 51, synth: 'ride' },
    rideBell: { name: App.t('Колокол райда'), gm: 53, synth: 'agogo' },
    cowbell: { name: App.t('Ковбелл'), gm: 56, synth: 'cowbell' },
    tambourine: { name: App.t('Бубен'), gm: 54, synth: 'tambourine' },
    bongoHigh: { name: App.t('Бонго высокий'), gm: 60, synth: 'bongoHigh' },
    bongoLow: { name: App.t('Бонго низкий'), gm: 61, synth: 'bongoLow' },
    congaMute: { name: App.t('Конга приглушённая'), gm: 62, synth: 'congaHigh' },
    congaHigh: { name: App.t('Конга высокая'), gm: 63, synth: 'congaHigh' },
    congaLow: { name: App.t('Конга низкая'), gm: 64, synth: 'congaLow' },
    timbaleHigh: { name: App.t('Тимбалес высокий'), gm: 65, synth: 'tomHigh' },
    timbaleLow: { name: App.t('Тимбалес низкий'), gm: 66, synth: 'tomMid' },
    agogo: { name: App.t('Агого'), gm: 67, synth: 'agogo' },
    agogoLow: { name: App.t('Агого низкий'), gm: 68, synth: 'agogo' },
    cabasa: { name: App.t('Кабаса'), gm: 69, synth: 'shaker' },
    shaker: { name: App.t('Маракасы'), gm: 70, synth: 'shaker' },
    whistle: { name: App.t('Свисток'), gm: 72, synth: 'whistle' },
    guiro: { name: App.t('Гуиро'), gm: 74, synth: 'guiro' },
    claves: { name: App.t('Клавесы'), gm: 75, synth: 'claves' },
    woodblock: { name: App.t('Вуд-блок'), gm: 76, synth: 'woodblock' },
    woodblockLow: { name: App.t('Вуд-блок низкий'), gm: 77, synth: 'woodblock' },
    cuica: { name: App.t('Куика'), gm: 79, synth: 'cuica' },
    triangle: { name: App.t('Треугольник'), gm: 81, synth: 'triangle' },
    vibraslap: { name: App.t('Вибраслэп'), gm: 58, synth: 'guiro' },
  };

  const OGG = (() => {
    try {
      return !!new Audio().canPlayType('audio/ogg; codecs="vorbis"');
    } catch (e) {
      return false;
    }
  })();

  const MACHINES = 'https://smpldsnds.github.io/drum-machines/';
  const machineUrl = (name, file) => MACHINES + name + '/' + file + (OGG ? '.ogg' : '.m4a');

  /*
   * Наборы живых записей. files: звук → файл; если у набора нет звука, берём «похожий» из near,
   * а если и его нет — играет синтез.
   */
  const KITS = {
    acoustic: {
      name: App.t('Акустика'),
      level: 1.05,
      url: (sound) => (SOUNDS[sound] && SOUNDS[sound].gm
        ? 'https://paulrosen.github.io/midi-js-soundfonts/MusyngKite/percussion-mp3/' + N.fileName(SOUNDS[sound].gm) + '.mp3'
        : null),
    },
    tr808: {
      name: 'TR-808',
      level: 1.1,
      files: {
        kick: 'kick/bd2575', kick2: 'kick/bd0010', snare: 'snare/sd2550', snare2: 'snare/sd7575', rim: 'rimshot/rs',
        clap: 'clap/cp', hatClosed: 'hihat-close/ch', hatOpen: 'hihat-open/oh25', crash: 'cymbal/cy5050',
        tomHigh: 'tom-hi/ht50', tomMid: 'mid-tom/mt50', tomLow: 'tom-low/lt50', cowbell: 'cowbell/cb',
        claves: 'clave/cl', shaker: 'maraca/ma', congaHigh: 'conga-hi/hc50', congaMute: 'conga-mid/mc50',
        congaLow: 'conga-low/lc50',
      },
      near: { hatPedal: 'hatClosed', ride: 'crash', crash2: 'crash', splash: 'crash', china: 'crash', rideBell: 'cowbell', woodblock: 'claves', cabasa: 'shaker', tambourine: 'shaker', bongoHigh: 'congaHigh', bongoLow: 'congaMute' },
      url(sound) {
        const f = this.files[sound] || this.files[this.near[sound]];
        return f ? machineUrl('TR-808', f) : null;
      },
    },
    linn: {
      name: 'LinnDrum',
      level: 0.75,
      files: {
        kick: 'kick', kick2: 'kick-alt', snare: 'snare-m', snare2: 'snare-h', rim: 'stick-m', clap: 'clap',
        hatClosed: 'hhclosed', hatPedal: 'hhclosed-short', hatOpen: 'hhopen', crash: 'crash', ride: 'ride',
        tomHigh: 'tom-h', tomMid: 'tom-m', tomLow: 'tom-l', cowbell: 'cowbell', tambourine: 'tambourine',
        cabasa: 'cabasa', congaHigh: 'conga-h', congaMute: 'conga-m', congaLow: 'conga-l',
      },
      near: { crash2: 'crash', splash: 'crash', china: 'crash', rideBell: 'cowbell', shaker: 'cabasa', bongoHigh: 'congaHigh', bongoLow: 'congaMute' },
      url(sound) {
        const f = this.files[sound] || this.files[this.near[sound]];
        return f ? machineUrl('LM-2', f) : null;
      },
    },
  };

  const lastOpen = new Map(); // набор → последний открытый хай-хэт (чтобы его обрывать)
  const tails = new WeakMap(); // запись → где на самом деле кончается звук

  // В записях акустики после удара секунды тишины — не держим голос зря.
  function soundEnd(buf) {
    if (tails.has(buf)) return tails.get(buf);
    const d = buf.getChannelData(0);
    let i = d.length - 1;
    while (i > 0 && Math.abs(d[i]) < 0.0015) i--;
    const end = Math.min(buf.duration, i / buf.sampleRate + 0.05);
    tails.set(buf, end);
    return end;
  }

  const drumkit = (App.drumkit = {
    sounds: SOUNDS,
    kits: KITS,
    name: (sound) => (SOUNDS[sound] ? SOUNDS[sound].name : sound),
    /** Чем сыграть звук без записей. */
    fallback: (sound) => (SOUNDS[sound] && SOUNDS[sound].synth) || sound,
    url: (kit, sound) => (KITS[kit] ? KITS[kit].url(sound) : null),
  });

  drumkit.preload = function (kit, sounds) {
    if (!KITS[kit]) return;
    App.sampler.resetGroup('drums:' + kit); // вдруг интернет появился — пробуем снова
    sounds.forEach((s) => {
      const url = drumkit.url(kit, s);
      if (url) App.sampler.fetchUrl(url, 'drums:' + kit);
    });
  };

  drumkit.progress = function (kit, sounds) {
    const urls = [...new Set(sounds.map((s) => drumkit.url(kit, s)).filter(Boolean))];
    let loaded = 0;
    urls.forEach((u) => App.sampler.cached(u) && loaded++);
    return { loaded, total: urls.length, failed: App.sampler.groupFailed('drums:' + kit) };
  };

  /** Сыграть удар из записи; null — записи нет (ещё не загрузилась или её нет в наборе). */
  drumkit.play = function (kit, sound, vel, dest, t) {
    const k = KITS[kit];
    const url = k && k.url(sound);
    if (!url || App.sampler.groupFailed('drums:' + kit)) return null;
    const buf = App.sampler.cached(url);
    if (!buf) {
      App.sampler.fetchUrl(url, 'drums:' + kit);
      return null;
    }
    const ctx = App.audio.ctx;
    const def = SOUNDS[sound] || {};
    if (def.group === 'hat') {
      const prev = lastOpen.get(kit);
      if (prev) prev.kill(t);
      lastOpen.delete(kit);
    }
    const v = App.synth.makeVoice(ctx, dest);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    // Тихий удар — ещё и мягче по тембру, как на настоящем барабане.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = Math.min(ctx.sampleRate / 2 - 100, 1800 + 18000 * vel * vel);
    s.connect(tone);
    tone.connect(v.out);
    v.add(s);
    const end = soundEnd(buf);
    s.start(t);
    v.out.gain.setValueAtTime(k.level * App.synth.velCurve(vel), t);
    v.out.gain.setTargetAtTime(0, t + end - 0.05, 0.015);
    v.finish(t + end + 0.05);
    if (def.open) lastOpen.set(kit, v);
    return v;
  };
})();
