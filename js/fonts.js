'use strict';

// Шрифты интерфейса: четыре подобранные пары «заголовки + текст».
// Пара включается классом font-<id> на <html>; @font-face и переменные --d / --f лежат в style.css.
// Браузер скачивает файлы только той пары, что сейчас на экране; index.html предзагружает лишь
// пару по умолчанию. Выбор игрока хранится в G.S.settings.font (проверка — G.sanitize).
const Fonts = (function () {
  // d / f — семейства заголовков и текста из @font-face (по ним прогревается загрузка),
  // dn — название для подписи, если семейство в CSS — псевдоним
  const LIST = [
    { id: 'tactic', d: 'Science Gothic', f: 'Golos Text' },
    { id: 'tech', d: 'Plex Condensed', f: 'IBM Plex Sans', dn: 'IBM Plex Sans Condensed' },
    { id: 'cyber', d: 'Tektur', f: 'Onest' },
    { id: 'classic', d: 'Oswald', f: 'Roboto' },
  ];
  const DEF = LIST[0].id;
  const t = G.t;
  let cur = DEF;
  let back = null;   // куда вернуться по «Закрыть» (в настройки, если окно открыто оттуда)

  const byId = (id) => LIST.filter((x) => x.id === id)[0] || null;

  // Включает пару: класс на <html> и ранний запуск загрузки её файлов (кириллица + латиница),
  // чтобы document.fonts.ready на экране загрузки (main.js) дождался именно их.
  function apply(id) {
    const p = byId(id) || byId(DEF);
    cur = p.id;
    const cl = document.documentElement.classList;
    LIST.forEach((x) => cl.toggle('font-' + x.id, x === p));
    if (document.fonts && document.fonts.load) {
      [p.d, p.f].forEach((fam) => { document.fonts.load('700 16px "' + fam + '"', 'Кейс Lab 0').catch(() => null); });
    }
    return cur;
  }

  // Старт игры: сохранённый выбор; при локальном просмотре (127.0.0.1) можно подменить ?font=<id>
  function boot(saved) {
    let dev = null;
    try {
      if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) dev = new URLSearchParams(location.search).get('font');
    } catch (e) { /* без адресной строки */ }
    return apply(byId(dev) ? dev : saved);
  }

  // ---------- Настройки: кнопка-образец и окно выбора ----------
  // «Aa» набрано текущим шрифтом заголовков (стиль .fn-aa)
  const button = (from) => '<button class="btn" data-act="font-pick" data-id="' + (from || '') + '">' +
    '<b class="fn-aa">Aa</b>' + t('font_' + cur) + '</button>';

  function optHtml(p) {
    return '<button class="fn-opt' + (p.id === cur ? ' on' : '') + '" data-act="set-font" data-id="' + p.id + '">' +
      '<span class="fn-hd"><b>' + t('font_' + p.id) + '</b>' + UI.ic('check', 'fn-mark') + '</span>' +
      '<span class="fn-fam">' + (p.dn || p.d) + ' <i>+</i> ' + p.f + '</span>' +
      '<span class="fn-ds">' + t('font_' + p.id + '_d') + '</span></button>';
  }

  function showPicker() {
    UI.modal('<h3 class="m-title">' + t('font_pick') + '</h3>' +
      '<div class="fn-list">' + LIST.map(optHtml).join('') + '</div>' +
      '<p class="hint">' + t('font_hint') + '</p>' +
      '<div class="m-btns"><button class="btn" data-act="font-done">' + t('close') + '</button></div>');
  }

  const A = UI.actions;
  A['font-pick'] = function (from) {
    if (UI.isSpinning()) return;
    back = from === 'settings' ? 'settings' : null;
    showPicker();
  };
  // Выбор применяется сразу ко всей игре, окно не перерисовывается — меняется только отметка
  A['set-font'] = function (id) {
    if (!byId(id)) return;
    G.S.settings.font = id;
    apply(id);
    G.save(false);
    UI.$$('#modal-root .fn-opt').forEach((el) => el.classList.toggle('on', el.getAttribute('data-id') === id));
  };
  A['font-done'] = function () {
    const b = back;
    back = null;
    if (b && A[b]) A[b]();
    else UI.closeModal();
  };

  return {
    list: () => LIST.slice(),
    has: (id) => !!byId(id),
    current: () => cur,
    apply: apply,
    boot: boot,
    button: button,
  };
})();
