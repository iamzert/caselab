'use strict';

// Рендерер предметов и кейсов на canvas. Готовые картинки кэшируются как blob-URL
// и вставляются в интерфейс обычными <img> (быстро и плавно при анимации).
const Art = (function () {
  const W = Tex.W, H = Tex.H, S = Tex.S;
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const urls = {}, pending = {}, queue = [];
  // Повторные запросы ожидающих картинок (снова на экране: окно дропа, рулетка) — отдельный стек, он рисуется раньше
  // всей очереди, последний запрос — первым. Так выпавший предмет не ждёт за пачками ленты рулетки.
  const hot = [];
  let scheduled = false;
  let waiters = [];

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ---------- Подготовка геометрии ----------
  // Пока у вида оружия нет своей модели, рисуется похожая того же типа — пустых картинок не бывает.
  // Как только модель появится в js/geo_*.js, она заменит запасную сама.
  const FALLBACK = {
    m9: 'bay', talon: 'kar', skel: 'hunt', classic: 'hunt', kukri: 'falc', nomad: 'flip', para: 'hunt', bear: 'flip',
    surv: 'bowie', nav: 'flip', gut: 'hunt', push: 'stil', smg9: 'smg10', smg7: 'smg10', smg5: 'smg45', bzn: 'smg45',
    glmo: 'gltc', gldr: 'glsp', glsh: 'gltc', glwr: 'glsp',
  };
  const TYPE_FALLBACK = { pistol: 'p17', smg: 'smg10', rifle: 'ar47', sniper: 'sr08', shotgun: 'sg12', mg: 'm249', knife: 'hunt', gloves: 'glsp' };
  function geo(id) {
    return GEO[id] || GEO[FALLBACK[id]] || (WEAPONS[id] && GEO[TYPE_FALLBACK[WEAPONS[id].type]]) || null;
  }
  function bboxOf(d) {
    const t = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) || [];
    let i = 0, cmd = 'M', x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    while (i < t.length) {
      if (/[a-zA-Z]/.test(t[i])) { cmd = t[i++].toUpperCase(); if (cmd === 'Z') continue; }
      if (cmd === 'A') { const rx = +t[i], ry = +t[i + 1], x = +t[i + 5], y = +t[i + 6]; add(x - rx, y - ry); add(x + rx, y + ry); i += 7; }
      else if (cmd === 'C') { add(+t[i], +t[i + 1]); add(+t[i + 2], +t[i + 3]); add(+t[i + 4], +t[i + 5]); i += 6; }
      else if (cmd === 'Q') { add(+t[i], +t[i + 1]); add(+t[i + 2], +t[i + 3]); i += 4; }
      else if (cmd === 'M' || cmd === 'L' || cmd === 'T') { add(+t[i], +t[i + 1]); i += 2; }
      else i++;
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  // Ножи: как в CS2, раскраска ложится на клинок, а рукоять (дерево, кость, полимер, обмотка) под любым
  // скином остаётся своим материалом. Клинки размечены steel / gun / gray — они красятся.
  const HANDLE_MAT = { black: 1, rubber: 1, bone: 1, wood: 1, walnut: 1, birch: 1, redwood: 1, sage: 1, khaki: 1, od: 1, olive: 1, coyote: 1, sand: 1, tan: 1 };
  const prepCache = {};
  function prep(weaponId) {
    if (prepCache[weaponId]) return prepCache[weaponId];
    const g = geo(weaponId);
    const knife = !!(WEAPONS[weaponId] && WEAPONS[weaponId].type === 'knife');
    const list = (g.pair ? g.parts : g).map((p) => {
      // подсказка формы для света — объект в конце кортежа: { pr, r, h, gem, soft } (см. контракт R6)
      const last = p[p.length - 1];
      const hint = last && typeof last === 'object' ? last : null;
      if (p[0] === 'o') {
        const path = new Path2D();
        path.arc(p[1], p[2], p[3], 0, Math.PI * 2);
        return { role: 'o', path: path, cx: p[1], cy: p[2], r: p[3], hint: hint, bb: { x0: p[1] - p[3], y0: p[2] - p[3], x1: p[1] + p[3], y1: p[2] + p[3] } };
      }
      if (p[0] === 't') {
        return { role: 't', x: p[1], y: p[2], text: p[3], size: p[4], hint: hint, bb: { x0: p[1], y0: p[2] - p[4], x1: p[1] + p[3].length * p[4] * 0.6, y1: p[2] } };
      }
      // у окрашиваемых деталей третий элемент — заводской материал (см. FACT), у линий — толщина
      // материал с «!» на конце ('leather!') — деталь всегда своим материалом, скин на неё не ложится
      // (накладки и защита перчаток и т. п.); у ножей так же ведут себя рукояти из HANDLE_MAT
      const raw = (p[0] === 'p' || p[0] === 'q') && typeof p[2] === 'string' ? p[2] : null;
      const bang = !!raw && raw.charAt(raw.length - 1) === '!';
      const mat = bang ? raw.slice(0, -1) : raw;
      return { role: p[0], path: new Path2D(p[1]), w: !mat && typeof p[2] === 'number' ? p[2] : 0, mat: mat, fixed: bang || (knife && !!HANDLE_MAT[mat]),
        hint: hint, bb: bboxOf(p[1]) };
    });
    prepCache[weaponId] = list;
    return list;
  }

  // Пары: перчатки (левая и зеркальная правая) и парное оружие. Задняя копия рисуется первой и темнее.
  // pair: true — расклад перчаток; { back, front } — свой расклад: { x, y, rot, cx, cy, s, flip }.
  const GLOVE_PAIR = {
    back: { x: 382, y: 2, flip: true, rot: -0.14, cx: 88, cy: 150 },
    front: { x: 130, y: 0, rot: -0.14, cx: 88, cy: 150 },
  };
  // Матрицы [a, b, c, d, e, f] как у canvas: A·B — сначала B, потом A
  function mmul(A, B) {
    return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  }
  function pairMatrix(p) {
    let m = [1, 0, 0, 1, p.x || 0, p.y || 0];
    if (p.flip) m = mmul(m, [-1, 0, 0, 1, 0, 0]);
    if (p.s && p.s !== 1) m = mmul(m, [p.s, 0, 0, p.s, 0, 0]);
    if (p.rot) {
      const cx = p.cx || 0, cy = p.cy || 0, c = Math.cos(p.rot), s = Math.sin(p.rot);
      m = mmul(mmul(mmul(m, [1, 0, 0, 1, cx, cy]), [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    }
    return m;
  }
  // Рамка пары (единицы поля) по рамкам деталей
  function pairBox(parts, M) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    M.forEach((m) => parts.forEach((P) => {
      if (P.role === 't') return;
      [[P.bb.x0, P.bb.y0], [P.bb.x1, P.bb.y0], [P.bb.x0, P.bb.y1], [P.bb.x1, P.bb.y1]].forEach((q) => {
        const x = m[0] * q[0] + m[2] * q[1] + m[4], y = m[1] * q[0] + m[3] * q[1] + m[5];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      });
    }));
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 };
  }
  // Парное оружие, поставленное почти вертикально, в карточке 4:3 занимает меньше половины ширины.
  // Такой расклад положе (угол ×0,45) и разведён в стороны «домиком»: копии смотрят стволами друг к другу.
  function pairFit(weaponId, back, front) {
    const parts = prep(weaponId), B = pairBox(parts, [pairMatrix(back), pairMatrix(front)]);
    if (B.w >= 1.15 * B.h) return null;
    const nb = Object.assign({}, back, { rot: (back.rot || 0) * 0.45 }), nf = Object.assign({}, front, { rot: (front.rot || 0) * 0.45 });
    const one = pairBox(parts, [pairMatrix(nb)]), two = pairBox(parts, [pairMatrix(nf)]);
    const cb = (one.x0 + one.x1) / 2, cf = (two.x0 + two.x1) / 2, mid = (cb + cf) / 2, d = 0.21 * (one.w + two.w) / 2;
    const left = cb <= cf ? -1 : 1;
    nb.x = (nb.x || 0) + mid + left * d - cb; nf.x = (nf.x || 0) + mid - left * d - cf;
    return [nb, nf];
  }
  const pairCache = {};
  function pairMats(weaponId) {
    if (pairCache[weaponId]) return pairCache[weaponId];
    const g = geo(weaponId), p = g.pair === true ? GLOVE_PAIR : g.pair;
    let back = p.back || {}, front = p.front || {};
    if (g.pair !== true && WEAPONS[weaponId] && WEAPONS[weaponId].type !== 'gloves') {
      const f = pairFit(weaponId, back, front);
      if (f) { back = f[0]; front = f[1]; }
    }
    pairCache[weaponId] = { back: pairMatrix(back), front: pairMatrix(front) };
    return pairCache[weaponId];
  }
  function pairDo(ctx, weaponId, fn) {
    const M = pairMats(weaponId);
    ctx.save(); ctx.transform(M.back[0], M.back[1], M.back[2], M.back[3], M.back[4], M.back[5]); fn(true); ctx.restore();
    ctx.save(); ctx.transform(M.front[0], M.front[1], M.front[2], M.front[3], M.front[4], M.front[5]); fn(false); ctx.restore();
  }

  // ---------- Материалы ----------
  const MAT = {
    m: [['#666e78', 0], ['#3e444c', 0.3], ['#262a30', 0.65], ['#15171b', 1]],
    l: [['#f4f6f8', 0], ['#c3c9d1', 0.4], ['#8a919b', 0.75], ['#5d636c', 1]],
    k: [['#3d4148', 0], ['#272a2f', 0.45], ['#17191c', 1]],
    g: [['#d6efff', 0], ['#4d6fe0', 0.45], ['#1a1240', 1]],
  };
  // Цилиндр (стволы, трубки): яркий блик ближе к верху
  const CYL = [['#1b1e22', 0], ['#5e6670', 0.16], ['#b4bbc4', 0.3], ['#4a5058', 0.45], ['#22262b', 0.78], ['#0f1012', 1]];
  function matGrad(ctx, P) {
    const g = ctx.createLinearGradient(0, P.bb.y0, 0, P.bb.y1);
    const h = P.bb.y1 - P.bb.y0, w = P.bb.x1 - P.bb.x0;
    (P.role === 'm' && h < 20 && w > 3 * h ? CYL : MAT[P.role]).forEach((s) => g.addColorStop(s[1], s[0]));
    return g;
  }

  // ---------- Заводские материалы («Заводская окраска», FINISHES.plain.factory) ----------
  // У окрашиваемой детали можно указать настоящий материал: ['p', path, 'wood']. С заводской раскраской
  // деталь рисуется им (дерево, песочный или оливковый полимер, сталь), с любой другой — раскраской.
  // Детали без материала в заводской раскраске — серый воронёный металл, как раньше.
  const FACT = {
    wood:   { tex: { kind: 'wood', c: ['#7a3816', '#a7592a', '#43190a'] }, col: '#8a4520', gloss: 0.42 },   // красноватый орех / берёза под лаком
    walnut: { tex: { kind: 'wood', c: ['#4a2914', '#71452a', '#26130a'] }, col: '#5a331a', gloss: 0.45 },   // тёмный орех (накладки рукоятей)
    birch:  { tex: { kind: 'wood', c: ['#a06a36', '#c8975a', '#6a411d'] }, col: '#b07a42', gloss: 0.38 },   // светлое дерево
    redwood: { tex: { kind: 'wood', c: ['#6e2414', '#9a3a20', '#3e1208'] }, col: '#7e2c18', gloss: 0.5 },   // красное дерево
    tan:    { col: '#a3895f', gloss: 0.14 },    // песочный полимер (рамка «Гарды», «Беркут»)
    sand:   { col: '#c0a77c', gloss: 0.12 },    // светлый песочный (шнур, обмотка)
    khaki:  { col: '#a39c62', gloss: 0.14 },    // жёлто-оливковый (рукоять армейского ножа)
    coyote: { col: '#866f4c', gloss: 0.12 },    // коричневато-песочный
    olive:  { col: '#646b4b', gloss: 0.14 },    // оливковый полимер («Авангард», «Гром-338»)
    od:     { col: '#4c5541', gloss: 0.12 },    // тёмно-оливковый (короба, подсумки)
    sage:   { col: '#7f8a6a', gloss: 0.14 },    // светло-оливковый
    black:  { col: '#2c2f34', gloss: 0.16 },    // чёрный полимер
    rubber: { col: '#25272b', gloss: 0.06 },    // резина, матовый
    gray:   { col: '#5f656d', gloss: 0.3 },     // серый металл / покрытие
    green:  { col: '#3c8a5a', gloss: 0.5 },     // зелёный пластик (кассета шокера)
    bone:   { col: '#d6cbb0', gloss: 0.32 },    // кость
    // перчатки
    leather:  { col: '#5e4330', gloss: 0.34 },  // коричневая кожа
    darkleather: { col: '#2e2a27', gloss: 0.3 }, // чёрная кожа
    tanleather: { col: '#9c7650', gloss: 0.3 }, // светлая кожа
    cloth:    { col: '#565b62', gloss: 0.06 },  // ткань, трикотаж
    neoprene: { col: '#3b4046', gloss: 0.14 },  // неопрен, эластичные вставки
    wrap:     { col: '#cbbd9f', gloss: 0.05 },  // бинт, обмотка
    tape:     { col: '#a9b2b8', gloss: 0.35 },  // армированный скотч
    steel:  { metal: 'l', gloss: 0.85 },        // светлая сталь (клинки, нержавеющие затворы)
    gun:    { metal: 'm', gloss: 0.55 },        // тёмная сталь
  };
  function factoryOf(P, fin) { return P.mat && (P.fixed || (fin && fin.factory)) ? FACT[P.mat] || null : null; }
  // Плёнка фактуры на всё поле. Если картинка отражена (MIRROR, эмблема ящика), плёнка отражается ещё раз —
  // надписи и узоры в текстурах (граффити, чертёж, комикс, «Прототип») читаются правильно
  function drawFilm(ctx, img) {
    if (ctx.getTransform().a < 0) {
      ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, W, H); ctx.restore();
    } else ctx.drawImage(img, 0, 0, W, H);
  }
  // Микрофактура (полимер, шлифовка) — тексель в пиксель картинки, а не в единицу модели (иначе 2×2 мыла)
  const FINE = typeof DOMMatrix === 'function' ? new DOMMatrix([1 / S, 0, 0, 1 / S, 0, 0]) : null;
  function fine(p) { if (FINE && p && p.setTransform) p.setTransform(FINE); return p; }
  function factoryFill(ctx, P, fm) {
    if (fm.tex) { drawFilm(ctx, Tex.make('fact:' + P.mat, fm.tex)); return; }
    if (fm.metal) {
      ctx.fillStyle = matGrad(ctx, { role: fm.metal, bb: P.bb }); ctx.fill(P.path, 'evenodd');
      ctx.fillStyle = fine(Tex.brushed(ctx)); ctx.fill(P.path, 'evenodd');
      return;
    }
    ctx.fillStyle = fm.col; ctx.fill(P.path, 'evenodd');
    ctx.fillStyle = fine(Tex.polymer(ctx)); ctx.fill(P.path, 'evenodd');
  }

  // Фаска: светлая кромка сверху и внутренняя тень снизу — даёт объём
  function bevel(ctx, P, px, k) {
    const bb = P.bb, pad = 14;
    if ((bb.x1 - bb.x0) * (bb.y1 - bb.y0) < 120) return;
    const frame = new Path2D();
    frame.rect(bb.x0 - pad, bb.y0 - pad, bb.x1 - bb.x0 + pad * 2, bb.y1 - bb.y0 + pad * 2);
    frame.addPath(P.path);
    ctx.save();
    ctx.clip(P.path, 'evenodd');
    ctx.fillStyle = '#000';
    ctx.shadowColor = 'rgba(255,255,255,' + 0.5 * k + ')';
    ctx.shadowBlur = 2 * px; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1.5 * px;
    ctx.fill(frame, 'evenodd');
    ctx.shadowColor = 'rgba(0,0,0,' + 0.65 * k + ')';
    ctx.shadowBlur = 5 * px; ctx.shadowOffsetY = -2.5 * px;
    ctx.fill(frame, 'evenodd');
    ctx.restore();
  }

  function contactFill(ctx, P, style, px) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 4 * px;
    ctx.shadowOffsetY = 1.2 * px;
    ctx.fillStyle = style;
    ctx.fill(P.path, 'evenodd');
    ctx.restore();
  }

  function shadeFill(ctx, P, k) {
    const g = ctx.createLinearGradient(0, P.bb.y0, 0, P.bb.y1);
    g.addColorStop(0, 'rgba(255,255,255,' + 0.4 * k + ')');
    g.addColorStop(0.1, 'rgba(255,255,255,' + 0.14 * k + ')');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(0.75, 'rgba(0,0,0,' + 0.14 * k + ')');
    g.addColorStop(1, 'rgba(0,0,0,' + 0.48 * k + ')');
    ctx.fillStyle = g;
    ctx.fill(P.path, 'evenodd');
  }

  function sheen(ctx, P, gloss) {
    const g = ctx.createLinearGradient(0, P.bb.y0, 0, P.bb.y1);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.1, 'rgba(255,255,255,' + 0.38 * gloss + ')');
    g.addColorStop(0.24, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fill(P.path, 'evenodd');
    const d = ctx.createLinearGradient(150, 0, 270, 192);
    d.addColorStop(0, 'rgba(255,255,255,0)');
    d.addColorStop(0.5, 'rgba(255,255,255,' + 0.17 * gloss + ')');
    d.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = d;
    ctx.fill(P.path, 'evenodd');
  }

  function outline(ctx, P) {
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(0,0,0,.38)';
    ctx.stroke(P.path);
  }

  // Гравировка всегда читается слева направо, даже когда картинка предмета отражена (MIRROR)
  function textUpright(ctx, P, dy) {
    if (ctx.getTransform().a < 0) {
      const w = ctx.measureText(P.text).width;
      ctx.save(); ctx.translate(P.x + w, P.y + dy); ctx.scale(-1, 1); ctx.fillText(P.text, 0, 0); ctx.restore();
    } else ctx.fillText(P.text, P.x, P.y + dy);
  }

  function dimRect(ctx, P, a) {
    ctx.fillStyle = 'rgba(0,0,0,' + a + ')';
    ctx.fillRect(P.bb.x0 - 2, P.bb.y0 - 2, P.bb.x1 - P.bb.x0 + 4, P.bb.y1 - P.bb.y0 + 4);
  }

  // ---------- Плоская отрисовка оружия (эмблемы, трафареты и окна ящиков в js/art_crate.js) ----------
  // Картинки предметов рисуются объёмно (см. «R6: объёмные иконки»); здесь — векторная заливка для декалей.
  // opt: { px — пикселей на единицу, shadow, mono — цвет силуэта, dim — затемнение }
  function drawParts(ctx, parts, finishId, opt) {
    const px = opt.px || S;
    const mono = opt.mono;
    const fin = finishId ? FINISHES[finishId] : null;
    const tex = fin && !mono ? Tex.get(finishId) : null;
    const gloss = fin ? fin.gloss || 0 : 0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (!mono && opt.shadow !== false) {
      ctx.save();
      // контактная тень: целиком помещается в поля рамки (низ +16), без среза по краю картинки
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 8 * px;
      ctx.shadowOffsetY = 5 * px;
      ctx.fillStyle = '#000';
      parts.forEach((P) => { if ('pqmlkgo'.indexOf(P.role) >= 0) ctx.fill(P.path, 'evenodd'); });
      ctx.restore();
    }

    parts.forEach((P) => {
      const r = P.role;
      if (mono) {
        if (r === 's') { ctx.lineWidth = P.w; ctx.strokeStyle = mono; ctx.stroke(P.path); }
        else if ('pqmlkgo'.indexOf(r) >= 0) { ctx.fillStyle = mono; ctx.fill(P.path, 'evenodd'); }
        return;
      }
      switch (r) {
        case 'p': case 'q': {
          const fm = factoryOf(P, fin);
          contactFill(ctx, P, fm ? fm.col || '#6a7078' : fin.c[0], px);
          ctx.save();
          ctx.clip(P.path, 'evenodd');
          if (fm) factoryFill(ctx, P, fm); else drawFilm(ctx, tex);
          if (r === 'q') dimRect(ctx, P, 0.3);
          if (opt.dim) dimRect(ctx, P, opt.dim);
          ctx.restore();
          shadeFill(ctx, P, 0.85);
          if (fm ? fm.gloss : gloss) sheen(ctx, P, fm ? fm.gloss : gloss);
          bevel(ctx, P, px, 0.4);
          outline(ctx, P);
          break;
        }
        case 'm': case 'l': case 'k': case 'g':
          contactFill(ctx, P, matGrad(ctx, P), px);
          if (r === 'm') { ctx.fillStyle = fine(Tex.brushed(ctx)); ctx.fill(P.path, 'evenodd'); }
          if (r === 'k') { ctx.fillStyle = fine(Tex.polymer(ctx)); ctx.fill(P.path, 'evenodd'); }
          if (opt.dim) { ctx.save(); ctx.clip(P.path, 'evenodd'); dimRect(ctx, P, opt.dim); ctx.restore(); }
          shadeFill(ctx, P, r === 'k' ? 0.5 : 0.8);
          bevel(ctx, P, px, 0.3);
          outline(ctx, P);
          break;
        case 't':
          ctx.font = '600 ' + P.size + 'px Arial, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,.22)'; textUpright(ctx, P, 0.7);
          ctx.fillStyle = 'rgba(0,0,0,.55)'; textUpright(ctx, P, 0);
          break;
        case 's':
          ctx.lineWidth = P.w; ctx.strokeStyle = '#1f2227'; ctx.stroke(P.path);
          ctx.lineWidth = P.w * 0.35; ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.stroke(P.path);
          break;
        case 'd':
          ctx.lineWidth = P.w || 1.2; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke(P.path);
          break;
        case 'h':
          ctx.lineWidth = P.w || 1.2; ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.stroke(P.path);
          break;
        case 'e':
          ctx.save(); ctx.setLineDash([4, 3]); ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.stroke(P.path); ctx.restore();
          break;
        case 'o': {
          const g = ctx.createRadialGradient(P.cx - P.r * 0.35, P.cy - P.r * 0.35, P.r * 0.1, P.cx, P.cy, P.r);
          g.addColorStop(0, '#f1f3f6'); g.addColorStop(0.55, '#9aa1ab'); g.addColorStop(1, '#4b5058');
          ctx.fillStyle = g; ctx.fill(P.path);
          ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke(P.path);
          break;
        }
      }
    });
  }

  function drawWeapon(ctx, weaponId, finishId, opt) {
    opt = opt || {};
    if (!geo(weaponId)) return;                          // модели ещё нет — эмблема ящика просто без оружия
    if (finishId && !FINISHES[finishId]) { finishId = null; opt = Object.assign({}, opt, { mono: opt.mono || '#9aa3ad' }); }
    const parts = prep(weaponId);
    if (geo(weaponId).pair) pairDo(ctx, weaponId, (back) => drawParts(ctx, parts, finishId, back ? Object.assign({}, opt, { dim: 0.22 }) : opt));
    else drawParts(ctx, parts, finishId, opt);
  }

  // ---------- Объёмный свет для ящиков (js/art_crate.js) ----------
  // Ящики рисуют свои карты высот и блеска (плато, канавки); после размытия кромки становятся покатыми,
  // по наклону считаются нормали, а по ним — рассеянный свет, блики и затенение впадин.
  // Картинки предметов освещаются иначе — см. «R6: объёмные иконки» ниже.
  const gray = (v) => { const n = Math.max(0, Math.min(255, Math.round(v * 255))); return 'rgb(' + n + ',' + n + ',' + n + ')'; };

  // Быстрое размытие (скользящее среднее по строкам и столбцам)
  function blur(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h), k = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let acc = src[o] * (r + 1);
      for (let x = 1; x <= r; x++) acc += src[o + Math.min(x, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = acc * k;
        acc += src[o + Math.min(x + r + 1, w - 1)] - src[o + Math.max(x - r, 0)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = tmp[x] * (r + 1);
      for (let y = 1; y <= r; y++) acc += tmp[Math.min(y, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc * k;
        acc += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
      }
    }
    return out;
  }

  const unit = (v) => { const n = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / n); };
  const LV = unit([-0.5, -0.8, 0.62]);              // свет сверху слева, чуть спереди
  const HV = unit([LV[0], LV[1], LV[2] + 1]);       // полувектор для бликов
  const AMB = 0.4, KD = 0.66, FLAT = AMB + KD * LV[2];

  // opt: { k — сила наклона, spec — сила бликов, ao — сила затенения впадин, r — радиус скругления }
  function relight(c, hc, gc, opt) {
    opt = opt || {};
    const w = c.width, h = c.height, n = w * h;
    const ctx = c.getContext('2d');
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const hd = hc.getContext('2d').getImageData(0, 0, w, h).data;
    const gd = gc ? gc.getContext('2d').getImageData(0, 0, w, h).data : null;
    const h0 = new Float32Array(n);
    for (let i = 0; i < n; i++) h0[i] = hd[i * 4] / 255;
    const r1 = Math.max(1, Math.round((opt.r || 1.3) * S));
    const h1 = blur(blur(h0, w, h, r1), w, h, r1);
    const h2 = blur(blur(h1, w, h, r1 * 4), w, h, r1 * 4);
    const K = (opt.k || 6) * S;
    const SP = opt.spec != null ? opt.spec : 1;
    const AO = opt.ao != null ? opt.ao : 1.9;
    const byAlpha = opt.mask === 'alpha';   // ящики: свет везде, где есть картинка
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!byAlpha && h0[i] <= 0) continue;
        const p = i * 4;
        if (d[p + 3] < (byAlpha ? 200 : 1)) continue;
        const dx = (h1[i + 1] - h1[i - 1]) * K, dy = (h1[i + w] - h1[i - w]) * K;
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const nx = -dx * inv, ny = -dy * inv, nz = inv;
        const dif = Math.max(0, nx * LV[0] + ny * LV[1] + nz * LV[2]);
        const nh = nx * HV[0] + ny * HV[1] + nz * HV[2];
        const gl = gd ? gd[p] / 255 : 0.5;
        let s = 0;
        if (nh > 0.75 && gl > 0.02) s = Math.pow(nh, 12 + gl * 70) * gl * SP * 255;
        const cav = h2[i] - h1[i];
        const ao = cav > 0 ? Math.max(0.45, 1 - cav * AO) : 1;
        const m = (AMB + KD * dif) / FLAT * ao;
        d[p] = Math.min(255, d[p] * m + s);
        d[p + 1] = Math.min(255, d[p + 1] * m + s);
        d[p + 2] = Math.min(255, d[p + 2] * m + s);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------- R6: объёмные иконки ----------
  // Картинка предмета — маленький «3D-рендер» по картам, а не плоская векторная заливка:
  //  1) геометрия (зависит только от модели, кэш LRU): каждая деталь растеризуется отдельно, по её ПОЛНОМУ
  //     контуру считается поле расстояний до края, высота = база + профиль(расстояние) — цилиндр, фаска,
  //     скругление, «подушка», спуск клинка, купол. Деталь, нарисованная позже, лежит выше (база — верх того,
  //     что под ней). Из карты высот — нормали, затенение впадин (AO) и мягкие тени от основного света;
  //     плюс карта «какая деталь сверху» (две верхние детали и доля покрытия — для мягких стыков);
  //  2) на скин: альбедо (раскраска, заводской материал, металл, камень), материалы и свет на пиксель;
  //  3) наклон и перспектива — один раз, обратным отображением с билинейной выборкой.
  // пикселей на единицу модели в рабочем исходнике и в итоговой картинке: самый крупный показ предмета
  // (окно выпадения, ~180 css px в высоту при DPR 2) получает ~1:1, карточки — с запасом
  // У ножей и перчаток картинка после наклона выше и шире — им хватает меньшей плотности (и рисуются они быстрее)
  const SS_DEF = 1.6, SS_TYPE = { knife: 1.3, gloves: 1.4 };
  const ssOf = (type) => SS_TYPE[type] || SS_DEF;
  // Как в инвентаре CS2, оружие в картинке предмета смотрит стволом (клинком) влево. Модели в js/geo_*.js
  // нарисованы стволом вправо, поэтому картинка отражается по горизонтали; надписи и узоры раскрасок
  // при этом отражаются ещё раз и читаются правильно. Свет задан в экранных координатах (сверху слева).
  const MIRROR = true;
  // наклон (градусы, ствол / клинок вверх-влево) и перспектива (масштаб дальнего конца к ближнему)
  const TILT = { rifle: 11, sniper: 10, smg: 10, shotgun: 10, mg: 10, pistol: 6, knife: 34, gloves: 0 };
  const PERSP = { gloves: 1 }, PERSP_DEF = 0.9;
  const typeOf = (weaponId) => (WEAPONS[weaponId] ? WEAPONS[weaponId].type : '');

  // Каменный скин: ножи, перчатки и всё от реликвии (r >= 7) и выше
  function isGem(skinId) {
    const s = SKINS[skinId];
    if (!s) return false;
    const t = typeOf(s.w);
    return t === 'knife' || t === 'gloves' || s.r >= 7;
  }
  // Описание камня (js/tex_gem.js) или null — тогда рисуется обычная раскраска
  function gemOf(skinId) {
    if (!isGem(skinId) || typeof Tex.gemOf !== 'function') return null;
    try { const g = Tex.gemOf(SKINS[skinId].f); return g && g.mat ? g : null; } catch (e) { return null; }
  }

  // Копии модели: обычное оружие — одна, пары — задняя (темнее) и передняя
  function instances(weaponId) {
    if (!geo(weaponId).pair) return [{ m: [1, 0, 0, 1, 0, 0], dim: 0 }];
    const M = pairMats(weaponId);
    return [{ m: M.back, dim: 0.22 }, { m: M.front, dim: 0 }];
  }

  // Форма детали по умолчанию (без подсказки в модели) — по роли, материалу и типу предмета
  const ROUND_MAT = { wood: 1, walnut: 1, birch: 1, redwood: 1, tan: 1, sand: 1, khaki: 1, coyote: 1, olive: 1, od: 1, sage: 1, black: 1, rubber: 1, bone: 1, green: 1 };
  const SOFT_MAT = { leather: 1, darkleather: 1, tanleather: 1, cloth: 1, neoprene: 1, wrap: 1, tape: 1 };
  function shapeOf(P, type) {
    const hn = P.hint || {}, r = P.role, w = P.bb.x1 - P.bb.x0, h = P.bb.y1 - P.bb.y0;
    let pr = 'slab', rad = 1.6, soft = 0;
    // перчатки: кожа и ткань — плоская «подушка» с широким плато (не надутые «сосиски»)
    if (type === 'gloves' && 'pqmlk'.indexOf(r) >= 0) { pr = 'pillow'; rad = 4.5; soft = 1.6; }
    else if (r === 'o' || r === 'g') pr = 'dome';
    else if (r === 's') pr = 'cyl';
    else if (r === 'm' || r === 'l') { if ((h < 20 && w > 3 * h) || (w < 20 && h > 3 * w)) pr = 'cyl'; else rad = 1.3; }
    else if (r === 'k') { pr = 'round'; rad = 3; }
    else if (P.mat && ROUND_MAT[P.mat]) { pr = 'round'; rad = 3.5; }
    else if (P.mat && SOFT_MAT[P.mat]) { pr = 'pillow'; rad = 5; soft = 1; }
    else if (type === 'knife' && !P.fixed && w > 2.2 * h) pr = 'blade';
    else if (r === 'q') rad = 1.3;
    return { pr: hn.pr || pr, r: hn.r || rad, h: hn.h || 0, soft: hn.soft != null ? hn.soft : hn.pr ? (hn.pr === 'pillow' && type === 'gloves' ? 0.8 : 0) : soft };
  }

  // Профиль высоты (единицы модели) по расстоянию до края du; md — наибольшее расстояние внутри детали
  function profile(sh, du, md) {
    let R, t;
    switch (sh.pr) {
      case 'cyl': R = Math.max(md, 0.5); t = Math.min(du, R); return Math.sqrt(t * (2 * R - t));
      case 'dome': R = Math.max(md, 0.5); t = Math.min(du, R); return 0.8 * Math.sqrt(t * (2 * R - t));
      case 'round': {
        R = Math.max(0.5, Math.min(md, sh.r)); t = Math.min(du, R);
        const b = 1 - Math.min(du / Math.max(md, 0.5), 1);
        return Math.sqrt(t * (2 * R - t)) + 0.4 * Math.min(md, 14) * (1 - b * b);
      }
      case 'pillow': R = Math.max(0.5, Math.min(md, sh.r)); t = 1 - Math.min(du, R) / R; return R * (0.62 - 0.12 * sh.soft) * (1 - t * t);
      case 'flat': return 0.35 * Math.min(du / 0.6, 1);
      default: {
        // slab: машинная фаска (четверть круга) + пологий выпуклый «бочок» по всей детали — свет ложится градиентом
        R = Math.max(0.4, Math.min(md, sh.r)); t = Math.min(du, R);
        const b = 1 - Math.min(du / Math.max(md, 0.5), 1);
        return Math.sqrt(t * (2 * R - t)) + 0.32 * Math.min(md, 14) * (1 - b * b);
      }
    }
  }

  // Точное евклидово расстояние (Felzenszwalb): f — 0 у «источников», INF у остальных; d — квадраты расстояний
  const INF = 1e20;
  function edt1(f, n, d, v, z) {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = q - v[k]; d[q] = r * r + f[v[k]]; }
  }
  // Квадрат расстояния от каждого пикселя внутри маски (a >= 0.5) до ближайшего пикселя снаружи
  let edtBuf = null;
  function edt2(a, w, h) {
    const n = Math.max(w, h) + 2;
    if (!edtBuf || edtBuf.n < n) edtBuf = { n: n, f: new Float64Array(n), d: new Float64Array(n), v: new Int32Array(n), z: new Float64Array(n + 1) };
    const B = edtBuf, g = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let any = false;
      for (let x = 0; x < w; x++) { const v = a[o + x] >= 128; B.f[x] = v ? INF : 0; any = any || v; }
      if (!any) continue;                    // в строке нет детали — расстояния нули

      edt1(B.f, w, B.d, B.v, B.z);
      for (let x = 0; x < w; x++) g[o + x] = B.d[x];
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) { const v = g[y * w + x]; B.f[y] = v >= 1e19 ? INF : v; }
      edt1(B.f, h, B.d, B.v, B.z);
      for (let y = 0; y < h; y++) g[y * w + x] = B.d[y];
    }
    return g;
  }

  // Холст для растеризации деталей (один на всё, читается часто — держим его в памяти процессора)
  let scr = null;
  function scratch(w, h) {
    if (!scr || scr.width < w || scr.height < h) {
      scr = document.createElement('canvas');
      scr.width = Math.max(w, scr ? scr.width : 0); scr.height = Math.max(h, scr ? scr.height : 0);
      scr.ctx = scr.getContext('2d', { willReadFrequently: true });
    }
    return scr.ctx;
  }
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  function pixBox(T, bb, pad, w, h) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x0, bb.y1], [bb.x1, bb.y1]].forEach((q) => {
      const p = apply(T, q[0], q[1]);
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    });
    const X0 = Math.max(0, Math.floor(x0 - pad)), Y0 = Math.max(0, Math.floor(y0 - pad));
    const X1 = Math.min(w, Math.ceil(x1 + pad)), Y1 = Math.min(h, Math.ceil(y1 + pad));
    return X1 > X0 && Y1 > Y0 ? { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 } : null;
  }
  // Рисует деталь белым в текущей матрице (заливка, линия, текст)
  function drawMask(x, P, col) {
    const r = P.role;
    x.fillStyle = x.strokeStyle = col || '#fff';
    if (r === 's') { x.lineWidth = P.w || 1; x.stroke(P.path); }
    else if (r === 'd' || r === 'h') { x.lineWidth = P.w || 1.2; x.stroke(P.path); }
    else if (r === 'e') { x.setLineDash([4, 3]); x.lineWidth = 1.1; x.stroke(P.path); x.setLineDash([]); }
    else if (r === 't') { x.font = '600 ' + P.size + 'px Arial, sans-serif'; textUpright(x, P, 0); }
    else if (r === 'o') x.fill(P.path);
    else x.fill(P.path, 'evenodd');
  }
  const FILL_ROLES = 'pqmlkgos';

  // Геометрия модели: высоты, «какая деталь сверху», нормали, AO и тени. Зависит только от модели.
  function buildGeom(weaponId) {
    const parts = prep(weaponId), type = typeOf(weaponId), inst = instances(weaponId), SS = ssOf(type);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    inst.forEach((I) => parts.forEach((P) => {
      if (P.role === 't') return;
      [[P.bb.x0, P.bb.y0], [P.bb.x1, P.bb.y0], [P.bb.x0, P.bb.y1], [P.bb.x1, P.bb.y1]].forEach((q) => {
        const p = apply(I.m, q[0], q[1]);
        x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
      });
    }));
    const PAD = 6;
    const bx0 = Math.floor(x0) - PAD, by0 = Math.floor(y0) - PAD, bx1 = Math.ceil(x1) + PAD, by1 = Math.ceil(y1) + PAD;
    const w = Math.round((bx1 - bx0) * SS), h = Math.round((by1 - by0) * SS), n = w * h;
    // отражение (MIRROR) — уже здесь: дальше всё в экранной ориентации
    const tf = MIRROR ? [-SS, 0, 0, SS, bx1 * SS, -by0 * SS] : [SS, 0, 0, SS, -bx0 * SS, -by0 * SS];
    const H = new Float32Array(n), cov = new Float32Array(n), tint = new Float32Array(n).fill(1);
    const top = new Uint16Array(n), under = new Uint16Array(n), at = new Float32Array(n);
    const recs = [null];
    let etx = null;   // доля тона надписей (1 — нет надписи)
    const sx = scratch(w, h);
    sx.lineCap = 'round'; sx.lineJoin = 'round';
    const raster = (T, pb, list) => {
      sx.setTransform(1, 0, 0, 1, 0, 0);
      sx.globalCompositeOperation = 'source-over';
      sx.clearRect(pb.x, pb.y, pb.w, pb.h);
      sx.setTransform(T[0], T[1], T[2], T[3], T[4], T[5]);
      if (list.length > 1 || list[0].role === 'd' || list[0].role === 'h' || list[0].role === 'e' || list[0].role === 't') {
        sx.globalCompositeOperation = 'lighter';
        list.forEach((P) => drawMask(sx, P, P.role === 'h' ? '#0f0' : P.role === 'e' ? '#00f' : '#f00'));
      } else drawMask(sx, list[0]);
      sx.globalCompositeOperation = 'source-over';
      return sx.getImageData(pb.x, pb.y, pb.w, pb.h).data;
    };
    inst.forEach((I, copy) => {
      const T = mmul(tf, I.m);
      let lines = [];
      const flushLines = (txt) => {
        if (!lines.length) return;
        let pb = null;
        lines.forEach((P) => {
          const b = pixBox(T, P.bb, ((P.w || 1.2) + (P.size || 0)) * SS + 3, w, h);
          if (!b) return;
          if (!pb) pb = b;
          else {
            const X1 = Math.max(pb.x + pb.w, b.x + b.w), Y1 = Math.max(pb.y + pb.h, b.y + b.h);
            pb.x = Math.min(pb.x, b.x); pb.y = Math.min(pb.y, b.y); pb.w = X1 - pb.x; pb.h = Y1 - pb.y;
          }
        });
        if (pb) applyLines(raster(T, pb, lines), pb, txt);
        lines = [];
      };
      const applyLines = (d, pb, txt) => {
        if (txt && !etx) etx = new Float32Array(n).fill(1);
        for (let y = 0; y < pb.h; y++) {
          for (let x = 0; x < pb.w; x++) {
            const p = (y * pb.w + x) * 4, gi = (pb.y + y) * w + pb.x + x;
            if (cov[gi] <= 0 || !(d[p] | d[p + 1] | d[p + 2])) continue;
            const r = d[p] / 255, g = d[p + 1] / 255, b = d[p + 2] / 255;
            H[gi] += 0.45 * g + 0.3 * b - 0.6 * r;
            const k = (1 - 0.32 * r) * (1 + 0.1 * g) * (1 + 0.2 * b);
            tint[gi] *= k;
            if (txt) etx[gi] *= k;
          }
        }
      };
      parts.forEach((P) => {
        // надписи (гравировка): на ножах и перчатках не рисуются вовсе (они всегда каменные — на камне гравировки нет);
        // у остального оружия — отдельно, чтобы на каменном скине свет мог погасить их тон
        if (P.role === 't') {
          if (type === 'knife' || type === 'gloves') return;
          flushLines(); lines.push(P); flushLines(true); return;
        }
        if (FILL_ROLES.indexOf(P.role) < 0) { lines.push(P); return; }
        flushLines();
        const id = recs.length, sh = shapeOf(P, type);
        recs.push({ P: P, copy: copy, dim: I.dim, sh: sh });
        const pb = pixBox(T, P.bb, (P.w || 0) * SS / 2 + 3, w, h);
        if (pb) fillPart(raster(T, pb, [P]), pb, id, sh);
      });
      flushLines();
    });

    function fillPart(d, pb, id, sh) {
      const pw = pb.w, ph = pb.h, m = pw * ph, A = new Uint8Array(m);
      for (let i = 0; i < m; i++) A[i] = d[i * 4 + 3];
      const g = edt2(A, pw, ph);
      let md = 0, mb = 0;
      for (let y = 0; y < ph; y++) {
        for (let x = 0, i = y * pw, gi = (pb.y + y) * w + pb.x; x < pw; x++, i++, gi++) {
          if (A[i] < 128) continue;
          const du = (Math.sqrt(g[i]) - 0.5) / SS;
          g[i] = du;
          if (du > md) md = du;
          if (H[gi] > mb) mb = H[gi];
        }
      }
      const base = mb + sh.h;
      // клинок: спуск от обуха (верх) к режущей кромке (низ) по столбцам
      let topY = null, botY = null, Hs = 0;
      if (sh.pr === 'blade') {
        topY = new Int32Array(pw).fill(-1); botY = new Int32Array(pw).fill(-1);
        for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (A[y * pw + x] >= 128) { if (topY[x] < 0) topY[x] = y; botY[x] = y; }
        Hs = Math.min(md, 6) * 1.1 + 0.6;
      }
      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) {
          const i = y * pw + x, av = A[i];
          if (!av) continue;
          const a = av / 255, du = av >= 128 ? g[i] : 0, gi = (pb.y + y) * w + pb.x + x;
          let hp;
          if (topY) {
            const v = (botY[x] - y) / Math.max(1, botY[x] - topY[x]);
            const R = 1.2, t = Math.min(du, R);
            hp = Math.min(Hs * (0.1 + 0.9 * Math.min(1, v / 0.62)), Hs * Math.sqrt(t * (2 * R - t)) / R);
          } else hp = profile(sh, du, md);
          H[gi] = H[gi] * (1 - a) + (base + hp) * a;
          cov[gi] = 1 - (1 - cov[gi]) * (1 - a);
          if (a >= 0.996) { top[gi] = under[gi] = id; at[gi] = 1; }
          else if (a > 0.004) { under[gi] = at[gi] >= 0.5 ? top[gi] : under[gi]; top[gi] = id; at[gi] = a; }
        }
      }
    }
    return finishGeom({ id: weaponId, ss: SS, w: w, h: h, tf: tf, box: { x0: bx0, y0: by0, x1: bx1, y1: by1 }, recs: recs, type: type },
      H, cov, tint, top, under, at, etx);
  }

  // Плёнка раскраски лежит на поле модели W×H; при отражении — ещё раз отражена (как drawFilm): x плёнки = ox + X·S/SS
  const filmX0 = (G) => (MIRROR ? (W - G.box.x1) * S : G.box.x0 * S);

  // 3×3 матрицы (по строкам) для наклона и перспективы
  const m3 = (A, B) => {
    const C = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    return C;
  };
  function inv3(m) {
    const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
      C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }
  const proj = (M, x, y) => { const w = M[6] * x + M[7] * y + M[8]; return [(M[0] * x + M[1] * y + M[2]) / w, (M[3] * x + M[4] * y + M[5]) / w]; };

  // Свет (экранные направления «к источнику», y вниз): основной сверху-слева-спереди, заполняющий справа
  const LKEY = unit([-0.4, -0.78, 0.48]), LFIL = unit([0.85, -0.12, 0.5]), UPV = [0, -1];
  // «Студия» для отражений: софтбокс сверху-слева и малый справа (направления, куда смотрит отражённый луч)
  const ENV_SB = unit([-0.36, -0.66, 0.66]), ENV_SF = unit([0.8, -0.25, 0.55]);
  // Поля итоговой картинки вокруг силуэта (единицы модели): снизу — место под контактную тень
  const MARG = { l: 5, r: 5, t: 4, b: 12 };

  function finishGeom(G, H, cov, tint, top, under, at, etx) {
    const w = G.w, h = G.h, SS = G.ss;
    // силуэт: крайние пиксели строк — по ним рамка после поворота и перспективы
    let cx = 0, cy = 0, cn = 0, xl = 1e9, xr = -1e9;
    const rowL = new Int32Array(h).fill(-1), rowR = new Int32Array(h).fill(-1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = cov[y * w + x];
        if (c < 0.02) continue;
        if (rowL[y] < 0) rowL[y] = x;
        rowR[y] = x;
        cx += x * c; cy += y * c; cn += c;
      }
      if (rowL[y] >= 0) { xl = Math.min(xl, rowL[y]); xr = Math.max(xr, rowR[y] + 1); }
    }
    cx /= cn || 1; cy /= cn || 1;
    // перспектива: левый (дальний) конец — PERSP от правого; поворот на TILT вокруг центра масс
    const P = PERSP[G.type] || PERSP_DEF, L = Math.max(1, (xr - xl) / 2), k = (MIRROR ? 1 : -1) * (P - 1) / (P + 1);
    const Pm = [1 + cx * k / L, 0, -cx * cx * k / L, cy * k / L, 1, -cy * cx * k / L, k / L, 0, 1 - k * cx / L];
    const th = (TILT[G.type] || 0) * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
    const Rm = m3(m3([1, 0, cx, 0, 1, cy, 0, 0, 1], [cs, -sn, 0, sn, cs, 0, 0, 0, 1]), [1, 0, -cx, 0, 1, -cy, 0, 0, 1]);
    let F = m3(Rm, Pm);
    let ox0 = 1e9, oy0 = 1e9, ox1 = -1e9, oy1 = -1e9;
    for (let y = 0; y < h; y++) {
      if (rowL[y] < 0) continue;
      [[rowL[y], y], [rowL[y], y + 1], [rowR[y] + 1, y], [rowR[y] + 1, y + 1]].forEach((q) => {
        const p = proj(F, q[0], q[1]);
        ox0 = Math.min(ox0, p[0]); oy0 = Math.min(oy0, p[1]); ox1 = Math.max(ox1, p[0]); oy1 = Math.max(oy1, p[1]);
      });
    }
    // целые сдвиги: слой износа совпадает с предметом пиксель в пиксель
    const tx = Math.round(MARG.l * SS - ox0), ty = Math.round(MARG.t * SS - oy0);
    F = m3([1, 0, tx, 0, 1, ty, 0, 0, 1], F);
    G.F = F; G.Fi = inv3(F);
    G.ow = Math.ceil(ox1 + tx + MARG.r * SS); G.oh = Math.ceil(oy1 + ty + MARG.b * SS);
    // свет в координатах исходника: экранные направления, повёрнутые обратно на угол наклона
    const rot = (v) => [cs * v[0] + sn * v[1], -sn * v[0] + cs * v[1], v[2]];
    const lk = rot(LKEY), lf = rot(LFIL), up = rot([UPV[0], UPV[1], 0]);
    G.lk = lk; G.lf = lf; G.up = up; G.sb = rot(ENV_SB); G.sf = rot(ENV_SF);
    G.hk = unit([lk[0], lk[1], lk[2] + 1]); G.hf = unit([lf[0], lf[1], lf[2] + 1]);

    // нормали — по слегка сглаженной карте высот; AO — по разнице с размытыми высотами
    // AO: ближний масштаб — размытие на полном разрешении, дальний — на сетке в 4 раза мельче
    const r1 = Math.max(1, Math.round(1.5 * SS));
    const B1 = blur(H, w, h, r1 + 1);
    const sw = Math.ceil(w / 4), shh = Math.ceil(h / 4), Hs = new Float32Array(sw * shh);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) Hs[(y >> 2) * sw + (x >> 2)] += H[y * w + x] / 16;
    const r2 = Math.max(1, Math.round(1.25 * SS)), B2 = blur(blur(Hs, sw, shh, r2), sw, shh, r2);
    let m = 0;
    for (let i = 0; i < w * h; i++) if (cov[i] >= 0.004) m++;
    const idx = new Int32Array(m), nrm = new Int16Array(m * 3), lit = new Uint8Array(m * 4);
    const et8 = etx ? new Uint8Array(m) : null;
    const cv8 = new Uint8Array(m), at8 = new Uint8Array(m), tn8 = new Uint8Array(m), top16 = new Uint16Array(m), und16 = new Uint16Array(m);
    const lh = Math.hypot(lk[0], lk[1]), ux = lk[0] / lh, uy = lk[1] / lh, tanE = lk[2] / lh;
    const U = unit([up[0], up[1], 0.4]);
    let j = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cov[i] < 0.004) continue;
        // градиент высот (Собель — заодно сглаживает ступеньки растра)
        let gx = 0, gy = 0;
        if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
          gx = (2 * (H[i + 1] - H[i - 1]) + H[i - w + 1] - H[i - w - 1] + H[i + w + 1] - H[i + w - 1]) * 0.125 * SS;
          gy = (2 * (H[i + w] - H[i - w]) + H[i + w - 1] - H[i - w - 1] + H[i + w + 1] - H[i - w + 1]) * 0.125 * SS;
        }
        const il = 1 / Math.sqrt(gx * gx + gy * gy + 1), nx = -gx * il, ny = -gy * il, nz = il;
        // мягкая тень: шаги к основному свету по карте высот
        let occ = 0;
        for (let s = 1; s <= 6; s++) {
          const t = s * 1.7, X = (x + ux * t * SS + 0.5) | 0, Y = (y + uy * t * SS + 0.5) | 0;
          if (X < 0 || Y < 0 || X >= w || Y >= h) break;
          const dh = H[Y * w + X] - H[i] - t * tanE;
          if (dh > 0) { const o = Math.min(1, dh / 1.4) * (1 - 0.07 * s); if (o > occ) occ = o; }
        }
        const qx = Math.min(sw - 1.001, Math.max(0, x / 4 - 0.375)), qy = Math.min(shh - 1.001, Math.max(0, y / 4 - 0.375));
        const qi = (qy | 0) * sw + (qx | 0), fx = qx - (qx | 0), fy = qy - (qy | 0);
        const b2 = (B2[qi] * (1 - fx) + B2[qi + 1] * fx) * (1 - fy) + (B2[qi + sw] * (1 - fx) + B2[qi + sw + 1] * fx) * fy;
        const c1 = B1[i] - H[i], c2 = b2 - H[i];
        const ao = Math.max(0.3, Math.min(1, 1 - 0.22 * Math.max(0, c1) - 0.06 * Math.max(0, c2)));
        const fd = Math.max(0, nx * lf[0] + ny * lf[1] + nz * lf[2]);
        const hemi = 0.5 + 0.5 * (nx * U[0] + ny * U[1] + nz * U[2]);
        idx[j] = i;
        nrm[j * 3] = nx * 32767; nrm[j * 3 + 1] = ny * 32767; nrm[j * 3 + 2] = nz * 32767;
        lit[j * 4] = (1 - 0.72 * occ) * 255; lit[j * 4 + 1] = fd * 255; lit[j * 4 + 2] = hemi * ao * 255; lit[j * 4 + 3] = ao * 255;
        cv8[j] = Math.round(cov[i] * 255); at8[j] = Math.round(at[i] * 255); tn8[j] = Math.min(255, Math.round(tint[i] * 100));
        top16[j] = top[i]; und16[j] = under[i];
        if (et8) et8[j] = Math.max(1, Math.min(255, Math.round(etx[i] * 100)));
        j++;
      }
    }
    Object.assign(G, { m: m, idx: idx, nrm: nrm, lit: lit, cov: cv8, at: at8, tint: tn8, top: top16, under: und16, etx: et8 });
    return G;
  }

  // ---------- Материалы на скин ----------
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) LIN[i] = Math.pow(i / 255, 2.2);
  const hexLin = (hx) => { const v = parseInt(hx.slice(1), 16); return [LIN[(v >> 16) & 255], LIN[(v >> 8) & 255], LIN[v & 255]]; };
  // линейный цвет → sRGB с мягким «плечом» вместо пересветов
  const OUT = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) {
    const x = i / 4095 * 2, t = x < 0.72 ? x : 0.72 + 0.28 * (1 - Math.exp(-(x - 0.72) / 0.28));
    OUT[i] = Math.round(255 * Math.pow(Math.min(1, t), 1 / 2.2));
  }
  const toOut = (v) => OUT[v <= 0 ? 0 : v >= 2 ? 4095 : (v * 2047.5) | 0];
  // Пиксели текстур (несколько последних): раскраски, камни, дерево
  const PIX = new Map();
  function pixOf(key, cv) {
    let p = PIX.get(key);
    if (p && p.cv === cv) { PIX.delete(key); PIX.set(key, p); return p; }
    // копия в свой холст «для чтения» (холсты текстур живут в видеопамяти — частые getImageData с них медленные)
    const rd = scratch(cv.width, cv.height), c = rd.canvas;
    rd.setTransform(1, 0, 0, 1, 0, 0);
    rd.globalCompositeOperation = 'copy';
    rd.drawImage(cv, 0, 0);
    rd.globalCompositeOperation = 'source-over';
    p = { cv: cv, d: rd.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
    if (c.width > cv.width || c.height > cv.height) rd.clearRect(0, 0, c.width, c.height);
    PIX.set(key, p);
    if (PIX.size > 14) PIX.delete(PIX.keys().next().value);
    return p;
  }
  // Материалы деталей без раскраски: цвет (sRGB), шероховатость, металличность, лак, мелкая фактура
  const ROLE_MAT = {
    m: { col: '#4d535b', rough: 0.36, metal: 0.85, noise: 2 },     // воронёный металл (риски шлифовки)
    l: { col: '#cdd3da', rough: 0.22, metal: 1, noise: 2 },       // светлая сталь
    k: { col: '#2f3237', rough: 0.58, metal: 0, noise: 1 },       // чёрный полимер
    g: { col: '#1a2a58', rough: 0.04, metal: 0, clear: 1 },       // стекло прицела
    o: { col: '#a2aab4', rough: 0.3, metal: 1 },                  // винт, заклёпка
    s: { col: '#26292e', rough: 0.6, metal: 0, noise: 1 },        // тяж, ремень
  };
  const FACT_METAL = { l: { col: '#c6ccd4', rough: 0.2, metal: 1, noise: 2 }, m: { col: '#50565e', rough: 0.34, metal: 0.85, noise: 2 } };
  function mkMat(o, mul) {
    return { pix: o.pix || null, col: o.col ? hexLin(o.col) : [0.2, 0.2, 0.2], mul: mul, noise: o.noise || 0, rough: o.rough, metal: o.metal || 0,
      clear: o.clear || 0, gem: o.gem || 0, glow: o.glow || 0, sparkle: o.sparkle || 0, soft: 0, cut: 0 };
  }
  function matsFor(G, skinId) {
    const s = SKINS[skinId], fin = FINISHES[s.f] || null, gm = gemOf(skinId), gloves = G.type === 'gloves';
    const gloss = fin ? fin.gloss || 0 : 0;
    // текстуры — лениво: у каменного ножа раскраска не нужна вовсе (её генерация и чтение — самое дорогое)
    let paintTex = null, gemTex = null, dyeTex = null;
    const paint = () => paintTex || (paintTex = fin ? pixOf('f:' + s.f, Tex.get(s.f)) : null);
    const stone = () => gemTex || (gemTex = pixOf('gem:' + s.f, Tex.make('gem:' + s.f, gm)));
    const dye = () => dyeTex || (dyeTex = pixOf('dye:' + s.f, Tex.make('dye:' + s.f, { kind: 'gem_dye', c: gm.dye })));
    // грани в альбедо уже нарисованы (огранённые камни) — свет берёт наклон граней из самой текстуры
    const cut = gm && (gm.kind === 'gem_cut' || gm.kind === 'gem_noir') ? (gm.kind === 'gem_noir' ? 2 : 1) : 0;
    return G.recs.map((R) => {
      if (!R) return null;
      const P = R.P, r = P.role;
      let mul = 1 - R.dim;
      if (r === 'q') mul *= 0.7;
      if (r !== 'p' && r !== 'q') return mkMat(ROLE_MAT[r] || ROLE_MAT.m, mul);
      // камень — раньше заводских материалов: у «Заводской окраски» ножей и перчаток тоже есть камень (халцедон).
      // Своим материалом остаются только детали с собственным материалом (рукояти, гарды — P.fixed),
      // у перчаток камнем становятся детали с подсказкой gem: 1 (даже если они «своим материалом»)
      if (gm && ((P.hint && P.hint.gem) || (!gloves && !P.fixed))) {
        const t = gm.mat;
        const M = mkMat({ pix: stone(), rough: t.rough != null ? t.rough : 0.1, metal: t.metal, clear: t.clear, gem: t.gem, glow: t.glow, sparkle: t.sparkle }, mul);
        M.cut = cut;
        return M;
      }
      const fm = factoryOf(P, fin);
      if (fm) {
        if (fm.metal) return mkMat(FACT_METAL[fm.metal], mul);
        const M = mkMat({ pix: fm.tex ? pixOf('fact:' + P.mat, Tex.make('fact:' + P.mat, fm.tex)) : null, col: fm.col || '#6a7078',
          rough: 0.78 - 0.62 * fm.gloss, clear: fm.tex ? 0.45 : 0, noise: fm.tex ? 0 : 1, metal: P.mat === 'gray' ? 0.75 : 0 }, mul);
        if (SOFT_MAT[P.mat]) { M.rough = Math.max(M.rough, 0.6); M.soft = 1; }
        return M;
      }
      if (gm && gloves && gm.dye) return Object.assign(mkMat({ pix: dye(), rough: 0.62, noise: 1 }, mul), { soft: 1 });
      if (!fin) return mkMat(ROLE_MAT.m, mul);
      if (fin.kind === 'metal') return mkMat({ pix: paint(), rough: 0.3 - 0.14 * gloss, metal: 0.9 }, mul);
      if (fin.factory) return G.type === 'knife' ? mkMat(FACT_METAL.l, mul) : mkMat({ pix: paint(), rough: 0.4, metal: 0.6, noise: 2 }, mul);
      const M = mkMat({ pix: paint(), rough: (gloves ? 0.78 : 0.7) - 0.5 * gloss, clear: gloves ? 0 : Math.max(0, gloss - 0.5) * 1.6 }, mul);
      if (gloves) M.soft = 1;
      return M;
    });
  }

  // ---------- Свет на пиксель ----------
  const hsh = (a, b, s) => {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const BR = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) BR[i] = hsh(i, 7, 11);
  // «огонь» камня — радужные оттенки бликов граней
  const FIRE = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const hh = i / 256 * 6, k = (n) => { const x = (n + hh) % 6; return Math.max(0, Math.min(1, Math.min(x, 4 - x))); };
    FIRE[i * 3] = k(5); FIRE[i * 3 + 1] = k(3); FIRE[i * 3 + 2] = k(1);
  }

  // Грани камня, у которого граней нет в альбедо: крупные ячейки Вороного в координатах модели (одна грань
  // света ≈ одна грань камня) — наклон нормали, рёбра, оттенок «огня» (кэш на модель). Огранённым камням
  // (gem_cut, gem_noir) не нужны: у них наклон граней берётся из самой текстуры (см. shade).
  function facetsOf(G) {
    if (G.fac) return G.fac;
    const SS = G.ss;
    const C = G.type === 'knife' || G.type === 'gloves' ? 14 : 16;   // размер грани, единицы модели
    const m = G.m, tx = new Int8Array(m), ty = new Int8Array(m), ed = new Uint8Array(m), hu = new Uint8Array(m);
    for (let j = 0; j < m; j++) {
      const i = G.idx[j], u = (i % G.w) / SS / C, v = ((i / G.w) | 0) / SS / C;
      const ci = Math.floor(u), cj = Math.floor(v);
      let d1 = 1e9, d2 = 1e9, bi = 0, bj = 0;
      for (let b = -1; b <= 1; b++) {
        for (let a = -1; a <= 1; a++) {
          const qi = ci + a, qj = cj + b;
          const px = qi + 0.12 + 0.76 * hsh(qi, qj, 1), py = qj + 0.12 + 0.76 * hsh(qi, qj, 2);
          const d = (px - u) * (px - u) + (py - v) * (py - v);
          if (d < d1) { d2 = d1; d1 = d; bi = qi; bj = qj; } else if (d < d2) d2 = d;
        }
      }
      const ang = hsh(bi, bj, 3) * 6.2832, mg = 0.25 + 0.6 * hsh(bi, bj, 4);
      tx[j] = Math.round(Math.cos(ang) * mg * 127); ty[j] = Math.round(Math.sin(ang) * mg * 127);
      ed[j] = Math.min(255, Math.round((Math.sqrt(d2) - Math.sqrt(d1)) * C * 100));
      hu[j] = Math.floor(hsh(bi, bj, 5) * 255);
    }
    G.fac = { tx: tx, ty: ty, ed: ed, hu: hu };
    return G.fac;
  }

  // Таблицы по шероховатости (0..255): степень блика, нормировка, порог «блик ничтожен», резкость софтбокса
  const RE = new Float32Array(256), REN = new Float32Array(256), RTH = new Float32Array(256), RSH = new Float32Array(256), RST = new Float32Array(256), RSF = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const r = i / 255, al = Math.max(0.03, r * r), e = Math.min(3000, 2 / (al * al) - 2), rs = 1 - r, sh = 3 + 80 * rs * rs;
    RE[i] = e; REN[i] = Math.min(60, (e + 2) / 8); RTH[i] = Math.exp(-9.2 / e);
    RSH[i] = sh; RST[i] = Math.exp(-9.2 / sh); RSF[i] = Math.exp(-9.2 / (sh * 0.7));
  }

  // Освещённая картинка в координатах исходника (RGBA, умноженный на альфу) + места для искр
  function shade(G, mats) {
    const w = G.w, m = G.m, out = new Uint8ClampedArray(w * G.h * 4), SS = G.ss;
    const fs = S / SS, ox = filmX0(G), oy = G.box.y0 * S;
    const lk = G.lk, lf = G.lf, hk = G.hk, hf = G.hf, sb = G.sb, sf = G.sf, up = G.up;
    const nrm = G.nrm, lit = G.lit, idx = G.idx, topA = G.top, undA = G.under, atA = G.at, tnA = G.tint, cvA = G.cov, etA = G.etx;
    // крупные грани Вороного — только камням без граней в альбедо и с заметной огранкой
    let anyFac = false;
    mats.forEach((M) => { if (M && M.gem >= 0.5 && !M.cut) anyFac = true; });
    const fac = anyFac ? facetsOf(G) : null;
    // направление к основному свету в плоскости картинки: обод Френеля светится только с его стороны
    const lkh = Math.hypot(lk[0], lk[1]) || 1, lkx = lk[0] / lkh, lky = lk[1] / lkh;
    const cand = [];
    const A = new Float32Array(6);
    const sample = (M, X, Y, k) => {
      if (M.pix) {
        const p = M.pix;
        let fx = ((ox + X * fs) | 0) % p.w, fy = ((oy + Y * fs) | 0) % p.h;
        if (fx < 0) fx += p.w;
        if (fy < 0) fy += p.h;
        const q = (fy * p.w + fx) * 4;
        A[k] = LIN[p.d[q]]; A[k + 1] = LIN[p.d[q + 1]]; A[k + 2] = LIN[p.d[q + 2]];
      } else { A[k] = M.col[0]; A[k + 1] = M.col[1]; A[k + 2] = M.col[2]; }
      let f = M.mul;
      if (M.noise === 1) f *= 0.93 + 0.14 * hsh(X, Y, 9);
      else if (M.noise === 2) f *= 0.88 + 0.2 * BR[(Y + (X >> 6) * 131) & 1023] + 0.05 * hsh(X, Y, 3);
      A[k] *= f; A[k + 1] *= f; A[k + 2] *= f;
    };
    // Наклон грани огранённого камня — по градиенту яркости альбедо: грани-«пирамидки» в текстуре светлеют
    // от вершины к ребру, градиент смотрит наружу грани — это и есть её наклон. Грани света совпадают с гранями камня.
    let GX = 0, GY = 0;
    const lum = (p, x, y) => { const q = (y * p.w + x) * 4; return p.d[q] * 0.3 + p.d[q + 1] * 0.59 + p.d[q + 2] * 0.11; };
    const slope = (M, X, Y) => {
      const p = M.pix, d = 3;
      let fx = ((ox + X * fs) | 0) % p.w, fy = ((oy + Y * fs) | 0) % p.h;
      if (fx < 0) fx += p.w;
      if (fy < 0) fy += p.h;
      const xl = fx >= d ? fx - d : fx - d + p.w, xr = fx + d < p.w ? fx + d : fx + d - p.w;
      const yt = fy >= d ? fy - d : fy - d + p.h, yb = fy + d < p.h ? fy + d : fy + d - p.h;
      GX = lum(p, xr, fy) - lum(p, xl, fy); GY = lum(p, fx, yb) - lum(p, fx, yt);
    };
    for (let j = 0; j < m; j++) {
      const i = idx[j], X = i % w, Y = (i / w) | 0;
      const t = mats[topA[j]] || mats[1], uid = undA[j], a = atA[j] / 255;
      sample(t, X, Y, 0);
      let rough = t.rough, metal = t.metal, clear = t.clear, gem = t.gem, glow = t.glow, soft = t.soft, ks = t.cut;
      let mc = t.cut && t.pix ? t : null;
      if (uid && uid !== topA[j] && a < 0.999 && mats[uid]) {
        const u = mats[uid], b = 1 - a;
        sample(u, X, Y, 3);
        A[0] = A[0] * a + A[3] * b; A[1] = A[1] * a + A[4] * b; A[2] = A[2] * a + A[5] * b;
        rough = rough * a + u.rough * b; metal = metal * a + u.metal * b; clear = clear * a + u.clear * b;
        gem = gem * a + u.gem * b; glow = glow * a + u.glow * b; soft = soft * a + u.soft * b;
        if (!mc && u.cut && u.pix) { mc = u; ks = u.cut; }
      }
      // тон надписей гасится на камне (гравировки на камне не бывает)
      let tn = tnA[j] / 100;
      if (etA && gem > 0) tn *= 100 / etA[j];
      const noir = ks === 2 ? 1 : 0;
      // чёрная звезда: тело почти чёрное — средние тона граней приглушены, белые рёбра альбедо остаются резкими
      let dk = tn;
      if (noir) { const l0 = Math.min(1, (0.2126 * A[0] + 0.7152 * A[1] + 0.0722 * A[2]) / 0.5); dk *= 0.22 + 0.78 * l0 * l0 * l0; }
      const ar = A[0] * dk, ag = A[1] * dk, ab = A[2] * dk;
      const la = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
      let nx = nrm[j * 3] / 32767, ny = nrm[j * 3 + 1] / 32767, nz = nrm[j * 3 + 2] / 32767;
      const nz0 = nz;
      // обращённость края к свету (по плоскости картинки): 1 — сверху-слева, 0 — снизу-справа
      const nxy = Math.sqrt(nx * nx + ny * ny), fc = nxy > 1e-4 ? 0.5 + 0.5 * (nx * lkx + ny * lky) / nxy : 0.5;
      const rimW = 0.08 + 0.92 * fc * fc;
      let edge = 0, fh = -1;
      if (gem > 0) {
        if (mc) {
          slope(mc, X, Y);
          const gl = Math.sqrt(GX * GX + GY * GY), k = gem * 0.42 / (gl + (noir ? 3 : 6));   // у тёмного камня перепады яркости малы — наклон по направлению
          nx += GX * k; ny += GY * k;
          if (gl > 4) fh = ((Math.atan2(GY, GX) + 3.1416) * 40.7) & 255;
        } else if (fac && gem >= 0.5) {
          nx += gem * fac.tx[j] / 127 * 0.45; ny += gem * fac.ty[j] / 127 * 0.45;
          // тонкие рёбра — только у прозрачных огранённых (gem ≥ 0.7)
          if (gem >= 0.7 && fac.ed[j] < 22) edge = (1 - fac.ed[j] / 22) * (gem - 0.6) * 1.2;
          fh = fac.hu[j];
        }
        const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= l; ny *= l; nz *= l;
      }
      const shd = lit[j * 4] / 255, hemi = lit[j * 4 + 2] / 255, ao = lit[j * 4 + 3] / 255;
      const nl = nx * lk[0] + ny * lk[1] + nz * lk[2], kd = (nl > 0 ? nl : 0) * shd;
      const nf = nx * lf[0] + ny * lf[1] + nz * lf[2], fd = nf > 0 ? nf : 0;
      // рассеянный: основной + заполняющий + полусфера (сверху светлее), металл почти не рассеивает
      const dm = (1 - metal) * (1.15 * kd + 0.25 * fd + 0.32 * hemi);
      let r = ar * dm, g = ag * dm, b = ab * dm;
      // блики по шероховатости (Блинн с нормировкой); кожа и ткань — мягче и слабее
      const ri = rough <= 0 ? 0 : rough >= 1 ? 255 : (rough * 255) | 0, e = RE[ri], en = REN[ri], th = RTH[ri];
      const sw = 1 - 0.55 * soft;
      const nhk = nx * hk[0] + ny * hk[1] + nz * hk[2], nhf = nx * hf[0] + ny * hf[1] + nz * hf[2];
      const sk = nhk > th ? Math.pow(nhk, e) * en * kd * sw : 0, sfl = nhf > th ? Math.pow(nhf, e) * en * fd * 0.35 * sw : 0;
      // отражение «студии»: пол тёмный, небо светлее, полоса горизонта, софтбоксы
      const rx = 2 * nz * nx, ry = 2 * nz * ny, rz = 2 * nz * nz - 1;
      const yu = rx * up[0] + ry * up[1], rs = 1 - rough;
      const sharp = RSH[ri], bw = 0.08 + 0.4 * rough, hb = (yu + 0.05) / bw;
      const ds = rx * sb[0] + ry * sb[1] + rz * sb[2], df = rx * sf[0] + ry * sf[1] + rz * sf[2];
      const side = 1 - (rz > 0 ? rz : 0);
      const sky = Math.max(0, Math.min(1, 0.5 + 0.8 * yu));
      let env = 0.07 + 0.38 * sky * sky * (0.6 + 0.4 * rs) + 0.12 * sky + 0.55 * Math.exp(-hb * hb) * side * side + (ds > 0 ? 0.25 * ds * ds : 0) +
        (ds > RST[ri] ? 3.4 * Math.pow(ds, sharp) * (0.3 + 0.7 * rs) : 0) + (df > RSF[ri] ? 0.6 * Math.pow(df, sharp * 0.7) * (0.35 + 0.65 * rs) : 0);
      env *= ao;
      // огранённый камень: отражение «студии» ограничено яркостью альбедо (тёмный камень не сереет); чёрная звезда — ещё темнее
      if (ks) env *= noir ? 0.3 : 0.5 + 0.5 * Math.min(1, la * 4);
      const om = 1 - (nz > 0 ? nz : 0), om2 = om * om, fres0 = om2 * om2 * om;
      // обод Френеля: яркий со стороны света, почти нет снизу-справа; у краски и полимера слабее, у кожи и ткани — едва
      const paintK = metal < 0.5 && gem <= 0 ? 0.52 - 0.32 * soft : 1;
      const fres = fres0 * rimW * paintK, fresM = fres0 * (0.3 + 0.7 * rimW);
      // металл — блик и отражение цвета металла; краска и полимер — белый блик по Френелю
      const fd0 = (0.04 + 0.96 * fres) * (1 - metal) * (0.25 + 0.75 * rs * rs), spec = sk + sfl;
      const mr = metal * (ar + (1 - ar) * fresM), mg = metal * (ag + (1 - ag) * fresM), mb = metal * (ab + (1 - ab) * fresM);
      // «огонь» камня — лёгкий радужный оттенок только в самом блике и не на тёмном альбедо
      let fr = 1, fg = 1, fb = 1;
      if (fh >= 0 && spec > 0.4) {
        const kf = 0.15 * gem * Math.min(1, la * 8) * Math.min(1, (spec - 0.4) * 2), q = fh * 3;
        fr = 1 - kf + kf * FIRE[q] * 1.6; fg = 1 - kf + kf * FIRE[q + 1] * 1.6; fb = 1 - kf + kf * FIRE[q + 2] * 1.6;
      }
      r += spec * (mr + fd0) * fr + env * (mr + fd0); g += spec * (mg + fd0) * fg + env * (mg + fd0); b += spec * (mb + fd0) * fb + env * (mb + fd0);
      // лак: второй острый блик и чёткое отражение софтбокса (у огранённых камней — уже: блик ловят 1–2 грани)
      if (clear > 0) {
        // огранённый камень отражает сильнее лака (у алмаза R0 ≈ 0,17)
        const fc2 = ((ks ? 0.17 : 0.04) + 0.96 * fres) * clear;
        const p9 = nhk > 0.99 ? Math.pow(nhk, 900) * kd : 0;
        const dsT = ks ? (noir ? 0.8 : 0.84) : 0.52, dsE = ks ? (noir ? 18 : 20) : 14;
        const cs = p9 * 40 + (ds > dsT ? (ks ? (noir ? 9 : 6) : 3.5) * Math.pow(ds, dsE) : 0) + 0.3 * Math.exp(-(yu + 0.05) * (yu + 0.05) / 0.0064) * (noir ? 0.4 : 1);
        const v = fc2 * cs * ao + clear * p9 * 1.2;
        r += v; g += v; b += v;
      }
      if (gem > 0) {
        // тонкие рёбра граней (только прозрачные без граней в альбедо), просвет и свечение у краёв
        const eg = edge * (0.15 + 0.5 * kd + 0.2 * env);
        const gl = glow * (0.18 + 0.9 * (1 - nz) * (1 - nz));
        r += eg + ar * gl * 2; g += eg + ag * gl * 2; b += eg + ab * gl * 2;
        if (noir) {
          // «премиальный» штрих чёрной звезды: тонкий холодный ободок по силуэту и фиолетовое свечение у кромки
          const o0 = 1 - (nz0 > 0 ? nz0 : 0), cr = 0.5 * o0 * o0 * o0 * (0.35 + 0.65 * rimW), vg = 0.05 * glow * o0 * o0;
          r += cr * 0.5 + vg * 0.55; g += cr * 0.6 + vg * 0.2; b += cr + vg;
        }
        // места для искр: где грань ловит основной свет; на кромке и ребре (наклон геометрии) — в приоритете
        if (nhk > 0.96 && kd > 0.3 && (X & 1) === 0 && (Y & 1) === 0 && cand.length < 12000) cand.push(nhk * kd * gem * (nz0 < 0.93 ? 1.6 : 0.6), X, Y);
      }
      const c = cvA[j], p = i * 4;
      out[p] = toOut(r) * c / 255; out[p + 1] = toOut(g) * c / 255; out[p + 2] = toOut(b) * c / 255; out[p + 3] = c;
    }
    return { px: out, cand: cand };
  }

  // Геометрии моделей (LRU): помещаются все модели каталога — в случайном инвентаре промахи кэша
  // стоили ~40 мс на предмет. Предел — по числу пикселей (≈ 25 байт на пиксель), чтобы не раздувать память.
  const GEOM = new Map(), GEOM_PX = 4.5e6;
  let geomPx = 0;
  function geomOf(weaponId) {
    let G = GEOM.get(weaponId);
    if (G) { GEOM.delete(weaponId); GEOM.set(weaponId, G); return G; }
    G = buildGeom(weaponId);
    GEOM.set(weaponId, G);
    geomPx += G.m;
    while (GEOM.size > 1 && (geomPx > GEOM_PX || GEOM.size > 96)) {
      const k = GEOM.keys().next().value;
      geomPx -= GEOM.get(k).m;
      GEOM.delete(k);
    }
    return G;
  }

  // Наклон и перспектива — один раз: обратное отображение с билинейной выборкой.
  // src — RGBA исходника, умноженный на альфу (так края не темнеют); на выходе — обычный RGBA.
  function warp(G, src) {
    const w = G.w, h = G.h, ow = G.ow, oh = G.oh, M = G.Fi;
    const img = new ImageData(ow, oh), d = img.data;
    for (let Y = 0; Y < oh; Y++) {
      const yc = Y + 0.5;
      // числители и знаменатель линейны по X — шагаем приращениями
      let nu = M[0] * 0.5 + M[1] * yc + M[2], nv = M[3] * 0.5 + M[4] * yc + M[5], q = M[6] * 0.5 + M[7] * yc + M[8];
      for (let X = 0; X < ow; X++, nu += M[0], nv += M[3], q += M[6]) {
        const u = nu / q - 0.5, v = nv / q - 0.5;
        const x0 = Math.floor(u), y0 = Math.floor(v);
        if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
        const fx = u - x0, fy = v - y0, p = (y0 * w + x0) * 4, p2 = p + w * 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const a = src[p + 3] * w00 + src[p + 7] * w10 + src[p2 + 3] * w01 + src[p2 + 7] * w11;
        if (a < 0.5) continue;
        const k = 255 / a, o = (Y * ow + X) * 4;
        d[o] = (src[p] * w00 + src[p + 4] * w10 + src[p2] * w01 + src[p2 + 4] * w11) * k;
        d[o + 1] = (src[p + 1] * w00 + src[p + 5] * w10 + src[p2 + 1] * w01 + src[p2 + 5] * w11) * k;
        d[o + 2] = (src[p + 2] * w00 + src[p + 6] * w10 + src[p2 + 2] * w01 + src[p2 + 6] * w11) * k;
        d[o + 3] = a;
      }
    }
    return img;
  }

  // Искры камня: несколько звёздочек там, где грани ловят свет, в первую очередь на кромке и рёбрах (2–4 на предмет)
  function sparkles(ctx, G, cand, n, cold) {
    const SS = G.ss;
    const ord = [];
    for (let k = 0; k < cand.length; k += 3) ord.push(k);
    ord.sort((a, b) => cand[b] - cand[a]);
    const pts = [], md = 18 * SS;
    for (let q = 0; q < ord.length && pts.length < n; q++) {
      const k = ord[q], X = cand[k + 1], Y = cand[k + 2];
      if (pts.some((p) => (p[0] - X) * (p[0] - X) + (p[1] - Y) * (p[1] - Y) < md * md)) continue;
      pts.push([X, Y, cand[k]]);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    pts.forEach((p, k) => {
      const o = proj(G.F, p[0] + 0.5, p[1] + 0.5), s = (3.6 + 1.8 * Math.min(1, p[2])) * SS * (k ? 0.72 : 1);
      const g = ctx.createRadialGradient(o[0], o[1], 0, o[0], o[1], s);
      g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.3, cold ? 'rgba(214,226,255,.35)' : 'rgba(255,248,230,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(o[0], o[1], s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      const ray = (L, wd, ang) => {
        ctx.save(); ctx.translate(o[0], o[1]); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, -wd); ctx.lineTo(L, 0); ctx.lineTo(0, wd); ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      ray(s * 1.8, s * 0.1, 0); ray(s * 1.8, s * 0.1, Math.PI / 2); ray(s * 0.56, s * 0.07, Math.PI / 4); ray(s * 0.56, s * 0.07, -Math.PI / 4);
    });
    ctx.restore();
  }

  function buildItem(skinId) {
    const s = SKINS[skinId], G = geomOf(s.w), SS = G.ss;
    const mats = matsFor(G, skinId);
    const sh = shade(G, mats);
    const lc = mk(G.ow, G.oh);
    lc.getContext('2d').putImageData(warp(G, sh.px), 0, 0);
    const c = mk(G.ow, G.oh), ctx = c.getContext('2d');
    // контактная тень — мягкая и целиком в нижнем поле картинки
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 5 * SS; ctx.shadowOffsetY = 3.5 * SS;
    ctx.drawImage(lc, 0, 0);
    ctx.restore();
    if (sh.cand.length) {
      // немного искр: ножи и перчатки — до 4, остальное оружие — до 2 (иначе в карточке они забивают силуэт)
      let sp = 0, cold = false;
      mats.forEach((M) => { if (M && M.gem > 0) { sp = Math.max(sp, M.sparkle); if (M.cut === 2) cold = true; } });
      const big = G.type === 'knife' || G.type === 'gloves';
      if (sp >= 0.15) sparkles(ctx, G, sh.cand, big ? Math.min(4, 2 + Math.round(2 * sp)) : Math.min(2, 1 + Math.round(sp)), cold);
    }
    return c;
  }

  // Слой износа: сколы только на видимой краске, в той же геометрии и тем же наклоном, что предмет —
  // пиксель в пиксель. Маска «видимой краски» — из карты «какая деталь сверху»: всё, что лежит поверх
  // окрашенного корпуса (металл, полимер, стекло, винты, детали своим материалом), сколов не получает.
  function buildWear(weaponId, level) {
    const G = geomOf(weaponId), w = G.w, m = G.m, SS = G.ss;
    const src = new Uint8ClampedArray(w * G.h * 4);
    const ch = pixOf('chips:' + level, Tex.chips(level)), fs = S / SS, ox = filmX0(G), oy = G.box.y0 * S;
    const painted = G.recs.map((R) => (R && (R.P.role === 'p' || R.P.role === 'q') && !R.P.fixed ? 1 : 0));
    const gloves = G.type === 'gloves', lk = G.lk;
    for (let j = 0; j < m; j++) {
      const t = G.top[j], u = G.under[j], a = G.at[j] / 255;
      const pm = painted[t] * a + (u && u !== t ? painted[u] * (1 - a) : painted[t] * (1 - a));
      if (pm <= 0) continue;
      const i = G.idx[j], X = i % w, Y = (i / w) | 0;
      let fx = ((ox + X * fs) | 0) % ch.w, fy = ((oy + Y * fs) | 0) % ch.h;
      if (fx < 0) fx += ch.w;
      if (fy < 0) fy += ch.h;
      const q = (fy * ch.w + fx) * 4, ca = ch.d[q + 3] / 255 * pm * G.cov[j] / 255;
      if (ca <= 0.004) continue;
      const nx = G.nrm[j * 3] / 32767, ny = G.nrm[j * 3 + 1] / 32767, nz = G.nrm[j * 3 + 2] / 32767;
      const nl = nx * lk[0] + ny * lk[1] + nz * lk[2];
      const l = 0.4 + 0.75 * (nl > 0 ? nl : 0) * G.lit[j * 4] / 255 + 0.3 * G.lit[j * 4 + 2] / 255;
      let r = ch.d[q] * l, g = ch.d[q + 1] * l, b = ch.d[q + 2] * l;
      if (gloves) { r = r * 0.25 + 70 * 0.75; g = g * 0.25 + 55 * 0.75; b = b * 0.25 + 40 * 0.75; }
      const p = i * 4;
      src[p] = r * ca; src[p + 1] = g * ca; src[p + 2] = b * ca; src[p + 3] = ca * 255;
    }
    const c = mk(G.ow, G.oh);
    c.getContext('2d').putImageData(warp(G, src), 0, 0);
    return c;
  }

  // ---------- Кэш между запусками (IndexedDB) ----------
  // Готовые картинки сохраняются в браузере: при следующем запуске они не рисуются заново.
  // ART_VER меняется при любом изменении отрисовки — тогда старый кэш очищается.
  const ART_VER = 'e6';   // e6: объёмные иконки (свет, наклон, перспектива), камни, новые перчатки, упрощённые раскраски, кофры
  // Локальный просмотр (127.0.0.1 / localhost) — без кэша: всегда свежие картинки во время работы над графикой
  const NO_IDB = typeof location !== 'undefined' && /^(127.0.0.1|localhost)$/.test(location.hostname);
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const rq = indexedDB.open('caselab_art', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('img');
        rq.onerror = () => resolve(null);
        rq.onsuccess = () => {
          const d = rq.result;
          try {
            const st = d.transaction('img', 'readwrite').objectStore('img');
            const vr = st.get('__ver');
            vr.onsuccess = () => {
              if (vr.result !== ART_VER) { st.clear(); st.put(ART_VER, '__ver'); }
              resolve(d);
            };
            vr.onerror = () => resolve(d);
          } catch (e) { resolve(null); }
        };
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  function idbGet(key) {
    if (NO_IDB) return Promise.resolve(null);
    return db().then((d) => new Promise((resolve) => {
      if (!d) { resolve(null); return; }
      try {
        const rq = d.transaction('img', 'readonly').objectStore('img').get(key);
        rq.onsuccess = () => resolve(rq.result instanceof Blob ? rq.result : null);
        rq.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    }));
  }
  function idbPut(key, blob) {
    if (NO_IDB) return;
    db().then((d) => { if (d) { try { d.transaction('img', 'readwrite').objectStore('img').put(blob, key); } catch (e) { /* место кончилось — не страшно */ } } });
  }

  // ---------- Очередь отрисовки ----------
  function finish(key, url) {
    urls[key] = url;
    delete pending[key];
    document.querySelectorAll('img[data-art="' + key + '"]').forEach((im) => {
      im.src = url;
      im.removeAttribute('data-art');
      im.classList.remove('pend');
    });
    if (!queue.length && !hot.length && !Object.keys(pending).length) { const w = waiters; waiters = []; w.forEach((f) => f()); }
  }

  function produce(key) {
    const p = key.split(':');
    let cv;
    try {
      if (p[0] === 'i') cv = buildItem(p[1]);
      else if (p[0] === 'w') cv = buildWear(p[1], Number(p[2]));
      else cv = Crate.build(CASE_BY_ID[p[1]]);
    } catch (e) {
      console.error('Art render failed', key, e);
      finish(key, BLANK);
      return;
    }
    if (cv.toBlob) {
      cv.toBlob((b) => {
        if (b) { idbPut(ART_VER + ':' + key, b); finish(key, URL.createObjectURL(b)); } else finish(key, cv.toDataURL());
      }, 'image/png');
    } else finish(key, cv.toDataURL('image/png'));
  }

  // Пока крутится рулетка, не рисуем: анимация должна идти плавно (картинки для неё готовы заранее)
  const busy = () => typeof UI !== 'undefined' && UI.isSpinning && UI.isSpinning();

  function work(deadline) {
    scheduled = false;
    if (!queue.length && !hot.length) return;
    if (busy()) { setTimeout(schedule, 150); return; }
    const t0 = performance.now();
    do produce(hot.length ? hot.pop() : queue.shift());
    while ((hot.length || queue.length) && (deadline && deadline.timeRemaining ? deadline.timeRemaining() > 8 : performance.now() - t0 < 14));
    if (queue.length || hot.length) schedule();
  }
  function schedule() {
    if (scheduled || (!queue.length && !hot.length)) return;
    scheduled = true;
    if (window.requestIdleCallback) requestIdleCallback(work, { timeout: 120 });
    else setTimeout(work, 0);
  }

  // Новые запросы встают в начало очереди (одной пачкой, в своём порядке):
  // то, что сейчас на экране, рисуется раньше того, что запрашивали до этого.
  let batch = null;
  function enqueue(key) {
    if (!batch) {
      batch = [];
      Promise.resolve().then(() => { queue.unshift.apply(queue, batch); batch = null; schedule(); });
    }
    batch.push(key);
  }

  function request(key) {
    if (urls[key]) return;
    // Уже ждёт в очереди и запрошен снова — значит снова на экране (окно дропа, рулетка): поднимаем вперёд,
    // иначе выпавший предмет ждал за десятками картинок ленты рулетки, запрошенных позже
    if (pending[key]) {
      let i = queue.indexOf(key);
      if (i >= 0) queue.splice(i, 1);
      else { i = hot.indexOf(key); if (i < 0) return; hot.splice(i, 1); }   // ещё читается из IndexedDB или в пачке — придёт сам
      hot.push(key);
      schedule();
      return;
    }
    pending[key] = 1;
    idbGet(ART_VER + ':' + key).then((blob) => {
      if (urls[key]) return;
      if (blob) finish(key, URL.createObjectURL(blob));
      else enqueue(key);
    });
  }

  function img(key, cls) {
    if (urls[key]) return '<img class="' + cls + '" src="' + urls[key] + '" alt="" draggable="false">';
    request(key);
    return '<img class="' + cls + ' pend" data-art="' + key + '" src="' + BLANK + '" alt="" draggable="false">';
  }

  function wearLevel(f) { return f < 0.07 ? 0 : f < 0.15 ? 1 : f < 0.38 ? 2 : f < 0.45 ? 3 : 4; }

  // ---------- Публичный интерфейс ----------
  function item(skinId, fl) {
    if (SKIN_IMAGES[skinId]) return '<span class="wimg"><img class="wb" src="' + SKIN_IMAGES[skinId] + '" alt="" draggable="false"></span>';
    // «Заводская окраска» — настоящие материалы (дерево, полимер, сталь): сколов краски на них нет
    const lvl = fl == null || (FINISHES[SKINS[skinId].f] || {}).factory ? 0 : wearLevel(fl);
    return '<span class="wimg">' + img('i:' + skinId, 'wb') + (lvl ? img('w:' + SKINS[skinId].w + ':' + lvl, 'ww') : '') + '</span>';
  }

  function crate(c) { return img('c:' + c.id, 'crate'); }

  // Заранее отрисовать список ключей; промис завершится, когда очередь опустеет
  function prewarm(keys) {
    keys.forEach(request);
    return new Promise((resolve) => {
      if (!queue.length && !hot.length && !Object.keys(pending).length) resolve();
      else waiters.push(resolve);
    });
  }

  return {
    item: item, crate: crate, prewarm: prewarm, isGem: isGem,
    itemKey: (id) => 'i:' + id, crateKey: (c) => 'c:' + c.id,
    initDefs: function () {},
    // Синхронная отрисовка без очереди и кэша (для проверки картинок)
    _build: { item: buildItem, wear: buildWear, crate: (id) => Crate.build(CASE_BY_ID[id]) },
    // Общие функции рендера для js/art_crate.js
    _lib: { mk: mk, gray: gray, relight: relight, drawWeapon: drawWeapon, W: W, H: H, S: S },
  };
})();
