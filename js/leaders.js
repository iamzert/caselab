'use strict';

// Лидерборды: инвентарь, лучший дроп, уровень, неделя. Раунд 7 — агент social (tools/plans/R7_SPEC.md).
// Сайт: по открытым данным игроков из сообщений живой ленты (js/live.js). Канал хранит только 12 часов,
// поэтому последнее состояние каждого игрока (по открытому id k) запоминается в этом браузере на 7 дней.
// Сборка для Яндекс Игр: таблицы SDK (js/platform.js: caselab_worth, caselab_best, caselab_level, caselab_week);
// нет SDK или ошибка — только своя строка и короткая подсказка. Только настоящие данные: выдуманных игроков нет.
Object.assign(I18N.ru, {
  lb_title: 'Лидеры', lb_t_worth: 'Инвентарь', lb_t_best: 'Лучший дроп', lb_t_level: 'Уровень', lb_t_week: 'Неделя', lb_t_best_s: 'Дроп',
  lb_src_site: 'По открытым данным игроков за 7 дней', lb_src_ya: 'Таблицы Яндекс Игр',
  lb_empty: 'Пока никого — таблица заполнится, когда игроки начнут открывать кейсы',
  lb_err: 'Таблица сейчас недоступна — показана только ваша строка', lb_auth: 'Войдите в аккаунт Яндекса, чтобы попасть в таблицу',
  lb_week_none: 'На этой неделе в таблице пока никого — вы можете стать первым', lb_load: 'Загрузка…', lb_you: 'вы', lb_lv: 'Ур. {n}', lb_week_xp: '{v} XP',
});
Object.assign(I18N.en, {
  lb_title: 'Leaders', lb_t_worth: 'Inventory', lb_t_best: 'Best drop', lb_t_level: 'Level', lb_t_week: 'Week', lb_t_best_s: 'Drop',
  lb_src_site: 'Public player data for the last 7 days', lb_src_ya: 'Yandex Games leaderboards',
  lb_empty: 'No one yet — the board fills up as players open cases',
  lb_err: 'Leaderboard unavailable right now — showing your row only', lb_auth: 'Sign in to Yandex to join the leaderboard',
  lb_week_none: 'No one on the board this week yet — you can be the first', lb_load: 'Loading…', lb_you: 'you', lb_lv: 'Lv. {n}', lb_week_xp: '{v} XP',
});

