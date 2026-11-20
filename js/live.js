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
  const TOP_KEY = 'caselab_live_top';
  const has = Object.prototype.hasOwnProperty;

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
    };
    if (!(val(x) >= G.C.FEED_MIN)) return null;
    return x;
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
    if (best.length >= TOP && v <= val(best[best.length - 1])) return;
    const key = keyOf(x);
    if (best.some((b) => keyOf(b) === key)) return;
    best.push(x);
    best.sort((a, b) => val(b) - val(a));
    if (best.length > TOP) best.length = TOP;
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

  const pack = (x) => ({ v: 1, k: x.k, s: x.s, f: x.f, n: x.n, a: x.a, c: x.c, up: x.up ? 1 : 0, g: x.g ? 1 : 0, t: x.t });
  function saveBest() {
    bestDirty = false;
    try { localStorage.setItem(TOP_KEY, JSON.stringify(best.map(pack))); } catch (e) { /* приватный режим — «Топ» живёт до перезагрузки */ }
  }
  function loadBest() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(TOP_KEY) || 'null'); } catch (e) { raw = null; }
    if (Array.isArray(raw)) {
      raw.slice(0, TOP).forEach((m) => { const x = clean(m, m ? Number(m.t) : 0); if (x) addBest(x); });
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
      if (x) { x.k = 'own-' + String(e.s).replace(/[^\w-]/g, '') + '-' + Math.round(x.f * 1e6); x.me = true; addBest(x); }
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
    let any = false;
    (Array.isArray(m) ? m.slice(0, CHUNK) : [m]).forEach((one) => {
      const x = clean(one, time * 1000);
      if (x && add(x)) any = true;
    });
    if (any) changed();
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
  function sendBatch() {
    batchTimer = 0;
    const out = batch;
    batch = [];
    for (let i = 0; i < out.length; i += CHUNK) send(out.slice(i, i + CHUNK), 0);
  }

  // Свой дроп: сразу в ленту (видно мгновенно) и в общий канал; эхо из канала отбросится по ключу k
  function publish(entry, caseId) {
    if (!enabled) return;
    const m = {
      v: 1, k: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
      s: entry.s, f: Math.round(entry.f * 1e6) / 1e6, n: G.playerName(), a: (G.S && G.S.profile.ava) || '',
      c: caseId || '', up: entry.up ? 1 : 0, g: entry.g ? 1 : 0,
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
  }

  return {
    enabled: enabled,
    start: start,
    publish: publish,
    state: () => state,
    now: now,
    items: () => all.slice(0, SHOW),
    top: () => best.slice(),
  };
})();
