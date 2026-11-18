'use strict';

// Экран «Апгрейд»: ставка (предметы + монеты) → шанс получить более дорогой предмет.
// Шанс = ставка / цель * UPGRADE_EDGE (не больше UPGRADE_MAX). Цены считаются по цене продажи,
// поэтому апгрейд всегда немного убыточен в среднем и не даёт бесконечных денег.
const Upgrade = (function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;
  const PAGE = 24;
  let stake = [];        // uid выбранных предметов
  let bal = 0;           // монеты в ставке
  let target = null;     // skinId цели
  let page = 0;
  let q = '', qMin = 0, qMax = 0;
  let invSort = 'desc';  // сортировка «Моих предметов»
  let angle = 0;         // текущий поворот стрелки

  // Шкала вокруг колеса: 72 деления, каждое шестое длиннее
  (function initTicks() {
    let d = '';
    for (let i = 0; i < 72; i++) {
      const a = (i * 5 - 90) * Math.PI / 180, major = i % 6 === 0;
      const r1 = major ? 89 : 91, r2 = major ? 98 : 95;
      d += 'M' + (100 + r1 * Math.cos(a)).toFixed(2) + ',' + (100 + r1 * Math.sin(a)).toFixed(2) +
        'L' + (100 + r2 * Math.cos(a)).toFixed(2) + ',' + (100 + r2 * Math.sin(a)).toFixed(2);
    }
    $('#up-ticks').setAttribute('d', d);
  })();

  const targetPrice = (id) => round2(SKINS[id].value * G.sellMult());
  const coinsFloor = () => Math.floor(G.S.coins * 100 + 1e-6) / 100;

  function stakeValue() {
    let v = bal;
    stake.forEach((u) => { const x = G.findInst(u); if (x) v += G.sellPrice(x); });
    return v;
  }

  // Показываемый шанс. Множители ×0.25…×3 из админ-панели видны на кольце; режим «100% (скрыто)» — нет:
  // кольцо показывает обычный шанс, а настоящий шанс победы равен 1 (realChance).
  // Подкрутка хранится только на устройстве администратора — у остальных игроков шансы честные.
  function chance() {
    const s = stakeValue();
    if (!target || s <= 0) return 0;
    const tp = targetPrice(target);
    if (tp <= s) return 0;
    const base = Math.min(UPGRADE_MAX, s / tp * UPGRADE_EDGE);
    if (G.odds.up >= G.ODDS_WIN) return base;
    return Math.min(1, base * G.odds.up);
  }
  const realChance = () => { const ch = chance(); return ch > 0 && G.odds.up >= G.ODDS_WIN ? 1 : ch; };

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
  function renderStake() {
    const items = stake.map((u) => G.findInst(u)).filter(Boolean);
    stake = items.map((x) => x.u);
    $('#up-stake').innerHTML = items.length
      ? '<div class="mini-grid">' + items.map((x) => UI.itemCard(x, { act: 'up-unstake' })).join('') + '</div>'
      : '<div class="up-hint">' + t('up_stake_hint') + '</div>';
    UI.setHTML($('#up-sum'), t('up_sum', { v: COIN + G.fmt(stakeValue()) }));
  }

  function renderTarget() {
    if (target && !SKINS[target]) target = null;
    $('#up-target').innerHTML = target
      ? '<div class="up-big">' + UI.itemCard(target, { price: targetPrice(target) }) + '</div>'
      : '<div class="up-hint">' + t('up_target_hint') + '</div>';
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
    if (bal > max) { bal = max; r.value = String(bal); renderStake(); renderRing(); }
    UI.setText($('#up-bal-val'), G.fmt(bal));
    $('#up-go').disabled = UI.isSpinning() || chance() <= 0;
    $('#up-fast').classList.toggle('on', G.S.settings.fast);
  }

  Screens.reg('upgrade', { render: renderAll, tick: tick });

  // ---------- Выбор ----------
  function changed() { renderStake(); renderRing(); renderCatalog(); tick(); }

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
    const from = angle;
    const to = Math.ceil(from / 360) * 360 + 360 * (fast ? 2 : 5) + roll * 360;
    const dur = fast ? 1500 : 4500;
    const t0 = performance.now();
    let lastTick = Math.floor(from / 12);
    await new Promise((resolve) => {
      function frame(now) {
        const p = Math.min(1, (now - t0) / dur);
        angle = from + (to - from) * (1 - Math.pow(1 - p, 3));
        $('#up-ptr').setAttribute('transform', 'rotate(' + (angle % 360) + ' 100 100)');
        const tk = Math.floor(angle / 12);
        if (tk !== lastTick) { lastTick = tk; Sfx.tick(); }
        if (p < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });

    const ring = $('#up-ring');
    ring.classList.remove('win', 'lose'); void ring.offsetWidth;
    ring.classList.add(win ? 'win' : 'lose');
    stake = [];
    bal = 0;
    $('#up-bal-range').value = '0';
    UI.setSpinning(false);
    UI.renderFeed();
    renderAll();

    if (win) {
      Sfx.upWin();
      const sk = SKINS[tgt];
      const rb = ring.getBoundingClientRect();
      UI.burst(rb.left + rb.width / 2, rb.top + rb.height / 2, RARITIES[sk.r].color, 40);
      UI.modal('<h3 class="m-title">' + t('up_win') + '</h3>' +
        '<div class="drop-one r' + sk.r + '"><div class="rays"></div><div class="drop-art">' + Art.item(tgt, inst.f) + '</div></div>' +
        '<div class="drop-name">' + (G.isStar(tgt) ? '★ ' : '') + G.skinName(tgt) + ' | ' + G.finishName(tgt) + '</div>' +
        '<div class="drop-wear">' + UI.wearShort(inst.f) + ' · ' + COIN + G.fmt(G.sellPrice(inst)) + '</div>' +
        '<div class="m-btns"><button class="btn primary big" data-act="close">' + t('take') + '</button></div>',
        { onClose: () => G.maybeInterstitial() });
    } else {
      Sfx.upLose();
      UI.toast(t('up_lose'), 'bad');
      G.opensSinceAd++;
    }
  }

  A['up-go'] = function () { go(); };

  return {
    preselect: function (u) { stake = [u]; bal = 0; target = null; page = 0; },
  };
})();
