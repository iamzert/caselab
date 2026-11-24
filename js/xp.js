'use strict';

// Уровни и опыт (XP): кривая, источники опыта, награды уровней, ранги, полоса в шапке. Раунд 7 — агент xp (tools/plans/R7_SPEC.md).
// Опыт капает за всё (события G.on): открытие кейса, апгрейд, продажа, клики на Фарме, задания, вход, новый предмет.
// Уровень считается из общего опыта по таблице CUM; награды выдаются один раз (st.rl — до какого уровня выдано).
// Скидка, ускорение бесплатного кейса, аватары и рамки — производные от уровня (ничего лишнего не хранится).
// Состояние — G.S.ext.xp: { t — опыт всего, rl — награды выданы до уровня, m — миграция сделана,
//   wk / wx — неделя и опыт за неделю, ld — день последнего опыта за вход, fr — выбранная рамка }.
// Строки модуля (ранги rank_0 … rank_7 — в i18n.js)
Object.assign(I18N.ru, {
  xp_lv: 'УР.', xp_level: 'Уровень {n}', xp_levels: 'Уровни {a}–{b}', xp_rank: 'Ранг: {r}', xp_big_k: 'Крупная награда',
  xp_r_coins: '+{v} монет', xp_r_ticket: 'билет «{c}»', xp_r_tickets: '{n} билета «{c}»',
  xp_r_disc: 'скидка на кейсы {p}', xp_r_speed: 'бесплатный кейс быстрее ×{m}', xp_r_ava: 'новый аватар', xp_r_frame: 'рамка «{f}»',
  xp_perks: 'Бонусы уровня: скидка на кейсы {d}, бесплатный кейс быстрее ×{m}. Аватар и рамку можно выбрать в профиле.',
  xp_fr_steel: 'Сталь', xp_fr_bronze: 'Бронза', xp_fr_cobalt: 'Кобальт', xp_fr_jade: 'Нефрит', xp_fr_crimson: 'Кармин',
  xp_fr_gold: 'Золото', xp_fr_silver: 'Серебро', xp_fr_violet: 'Аметист', xp_fr_carbon: 'Карбон', xp_fr_onyx: 'Оникс',
  xp_fr_ivory: 'Слоновая кость', xp_fr_legend: 'Легенда',
});
Object.assign(I18N.en, {
  xp_lv: 'LV', xp_level: 'Level {n}', xp_levels: 'Levels {a}–{b}', xp_rank: 'Rank: {r}', xp_big_k: 'Major reward',
  xp_r_coins: '+{v} coins', xp_r_ticket: '{c} ticket', xp_r_tickets: '{n} × {c} tickets',
  xp_r_disc: 'case discount {p}', xp_r_speed: 'free case faster ×{m}', xp_r_ava: 'new avatar', xp_r_frame: '{f} frame',
  xp_perks: 'Level perks: case discount {d}, free case faster ×{m}. Pick your avatar and frame in the profile.',
  xp_fr_steel: 'Steel', xp_fr_bronze: 'Bronze', xp_fr_cobalt: 'Cobalt', xp_fr_jade: 'Jade', xp_fr_crimson: 'Crimson',
  xp_fr_gold: 'Gold', xp_fr_silver: 'Silver', xp_fr_violet: 'Amethyst', xp_fr_carbon: 'Carbon', xp_fr_onyx: 'Onyx',
  xp_fr_ivory: 'Ivory', xp_fr_legend: 'Legend',
});

