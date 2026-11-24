'use strict';

// Достижения (39 штук) с наградами и список для профиля. Раунд 7 — агент ach (tools/plans/R7_SPEC.md).
// Прогресс — по событиям шины (G.on) и по текущему состоянию сохранения. Уже сделанное старым игроком
// засчитывается при первом запуске тихо, одной сводкой (монеты и билеты — да, опыт — нет: его уже выдал XP по статистике).
// Получение: короткий тост «Достижение: …» с наградой (ждёт конца прокрутки кейса/апгрейда), событие G.emit('ach', { id }).
// Награда выдаётся в момент показа; до показа id лежит в s.p (переживает перезагрузку — награда не теряется).
// Состояние — G.ext('ach'): { m: 1 — первый запуск обработан, d: { id: время получения }, p: [ожидают показа],
//   n: { sold — продано предметов, sum — продано на сумму, ctr — контракты, wh — колесо, q — задания, low — апгрейд < 5 %, st — лучшая серия } }.
// Публичное: ACH.render(el) — сетка карточек для профиля (#prof-ach), ACH.stats() → { done, total }, ACH.list().

Object.assign(I18N.ru, {
  ach_title: 'Достижения', ach_toast: 'Достижение: {n}', ach_got: 'Получено', ach_sum: 'Засчитано достижений: {n}',
  ach_sum_more: 'Новых достижений: {n}', ach_coins: '+{v} монет', ach_xp: '+{v} XP', ach_tk: 'билет «{c}»', ach_tks: '{n} билета «{c}»',
  ach_g_cases: 'Кейсы', ach_g_drop: 'Дроп', ach_g_up: 'Апгрейды', ach_g_col: 'Коллекция', ach_g_trade: 'Торговля',
  ach_g_farm: 'Фарм', ach_g_play: 'Игра', ach_g_lv: 'Уровень',
  ach_open1: 'Первый шаг', ach_open1_d: 'Открой первый кейс',
  ach_open10: 'Разогрев', ach_open10_d: 'Открой 10 кейсов',
  ach_open100: 'Завсегдатай', ach_open100_d: 'Открой 100 кейсов',
  ach_open1000: 'Тысячник', ach_open1000_d: 'Открой 1 000 кейсов',
  ach_knife: 'Холодная сталь', ach_knife_d: 'Выбей нож',
  ach_gloves: 'Без отпечатков', ach_gloves_d: 'Выбей перчатки',
  ach_r3: 'Эпично', ach_r3_d: 'Получи эпический предмет',
  ach_r4: 'Легенда', ach_r4_d: 'Получи легендарный предмет',
  ach_r5: 'Миф', ach_r5_d: 'Получи мифический предмет',
  ach_r7: 'Хранитель', ach_r7_d: 'Получи реликвию',
  ach_r8: 'Артефакт', ach_r8_d: 'Получи артефакт',
  ach_up1: 'Риск', ach_up1_d: 'Сделай первый апгрейд',
  ach_upw10: 'Рука набита', ach_upw10_d: '10 удачных апгрейдов',
  ach_upw100: 'Мастер апгрейда', ach_upw100_d: '100 удачных апгрейдов',
  ach_uplow: 'Один из двадцати', ach_uplow_d: 'Удачный апгрейд с шансом ниже 5 %',
  ach_col10: 'Коллекционер', ach_col10_d: 'Собери 10 предметов коллекции',
  ach_col100: 'Собиратель', ach_col100_d: 'Собери 100 предметов коллекции',
  ach_col500: 'Музей', ach_col500_d: 'Собери 500 предметов коллекции',
  ach_sell1: 'Первая сделка', ach_sell1_d: 'Продай предмет',
  ach_sell100: 'Перекупщик', ach_sell100_d: 'Продай 100 предметов',
  ach_sellsum: 'Оборот', ach_sellsum_d: 'Продай предметов на 100 000',
  ach_worth: 'Запас', ach_worth_d: 'Инвентарь дороже 10 000',
  ach_worth2: 'Состояние', ach_worth2_d: 'Инвентарь дороже 1 000 000',
  ach_clk100: 'Разминка', ach_clk100_d: '100 кликов на Фарме',
  ach_clk1k: 'Тысяча касаний', ach_clk1k_d: '1 000 кликов на Фарме',
  ach_clk10k: 'Железный палец', ach_clk10k_d: '10 000 кликов на Фарме',
  ach_inc: 'Пассивный доход', ach_inc_d: 'Доход Фарма от 1 монеты в секунду',
  ach_fmax: 'До упора', ach_fmax_d: 'Прокачай любое улучшение Фарма до максимума',
  ach_ctr1: 'Обмен', ach_ctr1_d: 'Заключи контракт обмена',
  ach_ctr10: 'Контрактник', ach_ctr10_d: 'Заключи 10 контрактов',
  ach_wh1: 'Крути', ach_wh1_d: 'Крутни колесо фортуны',
  ach_wh10: 'Завсегдатай колеса', ach_wh10_d: 'Крутни колесо фортуны 10 раз',
  ach_q10: 'Исполнитель', ach_q10_d: 'Забери 10 заданий',
  ach_st3: 'Привычка', ach_st3_d: 'Заходи 3 дня подряд',
  ach_st7: 'Неделя в строю', ach_st7_d: 'Заходи 7 дней подряд',
  ach_lv10: 'Боец', ach_lv10_d: 'Достигни 10-го уровня',
  ach_lv25: 'Опытный', ach_lv25_d: 'Достигни 25-го уровня',
  ach_lv50: 'Элита', ach_lv50_d: 'Достигни 50-го уровня',
  ach_lv100: 'Предел', ach_lv100_d: 'Достигни 100-го уровня',
});
Object.assign(I18N.en, {
  ach_title: 'Achievements', ach_toast: 'Achievement: {n}', ach_got: 'Unlocked', ach_sum: 'Achievements counted: {n}',
  ach_sum_more: 'New achievements: {n}', ach_coins: '+{v} coins', ach_xp: '+{v} XP', ach_tk: '{c} ticket', ach_tks: '{n} × {c} tickets',
  ach_g_cases: 'Cases', ach_g_drop: 'Drops', ach_g_up: 'Upgrades', ach_g_col: 'Collection', ach_g_trade: 'Trading',
  ach_g_farm: 'Farm', ach_g_play: 'Play', ach_g_lv: 'Level',
  ach_open1: 'First step', ach_open1_d: 'Open your first case',
  ach_open10: 'Warm-up', ach_open10_d: 'Open 10 cases',
  ach_open100: 'Regular', ach_open100_d: 'Open 100 cases',
  ach_open1000: 'Thousandaire', ach_open1000_d: 'Open 1,000 cases',
  ach_knife: 'Cold steel', ach_knife_d: 'Get a knife',
  ach_gloves: 'No prints', ach_gloves_d: 'Get gloves',
  ach_r3: 'Epic', ach_r3_d: 'Get an epic item',
  ach_r4: 'Legend', ach_r4_d: 'Get a legendary item',
  ach_r5: 'Myth', ach_r5_d: 'Get a mythic item',
  ach_r7: 'Keeper', ach_r7_d: 'Get a relic',
  ach_r8: 'Artifact', ach_r8_d: 'Get an artifact',
  ach_up1: 'Risk', ach_up1_d: 'Make your first upgrade',
  ach_upw10: 'Getting good', ach_upw10_d: '10 successful upgrades',
  ach_upw100: 'Upgrade master', ach_upw100_d: '100 successful upgrades',
  ach_uplow: 'One in twenty', ach_uplow_d: 'Win an upgrade with under 5% chance',
  ach_col10: 'Collector', ach_col10_d: 'Collect 10 collection items',
  ach_col100: 'Gatherer', ach_col100_d: 'Collect 100 collection items',
  ach_col500: 'Museum', ach_col500_d: 'Collect 500 collection items',
  ach_sell1: 'First deal', ach_sell1_d: 'Sell an item',
  ach_sell100: 'Reseller', ach_sell100_d: 'Sell 100 items',
  ach_sellsum: 'Turnover', ach_sellsum_d: 'Sell items worth 100,000',
  ach_worth: 'Stockpile', ach_worth_d: 'Inventory worth over 10,000',
  ach_worth2: 'Fortune', ach_worth2_d: 'Inventory worth over 1,000,000',
  ach_clk100: 'Warm hands', ach_clk100_d: '100 clicks on the Farm',
  ach_clk1k: 'Thousand taps', ach_clk1k_d: '1,000 clicks on the Farm',
  ach_clk10k: 'Iron finger', ach_clk10k_d: '10,000 clicks on the Farm',
  ach_inc: 'Passive income', ach_inc_d: 'Farm income of 1 coin per second',
  ach_fmax: 'Maxed out', ach_fmax_d: 'Max out any Farm upgrade',
  ach_ctr1: 'Trade-up', ach_ctr1_d: 'Sign a trade-up contract',
  ach_ctr10: 'Contractor', ach_ctr10_d: 'Sign 10 contracts',
  ach_wh1: 'Spin it', ach_wh1_d: 'Spin the wheel of fortune',
  ach_wh10: 'Wheel regular', ach_wh10_d: 'Spin the wheel of fortune 10 times',
  ach_q10: 'Doer', ach_q10_d: 'Claim 10 quests',
  ach_st3: 'Habit', ach_st3_d: 'Log in 3 days in a row',
  ach_st7: 'A week strong', ach_st7_d: 'Log in 7 days in a row',
  ach_lv10: 'Fighter', ach_lv10_d: 'Reach level 10',
  ach_lv25: 'Seasoned', ach_lv25_d: 'Reach level 25',
  ach_lv50: 'Elite', ach_lv50_d: 'Reach level 50',
  ach_lv100: 'Peak', ach_lv100_d: 'Reach level 100',
});

