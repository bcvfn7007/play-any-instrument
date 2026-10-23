/*
 * Свой сервер знакомств для «Играть вместе». Это обычный сервер PeerJS: браузеры находят тут друг друга
 * по нику, а играют уже напрямую. Общий бесплатный 0.peerjs.com доступен не всем (почему — в js/online.js),
 * поэтому сайт выходит в сеть сразу через оба.
 * Ещё сервер раздаёт ключи к ретранслятору TURN от Cloudflare — для сетей, где напрямую не соединиться.
 *
 * Запуск: npm ci && npm start. Настройки (переменные окружения):
 *   PORT и IP — порт и адрес (Render и alwaysdata задают сами);
 *   TURN_KEY_ID и TURN_KEY_API_TOKEN — ключ TURN из Cloudflare (Realtime → TURN); без них TURN просто нет.
 */
const http = require('node:http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { ExpressPeerServer } = require('peer');

const PORT = Number(process.env.PORT) || 9000;
const HOUR = 3600 * 1000;

// Кому можно пользоваться сервером: сам сайт, его копия на GitHub Pages и запуск на своём компьютере.
// Сайт, открытый прямо из файла (origin «null»), сюда не пускаем: такой origin бывает у любой страницы в песочнице.
const SITES = [
  /^https:\/\/play-any-instrument\.onrender\.com$/,
  /^https:\/\/bcvfn7007\.github\.io$/,
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/,
];
const allowed = (origin) => !!origin && SITES.some((re) => re.test(origin));

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);

// Render проверяет по этому адресу, что сервер жив; сайт сюда же «будит» уснувший сервер.
app.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Access-Control-Allow-Origin', '*');
  res.type('text').send('ok');
});

app.get('/ice', async (req, res) => {
  const origin = req.get('origin');
  res.set('Cache-Control', 'no-store');
  res.set('Vary', 'Origin');
  if (!allowed(origin)) return res.status(403).json({ iceServers: [] });
  res.set('Access-Control-Allow-Origin', origin);
  res.json({ iceServers: await turnServers() });
});

/* ---------- TURN от Cloudflare ---------- */

// Ключи живут 6 часов. Один набор раздаём всем и берём новый каждые полчаса — у каждого в запасе больше 5 часов.
// Origin вне браузера легко подделать, так что ключи может взять и чужой; короткий срок ограничивает, сколько они проживут.
const turn = { at: 0, list: [], job: null };

function turnServers() {
  const id = process.env.TURN_KEY_ID;
  const token = process.env.TURN_KEY_API_TOKEN;
  if (!id || !token) return Promise.resolve([]);
  if (turn.job) return turn.job;
  if (Date.now() - turn.at < (turn.list.length ? HOUR / 2 : HOUR / 12)) return Promise.resolve(turn.list);
  turn.job = fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 6 * 3600 }),
    signal: AbortSignal.timeout(8000),
  })
    .then(async (r) => {
      if (!r.ok) throw new Error('Cloudflare ответил ' + r.status + ': ' + (await r.text()).slice(0, 200));
      const { iceServers } = await r.json();
      // Порт 53 браузеры не пускают — такие адреса только зря ждать.
      turn.list = (iceServers || []).filter((s) => s && s.username).map((s) => ({
        urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)),
        username: s.username,
        credential: s.credential,
      }));
    })
    .catch((e) => {
      console.error('TURN: не получили ключи —', e.message);
      turn.list = [];
    })
    .then(() => {
      turn.at = Date.now();
      turn.job = null;
      return turn.list;
    });
  return turn.job;
}

/* ---------- Сам сервер знакомств ---------- */

app.use('/', ExpressPeerServer(server, {
  path: '/',
  proxied: true,
  allow_discovery: false, // список всех, кто в сети, никому не показываем
  concurrent_limit: 3000,
  createWebSocketServer: (options) => new WebSocketServer({
    ...options,
    maxPayload: 64 * 1024,
    verifyClient: ({ origin }) => allowed(origin),
  }),
}));

// alwaysdata выдаёт программе свой адрес и порт (IP и PORT) — слушать надо именно их; Render задаёт только порт.
server.listen(PORT, process.env.IP || undefined, () => console.log('Сервер знакомств «Звукоряда» слушает ' + (process.env.IP || '*') + ':' + PORT));
