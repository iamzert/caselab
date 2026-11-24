'use strict';

// Панель владельца игры: отдельный экран с меню разделов
// (Онлайн, Игроки, Шансы, Выдача, Журнал, Экономика, Сохранение, Ключ канала).
// Открыть: 5 быстрых нажатий на логотип или адрес страницы с #admin в конце. Нужны логин и пароль.
// Пароль проверяется только так: из него выводится ключ (PBKDF2, js/sync.js) и сравнивается
// с открытым ключом CHAN_PUB в коде. Пароль на устройстве не хранится. После входа устройство запоминается:
// флаг caselab_ui и неизвлекаемые ключи канала в IndexedDB (js/sync.js) — при следующем запуске канал
// подключается сам. «Выйти на этом устройстве» забывает и флаг, и ключи.
// Пока CHAN_PUB пуст, вход не открывает панель, а показывает строку для CHAN_PUB (см. README).
// Онлайн, Игроки и шансы других игроков — только сборка для сайта (служебный канал js/sync.js).
const Desk = (function () {
  const LOGIN = 'mana';
  const KEY = 'caselab_ui';                     // флаг «устройство запомнено»: случайная строка
  const OLD_KEY = 'caselab_admin';
  const A = UI.actions, COIN = UI.COIN;

  // ---------- Вход ----------
  const store = {
    get: () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set: (v) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
  };
  try { localStorage.removeItem(OLD_KEY); } catch (e) { /* старый флаг (хеш пароля) больше не используется */ }
  let session = false;          // вход в этой вкладке
  let fails = 0, lockUntil = 0, checking = false;
  const unlocked = () => session || /^[0-9a-z]{20}$/.test(store.get() || '');
  const Net = typeof Sync !== 'undefined' ? Sync : null;
  // DEV-вход тестовым ключом: только localhost + ?admintest (на сайте невозможен)
  const DEVTEST = !!(Net && Net.test) && /^(127\.0\.0\.1|localhost)$/.test(location.hostname);

  function open() {
    if (UI.isSpinning()) return;
    if (unlocked()) UI.showScreen('admin'); else login();
  }

  // Состояние канала в этой вкладке
  const net = { busy: false, match: false, err: '', rest: false };   // rest — подключаю сохранённые ключи
  // Проверка логина и пароля (окно входа, «Подключить канал», регистрация под ником админа).
  // → Promise<'ok' | 'bad' | 'wait' | 'empty' | 'crypto'>. После неверной попытки — пауза 1.5 с, после пяти — минута.
  function check(loginName, pass) {
    const t = Date.now();
    if (t < lockUntil) return Promise.resolve('wait');
    if (checking) return Promise.resolve('wait');
    if (String(loginName || '').trim().toLowerCase() !== LOGIN || !pass) { fail(); return Promise.resolve('bad'); }
    if (!Net) return Promise.resolve('crypto');
    checking = true; net.busy = true; net.err = '';
    const p = Net.login(String(pass));
    pass = null;
    return p.then((r) => {
      if (r.match) { fails = 0; net.match = true; Net.remember(); return 'ok'; }
      if (r.empty) return 'empty';
      fail();
      return 'bad';
    }, () => 'crypto').then((res) => { checking = false; net.busy = false; if (res !== 'ok') net.err = res; redraw(); return res; });
  }
  function fail() { fails++; lockUntil = Date.now() + (fails >= 5 ? 60e3 : 1500); }
  function unlock() {
    session = true;
    const a = new Uint8Array(20);
    try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
    store.set(Array.prototype.map.call(a, (b) => '0123456789abcdefghijklmnopqrstuvwxyz'[b % 36]).join(''));
  }
  const waitLeft = () => Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));

  function login(msg, keys) {
    UI.modal('<h3 class="m-title">' + UI.ic('lock') + ' Вход</h3>' +
      '<input id="adm-login" class="adm-pass" type="text" autocomplete="username" placeholder="Логин">' +
      '<input id="adm-pass" class="adm-pass" type="password" autocomplete="current-password" placeholder="Пароль">' +
      (msg ? '<p class="hint adm-err">' + msg + '</p>' : '') +
      (keys ? '<textarea class="ap-ta" rows="3" readonly id="adm-keyline">' + esc(pubLine(keys)) + '</textarea>' : '') +
      '<div class="m-btns row"><button class="btn" data-act="close">Отмена</button>' +
      '<button class="btn primary" data-act="adm-login">Войти</button></div>' +
      (DEVTEST ? '<div class="m-btns row"><button class="btn mini" data-act="adm-devlogin">Тестовый вход (DEV)</button></div>' : ''));
    const lg = document.getElementById('adm-login');
    lg.focus();
    document.getElementById('adm-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') A['adm-login'](); });
  }
  function entered() {
    // админ без профиля сразу получает свой ник
    if (!G.S.profile.name) { G.S.profile = { name: LOGIN, ava: '👑' }; G.save(true); UI.setProfileBadge(); }
    UI.closeModal(true);
    UI.showScreen('admin');
  }
  const pubLine = (k) => "const CHAN_PUB = { sig: '" + k.sig + "', enc: '" + k.enc + "' };";

  A['adm-login'] = function () {
    const inp = document.getElementById('adm-pass'), lg = document.getElementById('adm-login');
    if (!inp || !lg || checking) return;
    if (waitLeft()) { login('Слишком много попыток. Подождите ' + waitLeft() + ' с.'); return; }
    const name = lg.value, pass = inp.value;
    inp.value = '';
    const btn = document.querySelector('[data-act="adm-login"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Проверка…'; }
    check(name, pass).then((res) => {
      if (!document.getElementById('adm-pass')) return;          // окно закрыли
      if (res === 'ok') { unlock(); entered(); return; }
      if (res === 'empty') { login('В коде нет ключа канала. Вставьте эту строку вместо CHAN_PUB в js/sync.js и выложите сайт заново (см. README):', Net.publicKeys()); return; }
      if (res === 'crypto') { login('Браузер не дал WebCrypto (нужен https или localhost).'); return; }
      login(res === 'wait' ? 'Слишком много попыток. Подождите ' + waitLeft() + ' с.' : 'Неверный логин или пароль');
    });
  };
  A['adm-devlogin'] = function () {
    if (!DEVTEST) return;
    unlock();
    netLogin();
    entered();
  };
  // DEV: канал тестовым ключом
  function netLogin() {
    if (!Net || net.busy) return;
    net.busy = true; net.err = '';
    redraw();
    Net.loginTest().then((r) => { net.match = !!r.match; if (r.match) Net.remember(); else net.err = 'bad'; })
      .catch(() => { net.match = false; net.err = 'crypto'; })
      .then(() => { net.busy = false; redraw(); });
  }

  // ---------- Мелочи ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const p2 = (n) => (n < 10 ? '0' : '') + n;
  function hm(t) {
    if (!t) return '—';
    const d = new Date(t), now = new Date();
    const s = p2(d.getHours()) + ':' + p2(d.getMinutes());
    return d.toDateString() === now.toDateString() ? s : p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + ' ' + s;
  }
  const hms = (t) => (t ? hm(t) + ':' + p2(new Date(t).getSeconds()) : '—');
  function dur(ms) {
    if (!(ms > 0)) return '—';
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    if (h) return h + ' ч ' + p2(m % 60) + ' мин';
    if (m) return m + ' мин';
    return s + ' с';
  }
  const ago = (t) => (!t ? '—' : Date.now() - t < 45e3 ? 'сейчас' : dur(Date.now() - t) + ' назад');
  const rarColor = (id) => (SKINS[id] && RARITIES[SKINS[id].r] ? RARITIES[SKINS[id].r].color : '#5b6374');
  const skinTxt = (id) => (SKINS[id] ? (G.isStar(id) ? '★ ' : '') + G.skinName(id) + ' | ' + G.finishName(id) : '—');
  const skinCell = (id) => '<span class="ap-sk" style="--rc:' + rarColor(id) + '">' + esc(skinTxt(id)) + '</span>';
  const caseName = (id) => (id && CASE_BY_ID[id] ? G.nm(CASE_BY_ID[id].name) : '');
  const scopeTxt = (s) => (!s || s === 'all' ? 'Все кейсы' : caseName(s) || s);
  const money = (v) => (v == null || !isFinite(v) ? '—' : G.fmt(v));
  // Сайт (живой канал возможен) или сборка для Яндекс Игр (только локально)
  const site = () => !!(Net && typeof Live !== 'undefined' && Live.enabled);
  const remoteOn = () => !!(site() && Net.ready() && net.match);

  // ---------- Таблицы: сортировка и поиск ----------
  const sortSt = {}, query = {};
  // cols: [{ k, h, num, v(r) — значение для сортировки, f(r) — html ячейки }]
  function table(id, cols, rows, opt) {
    opt = opt || {};
    const st = sortSt[id] || opt.sort || { k: cols[0].k, d: 1 };
    const q = (query[id] || '').trim().toLowerCase();
    if (q && opt.find) rows = rows.filter((r) => opt.find(r).toLowerCase().indexOf(q) >= 0);
    const col = cols.find((c) => c.k === st.k) || cols[0];
    const val = col.v || ((r) => r[col.k]);
    rows = rows.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y, 'ru') : x - y) * st.d;
    });
    const th = cols.map((c) => '<th class="' + (c.num ? 'n' : '') + (c.k === st.k ? (st.d > 0 ? ' up' : ' dn') : '') +
      '" data-act="adm-sort" data-id="' + id + '|' + c.k + '">' + c.h + '</th>').join('');
    const body = rows.length ? rows.map((r) => {
      const act = opt.act ? ' data-act="' + opt.act + '" data-id="' + esc(opt.rid(r)) + '"' : '';
      const sel = opt.sel && opt.sel(r) ? ' class="sel"' : '';
      return '<tr' + act + sel + '>' + cols.map((c) => '<td' + (c.num ? ' class="n"' : '') + '>' + (c.f ? c.f(r) : esc(r[c.k])) + '</td>').join('') + '</tr>';
    }).join('') : '<tr class="empty"><td colspan="' + cols.length + '">' + (q ? 'Ничего не найдено' : opt.empty || 'Пусто') + '</td></tr>';
    return '<div class="ap-tw' + (opt.tall ? ' tall' : '') + '"><table class="ap-t"><thead><tr>' + th + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  A['adm-sort'] = function (v) {
    const i = String(v).indexOf('|'), id = v.slice(0, i), k = v.slice(i + 1);
    const st = sortSt[id];
    sortSt[id] = { k: k, d: st && st.k === k ? -st.d : (DESC[k] ? -1 : 1) };
    dyn();
  };
  // Числа и время по умолчанию сортируются по убыванию
  const DESC = { b: 1, o: 1, so: 1, sp: 1, ni: 1, t: 1, st: 1, ld: 1, price: 1, ev: 1, ret: 1, f: 1, v: 1, val: 1, n_: 1 };
  const search = (id, ph) => '<label class="ap-q">' + UI.ic('search') + '<input type="search" data-q="' + id + '" value="' + esc(query[id] || '') + '" placeholder="' + ph + '" autocomplete="off" spellcheck="false"></label>';
  document.addEventListener('input', (e) => {
    const id = e.target && e.target.getAttribute && e.target.getAttribute('data-q');
    if (!id) return;
    query[id] = e.target.value;
    dyn();
  });

  // ---------- Каркас панели ----------
  const SECS = [
    { id: 'online', t: 'Онлайн', ic: 'user', net: true },
    { id: 'players', t: 'Игроки', ic: 'search', net: true },
    { id: 'luck', t: 'Шансы', ic: 'dice' },
    { id: 'give', t: 'Выдача', ic: 'box' },
    { id: 'log', t: 'Журнал', ic: 'layers' },
    { id: 'eco', t: 'Экономика', ic: 'trend', gap: true },
    { id: 'save', t: 'Сохранение', ic: 'swap' },
    { id: 'key', t: 'Ключ канала', ic: 'lock', net: true },
  ];
  const ui = { sec: '', pid: '', target: 'self', scope: 'all', luck: 50, fcase: '', fskin: '' };
  const secs = () => SECS.filter((s) => !s.net || site());
  const SEC = {};          // id → { head(), body() }

  function panel() {
    setTimeout(watchSync, 0);
    const root = document.getElementById('adm-root');
    if (!root) return;
    if (!unlocked()) { root.innerHTML = ''; return; }
    const list = secs();
    if (!list.some((s) => s.id === ui.sec)) ui.sec = list[0].id;
    const cur = list.find((s) => s.id === ui.sec);
    const nav = list.map((s) => '<button class="ap-ni' + (s.id === ui.sec ? ' on' : '') + (s.gap ? ' gap' : '') + '" data-act="adm-sec" data-id="' + s.id + '">' +
      UI.ic(s.ic) + '<span>' + s.t + '</span>' + (s.id === 'online' ? '<b class="ap-cnt" id="ap-cnt">' + onlineCount() + '</b>' : '') + '</button>').join('');
    root.innerHTML = '<div class="ap">' +
      '<aside class="ap-side"><div class="ap-brand">' + UI.ic('gear') + '<span>Админ</span></div>' +
      '<nav class="ap-nav">' + nav + '</nav>' +
      '<div class="ap-st" id="ap-st">' + statusLine() + '</div>' +
      '<button class="ap-ni ap-out" data-act="adm-logout" title="Забыть вход и ключи канала на этом устройстве">' + UI.ic('logout') + '<span>Выйти на этом устройстве</span></button></aside>' +
      '<div class="ap-main"><div class="ap-h"><h3>' + cur.t + '</h3>' + (SEC[ui.sec].tools ? SEC[ui.sec].tools() : '') + '</div>' +
      (SEC[ui.sec].head ? SEC[ui.sec].head() : '') +
      '<div id="ap-dyn">' + SEC[ui.sec].body() + '</div></div></div>';
    // телефон: активный раздел в полосе меню — в зоне видимости
    const nv = root.querySelector('.ap-nav'), on = root.querySelector('.ap-ni.on');
    if (nv && on && nv.scrollWidth > nv.clientWidth) nv.scrollLeft = Math.max(0, on.offsetLeft - 40);
  }
  // Перерисовка только данных (поля ввода и ползунок не трогаем)
  function dyn() {
    const el = document.getElementById('ap-dyn');
    if (!el || !unlocked()) return;
    el.innerHTML = SEC[ui.sec].body();
    const c = document.getElementById('ap-cnt'), s = document.getElementById('ap-st');
    if (c) c.textContent = onlineCount();
    if (s) s.innerHTML = statusLine();
  }
  const visible = () => UI.screen() === 'admin' && unlocked();
  function redraw() { if (visible()) panel(); }
  let dynT = 0;
  function soon() {
    if (!visible() || dynT) return;
    dynT = setTimeout(() => { dynT = 0; if (visible()) dyn(); }, 400);
  }
  if (Net) Net.on(soon);
  // Время в сессиях и «назад» тикают раз в 5 с, пока открыт живой раздел
  setInterval(() => { watchSync(); if (visible() && (ui.sec === 'online' || ui.sec === 'players' || ui.sec === 'log')) dyn(); }, 5000);
  function watchSync() { if (Net) Net.watch(visible() && remoteOn() && (ui.sec === 'online' || ui.sec === 'players')); }

  function onlineCount() { return remoteOn() ? Net.online().length : ''; }
  function statusLine() {
    if (!site()) return '<i class="ap-dot off"></i>Локально (без канала)';
    if (net.busy) return '<i class="ap-dot wait"></i>Канал: вычисляю ключ…';
    if (net.rest && !net.match) return '<i class="ap-dot wait"></i>Канал: подключение…';
    if (!Net.ready()) return '<i class="ap-dot off"></i>Канал: ключ не встроен';
    if (!net.match) return '<i class="ap-dot off"></i>Канал: нужен пароль';
    const s = Net.state(), er = Net.lastError();
    if (er === 'quota') return '<i class="ap-dot bad"></i>Канал: лимит ntfy.sh (429)';
    return s === 'on' ? '<i class="ap-dot on"></i>Канал: на связи' + (Net.test ? ' · DEV' : '')
      : s === 'err' ? '<i class="ap-dot bad"></i>Канал: нет связи' : '<i class="ap-dot wait"></i>Канал: подключение…';
  }

  A['adm-sec'] = function (id) { if (!unlocked()) return; ui.sec = id; panel(); const m = document.getElementById('main'); if (m) m.scrollTop = 0; };
  Screens.reg('admin', { render: panel });

  // ---------- Канал: вход паролем ----------
  const note = (html, cls) => '<p class="ap-note' + (cls ? ' ' + cls : '') + '">' + html + '</p>';
  function chanForm() {
    if (net.busy) return '<div class="ap-box">' + note('Вычисляю ключ канала из пароля…') + '</div>';
    if (net.rest) return '<div class="ap-box">' + note('Подключаю канал этого устройства…') + '</div>';
    return '<div class="ap-box"><div class="ap-bt">Подключить канал</div>' +
      note('Онлайн, Игроки и шансы других игроков работают по подписанному каналу. Введите пароль ещё раз: из него выводится ключ. Пароль не сохраняется и никуда не отправляется.') +
      '<div class="ap-row"><input id="ap-np" class="ap-in w" type="password" autocomplete="current-password" placeholder="Пароль">' +
      '<button class="btn mini primary" data-act="adm-net">Подключить</button>' +
      (DEVTEST ? '<button class="btn mini" data-act="adm-net-dev">Тестовый ключ (DEV)</button>' : '') + '</div>' +
      (net.err === 'crypto' ? note('Браузер не дал WebCrypto (нужен https).', 'bad') : '') +
      (net.err === 'bad' || net.err === 'wait' ? note(waitLeft() ? 'Слишком много попыток. Подождите ' + waitLeft() + ' с.' : 'Неверный пароль', 'bad') : '') + '</div>';
  }
  // Онлайн/Игроки без канала: объясняем, что нужно
  function gate() {
    if (!site()) return note('В этой сборке нет внешних сервисов: доступны только настройки своего устройства.');
    if (!Net.ready()) return '<div class="ap-box">' + note('Ключ канала не встроен в код. Откройте «Ключ канала», скопируйте оба значения в CHAN_PUB (js/sync.js) и выложите сайт заново.') + '</div>';
    return chanForm();
  }
  A['adm-net'] = function () {
    const inp = document.getElementById('ap-np');
    if (!inp || !unlocked()) return;
    const pass = inp.value;
    inp.value = '';
    if (waitLeft()) { net.err = 'wait'; panel(); return; }
    check(LOGIN, pass);
  };
  A['adm-net-dev'] = function () { if (DEVTEST && unlocked()) netLogin(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.id === 'ap-np') A['adm-net'](); });

  // ---------- Удача: подписи ----------
  const PRESETS = [
    { v: null, t: 'Выкл' }, { v: 20, t: 'Невезение' }, { v: 50, t: 'Обычный' }, { v: 80, t: 'Везучий' }, { v: 100, t: 'Всегда топ' },
  ];
  function luckLabel(v) {
    if (v == null) return 'Выкл';
    const p = PRESETS.find((x) => x.v === v);
    return p ? p.t + ' · ' + v : String(v);
  }
  function luckTxt(m) {
    const k = m ? Object.keys(m) : [];
    if (!k.length) return '<span class="ap-mut">Выкл</span>';
    k.sort((a, b) => (a === 'all' ? -1 : b === 'all' ? 1 : 0));
    return k.map((s) => '<span class="ap-lk' + (m[s] > 50 ? ' hi' : m[s] < 50 ? ' lo' : '') + '">' + esc(s === 'all' ? 'Все' : caseName(s)) + ' ' + m[s] + '</span>').join(' ');
  }
  // Своё значение цели + действующее от «Все игроки» (если своё «Все кейсы» не задано)
  function infoTxt(info) {
    if (!info) return luckTxt(null);
    const own = Object.keys(info.lv).length, inh = info.inh && Object.keys(info.inh).length;
    if (!inh) return luckTxt(info.lv);
    return (own ? luckTxt(info.lv) + ' ' : '') + '<span class="ap-mut">от «Все игроки»:</span> ' + luckTxt(info.inh);
  }
  // Настройки в канале живут 12 ч (столько хранит ntfy.sh); пока панель в сети, они продлеваются каждые 6 ч
  function expTxt(info) {
    const ts = Object.keys(info.exp || {}).map((k) => info.exp[k]);
    if (!ts.length) return '<span class="ap-mut">—</span>';
    return 'до ' + hm(Math.min.apply(null, ts)) + ' <span class="ap-mut">· продлевается, пока панель открыта и канал на связи</span>';
  }
  function failTxt() {
    const e = Net && Net.lastError();
    return e === 'quota' ? 'Не отправлено: дневной лимит ntfy.sh исчерпан (429). Попробуйте позже или из другой сети' : 'Не отправлено — нет связи';
  }
  const luckSort = (m) => (m && m.all != null ? m.all : m && Object.keys(m).length ? 50.5 : -1);
  const who = (r) => '<span class="ap-who"><i class="ap-ava">' + esc(r.a || (r.n || '?').charAt(0).toUpperCase()) + '</i>' + esc(r.n || '—') + (r.me ? '<em>вы</em>' : '') + '</span>';
  const pidCell = (r) => '<code>' + esc(r.pid) + '</code>';
  const findP = (r) => (r.n || '') + ' ' + r.pid;

  // ---------- Онлайн ----------
  SEC.online = {
    tools: () => (remoteOn() ? search('on', 'Ник или ID') : ''),
    head: () => (remoteOn() ? '' : gate()),
    body: function () {
      if (!remoteOn()) return '';
      const list = Net.online(), now = Date.now();
      const act = list.filter((r) => r.act).length;
      const cols = [
        { k: 'n', h: 'Игрок', v: (r) => (r.n || '').toLowerCase(), f: who },
        { k: 'pid', h: 'ID', f: pidCell },
        { k: 'st', h: 'Вход', num: 1, f: (r) => hm(r.st) },
        { k: 'ses', h: 'Сессия', num: 1, v: (r) => (r.st ? now - r.st : null), f: (r) => dur(now - r.st) },
        { k: 'b', h: 'Баланс', num: 1, f: (r) => money(r.b) },
        { k: 'so', h: 'Кейсов', num: 1, f: (r) => (r.so || 0) + '<span class="ap-mut"> / ' + G.fmtInt(r.o) + '</span>' },
        { k: 'ld', h: 'Последний дроп', v: (r) => (r.ld ? r.ld.t : null), f: (r) => (r.ld ? skinCell(r.ld.s) + '<span class="ap-mut"> · ' + ago(r.ld.t) + '</span>' : '<span class="ap-mut">—</span>') },
        { k: 'act', h: 'Статус', v: (r) => (r.act ? 1 : 0), f: (r) => (r.act ? '<span class="ap-on">активен</span>' : '<span class="ap-mut">отошёл</span>') },
        { k: 'lk', h: 'Удача', v: (r) => luckSort(r.lk), f: (r) => luckTxt(r.lk) + (r.fq ? ' <span class="ap-lk hi">дроп ×' + r.fq + '</span>' : '') },
      ];
      return '<div class="ap-kpi"><div><b>' + list.length + '</b><span>в игре</span></div><div><b>' + act + '</b><span>активны</span></div>' +
        '<div><b>' + (list.length - act) + '</b><span>отошли</span></div><div><b>' + Net.players().length + '</b><span>за 12 ч</span></div></div>' +
        table('on', cols, list, { sort: { k: 'st', d: -1 }, find: findP, act: 'adm-pl', rid: (r) => r.pid, empty: 'Сейчас никого нет. Игроки появляются в течение минуты после открытия панели.', tall: 1 });
    },
  };
  A['adm-pl'] = function (pid) { if (!unlocked()) return; ui.pid = pid; ui.sec = 'players'; panel(); };

  // ---------- Игроки ----------
  SEC.players = {
    tools: () => (remoteOn() ? search('pl', 'Поиск по нику или ID') : ''),
    head: () => (remoteOn() ? '' : gate()),
    body: function () {
      if (!remoteOn()) return '';
      const list = Net.players();
      const cols = [
        { k: 'n', h: 'Игрок', v: (r) => (r.n || '').toLowerCase(), f: who },
        { k: 'pid', h: 'ID', f: pidCell },
        { k: 't', h: 'Был', num: 1, f: (r) => (r.on ? '<span class="ap-on">в игре</span>' : ago(r.t)) },
        { k: 'b', h: 'Баланс', num: 1, f: (r) => money(r.b) },
        { k: 'o', h: 'Кейсов', num: 1, f: (r) => G.fmtInt(r.o) },
        { k: 'ni', h: 'Предметов', num: 1, f: (r) => G.fmtInt(r.ni) },
        { k: 'sp', h: 'Потрачено (сессия)', num: 1, f: (r) => money(r.sp) },
        { k: 'lk', h: 'Удача', v: (r) => luckSort(r.lk), f: (r) => luckTxt(r.lk) + (r.fq ? ' <span class="ap-lk hi">дроп ×' + r.fq + '</span>' : '') },
      ];
      return (ui.pid ? card(ui.pid) : '') +
        table('pl', cols, list, { sort: { k: 't', d: -1 }, find: findP, act: 'adm-pl', rid: (r) => r.pid, sel: (r) => r.pid === ui.pid, empty: 'За последние 12 часов игроков не было', tall: !ui.pid });
    },
  };

  // ---------- Карточка игрока ----------
  const kv = (k, v) => '<div class="ap-kv"><span>' + k + '</span><b>' + v + '</b></div>';
  function card(pid) {
    const r = Net.player(pid);
    if (!r) return '<div class="ap-card">' + note('Игрок не найден (его не было в сети 12 ч)') + '</div>';
    const spentAll = r.tot != null ? Math.max(0, r.tot - (r.b || 0)) : null;
    const wait = note('Запрошено у игрока… Ответ придёт, если он в игре.');
    const inv = r.inv ? table('inv', [
      { k: 's', h: 'Предмет', v: (x) => skinTxt(x.s), f: (x) => skinCell(x.s) },
      { k: 'w', h: 'Износ', v: (x) => x.f, f: (x) => esc(G.t('wear_' + G.wearOf(x.f).id)) },
      { k: 'f', h: 'Float', num: 1, f: (x) => x.f.toFixed(4) },
      { k: 'val', h: 'Цена', num: 1, v: (x) => G.instValue(x), f: (x) => G.fmt(G.instValue(x)) },
    ], r.inv, { sort: { k: 'val', d: -1 }, empty: 'Инвентарь пуст' }) : wait;
    const drops = r.drops ? table('dr', [
      { k: 't', h: 'Время', num: 1, f: (x) => hms(x.t) },
      { k: 's', h: 'Предмет', v: (x) => skinTxt(x.s), f: (x) => skinCell(x.s) },
      { k: 'c', h: 'Кейс', v: (x) => caseName(x.c), f: (x) => esc(caseName(x.c) || '—') },
      { k: 'v', h: 'Цена', num: 1, v: (x) => SKINS[x.s].value, f: (x) => G.fmt(SKINS[x.s].value) },
    ], r.drops, { sort: { k: 't', d: -1 }, empty: 'В этой сессии кейсы не открывались' }) : wait;
    const best = r.best ? skinCell(r.best.s) : '—';
    return '<div class="ap-card"><div class="ap-ch">' + who(r) + pidCell(r) +
      (r.on ? '<span class="ap-on">в игре · ' + (r.act ? 'активен' : 'отошёл') + '</span>' : '<span class="ap-mut">был ' + ago(r.t) + '</span>') +
      '<span class="ap-sp"></span><button class="btn mini primary" data-act="adm-target" data-id="' + esc(pid) + '">' + UI.ic('dice') + 'Шансы</button>' +
      (SKINS[NOIR] ? '<button class="btn mini ap-sxb" data-act="adm-noir-to" data-id="' + esc(pid) + '">' + UI.ic('rewards') + 'Подарить секретный скин</button>' : '') +
      '<button class="btn mini" data-act="adm-pl" data-id="">' + UI.ic('x') + '</button></div>' +
      '<div class="ap-kvs">' + kv('Баланс', money(r.b)) + kv('Кейсов всего', G.fmtInt(r.o)) + kv('За сессию', G.fmtInt(r.so)) +
      kv('Потрачено (сессия)', money(r.sp)) + kv('Потрачено всего', spentAll == null ? '…' : G.fmt(spentAll)) + kv('Заработано всего', r.tot == null ? '…' : G.fmt(r.tot)) +
      kv('Предметов', G.fmtInt(r.ni)) + kv('Вход', hm(r.st)) + kv('Сессия', r.on ? dur(Date.now() - r.st) : '—') + '</div>' +
      '<div class="ap-kvs l">' + kv('Лучший предмет', best) + kv('Настройка удачи', infoTxt(r.info)) + kv('Применено у игрока', luckTxt(r.lk) + (r.fq ? ' <span class="ap-lk hi">дроп ×' + r.fq + '</span>' : '')) + '</div>' +
      '<div class="ap-2"><div><div class="ap-bt">Инвентарь' + (r.inv ? ' · ' + r.inv.length : '') + '</div>' + inv + '</div>' +
      '<div><div class="ap-bt">История дропов' + (r.drops ? ' · ' + r.drops.length : '') + '</div>' + drops + '</div></div></div>';
  }
  A['adm-target'] = function (t) { if (!unlocked()) return; ui.target = t || 'self'; ui.sec = 'luck'; panel(); };

  // ---------- Шансы ----------
  function tgName(t) {
    if (t === 'self') return 'Это устройство';
    if (t === '*') return 'Все игроки';
    const r = remoteOn() && Net.players().find((x) => x.pid === t);
    return r ? (r.n || '—') + ' · ' + t : t;
  }
  const opt = (v, t, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(t) + '</option>';
  function caseOpts(cur, first) {
    return opt(first[0], first[1], !cur || cur === first[0]) + CASES.map((c) => opt(c.id, G.nm(c.name) + ' · ' + G.fmtP(c.price), c.id === cur)).join('');
  }
  function skinOpts() {
    const ids = ui.fcase && CASE_BY_ID[ui.fcase] ? CASE_BY_ID[ui.fcase].items.slice() : SKIN_LIST.map((s) => s.id);
    ids.sort((a, b) => SKINS[b].value - SKINS[a].value);
    if (ids.indexOf(ui.fskin) < 0) ui.fskin = ids[0];
    return ids.map((id) => opt(id, skinTxt(id) + ' · ' + G.fmt(SKINS[id].value), id === ui.fskin)).join('');
  }
  SEC.luck = {
    head: function () {
      if (ui.target !== 'self' && ui.target !== '*' && !remoteOn()) ui.target = 'self';
      if (ui.target === '*' && !remoteOn()) ui.target = 'self';
      const seg = (v, t) => '<button class="ap-sg' + (ui.target === v ? ' on' : '') + '" data-act="adm-target" data-id="' + v + '">' + t + '</button>';
      let pick = '';
      if (remoteOn()) {
        const pl = Net.players();
        const isP = ui.target !== 'self' && ui.target !== '*';
        pick = '<select id="ap-tg" class="ap-in"><option value="">Игрок…</option>' +
          (isP && !pl.some((r) => r.pid === ui.target) ? opt(ui.target, ui.target, true) : '') +
          pl.map((r) => opt(r.pid, (r.on ? '● ' : '') + (r.n || '—') + ' · ' + r.pid, r.pid === ui.target)).join('') + '</select>';
      } else if (site()) pick = '<span class="ap-mut">Другие игроки — после подключения канала</span>';
      const pre = PRESETS.map((p) => '<button class="btn mini" data-act="adm-preset" data-id="' + (p.v == null ? 'off' : p.v) + '">' + p.t + (p.v == null ? '' : ' <span class="ap-mut">' + p.v + '</span>') + '</button>').join('');
      const up = (v, t) => '<button class="btn mini' + (G.pref.up === v ? ' primary' : '') + '" data-act="adm-odds-up" data-id="' + v + '">' + t + '</button>';
      const legacy = Object.keys(G.pref.cases);
      return '<div class="ap-box"><div class="ap-bt">Цель</div><div class="ap-row">' + seg('self', 'Это устройство') + (remoteOn() ? seg('*', 'Все игроки') : '') + pick + '</div>' +
        '<div class="ap-row"><span class="ap-lb">Охват</span><select id="ap-sc" class="ap-in">' + caseOpts(ui.scope, ['all', 'Все кейсы']) + '</select></div></div>' +
        '<div class="ap-box"><div class="ap-bt">Удача: ' + esc(tgName(ui.target)) + '</div>' +
        '<div class="ap-row"><span class="ap-lb ap-end">Дешёвое</span><input id="ap-lv" class="ap-rng" type="range" min="0" max="100" step="1" value="' + ui.luck + '">' +
        '<span class="ap-lb ap-end">Топ</span><b class="ap-lvv" id="ap-lvv">' + ui.luck + '</b><button class="btn mini primary" data-act="adm-luck">Применить</button></div>' +
        '<div class="ap-row">' + pre + '</div>' +
        note('50 — как обычно, 100 — всегда самый дорогой предмет кейса, 0 — всегда самый дешёвый. Шансы на странице кейса, рулетка и лента не меняются.') + '</div>' +
        '<div class="ap-box"><div class="ap-bt">Следующий дроп</div><div class="ap-row">' +
        '<select id="ap-fc" class="ap-in">' + caseOpts(ui.fcase, ['', 'Любой кейс с этим предметом']) + '</select>' +
        '<select id="ap-fs" class="ap-in w">' + skinOpts() + '</select>' +
        '<button class="btn mini primary" data-act="adm-force">Назначить</button></div>' +
        note('Срабатывает один раз — при следующем открытии кейса, в котором есть этот предмет.') + '</div>' +
        '<div class="ap-box"><div class="ap-bt">Апгрейдер (это устройство)</div><div class="ap-row">' +
        up(0.25, '×0.25') + up(0.5, '×0.5') + up(1, '×1 обычно') + up(1.5, '×1.5') + up(2, '×2') + up(3, '×3') + up(G.PREF_MAX, '100% скрыто') + '</div>' +
        note('×0.25…×3 видны на кольце апгрейда. «100% скрыто» на кольце не видно: шанс показан обычный, апгрейд всегда удачный.') +
        (legacy.length ? '<div class="ap-row"><span class="ap-mut">Старые множители кейсов: ' + legacy.map((k) => esc(k === 'all' ? 'все' : caseName(k)) + ' ×' + G.pref.cases[k]).join(', ') +
          '</span><button class="btn mini" data-act="adm-odds-reset">Сбросить</button></div>' : '') + '</div>';
    },
    body: function () {
      const t = ui.target;
      const info = Net ? Net.luckInfo(t) : { lv: G.pref.lv, exp: {}, inh: {} };
      let pend = [];
      if (t === 'self') pend = G.mix.own.map((e) => ({ s: e.s, c: e.c }));
      else if (Net) pend = Net.journal().filter((e) => e.k === 'f' && !e.self && e.target === t && !e.done);
      const jr = Net ? Net.journal().filter((e) => (t === 'self' ? e.self : !e.self && e.target === t)).slice(0, 12) : [];
      return '<div class="ap-box"><div class="ap-bt">Сейчас</div><div class="ap-kvs l">' + kv('Удача', infoTxt(info)) + (t === 'self' ? '' : kv('Срок в канале', expTxt(info))) +
        kv('Назначенные дропы', pend.length ? pend.map((e) => skinCell(e.s) + (e.c ? ' <span class="ap-mut">' + esc(caseName(e.c)) + '</span>' : '')).join('<br>') : '<span class="ap-mut">нет</span>') + '</div>' +
        (jr.length ? '<div class="ap-bt">Журнал цели</div>' + logTable('lt', jr) : '') + '</div>';
    },
  };

  // ---------- Шансы: действия ----------
  function applyLuck(v) {
    if (!unlocked()) return;
    const t = ui.target, sc = ui.scope || 'all';
    if (t !== 'self' && !remoteOn()) { UI.toast('Канал не подключён', 'bad'); return; }
    const p = Net ? Net.setLuck(t, v, sc) : Promise.resolve((G.setLv(sc, v), true));
    p.then((ok) => {
      UI.toast(ok ? tgName(t) + ' · ' + scopeTxt(sc) + ': ' + luckLabel(v) : failTxt(), ok ? 'good' : 'bad');
      if (visible()) dyn();
    });
  }
  A['adm-preset'] = function (v) {
    const n = v === 'off' ? null : Number(v);
    if (n != null) { ui.luck = n; const r = document.getElementById('ap-lv'), o = document.getElementById('ap-lvv'); if (r) r.value = n; if (o) o.textContent = n; }
    applyLuck(n);
  };
  A['adm-luck'] = function () { applyLuck(ui.luck); };
  A['adm-force'] = function () {
    if (!unlocked() || !SKINS[ui.fskin]) return;
    const t = ui.target;
    if (t === '*') { UI.toast('Назначенный дроп — только одному игроку или себе', 'bad'); return; }
    if (t !== 'self' && !remoteOn()) { UI.toast('Канал не подключён', 'bad'); return; }
    const p = Net ? Net.forceDrop(t, ui.fskin, ui.fcase) : Promise.resolve(G.queueOwn(ui.fskin, ui.fcase));
    Promise.resolve(p).then((ok) => {
      UI.toast(ok ? 'Следующий дроп: ' + skinTxt(ui.fskin) : failTxt(), ok ? 'good' : 'bad');
      if (visible()) dyn();
    });
  };
  A['adm-odds-up'] = function (v) {
    if (!unlocked()) return;
    G.pref.up = Number(v) || 1;
    G.savePref(); panel();
    UI.toast(G.pref.up >= G.PREF_MAX ? 'Апгрейд: 100% (скрыто)' : 'Апгрейд: шанс ×' + G.pref.up, 'good');
  };
  A['adm-odds-reset'] = function () {
    if (!unlocked()) return;
    G.pref.cases = {};
    G.savePref(); panel();
    UI.toast('Старые множители сброшены', 'good');
  };
  document.addEventListener('change', (e) => {
    const id = e.target && e.target.id;
    if (id === 'ap-tg') { if (e.target.value) { ui.target = e.target.value; panel(); } }
    else if (id === 'ap-sc') ui.scope = e.target.value;
    else if (id === 'ap-fc') { ui.fcase = e.target.value; panel(); }
    else if (id === 'ap-fs') ui.fskin = e.target.value;
    else if (id === 'ap-gs') last.skin = e.target.value;
    else if (id === 'ap-gw') last.wear = e.target.value;
    else if (id === 'ap-xw') last.xwear = e.target.value;
    else if (id === 'ap-ys') last.gskin = e.target.value;
    else if (id === 'ap-yw') last.gwear = e.target.value;
    else if (id === 'ap-xp' || id === 'ap-yp') { last.gpid = e.target.value; const o = document.getElementById(id === 'ap-xp' ? 'ap-yp' : 'ap-xp'); if (o) o.value = last.gpid; }
  });
  document.addEventListener('input', (e) => {
    if (!e.target || e.target.id !== 'ap-lv') return;
    ui.luck = Number(e.target.value) || 0;
    const o = document.getElementById('ap-lvv');
    if (o) o.textContent = ui.luck;
  });

  // ---------- Журнал ----------
  function logTable(id, rows) {
    return table(id, [
      { k: 't', h: 'Время', num: 1, f: (e) => hms(e.t) },
      { k: 'target', h: 'Цель', v: (e) => (e.self ? 'self' : e.target), f: (e) => esc(e.self ? 'Это устройство' : tgName(e.target)) },
      { k: 'k', h: 'Действие', f: (e) => (e.k === 'l' ? 'Удача' : e.k === 'g' ? 'Подарок' : 'Следующий дроп') },
      { k: 'v', h: 'Значение', v: (e) => (e.k === 'l' ? (e.v == null ? -1 : e.v) : 200), f: (e) => (e.k === 'l' ? esc(luckLabel(e.v)) : skinCell(e.s) + (e.k === 'g' && e.f != null ? ' <span class="ap-mut">' + Number(e.f).toFixed(4) + '</span>' : '')) },
      { k: 'scope', h: 'Охват', v: (e) => (e.k === 'l' ? scopeTxt(e.scope) : caseName(e.c)), f: (e) => (e.k === 'g' ? '<span class="ap-mut">—</span>' : esc(e.k === 'l' ? scopeTxt(e.scope) : caseName(e.c) || 'Любой кейс')) },
      { k: 'exp', h: 'Действует до', num: 1, v: (e) => e.exp || null, f: (e) => (e.exp ? hm(e.exp) : '<span class="ap-mut">—</span>') },
      { k: 'done', h: 'Статус', v: (e) => (e.k !== 'l' ? (e.done ? 1 : 0) : 2), f: (e) => (e.k === 'l' ? '' : e.self ? '<span class="ap-mut">' + (e.k === 'g' ? 'получен' : 'локально') + '</span>' : e.done ? '<span class="ap-on">' + (e.k === 'g' ? 'получен' : 'выпал') + '</span>' : '<span class="ap-mut">ждёт</span>') },
    ], rows, { sort: { k: 't', d: -1 }, find: (e) => (e.self ? 'это устройство' : tgName(e.target)) + ' ' + (e.k === 'l' ? luckLabel(e.v) + ' ' + scopeTxt(e.scope) : (e.k === 'g' ? 'подарок ' : '') + skinTxt(e.s) + ' ' + caseName(e.c)), empty: 'Изменений пока нет', tall: id === 'lg' });
  }
  SEC.log = {
    tools: () => search('lg', 'Цель, предмет, кейс'),
    head: () => (site() && !remoteOn() ? note('Сейчас видны только изменения этого устройства. Изменения для других игроков появятся после подключения канала (журнал канала хранится 12 ч).') : ''),
    body: () => logTable('lg', Net ? Net.journal() : []),
  };

  // ---------- Экономика ----------
  function ev(c) {
    // средняя цена продажи предмета из кейса по видимым шансам, с износом и торговцем
    const w = G.caseWeights(c);
    let tw = 0, sum = 0;
    c.items.forEach((id, i) => { tw += w[i]; sum += w[i] * SKINS[id].value; });
    return sum / tw * WEAR_EV * G.sellMult();
  }
  SEC.eco = {
    tools: () => search('eco', 'Кейс'),
    body: function () {
      const rows = CASES.map((c) => { const e = ev(c); return { id: c.id, n: G.nm(c.name), price: c.price, ev: e, ret: e / c.price * 100, cnt: c.items.length }; });
      return table('eco', [
        { k: 'n', h: 'Кейс' },
        { k: 'price', h: 'Цена', num: 1, f: (r) => G.fmtP(r.price) },
        { k: 'ev', h: 'Средний дроп', num: 1, f: (r) => G.fmt(r.ev) },
        { k: 'ret', h: 'Отдача', num: 1, f: (r) => '<span class="' + (r.ret >= 100 ? 'ap-bad' : '') + '">' + r.ret.toFixed(1) + '%</span>' },
        { k: 'cnt', h: 'Предметов', num: 1 },
      ], rows, { sort: { k: 'price', d: 1 }, find: (r) => r.n }) + note('По видимым шансам (с прокачкой «Удача» и торговцем этого устройства), без настроек админки.');
    },
  };

  // ---------- Сохранение ----------
  SEC.save = {
    head: () => '<div class="ap-box"><div class="ap-row"><button class="btn mini" data-act="adm-export">Экспорт</button>' +
      '<button class="btn mini" data-act="adm-import">Импорт из поля</button></div>' +
      '<textarea id="adm-save" class="ap-ta" rows="8" placeholder="Сюда выгружается сохранение; вставьте JSON и нажмите «Импорт»"></textarea></div>',
    body: () => '',
  };

  // ---------- Выдача (только это устройство) ----------
  // выбор в «Выдать предмет» и подарках сохраняется между действиями
  const last = { skin: null, wear: 'ft', n: 1, xwear: 'fn', gskin: null, gwear: 'ft', gpid: '' };
  // Секретный скин (трофей): только этот блок и подарки; в случайные выдачи и списки не попадает
  const NOIR = 'kar_noir';
  const isSecret = (id) => (typeof G.isSecret === 'function' ? !!G.isSecret(id) : !!(SKINS[id] && RARITIES[SKINS[id].r] && RARITIES[SKINS[id].r].id === 'secret'));
  const plain = () => SKIN_LIST.filter((s) => !isSecret(s.id));
  const btn = (act, id, t, cls) => '<button class="btn mini' + (cls ? ' ' + cls : '') + '" data-act="' + act + '"' + (id != null ? ' data-id="' + esc(id) + '"' : '') + '>' + t + '</button>';
  const wearOpts = (cur) => WEARS.map((w) => opt(w.id, G.t('wear_' + w.id), w.id === cur)).join('');
  // Игрок для подарка: сначала те, кто в игре
  function playerSel(id) {
    // в игре — первыми, своё устройство — последним
    const rank = (r) => (r.me ? 0 : r.on ? 2 : 1);
    const pl = Net.players().slice().sort((a, b) => rank(b) - rank(a) || b.t - a.t);
    if (!pl.some((r) => r.pid === last.gpid)) last.gpid = pl.length ? pl[0].pid : '';
    return '<select id="' + id + '" class="ap-in ap-pp">' + (pl.length ? pl.map((r) => opt(r.pid, (r.on ? '● ' : '') + (r.n || '—') + ' · ' + r.pid + (r.me ? ' (вы)' : ''), r.pid === last.gpid)).join('') : '<option value="">Игроков нет (12 ч)</option>') + '</select>';
  }
  // Кому можно дарить: только сайт с подключённым каналом
  function giftGate() {
    if (!site()) return note('Дарить другим игрокам можно только на сайте игры: в этой сборке нет внешних сервисов.');
    if (!remoteOn()) return note('Подарить игроку — после подключения канала (раздел «Онлайн» или «Игроки»).');
    return '';
  }
  function noirBox() {
    if (!SKINS[NOIR]) return '';
    const sk = SKINS[NOIR], g = giftGate();
    return '<div class="ap-box ap-sx"><div class="ap-sx-card">' + UI.itemCard(NOIR, { price: sk.value }) + '</div><div class="ap-sx-r">' +
      '<div class="ap-bt">Секретный скин</div><div class="ap-sx-n">' + esc(skinTxt(NOIR)) + ' <span>· ' + COIN + String(Math.round(sk.value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '</span></div>' +
      '<div class="ap-row"><select id="ap-xw" class="ap-in">' + wearOpts(last.xwear) + '</select>' + btn('adm-noir-self', null, 'Выдать себе', 'primary') + '</div>' +
      (g || '<div class="ap-row">' + playerSel('ap-xp') + btn('adm-noir-gift', null, 'Подарить игроку', 'primary') + '</div>') +
      note('Трофей: продать и поставить в апгрейд нельзя, в кейсах не выпадает. Игрок получает окно «Подарок»; в ленту подарок не попадает.') + '</div></div>';
  }
  function anyGiftBox() {
    const g = giftGate();
    let body = g;
    if (!g) {
      const ids = plain().sort((a, b) => b.value - a.value);
      if (!last.gskin || !ids.some((s) => s.id === last.gskin)) last.gskin = ids[0].id;
      body = '<div class="ap-row"><select id="ap-ys" class="ap-in w">' + ids.map((s) => opt(s.id, skinTxt(s.id) + ' · ' + G.fmt(s.value), s.id === last.gskin)).join('') + '</select>' +
        '<select id="ap-yw" class="ap-in">' + wearOpts(last.gwear) + '</select></div>' +
        '<div class="ap-row">' + playerSel('ap-yp') + btn('adm-gift-any', null, 'Подарить', 'primary') + '</div>' +
        note('Подарок приходит игроку, когда он в игре (или зайдёт позже: пока он не получен, панель отправляет его заново). Статус — в «Журнале».');
    }
    return '<div class="ap-box"><div class="ap-bt">Подарить игроку любой предмет</div>' + body + '</div>';
  }
  SEC.give = {
    head: function () {
      const S = G.S;
      const ids = plain().sort((a, b) => b.value - a.value);
      if (!last.skin) last.skin = ids[0].id;
      const skins = ids.map((s) => opt(s.id, skinTxt(s.id) + ' · ' + G.fmt(s.value), s.id === last.skin)).join('');
      const wears = wearOpts(last.wear);
      const b = btn;
      return noirBox() + '<div class="ap-box"><div class="ap-bt">Баланс · ' + COIN + G.fmt(S.coins) + '</div><div class="ap-row">' +
        [100, 1000, 10000, 100000].map((v) => b('adm-coins', v, '+' + G.fmtInt(v))).join('') +
        '<input id="adm-coins" class="ap-in" type="number" min="0" step="0.01" placeholder="Сумма">' + b('adm-setcoins', null, 'Установить', 'primary') + '</div></div>' +
        '<div class="ap-box"><div class="ap-bt">Выдать предмет</div><div class="ap-row">' +
        '<select id="ap-gs" class="ap-in w">' + skins + '</select><select id="ap-gw" class="ap-in">' + wears + '</select>' +
        '<input id="adm-n" class="ap-in s" type="number" min="1" max="50" value="' + last.n + '" title="Количество">' + b('adm-give', null, 'Выдать', 'primary') + '</div>' +
        '<div class="ap-row">' + b('adm-give-rand', 'star', 'Случайный нож/перчатки') + b('adm-give-rand', '10', '10 случайных предметов') + '</div></div>' +
        (site() ? anyGiftBox() : '') +
        '<div class="ap-box"><div class="ap-bt">Прогресс</div><div class="ap-row">' +
        b('adm-maxup', null, 'Прокачка на максимум') + b('adm-resetup', null, 'Сбросить прокачку') + b('adm-collection', null, 'Открыть всю коллекцию') +
        b('adm-clearinv', null, 'Очистить инвентарь', 'danger') + '</div></div>' +
        '<div class="ap-box"><div class="ap-bt">Таймеры и награды</div><div class="ap-row">' +
        b('adm-timers', null, 'Сбросить все таймеры') + b('adm-quests', null, 'Выполнить задания дня') + '</div></div>';
    },
    body: () => '',
  };

  function done(msg) {
    G.save(true);
    UI.renderFeed();
    panel();
    UI.refresh();
    if (msg) UI.toast(msg, 'good');
  }
  A['adm-coins'] = function (v) { if (!unlocked()) return; G.addCoins(Number(v) || 0); done('+' + G.fmt(Number(v))); };
  A['adm-setcoins'] = function () {
    if (!unlocked()) return;
    const v = Number(document.getElementById('adm-coins').value);
    if (!isFinite(v) || v < 0) { UI.toast('Введите сумму', 'bad'); return; }
    G.S.coins = round2(v);
    done('Баланс: ' + G.fmt(G.S.coins));
  };
  function giveOne(id, wearId) {
    if (G.invFull(1)) return false;
    G.addInst(id, G.rollFloat(wearId), 'admin');
    return true;
  }
  A['adm-give'] = function () {
    if (!unlocked()) return;
    const id = document.getElementById('ap-gs').value, wear = document.getElementById('ap-gw').value;
    const n = Math.max(1, Math.min(50, Math.floor(Number(document.getElementById('adm-n').value) || 1)));
    if (!SKINS[id] || isSecret(id)) return;
    last.skin = id; last.wear = wear; last.n = n;
    let k = 0;
    while (k < n && giveOne(id, wear)) k++;
    done(k ? 'Выдано: ' + k + ' шт.' : 'Инвентарь полон');
  };
  A['adm-give-rand'] = function (mode) {
    if (!unlocked()) return;
    const pool = mode === 'star' ? plain().filter((s) => G.isStar(s.id)) : plain();
    const n = mode === 'star' ? 1 : 10;
    let k = 0;
    while (k < n && giveOne(pool[Math.floor(Math.random() * pool.length)].id, null)) k++;
    done(k ? 'Выдано: ' + k + ' шт.' : 'Инвентарь полон');
  };
  // ---------- Подарки ----------
  // pid 'self' — себе (сразу, локально); иначе — через канал. Удалённый подарок — с подтверждением
  function sendGift(pid, skinId, wearId) {
    if (!unlocked() || !SKINS[skinId]) return;
    const self = pid === 'self';
    if (!self && !remoteOn()) { UI.toast(site() ? 'Канал не подключён' : 'Дарить другим можно только на сайте', 'bad'); return; }
    if (!self && !pid) { UI.toast('Выберите игрока', 'bad'); return; }
    const go = () => {
      const f = G.rollFloat(wearId || null);
      const p = Net ? Net.gift(pid, skinId, f) : Promise.resolve(localGift(skinId, f));
      Promise.resolve(p).then((ok) => {
        if (self) { UI.refresh(); if (visible()) panel(); if (!ok) UI.toast('Не выдано', 'bad'); return; }
        UI.toast(ok ? 'Подарок отправлен: ' + skinTxt(skinId) + ' → ' + tgName(pid) : failTxt(), ok ? 'good' : 'bad');
        if (visible()) panel();
      });
    };
    if (self) go();
    else UI.confirm('Подарить <b>' + esc(skinTxt(skinId)) + '</b> игроку <b>' + esc(tgName(pid)) + '</b>?', go);
  }
  function localGift(skinId, f) {
    const id = 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    if (typeof G.giftReceive === 'function') return !!G.giftReceive(skinId, { f: f, from: 'admin', id: id });
    G.addInst(skinId, f, 'admin'); G.save(true);
    return true;
  }
  const pickedPid = (id) => { const el = document.getElementById(id); return el ? el.value : last.gpid; };
  A['adm-noir-self'] = function () { sendGift('self', NOIR, last.xwear); };
  A['adm-noir-gift'] = function () { sendGift(pickedPid('ap-xp'), NOIR, last.xwear); };
  A['adm-noir-to'] = function (pid) { sendGift(pid, NOIR, last.xwear); };
  A['adm-gift-any'] = function () {
    const s = document.getElementById('ap-ys');
    if (s) last.gskin = s.value;
    if (isSecret(last.gskin) && last.gskin !== NOIR) return;
    sendGift(pickedPid('ap-yp'), last.gskin, last.gwear);
  };
  A['adm-maxup'] = function () { if (!unlocked()) return; G.UPGRADES.forEach((u) => { G.S.up[u.id] = u.max; }); done('Прокачка на максимуме'); };
  A['adm-resetup'] = function () { if (!unlocked()) return; G.UPGRADES.forEach((u) => { G.S.up[u.id] = 0; }); done('Прокачка сброшена'); };
  A['adm-collection'] = function () { if (!unlocked()) return; SKIN_LIST.forEach((s) => { G.S.found[s.id] = 1; }); done('Коллекция открыта'); };
  A['adm-clearinv'] = function () {
    if (!unlocked()) return;
    UI.confirm('Удалить все предметы из инвентаря (без продажи)?', () => { G.S.inv = []; done('Инвентарь очищен'); });
  };
  A['adm-timers'] = function () {
    if (!unlocked()) return;
    const S = G.S;
    S.freeAt = 0; S.adCoinsAt = 0; S.adCaseAt = 0; S.adSellAt = 0;
    if (S.daily.last) S.daily.last = Date.now() - G.C.DAY - 1000;   // серия сохраняется
    S.rw = { h: -1, d: -1, w: -1 };
    S.day.q = [];
    done('Таймеры сброшены');
  };
  A['adm-quests'] = function () {
    if (!unlocked()) return;
    G.rollPeriods();
    const D = G.S.day;
    D.o = Math.max(D.o, 15); D.u = Math.max(D.u, 3); D.uw = Math.max(D.uw, 1);
    D.c = Math.max(D.c, 1000); D.s = Math.max(D.s, 25); D.r = Math.max(D.r, 3);
    G.S.week.o = Math.max(G.S.week.o, 70);
    done('Условия заданий и призов выполнены');
  };

  // ---------- Ключ канала ----------
  SEC.key = {
    head: function () {
      const k = Net.publicKeys();
      let st;
      if (net.busy) st = note('Вычисляю ключ…');
      else if (!k) st = chanForm();
      else if (net.match) st = note('Ключ в коде совпадает с ключом из пароля. Канал работает' + (Net.test ? ' (DEV: тестовый ключ).' : '.'));
      else st = note('Ключ в коде не задан или не совпадает. Скопируйте оба значения в CHAN_PUB (js/sync.js): sig и enc, затем выложите сайт заново.', 'bad');
      const row = (n, v) => '<div class="ap-key"><span>' + n + '</span><code id="ap-k-' + n + '">' + esc(v) + '</code><button class="btn mini" data-act="adm-copy" data-id="' + n + '">Копировать</button></div>';
      return '<div class="ap-box"><div class="ap-bt">Открытые ключи</div>' + st +
        (k ? row('sig', k.sig) + row('enc', k.enc) + '<div class="ap-row"><button class="btn mini" data-act="adm-copy" data-id="all">Копировать для CHAN_PUB</button></div>' : '') +
        note('Ключи выводятся из пароля (PBKDF2). Это открытые ключи: их можно хранить в коде. Закрытая часть и пароль не сохраняются. После смены пароля ключ меняется — встройте новый. Пароль — длинный и случайный: открытые ключи в коде можно перебирать офлайн.') + '</div>';
    },
    body: () => '',
  };
  function copyText(txt) {
    const bad = () => UI.toast('Не удалось скопировать — выделите текст вручную', 'bad');
    try { navigator.clipboard.writeText(txt).then(() => UI.toast('Скопировано', 'good'), bad); } catch (e) { bad(); }
  }
  A['adm-copy'] = function (n) {
    const k = Net && Net.publicKeys();
    if (!k || !unlocked()) return;
    copyText(n === 'all' ? "const CHAN_PUB = { sig: '" + k.sig + "', enc: '" + k.enc + "' };" : k[n]);
  };

  // ---------- Сохранение: экспорт / импорт ----------
  A['adm-export'] = function () {
    if (!unlocked()) return;
    const ta = document.getElementById('adm-save');
    ta.value = JSON.stringify(G.S);
    const fallback = () => { ta.focus(); ta.select(); UI.toast('Текст выделен — скопируйте его из поля'); };
    try {
      navigator.clipboard.writeText(ta.value).then(() => UI.toast('Сохранение скопировано', 'good'), fallback);
    } catch (e) { fallback(); }
  };
  A['adm-import'] = function () {
    if (!unlocked()) return;
    let raw = null;
    try { raw = JSON.parse(document.getElementById('adm-save').value); } catch (e) { UI.toast('Это не похоже на сохранение', 'bad'); return; }
    UI.confirm('Заменить текущий прогресс загруженным?', () => {
      const keep = G.S.settings;
      G.S = G.sanitize(raw);
      G.S.settings = keep;
      done('Сохранение загружено');
    });
  };

  // Выход на этом устройстве: забыть флаг входа и сохранённые ключи канала
  A['adm-logout'] = function () {
    session = false; store.set(null);
    if (Net) { Net.logout(); Net.forget(); }
    net.match = false; net.err = ''; net.rest = false; ui.pid = ''; ui.target = 'self';
    UI.showScreen('cases');
    UI.toast('Вы вышли из админ-панели на этом устройстве');
  };

  // Запомненное устройство: канал подключается сам, без пароля (ключи из IndexedDB, см. js/sync.js)
  if (Net && unlocked()) {
    net.rest = true;
    Net.restore().then((ok) => {
      net.rest = false;
      if (ok) { net.match = true; net.err = ''; }
      redraw();
    });
  }

  // ---------- Скрытые входы ----------
  let taps = [];
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('.logo')) return;
    const now = Date.now();
    taps = taps.filter((x) => now - x < 2500);
    taps.push(now);
    if (taps.length >= 5) { taps = []; open(); }
  });
  window.addEventListener('hashchange', () => { if (location.hash === '#admin') open(); });

  return { open: open, check: check, unlock: unlock, unlocked: unlocked, waitLeft: waitLeft, LOGIN: LOGIN };
})();
