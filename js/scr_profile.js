'use strict';

// Экран «Профиль»: игрок, уровень, статистика, лучший дроп, коллекция, точки встройки (витрина, достижения,
// лидеры). Плюс регистрация, выбор аватара и рамки, настройки. Раунд 7 — агент profile (tools/plans/R7_SPEC.md).
Object.assign(I18N.ru, {
  pf_level: 'Уровень', pf_next: 'Следующий уровень', pf_max: 'Максимальный уровень', pf_total: 'Всего опыта: {v}',
  pf_tab_ach: 'Достижения', pf_tab_lead: 'Лидеры',
  pf_ap_title: 'Аватар и рамка', pf_ap_ava: 'Аватар', pf_ap_frame: 'Рамка', pf_ap_none: 'Без рамки', pf_ap_letter: 'Буква ника',
  pf_ap_lock: 'Откроется на {n} уровне', pf_ap_apply: 'Применить', pf_ap_hint: 'Новые аватары и рамки открываются с уровнем.',
  pf_reset_warn: 'Весь прогресс будет удалён: монеты, предметы, уровень, задания и статистика. Ник, аватар и настройки останутся. Отменить нельзя.',
  pf_reset_yes: 'Да, сбросить', pf_reset_done: 'Прогресс сброшен', pf_cancel: 'Отмена',
});
Object.assign(I18N.en, {
  pf_level: 'Level', pf_next: 'Next level', pf_max: 'Max level', pf_total: 'Total XP: {v}',
  pf_tab_ach: 'Achievements', pf_tab_lead: 'Leaders',
  pf_ap_title: 'Avatar and frame', pf_ap_ava: 'Avatar', pf_ap_frame: 'Frame', pf_ap_none: 'No frame', pf_ap_letter: 'Initial',
  pf_ap_lock: 'Unlocks at level {n}', pf_ap_apply: 'Apply', pf_ap_hint: 'New avatars and frames unlock as you level up.',
  pf_reset_warn: 'All progress will be erased: coins, items, level, quests and stats. Your nickname, avatar and settings stay. This cannot be undone.',
  pf_reset_yes: 'Yes, reset', pf_reset_done: 'Progress reset', pf_cancel: 'Cancel',
});

