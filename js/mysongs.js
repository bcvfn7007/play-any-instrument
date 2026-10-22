/*
 * Свои мелодии: добавить из файла (MIDI, MusicXML, запись голоса), по ссылке или текстом,
 * выбрать, какую партию разучивать, и хранить в браузере.
 */
(function () {
  const App = (window.App = window.App || {});
  const h = App.h;
  const N = App.notes;

  let shell = null;
  let settings = null;

  App.mySongs = {
    init(s) {
      shell = s;
      settings = s.settings;
    },
    add,
    edit: (rec) => pick(rec, false),
    list,
    remove: (id) => App.library.remove(id),
    build,
    drumSound,
    parseText,
  };

  const MAX_FILE = 25 * 1024 * 1024;
  const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const noteName = (m) => N.name(m, N.shown(settings.labels), true);

  /* =================== Песня для разучивания =================== */

  const byProgram = new Map();
  function instFor(part) {
    if (part.drums) return App.instrumentById.drums;
    if (!byProgram.size) App.instruments.forEach((i) => i.gmProgram && byProgram.set(i.gmProgram - 1, i));
    return byProgram.get(part.program) || App.instrumentById.piano;
  }

  let drumMap = null;
  /** Номер ударного General MIDI → звук барабана сайта. */
  function drumSound(n) {
    if (!drumMap) {
      drumMap = {};
      const S = App.drumkit.sounds;
      Object.keys(S).forEach((k) => {
        if (drumMap[S[k].gm] == null) drumMap[S[k].gm] = k;
      });
      const near = { 59: 'ride', 71: 'whistle', 73: 'guiro', 78: 'cuica', 80: 'triangle', 82: 'shaker', 87: 'kick' };
      Object.keys(near).forEach((k) => drumMap[k] == null && (drumMap[k] = near[k]));
    }
    return drumMap[n] || null;
  }

  /** Ноты, начавшиеся почти одновременно (в пределах 40 мс), — один шаг: аккорд. */
  function groups(notes) {
    const out = [];
    notes.forEach((n) => {
      const g = out[out.length - 1];
      if (g && n[0] - g.t < 0.04) g.notes.push(n);
      else out.push({ t: n[0], notes: [n] });
    });
    return out;
  }

  /** Какой кусок песни разучиваем (секунды): весь или выбранный. */
  const range = (rec) => {
    const from = Math.max(0, rec.from || 0);
    const to = rec.to > from ? rec.to : Infinity;
    return { from, to };
  };

  /** Ноты партий только из выбранного куска, время — от его начала. */
  function cut(rec) {
    const { from, to } = range(rec);
    if (!from && to === Infinity) return rec.parts;
    const parts = rec.parts.map((p) => Object.assign({}, p, {
      notes: p.notes.filter((n) => n[0] >= from - 0.001 && n[0] < to).map((n) => [n[0] - from, Math.min(n[1], to - n[0]), n[2], n[3]]),
    }));
    return parts[rec.melody] && parts[rec.melody].notes.length ? parts : rec.parts;
  }

  /** Сохранённая мелодия → шаги для разучивания + аккомпанемент. */
  function build(rec) {
    const parts = cut(rec);
    const mi = parts[rec.melody] ? rec.melody : 0;
    const steps = [];
    const accomp = [];
    groups(parts[mi].notes).forEach((g) => {
      const sorted = g.notes.slice().sort((a, b) => a[2] - b[2]);
      const pickNotes = rec.voice === 'top' ? [sorted[sorted.length - 1]] : rec.voice === 'bottom' ? [sorted[0]] : sorted;
      steps.push({ t: g.t, d: Math.max(...pickNotes.map((n) => n[1])), notes: [...new Set(pickNotes.map((n) => n[2]))] });
      sorted.forEach((n) => !pickNotes.includes(n) && accomp.push({ t: n[0], d: n[1], m: n[2], v: n[3], part: mi }));
    });
    parts.forEach((p, i) => {
      if (i !== mi) p.notes.forEach((n) => accomp.push({ t: n[0], d: n[1], m: n[2], v: n[3], part: i }));
    });
    accomp.sort((a, b) => a.t - b.t);
    return {
      id: rec.id,
      title: rec.title,
      about: aboutOf(rec),
      bpm: rec.bpm,
      steps,
      accomp,
      parts: parts.map((p) => ({ name: p.name, drums: p.drums, inst: instFor(p) })),
      custom: true,
      // Запись, из которой взята мелодия: «Послушать» играет оригинал.
      audio: rec.audio || null,
      audioFrom: range(rec).from,
    };
  }

  const SOURCE = { midi: 'MIDI', xml: App.t('ноты MusicXML'), audio: App.t('из записи'), text: App.t('ноты текстом') };
  function aboutOf(rec) {
    const others = rec.parts.length - 1;
    const { from, to } = range(rec);
    const len = Math.min(to, rec.duration || 0) - from;
    const piece = from || to !== Infinity ? App.t('кусок ') + fmtTime(from) + '–' + fmtTime(Math.min(to, rec.duration || to)) : fmtTime(len);
    return [SOURCE[rec.kind] || App.t('своя'), piece, others > 0 ? App.t('с аккомпанементом') : null].filter(Boolean).join(' · ');
  }

  function list() {
    return App.library.list().then((recs) => recs.map((rec) => ({ rec, song: build(rec) })));
  }

  /* =================== Какая партия — мелодия =================== */

  function stats(part) {
    const ns = part.notes;
    const g = groups(ns);
    const poly = g.filter((x) => x.notes.length > 1).length / Math.max(1, g.length);
    const avg = ns.reduce((s, n) => s + n[2], 0) / Math.max(1, ns.length);
    let lo = 127;
    let hi = 0;
    ns.forEach((n) => {
      lo = Math.min(lo, n[2]);
      hi = Math.max(hi, n[2]);
    });
    return { count: ns.length, poly, avg, lo, hi };
  }

  const MELODY_RE = /melod|vocal|voice|lead|solo|sing|melody|мелод|вокал|голос|соло|правая|right/i;

  function guessMelody(parts) {
    let best = 0;
    let bestScore = -Infinity;
    parts.forEach((p, i) => {
      if (p.drums || !p.notes.length) return;
      const s = stats(p);
      let score = s.avg - s.poly * 25 + Math.log(s.count + 1) * 4;
      if (MELODY_RE.test(p.name)) score += 100;
      if (s.count < 8) score -= 60;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  function newRec(parsed, kind, fileName) {
    if (parsed.parts.every((p) => p.drums)) {
      throw new Error(App.t('В этом файле только ударные — мелодии для разучивания нет. Найдите MIDI, где есть мелодия.'));
    }
    const melody = guessMelody(parsed.parts);
    const base = (fileName || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
    return {
      id: 'my-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: (parsed.title || base || App.t('Моя мелодия')).slice(0, 80),
      kind,
      created: Date.now(),
      bpm: parsed.bpm || 100,
      duration: parsed.duration || 0,
      parts: parsed.parts,
      melody,
      voice: stats(parsed.parts[melody]).poly > 0.15 ? 'top' : 'all',
    };
  }

  /* =================== Окно «Добавить мелодию» =================== */

  function add() {
    shell.closeDialogs();
    const status = h('p.add-status', { hidden: true, role: 'status' });
    const say = (text, bad) => {
      status.textContent = text;
      status.hidden = !text;
      status.classList.toggle('bad', !!bad);
    };

    const input = h('input', { type: 'file', accept: '.mid,.midi,.kar,.rmi,.musicxml,.xml,.mxl,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.webm,.txt,audio/*', hidden: true });
    input.addEventListener('change', () => input.files[0] && openFile(input.files[0], say));
    const drop = h('label.drop', null,
      App.icon('download'),
      h('b', null, App.t('Выберите файл или перетащите его сюда')),
      h('small', null, App.t('MIDI (.mid), ноты MusicXML (.musicxml, .mxl) или запись (.mp3, .wav, .ogg, .m4a) — песня или просто голос')),
      input);

    const url = h('input.net-input', { type: 'url', placeholder: App.t('https://…/песня.mid'), 'aria-label': App.t('Ссылка на файл'), autocomplete: 'off' });
    const urlBtn = h('button.btn', { type: 'button' }, App.icon('link'), App.t('Загрузить'));
    const fromUrl = () => openUrl(url.value.trim(), say);
    urlBtn.addEventListener('click', fromUrl);
    url.addEventListener('keydown', (e) => e.key === 'Enter' && fromUrl());

    const title = h('input.net-input', { type: 'text', maxlength: 80, placeholder: App.t('Название'), 'aria-label': App.t('Название мелодии') });
    const text = h('textarea.notes-input', {
      rows: 4,
      spellcheck: 'false',
      'aria-label': App.t('Ноты'),
      placeholder: App.t('ми ми фа соль | соль фа ми ре | до до ре ми | ми:1.5 ре:.5 ре:2'),
    });
    const textBtn = h('button.btn', { type: 'button' }, App.icon('note'), App.t('Сохранить и разучивать'));
    textBtn.addEventListener('click', () => {
      try {
        const parsed = parseText(text.value);
        const rec = newRec(parsed, 'text');
        rec.title = title.value.trim() || App.t('Мои ноты');
        rec.text = text.value;
        save(rec);
      } catch (e) {
        say(e.message, true);
      }
    });

    const body = h('div.add-song', null,
      drop,
      status,
      h('div.add-tips', null,
        h('h3', null, App.t('Где взять мелодию')),
        h('ul', null,
          h('li', null, App.t('Наберите в поиске название песни и слово «midi» — бесплатных MIDI-файлов очень много.')),
          h('li', null, App.t('На musescore.com у любых нот есть кнопка «Скачать» → MIDI или MusicXML.')),
          h('li', null, App.t('Запись песни (mp3): сайт вытащит мелодию голоса. Из песни с музыкой это получается примерно, а точнее всего — MIDI или ноты.')),
          h('li', null, App.t('Напойте или насвистите мелодию в диктофон — такую запись сайт разберёт точно.')))),
      h('section.net-sec', null,
        h('h3', null, App.t('По ссылке на файл')),
        h('div.net-line', null, url, urlBtn),
        h('p.note', null, App.t('Нужна прямая ссылка на файл .mid или .musicxml. Если сайт не даёт скачать напрямую — сохраните файл и выберите его выше.'))),
      h('section.net-sec', null,
        h('h3', null, App.t('Или напишите ноты')),
        title,
        text,
        h('p.note', null, App.t('Ноты через пробел: «до ре ми» или «C4 D4 E4». Цифра — октава (до5 — выше). После двоеточия — длительность: ми:2 — вдвое длиннее, ми:.5 — вдвое короче. Пауза — «-», аккорд — до+ми+соль, «темп 90» — скорость.')),
        h('div.row', null, textBtn)));

    const dlg = shell.sheet(App.t('Добавить мелодию'), body, { wide: true });
    dlg.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
    dlg.addEventListener('dragleave', (e) => e.target === drop && drop.classList.remove('over'));
    dlg.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) openFile(f, say);
    });
  }

  const ext = (name) => ((/\.([a-z0-9]+)(?:$|\?)/i.exec(name || '') || [])[1] || '').toLowerCase();

  async function openFile(file, say) {
    if (file.size > MAX_FILE) return say(App.t('Файл слишком большой — до 25 МБ'), true);
    say(App.t('Читаем «') + file.name + '»…');
    try {
      const buf = await file.arrayBuffer();
      const got = await decode(buf, ext(file.name), file.type, say);
      pick(recFrom(got, file.name, file), true);
    } catch (e) {
      say(e.message || App.t('Не получилось прочитать файл'), true);
    }
  }

  async function openUrl(url, say) {
    if (!/^https?:\/\//i.test(url)) return say(App.t('Вставьте ссылку, которая начинается с https://'), true);
    say(App.t('Загружаем…'));
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      return say(App.t('Этот сайт не разрешает загружать файлы напрямую. Скачайте файл к себе и выберите его выше.'), true);
    }
    if (!res.ok) return say(App.t('Файл не нашёлся (ошибка ') + res.status + App.t('). Проверьте ссылку.'), true);
    try {
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_FILE) return say(App.t('Файл слишком большой — до 25 МБ'), true);
      let name = url.split(/[?#]/)[0].split('/').pop() || '';
      try {
        name = decodeURIComponent(name);
      } catch (e) { /* имя как есть */ }
      const type = res.headers.get('content-type') || '';
      const got = await decode(buf, ext(name), type, say);
      pick(recFrom(got, name, got.kind === 'audio' ? new Blob([buf], { type: type || 'audio/mpeg' }) : null), true);
    } catch (e) {
      say(e.message || App.t('Не получилось прочитать файл'), true);
    }
  }

  /** Разобранный файл → запись для «Моих мелодий». У записи храним и сам звук — для «Послушать» в оригинале. */
  function recFrom(got, name, blob) {
    const rec = newRec(got.parsed, got.kind, name);
    if (got.kind === 'audio') {
      rec.audio = blob;
      rec.mode = got.mode;
      decoded.set(rec.id, got.audio);
    }
    return rec;
  }

  /** Узнаём формат по расширению, а если его нет — по первым байтам. */
  async function decode(buf, extension, type, say) {
    const u8 = new Uint8Array(buf.slice(0, 64));
    const head = String.fromCharCode(...u8);
    if (/^\s*<(!doctype html|html)/i.test(head)) throw new Error(App.t('Это ссылка на страницу сайта, а не на файл. Откройте её, скачайте MIDI или MusicXML и выберите файл выше.'));
    if (['mid', 'midi', 'kar', 'rmi'].includes(extension) || head.includes('MThd')) return { parsed: App.midiFile.parse(buf), kind: 'midi' };
    if (['musicxml', 'xml', 'mxl'].includes(extension) || head.startsWith('PK') || /^\s*(﻿)?<\?xml|<score-partwise/.test(head)) {
      return { parsed: await App.musicXml.load(buf), kind: 'xml' };
    }
    if (extension === 'txt' || /^text\//.test(type)) return { parsed: parseText(new TextDecoder().decode(buf)), kind: 'text' };
    const audio = await decodeAudio(buf);
    const { parsed, mode } = await transcribe(audio, 'auto', say);
    return { parsed, kind: 'audio', audio, mode };
  }

  /* =================== Ноты из записи =================== */

  // Расшифрованный звук записи — пока открыт выбор партии (в хранилище кладём сам файл, а не его).
  const decoded = new Map();

  async function decodeAudio(buf) {
    const ac = App.audio.context();
    let audio;
    try {
      audio = await new Promise((res, rej) => ac.decodeAudioData(buf.slice(0), res, rej));
    } catch (e) {
      throw new Error(App.t('Такой файл не открыть. Подойдут MIDI, MusicXML или запись в mp3, wav, ogg, m4a.'));
    }
    if (audio.duration > 600) throw new Error(App.t('Запись длиннее 10 минут — возьмите кусок покороче'));
    if (audio.duration < 0.5) throw new Error(App.t('Запись слишком короткая'));
    return audio;
  }

  /** Звук записи — заново из сохранённого файла (когда мелодию открыли из «Моих мелодий»). */
  async function audioOf(rec) {
    if (decoded.has(rec.id)) return decoded.get(rec.id);
    if (!rec.audio) return null;
    const audio = await decodeAudio(await rec.audio.arrayBuffer());
    decoded.set(rec.id, audio);
    return audio;
  }

  /** Перевести запись в нужную частоту и число каналов; highpass — убрать гул баса и бочки. */
  async function render(audio, rate, channels, highpass) {
    const off = new OfflineAudioContext(channels, Math.ceil(audio.duration * rate), rate);
    const src = off.createBufferSource();
    src.buffer = audio;
    let node = src;
    if (highpass) {
      const f = off.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = highpass;
      f.Q.value = 0.7;
      node.connect(f);
      node = f;
    }
    node.connect(off.destination);
    src.start();
    return off.startRendering();
  }

  /**
   * mode: 'solo' — один голос или инструмент (точный разбор по высоте звука);
   * 'song' — песня с музыкой: вытаскиваем мелодию голоса; 'auto' — решаем сами.
   */
  async function transcribe(audio, mode, say) {
    say(App.t('Слушаем запись…'));
    const mono = (await render(audio, 11025, 1)).getChannelData(0);
    // Проверено на записях: у чистого голоса ясная высота в 70–98% громких мест, у песен с музыкой — в 10–40%.
    if (mode === 'auto') mode = soloShare(mono) >= 0.55 ? 'solo' : 'song';
    const notes = mode === 'solo' ? await soloNotes(mono, say) : await songNotes(audio, say);
    say('');
    if (notes.length < 3) {
      throw new Error(mode === 'solo'
        ? App.t('В записи не слышно мелодии. Нужен голос или инструмент погромче.')
        : App.t('Не получилось расслышать мелодию голоса. Попробуйте другую запись или MIDI-файл этой песни.'));
    }
    return {
      mode,
      parsed: {
        title: '',
        bpm: 100,
        duration: audio.duration,
        parts: [{ name: mode === 'solo' ? App.t('Мелодия из записи') : App.t('Мелодия голоса'), program: mode === 'solo' ? 0 : 52, drums: false, notes }],
      },
    };
  }

  const SOLO_WIN = 1024;
  const SOLO_HOP = 220; // 20 мс при 11 кГц

  function soloLevels(x) {
    const frames = Math.floor((x.length - SOLO_WIN) / SOLO_HOP);
    const levels = new Float32Array(Math.max(0, frames));
    for (let f = 0; f < frames; f++) levels[f] = App.pitch.level(x.subarray(f * SOLO_HOP + SOLO_WIN - 256, f * SOLO_HOP + SOLO_WIN), 256);
    const sorted = Array.from(levels).sort((a, b) => a - b);
    const loud = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : -120;
    return { levels, frames, gate: Math.max(-62, loud - 30) };
  }

  /** Какая доля громких мест звучит одной чистой нотой: у голоса без музыки — большая, у песни — маленькая. */
  function soloShare(x) {
    const { levels, frames, gate } = soloLevels(x);
    const detect = App.pitch.detector(SOLO_WIN);
    let loud = 0;
    let clear = 0;
    const step = Math.max(4, Math.floor(frames / 600)); // хватает нескольких сотен проб — и страница не замирает
    for (let f = 0; f < frames; f += step) {
      if (levels[f] <= gate) continue;
      loud++;
      const p = detect(x.subarray(f * SOLO_HOP, f * SOLO_HOP + SOLO_WIN), 11025);
      if (p && p.clarity > 0.9) clear++;
    }
    return loud ? clear / loud : 0;
  }

  async function soloNotes(x, say) {
    const RATE = 11025;
    const { levels, frames, gate } = soloLevels(x);
    if (frames < 5) throw new Error(App.t('Запись слишком короткая'));
    const detect = App.pitch.detector(SOLO_WIN);
    const notes = [];
    let open = null;
    let t = 0;
    const tracker = App.pitch.tracker({
      gate: () => gate,
      change(n, db) {
        if (open) {
          open[1] = Math.max(0.05, t - open[0]);
          notes.push(open);
          open = null;
        }
        if (n != null) open = [Math.max(0, t - 0.04), 0, n, Math.max(0.4, Math.min(1, 0.5 + (db - gate) / 40))];
      },
      retrigger(db) {
        this.change(null, db);
        this.change(tracker.note, db);
      },
    });
    for (let f = 0; f < frames; f++) {
      t = (f * SOLO_HOP + SOLO_WIN) / RATE;
      tracker.push(levels[f] > gate ? detect(x.subarray(f * SOLO_HOP, f * SOLO_HOP + SOLO_WIN), RATE) : null, levels[f]);
      if (f % 400 === 0) {
        say(App.t('Слушаем мелодию… ') + Math.round((f / frames) * 100) + '%');
        await new Promise((r) => setTimeout(r));
      }
    }
    tracker.reset();
    return notes.filter((n) => n[1] >= 0.07).map((n) => [Math.round(n[0] * 1000) / 1000, Math.round(n[1] * 1000) / 1000, n[2], n[3]]);
  }

  async function songNotes(audio, say) {
    const stereo = audio.numberOfChannels >= 2;
    say(App.t('Ищем голос в песне…'));
    const buf = await render(audio, App.melody.SR, stereo ? 2 : 1, 100);
    const left = buf.getChannelData(0).slice();
    const right = stereo ? buf.getChannelData(1).slice() : null;
    return App.melody.run(left, right, (p) => say(App.t('Ищем мелодию голоса… ') + Math.round(p * 100) + '%'));
  }

  /* =================== Ноты текстом =================== */

  const RU = { до: 'C', ре: 'D', ми: 'E', фа: 'F', соль: 'G', ля: 'A', си: 'B' };
  // Так пишут ноты в Испании, Бразилии, Франции и Италии.
  const SOLFEGE = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
  const REST = new Set(['-', '—', '_', 'r', 'z', 'п', 'пауза']);

  function parseText(text) {
    const tokens = String(text || '').replace(/[|,;]/g, ' ').split(/\s+/).filter(Boolean);
    let bpm = 100;
    let octave = 4;
    let t = 0;
    const notes = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i].toLowerCase();
      if (/^(темп|tempo|bpm)$/.test(tok) && +tokens[i + 1] > 0) {
        bpm = Math.max(20, Math.min(300, +tokens[++i]));
        continue;
      }
      const [name, durText] = tok.split(':');
      const beats = durText ? parseFloat(durText) : 1;
      if (!(beats > 0)) throw new Error(App.t('Не понял длительность в «') + tokens[i] + '»');
      const beat = 60 / bpm;
      if (REST.has(name)) {
        t += beats * beat;
        continue;
      }
      const chord = name.split('+').map((n) => {
        const r = /^(до|ре|ми|фа|соль|ля|си|do|re|mi|fa|sol|la|si|[a-h])(#|♯|b|♭|диез|бемоль)?(-?\d)?$/.exec(n);
        if (!r) throw new Error(App.t('Не понял ноту «') + tokens[i] + App.t('». Пишите «до ре ми» или «C4 D4 E4»'));
        const letter = RU[r[1]] || SOLFEGE[r[1]] || (r[1] === 'h' ? 'B' : r[1].toUpperCase());
        if (r[3] != null) octave = parseInt(r[3], 10);
        const acc = r[2] === '#' || r[2] === '♯' || r[2] === 'диез' ? '#' : r[2] ? 'b' : '';
        return N.parse(letter + acc + octave);
      });
      chord.forEach((m) => notes.push([Math.round(t * 1000) / 1000, Math.round(beats * beat * 0.9 * 1000) / 1000, m, 0.8]));
      t += beats * beat;
    }
    if (!notes.length) throw new Error(App.t('Напишите хотя бы несколько нот'));
    return { title: '', bpm, duration: t, parts: [{ name: App.t('Мелодия'), program: 0, drums: false, notes }] };
  }

  /* =================== Что разучивать: выбор партии =================== */

  /** «1:05» или «65» → секунды; пусто → null. */
  function parseTime(text) {
    const s = String(text || '').trim().replace(',', '.');
    if (!s) return null;
    const m = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(s);
    if (m) return +m[1] * 60 + +m[2];
    return /^\d+(\.\d+)?$/.test(s) ? +s : NaN;
  }

  function pick(rec, isNew) {
    shell.closeDialogs();
    const title = h('input.net-input', { type: 'text', maxlength: 80, value: rec.title, 'aria-label': App.t('Название') });
    const list = h('div.parts', { role: 'radiogroup', 'aria-label': App.t('Какую партию играть') });
    const voiceBox = h('div.net-field');
    const summary = h('p.note');
    const status = h('p.add-status', { hidden: true, role: 'status' });
    const say = (text, bad) => {
      status.textContent = text;
      status.hidden = !text;
      status.classList.toggle('bad', !!bad);
    };
    let preview = null;
    let busy = false;

    const stopPreview = () => {
      if (!preview) return;
      preview.voices.forEach((v) => v.kill(App.audio.ctx.currentTime));
      if (preview.audio) {
        preview.audio.pause();
        URL.revokeObjectURL(preview.audio.src);
      }
      clearTimeout(preview.timer);
      if (preview.btn) preview.btn.classList.remove('on');
      preview = null;
    };

    /** Послушать начало партии (из выбранного куска), как её сыграет сайт. */
    function listen(i, btn) {
      const was = preview && preview.i === i;
      stopPreview();
      if (was) return;
      const ac = App.audio.ensure();
      const p = cut(rec)[i];
      if (!p.notes.length) return;
      const inst = instFor(p);
      const t0 = p.notes[0][0];
      const now = ac.currentTime + 0.05;
      const voices = [];
      p.notes.filter((n) => n[0] - t0 < 12).forEach((n) => {
        if (p.drums) {
          const s = drumSound(n[2]);
          if (s) shell.band.drum(inst, 'acoustic', s, n[3], now + n[0] - t0 - ac.currentTime);
        } else voices.push(shell.band.play(inst, n[2], n[3], now + n[0] - t0, n[1]));
      });
      btn.classList.add('on');
      preview = { i, voices, btn, timer: setTimeout(stopPreview, 12500) };
    }

    /** Послушать саму запись с начала выбранного куска. */
    function listenOriginal(btn) {
      const was = preview && preview.i === 'orig';
      stopPreview();
      if (was || !rec.audio) return;
      const audio = new Audio(URL.createObjectURL(rec.audio));
      audio.currentTime = range(rec).from;
      audio.play().catch(() => {});
      btn.classList.add('on');
      preview = { i: 'orig', voices: [], btn, audio, timer: setTimeout(stopPreview, 15000) };
    }

    // Одинаковые названия (два «Рояля») различаем: какая партия выше, какая ниже.
    function labelsOf(parts) {
      const labels = parts.map((p) => p.name || instFor(p).name);
      labels.slice().forEach((name, i) => {
        const same = labels.map((n, j) => (n === name ? j : -1)).filter((j) => j >= 0);
        if (same.length < 2 || same[0] !== i) return;
        const order = same.slice().sort((a, b) => stats(parts[b]).avg - stats(parts[a]).avg);
        order.forEach((j, k) => (labels[j] = name + (same.length === 2 ? (k ? App.t(' — нижняя') : App.t(' — верхняя')) : App.t(' — партия ') + (k + 1))));
      });
      return labels;
    }

    function render() {
      const parts = rec.parts;
      const labels = labelsOf(parts);
      list.textContent = '';
      parts.forEach((p, i) => {
        const s = stats(p);
        const inst = instFor(p);
        const btn = h('button.icon-btn.part-play', { type: 'button', 'aria-label': App.t('Послушать, как сыграет сайт'), title: App.t('Послушать начало') }, App.icon('play'));
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          listen(i, btn);
        });
        const row = h('label.part' + (p.drums ? '.drums' : '') + (i === rec.melody ? '.on' : ''), null,
          h('input', { type: 'radio', name: 'part', checked: i === rec.melody, disabled: p.drums }),
          h('span.part-text', null,
            h('b', null, labels[i]),
            h('small', null, p.drums
              ? App.t('Ударные — сыграют вместе с вами')
              : (rec.kind === 'audio' ? '' : inst.name + ' · ') + shell.plural(s.count, App.t('нота'), App.t('ноты'), App.t('нот')) + ' · ' + noteName(s.lo) + '–' + noteName(s.hi) + (s.poly > 0.15 ? App.t(' · с аккордами') : ''))),
          btn);
        row.querySelector('input').addEventListener('change', () => {
          rec.melody = i;
          rec.voice = s.poly > 0.15 ? 'top' : 'all';
          render();
        });
        list.append(row);
      });
      const s = stats(parts[rec.melody]);
      voiceBox.textContent = '';
      if (s.poly > 0.15) {
        voiceBox.append(h('span.field-label', null, App.t('В этой партии есть аккорды. Что играть?')),
          App.ui.segmented([
            ['top', App.t('Мелодию'), App.t('Только верхние ноты — так звучит мелодия')],
            ['all', App.t('Всё с аккордами'), App.t('Все ноты: аккорды нажимаются вместе')],
            ['bottom', App.t('Бас'), App.t('Только нижние ноты')],
          ], rec.voice, (v) => {
            rec.voice = v;
            render();
          }, App.t('Какие ноты играть')).el);
      }
      const song = build(rec);
      const { from, to } = range(rec);
      const len = Math.min(to, rec.duration || 0) - from;
      summary.textContent = App.t('Будет ') + shell.plural(song.steps.length, App.t('шаг'), App.t('шага'), App.t('шагов')) + ' · ' + fmtTime(Math.max(0, len))
        + (rec.parts.length > 1 ? App.t('. Остальные партии сыграют вместе с вами.') : '.');
    }

    /* ---------- Запись: как разбирать ---------- */

    let modeBox = null;
    let want = rec.mode;
    if (rec.kind === 'audio' && !rec.audio) {
      // Добавлена раньше, когда сайт ещё не хранил саму запись, — разобрать по-новому нельзя.
      modeBox = h('div.net-sec', null,
        h('h3', null, App.t('Что в записи')),
        h('p.note', null, App.t('Эту мелодию сайт разбирал старым способом — как будто в записи только голос. Если в ней есть музыка, удалите мелодию и добавьте запись заново: теперь сайт умеет вытаскивать голос из песни.')));
    } else if (rec.kind === 'audio') {
      const origBtn = h('button.btn', { type: 'button', title: App.t('Послушать саму запись') }, App.icon('play'), App.t('Оригинал'));
      origBtn.addEventListener('click', () => listenOriginal(origBtn));
      const modeNote = h('p.note');
      const showNote = () => {
        modeNote.textContent = rec.mode === 'song'
          ? App.t('Мелодию голоса сайт вытащил из песни с музыкой — это получается примерно. Сравните кнопками ▶: «Оригинал» и ноты. Если звучит не так — возьмите кусок, где голос слышно лучше всего, или найдите MIDI этой песни.')
          : App.t('Сайт разобрал запись как один голос или инструмент. Если в записи есть музыка — переключите на «Песня с музыкой».');
      };
      showNote();
      const mode = App.ui.segmented([
        ['song', App.t('Песня с музыкой'), App.t('Есть и голос, и музыка: сайт вытащит мелодию голоса')],
        ['solo', App.t('Только голос или инструмент'), App.t('Без музыки на фоне: разбор точнее')],
      ], rec.mode || 'song', async (v) => {
        if (busy) {
          mode.set(want); // пока идёт разбор, переключатель показывает то, что разбирается
          return;
        }
        if (v === rec.mode) return;
        busy = true;
        want = v;
        stopPreview();
        try {
          const audio = await audioOf(rec);
          const { parsed } = await transcribe(audio, v, (t) => say(t));
          rec.mode = v;
          rec.parts = parsed.parts;
          rec.melody = 0;
          rec.voice = 'all';
          showNote();
          render();
        } catch (e) {
          say(e.message || App.t('Не получилось разобрать запись'), true);
          want = rec.mode;
          mode.set(rec.mode);
        }
        busy = false;
      }, App.t('Что в записи'));
      modeBox = h('div.net-sec', null,
        h('h3', null, App.t('Что в записи')),
        mode.el,
        modeNote,
        h('div.row', null, origBtn));
    }

    /* ---------- Кусок песни ---------- */

    const fromIn = h('input.net-input.time-input', { type: 'text', inputmode: 'decimal', placeholder: '0:00', value: rec.from ? fmtTime(rec.from) : '', 'aria-label': App.t('С какого места') });
    const toIn = h('input.net-input.time-input', { type: 'text', inputmode: 'decimal', placeholder: fmtTime(rec.duration || 0), value: rec.to ? fmtTime(rec.to) : '', 'aria-label': App.t('До какого места') });
    const applyRange = () => {
      const a = parseTime(fromIn.value);
      const b = parseTime(toIn.value);
      if (Number.isNaN(a) || Number.isNaN(b)) return say(App.t('Время пишите так: 1:05'), true);
      if (a != null && b != null && b <= a) return say(App.t('Конец куска должен быть позже начала'), true);
      say('');
      rec.from = a || 0;
      rec.to = b || 0;
      stopPreview();
      render();
    };
    fromIn.addEventListener('change', applyRange);
    toIn.addEventListener('change', applyRange);
    const rangeBox = (rec.duration || 0) > 20 ? h('div.net-sec', null,
      h('h3', null, App.t('Кусок песни')),
      h('div.net-line.time-line', null, h('span', null, App.t('с')), fromIn, h('span', null, App.t('по')), toIn),
      h('p.note', null, App.t('Можно учить не всю песню, а только припев или трудное место. Пусто — вся песня.'))) : null;

    const saveBtn = h('button.btn.primary', { type: 'button' }, App.icon('play'), App.t('Сохранить и разучивать'));
    saveBtn.addEventListener('click', () => {
      if (busy) return;
      rec.title = title.value.trim() || rec.title;
      stopPreview();
      if (!build(rec).steps.length) return say(App.t('В этом куске нет нот — выберите другой'), true);
      save(rec);
    });
    render();
    shell.sheet(isNew ? App.t('Что разучивать') : App.t('Мелодия: ') + rec.title, h('div.pick-song', null,
      h('div.net-sec', null, h('h3', null, App.t('Название')), title),
      modeBox,
      h('div.net-sec', null,
        h('h3', null, rec.kind === 'audio' ? App.t('Мелодия') : App.t('Какую партию играть вам')),
        rec.parts.length > 1 ? h('p.note', null, App.t('Мы угадали, где мелодия. Можно выбрать другую партию — остальные будут аккомпанементом.')) : null,
        list,
        voiceBox,
        summary),
      rangeBox,
      status,
      h('div.row', null, saveBtn)), {
      wide: true,
      onClose() {
        stopPreview();
        decoded.delete(rec.id);
      },
    });
  }

  function save(rec) {
    rec.used = Date.now();
    App.library.put(rec).then(() => {
      shell.closeDialogs();
      if (App.library.temporary()) shell.toast(App.t('Браузер не даёт сохранять: мелодия пропадёт после закрытия страницы'));
      else shell.toast('«' + rec.title + App.t('» — в моих мелодиях'));
      const song = build(rec);
      if (App.learn.can()) App.learn.start(song);
      else shell.toast(App.t('Откройте инструмент и нажмите «Разучить мелодию»'));
    }).catch(() => shell.toast(App.t('Не получилось сохранить мелодию')));
  }
})();
