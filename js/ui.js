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
  function toast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = (kind === 'good' ? ic('check') : kind === 'bad' ? ic('x') : '') + '<span></span>';
    el.lastChild.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 2700);
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
    root.innerHTML = '<div class="modal-back"><div class="modal' + (opts.wide ? ' wide' : '') + '">' + x + html + '</div></div>';
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
  function avaIcon(a) { return ic(AVA_IC[a] || 'user'); }
  // выбранный аватар — значок, иначе первая буква ника (экранированная)
  function avaHTML(a) { return a ? avaIcon(a) : G.playerName().charAt(0).toUpperCase().replace(/[&<>"']/g, (m) => '&#' + m.charCodeAt(0) + ';'); }

  // Карточка экземпляра предмета ({u, s, f}) или предмета каталога (skinId)
  function itemCard(src, o) {
    o = o || {};
    const inst = typeof src === 'string' ? null : src;
    const skinId = inst ? inst.s : src;
    const sk = SKINS[skinId];
    const price = o.price != null ? o.price : (inst ? G.sellPrice(inst) : sk.value);
    const tag = o.act ? 'button' : 'div';
    const attrs = o.act ? ' data-act="' + o.act + '" data-id="' + (inst && !o.useSkinId ? inst.u : skinId) + '"' : '';
    let top = '<div class="it-top">';
    // износ — полной подписью и короткой (узкая плитка показывает короткую, CSS @container)
    const wid = inst ? G.wearOf(inst.f).id : '';
    top += o.chance != null ? '<span class="it-chance">' + G.fmtPct(o.chance) + '</span>'
      : (inst ? '<span class="it-wear" title="' + t('wear_' + wid) + '"><span class="wl">' + t('wear_' + wid) + '</span><span class="ws">' + t('wear_' + wid + '_s') + '</span></span>' : '<span></span>');
    top += '<span class="it-price">' + COIN + G.fmt(price) + '</span></div>';
    return '<' + tag + ' class="it r' + sk.r + (o.cls ? ' ' + o.cls : '') + (o.selected ? ' sel' : '') + '"' + attrs + '>' +
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
  function renderFeed() {
    const S = G.S;
    const live = typeof Live !== 'undefined' && Live.enabled;
    const top = feedMode === 'top';
    const list = live ? (top ? Live.top() : Live.items()) : (top ? S.top : S.feed);
    const st = live ? Live.state() : 'on';
    setText($('#feed-title'), t(top ? 'feed_best' : 'feed_mine'));
    setText($('#feed-count'), String(list.length));
    $('#feed').classList.toggle('off', st !== 'on');
    $$('.feed-tabs button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-id') === feedMode));
    const me = G.playerName();
    const now = live ? Live.now() : Date.now();
    const shown = new Set();
    const rows = list.map((x) => {
      const sk = SKINS[x.s];
      const key = feedMode + (x.k || x.s + '|' + x.f);
      shown.add(key);
      const c = x.c ? CASE_BY_ID[x.c] : null;
      const cls = 'fd r' + sk.r + (feedShown.has(key) ? '' : ' new') + (live && (x.me || x.n === me) ? ' me' : '') + (c ? ' link' : '');
      // подсказка: из какого кейса и когда; строка с кейсом открывает этот кейс
      const nm = (G.isStar(x.s) ? '★ ' : '') + G.skinName(x.s);
      const fin = G.finishName(x.s) + ' (' + wearShort(x.f) + ')';
      // подсказка: полное имя (в строке оно обрезается), кейс и давность; строка с кейсом открывает этот кейс
      const tip = [nm + ' | ' + fin, c ? t('feed_case', { c: G.nm(c.name) }) : '', live && x.t ? feedAgo(now - x.t) : ''].filter(Boolean).join(' · ');
      const attrs = (c ? ' data-act="feed-case" data-id="' + c.id + '"' : '') + ' title="' + tip.replace(/"/g, '&quot;') + '"';
      // одна компактная строка: картинка | предмет / ник … цена (без аватара-эмодзи); вне живого канала вместо ника — скин
      // (без износа: он есть в подсказке, а строке нужно место под название скина)
      return '<div class="' + cls + '"' + attrs + '>' +
        '<div class="fd-art">' + Art.item(x.s, x.f) + '</div>' +
        '<div class="fd-txt"><b>' + nm + (x.up ? ic('upgrade', 'fd-mk') : '') + (x.g ? ic('rewards', 'fd-mk') : '') + '</b>' +
        '<em>' + COIN + G.fmt(G.instValue(x)) + '</em>' +
        (live ? '<span class="fd-nm">' + x.n + '</span>' : '<span class="fd-sk">' + G.finishName(x.s) + '</span>') + '</div></div>';
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

  function setSpinning(v) { spinning = v; refresh(); }

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

  // ---------- Навигация ----------
  function showScreen(name, arg) {
    if (spinning) return;
    screen = name;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + name));
    const navId = name === 'case' ? 'cases' : name;
    $$('[data-act="nav"]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-id') === navId));
    $('#main').scrollTop = 0;
    Screens.render(name, arg);
    refresh();
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
    modal: modal, closeModal: closeModal, confirm: confirmBox, modalLocked: () => modalIsLocked,
    itemCard: itemCard, caseCard: caseCard, wearShort: wearShort, avaIcon: avaIcon, avaHTML: avaHTML,
    renderFeed: renderFeed, refresh: refresh, setSpinning: setSpinning, isSpinning: () => spinning,
    setSoundIcon: setSoundIcon, setProfileBadge: setProfileBadge,
    showScreen: showScreen, screen: () => screen, applyI18n: applyI18n,
  };
})();
