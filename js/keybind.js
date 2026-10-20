/* Свои клавиши: какая клавиша компьютера (или пэд MIDI-барабанов) что играет на инструменте. */
(function () {
  const App = (window.App = window.App || {});
  const h = App.h;

  let shell = null;

  // Эти клавиши назначать нельзя: ими управляет браузер, или сайт их не слышит.
  const BLOCKED = new Set(['Tab', 'Escape', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
    'OSLeft', 'OSRight', 'ContextMenu', 'F5', 'F11', 'F12', 'CapsLock', 'NumLock', 'ScrollLock', 'PrintScreen', 'Pause', 'Fn']);
  const isMidi = (code) => /^Midi\d+$/.test(code);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  const kb = (App.keybind = {
    /** Пока ждём новую клавишу — сюда приходят и ноты с MIDI. */
    capturing: null,
    init(s) {
      shell = s;
    },
    /** MIDI-модуль спрашивает: нужна ли эта нота окну настройки? true — забрали. */
    capture(code) {
      if (!kb.capturing) return false;
      kb.capturing(code);
      return true;
    },
    open,
  });

  function open() {
    const c = shell.current();
    if (!c || !c.layout || !c.layout.keyActions) {
      shell.toast('Откройте инструмент — тогда можно назначить ему клавиши');
      return;
    }
    shell.closeDialogs();
    const scheme = shell.scheme();
    const settings = shell.settings;
    const map = Object.assign({}, settings.keys[scheme] || {});
    let waiting = null; // { code, btn }

    /** Какие настоящие клавиши (и MIDI-ноты) делают то же, что клавиша по умолчанию code. */
    const doing = (code) => {
      const list = Object.keys(map).filter((k) => map[k] === code);
      if (!own(map, code)) list.unshift(code);
      return list;
    };

    function store() {
      if (Object.keys(map).length) settings.keys[scheme] = Object.assign({}, map);
      else delete settings.keys[scheme];
      shell.save();
      App.keymap.use(settings.keys[scheme]);
      changed = true;
    }

    /** Клавиша phys теперь делает то же, что code. Клавиатура заменяет клавиатуру, MIDI добавляется к ней. */
    function assign(code, phys) {
      doing(code).forEach((p) => {
        if (p !== phys && isMidi(p) === isMidi(phys)) map[p] = null;
      });
      if (phys === code) delete map[phys];
      else map[phys] = code;
      store();
    }

    function unbind(code) {
      doing(code).forEach((p) => (map[p] = null));
      store();
    }

    function reset() {
      Object.keys(map).forEach((k) => delete map[k]);
      store();
      render();
    }

    const keyText = (code) => {
      const list = doing(code);
      if (!list.length) return '—';
      const keys = list.filter((p) => !isMidi(p)).map(App.keymap.keyName);
      const pads = list.filter(isMidi).map(App.keymap.keyName);
      return keys.concat(pads).join(' · ');
    };

    const list = h('div.kb-list');
    let changed = false;

    function render() {
      list.textContent = '';
      c.layout.keyActions().forEach((g) => {
        list.append(h('h3', null, g.title));
        g.items.forEach((it) => {
          const btn = h('button.kb-key', { type: 'button', title: 'Нажмите, а потом — новую клавишу', 'aria-label': it.label + ': ' + keyText(it.code) + '. Сменить клавишу' }, keyText(it.code));
          if (!doing(it.code).length) btn.classList.add('empty');
          btn.addEventListener('click', () => wait(it.code, btn));
          list.append(h('div.kb-row', null,
            it.color ? h('i.kb-dot', { style: { '--c': it.color } }) : h('i.kb-dot.plain'),
            h('span.kb-label', null, it.label),
            btn));
        });
      });
    }

    function wait(code, btn) {
      stop();
      waiting = { code, btn };
      btn.classList.add('wait');
      btn.textContent = 'Нажмите клавишу…';
      kb.capturing = (phys) => {
        stop();
        assign(code, phys);
        render();
      };
    }

    function stop() {
      if (!waiting) return;
      waiting.btn.classList.remove('wait');
      waiting = null;
      kb.capturing = null;
      render();
    }

    const onKey = (e) => {
      if (!waiting) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') return stop();
      if (e.code === 'Backspace' || e.code === 'Delete') {
        const { code } = waiting;
        stop();
        unbind(code);
        render();
        return;
      }
      if (!e.code || BLOCKED.has(e.code) || e.ctrlKey || e.altKey || e.metaKey) {
        shell.toast('Эту клавишу назначить нельзя — выберите другую');
        return;
      }
      kb.capturing(e.code);
    };

    render();
    const content = h('div.keybind', null,
      h('p.note', null, 'Нажмите на клавишу справа от ноты, а потом — новую клавишу на клавиатуре. Можно ударить по пэду MIDI-барабанов или нажать клавишу MIDI-клавиатуры — они добавятся к клавише компьютера. Backspace — убрать клавишу, Esc — отменить.'),
      h('p.note', null, 'Эти клавиши — для всех инструментов с раскладкой «' + App.layoutNames[c.layoutName] + '».'),
      list,
      h('div.kb-foot', null,
        h('button.btn.ghost', { type: 'button', onClick: reset }, App.icon('restart'), 'Вернуть как было')));

    const dlg = shell.sheet('Свои клавиши: ' + c.inst.name, content, {
      onClose() {
        kb.capturing = null;
        if (changed) shell.remount();
      },
    });
    dlg.addEventListener('keydown', onKey, true);
    // Esc, пока ждём клавишу, отменяет ожидание, а не закрывает окно.
    dlg.addEventListener('cancel', (e) => {
      if (waiting) {
        e.preventDefault();
        stop();
      }
    });
  }
})();
