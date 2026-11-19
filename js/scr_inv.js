'use strict';

// Экран «Инвентарь». Та же сетка предметов показывается во вкладке «Предметы» профиля (Inventory.fill).
const Inventory = (function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;

  function sorted() {
    const list = G.S.inv.slice();
    switch (G.S.settings.sort) {
      case 'desc': return list.sort((a, b) => G.instValue(b) - G.instValue(a));
      case 'asc': return list.sort((a, b) => G.instValue(a) - G.instValue(b));
      case 'rar': return list.sort((a, b) => SKINS[b.s].r - SKINS[a.s].r || G.instValue(b) - G.instValue(a));
      default: return list.sort((a, b) => b.u - a.u);
    }
  }

  // Пустой инвентарь: под надписью — размытая витрина примеров (всегда одни и те же предметы)
  let demo = null;
  function demoHTML() {
    if (!demo) {
      demo = [];
      for (let i = 0; i < 21; i++) demo.push(SKIN_LIST[Math.floor(SKIN_LIST.length * (0.3 + 0.68 * hash01('inv-demo:' + i)))].id);
    }
    return demo.map((id) => UI.itemCard(id)).join('');
  }

  // Заполнить сетку grid внутри обёртки wrap (экран инвентаря или вкладка профиля)
  function fill(grid, wrap) {
    const empty = !G.S.inv.length;
    wrap.classList.toggle('empty', empty);
    grid.innerHTML = empty ? demoHTML() : sorted().map((x) => UI.itemCard(x, { act: 'inv-item' })).join('');
    const ov = wrap.querySelector('.inv-ov');
    if (ov) ov.remove();
    if (empty) {
      wrap.insertAdjacentHTML('beforeend', '<div class="inv-ov"><h3>' + t('inv_empty_title') + '</h3><p>' + t('inv_empty_sub') + '</p>' +
        '<button class="btn primary" data-act="nav" data-id="cases">' + UI.ic('box') + t('inv_empty_btn') + '</button></div>');
    }
  }

  function render() {
    const S = G.S;
    UI.setText($('#inv-worth'), G.fmt(G.invWorth()));
    UI.setText($('#inv-count'), t('inv_count', { v: S.inv.length, max: INVENTORY_MAX }));
    $('#inv-sort').value = S.settings.sort;
    fill($('#inv-grid'), $('#inv-wrap'));
  }

  Screens.reg('inv', { render: render });

  function floatBar(f) {
    return '<div class="fbar"><div class="fbar-track">' +
      WEARS.map((w) => '<span style="width:' + ((w.max - w.min) * 100) + '%"></span>').join('') +
      '</div><div class="fbar-mark" style="left:' + (f * 100) + '%"></div></div>';
  }

  function showItem(u) {
    const x = G.findInst(Number(u));
    if (!x) return;
    const sk = SKINS[x.s];
    UI.modal(
      '<div class="drop-one r' + sk.r + '"><div class="rays"></div><div class="drop-art">' + Art.item(x.s, x.f) + '</div></div>' +
      '<div class="drop-rar r' + sk.r + '">' + t('rar_' + RARITIES[sk.r].id) + '</div>' +
      '<div class="drop-name">' + (G.isStar(x.s) ? '★ ' : '') + G.skinName(x.s) + ' <span>| ' + G.finishName(x.s) + '</span></div>' +
      '<div class="drop-wear">' + UI.wearShort(x.f) + '</div>' +
      '<div class="float-box"><div class="float-row"><span>' + t('float') + '</span><b>' + x.f.toFixed(4) + '</b></div>' + floatBar(x.f) + '</div>' +
      '<div class="m-btns">' +
      '<button class="btn primary big" data-act="inv-sell" data-id="' + x.u + '">' + t('sell_for', { v: COIN + G.fmt(G.sellPrice(x)) }) + '</button>' +
      '<div class="row"><button class="btn" data-act="to-upgrade" data-id="' + x.u + '">' + t('to_upgrade') + '</button>' +
      '<button class="btn" data-act="close">' + t('close') + '</button></div></div>'
    );
  }

  // После продажи перерисовать тот экран, где сейчас сетка
  function afterSell(gain) {
    if (gain > 0) { Sfx.coin(); UI.toast(t('sold', { v: G.fmt(gain) }), 'good'); G.save(false); }
    else UI.toast(t('nothing_to_sell'));
    if (UI.screen() === 'inv' || UI.screen() === 'profile') UI.showScreen(UI.screen());
    UI.refresh();
  }

  A['inv-item'] = showItem;
  A['inv-sell'] = function (u) { const g = G.sellInsts([Number(u)], 1); UI.closeModal(); afterSell(g); };
  A['to-upgrade'] = function (u) { UI.closeModal(); Upgrade.preselect(Number(u)); UI.showScreen('upgrade'); };
  A['sell-low'] = function () {
    afterSell(G.sellInsts(G.S.inv.filter((x) => SKINS[x.s].r <= 1).map((x) => x.u), 1));
  };
  A['sell-all'] = function () {
    const n = G.S.inv.length;
    if (!n) { UI.toast(t('nothing_to_sell')); return; }
    UI.confirm(t('confirm_sell_all', { n: n, v: G.fmt(G.invWorth()) }), () => {
      afterSell(G.sellInsts(G.S.inv.map((x) => x.u), 1));
    });
  };

  // Сортировка общая для инвентаря и профиля
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'inv-sort' && e.target.id !== 'prof-sort') return;
    G.S.settings.sort = e.target.value;
    G.save(false);
    UI.showScreen(UI.screen());
  });

  return { fill: fill };
})();
