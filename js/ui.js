'use strict';

// Реестр экранов: каждый файл scr_*.js регистрирует { render(arg), tick(), dot() }.
// dot() — нужна ли красная точка на кнопке раздела (есть что забрать).
const Screens = (function () {
  const reg = {};
  return {
    reg: function (name, obj) { reg[name] = obj; },
    render: function (name, arg) { if (reg[name]) reg[name].render(arg); },
    tick: function (name) { if (reg[name] && reg[name].tick) reg[name].tick(); },
    dot: function (name) { return !!(reg[name] && reg[name].dot && reg[name].dot()); },
  };
})();

// Общий интерфейс: навигация, шапка, лента дропа, карточки, модалки, уведомления.
const UI = (function () {
  const t = G.t;
  const COIN = '<i class="ci"></i>';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const actions = {};
  let screen = 'cases';
  let modalOnClose = null;
  let modalIsLocked = false;
  let spinning = false;

  function setText(el, s) { if (el && el.textContent !== s) el.textContent = s; }
  function setHTML(el, s) { if (el && el._h !== s) { el._h = s; el.innerHTML = s; } }

  // Иконка из набора в style.css (.i-NAME)
  const ic = (name, cls) => '<i class="ic i-' + name + (cls ? ' ' + cls : '') + '"></i>';

  // Склонение: в I18N формы через «|» — ru: «кейс|кейса|кейсов», en: «case|cases»
  function plural(n, key) {
    const f = String(t(key)).split('|');
    if (f.length < 3) return n === 1 ? f[0] : f[f.length - 1];
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? f[0] : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? f[1] : f[2];
  }

  // Короткая запись больших чисел: 950, 1.2K, 25K, 5.22M, 1.34B — от миллиона тот же вид, что у G.fmt
  function short(n) {
    if (n >= 1e6) return G.fmt(n);
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  }

  const LOGO_SVG = '<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><path class="lm-t" d="M16 3 28.5 9.5 16 16 3.5 9.5z"/>' +
    '<path class="lm-l" d="M3.5 9.5 16 16v13.5L3.5 23z"/><path class="lm-r" d="M28.5 9.5 16 16v13.5L28.5 23z"/>' +
    '<path class="lm-s" d="M3.5 14.2 16 20.7l12.5-6.5"/><path class="lm-k" d="M8.4 15.4l2.6 1.35v2.9L8.4 18.3z"/></svg>';
  // Название игры в два цвета: первое слово белое, остальное золотое
  function logoText() {
    const w = String(t('title')).split(' ');
    return '<b>' + w[0] + '</b>' + (w.length > 1 ? '<i>' + w.slice(1).join(' ') + '</i>' : '');
  }

  // ---------- Уведомления ----------
  // Одна стопка #toasts (место — см. ниже у TST): одинаковая ширина,
  // не больше 3 видимых, остальные ждут в очереди; каждое видно 2.7 с. Тосты других модулей
  // (достижения кладут свои прямо в #toasts) стопка тоже забирает в очередь и убирает сама.
  // Пока виден пузырь подсказки (html[data-onb="1"]), новые уведомления придерживаются.
  // Место стопки — r7_glass.css: широкий экран — внизу справа (до 3 тостов), телефон и планшет
  // (≤ 900 px, нижнее меню) — поверх полосы дропа под шапкой, по одному, чтобы не лечь на шапку страницы.
  const TST = { max: 3, ms: 2700, out: 200, qmax: 6, stale: 6000 };
  const toastNarrow = window.matchMedia('(max-width: 900px)');
  const toastMax = () => (toastNarrow.matches ? 1 : TST.max);
  const toastQ = [];
  const toastBox = $('#toasts');
  const toastHeld = () => document.documentElement.getAttribute('data-onb') === '1';
  const toastLive = () => Array.prototype.filter.call(toastBox.children, (e) => e._tm && !e.classList.contains('out'));
  function toastHide(el) {
    if (el._out) return;
    el._out = true; clearTimeout(el._tt);
    el.classList.add('out');
    setTimeout(() => { el.remove(); toastPump(); }, TST.out);
  }
  function toastPump() {
    if (toastHeld()) return;
    let live = toastLive().length;
    while (toastQ.length && live < toastMax()) {
      const q = toastQ.shift();
      if (q.bad && Date.now() - q.at > TST.stale) continue;   // ошибка, дождавшаяся очереди, уже не к месту
      const el = q.el;
      el._tm = true; el._out = false; el.classList.remove('out');
      toastBox.appendChild(el);
      el._tt = setTimeout(() => toastHide(el), TST.ms);
      live++;
    }
  }
  function toastPush(el, bad) {
    toastQ.push({ el: el, bad: !!bad, at: Date.now() });
    if (toastQ.length > TST.qmax) toastQ.shift();
    toastPump();
  }
  // чужой тост, положенный прямо в стопку, — в очередь; убранный своим таймером — освобождает место
  new MutationObserver((ms) => {
    ms.forEach((m) => {
      m.addedNodes.forEach((n) => { if (n.nodeType === 1 && !n._tm) { n.remove(); toastPush(n, n.classList.contains('bad')); } });
      m.removedNodes.forEach((n) => { if (n._tm && !n._out) { clearTimeout(n._tt); n._out = true; } });
    });
    toastPump();
  }).observe(toastBox, { childList: true });
  new MutationObserver(toastPump).observe(document.documentElement, { attributes: true, attributeFilter: ['data-onb'] });
  if (toastNarrow.addEventListener) toastNarrow.addEventListener('change', toastPump);
  function toast(text, kind) {
    text = String(text);
    // то же сообщение уже на экране — продлеваем его, в очереди — не дублируем
    const same = (e) => e._txt === text;
    const shown = toastLive().find(same);
    if (shown) { clearTimeout(shown._tt); shown._tt = setTimeout(() => toastHide(shown), TST.ms); return; }
    if (toastQ.some((q) => same(q.el))) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = (kind === 'good' ? ic('check') : kind === 'bad' ? ic('x') : '') + '<span></span>';
    el.lastChild.textContent = text;
    el._txt = text; el._tm = true;   // своё: наблюдатель стопки его не перехватывает
    toastPush(el, kind === 'bad');
  }
  G.toast = toast;

  // Вспышка частиц (редкий дроп, удачный апгрейд)
  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const el = document.createElement('i');
      el.className = 'spark';
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 160;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.background = color;
      el.style.color = color;
      el.style.setProperty('--dx', Math.cos(a) * d + 'px');
      el.style.setProperty('--dy', Math.sin(a) * d - 40 + 'px');
      el.style.animationDelay = Math.random() * 0.12 + 's';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1300);
    }
  }

  function floatText(x, y, text) {
    const el = document.createElement('div');
    el.className = 'float';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  // ---------- Модальные окна ----------
  // Незаблокированное окно получает крестик в правом верхнем углу (то же действие, что и «Забрать»/«Закрыть»)
  function modal(html, opts) {
    opts = opts || {};
    const root = $('#modal-root');
    const x = opts.locked ? '' : '<button class="m-x" data-act="close" aria-label="close">' + ic('x') + '</button>';
    // cls — дополнительный класс окна (например, 'sec' — чёрное окно секретного предмета)
    root.innerHTML = '<div class="modal-back"><div class="modal' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : '') + '">' + x + html + '</div></div>';
    root.classList.add('show');
    modalOnClose = opts.onClose || null;
    modalIsLocked = !!opts.locked;
    if (!opts.locked) {
      const back = root.firstChild;
      back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
    }
  }

  function closeModal(skipCb) {
    const root = $('#modal-root');
    root.classList.remove('show');
    root.innerHTML = '';
    modalIsLocked = false;
    const cb = modalOnClose;
    modalOnClose = null;
    if (cb && !skipCb) cb();
    if (giftQ.length) setTimeout(nextGift, 0);   // подарок ждал, пока закроется это окно
  }

  let confirmCb = null;
  function confirmBox(text, onYes) {
    modal('<p class="confirm-text">' + text + '</p><div class="m-btns row">' +
      '<button class="btn" data-act="close">' + t('no') + '</button>' +
      '<button class="btn primary" data-act="confirm-yes">' + t('yes') + '</button></div>');
    confirmCb = onYes;
  }
  actions['confirm-yes'] = function () { const cb = confirmCb; confirmCb = null; closeModal(true); if (cb) cb(); };
  actions['close'] = function () { closeModal(); };

  // ---------- Карточки ----------
  function wearShort(f) { return t('wear_' + G.wearOf(f).id); }

  // Аватар игрока: в сохранении и в живой ленте остаются прежние ключи G.AVATARS (эмодзи — только идентификатор),
  // на экране — монохромный значок Phosphor на графитовой плитке
  const AVA_IC = { '🐺': 'dog', '🦊': 'cat', '🐯': 'paw', '🦅': 'bird', '🐉': 'ghost', '💀': 'skull', '🤖': 'robot', '👑': 'crown', '🐍': 'sword', '🦂': 'bug', '🔥': 'fire', '⚡': 'bolt' };
  // аватары-награды уровней (lv_*) — значки из js/xp.js
  function avaIcon(a) { return ic(AVA_IC[a] || (typeof XP !== 'undefined' && XP.avaIc(a)) || 'user'); }
  // выбранный аватар — значок, иначе первая буква ника (экранированная)
  function avaHTML(a) { return a ? avaIcon(a) : G.playerName().charAt(0).toUpperCase().replace(/[&<>"']/g, (m) => '&#' + m.charCodeAt(0) + ';'); }

  // Карточка экземпляра предмета ({u, s, f}) или предмета каталога (skinId)
  function itemCard(src, o) {
    o = o || {};
    const inst = typeof src === 'string' ? null : src;
    const skinId = inst ? inst.s : src;
    const sk = SKINS[skinId];
    const price = o.price != null ? o.price : (inst ? G.shownPrice(inst) : sk.value);
    const secret = G.isSecret(skinId);
    const tag = o.act ? 'button' : 'div';
    const attrs = o.act ? ' data-act="' + o.act + '" data-id="' + (inst && !o.useSkinId ? inst.u : skinId) + '"' : '';
    let top = '<div class="it-top">';
    // износ — полной подписью и короткой (узкая плитка показывает короткую, CSS @container)
    const wid = inst ? G.wearOf(inst.f).id : '';
    // у трофея износ на цену не влияет — вместо него подпись редкости
    top += o.chance != null ? '<span class="it-chance">' + G.fmtPct(o.chance) + '</span>'
      : secret ? '<span class="it-sec" title="' + t('rar_secret') + '"><span class="wl">' + t('rar_secret') + '</span><span class="ws">' + t('rar_secret_s') + '</span></span>'
      : (inst ? '<span class="it-wear" title="' + t('wear_' + wid) + '"><span class="wl">' + t('wear_' + wid) + '</span><span class="ws">' + t('wear_' + wid + '_s') + '</span></span>' : '<span></span>');
    top += '<span class="it-price">' + COIN + G.fmt(price) + '</span></div>';
    return '<' + tag + ' class="it r' + sk.r + (o.cls ? ' ' + o.cls : '') + (o.selected ? ' sel' : '') + '"' + attrs + '>' +
      (secret ? '<i class="it-glint" aria-hidden="true"></i>' : '') +   // тонкая светлая рамка с медленным холодным бликом
      top + '<div class="it-art">' + Art.item(skinId, inst ? inst.f : null) + '</div>' +
      // «новый» — не плашка поверх картинки, а короткая зелёная метка в строке скина (верхний ряд остаётся одному значку)
      '<div class="it-name">' + (G.isStar(skinId) ? '★ ' : '') + G.skinName(skinId) + '</div>' +
      '<div class="it-fin">' + (o.badge ? '<b class="it-new">' + o.badge + '</b>' : '') + G.finishName(skinId) + '</div>' +
      '</' + tag + '>';
  }

  // Цвет свечения карточки — акцент кейса (слишком тёмный заменяем фирменным оранжевым)
  function glowOf(hex) {
    const v = parseInt(String(hex).slice(1), 16);
    if (isNaN(v)) return '#ff9f1a';
    const lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
    return lum < 0.3 ? '#ff9f1a' : hex;
  }

  // Сводка по кейсу (считается один раз): самый дорогой предмет и есть ли ножи/реликвии
  const caseInfo = {};
  function caseStats(c) {
    let s = caseInfo[c.id];
    if (!s) {
      s = { max: 0, top: c.items[0], star: false, relic: false, ultra: false };
      c.items.forEach((id) => {
        const sk = SKINS[id];
        if (sk.value > s.max) { s.max = sk.value; s.top = id; }
        if (sk.r >= 8) s.ultra = true;
        else if (sk.r >= 7) s.relic = true;
        else if (G.isStar(id)) s.star = true;
      });
      caseInfo[c.id] = s;
    }
    return s;
  }

  // Самый дорогой кейс — с меткой «Топ»
  let topCaseId = null;
  function topCase() {
    if (!topCaseId) topCaseId = CASES.reduce((a, c) => (c.price > a.price ? c : a), CASES[0]).id;
    return topCaseId;
  }

  // Ящик в плитке вписывается по своим настоящим границам (прозрачные поля картинки не в счёт):
  // ширина не больше FIT_W студии, высота не больше FIT_H, центр границ — в центре студии.
  // Так все ящики в ряду одного масштаба. Границы меряются один раз на кейс (уменьшенная копия, ~7 тыс. точек).
  const FIT_W = 0.86, FIT_H = 0.74, ART_R = 1.5;   // ART_R — пропорция .cc-art (3 / 2)
  const crateFit = {};
  let fitCv = null;
  function crateBox(img) {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (nw < 64 || nh < 32) return null;
    const w = 108, h = Math.round(w * nh / nw);
    if (!fitCv) fitCv = document.createElement('canvas');
    fitCv.width = w; fitCv.height = h;
    const x = fitCv.getContext('2d', { willReadFrequently: true });
    let d;
    try { x.clearRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h); d = x.getImageData(0, 0, w, h).data; } catch (e) { return null; }
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let i = 0; i < w; i++) {
        if (d[(y * w + i) * 4 + 3] > 24) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0) return null;
    return { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h, a: nw / nh };
  }
  function fitStyle(b) {
    const W = Math.min(FIT_W / b.w, FIT_H * b.a / (ART_R * b.h));   // ширина картинки в долях ширины студии
    const pc = (v) => (v * 100).toFixed(2) + '%';
    return '--cw:' + pc(W) + ';--cl:' + pc(0.5 - W * (b.x + b.w / 2)) + ';--ct:' + pc(0.5 - W * ART_R / b.a * (b.y + b.h / 2));
  }
  // картинка ящика загрузилась (и после отрисовки в очереди тоже) — вписываем и показываем
  document.addEventListener('load', (e) => {
    const im = e.target;
    if (!im.classList || !im.classList.contains('crate') || im.classList.contains('pend')) return;
    const art = im.parentNode;
    if (!art || !art.classList.contains('cc-art')) return;
    const card = art.closest('.case-card');
    const id = card ? card.getAttribute('data-id') : '';
    let st = crateFit[id];
    if (!st) {
      const b = crateBox(im);
      st = b ? fitStyle(b) : '';
      if (b && id) crateFit[id] = st;
    }
    if (st) art.setAttribute('style', st);
    art.classList.add('fit');
  }, true);

  // Плитка кейса: ящик в тёмной студии, метки в левом верхнем углу, снизу название и цена
  function caseCard(c) {
    const free = c.id === FREE_CASE_ID && Date.now() >= G.S.freeAt;
    const st = caseStats(c);
    const tags = (free ? '<span class="cc-tag free">' + t('free_badge') + '</span>'
      : c.id === topCase() ? '<span class="cc-tag top">' + t('tag_top') + '</span>' : '') +
      (st.ultra ? '<span class="cc-tag tier r8">100M+</span>' : st.relic ? '<span class="cc-tag tier r7">1M+</span>'
        : st.star ? '<span class="cc-tag tier r6">★</span>' : '');
    const cls = c.id === 'royal' ? ' royal' : c.sec === 'ultra' ? ' ultra' : '';
    const fit = crateFit[c.id];
    return '<button class="case-card' + cls + '" data-act="case" data-id="' + c.id + '">' +
      (tags ? '<span class="cc-tags">' + tags + '</span>' : '') +
      '<div class="cc-art' + (fit ? ' fit" style="' + fit : '') + '">' + Art.crate(c) + '</div>' +
      '<div class="cc-info"><div class="cc-name">' + G.nm(c.name) + '</div>' +
      '<div class="cc-price" data-cost="' + c.price + '">' + COIN + G.fmtP(c.price) + '</div></div>' +
      '</button>';
  }

  // ---------- Лента дропа (левая колонка) ----------
  // Режимы: 'all' — последние дропы, 'top' — лучшие.
  // На сайте лента общая для всех игроков (js/live.js), в Яндекс Играх — своя, из сохранения.
  // Показываются только настоящие дропы от G.C.FEED_MIN — никаких выдуманных игроков.
  let feedMode = 'all';
  let feedShown = new Set();   // строки, которые уже на экране: «въезжают» только новые
  function feedAgo(ms) {
    const m = Math.floor(ms / 60000);
    if (m < 1) return t('ago_now');
    if (m < 60) return t('ago_m', { n: m });
    const h = Math.floor(m / 60);
    return h < 24 ? t('ago_h', { n: h }) : t('ago_d', { n: Math.floor(h / 24) });
  }
  // «Топ»: повторы одного предмета у одного игрока — одна строка (самый дорогой экземпляр) со счётчиком «×7».
  // Список уже отсортирован по цене, поэтому первый встреченный экземпляр и есть самый дорогой.
  function feedGroup(list, live) {
    const out = [], at = {};
    list.forEach((x) => {
      const key = (live ? (x.pk || 'n:' + x.n) : 'me') + '|' + x.s;
      if (at[key] !== undefined) { out[at[key]].cnt++; return; }
      at[key] = out.length;
      out.push(Object.assign({}, x, { cnt: 1 }));
    });
    return out.slice(0, G.C.TOP_MAX);
  }
  let feedRows = [];           // дропы строк на экране — по номеру строки клик по нику находит игрока
  function renderFeed() {
    const S = G.S;
    const live = typeof Live !== 'undefined' && Live.enabled;
    const top = feedMode === 'top';
    const raw = live ? (top ? Live.top() : Live.items()) : (top ? S.top : S.feed);
    const list = top ? feedGroup(raw, live) : raw;
    feedRows = list;
    const st = live ? Live.state() : 'on';
    setText($('#feed-title'), t(top ? 'feed_best' : 'feed_mine'));
    setText($('#feed-count'), String(list.length));
    $('#feed').classList.toggle('off', st !== 'on');
    $$('.feed-tabs button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-id') === feedMode));
    const me = G.playerName();
    const now = live ? Live.now() : Date.now();
    const shown = new Set();
    const q = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const rows = list.map((x, i) => {
      const sk = SKINS[x.s];
      const key = feedMode + (x.k || x.s + '|' + x.f);
      shown.add(key);
      const c = x.c ? CASE_BY_ID[x.c] : null;
      const mine = live && (x.me || x.n === me);
      const cls = 'fd r' + sk.r + (feedShown.has(key) ? '' : ' new') + (mine ? ' me' : '') + (c ? ' link' : '');
      const nm = (G.isStar(x.s) ? '★ ' : '') + G.skinName(x.s);
      const fin = G.finishName(x.s) + ' (' + wearShort(x.f) + ')';
      const cnt = x.cnt > 1 ? x.cnt : 0;
      // подсказка: полное имя (в строке оно обрезается), повторы, кейс и давность; строка с кейсом открывает этот кейс
      const v = G.instValue(x);
      const tip = [nm + ' | ' + fin, G.fmt(v), cnt ? t('feed_rep', { n: cnt }) : '', c ? t('feed_case', { c: G.nm(c.name) }) : '', live && x.t ? feedAgo(now - x.t) : ''].filter(Boolean).join(' · ');
      const attrs = (c ? ' data-act="feed-case" data-id="' + c.id + '"' : '') + ' title="' + q(tip) + '"';
      // плотная строка: картинка (с «×N» в «Топ») | ник … цена / предмет; полоса редкости — слева по краю строки.
      // Ник — отдельная кнопка: открывает профиль игрока (свой — свой профиль). Вне живого канала вместо ника — скин.
      const who = live
        ? '<span class="fd-nm" data-act="feed-who" data-id="' + i + '" title="' + q(t(mine ? 'feed_myprof' : 'feed_prof')) + '">' + x.n + '</span>'
        : '<span class="fd-sk">' + G.finishName(x.s) + '</span>';
      return '<div class="' + cls + '"' + attrs + '>' +
        '<div class="fd-art">' + Art.item(x.s, x.f) + (cnt ? '<span class="fd-x">×' + cnt + '</span>' : '') + '</div>' +
        '<div class="fd-txt"><div class="fd-l1">' + who + '<em>' + COIN + (v >= 1e6 ? G.fmt(v) : G.fmtInt(v)) + '</em></div>' +
        '<b>' + nm + (x.up ? ic('upgrade', 'fd-mk') : '') + (x.g ? ic('rewards', 'fd-mk') : '') + '</b></div></div>';
    });
    feedShown = shown;
    // пусто — короткая серая строка вверху списка; нет связи — такая же строка внизу колонки, список (если был) остаётся
    const stTxt = st === 'conn' ? t('feed_conn') : st === 'err' ? t('feed_off') : '';
    const empty = stTxt ? '' : t(live ? 'feed_empty_all' : 'feed_empty', { v: G.fmtInt(G.C.FEED_MIN) });
    setHTML($('#feed-list'), rows.length ? rows.join('') : empty ? '<div class="fd-empty">' + empty + '</div>' : '');
    $('#feed').classList.toggle('fd-bare', !rows.length && !!stTxt);   // на телефоне строка «нет связи» занимает всю полосу
    const stEl = $('#feed-st');
    if (stEl) {
      setText(stEl, stTxt);
      stEl.hidden = !stTxt;
    }
  }

  // ---------- Шапка и доступность кнопок ----------
  function refresh() {
    const S = G.S;
    setText($('#bal'), G.fmt(S.coins));
    $$('[data-cost]').forEach((el) => {
      const poor = !G.canPay(Number(el.getAttribute('data-cost')));
      el.classList.toggle('poor', poor);
      if (el.tagName === 'BUTTON') el.disabled = poor || spinning;
    });
    $$('[data-lock]').forEach((el) => { if (!el.hasAttribute('data-cost')) el.disabled = spinning || G.adBusy; });
    $$('[data-act="nav"]').forEach((b) => { b.disabled = spinning; });
    const adm = typeof Desk !== 'undefined' && Desk.unlocked();
    $$('[data-act="nav"][data-id="admin"]').forEach((b) => { b.hidden = !adm; });
    const dots = {};
    $$('.topnav [data-act="nav"], #tabbar [data-act="nav"], .hbtn[data-act="nav"]').forEach((b) => {
      const id = b.getAttribute('data-id');
      if (!(id in dots)) dots[id] = id !== screen && Screens.dot(id);
      b.classList.toggle('dot', dots[id]);
    });
    if (Screens.tick) Screens.tick(screen);
  }
  G.onChange = refresh;

  function setSpinning(v) { spinning = v; refresh(); if (!v && giftQ.length) setTimeout(nextGift, 0); }

  // ---------- Окно «Подарок» (G.giftReceive) ----------
  // Сдержанно: крупно предмет, редкость, цена и «Забрать» — без конфетти и вспышек.
  // Во время прокрутки или пока открыто другое окно подарок ждёт в очереди и показывается после.
  const giftQ = [];
  function gift(inst, from) {
    giftQ.push({ inst: inst, from: from || '' });
    // предмет уже в инвентаре — открытый экран с сеткой перерисовываем сразу
    if (!spinning && ['inv', 'profile', 'upgrade'].indexOf(screen) >= 0) Screens.render(screen);
    refresh();
    setTimeout(nextGift, 0);
  }
  function nextGift() {
    if (!giftQ.length || spinning || $('#modal-root').classList.contains('show')) return;
    const g = giftQ.shift(), x = g.inst;
    if (!G.findInst(x.u)) { nextGift(); return; }
    const sk = SKINS[x.s], secret = G.isSecret(x.s);
    modal('<h3 class="m-title">' + ic('rewards') + t('gift_title') + '</h3>' +
      '<div class="drop-one r' + sk.r + '"><div class="drop-art">' + Art.item(x.s, x.f) + '</div></div>' +
      '<div class="drop-rar r' + sk.r + '">' + t('rar_' + RARITIES[sk.r].id) + '</div>' +
      '<div class="drop-name">' + (G.isStar(x.s) ? '★ ' : '') + G.skinName(x.s) + ' <span>| ' + G.finishName(x.s) + '</span></div>' +
      '<div class="drop-wear">' + (secret ? t('trophy_note') : wearShort(x.f) + ' · ' + x.f.toFixed(4)) + '</div>' +
      '<div class="drop-price">' + COIN + G.fmt(G.instValue(x)) + '</div>' +
      (g.from === 'admin' ? '<p class="hint">' + t('gift_from_admin') + '</p>' : '') +
      '<div class="m-btns"><button class="btn primary big" data-act="close">' + t('take') + '</button></div>',
    { cls: secret ? 'sec gift' : 'gift' });
    if (typeof Sfx !== 'undefined' && Sfx.win) Sfx.win(Math.min(5, sk.r));
  }

  // Кнопки звука есть в левой колонке и на экране апгрейда
  function setSoundIcon() { $$('[data-act="sound"]').forEach((b) => setHTML(b, ic(G.S.settings.sound ? 'sound' : 'mute'))); }

  function setProfileBadge() {
    const p = Platform.playerInfo();
    const img = $('#ava-img');
    const ava = G.S && G.S.profile.ava;
    if (p.photo && !ava) { img.src = p.photo; img.style.display = 'block'; setText($('#ava-letter'), ''); }
    else { img.style.display = 'none'; setHTML($('#ava-letter'), avaHTML(ava)); }
    $('#ava-btn').classList.toggle('ico', !!ava);
    setText($('#hdr-name'), G.playerName());
  }

  // ---------- Облегчённое стекло (html.gl-lite) ----------
  // backdrop-filter дорог на слабых устройствах. Замеряем кадры (rAF): один раз в покое — когда ушла
  // заставка и опустела очередь отрисовки картинок (Art), и до трёх раз при прокрутке. Кадры дольше
  // 100 мс отбрасываем как разовые (подгрузка, сборка мусора). Средний кадр дольше ~28 мс (< 35 к/с) —
  // плохой замер; два плохих подряд, из них хотя бы один при прокрутке, — стекло остаётся только у шапки
  // и окон (r7_glass.css). Решение хранится 7 дней и сбрасывается при смене версии картинок (Art.ver).
  // Слабый телефон — сразу облегчённый, без записи. Старое бессрочное «1» в хранилище — замеряем заново.
  // Проверка на 127.0.0.1: ?gl=lite — включить сразу, ?gl=full — не замерять. Замеры — в html[data-gl-ms].
  (function glassProbe() {
    const root = document.documentElement, KEY = 'cl_gl_lite', LIMIT = 28, SPIKE = 100, TTL = 7 * 864e5;
    const ver = () => String((typeof Art !== 'undefined' && Art.ver) || '');
    const dev = /^(127.0.0.1|localhost)$/.test(location.hostname) ? new URLSearchParams(location.search).get('gl') : null;
    const lite = (why, keep) => {
      if (root.classList.contains('gl-lite')) return;
      root.classList.add('gl-lite'); root.dataset.glWhy = why;
      if (keep) try { localStorage.setItem(KEY, JSON.stringify({ v: ver(), t: Date.now() })); } catch (e) { /* хранилище недоступно — решим заново */ }
    };
    if (dev === 'lite') { lite('dev'); return; }
    if (dev === 'full') return;
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* нет хранилища */ }
    if (saved !== null) {
      let d = null;
      try { d = JSON.parse(saved); } catch (e) { /* испорчено — замеряем заново */ }
      const age = d && typeof d === 'object' ? Date.now() - Number(d.t) : NaN;
      if (age >= 0 && age < TTL && d.v === ver()) { lite('saved'); return; }
      try { localStorage.removeItem(KEY); } catch (e) { /* нет хранилища */ }
    }
    const nav = navigator, coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (coarse && ((nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory || 8) <= 2)) { lite('weak'); return; }
    // очередь отрисовки картинок пуста (Art.prewarm([]) завершается ровно тогда); при первом заходе
    // без кэша картинки на слабом устройстве рисуются долго — дольше 20 с от загрузки не ждём
    const T0 = performance.now(), CAP = 20000;
    const artIdle = () => new Promise((res) => {
      const left = CAP - (performance.now() - T0);
      if (left <= 0) { res(); return; }
      const tm = setTimeout(res, left);
      (typeof Art !== 'undefined' && Art.prewarm ? Art.prewarm([]) : Promise.resolve()).then(() => { clearTimeout(tm); res(); });
    });
    let bad = 0, badScroll = false;
    function verdict(ms, tag) {
      if (ms === null) return;   // замер не состоялся — серию не прерываем и не продлеваем
      if (ms > LIMIT) { bad++; if (tag === 'scroll') badScroll = true; } else { bad = 0; badScroll = false; }
      if (bad >= 2 && badScroll) lite(tag, true);
    }
    // n кадров подряд: средняя длительность без всплесков > 100 мс и без самого долгого из оставшихся
    function measure(n, tag, valid, done) {
      const ts = [];
      const step = (t) => {
        ts.push(t);
        if (ts.length <= n) { requestAnimationFrame(step); return; }
        const d = [];
        for (let i = 1; i < ts.length; i++) { const v = ts[i] - ts[i - 1]; if (v <= SPIKE) d.push(v); }
        let ms = null;
        if (d.length >= n / 2 && (!valid || valid())) {
          d.sort((a, b) => a - b); d.pop();
          ms = d.reduce((s, v) => s + v, 0) / d.length;
        }
        root.dataset.glMs = (root.dataset.glMs ? root.dataset.glMs + ' ' : '') + tag + ':' + (ms === null ? '-' : ms.toFixed(1));
        verdict(ms, tag);
        if (done) done(ms);
      };
      requestAnimationFrame(step);
    }
    // 1) покой: ушла заставка и дорисованы картинки (рисование ящиков и предметов — не про стекло)
    let waited = 0;
    const start = setInterval(() => {
      const ld = document.getElementById('loader');
      if ((ld && !ld.classList.contains('hide')) && (waited += 250) < 15000) return;
      clearInterval(start);
      artIdle().then(() => setTimeout(() => measure(90, 'idle'), 400));
    }, 250);
    // 2) прокрутка: до трёх замеров по 45 кадров; засчитывается, только если листали весь замер
    let runs = 0, busy = false, scrolls = 0;
    const onScroll = () => {
      scrolls++;
      if (busy || runs >= 3 || root.classList.contains('gl-lite')) return;
      busy = true;
      artIdle().then(() => {
        const s0 = scrolls;
        measure(45, 'scroll', () => scrolls - s0 >= 10, (ms) => { busy = false; if (ms !== null) runs++; });
      });
    };
    ['main', 'feed-list'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('scroll', onScroll, { passive: true }); });
  })();

  // ---------- Навигация ----------
  // Короткий кроссфейд при смене экрана. Прозрачность (opacity) у стеклянной панели или её предка
  // выключает размытие под ней на время анимации, и по окончании оно появлялось бы скачком.
  // Поэтому у стеклянной панели проявляются подложка, размытие и тень (из прозрачного), а прозрачностью —
  // только её содержимое; обёртки со стеклом внутри разбираются по детям. Свои стеклянные панели помечайте .glass.
  // Дёшево: длительность читается один раз, конечные значения — свои у панели (неявный последний кадр),
  // без getComputedStyle на каждую панель; в облегчённом режиме — одна анимация на весь экран.
  const GLASS_SEL = '.glass, .panel, .up-panel, .up-bal, .up-quick, .bonus, .shop-card, .rw-card, .rw-daily, .q-row, .rw-top, .col-sec, .cp-odds, .roll, .mroll, .subnav';
  const REDUCE = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let fadeOpt = null;
  function screenFade(sc) {
    if (!sc || !sc.animate || (REDUCE && REDUCE.matches)) return;
    if (!fadeOpt) fadeOpt = { duration: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--t-screen')) || 140, easing: 'linear' };
    const fx = (el) => el.animate([{ opacity: 0 }, { opacity: 1 }], fadeOpt);
    if (document.documentElement.classList.contains('gl-lite')) { fx(sc); return; }   // без размытия — целиком
    const glass = sc.querySelectorAll(GLASS_SEL);
    if (!glass.length) { fx(sc); return; }
    const holds = new Set();
    glass.forEach((g) => { for (let e = g.parentElement; e && e !== sc && !holds.has(e); e = e.parentElement) holds.add(e); });
    const glassFx = (el) => el.animate([{ backgroundColor: 'transparent', backdropFilter: 'blur(0px) saturate(100%)', boxShadow: 'none' }, {}], fadeOpt);
    (function walk(node) {
      for (const ch of node.children) {
        if (ch.matches(GLASS_SEL)) { glassFx(ch); walk(ch); } else if (holds.has(ch)) walk(ch); else fx(ch);
      }
    })(sc);
  }

  function showScreen(name, arg) {
    if (spinning) return;
    const was = screen;
    screen = name;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + name));
    const navId = name === 'case' ? 'cases' : name;
    $$('[data-act="nav"]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-id') === navId));
    $('#main').scrollTop = 0;
    Screens.render(name, arg);
    refresh();
    if (was !== name) screenFade($('#scr-' + name));   // после отрисовки: проявляются уже новые элементы
  }

  function applyI18n() {
    document.documentElement.lang = G.lang;
    document.title = t('title');
    $$('.logo-text').forEach((el) => { el.innerHTML = logoText(); });
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    $$('[data-i18n-title]').forEach((el) => { el.title = t(el.getAttribute('data-i18n-title')); });
    $$('.foot-lang button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-id') === G.lang));
  }

  actions['nav'] = function (id) { showScreen(id); };
  // Язык из подвала (без окна настроек)
  actions['lang'] = function (id) {
    if (id !== 'ru' && id !== 'en' || id === G.lang) return;
    G.lang = id;
    G.S.settings.lang = id;
    G.save(false);
    applyI18n();
    renderFeed();
    showScreen(screen);
  };
  actions['feed'] = function (id) {
    feedMode = id === 'top' ? 'top' : 'all';
    renderFeed();
    $('#feed-list').scrollTop = 0;
    $('#feed-list').scrollLeft = 0;
  };
  // Клик по дропу в ленте — открыть кейс, из которого он выпал (не во время прокрутки)
  // Клик по нику в живой ленте — открытый профиль игрока (js/pubprofile.js); свой ник — свой профиль
  actions['feed-who'] = function (id) {
    const x = feedRows[Number(id)];
    if (!x || spinning || typeof Live === 'undefined') return;
    const p = Live.profileOf(x);
    if (!p) return;
    if (p.me) showScreen('profile');
    else if (typeof PubProfile !== 'undefined' && PubProfile.open) PubProfile.open(p);
  };
  actions['feed-case'] = function (id) {
    if (!spinning && Object.prototype.hasOwnProperty.call(CASE_BY_ID, id) && actions['case']) actions['case'](id);
  };
  actions['sound'] = function () {
    G.S.settings.sound = !G.S.settings.sound;
    Sfx.setEnabled(G.S.settings.sound);
    setSoundIcon();
    G.save(false);
  };

  return {
    $: $, $$: $$, COIN: COIN, actions: actions,
    setText: setText, setHTML: setHTML,
    ic: ic, plural: plural, short: short, glowOf: glowOf, caseStats: caseStats,
    logo: () => LOGO_SVG + '<span class="logo-text">' + logoText() + '</span>',
    toast: toast, floatText: floatText, burst: burst,
    modal: modal, closeModal: closeModal, confirm: confirmBox, modalLocked: () => modalIsLocked, gift: gift,
    itemCard: itemCard, caseCard: caseCard, wearShort: wearShort, avaIcon: avaIcon, avaHTML: avaHTML,
    renderFeed: renderFeed, refresh: refresh, setSpinning: setSpinning, isSpinning: () => spinning,
    setSoundIcon: setSoundIcon, setProfileBadge: setProfileBadge,
    showScreen: showScreen, screen: () => screen, applyI18n: applyI18n,
  };
})();
