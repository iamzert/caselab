'use strict';

// Общий «живой дроп»: дропы всех игроков сайта видны всем.
// Канал — ntfy.sh (бесплатный сервис уведомлений, без регистрации и ключей). Дропы от G.C.FEED_MIN
// уходят туда POST-запросом (все дропы одного открытия — одним сообщением), открытые вкладки
// получают их через SSE сразу, а при входе подтягиваются
// дропы за последние 12 часов — столько ntfy.sh хранит сообщения. Лучшие дропы («Топ») ещё и
// запоминаются в этом браузере, чтобы не пропадали через 12 часов.
// Входящее — чужие данные, поэтому всё проверяется: существующий предмет и кейс, износ 0…1,
// цена от FEED_MIN (считается заново по каталогу), ник через G.cleanName, аватар только из G.AVATARS.
// В сборке для Яндекс Игр канал выключен — там остаётся личная лента из сохранения.
// Раунд 7: сообщения несут и открытые данные игрока (для открытого профиля и лидербордов). Формат дропа:
//   { v: 1, k: ключ дропа, s, f, n, a, c, up, g, pk: открытый id игрока }; у первого дропа сообщения ещё
//   l — уровень, w — стоимость инвентаря, b: [скин, износ] — лучший дроп, sc: [[скин, износ], …] — витрина (до 5),
//   wx — опыт за неделю, fr — рамка. «Статистика без дропа»: { v: 1, st: 1, pk, n, a, l, w, b, sc, wx, fr } —
//   не чаще раза в 30 минут при активности; в ленту не попадает (старые клиенты отбрасывают её: нет скина).
// Ключ k остаётся ключом дропа (по нему старые клиенты отсеивают повторы), id игрока — отдельное поле pk.
// строки ленты (раунд 7): подсказки ника и счётчика повторов в «Топ»
Object.assign(I18N.ru, { feed_prof: 'Профиль игрока', feed_myprof: 'Мой профиль', feed_rep: 'Таких дропов: {n}' });
Object.assign(I18N.en, { feed_prof: 'Player profile', feed_myprof: 'My profile', feed_rep: 'Same drops: {n}' });

