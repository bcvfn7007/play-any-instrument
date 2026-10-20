/*
 * Игра вместе: по нику, без регистрации. Браузеры соединяются напрямую (WebRTC),
 * а познакомиться им помогает бесплатный сервер PeerJS — он знает только ники тех, кто в сети.
 * По сети идут не звуки, а ноты: «нажата До₄ на гитаре», — и каждый слышит друга своим звуком.
 */
(function () {
  const App = (window.App = window.App || {});
  const h = App.h;
  const N = App.notes;

  const PREFIX = 'zvukoryad-';
  const LIBS = [
    'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js',
    'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js',
  ];
  const HELLO_EVERY = 4000; // как часто каждый напоминает о себе
  const FORGET_AFTER = 13000; // столько молчит — считаем, что ушёл
  const MAX_ROOM = 8;
  const RATE = 150; // сообщений в секунду от одного человека; больше — лишнее отбрасываем
  const ID_RE = /^zvukoryad-[a-z0-9]+(?:-[a-z0-9]+)*$/;

  let shell = null;
  let settings = null;
  let lib = null;
  let peer = null;
  let state = 'off'; // off | connecting | online | error
  let problem = '';
  let myId = '';
  let myName = '';
  let seq = Date.now(); // номера сообщений растут и после перезагрузки страницы
  let myInst = null;
  let myKit = null;
  let helloTimer = null;
  let helloSoon = null;
  let retryTimer = null;
  let releaseLock = null;
  let nextKey = 1;
  let micStream = null;

  const links = new Map(); // ник-адрес → прямое соединение { id, conn, name, ok, out, room, timer }
  const members = new Map(); // все в комнате, кроме меня: адрес → { name, inst, kit, mic, last, el }
  const seen = new Map(); // адрес → номер последнего сообщения (чтобы не играть одно дважды)
  const voices = new Map(); // 'адрес:ключ' → { v, inst }
  const rate = new Map();
  const asks = new Map(); // адрес → карточка «пустить?»
  const micCalls = new Map(); // кому отправляем живой звук
  const heard = new Map(); // чей живой звук слушаем: адрес → { audio, node }
  const chat = [];
  let view = null;
  let bandEl = null;

  const online = (App.online = {
    init,
    open,
    rehome,
    status: () => ({ state, nick: myName, count: members.size, problem }),
    summary,
    renderBand,
    setInstrument,
    note,
    off,
    kill,
    drum,
    continuous,
  });

  /* =================== Ники =================== */

  // Ник может быть по-русски: адрес в сети делаем латиницей, «Вася» и «vasya» — один и тот же человек.
  const TR = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
    н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '',
    ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'i', є: 'e', ґ: 'g', ў: 'u',
  };
  const slug = (nick) => [...String(nick || '').toLowerCase()].map((ch) => (TR[ch] != null ? TR[ch] : ch)).join('')
    .replace(/[^a-z0-9]+/g, '-').slice(0, 32).replace(/^-+|-+$/g, '');
  const cleanNick = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const nameOf = (id) => (members.get(id) && members.get(id).name) || (links.get(id) && links.get(id).name) || String(id).slice(PREFIX.length);

  /* =================== Запуск =================== */

  function init(s) {
    shell = s;
    settings = s.settings;
    // Ссылка-приглашение: …?with=Вася — сразу предлагаем подключиться.
    const params = new URLSearchParams(location.search);
    const friend = cleanNick(params.get('with'));
    if (params.has('with')) {
      params.delete('with');
      const q = params.toString();
      history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    }
    if (friend) setTimeout(() => open({ friend }), 350);
    else if (settings.net.auto && settings.net.nick) setTimeout(() => goOnline(settings.net.nick, 3), 700);
    window.addEventListener('pagehide', () => peer && broadcast({ t: 'bye' }));
    if (App.live) {
      App.live.onMic((st) => {
        if (st !== 'on' && micStream) {
          stopMicShare();
          hello();
          changed();
        }
      });
    }
  }

  function loadLib() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (lib) return lib;
    lib = new Promise((resolve, reject) => {
      let i = 0;
      const next = () => {
        if (i >= LIBS.length) {
          lib = null;
          reject(new Error('lib'));
          return;
        }
        const s = document.createElement('script');
        s.src = LIBS[i++];
        s.async = true;
        s.onload = () => (window.Peer ? resolve(window.Peer) : next());
        s.onerror = () => {
          s.remove();
          next();
        };
        document.head.append(s);
      };
      next();
    });
    return lib;
  }

  function setState(s, text) {
    state = s;
    problem = text || '';
    if ((s === 'off' || s === 'error') && releaseLock) {
      releaseLock();
      releaseLock = null;
    }
    changed();
  }

  /**
   * Один ник — одна вкладка: если сайт уже в сети под этим ником в другой вкладке этого браузера,
   * не пытаемся (сервер всё равно скажет «занят», но только через несколько секунд).
   */
  function takeLock(id) {
    if (!navigator.locks || !navigator.locks.request) return Promise.resolve(true);
    return new Promise((resolve) => {
      navigator.locks.request('zvukoryad-nick:' + id, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return null;
        }
        resolve(true);
        return new Promise((r) => (releaseLock = r));
      }).catch(() => resolve(true));
    });
  }

  /** Выйти в сеть под ником. retries — сколько раз повторить, если ник занят (после перезагрузки им ещё занят прошлый «я»). */
  async function goOnline(nick, retries) {
    nick = cleanNick(nick);
    const id = slug(nick);
    if (id.length < 2) {
      setState('error', 'Ник слишком короткий: нужны хотя бы две буквы или цифры.');
      return false;
    }
    if (peer && myId === PREFIX + id && state === 'online') return true;
    clearTimeout(retryTimer);
    if (peer) leave(true);
    if (!releaseLock && !(await takeLock(id))) {
      // При открытии страницы молчим: в сети уже другая вкладка — пусть играет она.
      if (retries === 3) setState('off');
      else setState('error', 'Под ником «' + nick + '» сайт уже в сети в другой вкладке. Играйте там — или придумайте здесь другой ник.');
      return false;
    }
    myName = nick;
    myId = PREFIX + id;
    settings.net.nick = nick;
    shell.save();
    setState('connecting');
    let Peer;
    try {
      Peer = await loadLib();
    } catch (e) {
      setState('error', 'Не загрузился модуль связи — проверьте интернет.');
      return false;
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (!done) {
          done = true;
          resolve(ok);
        }
      };
      const p = (peer = new Peer(myId, { debug: 0 }));
      p.on('open', () => {
        if (peer !== p) return;
        settings.net.auto = true;
        shell.save();
        setState('online');
        startHello();
        finish(true);
      });
      p.on('connection', (conn) => peer === p && incoming(conn));
      p.on('call', (call) => peer === p && incomingCall(call));
      p.on('disconnected', () => {
        // Пропала связь с сервером знакомств: уже начатая игра идёт напрямую, а адрес восстановим.
        setTimeout(() => {
          if (peer === p && !p.destroyed && p.disconnected) p.reconnect();
        }, 2500);
      });
      p.on('error', (err) => {
        if (peer !== p) return;
        const type = err && err.type;
        if (type === 'peer-unavailable') {
          const m = /zvukoryad-[a-z0-9-]+/.exec((err && err.message) || '');
          const link = m && links.get(m[0]);
          if (link && !link.ok) failDial(link, 'missing');
          return;
        }
        if (type === 'unavailable-id') {
          p.destroy();
          peer = null;
          if (retries > 0) {
            // Скорее всего, это мы сами до перезагрузки страницы — сервер вот-вот нас забудет.
            retryTimer = setTimeout(() => goOnline(nick, retries - 1).then(finish), 4000);
            return;
          }
          setState('error', 'Ник «' + nick + '» уже занят. Придумайте другой — или закройте сайт в другой вкладке.');
          finish(false);
          return;
        }
        if (type === 'browser-incompatible') {
          p.destroy();
          peer = null;
          setState('error', 'Этот браузер не умеет играть вместе. Подойдут Chrome, Edge, Firefox или Safari.');
          finish(false);
          return;
        }
        if (state === 'connecting' && ['network', 'server-error', 'socket-error', 'socket-closed', 'invalid-id', 'ssl-unavailable'].includes(type)) {
          p.destroy();
          peer = null;
          setState('error', 'Нет связи с сервером — проверьте интернет и попробуйте ещё раз.');
          finish(false);
        }
      });
    });
  }

  /** Уйти из сети. quiet — без смены «выходить в сеть сам» (например, при смене ника). */
  function leave(quiet) {
    clearTimeout(retryTimer);
    if (peer) {
      broadcast({ t: 'bye' });
      const p = peer;
      peer = null;
      setTimeout(() => p.destroy(), 200); // «пока» должно успеть уйти
    }
    links.forEach((l) => closeLink(l, true));
    [...members.keys()].forEach((id) => forget(id, true));
    stopHello();
    stopMicShare();
    myId = '';
    if (!quiet) {
      settings.net.auto = false;
      shell.save();
    }
    setState('off');
  }

  /* =================== Соединения =================== */

  const okLinks = () => [...links.values()].filter((l) => l.ok);
  const active = () => !!peer && okLinks().length > 0;

  function send(link, msg) {
    try {
      if (link.conn.open) link.conn.send(msg);
    } catch (e) { /* соединение закрывается */ }
  }

  /** Сообщение всем в комнате: соседям напрямую, а они передадут дальше. */
  function broadcast(body) {
    if (!peer || !myId) return;
    const msg = Object.assign({ o: myId, q: ++seq }, body);
    links.forEach((l) => l.ok && send(l, msg));
  }

  function wire(link) {
    link.conn.on('data', (msg) => onData(link, msg));
    link.conn.on('close', () => dropLink(link));
    link.conn.on('error', () => dropLink(link));
  }

  function connect(id, room) {
    const conn = peer.connect(id, { metadata: { name: myName, room: !!room }, serialization: 'json', reliable: true });
    if (!conn) return null;
    const link = { id, conn, name: nameOf(id), ok: false, out: true, room: !!room, timer: null };
    links.set(id, link);
    wire(link);
    link.timer = setTimeout(() => !link.ok && failDial(link, 'timeout'), room ? 20000 : 60000);
    conn.on('open', () => changed());
    return link;
  }

  /** Подключиться к другу по нику. */
  async function dial(nick) {
    nick = cleanNick(nick);
    const id = PREFIX + slug(nick);
    if (slug(nick).length < 2) return say('Напишите ник друга — хотя бы две буквы или цифры.');
    if (state !== 'online') {
      const mine = view ? view.nick.value : settings.net.nick;
      if (!cleanNick(mine)) {
        if (view) view.nick.focus();
        return say('Сначала придумайте ник себе — по нему друг увидит, кто к нему стучится.');
      }
      if (!(await goOnline(mine, 0))) return;
    }
    if (id === myId) return say('Это ваш собственный ник. Напишите ник друга.');
    const old = links.get(id);
    if (old && old.ok) return say('Вы уже играете вместе с «' + old.name + '».');
    if (old) closeLink(old, true);
    if (members.size >= MAX_ROOM - 1) return say('В комнате уже ' + MAX_ROOM + ' человек — больше не поместится.');
    const link = connect(id, false);
    if (!link) return say('Не получилось начать соединение. Попробуйте ещё раз.');
    link.name = nick;
    say('');
    changed();
  }

  function failDial(link, why) {
    if (link.ok || links.get(link.id) !== link) return;
    closeLink(link, true);
    if (link.room) return; // соединение «внутри комнаты» — без шума, сообщения и так идут через соседей
    const who = '«' + link.name + '»';
    say(why === 'missing' ? who + ' сейчас не в сети. Проверьте ник — или попросите друга открыть «Играть вместе» и выйти в сеть.'
      : why === 'no' ? 'Запрос отклонили: ' + who + ' сейчас не может играть.'
        : why === 'full' ? 'У ' + who + ' уже полная комната.'
          : 'Не получилось соединиться с ' + who + ' — возможно, мешает сеть. Попробуйте ещё раз.', true);
  }

  function incoming(conn) {
    const id = conn.peer;
    if (!ID_RE.test(id) || id === myId) {
      conn.close();
      return;
    }
    const meta = conn.metadata || {};
    const old = links.get(id);
    if (old) closeLink(old, true); // друг перезагрузил страницу и стучится снова
    const link = { id, conn, name: cleanNick(meta.name) || id.slice(PREFIX.length), ok: false, out: false, room: !!meta.room, timer: null };
    links.set(id, link);
    wire(link);
    conn.on('open', () => {
      if (links.get(id) !== link) return;
      if (!members.has(id) && members.size >= MAX_ROOM - 1) {
        send(link, { t: 'full' });
        setTimeout(() => closeLink(link, true), 400);
        return;
      }
      // Кто уже в нашей комнате (его пустил кто-то из нас) — пускаем сразу.
      if (members.has(id)) return accept(link);
      if (link.room) {
        let waited = 0;
        link.timer = setInterval(() => {
          waited += 500;
          if (members.has(id)) accept(link);
          else if (waited >= 6000) {
            clearInterval(link.timer);
            ask(link);
          }
        }, 500);
        return;
      }
      ask(link);
    });
  }

  function accept(link) {
    clearTimeout(link.timer);
    clearInterval(link.timer);
    closeAsk(link.id);
    if (links.get(link.id) !== link) return;
    link.ok = true;
    send(link, { t: 'ok', name: myName });
    if (!link.room && !members.has(link.id)) shell.toast('Вы играете вместе с «' + link.name + '»');
    joined(link);
  }

  function reject(link) {
    clearTimeout(link.timer);
    closeAsk(link.id);
    send(link, { t: 'no' });
    setTimeout(() => closeLink(link, true), 400);
    changed();
  }

  /** Соединение готово: рассказываем о себе и просим всех отозваться. */
  function joined(link) {
    hello();
    broadcast({ t: 'who' });
    if (micStream) callWithMic(link.id);
    changed();
  }

  function closeLink(link, quiet) {
    clearTimeout(link.timer);
    clearInterval(link.timer);
    closeAsk(link.id);
    if (links.get(link.id) === link) links.delete(link.id);
    const call = micCalls.get(link.id);
    if (call) {
      micCalls.delete(link.id);
      try {
        call.close();
      } catch (e) { /* уже закрыт */ }
    }
    try {
      link.conn.close();
    } catch (e) { /* уже закрыт */ }
    if (!quiet) changed();
  }

  function dropLink(link) {
    if (links.get(link.id) !== link) return;
    const was = link.ok;
    if (!was && link.out) {
      failDial(link, 'timeout');
      return;
    }
    closeLink(link, true);
    if (was) {
      // Звучащие ноты этого человека глушим сразу, а сам он пропадёт, если не отзовётся через соседей.
      stopVoices(link.id);
      const m = members.get(link.id);
      if (m) m.last = Math.min(m.last, Date.now() - FORGET_AFTER + 5000);
    }
    changed();
  }

  /* ---------- «Пустить?» ---------- */

  function ask(link) {
    if (asks.has(link.id)) return;
    const el = h('div.net-ask', { role: 'alertdialog', 'aria-label': 'Запрос: играть вместе' },
      h('div.net-ask-text', null, App.icon('users'),
        h('span', null, h('b', null, link.name), ' хочет играть вместе с вами')),
      h('div.row', null,
        h('button.btn.primary', { type: 'button', onClick: () => accept(link) }, 'Пустить'),
        h('button.btn', { type: 'button', onClick: () => reject(link) }, 'Не сейчас')));
    asks.set(link.id, el);
    rehome();
    link.timer = setTimeout(() => reject(link), 60000);
    chime();
    changed();
  }

  function closeAsk(id) {
    const el = asks.get(id);
    if (!el) return;
    asks.delete(id);
    el.remove();
  }

  /**
   * Пока открыто окно, всё остальное на странице браузер «замораживает» — даже кнопки поверх.
   * Поэтому карточки «Пустить?» живут внутри верхнего открытого окна, а без окон — на странице.
   */
  function rehome() {
    const open = [...document.querySelectorAll('dialog[open]')];
    const home = open.length ? open[open.length - 1] : document.body;
    asks.forEach((el) => el.parentNode !== home && home.append(el));
  }

  function chime() {
    const ac = App.audio.ctx;
    if (!ac || ac.state !== 'running') return;
    const bus = App.audio.bus('ui', { reverb: 0.8 });
    [79, 84].forEach((m, i) => App.audio.track(App.synth.play('celesta', m, 0.45, bus.input, ac.currentTime + i * 0.13)));
  }

  /* =================== Сообщения =================== */

  const num = (x, lo, hi) => (typeof x === 'number' && isFinite(x) ? Math.max(lo, Math.min(hi, x)) : null);
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const instOf = (id) => App.instrumentById[id] || App.instrumentById.piano;

  function onData(link, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (!msg.o) return direct(link, msg);
    if (!link.ok) return;
    const o = String(msg.o);
    const q = msg.q;
    if (o === myId || !ID_RE.test(o) || typeof q !== 'number') return;
    if (q <= (seen.get(o) || 0)) return; // уже пришло другой дорогой
    seen.set(o, q);
    // Передаём соседям — так в комнату из трёх и больше всё доходит до всех.
    links.forEach((l, id) => {
      if (l.ok && id !== link.id && id !== o) send(l, msg);
    });
    if (!allow(o)) return;
    handle(o, msg);
  }

  function direct(link, msg) {
    if (msg.t === 'ok' && link.out && !link.ok) {
      clearTimeout(link.timer);
      link.ok = true;
      link.name = cleanNick(msg.name) || link.name;
      if (!link.room) {
        shell.toast('Готово: вы играете вместе с «' + link.name + '»');
        say('');
      }
      joined(link);
    } else if (msg.t === 'no' && !link.ok) failDial(link, 'no');
    else if (msg.t === 'full' && !link.ok) failDial(link, 'full');
  }

  function allow(o) {
    const now = performance.now();
    let r = rate.get(o);
    if (!r || now - r.t > 1000) {
      r = { t: now, n: 0 };
      rate.set(o, r);
    }
    return ++r.n <= RATE;
  }

  function handle(o, msg) {
    const t = msg.t;
    if (t === 'hi') return hi(o, msg);
    if (t === 'bye') return forget(o);
    if (t === 'who') return helloLater();
    const m = members.get(o);
    if (m) m.last = Math.max(m.last, Date.now() - FORGET_AFTER + 6000);
    const key = o + ':' + (msg.k | 0);
    const delay = num(msg.d, 0, 0.5) || 0;
    if (t === 'on') {
      const midi = num(msg.m, 0, 127);
      if (midi == null) return;
      const inst = instOf(msg.i);
      const old = voices.get(key);
      if (old) old.v.kill(App.audio.ensure().currentTime);
      voices.set(key, { v: shell.remote.note(inst, midi, num(msg.v, 0.05, 1) || 0.8, delay), inst });
      flash(o, Math.round(midi));
    } else if (t === 'off') {
      const e = voices.get(key);
      if (!e) return;
      voices.delete(key);
      shell.remote.release(e.v, e.inst);
    } else if (t === 'kill') {
      const e = voices.get(key);
      if (!e) return;
      voices.delete(key);
      shell.remote.kill(e.v, delay);
    } else if (t === 'dr') {
      const sound = String(msg.s || '');
      if (!App.drumkit.sounds[sound] && !App.synth.drums.includes(sound)) return;
      const kit = App.drumkit.kits[msg.kt] ? msg.kt : null;
      shell.remote.drum(instOf(msg.i), kit, sound, num(msg.v, 0.05, 1) || 0.8, delay);
      flash(o, null);
    } else if (t === 'c+') {
      const f = num(msg.f, 20, 6000);
      if (f == null) return;
      const inst = instOf(msg.i);
      const v = shell.remote.continuous(inst, f);
      v.setLevel(num(msg.l, 0, 1) == null ? 0.8 : num(msg.l, 0, 1));
      voices.set(key, { v, inst });
      flash(o, Math.round(N.midiFromFreq(f)));
    } else if (t === 'c~') {
      const e = voices.get(key);
      if (!e || !e.v.setFreq) return;
      const f = num(msg.f, 20, 6000);
      const l = num(msg.l, 0, 1);
      if (f != null) e.v.setFreq(f, 0.03);
      if (l != null) e.v.setLevel(l);
    } else if (t === 'c-') {
      const e = voices.get(key);
      if (!e) return;
      voices.delete(key);
      e.v.stop(App.audio.ensure().currentTime);
    } else if (t === 'chat') {
      const text = String(msg.x || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 300);
      if (text) addChat(nameOf(o), text, false);
    }
  }

  /* ---------- Кто в комнате ---------- */

  function hi(o, msg) {
    const isNew = !members.has(o);
    if (isNew && members.size >= MAX_ROOM - 1) return;
    const m = members.get(o) || { name: '', inst: null, kit: null, mic: false, last: 0, el: null };
    m.name = cleanNick(msg.n) || o.slice(PREFIX.length);
    const inst = msg.i && App.instrumentById[msg.i] ? App.instrumentById[msg.i] : null;
    const kit = msg.k && App.drumkit.kits[msg.k] ? msg.k : null;
    if (inst && (inst !== m.inst || kit !== m.kit)) shell.remote.preload(inst, kit);
    const changedInst = inst !== m.inst || !!msg.mic !== m.mic;
    m.inst = inst;
    m.kit = kit;
    m.mic = !!msg.mic;
    m.last = Date.now();
    members.set(o, m);
    if (isNew) {
      if (!links.has(o)) shell.toast('«' + m.name + '» тоже играет с вами');
      // Соединяемся с каждым напрямую: быстрее, и живой звук дойдёт до всех. Звонит тот, чей адрес «меньше».
      if (!links.has(o) && myId < o) connect(o, true);
    }
    if (isNew || changedInst) changed();
  }

  function forget(o, quiet) {
    const m = members.get(o);
    if (!m) return;
    members.delete(o);
    stopVoices(o);
    stopHeard(o);
    if (!quiet) {
      shell.toast('«' + m.name + '» больше не играет с вами');
      changed();
    }
  }

  function stopVoices(o) {
    const now = App.audio.ctx ? App.audio.ctx.currentTime : 0;
    voices.forEach((e, k) => {
      if (k.startsWith(o + ':')) {
        e.v.kill(now);
        voices.delete(k);
      }
    });
  }

  function startHello() {
    stopHello();
    helloTimer = setInterval(tick, HELLO_EVERY);
  }

  function stopHello() {
    clearInterval(helloTimer);
    clearTimeout(helloSoon);
    helloTimer = null;
  }

  function tick() {
    if (links.size) hello();
    const now = Date.now();
    members.forEach((m, id) => now - m.last > FORGET_AFTER && forget(id));
    // Отзвучавшие ноты больше не держим.
    const t = App.audio.ctx ? App.audio.ctx.currentTime : 0;
    voices.forEach((e, k) => e.v.endTime != null && e.v.endTime < t && voices.delete(k));
  }

  function hello() {
    broadcast({ t: 'hi', n: myName, i: myInst ? myInst.id : null, k: myKit, mic: !!micStream });
  }

  function helloLater() {
    clearTimeout(helloSoon);
    helloSoon = setTimeout(hello, 120 + Math.random() * 300);
  }

  function setInstrument(inst, kit) {
    myInst = inst;
    myKit = kit;
    if (active()) helloLater();
  }

  /* =================== Мои ноты — в сеть =================== */

  function note(v, inst, midi, vel, delay) {
    if (!v || !active()) return;
    v.netKey = nextKey++;
    broadcast({ t: 'on', k: v.netKey, i: inst.id, m: r3(midi), v: r3(vel), d: r3(delay) });
  }

  function off(v) {
    if (!v || !v.netKey) return;
    const k = v.netKey;
    v.netKey = 0;
    if (active()) broadcast({ t: 'off', k });
  }

  function kill(v, delay) {
    if (!v || !v.netKey) return;
    const k = v.netKey;
    v.netKey = 0;
    if (active()) broadcast({ t: 'kill', k, d: r3(delay) });
  }

  function drum(inst, kit, sound, vel, delay) {
    if (!active()) return;
    broadcast({ t: 'dr', i: inst.id, s: sound, v: r3(vel), d: r3(delay), kt: kit });
  }

  /** Терменвокс: высоту и громкость шлём не чаще 25 раз в секунду. */
  function continuous(v, inst, f) {
    if (!active()) return v;
    const k = nextKey++;
    broadcast({ t: 'c+', k, i: inst.id, f: Math.round(f * 10) / 10 });
    let last = 0;
    let timer = null;
    let pend = {};
    const flush = () => {
      timer = null;
      last = performance.now();
      if (active()) broadcast(Object.assign({ t: 'c~', k }, pend));
      pend = {};
    };
    const queue = (field, val) => {
      pend[field] = val;
      const wait = 40 - (performance.now() - last);
      if (wait <= 0) flush();
      else if (!timer) timer = setTimeout(flush, wait);
    };
    const setFreq = v.setFreq;
    const setLevel = v.setLevel;
    const stop = v.stop;
    v.setFreq = (freq, glide) => {
      setFreq(freq, glide);
      queue('f', Math.round(freq * 10) / 10);
    };
    v.setLevel = (l) => {
      setLevel(l);
      queue('l', r3(l));
    };
    v.stop = (t) => {
      stop(t);
      clearTimeout(timer);
      if (active()) broadcast({ t: 'c-', k });
    };
    return v;
  }

  /* =================== Живой звук (микрофон) =================== */

  async function shareMic(on) {
    if (!on) {
      stopMicShare();
      hello();
      changed();
      return;
    }
    try {
      micStream = await App.live.micStream();
    } catch (e) {
      micStream = null;
      shell.toast('Без микрофона живой звук не передать');
      changed();
      return;
    }
    okLinks().forEach((l) => callWithMic(l.id));
    hello();
    changed();
  }

  function callWithMic(id) {
    if (!peer || !micStream || micCalls.has(id)) return;
    const call = peer.call(id, micStream, { metadata: { name: myName } });
    if (!call) return;
    micCalls.set(id, call);
    const done = () => micCalls.get(id) === call && micCalls.delete(id);
    call.on('close', done);
    call.on('error', done);
  }

  function stopMicShare() {
    micCalls.forEach((c) => {
      try {
        c.close();
      } catch (e) { /* уже закрыт */ }
    });
    micCalls.clear();
    micStream = null;
  }

  function incomingCall(call) {
    const l = links.get(call.peer);
    if (!l || !l.ok) {
      call.close();
      return;
    }
    call.answer(); // только слушаем; свой звук каждый отправляет сам
    call.on('stream', (stream) => hear(call.peer, stream));
    call.on('close', () => stopHeard(call.peer));
  }

  function hear(id, stream) {
    stopHeard(id);
    const audio = new Audio();
    audio.srcObject = stream;
    let node = null;
    try {
      // Через Web Audio живой звук друга попадает и в запись. Chrome отдаёт такой поток,
      // только если он ещё и привязан к элементу audio — поэтому элемент есть, но без звука.
      const ac = App.audio.ensure();
      node = ac.createGain();
      node.gain.value = settings.net.volume;
      ac.createMediaStreamSource(stream).connect(node);
      App.audio.mixIn(node);
      audio.muted = true;
    } catch (e) {
      node = null;
      audio.volume = Math.min(1, settings.net.volume);
    }
    audio.play().catch(() => {});
    heard.set(id, { audio, node });
    changed();
  }

  function stopHeard(id) {
    const x = heard.get(id);
    if (!x) return;
    heard.delete(id);
    x.audio.srcObject = null;
    if (x.node) x.node.disconnect();
  }

  function setVolume(v) {
    shell.remote.setVolume(v);
    heard.forEach((x) => {
      if (x.node) x.node.gain.value = v;
      else x.audio.volume = Math.min(1, v);
    });
  }

  /* =================== Чат =================== */

  function addChat(name, text, mine) {
    chat.push({ name, text, mine });
    if (chat.length > 60) chat.shift();
    if (view) renderChat();
    else if (!mine) shell.toast(name + ': ' + text, { label: 'Ответить', run: () => open() });
  }

  function sendChat(text) {
    text = String(text || '').trim().slice(0, 300);
    if (!text || !active()) return false;
    broadcast({ t: 'chat', x: text });
    addChat(myName, text, true);
    return true;
  }

  /* =================== Что видно на экране =================== */

  function summary() {
    if (state !== 'online') return 'Придумайте ник — друг подключится к вам по нему. Регистрация не нужна.';
    const names = [...members.values()].map((m) => m.name);
    return 'Вы в сети как «' + myName + '»' + (names.length ? '. Вместе с вами: ' + names.join(', ') : '');
  }

  function changed() {
    if (shell) shell.netChanged();
    if (view) renderView();
  }

  /** Полоска на экране игры: кто играет вместе с вами (мигает, когда друг играет). */
  function renderBand(el) {
    if (el) bandEl = el;
    if (!bandEl || !bandEl.isConnected) return;
    bandEl.textContent = '';
    members.forEach((m) => (m.el = null));
    const waiting = [...links.values()].filter((l) => l.out && !l.ok && !l.room);
    bandEl.hidden = state !== 'online' || (!members.size && !waiting.length);
    if (bandEl.hidden) return;
    bandEl.append(h('span.band-label', null, App.icon('users'), 'Вместе'));
    members.forEach((m) => {
      m.el = h('button.band-chip', { type: 'button', title: m.name + (m.inst ? ' — ' + m.inst.name : ' выбирает инструмент'), onClick: () => open() },
        h('span.band-icon', { 'aria-hidden': 'true' }, m.inst ? m.inst.icon : '🎵'),
        h('span.band-name', null, m.name),
        m.inst ? h('span.band-inst', null, m.inst.name) : null,
        m.mic ? App.icon('mic') : null);
      bandEl.append(m.el);
    });
    waiting.forEach((l) => bandEl.append(h('span.band-wait', null, 'Ждём, когда «' + l.name + '» пустит…')));
  }

  function flash(o, midi) {
    const m = members.get(o);
    if (!m || !m.el) return;
    m.el.style.setProperty('--c', midi != null ? N.color(midi) : 'var(--brass)');
    m.el.classList.remove('hit');
    void m.el.offsetWidth;
    m.el.classList.add('hit');
  }

  /** Сообщение в окне (ошибка или подсказка); если окно закрыто — всплывающей строкой. */
  function say(text, important) {
    if (view) {
      view.msg.textContent = text;
      view.msg.hidden = !text;
    } else if (text && important) shell.toast(text);
  }

  /* ---------- Окно «Играть вместе» ---------- */

  function open(opts) {
    shell.closeDialogs();
    const nick = h('input.net-input', { type: 'text', maxlength: 24, placeholder: 'Например, Вася', autocomplete: 'nickname', spellcheck: 'false', 'aria-label': 'Ваш ник' });
    nick.value = settings.net.nick || '';
    const friend = h('input.net-input', { type: 'text', maxlength: 24, placeholder: 'Ник друга', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Ник друга' });
    friend.value = (opts && opts.friend) || '';
    const goBtn = h('button.btn.primary', { type: 'button' });
    goBtn.addEventListener('click', () => {
      if (state === 'online' || state === 'connecting') leave(false);
      else goOnline(nick.value, 0);
    });
    nick.addEventListener('keydown', (e) => e.key === 'Enter' && state !== 'online' && goOnline(nick.value, 0));
    const dialBtn = h('button.btn', { type: 'button', onClick: () => dial(friend.value) }, App.icon('link'), 'Подключиться');
    friend.addEventListener('keydown', (e) => e.key === 'Enter' && dial(friend.value));
    const msg = h('p.net-msg', { hidden: true, role: 'status' });

    const meCard = h('div.net-me');
    const people = h('div.net-people');
    const chatList = h('div.net-chat-list', { 'aria-live': 'polite' });
    const chatInput = h('input.net-input', { type: 'text', maxlength: 300, placeholder: 'Написать всем…', 'aria-label': 'Сообщение в чат' });
    const chatSend = () => sendChat(chatInput.value) && (chatInput.value = '');
    chatInput.addEventListener('keydown', (e) => e.key === 'Enter' && chatSend());
    const chatBox = h('section.net-sec.net-chat', null, h('h3', null, 'Чат'), chatList,
      h('div.net-line', null, chatInput, h('button.icon-btn', { type: 'button', 'aria-label': 'Отправить', title: 'Отправить', onClick: chatSend }, App.icon('send'))));
    const vol = App.ui.slider('Громкость друзей', 0, 1.5, 0.01, settings.net.volume, setVolume, (v) => Math.round(v * 100));
    const micToggle = App.ui.segmented([[false, 'Нет'], [true, 'Да, передавать']], !!micStream, (v) => shareMic(v), 'Передавать живой звук');
    const together = h('section.net-sec', null,
      h('div.field-row', null, vol.el),
      h('div.net-field', null, h('span.field-label', null, 'Передавать живой звук микрофона'), micToggle.el,
        h('p.note', null, 'Друзья услышат вашу настоящую гитару или голос. Наденьте наушники, чтобы не было эха.')));

    const body = h('div.net', null,
      h('p.note.net-intro', null, 'Без регистрации: придумайте ник, и друг подключится к вам по нему. Вы услышите друг друга — каждый играет на своём инструменте.'),
      h('section.net-sec', null,
        h('h3', null, 'Ваш ник'),
        h('div.net-line', null, nick, goBtn),
        meCard),
      h('section.net-sec', null,
        h('h3', null, 'Подключиться к другу'),
        h('div.net-line', null, friend, dialBtn),
        h('p.note', null, 'Друг должен быть в сети. Он увидит запрос и нажмёт «Пустить».')),
      msg,
      h('section.net-sec', null, h('h3', null, 'Вместе с вами'), people),
      together,
      chatBox,
      h('p.note.net-small', null, 'Звук идёт напрямую между браузерами. Сервер PeerJS только помогает найти друг друга по нику.'));

    view = { nick, friend, goBtn, dialBtn, msg, meCard, people, chatList, chatBox, together, micToggle };
    renderView();
    renderChat();
    shell.sheet('Играть вместе', body, { onClose: () => (view = null) });
    if (friend.value && !nick.value) nick.focus();
    else if (!nick.value) nick.focus();
  }

  function renderView() {
    const v = view;
    const on = state === 'online';
    v.goBtn.textContent = '';
    v.goBtn.append(App.icon(on ? 'close' : 'signal'), on ? 'Выйти из сети' : state === 'connecting' ? 'Подключаемся…' : 'Выйти в сеть');
    v.goBtn.classList.toggle('primary', !on);
    v.nick.disabled = on || state === 'connecting';

    v.meCard.textContent = '';
    v.meCard.dataset.state = state;
    if (on) {
      const link = shareLink();
      v.meCard.append(
        h('p.net-status', null, h('i.net-dot'), 'Вы в сети как ', h('b', null, myName)),
        h('p.note', null, 'Скажите другу ваш ник — «' + myName + '»' + (slug(myName) !== myName.toLowerCase() ? ' (можно и латиницей: ' + slug(myName) + ')' : '') + '. Или отправьте ссылку:'),
        link ? h('div.net-line', null,
          h('input.net-input.net-url', { type: 'text', readonly: true, value: link, 'aria-label': 'Ссылка-приглашение', onFocus: (e) => e.target.select() }),
          h('button.btn', { type: 'button', onClick: () => copy(link) }, 'Скопировать')) : null);
    } else if (state === 'connecting') {
      v.meCard.append(h('p.net-status', null, h('i.net-dot'), 'Выходим в сеть…'));
    } else if (state === 'error') {
      v.meCard.append(h('p.net-status.bad', null, problem));
    } else {
      v.meCard.append(h('p.note', null, 'Друзья подключатся к вам по этому нику. Он запомнится в этом браузере.'));
    }

    v.people.textContent = '';
    const waiting = [...links.values()].filter((l) => !l.ok && !l.room);
    if (!members.size && !waiting.length) {
      v.people.append(h('p.note', null, on ? 'Пока никого. Подключитесь к другу по нику или дождитесь, когда он подключится к вам.' : 'Выйдите в сеть, чтобы играть вместе.'));
    }
    members.forEach((m, id) => {
      const l = links.get(id);
      v.people.append(h('div.net-person', null,
        h('span.band-icon', { 'aria-hidden': 'true' }, m.inst ? m.inst.icon : '🎵'),
        h('span.net-person-text', null, h('b', null, m.name), h('small', null, (m.inst ? m.inst.name : 'выбирает инструмент') + (m.mic ? ' · живой звук' : ''))),
        l && l.ok && !l.room ? h('button.btn.ghost', { type: 'button', onClick: () => closeLink(l) }, 'Отключить') : null));
    });
    waiting.forEach((l) => {
      v.people.append(h('div.net-person.wait', null,
        h('span.band-icon', { 'aria-hidden': 'true' }, '⏳'),
        h('span.net-person-text', null, h('b', null, l.name), h('small', null, l.out ? 'ждём, когда пустит…' : 'хочет подключиться')),
        h('button.btn.ghost', { type: 'button', onClick: () => (l.out ? closeLink(l) : reject(l)) }, l.out ? 'Отменить' : 'Не пускать'),
        l.out ? null : h('button.btn.primary', { type: 'button', onClick: () => accept(l) }, 'Пустить')));
    });

    const anyone = active();
    v.together.hidden = !anyone;
    v.chatBox.hidden = !anyone;
    v.micToggle.set(!!micStream);
  }

  function renderChat() {
    if (!view) return;
    const list = view.chatList;
    list.textContent = '';
    if (!chat.length) list.append(h('p.note', null, 'Здесь можно договориться, что сыграть.'));
    chat.forEach((c) => list.append(h('p.net-chat-line' + (c.mine ? '.mine' : ''), null, h('b', null, c.name + ': '), c.text)));
    list.scrollTop = list.scrollHeight;
  }

  function shareLink() {
    if (!/^https?:$/.test(location.protocol)) return '';
    const u = new URL(location.href);
    u.searchParams.set('with', slug(myName)); // латиницей ссылка короче, а ведёт к тому же нику
    return u.toString();
  }

  function copy(text) {
    const done = () => shell.toast('Ссылка скопирована — отправьте её другу');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => shell.toast('Выделите ссылку и скопируйте её'));
    else shell.toast('Выделите ссылку и скопируйте её');
  }
})();
