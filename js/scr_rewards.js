'use strict';

// Экран «Награды»: ежедневный бонус (серия 7 дней), призы по таймеру (час / день / неделя)
// и три задания дня. Счётчики для условий ведёт G.track (core.js).
const Rewards = (function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;

  // ================= Ежедневный бонус =================
  const DAILY = [5, 8, 12, 16, 22, 30, 40];
  const dailyReady = () => Date.now() - G.S.daily.last >= G.C.DAY;
  function dailyStreak() {
    const d = G.S.daily;
    return d.last && Date.now() - d.last < 2 * G.C.DAY ? Math.min(7, d.streak + 1) : 1;
  }
  const dailyReward = (st) => round2(DAILY[st - 1] + G.income() * 60);

  function renderDays(ready) {
    const cur = ready ? dailyStreak() : Math.max(1, G.S.daily.streak);
    const doneTo = ready ? cur - 1 : cur;
    $('#rw-days').innerHTML = DAILY.map((v, i) => {
      const n = i + 1;
      const cls = n <= doneTo ? ' done' : n === cur ? ' cur' : '';
      return '<div class="rw-dd' + cls + (n === 7 ? ' last' : '') + '"><small>' + t('rw_dayn', { d: n }) + '</small><b>' + COIN + v + '</b></div>';
    }).join('');
  }

  // ================= Призы по таймеру =================
  // Приз зависит только от номера периода, поэтому не меняется при перезапуске игры.
  const PRIZES = {
    h: { min: 0.3, max: 2.5, tier: 'ft', need: 0 },
    d: { min: 3, max: 15, tier: 'mw', need: 10 },
    w: { min: 25, max: 120, tier: 'fn', need: 70 },
  };
  const KINDS = ['h', 'd', 'w'];
  const UNITS = { h: [2, 3], d: [1, 2, 3], w: [0, 1, 2, 3] }; // какие части таймера показывать
  const pools = {};

  function pool(k) {
    if (!pools[k]) {
      const c = PRIZES[k];
      pools[k] = SKIN_LIST.filter((s) => s.value >= c.min && s.value <= c.max && !WEAPONS[s.w].star);
    }
    return pools[k];
  }

  function prize(k, idx) {
    const list = pool(k);
    const s = list[Math.floor(hash01('rw:' + k + ':' + idx) * list.length)];
    const w = WEARS.filter((x) => x.id === PRIZES[k].tier)[0];
    const f = Math.round((w.min + hash01('rwf:' + k + ':' + idx) * (w.max - w.min - 0.0001)) * 10000) / 10000;
    return { s: s.id, f: f };
  }

  const progress = (k) => (k === 'd' ? G.S.day.o : k === 'w' ? G.S.week.o : 0);
  const condMet = (k) => progress(k) >= PRIZES[k].need;
  const claimed = (k, p) => G.S.rw[k] === p[k];

  const pad = (n) => (n < 10 ? '0' + n : String(n));
  function cdParts(ms) {
    let s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60);
    return [d, h, m, s - m * 60];
  }
  const CD_LABELS = ['t_d', 't_h', 't_m', 't_s'];
  function cdHTML(k) {
    const p = cdParts(G.periodEnd(k) - Date.now());
    return UNITS[k].map((i) => '<span><b>' + (i ? pad(p[i]) : p[i]) + '</b><small>' + t(CD_LABELS[i]) + '</small></span>').join('');
  }
  function updateCd(el) {
    const k = el.getAttribute('data-k');
    const p = cdParts(G.periodEnd(k) - Date.now());
    const bs = el.querySelectorAll('b');
    UNITS[k].forEach((i, j) => { if (bs[j]) UI.setText(bs[j], i ? pad(p[i]) : String(p[i])); });
  }

  function timedCard(k, p) {
    const pz = prize(k, p[k]);
    const sk = SKINS[pz.s];
    const got = claimed(k, p);
    const need = PRIZES[k].need;
    const prog = Math.min(progress(k), need);
    const cond = need
      ? '<div class="rw-cond"><span>' + t('rw_cond_open', { a: prog, b: need }) + '</span>' +
        '<div class="bar"><div class="bar-fill" style="width:' + (prog / need * 100) + '%"></div></div></div>'
      : '<div class="rw-cond"><span>' + t('rw_cond_none') + '</span></div>';
    const btn = got ? '<button class="btn" disabled>' + UI.ic('check') + t('rw_claimed') + '</button>'
      : condMet(k) ? '<button class="btn primary" data-act="rw-claim" data-id="' + k + '">' + t('rw_claim') + '</button>'
        : '<button class="btn" disabled>' + t('rw_locked') + '</button>';
    return '<div class="rw-card r' + sk.r + (got ? ' got' : '') + '" id="rw-' + k + '">' +
      '<h3>' + t('rw_' + k) + '</h3>' +
      '<div class="rw-art">' + Art.item(pz.s, pz.f) + (got ? '<span class="rw-stamp">' + t('rw_claimed') + '</span>' : '') + '</div>' +
      '<div class="rw-name">' + (G.isStar(pz.s) ? '★ ' : '') + G.skinName(pz.s) + '<span>' + G.finishName(pz.s) + ' · ' + UI.wearShort(pz.f) + '</span></div>' +
      '<div class="rw-price">' + COIN + G.fmt(G.sellPrice(pz)) + '</div>' +
      '<div class="rw-lbl">' + t(got ? 'rw_next_in' : 'rw_ends_in') + '</div>' +
      '<div class="cd" data-k="' + k + '">' + cdHTML(k) + '</div>' +
      cond + btn + '</div>';
  }

  // ================= Задания дня =================
  const QUESTS = [
    { id: 'o5', k: 'o', n: 5, r: 6 },
    { id: 'o15', k: 'o', n: 15, r: 15 },
    { id: 'u3', k: 'u', n: 3, r: 8 },
    { id: 'uw1', k: 'uw', n: 1, r: 10 },
    { id: 'c300', k: 'c', n: 300, r: 6 },
    { id: 'c1000', k: 'c', n: 1000, r: 15 },
    { id: 's25', k: 's', n: 25, r: 8 },
    { id: 'r3', k: 'r', n: 1, r: 12 },
  ];
  const Q_ICON = { o: 'cases', u: 'upgrade', uw: 'target', c: 'tap', s: 'tag', r: 'gem' };
  let qCache = { d: null, list: [] };

  // Три задания разных типов, одни и те же весь день
  function todayQuests(day) {
    if (qCache.d === day) return qCache.list;
    const order = QUESTS.map((q) => ({ q: q, h: hash01('q:' + day + ':' + q.id) })).sort((a, b) => a.h - b.h);
    const list = [], kinds = {};
    order.forEach((x) => { if (list.length < 3 && !kinds[x.q.k]) { kinds[x.q.k] = 1; list.push(x.q); } });
    qCache = { d: day, list: list };
    return list;
  }

  function qProgress(q) {
    const D = G.S.day;
    if (q.k === 'r') return D.r >= 3 ? 1 : 0;
    return Math.min(q.n, D[q.k] || 0);
  }
  const qDone = (q) => qProgress(q) >= q.n;
  const qClaimed = (q) => G.S.day.q.indexOf(q.id) >= 0;

  function questRow(q) {
    const pr = qProgress(q), done = pr >= q.n, got = qClaimed(q);
    const txt = (q.k === 's' ? G.fmt(pr) : G.fmtInt(pr)) + ' / ' + q.n;
    const btn = got ? '<button class="btn" disabled>' + UI.ic('check') + t('rw_claimed') + '</button>'
      : '<button class="btn' + (done ? ' primary' : '') + '" data-act="q-claim" data-id="' + q.id + '"' + (done ? '' : ' disabled') + '>+' + COIN + G.fmtP(q.r) + '</button>';
    return '<div class="q-row' + (done ? ' done' : '') + (got ? ' got' : '') + '">' +
      '<div class="q-ico">' + UI.ic(Q_ICON[q.k]) + '</div>' +
      '<div class="q-info"><b>' + t('q_' + q.id) + '</b>' +
      '<div class="q-prog"><div class="bar"><div class="bar-fill" style="width:' + (pr / q.n * 100) + '%"></div></div><span>' + txt + '</span></div></div>' +
      btn + '</div>';
  }

  // ================= Отрисовка =================
  let sigD = '', sigT = '', sigQ = '';

  function render() { sigD = sigT = sigQ = ''; tick(); }

  function tick() {
    const p = G.rollPeriods();
    const S = G.S, now = Date.now();

    const dr = dailyReady();
    const sd = [dr, S.daily.streak, S.daily.last].join();
    if (sd !== sigD) { sigD = sd; renderDays(dr); }
    UI.setText($('#daily-sub'), t('daily_sub', { d: dr ? dailyStreak() : Math.max(1, S.daily.streak) }));
    const db = $('#btn-daily');
    UI.setHTML(db, dr ? t('take_btn') + ' +' + COIN + G.fmt(dailyReward(dailyStreak())) : t('wait', { t: G.fmtTime(S.daily.last + G.C.DAY - now) }));
    db.disabled = !dr;

    const st = [p.h, p.d, p.w, S.rw.h, S.rw.d, S.rw.w, Math.min(S.day.o, PRIZES.d.need), Math.min(S.week.o, PRIZES.w.need), S.up.sell].join();
    if (st !== sigT) { sigT = st; $('#rw-timed').innerHTML = KINDS.map((k) => timedCard(k, p)).join(''); }
    UI.$$('#rw-timed .cd').forEach(updateCd);

    const qs = todayQuests(p.d);
    const sq = [p.d, S.day.o, S.day.u, S.day.uw, S.day.c, S.day.s, S.day.r, S.day.q.join('|')].join();
    if (sq !== sigQ) { sigQ = sq; $('#rw-quests').innerHTML = qs.map(questRow).join(''); }
    UI.setText($('#rw-q-reset'), t('rw_q_reset', { t: G.fmtTime(G.periodEnd('d') - now) }));
  }

  // Красная точка на кнопке «Награды»: что-то можно забрать
  function dot() {
    const p = G.rollPeriods();
    if (dailyReady()) return true;
    if (KINDS.some((k) => !claimed(k, p) && condMet(k))) return true;
    return todayQuests(p.d).some((q) => qDone(q) && !qClaimed(q));
  }

  Screens.reg('rewards', { render: render, tick: tick, dot: dot });

  // ================= Действия =================
  A['daily'] = function () {
    if (!dailyReady()) return;
    const st = dailyStreak();
    const v = dailyReward(st);
    G.S.daily = { last: Date.now(), streak: st };
    G.addCoins(v);
    Sfx.coin();
    UI.toast(t('daily_got', { d: st, v: G.fmt(v) }), 'good');
    G.save(true);
    UI.refresh();
  };

  A['rw-claim'] = function (k) {
    const p = G.rollPeriods();
    if (!PRIZES[k] || claimed(k, p)) return;
    if (!condMet(k)) { UI.toast(t('rw_locked')); return; }
    if (G.invFull(1)) { UI.toast(t('inv_full', { n: INVENTORY_MAX }), 'bad'); Sfx.error(); return; }
    const pz = prize(k, p[k]);
    const sk = SKINS[pz.s];
    const card = $('#rw-' + k);
    const rect = card ? card.getBoundingClientRect() : null;
    G.S.rw[k] = p[k];
    const res = G.addInst(pz.s, pz.f, 'gift');
    G.save(true);
    UI.renderFeed();
    Sfx.win(Math.min(5, sk.r));
    if (rect) UI.burst(rect.left + rect.width / 2, rect.top + rect.height * 0.3, RARITIES[sk.r].color, 26);
    UI.modal('<h3 class="m-title">' + t('rw_got') + '</h3>' +
      '<div class="drop-one r' + sk.r + '">' + (res.isNew ? '<span class="new-badge">' + t('new_item') + '</span>' : '') +
      '<div class="rays"></div><div class="drop-art">' + Art.item(pz.s, pz.f) + '</div></div>' +
      '<div class="drop-rar r' + sk.r + '">' + t('rar_' + RARITIES[sk.r].id) + '</div>' +
      '<div class="drop-name">' + (G.isStar(pz.s) ? '★ ' : '') + G.skinName(pz.s) + ' | ' + G.finishName(pz.s) + '</div>' +
      '<div class="drop-wear">' + UI.wearShort(pz.f) + ' · ' + COIN + G.fmt(G.sellPrice(res.inst)) + '</div>' +
      (res.isNew ? '<p class="hint">' + t('new_skin_bonus') + '</p>' : '') +
      '<div class="m-btns"><button class="btn primary big" data-act="close">' + t('take') + '</button></div>');
    tick();
  };

  A['q-claim'] = function (id) {
    const p = G.rollPeriods();
    const q = todayQuests(p.d).filter((x) => x.id === id)[0];
    if (!q || !qDone(q) || qClaimed(q)) return;
    G.S.day.q.push(q.id);
    G.addCoins(q.r);
    Sfx.coin();
    UI.toast(t('q_got', { v: G.fmt(q.r) }), 'good');
    G.save(false);
    tick();
    UI.refresh();
  };

  return { dailyReady: dailyReady };
})();
