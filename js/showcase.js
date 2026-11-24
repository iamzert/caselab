'use strict';

// Витрина профиля: 5 слотов для лучших предметов. Раунд 7 — агент social (tools/plans/R7_SPEC.md).
// Раздел сохранения G.S.ext.showcase — список uid экземпляров из инвентаря (до 5, по слотам слева направо).
// Проданный, улетевший в апгрейд или контракт предмет пропадает из витрины сам: список при каждом чтении
// сверяется с инвентарём. Витрина видна другим игрокам в открытом профиле (js/live.js берёт Showcase.list()).
Object.assign(I18N.ru, {
  shc_title: 'Витрина', shc_hint: 'Лучшие предметы напоказ — их видят другие игроки в вашем профиле',
  shc_put: 'Поставить', shc_rm: 'Снять с витрины', shc_pick: 'Предмет для витрины',
  shc_pick_sub: 'Сверху — самые дорогие', shc_more: 'Показаны {n} самых дорогих',
  shc_none: 'В инвентаре нет предметов — откройте кейс', shc_cancel: 'Отмена', shc_change: 'Заменить',
});
Object.assign(I18N.en, {
  shc_title: 'Showcase', shc_hint: 'Your best items on display — other players see them in your profile',
  shc_put: 'Place item', shc_rm: 'Remove from showcase', shc_pick: 'Item for the showcase',
  shc_pick_sub: 'Most valuable first', shc_more: 'Showing the {n} most valuable',
  shc_none: 'Your inventory is empty — open a case', shc_cancel: 'Cancel', shc_change: 'Replace',
});

const Showcase = (function () {
  const MAX = 5;
  const PICK_MAX = 120;   // в окне выбора — не больше стольких предметов (дорогие сверху)
  const t = G.t;

  G.ext('showcase', {
    def: () => [],
    clean: (v) => {
      const out = [];
      if (Array.isArray(v)) v.forEach((u) => { if (typeof u === 'number' && u > 0 && Math.floor(u) === u && out.indexOf(u) < 0 && out.length < MAX) out.push(u); });
      return out;
    },
  });

  // Список uid в сохранении (если раздел испорчен — пустой)
  function ids() {
    let a = G.extOf('showcase');
    if (!Array.isArray(a)) { a = []; G.S.ext.showcase = a; }
    return a;
  }
  // Экземпляры витрины; отсутствующие в инвентаре uid выбрасываются из сохранения
  function insts() {
    if (!G.S) return [];
    const a = ids(), out = [];
    for (let i = a.length - 1; i >= 0; i--) if (!G.findInst(a[i])) a.splice(i, 1);
    a.forEach((u) => { out.push(G.findInst(u)); });
    return out;
  }

  let host = null;   // последний контейнер (профиль) — перерисовываем его после изменений
  let slot = 0;      // слот, для которого открыто окно выбора

  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => '&#' + m.charCodeAt(0) + ';');

  function slotHTML(x, i) {
    if (!x) {
      return '<button class="shc-slot shc-empty" data-act="shc-pick" data-id="' + i + '" title="' + t('shc_put') + '">' +
        UI.ic('plus') + '<span>' + t('shc_put') + '</span></button>';
    }
    const sk = SKINS[x.s];
    const nm = (G.isStar(x.s) ? '★ ' : '') + G.skinName(x.s);
    const tip = nm + ' | ' + G.finishName(x.s) + ' (' + UI.wearShort(x.f) + ')';
    return '<div class="shc-slot r' + sk.r + '">' +
      '<button class="shc-it" data-act="shc-pick" data-id="' + i + '" title="' + esc(tip) + ' · ' + t('shc_change') + '">' +
        '<span class="shc-art">' + Art.item(x.s, x.f) + '</span>' +
        '<b class="shc-nm">' + esc(nm) + '</b><small class="shc-fin">' + esc(G.finishName(x.s)) + '</small>' +
        '<em class="shc-pr">' + UI.COIN + G.fmt(G.instValue(x)) + '</em>' +
      '</button>' +
      '<button class="shc-rm" data-act="shc-rm" data-id="' + i + '" title="' + t('shc_rm') + '" aria-label="' + t('shc_rm') + '">' + UI.ic('x') + '</button>' +
    '</div>';
  }

  // Витрина в профиле: заголовок, счётчик, 5 слотов
  function render(el) {
    if (!el || !G.S) return;
    host = el;
    const list = insts();
    let slots = '';
    for (let i = 0; i < MAX; i++) slots += slotHTML(list[i] || null, i);
    el.innerHTML = '<div class="shc glass">' +
      '<div class="shc-h"><b>' + t('shc_title') + '</b><span class="shc-n">' + list.length + ' / ' + MAX + '</span>' +
      '<small>' + t('shc_hint') + '</small></div>' +
      '<div class="shc-row">' + slots + '</div></div>';
  }
  function redraw() { if (host && host.isConnected) render(host); }

  // Окно выбора: предметы инвентаря, дорогие сверху; уже стоящие на витрине (кроме этого слота) не показываем
  function openPick(i) {
    const a = insts().map((x) => x.u);
    slot = Math.max(0, Math.min(Math.min(a.length, MAX - 1), i));
    const busy = {};
    a.forEach((u, k) => { if (k !== slot) busy[u] = 1; });
    const all = G.S.inv.filter((x) => !busy[x.u]).sort((p, q) => G.instValue(q) - G.instValue(p) || q.u - p.u);
    const shown = all.slice(0, PICK_MAX);
    const cur = a[slot];
    const grid = shown.length
      ? '<div class="item-grid shc-grid">' + shown.map((x) => UI.itemCard(x, { act: 'shc-put', price: G.instValue(x), selected: x.u === cur })).join('') + '</div>' +
        (all.length > shown.length ? '<p class="shc-more">' + t('shc_more', { n: PICK_MAX }) + '</p>' : '')
      : '<div class="shc-none">' + t('shc_none') + '</div>';
    UI.modal('<h3 class="m-title">' + t('shc_pick') + '</h3><p class="shc-sub">' + t('shc_pick_sub') + '</p>' + grid +
      '<div class="m-btns"><button class="btn" data-act="close">' + t('shc_cancel') + '</button></div>', { wide: true, cls: 'shc-modal' });
  }

  UI.actions['shc-pick'] = function (id) { if (G.S) openPick(Number(id) || 0); };
  UI.actions['shc-put'] = function (id) {
    const u = Number(id);
    if (!G.findInst(u)) return;
    const a = ids();
    insts();
    const was = a.indexOf(u);
    if (was >= 0 && was !== slot) a.splice(was, 1);
    if (slot < a.length) a[slot] = u; else if (a.length < MAX) a.push(u);
    G.save(false);
    UI.closeModal(true);
    redraw();
    G.emit('showcase', { n: a.length });
  };
  UI.actions['shc-rm'] = function (id) {
    const a = ids(), i = Number(id);
    insts();
    if (!(i >= 0 && i < a.length)) return;
    a.splice(i, 1);
    G.save(false);
    redraw();
    G.emit('showcase', { n: a.length });
  };

  // Проданное и улетевшее в апгрейд/контракт пропадает сразу — перерисуем, если витрина на экране
  ['sell', 'upgrade', 'contract'].forEach((ev) => G.on(ev, () => { if (host && host.isConnected && G.S) redraw(); }));

  return {
    render: render,
    // [[скин, износ], …] — для открытых данных в живой ленте
    list: () => insts().map((x) => [x.s, x.f]),
    uids: () => insts().map((x) => x.u),
    MAX: MAX,
  };
})();
