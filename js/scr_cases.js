'use strict';

// Экраны «Кейсы» (список) и «Кейс» (открытие с рулеткой)
(function () {
  const t = G.t, $ = UI.$, A = UI.actions, COIN = UI.COIN;
  const COUNTS = [1, 2, 3, 5, 10, 15];
  const MINI_FROM = 6;   // с этого количества вместо лент — сетка маленьких окон
  const MINI_N = 9;      // карточек в ленте мини-окна
  const MINI_RARE_N = 14; // ...и в окне с очень редким выигрышем (длиннее путь — дольше докат)
  let cur = null;        // текущий кейс
  let count = 1;         // сколько открывать за раз
  // G.S.adOwed — id кейса, за который реклама уже досмотрена, но открыть его не вышло (инвентарь заполнился
  // за время рекламы, шла прокрутка, игрок ушёл с кейса). Следующее открытие этого кейса — без рекламы.
  let query = '';
  let secFilter = 'all'; // выбранный раздел
  let lastResult = null; // { items: [inst], isNew: [] }

  Object.assign(I18N.ru, {
    cs_daily: 'Ежедневный бонус', cs_daily_day: 'День {d} из 7',
    cs_daily_next: 'Следующий через', cs_daily_burn: 'Серия сгорит через {t}',
    cs_daily_reset: 'Серия начнётся заново', cs_open_tk: 'Открыть бесплатно ({n})',
    cs_again_tk: 'Ещё бесплатно ({n})', cs_tk: 'Билет ×{n}', cs_disc: 'Скидка уровня −{p}%',
    cs_d_today: 'Сегодня', cs_d_tom: 'Завтра',
  });
  Object.assign(I18N.en, {
    cs_daily: 'Daily bonus', cs_daily_day: 'Day {d} of 7',
    cs_daily_next: 'Next in', cs_daily_burn: 'Streak resets in {t}',
    cs_daily_reset: 'The streak starts over', cs_open_tk: 'Open for free ({n})',
    cs_again_tk: 'Again for free ({n})', cs_tk: 'Ticket ×{n}', cs_disc: 'Level discount −{p}%',
    cs_d_today: 'Today', cs_d_tom: 'Tomorrow',
  });

  // ================= Цена со скидкой уровня =================
  // XP.discount() — доля 0…0.1 (награды уровней, js/xp.js). Оплата и событие 'open' — по этой цене.
  function disc() {
    const d = typeof XP !== 'undefined' && XP.discount ? Number(XP.discount()) : 0;
    return d > 0 ? Math.min(0.5, d) : 0;
  }
  // цена со скидкой — на той же читаемой сетке, что и цены предметов (98.01 → 98, 49 499.01 → 49 490), вниз — в пользу игрока
  function priceOf(c) { const d = disc(); return d > 0 ? readablePrice(c.price * (1 - d)) : c.price; }
  // Короткая запись для тесных мест (плитка, кнопка), три значащие цифры: 296 000 → 296K, 27 000 000 → 27M, 29 700 000 → 29.7M.
  // Полная цена — в блоке «Цена» на странице кейса.
  function cpt(n) {
    if (n < 1e5) return G.fmtP(n);
    const u = n >= 1e9 ? [1e9, 'B'] : n >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
    const v = n / u[0], k = v >= 100 ? 1 : v >= 10 ? 10 : 100;
    return String(Math.round(v * k) / k) + u[1];
  }
  // «новая цена + мелкая старая зачёркнутая» (без скидки — просто цена).
  // short: от какой суммы писать коротко (плитка — от 100 000, кнопка — от 10 млн; не задано — всегда полностью)
  function priceHTML(c, n, short) {
    n = n || 1;
    const p = round2(priceOf(c) * n), o = round2(c.price * n);
    const f = (v) => (short && v >= short ? cpt(v) : G.fmtP(v));
    return '<span class="cs-new">' + COIN + f(p) + '</span>' + (disc() > 0 ? '<s class="cs-old">' + f(o) + '</s>' : '');
  }
  const SHORT_CARD = 1e5, SHORT_BTN = 1e7;

  // ================= Ускорение бесплатного кейса (награда уровней) =================
  // XP.freeSpeed() — множитель ≥ 1 (js/xp.js): интервал бесплатного кейса = FREE_CD / множитель.
  function freeCd() {
    const s = typeof XP !== 'undefined' && XP.freeSpeed ? Number(XP.freeSpeed()) : 1;
    return G.C.FREE_CD / (s > 1 ? s : 1);
  }
  G.freeCd = freeCd;
  // подпись «… каждые 3 минуты» (Фарм) — с настоящим интервалом: ключ читается через геттер при каждом G.t
  function cdText(en) {
    const sec = Math.round(freeCd() / 1000), m = Math.floor(sec / 60), s = sec % 60;
    if (!s) return en ? m + ' minutes' : m + ' минуты';
    return en ? m + ' min ' + s + ' s' : m + ' мин ' + s + ' с';
  }
  // (запись поверх — например, переводом из другого файла — превращает ключ обратно в обычную строку, без ошибки)
  [[I18N.ru, false, '«{name}» каждые '], [I18N.en, true, '"{name}" every ']].forEach(([d, en, pre]) => {
    Object.defineProperty(d, 'free_case_sub', {
      configurable: true, enumerable: true,
      get: () => pre + cdText(en),
      set: (v) => Object.defineProperty(d, 'free_case_sub', { value: v, writable: true, configurable: true, enumerable: true }),
    });
  });

  // Плитка кейса: цена со скидкой и метка билетов поверх общей плитки UI.caseCard
  function card(c) {
    let h = UI.caseCard(c);
    // дорогие (от 100 000) — коротко; со скидкой — новая и старая цена, старая при нехватке места уходит строкой ниже
    if (disc() > 0 || c.price >= SHORT_CARD) {
      h = h.replace(/<div class="cc-price"[^>]*>[\s\S]*?<\/div>/,
        '<div class="cc-price" data-cost="' + priceOf(c) + '" title="' + G.fmtP(priceOf(c)) + '">' + priceHTML(c, 1, SHORT_CARD) + '</div>');
    }
    const tk = G.ticketCount(c.id);
    if (tk > 0) h = h.replace(/<\/button>$/, '<span class="cc-tk">' + t('cs_tk', { n: tk }) + '</span></button>');
    return h;
  }

  // ================= Серия заходов (ежедневный бонус) на главной =================
  // Логика и награда — js/scr_rewards.js (действие A['daily']); здесь только показ, чтобы серия не терялась.
  function dailyState() {
    const d = G.S.daily, now = Date.now(), DAY = G.C.DAY;
    const ready = typeof Rewards !== 'undefined' && Rewards.dailyReady ? Rewards.dailyReady() : now - d.last >= DAY;
    const alive = d.last && now - d.last < 2 * DAY;            // серия ещё не сгорела
    const day = ready ? (alive ? Math.min(7, d.streak + 1) : 1) : Math.max(1, d.streak);
    return { ready: ready, day: day, done: ready ? day - 1 : day, reset: ready && d.streak > 0 && !alive,
      next: d.last + DAY - now, burn: alive ? d.last + 2 * DAY - now : 0 };
  }
  // Сумма бонуса — из js/scr_rewards.js: Rewards.dailyStreak() (день, который даст следующий «Забрать»)
  // и Rewards.dailyReward(день). Пока их нет — сумму не показываем.
  function hasPrize() {
    return typeof Rewards !== 'undefined' && typeof Rewards.dailyReward === 'function' && typeof Rewards.dailyStreak === 'function';
  }
  function dailyPrize(s) {
    if (!hasPrize()) return '';
    const v = (st) => { const n = Number(Rewards.dailyReward(Math.max(1, Math.min(7, st)))); return isFinite(n) && n > 0 ? n : 0; };
    const st = Number(Rewards.dailyStreak()) || 1;   // забрано сегодня — это уже завтрашний день серии
    const row = (k, n, cls) => (n ? '<span class="' + cls + '"><small>' + t(k) + '</small><b>+' + COIN + cpt(n) + '</b></span>' : '');
    return s.ready ? row('cs_d_today', v(st), 'td') + row('cs_d_tom', v(st + 1), 'tm') : row('cs_d_tom', v(st), 'tm');
  }
  let sigDaily = '';
  function renderDaily(force) {
    const el = $('#cs-daily');
    if (!el) return;
    const s = dailyState();
    const sig = [s.ready, s.day, s.done, s.reset, G.lang, hasPrize()].join();
    if (force || sig !== sigDaily) {
      sigDaily = sig;
      let seg = '';
      for (let i = 1; i <= 7; i++) seg += '<i class="' + (i <= s.done ? 'd' : i === s.day && s.ready ? 'c' : '') + (i === 7 ? ' l' : '') + '">' + (i === 7 ? UI.ic('crown') : '') + '</i>';
      const act = A['daily'] ? '<button class="btn primary" data-act="daily">' + t('take_btn') + '</button>'
        : '<button class="btn primary" data-act="nav" data-id="rewards">' + t('take_btn') + '</button>';
      el.className = 'cs-daily glass' + (s.ready ? ' ready' : '');
      el.innerHTML = '<div class="cs-d-t"><b>' + t('cs_daily') + '</b><small>' + t('cs_daily_day', { d: s.day }) + '</small></div>' +
        '<div class="cs-d-seg">' + seg + '</div>' +
        (hasPrize() ? '<div class="cs-d-pz"></div>' : '') +
        '<div class="cs-d-r">' + (s.ready ? '<small class="cs-d-w"></small>' + act
          : '<small>' + t('cs_daily_next') + '</small><b class="cs-d-cd"></b>') + '</div>';
    }
    // награда сегодня / завтра — каждый тик (сумма растёт с доходом); без API от Rewards — не показываем
    const pz = el.querySelector('.cs-d-pz');
    if (pz) UI.setHTML(pz, dailyPrize(s));
    // таймеры — каждый тик, без перерисовки
    const cd = el.querySelector('.cs-d-cd');
    if (cd) UI.setText(cd, G.fmtTime(Math.max(0, s.next)));
    const w = el.querySelector('.cs-d-w');
    if (w) UI.setText(w, s.reset ? t('cs_daily_reset') : s.burn > 0 && s.day > 1 ? t('cs_daily_burn', { t: G.fmtTime(s.burn) }) : '');
  }

  // ================= Разделы и список кейсов =================
  function caseMatches(c, q) {
    if (!q) return true;
    if (G.nm(c.name).toLowerCase().indexOf(q) >= 0) return true;
    return c.items.some((id) => (G.skinName(id) + ' ' + G.finishName(id)).toLowerCase().indexOf(q) >= 0);
  }

  function renderChips() {
    const chip = (id, name, n) => '<button class="chip' + (secFilter === id ? ' on' : '') + '" data-act="sec" data-id="' + id + '">' + name + '<i>' + n + '</i></button>';
    $('#case-chips').innerHTML = chip('all', t('sec_all'), CASES.length) + SECTIONS.map((s) => {
      const n = CASES.filter((c) => c.sec === s.id).length;
      return n ? chip(s.id, G.nm(s.name), n) : '';
    }).join('');
  }

  function renderList() {
    let html = '';
    SECTIONS.forEach((sec) => {
      if (secFilter !== 'all' && sec.id !== secFilter) return;
      // внутри раздела — лесенкой по цене (сортировка устойчивая: равные цены — в порядке CASES)
      const list = CASES.filter((c) => c.sec === sec.id && caseMatches(c, query)).sort((a, b) => a.price - b.price);
      if (!list.length) return;
      html += '<h2 class="sec-h">' + G.nm(sec.name) +
        '<span class="sec-n">' + list.length + '</span></h2>' +
        '<div class="case-grid">' + list.map(card).join('') + '</div>';
    });
    // плашка серии — первой строкой главной, над разделами
    $('#case-sections').innerHTML = '<div class="cs-daily glass" id="cs-daily"></div>' +
      (html || '<div class="empty">' + t('nothing_found') + '</div>');
    renderDaily(true);
  }

  function renderCases() {
    renderChips();
    renderList();
  }

  // Скидка уровня и билеты меняются без перерисовки экрана (новый уровень, колесо) — плитки обновляем по подписи
  let sigList = '';
  function listSig() {
    const tk = G.S.ext && G.S.ext.tickets ? JSON.stringify(G.S.ext.tickets) : '';
    return disc() + '|' + tk;
  }
  function tickCases() {
    const s = listSig();
    if (s !== sigList) { sigList = s; renderList(); UI.refresh(); return; }
    renderDaily(false);
  }

  Screens.reg('cases', { render: () => { sigList = listSig(); renderCases(); }, tick: tickCases });

  A['sec'] = function (id) {
    secFilter = id === 'all' || SECTIONS.some((s) => s.id === id) ? id : 'all';
    renderChips();
    renderList();
    UI.refresh();
  };

  document.addEventListener('input', (e) => {
    if (e.target.id !== 'case-search') return;
    query = e.target.value.trim().toLowerCase();
    renderList();
    UI.refresh();
  });

  // ================= Страница кейса =================
  function freeReady() { return cur && cur.id === FREE_CASE_ID && Date.now() >= G.S.freeAt; }

  function renderCase(id) {
    if (id) cur = CASE_BY_ID[id] || cur;
    if (!cur) return;
    Art.prewarm(cur.items.map(Art.itemKey));
    const sec = SECTIONS.filter((s) => s.id === cur.sec)[0];
    const secName = sec ? G.nm(sec.name) : '';
    const st = UI.caseStats(cur);
    const stage = $('#cp-stage');
    stage.style.setProperty('--cc', UI.glowOf(cur.art[1]));
    stage.classList.remove('rolling');
    $('#cp-crate').innerHTML = Art.crate(cur);
    UI.setText($('#cp-crumb'), t('nav_cases') + ' / ' + secName);
    UI.setText($('#cp-name'), G.nm(cur.name));
    $('#cp-facts').innerHTML =
      '<div class="cp-fact"><small>' + t('cp_price') + '</small><b>' + priceHTML(cur) + '</b></div>' +
      '<div class="cp-fact"><small>' + t('cp_items') + '</small><b>' + cur.items.length + '</b></div>' +
      '<div class="cp-fact"><small>' + t('cp_best') + '</small><b>' + COIN + (st.max >= SHORT_CARD ? cpt(st.max) : UI.short(st.max)) + '</b></div>';
    UI.setText($('#cp-count-n'), String(cur.items.length));
    // кнопка билетов («Открыть бесплатно (n)») — рядом с бесплатным кейсом; в разметке её нет, создаём один раз
    if (!$('#cp-open-tk')) $('#cp-open-free').insertAdjacentHTML('afterend', '<button class="btn good big" id="cp-open-tk" data-act="open-tk" data-lock="1"></button>');
    sigCase = caseSig();
    $('#cp-count').innerHTML = COUNTS.map((n) =>
      '<button class="cnt' + (n === count ? ' on' : '') + '" data-act="count" data-id="' + n + '" data-lock="1"><span class="x">×</span>' + n + '</button>').join('');
    renderIdle();
    renderContents();
    tick();
  }

  // Шансы по редкостям: полоска и подписи (с учётом «Удачи»)
  function renderOdds(w, total) {
    const by = {};
    cur.items.forEach((id, i) => { const r = SKINS[id].r; by[r] = (by[r] || 0) + w[i]; });
    const rs = Object.keys(by).map(Number).sort((a, b) => a - b);
    $('#cp-rbar').innerHTML = rs.map((r) => '<i class="r' + r + '" style="flex-grow:' + (by[r] / total).toFixed(5) + '" title="' +
      t('rar_' + RARITIES[r].id) + ' · ' + G.fmtPct(by[r] / total * 100) + '"></i>').join('');
    $('#cp-rleg').innerHTML = rs.map((r) => '<span class="r' + r + '">' + t('rar_' + RARITIES[r].id).replace(/^[★✦] /, '') +
      ' <b>' + G.fmtPct(by[r] / total * 100) + '</b></span>').join('');
  }

  // ---------- Мини-окна: по одному на кейс, лента едет вертикально (CSS-переход на видеокарте) ----------
  function miniCard(id, f) {
    return '<div class="mc r' + SKINS[id].r + '"><div class="mc-art">' + Art.item(id, f) + '</div></div>';
  }

  function renderMiniIdle() {
    let html = '';
    for (let k = 0; k < count; k++) html += '<div class="mroll"><div class="mstrip">' + miniCard(G.rollSkin(cur), null) + '</div></div>';
    $('#cp-rolls').innerHTML = '<div class="mgrid">' + html + '</div>';
  }

  // fx — эффект очень редкого дропа этого открытия (null, если такого нет): клик по нему
  // мгновенно докручивает все окна. rare — в этом окне очень редкий выигрыш: лента длиннее,
  // ведётся кадрами по кривой RareFx.curve и дольше докатывается последними карточками.
  function spinMini(roll, winner, fast, delay, withSound, fx, rare) {
    return new Promise((resolve) => {
      const strip = roll.querySelector('.mstrip');
      const w = G.caseWeights(cur);
      const n = rare ? MINI_RARE_N : MINI_N;
      let html = '';
      for (let i = 0; i < n - 1; i++) html += miniCard(G.rollSkin(cur, w), null);
      strip.innerHTML = html + miniCard(winner.s, winner.f);
      roll.className = 'mroll';
      strip.style.transition = 'none';
      strip.style.transform = 'translate3d(0,0,0)';
      const h = roll.clientHeight;
      void strip.offsetHeight;
      const end = (n - 1) * h;
      const dur = (fast ? 900 : 2400) + delay;
      const timers = [];
      let over = false;
      const finish = () => {
        if (over) return;
        over = true;
        timers.forEach(clearTimeout);
        strip.style.transition = 'none';
        strip.style.transform = 'translate3d(0,' + (-end) + 'px,0)';
        roll.classList.add('done', 'r' + SKINS[winner.s].r);
        resolve();
      };
      if (fx) fx.onSkip(finish);
      if (rare) {
        const cv = RareFx.curve(end, h, dur, fast, true);
        const t0 = performance.now();
        let hot = false, last = 0;
        const frame = (now) => {
          if (over) return;
          const el = now - t0;
          if (el >= cv.dur) { finish(); return; }
          const y = cv.at(el);
          strip.style.transform = 'translate3d(0,' + (-y) + 'px,0)';
          if (!hot && el >= cv.crawl) { hot = true; fx.crawl(roll, null, cv.dur - el, SKINS[winner.s].r); }
          const idx = Math.floor(y / h + 0.5);
          if (idx !== last) { last = idx; if (withSound || hot) Sfx.tick(); }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        return;
      }
      strip.style.transition = 'transform ' + dur + 'ms cubic-bezier(.15,.8,.25,1)';
      strip.style.transform = 'translate3d(0,' + (-end) + 'px,0)';
      if (withSound) {
        // щелчки в моменты, когда карточки проходят окно (замедляются к концу)
        for (let k = 1; k < n; k++) timers.push(setTimeout(Sfx.tick, dur * (1 - Math.pow(1 - k / (n - 1), 1 / 3))));
      }
      timers.push(setTimeout(finish, dur + 40));
    });
  }

  function renderIdle() {
    $('#cp-stage').classList.toggle('compact', count >= 3);
    if (count >= MINI_FROM) { renderMiniIdle(); return; }
    let html = '';
    for (let k = 0; k < count; k++) {
      let cards = '';
      for (let i = 0; i < 14; i++) cards += UI.itemCard(G.rollSkin(cur));
      html += '<div class="roll"><div class="strip">' + cards + '</div><div class="marker"></div></div>';
    }
    $('#cp-rolls').innerHTML = html;
    // начальное положение — по центру
    Array.prototype.forEach.call(document.querySelectorAll('#cp-rolls .strip'), (s) => {
      s.style.transform = 'translate3d(' + (-(s.scrollWidth - s.parentNode.clientWidth) / 2) + 'px,0,0)';
    });
  }

  function renderContents() {
    const w = G.caseWeights(cur);
    let total = 0;
    w.forEach((x) => { total += x; });
    const rows = cur.items.map((id, i) => ({ id: id, ch: w[i] / total * 100 }))
      .sort((a, b) => SKINS[b.id].value - SKINS[a.id].value);
    $('#cp-contents').innerHTML = rows.map((r) => UI.itemCard(r.id, { chance: r.ch })).join('');
    renderOdds(w, total);
  }

  // скидка уровня поменялась (новый уровень) — перерисовать цену в фактах кейса
  let sigCase = '';
  const caseSig = () => (cur ? cur.id : '') + '|' + disc() + '|' + G.lang;

  function tick() {
    if (!cur) return;
    if (caseSig() !== sigCase) { renderCase(); return; }
    const ob = $('#cp-open');
    const free = freeReady();
    $('#cp-open-free').style.display = free ? '' : 'none';
    const tk = G.ticketCount(cur.id);
    const tb = $('#cp-open-tk');
    if (tb) {
      tb.style.display = tk > 0 && !free ? '' : 'none';
      UI.setHTML(tb, t('cs_open_tk', { n: tk }));
    }
    const cost = round2(priceOf(cur) * count);
    ob.setAttribute('data-cost', cost);
    UI.setHTML(ob, t('open_for', { v: priceHTML(cur, count, SHORT_BTN) }));
    const ab = $('#cp-open-ad');
    const owed = G.S.adOwed === cur.id;
    const left = owed ? 0 : G.S.adCaseAt + G.C.AD_CASE_CD - Date.now();
    // дорогие кейсы — только за монеты; есть билет на этот кейс — реклама не нужна
    ab.style.display = (owed || cur.price <= G.C.AD_CASE_MAX) && !(tk > 0 && !owed) ? '' : 'none';
    UI.setHTML(ab, left > 0 ? t('wait', { t: G.fmtTime(left) }) : t(owed ? 'open_ad_owed' : 'open_free_ad'));
    ab.disabled = left > 0 || UI.isSpinning() || G.adBusy;
    $('#cp-fast').classList.toggle('on', G.S.settings.fast);
  }

  Screens.reg('case', { render: renderCase, tick: tick });

  // ================= Открытие =================
  // fx, rare — как у spinMini: у очень редкого выигрыша лента короче (выигрыш ближе к началу),
  // зато дольше докатывается последними карточками; клик по эффекту докручивает ленту сразу
  function spinStrip(roll, winner, fast, delay, withSound, fx, rare) {
    return new Promise((resolve) => {
      const strip = roll.querySelector('.strip');
      const N = fast ? 30 : rare ? 45 : 60;
      const WIN = N - 6;
      const weights = G.caseWeights(cur);
      let html = '';
      for (let i = 0; i < N; i++) {
        html += i === WIN ? UI.itemCard(winner) : UI.itemCard(G.rollSkin(cur, weights));
      }
      strip.innerHTML = html;
      roll.classList.remove('done');
      strip.style.transform = 'translate3d(0,0,0)';
      const cards = strip.children;
      const cardW = cards[0].offsetWidth;
      const step = cards[1].offsetLeft - cards[0].offsetLeft;
      const first = cards[0].offsetLeft;
      const W = roll.clientWidth;
      // очень редкий выигрыш: указатель встаёт в первой трети карточки — она «едва дотягивает»
      const jitter = rare ? cardW * (0.14 + Math.random() * 0.22 - 0.5) : (Math.random() - 0.5) * cardW * 0.8;
      const target = cards[WIN].offsetLeft + cardW / 2 - W / 2 + jitter;
      const base = (fast ? 1200 : 5800) + delay;
      const cv = rare ? RareFx.curve(target, step, base, fast, false) : null;
      const dur = cv ? cv.dur : base;
      const t0 = performance.now();
      let lastIdx = -1, hot = false;
      function frame(now) {
        const el = now - t0;
        const p = fx && fx.skipped ? 1 : Math.min(1, el / dur);
        const x = p >= 1 ? target : cv ? cv.at(el) : target * (1 - Math.pow(1 - p, 4));
        strip.style.transform = 'translate3d(' + (-x) + 'px,0,0)';
        // начало доката: подсветка указателя и выигрыша, затемнение вокруг рулетки
        if (cv && !hot && p < 1 && el >= cv.crawl) { hot = true; fx.crawl(roll, cards[WIN], dur - el, SKINS[winner.s].r); }
        if (withSound || hot) {
          const idx = Math.floor((x + W / 2 - first) / step);
          if (idx !== lastIdx) { lastIdx = idx; Sfx.tick(); }
        }
        if (p < 1) requestAnimationFrame(frame);
        else {
          // остановка: выигрыш в рамке своей редкости, остальные карточки гаснут (один слой поверх ленты)
          cards[WIN].classList.add('win');
          roll.classList.add('done');
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  async function open(mode) {
    // mode: 'paid' | 'free' (бесплатный кейс по таймеру) | 'ad' (за рекламу) | 'ticket' (билет, G.useTicket)
    if (!cur || UI.isSpinning()) return;
    if (mode === 'ticket' && G.ticketCount(cur.id) <= 0) return;
    const n = mode === 'paid' ? count : 1;
    if (G.invFull(n)) { UI.toast(t('inv_full', { n: INVENTORY_MAX }), 'bad'); Sfx.error(); return; }
    const price = priceOf(cur);   // фактическая цена одного кейса (со скидкой уровня)
    if (mode === 'paid') {
      const cost = round2(price * n);
      if (!G.canPay(cost)) {
        UI.toast(t('not_enough'), 'bad'); Sfx.error();
        const b = $('#cp-open'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
        return;
      }
      G.spend(cost);
    } else if (mode === 'free') {
      G.S.freeAt = Date.now() + freeCd();   // с ускорением уровня (XP.freeSpeed)
    } else if (mode === 'ad') {
      G.S.adOwed = '';   // все проверки пройдены — оплаченное рекламой открытие израсходовано
    } else if (mode === 'ticket') {
      if (!G.useTicket(cur.id)) return;
    }

    if (n !== count) { count = n; renderCase(); }
    UI.setSpinning(true);
    // chance — шанс выпавшего предмета по видимым весам на момент открытия (с «Удачей»),
    // rare — он меньше 1 %: для такого дропа своя анимация
    const res = { items: [], isNew: [], chance: [], rare: [] };
    const weights = G.caseWeights(cur);
    for (let k = 0; k < n; k++) {
      const s = G.rollDrop(cur, weights);
      const r = G.addInst(s, G.rollFloat(), 'case', cur.id);
      const ch = RareFx.chance(cur, weights, s);
      res.items.push(r.inst);
      res.isNew.push(r.isNew);
      res.chance.push(ch);
      res.rare.push(RareFx.hit(s));   // редкость ≥ 5 или ★ — замедление, тряска, золотая рамка
    }
    G.S.opened += n;
    G.track('o', n);
    // событие для опыта и достижений: price — фактическая цена одного кейса со скидкой уровня
    // (0 — бесплатно по таймеру, за рекламу или по билету)
    G.emit('open', { c: cur, n: n, price: mode === 'paid' ? price : 0, free: mode !== 'paid' });
    G.track('r', Math.max.apply(null, res.items.map((x) => SKINS[x.s].r)));
    G.opensSinceAd += 1;
    G.save(false);

    const fast = G.S.settings.fast;
    const stage = $('#cp-stage');
    const crate = $('#cp-crate');
    if (!stage.classList.contains('rolling')) {
      crate.classList.remove('shaking'); void crate.offsetWidth; crate.classList.add('shaking');
    }
    Sfx.open();
    await G.wait(fast ? 150 : 400);
    // Рулетка встаёт на место ящика
    stage.classList.add('rolling');

    const mini = n >= MINI_FROM;
    const rolls = document.querySelectorAll(mini ? '#cp-rolls .mroll' : '#cp-rolls .roll');
    // Редкий дроп (редкость ≥ 5 или ★): лента заметно замедляется перед остановкой, лёгкая тряска,
    // сдержанный звук, карточка выезжает в золотой рамке (js/fx_rare.js) — для самого маловероятного
    let top = -1;
    res.rare.forEach((v, k) => { if (v && (top < 0 || res.chance[k] < res.chance[top])) top = k; });
    const fx = top >= 0 ? RareFx.session({ fast: fast, mini: mini, area: $('#cp-rolls'), lanes: rolls, r: SKINS[res.items[top].s].r }) : null;
    await Promise.all(res.items.map((inst, k) => (mini
      ? spinMini(rolls[k], inst, fast, k * 70, k === 0, fx, res.rare[k])
      : spinStrip(rolls[k], inst, fast, k * 180, k === 0, fx, res.rare[k]))));
    const bestR = Math.max.apply(null, res.items.map((x) => SKINS[x.s].r));
    if (fx) {
      const el = mini ? rolls[top] : rolls[top].querySelector('.it.win');
      try { await fx.reveal({ el: el, inst: res.items[top], chance: res.chance[top] }); } catch (e) { fx.close(); }
    } else {
      // обычный дроп: аккорд по редкости и короткая пауза на рамке выигрыша — без частиц
      Sfx.win(Math.min(5, bestR));
      await G.wait(bestR >= 4 ? 450 : 300);
    }

    UI.setSpinning(false);
    UI.renderFeed();
    if (res.isNew.some(Boolean)) renderContents();
    lastResult = res;
    showResult(res);
  }

  function showResult(res) {
    const live = res.items.filter((x) => G.findInst(x.u));
    let sum = 0;
    live.forEach((x) => { sum += G.sellPrice(x); });
    const single = res.items.length === 1 ? res.items[0] : null;
    const anyNew = res.isNew.some(Boolean);
    const again = round2(priceOf(cur) * count);
    const tk = G.ticketCount(cur.id);
    let html = '<h3 class="m-title">' + t('drop_title') + '</h3>';
    const rare = (i) => !!(res.rare && res.rare[i]);
    if (single) {
      const sk = SKINS[single.s];
      // редкий дроп: витрина выезжает снизу в тонкой золотой рамке (без лучей и искр)
      html += '<div class="drop-one r' + sk.r + (rare(0) ? ' rx-rare' : '') + '">' + (res.isNew[0] ? '<span class="new-badge">' + t('new_item') + '</span>' : '') +
        (rare(0) ? RareFx.showcase() : '') +
        '<div class="rays"></div><div class="drop-art">' + Art.item(single.s, single.f) + '</div></div>' +
        '<div class="drop-rar r' + sk.r + '">' + t('rar_' + RARITIES[sk.r].id) + '</div>' +
        '<div class="drop-name">' + (G.isStar(single.s) ? '★ ' : '') + G.skinName(single.s) + ' <span>| ' + G.finishName(single.s) + '</span></div>' +
        '<div class="drop-wear">' + UI.wearShort(single.f) + ' · ' + single.f.toFixed(4) + '</div>' +
        (rare(0) ? '<div class="r' + sk.r + '">' + RareFx.oddsLine(res.chance[0]) + '</div>' : '') +
        '<div class="drop-price">' + COIN + G.fmt(G.sellPrice(single)) + '</div>';
    } else {
      // в сетке редкие предметы — в золотой рамке и с меткой шанса
      html += '<div class="drop-grid">' + res.items.map((x, i) => {
        const card = UI.itemCard(x, { badge: res.isNew[i] ? t('new_item') : '', cls: rare(i) ? 'rx-rare' : '' });
        return rare(i) ? card.replace(/<\/div>$/, RareFx.tag(res.chance[i]) + '</div>') : card;
      }).join('') + '</div>';
      if (live.length) html += '<div class="drop-sum">' + t('drop_sum') + '<b>' + COIN + G.fmt(sum) + '</b></div>';
    }
    if (anyNew) html += '<p class="hint">' + t('new_skin_bonus') + '</p>';
    html += '<div class="m-btns">';
    if (live.length) {
      html += '<div class="row"><button class="btn" data-act="res-sell">' + t('sell_for', { v: COIN + G.fmt(sum) }) + '</button>' +
        '<button class="btn" data-act="close">' + t('take') + '</button></div>';
      const adSellReady = Date.now() - G.S.adSellAt >= G.C.AD_SELL_CD;
      if (single && SKINS[single.s].r >= 2 && adSellReady && sum <= G.C.AD_SELL_MAX) html += '<button class="btn ad" data-act="res-sell2">' + t('sell_x2', { v: COIN + G.fmt(sum * 2) }) + '</button>';
    }
    // остались билеты на этот кейс — «Ещё бесплатно (n)», иначе «Ещё раз» за монеты (по цене со скидкой)
    html += (tk > 0 ? '<button class="btn primary big" data-act="res-again-tk">' + t('cs_again_tk', { n: tk }) + '</button>'
      : '<button class="btn primary big" data-act="res-again" data-cost="' + again + '">' + t('again') + ' · ' + priceHTML(cur, count, SHORT_BTN) + '</button>') + '</div>';
    UI.modal(html, { wide: !single, onClose: () => { endRoll(); G.maybeInterstitial(); } });
    UI.refresh();
  }

  // Окно результата закрыто — снова показываем ящик, ленты готовим заново
  function endRoll() {
    const stage = $('#cp-stage');
    if (!stage || !stage.classList.contains('rolling') || UI.isSpinning()) return;
    stage.classList.remove('rolling');
    if (cur) renderIdle();
  }

  function sellResult(mult) {
    if (!lastResult) return 0;
    const uids = lastResult.items.filter((x) => G.findInst(x.u)).map((x) => x.u);
    const gain = G.sellInsts(uids, mult);
    if (gain > 0) { Sfx.coin(); UI.toast(t('sold', { v: G.fmt(gain) }), 'good'); }
    G.save(false);
    return gain;
  }

  // ================= Действия =================
  A['case'] = function (id) { cur = CASE_BY_ID[id]; UI.showScreen('case', id); };
  A['count'] = function (id) { count = Number(id) || 1; renderCase(); UI.refresh(); };
  // Турбо-режим общий для кейсов и апгрейда; кнопку обновляет tick() текущего экрана
  A['fast'] = function () { G.S.settings.fast = !G.S.settings.fast; G.save(false); UI.refresh(); };
  A['open'] = function () { open('paid'); };
  A['open-free'] = function () { if (freeReady()) open('free'); };
  A['open-tk'] = function () { if (cur && G.ticketCount(cur.id) > 0) open('ticket'); };
  A['open-ad'] = function () {
    if (!cur) return;
    const owed = G.S.adOwed === cur.id;
    if (!owed && (Date.now() - G.S.adCaseAt < G.C.AD_CASE_CD || cur.price > G.C.AD_CASE_MAX)) return;
    // место в инвентаре проверяем ДО рекламы — иначе игрок посмотрит её зря
    if (G.invFull(1)) { UI.toast(t('inv_full', { n: INVENTORY_MAX }), 'bad'); Sfx.error(); return; }
    if (owed) { open('ad'); return; }   // реклама за этот кейс уже просмотрена
    const c = cur;
    // Награда сначала записывается в долг: если open() не пройдёт проверки (инвентарь заполнился
    // за время рекламы, идёт прокрутка, другой кейс), кейс не сгорит — его можно открыть без рекламы.
    G.rewarded(() => {
      G.S.adCaseAt = Date.now();
      G.S.adOwed = c.id;   // долг хранится в сохранении: перезагрузка после рекламы кейс не сжигает
      G.save(true);
      if (cur === c) open('ad');   // иначе кнопка этого кейса покажет «Открыть» (tick)
    });
  };
  A['res-sell'] = function () { sellResult(1); UI.closeModal(); UI.refresh(); };
  A['res-sell2'] = function () {
    if (Date.now() - G.S.adSellAt < G.C.AD_SELL_CD) return;
    const live = lastResult ? lastResult.items.filter((x) => G.findInst(x.u)) : [];
    let sum = 0;
    live.forEach((x) => { sum += G.sellPrice(x); });
    if (sum > G.C.AD_SELL_MAX) return;
    G.rewarded(() => { G.S.adSellAt = Date.now(); sellResult(2); UI.closeModal(); });
  };
  A['res-again'] = function () {
    UI.closeModal(true);
    endRoll();
    G.maybeInterstitial().then(() => open('paid'));
  };
  A['res-again-tk'] = function () {
    UI.closeModal(true);
    endRoll();
    G.maybeInterstitial().then(() => open('ticket'));
  };
  // Бесплатный кейс с экрана «Фарм»
  A['free-case'] = function () {
    cur = CASE_BY_ID[FREE_CASE_ID];
    count = 1;
    UI.showScreen('case', FREE_CASE_ID);
    if (Date.now() >= G.S.freeAt) open('free');
  };
})();
