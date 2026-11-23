'use strict';

// Экран «Профиль»: игрок, статистика, лучший дроп, коллекция. Плюс регистрация и настройки.
const Profile = (function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;
  const openCol = {};   // раскрытые кейсы в коллекции
  let tab = 'items';    // вкладка: предметы | коллекция

  // Ранг по числу открытых кейсов
  const RANKS = [0, 10, 50, 150, 400, 1000];
  function rankOf(n) {
    let i = 0;
    while (i + 1 < RANKS.length && n >= RANKS[i + 1]) i++;
    const next = RANKS[i + 1];
    return { i: i, pct: next ? (n - RANKS[i]) / (next - RANKS[i]) * 100 : 100 };
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
    const rk = rankOf(S.opened);
    $('#prof-rank').innerHTML = UI.ic('medal') + '<span>' + t('rank_' + rk.i) + '</span>' +
      '<div class="bar"><div class="bar-fill" style="width:' + rk.pct.toFixed(1) + '%"></div></div>';
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

    UI.$$('#prof-tabs button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-id') === tab));
    $('#prof-tools').hidden = tab !== 'items';
    $('#prof-wrap').hidden = tab !== 'items';
    $('#col-list').hidden = tab !== 'col';
    if (tab === 'items') {
      $('#prof-sort').value = S.settings.sort;
      Inventory.fill($('#prof-items'), $('#prof-wrap'));
    } else renderCollection();
    tick();
  }
  A['prof-tab'] = function (id) { tab = id === 'col' ? 'col' : 'items'; render(); };

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

  function showRegister(first, after) {
    const P = G.S.profile;
    regAfter = after || null;
    regAva = P.ava || regAva || G.AVATARS[Math.floor(Math.random() * G.AVATARS.length)];
    const prefill = P.name || G.cleanName(Platform.playerInfo().name);
    const skip = first && !window.CASELAB_NO_SDK;   // в Яндекс Играх регистрация необязательна
    UI.modal('<div class="reg">' +
      (first ? '<div class="reg-logo">' + UI.logo() + '</div>' : '') +
      '<h3 class="m-title">' + t(first ? 'reg_title' : 'reg_edit') + '</h3>' +
      (first ? '<p class="reg-sub">' + t('reg_sub') + '</p>' : '') +
      '<label class="reg-l" for="reg-name">' + t('reg_name') + '</label>' +
      '<input id="reg-name" class="reg-in" maxlength="16" autocomplete="nickname" placeholder="' + t('reg_ph') + '" value="' + prefill + '">' +
      '<span class="reg-l">' + t('reg_ava') + '</span>' +
      '<div class="ava-grid">' + G.AVATARS.map((a) => '<button class="ava-opt' + (a === regAva ? ' on' : '') + '" data-act="reg-ava" data-id="' + a + '">' + UI.avaIcon(a) + '</button>').join('') + '</div>' +
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
    if (G.AVATARS.indexOf(a) < 0) return;
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

  function tick() { UI.setText($('#prof-bal'), G.fmt(G.S.coins)); }

  Screens.reg('profile', { render: render, tick: tick });

  // ---------- Настройки ----------
  function showSettings() {
    const S = G.S;
    const seg = (act, items, cur) => '<div class="seg">' + items.map((it) =>
      '<button class="btn' + (it[0] === cur ? ' on' : '') + '" data-act="' + act + '" data-id="' + it[0] + '">' + it[1] + '</button>').join('') + '</div>';
    const bg = Backgrounds.list().filter((b) => b.id === S.settings.bg)[0];
    UI.modal('<h3 class="m-title">' + t('settings') + '</h3>' +
      '<div class="set-row"><span>' + t('sound') + '</span>' + seg('set-sound', [['1', t('on')], ['0', t('off')]], S.settings.sound ? '1' : '0') + '</div>' +
      '<div class="set-row"><span>' + t('language') + '</span>' + seg('set-lang', [['ru', 'RU'], ['en', 'EN']], G.lang) + '</div>' +
      '<div class="set-row"><span>' + t('background') + '</span><button class="btn" data-act="bg-pick" data-id="settings">' + UI.ic('image') + (bg ? G.nm(bg.name) : '') + '</button></div>' +
      '<div class="set-row"><span>' + t('font') + '</span>' + Fonts.button('settings') + '</div>' +
      '<div class="m-btns"><button class="btn primary" data-act="close">' + t('close') + '</button>' +
      '<button class="btn danger" data-act="reset">' + t('reset') + '</button></div>');
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
      '<div class="m-btns"><button class="btn primary" data-act="bg-done">' + t('close') + '</button></div>', { wide: true });
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
  A['set-sound'] = function (id) {
    G.S.settings.sound = id === '1';
    Sfx.setEnabled(G.S.settings.sound);
    UI.setSoundIcon();
    G.save(false);
    showSettings();
  };
  A['set-lang'] = function (id) {
    G.lang = id;
    G.S.settings.lang = id;
    G.save(false);
    UI.applyI18n();
    UI.renderFeed();
    UI.showScreen(UI.screen());
    showSettings();
  };
  A['reset'] = function () {
    UI.confirm(t('reset_confirm'), () => {
      const keep = G.S.settings, prof = G.S.profile;
      G.S = G.defaultState();
      G.S.settings = keep;
      G.S.profile = prof;
      G.save(true);
      UI.renderFeed();
      UI.showScreen('cases');
    });
  };

  return { askRegister: (after) => showRegister(true, after), render: render };
})();
