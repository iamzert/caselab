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
  const XL = -5.8, XR = 6.4;           // линии фасадов
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
  // горизонтальный прямоугольник на высоте y
  const hr = (y, x0, z0, x1, z1) => wp([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
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

  // ящик X0..X1 × Y0..Y1 × Z0..Z1 — рисуются видимые грани; lit — освещён ли он солнцем
  function box(X0, X1, Y0, Y1, Z0, Z1, c, lit, zf) {
    const z = zf == null ? Z0 : zf;
    x.fillStyle = cs(c, lit ? K_FR : K_SH, z); fr(Z0, X0, Y0, X1, Y1); x.fill();
    if (X1 < 0) { x.fillStyle = cs(c, lit ? kN(1, 0, 0) : K_SH, z); wr(X1, Z0, Y0, Z1, Y1); x.fill(); }
    if (X0 > 0) { x.fillStyle = cs(c, lit ? K_LIT : K_SH, z); wr(X0, Z0, Y0, Z1, Y1); x.fill(); }
    if (Y1 < EYE) { x.fillStyle = cs(c, lit ? K_TOP : K_SH, z); hr(Y1, X0, Z0, X1, Z1); x.fill(); }
    if (Y0 > EYE) { x.fillStyle = cs(c, lit ? K_SH : K_DK, z); hr(Y0, X0, Z0, X1, Z1); x.fill(); }
  }

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
  function texPlaster() {
    const a = vnoise(11, 8), b = vnoise(12, 16), c = vnoise(13, 64), s = vnoise(14, 32);
    return tile('plaster', 256, (i, j, d, o) => {
      let t = a(i / 32, j / 32) * 0.5 + b(i / 16, j / 16) * 0.3 + c(i / 4, j / 4) * 0.28;
      t += s(i / 8, j / 64) * 0.35;                       // вертикальные потёки
      if (t < 0) { d[o] = 74; d[o + 1] = 60; d[o + 2] = 46; d[o + 3] = cl(-t * 330); }
      else { d[o] = 255; d[o + 1] = 250; d[o + 2] = 238; d[o + 3] = cl(t * 200); }
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

  // натянуть узор на стену X = w (аффинно по узким вертикальным полосам — перспектива держится)
  // tpm — пикселей тайла на метр
  function wallTex(w, z0, z1, y0, y1, img, tpm, alpha) {
    const pat = x.createPattern(img, 'repeat');
    const n = Math.max(1, Math.min(14, Math.ceil(Math.abs(sx(w, z0) - sx(w, z1)) / 70)));
    x.save(); x.globalAlpha = alpha; x.fillStyle = pat;
    for (let k = 0; k < n; k++) {
      const za = 1 / (1 / z0 + (1 / z1 - 1 / z0) * k / n), zb = 1 / (1 / z0 + (1 / z1 - 1 / z0) * (k + 1) / n);
      x.save(); wr(w, za, y0, zb, y1); x.clip();
      const A = P(w, y1, za), B = P(w, y1, zb), D = P(w, y0, za);
      const ax = (B[0] - A[0]) / (zb - za), ay = (B[1] - A[1]) / (zb - za);
      const bx = (D[0] - A[0]) / (y1 - y0), by = (D[1] - A[1]) / (y1 - y0);
      x.transform(ax / tpm, ay / tpm, bx / tpm, by / tpm, A[0] - za * ax + y1 * bx, A[1] - za * ay + y1 * by);
      x.fillRect(za * tpm - 2, -y1 * tpm - 2, (zb - za) * tpm + 4, (y1 - y0) * tpm + 4);
      x.restore();
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
    { s: -1, x: -5.8, z0: 21.5, z1: 29.5, fl: [4.0, 3.1, 3.1, 3.1], top: 'eave', col: [206, 152, 122], sh: [86, 108, 128] },
    { s: -1, x: -6.0, z0: 29.5, z1: 36.5, fl: [3.6, 3.0, 3.0], top: 'flat', col: [234, 230, 220], sh: [76, 110, 146] },
    { s: -1, x: -5.8, z0: 36.5, z1: 46, fl: [4.0, 3.1, 3.1, 3.1], top: 'eave', col: [222, 194, 132], sh: [62, 92, 70] },
    { s: 1, x: 6.4, z0: -12, z1: 12.5, fl: [4.0, 3.1, 3.1, 3.1], top: 'eave', col: [222, 180, 146], sh: [104, 78, 58] },
    { s: 1, x: 6.4, z0: 12.5, z1: 19.5, fl: [3.8, 3.0, 3.0], top: 'eave', col: [236, 232, 222], sh: [70, 104, 80] },
    { s: 1, x: 6.1, z0: 19.5, z1: 27.5, fl: [4.0, 3.1, 3.1, 3.1, 3.1], top: 'eave', col: [214, 176, 116], sh: [64, 110, 112] },
    { s: 1, x: 6.4, z0: 27.5, z1: 35, fl: [3.6, 3.0, 3.0], top: 'flat', col: [198, 136, 104], sh: [92, 108, 72] },
    { s: 1, x: 6.4, z0: 35, z1: 44, fl: [4.0, 3.1, 3.1, 3.1], top: 'eave', col: [222, 194, 180], sh: [62, 104, 112] },
  ];
  HOUSES.forEach((h) => {
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

  // временная разметка: мостовая и плоские стены (заменяется по ходу работы)
  function blockout() {
    const L = [[2, 10.5, 10.7], [10.5, 18, 13.4], [21.5, 29.5, 13.8], [29.5, 36.5, 10.6], [36.5, 46, 13.8]];
    const Rr = [[2, 12.5, 13.3], [12.5, 19.5, 9.8], [19.5, 27.5, 16.4], [27.5, 35, 10.4], [35, 44, 13.3]];
    L.slice().reverse().forEach((b, i) => {
      x.fillStyle = cs([[214, 178, 122], [228, 214, 186], [204, 148, 118], [232, 228, 218], [222, 196, 132]][4 - i], K_SH);
      wp([[XL, gY(b[0]), b[0]], [XL, gY(b[1]), b[1]], [XL, gY(b[0]) + b[2], b[1]], [XL, gY(b[0]) + b[2], b[0]]]); x.fill();
    });
    Rr.slice().reverse().forEach((b, i) => {
      x.fillStyle = cs([[222, 178, 142], [236, 232, 222], [212, 172, 110], [196, 128, 96], [228, 214, 186]][4 - i], K_LIT);
      wp([[XR, gY(b[0]), b[0]], [XR, gY(b[1]), b[1]], [XR, gY(b[0]) + b[2], b[1]], [XR, gY(b[0]) + b[2], b[0]]]); x.fill();
    });
  }

  const coastScene = function (ctx, rnd, th, o) {
    x = ctx; S = o.scale || 1;
    sky(); headland(); seaView(); breakwater(); lighthouse(); harbour();
    quay(); street(); sidewalks(); collectShadows(); groundShadows();
    blockout();
    x = null;
  };
  // Сцена ещё не готова: фасады пока временные болванки blockout() (дальний план, мостовая и тени готовы).
  // До готовности в игре показывается запасной размытый рисунок из js/bg.js. Когда фасады будут
  // дорисованы, верните регистрацию:
  //   Backgrounds.scene('coast', coastScene);
  void coastScene;
})();
