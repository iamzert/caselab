'use strict';

// Экран «Апгрейд»: ставка (предметы + монеты) → шанс получить более дорогой предмет.
// Шанс = ставка / цель * UPGRADE_EDGE (не больше UPGRADE_MAX). Цены считаются по цене продажи,
// поэтому апгрейд всегда немного убыточен в среднем и не даёт бесконечных денег.
const Upgrade = (function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;
  const PAGE = 24;       // 4 ряда по 6 плиток на компьютере (на телефоне — 3 в ряд)
  let stake = [];        // uid выбранных предметов
  let bal = 0;           // монеты в ставке
  let target = null;     // skinId цели
  let page = 0;
  let q = '', qMin = 0, qMax = 0;
  let invSort = 'desc';  // сортировка «Моих предметов»
  let angle = 0;         // текущий поворот стрелки
  let quick = '';        // последний быстрый выбор цели (подсветка кнопки)

  // Отделка колеса: 72 деления (каждое шестое — длинное и ярче, отдельным путём),
  // волосяная линия по краю дорожки, подписи 25/50/75 % внутри диска, узкая стрелка
  (function initRing() {
    const NS = 'http://www.w3.org/2000/svg';
    const pt = (r, a) => (100 + r * Math.cos(a)).toFixed(2) + ',' + (100 + r * Math.sin(a)).toFixed(2);
    const mk = (tag, attrs) => {
      const el = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
      return el;
    };
    let minor = '', major = '';
    for (let i = 0; i < 72; i++) {
      const a = (i * 5 - 90) * Math.PI / 180;
      if (i % 6 === 0) major += 'M' + pt(89, a) + 'L' + pt(98, a);
      else minor += 'M' + pt(91.5, a) + 'L' + pt(95.5, a);
    }
    const ticks = $('#up-ticks'), ptr = $('#up-ptr');
    ticks.setAttribute('d', minor);
    ticks.parentNode.insertBefore(mk('path', { id: 'up-ticks-major', d: major }), ticks.nextSibling);
    const deco = mk('g', { 'aria-hidden': 'true' });
    deco.appendChild(mk('circle', { class: 'up-hair', cx: 100, cy: 100, r: 87.5 }));
    [[25, 161, 100], [50, 100, 161], [75, 39, 100]].forEach((l) => {
      const tx = mk('text', { class: 'up-lab', x: l[1], y: l[2] });
      tx.textContent = l[0] + '%';
      deco.appendChild(tx);
    });
    ptr.parentNode.insertBefore(deco, ptr);
    ptr.innerHTML = '<path d="M100,37 L93,13 L107,13 Z" fill="#ffd27a" stroke="rgba(30,16,0,.6)" stroke-width=".8" stroke-linejoin="round"/>' +
      '<path d="M100,37 L100,13 L107,13 Z" fill="#e8920f"/>';
    $('#up-brand').innerHTML = UI.logo();
  })();

  function markQuick() {
    UI.$$('.up-quick button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-id') === quick));
  }

  const targetPrice = (id) => round2(SKINS[id].value * G.sellMult());
  const coinsFloor = () => Math.floor(G.S.coins * 100 + 1e-6) / 100;

  function stakeValue() {
    let v = bal;
    stake.forEach((u) => { const x = G.findInst(u); if (x) v += G.sellPrice(x); });
    return v;
  }

  // Показываемый шанс. Множители ×0.25…×3 из админ-панели видны на кольце; режим «100% (скрыто)» — нет:
  // кольцо показывает обычный шанс, а настоящий шанс победы равен 1 (realChance).
  // G.pref.up — множитель этого устройства (по умолчанию 1).
  function chance() {
    const s = stakeValue();
    if (!target || s <= 0) return 0;
    const tp = targetPrice(target);
    if (tp <= s) return 0;
    const base = Math.min(UPGRADE_MAX, s / tp * UPGRADE_EDGE);
    if (G.pref.up >= G.PREF_MAX) return base;
    return Math.min(1, base * G.pref.up);
  }
  const realChance = () => { const ch = chance(); return ch > 0 && G.pref.up >= G.PREF_MAX ? 1 : ch; };

  // ---------- Круг ----------
  function arcPath(deg) {
    if (deg <= 0) return '';
    if (deg >= 359.99) return 'M100,20 A80,80 0 1,1 99.99,20';
    const a = (deg - 90) * Math.PI / 180;
    const x = 100 + 80 * Math.cos(a), y = 100 + 80 * Math.sin(a);
    return 'M100,20 A80,80 0 ' + (deg > 180 ? 1 : 0) + ',1 ' + x.toFixed(2) + ',' + y.toFixed(2);
  }

  function renderRing() {
    const ch = chance();
    const s = stakeValue();
    $('#up-arc').setAttribute('d', arcPath(ch * 360));
    UI.setText($('#up-chance'), (ch * 100).toFixed(2) + '%');
    UI.setText($('#up-mult'), target && s > 0 && ch > 0 ? '×' + (targetPrice(target) / s).toFixed(2) : '');
    $('#up-ring').classList.toggle('ready', ch > 0);
    $('#up-ptr').setAttribute('transform', 'rotate(' + (angle % 360) + ' 100 100)');
  }

  // ---------- Панели ставки и цели ----------
  // Одна вещь в ставке — крупно, как цель; 2–4 — в две колонки; 5–6 — в три (класс nN)
  function renderStake() {
    const items = stake.map((u) => G.findInst(u)).filter(Boolean);
    stake = items.map((x) => x.u);
    const n = items.length;
    $('#up-stake').innerHTML = n === 1
      ? '<div class="up-big">' + UI.itemCard(items[0], { act: 'up-unstake' }) + '</div>'
      : n ? '<div class="mini-grid n' + n + '">' + items.map((x) => UI.itemCard(x, { act: 'up-unstake' })).join('') + '</div>'
        : '<div class="up-hint">' + UI.ic('inv') + '<span>' + t('up_stake_hint') + '</span></div>';
    UI.setHTML($('#up-sum'), t('up_sum', { v: '<b>' + COIN + G.fmt(stakeValue()) + '</b>' }));
  }

  function renderTarget() {
    if (target && !SKINS[target]) target = null;
    if (!target) quick = '';
    $('#up-target').innerHTML = target
      ? '<div class="up-big">' + UI.itemCard(target, { price: targetPrice(target) }) + '</div>'
      : '<div class="up-hint">' + UI.ic('target') + '<span>' + t('up_target_hint') + '</span></div>';
    markQuick();
  }

  function renderInv() {
    const list = G.S.inv.slice();
    if (invSort === 'asc') list.sort((a, b) => G.sellPrice(a) - G.sellPrice(b));
    else if (invSort === 'new') list.sort((a, b) => b.u - a.u);
    else list.sort((a, b) => G.sellPrice(b) - G.sellPrice(a));
    $('#up-inv').innerHTML = list.length
      ? list.map((x) => UI.itemCard(x, { act: 'up-stake', selected: stake.indexOf(x.u) >= 0 })).join('')
      : '<div class="empty small">' + t('up_empty_inv') + '</div>';
  }

  function catalog() {
    const s = stakeValue();
    return SKIN_LIST.filter((sk) => {
      const p = targetPrice(sk.id);
      if (s > 0 && p <= s) return false;
      if (qMin && p < qMin) return false;
      if (qMax && p > qMax) return false;
      if (q && (G.skinName(sk.id) + ' ' + G.finishName(sk.id)).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function renderCatalog() {
    const list = catalog();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    page = Math.max(0, Math.min(page, pages - 1));
    $('#up-cat').innerHTML = list.slice(page * PAGE, page * PAGE + PAGE)
      .map((sk) => UI.itemCard(sk.id, { act: 'up-target', useSkinId: true, price: targetPrice(sk.id), selected: sk.id === target }))
      .join('') || '<div class="empty small">' + t('nothing_found') + '</div>';
    UI.setText($('#up-page'), (page + 1) + ' / ' + pages);
  }

  function renderAll() {
    bal = Math.min(bal, coinsFloor());
    renderStake();
    renderTarget();
    renderInv();
    renderCatalog();
    renderRing();
    tick();
  }

  function tick() {
    const r = $('#up-bal-range');
    const max = coinsFloor();
    if (Number(r.max) !== max) r.max = String(max);
    // во время вращения ставка уже списана: не пересчитываем её, иначе дуга шанса поменяется на ходу
    if (bal > max && !UI.isSpinning()) { bal = max; r.value = String(bal); renderStake(); renderRing(); }
    // золотая заливка дорожки до бегунка
    const fill = (max > 0 ? Math.min(100, bal / max * 100) : 0).toFixed(2) + '%';
    if (r.style.getPropertyValue('--p') !== fill) r.style.setProperty('--p', fill);
    UI.setText($('#up-bal-val'), G.fmt(bal));
    UI.setText($('#up-bal-max'), G.fmt(max));
    const goBtn = $('#up-go'), off = UI.isSpinning() || chance() <= 0;
    goBtn.disabled = off;
    // неактивная кнопка подсказывает, чего не хватает (а не серое «АПГРЕЙД»)
    UI.setText(goBtn, t(!off || UI.isSpinning() ? 'up_btn' : stakeValue() <= 0 ? 'up_need_stake' : !target ? 'up_need_target' : 'up_need_more'));
    $('#up-fast').classList.toggle('on', G.S.settings.fast);
  }

  Screens.reg('upgrade', { render: renderAll, tick: tick });

  // ---------- Выбор ----------
  function changed() { quick = ''; markQuick(); renderStake(); renderRing(); renderCatalog(); tick(); }

  A['up-stake'] = function (u, el) {
    if (UI.isSpinning()) return;
    u = Number(u);
    const i = stake.indexOf(u);
    if (i >= 0) stake.splice(i, 1);
    else {
      if (stake.length >= G.C.UP_MAX_ITEMS) { UI.toast(t('up_max_items', { n: G.C.UP_MAX_ITEMS })); return; }
      stake.push(u);
    }
    if (el) el.classList.toggle('sel', i < 0);
    if (target && targetPrice(target) <= stakeValue()) { target = null; renderTarget(); }
    changed();
  };
  A['up-unstake'] = function (u) {
    if (UI.isSpinning()) return;
    stake = stake.filter((x) => x !== Number(u));
    renderInv();
    changed();
  };
  A['up-target'] = function (id) {
    if (UI.isSpinning()) return;
    target = id;
    quick = '';
    renderTarget();
    renderCatalog();
    renderRing();
    tick();
  };
  A['up-clear-stake'] = function () { if (UI.isSpinning()) return; stake = []; bal = 0; $('#up-bal-range').value = '0'; renderInv(); changed(); };
  A['up-clear-target'] = function () { if (UI.isSpinning()) return; target = null; renderTarget(); renderCatalog(); renderRing(); tick(); };
  A['up-page'] = function (d) { page += Number(d); renderCatalog(); };

  // Быстрый выбор цели: ×N к ставке или желаемый шанс
  A['up-quick'] = function (id) {
    const s = stakeValue();
    if (s <= 0) { UI.toast(t('up_need')); return; }
    const need = id.charAt(0) === 'x' ? s * Number(id.slice(1)) : s * UPGRADE_EDGE / (Number(id.slice(1)) / 100);
    const sk = SKIN_LIST.filter((x) => targetPrice(x.id) >= need && targetPrice(x.id) > s)[0] ||
      SKIN_LIST[SKIN_LIST.length - 1];
    if (targetPrice(sk.id) <= s) { UI.toast(t('up_cheap')); return; }
    target = sk.id;
    quick = id;
    renderTarget();
    page = Math.floor(catalog().findIndex((x) => x.id === target) / PAGE);
    renderCatalog();
    renderRing();
    tick();
  };

  document.addEventListener('change', (e) => {
    if (e.target.id !== 'up-sort') return;
    invSort = e.target.value;
    renderInv();
  });

  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'up-bal-range') {
      bal = Number(e.target.value) || 0;
      if (target && targetPrice(target) <= stakeValue()) { target = null; renderTarget(); }
      changed();
    } else if (id === 'up-search' || id === 'up-min' || id === 'up-max') {
      q = $('#up-search').value.trim().toLowerCase();
      qMin = Number($('#up-min').value) || 0;
      qMax = Number($('#up-max').value) || 0;
      page = 0;
      renderCatalog();
    }
  });

  // ---------- Драматургия вращения ----------
  // Зависит от ПОКАЗАННОГО шанса (режим «100% (скрыто)» крутится так же, как обычный апгрейд с тем же
  // шансом). Чем шанс ниже, тем дольше вращение, больше оборотов и длиннее плавный хвост, а при малых
  // шансах в самом конце стрелка ещё долго ползёт к остановке, щелчки редеют.
  // Опорные точки по логарифму шанса: [шанс, секунды, обороты, степень хвоста k, ползучесть A, °/с²].
  // 80 % ≈ 3 с · 30 % ≈ 5 с · 5 % ≈ 8 с · 1 % ≈ 10 с · 0.1 % и ниже ≈ 11 с; турбо — 35 % этого времени.
  const SPIN = [
    [0.8, 3.0, 3, 2.6, 0],
    [0.3, 5.0, 5, 3.0, 0],
    [0.12, 6.6, 6, 3.4, 0],
    [0.05, 8.0, 7, 3.7, 2.0],
    [0.01, 10.0, 9, 4.0, 1.7],
    [0.001, 11.0, 10, 4.2, 1.5],
  ];
  const TURBO = 0.35;       // доля времени в турбо-режиме
  const TICK_DEG = 5;       // щелчок — стрелка проходит деление шкалы (они через 5°)
  const TICK_GAP = 50;      // мс; на большой скорости щелчки сливаются в ровный треск

  function spinPlan(ch, fast) {
    const lg = (c) => -Math.log10(c), n = SPIN.length - 1;
    const x = Math.min(lg(SPIN[n][0]), Math.max(lg(SPIN[0][0]), lg(Math.max(ch, 1e-9))));
    let i = 0;
    while (i < n - 1 && x > lg(SPIN[i + 1][0])) i++;
    const a = SPIN[i], b = SPIN[i + 1], f = (x - lg(a[0])) / (lg(b[0]) - lg(a[0]));
    const at = (j) => a[j] + (b[j] - a[j]) * f;
    const s = fast ? TURBO : 1;
    return {
      dur: Math.max(1000, at(1) * 1000 * s),
      turns: fast ? Math.max(1, Math.round(at(2) * 0.4)) : Math.round(at(2)),
      k: at(3),
      creep: at(4) / (s * s),     // тот же хвост в градусах, только сжатый по времени
      up: fast ? 140 : 380,       // разгон, мс
    };
  }

  // Кривая вращения по нормированному времени u ∈ [0, 1]. Скорость
  //   v(u) = разгон(u) · [(1 − u)^(k−1) + c · (1 − u)]:
  // степенная часть — длинный плавный хвост, линейная — ползучесть с постоянным торможением в самом
  // конце (осталось ≈ A·τ² градусов за τ секунд до остановки; без неё стрелка при больших k «замирает»
  // на секунду раньше итога). Путь — по таблице накопленного интеграла: стрелка приходит ровно в точку
  // броска, скорость падает монотонно — никаких отскоков через границу зоны.
  function spinCurve(P, dist) {
    const N = 1024, T = P.dur / 1000, ua = P.up / P.dur;
    const rise = (u) => (u < ua ? 1 - (1 - u / ua) * (1 - u / ua) : 1);
    let zp = 0;
    for (let i = 0; i < N; i++) { const u = (i + 0.5) / N; zp += rise(u) * Math.pow(1 - u, P.k - 1) / N; }
    const at2 = P.creep * T * T;
    const c = at2 > 0 ? 2 * at2 * zp / Math.max(dist - at2, dist * 0.5) : 0;
    const w = (u) => rise(u) * (Math.pow(1 - u, P.k - 1) + c * (1 - u));
    const F = new Float64Array(N + 1);
    let prev = w(0);
    for (let i = 1; i <= N; i++) { const cur = w(i / N); F[i] = F[i - 1] + (prev + cur) / 2; prev = cur; }
    const z = F[N];
    return {
      pos: (u) => {
        if (u >= 1) return 1;
        const x = Math.max(0, u) * N, i = Math.floor(x);
        return (F[i] + (F[i + 1] - F[i]) * (x - i)) / z;
      },
      speed: (u) => (u >= 1 ? 0 : dist * w(u) * N / z / T),   // °/с
    };
  }

  // ---------- Эффекты вращения ----------
  // Смаз стрелки: полупрозрачный след по дорожке длиной примерно в путь за 50 мс; на малой скорости
  // исчезает. Подсветка зоны шанса: пока небыстрая стрелка над зоной, дуга светлеет (.hot, переход в CSS).
  // Деление шкалы, которое стрелка только что прошла на малой скорости, коротко вспыхивает — щелчок
  // становится видимым.
  const fx = { ok: false, trail: null, grad: null, hot: null, mark: null, zone: 0, isHot: false, trailOn: false };
  const polar = (r, deg) => {
    const a = deg * Math.PI / 180;
    return [100 + r * Math.sin(a), 100 - r * Math.cos(a)];
  };
  const pxy = (p) => p[0].toFixed(2) + ',' + p[1].toFixed(2);

  function fxInit() {
    if (fx.ok) return true;
    const svg = $('#up-ring svg'), arc = $('#up-arc'), ptr = $('#up-ptr');
    const defs = svg && svg.querySelector('defs');
    if (!defs || !arc || !ptr) return false;
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs) => {
      const el = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
      return el;
    };
    fx.grad = mk('linearGradient', { id: 'up-trail-g', gradientUnits: 'userSpaceOnUse' });
    fx.grad.appendChild(mk('stop', { offset: '0', 'stop-color': '#ffd27a', 'stop-opacity': '0' }));
    fx.grad.appendChild(mk('stop', { offset: '1', 'stop-color': '#ffd27a', 'stop-opacity': '.42' }));
    defs.appendChild(fx.grad);
    fx.hot = mk('path', { id: 'up-arc-hot', d: '', fill: 'none', stroke: '#fff', 'stroke-width': '15', opacity: '0' });
    arc.parentNode.insertBefore(fx.hot, arc.nextSibling);
    fx.trail = mk('path', { id: 'up-trail', d: '', fill: 'url(#up-trail-g)', opacity: '0' });
    ptr.parentNode.insertBefore(fx.trail, ptr);
    const scale = $('#up-ticks-major') || $('#up-ticks');
    if (scale && typeof scale.animate === 'function') {
      fx.mark = mk('path', { id: 'up-tick-hit', d: '', fill: 'none', stroke: '#fff', 'stroke-width': '1.4', opacity: '0' });
      scale.parentNode.insertBefore(fx.mark, scale.nextSibling);
    }
    fx.ok = true;
    return true;
  }

  // вспышка деления deg (кратно 5°): длинные деления через 30°, как на шкале из initRing
  function fxMark(deg) {
    if (!fx.mark) return;
    const major = Math.round(deg / 5) % 6 === 0;
    fx.mark.setAttribute('d', 'M' + pxy(polar(major ? 89 : 91.5, deg)) + 'L' + pxy(polar(major ? 98 : 95.5, deg)));
    fx.mark.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 320, easing: 'ease-out' });
  }

  function fxFrame(ang, v) {
    const len = Math.min(70, v * 0.05);
    const o = Math.min(1, (v - 120) / 580);
    if (o > 0 && len >= 1) {
      const a0 = ang - len, p0 = polar(80, a0), p1 = polar(80, ang);
      fx.trail.setAttribute('d', 'M' + pxy(polar(87, a0)) + 'A87,87 0 0,1 ' + pxy(polar(87, ang)) +
        'L' + pxy(polar(73, ang)) + 'A73,73 0 0,0 ' + pxy(polar(73, a0)) + 'Z');
      fx.grad.setAttribute('x1', p0[0].toFixed(2));
      fx.grad.setAttribute('y1', p0[1].toFixed(2));
      fx.grad.setAttribute('x2', p1[0].toFixed(2));
      fx.grad.setAttribute('y2', p1[1].toFixed(2));
      fx.trail.setAttribute('opacity', o.toFixed(3));
      fx.trailOn = true;
    } else if (fx.trailOn) {
      fx.trail.setAttribute('opacity', '0');
      fx.trailOn = false;
    }
    const hot = v < 420 && ((ang % 360) + 360) % 360 < fx.zone;
    if (hot !== fx.isHot) { fx.isHot = hot; $('#up-ring').classList.toggle('hot', hot); }
  }

  function fxReset() {
    fx.trail.setAttribute('opacity', '0');
    fx.trailOn = false;
    fx.isHot = false;
    $('#up-ring').classList.remove('hot');
    fx.hot.setAttribute('d', '');
  }

  // ---------- Запуск апгрейда ----------
  async function go() {
    const ch = chance(), real = realChance();   // считаем до списания ставки
    if (UI.isSpinning() || ch <= 0) { UI.toast(t('up_need')); return; }
    if (!stake.length && G.invFull(1)) { UI.toast(t('inv_full', { n: INVENTORY_MAX }), 'bad'); return; }
    if (!G.canPay(bal)) { UI.toast(t('not_enough'), 'bad'); return; }

    // Ставка списывается сразу
    G.spend(bal);
    G.removeInsts(stake);
    const tgt = target;
    // при гарантированной победе стрелка останавливается внутри видимой зелёной зоны
    const roll = real >= 1 ? Math.random() * ch * 0.98 : Math.random();
    const win = roll < real;
    G.S.upgrades++;
    G.track('u', 1);
    if (win) { G.S.upWins++; G.track('uw', 1); }
    let inst = null;
    if (win) inst = G.addInst(tgt, G.rollFloat('ft'), 'up').inst;
    G.save(false);

    UI.setSpinning(true);
    const fast = G.S.settings.fast;
    // turns полных оборотов, затем стрелка встаёт ровно в точку броска roll·360° (зона шанса — [0, ch·360°))
    const plan = spinPlan(ch, fast);
    const from = angle;
    const dist = 360 * plan.turns + (((roll * 360 - from) % 360) + 360) % 360;
    const curve = spinCurve(plan, dist);
    const ptr = $('#up-ptr');
    const fxOn = fxInit();
    if (fxOn) { fx.zone = ch * 360; fx.hot.setAttribute('d', $('#up-arc').getAttribute('d') || ''); }
    let lastTick = Math.floor(from / TICK_DEG), lastSnd = -1e9;
    await new Promise((resolve) => {
      let t0 = 0;
      function frame(now) {
        if (!t0) t0 = now;
        const u = Math.min(1, (now - t0) / plan.dur);
        angle = from + dist * curve.pos(u);
        ptr.setAttribute('transform', 'rotate(' + (angle % 360).toFixed(3) + ' 100 100)');
        const v = curve.speed(u);
        if (fxOn) fxFrame(angle, v);
        // щелчок на каждом делении; чем медленнее стрелка, тем реже щелчки
        const tk = Math.floor(angle / TICK_DEG);
        if (tk !== lastTick) {
          lastTick = tk;
          if (fxOn && v < 200) fxMark(tk * TICK_DEG);
          if (now - lastSnd >= TICK_GAP) { lastSnd = now; Sfx.tick(); }
        }
        if (u < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });

    // Итог: стрелка замерла — вспышка по дорожке, звук, частицы. Кольцо ещё миг держит зону и шанс,
    // чтобы было видно, где остановилась стрелка, и только потом сбрасывается.
    const ring = $('#up-ring');
    ring.classList.remove('win', 'lose'); void ring.offsetWidth;
    ring.classList.add(win ? 'win' : 'lose');
    if (win) {
      Sfx.upWin();
      const rb = ring.getBoundingClientRect();
      UI.burst(rb.left + rb.width / 2, rb.top + rb.height / 2, RARITIES[SKINS[tgt].r].color, 40);
    } else {
      Sfx.upLose();
      UI.toast(t('up_lose'), 'bad');
    }
    await G.wait(fast ? 260 : 650);
    if (fxOn) fxReset();
    stake = [];
    bal = 0;
    quick = '';
    $('#up-bal-range').value = '0';
    UI.setSpinning(false);
    UI.renderFeed();
    renderAll();

    if (win) {
      const sk = SKINS[tgt];
      UI.modal('<h3 class="m-title">' + t('up_win') + '</h3>' +
        '<div class="drop-one r' + sk.r + '"><div class="rays"></div><div class="drop-art">' + Art.item(tgt, inst.f) + '</div></div>' +
        '<div class="drop-name">' + (G.isStar(tgt) ? '★ ' : '') + G.skinName(tgt) + ' | ' + G.finishName(tgt) + '</div>' +
        '<div class="drop-wear">' + UI.wearShort(inst.f) + ' · ' + COIN + G.fmt(G.sellPrice(inst)) + '</div>' +
        '<div class="m-btns"><button class="btn primary big" data-act="close">' + t('take') + '</button></div>',
        { onClose: () => G.maybeInterstitial() });
    } else {
      G.opensSinceAd++;
    }
  }

  A['up-go'] = function () { go(); };

  return {
    preselect: function (u) { stake = [u]; bal = 0; target = null; page = 0; },
  };
})();
