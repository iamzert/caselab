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

  // Тестовое сохранение для локального просмотра: разные редкости в инвентаре и ленте
  function demoState() {
    const pick = (r, n) => SKIN_LIST.filter((s) => s.r === r).filter((s, i) => i % 7 === 3).slice(0, n).map((s) => s.id);
    const ids = [].concat(pick(8, 2), pick(7, 2), pick(6, 4), pick(5, 3), pick(4, 3), pick(3, 3), pick(2, 3), pick(1, 2), pick(0, 2));
    const inv = ids.map((s, i) => ({ u: i + 1, s: s, f: 0.02 + (i % 9) * 0.08 }));
    const feed = inv.filter((x) => SKINS[x.s].r >= 6).map((x) => ({ s: x.s, f: x.f }));
    return { coins: 25340.5, total: 90000, inv: inv, uid: inv.length + 1, found: {}, feed: feed, top: feed.slice(),
      opened: 137, upgrades: 24, upWins: 9, best: feed[0] || null, daily: { last: 0, streak: 3 },
      settings: { sound: false, lang: Q0.get('lang') === 'en' ? 'en' : 'ru', bg: Q0.get('bg') || 'coast' }, profile: { name: 'Demo', ava: '🐺' } };
  }
  const Q0 = new URLSearchParams(location.search);

  async function boot() {
    Art.initDefs();
    await Platform.init();

    const local = G.readLocal();
    const cloud = await Platform.loadCloud();
    let raw = local;
    if (cloud && (!local || (cloud.savedAt || 0) > (local.savedAt || 0))) raw = cloud;
    G.S = G.sanitize(raw);
    // Локальный просмотр: ?demo — тестовое сохранение (не записывается), ?screen=<экран>, ?case=<id кейса>
    const Q = new URLSearchParams(location.search);
    const DEV = /^(127.0.0.1|localhost)$/.test(location.hostname);
    if (DEV && Q.has('demo')) { G.demo = true; G.S = G.sanitize(demoState()); }

    G.lang = G.S.settings.lang || detectLang();
    Fonts.boot(G.S.settings.font);   // пара шрифтов: класс на <html> до первой отрисовки экранов
    Sfx.setEnabled(G.S.settings.sound);
    Backgrounds.apply(G.S.settings.bg);
    UI.applyI18n();
    UI.setSoundIcon();
    UI.setProfileBadge();
    bindEvents();
    UI.renderFeed();
    Live.start();   // общий живой дроп сайта (на Яндексе выключен)
    UI.showScreen('cases');
    if (DEV && Q.get('screen')) UI.showScreen(Q.get('screen'));
    if (DEV && Q.get('case') && CASE_BY_ID[Q.get('case')]) UI.actions['case'](Q.get('case'));
    const showOffline = Farm.prepareOffline();

    lastTick = Date.now();
    G.S.lastSeen = lastTick;
    setInterval(tick, 250);
    setInterval(() => G.save(false), 3000);

    // Ждём, пока отрисуются ящики и витрина и загрузятся шрифты (не дольше 3.5 с)
    const fonts = document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => null) : null;
    await Promise.race([Promise.all([Art.prewarm([]), fonts]), G.wait(3500)]);

    const loader = document.getElementById('loader');
    loader.classList.add('hide');
    setTimeout(() => loader.remove(), 400);

    Platform.ready();
    Platform.gameplay(true);
    // Первый вход: сначала регистрация, потом окно офлайн-дохода (если он есть)
    if (G.demo) { /* без регистрации и окон */ } else if (!G.S.profile.name) Profile.askRegister(showOffline);
    else if (showOffline) showOffline();
    if (location.hash === '#admin') Admin.open();
  }

  boot();
})();
