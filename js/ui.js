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

  // Короткая запись больших чисел: 950, 1.2K, 25K, 5.22M
  function short(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
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
  function modal(html, opts) {
    opts = opts || {};
    const root = $('#modal-root');
    root.innerHTML = '<div class="modal-back"><div class="modal' + (opts.wide ? ' wide' : '') + '">' + html + '</div></div>';
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
    top += o.chance != null ? '<span class="it-chance">' + G.fmtPct(o.chance) + '</span>' : (inst ? '<span class="it-wear">' + wearShort(inst.f) + '</span>' : '<span></span>');
    top += '<span class="it-price">' + COIN + G.fmt(price) + '</span></div>';
    return '<' + tag + ' class="it r' + sk.r + (o.cls ? ' ' + o.cls : '') + (o.selected ? ' sel' : '') + '"' + attrs + '>' +
      top + '<div class="it-art">' + Art.item(skinId, inst ? inst.f : null) + '</div>' +
      '<div class="it-name">' + (G.isStar(skinId) ? '★ ' : '') + G.skinName(skinId) + '</div>' +
      '<div class="it-fin">' + G.finishName(skinId) + '</div>' +
      (o.badge ? '<div class="it-badge">' + o.badge + '</div>' : '') +
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
      s = { max: 0, top: c.items[0], star: false, relic: false };
      c.items.forEach((id) => {
        const sk = SKINS[id];
        if (sk.value > s.max) { s.max = sk.value; s.top = id; }
        if (sk.r >= 7) s.relic = true;
        else if (G.isStar(id)) s.star = true;
      });
      caseInfo[c.id] = s;
    }
    return s;
  }

  function caseCard(c) {
    const free = c.id === FREE_CASE_ID && Date.now() >= G.S.freeAt;
    const st = caseStats(c);
    const tier = st.relic ? '<span class="cc-tier r7">✦ 1M+</span>' : st.star ? '<span class="cc-tier r6">★</span>' : '';
    return '<button class="case-card" data-act="case" data-id="' + c.id + '" style="--cc:' + glowOf(c.art[1]) + '">' +
      (free ? '<span class="cc-tag">' + t('free_badge') + '</span>' : '') + tier +
      '<div class="cc-art">' + Art.crate(c) + '</div>' +
      '<div class="cc-info"><div class="cc-name">' + G.nm(c.name) + '</div>' +
      '<div class="cc-row"><span class="cc-max">' + t('case_max') + '<b>' + COIN + short(st.max) + '</b></span>' +
      '<span class="cc-price" data-cost="' + c.price + '">' + COIN + G.fmtP(c.price) + '</span></div></div>' +
      '</button>';
  }

  // ---------- Лента дропа ----------
  // Режимы: 'all' — последние дропы, 'top' — лучшие за всё время.
  // Показываются только настоящие дропы от G.C.FEED_MIN; если их нет, ленты нет совсем.
  let feedMode = 'all';
  function renderFeed() {
    const S = G.S;
    const list = feedMode === 'top' ? S.top : S.feed;
    document.body.classList.toggle('no-feed', !S.feed.length);
    setText($('#feed-title'), t(feedMode === 'top' ? 'feed_best' : 'feed_mine'));
    $$('.feed-tabs button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-id') === feedMode));
    const who = (S.profile.ava ? S.profile.ava + ' ' : '') + G.playerName();
    setHTML($('#feed-list'), list.map((x) => {
      const sk = SKINS[x.s];
      return '<div class="fd r' + sk.r + (x.up ? ' up' : '') + (x.g ? ' g' : '') + '">' +
        '<div class="fd-art">' + Art.item(x.s, x.f) + '</div>' +
        '<div class="fd-txt"><b>' + (G.isStar(x.s) ? '★ ' : '') + G.skinName(x.s) +
        (x.up ? ic('upgrade', 'fd-mk') : '') + (x.g ? ic('rewards', 'fd-mk') : '') + '</b><span>' + G.finishName(x.s) +
        ' (' + wearShort(x.f) + ')</span><em><i class="fd-who">' + who + '</i><i class="fd-pr">' + COIN + G.fmt(G.instValue(x)) + '</i></em></div></div>';
    }).join(''));
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
    const adm = typeof Admin !== 'undefined' && Admin.unlocked();
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

  function setSoundIcon() { setHTML($('#btn-sound'), ic(G.S.settings.sound ? 'sound' : 'mute')); }

  function setProfileBadge() {
    const p = Platform.playerInfo();
    const img = $('#ava-img');
    const ava = G.S && G.S.profile.ava;
    if (p.photo && !ava) { img.src = p.photo; img.style.display = 'block'; setText($('#ava-letter'), ''); }
    else { img.style.display = 'none'; setText($('#ava-letter'), ava || G.playerName().charAt(0).toUpperCase()); }
    $('#ava-btn').classList.toggle('emoji', !!ava);
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
    $('#logo-text').innerHTML = logoText();
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
  }

  actions['nav'] = function (id) { showScreen(id); };
  actions['feed'] = function (id) {
    feedMode = id === 'top' ? 'top' : 'all';
    renderFeed();
    $('#feed-list').scrollTop = 0;
    $('#feed-list').scrollLeft = 0;
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
    itemCard: itemCard, caseCard: caseCard, wearShort: wearShort,
    renderFeed: renderFeed, refresh: refresh, setSpinning: setSpinning, isSpinning: () => spinning,
    setSoundIcon: setSoundIcon, setProfileBadge: setProfileBadge,
    showScreen: showScreen, screen: () => screen, applyI18n: applyI18n,
  };
})();