const Leaders = (function () {
  const t = G.t;
  const has = Object.prototype.hasOwnProperty;
  const KEY = 'caselab_lb_cards';
  const KEEP_MS = 7 * 24 * 3600e3;   // сколько помним игрока без новых сообщений
  const STORE_MAX = 600;             // не больше стольких игроков в хранилище (самые свежие)
  const TOP = 50;                    // сайт: столько строк сверху
  const YA_TOP = 20, YA_AROUND = 3;  // Яндекс: лимиты SDK — сверху 1–20, вокруг игрока 1–10
  // Неделя в Яндексе: таблица SDK сама не сбрасывается, поэтому номер недели входит в счёт:
  // счёт = неделя × 10 000 000 + опыт недели (потолок 9 999 999). Записи этой недели всегда выше прошлых,
  // ранги SDK 1..m — ровно порядок этой недели. Неделя 1 — с понедельника 5.01.2026 (G.periods().w = 2923),
  // счёт остаётся меньше 2^31 до 2030 года.
  const WK0 = 2922, WK_MUL = 1e7, WX_CAP = WK_MUL - 1;
  const weekNo = () => Math.max(1, G.periods().w - WK0);
  const weekScore = (wx) => weekNo() * WK_MUL + Math.min(WX_CAP, Math.max(0, Math.floor(wx || 0)));
  const TABS = ['worth', 'best', 'level', 'week'];
  const BOARD = { worth: 'caselab_worth', best: 'caselab_best', level: 'caselab_level', week: 'caselab_week' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => '&#' + m.charCodeAt(0) + ';');

  let tab = 'worth';
  let host = null;
  let rows = [];        // строки последней отрисовки (для клика)
  let store = null;     // открытый id → последняя карточка игрока

  // ---------- Проверка карточки (из канала её уже проверил js/live.js, но localStorage тоже чужие данные) ----------
  const okK = (k) => typeof k === 'string' && /^[a-z0-9]{8,16}$/.test(k);
  function pair(p) {
    if (!Array.isArray(p) || typeof p[0] !== 'string' || !has.call(SKINS, p[0])) return null;
    const f = Number(p[1]);
    return f >= 0 && f <= 1 ? [p[0], f] : null;
  }
  const num = (v, max) => { const x = Number(v); return x >= 0 && isFinite(x) ? Math.min(x, max) : 0; };
  function clean(c) {
    if (!c || typeof c !== 'object' || !okK(c.k)) return null;
    const time = num(c.t, 1e15);
    if (!time) return null;
    return {
      k: c.k, n: G.cleanName(c.n) || G.t('guest'), a: G.AVATARS.indexOf(c.a) >= 0 ? c.a : '',
      l: Math.round(num(c.l, 100)), w: Math.round(num(c.w, 1e13) * 100) / 100, b: pair(c.b),
      sc: Array.isArray(c.sc) ? c.sc.slice(0, 5).map(pair).filter(Boolean) : [],
      wx: Math.round(num(c.wx, 1e9)), fr: typeof c.fr === 'string' ? c.fr.replace(/[^a-z]/g, '').slice(0, 12) : '', t: time,
    };
  }

  // ---------- Хранилище: последнее состояние каждого игрока за 7 дней ----------
  function load() {
    if (store) return store;
    store = new Map();
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    const old = Date.now() - KEEP_MS;
    if (Array.isArray(raw)) raw.forEach((m) => { const c = clean(m); if (c && c.t > old) store.set(c.k, c); });
    return store;
  }
  function persist() {
    const list = Array.from(store.values()).sort((a, b) => b.t - a.t).slice(0, STORE_MAX);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* приватный режим — помним до перезагрузки */ }
  }
  const myId = () => { try { return typeof Live !== 'undefined' && Live.pubId ? Live.pubId() : ''; } catch (e) { return ''; } };
  // Забрать свежие карточки из канала (Live.players) и выбросить старше 7 дней
  function sync() {
    load();
    let dirty = false;
    const mine = myId();
    let list = [];
    try { list = typeof Live !== 'undefined' && Live.players ? Live.players() : []; } catch (e) { list = []; }
    list.forEach((raw) => {
      if (!raw || raw.me || raw.k === mine) return;
      const c = clean(raw);
      if (!c) return;
      const o = store.get(c.k);
      if (!o || o.t < c.t) { store.set(c.k, c); dirty = true; }
    });
    const old = Date.now() - KEEP_MS;
    store.forEach((c, k) => { if (c.t <= old || k === mine) { store.delete(k); dirty = true; } });
    if (dirty) persist();
  }

  // Свои данные: из js/live.js (то же, что видят другие), иначе — из сохранения
  function me() {
    let c = null;
    try { c = typeof Live !== 'undefined' && Live.me ? Live.me() : null; } catch (e) { c = null; }
    if (c) return Object.assign({}, c, { me: true });
    const S = G.S, xp = typeof XP !== 'undefined';
    let w = 0;
    S.inv.forEach((x) => { if (!G.isSecret(x.s)) w += G.instValue(x); });
    return {
      k: '', n: G.playerName(), a: S.profile.ava || '', l: xp ? XP.level() : 0, w: Math.round(w * 100) / 100,
      b: S.best && !G.isSecret(S.best.s) ? [S.best.s, S.best.f] : null,
      sc: typeof Showcase !== 'undefined' ? Showcase.list() : [], wx: xp && XP.week ? XP.week() : 0,
      fr: xp && XP.frame ? XP.frame() : '', t: Date.now(), me: true,
    };
  }

  // Показатель для вкладки (0 — игрока во вкладке нет)
  const val = (p) => (p ? G.instValue({ s: p[0], f: p[1] }) : 0);
  function score(c, k) {
    if (k === 'worth') return c.w || 0;
    if (k === 'best') return val(c.b);
    if (k === 'level') return c.l || 0;
    // неделя: опыт только из данных этой недели (неделя — с понедельника, G.periods)
    if (c.me || c.ya) return c.wx || 0;   // своя / из таблицы Яндекса — уже опыт этой недели
    return G.periods(c.t).w === G.periods().w ? c.wx || 0 : 0;
  }
  // Таблица сайта: { list: топ-50, mine: { place, c } | null }
  function siteTable(k) {
    sync();
    const my = me();
    const all = Array.from(store.values()).concat([my]).filter((c) => score(c, k) > 0);
    all.sort((a, b) => score(b, k) - score(a, k) || (k === 'level' ? (b.w || 0) - (a.w || 0) : 0) || b.t - a.t);
    const i = all.indexOf(my);
    return { list: all.slice(0, TOP), mine: i >= 0 ? { place: i + 1, c: my } : null };
  }

  // ---------- Яндекс Игры: таблицы SDK ----------
  // сайт (живая лента) — тестовый сайт и локальный запуск; иначе это сборка для Яндекс Игр
  const SITE = !!window.CASELAB_NO_SDK || /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const sdk = () => typeof Platform !== 'undefined' && !!Platform.hasLeaders && Platform.hasLeaders();
  const ya = {};        // вкладка → { at, r: { entries, user } | null }
  const busy = {};
  const YA_TTL = 60e3;  // таблицу перечитываем не чаще раза в минуту
  function yaLoad(k) {
    if (busy[k] || (ya[k] && Date.now() - ya[k].at < YA_TTL)) return;
    busy[k] = true;
    push();   // свои счета уходят параллельно; записанное — помечает таблицу устаревшей, и она перечитается
    Platform.lbEntries(BOARD[k], { top: YA_TOP, around: YA_AROUND }).catch(() => null).then((r) => {
      busy[k] = false;
      ya[k] = { at: Date.now(), r: r || null };
      redraw();
    });
  }
  // Строка SDK → открытые данные (что есть в этой таблице); неделя — только записи этой недели (номер недели в счёте),
  // прошлые недели и записи старого вида (счёт без номера недели) помечаются old
  function fromYa(e, k, myRank) {
    // имя с Яндекса может быть длиннее ника игры: только обрезаем (при выводе всё экранируется)
    const c = { k: '', n: String(e.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24) || t('guest'), a: '', photo: e.photo, l: 0, w: null, b: null, sc: [], wx: 0, t: 0, ya: 1, ys: e.score, place: e.rank > 0 ? e.rank : 0, me: !!myRank && e.rank === myRank };
    if (k === 'worth') c.w = e.score;
    else if (k === 'level') c.l = Math.min(100, Math.round(e.score));
    else if (k === 'week') {
      const cur = Math.floor(e.score / WK_MUL) === weekNo();
      c.wx = cur ? e.score % WK_MUL : 0;
      c.old = !c.wx;
    }
    else if (k === 'best') { const p = String(e.extra || '').split('|'); c.b = pair([p[0], p[1]]); }
    return c;
  }
  function yaTable(k) {
    const st = ya[k];
    if (!st) return { load: true };
    const r = st.r;
    if (!r) return { list: [], mine: null, err: true };
    const myRank = r.user ? r.user.rank : 0;
    const all = r.entries.slice().sort((a, b) => a.rank - b.rank).map((e) => fromYa(e, k, myRank));
    const own = all.filter((c) => c.me)[0];
    const my = Object.assign(me(), { photo: own ? own.photo : '', place: own ? own.place : 0 });
    const list = k === 'week' ? yaWeek(all, my, r) : yaRanked(all, my, k, r.user);
    const i = list.indexOf(my);
    return { list: list, mine: i >= 0 ? { place: my.place, c: my } : null };
  }
  // Место — ранг SDK (топ + соседи игрока: 1,2,3 … 7). Своя строка — на своё место по рангу, а не в конец.
  // Разделитель — только там, где строк между соседними местами действительно нет.
  function yaRanked(all, my, k, user) {
    const list = all.filter((c) => !c.me && score(c, k) > 0);
    if (user && user.rank > 0 && score(my, k) > 0) {
      my.place = user.rank;
      const j = list.findIndex((c) => c.place > my.place);
      list.splice(j < 0 ? list.length : j, 0, my);
    }
    list.forEach((c, j) => { c.gap = j > 0 && c.place > list[j - 1].place + 1; });
    return list;
  }
  // Неделя: номер недели в счёте ставит записи этой недели выше всех прошлых, поэтому место — ранг SDK, как на
  // других вкладках; записи прошлых недель (old) выбрасываем. Своей записи этой недели в таблице ещё нет (опыт не
  // записан) — место считаем сами, если в выдаче вся неделя (в верхнем блоке есть прошлая неделя или таблица
  // короче запроса); иначе своя строка — после разделителя, без номера.
  function yaWeek(all, my, r) {
    const own = all.filter((c) => c.me)[0];
    const list = all.filter((c) => !c.me && !c.old && c.wx > 0);
    if (own && !own.old && Platform.authorized()) {
      my.wx = Math.max(my.wx || 0, own.wx);
      return yaRanked(list.concat([own]), my, 'week', r.user);
    }
    const gaps = () => list.forEach((c, j) => { c.gap = j > 0 && c.place > list[j - 1].place + 1; });
    const mw = my.wx || 0;
    if (!(mw > 0) || !Platform.authorized()) { gaps(); return list; }
    let n = 0;
    while (n < all.length && all[n].place === n + 1) n++;
    const whole = all.slice(0, n).some((c) => c.old) || n < (r.top || YA_TOP);
    if (whole) {
      // вся неделя — ранги 1..m подряд: встаём по своему опыту, ниже стоящие сдвигаются на одно место
      list.splice(list.filter((c) => c.wx >= mw).length, 0, my);
      list.forEach((c, j) => { c.place = j + 1; c.gap = false; });
      return list;
    }
    gaps();
    my.place = 0;
    my.gap = list.length > 0;
    return list.concat([my]);
  }
  // Свои счета в таблицы SDK: только изменившиеся, не чаще раза в минуту, с паузой между записями (лимит SDK)
  const pushed = {};
  let pushAt = 0, pushing = null;
  function push() {
    if (pushing) return pushing;
    if (!sdk() || !G.S || !Platform.authorized() || Date.now() - pushAt < 60e3) return Promise.resolve();
    pushAt = Date.now();
    const c = me();
    const s = {
      worth: [Math.floor(c.w || 0), ''], best: [Math.floor(val(c.b)), c.b ? c.b[0] + '|' + c.b[1] : ''],
      level: [c.l || 0, ''], week: [c.wx > 0 ? weekScore(c.wx) : 0, 'w' + G.periods().w],
    };
    pushing = TABS.reduce((p, k) => p.then(() => {
      const key = s[k].join('#');
      if (pushed[k] === key || !(s[k][0] > 0)) return null;
      return Platform.lbSetScore(BOARD[k], s[k][0], s[k][1]).then((ok) => {
        if (ok) { pushed[k] = key; if (ya[k]) { ya[k].at = 0; if (k === tab) redraw(); } }
        return G.wait(1100);
      });
    }), Promise.resolve()).catch(() => null).then(() => { pushing = null; });
    return pushing;
  }
  setInterval(() => { if (sdk()) push(); }, 65e3);

  // ---------- Отрисовка ----------
  function avaHTML(c) {
    if (c.a) return '<span class="lb-ava ico">' + UI.avaIcon(c.a) + '</span>';
    if (typeof c.photo === 'string' && /^https:\/\//.test(c.photo)) return '<span class="lb-ava"><img src="' + esc(c.photo) + '" alt=""></span>';
    return '<span class="lb-ava">' + esc(String(c.n || '?').charAt(0).toUpperCase()) + '</span>';
  }
  // Стоимость в колонке — одним видом: есть сумма от 1 000 — вся колонка без копеек (83 200 рядом со 129 000,
  // а не 83 200.00); от миллиона — короткий вид G.fmt (1.23M). Режим колонки считает render (whole).
  let whole = false;
  const money = (v) => (whole && v < 1e6 ? G.fmtInt(v) : G.fmt(v));
  function valueHTML(c, k) {
    if (k === 'worth') return '<span class="lb-v">' + UI.COIN + money(c.w || 0) + '</span>';
    if (k === 'level') return '<span class="lb-v">' + t('lb_lv', { n: c.l }) + '</span>';
    if (k === 'week') return '<span class="lb-v">' + t('lb_week_xp', { v: G.fmtInt(score(c, k)) }) + '</span>';
    const b = c.b, sk = b && SKINS[b[0]];
    if (!sk) return '<span class="lb-v">—</span>';
    const nm = (G.isStar(b[0]) ? '★ ' : '') + G.skinName(b[0]) + ' | ' + G.finishName(b[0]);
    return '<span class="lb-v lb-bv r' + sk.r + '" title="' + esc(nm) + '"><span class="lb-art">' + Art.item(b[0], b[1]) + '</span>' +
      '<span>' + UI.COIN + money(val(b)) + '</span></span>';
  }
  // Место — всегда точное, с разделителями разрядов (12 345): соседи вокруг своей строки должны различаться
  const placeTxt = (p) => G.fmtInt(p);
  let plc = 1;          // самое длинное место в отрисовке (символов) → ширина первой колонки (--plc в CSS)
  function rowHTML(c, place, k) {
    rows.push(c);
    const pt = place > 0 ? placeTxt(place) : '—';
    plc = Math.max(plc, pt.length);
    const rk = c.l > 0 && typeof XP !== 'undefined' && XP.rankOf ? XP.rankOf(c.l).name : '';
    const sub = k === 'level' ? rk : c.l > 0 ? t('lb_lv', { n: c.l }) + (rk ? ' · ' + rk : '') : '';
    return '<button class="lb-row' + (c.me ? ' me' : '') + (place > 0 && place <= 3 ? ' p' + place : '') + '" data-act="lb-open" data-id="' + (rows.length - 1) + '">' +
      '<span class="lb-pl">' + pt + '</span>' + avaHTML(c) +
      '<span class="lb-nm"><b>' + esc(c.n) + '</b>' + (c.me ? '<i>' + t('lb_you') + '</i>' : '') + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
      valueHTML(c, k) + '</button>';
  }

  function render(el) {
    if (!el || !G.S) return;
    host = el;
    rows = [];
    plc = 1;
    // Яндекс: таблицы SDK; сборка для Яндекса без SDK/лидербордов — только своя строка без места и подсказка
    const off = !sdk() && !SITE;
    const useYa = sdk() || off;
    const k = tab;
    let tb, hint = '';
    if (off) { tb = { list: [], mine: null, err: true }; hint = t('lb_err'); } else if (useYa) {
      tb = yaTable(k);
      yaLoad(k);
      if (tb.err || (!tb.load && !Platform.authorized())) hint = Platform.authorized() ? t('lb_err') : t('lb_auth');
    } else tb = siteTable(k);
    const build = () => {
      rows = [];
      plc = 1;
      let body;
      if (tb.load) body = '<div class="lb-empty">' + t('lb_load') + '</div>';
      else {
        if (useYa) {
          // Яндекс: места и разделители уже расставлены (yaRanked / yaWeek), своя строка — на своём месте
          body = tb.list.map((c) => (c.gap ? '<div class="lb-gap"></div>' : '') + rowHTML(c, c.place, k)).join('');
        } else {
          body = tb.list.map((c, i) => rowHTML(c, i + 1, k)).join('');
          if (tb.mine && tb.mine.place > tb.list.length) body += '<div class="lb-gap"></div>' + rowHTML(tb.mine.c, tb.mine.place, k);
        }
        // ошибка SDK / не авторизован — только своя строка (без места)
        if (useYa && !tb.mine && (tb.err || !Platform.authorized())) { const c = me(); if (score(c, k) > 0) body += rowHTML(c, 0, k); }
        // при недоступной таблице хватит подсказки: «пока никого» ей противоречило бы
        if (!body && !(useYa && tb.err)) body = '<div class="lb-empty">' + t(k === 'week' ? 'lb_week_none' : 'lb_empty') + '</div>';
      }
      return body;
    };
    // вид чисел колонки — по строкам, которые на самом деле попали в таблицу: есть сумма от 1 000 — рисуем заново без копеек
    whole = false;
    let body = build();
    if ((k === 'worth' || k === 'best') && rows.some((c) => score(c, k) >= 1000)) { whole = true; body = build(); }
    el.innerHTML = '<div class="lb glass">' +
      '<div class="lb-h"><b>' + t('lb_title') + '</b><small>' + t(useYa ? 'lb_src_ya' : 'lb_src_site') + '</small></div>' +
      '<div class="tabs lb-tabs" role="tablist">' + TABS.map((id) =>
        '<button class="' + (id === k ? 'on' : '') + '" data-act="lb-tab" data-id="' + id + '" role="tab" aria-selected="' + (id === k) + '"><span class="lb-tl">' + t('lb_t_' + id) + '</span><span class="lb-ts">' + t(id === 'best' ? 'lb_t_best_s' : 'lb_t_' + id) + '</span></button>').join('') + '</div>' +
      (hint ? '<p class="lb-hint">' + hint + '</p>' : '') +
      '<div class="lb-list' + (plc >= 6 ? ' wide' : '') + '" style="--plc:' + plc + '">' + body + '</div></div>';
  }
  function redraw() { if (host && host.isConnected && G.S) render(host); }

  UI.actions['lb-tab'] = function (id) { if (TABS.indexOf(id) >= 0) { tab = id; redraw(); } };
  UI.actions['lb-open'] = function (id) {
    const c = rows[Number(id)];
    if (c && typeof PubProfile !== 'undefined') PubProfile.open(c);
  };

  // Новые открытые данные из канала: запомнить сразу (переживут 12 часов канала), таблицу на экране — перерисовать
  let drawT = 0;
  G.on('pubcard', () => {
    sync();
    if (!drawT && host && host.isConnected && host.offsetParent) drawT = setTimeout(() => { drawT = 0; if (host.offsetParent) redraw(); }, 800);
  });

  // Опыт и новый уровень: своя строка (уровень, ранг, опыт недели) — сразу, а не до следующего захода на вкладку.
  // Перерисовка — только открытой вкладки и не чаще раза в 2 с (опыт за клики на Фарме идёт каждую секунду).
  const XP_GAP = 2000;
  let xpAt = 0, xpT = 0;
  function onXp() {
    if (xpT || !host || !host.isConnected) return;
    xpT = setTimeout(() => {
      xpT = 0;
      if (!host || !host.isConnected || !host.offsetParent) return;   // вкладка закрыта — нарисуется при открытии
      xpAt = Date.now();
      redraw();
    }, Math.max(0, xpAt + XP_GAP - Date.now()));
  }
  G.on('xp', onXp);
  G.on('levelup', onXp);

  return {
    render: render,
    card: (k) => { load(); const c = store.get(k); return c ? Object.assign({}, c) : null; },   // для PubProfile
    push: push,
  };
})();
