/* Чтение MIDI-файлов (.mid, .midi, .kar): дорожки, инструменты, ноты со временем в секундах. */
(function () {
  const App = (window.App = window.App || {});

  /**
   * parse(arrayBuffer) → { title, bpm, duration, parts: [{ name, program, drums, notes: [[t, d, midi, vel]] }] }
   * Каждая пара «дорожка + канал» — отдельная партия: в файлах «формата 0» все инструменты в одной дорожке.
   */
  function parse(buf) {
    const d = new DataView(buf);
    let p = 0;
    const u8 = () => d.getUint8(p++);
    const u16 = () => {
      const v = d.getUint16(p);
      p += 2;
      return v;
    };
    const u32 = () => {
      const v = d.getUint32(p);
      p += 4;
      return v;
    };
    const vlq = () => {
      let v = 0;
      for (let i = 0; i < 4; i++) {
        const b = u8();
        v = (v << 7) | (b & 0x7f);
        if (!(b & 0x80)) return v;
      }
      return v;
    };
    const text = (len) => {
      const bytes = new Uint8Array(buf, p, len);
      p += len;
      return decodeText(bytes);
    };
    const tag = () => String.fromCharCode(u8(), u8(), u8(), u8());

    if (buf.byteLength < 14) throw new Error('Файл слишком маленький — это не MIDI');
    // Бывает обёртка RIFF (.rmi): ищем заголовок MThd внутри.
    let start = 0;
    const head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 64));
    for (let i = 0; i + 4 <= head.length; i++) {
      if (head[i] === 0x4d && head[i + 1] === 0x54 && head[i + 2] === 0x68 && head[i + 3] === 0x64) {
        start = i;
        break;
      }
    }
    p = start;
    if (tag() !== 'MThd') throw new Error('Это не MIDI-файл');
    const hlen = u32();
    u16(); // формат 0, 1 или 2 — читаем одинаково
    const ntrks = u16();
    const division = u16();
    p = start + 8 + hlen;
    let ticksPerQuarter = division;
    let ticksPerSecond = 0;
    if (division & 0x8000) {
      // Время в кадрах SMPTE: бывает редко, но бывает.
      const fps = 256 - (division >> 8);
      ticksPerSecond = fps * (division & 0xff);
      ticksPerQuarter = 0;
    }

    const tempos = []; // [тик, микросекунд на четверть]
    const programs = []; // [тик, канал, программа]
    const raw = []; // [тик, дорожка, канал, нота, сила] — сила 0 = отпустить
    const names = [];
    let title = '';

    for (let t = 0; t < ntrks && p + 8 <= buf.byteLength; t++) {
      const id = tag();
      const len = u32();
      const end = Math.min(buf.byteLength, p + len);
      if (id !== 'MTrk') {
        p = end;
        continue;
      }
      let tick = 0;
      let status = 0;
      while (p < end) {
        tick += vlq();
        const b = u8();
        if (b === 0xff) {
          const type = u8();
          const l = vlq();
          if (type === 0x51 && l === 3) {
            tempos.push([tick, (u8() << 16) | (u8() << 8) | u8()]);
          } else if (type === 0x03) {
            const s = text(l).trim();
            if (s && !names[t]) names[t] = s;
            if (t === 0 && !title && s) title = s;
          } else if (type === 0x2f) {
            p += l;
            break;
          } else p += l;
          continue;
        }
        if (b === 0xf0 || b === 0xf7) {
          p += vlq();
          continue;
        }
        if (b & 0x80) status = b;
        else p--; // «бегущий статус»: команда та же, что раньше
        const cmd = status & 0xf0;
        const ch = status & 0x0f;
        if (cmd === 0x90 || cmd === 0x80) {
          const note = u8();
          const vel = u8();
          raw.push([tick, t, ch, note, cmd === 0x90 ? vel : 0]);
        } else if (cmd === 0xc0) {
          programs.push([tick, ch, u8()]);
        } else if (cmd === 0xd0) {
          p += 1;
        } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) {
          p += 2;
        } else {
          p = end; // непонятный байт — дальше этой дорожки не читаем
        }
      }
      p = end;
    }

    /* ---------- Тики → секунды ---------- */

    tempos.sort((a, b) => a[0] - b[0]);
    const map = []; // [тик, секунда, секунд на тик]
    if (ticksPerSecond) map.push([0, 0, 1 / ticksPerSecond]);
    else {
      let tick = 0;
      let sec = 0;
      let spt = 0.5 / ticksPerQuarter; // 120 ударов в минуту, пока не сказано иное
      map.push([0, 0, spt]);
      tempos.forEach(([tk, us]) => {
        sec += (tk - tick) * spt;
        tick = tk;
        spt = us / 1e6 / ticksPerQuarter;
        map.push([tick, sec, spt]);
      });
    }
    const toSec = (tick) => {
      let i = map.length - 1;
      while (i > 0 && map[i][0] > tick) i--;
      return map[i][1] + (tick - map[i][0]) * map[i][2];
    };

    /* ---------- Ноты: «нажата» + «отпущена» → нота с длительностью ---------- */

    raw.sort((a, b) => a[0] - b[0] || (a[4] === 0 ? -1 : 0) - (b[4] === 0 ? -1 : 0));
    const open = new Map(); // дорожка:канал:нота → [тики начала]
    const parts = new Map(); // дорожка:канал → { track, ch, notes }
    const partOf = (t, ch) => {
      const k = t + ':' + ch;
      if (!parts.has(k)) parts.set(k, { track: t, ch, notes: [] });
      return parts.get(k);
    };
    let lastTick = 0;
    raw.forEach(([tick, t, ch, note, vel]) => {
      lastTick = Math.max(lastTick, tick);
      const k = t + ':' + ch + ':' + note;
      if (vel > 0) {
        if (!open.has(k)) open.set(k, []);
        const q = open.get(k);
        // Клавишу нажали снова, не отпустив: как на синтезаторе — прежняя нота кончается здесь.
        q.splice(0).forEach(([from, v]) => {
          const t0 = toSec(from);
          partOf(t, ch).notes.push([t0, Math.max(0.03, toSec(tick) - t0), note, v / 127]);
        });
        q.push([tick, vel]);
        return;
      }
      let c = ch;
      let q = open.get(k);
      if (!q || !q.length) {
        // Бывает, что «отпустить» приходит на другом канале той же дорожки — ищем открытую ноту там.
        for (c = 0; c < 16; c++) {
          q = open.get(t + ':' + c + ':' + note);
          if (q && q.length) break;
        }
        if (c === 16) return;
      }
      const [from, v] = q.shift();
      const t0 = toSec(from);
      partOf(t, c).notes.push([t0, Math.max(0.03, toSec(tick) - t0), note, v / 127]);
    });
    open.forEach((q, k) => {
      const [t, ch, note] = k.split(':').map(Number);
      q.forEach(([from, v]) => {
        const t0 = toSec(from);
        partOf(t, ch).notes.push([t0, Math.max(0.1, toSec(lastTick) - t0), note, v / 127]);
      });
    });

    /* ---------- Партии: название и инструмент ---------- */

    programs.sort((a, b) => a[0] - b[0]);
    const programAt = (ch, notes) => {
      const first = notes.length ? notes[0][0] : 0;
      let prog = 0;
      programs.forEach(([tick, c, pr]) => {
        if (c === ch && toSec(tick) <= first + 0.001) prog = pr;
      });
      return prog;
    };
    const list = [];
    parts.forEach((part) => {
      if (!part.notes.length) return;
      part.notes.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
      const drums = part.ch === 9;
      const program = drums ? 0 : programAt(part.ch, part.notes);
      list.push({
        name: names[part.track] || '',
        program,
        drums,
        channel: part.ch,
        notes: part.notes.map((n) => [round(n[0]), round(n[1]), n[2], Math.round(n[3] * 100) / 100]),
      });
    });
    list.sort((a, b) => a.notes[0][0] - b.notes[0][0] || a.channel - b.channel);
    if (!list.length) throw new Error('В файле нет нот');
    const tempo = tempos.length ? Math.round(60e6 / tempos[0][1]) : 120;
    return {
      title,
      bpm: Math.max(20, Math.min(300, tempo)),
      duration: Math.max(...list.map((pt) => pt.notes[pt.notes.length - 1][0] + pt.notes[pt.notes.length - 1][1])),
      parts: list,
    };
  }

  const round = (x) => Math.round(x * 1000) / 1000;

  /** Текст в MIDI бывает в UTF-8, а бывает в старой русской кодировке Windows. */
  function decodeText(bytes) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
      try {
        return new TextDecoder('windows-1251').decode(bytes);
      } catch (e2) {
        return String.fromCharCode(...bytes);
      }
    }
  }

  App.midiFile = { parse };
})();
