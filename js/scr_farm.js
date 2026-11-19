'use strict';

// Экран «Фарм»: монета-кликер, бесплатный кейс, монеты за рекламу, прокачка.
// Плюс офлайн-доход при запуске. Ежедневный бонус — на экране «Награды».
const Farm = (function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;
  let offlineGain = 0;

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
      // сегменты уровня: пройденные — золотые, следующий — приглушённо-золотой
      let pips = '';
      for (let i = 0; i < u.max; i++) pips += '<i' + (i < l ? ' class="on"' : i === l ? ' class="nx"' : '') + '></i>';
      return '<div class="shop-card' + (maxed ? ' max' : '') + '"><div class="shop-ico">' + UI.ic(SHOP_ICON[u.id] || 'up') + '</div>' +
        '<div class="shop-info"><b>' + t('up_' + u.id) + ' <span class="lvl">' + t('level', { v: l }) + '</span></b>' +
        '<small>' + t('up_' + u.id + '_d', { a: a, b: '<em>' + b + '</em>' }) + '</small><div class="pips">' + pips + '</div></div>' +
        (maxed ? '<button class="btn" disabled>' + t('max') + '</button>'
          : '<button class="btn primary" data-act="buy" data-id="' + u.id + '" data-cost="' + u.cost(l) + '">' + COIN + G.fmtP(u.cost(l)) + '</button>') +
        '</div>';
    }).join('');
  }

  function render() {
    renderShop();
    tick();
  }

  function tick() {
    const S = G.S, now = Date.now();
    UI.setHTML($('#farm-click'), UI.ic('tap') + t('click_power', { v: G.fmt(G.clickPower()) }));
    UI.setHTML($('#farm-income'), UI.ic('chip') + t('income', { v: G.fmt(G.income()) }));
    $('#tap-hint').classList.toggle('pulse', S.clicks < 30);

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
    Sfx.click();
    const coin = $('#big-coin');
    coin.classList.remove('hit'); void coin.offsetWidth; coin.classList.add('hit');
    const r = coin.getBoundingClientRect();
    UI.floatText((e.clientX || r.left + r.width / 2) + (Math.random() * 30 - 15), (e.clientY || r.top + r.height / 2) - 10, '+' + G.fmt(p));
    UI.refresh();
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
