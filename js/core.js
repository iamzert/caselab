'use strict';

// Ядро: состояние, экономика, инвентарь, сохранения, реклама. Всё доступно через глобальный G.
const G = (function () {
  const SAVE_KEY = 'caselab_save_v2';
  const C = {
    FREE_CD: 3 * 60e3,          // бесплатный кейс
    AD_COINS_CD: 2 * 60e3,      // монеты за рекламу
    AD_CASE_CD: 4 * 60e3,       // открытие кейса за рекламу
    AD_SELL_CD: 3 * 60e3,       // продажа ×2 за рекламу
    AD_CASE_MAX: 60,            // за рекламу открываются только кейсы не дороже этой цены
    AD_SELL_MAX: 300,           // продажа ×2 — только для дропа не дороже этой суммы
    DAY: 24 * 3600e3,
    INTERSTITIAL_EVERY: 5,      // межстраничная реклама не чаще раза в N открытий...
    INTERSTITIAL_GAP: 150e3,    // ...и не чаще раза в 2.5 минуты
    CLOUD_GAP: 30e3,
    OFFLINE_MAX_SEC: 3 * 3600,
    OFFLINE_RATE: 0.5,
    FEED_MAX: 30,
    TOP_MAX: 20,
    FEED_MIN: 25000,            // в ленту попадают только дропы от этой цены
    UP_MAX_ITEMS: 6,
  };

  // Прокачка фарма: монет за клик и доход в секунду по уровням, цена каждого следующего уровня
  const CLICK_LV = [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.75, 0.9, 1.1, 1.35, 1.65, 2, 2.5, 3];
  const AUTO_LV = [0, 0.02, 0.04, 0.07, 0.11, 0.16, 0.22, 0.3, 0.4, 0.52, 0.66, 0.83, 1.03, 1.27, 1.55, 1.9];
  const UPGRADES = [
    { id: 'click', icon: '👆', costs: [12, 25, 45, 75, 120, 190, 300, 460, 700, 1050, 1550, 2300, 3400, 5000] },
    { id: 'auto', icon: '⛏️', costs: [30, 70, 140, 250, 420, 680, 1050, 1600, 2400, 3500, 5100, 7300, 10500, 15000, 21000] },
    { id: 'luck', icon: '🍀', costs: [80, 170, 340, 650, 1200, 2100, 3600, 6000, 9800, 15500] },
    { id: 'sell', icon: '💹', costs: [60, 130, 260, 500, 920, 1650, 2900, 5000, 8500, 14000] },
  ];
  UPGRADES.forEach((u) => { u.max = u.costs.length; u.cost = (l) => u.costs[l]; });

  const G = {
    C: C, UPGRADES: UPGRADES,
    S: null, lang: 'ru',
    adBusy: false, opensSinceAd: 0, lastAdAt: Date.now(), lastCloudSave: 0,
    onChange: null,
  };

  // ================= Утилиты =================
  G.t = function (key, p) {
    const d = I18N[G.lang] || I18N.ru;
    let s = d[key] != null ? d[key] : (I18N.ru[key] != null ? I18N.ru[key] : key);
    if (p) Object.keys(p).forEach((k) => { s = s.split('{' + k + '}').join(p[k]); });
    return s;
  };

  const groups = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // Деньги: всегда два знака после точки (20.00, 1 234.56), от миллиона — 1.23M
  G.fmt = function (n) {
    n = Number(n) || 0;
    const neg = n < -0.005;
    n = Math.abs(n);
    let s;
    if (n < 1e5) {
      const p = (Math.floor(n * 100 + 1e-6) / 100).toFixed(2).split('.');
      s = groups(p[0]) + '.' + p[1];
    } else if (n < 1e6) {
      s = groups(String(Math.floor(n)));      // 245 300 — без копеек, чтобы влезало в карточки
    } else if (n < 1e36) {
      // 1.23M · 4.56B · 7.89T · 1.00Qa … 999.99Dc; округление вниз — не показываем больше, чем есть, и не бывает «1000.00M»
      const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
      let i = -1;
      while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
      s = (Math.floor(n * 100 + 1e-6) / 100).toFixed(2) + units[i];
    } else {
      s = isFinite(n) ? n.toExponential(2).replace('+', '') : '∞';   // 1.00e36
    }
    return (neg ? '-' : '') + s;
  };
  // Цена кейса: целые без копеек (1 499), дробные — с копейками (8.99)
  // от миллиарда — тот же короткий вид, что и у G.fmt (1.34B), чтобы длинные числа не ломали вёрстку
  G.fmtP = (n) => (n < 1e9 && Math.abs(n - Math.round(n)) < 1e-9 ? groups(String(Math.round(n))) : G.fmt(n));
  G.fmtInt = (n) => (n >= 1e9 ? G.fmt(n) : groups(String(Math.floor(n || 0))));

  G.fmtTime = function (ms) {
    let s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    const p = (n) => (n < 10 ? '0' + n : String(n));
    return h ? h + ':' + p(m) + ':' + p(s) : m + ':' + p(s);
  };

  G.fmtPct = function (p) {
    if (p >= 10) return p.toFixed(0) + '%';
    if (p >= 1) return p.toFixed(1) + '%';
    if (p >= 0.01) return p.toFixed(2) + '%';
    return '<0.01%';
  };

  G.wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Профиль игрока ----------
  G.AVATARS = ['🐺', '🦊', '🐯', '🦅', '🐉', '💀', '🤖', '👑', '🐍', '🦂', '🔥', '⚡'];
  // Ник: 3–16 символов, без управляющих символов, кавычек и угловых скобок (безопасно для HTML)
  G.cleanName = function (s) {
    if (typeof s !== 'string') return '';
    s = s.replace(/[\u0000-\u001f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
    return s.length >= 3 && s.length <= 16 ? s : '';
  };
  G.playerName = () => (G.S && G.S.profile.name) || G.cleanName(Platform.playerInfo().name) || G.t('guest');
  G.nm = (o) => o[G.lang] || o.ru;
  G.changed = function () { if (G.onChange) G.onChange(); };

  // ================= Состояние =================
  function defaultState() {
    return {
      v: 2, coins: START_COINS, total: 0,
      inv: [], uid: 1, found: {}, feed: [], top: [],
      up: { click: 0, auto: 0, luck: 0, sell: 0 },
      opened: 0, clicks: 0, upgrades: 0, upWins: 0, best: null,
      daily: { last: 0, streak: 0 },
      // Награды: номер периода, за который приз уже забран (час / день / неделя)
      rw: { h: -1, d: -1, w: -1 },
      // Счётчики текущего дня для заданий: o — кейсы, u — апгрейды, uw — удачные апгрейды,
      // c — клики, s — продано на сумму, r — лучшая редкость из кейса, q — забранные задания
      day: { id: -1, o: 0, u: 0, uw: 0, c: 0, s: 0, r: -1, q: [] },
      week: { id: -1, o: 0 },
      freeAt: 0, adCoinsAt: 0, adCaseAt: 0, adSellAt: 0,
      adOwed: '',   // кейс, за который реклама уже просмотрена, но он ещё не открыт (переживает перезагрузку)
      lastSeen: Date.now(),
      // bgBlur / bgDim — размытие (px) и затемнение (%) фона (js/bg.js, Backgrounds.tune): по умолчанию 3 px / 40 % —
      // локация читается как настоящее место, а текст и панели остаются читаемыми (до этого было 16 / 34);
      // guest — игрок нажал «Играть как гость» (Яндекс Игры): окно регистрации больше не показываем
      settings: { sound: true, fast: false, lang: null, sort: 'new', bg: 'coast', bgBlur: 3, bgDim: 40, guest: false },
      profile: { name: '', ava: '' },   // ник и аватар из регистрации (хранятся в сохранении)
      pid: newPid(),                    // постоянный случайный id игрока
      savedAt: 0,
    };
  }
  function newPid() {
    const a = new Uint8Array(9);
    try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
    return Array.prototype.map.call(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b & 31]).join('');
  }
  G.defaultState = defaultState;

  const num = (v, d) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : d);
  const validInst = (x) => x && SKINS[x.s] && typeof x.f === 'number' && x.f >= 0 && x.f <= 1;

  G.sanitize = function (raw) {
    const d = defaultState();
    if (!raw || typeof raw !== 'object') return d;
    ['coins', 'total', 'freeAt', 'adCoinsAt', 'adCaseAt', 'adSellAt', 'savedAt'].forEach((k) => { d[k] = num(raw[k], d[k]); });
    ['opened', 'clicks', 'upgrades', 'upWins', 'uid'].forEach((k) => { d[k] = Math.floor(num(raw[k], d[k])); });
    d.lastSeen = num(raw.lastSeen, Date.now());
    if (typeof raw.adOwed === 'string' && CASE_BY_ID[raw.adOwed]) d.adOwed = raw.adOwed;
    if (Array.isArray(raw.inv)) {
      raw.inv.forEach((x) => { if (validInst(x) && d.inv.length < INVENTORY_MAX) d.inv.push({ u: Math.floor(num(x.u, 0)), s: x.s, f: x.f }); });
    }
    // уникальные id предметов
    const seen = {};
    d.inv.forEach((x) => { if (!x.u || seen[x.u]) x.u = d.uid++; seen[x.u] = 1; if (x.u >= d.uid) d.uid = x.u + 1; });
    if (raw.found) Object.keys(raw.found).forEach((id) => { if (SKINS[id]) d.found[id] = 1; });
    const feedItem = (x) => ({ s: x.s, f: x.f, up: !!x.up, g: !!x.g });
    const dear = (x) => validInst(x) && G.instValue(x) >= C.FEED_MIN;
    if (Array.isArray(raw.feed)) d.feed = raw.feed.filter(dear).slice(0, C.FEED_MAX).map(feedItem);
    if (Array.isArray(raw.top)) d.top = raw.top.filter(dear).slice(0, C.TOP_MAX).map(feedItem);
    if (validInst(raw.best)) d.best = { s: raw.best.s, f: raw.best.f };
    const int = (v, def) => (typeof v === 'number' && isFinite(v) ? Math.floor(v) : def);
    if (raw.rw) ['h', 'd', 'w'].forEach((k) => { d.rw[k] = int(raw.rw[k], -1); });
    if (raw.day && typeof raw.day === 'object') {
      d.day.id = int(raw.day.id, -1);
      ['o', 'u', 'uw', 'c'].forEach((k) => { d.day[k] = Math.floor(num(raw.day[k], 0)); });
      d.day.s = num(raw.day.s, 0);
      d.day.r = Math.max(-1, Math.min(RARITIES.length - 1, int(raw.day.r, -1)));
      if (Array.isArray(raw.day.q)) d.day.q = raw.day.q.filter((x) => typeof x === 'string').slice(0, 12);
    }
    if (raw.week && typeof raw.week === 'object') { d.week.id = int(raw.week.id, -1); d.week.o = Math.floor(num(raw.week.o, 0)); }
    if (raw.up) UPGRADES.forEach((u) => { d.up[u.id] = Math.min(u.max, Math.floor(num(raw.up[u.id], 0))); });
    if (raw.daily) { d.daily.last = num(raw.daily.last, 0); d.daily.streak = Math.floor(num(raw.daily.streak, 0)); }
    if (raw.settings) {
      d.settings.sound = raw.settings.sound !== false;
      d.settings.fast = !!raw.settings.fast;
      d.settings.lang = raw.settings.lang === 'ru' || raw.settings.lang === 'en' ? raw.settings.lang : null;
      if (['new', 'desc', 'asc', 'rar'].indexOf(raw.settings.sort) >= 0) d.settings.sort = raw.settings.sort;
      if (typeof raw.settings.bg === 'string' && raw.settings.bg.length < 40) d.settings.bg = raw.settings.bg;
      // пара шрифтов (id из js/fonts.js); неизвестный id Fonts.apply заменит парой по умолчанию
      if (typeof raw.settings.font === 'string' && /^[a-z]{2,12}$/.test(raw.settings.font)) d.settings.font = raw.settings.font;
      // ползунки фона: только конечные числа, целые, в пределах шкалы (иначе — значение по умолчанию)
      const range = (v, hi, def) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(hi, Math.round(v))) : def);
      d.settings.bgBlur = range(raw.settings.bgBlur, 24, d.settings.bgBlur);
      d.settings.bgDim = range(raw.settings.bgDim, 80, d.settings.bgDim);
      d.settings.guest = raw.settings.guest === true;
    }
    if (raw.profile && typeof raw.profile === 'object') {
      d.profile.name = G.cleanName(raw.profile.name);
      if (G.AVATARS.indexOf(raw.profile.ava) >= 0) d.profile.ava = raw.profile.ava;
    }
    if (typeof raw.pid === 'string' && /^[a-z0-9]{6,16}$/.test(raw.pid)) d.pid = raw.pid;
    return d;
  };

  G.readLocal = function () {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
  };

  function serialize() { G.S.savedAt = Date.now(); return JSON.stringify(G.S); }

  G.save = function (forceCloud) {
    if (G.demo) return;   // демо-режим локального просмотра ничего не сохраняет
    try { localStorage.setItem(SAVE_KEY, serialize()); } catch (e) { /* приватный режим */ }
    if (!Platform.hasCloud()) return;
    if (!forceCloud && Date.now() - G.lastCloudSave < C.CLOUD_GAP) return;
    G.lastCloudSave = Date.now();
    Platform.saveCloud(serialize(), !!forceCloud);
  };

  // ================= Экономика =================
  G.foundCount = () => Object.keys(G.S.found).length;
  G.colMult = () => 1 + G.foundCount() * 0.01;
  G.clickAt = (l) => round2(CLICK_LV[Math.min(l, CLICK_LV.length - 1)] * G.colMult());
  G.incomeAt = (l) => round2(AUTO_LV[Math.min(l, AUTO_LV.length - 1)] * G.colMult());
  G.clickPower = () => G.clickAt(G.S.up.click);
  G.income = () => G.incomeAt(G.S.up.auto);
  G.luckMult = () => 1 + G.S.up.luck * LUCK_PER_LVL;
  G.sellMult = () => 1 + G.S.up.sell * SELL_PER_LVL;

  G.addCoins = function (v) { G.S.coins += v; G.S.total += v; };
  G.canPay = (cost) => G.S.coins + 1e-6 >= cost;
  G.spend = function (cost) { G.S.coins = Math.max(0, G.S.coins - cost); if (G.mix) G.mix.spent += cost; };

  G.wearOf = function (f) {
    for (let i = 0; i < WEARS.length; i++) if (f < WEARS[i].max || i === WEARS.length - 1) return WEARS[i];
    return WEARS[WEARS.length - 1];
  };

  // Цена конкретного экземпляра (с учётом износа), без бонуса торговца
  // читаемые цены (readablePrice из data.js): до 100 — с копейками, дальше шаг 1 / 10 / 100 / 10 000 / 1 000 000
  G.instValue = (x) => Math.max(0.01, readablePrice(SKINS[x.s].value * G.wearOf(x.f).mult));
  // Цена продажи (с бонусом торговца)
  G.sellPrice = (x) => Math.max(0.01, readablePrice(G.instValue(x) * G.sellMult()));

  G.rollFloat = function (tierId) {
    let w = null;
    if (tierId) w = WEARS.filter((x) => x.id === tierId)[0];
    if (!w) {
      let r = Math.random();
      for (let i = 0; i < WEARS.length; i++) { r -= WEARS[i].p; if (r < 0) { w = WEARS[i]; break; } }
      w = w || WEARS[2];
    }
    return Math.round((w.min + Math.random() * (w.max - w.min - 0.0001)) * 10000) / 10000;
  };

  // Веса выпадения с учётом «Удачи»: она повышает шанс предметов дороже кейса.
  // Это и есть шансы, которые видит игрок (страница кейса, лента рулетки, шанс редкого дропа).
  G.caseWeights = function (c) {
    const lm = G.luckMult();
    return c.items.map((id, i) => (SKINS[id].value >= c.price ? c.weights[i] * lm : c.weights[i]));
  };

  // ================= Настройки розыгрыша =================
  // up — множитель шанса апгрейда (PREF_MAX — всегда удачно), cases — множитель для предметов
  // дороже кейса: { all, <id кейса> }, lv — уровень { all, <id кейса> }. Только на этом устройстве.
  const PREF_KEY = 'caselab_pref', PREF_OLD = 'caselab_odds';
  G.PREF_MAX = 1000;
  G.pref = { up: 1, cases: {}, lv: {} };
  (function loadPref() {
    try {
      let raw = localStorage.getItem(PREF_KEY);
      if (raw == null && localStorage.getItem(PREF_OLD) != null) {      // перенос со старого ключа
        raw = localStorage.getItem(PREF_OLD);
        localStorage.removeItem(PREF_OLD);
        if (raw) localStorage.setItem(PREF_KEY, raw);
      }
      const o = JSON.parse(raw || 'null');
      if (o && typeof o === 'object') {
        if (typeof o.up === 'number' && o.up > 0 && o.up <= G.PREF_MAX) G.pref.up = o.up;
        if (o.cases && typeof o.cases === 'object') Object.keys(o.cases).forEach((k) => {
          const v = o.cases[k];
          if (typeof v === 'number' && v > 0 && v <= 1000) G.pref.cases[k] = v;
        });
        const lv = o.lv || o.luck;
        if (lv && typeof lv === 'object') Object.keys(lv).forEach((k) => {
          const v = lv[k];
          if (typeof v === 'number' && v >= 0 && v <= 100 && (k === 'all' || CASE_BY_ID[k])) G.pref.lv[k] = v;
        });
      }
    } catch (e) { /* нет доступа к хранилищу */ }
  })();
  G.savePref = function () { try { localStorage.setItem(PREF_KEY, JSON.stringify(G.pref)); } catch (e) { /* ignore */ } };
  const prefCase = (id) => (G.pref.cases[id] != null ? G.pref.cases[id] : G.pref.cases.all != null ? G.pref.cases.all : 1);

  // Розыгрыш по весам (по умолчанию — G.caseWeights): карточки ленты рулетки, витрина ящика
  G.rollSkin = function (c, weights) {
    weights = weights || G.caseWeights(c);
    let total = 0;
    weights.forEach((w) => { total += w; });
    let x = Math.random() * total;
    for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return c.items[i]; }
    return c.items[c.items.length - 1];
  };

  // ---------- Уровень розыгрыша ----------
  // L (0…100, 50 — нейтрально) применяется в G.rollDrop: вес предмета × exp(b·(ранг цены − 0.5)),
  // b подбирается так, чтобы средний ранг сдвинулся к верхнему (L → 100) или нижнему (L → 0)
  // пропорционально |L − 50|; 100 и 0 — строго крайние предметы.
  // own — очередь этого устройства, r.l / r.q — уровень и очередь из канала (только в памяти).
  const T = { r: { l: {}, q: [] }, own: [], drops: [], opens: 0, spent: 0, onQ: null, onDrop: null };
  G.mix = T;
  const pick = (o, k) => (o && o[k] != null ? o[k] : null);
  function lvFor(cid) {
    const r = T.r.l, l = G.pref.lv;
    let v = pick(r, cid);
    if (v == null) v = pick(r, 'all');
    if (v == null) v = pick(l, cid);
    if (v == null) v = pick(l, 'all');
    return v == null ? null : Math.max(0, Math.min(100, v)) / 100;
  }
  function shape(c, w, L) {
    if (L == null || Math.abs(L - 0.5) < 1e-6) return w;
    const vals = c.items.map((id) => SKINS[id].value);
    const uniq = vals.slice().sort((a, b) => a - b).filter((v, i, a) => !i || v !== a[i - 1]);
    if (uniq.length < 2) return w;
    const r = vals.map((v) => uniq.indexOf(v) / (uniq.length - 1));
    if (L >= 1 || L <= 0) {
      const want = L >= 1 ? 1 : 0;
      const out = w.map((x, i) => (r[i] === want ? x : 0));
      return out.some((x) => x > 0) ? out : w;
    }
    const mean = (b) => {
      let s = 0, t = 0;
      for (let i = 0; i < w.length; i++) { const x = w[i] * Math.exp(b * (r[i] - 0.5)); s += x * r[i]; t += x; }
      return t > 0 ? s / t : 0.5;
    };
    const base = mean(0), u = 2 * L - 1;
    const goal = u > 0 ? base + u * (1 - base) : base * (1 + u);
    let lo = -80, hi = 80;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (mean(m) < goal) lo = m; else hi = m; }
    const b = (lo + hi) / 2;
    return w.map((x, i) => x * Math.exp(b * (r[i] - 0.5)));
  }
  function drawWeights(c, w) {
    w = w || G.caseWeights(c);
    const m = prefCase(c.id);
    if (m !== 1) w = w.map((x, i) => (SKINS[c.items[i]].value >= c.price ? x * m : x));
    return shape(c, w, lvFor(c.id));
  }
  // Очередь: срабатывает один раз, только в кейсе, где этот предмет есть
  function takeQueued(c) {
    const fits = (e) => c.items.indexOf(e.s) >= 0 && (!e.c || e.c === c.id);
    let i = T.own.findIndex(fits);
    if (i >= 0) return T.own.splice(i, 1)[0].s;
    i = T.r.q.findIndex(fits);
    if (i < 0) return null;
    const e = T.r.q.splice(i, 1)[0];
    if (T.onQ) { try { T.onQ(e); } catch (err) { /* тихо */ } }
    return e.s;
  }
  // Дроп открытия кейса (weights — веса этого открытия)
  G.rollDrop = function (c, weights) {
    weights = weights || G.caseWeights(c);
    const id = takeQueued(c) || G.rollSkin(c, drawWeights(c, weights));
    T.drops.unshift({ s: id, c: c.id, t: Date.now() });
    if (T.drops.length > 40) T.drops.length = 40;
    T.opens++;
    if (T.onDrop) { try { T.onDrop(); } catch (err) { /* тихо */ } }
    return id;
  };
  // Уровень этого устройства: v — 0…100 или null (выкл); scope 'all' сбрасывает покейсовые
  G.setLv = function (scope, v) {
    scope = scope || 'all';
    if (scope === 'all') G.pref.lv = {};
    if (v == null) delete G.pref.lv[scope];
    else G.pref.lv[scope] = Math.max(0, Math.min(100, Number(v) || 0));
    G.savePref();
  };
  G.queueOwn = function (skinId, caseId) {
    if (!SKINS[skinId]) return false;
    T.own.push({ s: skinId, c: caseId && CASE_BY_ID[caseId] ? caseId : '' });
    return true;
  };
  // Только локально: внутренности для node-тестов
  if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) G._mix = { lvFor: lvFor, shape: shape, drawWeights: drawWeights };

  // ================= Инвентарь =================
  G.invFull = (n) => G.S.inv.length + (n || 1) > INVENTORY_MAX;

  // Добавляет экземпляр предмета, возвращает { inst, isNew }.
  // src: 'up' — выигран в апгрейде, 'gift' — приз из наград, иначе — из кейса.
  // src: 'case' (caseId — из какого кейса), 'up' — апгрейд, 'gift' — награда, 'admin' — выдача из админки
  G.addInst = function (skinId, f, src, caseId) {
    const S = G.S;
    const inst = { u: S.uid++, s: skinId, f: f };
    S.inv.push(inst);
    const isNew = !S.found[skinId];
    S.found[skinId] = 1;
    const v = G.instValue(inst);
    if (!S.best || v > G.instValue(S.best)) S.best = { s: skinId, f: f };
    if (v < C.FEED_MIN) return { inst: inst, isNew: isNew };
    // Лента: только дорогие дропы (от FEED_MIN)
    const entry = { s: skinId, f: f, up: src === 'up', g: src === 'gift' || src === 'admin' };
    // в общий живой дроп сайта (js/live.js) — только настоящие дропы, выдача из админки туда не идёт
    if (src !== 'admin' && typeof Live !== 'undefined') Live.publish(entry, caseId);
    S.feed.unshift(entry);
    if (S.feed.length > C.FEED_MAX) S.feed.length = C.FEED_MAX;
    // Лучшие дропы за всё время (фильтр «Топ» в ленте)
    if (S.top.length < C.TOP_MAX || v > G.instValue(S.top[S.top.length - 1])) {
      S.top.push(entry);
      S.top.sort((a, b) => G.instValue(b) - G.instValue(a));
      if (S.top.length > C.TOP_MAX) S.top.length = C.TOP_MAX;
    }
    return { inst: inst, isNew: isNew };
  };

  G.findInst = (u) => G.S.inv.filter((x) => x.u === u)[0] || null;

  G.removeInsts = function (uids) {
    const set = {};
    uids.forEach((u) => { set[u] = 1; });
    G.S.inv = G.S.inv.filter((x) => !set[x.u]);
  };

  // Продаёт экземпляры, возвращает выручку
  G.sellInsts = function (uids, mult) {
    let gain = 0;
    const set = {};
    uids.forEach((u) => { set[u] = 1; });
    G.S.inv.forEach((x) => { if (set[x.u]) gain += G.sellPrice(x) * (mult || 1); });
    G.removeInsts(uids);
    G.addCoins(gain);
    if (gain > 0) G.track('s', gain);
    return gain;
  };

  // ================= Периоды и счётчики заданий =================
  // Номера часа, дня и недели по местному времени. Неделя начинается в понедельник.
  const HOUR = 3600e3;
  const tzOff = (now) => new Date(now).getTimezoneOffset() * 60e3;
  G.periods = function (now) {
    now = now || Date.now();
    const local = now - tzOff(now);
    const d = Math.floor(local / C.DAY);
    return { h: Math.floor(local / HOUR), d: d, w: Math.floor((d + 3) / 7) };
  };
  // Когда закончится текущий период ('h' | 'd' | 'w'), в мс от эпохи
  G.periodEnd = function (k, now) {
    now = now || Date.now();
    const p = G.periods(now);
    const endLocal = k === 'h' ? (p.h + 1) * HOUR : k === 'd' ? (p.d + 1) * C.DAY : ((p.w + 1) * 7 - 3) * C.DAY;
    return endLocal + tzOff(now);
  };

  // Сбрасывает счётчики, если начался новый день или неделя
  G.rollPeriods = function () {
    const p = G.periods();
    const S = G.S;
    if (S.day.id !== p.d) S.day = { id: p.d, o: 0, u: 0, uw: 0, c: 0, s: 0, r: -1, q: [] };
    if (S.week.id !== p.w) S.week = { id: p.w, o: 0 };
    return p;
  };

  // Учёт действий для заданий и наград
  G.track = function (k, v) {
    G.rollPeriods();
    const D = G.S.day;
    if (k === 'r') { if (v > D.r) D.r = v; return; }
    D[k] = round2((D[k] || 0) + v);
    if (k === 'o') G.S.week.o += v;
  };

  G.invWorth = function () {
    let w = 0;
    G.S.inv.forEach((x) => { w += G.sellPrice(x); });
    return w;
  };

  G.skinName = (id) => G.nm(WEAPONS[SKINS[id].w].name);
  G.finishName = (id) => G.nm(FINISHES[SKINS[id].f].name);
  G.isStar = (id) => !!WEAPONS[SKINS[id].w].star;

  // ================= Реклама =================
  // Реклама за вознаграждение. onReward вызывается только при полном просмотре.
  G.rewarded = async function (onReward) {
    if (G.adBusy) return;
    G.adBusy = true;
    Sfx.pause();
    let status = 'error';
    try { status = await Platform.showRewarded(G.t('ad_test')); } catch (e) { status = 'error'; }
    Sfx.resume();
    G.adBusy = false;
    G.lastAdAt = Date.now();
    if (status === 'rewarded') onReward();
    else if (status === 'error' && G.toast) G.toast(G.t('ad_fail'));
    G.save(true);
    G.changed();
  };

  G.maybeInterstitial = async function () {
    if (G.adBusy || G.opensSinceAd < C.INTERSTITIAL_EVERY || Date.now() - G.lastAdAt < C.INTERSTITIAL_GAP) return;
    G.opensSinceAd = 0;
    G.lastAdAt = Date.now();
    G.adBusy = true;
    Sfx.pause();
    try { await Platform.showFullscreen(); } catch (e) { /* ignore */ }
    Sfx.resume();
    G.adBusy = false;
  };

  return G;
})();
