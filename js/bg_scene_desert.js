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
  const HAZE = [212, 204, 187];
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
  function layer(x) {
    const c = document.createElement('canvas');
    c.width = x.canvas.width; c.height = x.canvas.height;
    const g = c.getContext('2d');
    g.setTransform(c.width / SW, 0, 0, c.height / SH, 0, 0);
    return { c: c, g: g };
  }

  // ---------- Палитра ----------
  const C = {
    asph: [150, 143, 133], walk: [192, 180, 160], curb: [178, 167, 150], sand: [208, 188, 152],
    shadow: [150, 157, 182],          // множитель тени (multiply)
  };
  // материалы стен: l — на солнце, s — в тени (с тёплым отражённым светом от улицы)
  const MAT = {
    cream: { l: [228, 212, 182], s: [146, 135, 126] },
    sand:  { l: [220, 194, 152], s: [140, 124, 110] },
    white: { l: [234, 228, 214], s: [150, 146, 146] },
    ochre: { l: [212, 178, 128], s: [134, 114, 96] },
    stone: { l: [208, 178, 136], s: [130, 112, 94] },
    gray:  { l: [190, 182, 168], s: [124, 120, 118] },
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
      wu: [7.5, 10.0], ww: 1.0, wh: 1.45, ws: 'shut', gf: [['shop', 6.6, 9.4], ['door', 9.9, 10.8]] },
    { s: -1, u0: 13.0, u1: 24.0, h: 13.6, fl: [4.0, 3.2, 3.2, 2.6], m: 'sand', gm: 'stone', seed: 12, paint: 'green', bands: true,
      wu: [14.3, 16.9, 19.3, 21.7, 23.2], ww: 1.0, wh: 1.5, ws: 'shut',
      gf: [['adoor', 13.6, 15.0], ['shop', 16.0, 20.4], ['win', 21.3, 22.1], ['door', 22.7, 23.6]], bal: [[1, 16.2, 20.0]] },
    { s: -1, u0: 24.0, u1: 30.5, h: 8.2, fl: [4.0, 3.4], m: 'white', seed: 13, paint: 'blue', rebar: true,
      wu: [25.3, 27.5, 29.4], ww: 0.9, wh: 1.3, ws: 'shut', gf: [['gar', 24.6, 27.4], ['door', 28.4, 29.3]] },
    { s: -1, u0: 30.5, u1: 39.5, h: 11.6, fl: [4.2, 3.4, 3.2], m: 'ochre', seed: 14, paint: 'brown', bars: true,
      wu: [31.6, 34.0, 36.3, 38.5], ww: 1.0, wh: 1.4, ws: 'arch',
      gf: [['shop', 31.2, 34.5], ['door', 35.4, 36.3], ['win', 37.4, 38.4]], bal: [[2, 33.2, 37.0]] },
    { s: -1, u0: 43.0, u1: 54.0, h: 10.8, fl: [3.8, 3.2, 3.0], m: 'cream', seed: 15, paint: 'teal', bands: true,
      wu: [44.2, 46.7, 49.2, 51.7, 53.3], ww: 1.0, wh: 1.4, ws: 'shut',
      gf: [['shop', 43.6, 47.0], ['door', 48.0, 48.9], ['shop', 50.0, 53.4]] },
    { s: 1, u0: 6.0, u1: 16.5, h: 11.4, fl: [4.2, 3.2, 3.2], m: 'sand', seed: 21, paint: 'wood', bands: true,
      wu: [9.2, 11.7, 14.6], ww: 1.1, wh: 1.5, ws: 'shut', gf: [['shop', 9.0, 14.0], ['door', 14.9, 15.9]], bal: [[1, 10.5, 12.9]] },
    { s: 1, u0: 16.5, u1: 26.5, h: 8.0, fl: [4.0, 3.2], m: 'stone', seed: 22, paint: 'blue',
      wu: [18.0, 20.6, 23.2, 25.5], ww: 1.0, wh: 1.5, ws: 'arch',
      gf: [['shop', 17.4, 20.6], ['adoor', 21.6, 23.0], ['win', 24.2, 25.2]] },
    { s: 1, u0: 28.0, u1: 38.5, h: 14.2, fl: [4.0, 3.3, 3.3, 3.0], m: 'white', seed: 23, paint: 'green',
      wu: [29.2, 31.6, 34.0, 36.4], ww: 1.1, wh: 1.6, ws: 'mod',
      gf: [['door', 29.0, 30.6], ['win', 31.8, 32.8], ['win', 34.0, 35.0], ['shop', 36.0, 38.0]],
      bal: [[1, 30.8, 32.4], [2, 30.8, 32.4], [3, 30.8, 32.4], [1, 35.6, 37.2], [2, 35.6, 37.2]] },
    { s: 1, u0: 38.5, u1: 46.0, h: 10.6, fl: [4.0, 3.2, 2.8], m: 'ochre', seed: 24, paint: 'teal',
      wu: [39.6, 42.0, 44.6], ww: 1.0, wh: 1.4, ws: 'shut', gf: [['shop', 39.2, 43.0], ['door', 44.0, 45.0]] },
    { s: 1, u0: 46.0, u1: 54.0, h: 12.2, fl: [4.0, 3.4, 3.4], m: 'cream', seed: 25, paint: 'brown', bands: true,
      wu: [47.2, 49.6, 52.0], ww: 1.0, wh: 1.5, ws: 'shut', gf: [['shop', 46.8, 50.6], ['door', 51.6, 52.6]] },
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
    g.addColorStop(0, rgb([116, 143, 168]));
    g.addColorStop(0.4, rgb([150, 172, 190]));
    g.addColorStop(0.8, rgb([194, 197, 192]));
    g.addColorStop(1, rgb([212, 205, 189]));
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
    const L = layer(x), g = L.g;
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

  // ---------- Дальний план: лестница, терраса, здание с куполом, башня ----------
  const PLAT = 2.4, ST0 = 55, ST1 = 59, FU = 66;   // высота террасы, лестница, фасад здания
  function farEnd(x) {
    const st = MAT.stone;
    // подпорная стена террасы
    x.beginPath(); ur(x, ST1, -16, 0, 16, PLAT); fillp(x, hzs(mix(st.l, st.s, 0.15), ST1));
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
    // главный фасад здания с куполом
    const cr = MAT.cream;
    x.beginPath(); ur(x, FU, -9, PLAT, 11, PLAT + 12); fillp(x, hzs(cr.l, FU));
    // барабан и купол
    const dc = P(2, PLAT + 15.5, 75), rs = F * 6.2 / 75, dr = P(2, PLAT + 12, 75);
    x.beginPath(); x.rect(dc[0] - rs * 0.92, dc[1], rs * 1.84, dr[1] - dc[1]); fillp(x, hzs(mix(cr.l, cr.s, 0.2), 75));
    x.beginPath(); x.moveTo(dc[0] - rs, dc[1]);
    x.bezierCurveTo(dc[0] - rs, dc[1] - rs * 0.66, dc[0] - rs * 0.52, dc[1] - rs * 1.04, dc[0], dc[1] - rs * 1.16);
    x.bezierCurveTo(dc[0] + rs * 0.52, dc[1] - rs * 1.04, dc[0] + rs, dc[1] - rs * 0.66, dc[0] + rs, dc[1]);
    x.closePath();
    const gd = x.createRadialGradient(dc[0] - rs * 0.45, dc[1] - rs * 0.7, rs * 0.1, dc[0] - rs * 0.2, dc[1] - rs * 0.4, rs * 1.3);
    gd.addColorStop(0, hzs([226, 214, 190], 75)); gd.addColorStop(0.6, hzs([196, 182, 160], 75)); gd.addColorStop(1, hzs([132, 124, 120], 75));
    fillp(x, gd);
    // башня: фронт на солнце, правая грань в тени
    x.beginPath(); ur(x, 68, -7.8, PLAT, -4.2, PLAT + 20); fillp(x, hzs(st.l, 68));
  }

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

  // лавка: глубина с полками и товаром, рольставня поднята на часть
  function shopAt(x, b, u0, u1, R, LO) {
    const xf = xfOf(b), lit = b.s > 0, uc = (u0 + u1) / 2, top = Math.min(b.fl[0] - 0.75, 3.3);
    const up = 0.62 + R() * 0.3, far = LO || Math.abs(sxOf(xf, u1) - sxOf(xf, u0)) < 3;
    niche(x, b, u0, u1, 0.12, top, 0.24, 0, (xi, a0, a1, b0, b1) => {
      x.beginPath(); fr(x, xi, a0, b0, a1, b1); fillp(x, hzs(lit ? [66, 58, 50] : [46, 40, 36], uc));
      if (!LO) {
        const r2 = Tex.rng(b.seed * 31 + Math.round(u0 * 10));
        for (let v = b0 + 0.5; v < b0 + 2.0; v += 0.42) {       // полки с товаром
          x.beginPath(); fr(x, xi, a0, v, a1, v + 0.05); fillp(x, hzs(lit ? [96, 84, 70] : [70, 62, 54], uc));
          for (let u = a0 + 0.1; u < a1 - 0.2; u += 0.18 + r2() * 0.3) {
            const c = [[150, 120, 80], [120, 130, 120], [170, 150, 120], [130, 90, 70], [180, 170, 150]][Math.floor(r2() * 5)];
            x.beginPath(); fr(x, xi, u, v + 0.05, u + 0.12 + r2() * 0.2, v + 0.18 + r2() * 0.18); fillp(x, hzs(mul(c, lit ? 0.7 : 0.5), uc));
          }
        }
      }
      // штора: гофра сверху, нижняя планка
      const vs = b1 - (b1 - b0) * (1 - up) - 0.25;
      const c = lit ? [176, 178, 170] : [112, 114, 112];
      x.beginPath(); fr(x, xi, a0, vs, a1, b1); fillp(x, hzs(c, uc));
      slats(x, xi, a0, a1, vs, b1, 0.09, hzs(mul(c, 0.78), uc), uc);
      x.beginPath(); fr(x, xi, a0, vs - 0.05, a1, vs + 0.04); fillp(x, hzs(mul(c, 0.55), uc));
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
      if (g[0] === 'shop') shopAt(x, b, g[1], g[2], R, LO);
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
      for (const q of bal) balcony(x, b, v, q[1], q[2], R, LO);
      v += fh;
    }
  }

  // ---------- Тени на правых фасадах: маска и multiply только в их пределах ----------
  function applyWallShadows(x) {
    if (!WALLSH.length) return;
    const L = layer(x), g = L.g;
    g.fillStyle = rgb(C.shadow);
    for (const p of WALLSH) { g.beginPath(); poly3(g, p); g.fill(); }
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
    const A = C.asph, Wk = C.walk, S = C.sand, GT = [172, 165, 152], CB = [204, 194, 174], PA = [224, 220, 206];
    for (let j = 0; j < h; j++) {
      const dy = (j + 0.5) / k;
      if (dy < 1.5) continue;
      const uR = F * EYE / dy, uW = F * (EYE - WALK) / dy;
      if (uR > 64) continue;
      const fine = clamp(1.5 - uR * uR / (F * EYE * k) * 12, 0, 1);   // мелочь гасим, где пиксель слоя > ~8 см
      const puR = uR * uR / (F * EYE * k), puW = uW * uW / (F * (EYE - WALK) * k);   // пиксель слоя вдоль U, м
      const ia = Math.max(0, Math.floor(sxOf(XL - 0.3, uW) * k)), ib = Math.min(w, Math.ceil(sxOf(XR + 0.3, uW) * k));
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
          const tr = Math.min(Math.abs(ax - 1.2), Math.abs(ax - 2.8));   // накатанные колеи светлее
          t += 0.03 * clamp(1 - tr / 0.35, 0, 1);
          const rv = fbm2(n4, X * 0.7 + 3, U * 0.35);                  // выкрошенный асфальт: светлее, грубее
          const rav = clamp((rv - 0.22) / 0.05, 0, 1);
          t += rav * (0.045 + fine * 0.08 * (hash2(Math.floor(X * 70), Math.floor(U * 70)) - 0.5));
          sand = clamp((ax - 2.7) / 1.25, 0, 1) * clamp(0.45 + 1.1 * fbm2(n1, X * 0.8 + 7, U * 0.4), 0, 1) * 0.6;
          sand += clamp(n3(X * 0.25 + 2, U * 0.12) - 0.25, 0, 1) * 0.5;   // песок, нанесённый ветром
          // разметка: осевая пунктирная (3 м штрих, 5 м разрыв) и «зебра»; краска стёрта по колеям и пятнами
          paint = cov(ax, 0.06, px) * cov(Math.abs(((U % 8) + 8) % 8 - 1.5), 1.5, pu);
          if (U > ZEB.u0 - 0.3 && U < ZEB.u1 + 0.3) {
            const zc = (ZEB.u0 + ZEB.u1) / 2;
            paint = Math.max(paint, cov(gridDist(X, 1.0, 0.25), 0.25, px) * cov(Math.abs(U - zc), (ZEB.u1 - ZEB.u0) / 2, pu) * cov(ax, ZEB.hx, px));
          }
          if (paint > 0) {
            const wear = clamp(0.62 + 1.3 * fbm2(n4, X * 1.3 + 17, U * 0.8) + 0.3 * n2(X * 7, U * 5), 0, 1);
            paint *= wear * (1 - 0.45 * clamp(1 - tr / 0.45, 0, 1)) * 0.9;
          }
        }
        t += fine * (0.06 * n3(X * 13, U * 13) + 0.03 * n2(X * 31, U * 31));
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
  // сетка «крокодиловой кожи»: узлы с разбросом, рёбра с вероятностью, спадающей к краю эллипса
  function alligator(x, r, Xc, Uc, rx, ru) {
    const st = 0.3, nx = Math.ceil(rx * 2 / st) + 1, nu = Math.ceil(ru * 2 / st) + 1, N = [];
    for (let i = 0; i < nx; i++) {
      N.push([]);
      for (let j = 0; j < nu; j++) N[i].push([Xc - rx + i * st + (r() - 0.5) * st * 0.7, Uc - ru + j * st + (r() - 0.5) * st * 0.7]);
    }
    x.beginPath();
    for (let i = 0; i < nx; i++) for (let j = 0; j < nu; j++) {
      const p = N[i][j], e = Math.hypot((p[0] - Xc) / rx, (p[1] - Uc) / ru);
      if (e > 1) continue;
      for (const q of [i + 1 < nx ? N[i + 1][j] : null, j + 1 < nu ? N[i][j + 1] : null]) {
        if (!q || r() > 0.9 - e * 0.55) continue;
        const m = [(p[0] + q[0]) / 2 + (r() - 0.5) * 0.06, (p[1] + q[1]) / 2 + (r() - 0.5) * 0.06];
        line3(x, [[p[0], 0, p[1]], [m[0], 0, m[1]], [q[0], 0, q[1]]]);
      }
    }
    pen(x, 0.009, Uc, [36, 32, 30], 0.7); x.stroke();
  }
  // заплата из свежего асфальта: темнее, с битумным швом по краю
  function patch(x, pts, U) {
    x.beginPath(); poly3(x, pts); fillp(x, hzs([70, 68, 68], U, 0.22));
    x.lineJoin = 'round'; pen(x, 0.03, U, [36, 34, 34], 0.3); x.stroke();
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
    // заплаты: поперечная траншея, вокруг люка, продольная полоса, у дальнего конца
    for (const p of [[-GUT, 19.6, 1.3, 20.5], [0.85, 15.6, 2.6, 18.6], [-2.95, 23.0, -2.05, 37.0], [-3.4, 41.0, -0.6, 43.4]]) {
      patch(x, [[p[0], 0, p[1]], [p[2], 0, p[1]], [p[2], 0, p[3]], [p[0], 0, p[3]]], p[1]);
    }
    patch(x, ringPts(1.0, 5.2, 0.6, 0.42, 18, 0.22, r), 5.2);   // залатанная яма у камеры
    if (!LO) {
      // продольный шов посередине (стык полос укладки), местами залит битумом, поверх — трещина
      const seam = crackPts(r, 0.22, 4.2, 0, 34, 0.25, 0.1);
      // шов рисуем кусками: толщина берётся по глубине каждого куска — иначе к горизонту уходит
      // линия одной толщины и читается как провод или случайный штрих
      const seg = (pts, wm, col, a) => { for (let i = 0; i + 1 < pts.length; i += 6) crack(x, pts.slice(i, i + 7), wm, col, a); };
      seg(seam, 0.028, [36, 34, 34], 0.3); seg(seam, 0.007, [24, 22, 22], 0.5);
      // поперечные температурные трещины; часть залита
      for (const [u, x0, len, sealed] of [[7.3, -GUT + 0.05, 4.5, true], [11.0, 0.3, 3.2, false], [24.6, -GUT + 0.05, 7, true],
        [29.0, -1.0, 4.2, false], [35.5, -GUT + 0.05, 5, true], [9.1, 2.1, 1.4, false]]) {
        const pts = crackPts(r, x0, u, Math.PI / 2, len, 0.12, 1.1);
        if (sealed) crack(x, pts, 0.032, [36, 34, 34], 0.32);
        crack(x, pts, 0.008, [30, 28, 26], 0.62);
        if (r() < 0.7) crack(x, crackPts(r, pts[pts.length >> 1][0], pts[pts.length >> 1][2], 0.4 + r() * 0.8, 0.8 + r(), 0.12, 0.8), 0.007, [30, 28, 26], 0.7);
      }
      // трещины вдоль колей
      for (const [X, u, len] of [[-1.25, 4.0, 3.5], [2.75, 5.5, 2.2], [-2.8, 13.5, 5], [1.3, 21.5, 4], [-1.3, 31, 6]]) {
        crack(x, crackPts(r, X, u, (r() - 0.5) * 0.3, len, 0.15, 0.6), 0.008, [30, 28, 26], 0.75);
      }
      alligator(x, r, 2.35, 8.6, 0.65, 1.2);
      alligator(x, r, -1.0, 27.0, 0.75, 1.6);
      // выбоина: выкрошенная кромка, тёмная яма, песок на дне
      x.beginPath(); poly3(x, ringPts(-2.35, 7.8, 0.36, 0.28, 14, 0.5, r)); fillp(x, hzs([184, 172, 150], 7.8, 0.5));
      x.beginPath(); poly3(x, ringPts(-2.35, 7.8, 0.27, 0.2, 14, 0.45, r)); fillp(x, hzs([58, 52, 48], 7.8, 0.85));
      x.beginPath(); poly3(x, ringPts(-2.32, 7.84, 0.15, 0.1, 10, 0.5, r)); fillp(x, hzs([168, 148, 116], 7.8, 0.85));
    }
    manhole(x, -1.45, 6.3, LO);
    manhole(x, 1.7, 17.1, LO);
    manhole(x, -0.4, 33.0, LO);
    for (const u of [9.0, 21.5, 34.5, 47]) grate(x, -1, u, LO);
    for (const u of [12.5, 27.5, 41]) grate(x, 1, u, LO);
  }

  // ---------- Тканевые маркизы над лавками ----------
  // Ткань выгоревшая: пары цветов полос. Наклонное полотно от стены к улице, спереди — подзор.
  // Левый ряд в тени дома; справа полотно на солнце: снизу просвечивает, тень падает на стену.
  const CLOTH = {
    red: [[168, 100, 82], [220, 208, 184]], green: [[98, 122, 100], [218, 210, 188]],
    blue: [[92, 114, 134], [222, 218, 206]], sand: [[190, 164, 126], [170, 144, 108]],
  };
  const AWN = [[-1, 6.5, 9.5, 'green'], [-1, 15.9, 20.5, 'red'], [-1, 31.1, 34.6, 'blue'], [-1, 49.9, 53.5, 'sand'],
    [1, 8.9, 14.1, 'red'], [1, 17.3, 20.7, 'sand'], [1, 39.1, 43.1, 'green']];
  const AW = { d: 1.3, ya: 3.62, yb: 2.92, yv: 2.62 };   // вылет, высота у стены, у кромки, низ подзора
  function awnings(x, LO) {
    for (const [s, u0, u1, cl] of AWN) {
      const xf = s < 0 ? XL : XR, xo = xf - s * AW.d, lit = s > 0, c = CLOTH[cl];
      if (lit) wallShadowBox(Math.min(xo, xf), Math.max(xo, xf), AW.yv, AW.ya, u0, u1);
      ITEMS.push({ u: u0, f: () => {
        const n = Math.max(2, Math.round((u1 - u0) / 0.3)), du = (u1 - u0) / n;
        const under = (k) => (lit ? mul(c[k], 0.8) : mul(mix(c[k], [120, 130, 150], 0.15), 0.5));
        const front = (k) => (lit ? mix(c[k], [255, 246, 228], 0.08) : mul(mix(c[k], [120, 130, 150], 0.15), 0.6));
        for (let i = 0; i < n; i++) {               // испод полотна, полосы от стены к кромке
          const a = u0 + i * du, b = a + du;
          x.beginPath(); poly3(x, [[xf, AW.ya, a], [xf, AW.ya, b], [xo, AW.yb, b], [xo, AW.yb, a]]); fillp(x, hzs(under(i % 2), a));
        }
        const xm = lerp(xf, xo, 0.4), ym = lerp(AW.ya, AW.yb, 0.4);   // затенение у стены
        x.beginPath(); poly3(x, [[xf, AW.ya, u0], [xf, AW.ya, u1], [xm, ym, u1], [xm, ym, u0]]); fillp(x, rgb([34, 26, 20], 0.2));
        for (let i = 0; i < n; i++) {               // подзор
          const a = u0 + i * du, b = a + du;
          x.beginPath(); fr(x, xo, a, AW.yv, b, AW.yb); fillp(x, hzs(front(i % 2), a));
        }
        if (LO) return;
        x.beginPath(); line3(x, [[xo, AW.yv + 0.03, u0], [xo, AW.yv + 0.03, u1]]);   // подшитый край
        x.strokeStyle = hzs(mul(front(0), 0.7), u0, 0.7); x.lineWidth = clamp(F * 0.025 / u0, 0.6, 3); x.stroke();
        x.beginPath();                               // складные кронштейны
        for (const u of [u0 + 0.06, u1 - 0.06]) line3(x, [[xf, AW.ya - 0.8, u], [xo + s * 0.05, AW.yb, u]]);
        line3(x, [[xo, AW.yb, u0], [xo, AW.yb, u1]]);
        x.strokeStyle = hzs(IRON, u0); x.lineWidth = clamp(F * 0.03 / u0, 0.8, 3.5); x.stroke();
      } });
    }
  }

  // @@PARTS

  // ---------- Сцена ----------
  Backgrounds.scene('desert', function (x, R, th, o) {
    const LO = o.scale < 0.5;
    ITEMS = []; WALLSH = [];
    sky(x);
    groundBase(x);
    groundTex(x, o);
    roadDetail(x, LO);
    curbs(x, LO);
    groundShadows(x);
    farEnd(x);
    sideWalls(x);
    const vis = HOUSES.filter((b) => !b.ghost).sort((a, b) => b.u0 - a.u0);
    for (const b of vis) facadeBase(x, b);
    wallTex(x, o);
    for (const b of vis) houseDetail(x, b, LO);
    awnings(x, LO);
    applyWallShadows(x);
    ITEMS.sort((a, b) => b.u - a.u);
    for (const it of ITEMS) it.f();
    // @@DRAW
  });
})();
