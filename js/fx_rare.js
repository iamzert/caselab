'use strict';

// =====================================================================
// Редкий дроп из кейса — предмет редкости «Мифическое» и выше или ★ (нож, перчатки).
// Обратная связь сдержанная, как на дорогих кейс-сайтах:
//  - лента заметно замедляется перед остановкой — последние карточки «докатываются» (curve);
//  - указатель и будущий выигрыш мягко подсвечены цветом редкости, вокруг рулетки темнеет;
//  - на остановке — лёгкая тряска рулетки (2–3 px, ~250 мс) и сдержанный звук (Sfx.rare);
//  - карточка выигрыша выезжает из ленты в тонкой золотой рамке, под ней — плашка с шансом.
// Без конфетти, салютов, лучей и вспышек на весь экран.
// Клик (пробел, Enter, Esc) сразу ведёт к окну результата.
// Анимируются только transform и opacity — ровные 60 кадров/с.
// =====================================================================
const RareFx = (function () {
  const LIMIT = 0.01;          // «очень редкий» (подпись на плашке): шанс меньше 1 %
  const R_MIN = 5;             // с этой редкости (Мифическое) — эффект редкого дропа
  const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const px = (v) => v.toFixed(1) + 'px';
  const anim = (el, kf, t) => (el && el.animate ? el.animate(kf, t) : null);
  const OUT = 'cubic-bezier(.16,.84,.3,1)';
  let active = null;           // эффект текущего открытия

  Object.assign(I18N.ru, { fx_rare_drop: 'Редкий дроп' });
  Object.assign(I18N.en, { fx_rare_drop: 'Rare drop' });

  // Редкий ли предмет: редкость ≥ 5 или ★
  const hit = (id) => !!SKINS[id] && (SKINS[id].r >= R_MIN || G.isStar(id));

  // ---------- Шанс ----------
  // Доля веса предмета среди всех весов кейса (веса — G.caseWeights на момент открытия)
  function chance(c, w, id) {
    let s = 0, tot = 0;
    for (let i = 0; i < w.length; i++) { tot += w[i]; if (c.items[i] === id) s += w[i]; }
    return tot > 0 ? s / tot : 1;
  }

  // 0.0042 → «0.42%», 0.00091 → «0.091%», 0.0000253 → «0.0025%» (две значащие цифры)
  function pct(p) {
    const v = p * 100;
    if (v >= 0.1) return v.toFixed(2) + '%';
    if (!(v > 0)) return '0%';
    return v.toFixed(Math.min(8, 1 - Math.floor(Math.log10(v)))) + '%';
  }
  // «1 из 2 380»
  const odds = (p) => G.t('rare_odds', { n: G.fmtInt(p > 0 ? Math.round(1 / p) : 0) });

  // ---------- Ход ленты ----------
  // Путь (px) от времени (мс): x(t) = A·q4(t/TA) + DB·q2(t/T).
  // Первое слагаемое — обычный быстрый прогон с торможением, второе — долгий «докат» с
  // постоянным замедлением, как трение. Скорость только падает, ускорение непрерывно (без
  // рывков); старт — с той же скоростью, что у обычной ленты, а последние 3–4 карточки
  // проходят заметно дольше. X — путь до выигрыша, step — шаг карточек,
  // base — длительность обычной прокрутки, mini — мини-окна (лента сверху вниз).
  function curve(X, step, base, fast, mini) {
    const T = base + (mini ? (fast ? 600 : 1100) : (fast ? 1000 : 1800));
    const u = fast ? 0.5 : 0.55;                                        // доля времени на докат
    const R = step * (mini ? (fast ? 1.5 : 2.2) : (fast ? 1.8 : 3));    // путь, оставшийся к началу доката
    const DB = Math.min(X * 0.62, R / (u * u));
    const A = X - DB, TA = T * (1 - u);
    function at(t) {
      if (t >= T) return X;
      if (t <= 0) return 0;
      const p = 1 - Math.min(1, t / TA), q = 1 - t / T;
      return A * (1 - p * p * p * p) + DB * (1 - q * q);
    }
    return { dur: T, crawl: TA, at: at };
  }

  // ---------- Эффект одного открытия ----------
  // o: { fast, mini, area — контейнер рулетки (#cp-rolls), lanes — ленты или мини-окна, r — редкость }
  function session(o) {
    if (active) close(active, true);
    const S = {
      fast: !!o.fast, mini: !!o.mini, area: o.area, r: o.r | 0,
      lanes: Array.prototype.slice.call(o.lanes || []),
      skipped: false, closed: false, root: null, fxl: null, dim: null,
      hooks: [], timers: [], hidden: [], stopRise: null,
    };
    S.onSkip = (f) => { if (S.skipped) f(); else S.hooks.push(f); };
    S.skip = () => skip(S);
    S.crawl = (lane, card, ms, r) => crawl(S, lane, card, ms, r);
    S.reveal = (x) => reveal(S, x);
    S.close = () => close(S, false);
    active = S;
    return S;
  }

  function skip(S) {
    if (S.skipped || S.closed) return;
    S.skipped = true;
    if (S.stopRise) { S.stopRise(); S.stopRise = null; }
    S.hooks.splice(0).forEach((f) => { try { f(); } catch (e) { /* пропуск не должен ломать открытие */ } });
  }

  // Слой поверх приложения: мягкое затемнение с «окном» над рулеткой, карточка, подсказка «пропустить».
  // Слой ловит клики — это и есть пропуск; кнопки под ним во время прокрутки всё равно заблокированы.
  function ensureRoot(S) {
    if (S.root) return S.root;
    const root = document.createElement('div');
    root.id = 'rx-root';
    root.className = 'rx-calm r' + S.r;
    root.innerHTML = '<div class="rx-dim"></div><div class="rx-fx"></div><div class="rx-skip">' + G.t('rare_skip') + '</div>';
    document.body.appendChild(root);
    S.root = root;
    S.dim = root.firstChild;
    S.fxl = root.children[1];
    S.onKey = (e) => {
      if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      skip(S);
    };
    S.onPlace = () => place(S);
    root.addEventListener('click', () => skip(S));
    document.addEventListener('keydown', S.onKey, true);
    window.addEventListener('resize', S.onPlace);
    place(S);
    void root.offsetWidth;   // кадр без затемнения — дальше оно плавно проявляется
    root.classList.add('on');
    return root;
  }

  // «Окно» в затемнении — ровно над рулеткой (лентами или сеткой мини-окон)
  function place(S) {
    if (!S.dim || !S.area || !S.area.isConnected) return;
    const b = S.area.getBoundingClientRect();
    S.dim.style.width = px(b.width);
    S.dim.style.height = px(b.height);
    S.dim.style.transform = 'translate3d(' + px(b.left) + ',' + px(b.top) + ',0)';
  }

  function hasChild(el, cls) {
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.classList.contains(cls)) return true;
    return false;
  }

  // Начало доката: указатель и будущий выигрыш подсвечены, вокруг темнеет, остальные ленты гаснут
  function crawl(S, lane, card, ms, r) {
    if (S.skipped || S.closed || !lane || !lane.isConnected) return;
    const first = !S.root;
    ensureRoot(S);
    lane.classList.add('rx-hot', 'r' + r);
    const mk = lane.querySelector('.marker');
    if (mk && !hasChild(mk, 'rx-mk')) mk.insertAdjacentHTML('beforeend', '<i class="rx-mk"></i>');
    const host = card || lane;
    if (!hasChild(host, 'rx-glow')) host.insertAdjacentHTML('beforeend', '<i class="rx-glow"></i>');
    S.lanes.forEach((l) => l.classList.toggle('rx-dimmed', !l.classList.contains('rx-hot')));
    if (first && typeof Sfx.rareRise === 'function') S.stopRise = Sfx.rareRise(ms / 1000);
  }

  // Остановка на редком предмете. Промис выполняется, когда можно открывать окно
  // результата: слой эффекта к этому моменту начинает гаснуть, окно проявляется поверх.
  function reveal(S, o) {
    return new Promise((resolve) => {
      let over = false;
      const finish = () => {
        if (over) return;
        over = true;
        resolve();
        close(S, false);
      };
      const r = SKINS[o.inst.s].r;
      Sfx.rare(r);
      if (S.skipped || S.closed || !o.el || !o.el.isConnected) { finish(); return; }
      S.onSkip(finish);
      try { stage(S, o, r); } catch (e) { finish(); return; }
      S.timers.push(setTimeout(finish, S.fast ? 850 : 1250));
    });
  }

  // Слой-якорь: точка (x, y) экрана, внутри — элементы, центрированные на этой точке
  function layer(parent, x, y, cls, html) {
    const d = document.createElement('div');
    d.className = 'rx-at ' + cls;
    d.style.transform = 'translate3d(' + px(x) + ',' + px(y) + ',0)';
    d.innerHTML = html;
    parent.appendChild(d);
    return d;
  }

  // Сцена остановки: лёгкая тряска рулетки, карточка-двойник выезжает из ленты (мини-окна)
  // в золотой рамке и чуть крупнее, под ней — плашка с шансом
  function stage(S, o, r) {
    const root = ensureRoot(S);
    root.classList.remove('r' + S.r);
    root.classList.add('r' + r);
    S.r = r;
    const k = S.fast ? 0.75 : 1;
    const vw = window.innerWidth, vh = window.innerHeight;
    const src = o.el.getBoundingClientRect();
    let cw, ch, s0, cx, cy, sc;
    if (S.mini) {
      // из мини-окна выезжает полноценная плитка предмета и встаёт по центру сетки
      const a = S.area.getBoundingClientRect();
      cw = Math.round(clamp(vw * 0.4, 150, 206));
      ch = Math.round(cw * 0.86);
      s0 = Math.min(src.width / cw, src.height / ch);
      sc = 1;
      cx = a.left + a.width / 2;
      cy = a.top + a.height / 2;
    } else {
      // выигрыш приподнимается из ленты точно под указателем
      const lb = (o.el.closest('.roll') || S.area).getBoundingClientRect();
      cw = src.width;
      ch = src.height;
      s0 = 1;
      sc = 1.14;
      cx = lb.left + lb.width / 2;
      cy = lb.top + lb.height / 2;
    }
    const hw = cw * sc / 2, hh = ch * sc / 2;
    cx = clamp(cx, hw + 8, vw - hw - 8);
    cy = clamp(cy, hh + 8, vh - hh - 8);
    const sx = src.left + src.width / 2, sy = src.top + src.height / 2;

    // оригинал прячем, пока двойник на сцене (у мини-окна — только ленту, рамка остаётся)
    const hide = S.mini ? (o.el.querySelector('.mstrip') || o.el) : o.el;
    hide.style.opacity = '0';
    S.hidden.push(hide);

    const fxl = S.fxl;
    fxl.textContent = '';
    const card = document.createElement('div');
    card.className = 'rx-card rx-gold r' + r;
    card.style.cssText = 'width:' + cw + 'px;height:' + ch + 'px;margin:' + px(-ch / 2) + ' 0 0 ' + px(-cw / 2);
    card.innerHTML = UI.itemCard(o.inst);
    fxl.appendChild(card);
    // плашка — под карточкой, а если снизу тесно — над ней
    const BH = 64;
    let by = cy + hh + 14;
    if (by + BH > vh - 8) by = Math.max(8, cy - hh - 14 - BH);
    const bw = layer(fxl, cx, by, 'rx-bw', bannerHTML(o.chance, r));

    // лёгкая тряска самой рулетки: 2–3 px, ~260 мс, без поворота (фон и интерфейс стоят)
    if (!RM && S.area) {
      const kf = [[0, 0], [-3, 1], [2.5, -1], [-2, 1], [1, 0], [0, 0]].map((a) => ({ transform: 'translate3d(' + a[0] + 'px,' + a[1] + 'px,0)' }));
      anim(S.area, kf, { duration: 260, easing: 'ease-out' });
      anim(fxl, kf, { duration: 260, easing: 'ease-out' });   // карточка трясётся вместе с рулеткой
    }
    // карточка: из ленты чуть вверх и крупнее, золотая рамка проявляется
    const tf = (x, y, s) => 'translate3d(' + px(x) + ',' + px(y) + ',0) scale(' + s.toFixed(3) + ')';
    anim(card, [
      { transform: tf(sx, sy, s0) },
      { transform: tf(cx, cy - (S.mini ? 0 : 6), sc) },
    ], { duration: (S.mini ? 420 : 320) * k, easing: OUT, fill: 'forwards' });
    anim(card.querySelector('.it'), [{ boxShadow: '0 0 0 0 rgba(255,178,46,0)' }, { boxShadow: '0 0 0 2px rgba(255,178,46,1)' }],
      { duration: 240 * k, delay: 80 * k, easing: 'ease-out', fill: 'both' });
    anim(bw.querySelector('.rx-banner'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 260 * k, delay: 160 * k, easing: OUT, fill: 'both' });
  }

  // Плашка под карточкой: «Редкий дроп · 1.20%», ниже — «1 из 83 · Мифическое»
  function bannerHTML(p, r) {
    return '<div class="rx-bc"><div class="rx-banner">' +
      '<div class="rx-bn-main"><span class="rx-bn-t">' + G.t(p < LIMIT ? 'rare_drop' : 'fx_rare_drop') + '</span><i class="rx-bn-d"></i><b class="rx-bn-p">' + pct(p) + '</b></div>' +
      '<div class="rx-bn-sub"><span>' + odds(p) + '</span><i></i><span>' + G.t('rar_' + RARITIES[r].id) + '</span></div>' +
      '</div></div>';
  }

  // Конец эффекта: снимаем подсветку лент, возвращаем оригинал, слой плавно гаснет и удаляется
  function close(S, now) {
    if (S.closed) return;
    S.closed = true;
    if (active === S) active = null;
    S.timers.forEach(clearTimeout);
    S.hooks.length = 0;
    if (S.stopRise) { S.stopRise(); S.stopRise = null; }
    if (S.onKey) document.removeEventListener('keydown', S.onKey, true);
    if (S.onPlace) window.removeEventListener('resize', S.onPlace);
    S.lanes.forEach((l) => {
      l.classList.remove('rx-hot', 'rx-dimmed');
      Array.prototype.forEach.call(l.querySelectorAll('.rx-glow, .rx-mk'), (x) => x.remove());
    });
    S.hidden.forEach((el) => { el.style.opacity = ''; });
    const root = S.root;
    if (!root) return;
    root.classList.remove('on');
    if (now || !root.animate) { root.remove(); return; }
    const rm = () => { if (root.parentNode) root.remove(); };
    const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: S.skipped ? 140 : 220, easing: 'ease-out', fill: 'forwards' });
    a.onfinish = rm;
    setTimeout(rm, 600);
  }

  return {
    LIMIT: LIMIT, R_MIN: R_MIN,
    hit: hit, chance: chance, pct: pct, odds: odds, curve: curve, session: session,
    // Окно результата: тонкая золотая рамка витрины (без лучей и бегущих искр)
    showcase: () => '<i class="rx-goldframe"></i>',
    oddsLine: (p) => '<div class="rx-odds"><span>' + G.t('rare_chance') + '</span><b>' + pct(p) + '</b><i></i><span>' + odds(p) + '</span></div>',
    tag: (p) => '<i class="rx-tag">' + pct(p) + '</i>',
  };
})();
