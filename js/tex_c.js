'use strict';

// Узоры раскрасок, набор C.
// Генераторы регистрируются через Tex.addGen(kind, fn); fn(f, R, n, n2, n3) → canvas Tex.W*S × Tex.H*S.
// Помощники: Tex.lib (pixels, vec, pal, mix, rgb, shade, fbm, perlin, rng, smooth, clamp01, blob, mk, full, grain, W, H, S).
// Узоры: ice, smoke, damask, kintsugi, kevlar, hazard, anodized, tribal
(function () {
  const L = Tex.lib;
  const W = L.W, H = L.H, S = L.S, TAU = Math.PI * 2;
  const rgb = L.rgb, mix = L.mix, fbm = L.fbm, smooth = L.smooth, clamp01 = L.clamp01, mk = L.mk, full = L.full;

  // ---------- Общие помощники ----------

  // Попиксельный проход без лишних аллокаций: fn(x, y, out, i) пишет цвет (и при желании альфу out[3]) в out.
  // x, y — координаты поля 512×192; i — номер пикселя в сетке разрешения r. Результат растягивается до полного размера.
  function raster(r, fn) {
    const w = Math.round(W * S * r), h = Math.round(H * S * r);
    const c = mk(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
    const kx = W / w, ky = H / h, o = [0, 0, 0, 255];
    let p = 0;
    for (let j = 0; j < h; j++) {
      const y = (j + 0.5) * ky;
      for (let i = 0; i < w; i++, p++) {
        o[3] = 255;
        fn((i + 0.5) * kx, y, o, p);
        const q = p * 4;
        d[q] = o[0]; d[q + 1] = o[1]; d[q + 2] = o[2]; d[q + 3] = o[3];
      }
    }
    ctx.putImageData(img, 0, 0);
    return upscale(c);
  }
  function upscale(c) {
    const w = Math.round(W * S), h = Math.round(H * S);
    if (c.width === w && c.height === h) return c;
    const out = full(), x = out.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(c, 0, 0, out.width, out.height);
    return out;
  }
  // Прозрачный слой полного размера, рисуем в единицах поля
  function layer() {
    const x = full().getContext('2d');
    x.scale(S, S); x.lineCap = 'round'; x.lineJoin = 'round';
    return x;
  }
  // Шкала цветов по массиву [r,g,b]; пишет результат в o
  function ramp(cols) {
    const m = cols.length - 1;
    return function (t, o) {
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const f = t * m, i = f >= m ? m - 1 : f | 0, k = f - i, a = cols[i], b = cols[i + 1];
      o[0] = a[0] + (b[0] - a[0]) * k; o[1] = a[1] + (b[1] - a[1]) * k; o[2] = a[2] + (b[2] - a[2]) * k;
      return o;
    };
  }
  const css = (c, a) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a) + ')';
  function poly(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }
  // Гладкий замкнутый контур через середины отрезков (сдвоенные вершины остаются острыми)
  function smoothClosed(ctx, pts) {
    const m = pts.length;
    ctx.moveTo((pts[m - 1][0] + pts[0][0]) / 2, (pts[m - 1][1] + pts[0][1]) / 2);
    for (let i = 0; i < m; i++) {
      const p = pts[i], q = pts[(i + 1) % m];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.closePath();
  }
  // Единичная нормаль к ломаной в вершине i
  function normalAt(pts, i) {
    const a = pts[i > 0 ? i - 1 : 0], b = pts[i < pts.length - 1 ? i + 1 : i];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  }
  // Лента переменной ширины вдоль ломаной: wf(i) — полная ширина в вершине i
  function ribbon(ctx, pts, wf) {
    const A = [], B = [];
    for (let i = 0; i < pts.length; i++) {
      const nn = normalAt(pts, i), w = wf(i, pts.length - 1) / 2;
      A.push([pts[i][0] + nn[0] * w, pts[i][1] + nn[1] * w]);
      B.push([pts[i][0] - nn[0] * w, pts[i][1] - nn[1] * w]);
    }
    poly(ctx, A.concat(B.reverse()));
    ctx.closePath();
  }
  // Односторонняя полоса: от ломаной до её смещения на side·wf(i)
  function band(ctx, pts, side, wf) {
    poly(ctx, pts);
    for (let i = pts.length - 1; i >= 0; i--) {
      const nn = normalAt(pts, i), w = wf(i) * side;
      ctx.lineTo(pts[i][0] + nn[0] * w, pts[i][1] + nn[1] * w);
    }
    ctx.closePath();
  }
  // Ломаная, смещённая вбок на d
  function offsetPoly(ctx, pts, d) {
    for (let i = 0; i < pts.length; i++) {
      const nn = normalAt(pts, i), x = pts[i][0] + nn[0] * d, y = pts[i][1] + nn[1] * d;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
  }
  // Точки кубической кривой Безье и спирали (для орнаментов)
  function bez(p0, p1, p2, p3, m) {
    const out = [];
    for (let k = 0; k <= m; k++) {
      const t = k / m, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
    }
    return out;
  }
  function spiral(cx, cy, r0, r1, a0, a1, m) {
    const out = [];
    for (let k = 0; k <= m; k++) {
      const t = k / m, r = r0 + (r1 - r0) * t, a = a0 + (a1 - a0) * t;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  }
  // Листок: изогнутая лента от (x0,y0) до (x1,y1), прогиб bend, наибольшая ширина w
  function leaf(ctx, x0, y0, x1, y1, bend, w) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const cx = mx - dy / l * bend, cy = my + dx / l * bend, pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, u = 1 - t;
      pts.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
    }
    ctx.beginPath();
    ribbon(ctx, pts, (i, m) => w * Math.pow(Math.sin(Math.PI * i / m), 0.75));
    ctx.fill();
  }
  // Четырёхлучевой блик
  function glint(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.16, y - s * 0.16); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.16, y + s * 0.16);
    ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.16, y + s * 0.16); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.16, y - s * 0.16);
    ctx.closePath(); ctx.fill();
  }
  // Кромки рельефа: оставляет край маски src со стороны, противоположной сдвигу (dx, dy), и красит его цветом col
  function rim(ctx, src, dx, dy, col) {
    const t = full(), x = t.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'destination-out';
    x.drawImage(src, dx * S, dy * S);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = col; x.fillRect(0, 0, t.width, t.height);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(t, 0, 0); ctx.restore();
  }

  // Сеть трещин: ломаные растут случайным блужданием, ветвятся и обрываются, упираясь в уже готовые.
  // o: { prim, sec, ter — число трещин по уровням; step, jit — длина и излом звена по уровням; kink — шанс резкого излома;
  //      persist — излом меняет курс насовсем (прямые отрезки с углами, как у льда); len — [[min,max] вторичных, [min,max] третичных];
  //      ang(R, i) — направление i-й первичной; pre(api) — свои трещины до первичных (api: grow, add);
  //      gaps — [cw, ch]: в каждой клетке cw×ch поля должна пройти хотя бы одна трещина }
  // Результат: [{ pts, lvl, e0, e1 }], e0/e1 — чем кончается трещина: 'hit' (упёрлась), 'out' (ушла за край), 'free'
  function crackNet(R, o) {
    const segs = [], list = [];
    function hit(ax, ay, bx, by) {
      let best = 2;
      const rx = bx - ax, ry = by - ay;
      for (let k = 0; k < segs.length; k++) {
        const s = segs[k], sx = s[2] - s[0], sy = s[3] - s[1];
        const den = rx * sy - ry * sx;
        if (den > -1e-9 && den < 1e-9) continue;
        const qx = s[0] - ax, qy = s[1] - ay;
        const t = (qx * sy - qy * sx) / den;
        if (t <= 1e-3 || t >= best) continue;
        const u = (qx * ry - qy * rx) / den;
        if (u >= -1e-6 && u <= 1.000001) best = t;
      }
      return best;
    }
    function grow(x, y, ang, len, lvl) {
      const pts = [[x, y]], st = o.step[lvl], jit = o.jit[lvl];
      let a = ang, run = 0, end = 'free';
      while (run < len) {
        a += (R() - 0.5) * 2 * jit + (ang - a) * 0.22;
        if (R() < o.kink) {
          if (o.persist) { const d = (R() < 0.5 ? -1 : 1) * (0.22 + R() * 0.42); a += d; ang += d; } else a += (R() - 0.5) * 1.2;
        }
        const l = st * (0.6 + R() * 0.8);
        let nx = x + Math.cos(a) * l, ny = y + Math.sin(a) * l;
        const t = hit(x, y, nx, ny);
        if (t <= 1) { nx = x + (nx - x) * t; ny = y + (ny - y) * t; end = 'hit'; }
        else if (nx < -20 || nx > W + 20 || ny < -20 || ny > H + 20) end = 'out';
        segs.push([x, y, nx, ny]);
        pts.push([nx, ny]);
        run += l; x = nx; y = ny;
        if (end !== 'free') break;
      }
      return { pts: pts, end: end };
    }
    // готовая ломаная: seg — добавить и её звенья (если она не выращена через grow)
    function add(pts, lvl, e0, e1, seg) {
      if (seg) for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
      list.push({ pts: pts, lvl: lvl, e0: e0 || 'hit', e1: e1 || 'hit' });
    }
    // трещина через точку в обе стороны
    function cross(x, y, a, lvl) {
      const A = grow(x, y, a, 1000, lvl), B = grow(x, y, a + Math.PI, 1000, lvl);
      list.push({ pts: B.pts.slice().reverse().concat(A.pts.slice(1)), lvl: lvl, e0: B.end, e1: A.end });
    }
    if (o.pre) o.pre({ grow: grow, add: add });
    for (let i = 0; i < o.prim; i++) {
      cross((i + 0.15 + R() * 0.7) / o.prim * W, H * (0.22 + R() * 0.56), o.ang(R, i), 0);
    }
    [[1, o.sec], [2, o.ter]].forEach((lv) => {
      const lvl = lv[0], pool = list.filter((c) => c.lvl < lvl && c.pts.length > 2), ln = o.len[lvl - 1];
      for (let i = 0; i < lv[1]; i++) {
        const par = pool[(R() * pool.length) | 0];
        const k = 1 + ((R() * (par.pts.length - 2)) | 0);
        const p = par.pts[k], q0 = par.pts[k - 1], q1 = par.pts[k + 1];
        const a = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]) + (R() < 0.5 ? -1 : 1) * (0.45 + R() * 0.85);
        const C = grow(p[0], p[1], a, ln[0] + R() * (ln[1] - ln[0]), lvl);
        if (C.pts.length > 1) list.push({ pts: C.pts, lvl: lvl, e0: 'hit', e1: C.end });
      }
    });
    if (o.gaps) {
      const cw = o.gaps[0], ch = o.gaps[1], nx = Math.ceil(W / cw), ny = Math.ceil(H / ch), has = new Uint8Array(nx * ny);
      const mark = (c) => c.pts.forEach((p) => {
        const i = Math.floor(p[0] / cw), j = Math.floor(p[1] / ch);
        if (i >= 0 && i < nx && j >= 0 && j < ny) has[j * nx + i] = 1;
      });
      list.forEach(mark);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (has[j * nx + i]) continue;
          cross((i + 0.3 + R() * 0.4) * cw, Math.min(H - 6, (j + 0.3 + R() * 0.4) * ch), o.ang(R, i + j), 1);
          mark(list[list.length - 1]);
        }
      }
    }
    return list;
  }
  // Точка на ломаной на расстоянии d от её начала (null — ломаная короче)
  function along(pts, d) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= l) return [a[0] + (b[0] - a[0]) * d / l, a[1] + (b[1] - a[1]) * d / l];
      d -= l;
    }
    return null;
  }
  // Звезда удара: прямые лучи из одной точки и хорды-«кольца» между соседними лучами (мелкие треугольные осколки у центра)
  function impact(api, R, cx, cy, nr) {
    const rays = [], a0 = R() * TAU;
    for (let k = 0; k < nr; k++) {
      const a = a0 + (k + (R() - 0.5) * 0.5) / nr * TAU;
      const g = api.grow(cx, cy, a, 45 + R() * R() * 280, k % 3 === 1 ? 1 : 0);
      api.add(g.pts, k % 3 === 1 ? 1 : 0, 'hit', g.end, false);
      rays.push(g.pts);
    }
    [[5, 0.95, 1], [12, 0.85, 1], [23, 0.6, 1], [38, 0.35, 2]].forEach((rg) => {
      for (let k = 0; k < nr; k++) {
        if (R() > rg[1]) continue;
        const A = along(rays[k], rg[0] * (0.75 + R() * 0.5)), B = along(rays[(k + 1) % nr], rg[0] * (0.75 + R() * 0.5));
        if (A && B) api.add([A, B], rg[2], 'hit', 'hit', true);
      }
    });
  }

  // ===== Лёд (icecrack): толстый синий лёд, расколотый ударами — звёзды трещин, прямые изломы, пластины разного тона =====
  Tex.addGen('ice', function (f, R, n, n2, n3) {
    const pale = rgb(f.c[0]), mid = rgb(f.c[1]), white = rgb(f.c[2]), deep = rgb(f.c[3]);
    // две точки удара: в задней части (приклад) и ближе к дулу (ствольная коробка, клинок ножа)
    const stars = [[48 + R() * 80, 76 + R() * 34, 9 + ((R() * 3) | 0)], [292 + R() * 110, 58 + R() * 64, 10 + ((R() * 3) | 0)]];
    const net = crackNet(R, {
      prim: 5, sec: 34, ter: 56, step: [11, 8, 5], jit: [0.035, 0.05, 0.09], kink: 0.05, persist: true,
      len: [[24, 110], [7, 26]], ang: (R) => (R() - 0.5) * 2.4,
      pre: (api) => stars.forEach((s) => impact(api, R, s[0], s[1], s[2])),
    });
    // 1) осколки: маска трещин в половинном разрешении → связные области, у каждой свой тон и наклон грани
    const r = 0.5, mw = Math.round(W * S * r), mh = Math.round(H * S * r), ks = mw / W, N = mw * mh;
    const mx = mk(mw, mh).getContext('2d');
    mx.scale(ks, ks); mx.lineWidth = 1.9; mx.lineJoin = 'round'; mx.strokeStyle = '#000';
    mx.beginPath(); net.forEach((c) => { if (c.lvl < 2) poly(mx, c.pts); }); mx.stroke();
    const md = mx.getImageData(0, 0, mw, mh).data;
    const lab = new Int32Array(N), q = new Int32Array(N), sh = [];
    for (let i = 0; i < N; i++) lab[i] = md[i * 4 + 3] > 60 ? -1 : 0;
    for (let s0 = 0; s0 < N; s0++) {
      if (lab[s0] !== 0) continue;
      const id = sh.length + 1;
      let qh = 0, qt = 0, sx = 0, sy = 0;
      lab[s0] = id; q[qt++] = s0;
      while (qh < qt) {
        const p = q[qh++], px = p % mw;
        sx += px; sy += (p - px) / mw;
        if (px > 0 && lab[p - 1] === 0) { lab[p - 1] = id; q[qt++] = p - 1; }
        if (px < mw - 1 && lab[p + 1] === 0) { lab[p + 1] = id; q[qt++] = p + 1; }
        if (p >= mw && lab[p - mw] === 0) { lab[p - mw] = id; q[qt++] = p - mw; }
        if (p + mw < N && lab[p + mw] === 0) { lab[p + mw] = id; q[qt++] = p + mw; }
      }
      const a = R() * TAU, rad = Math.max(8, Math.sqrt(qt / Math.PI) / ks), g = (0.6 + R() * 0.8) / rad;
      sh.push([R(), Math.cos(a) * g, Math.sin(a) * g, (sx / qt + 0.5) / ks, (sy / qt + 0.5) / ks]);
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let p = 0; p < N; p++) {
        if (lab[p] >= 0) continue;
        const px = p % mw;
        if (px > 0 && lab[p - 1] > 0) lab[p] = lab[p - 1];
        else if (px < mw - 1 && lab[p + 1] > 0) lab[p] = lab[p + 1];
        else if (p >= mw && lab[p - mw] > 0) lab[p] = lab[p - mw];
        else if (p + mw < N && lab[p + mw] > 0) lab[p] = lab[p + mw];
      }
    }
    // тон: от почти чёрной синевы через глубокий синий к голубому; бледные — лишь отдельные грани
    const tone = ramp([[3, 10, 26], mix(deep, [2, 8, 24], 0.4), deep, mix(deep, mid, 0.5), mid, mix(mid, pale, 0.55), pale]);
    const c = raster(r, (x, y, o, i) => {
      const id = lab[i], s = id > 0 ? sh[id - 1] : null;
      const w = fbm(n, x * 0.01, y * 0.018, 2);
      const depth = fbm(n2, x * 0.0055 + w * 0.7, y * 0.011 - w * 0.4, 4);
      let t = 0.34 + depth * 0.4;
      if (s) t += (s[0] - 0.5) * 0.6 + ((x - s[3]) * s[1] + (y - s[4]) * s[2]) * 0.24;   // своя грань у каждой пластины
      t += smooth(0.18, 0.5, fbm(n3, x * 0.016, y * 0.03, 3)) * 0.13;   // помутнение-иней
      tone(t, o);
      if (s) { const hu = (s[0] * 7.3) % 1 - 0.5; o[0] -= hu * 10; o[1] += hu * 6; }   // чуть разный оттенок пластин
    });
    const ctx = c.getContext('2d');
    ctx.save(); ctx.scale(S, S); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    net.forEach((cr, ci) => {
      cr.side = R() < 0.5 ? -1 : 1;
      cr.wv = cr.pts.map((p, i) => 0.35 + 0.65 * smooth(-0.35, 0.3, n3(i * 0.17 + ci * 3.1, ci * 1.7 + 0.5)));
    });
    // 1) глубинные трещины: тонкие светлые штрихи в толще, под поверхностью
    ctx.strokeStyle = css(mix(mid, pale, 0.5), 0.22); ctx.lineWidth = 0.55;
    ctx.beginPath();
    for (let k = 0; k < 34; k++) {
      let x = R() * W, y = R() * H, a = R() * TAU;
      ctx.moveTo(x, y);
      for (let s = 0; s < 3; s++) { const l = 8 + R() * 26; x += Math.cos(a) * l; y += Math.sin(a) * l; ctx.lineTo(x, y); a += (R() - 0.5) * 1.1; }
    }
    ctx.stroke();
    // 2) плоскость излома: светлая полоса с одной стороны трещины — две ступени, без размытия
    ctx.fillStyle = css(mix(mid, pale, 0.65), 0.15);
    net.forEach((cr) => {
      if (cr.lvl > 1) return;
      const wm = cr.lvl ? 3.6 : 6.4;
      for (let k = 1; k <= 2; k++) { ctx.beginPath(); band(ctx, cr.pts, cr.side, (i) => wm * cr.wv[i] * k / 2); ctx.fill(); }
    });
    // 3) тёмная кромка преломления с другой стороны трещины
    ctx.strokeStyle = css(mix(deep, [0, 0, 0], 0.6), 0.8); ctx.lineWidth = 1.05;
    ctx.beginPath(); net.forEach((cr) => { if (cr.lvl < 2) offsetPoly(ctx, cr.pts, -cr.side * (cr.lvl ? 1.05 : 1.4)); }); ctx.stroke();
    // 4) белые линии трещин: чёткие, без свечения
    [[2, 0.6, 0.7], [1, 1.25, 0.95], [0, 2, 1]].forEach((lv) => {
      ctx.beginPath(); net.forEach((cr) => { if (cr.lvl === lv[0]) poly(ctx, cr.pts); });
      ctx.lineWidth = lv[1]; ctx.strokeStyle = css(white, lv[2]); ctx.stroke();
    });
    // 5) центр удара: раздробленное белое пятно с осколками
    stars.forEach((s) => {
      ctx.fillStyle = css(mix(white, pale, 0.3), 0.92);
      ctx.beginPath();
      const m = 7;
      for (let k = 0; k < m; k++) {
        const a = k / m * TAU + R() * 0.5, rr = 1.4 + R() * 2.6;
        if (k) ctx.lineTo(s[0] + Math.cos(a) * rr, s[1] + Math.sin(a) * rr); else ctx.moveTo(s[0] + Math.cos(a) * rr, s[1] + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
    });
    // 6) пузырьки воздуха цепочками
    for (let k = 0; k < 11; k++) {
      let bx = R() * W, by = 30 + R() * (H - 50);
      const cnt = 3 + ((R() * 7) | 0);
      for (let i = 0; i < cnt; i++) {
        bx += (R() - 0.5) * 5; by -= 2 + R() * 4;
        const rr = 0.4 + R() * R() * 1.8;
        ctx.lineWidth = 0.35; ctx.strokeStyle = 'rgba(225,245,255,0.65)';
        ctx.beginPath(); ctx.arc(bx, by, rr, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(bx - rr * 0.35, by - rr * 0.35, rr * 0.3, 0, TAU); ctx.fill();
      }
    }
    // 7) изморозь: мелкие кристаллики там, где лёд помутнел
    ctx.fillStyle = '#eef9ff';
    for (let k = 0; k < 600; k++) {
      const x = R() * W, y = R() * H, rr = 0.22 + R() * 0.38, a = 0.25 + R() * 0.45;
      if (fbm(n3, x * 0.016, y * 0.03, 3) < 0.18) continue;
      ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return c;
  });

  // ===== Дым (smoke): клубы и тонкие шёлковые струйки, закрученные вихрем (двойное искажение пространства, по вертикали сильнее —
  //       дым поднимается и завивается); три больших облака держат полутона, чёрное — только в узких карманах =====
  Tex.addGen('smoke', function (f, R, n, n2, n3) {
    const c0 = rgb(f.c[0]), c1 = mix(rgb(f.c[1]), [82, 90, 116], 0.3), c2 = rgb(f.c[2]);
    const tone = ramp([mix(c0, [0, 0, 0], 0.35), c0, mix(c0, c1, 0.55), c1, mix(c1, c2, 0.5), c2, [240, 241, 248]]);
    const cl = [];   // большие облака: x, y, радиус по x, по y
    for (let k = 0; k < 3; k++) cl.push([(k + 0.2 + R() * 0.6) / 3 * W, 46 + R() * 100, 80 + R() * 50, 44 + R() * 24]);
    const ox = R() * 40, oy = R() * 40;
    return raster(0.75, (x, y, o) => {
      const px = x * 0.0062 + ox, py = y * 0.0105 + oy;
      const qx = fbm(n, px, py, 3), qy = fbm(n, px + 5.2, py + 1.3, 3);
      const rx = fbm(n2, px + 2.4 * qx + 1.7, py + 2.4 * qy + 9.2, 3), ry = fbm(n2, px + 2.4 * qx + 8.3, py + 2.4 * qy + 2.8, 3);
      const wx = px + 1.7 * rx, wy = py + 2.8 * ry;
      const d = fbm(n3, wx * 1.4, wy * 1.4, 4);                               // плотность
      const f1 = 1 - Math.abs(n3(wx * 3.2 + 11.1, wy * 3.2 + 4.7));          // гребни — тонкие струйки
      const f2 = 1 - Math.abs(n(wx * 6.3 + 3.3, wy * 6.3 + 8.8));
      let cloud = 0;
      for (let k = 0; k < 3; k++) {
        const c = cl[k], dx = (x - c[0]) / c[2], dy = (y - c[1]) / c[3];
        cloud += Math.exp(-(dx * dx + dy * dy));
      }
      const dens = smooth(-0.32, 0.38, d + 0.25 * qy);
      const fil = Math.pow(f1, 9) * (0.35 + 0.65 * dens) + Math.pow(f2, 14) * 0.4 * dens;
      tone(0.2 + 0.36 * dens + 0.17 * Math.min(1, cloud) * (0.7 + d) + 0.34 * fil, o);
    });
  });

  // ===== Дамаст (baroque): винный бархат, решётка-огива и тиснёное золото с завитками-аканфами =====
  Tex.addGen('damask', function (f, R, n, n2, n3) {
    const bg = rgb(f.c[0]), gold = rgb(f.c[1]), wine = rgb(f.c[2]);
    const CW = 66, P = 158, A = CW / 2, X0 = 256 - 4 * CW, Y0 = 96 - P / 4, MS = CW / 60;   // центр медальона — в середине поля
    // 1) бархат: мягкие переливы и ворс
    const c = raster(0.5, (x, y, o) => {
      const k = 1 + fbm(n, x * 0.012, y * 0.02, 3) * 0.55 + n2(x * 0.35, y * 0.35) * 0.08;
      o[0] = bg[0] * k; o[1] = bg[1] * k; o[2] = bg[2] * k;
    });
    const ctx = c.getContext('2d');
    ctx.save(); ctx.scale(S, S); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const hw = (yy) => A * Math.cos(Math.PI * yy / (P / 2));   // полуширина огивы на высоте yy от её центра
    function lensPath(g, cx, cy, sh) {
      const m = 24, h2 = P / 4 - sh * 1.6;
      for (let k = 0; k <= m; k++) { const yy = -h2 + 2 * h2 * k / m, w = Math.max(0, hw(yy) - sh); if (k) g.lineTo(cx + w, cy + yy); else g.moveTo(cx + w, cy + yy); }
      for (let k = m; k >= 0; k--) { const yy = -h2 + 2 * h2 * k / m; g.lineTo(cx - Math.max(0, hw(yy) - sh), cy + yy); }
      g.closePath();
    }
    const lenses = [], diam = [];
    for (let k = -1; k <= 9; k++) {
      for (let m = -2; m <= 2; m++) {
        lenses.push([X0 + k * CW, 96 + m * P / 2]);
        diam.push([X0 + k * CW + A, Y0 + m * P / 2]);
      }
    }
    // 2) тон-в-тон: заливка огив более светлым вином
    lenses.forEach((p) => {
      const g = ctx.createRadialGradient(p[0], p[1] - 6, 2, p[0], p[1], 40);
      g.addColorStop(0, css(mix(wine, gold, 0.1))); g.addColorStop(0.6, css(wine)); g.addColorStop(1, css(mix(wine, bg, 0.6)));
      ctx.fillStyle = g; ctx.beginPath(); lensPath(ctx, p[0], p[1], 2.8); ctx.fill();
    });
    // 3) золото — отдельной маской
    const G = layer();
    G.fillStyle = '#fff'; G.strokeStyle = '#fff';
    // решётка
    G.lineWidth = 2;
    G.beginPath();
    for (let k = -1; k <= 9; k++) {
      for (const sg of [1, -1]) {
        for (let y = -12; y <= H + 12; y += 2) {
          const x = X0 + k * CW + sg * A * Math.sin(TAU * (y - Y0) / P);
          if (y === -12) G.moveTo(x, y); else G.lineTo(x, y);
        }
      }
    }
    G.stroke();
    // медальон: правая половина рисуется дважды (зеркально)
    function half(g) {
      const s1 = bez([3, 13], [13, 18], [25, 10], [22, -5], 14).concat(spiral(16.5, -5, 5.5, 1.1, 0, -5.3, 18).slice(1));
      g.beginPath(); ribbon(g, s1, (i, m) => (i < 14 ? 3.6 - i * 0.09 : 2.3 * (1 - (i - 14) / (m - 14)) + 0.5)); g.fill();
      const s2 = bez([2.5, -17], [8, -24], [15, -21], [14.5, -14], 10).concat(spiral(11.5, -14, 3, 0.7, 0, 4.6, 10).slice(1));
      g.beginPath(); ribbon(g, s2, (i, m) => (i < 10 ? 2.3 - i * 0.07 : 1.6 * (1 - (i - 10) / (m - 10)) + 0.35)); g.fill();
      const s3 = bez([1.5, 15], [4, 22], [10, 24], [11, 19.5], 10).concat(spiral(9, 19.5, 2, 0.5, 0, -4.4, 8).slice(1));
      g.beginPath(); ribbon(g, s3, (i, m) => (i < 10 ? 1.9 - i * 0.05 : 1.4 * (1 - (i - 10) / (m - 10)) + 0.3)); g.fill();
      leaf(g, 24.5, 4, 27.5, 9.5, 1.2, 2.2);
      leaf(g, 20.5, 14, 22, 19.5, 1, 1.9);
      leaf(g, 1.2, -27.5, 5.5, -30, -0.8, 1.7);
    }
    function medallion(g, cx, cy) {
      g.save(); g.translate(cx, cy); g.scale(MS, MS);
      g.beginPath();
      g.moveTo(0, -26); g.bezierCurveTo(5, -18, 8.5, -8, 8, 0); g.bezierCurveTo(7.5, 8, 4, 13, 0, 14.5);
      g.bezierCurveTo(-4, 13, -7.5, 8, -8, 0); g.bezierCurveTo(-8.5, -8, -5, -18, 0, -26); g.closePath();
      g.moveTo(0, -16); g.bezierCurveTo(-3, -11, -5, -5, -4.8, 0); g.bezierCurveTo(-4.6, 5, -2.6, 9, 0, 10);
      g.bezierCurveTo(2.6, 9, 4.6, 5, 4.8, 0); g.bezierCurveTo(5, -5, 3, -11, 0, -16); g.closePath();
      g.fill('evenodd');
      g.beginPath(); g.moveTo(0, -9); g.bezierCurveTo(2.2, -5, 2.6, 0, 0, 5); g.bezierCurveTo(-2.6, 0, -2.2, -5, 0, -9); g.fill();
      leaf(g, 0, -26.5, 0, -33.5, 0, 2.8);
      g.beginPath(); g.arc(0, 18.5, 1.7, 0, TAU); g.fill();
      half(g); g.scale(-1, 1); half(g);
      g.restore();
    }
    function rosette(g, cx, cy) {
      g.save(); g.translate(cx, cy); g.scale(MS, MS);
      for (let a = 0; a < 4; a++) {
        const ca = Math.cos(a * Math.PI / 2), sa = Math.sin(a * Math.PI / 2);
        leaf(g, ca * 2, sa * 2, ca * 10, sa * 10, 0, 4.4);
        const cb = Math.cos(a * Math.PI / 2 + Math.PI / 4), sb = Math.sin(a * Math.PI / 2 + Math.PI / 4);
        leaf(g, cb * 2, sb * 2, cb * 6.5, sb * 6.5, 0, 2.2);
      }
      leaf(g, 11, 0, 24, 0, 2, 2.4); leaf(g, -11, 0, -24, 0, -2, 2.4);
      leaf(g, 0, 11, 0, 20, 0, 2); leaf(g, 0, -11, 0, -20, 0, 2);
      g.beginPath(); g.arc(0, 0, 2.8, 0, TAU); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(0, 0, 1.5, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
      g.beginPath(); g.arc(0, 0, 0.7, 0, TAU); g.fill();
      g.restore();
    }
    lenses.forEach((p) => medallion(G, p[0], p[1]));
    diam.forEach((p) => rosette(G, p[0], p[1]));
    // бусины на пересечениях решётки
    lenses.forEach((p) => {
      G.beginPath(); G.arc(p[0], p[1] - P / 4, 2.6, 0, TAU); G.fill();
      G.beginPath(); G.arc(p[0] + A, p[1], 1.9, 0, TAU); G.fill();
    });
    // золото: металлический градиент и потёртости
    G.globalCompositeOperation = 'source-in';
    const gg = G.createLinearGradient(0, 0, W * 0.55, H);
    [[0, '#7a5220'], [0.14, f.c[1]], [0.27, '#f7e3a4'], [0.4, '#9c742c'], [0.55, f.c[1]], [0.7, '#ffe9aa'], [0.85, '#94692a'], [1, f.c[1]]]
      .forEach((s) => gg.addColorStop(s[0], s[1]));
    G.fillStyle = gg; G.fillRect(0, 0, W, H);
    G.globalCompositeOperation = 'source-atop';
    G.drawImage(raster(0.25, (x, y, o) => {
      const v = fbm(n3, x * 0.03, y * 0.05, 3);
      o[0] = 60; o[1] = 30; o[2] = 8; o[3] = 255 * smooth(0.05, 0.45, v) * 0.55;
    }), 0, 0, W, H);
    // 4) золото на бархат: тень, затем светлая и тёмная кромки тиснения
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowOffsetX = 0.7 * S; ctx.shadowOffsetY = 1 * S; ctx.shadowBlur = 1.4 * S;
    ctx.drawImage(G.canvas, 0, 0);
    ctx.restore();
    rim(ctx, G.canvas, 0.6, 0.6, 'rgba(255,246,210,0.75)');
    rim(ctx, G.canvas, -0.6, -0.6, 'rgba(60,28,4,0.7)');
    ctx.restore();
    return c;
  });

  // ===== Кинцуги (kintsugi): чёрная глазурованная керамика, расколотая и собранная золотым лаком =====
  Tex.addGen('kintsugi', function (f, R, n, n2, n3) {
    const k0 = rgb(f.c[0]), k2 = rgb(f.c[2]);
    const glaze = ramp([mix(k0, [0, 0, 0], 0.5), k0, k2, mix(k2, [120, 124, 130], 0.3)]);
    // 1) керамика: разводы глазури и кракелюр
    const c = raster(0.75, (x, y, o) => {
      const m = fbm(n, x * 0.007, y * 0.014, 4), sp = fbm(n2, x * 0.04, y * 0.06, 3);
      glaze(0.42 + m * 0.7 + sp * 0.18, o);
      const cr = Math.abs(n3(x * 0.075, y * 0.11) + 0.5 * n3(x * 0.15 + 3, y * 0.22));
      if (cr < 0.035) {
        const k = (1 - cr / 0.035) * 0.3;
        o[0] += (95 - o[0]) * k; o[1] += (95 - o[1]) * k; o[2] += (100 - o[2]) * k;
      }
    });
    // 2) трещины с переменной шириной (сужаются к свободным концам)
    const net = crackNet(R, {
      prim: 5, sec: 16, ter: 26, step: [6.5, 5, 3.6], jit: [0.3, 0.36, 0.42], kink: 0.08,
      len: [[30, 120], [8, 28]], ang: (R, i) => (i % 2 ? 1.2 : 0.16) + (R() - 0.5) * 0.7,
    });
    net.forEach((cr, ci) => {
      const base = [3.4, 2.3, 1.3][cr.lvl], m = cr.pts.length - 1;
      cr.w = cr.pts.map((p, i) => {
        let w = base * (0.55 + 0.9 * smooth(-0.35, 0.35, n3(i * 0.23 + ci * 5.3, ci * 2.9 + 0.7)));
        if (cr.e0 === 'free') w *= Math.min(1, 0.25 + i / 4);
        if (cr.e1 === 'free') w *= Math.min(1, 0.25 + (m - i) / 4);
        return w;
      });
    });
    function strokeNet(g, mul, add, ox, oy) {
      net.forEach((cr) => {
        for (let i = 0; i < cr.pts.length - 1; i++) {
          const a = cr.pts[i], b = cr.pts[i + 1], w = (cr.w[i] + cr.w[i + 1]) * 0.5;
          g.lineWidth = Math.max(0.2, w * mul + add);
          g.beginPath(); g.moveTo(a[0] + ox * w, a[1] + oy * w); g.lineTo(b[0] + ox * w, b[1] + oy * w); g.stroke();
        }
      });
    }
    // сколы, заполненные золотом целиком
    const chips = [], cand = [];
    net.forEach((cr) => cr.pts.forEach((p) => { if (p[0] > 50 && p[0] < 460 && p[1] > 66 && p[1] < 124) cand.push(p); }));
    for (let k = 0; k < 3 && cand.length; k++) {
      const p = cand[(R() * cand.length) | 0];
      const rad = 4.5 + R() * 4.5, m = 7 + ((R() * 4) | 0), pts = [];
      for (let i = 0; i < m; i++) {
        const a = i / m * TAU + R() * 0.4, rr = rad * (0.55 + R() * 0.6);
        pts.push([p[0] + Math.cos(a) * rr * 1.3, p[1] + Math.sin(a) * rr]);
      }
      chips.push(pts);
    }
    // 3) золото на отдельном слое: кайма, тело, лужицы на стыках, блик и тень
    const G = layer();
    const gg = G.createLinearGradient(0, 0, W, H * 0.4);
    [[0, '#a8741e'], [0.12, f.c[1]], [0.22, '#fff3c8'], [0.34, '#d9a43a'], [0.5, f.c[1]], [0.62, '#fff0bb'], [0.75, '#c99130'], [0.88, f.c[1]], [1, '#fff3c8']]
      .forEach((s) => gg.addColorStop(s[0], s[1]));
    G.strokeStyle = '#5a3a08'; strokeNet(G, 1, 1, 0, 0);
    G.lineWidth = 1; chips.forEach((p) => { G.beginPath(); poly(G, p); G.closePath(); G.stroke(); });
    G.strokeStyle = gg; G.fillStyle = gg; strokeNet(G, 1, 0, 0, 0);
    chips.forEach((p) => { G.beginPath(); poly(G, p); G.closePath(); G.fill(); });
    net.forEach((cr) => { if (cr.lvl) { const p = cr.pts[0]; G.beginPath(); G.arc(p[0], p[1], cr.w[0] * 0.75, 0, TAU); G.fill(); } });
    G.globalCompositeOperation = 'source-atop';
    G.strokeStyle = 'rgba(255,252,232,0.85)'; strokeNet(G, 0.32, 0, -0.18, -0.26);
    G.strokeStyle = 'rgba(110,62,0,0.55)'; strokeNet(G, 0.34, 0, 0.2, 0.28);
    G.globalCompositeOperation = 'source-over';
    const ctx = c.getContext('2d');
    ctx.save(); ctx.scale(S, S); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; strokeNet(ctx, 1, 1.8, 0.12, 0.18);   // канавка в керамике
    ctx.shadowColor = 'rgba(255,190,80,0.45)'; ctx.shadowBlur = 5 * S;
    ctx.drawImage(G.canvas, 0, 0, W, H);
    // золотая пыль у швов
    ctx.shadowBlur = 0; ctx.fillStyle = f.c[1];
    for (let k = 0; k < 140; k++) {
      const cr = net[(R() * net.length) | 0], p = cr.pts[(R() * cr.pts.length) | 0], a = R() * TAU, d = 2.5 + R() * R() * 9;
      ctx.globalAlpha = 0.3 + R() * 0.55;
      ctx.beginPath(); ctx.arc(p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d, 0.22 + R() * 0.45, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // искры на золоте
    ctx.shadowColor = '#fff6d0'; ctx.shadowBlur = 3 * S; ctx.fillStyle = 'rgba(255,252,236,0.95)';
    for (let k = 0; k < 22; k++) {
      const cr = net[(R() * net.length) | 0], p = cr.pts[(R() * cr.pts.length) | 0];
      glint(ctx, p[0] - 0.3, p[1] - 0.4, 1 + R() * 2.2);
    }
    ctx.restore();
    return c;
  });

  // ===== Кевлар (kevlar): арамидная ткань саржевого плетения под смолой, с муаровым переливом =====
  Tex.addGen('kevlar', function (f, R, n, n2, n3) {
    const yarn = mix(rgb(f.c[1]), [232, 184, 64], 0.22), dark = rgb(f.c[0]), gap = rgb(f.c[2]);
    const hi = mix(yarn, [255, 246, 205], 0.5);
    const T = 5.8;   // ширина жгута
    return raster(1, (x, y, o) => {
      const wx = x + 1.4 * n(x * 0.013, y * 0.013), wy = y + 1.4 * n2(x * 0.013 + 7.7, y * 0.013);
      const u = wx / T, v = wy / T, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      const m = ((i - j) % 4 + 4) % 4;
      let ac, al, hz;
      if (m < 2) { hz = 1; ac = fv; al = (m + fu) * 0.5; } else { hz = -1; ac = fu; al = (3 - m + fv) * 0.5; }
      const prof = Math.pow(Math.sin(Math.PI * ac), 0.3);         // плоский плотный жгут
      const dip = Math.pow(Math.sin(Math.PI * al), 0.16);         // ныряет под соседний на концах перекрытия
      const fib = 1 + 0.42 * (hz > 0 ? n3(x * 0.07, y * 1.15) : n3(x * 1.15, y * 0.07));   // волокна вдоль жгута
      const sh = fbm(n3, x * 0.0045 + 3.3, y * 0.011, 2);         // крупный муаровый перелив
      const flip = clamp01(0.6 + hz * sh * 1.9);
      const lum = prof * dip;
      const top = Math.pow(clamp01(1 - Math.abs(ac - 0.36) * 3.2), 2) * dip;   // блик на верхней/левой стороне жгута
      const b = smooth(0, 0.28, lum), k = smooth(0.1, 0.9, lum) * fib * (0.5 + 0.7 * flip);
      for (let q = 0; q < 3; q++) {
        let col = gap[q] + (dark[q] - gap[q]) * b;
        col += (yarn[q] - col) * clamp01(k);
        col += (hi[q] - col) * top * flip * 0.65;
        o[q] = col;
      }
    });
  });

  // ===== Опасность (hazard): промышленная «зебра» с трафаретной лентой, сколами краски и грязью =====
  Tex.addGen('hazard', function (f, R, n, n2, n3) {
    const per = 30, b0 = 80, b1 = 108, ym = (b0 + b1) / 2;
    const c = full(), ctx = c.getContext('2d');
    ctx.save(); ctx.scale(S, S);
    ctx.fillStyle = f.c[0]; ctx.fillRect(0, 0, W, H);
    // диагональные полосы «/»
    ctx.fillStyle = f.c[1];
    ctx.beginPath();
    for (let x = -H - per; x < W + per; x += per) { ctx.moveTo(x, H); ctx.lineTo(x + per / 2, H); ctx.lineTo(x + per / 2 + H, 0); ctx.lineTo(x + H, 0); ctx.closePath(); }
    ctx.fill();
    // лента с надписями
    ctx.fillStyle = f.c[1]; ctx.fillRect(0, b0, W, b1 - b0);
    ctx.fillStyle = f.c[2]; ctx.fillRect(0, b0 + 1.6, W, b1 - b0 - 3.2);
    ctx.fillStyle = f.c[0]; ctx.fillRect(0, b0 + 4.4, W, b1 - b0 - 8.8);
    function tri(x, y, s) {
      ctx.fillStyle = f.c[1];
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 1.1, y + s * 0.85); ctx.lineTo(x - s * 1.1, y + s * 0.85); ctx.closePath(); ctx.fill();
      ctx.fillStyle = f.c[2];
      ctx.beginPath(); ctx.moveTo(x, y - s * 0.55); ctx.lineTo(x + s * 0.7, y + s * 0.6); ctx.lineTo(x - s * 0.7, y + s * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = f.c[1];
      ctx.fillRect(x - 0.6, y - s * 0.25, 1.2, s * 0.5); ctx.fillRect(x - 0.6, y + s * 0.35, 1.2, 1.1);
    }
    ctx.font = 'bold 12px Impact, "Arial Black", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    const words = ['DANGER', 'HIGH VOLTAGE', 'KEEP CLEAR', 'CAUTION', 'DO NOT TOUCH'];
    for (let x = 4, wi = 0; x < W; wi++) {
      tri(x + 7, ym, 6.5); x += 17;
      const s = words[wi % words.length];
      ctx.fillStyle = f.c[1]; ctx.fillText(s, x, ym + 0.6);
      x += ctx.measureText(s).width + 9;
    }
    ctx.restore();
    // 2) износ: сколы до металла, грязь, выгорание — попиксельно поверх рисунка
    const w = c.width, h = c.height, img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let j = 0, p = 0; j < h; j++) {
      const y = (j + 0.5) / S;
      for (let i = 0; i < w; i++, p += 4) {
        const x = (i + 0.5) / S;
        const v = fbm(n, x * 0.05, y * 0.065, 3) + 0.34 * n2(x * 0.24, y * 0.24);
        const g = fbm(n3, x * 0.011, y * 0.022, 2);
        const dirt = 1 - 0.3 * smooth(0.0, 0.45, g) - 0.12 * smooth(100, 190, y);
        if (v > 0.45) {
          const s = 150 + 50 * n3(x * 0.6, y * 0.08);
          d[p] = s; d[p + 1] = s; d[p + 2] = s * 0.97;
        } else if (v > 0.4) {
          const k = 0.35 + (0.45 - v) * 4;
          d[p] = 52 * k + d[p] * 0.2; d[p + 1] = 54 * k + d[p + 1] * 0.2; d[p + 2] = 50 * k + d[p + 2] * 0.2;
        } else {
          d[p] *= dirt; d[p + 1] *= dirt; d[p + 2] *= dirt * 0.95;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    // царапины
    ctx.save(); ctx.scale(S, S);
    ctx.strokeStyle = 'rgba(225,225,215,0.5)';
    for (let k = 0; k < 46; k++) {
      const x = R() * W, y = R() * H, l = 4 + R() * 22, a = (R() - 0.5) * 0.9;
      ctx.lineWidth = 0.3 + R() * 0.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    ctx.restore();
    return c;
  });

  // ===== Анодированный титан (anodized): «прожжённый» титан — у 3 сварных швов почти поперёк оружия тепло расходится
  //       чёткими полосами каления (от шва наружу: серебристый валик → бирюза → синий → пурпур → бронза → солома → металл),
  //       края полос рваные, как языки пламени; между зонами — шлифованный серый титан =====
  Tex.addGen('anodized', function (f, R, n, n2, n3) {
    const blue = rgb(f.c[0]), pink = rgb(f.c[1]), gold = rgb(f.c[2]), teal = rgb(f.c[3]);
    const ti = [146, 150, 156];
    const metal = (c, k) => { const g = (c[0] + c[1] + c[2]) / 3; return mix(c, [g, g, g], k); };   // металл чуть приглушает цвет
    const bands = [ti, metal(mix(gold, [214, 204, 168], 0.5), 0.1), metal(mix(gold, [132, 66, 22], 0.55), 0.1),
      metal(mix(mix(blue, pink, 0.48), [44, 10, 70], 0.28), 0.12), metal(mix(blue, [10, 18, 96], 0.32), 0.12),
      metal(mix(teal, blue, 0.22), 0.15), metal(mix(teal, [214, 238, 246], 0.5), 0.2), [206, 212, 218]];
    const edge = [0.2, 0.31, 0.42, 0.53, 0.64, 0.77, 0.92], q = 0.006;   // пороги тепла, ширина перехода ~1–2 px
    // швы: [x0, y0, x1, y1, радиус прогрева]
    const sm = [], xs = [36 + R() * 80, 196 + R() * 80, 360 + R() * 80];
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (R() - 0.5) * 0.9, l = 20 + R() * 120, cx = xs[k], cy = 62 + R() * 68;
      sm.push([cx - Math.cos(a) * l / 2, cy - Math.sin(a) * l / 2, cx + Math.cos(a) * l / 2, cy + Math.sin(a) * l / 2, 44 + R() * 14]);
    }
    const hy = 56 + R() * 50, rf = new Float32Array(W + 2);   // мягкое отражение вдоль оружия (зависит только от x)
    for (let x = 0; x <= W + 1; x++) rf[x] = hy + 22 * fbm(n, x * 0.004, 0.5, 2);
    return raster(1, (x, y, o) => {
      const wx = fbm(n, x * 0.011, y * 0.022, 3) * 36, wy = fbm(n2, x * 0.011 + 4.1, y * 0.022, 3) * 22;
      let h = 0, al = 0;
      for (let k = 0; k < 3; k++) {
        const s = sm[k], px = x + wx - s[0], py = y + wy - s[1], ex = s[2] - s[0], ey = s[3] - s[1], ll = ex * ex + ey * ey;
        const t = clamp01((px * ex + py * ey) / ll), dx = px - ex * t, dy = py - ey * t;
        const v = 1 - Math.sqrt(dx * dx + dy * dy) / s[4] * 0.8;
        if (v > h) { h = v; al = t * Math.sqrt(ll) + Math.sqrt(dx * dx + dy * dy) * 0.7; }
      }
      h += 0.12 * x / W + 0.016 * n3(x * 0.09, y * 0.14);
      let b = 0;
      while (b < 7 && h > edge[b]) b++;
      let col = bands[b];
      if (b > 0 && h - edge[b - 1] < q) col = mix(bands[b - 1], col, 0.5 + 0.5 * (h - edge[b - 1]) / q);
      else if (b < 7 && edge[b] - h < q) col = mix(bands[b + 1], col, 0.5 + 0.5 * (edge[b] - h) / q);
      // продольная шлифовка: крупные и мелкие риски, редкие яркие штрихи; на сварном валике — чешуйки
      let k = 1 + 0.3 * (0.6 * n3(x * 0.016, y * 1.25) + 0.4 * n3(x * 0.05 + 9.1, y * 2.6));
      const st = Math.pow(Math.max(0, n2(x * 0.009 + 3.3, y * 1.9)), 3) * 1.5;
      if (b === 7) k *= 0.82 + 0.22 * Math.sin(al * 1.5);
      const xi = x | 0, ry = (y - rf[xi]) / 24;
      k *= 0.84 + 0.26 * Math.exp(-ry * ry);
      o[0] = col[0] * k + 70 * st; o[1] = col[1] * k + 70 * st; o[2] = col[2] * k + 72 * st;
    });
  });

  // ===== Огненный трайбл (tribal): зеркальный орнамент-татуировка во всю длину — цепь острых звеньев по оси,
  //       загнутые назад клинки-крюки с шипами и язычки; каждый элемент в чёрной обводке и залит огнём:
  //       тёмно-красный край → оранжевый → жёлтая сердцевина, по верхним кромкам — тонкий блик =====
  Tex.addGen('tribal', function (f, R, n, n2, n3) {
    const K = rgb(f.c[0]), O = rgb(f.c[1]), Y = rgb(f.c[2]), yc = H / 2;
    // фон: обугленный чёрный с едва заметным тлением
    const c = raster(0.5, (x, y, o) => {
      const v = fbm(n, x * 0.012, y * 0.024, 3), e = smooth(0.12, 0.5, fbm(n2, x * 0.016, y * 0.035, 3));
      o[0] = K[0] + 9 + v * 12 + e * 20; o[1] = K[1] + 7 + v * 9 + e * 4; o[2] = K[2] + 7 + v * 8;
    });
    // элемент: p — средняя линия, w — полуширина в её точках
    const mkS = (p, wf) => ({ p: p, w: p.map((q, i) => wf(i / (p.length - 1))) });
    // клинок: из (bx, by) сначала вперёд-вверх, затем назад, к прикладу; кончик загнут крюком
    function blade(bx, by, L, Hh, w0, hook) {
      const p = bez([bx, by], [bx + 0.16 * L, by - 0.5 * Hh], [bx - 0.22 * L, by - 1.08 * Hh], [bx - L, by - Hh + hook], 32);
      return mkS(p, (t) => w0 * Math.pow(1 - t, 0.85) * (0.78 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.6))));
    }
    // шип: отходит от внешней кромки клинка и уходит назад параллельно ему
    function barb(s, t0, Lb, w0) {
      const m = s.p.length - 1, i = Math.round(t0 * m), nn = normalAt(s.p, i), q = s.p[i], a = s.p[Math.min(m, i + 1)];
      const dl = Math.hypot(a[0] - q[0], a[1] - q[1]) || 1, tx = (a[0] - q[0]) / dl, ty = (a[1] - q[1]) / dl;
      const b0 = [q[0] + nn[0] * s.w[i] * 0.4, q[1] + nn[1] * s.w[i] * 0.4];
      const P = (u, v) => [b0[0] + nn[0] * u * Lb + tx * v * Lb, b0[1] + nn[1] * u * Lb + ty * v * Lb];
      return mkS(bez(b0, P(0.34, 0.05), P(0.55, 0.42), P(0.44, 1), 20), (t) => w0 * Math.pow(1 - t, 0.9) * (0.8 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.8))));
    }
    // звено оси от xa до xb: острое с обоих концов, толще ближе к дулу
    function link(xa, xb, hm) {
      const p = [];
      for (let k = 0; k <= 22; k++) p.push([xb - (xb - xa) * k / 22, yc]);
      return mkS(p, (t) => hm * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85));
    }
    const back = [], mid = [], front = [];   // порядок: шипы → клинки и язычки → звенья (каждый следующий «поверх»)
    let X = W + 24 + R() * 10, big = R() < 0.5;
    while (X > -70) {
      const step = 60 + R() * 14, Xn = X - step;
      const b = blade(X, yc - 2.5, big ? 100 + R() * 16 : 74 + R() * 12, big ? 66 + R() * 8 : 44 + R() * 8, big ? 11.5 : 8.6, big ? 13 : 8);
      mid.push(b);
      back.push(barb(b, big ? 0.42 : 0.5, big ? 34 : 22, big ? 5.2 : 3.8));
      mid.push(blade(X - step * (0.42 + R() * 0.1), yc - 5.5, 24 + R() * 6, 14 + R() * 4, 4, 3));
      front.push(link(Xn + 3, X - 3, 8.2));
      X = Xn; big = !big;
    }
    const all = [];   // зеркально относительно оси: каждый элемент сразу со своим отражением
    back.concat(mid, front).forEach((s) => { all.push(s); all.push({ p: s.p.map((q) => [q[0], 2 * yc - q[1]]), w: s.w }); });
    // контур элемента при доле ширины k; add — добавка к ширине (обводка), к острию сходит на нет
    function contour(g, s, k, add) {
      const A = [], B = [];
      for (let i = 0; i < s.p.length; i++) {
        const nn = normalAt(s.p, i), w = s.w[i] * k + add * Math.min(1, s.w[i] / 2);
        A.push([s.p[i][0] + nn[0] * w, s.p[i][1] + nn[1] * w]); B.push([s.p[i][0] - nn[0] * w, s.p[i][1] - nn[1] * w]);
      }
      g.beginPath(); poly(g, A.concat(B.reverse())); g.closePath();
    }
    // блик вдоль кромок, обращённых вверх
    function highlight(g, s) {
      g.beginPath();
      [1, -1].forEach((sg) => {
        let run = false;
        for (let i = 0; i < s.p.length; i++) {
          const nn = normalAt(s.p, i), up = nn[1] * sg < -0.3 && s.w[i] > 1.4, w = s.w[i] * 0.78 * sg;
          const x = s.p[i][0] + nn[0] * w, y = s.p[i][1] + nn[1] * w;
          if (up) { if (run) g.lineTo(x, y); else g.moveTo(x, y); }
          run = up;
        }
      });
      g.stroke();
    }
    const lv = [[1, mix(O, [60, 0, 0], 0.68)], [0.86, mix(O, [118, 4, 0], 0.52)], [0.72, mix(O, [190, 18, 0], 0.3)], [0.58, O],
      [0.45, mix(O, Y, 0.36)], [0.33, mix(O, Y, 0.72)], [0.22, Y], [0.1, mix(Y, [255, 246, 214], 0.5)]];
    const ctx = c.getContext('2d');
    ctx.save(); ctx.scale(S, S); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 0.75; ctx.strokeStyle = 'rgba(255,236,170,0.6)';
    all.forEach((s) => {
      contour(ctx, s, 1, 1.15); ctx.fillStyle = css(K); ctx.fill();
      lv.forEach((L) => { contour(ctx, s, L[0], 0); ctx.fillStyle = css(L[1]); ctx.fill(); });
      highlight(ctx, s);
    });
    ctx.restore();
    return c;
  });

})();
