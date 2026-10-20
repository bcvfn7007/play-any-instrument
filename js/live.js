/* Настоящие инструменты: MIDI (клавиатуры, электронные барабаны, MIDI-гитары) и микрофон или звуковая карта. */
(function () {
  const App = (window.App = window.App || {});
  const h = App.h;
  const N = App.notes;

  let shell = null;
  let settings = null;
  let view = null; // открытое окно: ссылки на его элементы
  const listeners = new Set();

  const live = (App.live = {
    init,
    open,
    decorate,
    summary,
    /** Поток с микрофона (включает его, если надо) — чтобы передавать живой звук друзьям. */
    micStream: () => startMic().then(() => mic.stream),
    micOn: () => mic.state === 'on',
    onMic: (fn) => listeners.add(fn),
  });

  function init(s) {
    shell = s;
    settings = s.settings;
    // Если MIDI уже разрешали раньше — подключаемся сами, без вопросов.
    if (navigator.permissions && navigator.requestMIDIAccess) {
      navigator.permissions.query({ name: 'midi' }).then((p) => {
        if (p.state === 'granted') connectMidi();
      }).catch(() => {});
    }
  }

  const noteName = (m) => N.name(m, settings.labels === 'latin' ? 'latin' : 'ru', true);

  /* =================== MIDI =================== */

  const midi = { access: null, state: 'off', text: 'Не подключено', last: null, lastTimer: null };

  function connectMidi() {
    if (!navigator.requestMIDIAccess) {
      setMidi('unsupported', 'Этот браузер не умеет работать с MIDI. Подойдут Chrome, Edge или Opera.');
      return;
    }
    if (midi.access) {
      bindMidi();
      return;
    }
    setMidi('asking', 'Спрашиваем разрешение у браузера…');
    navigator.requestMIDIAccess().then((access) => {
      midi.access = access;
      access.onstatechange = bindMidi;
      bindMidi();
    }).catch(() => setMidi('denied', 'Браузер не дал доступ к MIDI. Разрешите его в настройках сайта (значок слева от адреса).'));
  }

  function inputs() {
    const list = [];
    if (midi.access) midi.access.inputs.forEach((i) => list.push(i));
    return list;
  }

  function bindMidi() {
    const all = inputs();
    all.forEach((input) => {
      input.onmidimessage = settings.live.midiOff.includes(input.name) ? null : (e) => onMidi(e, input);
    });
    const on = all.filter((i) => !settings.live.midiOff.includes(i.name));
    if (!all.length) setMidi('empty', 'Доступ есть, но инструмент не найден. Подключите его — он появится сам.');
    else if (!on.length) setMidi('paused', 'Все MIDI-инструменты выключены.');
    else setMidi('on', 'Подключено: ' + on.map((i) => i.name).join(', '));
  }

  function setMidi(state, text) {
    midi.state = state;
    midi.text = text;
    if (view) renderMidi();
    decorate();
  }

  function onMidi(e, input) {
    const [st, d1, d2] = e.data;
    const cmd = st & 0xf0;
    const ch = st & 0x0f;
    if (cmd === 0x90 && d2 > 0) {
      if (App.keybind.capture('Midi' + d1)) return;
      const vel = Math.max(0.15, d2 / 127);
      activity(d1, d2, ch, input);
      note(d1, true, vel, ch);
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
      note(d1, false, 0, ch);
    } else if (cmd === 0xb0) {
      if (d1 === 64) shell.pedal(d2 >= 64);
      else if (d1 === 120 || d1 === 123) shell.releaseHeld(); // «все ноты выключить»
    }
  }

  function note(n, on, vel, ch) {
    // MIDI-нота, назначенная на клавишу (в «Свои клавиши»), работает как эта клавиша.
    const phys = 'Midi' + n;
    const code = App.keymap.virtual(phys);
    if (code !== phys) {
      if (code) shell.keyAction(code, on, vel);
      return;
    }
    // Электронные барабаны шлют удары на 10-м канале: на любом инструменте они звучат как барабаны.
    if (ch === 9 && settings.live.drumChannel && !shell.isDrums()) {
      if (on) shell.drumGM(n, vel);
      return;
    }
    shell.external(n, on, vel, 'midi');
  }

  function activity(n, velocity, ch, input) {
    midi.last = { n, velocity, ch, name: input.name };
    if (view) renderLast();
    document.querySelectorAll('.live-btn').forEach((b) => {
      b.classList.remove('ping');
      void b.offsetWidth;
      b.classList.add('ping');
    });
  }

  /* =================== Микрофон =================== */

  const RAW = 4096; // окно анализа: ~85 мс — хватает и для низкой «ми» бас-гитары
  const mic = {
    state: 'off', // off | starting | on | denied | error
    text: '',
    stream: null,
    source: null,
    analyser: null,
    monitor: null,
    timer: null,
    note: null, // какую ноту сейчас слышим (её же сыграли на сайте, если sent)
    sent: false,
    pitch: null, // точная высота в полутонах (с дробной частью)
    db: -120,
    devices: [],
  };
  let raw = null;
  const detect = App.pitch.detector(RAW);

  async function startMic() {
    if (mic.state === 'on') return;
    if (mic.starting) return mic.starting;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMic('error', window.isSecureContext === false
        ? 'Микрофон работает только на защищённом адресе (https) или на localhost.'
        : 'Этот браузер не даёт доступ к микрофону.');
      throw new Error('no-mic');
    }
    const ac = App.audio.ensure();
    setMic('starting', 'Спрашиваем разрешение на микрофон…');
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    const want = settings.live.deviceId;
    mic.starting = (async () => {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: want ? Object.assign({ deviceId: { exact: want } }, audio) : audio });
      } catch (err) {
        if (want && err && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
          settings.live.deviceId = ''; // устройство отключили — берём то, что есть
          stream = await navigator.mediaDevices.getUserMedia({ audio });
        } else throw err;
      }
      mic.stream = stream;
      mic.source = ac.createMediaStreamSource(stream);
      mic.analyser = ac.createAnalyser();
      mic.analyser.fftSize = RAW;
      mic.source.connect(mic.analyser);
      mic.monitor = ac.createGain();
      mic.monitor.gain.value = 1;
      setMonitor(settings.live.monitor);
      raw = new Float32Array(RAW);
      stream.getAudioTracks().forEach((t) => (t.onended = () => stopMic('Микрофон отключился')));
      mic.timer = setInterval(analyze, 20);
      setMic('on', '');
      listDevices();
    })();
    try {
      await mic.starting;
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      setMic(denied ? 'denied' : 'error', denied
        ? 'Браузер не дал доступ к микрофону. Разрешите его (значок слева от адреса) и нажмите ещё раз.'
        : 'Микрофон не включился. Проверьте, что он подключён и не занят другой программой.');
      throw err;
    } finally {
      mic.starting = null;
    }
  }

  function stopMic(text) {
    tracker.reset();
    clearInterval(mic.timer);
    mic.timer = null;
    if (mic.stream) mic.stream.getTracks().forEach((t) => t.stop());
    try {
      if (mic.source) mic.source.disconnect();
      if (mic.monitor) mic.monitor.disconnect();
    } catch (e) { /* уже отключено */ }
    Object.assign(mic, { stream: null, source: null, analyser: null, monitor: null, pitch: null, db: -120 });
    setMic('off', text || '');
  }

  function setMic(state, text) {
    mic.state = state;
    mic.text = text;
    if (view) renderMic();
    decorate();
    listeners.forEach((fn) => fn(state));
  }

  function setMonitor(on) {
    if (!mic.source || !mic.monitor) return;
    try {
      mic.source.disconnect(mic.monitor);
    } catch (e) { /* не был подключён */ }
    if (on) {
      mic.source.connect(mic.monitor);
      App.audio.mixIn(mic.monitor);
    }
  }

  async function listDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      mic.devices = all.filter((d) => d.kind === 'audioinput');
    } catch (e) {
      mic.devices = [];
    }
    if (view) renderDevices();
  }

  /* ---------- Из звука — в ноты (сам алгоритм — в pitch.js) ---------- */

  const tracker = App.pitch.tracker({
    gate: () => settings.live.gate,
    change: (n, db) => setNote(n, db),
    retrigger: (db) => retrigger(db),
  });

  function analyze() {
    if (!mic.analyser) return;
    mic.analyser.getFloatTimeDomainData(raw);
    // Громкость — по последним ~20 мс, чтобы быстро замечать новый удар по струне.
    const db = App.pitch.level(raw, 1024);
    mic.db = db;
    tracker.push(db > settings.live.gate ? detect(raw, App.audio.ctx.sampleRate) : null, db);
    mic.pitch = tracker.pitch;
    if (view) renderTuner();
  }

  const velFrom = (db) => Math.max(0.35, Math.min(1, 0.4 + ((db - settings.live.gate) / 36) * 0.6));
  const playing = () => settings.live.micMode !== 'tuner' && !shell.isDrums();

  function setNote(n, db) {
    if (n === mic.note) return;
    const silent = settings.live.micMode === 'silent';
    if (mic.note != null && mic.sent) shell.external(mic.note, false, 0, 'mic', silent);
    mic.note = n;
    mic.sent = false;
    if (n != null && playing()) mic.sent = shell.external(n, true, velFrom(db), 'mic', silent);
    decorate();
  }

  function retrigger(db) {
    if (!mic.sent) return;
    const silent = settings.live.micMode === 'silent';
    shell.external(mic.note, false, 0, 'mic', silent);
    mic.sent = shell.external(mic.note, true, velFrom(db), 'mic', silent);
  }

  /* =================== Кнопка на панели =================== */

  function decorate() {
    const on = mic.state === 'on';
    document.querySelectorAll('.live-btn').forEach((b) => {
      b.classList.toggle('active', on || midi.state === 'on');
      const icon = on ? 'mic' : 'plug';
      if (b.dataset.icon !== icon) {
        b.dataset.icon = icon;
        const old = b.querySelector('svg');
        if (old) old.replaceWith(App.icon(icon));
      }
      let tag = b.querySelector('.live-note');
      if (on && !tag) {
        tag = h('span.live-note');
        b.append(tag);
      }
      if (tag) {
        tag.hidden = !on || mic.note == null;
        if (mic.note != null) {
          tag.textContent = N.name(mic.note, settings.labels === 'latin' ? 'latin' : 'ru');
          tag.style.setProperty('--c', N.color(mic.note));
        }
      }
      b.title = on ? 'Микрофон включён' + (mic.note != null ? ': слышу ' + noteName(mic.note) : '') : 'Настоящий инструмент: MIDI или микрофон';
    });
  }

  function summary() {
    const parts = [];
    if (midi.state === 'on') parts.push(midi.text);
    if (mic.state === 'on') parts.push('микрофон включён');
    return parts.length ? parts.join(' · ') : 'MIDI-клавиатура, электронные барабаны, гитара или голос через микрофон.';
  }

  /* =================== Окно «Настоящие инструменты» =================== */

  const MODES = [
    ['tuner', 'Тюнер', 'Только показывает, какую ноту вы играете и насколько точно — удобно настроить гитару или скрипку.'],
    ['play', 'Играть звуком сайта', 'Сыгранная нота звучит выбранным инструментом сайта. Голосом можно играть на трубе, свистом — на флейте.'],
    ['silent', 'Без звука', 'Сайт молчит, но слышит ваши ноты: они подсвечиваются и засчитываются в «Разучить мелодию». Играйте на своём инструменте.'],
  ];

  function open() {
    shell.closeDialogs();
    const s = settings.live;

    // ----- MIDI -----
    const midiStatus = h('p.live-status');
    const midiBtn = h('button.btn', { type: 'button', onClick: connectMidi }, App.icon('midi'), 'Подключить MIDI');
    const midiList = h('div.live-devices');
    const midiLast = h('p.note.live-last');
    const drums = App.ui.segmented([[true, 'Как барабаны'], [false, 'Как обычные ноты']], s.drumChannel, (v) => {
      s.drumChannel = v;
      shell.save();
    }, '10-й канал MIDI');

    // ----- Микрофон -----
    const micBtn = h('button.btn.primary', { type: 'button' });
    micBtn.addEventListener('click', () => {
      if (mic.state === 'on') stopMic();
      else startMic().catch(() => {});
    });
    const micStatus = h('p.live-status');
    const deviceSel = h('select.select.live-select', { 'aria-label': 'Микрофон или звуковая карта' });
    deviceSel.addEventListener('change', () => {
      s.deviceId = deviceSel.value;
      shell.save();
      if (mic.state === 'on') {
        stopMic();
        startMic().catch(() => {});
      }
    });
    const noteEl = h('div.tuner-note');
    const centsEl = h('div.tuner-cents');
    const needle = h('i.tuner-needle');
    const scale = h('div.tuner-scale', { 'aria-hidden': 'true' }, needle, h('i.tuner-mid'));
    const hzEl = h('div.tuner-hz');
    const meterFill = h('i');
    const gateMark = h('b');
    const meter = h('div.tuner-meter', { title: 'Громкость с микрофона. Чёрточка — порог: тише неё звук не слушаем' }, meterFill, gateMark);
    const tuner = h('div.tuner', { 'aria-live': 'off' }, noteEl, h('div.tuner-side', null, scale, centsEl, hzEl), meter);
    const modeNote = h('p.note');
    const mode = App.ui.segmented(MODES.map(([v, t]) => [v, t]), s.micMode, (v) => {
      tracker.reset(); // прошлую ноту отпускаем по старым правилам
      s.micMode = v;
      shell.save();
      renderMode();
    }, 'Что делать с нотами с микрофона');
    const gate = App.ui.slider('Порог', -75, -25, 1, s.gate, (v) => {
      s.gate = v;
      shell.save();
    }, (v) => (v <= -62 ? 'очень чутко' : v <= -48 ? 'чутко' : v <= -36 ? 'средне' : 'только громкое'));
    const monitor = App.ui.segmented([[false, 'Нет'], [true, 'Да']], s.monitor, (v) => {
      s.monitor = v;
      shell.save();
      setMonitor(v);
    }, 'Слышать живой звук через сайт');

    const content = h('div.live', null,
      h('section.live-sec', null,
        h('h3', null, App.icon('midi'), 'MIDI-инструмент'),
        h('p.note', null, 'MIDI-клавиатура, электронные барабаны, MIDI-гитара или контроллер — подключите по USB или Bluetooth. Работает в Chrome, Edge и Opera.'),
        h('div.row', null, midiBtn),
        midiStatus, midiList, midiLast,
        h('div.live-field', null, h('span.field-label', null, 'Удары на 10-м канале'), drums.el,
          h('p.note', null, 'Электронные барабаны шлют удары на 10-м канале — так они звучат барабанами даже на пианино или гитаре.')),
        shell.current() && shell.current().layout && shell.current().layout.keyActions
          ? h('button.btn.ghost', { type: 'button', onClick: () => App.keybind.open() }, App.icon('keyboard'), 'Назначить пэды и клавиши')
          : null),
      h('section.live-sec', null,
        h('h3', null, App.icon('mic'), 'Микрофон или звуковая карта'),
        h('p.note', null, 'Гитара, скрипка, флейта, голос — сайт слышит, какую ноту вы играете (по одной за раз). Электрогитару можно включить через звуковую карту.'),
        h('div.row', null, micBtn, deviceSel),
        micStatus,
        tuner,
        h('div.live-field', null, h('span.field-label', null, 'Что делать с нотами'), mode.el, modeNote),
        h('div.live-field', null, gate.el),
        h('div.live-field', null, h('span.field-label', null, 'Слышать и записывать живой звук'), monitor.el,
          h('p.note', null, 'Звук микрофона пойдёт в колонки вместе с сайтом и попадёт в «Запись». Лучше в наушниках — иначе засвистит.')),
        h('p.note', null, 'Совет: наденьте наушники, чтобы звук сайта не попадал обратно в микрофон.')));

    view = { midiStatus, midiBtn, midiList, midiLast, micBtn, micStatus, deviceSel, tuner, noteEl, centsEl, needle, hzEl, meterFill, gateMark, modeNote };
    renderMidi();
    renderLast();
    renderMic();
    renderMode();
    renderDevices();
    renderTuner();
    shell.sheet('Настоящие инструменты', content, { onClose: () => (view = null) });
  }

  function renderMidi() {
    const v = view;
    v.midiStatus.textContent = midi.text;
    v.midiStatus.dataset.state = midi.state;
    v.midiBtn.hidden = midi.state === 'on' || midi.state === 'paused' || midi.state === 'empty';
    v.midiList.textContent = '';
    inputs().forEach((input) => {
      const on = !settings.live.midiOff.includes(input.name);
      const t = App.ui.toggle(input.name, on, (yes) => {
        const off = settings.live.midiOff.filter((n) => n !== input.name);
        if (!yes) off.push(input.name);
        settings.live.midiOff = off;
        shell.save();
        bindMidi();
      }, on ? 'Выключить ' + input.name : 'Включить ' + input.name);
      v.midiList.append(t.el);
    });
  }

  function renderLast() {
    const l = midi.last;
    view.midiLast.textContent = l
      ? 'Последнее: ' + noteName(l.n) + ' (нота ' + l.n + ', сила ' + l.velocity + ', канал ' + (l.ch + 1) + ')'
      : '';
  }

  function renderMic() {
    const v = view;
    const on = mic.state === 'on';
    v.micBtn.textContent = '';
    v.micBtn.append(App.icon(on ? 'stop' : 'mic'), on ? 'Выключить микрофон' : mic.state === 'starting' ? 'Включаем…' : 'Включить микрофон');
    v.micBtn.disabled = mic.state === 'starting';
    v.micStatus.textContent = mic.text;
    v.micStatus.dataset.state = mic.state;
    v.micStatus.hidden = !mic.text;
    v.tuner.classList.toggle('off', !on);
    v.deviceSel.hidden = !on || mic.devices.length < 2;
  }

  function renderDevices() {
    const sel = view.deviceSel;
    sel.textContent = '';
    mic.devices.forEach((d, i) => sel.append(h('option', { value: d.deviceId }, d.label || 'Микрофон ' + (i + 1))));
    const cur = mic.stream && mic.stream.getAudioTracks()[0];
    const id = cur && cur.getSettings ? cur.getSettings().deviceId : settings.live.deviceId;
    if (id) sel.value = id;
    sel.hidden = mic.state !== 'on' || mic.devices.length < 2;
  }

  function renderMode() {
    const m = MODES.find((x) => x[0] === settings.live.micMode) || MODES[0];
    let text = m[2];
    if (m[0] !== 'tuner' && shell.isDrums()) text = 'На барабанах микрофон работает только как тюнер.';
    else if (m[0] !== 'tuner' && !shell.current()) text += ' Сначала выберите инструмент.';
    view.modeNote.textContent = text;
  }

  function renderTuner() {
    const v = view;
    const on = mic.state === 'on';
    const pct = (db) => Math.max(0, Math.min(100, ((db + 80) / 70) * 100));
    v.meterFill.style.width = (on ? pct(mic.db) : 0) + '%';
    v.gateMark.style.left = pct(settings.live.gate) + '%';
    const p = on ? mic.pitch : null;
    if (p == null) {
      v.noteEl.textContent = on ? '…' : '—';
      v.noteEl.style.removeProperty('--c');
      v.centsEl.textContent = on ? 'Сыграйте ноту' : 'Микрофон выключен';
      v.centsEl.dataset.tune = '';
      v.hzEl.textContent = '';
      v.needle.style.left = '50%';
      v.needle.hidden = true;
      return;
    }
    const n = Math.round(p);
    const cents = Math.round((p - n) * 100);
    v.noteEl.textContent = noteName(n);
    v.noteEl.style.setProperty('--c', N.color(n));
    v.needle.hidden = false;
    v.needle.style.left = 50 + cents + '%';
    const ok = Math.abs(cents) <= 5;
    v.centsEl.dataset.tune = ok ? 'ok' : 'off';
    const by = shell.plural(Math.abs(cents), 'цент', 'цента', 'центов');
    v.centsEl.textContent = ok ? 'Чисто' : cents < 0 ? 'Ниже на ' + by + ' — подтяните' : 'Выше на ' + by + ' — ослабьте';
    v.hzEl.textContent = N.freq(p).toFixed(1) + ' Гц';
  }
})();
