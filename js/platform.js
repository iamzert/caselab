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

  // ---------- Лидерборды Яндекса (раунд 7, агент social — js/leaders.js) ----------
  // Новый API (ysdk.leaderboards.*) или старый (ysdk.getLeaderboards()); любой сбой — null / false, игра не падает.
  let lbOld = null;
  function lbApi() {
    if (!ysdk) return Promise.resolve(null);
    try {
      if (ysdk.leaderboards && typeof ysdk.leaderboards.getEntries === 'function') return Promise.resolve({ v2: ysdk.leaderboards });
      if (typeof ysdk.getLeaderboards === 'function') {
        if (!lbOld) lbOld = ysdk.getLeaderboards().catch(function () { lbOld = null; return null; });
        return lbOld.then(function (lb) { return lb ? { v1: lb } : null; });
      }
    } catch (e) { /* нет лидербордов */ }
    return Promise.resolve(null);
  }
  function lbEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const p = e.player || {};
    let photo = '';
    try { photo = typeof p.getAvatarSrc === 'function' ? p.getAvatarSrc('small') || '' : ''; } catch (err) { photo = ''; }
    return {
      rank: Number(e.rank) || 0, score: Number(e.score) || 0, extra: typeof e.extraData === 'string' ? e.extraData : '',
      name: typeof p.publicName === 'string' ? p.publicName : '', photo: photo, uid: typeof p.uniqueID === 'string' ? p.uniqueID : '',
    };
  }
  // Авторизован ли игрок на Яндексе (записывать счёт можно только так)
  function authorized() {
    try { return !!player && !(player.getMode && player.getMode() === 'lite'); } catch (e) { return false; }
  }
  // Записи таблицы: { entries: [...], user: своя запись | null } или null при ошибке
  function lbEntries(name, o) {
    o = o || {};
    // лимиты SDK: quantityTop 1–20, quantityAround 1–10 (больше — запрос отклоняется или режется)
    const lim = (v, d, max) => Math.max(1, Math.min(max, Math.floor(Number(v) || d)));
    const opts = { quantityTop: lim(o.top, 20, 20), includeUser: authorized(), quantityAround: lim(o.around, 3, 10) };
    return lbApi().then(function (a) {
      if (!a) return null;
      const p = a.v2 ? a.v2.getEntries(name, opts) : a.v1.getLeaderboardEntries(name, opts);
      return p.then(function (r) {
        const list = r && Array.isArray(r.entries) ? r.entries.map(lbEntry).filter(Boolean) : [];
        const ur = r && r.userRank > 0 ? r.userRank : 0;
        // своей строки может не оказаться в выдаче — тогда хотя бы ранг (место показывается по нему)
        // top — сколько записей сверху запрошено (меньше пришло — в выдаче вся таблица)
        return { entries: list, top: opts.quantityTop, user: ur ? list.filter(function (e) { return e.rank === ur; })[0] || { rank: ur } : null };
      });
    }).catch(function () { return null; });
  }
  // Своя запись (null — нет записи или ошибка)
  function lbPlayer(name) {
    if (!authorized()) return Promise.resolve(null);
    return lbApi().then(function (a) {
      if (!a) return null;
      return (a.v2 ? a.v2.getPlayerEntry(name) : a.v1.getLeaderboardPlayerEntry(name)).then(lbEntry);
    }).catch(function () { return null; });
  }
  // Записать счёт (целое ≥ 0); true — записано
  function lbSetScore(name, score, extra) {
    if (!authorized()) return Promise.resolve(false);
    score = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(score) || 0)));
    return lbApi().then(function (a) {
      if (!a) return false;
      const p = a.v2 ? a.v2.setScore(name, score, extra || undefined) : a.v1.setLeaderboardScore(name, score, extra || undefined);
      return Promise.resolve(p).then(function () { return true; });
    }).catch(function () { return false; });
  }

  return {
    hasLeaders: function () { return !!ysdk && (!!ysdk.leaderboards || typeof ysdk.getLeaderboards === 'function'); },
    authorized: authorized,
    lbEntries: lbEntries,
    lbPlayer: lbPlayer,
    lbSetScore: lbSetScore,
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
