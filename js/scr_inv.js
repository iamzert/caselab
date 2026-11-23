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

  // ---------- Фильтры (только экран инвентаря) ----------
  // Живут до перезагрузки страницы: в сохранение не пишутся. q — строка поиска в нижнем регистре,
  // t — тип оружия, r — индекс редкости строкой, w — id износа; '' = без фильтра.
  const F = { q: '', t: '', r: '', w: '' };
  const TYPES = ['pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'mg', 'knife', 'gloves'];
  const DIMS = {
    t: { sel: '#inv-ft', all: 'inv_f_type', keys: () => TYPES, key: (x) => WEAPONS[SKINS[x.s].w].type, label: (k) => t('type_' + k) },
    r: { sel: '#inv-fr', all: 'inv_f_rar', keys: () => RARITIES.map((_, i) => String(i)), key: (x) => String(SKINS[x.s].r), label: (k) => t('rar_' + RARITIES[k].id) },
    w: { sel: '#inv-fw', all: 'inv_f_wear', keys: () => WEARS.map((w) => w.id), key: (x) => G.wearOf(x.f).id, label: (k) => t('wear_' + k) },
  };
  const active = () => !!(F.q || F.t || F.r || F.w);
  // skip — измерение, которое не проверяем (для счётчиков в его же списке)
  function pass(x, skip) {
    for (const d in DIMS) if (d !== skip && F[d] && DIMS[d].key(x) !== F[d]) return false;
    return !F.q || (G.skinName(x.s) + ' ' + G.finishName(x.s)).toLowerCase().indexOf(F.q) >= 0;
  }

  // Списки с числом предметов при остальных фильтрах; пустые варианты скрыты (кроме выбранного)
  function renderFilters() {
    const inv = G.S.inv;
    $('#inv-filt').hidden = !inv.length;
    if (!inv.length) return;
    for (const d in DIMS) {
      const D = DIMS[d], n = {};
      inv.forEach((x) => { if (pass(x, d)) { const k = D.key(x); n[k] = (n[k] || 0) + 1; } });
      const html = '<option value="">' + t(D.all) + '</option>' + D.keys().filter((k) => n[k] || k === F[d])
        .map((k) => '<option value="' + k + '">' + D.label(k) + ' · ' + (n[k] || 0) + '</option>').join('');
      const el = $(D.sel);
      UI.setHTML(el, html);
      el.value = F[d];
      el.parentNode.classList.toggle('on', !!F[d]);
      // ширина списка — по выбранному тексту, а не по самому длинному варианту (стрелка рядом с текстом)
      const o = el.options[el.selectedIndex];
      if (o) el.style.setProperty('--w', Math.ceil(textW(el, o.text)) + 34 + 'px');
    }
    $('#inv-reset').hidden = !active();
    $('#inv-filt').classList.toggle('act', active());
  }
  let ctx2d = null;
  function textW(el, s) {
    const cs = getComputedStyle(el);
    if (!ctx2d) ctx2d = document.createElement('canvas').getContext('2d');
    ctx2d.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    return ctx2d.measureText(s).width;
  }

  // Пустой инвентарь / пустой результат фильтра: короткая серая строка с маленьким значком
  function line(icon, text, btn) {
    return '<div class="inv-none">' + UI.ic(icon) + '<span>' + text + '</span>' + btn + '</div>';
  }

  // Заполнить сетку grid внутри обёртки wrap (экран инвентаря или вкладка профиля).
  // filt = true — применить фильтры экрана инвентаря.
  function fill(grid, wrap, filt) {
    const old = wrap.querySelector('.inv-none');
    if (old) old.remove();
    if (!G.S.inv.length) {
      grid.innerHTML = '';
      wrap.insertAdjacentHTML('beforeend', line('box', t('inv_empty_title'),
        '<button class="lnk acc" data-act="nav" data-id="cases">' + t('inv_empty_btn') + '</button>'));
      return 0;
    }
    const list = filt && active() ? sorted().filter((x) => pass(x)) : sorted();
    grid.innerHTML = list.map((x) => UI.itemCard(x, { act: 'inv-item' })).join('');
    if (!list.length) {
      wrap.insertAdjacentHTML('beforeend', line('search', t('inv_none'),
        '<button class="lnk acc" data-act="inv-reset">' + t('inv_reset') + '</button>'));
    }
    return list.length;
  }

  function render() {
    const S = G.S;
    UI.setText($('#inv-worth'), G.fmt(G.invWorth()));
    UI.setText($('#inv-count'), t('inv_count', { v: S.inv.length, max: INVENTORY_MAX }));
    $('#inv-sort').value = S.settings.sort;
    renderFilters();
    const shown = fill($('#inv-grid'), $('#inv-wrap'), true);
    UI.setText($('#inv-found'), active() && S.inv.length ? t('inv_found', { v: shown }) : '');
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

  // Фильтры инвентаря: списки — сразу, поиск — с короткой задержкой, чтобы не перерисовывать сетку на каждую букву
  const FSEL = { 'inv-ft': 't', 'inv-fr': 'r', 'inv-fw': 'w' };
  document.addEventListener('change', (e) => {
    const d = FSEL[e.target.id];
    if (!d) return;
    F[d] = e.target.value;
    render();
  });
  let qTimer = 0;
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'inv-q') return;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { F.q = e.target.value.trim().toLowerCase(); render(); }, 150);
  });
  A['inv-reset'] = function () {
    F.q = F.t = F.r = F.w = '';
    clearTimeout(qTimer);
    $('#inv-q').value = '';
    render();
  };

  return { fill: fill };
})();
