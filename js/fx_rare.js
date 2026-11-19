'use strict';

// =====================================================================
// Очень редкий дроп из кейса — предмет, шанс выпадения которого меньше 1 %.
// Лента дольше «докатывается» последними карточками, указатель и выигрыш светятся цветом
// редкости, вокруг рулетки темнеет; на остановке — вспышка, короткая тряска камеры, лучи
// за выигрышем, золотые искры, плашка «Очень редкий дроп · 0.42%» и свой звук (Sfx.rare).
// Клик (пробел, Enter, Esc) сразу ведёт к окну результата.
// Анимируются только transform и opacity — ровные 60 кадров/с.
// =====================================================================
const RareFx = (function () {
  const LIMIT = 0.01;          // порог «очень редкого» дропа: шанс меньше 1 %
  const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const px = (v) => v.toFixed(1) + 'px';
  const anim = (el, kf, t) => (el && el.animate ? el.animate(kf, t) : null);
  const OUT = 'cubic-bezier(.16,.84,.3,1)';
  let active = null;           // эффект текущего открытия

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
  // проходят в полтора раза дольше. X — путь до выигрыша, step — шаг карточек,
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

  // Слой поверх приложения: затемнение с «окном» над рулеткой, эффекты, подсказка «пропустить».
  // Слой ловит клики — это и есть пропуск; кнопки под ним во время прокрутки всё равно заблокированы.
  function ensureRoot(S) {
    if (S.root) return S.root;
    const root = document.createElement('div');
    root.id = 'rx-root';
    root.className = 'r' + S.r;
    root.innerHTML = '<div class="rx-dim"><i class="c1"></i><i class="c2"></i><i class="c3"></i><i class="c4"></i>' +
      '<b class="l1"></b><b class="l2"></b></div><div class="rx-fx"></div><div class="rx-skip">' + G.t('rare_skip') + '</div>';
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

  // Начало доката: указатель и будущий выигрыш светятся, вокруг темнеет, остальные ленты гаснут
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

  // Остановка на очень редком предмете. Промис выполняется, когда можно открывать окно
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
      S.timers.push(setTimeout(finish, S.fast ? 1150 : 1750));
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

  // Сцена остановки: лучи и ударные волны за карточкой-двойником, двойник выезжает
  // из ленты (мини-окна) под указатель и растёт, искры, плашка с шансом, вспышка, тряска
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
      // из мини-окна вылетает полноценная плитка предмета и встаёт по центру сетки
      const a = S.area.getBoundingClientRect();
      cw = Math.round(clamp(vw * 0.4, 150, 206));
      ch = Math.round(cw * 0.86);
      s0 = Math.min(src.width / cw, src.height / ch);
      sc = clamp(vh * 0.34 / ch, 1, 1.22);
      cx = a.left + a.width / 2;
      cy = a.top + a.height / 2;
    } else {
      // выигрыш поднимается из ленты и встаёт точно под указатель
      const lb = (o.el.closest('.roll') || S.area).getBoundingClientRect();
      cw = src.width;
      ch = src.height;
      s0 = 1;
      sc = clamp(200 / ch, 1.22, 1.62);
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
    const B = Math.round(clamp(Math.hypot(vw, vh) * 0.8, 620, 1500));   // поперечник круга лучей
    const RR = Math.round(Math.max(cw, ch) * sc * 2);                    // ударная волна
    const back = layer(fxl, cx, cy, 'rx-back',
      '<div class="rx-beams" style="--b:' + B + 'px"><i class="a"></i><i class="b"></i><i class="c"></i></div>' +
      '<i class="rx-ring" style="--rr:' + RR + 'px"></i><i class="rx-ring two" style="--rr:' + Math.round(RR * 1.5) + 'px"></i>');
    if (r >= 8) back.querySelector('.rx-beams .a').style.backgroundImage = rainbow();
    const card = document.createElement('div');
    card.className = 'rx-card r' + r;
    card.style.cssText = 'width:' + cw + 'px;height:' + ch + 'px;margin:' + px(-ch / 2) + ' 0 0 ' + px(-cw / 2);
    card.innerHTML = UI.itemCard(o.inst) + '<i class="rx-sheen"></i>';
    fxl.appendChild(card);
    const front = layer(fxl, cx, cy, 'rx-front', '');
    // плашка — под карточкой, а если снизу тесно — над ней
    const BH = 80;
    let by = cy + hh + 18;
    if (by + BH > vh - 8) by = Math.max(8, cy - hh - 18 - BH);
    const bw = layer(fxl, cx, by, 'rx-bw', bannerHTML(o.chance, r));
    const flash = document.createElement('div');
    flash.className = 'rx-flash';
    flash.style.setProperty('--x', px(cx));
    flash.style.setProperty('--y', px(cy));
    fxl.appendChild(flash);

    // вспышка: короткий белый всплеск с оттенком редкости
    anim(flash, [{ opacity: 0 }, { opacity: RM ? 0.35 : 0.92, offset: 0.08 }, { opacity: 0 }], { duration: 560 * k, easing: 'ease-out', fill: 'forwards' });
    // тряска камеры: приложение и наш слой вместе (фон-локация стоит — читается как глубина)
    if (!RM) {
      const kf = [[0, 0, 0], [-8, 5, -0.4], [7, -5, 0.35], [-5, 4, -0.25], [4, -2, 0.15], [-2, 1, -0.05], [0, 0, 0]].map((a) => ({
        transform: 'translate3d(' + a[0] + 'px,' + a[1] + 'px,0) rotate(' + a[2] + 'deg)', easing: 'ease-in-out',
      }));
      [document.getElementById('app'), root].forEach((el) => anim(el, kf, { duration: 460 }));
    }
    // лучи раскрываются из-за карточки и дальше медленно вращаются (CSS)
    anim(back.querySelector('.rx-beams'), [
      { transform: 'scale(.2) rotate(-30deg)', opacity: 0 },
      { transform: 'scale(1.05) rotate(0deg)', opacity: 1, offset: 0.6 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: 820 * k, easing: OUT, fill: 'forwards' });
    // две ударные волны: тонкие кольца цвета редкости и золота
    const rings = back.querySelectorAll('.rx-ring');
    anim(rings[0], [{ transform: 'scale(.18)', opacity: 1 }, { transform: 'scale(1)', opacity: 0 }], { duration: 700 * k, easing: 'cubic-bezier(.1,.7,.25,1)', fill: 'forwards' });
    anim(rings[1], [{ transform: 'scale(.12)', opacity: 0.85 }, { transform: 'scale(1)', opacity: 0 }], { duration: 1050 * k, delay: 80 * k, easing: 'cubic-bezier(.1,.7,.25,1)', fill: 'both' });
    // карточка: из ленты под указатель, крупнее, с лёгким наклоном «к зрителю» и обратно
    const tf = (x, y, s, rx) => 'translate3d(' + px(x) + ',' + px(y) + ',0) perspective(900px) rotateX(' + rx + 'deg) scale(' + s.toFixed(3) + ')';
    anim(card, [
      { transform: tf(sx, sy, s0, 0) },
      { transform: tf(cx, cy - 6, sc * 1.07, S.mini ? -10 : -7), offset: 0.55 },
      { transform: tf(cx, cy, sc, 0) },
    ], { duration: (S.mini ? 760 : 640) * k, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'forwards' });
    anim(card.querySelector('.rx-sheen'), [{ transform: 'translateX(-160%) skewX(-16deg)' }, { transform: 'translateX(430%) skewX(-16deg)' }],
      { duration: 900 * k, delay: 380 * k, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'both' });
    sparks(back, front, cw * sc, ch * sc, r, k);
    banner(bw, k);
  }

  // Радужные лучи для артефактов (✧, 100М+): каждый луч своего цвета, как полоска редкости
  function rainbow() {
    const cols = ['255,79,139', '255,210,63', '61,255,181', '61,165,255', '192,107,255'];
    const n = 20, st = 360 / n, s = [];
    for (let i = 0; i < n; i++) {
      const a = i * st, c = cols[i % cols.length];
      s.push('rgba(' + c + ',0) ' + a.toFixed(1) + 'deg', 'rgba(' + c + ',.6) ' + (a + st * 0.2).toFixed(1) + 'deg',
        'rgba(' + c + ',0) ' + (a + st * 0.4).toFixed(1) + 'deg');
    }
    return 'conic-gradient(' + s.join(',') + ')';
  }

  function bannerHTML(p, r) {
    return '<div class="rx-bc"><div class="rx-banner">' +
      '<div class="rx-bn-plate"><i class="rx-bn-sheen"></i></div>' +
      '<i class="rx-bn-w l"></i><i class="rx-bn-w r"></i>' +
      '<div class="rx-bn-main"><span class="rx-bn-t">' + G.t('rare_drop') + '</span><i class="rx-bn-d"></i><b class="rx-bn-p">' + pct(p) + '</b></div>' +
      '<div class="rx-bn-sub"><span>' + odds(p) + '</span><i></i><span>' + G.t('rar_' + RARITIES[r].id) + '</span></div>' +
      '</div></div>';
  }

  // Плашка: подложка раскрывается от центра, строки поднимаются по очереди, «крылья»
  // вытягиваются в стороны, по подложке один раз пробегает блик
  function banner(bw, k) {
    const q = (s) => bw.querySelector(s);
    const d0 = 200 * k;
    const rise = (dy) => [{ opacity: 0, transform: 'translateY(' + dy + 'px)' }, { opacity: 1, transform: 'translateY(0)' }];
    anim(q('.rx-banner'), rise(14), { duration: 420 * k, delay: d0, easing: OUT, fill: 'both' });
    anim(q('.rx-bn-plate'), [{ transform: 'scaleX(.45)' }, { transform: 'scaleX(1)' }], { duration: 540 * k, delay: d0, easing: OUT, fill: 'both' });
    anim(q('.rx-bn-main'), rise(7), { duration: 400 * k, delay: d0 + 110 * k, easing: OUT, fill: 'both' });
    anim(q('.rx-bn-sub'), rise(6), { duration: 400 * k, delay: d0 + 210 * k, easing: OUT, fill: 'both' });
    Array.prototype.forEach.call(bw.querySelectorAll('.rx-bn-w'), (w) => anim(w, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }],
      { duration: 600 * k, delay: d0 + 150 * k, easing: OUT, fill: 'both' }));
    anim(q('.rx-bn-sheen'), [{ transform: 'translateX(-140%) skewX(-18deg)' }, { transform: 'translateX(520%) skewX(-18deg)' }],
      { duration: 1000 * k, delay: d0 + 420 * k, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'both' });
  }

  // Золотые искры: фольга срывается с краёв карточки (тормозит о воздух, кувыркается и падает),
  // быстрые росчерки, мерцающие звёздочки по контуру и угольки цвета редкости, уходящие вверх.
  // W, H — размер карточки на сцене; часть частиц летит перед ней, часть — за ней.
  const FOIL = [['#fffbe8', '#ffd76e', '#b5730b'], ['#fff3cc', '#ffc23a', '#9c5c08'], ['#ffffff', '#ffe39a', '#cf8e1b'], ['#fff0bd', '#f2ae2c', '#8a5207']];
  const RAINBOW = ['#ff4f8b', '#ffd23f', '#3dffb5', '#3da5ff', '#c06bff'];
  function sparks(back, front, W, H, r, k) {
    const n = RM ? 0.35 : 1;
    const tr = (x, y, rest) => 'translate3d(' + px(x) + ',' + px(y) + ',0) ' + rest;
    const box = (w, h) => 'width:' + w.toFixed(1) + 'px;height:' + h.toFixed(1) + 'px;margin:' + px(-h / 2) + ' 0 0 ' + px(-w / 2) + ';';
    const add = (lay, cls, css, kf, t) => {
      const el = document.createElement('i');
      el.className = 'rx-p ' + cls;
      el.style.cssText = css;
      lay.appendChild(el);
      anim(el, kf, t);
    };
    // расстояние от центра до края карточки по направлению (ca, sa)
    const edge = (ca, sa) => Math.min(W / 2 / Math.max(1e-3, Math.abs(ca)), H / 2 / Math.max(1e-3, Math.abs(sa)));
    for (let i = 0, N = Math.round(48 * n); i < N; i++) {
      const a = rnd(0, Math.PI * 2), ca = Math.cos(a), sa = Math.sin(a), e = edge(ca, sa) * rnd(0.78, 1);
      const x0 = ca * e, y0 = sa * e;
      const v = rnd(130, 430) * (Math.random() < 0.2 ? 1.6 : 1);
      const x1 = x0 + ca * v, y1 = y0 + sa * v * 0.8 - rnd(20, 110);
      const x2 = x1 + ca * rnd(10, 46), y2 = y1 + rnd(150, 320);
      const w = rnd(3, 7.5), h = w * rnd(0.42, 0.78);
      const g = pick(FOIL);
      const z0 = rnd(0, 360), spin = rnd(300, 900) * (Math.random() < 0.5 ? -1 : 1), f0 = rnd(0, 180);
      const rot = (s, f) => 'rotate(' + (z0 + spin * s).toFixed(0) + 'deg) rotateX(' + (f0 + f).toFixed(0) + 'deg)';
      add(Math.random() < 0.55 ? front : back, 'f', box(w, h) + 'background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ' 52%,' + g[2] + ')', [
        { transform: tr(x0, y0, rot(0, 0) + ' scale(.5)'), opacity: 0 },
        { transform: tr(x0 + (x1 - x0) * 0.22, y0 + (y1 - y0) * 0.22, rot(0.08, 50) + ' scale(1)'), opacity: 1, offset: 0.06, easing: 'cubic-bezier(.15,.75,.35,1)' },
        { transform: tr(x1, y1, rot(0.45, 320) + ' scale(1)'), opacity: 1, offset: 0.45, easing: 'cubic-bezier(.5,0,.8,.55)' },
        { transform: tr(x2, y2, rot(1, 700) + ' scale(.75)'), opacity: 0 },
      ], { duration: rnd(1150, 1750) * k, delay: rnd(0, 110), fill: 'both' });
    }
    for (let i = 0, N = Math.round(20 * n); i < N; i++) {
      const a = rnd(0, Math.PI * 2), ca = Math.cos(a), sa = Math.sin(a);
      const deg = (a * 180 / Math.PI - 90).toFixed(1);
      const L = rnd(16, 40), d0 = edge(ca, sa) * 0.9, d1 = d0 + rnd(150, 340), dm = d0 + (d1 - d0) * 0.55;
      add(front, 's', box(2, L), [
        { transform: tr(ca * d0, sa * d0, 'rotate(' + deg + 'deg) scaleY(.15)'), opacity: 1 },
        { transform: tr(ca * dm, sa * dm, 'rotate(' + deg + 'deg) scaleY(1)'), opacity: 1, offset: 0.35 },
        { transform: tr(ca * d1, sa * d1, 'rotate(' + deg + 'deg) scaleY(.2)'), opacity: 0 },
      ], { duration: rnd(420, 720) * k, delay: rnd(0, 70), easing: 'cubic-bezier(.12,.8,.3,1)', fill: 'both' });
    }
    for (let i = 0, N = Math.round(14 * n); i < N; i++) {
      const sd = Math.floor(Math.random() * 4), f = Math.random() - 0.5;
      const x = (sd < 2 ? f * W : sd === 2 ? -W / 2 : W / 2) + rnd(-10, 10);
      const y = (sd < 2 ? (sd === 0 ? -H / 2 : H / 2) : f * H) + rnd(-10, 10);
      const s = rnd(10, 24);
      add(front, 'g', box(s, s), [
        { transform: tr(x, y, 'rotate(0deg) scale(0)'), opacity: 0 },
        { transform: tr(x, y, 'rotate(45deg) scale(1)'), opacity: 1, offset: 0.4 },
        { transform: tr(x, y, 'rotate(90deg) scale(0)'), opacity: 0 },
      ], { duration: rnd(460, 800) * k, delay: rnd(140, 1150) * k, easing: 'ease-in-out', fill: 'both' });
    }
    for (let i = 0, N = Math.round(12 * n); i < N; i++) {
      const x0 = rnd(-0.55, 0.55) * W, y0 = rnd(-0.1, 0.5) * H, s = rnd(2.5, 4.5);
      const c = r >= 8 ? pick(RAINBOW) : RARITIES[r].color;
      add(back, 'e', box(s, s) + 'background:' + c + ';color:' + c, [
        { transform: tr(x0, y0, 'scale(.4)'), opacity: 0 },
        { transform: tr(x0 + rnd(-24, 24), y0 - rnd(30, 70), 'scale(1)'), opacity: 1, offset: 0.25 },
        { transform: tr(x0 + rnd(-60, 60), y0 - rnd(150, 280), 'scale(.4)'), opacity: 0 },
      ], { duration: rnd(1300, 1900) * k, delay: rnd(80, 380) * k, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'both' });
    }
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
    const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: S.skipped ? 160 : 340, easing: 'ease-out', fill: 'forwards' });
    a.onfinish = rm;
    setTimeout(rm, 800);
  }

  return {
    LIMIT: LIMIT,
    chance: chance, pct: pct, odds: odds, curve: curve, session: session,
    // Окно результата: бегущая по рамке искра и медленные лучи за предметом
    showcase: () => '<i class="rx-mrays"></i><i class="rx-frame"><i></i></i>',
    oddsLine: (p) => '<div class="rx-odds"><span>' + G.t('rare_chance') + '</span><b>' + pct(p) + '</b><i></i><span>' + odds(p) + '</span></div>',
    tag: (p) => '<i class="rx-tag">' + pct(p) + '</i>',
  };
})();
