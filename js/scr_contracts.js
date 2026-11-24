'use strict';

// Контракт обмена (раунд 7, агент upgrade): 10 предметов из инвентаря → 1 случайный, дороже самого дорогого из них.
// Вкладка «Контракт» экрана «Апгрейды» (переключатель — js/scr_upgrade.js, действие UI.actions['up-tab']).
// Правила: трофей (G.isSecret) и ★ класть нельзя. Цель стоимости T = m · сумма вложенного, где m случайно:
// чаще 0.72–0.94 (чуть меньше), иногда 1.05–1.6 (заметно больше) — в среднем ≈ 0.92. Выход — скин из SKIN_LIST
// строго дороже самого дорогого вложенного и только из «коридора» [0.72 · сумма, 1.6 · сумма]: в каталоге есть
// большие провалы цен, и без коридора выход прыгал между ×0.3 и ×20. Внутри коридора — выбор между соседями
// по цене около T (T слегка подправляется, чтобы среднее по набору было ≈ 0.92 и при неровных ценах).
// Износ выхода — средний float вложенных. Чтобы правило «дороже самого дорогого» не стало печатным станком,
// самый дорогой предмет не может быть дороже 60 % суммы (иначе гарантированный выход был бы прибыльным).
const Contracts = (function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;
  const N = 10;            // предметов в контракте
  const SKEW = 0.6;        // доля самого дорогого в сумме, не больше
  const GAP = 0.9;         // самый дешёвый возможный выход — не дороже этой доли суммы
  const REACH = 0.88;      // самый дорогой возможный выход — не дешевле этой доли суммы (иначе среднее проседает)
  const DEAR = 0.1;        // «дорогой» предмет — дороже 10 % стоимости инвентаря: подтверждение в два шага
  const LOW = [0.72, 0.94], HIGH = [1.05, 1.6], P_HIGH = 0.18;
  const MEAN = (1 - P_HIGH) * (LOW[0] + LOW[1]) / 2 + P_HIGH * (HIGH[0] + HIGH[1]) / 2;   // ≈ 0.92

  Object.assign(I18N.ru, {
    ct_title: 'Контракт обмена', ct_sub: 'Отдайте 10 предметов — получите один случайный, дороже самого дорогого из них',
    ct_res: 'Результат', ct_res_hint: 'Здесь появится результат', ct_in: 'Вложено', ct_max: 'Самый дорогой',
    ct_range: 'Возможный результат', ct_wear: 'Износ результата', ct_go: 'Подписать контракт',
    ct_need: 'Нужно ещё {n} из 10', ct_confirm: 'Подтвердить обмен', ct_again: 'Нажмите «Подтвердить обмен» ещё раз в течение 5 секунд.',
    ct_dear: 'Внутри дорогой предмет: {name} · {v}', ct_skew: 'Самый дорогой предмет дороже 60 % суммы — добавьте предметы подороже или уберите его',
    ct_top: 'Дороже самого дорогого предмета ничего нет — уберите его', ct_gap: 'Для этого набора нет предмета подходящей цены (дороже самого дорогого, около {a} – {b}). Уберите самый дорогой или добавьте другие предметы',
    ct_fill: 'Заполнить дешёвыми',
    ct_all_rar: 'Все редкости', ct_items: 'Мои предметы', ct_note: '★ и секретные трофеи в контракт не берутся',
    ct_full: 'В контракте уже 10 предметов', ct_no_star: '★ в контракт класть нельзя', ct_empty: 'Нет подходящих предметов — откройте кейсы',
    ct_got: 'Получено', ct_done: 'Контракт выполнен', ct_count: 'Контрактов: {n}', ct_avg: 'средний',
  });
  Object.assign(I18N.en, {
    ct_title: 'Trade-up contract', ct_sub: 'Give 10 items — get one random item pricier than the most expensive of them',
    ct_res: 'Result', ct_res_hint: 'The result will appear here', ct_in: 'Put in', ct_max: 'Most expensive',
    ct_range: 'Possible result', ct_wear: 'Result wear', ct_go: 'Sign the contract',
    ct_need: '{n} more of 10 needed', ct_confirm: 'Confirm trade', ct_again: 'Press «Confirm trade» again within 5 seconds.',
    ct_dear: 'Contains a valuable item: {name} · {v}', ct_skew: 'The priciest item is over 60 % of the total — add pricier items or remove it',
    ct_top: 'Nothing costs more than your priciest item — remove it', ct_gap: 'No item has a fitting price for this set (above your priciest one, about {a} – {b}). Remove the priciest item or add other ones',
    ct_fill: 'Fill with cheapest',
    ct_all_rar: 'All rarities', ct_items: 'My items', ct_note: '★ items and secret trophies can\'t go into a contract',
    ct_full: 'The contract already has 10 items', ct_no_star: '★ items can\'t go into a contract', ct_empty: 'No suitable items — open some cases',
    ct_got: 'Received', ct_done: 'Contract complete', ct_count: 'Contracts: {n}', ct_avg: 'average',
  });

  // Статистика игрока: сколько контрактов, сколько вложено и получено, лучший результат
  const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);
  G.ext('contracts', {
    def: () => ({ n: 0, inV: 0, outV: 0, best: 0 }),
    clean: (r) => (r && typeof r === 'object' ? { n: Math.floor(num(r.n)), inV: num(r.inV), outV: num(r.outV), best: num(r.best) } : null),
  });

  let sel = [];            // uid выбранных предметов (по порядку выбора)
  let sort = 'asc';        // 'asc' | 'desc'
  let rar = -1;            // фильтр редкости (-1 — все)
  let armed = 0;           // время первого нажатия при подтверждении в два шага
  let last = null;         // последний результат { inst, value } — показывается в слоте итога
  let built = false;

  const ok = (x) => !!x && !G.isSecret(x.s) && !G.isStar(x.s);
  const items = () => sel.map((u) => G.findInst(u)).filter(ok);
  const price = (x) => G.sellPrice(x);

  // Сводка выбранного: сумма, самый дорогой, средний износ
  function summary() {
    const xs = items();
    let s = 0, m = 0, f = 0, top = null;
    xs.forEach((x) => { const p = price(x); s += p; f += x.f; if (p > m) { m = p; top = x; } });
    return { xs: xs, n: xs.length, sum: s, max: m, top: top, f: xs.length ? Math.round(f / xs.length * 10000) / 10000 : 0 };
  }

  // Цены каталога при данном износе (по возрастанию — SKIN_LIST уже отсортирован по стоимости)
  function priced(f) {
    return SKIN_LIST.map((sk) => ({ id: sk.id, p: G.sellPrice({ s: sk.id, f: f }) }));
  }

  // Коридор выхода: скины дороже самого дорогого вложенного с ценой в [LOW[0] · сумма, HIGH[1] · сумма]
  function band(sm, list) {
    const a = sm.sum * LOW[0], b = sm.sum * HIGH[1];
    return (list || priced(sm.f)).filter((x) => x.p > sm.max && x.p >= a && x.p <= b);
  }

  // Ожидаемая цена выхода при цели T (выбор между соседями — линейно, за краями коридора — крайний скин)
  const gOf = (c, T) => Math.min(c[c.length - 1].p, Math.max(c[0].p, T));
  // Поправка k к цели: среднее выхода по коридору c должно быть MEAN · сумма (провалы цен не сдвигают его)
  function kOf(c, sum) {
    const E = (k) => {
      let a = 0, b = 0;
      for (let i = 0; i < 48; i++) {
        const u = (i + 0.5) / 48;
        a += gOf(c, k * sum * (LOW[0] + u * (LOW[1] - LOW[0])));
        b += gOf(c, k * sum * (HIGH[0] + u * (HIGH[1] - HIGH[0])));
      }
      return ((1 - P_HIGH) * a + P_HIGH * b) / 48;
    };
    let lo = 0.6, hi = 1.6;
    const goal = MEAN * sum;
    if (E(hi) <= goal) return hi;
    if (E(lo) >= goal) return lo;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (E(m) < goal) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  // Скин из коридора с ценой около T: между соседями по цене выбираем так, чтобы среднее было T
  // (нет соседа с одной стороны — ближайший скин коридора), затем — случайный среди скинов почти той же цены (±3 %)
  function pickNear(c, T) {
    if (!c.length) return null;
    let i = 0;
    while (i < c.length && c[i].p <= T) i++;
    const lo = i > 0 ? c[i - 1] : null, hi = i < c.length ? c[i] : null;
    let pick = !lo ? hi : !hi ? lo : (Math.random() < (T - lo.p) / Math.max(1e-9, hi.p - lo.p) ? hi : lo);
    const near = c.filter((x) => x.p >= pick.p * 0.97 && x.p <= pick.p * 1.03);
    if (near.length > 1) pick = near[Math.floor(Math.random() * near.length)];
    return pick;
  }

  const rollMult = () => (Math.random() < P_HIGH
    ? HIGH[0] + Math.random() * (HIGH[1] - HIGH[0])
    : LOW[0] + Math.random() * (LOW[1] - LOW[0]));

  // Диапазон возможного результата (для подсказки): самый дешёвый и самый дорогой скин коридора;
  // коридор пуст — его границы (контракт тогда заблокирован, причина — в ct_gap)
  function range(sm) {
    const c = band(sm);
    if (c.length) return { lo: c[0].p, hi: c[c.length - 1].p };
    return { lo: Math.max(sm.max, sm.sum * LOW[0]), hi: sm.sum * HIGH[1] };
  }

  // Почему контракт нельзя подписать ('' — можно)
  function blocker(sm) {
    if (sm.n < N) return t('ct_need', { n: N - sm.n });
    if (sm.max > sm.sum * SKEW) return t('ct_skew');
    const list = priced(sm.f);
    if (!list.some((x) => x.p > sm.max)) return t('ct_top');
    // в коридоре должен быть скин не дороже GAP · суммы (иначе выход гарантированно прибыльный)
    // и скин не дешевле REACH · суммы (иначе выход почти всегда заметно дешевле вложенного)
    const c = band(sm, list);
    if (!c.length || c[0].p > sm.sum * GAP || c[c.length - 1].p < sm.sum * REACH) {
      const a = Math.max(sm.max, sm.sum * LOW[0]), b = sm.sum * HIGH[1];
      return t('ct_gap', { a: COIN + G.fmt(a), b: COIN + G.fmt(b) });
    }
    return '';
  }

  // Дорогой предмет внутри (дороже 10 % стоимости инвентаря) — нужен второй клик
  function dearOf(sm) {
    const worth = G.sellableWorth().v;
    return sm.top && sm.max > worth * DEAR ? sm.top : null;
  }

  // Сам контракт: снимает вложенные, кладёт выход, событие, сохранение. Возвращает { inst, value, sum } или null
  function sign() {
    const sm = summary();
    if (blocker(sm)) return null;
    const c = band(sm);
    const pick = pickNear(c, sm.sum * rollMult() * kOf(c, sm.sum));
    if (!pick) return null;
    G.removeInsts(sm.xs.map((x) => x.u));
    const inst = G.addInst(pick.id, sm.f, 'contract').inst;
    const value = price(inst);
    const st = G.extOf('contracts');
    st.n++; st.inV += sm.sum; st.outV += value; if (value > st.best) st.best = value;
    G.emit('contract', { n: sm.n, value: sm.sum, out: value, inst: inst, skin: pick.id });
    G.save(false);
    sel = [];
    return { inst: inst, value: value, sum: sm.sum, from: sm.xs };
  }

  // ---------- Разметка вкладки (один раз) ----------
  function build() {
    if (built) return;
    built = true;
    $('#ct-pane').innerHTML =
      '<div class="ct-top">' +
        '<div class="ct-box ct-main">' +
          '<div class="up-ph"><span><b data-i18n="ct_title">' + t('ct_title') + '</b><small data-i18n="ct_sub">' + t('ct_sub') + '</small></span>' +
            '<button class="lnk" data-act="ct-clear" data-i18n="up_clear">' + t('up_clear') + '</button></div>' +
          '<div class="ct-slots" id="ct-slots"></div>' +
        '</div>' +
        '<div class="ct-box ct-side">' +
          '<div class="up-ph"><span data-i18n="ct_res">' + t('ct_res') + '</span><small class="ct-cnt" id="ct-cnt"></small></div>' +
          '<div class="ct-res" id="ct-res"></div>' +
          '<dl class="ct-stats" id="ct-stats"></dl>' +
          '<div class="ct-warn" id="ct-warn"></div>' +
          '<div class="ct-go-row"><button class="btn primary big" id="ct-go" data-act="ct-go"></button></div>' +
        '</div>' +
      '</div>' +
      '<div class="panel up-list ct-list">' +
        '<div class="panel-h"><i class="ic i-inv"></i><span data-i18n="ct_items">' + t('ct_items') + '</span>' +
          '<div class="ct-tools">' +
            '<label class="sortsel mini"><i class="ic i-layers"></i><select id="ct-rar"></select></label>' +
            '<label class="sortsel mini"><i class="ic i-sort"></i><select id="ct-sort">' +
              '<option value="asc" data-i18n="sort_asc">' + t('sort_asc') + '</option>' +
              '<option value="desc" data-i18n="sort_desc">' + t('sort_desc') + '</option></select></label>' +
            '<button class="btn mini" data-act="ct-fill" data-i18n="ct_fill">' + t('ct_fill') + '</button>' +
          '</div></div>' +
        '<div class="item-grid up ct-grid scroll" id="ct-inv"></div>' +
        '<div class="ct-note" data-i18n="ct_note">' + t('ct_note') + '</div>' +
      '</div>';
  }

  const nameOf = (id) => (G.isStar(id) ? '★ ' : '') + G.skinName(id) + ' | ' + G.finishName(id);

  function renderSlots() {
    const xs = items();
    let h = '';
    for (let i = 0; i < N; i++) {
      const x = xs[i];
      h += x
        ? '<button class="ct-slot r' + SKINS[x.s].r + '" data-act="ct-unpick" data-id="' + x.u + '" title="' + nameOf(x.s) + '">' +
          '<span class="ct-sp">' + COIN + G.fmt(price(x)) + '</span><span class="ct-art">' + Art.item(x.s, x.f) + '</span>' +
          '<span class="ct-nm">' + G.skinName(x.s) + '</span></button>'
        : '<div class="ct-slot empty"><span>' + (i + 1) + '</span></div>';
    }
    UI.setHTML($('#ct-slots'), h);
  }

  function renderSide() {
    const sm = summary(), why = blocker(sm), rg = sm.n ? range(sm) : null, dear = why ? null : dearOf(sm);
    const st = G.extOf('contracts');
    UI.setText($('#ct-cnt'), st.n ? t('ct_count', { n: st.n }) : '');
    // слот итога: последний результат или подсказка
    UI.setHTML($('#ct-res'), last
      ? '<div class="ct-out">' + UI.itemCard(last.inst) + '</div>' +
        '<div class="ct-got">' + t('ct_got') + ': <b>' + COIN + G.fmt(last.value) + '</b> <span class="' + (last.value >= last.sum ? 'up' : 'dn') + '">×' + (last.value / last.sum).toFixed(2) + '</span></div>'
      : '<div class="up-hint">' + UI.ic('swap') + '<span>' + t('ct_res_hint') + '</span></div>');
    const row = (k, v) => '<div><dt>' + t(k) + '</dt><dd>' + v + '</dd></div>';
    UI.setHTML($('#ct-stats'),
      row('ct_in', '<b>' + COIN + G.fmt(sm.sum) + '</b> <small>' + sm.n + '/' + N + '</small>') +
      row('ct_max', sm.n ? COIN + G.fmt(sm.max) : '—') +
      row('ct_range', rg ? COIN + G.fmt(rg.lo) + ' – ' + COIN + G.fmt(rg.hi) : '—') +
      row('ct_wear', sm.n ? t('wear_' + G.wearOf(sm.f).id) + ' <small>' + sm.f.toFixed(3) + '</small>' : '—'));
    const live0 = armed && Date.now() - armed < 5000;
    const warn = why && sm.n >= N ? why : dear ? t('ct_dear', { name: nameOf(dear.s), v: COIN + G.fmt(price(dear)) }) + (live0 ? '<br>' + t('ct_again') : '') : '';
    UI.setHTML($('#ct-warn'), warn);
    $('#ct-warn').classList.toggle('bad', !!(why && sm.n >= N));
    const go = $('#ct-go'), live = armed && Date.now() - armed < 5000;
    go.disabled = !!why || UI.isSpinning();
    go.classList.toggle('armed', !!(live && dear && !why));
    UI.setText(go, why ? (sm.n < N ? why : t('ct_go')) : live && dear ? t('ct_confirm') : t('ct_go'));
  }

  function eligible() {
    const xs = G.S.inv.filter(ok);
    return { all: xs, list: xs.filter((x) => rar < 0 || SKINS[x.s].r === rar)
      .sort((a, b) => (sort === 'desc' ? price(b) - price(a) : price(a) - price(b)) || a.u - b.u) };
  }

  function renderInv() {
    const e = eligible();
    // фильтр редкости — только редкости, которые есть среди подходящих предметов
    const have = {};
    e.all.forEach((x) => { have[SKINS[x.s].r] = 1; });
    if (rar >= 0 && !have[rar]) { rar = -1; return renderInv(); }
    UI.setHTML($('#ct-rar'), '<option value="-1">' + t('ct_all_rar') + '</option>' +
      RARITIES.map((r, i) => (have[i] ? '<option value="' + i + '"' + (i === rar ? ' selected' : '') + '>' + t('rar_' + r.id) + '</option>' : '')).join(''));
    $('#ct-rar').value = String(rar);
    $('#ct-sort').value = sort;
    $('#ct-inv').innerHTML = e.list.length
      ? e.list.map((x) => UI.itemCard(x, { act: 'ct-pick', selected: sel.indexOf(x.u) >= 0 })).join('')
      : '<div class="empty small">' + t('ct_empty') + '</div>';
  }

  function render() {
    build();
    sel = items().map((x) => x.u).slice(0, N);   // проданные и улетевшие в апгрейд — выпадают сами
    renderSlots();
    renderSide();
    renderInv();
  }

  function tick() {
    if (armed && Date.now() - armed >= 5000) { armed = 0; renderSide(); }
  }

  // ---------- Выбор ----------
  function changed() { armed = 0; last = null; renderSlots(); renderSide(); }
  function markGrid() {
    UI.$$('#ct-inv [data-act="ct-pick"]').forEach((b) => b.classList.toggle('sel', sel.indexOf(Number(b.getAttribute('data-id'))) >= 0));
  }

  A['ct-pick'] = function (u) {
    if (UI.isSpinning()) return;
    u = Number(u);
    const x = G.findInst(u);
    if (!x) return;
    if (G.isSecret(x.s)) { UI.toast(t('ct_note'), 'bad'); return; }
    if (G.isStar(x.s)) { UI.toast(t('ct_no_star'), 'bad'); return; }
    const i = sel.indexOf(u);
    if (i >= 0) sel.splice(i, 1);
    else if (sel.length >= N) { UI.toast(t('ct_full')); return; }
    else sel.push(u);
    markGrid();
    changed();
  };
  A['ct-unpick'] = function (u) {
    if (UI.isSpinning()) return;
    sel = sel.filter((x) => x !== Number(u));
    markGrid();
    changed();
  };
  A['ct-clear'] = function () { if (UI.isSpinning()) return; sel = []; markGrid(); changed(); };
  // «Заполнить дешёвыми»: свободные места — самыми дешёвыми подходящими (с учётом фильтра редкости)
  A['ct-fill'] = function () {
    if (UI.isSpinning()) return;
    const list = eligible().list.slice().sort((a, b) => price(a) - price(b) || a.u - b.u);
    for (let i = 0; i < list.length && sel.length < N; i++) if (sel.indexOf(list[i].u) < 0) sel.push(list[i].u);
    markGrid();
    changed();
  };
  A['ct-go'] = function () { go(); };

  document.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'ct-sort') { sort = e.target.value === 'desc' ? 'desc' : 'asc'; renderInv(); }
    else if (id === 'ct-rar') { rar = Number(e.target.value); if (!(rar >= 0)) rar = -1; renderInv(); }
  });

  // ---------- Подписание и анимация ----------
  // Сдержанно: вложенные по очереди сжимаются в слот итога (сдвиг + уменьшение + растворение),
  // слот коротко «принимает» их, затем снизу выезжает результат. Турбо — втрое быстрее.
  const calm = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function anim(el, frames, o) {
    return el && typeof el.animate === 'function' ? el.animate(frames, o).finished.catch(() => {}) : Promise.resolve();
  }

  async function go() {
    if (UI.isSpinning()) return;
    const sm = summary(), why = blocker(sm);
    if (why) { UI.toast(why, 'bad'); return; }
    // дорогой предмет внутри — первое нажатие только взводит кнопку (5 с на подтверждение)
    if (dearOf(sm) && !(armed && Date.now() - armed < 5000)) { armed = Date.now(); renderSide(); return; }
    armed = 0;
    const slots = UI.$$('#ct-slots .ct-slot:not(.empty)'), res = $('#ct-res');
    const r = sign();
    if (!r) { UI.toast(t('ct_top'), 'bad'); render(); return; }
    UI.setSpinning(true);
    $('#ct-go').disabled = true;
    const sp = G.S.settings.fast ? 0.35 : 1;
    if (!calm() && res) {
      const rb = res.getBoundingClientRect(), cx = rb.left + rb.width / 2, cy = rb.top + rb.height / 2;
      const all = slots.map((el, i) => {
        const b = el.getBoundingClientRect();
        const dx = cx - (b.left + b.width / 2), dy = cy - (b.top + b.height / 2);
        setTimeout(() => { if (typeof Sfx !== 'undefined') Sfx.tick(); }, i * 40 * sp);
        return anim(el, [{ transform: 'none', opacity: 1 },
          { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(.3)', opacity: 0 }],
        { duration: 420 * sp, delay: i * 40 * sp, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
      });
      await Promise.all(all);
      await anim(res, [{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: 220 * sp, easing: 'ease-out' });
    }
    last = r;
    render();
    const out = $('#ct-res .ct-out');
    if (out) out.classList.add('rev');
    if (typeof Sfx !== 'undefined') { if (r.value >= r.sum) Sfx.upWin(); else Sfx.coin(); }
    if (!calm()) await anim(out, [{ transform: 'translateY(18px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300 * sp, easing: 'cubic-bezier(.2,.7,.2,1)' });
    UI.setSpinning(false);
    UI.renderFeed();
    renderSide();
  }

  return {
    render: render, tick: tick,
    // для проверки и других модулей: статистика и чистый расчёт без UI
    stats: () => G.extOf('contracts'),
    _sel: (uids, quiet) => { sel = uids.slice(0, N); last = null; armed = 0; if (built && !quiet) render(); },
    _sign: sign, _summary: summary, _range: range,
  };
})();
