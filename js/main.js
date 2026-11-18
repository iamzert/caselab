'use strict';

// Точка входа: загрузка сохранений, обработчики событий, игровой тик.
(function () {
  let lastTick = Date.now();

  function detectLang() {
    const l = String(Platform.lang() || navigator.language || 'ru').slice(0, 2).toLowerCase();
    return ['ru', 'be', 'kk', 'uk', 'uz'].indexOf(l) >= 0 ? 'ru' : 'en';
  }

  function tick() {
    const now = Date.now();
    let dt = (now - lastTick) / 1000;
    lastTick = now;
    if (dt < 0) dt = 0;
    const inc = G.income();
    if (inc > 0) {
      // Если вкладка была заморожена браузером — считаем как офлайн-доход
      const rate = dt > 5 ? G.C.OFFLINE_RATE : 1;
      G.addCoins(inc * Math.min(dt, G.C.OFFLINE_MAX_SEC) * rate);
    }
    G.S.lastSeen = now;
    UI.refresh();
  }

  function bindEvents() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      Sfx.unlock();
      const fn = UI.actions[el.getAttribute('data-act')];
      if (fn) fn(el.getAttribute('data-id'), el);
    });

    document.getElementById('big-coin').addEventListener('pointerdown', Farm.onCoinTap);

    // Требования Яндекс Игр: без контекстного меню, выделения и масштабирования
    const isField = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
    document.addEventListener('contextmenu', (e) => { if (!isField(e.target)) e.preventDefault(); });
    document.addEventListener('selectstart', (e) => { if (!isField(e.target)) e.preventDefault(); });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('modal-root').classList.contains('show') && !UI.modalLocked()) UI.closeModal();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        Sfx.pause();
        Platform.gameplay(false);
        G.save(true);
      } else if (!G.adBusy) {
        Sfx.resume();
        Platform.gameplay(true);
      }
    });
    window.addEventListener('pagehide', () => G.save(true));
    Platform.on('pause', () => Sfx.pause());
    Platform.on('resume', () => { if (!document.hidden) Sfx.resume(); });
  }

  async function boot() {
    Art.initDefs();
    await Platform.init();

    const local = G.readLocal();
    const cloud = await Platform.loadCloud();
    let raw = local;
    if (cloud && (!local || (cloud.savedAt || 0) > (local.savedAt || 0))) raw = cloud;
    G.S = G.sanitize(raw);

    G.lang = G.S.settings.lang || detectLang();
    Sfx.setEnabled(G.S.settings.sound);
    Backgrounds.apply(G.S.settings.bg);
    UI.applyI18n();
    UI.setSoundIcon();
    UI.setProfileBadge();
    bindEvents();
    UI.renderFeed();
    UI.showScreen('cases');
    const showOffline = Farm.prepareOffline();

    lastTick = Date.now();
    G.S.lastSeen = lastTick;
    setInterval(tick, 250);
    setInterval(() => G.save(false), 3000);

    // Ждём, пока отрисуются ящики и витрина (не дольше 3.5 с)
    await Promise.race([Art.prewarm([]), G.wait(3500)]);

    const loader = document.getElementById('loader');
    loader.classList.add('hide');
    setTimeout(() => loader.remove(), 400);

    Platform.ready();
    Platform.gameplay(true);
    // Первый вход: сначала регистрация, потом окно офлайн-дохода (если он есть)
    if (!G.S.profile.name) Profile.askRegister(showOffline);
    else if (showOffline) showOffline();
    if (location.hash === '#admin') Admin.open();
  }

  boot();
})();
