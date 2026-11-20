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
    { z0: 9, z1: 21.2, tiers: 4, seed: 11 },
    { z0: 25.5, z1: 37.7, tiers: 3, seed: 12 },
    { z0: 41.5, z1: 47.6, tiers: 2, seed: 13 },
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
    x.fillStyle = radial(x, m.x, m.y, m.r * 14, [[0, 'rgba(150,166,190,.10)'], [0.3, 'rgba(110,126,152,.05)'], [1, 'rgba(90,104,130,0)']]);
    x.fillRect(m.x - m.r * 14, m.y - m.r * 14, m.r * 28, m.r * 28);
    x.fillStyle = radial(x, m.x, m.y, m.r * 3.2, [[0.3, 'rgba(200,212,228,.22)'], [1, 'rgba(200,212,228,0)']]);
    x.beginPath(); x.arc(m.x, m.y, m.r * 3.2, 0, Math.PI * 2); x.fill();
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
    { x: 3, up: 0, col: [112, 120, 128] },
    { x: 64, up: 1, col: [96, 104, 114] },
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
        for (let z = zw - 52; z < zw - 2; z += 13) [-4.2, 4.2].forEach((dx) => lamp(x, cx + dx, GY0 - 0.3, z, 0.42, [214, 226, 240], 0.9));
      }
      [-6, 6].forEach((dx) => lamp(x, cx + dx, 43.2, zw - 1.2, 0.4, [214, 226, 240], 0.75));
      lamp(x, cx, 75.4, za, 0.32, [222, 60, 48], 0.85);
      if (!c.up) lamp(x, cx + 4.2, GY1 + 0.4, zw - 56, 0.28, [222, 60, 48], 0.7);
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
    // шлюпка на шлюпбалках
    const lb0 = P(14.2, 23.7, z - 0.4), lb1 = P(21.8, 21.0, z - 0.4);
    x.fillStyle = '#8a5536'; x.beginPath();
    x.roundRect ? x.roundRect(lb0[0], lb0[1], lb1[0] - lb0[0], lb1[1] - lb0[1], (lb1[1] - lb0[1]) * 0.45) : x.rect(lb0[0], lb0[1], lb1[0] - lb0[0], lb1[1] - lb0[1]);
    x.fill();
    wfill(x, faceZ(z - 0.45, 14.6, 21.4, 22.9, 23.5), '#a98a70');
    wfill(x, faceZ(z - 0.45, 15.4, 20.6, 22.1, 22.5), 'rgba(20,20,22,.7)');
    [14.9, 21.1].forEach((dx) => wseg(x, [dx, 25.4, z + 0.6], [dx, 23.8, z - 0.4], 0.25, '#2c3238', 0.9));
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
  function drawGround(x, C) {
    const yq = py(0, ZQ);
    x.fillStyle = grad(x, 0, yq, 0, H, [[0, '#2a2e33'], [1, '#121418']]); x.fillRect(0, yq, W, H - yq);
    wfill(x, faceY(0, -6, 6, 4, 42), '#1a1d22');
    wfill(x, faceY(0.15, -9, -6, 4, 46), '#2a2c30');
    wfill(x, faceY(0.15, 6, 8, 4, 46), '#2a2c30');
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
    g.fillStyle = '#2b2321'; g.fillRect(0, 0, c.width, c.height);
    const rows = Math.round(c.height / bh);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2, y = r * c.height / rows;
      for (let k = -1; k < c.width / bw + 1; k++) {
        const v = rr(), l = 0.78 + rr() * 0.32;
        let col = v < 0.06 ? [58, 36, 32] : v < 0.1 ? [104, 80, 62] : [92 * l, 56 * l, 46 * l];
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
    const fw = Math.max(8, Math.round(w / 14)), fh = Math.max(4, Math.round(h / 14));
    const nf = fbmField(rr, fw, fh, 4, 3);
    g.imageSmoothingEnabled = true;
    g.drawImage(fieldCanvas(fw, fh, nf, (v, i, j) => [16, 12, 12, Math.round(clamp((v - 0.42) * 2.2, 0, 0.7) * 255)]), 0, 0, w, h);
    g.fillStyle = grad(g, 0, 0, 0, V(9), [[0, 'rgba(8,8,10,.55)'], [1, 'rgba(8,8,10,0)']]); g.fillRect(0, 0, w, V(9));
    g.fillStyle = grad(g, 0, V(2.2), 0, h, [[0, 'rgba(14,16,14,0)'], [1, 'rgba(14,16,14,.55)']]); g.fillRect(0, V(2.2), w, h - V(2.2));
    for (let i = 0; i < 22; i++) {
      const zz = WH_Z0 + rr() * (WH_Z1 - WH_Z0), yy = 0.9 + rr() * 1.4, r = (0.3 + rr() * 0.9) * T;
      g.fillStyle = radial(g, U(zz), V(yy), r, [[0, 'rgba(150,146,134,.16)'], [1, 'rgba(150,146,134,0)']]);
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
    const lv = mipsH(fb.c, C.s < 0.5 ? 3 : 5);
    wallX(x, C, WALL_X, WH_Z0, WH_Z1, 0, WH_H, lv, T);
    // карниз выступает на 0.45 м: низ виден снизу, лицо — отдельной полосой
    const CX = WALL_X + 0.45;
    wfill(x, [[WALL_X, FL.cor, WH_Z0], [CX, FL.cor, WH_Z0], [CX, FL.cor, WH_Z1], [WALL_X, FL.cor, WH_Z1]], '#120f10');
    wfill(x, faceX(CX, WH_Z0, WH_Z1, FL.cor, WH_H), '#2a201d');
    wfill(x, faceZ(WH_Z1, WALL_X - 0.4, CX, FL.cor, WH_H), '#1c1615');
  }

  // ---------- Контейнеры справа ----------
  function drawContainers(x, C) {
    const cols = ['#5a2b24', '#2a4058', '#4b5054', '#2e4434', '#6a5c48'];
    BLOCKS.slice().reverse().forEach((b, bi) => {
      for (let t = 0; t < b.tiers; t++) {
        wfill(x, faceZ(b.z0, CONT_X, CONT_X + 9.8, t * 2.59, (t + 1) * 2.59), cols[(t + bi) % 5]);
        wfill(x, faceX(CONT_X, b.z0, b.z1, t * 2.59, (t + 1) * 2.59), cols[(t + bi + 2) % 5]);
      }
    });
  }

  // ---------- Столбы, фонари, провода ----------
  function drawProps(x, C) {
    POLES.slice().reverse().forEach((p) => {
      wseg(x, [p.x, 0, p.z], [p.x, 10, p.z], 0.28, '#555a5f');
      wseg(x, [p.x, 8.8, p.z], [p.hx, p.hy, p.z], 0.1, '#3a3e42');
      const h = P(p.hx, p.hy - 0.15, p.z);
      x.fillStyle = '#ffe2b0'; x.beginPath(); x.ellipse(h[0], h[1], F * 0.3 / p.z, F * 0.08 / p.z, 0, 0, Math.PI * 2); x.fill();
    });
    for (let i = 0; i < 2; i++) wire(x, [POLES[i].x, 9.6, POLES[i].z], [POLES[i + 1].x, 9.6, POLES[i + 1].z], 0.35, 0.025, '#0d0f12', 1.4);
    wire(x, [6.6, 9.4, 28], [WALL_X, 7.8, 25], 0.6, 0.025, '#0d0f12', 1.4);
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
    drawWarehouse(x, C);
    drawContainers(x, C);
    drawProps(x, C);
  });
})();
