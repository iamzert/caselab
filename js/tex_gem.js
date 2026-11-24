'use strict';

// Каменные скины (раунд 6): ножи, перчатки и дорогие скины (правило «каменный скин» — Art.isGem).
// Tex.gemOf(finishId) → { kind: 'gem_…', c, stone: { ru, en }, mat: { metal, rough, gem, sparkle, glow, clear }, dye: [осн., тёмн.] } или null.
// Текстура камня: Tex.make('gem:' + id, Tex.gemOf(id)); крашеная кожа перчаток: Tex.make('dye:' + id, { kind: 'gem_dye', c: Tex.gemOf(id).dye }).
// Генераторы — только природная структура камня, крупная и спокойная (читается в карточке 160×120, на клинке шириной ~25 px).
// Свет (грани, блики, искры) рисует art.js по mat; здесь — альбедо: тёмная сердцевина, светлые рёбра, цветовая глубина.
// Бюджет: одна текстура ≤ 25 мс. Попиксельные узоры считаются на половинной сетке 512×192 по грубым полям шума (шаг 4 ед.),
// огранка — векторно (многоугольники Вороного, разбитые на треугольные грани).
(function () {
  const L = Tex.lib;
  const W = L.W, H = L.H, S = L.S, TAU = Math.PI * 2;
  const fbm = L.fbm, mix = L.mix, clamp01 = L.clamp01, smooth = L.smooth, C = L.rgb;
  const FW = Math.round(W * S), FH = Math.round(H * S);

  // ---------- Помощники ----------
  const hexOf = (c) => (typeof c === 'string' ? C(c) : c);
  const css = (c, a) => (a == null ? 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'
    : 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')');
  // Таблица 256 цветов по опорам [[поз, цвет], …] или по равномерному списку цветов
  function lut(stops) {
    if (!Array.isArray(stops[0]) || typeof stops[0][0] !== 'number' || stops[0].length !== 2) stops = stops.map((c, i, a) => [i / (a.length - 1), c]);
    const st = stops.map((s) => [s[0], hexOf(s[1])]), t = new Uint8ClampedArray(256 * 3);
    for (let i = 0, k = 0; i < 256; i++) {
      const v = i / 255;
      while (k < st.length - 2 && v > st[k + 1][0]) k++;
      const c = mix(st[k][1], st[k + 1][1], clamp01((v - st[k][0]) / ((st[k + 1][0] - st[k][0]) || 1)));
      t[i * 3] = c[0]; t[i * 3 + 1] = c[1]; t[i * 3 + 2] = c[2];
    }
    return t;
  }
  const li = (t) => (t <= 0 ? 0 : t >= 1 ? 765 : ((t * 255) | 0) * 3);
  const lc = (T, t) => { const i = li(t); return [T[i], T[i + 1], T[i + 2]]; };
  const put = (o, T, t) => { const i = li(t); o[0] = T[i]; o[1] = T[i + 1]; o[2] = T[i + 2]; };   // без лишних массивов в горячем цикле
  // Растянуть до полного размера текстуры
  function up(c) {
    if (c.width === FW && c.height === FH) return c;
    const out = L.full(), x = out.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(c, 0, 0, out.width, out.height);
    return out;
  }
  // Попиксельная заливка на половинной сетке: fn(x, y, o) пишет o[0..2] (x, y — единицы поля 512×192)
  function rast(fn) {
    const w = FW >> 1, h = FH >> 1, k = W / w;
    const c = L.mk(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data, o = new Float32Array(3);
    let p = 0;
    for (let j = 0; j < h; j++) {
      const y = (j + 0.5) * k;
      for (let i = 0; i < w; i++) {
        fn((i + 0.5) * k, y, o);
        d[p] = o[0]; d[p + 1] = o[1]; d[p + 2] = o[2]; d[p + 3] = 255;
        p += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
    return up(c);
  }
  // Грубое поле (шаг 4 ед.) и билинейная выборка из него — шум без дорогого fbm на каждый пиксель
  const GS = 4, GW = W / GS + 1, GH = H / GS + 1;
  function grid(fn) {
    const a = new Float32Array(GW * GH);
    let o = 0;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) a[o++] = fn(i * GS, j * GS);
    return a;
  }
  function at(a, x, y) {
    let fx = x / GS, fy = y / GS;
    if (fx < 0) fx = 0; else if (fx > GW - 1.001) fx = GW - 1.001;
    if (fy < 0) fy = 0; else if (fy > GH - 1.001) fy = GH - 1.001;
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, p = j * GW + i;
    return (a[p] * (1 - u) + a[p + 1] * u) * (1 - v) + (a[p + GW] * (1 - u) + a[p + GW + 1] * u) * v;
  }
  const fb = (n, sx, sy, oct, ox, oy) => grid((x, y) => fbm(n, x * sx + (ox || 0), y * sy + (oy || 0), oct));
  // Клеточный шум на дрожащей сетке s: q(x, y) → f1, f2 (расстояния до ближайших точек), id, h (случайное 0..1 клетки)
  function worley(R, s, jit) {
    jit = jit == null ? 0.8 : jit;
    const nx = Math.ceil(W / s) + 4, ny = Math.ceil(H / s) + 4, px = new Float32Array(nx * ny), py = new Float32Array(nx * ny), hv = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      px[k] = (i - 2 + 0.5 + (R() - 0.5) * jit) * s; py[k] = (j - 2 + 0.5 + (R() - 0.5) * jit) * s; hv[k] = R();
    }
    const r = { f1: 0, f2: 0, id: 0, h: 0, px: px, py: py, hv: hv };
    r.q = function (x, y) {
      let ci = Math.floor(x / s) + 2, cj = Math.floor(y / s) + 2;
      if (ci < 1) ci = 1; else if (ci > nx - 2) ci = nx - 2;
      if (cj < 1) cj = 1; else if (cj > ny - 2) cj = ny - 2;
      let f1 = 1e9, f2 = 1e9, id = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const k = (cj + b) * nx + ci + a, dx = px[k] - x, dy = py[k] - y, d = dx * dx + dy * dy;
        if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
      }
      r.f1 = Math.sqrt(f1); r.f2 = Math.sqrt(f2); r.id = id; r.h = hv[id];
    };
    return r;
  }
  // Многоугольник: оставить часть, что ближе к p, чем к q (полуплоскость серединного перпендикуляра)
  function clip(poly, p, q) {
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, nx = q[0] - p[0], ny = q[1] - p[1], res = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      const da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny;
      if (da <= 0) res.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); res.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return res;
  }
  // Ячейки Вороного на «сотовой» дрожащей сетке шага s (видимые в поле): [{ x, y, poly }]
  function cells(R, s, jit) {
    const m = s * 1.6, sy = s * 0.9, nx = Math.ceil((W + 2 * m) / s) + 1, ny = Math.ceil((H + 2 * m) / sy) + 1, P = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      P.push([-m + (i + 0.5 + (j & 1) * 0.5 + (R() - 0.5) * jit) * s, -m + (j + 0.5 + (R() - 0.5) * jit) * sy]);
    }
    const out = [];
    for (let k = 0; k < P.length; k++) {
      const i = k % nx, j = (k / nx) | 0, p = P[k];
      if (p[0] < -s || p[0] > W + s || p[1] < -s || p[1] > H + s) continue;
      let poly = [[p[0] - s * 2, p[1] - s * 2], [p[0] + s * 2, p[1] - s * 2], [p[0] + s * 2, p[1] + s * 2], [p[0] - s * 2, p[1] + s * 2]];
      for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
        if (!a && !b) continue;
        const ii = i + a, jj = j + b;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        poly = clip(poly, p, P[jj * nx + ii]);
      }
      if (poly.length < 3) continue;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      poly.forEach((v) => { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]); });
      if (x1 < 0 || x0 > W || y1 < 0 || y0 > H) continue;
      out.push({ x: p[0], y: p[1], poly: poly });
    }
    return out;
  }
  // Векторный холст в единицах поля
  function vcan() { const c = L.full(), ctx = c.getContext('2d'); ctx.scale(S, S); return [c, ctx]; }
  // Извилистая линия (жилка, трещина) по шуму: от (x, y) под углом a длиной len
  function wiggle(ctx, n, x, y, a, len, amp, step) {
    step = step || 4;
    const a0 = a;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let d = step; d <= len; d += step) {
      a = a0 + n(x * 0.015, y * 0.015) * amp;
      x += Math.cos(a) * step; y += Math.sin(a) * step;
      ctx.lineTo(x, y);
    }
  }
  // Мелкие вкрапления (пирит, слюда, медь): неправильные многоугольнички
  function flecks(ctx, R, col, cnt, size, ang) {
    const c = hexOf(col);
    for (let i = 0; i < cnt; i++) {
      const x = R() * W, y = R() * H, s = size * (0.4 + R() * R() * 1.6), a = ang == null ? R() * TAU : ang + (R() - 0.5) * 0.5;
      ctx.fillStyle = css(mix(c, [255, 255, 255], R() * 0.35), 0.55 + R() * 0.45);
      ctx.beginPath();
      const k = 4 + ((R() * 3) | 0);
      for (let v = 0; v < k; v++) {
        const t = a + v / k * TAU, r = s * (0.5 + R() * 0.6) * (v & 1 ? 0.55 : 1);
        if (v) ctx.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r); else ctx.moveTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
      }
      ctx.closePath(); ctx.fill();
    }
  }

  // ---------- Огранённый прозрачный камень (gem_cut) и чёрный бриллиант (gem_noir) ----------
  // Ячейка Вороного = «пирамидка»: треугольные грани сходятся к вершине; грань, смотрящая на свет (сверху-слева), светлее.
  // У вершины грань темнее (тёмная сердцевина), к ребру — светлее; рёбра обведены светлой линией поверх тёмной (фаска).
  const LA = Math.atan2(-1, -0.8);
  const FIRE = ['#ff5a8a', '#5ab8ff', '#ffd84a', '#7affc8', '#c08aff'];
  const cutStops = (c) => [[0, c[0]], [0.42, c[1]], [0.78, c[2]], [1, c[3]]];
  // Холодная искра-звезда (4 луча)
  function star(ctx, x, y, r, c) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.45);
    g.addColorStop(0, css(c, 0.9)); g.addColorStop(1, css(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.strokeStyle = css(c, 0.85); ctx.lineCap = 'round';
    [[r, 0.55], [r * 0.55, 0.4]].forEach((p, k) => {
      const a = k ? Math.PI / 4 : 0, l = p[0];
      ctx.lineWidth = p[1];
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.moveTo(x + Math.sin(a) * l, y - Math.cos(a) * l); ctx.lineTo(x - Math.sin(a) * l, y + Math.cos(a) * l);
      ctx.stroke();
    });
  }
  // o: stops/stops2 (тон → цвет, второй цвет камня), s (шаг граней), split (грани «воздушным змеем»), base, core (глубина),
  // face (контраст граней), dark (затемнение к вершине), rim/rimW/rimC (рёбра), bevel (цвет узких фасок у рёбер), spoke, fire/fireN, stars, vein, crack, needle
  function facets(R, n, n2, o) {
    const cvx = vcan(), cv = cvx[0], ctx = cvx[1];
    const T = lut(o.stops), T2 = o.stops2 ? lut(o.stops2) : null, s = o.s || 44;
    const col = (t, m) => { const a = lc(T, t); return T2 ? mix(a, lc(T2, t), m) : a; };
    ctx.fillStyle = css(col(0.4, 0.5)); ctx.fillRect(0, 0, W, H);
    const cl = cells(R, s, 0.7), rim = new Path2D(), spokes = new Path2D(), verts = [];
    const base = o.base == null ? 0.42 : o.base, core = o.core == null ? 0.5 : o.core, face = o.face || 0.34, dark = o.dark == null ? 0.3 : o.dark;
    cl.forEach((cc) => {
      const bt = base + 0.22 * (R() - 0.5) + core * fbm(n, cc.x * 0.006, cc.y * 0.012, 2);
      const m = T2 ? clamp01(0.5 + 1.8 * fbm(n2, cc.x * 0.005 + 3.1, cc.y * 0.009, 2)) : 0;
      const ax = cc.x + (R() - 0.5) * s * 0.18, ay = cc.y + (R() - 0.5) * s * 0.18;
      const P = cc.poly, k = P.length;
      for (let e = 0; e < k; e++) {
        const a = P[e], b = P[(e + 1) % k], md = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const parts = o.split ? [[a, md], [md, b]] : [[a, b]];
        for (let pi = 0; pi < parts.length; pi++) {
          const p = parts[pi][0], q = parts[pi][1], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
          const fc = Math.cos(Math.atan2(my - ay, mx - ax) - LA);
          const t = bt + face * fc + (R() - 0.5) * 0.16 + (o.split ? (pi ? 0.08 : -0.08) : 0);
          const g = ctx.createLinearGradient(ax, ay, mx, my);
          g.addColorStop(0, css(col(t - dark, m)));
          g.addColorStop(1, css(col(t + 0.06, m)));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill();
        }
        spokes.moveTo(ax, ay); spokes.lineTo(a[0], a[1]);
        if (o.split) { spokes.moveTo(ax, ay); spokes.lineTo(md[0], md[1]); }
        rim.moveTo(a[0], a[1]); rim.lineTo(b[0], b[1]);
        if (a[0] > 2 && a[0] < W - 2 && a[1] > 2 && a[1] < H - 2) verts.push(a);
      }
    });
    const hi = o.rimC ? C(o.rimC) : lc(T, 1);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = css(lc(T, 0), 0.5); ctx.lineWidth = 1.7; ctx.stroke(rim);
    ctx.strokeStyle = css(hi, o.spoke == null ? 0.2 : o.spoke); ctx.lineWidth = 0.45; ctx.stroke(spokes);
    ctx.strokeStyle = css(hi, o.rim == null ? 0.6 : o.rim); ctx.lineWidth = o.rimW || 0.7; ctx.stroke(rim);
    if (o.bevel) {   // узкие светлые фаски вдоль рёбер, повёрнутых к свету (с внутренней стороны ребра)
      const bc = C(o.bevel);
      ctx.lineWidth = 0.6;
      cl.forEach((cc) => {
        const P = cc.poly, k = P.length;
        for (let e = 0; e < k; e++) {
          const a = P[e], b = P[(e + 1) % k], fc = Math.cos(Math.atan2((a[1] + b[1]) / 2 - cc.y, (a[0] + b[0]) / 2 - cc.x) - LA);
          if (fc < 0.15) continue;
          ctx.strokeStyle = css(bc, 0.15 + 0.4 * fc);
          ctx.beginPath(); ctx.moveTo(a[0] + (cc.x - a[0]) * 0.04, a[1] + (cc.y - a[1]) * 0.04); ctx.lineTo(b[0] + (cc.x - b[0]) * 0.04, b[1] + (cc.y - b[1]) * 0.04); ctx.stroke();
        }
      });
    }
    // Включения: трещинки и вуали (хрусталь, изумруд), иглы рутила, золотые жилки
    if (o.crack) {
      for (let i = 0; i < 7; i++) {
        wiggle(ctx, n, R() * W, R() * H, R() * TAU, 30 + R() * 80, 1.4, 3);
        ctx.strokeStyle = css(hi, o.crack * 0.3); ctx.lineWidth = 2.6; ctx.stroke();
        ctx.strokeStyle = css(hi, o.crack); ctx.lineWidth = 0.5; ctx.stroke();
      }
    }
    if (o.needle) {
      const nc = C(o.needle), a0 = R() * TAU;
      for (let i = 0; i < 46; i++) {
        const x = R() * W, y = R() * H, a = a0 + (R() - 0.5) * 0.8 + (R() < 0.3 ? 1.1 : 0), len = 16 + R() * 60;
        ctx.strokeStyle = css(mix(nc, [255, 255, 255], R() * 0.4), 0.5 + R() * 0.5); ctx.lineWidth = 0.5 + R() * 0.7;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
      }
    }
    if (o.vein) {
      const vc = C(o.vein);
      for (let i = 0; i < (o.veinN || 4); i++) {
        wiggle(ctx, n2, R() * W, R() * H, (R() - 0.5) * 1.2 + (R() < 0.5 ? 0 : Math.PI), 120 + R() * 220, 1.6, 3);
        ctx.strokeStyle = css(mix(vc, [0, 0, 0], 0.65), 0.6); ctx.lineWidth = 2.6; ctx.stroke();
        ctx.strokeStyle = css(vc); ctx.lineWidth = 1.2; ctx.stroke();
        ctx.strokeStyle = css(mix(vc, [255, 255, 255], 0.6), 0.85); ctx.lineWidth = 0.4; ctx.stroke();
      }
    }
    // «Огонь» — цветные проблески на вершинах граней; у чёрного бриллианта — холодные звёзды
    const fire = o.fire || FIRE, fN = o.fireN == null ? 10 : o.fireN;
    if (verts.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < fN; i++) {
        const v = verts[(R() * verts.length) | 0], r = 2 + R() * 3, c = C(fire[i % fire.length]);
        const g = ctx.createRadialGradient(v[0], v[1], 0, v[0], v[1], r);
        g.addColorStop(0, css(c, 0.8)); g.addColorStop(1, css(c, 0));
        ctx.fillStyle = g; ctx.fillRect(v[0] - r, v[1] - r, 2 * r, 2 * r);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < (o.stars || 0); i++) { const v = verts[(R() * verts.length) | 0]; star(ctx, v[0], v[1], 5 + R() * 5, C(fire[i % fire.length])); }
    }
    return cv;
  }
  Tex.addGen('gem_cut', (f, R, n, n2) => facets(R, n, n2, Object.assign({ stops: cutStops(f.c), stops2: f.c2 ? cutStops(f.c2) : null }, f.o || {})));
  // Чёрная звезда: тело почти чёрное с лёгкой синевой (весь тон грани — в 0..0.55), крупные грани читаются в карточке;
  // светлое — только узкие фаски вдоль рёбер. Искр и «огня» в альбедо нет — их даёт свет (mat.sparkle, mat.gem).
  Tex.addGen('gem_noir', (f, R, n, n2) => facets(R, n, n2, {
    stops: [[0, '#000000'], [0.3, '#020205'], [0.6, '#08091a'], [0.85, '#14162c'], [1, '#1e2140']],
    s: 80, split: true, base: 0.3, core: 0.25, face: 0.6, dark: 0.35,
    rim: 0, spoke: 0.1, rimC: '#2a2c4e', fireN: 0, stars: 0, bevel: '#969cdc',
  }));

  // ---------- Полосчатые непрозрачные (gem_band): малахит, агат, оникс, яшма полосами, флюорит, глазки ----------
  const hsh = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const HT = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) HT[i] = hsh(i);
  const hq = (i) => HT[i & 4095];   // быстрый хэш номера полосы (таблица)
  // Поверх растра — векторный слой в единицах поля
  function ctxOf(cv) { const ctx = cv.getContext('2d'); ctx.setTransform(S, 0, 0, S, 0, 0); return ctx; }
  Tex.addGen('gem_band', (f, R, n, n2, n3) => {
    const o = f.o || {}, T = lut(f.c), mode = o.mode || 'line', per = o.per || 11;
    const w1 = fb(n, 0.012, 0.016, 3), w2 = fb(n2, 0.02, 0.026, 2), m1 = fb(n3, 0.008, 0.012, 3);
    let cv;
    if (mode === 'conc' || mode === 'agate') {
      // Концентрические полосы вокруг нескольких центров (малахит — «глазки», агат — одна-две крупные жеоды)
      const K = mode === 'conc' ? 8 : 2, cx = [], cy = [];
      for (let i = 0; i < K; i++) { cx.push(mode === 'conc' ? R() * W : W * (0.25 + 0.5 * i) + (R() - 0.5) * 60); cy.push(R() * H); }
      const amp = mode === 'conc' ? 10 : 34, core = o.core || 0;
      cv = rast((x, y, out) => {
        const a = at(w1, x, y), b = at(w2, x, y);
        let d = 1e9;
        for (let i = 0; i < K; i++) { const dx = x - cx[i], dy = (y - cy[i]) * 1.3, q = Math.sqrt(dx * dx + dy * dy) * (1 + 0.3 * a); if (q < d) d = q; }
        d += amp * a + amp * 0.4 * b;
        if (core && d < core) {   // кварцевая сердцевина агата: светлее, с мелкой «щёткой»
          const t = 0.7 + 0.25 * at(m1, x * 3, y * 3) + 0.1 * (d / core);
          put(out, T, t); return;
        }
        const u = d / per, i = Math.floor(u), fr = u - i, h = hq(i + (mode === 'conc' ? 0 : 17));
        let t = fr < 0.25 + 0.5 * h ? 0.15 + 0.35 * h : 0.5 + 0.4 * hq(i + 91);
        if (mode === 'agate' && fr > 0.9) t = 1;   // тонкая белая линия между слоями агата
        t += 0.06 * Math.sin(u * TAU * 3);
        put(out, T, t);
      });
    } else if (mode === 'orb') {
      // Леопардовая яшма: пятнистая каменная масса (мягкие тёмные пятна разного размера) и редкие размытые кольца-глазки
      const bs = o.blot || 15, wr = worley(R, o.cell || 34, 0.9), bl = worley(R, bs, 0.9), ro = o.ring == null ? 0.2 : o.ring;
      const sg = grid((x, y) => {   // пятна мягкие — на грубой сетке
        bl.q(x + 7 * at(w1, x, y), y + 7 * at(w2, x, y));
        return bl.h < 0.5 ? (1 - smooth(0.2, 0.85, bl.f1 / bs)) * (0.5 - bl.h) * 2 : 0;
      });
      cv = rast((x, y, out) => {
        const a = at(w1, x, y), m = at(m1, x, y), b = at(w2, x, y);
        let t = 0.6 + 0.45 * m + 0.12 * b - 0.34 * at(sg, x, y);
        wr.q(x + 5 * a, y + 5 * b);
        if (wr.h < ro) {
          const r = 6 + 6 * hq(wr.id * 3 + 1), q = wr.f1 / r;
          if (q < 1.3) { const e = q - 0.85; t += 0.1 * (1 - smooth(0.3, 0.8, q)) - 0.34 * Math.exp(-e * e / 0.045); }
        }
        put(out, T, t);
      });
    } else {
      // Параллельные слои разной толщины (оникс, зебровая яшма, флюорит)
      const ang = o.ang == null ? 0.35 : o.ang, ca = Math.cos(ang), sa = Math.sin(ang), amp = o.amp || 26, bin = !!o.bin, soft = o.soft || 0;
      cv = rast((x, y, out) => {
        const a = at(w1, x, y), b = at(w2, x, y);
        const u = (y * ca + x * sa + amp * a + amp * 0.3 * b) / per + 0.6 * Math.sin((x * ca - y * sa) * 0.01);
        const i = Math.floor(u), fr = u - i, h = hq(i);
        let t;
        if (bin) t = fr < 0.3 + 0.45 * h ? 0 : 1;
        else {
          t = h;
          if (soft) t = h + (hq(i + 1) - h) * smooth(1 - soft, 1, fr);
          t += 0.05 * Math.sin(u * TAU * 4) + 0.08 * at(m1, x, y);
        }
        put(out, T, t);
      });
    }
    return cv;
  });

  // ---------- Жилковатые непрозрачные (gem_vein): мрамор, содалит, лазурит, бирюза с сеткой, родонит, яшмы, окаменелое дерево ----------
  Tex.addGen('gem_vein', (f, R, n, n2, n3) => {
    const o = f.o || {}, T = lut(f.c), mode = o.mode || 'marble';
    const m1 = fb(n, 0.006, 0.01, 3), m2 = fb(n2, 0.022, 0.03, 2);
    const vc = o.vein ? C(o.vein) : null, vw = o.vw || 0.022;
    let cv;
    if (mode === 'web') {
      // Клетки с тёмной «матрицей» между ними (бирюза, родонит, септарий, питоновая яшма)
      const wr = worley(R, o.cell || 24, 0.95), ww = o.ww || 1.6, wq = fb(n3, 0.02, 0.02, 2), wa = o.wa || 1;
      cv = rast((x, y, out) => {
        const a = at(wq, x, y), b = at(m2, x, y), m = at(m1, x, y);
        wr.q(x + 9 * a, y + 9 * b);
        const e = wr.f2 - wr.f1, wd = ww * clamp01(0.25 + 4 * m);   // местами сетка пропадает — не «плитка»
        put(out, T, 0.4 + 0.22 * wr.h + 0.9 * m + 0.3 * b + 0.15 * a);
        if (e < wd) { const k = (1 - smooth(wd * 0.3, wd, e)) * wa; out[0] += (vc[0] - out[0]) * k; out[1] += (vc[1] - out[1]) * k; out[2] += (vc[2] - out[2]) * k; }
      });
    } else {
      // Мрамор и пёстрая яшма: пятна крупного шума и извилистые жилки (|шум| ≈ 0)
      const v1 = grid((x, y) => fbm(n3, x * 0.007 + 1.6 * fbm(n2, x * 0.006, y * 0.01, 2), y * 0.014, 3));
      const v2 = grid((x, y) => fbm(n3, x * 0.018 + 40, y * 0.024 + 1.2 * fbm(n, x * 0.01, y * 0.01, 2), 2));
      const cl = o.cloud ? C(o.cloud) : null, jasp = mode === 'jasper', ck = o.ck || 0.8, rib = o.rib == null ? 0.12 : o.rib;
      cv = rast((x, y, out) => {
        const a = at(m1, x, y), b = at(m2, x, y);
        let c = lc(T, jasp ? 0.5 + 1.1 * a + 0.35 * b + rib * Math.sin((y + 30 * a) * 0.12) : 0.5 + 0.8 * a + 0.2 * b);
        if (cl) { const k = smooth(0.18, 0.4, at(m2, x * 0.7 + 50, y * 0.7) + 0.4 * a); if (k > 0) c = mix(c, cl, k * ck); }
        if (vc) {
          const e1 = Math.abs(at(v1, x, y)), e2 = Math.abs(at(v2, x, y));
          const k = Math.max(1 - smooth(vw * 0.3, vw, e1), (1 - smooth(vw * 0.15, vw * 0.5, e2)) * (o.fine == null ? 0.55 : o.fine));
          if (k > 0) c = mix(c, vc, k);
        }
        out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
      });
    }
    const ctx = ctxOf(cv);
    if (o.spots) {   // далматиновая яшма: тёмные пятнышки разного размера
      const sc = C(o.spots);
      const sr = o.spotR || 5;
      for (let i = 0; i < (o.spotN || 70); i++) { ctx.fillStyle = css(sc, 0.75 + R() * 0.25); L.blob(ctx, R() * W, R() * H, 0.8 + R() * R() * sr, R); }
    }
    if (o.fl) flecks(ctx, R, o.fl[0], o.fl[1], o.fl[2]);
    return cv;
  });

  // ---------- Волокнистые с переливом (gem_fiber): тигровый и соколиный глаз, бронзит, кианит (лезвия), чароит ----------
  Tex.addGen('gem_fiber', (f, R, n, n2, n3) => {
    const o = f.o || {}, T = lut(f.c), mode = o.mode || 'eye';
    const w1 = fb(n, 0.006, 0.014, 3), w2 = fb(n2, 0.014, 0.02, 2), m1 = fb(n3, 0.01, 0.01, 2);
    const fib = new Float32Array(1024);   // волокна: таблица случайной яркости поперёк полос
    for (let i = 0; i < 1024; i++) fib[i] = R();
    const fibAt = (v) => { const i = Math.floor(v) & 1023, u = v - Math.floor(v); return fib[i] + (fib[(i + 1) & 1023] - fib[i]) * u; };
    let cv;
    if (mode === 'blade') {
      // Кианит: вытянутые лезвийные кристаллы разного тона, тонкая штриховка вдоль лезвия, перламутровый отлив на части кристаллов
      const wr = worley(R, o.cell || 12, 0.9), IR = lut(o.nacre || ['#e8e0ff', '#d0f0ff', '#ffe0f0', '#e8e0ff']), nk = o.nk || 0.45;
      cv = rast((x, y, out) => {
        const a = at(w1, x, y), b = at(w2, x, y);
        wr.q((x + y * 0.35) * 0.08 + 3 * a, y + 3 * b);
        const h = wr.h, h2 = hq(wr.id * 7 + 3);
        let t = 0.4 + 0.26 * h + 0.22 * (fibAt((y - x * 0.08) * 1.3 + 40 * h) - 0.5) + 0.25 * at(m1, x, y);
        if (wr.f2 - wr.f1 < 0.8) t -= 0.18;   // тёмный шов между кристаллами
        let c = lc(T, t);
        const ph = 0.5 + 0.5 * Math.sin(x * 0.02 + y * 0.05 + 6 * a), k = nk * smooth(0.45, 0.95, h2) * (0.5 + 0.5 * Math.sin(x * 0.04 + 9 * h));
        if (k > 0) c = mix(c, lc(IR, ph), k);
        out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
      });
    } else if (mode === 'swirl') {
      // Чароит: шелковистые завихрения
      cv = rast((x, y, out) => {
        const a = at(w1, x, y), b = at(w2, x, y);
        const ph = x * 0.03 + y * 0.012 + 7 * a + 2.5 * b;
        const t = 0.5 + 0.36 * Math.sin(ph) + 0.1 * Math.sin(ph * 5.3 + 2 * b) + 0.07 * Math.sin(ph * 15) + 0.25 * at(m1, x, y);
        put(out, T, t);
      });
    } else {
      const amp = o.amp || 40, per = o.per || 34, sk = o.skew || 0.25;
      // lo/rng — тон и размах перелива (мягкий шатоянс — узкий размах без швов), fa — сила тонких волокон
      const lo = o.lo == null ? 0.12 : o.lo, rng = o.rng || 0.82, fa = o.fa == null ? 0.16 : o.fa, seam = o.seam !== false;
      cv = rast((x, y, out) => {
        const a = at(w1, x, y), b = at(w2, x, y);
        const u = (y + x * sk + amp * a + amp * 0.25 * b) / per;   // полосы-складки поперёк волокон
        const sh = 0.5 + 0.5 * Math.sin(u * TAU + 1.5 * b);          // перелив: светлая полоса, где волокна ловят свет
        const fv = fibAt((x - y * sk * 0.6 + 6 * a) * (o.fine || 0.9)) - 0.5;   // тонкие волокна
        let t = lo + rng * smooth(0.15, 0.85, sh) + fa * fv;
        const fr = u - Math.floor(u);
        if (seam && fr < 0.05) t *= 0.55;   // тёмный шов между складками
        put(out, T, t);
      });
    }
    return cv;
  });

  // ---------- Опал (gem_opal): игра цвета — мелкие резкие спектральные пятна, вытянутые в одну сторону (пинфайр, арлекин) ----------
  // Цвет пятна берётся из плавного поля оттенка (соседние пятна — родственных цветов, без «радужной каши»), часть пятен погашена.
  // o: fl (спектр по порядку), cell/stretch (размер и вытянутость пятен), on (доля горящих пятен), amt (насыщенность),
  // matrix + vw — болдер: железистая матрица, опал только в тонких жилах шириной vw
  Tex.addGen('gem_opal', (f, R, n, n2, n3) => {
    const o = f.o || {}, B = lut(f.c), fl = o.fl || FIRE, FL = lut(fl.concat([fl[0]])), harl = o.mode === 'harlequin';
    const w1 = fb(n, 0.014, 0.02, 3), m1 = fb(n2, 0.01, 0.014, 3), m2 = fb(n3, 0.008, 0.016, 3), hz = fb(n2, 0.004, 0.007, 2, 40, 10);
    const cs = o.cell || (harl ? 14 : 6), st = o.stretch || (harl ? 1.5 : 3), wr = worley(R, cs, harl ? 0.55 : 0.95);
    const on = o.on == null ? 0.5 : o.on, amt = o.amt || 0.95, mt = o.matrix ? lut(o.matrix) : null, vw = o.vw || 0.05;
    const vn = mt ? fb(n3, 0.009, 0.006, 3, 20, 0) : null;
    // zone — крупные мягкие зоны тела (огненный опал): тёмный край зоны, светящееся «ядро» — объём и глубина вместо ровной заливки;
    // clus — пинфайр редкими гроздьями: вспышки горят только там, где низкочастотное поле выше порога
    let zg = null;
    if (o.zone) {   // зоны мягкие и крупные — считаются на грубой сетке (дёшево), швы размыты сдвигом шума
      const zn = worley(R, o.zone, 0.85);
      zg = grid((x, y) => {
        const q = fbm(n3, x * 0.01 + 55, y * 0.014 + 25, 2), q2 = fbm(n2, x * 0.012 + 9, y * 0.016 + 71, 2);
        zn.q(x + 34 * q, y + 24 * q2);
        return (0.72 + 0.3 * zn.h) * smooth(0, 0.7, (zn.f2 - zn.f1) / o.zone) + 0.14 * q;
      });
    }
    const cl = o.clus != null ? fb(n, 0.016, 0.024, 2, 80, 40) : null, sh0 = o.seam || 0.3, sh1 = o.seam ? o.seam * 3 : 1.3;
    const N = wr.px.length, h2 = new Float32Array(N), dc = new Float32Array(N), ds = new Float32Array(N);
    for (let k = 0; k < N; k++) { const d = (R() - 0.5) * 1.1; h2[k] = R(); dc[k] = Math.cos(d) / cs; ds[k] = Math.sin(d) / cs; }
    return rast((x, y, out) => {
      const a = at(w1, x, y), m = at(m1, x, y), z = at(m2, x, y);
      let vk = 1;
      if (mt) {   // болдер: матрица всюду, опал — в тонких извилистых жилах
        const v = Math.abs(at(vn, x, y) + 0.25 * m);
        put(out, mt, 0.5 + 1.5 * a + 0.2 * Math.sin(y * 0.3 + 20 * a));
        if (v > vw) return;
        vk = 1 - smooth(vw * 0.55, vw, v);
        const bc = lc(B, 0.5 + z);
        out[0] += (bc[0] - out[0]) * vk; out[1] += (bc[1] - out[1]) * vk; out[2] += (bc[2] - out[2]) * vk;
      } else if (zg) put(out, B, 0.08 + at(zg, x, y) + 0.26 * z + 0.06 * a);   // тёмный шов между зонами → светящееся ядро
      else put(out, B, 0.5 + 0.9 * z);
      let ck = 1;
      if (cl) { ck = smooth(o.clus, o.clus + 0.07, at(cl, x, y) + 0.25 * m); if (ck <= 0) return; }
      const wx = (x + y * 0.25) / st + 5 * a, wy = y + 4 * m;
      wr.q(wx, wy);
      const k = wr.id, lit = smooth(-0.06, 0.06, on + (cl ? 0.3 : 0.9) * m - h2[k]) * ck;
      if (lit <= 0) return;
      const proj = (wx - wr.px[k]) * dc[k] + (wy - wr.py[k]) * ds[k];
      const br = (0.45 + 0.55 * smooth(-0.55, 0.5, proj)) * smooth(sh0, sh1, wr.f2 - wr.f1);   // вспышка к одному краю, резкий тёмный шов
      const hu = 0.5 + (o.hs || 1.3) * at(hz, x, y) + 0.12 * wr.h + 0.08 * proj, c = lc(FL, hu - Math.floor(hu));
      const it = lit * br * amt * vk;
      out[0] += (c[0] - out[0]) * it; out[1] += (c[1] - out[1]) * it; out[2] += (c[2] - out[2]) * it;
    });
  });

  // ---------- Перламутр (gem_pearl): слоистый радужный блеск ----------
  Tex.addGen('gem_pearl', (f, R, n, n2) => {
    const o = f.o || {}, B = lut(f.c), IR = lut((o.fl || ['#ffd0dc', '#fff2d8', '#d8f4e4', '#d8e2ff', '#f0d8ff', '#ffd0dc']));
    const w1 = fb(n, 0.008, 0.016, 3), w2 = fb(n2, 0.02, 0.03, 2);
    return rast((x, y, out) => {
      const a = at(w1, x, y), b = at(w2, x, y);
      const ph = y * 0.035 + x * 0.008 + 6 * a + 1.5 * b;
      const br = 0.5 + 0.35 * Math.sin(ph * 0.9) + 0.1 * Math.sin(ph * TAU * 1.2);
      const ir = ph * 0.22 + x * 0.003;
      const c = mix(lc(B, br), lc(IR, ir - Math.floor(ir)), o.amt || 0.5);
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    });
  });

  // ---------- Янтарь и солнечный камень (gem_amber): тёплые облака, редкие включения или медные блёстки ----------
  Tex.addGen('gem_amber', (f, R, n, n2) => {
    const o = f.o || {}, T = lut(f.c), m1 = fb(n, 0.007, 0.011, 3), m2 = fb(n2, 0.02, 0.025, 2), lay = o.layer || 0;
    const cv = rast((x, y, out) => {
      const a = at(m1, x, y), b = at(m2, x, y);
      let t = 0.55 + 0.95 * a + 0.25 * b + 0.06 * Math.sin(y * 0.14 + 12 * a);
      if (lay) {   // натёчные слои смолы: светлые и тёмные полосы, плавно изогнутые
        const v = (y + 46 * a + 0.22 * x) * 0.055;
        t += lay * (smooth(0.3, 0.7, 0.5 + 0.5 * Math.sin(v + 2.2 * Math.sin(v * 0.37))) - 0.5);
      }
      put(out, T, t);
    });
    const ctx = ctxOf(cv);
    if (o.fl) flecks(ctx, R, o.fl[0], o.fl[1], o.fl[2], R() * TAU);
    else {
      const lt = lc(T, 1), dk = lc(T, 0);
      for (let i = 0; i < 5; i++) {   // «солнечные блёстки» — плоские дисковые трещинки
        const x = R() * W, y = R() * H, r = 2.5 + R() * 4;
        ctx.fillStyle = css(lt, 0.5); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, R() * 3, 0, TAU); ctx.fill();
        ctx.strokeStyle = css(lt, 0.8); ctx.lineWidth = 0.4; ctx.stroke();
      }
      const nb = o.bubbles || 9;
      for (let i = 0; i < nb; i++) {   // пузырьки (светлый с тёмным ободком и бликом) и тёмные соринки, местами — гроздьями
        let x = R() * W, y = R() * H;
        const cnt = R() < 0.3 ? 3 + ((R() * 4) | 0) : 1;
        for (let q = 0; q < cnt; q++) {
          const r = 0.6 + R() * (cnt > 1 ? 1.2 : 2), soot = R() < 0.25;
          if (soot) { ctx.fillStyle = css(dk, 0.8); ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, TAU); ctx.fill(); }
          else {
            ctx.fillStyle = css(lt, 0.35); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
            ctx.strokeStyle = css(dk, 0.6); ctx.lineWidth = 0.4; ctx.stroke();
            ctx.fillStyle = css([255, 255, 255], 0.85); ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, TAU); ctx.fill();
          }
          x += (R() - 0.5) * 9; y += (R() - 0.5) * 7;
        }
      }
    }
    return cv;
  });

  // ---------- Нефрит, халцедон, хризопраз, лунный камень, авантюрин, амазонит (gem_jade): мягкая мутность ----------
  // o: band (слоистость), sheen (адуляресценция), depth (объём: светлые «ядра» в толще, темнее между ними),
  // milk/mk (молочные облака), veil (число тонких трещинок-вуалей), hatch [цвет, сила] (решётка-штриховка амазонита), fl (блёстки)
  Tex.addGen('gem_jade', (f, R, n, n2, n3) => {
    const o = f.o || {}, T = lut(f.c), m1 = fb(n, 0.008, 0.012, 3), m2 = fb(n2, 0.025, 0.03, 2), m3 = fb(n3, 0.004, 0.02, 2);
    const sh = o.sheen ? C(o.sheen) : null, band = o.band || 0, dp = o.depth || 0, wd = dp ? worley(R, o.dcell || 80, 0.9) : null;
    const mc = o.milk ? C(o.milk) : null, mk = o.mk || 0.45, mm = mc ? fb(n3, 0.011, 0.017, 3, 70, 30) : null;
    const hc = o.hatch ? C(o.hatch[0]) : null, ha = o.hatch ? o.hatch[1] : 0;
    const cv = rast((x, y, out) => {
      const a = at(m1, x, y), b = at(m2, x, y);
      let t = 0.5 + 0.85 * a + 0.22 * b;
      if (band) t += band * Math.sin((y + 40 * a + x * 0.15) * 0.16);
      if (wd) { wd.q(x + 30 * a, y + 30 * b); const e = wd.f1 / (wd.f1 + wd.f2); t += dp * (0.55 - 2.2 * e * e * 2); }
      let c = lc(T, t);
      if (mc) { const k = smooth(0.02, 0.4, at(mm, x, y) + 0.25 * b); if (k > 0) c = mix(c, mc, k * mk); }
      if (hc) {   // пертитовая решётка: две семьи коротких светлых штрихов под углом друг к другу
        let k = 0;
        for (let s2 = 0; s2 < 2; s2++) {
          const ca = s2 ? 0.94 : 0.5, sa = s2 ? -0.34 : 0.87;
          const u = (x * ca + y * sa + 6 * a) / 9, v = (-x * sa + y * ca) / 26, iu = Math.floor(u), fu = u - iu;
          if (hq(iu * 31 + Math.floor(v + hq(iu) * 3) * 7 + s2 * 997) < 0.42) continue;
          k = Math.max(k, 1 - smooth(0.05, 0.16, Math.abs(fu - 0.5)));
        }
        if (k > 0) c = mix(c, hc, k * ha * (0.6 + 0.4 * smooth(-0.2, 0.2, b)));
      }
      if (sh) {   // адуляресценция лунного камня: голубое свечение плавной полосой
        const d = (y - H * 0.5 - 70 * at(m3, x, y)) / 34, k = Math.exp(-d * d) * (0.6 + 0.4 * Math.sin(x * 0.012 + 3 * a));
        c = mix(c, sh, clamp01(k) * 0.75);
      }
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    });
    const ctx = ctxOf(cv);
    if (o.veil) {   // трещинки-вуали: широкое светлое облачко и тонкая линия
      const vc = mc || lc(T, 1);
      for (let i = 0; i < o.veil; i++) {
        wiggle(ctx, n, R() * W, R() * H, R() * TAU, 30 + R() * 70, 1.2, 3);
        ctx.strokeStyle = css(vc, 0.12); ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = css(vc, 0.45); ctx.lineWidth = 0.45; ctx.stroke();
      }
    }
    if (o.fl) flecks(ctx, R, o.fl[0], o.fl[1], o.fl[2]);
    return cv;
  });

  // ---------- Тёмное стекло и металл (gem_glass): обсидиан с отливом, снежный обсидиан, гематит, пирит ----------
  Tex.addGen('gem_glass', (f, R, n, n2, n3) => {
    const o = f.o || {}, T = lut(f.c), mode = o.mode || 'obs';
    const m1 = fb(n, 0.004, 0.012, 3), m2 = fb(n2, 0.012, 0.02, 2), m3 = fb(n3, 0.01, 0.006, 2);
    let cv;
    if (mode === 'hem') {
      const cube = !!o.cube, wc = cube ? worley(R, 30, 0.75) : null;
      cv = rast((x, y, out) => {
        const a = at(m1, x, y), b = at(m2, x, y);
        let t = 0.45 + 0.7 * a + 0.12 * Math.sin(y * 0.35 + 14 * b);
        if (cube) {   // пирит: кубические грани с поперечной штриховкой
          wc.q(x + 6 * b, y + 6 * a);
          const h = wc.h;
          t = 0.3 + 0.55 * h + 0.25 * a + 0.1 * Math.sin((h > 0.5 ? x : y) * 1.3);
          if (wc.f2 - wc.f1 < 1.4) t *= 0.5;
        }
        put(out, T, t);
      });
    } else {
      const shc = o.sheen ? C(o.sheen) : null, RB = o.rainbow ? lut(o.rainbow.concat([o.rainbow[0]])) : null;
      const cx = [W * 0.3, W * 0.78], cy = [H * 0.3, H * 0.75];
      cv = rast((x, y, out) => {
        const a = at(m1, x, y), b = at(m2, x, y);
        let t = 0.3 + 0.75 * a + 0.2 * b;
        const dx = x - cx[x < W / 2 ? 0 : 1], dy = y - cy[x < W / 2 ? 0 : 1];
        t += 0.06 * Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.3 + 8 * a);   // раковистый излом
        let c = lc(T, t);
        if (shc || RB) {
          const u = y + 0.3 * x + 60 * at(m3, x, y), s = Math.pow(0.5 + 0.5 * Math.sin(u * 0.13 + 5 * a), 4) * smooth(-0.15, 0.25, b + 0.3);
          const sc = RB ? lc(RB, (u * 0.012) - Math.floor(u * 0.012)) : shc;
          c = mix(c, sc, s * (o.amt || 0.55));
        }
        out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
      });
      if (o.snow) {   // снежинки: светлые пятна-«цветы»
        const ctx = ctxOf(cv), sc = C(o.snow);
        for (let i = 0; i < 26; i++) {
          const x = R() * W, y = R() * H, r = 4 + R() * 6;
          for (let p = 0; p < 6; p++) {
            const a = p / 6 * TAU + R(), px = x + Math.cos(a) * r * 0.5, py = y + Math.sin(a) * r * 0.5;
            const g = ctx.createRadialGradient(px, py, 0, px, py, r * 0.6);
            g.addColorStop(0, css(sc, 0.95)); g.addColorStop(0.5, css(sc, 0.6)); g.addColorStop(1, css(sc, 0));
            ctx.fillStyle = g; ctx.fillRect(px - r, py - r, 2 * r, 2 * r);
          }
        }
      }
    }
    return cv;
  });

  // ---------- Лабрадорит, спектролит, павлинья руда (gem_labra): тёмная основа с крупными пятнами отлива ----------
  Tex.addGen('gem_labra', (f, R, n, n2, n3) => {
    const o = f.o || {}, T = lut(f.c), FL = lut(o.fl), cov = o.cover || 0;
    const m1 = fb(n, 0.007, 0.012, 3), m2 = fb(n2, 0.006, 0.01, 2), m3 = fb(n3, 0.02, 0.03, 2);
    return rast((x, y, out) => {
      const a = at(m1, x, y), b = at(m2, x, y), d = at(m3, x, y);
      let c = lc(T, 0.5 + 0.8 * d + 0.4 * a);
      const k = smooth(0.0 - cov, 0.28 - cov, a + 0.25 * d) * (0.75 + 0.25 * Math.sin((x * 0.45 - y * 0.9) * 1.4 + 6 * d));
      const hu = 0.5 + 1.6 * b + 0.4 * a;
      if (k > 0) c = mix(c, lc(FL, hu - Math.floor(hu) < 0.5 ? (hu - Math.floor(hu)) * 2 : 2 - (hu - Math.floor(hu)) * 2), k * (o.amt || 0.9));
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    });
  });

  // ---------- Крашеная кожа перчаток на каменном скине (gem_dye): спокойный тон с мелкой фактурой ----------
  Tex.addGen('gem_dye', (f, R, n, n2) => {
    const a0 = C(f.c[0]), b0 = C(f.c[1] || f.c[0]), T = lut([b0, mix(a0, b0, 0.35), a0, mix(a0, [255, 255, 255], 0.1)]);
    const m1 = fb(n, 0.01, 0.014, 3), m2 = fb(n2, 0.03, 0.03, 2);
    return rast((x, y, out) => {
      const a = at(m1, x, y), e = Math.abs(at(m2, x, y));
      let t = 0.62 + 0.45 * a + 0.09 * n2(x * 0.55, y * 0.55);   // пятна выделки + мелкая «шагрень»
      if (e < 0.025) t -= 0.12 * (1 - e / 0.025);                  // мягкие складки
      put(out, T, t);
    });
  });

  // ---------- Библиотека камней ----------
  // Материал (0..1): прозрачные огранённые — gem 0.75–1, sparkle 0.4–1, rough 0.04–0.15, glow 0.3–0.7;
  // непрозрачные полированные — gem 0–0.2, clear 0.6–1, rough 0.08–0.25; с металлом — metal по месту.
  const MAT = {
    cut: { metal: 0, rough: 0.07, gem: 0.88, sparkle: 0.65, glow: 0.5, clear: 0.9 },
    pol: { metal: 0, rough: 0.14, gem: 0.08, sparkle: 0.06, glow: 0.1, clear: 0.85 },
    trn: { metal: 0, rough: 0.1, gem: 0.18, sparkle: 0.12, glow: 0.45, clear: 0.9 },
    silk: { metal: 0.12, rough: 0.12, gem: 0.12, sparkle: 0.1, glow: 0.2, clear: 0.85 },
    met: { metal: 0.85, rough: 0.18, gem: 0.12, sparkle: 0.2, glow: 0, clear: 0.6 },
    gls: { metal: 0.08, rough: 0.06, gem: 0.15, sparkle: 0.1, glow: 0.1, clear: 1 },
  };
  // g(ru, en, kind, c, o, mat — имя пресета или [пресет, { правки }])
  const g = (ru, en, kind, c, o, mat) => ({ ru: ru, en: en, kind: kind, c: c, o: o || {}, mat: mat });
  const ST = {
    // огранённые прозрачные
    diamond: g('Бриллиант', 'Diamond', 'gem_cut', ['#141c2a', '#7f93ab', '#e2eeff', '#ffffff'], { s: 46, split: true, fireN: 18, face: 0.42, core: 0.3, rim: 0.85 }, ['cut', { gem: 1, sparkle: 1, rough: 0.04, glow: 0.6 }]),
    rockcrystal: g('Горный хрусталь', 'Rock Crystal', 'gem_cut', ['#363c46', '#a3adb8', '#e4eaf0', '#ffffff'], { s: 54, crack: 0.5, fireN: 6 }, ['cut', { gem: 0.8, sparkle: 0.5, glow: 0.4 }]),
    icequartz: g('Ледяной кварц', 'Crackle Quartz', 'gem_cut', ['#123a5c', '#5ab8f0', '#d8f4ff', '#ffffff'], { s: 50, crack: 0.9, fireN: 6 }, ['cut', { gem: 0.8, sparkle: 0.55, glow: 0.55 }]),
    smoky: g('Дымчатый кварц', 'Smoky Quartz', 'gem_cut', ['#14100c', '#5a4c40', '#b0a090', '#f0e6da'], { s: 50, fireN: 5 }, ['cut', { gem: 0.8, sparkle: 0.45, glow: 0.35 }]),
    rutile: g('Рутиловый кварц', 'Rutilated Quartz', 'gem_cut', ['#1a1812', '#4a463a', '#a8a290', '#f0ece0'], { s: 56, needle: '#ffd400', fireN: 4 }, ['cut', { gem: 0.78, sparkle: 0.45, glow: 0.4 }]),
    sapphire: g('Сапфир', 'Sapphire', 'gem_cut', ['#020826', '#1a3c96', '#5a8cf0', '#d8e6ff'], { s: 44 }, 'cut'),
    abyss: g('Сапфир бездны', 'Abyss Sapphire', 'gem_cut', ['#010510', '#073450', '#1ae8d0', '#e8ffff'], { s: 46, split: true, core: 0.35, fire: ['#8a3aff', '#1affd8', '#c8a0ff'], fireN: 14 }, ['cut', { gem: 0.95, sparkle: 0.85, glow: 0.7 }]),
    cobspinel: g('Кобальтовая шпинель', 'Cobalt Spinel', 'gem_cut', ['#040c3a', '#1f50e8', '#80b4ff', '#e4eeff'], { s: 36 }, 'cut'),
    iolite: g('Иолит', 'Iolite', 'gem_cut', ['#050824', '#283896', '#7888e0', '#dce0ff'], { s: 50, split: true }, 'cut'),
    bluetopaz: g('Голубой топаз', 'Blue Topaz', 'gem_cut', ['#0c3460', '#3aa4e6', '#b4eaff', '#ffffff'], { s: 48 }, ['cut', { glow: 0.6 }]),
    aquamarine: g('Аквамарин', 'Aquamarine', 'gem_cut', ['#0c3646', '#48b0c0', '#bceeee', '#f4ffff'], { s: 58, crack: 0.25 }, ['cut', { gem: 0.8, glow: 0.6 }]),
    paraiba: g('Турмалин параиба', 'Paraiba Tourmaline', 'gem_cut', ['#02263a', '#08b4d8', '#5af0ff', '#e8ffff'], { s: 44, fire: ['#ff2fb3', '#7a3cff', '#19e6ff'], fireN: 14 }, ['cut', { sparkle: 0.8, glow: 0.7 }]),
    ruby: g('Рубин', 'Ruby', 'gem_cut', ['#26000a', '#c0102c', '#ff5a6e', '#ffd0d8'], { s: 44 }, 'cut'),
    garnet: g('Гранат', 'Garnet', 'gem_cut', ['#160106', '#700a1c', '#cc2848', '#ffb3c1'], { s: 30, core: 0.6 }, ['cut', { glow: 0.35 }]),
    redspinel: g('Красная шпинель', 'Red Spinel', 'gem_cut', ['#280404', '#c4261c', '#ff7a3a', '#ffd8a0'], { s: 40, split: true }, 'cut'),
    rubellite: g('Рубеллит', 'Rubellite', 'gem_cut', ['#1c0410', '#861a3a', '#de5078', '#ffc8da'], { s: 52, vein: '#c8a050', veinN: 2 }, ['cut', { metal: 0.1 }]),
    emerald: g('Изумруд', 'Emerald', 'gem_cut', ['#00180a', '#088646', '#38e088', '#d0ffe8'], { s: 50, crack: 0.35 }, ['cut', { sparkle: 0.55 }]),
    peridot: g('Перидот', 'Peridot', 'gem_cut', ['#182804', '#66a418', '#c4f04a', '#f4ffd0'], { s: 42 }, 'cut'),
    druse: g('Аметистовая друза', 'Amethyst Druse', 'gem_cut', ['#12062a', '#6a2ab0', '#c88aff', '#f6e8ff'], { s: 17, face: 0.4, fireN: 0 }, ['cut', { gem: 0.75, sparkle: 0.9, rough: 0.12 }]),
    royalam: g('Аметист с золотом', 'Gold-Veined Amethyst', 'gem_cut', ['#10042a', '#561a98', '#b070ff', '#f0dcff'], { s: 50, split: true, vein: '#ffd36b', veinN: 5, fire: ['#ffd36b', '#ff3a6a', '#c88aff'], fireN: 12 }, ['cut', { metal: 0.3, gem: 0.95, sparkle: 0.85, glow: 0.6 }]),
    tanzanite: g('Танзанит', 'Tanzanite', 'gem_cut', ['#08061e', '#382a98', '#8a70ff', '#e8dcff'], { s: 46 }, 'cut'),
    citrine: g('Цитрин', 'Citrine', 'gem_cut', ['#2e1800', '#cc8a14', '#ffd36b', '#fff8d8'], { s: 48, split: true, fire: ['#fff8d8', '#ffb340', '#ff7a3a'], fireN: 14 }, ['cut', { gem: 0.95, sparkle: 0.9, glow: 0.65 }]),
    imptopaz: g('Императорский топаз', 'Imperial Topaz', 'gem_cut', ['#300c00', '#cc5c18', '#ffb040', '#ffe8c0'], { s: 46, split: true, fire: ['#ff4f8a', '#ffd84a', '#5ab8ff'], fireN: 14 }, ['cut', { gem: 0.95, sparkle: 0.85, glow: 0.6 }]),
    spessartine: g('Спессартин', 'Spessartine', 'gem_cut', ['#280a00', '#cc4c08', '#ff8a2a', '#ffe0b0'], { s: 38 }, 'cut'),
    yellowsap: g('Жёлтый сапфир', 'Yellow Sapphire', 'gem_cut', ['#362600', '#dcb208', '#ffe84a', '#fffbd0'], { s: 44 }, 'cut'),
    watermelon: g('Арбузный турмалин', 'Watermelon Tourmaline', 'gem_cut', ['#280416', '#d42e68', '#ff8ab0', '#ffe0ec'], { s: 46, c2: 1 }, 'cut'),
    ametrine: g('Аметрин', 'Ametrine', 'gem_cut', ['#180a36', '#7a4af8', '#c8a0ff', '#f4ecff'], { s: 50, c2: 1 }, 'cut'),
    mystic: g('Мистик-топаз', 'Mystic Topaz', 'gem_cut', ['#0a0838', '#3a2aff', '#ff3aa0', '#ffe8a0'], { s: 42, split: true, c2: 1, fireN: 14 }, ['cut', { sparkle: 0.85, glow: 0.6, metal: 0.1 }]),
    // сфен: жёлто-оливковый с сильнейшим «огнём»; два близких тона, тёмная сердцевина — читается и на большом щитке перчаток
    sphene: g('Сфен', 'Sphene', 'gem_cut', ['#100c00', '#6e6206', '#c8b41c', '#f4ec9a'], { s: 56, split: true, core: 0.3, face: 0.3, dark: 0.32, rim: 0.45, fire: ['#ff7a2a', '#7aff5a', '#ffd84a'], fireN: 12 }, ['cut', { gem: 0.95, sparkle: 0.8, glow: 0.45 }]),
    // полосчатые
    malachite: g('Малахит', 'Malachite', 'gem_band', ['#021c0e', '#086036', '#12a35a', '#6ae0a0'], { mode: 'conc', per: 9 }, 'pol'),
    zebrajasper: g('Зебровая яшма', 'Zebra Jasper', 'gem_band', ['#4e4a44', '#857f74', '#bdb6a6', '#e4dccb'], { per: 16, amp: 34, ang: 0.5, soft: 0.8 }, 'pol'),
    onyx: g('Полосчатый оникс', 'Banded Onyx', 'gem_band', ['#24272c', '#3a3e45', '#5a5f67', '#8c9098'], { per: 14, soft: 0.7, amp: 16 }, 'pol'),
    fireagate: g('Огненный агат', 'Fire Agate', 'gem_band', ['#120604', '#5a1a08', '#ff4d12', '#ffd23a'], { mode: 'agate', per: 12, core: 0 }, ['pol', { gem: 0.2, glow: 0.3, sparkle: 0.15 }]),
    greenagate: g('Зелёный агат', 'Green Agate', 'gem_band', ['#18260f', '#4a6a30', '#a8c078', '#eef4d8'], { mode: 'agate', per: 11, core: 18 }, ['pol', { glow: 0.2 }]),
    bluelace: g('Голубой кружевной агат', 'Blue Lace Agate', 'gem_band', ['#24508c', '#7aaee8', '#c8e2ff', '#ffffff'], { mode: 'agate', per: 9, core: 18 }, ['pol', { glow: 0.2 }]),
    rhodochrosite: g('Родохрозит', 'Rhodochrosite', 'gem_band', ['#4a000a', '#c8183a', '#ff8aa0', '#ffd8e0'], { mode: 'agate', per: 10, core: 0 }, 'pol'),
    petrified: g('Окаменелое дерево', 'Petrified Wood', 'gem_vein', ['#3e2c22', '#6a4c38', '#94745a', '#b8a088'], { mode: 'jasper', rib: 0.04, cloud: '#d8d2c8', ck: 0.6 }, ['pol', { rough: 0.16 }]),
    mookaite: g('Мукаит', 'Mookaite', 'gem_vein', ['#5a2220', '#9c4a34', '#d09a58', '#eed6a6'], { mode: 'jasper', rib: 0, cloud: '#c8a0a8', ck: 0.35 }, ['pol', { rough: 0.16 }]),
    fluorite: g('Радужный флюорит', 'Rainbow Fluorite', 'gem_band', ['#3a2868', '#7a4ab0', '#2ec4b6', '#b8f0c0', '#ffd23f'], { per: 22, soft: 0.85, amp: 26, ang: 0.6 }, ['trn', { gem: 0.35, sparkle: 0.2 }]),
    leopardjasper: g('Леопардовая яшма', 'Leopard Jasper', 'gem_band', ['#2a1a0a', '#a87838', '#d8a85a', '#f0d090'], { mode: 'orb', cell: 24 }, 'pol'),
    // жилковатые
    marble: g('Белый мрамор', 'White Marble', 'gem_vein', ['#a8aeb6', '#dadee4', '#f6f8fa'], { vein: '#4a5058', vw: 0.02 }, ['pol', { rough: 0.2 }]),
    portoro: g('Чёрный мрамор с золотом', 'Gold-Veined Black Marble', 'gem_vein', ['#060606', '#121212', '#262626'], { vein: '#ffd36b', vw: 0.022, fine: 0.7 }, ['pol', { metal: 0.35, rough: 0.1 }]),
    sodalite: g('Содалит', 'Sodalite', 'gem_vein', ['#0a0e28', '#1c2e68', '#3a5aa0'], { vein: '#d8e0f0', vw: 0.026 }, 'pol'),
    lapis: g('Лазурит', 'Lapis Lazuli', 'gem_vein', ['#0a1040', '#1a2a8c', '#2e44c0'], { cloud: '#a8b0d0', ck: 0.3, fl: ['#ffd36b', 55, 1.5] }, ['pol', { metal: 0.12, sparkle: 0.25 }]),
    serpentine: g('Серпентин', 'Serpentine', 'gem_vein', ['#141f0e', '#3f5a2a', '#7a9444'], { vein: '#0a1008', vw: 0.024 }, 'pol'),
    amazonite: g('Амазонит', 'Amazonite', 'gem_jade', ['#147a7a', '#34c0b0', '#80ecdc', '#c8fff0'], { hatch: ['#effff8', 0.6], depth: 0.15 }, ['pol', { gem: 0.12, glow: 0.3 }]),
    chrysocolla: g('Хризоколла', 'Chrysocolla', 'gem_vein', ['#05223e', '#1488b8', '#38cccc', '#a8ecff'], { mode: 'jasper', vein: '#041420', vw: 0.014 }, 'pol'),
    turquoise: g('Бирюза', 'Turquoise', 'gem_vein', ['#2aa0b4', '#62cad4', '#a4ecee'], { mode: 'web', vein: '#4a4232', cell: 34, ww: 0.8, wa: 0.7 }, ['pol', { clear: 0.7, rough: 0.2, glow: 0.2 }]),
    rhodonite: g('Родонит', 'Rhodonite', 'gem_vein', ['#a01828', '#de4c68', '#ff9aa8'], { mode: 'web', vein: '#2a0c10', cell: 30, ww: 0.9, wa: 0.75 }, 'pol'),
    pythonjasper: g('Питоновая яшма', 'Python Jasper', 'gem_vein', ['#7a6038', '#c0a872', '#e0d0a0'], { mode: 'web', vein: '#1a140a', cell: 22, ww: 1.3 }, 'pol'),
    septarian: g('Септарий', 'Septarian', 'gem_vein', ['#b88a0c', '#f4cc00', '#ffe880'], { mode: 'web', vein: '#141008', cell: 34, ww: 2.6 }, 'pol'),
    redjasper: g('Красная яшма', 'Red Jasper', 'gem_vein', ['#3a1a0a', '#8a4a22', '#c46c34', '#e09060'], { mode: 'jasper' }, ['pol', { rough: 0.2 }]),
    landscape: g('Пейзажная яшма', 'Landscape Jasper', 'gem_vein', ['#5a462a', '#8f7449', '#c2a878', '#e8d8b0'], { mode: 'jasper', vein: '#3a2a18', vw: 0.012 }, ['pol', { rough: 0.2 }]),
    greenjasper: g('Зелёная яшма', 'Green Jasper', 'gem_vein', ['#24241a', '#44442e', '#6a6a4a', '#8e8e64'], { mode: 'jasper', vein: '#141410', vw: 0.01 }, ['pol', { rough: 0.22 }]),
    dalmatian: g('Далматиновая яшма', 'Dalmatian Jasper', 'gem_vein', ['#c8c0b0', '#dcd6c8', '#f0ece0'], { mode: 'jasper', spots: '#161616', spotN: 34, spotR: 2 }, ['pol', { rough: 0.2 }]),
    // волокнистые с переливом
    tigereye: g('Тигровый глаз', "Tiger's Eye", 'gem_fiber', ['#3a1c06', '#7a4410', '#c08428', '#f0c060'], { per: 110, amp: 18, skew: 0.12, lo: 0.42, rng: 0.38, fa: 0.16, fine: 2.2, seam: false }, 'silk'),
    hawkeye: g('Соколиный глаз', "Hawk's Eye", 'gem_fiber', ['#26364a', '#5a7a94', '#b4cce0'], { per: 120, amp: 20, skew: -0.1, lo: 0.3, rng: 0.42, fa: 0.14, fine: 2.4, seam: false }, 'silk'),
    bullseye: g('Бычий глаз', "Bull's Eye", 'gem_fiber', ['#601608', '#c4401a', '#ff9a4a'], { per: 100, amp: 16, skew: 0.18, lo: 0.32, rng: 0.4, fa: 0.14, fine: 2.2, seam: false }, 'silk'),
    bronzite: g('Бронзит', 'Bronzite', 'gem_fiber', ['#40321a', '#a4844a', '#e4cc84'], { per: 90, amp: 24, skew: -0.22, lo: 0.3, rng: 0.42, fa: 0.16, fine: 2, seam: false }, ['silk', { metal: 0.35 }]),
    kyanite: g('Кианит', 'Kyanite', 'gem_fiber', ['#0e1e46', '#20408a', '#4a7cd0', '#a8c8f4'], { mode: 'blade', cell: 7, nk: 0.55 }, ['silk', { gem: 0.2 }]),
    charoite: g('Чароит', 'Charoite', 'gem_fiber', ['#120c40', '#4a2492', '#a868f0', '#ffd8f6'], { mode: 'swirl' }, 'silk'),
    // опалы
    blackopal: g('Чёрный опал', 'Black Opal', 'gem_opal', ['#040509', '#0c1222', '#141a30'], { fl: ['#3b6bff', '#17e3c4', '#5aff5a', '#ffd23a', '#ff8a2a', '#ff4fd8'], on: 0.5 }, ['trn', { gem: 0.3, sparkle: 0.4, glow: 0.4 }]),
    nobleopal: g('Кристаллический опал', 'Crystal Opal', 'gem_opal', ['#121624', '#262e44', '#444e68'], { fl: ['#3dc8ff', '#6aff9a', '#ffe6a0', '#ff9a3a', '#ff4fd8', '#b07aff'], on: 0.55, hs: 1 }, ['trn', { gem: 0.35, sparkle: 0.5, glow: 0.5 }]),
    fireopal: g('Огненный опал', 'Fire Opal', 'gem_opal', ['#4a0604', '#a81c08', '#ec5410', '#ffa030'], { fl: ['#40ff80', '#30d0ff', '#a0ff40', '#30ffd0'], zone: 70, cell: 2.4, stretch: 3.2, seam: 0.12, clus: 0.18, on: 0.32, amt: 0.95 }, ['trn', { gem: 0.4, sparkle: 0.45, glow: 0.5 }]),
    boulderopal: g('Болдер-опал', 'Boulder Opal', 'gem_opal', ['#080820', '#141038'], { fl: ['#ff9a1a', '#fff0c0', '#3dc8ff', '#6a2aff', '#ff4f6a'], matrix: ['#140a04', '#3a2210', '#6a4220'], vw: 0.04, on: 0.8 }, ['trn', { gem: 0.25, sparkle: 0.4, glow: 0.35 }]),
    harlequin: g('Опал-арлекин', 'Harlequin Opal', 'gem_opal', ['#0a0a0e', '#14141c'], { mode: 'harlequin', fl: ['#3a7aff', '#3dff8a', '#ffd23f', '#ff3a3a', '#ff7ad0'], on: 0.72 }, ['trn', { gem: 0.3, sparkle: 0.4, glow: 0.4 }]),
    // перламутр, янтарь, солнечный камень
    nacre: g('Перламутр', 'Mother of Pearl', 'gem_pearl', ['#8a8478', '#d8d0c4', '#fbf8f2'], { amt: 0.6 }, ['pol', { gem: 0.15, glow: 0.3, sparkle: 0.1 }]),
    amber: g('Янтарь', 'Amber', 'gem_amber', ['#3a1c00', '#9a5800', '#f0a820', '#ffe8a0'], { layer: 0.45, bubbles: 16 }, ['trn', { glow: 0.5 }]),
    sunstone: g('Солнечный камень', 'Sunstone', 'gem_amber', ['#5a1206', '#c44a12', '#f08a2a', '#ffc070'], { fl: ['#ffe0a8', 140, 2.4], layer: 0.2 }, ['trn', { metal: 0.15, sparkle: 0.6, glow: 0.4 }]),
    // нефрит и мутные
    nephrite: g('Нефрит', 'Nephrite', 'gem_jade', ['#1a2210', '#445428', '#76884a', '#a8b480'], {}, ['trn', { glow: 0.3, gem: 0.1 }]),
    chrysoprase: g('Хризопраз', 'Chrysoprase', 'gem_jade', ['#22806a', '#52c4a0', '#8eeccc', '#d8fff0'], { depth: 0.3, milk: '#e8fff4', mk: 0.45, veil: 4 }, ['trn', { glow: 0.45 }]),
    rosequartz: g('Розовый кварц', 'Rose Quartz', 'gem_jade', ['#a8306a', '#e07aa6', '#ffc0d8', '#fff2f8'], { depth: 0.32, milk: '#fff4f8', mk: 0.5, veil: 5 }, ['trn', { glow: 0.5, sparkle: 0.2 }]),
    carnelian: g('Сердолик', 'Carnelian', 'gem_jade', ['#6a1006', '#c4400e', '#ff7a1e', '#ffc884'], { band: 0.1, depth: 0.3, milk: '#ffcc90', mk: 0.3, veil: 3 }, ['trn', { glow: 0.5 }]),
    chalcedony: g('Серый халцедон', 'Grey Chalcedony', 'gem_jade', ['#24272e', '#50586a', '#848ea4', '#bec6d6'], {}, ['trn', { glow: 0.35 }]),
    moonstone: g('Лунный камень', 'Moonstone', 'gem_jade', ['#98a8b8', '#ccd6e0', '#eaf0f6', '#ffffff'], { sheen: '#7ab8ff', veil: 3 }, ['trn', { glow: 0.5, sparkle: 0.2 }]),
    aventurine: g('Авантюрин', 'Aventurine', 'gem_jade', ['#082410', '#186428', '#38a04e', '#86dc88'], { fl: ['#e8ffe0', 200, 1.9] }, ['trn', { sparkle: 0.55, glow: 0.3, metal: 0.1 }]),
    // тёмное стекло и металл
    hematite: g('Гематит', 'Hematite', 'gem_glass', ['#0e1014', '#30353e', '#7a828c', '#c8ced8'], { mode: 'hem' }, 'met'),
    pyrite: g('Пирит', 'Pyrite', 'gem_glass', ['#3a2800', '#9a7818', '#dcbc58', '#fff2b8'], { mode: 'hem', cube: true }, ['met', { metal: 0.9, sparkle: 0.35 }]),
    obsidian: g('Обсидиан', 'Obsidian', 'gem_glass', ['#020106', '#0c0818', '#22183a'], { sheen: '#8a6ad0', amt: 0.4 }, 'gls'),
    silverobs: g('Серебристый обсидиан', 'Silver Sheen Obsidian', 'gem_glass', ['#040508', '#10131a', '#262a34'], { sheen: '#dce2ea', amt: 0.6 }, ['gls', { metal: 0.25 }]),
    goldobs: g('Золотой обсидиан', 'Gold Sheen Obsidian', 'gem_glass', ['#050302', '#140c06', '#2a1c0e'], { sheen: '#e8a850', amt: 0.6 }, ['gls', { metal: 0.25 }]),
    rainbowobs: g('Радужный обсидиан', 'Rainbow Obsidian', 'gem_glass', ['#030206', '#0e0a18', '#1e1630'], { rainbow: ['#ff2a6a', '#ffd23f', '#2a8fff', '#a040ff'], amt: 0.65 }, 'gls'),
    moldavite: g('Молдавит', 'Moldavite', 'gem_glass', ['#020c06', '#0a3420', '#1a6a3c'], { sheen: '#2bff9a', amt: 0.35 }, ['gls', { gem: 0.35, glow: 0.4 }]),
    snowobs: g('Снежный обсидиан', 'Snowflake Obsidian', 'gem_glass', ['#060608', '#141418', '#26262c'], { snow: '#d0d0d8' }, 'gls'),
    // лабрадорит и родня
    labradorite: g('Лабрадорит', 'Labradorite', 'gem_labra', ['#161c20', '#3a4448', '#5a6468'], { fl: ['#2b8dff', '#2bffb0', '#ffd23f', '#a24bff'], cover: 0.1 }, ['pol', { gem: 0.18, sparkle: 0.2, glow: 0.3 }]),
    spectrolite: g('Спектролит', 'Spectrolite', 'gem_labra', ['#0c0e12', '#1c2026', '#2c3038'], { fl: ['#ff3d7f', '#7a3cff', '#2de0ff', '#3dffb0'], cover: 0.05 }, ['pol', { gem: 0.18, sparkle: 0.2, glow: 0.3 }]),
    peacock: g('Павлинья руда', 'Peacock Ore', 'gem_labra', ['#2a2018', '#4a3a2a', '#7a6448'], { fl: ['#1f46ff', '#9a3cff', '#e8ad3c', '#1ad0a0'], cover: 0.2 }, ['met', { metal: 0.7, rough: 0.2 }]),
  };
  ST.watermelon.o.c2 = ['#062a14', '#289858', '#7ae0a0', '#e0ffe8'];
  ST.ametrine.o.c2 = ['#382200', '#dca818', '#ffe14a', '#fff8d0'];
  ST.mystic.o.c2 = ['#003a2a', '#14aca0', '#3dffd0', '#ffffff'];

  // ---------- Раскраска → камень (по палитре и названию исходной; соседние по цвету — разными камнями или структурой) ----------
  const MAP = {
    plain: 'chalcedony', urban: 'onyx', forest: 'nephrite', sand: 'landscape', arctic: 'moonstone', carbon: 'hematite',
    rust: 'redjasper', navy: 'sapphire', cherry: 'ruby', mint: 'chrysoprase', tiger: 'tigereye', zebra: 'zebrajasper',
    neon: 'paraiba', sunset: 'sunstone', aurora: 'labradorite', toxic: 'peridot', honey: 'amber', digital: 'kyanite',
    retro: 'fluorite', marble: 'charoite', fade: 'ametrine', ocean: 'chrysocolla', lava: 'fireagate', gilded: 'pyrite',
    chrome: 'rockcrystal', frost: 'bluetopaz', scales: 'redspinel', galaxy: 'lapis', cyber: 'sphene', sakura: 'rosequartz',
    damascus: 'hawkeye', temper: 'peacock', proto: 'spessartine', splash: 'spectrolite', circuit: 'moldavite', jungle: 'serpentine',
    midnight: 'sodalite', bronze: 'goldobs', glacier: 'aquamarine', scorch: 'carnelian', amethyst: 'druse', garnet: 'garnet',
    cobalt: 'cobspinel', malachite: 'malachite', dragon: 'fireopal', opal: 'blackopal', emperor: 'imptopaz', crystal: 'diamond',
    webred: 'rhodonite', webice: 'turquoise', storm: 'tanzanite', livewire: 'rutile', varnish: 'petrified', plywood: 'mookaite',
    netting: 'greenjasper', comic: 'yellowsap', popart: 'amazonite', tags: 'watermelon', street: 'dalmatian', schematic: 'bluelace',
    topo: 'greenagate', thermal: 'rainbowobs', python: 'pythonjasper', mamba: 'aventurine', leopard: 'leopardjasper', blackleo: 'snowobs',
    goldfish: 'nacre', bloodmoon: 'rhodochrosite', polarnight: 'iolite', jadepool: 'emerald', obsidian: 'obsidian', acidwash: 'marble',
    chased: 'silverobs', rosewindow: 'harlequin', icecrack: 'icequartz', smoke: 'smoky', baroque: 'rubellite', kintsugi: 'portoro',
    kevlar: 'bronzite', hazard: 'septarian', titanium: 'mystic', firetribal: 'bullseye', royal: 'royalam', supernova: 'nobleopal',
    blackhole: 'boulderopal', liquidgold: 'citrine', abyss: 'abyss',
  };
  // Чёрная звезда (секретный): чёрный бриллиант. gem умеренный: микрограни света с радужным «огнём» при gem = 1
  // превращают чёрный камень в цветную крошку; крупную огранку рисует альбедо, искры — свет (sparkle)
  const NOIR = {
    kind: 'gem_noir', c: ['#030306', '#2b2d35', '#6c63a8', '#e4e8ff'], stone: { ru: 'Чёрный бриллиант', en: 'Black Diamond' },
    mat: { metal: 0.05, rough: 0.03, gem: 0.5, sparkle: 0.6, glow: 0.25, clear: 1 }, dye: ['#1a1c34', '#05060f'], dyeGloss: 0.3,
  };

  // Тон кожи у тёмных камней задан вручную: иначе все тёмные пары перчаток выходят одинаково чёрными
  const DYE = {
    blackopal: ['#3a3128', '#15100c'],     // тёплый тёмно-коричневый
    boulderopal: ['#4a3322', '#1e130a'],   // коричневый «железняк»
    harlequin: ['#34343a', '#121216'],     // графит
    obsidian: ['#2c2436', '#0e0a14'],      // баклажан
    hematite: ['#3c4046', '#16181c'],      // графит со сталью
    snowobs: ['#4a4a4e', '#1c1c1f'],       // серый
    silverobs: ['#2e3540', '#101318'],     // сине-серый
    goldobs: ['#3e2e1c', '#171008'],       // тёмная бронза
    rainbowobs: ['#2a2438', '#0e0b16'],
    portoro: ['#2e2a20', '#0f0d08'],
    spectrolite: ['#262c34', '#0c0f14'],
  };
  // Тон кожи перчаток: телесный цвет камня, приглушённый к серому и затемнённый
  function dyeOf(st, key) {
    if (DYE[key]) return DYE[key].slice();
    const T = lut(st.kind === 'gem_cut' ? cutStops(st.c) : st.c), body = lc(T, st.kind === 'gem_cut' ? 0.5 : 0.55);
    const l = body[0] * 0.3 + body[1] * 0.59 + body[2] * 0.11;
    const main = mix(mix(body, [l, l, l], 0.3), [0, 0, 0], 0.22), dark = mix(main, [0, 0, 0], 0.55);
    const hex = (c) => '#' + c.map((v) => ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2)).join('');
    return [hex(main), hex(dark)];
  }
  const memo = {};
  // Tex.gemOf(finishId) → описание каменной версии раскраски или null
  Tex.gemOf = function (fid) {
    if (memo[fid]) return memo[fid];
    if (fid === 'noir') return (memo[fid] = NOIR);
    const st = ST[MAP[fid]];
    if (!st) return null;
    const p = Array.isArray(st.mat) ? st.mat : [st.mat, null];
    const d = {
      kind: st.kind, c: st.c.slice(), stone: { ru: st.ru, en: st.en },
      mat: Object.assign({}, MAT[p[0]], p[1] || {}), dye: dyeOf(st, MAP[fid]), o: st.o,
    };
    if (Array.isArray(st.o.c2)) d.c2 = st.o.c2;
    return (memo[fid] = d);
  };
  Tex.gemStones = ST;   // для просмотра (tools/harness/gems.html)
})();
