'use strict';

// Фон «Пустынный город» (desert), 1920 × 1080.
// Улица в одноточечной перспективе. Мировые координаты в метрах: X — поперёк улицы (0 — её середина,
// влево минус), Y — вверх, U — глубина от камеры. Камера стоит в X = CAMX на высоте EYE и смотрит вдоль улицы.
// Солнце слева-сзади (вторая половина дня, ~44° над горизонтом): левый ряд домов в тени, правый освещён,
// тени ложатся вправо и вглубь — KX, KU: сдвиг тени по X и U на метр высоты.
// Всё рисуется через преобразование контекста; попиксельные слои — на своих холстах, потом drawImage.
(function () {
  const VX = 960, HOR = 500, F = 1300, EYE = 1.6, CAMX = -0.6;
  const XL = -5.5, XR = 5.5, CURB = 4.0, WALK = 0.15;
  const KX = 0.743, KU = 0.70;
  const U_END = 54;                 // конец рядов домов, дальше лестница и площадь с куполом
  const SW = 1920, SH = 1080;

  // ---------- Мелкие помощники ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  function rgb(c, a) {
    const r = clamp(Math.round(c[0]), 0, 255), g = clamp(Math.round(c[1]), 0, 255), b = clamp(Math.round(c[2]), 0, 255);
    return a === undefined ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  const HAZE = [204, 194, 176];
  // воздушная дымка: чем дальше, тем ближе цвет к цвету пыльного воздуха
  const hz = (c, u) => mix(c, HAZE, 0.9 * (1 - Math.exp(-u / 260)));
  const hzs = (c, u, a) => rgb(hz(c, u), a);

  // проекция точки мира на экран; экранный x плоскости X = xf на глубине u
  const P = (X, Y, U) => [VX + F * (X - CAMX) / U, HOR - F * (Y - EYE) / U];
  const sxOf = (xf, u) => VX + F * (xf - CAMX) / u;
  const syOf = (y, u) => HOR - F * (y - EYE) / u;

  // многоугольник по мировым точкам [X, Y, U] (добавляет подпуть, beginPath — снаружи)
  function poly3(x, pts) {
    let p = P(pts[0][0], pts[0][1], pts[0][2]);
    x.moveTo(p[0], p[1]);
    for (let i = 1; i < pts.length; i++) { p = P(pts[i][0], pts[i][1], pts[i][2]); x.lineTo(p[0], p[1]); }
    x.closePath();
  }
  // прямоугольник на фасаде X = xf (u — глубина, v — высота)
  const fr = (x, xf, u0, v0, u1, v1) => poly3(x, [[xf, v1, u0], [xf, v1, u1], [xf, v0, u1], [xf, v0, u0]]);
  // прямоугольник на горизонтальной плоскости высоты y
  const gr = (x, x0, u0, x1, u1, y) => poly3(x, [[x0, y, u0], [x1, y, u0], [x1, y, u1], [x0, y, u1]]);
  // прямоугольник, обращённый к камере (плоскость U = u)
  const ur = (x, u, x0, y0, x1, y1) => poly3(x, [[x0, y1, u], [x1, y1, u], [x1, y0, u], [x0, y0, u]]);
  function fillp(x, col) { x.fillStyle = col; x.fill(); }
  // ломаная по мировым точкам
  function line3(x, pts) {
    let p = P(pts[0][0], pts[0][1], pts[0][2]);
    x.moveTo(p[0], p[1]);
    for (let i = 1; i < pts.length; i++) { p = P(pts[i][0], pts[i][1], pts[i][2]); x.lineTo(p[0], p[1]); }
  }
  // выпуклая оболочка (монотонная цепь) — для теней коробок
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
      up.push(p);
    }
    up.pop(); lo.pop();
    return lo.concat(up);
  }
  // свой холст того же размера, что и основной, с тем же преобразованием
  // k — доля разрешения: маски теней достаточно в половину (край чуть мягче — как полутень)
  function layer(x, k) {
    const c = document.createElement('canvas');
    k = x.canvas.width > 1000 ? k || 1 : 1;
    c.width = Math.ceil(x.canvas.width * k); c.height = Math.ceil(x.canvas.height * k);
    const g = c.getContext('2d');
    g.setTransform(c.width / SW, 0, 0, c.height / SH, 0, 0);
    return { c: c, g: g };
  }

  // ---------- Палитра ----------
  const C = {
    asph: [172, 163, 148], walk: [196, 184, 162], curb: [182, 170, 152], sand: [212, 190, 150],
    shadow: [120, 125, 154],          // множитель тени (multiply): жёсткое солнце — тень вдвое темнее
  };
  // материалы стен: l — на солнце, s — в тени (с тёплым отражённым светом от улицы)
  const MAT = {
    cream: { l: [230, 210, 176], s: [134, 122, 114] },
    sand:  { l: [224, 192, 146], s: [128, 112, 98] },
    white: { l: [220, 212, 194], s: [138, 133, 132] },
    ochre: { l: [214, 176, 122], s: [122, 103, 86] },
    stone: { l: [212, 178, 132], s: [120, 102, 85] },
    gray:  { l: [190, 182, 168], s: [114, 110, 108] },
    honey: { l: [200, 164, 118], s: [114, 95, 80] },
  };

  // ---------- Дома ----------
  // s: -1 — левый ряд (фасад X = XL, в тени), 1 — правый (X = XR, на солнце); u0..u1 — глубина, h — высота
  // fl — высоты этажей снизу вверх (остаток до h — парапет), m — материал
  // gf — проёмы первого этажа [тип, u0, u1]: shop — лавка, door/adoor — дверь (арочная), gar — ворота, win — окно с решёткой
  // wu — центры окон верхних этажей (общие по вертикали), ww/wh — размер, ws — стиль (shut/arch/mod),
  // bal — балконы [этаж, u0, u1], paint — краска ставен, gm — облицовка первого этажа, bands — пояса на всех этажах
  const HOUSES = [
    { s: -1, u0: -40, u1: 3.0, h: 9.6, ghost: true },          // ряд позади камеры: только тень
    { s: -1, u0: 3.0, u1: 11.2, h: 10.4, fl: [4.2, 3.0, 2.6], m: 'cream', seed: 11, paint: 'teal',
      wu: [7.5, 10.0], ww: 1.0, wh: 1.45, ws: 'shut', gf: [['shop', 6.6, 9.4, 'rugs'], ['door', 9.9, 10.8]] },
    { s: -1, u0: 13.0, u1: 24.0, h: 13.6, fl: [4.0, 3.2, 3.2, 2.6], m: 'sand', gm: 'stone', seed: 12, paint: 'green', bands: true,
      wu: [14.3, 16.9, 19.3, 21.7, 23.2], ww: 1.0, wh: 1.5, ws: 'shut',
      gf: [['adoor', 13.6, 15.0], ['shop', 16.0, 20.4, 'cafe'], ['win', 21.3, 22.1], ['door', 22.7, 23.6]], bal: [[2, 16.9, 19.5, 'm']] },
    { s: -1, u0: 24.0, u1: 30.5, h: 8.2, fl: [4.0, 3.4], m: 'white', seed: 13, paint: 'blue', rebar: true,
      wu: [25.3, 27.5, 29.4], ww: 0.9, wh: 1.3, ws: 'shut', gf: [['gar', 24.6, 27.4], ['door', 28.4, 29.3]] },
    { s: -1, u0: 30.5, u1: 39.5, h: 11.6, fl: [4.2, 3.4, 3.2], m: 'ochre', seed: 14, paint: 'brown', bars: true,
      wu: [31.6, 34.0, 36.3, 38.5], ww: 1.0, wh: 1.4, ws: 'arch',
      gf: [['shop', 31.2, 34.5, 'grocery'], ['door', 35.4, 36.3], ['win', 37.4, 38.4]], bal: [[2, 33.2, 37.0]] },
    { s: -1, u0: 43.0, u1: 54.0, h: 10.8, fl: [3.8, 3.2, 3.0], m: 'cream', seed: 15, paint: 'teal', bands: true,
      wu: [44.2, 46.7, 49.2, 51.7, 53.3], ww: 1.0, wh: 1.4, ws: 'shut',
      gf: [['shop', 43.6, 47.0, 'closed'], ['door', 48.0, 48.9], ['shop', 50.0, 53.4, 'grocery']] },
    { s: 1, u0: 6.0, u1: 16.5, h: 11.4, fl: [4.2, 3.2, 3.2], m: 'sand', seed: 21, paint: 'wood', bands: true,
      wu: [9.2, 11.7, 14.6], ww: 1.1, wh: 1.5, ws: 'shut', gf: [['shop', 9.0, 14.0, 'spice'], ['door', 14.9, 15.9]], bal: [[1, 10.4, 13.0, 'm']] },
    { s: 1, u0: 16.5, u1: 26.5, h: 8.0, fl: [4.0, 3.2], m: 'stone', seed: 22, paint: 'blue',
      wu: [18.0, 20.6, 23.2, 25.5], ww: 1.0, wh: 1.5, ws: 'arch',
      gf: [['shop', 17.4, 20.6, 'work'], ['adoor', 21.6, 23.0], ['win', 24.2, 25.2]] },
    { s: 1, u0: 28.0, u1: 38.5, h: 14.2, fl: [4.0, 3.3, 3.3, 3.0], m: 'white', seed: 23, paint: 'green',
      wu: [29.2, 31.6, 34.0, 36.4], ww: 1.1, wh: 1.6, ws: 'mod',
      gf: [['door', 29.0, 30.6], ['win', 31.8, 32.8], ['win', 34.0, 35.0], ['shop', 36.0, 38.0, 'closed']],
      bal: [[1, 30.8, 32.4], [2, 30.8, 32.4], [3, 30.8, 32.4], [1, 35.6, 37.2], [2, 35.6, 37.2]] },
    { s: 1, u0: 38.5, u1: 46.0, h: 10.6, fl: [4.0, 3.2, 2.8], m: 'ochre', seed: 24, paint: 'teal',
      wu: [39.6, 42.0, 44.6], ww: 1.0, wh: 1.4, ws: 'shut', gf: [['shop', 39.2, 43.0, 'bakery'], ['door', 44.0, 45.0]] },
    { s: 1, u0: 46.0, u1: 54.0, h: 12.2, fl: [4.0, 3.4, 3.4], m: 'cream', seed: 25, paint: 'brown', bands: true,
      wu: [47.2, 49.6, 52.0], ww: 1.0, wh: 1.5, ws: 'shut', gf: [['shop', 46.8, 50.6, 'grocery'], ['door', 51.6, 52.6]] },
  ];
  const xfOf = (b) => (b.s < 0 ? XL : XR);
  let ITEMS = [];                   // объекты, выступающие в улицу: рисуются в конце, от дальних к ближним

  // Точка в тени левого ряда? Луч к солнцу идёт влево, вверх и к камере; проверяем, где он
  // пересекает плоскость фасадов и на 3 м вглубь квартала (стены переулков)
  function inShade(X, Y, U) {
    for (const d of [0, 3]) {
      const run = X - XL + d;                     // путь по X до плоскости
      if (run <= 0) continue;
      const y = Y + run / KX, u = U - run * KU / KX;
      for (const b of HOUSES) if (b.s < 0 && u >= b.u0 && u <= b.u1 && y < b.h) return true;
    }
    return false;
  }
  // до какой высоты стоит в тени вертикальный столб в точке (X, U)
  function shadeTop(X, U) {
    let top = 0;
    for (const b of HOUSES) {
      if (b.s > 0) continue;
      const run = X - XL;
      if (run <= 0) return 99;
      const y = b.h - run / KX;                   // высота луча над точкой при касании крыши
      const u = U - run * KU / KX;
      if (u >= b.u0 && u <= b.u1 && y > top) top = y;
    }
    return top;
  }

  // ---------- Небо ----------
  function sky(x) {
    const g = x.createLinearGradient(0, 0, 0, HOR);
    // зенит темнее (под шапкой интерфейса читается текст), у горизонта — пыльная светлая дымка
    g.addColorStop(0, rgb([62, 84, 110]));
    g.addColorStop(0.28, rgb([90, 114, 140]));
    g.addColorStop(0.6, rgb([148, 160, 166]));
    g.addColorStop(0.86, rgb([194, 188, 174]));
    g.addColorStop(1, rgb([204, 194, 176]));
    x.fillStyle = g; x.fillRect(0, 0, SW, HOR + 2);
  }

  // ---------- Земля: асфальт, тротуары, бордюры ----------
  function vgrad(x, y, col, us) {
    // вертикальный градиент по экранным строкам плоскости высоты y, цвет с дымкой по глубине
    const top = syOf(y, us[0]), g = x.createLinearGradient(0, top, 0, SH);
    for (const u of us) g.addColorStop(clamp((syOf(y, u) - top) / (SH - top), 0, 1), hzs(col, u));
    return g;
  }
  function groundBase(x) {
    x.fillStyle = vgrad(x, 0, C.asph, [400, 160, 70, 35, 18, 9, 5, 3.4]);
    x.fillRect(0, HOR, SW, SH - HOR);
    for (const s of [-1, 1]) {
      const xc = s * CURB, xf = s < 0 ? XL : XR;
      x.beginPath(); gr(x, xc, 2.2, xf, ST0, WALK); fillp(x, vgrad(x, WALK, C.walk, [ST0, 30, 15, 8, 4, 2.4]));
    }
  }
  // лицевые грани бордюров — поверх попиксельной земли, чтобы край был чётким.
  // Слева грань смотрит от солнца, справа — на солнце; стыки камней через 0.9 м, светлая кромка сверху
  function curbs(x, LO) {
    for (const s of [-1, 1]) {
      const xc = s * CURB, lit = s > 0, col = lit ? mix(C.curb, [255, 246, 228], 0.22) : mul(C.curb, 0.6);
      x.beginPath(); poly3(x, [[xc, WALK, 2.2], [xc, WALK, ST0], [xc, 0, ST0], [xc, 0, 2.2]]);
      fillp(x, hgrad(x, xc, 2.2, ST0, col));
      if (LO) continue;
      // тёмная щель у основания (лоток) и светлая кромка
      x.beginPath(); line3(x, [[xc, 0.012, 2.2], [xc, 0.012, ST0]]);
      x.strokeStyle = rgb([60, 54, 48], 0.45); x.lineWidth = 1.6; x.stroke();
      x.beginPath(); line3(x, [[xc, WALK - 0.008, 2.2], [xc, WALK - 0.008, ST0]]);
      x.strokeStyle = rgb(lit ? [250, 242, 226] : [176, 168, 156], 0.6); x.lineWidth = 1.2; x.stroke();
      const r = Tex.rng(s > 0 ? 71 : 72);
      for (let u = 2.6; u < ST0; u += 0.9) {
        const ds = Math.abs(sxOf(xc, u) - sxOf(xc, u + 0.9));
        if (ds < 5) break;
        x.beginPath(); line3(x, [[xc, 0, u], [xc, WALK, u]]);
        x.strokeStyle = hzs(mul(col, 0.62), u); x.lineWidth = clamp(F * 0.012 / u, 0.7, 3); x.stroke();
        if (r() < 0.3 && ds > 12) {                     // скол на верхней кромке
          const a = u + 0.1 + r() * 0.6, b = a + 0.08 + r() * 0.12;
          x.beginPath(); poly3(x, [[xc, WALK, a], [xc, WALK, b], [xc, WALK - 0.03 - r() * 0.03, (a + b) / 2]]);
          fillp(x, hzs(mul(col, 0.78), u));
        }
      }
    }
  }

  // многоугольник на земле [X, U] → путь на экране; срезаем всё, что ближе 0.6 м к камере (и позади неё)
  function groundPoly(g, poly, y) {
    const out = [], um = 0.6;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ia = a[1] >= um, ib = b[1] >= um;
      if (ia) out.push(a);
      if (ia !== ib) { const t = (um - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, um]); }
    }
    if (out.length < 3) return;
    g.beginPath(); poly3(g, out.map((p) => [p[0], y || 0, p[1]])); g.fill();
  }
  // ---------- Тени на земле: маска одним цветом, затем multiply (перекрытия не темнеют дважды) ----------
  function groundShadows(x, extra) {
    const L = layer(x, 0.5), g = L.g;
    g.fillStyle = rgb(C.shadow);
    for (const b of HOUSES) {
      if (b.s > 0) continue;
      const pts = [];
      for (const X of [XL, XL - 14]) for (const U of [b.u0, b.u1]) { pts.push([X, U]); pts.push([X + b.h * KX, U + b.h * KU]); }
      groundPoly(g, hull(pts));
    }
    if (extra) extra(g);
    x.save(); x.globalCompositeOperation = 'multiply'; x.drawImage(L.c, 0, 0, SW, SH); x.restore();
  }

  // ---------- Фасады: основа с дымкой вдоль глубины ----------
  function hgrad(x, xf, u0, u1, col) {
    const p0 = sxOf(xf, u0), p1 = sxOf(xf, u1), g = x.createLinearGradient(p0, 0, p1, 0);
    for (let i = 0; i <= 4; i++) {
      const u = lerp(u0, u1, i / 4);
      g.addColorStop(clamp((sxOf(xf, u) - p0) / (p1 - p0), 0, 1), hzs(col, u));
    }
    return g;
  }
  function facadeBase(x, b) {
    const xf = xfOf(b), m = MAT[b.m], lit = b.s > 0;
    x.beginPath(); fr(x, xf, b.u0, 0, b.u1, b.h); fillp(x, hgrad(x, xf, b.u0, b.u1, lit ? m.l : m.s));
    if (b.gm) {                       // первый этаж облицован песчаником
      x.beginPath(); fr(x, xf, b.u0, 0, b.u1, b.fl[0]); fillp(x, hgrad(x, xf, b.u0, b.u1, lit ? MAT[b.gm].l : MAT[b.gm].s));
    }
    // цоколь: темнее
    x.beginPath(); fr(x, xf, b.u0, 0, b.u1, 0.55); fillp(x, hgrad(x, xf, b.u0, b.u1, mul(lit ? m.l : m.s, 0.84)));
  }
  // торцы домов в переулках (обращены к камере): слева в тени, верх освещён поверх соседа; справа у улицы светло
  function sideWalls(x) {
    for (const s of [-1, 1]) {
      const row = HOUSES.filter((b) => b.s === s && !b.ghost);
      for (let i = 1; i < row.length; i++) {
        const a = row[i - 1], b = row[i], gap = b.u0 - a.u1;
        if (gap < 0.5) continue;
        const xf = xfOf(b), xb = xf + s * 10, m = MAT[b.m];
        x.beginPath(); ur(x, b.u0, Math.min(xf, xb), 0, Math.max(xf, xb), b.h); fillp(x, hzs(mul(m.s, 0.9), b.u0));
        if (s < 0) {
          const yl = a.h - gap / KU;
          if (yl < b.h) { x.beginPath(); ur(x, b.u0, xb, Math.max(0, yl), xf, b.h); fillp(x, hzs(mix(m.l, m.s, 0.1), b.u0)); }
        } else { x.beginPath(); ur(x, b.u0, xf, 0, xf + 1.6, b.h); fillp(x, hzs(mix(m.l, m.s, 0.2), b.u0)); }
      }
    }
  }

  // ---------- Дальний план: терраса с лестницей, здание с аркадой, минарет, купол на барабане ----------
  const PLAT = 2.4, ST0 = 55, ST1 = 59, FU = 66;   // высота террасы, лестница, плоскость главного фасада
  const FX0 = -10, FX1 = 10.6, FT = PLAT + 12;      // главный фасад по X и его верх
  const TW = { X: -6.2, U: 64.2, r: 1.62 };         // минарет: стоит перед левым краем фасада
  const DM = { X: 1.2, U: 76, Yb: PLAT + 16.6, R: 5.3, H: 5.9, dr: 5.0, dh: 4.4 };   // барабан и купол
  // освещённость грани с нормалью (nx, ny, nu) и цвет материала по ней (жёсткий терминатор)
  const nlOf = (nx, ny, nu) => -0.52 * nx + 0.70 * ny - 0.49 * nu;
  const litMix = (m, nl) => (nl <= 0 ? m.s : mix(m.s, m.l, clamp(nl / 0.6, 0, 1.08)));
  // многоугольник в плоскости U = u по точкам [X, Y]
  const uPoly = (x, u, pts) => poly3(x, pts.map((p) => [p[0], p[1], u]));
  // стрельчатая арка на двух центрах: контур от левой пяты через вершину к правой; H — подъём над пятой ys
  function ptArch(cx, hw, ys, H, n) {
    const k = Math.max(0, ((H / hw) * (H / hw) - 1) / 2), rr = hw * (1 + k), t1 = Math.acos(-k / (1 + k)), out = [];
    for (let i = 0; i <= n; i++) { const t = Math.PI - (Math.PI - t1) * i / n; out.push([cx + k * hw + rr * Math.cos(t), ys + rr * Math.sin(t)]); }
    for (let i = n - 1; i >= 0; i--) { const t = Math.PI - (Math.PI - t1) * i / n; out.push([cx - k * hw - rr * Math.cos(t), ys + rr * Math.sin(t)]); }
    return out;
  }
  // проём-арка в плоскости U = u: от пола y0 до пят ys, затем свод
  const archOpen = (cx, hw, y0, ys, H) => [[cx - hw, y0]].concat(ptArch(cx, hw, ys, H, 8), [[cx + hw, y0]]);
  // восьмигранная призма: рисуем грани, обращённые к камере, каждая со своей освещённостью;
  // cb(точка на грани (s, y) → мир, nl, глубина) — для деталей на грани
  function octo(x, cx, cu, r, y0, y1, m, cb) {
    for (let j = 0; j < 8; j++) {
      const a0 = (j - 0.5) * Math.PI / 4, a1 = (j + 0.5) * Math.PI / 4, nx = Math.cos(j * Math.PI / 4), nu = Math.sin(j * Math.PI / 4);
      if (nx * (CAMX - cx - nx * r) + nu * (-cu - nu * r) <= 0) continue;
      const p0 = [cx + Math.cos(a0) * r, cu + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cu + Math.sin(a1) * r];
      x.beginPath(); poly3(x, [[p0[0], y1, p0[1]], [p1[0], y1, p1[1]], [p1[0], y0, p1[1]], [p0[0], y0, p0[1]]]);
      const nl = nlOf(nx, 0, nu);
      fillp(x, hzs(litMix(m, nl), cu));
      if (cb) cb((s, y) => [lerp(p0[0], p1[0], s), y, lerp(p0[1], p1[1], s)], nl, cu);
    }
  }
  // нижняя плоскость восьмигранника (видна снизу)
  function octoUnder(x, cx, cu, r, y, col) {
    const pts = [];
    for (let j = 0; j < 8; j++) { const a = (j - 0.5) * Math.PI / 4; pts.push([cx + Math.cos(a) * r, y, cu + Math.sin(a) * r]); }
    x.beginPath(); poly3(x, pts); fillp(x, col);
  }
  // купол: доли по меридианам × пояса, у каждой ячейки своя освещённость — жёсткий терминатор,
  // доли читаются рёбрами. Сначала силуэт средним тоном, чтобы между ячейками не было щелей
  function dome(x, cx, yb, cu, R, H, m, nG, ribs) {
    const NT = 8, pf = (t) => [R * Math.pow(Math.cos(t * Math.PI / 2), 0.85), H * Math.sin(t * Math.PI / 2)];
    const pt = (ph, q) => [cx + q[0] * Math.sin(ph), yb + q[1], cu - q[0] * Math.cos(ph)];
    const sil = [];
    for (let i = 0; i <= 12; i++) sil.push(pt(-Math.PI / 2, pf(i / 12)));
    for (let i = 12; i >= 0; i--) sil.push(pt(Math.PI / 2, pf(i / 12)));
    for (let i = 1; i < 12; i++) sil.push(pt(Math.PI / 2 - Math.PI * i / 12, pf(0)));
    x.beginPath(); poly3(x, sil); fillp(x, hzs(mix(m.s, m.l, 0.45), cu));
    for (let i = 0; i < nG; i++) {
      const p0 = -Math.PI / 2 + Math.PI * i / nG, p1 = p0 + Math.PI / nG, pm = (p0 + p1) / 2;
      for (let j = 0; j < NT; j++) {
        const t0 = j / NT, t1 = (j + 1) / NT, a = pf(t0), b = pf(t1), am = (t0 + t1) / 2 * Math.PI / 2;
        let nr = H * Math.cos(am), ny = 0.85 * R * Math.pow(Math.max(1e-3, Math.cos(am)), -0.15) * Math.sin(am);
        const d = Math.hypot(nr, ny); nr /= d; ny /= d;
        const nl = nlOf(nr * Math.sin(pm), ny, -nr * Math.cos(pm));
        x.beginPath(); poly3(x, [pt(p0, a), pt(p1, a), pt(p1, b), pt(p0, b)]);
        const col = nl <= 0.02 ? mul(m.s, 0.94 + nl * 0.4) : mix(m.s, mul(m.l, 0.74 + 0.36 * nl), clamp((nl - 0.02) / 0.08, 0, 1));
        x.strokeStyle = x.fillStyle = hzs(col, cu); x.lineWidth = 0.6; x.fill(); x.stroke();
      }
    }
    if (!ribs) return;
    x.beginPath();
    for (let i = 1; i < ribs; i++) {
      const ph = -Math.PI / 2 + Math.PI * i / ribs, pts = [];
      for (let j = 0; j <= 10; j++) pts.push(pt(ph, pf(j / 10)));
      line3(x, pts);
    }
    x.strokeStyle = hzs(mul(m.s, 0.8), cu, 0.32); x.lineWidth = Math.max(0.8, F * 0.06 / cu); x.stroke();
  }
  function farEnd(x, LO) {
    const st = MAT.stone, hm = MAT.honey;
    // подпорная стена террасы: кладка, тёмная полка-слив сверху
    x.beginPath(); ur(x, ST1, -16, 0, 16, PLAT); fillp(x, hzs(mix(st.l, st.s, 0.15), ST1));
    if (!LO) {
      x.beginPath();
      for (let y = 0.5; y < PLAT; y += 0.5) line3(x, [[-16, y, ST1], [16, y, ST1]]);
      x.strokeStyle = hzs(mul(st.l, 0.7), ST1, 0.4); x.lineWidth = 0.8; x.stroke();
    }
    x.beginPath(); ur(x, ST1 - 0.1, -16, PLAT - 0.06, 16, PLAT + 0.1); fillp(x, hzs(mul(st.l, 0.82), ST1));
    // ступени: подступенки к камере (на солнце, если не в тени крайнего левого дома)
    const n = 16;
    for (let i = 0; i < n; i++) {
      const u = lerp(ST0, ST1, i / n), y0 = PLAT * i / n, y1 = PLAT * (i + 1) / n;
      for (let k = 0; k < 6; k++) {
        const x0 = -3.6 + k * 1.2;
        x.beginPath(); ur(x, u, x0, y0, x0 + 1.2, y1);
        fillp(x, hzs(inShade(x0 + 0.6, y1, u) ? st.s : st.l, u));
      }
    }
    // барабан: цилиндр полосами, на нём 12 арочных окон (видны передние), карниз
    const D = DM, yd0 = D.Yb - D.dh;
    for (let i = 0; i < 20; i++) {
      const p0 = -Math.PI / 2 + Math.PI * i / 20, p1 = p0 + Math.PI / 20, pm = (p0 + p1) / 2;
      const q = (ph, y) => [D.X + D.dr * Math.sin(ph), y, D.U - D.dr * Math.cos(ph)];
      x.beginPath(); poly3(x, [q(p0, D.Yb), q(p1, D.Yb), q(p1, yd0), q(p0, yd0)]);
      x.strokeStyle = x.fillStyle = hzs(litMix(hm, nlOf(Math.sin(pm), 0, -Math.cos(pm))), D.U); x.lineWidth = 0.6; x.fill(); x.stroke();
    }
    for (let k = 0; k < 6; k++) {
      const ph = -Math.PI / 2 + Math.PI * (k + 0.5) / 6, hw = 0.42 / D.dr;
      const pts = archOpen(0, 1, D.Yb - 3.5, D.Yb - 1.75, 0.75 * 1).map((p) => {
        const a = ph + p[0] * hw;
        return [D.X + (D.dr + 0.02) * Math.sin(a), p[1], D.U - (D.dr + 0.02) * Math.cos(a)];
      });
      x.beginPath(); poly3(x, pts); fillp(x, hzs([60, 52, 48], D.U));
    }
    for (const [r, y0, y1, k] of [[D.dr + 0.25, D.Yb - 0.05, D.Yb + 0.3, 1.06], [D.dr + 0.15, yd0 + 0.9, yd0 + 1.1, 0.94]]) {
      for (let i = 0; i < 20; i++) {
        const p0 = -Math.PI / 2 + Math.PI * i / 20, p1 = p0 + Math.PI / 20, pm = (p0 + p1) / 2;
        const q = (ph, y) => [D.X + r * Math.sin(ph), y, D.U - r * Math.cos(ph)];
        x.beginPath(); poly3(x, [q(p0, y1), q(p1, y1), q(p1, y0), q(p0, y0)]);
        x.strokeStyle = x.fillStyle = hzs(mul(litMix(hm, nlOf(Math.sin(pm), 0, -Math.cos(pm))), k), D.U); x.lineWidth = 0.6; x.fill(); x.stroke();
      }
    }
    // купол: выгоревшая известь с охрой; 16 долей, 8 рёбер; навершие
    dome(x, D.X, D.Yb + 0.3, D.U, D.R, D.H, { l: [222, 200, 160], s: [118, 112, 114] }, 16, 8);
    const ap = D.Yb + 0.3 + D.H;
    x.beginPath(); line3(x, [[D.X, ap - 0.1, D.U], [D.X, ap + 1.6, D.U]]);
    x.strokeStyle = hzs([86, 74, 58], D.U); x.lineWidth = Math.max(1.2, F * 0.1 / D.U); x.stroke();
    for (const [y, rr] of [[ap + 0.45, 0.2], [ap + 0.95, 0.15]]) {
      x.beginPath(); poly3(x, [[D.X - rr, y, D.U], [D.X, y + rr, D.U], [D.X + rr, y, D.U], [D.X, y - rr, D.U]]); fillp(x, hzs([96, 82, 62], D.U));
    }
    farFacade(x, LO);
    farShadows(x, LO);
    minaret(x, LO);
    for (const p of PALMS) if (p.far) palmDraw(x, p, LO);
  }
  // главный фасад: песчаник, аркада из 7 стрельчатых арок с тёмной глубиной, портал-айван с дверью
  // посередине, ряд узких окон, карнизы с тенью под ними, ступенчатые зубцы парапета
  function farFacade(x, LO) {
    const m = MAT.honey, U = FU, lit = hzs(m.l, U), pitch = (FX1 - FX0) / 7, PC = FX0 + pitch * 3.5;
    x.beginPath(); ur(x, U, FX0, PLAT, FX1, FT); fillp(x, lit);
    if (!LO) {   // кладка: ряды через 0.5 м
      x.beginPath();
      for (let y = PLAT + 0.5; y < FT; y += 0.5) line3(x, [[FX0, y, U], [FX1, y, U]]);
      x.strokeStyle = hzs(mul(m.l, 0.8), U, 0.3); x.lineWidth = 0.7; x.stroke();
    }
    // портал: рама вокруг центральной арки выше карниза аркады, фриз
    x.beginPath(); ur(x, U, PC - 2.0, PLAT, PC + 2.0, PLAT + 8.6); fillp(x, hzs(mix(m.l, [246, 234, 210], 0.16), U));
    x.beginPath(); ur(x, U, PC - 1.75, PLAT + 7.4, PC + 1.75, PLAT + 8.2); fillp(x, hzs(mul(m.l, 0.84), U));
    const dark = hzs([54, 46, 42], U), frame = hzs(mix(m.l, [250, 240, 220], 0.22), U);
    for (let i = 0; i < 7; i++) {
      const cx = FX0 + pitch * (i + 0.5), portal = i === 3;
      const hw = portal ? 1.3 : 0.95, ys = PLAT + (portal ? 4.3 : 2.5), H = portal ? 2.2 : 1.35;
      if (!portal) { x.beginPath(); uPoly(x, U, archOpen(cx, hw + 0.2, PLAT, ys, H + 0.24)); fillp(x, frame); }
      x.beginPath(); uPoly(x, U, archOpen(cx, hw, PLAT, ys, H)); fillp(x, dark);
      // тёплый отражённый свет от террасы внизу задней стены портика
      x.beginPath(); ur(x, U + 0.01, cx - hw, PLAT, cx + hw, PLAT + 0.8); fillp(x, hzs([110, 90, 72], U, 0.45));
      if (portal) {   // свод айвана в глубокой тени, в глубине — дверь с филёнками
        x.beginPath(); uPoly(x, U, ptArch(cx, hw, ys, H, 8).concat([[cx + hw, ys - 0.6], [cx - hw, ys - 0.6]])); fillp(x, hzs([36, 30, 28], U, 0.6));
        x.beginPath(); uPoly(x, U, archOpen(cx, 0.8, PLAT, PLAT + 2.6, 0.75)); fillp(x, hzs([84, 62, 46], U));
        if (!LO) {
          x.beginPath();
          for (const k of [-0.4, 0, 0.4]) line3(x, [[cx + k, PLAT + 0.1, U], [cx + k, PLAT + 2.8, U]]);
          x.strokeStyle = hzs([50, 38, 30], U); x.lineWidth = 1; x.stroke();
        }
        continue;
      }
      x.beginPath(); uPoly(x, U, archOpen(cx, 0.42, PLAT, PLAT + 1.6, 0.5)); fillp(x, hzs([34, 28, 26], U, 0.7));
      // узкое окно второго яруса и маленькое окно под верхним карнизом
      x.beginPath(); uPoly(x, U, archOpen(cx, 0.46, PLAT + 5.55, PLAT + 6.55, 0.5)); fillp(x, frame);
      x.beginPath(); uPoly(x, U, archOpen(cx, 0.32, PLAT + 5.7, PLAT + 6.5, 0.38)); fillp(x, dark);
      x.beginPath(); ur(x, U, cx - 0.26, PLAT + 9.0, cx + 0.26, PLAT + 9.6); fillp(x, dark);
    }
    // карниз над аркадой (по обе стороны портала) и верхний карниз: тень под полкой, светлая полка
    for (const [y, h] of [[PLAT + 4.55, 0.32], [FT - 0.75, 0.38]]) {
      const segs = y < PLAT + 8 ? [[FX0, PC - 2.0], [PC + 2.0, FX1]] : [[FX0, FX1]];
      for (const [a, b] of segs) {
        x.beginPath(); ur(x, U, a, y - 0.16, b, y); fillp(x, hzs(mul(m.s, 0.9), U));
        x.beginPath(); ur(x, U, a, y, b, y + h); fillp(x, hzs(mix(m.l, [250, 240, 220], 0.2), U));
      }
    }
    // ступенчатые зубцы парапета через 1.1 м
    x.beginPath();
    for (let a = FX0 + 0.1; a < FX1 - 0.5; a += 1.1) {
      uPoly(x, U, [[a, FT - 0.05], [a, FT + 0.35], [a + 0.12, FT + 0.35], [a + 0.12, FT + 0.65], [a + 0.24, FT + 0.65], [a + 0.24, FT + 0.85],
        [a + 0.5, FT + 0.85], [a + 0.5, FT + 0.65], [a + 0.62, FT + 0.65], [a + 0.62, FT + 0.35], [a + 0.74, FT + 0.35], [a + 0.74, FT - 0.05]]);
    }
    fillp(x, lit);
  }
  // минарет: квадратное основание, восьмигранный ствол с тягой и бойницами, балкон на консолях,
  // верхний ярус с арочными проёмами-жалюзи, карниз, шлем и навершие
  function minaret(x, LO) {
    const m = MAT.honey, c = TW, U = c.U, lt = (k) => ({ l: mul(m.l, k), s: mul(m.s, k) });
    const slot = (pt, cu, s0, s1, y0, y1, col) => { x.beginPath(); poly3(x, [pt(s0, y1), pt(s1, y1), pt(s1, y0), pt(s0, y0)]); fillp(x, hzs(col, cu)); };
    box(x, c.X - 1.75, c.X + 1.75, PLAT, PLAT + 5.6, U - 1.75, U + 1.75, m);
    box(x, c.X - 1.9, c.X + 1.9, PLAT + 5.6, PLAT + 5.85, U - 1.9, U + 1.9, lt(1.06));
    octo(x, c.X, U, c.r, PLAT + 5.85, PLAT + 14, m, (pt, nl, cu) => {
      slot(pt, cu, 0, 1, PLAT + 9.6, PLAT + 9.9, mul(litMix(m, nl), 1.08));
      if (!LO) for (const y of [PLAT + 7.6, PLAT + 11.6]) slot(pt, cu, 0.42, 0.58, y, y + 0.9, [50, 42, 38]);
    });
    octoUnder(x, c.X, U, 2.25, PLAT + 14.3, hzs(mul(m.s, 0.78), U));
    octo(x, c.X, U, 1.95, PLAT + 13.55, PLAT + 14.3, lt(0.9), (pt, nl, cu) => {
      if (!LO) for (let s = 0.1; s < 1; s += 0.2) slot(pt, cu, s, s + 0.08, PLAT + 13.7, PLAT + 14.3, mul(m.s, 0.7));
    });
    octo(x, c.X, U, 2.25, PLAT + 14.3, PLAT + 14.55, lt(1.06));
    octo(x, c.X, U, 1.2, PLAT + 14.55, PLAT + 17.4, m, (pt, nl, cu) => {
      x.beginPath(); poly3(x, archOpen(0.5, 0.22, PLAT + 15.2, PLAT + 16.6, 0.3).map((p) => pt(p[0], p[1]))); fillp(x, hzs([46, 40, 36], cu));
      if (LO) return;
      x.beginPath();
      for (let y = PLAT + 15.35; y < PLAT + 16.5; y += 0.2) line3(x, [pt(0.3, y), pt(0.7, y)]);
      x.strokeStyle = hzs(mul(litMix(m, nl), 0.8), cu); x.lineWidth = 1; x.stroke();
    });
    octo(x, c.X, U, 2.1, PLAT + 14.55, PLAT + 15.35, m, (pt, nl, cu) => {
      if (!LO) for (let s = 0.12; s < 0.9; s += 0.26) slot(pt, cu, s, s + 0.14, PLAT + 14.75, PLAT + 15.15, [60, 52, 46]);
    });
    octoUnder(x, c.X, U, 1.45, PLAT + 17.4, hzs(mul(m.s, 0.8), U));
    octo(x, c.X, U, 1.45, PLAT + 17.4, PLAT + 17.7, lt(1.06));
    dome(x, c.X, PLAT + 17.7, U, 1.3, 1.75, { l: [214, 192, 152], s: [112, 106, 108] }, 8, 0);
    const ap = PLAT + 17.7 + 1.75;
    x.beginPath(); line3(x, [[c.X, ap - 0.05, U], [c.X, ap + 1.0, U]]);
    x.strokeStyle = hzs([86, 74, 58], U); x.lineWidth = Math.max(1.2, F * 0.08 / U); x.stroke();
    x.beginPath(); poly3(x, [[c.X - 0.16, ap + 0.4, U], [c.X, ap + 0.58, U], [c.X + 0.16, ap + 0.4, U], [c.X, ap + 0.22, U]]); fillp(x, hzs([96, 82, 62], U));
  }
  // тени на главном фасаде: от минарета (оболочки проекций каждого яруса) и от крон пальм на террасе
  const toFar = (X, Y, U) => { const t = (FU - U) / KU; return [X + t * KX, Y - t, FU]; };
  function farShadows(x, LO) {
    const c = TW;
    x.save(); x.beginPath(); ur(x, FU, FX0, PLAT, FX1, FT + 0.9); x.clip();
    x.globalCompositeOperation = 'multiply'; x.fillStyle = rgb(C.shadow);
    // оболочки ярусов минарета — одним путём (перекрытия не темнеют дважды)
    x.beginPath();
    const stage = (pts) => {
      const h = hull(pts.map((p) => { const q = toFar(p[0], p[1], p[2]); return [q[0], q[1]]; }));
      poly3(x, h.map((p) => [p[0], p[1], FU]));
    };
    const ring = (r, y0, y1, sq) => {
      const pts = [];
      for (let j = 0; j < (sq ? 4 : 8); j++) {
        const a = sq ? Math.PI / 4 + j * Math.PI / 2 : (j - 0.5) * Math.PI / 4, rr = sq ? r * Math.SQRT2 : r;
        for (const y of [y0, y1]) pts.push([c.X + Math.cos(a) * rr, y, c.U + Math.sin(a) * rr]);
      }
      stage(pts);
    };
    ring(1.75, PLAT, PLAT + 5.85, true); ring(c.r, PLAT + 5.85, PLAT + 14); ring(2.25, PLAT + 13.55, PLAT + 15.35);
    ring(1.2, PLAT + 15.35, PLAT + 17.4); ring(1.45, PLAT + 17.4, PLAT + 19.4);
    x.fill();
    // кроны далеко от фасада: полутень размывает тень листьев — рисуем их на холсте в четверть
    // разрешения (увеличение само смягчает край) и кладём полупрозрачно
    const q = document.createElement('canvas');
    q.width = Math.ceil(x.canvas.width / 4); q.height = Math.ceil(x.canvas.height / 4);
    const qg = q.getContext('2d');
    qg.setTransform(q.width / SW, 0, 0, q.height / SH, 0, 0); qg.strokeStyle = rgb(C.shadow);
    for (const p of PALMS) if (p.far) palmShadow(qg, p, toFar, LO);
    x.globalAlpha = 0.62; x.imageSmoothingQuality = 'high'; x.drawImage(q, 0, 0, SW, SH);
    x.restore();
  }

  // ---------- Финиковые пальмы ----------
  // Всё в мировых координатах: ствол — изогнутый конус с кольцами рубцов, крона — перистые листья
  // (черешок поднимается и свисает, листочки по обе стороны), нижние листья сухие. Отсюда честная
  // перспектива и тени на землю, стену и дальний фасад.
  // near — на правом тротуаре (рисуется среди выступающих предметов), far — на террасе, alley — в переулке за домами
  const PALMS = [
    { X: 4.3, Y0: WALK, U: 15.6, h: 5.5, lx: -0.45, lu: 0.25, n: 16, fl: 2.5, seed: 61, near: true },
    { X: -4.3, Y0: PLAT, U: 60.4, h: 8.2, lx: 0.45, lu: -0.2, n: 14, fl: 2.7, seed: 62, far: true },
    { X: 4.7, Y0: PLAT, U: 61.2, h: 6.9, lx: -0.5, lu: 0.1, n: 13, fl: 2.5, seed: 63, far: true },
    { X: -8.6, Y0: 0, U: 41.3, h: 12.8, lx: 0.7, lu: 0.2, n: 14, fl: 2.8, seed: 64, alley: true },
  ];
  const PGEO = new Map();
  function palmGet(p) {
    if (PGEO.has(p)) return PGEO.get(p);
    const r = Tex.rng(p.seed), axis = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12, b = t * t; axis.push([p.X + p.lx * b, p.Y0 + p.h * t, p.U + p.lu * b]); }
    const top = axis[12], fronds = [];
    for (let i = 0; i < p.n; i++) {
      const az = (i + r() * 0.7) / p.n * Math.PI * 2, tier = i % 3, dry = tier === 2 && r() < 0.55;
      const L = p.fl * (0.8 + r() * 0.3) * (tier === 2 ? 0.85 : 1);
      const up = [0.8, 0.4, -0.1][tier] + (r() - 0.5) * 0.3, droop = 0.6 + r() * 0.35;
      const pts = [];
      for (let k = 0; k <= 9; k++) {
        const s = k / 9, rr = L * s * (dry ? 0.45 : 1), yy = dry ? -L * 0.85 * s : L * (up * s - droop * s * s);
        pts.push([top[0] + Math.cos(az) * rr, top[1] + yy, top[2] + Math.sin(az) * rr]);
      }
      // листочки: от черешка в обе стороны, вперёд по листу и вниз; у сухих — висят
      const leaves = [];
      for (let k = 2; k <= 17; k++) {
        const s = k / 18, fi = s * 9, i0 = Math.floor(fi), tt = fi - i0, a = pts[i0], b = pts[i0 + 1];
        const B = [lerp(a[0], b[0], tt), lerp(a[1], b[1], tt), lerp(a[2], b[2], tt)];
        let tx = b[0] - a[0], ty = b[1] - a[1], tu = b[2] - a[2]; const tl = Math.hypot(tx, ty, tu) || 1; tx /= tl; ty /= tl; tu /= tl;
        const hl = Math.hypot(tx, tu) || 1, sx = tu / hl, su = -tx / hl;
        const ll = L * 0.3 * Math.pow(Math.sin(Math.PI * Math.min(0.97, s * 0.92 + 0.06)), 0.7);
        for (const sd of [-1, 1]) {
          const tip = dry ? [B[0] + sx * sd * ll * 0.25, B[1] - ll * 0.9, B[2] + su * sd * ll * 0.25]
            : [B[0] + sx * sd * ll * 0.78 + tx * ll * 0.4, B[1] + ty * ll * 0.4 - ll * 0.48, B[2] + su * sd * ll * 0.78 + tu * ll * 0.4];
          leaves.push([B, tip]);
        }
      }
      const lf = 0.5 + 0.5 * (Math.cos(az) * -0.73 + Math.sin(az) * -0.69);   // лист повёрнут к солнцу — светлее
      fronds.push({ pts: pts, leaves: leaves, dry: dry, lit: clamp(lf * 0.75 + (tier === 0 ? 0.25 : 0), 0, 1), tipU: pts[9][2] });
    }
    fronds.sort((a, b) => b.tipU - a.tipU);
    const G = { axis: axis, top: top, fronds: fronds };
    PGEO.set(p, G);
    return G;
  }
  function palmDraw(x, p, LO) {
    const G = palmGet(p), U = p.U, ax = G.axis, Lh = [], Rh = [], M = [];
    for (let i = 0; i < ax.length; i++) {
      const t = i / (ax.length - 1), q = P(ax[i][0], ax[i][1], ax[i][2]), w = F * lerp(0.24, 0.16, t) / ax[i][2];
      Lh.push([q[0] - w, q[1]]); Rh.push([q[0] + w, q[1]]); M.push([q[0] + w * 0.2, q[1]]);
    }
    const path = (a, b) => { x.beginPath(); x.moveTo(a[0][0], a[0][1]); for (const q of a.concat(b.slice().reverse())) x.lineTo(q[0], q[1]); x.closePath(); };
    path(Lh, Rh); fillp(x, hzs([150, 126, 96], U));
    path(M, Rh); fillp(x, hzs([90, 76, 62], U));
    if (!LO) {   // кольца листовых рубцов
      x.beginPath();
      for (let i = 0; i < ax.length - 1; i++) for (let k = 0; k < 3; k++) {
        const t = k / 3, a = [lerp(Lh[i][0], Lh[i + 1][0], t), lerp(Lh[i][1], Lh[i + 1][1], t)], b = [lerp(Rh[i][0], Rh[i + 1][0], t), lerp(Rh[i][1], Rh[i + 1][1], t)];
        x.moveTo(a[0], a[1]); x.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + Math.abs(b[0] - a[0]) * 0.18, b[0], b[1]);
      }
      x.strokeStyle = hzs([70, 58, 46], U, 0.55); x.lineWidth = clamp(F * 0.025 / U, 0.6, 2.4); x.stroke();
    }
    // остатки черешков под кроной
    x.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2, q = G.top;
      line3(x, [[q[0], q[1] - 0.15, q[2]], [q[0] + Math.cos(a) * 0.35, q[1] - 0.55, q[2] + Math.sin(a) * 0.35]]);
    }
    x.strokeStyle = hzs([112, 92, 68], U); x.lineWidth = clamp(F * 0.07 / U, 0.8, 6); x.stroke();
    const lw = clamp(F * 0.05 / U, 0.75, 4.5);
    for (const f of G.fronds) {
      const col = f.dry ? mix([96, 78, 56], [158, 132, 92], f.lit) : mix([54, 62, 42], [124, 128, 80], f.lit);
      x.lineCap = 'round';
      if (LO) { x.beginPath(); line3(x, f.pts); x.strokeStyle = hzs(col, U); x.lineWidth = Math.max(1, F * 0.3 / U); x.stroke(); continue; }
      x.beginPath();
      for (const l of f.leaves) line3(x, l);
      x.strokeStyle = hzs(col, U); x.lineWidth = lw; x.stroke();
      x.beginPath(); line3(x, f.pts);
      x.strokeStyle = hzs(mix(col, [176, 170, 120], 0.3), U); x.lineWidth = lw * 0.9; x.stroke();
    }
    x.lineCap = 'butt';
  }
  // тень пальмы в маску g: proj — проекция точки на плоскость тени (земля, стена, дальний фасад)
  function palmShadow(g, p, proj, LO) {
    const G = palmGet(p), seg = (a, b) => line3(g, [proj(a[0], a[1], a[2]), proj(b[0], b[1], b[2])]);
    g.beginPath();
    for (let i = 0; i + 1 < G.axis.length; i++) seg(G.axis[i], G.axis[i + 1]);
    g.lineWidth = F * 0.4 / (p.U + 3); g.stroke();
    g.beginPath();
    for (const f of G.fronds) { if (!LO) for (const l of f.leaves) seg(l[0], l[1]); for (let k = 0; k < 9; k++) seg(f.pts[k], f.pts[k + 1]); }
    g.lineWidth = Math.max(0.8, F * (LO ? 0.3 : 0.07) / (p.U + 3)); g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt';
  }
  const toGround = (X, Y, U) => [X + Y * KX, 0, U + Y * KU];

  // ---------- Освещение граней ----------
  // n·L для нормалей: +X, −X, вверх, вниз, к камере (−U). Свет — по направлению солнца выше.
  const NL = { px: -0.52, nx: 0.52, py: 0.70, ny: -1, nu: 0.49 };
  const shadeCol = (m, nl, sh) => (sh || nl <= 0 ? (nl < -0.9 ? mul(m.s, 0.8) : m.s) : mix(m.s, m.l, nl / 0.52));
  // коробка [x0,x1]×[y0,y1]×[u0,u1]: рисуем только видимые с камеры грани
  function box(x, x0, x1, y0, y1, u0, u1, m, sh) {
    const f = (pts, nl) => { x.beginPath(); poly3(x, pts); fillp(x, hzs(shadeCol(m, nl, sh), u0)); };
    if (CAMX < x0) f([[x0, y1, u0], [x0, y1, u1], [x0, y0, u1], [x0, y0, u0]], NL.nx);
    if (CAMX > x1) f([[x1, y1, u0], [x1, y1, u1], [x1, y0, u1], [x1, y0, u0]], NL.px);
    if (y1 < EYE) f([[x0, y1, u0], [x1, y1, u0], [x1, y1, u1], [x0, y1, u1]], NL.py);
    if (y0 > EYE) f([[x0, y0, u0], [x1, y0, u0], [x1, y0, u1], [x0, y0, u1]], NL.ny);
    f([[x0, y1, u0], [x1, y1, u0], [x1, y0, u0], [x0, y0, u0]], NL.nu);
  }

  // выгоревшие краски ставен и дверей, тёмная глубина, металл
  const PAINT = {
    teal: { l: [104, 140, 132], s: [62, 82, 82] }, green: { l: [120, 136, 100], s: [70, 80, 64] },
    blue: { l: [110, 132, 150], s: [64, 76, 90] }, brown: { l: [134, 102, 74], s: [82, 64, 52] },
    wood: { l: [158, 130, 98], s: [94, 80, 66] },
  };
  const DARK = [40, 36, 34], IRON = [46, 44, 44];

  // ---------- Проём в толстой стене ----------
  // Ниша глубиной r: видны задняя плоскость (стекло, ставни, дверь), дальний откос (смотрит на камеру),
  // низ перемычки, если проём выше глаз. На солнечной стороне в нише — тень от ближнего откоса и перемычки.
  function niche(x, b, u0, u1, v0, v1, r, archH, back, far) {
    const xf = xfOf(b), s = b.s, xi = xf + s * r, lit = s > 0, uc = (u0 + u1) / 2;
    const m = MAT[b.gm && v1 <= b.fl[0] + 0.01 ? b.gm : b.m];
    const outline = (X) => {
      if (!archH) { fr(x, X, u0, v0, u1, v1); return; }
      const pts = [[X, v0, u0]], hw = (u1 - u0) / 2;
      for (let i = 0; i <= 12; i++) { const a = Math.PI - Math.PI * i / 12; pts.push([X, v1 - archH + Math.sin(a) * archH, uc + Math.cos(a) * hw]); }
      pts.push([X, v0, u1]);
      poly3(x, pts);
    };
    if (far) {   // далеко: проём читается как откос и тёмная щель
      x.beginPath(); outline(xf); fillp(x, hzs(mix(lit ? m.l : m.s, DARK, lit ? 0.38 : 0.45), uc));
      return;
    }
    x.save();
    x.beginPath(); outline(xf); x.clip();
    back(xi, u0, u1, v0, v1);
    if (lit) {   // Г-образная тень в нише
      x.beginPath();
      fr(x, xi, u0, v0, u0 + r * KU / KX, v1);
      fr(x, xi, u0, v1 - archH - r / KX, u1, v1);
      fillp(x, 'rgba(38,40,62,.5)');
    }
    // дальний откос
    const ja = Math.min(xf, xi), jb = Math.max(xf, xi), vt = v1 - archH;
    x.beginPath(); ur(x, u1, ja, v0, jb, vt);
    fillp(x, hzs(lit ? mix(m.l, m.s, 0.12) : mul(m.s, 0.86), u1));
    if (lit) { x.beginPath(); poly3(x, [[xf, vt, u1], [xi, vt, u1], [xi, vt - r / KX, u1]]); fillp(x, hzs(mul(m.s, 0.95), u1)); }
    // низ перемычки (или свод арки) — видим снизу
    if (v1 > EYE) {
      x.beginPath();
      if (!archH) poly3(x, [[xf, v1, u0], [xf, v1, u1], [xi, v1, u1], [xi, v1, u0]]);
      else {
        const hw = (u1 - u0) / 2, o = [], ii = [];
        for (let i = 0; i <= 12; i++) {
          const a = Math.PI - Math.PI * i / 12, v = v1 - archH + Math.sin(a) * archH, u = uc + Math.cos(a) * hw;
          o.push([xf, v, u]); ii.unshift([xi, v, u]);
        }
        poly3(x, o.concat(ii));
      }
      fillp(x, hzs(lit ? mul(mix(m.s, m.l, 0.3), 0.92) : mul(m.s, 0.72), uc));
    }
    // дно ниши видно сверху, если ниже глаз
    if (v0 < EYE) { x.beginPath(); poly3(x, [[xf, v0, u0], [xf, v0, u1], [xi, v0, u1], [xi, v0, u0]]); fillp(x, hzs(lit ? m.l : m.s, uc)); }
    x.restore();
  }

  // жалюзи-ламели: горизонтальные линии на плоскости X
  function slats(x, X, u0, u1, v0, v1, step, col, uc) {
    const gap = F * step / uc;
    if (gap < 2.6) return;
    x.beginPath();
    for (let v = v0 + step * 0.6; v < v1 - step * 0.3; v += step) line3(x, [[X, v, u0], [X, v, u1]]);
    x.strokeStyle = col; x.lineWidth = clamp(gap * 0.32, 0.7, 3); x.stroke();
  }
  // створка ставни на плоскости X (рамка + ламели)
  function leaf(x, X, u0, u1, v0, v1, pc, uc, LO) {
    x.beginPath(); fr(x, X, u0, v0, u1, v1); fillp(x, hzs(pc, uc));
    if (LO) return;
    slats(x, X, u0 + 0.04, u1 - 0.04, v0 + 0.05, v1 - 0.05, 0.075, hzs(mul(pc, 0.68), uc), uc);
    x.beginPath(); fr(x, X, u0, v0, u1, v1);
    x.strokeStyle = hzs(mul(pc, 0.6), uc); x.lineWidth = clamp(F * 0.02 / uc, 0.6, 2.5); x.stroke();
  }
  // створка, распахнутая на 90° (в плоскости U = u, видна анфас)
  function leafOut(x, u, X0, X1, v0, v1, pc, LO) {
    x.beginPath(); ur(x, u, Math.min(X0, X1), v0, Math.max(X0, X1), v1); fillp(x, hzs(pc, u));
    if (LO) return;
    const gap = F * 0.075 / u;
    if (gap < 2.6) return;
    x.beginPath();
    for (let v = v0 + 0.06; v < v1 - 0.04; v += 0.075) line3(x, [[X0 + (X1 - X0) * 0.08, v, u], [X1 - (X1 - X0) * 0.08, v, u]]);
    x.strokeStyle = hzs(mul(pc, 0.66), u); x.lineWidth = clamp(gap * 0.3, 0.7, 3); x.stroke();
  }
  // решётка в плоскости фасада
  function grille(x, X, u0, u1, v0, v1, uc, arch) {
    const lw = clamp(F * 0.024 / uc, 0.8, 4);
    if (F * 0.12 / uc < 3) return;
    x.beginPath();
    for (let u = u0 + 0.1; u < u1 - 0.04; u += 0.12) line3(x, [[X, v0, u], [X, arch ? v1 - (u1 - u0) * 0.5 : v1, u]]);
    for (const k of [0.18, 0.5, 0.82]) line3(x, [[X, lerp(v0, v1, k) - (arch ? (v1 - v0) * 0.15 : 0), u0], [X, lerp(v0, v1, k) - (arch ? (v1 - v0) * 0.15 : 0), u1]]);
    x.strokeStyle = hzs(IRON, uc); x.lineWidth = lw; x.stroke();
  }

  // ---------- Тени на освещённом (правом) фасаде от выступов ----------
  // точка мира → её тень на плоскости X = XR (луч вправо, вниз и вглубь)
  const onWall = (X, Y, U) => { const run = XR - X; return [XR, Y - run / KX, U + run * KU / KX]; };
  let WALLSH = [];                  // многоугольники теней (в мировых точках на стене), копятся за кадр
  function wallShadowBox(x0, x1, y0, y1, u0, u1) {
    const pts = [];
    for (const X of [x0, x1]) for (const Y of [y0, y1]) for (const U of [u0, u1]) { const p = onWall(X, Y, U); pts.push([p[2], p[1]]); }
    WALLSH.push(hull(pts).map((p) => [XR, p[1], p[0]]));
  }
  function wallShadowLine(a, b, w) {          // тонкий предмет (прут, кабель): полоска ширины w
    const p = onWall(a[0], a[1], a[2]), q = onWall(b[0], b[1], b[2]);
    WALLSH.push([[XR, p[1] + w, p[2]], [XR, q[1] + w, q[2]], [XR, q[1] - w, q[2]], [XR, p[1] - w, p[2]]]);
  }

  // ---------- Окна, двери, витрины ----------
  function archPts(X, u0, u1, v0, v1, archH) {
    const pts = [[X, v0, u0]], hw = (u1 - u0) / 2, uc = (u0 + u1) / 2;
    for (let i = 0; i <= 12; i++) { const a = Math.PI - Math.PI * i / 12; pts.push([X, v1 - archH + Math.sin(a) * archH, uc + Math.cos(a) * hw]); }
    pts.push([X, v0, u1]);
    return pts;
  }
  // выступающий подоконник/карниз вдоль фасада; на солнечной стороне — тень под ним
  function ledge(x, b, u0, u1, y0, y1, d, m) {
    const xf = xfOf(b), lit = b.s > 0, xo = xf - b.s * d;
    if (lit) wallShadowBox(xo, xf, y0, y1, u0, u1);
    box(x, Math.min(xf, xo), Math.max(xf, xo), y0, y1, u0, u1, m, !lit);
  }
  function windowAt(x, b, uc, w, v0, hgt, style, R, LO) {
    const xf = xfOf(b), s = b.s, lit = s > 0, out = -s, u0 = uc - w / 2, u1 = uc + w / 2, v1 = v0 + hgt;
    const m = MAT[b.m], pt = PAINT[b.paint], pc = lit ? pt.l : pt.s;
    const far = LO || Math.abs(sxOf(xf, u1) - sxOf(xf, u0)) < 2.5;
    const archH = style === 'arch' ? w / 2 : 0;
    const roll = R(), curtain = R() < 0.45, k = R();
    if (style === 'grl') b = Object.assign({}, b, { bars: true });
    const st = style !== 'shut' ? 'bare' : roll < 0.3 ? 'closed' : roll < 0.52 ? 'open' : roll < 0.72 ? 'half' : roll < 0.86 ? 'ajar' : 'bare';
    if (style !== 'mod') {          // наличник: светлая штукатурная рамка
      x.beginPath();
      if (archH) poly3(x, archPts(xf, u0 - 0.12, u1 + 0.12, v0 - 0.08, v1 + 0.12, archH + 0.12)); else fr(x, xf, u0 - 0.12, v0 - 0.08, u1 + 0.12, v1 + 0.12);
      fillp(x, hzs(mix(lit ? m.l : m.s, lit ? [250, 242, 226] : [172, 162, 152], 0.32), uc));
    }
    const glassC = lit ? [72, 76, 84] : [128, 116, 102];
    niche(x, b, u0, u1, v0, v1, 0.3, archH, (xi, a0, a1, b0, b1) => {
      x.beginPath(); fr(x, xi, a0, b0, a1, b1); fillp(x, hzs(glassC, uc));
      x.beginPath(); fr(x, xi, a0, b0 + (b1 - b0) * 0.55, a1, b1); fillp(x, rgb(DARK, 0.25));
      if (curtain) { x.beginPath(); fr(x, xi, a0 + w * 0.06, b0 + hgt * 0.08, a0 + w * (0.4 + k * 0.4), b1 - hgt * 0.04); fillp(x, hzs(lit ? [200, 190, 172] : [142, 132, 120], uc)); }
      if (st === 'closed') { leaf(x, xi, a0, uc, b0, b1, pc, uc, LO); leaf(x, xi, uc, a1, b0, b1, pc, uc, LO); }
      if (st === 'half') leaf(x, xi, a0, uc, b0, b1, pc, uc, LO);
      if (style === 'mod') {        // рольставня опущена на часть высоты
        const c = lit ? [200, 196, 184] : [130, 128, 124];
        x.beginPath(); fr(x, xi, a0, b1 - hgt * k * 0.7, a1, b1); fillp(x, hzs(c, uc));
        slats(x, xi, a0, a1, b1 - hgt * k * 0.7, b1, 0.06, hzs(mul(c, 0.8), uc), uc);
      }
    }, far);
    if (far) return;
    ledge(x, b, u0 - 0.1, u1 + 0.1, v0 - 0.07, v0, 0.09, MAT.white);
    if (st === 'open') { leaf(x, xf, u0 - w / 2 - 0.06, u0 - 0.06, v0, v1, pc, uc, LO); leaf(x, xf, u1 + 0.06, u1 + w / 2 + 0.06, v0, v1, pc, uc, LO); }
    if (st === 'half') leaf(x, xf, u1 + 0.06, u1 + w / 2 + 0.06, v0, v1, pc, uc, LO);
    if (st === 'ajar') {
      ITEMS.push({ u: u1, f: () => leafOut(x, u1 + 0.04, xf, xf + out * w * 0.48, v0, v1, mix(pt.s, pt.l, lit ? 0.94 : 0), LO) });
      if (lit) wallShadowBox(xf + out * w * 0.48, xf, v0, v1, u1, u1 + 0.03);
    }
    if (style === 'arch' || b.bars) grille(x, xf + out * 0.02, u0, u1, v0, v1, uc, archH);
    if (style === 'mod') ledge(x, b, u0 - 0.06, u1 + 0.06, v1 + 0.02, v1 + 0.24, 0.14, MAT.white);
  }

  // дверь: деревянная двустворчатая с филёнками, порог-ступенька
  function doorAt(x, b, u0, u1, kind, R, LO) {
    const xf = xfOf(b), s = b.s, lit = s > 0, out = -s, uc = (u0 + u1) / 2;
    const hgt = kind === 'adoor' ? 3.0 : 2.35, archH = kind === 'adoor' ? (u1 - u0) / 2 : 0;
    const pt = PAINT[b.dpaint || b.paint], pc = lit ? pt.l : pt.s, m = MAT[b.gm || b.m];
    const far = LO || Math.abs(sxOf(xf, u1) - sxOf(xf, u0)) < 2.5;
    // каменный портал
    x.beginPath();
    if (archH) poly3(x, archPts(xf, u0 - 0.22, u1 + 0.22, 0, 0.2 + hgt + 0.22, archH + 0.22)); else fr(x, xf, u0 - 0.18, 0, u1 + 0.18, 0.2 + hgt + 0.2);
    fillp(x, hzs(lit ? MAT.stone.l : MAT.stone.s, uc));
    niche(x, b, u0, u1, 0.2, 0.2 + hgt, 0.34, archH, (xi, a0, a1, b0, b1) => {
      x.beginPath(); fr(x, xi, a0, b0, a1, b1); fillp(x, hzs(pc, uc));
      if (LO) return;
      // филёнки: по две на створку
      x.beginPath();
      for (const [p0, p1] of [[a0, uc], [uc, a1]]) {
        const d = (p1 - p0) * 0.18;
        fr(x, xi, p0 + d, b0 + 0.25, p1 - d, b0 + hgt * 0.45);
        fr(x, xi, p0 + d, b0 + hgt * 0.53, p1 - d, b1 - archH - 0.2);
      }
      x.strokeStyle = hzs(mul(pc, 0.62), uc); x.lineWidth = clamp(F * 0.03 / uc, 0.8, 3); x.stroke();
      x.beginPath(); line3(x, [[xi, b0, uc], [xi, b1, uc]]); x.strokeStyle = hzs(mul(pc, 0.45), uc); x.stroke();
    }, far);
    // ступенька
    const xo = xf + out * 0.4;
    box(x, Math.min(xf, xo), Math.max(xf, xo), 0, 0.2, u0 - 0.15, u1 + 0.15, MAT.stone, !lit);
  }

  // лавки разного рода: rugs — ковры, cafe — кафе со стойкой, work — мастерская, bakery — пекарня,
  // spice — пряности и банки, grocery — полки с товаром, closed — штора опущена до земли (ржавые потёки, замок)
  function shopAt(x, b, u0, u1, R, LO, type) {
    const xf = xfOf(b), lit = b.s > 0, uc = (u0 + u1) / 2, top = Math.min(b.fl[0] - 0.75, 3.3);
    const up = type === 'closed' ? 0 : type === 'grocery' ? 0.62 + R() * 0.3 : 0.97, far = LO || Math.abs(sxOf(xf, u1) - sxOf(xf, u0)) < 3;
    const dk = (c) => hzs(mul(c, lit ? 0.72 : 0.5), uc);
    niche(x, b, u0, u1, 0.12, top, 0.24, 0, (xi, a0, a1, b0, b1) => {
      x.beginPath(); fr(x, xi, a0, b0, a1, b1); fillp(x, hzs(lit ? [66, 58, 50] : [46, 40, 36], uc));
      const r2 = Tex.rng(b.seed * 31 + Math.round(u0 * 10)), q = (u, v, w, h, c) => { x.beginPath(); fr(x, xi, u, v, u + w, v + h); fillp(x, dk(c)); };
      if (!LO && up > 0) {
        if (type === 'rugs') {           // ковры на задней стене: кайма, медальон, бахрома
          const RUG = [[[150, 64, 52], [214, 190, 140]], [[62, 72, 104], [196, 170, 120]], [[176, 132, 72], [120, 52, 44]], [[120, 50, 46], [70, 82, 110]]];
          for (let u = a0 + 0.08, k = 0; u < a1 - 0.5; u += 0.78, k++) {
            const w = Math.min(0.7, a1 - 0.08 - u), c = RUG[k % 4], v0 = b0 + 0.3 + (k % 2) * 0.15, v1 = b1 - 0.32;
            q(u, v0, w, v1 - v0, c[0]);
            x.beginPath(); fr(x, xi, u + w * 0.12, v0 + 0.12, u + w * 0.88, v1 - 0.12); x.strokeStyle = dk(c[1]); x.lineWidth = clamp(F * 0.03 / uc, 0.8, 4); x.stroke();
            const cu = u + w / 2, cv = (v0 + v1) / 2;
            x.beginPath(); poly3(x, [[xi, cv + 0.32, cu], [xi, cv, cu + w * 0.25], [xi, cv - 0.32, cu], [xi, cv, cu - w * 0.25]]); fillp(x, dk(c[1]));
            x.beginPath(); for (let f = u + 0.04; f < u + w; f += 0.06) line3(x, [[xi, v0, f], [xi, v0 - 0.08, f]]);
            x.strokeStyle = dk([200, 186, 160]); x.lineWidth = 1; x.stroke();
          }
        } else if (type === 'cafe') {    // стойка, полка с посудой, кофемашина, меловая доска
          q(a0 + 0.15, b0, (a1 - a0) * 0.62, 1.05, [120, 86, 60]);
          q(a0 + 0.15, b0 + 1.0, (a1 - a0) * 0.62, 0.06, [196, 180, 150]);
          q(a0 + 0.5, b0 + 1.06, 0.36, 0.42, [150, 150, 148]);
          q(a1 - 1.0, b0 + 1.2, 0.7, 0.85, [40, 46, 42]);
          x.beginPath(); for (let v = b0 + 1.35; v < b0 + 1.95; v += 0.14) line3(x, [[xi, v, a1 - 0.92], [xi, v, a1 - 0.92 + 0.3 + r2() * 0.25]]);
          x.strokeStyle = dk([210, 206, 196]); x.lineWidth = 1; x.stroke();
          q(a0 + 0.15, b0 + 1.75, (a1 - a0) * 0.5, 0.04, [130, 100, 72]);
          for (let u = a0 + 0.2; u < a0 + (a1 - a0) * 0.5; u += 0.12 + r2() * 0.1) q(u, b0 + 1.79, 0.07, 0.12 + r2() * 0.16, [[170, 160, 140], [110, 130, 116], [150, 100, 70]][Math.floor(r2() * 3)]);
        } else if (type === 'work') {    // мастерская: щит с инструментом, верстак, шина у стены
          q(a0 + 0.2, b0 + 1.0, a1 - a0 - 0.4, 1.3, [150, 124, 92]);
          x.beginPath();
          for (let u = a0 + 0.35; u < a1 - 0.4; u += 0.32) {
            const k = Math.floor(r2() * 3), v = b0 + 1.9 - r2() * 0.3;
            if (k === 0) line3(x, [[xi, v, u], [xi, v - 0.45, u + 0.04]]);
            else if (k === 1) line3(x, [[xi, v, u - 0.08], [xi, v, u + 0.08], [xi, v, u], [xi, v - 0.38, u]]);
            else line3(x, [[xi, v, u], [xi, v - 0.4, u - 0.1], [xi, v - 0.4, u + 0.1], [xi, v, u]]);
          }
          x.strokeStyle = dk([40, 38, 36]); x.lineWidth = clamp(F * 0.03 / uc, 0.8, 3); x.stroke();
          q(a0 + 0.1, b0 + 0.85, a1 - a0 - 0.2, 0.08, [110, 84, 60]);
          q(a0 + 0.2, b0, 0.08, 0.85, [80, 64, 50]); q(a1 - 0.28, b0, 0.08, 0.85, [80, 64, 50]);
          const tc = [xi, b0 + 0.36, a1 - 0.5], ring = (r) => { const p = []; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; p.push([xi, tc[1] + Math.sin(a) * r, tc[2] + Math.cos(a) * r]); } return p; };
          x.beginPath(); poly3(x, ring(0.34)); poly3(x, ring(0.18).reverse()); fillp(x, dk([46, 44, 44]));
        } else if (type === 'bakery') {  // полки с хлебом и стойка
          for (let v = b0 + 1.1; v < b1 - 0.35; v += 0.45) {
            q(a0, v, a1 - a0, 0.05, [130, 100, 70]);
            for (let u = a0 + 0.08; u < a1 - 0.3; u += 0.24 + r2() * 0.1) {
              const w = 0.18 + r2() * 0.08, c = [[184, 134, 82], [160, 112, 66], [204, 166, 110]][Math.floor(r2() * 3)];
              x.beginPath(); poly3(x, [[xi, v + 0.05, u], [xi, v + 0.15, u + 0.02], [xi, v + 0.19, u + w * 0.5], [xi, v + 0.15, u + w - 0.02], [xi, v + 0.05, u + w]]); fillp(x, dk(c));
            }
          }
          q(a0 + 0.1, b0, a1 - a0 - 0.2, 0.95, [150, 124, 92]);
          q(a0 + 0.1, b0 + 0.92, a1 - a0 - 0.2, 0.05, [210, 196, 170]);
        } else {                          // полки: банки (spice) или товар в коробках (grocery)
          const jars = type === 'spice';
          for (let v = b0 + 0.45; v < b0 + 2.0; v += 0.42) {
            q(a0, v, a1 - a0, 0.05, [96, 84, 70]);
            for (let u = a0 + 0.1; u < a1 - 0.2; u += (jars ? 0.13 : 0.18) + r2() * (jars ? 0.06 : 0.3)) {
              const c = jars ? [[170, 90, 56], [190, 150, 70], [126, 96, 64], [120, 130, 76], [200, 190, 170]][Math.floor(r2() * 5)]
                : [[150, 120, 80], [120, 130, 120], [170, 150, 120], [130, 90, 70], [180, 170, 150]][Math.floor(r2() * 5)];
              const w = jars ? 0.09 : 0.12 + r2() * 0.2, h = jars ? 0.16 + r2() * 0.06 : 0.13 + r2() * 0.18;
              q(u, v + 0.05, w, h, c);
              if (jars) q(u - 0.005, v + 0.05 + h, w + 0.01, 0.03, [210, 204, 190]);
            }
          }
        }
      }
      if (up >= 0.97) {                  // штора поднята: виден только короб
        const c = lit ? [168, 168, 162] : [104, 104, 102];
        x.beginPath(); fr(x, xi, a0, b1 - 0.22, a1, b1); fillp(x, hzs(c, uc));
        x.beginPath(); fr(x, xi, a0, b1 - 0.25, a1, b1 - 0.2); fillp(x, hzs(mul(c, 0.55), uc));
        return;
      }
      const vs = up > 0 ? b1 - (b1 - b0) * (1 - up) - 0.25 : b0;
      const c = type === 'closed' ? (lit ? [168, 160, 146] : [104, 102, 98]) : (lit ? [176, 178, 170] : [112, 114, 112]);
      x.beginPath(); fr(x, xi, a0, vs, a1, b1); fillp(x, hzs(c, uc));
      slats(x, xi, a0, a1, vs, b1, 0.09, hzs(mul(c, 0.78), uc), uc);
      x.beginPath(); fr(x, xi, a0, vs - 0.05, a1, vs + 0.04); fillp(x, hzs(mul(c, 0.55), uc));
      if (type === 'closed' && !LO) {    // ржавые потёки, пыль снизу, навесной замок
        for (let u = a0 + 0.2; u < a1 - 0.1; u += 0.35 + r2() * 0.4) {
          const v1 = b1 - 0.1 - r2() * 0.4, v0 = v1 - 0.6 - r2() * 1.2;
          x.beginPath(); fr(x, xi, u, v0, u + 0.05 + r2() * 0.06, v1); fillp(x, hzs([120, 82, 56], uc, 0.35));
        }
        x.beginPath(); fr(x, xi, a0, b0, a1, b0 + 0.35); fillp(x, hzs([190, 170, 136], uc, 0.35));
        q(uc - 0.05, b0 + 0.08, 0.1, 0.12, [60, 56, 50]);
      }
    }, far);
  }

  // гаражные ворота: гофрированный металл, закрыты
  function garageAt(x, b, u0, u1, LO) {
    const xf = xfOf(b), lit = b.s > 0, uc = (u0 + u1) / 2, pt = PAINT.blue;
    const c = lit ? pt.l : mix(pt.s, [120, 120, 120], 0.3);
    niche(x, b, u0, u1, 0.05, 2.9, 0.18, 0, (xi, a0, a1, b0, b1) => {
      x.beginPath(); fr(x, xi, a0, b0, a1, b1); fillp(x, hzs(c, uc));
      slats(x, xi, a0, a1, b0, b1, 0.11, hzs(mul(c, 0.72), uc), uc);
      x.beginPath(); fr(x, xi, a0, b0, a1, b0 + 0.5); fillp(x, rgb([120, 100, 80], 0.25));
    }, LO || Math.abs(sxOf(xf, u1) - sxOf(xf, u0)) < 3);
  }

  // ---------- Кладка, пояса, балконы ----------
  // швы песчаника — тонкие полоски в плоскости фасада (сами сужаются с глубиной)
  function masonry(x, b, u0, u1, v0, v1) {
    const xf = xfOf(b), uc = (u0 + u1) / 2, lit = b.s > 0, course = 0.34;
    x.beginPath();
    let row = 0;
    for (let v = v0 + course; v < v1 - 0.05; v += course, row++) {
      fr(x, xf, u0, v - 0.014, u1, v + 0.014);
      const off = (row % 2) * 0.36 + ((row * 7) % 3) * 0.09;
      for (let u = u0 + off; u < u1; u += 0.72) {
        if (Math.abs(sxOf(xf, u + 0.72) - sxOf(xf, u)) < 4) break;
        fr(x, xf, u - 0.012, v, u + 0.012, Math.min(v + course, v1));
      }
    }
    fillp(x, hzs(lit ? [150, 120, 88] : [92, 78, 66], uc));
  }
  function balcony(x, b, fv, ua, ub, R, LO) {
    const xf = xfOf(b), lit = b.s > 0, out = -b.s, xo = xf + out * 1.0;
    const x0 = Math.min(xf, xo), x1 = Math.max(xf, xo), solid = R() < 0.35, top = fv + 1.0;
    const rail = (X) => X - out * 0.03;
    if (lit) {
      wallShadowBox(x0, x1, fv - 0.16, fv, ua, ub);
      if (solid) wallShadowBox(Math.min(xo, xo - out * 0.1), Math.max(xo, xo - out * 0.1), fv, top, ua, ub);
      else {
        wallShadowLine([rail(xo), top, ua], [rail(xo), top, ub], 0.025);
        for (let u = ua + 0.12; u < ub; u += 0.12) wallShadowLine([rail(xo), fv, u], [rail(xo), top, u], 0.012);
      }
    }
    ITEMS.push({ u: ua, f: () => {
      box(x, x0, x1, fv - 0.16, fv, ua, ub, MAT.gray, !lit);
      if (solid) {
        const m = MAT[b.m];
        box(x, Math.min(xo, xo - out * 0.1), Math.max(xo, xo - out * 0.1), fv, top, ua, ub, m, !lit);
        box(x, x0, x1, fv, top, ua, ua + 0.1, m, !lit);
        box(x, x0 - 0.02, x1 + 0.02, top, top + 0.06, ua - 0.02, ub + 0.02, MAT.white, !lit);
        return;
      }
      const um = (ua + ub) / 2, lw = clamp(F * 0.028 / um, 0.8, 4), c = hzs(lit ? [70, 66, 62] : IRON, um);
      x.beginPath();
      line3(x, [[xf, top, ua], [rail(xo), top, ua], [rail(xo), top, ub]]);
      line3(x, [[xf, fv + 0.1, ua], [rail(xo), fv + 0.1, ua], [rail(xo), fv + 0.1, ub]]);
      if (!LO) {
        for (let u = ua + 0.12; u < ub; u += 0.12) line3(x, [[rail(xo), fv, u], [rail(xo), top, u]]);
        for (let k = 0.12; k < 1; k += 0.12) { const X = lerp(xf, rail(xo), k); line3(x, [[X, fv, ua], [X, top, ua]]); }
      }
      x.strokeStyle = c; x.lineWidth = lw; x.stroke();
    } });
  }

  // ---------- Дом целиком ----------
  function houseDetail(x, b, LO) {
    const R = Tex.rng(b.seed * 7919 + 13), xf = xfOf(b), lit = b.s > 0, m = MAT[b.m];
    const top = b.fl.reduce((a, c) => a + c, 0);
    if (b.gm && !LO) masonry(x, b, b.u0, b.u1, 0.55, b.fl[0]);
    else if (b.m === 'stone' && !LO) masonry(x, b, b.u0, b.u1, 0.55, top);
    ledge(x, b, b.u0, b.u1, 0.5, 0.58, 0.03, m);     // полка цоколя
    // междуэтажные пояса, венчающий карниз, парапет
    let v = 0;
    for (let i = 0; i < b.fl.length - 1; i++) { v += b.fl[i]; if (b.bands || i === 0) ledge(x, b, b.u0, b.u1, v - 0.14, v + 0.06, 0.08, m); }
    ledge(x, b, b.u0, b.u1, top - 0.1, top + 0.12, 0.18, m);
    ledge(x, b, b.u0, b.u1, b.h - 0.12, b.h, 0.06, MAT.white);
    for (const g of b.gf) {
      if (g[0] === 'shop') shopAt(x, b, g[1], g[2], R, LO, g[3]);
      else if (g[0] === 'door' || g[0] === 'adoor') doorAt(x, b, g[1], g[2], g[0], R, LO);
      else if (g[0] === 'gar') garageAt(x, b, g[1], g[2], LO);
      else if (g[0] === 'win') windowAt(x, b, (g[1] + g[2]) / 2, g[2] - g[1], 1.25, 1.15, 'grl', R, LO);
    }
    v = b.fl[0];
    for (let f = 1; f < b.fl.length; f++) {
      const fh = b.fl[f], bal = (b.bal || []).filter((q) => q[0] === f);
      for (const uc of b.wu) {
        if (bal.some((q) => uc > q[1] && uc < q[2])) windowAt(x, b, uc, b.ww, v + 0.04, Math.min(2.25, fh - 0.55), b.ws === 'mod' ? 'mod' : 'shut', R, LO);
        else windowAt(x, b, uc, b.ww, v + 0.85, Math.min(b.wh, fh - 1.3), b.ws, R, LO);
      }
      for (const q of bal) (q[3] === 'm' ? mashrabiya : balcony)(x, b, v, q[1], q[2], R, LO);
      v += fh;
    }
  }

  // ---------- Тени на правых фасадах: маска и multiply только в их пределах ----------
  function applyWallShadows(x) {
    if (!WALLSH.length && !WALLFN.length) return;
    const L = layer(x, 0.5), g = L.g;
    g.fillStyle = g.strokeStyle = rgb(C.shadow);
    for (const p of WALLSH) { g.beginPath(); poly3(g, p); g.fill(); }
    for (const f of WALLFN) f(g);
    x.save();
    x.beginPath();
    for (const b of HOUSES) if (b.s > 0 && !b.ghost) fr(x, XR, b.u0, 0, b.u1, b.h);
    x.clip();
    x.globalCompositeOperation = 'multiply'; x.drawImage(L.c, 0, 0, SW, SH);
    x.restore();
  }

  // ---------- Попиксельные фактуры (свои холсты в половинном разрешении, точная перспектива) ----------
  const fbm2 = (n, a, b) => 0.67 * n(a, b) + 0.33 * n(a * 2.03 + 3.1, b * 2.03 + 1.7);
  function hash2(i, j) {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function pixCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    return { c: c, g: g, img: g.createImageData(w, h) };
  }
  // доля пикселя шириной p, покрытая полосой |t| < hw (dist — расстояние до её оси): сглаживание линий
  function cov(dist, hw, p) {
    const a = Math.max(-hw, dist - p / 2), b = Math.min(hw, dist + p / 2);
    return b > a ? Math.min(1, (b - a) / p) : 0;
  }
  // расстояние до ближайшей линии сетки с шагом st (сдвиг ofs)
  const gridDist = (v, st, ofs) => { const q = (v - (ofs || 0)) / st; return Math.abs(q - Math.round(q)) * st; };
  const ZEB = { u0: 12.4, u1: 15.2, hx: 3.3 };   // пешеходный переход: глубины и полуширина
  const GUT = CURB - 0.34;                       // край бетонного лотка у бордюра
  // земля: асфальт (масляные полосы, колеи, выкрошенные пятна, зерно), бетонный лоток со швами,
  // стёртая разметка (осевая и «зебра»), бордюрный камень и плитка тротуаров со швами; пишем готовый цвет
  function groundTex(x, o) {
    const k = 0.5 * Math.min(1, o.scale * 2.5), w = Math.ceil(SW * k), h = Math.ceil((SH - HOR) * k);
    const L = pixCanvas(w, h), d = L.img.data;
    const n1 = Tex.perlin(101), n2 = Tex.perlin(102), n3 = Tex.perlin(103), n4 = Tex.perlin(104);
    const A = C.asph, Wk = C.walk, S = C.sand, GT = [178, 170, 154], CB = [206, 196, 176], PA = [224, 220, 206];
    for (let j = 0; j < h; j++) {
      const dy = (j + 0.5) / k;
      if (dy < 1.5) continue;
      const uR = F * EYE / dy, uW = F * (EYE - WALK) / dy;
      if (uR > 64) continue;
      const fine = clamp(1.5 - uR * uR / (F * EYE * k) * 12, 0, 1);   // мелочь гасим, где пиксель слоя > ~8 см
      const puR = uR * uR / (F * EYE * k), puW = uW * uW / (F * (EYE - WALK) * k);   // пиксель слоя вдоль U, м
      const ia = Math.max(0, Math.floor(sxOf(XL - 0.3, uW) * k)), ib = Math.min(w, Math.ceil(sxOf(XR + 0.3, uW) * k));
      const dwL = 0.2 + 0.6 * clamp(0.5 + 1.2 * n1(uR * 0.32 + 3, 1.7), 0, 1), dwR = 0.2 + 0.6 * clamp(0.5 + 1.2 * n1(uR * 0.32 + 3, 7.3), 0, 1);
      for (let i = ia; i < ib; i++) {
        const sx = (i + 0.5) / k;
        let U = uR, X = CAMX + (sx - VX) * U / F, walk = false;
        if (X < -CURB || X > CURB) { const X2 = CAMX + (sx - VX) * uW / F; if (X2 <= -CURB || X2 >= CURB) { U = uW; X = X2; walk = true; } }
        const ax = Math.abs(X), px = U / (F * k), pu = walk ? puW : puR;
        let t = 0.07 * fbm2(n1, X * 0.3, U * 0.3) + 0.045 * n2(X * 1.1, U * 1.1), sand = 0, base = A, paint = 0;
        if (walk) {
          if (ax < CURB + 0.24) {                       // бордюрный камень: светлее, стыки через 0.9 м
            base = CB;
            t -= 0.32 * cov(gridDist(U, 0.9, 0.2), 0.012, pu) + 0.2 * cov(ax - CURB - 0.24, 0.012, px);
            t += 0.05 * n2(U * 3 + 11, ax * 9);
          } else {
            base = Wk;
            t += (hash2(Math.floor(X / 0.45), Math.floor(U / 0.45)) - 0.5) * 0.09;
            t -= 0.2 * Math.max(cov(gridDist(X, 0.45), 0.008, px), cov(gridDist(U, 0.45), 0.008, pu));
            if (hash2(Math.floor(X / 0.45) + 7, Math.floor(U / 0.45)) < 0.05) t -= 0.07;   // заменённая плитка
          }
          const wall = ax - 5.0;                        // грязь и песок у стен
          sand = clamp(wall / 0.5, 0, 1) * clamp(0.4 + n1(X * 2 + 9, U * 0.8), 0, 1) * 0.55;
        } else if (ax > GUT) {                          // бетонный лоток: светлый, швы через 1 м, песок
          base = GT;
          t -= 0.3 * cov(gridDist(U, 1.0), 0.01, pu) + 0.25 * cov(ax - GUT, 0.015, px);
          t -= 0.12 * clamp((ax - CURB + 0.08) / 0.08, 0, 1);         // тень-щель у бордюра
          sand = clamp(0.25 + 1.2 * fbm2(n1, X * 0.8 + 7, U * 0.4), 0, 1) * 0.7;
        } else {
          const ln = Math.min(Math.abs(X - 2.0), Math.abs(X + 2.0));   // масляная полоса посреди полос
          t -= 0.075 * clamp(1 - ln / 0.5, 0, 1) * (0.55 + 0.45 * n2(X * 2.2, U * 0.5));
          const oil = n4(X * 1.7 + 40, U * 0.55);                      // отдельные масляные пятна
          if (ln < 0.8 && oil > 0.4) t -= Math.min(0.06, (oil - 0.4) * 0.6);
          // щебень в асфальте: ячейка не мельче пикселя слоя (вдали вытягивается по U), амплитуда падает с усреднением
          const cx = Math.max(0.018, px), cu = Math.max(0.018, pu);
          t += 0.13 * 0.018 / Math.sqrt(cx * cu) * (hash2(Math.floor(X / cx), Math.floor(U / cu) + 977) - 0.5);
          const tr = Math.min(Math.abs(ax - 1.2), Math.abs(ax - 2.8));   // накатанные шинами колеи: светлее и глаже
          const trk = clamp(1 - tr / 0.5, 0, 1);
          t += 0.055 * trk;
          const rv = fbm2(n4, X * 0.7 + 3, U * 0.35);                  // выкрошенный асфальт: светлее, грубее
          const rav = clamp((rv - 0.22) / 0.05, 0, 1);
          t += rav * (0.045 + fine * 0.08 * (hash2(Math.floor(X * 70), Math.floor(U * 70)) - 0.5));
          // песчаный нанос у бордюров: волнистая полоса 0.2–0.8 м с чётким краем и рябью
          const dw = X < 0 ? dwL : dwR;
          sand = clamp((ax - (GUT - dw)) / 0.07, 0, 1) * (0.72 + 0.12 * Math.sin(U * 9 + X * 3 + 2 * n2(U, X)));
          sand = Math.max(sand, clamp((ax - 2.7) / 1.25, 0, 1) * clamp(0.45 + 1.1 * fbm2(n1, X * 0.8 + 7, U * 0.4), 0, 1) * 0.5);
          // языки песка, нанесённые ветром наискось через полосы
          const sv = fbm2(n3, (X * 0.9 + U * 0.35) * 0.55, (U * 0.9 - X * 0.35) * 0.11);
          sand += clamp((sv - 0.16) / 0.14, 0, 1) * 0.42;
          // разметка: осевая пунктирная (3 м штрих, 5 м разрыв) и «зебра»; краска стёрта по колеям и пятнами
          paint = cov(ax, 0.06, px) * cov(Math.abs(((U % 8) + 8) % 8 - 1.5), 1.5, pu);
          if (U > ZEB.u0 - 0.3 && U < ZEB.u1 + 0.3) {
            const zc = (ZEB.u0 + ZEB.u1) / 2;
            paint = Math.max(paint, cov(gridDist(X, 1.0, 0.25), 0.25, px) * cov(Math.abs(U - zc), (ZEB.u1 - ZEB.u0) / 2, pu) * cov(ax, ZEB.hx, px));
          }
          if (paint > 0) {
            const wear = clamp(0.35 + 1.5 * fbm2(n4, X * 1.3 + 17, U * 0.8) + 0.35 * n2(X * 7, U * 5), 0, 1);
            paint *= wear * (1 - 0.7 * trk) * (U > ZEB.u0 - 0.3 && U < ZEB.u1 + 0.3 ? 0.42 : 0.75);   // «зебра» почти стёрта
          }
        }
        if (fine > 0) t += fine * (0.06 * n3(X * 13, U * 13) + 0.03 * n2(X * 31, U * 31));
        let r = base[0] * (1 + t), gg = base[1] * (1 + t), bb = base[2] * (1 + t);
        if (paint > 0) { r += (PA[0] * (1 + t * 0.6) - r) * paint; gg += (PA[1] * (1 + t * 0.6) - gg) * paint; bb += (PA[2] * (1 + t * 0.6) - bb) * paint; }
        sand = Math.min(sand, 0.85);
        r += (S[0] - r) * sand; gg += (S[1] - gg) * sand; bb += (S[2] - bb) * sand;
        const hk = 0.9 * (1 - Math.exp(-U / 260)), q = (j * w + i) * 4;
        d[q] = r + (HAZE[0] - r) * hk; d[q + 1] = gg + (HAZE[1] - gg) * hk; d[q + 2] = bb + (HAZE[2] - bb) * hk; d[q + 3] = 255;
      }
    }
    L.g.putImageData(L.img, 0, 0);
    x.drawImage(L.c, 0, HOR, w / k, h / k);
  }
  // стены: пятна, потёки, ремонтные заплаты, грязь у земли, тёплый отражённый свет снизу на теневой стороне,
  // разнотон камней; слой светлит/темнит поверх основы фасадов
  function wallTex(x, o) {
    const k = 0.5 * Math.min(1, o.scale * 2.5), w = Math.ceil(SW * k), h = Math.ceil(SH * k);
    const L = pixCanvas(w, h), d = L.img.data;
    const n1 = Tex.perlin(201), n2 = Tex.perlin(202), n3 = Tex.perlin(203);
    const rows = HOUSES.filter((b) => !b.ghost);
    for (let i = 0; i < w; i++) {
      const sx = (i + 0.5) / k, s = sx < VX ? -1 : 1, xf = s < 0 ? XL : XR;
      const U = F * (xf - CAMX) / (sx - VX);
      if (!(U > 0.5) || U > U_END) continue;
      let b = null;
      for (const q of rows) if (q.s === s && U >= q.u0 && U <= q.u1) { b = q; break; }
      if (!b) continue;
      const fine = clamp(1.5 - U / (F * k) * 25, 0, 1), lit = s > 0;
      const stoneTo = b.m === 'stone' ? b.h : b.gm ? b.fl[0] : 0;
      const ja = Math.max(0, Math.floor(syOf(b.h, U) * k)), jb = Math.min(h, Math.ceil(syOf(0, U) * k));
      for (let j = ja; j < jb; j++) {
        const V = EYE + (HOR - (j + 0.5) / k) * U / F;
        let t = 0.06 * fbm2(n1, U * 0.45 + b.seed, V * 0.3) + 0.05 * n2(U * 2.6 + b.seed, V * 0.2) * clamp(0.3 + n1(U * 0.6, V * 0.15 + 5), 0, 1);
        const p = n1(U * 0.75 + 30, V * 0.75 + b.seed);
        if (p > 0.26) t += 0.04; else if (p < -0.3) t -= 0.035;     // заплаты штукатурки с чёткой границей
        t -= 0.17 * clamp(1 - V / 0.9, 0, 1) * (0.7 + 0.3 * n3(U * 5, V * 5));
        if (V > b.h - 0.7) t -= 0.05;
        if (V < stoneTo) { const cr = Math.floor(V / 0.34); t += (hash2(cr, Math.floor((U + (cr % 2) * 0.36) / 0.72)) - 0.5) * 0.12; }
        if (!lit) t += 0.13 * clamp(1 - V / 4.5, 0, 1);              // отражённый свет от солнечной улицы
        t += fine * 0.04 * n3(U * 11, V * 11);
        const q = (j * w + i) * 4;
        if (t < 0) { d[q] = 46; d[q + 1] = 36; d[q + 2] = 28; d[q + 3] = Math.min(255, -t * 255); } else {
          d[q] = 255; d[q + 1] = lit ? 246 : 226; d[q + 2] = lit ? 228 : 190; d[q + 3] = Math.min(255, t * 230);
        }
      }
    }
    L.g.putImageData(L.img, 0, 0);
    x.save();
    x.beginPath();
    for (const b of rows) fr(x, xfOf(b), b.u0, 0, b.u1, b.h);
    x.clip();
    x.drawImage(L.c, 0, 0, w / k, h / k);
    x.restore();
  }

  // ---------- Асфальт: заплаты, трещины, выбоина, люки, решётки лотков (векторно, до теней) ----------
  // эллипс на земле (мировые точки), с неровностью jit
  function ringPts(X, U, rx, ru, n, jit, r) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, q = jit ? 1 + (r() - 0.5) * jit : 1;
      pts.push([X + Math.cos(a) * rx * q, 0, U + Math.sin(a) * ru * q]);
    }
    return pts;
  }
  // перо для линии мировой толщины wm на глубине u: тоньше 0.7 px — не тоньше, а прозрачнее
  function pen(x, wm, u, col, a) {
    const w = F * wm / u;
    x.lineWidth = Math.max(0.7, w);
    x.strokeStyle = hzs(col, u, a * Math.min(1, w / 0.7));
  }
  // трещина: блуждание по земле из (X, U); ang — направление (0 — вглубь, π/2 — вправо)
  function crackPts(r, X, U, ang, len, st, wig) {
    const pts = [[X, 0, U]];
    let a = ang;
    for (let l = 0; l < len; l += st) {
      a += (r() - 0.5) * wig; a += (ang - a) * 0.25;
      X += Math.sin(a) * st; U += Math.cos(a) * st;
      if (Math.abs(X) > GUT - 0.04 || U < 3.2) break;
      pts.push([X, 0, U]);
    }
    return pts;
  }
  function crack(x, pts, wm, col, a) {
    if (pts.length < 2) return;
    x.beginPath(); line3(x, pts); pen(x, wm, pts[0][2], col, a); x.stroke();
  }
  // полоса на земле по мировой ломаной; ширина (м) меняется от w0 к w1. Ракурс честный: поперечная
  // трещина сжимается по вертикали так же, как сама дорога, и не читается проводом
  function groundStrip(x, pts, w0, w1, col, a, u) {
    if (pts.length < 2) return;
    const L = [], Rr = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      const dx = q[0] - o[0], du = q[2] - o[2], d = Math.hypot(dx, du) || 1, hw = lerp(w0, w1, i / (pts.length - 1)) / 2;
      L.push([p[0] - du / d * hw, 0, p[2] + dx / d * hw]); Rr.unshift([p[0] + du / d * hw, 0, p[2] - dx / d * hw]);
    }
    x.beginPath(); poly3(x, L.concat(Rr)); fillp(x, hzs(col, u || pts[0][2], a));
  }
  // трещина-дерево: короткий ствол сужается к концу, 1–2 ветки; кромка выкрошена и забита песком (светлая)
  function crackTree(x, r, X, U, ang, len, w, depth) {
    const pts = crackPts(r, X, U, ang, len, Math.min(0.12, len / 5), 0.9);
    if (pts.length < 2) return;
    groundStrip(x, pts, w * 4, w * 1.6, [218, 202, 168], 0.2);
    groundStrip(x, pts, w, w * 0.12, [40, 36, 33], 0.62);
    if (depth <= 0) return;
    const nb = 1 + Math.floor(r() * 2);
    for (let i = 0; i < nb; i++) {
      const p = pts[1 + Math.floor(r() * (pts.length - 1))];
      crackTree(x, r, p[0], p[2], ang + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.7), len * (0.35 + r() * 0.3), w * 0.65, depth - 1);
    }
  }
  // поперечная трещина: рваная линия поперёк полосы, видна кусками 0.5–1.5 м с разрывами
  function brokenCrack(x, r, X, U, len, w, sealed) {
    const pts = crackPts(r, X, U, Math.PI / 2, len, 0.1, 1.0);
    let i = 0;
    while (i < pts.length - 2) {
      const n = 5 + Math.floor(r() * 10), seg = pts.slice(i, Math.min(pts.length, i + n));
      if (sealed) groundStrip(x, seg, 0.08, 0.07, [34, 32, 32], 0.26);
      groundStrip(x, seg, w * 3.5, w * 2, [218, 202, 168], 0.16);
      groundStrip(x, seg, w, w * 0.4, [32, 29, 27], 0.8);
      i += n + 2 + Math.floor(r() * 5);
    }
  }
  // «крокодилова кожа»: просевшее тёмное пятно с мягким краем, внутри — плитки 0.16–0.25 м, чуть разного
  // тона, между ними светлые щели с песком и тонкие тёмные швы (не сетка из палочек)
  function alligator(x, r, Xc, Uc, rx, ru) {
    for (const [k, a] of [[1.15, 0.06], [1, 0.08], [0.75, 0.05]]) {
      x.beginPath(); poly3(x, ringPts(Xc, Uc, rx * k, ru * k, 16, 0.2, r)); fillp(x, hzs([58, 54, 52], Uc, a));
    }
    const sx = 0.2, su = 0.26, nx = Math.ceil(rx * 2 / sx) + 1, nu = Math.ceil(ru * 2 / su) + 1, N = [];
    for (let i = 0; i < nx; i++) {
      N.push([]);
      for (let j = 0; j < nu; j++) N[i].push([Xc - rx + i * sx + (j % 2) * sx * 0.45 + (r() - 0.5) * sx * 0.7, Uc - ru + j * su + (r() - 0.5) * su * 0.7]);
    }
    const plates = [], seams = [];
    for (let i = 0; i + 1 < nx; i++) for (let j = 0; j + 1 < nu; j++) {
      const q = [N[i][j], N[i + 1][j], N[i + 1][j + 1], N[i][j + 1]];
      const cx = (q[0][0] + q[2][0]) / 2, cu = (q[0][1] + q[2][1]) / 2;
      if (Math.hypot((cx - Xc) / rx, (cu - Uc) / ru) > 0.9) continue;
      plates.push(q.map((p) => [cx + (p[0] - cx) * 0.86, 0, cu + (p[1] - cu) * 0.86]));
      seams.push(q.map((p) => [p[0], 0, p[1]]));
    }
    x.beginPath(); for (const q of seams) poly3(x, q); fillp(x, hzs([206, 190, 158], Uc, 0.16));
    for (const q of plates) { x.beginPath(); poly3(x, q); fillp(x, hzs([64, 60, 58], Uc, 0.06 + r() * 0.12)); }
    x.beginPath(); for (const q of seams) poly3(x, q);
    x.lineJoin = 'round'; pen(x, 0.006, Uc, [34, 31, 29], 0.38); x.stroke();
  }
  // заплата с пропилом: чуть темнее, мягкая кайма, герметик только по части сторон (маска sides)
  function patch(x, x0, u0, x1, u1, sides, a) {
    const e = 0.05;
    a = a || 0.17;
    x.beginPath(); gr(x, x0 - e, u0 - e, x1 + e, u1 + e, 0); fillp(x, hzs([66, 64, 64], u0, a * 0.45));
    x.beginPath(); gr(x, x0, u0, x1, u1, 0); fillp(x, hzs([72, 70, 70], u0, a));
    const c = [[x0, u0], [x1, u0], [x1, u1], [x0, u1]];
    for (let i = 0; i < 4; i++) {
      if (!(sides & (1 << i))) continue;
      const a = c[i], b = c[(i + 1) % 4];
      groundStrip(x, [[a[0], 0, a[1]], [b[0], 0, b[1]]], 0.035, 0.035, [30, 29, 29], 0.24);
    }
  }
  function manhole(x, X, U, LO) {
    x.beginPath(); poly3(x, ringPts(X, U, 0.52, 0.52, 32)); fillp(x, hzs([70, 66, 64], U, 0.3));   // кольцо свежего асфальта
    x.beginPath(); poly3(x, ringPts(X, U, 0.36, 0.36, 32)); fillp(x, hzs([146, 140, 128], U));     // стальная обечайка
    x.beginPath(); poly3(x, ringPts(X, U, 0.315, 0.315, 32)); fillp(x, hzs([88, 84, 80], U));      // крышка
    if (LO) return;
    x.save(); x.beginPath(); poly3(x, ringPts(X, U, 0.3, 0.3, 32)); x.clip();
    x.beginPath();
    for (let d = -0.72; d <= 0.72; d += 0.07) {                  // косая сетка рифления, в канавках пыль
      line3(x, [[X + d - 0.4, 0, U - 0.4], [X + d + 0.4, 0, U + 0.4]]);
      line3(x, [[X + d + 0.4, 0, U - 0.4], [X + d - 0.4, 0, U + 0.4]]);
    }
    pen(x, 0.014, U, [168, 156, 134], 0.55); x.stroke();
    x.beginPath(); poly3(x, ringPts(X, U, 0.19, 0.19, 28)); pen(x, 0.03, U, [58, 54, 52], 0.7); x.stroke();
    x.restore();
  }
  // решётка ливнёвки в лотке: тёмная щель, прутья вдоль лотка, рама
  function grate(x, s, U, LO) {
    const xa = s * (CURB - 0.3), xb = s * (CURB - 0.05), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), u1 = U + 0.85;
    x.beginPath(); gr(x, x0, U, x1, u1, 0); fillp(x, hzs([34, 31, 29], U));
    if (!LO) {
      x.beginPath();
      for (let q = 1; q < 6; q++) { const X = lerp(x0, x1, q / 6); line3(x, [[X, 0, U], [X, 0, u1]]); }
      pen(x, 0.022, U, [118, 110, 100], 1); x.stroke();
    }
    x.beginPath(); gr(x, x0, U, x1, u1, 0); pen(x, 0.035, U, [128, 120, 108], 1); x.stroke();
  }
  function roadDetail(x, LO) {
    const r = Tex.rng(4242);
    // заплаты с пропилом: поперечная траншея, вокруг люка, продольная полоса, у камеры, у дальнего конца
    patch(x, -GUT, 19.6, 1.3, 20.5, 0b0101);
    patch(x, 0.85, 15.6, 2.6, 18.6, 0b1011);
    patch(x, -2.95, 23.0, -2.05, 37.0, 0b1010);
    patch(x, -3.4, 41.0, -0.6, 43.4, 0b0111);
    patch(x, 0.55, 4.7, 1.5, 5.6, 0b1001, 0.1);
    if (!LO) {
      // продольный стык полос укладки: еле заметный, кусками
      for (let u = 4.5; u < 38; u += 2.2 + r() * 2.5) {
        const pts = crackPts(r, 0.22 + (r() - 0.5) * 0.04, u, 0, 0.8 + r() * 1.6, 0.25, 0.08);
        groundStrip(x, pts, 0.05, 0.05, [40, 38, 38], 0.14);
      }
      // поперечные температурные трещины: рваные, с разрывами; часть залита битумом
      for (const [u, x0, len, sealed] of [[7.3, -GUT + 0.1, 3.4, true], [11.0, 0.3, 2.6, false], [24.6, -GUT + 0.1, 5.5, true],
        [29.0, -1.0, 3.6, false], [35.5, -2.6, 4.0, true]]) brokenCrack(x, r, x0, u, len, 0.02, sealed);
      // короткие ветвистые трещины вдоль колей и у заплат
      for (const [X, u, a, len] of [[-1.25, 4.2, 0.1, 1.3], [2.75, 5.6, -0.2, 1.1], [-2.8, 13.5, 0.15, 1.5], [1.3, 21.5, -0.1, 1.4],
        [-1.3, 31, 0.1, 1.5], [0.6, 9.4, 0.9, 0.8], [-0.4, 6.8, -0.7, 0.9], [2.0, 12.2, 0.3, 1.2], [-2.2, 18.5, -0.3, 1.0]]) {
        crackTree(x, r, X, u, a, len, 0.026, 2);
      }
      alligator(x, r, 2.35, 8.6, 0.6, 1.0);
      alligator(x, r, -1.0, 27.0, 0.7, 1.4);
      // выбоина: выкрошенная светлая кромка, тёмная яма, песок на дне
      x.beginPath(); poly3(x, ringPts(-2.35, 7.8, 0.36, 0.28, 14, 0.5, r)); fillp(x, hzs([184, 172, 150], 7.8, 0.5));
      x.beginPath(); poly3(x, ringPts(-2.35, 7.8, 0.27, 0.2, 14, 0.45, r)); fillp(x, hzs([58, 52, 48], 7.8, 0.85));
      x.beginPath(); poly3(x, ringPts(-2.32, 7.84, 0.15, 0.1, 10, 0.5, r)); fillp(x, hzs([168, 148, 116], 7.8, 0.85));
      // масляные пятна посреди полос: мягкие, двухслойные
      for (const [X, u, s] of [[-2.0, 9.6, 0.5], [2.1, 13.8, 0.4], [-1.8, 19.0, 0.6], [1.9, 26.5, 0.5], [-2.1, 33.5, 0.55]]) {
        x.beginPath(); poly3(x, ringPts(X, u, s, s * 1.5, 14, 0.4, r)); fillp(x, hzs([52, 48, 46], u, 0.1));
        x.beginPath(); poly3(x, ringPts(X + 0.05, u + 0.1, s * 0.55, s * 0.8, 12, 0.5, r)); fillp(x, hzs([46, 42, 40], u, 0.12));
      }
    }
    manhole(x, -1.45, 6.3, LO);
    manhole(x, 1.7, 17.1, LO);
    manhole(x, -0.4, 33.0, LO);
    for (const u of [9.0, 21.5, 34.5, 47]) grate(x, -1, u, LO);
    for (const u of [12.5, 27.5, 41]) grate(x, 1, u, LO);
  }

  // ---------- Маркизы и навесы над лавками ----------
  // У каждой свой вылет, высота и наклон. Вид: scal — полосатая с фестонами, sag — однотонный холст с провисшей
  // кромкой, flat — полосатая с прямым подзором, torn — выгоревшая и рваная, rolled — свёрнута в рулон под коробом,
  // metal — навес из гофрированного железа на подкосах. Левый ряд в тени; справа ткань просвечивает, тень на стене.
  const CLOTH = {
    red: [[168, 100, 82], [220, 208, 184]], green: [[98, 122, 100], [218, 210, 188]], blue: [[92, 114, 134], [222, 218, 206]],
    sand: [[190, 164, 126], [170, 144, 108]], canvas: [[204, 188, 152], [194, 178, 142]],
  };
  // [сторона, u0, u1, ткань, вылет, высота у стены, высота кромки, подзор, вид]
  const AWN = [
    [-1, 6.5, 9.5, 'green', 1.05, 3.5, 2.98, 0.26, 'scal'], [-1, 15.9, 20.5, 'canvas', 1.75, 3.72, 2.92, 0.3, 'sag'],
    [-1, 31.1, 34.6, 'blue', 0, 3.42, 0, 0, 'rolled'], [-1, 49.9, 53.5, 'sand', 1.2, 3.55, 2.9, 0.26, 'torn'],
    [1, 8.9, 14.1, 'red', 1.45, 3.62, 2.85, 0.3, 'scal'], [1, 17.3, 20.7, 'metal', 1.15, 3.32, 3.06, 0, 'metal'],
    [1, 39.1, 43.1, 'green', 0.95, 3.45, 3.02, 0.22, 'flat'],
  ];
  function awnings(x, LO) {
    for (const [s, u0, u1, cl, d, ya, yb, vh, kind] of AWN) {
      const xf = s < 0 ? XL : XR, xo = xf - s * d, lit = s > 0, um = (u0 + u1) / 2, c = CLOTH[cl];
      const tone = (col, k) => (lit ? mul(col, k) : mul(mix(col, [120, 130, 150], 0.15), k * 0.62));
      if (kind === 'rolled') {          // рулон под жестяным коробом
        if (lit) wallShadowBox(xf - 0.3, xf, ya - 0.14, ya + 0.32, u0, u1);
        ITEMS.push({ u: u0, f: () => {
          const xr = xf - s * 0.16, n = Math.round((u1 - u0) / 0.3);
          for (let i = 0; i < n; i++) {
            const a = lerp(u0, u1, i / n), b2 = lerp(u0, u1, (i + 1) / n);
            x.beginPath(); fr(x, xr, a, ya - 0.13, b2, ya + 0.1); fillp(x, hzs(tone(c[i % 2], 0.9), a));
          }
          x.beginPath(); fr(x, xr, u0, ya - 0.13, u1, ya - 0.08); fillp(x, hzs(tone(c[0], 0.55), u0));
          box(x, Math.min(xf, xf - s * 0.26), Math.max(xf, xf - s * 0.26), ya + 0.1, ya + 0.32, u0 - 0.05, u1 + 0.05, MAT.gray, !lit);
        } });
        continue;
      }
      const yv = yb - vh;
      if (lit) wallShadowBox(Math.min(xo, xf), Math.max(xo, xf), yv, ya, u0, u1);
      ITEMS.push({ u: u0, f: () => {
        const arm = (u, y0) => {         // складной кронштейн: тёмный низ и светлая грань сверху
          if (u < 7 || LO) return;
          x.beginPath(); line3(x, [[xf, y0, u], [xo + s * 0.05, yb - 0.02, u]]);
          x.strokeStyle = hzs(IRON, u); x.lineWidth = clamp(F * 0.034 / u, 0.9, 3.4); x.stroke();
          x.beginPath(); line3(x, [[xf, y0 + 0.02, u], [xo + s * 0.05, yb, u]]);
          x.strokeStyle = hzs(lit ? [150, 146, 140] : [92, 92, 94], u); x.lineWidth = clamp(F * 0.012 / u, 0.6, 1.4); x.stroke();
        };
        if (kind === 'metal') {         // гофрированное железо: тёмный испод с волнами вдоль ската, светлая кромка
          x.beginPath(); poly3(x, [[xf, ya, u0], [xf, ya, u1], [xo, yb, u1], [xo, yb, u0]]); fillp(x, hzs([104, 102, 98], um));
          if (!LO) {
            x.beginPath();
            for (let u = u0 + 0.06; u < u1; u += 0.12) line3(x, [[xf, ya, u], [xo, yb, u]]);
            x.strokeStyle = hzs([76, 74, 72], um); x.lineWidth = clamp(F * 0.02 / um, 0.6, 2); x.stroke();
            x.beginPath();
            for (const u of [u0 + 0.7, u0 + 1.9, u1 - 0.5]) line3(x, [[xf, ya, u], [xo, yb, u + 0.05]]);
            x.strokeStyle = hzs([124, 86, 60], um, 0.6); x.lineWidth = clamp(F * 0.05 / um, 0.8, 4); x.stroke();
          }
          x.beginPath(); fr(x, xo, u0, yb - 0.05, u1, yb + 0.03); fillp(x, hzs([196, 194, 186], um));
          arm(u0 + 0.1, ya - 0.9); arm(u1 - 0.1, ya - 0.9);
          return;
        }
        const n = Math.max(2, Math.round((u1 - u0) / 0.3)), du = (u1 - u0) / n, r = Tex.rng(Math.round(u0 * 100));
        const ye = (u) => (kind === 'sag' ? yb - 0.09 * Math.sin(Math.PI * (u - u0) / (u1 - u0)) : yb);
        const one = kind === 'sag';
        for (let i = 0; i < n; i++) {   // испод полотна полосами от стены к кромке
          const a = u0 + i * du, b2 = a + du;
          x.beginPath(); poly3(x, [[xf, ya, a], [xf, ya, b2], [xo, ye(b2), b2], [xo, ye(a), a]]); fillp(x, hzs(tone(c[one ? 0 : i % 2], 0.8), a));
        }
        const xm = lerp(xf, xo, 0.4), ym = lerp(ya, yb, 0.4);   // затенение у стены
        x.beginPath(); poly3(x, [[xf, ya, u0], [xf, ya, u1], [xm, ym, u1], [xm, ym, u0]]); fillp(x, rgb([34, 26, 20], 0.2));
        for (let i = 0; i < n; i++) {   // подзор: фестоны, рваный край или прямой
          const a = u0 + i * du, b2 = a + du, pts = [[xo, ye(a), a], [xo, ye(b2), b2]], tear = kind === 'torn' && r() < 0.3;
          for (let j = 6; j >= 0; j--) {
            const t = j / 6, u = lerp(a, b2, t);
            let y = ye(u) - vh;
            if (kind === 'scal') y -= 0.07 * Math.sin(Math.PI * t) - 0.03;
            if (kind === 'torn') y += (tear ? vh * 0.6 : 0) + (r() - 0.5) * 0.08;
            pts.push([xo, y, u]);
          }
          x.beginPath(); poly3(x, pts); fillp(x, hzs(tone(c[one ? 0 : i % 2], lit ? 1.04 : 1), a));
        }
        if (kind === 'torn' && !LO) {   // оторванный лоскут свисает
          const a = u0 + du * 2.3;
          x.beginPath(); poly3(x, [[xo, yb - vh, a], [xo, yb - vh, a + 0.12], [xo + s * 0.03, yb - vh - 0.45, a + 0.05]]); fillp(x, hzs(tone(c[0], 0.9), a));
        }
        if (LO) return;
        x.beginPath(); line3(x, [[xo, ye(u0) - 0.03, u0], [xo, ye(um) - 0.03, um], [xo, ye(u1) - 0.03, u1]]);
        x.strokeStyle = hzs(tone(c[0], 0.66), u0, 0.7); x.lineWidth = clamp(F * 0.022 / u0, 0.6, 2.6); x.stroke();
        arm(u0 + 0.08, ya - 0.8); arm(u1 - 0.08, ya - 0.8);
      } });
    }
  }

  // ---------- Провода ----------
  // Пролёты поперёк улицы между кронштейнами на стенах: [uL, yL, uR, yR, провисания...] — по 2–3 кабеля
  // с разным провисанием. Последний пролёт натянут между мачтами на крышах, перед барабаном купола.
  const SPANS = [
    [13.4, 6.6, 23.6, 6.6, 0.55, 0.8],
    [21.4, 7.3, 19.8, 7.7, 0.45, 0.7, 0.95],
    [29.8, 7.4, 31.6, 7.0, 0.55, 0.85],
    [38.8, 8.1, 40.6, 8.4, 0.5, 0.75, 0.6],
    [48.6, 8.6, 50.4, 8.2, 0.55, 0.85],
    [52.6, 11.9, 53.4, 13.1, 0.75, 1.05],
  ];
  const ROOFSPAN = 5;
  let WALLFN = [];                  // рисовалки теней в маску правых фасадов (тонкие предметы: кабели, листья)
  // цепная линия (парабола) между точками a и b с провисанием sag
  function cablePts(a, b, sag, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) - 4 * sag * t * (1 - t), lerp(a[2], b[2], t)]);
    }
    return pts;
  }
  // все кабели пролёта: точки крепления и линии
  function spanCables(sp, i) {
    const out = [], roof = i === ROOFSPAN;
    for (let k = 4; k < sp.length; k++) {
      const j = k - 4;
      const a = [roof ? XL - 0.4 : XL + 0.06, sp[1] - j * 0.14, sp[0] + j * 0.22];
      const b = [roof ? XR + 0.4 : XR - 0.06, sp[3] - j * 0.12, sp[2] + j * 0.2];
      out.push(cablePts(a, b, sp[k], 18));
    }
    return out;
  }
  const cableW = (u) => clamp(F * 0.022 / u, 1.25, 3);
  const CABLE = [44, 40, 38];
  // пролёты: в список выступающих предметов (сортируются по глубине вместе с маркизами и балконами)
  function wires(x, LO) {
    SPANS.forEach((sp, i) => {
      const cs = spanCables(sp, i), um = Math.min(sp[0], sp[2]);
      ITEMS.push({ u: um, f: () => {
        for (const pts of cs) {
          x.beginPath(); line3(x, pts);
          x.strokeStyle = hzs(CABLE, pts[9][2]); x.lineWidth = cableW(pts[9][2]); x.stroke();
        }
        if (LO) return;
        // крепления на стенах: короткий штырь с изолятором
        if (i !== ROOFSPAN) for (const pts of cs) for (const e of [pts[0], pts[pts.length - 1]]) {
          const s = e[0] < 0 ? -1 : 1, w = s < 0 ? XL : XR;
          box(x, Math.min(w, w - s * 0.1), Math.max(w, w - s * 0.1), e[1] - 0.05, e[1] + 0.05, e[2] - 0.04, e[2] + 0.04, METAL, s < 0);
        }
      } });
      // тени кабелей на освещённом правом фасаде
      WALLFN.push((g) => {
        g.beginPath();
        for (const pts of cs) line3(g, pts.map((p) => onWall(p[0], p[1], p[2])));
        g.lineWidth = Math.max(0.9, F * 0.03 / (um + 4)); g.stroke();
      });
    });
  }
  // тени кабелей на земле (в маску теней земли)
  function wireGroundShadows(g) {
    g.beginPath();
    SPANS.forEach((sp, i) => { for (const pts of spanCables(sp, i)) line3(g, pts.map((p) => toGround(p[0], p[1], p[2]))); });
    g.lineWidth = 1.1; g.stroke();
  }
  // кабели по фасадам: жгут под карнизом на скобах через 1.2 м, спуски к распределительным коробкам
  function wallRuns(x, LO) {
    for (const b of HOUSES) {
      if (b.ghost) continue;
      const s = b.s, xf = xfOf(b), X = xf - s * 0.05, lit = s > 0, top = b.fl.reduce((a, c) => a + c, 0) - 0.42;
      const r = Tex.rng(b.seed * 13 + 5), um = (b.u0 + b.u1) / 2;
      if (Math.abs(sxOf(xf, b.u1) - sxOf(xf, b.u0)) < 40) continue;
      const run = [];
      for (let u = b.u0 + 0.2; u < b.u1 - 0.2; u += 1.2) {
        const e = Math.min(b.u1 - 0.2, u + 1.2);
        for (let k = 0; k <= 4; k++) { const t = k / 4; run.push([X, top - 0.05 * 4 * t * (1 - t), lerp(u, e, t)]); }
      }
      // спуски: у креплений пролётов на этом доме и ещё один случайный
      const drops = [];
      SPANS.forEach((sp) => { const u = s < 0 ? sp[0] : sp[2]; if (u > b.u0 + 0.4 && u < b.u1 - 0.4) drops.push(u + 0.35); });
      drops.push(lerp(b.u0 + 0.8, b.u1 - 0.8, r()));
      const box0 = b.fl[0] + 0.55;
      const draw = () => {
        x.beginPath(); line3(x, run);
        for (const u of drops) line3(x, [[X, top, u], [X, box0 + 0.42, u]]);
        x.strokeStyle = hzs(CABLE, um); x.lineWidth = clamp(F * 0.02 / um, 0.9, 2.6); x.stroke();
        if (LO) return;
        for (const u of drops) {   // распределительная коробка
          const xo = xf - s * 0.12;
          box(x, Math.min(xf, xo), Math.max(xf, xo), box0, box0 + 0.42, u - 0.16, u + 0.16, MAT.gray, !lit);
        }
      };
      draw();
      if (lit) {
        WALLFN.push((g) => {
          g.beginPath(); line3(g, run.map((p) => onWall(p[0], p[1], p[2])));
          for (const u of drops) line3(g, [onWall(X, top, u), onWall(X, box0 + 0.42, u)]);
          g.lineWidth = clamp(F * 0.02 / um, 0.9, 2.6); g.stroke();
        });
        for (const u of drops) wallShadowBox(xf - 0.12, xf, box0, box0 + 0.42, u - 0.16, u + 0.16);
      }
    }
  }
  // мачты на крышах для верхнего пролёта (за плоскостью фасадов — рисуются до фасадов)
  function roofMasts(x) {
    const sp = SPANS[ROOFSPAN];
    for (const [X, u, y0, y1] of [[XL - 0.4, sp[0], 10.6, sp[1] + 0.35], [XR + 0.4, sp[2], 12.0, sp[3] + 0.35]]) {
      x.beginPath(); line3(x, [[X, y0, u], [X, y1, u]]); line3(x, [[X, y1 - 0.25, u - 0.4], [X, y1 - 0.25, u + 0.6]]);
      x.strokeStyle = hzs([70, 66, 62], u); x.lineWidth = Math.max(1.3, F * 0.07 / u); x.stroke();
    }
  }

  // ---------- Вывески ----------
  // Надпись рисуется на своём маленьком холсте (выцветшая краска, рамка, сколы), затем кладётся на плоскость:
  // на фасад X = const — вертикальными полосками, у каждой своё аффинное преобразование (честная перспектива),
  // на плоскость U = const (консольная вывеска поперёк фасада) — одним drawImage.
  // Цвета на холсте уже с учётом тени и дымки: tint(цвет, на солнце?, глубина)
  const tint = (c, lit, u) => hz(lit ? c : mix(mul(c, 0.56), [70, 76, 96], 0.12), u);
  function signCanvas(w, h, o) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), r = Tex.rng(o.seed || 7);
    if (o.bg) { g.fillStyle = rgb(o.bg); g.fillRect(0, 0, w, h); }
    if (o.frame) { const fw = Math.max(2, Math.min(w, h) * 0.07); g.strokeStyle = rgb(o.frame); g.lineWidth = fw; g.strokeRect(fw / 2, fw / 2, w - fw, h - fw); }
    g.fillStyle = rgb(o.fg); g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = o.text.split('\n'), lh = h / lines.length;
    lines.forEach((t, i) => {
      g.font = 'bold ' + Math.round(lh * (o.fs || 0.66)) + 'px Arial, Helvetica, sans-serif';
      g.fillText(t, w / 2, lh * (i + 0.53), w * (o.fit || 0.84));
    });
    // выцветание: светлые пятна поверх краски, сколы и потёки
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 24; i++) {
      g.fillStyle = rgb(o.fade || [236, 228, 210], 0.05 + r() * 0.12);
      g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * w * 0.12, 2 + r() * h * 0.2, r() * 3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = rgb([40, 34, 30], 0.22);
    for (let i = 0; i < 16; i++) g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 2);
    g.globalCompositeOperation = 'source-over';
    return c;
  }
  // холст на фасад X = xf (s — сторона), прямоугольник u0..u1 × v0..v1, n полосок
  function wallImage(x, c, xf, s, u0, u1, v0, v1, n) {
    const W = c.width, H = c.height, sw = W / n;
    for (let i = 0; i < n; i++) {
      const ka = i / n, kb = (i + 1) / n;
      const ua = s < 0 ? lerp(u0, u1, ka) : lerp(u1, u0, ka), ub = s < 0 ? lerp(u0, u1, kb) : lerp(u1, u0, kb);
      const pa = P(xf, v1, ua), pb = P(xf, v1, ub), pc = P(xf, v0, ua), ext = Math.min(sw * 1.08, W - sw * i);
      x.save();
      x.transform((pb[0] - pa[0]) / sw, (pb[1] - pa[1]) / sw, (pc[0] - pa[0]) / H, (pc[1] - pa[1]) / H, pa[0], pa[1]);
      x.drawImage(c, sw * i, 0, ext, H, 0, 0, ext, H);
      x.restore();
    }
  }
  // холст на плоскость U = u (обращена к камере)
  function uImage(x, c, u, X0, X1, Y0, Y1) {
    const a = P(X0, Y1, u), b = P(X1, Y0, u);
    x.drawImage(c, a[0], a[1], b[0] - a[0], b[1] - a[1]);
  }
  // доска на фасаде: выступает на 4 см, на солнечной стороне отбрасывает тень, снизу тёмная кромка
  function board(x, b, u0, u1, v0, v1, o, LO) {
    const s = b.s, lit = s > 0, uc = (u0 + u1) / 2, xf = xfOf(b) - s * 0.04;
    const c = signCanvas(LO ? 64 : 256, LO ? 16 : 64, Object.assign({}, o, {
      bg: o.bg && tint(o.bg, lit, uc), fg: tint(o.fg, lit, uc), frame: o.frame && tint(o.frame, lit, uc) }));
    wallImage(x, c, xf, s, u0, u1, v0, v1, LO ? 2 : 10);
    if (lit) wallShadowBox(xf, xfOf(b), v0, v1, u0, u1);
  }
  // консольная вывеска поперёк фасада: двусторонняя, на двух кронштейнах
  function blade(x, s, u, d0, d1, Y0, Y1, o, LO) {
    const xf = s < 0 ? XL : XR, X0 = xf - s * d1, X1 = xf - s * d0, lit = !inShade((X0 + X1) / 2, Y1, u);
    if (s > 0) wallShadowBox(Math.min(X0, X1) - 0.02, Math.max(X0, X1), Y0, Y1, u, u + 0.04);
    ITEMS.push({ u: u, f: () => {
      x.beginPath();
      for (const y of [Y1 - 0.15, Y0 + 0.15]) line3(x, [[xf, y, u], [xf - s * (d1 + 0.05), y, u]]);
      x.strokeStyle = hzs(IRON, u); x.lineWidth = clamp(F * 0.03 / u, 0.8, 3); x.stroke();
      const c = signCanvas(o.w || 64, o.h || 200, Object.assign({}, o, {
        bg: tint(o.bg, lit, u), fg: tint(o.fg, lit, u), frame: o.frame && tint(o.frame, lit, u) }));
      uImage(x, c, u, Math.min(X0, X1), Math.max(X0, X1), Y0, Y1);
      if (LO) return;
      // торец доски (толщина) — тёмная кромка со стороны улицы
      const xe = s < 0 ? Math.max(X0, X1) : Math.min(X0, X1);
      x.beginPath(); poly3(x, [[xe, Y1, u], [xe, Y1, u + 0.06], [xe, Y0, u + 0.06], [xe, Y0, u]]); fillp(x, hzs(mul(tint(o.bg, lit, u), 0.6), u));
    } });
  }
  // дорожный знак-пиктограмма на столбе: «въезд запрещён»
  function noEntry(x, X, U, LO) {
    const top = 2.75, rr = 0.33, cy = top - rr;
    ITEMS.push({ u: U, f: () => {
      x.beginPath(); line3(x, [[X, WALK, U], [X, cy, U]]);
      x.strokeStyle = hzs([110, 108, 104], U); x.lineWidth = clamp(F * 0.06 / U, 1, 5); x.stroke();
      const ring = (r0) => { const pts = []; for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; pts.push([X + Math.cos(a) * r0, cy + Math.sin(a) * r0, U - 0.03]); } return pts; };
      x.beginPath(); poly3(x, ring(rr)); fillp(x, hzs([166, 62, 50], U));
      x.beginPath(); poly3(x, [[X - rr * 0.68, cy + 0.07, U - 0.04], [X + rr * 0.68, cy + 0.07, U - 0.04], [X + rr * 0.68, cy - 0.07, U - 0.04], [X - rr * 0.68, cy - 0.07, U - 0.04]]);
      fillp(x, hzs([232, 226, 214], U));
      if (!LO) { x.beginPath(); poly3(x, ring(rr)); x.strokeStyle = hzs([226, 220, 208], U); x.lineWidth = clamp(F * 0.02 / U, 0.7, 2); x.stroke(); }
    } });
    WALLFN.push((g) => { g.beginPath(); line3(g, [onWall(X, WALK, U), onWall(X, cy, U)]); g.lineWidth = Math.max(1, F * 0.06 / (U + 2)); g.stroke(); });
  }
  // таблички с номерами домов у дверей: синяя эмаль, белая цифра
  const PLATES = [[11, 10.2, 10.5, 2.86, '17'], [12, 15.25, 15.55, 2.3, '15'], [13, 29.45, 29.75, 2.3, '13'],
    [21, 14.35, 14.65, 2.3, '8'], [22, 21.0, 21.3, 2.4, '10'], [23, 30.8, 31.1, 2.4, '12']];
  function signs(x, LO) {
    const H = (seed) => HOUSES.find((b) => b.seed === seed);
    board(x, H(12), 16.4, 19.8, 4.12, 4.78, { text: 'КАФЕ', bg: [86, 122, 116], fg: [232, 222, 198], frame: [214, 204, 180], seed: 3 }, LO);
    board(x, H(24), 39.4, 42.8, 4.12, 4.78, { text: 'ХЛЕБ', bg: [222, 208, 176], fg: [128, 58, 44], frame: [128, 58, 44], seed: 4 }, LO);
    // трафарет на гаражных воротах (ворота утоплены на 0.18 м)
    const st = signCanvas(LO ? 64 : 256, LO ? 16 : 64, { text: 'СКЛАД 3', fg: tint([214, 208, 192], false, 26), fade: [120, 128, 138], seed: 5, fs: 0.72, fit: 0.92 });
    wallImage(x, st, XL - 0.18, -1, 24.9, 27.1, 1.6, 2.15, LO ? 2 : 8);
    for (const [sd, u0, u1, v, t] of PLATES) {
      const b = H(sd), lit = b.s > 0, uc = (u0 + u1) / 2;
      const c = signCanvas(LO ? 16 : 48, LO ? 12 : 36, { text: t, bg: tint([52, 76, 120], lit, uc), fg: tint([236, 234, 226], lit, uc), frame: tint([230, 228, 220], lit, uc), seed: sd, fs: 0.7 });
      wallImage(x, c, xfOf(b) - b.s * 0.02, b.s, u0, u1, v, v + 0.22, 2);
      if (lit) wallShadowBox(xfOf(b) - 0.02, xfOf(b), v, v + 0.22, u0, u1);
    }
    blade(x, 1, 28.3, 0.15, 1.0, 4.1, 6.7, { text: 'H\nO\nT\nE\nL', bg: [46, 66, 92], fg: [236, 226, 200], frame: [226, 216, 192], w: 60, h: 220, fs: 0.78, seed: 6 }, LO);
    blade(x, 1, 17.0, 0.12, 1.05, 3.75, 4.35, { text: 'AUTO', bg: [214, 196, 150], fg: [52, 60, 70], frame: [52, 60, 70], w: 150, h: 84, fs: 0.62, seed: 8 }, LO);
    noEntry(x, 3.92, 27.25, LO);
  }

  // ---------- Предметы на фасадах ----------
  const WOOD = { l: [150, 112, 76], s: [80, 62, 48] }, METAL = { l: [76, 70, 64], s: [46, 44, 44] };
  // решётка: панель залита тёмным (просветы), поверх — деревянные рейки сеткой; pt(s, t) → мировая точка
  function lattice(x, pt, ns, nt, gap, wood, lw) {
    x.beginPath(); poly3(x, [pt(0, 1), pt(1, 1), pt(1, 0), pt(0, 0)]); fillp(x, gap);
    x.beginPath();
    for (let i = 1; i < ns; i++) line3(x, [pt(i / ns, 0), pt(i / ns, 1)]);
    for (let j = 1; j < nt; j++) line3(x, [pt(0, j / nt), pt(1, j / nt)]);
    x.strokeStyle = wood; x.lineWidth = lw; x.stroke();
  }
  // машрабия: деревянный эркер с решёткой на консолях, вместо железного балкона
  function mashrabiya(x, b, fv, ua, ub, R, LO) {
    const xf = xfOf(b), s = b.s, lit = s > 0, out = -s, xo = xf + out * 0.62, x0 = Math.min(xf, xo), x1 = Math.max(xf, xo);
    const y0 = fv + 0.3, y1 = fv + 2.5, um = (ua + ub) / 2;
    if (lit) wallShadowBox(x0, x1, fv - 0.25, y1 + 0.2, ua - 0.08, ub + 0.08);
    ITEMS.push({ u: ua - 0.08, f: () => {
      const wc = (k) => hzs(mul(lit ? WOOD.l : WOOD.s, k), um);
      for (const u of [ua + 0.25, ub - 0.25]) {      // консоли-кронштейны: треугольник в плоскости U
        x.beginPath(); poly3(x, [[xf, y0, u], [xo + s * 0.08, y0, u], [xf, fv - 0.35, u]]); fillp(x, wc(0.8));
      }
      box(x, x0, x1, y0, y0 + 0.14, ua, ub, WOOD, !lit);                         // основание
      box(x, x0 + (s > 0 ? 0.04 : 0), x1 - (s < 0 ? 0.04 : 0), y0 + 0.14, y1, ua + 0.04, ub - 0.04, WOOD, !lit);
      box(x, x0 - (s > 0 ? 0.1 : 0), x1 + (s < 0 ? 0.1 : 0), y1, y1 + 0.16, ua - 0.1, ub + 0.1, WOOD, !lit);   // козырёк
      if (LO) return;
      const lw = clamp(F * 0.022 / um, 0.7, 2.6), gap = hzs([30, 26, 24], um), Xf = xo + s * 0.04;
      // решётка на лицевой грани и на торце, к камере; внизу глухая филёнка
      const yl = y0 + 0.7, yh = y1 - 0.14;
      lattice(x, (p, t) => [Xf, lerp(yl, yh, t), lerp(ua + 0.14, ub - 0.14, p)], Math.round((ub - ua) / 0.09), 17, gap, wc(1.08), lw);
      lattice(x, (p, t) => [lerp(xf, Xf, 0.12 + 0.8 * p), lerp(yl, yh, t), ua + 0.04], 6, 17, gap, wc(1.0), lw);
      x.beginPath(); fr(x, Xf, ua + 0.2, y0 + 0.24, ub - 0.2, y0 + 0.58); x.strokeStyle = wc(0.6); x.lineWidth = lw; x.stroke();
    } });
  }
  // фонарь над дверью: кованый кронштейн, корпус со стёклами (днём не горит), крышка-пирамидка
  const LANTERNS = [[11, 10.35, 3.15], [12, 14.3, 3.85], [21, 15.4, 3.0], [22, 22.3, 3.85], [14, 35.85, 3.05], [24, 44.5, 3.0]];
  function lantern(x, b, u, y, LO) {
    const s = b.s, xf = xfOf(b), lit = s > 0, ax = xf - s * 0.5;
    if (lit) { wallShadowLine([ax, y + 0.25, u], [xf, y + 0.25, u], 0.02); wallShadowBox(ax - 0.11, ax + 0.11, y - 0.44, y - 0.04, u - 0.11, u + 0.11); }
    ITEMS.push({ u: u - 0.12, f: () => {
      x.beginPath(); line3(x, [[xf, y + 0.25, u], [ax, y + 0.25, u], [ax, y - 0.04, u]]);
      line3(x, [[xf, y - 0.12, u], [lerp(xf, ax, 0.6), y + 0.25, u]]);
      x.strokeStyle = hzs(IRON, u); x.lineWidth = clamp(F * 0.028 / u, 0.8, 3.5); x.stroke();
      const X0 = ax - 0.1, X1 = ax + 0.1, Y0 = y - 0.42, Y1 = y - 0.08, U0 = u - 0.1, U1 = u + 0.1;
      box(x, X0, X1, Y0, Y1, U0, U1, METAL, !lit);
      if (!LO) {
        const gl = hzs(lit ? [176, 160, 122] : [110, 102, 88], u, 0.9);
        x.beginPath(); ur(x, U0 - 0.005, X0 + 0.025, Y0 + 0.04, X1 - 0.025, Y1 - 0.04); fillp(x, gl);
        const Xs = CAMX < X0 ? X0 - 0.005 : X1 + 0.005;
        x.beginPath(); fr(x, Xs, U0 + 0.025, Y0 + 0.04, U1 - 0.025, Y1 - 0.04); fillp(x, gl);
      }
      x.beginPath(); poly3(x, [[X0 - 0.03, Y1, U0 - 0.03], [X1 + 0.03, Y1, U0 - 0.03], [ax, Y1 + 0.13, u]]); fillp(x, hzs(lit ? METAL.l : METAL.s, u));
      x.beginPath(); line3(x, [[ax, Y0, u], [ax, Y0 - 0.08, u]]); x.strokeStyle = hzs(IRON, u); x.stroke();
    } });
  }
  // настенный уличный светильник на изогнутом кронштейне (днём выключен)
  const LAMPS = [[-1, 23.4, 5.6], [1, 33.2, 5.9], [-1, 46.2, 5.7]];
  function wallLamp(x, s, u, y, LO) {
    const xf = s < 0 ? XL : XR, ex = xf - s * 1.15, lit = s > 0;
    const arm = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; arm.push([lerp(xf, ex, t), y + 0.35 * Math.sin(t * Math.PI * 0.85), u]); }
    if (lit) { for (let i = 0; i < 8; i++) wallShadowLine(arm[i], arm[i + 1], 0.025); wallShadowBox(ex - 0.26, ex + 0.2, y - 0.05, y + 0.1, u - 0.13, u + 0.13); }
    ITEMS.push({ u: u - 0.13, f: () => {
      x.beginPath(); line3(x, arm); x.strokeStyle = hzs(IRON, u); x.lineWidth = clamp(F * 0.045 / u, 1, 4); x.stroke();
      const hx0 = Math.min(ex - s * 0.2, ex + s * 0.26), hx1 = Math.max(ex - s * 0.2, ex + s * 0.26);
      box(x, hx0, hx1, y - 0.05, y + 0.1, u - 0.13, u + 0.13, METAL, !lit);
      if (!LO) { x.beginPath(); gr(x, hx0 + 0.04, u - 0.09, hx1 - 0.04, u + 0.09, y - 0.051); fillp(x, hzs([188, 184, 170], u, 0.8)); }
    } });
  }
  // кондиционер на кронштейнах: короб, круглая решётка вентилятора на лицевой грани, ржавый потёк ниже
  const ACS = [[21, 13.3, 7.55], [23, 33.0, 4.3], [23, 28.65, 10.95], [22, 24.4, 4.45], [11, 8.8, 4.75], [14, 32.8, 7.95], [12, 22.5, 7.55], [24, 41.2, 7.5]];
  function acUnit(x, b, uc, v0, LO) {
    const s = b.s, xf = xfOf(b), lit = s > 0, xo = xf - s * 0.32, u0 = uc - 0.41, u1 = uc + 0.41, v1 = v0 + 0.56;
    const m = { l: [208, 204, 192], s: [116, 114, 112] }, x0 = Math.min(xf, xo), x1 = Math.max(xf, xo);
    // потёк под блоком на стене
    const sa = P(xf, v0, uc), sb = P(xf, v0 - 1.8, uc), gq = x.createLinearGradient(0, sa[1], 0, sb[1]);
    gq.addColorStop(0, rgb([70, 60, 48], 0.32)); gq.addColorStop(1, rgb([70, 60, 48], 0));
    x.beginPath(); poly3(x, [[xf, v0, uc - 0.12], [xf, v0, uc + 0.05], [xf, v0 - 1.8, uc + 0.02], [xf, v0 - 1.6, uc - 0.08]]); fillp(x, gq);
    if (lit) wallShadowBox(x0, x1, v0 - 0.05, v1, u0, u1);
    ITEMS.push({ u: u0, f: () => {
      x.beginPath();
      for (const u of [u0 + 0.08, u1 - 0.08]) line3(x, [[xf, v0 - 0.3, u], [xo, v0, u]]);
      x.strokeStyle = hzs(IRON, uc); x.lineWidth = clamp(F * 0.02 / uc, 0.7, 2.5); x.stroke();
      box(x, x0, x1, v0, v1, u0, u1, m, !lit);
      if (LO) return;
      const Xf = xo - s * 0.004, vc = v0 + 0.28, ring = (r) => { const p = []; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; p.push([Xf, vc + Math.sin(a) * r, uc + 0.1 + Math.cos(a) * r]); } return p; };
      x.beginPath(); poly3(x, ring(0.2)); fillp(x, hzs(mul(lit ? m.l : m.s, 0.42), uc));
      x.beginPath(); poly3(x, ring(0.13)); poly3(x, ring(0.07));
      x.strokeStyle = hzs(mul(lit ? m.l : m.s, 0.8), uc); x.lineWidth = clamp(F * 0.012 / uc, 0.6, 1.6); x.stroke();
      x.beginPath();
      for (let v = v0 + 0.08; v < v1 - 0.06; v += 0.06) line3(x, [[Xf, v, u0 + 0.06], [Xf, v, u0 + 0.24]]);
      x.strokeStyle = hzs(mul(lit ? m.l : m.s, 0.62), uc); x.stroke();
    } });
  }
  // водосточная труба от воронки под парапетом до земли, хомуты через 1.8 м, отвод к тротуару
  const PIPES = [[22, 26.25], [13, 24.25], [24, 38.75], [15, 53.6], [11, 3.4]];
  function drainpipe(x, b, u, LO) {
    const s = b.s, xf = xfOf(b), lit = s > 0, X = xf - s * 0.09, top = b.h - 0.35;
    const col = lit ? [150, 146, 138] : [92, 90, 88], w = clamp(F * 0.11 / u, 1.2, 9);
    if (lit) wallShadowLine([X, top, u], [X, 0.3, u], 0.05);
    x.beginPath(); line3(x, [[X, top, u], [X, 0.32, u], [X - s * 0.25, 0.12, u]]);
    x.strokeStyle = hzs(col, u); x.lineWidth = w; x.stroke();
    if (LO) return;
    x.beginPath(); line3(x, [[X - s * 0.03, top, u - 0.02], [X - s * 0.03, 0.4, u - 0.02]]);
    x.strokeStyle = hzs(mix(col, [250, 244, 230], lit ? 0.35 : 0.1), u, 0.7); x.lineWidth = w * 0.3; x.stroke();
    box(x, Math.min(xf, X - s * 0.1), Math.max(xf, X - s * 0.1), top - 0.05, top + 0.28, u - 0.13, u + 0.13, { l: col, s: col }, !lit);
    x.beginPath();
    for (let y = top - 1.2; y > 0.6; y -= 1.8) line3(x, [[xf, y, u], [X - s * 0.06, y, u]]);
    x.strokeStyle = hzs(mul(col, 0.6), u); x.lineWidth = w * 0.5; x.stroke();
  }
  // слив-жёлоб из парапета и грязный потёк под ним
  const SCUPPERS = [[14, 34.2], [15, 47.6], [24, 44.0], [25, 49.2], [22, 18.6]];
  function scupper(x, b, u, LO) {
    const s = b.s, xf = xfOf(b), lit = s > 0, y = b.h - 0.55, len = 2.2 + (u % 1.7);
    const a = P(xf, y, u), c = P(xf, y - len, u), g = x.createLinearGradient(0, a[1], 0, c[1]);
    g.addColorStop(0, rgb([62, 52, 42], lit ? 0.34 : 0.28)); g.addColorStop(1, rgb([62, 52, 42], 0));
    x.beginPath(); poly3(x, [[xf, y, u - 0.14], [xf, y, u + 0.14], [xf, y - len, u + 0.06], [xf, y - len * 0.85, u - 0.1]]); fillp(x, g);
    if (lit) wallShadowBox(xf - 0.45, xf, y, y + 0.12, u - 0.07, u + 0.07);
    box(x, Math.min(xf, xf - s * 0.45), Math.max(xf, xf - s * 0.45), y, y + 0.12, u - 0.07, u + 0.07, MAT.gray, !lit);
  }
  function facadeProps(x, LO) {
    const H = (seed) => HOUSES.find((b) => b.seed === seed);
    for (const [sd, u] of SCUPPERS) scupper(x, H(sd), u, LO);
    for (const [sd, u] of PIPES) drainpipe(x, H(sd), u, LO);
    for (const [sd, u, v] of ACS) acUnit(x, H(sd), u, v, LO);
    for (const [sd, u, y] of LANTERNS) lantern(x, H(sd), u, y, LO);
    for (const [s, u, y] of LAMPS) wallLamp(x, s, u, y, LO);
  }

  // ---------- Крыши: баки на рамах, спутниковые тарелки, арматура недостроя, зубцы, антенна ----------
  // Всё стоит за плоскостью фасадов и рисуется до них: фасады сами закрывают нижнюю часть.
  // бак: [X, U, крыша, высота рамы, радиус, высота, цвет]
  const TANKS = [[XL - 1.3, 28.3, 8.2, 1.5, 0.55, 1.05, 'k'], [XR + 1.4, 23.6, 8.0, 1.3, 0.5, 1.0, 'k'],
    [XL - 1.2, 45.6, 10.8, 0.6, 0.6, 1.3, 'w'], [XR + 1.2, 44.6, 10.6, 1.2, 0.5, 1.0, 'k'], [XR + 1.0, 50.8, 12.2, 0.5, 0.55, 1.2, 'w']];
  const TANKC = { k: { l: [84, 80, 76], s: [36, 36, 38] }, w: { l: [222, 218, 206], s: [120, 120, 124] } };
  // тарелка: [X, U, крыша, радиус]; все смотрят на один спутник — одно направление
  const DISHES = [[XL - 0.5, 33.6, 11.6, 0.42], [XR + 0.5, 19.6, 8.0, 0.4], [XR + 0.6, 41.4, 10.6, 0.38], [XL - 0.6, 50.2, 10.8, 0.4]];
  const DDIR = (() => { const v = [-0.5, 0.62, -0.6], l = Math.hypot(v[0], v[1], v[2]); return v.map((q) => q / l); })();
  const REBAR = [24.3, 27.2, 30.2];
  const ANT = [XL - 0.8, 37.6, 11.6];
  // цилиндр бака: передняя половина полосами со своей освещённостью, тёмное дно (видно снизу), обручи
  function tank(x, t, LO) {
    const [X, U, roof, fh, r, h, cn] = t, m = TANKC[cn], y0 = roof + fh, y1 = y0 + h;
    x.beginPath();                                  // рама: стойки и раскосы
    for (const dx of [-r * 0.8, r * 0.8]) for (const du of [-r * 0.8, r * 0.8]) line3(x, [[X + dx, roof - 0.3, U + du], [X + dx, y0, U + du]]);
    for (const du of [-r * 0.8, r * 0.8]) line3(x, [[X - r * 0.8, roof + 0.1, U + du], [X + r * 0.8, y0 - 0.05, U + du]]);
    x.strokeStyle = hzs([70, 66, 60], U); x.lineWidth = clamp(F * 0.05 / U, 0.9, 3); x.stroke();
    const ring = (y) => { const p = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; p.push([X + Math.cos(a) * r, y, U + Math.sin(a) * r]); } return p; };
    x.beginPath(); poly3(x, ring(y0)); fillp(x, hzs(mul(m.s, 0.8), U));
    for (let i = 0; i < 10; i++) {
      const p0 = -Math.PI / 2 + Math.PI * i / 10, p1 = p0 + Math.PI / 10, pm = (p0 + p1) / 2;
      const q = (ph, y) => [X + r * Math.sin(ph), y, U - r * Math.cos(ph)];
      x.beginPath(); poly3(x, [q(p0, y1), q(p1, y1), q(p1, y0), q(p0, y0)]);
      x.strokeStyle = x.fillStyle = hzs(litMix(m, nlOf(Math.sin(pm), 0, -Math.cos(pm))), U); x.lineWidth = 0.6; x.fill(); x.stroke();
    }
    if (LO) return;
    x.beginPath();
    for (const y of [y0 + h * 0.33, y0 + h * 0.66]) { const p = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + Math.PI * i / 10; p.push([X + r * 1.01 * Math.sin(a), y, U - r * 1.01 * Math.cos(a)]); } line3(x, p); }
    x.strokeStyle = hzs(mul(m.s, 0.75), U, 0.8); x.lineWidth = clamp(F * 0.03 / U, 0.7, 2); x.stroke();
  }
  function dish(x, d, LO) {
    const [X, U, roof, r] = d, C = [X, roof + 0.95, U], e1n = Math.hypot(DDIR[2], DDIR[0]);
    const e1 = [DDIR[2] / e1n, 0, -DDIR[0] / e1n];
    const e2 = [DDIR[1] * e1[2] - DDIR[2] * e1[1], DDIR[2] * e1[0] - DDIR[0] * e1[2], DDIR[0] * e1[1] - DDIR[1] * e1[0]];
    const rim = (k) => { const p = []; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; p.push([C[0] + (Math.cos(a) * e1[0] + Math.sin(a) * e2[0]) * r * k, C[1] + (Math.cos(a) * e1[1] + Math.sin(a) * e2[1]) * r * k, C[2] + (Math.cos(a) * e1[2] + Math.sin(a) * e2[2]) * r * k]); } return p; };
    x.beginPath(); line3(x, [[X, roof - 0.2, U], [X, C[1] - 0.05, U], [C[0] - DDIR[0] * 0.15, C[1] - DDIR[1] * 0.15, C[2] - DDIR[2] * 0.15]]);
    x.strokeStyle = hzs([80, 78, 74], U); x.lineWidth = clamp(F * 0.04 / U, 0.8, 3); x.stroke();
    x.beginPath(); poly3(x, rim(1)); fillp(x, hzs([212, 210, 202], U));
    x.beginPath(); poly3(x, rim(0.72)); fillp(x, hzs([190, 188, 182], U));
    const f = [C[0] + DDIR[0] * r * 1.1, C[1] + DDIR[1] * r * 1.1, C[2] + DDIR[2] * r * 1.1], lo = rim(1)[15];
    x.beginPath(); line3(x, [lo, f]); x.strokeStyle = hzs([92, 90, 86], U); x.lineWidth = clamp(F * 0.025 / U, 0.7, 2); x.stroke();
    if (!LO) box(x, f[0] - 0.05, f[0] + 0.05, f[1] - 0.04, f[1] + 0.06, f[2] - 0.05, f[2] + 0.05, { l: [90, 88, 84], s: [60, 58, 56] });
  }
  function roofProps(x, LO) {
    // арматура над колоннами недостроенного этажа (флаг rebar у дома 13)
    const hb = HOUSES.find((b) => b.rebar);
    for (const u of REBAR) {
      box(x, XL - 0.4, XL - 0.1, hb.h, hb.h + 0.35, u - 0.15, u + 0.15, MAT.gray);
      x.beginPath();
      for (const [dx, du, l, bend] of [[-0.07, -0.08, 0.9, 0.12], [0.07, -0.08, 1.1, -0.1], [-0.07, 0.08, 0.75, 0.15], [0.07, 0.08, 1.0, 0.05]]) {
        const X = XL - 0.25 + dx, y = hb.h + 0.35;
        line3(x, [[X, y, u + du], [X, y + l * 0.75, u + du], [X + bend, y + l, u + du + bend * 0.5]]);
      }
      x.strokeStyle = hzs([118, 78, 56], u); x.lineWidth = clamp(F * 0.02 / u, 0.8, 2.2); x.stroke();
    }
    // зубцы парапета на старом каменном доме справа
    const hz2 = HOUSES.find((b) => b.seed === 22);
    x.beginPath();
    for (let u = hz2.u0 + 0.2; u < hz2.u1 - 0.4; u += 0.9) fr(x, XR, u, hz2.h - 0.02, u + 0.45, hz2.h + 0.42);
    fillp(x, hgrad(x, XR, hz2.u0, hz2.u1, MAT.stone.l));
    for (const t of TANKS) tank(x, t, LO);
    for (const d of DISHES) dish(x, d, LO);
    // телевизионная антенна-«ёлка»
    const [ax, au, ay] = ANT;
    x.beginPath(); line3(x, [[ax, ay - 0.3, au], [ax, ay + 2.4, au]]);
    for (let k = 0; k < 4; k++) { const y = ay + 1.3 + k * 0.32, w = 0.7 - k * 0.12; line3(x, [[ax, y, au - w], [ax, y, au + w]]); }
    x.strokeStyle = hzs([74, 72, 70], au); x.lineWidth = clamp(F * 0.03 / au, 0.8, 2); x.stroke();
  }
  // тени предметов на крышах левого ряда — на дороге (оболочки проекций и штрихи)
  function roofShadows(g) {
    const sh = (pts) => { const h = hull(pts.map((p) => { const q = toGround(p[0], p[1], p[2]); return [q[0], q[2]]; })); groundPoly(g, h); };
    for (const t of TANKS) {
      const [X, U, roof, fh, r, h] = t;
      if (X > 0) continue;
      const box8 = [];
      for (const dx of [-r, r]) for (const du of [-r, r]) for (const y of [roof + fh, roof + fh + h]) box8.push([X + dx, y, U + du]);
      sh(box8);
      g.beginPath();
      for (const dx of [-r * 0.8, r * 0.8]) for (const du of [-r * 0.8, r * 0.8]) line3(g, [toGround(X + dx, roof, U + du), toGround(X + dx, roof + fh, U + du)]);
      g.lineWidth = Math.max(1, F * 0.05 / (U + 8)); g.stroke();
    }
    for (const d of DISHES) {
      if (d[0] > 0) continue;
      const C = [d[0], d[2] + 0.95, d[1]], pts = [];
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pts.push([C[0] + Math.cos(a) * d[3] * 0.8, C[1] + Math.sin(a) * d[3], C[2] + Math.cos(a) * d[3] * 0.6]); }
      sh(pts);
    }
    const hb = HOUSES.find((b) => b.rebar);
    g.beginPath();
    for (const u of REBAR) line3(g, [toGround(XL - 0.25, hb.h, u), toGround(XL - 0.25, hb.h + 1.3, u)]);
    line3(g, [toGround(ANT[0], ANT[2], ANT[1]), toGround(ANT[0], ANT[2] + 2.4, ANT[1])]);
    g.lineWidth = 1.2; g.stroke();
  }

  // ---------- Предметы на тротуарах: столики кафе, мешки с пряностями, ящики, тележка с коврами ----------
  const CRATE = { l: [178, 146, 102], s: [98, 84, 68] };
  // ящик: коробка, щели между досками на видимых гранях, сверху — товар (если fill)
  function crate(x, X0, X1, Y0, Y1, U0, U1, lit, fill, LO) {
    box(x, X0, X1, Y0, Y1, U0, U1, CRATE, !lit);
    if (fill && Y1 < EYE) { x.beginPath(); gr(x, X0 + 0.03, U0 + 0.03, X1 - 0.03, U1 - 0.03, Y1 + 0.02); fillp(x, hzs(lit ? fill : mul(fill, 0.55), U0)); }
    if (LO) return;
    const gap = hzs(lit ? [92, 72, 52] : [58, 48, 40], U0), lw = clamp(F * 0.014 / U0, 0.6, 2);
    x.beginPath();
    for (const k of [0.36, 0.68]) {
      const y = lerp(Y0, Y1, k);
      line3(x, [[X0, y, U0], [X1, y, U0]]);
      const Xs = CAMX < X0 ? X0 : CAMX > X1 ? X1 : null;
      if (Xs !== null) line3(x, [[Xs, y, U0], [Xs, y, U1]]);
    }
    x.strokeStyle = gap; x.lineWidth = lw; x.stroke();
    if (fill && Y1 < EYE) {             // плоды: тёмные промежутки между ними
      const r = Tex.rng(Math.round(U0 * 97 + X0 * 13));
      x.beginPath();
      for (let i = 0; i < 14; i++) { const X = lerp(X0 + 0.06, X1 - 0.06, r()), U = lerp(U0 + 0.06, U1 - 0.06, r()); poly3(x, ringPts(X, U, 0.035, 0.035, 6).map((p) => [p[0], Y1 + 0.03, p[2]])); }
      fillp(x, hzs(mul(fill, lit ? 0.62 : 0.36), U0));
    }
  }
  // столик кафе на одной ножке и стулья с гнутой спинкой (левый тротуар, в тени)
  function cafeSet(x, X, U, LO) {
    const y0 = WALK, top = y0 + 0.74, met = hzs([52, 50, 50], U), lw = clamp(F * 0.025 / U, 0.8, 3);
    const chair = (cu, dir) => {
      const sy = y0 + 0.45, d = 0.2;
      x.beginPath();
      for (const dx of [-d, d]) for (const du of [-d, d]) line3(x, [[X + dx, y0, cu + du], [X + dx * 0.9, sy, cu + du * 0.9]]);
      const bu = cu + dir * d;
      line3(x, [[X - d, sy, bu], [X - d, sy + 0.42, bu], [X + d, sy + 0.42, bu], [X + d, sy, bu]]);
      line3(x, [[X - d, sy + 0.24, bu], [X + d, sy + 0.24, bu]]);
      x.strokeStyle = met; x.lineWidth = lw; x.stroke();
      x.beginPath(); gr(x, X - d, cu - d, X + d, cu + d, sy); fillp(x, hzs([96, 72, 56], U));

    };
    chair(U + 0.55, 1);
    x.beginPath(); line3(x, [[X, y0, U], [X, top, U]]); line3(x, [[X - 0.22, y0 + 0.01, U], [X + 0.22, y0 + 0.01, U]]);
    x.strokeStyle = met; x.lineWidth = lw * 1.4; x.stroke();
    x.beginPath(); poly3(x, ringPts(X, U, 0.32, 0.32, 20).map((p) => [p[0], top, p[2]])); fillp(x, hzs([138, 134, 128], U));
    if (!LO) { x.beginPath(); poly3(x, [[X - 0.06, top + 0.001, U - 0.05], [X + 0.05, top + 0.001, U - 0.05], [X + 0.05, top + 0.001, U + 0.06], [X - 0.06, top + 0.001, U + 0.06]]); fillp(x, hzs([196, 188, 172], U)); }
    chair(U - 0.55, -1);
  }
  // экранная выпуклая оболочка мировых точек — силуэт цилиндров и мешков
  function hullPath(x, pts) {
    const h = hull(pts.map((p) => P(p[0], p[1], p[2])));
    x.beginPath(); x.moveTo(h[0][0], h[0][1]);
    for (let i = 1; i < h.length; i++) x.lineTo(h[i][0], h[i][1]);
    x.closePath();
  }
  // рулон вдоль улицы (ось по U): силуэт — оболочка торцевых кругов, блик сверху, торец со спиралью
  function roll(x, X, yc, r, u0, u1, col, lit, LO) {
    const ring = (u, k) => ringPts(X, yc, r * k, r * k, 14).map((p) => [p[0], p[2], u]);
    const c = lit ? col : mul(col, 0.62);
    hullPath(x, ring(u0, 1).concat(ring(u1, 1))); fillp(x, hzs(c, u0));
    hullPath(x, ring(u0, 0.5).map((p) => [p[0] - r * 0.25, p[1] + r * 0.35, p[2]]).concat(ring(u1, 0.5).map((p) => [p[0] - r * 0.25, p[1] + r * 0.35, p[2]])));
    fillp(x, hzs(mix(c, [250, 240, 220], 0.12), u0));
    x.beginPath(); poly3(x, ring(u0 - 0.001, 1)); fillp(x, hzs(mul(c, 0.8), u0));
    if (LO) return;
    x.beginPath();
    for (let i = 0; i <= 20; i++) { const a = i * 0.9, q = r * (0.15 + 0.8 * i / 20), p = P(X + Math.cos(a) * q, yc + Math.sin(a) * q, u0 - 0.002); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }
    x.strokeStyle = hzs(mul(c, 0.55), u0); x.lineWidth = 1; x.stroke();
  }
  // открытый мешок: выпуклый силуэт (оболочка колец), теневая сторона справа, подвёрнутый светлый край,
  // горка товара над краем
  function sack(x, X, U, y0, h, col, LO) {
    const r = 0.26, y1 = y0 + h, burl = [178, 152, 112];
    const ring = (y, k) => ringPts(X, U, r * k, r * k, 12).map((p) => [p[0], y, p[2]]);
    hullPath(x, ring(y0, 0.86).concat(ring(y0 + h * 0.45, 1.06), ring(y1, 0.98))); fillp(x, hzs(burl, U));
    hullPath(x, ring(y0, 0.86).concat(ring(y0 + h * 0.45, 1.06), ring(y1, 0.98)).filter((p) => p[0] > X + r * 0.25)); fillp(x, hzs(mul(burl, 0.72), U));
    hullPath(x, ring(y1 - 0.07, 1.02).concat(ring(y1 + 0.02, 1.05))); fillp(x, hzs(mix(burl, [244, 234, 212], 0.25), U));
    const mound = ring(y1 + 0.01, 0.9).concat([[X, y1 + 0.16, U]]);
    hullPath(x, mound); fillp(x, hzs(col, U));
    if (LO) return;
    hullPath(x, ring(y1 + 0.02, 0.5).concat([[X - 0.05, y1 + 0.14, U]]).map((p) => [p[0] - 0.05, p[1], p[2]])); fillp(x, hzs(mix(col, [255, 244, 222], 0.2), U));
    x.beginPath(); line3(x, [[X - r * 0.2, y0 + 0.05, U - r], [X - r * 0.1, y1 - 0.1, U - r]]);
    x.strokeStyle = hzs(mul(burl, 0.6), U, 0.6); x.lineWidth = 1; x.stroke();
  }
  // ручная тележка с коврами в рулонах: дощатая платформа, два колеса со спицами, оглобли
  function handcart(x, LO) {
    const X0 = -5.12, X1 = -4.22, U0 = 7.2, U1 = 8.8, yb = 0.55, uw = 8.15, rw = 0.36, sh = true;
    const wheel = (X) => {
      const ring = (r) => { const p = []; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; p.push([X, rw + Math.sin(a) * r, uw + Math.cos(a) * r]); } return p; };
      x.beginPath(); poly3(x, ring(rw)); poly3(x, ring(rw * 0.84).reverse()); fillp(x, hzs([56, 48, 42], uw));
      if (LO) return;
      x.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI; line3(x, [[X, rw + Math.sin(a) * rw * 0.84, uw + Math.cos(a) * rw * 0.84], [X, rw - Math.sin(a) * rw * 0.84, uw - Math.cos(a) * rw * 0.84]]); }
      x.strokeStyle = hzs([70, 58, 46], uw); x.lineWidth = clamp(F * 0.03 / uw, 0.8, 4); x.stroke();
    };
    wheel(X0 - 0.05);
    x.beginPath(); line3(x, [[X0 + 0.1, yb, U0], [X0 + 0.05, 0.95, U0 - 1.1]]); line3(x, [[X1 - 0.1, yb, U0], [X1 - 0.05, 0.95, U0 - 1.1]]);
    x.strokeStyle = hzs([92, 72, 54], U0); x.lineWidth = clamp(F * 0.05 / U0, 1, 6); x.stroke();
    box(x, X0, X1, yb - 0.08, yb, U0, U1, CRATE, sh);
    // рулоны ковров вдоль тележки: торцы к камере со спиралью
    const RUG = [[132, 60, 50], [62, 70, 100], [164, 124, 70]];
    [[-4.9, 0.17], [-4.48, 0.17], [-4.69, 0.45]].forEach(([X, dy], k) => {
      roll(x, X, yb + dy, 0.17, U0 + 0.1 + k * 0.1, U1 - 0.05, RUG[k], !sh, LO);
    });
    crate(x, X0 + 0.08, X1 - 0.08, yb, yb + 0.42, U1 - 0.55, U1 - 0.05, false, null, LO);
    wheel(X1 + 0.05);
  }
  function groundProps(x, LO) {
    ITEMS.push({ u: 7.0, f: () => handcart(x, LO) });
    for (const U of [17.0, 19.1]) ITEMS.push({ u: U - 0.75, f: () => cafeSet(x, -4.72, U, LO) });
    // пряности на низкой скамье у лавки справа и штабель ящиков
    ITEMS.push({ u: 9.6, f: () => {
      box(x, 4.56, 5.32, WALK, WALK + 0.34, 9.6, 12.8, { l: [130, 102, 74], s: [78, 64, 52] }, false);
      const SP = [[166, 84, 54], [196, 152, 72], [120, 92, 62], [118, 128, 72]];
      for (let k = 3; k >= 0; k--) sack(x, 4.94, 9.98 + k * 0.8, WALK + 0.34, 0.5, SP[k], LO);
    } });
    ITEMS.push({ u: 13.2, f: () => {
      crate(x, 4.5, 5.3, WALK, WALK + 0.45, 13.2, 13.85, true, null, LO);
      crate(x, 4.55, 5.25, WALK + 0.45, WALK + 0.88, 13.25, 13.8, true, [186, 120, 62], LO);
    } });
    // ящики с фруктами у бакалеи слева
    ITEMS.push({ u: 31.6, f: () => {
      crate(x, -5.2, -4.6, WALK, WALK + 0.4, 31.6, 32.2, false, [190, 132, 66], LO);
      crate(x, -5.2, -4.6, WALK, WALK + 0.4, 32.3, 32.9, false, [124, 140, 72], LO);
      crate(x, -5.15, -4.65, WALK + 0.4, WALK + 0.76, 31.7, 32.15, false, [160, 60, 50], LO);
    } });
  }

  // ---------- Износ стен: отбитая штукатурка с кладкой, потёки под подоконниками, грязный цоколь ----------
  // вертикальный градиент по экрану для полосы на фасаде (от v0 к v1 прозрачность a0 → a1)
  function wallFade(x, xf, u, v0, v1, col, a0, a1) {
    const p = P(xf, v0, u), q = P(xf, v1, u), g = x.createLinearGradient(0, p[1], 0, q[1]);
    g.addColorStop(0, rgb(col, a0)); g.addColorStop(1, rgb(col, a1));
    return g;
  }
  function wallWear(x, LO) {
    for (const b of HOUSES) {
      if (b.ghost) continue;
      const xf = xfOf(b), lit = b.s > 0, R = Tex.rng(b.seed * 101 + 7), um = (b.u0 + b.u1) / 2;
      // грязный цоколь: на теневой стороне сильнее
      x.beginPath(); fr(x, xf, b.u0, 0, b.u1, 1.1); fillp(x, wallFade(x, xf, um, 0, 1.1, [58, 46, 36], lit ? 0.22 : 0.34, 0));
      if (LO || Math.abs(sxOf(xf, b.u1) - sxOf(xf, b.u0)) < 60) continue;
      // потёки под подоконниками окон верхних этажей
      let v = b.fl[0];
      for (let f = 1; f < b.fl.length; f++) {
        for (const uc of b.wu) {
          if (R() < 0.45) continue;
          const v0 = v + 0.78, len = 0.5 + R() * 1.1, w = b.ww * (0.25 + R() * 0.3), du = (R() - 0.5) * 0.2;
          x.beginPath(); poly3(x, [[xf, v0, uc + du - w / 2], [xf, v0, uc + du + w / 2], [xf, v0 - len, uc + du + w * 0.2], [xf, v0 - len * 0.8, uc + du - w * 0.3]]);
          fillp(x, wallFade(x, xf, uc, v0, v0 - len, [70, 58, 44], lit ? 0.26 : 0.3, 0));
        }
        v += b.fl[f];
      }
      // отбитая штукатурка: 1–2 пятна там, где нет проёмов; внутри — ряды камня, светлая кромка сверху
      const busy = (u) => b.gf.some((g) => u > g[1] - 0.5 && u < g[2] + 0.5) || b.wu.some((w) => Math.abs(w - u) < b.ww / 2 + 0.45);
      for (let k = 0; k < 3; k++) {
        const uc = lerp(b.u0 + 0.6, b.u1 - 0.6, R()), vc = k === 0 ? 0.9 + R() * 0.8 : b.fl[0] + 0.6 + R() * 1.6;
        if (busy(uc)) continue;
        const ru = 0.35 + R() * 0.35, rv = 0.28 + R() * 0.3, pts = [];
        for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2, q = 0.7 + R() * 0.45; pts.push([xf, vc + Math.sin(a) * rv * q, uc + Math.cos(a) * ru * q]); }
        const st = lit ? [182, 146, 104] : [104, 86, 70];
        x.beginPath(); poly3(x, pts.map((p) => [p[0], p[1] + 0.03, p[2] - 0.03])); fillp(x, hzs(mix(lit ? MAT[b.m].l : MAT[b.m].s, [255, 250, 240], 0.25), uc));
        x.beginPath(); poly3(x, pts); fillp(x, hzs(st, uc));
        x.save(); x.beginPath(); poly3(x, pts); x.clip();
        x.beginPath();
        for (let y = Math.floor((vc - rv) / 0.22) * 0.22, row = 0; y < vc + rv; y += 0.22, row++) {
          line3(x, [[xf, y, uc - ru], [xf, y, uc + ru]]);
          for (let u = uc - ru + (row % 2) * 0.2; u < uc + ru; u += 0.4) line3(x, [[xf, y, u], [xf, y + 0.22, u]]);
        }
        x.strokeStyle = hzs(mul(st, 0.62), uc); x.lineWidth = clamp(F * 0.018 / uc, 0.7, 2.2); x.stroke();
        x.restore();
      }
    }
  }

  // @@PARTS

  // мягкое затемнение верхней полосы (как градиентный фильтр на объективе): под шапкой интерфейса
  // и подписями экранов фон спокойнее и темнее, ниже 230 px картинка не меняется
  function topShade(x) {
    const g = x.createLinearGradient(0, 0, 0, 250);
    g.addColorStop(0, rgb([150, 156, 168])); g.addColorStop(0.5, rgb([188, 192, 202])); g.addColorStop(0.8, rgb([232, 234, 238])); g.addColorStop(1, rgb([255, 255, 255]));
    x.save(); x.globalCompositeOperation = 'multiply'; x.fillStyle = g; x.fillRect(0, 0, SW, 250); x.restore();
  }

  // ---------- Сцена ----------
  Backgrounds.scene('desert', function (x, R, th, o) {
    const LO = o.scale < 0.5;
    ITEMS = []; WALLSH = []; WALLFN = [];
    sky(x);
    groundBase(x);
    groundTex(x, o);
    roadDetail(x, LO);
    curbs(x, LO);
    groundShadows(x, (g) => {
      g.strokeStyle = rgb(C.shadow);
      wireGroundShadows(g);
      roofShadows(g);
      for (const p of PALMS) if (p.near || p.alley) palmShadow(g, p, toGround, LO);
    });
    farEnd(x, LO);
    // за плоскостью фасадов: пальма в переулке, мачты на крышах
    for (const p of PALMS) if (p.alley) palmDraw(x, p, LO);
    roofMasts(x);
    roofProps(x, LO);
    sideWalls(x);
    const vis = HOUSES.filter((b) => !b.ghost).sort((a, b) => b.u0 - a.u0);
    for (const b of vis) facadeBase(x, b);
    wallTex(x, o);
    wallWear(x, LO);
    for (const b of vis) houseDetail(x, b, LO);
    wallRuns(x, LO);
    signs(x, LO);
    facadeProps(x, LO);
    groundProps(x, LO);
    awnings(x, LO);
    wires(x, LO);
    for (const p of PALMS) {
      if (!p.near) continue;
      ITEMS.push({ u: p.U - 1.3, f: () => palmDraw(x, p, LO) });
      WALLFN.push((g) => palmShadow(g, p, onWall, LO));
    }
    applyWallShadows(x);
    ITEMS.sort((a, b) => b.u - a.u);
    for (const it of ITEMS) it.f();
    topShade(x);
    // @@DRAW
  });
})();
