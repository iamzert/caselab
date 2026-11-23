'use strict';

// Служебный канал синхронизации (только сборка для сайта; в сборке для Яндекс Игр канал не запускается,
// работает только проверка пароля для js/desk.js). Транспорт — ntfy.sh, как у js/live.js.
// Два топика, имена выводятся из открытого ключа:
//   S — подписанные команды (ECDSA P-256), тело дополнительно закрыто AES-GCM (ключ выводится из кода,
//       это не секрет: команды может прочитать любой, кто разберёт код, — см. README);
//   P — состояние клиентов, зашифрованное на открытый ключ (ECDH P-256 + AES-GCM). Писать туда может
//       кто угодно, поэтому присланное клиентами — непроверенные данные.
// Адресат команды — не pid, а метка PBKDF2(pid): по топику нельзя узнать pid и подделать отметку «выпал».
// Ключи выводятся из пароля при входе (PBKDF2-SHA-256, 310 000 итераций, свои соли → скаляры P-256).
// Проверка пароля — совпадение выведенного открытого ключа с CHAN_PUB; пароль нигде не хранится.
// Ничего не пишет в консоль и в сохранение (кроме нейтрального pid в core.js).
//
// API (для js/desk.js):
//   Sync.configured()             — в коде есть открытый ключ (CHAN_PUB или DEV-тестовый)
//   Sync.ready()                  — ключ есть и это сайт (канал возможен)
//   Sync.login(password) → Promise<{ sig, enc, match, empty }>   match — пароль верный
//   Sync.loginTest()               — только DEV (localhost + ?admintest): тестовый ключ
//   Sync.logout(), Sync.publicKeys() → { sig, enc } | null
//   Sync.watch(bool)              — панель с живыми данными открыта (только тогда идут маячки)
//   Sync.online(), Sync.players(), Sync.player(pid)
//   Sync.setLuck(target, v, scope), Sync.forceDrop(pid, skin, case) → Promise<bool>
//   Sync.lastError()              — 'quota' (ntfy 429) | 'net' | ''
//   Sync.journal()                — [{ t, k, target, v, scope, s, c, self, done, exp }] новые первыми
//   Sync.luckInfo(target)         — { lv: {scope: v}, exp: {scope: t}, inh: {scope: v} } (inh — от «Все игроки»)
//   Sync.luckOf(target), Sync.on(fn), Sync.state()
const Sync = (function () {
  const DEV = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const Q = new URLSearchParams(location.search);
  const TEST = DEV && Q.has('admintest');
  // Открытые ключи канала (base64url x.y). Пусто — вход и удалённые функции выключены до встраивания.
  const CHAN_PUB = { sig: 'dxvEEuU6r-mPMSWpSH2E-CDmrAJfVD8LLte_cDyyvx8.Yz_EzA7MsKzXViBIXd7auuOhLuxhY02CbjcWquFC9VQ', enc: 'v7vUKwnHO55sUAv3Wsb89FtHn-u5n2JOLzHs1d46QUs.zLeFF43kGrjJaL0H2rub7l60RSGYsBkpnIsi1-zwv_c' };
  // Тестовый ключ: только localhost + ?admintest, на сайте никогда не используется
  const TEST_PASS = 'caselab-dev-admintest-key';
  const TEST_PUB = {
    sig: 'uXR0W5A8-d88y0d0QhYDwbfaKUAGoG8Dq4LRYW6lzbk.etkUfxLx6uFUx1p_2C0ap1reSL52TsXL5K8GPcnnupU',
    enc: 'q3Nj2kWc-IPtVEVOWOcFKefbY50EZbF3sFXFnxp4rLI.xg2k7wTh_rkOegWdozaOnjKc7lEtm8Q8bB9AEwqz7gg',
  };
  const PUB = TEST ? TEST_PUB : CHAN_PUB;
  const SALT_SIG = 'caselab:adm:sig:1', SALT_ENC = 'caselab:adm:enc:1', ITER = 310000;
  const SALT_TAG = 'caselab:to:1', ITER_TAG = 1000;
  const HIST = 12 * 3600e3;          // сколько ntfy.sh хранит сообщения
  const RENEW = 6 * 3600e3;          // админ в сети: настройки старше 6 ч отправляются заново
  const SKEW = 10 * 60e3;            // допуск часов вперёд
  const HB_WATCH = 60e3, HB_OPEN = 10e3, WATCH_TTL = 5 * 60e3, ONLINE = 3 * 60e3;
  const BEACON = 120e3, BEACON_MAX = 240e3;
  const MAX = 4096, SEAL_MAX = 3900, MAX_PLAYERS = 3000;
  const has = Object.prototype.hasOwnProperty;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) || null;
  const noop = () => {};

  // ---------- base64url / байты ----------
  function b64u(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function cat() {
    let n = 0;
    for (let i = 0; i < arguments.length; i++) n += arguments[i].length;
    const out = new Uint8Array(n);
    let o = 0;
    for (let i = 0; i < arguments.length; i++) { out.set(arguments[i], o); o += arguments[i].length; }
    return out;
  }
  function rnd(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  const hex = (b) => Array.prototype.map.call(b, (x) => (x < 16 ? '0' : '') + x.toString(16)).join('');
  function toBig(bytes) { return bytes.length ? BigInt('0x' + hex(bytes)) : 0n; }
  function fromBig(v, len) {
    const out = new Uint8Array(len);
    for (let i = len - 1; i >= 0; i--) { out[i] = Number(v & 255n); v >>= 8n; }
    return out;
  }
  async function sha(bytes) { return new Uint8Array(await subtle.digest('SHA-256', bytes)); }

  // ---------- P-256 на BigInt (только d·G для открытого ключа) ----------
  const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
  const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  const GX = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n;
  const GY = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;
  const md = (x) => { x %= P; return x < 0n ? x + P : x; };
  function pow(b, e) {
    let r = 1n;
    b = md(b);
    while (e > 0n) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n; }
    return r;
  }
  // Якобиевы координаты [X, Y, Z], a = −3
  function dbl(p) {
    const X = p[0], Y = p[1], Z = p[2];
    if (Z === 0n || Y === 0n) return [0n, 1n, 0n];
    const dl = md(Z * Z), gm = md(Y * Y), bt = md(X * gm);
    const al = md(3n * (X - dl) * (X + dl));
    const X3 = md(al * al - 8n * bt);
    const Z3 = md((Y + Z) * (Y + Z) - gm - dl);
    const Y3 = md(al * (4n * bt - X3) - 8n * gm * gm);
    return [X3, Y3, Z3];
  }
  function addA(p, qx, qy) {
    const X1 = p[0], Y1 = p[1], Z1 = p[2];
    if (Z1 === 0n) return [qx, qy, 1n];
    const zz = md(Z1 * Z1), U2 = md(qx * zz), S2 = md(qy * Z1 * zz);
    const H = md(U2 - X1), r = md(2n * (S2 - Y1));
    if (H === 0n) return r === 0n ? dbl(p) : [0n, 1n, 0n];
    const HH = md(H * H), I = md(4n * HH), J = md(H * I), V = md(X1 * I);
    const X3 = md(r * r - J - 2n * V);
    const Y3 = md(r * (V - X3) - 2n * Y1 * J);
    const Z3 = md((Z1 + H) * (Z1 + H) - zz - HH);
    return [X3, Y3, Z3];
  }
  function mulG(d) {
    let R = [0n, 1n, 0n];
    for (let i = 255; i >= 0; i--) {
      R = dbl(R);
      if ((d >> BigInt(i)) & 1n) R = addA(R, GX, GY);
    }
    if (R[2] === 0n) throw new Error('inf');
    const zi = pow(R[2], P - 2n), zi2 = md(zi * zi);
    return [md(R[0] * zi2), md(R[1] * zi2 * zi)];
  }

  // Пароль → скаляр (1…n−1) → JWK закрытого ключа и открытая точка
  async function deriveKey(pass, salt) {
    const base = await subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITER }, base, 384));
    const d = (toBig(bits) % (N - 1n)) + 1n;
    const pt = mulG(d);
    const x = b64u(fromBig(pt[0], 32)), y = b64u(fromBig(pt[1], 32));
    return { jwk: { kty: 'EC', crv: 'P-256', d: b64u(fromBig(d, 32)), x: x, y: y, ext: false }, pub: x + '.' + y };
  }
  const pubJwk = (s) => { const a = String(s).split('.'); return { kty: 'EC', crv: 'P-256', x: a[0], y: a[1], ext: true }; };

  // ---------- канал: топики, ключи ----------
  const K = { verify: null, encPub: null, obf: null, cmd: '', pres: '' };   // общее для всех клиентов
  const A = { sign: null, ecdh: null, pub: null, match: false };            // только после входа
  async function setupChannel(pub) {
    if (!pub || !pub.sig || !pub.enc) return false;
    K.verify = await subtle.importKey('jwk', pubJwk(pub.sig), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    K.encPub = await subtle.importKey('jwk', pubJwk(pub.enc), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    K.obf = await subtle.importKey('raw', await sha(enc.encode('caselab:cmd:1|' + pub.sig)), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const h = hex(await sha(enc.encode('caselab:topic:1|' + pub.sig + '|' + pub.enc)));
    const sfx = (DEV ? 'd' : '') + (DEV ? (Q.get('nettopic') || '').replace(/[^\w]/g, '').slice(0, 20) : '');
    K.cmd = 'caselab-s' + h.slice(0, 14) + sfx;
    K.pres = 'caselab-p' + h.slice(14, 28) + sfx;
    return true;
  }
  async function aesSeal(key, bytes) {
    const iv = rnd(12);
    return cat(iv, new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, bytes)));
  }
  async function aesOpen(key, bytes) {
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)));
  }

  // Команда: тело (JSON-строка) + подпись ECDSA, всё закрыто AES-GCM ключом канала
  async function packCmd(body, signed) {
    const b = JSON.stringify(body);
    const o = { b: b };
    if (signed) o.g = b64u(new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, A.sign, enc.encode(b))));
    return b64u(await aesSeal(K.obf, enc.encode(JSON.stringify(o))));
  }
  // → { body, signed } или null
  async function openCmd(msg) {
    try {
      const o = JSON.parse(dec.decode(await aesOpen(K.obf, unb64u(msg))));
      if (!o || typeof o.b !== 'string' || o.b.length > MAX) return null;
      const body = JSON.parse(o.b);
      if (!body || typeof body !== 'object' || body.v !== 1) return null;
      let ok = false;
      if (typeof o.g === 'string') ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, K.verify, unb64u(o.g), enc.encode(o.b));
      return { body: body, signed: ok };
    } catch (e) { return null; }
  }

  // Состояние клиента: свой эфемерный ключ на сессию, ECDH с открытым ключом админа → AES-GCM
  const E = { raw: null, key: null };
  async function presKey(bits, raw) {
    return subtle.importKey('raw', await sha(cat(new Uint8Array(bits), raw, enc.encode('caselab:pres:1'))), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async function sealPres(obj) {
    if (!E.key) {
      const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
      const raw = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
      E.key = await presKey(await subtle.deriveBits({ name: 'ECDH', public: K.encPub }, kp.privateKey, 256), raw);
      E.raw = raw;
    }
    return b64u(cat(E.raw, await aesSeal(E.key, enc.encode(JSON.stringify(obj)))));
  }
  // Длина base64url запечатанного сообщения для n байт JSON (65 эфем. ключ + 12 IV + 16 тег)
  const sealedLen = (n) => Math.ceil((65 + 12 + 16 + n) * 4 / 3);
  const ephCache = new Map();
  // → { o, eph } или null; eph — эфемерный ключ отправителя (одна сессия клиента)
  async function openPres(msg) {
    try {
      const bytes = unb64u(msg);
      if (bytes.length < 65 + 12 + 16) return null;
      const raw = bytes.slice(0, 65), id = b64u(raw);
      let key = ephCache.get(id);
      if (!key) {
        const pk = await subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
        key = await presKey(await subtle.deriveBits({ name: 'ECDH', public: pk }, A.ecdh, 256), raw);
        if (ephCache.size > 500) ephCache.clear();
        ephCache.set(id, key);
      }
      const o = JSON.parse(dec.decode(await aesOpen(key, bytes.slice(65))));
      return o && typeof o === 'object' && o.v === 1 ? { o: o, eph: id } : null;
    } catch (e) { return null; }
  }

  // Метка адресата: PBKDF2(pid). pid — 45 бит случайности, перебор по метке невыгоден
  const tagCache = new Map();
  async function tagOf(pid) {
    let t = tagCache.get(pid);
    if (t) return t;
    const base = await subtle.importKey('raw', enc.encode(pid), 'PBKDF2', false, ['deriveBits']);
    t = hex(new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT_TAG), iterations: ITER_TAG }, base, 64)));
    if (tagCache.size > MAX_PLAYERS * 2) tagCache.clear();
    tagCache.set(pid, t);
    return t;
  }
  const okTag = (t) => typeof t === 'string' && /^[0-9a-f]{16}$/.test(t);

  // ---------- ntfy.sh ----------
  const base = (topic) => 'https://ntfy.sh/' + topic;
  let skew = 0;
  const now = () => Date.now() + skew;
  // → HTTP-статус (200 — принято) или 0 (нет сети). 5xx и сетевые ошибки — до двух повторов
  function post(topic, msg, noCache, tries) {
    tries = tries || 0;
    const headers = noCache ? { 'Cache': 'no' } : {};
    let p;
    try { p = fetch(base(topic), { method: 'POST', body: msg, headers: headers, keepalive: msg.length < 60000, credentials: 'omit' }); } catch (e) { p = Promise.reject(e); }
    return p.then((r) => {
      if (r.status >= 500) throw new Error('retry');
      return r.status || 0;
    }).catch(() => {
      if (tries >= 2) return 0;
      return new Promise((res) => setTimeout(() => res(post(topic, msg, noCache, tries + 1)), 4000 * (tries + 1)));
    });
  }
  const okSt = (st) => st >= 200 && st < 300;
  // Подписка SSE с автоповтором и догрузкой пропущенного (since=время последнего сообщения)
  function subscribe(topic, since, onMsg, onState) {
    let es = null, last = 0, retry = 0, timer = 0, closed = false;
    function open() {
      timer = 0;
      if (closed || es) return;
      try { es = new EventSource(base(topic) + '/sse?since=' + (last ? String(last) : since)); } catch (e) { es = null; fail(); return; }
      es.onopen = (e) => {
        retry = 0;
        if (e && typeof e.data === 'string') { try { const d = JSON.parse(e.data); if (d && d.time > 0) skew = d.time * 1000 - Date.now(); } catch (err) { /* не JSON */ } }
        onState('on');
      };
      es.onmessage = (e) => {
        let d;
        try { d = JSON.parse(e.data); } catch (err) { return; }
        if (!d || d.event !== 'message' || typeof d.message !== 'string' || d.message.length > MAX * 2) return;
        if (d.time > last) last = d.time;
        onMsg(d.message, (Number(d.time) || 0) * 1000);
      };
      es.onerror = () => fail();
    }
    function fail() {
      if (es) { es.close(); es = null; }
      onState('err');
      if (closed || timer) return;
      retry = Math.min(retry + 1, 6);
      timer = setTimeout(open, 1000 * Math.pow(2, retry));
    }
    open();
    return {
      pause() { if (es) { es.close(); es = null; } clearTimeout(timer); timer = 0; },
      resume() { if (!es && !timer && !closed) { retry = 0; open(); } },
      close() { closed = true; this.pause(); },
    };
  }

  // ---------- клиент: приём команд ----------
  const C = {
    seen: new Set(), hist: [], star: {}, me: {}, done: new Set(), watch: 0, lastHb: 0, st: Date.now(),
    input: Date.now(), sub: null, state: 'off', dropTimer: 0, hideTimer: 0, tag: '', tagPid: '',
  };
  const pidOf = () => (G.S && G.S.pid) || '';
  async function myTag() {
    const p = pidOf();
    if (p !== C.tagPid) { C.tagPid = p; C.tag = p ? await tagOf(p) : ''; }
    return C.tag;
  }
  const fresh = (t, age) => typeof t === 'number' && now() - t <= age && t - now() <= SKEW;
  const okNonce = (n) => typeof n === 'string' && /^[\w-]{8,32}$/.test(n);
  const okScope = (c) => c === 'all' || (typeof c === 'string' && has.call(CASE_BY_ID, c));
  const okLuck = (v) => v === null || (typeof v === 'number' && v >= 0 && v <= 100);
  const okSkin = (s) => typeof s === 'string' && has.call(SKINS, s);
  // Отметка «выпал»: от исходного nonce команды и pid (pid в канал не попадает)
  async function markOf(n, pid) { return hex(await sha(enc.encode('caselab:x:1|' + n + '|' + pid))).slice(0, 20); }

  // Слой настроек (общий '*' или свой): scope → { v, t }; более старые команды не перебивают новые
  function putLuck(layer, scope, v, t, ref) {
    if (layer.all && layer.all.t > t) return;
    if (scope === 'all') Object.keys(layer).forEach((k) => { if (layer[k].t < t) delete layer[k]; });
    else if (layer[scope] && layer[scope].t > t) return;
    layer[scope] = { v: v, t: t, ref: ref };
  }
  function mergeLuck() {
    const out = {}, me = C.me, star = C.star;
    const put = (layer) => Object.keys(layer).forEach((k) => { if (layer[k].v != null) out[k] = layer[k].v; });
    if (!(me.all && me.all.v != null)) put(star);
    put(me);
    G.mix.r.l = out;
  }
  async function onCmd(msg, time) {
    const r = await openCmd(msg);
    if (!r) return;
    const b = r.body, pid = pidOf();
    if (!okNonce(b.n) || C.seen.has(b.n)) return;
    if (b.k === 'x') {                         // отметка «выпал»: без подписи, но h не вычислить без pid
      if (typeof b.h !== 'string' || !/^[0-9a-f]{20}$/.test(b.h)) return;
      C.seen.add(b.n);
      C.done.add(b.h);
      const f = G.mix.r.q, i = f.findIndex((e) => e.h === b.h);
      if (i >= 0) f.splice(i, 1);
      if (A.sign) adm.changed();
      return;
    }
    if (!r.signed || !fresh(b.t, HIST + 60e3)) return;
    C.seen.add(b.n);
    C.hist.push(b);
    if (C.hist.length > 600) C.hist.shift();
    if (A.sign) admCmd(b);
    const tag = await myTag();
    const mine = !!tag && b.p === tag;
    if (b.k === 'l' && (mine || b.p === '*') && okScope(b.c) && okLuck(b.L)) {
      putLuck(mine ? C.me : C.star, b.c, b.L, b.t);
      mergeLuck();
    } else if (b.k === 'f' && mine && okSkin(b.s) && (!b.c || has.call(CASE_BY_ID, b.c))) {
      const h = await markOf(okNonce(b.o) ? b.o : b.n, pid);
      const q = G.mix.r.q;
      if (!C.done.has(h) && !q.some((e) => e.h === h)) q.push({ s: b.s, c: b.c || '', t: b.t, h: h });
    } else if (b.k === 'a' && mine && fresh(b.t, 120e3) && okNonce(b.q)) {
      sendDetails(b.q);
    } else if (b.k === 'w' && fresh(b.t, 150e3)) {
      C.watch = now() + WATCH_TTL;
      if (now() - C.lastHb > 20e3) setTimeout(heartbeat, 300 + Math.random() * 3700);
    }
  }

  // ---------- клиент: состояние ----------
  const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  function snapshot() {
    const S = G.S, T = G.mix, d = T.drops[0];
    return {
      v: 1, k: 'hb', p: pidOf(), n: G.playerName(), a: (S.profile && S.profile.ava) || '', st: C.st,
      b: r2(S.coins), o: S.opened || 0, so: T.opens, sp: r2(T.spent), inv: S.inv.length,
      ld: d ? { s: d.s, c: d.c, t: d.t } : null,
      act: !document.hidden && Date.now() - C.input < 120e3 ? 1 : 0,
      lk: T.r.l, fq: T.r.q.length,
    };
  }
  async function heartbeat() {
    if (!K.encPub || !G.S || !pidOf()) return;
    C.lastHb = now();
    try { post(K.pres, await sealPres(snapshot())); } catch (e) { /* тихо */ }
  }
  // Подробности по запросу: инвентарь и последние дропы. Каждый кусок после шифрования ≤ SEAL_MAX
  // (у ntfy.sh сообщение длиннее 4 КБ становится вложением и до админа не дойдёт)
  async function sendDetails(q) {
    if (!G.S) return;
    const S = G.S, T = G.mix, pid = pidOf();
    const first = { dr: T.drops.slice(0, 25).map((x) => [x.s, x.c, x.t]), tot: r2(S.total), best: S.best ? [S.best.s, S.best.f] : null };
    const head = (i) => { const o = { v: 1, k: 'd', p: pid, q: q, i: 99, m: 99, inv: [] }; if (i === 0) Object.assign(o, first); return o; };
    const blen = (o) => enc.encode(JSON.stringify(o)).length;
    const parts = [];
    let cur = [], len = blen(head(0));
    S.inv.forEach((x) => {
      const it = [x.s, Math.round(x.f * 1e4) / 1e4];
      const l = enc.encode(JSON.stringify(it)).length + 1;
      if (cur.length && sealedLen(len + l) > SEAL_MAX) { parts.push(cur); cur = []; len = blen(head(parts.length)); }
      cur.push(it); len += l;
    });
    parts.push(cur);
    for (let i = 0; i < parts.length; i++) {
      const o = head(i);
      o.i = i; o.m = parts.length; o.inv = parts[i];
      try {
        const msg = await sealPres(o);
        if (msg.length <= SEAL_MAX + 8) await post(K.pres, msg);
      } catch (e) { /* тихо */ }
    }
  }
  // Назначенный дроп выпал: отметка в канал, чтобы после перезагрузки он не выпал второй раз
  async function onQ(e) {
    if (!e || !e.h) return;
    C.done.add(e.h);
    try { post(K.cmd, await packCmd({ v: 1, k: 'x', t: now(), n: b64u(rnd(9)), h: e.h }, false)); } catch (err) { /* тихо */ }
    heartbeat();
  }

  // ---------- клиент: запуск ----------
  let chain = Promise.resolve(), started = null;
  const watched = () => C.watch > now();
  const okPid = (p) => typeof p === 'string' && /^[a-z0-9]{6,16}$/.test(p);
  function start() {
    if (started) return started;
    started = (async function () {
      if (!subtle || typeof Live === 'undefined' || !Live.enabled || !G.S || !G.mix) return false;
      try { if (!(await setupChannel(PUB))) return false; await myTag(); } catch (e) { return false; }
      G.mix.onQ = (e) => { onQ(e); };
      G.mix.onDrop = () => {
        if (!watched() || C.dropTimer) return;
        C.dropTimer = setTimeout(() => { C.dropTimer = 0; if (now() - C.lastHb >= HB_OPEN) heartbeat(); }, 1500);
      };
      C.state = 'conn';
      C.sub = subscribe(K.cmd, '12h', (m, t) => { chain = chain.then(() => onCmd(m, t)).catch(noop); }, (s) => { C.state = s; adm.changed(); });
      const mark = () => { C.input = Date.now(); };
      document.addEventListener('pointerdown', mark, { passive: true, capture: true });
      document.addEventListener('keydown', mark, { passive: true, capture: true });
      document.addEventListener('visibilitychange', () => {
        clearTimeout(C.hideTimer);
        if (document.hidden) {
          if (watched() && now() - C.lastHb > 5e3) heartbeat();
          C.hideTimer = setTimeout(() => { if (C.sub) C.sub.pause(); adm.pause(); }, 60e3);
        } else {
          if (C.sub) C.sub.resume();
          adm.resume();
          if (watched()) heartbeat();
        }
      });
      setInterval(() => { if (!document.hidden && watched() && now() - C.lastHb >= HB_WATCH) heartbeat(); }, 15e3);
      setTimeout(heartbeat, 3000);
      return true;
    })().catch(() => false);
    return started;
  }

  // ---------- админ ----------
  const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);
  const adm = {
    players: new Map(), byTag: new Map(), jr: [], jn: new Set(), req: new Map(), renew: new Map(), asked: new Map(),
    fns: [], sub: null, drawT: 0, err: '',
    watching: false, beacon: 0, beat: BEACON, lastBeacon: 0, hbAt: 0, keep: 0, keepT: 0,
    changed() {
      if (adm.drawT) return;
      adm.drawT = setTimeout(() => { adm.drawT = 0; adm.fns.slice().forEach((f) => { try { f(); } catch (e) { /* тихо */ } }); }, 200);
    },
    pause() { if (adm.sub) adm.sub.pause(); clearTimeout(adm.beacon); adm.beacon = 0; },
    resume() { if (adm.sub) { adm.sub.resume(); if (A.sign && adm.watching) sendBeacon(); } },
  };
  function lum(m) {   // { scope: v } → проверенная копия
    const out = {};
    if (m && typeof m === 'object') Object.keys(m).forEach((k) => { if (okScope(k) && typeof m[k] === 'number' && m[k] >= 0 && m[k] <= 100) out[k] = m[k]; });
    return out;
  }
  // Журнал: строка на команду (o — её исходный nonce). Повтор (re) только продлевает срок;
  // если исходная команда уже ушла из истории ntfy, строка восстанавливается из повтора (ot — исходное время)
  function admCmd(b) {
    if ((b.k !== 'l' && b.k !== 'f') || adm.jn.has(b.n)) return;
    if (b.p !== '*' && !okTag(b.p)) return;
    adm.jn.add(b.n);
    const o = b.re && okNonce(b.o) ? b.o : b.n;
    if (b.re) {
      if ((adm.renew.get(o) || 0) < b.t) adm.renew.set(o, b.t);
      if (adm.jr.some((e) => e.o === o)) { adm.changed(); return; }
    }
    const t = b.re && typeof b.ot === 'number' && b.ot <= b.t ? b.ot : b.t;
    const e = { t: t, k: b.k, tg: b.p, v: b.k === 'l' ? b.L : null, scope: b.k === 'l' ? b.c : '', s: b.s || '', c: b.k === 'f' ? b.c || '' : '', self: false, h: '', o: o };
    let i = 0;
    while (i < adm.jr.length && adm.jr[i].t > e.t) i++;
    adm.jr.splice(i, 0, e);
    if (adm.jr.length > 1000) adm.jr.length = 1000;
    if (e.k === 'f') fillMark(e);
    adm.changed();
  }
  function fillMark(e) {
    const pid = adm.byTag.get(e.tg);
    if (e.h || !pid) return;
    markOf(e.o, pid).then((h) => { e.h = h; adm.changed(); }).catch(noop);
  }
  function localLog(k, v, scope, s, c) {
    adm.jr.unshift({ t: now(), k: k, tg: 'self', v: v, scope: scope || '', s: s || '', c: c || '', self: true, h: '', o: '' });
    adm.changed();
  }
  // Текущие слои настроек по журналу: tag | '*' → { scope: { v, t, ref } }
  function layers() {
    const out = new Map();
    for (let i = adm.jr.length - 1; i >= 0; i--) {
      const e = adm.jr[i];
      if (e.k !== 'l' || e.self) continue;
      let L = out.get(e.tg);
      if (!L) out.set(e.tg, (L = {}));
      putLuck(L, e.scope, e.v, e.t, e);
    }
    return out;
  }
  const sentAt = (e) => Math.max(e.t, adm.renew.get(e.o) || 0);
  async function onPres(msg, time) {
    const x = await openPres(msg);
    if (!x || !okPid(x.o.p)) return;
    const o = x.o;
    let r = adm.players.get(o.p);
    if (!r) {
      if (o.k !== 'hb') return;
      if (adm.players.size >= MAX_PLAYERS) {     // присланное не проверить — держим ограниченный список
        let old = null;
        adm.players.forEach((p) => { if (!old || p.t < old.t) old = p; });
        if (old) { adm.players.delete(old.pid); adm.byTag.delete(old.tag); }
      }
      r = { pid: o.p, t: 0, inv: null, drops: null, detAt: 0, eph: '', tag: '' };
      adm.players.set(o.p, r);
      tagOf(o.p).then((t) => {
        r.tag = t;
        if (adm.players.get(o.p) === r) adm.byTag.set(t, o.p);
        adm.jr.forEach((e) => { if (e.k === 'f' && e.tg === t) fillMark(e); });
        adm.changed();
      }).catch(noop);
    }
    if (o.k === 'hb') {
      const t = time || now();
      if (t < r.t) return;
      r.t = t; r.eph = x.eph; adm.hbAt = now();
      r.n = G.cleanName(o.n) || G.t('guest');
      r.a = G.AVATARS.indexOf(o.a) >= 0 ? o.a : '';
      r.st = num(o.st); r.b = num(o.b); r.o = num(o.o); r.so = num(o.so); r.sp = num(o.sp); r.ni = num(o.inv);
      r.ld = o.ld && okSkin(o.ld.s) ? { s: o.ld.s, c: has.call(CASE_BY_ID, o.ld.c) ? o.ld.c : '', t: num(o.ld.t) } : null;
      r.act = o.act === 1; r.lk = lum(o.lk); r.fq = num(o.fq);
    } else if (o.k === 'd') {
      const q = adm.req.get(o.q);
      // ответ — только из той же сессии клиента, что прислала последнее состояние
      if (!q || q.pid !== o.p || x.eph !== r.eph || !(o.m >= 1 && o.m <= 20) || !(o.i >= 0 && o.i < o.m)) return;
      q.parts[o.i] = Array.isArray(o.inv) ? o.inv : [];
      q.m = o.m;
      if (o.i === 0) {
        q.dr = Array.isArray(o.dr) ? o.dr : [];
        r.tot = num(o.tot);
        r.best = Array.isArray(o.best) && okSkin(o.best[0]) ? { s: o.best[0], f: num(o.best[1]) } : null;
      }
      if (Object.keys(q.parts).length < q.m) return;
      const inv = [];
      for (let i = 0; i < q.m; i++) (q.parts[i] || []).forEach((y) => { if (Array.isArray(y) && okSkin(y[0]) && y[1] >= 0 && y[1] <= 1) inv.push({ s: y[0], f: y[1] }); });
      r.inv = inv;
      r.drops = (q.dr || []).filter((y) => Array.isArray(y) && okSkin(y[0])).map((y) => ({ s: y[0], c: has.call(CASE_BY_ID, y[1]) ? y[1] : '', t: num(y[2]) }));
      r.detAt = now();
      adm.req.delete(o.q);
    }
    adm.changed();
  }
  // В журнал — только после того, как ntfy.sh принял команду
  async function sendCmd(body, noCache) {
    if (!A.sign || !K.cmd) return false;
    body.v = 1; body.t = now(); body.n = b64u(rnd(9));
    let st = 0;
    try { st = await post(K.cmd, await packCmd(body, true), noCache); } catch (e) { st = 0; }
    const ok = okSt(st);
    const err = ok ? '' : st === 429 ? 'quota' : 'net';
    if (err !== adm.err) { adm.err = err; adm.changed(); }
    if (ok && !noCache) admCmd(body);
    return ok;
  }
  // Маячок «админ смотрит»: только пока открыт раздел с живыми данными и вкладка видна.
  // Нет новых состояний с прошлого маячка — следующий реже (до 4 мин; клиенты ждут 5)
  function sendBeacon() {
    clearTimeout(adm.beacon); adm.beacon = 0;
    if (document.hidden || !adm.watching || !A.sign) return;
    adm.beat = adm.lastBeacon && adm.hbAt < adm.lastBeacon ? Math.min(BEACON_MAX, adm.beat * 2) : BEACON;
    adm.lastBeacon = now();
    sendCmd({ k: 'w' }, true);
    adm.beacon = setTimeout(sendBeacon, adm.beat);
  }
  function watch(on) {
    on = !!on;
    if (on === adm.watching) return;
    adm.watching = on;
    clearTimeout(adm.beacon); adm.beacon = 0;
    if (!on || !A.sign) return;
    const gap = now() - adm.lastBeacon;
    if (gap > 30e3) { adm.lastBeacon = 0; sendBeacon(); } else adm.beacon = setTimeout(sendBeacon, Math.max(1000, BEACON - gap));
  }
  // Админ в сети: настройки и назначенные дроп старше RENEW отправляются заново (ntfy хранит 12 ч)
  let renewing = false;
  async function keepAlive() {
    if (!A.sign || renewing || C.state !== 'on') return;
    renewing = true;
    try {
      const t0 = now();
      for (const pair of layers()) {
        const tg = pair[0], L = pair[1];
        const live = Object.keys(L).filter((k) => L[k].v != null);
        if (!live.some((k) => t0 - sentAt(L[k].ref) > RENEW)) continue;
        live.sort((a, b) => (a === 'all' ? -1 : b === 'all' ? 1 : 0));     // 'all' первым: он сбрасывает более старые покейсовые
        for (const k of live) {
          const e = L[k].ref;
          if (!(await sendCmd({ k: 'l', p: tg, L: e.v, c: k, o: e.o, ot: e.t, re: 1 }))) return;
        }
      }
      for (const e of adm.jr.slice()) {
        if (e.k !== 'f' || e.self || (e.h && C.done.has(e.h)) || t0 - e.t > 7 * 86400e3) continue;
        if (t0 - sentAt(e) > RENEW && !(await sendCmd({ k: 'f', p: e.tg, s: e.s, c: e.c, o: e.o, ot: e.t, re: 1 }))) return;
      }
    } finally { renewing = false; }
  }
  async function admStart() {
    await start();
    if (!K.cmd || !A.sign) return;
    C.hist.forEach(admCmd);
    if (!adm.sub) adm.sub = subscribe(K.pres, '12h', (m, t) => { onPres(m, t).catch(noop); }, () => adm.changed());
    clearInterval(adm.keep); clearTimeout(adm.keepT);
    adm.keep = setInterval(() => { keepAlive().catch(noop); }, 10 * 60e3);
    adm.keepT = setTimeout(() => { keepAlive().catch(noop); }, 30e3);
    if (adm.watching) { adm.lastBeacon = 0; sendBeacon(); }
  }
  // Пароль → ключи; match — открытые ключи совпали со встроенными (это и есть проверка пароля)
  async function login(pass, testOnly) {
    if (!subtle) throw new Error('crypto');
    const ks = await Promise.all([deriveKey(String(pass), SALT_SIG), deriveKey(String(pass), SALT_ENC)]);
    pass = null;
    const sign = await subtle.importKey('jwk', ks[0].jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const ecdh = await subtle.importKey('jwk', ks[1].jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    ks[0].jwk.d = ''; ks[1].jwk.d = '';
    A.pub = { sig: ks[0].pub, enc: ks[1].pub };
    const empty = !PUB.sig || !PUB.enc;
    A.match = !empty && PUB.sig === A.pub.sig && PUB.enc === A.pub.enc && (!testOnly || TEST);
    if (A.match) { A.sign = sign; A.ecdh = ecdh; admStart().catch(noop); }
    adm.changed();
    return { sig: A.pub.sig, enc: A.pub.enc, match: A.match, empty: empty };
  }
  function logout() {
    A.sign = A.ecdh = null; A.pub = null; A.match = false;
    clearTimeout(adm.beacon); clearInterval(adm.keep); clearTimeout(adm.keepT);
    adm.beacon = adm.keep = adm.keepT = 0; adm.watching = false; adm.lastBeacon = 0; adm.err = '';
    if (adm.sub) { adm.sub.close(); adm.sub = null; }
    adm.players.clear(); adm.byTag.clear(); adm.jr = []; adm.jn.clear(); adm.req.clear(); adm.renew.clear(); ephCache.clear();
  }

  // ---------- API панели ----------
  const isSelf = (t) => t === 'self' || (okPid(t) && t === pidOf());
  const copy = (r) => Object.assign({}, r, { on: now() - r.t < ONLINE, me: r.pid === pidOf() });
  function players() {
    return Array.from(adm.players.values()).filter((r) => r.t > 0).map(copy).sort((a, b) => b.t - a.t);
  }
  function player(pid) {
    const r = adm.players.get(pid);
    if (!r) return null;
    const asked = adm.asked.get(pid) || 0;
    if (A.sign && r.tag && now() - r.detAt > 60e3 && now() - asked > 15e3) {
      adm.asked.set(pid, now());
      const q = b64u(rnd(9));
      adm.req.set(q, { pid: pid, parts: {}, m: 1, dr: null });
      sendCmd({ k: 'a', p: r.tag, q: q }, true);
    }
    const out = copy(r);
    out.luck = luckOf(pid);
    out.info = luckInfo(pid);
    return out;
  }
  const tagFor = (t) => (t === '*' ? '*' : (adm.players.get(t) || {}).tag || '');
  // Настройка цели по журналу: lv — свои значения, exp — до какого времени живут в канале,
  // inh — значения «Все игроки», которые у этой цели тоже действуют
  function luckInfo(target) {
    if (isSelf(target)) return { lv: Object.assign({}, G.pref.lv), exp: {}, inh: {} };
    const out = { lv: {}, exp: {}, inh: {} }, all = layers();
    const L = all.get(tagFor(target)) || {};
    Object.keys(L).forEach((k) => { if (L[k].v != null) { out.lv[k] = L[k].v; out.exp[k] = sentAt(L[k].ref) + HIST; } });
    if (target !== '*' && out.lv.all == null) {
      const S = all.get('*') || {};
      Object.keys(S).forEach((k) => { if (S[k].v != null && out.lv[k] == null) { out.inh[k] = S[k].v; out.exp['*' + k] = sentAt(S[k].ref) + HIST; } });
    }
    return out;
  }
  const luckOf = (target) => luckInfo(target).lv;
  async function setLuck(target, value, scope) {
    scope = scope || 'all';
    if (!okScope(scope)) return false;
    const v = value == null ? null : Math.round(Math.max(0, Math.min(100, Number(value) || 0)) * 10) / 10;
    if (isSelf(target)) { G.setLv(scope, v); localLog('l', v, scope); return true; }
    if (target !== '*' && !okPid(target)) return false;
    const tg = target === '*' ? '*' : await tagOf(target);
    return sendCmd({ k: 'l', p: tg, L: v, c: scope });
  }
  async function forceDrop(pid, skinId, caseId) {
    caseId = caseId || '';
    if (!okSkin(skinId) || (caseId && (!has.call(CASE_BY_ID, caseId) || CASE_BY_ID[caseId].items.indexOf(skinId) < 0))) return false;
    if (isSelf(pid)) { const ok = G.queueOwn(skinId, caseId); if (ok) localLog('f', null, '', skinId, caseId); return ok; }
    if (!okPid(pid)) return false;
    return sendCmd({ k: 'f', p: await tagOf(pid), s: skinId, c: caseId });
  }
  function journal() {
    const cur = new Set();
    layers().forEach((L) => Object.keys(L).forEach((k) => { if (L[k].v != null) cur.add(L[k].ref); }));
    return adm.jr.map((e) => {
      const done = !!e.h && C.done.has(e.h);
      const live = !e.self && (e.k === 'l' ? cur.has(e) : !done);
      return {
        t: e.t, k: e.k, target: e.self ? 'self' : e.tg === '*' ? '*' : adm.byTag.get(e.tg) || '#' + e.tg.slice(0, 8),
        v: e.v, scope: e.scope, s: e.s, c: e.c, self: e.self, done: done, exp: live ? sentAt(e) + HIST : 0,
      };
    });
  }

  const api = {
    configured: () => !!(PUB.sig && PUB.enc),
    ready: () => !!(PUB.sig && PUB.enc && subtle && typeof Live !== 'undefined' && Live.enabled),
    test: TEST,
    start: start,
    login: (pass) => login(pass, false),
    loginTest: () => (TEST ? login(TEST_PASS, true) : Promise.reject(new Error('off'))),
    logout: logout,
    publicKeys: () => (A.pub ? { sig: A.pub.sig, enc: A.pub.enc } : null),
    watch: watch,
    online: () => players().filter((r) => r.on),
    players: players,
    player: player,
    luckOf: luckOf,
    luckInfo: luckInfo,
    setLuck: setLuck,
    forceDrop: forceDrop,
    journal: journal,
    lastError: () => adm.err,
    on: (fn) => { if (typeof fn === 'function') adm.fns.push(fn); return () => { adm.fns = adm.fns.filter((f) => f !== fn); }; },
    state: () => (K.cmd ? C.state : 'off'),
    pid: pidOf,
    HIST: HIST,
  };
  // Только локально: внутренности для node-тестов и проверок в браузере
  if (DEV) api._t = { deriveKey: deriveKey, mulG: mulG, setupChannel: setupChannel, packCmd: packCmd, openCmd: openCmd, sealPres: sealPres, openPres: openPres, onCmd: onCmd, onPres: onPres, mergeLuck: mergeLuck, tagOf: tagOf, markOf: markOf, keepAlive: keepAlive, sendDetails: sendDetails, K: K, A: A, C: C, adm: adm, b64u: b64u, unb64u: unb64u, PUB: PUB };
  return api;
})();
