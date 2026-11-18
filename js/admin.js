'use strict';

// Админ-панель владельца игры.
// Открыть: 5 быстрых нажатий на логотип или адрес страницы с #admin в конце. Нужен пароль.
// В коде хранится только SHA-256 пароля. После входа устройство запоминается.
// Важно: это защита от обычных игроков, а не от взлома — код браузерной игры открыт,
// поэтому панель меняет только сохранение на этом устройстве и никому другому не вредит.
// Сменить пароль: в консоли браузера выполните Admin.hash('новый пароль')
// и вставьте результат в ADMIN_HASH ниже.
const Admin = (function () {
  const ADMIN_LOGIN = 'mana';
  const ADMIN_HASH = '63e92242cfbd94394b33b63c796529a7d1be075f425cacebf96c779e69d3c33d';
  const KEY = 'caselab_admin';
  const A = UI.actions, COIN = UI.COIN;

  // ---------- SHA-256 ----------
  const sha256 = (function () {
    const K = [], H0 = [];
    const frac = (x) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
    for (let n = 2, c = 0; c < 64; n++) {
      let prime = true;
      for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
      if (!prime) continue;
      if (c < 8) H0[c] = frac(Math.sqrt(n));
      K[c++] = frac(Math.cbrt(n));
    }
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    return function (str) {
      const bytes = Array.from(new TextEncoder().encode(str));
      const bits = bytes.length * 8;
      bytes.push(0x80);
      while (bytes.length % 64 !== 56) bytes.push(0);
      bytes.push(0, 0, 0, 0, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255);
      const h = H0.slice(), w = new Array(64);
      for (let o = 0; o < bytes.length; o += 64) {
        for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
        for (let i = 16; i < 64; i++) {
          const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
        for (let i = 0; i < 64; i++) {
          const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
          const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
          k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
        h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + k) | 0;
      }
      return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
    };
  })();

  // ---------- Вход ----------
  const store = {
    get: () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set: (v) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
  };
  let session = false;          // вход без запоминания (если localStorage недоступен)
  let fails = 0, lockUntil = 0;
  const unlocked = () => session || store.get() === ADMIN_HASH;

  function open() {
    if (UI.isSpinning()) return;
    if (unlocked()) UI.showScreen('admin'); else login();
  }

  // Проверка логина и пароля (общая для окна входа и регистрации под ником админа).
  // После неверной попытки — пауза 1.5 с, после пяти — минута.
  function check(loginName, pass) {
    const now = Date.now();
    if (now < lockUntil) return false;
    const ok = String(loginName || '').trim().toLowerCase() === ADMIN_LOGIN && sha256(String(pass || '')) === ADMIN_HASH;
    if (ok) fails = 0;
    else { fails++; lockUntil = now + (fails >= 5 ? 60e3 : 1500); }
    return ok;
  }
  function unlock() { session = true; store.set(ADMIN_HASH); }
  const waitLeft = () => Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));

  function login(msg) {
    UI.modal('<h3 class="m-title">' + UI.ic('lock') + ' Вход для администратора</h3>' +
      '<input id="adm-login" class="adm-pass" type="text" autocomplete="username" placeholder="Логин" value="' + ADMIN_LOGIN + '">' +
      '<input id="adm-pass" class="adm-pass" type="password" autocomplete="current-password" placeholder="Пароль">' +
      (msg ? '<p class="hint adm-err">' + msg + '</p>' : '') +
      '<div class="m-btns row"><button class="btn" data-act="close">Отмена</button>' +
      '<button class="btn primary" data-act="adm-login">Войти</button></div>');
    const inp = document.getElementById('adm-pass');
    inp.focus();
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') A['adm-login'](); });
  }

  A['adm-login'] = function () {
    const inp = document.getElementById('adm-pass'), lg = document.getElementById('adm-login');
    if (!inp || !lg) return;
    if (waitLeft()) { login('Слишком много попыток. Подождите ' + waitLeft() + ' с.'); return; }
    if (check(lg.value, inp.value)) {
      unlock();
      // админ без профиля сразу получает свой ник
      if (!G.S.profile.name) { G.S.profile = { name: ADMIN_LOGIN, ava: '👑' }; G.save(true); UI.setProfileBadge(); }
      UI.closeModal(true);
      UI.showScreen('admin');
    } else login('Неверный логин или пароль');
  };

  // ---------- Панель ----------
  function ev(c) {
    // средняя цена продажи предмета из кейса с учётом удачи, износа и торговца
    const w = G.caseWeights(c);
    let tw = 0, sum = 0;
    c.items.forEach((id, i) => { tw += w[i]; sum += w[i] * SKINS[id].value; });
    return sum / tw * WEAR_EV * G.sellMult();
  }

  const last = { skin: null, wear: 'ft', n: 1 };   // выбор в «Выдать предмет» сохраняется между действиями

  // Панель — отдельный экран (вкладка ⚙ видна только после входа администратора)
  function panel() {
    const root = document.getElementById('adm-root');
    if (!root) return;
    if (!unlocked()) { root.innerHTML = ''; return; }
    const S = G.S;
    const skins = SKIN_LIST.map((s) => '<option value="' + s.id + '"' + (s.id === last.skin ? ' selected' : '') + '>' + (G.isStar(s.id) ? '★ ' : '') + G.skinName(s.id) + ' | ' + G.finishName(s.id) + ' · ' + G.fmt(s.value) + '</option>').join('');
    const wears = WEARS.map((w) => '<option value="' + w.id + '"' + (w.id === last.wear ? ' selected' : '') + '>' + G.t('wear_' + w.id) + '</option>').join('');
    const rows = CASES.map((c) => {
      const e = ev(c);
      return '<tr><td>' + G.nm(c.name) + '</td><td>' + G.fmtP(c.price) + '</td><td>' + G.fmt(e) + '</td><td>' + (e / c.price * 100).toFixed(1) + '%</td></tr>';
    }).join('');
    // Шансы выпадения: апгрейдер и кейсы (все или выбранный)
    const upBtn = (v, label) => '<button class="btn mini' + (G.odds.up === v ? ' primary' : '') + '" data-act="adm-odds-up" data-id="' + v + '">' + label.replace('×', '<span class="x">×</span>') + '</button>';
    const caseKey = oddsCase;
    const curCase = G.odds.cases[caseKey] != null ? G.odds.cases[caseKey] : (caseKey === 'all' ? 1 : null);
    const caseBtn = (v) => '<button class="btn mini' + (curCase === v ? ' primary' : '') + '" data-act="adm-odds-case" data-id="' + v + '"><span class="x">×</span>' + v + '</button>';
    const caseOpts = '<option value="all"' + (caseKey === 'all' ? ' selected' : '') + '>Все кейсы</option>' +
      CASES.map((c) => '<option value="' + c.id + '"' + (c.id === caseKey ? ' selected' : '') + '>' + G.nm(c.name) + '</option>').join('');
    const overrides = Object.keys(G.odds.cases).map((k) => (k === 'all' ? 'все кейсы' : G.nm(CASE_BY_ID[k] ? CASE_BY_ID[k].name : { ru: k })) + ' ×' + G.odds.cases[k]);

    root.innerHTML = '<div class="adm panel">' +
      '<div class="adm-h"><h3 class="m-title">' + UI.ic('gear') + 'Админ-панель</h3><button class="btn mini" data-act="adm-logout">' + UI.ic('logout') + 'Выйти</button></div>' +

      '<section><h4>Баланс: ' + COIN + G.fmt(S.coins) + '</h4><div class="adm-row">' +
      [100, 1000, 10000, 100000].map((v) => '<button class="btn mini" data-act="adm-coins" data-id="' + v + '">+' + G.fmtInt(v) + '</button>').join('') +
      '<input id="adm-coins" type="number" min="0" step="0.01" placeholder="Сумма"><button class="btn mini primary" data-act="adm-setcoins">Установить</button></div></section>' +

      '<section><h4>Выдать предмет</h4><div class="adm-row">' +
      '<select id="adm-skin">' + skins + '</select><select id="adm-wear">' + wears + '</select>' +
      '<input id="adm-n" type="number" min="1" max="50" value="' + last.n + '" title="Количество">' +
      '<button class="btn mini primary" data-act="adm-give">Выдать</button></div>' +
      '<div class="adm-row"><button class="btn mini" data-act="adm-give-rand" data-id="star">Случайный нож/перчатки</button>' +
      '<button class="btn mini" data-act="adm-give-rand" data-id="10">10 случайных предметов</button></div></section>' +

      '<section><h4>Прогресс</h4><div class="adm-row">' +
      '<button class="btn mini" data-act="adm-maxup">Прокачка на максимум</button>' +
      '<button class="btn mini" data-act="adm-resetup">Сбросить прокачку</button>' +
      '<button class="btn mini" data-act="adm-collection">Открыть всю коллекцию</button>' +
      '<button class="btn mini danger" data-act="adm-clearinv">Очистить инвентарь</button></div></section>' +

      '<section><h4>Таймеры и награды</h4><div class="adm-row">' +
      '<button class="btn mini" data-act="adm-timers">Сбросить все таймеры</button>' +
      '<button class="btn mini" data-act="adm-quests">Выполнить задания дня</button></div></section>' +

      '<section><h4>Шансы выпадения (только на этом устройстве)</h4>' +
      '<div class="adm-sub">Апгрейдер — множитель шанса победы' + (G.odds.up !== 1 ? ' · сейчас ' + (G.odds.up >= G.ODDS_WIN ? '100% (скрыто)' : '×' + G.odds.up) : '') + '</div>' +
      '<div class="adm-row">' + upBtn(0.25, '×0.25') + upBtn(0.5, '×0.5') + upBtn(1, '×1 (обычно)') + upBtn(1.5, '×1.5') + upBtn(2, '×2') + upBtn(3, '×3') + upBtn(G.ODDS_WIN, '100% (скрыто)') + '</div>' +
      '<div class="adm-sub">Кейсы — шанс предметов дороже кейса</div>' +
      '<div class="adm-row"><select id="adm-odds-case">' + caseOpts + '</select>' +
      [0.1, 0.5, 1, 2, 5, 10, 50].map(caseBtn).join('') + '</div>' +
      '<div class="adm-row"><button class="btn mini" data-act="adm-odds-reset">Сбросить все шансы</button>' +
      '<span class="adm-note">' + (overrides.length ? 'Изменено: ' + overrides.join(', ') : 'Все шансы обычные') + '</span></div>' +
      '<p class="adm-note">Множители ×0.25…×3 видны на кольце апгрейда, множители кейсов — в шансах на странице кейса. ' +
      'Режим «100% (скрыто)» на кольце не виден: показывается обычный шанс, а апгрейд всегда удачный.</p></section>' +

      '<section><h4>Экономика кейсов (сейчас)</h4><div class="adm-table"><table><tr><th>Кейс</th><th>Цена</th><th>Средний дроп</th><th>Отдача</th></tr>' + rows + '</table></div></section>' +

      '<section><h4>Сохранение</h4><div class="adm-row">' +
      '<button class="btn mini" data-act="adm-export">Экспорт</button>' +
      '<button class="btn mini" data-act="adm-import">Импорт из поля</button></div>' +
      '<textarea id="adm-save" rows="3" placeholder="Сюда выгружается сохранение; вставьте JSON и нажмите «Импорт»"></textarea></section>' +
      '</div>';
  }

  Screens.reg('admin', { render: panel });

  function done(msg) {
    G.save(true);
    UI.renderFeed();
    panel();
    UI.refresh();
    if (msg) UI.toast(msg, 'good');
  }

  A['adm-logout'] = function () {
    session = false; store.set(null);
    UI.showScreen('cases');
    UI.toast('Вы вышли из админ-панели');
  };

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
    G.addInst(id, G.rollFloat(wearId), 'gift');
    return true;
  }
  A['adm-give'] = function () {
    if (!unlocked()) return;
    const id = document.getElementById('adm-skin').value;
    const wear = document.getElementById('adm-wear').value;
    const n = Math.max(1, Math.min(50, Math.floor(Number(document.getElementById('adm-n').value) || 1)));
    if (!SKINS[id]) return;
    last.skin = id; last.wear = wear; last.n = n;
    let k = 0;
    while (k < n && giveOne(id, wear)) k++;
    done(k ? 'Выдано: ' + k + ' шт.' : 'Инвентарь полон');
  };
  A['adm-give-rand'] = function (mode) {
    if (!unlocked()) return;
    const pool = mode === 'star' ? SKIN_LIST.filter((s) => G.isStar(s.id)) : SKIN_LIST;
    const n = mode === 'star' ? 1 : 10;
    let k = 0;
    while (k < n && giveOne(pool[Math.floor(Math.random() * pool.length)].id, null)) k++;
    done(k ? 'Выдано: ' + k + ' шт.' : 'Инвентарь полон');
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

  // ---------- Шансы ----------
  let oddsCase = 'all';
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'adm-odds-case') return;
    oddsCase = e.target.value;
    panel();
  });
  function oddsChanged(msg) {
    G.saveOdds();
    panel();
    UI.toast(msg, 'good');
  }
  A['adm-odds-up'] = function (v) {
    if (!unlocked()) return;
    G.odds.up = Number(v) || 1;
    oddsChanged(G.odds.up >= G.ODDS_WIN ? 'Апгрейд: 100% (скрыто)' : 'Апгрейд: шанс ×' + G.odds.up);
  };
  A['adm-odds-case'] = function (v) {
    if (!unlocked()) return;
    v = Number(v) || 1;
    if (oddsCase !== 'all' && v === 1) delete G.odds.cases[oddsCase];
    else if (oddsCase === 'all' && v === 1) delete G.odds.cases.all;
    else G.odds.cases[oddsCase] = v;
    const name = oddsCase === 'all' ? 'Все кейсы' : G.nm(CASE_BY_ID[oddsCase].name);
    oddsChanged(name + ': дорогие ×' + v);
  };
  A['adm-odds-reset'] = function () {
    if (!unlocked()) return;
    G.odds.up = 1; G.odds.cases = {};
    oddsChanged('Шансы сброшены');
  };

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

  return { open: open, hash: sha256, check: check, unlock: unlock, unlocked: unlocked, waitLeft: waitLeft, LOGIN: ADMIN_LOGIN };
})();
