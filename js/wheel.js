'use strict';

// Колесо фортуны на экране «Награды»: бесплатное вращение раз в 6 часов и ещё одно — за рекламу (раз в 3 часа).
// Призы: монеты, билеты на кейс по уровню, опыт, редкий предмет. Раунд 7 — агент rewards (tools/plans/R7_SPEC.md).
//
// Экономика. E — «бюджет» вращения: минуты активного фарма игрока (клик раз в секунду + доход в секунду),
// от 11 минут на 1-м уровне до 16 минут с 50-го. Монеты — доли E, билет — кейс не дороже 1.6 E и потолка
// по уровню, редкий предмет — не дороже 5 средних кейсов игрока (и не дороже 12 E). Средняя ценность
// вращения ≈ 10–20 минут фарма (проверка — прогон 100 вращений, scratchpad r7/rewards).
const Wheel = (function () {
  const t = G.t;
  const FREE_CD = 6 * 3600e3, AD_CD = 3 * 3600e3, SPIN_MS = 3600, SEG = 12, STEP = 360 / SEG;

  Object.assign(I18N.ru, {
    wh_title: 'Колесо фортуны',
    wh_desc: 'Бесплатное вращение раз в 6 часов. Ещё одно — за просмотр рекламы.',
    wh_spin: 'Крутить',
    wh_spin_ad: 'Вращение за рекламу',
    wh_free_in: 'Бесплатно через',
    wh_ad_in: 'Реклама через',
    wh_ready: 'Бесплатное вращение готово',
    wh_spinning: 'Колесо крутится…',
    wh_got: 'Выпало',
    wh_coins: 'Монеты',
    wh_jack: 'Крупный выигрыш',
    wh_xp: 'Опыт',
    wh_ticket: 'Билет на кейс',
    wh_tickets: 'Билеты на кейс',
    wh_item: 'Редкий предмет',
    wh_rare: 'Редкий',
    wh_odds: 'Шансы',
    wh_ticket_hint: 'Откройте кейс «{c}» бесплатно на его странице',
    wh_to_case: 'К кейсу',
    wh_inv_full: 'Инвентарь полон — вместо предмета выпали монеты',
  });
  Object.assign(I18N.en, {
    wh_title: 'Wheel of fortune',
    wh_desc: 'A free spin every 6 hours. One more for watching an ad.',
    wh_spin: 'Spin',
    wh_spin_ad: 'Spin for an ad',
    wh_free_in: 'Free in',
    wh_ad_in: 'Ad spin in',
    wh_ready: 'Free spin is ready',
    wh_spinning: 'Spinning…',
    wh_got: 'You got',
    wh_coins: 'Coins',
    wh_jack: 'Big win',
    wh_xp: 'Experience',
    wh_ticket: 'Case ticket',
    wh_tickets: 'Case tickets',
    wh_item: 'Rare item',
    wh_rare: 'Rare',
    wh_odds: 'Odds',
    wh_ticket_hint: 'Open the “{c}” case for free on its page',
    wh_to_case: 'To the case',
    wh_inv_full: 'Inventory is full — you got coins instead of the item',
  });

  // ================= Призы =================
  // k — вид, w — вес (сумма 100 = проценты), m — доля бюджета E для монет, x — доля опыта уровня, n — билетов
  const PRIZES = {
    c1: { w: 29, m: 0.6 },
    c2: { w: 20, m: 1.2 },
    c3: { w: 8, m: 2.5 },
    c4: { w: 2, m: 8 },
    x1: { w: 14, x: 0.25 },
    x2: { w: 6, x: 0.6 },
    t1: { w: 14, n: 1 },
    t2: { w: 5, n: 2 },
    it: { w: 2 },
  };
  // Сегменты колеса по кругу (по часовой стрелке от указателя); у вида может быть несколько сегментов
  const SEGS = ['c1', 'x1', 'c2', 't1', 'c1', 'c4', 'c2', 'x2', 'c1', 't2', 'c3', 'it'];
  const KEYS = Object.keys(PRIZES);
  const isCoin = (k) => k.charAt(0) === 'c';
  const kindOf = (k) => (isCoin(k) ? 'coins' : k === 'x1' || k === 'x2' ? 'xp' : k === 'it' ? 'item' : 'ticket');

  const lv = () => (typeof XP !== 'undefined' && XP.level ? Math.max(1, XP.level()) : 1);
  // Монет за минуту активного фарма: клик раз в секунду + доход
  const farmMin = () => (G.clickPower() + G.income()) * 60;
  const minutes = (l) => 11 + 5 * Math.min(1, (l - 1) / 49);
  const budget = () => farmMin() * minutes(lv());

  // Монеты приза: «красивое» число (до 100 — целые, дальше шаг 5 / 10 / 50…)
  function nice(v) {
    if (v < 100) return Math.max(1, Math.round(v));
    const g = Math.pow(10, Math.floor(Math.log10(v)) - 1) * (v < 300 ? 0.5 : 1);
    return Math.round(v / g) * g;
  }
  const coinsOf = (k) => nice(budget() * PRIZES[k].m);

  // Опыт приза: доля опыта текущего уровня (не меньше 20)
  function xpOf(k) {
    if (typeof XP === 'undefined' || !XP.info) return 0;
    const need = XP.info().need || 100;
    return Math.max(20, Math.round(need * PRIZES[k].x / 5) * 5);
  }

  // Кейс для билета: по уровню игрока (потолок цены раздела) и не дороже 1.6 E; реликвии и ультра — никогда
  const LV_CAP = [[5, 35], [10, 60], [20, 300], [35, 2000], [60, 10000], [101, 15000]];
  function ticketCases() {
    const l = lv();
    let cap = 15000;
    for (let i = 0; i < LV_CAP.length; i++) if (l < LV_CAP[i][0]) { cap = LV_CAP[i][1]; break; }
    cap = Math.min(cap, budget() * 1.6);
    const ok = CASES.filter((c) => c.sec !== 'relics' && c.sec !== 'ultra' && c.price > 0);
    let list = ok.filter((c) => c.price <= cap).sort((a, b) => b.price - a.price).slice(0, 4);
    if (!list.length) list = ok.sort((a, b) => a.price - b.price).slice(0, 1);
    return list;
  }

  // Средний кейс игрока: скользящее среднее цены платных открытий (без данных — оценка по бюджету)
  const avgCase = () => W().avg || Math.max(9.99, budget());
  // Редкий предмет: от 40 % до 100 % потолка min(5 средних кейсов, 12 E); редкость от «редкого» и не реликвия
  function rollItem() {
    const hi = Math.min(avgCase() * 5, budget() * 12), lo = hi * 0.4;
    const f = G.rollFloat();
    const val = (s) => G.instValue({ s: s.id, f: f });
    const base = SKIN_LIST.filter((s) => !G.isSecret(s.id) && s.r >= 2 && s.r < 7);
    let list = base.filter((s) => { const v = val(s); return v >= lo && v <= hi; });
    if (!list.length) list = base.filter((s) => val(s) <= hi).sort((a, b) => val(b) - val(a)).slice(0, 5);
    if (!list.length) list = base.sort((a, b) => val(a) - val(b)).slice(0, 1);
    const s = list[Math.floor(Math.random() * list.length)];
    return { s: s.id, f: f };
  }

  // ================= Состояние =================
  // at — последнее бесплатное вращение, ad — последнее за рекламу, n — всего вращений, avg — средний кейс,
  // pend — приз, ещё не выданный (колесо крутится; выдаётся и после перезагрузки), last — последний приз (карточка)
  const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);
  function cleanPrize(p) {
    if (!p || typeof p !== 'object' || !PRIZES[p.k]) return null;
    const o = { k: p.k, seg: Math.min(SEG - 1, Math.floor(num(p.seg))) };
    if (isCoin(p.k)) o.v = round2(num(p.v));
    else if (p.k === 'x1' || p.k === 'x2') o.v = Math.floor(num(p.v));
    else if (p.k === 'it') { if (!SKINS[p.s] || G.isSecret(p.s)) return null; o.s = p.s; o.f = Math.min(1, num(p.f)); }
    else { if (!CASE_BY_ID[p.c]) return null; o.c = p.c; o.v = Math.max(1, Math.min(9, Math.floor(num(p.v)))); }
    if (p.alt) o.alt = 1;
    return o;
  }
  G.ext('wheel', {
    def: () => ({ at: 0, ad: 0, n: 0, avg: 0, pend: null, last: null }),
    clean: (r) => ({ at: num(r.at), ad: num(r.ad), n: Math.floor(num(r.n)), avg: num(r.avg), pend: cleanPrize(r.pend), last: cleanPrize(r.last) }),
  });
  const W = () => G.extOf('wheel');
  const freeLeft = () => Math.max(0, W().at + FREE_CD - Date.now());
  const adLeft = () => Math.max(0, W().ad + AD_CD - Date.now());

  // Средний кейс: платные открытия
  G.on('open', (d) => {
    if (!d || d.free || !(d.price > 0)) return;
    const w = W();
    w.avg = w.avg ? round2(w.avg * 0.85 + d.price * 0.15) : d.price;
  });

  // ================= Розыгрыш и выдача =================
  function pickKind() {
    let r = Math.random() * 100;
    for (let i = 0; i < KEYS.length; i++) { r -= PRIZES[KEYS[i]].w; if (r < 0) return KEYS[i]; }
    return 'c1';
  }
  // Приз без выдачи: вид, сегмент колеса, конкретная сумма / кейс / предмет
  function roll() {
    let k = pickKind();
    if ((k === 'x1' || k === 'x2') && typeof XP === 'undefined') k = 'c1';   // без модуля опыта — монеты
    const segs = [];
    SEGS.forEach((x, i) => { if (x === k) segs.push(i); });
    const p = { k: k, seg: segs[Math.floor(Math.random() * segs.length)] };
    if (isCoin(k)) p.v = coinsOf(k);
    else if (k === 'x1' || k === 'x2') p.v = xpOf(k);
    else if (k === 'it') { const it = rollItem(); p.s = it.s; p.f = it.f; }
    else { const l = ticketCases(); p.c = l[Math.floor(Math.random() * l.length)].id; p.v = PRIZES[k].n; }
    return p;
  }

  // Выдать приз, ждущий в pend. show — играть звук (после анимации); без show — тихо (после перезагрузки)
  function apply(show) {
    const w = W(), p = w.pend;
    if (!p) return;
    w.pend = null;
    if (isCoin(p.k)) G.addCoins(p.v);
    else if (p.k === 'x1' || p.k === 'x2') { if (typeof XP !== 'undefined') XP.add(p.v, 'wheel'); }
    else if (p.k === 'it') {
      // инвентарь полон — честная замена: монеты на цену продажи этого предмета
      if (G.invFull(1)) { p.alt = 1; p.v = G.sellPrice({ s: p.s, f: p.f }); G.addCoins(p.v); }
      else G.addInst(p.s, p.f, 'wheel');
    } else G.grantTicket(p.c, p.v);
    w.last = p;
    // наружу — вид приза ('coins' | 'xp' | 'ticket' | 'item'; id — сегмент): xp.js не добавляет базовый опыт
    // за вращение к призу «опыт», и игрок получает ровно то, что написано на карточке
    G.emit('wheel', { prize: Object.assign({}, p, { k: p.alt ? 'coins' : kindOf(p.k), id: p.k }) });
    G.save(true);
    if (show) {
      if (p.k === 'it' && !p.alt) Sfx.win(Math.min(5, SKINS[p.s].r));
      else if (p.k === 'c4') Sfx.win(3);
      else Sfx.coin();
      if (p.alt) UI.toast(t('wh_inv_full'), 'bad');
    }
    G.changed();
  }
  // Приз, не выданный до перезагрузки (вкладку закрыли, пока колесо крутилось), — выдаём при входе
  G.on('login', () => apply(false));

  // ================= Вращение =================
  let busy = false, rot = 0, raf = 0;
  const mod = (a, n) => ((a % n) + n) % n;

  // Текущий угол диска (для щелчков храповика при проходе сегмента под указателем)
  function angleOf(el) {
    const m = getComputedStyle(el).transform;
    if (!m || m === 'none') return 0;
    const v = m.slice(m.indexOf('(') + 1, -1).split(',').map(Number);
    return Math.atan2(v[1], v[0]) * 180 / Math.PI;
  }

  // Подписи сегментов всегда стоят прямо: каждая поворачивается навстречу диску на тот же угол
  // и с той же кривой, что и сам диск, — во время вращения и после остановки текст не переворачивается.
  const EASE = 'cubic-bezier(.16,.62,.14,1)';
  const labTf = (i) => 'translate(-50%,-50%) rotate(' + (-(i * STEP + rot)) + 'deg)';
  function turn(disc, tr) {
    disc.style.transition = tr;
    disc.style.transform = 'rotate(' + rot + 'deg)';
    disc.querySelectorAll('.wh-seg span').forEach((sp, i) => { sp.style.transition = tr; sp.style.transform = labTf(i); });
  }

  // Повернуть диск так, чтобы под указатель встал сегмент seg; ms — длительность (замедление к концу)
  function animate(seg, ms, done) {
    const disc = document.querySelector('#rw-wheel .wh-disc');
    const target = mod(-seg * STEP + (Math.random() - 0.5) * STEP * 0.6, 360);
    let next = rot - mod(rot, 360) + 360 * 5 + target;
    if (next - rot < 360 * 4) next += 360;
    rot = next;
    if (!disc || ms <= 0) {
      if (disc) turn(disc, 'none');
      setTimeout(done, Math.max(0, ms));
      return;
    }
    turn(disc, 'transform ' + ms + 'ms ' + EASE);
    let last = -1;
    const end = performance.now() + ms;
    cancelAnimationFrame(raf);
    const loop = () => {
      const i = Math.floor(mod(angleOf(disc) + STEP / 2, 360) / STEP);
      if (last >= 0 && i !== last) Sfx.tick();
      last = i;
      if (performance.now() < end) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setTimeout(done, ms + 80);
  }

  // mode: 'free' | 'ad'; ms — длительность анимации (по умолчанию 3.6 с; прогон-проверка передаёт 0)
  function spin(mode, ms) {
    if (busy) return false;
    const w = W();
    if (w.pend) apply(false);
    if (mode === 'ad' ? adLeft() > 0 : freeLeft() > 0) return false;
    const p = roll();
    if (mode === 'ad') w.ad = Date.now(); else w.at = Date.now();
    w.n++;
    w.pend = p;
    G.save(true);
    busy = true;
    sig = '';
    tick();
    animate(p.seg, ms == null ? SPIN_MS : ms, () => { busy = false; sig = ''; apply(true); tick(); });
    return true;
  }

  UI.actions['wh-spin'] = function () { spin('free'); };
  UI.actions['wh-ad'] = function () {
    if (busy || adLeft() > 0 || freeLeft() <= 0) return;
    G.rewarded(() => { spin('ad'); });
  };

  // ================= Отрисовка =================
  const COIN = '<i class="ci"></i>';
  let sig = '', sigRes = '', root = null;

  // Подпись сегмента: значок и короткое значение
  function segLabel(k) {
    const ic = UI.ic;
    if (isCoin(k)) return (k === 'c4' ? ic('crown') : COIN) + '<b>' + UI.short(coinsOf(k)) + '</b>';
    if (k === 'x1' || k === 'x2') return ic('star') + '<b>' + UI.short(xpOf(k)) + '<small>XP</small></b>';
    if (k === 'it') return ic('gem') + '<small>' + t('wh_rare') + '</small>';
    return ic('cases') + '<b>×' + PRIZES[k].n + '</b>';
  }

  // Заливка диска: сегменты через один чуть светлее / темнее, крупный выигрыш и предмет — ещё на шаг светлее (без золота)
  function discBg() {
    const parts = SEGS.map((k, i) => {
      const c = k === 'c4' || k === 'it' ? 'rgba(255,255,255,.1)' : i % 2 ? 'rgba(0,0,0,.24)' : 'rgba(255,255,255,.045)';
      return c + ' ' + (i * STEP) + 'deg ' + ((i + 1) * STEP) + 'deg';
    });
    return 'conic-gradient(from ' + (-STEP / 2) + 'deg,' + parts.join(',') + ')';
  }

  function discHTML() {
    return '<div class="wh-disc" style="background:' + discBg() + ';transform:rotate(' + rot + 'deg)">' +
      SEGS.map((k, i) => '<div class="wh-seg k-' + k + '" style="transform:rotate(' + (i * STEP) + 'deg)"><span style="transform:' + labTf(i) + '">' + segLabel(k) + '</span></div>').join('') +
      '</div>';
  }

  // Таймер: каждая цифра — в своей ячейке одной ширины (не «прыгает»)
  function cdHTML(ms) {
    const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
    const p = (n) => (n < 10 ? '0' + n : String(n));
    const cell = (v) => v.split('').map((c) => '<i>' + c + '</i>').join('');
    return '<span>' + cell(p(h)) + '</span><em>:</em><span>' + cell(p(m)) + '</span><em>:</em><span>' + cell(p(x)) + '</span>';
  }

  // Карточка приза (последний выигрыш)
  function cardHTML(p) {
    let art, name, sub, cls = 'k-' + p.k, btn = '';
    if (isCoin(p.k)) {
      art = '<span class="wh-big">' + COIN + '</span>';
      name = '+' + COIN + G.fmt(p.v);
      sub = t(p.k === 'c4' ? 'wh_jack' : 'wh_coins');
    } else if (p.k === 'x1' || p.k === 'x2') {
      art = '<span class="wh-big">' + UI.ic('star') + '</span>';
      name = '+' + G.fmtInt(p.v) + ' XP';
      sub = t('wh_xp');
    } else if (p.k === 'it') {
      const sk = SKINS[p.s];
      cls += ' r' + sk.r;
      art = Art.item(p.s, p.f);
      name = (G.isStar(p.s) ? '★ ' : '') + G.skinName(p.s) + ' | ' + G.finishName(p.s);
      sub = p.alt ? t('wh_inv_full') + ' · +' + COIN + G.fmt(p.v)
        : t('rar_' + RARITIES[sk.r].id) + ' · ' + UI.wearShort(p.f) + ' · ' + COIN + G.fmt(G.sellPrice({ s: p.s, f: p.f }));
    } else {
      const c = CASE_BY_ID[p.c];
      art = '<span class="wh-crate">' + Art.crate(c) + '</span>';
      name = G.nm(c.name) + ' ×' + p.v;
      sub = t('wh_ticket_hint', { c: G.nm(c.name) });
      btn = '<button class="btn" data-act="case" data-id="' + c.id + '">' + t('wh_to_case') + '</button>';
    }
    return '<div class="wh-card ' + cls + '"><div class="wh-art">' + art + '</div>' +
      '<div class="wh-txt"><small>' + t('wh_got') + '</small><b>' + name + '</b><span>' + sub + '</span>' + btn + '</div></div>';
  }

  // Шансы по видам призов (честно: проценты равны весам)
  function oddsHTML() {
    const g = { coins: 0, xp: 0, tk: 0, it: 0 };
    KEYS.forEach((k) => {
      const w = PRIZES[k].w;
      if (isCoin(k)) g.coins += w;
      else if (k === 'x1' || k === 'x2') g[typeof XP !== 'undefined' ? 'xp' : 'coins'] += w;
      else if (k === 'it') g.it += w;
      else g.tk += w;
    });
    const row = (ic, key, v) => (v ? '<li>' + ic + '<span>' + t(key) + '</span><b>' + v + '%</b></li>' : '');
    return '<div class="wh-odds"><small>' + t('wh_odds') + '</small><ul>' +
      row(COIN, 'wh_coins', g.coins) + row(UI.ic('star'), 'wh_xp', g.xp) +
      row(UI.ic('cases'), 'wh_tickets', g.tk) + row(UI.ic('gem'), 'wh_item', g.it) + '</ul></div>';
  }

  function render(el) {
    root = el || document.getElementById('rw-wheel');
    if (!root) return;
    root.innerHTML = '<h2 class="sec-h"><span>' + t('wh_title') + '</span></h2>' +
      '<div class="wh glass"><div class="wh-stage"><div class="wh-wheel"><div class="wh-slot"></div><i class="wh-ptr"></i>' +
      '<div class="wh-hub">' + UI.ic('rewards') + '</div></div></div>' +
      '<div class="wh-side"><div class="wh-res"></div>' +
      '<div class="wh-ctl"><div class="wh-st"><small></small><div class="wh-cd"></div></div>' +
      '<div class="wh-btns"><button class="btn primary big" data-act="wh-spin">' + t('wh_spin') + '</button>' +
      '<button class="btn" data-act="wh-ad">' + UI.ic('play') + '<span>' + t('wh_spin_ad') + '</span></button></div></div>' +
      oddsHTML() + '</div></div>';
    // диск рисуем сразу (и во время вращения — уже в конечном положении, если экран открыли заново)
    root.querySelector('.wh-slot').innerHTML = discHTML();
    sig = [UI.short(budget()), lv(), G.lang].join();
    sigRes = '';
    tick();
  }

  function tick() {
    if (!root || !root.isConnected) return;
    const q = (s) => root.querySelector(s);
    // подписи сегментов зависят от дохода и уровня — перерисовываем диск только между вращениями
    const s = [UI.short(budget()), lv(), G.lang].join();
    if (!busy && s !== sig) { sig = s; q('.wh-slot').innerHTML = discHTML(); }
    const w = W(), fl = freeLeft(), al = adLeft(), ready = fl <= 0;
    const r = busy ? 'busy' : w.last ? JSON.stringify(w.last) + G.lang : 'intro' + G.lang;
    if (r !== sigRes) {
      sigRes = r;
      // пока колесо крутится — подсказка вместо прошлого приза (состояние «крутится» — строкой ниже)
      q('.wh-res').innerHTML = busy || !w.last ? '<p class="wh-desc">' + t('wh_desc') + '</p>' : cardHTML(w.last);
    }
    UI.setText(q('.wh-st small'), t(busy ? 'wh_spinning' : ready ? 'wh_ready' : 'wh_free_in'));
    UI.setHTML(q('.wh-cd'), busy || ready ? '' : cdHTML(fl));
    q('.wh-st').classList.toggle('ok', ready && !busy);
    const sp = q('[data-act="wh-spin"]'), ad = q('[data-act="wh-ad"]');
    sp.disabled = busy || !ready;
    // реклама — только когда бесплатное вращение уже потрачено
    ad.hidden = ready || busy;
    ad.disabled = busy || al > 0 || G.adBusy;
    UI.setHTML(ad.querySelector('span'), t('wh_spin_ad') + (al > 0 ? ' · ' + G.fmtTime(al) : ''));
  }

  return {
    render: render, tick: tick, spin: spin, roll: roll, budget: budget, farmMin: farmMin,
    ready: () => !busy && freeLeft() <= 0, busy: () => busy, PRIZES: PRIZES, SEGS: SEGS,
  };
})();