const Profile = (function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;
  const openCol = {};   // раскрытые кейсы в коллекции
  let tab = 'items';    // вкладка: предметы | коллекция | достижения | лидеры
  const hasXP = () => typeof XP !== 'undefined' && !!XP.info;
  // модули-соседи раунда 7 (подключаются после ядра; пока их нет — их вкладки и блоки скрыты)
  const modShow = () => (typeof Showcase !== 'undefined' && Showcase && Showcase.render ? Showcase : null);
  const modAch = () => (typeof ACH !== 'undefined' && ACH && ACH.render ? ACH : null);
  const modLead = () => (typeof Leaders !== 'undefined' && Leaders && Leaders.render ? Leaders : null);
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => '&#' + m.charCodeAt(0) + ';');
  // вызов render соседнего модуля: его ошибка не должна ронять профиль
  function embed(mod, el) {
    if (!el) return false;
    el.hidden = !mod;
    if (!mod) { el.innerHTML = ''; return false; }
    try { mod.render(el); } catch (e) { el.hidden = true; setTimeout(() => { throw e; }, 0); }
    return true;
  }

  // ---------- Блок уровня ----------
  // Номер уровня крупно, опыт «1 240 / 2 000», полоса, ранг и что даст следующий уровень (XP.info, js/xp.js)
  function renderLevel() {
    const el = $('#prof-level');
    if (!hasXP()) { el.hidden = true; return; }
    const x = XP.info(), max = !x.next;
    el.hidden = false;
    el.innerHTML = '<div class="pl-num"><small>' + t('pf_level') + '</small><b>' + x.lv + '</b></div>' +
      '<div class="pl-main">' +
        '<div class="pl-top"><span class="pl-rank">' + UI.ic('medal') + esc(x.rank.name) + '</span>' +
          (max ? '<span class="pl-xp">' + t('pf_total', { v: G.fmtInt(x.total) }) + '</span>'
            : '<span class="pl-xp"><b>' + G.fmtInt(x.xp) + '</b> / ' + G.fmtInt(x.need) + ' XP</span>') + '</div>' +
        '<div class="bar"><i style="width:' + x.pct.toFixed(1) + '%"></i></div>' +
        '<div class="pl-next">' + (max ? t('pf_max')
          : '<span>' + t('pf_next') + ' ' + x.next.lv + ':</span> <b>' + esc(x.next.text) + '</b>') + '</div>' +
      '</div>';
  }

  // Рамка аватара (выбирается в окне «Аватар и рамка», хранится в js/xp.js — G.S.ext.xp.fr)
  function paintFrame(el, fr) {
    el.classList.add('xp-fr');
    if (fr) el.setAttribute('data-fr', fr); else el.removeAttribute('data-fr');
  }

  function render() {
    const S = G.S;
    const p = Platform.playerInfo();
    const img = $('#prof-img');
    const ava = S.profile.ava;
    if (p.photo && !ava) { img.src = p.photo; img.style.display = 'block'; UI.setText($('#prof-letter'), ''); }
    else { img.style.display = 'none'; UI.setHTML($('#prof-letter'), UI.avaHTML(ava)); }
    $('.prof-ava').classList.toggle('ico', !!ava);
    UI.setText($('#prof-name'), G.playerName());
    UI.setText($('#prof-uid'), 'ID: ' + (1000000 + Math.floor(hash01('id:' + G.playerName()) * 8999999)));
    paintFrame($('#prof-ava'), hasXP() && XP.frame ? XP.frame() : '');
    renderLevel();
    UI.setText($('#prof-cloud'), Platform.hasCloud() ? t('cloud_on') : t('cloud_off'));

    // Лучший дроп: слева редкость, название, качество и цена, справа плитка
    const b = S.best, bs = b && SKINS[b.s];
    $('#prof-best').innerHTML = bs
      ? '<div class="pb-info r' + bs.r + '"><span class="pb-rar">' + t('rar_' + RARITIES[bs.r].id) + '</span>' +
        '<b>' + (G.isStar(b.s) ? '★ ' : '') + G.skinName(b.s) + '</b><span>' + G.finishName(b.s) + ' · ' + UI.wearShort(b.f) + '</span>' +
        '<em>' + COIN + G.fmt(G.instValue(b)) + '</em></div>' +
        '<div class="pb-tile">' + UI.itemCard(b, { price: G.instValue(b) }) + '</div>'
      : '<div class="empty small">' + t('best_empty') + '</div>';

    // Статистика: число с иконкой и подпись-капитель
    const rows = [['cases', S.opened, 'st_opened'], ['upgrade', S.upgrades, 'st_upgrades'], ['trophy', S.upWins, 'st_up_wins']];
    $('#prof-stats').innerHTML = rows.map((r) => '<div class="st" title="' + t(r[2]) + '"><b>' + UI.ic(r[0]) + G.fmtInt(r[1]) + '</b>' +
      '<small>' + t(r[2]) + '</small></div>').join('');

    // Коллекция: крупное число, приглушённый итог и процент
    const n = G.foundCount();
    const pct = TOTAL_SKINS ? n / TOTAL_SKINS * 100 : 0;
    UI.setHTML($('#col-progress'), n + '<small>/ ' + TOTAL_SKINS + '</small><em>' + (pct > 0 && pct < 1 ? pct.toFixed(1) : Math.floor(pct)) + '%</em>');
    $('#col-bar').style.width = (n / TOTAL_SKINS * 100) + '%';
    UI.setText($('#col-bonus'), t('col_bonus', { v: n }));

    // Витрина — между верхними блоками и вкладками (видна всегда, если модуль есть)
    embed(modShow(), $('#prof-showcase'));

    // Вкладки: «Достижения» и «Лидеры» — только когда их модули подключены
    const avail = { items: true, col: true, ach: !!modAch(), lead: !!modLead() };
    if (!avail[tab]) tab = 'items';
    UI.$$('#prof-tabs button').forEach((b) => {
      const id = b.getAttribute('data-id');
      b.hidden = !avail[id];
      b.classList.toggle('on', id === tab);
    });
    $('#prof-tools').hidden = tab !== 'items';
    $('#prof-wrap').hidden = tab !== 'items';
    $('#col-list').hidden = tab !== 'col';
    // содержимое скрытых вкладок не рисуем (лидеры и достижения пересчитываются только на своей вкладке)
    embed(tab === 'ach' ? modAch() : null, $('#prof-ach'));
    embed(tab === 'lead' ? modLead() : null, $('#prof-leaders'));
    if (tab === 'items') {
      $('#prof-sort').value = S.settings.sort;
      Inventory.fill($('#prof-items'), $('#prof-wrap'));
    } else if (tab === 'col') renderCollection();
    tick();
  }
  A['prof-tab'] = function (id) { tab = ['items', 'col', 'ach', 'lead'].indexOf(id) >= 0 ? id : 'items'; render(); };

  // Коллекция по кейсам: предметы рисуются только у раскрытых кейсов (их сотни)
  function renderCollection() {
    const S = G.S;
    $('#col-list').innerHTML = CASES.map((c) => {
      const got = c.items.filter((id) => S.found[id]).length;
      const open = !!openCol[c.id];
      const pct = c.items.length ? got / c.items.length * 100 : 0;
      return '<div class="col-sec' + (open ? ' open' : '') + (got === c.items.length ? ' full' : '') + '">' +
        '<button class="col-h" data-act="col-toggle" data-id="' + c.id + '"><span class="col-nm">' + G.nm(c.name) + '</span>' +
        '<span class="col-pb"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
        '<span class="col-n">' + got + ' / ' + c.items.length + '</span>' + UI.ic('chev', 'col-ar') + '</button>' +
        (open ? '<div class="item-grid small">' + c.items.map((id) => UI.itemCard(id, { cls: S.found[id] ? '' : 'unknown' })).join('') + '</div>' : '') +
        '</div>';
    }).join('');
  }
  A['col-toggle'] = function (id) { openCol[id] = !openCol[id]; renderCollection(); };

  // ---------- Регистрация ----------
  // Профиль (ник и аватар) хранится в сохранении на этом устройстве.
  // Ник администратора требует пароль, поэтому занять его без пароля нельзя.
  let regAva = null, regAfter = null;
  // аватар доступен: базовый (12 значков) или награда уровня, до которой игрок дорос
  function avaOpen(a) {
    if (!hasXP() || !XP.catalog) return true;
    return !XP.catalog().ava.some((x) => x.id === a) || XP.unlocked('ava', a);
  }

  function showRegister(first, after) {
    const P = G.S.profile;
    regAfter = after || null;
    const open = G.AVATARS.filter(avaOpen);
    regAva = (P.ava && avaOpen(P.ava) ? P.ava : '') || (regAva && avaOpen(regAva) ? regAva : '') || open[Math.floor(Math.random() * open.length)];
    const prefill = P.name || G.cleanName(Platform.playerInfo().name);
    const skip = first && !window.CASELAB_NO_SDK;   // в Яндекс Играх регистрация необязательна
    UI.modal('<div class="reg">' +
      (first ? '<div class="reg-logo">' + UI.logo() + '</div>' : '') +
      '<h3 class="m-title">' + t(first ? 'reg_title' : 'reg_edit') + '</h3>' +
      (first ? '<p class="reg-sub">' + t('reg_sub') + '</p>' : '') +
      '<label class="reg-l" for="reg-name">' + t('reg_name') + '</label>' +
      '<input id="reg-name" class="reg-in" maxlength="16" autocomplete="nickname" placeholder="' + t('reg_ph') + '" value="' + prefill + '">' +
      '<span class="reg-l">' + t('reg_ava') + '</span>' +
      '<div class="ava-grid">' + open.map((a) => '<button class="ava-opt' + (a === regAva ? ' on' : '') + '" data-act="reg-ava" data-id="' + a + '">' + UI.avaIcon(a) + '</button>').join('') + '</div>' +
      '<div id="reg-admin" hidden><label class="reg-l" for="reg-pass">' + t('reg_admin_pass') + '</label>' +
      '<input id="reg-pass" class="reg-in" type="password" autocomplete="current-password"></div>' +
      '<p class="reg-err" id="reg-err"></p>' +
      '<div class="m-btns"><button class="btn primary big" data-act="reg-go">' + t(first ? 'reg_btn' : 'save') + '</button>' +
      (skip ? '<button class="btn ghost" data-act="reg-skip">' + t('reg_skip') + '</button>' : '') +
      (first ? '' : '<button class="btn" data-act="close">' + t('close') + '</button>') + '</div>' +
      '<p class="hint">' + t('reg_note') + '</p></div>', { locked: first });
    const inp = document.getElementById('reg-name');
    const syncAdmin = () => { document.getElementById('reg-admin').hidden = inp.value.trim().toLowerCase() !== Desk.LOGIN || Desk.unlocked(); };
    inp.addEventListener('input', syncAdmin);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') A['reg-go'](); });
    document.getElementById('reg-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') A['reg-go'](); });
    syncAdmin();
    setTimeout(() => inp.focus(), 60);
  }

  function regError(msg) { const el = document.getElementById('reg-err'); if (el) el.textContent = msg; Sfx.error(); }

  A['reg-ava'] = function (a, el) {
    if (G.AVATARS.indexOf(a) < 0 || !avaOpen(a)) return;
    regAva = a;
    document.querySelectorAll('.ava-opt').forEach((b) => b.classList.toggle('on', b === el));
  };

  // Ник админа: пароль проверяется асинхронно (вывод ключа PBKDF2, js/desk.js)
  let regBusy = false;
  A['reg-go'] = function () {
    const inp = document.getElementById('reg-name');
    if (!inp || regBusy) return;
    const name = G.cleanName(inp.value);
    if (!name) { regError(t('reg_err_name')); return; }
    const isAdmin = name.toLowerCase() === Desk.LOGIN;
    if (isAdmin && !Desk.unlocked()) {
      if (Desk.waitLeft()) { regError(t('reg_err_wait', { s: Desk.waitLeft() })); return; }
      const pe = document.getElementById('reg-pass'), pass = pe.value;
      pe.value = '';
      regBusy = true;
      Desk.check(name, pass).then((res) => {
        regBusy = false;
        if (!document.getElementById('reg-name')) return;
        if (res !== 'ok') { regError(res === 'wait' && Desk.waitLeft() ? t('reg_err_wait', { s: Desk.waitLeft() }) : t('reg_err_admin')); return; }
        Desk.unlock();
        regDone(name, true);
      });
      return;
    }
    regDone(name, isAdmin);
  };
  function regDone(name, isAdmin) {
    const first = !G.S.profile.name;
    G.S.profile = { name: isAdmin ? Desk.LOGIN : name, ava: regAva };
    G.save(true);
    UI.closeModal(true);
    UI.setProfileBadge();
    UI.renderFeed();
    if (UI.screen() === 'profile') render();
    Sfx.coin();
    UI.toast(isAdmin ? t('reg_admin_ok') : t(first ? 'reg_welcome' : 'reg_saved', { n: name }), 'good');
    const after = regAfter; regAfter = null;
    if (after) after();
  }

  // «Играть как гость» (только Яндекс Игры): запоминаем выбор — при следующих запусках
  // окно регистрации не появится; зарегистрироваться можно позже в профиле (edit-profile)
  A['reg-skip'] = function () {
    G.S.settings.guest = true;
    G.save(true);
    UI.closeModal(true);
    const after = regAfter; regAfter = null;
    if (after) after();
  };
  A['edit-profile'] = function () { if (!UI.isSpinning()) showRegister(false); };

  // ---------- Аватар и рамка ----------
  // Выбор из открытых: 12 базовых значков + награды уровней (js/xp.js). Закрытые видны тусклыми — с замком
  // и уровнем, на котором откроются (стимул качаться). Аватар — G.S.profile.ava, рамка — XP.setFrame (G.S.ext.xp.fr).
  // Клик по варианту меняет только превью; сохраняется кнопкой «Применить».
  let apAva = '', apFr = '';
  function apCatalog() {
    const cat = hasXP() && XP.catalog ? XP.catalog() : { ava: [], frame: [] };
    const lvOf = {};
    cat.ava.forEach((a) => { lvOf[a.id] = a.lv; });
    return {
      ava: G.AVATARS.map((id) => ({ id: id, lv: lvOf[id] || 0, open: avaOpen(id) })),
      fr: cat.frame.map((f) => ({ id: f.id, lv: f.lv, name: f.name, open: XP.unlocked('frame', f.id) })),
    };
  }
  const lockTag = (lv) => '<span class="ap-lk">' + UI.ic('lock') + lv + '</span>';
  // превью: аватар (значок, фото платформы или буква ника) в выбранной рамке
  function apFace(a) {
    const photo = Platform.playerInfo().photo;
    if (a) return UI.avaIcon(a);
    return photo ? '<img src="' + esc(photo) + '" alt="">' : UI.avaHTML('');
  }
  function apPaint() {
    const root = $('#modal-root');
    const pv = root.querySelector('.ap-face');
    if (!pv) return;
    pv.innerHTML = apFace(apAva);
    pv.classList.toggle('ico', !!apAva);
    paintFrame(pv, apFr);
    const fr = apCatalog().fr.filter((f) => f.id === apFr)[0];
    UI.setText(root.querySelector('.ap-fr-nm'), fr ? fr.name : t('pf_ap_none'));
    root.querySelectorAll('[data-act="ap-ava"]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-id') === (apAva || '-')));
    root.querySelectorAll('[data-act="ap-fr"]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-id') === (apFr || '-')));
  }
  function showAvaPick() {
    const c = apCatalog();
    apAva = G.S.profile.ava && avaOpen(G.S.profile.ava) ? G.S.profile.ava : '';
    apFr = hasXP() && XP.frame ? XP.frame() : '';
    const avaBtn = (a) => '<button class="ap-opt' + (a.open ? '' : ' lock') + '" data-act="ap-ava" data-id="' + a.id + '"' +
      (a.open ? '' : ' disabled title="' + esc(t('pf_ap_lock', { n: a.lv })) + '"') + '>' + UI.avaIcon(a.id) + (a.open ? '' : lockTag(a.lv)) + '</button>';
    const frBtn = (f) => '<button class="ap-fopt' + (f.open ? '' : ' lock') + '" data-act="ap-fr" data-id="' + f.id + '"' +
      (f.open ? '' : ' disabled title="' + esc(t('pf_ap_lock', { n: f.lv })) + '"') + '>' +
      '<span class="ap-sw xp-fr" data-fr="' + f.id + '"></span><small>' + esc(f.name) + '</small>' + (f.open ? '' : lockTag(f.lv)) + '</button>';
    UI.modal('<h3 class="m-title">' + t('pf_ap_title') + '</h3>' +
      '<div class="ap-prev"><span class="ap-face"></span><div class="ap-pid"><b>' + esc(G.playerName()) + '</b>' +
        '<small>' + t('pf_ap_frame') + ': <span class="ap-fr-nm"></span></small></div></div>' +
      '<span class="reg-l">' + t('pf_ap_ava') + '</span>' +
      '<div class="ap-grid"><button class="ap-opt ap-letter" data-act="ap-ava" data-id="-" title="' + esc(t('pf_ap_letter')) + '">' +
        esc(G.playerName().charAt(0).toUpperCase()) + '</button>' + c.ava.map(avaBtn).join('') + '</div>' +
      (c.fr.length ? '<span class="reg-l">' + t('pf_ap_frame') + '</span>' +
        '<div class="ap-fgrid"><button class="ap-fopt" data-act="ap-fr" data-id="-"><span class="ap-sw"></span><small>' + t('pf_ap_none') + '</small></button>' +
        c.fr.map(frBtn).join('') + '</div>' : '') +
      '<p class="hint">' + t('pf_ap_hint') + '</p>' +
      '<div class="m-btns row"><button class="btn" data-act="close">' + t('pf_cancel') + '</button>' +
      '<button class="btn primary" data-act="ap-apply">' + t('pf_ap_apply') + '</button></div>', { cls: 'ap-m' });
    apPaint();
  }
  A['ava-pick'] = function () { if (!UI.isSpinning()) showAvaPick(); };
  A['ap-ava'] = function (id) {
    const a = id === '-' ? '' : id;
    if (a && (G.AVATARS.indexOf(a) < 0 || !avaOpen(a))) return;
    apAva = a;
    apPaint();
  };
  A['ap-fr'] = function (id) {
    const f = id === '-' ? '' : id;
    if (f && !(hasXP() && XP.unlocked('frame', f))) return;
    apFr = f;
    apPaint();
  };
  A['ap-apply'] = function () {
    if (apAva && !avaOpen(apAva)) return;
    G.S.profile.ava = apAva;
    G.save(true);
    if (hasXP() && XP.setFrame) XP.setFrame(apFr);
    UI.closeModal(true);
    UI.setProfileBadge();
    UI.renderFeed();
    if (UI.screen() === 'profile') render();
  };

  // На каждое изменение: баланс; блок уровня — только если опыт или язык поменялись (продажа на вкладке «Предметы» даёт опыт)
  let lvKey = '';
  function tick() {
    UI.setText($('#prof-bal'), G.fmt(G.S.coins));
    const k = hasXP() ? XP.info().total + ':' + G.lang + ':' + (XP.frame ? XP.frame() : '') : '';
    if (k !== lvKey) {
      lvKey = k;
      renderLevel();
      paintFrame($('#prof-ava'), hasXP() && XP.frame ? XP.frame() : '');
    }
  }

  Screens.reg('profile', { render: render, tick: tick });

  // ---------- Настройки ----------
  // Окно на стекле (общие стили модалок, --gl-modal). Переключатели — компактные сегменты; «Закрыть» — второстепенная;
  // «Сбросить прогресс» — мелкая ссылка в самом низу, подтверждение в два шага: ссылка → предупреждение
  // с кнопкой «Да, сбросить» → только тогда сброс (A['reset-yes']).
  const seg = (act, items, cur) => '<div class="seg pf-seg" role="group">' + items.map((it) =>
    '<button class="' + (it[0] === cur ? 'on' : '') + '" data-act="' + act + '" data-id="' + it[0] + '" aria-pressed="' + (it[0] === cur) + '">' +
    it[1] + '</button>').join('') + '</div>';
  function showSettings() {
    const S = G.S;
    const bg = Backgrounds.list().filter((b) => b.id === S.settings.bg)[0];
    UI.modal('<h3 class="m-title">' + t('settings') + '</h3>' +
      '<div class="set-list">' +
        '<div class="set-row"><span>' + t('sound') + '</span>' + seg('set-sound', [['1', t('on')], ['0', t('off')]], S.settings.sound ? '1' : '0') + '</div>' +
        '<div class="set-row"><span>' + t('language') + '</span>' + seg('set-lang', [['ru', 'RU'], ['en', 'EN']], G.lang) + '</div>' +
        '<div class="set-row"><span>' + t('background') + '</span><button class="btn" data-act="bg-pick" data-id="settings">' + UI.ic('image') + (bg ? G.nm(bg.name) : '') + '</button></div>' +
        '<div class="set-row"><span>' + t('font') + '</span>' + Fonts.button('settings') + '</div>' +
      '</div>' +
      '<div class="m-btns"><button class="btn" data-act="close">' + t('close') + '</button></div>' +
      '<div class="set-danger">' +
        '<button class="set-reset" data-act="reset">' + t('reset') + '</button>' +
        '<div class="set-warn" hidden><p>' + t('pf_reset_warn') + '</p>' +
          '<div class="m-btns row"><button class="btn" data-act="reset-no">' + t('pf_cancel') + '</button>' +
          '<button class="btn danger" data-act="reset-yes">' + t('pf_reset_yes') + '</button></div></div>' +
      '</div>', { cls: 'set-m' });
  }

  A['settings'] = function () { if (!UI.isSpinning()) showSettings(); };

  // ---------- Выбор фона ----------
  // Под плитками — ползунки «Размытие» (0–24 px) и «Затемнение» (0–80 %): применяются сразу
  // (Backgrounds.tune), сохраняются, когда ползунок отпустили. Пока ползунок двигают, окно
  // становится прозрачным (класс bg-tuning на #modal-root) — виден настоящий фон за ним.
  let bgBack = null;
  const BG_SLIDERS = [
    { k: 'bgBlur', max: 24, unit: ' px', name: 'bg_blur' },
    { k: 'bgDim', max: 80, unit: ' %', name: 'bg_dim' },
  ];
  const fill = (v, max) => (v / max * 100).toFixed(1) + '%';   // доля шкалы — золотая часть дорожки

  function sliderHtml(o, off) {
    const v = G.S.settings[o.k];
    return '<label class="bg-sl"><span class="bg-sl-h"><b>' + t(o.name) + '</b><output>' + v + o.unit + '</output></span>' +
      '<input type="range" class="bg-range" min="0" max="' + o.max + '" step="1" value="' + v + '" data-k="' + o.k + '"' +
      ' style="--p:' + fill(v, o.max) + '"' + (off ? ' disabled' : '') + '></label>';
  }

  function showBgPicker() {
    const cur = G.S.settings.bg;
    const off = cur === 'none';   // «Классика» — без картинки: размывать и затемнять нечего
    UI.modal('<h3 class="m-title">' + t('bg_pick') + '</h3>' +
      '<div class="bg-grid">' + Backgrounds.list().map((b) => {
        const th = Backgrounds.thumb(b.id);
        return '<button class="bg-opt' + (b.id === cur ? ' on' : '') + '" data-act="set-bg" data-id="' + b.id + '">' +
          '<span class="bg-th"' + (th ? ' style="background-image:url(\'' + th + '\')"' : '') + '></span>' +
          '<span class="bg-nm">' + G.nm(b.name) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="bg-tune' + (off ? ' off' : '') + '">' + BG_SLIDERS.map((o) => sliderHtml(o, off)).join('') + '</div>' +
      '<p class="hint">' + t('bg_hint') + '</p>' +
      '<div class="m-btns"><button class="btn" data-act="bg-done">' + t('close') + '</button></div>', { wide: true });
    UI.$$('#modal-root .bg-range').forEach(bindSlider);
  }

  // Живой просмотр: окно прячется, пока ползунок держат (мышь, палец), и ненадолго — при клавишах
  let peekTimer = 0, dragging = false;
  function peek(on, delay) {
    const root = $('#modal-root');
    clearTimeout(peekTimer);
    if (on) root.classList.add('bg-tuning');
    else peekTimer = setTimeout(() => root.classList.remove('bg-tuning'), delay || 0);
  }

  function bindSlider(inp) {
    const o = BG_SLIDERS.filter((x) => x.k === inp.getAttribute('data-k'))[0];
    const out = inp.parentNode.querySelector('output');
    inp.addEventListener('pointerdown', () => { if (!inp.disabled) { dragging = true; peek(true); } });
    inp.addEventListener('input', () => {
      const v = Math.max(0, Math.min(o.max, Math.round(Number(inp.value)) || 0));
      G.S.settings[o.k] = v;
      out.textContent = v + o.unit;
      inp.style.setProperty('--p', fill(v, o.max));
      Backgrounds.tune(G.S.settings.bgBlur, G.S.settings.bgDim);
      if (!dragging) { peek(true); peek(false, 900); }
    });
    inp.addEventListener('change', () => G.save(false));
  }

  // Отпустили — где бы ни оказался палец или курсор. dragging снимаем на следующем такте,
  // чтобы клик, который браузер шлёт сразу после отпускания, ещё видел перетаскивание.
  function endDrag() {
    if (!dragging) return;
    peek(false, 150);
    setTimeout(() => { dragging = false; }, 0);
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  // ползунок отпустили над затемнением вокруг окна — такой клик не закрывает окно выбора фона
  document.addEventListener('click', (e) => {
    if (dragging && e.target.classList && e.target.classList.contains('modal-back')) e.stopPropagation();
  }, true);
  A['bg-pick'] = function (from) {
    if (UI.isSpinning()) return;
    bgBack = from === 'settings' ? showSettings : null;
    showBgPicker();
  };
  A['set-bg'] = function (id) {
    if (!Backgrounds.exists(id)) return;
    G.S.settings.bg = id;
    Backgrounds.apply(id);
    G.save(false);
    showBgPicker();
  };
  A['bg-done'] = function () { const back = bgBack; bgBack = null; if (back) back(); else UI.closeModal(); };
  // переключение сегмента на месте — без перерисовки окна (иначе окно заново «въезжает»)
  function segPaint(act, id) {
    UI.$$('#modal-root [data-act="' + act + '"]').forEach((b) => {
      const on = b.getAttribute('data-id') === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
  }
  A['set-sound'] = function (id) {
    G.S.settings.sound = id === '1';
    Sfx.setEnabled(G.S.settings.sound);
    UI.setSoundIcon();
    G.save(false);
    if ($('#modal-root .set-m')) segPaint('set-sound', id === '1' ? '1' : '0'); else showSettings();
  };
  A['set-lang'] = function (id) {
    if (id !== 'ru' && id !== 'en') return;
    G.lang = id;
    G.S.settings.lang = id;
    G.save(false);
    UI.applyI18n();
    UI.renderFeed();
    UI.showScreen(UI.screen());
    showSettings();
  };

  // Сброс прогресса, шаг 1: ссылка раскрывает предупреждение с кнопкой «Да, сбросить»
  function resetStep(open) {
    const box = $('#modal-root .set-warn'), link = $('#modal-root .set-reset');
    if (!box || !link) return false;
    box.hidden = !open;
    link.hidden = open;
    if (open) { const y = box.querySelector('.btn.danger'); if (y) y.focus(); }
    return true;
  }
  A['reset'] = function () { if (!resetStep(true)) { showSettings(); resetStep(true); } };
  A['reset-no'] = function () { resetStep(false); };
  // Шаг 2: сброс. Ник, аватар (если он открыт и на 1-м уровне) и настройки остаются; открытый id игрока
  // для ленты и лидербордов (G.S.ext.pub) — тоже: это не прогресс, а «кто я»
  const RESET_KEEP = ['pub'];
  A['reset-yes'] = function () {
    const box = $('#modal-root .set-warn');
    if (!box || box.hidden) return;
    const keep = G.S.settings, prof = G.S.profile, ext = G.S.ext || {};
    G.S = G.defaultState();
    G.S.settings = keep;
    G.S.profile = prof;
    RESET_KEEP.forEach((k) => { if (ext[k] !== undefined) G.S.ext[k] = ext[k]; });
    if (prof.ava && !avaOpen(prof.ava)) prof.ava = '';
    G.save(true);
    UI.closeModal(true);
    UI.setProfileBadge();
    UI.renderFeed();
    UI.showScreen('cases');
    UI.toast(t('pf_reset_done'), 'good');
  };

  return { askRegister: (after) => showRegister(true, after), render: render };
})();
