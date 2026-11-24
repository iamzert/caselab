'use strict';

// Экран «Фарм»: монета-кликер, бесплатный кейс, монеты за рекламу, прокачка.
// Плюс офлайн-доход при запуске. Ежедневный бонус — на экране «Награды».
// Раунд 7: монета на сцене без панели, рядом — клики в секунду, прогресс уровня, всплывающие начисления;
// прокачка — сплошные полосы .bar; покупки — второстепенные стеклянные кнопки с ценой золотым текстом
// (золотая заливка на экране — только у главного действия «Открыть» бесплатного кейса).
Object.assign(I18N.ru, {
  fm_cps: 'Кликов/с', fm_tap: 'За клик', fm_inc: 'Доход/с', fm_lvl: 'ур. {a} / {b}', fm_next: 'Ур. {n}: {r}',
});
Object.assign(I18N.en, {
  fm_cps: 'Taps/s', fm_tap: 'Per tap', fm_inc: 'Income/s', fm_lvl: 'lv. {a} / {b}', fm_next: 'Lv. {n}: {r}',
});

const Farm = (function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;
  let offlineGain = 0;
  const CPS_WIN = 3000;      // окно «кликов в секунду» — скользящее за 3 с
  const POPS_MAX = 8;        // одновременно всплывающих цифр у монеты
  let taps = [];             // время последних кликов (только в окне CPS_WIN)

  const adCoinsReward = () => round2(Math.max(3, G.clickPower() * 60 + G.income() * 120));

  function upEffect(u, l) {
    switch (u.id) {
      case 'click': return G.fmt(G.clickAt(l));
      case 'auto': return G.fmt(G.incomeAt(l));
      case 'luck': return (l * LUCK_PER_LVL * 100).toFixed(1).replace('.0', '');
      case 'sell': return String(Math.round(l * SELL_PER_LVL * 100));
    }
    return '';
  }

  const SHOP_ICON = { click: 'tap', auto: 'chip', luck: 'dice', sell: 'trend' };

  function renderShop() {
    $('#shop-list').innerHTML = G.UPGRADES.map((u) => {
      const l = G.S.up[u.id];
      const maxed = l >= u.max;
      const a = upEffect(u, l), b = maxed ? a : upEffect(u, l + 1);
      // уровень — сплошная дорожка 4 px с золотой заливкой и мелкая подпись «ур. 7 / 20»
      const pct = Math.round(l / u.max * 1000) / 10;
      const cost = maxed ? 0 : u.cost(l);
      return '<div class="shop-card' + (maxed ? ' max' : '') + '"><div class="shop-ico">' + UI.ic(SHOP_ICON[u.id] || 'up') + '</div>' +
        '<div class="shop-info"><b>' + t('up_' + u.id) + '</b>' +
        // на максимуме — только текущее значение, без «1.90 → 1.90»
        '<small>' + (maxed ? t('up_' + u.id + '_d', { a: '<em>' + a + '</em>', b: '' }).replace(/\s*→\s*$/, '')
          : t('up_' + u.id + '_d', { a: a, b: '<em>' + b + '</em>' })) + '</small>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div><span class="bar-lbl">' + t('fm_lvl', { a: l, b: u.max }) + '</span></div>' +
        (maxed ? '<button class="btn" disabled>' + t('max') + '</button>'
          : '<button class="btn fm-buy" data-act="buy" data-id="' + u.id + '" data-cost="' + cost + '">' + COIN + G.fmtP(cost) + '</button>') +
        '</div>';
    }).join('');
  }

  // Клики в секунду: сколько кликов за последние 3 с, делённое на 3
  function cps(now) {
    while (taps.length && now - taps[0] > CPS_WIN) taps.shift();
    return taps.length / (CPS_WIN / 1000);
  }

  // Прогресс до следующего уровня (XP.info()); без модуля опыта блок скрыт
  function lvRow() {
    const box = $('#fm-lv');
    if (!box) return;
    const inf = typeof XP !== 'undefined' && XP.info ? XP.info() : null;
    box.hidden = !inf;
    if (!inf) return;
    UI.setText($('#fm-lv-n'), t('xp_lv') + ' ' + inf.lv + (inf.rank && inf.rank.name ? ' · ' + inf.rank.name : ''));
    UI.setText($('#fm-lv-x'), inf.next ? G.fmtInt(inf.xp) + ' / ' + G.fmtInt(inf.need) + ' XP' : t('max'));
    const w = (Math.round(inf.pct * 10) / 10) + '%', bar = $('#fm-lv-bar');
    if (bar.style.width !== w) bar.style.width = w;
    UI.setText($('#fm-lv-next'), inf.next && inf.next.text ? t('fm_next', { n: inf.next.lv, r: inf.next.text }) : '');
  }

  function render() {
    renderShop();
    tick();
  }

  function tick() {
    const S = G.S, now = Date.now();
    UI.setText($('#farm-click'), '+' + G.fmt(G.clickPower()));
    UI.setText($('#farm-income'), '+' + G.fmt(G.income()));
    UI.setText($('#fm-cps'), cps(now).toFixed(1));
    // подсказка «Жми на монету» — только пока игрок не освоился
    const hint = $('#tap-hint');
    hint.hidden = S.clicks >= 30;
    hint.classList.toggle('pulse', S.clicks < 30);
    lvRow();

    UI.setText($('#free-sub'), t('free_case_sub', { name: G.nm(CASE_BY_ID[FREE_CASE_ID].name) }));
    const fb = $('#btn-free');
    const fr = now >= S.freeAt;
    UI.setHTML(fb, fr ? t('open_btn') : t('wait', { t: G.fmtTime(S.freeAt - now) }));
    fb.disabled = !fr;

    const ab = $('#btn-adcoins');
    const ar = now - S.adCoinsAt >= G.C.AD_COINS_CD;
    UI.setHTML(ab, ar ? UI.ic('play') + '+' + G.fmt(adCoinsReward()) : t('wait', { t: G.fmtTime(S.adCoinsAt + G.C.AD_COINS_CD - now) }));
    ab.disabled = !ar || G.adBusy;
  }

  // Красная точка на «Фарм»: готов бесплатный кейс или хватает на прокачку
  function dot() {
    const S = G.S;
    return Date.now() >= S.freeAt || G.UPGRADES.some((u) => S.up[u.id] < u.max && G.canPay(u.cost(S.up[u.id])));
  }

  Screens.reg('farm', { render: render, tick: tick, dot: dot });

  function onCoinTap(e) {
    e.preventDefault();
    Sfx.unlock();
    const p = G.clickPower();
    G.addCoins(p);
    G.S.clicks++;
    G.track('c', 1);
    G.emit('click', { power: p });   // опыт и достижения
    Sfx.click();
    taps.push(Date.now());
    const coin = $('#big-coin');
    coin.classList.remove('hit'); void coin.offsetWidth; coin.classList.add('hit');
    pop(e, '+' + G.fmt(p));
    UI.refresh();
  }

  // Всплывающая цифра начисления у точки клика (внутри сцены монеты, сдержанно, без свечения)
  function pop(e, text) {
    const box = $('#fm-pops');
    if (!box) return;
    const r = box.getBoundingClientRect();
    const x = (e && e.clientX ? e.clientX - r.left : r.width / 2) + (Math.random() * 24 - 12);
    const y = (e && e.clientY ? e.clientY - r.top : r.height / 2) - 14;
    while (box.childElementCount >= POPS_MAX) box.firstElementChild.remove();
    const el = document.createElement('span');
    el.className = 'fm-pop';
    el.textContent = text;
    el.style.left = Math.max(16, Math.min(r.width - 16, x)) + 'px';
    el.style.top = Math.max(0, y) + 'px';
    box.appendChild(el);
    setTimeout(() => el.remove(), 760);
  }

  A['ad-coins'] = function () {
    if (Date.now() - G.S.adCoinsAt < G.C.AD_COINS_CD) return;
    G.rewarded(() => {
      const v = adCoinsReward();
      G.S.adCoinsAt = Date.now();
      G.addCoins(v);
      Sfx.coin();
      UI.toast(t('ad_coins_got', { v: G.fmt(v) }), 'good');
    });
  };

  A['buy'] = function (id) {
    const u = G.UPGRADES.filter((x) => x.id === id)[0];
    if (!u) return;
    const l = G.S.up[id];
    if (l >= u.max) return;
    const cost = u.cost(l);
    if (!G.canPay(cost)) { Sfx.error(); UI.toast(t('not_enough'), 'bad'); return; }
    G.spend(cost);
    G.S.up[id] = l + 1;
    Sfx.buy();
    G.save(false);
    renderShop();
    UI.refresh();
  };

  // ---------- Офлайн-доход ----------
  // Считает доход за время отсутствия и возвращает функцию показа окна (или null)
  function prepareOffline() {
    const sec = Math.min(G.C.OFFLINE_MAX_SEC, (Date.now() - G.S.lastSeen) / 1000);
    const inc = G.income();
    if (sec < 60 || inc <= 0) return null;
    offlineGain = round2(inc * sec * G.C.OFFLINE_RATE);
    if (offlineGain < 0.01) return null;
    return function () {
      UI.modal('<h3 class="m-title">' + t('offline_title') + '</h3><p class="hint">' + t('offline_text') + '</p>' +
        '<div class="big-sum">' + COIN + G.fmt(offlineGain) + '</div>' +
        '<div class="m-btns"><button class="btn ad big" data-act="offline-x2">' + t('offline_x2') + '</button>' +
        '<button class="btn primary" data-act="offline-take">' + t('take_btn') + '</button></div>', { locked: true });
    };
  }

  A['offline-take'] = function () { G.addCoins(offlineGain); offlineGain = 0; Sfx.coin(); UI.closeModal(); UI.refresh(); };
  A['offline-x2'] = function () {
    G.rewarded(() => { G.addCoins(offlineGain * 2); offlineGain = 0; Sfx.coin(); UI.closeModal(); });
  };

  return { onCoinTap: onCoinTap, prepareOffline: prepareOffline };
})();