const ACH = (function () {
  const S0 = () => G.S;
  const N_KEYS = ['sold', 'sum', 'ctr', 'wh', 'q', 'low', 'st'];

  // ================= Каталог =================
  // g — группа, ic — иконка проекта (ic i-*), goal — цель, v — ключ значения из vals(),
  // c — монеты, x — опыт (показанный; из него 'ach' уже даёт базовые XP через js/xp.js), tk — [кейс, билетов]
  const LIST = [];
  function A(id, g, ic, v, goal, c, x, tk) { LIST.push({ id: id, g: g, ic: ic, v: v, goal: goal, c: c, x: x, tk: tk || null }); }
  A('open1', 'cases', 'cases', 'opened', 1, 15, 60);
  A('open10', 'cases', 'cases', 'opened', 10, 100, 100, ['patrol', 1]);
  A('open100', 'cases', 'box', 'opened', 100, 1000, 300, ['garage', 2]);
  A('open1000', 'cases', 'box', 'opened', 1000, 15000, 1500, ['rifles', 3]);
  A('knife', 'drop', 'sword', 'knife', 1, 2500, 400);
  A('gloves', 'drop', 'tap', 'gloves', 1, 2500, 400);
  A('r3', 'drop', 'gem', 'rmax', 3, 50, 60);
  A('r4', 'drop', 'gem', 'rmax', 4, 250, 100);
  A('r5', 'drop', 'gem', 'rmax', 5, 1000, 200);
  A('r7', 'drop', 'crown', 'rmax', 7, 25000, 1000);
  A('r8', 'drop', 'trophy', 'rmax', 8, 250000, 2500);
  A('up1', 'up', 'upgrade', 'upg', 1, 25, 60);
  A('upw10', 'up', 'up', 'upw', 10, 400, 200);
  A('upw100', 'up', 'up', 'upw', 100, 6000, 800);
  A('uplow', 'up', 'target', 'low', 1, 1500, 400);
  A('col10', 'col', 'grid', 'found', 10, 60, 60);
  A('col100', 'col', 'layers', 'found', 100, 1500, 300, ['pistols', 2]);
  A('col500', 'col', 'layers', 'found', 500, 25000, 1200, ['lab', 1]);
  A('sell1', 'trade', 'tag', 'sold', 1, 10, 60);
  A('sell100', 'trade', 'tag', 'sold', 100, 600, 200);
  A('sellsum', 'trade', 'trend', 'sum', 100000, 5000, 400);
  A('worth', 'trade', 'inv', 'worth', 10000, 500, 150);
  A('worth2', 'trade', 'inv', 'worth', 1000000, 25000, 800);
  A('clk100', 'farm', 'farm', 'clicks', 100, 20, 60);
  A('clk1k', 'farm', 'farm', 'clicks', 1000, 300, 150);
  A('clk10k', 'farm', 'farm', 'clicks', 10000, 3000, 500);
  A('inc', 'farm', 'bolt', 'inc', 1, 1000, 200);
  A('fmax', 'farm', 'chip', 'fmax', 1, 5000, 400);
  A('ctr1', 'play', 'swap', 'ctr', 1, 200, 100);
  A('ctr10', 'play', 'swap', 'ctr', 10, 2500, 400);
  A('wh1', 'play', 'dice', 'wh', 1, 50, 60);
  A('wh10', 'play', 'dice', 'wh', 10, 1000, 300);
  A('q10', 'play', 'check', 'q', 10, 500, 200, ['patrol', 1]);
  A('st3', 'play', 'fire', 'st', 3, 150, 100, ['garage', 1]);
  A('st7', 'play', 'fire', 'st', 7, 1000, 300, ['rifles', 1]);
  A('lv10', 'lv', 'star', 'lv', 10, 2000, 60);
  A('lv25', 'lv', 'star', 'lv', 25, 15000, 60);
  A('lv50', 'lv', 'medal', 'lv', 50, 100000, 60);
  A('lv100', 'lv', 'crown', 'lv', 100, 1000000, 60);
  const BY = {};
  LIST.forEach((a) => { BY[a.id] = a; });
  const GROUPS = ['cases', 'drop', 'up', 'col', 'trade', 'farm', 'play', 'lv'];

  // ================= Состояние =================
  const cnt = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);
  G.ext('ach', {
    def: () => ({ m: 0, d: {}, p: [], n: {} }),
    clean: (v) => {
      const o = { m: v && v.m ? 1 : 0, d: {}, p: [], n: {} };
      if (!v || typeof v !== 'object') return o;
      if (v.d && typeof v.d === 'object') Object.keys(v.d).forEach((id) => { if (BY[id]) o.d[id] = cnt(v.d[id]) || 1; });
      if (Array.isArray(v.p)) v.p.forEach((id) => { if (BY[id] && o.d[id] && o.p.indexOf(id) < 0) o.p.push(id); });
      if (v.n && typeof v.n === 'object') N_KEYS.forEach((k) => { if (cnt(v.n[k])) o.n[k] = cnt(v.n[k]); });
      return o;
    },
  });
  const st = () => G.extOf('ach');
  const bump = (k, by) => { const n = st().n; n[k] = (n[k] || 0) + (by || 1); };
  const keep = (k, v) => { const n = st().n; if (v > (n[k] || 0)) n[k] = v; };

  // Что найдено за всё время (коллекция) и что лежит в инвентаре (трофей не считается): нож, перчатки, лучшая редкость.
  // Пересчёт — когда меняется число находок или предметов.
  let fc = { S: null, n: -1, knife: 0, gloves: 0, rmax: -1 };
  function foundStats() {
    const S = S0(), keys = Object.keys(S.found), key = keys.length + ':' + S.inv.length;
    if (fc.S === S && fc.n === key) return fc;
    fc = { S: S, n: key, knife: 0, gloves: 0, rmax: -1 };
    keys.concat(S.inv.map((x) => x.s)).forEach((id) => {
      if (G.isSecret(id)) return;
      const sk = SKINS[id];
      if (!sk) return;
      const ty = WEAPONS[sk.w] && WEAPONS[sk.w].type;
      if (ty === 'knife') fc.knife = 1;
      else if (ty === 'gloves') fc.gloves = 1;
      if (sk.r > fc.rmax) fc.rmax = sk.r;
    });
    return fc;
  }
  // Текущие значения всех счётчиков (одним проходом на проверку)
  function vals() {
    const S = S0(), n = st().n, f = foundStats();
    let fmax = 0;
    G.UPGRADES.forEach((u) => { if (S.up[u.id] >= u.max) fmax = 1; });
    return {
      opened: S.opened, upg: S.upgrades, upw: S.upWins, clicks: S.clicks, found: G.foundCount(),
      knife: f.knife, gloves: f.gloves, rmax: Math.max(0, f.rmax),
      sold: n.sold || 0, sum: n.sum || 0, worth: G.invWorth(), inc: G.income(), fmax: fmax,
      ctr: n.ctr || 0, wh: n.wh || 0, q: n.q || 0, low: n.low ? 1 : 0,
      st: Math.max(n.st || 0, S.daily && S.daily.streak || 0),
      lv: typeof XP !== 'undefined' && XP.level ? XP.level() : 1,
    };
  }

  // ================= Награда =================
  const XP_BASE = () => (typeof XP !== 'undefined' && XP._ && XP._.SRC && XP._.SRC.ach) || 0;
  const caseName = (id) => (CASE_BY_ID[id] ? G.nm(CASE_BY_ID[id].name) : id);
  const tkOk = (a) => a.tk && CASE_BY_ID[a.tk[0]];
  // Награда текстом: «+1 000 монет · +300 XP · 2 билета «Гараж»» (xp: false — без опыта, для сводки первого запуска)
  function rwParts(c, x, tks) {
    const out = [];
    if (c) out.push(G.t('ach_coins', { v: G.fmtInt(c) }));
    if (x) out.push(G.t('ach_xp', { v: G.fmtInt(x) }));
    Object.keys(tks || {}).forEach((id) => out.push(G.t(tks[id] > 1 ? 'ach_tks' : 'ach_tk', { c: caseName(id), n: tks[id] })));
    return out.join(' · ');
  }
  const tkMap = (a) => { const o = {}; if (tkOk(a)) o[a.tk[0]] = a.tk[1]; return o; };
  const rwText = (a, xp) => rwParts(a.c, xp === false ? 0 : Math.max(a.x, XP_BASE()), tkMap(a));
  // Выдать награду (монеты, билеты, опыт сверх базового за событие 'ach'); emit — событие получения
  function grant(a, emit) {
    if (a.c) G.addCoins(a.c);
    if (tkOk(a)) G.grantTicket(a.tk[0], a.tk[1]);
    if (emit) {
      const extra = a.x - XP_BASE();
      if (extra > 0 && typeof XP !== 'undefined') XP.add(extra, 'ach');
      G.emit('ach', { id: a.id });
    }
  }

  // ================= Проверка =================
  let lastS = null;
  function ready() {
    if (!G.S) return false;
    if (lastS !== G.S) { lastS = G.S; fc.S = null; migrate(); }
    return true;
  }
  // Первый запуск: уже сделанное засчитывается тихо, одной сводкой (без опыта — его выдал XP по статистике)
  let sumPend = null;
  function migrate() {
    const s = st();
    if (s.m) return;
    s.m = 1;
    const V = vals(), now = Date.now(), tks = {};
    let n = 0, c = 0;
    LIST.forEach((a) => {
      if (s.d[a.id] || V[a.v] < a.goal) return;
      s.d[a.id] = now;
      n++; c += a.c;
      if (tkOk(a)) tks[a.tk[0]] = (tks[a.tk[0]] || 0) + a.tk[1];
      if (!G.demo) grant(a, false);   // демо-просмотр: только отметки, баланс демо-сохранения не меняется
    });
    if (!n) return;
    G.save(false);
    if (!G.demo) { sumPend = { t: G.t('ach_sum', { n: n }), r: rwParts(c, 0, tks) }; schedule(1600); }
  }
  let checking = false;
  function check() {
    if (checking || !ready()) return;
    checking = true;
    try {
      const s = st(), V = vals();
      let got = 0;
      LIST.forEach((a) => {
        if (s.d[a.id] || !(V[a.v] >= a.goal)) return;
        s.d[a.id] = Date.now();
        s.p.push(a.id);
        got++;
      });
      if (got) { G.save(false); schedule(); repaint(); }
    } finally { checking = false; }
  }
  let soonT = 0;
  const soon = () => { if (!soonT) soonT = setTimeout(() => { soonT = 0; check(); }, 250); };

  // ================= Тост =================
  const busy = () => typeof UI !== 'undefined' && UI.isSpinning && UI.isSpinning();
  let flushT = 0;
  function schedule(ms) {
    if (typeof document === 'undefined' || flushT) return;
    flushT = setTimeout(flush, ms || 450);
  }
  function toast(ic, title, sub) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ach-toast';
    el.innerHTML = '<i class="ic i-' + ic + '"></i><span class="ach-tt"><b></b><small></small></span>';
    el.querySelector('b').textContent = title;
    el.querySelector('small').textContent = sub;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }
  // Показ: по одному тосту; три и больше сразу — одной сводкой
  function flush() {
    flushT = 0;
    if (!ready()) return;
    if (busy() || document.hidden) { flushT = setTimeout(flush, 300); return; }
    if (sumPend) { toast('medal', sumPend.t, sumPend.r); sumPend = null; }
    const s = st();
    if (s.p.length >= 3) {
      const ids = s.p.splice(0), tks = {};
      let c = 0, x = 0;
      ids.forEach((id) => {
        const a = BY[id];
        grant(a, true);
        c += a.c; x += Math.max(a.x, XP_BASE());
        if (tkOk(a)) tks[a.tk[0]] = (tks[a.tk[0]] || 0) + a.tk[1];
      });
      toast('medal', G.t('ach_sum_more', { n: ids.length }), rwParts(c, x, tks));
    } else if (s.p.length) {
      const a = BY[s.p.shift()];
      grant(a, true);
      toast(a.ic, G.t('ach_toast', { n: G.t('ach_' + a.id) }), rwText(a));
      if (s.p.length) schedule(900);
    } else return;
    G.save(false);
    G.changed();
    repaint();
  }

  // ================= События =================
  const on = (ev, fn) => G.on(ev, (e) => { if (!ready()) return; if (fn) fn(e || {}); soon(); });
  on('open');
  on('inst');
  on('click');
  on('levelup');
  on('ticket');
  on('sell', (e) => { if (e.n > 0) { bump('sold', e.n); bump('sum', cnt(e.gain)); } });
  on('contract', () => bump('ctr'));
  on('wheel', () => bump('wh'));
  on('quest', () => bump('q'));
  on('daily', (e) => keep('st', Math.floor(cnt(e.streak))));
  on('upgrade', (e) => { if (e.win && typeof e.chance === 'number' && e.chance < 0.05) st().n.low = 1; });
  let ticking = false;
  G.on('login', () => {
    if (!ready()) return;
    check();
    if (st().p.length) schedule(1600);
    // состояние, которое меняется без событий (доход, прокачка Фарма, стоимость инвентаря), — раз в 2 с
    if (!ticking && typeof window !== 'undefined') { ticking = true; setInterval(check, 2000); }
  });

  // ================= Список для профиля =================
  const FLAGS = { knife: 1, gloves: 1, low: 1, fmax: 1, rmax: 1 };
  // Подпись прогресса закрытого достижения: «37 / 100»; «да/нет» и редкость — «0 / 1»
  function prog(a, V) {
    if (FLAGS[a.v]) return { p: 0, t: '0 / 1' };
    const cur = Math.max(0, Math.min(a.goal, V[a.v] || 0));
    const f = a.v === 'inc' ? (v) => G.fmt(v) : (v) => G.fmtInt(v);
    return { p: cur / a.goal * 100, t: f(cur) + ' / ' + f(a.goal) };
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const dateOf = (ts) => { try { return new Date(ts).toLocaleDateString(G.lang === 'en' ? 'en-GB' : 'ru-RU'); } catch (e) { return ''; } };
  function card(a, s, V) {
    const done = !!s.d[a.id];
    let foot;
    if (done) foot = '<span class="ach-ok"><i class="ic i-check"></i>' + esc(G.t('ach_got')) + (s.d[a.id] > 1 ? ' · ' + dateOf(s.d[a.id]) : '') + '</span>';
    else {
      const p = prog(a, V);
      foot = '<span class="ach-pg"><span class="bar"><i style="width:' + p.p.toFixed(1) + '%"></i></span><span class="bar-lbl">' + p.t + '</span></span>';
    }
    return '<div class="ach-c glass-card ' + (done ? 'on' : 'off') + '" data-ach="' + a.id + '">' +
      '<span class="ach-ic"><i class="ic i-' + a.ic + '"></i>' + (done ? '' : '<i class="ic i-lock ach-lk"></i>') + '</span>' +
      '<span class="ach-tx"><b class="ach-nm">' + esc(G.t('ach_' + a.id)) + '</b>' +
      '<span class="ach-ds">' + esc(G.t('ach_' + a.id + '_d')) + '</span>' +
      '<span class="ach-rw">' + esc(rwText(a)) + '</span>' + foot + '</span></div>';
  }
  let lastEl = null;
  function render(el) {
    if (!el) return;
    lastEl = el;
    if (!ready()) { el.innerHTML = ''; return; }
    const s = st(), V = vals(), done = LIST.filter((a) => s.d[a.id]).length;
    // всё содержимое вкладки — на стеклянной панели (как витрина и лидеры): подписи не лежат прямо на сцене
    let h = '<div class="ach-in glass"><div class="ach-hd"><span class="ach-h"><i class="ic i-medal"></i>' + esc(G.t('ach_title')) + '</span>' +
      '<span class="ach-cnt"><b>' + done + '</b> / ' + LIST.length + '</span></div>' +
      '<span class="bar ach-all"><i style="width:' + (done / LIST.length * 100).toFixed(1) + '%"></i></span><div class="ach-grid">';
    GROUPS.forEach((g) => {
      h += '<div class="ach-g">' + esc(G.t('ach_g_' + g)) + '</div>';
      LIST.forEach((a) => { if (a.g === g) h += card(a, s, V); });
    });
    el.innerHTML = h + '</div></div>';
    el.classList.add('ach');
  }
  // Перерисовать открытый список (после получения), если он ещё на странице
  function repaint() { if (lastEl && lastEl.isConnected) render(lastEl); }

  return {
    render: render,
    stats: () => ({ done: ready() ? LIST.filter((a) => st().d[a.id]).length : 0, total: LIST.length }),
    list: () => {
      const ok = ready(), s = ok ? st() : { d: {} }, V = ok ? vals() : {};
      return LIST.map((a) => ({ id: a.id, g: a.g, ic: a.ic, goal: a.goal, cur: V[a.v] || 0, done: !!s.d[a.id],
        name: G.t('ach_' + a.id), desc: G.t('ach_' + a.id + '_d'), reward: rwText(a) }));
    },
    // для проверок (tools): пересчитать сейчас
    _: { check: check, vals: vals, flush: flush },
  };
})();