const Live = (function () {
  const DEV = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  // ?nolive (только локально) — без общей ленты: безголовые скриншоты ждут конца всех запросов,
  // а SSE-соединение не заканчивается никогда, и снимок зависает
  const enabled = (!!window.CASELAB_NO_SDK || DEV) && !(DEV && new URLSearchParams(location.search).has('nolive'));
  // Локально — отдельный тестовый канал (?livetopic=имя), чтобы проверки не попадали к друзьям
  const devTopic = DEV ? (new URLSearchParams(location.search).get('livetopic') || '').replace(/[^\w-]/g, '').slice(0, 60) : '';
  const TOPIC = DEV ? (devTopic || 'caselab-dev-k7f3q9x2vd') : 'caselab-live-k7f3q9x2vd';
  const BASE = 'https://ntfy.sh/' + TOPIC;
  const KEEP = 300;            // сколько последних дропов держим в памяти
  const SHOW = 40;             // строк во вкладке «Все»
  const TOP = 20;              // строк во вкладке «Топ»
  const BURST = 40;            // больше дропов за 10 с с одного ника — считаем спамом
  const CHUNK = 20;            // дропов в одном сообщении (сообщение ntfy.sh — до 4 КБ)
  const TOP_KEEP = 60;         // лучших дропов в памяти: повторы в «Топ» схлопываются в одну строку, строк — до TOP
  const STAT_GAP = 30 * 60000; // «статистика без дропа» — не чаще раза в 30 минут (и только если игрок что-то делал)
  const MAX_BYTES = 3800;      // сообщение ntfy.sh — до 4 КБ, больше уходит вложением
  const TOP_KEY = 'caselab_live_top';
  const has = Object.prototype.hasOwnProperty;

  // Открытые данные игрока (раунд 7). Свой открытый id — случайный, отдельный от pid (pid нигде не светится).
  // Раздел сохранения G.S.ext.pub: { id — открытый id, st — когда последний раз уходили свои данные (мс) }.
  const okPk = (p) => typeof p === 'string' && /^[a-z0-9]{8,16}$/.test(p);
  function newPk() {
    const a = new Uint8Array(10);
    try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
    return Array.from(a, (b) => (b % 36).toString(36)).join('');
  }
  G.ext('pub', {
    def: () => ({ id: newPk(), st: 0 }),
    clean: (r) => ({ id: r && okPk(r.id) ? r.id : newPk(), st: r && Number(r.st) > 0 ? Number(r.st) : 0 }),
  });

  let all = [];                // проверенные дропы, новые первыми: { k, s, f, n, a, c, up, g, t, me }
  let best = [];               // лучшие дропы, что видел этот браузер (сохраняются)
  let bestDirty = false;
  const seen = new Set();      // ключи дропов из «Все» (история при переподключении приходит повторно)
  const recent = new Map();    // ник → время его последних дропов
  let es = null, state = enabled ? 'conn' : 'off', started = false;
  let lastTime = 0;            // время (с) последнего сообщения: после обрыва берём только новое
  let skew = 0;                // поправка часов браузера по времени сервера, мс
  let retry = 0, retryTimer = 0, drawTimer = 0, hideTimer = 0;
  let batch = [], batchTimer = 0;   // дропы одного открытия (×10) уходят одним сообщением
  const cards = new Map();     // открытый id игрока → его последние открытые данные (для профиля и лидербордов)
  let lastAct = 0, statTimer = 0;

  const val = (x) => G.instValue(x);
  const keyOf = (x) => x.k || (x.n + '|' + x.s + '|' + x.f + '|' + x.t);
  const now = () => Date.now() + skew;

  // Сообщение канала → дроп или null
  function clean(m, time) {
    if (!m || typeof m !== 'object' || m.v !== 1) return null;
    if (typeof m.s !== 'string' || !has.call(SKINS, m.s)) return null;
    const f = Number(m.f);
    if (!(f >= 0 && f <= 1)) return null;
    const x = {
      k: typeof m.k === 'string' ? m.k.replace(/[^\w-]/g, '').slice(0, 32) : '',
      s: m.s, f: f,
      n: G.cleanName(m.n) || G.t('guest'),
      a: G.AVATARS.indexOf(m.a) >= 0 ? m.a : '',
      c: typeof m.c === 'string' && has.call(CASE_BY_ID, m.c) ? m.c : '',
      up: !!m.up, g: !!m.g,
      t: time > 0 ? time : 0,
      pk: okPk(m.pk) ? m.pk : '',   // открытый id игрока (у старых клиентов его нет)
    };
    if (!(val(x) >= G.C.FEED_MIN)) return null;
    return x;
  }

  // Открытые данные игрока из сообщения (дроп с полями игрока или «статистика без дропа») → карточка или null.
  // Пара предмета [скин, износ] — только существующий скин и износ 0…1.
  function pair(p) {
    if (!Array.isArray(p) || typeof p[0] !== 'string' || !has.call(SKINS, p[0])) return null;
    const f = Number(p[1]);
    return f >= 0 && f <= 1 ? [p[0], f] : null;
  }
  const num = (v, max) => { const x = Number(v); return x >= 0 && isFinite(x) ? Math.min(x, max) : 0; };
  function cleanCard(m, time) {
    if (!m || typeof m !== 'object' || !okPk(m.pk)) return null;
    const card = {
      k: m.pk,
      n: G.cleanName(m.n) || G.t('guest'),
      a: G.AVATARS.indexOf(m.a) >= 0 ? m.a : '',
      l: Math.round(num(m.l, 100)),
      w: Math.round(num(m.w, 1e13) * 100) / 100,
      b: pair(m.b),
      sc: Array.isArray(m.sc) ? m.sc.slice(0, 5).map(pair).filter(Boolean) : [],
      wx: Math.round(num(m.wx, 1e9)),
      fr: typeof m.fr === 'string' ? m.fr.replace(/[^\w-]/g, '').slice(0, 24) : '',
      t: time > 0 ? time : 0,
    };
    return card;
  }
  // Новее — заменяет (история приходит по порядку, но после переподключения возможны повторы)
  function noteCard(card) {
    const old = cards.get(card.k);
    if (old && old.t > card.t) return;
    cards.set(card.k, card);
  }

  function spam(x) {
    const t = x.t || now();
    const list = (recent.get(x.n) || []).filter((v) => Math.abs(t - v) < 10000);
    list.push(t);
    recent.set(x.n, list);
    return list.length > BURST;
  }

  function addBest(x) {
    const v = val(x);
    if (best.length >= TOP_KEEP && v <= val(best[best.length - 1])) return;
    const key = keyOf(x);
    if (best.some((b) => keyOf(b) === key)) return;
    best.push(x);
    best.sort((a, b) => val(b) - val(a));
    if (best.length > TOP_KEEP) best.length = TOP_KEEP;
    bestDirty = true;
  }

  function add(x) {
    const key = keyOf(x);
    if (seen.has(key)) return false;
    seen.add(key);
    if (spam(x)) return false;
    // новые сверху; история приходит по порядку, так что обычно это вставка в начало
    let i = 0;
    while (i < all.length && all[i].t > x.t) i++;
    all.splice(i, 0, x);
    if (all.length > KEEP) all.length = KEEP;
    addBest(x);
    return true;
  }

  const pack = (x) => ({ v: 1, k: x.k, s: x.s, f: x.f, n: x.n, a: x.a, c: x.c, up: x.up ? 1 : 0, g: x.g ? 1 : 0, t: x.t, pk: x.pk || undefined, me: x.me ? 1 : undefined });
  function saveBest() {
    bestDirty = false;
    try { localStorage.setItem(TOP_KEY, JSON.stringify(best.map(pack))); } catch (e) { /* приватный режим — «Топ» живёт до перезагрузки */ }
  }
  function loadBest() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(TOP_KEY) || 'null'); } catch (e) { raw = null; }
    if (Array.isArray(raw)) {
      raw.slice(0, TOP_KEEP).forEach((m) => { const x = clean(m, m ? Number(m.t) : 0); if (x) { x.me = !!m.me; addBest(x); } });
      bestDirty = false;
      return true;
    }
    return false;
  }
  // Первый запуск после обновления: в «Топ» — свои лучшие дропы из сохранения (видны только себе)
  function seedFromSave() {
    const S = G.S;
    if (!S || !Array.isArray(S.top)) return;
    S.top.forEach((e) => {
      const x = clean({ v: 1, s: e.s, f: e.f, n: G.playerName(), a: S.profile.ava, up: e.up ? 1 : 0, g: e.g ? 1 : 0 }, 0);
      if (x) { x.k = 'own-' + String(e.s).replace(/[^\w-]/g, '') + '-' + Math.round(x.f * 1e6); x.me = true; x.pk = myPk(); addBest(x); }
    });
    saveBest();
  }

  // Перерисовка не чаще раза в 250 мс (история приходит пачкой). Пока крутится рулетка, ленту не
  // трогаем — свой дроп не должен «спойлерить» результат; в конце прокрутки экран сам зовёт UI.renderFeed().
  function changed() {
    if (!drawTimer) drawTimer = setTimeout(draw, 250);
  }
  function draw() {
    drawTimer = 0;
    if (bestDirty) saveBest();
    if (typeof UI === 'undefined' || !G.S) return;
    if (UI.isSpinning()) { drawTimer = setTimeout(draw, 700); return; }
    UI.renderFeed();
  }
  function setState(s) {
    if (state === s) return;
    state = s;
    changed();
  }

  // Сообщение канала: один дроп или пачка (массив) дропов одного открытия
  function onData(raw) {
    let d, m;
    try { d = JSON.parse(raw); } catch (e) { return; }
    if (!d || d.event !== 'message' || typeof d.message !== 'string' || d.message.length > 4096) return;
    const time = Number(d.time) || 0;
    if (time > lastTime) lastTime = time;
    try { m = JSON.parse(d.message); } catch (e) { return; }
    let any = false, card = false;
    (Array.isArray(m) ? m.slice(0, CHUNK) : [m]).forEach((one) => {
      // открытые данные игрока: у первого дропа пачки или в «статистике без дропа» (st: 1).
      // Статистика — не дроп: clean() её отбрасывает (в ней нет скина), в ленту она не попадает.
      if (one && typeof one === 'object' && (one.st || 'l' in one || 'w' in one)) {
        const c = cleanCard(one, time * 1000);
        if (c) { noteCard(c); card = true; }
      }
      const x = clean(one, time * 1000);
      if (x && add(x)) any = true;
    });
    if (any) changed();
    if (card) G.emit('pubcard', {});   // лидерборды и открытые профили (агент social) перерисовываются сами
  }

  // ---------- Свои открытые данные ----------
  function myPk() { return G.S ? G.extOf('pub').id : ''; }
  const rf = (f) => Math.round(Number(f) * 1e6) / 1e6;
  // элемент витрины: uid экземпляра, экземпляр { s, f } или пара [скин, износ]
  function asPair(x) {
    if (typeof x === 'number') x = G.findInst(x);
    if (Array.isArray(x)) return pair([x[0], rf(x[1])]);
    return x && typeof x === 'object' ? pair([x.s, rf(x.f)]) : null;
  }
  // { pk, n, a, l, w, b, sc, wx, fr } — только то, что и так видно в игре: ник, аватар, уровень, стоимость инвентаря,
  // лучший предмет, витрина, опыт за неделю, рамка. Трофей «Секретный» (подарок админа, не дроп) не входит ни в стоимость,
  // ни в лучший предмет — иначе доски показали бы, кому дарили трофей.
  function myCard() {
    const S = G.S;
    const xp = typeof XP !== 'undefined';
    let w = 0;
    S.inv.forEach((x) => { if (!G.isSecret(x.s)) w += G.instValue(x); });
    // лучший предмет — самый дорогой за всё время (G.S.best), а не только из «Топа» (там дропы от 25 000):
    // у нового игрока «Топ» пуст, а лучший предмет есть. Если в G.S.best записан трофей — берём самый дорогой
    // не секретный предмет из «Топа» и инвентаря (то же правило, что у запасного me() в leaders.js).
    const real = (x) => x && SKINS[x.s] && !G.isSecret(x.s);
    let top = real(S.best) ? S.best : null;
    if (!top) {
      let bv = 0;
      [].concat(Array.isArray(S.top) ? S.top : [], S.inv).forEach((x) => {
        if (!real(x)) return;
        const v = G.instValue(x);
        if (v > bv) { bv = v; top = x; }
      });
    }
    let sc = [];
    if (typeof Showcase !== 'undefined' && typeof Showcase.list === 'function') {
      try { sc = (Showcase.list() || []).map(asPair).filter(Boolean).slice(0, 5); } catch (e) { sc = []; }
    }
    let fr = '';
    try { fr = xp && typeof XP.frame === 'function' ? String(XP.frame() || '') : ''; } catch (e) { fr = ''; }
    const card = {
      pk: myPk(), n: G.playerName(), a: S.profile.ava || '',
      l: xp ? XP.level() : 0, w: Math.round(w * 100) / 100,
      b: top ? [top.s, rf(top.f)] : null, sc: sc, wx: xp && typeof XP.week === 'function' ? XP.week() : 0,
    };
    if (fr) card.fr = fr;
    return card;
  }

  function connect() {
    retryTimer = 0;
    if (es || !enabled) return;
    try {
      es = new EventSource(BASE + '/sse?since=' + (lastTime ? String(lastTime) : '12h'));
    } catch (e) { es = null; fail(); return; }
    // ntfy присылает своё событие «open» с временем сервера — по нему выравниваем часы
    es.onopen = (e) => {
      retry = 0;
      if (e && typeof e.data === 'string') {
        try { const d = JSON.parse(e.data); if (d && d.time > 0) skew = d.time * 1000 - Date.now(); } catch (err) { /* не JSON */ }
      }
      setState('on');
    };
    es.onmessage = (e) => onData(e.data);
    es.onerror = () => fail();
  }
  // Переподключаемся сами (2, 4, 8 … 64 с): так можно попросить только пропущенное (since=время)
  function fail() {
    if (es) { es.close(); es = null; }
    setState('err');
    if (retryTimer || document.hidden) return;
    retry = Math.min(retry + 1, 6);
    retryTimer = setTimeout(connect, 1000 * Math.pow(2, retry));
  }
  function pause() {
    if (es) { es.close(); es = null; }
    clearTimeout(retryTimer);
    retryTimer = 0;
  }
  // Фоновая вкладка через минуту отключается (не держим соединение зря), при возврате — догружает пропущенное
  function onVisibility() {
    clearTimeout(hideTimer);
    if (document.hidden) hideTimer = setTimeout(pause, 60000);
    else if (!es && !retryTimer) { retry = 0; connect(); }
  }

  // Нет сети или сбой сервера — ещё 3 попытки (через 5, 15 и 45 с). Лимит ntfy.sh (429) не повторяем:
  // он сбрасывается только на следующий день, а свой дроп и так виден у себя.
  function send(list, tries) {
    let p;
    try {
      p = fetch(BASE, { method: 'POST', body: JSON.stringify(list), keepalive: true, credentials: 'omit' });
    } catch (e) { p = Promise.reject(e); }
    p.then((r) => { if (r.status >= 500) throw new Error('retry'); })
      .catch(() => { if (tries < 3) setTimeout(() => send(list, tries + 1), 5000 * Math.pow(3, tries)); });
  }
  // Пачка дропов: открытые данные игрока — один раз, в первом дропе каждого сообщения (старые клиенты лишние
  // поля не читают). Не влезает в 4 КБ — сначала без витрины, потом без данных вовсе (дроп важнее).
  function sendBatch() {
    batchTimer = 0;
    const out = batch;
    batch = [];
    let card = null;
    try { card = myCard(); } catch (e) { card = null; }
    for (let i = 0; i < out.length; i += CHUNK) {
      const part = out.slice(i, i + CHUNK);
      if (card) {
        const head = part[0];
        part[0] = Object.assign({}, head, card);
        if (JSON.stringify(part).length > MAX_BYTES) part[0] = Object.assign({}, head, card, { sc: [] });
        if (JSON.stringify(part).length > MAX_BYTES) part[0] = head;
      }
      send(part, 0);
    }
    if (card) markSent();
  }

  // «Статистика без дропа» — для лидербордов: свои данные уходят, даже если дорогих дропов давно не было.
  // Не чаще раза в STAT_GAP и только если с прошлой отправки игрок что-то делал. Лента её не показывает.
  function markSent() {
    if (!G.S) return;
    G.extOf('pub').st = Date.now();
    G.save(false);
  }
  function statTick() {
    if (!enabled || !G.S || document.hidden) return;
    const pub = G.extOf('pub');
    if (!(lastAct > pub.st) || Date.now() - pub.st < STAT_GAP) return;
    let card;
    try { card = myCard(); } catch (e) { return; }
    card.v = 1;
    card.st = 1;
    send(card, 0);
    markSent();
  }
  const act = () => { lastAct = Date.now(); };

  // Свой дроп: сразу в ленту (видно мгновенно) и в общий канал; эхо из канала отбросится по ключу k
  function publish(entry, caseId) {
    if (!enabled) return;
    const m = {
      v: 1, k: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
      s: entry.s, f: Math.round(entry.f * 1e6) / 1e6, n: G.playerName(), a: (G.S && G.S.profile.ava) || '',
      c: caseId || '', up: entry.up ? 1 : 0, g: entry.g ? 1 : 0, pk: myPk(),
    };
    const x = clean(m, now());
    if (!x) return;
    x.me = true;
    if (add(x)) changed();
    batch.push(m);
    if (!batchTimer) batchTimer = setTimeout(sendBatch, 0);
  }

  function start() {
    if (!enabled || started) return;
    started = true;
    if (!loadBest()) seedFromSave();
    if (typeof EventSource === 'undefined') { setState('err'); return; }
    connect();
    document.addEventListener('visibilitychange', onVisibility);
    // давность («5 мин назад») в подсказках строк ленты
    setInterval(() => { if (!document.hidden) changed(); }, 60000);
    // активность игрока — повод раз в 30 минут отправить свою статистику
    ['open', 'sell', 'upgrade', 'click', 'quest', 'daily', 'inst', 'contract', 'wheel'].forEach((ev) => G.on(ev, act));
    statTimer = setInterval(statTick, 60000);
  }

  // Открытый профиль игрока по строке ленты: последние известные данные по его открытому id;
  // старый клиент (без id) — только ник, аватар и этот дроп. Свой — всегда свежие данные из сохранения.
  function profileOf(x) {
    if (!x) return null;
    if (x.me || (x.pk && x.pk === myPk())) return me();
    const c = x.pk ? cards.get(x.pk) : null;
    if (c) return Object.assign({}, c);
    return { k: x.pk || '', n: x.n, a: x.a, l: 0, w: 0, b: [x.s, x.f], sc: [], wx: 0, fr: '', t: x.t || 0 };
  }
  function me() {
    const c = myCard();
    return { k: c.pk, n: c.n, a: c.a, l: c.l, w: c.w, b: c.b, sc: c.sc, wx: c.wx, fr: c.fr || '', t: now(), me: true };
  }

  return {
    enabled: enabled,
    start: start,
    publish: publish,
    state: () => state,
    now: now,
    items: () => all.slice(0, SHOW),
    top: () => best.slice(),          // до TOP_KEEP лучших; повторы схлопывает лента (UI.renderFeed)
    // Открытые данные игроков (раунд 7) — { k, n, a, l, w, b: [скин, износ] | null, sc: [[скин, износ], …], wx, fr, t, me? }
    pubId: myPk,                      // свой открытый id (не pid)
    me: () => (G.S ? me() : null),
    profileOf: profileOf,             // строка ленты → открытый профиль (для PubProfile.open)
    player: (k) => (k === myPk() ? me() : cards.has(k) ? Object.assign({}, cards.get(k)) : null),
    players: () => {                  // все известные игроки за 12 часов канала + свои свежие данные
      const mk = myPk();
      const list = Array.from(cards.values()).filter((c) => c.k !== mk).map((c) => Object.assign({}, c));
      if (G.S) list.push(me());
      return list;
    },
  };
})();
