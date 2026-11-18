'use strict';

// Экран «Профиль»: игрок, статистика, лучший дроп, коллекция. Плюс регистрация и настройки.
const Profile = (function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;
  const openCol = {};   // раскрытые кейсы в коллекции

  function render() {
    const S = G.S;
    const p = Platform.playerInfo();
    const img = $('#prof-img');
    if (p.photo) { img.src = p.photo; img.style.display = 'block'; UI.setText($('#prof-letter'), ''); }
    else { img.style.display = 'none'; UI.setText($('#prof-letter'), S.profile.ava || G.playerName().charAt(0).toUpperCase()); }
    UI.setText($('#prof-name'), G.playerName());
    UI.setText($('#prof-cloud'), Platform.hasCloud() ? t('cloud_on') : t('cloud_off'));

    $('#prof-best').innerHTML = S.best
      ? UI.itemCard(S.best, { price: G.instValue(S.best) })
      : '<div class="empty small">' + t('none_yet') + '</div>';

    const rows = [
      ['st_opened', G.fmtInt(S.opened)], ['st_upgrades', G.fmtInt(S.upgrades)], ['st_up_wins', G.fmtInt(S.upWins)],
      ['st_earned', COIN + G.fmt(S.total)], ['st_clicks', G.fmtInt(S.clicks)],
    ];
    $('#prof-stats').innerHTML = rows.map((r) => '<div class="st"><b>' + r[1] + '</b><span>' + t(r[0]) + '</span></div>').join('');

    const n = G.foundCount();
    UI.setText($('#col-progress'), t('col_progress', { a: n, b: TOTAL_SKINS }));
    $('#col-bar').style.width = (n / TOTAL_SKINS * 100) + '%';
    UI.setText($('#col-bonus'), t('col_bonus', { v: n }));
    renderCollection();
    tick();
  }

  // Коллекция по кейсам: предметы рисуются только у раскрытых кейсов (их сотни)
  function renderCollection() {
    const S = G.S;
    $('#col-list').innerHTML = CASES.map((c) => {
      const got = c.items.filter((id) => S.found[id]).length;
      const open = !!openCol[c.id];
      return '<div class="col-sec' + (open ? ' open' : '') + (got === c.items.length ? ' full' : '') + '">' +
        '<button class="col-h" data-act="col-toggle" data-id="' + c.id + '"><span class="col-nm">' + G.nm(c.name) + '</span>' +
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
      '<div class="ava-grid">' + G.AVATARS.map((a) => '<button class="ava-opt' + (a === regAva ? ' on' : '') + '" data-act="reg-ava" data-id="' + a + '">' + a + '</button>').join('') + '</div>' +
      '<div id="reg-admin" hidden><label class="reg-l" for="reg-pass">' + t('reg_admin_pass') + '</label>' +
      '<input id="reg-pass" class="reg-in" type="password" autocomplete="current-password"></div>' +
      '<p class="reg-err" id="reg-err"></p>' +
      '<div class="m-btns"><button class="btn primary big" data-act="reg-go">' + t(first ? 'reg_btn' : 'save') + '</button>' +
      (skip ? '<button class="btn ghost" data-act="reg-skip">' + t('reg_skip') + '</button>' : '') +
      (first ? '' : '<button class="btn" data-act="close">' + t('close') + '</button>') + '</div>' +
      '<p class="hint">' + t('reg_note') + '</p></div>', { locked: first });
    const inp = document.getElementById('reg-name');
    const syncAdmin = () => { document.getElementById('reg-admin').hidden = inp.value.trim().toLowerCase() !== Admin.LOGIN || Admin.unlocked(); };
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

  A['reg-go'] = function () {
    const inp = document.getElementById('reg-name');
    if (!inp) return;
    const name = G.cleanName(inp.value);
    if (!name) { regError(t('reg_err_name')); return; }
    const isAdmin = name.toLowerCase() === Admin.LOGIN;
    if (isAdmin && !Admin.unlocked()) {
      if (Admin.waitLeft()) { regError(t('reg_err_wait', { s: Admin.waitLeft() })); return; }
      if (!Admin.check(name, document.getElementById('reg-pass').value)) { regError(t('reg_err_admin')); return; }
      Admin.unlock();
    }
    const first = !G.S.profile.name;
    G.S.profile = { name: isAdmin ? Admin.LOGIN : name, ava: regAva };
    G.save(true);
    UI.closeModal(true);
    UI.setProfileBadge();
    UI.renderFeed();
    if (UI.screen() === 'profile') render();
    Sfx.coin();
    UI.toast(isAdmin ? t('reg_admin_ok') : t(first ? 'reg_welcome' : 'reg_saved', { n: name }), 'good');
    const after = regAfter; regAfter = null;
    if (after) after();
  };

  A['reg-skip'] = function () { UI.closeModal(true); const after = regAfter; regAfter = null; if (after) after(); };
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
      '<div class="m-btns"><button class="btn primary" data-act="close">' + t('close') + '</button>' +
      '<button class="btn danger" data-act="reset">' + t('reset') + '</button></div>');
  }

  A['settings'] = function () { if (!UI.isSpinning()) showSettings(); };

  // ---------- Выбор фона ----------
  let bgBack = null;
  function showBgPicker() {
    const cur = G.S.settings.bg;
    UI.modal('<h3 class="m-title">' + t('bg_pick') + '</h3>' +
      '<div class="bg-grid">' + Backgrounds.list().map((b) => {
        const th = Backgrounds.thumb(b.id);
        return '<button class="bg-opt' + (b.id === cur ? ' on' : '') + '" data-act="set-bg" data-id="' + b.id + '">' +
          '<span class="bg-th"' + (th ? ' style="background-image:url(\'' + th + '\')"' : '') + '></span>' +
          '<span class="bg-nm">' + G.nm(b.name) + '</span></button>';
      }).join('') + '</div>' +
      '<p class="hint">' + t('bg_hint') + '</p>' +
      '<div class="m-btns"><button class="btn primary" data-act="bg-done">' + t('close') + '</button></div>', { wide: true });
  }
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
