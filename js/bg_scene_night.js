'use strict';

// Фон «Ночной порт» (1920 × 1080). Мокрая улица между кирпичным складом и штабелями контейнеров
// выходит к причалу; через гавань — контейнеровоз под портальными кранами, над ним луна.
// Камера стоит на асфальте: одна точка схода (VX, HOR). Всё строится из мировых координат
// в метрах (X — вправо, Y — вверх, Z — вглубь от камеры), поэтому ряды окон, швы плит,
// провода и отражения сами сжимаются к горизонту.
(function () {
  const W = 1920, H = 1080, VX = 960, HOR = 495, F = 1300, EYE = 2.0;
  // ---------- План ----------
  const WALL_X = -9, WH_Z0 = 11.5, WH_Z1 = 38.5, WH_H = 12.6;   // кирпичный склад слева
  const AN_X = -8.4, AN_Z1 = 46, AN_H = 7.6;                      // диспетчерская за складом
  const CONT_X = 8;                                               // борт штабелей справа
  const BLOCKS = [
    // segs — число ярусов в переднем и заднем 20-футовых сегментах; x — борт штабеля (разная глубина)
    { z0: 9, z1: 21.2, tiers: 4, segs: [3, 4], x: 8, seed: 11 },
    { z0: 25.5, z1: 37.7, tiers: 3, segs: [3, 2], x: 8.8, seed: 12, mark: 'A-12' },
    { z0: 41.5, z1: 47.6, tiers: 2, segs: [2, 2], x: 8.3, seed: 13, mark: 'B-07' },
  ];
  const ZQ = 50;             // кромка нашего причала
  const WATER = -1.3;        // уровень воды относительно асфальта
  const ZS = 190;            // ближний борт контейнеровоза
  const ZC = 232;            // морской рельс кранов на дальнем причале (береговой — ZC + 30)
  const MOON = { x: 1112, y: 128, r: 15 };
  // Луна низко впереди: тени ложатся к камере и чуть влево
  const MOON_DIR = { x: (MOON.x - VX) / F, y: (HOR - MOON.y) / F };
  // Все точечные источники света: из них потом строятся дорожки бликов на воде и асфальте
  let LIGHTS = [];
  // Столбы с фонарями на правом тротуаре: z — основание, hx/hy — голова светильника
  const POLES = [14, 28, 42].map((z) => ({ z: z, x: 6.8, hx: 3.9, hy: 8.6 }));
  const PCOL = [[214, 170, 112], [204, 204, 196], [210, 164, 108]];   // натрий, светодиод, натрий
  const MAST = { x: 3.4, z: 46.4, h: 17 };                               // прожекторная мачта у причала
  // Источники, освещающие землю: пятно света радиуса r, сила k
  const GLAMPS = POLES.map((p, i) => ({ X: p.hx, Y: p.hy - 0.3, Z: p.z, c: PCOL[i], r: 6, k: 0.26 }))
    .concat([{ X: MAST.x - 1.2, Y: MAST.h, Z: MAST.z - 0.4, c: [190, 204, 220], r: 11, k: 0.2 },
      { X: WALL_X + 0.5, Y: 4.4, Z: 21.5, c: [214, 178, 122], r: 3.5, k: 0.2 }]);
  // Тень от точки высоты h при луне (к камере и чуть влево)
  const SHX = -MOON_DIR.x / MOON_DIR.y, SHZ = -1 / MOON_DIR.y;

  // ---------- Проекция ----------
  const px = (X, Z) => VX + F * X / Z;
  const py = (Y, Z) => HOR + F * (EYE - Y) / Z;
  const P = (X, Y, Z) => [px(X, Z), py(Y, Z)];
  const zRow = (y) => F * EYE / (y - HOR);          // глубина асфальта под строкой экрана
  const waterY = (Z) => py(WATER, Z);

  // ---------- Мелкие помощники ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rgba = (c, a) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  // Холст во весь кадр в тех же логических координатах, что и основной
  function layer(s) { const c = cv(W * s, H * s), g = c.getContext('2d'); g.setTransform(s, 0, 0, s, 0, 0); return { c: c, g: g }; }
  function path(x, pts) {
    x.beginPath();
    for (let i = 0; i < pts.length; i++) (i ? x.lineTo(pts[i][0], pts[i][1]) : x.moveTo(pts[i][0], pts[i][1]));
    x.closePath();
  }
  const wpts = (pts) => pts.map((p) => P(p[0], p[1], p[2]));
  function wfill(x, pts, col) { path(x, wpts(pts)); x.fillStyle = col; x.fill(); }
  // Грани: X = const (стены вдоль улицы), Z = const (смотрят на камеру), Y = const (пол, потолок)
  const faceX = (X, z0, z1, y0, y1) => [[X, y1, z0], [X, y1, z1], [X, y0, z1], [X, y0, z0]];
  const faceZ = (Z, x0, x1, y0, y1) => [[x0, y1, Z], [x1, y1, Z], [x1, y0, Z], [x0, y0, Z]];
  const faceY = (Y, x0, x1, z0, z1) => [[x0, Y, z0], [x1, Y, z0], [x1, Y, z1], [x0, Y, z1]];
  // Отрезок в мире; толщина задаётся в метрах и сжимается с глубиной (не тоньше minW пикселей)
  function wseg(x, a, b, wm, col, minW) {
    const p = P(a[0], a[1], a[2]), q = P(b[0], b[1], b[2]);
    x.strokeStyle = col; x.lineWidth = Math.max(minW || 0.8, F * wm * 2 / (a[2] + b[2]));
    x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke();
  }
  // Провисающий провод между двумя точками подвеса (парабола вместо цепной линии)
  function wire(x, a, b, sag, wm, col, minW) {
    const n = 28;
    x.strokeStyle = col; x.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const p0 = [lerp(a[0], b[0], t0), lerp(a[1], b[1], t0) - sag * 4 * t0 * (1 - t0), lerp(a[2], b[2], t0)];
      const p1 = [lerp(a[0], b[0], t1), lerp(a[1], b[1], t1) - sag * 4 * t1 * (1 - t1), lerp(a[2], b[2], t1)];
      const q0 = P(p0[0], p0[1], p0[2]), q1 = P(p1[0], p1[1], p1[2]);
      x.lineWidth = Math.max(minW || 1, F * wm * 2 / (p0[2] + p1[2]));
      x.beginPath(); x.moveTo(q0[0], q0[1]); x.lineTo(q1[0], q1[1]); x.stroke();
    }
    x.lineCap = 'butt';
  }
  function grad(x, x0, y0, x1, y1, stops) {
    const g = x.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((s) => g.addColorStop(s[0], s[1]));
    return g;
  }
  function radial(x, cx, cy, r, stops) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    stops.forEach((s) => g.addColorStop(s[0], s[1]));
    return g;
  }

  // ---------- Шум (периодический, чтобы тайлы стыковались без швов) ----------
  function vnoise(rnd, n) {
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return function (u, v) {
      const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
      const a = ((i0 % n) + n) % n, b = ((j0 % n) + n) % n, a1 = (a + 1) % n, b1 = (b + 1) % n;
      const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
      const r0 = g[b * n + a] + (g[b * n + a1] - g[b * n + a]) * su;
      const r1 = g[b1 * n + a] + (g[b1 * n + a1] - g[b1 * n + a]) * su;
      return r0 + (r1 - r0) * sv;
    };
  }
  // Поле fbm w × h (значения ~0..1) с периодом по обеим осям; cells — клеток на самой крупной октаве
  function fbmField(rnd, w, h, cells, oct) {
    const ns = [];
    for (let k = 0; k < oct; k++) ns.push(vnoise(rnd, cells << k));
    const out = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let s = 0, a = 0.5, norm = 0;
        for (let k = 0; k < oct; k++) {
          const c = cells << k;
          s += a * ns[k](i / w * c, j / h * c); norm += a; a *= 0.5;
        }
        out[j * w + i] = s / norm;
      }
    }
    return out;
  }
  // Поле → холст: fn(v, i, j) возвращает [r, g, b, a]
  function fieldCanvas(w, h, field, fn) {
    const c = cv(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    for (let k = 0, o = 0; k < w * h; k++, o += 4) {
      const col = fn(field[k], k % w, (k / w) | 0);
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = col[3];
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ===== РАЗДЕЛЫ СЦЕНЫ =====

  // ---------- Небо, луна, звёзды ----------
  function drawSky(x, C) {
    // Ночное небо: почти чёрный зенит, к горизонту — серо-синяя засветка от города и порта
    x.fillStyle = grad(x, 0, 0, 0, HOR + 30, [[0, '#04070d'], [0.3, '#070c16'], [0.62, '#0e1522'],
      [0.82, '#18202d'], [0.95, '#262c37'], [1, '#2e333c']]);
    x.fillRect(0, 0, W, HOR + 30);
    // тёплая дымка над портом справа (натриевые мачты за штабелями) — едва заметная
    x.fillStyle = radial(x, 1500, HOR + 60, 700, [[0, 'rgba(92,78,62,.22)'], [0.5, 'rgba(70,62,56,.08)'], [1, 'rgba(60,56,54,0)']]);
    x.fillRect(0, 0, W, HOR + 30);
    // тонкие высокие облака, подсвеченные луной у края
    const rc = Tex.rng(301);
    for (let i = 0; i < 9; i++) {
      const cx = 380 + rc() * 1300, cy = 40 + rc() * 230, w = 160 + rc() * 380, h = 5 + rc() * 10;
      const near = 1 - smooth(120, 520, Math.hypot(cx - MOON.x, cy - MOON.y));
      x.save(); x.translate(cx, cy); x.scale(1, h / w);
      x.fillStyle = radial(x, 0, 0, w, [[0, 'rgba(60,70,88,' + (0.1 + near * 0.16) + ')'], [1, 'rgba(60,70,88,0)']]);
      x.beginPath(); x.arc(0, 0, w, 0, Math.PI * 2); x.fill();
      x.restore();
    }
    // звёзды: редкие, у горизонта и возле луны гаснут в засветке
    const rs = Tex.rng(302);
    for (let i = 0; i < 150; i++) {
      const sxp = rs() * W, syp = Math.pow(rs(), 1.35) * 400, b = rs();
      const fade = (1 - smooth(170, 400, syp)) * smooth(60, 260, Math.hypot(sxp - MOON.x, syp - MOON.y));
      if (fade < 0.05) continue;
      const big = b > 0.93, sz = big ? 2.2 : 1.2 + rs() * 0.7;
      const tint = rs() < 0.3 ? [255, 236, 214] : [214, 226, 255];
      x.fillStyle = rgba(tint, ((big ? 0.85 : 0.25 + b * 0.5) * fade).toFixed(3));
      x.fillRect(sxp - sz / 2, syp - sz / 2, sz, sz);
    }
    // Луна: ореол небольшой, как в лёгкой дымке, без «засвета»
    const m = MOON;
    x.fillStyle = radial(x, m.x, m.y, m.r * 4, [[0.25, 'rgba(200,212,228,.05)'], [1, 'rgba(200,212,228,0)']]);
    x.beginPath(); x.arc(m.x, m.y, m.r * 4, 0, Math.PI * 2); x.fill();
    x.save();
    x.beginPath(); x.arc(m.x, m.y, m.r, 0, Math.PI * 2); x.clip();
    x.fillStyle = radial(x, m.x - 3, m.y - 2, m.r * 1.15, [[0, '#eef0ee'], [0.7, '#dcdfdc'], [1, '#bfc4c6']]);
    x.fillRect(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
    // моря (тёмные пятна) и неосвещённый край — луна чуть на убыли
    [[-4, -4, 5, 0.22], [3, -6, 4, 0.18], [5, 2, 5.5, 0.2], [-2, 5, 3.5, 0.16], [-7, 1, 3, 0.12]].forEach((s) => {
      x.fillStyle = 'rgba(112,120,128,' + s[3] + ')';
      x.beginPath(); x.ellipse(m.x + s[0], m.y + s[1], s[2], s[2] * 0.8, 0.5, 0, Math.PI * 2); x.fill();
    });
    // неосвещённый серп справа: между краем диска и терминатором (полуэллипс)
    [[0.5, 0.45], [0.62, 0.55]].forEach((t) => {
      x.fillStyle = 'rgba(18,24,36,' + t[1] + ')';
      x.beginPath(); x.arc(m.x, m.y, m.r + 1, -Math.PI / 2, Math.PI / 2, false);
      x.ellipse(m.x, m.y, m.r * t[0], m.r + 1, 0, Math.PI / 2, -Math.PI / 2, true); x.closePath(); x.fill();
    });
    x.restore();
  }

  // Коробка в мире: рисуются только грани, видимые из камеры (0, EYE, 0).
  // cols: { f — передняя (к камере), s — боковая, b — нижняя, t — верхняя }
  function box(x, x0, x1, y0, y1, z0, z1, cols) {
    if (cols.s) {
      if (x0 > 0) wfill(x, faceX(x0, z0, z1, y0, y1), cols.s);
      else if (x1 < 0) wfill(x, faceX(x1, z0, z1, y0, y1), cols.s);
    }
    if (cols.b && y0 > EYE) wfill(x, faceY(y0, x0, x1, z0, z1), cols.b);
    if (cols.t && y1 < EYE) wfill(x, faceY(y1, x0, x1, z0, z1), cols.t);
    if (cols.f) wfill(x, faceZ(z0, x0, x1, y0, y1), cols.f);
  }
  // Точечный огонь: яркое ядро + маленький ореол; попадает в список для бликов на воде/асфальте
  function lamp(x, X, Y, Z, rm, col, k, noGlow) {
    const p = P(X, Y, Z), r = Math.max(0.7, F * rm / Z);
    if (!noGlow) {
      const g = r * 4.5;
      x.fillStyle = radial(x, p[0], p[1], g, [[0, rgba(col, 0.32 * k)], [0.35, rgba(col, 0.08 * k)], [1, rgba(col, 0)]]);
      x.fillRect(p[0] - g, p[1] - g, g * 2, g * 2);
    }
    x.fillStyle = rgba(mixc(col, [255, 255, 255], 0.55), Math.min(1, k));
    x.beginPath(); x.arc(p[0], p[1], r, 0, Math.PI * 2); x.fill();
    LIGHTS.push({ X: X, Y: Y, Z: Z, r: r, c: col, k: k });
  }

  // ---------- Портальные краны на дальнем причале ----------
  // Ноги на морском (ZC) и береговом (ZC + 30) рельсах, ригели портала, две балки
  // (стрела над судном + консоль над берегом), А-рама с оттяжками, машинный дом, тележка с кабиной.
  const CRANES = [
    { x: -36, up: 0, col: [104, 114, 124] },
    { x: 3, up: 1, col: [112, 120, 128] },
    { x: 64, up: 0, col: [96, 104, 114] },
  ];
  const GY0 = 47, GY1 = 50.5;   // низ и верх балок
  function crane(x, c, pass) {
    const cx = c.x, zw = ZC, zl = ZC + 30, za = ZC + 13, dk = [10, 13, 18];
    const S = (k) => rgba(mixc(c.col, dk, k), 1);
    if (pass === 'back') {
      // ноги (береговые дальше, рисуем первыми) и раскосы боковых рам
      [zl, zw].forEach((z) => [-10.5, 10.5].forEach((dx) => {
        wseg(x, [cx + dx, 0, z], [cx + dx, 45, z], 1.8, S(z === zl ? 0.62 : 0.5));
        wseg(x, [cx + dx + (dx > 0 ? -0.6 : 0.6), 2, z - 0.9], [cx + dx + (dx > 0 ? -0.6 : 0.6), 45, z - 0.9], 0.35, S(0.15), 0.7);
      }));
      [-10.5, 10.5].forEach((dx) => {
        wseg(x, [cx + dx, 28, zw], [cx + dx, 44, zl], 0.7, S(0.55));
        wseg(x, [cx + dx, 28, zl], [cx + dx, 44, zw], 0.7, S(0.55));
        wseg(x, [cx + dx, 28, zw], [cx + dx, 28, zl], 1.1, S(0.5));
      });
      // ригели портала (по X) — видна передняя грань и низ
      [zl, zw].forEach((z) => box(x, cx - 11.6, cx + 11.6, 43.6, 46.8, z - 1, z + 1, { f: S(0.42), b: S(0.3) }));
      // машинный дом на консоли
      box(x, cx - 6.2, cx + 6.2, GY1, GY1 + 5.6, zl - 2, zl + 13, { f: S(0.38), s: S(0.5) });
      wfill(x, faceZ(zl - 2.01, cx - 5.6, cx + 5.6, GY1 + 4.6, GY1 + 5.0), S(0.15));
      // А-рама: передние и задние стойки сходятся к оголовку
      [-1, 1].forEach((sd) => {
        wseg(x, [cx + sd * 5.4, GY1, zl - 1], [cx + sd * 2.8, 74, za], 1.3, S(0.5));
        wseg(x, [cx + sd * 5.4, GY1, zw + 1], [cx + sd * 2.8, 74, za], 1.3, S(0.4));
        wseg(x, [cx + sd * 4.6, 58, zw + 4], [cx + sd * 4.6, 58, zl - 4], 0.5, S(0.45), 0.7);
        // оттяжки консоли
        wseg(x, [cx + sd * 2.8, 73, za], [cx + sd * 4.2, GY1, zl + 15], 0.45, S(0.45), 0.8);
      });
      box(x, cx - 3.6, cx + 3.6, 72.6, 75, za - 1, za + 1, { f: S(0.35), b: S(0.25) });
      wseg(x, [cx - 4.2, 62, za - 4], [cx + 4.2, 62, za - 4], 0.6, S(0.4), 0.8);
      // две балки: стрела над судном и консоль; если стрела поднята — только консоль
      const z0 = c.up ? zw : zw - 56;
      [-4.2, 4.2].forEach((dx) => box(x, cx + dx - 0.75, cx + dx + 0.75, GY0, GY1, z0, zl + 15, { f: S(0.3), s: S(0.4), b: S(0.22) }));
      // диафрагмы между балками (видны снизу как лесенка) и поручни мостков
      for (let z = z0 + 3; z < zl + 14; z += 6.5) wfill(x, faceY(GY0 + 0.4, cx - 3.45, cx + 3.45, z, z + 0.7), S(0.35));
      [-5.1, 5.1].forEach((dx) => wseg(x, [cx + dx, GY1 + 1.1, z0], [cx + dx, GY1 + 1.1, zl + 15], 0.08, S(0.3), 0.8));
      if (c.up) {
        // поднятая стрела: две фермы вверх от шарнира, перехваты-лесенка
        const L = 56, a = 72 * Math.PI / 180, ty = GY1 + L * Math.sin(a), tz = zw - L * Math.cos(a);
        [-4.2, 4.2].forEach((dx) => wseg(x, [cx + dx, GY1, zw], [cx + dx, ty, tz], 1.3, S(0.42)));
        for (let t = 0.08; t < 1; t += 0.07) {
          const yy = lerp(GY1, ty, t), zz = lerp(zw, tz, t), y2 = lerp(GY1, ty, t + 0.035), z2 = lerp(zw, tz, t + 0.035);
          wseg(x, [cx - 4.2, yy, zz], [cx + 4.2, yy, zz], 0.35, S(0.45), 0.8);
          wseg(x, [cx - 4.2, yy, zz], [cx + 4.2, y2, z2], 0.25, S(0.5), 0.7);
        }
        [-1, 1].forEach((sd) => wseg(x, [cx + sd * 2.8, 73, za], [cx + sd * 4.2, lerp(GY1, ty, 0.62), lerp(zw, tz, 0.62)], 0.4, S(0.45), 0.8));
      } else {
        // передние оттяжки к стреле
        [-1, 1].forEach((sd) => {
          wseg(x, [cx + sd * 2.8, 73, za], [cx + sd * 4.2, GY1, zw - 22], 0.45, S(0.42), 0.8);
          wseg(x, [cx + sd * 2.8, 72, za], [cx + sd * 4.2, GY1, zw - 47], 0.45, S(0.42), 0.8);
        });
        // тележка и подвесная кабина оператора (светится изнутри)
        box(x, cx - 3.2, cx + 3.2, GY0 - 1.2, GY0, zw - 35, zw - 28, { f: S(0.3), b: S(0.2), s: S(0.4) });
        box(x, cx + 0.4, cx + 3.4, GY0 - 4.2, GY0 - 1.2, zw - 34, zw - 30.5, { f: '#4b4a40', b: S(0.25), s: '#3c3d36' });
        wfill(x, faceZ(zw - 34.05, cx + 0.7, cx + 3.1, GY0 - 3.2, GY0 - 1.7), 'rgba(236,214,160,.85)');
      }
    } else {
      // pass 'front' — после судна: тросы, спредер, прожекторы и заградительные огни
      if (!c.up) {
        const zt = zw - 31.5;
        [-1.4, 1.4].forEach((dx) => wseg(x, [cx + dx, GY0 - 1.2, zt], [cx + dx * 2.6, 33.6, zt], 0.07, 'rgba(30,34,40,.9)', 0.8));
        box(x, cx - 6.1, cx + 6.1, 33.0, 33.6, zt - 1.2, zt + 1.2, { f: '#6a5a2c', b: '#3e3622' });
        [[zw - 44, -4.2, [214, 226, 240]], [zw - 17, 4.2, [226, 218, 196]]].forEach((q) => lamp(x, cx + q[1], GY0 - 0.3, q[0], 0.36, q[2], 0.7, true));
      }
      lamp(x, cx + 6, 43.2, zw - 1.2, 0.34, [214, 226, 240], 0.65, true);
      lamp(x, cx, 75.4, za, 0.28, [200, 64, 52], 0.8, true);
      if (!c.up) lamp(x, cx + 4.2, GY1 + 0.4, zw - 56, 0.24, [200, 64, 52], 0.65, true);
    }
  }

  // ---------- Контейнеровоз у дальнего причала (корма справа, нос далеко слева) ----------
  // Палитра контейнеров (днём; ночью притемняется): ржаво-красный, синий, серый, зелёный, беж…
  const CPAL = [[124, 54, 44], [50, 76, 104], [96, 100, 104], [50, 86, 66], [130, 114, 88],
    [150, 152, 148], [98, 46, 48], [60, 98, 106], [138, 92, 54], [132, 118, 66]];
  const DECK = 12, HOUSE = { x0: 12.5, x1: 25, top: 41 };
  const BAYS = (function () {
    const b = [{ x0: 26.5, x1: 38.7, t: [4, 5] }];
    const tiers = [[3, 5], [5, 6], [6, 6], [4, 3], [6, 7], [5, 6], [6, 6]];
    for (let k = 0; k < tiers.length; k++) { const x1 = 11 - 13.6 * k; b.push({ x0: x1 - 12.2, x1: x1, t: tiers[k] }); }
    return b;
  })();

  function shipStack(x, bay, z, n, rr, dim) {
    const th = 2.59, y0 = DECK + 0.9;
    for (let t = 0; t < n; t++) {
      // 40-футовый или два 20-футовых
      const parts = rr() < 0.25 ? [[bay.x0, bay.x0 + 6.05], [bay.x0 + 6.15, bay.x1]] : [[bay.x0, bay.x1]];
      parts.forEach((pp) => {
        const col = mixc(CPAL[Math.floor(rr() * CPAL.length)], [12, 16, 22], dim + rr() * 0.12);
        const a = y0 + t * th, b = a + th - 0.06;
        wfill(x, faceZ(z, pp[0], pp[1], a, b), rgba(col, 1));
        // гофра: несколько тёмных вертикалей, угловые стойки и нижняя балка
        for (let gx = pp[0] + 0.9; gx < pp[1] - 0.6; gx += 1.6) wfill(x, faceZ(z, gx, gx + 0.35, a + 0.25, b - 0.2), rgba(mixc(col, [0, 0, 0], 0.18), 1));
        wfill(x, faceZ(z, pp[0], pp[0] + 0.25, a, b), rgba(mixc(col, [0, 0, 0], 0.35), 1));
        wfill(x, faceZ(z, pp[1] - 0.25, pp[1], a, b), rgba(mixc(col, [0, 0, 0], 0.35), 1));
        wfill(x, faceZ(z, pp[0], pp[1], a, a + 0.22), rgba(mixc(col, [0, 0, 0], 0.45), 1));
        if (rr() < 0.4) wfill(x, faceZ(z, pp[0] + rr() * 8, pp[0] + rr() * 8 + 2, a + 0.3, b - 0.4), 'rgba(70,46,34,.25)');
      });
    }
    return y0 + n * th;
  }

  function drawShip(x) {
    const z = ZS, rr = Tex.rng(410), yTop = py(DECK, z), yWl = py(WATER, z);
    // палубный груз: сначала внутренние ряды (выше), затем внешний ряд у борта
    BAYS.forEach((b) => shipStack(x, b, z + 5, b.t[1], rr, 0.6));
    BAYS.forEach((b) => shipStack(x, b, z + 1.6, b.t[0], rr, 0.5));
    // найтовочные мостики между отсеками — тёмные щели с площадками
    BAYS.forEach((b) => {
      const g0 = b.x1 + 0.05, g1 = b.x1 + 1.35;
      if (g1 > HOUSE.x0 && g0 < HOUSE.x1) return;
      wfill(x, faceZ(z + 1.7, g0, g1, DECK + 0.9, DECK + 0.9 + 2.59 * Math.min(4, b.t[0])), 'rgba(10,12,16,.85)');
      for (let t = 1; t <= 3; t++) wfill(x, faceZ(z + 1.65, g0 - 0.1, g1 + 0.1, DECK + 0.9 + 2.59 * t - 0.15, DECK + 0.9 + 2.59 * t), 'rgba(80,86,92,.6)');
    });
    // корпус: тёмный борт, ватерлиния с красно-бурым поясом, швы листов, потёки ржавчины
    path(x, wpts(faceZ(z, -170, 40, WATER - 0.4, DECK)));
    x.fillStyle = grad(x, 0, yTop, 0, yWl, [[0, '#20262e'], [0.7, '#161b21'], [1, '#121519']]); x.fill();
    wfill(x, faceZ(z, -170, 40, WATER - 0.4, WATER + 2.1), '#2e1e1d');
    wfill(x, faceZ(z, -170, 40, WATER + 2.1, WATER + 2.35), 'rgba(140,140,132,.25)');
    [3.2, 6.4, 9.4].forEach((yy) => wfill(x, faceZ(z, -170, 40, yy, yy + 0.08), 'rgba(0,0,0,.35)'));
    for (let bx = -160; bx < 40; bx += 9 + rr() * 5) wfill(x, faceZ(z, bx, bx + 0.08, WATER + 2.4, DECK - 0.4), 'rgba(0,0,0,.25)');
    for (let i = 0; i < 26; i++) {
      const bx = -60 + rr() * 98, len = 1.5 + rr() * 5, w = 0.25 + rr() * 0.4;
      const p0 = P(bx, DECK - 0.3, z), p1 = P(bx, DECK - 0.3 - len, z);
      x.fillStyle = grad(x, 0, p0[1], 0, p1[1], [[0, 'rgba(96,58,40,.4)'], [1, 'rgba(96,58,40,0)']]);
      x.fillRect(p0[0], p0[1], F * w / z, p1[1] - p0[1]);
    }
    // фальшборт и леер
    wfill(x, faceZ(z - 0.05, -170, 40, DECK - 0.35, DECK), 'rgba(58,64,70,.9)');
    wfill(x, faceZ(z - 0.05, -170, 40, DECK + 1.05, DECK + 1.12), 'rgba(120,126,130,.6)');
    // надстройка: светло-серая в тени, 9 палуб с окнами, мостик с крылом сверху
    const hz = z + 1, H0 = DECK;
    path(x, wpts(faceZ(hz, HOUSE.x0, HOUSE.x1, H0, HOUSE.top)));
    x.fillStyle = grad(x, 0, py(HOUSE.top, hz), 0, py(H0, hz), [[0, '#76808a'], [1, '#4e565e']]); x.fill();
    for (let d = 0; d < 8; d++) {
      const y0 = H0 + 1.4 + d * 3.15;
      wfill(x, faceZ(hz - 0.02, HOUSE.x0, HOUSE.x1, y0 - 0.55, y0 - 0.4), 'rgba(0,0,0,.25)');
      for (let wx = HOUSE.x0 + 0.8; wx < HOUSE.x1 - 0.9; wx += 2.05) {
        const lit = rr() < 0.3 + d * 0.02;
        wfill(x, faceZ(hz - 0.03, wx, wx + 1.05, y0 + 0.5, y0 + 1.55), lit ? 'rgba(232,200,140,.92)' : 'rgba(22,28,34,.95)');
        if (lit) LIGHTS.push({ X: wx + 0.5, Y: y0 + 1, Z: hz, r: 2.5, c: [232, 200, 140], k: 0.45 });
      }
    }
    wfill(x, faceZ(hz - 0.03, HOUSE.x0 + 0.3, HOUSE.x1 - 0.3, 38.0, 40.2), '#151b22');
    for (let wx = HOUSE.x0 + 1; wx < HOUSE.x1 - 0.6; wx += 1.6) wfill(x, faceZ(hz - 0.04, wx, wx + 0.12, 38.0, 40.2), 'rgba(110,118,124,.7)');
    box(x, HOUSE.x0 - 0.2, HOUSE.x0 + 3.6, 37.6, 41.3, z - 1.4, z + 2, { f: '#7c8690', s: '#5e6770', b: '#3c434a' });
    wfill(x, faceZ(z - 1.41, HOUSE.x0, HOUSE.x0 + 3.4, 38.2, 40.0), '#18202a');
    wfill(x, faceZ(hz - 0.02, HOUSE.x0, HOUSE.x1, HOUSE.top - 0.4, HOUSE.top + 0.3), '#3d444b');
    // шлюпка на шлюпбалках у края надстройки: корпус с жёсткими гранями, тент, тёмная щель под ней
    const bx0 = HOUSE.x1 - 6.4, bx1 = HOUSE.x1 - 0.6, bz = z - 0.6;
    wfill(x, faceZ(bz + 0.02, bx0 - 0.2, bx1 + 0.2, 20.2, 20.6), 'rgba(8,10,12,.85)');
    path(x, wpts([[bx0, 22.2, bz], [bx1, 22.2, bz], [bx1 - 0.5, 20.8, bz], [bx0 + 0.5, 20.8, bz]])); x.fillStyle = 'rgb(96,62,44)'; x.fill();
    path(x, wpts([[bx0 + 0.3, 23.2, bz], [bx1 - 0.3, 23.2, bz], [bx1, 22.2, bz], [bx0, 22.2, bz]])); x.fillStyle = 'rgb(84,58,44)'; x.fill();
    wfill(x, faceZ(bz - 0.01, bx0 + 0.3, bx1 - 0.3, 23.12, 23.2), 'rgba(170,150,130,.45)');
    wfill(x, faceZ(bz - 0.01, bx0 + 0.6, bx1 - 0.6, 22.45, 22.8), 'rgba(20,20,22,.7)');
    [bx0 + 0.4, bx1 - 0.4].forEach((dx) => wseg(x, [dx, 25.0, z + 0.6], [dx, 23.2, bz], 0.22, '#262b31', 0.9));
    // труба за надстройкой и лёгкий выхлоп
    box(x, 25.6, 29.6, 34, 47.6, z + 12, z + 21, { f: '#2c3036', s: '#24282d' });
    wfill(x, faceZ(z + 11.98, 25.6, 29.6, 43.2, 44.8), '#40566a');
    wfill(x, faceZ(z + 11.98, 25.6, 29.6, 46.8, 47.6), '#14171b');
    for (let i = 0; i < 6; i++) {
      const p = P(27.6 + i * 2.6, 49 + i * 1.6, z + 16), r = 10 + i * 6;
      x.fillStyle = radial(x, p[0], p[1], r, [[0, 'rgba(120,124,130,' + (0.07 - i * 0.009) + ')'], [1, 'rgba(120,124,130,0)']]);
      x.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
    }
    // мачта с радарами
    wseg(x, [19, HOUSE.top, z + 12], [19, 50.5, z + 12], 0.35, '#262b31');
    wseg(x, [15.8, 47, z + 12], [22.2, 47, z + 12], 0.3, '#262b31');
    wseg(x, [16.6, 48.6, z + 10], [21.4, 48.6, z + 10], 0.45, '#30363c');
    wseg(x, [21.5, HOUSE.top, z + 6], [21.5, 46, z + 6], 0.12, '#262b31', 0.7);
    lamp(x, 19, 50.8, z + 12, 0.25, [236, 238, 240], 0.9);
    // палубные огни вдоль борта и прожекторы надстройки
    for (let lx = -48; lx < 40; lx += 17 + rr() * 8) lamp(x, lx, DECK + 1.4, z - 0.2, 0.22, rr() < 0.5 ? [240, 214, 170] : [220, 228, 238], 0.75);
    lamp(x, HOUSE.x0 - 0.3, 36.2, z + 1, 0.3, [240, 222, 186], 0.9);
    lamp(x, HOUSE.x1 + 0.3, 36.2, z + 1, 0.3, [240, 222, 186], 0.8);
    // свет кранов и надстройки на верхних ярусах — мягко, сложением, только по штабелям
    x.save();
    x.beginPath();
    BAYS.forEach((b) => wpts(faceZ(z + 1.6, b.x0, b.x1, DECK, DECK + 0.9 + 2.59 * Math.max(b.t[0], b.t[1]))).forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))));
    x.clip();
    x.globalCompositeOperation = 'lighter';
    CRANES.forEach((c) => {
      if (c.up) return;
      const p = P(c.x, DECK + 15, z + 2), rx = F * 13 / z, ry = F * 9 / z;
      x.save(); x.translate(p[0], p[1]); x.scale(1, ry / rx);
      x.fillStyle = radial(x, 0, 0, rx, [[0, 'rgba(120,132,150,.30)'], [0.5, 'rgba(90,100,118,.12)'], [1, 'rgba(80,90,110,0)']]);
      x.fillRect(-rx, -rx, rx * 2, rx * 2); x.restore();
    });
    const ph = P(8, DECK + 9, z + 2), rh = F * 9 / z;
    x.fillStyle = radial(x, ph[0], ph[1], rh, [[0, 'rgba(140,116,80,.22)'], [1, 'rgba(140,116,80,0)']]);
    x.fillRect(ph[0] - rh, ph[1] - rh, rh * 2, rh * 2);
    x.restore();
  }

  // ---------- Дальний план: судно, краны, вода ----------
  function drawFar(x) {
    CRANES.forEach((c) => crane(x, c, 'back'));
    drawShip(x);
    CRANES.forEach((c) => crane(x, c, 'front'));
  }

  // ---------- Вода между нашим причалом и бортом ----------
  // Зеркало дальнего плана относительно ватерлинии, разбитое рябью; огни дают дорожки бликов.
  function drawWater(x, C, src) {
    const s = C.s, y0 = waterY(ZS), y1 = py(0, ZQ) + 2, rw = Tex.rng(520);
    x.fillStyle = grad(x, 0, y0, 0, y1, [[0, '#10161d'], [1, '#05080c']]);
    x.fillRect(0, y0, W, y1 - y0);
    const hs = Math.max(1, 1 / s);
    for (let y = y0; y < y1; y += hs) {
      const d = y - y0, t = d / (y1 - y0);
      const ys = y0 - 1 - d * 1.15 - (rw() - 0.5) * (1 + t * 3);
      const dx = Math.sin(y * 0.9 + rw() * 0.8) * (0.6 + t * 3.2);
      x.globalAlpha = 0.5 - t * 0.28;
      x.drawImage(src, 0, Math.max(0, ys) * s, W * s, Math.max(1, hs * s), dx, y, W, hs);
    }
    x.globalAlpha = 1;
    // гребни ряби ловят засветку неба
    for (let i = 0; i < 260; i++) {
      const yy = y0 + Math.pow(rw(), 0.8) * (y1 - y0), t = (yy - y0) / (y1 - y0);
      x.fillStyle = 'rgba(120,134,150,' + (0.05 + rw() * 0.07) + ')';
      x.fillRect(rw() * W, yy, 6 + rw() * 30 * (0.4 + t), 0.8 + t * 0.6);
    }
    // дорожки бликов от огней судна и кранов
    LIGHTS.forEach((L) => {
      if (L.Z < 150) return;
      const lx = px(L.X, L.Z), n = Math.round((y1 - y0) / 2.2);
      for (let i = 0; i < n; i++) {
        const yy = y0 + 1 + i * 2.2 + rw() * 1.4, t = (yy - y0) / (y1 - y0);
        if (rw() < 0.25) continue;
        const w = (1.5 + rw() * 3.5) * (0.6 + t), a = L.k * (0.55 - t * 0.25) * (0.4 + rw() * 0.6);
        x.fillStyle = rgba(mixc(L.c, [255, 255, 255], 0.3), a.toFixed(3));
        x.fillRect(lx - w / 2 + (rw() - 0.5) * (1 + t * 4), yy, w, 1 + t);
      }
    });
    // редкие лунные искры у нашего берега
    for (let i = 0; i < 18; i++) {
      const yy = y1 - rw() * 12, w = 2 + rw() * 5;
      x.fillStyle = 'rgba(200,212,226,' + (0.12 + rw() * 0.2) + ')';
      x.fillRect(MOON.x - 10 + rw() * 20 - w / 2, yy, w, 1);
    }
  }

  // ---------- Земля ----------
  // Тайл асфальта 8 × 8 м: зерно fbm, щебёнка, заплаты, пятна масла и трещины кластерами.
  function asphaltTile(T, rr) {
    const N = Math.round(8 * T), nf = fbmField(rr, N, N, 6, 4), ng = fbmField(rr, N, N, 24, 2);
    const c = fieldCanvas(N, N, nf, (v, i, j) => {
      const k = 0.72 + v * 0.5 + (ng[j * N + i] - 0.5) * 0.35, sp = rr();
      const b = sp < 0.035 ? 1.45 : sp < 0.07 ? 0.7 : 1;
      return [44 * k * b, 46 * k * b, 50 * k * b, 255];
    });
    const g = c.getContext('2d'), m = 0.6 * T;
    // заплаты: прямоугольники свежего (более тёмного) асфальта со светлым швом
    for (let i = 0; i < 3; i++) {
      const w = (0.8 + rr() * 1.8) * T, h = (0.6 + rr() * 1.4) * T, x0 = m + rr() * (N - 2 * m - w), y0 = m + rr() * (N - 2 * m - h);
      g.fillStyle = 'rgba(8,10,12,.16)'; g.fillRect(x0, y0, w, h);
      g.strokeStyle = 'rgba(120,120,116,.14)'; g.lineWidth = Math.max(1, 0.04 * T); g.strokeRect(x0, y0, w, h);
    }
    // масляные пятна
    for (let i = 0; i < 4; i++) {
      const cx = m + rr() * (N - 2 * m), cy = m + rr() * (N - 2 * m), r = (0.2 + rr() * 0.5) * T;
      g.fillStyle = radial(g, cx, cy, r, [[0, 'rgba(6,6,8,.4)'], [1, 'rgba(6,6,8,0)']]); g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
    // трещины: ветвящиеся ломаные, тёмная сердцевина + светлая кромка
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let k = 0; k < 5; k++) {
      let cx = m + rr() * (N - 2 * m), cy = m + rr() * (N - 2 * m), a = rr() * 6.28;
      const pts = [[cx, cy]];
      for (let s = 0; s < 9; s++) {
        a += (rr() - 0.5) * 1.1; cx = clamp(cx + Math.cos(a) * 0.3 * T, 2, N - 2); cy = clamp(cy + Math.sin(a) * 0.3 * T, 2, N - 2);
        pts.push([cx, cy]);
      }
      [[Math.max(2, 0.07 * T), 'rgba(110,110,106,.18)'], [Math.max(1.4, 0.04 * T), 'rgba(4,5,6,.75)']].forEach((st) => {
        g.lineWidth = st[0]; g.strokeStyle = st[1]; g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
      });
    }
    return c;
  }
  // Мипы для пола: вглубь (по высоте тайла) сжатие сильнее — высота делится на каждом уровне, ширина через уровень
  function mipsV(c, n) {
    const out = [{ c: c, fx: 1, fy: 1 }];
    for (let k = 1; k < n; k++) {
      const p = out[k - 1].c, hx = k % 2 === 0;
      if (p.height < 4) break;
      const q = cv(hx ? p.width / 2 : p.width, p.height / 2), g = q.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(p, 0, 0, q.width, q.height);
      out.push({ c: q, fx: q.width / c.width, fy: q.height / c.height });
    }
    return out;
  }
  // Плоскость Y = 0 построчно: в строке экрана одна глубина Z, узор масштабируется как F / Z
  function floorTex(x, C, lv, T, yA, yB) {
    const pats = lv.map((L) => x.createPattern(L.c, 'repeat'));
    const st = C.step;
    for (let y = Math.floor(yA); y < yB; y += st) {
      const z = zRow(y + st / 2), dz = z * z / (F * EYE) * st;
      const k = clamp(Math.floor(Math.log2(Math.max(1, dz * T))), 0, lv.length - 1), L = lv[k];
      const a = F / (z * T * L.fx), ty = z * T * L.fy;
      pats[k].setTransform(new DOMMatrix([a, 0, 0, 1, VX + 3.3 * T * L.fx * a, y - ty]));
      x.fillStyle = pats[k]; x.fillRect(0, y, W, st);
    }
  }
  // Многоугольник в мире, обрезанный плоскостью Z = zmin (чтобы не уходить за камеру)
  function clipZ(pts, zmin) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ia = a[2] >= zmin, ib = b[2] >= zmin;
      if (ia) out.push(a);
      if (ia !== ib) { const t = (zmin - a[2]) / (b[2] - a[2]); out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), zmin]); }
    }
    return out;
  }
  // Круг / неровное пятно на полу (Y), r по X, rz по Z, wob — неровность края
  function wblob(cx, cz, r, rz, Y, wob, rr) {
    const n = 26, ph = rr ? rr() * 6 : 0, pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, k = 1 + wob * (Math.sin(a * 3 + ph) * 0.6 + Math.sin(a * 5 + ph * 2) * 0.4);
      pts.push([cx + Math.cos(a) * r * k, Y, cz + Math.sin(a) * rz * k]);
    }
    return pts;
  }
  function wpoly(x, pts) { path(x, wpts(pts)); }

  // Асфальт, тротуары, бордюры, площадка причала
  function drawGround(x, C) {
    const yq = py(0, ZQ), T = C.s < 0.5 ? 10 : 40;
    x.fillStyle = '#1c1f23'; x.fillRect(0, yq, W, H - yq);
    const lv = mipsV(asphaltTile(T, Tex.rng(701)), C.s < 0.5 ? 4 : 8);
    floorTex(x, C, lv, T, yq, H);
    // площадка причала: бетонные плиты светлее асфальта, дымка к воде
    wfill(x, faceY(0, -60, 60, 42.5, ZQ), 'rgba(92,94,96,.22)');
    for (let X = -60; X <= 60; X += 6) wseg(x, [X, 0, 42.5], [X, 0, ZQ], 0.03, 'rgba(0,0,0,.35)', 0.8);
    // проезжая часть чуть темнее и глаже, тротуары — светлые бетонные плиты
    wfill(x, faceY(0, -6, 6, 3, 42.5), 'rgba(10,12,16,.28)');
    [[-9, -6, 38.5], [6, 8, 42.5]].forEach((sw) => {
      wfill(x, faceY(0.15, sw[0], sw[1], 3, sw[2]), 'rgba(84,84,82,.42)');
      for (let z = 4; z < sw[2]; z += 1.5) wseg(x, [sw[0], 0.15, z], [sw[1], 0.15, z], 0.02, 'rgba(0,0,0,.4)', 0.8);
    });
    wseg(x, [-7.5, 0.15, 3], [-7.5, 0.15, 38.5], 0.02, 'rgba(0,0,0,.35)', 0.8);
    // бордюры: вертикальная грань в тени, светлая стёртая кромка
    [-6, 6].forEach((X) => {
      const z1 = X < 0 ? 38.5 : 42.5;
      wfill(x, faceX(X, 3, z1, 0, 0.15), '#2b2c2e');
      wseg(x, [X, 0.15, 3], [X, 0.15, z1], 0.05, 'rgba(150,150,144,.38)', 1);
      wseg(x, [X, 0.0, 3], [X, 0.0, z1], 0.06, 'rgba(0,0,0,.45)', 1);
    });
    // торцевые плиты у причала вдоль тротуара (поперёк улицы)
    wfill(x, faceZ(42.5, 6, 8, 0, 0.15), '#2b2c2e');
    // дымка к воде: асфальт вдали светлее
    x.fillStyle = grad(x, 0, yq, 0, yq + 90, [[0, 'rgba(46,52,60,.55)'], [1, 'rgba(46,52,60,0)']]);
    x.fillRect(0, yq, W, 90);
  }

  // Разметка, люки, решётка, крановые рельсы, кромка причала с отбойником
  function groundMarks(x, C) {
    const rm = Tex.rng(720), paint = (a) => 'rgba(176,166,124,' + a + ')';
    // осевая пунктирная (стёртая, с пропусками) и краевые линии
    for (let z = 4.5; z < 41; z += 9) {
      const a = (0.22 + rm() * 0.16).toFixed(2);
      wfill(x, faceY(0, -0.07, 0.07, z, z + 3), paint(a));
      if (rm() < 0.5) wfill(x, faceY(0, -0.07, 0.07, z + 0.6 + rm(), z + 1 + rm() * 0.6), 'rgba(30,32,36,.6)');
    }
    [-5.6, 5.6].forEach((X) => {
      for (let z = 3; z < 41; z += 2.5 + rm() * 3) wfill(x, faceY(0, X - 0.06, X + 0.06, z, z + 1.6 + rm() * 2), 'rgba(170,170,162,' + (0.12 + rm() * 0.1).toFixed(2) + ')');
    });
    // штриховка «стоянка запрещена» у разрыва штабелей
    const hz0 = 21.6, hz1 = 25.2;
    wpoly(x, faceY(0, 2.4, 5.6, hz0, hz1)); x.strokeStyle = paint(0.3); x.lineWidth = 1.6; x.stroke();
    x.save(); wpoly(x, faceY(0, 2.4, 5.6, hz0, hz1)); x.clip();
    for (let t = -4; t < 4; t += 0.7) wseg(x, [2.4 + t, 0, hz0], [2.4 + t + 3.6, 0, hz1], 0.12, paint(0.26), 1);
    x.restore();
    // жёлтая линия вдоль кромки причала и стоп-линия
    wfill(x, faceY(0, -60, 60, ZQ - 1.6, ZQ - 1.4), paint(0.42));
    wfill(x, faceY(0, -5.6, 0, 41.2, 41.6), 'rgba(170,170,162,.3)');
    // крановые рельсы: утопленные в бетон, сталь ловит свет
    [44.2, 47.6].forEach((z) => {
      wfill(x, faceY(0, -60, 60, z - 0.16, z + 0.16), 'rgba(6,7,9,.7)');
      wfill(x, faceY(0, -60, 60, z - 0.04, z + 0.04), 'rgba(150,156,164,.55)');
    });
    // кромка причала: бетонный бортик, тумбы
    wfill(x, faceZ(ZQ - 0.5, -60, 60, 0, 0.3), '#34363a');
    wfill(x, faceY(0.3, -60, 60, ZQ - 0.5, ZQ), '#4a4c4f');
    for (let X = -34; X < 40; X += 12.5) {
      box(x, X - 0.25, X + 0.25, 0.3, 0.75, ZQ - 0.42, ZQ - 0.02, { f: '#1d1f22', t: '#3a3c3f', s: '#17191b' });
      wfill(x, faceZ(ZQ - 0.43, X - 0.36, X + 0.36, 0.72, 0.84), '#24262a');
    }
    // люки и решётка ливнёвки
    [[-2.6, 15.5, 0.33], [1.9, 31, 0.3], [-1.2, 9.2, 0.33]].forEach((m) => {
      wpoly(x, wblob(m[0], m[1], m[2], m[2], 0, 0)); x.fillStyle = '#121418'; x.fill();
      x.strokeStyle = 'rgba(120,120,116,.35)'; x.lineWidth = Math.max(1, F * 0.04 / m[1]); x.stroke();
      wpoly(x, wblob(m[0], m[1], m[2] * 0.75, m[2] * 0.75, 0, 0)); x.strokeStyle = 'rgba(80,82,84,.5)'; x.stroke();
      for (let k = -2; k <= 2; k++) wseg(x, [m[0] - m[2] * 0.6, 0, m[1] + k * 0.1], [m[0] + m[2] * 0.6, 0, m[1] + k * 0.1], 0.02, 'rgba(70,72,76,.5)', 0.8);
    });
    [[5.45, 19.5], [-5.45, 27]].forEach((gq) => {
      wfill(x, faceY(0, gq[0] - 0.25, gq[0] + 0.25, gq[1], gq[1] + 0.9), '#0d0f12');
      for (let z = gq[1] + 0.08; z < gq[1] + 0.85; z += 0.12) wseg(x, [gq[0] - 0.22, 0, z], [gq[0] + 0.22, 0, z], 0.025, 'rgba(96,98,100,.6)', 0.8);
    });
  }

  // Лунные тени штабелей, столбов и мачты (одним контуром — без двойного наложения)
  function groundShadows(x) {
    x.beginPath();
    const add = (pts) => { const q = wpts(clipZ(pts, 3.2)); q.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); };
    BLOCKS.forEach((b) => {
      const h = Math.max(b.segs[0], b.segs[1]) * TH, X = b.x;
      add([[X, 0, b.z0], [X, 0, b.z1], [X + SHX * h, 0, b.z1 + SHZ * h], [X + SHX * h, 0, b.z0 + SHZ * h]]);
    });
    POLES.forEach((p) => add([[p.x - 0.14, 0, p.z], [p.x + 0.14, 0, p.z], [p.x + 0.14 + SHX * 9.6, 0, p.z + SHZ * 9.6], [p.x - 0.14 + SHX * 9.6, 0, p.z + SHZ * 9.6]]));
    add([[MAST.x - 0.3, 0, MAST.z], [MAST.x + 0.3, 0, MAST.z], [MAST.x + 0.1 + SHX * MAST.h, 0, MAST.z + SHZ * MAST.h], [MAST.x - 0.1 + SHX * MAST.h, 0, MAST.z + SHZ * MAST.h]]);
    x.fillStyle = 'rgba(0,0,0,.22)'; x.fill('nonzero');
  }

  // Лужи с отражением дальнего плана, световые пятна фонарей и дорожки бликов на мокром асфальте
  const PUDDLES = [[0.9, 6.9, 1.5, 0.55], [-3.4, 11.5, 1.3, 0.8], [3.3, 17.5, 1.6, 1.1], [-1.2, 24, 2.2, 1.2], [4.2, 33, 1.8, 1.4], [-3.8, 37, 2.4, 1.3], [1.0, 40, 1.6, 0.8]];
  function groundWet(x, C, far) {
    const rp = Tex.rng(740), ym = py(0, ZS), yq = py(0, ZQ);
    x.save(); x.beginPath();
    PUDDLES.forEach((p) => { const q = wpts(wblob(p[0], p[1], p[2], p[3], 0, 0.22, rp)); q.forEach((v, i) => (i ? x.lineTo(v[0], v[1]) : x.moveTo(v[0], v[1]))); x.closePath(); });
    x.clip();
    x.fillStyle = 'rgba(10,14,20,.6)'; x.fillRect(0, yq, W, H - yq);
    x.globalAlpha = 0.42; x.translate(0, 2 * ym); x.scale(1, -1); x.drawImage(far.c, 0, 0, W, H);
    x.restore();
    // световые пятна под фонарями (сложение, мягкий спад)
    x.save(); x.globalCompositeOperation = 'lighter';
    GLAMPS.forEach((L) => {
      const p = P(L.X, 0, L.Z), rx = F * L.r / L.Z, ry = F * EYE * L.r / (L.Z * L.Z);
      x.save(); x.translate(p[0], p[1]); x.scale(1, ry / rx);
      x.fillStyle = radial(x, 0, 0, rx, [[0, rgba(L.c, L.k)], [0.4, rgba(L.c, L.k * 0.45)], [1, rgba(L.c, 0)]]);
      x.fillRect(-rx, -rx, 2 * rx, 2 * rx); x.restore();
    });
    // блики на мокром асфальте: вертикальные рваные дорожки под зеркальной точкой огня
    const streak = (lx, y0, yr, w, col, k) => {
      const y1 = yr + (yr - y0) * 0.7, n = Math.max(3, Math.round((y1 - y0) / 14));
      // ровная сердцевина дорожки + рваные мазки поверх
      x.fillStyle = grad(x, 0, Math.max(y0, yq), 0, y1, [[0, rgba(col, 0)], [clamp((yr - Math.max(y0, yq)) / Math.max(1, y1 - Math.max(y0, yq)), 0, 1), rgba(col, k * 0.45)], [1, rgba(col, 0)]]);
      x.fillRect(lx - w * 0.3, Math.max(y0, yq), w * 0.6, y1 - Math.max(y0, yq));
      for (let i = 0; i < n; i++) {
        const yy = lerp(y0, y1, (i + rp()) / n);
        if (yy < yq || rp() < 0.3) continue;
        const d = Math.abs(yy - yr) / Math.max(1, (yy < yr ? yr - y0 : y1 - yr)), a = k * (1 - d) * (0.5 + rp() * 0.5);
        if (a <= 0.005) continue;
        const ww = w * (0.9 + rp() * 0.8);
        x.fillStyle = rgba(col, (a * 0.6).toFixed(3)); x.fillRect(lx - ww / 2 + (rp() - 0.5) * w * 0.6, yy, ww, 2 + rp() * 2);
      }
    };
    GLAMPS.forEach((L) => streak(px(L.X, L.Z), py(0, L.Z), py(-L.Y, L.Z), F * 0.5 / L.Z, mixc(L.c, [255, 255, 255], 0.2), 0.3));
    LIGHTS.forEach((L) => {
      if (L.Z < 150 || L.k < 0.8 || rp() < 0.6) return;
      const yr = 2 * ym - py(L.Y, L.Z);
      streak(px(L.X, L.Z), yr - 40 - rp() * 40, yr, 2 + rp() * 3, mixc(L.c, [255, 255, 255], 0.2), 0.1);
    });
    x.restore();
  }

  // ---------- Склад слева: развёртка фасада ----------
  // Фасад рисуется плоско (u — глубина Z, v — высота сверху вниз) на своём холсте, затем
  // переносится в перспективу вертикальными столбцами: у плоскости X = const каждый столбец
  // экрана — одна глубина Z, поэтому перенос точный. Выступы (пилястры, откосы окон)
  // нарисованы на развёртке со сдвигом, который они имели бы из этой единственной камеры.
  const PIL = [12, 18, 24, 30, 36];         // пилястры (передний край по Z)
  const FL = { g0: 0.9, g1: 4.2, band0: 4.4, band1: 5.4, w2: [5.9, 8.0], w3: [8.8, 10.6], fr: 10.9, cor: 11.7 };
  // Сдвиг по развёртке для точки, выступающей на d метров из стены, на глубине z
  const par = (z, d) => z * (-WALL_X) / (-WALL_X - d) - z;

  function brickTile(T, rr) {
    // 4 × 2 м кирпичной кладки, перевязка в полкирпича; цвет каждого кирпича свой
    const bw = 0.25 * T, bh = 0.078 * T, c = cv(4 * T, 2 * T), g = c.getContext('2d');
    g.fillStyle = '#1f1b1a'; g.fillRect(0, 0, c.width, c.height);
    const rows = Math.round(c.height / bh);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2, y = r * c.height / rows;
      for (let k = -1; k < c.width / bw + 1; k++) {
        const v = rr(), l = 0.78 + rr() * 0.32;
        let col = v < 0.06 ? [44, 30, 28] : v < 0.1 ? [80, 64, 52] : [72 * l, 48 * l, 42 * l];
        if (rr() < 0.05) col = mixc(col, [70, 70, 68], 0.5);
        g.fillStyle = rgba(col, 1);
        g.fillRect(k * bw + off + 0.5, y + 0.5, bw - 1, c.height / rows - 1);
      }
    }
    return c;
  }

  function facadeBase(T, rr) {
    const w = Math.round((WH_Z1 - WH_Z0) * T), h = Math.round(WH_H * T);
    const c = cv(w, h), g = c.getContext('2d');
    const U = (z) => (z - WH_Z0) * T, V = (y) => (WH_H - y) * T;
    g.fillStyle = g.createPattern(brickTile(T, rr), 'repeat'); g.fillRect(0, 0, w, h);
    // крупные пятна: копоть сверху, сырость снизу, высолы у цоколя
    // потёки и копоть — вытянуты по вертикали 1:4 (вода стекает вниз), а не круглые пятна
    const fw = Math.max(8, Math.round(w / 10)), fh = Math.max(3, Math.round(h / 40));
    const nf = fbmField(rr, fw, fh, 4, 3);
    g.imageSmoothingEnabled = true;
    g.drawImage(fieldCanvas(fw, fh, nf, (v, i, j) => [14, 12, 12, Math.round(clamp((v - 0.5) * 2.4, 0, 0.5) * 255)]), 0, 0, w, h);
    g.fillStyle = grad(g, 0, 0, 0, V(9), [[0, 'rgba(8,8,10,.55)'], [1, 'rgba(8,8,10,0)']]); g.fillRect(0, 0, w, V(9));
    g.fillStyle = grad(g, 0, V(2.2), 0, h, [[0, 'rgba(14,16,14,0)'], [1, 'rgba(14,16,14,.55)']]); g.fillRect(0, V(2.2), w, h - V(2.2));
    for (let i = 0; i < 22; i++) {
      const zz = WH_Z0 + rr() * (WH_Z1 - WH_Z0), yy = 0.9 + rr() * 1.4, r = (0.3 + rr() * 0.9) * T;
      g.fillStyle = radial(g, U(zz), V(yy), r, [[0, 'rgba(150,146,134,.08)'], [1, 'rgba(150,146,134,0)']]);
      g.fillRect(U(zz) - r, V(yy) - r, 2 * r, 2 * r);
    }
    // цоколь: грубый бетон с потёками
    g.fillStyle = '#34322f'; g.fillRect(0, V(FL.g0), w, h - V(FL.g0));
    for (let i = 0; i < w / 3; i++) { g.fillStyle = rr() < 0.5 ? 'rgba(0,0,0,.18)' : 'rgba(120,118,110,.10)'; g.fillRect(rr() * w, V(FL.g0) + rr() * FL.g0 * T, 1 + rr() * 3, 1 + rr() * 2); }
    g.fillStyle = 'rgba(160,156,146,.35)'; g.fillRect(0, V(FL.g0) - 0.06 * T, w, 0.05 * T);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, V(FL.g0), w, 0.06 * T);
    // поясок между первым и вторым этажом (полоса под надпись) и выступающие пояски кладки
    [FL.band0, FL.band1, FL.fr].forEach((y) => {
      g.fillStyle = 'rgba(150,120,100,.22)'; g.fillRect(0, V(y) - 0.05 * T, w, 0.05 * T);
      g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(0, V(y), w, 0.07 * T);
    });
    // аркатурный фриз: ряд малых арочек из кирпича под карнизом
    for (let z = WH_Z0 + 0.15; z < WH_Z1; z += 0.62) {
      const cx = U(z + 0.31), r = 0.25 * T, cy = V(FL.cor) + r * 0.2;
      g.fillStyle = 'rgba(10,8,8,.45)'; g.beginPath(); g.arc(cx, cy, r, Math.PI, 0); g.lineTo(cx + r, V(FL.fr + 0.25)); g.lineTo(cx - r, V(FL.fr + 0.25)); g.fill();
      g.strokeStyle = 'rgba(120,86,70,.5)'; g.lineWidth = Math.max(1, 0.05 * T); g.beginPath(); g.arc(cx, cy, r + 0.03 * T, Math.PI, 0); g.stroke();
    }
    // карниз: ступенчатые выступы, низ в тени
    g.fillStyle = '#3c2c27'; g.fillRect(0, V(WH_H), w, (WH_H - FL.cor) * T);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, V(FL.cor + 0.25), w, 0.25 * T);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, V(FL.cor + 0.55), w, 0.12 * T);
    g.fillStyle = 'rgba(150,160,176,.18)'; g.fillRect(0, 0, w, 0.08 * T);
    return { c: c, g: g, U: U, V: V, T: T };
  }

  // Детали фасада на развёртке: пилястры, стальные окна, ворота, дверь, вывеска, водостоки
  const WINS = [];     // освещённые стёкла: дорисовываются после затемнения
  function facadeDetails(fb, rr) {
    const g = fb.g, U = fb.U, V = fb.V, T = fb.T, h = fb.c.height;
    const ds = (a) => 'rgba(0,0,0,' + a + ')';
    // пилястры: лицо сдвинуто на par(), видимый боковой откос (смотрит на камеру) — в тени
    PIL.forEach((z) => {
      const sh = par(z, 0.3);
      g.fillStyle = ds(0.42); g.fillRect(U(z), V(FL.fr), sh * T, V(FL.g0) - V(FL.fr));
      g.fillStyle = 'rgba(120,96,84,.12)'; g.fillRect(U(z + sh), V(FL.fr), 0.9 * T, V(FL.g0) - V(FL.fr));
      g.fillStyle = 'rgba(150,140,130,.16)'; g.fillRect(U(z + sh + 0.9) - 0.04 * T, V(FL.fr), 0.04 * T, V(FL.g0) - V(FL.fr));
    });
    // окна второго и третьего этажа — по одному широкому стальному окну в пролёте
    const bays = [[12.9, 18], [18.9, 24], [24.9, 30], [30.9, 36]];
    bays.forEach((bz) => [FL.w2, FL.w3].forEach((wy, row) => {
      const z0 = bz[0] + 0.55, z1 = bz[1] - 0.5, nx = 6, ny = row ? 3 : 4;
      g.fillStyle = 'rgba(48,40,36,.9)'; g.fillRect(U(z0) - 0.12 * T, V(wy[1]) - 0.2 * T, (z1 - z0 + 0.24) * T, 0.2 * T);    // перемычка
      g.fillStyle = '#5a5650'; g.fillRect(U(z0) - 0.1 * T, V(wy[0]), (z1 - z0 + 0.2) * T, 0.1 * T);                          // подоконник
      g.fillStyle = ds(0.5); g.fillRect(U(z0) - 0.1 * T, V(wy[0]) + 0.1 * T, (z1 - z0 + 0.2) * T, 0.08 * T);
      g.fillStyle = '#0d1014'; g.fillRect(U(z0), V(wy[1]), (z1 - z0) * T, (wy[1] - wy[0]) * T);
      // откос: проём в глубину стены, сторона к камере видна
      g.fillStyle = 'rgba(36,30,28,1)'; g.fillRect(U(z1) + par(z1, -0.25) * T, V(wy[1]), par(z1, -0.25) * -T, (wy[1] - wy[0]) * T);
      const pw = (z1 - z0) / nx, ph = (wy[1] - wy[0]) / ny;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const r = rr(), u = U(z0 + i * pw), v = V(wy[1] - j * ph);
        g.fillStyle = r < 0.07 ? '#1a1612' : 'rgba(' + (24 + rr() * 14 | 0) + ',' + (30 + rr() * 12 | 0) + ',' + (38 + rr() * 12 | 0) + ',1)';
        g.fillRect(u + 0.04 * T, v + 0.04 * T, pw * T - 0.08 * T, ph * T - 0.08 * T);
        if (r > 0.9) WINS.push([u + 0.04 * T, v + 0.04 * T, pw * T - 0.08 * T, ph * T - 0.08 * T]);
      }
      // переплёт
      g.fillStyle = 'rgba(64,64,62,.95)';
      for (let i = 0; i <= nx; i++) g.fillRect(U(z0 + i * pw) - 0.03 * T, V(wy[1]), 0.06 * T, (wy[1] - wy[0]) * T);
      for (let j = 0; j <= ny; j++) g.fillRect(U(z0), V(wy[1] - j * ph) - 0.03 * T, (z1 - z0) * T, 0.06 * T);
    }));
    // первый этаж: высокие зарешеченные окна в крайних пролётах
    [[13.5, 16.8], [25.6, 28.8]].forEach((bz) => {
      g.fillStyle = '#0c0e12'; g.fillRect(U(bz[0]), V(3.9), (bz[1] - bz[0]) * T, 1.2 * T);
      g.fillStyle = '#5a5650'; g.fillRect(U(bz[0]) - 0.08 * T, V(2.7), (bz[1] - bz[0] + 0.16) * T, 0.08 * T);
      g.fillStyle = 'rgba(70,72,74,.9)';
      for (let z = bz[0] + 0.15; z < bz[1]; z += 0.22) g.fillRect(U(z), V(3.9), Math.max(1, 0.03 * T), 1.2 * T);
    });
    // рулонные ворота с погрузочной рампой
    const gz0 = 19.6, gz1 = 23.4;
    g.fillStyle = '#2a2c2e'; g.fillRect(U(gz0) - 0.2 * T, V(4.15), (gz1 - gz0 + 0.4) * T, (4.15 - 0.95) * T);
    for (let y = 1.0; y < 3.9; y += 0.11) { g.fillStyle = ds(0.32); g.fillRect(U(gz0), V(y), (gz1 - gz0) * T, Math.max(1, 0.025 * T)); g.fillStyle = 'rgba(140,140,136,.1)'; g.fillRect(U(gz0), V(y) - 0.03 * T, (gz1 - gz0) * T, Math.max(1, 0.02 * T)); }
    g.fillStyle = '#3a3c3e'; g.fillRect(U(gz0) - 0.2 * T, V(4.15), (gz1 - gz0 + 0.4) * T, 0.25 * T);
    g.fillStyle = '#4a4744'; g.fillRect(U(gz0) - 0.6 * T, V(0.95), (gz1 - gz0 + 1.2) * T, 0.95 * T);       // рампа
    g.fillStyle = ds(0.5); g.fillRect(U(gz0) - 0.6 * T, V(0.95), (gz1 - gz0 + 1.2) * T, 0.05 * T);
    g.fillStyle = '#121212'; [gz0 + 0.3, gz1 - 0.6].forEach((z) => g.fillRect(U(z), V(0.85), 0.3 * T, 0.55 * T));   // отбойники
    // стальная дверь со ступенью и табличкой
    g.fillStyle = '#33383a'; g.fillRect(U(32.6), V(2.6), 1.1 * T, 1.7 * T);
    g.fillStyle = ds(0.45); g.fillRect(U(32.6), V(2.6), 0.08 * T, 1.7 * T);
    g.fillStyle = 'rgba(160,156,140,.6)'; g.fillRect(U(33.5), V(1.8), 0.1 * T, 0.04 * T);
    g.fillStyle = '#4c4a46'; g.fillRect(U(32.4), V(0.95), 1.5 * T, 0.12 * T);
    g.fillStyle = '#7a7466'; g.fillRect(U(33.9), V(2.4), 0.5 * T, 0.32 * T);
    return { bays: bays, gz0: gz0, gz1: gz1 };
  }
  // Вывеска, водостоки, отбитая штукатурка, затемнение, затем — огни (окна, бра над воротами)
  function facadeFinish(fb, info, rr) {
    const g = fb.g, U = fb.U, V = fb.V, T = fb.T, w = fb.c.width, h = fb.c.height;
    // остатки штукатурки с проступающим кирпичом
    [[27.5, 9.4, 1.6, 0.9], [35.4, 4.6, 1.2, 1.6]].forEach((p) => {
      g.fillStyle = 'rgba(96,92,86,.5)'; g.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * 6.28, k = 0.7 + rr() * 0.5;
        const xx = U(p[0]) + Math.cos(a) * p[2] / 2 * T * k, yy = V(p[1]) + Math.sin(a) * p[3] / 2 * T * k;
        i ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
      }
      g.closePath(); g.fill();
    });
    // вывеска на пояске: тёмная крашеная полоса и блёклые буквы
    g.fillStyle = 'rgba(30,36,40,.85)'; g.fillRect(U(19.2), V(5.35), 4.6 * T, 0.9 * T);
    g.strokeStyle = 'rgba(150,146,130,.35)'; g.lineWidth = Math.max(1, 0.04 * T); g.strokeRect(U(19.25), V(5.3), 4.5 * T, 0.8 * T);
    g.fillStyle = 'rgba(196,190,166,.7)'; g.font = 'bold ' + Math.round(0.58 * T) + 'px sans-serif';
    g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('СКЛАД 3', U(21.5), V(4.9)); g.textAlign = 'left';
    // водостоки с хомутами и отводом у земли
    [12.3, 24.3, 36.3].forEach((z) => {
      g.fillStyle = '#2a2c2e'; g.fillRect(U(z), V(FL.cor), 0.14 * T, (FL.cor - 0.25) * T);
      g.fillStyle = 'rgba(150,150,150,.18)'; g.fillRect(U(z) + 0.02 * T, V(FL.cor), 0.03 * T, (FL.cor - 0.25) * T);
      for (let y = 1.5; y < FL.cor; y += 1.8) { g.fillStyle = '#18191a'; g.fillRect(U(z) - 0.04 * T, V(y), 0.22 * T, 0.06 * T); }
      g.fillStyle = '#2a2c2e'; g.fillRect(U(z) - 0.25 * T, V(0.25), 0.4 * T, 0.12 * T);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(U(z) + 0.14 * T, V(FL.cor), 0.05 * T, (FL.cor - 0.25) * T);
    });
    // ночь: затемнение и холодный оттенок; у камеры (меньше Z) — темнее
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = grad(g, 0, 0, w, 0, [[0, 'rgb(104,106,120)'], [1, 'rgb(132,134,148)']]); g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    // лунный свет скользит по стене сверху
    g.fillStyle = grad(g, 0, 0, 0, V(6), [[0, 'rgba(120,134,160,.10)'], [1, 'rgba(120,134,160,0)']]); g.fillRect(0, 0, w, V(6));
    // освещённые стёкла: тёплые, неровные; отсвет только на раме и подоконнике
    WINS.forEach((q) => {
      g.fillStyle = grad(g, 0, q[1], 0, q[1] + q[3], [[0, 'rgba(130,106,74,.8)'], [1, 'rgba(176,142,94,.85)']]); g.fillRect(q[0], q[1], q[2], q[3]);
      g.fillStyle = 'rgba(214,180,120,.18)'; g.fillRect(q[0] - 0.06 * T, q[1] + q[3], q[2] + 0.12 * T, 0.08 * T);
    });
    // бра над воротами: корпус и конус света на воротах
    const lz = (info.gz0 + info.gz1) / 2;
    g.globalCompositeOperation = 'lighter';
    g.save(); g.translate(U(lz), V(4.45)); g.scale(1, 1.4);
    g.fillStyle = radial(g, 0, 0, 2.6 * T, [[0, 'rgba(120,96,64,.4)'], [0.35, 'rgba(90,72,50,.16)'], [1, 'rgba(90,70,50,0)']]);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-2.6 * T, 2.6 * T); g.lineTo(2.6 * T, 2.6 * T); g.closePath(); g.fill(); g.restore();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#1a1b1c'; g.fillRect(U(lz) - 0.25 * T, V(4.62), 0.5 * T, 0.16 * T);
    g.fillStyle = 'rgba(255,226,170,.95)'; g.fillRect(U(lz) - 0.18 * T, V(4.46), 0.36 * T, 0.05 * T);
  }

  // Мип-уровни развёртки для стены вдоль улицы: вглубь (по ширине) сжатие сильнее, чем по высоте,
  // поэтому ширина делится на каждом уровне, высота — через уровень. fx, fy — масштаб к уровню 0.
  function mipsH(c, n) {
    const out = [{ c: c, fx: 1, fy: 1 }];
    for (let k = 1; k < n; k++) {
      const p = out[k - 1].c, hy = k % 2 === 0;
      if (p.width < 8) break;
      const q = cv(p.width / 2, hy ? p.height / 2 : p.height), g = q.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(p, 0, 0, q.width, q.height);
      out.push({ c: q, fx: q.width / c.width, fy: q.height / c.height });
    }
    return out;
  }
  // Перенос развёртки на плоскость X = const: столбец экрана = одна глубина Z.
  // [z0, z1] — видимый участок, uz — глубина левого края развёртки, [yBot, yTop] — высоты её краёв.
  function wallX(x, C, X, z0, z1, yBot, yTop, lv, T, uz) {
    const st = C.step, a = px(X, z0), b = px(X, z1);
    const s0 = Math.max(0, Math.min(a, b)), s1 = Math.min(W, Math.max(a, b));
    if (uz === undefined) uz = z0;
    x.imageSmoothingEnabled = true;
    for (let sx = Math.floor(s0 / st) * st; sx < s1; sx += st) {
      const xa = Math.max(sx, s0), xb = Math.min(sx + st, s1);
      if (xb - xa < 0.01) continue;
      let za = F * X / (xa - VX), zb = F * X / (xb - VX);
      if (za > zb) { const t = za; za = zb; zb = t; }
      za = Math.max(za, z0); zb = Math.min(zb, z1);
      if (zb <= za) continue;
      const zm = (za + zb) / 2, r = (zb - za) * T / ((xb - xa) * C.s);
      const k = clamp(Math.floor(Math.log2(Math.max(1, r))), 0, lv.length - 1), L = lv[k];
      const ya = py(yTop, zm), yb = py(yBot, zm);
      x.drawImage(L.c, (za - uz) * T * L.fx, 0, Math.max(0.02, (zb - za) * T * L.fx), L.c.height, xa, ya, xb - xa, yb - ya);
    }
  }

  // ---------- Склад: сборка и перенос в перспективу ----------
  function drawWarehouse(x, C) {
    const T = C.s < 0.5 ? 24 : 96, rr = Tex.rng(610);
    const fb = facadeBase(T, rr);
    WINS.length = 0;
    facadeFinish(fb, facadeDetails(fb, rr), rr);
    const lv = mipsH(fb.c, C.s < 0.5 ? 3 : 5);
    wallX(x, C, WALL_X, WH_Z0, WH_Z1, 0, WH_H, lv, T);
    // карниз выступает на 0.45 м: низ виден снизу, лицо — отдельной полосой
    const CX = WALL_X + 0.45;
    wfill(x, [[WALL_X, FL.cor, WH_Z0], [CX, FL.cor, WH_Z0], [CX, FL.cor, WH_Z1], [WALL_X, FL.cor, WH_Z1]], '#120f10');
    wfill(x, faceX(CX, WH_Z0, WH_Z1, FL.cor, WH_H), '#2a201d');
    wfill(x, faceZ(WH_Z1, WALL_X - 0.4, CX, FL.cor, WH_H), '#1c1615');
  }

  // ---------- Диспетчерская за складом: бетонные панели, окно с огнём, дверь со ступенью ----------
  function drawAnnex(x) {
    const X = AN_X, z0 = WH_Z1, z1 = AN_Z1;
    path(x, wpts(faceX(X, z0, z1, 0, AN_H)));
    x.fillStyle = grad(x, 0, py(AN_H, z0), 0, py(0, z0), [[0, '#30343a'], [1, '#202326']]); x.fill();
    for (let y = 1.2; y < AN_H; y += 1.2) wseg(x, [X, y, z0], [X, y, z1], 0.02, 'rgba(0,0,0,.4)', 0.8);
    for (let z = z0 + 3; z < z1; z += 3) wseg(x, [X, 0, z], [X, AN_H, z], 0.02, 'rgba(0,0,0,.35)', 0.8);
    // парапет и потёки под ним
    wfill(x, faceX(X + 0.02, z0, z1, AN_H - 0.4, AN_H), '#16181b');
    wfill(x, faceX(X + 0.02, z0, z1, AN_H - 0.42, AN_H - 0.38), 'rgba(140,146,156,.3)');
    // окно с тёплым светом и жалюзи
    wfill(x, faceX(X + 0.02, 39.6, 42.2, 3.2, 4.9), '#0b0d10');
    wfill(x, faceX(X + 0.03, 39.75, 42.05, 3.35, 4.75), 'rgba(178,146,98,.85)');
    for (let y = 3.5; y < 4.75; y += 0.16) wseg(x, [X + 0.04, y, 39.75], [X + 0.04, y, 42.05], 0.025, 'rgba(60,46,30,.6)', 0.8);
    wseg(x, [X + 0.04, 3.35, 40.9], [X + 0.04, 4.75, 40.9], 0.05, '#15171a', 1);
    wfill(x, faceX(X + 0.05, 39.5, 42.3, 3.1, 3.2), '#55585a');
    // дверь, козырёк, ступень, лампа над дверью
    wfill(x, faceX(X + 0.02, 43.4, 44.5, 0.2, 2.35), '#262b2f');
    wseg(x, [X + 0.05, 1.15, 44.3], [X + 0.05, 1.15, 44.42], 0.06, 'rgba(170,166,150,.7)', 1);
    box(x, X, X + 0.6, 2.5, 2.6, 43.2, 44.7, { b: '#101113', s: '#2a2c2e' });
    box(x, X, X + 0.45, 0, 0.2, 43.2, 44.7, { t: '#4a4a48', s: '#38383a', f: '#3a3a3a' });
    wfill(x, faceY(2.49, X + 0.05, X + 0.2, 43.85, 44.05), 'rgba(250,226,180,.95)');
    // кондиционер и кабель по стене
    box(x, X, X + 0.55, 5.3, 6.0, 38.9, 39.8, { f: '#5a5e60', s: '#45494b', b: '#2a2c2e' });
    wseg(x, [X + 0.05, 5.3, 39.3], [X + 0.05, 0.4, 39.3], 0.03, '#141517', 1);
    // световое пятно от лампы у двери на тротуаре
    const p = P(X + 1.2, 0, 44), rx = F * 2.2 / 44;
    x.save(); x.globalCompositeOperation = 'lighter'; x.translate(p[0], p[1]); x.scale(1, 0.12);
    x.fillStyle = radial(x, 0, 0, rx, [[0, 'rgba(160,136,96,.3)'], [1, 'rgba(160,136,96,0)']]); x.fillRect(-rx, -rx, 2 * rx, 2 * rx);
    x.restore();
  }

  // ---------- Контейнеры справа ----------
  const TH = 2.59;   // высота яруса
  const CID = ['TGHU', 'MSKU', 'CAXU', 'TRLU', 'GESU', 'SEGU', 'BMOU', 'FCIU'];
  const cid = (rr) => CID[Math.floor(rr() * CID.length)] + ' ' + String(100000 + Math.floor(rr() * 899999)) + ' ' + Math.floor(rr() * 10);
  // Боковина контейнера на развёртке: (x0, y0) — левый верх, w × h пикселей, T — пикселей на метр
  function contSide(g, x0, y0, w, h, T, col, rr) {
    const dk = (k) => rgba(mixc(col, [0, 0, 0], k), 1), lt = (k) => rgba(mixc(col, [200, 200, 196], k), 1);
    g.fillStyle = rgba(col, 1); g.fillRect(x0, y0, w, h);
    // гофра: пары тёмная/светлая грань через 0.28 м
    const p = 0.28 * T;
    for (let u = x0 + 0.2 * T; u < x0 + w - 0.2 * T; u += p) {
      g.fillStyle = dk(0.28); g.fillRect(u, y0, Math.max(1, p * 0.32), h);
      g.fillStyle = lt(0.1); g.fillRect(u + p * 0.32, y0, Math.max(1, p * 0.14), h);
    }
    // верхняя и нижняя балки, угловые стойки с фитингами
    g.fillStyle = dk(0.4); g.fillRect(x0, y0, w, 0.12 * T); g.fillRect(x0, y0 + h - 0.16 * T, w, 0.16 * T);
    g.fillStyle = lt(0.08); g.fillRect(x0, y0 + 0.12 * T, w, Math.max(1, 0.03 * T));
    g.fillStyle = dk(0.5); g.fillRect(x0, y0, 0.16 * T, h); g.fillRect(x0 + w - 0.16 * T, y0, 0.16 * T, h);
    g.fillStyle = 'rgba(16,16,18,.9)';
    [[x0, y0], [x0 + w - 0.18 * T, y0], [x0, y0 + h - 0.12 * T], [x0 + w - 0.18 * T, y0 + h - 0.12 * T]].forEach((q) => g.fillRect(q[0], q[1], 0.18 * T, 0.12 * T));
    // потёки ржавчины от верхней балки и от фитингов
    const nr = 2 + Math.floor(rr() * 5);
    for (let i = 0; i < nr; i++) {
      const u = x0 + rr() * w, l = (0.4 + rr() * 1.6) * T, ww = (0.04 + rr() * 0.12) * T;
      g.fillStyle = grad(g, 0, y0, 0, y0 + l, [[0, 'rgba(96,52,30,.55)'], [1, 'rgba(96,52,30,0)']]); g.fillRect(u, y0, ww, l);
    }
    // вмятина и пятна краски другого оттенка (перекраска)
    if (rr() < 0.5) {
      const u = x0 + (0.2 + rr() * 0.6) * w, v = y0 + (0.3 + rr() * 0.4) * h, r = (0.3 + rr() * 0.4) * T;
      g.fillStyle = radial(g, u, v, r, [[0, 'rgba(0,0,0,.3)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(u - r, v - r, 2 * r, 2 * r);
    }
    if (rr() < 0.35) { g.fillStyle = rgba(mixc(col, [90, 90, 88], 0.4), 0.7); g.fillRect(x0 + rr() * w * 0.7, y0 + 0.4 * T, (0.6 + rr()) * T, (0.5 + rr() * 0.8) * T); }
    // трафаретный номер — блёклой краской. Правая стена развёрнута по Z, а на экране Z растёт влево,
    // поэтому текст пишем зеркально — на экране он читается нормально.
    g.save(); g.translate(x0 + 3.6 * T, y0); g.scale(-1, 1);
    g.fillStyle = 'rgba(214,212,200,.45)'; g.font = 'bold ' + Math.round(0.24 * T) + 'px monospace'; g.textBaseline = 'top';
    g.fillText(cid(rr), 0, 0.3 * T);
    g.font = 'bold ' + Math.round(0.18 * T) + 'px monospace'; g.fillText(rr() < 0.5 ? '45G1' : '22G1', 0, 0.6 * T);
    g.restore();
  }
  // Торец с дверями (смотрит на камеру): петли, 4 запорные штанги, ручки, номер
  function contDoors(g, x0, y0, w, h, T, col, rr, mark) {
    const dk = (k) => rgba(mixc(col, [0, 0, 0], k), 1);
    g.fillStyle = rgba(mixc(col, [0, 0, 0], 0.08), 1); g.fillRect(x0, y0, w, h);
    g.fillStyle = dk(0.55); g.fillRect(x0, y0, 0.14 * T, h); g.fillRect(x0 + w - 0.14 * T, y0, 0.14 * T, h);
    g.fillRect(x0, y0, w, 0.18 * T); g.fillRect(x0, y0 + h - 0.2 * T, w, 0.2 * T);
    g.fillStyle = dk(0.4); g.fillRect(x0 + w / 2 - 0.02 * T, y0, Math.max(1, 0.04 * T), h);
    // панели дверей: горизонтальная гофра
    for (let v = y0 + 0.4 * T; v < y0 + h - 0.4 * T; v += 0.34 * T) { g.fillStyle = dk(0.22); g.fillRect(x0 + 0.2 * T, v, w - 0.4 * T, Math.max(1, 0.09 * T)); }
    // штанги, кронштейны и ручки
    [0.17, 0.36, 0.64, 0.83].forEach((f, i) => {
      const u = x0 + w * f;
      g.fillStyle = 'rgba(150,150,140,.75)'; g.fillRect(u - 0.025 * T, y0 + 0.15 * T, Math.max(1.2, 0.05 * T), h - 0.3 * T);
      g.fillStyle = 'rgba(20,20,20,.8)';
      [0.3, 0.75, 1.6, 2.1].forEach((yy) => g.fillRect(u - 0.06 * T, y0 + yy * T, 0.12 * T, 0.06 * T));
      g.fillStyle = 'rgba(170,166,150,.7)'; g.fillRect(u + (i % 2 ? -0.32 : 0.02) * T, y0 + 1.2 * T, 0.3 * T, Math.max(1, 0.05 * T));
    });
    // петли
    g.fillStyle = 'rgba(12,12,14,.9)';
    [0.4, 1.0, 1.6, 2.2].forEach((yy) => { g.fillRect(x0 + 0.1 * T, y0 + yy * T, 0.1 * T, 0.12 * T); g.fillRect(x0 + w - 0.2 * T, y0 + yy * T, 0.1 * T, 0.12 * T); });
    g.fillStyle = 'rgba(214,212,200,.45)'; g.font = 'bold ' + Math.round(0.15 * T) + 'px monospace'; g.textBaseline = 'top';
    g.fillText(cid(rr), x0 + w * 0.56, y0 + 0.28 * T);
    // потёки ржавчины
    for (let i = 0; i < 3; i++) {
      const u = x0 + rr() * w, l = (0.3 + rr() * 1.2) * T;
      g.fillStyle = grad(g, 0, y0, 0, y0 + l, [[0, 'rgba(96,52,30,.5)'], [1, 'rgba(96,52,30,0)']]); g.fillRect(u, y0, 0.06 * T, l);
    }
    if (mark) {
      // маркер ряда на штабеле
      g.fillStyle = 'rgba(20,20,22,.55)'; g.fillRect(x0 + w * 0.2, y0 + h * 0.34, w * 0.6, h * 0.36);
      g.fillStyle = 'rgba(206,200,170,.62)'; g.font = 'bold ' + Math.round(0.85 * T) + 'px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(mark, x0 + w / 2, y0 + h * 0.52); g.textAlign = 'left';
    }
  }
  // Ночная палитра контейнеров: приглушённые, без чистых красного/синего
  const KPAL = [[112, 58, 48], [58, 76, 96], [92, 96, 98], [62, 84, 68], [124, 112, 92], [138, 140, 136], [92, 52, 54], [66, 94, 100], [122, 88, 58], [118, 108, 70]];
  // Карта освещения грани: база — ночной полумрак, пятна — фонари; накладывается умножением
  function lightMap(w, h, spots) {
    const c = cv(Math.max(4, w / 6), Math.max(4, h / 6)), g = c.getContext('2d'), k = c.width / w;
    g.fillStyle = 'rgb(78,82,96)'; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'lighter';
    spots.forEach((s) => {
      g.save(); g.translate(s.u * k, s.v * k); g.scale(1, s.ry / s.rx);
      g.fillStyle = radial(g, 0, 0, s.rx * k, [[0, rgba(s.c, s.a)], [0.45, rgba(s.c, s.a * 0.45)], [1, rgba(s.c, 0)]]);
      g.fillRect(-s.rx * k, -s.rx * k, 2 * s.rx * k, 2 * s.rx * k); g.restore();
    });
    return c;
  }
  // Штабель: развёртка боковой грани (X = b.x) со всеми ярусами, дыры на месте снятых контейнеров
  function blockSide(b, T, rr) {
    const L = b.z1 - b.z0, half = (L - 0.08) / 2, nmax = Math.max(b.segs[0], b.segs[1]);
    const w = Math.round(L * T), h = Math.round(nmax * TH * T), c = cv(w, h), g = c.getContext('2d');
    const pick = () => KPAL[Math.floor(rr() * KPAL.length)];
    for (let t = 0; t < nmax; t++) {
      const y0 = (nmax - 1 - t) * TH * T, both = t < b.segs[0] && t < b.segs[1];
      g.fillStyle = '#0b0c0e'; g.fillRect(0, y0, w, TH * T);
      if (both && rr() < 0.5) contSide(g, 0, y0, w, TH * T, T, pick(), rr);
      else [0, 1].forEach((i) => { if (t < b.segs[i]) contSide(g, i * (half + 0.08) * T, y0, half * T, TH * T, T, pick(), rr); });
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, y0 + TH * T - Math.max(1, 0.03 * T), w, Math.max(1, 0.03 * T));
    }
    // свет фонарей: столбы со стороны дороги, пятно на высоте ~4 м
    const spots = POLES.map((p, i) => ({ u: (p.z - b.z0) * T, v: h - 4.2 * T, rx: 6.5 * T, ry: 5 * T, c: PCOL[i], a: 0.62 }));
    g.globalCompositeOperation = 'multiply'; g.imageSmoothingEnabled = true;
    g.drawImage(lightMap(w, h, spots), 0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    // затенение у земли
    g.fillStyle = grad(g, 0, h - 0.6 * T, 0, h, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.55)']]); g.fillRect(0, h - 0.6 * T, w, 0.6 * T);
    // дыры: снятые контейнеры
    [0, 1].forEach((i) => { if (b.segs[i] < nmax) g.clearRect(i * (half + 0.04) * T, 0, (half + 0.04) * T, (nmax - b.segs[i]) * TH * T); });
    return c;
  }
  // Ряд торцов одного яруса (4 контейнера поперёк штабеля), свет — слева, со стороны дороги
  function endRow(T, rr, lit, mark) {
    const w = Math.round(9.8 * T), h = Math.round(TH * T), c = cv(w, h), g = c.getContext('2d'), cw = 2.44 * T;
    g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) contDoors(g, i * (cw + 0.013 * T), 0, cw, h - 1, T, KPAL[Math.floor(rr() * KPAL.length)], rr, i === 1 ? mark : null);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = grad(g, 0, 0, w, 0, [[0, rgba(mixc([84, 88, 100], [220, 186, 136], lit), 1)], [0.5, 'rgb(80,84,96)'], [1, 'rgb(60,64,74)']]);
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    return c;
  }
  function drawContainers(x, C) {
    const T = C.s < 0.5 ? 16 : 64;
    BLOCKS.slice().reverse().forEach((b) => {
      const rr = Tex.rng(800 + b.seed), X = b.x, nmax = Math.max(b.segs[0], b.segs[1]), half = (b.z1 - b.z0 - 0.08) / 2;
      wallX(x, C, X, b.z0, b.z1, 0, nmax * TH, mipsH(blockSide(b, T, rr), C.s < 0.5 ? 3 : 5), T);
      // торцы: передний сегмент целиком, задний — только ярусы выше переднего
      const lit = b.z0 > POLES[0].z ? 0.6 : 0.15;
      const ends = [];
      for (let t = 0; t < b.segs[0]; t++) ends.push([b.z0, t]);
      for (let t = b.segs[0]; t < b.segs[1]; t++) ends.push([b.z0 + half + 0.08, t]);
      ends.forEach((e) => {
        const p0 = P(X, (e[1] + 1) * TH, e[0]), p1 = P(X + 9.8, e[1] * TH, e[0]);
        if (p0[0] > W) return;
        x.drawImage(endRow(T, rr, lit, e[1] === 1 ? b.mark : null), p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]);
      });
    });
  }

  // ---------- Столбы, фонари, провода ----------
  // Сужающаяся труба (столб) с цилиндрической светотенью: свет луны справа-спереди
  function shaft(x, X, Z, y0, y1, r0, r1) {
    const a = P(X - r0, y0, Z), b = P(X + r0, y0, Z), c = P(X + r1, y1, Z), d = P(X - r1, y1, Z);
    path(x, [a, b, c, d]);
    x.fillStyle = grad(x, a[0], 0, b[0], 0, [[0, '#1a1c1f'], [0.55, '#33373b'], [0.8, '#4c5155'], [1, '#2a2d30']]); x.fill();
  }
  function drawPole(x, p, i) {
    const z = p.z, led = i === 1;
    box(x, p.x - 0.22, p.x + 0.22, 0.15, 0.6, z - 0.22, z + 0.22, { f: '#24272a', s: '#1c1e21', t: '#34383b' });
    shaft(x, p.x, z, 0.6, 9.9, 0.13, 0.07);
    wfill(x, faceZ(z - 0.13, p.x - 0.06, p.x + 0.06, 1.1, 1.6), '#15171a');          // лючок
    wfill(x, faceZ(z - 0.12, p.x - 0.1, p.x + 0.1, 2.8, 3.0), 'rgba(170,160,120,.35)'); // номерная полоса
    // кронштейн: подъём и вылет к голове
    wseg(x, [p.x, 9.3, z], [p.x - 0.8, 9.75, z], 0.07, '#25282b', 1.2);
    wseg(x, [p.x - 0.8, 9.75, z], [p.hx + 0.4, p.hy + 0.2, z], 0.06, '#25282b', 1.2);
    // голова: тёмный корпус, светящееся стекло снизу
    const hw = led ? 0.42 : 0.36, lens = led ? 'rgba(236,238,232,.95)' : 'rgba(255,214,150,.95)';
    box(x, p.hx - hw, p.hx + hw, p.hy - 0.08, p.hy + 0.12, z - 0.16, z + 0.16, { f: '#1d2023', s: '#16181a', b: '#2a2c2e' });
    wfill(x, faceY(p.hy - 0.085, p.hx - hw * 0.8, p.hx + hw * 0.8, z - 0.12, z + 0.12), lens);
    LIGHTS.push({ X: p.hx, Y: p.hy, Z: z, r: 1, c: PCOL[i], k: 0.9 });
  }
  function drawMast(x) {
    const m = MAST;
    box(x, m.x - 0.4, m.x + 0.4, 0, 0.5, m.z - 0.4, m.z + 0.4, { f: '#3a3c3e', t: '#4a4c4e', s: '#2c2e30' });
    shaft(x, m.x, m.z, 0.5, m.h, 0.22, 0.12);
    for (let y = 1.5; y < m.h - 1; y += 0.5) wseg(x, [m.x - 0.3, y, m.z - 0.25], [m.x - 0.14, y, m.z - 0.25], 0.02, 'rgba(14,15,17,.9)', 0.8);
    // рама с прожекторами: смотрят вниз на площадку, видна задняя тёмная крышка и край линзы
    wseg(x, [m.x - 1.8, m.h, m.z - 0.3], [m.x + 1.0, m.h, m.z - 0.3], 0.08, '#202326', 1);
    wseg(x, [m.x - 1.8, m.h + 0.9, m.z - 0.3], [m.x + 1.0, m.h + 0.9, m.z - 0.3], 0.06, '#202326', 1);
    [-1.5, -0.8, -0.1, 0.6].forEach((dx, k) => {
      wfill(x, faceZ(m.z - 0.4, m.x + dx - 0.28, m.x + dx + 0.28, m.h + 0.1, m.h + 0.75), '#16181b');
      wfill(x, faceZ(m.z - 0.42, m.x + dx - 0.24, m.x + dx + 0.24, m.h + 0.1, m.h + 0.22), k === 2 ? 'rgba(120,124,130,.6)' : 'rgba(226,234,242,.92)');
      if (k !== 2) LIGHTS.push({ X: m.x + dx, Y: m.h, Z: m.z, r: 1, c: [200, 212, 226], k: 0.8 });
    });
    lamp(x, m.x, m.h + 1.3, m.z, 0.12, [222, 60, 48], 0.8, true);
  }
  // Дорожный знак на стойке (смотрит на камеру): kind 'speed' — «10», 'noentry' — кирпич
  function roadSign(x, X, Z, kind) {
    shaft(x, X, Z, 0.15, 2.6, 0.035, 0.035);
    const c = P(X, 2.35, Z), r = F * 0.3 / Z;
    x.fillStyle = '#16181a'; x.beginPath(); x.arc(c[0] + r * 0.06, c[1], r * 1.04, 0, 6.29); x.fill();
    if (kind === 'speed') {
      x.fillStyle = '#b4b0a6'; x.beginPath(); x.arc(c[0], c[1], r, 0, 6.29); x.fill();
      x.strokeStyle = '#8a3a32'; x.lineWidth = r * 0.22; x.beginPath(); x.arc(c[0], c[1], r * 0.86, 0, 6.29); x.stroke();
      x.fillStyle = '#1c1c1e'; x.font = 'bold ' + Math.round(r * 0.95) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('10', c[0], c[1] + r * 0.05); x.textAlign = 'left';
    } else {
      x.fillStyle = '#86362f'; x.beginPath(); x.arc(c[0], c[1], r, 0, 6.29); x.fill();
      x.fillStyle = '#b8b4aa'; x.fillRect(c[0] - r * 0.65, c[1] - r * 0.15, r * 1.3, r * 0.3);
    }
  }
  // Табличка на двух стойках у причала
  function quayBoard(x, x0, x1, Z, text) {
    [x0 + 0.2, x1 - 0.2].forEach((X) => shaft(x, X, Z, 0, 1.6, 0.04, 0.04));
    wfill(x, faceZ(Z - 0.02, x0, x1, 1.5, 2.5), '#1d3140');
    wfill(x, faceZ(Z - 0.03, x0 + 0.06, x1 - 0.06, 1.56, 2.44), '#27445a');
    const c = P((x0 + x1) / 2, 2.0, Z), s = F / Z;
    x.fillStyle = 'rgba(206,210,204,.85)'; x.font = 'bold ' + Math.round(0.5 * s) + 'px sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, c[0], c[1]); x.textAlign = 'left';
  }
  // Бетонные блоки-разделители с вытертой полосатой разметкой
  function jersey(x, x0, x1, Z) {
    for (let X = x0; X < x1 - 0.1; X += 3.05) {
      const a = X, b = Math.min(x1, X + 3);
      wfill(x, faceZ(Z, a, b, 0, 0.82), '#5a5a58');
      wfill(x, faceY(0.82, a, b, Z, Z + 0.2), '#6e6e6a');
      wfill(x, faceZ(Z - 0.01, a, b, 0, 0.18), '#3e3e3c');
      x.save(); path(x, wpts(faceZ(Z, a, b, 0.25, 0.7))); x.clip();
      for (let t = a - 1; t < b; t += 0.5) wfill(x, [[t, 0.7, Z], [t + 0.25, 0.7, Z], [t + 0.7, 0.25, Z], [t + 0.45, 0.25, Z]], 'rgba(132,58,46,.55)');
      x.restore();
      wfill(x, faceZ(Z - 0.02, a, b, 0, 0.82), 'rgba(0,0,0,.25)');
      wseg(x, [b, 0, Z], [b, 0.82, Z], 0.02, 'rgba(0,0,0,.7)', 1);
    }
  }
  function drawProps(x, C) {
    jersey(x, -17, -6.3, 43);
    jersey(x, 6.3, 8.2, 43.5);
    quayBoard(x, -12.6, -8.8, 47.2, 'ПРИЧАЛ 4');
    drawMast(x);
    roadSign(x, -6.6, 25, 'noentry');
    POLES.slice().reverse().forEach((p) => drawPole(x, p, POLES.indexOf(p)));
    roadSign(x, -6.7, 17, 'speed');
    const wc = 'rgba(10,11,13,.95)';
    // двойная линия по столбам, провис разный
    for (let i = 0; i < 2; i++) {
      wire(x, [POLES[i].x, 9.75, POLES[i].z], [POLES[i + 1].x, 9.75, POLES[i + 1].z], 0.32 + i * 0.12, 0.025, wc, 1.4);
      wire(x, [POLES[i].x + 0.1, 9.35, POLES[i].z], [POLES[i + 1].x + 0.1, 9.35, POLES[i + 1].z], 0.45 + i * 0.1, 0.02, wc, 1.2);
    }
    wire(x, [POLES[2].x, 9.75, POLES[2].z], [MAST.x, 8.5, MAST.z], 0.2, 0.025, wc, 1.2);
    // отводы через улицу на стену склада и на диспетчерскую (с изоляторами)
    wire(x, [POLES[1].x, 9.5, POLES[1].z], [WALL_X + 0.2, 8.2, 26], 0.7, 0.025, wc, 1.3);
    wire(x, [POLES[0].x, 9.5, POLES[0].z], [WALL_X + 0.2, 8.4, 13.5], 0.9, 0.025, wc, 1.3);
    wire(x, [POLES[2].x, 9.5, POLES[2].z], [AN_X + 0.2, AN_H - 0.2, 44.5], 0.6, 0.025, wc, 1.2);
    [[26, 8.2], [13.5, 8.4]].forEach((q) => wseg(x, [WALL_X, q[1], q[0]], [WALL_X + 0.35, q[1], q[0]], 0.05, '#2a2c2e', 1.2));
    // кабельный жгут вдоль фасада на кронштейнах
    for (let z = WH_Z0 + 0.5; z < WH_Z1 - 3; z += 4) {
      wire(x, [WALL_X + 0.25, 6.6, z], [WALL_X + 0.25, 6.6, z + 4], 0.18, 0.03, wc, 1.2);
      wire(x, [WALL_X + 0.3, 6.45, z], [WALL_X + 0.3, 6.45, z + 4], 0.25, 0.02, wc, 1);
      wseg(x, [WALL_X, 6.7, z], [WALL_X + 0.32, 6.6, z], 0.04, '#1a1b1d', 1);
    }
  }

  // ---------- Регистрация ----------
  Backgrounds.scene('night', function (x, R, th, o) {
    const s = o.scale || 1;
    const C = { s: s, q: s < 0.5 ? 0.4 : 1, step: Math.max(1, 1 / s) };
    LIGHTS = [];
    // дальний план — на отдельном слое: он же источник отражения в воде
    const far = layer(s);
    drawSky(far.g, C);
    drawFar(far.g, C);
    x.drawImage(far.c, 0, 0, W, H);
    drawWater(x, C, far.c);
    drawGround(x, C);
    groundMarks(x, C);
    groundShadows(x);
    groundWet(x, C, far);
    drawAnnex(x);
    drawWarehouse(x, C);
    drawContainers(x, C);
    drawProps(x, C);
  });
})();