const XP = (function () {
  const MAX = 100;

  // ================= Кривая =================
  // На уровень n → n+1 нужно 100 × n^1.35 (округление до 5): 1→2 — 100, 9→10 — 1 940, 50→51 — 19 660, 99→100 — 49 445;
  // всего до 10-го — 8 430, до 20-го — 45 745, до 100-го — 2.1M. Темп подогнан симуляцией нового игрока (отчёт агента xp).
  const NEED = [0, 0], CUM = [0, 0];
  for (let n = 1; n < MAX; n++) {
    NEED[n] = Math.round(100 * Math.pow(n, 1.35) / 5) * 5;
    CUM[n + 1] = CUM[n] + NEED[n];
  }
  function levelOf(total) {
    let lv = 1;
    while (lv < MAX && total >= CUM[lv + 1]) lv++;
    return lv;
  }

  // ================= Источники опыта (данные) =================
  // Цена → опыт: k·√цены до P0, дальше медленнее (∝ цена^0.25), чтобы дорогие кейсы давали больше, но не взрывали уровень.
  const SRC = {
    open: { k: 7, min: 22 },            // за каждый кейс (бесплатный и за рекламу — по цене кейса): 9.99 → 22, 49 → 49, 299 → 121
    upWin: { k: 4, min: 20, risk: 1 },  // удачный апгрейд: от ставки, × (1 + risk·(1 − шанс))
    upLose: { k: 2, min: 10 },          // неудачный — утешительный
    sell: { k: 1.5, min: 2 },           // продажа: от выручки
    click: { per: 0.25, capMin: 45 },   // клик на Фарме: per за клик, не больше capMin в минуту (автокликер не ломает)
    quest: 150,                         // забранное задание
    daily: { base: 40, streak: 15 },    // ежедневный бонус: base + streak·день серии
    login: 25,                          // первый вход за день
    found: { base: 14, rar: 4 },        // новый предмет в коллекцию: base + rar·редкость
    contract: { k: 5, min: 40 },        // контракт обмена: от стоимости результата
    wheel: 40, ach: 60,                 // колесо фортуны, достижение
  };

  // Множитель опыта за действия по уровню: до 9-го — 1 (10-й уровень за 20–30 мин, как задумано), дальше +0.14 за
  // уровень (10-й — ×1.14, 15-й — ×1.84, 20-й — ×2.54), не больше ×4 (с 30-го). Зачем: после 10-го кончаются разовые источники
  // (первые достижения, новые предметы коллекции), а опыт за кейсы растёт медленнее, чем 100 × n^1.35, — без множителя
  // уровни 11–20 шли по 8–29 мин (стена). С ним время на уровень растёт плавно: ~5–7 мин до 15-го, ~8–10 мин до 20-го
  // (бот нового игрока в браузере, отчёт pl-xp раунда 7). Только повторяемые действия (кейс, апгрейд, продажа, клики,
  // задание, новый предмет, контракт); вход, ежедневный бонус, колесо и достижения — как есть
  // (приз колеса и так считается от опыта уровня).
  const LV_MUL = { from: 9, step: 0.14, max: 4 };
  const lvMul = (lv) => (lv <= LV_MUL.from ? 1 : Math.min(LV_MUL.max, 1 + LV_MUL.step * (lv - LV_MUL.from)));

  const P0 = 1000;
  function priceXp(p, k, min) {
    p = Math.max(0, Number(p) || 0);
    const v = p <= P0 ? Math.sqrt(p) : Math.sqrt(P0) * Math.pow(p / P0, 0.25);
    return Math.max(min || 0, Math.round(k * v));
  }

  // ================= Награды уровней (данные) =================
  // Что даёт уровень, по последней цифре номера (монеты — всегда):
  // 0 — крупная награда в отдельном окне, 1/3/6/9 — билет на кейс, 2 — двойные монеты, 4 — аватар,
  // 5 — ступень скидки на кейсы (+1 %, до 10 %), 7 — рамка аватара, 8 — ускорение бесплатного кейса (+5 %, до ×1.5).
  const PLAN = ['big', 'tk', 'coin', 'tk', 'ava', 'disc', 'tk', 'frame', 'speed', 'tk'];
  const DISC_STEP = 0.01, SPEED_STEP = 0.05;
  // Аватары наград: монохромные значки проекта (seg_icons.css); уровни 4, 14 … 74, последний — за 100-й
  const AVAS = [
    { id: 'lv_target', ic: 'target', lv: 4 }, { id: 'lv_chip', ic: 'chip', lv: 14 }, { id: 'lv_dice', ic: 'dice', lv: 24 },
    { id: 'lv_layers', ic: 'layers', lv: 34 }, { id: 'lv_box', ic: 'box', lv: 44 }, { id: 'lv_gem', ic: 'gem', lv: 54 },
    { id: 'lv_medal', ic: 'medal', lv: 64 }, { id: 'lv_star', ic: 'star', lv: 74 }, { id: 'lv_trophy', ic: 'trophy', lv: 100 },
  ];
  // Рамки аватара: уровни 7, 17 … 97, «Золото» — за 50-й, «Легенда» — за 100-й (вид — r7_xp.css, [data-fr])
  const FRAMES = [
    { id: 'steel', lv: 7 }, { id: 'bronze', lv: 17 }, { id: 'cobalt', lv: 27 }, { id: 'jade', lv: 37 }, { id: 'crimson', lv: 47 },
    { id: 'gold', lv: 50 }, { id: 'silver', lv: 57 }, { id: 'violet', lv: 67 }, { id: 'carbon', lv: 77 }, { id: 'onyx', lv: 87 },
    { id: 'ivory', lv: 97 }, { id: 'legend', lv: 100 },
  ];
  // Монеты за уровень: 15·n·1.07^n (2 → 34, 10 → 295, 30 → 3 430, 50 → 22 100, 100 → 1.3M), «круглые» числа
  function coinsAt(lv) {
    const x = 15 * lv * Math.pow(1.07, lv);
    const step = x < 100 ? 5 : x < 1000 ? 10 : x < 1e4 ? 50 : x < 1e5 ? 500 : 5000;
    return Math.round(x / step) * step;
  }
  // Кейс для билета: самый дорогой платный кейс не дороже 10·1.12^n (×4 — у крупной награды)
  function ticketCase(lv, mult) {
    const cap = 10 * Math.pow(1.12, lv) * (mult || 1);
    const paid = CASES.filter((c) => c.id !== FREE_CASE_ID && c.price > 0).sort((a, b) => a.price - b.price);
    let pick = paid[0] || null;
    paid.forEach((c) => { if (c.price <= cap) pick = c; });
    return pick;
  }
  // Награда уровня lv: { coins, tk: { c, n }, ava, frame, disc, speed, big }
  function rewardOf(lv) {
    const kind = PLAN[lv % 10];
    const r = { lv: lv, coins: coinsAt(lv), big: kind === 'big' };
    const ava = AVAS.filter((a) => a.lv === lv)[0], fr = FRAMES.filter((f) => f.lv === lv)[0];
    if (ava) r.ava = ava.id;
    if (fr) r.frame = fr.id;
    if (kind === 'coin') r.coins *= 2;
    else if (kind === 'disc') r.disc = true;
    else if (kind === 'speed') r.speed = true;
    else if (kind === 'big') { r.coins *= 5; const c = ticketCase(lv, 4); if (c) r.tk = { c: c.id, n: 3 }; }
    if (kind === 'tk' || (kind === 'ava' && !ava)) { const c = ticketCase(lv); if (c) r.tk = { c: c.id, n: lv % 10 === 9 ? 2 : 1 }; }
    return r;
  }
  const countTo = (lv, digit) => (lv >= digit ? Math.floor((lv - digit) / 10) + 1 : 0);

  // ================= Ранги =================
  // По диапазонам уровней: с какого уровня начинается ранг (строки — rank_0 … rank_7 в i18n.js)
  const RANKS = [1, 5, 10, 20, 30, 45, 60, 80];
  function rankOf(lv) {
    let i = 0;
    RANKS.forEach((from, k) => { if (lv >= from) i = k; });
    return { i: i, name: G.t('rank_' + i), from: RANKS[i], to: RANKS[i + 1] ? RANKS[i + 1] - 1 : MAX };
  }

  // ================= Состояние =================
  const okId = (v) => typeof v === 'string' && /^[a-z]{2,12}$/.test(v);
  G.ext('xp', {
    def: () => ({ t: 0, rl: 1, m: 0, wk: -1, wx: 0, ld: -1, fr: '' }),
    clean: (v) => {
      if (!v || typeof v !== 'object') return null;
      const n = (x, d) => (typeof x === 'number' && isFinite(x) && x >= 0 ? Math.floor(x) : d);
      const int = (x, d) => (typeof x === 'number' && isFinite(x) ? Math.floor(x) : d);
      return {
        t: Math.min(n(v.t, 0), CUM[MAX] * 4), rl: Math.max(1, Math.min(MAX, n(v.rl, 1))), m: v.m ? 1 : 0,
        wk: int(v.wk, -1), wx: n(v.wx, 0), ld: int(v.ld, -1), fr: okId(v.fr) && FRAMES.some((f) => f.id === v.fr) ? v.fr : '',
      };
    },
  });
  const st = () => G.extOf('xp');

  // Аватары наград — в общий список (sanitize принимает в profile.ava только id из G.AVATARS)
  AVAS.forEach((a) => { if (G.AVATARS.indexOf(a.id) < 0) G.AVATARS.push(a.id); });

  // ---------- Миграция: стартовый опыт по статистике старого сохранения ----------
  // Раньше уровня не было: даём опыт, примерно равный тому, что игрок набрал бы за ту же игру (см. симуляцию,
  // tools/plans — отчёт xp). Только уровень — без монет и билетов за пропущенные уровни (иначе поток наград);
  // скидка, ускорение, аватары и рамки — производные от уровня и появляются сразу. Потолок — 40-й уровень.
  const MIG = { open: 30, up: 12, win: 10, click: 0.12, found: 20 };
  function startXp(S) {
    const v = S.opened * MIG.open + S.upgrades * MIG.up + S.upWins * MIG.win + Math.min(S.clicks, 2e5) * MIG.click +
      G.foundCount() * MIG.found;
    return Math.min(CUM[40], Math.max(0, Math.round(v)));
  }
  function migrate() {
    const s = st();
    if (s.m) return;
    s.m = 1;
    const v = startXp(G.S);
    if (v <= s.t) return;
    s.t = v;
    s.rl = levelOf(v);
    shown = { lv: s.rl, t: v };
    if (v > 0) G.save(false);
  }
  // Сохранение могло смениться (облако, сброс прогресса, демо) — проверяем при каждом обращении
  let lastS = null;
  function ready() {
    if (!G.S) return false;
    if (lastS !== G.S) { lastS = G.S; migrate(); const s = st(); shown = { lv: levelOf(s.t), t: s.t }; }
    return true;
  }

  // ---------- Неделя ----------
  function weekRoll() {
    const s = st(), w = G.periods().w;
    if (s.wk !== w) { s.wk = w; s.wx = 0; }
    return s;
  }

  // ================= Начисление =================
  // shown — что сейчас показано в шапке (во время прокрутки кейса/апгрейда шапка ждёт, чтобы не выдать результат)
  let shown = { lv: 1, t: 0 };
  let pend = 0, flushT = 0;
  function add(n, src) {
    if (!ready()) return 0;
    n = Math.max(0, Math.round(Number(n) || 0));
    if (!n) return 0;
    const s = weekRoll();
    const before = levelOf(s.t);
    s.t = Math.min(s.t + n, CUM[MAX] * 4);
    s.wx += n;
    const lv = levelOf(s.t);
    G.emit('xp', { n: n, src: src || '' });
    const got = [];
    while (s.rl < lv) { s.rl++; got.push(grant(s.rl)); }
    if (got.length) { G.save(false); got.forEach((r) => G.emit('levelup', { lv: r.lv })); }
    if (lv > before || got.length) G.changed();
    // опыт за клики на Фарме копится и всплывает одной суммой не чаще раза в CLICK_POP мс (иначе «+1 XP» каждую секунду)
    if (src === 'click') queueClickPop(n); else pend += n;
    levelQ.push.apply(levelQ, got);
    schedule();
    return n;
  }
  // Повторяемое действие: опыт × множитель уровня (см. LV_MUL)
  function addAct(n, src) { return add(n * lvMul(level()), src); }

  const CLICK_POP = 9000;
  const narrow = () => typeof matchMedia === 'function' && matchMedia('(max-width: 560px)').matches;
  let clickPend = 0, clickAt = 0, clickT = 0;
  function queueClickPop(n) {
    clickPend += n;
    if (clickT || typeof document === 'undefined') return;
    clickT = setTimeout(popClick, Math.max(400, clickAt + CLICK_POP - Date.now()));
  }
  function popClick() {
    clickT = 0;
    if (!clickPend) return;
    if (busy()) { clickT = setTimeout(popClick, 1000); return; }
    // телефон: плашка под шапкой ложится на ленту дропа — опыт за клики виден на полосе уровня самого Фарма
    if (!narrow()) pop(clickPend);
    clickPend = 0;
    clickAt = Date.now();
  }
  // Выдаёт награду уровня (монеты и билеты — сразу; остальное — производное от уровня)
  function grant(lv) {
    const r = rewardOf(lv);
    if (r.coins) G.addCoins(r.coins);
    if (r.tk) G.grantTicket(r.tk.c, r.tk.n);
    return r;
  }

  // ---------- Источники ----------
  const clickMin = { m: -1, got: 0, acc: 0 };
  function onClick() {
    const m = Math.floor(Date.now() / 60e3);
    if (clickMin.m !== m) { clickMin.m = m; clickMin.got = 0; }
    if (clickMin.got >= SRC.click.capMin) return;
    clickMin.acc += SRC.click.per;
    if (clickMin.acc < 1) return;
    const n = Math.min(Math.floor(clickMin.acc), SRC.click.capMin - clickMin.got);
    clickMin.acc -= Math.floor(clickMin.acc);
    clickMin.got += n;
    addAct(n, 'click');
  }
  function onLogin() {
    if (!ready()) return;
    const s = st(), d = G.periods().d;
    if (s.ld === d) return;
    s.ld = d;
    add(SRC.login, 'login');
  }
  G.on('open', (e) => { if (e && e.c) addAct(priceXp(e.c.price, SRC.open.k, SRC.open.min) * Math.max(1, e.n || 1), 'open'); });
  G.on('upgrade', (e) => {
    if (!e) return;
    const ch = Math.max(0, Math.min(1, Number(e.chance) || 0));
    if (e.win) addAct(priceXp(e.stake, SRC.upWin.k, SRC.upWin.min) * (1 + SRC.upWin.risk * (1 - ch)), 'upgrade');
    else addAct(priceXp(e.stake, SRC.upLose.k, SRC.upLose.min), 'upgrade');
  });
  G.on('sell', (e) => { if (e && e.gain > 0) addAct(priceXp(e.gain, SRC.sell.k, SRC.sell.min), 'sell'); });
  G.on('click', onClick);
  G.on('quest', () => addAct(SRC.quest, 'quest'));
  G.on('daily', (e) => add(SRC.daily.base + SRC.daily.streak * Math.min(7, Math.max(1, (e && e.streak) || 1)), 'daily'));
  G.on('login', onLogin);
  G.on('inst', (e) => {
    if (!e || !e.isNew || !e.inst || !SKINS[e.inst.s]) return;
    addAct(SRC.found.base + SRC.found.rar * SKINS[e.inst.s].r, 'found');
  });
  G.on('contract', (e) => { if (e) addAct(priceXp(e.value, SRC.contract.k, SRC.contract.min), 'contract'); });
  // приз «опыт» колесо начисляет само (XP.add(p.v)) — базовый опыт за прокрутку только для остальных призов
  G.on('wheel', (e) => { if (!(e && e.prize && e.prize.k === 'xp')) add(SRC.wheel, 'wheel'); });
  G.on('ach', () => add(SRC.ach, 'ach'));

  // ================= Информация для экранов =================
  function info() {
    const s = ready() ? st() : { t: 0 };
    const lv = levelOf(s.t), max = lv >= MAX;
    const xp = max ? NEED[MAX - 1] : s.t - CUM[lv], need = max ? NEED[MAX - 1] : NEED[lv];
    return {
      lv: lv, xp: xp, need: need, pct: max ? 100 : Math.min(100, xp / need * 100), total: s.t, max: MAX,
      rank: rankOf(lv), next: max ? null : { lv: lv + 1, text: rewardText(rewardOf(lv + 1)).join(' · ') },
    };
  }
  const discountAt = (lv) => Math.min(0.1, countTo(lv, 5) * DISC_STEP);
  const speedAt = (lv) => Math.round((1 + countTo(lv, 8) * SPEED_STEP) * 100) / 100;
  const pctTxt = (v) => Math.round(v * 100) + '%';
  const caseName = (id) => (CASE_BY_ID[id] ? G.nm(CASE_BY_ID[id].name) : id);
  // Награда текстом: ['+295 монет', 'билет «Патруль»', …]
  function rewardText(r) {
    const out = [];
    if (r.coins) out.push(G.t('xp_r_coins', { v: G.fmtInt(r.coins) }));
    if (r.tk) out.push(G.t(r.tk.n > 1 ? 'xp_r_tickets' : 'xp_r_ticket', { c: caseName(r.tk.c), n: r.tk.n }));
    if (r.disc) out.push(G.t('xp_r_disc', { p: pctTxt(discountAt(r.lv)) }));
    if (r.speed) out.push(G.t('xp_r_speed', { m: speedAt(r.lv).toFixed(2) }));
    if (r.ava) out.push(G.t('xp_r_ava'));
    if (r.frame) out.push(G.t('xp_r_frame', { f: G.t('xp_fr_' + r.frame) }));
    return out;
  }

  // ================= Шапка: номер уровня и полоса =================
  const $ = (id) => document.getElementById(id);
  let built = false;
  function buildHdr() {
    const el = $('hdr-lv');
    if (!el) return null;
    if (!built) {
      el.innerHTML = '<button class="lv-btn" data-act="nav" data-id="profile">' +
        '<span class="lv-n"><small></small><b></b></span>' +
        '<span class="lv-col"><span class="lv-rk"></span><span class="bar"><i></i></span></span></button>';
      built = true;
    }
    return el;
  }
  function paintHdr(lv, pct, anim) {
    const el = buildHdr();
    if (!el) return;
    const i = el.querySelector('.bar i');
    i.style.transition = anim ? '' : 'none';
    i.style.width = pct.toFixed(1) + '%';
    if (!anim) { void i.offsetWidth; i.style.transition = ''; }
    el.querySelector('.lv-n small').textContent = G.t('xp_lv');
    el.querySelector('.lv-n b').textContent = lv;
    el.querySelector('.lv-rk').textContent = rankOf(lv).name;
    const inf = info();
    const title = G.t('xp_level', { n: lv }) + ' · ' + rankOf(lv).name +
      (inf.lv === lv && !inf.next ? '' : ' · ' + G.fmtInt(inf.xp) + ' / ' + G.fmtInt(inf.need) + ' XP');
    el.title = title;
    el.firstChild.setAttribute('aria-label', title);
  }
  const pctOf = (t, lv) => (lv >= MAX ? 100 : Math.max(0, Math.min(100, (t - CUM[lv]) / NEED[lv] * 100)));

  // Всплывающее «+45 XP» у полосы в шапке (несколько начислений подряд — одной цифрой)
  function pop(n) {
    const el = $('hdr-lv');
    if (!el || !n) return;
    const p = document.createElement('span');
    p.className = 'xp-pop';
    p.innerHTML = '+' + G.fmtInt(n) + ' <small>XP</small>';
    el.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }

  // ---------- Показ начислений: ждёт конца прокрутки (кейс, апгрейд) ----------
  const levelQ = [];
  const busy = () => typeof UI !== 'undefined' && UI.isSpinning && UI.isSpinning();
  function schedule() {
    if (typeof document === 'undefined' || flushT) return;
    flushT = setTimeout(flush, 380);
  }
  function flush() {
    flushT = 0;
    if (busy()) { flushT = setTimeout(flush, 300); return; }
    const s = st(), lv = levelOf(s.t), n = pend;
    pend = 0;
    if (lv > shown.lv) levelUpFx(shown.lv, lv, levelQ.splice(0));
    else paintHdr(lv, pctOf(s.t, lv), true);
    shown = { lv: lv, t: s.t };
    pop(n);
  }
  // Повышение: полоса дозаполняется, номер сменяется, короткий тост; каждый 10-й — отдельное окно
  function levelUpFx(from, to, rewards) {
    const el = buildHdr();
    if (el) {
      paintHdr(from, 100, true);
      setTimeout(() => {
        el.classList.remove('lv-up');
        void el.offsetWidth;
        el.classList.add('lv-up');
        paintHdr(to, 0, false);
        requestAnimationFrame(() => paintHdr(to, pctOf(st().t, to), true));
        setTimeout(() => el.classList.remove('lv-up'), 900);
      }, 420);
    }
    const last = rewards[rewards.length - 1];
    if (last) {
      // несколько уровней сразу: «Уровни 8–10», монеты — суммой, остальное — последнего уровня
      const sum = Object.assign({}, last, { coins: rewards.reduce((v, r) => v + (r.coins || 0), 0) });
      const head = rewards.length > 1 ? G.t('xp_levels', { a: rewards[0].lv, b: to }) : G.t('xp_level', { n: to });
      const txt = head + ' · ' + rewardText(sum).slice(0, 2).join(', ');
      setTimeout(() => { if (typeof UI !== 'undefined') UI.toast(txt, 'good'); }, 460);
    }
    if (typeof Sfx !== 'undefined' && Sfx.coin) setTimeout(() => Sfx.coin(), 440);
    rewards.filter((r) => r.big).forEach((r) => bigQ.push(r));
    if (bigQ.length) setTimeout(nextBig, 1100);
  }

  // ---------- Окно крупной награды (каждый 10-й уровень) ----------
  // Награда уже выдана при повышении — окно только показывает её; ждёт, пока закроется другое окно и кончится прокрутка.
  const bigQ = [];
  function nextBig() {
    if (!bigQ.length || typeof UI === 'undefined') return;
    const root = $('modal-root');
    if (busy() || (root && root.classList.contains('show'))) { setTimeout(nextBig, 700); return; }
    const r = bigQ.shift(), rk = rankOf(r.lv);
    const ic = UI.ic;
    const row = (icon, html) => '<li>' + ic(icon) + '<span>' + html + '</span></li>';
    let rows = row('plus', G.t('xp_r_coins', { v: G.fmtInt(r.coins) }));
    if (r.tk) rows += row('cases', G.t(r.tk.n > 1 ? 'xp_r_tickets' : 'xp_r_ticket', { c: caseName(r.tk.c), n: r.tk.n }));
    if (r.ava) rows += row('user', G.t('xp_r_ava'));
    if (r.frame) rows += row('medal', G.t('xp_r_frame', { f: G.t('xp_fr_' + r.frame) }));
    const ava = r.ava ? AVAS.filter((a) => a.id === r.ava)[0] : null;
    const prev = '<div class="xp-big-mark"' + (r.frame ? ' data-fr="' + r.frame + '"' : '') + '>' +
      (ava ? ic(ava.ic) : '<b>' + r.lv + '</b>') + '</div>';
    const perks = G.t('xp_perks', { d: pctTxt(discountAt(r.lv)), m: speedAt(r.lv).toFixed(2) });
    UI.modal('<div class="xp-big">' + prev +
      '<div class="xp-big-k">' + G.t('xp_big_k') + '</div>' +
      '<h3 class="m-title">' + G.t('xp_level', { n: r.lv }) + '</h3>' +
      '<div class="xp-big-rk">' + G.t('xp_rank', { r: rk.name }) + '</div>' +
      '<ul class="xp-big-list">' + rows + '</ul>' +
      '<p class="hint">' + perks + '</p>' +
      '<div class="m-btns"><button class="btn primary big" data-act="close">' + G.t('take') + '</button></div></div>',
    { cls: 'xp-big-m', onClose: () => setTimeout(nextBig, 300) });
    if (typeof Sfx !== 'undefined' && Sfx.win) Sfx.win(3);
  }

  // ---------- Рамка аватара в шапке ----------
  function paintFrame() {
    const a = $('ava-btn');
    if (!a) return;
    const fr = frame();
    if (fr) a.setAttribute('data-fr', fr); else a.removeAttribute('data-fr');
  }
  function frame() {
    if (!ready()) return '';
    const f = st().fr;
    return f && unlocked('frame', f) ? f : '';
  }
  function setFrame(id) {
    if (!ready()) return false;
    if (id && !unlocked('frame', id)) return false;
    st().fr = id || '';
    G.save(false);
    paintFrame();
    G.changed();
    return true;
  }
  function unlocked(kind, id) {
    const lv = level();
    const list = kind === 'ava' ? AVAS : kind === 'frame' ? FRAMES : [];
    const x = list.filter((a) => a.id === id)[0];
    return !!x && lv >= x.lv;
  }
  function level() { return ready() ? levelOf(st().t) : 1; }

  // Синхронизация шапки: смена языка, сохранения (облако, сброс), изменения без начисления
  let lastLang = '', lastFr = null;
  function sync() {
    if (!ready() || flushT || busy()) return;
    const s = st(), lv = levelOf(s.t);
    if (!built || lv !== shown.lv || G.lang !== lastLang) {
      lastLang = G.lang;
      shown = { lv: lv, t: s.t };
      paintHdr(lv, pctOf(s.t, lv), false);
    } else if (s.t !== shown.t) { shown.t = s.t; paintHdr(lv, pctOf(s.t, lv), true); }
    const fr = frame();
    if (fr !== lastFr) { lastFr = fr; paintFrame(); }
  }
  if (typeof document !== 'undefined' && typeof window !== 'undefined') setInterval(sync, 500);

  return {
    add: add, info: info, level: level, rankOf: rankOf,
    discount: () => discountAt(level()),
    freeSpeed: () => speedAt(level()),
    unlocked: unlocked,
    unlocks: () => ({ ava: AVAS.filter((a) => unlocked('ava', a.id)).map((a) => a.id), frame: FRAMES.filter((f) => unlocked('frame', f.id)).map((f) => f.id) }),
    // полный список наград-аватаров и рамок с уровнями (для выбора в профиле: закрытые — с замком и уровнем)
    catalog: () => ({ ava: AVAS.map((a) => ({ id: a.id, ic: a.ic, lv: a.lv })), frame: FRAMES.map((f) => ({ id: f.id, lv: f.lv, name: G.t('xp_fr_' + f.id) })) }),
    avaIc: (id) => { const a = AVAS.filter((x) => x.id === id)[0]; return a ? a.ic : ''; },
    frame: frame, setFrame: setFrame,
    week: () => (ready() ? weekRoll().wx : 0),
    reward: (lv) => { const r = rewardOf(lv); r.text = rewardText(r); return r; },
    need: (lv) => NEED[lv] || 0, cum: (lv) => CUM[lv] || 0,
    // для симуляции и проверок (tools): формулы источников
    _: { SRC: SRC, MIG: MIG, LV_MUL: LV_MUL, lvMul: lvMul, priceXp: priceXp, levelOf: levelOf, startXp: startXp, coinsAt: coinsAt, ticketCase: ticketCase },
  };
})();
