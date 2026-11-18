'use strict';

// Обёртка над Yandex Games SDK. Вне Яндекса (локально) работает заглушка:
// сохранения только в localStorage, реклама имитируется.
const Platform = (function () {
  let ysdk = null;
  let player = null;
  let gameplayOn = false;
  const handlers = { pause: [], resume: [] };

  function emit(name) {
    handlers[name].forEach(function (f) { try { f(); } catch (e) { /* ignore */ } });
  }

  function loadScript(src, ms) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      const timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
      s.src = src;
      s.async = true;
      s.onload = function () { clearTimeout(timer); resolve(); };
      s.onerror = function () { clearTimeout(timer); reject(new Error('load error')); };
      document.head.appendChild(s);
    });
  }

  async function init() {
    // локальный запуск и тестовый сайт для друзей работают без Яндекса (window.CASELAB_NO_SDK)
    if (location.protocol === 'file:' || window.CASELAB_NO_SDK) return false;
    try {
      await loadScript('/sdk.js', 6000);
      if (!window.YaGames) return false;
      ysdk = await window.YaGames.init();
    } catch (e) {
      ysdk = null;
      return false;
    }
    try { player = await ysdk.getPlayer({ scopes: false }); } catch (e) { player = null; }
    try {
      ysdk.on('game_api_pause', function () { emit('pause'); });
      ysdk.on('game_api_resume', function () { emit('resume'); });
    } catch (e) { /* старые версии SDK */ }
    return true;
  }

  // Имя и аватар игрока (только для авторизованных на Яндексе)
  function playerInfo() {
    const info = { name: '', photo: '' };
    if (!player) return info;
    try {
      if (player.getMode && player.getMode() === 'lite') return info;
      info.name = player.getName() || '';
      info.photo = player.getPhoto('medium') || '';
    } catch (e) { /* ignore */ }
    return info;
  }

  function lang() {
    try { return ysdk.environment.i18n.lang; } catch (e) { return null; }
  }

  function ready() {
    try { ysdk.features.LoadingAPI.ready(); } catch (e) { /* ignore */ }
  }

  function gameplay(on) {
    if (gameplayOn === on) return;
    gameplayOn = on;
    try {
      if (on) ysdk.features.GameplayAPI.start();
      else ysdk.features.GameplayAPI.stop();
    } catch (e) { /* ignore */ }
  }

  async function loadCloud() {
    if (!player) return null;
    try {
      const data = await player.getData(['s']);
      return data && data.s ? JSON.parse(data.s) : null;
    } catch (e) {
      return null;
    }
  }

  function saveCloud(str, flush) {
    if (!player) return;
    try { player.setData({ s: str }, !!flush).catch(function () {}); } catch (e) { /* ignore */ }
  }

  function mockAd(label, ms) {
    return new Promise(function (resolve) {
      const el = document.createElement('div');
      el.className = 'mock-ad';
      el.textContent = label;
      document.body.appendChild(el);
      setTimeout(function () { el.remove(); resolve(); }, ms);
    });
  }

  // Межстраничная реклама. Промис резолвится, когда реклама закрыта или не показана.
  function showFullscreen() {
    if (!ysdk) return Promise.resolve();
    return new Promise(function (resolve) {
      let done = false;
      const finish = function () {
        if (done) return;
        done = true;
        gameplay(true);
        emit('resume');
        resolve();
      };
      try {
        ysdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: function () { gameplay(false); emit('pause'); },
            onClose: finish,
            onError: finish,
            onOffline: finish,
          },
        });
      } catch (e) { finish(); }
    });
  }

  // Реклама за вознаграждение. Возвращает 'rewarded' | 'closed' | 'error'.
  function showRewarded(testLabel) {
    if (!ysdk) {
      return mockAd(testLabel || 'Ad…', 1200).then(function () { return 'rewarded'; });
    }
    return new Promise(function (resolve) {
      let rewarded = false;
      let done = false;
      const finish = function (status) {
        if (done) return;
        done = true;
        gameplay(true);
        emit('resume');
        resolve(status);
      };
      try {
        ysdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: function () { gameplay(false); emit('pause'); },
            onRewarded: function () { rewarded = true; },
            onClose: function () { finish(rewarded ? 'rewarded' : 'closed'); },
            onError: function () { finish(rewarded ? 'rewarded' : 'error'); },
          },
        });
      } catch (e) { finish('error'); }
    });
  }

  return {
    init: init,
    lang: lang,
    playerInfo: playerInfo,
    ready: ready,
    gameplay: gameplay,
    loadCloud: loadCloud,
    saveCloud: saveCloud,
    hasCloud: function () { return !!player; },
    showFullscreen: showFullscreen,
    showRewarded: showRewarded,
    on: function (name, fn) { handlers[name].push(fn); },
  };
})();
