'use strict';

// Экран «Инвентарь». Та же сетка предметов показывается во вкладке «Предметы» профиля (Inventory.fill).
const Inventory = (function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;

  // Раунд 7: выбор нескольких предметов для продажи, вход в контракты, подтверждение «Продать дешёвые»
  Object.assign(I18N.ru, {
    inv_pick: 'Выбрать', inv_pick_off: 'Отмена', inv_pick_all: 'Выбрать все', inv_pick_none: 'Снять выбор',
    inv_contract: 'Контракт', inv_sel_n: 'Выбрано: {n}', inv_sel_hint: 'Отметьте предметы для продажи',
    inv_sel_sell: 'Продать за {v}', inv_sel_sell0: 'Продать',
    confirm_sell_low: 'Продать дешёвые предметы ({n} шт.) за {v}?',
    inv_more_t: 'Пополнить инвентарь', inv_more_s: 'Откуда берутся новые предметы',
    inv_more_cases: 'Кейсы', inv_more_cases_d: 'Каждое открытие кладёт сюда новый предмет — от обычного до ножа.', inv_more_cases_b: 'Открыть кейсы',
    inv_more_ct: 'Контракт обмена', inv_more_ct_d: 'Обменяйте 10 ненужных предметов на один более дорогой.', inv_more_ct_n: 'Для обмена есть {n} из 10', inv_more_ct_b: 'Контракты',
    inv_more_col: 'Коллекция', inv_more_col_v: '{a} из {b}', inv_more_col_x: 'Новый предмет — навсегда +1% к доходу. Сейчас +{v}%', inv_more_col_b: 'Смотреть',
  });
  Object.assign(I18N.en, {
    inv_pick: 'Select', inv_pick_off: 'Cancel', inv_pick_all: 'Select all', inv_pick_none: 'Clear',
    inv_contract: 'Contract', inv_sel_n: 'Selected: {n}', inv_sel_hint: 'Tick the items you want to sell',
    inv_sel_sell: 'Sell for {v}', inv_sel_sell0: 'Sell',
    confirm_sell_low: 'Sell cheap items ({n} pcs) for {v}?',
    inv_more_t: 'Fill your inventory', inv_more_s: 'Where new items come from',
    inv_more_cases: 'Cases', inv_more_cases_d: 'Every case you open puts a new item here — from common to knives.', inv_more_cases_b: 'Open cases',
    inv_more_ct: 'Trade-up contract', inv_more_ct_d: 'Trade 10 items you don’t need for one pricier item.', inv_more_ct_n: '{n} of 10 ready to trade', inv_more_ct_b: 'Contracts',
    inv_more_col: 'Collection', inv_more_col_v: '{a} of {b}', inv_more_col_x: 'Each new item adds +1% income forever. Now +{v}%', inv_more_col_b: 'View',
  });

  // Режим выбора: on — включён, sel — отмеченные uid. Живёт до перезагрузки (в сохранение не пишется:
  // это не действие игрока, а состояние экрана; сама продажа сохраняется как обычно).
  const P = { on: false, sel: {} };

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

  // Адаптивная плотность сетки: обычное число колонок задаёт CSS (по ширине экрана), а когда предметов мало,
  // карточки крупнее — до 8 штук по 4 в ряд (на телефоне по 2), до 18 — столько колонок, чтобы последний ряд
  // был как можно полнее (18 → по 6). data-d="l|m" — крупные/средние карточки (картинка растёт с шириной, r7_inv.css).
  function fit(grid, n) {
    grid._n = n;
    grid.style.gridTemplateColumns = '';
    grid.removeAttribute('data-d');
    if (!n || n > 18) return;
    const cs = getComputedStyle(grid).gridTemplateColumns;   // у скрытого экрана — «repeat(N, …)», у видимого — список ширин
    const m = /repeat\((\d+)/.exec(cs);
    const base = m ? Number(m[1]) : cs.split(' ').filter((s) => /px$/.test(s)).length;
    if (!(base > 1)) return;
    let c = base, d = '';
    if (n <= 8) {
      c = base >= 6 ? 4 : base >= 4 ? 3 : 2;
      d = 'l';
      // 1–3 предмета: колонок столько же, сколько предметов — без пустых слотов справа (на телефоне одна карточка — в пол-экрана).
      // Ширина колонки ограничена (--inv-cmax), чтобы одна-две карточки не растягивались на всю панель
      if (n < c && base >= 4) {
        grid.style.gridTemplateColumns = 'repeat(' + n + ', minmax(0, var(--inv-cmax, 380px)))';
        grid.setAttribute('data-d', d);
        return;
      }
    }
    else if (base >= 5) {
      let best = 1e9;
      for (let k = Math.max(4, base - 2); k <= base; k++) {   // меньше пустых мест в последнем ряду; при равенстве — больше колонок
        const e = Math.ceil(n / k) * k - n;
        if (e <= best) { best = e; c = k; }
      }
      if (c < base) d = 'm';
    }
    if (c >= base) return;
    grid.style.gridTemplateColumns = 'repeat(' + c + ', minmax(0, 1fr))';
    grid.setAttribute('data-d', d);
  }
  // Ширина окна сменилась — пересчитать плотность видимых сеток (обычное число колонок могло измениться)
  let fitTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      ['#inv-grid', '#prof-items'].forEach((s) => { const g = $(s); if (g && g._n != null) fit(g, g._n); });
    }, 120);
  });

  // Заполнить сетку grid внутри обёртки wrap (экран инвентаря или вкладка профиля).
  // filt = true — применить фильтры экрана инвентаря.
  function fill(grid, wrap, filt) {
    const old = wrap.querySelector('.inv-none');
    if (old) old.remove();
    if (!G.S.inv.length) {
      grid.innerHTML = '';
      fit(grid, 0);
      wrap.insertAdjacentHTML('beforeend', line('box', t('inv_empty_title'),
        '<button class="lnk acc" data-act="nav" data-id="cases">' + t('inv_empty_btn') + '</button>'));
      return 0;
    }
    const list = filt && active() ? sorted().filter((x) => pass(x)) : sorted();
    // в режиме выбора трофей приглушён (продать нельзя), отмеченные — с рамкой.
    // Выбор — только у сетки экрана инвентаря (явный boolean: toggle(cls, undefined) из профиля переключал бы класс)
    const pick = !!(filt && P.on && grid.id === 'inv-grid');
    grid.classList.toggle('picking', pick);
    grid.innerHTML = list.map((x) => UI.itemCard(x, { act: 'inv-item',
      cls: pick && G.isSecret(x.s) ? 'locked' : '', selected: pick && !!P.sel[x.u] })).join('');
    fit(grid, list.length);
    if (!list.length) {
      wrap.insertAdjacentHTML('beforeend', line('search', t('inv_none'),
        '<button class="lnk acc" data-act="inv-reset">' + t('inv_reset') + '</button>'));
    }
    return list.length;
  }

  function render() {
    const S = G.S;
    UI.setText($('#inv-worth'), G.fmt(G.invWorth()));
    UI.setText($('#inv-count'), t('inv_count', { v: G.invSlots(), max: INVENTORY_MAX }));   // трофеи места не занимают
    const so = $('#inv-sort');
    so.value = S.settings.sort;
    renderFilters();
    // сортировка в ряду фильтров: ширина по выбранному тексту (значок слева, стрелка сразу за текстом)
    const o = so.options[so.selectedIndex];
    if (o && S.inv.length) so.style.setProperty('--w', Math.ceil(textW(so, o.text)) + 56 + 'px');
    prunePick();
    const shown = fill($('#inv-grid'), $('#inv-wrap'), true);
    UI.setText($('#inv-found'), active() && S.inv.length ? t('inv_found', { v: shown }) : '');
    renderPick();
    renderMore();
  }

  // ---------- «Пополнить инвентарь» ----------
  // Предметов мало (до 8) — под панелью сетки спокойный блок: откуда брать предметы (кейсы, контракты) и строка коллекции.
  // Отдельная стеклянная панель той же ширины; кнопки второстепенные, без золота. С 9+ предметами блока нет
  const MORE_MAX = 8, CT_N = 10;
  function renderMore() {
    const scr = $('#scr-inv');
    let el = $('#inv-more');
    const n = G.S.inv.length;
    if (n > MORE_MAX) { if (el) el.hidden = true; return; }
    if (!el) {
      scr.insertAdjacentHTML('beforeend', '<div class="wrap inv-more" id="inv-more"></div>');
      el = $('#inv-more');
    }
    const ready = G.S.inv.filter((x) => !G.isSecret(x.s)).length;
    const got = G.foundCount(), all = TOTAL_SKINS || 1;
    const pct = Math.min(100, got / all * 100);
    const tile = (ic, title, desc, meta, act, btn) =>
      '<div class="im-tile"><span class="im-ic">' + UI.ic(ic) + '</span>' +
      '<div class="im-tx"><b>' + title + '</b><small>' + desc + '</small>' + (meta ? '<em>' + meta + '</em>' : '') + '</div>' +
      '<button class="btn" ' + act + '>' + btn + '</button></div>';
    UI.setHTML(el,
      '<div class="im-h"><b>' + t('inv_more_t') + '</b><small>' + t('inv_more_s') + '</small></div>' +
      '<div class="im-row">' +
      tile('cases', t('inv_more_cases'), t('inv_more_cases_d'), '', 'data-act="nav" data-id="cases"', t('inv_more_cases_b')) +
      tile('swap', t('inv_more_ct'), t('inv_more_ct_d'), t('inv_more_ct_n', { n: Math.min(ready, CT_N) }), 'data-act="inv-contract"', t('inv_more_ct_b')) +
      '</div>' +
      '<div class="im-col">' + UI.ic('layers') + '<span class="im-col-t">' + t('inv_more_col') + '</span>' +
      '<b>' + t('inv_more_col_v', { a: G.fmtInt(got), b: G.fmtInt(TOTAL_SKINS) }) + '</b>' +
      '<span class="bar im-bar"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
      '<small>' + t('inv_more_col_x', { v: got }) + '</small>' +
      '<button class="lnk im-col-go" data-act="inv-col">' + t('inv_more_col_b') + UI.ic('chev') + '</button></div>');
    el.hidden = false;
  }
  // Строка коллекции → профиль, вкладка «Коллекция»
  A['inv-col'] = function () {
    UI.showScreen('profile');
    if (typeof A['prof-tab'] === 'function') A['prof-tab']('col');
  };

  // ---------- Режим выбора ----------
  // Убрать из выбора то, чего уже нет (продано, ушло в апгрейд или контракт); пустой инвентарь — выйти из режима
  function prunePick() {
    if (!G.S.inv.length) P.on = false;
    const has = {};
    G.S.inv.forEach((x) => { if (!G.isSecret(x.s)) has[x.u] = 1; });
    Object.keys(P.sel).forEach((u) => { if (!has[u] || !P.on) delete P.sel[u]; });
  }
  function picked() { return G.S.inv.filter((x) => P.sel[x.u]); }
  // Полоса выбора: число, сумма и золотая «Продать» (неактивна, пока ничего не отмечено)
  function renderPick() {
    $('#inv-pick').classList.toggle('on', P.on);
    // нечего продавать (пусто или одни трофеи) — кнопки действий скрыты, остаётся стоимость
    const none = !G.S.inv.some((x) => !G.isSecret(x.s));
    ['#inv-pick', '#scr-inv .inv-ctr', '#scr-inv .inv-sl', '#scr-inv .inv-sa'].forEach((s) => { $(s).hidden = none; });
    const bar = $('#inv-selbar');
    bar.hidden = !P.on;
    if (!P.on) return;
    const list = picked(), v = list.reduce((s, x) => s + G.sellPrice(x), 0);
    UI.setText($('#inv-sel-n'), list.length ? t('inv_sel_n', { n: list.length }) : t('inv_sel_hint'));
    const vis = visibleSellable();
    UI.setText(bar.querySelector('.inv-sel-all'), vis.length && vis.every((x) => P.sel[x.u]) ? t('inv_pick_none') : t('inv_pick_all'));
    const b = $('#inv-sel-sell');
    b.disabled = !list.length;
    UI.setHTML(b, list.length ? t('inv_sel_sell', { v: COIN + G.fmt(v) }) : t('inv_sel_sell0'));
  }
  // Видимые сейчас (с учётом фильтров) предметы, которые можно продать
  function visibleSellable() { return (active() ? G.S.inv.filter((x) => pass(x)) : G.S.inv).filter((x) => !G.isSecret(x.s)); }
  function setPick(on) {
    P.on = on;
    if (!on) P.sel = {};
    if (UI.screen() === 'inv') render();
  }
  // Отметить/снять один предмет без перерисовки всей сетки
  function togglePick(u) {
    const x = G.findInst(u);
    if (!x) return;
    if (G.isSecret(x.s)) { UI.toast(t('trophy_no_sell'), 'bad'); return; }
    if (P.sel[u]) delete P.sel[u]; else P.sel[u] = 1;
    const el = $('#inv-grid').querySelector('.it[data-id="' + u + '"]');
    if (el) el.classList.toggle('sel', !!P.sel[u]);
    renderPick();
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
    const sk = SKINS[x.s], secret = G.isSecret(x.s);
    // трофей: продать и поставить в апгрейд нельзя — кнопки заблокированы с подсказкой, окно чёрное
    const sell = secret
      ? '<button class="btn big trophy-lock" disabled title="' + t('trophy_no_sell') + '">' + UI.ic('lock') + ' ' + t('trophy_no_sell') + '</button>'
      : '<button class="btn primary big" data-act="inv-sell" data-id="' + x.u + '">' + t('sell_for', { v: COIN + G.fmt(G.sellPrice(x)) }) + '</button>';
    const toUp = secret
      ? '<button class="btn" disabled title="' + t('trophy_no_up') + '">' + t('to_upgrade') + '</button>'
      : '<button class="btn" data-act="to-upgrade" data-id="' + x.u + '">' + t('to_upgrade') + '</button>';
    UI.modal(
      '<div class="drop-one r' + sk.r + '"><div class="rays"></div><div class="drop-art">' + Art.item(x.s, x.f) + '</div></div>' +
      '<div class="drop-rar r' + sk.r + '">' + t('rar_' + RARITIES[sk.r].id) + '</div>' +
      '<div class="drop-name">' + (G.isStar(x.s) ? '★ ' : '') + G.skinName(x.s) + ' <span>| ' + G.finishName(x.s) + '</span></div>' +
      '<div class="drop-wear">' + UI.wearShort(x.f) + (secret ? ' · ' + t('trophy_note') : '') + '</div>' +
      (secret ? '<div class="drop-price">' + COIN + G.fmt(G.instValue(x)) + '</div>' : '') +
      '<div class="float-box"><div class="float-row"><span>' + t('float') + '</span><b>' + x.f.toFixed(4) + '</b></div>' + floatBar(x.f) + '</div>' +
      '<div class="m-btns">' +
      sell + '<div class="row">' + toUp + '<button class="btn" data-act="close">' + t('close') + '</button></div></div>',
      { cls: secret ? 'sec' : '' }
    );
  }

  // После продажи перерисовать тот экран, где сейчас сетка
  function afterSell(gain) {
    if (gain > 0) { Sfx.coin(); UI.toast(t('sold', { v: G.fmt(gain) }), 'good'); G.save(false); }
    else UI.toast(t('nothing_to_sell'));
    if (UI.screen() === 'inv' || UI.screen() === 'profile') UI.showScreen(UI.screen());
    UI.refresh();
  }

  // В режиме выбора (только экран инвентаря) щелчок отмечает предмет, иначе — окно предмета
  A['inv-item'] = function (u) {
    if (P.on && UI.screen() === 'inv') togglePick(Number(u));
    else showItem(u);
  };
  A['inv-pick'] = function () { setPick(!P.on); };
  // «Выбрать все» — все видимые (с учётом фильтров) продаваемые; если они уже отмечены — снять выбор
  A['inv-pick-all'] = function () {
    const vis = visibleSellable();
    if (vis.length && vis.every((x) => P.sel[x.u])) P.sel = {};
    else vis.forEach((x) => { P.sel[x.u] = 1; });
    render();
  };
  // Главное действие экрана — продать отмеченные (трофеи в выбор не попадают, sellInsts их тоже пропускает)
  A['inv-sell-sel'] = function () {
    const uids = picked().map((x) => x.u);
    if (!uids.length) return;
    P.on = false; P.sel = {};
    afterSell(G.sellInsts(uids, 1));
  };
  // Вход в контракты обмена (вкладка экрана «Апгрейды», агент upgrade); нет вкладки — просто экран апгрейдов
  A['inv-contract'] = function () {
    P.on = false; P.sel = {};
    UI.showScreen('upgrade');
    if (typeof A['up-tab'] === 'function') A['up-tab']('contract');
  };
  A['inv-sell'] = function (u) {
    const x = G.findInst(Number(u));
    if (x && G.isSecret(x.s)) { UI.toast(t('trophy_no_sell'), 'bad'); return; }
    const g = G.sellInsts([Number(u)], 1); UI.closeModal(); afterSell(g);
  };
  A['to-upgrade'] = function (u) {
    const x = G.findInst(Number(u));
    if (x && G.isSecret(x.s)) { UI.toast(t('trophy_no_up'), 'bad'); return; }
    UI.closeModal(); Upgrade.preselect(Number(u)); UI.showScreen('upgrade');
  };
  // «Продать дешёвые» (две нижние редкости) — тоже с подтверждением: сколько и за сколько
  A['sell-low'] = function () {
    const low = G.S.inv.filter((x) => SKINS[x.s].r <= 1 && !G.isSecret(x.s));
    if (!low.length) { UI.toast(t('nothing_to_sell')); return; }
    const v = low.reduce((s, x) => s + G.sellPrice(x), 0);
    UI.confirm(t('confirm_sell_low', { n: low.length, v: G.fmt(v) }), () => {
      afterSell(G.sellInsts(low.map((x) => x.u), 1));
    });
  };
  // «Продать всё» — без трофеев: они остаются в инвентаре
  A['sell-all'] = function () {
    const sw = G.sellableWorth(), keep = G.S.inv.length - sw.n;
    if (!sw.n) { UI.toast(t('nothing_to_sell')); return; }
    UI.confirm(t('confirm_sell_all', { n: sw.n, v: G.fmt(sw.v) }) + (keep ? ' ' + t('sell_all_keep') : ''), () => {
      afterSell(G.sellInsts(G.S.inv.map((x) => x.u), 1));
    });
  };

  // Ушли с экрана инвентаря любым путём (меню, аватар в шапке, свой ник в ленте, окно) — режим выбора сбрасывается:
  // вернувшись, игрок видит обычный инвентарь. Следим за снятием .active с экрана, а не за кликами по меню
  (function () {
    const scr = $('#scr-inv');
    if (!scr || typeof MutationObserver === 'undefined') return;
    new MutationObserver(() => {
      if (scr.classList.contains('active') || !P.on) return;
      P.on = false; P.sel = {};
      const g = $('#inv-grid');
      if (g) g.classList.remove('picking');
      renderPick();
    }).observe(scr, { attributes: true, attributeFilter: ['class'] });
  })();

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
