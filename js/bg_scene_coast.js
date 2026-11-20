'use strict';

// Фон-локация «coast» — «Приморский квартал» (логический холст 1920 × 1080).
// Старая улочка приморского городка спускается к гавани. Дома оштукатурены в охру, белый и
// выцветшую пастель, крашеные ставни, балконы с решётками, бельё и провода над улицей.
// В конце улицы — набережная, лодки в гавани, мол с маяком и мыс за бухтой.
// Свет: солнце высоко слева и чуть сзади. Левые фасады в тени, правые на солнце,
// тень левых домов лежит на мостовой, освещённая полоса — у правого тротуара.
// Геометрия — простая камера: мировые метры (X вправо, Y вверх, Z вглубь) → экран, поэтому
// уходящие линии сами сходятся в точку схода, а ряды окон сжимаются с глубиной.
// Улица идёт под уклон: мостовая сходится в точку чуть ниже горизонта (линии моря).

(function () {
  // ---------- Камера и мир ----------
  const VX = 960, HOR = 488, F = 1350, EYE = 1.65;
  const SL = 0.055;                    // уклон улицы (5,5 %)
  const XL = -5.8;                     // линия левых фасадов (для проверки тени над улицей)
  const CL = -4.5, CR = 5.0;           // бордюры; тротуары выше мостовой на CURB
  const CURB = 0.14;
  const ZEND = 46, ZQ = 60;            // конец улицы и край причала
  const QY = -SL * ZEND, SEA = QY - 1.7;
  const SUN = [-0.5, 0.72, -0.48];     // направление на солнце
  const WSY = 1.44, WSZ = 0.96;        // тень на правой стене: сдвиг вниз и вглубь на 1 м выноса
  const gY = (z) => (z < ZEND ? -SL * z : QY);   // уровень мостовой на глубине z
  const sx = (X, Z) => VX + F * X / Z;
  const sy = (Y, Z) => HOR - F * (Y - EYE) / Z;
  const P = (X, Y, Z) => [VX + F * X / Z, HOR - F * (Y - EYE) / Z];

  let x = null, S = 1;                 // текущий контекст и масштаб (1 — фон, 0.2 — миниатюра)
  // виден ли элемент размером m метров на глубине z (в реальных пикселях)
  const vis = (m, z, px) => F * m / z * S >= (px || 1);
  // толщина линии в логических пикселях для детали m метров на глубине z
  const lw = (m, z, min) => Math.max(min || 1, F * m / z);

  // ---------- Пути ----------
  function wp(pts) {
    x.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], X = VX + F * p[0] / p[2], Y = HOR - F * (p[1] - EYE) / p[2];
      if (i) x.lineTo(X, Y); else x.moveTo(X, Y);
    }
    x.closePath();
  }
  // прямоугольник в плоскости стены X = w: z0..z1 по глубине, y0..y1 по высоте
  const wr = (w, z0, y0, z1, y1) => wp([[w, y0, z0], [w, y0, z1], [w, y1, z1], [w, y1, z0]]);
  // прямоугольник в плоскости Z = z (лицом к зрителю)
  const fr = (z, x0, y0, x1, y1) => wp([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]);
  // ломаная по мировым точкам (обводка)
  function wline(pts, width, col) {
    x.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], X = VX + F * p[0] / p[2], Y = HOR - F * (p[1] - EYE) / p[2];
      if (i) x.lineTo(X, Y); else x.moveTo(X, Y);
    }
    x.lineWidth = width; x.strokeStyle = col; x.stroke();
  }
  // провисающий провод между двумя мировыми точками (парабола), sag — провис в метрах
  function sagPts(a, b, sag, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
    }
    return pts;
  }
  function spoly(pts) { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); }

  // ---------- Цвет и свет ----------
  const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  const FOG = [203, 218, 229];
  const fogT = (z) => z / (z + 640);
  // цвет: альбедо c × свет k (число или [r,g,b]), с дымкой по глубине z и прозрачностью a
  function cs(c, k, z, a) {
    let r = c[0], g = c[1], b = c[2];
    if (k != null) {
      if (typeof k === 'number') { r *= k; g *= k; b *= k; } else { r *= k[0]; g *= k[1]; b *= k[2]; }
    }
    if (z) { const t = fogT(z); r += (FOG[0] - r) * t; g += (FOG[1] - g) * t; b += (FOG[2] - b) * t; }
    return a == null ? 'rgb(' + cl(r) + ',' + cl(g) + ',' + cl(b) + ')' : 'rgba(' + cl(r) + ',' + cl(g) + ',' + cl(b) + ',' + a + ')';
  }
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const K_SH = [0.52, 0.56, 0.66];     // тень: небо + отражённый свет
  const K_DK = [0.36, 0.39, 0.47];     // глубокая тень (ниши, низ карнизов)
  const SUNK = [0.96, 0.82, 0.48];     // прямое солнце (тёплое)
  // освещённость грани с нормалью n (lit = false — грань в падающей тени)
  function kN(nx, ny, nz, lit) {
    if (lit === false) return K_SH;
    const d = Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
    return [K_SH[0] + SUNK[0] * d, K_SH[1] + SUNK[1] * d, K_SH[2] + SUNK[2] * d];
  }
  const K_LIT = kN(-1, 0, 0);          // правая стена на солнце
  const K_FR = kN(0, 0, -1);           // грань к зрителю на солнце
  const K_TOP = kN(0, 1, 0);           // горизонталь на солнце

  // ---------- Текстуры (свои холсты, кэш на модуль) ----------
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  // периодический value-noise на сетке p×p, значения ≈ −1..1
  function vnoise(seed, p) {
    const r = Tex.rng(seed), g = new Float32Array(p * p);
    for (let i = 0; i < g.length; i++) g[i] = r() * 2 - 1;
    return function (u, v) {
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      const a = ((i % p) + p) % p, b = ((j % p) + p) % p, a1 = (a + 1) % p, b1 = (b + 1) % p;
      const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
      const top = g[b * p + a] + (g[b * p + a1] - g[b * p + a]) * su;
      const bot = g[b1 * p + a] + (g[b1 * p + a1] - g[b1 * p + a]) * su;
      return top + (bot - top) * sv;
    };
  }
  const TEX = {};
  // тайл n×n: fn(i, j) → [r, g, b, a] пишется прямо в буфер
  function tile(name, n, fn) {
    if (TEX[name]) return TEX[name];
    const c = mk(n, n), g = c.getContext('2d'), im = g.createImageData(n, n), d = im.data;
    for (let j = 0, o = 0; j < n; j++) for (let i = 0; i < n; i++, o += 4) fn(i, j, d, o);
    g.putImageData(im, 0, 0);
    return (TEX[name] = c);
  }
  // пятна и потёки штукатурки: тёмные и светлые полупрозрачные пятна
  // тайл 256 ≈ 2,8 м стены: мелкая шероховатость и лёгкая неровность тона (крупное — в карте грязи)
  function texPlaster() {
    const a = vnoise(11, 8), b = vnoise(12, 32), c = vnoise(13, 128), r = Tex.rng(14);
    return tile('plaster', 256, (i, j, d, o) => {
      const t = a(i / 32, j / 32) * 0.34 + b(i / 8, j / 8) * 0.3 + c(i / 2, j / 2) * 0.24 + (r() - 0.5) * 0.22;
      if (t < 0) { d[o] = 72; d[o + 1] = 60; d[o + 2] = 48; d[o + 3] = cl(-t * 150); }
      else { d[o] = 255; d[o + 1] = 251; d[o + 2] = 242; d[o + 3] = cl(t * 110); }
    });
  }
  // зерно камня/асфальта для мостовой и бетона
  function texGrain() {
    const a = vnoise(21, 16), b = vnoise(22, 128), r = Tex.rng(23);
    return tile('grain', 256, (i, j, d, o) => {
      const t = a(i / 16, j / 16) * 0.45 + b(i / 2, j / 2) * 0.35 + (r() - 0.5) * 0.6;
      if (t < 0) { d[o] = 30; d[o + 1] = 26; d[o + 2] = 22; d[o + 3] = cl(-t * 260); }
      else { d[o] = 236; d[o + 1] = 230; d[o + 2] = 220; d[o + 3] = cl(t * 170); }
    });
  }

  // Картинка «в плоскости стены» → стена X = w в перспективе. Тексель (i, j) ↔ (z = zi + i / pu, y = yt − j / pv).
  // Узкие вертикальные полосы по целым пикселям устройства (~3 px): внутри полосы отображение аффинное
  // и точное по её середине; полосы стыкуются без нахлёста — ни швов, ни двойной прозрачности.
  // poly — мировой контур стены (обрезка); o: alpha, op, step, pat (узор) + ytop/ybot.
  function wallMap(w, z0, z1, poly, img, zi, yt, pu, pv, o) {
    o = o || {};
    let xa = sx(w, z0), xb = sx(w, z1);
    if (xa > xb) { const t = xa; xa = xb; xb = t; }
    xa = Math.max(0, xa); xb = Math.min(1920, xb);
    if (xb - xa < 0.5) return;
    const M = x.getTransform(), st = Math.max(1, Math.round((o.step || 3) * S)) / S, xe = Math.ceil(xb * S) / S;
    x.save(); wp(poly); x.clip();
    x.globalAlpha = o.alpha == null ? 1 : o.alpha;
    if (o.op) x.globalCompositeOperation = o.op;
    if (o.pat) x.fillStyle = x.createPattern(img, 'repeat');
    for (let a = Math.floor(xa * S) / S; a < xe; a += st) {
      const b = Math.min(a + st, xe), zc = F * w / ((a + b) / 2 - VX);
      if (!(zc > 0)) continue;
      const ax = -F * w / (zc * zc), q = F / zc, e = VX + F * w / zc - ax * zc + ax * zi;
      x.setTransform(M); x.transform(ax / pu, 0, 0, q / pv, e, HOR + q * EYE - q * yt);
      let ia = (a - e) * pu / ax, ib = (b - e) * pu / ax;
      if (ia > ib) { const t = ia; ia = ib; ib = t; }
      if (o.pat) x.fillRect(ia, (yt - o.ytop) * pv - 4, ib - ia, (o.ytop - o.ybot) * pv + 8);
      else x.drawImage(img, ia, 0, ib - ia, img.height, ia, 0, ib - ia, img.height);
    }
    x.restore();
  }
  // натянуть узор на мостовую между X0..X1 и z0..z1 (полосами по экранной высоте)
  function groundTex(X0, X1, z0, z1, img, tpm, alpha, lift) {
    const pat = x.createPattern(img, 'repeat'), h = lift || 0;
    const n = Math.max(1, Math.min(60, Math.ceil(Math.abs(sy(gY(z0), z0) - sy(gY(z1), z1)) / 10)));
    x.save(); x.globalAlpha = alpha; x.fillStyle = pat;
    for (let k = 0; k < n; k++) {
      const za = 1 / (1 / z0 + (1 / z1 - 1 / z0) * k / n), zb = 1 / (1 / z0 + (1 / z1 - 1 / z0) * (k + 1) / n);
      const A = P(X0, gY(za) + h, za), B = P(X1, gY(za) + h, za), D = P(X0, gY(zb) + h, zb), C = P(X1, gY(zb) + h, zb);
      x.save(); spoly([A, B, C, D]); x.clip();
      const ax = (B[0] - A[0]) / (X1 - X0), ay = (B[1] - A[1]) / (X1 - X0);
      const bx = (D[0] - A[0]) / (zb - za), by = (D[1] - A[1]) / (zb - za);
      x.transform(ax / tpm, ay / tpm, bx / tpm, by / tpm, A[0] - X0 * ax - za * bx, A[1] - X0 * ay - za * by);
      x.fillRect(X0 * tpm - 2, za * tpm - 2, (X1 - X0) * tpm + 4, (zb - za) * tpm + 4);
      x.restore();
    }
    x.restore();
  }

  // ==== РАЗДЕЛЫ СЦЕНЫ ====

  // плоский предмет лицом к зрителю: начало в (X, Y, Z), единица — метр, ось y вверх
  function front(X, Y, Z, fn) {
    const k = F / Z;
    x.save(); x.translate(sx(X, Z), sy(Y, Z)); x.scale(k, -k); fn(k); x.restore();
  }

  // ---------- Небо ----------
  // кучевое облако: плоское основание, клубы разного размера; холст в половину разрешения — мягкий край
  function cloud(cx, by, w, h, seed, a) {
    const r = Tex.rng(seed), pad = 8, cw = w + pad * 2, ch = h + pad * 2, q = Math.max(0.08, S * 0.5);
    const c = mk(cw * q, ch * q), g = c.getContext('2d');
    g.scale(q, q); g.fillStyle = '#fff';
    const n = Math.round(14 + w / 6);
    for (let i = 0; i < n; i++) {
      const t = r(), e = h * Math.pow(Math.sin(Math.PI * (0.04 + t * 0.92)), 0.9) * (0.75 + 0.25 * r());
      const rr = Math.max(2, e * (0.22 + 0.3 * r()));
      g.beginPath(); g.arc(pad + t * w, pad + h - e + rr + r() * e * 0.3, rr, 0, Math.PI * 2); g.fill();
    }
    g.clearRect(0, pad + h, cw, ch);
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, pad, 0, pad + h);
    gr.addColorStop(0, 'rgb(252,251,246)'); gr.addColorStop(0.5, 'rgb(238,240,242)'); gr.addColorStop(1, 'rgb(192,205,218)');
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
    x.globalAlpha = a; x.drawImage(c, cx - cw / 2, by - h - pad, cw, ch); x.globalAlpha = 1;
  }
  function sky() {
    const g = x.createLinearGradient(0, 0, 0, HOR);
    g.addColorStop(0, '#3a70a8'); g.addColorStop(0.35, '#538ac1'); g.addColorStop(0.7, '#88b4d5');
    g.addColorStop(0.92, '#bad4e3'); g.addColorStop(1, '#cfe0e8');
    x.fillStyle = g; x.fillRect(0, 0, 1920, HOR + 2);
    cloud(1075, 476, 230, 30, 41, 0.92);
    cloud(918, 486, 120, 15, 42, 0.85);
    cloud(1185, 318, 170, 44, 43, 0.8);
    cloud(745, 372, 120, 26, 44, 0.7);
  }

  // ---------- Море и дальний план ----------
  function seaView() {
    const yq = sy(QY, ZQ) + 3;
    const g = x.createLinearGradient(0, HOR, 0, yq);
    g.addColorStop(0, '#b3c9d5'); g.addColorStop(0.05, '#8eabbd'); g.addColorStop(0.25, '#6290a8');
    g.addColorStop(0.6, '#4b7d90'); g.addColorStop(1, '#3c6e7a');
    x.fillStyle = g; x.fillRect(690, HOR, 540, yq - HOR);
    // рябь: светлые штрихи — отражение неба, тёмные — склоны волн; сжимаются к горизонту
    const r = Tex.rng(51);
    for (let z = 2600; z > 62; z /= 1.03) {
      const y = sy(SEA, z), k = F / z, n = 3 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const px = 690 + r() * 540, len = Math.min(150, (2 + r() * 7) * k), t = Math.max(0.6, k * 0.1);
        x.fillStyle = r() < 0.5 ? 'rgba(212,228,236,' + (0.16 + r() * 0.18).toFixed(2) + ')' : 'rgba(28,58,72,' + (0.12 + r() * 0.14).toFixed(2) + ')';
        x.fillRect(px, y, len, t);
      }
    }
  }
  // мыс за бухтой: холмы в дымке, посёлок, колокольня и пинии; слева — низкий дальний берег
  function headland() {
    const n = vnoise(62, 32), r = Tex.rng(61), z = 1900, base = sy(SEA, z) + 1;
    const top = [];
    for (let X = 40; X <= 640; X += 5) {
      const t = (X - 40) / 600;
      const hm = 4 + 66 * Math.pow(Math.min(1, t * 1.7), 0.75) * (1 - 0.2 * t) + n(X / 45, 1.5) * 9 + n(X / 11, 4.5) * 2.5;
      top.push([sx(X, z), sy(SEA + hm, z)]);
    }
    x.beginPath(); x.moveTo(top[0][0], base); top.forEach((p) => x.lineTo(p[0], p[1]));
    x.lineTo(top[top.length - 1][0], base); x.closePath();
    x.fillStyle = cs([96, 112, 82], 1, z); x.fill();
    // тёмные рощи
    x.save(); x.clip();
    for (let i = 0; i < 60; i++) {
      const X = 60 + r() * 560, hm = 8 + r() * 50;
      x.fillStyle = cs([60, 78, 52], 1, z, 0.5);
      x.beginPath(); x.ellipse(sx(X, z), sy(SEA + hm, z), 2 + r() * 5, 1 + r() * 1.8, 0, 0, Math.PI * 2); x.fill();
    }
    x.restore();
    // посёлок у воды
    for (let i = 0; i < 26; i++) {
      const X = 55 + r() * 190, w = 5 + r() * 7, h = 4 + r() * 6, hm = 1 + r() * 9 + (X - 55) * 0.05;
      const wall = [[226, 220, 206], [214, 188, 140], [230, 226, 218], [208, 170, 140]][i % 4];
      x.fillStyle = cs(wall, K_FR, z); x.fillRect(sx(X, z), sy(SEA + hm + h, z), F * w / z, F * h / z);
      x.fillStyle = cs([170, 92, 66], K_FR, z); x.fillRect(sx(X, z), sy(SEA + hm + h + 1.5, z), F * w / z, F * 1.5 / z);
    }
    x.fillStyle = cs([222, 214, 196], K_FR, z); x.fillRect(sx(150, z), sy(SEA + 34, z), F * 4 / z, F * 26 / z);
    for (let i = 0; i < 6; i++) {
      const X = 260 + i * 55 + r() * 30, hm = 30 + i * 6 + r() * 8;
      x.fillStyle = cs([48, 66, 46], 1, z, 0.7);
      x.beginPath(); x.ellipse(sx(X, z), sy(SEA + hm + 6, z), F * 7 / z, F * 2.6 / z, 0, 0, Math.PI * 2); x.fill();
    }
    // дальний низкий берег слева
    const zl = 6200;
    x.fillStyle = cs([110, 124, 104], 1, zl);
    x.beginPath(); x.moveTo(sx(-1600, zl), sy(SEA, zl) + 1);
    for (let X = -1600; X <= -380; X += 40) x.lineTo(sx(X, zl), sy(SEA + 25 + 40 * Math.sin((X + 1600) / 400) + n(X / 90, 7.5) * 12, zl));
    x.lineTo(sx(-380, zl), sy(SEA, zl) + 1); x.closePath(); x.fill();
  }
  // мол: стенка из бетонных блоков к гавани, парапет со стороны моря, камни у головы
  function breakwater() {
    const top = SEA + 2.6, par = SEA + 3.8, segs = [[-12, 176], [34, 160], [96, 136]];
    for (let i = 0; i < segs.length - 1; i++) {
      const a = segs[i], b = segs[i + 1], zm = (a[1] + b[1]) / 2;
      // парапет (чуть дальше стенки)
      x.fillStyle = cs([196, 190, 178], K_FR, zm);
      wp([[a[0], top, a[1] + 4], [b[0], top, b[1] + 4], [b[0], par, b[1] + 4], [a[0], par, a[1] + 4]]); x.fill();
      // стенка
      x.fillStyle = cs([184, 178, 166], K_FR, zm);
      wp([[a[0], SEA, a[1]], [b[0], SEA, b[1]], [b[0], top, b[1]], [a[0], top, a[1]]]); x.fill();
      // мокрая полоса у воды
      x.fillStyle = cs([70, 80, 68], 1, zm);
      wp([[a[0], SEA, a[1]], [b[0], SEA, b[1]], [b[0], SEA + 0.6, b[1]], [a[0], SEA + 0.6, a[1]]]); x.fill();
      // швы блоков
      x.strokeStyle = cs([120, 116, 108], 1, zm, 0.8); x.lineWidth = 1;
      x.beginPath();
      for (let t = 0; t <= 1.001; t += 2.2 / Math.hypot(b[0] - a[0], b[1] - a[1])) {
        const X = a[0] + (b[0] - a[0]) * t, Z = a[1] + (b[1] - a[1]) * t;
        x.moveTo(sx(X, Z), sy(SEA + 0.6, Z)); x.lineTo(sx(X, Z), sy(top, Z));
      }
      x.stroke();
    }
    // камни вокруг головы мола
    const r = Tex.rng(71);
    for (let i = 0; i < 22; i++) {
      const X = -17 + r() * 8, Z = 172 + r() * 6, s = 0.8 + r() * 1.4, k = F / Z;
      x.fillStyle = cs([150 + r() * 30, 146 + r() * 26, 136 + r() * 20], r() < 0.6 ? K_FR : K_SH, Z);
      x.beginPath(); x.ellipse(sx(X, Z), sy(SEA + s * 0.3, Z), s * k * 0.7, s * k * 0.42, 0, 0, Math.PI * 2); x.fill();
    }
  }

  // маяк на голове мола: белая башня, красный фонарь, галерея с перилами
  function lighthouse() {
    const X = -13, Z = 178, b = SEA + 3.0, h = 11.6, k = F / Z;
    const W = [238, 236, 230], RED = [168, 62, 50];
    // цилиндр освещён слева-спереди: градиент по нормали
    const shade = (x0, x1, c) => {
      const g = x.createLinearGradient(x0, 0, x1, 0);
      for (let i = 0; i <= 6; i++) {
        const f = i / 6, a = Math.PI * f;
        g.addColorStop(f, cs(c, kN(-Math.cos(a), 0, -Math.sin(a)), Z));
      }
      return g;
    };
    // площадка
    x.fillStyle = shade(sx(X - 3.2, Z), sx(X + 3.2, Z), [200, 194, 182]);
    fr(Z, X - 3.2, SEA + 0.4, X + 3.2, b); x.fill();
    x.fillStyle = cs([70, 80, 68], 1, Z); fr(Z, X - 3.2, SEA, X + 3.2, SEA + 0.5); x.fill();
    // ствол (усечённый конус)
    x.fillStyle = shade(sx(X - 1.6, Z), sx(X + 1.6, Z), W);
    wp([[X - 1.6, b, Z], [X + 1.6, b, Z], [X + 1.25, b + h, Z], [X - 1.25, b + h, Z]]); x.fill();
    x.fillStyle = cs([40, 46, 52], 1, Z);
    fr(Z, X - 0.75, b, X + 0.15, b + 2.0); x.fill();               // дверь
    fr(Z, X - 0.25, b + 5.0, X + 0.2, b + 5.8); x.fill();          // окошки
    fr(Z, X - 0.2, b + 8.4, X + 0.22, b + 9.2); x.fill();
    // галерея
    x.fillStyle = shade(sx(X - 1.95, Z), sx(X + 1.95, Z), RED);
    fr(Z, X - 1.95, b + h, X + 1.95, b + h + 0.35); x.fill();
    x.strokeStyle = cs([60, 50, 48], 1, Z); x.lineWidth = Math.max(1, 0.1 * k);
    x.beginPath(); x.moveTo(sx(X - 1.9, Z), sy(b + h + 1.15, Z)); x.lineTo(sx(X + 1.9, Z), sy(b + h + 1.15, Z)); x.stroke();
    x.lineWidth = Math.max(0.8, 0.06 * k); x.beginPath();
    for (let i = -1.9; i <= 1.95; i += 0.48) { x.moveTo(sx(X + i, Z), sy(b + h + 0.35, Z)); x.lineTo(sx(X + i, Z), sy(b + h + 1.15, Z)); }
    x.stroke();
    // фонарь: тёмное стекло с переплётом, красный купол
    x.fillStyle = shade(sx(X - 1.0, Z), sx(X + 1.0, Z), RED);
    fr(Z, X - 1.0, b + h + 0.35, X + 1.0, b + h + 0.8); x.fill();
    x.fillStyle = cs([44, 54, 62], 1, Z); fr(Z, X - 0.95, b + h + 0.8, X + 0.95, b + h + 2.4); x.fill();
    x.fillStyle = cs([150, 170, 180], 1, Z, 0.35); fr(Z, X - 0.9, b + h + 1.6, X - 0.2, b + h + 2.3); x.fill();
    x.strokeStyle = cs([150, 60, 50], 1, Z); x.lineWidth = Math.max(0.8, 0.07 * k); x.beginPath();
    [-0.95, -0.32, 0.32, 0.95].forEach((u) => { x.moveTo(sx(X + u, Z), sy(b + h + 0.8, Z)); x.lineTo(sx(X + u, Z), sy(b + h + 2.4, Z)); });
    x.stroke();
    front(X, b + h + 2.4, Z, () => {
      x.beginPath(); x.moveTo(-1.12, 0); x.quadraticCurveTo(-1.0, 0.95, 0, 1.0); x.quadraticCurveTo(1.0, 0.95, 1.12, 0); x.closePath();
      x.fillStyle = shade(-1.12, 1.12, RED); x.fill();
      x.fillStyle = cs([60, 50, 48], 1, Z); x.fillRect(-0.06, 0.9, 0.12, 0.9);
    });
  }
  // корпус лодки бортом к зрителю (метры, начало — середина ватерлинии)
  function hullPath(hl, fb) {
    x.beginPath(); x.moveTo(-hl * 0.84, 0);
    x.quadraticCurveTo(-hl * 1.0, fb * 0.5, -hl * 0.97, fb * 1.1);
    x.quadraticCurveTo(0, fb * 0.84, hl * 1.03, fb * 1.32);
    x.quadraticCurveTo(hl * 0.95, fb * 0.45, hl * 0.7, 0);
    x.closePath();
  }
  // лодка: kind — 'gozzo' (рыбацкая с рубкой), 'yacht' (парусная), 'motor' (катер)
  function boat(X, Z, L, dir, hull, band, kind) {
    const r = Tex.rng(Math.round(X * 31 + Z * 7));
    front(X, SEA, Z, (k) => {
      x.scale(dir, 1);
      const hl = L / 2, fb = 0.75 + L * 0.035, px = 1 / k;
      for (let i = 0; i < 5; i++) {                       // отражение, разбитое рябью
        x.save(); x.beginPath(); x.rect(-hl * 1.3, -(i + 1) * fb * 0.26, L * 1.3, fb * 0.26); x.clip();
        x.translate((r() - 0.5) * 0.6, 0); x.scale(1, -1);
        hullPath(hl, fb); x.fillStyle = cs(hull, 0.6, Z, (0.42 - i * 0.07).toFixed(2)); x.fill();
        x.restore();
      }
      hullPath(hl, fb); x.fillStyle = cs(hull, K_FR, Z); x.fill();
      x.save(); hullPath(hl, fb); x.clip();
      x.beginPath(); x.moveTo(-hl * 1.0, fb * 1.1 - 0.16); x.quadraticCurveTo(0, fb * 0.84 - 0.16, hl * 1.05, fb * 1.32 - 0.16);
      x.lineWidth = Math.max(0.2, 1.6 * px); x.strokeStyle = cs(band, K_FR, Z); x.stroke();
      x.fillStyle = cs([18, 30, 36], 1, Z, 0.4); x.fillRect(-hl * 1.1, 0, L * 1.2, fb * 0.28);
      x.restore();
      const c = [234, 232, 226];
      if (kind === 'gozzo' || kind === 'motor') {
        const u0 = kind === 'motor' ? -0.3 * L : -0.22 * L, u1 = kind === 'motor' ? 0.12 * L : 0.02 * L, ch = kind === 'motor' ? 1.25 : 1.05;
        x.fillStyle = cs(c, K_FR, Z); x.fillRect(u0, fb * 0.9, u1 - u0, ch);
        x.fillStyle = cs([40, 50, 58], 1, Z); x.fillRect(u0 + 0.15, fb * 0.9 + ch * 0.45, u1 - u0 - 0.3, ch * 0.32);
        x.fillStyle = cs(c, K_SH, Z); x.fillRect(u0 - 0.1, fb * 0.9 + ch, u1 - u0 + 0.2, 0.12);
        x.fillStyle = cs([70, 64, 58], 1, Z); x.fillRect(0.28 * L, fb, Math.max(0.08, 1.4 * px), 2.4);
      } else if (kind === 'yacht') {
        x.fillStyle = cs(c, K_FR, Z); x.fillRect(-0.22 * L, fb * 0.95, 0.38 * L, 0.55);
        x.fillStyle = cs([40, 50, 58], 1, Z); x.fillRect(-0.18 * L, fb * 0.95 + 0.2, 0.3 * L, 0.18);
        const mx = 0.12 * L, mt = fb + L * 1.25, lwm = Math.max(0.1, 1.3 * px);
        x.strokeStyle = cs([200, 200, 196], K_FR, Z); x.lineWidth = lwm;
        x.beginPath(); x.moveTo(mx, fb); x.lineTo(mx, mt); x.stroke();
        x.strokeStyle = cs([120, 124, 126], 1, Z, 0.8); x.lineWidth = Math.max(0.05, 0.8 * px);
        x.beginPath(); x.moveTo(mx, mt); x.lineTo(hl * 1.0, fb * 1.3); x.moveTo(mx, mt); x.lineTo(-hl * 0.95, fb * 1.1); x.stroke();
        x.fillStyle = cs([52, 82, 120], K_FR, Z); x.fillRect(-0.36 * L, fb + 1.3, mx + 0.36 * L, 0.42);
      }
    });
  }
  function harbour() {
    // лодки у причала (корпуса скроет край набережной) и в гавани
    boat(-2.6, 66, 6.0, 1, [226, 224, 216], [60, 96, 136], 'gozzo');
    boat(6.0, 64, 5.4, -1, [214, 210, 198], [150, 70, 54], 'motor');
    boat(-6.5, 92, 6.2, 1, [228, 226, 218], [58, 94, 136], 'gozzo');
    boat(3.2, 104, 5.6, -1, [104, 150, 142], [232, 228, 218], 'gozzo');
    boat(10.5, 128, 9.5, 1, [236, 234, 228], [52, 82, 120], 'yacht');
    boat(-1.0, 141, 7.0, -1, [222, 220, 212], [150, 72, 56], 'motor');
    boat(18, 158, 5.0, 1, [200, 92, 70], [230, 226, 216], 'gozzo');
    // паром у горизонта и парус вдали
    front(-470, SEA, 4200, () => {
      x.fillStyle = cs([236, 236, 232], K_FR, 4200); x.fillRect(-52, 0, 104, 7); x.fillRect(-34, 7, 62, 9); x.fillRect(-12, 16, 22, 5);
    });
    front(140, SEA, 2500, () => {
      x.fillStyle = cs([240, 240, 236], K_FR, 2500);
      x.beginPath(); x.moveTo(0, 1.5); x.lineTo(0, 11); x.lineTo(4.5, 1.5); x.closePath(); x.fill(); x.fillRect(-2.5, 0, 7, 1.5);
    });
  }

  // ---------- Дома: общие данные (нужны и для теней на мостовой) ----------
  // s −1 — левая сторона (в тени), 1 — правая (на солнце); x — плоскость фасада; fl — высоты этажей
  // top: 'eave' — черепичный карниз с выносом, 'flat' — плоская крыша с парапетом
  const HOUSES = [
    { s: -1, x: -5.8, z0: -12, z1: 10.5, fl: [4.0, 3.1, 3.1], top: 'eave', col: [208, 170, 112], sh: [58, 86, 66] },
    { s: -1, x: -5.5, z0: 10.5, z1: 18, fl: [3.9, 3.1, 3.1, 3.1], top: 'eave', col: [228, 214, 186], sh: [92, 122, 96] },
    // дом-мост над переулком: арка-проход внизу
    { s: -1, x: -5.8, z0: 18, z1: 21.5, fl: [4.7, 3.0, 3.0], top: 'flat', col: [214, 190, 150], sh: [70, 96, 84], arch: true },
    { s: -1, x: -5.8, z0: 21.5, z1: 29.5, fl: [4.0, 3.1, 3.1, 3.1], top: 'eave', col: [206, 152, 122], sh: [86, 108, 128] },
    { s: -1, x: -6.0, z0: 29.5, z1: 36.5, fl: [3.6, 3.0, 3.0], top: 'flat', col: [234, 230, 220], sh: [76, 110, 146] },
    { s: -1, x: -5.8, z0: 36.5, z1: 46, fl: [4.0, 3.1, 3.1, 3.1], top: 'eave', col: [222, 194, 132], sh: [62, 92, 70] },
    { s: 1, x: 6.4, z0: -12, z1: 12.5, fl: [4.0, 3.1, 3.1, 3.1], top: 'eave', col: [222, 180, 146], sh: [104, 78, 58] },
    { s: 1, x: 6.4, z0: 12.5, z1: 19.5, fl: [3.8, 3.0, 3.0], top: 'eave', col: [236, 232, 222], sh: [70, 104, 80] },
    { s: 1, x: 6.1, z0: 19.5, z1: 27.5, fl: [4.0, 3.1, 3.1, 3.1, 3.1], top: 'eave', col: [214, 176, 116], sh: [64, 110, 112] },
    { s: 1, x: 6.4, z0: 27.5, z1: 35, fl: [3.6, 3.0, 3.0], top: 'flat', col: [198, 136, 104], sh: [92, 108, 72] },
    { s: 1, x: 6.4, z0: 35, z1: 44, fl: [4.0, 3.1, 3.1, 3.1], top: 'eave', col: [222, 194, 180], sh: [62, 104, 112] },
  ];
  HOUSES.forEach((h, i) => {
    h.seed = 101 + i * 17;
    h.base = gY(Math.max(0, h.z0)) + CURB;
    h.H = h.fl.reduce((a, b) => a + b, 0);
    h.roof = h.base + h.H + (h.top === 'flat' ? 0.9 : 0);
    h.n = -h.s;                       // нормаль фасада по X (к улице)
  });

  // ---------- Земля ----------
  const ZN = 3.6, ZS = 17;             // ближняя граница и дальность отрисовки отдельных камней
  // путь по земле через точки [X, Z]; рёбра дробятся, чтобы перелом уклона у набережной не резал фигуру
  function gpath(poly, lift) {
    const h = lift || 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.abs(b[1] - a[1]) / 2));
      for (let k = 0; k < n; k++) {
        const X = a[0] + (b[0] - a[0]) * k / n, Z = a[1] + (b[1] - a[1]) * k / n;
        const p = P(X, gY(Z) + h, Z);
        if (i === 0 && k === 0) x.moveTo(p[0], p[1]); else x.lineTo(p[0], p[1]);
      }
    }
    x.closePath();
  }
  const gquad = (X0, X1, z0, z1, lift, c) => { x.beginPath(); gpath([[X0, z0], [X1, z0], [X1, z1], [X0, z1]], lift); x.fillStyle = c; x.fill(); };

  function quay() {
    gquad(-60, 60, ZEND - 0.5, ZQ, 0, cs([196, 188, 172], K_TOP, 52));
    // швы плит
    x.strokeStyle = cs([150, 142, 128], K_TOP, 52, 0.7); x.lineWidth = 1; x.beginPath();
    for (let z = ZEND + 0.6; z < ZQ - 0.6; z += 1.1) { x.moveTo(sx(-40, z), sy(QY, z)); x.lineTo(sx(40, z), sy(QY, z)); }
    for (let X = -20; X <= 20; X += 1.4) { x.moveTo(sx(X, ZEND), sy(QY, ZEND)); x.lineTo(sx(X, ZQ - 0.6), sy(QY, ZQ - 0.6)); }
    x.stroke();
    // гранитный бортик и тёмная кромка
    gquad(-60, 60, ZQ - 0.6, ZQ, 0.01, cs([214, 208, 196], K_TOP, 60));
    x.fillStyle = cs([60, 64, 62], 1, 60); x.fillRect(600, sy(QY, ZQ) - 0.5, 720, 2);
  }

  // мостовая: брусчатка рядами, водостоки вдоль бордюров, дальше — тон с зерном
  function street() {
    const r = Tex.rng(81), x0 = CL + 0.34, x1 = CR - 0.34;
    gquad(CL, CR, ZN, ZEND, 0, cs([116, 107, 98], K_TOP));
    gquad(CL, CL + 0.34, ZN, ZEND, 0, cs([132, 126, 116], K_TOP));
    gquad(CR - 0.34, CR, ZN, ZEND, 0, cs([132, 126, 116], K_TOP));
    gquad(x0, x1, ZN, ZS + 0.2, 0, cs([70, 64, 58], K_TOP));   // швы
    let z = ZN, row = 0;
    while (z < ZS) {
      const dz = 0.2 + r() * 0.03, za = z + 0.014, zb = z + dz - 0.014, hp = F * EYE * dz / (z * z);
      let X = x0 - (row % 2 ? 0.11 : 0) - r() * 0.06;
      while (X < x1) {
        const w = 0.17 + r() * 0.08, xa = Math.max(x0, X + 0.014), xb = Math.min(x1, X + w - 0.014);
        if (xb - xa > 0.03) {
          const t = r(), v = (r() - 0.5) * 16;
          const c = t < 0.12 ? [150, 138, 124] : t < 0.3 ? [112, 108, 104] : t < 0.42 ? [138, 112, 100] : [126 + v, 116 + v, 106 + v];
          const j = () => (r() - 0.5) * 0.02;
          x.fillStyle = cs(c, K_TOP);
          wp([[xa + j(), gY(za), za], [xb + j(), gY(za), za], [xb + j(), gY(zb), zb], [xa + j(), gY(zb), zb]]); x.fill();
          if (hp > 5 && S > 0.5) {                           // выпуклая середина камня
            const ia = xa + (xb - xa) * 0.22, ib = xb - (xb - xa) * 0.3, zc = za + (zb - za) * 0.2, zd = zb - (zb - za) * 0.35;
            x.fillStyle = cs(mixc(c, [200, 192, 180], 0.18), K_TOP);
            wp([[ia, gY(zc), zc], [ib, gY(zc), zc], [ib, gY(zd), zd], [ia, gY(zd), zd]]); x.fill();
          }
        }
        X += w;
      }
      z += dz; row++;
    }
    // дальше камни сливаются: редкие поперечные швы
    x.strokeStyle = cs([78, 72, 66], K_TOP, 0, 0.45); x.lineWidth = 1; x.beginPath();
    for (let zz = ZS; zz < ZEND - 1; zz += 0.62) { x.moveTo(sx(x0, zz), sy(gY(zz), zz)); x.lineTo(sx(x1, zz), sy(gY(zz), zz)); }
    x.stroke();
    if (S > 0.5) groundTex(CL, CR, ZN, ZEND - 0.5, texGrain(), 90, 0.5);
    // швы плит водостока
    x.strokeStyle = cs([84, 78, 72], K_TOP, 0, 0.7); x.lineWidth = 1.2; x.beginPath();
    for (let zz = ZN + 0.3; zz < 30; zz += 0.7) {
      [[CL, CL + 0.34], [CR - 0.34, CR]].forEach((s) => { x.moveTo(sx(s[0], zz), sy(gY(zz), zz)); x.lineTo(sx(s[1], zz), sy(gY(zz), zz)); });
    }
    x.stroke();
  }

  // тротуары из известняковых плит и гранитные бордюры
  function sidewalks() {
    const r = Tex.rng(91);
    [[-6.4, CL - 0.16, -1], [CR + 0.16, 6.8, 1]].forEach((sw) => {
      gquad(sw[0], sw[1], ZN, ZEND, CURB, cs([186, 178, 162], K_TOP));
      // плиты: поперечные швы, продольный шов посередине, разный тон
      for (let z = ZN; z < 32; z += 0.62) {
        for (let k = 0; k < 2; k++) {
          const a = sw[0] + (sw[1] - sw[0]) * k / 2, b = sw[0] + (sw[1] - sw[0]) * (k + 1) / 2;
          const v = (r() - 0.5) * 22;
          gquad(a + 0.02, b - 0.02, z + 0.02, z + 0.6, CURB, cs([186 + v, 178 + v, 160 + v], K_TOP));
        }
      }
      // бордюр: верх и грань
      const cx0 = sw[2] < 0 ? CL - 0.16 : CR, cx1 = sw[2] < 0 ? CL : CR + 0.16, face = sw[2] < 0 ? CL : CR;
      gquad(cx0, cx1, ZN, ZEND, CURB, cs([168, 164, 156], K_TOP));
      x.fillStyle = cs([150, 146, 140], sw[2] < 0 ? K_TOP : K_LIT);
      wp([[face, gY(ZN), ZN], [face, gY(ZEND), ZEND], [face, gY(ZEND) + CURB, ZEND], [face, gY(ZN) + CURB, ZN]]); x.fill();
    });
  }

  // ---------- Падающие тени на землю ----------
  // точка тени от (X, Y, Z) на мостовой/набережной по лучу солнца
  function gsh(X, Y, Z) {
    let t = (Y + SL * Z) / (0.72 - 0.48 * SL), z = Z + 0.48 * t;
    if (z > ZEND) { t = (Y - QY) / 0.72; z = Math.max(ZEND, Z + 0.48 * t); }
    return [X + 0.5 * t, z];
  }
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    pts.forEach((p) => { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  // отсечь многоугольник [X, Z] по Z ≥ zm
  function clipZ(poly, zm) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (a[1] >= zm) out.push(a);
      if ((a[1] >= zm) !== (b[1] >= zm)) { const t = (zm - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, zm]); }
    }
    return out;
  }
  // тень ящика (X0..X1 на земле, верх Yt с выносом до Xt, z0..z1)
  const SHADOWS = [];
  function boxShadow(X0, X1, Xt, Yt, z0, z1) {
    const pts = [[X0, z0], [X1, z0], [X1, z1], [X0, z1], gsh(X0, Yt, z0), gsh(Xt, Yt, z0), gsh(Xt, Yt, z1), gsh(X0, Yt, z1)];
    const p = clipZ(hull(pts), ZN - 1);
    if (p.length > 2) SHADOWS.push(p);
  }
  function inShadow(X, Z) {
    return SHADOWS.some((p) => {
      let c = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        if ((p[i][1] > Z) !== (p[j][1] > Z) && X < (p[j][0] - p[i][0]) * (Z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
      }
      return c;
    });
  }
  function collectShadows() {
    SHADOWS.length = 0;
    HOUSES.forEach((h) => { if (h.s < 0) boxShadow(h.x - 14, h.x, h.x + (h.top === 'eave' ? 0.55 : 0.1), h.roof, h.z0, h.z1); });
    boxShadow(-9, -7.6, -7.6, HOUSES[0].roof + 1.6, 4, 5.2);     // трубы на крышах
    boxShadow(-8.5, -7.3, -7.3, HOUSES[2].roof + 1.5, 24, 25.1);
  }
  // мягкая тень: многоугольники на холсте втрое меньше, затем умножение с растяжением
  function groundShadows() {
    const q = S / 3, c = mk(1920 * q, 1080 * q), keep = x;
    x = c.getContext('2d'); x.setTransform(q, 0, 0, q, 0, 0);
    x.beginPath(); SHADOWS.forEach((p) => gpath(p, CURB * 0.5));
    x.fillStyle = 'rgb(112,124,160)'; x.fill();
    x = keep;
    x.save(); x.globalCompositeOperation = 'multiply'; x.drawImage(c, 0, 0, 1920, 1080); x.restore();
  }

  // ---------- Фасады: основа ----------
  const ZC = 2;                                    // стены ближе этой глубины целиком за кадром
  const swY = (u) => gY(u) + CURB;                 // уровень тротуара у стены на глубине u
  const fX = (h, d) => h.x + h.n * (d || 0);       // плоскость фасада, вынесенная на d м к улице (d < 0 — вглубь)
  const fq = (h, u0, v0, u1, v1, d) => wr(fX(h, d), u0, v0, u1, v1);
  // свет граней: wall — параллельно фасаду, front — торец к зрителю, top — верх, bot — низ.
  // Левая сторона целиком в тени своих домов, правая — на солнце.
  const K_SHW = [0.57, 0.58, 0.63];               // теневая стена: небо + тёплый рефлекс от освещённой улицы
  function lite(h, f) {
    if (h.s < 0) return f === 'bot' ? K_DK : f === 'wall' ? K_SHW : K_SH;
    return f === 'wall' ? K_LIT : f === 'front' ? K_FR : f === 'top' ? K_TOP : K_SH;
  }
  const hc = (h, c, f, u, a) => cs(c, lite(h, f), u, a);
  const tone = (c, t) => mixc(c, t > 0 ? [252, 248, 240] : [46, 40, 34], Math.abs(t));   // светлее / темнее
  // выступ на фасаде u0..u1 × v0..v1 с выносом d0..d1: торец к зрителю, низ или верх, лицевая грань
  function fbox(h, u0, u1, v0, v1, d0, d1, c) {
    const A = fX(h, d0), B = fX(h, d1);
    x.fillStyle = hc(h, c, 'front', u0); wp([[A, v0, u0], [B, v0, u0], [B, v1, u0], [A, v1, u0]]); x.fill();
    if (v0 > EYE) { x.fillStyle = hc(h, c, 'bot', u0); wp([[A, v0, u0], [B, v0, u0], [B, v0, u1], [A, v0, u1]]); x.fill(); }
    if (v1 < EYE) { x.fillStyle = hc(h, c, 'top', u0); wp([[A, v1, u0], [B, v1, u0], [B, v1, u1], [A, v1, u1]]); x.fill(); }
    x.fillStyle = hc(h, c, 'wall', u0); wr(B, u0, v0, u1, v1); x.fill();
  }
  // Тени выступов на правом (освещённом) фасаде: копятся и заливаются одним путём умножением —
  // перекрытия не темнеют дважды. Цвет = тень / солнце, т. е. стена становится «в тени».
  const SHC = 'rgb(' + [0, 1, 2].map((i) => cl(255 * K_SH[i] / K_LIT[i])).join(',') + ')';
  const SHQ = [];
  function shq(h, u0, u1, v0, v1, d) {
    if (h.s < 0 || d <= 0.004) return;
    const du = WSZ * d, dv = WSY * d;
    SHQ.push(hull([[u0, v0], [u1, v0], [u1, v1], [u0, v1], [u0 + du, v0 - dv], [u1 + du, v0 - dv], [u1 + du, v1 - dv], [u0 + du, v1 - dv]]));
  }
  function flushSh(h) {
    if (SHQ.length) {
      x.save(); x.globalCompositeOperation = 'multiply'; x.fillStyle = SHC; x.beginPath();
      SHQ.forEach((p) => {
        p.forEach((q, i) => { const s = P(h.x, q[1], q[0]); if (i) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); });
        x.closePath();
      });
      x.fill(); x.restore();
    }
    SHQ.length = 0;
  }

  // карта грязи в плоскости стены (умножается на стену): крупные пятна, потёки с карниза и под
  // подоконниками, потемнение под свесом, сырость у тротуара. g — пикселей на метр (детали мягкие)
  function grime(h, u0) {
    const g = S > 0.5 ? 12 : 4, u1 = h.z1, yt = h.roof + 0.4, yb = swY(u1) - 0.3;
    const W = Math.ceil((u1 - u0) * g) + 2, H = Math.ceil((yt - yb) * g) + 2;
    const c = mk(W, H), q = c.getContext('2d'), r = Tex.rng(h.seed * 13 + 5), sh = h.s < 0;
    const U = (u) => (u - u0) * g, V = (v) => (yt - v) * g;
    q.fillStyle = '#fff'; q.fillRect(0, 0, W, H);
    const blob = (cu, cv, rr, col, a) => {
      const gr = q.createRadialGradient(cu, cv, 0, cu, cv, rr);
      gr.addColorStop(0, 'rgba(' + col + ',' + a.toFixed(2) + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
      q.fillStyle = gr; q.fillRect(cu - rr, cv - rr, rr * 2, rr * 2);
    };
    for (let i = 0; i < 10; i++) blob(U(u0 + r() * (u1 - u0)), V(swY(u1) + r() * (h.roof - swY(u1))), (1 + r() * 2.6) * g, '150,130,106', 0.08 + r() * 0.1);
    const streak = (cu, v0, w, len, a) => {
      const gr = q.createLinearGradient(0, V(v0), 0, V(v0 - len));
      gr.addColorStop(0, 'rgba(98,86,72,' + a.toFixed(2) + ')'); gr.addColorStop(1, 'rgba(98,86,72,0)');
      q.fillStyle = gr; q.fillRect(U(cu) - w * g / 2, V(v0), w * g, len * g);
    };
    for (let i = 0; i < 8; i++) streak(u0 + r() * (u1 - u0), h.roof, 0.15 + r() * 0.5, 1.5 + r() * 5, 0.12 + r() * 0.14);
    (h.ops || []).forEach((o) => { if (o.v0 > swY(u1) + 1.5) streak((o.u0 + o.u1) / 2, o.v0 - 0.08, (o.u1 - o.u0) * (0.6 + r() * 0.3), 0.8 + r() * 1.8, 0.1 + r() * 0.1); });
    const gt = q.createLinearGradient(0, V(h.roof), 0, V(h.roof - 1.8));
    gt.addColorStop(0, sh ? 'rgba(84,80,78,0.42)' : 'rgba(120,106,92,0.26)'); gt.addColorStop(1, 'rgba(120,106,92,0)');
    q.fillStyle = gt; q.fillRect(0, 0, W, V(h.roof - 1.8));
    // сырость у тротуара: в скошенной системе тротуар горизонтален (y' = V(swY(u0)))
    q.save(); q.setTransform(1, SL, 0, 1, 0, 0);
    const y0 = V(swY(u0)), top = [];
    for (let u = u0; u <= u1 + 0.5; u += 0.5) top.push([U(u), y0 - (0.55 + r() * 0.5) * g]);
    const gd = q.createLinearGradient(0, y0 - 1.1 * g, 0, y0);
    gd.addColorStop(0, 'rgba(118,104,88,0)'); gd.addColorStop(0.45, 'rgba(118,104,88,0.16)'); gd.addColorStop(1, 'rgba(92,80,68,0.3)');
    q.fillStyle = gd; q.beginPath(); q.moveTo(0, y0 + 4);
    top.forEach((p) => q.lineTo(p[0], p[1])); q.lineTo(W, y0 + 4); q.closePath(); q.fill();
    q.restore();
    return { c: c, yt: yt, g: g };
  }

  // стена дома: заливка, цоколь, карта грязи, зерно штукатурки
  function wallBody(h, u0) {
    const u1 = h.z1, X = h.x, top = h.roof, zm = (u0 + u1) / 2;
    const poly = [[X, swY(u0) - 0.02, u0], [X, swY(u1) - 0.02, u1], [X, top, u1], [X, top, u0]];
    // контактная тень на тротуаре вдоль стены
    [[0.34, 0.12], [0.12, 0.16]].forEach((a) => {
      x.fillStyle = 'rgba(28,30,44,' + a[1] + ')';
      wp([[X, swY(u0), u0], [X, swY(u1), u1], [fX(h, a[0]), swY(u1), u1], [fX(h, a[0]), swY(u0), u0]]); x.fill();
    });
    x.fillStyle = cs(h.col, lite(h, 'wall'), zm); wp(poly); x.fill();
    // цоколь вдоль уклона: камень или тёмная краска
    const ph = h.plinth || 0.75, pc = h.stone ? [158, 150, 138] : tone(h.col, -0.2);
    x.fillStyle = cs(pc, lite(h, 'wall'), zm);
    wp([[X, swY(u0) - 0.02, u0], [X, swY(u1) - 0.02, u1], [X, swY(u1) + ph, u1], [X, swY(u0) + ph, u0]]); x.fill();
    x.fillStyle = cs(tone(pc, 0.25), lite(h, h.s < 0 ? 'wall' : 'top'), zm);
    wp([[X, swY(u0) + ph, u0], [X, swY(u1) + ph, u1], [X, swY(u1) + ph + 0.05, u1], [X, swY(u0) + ph + 0.05, u0]]); x.fill();
    const gm = grime(h, u0);
    wallMap(X, u0, u1, poly, gm.c, u0, gm.yt, gm.g, gm.g, { op: 'multiply', step: 4 });
    if (S > 0.5) wallMap(X, u0, u1, poly, texPlaster(), 0, 0, 90, 90, { pat: true, ytop: top, ybot: swY(u1) - 0.1, alpha: h.s < 0 ? 0.42 : 0.4 });
    (PATCH[HOUSES.indexOf(h)] || []).forEach((p) => patch(h, p[0], h.base + p[1], p[2], p[3], p[4], p[5]));
  }
  // облупившаяся штукатурка: рваное пятно, под ним кирпич (b) или бутовый камень (s); [u, v от base, w, h, вид, seed]
  const PATCH = {
    0: [[9.0, 0.95, 0.9, 0.55, 's', 1]], 1: [[16.0, 2.75, 0.8, 0.45, 'b', 2]], 3: [[25.0, 4.85, 0.75, 0.5, 'b', 3]],
    6: [[10.0, 0.9, 0.85, 0.5, 's', 4]], 7: [[17.0, 4.6, 0.7, 0.42, 'b', 5]], 8: [[22.2, 5.5, 0.85, 0.55, 'b', 6], [25.0, 1.0, 0.9, 0.5, 's', 7]],
  };
  function patch(h, u, v, w, hh, kind, seed) {
    if (!vis(0.3, u, 3)) return;
    const r = Tex.rng(seed * 31), X = fX(h, -0.005), pts = [], n = 14, k = lite(h, 'wall');
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, f = 0.7 + r() * 0.45;
      pts.push([X, v + Math.sin(a) * hh / 2 * f, u + Math.cos(a) * w / 2 * f * (1 + 0.25 * Math.sin(a * 2))]);
    }
    x.save(); wp(pts); x.fillStyle = cs(kind === 'b' ? [168, 104, 78] : [150, 138, 120], k, u); x.fill(); x.clip();
    // кладка: швы рядов и тычков
    x.strokeStyle = cs(kind === 'b' ? [196, 176, 150] : [96, 88, 78], k, u, 0.8); x.lineWidth = lw(0.015, u, 0.8); x.beginPath();
    const rh = kind === 'b' ? 0.075 : 0.16, bw = kind === 'b' ? 0.25 : 0.3;
    for (let y = v - hh, row = 0; y < v + hh; y += rh, row++) {
      let a = P(X, y, u - w), b = P(X, y, u + w); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]);
      for (let uu = u - w + (row % 2) * bw / 2; uu < u + w; uu += bw * (kind === 'b' ? 1 : 0.7 + r() * 0.6)) { a = P(X, y, uu); b = P(X, y + rh, uu); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }
    }
    x.stroke(); x.restore();
    // кромка штукатурки: светлый скол сверху, тень снизу
    x.lineWidth = lw(0.03, u, 1); x.strokeStyle = cs(tone(h.col, -0.3), k, u, 0.7); wp(pts); x.stroke();
  }

  // торец дома к зрителю (виден в разрывах застройки и над низким соседом); у скатной крыши — фронтон
  function endFace(h, near) {
    const u = h.z0, X0 = h.x, X1 = h.x - h.n * 10, top = h.roof, b = swY(u);
    const pts = [[X0, b, u], [X1, b, u], [X1, top, u]];
    if (h.top === 'eave') pts.push([X0 - h.n * 5, top + 2.1, u]);
    pts.push([X0, top, u]);
    x.fillStyle = cs(h.col, h.s < 0 ? K_SH : K_FR, u); wp(pts); x.fill();
    if (S > 0.5) {                                   // зерно штукатурки: плоскость z = u проецируется аффинно
      x.save(); wp(pts); x.clip(); x.globalAlpha = 0.4;
      x.fillStyle = x.createPattern(texPlaster(), 'repeat');
      x.transform(F / (90 * u), 0, 0, F / (90 * u), VX, HOR + F * EYE / u);
      const xa = Math.min(X0, X1) * 90, xb = Math.max(X0, X1) * 90;
      x.fillRect(xa - 4, -(top + 2.5) * 90, xb - xa + 8, (top + 2.5 - b) * 90 + 8);
      x.restore();
    }
    if (h.s < 0) {
      // выше тени ближнего соседа торец освещён
      const cut = near ? near.roof - 1.5 * (u - near.z1) : -99;
      if (cut < top + 2.1) {
        x.save(); wp(pts); x.clip();
        x.fillStyle = cs(h.col, K_FR, u); wp([[X0 + h.n, cut, u], [X1, cut, u], [X1, top + 3, u], [X0 + h.n, top + 3, u]]); x.fill();
        x.restore();
      }
    }
  }

  // скат черепичной крыши от свеса к коньку: у ближних домов его закроет сам фасад (рисуется раньше)
  function roofSlope(h, u0) {
    if (h.top !== 'eave') return;
    const u1 = h.z1 + 0.3, ua = u0 - 0.3, r = h.roof + 0.2, rid = r + 2.1, dO = 0.66, dR = -5;
    const k = kN(-h.s * 0.37, 0.93, 0), A = fX(h, dO), B = fX(h, dR);
    x.fillStyle = cs([170, 98, 72], k, u0);
    wp([[A, r, ua], [A, r, u1], [B, rid, u1], [B, rid, ua]]); x.fill();
    if (!vis(0.25, u0, 2.2)) return;
    // ряды желобчатой черепицы: желоба вниз по скату и поперечные стыки
    x.lineWidth = Math.max(1, F * 0.03 / u0);
    x.strokeStyle = cs([104, 58, 44], k, u0, 0.5); x.beginPath();
    for (let u = ua + 0.12; u < u1; u += 0.24) { const p = P(A, r, u), q = P(B, rid, u); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    x.stroke();
    x.strokeStyle = cs([210, 150, 116], k, u0, 0.35); x.beginPath();
    for (let t = 0.12; t < 1; t += 0.14) {
      const X = A + (B - A) * t, Y = r + (rid - r) * t, p = P(X, Y, ua), q = P(X, Y, u1);
      x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]);
    }
    x.stroke();
  }

  // ---------- Фасады: программа и проёмы ----------
  // bays — оси окон верхних этажей (глубина u), ww — ширина окна, frame — обрамление ('band' — светлая
  // крашеная рамка, 'stone' — каменная с карнизиком), balc — {этаж: [оси с балконами]}, gf — первый этаж
  const PLAN = [
    { bays: [9.7], ww: 1.2, frame: 'band', stone: true, fc: [96, 70, 50], gf: [{ k: 'door', u0: 8.7, u1: 9.95, h: 2.75 }] },
    { bays: [12.0, 14.6, 17.0], ww: 1.15, frame: 'band', balc: { 1: [14.6] }, bands: true,
      gf: [{ k: 'shop', u0: 10.9, u1: 13.5, sign: 'PANE' }, { k: 'door', u0: 14.2, u1: 15.3, h: 2.5 }, { k: 'win', u0: 16.4, u1: 17.3 }] },
    { bays: [19.75], ww: 1.0, frame: 'band', gf: [{ k: 'arch', u0: 18.45, u1: 21.05 }] },
    { bays: [23.2, 25.6, 28.0], ww: 1.15, frame: 'stone', stone: true, balc: { 1: [23.2, 25.6] }, fc: [92, 70, 52],
      gf: [{ k: 'shop', u0: 22.2, u1: 24.7, sign: 'FARMACIA' }, { k: 'door', u0: 26.9, u1: 28.3, h: 2.9, arch: true }] },
    { bays: [31.0, 33.2, 35.4], ww: 1.1, frame: 'none', balc: { 1: [31.0, 35.4] },
      gf: [{ k: 'garage', u0: 30.2, u1: 32.6 }, { k: 'door', u0: 34.2, u1: 35.2, h: 2.3 }] },
    { bays: [38.2, 40.8, 43.4], ww: 1.15, frame: 'band', balc: { 1: [38.2, 40.8, 43.4], 2: [40.8] }, lb: { 1: true }, bands: true,
      gf: [{ k: 'door', u0: 37.6, u1: 38.8, h: 2.6 }, { k: 'shop', u0: 40.3, u1: 44.6, sign: 'BAR' }] },
    { bays: [10.8], ww: 1.2, frame: 'band', stone: true, gf: [{ k: 'shop', u0: 9.3, u1: 12.0 }] },
    { bays: [13.7, 16.0, 18.3], ww: 1.1, frame: 'band', balc: { 1: [13.7, 16.0] }, bands: true, fc: [70, 104, 80],
      gf: [{ k: 'shop', u0: 13.0, u1: 15.9, sign: 'PESCE', roll: 0.4 }, { k: 'door', u0: 17.3, u1: 18.5, h: 2.5 }] },
    { bays: [20.8, 23.5, 26.2], ww: 1.2, frame: 'stone', stone: true, balc: { 1: [20.8, 23.5, 26.2], 2: [23.5], 3: [20.8, 26.2] }, lb: { 1: true }, bands: true,
      gf: [{ k: 'door', u0: 20.1, u1: 21.7, h: 3.0, arch: true }, { k: 'win', u0: 23.1, u1: 24.0 }, { k: 'win', u0: 25.7, u1: 26.6 }] },
    { bays: [28.7, 31.2, 33.7], ww: 1.1, frame: 'none', balc: { 2: [31.2] },
      gf: [{ k: 'door', u0: 28.2, u1: 29.2, h: 2.3 }, { k: 'garage', u0: 30.6, u1: 33.2 }] },
    { bays: [36.6, 39.5, 42.4], ww: 1.15, frame: 'band', balc: { 1: [36.6, 39.5, 42.4], 2: [39.5] }, hotel: true,
      gf: [{ k: 'door', u0: 38.8, u1: 40.3, h: 2.8 }, { k: 'win', u0: 36.0, u1: 37.0 }, { k: 'win', u0: 41.9, u1: 42.9 }] },
  ];
  HOUSES.forEach((h, i) => Object.assign(h, PLAN[i] || {}));

  // проёмы дома: первый этаж из программы, выше — окна и балконные двери по осям
  function layout(h) {
    if (h.ops) return h.ops;
    const r = Tex.rng(h.seed), ops = [];
    let fb = h.base;
    h.fl.forEach((fh, f) => {
      if (f === 0) {
        (h.gf || []).forEach((g) => {
          const b = swY((g.u0 + g.u1) / 2);
          ops.push(Object.assign({ f: 0, v0: g.k === 'win' ? b + 1.35 : b, v1: g.k === 'win' ? b + 2.55 : b + (g.h || 2.7), shut: 'none' }, g));
        });
      } else {
        (h.bays || []).forEach((c) => {
          const bal = !!(h.balc && h.balc[f] && h.balc[f].indexOf(c) >= 0), t = r();
          const shut = t < 0.46 ? 'open' : t < 0.72 ? 'closed' : t < 0.84 ? 'half' : 'roll';
          const u0 = c - h.ww / 2, u1 = c + h.ww / 2;
          if (bal) ops.push({ k: 'fdoor', f: f, u0: u0, u1: u1, v0: fb + 0.14, v1: fb + Math.min(2.4, fh - 0.5), shut: shut === 'closed' ? 'half' : shut, fb: fb });
          else ops.push({ k: 'win', f: f, u0: u0, u1: u1, v0: fb + 0.95, v1: fb + 0.95 + Math.min(1.62, fh - 1.4), shut: shut });
        });
      }
      fb += fh;
    });
    return (h.ops = ops);
  }

  // подпуть без beginPath (несколько фигур — одной заливкой)
  function sub(pts) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], X = VX + F * p[0] / p[2], Y = HOR - F * (p[1] - EYE) / p[2];
      if (i) x.lineTo(X, Y); else x.moveTo(X, Y);
    }
    x.closePath();
  }
  const fqs = (h, u0, v0, u1, v1, d) => { const X = fX(h, d); sub([[X, v0, u0], [X, v0, u1], [X, v1, u1], [X, v1, u0]]); };
  // попадает ли прямоугольник фасада в кадр
  function onScr(h, u0, u1, v0, v1) {
    const a = sx(h.x, u0), b = sx(h.x, u1), t = Math.min(sy(v1, u0), sy(v1, u1)), bt = Math.max(sy(v0, u0), sy(v0, u1));
    return Math.max(a, b) > -30 && Math.min(a, b) < 1950 && t < 1100 && bt > -30;
  }

  // створка ставни-жалюзи ua..ub × v0..v1 в плоскости d: обвязка и тени под ламелями
  function leaf(h, ua, ub, v0, v1, d, c) {
    const um = Math.min(ua, ub), X = fX(h, d), k = lite(h, 'wall');
    x.fillStyle = cs(c, k, um); fq(h, ua, v0, ub, v1, d); x.fill();
    if (vis(0.075, um, 2.4)) {
      x.beginPath();
      for (let v = v0 + 0.09; v < v1 - 0.05; v += 0.075) { const a = P(X, v, ua), b = P(X, v, ub); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }
      x.lineWidth = lw(0.022, um, 0.8); x.strokeStyle = cs(tone(c, -0.5), k, um, 0.5); x.stroke();
    } else if (vis(0.3, um, 2)) {   // издали — лёгкая полосатость, а не ровная заливка
      x.fillStyle = cs(tone(c, -0.3), k, um, 0.35); fq(h, ua, v0 + (v1 - v0) * 0.5, ub, v0 + (v1 - v0) * 0.54, d); x.fill();
    }
    x.lineWidth = lw(0.04, um, 1); x.strokeStyle = cs(tone(c, -0.38), k, um, 0.85);
    fq(h, ua, v0, ub, v1, d); x.stroke();
  }
  // рама и стекло в глубине проёма (плоскость d < 0); у балконной двери внизу глухая филёнка
  function glazing(h, o, d) {
    const u0 = o.u0, u1 = o.u1, v0 = o.v0, v1 = o.v1, X = fX(h, d), r = Tex.rng(Math.round(u0 * 131 + v0 * 17));
    const a = P(X, v1, u0), b = P(X, v0, u0), g = x.createLinearGradient(a[0], a[1], b[0], b[1]);
    const refl = h.s < 0 ? [156, 146, 128] : [108, 128, 146];      // слева отражаются освещённые фасады, справа — небо
    g.addColorStop(0, cs(refl, 1, u0)); g.addColorStop(0.42, cs([58, 60, 62], 1, u0)); g.addColorStop(1, cs([30, 31, 33], 1, u0));
    x.fillStyle = g; fq(h, u0, v0, u1, v1, d); x.fill();
    const um = (u0 + u1) / 2, ph = o.k === 'fdoor' ? 0.75 : 0;
    if (r() < 0.5) {                                              // занавеска в одной или обеих створках
      const both = r() < 0.5, lo = v0 + ph + (v1 - v0 - ph) * (0.05 + r() * 0.5);
      x.fillStyle = cs([222, 214, 196], h.s < 0 ? K_SH : [0.8, 0.78, 0.74], u0, 0.85);
      x.beginPath(); fqs(h, both ? u0 : um, lo, u1, v1, d); x.fill();
    }
    if (!vis(0.05, u0, 1)) return;
    const fc = o.fc || h.fc || [224, 220, 210], f = 0.06, tr = v0 + ph + (v1 - v0 - ph) * 0.7;
    x.fillStyle = cs(fc, h.s < 0 ? K_SH : K_LIT, u0); x.beginPath();
    fqs(h, u0, v0, u0 + f, v1, d); fqs(h, u1 - f, v0, u1, v1, d); fqs(h, u0, v1 - f, u1, v1, d); fqs(h, u0, v0, u1, v0 + f, d);
    fqs(h, um - f * 0.6, v0, um + f * 0.6, v1, d); fqs(h, u0, tr - f * 0.4, u1, tr + f * 0.4, d);
    if (ph) fqs(h, u0, v0, u1, v0 + ph, d);
    x.fill();
    if (ph && vis(0.1, u0, 2)) { x.fillStyle = cs(tone(fc, -0.25), h.s < 0 ? K_SH : K_LIT, u0, 0.6); x.beginPath(); fqs(h, u0 + 0.12, v0 + 0.12, um - 0.1, v0 + ph - 0.1, d); fqs(h, um + 0.1, v0 + 0.12, u1 - 0.12, v0 + ph - 0.1, d); x.fill(); }
  }
  // проём с откосами: дальний откос, верхний (снизу) или нижний, рама в глубине, тень откосов
  function recess(h, o, r, inner) {
    const u0 = o.u0, u1 = o.u1, v0 = o.v0, v1 = o.v1, X0 = h.x, Xr = fX(h, -r);
    x.save(); fq(h, u0, v0, u1, v1, 0); x.clip();
    x.fillStyle = cs(tone(h.col, 0.08), h.s < 0 ? [0.44, 0.47, 0.56] : K_FR, u0); x.fill();
    if (v1 > EYE) { x.fillStyle = cs(tone(h.col, 0.08), h.s < 0 ? K_DK : K_SH, u0); wp([[X0, v1, u0], [X0, v1, u1], [Xr, v1, u1], [Xr, v1, u0]]); x.fill(); }
    if (v0 < EYE) { x.fillStyle = cs([196, 190, 178], lite(h, 'top'), u0); wp([[X0, v0, u0], [X0, v0, u1], [Xr, v0, u1], [Xr, v0, u0]]); x.fill(); }
    (inner || glazing)(h, o, -r);
    if (h.s > 0) {
      x.save(); fq(h, u0, v0, u1, v1, -r); x.clip();
      x.beginPath(); fqs(h, u0, v0, u1, v1, -r); fqs(h, u0 + WSZ * r, v0 - WSY * r, u1 + WSZ * r, v1 - WSY * r, -r);
      x.globalCompositeOperation = 'multiply'; x.fillStyle = SHC; x.fill('evenodd');
      x.restore();
    }
    x.restore();
  }
  // опущенная наполовину рулонная штора (тапарелла) в проёме
  function roller(h, o, t, c) {
    const v = o.v1 - (o.v1 - o.v0) * t, X = fX(h, -0.06);
    x.fillStyle = cs(c, h.s < 0 ? K_SH : K_LIT, o.u0); fq(h, o.u0, v, o.u1, o.v1, -0.06); x.fill();
    if (vis(0.06, o.u0, 2)) {
      x.beginPath();
      for (let y = v + 0.05; y < o.v1; y += 0.06) { const a = P(X, y, o.u0), b = P(X, y, o.u1); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }
      x.lineWidth = lw(0.012, o.u0, 0.7); x.strokeStyle = cs(tone(c, -0.4), 1, o.u0, 0.5); x.stroke();
    }
    x.fillStyle = cs(tone(c, -0.45), h.s < 0 ? K_SH : K_LIT, o.u0); fq(h, o.u0, v, o.u1, v + 0.05, -0.06); x.fill();
  }
  // окно или балконная дверь: обрамление, ставни, проём, подоконник (выступы — в список E)
  function windowAt(h, o, E) {
    const u0 = o.u0, u1 = o.u1, v0 = o.v0, v1 = o.v1, w = u1 - u0, sc = h.sh, fr = h.frame;
    if (fr === 'band') { x.fillStyle = hc(h, tone(h.col, 0.45), 'wall', u0); fq(h, u0 - 0.14, v0 - 0.1, u1 + 0.14, v1 + 0.14, 0); x.fill(); }
    if (fr === 'stone') { x.fillStyle = hc(h, [190, 182, 168], 'wall', u0); fq(h, u0 - 0.15, v0 - 0.06, u1 + 0.15, v1 + 0.15, 0); x.fill(); }
    if (o.shut === 'closed') { leaf(h, u0, u0 + w / 2, v0, v1, 0.01, sc); leaf(h, u0 + w / 2, u1, v0, v1, 0.01, sc); }
    else {
      recess(h, o, o.k === 'fdoor' ? 0.16 : 0.13);
      if (o.shut === 'roll') roller(h, o, 0.3 + Tex.rng(Math.round(u0 * 7 + v0))() * 0.5, tone(sc, 0.25));
      if (o.shut === 'half') leaf(h, u0 + w / 2, u1, v0, v1, 0.01, sc);
    }
    if (o.shut === 'open' || o.shut === 'half') {
      const ua = u0 - w / 2 - 0.03, ub = u1 + w / 2 + 0.03, two = o.shut === 'open';
      E.push({ u: ua, sh: () => { shq(h, ua, u0 - 0.03, v0, v1, 0.05); if (two) shq(h, u1 + 0.03, ub, v0, v1, 0.05); },
        dr: () => { leaf(h, ua, u0 - 0.03, v0, v1, 0.05, sc); if (two) leaf(h, u1 + 0.03, ub, v0, v1, 0.05, sc); } });
    }
    if (o.k === 'win') {
      E.push({ u: u0 - 0.08, sh: () => shq(h, u0 - 0.08, u1 + 0.08, v0 - 0.07, v0, 0.08), dr: () => fbox(h, u0 - 0.08, u1 + 0.08, v0 - 0.07, v0, 0, 0.08, [204, 198, 186]) });
    }
    if (o.f === 0 && o.k === 'win') {            // решётка окна первого этажа
      E.push({ u: u0 - 0.02, dr: () => {
        const X = fX(h, 0.06); x.beginPath();
        for (let u = u0 + 0.06; u < u1; u += 0.13) { const a = P(X, v0 - 0.04, u), b = P(X, v1 + 0.04, u); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }
        [v0 + 0.05, (v0 + v1) / 2, v1 - 0.05].forEach((v) => { const a = P(X, v, u0 - 0.02), b = P(X, v, u1 + 0.02); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); });
        x.lineWidth = lw(0.022, u0, 1); x.strokeStyle = cs([40, 42, 42], 1, u0); x.stroke();
      } });
    }
    if (fr === 'stone') {
      E.push({ u: u0 - 0.2, sh: () => shq(h, u0 - 0.2, u1 + 0.2, v1 + 0.15, v1 + 0.26, 0.1), dr: () => fbox(h, u0 - 0.2, u1 + 0.2, v1 + 0.15, v1 + 0.26, 0, 0.1, [198, 190, 176]) });
    }
  }

  // верх дома: карниз со свесом черепичной кровли или парапет плоской крыши. Добавляет выступы в список E
  function roofEdge(h, u0, E) {
    const r = h.roof, u1 = h.z1, c = h.col;
    if (h.top === 'eave') {
      E.push({
        u: u0 - 0.31,
        sh: () => { shq(h, u0, u1, r - 0.36, r, 0.26); shq(h, u0 - 0.3, u1 + 0.3, r, r + 0.3, 0.7); },
        dr: () => {
          fbox(h, u0, u1, r - 0.36, r - 0.18, 0, 0.1, tone(c, 0.22));            // профиль карниза
          fbox(h, u0, u1, r - 0.18, r, 0, 0.24, tone(c, 0.3));
          fbox(h, u0 - 0.3, u1 + 0.3, r, r + 0.12, 0, 0.66, tone(c, 0.35));     // оштукатуренный свес
          if (vis(0.08, u0, 2)) {                                                // торцы стропил
            for (let u = u0 + 0.2; u < u1 - 0.05; u += 0.55) fbox(h, u, u + 0.09, r - 0.04, r + 0.04, 0.24, 0.62, [150, 118, 90]);
          }
          fbox(h, u0 - 0.3, u1 + 0.3, r + 0.12, r + 0.3, 0.6, 0.7, [176, 100, 74]); // торцы черепицы
          const gc = [124, 112, 98];                                             // водосточный желоб
          fbox(h, u0 - 0.3, u1 + 0.3, r + 0.04, r + 0.2, 0.7, 0.82, gc);
          x.fillStyle = cs(tone(gc, 0.3), h.s < 0 ? K_SH : K_FR, u0);
          wr(fX(h, 0.82), u0 - 0.3, r + 0.16, u1 + 0.3, r + 0.2); x.fill();
        },
      });
    } else {
      E.push({
        u: u0 - 0.06,
        sh: () => shq(h, u0, u1, r - 0.1, r + 0.02, 0.07),
        dr: () => fbox(h, u0 - 0.05, u1, r - 0.1, r + 0.03, -0.05, 0.07, [196, 188, 174]),   // плита парапета
      });
    }
  }

  // междуэтажные тяги: тонкий выступающий поясок
  function bands(h, u0, E) {
    if (!h.bands) return;
    let v = h.base;
    for (let i = 0; i < h.fl.length - 1; i++) {
      v += h.fl[i];
      const vv = v;
      E.push({ u: u0, sh: () => shq(h, u0, h.z1, vv - 0.08, vv + 0.08, 0.05), dr: () => fbox(h, u0, h.z1, vv - 0.08, vv + 0.08, 0, 0.05, tone(h.col, 0.18)) });
    }
  }

  // ---------- Первый этаж: двери, витрины, арка, гараж; надписи ----------
  const OPEN = {};
  // контур проёма с полукруглым верхом: пята на vs, радиус R (или прямоугольник, если R = 0)
  function archSub(h, ua, ub, vb, vs, R, d) {
    const X = fX(h, d), pts = [[X, vb, ua], [X, vs, ua]], um = (ua + ub) / 2;
    if (R > 0) for (let i = 1; i < 16; i++) { const t = Math.PI * i / 16; pts.push([X, vs + R * Math.sin(t), um - (ub - ua) / 2 * Math.cos(t)]); }
    pts.push([X, vs, ub], [X, vb, ub]);
    sub(pts);
  }
  // надпись на стене: каждая буква в своей точной перспективе; hm — высота прописных (м)
  function wallText(h, str, uc, vb, hm, d, col, font) {
    const dir = h.s < 0 ? 1 : -1, X = fX(h, d), M = x.getTransform(), m = hm / 70;
    x.save(); x.font = font || '700 100px Georgia, "Times New Roman", serif'; x.textBaseline = 'alphabetic';
    x.fillStyle = cs(col, lite(h, 'wall'), uc);
    const ws = [], tw = str.split('').reduce((a, c) => { const w = x.measureText(c).width + 6; ws.push(w); return a + w; }, 0);
    let acc = -tw / 2;
    str.split('').forEach((c, i) => {
      const u = uc + dir * (acc + ws[i] / 2) * m, p = P(X, vb, u);
      x.setTransform(M); x.transform(-F * X / (u * u) * dir * m, F * (vb - EYE) / (u * u) * dir * m, 0, F / u * m, p[0], p[1]);
      x.fillText(c, -(ws[i] - 6) / 2, 0); acc += ws[i];
    });
    x.restore();
  }
  // тень откосов в глубине прямоугольного проёма (правая сторона): всё, кроме сдвинутого по лучу проёма
  function recessShade(h, u0, v0, u1, v1, r) {
    if (h.s < 0) return;
    x.save(); x.beginPath(); fqs(h, u0, v0, u1, v1, -r); x.clip();
    x.beginPath(); fqs(h, u0, v0, u1, v1, -r); fqs(h, u0 + WSZ * r, v0 - WSY * r, u1 + WSZ * r, v1 - WSY * r, -r);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = SHC; x.fill('evenodd'); x.restore();
  }
  const DOORC = [[78, 58, 44], [56, 78, 66], [62, 80, 98], [104, 66, 50]];
  OPEN.door = function (h, o, E) {
    const u0 = o.u0, u1 = o.u1, b = swY((u0 + u1) / 2), st = 0.15, v0 = b + st, v1 = b + o.h, um = (u0 + u1) / 2;
    const R = o.arch ? (u1 - u0) / 2 : 0, vs = v1 - R, r = 0.26, c = o.col || DOORC[h.seed % 4], k = lite(h, 'wall');
    const pc = h.stone ? [186, 178, 164] : tone(h.col, 0.4);
    x.fillStyle = cs(pc, k, u0); x.beginPath(); archSub(h, u0 - 0.22, u1 + 0.22, b, vs, R ? R + 0.22 : 0, 0);
    if (!R) fqs(h, u0 - 0.22, vs - 0.01, u1 + 0.22, vs + 0.22, 0);
    x.fill();
    x.save(); x.beginPath(); archSub(h, u0, u1, v0 - 0.01, vs, R, 0); x.clip();
    x.fillStyle = cs(tone(pc, -0.25), h.s < 0 ? K_DK : K_FR, u0); x.fill();
    if (vs > EYE && !R) { x.fillStyle = cs(pc, h.s < 0 ? K_DK : K_SH, u0); wp([[h.x, v1, u0], [h.x, v1, u1], [fX(h, -r), v1, u1], [fX(h, -r), v1, u0]]); x.fill(); }
    // полотно в глубине: две створки с филёнками; сверху фрамуга (у арки — веер)
    const X = fX(h, -r), fh = R ? vs : v1 - 0.5;
    x.fillStyle = cs(c, k, u0); x.beginPath(); archSub(h, u0, u1, v0, vs, R, -r); x.fill();
    x.fillStyle = cs([40, 42, 44], 1, u0); x.beginPath();
    if (R) archSub(h, u0 + 0.06, u1 - 0.06, fh + 0.05, vs, R - 0.06, -r); else fqs(h, u0 + 0.06, fh + 0.06, u1 - 0.06, v1 - 0.04, -r);
    x.fill();
    if (vis(0.05, u0, 2)) {
      x.strokeStyle = cs(tone(c, -0.2), k, u0); x.lineWidth = lw(0.03, u0, 1); x.beginPath();
      for (let i = 1; i < 4; i++) {
        let a, bb;
        if (R) { const t = Math.PI * i / 4; a = P(X, fh + 0.05, um); bb = P(X, vs + (R - 0.06) * Math.sin(t), um - (R - 0.06) * Math.cos(t)); }
        else { const uu = u0 + (u1 - u0) * i / 4; a = P(X, fh + 0.06, uu); bb = P(X, v1 - 0.04, uu); }
        x.moveTo(a[0], a[1]); x.lineTo(bb[0], bb[1]);
      }
      x.stroke();
      x.fillStyle = cs(tone(c, -0.35), k, u0); x.beginPath();
      [[u0 + 0.1, um - 0.06], [um + 0.06, u1 - 0.1]].forEach((s) => { fqs(h, s[0], v0 + 0.15, s[1], v0 + 0.95, -r); fqs(h, s[0], v0 + 1.1, s[1], fh - 0.12, -r); });
      fqs(h, um - 0.015, v0, um + 0.015, fh, -r); x.fill();
      x.fillStyle = cs([196, 170, 110], k, u0); x.beginPath(); fqs(h, um - 0.12, v0 + 1.0, um - 0.06, v0 + 1.06, -r); x.fill();
    }
    x.fillStyle = cs(tone(c, -0.2), k, u0); x.beginPath(); fqs(h, u0, fh - 0.04, u1, fh + 0.05, -r); x.fill();
    recessShade(h, u0, v0, u1, vs, r);
    x.restore();
    E.push({ u: u0 - 0.16, dr: () => fbox(h, u0 - 0.16, u1 + 0.16, b - 0.02, v0, 0, 0.4, [178, 172, 160]) });
  };
  // вывески над витринами: вид, цвет фриза (null — буквы прямо по штукатурке) и букв
  const SIGNS = {
    PANE: { bg: null, fg: [128, 58, 44] }, FARMACIA: { bg: [52, 84, 66], fg: [236, 232, 220] },
    PESCE: { bg: [44, 70, 104], fg: [236, 232, 222] }, BAR: { bg: [86, 40, 38], fg: [236, 226, 206] },
  };
  // витрина: рама, стекло с отражением, полки с товаром, дверь, жалюзи-ролета; над ней — вывеска
  OPEN.shop = function (h, o, E) {
    const u0 = o.u0, u1 = o.u1, b = swY((u0 + u1) / 2), v0 = b + 0.02, v1 = b + 2.75, r = 0.2, k = lite(h, 'wall');
    const fc = o.fc || (h.s < 0 ? [50, 68, 58] : [58, 50, 44]), X = fX(h, -r), rr = Tex.rng(Math.round(u0 * 53));
    x.fillStyle = cs(h.stone ? [186, 178, 164] : tone(h.col, 0.38), k, u0); fq(h, u0 - 0.2, b, u1 + 0.2, v1 + 0.2, 0); x.fill();
    x.save(); x.beginPath(); fqs(h, u0, v0, u1, v1, 0); x.clip();
    x.fillStyle = cs(tone(h.col, 0.1), h.s < 0 ? [0.44, 0.47, 0.56] : K_FR, u0); x.fill();
    if (v1 > EYE) { x.fillStyle = cs(h.col, h.s < 0 ? K_DK : K_SH, u0); wp([[h.x, v1, u0], [h.x, v1, u1], [X, v1, u1], [X, v1, u0]]); x.fill(); }
    // стекло: сверху отражение улицы, ниже полутёмный зал
    const a = P(X, v1, u0), bb = P(X, v0, u0), g = x.createLinearGradient(a[0], a[1], bb[0], bb[1]);
    g.addColorStop(0, cs(h.s < 0 ? [170, 160, 140] : [112, 128, 140], 1, u0)); g.addColorStop(0.35, cs([70, 68, 64], 1, u0)); g.addColorStop(1, cs([44, 42, 40], 1, u0));
    x.fillStyle = g; x.beginPath(); fqs(h, u0, v0, u1, v1, -r); x.fill();
    if (vis(0.08, u0, 2)) {                     // полки с товаром
      for (let s = 0; s < 3; s++) {
        const vs = v0 + 0.7 + s * 0.55;
        x.fillStyle = cs([96, 84, 70], 1, u0, 0.8); x.beginPath(); fqs(h, u0 + 0.1, vs, u1 - 0.1, vs + 0.04, -r - 0.3); x.fill();
        for (let t = u0 + 0.15; t < u1 - 0.25; t += 0.12 + rr() * 0.2) {
          const c = [[168, 140, 96], [190, 186, 172], [120, 128, 104], [150, 96, 74], [96, 112, 128]][Math.floor(rr() * 5)];
          x.fillStyle = cs(c, 0.8, u0, 0.75); x.beginPath(); fqs(h, t, vs + 0.04, t + 0.08 + rr() * 0.1, vs + 0.16 + rr() * 0.22, -r - 0.3); x.fill();
        }
      }
      x.fillStyle = cs(h.s < 0 ? [236, 228, 210] : [190, 210, 226], 1, u0, 0.12);        // блик отражения
      x.beginPath(); sub([[X, v0 + 0.3, u0 + 0.2], [X, v0 + 0.3, u0 + 0.7], [X, v1, u0 + 1.5], [X, v1, u0 + 1.0]]); x.fill();
    }
    // рама витрины и дверь в дальнем конце
    const ud = u1 - 0.95;
    x.fillStyle = cs(fc, k, u0); x.beginPath();
    fqs(h, u0, v0, u1, v0 + 0.45, -r); fqs(h, u0, v1 - 0.08, u1, v1, -r); fqs(h, u0, v0, u0 + 0.08, v1, -r); fqs(h, u1 - 0.08, v0, u1, v1, -r);
    fqs(h, ud - 0.08, v0, ud, v1, -r); fqs(h, u0, v1 - 0.6, u1, v1 - 0.54, -r); fqs(h, (u0 + ud) / 2 - 0.04, v0, (u0 + ud) / 2 + 0.04, v1, -r);
    fqs(h, ud, v0, u1, v0 + 0.3, -r);
    x.fill();
    if (o.roll) roller(h, { u0: u0, u1: u1, v0: v0, v1: v1 }, o.roll, [150, 150, 146]);
    recessShade(h, u0, v0, u1, v1, r);
    x.restore();
    // вывеска: фриз на выносе или буквы по штукатурке
    const sg = o.sign && SIGNS[o.sign];
    if (sg) {
      const vb = v1 + 0.32, um = (u0 + u1) / 2;
      if (sg.bg) {
        E.push({ u: u0 - 0.1, sh: () => shq(h, u0 - 0.1, u1 + 0.1, v1 + 0.24, v1 + 0.86, 0.06),
          dr: () => { fbox(h, u0 - 0.1, u1 + 0.1, v1 + 0.24, v1 + 0.86, 0, 0.06, sg.bg); wallText(h, o.sign, um, v1 + 0.39, 0.3, 0.061, sg.fg); } });
      } else wallText(h, o.sign, um, vb, 0.36, 0, sg.fg);
    }
  };
  // арка-проход под домом-мостом: клинчатые камни, тёмный проход со ступенями вглубь, фонарь
  OPEN.arch = function (h, o, E) {
    const u0 = o.u0, u1 = o.u1, b = swY(u0), R = (u1 - u0) / 2, vs = b + 2.5, um = (u0 + u1) / 2, k = lite(h, 'wall');
    x.fillStyle = cs([196, 186, 168], k, u0); x.beginPath(); archSub(h, u0 - 0.38, u1 + 0.38, b, vs, R + 0.38, 0); x.fill();
    x.strokeStyle = cs([120, 112, 100], k, u0, 0.7); x.lineWidth = lw(0.025, u0, 1); x.beginPath();
    for (let i = 0; i <= 12; i++) {
      const t = Math.PI * i / 12, a = P(h.x, vs + R * Math.sin(t), um - R * Math.cos(t)), c = P(h.x, vs + (R + 0.38) * Math.sin(t), um - (R + 0.38) * Math.cos(t));
      x.moveTo(a[0], a[1]); x.lineTo(c[0], c[1]);
    }
    x.stroke();
    x.save(); x.beginPath(); archSub(h, u0, u1, b - 0.05, vs, R, 0); x.clip();
    x.fillStyle = cs(tone(h.col, -0.3), [0.3, 0.32, 0.38], u0); x.fill();
    for (let i = 0; i < 9; i++) {                 // ступени вверх, вглубь прохода
      const Xa = fX(h, -0.6 - i * 0.38), Xb = fX(h, -0.6 - (i + 1) * 0.38), y0 = b + i * 0.15, y1 = y0 + 0.15;
      x.fillStyle = cs([150, 142, 130], [0.36, 0.38, 0.44], u0); wp([[Xa, y0, u0], [Xa, y0, u1], [Xa, y1, u1], [Xa, y1, u0]]); x.fill();
      x.fillStyle = cs([176, 168, 154], [0.46, 0.48, 0.54], u0); wp([[Xa, y1, u0], [Xa, y1, u1], [Xb, y1, u1], [Xb, y1, u0]]); x.fill();
    }
    x.fillStyle = cs([150, 142, 130], [0.4, 0.42, 0.48], u0); wp([[h.x, b, u0], [h.x, b, u1], [fX(h, -0.6), b, u1], [fX(h, -0.6), b, u0]]); x.fill();
    x.restore();
    // кованый фонарь на кронштейне в замке арки
    E.push({ u: um, dr: () => front(fX(h, 0.02), vs + R - 0.1, um, (kk) => {
      const n = h.n, ic = cs([38, 40, 40], 1, um), t = Math.max(0.025, 1.2 / kk);
      x.fillStyle = ic; x.fillRect(Math.min(0, n * 0.5), -t, 0.5, t * 2); x.fillRect(n * 0.47 - t, -0.12, t * 2, 0.12);
      x.fillRect(n * 0.47 - 0.13, -0.18, 0.26, 0.06); x.fillRect(n * 0.47 - 0.1, -0.56, 0.2, 0.4);
      x.fillStyle = cs([170, 160, 132], 1, um); x.fillRect(n * 0.47 - 0.075, -0.52, 0.15, 0.32);
      x.fillStyle = ic; x.fillRect(n * 0.47 - 0.12, -0.6, 0.24, 0.05);
    }) });
  };
  // гараж: металлическая роллета с рёбрами, бетонная перемычка, знак «стоянка запрещена»
  OPEN.garage = function (h, o, E) {
    const u0 = o.u0, u1 = o.u1, b = swY((u0 + u1) / 2), v1 = b + 2.6, k = lite(h, 'wall');
    x.fillStyle = cs([176, 172, 164], k, u0); fq(h, u0 - 0.12, b, u1 + 0.12, v1 + 0.25, 0); x.fill();
    x.save(); x.beginPath(); fqs(h, u0, b, u1, v1, 0); x.clip();
    x.fillStyle = cs([150, 150, 146], h.s < 0 ? [0.44, 0.47, 0.56] : K_FR, u0); x.fill();
    roller(h, { u0: u0, u1: u1, v0: b, v1: v1 }, 0.97, [148, 150, 146]);
    recessShade(h, u0, b, u1, v1, 0.06);
    x.restore();
    const us = u1 + 0.45;
    E.push({ u: us, dr: () => front(fX(h, 0.03), b + 2.0, us, () => {
      x.fillStyle = cs([200, 196, 188], h.s < 0 ? K_SH : K_FR, us); x.beginPath(); x.arc(0, 0, 0.22, 0, Math.PI * 2); x.fill();
      x.fillStyle = cs([168, 52, 44], h.s < 0 ? K_SH : K_FR, us); x.beginPath(); x.arc(0, 0, 0.21, 0, Math.PI * 2); x.arc(0, 0, 0.15, 0, Math.PI * 2, true); x.fill();
      x.fillStyle = cs([52, 84, 140], h.s < 0 ? K_SH : K_FR, us); x.beginPath(); x.arc(0, 0, 0.15, 0, Math.PI * 2); x.fill();
      x.save(); x.rotate(-Math.PI / 4); x.fillStyle = cs([168, 52, 44], h.s < 0 ? K_SH : K_FR, us); x.fillRect(-0.16, -0.025, 0.32, 0.05); x.restore();
    }) });
  };

  // ---------- Балконы и растения ----------
  // куст в горшке (плоский, лицом к зрителю): листья мелкими пятнами, неровный силуэт; kind: 'ger' — герань,
  // 'ivy' — свисающий плющ, 'bush' — зелень повыше. Рисуется в плоскости z = Z, единица — метр
  function plant(X, Y, Z, sz, kind, seed, k) {
    const r = Tex.rng(seed), kk = F / Z;
    if (kk * sz * S < 3) return;
    front(X, Y, Z, () => {
      x.fillStyle = cs([168, 96, 66], k, Z);                              // терракотовый горшок
      x.beginPath(); x.moveTo(-sz * 0.22, 0); x.lineTo(sz * 0.22, 0); x.lineTo(sz * 0.26, sz * 0.32); x.lineTo(-sz * 0.26, sz * 0.32); x.closePath(); x.fill();
      x.fillStyle = cs([138, 76, 52], k, Z); x.fillRect(-sz * 0.27, sz * 0.27, sz * 0.54, sz * 0.06);
      const G = [[52, 78, 44], [70, 100, 52], [92, 122, 62], [44, 64, 40]];
      const n = Math.min(130, Math.round(kk * sz * 2.4)), hgt = kind === 'bush' ? sz * 1.5 : sz * 0.85;
      const g3 = () => (r() + r() + r() - 1.5) / 1.5;                     // плотнее к середине кроны
      // тёмная масса кроны (тень внутри куста), поверх — листья светлее
      const blobs = kind === 'ivy' ? 5 : 7;
      for (let i = 0; i < blobs; i++) {
        const lx = g3() * sz * 0.32, ly = kind === 'ivy' && i % 2 ? sz * 0.2 - r() * sz * 0.9 : sz * 0.3 + hgt * (0.2 + 0.55 * r());
        x.fillStyle = cs([34, 50, 32], k, Z); x.beginPath(); x.ellipse(lx, ly, sz * (0.12 + 0.1 * r()), sz * (0.1 + 0.08 * r()), r() * 3, 0, Math.PI * 2); x.fill();
      }
      for (let i = 0; i < n; i++) {
        let lx, ly;
        if (kind === 'ivy' && i % 2) { lx = g3() * sz * 0.45; ly = sz * 0.3 - r() * r() * sz * 1.5; }
        else { const t = r(); lx = g3() * sz * (0.35 + 0.4 * t); ly = sz * 0.3 + hgt * (1 - t * t) * (0.25 + 0.6 * r()); }
        const c = G[Math.floor(r() * 4)], f = 0.5 + 0.5 * r();
        x.fillStyle = cs(c, k, Z); x.beginPath(); x.ellipse(lx, ly, sz * 0.075 * f, sz * 0.045 * f, r() * 3, 0, Math.PI * 2); x.fill();
      }
      if (kind === 'ger') {
        const FL = [[176, 56, 52], [196, 86, 104], [214, 206, 196]][seed % 3];
        for (let i = 0; i < n / 4; i++) { x.fillStyle = cs(FL, k, Z); x.beginPath(); x.ellipse((r() - 0.5) * sz * 0.9, sz * 0.5 + r() * hgt * 0.6, sz * 0.05, sz * 0.045, 0, 0, Math.PI * 2); x.fill(); }
      }
    });
  }
  // перила: стойки и поручни по ломаной (точки по низу), высота ht
  function rail(pts, ht, u, c) {
    x.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.round(L / 0.11));
      for (let j = 0; j <= n; j++) {
        const t = j / n, X = a[0] + (b[0] - a[0]) * t, Z = a[2] + (b[2] - a[2]) * t, p = P(X, a[1], Z), q = P(X, a[1] + ht, Z);
        x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]);
      }
    }
    x.lineWidth = lw(0.018, u, 0.9); x.strokeStyle = c; x.stroke();
    [ht, 0.06].forEach((dy, i) => {
      x.beginPath(); pts.forEach((p, j) => { const s = P(p[0], p[1] + dy, p[2]); if (j) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); });
      x.lineWidth = lw(i ? 0.03 : 0.045, u, 1.1); x.strokeStyle = c; x.stroke();
    });
  }
  // балкон a..b на уровне пола v: плита на консолях, кованые перила, горшки, полотенце на перилах
  function balcony(h, a, b, v, dp, E) {
    const r = Tex.rng(Math.round(a * 97 + v * 13)), sc = [194, 188, 176], ic = cs([38, 40, 40], 1, a);
    if (h.s < 0) {                                           // мягкая тень под плитой на теневой стене
      const p = P(h.x, v - 0.16, (a + b) / 2), q = P(h.x, v - 1.0, (a + b) / 2), g = x.createLinearGradient(p[0], p[1], q[0], q[1]);
      g.addColorStop(0, 'rgba(20,18,24,0.32)'); g.addColorStop(1, 'rgba(20,18,24,0)');
      x.fillStyle = g; fq(h, a, v - 1.0, b, v - 0.16, 0); x.fill();
    }
    const Xf = fX(h, dp - 0.05), X0 = fX(h, 0.02), ht = 0.98;
    const pots = [];
    for (let u = a + 0.25; u < b - 0.2; u += 0.45 + r() * 0.5) if (r() < 0.7) pots.push([u, ['ger', 'ivy', 'bush'][Math.floor(r() * 3)], Math.floor(r() * 1000)]);
    const towel = r() < 0.45 ? [a + 0.3 + r() * (b - a - 1.0), [[214, 206, 190], [120, 150, 170], [176, 96, 84], [210, 190, 120]][Math.floor(r() * 4)]] : null;
    E.push({
      u: a,
      sh: () => { shq(h, a, b, v - 0.16, v, dp); shq(h, a, b, v + ht - 0.04, v + ht, dp - 0.05); },
      dr: () => {
        rail([[X0, v, b - 0.03], [Xf, v, b - 0.03]], ht, a, ic);                    // дальний бок перил
        fbox(h, a, b, v - 0.16, v, 0, dp, sc);
        if (vis(0.1, a, 2)) for (let u = a + 0.12; u < b - 0.1; u += Math.max(0.5, (b - a - 0.36) / 2)) fbox(h, u, u + 0.12, v - 0.46, v - 0.16, 0, dp - 0.2, tone(sc, -0.06));
        const k = h.s < 0 ? K_SH : [0.86, 0.84, 0.78];
        pots.forEach((p) => plant(fX(h, dp * 0.55), v, p[0], 0.5, p[1], p[2], k));
        rail([[Xf, v, b - 0.03], [Xf, v, a + 0.03], [X0, v, a + 0.03]], ht, a, ic);  // лицевые перила и ближний бок
        if (towel) {
          const t0 = towel[0], t1 = t0 + 0.55;
          x.fillStyle = cs(towel[1], h.s < 0 ? K_SH : K_LIT, t0);
          wp([[fX(h, dp - 0.02), v + ht, t0], [fX(h, dp - 0.02), v + ht, t1], [fX(h, dp - 0.02), v + ht - 0.62, t1], [fX(h, dp - 0.02), v + ht - 0.55, t0]]); x.fill();
        }
      },
    });
  }
  // балконы по программе дома: у этажей из h.lb балконы соседних осей сливаются в один
  function balconies(h, E) {
    const by = {};
    h.ops.forEach((o) => { if (o.k === 'fdoor') (by[o.f] = by[o.f] || []).push(o); });
    Object.keys(by).forEach((f) => {
      const L = by[f].sort((p, q) => p.u0 - q.u0), v = L[0].fb + 0.14;
      if (h.lb && h.lb[f]) balcony(h, L[0].u0 - 0.5, L[L.length - 1].u1 + 0.5, v, 0.8, E);
      else L.forEach((o) => { if (onScr(h, o.u0 - 1, o.u1 + 1, v - 0.5, v + 1.2)) balcony(h, o.u0 - 0.42, o.u1 + 0.42, v, 0.78, E); });
    });
  }

  // ---------- Навесные мелочи ----------
  // v — высота от уровня первого этажа дома (h.base)
  const PROPS = {
    0: [{ k: 'lamp', u: 10.15, v: 3.5 }],
    1: [{ k: 'pipe', u: 10.6 }, { k: 'cable', v: 3.62, u0: 10.6, u1: 18 }, { k: 'plaque', u: 11.2, v: 2.98, t: 'VIA DEL|PORTO' }, { k: 'ac', u: 16.1, v: 4.6 }],
    3: [{ k: 'pipe', u: 21.75 }, { k: 'flag', u: 22.0, v: 3.35, t: '+' }, { k: 'ac', u: 26.5, v: 7.3 }, { k: 'cable', v: 3.9, u0: 21.6, u1: 29.4 }],
    4: [{ k: 'pipe', u: 29.75 }, { k: 'roof', u: 34.6, t: 'pergola' }, { k: 'roof', u: 33.0, t: 'antenna' }],
    5: [{ k: 'pipe', u: 36.75 }, { k: 'lamp', u: 39.7, v: 3.0 }],
    6: [{ k: 'flag', u: 10.35, v: 3.15, t: 'CAFFÈ' }, { k: 'lamp', u: 12.2, v: 4.5 }],
    7: [{ k: 'pipe', u: 12.75 }, { k: 'cable', v: 3.45, u0: 12.6, u1: 19.4 }, { k: 'ac', u: 18.2, v: 4.7 }],
    8: [{ k: 'pipe', u: 19.75 }, { k: 'pipe', u: 27.25 }, { k: 'lamp', u: 24.8, v: 3.7 }, { k: 'ac', u: 22.0, v: 10.4 }, { k: 'dish', u: 24.9, v: 8.3 }],
    9: [{ k: 'cable', v: 5.3, u0: 27.6, u1: 35 }, { k: 'roof', u: 31.0, t: 'antenna' }, { k: 'roof', u: 33.4, t: 'pergola' }],
    10: [{ k: 'pipe', u: 35.2 }, { k: 'flag', u: 35.45, v: 7.4, t: 'HOTEL' }],
  };
  const IRON = [38, 40, 40];
  // водосточная труба с хомутами и коленом у тротуара
  function pipe(h, u, E) {
    const b = swY(u), top = h.roof + (h.top === 'eave' ? 0.08 : -0.12), c = h.pc || [148, 142, 134];
    E.push({ u: u - 0.06, sh: () => shq(h, u - 0.055, u + 0.055, b + 0.25, top, 0.14), dr: () => {
      fbox(h, u - 0.055, u + 0.055, b + 0.25, top, 0.03, 0.14, c);
      if (vis(0.05, u, 2)) for (let v = b + 1.3; v < top - 0.4; v += 1.9) fbox(h, u - 0.07, u + 0.07, v, v + 0.06, 0.02, 0.155, tone(c, -0.18));
      fbox(h, u - 0.055, u + 0.055, b + 0.02, b + 0.25, 0.03, 0.32, c);
    } });
  }
  // настенный фонарь на кованом кронштейне (днём не горит)
  function lantern(h, u, v, E) {
    E.push({ u: u, dr: () => front(fX(h, 0), v, u, (kk) => {
      const n = h.n, ic = cs(IRON, 1, u), t = Math.max(0.022, 0.9 / kk), cx = n * 0.56;
      x.fillStyle = ic; x.fillRect(Math.min(0, n * 0.6), -t, 0.6, 2 * t);
      x.strokeStyle = ic; x.lineWidth = 2 * t; x.beginPath(); x.moveTo(0, -0.34); x.quadraticCurveTo(n * 0.08, -0.04, n * 0.42, -t); x.stroke();
      x.fillRect(cx - t, -0.09, 2 * t, 0.09);
      x.beginPath(); x.moveTo(cx - 0.07, -0.08); x.lineTo(cx + 0.07, -0.08); x.lineTo(cx + 0.17, -0.18); x.lineTo(cx - 0.17, -0.18); x.closePath(); x.fill();
      x.fillStyle = cs([200, 194, 174], h.s < 0 ? K_SH : K_FR, u);
      x.beginPath(); x.moveTo(cx - 0.14, -0.18); x.lineTo(cx + 0.14, -0.18); x.lineTo(cx + 0.1, -0.46); x.lineTo(cx - 0.1, -0.46); x.closePath(); x.fill();
      x.fillStyle = ic; x.fillRect(cx - t * 0.6, -0.46, t * 1.2, 0.28); x.fillRect(cx - 0.12, -0.5, 0.24, 0.05); x.fillRect(cx - t, -0.58, 2 * t, 0.08);
    }) });
  }
  // флаговая вывеска поперёк стены: аптечный крест, вертикальная HOTEL или доска с надписью
  function flag(h, u, v, t, E) {
    E.push({ u: u, dr: () => front(fX(h, 0), v, u, (kk) => {
      const n = h.n, k = h.s < 0 ? K_SH : K_FR, ic = cs(IRON, 1, u), tt = Math.max(0.02, 0.8 / kk);
      const txt = (s, cx, cy, sz, col) => {
        x.save(); x.translate(cx, cy); x.scale(0.01, -0.01); x.font = '700 ' + Math.round(sz * 100) + 'px Georgia, "Times New Roman", serif';
        x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = cs(col, k, u); x.fillText(s, 0, 0); x.restore();
      };
      if (t === '+') {
        const c = n * 0.55;
        x.fillStyle = ic; x.fillRect(Math.min(0, n * 0.25), -tt, 0.25, 2 * tt);
        x.fillStyle = cs([226, 224, 216], k, u); x.fillRect(c - 0.33, -0.66, 0.66, 0.66);
        x.fillStyle = cs([58, 128, 84], k, u); x.fillRect(c - 0.08, -0.6, 0.16, 0.54); x.fillRect(c - 0.27, -0.41, 0.54, 0.16);
      } else if (t === 'HOTEL') {
        const c = n * 0.62;
        x.fillStyle = ic; x.fillRect(Math.min(0, n * 0.4), 0.02, 0.4, 2 * tt); x.fillRect(Math.min(0, n * 0.4), -2.0, 0.4, 2 * tt);
        x.fillStyle = cs([236, 232, 222], k, u); x.fillRect(c - 0.27, -2.2, 0.54, 2.3);
        x.fillStyle = cs([44, 66, 102], k, u); x.fillRect(c - 0.23, -2.16, 0.46, 2.22);
        'HOTEL'.split('').forEach((ch, i) => txt(ch, c, -0.2 - i * 0.42, 0.34, [236, 230, 214]));
      } else {
        const c = n * 0.66;
        x.fillStyle = ic; x.fillRect(Math.min(0, n * 1.15), -tt, 1.15, 2 * tt);
        x.fillRect(n * 0.24 - tt, -0.56, 2 * tt, 0.56); x.fillRect(n * 1.08 - tt, -0.56, 2 * tt, 0.56);
        x.fillStyle = cs([92, 42, 38], k, u); x.fillRect(c - 0.46, -0.62, 0.92, 0.5);
        x.strokeStyle = cs([214, 196, 160], k, u); x.lineWidth = 0.025; x.strokeRect(c - 0.42, -0.58, 0.84, 0.42);
        txt(t, c, -0.37, 0.25, [236, 222, 190]);
      }
    }) });
  }
  // кондиционер: короб с решёткой вентилятора и потёк под ним
  function acUnit(h, u, v, E) {
    const u1 = u + 0.84, v1 = v + 0.58, d = 0.3, c = [212, 210, 202];
    E.push({ u: u, sh: () => shq(h, u, u1, v - 0.06, v1, d), dr: () => {
      fbox(h, u + 0.08, u + 0.14, v - 0.08, v, 0, d, IRON); fbox(h, u1 - 0.14, u1 - 0.08, v - 0.08, v, 0, d, IRON);
      fbox(h, u, u1, v, v1, 0, d, c);
      const X = fX(h, d + 0.002), cu = u + 0.52, cv = v + 0.29, R = 0.2;
      x.fillStyle = cs([96, 98, 98], lite(h, 'wall'), u); x.beginPath();
      for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, p = P(X, cv + R * Math.sin(a), cu + R * Math.cos(a)); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }
      x.closePath(); x.fill();
    } });
  }
  // кабель по фасаду на скобах, с лёгким провисом между ними
  function cable(h, v, ua, ub, E) {
    E.push({ u: ua, dr: () => {
      const X = fX(h, 0.05), w = Math.max(1.6, F * 0.02 / ((ua + ub) / 2)) * (S < 0.5 ? 0.6 : 1);
      [[0, cs([26, 26, 28], 1, ua)], [1, h.s > 0 ? 'rgba(40,46,70,0.22)' : null]].forEach((L) => {
        if (!L[1]) return;
        x.beginPath();
        for (let u = ua; u <= ub; u += 0.2) {
          const ph = ((u - ua) % 1.8) / 1.8, vv = v - 0.07 * Math.sin(Math.PI * ph) - L[0] * 0.08, p = P(X, vv, u + L[0] * 0.06);
          if (u === ua) x.moveTo(p[0], p[1]); else x.lineTo(p[0], p[1]);
        }
        x.lineWidth = w; x.strokeStyle = L[1]; x.stroke();
      });
    } });
  }
  // мраморная табличка с названием улицы
  function plaque(h, u, v, t, E) {
    E.push({ u: u - 0.3, dr: () => {
      fbox(h, u - 0.3, u + 0.3, v, v + 0.34, 0, 0.025, [222, 218, 208]);
      t.split('|').forEach((s, i) => wallText(h, s, u, v + 0.2 - i * 0.12, 0.075, 0.026, [52, 50, 48], '700 100px Arial, sans-serif'));
    } });
  }
  // на плоской крыше за парапетом: перголa с навесом или телеантенна
  function roofItem(h, u, t, E) {
    const r = h.roof, d = -0.5;
    E.push({ u: u, dr: () => {
      if (t === 'antenna') {
        const X = fX(h, d - 0.4), z = u;
        wline([[X, r - 0.2, z], [X, r + 3.2, z]], lw(0.05, z, 1.4), cs([70, 72, 72], 1, z));
        [2.2, 2.7, 3.1].forEach((y, i) => wline([[X, r + y, z - 0.5 + i * 0.1], [X, r + y, z + 0.5 - i * 0.1]], lw(0.03, z, 1), cs([70, 72, 72], 1, z)));
      } else {
        const z0 = u - 1.4, z1 = u + 1.4, Xa = fX(h, d), Xb = fX(h, d - 2.4), y = r + 1.5, wc = cs([92, 70, 52], 1, z0);
        [[Xa, z0], [Xa, z1]].forEach((p) => wline([[p[0], r, p[1]], [p[0], y, p[1]]], lw(0.07, z0, 1.3), wc));
        x.fillStyle = cs([196, 176, 128], kN(0, -1, 0), z0); wp([[Xa, y, z0], [Xa, y, z1], [Xb, y + 0.15, z1], [Xb, y + 0.15, z0]]); x.fill();
        plant(fX(h, d + 0.4), r - 0.1, z0 + 0.4, 0.9, 'bush', Math.round(u * 10), h.s < 0 ? K_SH : K_FR);
      }
    } });
  }
  // спутниковая тарелка на кронштейне: светлое блюдце под углом и облучатель
  function dish(h, u, v, E) {
    E.push({ u: u, sh: () => shq(h, u - 0.3, u + 0.3, v - 0.3, v + 0.3, 0.35), dr: () => front(fX(h, 0), v, u, (kk) => {
      const n = h.n, t = Math.max(0.02, 0.9 / kk), k = h.s < 0 ? K_SH : K_FR;
      x.fillStyle = cs([120, 122, 120], 1, u); x.fillRect(Math.min(0, n * 0.3), -t, 0.3, 2 * t);
      x.save(); x.translate(n * 0.4, 0.05); x.rotate(n * 0.5);
      x.fillStyle = cs([214, 214, 208], k, u); x.beginPath(); x.ellipse(0, 0, 0.13, 0.36, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = cs([150, 150, 146], k, u); x.beginPath(); x.ellipse(-n * 0.03, 0, 0.06, 0.3, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = cs([90, 92, 92], 1, u); x.lineWidth = 2 * t; x.beginPath(); x.moveTo(0, 0); x.lineTo(n * 0.42, -0.05); x.stroke();
      x.restore();
    }) });
  }
  function props(h, E) {
    (PROPS[HOUSES.indexOf(h)] || []).forEach((p) => {
      const v = h.base + (p.v || 0);
      if (p.k === 'pipe') pipe(h, p.u, E);
      else if (p.k === 'lamp') lantern(h, p.u, v, E);
      else if (p.k === 'flag') flag(h, p.u, v, p.t, E);
      else if (p.k === 'ac') acUnit(h, p.u, v, E);
      else if (p.k === 'cable') cable(h, v, Math.max(p.u0, 7), p.u1, E);
      else if (p.k === 'plaque') plaque(h, p.u, v, p.t, E);
      else if (p.k === 'roof') roofItem(h, p.u, p.t, E);
      else if (p.k === 'dish') dish(h, p.u, v, E);
    });
  }

  function drawHouse(h, near) {
    const u0 = Math.max(ZC, h.z0), E = [];
    layout(h);
    roofSlope(h, u0);
    chimneys(h);
    if (h.z0 >= ZC) endFace(h, near);
    wallBody(h, u0);
    bands(h, u0, E);
    h.ops.forEach((o) => {
      if (!onScr(h, o.u0 - 1, o.u1 + 1, o.v0 - 0.3, o.v1 + 0.5)) return;
      if (o.k === 'win' || o.k === 'fdoor') windowAt(h, o, E);
      else if (OPEN[o.k]) OPEN[o.k](h, o, E);
    });
    balconies(h, E);
    props(h, E);
    roofEdge(h, u0, E);
    E.forEach((e) => e.sh && e.sh());
    flushSh(h);
    E.sort((a, b) => b.u - a.u).forEach((e) => e.dr());
  }
  // дома каждой стороны — от дальних к ближним (ближние перекрывают дальние)
  function facades() {
    [-1, 1].forEach((s) => {
      const hs = HOUSES.filter((h) => h.s === s).sort((a, b) => b.z0 - a.z0);
      hs.forEach((h, i) => drawHouse(h, hs[i + 1] || null));
    });
  }

  // ---------- Над улицей: провода, бельё, подвесной фонарь ----------
  // освещена ли точка: луч к солнцу не упирается в левые дома
  function sunlit(X, Y, Z) {
    const t = (X - XL) / 0.5;
    if (t <= 0) return false;
    const Yh = Y + 0.72 * t, Zh = Z - 0.48 * t, hh = HOUSES.filter((h) => h.s < 0 && Zh >= h.z0 && Zh < h.z1)[0];
    return !hh || Yh > hh.roof + 0.4;
  }
  // [X0, Y0, Z0, X1, Y1, Z1, провис]
  const WIRES = [
    [-5.5, 6.4, 17.4, 6.4, 6.8, 18.3, 0.45], [-5.5, 5.95, 17.7, 6.4, 6.15, 17.9, 0.55],
    [-5.8, 7.8, 22.9, 6.1, 8.2, 21.6, 0.5], [-5.8, 7.6, 33.2, 6.4, 7.1, 31.6, 0.42], [-5.8, 9.0, 41.0, 6.4, 8.6, 39.2, 0.5],
  ];
  const LINES = [
    { a: [-5.8, 7.25, 24.9], b: [6.1, 7.55, 25.6], sag: 0.42, seed: 7 },
    { a: [-5.8, 6.4, 38.2], b: [6.4, 6.7, 38.9], sag: 0.3, seed: 11, gap: 1.1 },
  ];
  const CLOTH = [[228, 224, 214], [194, 206, 214], [172, 86, 74], [208, 184, 122], [66, 86, 120], [214, 182, 176], [124, 142, 104], [236, 234, 228]];
  // вещь на верёвке: простыня, полотенце, рубашка, брюки; висит вниз от точки крепления, лицом к зрителю
  function cloth(X, Y, Z, kind, w, hh, col, r) {
    const k = sunlit(X, Y - hh / 2, Z) ? K_FR : K_SH;
    front(X, Y, Z, () => {
      const sw = (r() - 0.5) * 0.12, a = w / 2;
      x.save(); x.transform(1, 0, sw, 1, 0, 0);
      x.beginPath();
      if (kind === 'shirt') {
        x.moveTo(-a, 0); x.lineTo(a, 0); x.lineTo(a + 0.16, -0.24); x.lineTo(a * 0.8, -0.3); x.lineTo(a * 0.8, -hh); x.lineTo(-a * 0.8, -hh); x.lineTo(-a * 0.8, -0.3); x.lineTo(-a - 0.16, -0.24);
      } else if (kind === 'pants') {
        x.moveTo(-a, 0); x.lineTo(a, 0); x.lineTo(a * 0.95, -hh); x.lineTo(0.03, -hh); x.lineTo(0, -hh * 0.32); x.lineTo(-0.03, -hh); x.lineTo(-a * 0.95, -hh);
      } else {
        x.moveTo(-a, 0); x.lineTo(a, 0); x.lineTo(a, -hh * 0.96);
        x.quadraticCurveTo(a * 0.5, -hh * 1.04, 0, -hh); x.quadraticCurveTo(-a * 0.5, -hh * 0.96, -a, -hh * 1.02);
      }
      x.closePath(); x.fillStyle = cs(col, k, Z); x.fill();
      // складки: тёмные вертикальные полосы
      const g = x.createLinearGradient(-a, 0, a, 0);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, 'rgba(40,44,60,' + (i % 2 ? 0.16 : 0.02) + ')');
      x.fillStyle = g; x.fill();
      x.restore();
      x.fillStyle = cs([90, 80, 70], 1, Z); x.fillRect(-a + 0.04, -0.06, 0.03, 0.1); x.fillRect(a - 0.07, -0.06, 0.03, 0.1);
    });
  }
  function laundryLine(L) {
    const pts = sagPts(L.a, L.b, L.sag, 30), zm = (L.a[2] + L.b[2]) / 2, len = Math.hypot(L.b[0] - L.a[0], L.b[2] - L.a[2]);
    wline(pts, Math.max(1.2, F * 0.014 / zm), cs([70, 66, 62], 1, zm));
    const r = Tex.rng(L.seed);
    let t = 0.07;
    while (t < 0.9) {
      const kind = ['sheet', 'shirt', 'towel', 'pants', 'shirt', 'towel'][Math.floor(r() * 6)];
      const w = kind === 'sheet' ? 1.3 + r() * 0.4 : kind === 'towel' ? 0.55 + r() * 0.2 : kind === 'pants' ? 0.46 : 0.56;
      const hh = kind === 'sheet' ? 1.1 + r() * 0.3 : kind === 'towel' ? 0.8 + r() * 0.2 : kind === 'pants' ? 0.95 : 0.72;
      const tc = t + w / 2 / len;
      if (tc > 0.93) break;
      const X = L.a[0] + (L.b[0] - L.a[0]) * tc, Z = L.a[2] + (L.b[2] - L.a[2]) * tc, Y = L.a[1] + (L.b[1] - L.a[1]) * tc - L.sag * 4 * tc * (1 - tc);
      cloth(X, Y + 0.02, Z, kind, w, hh, CLOTH[Math.floor(r() * CLOTH.length)], r);
      t += (w + 0.12 + r() * 0.35 + (L.gap ? L.gap * (0.4 + r()) : 0)) / len;
    }
  }
  // подвесной уличный светильник на тросе поперёк улицы
  function hangLamp(X, Y, Z) {
    front(X, Y, Z, (k) => {
      const t = Math.max(0.015, 0.8 / k), lit = sunlit(X, Y, Z) ? K_FR : K_SH;
      x.fillStyle = cs(IRON, 1, Z); x.fillRect(-t, -0.34, 2 * t, 0.34);
      x.beginPath(); x.moveTo(-0.07, -0.32); x.lineTo(0.07, -0.32); x.lineTo(0.27, -0.52); x.lineTo(-0.27, -0.52); x.closePath();
      x.fillStyle = cs([58, 74, 66], lit, Z); x.fill();
      x.fillStyle = cs([206, 204, 196], K_SH, Z); x.fillRect(-0.25, -0.55, 0.5, 0.03);
      x.fillStyle = cs([220, 214, 196], K_SH, Z); x.beginPath(); x.ellipse(0, -0.58, 0.07, 0.06, 0, 0, Math.PI * 2); x.fill();
    });
  }
  function overhead() {
    // провода — от дальних к ближним
    WIRES.slice().sort((p, q) => q[2] - p[2]).forEach((w) => {
      const zm = (w[2] + w[5]) / 2;
      wline(sagPts([w[0], w[1], w[2]], [w[3], w[4], w[5]], w[6], 28), Math.max(1.6, F * 0.022 / zm), cs([34, 34, 36], 1, zm));
    });
    LINES.slice().sort((p, q) => q.a[2] - p.a[2]).forEach(laundryLine);
    // трос с фонарём посередине улицы
    const a = [-5.5, 6.95, 20.2], b = [6.4, 7.25, 20.6], tc = 0.48;
    wline(sagPts(a, b, 0.32, 28), Math.max(1.6, F * 0.022 / 20.4), cs([34, 34, 36], 1, 20.4));
    hangLamp(a[0] + (b[0] - a[0]) * tc, a[1] + (b[1] - a[1]) * tc - 0.32 * 4 * tc * (1 - tc), a[2] + (b[2] - a[2]) * tc);
  }

  // ---------- Улица и набережная: мелочи на земле ----------
  // чугунный фонарный столб: основание, ствол с кольцами, фонарь-кадильник; лицом к зрителю
  function lampPost(X, Z, ht) {
    const b = gY(Z) + (Z < ZEND ? CURB : 0), lit = K_FR, ic = [44, 52, 50];
    front(X, b, Z, (k) => {
      const t = Math.max(0.05, 1.1 / k);
      x.fillStyle = cs(ic, lit, Z);
      x.beginPath(); x.moveTo(-0.17, 0); x.lineTo(0.17, 0); x.lineTo(0.1, 0.55); x.lineTo(-0.1, 0.55); x.closePath(); x.fill();
      x.fillRect(-t, 0.5, 2 * t, ht - 0.5);
      [1.1, ht - 0.9].forEach((y) => x.fillRect(-t * 1.8, y, t * 3.6, 0.07));
      x.fillRect(-0.3, ht - 0.1, 0.6, 0.06);
      x.beginPath(); x.moveTo(-0.22, ht); x.lineTo(0.22, ht); x.lineTo(0.15, ht + 0.12); x.lineTo(-0.15, ht + 0.12); x.closePath(); x.fill();
      x.fillStyle = cs([206, 202, 186], lit, Z);
      x.beginPath(); x.moveTo(-0.15, ht + 0.12); x.lineTo(0.15, ht + 0.12); x.lineTo(0.2, ht + 0.55); x.lineTo(-0.2, ht + 0.55); x.closePath(); x.fill();
      x.fillStyle = cs(ic, lit, Z);
      x.beginPath(); x.moveTo(-0.26, ht + 0.55); x.lineTo(0.26, ht + 0.55); x.lineTo(0, ht + 0.82); x.closePath(); x.fill();
      x.fillRect(-t, ht + 0.8, 2 * t, 0.12);
    });
    // тень столба на земле — вправо-вглубь от солнца
    const p = gsh(X, ht, Z);
    x.strokeStyle = 'rgba(40,46,70,0.28)'; x.lineWidth = Math.max(1.5, F * 0.1 / Z);
    x.beginPath(); const a = P(X, b, Z), c = P(p[0], gY(p[1]) + (p[1] < ZEND ? CURB : 0), p[1]); x.moveTo(a[0], a[1]); x.lineTo(c[0], c[1]); x.stroke();
  }
  // швартовая тумба-гриб у края причала
  function bollard(X, Z) {
    front(X, QY, Z, () => {
      x.fillStyle = cs([48, 52, 52], K_FR, Z);
      x.beginPath(); x.moveTo(-0.16, 0); x.lineTo(0.16, 0); x.lineTo(0.12, 0.42); x.lineTo(0.2, 0.5); x.lineTo(0.2, 0.6); x.lineTo(-0.2, 0.6); x.lineTo(-0.2, 0.5); x.lineTo(-0.12, 0.42); x.closePath(); x.fill();
      x.fillStyle = cs([150, 154, 150], K_FR, Z, 0.5); x.fillRect(-0.18, 0.52, 0.12, 0.06);
    });
  }
  // скамья спинкой к зрителю: доски и чугунные ножки
  function bench(X, Z) {
    front(X, QY, Z, () => {
      x.fillStyle = cs([40, 44, 44], K_FR, Z); x.fillRect(-0.85, 0, 0.08, 0.85); x.fillRect(0.77, 0, 0.08, 0.85);
      x.fillStyle = cs([132, 96, 64], K_FR, Z); [0.45, 0.62, 0.78].forEach((y) => x.fillRect(-0.95, y, 1.9, 0.1));
    });
  }
  // большой терракотовый горшок с кустом у стены на тротуаре
  function bigPot(s, u, kind, seed) {
    const h = HOUSES.filter((q) => q.s === s && u >= q.z0 && u < q.z1)[0];
    if (!h) return;
    const X = fX(h, 0.45), b = swY(u), k = h.s < 0 ? K_SH : K_FR;
    front(X, b, u, () => {
      x.fillStyle = cs([164, 92, 62], k, u);
      x.beginPath(); x.moveTo(-0.22, 0); x.lineTo(0.22, 0); x.lineTo(0.3, 0.5); x.lineTo(-0.3, 0.5); x.closePath(); x.fill();
      x.fillStyle = cs([134, 74, 50], k, u); x.fillRect(-0.32, 0.46, 0.64, 0.07);
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(-0.22, 0, 0.44, 0.06);
    });
    plant(X, b + 0.5, u, 1.0, kind, seed, k);
  }
  // крышка колодца на мостовой: круг в перспективе
  function manhole(X, Z, R) {
    const ring = (r, c) => {
      x.beginPath();
      for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, p = P(X + r * Math.cos(a), gY(Z + r * Math.sin(a)) + 0.005, Z + r * Math.sin(a)); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }
      x.closePath(); x.fillStyle = c; x.fill();
    };
    const lit = !inShadow(X, Z), k = lit ? K_TOP : K_SH;
    ring(R + 0.06, cs([64, 60, 56], k)); ring(R, cs([92, 88, 82], k)); ring(R * 0.62, cs([80, 76, 72], k));
  }
  function streetProps() {
    manhole(1.3, 11.5, 0.36);
    manhole(-1.6, 27.0, 0.36);
    bigPot(1, 17.0, 'bush', 3); bigPot(-1, 28.7, 'bush', 5); bigPot(1, 38.4, 'bush', 7); bigPot(1, 40.7, 'ger', 8); bigPot(-1, 37.2, 'ivy', 9);
    bench(-3.6, 57.5);
    bollard(-1.4, 59.4); bollard(4.2, 59.4);
    lampPost(1.9, 56.5, 3.9);
  }
  // дымовые трубы и антенны на скатах дальних домов (видны над карнизом)
  const CHIM = [[5, 38.6, -2.4], [5, 43.2, -3.2], [10, 37.4, -2.8], [10, 41.6, -2.0], [3, 27.8, -2.2]];
  function chimneys(h) {
    CHIM.filter((c) => HOUSES[c[0]] === h).forEach((c) => {
      const u = c[1], d = c[2], r = h.roof + 0.2 + (0.66 - d) * 0.4, top = r + 1.3;
      const A = fX(h, d), B = fX(h, d - 0.55), col = [196, 170, 140];
      x.fillStyle = cs(col, h.s < 0 ? K_FR : K_LIT, u); wr(A, u, r - 0.3, u + 0.6, top); x.fill();
      x.fillStyle = cs(col, K_FR, u); wp([[A, r - 0.3, u], [B, r - 0.3, u], [B, top, u], [A, top, u]]); x.fill();
      x.fillStyle = cs([150, 84, 62], K_FR, u); wp([[fX(h, d + 0.1), top, u - 0.1], [fX(h, d - 0.65), top, u - 0.1], [fX(h, d - 0.65), top + 0.12, u - 0.1], [fX(h, d + 0.1), top + 0.12, u - 0.1]]); x.fill();
      wr(fX(h, d + 0.1), u - 0.1, top, u + 0.7, top + 0.12); x.fill();
    });
  }

  const coastScene = function (ctx, rnd, th, o) {
    x = ctx; S = o.scale || 1;
    sky(); headland(); seaView(); breakwater(); lighthouse(); harbour();
    quay(); street(); sidewalks(); collectShadows(); groundShadows();
    facades();
    streetProps();
    overhead();
    x = null;
  };
  Backgrounds.scene('coast', coastScene);
})();
