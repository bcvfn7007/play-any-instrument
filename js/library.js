/* «Мои мелодии»: добавленные песни хранятся в этом браузере (IndexedDB — туда влезают и большие пьесы). */
(function () {
  const App = (window.App = window.App || {});

  const DB = 'zvukoryad';
  const STORE = 'songs';
  let db = null;
  let memory = null; // если браузер не даёт хранилище (например, приватный режим) — живём в памяти

  function open() {
    if (db) return Promise.resolve(db);
    if (memory) return Promise.resolve(null);
    return new Promise((resolve) => {
      let req;
      try {
        req = indexedDB.open(DB, 1);
      } catch (e) {
        memory = new Map();
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => {
        db = req.result;
        resolve(db);
      };
      req.onerror = () => {
        memory = new Map();
        resolve(null);
      };
    });
  }

  function run(mode, fn) {
    return open().then((d) => {
      if (!d) return fn(null);
      return new Promise((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Не удалось сохранить'));
      });
    });
  }

  App.library = {
    /** Все мелодии, новые сверху. */
    list() {
      return run('readonly', (s) => (s ? s.getAll() : null)).then((all) => {
        const list = all || (memory ? [...memory.values()] : []);
        return list.sort((a, b) => (b.used || b.created) - (a.used || a.created));
      });
    },
    get(id) {
      return run('readonly', (s) => (s ? s.get(id) : null)).then((r) => r || (memory && memory.get(id)) || null);
    },
    put(rec) {
      return open().then((d) => {
        if (!d) return memory.set(rec.id, rec) && rec;
        return run('readwrite', (s) => s.put(rec)).then(() => rec);
      });
    },
    remove(id) {
      return open().then((d) => (d ? run('readwrite', (s) => s.delete(id)) : memory.delete(id)));
    },
    /** Хранится ли только до закрытия страницы. */
    temporary: () => !!memory,
  };
})();
