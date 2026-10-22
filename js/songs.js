/* Простые мелодии для режима «Разучить мелодию». */
(function () {
  const App = (window.App = window.App || {});

  /**
   * Запись мелодии: «нота[:доли]» через пробел, «|» — просто черта для удобства чтения.
   * Доля по умолчанию — 1 (четверть), .5 — восьмая, 2 — половинная.
   * На выходе — массив [midi, доли].
   */
  function tune(text) {
    return text.split(/\s+/).filter((t) => t && t !== '|').map((t) => {
      const [name, beats] = t.split(':');
      const midi = App.notes.parse(name);
      if (midi == null) throw new Error(App.t('Не понял ноту «') + t + '»');
      return [midi, beats ? parseFloat(beats) : 1];
    });
  }

  // Все мелодии записаны в до мажоре (или ля миноре) рядом с первой октавой —
  // так они ложатся на белые клавиши. Под конкретный инструмент их сдвигает app.js.
  App.songs = [
    {
      id: 'elochka',
      title: App.t('В лесу родилась ёлочка'),
      about: App.t('Новогодняя'),
      bpm: 92,
      notes: tune(`
        G3:.5 E4:.5 E4:.5 D4:.5 E4:.5 C4:.5 G3:.5 G3 |
        G3:.5 E4:.5 E4:.5 F4:.5 D4:.5 G4:1.5 |
        G4:.5 A4:.5 A4:.5 F4:.5 F4:.5 E4:.5 D4:.5 C4 |
        G3:.5 E4:.5 E4:.5 D4:.5 E4:.5 C4:1.5`),
    },
    {
      id: 'kuznechik',
      title: App.t('В траве сидел кузнечик'),
      about: App.t('Песенка из мультфильма, куплет'),
      bpm: 112,
      notes: tune(`
        A4:.5 E4:.5 A4:.5 E4:.5 A4:.5 G#4:.5 G#4 |
        G#4:.5 E4:.5 G#4:.5 E4:.5 G#4:.5 A4:.5 A4 |
        A4:.5 B4:.5 B4:.5 B4:.5 B4:.5 C5:.5 C5 |
        C5:.5 B4:.5 A4:.5 G#4:.5 A4 A4`),
    },
    {
      id: 'ode',
      title: App.t('Ода к радости'),
      about: App.t('Бетховен, Девятая симфония'),
      bpm: 108,
      notes: tune(`
        E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:.5 D4:2 |
        E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2 |
        D4 D4 E4 C4 | D4 E4:.5 F4:.5 E4 C4 | D4 E4:.5 F4:.5 E4 D4 | C4 D4 G3:2 |
        E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2`),
    },
    {
      id: 'twinkle',
      title: 'Twinkle Twinkle Little Star',
      about: App.t('Английская колыбельная'),
      bpm: 100,
      notes: tune(`
        C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 |
        G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 |
        C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2`),
    },
    {
      id: 'babusya',
      title: App.t('Жили у бабуси'),
      about: App.t('Народная'),
      bpm: 104,
      notes: tune(`
        F4:.5 E4:.5 D4:.5 C4:.5 | G3 G3 |
        F4:.5 E4:.5 D4:.5 C4:.5 | G3 G3 |
        F4:.5 A4:.5 A4:.5 F4:.5 | E4:.5 G4:.5 G4:.5 E4:.5 |
        D4:.5 F4:.5 E4:.5 D4:.5 | C4 C4`),
    },
    {
      id: 'birthday',
      title: App.t('С днём рождения тебя'),
      about: 'Happy Birthday',
      bpm: 96,
      notes: tune(`
        G4:.75 G4:.25 A4 G4 C5 B4:2 |
        G4:.75 G4:.25 A4 G4 D5 C5:2 |
        G4:.75 G4:.25 G5 E5 C5 B4 A4:2 |
        F5:.75 F5:.25 E5 C5 D5 C5:2`),
    },
    {
      id: 'jingle',
      title: 'Jingle Bells',
      about: App.t('Припев'),
      bpm: 120,
      notes: tune(`
        E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:.5 | E4:4 |
        F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 | E4 D4 D4 E4 | D4:2 G4:2 |
        E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:.5 | E4:4 |
        F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 | G4 G4 F4 D4 | C4:4`),
    },
  ];
})();
