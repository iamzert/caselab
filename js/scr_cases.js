'use strict';

// Экраны «Кейсы» (список) и «Кейс» (открытие с рулеткой)
(function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;
  const COUNTS = [1, 2, 3, 5, 10, 15];
  const MINI_FROM = 6;   // с этого количества вместо лент — сетка маленьких окон
  const MINI_N = 9;      // карточек в ленте мини-окна
  let cur = null;        // текущий кейс
  let count = 1;         // сколько открывать за раз
  let query = '';
  let lastResult = null; // { items: [inst], isNew: [] }

  // ================= Список кейсов =================
  function caseMatches(c, q) {
    if (!q) return true;
    if (G.nm(c.name).toLowerCase().indexOf(q) >= 0) return true;
    return c.items.some((id) => (G.skinName(id) + ' ' + G.finishName(id)).toLowerCase().indexOf(q) >= 0);
  }

  function renderList() {
    let html = '';
    SECTIONS.forEach((sec) => {
      const list = CASES.filter((c) => c.sec === sec.id && caseMatches(c, query));
      if (!list.length) return;
      html += '<h2 class="sec-h">' + G.nm(sec.name) + '<span class="sec-n">' + list.length + '</span></h2><div class="case-grid">' + list.map(UI.caseCard).join('') + '</div>';
    });
    $('#case-sections').innerHTML = html || '<div class="empty">' + t('nothing_found') + '</div>';
  }

  Screens.reg('cases', { render: renderList });

  document.addEventListener('input', (e) => {
    if (e.target.id !== 'case-search') return;
    query = e.target.value.trim().toLowerCase();
    renderList();
    UI.refresh();
  });

  // ================= Страница кейса =================
  function freeReady() { return cur && cur.id === FREE_CASE_ID && Date.now() >= G.S.freeAt; }

  function renderCase(id) {
    if (id) cur = CASE_BY_ID[id] || cur;
    if (!cur) return;
    Art.prewarm(cur.items.map(Art.itemKey));
    $('#cp-crate').innerHTML = Art.crate(cur);
    UI.setText($('#cp-name'), G.nm(cur.name));
    $('#cp-count').innerHTML = COUNTS.map((n) =>
      '<button class="cnt' + (n === count ? ' on' : '') + '" data-act="count" data-id="' + n + '" data-lock="1">×' + n + '</button>').join('');
    renderIdle();
    renderContents();
    tick();
  }

  // ---------- Мини-окна: по одному на кейс, лента едет вертикально (CSS-переход на видеокарте) ----------
  function miniCard(id, f) {
    return '<div class="mc r' + SKINS[id].r + '"><div class="mc-art">' + Art.item(id, f) + '</div></div>';
  }

  function renderMiniIdle() {
    let html = '';
    for (let k = 0; k < count; k++) html += '<div class="mroll"><div class="mstrip">' + miniCard(G.rollSkin(cur), null) + '</div></div>';
    $('#cp-rolls').innerHTML = '<div class="mgrid">' + html + '</div>';
  }

  function spinMini(roll, winner, fast, delay, withSound) {
    return new Promise((resolve) => {
      const strip = roll.querySelector('.mstrip');
      const w = G.caseWeights(cur);
      let html = '';
      for (let i = 0; i < MINI_N - 1; i++) html += miniCard(G.rollSkin(cur, w), null);
      strip.innerHTML = html + miniCard(winner.s, winner.f);
      roll.className = 'mroll';
      strip.style.transition = 'none';
      strip.style.transform = 'translate3d(0,0,0)';
      const h = roll.clientHeight;
      void strip.offsetHeight;
      const dur = (fast ? 900 : 2400) + delay;
      strip.style.transition = 'transform ' + dur + 'ms cubic-bezier(.15,.8,.25,1)';
      strip.style.transform = 'translate3d(0,' + (-(MINI_N - 1) * h) + 'px,0)';
      if (withSound) {
        // щелчки в моменты, когда карточки проходят окно (замедляются к концу)
        for (let k = 1; k < MINI_N; k++) setTimeout(Sfx.tick, dur * (1 - Math.pow(1 - k / (MINI_N - 1), 1 / 3)));
      }
      setTimeout(() => { roll.classList.add('done', 'r' + SKINS[winner.s].r); resolve(); }, dur + 40);
    });
  }

  function renderIdle() {
    if (count >= MINI_FROM) { renderMiniIdle(); return; }
    let html = '';
    for (let k = 0; k < count; k++) {
      let cards = '';
      for (let i = 0; i < 14; i++) cards += UI.itemCard(G.rollSkin(cur));
      html += '<div class="roll"><div class="strip">' + cards + '</div><div class="marker"></div></div>';
    }
    $('#cp-rolls').innerHTML = html;
    // начальное положение — по центру
    Array.prototype.forEach.call(document.querySelectorAll('#cp-rolls .strip'), (s) => {
      s.style.transform = 'translate3d(' + (-(s.scrollWidth - s.parentNode.clientWidth) / 2) + 'px,0,0)';
    });
  }

  function renderContents() {
    const w = G.caseWeights(cur);
    let total = 0;
    w.forEach((x) => { total += x; });
    const rows = cur.items.map((id, i) => ({ id: id, ch: w[i] / total * 100 }))
      .sort((a, b) => SKINS[b.id].value - SKINS[a.id].value);
    $('#cp-contents').innerHTML = rows.map((r) => UI.itemCard(r.id, { chance: r.ch })).join('');
  }

  function tick() {
    if (!cur) return;
    const ob = $('#cp-open');
    const free = freeReady();
    $('#cp-open-free').style.display = free ? '' : 'none';
    const cost = round2(cur.price * count);
    ob.setAttribute('data-cost', cost);
    UI.setHTML(ob, t('open_for', { v: COIN + G.fmtP(cost) }));
    const ab = $('#cp-open-ad');
    const left = G.S.adCaseAt + G.C.AD_CASE_CD - Date.now();
    ab.style.display = cur.price <= G.C.AD_CASE_MAX ? '' : 'none';   // дорогие кейсы — только за монеты
    UI.setHTML(ab, left > 0 ? t('wait', { t: G.fmtTime(left) }) : t('open_free_ad'));
    ab.disabled = left > 0 || UI.isSpinning() || G.adBusy;
    $('#cp-fast').classList.toggle('on', G.S.settings.fast);
  }

  Screens.reg('case', { render: renderCase, tick: tick });

  // ================= Открытие =================
  function spinStrip(roll, winner, fast, delay, withSound) {
    return new Promise((resolve) => {
      const strip = roll.querySelector('.strip');
      const N = fast ? 30 : 60;
      const WIN = N - 6;
      const weights = G.caseWeights(cur);
      let html = '';
      for (let i = 0; i < N; i++) {
        html += i === WIN ? UI.itemCard(winner) : UI.itemCard(G.rollSkin(cur, weights));
      }
      strip.innerHTML = html;
      strip.style.transform = 'translate3d(0,0,0)';
      const cards = strip.children;
      const cardW = cards[0].offsetWidth;
      const step = cards[1].offsetLeft - cards[0].offsetLeft;
      const first = cards[0].offsetLeft;
      const W = roll.clientWidth;
      const jitter = (Math.random() - 0.5) * cardW * 0.8;
      const target = cards[WIN].offsetLeft + cardW / 2 - W / 2 + jitter;
      const dur = (fast ? 1200 : 5800) + delay;
      const t0 = performance.now();
      let lastIdx = -1;
      function frame(now) {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 4);
        const x = target * e;
        strip.style.transform = 'translate3d(' + (-x) + 'px,0,0)';
        if (withSound) {
          const idx = Math.floor((x + W / 2 - first) / step);
          if (idx !== lastIdx) { lastIdx = idx; Sfx.tick(); }
        }
        if (p < 1) requestAnimationFrame(frame);
        else { cards[WIN].classList.add('win'); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }

  async function open(mode) {
    // mode: 'paid' | 'free' (бесплатный кейс по таймеру) | 'ad' (за рекламу)
    if (!cur || UI.isSpinning()) return;
    const n = mode === 'paid' ? count : 1;
    if (G.invFull(n)) { UI.toast(t('inv_full', { n: INVENTORY_MAX }), 'bad'); Sfx.error(); return; }
    if (mode === 'paid') {
      const cost = round2(cur.price * n);
      if (!G.canPay(cost)) {
        UI.toast(t('not_enough'), 'bad'); Sfx.error();
        const b = $('#cp-open'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
        return;
      }
      G.spend(cost);
    } else if (mode === 'free') {
      G.S.freeAt = Date.now() + G.C.FREE_CD;
    }

    if (n !== count) { count = n; renderCase(); }
    UI.setSpinning(true);
    const res = { items: [], isNew: [] };
    for (let k = 0; k < n; k++) {
      const r = G.addInst(G.rollSkin(cur), G.rollFloat());
      res.items.push(r.inst);
      res.isNew.push(r.isNew);
    }
    G.S.opened += n;
    G.track('o', n);
    G.track('r', Math.max.apply(null, res.items.map((x) => SKINS[x.s].r)));
    G.opensSinceAd += 1;
    G.save(false);

    const fast = G.S.settings.fast;
    const crate = $('#cp-crate');
    crate.classList.remove('shaking'); void crate.offsetWidth; crate.classList.add('shaking');
    Sfx.open();
    await G.wait(fast ? 150 : 400);

    const mini = n >= MINI_FROM;
    const rolls = document.querySelectorAll(mini ? '#cp-rolls .mroll' : '#cp-rolls .roll');
    await Promise.all(res.items.map((inst, k) => (mini
      ? spinMini(rolls[k], inst, fast, k * 70, k === 0)
      : spinStrip(rolls[k], inst, fast, k * 180, k === 0))));
    const bestR = Math.max.apply(null, res.items.map((x) => SKINS[x.s].r));
    Sfx.win(Math.min(5, bestR));
    // Частицы над редкими предметами (в мини-режиме — скромнее, чтобы не тормозило)
    (mini ? rolls : document.querySelectorAll('#cp-rolls .it.win')).forEach((card, k) => {
      const r = SKINS[res.items[k].s].r;
      if (r < (mini ? 4 : 3)) return;
      const b = card.getBoundingClientRect();
      UI.burst(b.left + b.width / 2, b.top + b.height / 2, RARITIES[r].color, mini ? 14 : r >= 5 ? 46 : r >= 4 ? 30 : 18);
    });
    await G.wait(bestR >= 4 ? 500 : 300);

    UI.setSpinning(false);
    UI.renderFeed();
    if (res.isNew.some(Boolean)) renderContents();
    lastResult = res;
    showResult(res);
  }

  function showResult(res) {
    const live = res.items.filter((x) => G.findInst(x.u));
    let sum = 0;
    live.forEach((x) => { sum += G.sellPrice(x); });
    const single = res.items.length === 1 ? res.items[0] : null;
    const anyNew = res.isNew.some(Boolean);
    const again = round2(cur.price * count);
    let html = '<h3 class="m-title">' + t('drop_title') + '</h3>';
    if (single) {
      const sk = SKINS[single.s];
      html += '<div class="drop-one r' + sk.r + '">' + (res.isNew[0] ? '<span class="new-badge">' + t('new_item') + '</span>' : '') +
        '<div class="rays"></div><div class="drop-art">' + Art.item(single.s, single.f) + '</div></div>' +
        '<div class="drop-rar r' + sk.r + '">' + t('rar_' + RARITIES[sk.r].id) + '</div>' +
        '<div class="drop-name">' + (G.isStar(single.s) ? '★ ' : '') + G.skinName(single.s) + ' | ' + G.finishName(single.s) + '</div>' +
        '<div class="drop-wear">' + UI.wearShort(single.f) + ' · ' + single.f.toFixed(4) + '</div>';
    } else {
      html += '<div class="drop-grid">' + res.items.map((x, i) => UI.itemCard(x, { badge: res.isNew[i] ? t('new_item') : '' })).join('') + '</div>';
    }
    if (anyNew) html += '<p class="hint">' + t('new_skin_bonus') + '</p>';
    html += '<div class="m-btns">';
    if (live.length) {
      html += '<div class="row"><button class="btn" data-act="res-sell">' + t('sell_for', { v: COIN + G.fmt(sum) }) + '</button>' +
        '<button class="btn" data-act="close">' + t('take') + '</button></div>';
      const adSellReady = Date.now() - G.S.adSellAt >= G.C.AD_SELL_CD;
      if (single && SKINS[single.s].r >= 2 && adSellReady && sum <= G.C.AD_SELL_MAX) html += '<button class="btn ad" data-act="res-sell2">' + t('sell_x2', { v: COIN + G.fmt(sum * 2) }) + '</button>';
    }
    html += '<button class="btn primary big" data-act="res-again" data-cost="' + again + '">' + t('again') + ' · ' + COIN + G.fmtP(again) + '</button></div>';
    UI.modal(html, { wide: !single, onClose: () => G.maybeInterstitial() });
    UI.refresh();
  }

  function sellResult(mult) {
    if (!lastResult) return 0;
    const uids = lastResult.items.filter((x) => G.findInst(x.u)).map((x) => x.u);
    const gain = G.sellInsts(uids, mult);
    if (gain > 0) { Sfx.coin(); UI.toast(t('sold', { v: G.fmt(gain) }), 'good'); }
    G.save(false);
    return gain;
  }

  // ================= Действия =================
  A['case'] = function (id) { cur = CASE_BY_ID[id]; UI.showScreen('case', id); };
  A['count'] = function (id) { count = Number(id) || 1; renderCase(); UI.refresh(); };
  // Турбо-режим общий для кейсов и апгрейда; кнопку обновляет tick() текущего экрана
  A['fast'] = function () { G.S.settings.fast = !G.S.settings.fast; G.save(false); UI.refresh(); };
  A['open'] = function () { open('paid'); };
  A['open-free'] = function () { if (freeReady()) open('free'); };
  A['open-ad'] = function () {
    if (Date.now() - G.S.adCaseAt < G.C.AD_CASE_CD || !cur || cur.price > G.C.AD_CASE_MAX) return;
    G.rewarded(() => { G.S.adCaseAt = Date.now(); open('ad'); });
  };
  A['res-sell'] = function () { sellResult(1); UI.closeModal(); UI.refresh(); };
  A['res-sell2'] = function () {
    if (Date.now() - G.S.adSellAt < G.C.AD_SELL_CD) return;
    const live = lastResult ? lastResult.items.filter((x) => G.findInst(x.u)) : [];
    let sum = 0;
    live.forEach((x) => { sum += G.sellPrice(x); });
    if (sum > G.C.AD_SELL_MAX) return;
    G.rewarded(() => { G.S.adSellAt = Date.now(); sellResult(2); UI.closeModal(); });
  };
  A['res-again'] = function () {
    UI.closeModal(true);
    G.maybeInterstitial().then(() => open('paid'));
  };
  // Бесплатный кейс с экрана «Фарм»
  A['free-case'] = function () {
    cur = CASE_BY_ID[FREE_CASE_ID];
    count = 1;
    UI.showScreen('case', FREE_CASE_ID);
    if (Date.now() >= G.S.freeAt) open('free');
  };
})();
