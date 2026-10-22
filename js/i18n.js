/* Языки интерфейса. Ключ перевода — сам русский текст: App.t('Настройки') → «Settings».
 * Словари лежат в js/i18n/<язык>.js; чего нет в словаре — берём из английского, а если нет и там — показываем по-русски. */
(function () {
  const App = (window.App = window.App || {});

  // notes — как принято подписывать ноты: «До Ре Ми», «C D E» или «Do Re Mi».
  const LANGS = [
    { id: 'ru', name: 'Русский', notes: 'ru' },
    { id: 'en', name: 'English', notes: 'latin' },
    { id: 'es', name: 'Español', notes: 'solfege' },
    { id: 'pt', name: 'Português', notes: 'solfege' },
    { id: 'de', name: 'Deutsch', notes: 'latin' },
  ];
  const KEY = 'zvukoryad.lang';
  // Тем, у кого браузер на этих языках, по-русски обычно понятнее, чем по-английски.
  const RU_LIKE = ['ru', 'uk', 'be', 'kk', 'ky', 'uz', 'tg', 'hy', 'az', 'ka', 'tt'];

  function detect() {
    try {
      const saved = localStorage.getItem(KEY);
      if (LANGS.some((l) => l.id === saved)) return saved;
      // Кто уже играл на сайте, когда он был только русским, — пусть и дальше видит его по-русски.
      if (localStorage.getItem('zvukoryad.v1')) return 'ru';
    } catch (e) { /* приватный режим */ }
    const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'ru'];
    for (const l of list) {
      const code = String(l).toLowerCase().slice(0, 2);
      if (RU_LIKE.includes(code)) return 'ru';
      if (LANGS.some((x) => x.id === code)) return code;
    }
    return 'en';
  }

  const lang = detect();
  const dict = {};

  const i18n = (App.i18n = {
    lang,
    languages: LANGS,
    /** Подписи нот, принятые для этого языка. */
    noteMode: LANGS.find((l) => l.id === lang).notes,
    add(id, table) {
      dict[id] = Object.assign(dict[id] || {}, table);
    },
    /** Сменить язык: проще и надёжнее всего перерисовать страницу заново. */
    set(id) {
      try {
        localStorage.setItem(KEY, id);
      } catch (e) { /* не сохранится — но язык всё равно сменится до перезагрузки */ }
      location.reload();
    },
    /** Русские слова, которых ещё нет в словаре (для проверки переводов). */
    missing: new Set(),
  });

  App.t = function (text, params) {
    let s = text;
    if (lang !== 'ru') {
      const own = dict[lang] && dict[lang][text];
      const en = dict.en && dict.en[text];
      s = own != null ? own : en != null ? en : text;
      if (own == null && en == null && /[А-Яа-яЁё]/.test(text)) i18n.missing.add(text);
    }
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
    return s;
  };

  document.documentElement.lang = lang;
  // Словари подключаем сразу, пока страница грузится, — до скриптов, которые ими пользуются.
  if (lang !== 'ru') {
    document.write('<script src="js/i18n/en.js"><\/script>');
    if (lang !== 'en') document.write('<script src="js/i18n/' + lang + '.js"><\/script>');
  }
})();
