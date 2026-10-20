/* Чтение нот MusicXML (.musicxml, .xml и сжатого .mxl) — так сохраняют MuseScore, Finale, Sibelius и нотные сайты. */
(function () {
  const App = (window.App = window.App || {});

  const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // Если в файле не сказано, какой это инструмент, угадываем по названию партии (номер General MIDI).
  const GUESS = [
    [/piano|фортепиано|пианино|рояль|klavier/i, 0], [/organ|орган/i, 19], [/accordion|аккордеон|баян/i, 21],
    [/bass guitar|бас-гитар|electric bass/i, 33], [/guitar|гитар/i, 24], [/violin|скрипк/i, 40], [/viola|альт/i, 41],
    [/cello|виолончел/i, 42], [/contrabass|double bass|контрабас/i, 43], [/harp|арф/i, 46], [/voice|vocal|soprano|alto|tenor|голос|вокал|сопрано/i, 52],
    [/trumpet|труб/i, 56], [/trombone|тромбон/i, 57], [/tuba|туба/i, 58], [/horn|валторн/i, 60], [/sax|саксофон/i, 65],
    [/oboe|гобой/i, 68], [/bassoon|фагот/i, 70], [/clarinet|кларнет/i, 71], [/flute|флейт/i, 73], [/recorder|блокфлейт/i, 74],
    [/xylophone|ксилофон/i, 13], [/marimba|маримб/i, 12], [/glockenspiel|колокольчик/i, 9], [/ukulele|укулеле/i, 24],
  ];

  /** buf — содержимое файла. Сжатый .mxl распаковывает сам. */
  async function load(buf) {
    const u8 = new Uint8Array(buf);
    const text = u8[0] === 0x50 && u8[1] === 0x4b ? await unzip(buf) : decode(u8);
    return parse(text);
  }

  function decode(u8) {
    if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8);
    if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8);
    return new TextDecoder('utf-8').decode(u8);
  }

  /* ---------- .mxl — это zip-архив ---------- */

  async function unzip(buf) {
    const d = new DataView(buf);
    const u8 = new Uint8Array(buf);
    let e = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (d.getUint32(i, true) === 0x06054b50) {
        e = i;
        break;
      }
    }
    if (e < 0) throw new Error('Архив .mxl повреждён');
    const count = d.getUint16(e + 10, true);
    let p = d.getUint32(e + 16, true);
    const files = {};
    for (let k = 0; k < count && p + 46 <= buf.byteLength; k++) {
      if (d.getUint32(p, true) !== 0x02014b50) break;
      const nlen = d.getUint16(p + 28, true);
      files[new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen))] = {
        method: d.getUint16(p + 10, true),
        size: d.getUint32(p + 20, true),
        off: d.getUint32(p + 42, true),
      };
      p += 46 + nlen + d.getUint16(p + 30, true) + d.getUint16(p + 32, true);
    }
    const read = async (name) => {
      const f = files[name];
      const from = f.off + 30 + d.getUint16(f.off + 26, true) + d.getUint16(f.off + 28, true);
      const data = u8.subarray(from, from + f.size);
      if (f.method === 0) return data;
      if (f.method !== 8) throw new Error('Архив .mxl сжат непривычным способом');
      if (typeof DecompressionStream === 'undefined') throw new Error('Этот браузер не умеет распаковывать .mxl — сохраните ноты как «несжатый MusicXML»');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    };
    let root = null;
    if (files['META-INF/container.xml']) {
      const m = /full-path="([^"]+)"/.exec(new TextDecoder().decode(await read('META-INF/container.xml')));
      if (m && files[m[1]]) root = m[1];
    }
    if (!root) root = Object.keys(files).find((n) => !n.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(n));
    if (!root) throw new Error('В архиве нет нот');
    return decode(await read(root));
  }

  /* ---------- Разбор ---------- */

  const kids = (el, name) => [...el.children].filter((c) => c.localName === name);
  const kid = (el, name) => [...el.children].find((c) => c.localName === name) || null;
  const num = (el, name, d) => {
    const c = el && kid(el, name);
    const v = c ? parseFloat(c.textContent) : NaN;
    return isFinite(v) ? v : d;
  };

  function parse(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Файл с нотами повреждён');
    const root = doc.documentElement;
    if (root.localName === 'score-timewise') throw new Error('Этот вид MusicXML («timewise») не поддерживается — сохраните ноты заново в MuseScore');
    if (root.localName !== 'score-partwise') throw new Error('Это не ноты MusicXML');

    const title = (
      (root.querySelector('work > work-title') || {}).textContent
      || (root.querySelector('movement-title') || {}).textContent
      || (root.querySelector('credit > credit-words') || {}).textContent || ''
    ).trim();

    const info = {};
    root.querySelectorAll('part-list > score-part').forEach((sp) => {
      const name = ((kid(sp, 'part-name') || {}).textContent || '').trim();
      const mi = sp.querySelector('midi-instrument');
      const prog = mi ? num(mi, 'midi-program', 0) : 0;
      const ch = mi ? num(mi, 'midi-channel', 0) : 0;
      let program = prog ? prog - 1 : -1;
      if (program < 0) {
        const g = GUESS.find(([re]) => re.test(name));
        program = g ? g[1] : 0;
      }
      info[sp.getAttribute('id')] = { name, program, drums: ch === 10 };
    });

    const partEls = kids(root, 'part');
    if (!partEls.length) throw new Error('В файле нет нот');
    const order = measureOrder(kids(partEls[0], 'measure'));
    const tempos = [[0, 120]];
    let firstTempo = true;
    const out = [];

    partEls.forEach((partEl, pi) => {
      const meta = info[partEl.getAttribute('id')] || { name: '', program: 0, drums: false };
      const measures = kids(partEl, 'measure');
      const notes = []; // [начало, длительность (в четвертях), нота, сила, нотоносец]
      const tieOpen = new Map();
      let divisions = 1;
      let vel = 0.75;
      let at = 0; // начало такта в четвертях
      order.forEach((idx) => {
        const m = measures[idx];
        if (!m) return;
        let cur = 0;
        let len = 0;
        let lastStart = 0;
        const tempoAt = (pos, bpm) => {
          if (pi !== 0 || !(bpm > 0)) return;
          if (firstTempo && at + pos === 0) tempos[0][1] = bpm;
          else tempos.push([at + pos, bpm]);
          firstTempo = false;
        };
        [...m.children].forEach((el) => {
          const name = el.localName;
          if (name === 'attributes') divisions = num(el, 'divisions', divisions) || divisions;
          else if (name === 'backup') cur -= num(el, 'duration', 0) / divisions;
          else if (name === 'forward') cur += num(el, 'duration', 0) / divisions;
          else if (name === 'sound') tempoAt(cur, parseFloat(el.getAttribute('tempo')));
          else if (name === 'direction') {
            const snd = el.querySelector('sound');
            if (snd && snd.getAttribute('tempo')) tempoAt(cur, parseFloat(snd.getAttribute('tempo')));
            else {
              const pm = el.querySelector('metronome > per-minute');
              if (pm) tempoAt(cur, parseFloat(pm.textContent));
            }
            if (snd && snd.getAttribute('dynamics')) vel = Math.max(0.2, Math.min(1, parseFloat(snd.getAttribute('dynamics')) / 110));
          } else if (name === 'note') {
            if (kid(el, 'grace') || kid(el, 'cue')) return; // форшлаги и подсказки не учим
            const chord = !!kid(el, 'chord');
            const dur = num(el, 'duration', 0) / divisions;
            const start = chord ? lastStart : cur;
            const pitch = kid(el, 'pitch');
            if (pitch && !kid(el, 'rest')) {
              const step = STEP[((kid(pitch, 'step') || {}).textContent || 'C').trim()];
              const midi = Math.round(step + num(pitch, 'alter', 0) + (num(pitch, 'octave', 4) + 1) * 12);
              const staff = num(el, 'staff', 1);
              const ties = kids(el, 'tie').map((t) => t.getAttribute('type'));
              const key = staff + ':' + midi;
              const prev = tieOpen.get(key);
              if (ties.includes('stop') && prev && Math.abs(prev[0] + prev[1] - (at + start)) < 0.05) {
                prev[1] += dur; // залигованная нота — продолжение предыдущей
              } else {
                const n = [at + start, dur, midi, vel, staff];
                notes.push(n);
                tieOpen.set(key, n);
              }
            }
            if (!chord) {
              lastStart = cur;
              cur += dur;
            }
          }
          len = Math.max(len, cur);
        });
        at += len;
      });
      if (!notes.length) return;
      const staves = [...new Set(notes.map((n) => n[4]))].sort();
      const base = meta.name || 'Партия ' + (pi + 1);
      staves.forEach((st, si) => {
        const list = notes.filter((n) => n[4] === st);
        const hand = staves.length === 2 ? (si === 0 ? ' — правая рука' : ' — левая рука') : staves.length > 2 ? ' — нотоносец ' + (si + 1) : '';
        out.push({ name: base + hand, program: meta.program, drums: meta.drums, notesQ: list });
      });
    });

    if (!out.length) throw new Error('В файле нет нот');

    /* ---------- Четверти → секунды ---------- */
    tempos.sort((a, b) => a[0] - b[0]);
    const map = [];
    let q = 0;
    let sec = 0;
    let bpm = tempos[0][1];
    tempos.forEach(([tq, b]) => {
      sec += ((tq - q) * 60) / bpm;
      q = tq;
      bpm = b;
      map.push([q, sec, bpm]);
    });
    const toSec = (tq) => {
      let i = map.length - 1;
      while (i > 0 && map[i][0] > tq) i--;
      return map[i][1] + ((tq - map[i][0]) * 60) / map[i][2];
    };
    const r = (x) => Math.round(x * 1000) / 1000;
    const parts = out.map((pt) => ({
      name: pt.name,
      program: pt.program,
      drums: pt.drums,
      notes: pt.notesQ.map(([t, d, m, v]) => {
        const s = toSec(t);
        return [r(s), r(Math.max(0.03, toSec(t + d) - s)), m, v];
      }).sort((a, b) => a[0] - b[0] || a[2] - b[2]),
    }));
    return {
      title,
      bpm: Math.round(tempos[0][1]),
      duration: Math.max(...parts.map((pt) => pt.notes.length ? pt.notes[pt.notes.length - 1][0] + pt.notes[pt.notes.length - 1][1] : 0)),
      parts,
    };
  }

  /**
   * Порядок тактов с учётом повторов: |: … :| и вольт «1.» и «2.».
   * Знаки D.C. и D.S. не разворачиваем — для разучивания хватает и так.
   */
  function measureOrder(measures) {
    let ending = null;
    const info = measures.map((m) => {
      const it = { fwd: false, back: 0, ending: null };
      kids(m, 'barline').forEach((bl) => {
        const rep = kid(bl, 'repeat');
        if (rep && rep.getAttribute('direction') === 'forward') it.fwd = true;
        if (rep && rep.getAttribute('direction') === 'backward') it.back = parseInt(rep.getAttribute('times'), 10) || 2;
        const en = kid(bl, 'ending');
        if (en && en.getAttribute('type') === 'start') ending = (en.getAttribute('number') || '1').split(/[\s,]+/).map(Number).filter(Boolean);
      });
      it.ending = ending;
      kids(m, 'barline').forEach((bl) => {
        const en = kid(bl, 'ending');
        if (en && (en.getAttribute('type') === 'stop' || en.getAttribute('type') === 'discontinue')) ending = null;
      });
      return it;
    });
    const seq = [];
    const jumps = new Map();
    let start = 0;
    let pass = 1;
    let i = 0;
    while (i < info.length && seq.length < 8000) {
      const it = info[i];
      if (it.fwd && i !== start) {
        start = i;
        pass = 1;
      }
      if (it.ending && !it.ending.includes(pass)) {
        i++;
        continue;
      }
      seq.push(i);
      if (it.back) {
        const done = jumps.get(i) || 0;
        if (done < it.back - 1) {
          jumps.set(i, done + 1);
          pass = done + 2;
          i = start;
          continue;
        }
        start = i + 1;
        pass = 1;
      }
      i++;
    }
    return seq;
  }

  App.musicXml = { load, parse };
})();
