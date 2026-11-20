'use strict';

// Фон-локация «Северная база» (snow): арктическая база в пасмурный день, 1920 × 1080.
// Однточечная перспектива: глаз на высоте 1,75 м, точка схода (960, 490). Все размеры — в метрах,
// проекция P(X, Y, Z) честная (X — вправо, Y — вверх, Z — вглубь), поэтому все уходящие линии
// сходятся в одну точку, а ряды окон и столбы сами сжимаются с глубиной.
// Свет: тонкая облачность, низкое солнце слева (чуть со стороны зрителя) пробивается слабо —
// мягкие голубые тени ложатся поперёк дороги слева направо.
// Всё рисуется через преобразование контекста; попиксельные карты — на своих холстах (drawImage).
(function () {
  const W = 1920, H = 1080, F = 1000, CX = 960, CY = 490, EYE = 1.75;
  // направление на солнце (единичный вектор): слева, немного сзади, ~38° над горизонтом (за облаками)
  const SUN = (function () { const v = [-0.7, 0.62, -0.36], l = Math.hypot(v[0], v[1], v[2]); return v.map((c) => c / l); })();
  const SHX = -SUN[0] / SUN[1], SHZ = -SUN[2] / SUN[1];   // смещение тени на земле на 1 м высоты
  const HAZE = [188, 194, 200], ZH = 350;                  // цвет и глубина дымки (м)

  let x = null, K = 1;   // контекст и масштаб текущей отрисовки (1 — фон, 0.2 — миниатюра)

  // ---------- Мелкие помощники ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  function hex(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function mul(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
  function css(c, a) {
    const r = Math.round(clamp(c[0], 0, 255)), g = Math.round(clamp(c[1], 0, 255)), b = Math.round(clamp(c[2], 0, 255));
    return a === undefined || a >= 1 ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, a).toFixed(3) + ')';
  }
  const fog = (c, z) => mix(c, HAZE, 1 - Math.exp(-z / ZH));
  // освещённость граней: F — к камере (на солнце), Rt — стены правой стороны (смотрят влево, к солнцу),
  // L — стены левой стороны (смотрят вправо, в тени), T — верх, B — низ (подсвечен снегом)
  const FACE = { F: 0.9, Rt: 0.98, L: 0.7, T: 1.06, B: 0.5 };
  const lit = (c, f, z) => fog(mul(c, typeof f === 'number' ? f : FACE[f]), z);

  // ---------- Проекция ----------
  function P(X, Y, Z) { return [CX + F * X / Z, CY - F * (Y - EYE) / Z]; }
  const gy = (Z) => CY + F * EYE / Z;            // экранная высота земли на глубине Z
  const lw = (t, z, mn) => Math.max(mn || 1, F * t / z);   // толщина линии t (м) на глубине z, px
  function path3(pts) {
    x.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = P(pts[i][0], pts[i][1], pts[i][2]);
      if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]);
    }
    x.closePath();
  }
  function fill3(pts, style) { path3(pts); x.fillStyle = style; x.fill(); }
  function line3(a, b, w, style) {
    const p = P(a[0], a[1], a[2]), q = P(b[0], b[1], b[2]);
    x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.lineWidth = w; x.strokeStyle = style; x.stroke();
  }
  function poly2(pts) { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); }
  // заливка боковой стены X = const с дымкой, меняющейся вдоль глубины (градиент по экранной оси x)
  function sideFill(c, f, X, z0, z1) {
    if (z1 - z0 < 3) return css(lit(c, f, (z0 + z1) / 2));
    const a = P(X, 0, z0)[0], b = P(X, 0, z1)[0];
    if (Math.abs(b - a) < 1) return css(lit(c, f, (z0 + z1) / 2));
    const g = x.createLinearGradient(a, 0, b, 0);
    for (let i = 0; i <= 4; i++) {
      const z = z0 + (z1 - z0) * i / 4;
      g.addColorStop(clamp((P(X, 0, z)[0] - a) / (b - a), 0, 1), css(lit(c, f, z)));
    }
    return g;
  }
  // Ящик по осям; c — цвет [r,g,b] или { F, S, T } — разные цвета граней. Рисуются только видимые грани.
  function box(x0, x1, y0, y1, z0, z1, c) {
    const cf = c.F || c, cs = c.S || c, ct = c.T || c, zm = (z0 + z1) / 2;
    if (x1 < 0) fill3([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], sideFill(cs, 'L', x1, z0, z1));
    else if (x0 > 0) fill3([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], sideFill(cs, 'Rt', x0, z0, z1));
    if (y1 < EYE) fill3([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], css(lit(ct, 'T', zm)));
    else if (y0 > EYE) fill3([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], css(lit(cs, 'B', zm)));
    fill3([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], css(lit(cf, 'F', z0)));
  }

  // ---------- Холсты и попиксельные карты ----------
  function cnv(w, h) { const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h)); return c; }
  // Карта области (bx, by, bw, bh) логических px с шагом step: fn(lx, ly, out) пишет [r,g,b,a] в out.
  // Для миниатюры шаг растёт (не мельче одного реального пикселя). Кладётся через drawImage.
  function pixmap(bx, by, bw, bh, step, fn) {
    step = Math.max(step, 1 / K);
    const w = Math.max(2, Math.round(bw / step)), h = Math.max(2, Math.round(bh / step));
    const c = cnv(w, h), cx = c.getContext('2d'), img = cx.createImageData(w, h), d = img.data, o = [0, 0, 0, 255];
    let k = 0;
    for (let j = 0; j < h; j++) {
      const ly = by + (j + 0.5) * bh / h;
      for (let i = 0; i < w; i++) {
        o[3] = 255;
        fn(bx + (i + 0.5) * bw / w, ly, o);
        d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = o[3];
        k += 4;
      }
    }
    cx.putImageData(img, 0, 0);
    return c;
  }
  function put(c, bx, by, bw, bh) {
    x.save(); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(c, bx, by, bw, bh); x.restore();
  }

  // ---------- Небо: светлая сплошная облачность (высокий ключ), 2–3 широких пласта ----------
  function sky() {
    const n = Tex.perlin(5101), n2 = Tex.perlin(5102);
    const top = [150, 158, 168], mid = [178, 184, 190], low = [198, 202, 206], hb = CY + 14;
    const c = pixmap(0, 0, W, hb, 4, function (lx, ly, o) {
      const t = ly / hb;
      const col = t < 0.6 ? mix(top, mid, sm(0, 0.6, t)) : mix(mid, low, sm(0.6, 1, t));
      // нижняя кромка облаков — плоскость над нами: к горизонту пласты сжимаются и бледнеют
      const e = Math.max(0, CY + 8 - ly) / F, d = 1 / (e + 0.025);
      const u = (lx - CX) / F * d, amp = sm(0, 0.25, e);
      // широкие валы слоистых облаков (контраст не больше 6 %) и мягкая неровность внутри них
      const roll = Math.sin(d * 0.55 + 1.8 * n2(u * 0.05 + 3, d * 0.08));
      const cl = Tex.fbm(n, u * 0.35 + 7.3, d * 0.6, 3);
      const k = 1 + amp * (0.024 * roll + 0.035 * cl) + 0.035 * (1 - lx / W) * (1 - t);
      o[0] = col[0] * k; o[1] = col[1] * k; o[2] = col[2] * k;
    });
    put(c, 0, 0, W, hb);
  }

  // ---------- Горы: два хребта чёткими силуэтами (без шумовых мазков) ----------
  // Дальний — снег и скалы в сильной дымке: левая грань каждой вершины на свету (солнце слева),
  // скальные рёбра — сужающиеся штрихи по линии падения, снег между ними — кулуары; по гребню —
  // резкая кромка. Ближний — лесистые отроги: снежный склон в мелких тёмных елях, зубчатый верх.
  const PEAKS = [[-80, 392], [330, 352], [690, 322], [925, 386], [1185, 296], [1530, 358], [1960, 392]];
  // ломаная через ключевые точки с дроблением: середина отрезка смещается тем сильнее, чем он длиннее
  function crestLine(keys, rr, rough, lv) {
    let pts = keys;
    for (let l = 0; l < lv; l++) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dx = b[0] - a[0];
        out.push([(a[0] + b[0]) / 2 + (rr() - 0.5) * dx * 0.2, (a[1] + b[1]) / 2 + (rr() - 0.5) * dx * rough], b);
      }
      pts = out;
    }
    return pts;
  }
  // контур сужающегося штриха по ломаной pts: ширина w0 в начале → w1 в конце
  function taper(pts, w0, w1) {
    const L = [], Q = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = a[1] - b[1], ny = b[0] - a[0];
      const l = Math.hypot(nx, ny) || 1, w = lerp(w0, w1, i / (pts.length - 1)) / 2;
      nx /= l; ny /= l;
      L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); Q.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
    }
    poly2(L.concat(Q.reverse()));
  }
  function mountains() {
    const rr = Tex.rng(5301), base = CY + 10, LV = 6, SEG = 1 << LV, sky0 = [198, 202, 206];
    const hz = (c, t, a) => css(mix(c, sky0, t), a);
    // ключевые точки: вершины и сёдла между ними; чётные — вершины, нечётные — сёдла
    const keys = [];
    PEAKS.forEach(function (p, i) {
      if (i) { const q = PEAKS[i - 1]; keys.push([lerp(q[0], p[0], 0.4 + 0.2 * rr()), Math.max(p[1], q[1]) + 42 + 26 * rr()]); }
      keys.push([p[0], p[1]]);
    });
    const sil = crestLine(keys, rr, 0.3, LV);
    // 1) тело хребта: снег в тени, голубоватый; к подножию тонет в дымке
    poly2(sil.concat([[sil[sil.length - 1][0], base], [sil[0][0], base]]));
    let g = x.createLinearGradient(0, 290, 0, base);
    g.addColorStop(0, hz([146, 160, 178], 0.4)); g.addColorStop(0.55, hz([150, 163, 180], 0.58)); g.addColorStop(1, hz([160, 170, 182], 0.88));
    x.fillStyle = g; x.fill();
    // 2) освещённые грани: от седла по гребню к вершине, затем вниз по отрогу
    const spurs = [];
    for (let m = 1; m < PEAKS.length; m++) {
      const iS = 2 * m * SEG, iA = (2 * m - 1) * SEG, S = sil[iS], sp = [S], dy = (base - S[1]) / 5;
      for (let k = 1; k <= 5; k++) sp.push([S[0] + k * dy * (0.28 + 0.14 * rr()) + (rr() - 0.5) * 8, S[1] + k * dy]);
      spurs.push(sp);
      poly2(sil.slice(iA, iS + 1).concat(sp.slice(1), [[sil[iA][0], base]]));
      g = x.createLinearGradient(0, S[1], 0, base);
      g.addColorStop(0, hz([228, 231, 234], 0.28)); g.addColorStop(0.45, hz([216, 220, 226], 0.5)); g.addColorStop(1, hz([200, 205, 212], 0.86));
      x.fillStyle = g; x.fill();
    }
    // 3) скальные рёбра по линии падения: на свету серый камень с тёмной правой кромкой, в тени — тёмный
    const rib = (p0, ax, len, w0, lit) => {
      const pts = [p0], haze = 0.3 + 0.55 * sm(300, base, p0[1]);
      let px = p0[0], py = p0[1];
      for (let k = 1; k <= 6; k++) { ax += (rr() - 0.5) * 0.3; px += ax * len / 6; py += len / 6; pts.push([px, py]); }
      taper(pts, w0, w0 * 0.12); x.fillStyle = hz(lit ? [112, 114, 120] : [78, 88, 102], haze); x.fill();
      if (lit) { taper(pts.map((p) => [p[0] + w0 * 0.3, p[1]]), w0 * 0.45, 0.3); x.fillStyle = hz([70, 78, 92], haze); x.fill(); }
    };
    for (let j = 2; j < sil.length - 2; j += 3 + Math.floor(rr() * 5)) {
      const p = sil[j], lit = (Math.floor(j / SEG) & 1) === 1, h = base - p[1];
      if (h < 40 || p[0] < -20 || p[0] > W + 20 || rr() < 0.35) continue;
      rib([p[0], p[1] + 1.5], (lit ? -0.42 : 0.42) + (rr() - 0.5) * 0.3, h * (0.25 + 0.4 * rr()), 2.5 + 3.5 * rr(), lit);
    }
    spurs.forEach(function (sp) {
      for (let k = 1; k < 4; k++) {
        const p = sp[k], h = base - p[1];
        if (h < 40) continue;
        if (rr() < 0.8) rib(p, -0.5, h * (0.2 + 0.25 * rr()), 2 + 3 * rr(), true);
        if (rr() < 0.8) rib(p, 0.55, h * (0.2 + 0.3 * rr()), 2 + 3 * rr(), false);
      }
      // сам отрог — скальное ребро от вершины
      taper(sp.slice(0, 4), 4, 1); x.fillStyle = hz([86, 94, 106], 0.42); x.fill();
    });
    // 4) резкая кромка гребня: светлая на освещённых склонах, голубовато-тёмная на теневых
    x.lineJoin = 'round';
    for (let k = 0; k < keys.length - 1; k++) {
      x.beginPath(); x.moveTo(sil[k * SEG][0], sil[k * SEG][1]);
      for (let j = k * SEG + 1; j <= (k + 1) * SEG; j++) x.lineTo(sil[j][0], sil[j][1]);
      x.lineWidth = 1.6; x.strokeStyle = k & 1 ? hz([242, 244, 246], 0.22) : hz([118, 132, 150], 0.45); x.stroke();
    }
    // дымка у подножия — чистый вертикальный градиент
    g = x.createLinearGradient(0, 380, 0, base);
    g.addColorStop(0, css(sky0, 0)); g.addColorStop(1, css(sky0, 0.75));
    x.fillStyle = g; x.fillRect(0, 380, W, base - 380);
    nearRidge(rr, base, hz);
  }
  // Ближние отроги: снежный склон, густо усеянный мелкими елями; верх — зубчатая кромка крон
  function nearRidge(rr, base, hz) {
    const n = Tex.perlin(5302), crest = (px) => 472 - 82 * Math.pow(Math.abs(px - CX) / CX, 1.4) + 14 * Tex.fbm(n, px * 0.004, 1.7, 3);
    const top = [];
    for (let px = -12; px < W + 12; px += 4) top.push([px, crest(px) + 1]);
    poly2(top.concat([[W + 12, base], [-12, base]]));
    const g = x.createLinearGradient(0, 390, 0, base);
    g.addColorStop(0, hz([170, 180, 190], 0.25)); g.addColorStop(1, hz([176, 184, 192], 0.6));
    x.fillStyle = g; x.fill();
    // ели: треугольники 3–7 px; гуще у гребня и в «рощах», редеют на прогалинах
    x.beginPath();
    for (let px = -10; px < W + 10; px += (K > 0.5 ? 3.4 : 6) + rr() * 2.6) {
      const cy = crest(px), dens0 = 0.55 + 0.45 * Tex.fbm(n, px * 0.01, 9.1, 2) * 1.8;
      for (let py = cy + 1; py < base - 2; py += 3.2 + rr() * 3.2) {
        const d = py - cy, dens = d < 4 ? 1 : dens0 * (0.85 - 0.35 * sm(0, 60, d)) + 0.25 * n(px * 0.03, py * 0.06);
        if (rr() > dens) continue;
        const h = (d < 4 ? 4.5 : 3) + rr() * 3, w = h * (0.34 + 0.1 * rr()), tx = px + (rr() - 0.5) * 2;
        x.moveTo(tx, py - h); x.lineTo(tx + w, py); x.lineTo(tx - w, py); x.closePath();
      }
    }
    x.fillStyle = hz([46, 58, 60], 0.4); x.fill();
  }

  // ---------- Ели: силуэт ярусами с провисшими лапами и снегом на верхней стороне ----------
  // Ярусы неровные (лапы разной длины, с провалами), верхушка — тонкий шпиль, лёгкий наклон.
  // Четыре силуэта: обычная; со сломанной верхушкой (сухой обломок над кроной); редкая узкая с
  // провалами; однобокая (ветер слева обломал лапы с наветренной стороны).
  // Снег — отдельные комья на верхней стороне лап, не на каждом ярусе, слева (к свету) чаще.
  function spruce(bx, by, hgt, rr, col, snowCol, snowAmt) {
    const kind = rr(), broken = kind < 0.14, sparse = kind >= 0.14 && kind < 0.32, lop = kind >= 0.32 && kind < 0.42;
    const top0 = broken ? hgt * (0.1 + 0.1 * rr()) : 0, hc = hgt - top0;
    const tiers = clamp(Math.round(hc / 5.5), 3, 18), w = hgt * (0.16 + 0.08 * rr()) * (sparse ? 0.78 : 1);
    const lean = (lop ? 0.5 + 0.5 * rr() : rr() - 0.5) * hgt * 0.04, spire = broken ? 0 : hc * (0.07 + 0.06 * rr()), th = (hc * 0.95 - spire) / tiers;
    const pShort = sparse ? 0.35 : 0.12, Lp = [], Rp = [], br = [];
    for (let i = 0; i < tiers; i++) {
      const t = (i + 1) / tiers, cx = bx + lean * (1 - t);
      const y = by - hc + spire + (hc * 0.95 - spire) * t + (rr() - 0.5) * th * 0.5;
      const base = w * (0.1 + 0.9 * Math.pow(t, 0.9));
      let hl = base * (rr() < pShort ? 0.4 : 0.72 + 0.5 * rr()); const hr = base * (rr() < pShort ? 0.4 : 0.72 + 0.5 * rr());
      if (lop) hl *= 0.5;
      const dl = th * (0.05 + 0.35 * rr()), dr = th * (0.05 + 0.35 * rr());
      Lp.push([cx - hl * (0.3 + 0.25 * rr()), y - th * (0.55 + 0.3 * rr())], [cx - hl, y + dl]);
      Rp.push([cx + hr * (0.3 + 0.25 * rr()), y - th * (0.55 + 0.3 * rr())], [cx + hr, y + dr]);
      br.push([cx, y, hl, hr, dl, dr]);
    }
    const tw = Math.max(0.8, hgt * 0.025);
    x.beginPath();
    if (broken) { x.moveTo(bx + lean - w * 0.07, by - hc); x.lineTo(bx + lean + w * 0.07, by - hc); } else x.moveTo(bx + lean, by - hc);
    for (let i = 0; i < Rp.length; i++) x.lineTo(Rp[i][0], Rp[i][1]);
    x.lineTo(bx + tw, by - th * 0.6); x.lineTo(bx + tw, by); x.lineTo(bx - tw, by); x.lineTo(bx - tw, by - th * 0.6);
    for (let i = Lp.length - 1; i >= 0; i--) x.lineTo(Lp[i][0], Lp[i][1]);
    x.closePath(); x.fillStyle = col; x.fill();
    if (broken) {
      // сухой обломок ствола над кроной
      x.beginPath(); x.moveTo(bx + lean, by - hc + th * 0.2); x.lineTo(bx + lean * 1.3 + w * 0.05, by - hgt);
      x.lineWidth = Math.max(0.8, hgt * 0.014); x.strokeStyle = col; x.stroke();
    }
    if (snowAmt <= 0) return;
    x.fillStyle = snowCol; x.beginPath();
    for (let i = 0; i < br.length; i++) {
      if (rr() > snowAmt) continue;
      const b = br[i], clumps = 1 + (rr() < 0.4 ? 1 : 0);
      for (let k = 0; k < clumps; k++) {
        // ком снега лежит на лапе: точка на линии от ствола к кончику, приподнятая над ней
        const left = rr() < 0.68, hw = left ? b[2] : b[3], dy = left ? b[4] : b[5], sgn = left ? -1 : 1;
        const s0 = 0.15 + rr() * 0.5, s1 = Math.min(0.98, s0 + 0.18 + rr() * 0.35);
        const ya = (s) => b[1] - th * 0.62 * (1 - s) + dy * s;
        const hh = th * (0.18 + 0.22 * rr());
        const xa = b[0] + sgn * hw * s0, xb = b[0] + sgn * hw * s1;
        x.moveTo(xa, ya(s0)); x.lineTo(xa + sgn * (xb - xa) * 0.15 * sgn, ya(s0) - hh * 0.8);
        x.lineTo((xa + xb) / 2, ya((s0 + s1) / 2) - hh); x.lineTo(xb, ya(s1) - hh * 0.25); x.lineTo(xb, ya(s1) + th * 0.04);
        x.closePath();
      }
    }
    x.fill();
  }
  // Дальний ельник у горизонта: два ряда по глубине, цвет уже с дымкой
  function forestBelt() {
    const rr = Tex.rng(5401), n = Tex.perlin(5402);
    const rows = [[760, 12, 24], [520, 13, 25], [360, 12, 24]];
    rows.forEach(function (row, ri) {
      const Z = row[0], base = gy(Z), fz = Z * 0.32;
      for (let px = -20; px < W + 20; px += 2 + rr() * (F * 3.2 / Z)) {
        // полог неровный: рощи выше, прогалины ниже; изредка одинокая высокая ель
        const clump = 0.5 + 0.5 * Tex.fbm(n, px * 0.006, ri * 3.1, 2) * 1.6;
        let hm = row[1] + (row[2] - row[1]) * clamp(clump * 0.7 + rr() * 0.45, 0, 1.2);
        if (rr() < 0.04) hm *= 1.3;
        const dark = 0.75 + rr() * 0.4;
        const col = css(fog(mul([38, 49, 47], dark), fz)), sn = css(fog([206, 213, 219], fz));
        spruce(px, base + 1 + rr() * 1.5, F * hm / Z, rr, col, sn, 0.35 + rr() * 0.35);
      }
    });
  }

  // ---------- Надписи, окна ----------
  // надпись на плоскости, обращённой к камере; hM — высота букв (м)
  function textF(str, X, Y, Z, hM, col, align) {
    const p = P(X, Y, Z), s = F * hM / Z / 0.72;
    x.save(); x.font = 'bold ' + s.toFixed(2) + 'px Arial, Helvetica, sans-serif';
    x.textAlign = align || 'center'; x.textBaseline = 'middle'; x.fillStyle = col; x.fillText(str, p[0], p[1]); x.restore();
  }
  // надпись на боковой стене X = const в перспективе (аффинно по трём углам); za..zb — вдоль стены
  function textS(str, X, yc, za, zb, hM, col) {
    const l = X < 0 ? za : zb, r = X < 0 ? zb : za;
    const tl = P(X, yc + hM / 2, l), tr = P(X, yc + hM / 2, r), bl = P(X, yc - hM / 2, l);
    x.save();
    x.transform(tr[0] - tl[0], tr[1] - tl[1], bl[0] - tl[0], bl[1] - tl[1], tl[0], tl[1]);
    x.font = 'bold 100px Arial, Helvetica, sans-serif';
    const tw = x.measureText(str).width;
    x.scale(1 / tw, 1 / 72); x.textBaseline = 'alphabetic'; x.fillStyle = col; x.fillText(str, 0, 72);
    x.restore();
  }
  // Окно: m(u, v) → [X, Y, Z] — точка стены; u0..u1 по стене, v0..v1 по высоте (м).
  // o: { fr — цвет рамы, lit — тёплый свет внутри, z — глубина для дымки, f — грань, bars, blind }
  function win(m, u0, u1, v0, v1, o) {
    const z = o.z, fr = o.fr || [196, 198, 196], t = 0.07, m2 = o.m2 || m;
    let q = m;
    const quadM = (a, b, c, d) => path3([q(a, c), q(b, c), q(b, d), q(a, d)]);
    quadM(u0 - t, u1 + t, v0 - t, v1 + t); x.fillStyle = css(lit(fr, o.f, z)); x.fill();
    if (o.m2) {
      // откос проёма: дальняя щека (смотрит на камеру) и верхний откос (виден снизу)
      const jamb = [m(u1, v0), m(u1, v1), m2(u1, v1), m2(u1, v0)], head = [m(u0, v1), m(u1, v1), m2(u1, v1), m2(u0, v1)];
      fill3(jamb, css(lit(mul(fr, 0.86), 'F', z))); fill3(head, css(lit(mul(fr, 0.55), 'B', z)));
      q = m2;
      quadM(u0, u1, v0, v1); x.fillStyle = css(lit(fr, o.f, z)); x.fill();
      u0 += 0.05; u1 -= 0.05; v0 += 0.05; v1 -= 0.05;
    }
    // стекло: сверху отражает пасмурное небо, снизу темнее (отражение земли и интерьер)
    const a = P.apply(null, q(u0, v1)), b = P.apply(null, q(u0, v0));
    const g = x.createLinearGradient(a[0], a[1], b[0], b[1]);
    if (o.lit) { g.addColorStop(0, css(fog([196, 160, 112], z))); g.addColorStop(1, css(fog([150, 112, 74], z))); }
    else { g.addColorStop(0, css(fog([128, 140, 152], z))); g.addColorStop(0.45, css(fog([82, 93, 106], z))); g.addColorStop(1, css(fog([48, 55, 64], z))); }
    quadM(u0, u1, v0, v1); x.fillStyle = g; x.fill();
    if (o.blind) { x.fillStyle = css(fog([170, 168, 158], z), 0.75); quadM(u0, u1, v1 - (v1 - v0) * o.blind, v1); x.fill(); }
    // импост и форточка
    const um = (u0 + u1) / 2;
    quadM(um - t * 0.45, um + t * 0.45, v0, v1); x.fillStyle = css(lit(fr, o.f, z)); x.fill();
    q = m;
    if (o.bars) {
      x.strokeStyle = css(lit([52, 56, 60], o.f, z)); x.lineWidth = lw(0.03, z, 1);
      x.beginPath();
      for (let k = 1; k < 4; k++) { const u = u0 + (u1 - u0) * k / 4, p1 = P.apply(null, q(u, v0)), p2 = P.apply(null, q(u, v1)); x.moveTo(p1[0], p1[1]); x.lineTo(p2[0], p2[1]); }
      x.stroke();
    }
    // отлив со снегом и тень под ним
    quadM(u0 - t * 1.6, u1 + t * 1.6, v0 - t - 0.1, v0 - t); x.fillStyle = css(lit([66, 70, 76], o.f, z), 0.55); x.fill();
    quadM(u0 - t * 1.6, u1 + t * 1.6, v0 - t, v0 - t + 0.06); x.fillStyle = css(fog([222, 227, 231], z)); x.fill();
  }

  // ---------- Дальний план: мачта связи, радом, главный корпус станции ----------
  function mast(X, Z, Hm) {
    const seg = 1.6, hw = 0.75, n = Math.round(Hm / seg);
    const gcol = css(fog([60, 64, 70], Z), 0.55);
    // оттяжки на трёх уровнях к трём анкерам
    [[X - 22, Z + 6], [X + 19, Z + 10], [X + 6, Z - 16]].forEach(function (an) {
      [Hm * 0.32, Hm * 0.64, Hm * 0.95].forEach((hy) => line3([X, hy, Z], [an[0], 0, an[1]], 1, gcol));
    });
    for (let i = 0; i < n; i++) {
      const y0 = i * seg, y1 = y0 + seg, band = Math.floor(y0 / 5.3) % 2;
      const col = fog(band ? [206, 204, 198] : [152, 82, 70], Z);
      fill3([[X - hw, y0, Z], [X + hw, y0, Z], [X + hw, y1, Z], [X - hw, y1, Z]], css(col, 0.28));
      x.strokeStyle = css(col); x.lineWidth = 1.3;
      const a = P(X - hw, y0, Z), b = P(X + hw, y1, Z), c = P(X - hw, y1, Z), d = P(X + hw, y0, Z);
      x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(c[0], c[1]); x.moveTo(d[0], d[1]); x.lineTo(b[0], b[1]);
      x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.moveTo(c[0], c[1]); x.lineTo(b[0], b[1]); x.stroke();
    }
    // антенны: штырь, панели, тарелка, заградогни
    const dk = css(fog([58, 62, 68], Z));
    line3([X - 0.3, Hm, Z], [X - 0.3, Hm + 4.5, Z], 1.2, dk);
    line3([X + 0.4, Hm, Z], [X + 0.4, Hm + 2.2, Z], 1.2, dk);
    line3([X + 0.4, Hm + 1.6, Z], [X + 2.2, Hm + 1.6, Z], 1.2, dk);
    box(X + 2.0, X + 2.3, Hm + 0.6, Hm + 2.4, Z - 0.1, Z + 0.1, [190, 192, 194]);
    [[X - hw - 0.35, Hm * 0.78], [X + hw + 0.1, Hm * 0.74]].forEach((pn) => box(pn[0], pn[0] + 0.25, pn[1], pn[1] + 1.7, Z - 0.2, Z + 0.2, [214, 214, 210]));
    // тарелка РРЛ: светлый сплошной диск с тёмным ободом, облучатель на штанге, кронштейн к поясу мачты
    const dX = X + hw + 0.95, dY = Hm * 0.5, dc = P(dX, dY, Z), dr = F * 0.8 / Z, mc = css(fog([70, 74, 80], Z));
    line3([X + hw, dY + 0.15, Z], [dX - 0.25, dY + 0.15, Z], 1.3, mc);
    line3([X + hw, dY - 0.6, Z], [dX - 0.3, dY - 0.1, Z], 1, mc);
    x.save(); x.translate(dc[0], dc[1]);
    x.beginPath(); x.ellipse(0, 0, dr * 0.5, dr, 0, 0, Math.PI * 2);
    x.fillStyle = css(fog([212, 214, 216], Z)); x.fill();
    x.lineWidth = Math.max(1, dr * 0.16); x.strokeStyle = css(fog([116, 122, 130], Z)); x.stroke();
    x.beginPath(); x.moveTo(0, 0); x.lineTo(-dr * 0.95, 0); x.lineWidth = 1; x.strokeStyle = mc; x.stroke();
    x.fillStyle = mc; x.fillRect(-dr * 0.95 - 1.2, -1.2, 2.4, 2.4);
    x.restore();
    [Hm * 0.33, Hm * 0.66, Hm].forEach((hy) => { const p = P(X, hy + 0.3, Z); x.fillStyle = css(fog([150, 54, 46], Z * 0.6)); x.fillRect(p[0] - 2, p[1] - 2, 4, 3); });
  }

  function radome(X, Z) {
    // двухэтажный радиолокационный блок с куполом
    box(X - 5, X + 5, 0, 10, Z, Z + 10, { F: [176, 178, 176], S: [168, 170, 170], T: [220, 224, 228] });
    for (let k = 0; k < 4; k++) win((u, v) => [u, v, Z], X - 4 + k * 2.2, X - 3 + k * 2.2, 6.5, 7.8, { z: Z, f: 'F' });
    const c = P(X, 14.6, Z + 5), r = F * 6.6 / (Z + 5), cut = P(X, 10, Z)[1];
    x.save(); x.beginPath(); x.rect(c[0] - r - 2, c[1] - r - 2, 2 * r + 4, cut - c[1] + r + 2); x.clip();
    const g = x.createLinearGradient(c[0] - r * 0.7, c[1] - r * 0.7, c[0] + r * 0.8, c[1] + r * 0.6);
    g.addColorStop(0, css(fog([226, 228, 230], Z))); g.addColorStop(0.55, css(fog([196, 200, 205], Z))); g.addColorStop(1, css(fog([150, 158, 168], Z)));
    x.fillStyle = g; x.beginPath(); x.arc(c[0], c[1], r, 0, Math.PI * 2); x.fill();
    // швы геодезических панелей: большие круги под разными наклонами дают треугольную сетку
    x.strokeStyle = css(fog([120, 128, 138], Z), 0.2); x.lineWidth = 1;
    [[0.3, 0.35], [1.35, 0.6], [2.4, 0.3], [0.9, 0.85], [1.9, 0.75], [2.9, 0.55]].forEach(function (gc) {
      x.beginPath(); x.ellipse(c[0], c[1], r, r * gc[1], gc[0], 0, Math.PI * 2); x.stroke();
    });
    x.restore();
    fill3([[X - 5.2, 10, Z - 0.1], [X + 5.2, 10, Z - 0.1], [X + 5.2, 10.4, Z - 0.1], [X - 5.2, 10.4, Z - 0.1]], css(fog([222, 226, 230], Z)));
  }

  // Сугроб вдоль линии: точки [X, Z] основания, высота h(t), вылет d (м) в сторону камеры/дороги
  function driftF(x0, x1, Z, h, seed) {
    const rr = Tex.rng(seed), pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([lerp(x0, x1, t), h * (0.55 + 0.45 * Math.sin(t * Math.PI)) * (0.8 + 0.4 * rr())]); }
    x.beginPath();
    pts.forEach((p, i) => { const s = P(p[0], p[1], Z - 0.3); if (i) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); });
    const e1 = P(x1 + 0.6, 0, Z - 1.2), e0 = P(x0 - 0.6, 0, Z - 1.2);
    x.lineTo(e1[0], e1[1]); x.lineTo(e0[0], e0[1]); x.closePath();
    const a = P(0, h, Z - 0.3), b = P(0, 0, Z - 1.2);
    const g = x.createLinearGradient(0, a[1], 0, b[1]);
    g.addColorStop(0, css(fog([226, 230, 234], Z))); g.addColorStop(1, css(fog([196, 206, 216], Z)));
    x.fillStyle = g; x.fill();
  }

  // Главный корпус станции — ориентир в конце улицы: светлые панели на фоне тёмной рощи,
  // чёткая линия снега на крыше, тёплые окна; окна разных типов (жалюзи, шторы, форточка, забитое)
  function mainBuilding() {
    const z = 110, x0 = -15, x1 = 9, yb = 1.0, yt = 7.8, d = 12;
    const wallC = [200, 198, 188], fr = (X0, X1, Y0, Y1, c, a) => fill3([[X0, Y0, z - 0.02], [X1, Y0, z - 0.02], [X1, Y1, z - 0.02], [X0, Y1, z - 0.02]], css(lit(c, 'F', z), a));
    // подполье на сваях: тёмная щель, сваи
    box(x0, x1, 0, yb, z + 0.6, z + d, [64, 70, 78]);
    for (let X = x0 + 0.5; X < x1; X += 3) box(X, X + 0.3, 0, yb, z + 0.4, z + 0.7, [44, 48, 54]);
    box(x0, x1, yb, yt, z, z + d, { F: wallC, S: [182, 182, 176], T: [220, 224, 228] });
    // цоколь, межэтажный пояс, фриз с надписью; грязь и соль внизу, широкие потёки от карниза
    fr(x0, x1, yb, yb + 0.55, [96, 108, 122]);
    fr(x0, x1, 4.25, 4.6, [132, 140, 150]);
    fr(x0, x1, 7.0, yt, [168, 164, 152]);
    fr(x0, x1, yb, yb + 0.4, [70, 60, 50], 0.25);
    const rr = Tex.rng(5611);
    for (let k = 0; k < 9; k++) {
      const X = lerp(x0 + 0.5, x1 - 0.5, rr()), a = P(X, 7.0, z), b = P(X, 7.0 - 1.2 - 1.8 * rr(), z), w = Math.max(3, F * (0.3 + 0.25 * rr()) / z);
      const g = x.createLinearGradient(0, a[1], 0, b[1]); g.addColorStop(0, 'rgba(92,90,84,.22)'); g.addColorStop(1, 'rgba(92,90,84,0)');
      x.fillStyle = g; x.fillRect(a[0] - w / 2, a[1], w, b[1] - a[1]);
    }
    // окна: два ряда; часть горит тёплым, остальные — разных типов
    const litSet = { 3: 1, 17: 1, 22: 1 };
    let k = 0;
    for (let row = 0; row < 2; row++) {
      for (let X = x0 + 0.9; X < x1 - 1; X += 1.85) {
        k++;
        if (row === 0 && X > -2.8 && X < 2.2) continue;
        const v0 = row ? 5.0 : 1.95, v1 = row ? 6.35 : 3.35, t = (k * 5 + row * 3) % 7;
        if (t === 6 && !litSet[k]) {
          // забитое фанерой
          fr(X - 0.07, X + 1.17, v0 - 0.07, v1 + 0.07, [196, 198, 196]); fr(X, X + 1.1, v0, v1, [150, 128, 98]);
          line3([X, v0 + 0.3, z - 0.03], [X + 1.1, v1 - 0.4, z - 0.03], 1, css(fog([112, 94, 72], z), 0.8));
        } else {
          win((u, v) => [u, v, z], X, X + 1.1, v0, v1, { z: z, f: 'F', lit: litSet[k], blind: t === 1 ? 0.45 : 0 });
          if (t === 3) { fr(X + 0.05, X + 0.3, v0 + 0.05, v1 - 0.05, [176, 150, 140], 0.85); fr(X + 0.8, X + 1.05, v0 + 0.05, v1 - 0.05, [176, 150, 140], 0.85); }
          if (t === 4) fr(X + 0.6, X + 1.02, v1 - 0.55, v1 - 0.08, [36, 40, 46]);
        }
        // снег на отливе — светлая полоса не тоньше 1,5 px
        const s0 = P(X - 0.12, v0 - 0.06, z), s1 = P(X + 1.22, v0 - 0.06, z);
        x.fillStyle = css(fog([236, 239, 242], z)); x.fillRect(s0[0], s0[1] - 1.5, s1[0] - s0[0], 1.6);
      }
    }
    const lg0 = P(x0, 4.6, z), lg1 = P(x1, 4.6, z);
    x.fillStyle = css(fog([236, 239, 242], z)); x.fillRect(lg0[0], lg0[1] - 1.4, lg1[0] - lg0[0], 1.5);
    // тамбур входа с козырьком, двойная дверь, ступени
    box(-2.4, 2.4, yb, 4.0, z - 3.2, z, { F: [150, 156, 160], S: [140, 146, 150], T: [220, 224, 228] });
    fill3([[-1.0, yb, z - 3.21], [1.0, yb, z - 3.21], [1.0, 3.1, z - 3.21], [-1.0, 3.1, z - 3.21]], css(fog([58, 62, 68], z)));
    fill3([[-0.05, yb, z - 3.22], [0.05, yb, z - 3.22], [0.05, 3.1, z - 3.22], [-0.05, 3.1, z - 3.22]], css(fog([120, 124, 128], z)));
    box(-2.9, 2.9, 4.0, 4.6, z - 4.2, z, { F: [224, 228, 232], S: [196, 202, 208], T: [226, 230, 234] });
    for (let s = 0; s < 3; s++) box(-2.0, 2.0, s * 0.33, (s + 1) * 0.33, z - 4.2 + s * 0.35, z - 3.2, { F: [150, 150, 148], T: [214, 218, 222] });
    // снег на крыше: чистая линия с лёгким навесом и тень под ней; надстройки и антенна
    fill3([[x0, yt - 0.25, z - 0.03], [x1, yt - 0.25, z - 0.03], [x1, yt, z - 0.03], [x0, yt, z - 0.03]], css(fog([110, 112, 112], z), 0.35));
    fill3([[x0 - 0.15, yt, z - 0.18], [x1 + 0.15, yt, z - 0.18], [x1 + 0.15, yt + 0.55, z - 0.18], [x0 - 0.15, yt + 0.55, z - 0.18]], css(fog([238, 241, 244], z)));
    box(-11, -9.2, yt, yt + 1.4, z + 2, z + 3.5, [120, 124, 128]);
    box(4.5, 6.8, yt, yt + 1.1, z + 3, z + 4.5, [130, 132, 134]);
    line3([-6, yt, z + 4], [-6, yt + 5, z + 4], 1.2, css(fog([60, 64, 70], z)));
    // крышная вывеска: тёмно-синий щит на двух стойках, белые буквы ~10 px — читается и на телефоне
    const sz = z - 0.3;
    [-11.9, -6.5].forEach((X) => line3([X, yt + 0.4, sz], [X, yt + 1.2, sz], lw(0.12, sz, 1.2), css(fog([58, 62, 68], sz))));
    fill3([[-13.1, yt + 1.15, sz], [-5.3, yt + 1.15, sz], [-5.3, yt + 2.55, sz], [-13.1, yt + 2.55, sz]], css(fog([214, 218, 222], sz)));
    fill3([[-13.0, yt + 1.2, sz], [-5.4, yt + 1.2, sz], [-5.4, yt + 2.5, sz], [-13.0, yt + 2.5, sz]], css(lit([54, 70, 94], 'F', sz)));
    fill3([[-13.1, yt + 2.55, sz], [-5.3, yt + 2.55, sz], [-5.3, yt + 2.7, sz], [-13.1, yt + 2.7, sz]], css(fog([236, 239, 242], sz)));
    textF('СТАНЦИЯ', -9.2, yt + 1.86, sz - 0.02, 0.95, css(fog([238, 240, 242], sz)));
    driftF(x0, -3.2, z, 1.1, 5601); driftF(3.2, x1, z, 1.0, 5602);
  }
  // Тёмная роща сразу за корпусом: даёт светлому фасаду и мачте контрастный фон
  function grove() {
    const rr = Tex.rng(5621), trees = [];
    for (let i = 0; i < 40; i++) trees.push([lerp(-26, 6, rr()), lerp(122, 150, rr())]);
    trees.sort((a, b) => b[1] - a[1]);
    trees.forEach(function (t) {
      const p = P(t[0], 0, t[1]), hm = 11 + rr() * 8, fz = t[1] * 0.55;
      spruce(p[0], p[1] + 1, F * hm / t[1], rr, css(fog(mul([34, 45, 44], 0.8 + rr() * 0.35), fz)), css(fog([214, 220, 226], fz)), 0.45 + rr() * 0.3);
    });
  }

  // Опушка ельника по краям дальнего плана: крупные ели, по глубине от дальних к ближним
  function forestEdges() {
    const rr = Tex.rng(5701);
    const groups = [[-80, -26, 190, 320], [26, 85, 195, 330], [-48, -22, 160, 190], [22, 52, 165, 195]];
    groups.forEach(function (gp) {
      const trees = [];
      for (let i = 0; i < 70; i++) trees.push([lerp(gp[0], gp[1], rr()), lerp(gp[2], gp[3], rr())]);
      trees.sort((a, b) => b[1] - a[1]);
      trees.forEach(function (t) {
        const Z = t[1], p = P(t[0], 0, Z), hm = 12 + rr() * 9, fz = Z * 0.75;
        const col = css(fog(mul([36, 47, 45], 0.8 + rr() * 0.4), fz)), sn = css(fog([214, 220, 226], fz));
        spruce(p[0], p[1] + 1, F * hm / Z, rr, col, sn, 0.5 + rr() * 0.3);
      });
    });
  }

  // ---------- Общие детали модулей ----------
  // вертикальная труба/свая/столб: плоская полоса к камере с поперечной светотенью (свет слева)
  function post(X, Z, r, y0, y1, c, a) {
    const p0 = P(X - r, y1, Z), p1 = P(X + r, y0, Z);
    const g = x.createLinearGradient(p0[0], 0, p1[0], 0);
    g.addColorStop(0, css(fog(mul(c, 1.12), Z), a)); g.addColorStop(0.4, css(fog(c, Z), a)); g.addColorStop(1, css(fog(mul(c, 0.62), Z), a));
    x.fillStyle = g; x.fillRect(p0[0], p0[1], Math.max(1, p1[0] - p0[0]), p1[1] - p0[1]);
  }
  // подполье модуля на сваях между z0 и z1: затенённый снег, задние сваи, передние сваи и раскосы
  function underGap(xw, xb, z0, z1, yf, step) {
    const dir = xw < 0 ? -1 : 1, zs = [];
    for (let z = z0 + 0.4; z < z1; z += step) zs.push(z);
    zs.push(z1 - 0.15);
    for (let i = 0; i < zs.length - 1; i++) {
      const za = i ? zs[i] : z0, zb = zs[i + 1], zm = (za + zb) / 2, a = P(xw, yf, zm), b = P(xw, 0, zm);
      const g = x.createLinearGradient(0, a[1], 0, b[1]);
      g.addColorStop(0, css(fog([66, 72, 84], zm))); g.addColorStop(0.35, css(fog([104, 114, 128], zm)));
      g.addColorStop(0.75, css(fog([150, 162, 178], zm))); g.addColorStop(1, css(fog([170, 182, 196], zm)));
      fill3([[xw, 0, za], [xw, yf, za], [xw, yf, zb], [xw, 0, zb]], g);
    }
    zs.forEach((z) => post(xb - dir * 0.25, z + 0.3, 0.09, 0, yf, [58, 62, 70]));
    x.lineCap = 'butt';
    for (let i = 0; i < zs.length - 1; i++) {
      const X = xw + dir * 0.15;
      line3([X, 0.15, zs[i]], [X, yf - 0.1, zs[i + 1]], lw(0.06, zs[i], 1), css(fog([52, 56, 62], zs[i])));
    }
    zs.forEach((z) => post(xw + dir * 0.15, z, 0.11, 0, yf, [84, 88, 94]));
  }
  // сугроб, наметённый под стену/сваи: гребень у стены высотой h(Z), подножие — к дороге на ширину sp
  function driftSide(xw, z0, z1, h0, h1, sp, seed, col) {
    const n = Tex.perlin(seed), dir = xw < 0 ? 1 : -1, top = [], foot = [];
    for (let i = 0; i <= 40; i++) {
      const z = z0 * Math.pow(z1 / z0, i / 40), t = (z - z0) / (z1 - z0);
      const e = Math.min(1, (z - z0) / 0.7 + 0.15, (z1 - z) / 0.7 + 0.15), hh = lerp(h0, h1, t) * (0.75 + 0.5 * (n(z * 0.45, 1.3) * 0.5 + 0.5)) * e;
      top.push([xw + dir * 0.05, hh, z]); foot.push([xw + dir * sp * (0.55 + 0.45 * e) * (0.8 + 0.4 * (n(z * 0.3, 7.1) * 0.5 + 0.5)), 0, z]);
    }
    const zm = (z0 + z1) / 2, a = P(xw, h0, zm), b = P(xw + dir * sp, 0, zm);
    const g = x.createLinearGradient(0, a[1], 0, b[1]);
    const c = col || [204, 213, 224];
    g.addColorStop(0, css(fog(mul(c, 1.04), zm))); g.addColorStop(1, css(fog(mul(c, 0.94), zm)));
    fill3(top.concat(foot.slice().reverse()), g);
    // гривы надува на склоне сугроба: светлый гребень и голубовато-серая подветренная сторона под ним
    [[0.38, 2.2], [0.68, 6.4]].forEach(function (rd) {
      const at = (i, t) => { const q = top[i], f = foot[i], k = clamp(t + 0.07 * n(q[2] * 0.7, rd[1]), 0.05, 0.95); return [lerp(q[0], f[0], k), q[1] * (1 - k), q[2]]; };
      const crest = [], lee = [];
      for (let i = 0; i <= 40; i++) { crest.push(at(i, rd[0])); lee.push(at(i, rd[0] + 0.12)); }
      // подветренная тень под гривой — растушёвана: узкая плотнее, широкая слабее; над гривой — светлый скат
      fill3(crest.concat(lee.slice().reverse()), css(fog([156, 170, 190], zm), 0.13));
      const lee2 = []; for (let i = 0; i <= 40; i++) lee2.push(at(i, rd[0] + 0.05));
      fill3(crest.concat(lee2.reverse()), css(fog([156, 170, 190], zm), 0.12));
      const up = []; for (let i = 0; i <= 40; i++) up.push(at(i, rd[0] - 0.1));
      fill3(up.concat(crest.slice().reverse()), css(fog([240, 243, 246], zm), 0.18));
    });
    // мягкая светлая кромка гребня у стены
    x.beginPath(); top.forEach((p, i) => { const s = P(p[0], p[1], p[2]); if (i) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); });
    x.strokeStyle = css(fog([236, 239, 243], zm), 0.45); x.lineWidth = 1.2; x.stroke();
  }
  // снег на плоской крыше: передняя грань снежной плиты над стеной X = xw с нависающим карнизом и сосульками
  function roofSnowSide(xw, z0, z1, yt, th, seed) {
    const rr = Tex.rng(seed), n = Tex.perlin(seed), dir = xw < 0 ? 1 : -1, xo = xw + dir * 0.28;
    const top = [], bot = [];
    for (let i = 0; i <= 48; i++) {
      const z = z0 * Math.pow(z1 / z0, i / 48);
      top.push([xo, yt + th * (0.85 + 0.25 * n(z * 0.6, 2.2)), z]);
      bot.push([xo, yt - 0.06 - 0.12 * Math.max(0, n(z * 1.3, 5.5)), z]);
    }
    const zm = (z0 + z1) / 2, f = xw < 0 ? 0.86 : 0.98;
    fill3(top.concat(bot.slice().reverse()), sideFill([226, 232, 238], f, xo, z0, z1));
    // верхняя кромка светлее (на неё падает свет неба)
    x.beginPath(); top.forEach((p, i) => { const s = P(p[0], p[1], p[2]); if (i) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); });
    x.strokeStyle = css(fog([240, 243, 246], zm)); x.lineWidth = 1.6; x.stroke();
    // тень от карниза на стене
    [[0, 0.12, 0.3], [0.12, 0.26, 0.17], [0.26, 0.45, 0.08]].forEach((b) =>
      fill3([[xw, yt - b[0], z0], [xw, yt - b[1], z0], [xw, yt - b[1], z1], [xw, yt - b[0], z1]], 'rgba(28,34,46,' + b[2] + ')'));
    // сосульки гроздьями
    x.fillStyle = css(fog([210, 222, 232], zm), 0.85);
    for (let k = 0; k < 26; k++) {
      const z = lerp(z0 + 0.3, z1 - 0.3, rr()), len = 0.06 + 0.32 * rr() * rr(), wd = 0.025 + 0.025 * rr();
      const a = P(xo, yt - 0.08, z - wd), b = P(xo, yt - 0.08, z + wd), c = P(xo, yt - 0.08 - len, z);
      x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c[0], c[1]); x.closePath(); x.fill();
    }
  }
  // рёбра профнастила на боковой стене: тёмная и светлая линия на каждом шаге
  function ribs(xw, z0, z1, y0, y1, st, c, f) {
    const dk = css(lit(mul(c, 0.72), f, (z0 + z1) / 2), 0.7), lt = css(lit(mul(c, 1.18), f, (z0 + z1) / 2), 0.55);
    for (let z = z0 + st; z < z1 - 0.05; z += st) {
      const a = P(xw, y1, z), b = P(xw, y0, z), d = Math.max(0.8, F * 0.035 / z);
      x.fillStyle = dk; x.fillRect(a[0] - d * 0.5, a[1], d, b[1] - a[1]);
      x.fillStyle = lt; x.fillRect(a[0] + d * 0.6, a[1], d * 0.8, b[1] - a[1]);
    }
  }

  // ---------- Ближний левый модуль на сваях: лаборатория «ЛАБ-2» ----------
  function moduleL() {
    const xw = -6.8, xb = -10.6, z0 = 4, z1 = 16.5, yf = 1.35, yt = 4.3, wallC = [150, 88, 72];
    const m = (u, v) => [xw, v, u], m2 = (u, v) => [xw - 0.16, v, u];
    const dk = (c, z) => css(lit(c, 'L', z));
    underGap(xw, xb, z0, z1, yf, 2.4);
    driftSide(xw - 0.1, z0, 7.8, 0.8, 0.6, 1.9, 6102, [198, 208, 220]); driftSide(xw - 0.1, 8.9, z1, 0.65, 0.5, 1.7, 6103, [198, 208, 220]);
    // стена из профнастила, грязь снизу, цокольный отлив, угловой нащельник
    fill3([[xw, yf, z0], [xw, yt, z0], [xw, yt, z1], [xw, yf, z1]], sideFill(wallC, 'L', xw, z0, z1));
    ribs(xw, z0, z1, yf + 0.2, yt - 0.05, 0.32, wallC, 'L');
    // листы профнастила разного тона (±4 %) и выцветшие пятна краски — стена не одной заливкой
    { const pr = Tex.rng(6105);
      for (let z = z0; z < z1 - 0.1; z += 0.96) {
        const v = pr() - 0.5, zb = Math.min(z1, z + 0.96);
        fill3([[xw, yf, z], [xw, yt, z], [xw, yt, zb], [xw, yf, zb]], v > 0 ? 'rgba(236,214,196,' + (v * 0.16).toFixed(3) + ')' : 'rgba(40,24,20,' + (-v * 0.16).toFixed(3) + ')');
      }
      for (let k = 0; k < 4; k++) {
        const zc = lerp(z0 + 1, z1 - 1, pr()), yc = lerp(yf + 0.6, yt - 0.6, pr()), dz = 0.4 + 0.6 * pr(), dy = 0.3 + 0.4 * pr();
        fill3([[xw, yc - dy, zc - dz], [xw, yc + dy * 0.8, zc - dz * 0.7], [xw, yc + dy, zc + dz], [xw, yc - dy * 0.7, zc + dz * 0.8]], 'rgba(214,184,166,.13)');
      } }
    [[0, 0.45, 0.2], [0.45, 0.9, 0.08]].forEach((b) => fill3([[xw, yf + b[0], z0], [xw, yf + b[1], z0], [xw, yf + b[1], z1], [xw, yf + b[0], z1]], 'rgba(46,34,30,' + b[2] + ')'));
    fill3([[xw, yf, z0], [xw, yf + 0.18, z0], [xw, yf + 0.18, z1], [xw, yf, z1]], sideFill([92, 96, 102], 'L', xw, z0, z1));
    fill3([[xw, yf, z1 - 0.14], [xw, yt, z1 - 0.14], [xw, yt, z1], [xw, yf, z1]], dk([214, 212, 204], z1));
    streaksS(xw + 0.01, z0 + 0.3, z1 - 0.3, yt - 0.05, 1.0, 16, 6111, [58, 38, 30], 0.2);
    // окна с откосами: с решёткой, со шторкой, светящееся, обычное; под ними — потёки ржавчины
    [[7.5, 8.45, { bars: true }], [9.25, 10.15, { blind: 0.5 }], [12.75, 13.55, { lit: true }], [14.6, 15.35, {}]].forEach(function (w) {
      const o = w[2]; o.z = (w[0] + w[1]) / 2; o.f = 'L'; o.m2 = m2;
      win(m, w[0], w[1], 2.3, 3.45, o);
      for (let k = 0; k < 3; k++) {
        const zz = lerp(w[0], w[1], 0.2 + 0.3 * k), a = P(xw, 2.12, zz), b = P(xw, 1.45 + 0.2 * k, zz), d = F * 0.03 / zz;
        const g = x.createLinearGradient(0, a[1], 0, b[1]); g.addColorStop(0, 'rgba(92,52,30,.45)'); g.addColorStop(1, 'rgba(92,52,30,0)');
        x.fillStyle = g; x.fillRect(a[0] - d, a[1], 2 * d, b[1] - a[1]);
      }
    });
    // дверь: коробка, утопленное полотно с окошком, потёртый низ
    fill3([m(10.93, yf), m(10.93, yf + 2.14), m(11.97, yf + 2.14), m(11.97, yf)], dk([70, 74, 80], 11.4));
    fill3([m(11.9, yf), m(11.9, yf + 2.05), m2(11.9, yf + 2.05), m2(11.9, yf)], css(lit([96, 100, 104], 'F', 11.9)));
    fill3([m2(11.0, yf), m2(11.0, yf + 2.05), m2(11.9, yf + 2.05), m2(11.9, yf)], dk([80, 100, 96], 11.4));
    fill3([m2(11.3, 2.62), m2(11.3, 3.02), m2(11.6, 3.02), m2(11.6, 2.62)], css(fog([60, 68, 78], 11.4)));
    fill3([m2(11.0, yf), m2(11.0, yf + 0.35), m2(11.9, yf + 0.35), m2(11.9, yf)], 'rgba(40,36,32,.3)');
    fill3([m2(11.74, 2.3), m2(11.74, 2.36), m2(11.84, 2.36), m2(11.84, 2.3)], css(fog([30, 32, 34], 11.4)));
    // вентблок с жалюзи и кабель-канал под карнизом со спуском к щитку
    box(xw, xw + 0.45, 3.45, 3.95, 13.95, 14.5, [128, 132, 136]);
    for (let yy = 3.52; yy < 3.92; yy += 0.08) line3([xw + 0.46, yy, 13.97], [xw + 0.46, yy, 14.48], 1, css(lit([60, 64, 70], 'L', 14.2), 0.8));
    line3([xw + 0.04, 4.02, 7.0], [xw + 0.04, 4.02, 16.3], lw(0.05, 10, 1.2), dk([54, 56, 60], 10));
    line3([xw + 0.04, 4.02, 12.4], [xw + 0.04, 3.35, 12.4], lw(0.05, 12.4, 1.2), dk([54, 56, 60], 12.4));
    box(xw, xw + 0.15, 3.0, 3.38, 12.25, 12.55, [150, 152, 150]);
    // козырёк над дверью со снегом и фонарь с небольшим тёплым пятном света
    box(xw, xw + 0.9, 3.62, 3.72, 10.75, 12.15, [96, 100, 106]);
    box(xw, xw + 0.97, 3.72, 3.9, 10.7, 12.2, { F: [226, 230, 236], S: [214, 222, 232], T: [236, 240, 244] });
    box(xw, xw + 0.22, 3.4, 3.58, 11.35, 11.55, [60, 62, 66]);
    fill3([[xw + 0.02, 3.4, 11.37], [xw + 0.2, 3.4, 11.37], [xw + 0.2, 3.4, 11.53], [xw + 0.02, 3.4, 11.53]], 'rgb(255,226,178)');
    const lp = P(xw + 0.1, 3.3, 11.45), lr = F * 1.5 / 11.45, lg = x.createRadialGradient(lp[0], lp[1], 1, lp[0], lp[1], lr);
    lg.addColorStop(0, 'rgba(255,214,160,.22)'); lg.addColorStop(1, 'rgba(255,214,160,0)');
    x.fillStyle = lg; x.fillRect(lp[0] - lr, lp[1] - lr * 0.4, 2 * lr, lr * 1.6);
    // снег на крыше и оборудование над ней: вытяжки, тарелка, мачта с антенной
    [[6.6, -7.7], [10.8, -8.1]].forEach((v) => { post(v[1], v[0], 0.09, yt + 0.4, yt + 1.3, [120, 124, 128]); box(v[1] - 0.15, v[1] + 0.15, yt + 1.3, yt + 1.4, v[0] - 0.15, v[0] + 0.15, [90, 94, 98]); });
    satDish(-7.9, yt + 0.5, 14.2, 0.62);
    const ma = [-8.6, 16.0];
    post(ma[0], ma[1], 0.05, yt + 0.4, yt + 4.1, [70, 74, 80]);
    line3([ma[0] - 1.1, yt + 3.9, ma[1]], [ma[0] + 1.1, yt + 3.9, ma[1]], 1.4, css(fog([60, 64, 70], 16)));
    for (let k = -2; k <= 2; k++) line3([ma[0] + k * 0.45, yt + 3.7, ma[1]], [ma[0] + k * 0.45, yt + 4.1, ma[1]], 1.1, css(fog([60, 64, 70], 16)));
    [[-10.3, 14.5], [-7.0, 15.2]].forEach((an) => line3([ma[0], yt + 3.0, ma[1]], [an[0], yt + 0.45, an[1]], 1, 'rgba(60,64,70,.6)'));
    roofSnowSide(xw, z0, z1, yt + 0.12, 0.42, 6101);
    stairsL(xw, yf);
    // вывеска «ЛАБ-2» стоит на лицевой кромке козырька — лицом к камере, читается
    const sz = 10.68, sg = (X0, X1, Y0, Y1, c) => fill3([[X0, Y0, sz], [X1, Y0, sz], [X1, Y1, sz], [X0, Y1, sz]], c);
    sg(xw + 0.04, xw + 0.93, 3.9, 4.27, css(lit([222, 224, 222], 'F', sz)));
    sg(xw + 0.08, xw + 0.89, 3.94, 4.23, css(lit([58, 86, 122], 'F', sz)));
    textF('ЛАБ-2', xw + 0.485, 4.085, sz - 0.01, 0.19, css(fog([238, 240, 242], sz)));
    sg(xw + 0.04, xw + 0.93, 4.27, 4.31, css(fog([236, 240, 244], sz)));
  }
  // открытая стальная лестница вдоль стены к двери: площадка, ступени со снегом, косоур, перила
  function stairsL(xw, yf) {
    const xo = xw + 1.2, zl = 10.6, zt = 12.3, run = 0.32, rise = yf / 7;
    const grate = [70, 78, 82], snowT = [228, 233, 238];
    box(xw, xo, yf - 0.1, yf, zl, zt, grate);
    box(xw + 0.05, xo - 0.08, yf, yf + 0.06, zl + 0.05, zt - 0.1, { F: snowT, S: snowT, T: snowT });
    for (let i = 0; i < 6; i++) {
      const yy = yf - (i + 1) * rise, za = zl - (i + 1) * run, zb = zl - i * run;
      box(xw + 0.05, xo - 0.04, yy - 0.05, yy, za, zb, grate);
      box(xw + 0.08, xo - 0.1, yy, yy + 0.05, za + 0.02, zb - 0.02, { F: snowT, S: snowT, T: snowT });
    }
    // косоур со стороны дороги
    const zb = zl - 7 * run;
    fill3([[xo, yf + 0.02, zl], [xo, 0.02, zb], [xo, -0.2, zb], [xo, yf - 0.2, zl]], css(lit([64, 70, 74], 'L', 9.5)));
    // перила: стойки и поручень, на поручне — полоска снега
    const rc = css(lit([58, 66, 70], 'L', 10)), rw = (z) => lw(0.045, z, 1.3);
    [[zt, yf], [zl, yf], [zl - 3 * run, yf - 3 * rise], [zb + 0.2, 0.2]].forEach((s) => line3([xo, s[1], s[0]], [xo, s[1] + 1.0, s[0]], rw(s[0]), rc));
    line3([xo, yf + 1.0, zt], [xo, yf + 1.0, zl], rw(11), rc);
    line3([xo, yf + 1.0, zl], [xo, 1.2, zb + 0.2], rw(9.5), rc);
    line3([xo, yf + 1.04, zt], [xo, yf + 1.04, zl], 1.2, 'rgba(232,236,240,.8)');
    line3([xo, yf + 0.5, zt], [xo, yf + 0.5, zl], rw(11) * 0.7, rc);
  }
  // спутниковая тарелка на короткой стойке: смотрит в небо на юг (влево-назад), видим тыльную сторону
  function satDish(X, Y, Z, r) {
    post(X, Z, 0.04, Y - 0.3, Y + 0.6, [90, 94, 100]);
    const c = P(X, Y + 0.9, Z), rx = F * r / Z;
    x.save(); x.translate(c[0], c[1]); x.rotate(-0.35);
    x.fillStyle = css(fog([186, 190, 194], Z)); x.beginPath(); x.ellipse(0, 0, rx * 0.42, rx, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = css(fog([142, 148, 156], Z)); x.beginPath(); x.ellipse(rx * 0.1, 0, rx * 0.28, rx * 0.86, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = css(fog([70, 74, 80], Z)); x.lineWidth = Math.max(1, rx * 0.06);
    x.beginPath(); x.moveTo(-rx * 0.2, 0); x.lineTo(-rx * 0.95, -rx * 0.15); x.stroke();
    x.restore();
  }

  // ---------- Выветривание стен: потёки, полосы грязи, копоть ----------
  // вертикальные потёки на боковой стене X = xw: от высоты y0 вниз, длина до len (м), ширина ≥ 3 px
  // Потёки собраны в гроздья под точками стока (стык, угол, труба); каждый сужается книзу и гаснет,
  // поверх широкой бледной «тени» — узкая сердцевина, поэтому края мягкие, а не прямоугольные.
  function streaksS(xw, z0, z1, y0, len, n, seed, col, a) {
    const rr = Tex.rng(seed), drips = [];
    for (let k = 0; k < Math.max(1, Math.round(n / 4)); k++) drips.push(lerp(z0, z1, rr()));
    const one = (z, l, d, aa) => {
      const p0 = P(xw, y0, z), p1 = P(xw, y0 - l, z), g = x.createLinearGradient(0, p0[1], 0, p1[1]);
      g.addColorStop(0, css(col, aa)); g.addColorStop(0.3, css(col, aa * 0.7)); g.addColorStop(1, css(col, 0));
      x.fillStyle = g; x.beginPath();
      x.moveTo(p0[0] - d / 2, p0[1]); x.lineTo(p0[0] + d / 2, p0[1]); x.lineTo(p1[0] + d * 0.1, p1[1]); x.lineTo(p1[0] - d * 0.1, p1[1]);
      x.closePath(); x.fill();
    };
    for (let k = 0; k < n; k++) {
      const z = clamp(drips[Math.floor(rr() * drips.length)] + (rr() - 0.5) * 0.5, z0, z1), l = len * (0.3 + 0.7 * rr() * rr());
      const d = Math.max(2.5 * Math.min(1, K * 2), F * (0.04 + 0.06 * rr()) / z), aa = a * (0.5 + 0.5 * rr());
      one(z, l * 0.8, d * 2.4, aa * 0.3);
      one(z, l, d, aa);
    }
  }

  // ---------- Ближний правый модуль: дизельная электростанция «ДЭС» ----------
  // Вход — через закрытый тамбур с прямой лестницей и площадкой вдоль стены (не как у лаборатории).
  function moduleR() {
    const xw = 7.2, xb = 11, z0 = 3, z1 = 13.5, yf = 1.1, yt = 4.2, wallC = [180, 178, 168];
    const m = (u, v) => [xw, v, u], m2 = (u, v) => [xw + 0.14, v, u];
    const lt = (c, z) => css(lit(c, 'Rt', z));
    underGap(xw, xb, z0, z1, yf, 2.5);
    driftSide(xw + 0.1, z0, 7.5, 0.7, 0.55, 1.6, 6202, [214, 222, 230]);
    driftSide(xw + 0.1, 12.6, z1, 0.6, 0.45, 1.5, 6203, [214, 222, 230]);
    // выхлопные трубы на крыше — до стены: стоят за карнизом, их низ закрывают стена и снежный навес
    exhaust(7.85, 10.6, 0.15, yt + 1.68, [96, 72, 60], true);
    exhaust(8.15, 12.0, 0.11, yt + 1.42, [126, 128, 128], false);
    fill3([[xw, yf, z0], [xw, yt, z0], [xw, yt, z1], [xw, yf, z1]], sideFill(wallC, 'Rt', xw, z0, z1));
    // цокольная полоса, стыки сэндвич-панелей (горизонтальные через 1 м, вертикальные через 3 м)
    fill3([[xw, yf, z0], [xw, yf + 0.55, z0], [xw, yf + 0.55, z1], [xw, yf, z1]], sideFill([88, 106, 124], 'Rt', xw, z0, z1));
    x.lineCap = 'butt';
    [yf + 0.55, 2.65, 3.65].forEach((yy) => line3([xw, yy, z0], [xw, yy, z1], 1.3, css(lit([120, 118, 110], 'Rt', 9), 0.8)));
    // сэндвич-панели чуть разного тона, рыжие подтёки у крепежа на стыках
    { const pr = Tex.rng(6215);
      for (let z = 1.5; z < z1; z += 3) {
        const za = Math.max(z0, z), zb = Math.min(z1, z + 3), v = pr() - 0.5;
        [[yf + 0.55, 2.65], [2.65, 3.65], [3.65, yt]].forEach((b, j) => {
          const vv = v + (pr() - 0.5) * 0.5;
          fill3([[xw, b[0], za], [xw, b[1], za], [xw, b[1], zb], [xw, b[0], zb]], vv > 0 ? 'rgba(246,244,236,' + (vv * 0.14).toFixed(3) + ')' : 'rgba(60,56,48,' + (-vv * 0.12).toFixed(3) + ')');
        });
      }
      for (let z = 4.5; z < z1; z += 3) [2.65, 3.65].forEach((yy) => { if (pr() < 0.6) fill3([[xw, yy - 0.02, z - 0.05], [xw, yy - 0.02, z + 0.05], [xw, yy - 0.3 - 0.2 * pr(), z + 0.02], [xw, yy - 0.3, z - 0.02]], 'rgba(132,82,50,.35)'); }); }
    for (let z = 4.5; z < z1; z += 3) line3([xw, yf, z], [xw, yt, z], lw(0.03, z, 1.2), css(lit([128, 126, 118], 'Rt', z), 0.8));
    fill3([[xw, yf, z1 - 0.14], [xw, yt, z1 - 0.14], [xw, yt, z1], [xw, yf, z1]], lt([150, 152, 150], z1));
    // грязь и соль по цоколю, потёки от карниза
    fill3([[xw, yf, z0], [xw, yf + 0.4, z0], [xw, yf + 0.4, z1], [xw, yf, z1]], 'rgba(78,64,50,.18)');
    streaksS(xw - 0.01, 3.4, z1 - 0.2, yt - 0.05, 1.3, 9, 6211, [92, 88, 80], 0.22);
    streaksS(xw - 0.01, 3.4, z1 - 0.2, yf + 0.55, 0.45, 7, 6212, [70, 62, 52], 0.18);
    // жалюзийная решётка радиатора над маршем лестницы, копоть от труб веером вниз по стене
    fill3([m(7.9, 2.3), m(7.9, 3.65), m(9.9, 3.65), m(9.9, 2.3)], lt([74, 78, 82], 8.9));
    for (let yy = 2.37; yy < 3.6; yy += 0.11) fill3([m2(7.98, yy), m2(7.98, yy + 0.05), m2(9.82, yy + 0.05), m2(9.82, yy)], lt([150, 152, 150], 8.9));
    streaksS(xw - 0.02, 10.2, 11.0, yt + 0.02, 1.5, 5, 6213, [50, 46, 42], 0.2); streaksS(xw - 0.02, 11.6, 12.4, yt + 0.02, 1.1, 4, 6214, [50, 46, 42], 0.18);
    win(m, 12.85, 13.3, 2.4, 3.3, { z: 13.1, f: 'Rt', m2: m2, blind: 0.3 });
    vestibule(xw, yf);
    // снег на крыше с карнизом; копоть на снежном навесе под трубами
    roofSnowSide(xw, z0, z1, yt + 0.12, 0.4, 6201);
    fill3([[xw - 0.29, yt + 0.2, 10.0], [xw - 0.29, yt + 0.48, 10.5], [xw - 0.29, yt + 0.48, 12.2], [xw - 0.29, yt + 0.2, 12.6]], 'rgba(62,58,54,.24)');
  }
  // Выхлопная труба на крыше: круглая (светотень поперёк), закопчённый верх; cone — колпак-зонт на
  // двух стойках, иначе — открытый срез с утолщённым буртиком. Каждая труба со своим колпаком.
  function exhaust(X, Z, r, yTop, c, cone) {
    post(X, Z, r, yTop - 2.2, yTop, c);
    const a = P(X - r, yTop, Z), b = P(X + r, yTop - 0.45, Z), g = x.createLinearGradient(0, a[1], 0, b[1]);
    g.addColorStop(0, 'rgba(30,28,26,.55)'); g.addColorStop(1, 'rgba(30,28,26,0)');
    x.fillStyle = g; x.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    const t = P(X, yTop, Z), s = F / Z;
    if (cone) {
      // стойки, нижний край зонта (снизу виден как плоский эллипс) и конус над ним
      const yc = t[1] - 0.16 * s, wc = 1.45 * r * s;
      x.fillStyle = css(fog([58, 54, 50], Z));
      x.fillRect(t[0] - r * s * 0.8, yc, Math.max(1, 0.03 * s), t[1] - yc); x.fillRect(t[0] + r * s * 0.7, yc, Math.max(1, 0.03 * s), t[1] - yc);
      x.beginPath(); x.moveTo(t[0] - wc, yc); x.lineTo(t[0] - wc * 0.18, yc - 0.2 * s); x.lineTo(t[0] + wc * 0.18, yc - 0.2 * s); x.lineTo(t[0] + wc, yc); x.closePath();
      x.fillStyle = css(fog([84, 78, 72], Z)); x.fill();
      x.beginPath(); x.ellipse(t[0], yc, wc, Math.max(1.2, 0.035 * s), 0, 0, Math.PI * 2); x.fillStyle = css(fog([40, 38, 36], Z)); x.fill();
      // снег на зонте — тонкая шапка с левой (наветренной) стороны
      x.beginPath(); x.moveTo(t[0] - wc * 0.85, yc - 0.03 * s); x.lineTo(t[0] - wc * 0.15, yc - 0.19 * s); x.lineTo(t[0] + wc * 0.1, yc - 0.19 * s); x.lineTo(t[0] - wc * 0.3, yc - 0.06 * s); x.closePath();
      x.fillStyle = css(fog([228, 232, 236], Z)); x.fill();
    } else {
      // буртик на срезе трубы
      x.fillStyle = css(fog(mul(c, 0.55), Z)); x.fillRect(t[0] - r * 1.25 * s, t[1] - 0.02 * s, 2.5 * r * s, Math.max(1.5, 0.09 * s));
    }
  }
  // Тамбур входа ДЭС: закрытая будка на стойках, дверь и табличка — на торце лицом к камере;
  // перед дверью площадка, от неё прямой марш вдоль стены к камере (низ — у тропы с дороги)
  function vestibule(xw, yf) {
    // в отличие от металлической лестницы лаборатории — деревянное крыльцо: дощатые ступени, обшитый бок
    const vx = 5.8, vz0 = 10.2, vz1 = 12.4, vy = 3.45, vc = [166, 170, 166], gr = [118, 100, 80];
    const sn = { F: [228, 232, 237], S: [232, 236, 240], T: [236, 240, 244] }, rise = yf / 4;
    [[5.95, 12.25], [5.95, 10.35], [5.95, 9.3], [7.05, 9.3]].forEach((p) => post(p[0], p[1], 0.06, 0, yf, [66, 70, 76]));
    box(vx, xw, yf - 0.06, vy, vz0, vz1, { F: vc, S: vc, T: [226, 230, 234] });
    const sd = (u, v) => [vx, v, u], df = (u, v) => [u, v, vz0 - 0.01];
    line3(sd(11.3, yf), sd(11.3, vy), lw(0.025, 11.3, 1), css(lit([118, 122, 118], 'Rt', 11.3), 0.8));
    fill3([sd(vz0, yf), sd(vz0, yf + 0.35), sd(vz1, yf + 0.35), sd(vz1, yf)], 'rgba(78,64,50,.2)');
    win(sd, 11.65, 12.15, 2.25, 2.85, { z: 11.9, f: 'Rt', fr: [190, 192, 190] });
    // знак «высокое напряжение» на боковой грани
    const t0 = sd(10.55, 2.05), t1 = sd(10.95, 2.05), t2 = sd(10.75, 2.48);
    path3([t0, t1, t2]); x.fillStyle = css(lit([196, 166, 70], 'Rt', 10.75)); x.fill();
    x.strokeStyle = css(fog([30, 30, 30], 10.75)); x.lineWidth = 1.1; x.stroke();
    const b0 = P.apply(null, sd(10.77, 2.4)), b1 = P.apply(null, sd(10.72, 2.24)), b2 = P.apply(null, sd(10.78, 2.24)), b3 = P.apply(null, sd(10.73, 2.1));
    x.beginPath(); x.moveTo(b0[0], b0[1]); x.lineTo(b1[0], b1[1]); x.lineTo(b2[0], b2[1]); x.lineTo(b3[0], b3[1]); x.stroke();
    // дверь на торце: коробка, полотно с потёртым низом, ручка; табличка «ДЭС» над ней, фонарь
    fill3([df(6.12, yf), df(6.12, yf + 2.1), df(7.02, yf + 2.1), df(7.02, yf)], css(lit([78, 82, 88], 'F', vz0)));
    fill3([df(6.18, yf + 0.02), df(6.18, yf + 2.04), df(6.96, yf + 2.04), df(6.96, yf + 0.02)], css(lit([100, 114, 124], 'F', vz0)));
    fill3([df(6.18, yf + 0.02), df(6.18, yf + 0.36), df(6.96, yf + 0.36), df(6.96, yf + 0.02)], 'rgba(44,38,32,.3)');
    fill3([df(6.84, 2.08), df(6.84, 2.14), df(6.93, 2.14), df(6.93, 2.08)], css(fog([34, 36, 38], vz0)));
    fill3([df(6.16, 3.0), df(6.16, 3.34), df(6.98, 3.34), df(6.98, 3.0)], css(lit([58, 86, 122], 'F', vz0)));
    textF('ДЭС', 6.57, 3.17, vz0 - 0.02, 0.21, css(fog([236, 238, 240], vz0)));
    box(6.45, 6.69, 3.36, 3.44, vz0 - 0.22, vz0, [62, 64, 68]);
    fill3([[6.47, 3.36, vz0 - 0.2], [6.67, 3.36, vz0 - 0.2], [6.67, 3.36, vz0 - 0.02], [6.47, 3.36, vz0 - 0.02]], 'rgb(255,228,184)');
    // крыша тамбура и снежная шапка с нависанием
    box(vx - 0.08, xw, vy, vy + 0.1, vz0 - 0.1, vz1, [108, 112, 118]);
    const cap = [];
    for (let i = 0; i <= 10; i++) { const X = lerp(vx - 0.1, xw, i / 10); cap.push([X, vy + 0.24 + 0.06 * Math.sin(i * 1.7), vz0 - 0.12]); }
    fill3(cap.concat([[xw, vy + 0.1, vz0 - 0.12], [vx - 0.1, vy + 0.1, vz0 - 0.12]]), css(fog([234, 238, 242], vz0)));
    fill3([[vx - 0.1, vy + 0.1, vz0 - 0.12], [vx - 0.1, vy + 0.28, vz0 - 0.12], [vx - 0.1, vy + 0.26, vz1], [vx - 0.1, vy + 0.1, vz1]], sideFill([230, 234, 238], 'Rt', vx - 0.1, vz0, vz1));
    // площадка перед дверью и прямой марш к камере: решётка, снег на ступенях, косоур со стороны дороги
    box(5.85, 7.15, yf - 0.08, yf, 9.2, vz0, gr); box(5.88, 7.12, yf, yf + 0.05, 9.25, vz0 - 0.05, sn);
    for (let i = 0; i < 4; i++) {
      const yy = yf - (i + 1) * rise, za = 9.2 - (i + 1) * 0.32, zb = 9.2 - i * 0.32;
      box(5.9, 7.1, yy - 0.05, yy, za, zb, gr); box(5.93, 7.07, yy, yy + 0.045, za + 0.02, zb - 0.03, sn);
    }
    // бок крыльца обшит досками до земли (закрытый, без просветов), низ занесён снегом
    const wd = [104, 88, 70];
    fill3([[5.87, yf + 0.02, vz0], [5.87, yf + 0.02, 9.2], [5.87, 0.02, 7.92], [5.87, 0, 7.92], [5.87, 0, vz0]], css(lit(wd, 'Rt', 9)));
    x.lineCap = 'butt';
    for (let yy = 0.16; yy < yf; yy += 0.16) {
      const zs = Math.max(7.92, 9.2 - (yf - yy) / yf * 1.28);
      line3([5.869, yy, zs], [5.869, yy, vz0], 1, css(lit([70, 58, 46], 'Rt', 9), 0.55));
    }
    fill3([[5.87, 0, 7.92], [5.87, 0.22, 8.1], [5.87, 0.3, 9.4], [5.87, 0.18, vz0], [5.87, 0, vz0]], css(fog([214, 220, 228], 9)));
    // деревянные перила: толстые стойки и брус-поручень со снегом сверху
    const rc = css(lit([92, 76, 60], 'Rt', 9)), rw = (z) => lw(0.08, z, 1.6);
    [[vz0 - 0.05, yf], [9.2, yf], [7.98, 0.12]].forEach((s) => line3([5.86, s[1], s[0]], [5.86, s[1] + 0.95, s[0]], rw(s[0]), rc));
    line3([5.86, yf + 0.95, vz0 - 0.05], [5.86, yf + 0.95, 9.2], rw(9.7), rc);
    line3([5.86, yf + 0.95, 9.2], [5.86, 1.07, 7.98], rw(8.6), rc);
    line3([5.86, yf + 1.0, vz0 - 0.05], [5.86, yf + 1.0, 9.2], 1.6, 'rgba(234,238,242,.85)');
    line3([5.86, yf + 1.0, 9.2], [5.86, 1.12, 7.98], 1.4, 'rgba(234,238,242,.7)');
  }

  // ---------- Линия электропередачи справа: деревянные опоры, траверсы, провисающие провода ----------
  const POLES = [17, 41, 65, 89, 113], PX = 5.3;
  // провод между точками a и b (м) с провисом sag; толщина t (м) — линия тоньше с глубиной, не тоньше 1.1 px
  function wire(a, b, sag, t, col) {
    const pts = [];
    for (let i = 0; i <= 32; i++) {
      const k = i / 32, Z = lerp(a[2], b[2], k);
      if (Z < 0.9) continue;
      pts.push(P(lerp(a[0], b[0], k), lerp(a[1], b[1], k) - sag * 4 * k * (1 - k), Z).concat(Z));
    }
    x.strokeStyle = col; x.lineJoin = 'round'; x.lineCap = 'round';
    for (let i = 0; i < pts.length - 1; i += 3) {
      const j = Math.min(pts.length - 1, i + 3);
      x.beginPath(); x.moveTo(pts[i][0], pts[i][1]);
      for (let k = i + 1; k <= j; k++) x.lineTo(pts[k][0], pts[k][1]);
      x.lineWidth = Math.max(1.1, F * t / ((pts[i][2] + pts[j][2]) / 2)); x.stroke();
    }
  }
  function pole(Z, lamp) {
    const wood = [104, 94, 82], ya = 7.9;
    post(PX, Z, 0.13, -0.2, 8.4, wood);
    box(PX - 1.1, PX + 1.1, ya - 0.1, ya, Z - 0.06, Z + 0.06, [90, 82, 72]);
    box(PX - 1.12, PX + 1.12, ya, ya + 0.05, Z - 0.07, Z + 0.07, [226, 230, 236]);
    [-0.95, 0.95].forEach((dx) => post(PX + dx, Z, 0.05, ya, ya + 0.2, [176, 180, 182]));
    post(PX, Z, 0.05, 8.4, 8.6, [176, 180, 182]);
    box(PX - 0.5, PX + 0.5, 6.55, 6.63, Z - 0.05, Z + 0.05, [90, 82, 72]);
    if (lamp) {
      // консоль над дорогой и светильник; свет днём едва заметен
      line3([PX, 7.2, Z], [PX - 1.6, 7.45, Z], lw(0.05, Z, 1.3), css(fog([70, 74, 78], Z)));
      box(PX - 2.1, PX - 1.5, 7.3, 7.45, Z - 0.15, Z + 0.15, [86, 90, 96]);
      fill3([[PX - 2.05, 7.3, Z - 0.12], [PX - 1.55, 7.3, Z - 0.12], [PX - 1.55, 7.3, Z + 0.12], [PX - 2.05, 7.3, Z + 0.12]], css(fog([250, 230, 196], Z * 0.5)));
    }
    // снег у основания
    const b0 = P(PX - 0.5, 0, Z), b1 = P(PX + 0.5, 0, Z), bt = P(PX, 0.35, Z);
    x.fillStyle = css(fog([222, 228, 234], Z)); x.beginPath(); x.moveTo(b0[0], b0[1]);
    x.quadraticCurveTo(bt[0] - (b1[0] - b0[0]) * 0.2, bt[1], b1[0], b1[1]); x.closePath(); x.fill();
  }
  function powerLine() {
    for (let i = POLES.length - 1; i >= 0; i--) pole(POLES[i], i === 1 || i === 3);
    const col = (z) => css(fog([46, 50, 56], z), 0.9);
    // первая опора — концевая: от неё только отводы, оттяжка к анкеру в сторону камеры
    for (let i = 0; i < POLES.length - 1; i++) {
      const za = POLES[i], zb = POLES[i + 1];
      [-0.95, 0.95].forEach((dx) => wire([PX + dx, 8.15, za], [PX + dx, 8.15, zb], 0.55, 0.02, col(zb)));
      wire([PX + 0.45, 6.6, za], [PX + 0.45, 6.6, zb], 0.7, 0.026, col(zb));
    }
    wire([PX, 7.7, POLES[0]], [PX + 0.4, 0.05, POLES[0] - 4.5], 0, 0.015, col(14));
    // отводы к модулям: через дорогу к лаборатории и к ДЭС
    wire([PX - 0.95, 8.15, POLES[0]], [-6.8, 4.15, 15.6], 0.55, 0.02, col(15));
    wire([PX - 0.45, 6.6, POLES[0]], [-6.8, 3.95, 15.9], 0.6, 0.018, col(15));
    wire([PX + 0.95, 8.15, POLES[0]], [7.2, 4.0, 12.8], 0.25, 0.025, col(13));
  }

  // ---------- Отвалы снега вдоль дороги (после грейдера): видна внутренняя грань и гребень ----------
  const ROADW = 3.8;
  function berm(dir, segs, seed) {
    const n = Tex.perlin(seed), rr = Tex.rng(seed + 1), f = dir < 0 ? 0.9 : 1.0;
    // полоса грани отвала между долями t0..t1 высоты (от подошвы к гребню); туман — градиентом по глубине
    const strip = (crest, foot, t0, t1, rgb) => {
      // волнистость сдвигает все полосы одинаково (монотонно по t) — полосы не пересекаются, переход плавный;
      // профиль скруглён: верх грани выпуклый (k^0.7 по высоте)
      const at = (i, t) => { const c = crest[i], q = foot[i], k = clamp(t + 0.05 * Math.sin(Math.PI * t) * n(c[2] * 0.9, 4.4), 0, 1); return [lerp(q[0], c[0], k), c[1] * Math.pow(k, 0.7), c[2]]; };
      const lo = [], hi = [];
      for (let i = 0; i < crest.length; i++) { lo.push(at(i, t0)); hi.push(at(i, t1)); }
      path3(lo.concat(hi.reverse()));
      const z0 = crest[0][2], z1 = crest[crest.length - 1][2], y0 = gy(z0), y1 = gy(z1), g = x.createLinearGradient(0, y0, 0, y1);
      for (let k = 0; k <= 6; k++) { const Z = z0 * Math.pow(z1 / z0, k / 6); g.addColorStop(clamp((gy(Z) - y0) / (y1 - y0), 0, 1), css(fog(mul(rgb, f), Z))); }
      x.fillStyle = g; x.fill();
    };
    segs.forEach(function (sg) {
      const crest = [], foot = [], N = 46;
      for (let i = 0; i <= N; i++) {
        const z = sg[0] * Math.pow(sg[1] / sg[0], i / N), e = Math.min(1, (z - sg[0]) / 0.8, (sg[1] - z) / 0.8);
        const hh = (0.38 + 0.2 * n(z * 0.21, 1.1) + 0.1 * n(z * 0.9, 3.3) + 0.04 * n(z * 3.1, 6.6) + 0.12 * Math.max(0, n(z * 1.7, 2.2))) * Math.max(0.15, e);
        crest.push([dir * (ROADW + 0.45 + 0.15 * n(z * 0.4, 9.2)), hh, z]);
        foot.push([dir * (ROADW - 0.05 + 0.12 * n(z * 0.5, 5.4)), 0, z]);
      }
      // внутренняя грань слоями от ножа грейдера: у подошвы — серая слякоть с песком, выше — чистый снег,
      // гребень на свету; уступы между слоями дают рельеф
      // плавный профиль: серая слякоть у подошвы → голубовато-серый склон → светлый скруглённый гребень.
      // 12 узких полос с соседними цветами читаются как градиент поперёк вала, без граней и обводок.
      const prof = [[0, [182, 182, 180]], [0.12, [190, 196, 204]], [0.4, [200, 208, 218]], [0.72, [216, 223, 231]], [0.9, [232, 236, 241]], [1, [238, 241, 245]]];
      const pc = (t) => { let k = 1; while (k < prof.length - 1 && prof[k][0] < t) k++; const a = prof[k - 1], b = prof[k]; return mix(a[1], b[1], sm(a[0], b[0], t)); };
      const NS = K > 0.5 ? 12 : 5;
      for (let s = 0; s < NS; s++) { const t0 = s / NS, t1 = (s + 1) / NS + (s < NS - 1 ? 0.01 : 0); strip(crest, foot, t0, Math.min(1, t1), pc((t0 + t1) / 2)); }
      const zm = Math.sqrt(sg[0] * sg[1]);
      x.lineJoin = 'round';
      // одна чёткая кромка надува на гребне (тонкая, полупрозрачная)
      x.beginPath(); crest.forEach((p, i) => { const s = P(p[0], p[1], p[2]); if (i) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); });
      x.strokeStyle = css(fog([244, 246, 249], zm), 0.55); x.lineWidth = 1.2; x.stroke();
      // комья, скатившиеся с отвала на обочину: немного, у камеры
      if (K > 0.5) {
        for (let k = 0; k < 4; k++) {
          const z = sg[0] + (sg[1] - sg[0]) * Math.pow(rr(), 2);
          if (z > 24) continue;
          lump(dir * (ROADW - 0.12 - rr() * 0.3), z, 0.04 + 0.05 * rr(), rr, rr() < 0.35);
        }
      }
    });
  }

  // ---------- Падающие тени: маски в 1/2 разрешения, умножение холодным серо-голубым ----------
  // Пасмурно — тени слабые (≈ 0,2). У оснований и тонких опор край резкий, с удалением от основания
  // тень размывается: две маски — «тела целиком» (сильное размытие) и «основания + тонкие опоры» (почти без).
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    pts.forEach((p) => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  const gP = (X, Y, Z) => P(X + Y * SHX, 0, Z + Y * SHZ);   // тень точки на земле в экранных координатах
  // все тела, отбрасывающие тень: box(x0, x1, y0, y1, z0, z1), post(X, Z, r, y1)
  function casters(box, post) {
    // модули на сваях (корпус со снегом на крыше), оба ряда свай, мачта на крыше лаборатории
    box(-10.6, -6.5, 1.35, 4.95, 4, 16.5);
    for (let z = 4.4; z < 16.5; z += 2.4) { post(-6.65, z, 0.11, 1.35); post(-10.35, z + 0.3, 0.09, 1.35); }
    post(-8.6, 16, 0.05, 8.4);
    box(7.2, 11, 1.1, 4.8, 3, 13.5);
    for (let z = 3.4; z < 13.5; z += 2.5) { post(7.35, z, 0.11, 1.1); post(10.75, z + 0.3, 0.09, 1.1); }
    POLES.forEach((z) => post(PX, z, 0.13, 8.5));
    SHADOW_EXTRA.forEach((f) => f(box, post));
  }
  function shadows() {
    const mk = () => { const c = cnv(W * K * 0.5, H * K * 0.5), s = c.getContext('2d'); s.setTransform(c.width / W, 0, 0, c.height / H, 0, 0); s.fillStyle = '#000'; return c; };
    const soft = mk(), crisp = mk();
    let s = null;
    const shape = (pts) => { s.beginPath(); pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]))); s.closePath(); s.fill(); };
    const boxH = (x0, x1, y0, y1, z0, z1) => { const pts = []; [x0, x1].forEach((X) => [y0, y1].forEach((Y) => [z0, z1].forEach((Z) => pts.push(gP(X, Y, Z))))); shape(hull(pts)); };
    const postH = (X, Z, r, y1) => shape([gP(X - r, 0, Z), gP(X + r, 0, Z), gP(X + r, y1, Z), gP(X - r, y1, Z)]);
    s = soft.getContext('2d'); casters(boxH, postH);
    s = crisp.getContext('2d');
    casters((x0, x1, y0, y1, z0, z1) => { if (y0 < 0.3) boxH(x0, x1, y0, Math.min(y1, y0 + 0.8), z0, z1); },
      (X, Z, r, y1) => postH(X, Z, r, r < 0.15 ? y1 : Math.min(y1, 1.2)));
    // объединение масок: мягкая размыта сильно, резкая — чуть-чуть
    const u = cnv(soft.width, soft.height), ux = u.getContext('2d');
    ux.filter = 'blur(' + Math.max(0.5, 3 * K).toFixed(2) + 'px)'; ux.drawImage(soft, 0, 0);
    ux.filter = 'blur(' + Math.max(0.3, 0.5 * K).toFixed(2) + 'px)'; ux.drawImage(crisp, 0, 0);
    ux.filter = 'none';
    tintMul(u, 0.21, 0, 'rgb(4,30,66)');
    // контактные тени (ambient occlusion) у оснований — они и «сажают» предметы на снег
    const a = cnv(W * K * 0.5, H * K * 0.5), s2 = a.getContext('2d');
    s2.setTransform(a.width / W, 0, 0, a.height / H, 0, 0); s2.fillStyle = '#000';
    const foot = (x0, x1, z0, z1) => {
      s2.beginPath(); [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach((q, i) => { const p = P(q[0], 0, q[1]); if (i) s2.lineTo(p[0], p[1]); else s2.moveTo(p[0], p[1]); });
      s2.closePath(); s2.fill();
    };
    const disc = (X, Z, r) => {
      s2.beginPath();
      for (let i = 0; i < 20; i++) { const t = i / 20 * Math.PI * 2, p = P(X + Math.cos(t) * r, 0, Z + Math.sin(t) * r); if (i) s2.lineTo(p[0], p[1]); else s2.moveTo(p[0], p[1]); }
      s2.closePath(); s2.fill();
    };
    AO_EXTRA.forEach((f) => f(foot, disc));
    POLES.forEach((z) => disc(PX, z, 0.32));
    for (let z = 4.4; z < 16.5; z += 2.4) disc(-6.65, z, 0.28);
    for (let z = 3.4; z < 13.5; z += 2.5) disc(7.35, z, 0.28);
    foot(-6.9, -5.4, 8.1, 8.8); foot(5.85, 7.15, 7.7, 8.02);   // низ лестниц
    tintMul(a, 0.45, 2.6, 'rgb(14,30,56)');
  }
  // маска (чёрное — тень) → размытие → окраска (screen) → умножение на сцену; белое ничего не меняет
  function tintMul(m, alpha, blurPx, tint) {
    const b = cnv(m.width, m.height), bx = b.getContext('2d');
    bx.fillStyle = '#fff'; bx.fillRect(0, 0, b.width, b.height);
    bx.globalAlpha = alpha; bx.filter = 'blur(' + Math.max(0.5, blurPx * K).toFixed(2) + 'px)'; bx.drawImage(m, 0, 0);
    bx.filter = 'none'; bx.globalAlpha = 1; bx.globalCompositeOperation = 'screen';
    bx.fillStyle = tint; bx.fillRect(0, 0, b.width, b.height);
    x.save(); x.globalCompositeOperation = 'multiply'; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(b, 0, 0, W, H); x.restore();
  }

  const SHADOW_EXTRA = [];   // тени объектов, описанных ниже (баки, вездеход, ангар…)
  const AO_EXTRA = [];       // их пятна контактной тени: f(foot, disc)

  // ---------- Дорога векторами: колеи, протектор, позёмка, песок, лёд, люк, тропы, комья ----------
  // Колеи: центр X(Z), полуширина hw (м), сила k. Пары: правая полоса (грузовик), левая полоса,
  // гусеницы вездехода — от камеры по правой полосе и с поворотом к его стоянке справа (VH).
  const RUTS = [
    { x: 0.32, hw: 0.17, k: 0.95, s: 1 }, { x: 2.22, hw: 0.17, k: 0.95, s: 2 },
    { x: -2.45, hw: 0.16, k: 0.8, s: 3 }, { x: -0.62, hw: 0.16, k: 0.85, s: 4 },
    { x: 1.0, hw: 0.27, k: 0.7, s: 5, turn: 3.93, z1: 24.6 }, { x: 3.04, hw: 0.27, k: 0.7, s: 6, turn: 3.93, z1: 24.6 }
  ];
  const rutN = Tex.perlin(5204);
  function rutX(r, Z) {
    // колея виляет: медленный увод (у пары — свой, поэтому колеи то сходятся, то расходятся) + мелкая дрожь
    const X = r.x + 0.3 * rutN(Z * 0.05, r.s * 3.7) + 0.11 * rutN(Z * 0.16 + 3, r.s * 0.9) + 0.03 * rutN(Z * 0.5, r.s * 1.3);
    return r.turn ? X + r.turn * sm(12, 24.3, Z) : X;
  }
  const rutW = (r, Z) => r.hw * (1 + 0.38 * rutN(Z * 0.22 + 11, r.s * 2.1));
  // сила колеи вдоль дороги: местами заметена, у гусениц обрывается у стоянки
  const rutA = (r, Z) => r.k * (r.z1 ? sm(r.z1 + 0.2, r.z1 - 1.6, Z) : sm(130, 45, Z)) * clamp(0.7 + 0.75 * rutN(Z * 0.2 + 5, r.s), 0.12, 1);
  // полоса на земле между X = xa(Z) и xb(Z) от z0 до z1; col(Z) → [r, g, b, a]; заливка — градиент по экранной y
  function groundBand(xa, xb, z0, z1, col) {
    const N = 40, L = [], Q = [];
    for (let i = 0; i <= N; i++) { const Z = z0 * Math.pow(z1 / z0, i / N); L.push(P(xa(Z), 0, Z)); Q.push(P(xb(Z), 0, Z)); }
    poly2(L.concat(Q.reverse()));
    const y0 = gy(z0), y1 = gy(z1), g = x.createLinearGradient(0, y0, 0, y1);
    for (let i = 0; i <= 12; i++) {
      const Z = z0 * Math.pow(z1 / z0, i / 12), c = col(Z);
      g.addColorStop(clamp((gy(Z) - y0) / (y1 - y0), 0, 1), css(fog(c, Z), c[3]));
    }
    x.fillStyle = g; x.fill();
  }
  // Колея в разрезе (свет слева): светлый левый бортик, левая стенка в тени, дно наката с песком,
  // ледяная полоска посередине (блестит тем сильнее, чем дальше), правая стенка на свету.
  // Местами колея заметена — сила меняется вдоль дороги.
  function ruts() {
    RUTS.forEach(function (r) {
      const z1 = r.z1 || 120, c = (Z) => rutX(r, Z), w = (Z) => rutW(r, Z);
      // ближе 24 м колея рисуется попиксельно в ground(); здесь — только дальний хвост к точке схода
      if (z1 < 17) return;
      const al = (Z) => rutA(r, Z) * sm(16, 24, Z);
      const band = (fa, fb, rgb, a, fz) => groundBand(fa, fb, 15, z1, (Z) => [rgb[0], rgb[1], rgb[2], a * al(Z) * (fz ? fz(Z) : 1)]);
      band((Z) => c(Z) - w(Z) - 0.055, (Z) => c(Z) - w(Z), [238, 241, 244], 0.6);
      band((Z) => c(Z) - w(Z), (Z) => c(Z) - w(Z) * 0.55, [144, 158, 178], 0.72);
      band((Z) => c(Z) - w(Z) * 0.55, (Z) => c(Z) + w(Z) * 0.6, r.turn ? [188, 192, 197] : [172, 174, 176], 0.5);
      if (!r.turn) band((Z) => c(Z) - w(Z) * 0.1, (Z) => c(Z) + w(Z) * 0.2, [224, 231, 238], 0.8, (Z) => sm(4, 30, Z));
      band((Z) => c(Z) + w(Z) * 0.6, (Z) => c(Z) + w(Z), [230, 234, 238], 0.6);
    });
  }
  // протектор «ёлочкой» в колеях грузовика и грунтозацепы гусениц — только у камеры (шаг ≥ 3 px):
  // тёмная кромка вдавленного следа и едва заметная светлая
  function treads() {
    x.lineCap = 'butt';
    const rr = Tex.rng(6407);
    RUTS.forEach(function (r) {
      if (r.turn) return;   // у гусениц грунтозацепы не рисуем: ряд поперечин читается как шпалы
      const zEnd = 8.2, step = 0.2;
      for (let Z = 2.9; Z < zEnd; Z += step * (0.92 + 0.16 * rr())) {
        const keep = rutN(Z * 0.9 + r.s * 5, 3.3) + 0.2;
        if (keep < 0.12 || rr() < 0.35) { Z += step * rr() * 2; continue; }   // рваный шаг: протектор виден клочьями
        const xc = rutX(r, Z), w = rutW(r, Z) * (r.turn ? 0.85 : 0.5) * (0.8 + 0.3 * rr()), lwd = lw(0.02, Z, 1.2), a = Math.min(1, keep * 2.2) * sm(zEnd, zEnd - 2.5, Z);
        const dk = css(fog([112, 106, 98], Z), (r.turn ? 0.2 : 0.3) * a), lt = css(fog([176, 170, 162], Z), (r.turn ? 0.1 : 0.14) * a);
        if (r.turn) {
          line3([xc - w, 0, Z], [xc + w, 0, Z], lwd, dk); line3([xc - w, 0, Z + 0.035], [xc + w, 0, Z + 0.035], lwd, lt);
          continue;
        }
        [[0, dk], [0.035, lt]].forEach(function (s) {
          const p0 = P(xc - w, 0, Z + 0.09 + s[0]), p1 = P(xc, 0, Z + s[0]), p2 = P(xc + w, 0, Z + 0.09 + s[0]);
          x.beginPath(); x.moveTo(p0[0], p0[1]); x.lineTo(p1[0], p1[1]); x.lineTo(p2[0], p2[1]);
          x.lineWidth = lwd; x.strokeStyle = s[1]; x.stroke();
        });
      }
    });
  }
  // позёмка: светлые языки рыхлого снега наискось через дорогу (ветер слева), местами прячут колеи
  function drifting() {
    const rr = Tex.rng(6431);
    for (let k = 0; k < 10; k++) {
      const Zc = 3.4 + Math.pow(rr(), 1.4) * 36, wz = (0.3 + 0.55 * rr()) * (1 + Zc / 14), x0 = -ROADW - 0.3, x1 = lerp(-0.5, ROADW + 0.3, rr());
      const ph = rr() * 6, pts = (sc) => {
        const up = [], dn = [];
        for (let i = 0; i <= 14; i++) {
          const t = i / 14, X = lerp(x0, x1, t), Z = Zc + (X - x0) * 0.32, h = wz * sc * (1 - t * 0.8) * (0.75 + 0.25 * Math.sin(t * 8 + ph));
          up.push([X, 0, Z + h]); dn.push([X, 0, Z - h * 0.6]);
        }
        return up.concat(dn.reverse());
      };
      [[1, 0.045], [0.78, 0.05], [0.56, 0.055], [0.36, 0.05]].forEach((s) => fill3(pts(s[0]), css(fog([238, 241, 245], Zc), s[1])));
    }
  }
  // песок и гравий — редкими вытянутыми гроздьями внутри колей (не равномерной сыпью)
  function grit() {
    const rr = Tex.rng(6411);
    x.lineCap = 'round';
    [0, 1, 2, 3].forEach(function (i) {
      const r = RUTS[i];
      for (let k = 0; k < 5; k++) {
        const zc = 3.3 + Math.pow(rr(), 1.5) * 15, m = 4 + Math.floor(rr() * 8), warm = rr() < 0.65;
        for (let j = 0; j < m; j++) {
          const Z = zc + (rr() - 0.5) * 0.45 * (1 + zc / 6), X = rutX(r, Z) + (rr() - 0.5) * rutW(r, Z) * 0.8, len = (0.04 + 0.14 * rr()) * (1 + zc / 12);
          line3([X, 0, Z], [X + (rr() - 0.5) * 0.02, 0, Z + len], lw(0.008 + 0.008 * rr(), Z, 1), css(fog(warm ? [118, 106, 92] : [94, 96, 100], Z), 0.25 + 0.3 * rr()));
        }
      }
    });
  }
  // гладкие ледяные проплешины, вытянутые вдоль колей: отражают небо — у камеры чуть темнее, дальний край светлее
  const ICE = [[-1.5, 5.9, 0.42, 1.5, 1], [1.28, 12.6, 0.36, 2.8, 2], [-0.85, 27, 0.65, 5.2, 3]];
  function icePatches() {
    ICE.forEach(function (p) {
      const shape = (sc) => {
        const pts = [];
        for (let i = 0; i < 32; i++) {
          const a = i / 32 * Math.PI * 2, k = sc * (1 + 0.2 * rutN(Math.cos(a) * 1.6 + p[4] * 7, Math.sin(a) * 1.6 + 3));
          pts.push(P(p[0] + Math.cos(a) * p[2] * k, 0, p[1] + Math.sin(a) * p[3] * k));
        }
        return pts;
      };
      const yN = gy(p[1] - p[3] * 1.3), yF = gy(p[1] + p[3] * 1.3), g = x.createLinearGradient(0, yN, 0, yF);
      g.addColorStop(0, css(fog([176, 184, 194], p[1]), 0.4)); g.addColorStop(0.5, css(fog([196, 203, 212], p[1]), 0.42)); g.addColorStop(1, css(fog([214, 220, 227], p[1]), 0.45));
      // мягкий край: внешняя кайма слабее, ядро плотнее — лёд тонкий, по краям припорошен
      poly2(shape(1.14)); x.fillStyle = css(fog([200, 207, 216], p[1]), 0.14); x.fill();
      poly2(shape(1)); x.fillStyle = g; x.fill();
      poly2(shape(0.6)); x.fillStyle = css(fog([170, 180, 192], p[1]), 0.22); x.fill();
      // один мягкий отблеск светлого неба у дальнего края (эллипс в перспективе, без полос и прямоугольников)
      x.save(); poly2(shape(1)); x.clip();
      const hc = P(p[0] + p[2] * 0.1, 0, p[1] + p[3] * 0.45), rx = Math.max(4, F * p[2] * 0.9 / p[1]), ry = Math.max(2, gy(p[1]) - gy(p[1] + p[3] * 0.5));
      x.translate(hc[0], hc[1]); x.scale(1, ry / rx);
      const hg = x.createRadialGradient(0, 0, 0, 0, 0, rx);
      hg.addColorStop(0, 'rgba(240,243,246,0.32)'); hg.addColorStop(1, 'rgba(240,243,246,0)');
      x.fillStyle = hg; x.fillRect(-rx, -rx, rx * 2, rx * 2);
      x.restore();
    });
  }
  // люк колодца теплосети у тропы к лаборатории: вокруг вытаял мокрый тёмный круг — мера масштаба
  function manhole() {
    const X0 = -3.05, Z0 = 8.45;
    const ring = (r, k) => { const pts = []; for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2, q = r * (1 + k * rutN(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 9)); pts.push(P(X0 + Math.cos(a) * q, 0, Z0 + Math.sin(a) * q)); } return pts; };
    poly2(ring(0.9, 0.28)); x.fillStyle = css(fog([176, 180, 184], Z0), 0.85); x.fill();
    poly2(ring(0.66, 0.22)); x.fillStyle = css(fog([108, 110, 112], Z0)); x.fill();
    poly2(ring(0.37, 0)); x.fillStyle = css(fog([58, 60, 64], Z0)); x.fill();
    poly2(ring(0.32, 0)); x.fillStyle = css(fog([86, 88, 92], Z0)); x.fill();
    x.strokeStyle = css(fog([60, 62, 66], Z0), 0.8); x.lineWidth = 1.2;
    poly2(ring(0.17, 0)); x.stroke();
    for (let k = -2; k <= 2; k++) line3([X0 - 0.27, 0, Z0 + k * 0.1], [X0 + 0.27, 0, Z0 + k * 0.1], 1, css(fog([66, 68, 72], Z0), 0.6));
    // блик мокрого металла на дальней кромке крышки
    const a = P(X0 - 0.2, 0, Z0 + 0.27), b = P(X0 + 0.2, 0, Z0 + 0.27);
    x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineWidth = 1.5; x.strokeStyle = css(fog([170, 176, 184], Z0), 0.7); x.stroke();
  }
  // протоптанная тропа от дороги к лестнице: чуть ниже и серее поля, светлая дальняя кромка, лунки следов
  function footpath(pts, wd, seed) {
    const rr = Tex.rng(seed), L = [], Q = [], zm = pts[0][1];
    pts.forEach((p) => { const j = 0.08 * (rr() - 0.5); L.push(P(p[0], 0, p[1] - wd / 2 + j)); Q.push(P(p[0], 0, p[1] + wd / 2 + j)); });
    poly2(L.concat(Q.slice().reverse())); x.fillStyle = css(fog([192, 198, 205], zm)); x.fill();
    x.lineJoin = 'round';
    x.beginPath(); Q.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.strokeStyle = css(fog([238, 241, 244], zm), 0.9); x.lineWidth = 2.2; x.stroke();
    x.beginPath(); L.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.strokeStyle = css(fog([146, 160, 182], zm), 0.65); x.lineWidth = 1.6; x.stroke();
    // следы вразбежку вдоль оси тропы
    // следы: левый/правый вразбежку, шаг ±25 %, разный размер и поворот; вмятина голубовато-серая,
    // дальний край вмятины освещён; часть следов затоптана/заметена
    let side = 1;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0.1 + rr() * 0.1; s < len; s += 0.34 * (0.75 + 0.5 * rr())) {
        side = -side;
        if (rr() < 0.2) continue;
        const t = s / len, X = lerp(a[0], b[0], t) + (rr() - 0.5) * 0.06, Z = lerp(a[1], b[1], t) + side * (0.1 + 0.05 * rr());
        const lx = 0.06 + 0.035 * rr(), lz = 0.035 + 0.02 * rr(), rot = (rr() - 0.5) * 0.8, dent = [], rim = [];
        for (let k = 0; k < 7; k++) {
          const an = k / 7 * Math.PI * 2, u = Math.cos(an) * lx * (0.85 + 0.3 * rr()), v = Math.sin(an) * lz * (0.85 + 0.3 * rr());
          const du = u * Math.cos(rot) - v * Math.sin(rot), dv = u * Math.sin(rot) + v * Math.cos(rot);
          dent.push(P(X + du, 0, Z + dv)); rim.push(P(X + du * 1.05, 0, Z + dv * 1.05 + 0.018));
        }
        poly2(rim); x.fillStyle = css(fog([236, 239, 242], zm), 0.5); x.fill();
        poly2(dent); x.fillStyle = css(fog([146, 156, 172], zm), 0.4 + 0.25 * rr()); x.fill();
      }
    }
  }
  // комья наката и льда (с гусениц и отвала): 18 штук гроздьями у отвалов и на бортиках колей
  function roadDetail() {
    const rr = Tex.rng(6401);
    [[-3.5, 4.4, 4], [-3.35, 11.8, 3], [3.45, 5.0, 4], [3.3, 9.9, 3], [RUTS[1].x + 0.32, 6.6, 2], [RUTS[2].x - 0.3, 9.4, 2]].forEach(function (s) {
      for (let k = 0; k < s[2]; k++) lump(s[0] + (rr() - 0.5) * 0.5, s[1] + (rr() - 0.5) * 1.6, 0.05 + 0.07 * rr(), rr, rr() < 0.4);
    });
  }
  // неправильный вытянутый ком: контактная тень, голубовато-серый бок, светлая верхняя грань
  function lump(X, Z, s, rr, dirty) {
    // 5–7 угловатых точек, разный масштаб, часть утоплена в накат (низкий верх); цвет — грязно-серый
    // слежавшийся снег с песком/бурым, без отдельной белой «крышки»
    s *= 0.6 + 0.8 * rr();
    const np = 5 + Math.floor(rr() * 3), len = s * (1.1 + 0.8 * rr()), ang = rr() * Math.PI, hh = s * (rr() < 0.4 ? 0.25 : 0.5 + 0.3 * rr()), foot = [], tp = [];
    for (let i = 0; i < np; i++) {
      const a = (i + rr() * 0.7) / np * Math.PI * 2, r = 0.6 + 0.6 * rr(), u = Math.cos(a) * len * r, v = Math.sin(a) * s * r;
      const fx = X + u * Math.cos(ang) - v * Math.sin(ang), fz = Z + u * Math.sin(ang) + v * Math.cos(ang), k = 0.3 + 0.4 * rr();
      foot.push([fx, fz]); tp.push([X + (fx - X) * k - hh * 0.15, hh * (0.6 + 0.5 * rr()), Z + (fz - Z) * k]);
    }
    poly2(foot.map((q) => P(q[0] + hh * 1.1, 0, q[1] + hh * 0.5))); x.fillStyle = css(fog([110, 118, 132], Z), 0.2); x.fill();
    const base = foot.map((q) => P(q[0], 0, q[1])), top = tp.map((q) => P(q[0], q[1], q[2]));
    const yT = P(X, hh, Z)[1], yB = P(X, 0, Z - s)[1], g = x.createLinearGradient(0, yT, 0, yB);
    const tint = dirty ? mix([176, 170, 160], [146, 132, 116], rr()) : mix([196, 200, 205], [180, 182, 184], rr());
    g.addColorStop(0, css(fog(mul(tint, 1.08), Z))); g.addColorStop(1, css(fog(mul(tint, 0.82), Z)));
    poly2(hull(base.concat(top))); x.fillStyle = g; x.fill();
    poly2(hull(top)); x.fillStyle = css(fog(mul(tint, 1.12), Z), 0.6); x.fill();
  }

  // ---------- Мелочь на переднем плане: ливнёвка, оброненная доска, полузанесённая покрышка ----------
  function fgProps() {
    // решётка ливнёвки у правой обочины: вытаявший мокрый ореол, рама, прорези
    const gX = 3.0, gZ = 6.3, gq = (x0, x1, z0, z1) => [P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)];
    poly2(gq(gX - 0.42, gX + 0.42, gZ - 0.32, gZ + 0.36)); x.fillStyle = css(fog([150, 152, 154], gZ), 0.45); x.fill();
    poly2(gq(gX - 0.3, gX + 0.3, gZ - 0.2, gZ + 0.2)); x.fillStyle = css(fog([70, 72, 76], gZ)); x.fill();
    poly2(gq(gX - 0.26, gX + 0.26, gZ - 0.17, gZ + 0.17)); x.fillStyle = css(fog([40, 42, 46], gZ)); x.fill();
    for (let k = 0; k < 6; k++) { const zz = gZ - 0.15 + k * 0.06; poly2(gq(gX - 0.25, gX + 0.25, zz, zz + 0.022)); x.fillStyle = css(fog([96, 98, 100], gZ)); x.fill(); }
    poly2(gq(gX - 0.3, gX + 0.3, gZ + 0.17, gZ + 0.2)); x.fillStyle = css(fog([214, 218, 222], gZ), 0.8); x.fill();
    // доска, оброненная с саней: верхняя грань, торец, снег на одном конце, тень
    const pl = (X, Z, len, ang, w) => [[0, -w], [len, -w], [len, w], [0, w]].map((q) => [X + q[0] * Math.cos(ang) - q[1] * Math.sin(ang), Z + q[0] * Math.sin(ang) + q[1] * Math.cos(ang)]);
    const pX = -2.75, pZ = 5.2, ang = -0.35, th = 0.04;
    poly2(pl(pX + 0.05, pZ + 0.03, 1.5, ang, 0.13).map((q) => P(q[0], 0, q[1]))); x.fillStyle = css(fog([120, 130, 148], pZ), 0.3); x.fill();
    const top = pl(pX, pZ, 1.5, ang, 0.1);
    poly2([P(top[0][0], 0, top[0][1]), P(top[1][0], 0, top[1][1]), P(top[1][0], th, top[1][1]), P(top[0][0], th, top[0][1])]); x.fillStyle = css(fog([92, 76, 60], pZ)); x.fill();
    poly2(top.map((q) => P(q[0], th, q[1]))); x.fillStyle = css(fog([118, 104, 88], pZ)); x.fill();
    x.strokeStyle = css(fog([104, 86, 68], pZ), 0.7); x.lineWidth = 1;
    const m0 = P(lerp(top[0][0], top[3][0], 0.5), th, lerp(top[0][1], top[3][1], 0.5)), m1 = P(lerp(top[1][0], top[2][0], 0.5), th, lerp(top[1][1], top[2][1], 0.5));
    x.beginPath(); x.moveTo(m0[0], m0[1]); x.lineTo(m1[0], m1[1]); x.stroke();
    { const c = pl(pX + 1.05 * Math.cos(ang), pZ + 1.05 * Math.sin(ang), 0.45, ang, 0.12), q = [c[0], [lerp(c[0][0], c[1][0], 0.6), lerp(c[0][1], c[1][1], 0.6) - 0.03], c[1], [lerp(c[1][0], c[2][0], 0.5) + 0.02, lerp(c[1][1], c[2][1], 0.5)], c[2], [lerp(c[3][0], c[2][0], 0.3), lerp(c[3][1], c[2][1], 0.3) + 0.03], c[3]]; poly2(q.map((p) => P(p[0], th + 0.01, p[1]))); x.fillStyle = css(fog([222, 226, 231], pZ), 0.6); x.fill(); }
    // покрышка, лежащая плашмя у подошвы правого отвала: чёрный бок, верх с протектором, снег в середине и шапкой на дальней половине
    const tX = 3.45, tZ = 10.6, tr = 0.38, ell = (r, y, a0, a1) => { const p = []; for (let i = 0; i <= 20; i++) { const a = a0 + (a1 - a0) * i / 20; p.push(P(tX + Math.cos(a) * r, y, tZ + Math.sin(a) * r)); } return p; };
    poly2(ell(tr * 1.15, 0, 0, Math.PI * 2).map((q) => [q[0] + 3, q[1] + 1])); x.fillStyle = css(fog([110, 120, 138], tZ), 0.25); x.fill();
    poly2(ell(tr, 0, Math.PI, Math.PI * 2).concat(ell(tr, 0.18, Math.PI, Math.PI * 2).reverse())); x.fillStyle = css(fog([46, 47, 49], tZ)); x.fill();
    poly2(ell(tr, 0.18, 0, Math.PI * 2)); x.fillStyle = css(fog([66, 67, 69], tZ)); x.fill();
    poly2(ell(tr * 0.6, 0.18, 0, Math.PI * 2)); x.fillStyle = css(fog([36, 37, 39], tZ)); x.fill();
    poly2(ell(tr * 0.56, 0.1, 0, Math.PI * 2)); x.fillStyle = css(fog([200, 207, 216], tZ)); x.fill();
  }

  // ---------- Вертикальные цилиндры: бочки, баки ----------
  // проекция горизонтальной окружности (16 точек)
  function ring(X, Y, Z, r, a0, a1, nSeg) {
    const pts = [];
    for (let i = 0; i <= nSeg; i++) { const a = a0 + (a1 - a0) * i / nSeg; pts.push(P(X + Math.cos(a) * r, Y, Z - Math.sin(a) * r)); }
    return pts;
  }
  // тело цилиндра: от передней дуги низа до передней дуги верха; светотень поперёк (свет слева)
  function cylBody(X, Z, r, y0, y1, c, zf) {
    const bot = ring(X, y0, Z, r, 0, Math.PI, 14), top = ring(X, y1, Z, r, Math.PI, 0, 14);
    poly2(bot.concat(top));
    const l = P(X - r, 0, Z)[0], rgt = P(X + r, 0, Z)[0], g = x.createLinearGradient(l, 0, rgt, 0);
    g.addColorStop(0, css(fog(mul(c, 0.92), zf))); g.addColorStop(0.28, css(fog(mul(c, 1.08), zf)));
    g.addColorStop(0.75, css(fog(mul(c, 0.72), zf))); g.addColorStop(1, css(fog(mul(c, 0.62), zf)));
    x.fillStyle = g; x.fill();
  }
  // Бочка стоя: 200 л (r 0,29, h 0,88) или 100 л (r 0,23, h 0,66); ржавое кольцо у дна, обручи, вмятина,
  // потёк от кромки; снежная шапка неровная или голая крышка; y0 — высота опоры (поддон)
  function barrel(X, Z, c, small, snow, rr, y0) {
    const r = small ? 0.23 : 0.29, h = small ? 0.66 : 0.88, b = y0 || 0, t = b + h;
    cylBody(X, Z, r, b, t, c, Z);
    const arc = (yy, a0, a1) => { const a = ring(X, yy, Z, r, a0, a1, 12); x.beginPath(); a.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); };
    poly2(ring(X, b, Z, r, 0, Math.PI, 12).concat(ring(X, b + 0.11, Z, r, Math.PI, 0, 12)));
    x.fillStyle = css(fog([104, 66, 42], Z), 0.45); x.fill();
    x.strokeStyle = css(fog(mul(c, 0.55), Z), 0.85); x.lineWidth = Math.max(1, F * 0.016 / Z);
    [0.33, 0.66].forEach((k) => { arc(b + h * k, Math.PI, 0); x.stroke(); });
    // вмятина на освещённой стороне и ржавый потёк от верхней кромки
    const da = Math.PI * (0.55 + 0.3 * rr()), dc = P(X + Math.cos(da) * r * 0.95, b + h * (0.4 + 0.35 * rr()), Z - Math.sin(da) * r), dr = F * 0.06 / Z;
    x.beginPath(); x.ellipse(dc[0], dc[1], dr * 0.7, dr, 0.3, 0, Math.PI * 2); x.fillStyle = css(fog(mul(c, 0.7), Z), 0.6); x.fill();
    const sa = Math.PI * (0.3 + 0.4 * rr()), s0 = P(X + Math.cos(sa) * r, t - 0.02, Z - Math.sin(sa) * r), s1 = P(X + Math.cos(sa) * r, t - 0.25 - 0.3 * rr(), Z - Math.sin(sa) * r);
    const g = x.createLinearGradient(0, s0[1], 0, s1[1]); g.addColorStop(0, 'rgba(112,64,38,.5)'); g.addColorStop(1, 'rgba(112,64,38,0)');
    x.fillStyle = g; x.fillRect(s0[0] - 1.2, s0[1], Math.max(2.4, F * 0.04 / Z), s1[1] - s0[1]);
    poly2(ring(X, t, Z, r, 0, Math.PI * 2, 18)); x.fillStyle = css(fog(mul(c, 0.78), Z)); x.fill();
    if (snow) {
      const pts = [], ph = rr() * 6;
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, q = r * (0.9 + 0.1 * Math.sin(a * 2 + ph)); pts.push(P(X + Math.cos(a) * q, t + 0.03 + 0.05 * Math.max(0, Math.sin(a + ph)), Z - Math.sin(a) * q)); }
      poly2(pts); x.fillStyle = css(fog([230, 234, 239], Z)); x.fill();
    } else { arc(t, 0, Math.PI * 2); x.strokeStyle = css(fog(mul(c, 0.55), Z), 0.8); x.stroke(); }
  }
  // Бочка лёжа, ось к камере: видна круглая крышка с обечайкой и пробкой, сверху полоска снега
  function barrelLying(X, Z, c) {
    const r = 0.29, L = 0.88, cap = (z) => { const p = []; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; p.push(P(X + Math.cos(a) * r, r + Math.sin(a) * r, z)); } return p; };
    const near = cap(Z), far = cap(Z + L);
    poly2(hull(near.concat(far)));
    const l = P(X - r, 0, Z)[0], rt = P(X + r, 0, Z)[0], g = x.createLinearGradient(l, 0, rt, 0);
    g.addColorStop(0, css(fog(mul(c, 1.05), Z))); g.addColorStop(0.6, css(fog(mul(c, 0.82), Z))); g.addColorStop(1, css(fog(mul(c, 0.6), Z)));
    x.fillStyle = g; x.fill();
    poly2(near); x.fillStyle = css(fog(mul(c, 0.86), Z)); x.fill();
    x.lineWidth = Math.max(1, F * 0.022 / Z); x.strokeStyle = css(fog(mul(c, 0.55), Z)); x.stroke();
    const bp = P(X + r * 0.45, r * 1.45, Z - 0.01), br = Math.max(1, F * 0.03 / Z);
    x.beginPath(); x.arc(bp[0], bp[1], br, 0, Math.PI * 2); x.fillStyle = css(fog([52, 54, 58], Z)); x.fill();
    fill3([[X - r * 0.5, r * 2 - 0.01, Z + 0.04], [X + r * 0.4, r * 2 - 0.01, Z + 0.04], [X + r * 0.3, r * 2 + 0.05, Z + L - 0.05], [X - r * 0.45, r * 2 + 0.06, Z + L - 0.05]], css(fog([230, 234, 239], Z)));
  }
  // вертикальный стальной бак: кольцевые швы, лестница, снег на кромке, потёки
  function tankV(X, Z, r, h, c, label) {
    cylBody(X, Z, r, 0, h, c, Z);
    x.strokeStyle = css(fog(mul(c, 0.7), Z), 0.7); x.lineWidth = 1.1;
    for (let yy = 1.4; yy < h; yy += 1.4) { const a = ring(X, yy, Z, r, Math.PI * 0.95, Math.PI * 0.05, 16); x.beginPath(); a.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke(); }
    // ржавые потёки от верхней кромки
    const rr = Tex.rng(Math.round(X * 100 + Z));
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.15 + 0.7 * rr()), px = X + Math.cos(a) * r, pz = Z - Math.sin(a) * r, len = 0.8 + rr() * 2.2;
      const p0 = P(px, h - 0.1, pz), p1 = P(px, h - len, pz), g = x.createLinearGradient(0, p0[1], 0, p1[1]);
      g.addColorStop(0, 'rgba(110,64,40,.35)'); g.addColorStop(1, 'rgba(110,64,40,0)');
      x.fillStyle = g; x.fillRect(p0[0] - 1.2, p0[1], 2.4, p1[1] - p0[1]);
    }
    // название — на плоском привинченном щите (не «наклейкой» по цилиндру)
    if (label) {
      const lx0 = X + r * 0.12 - 0.85, lx1 = X + r * 0.12 + 0.85, ly = h * 0.62, pz = Z - r * 1.02;
      fill3([[lx0, ly - 0.36, pz], [lx1, ly - 0.36, pz], [lx1, ly + 0.36, pz], [lx0, ly + 0.36, pz]], css(lit([206, 204, 196], 'F', Z)));
      fill3([[lx0, ly - 0.36, pz], [lx1, ly - 0.36, pz], [lx1, ly - 0.3, pz], [lx0, ly - 0.3, pz]], css(lit([120, 116, 108], 'F', Z), 0.7));
      textF(label, X + r * 0.12, ly, pz - 0.01, 0.4, css(fog([120, 62, 52], Z)));
    }
    // вертикальная лестница с дугами ограждения у левого края
    const lx = X - r * 0.62, lz = Z - r * 0.78, lc = css(fog([64, 68, 72], Z));
    line3([lx - 0.22, 0.3, lz], [lx - 0.22, h + 1.0, lz], 1.3, lc); line3([lx + 0.22, 0.3, lz], [lx + 0.22, h + 1.0, lz], 1.3, lc);
    for (let yy = 0.6; yy < h; yy += 0.3) line3([lx - 0.22, yy, lz], [lx + 0.22, yy, lz], 1, lc);
    for (let yy = 2.4; yy < h + 1; yy += 0.9) { const a = P(lx, yy, lz - 0.35), rw = F * 0.38 / lz; x.beginPath(); x.ellipse(a[0], a[1], rw, rw * 0.18, 0, 0, Math.PI); x.strokeStyle = lc; x.lineWidth = 1; x.stroke(); }
    // перила по верху и снег на кромке крыши
    // поручень на 6 стойках, концы опущены на кромку крыши (не висит в воздухе)
    const tr = ring(X, h + 0.85, Z, r * 0.96, Math.PI * 0.92, Math.PI * 0.08, 16), sb = ring(X, h + 0.08, Z, r * 0.96, Math.PI * 0.92, Math.PI * 0.08, 5), st = ring(X, h + 0.85, Z, r * 0.96, Math.PI * 0.92, Math.PI * 0.08, 5);
    x.beginPath(); x.moveTo(sb[0][0], sb[0][1]); tr.forEach((p) => x.lineTo(p[0], p[1])); x.lineTo(sb[5][0], sb[5][1]); x.strokeStyle = lc; x.lineWidth = 1.2; x.stroke();
    sb.forEach((p, i) => { x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(st[i][0], st[i][1]); x.lineWidth = 1.1; x.stroke(); });
    const t0 = ring(X, h, Z, r * 1.01, Math.PI, 0, 18), t1 = ring(X, h + 0.16, Z, r * 0.97, 0, Math.PI, 18);
    poly2(t0.concat(t1)); x.fillStyle = css(fog([228, 232, 236], Z)); x.fill();
  }

  // ---------- Склад ГСМ слева: два бака, будка насосной, сетчатый забор, бочки, фонарный столб ----------
  const TANKS = [[-9.4, 33.5, 2.1, 5.4, [170, 172, 168], 'ГСМ-2'], [-8.7, 26.5, 2.1, 5.4, [184, 186, 182], 'ГСМ-1']];
  // Бочки группами по 3–5 с промежутками; цвета — только три: ржаво-синий, выцветший оливковый, голый серый.
  // [X, Z, цвет, вид]: u — стоит 200 л, s — стоит 100 л, l — лежит, h — по пояс в сугробе. Перед сеткой —
  // в проезде между отвалами (Z 20,5…25,5), за сеткой — ещё группа и штабель на поддонах в два яруса.
  const BCOL = { b: [80, 96, 116], o: [102, 106, 80], g: [124, 126, 126] };
  const BARRELS = [
    [-6.95, 22.5, 'o', 'u'], [-6.3, 22.75, 'g', 'u'], [-6.45, 21.6, 'b', 'l'],
    [-5.0, 24.05, 'g', 'h'], [-4.62, 24.15, 'b', 'u'], [-5.05, 23.35, 'o', 'u'], [-4.52, 23.45, 'b', 's'],
    [-4.78, 22.25, 'g', 'l'],
    [-5.1, 21.05, 'b', 'u'], [-4.55, 21.1, 'o', 'u'], [-4.86, 21.7, 'g', 's']
  ].sort((a, b) => b[1] - a[1]);
  const PAL = [-7.95, -6.75, 23.35, 24.15];   // поддоны: X0, X1, Z0, Z1
  SHADOW_EXTRA.push(function (boxS, postS) {
    TANKS.forEach((t) => boxS(t[0] - t[2] * 0.8, t[0] + t[2] * 0.8, 0, t[3] + 0.2, t[1] - t[2] * 0.8, t[1] + t[2] * 0.8));
    BARRELS.forEach((b) => (b[3] === 'l' ? boxS(b[0] - 0.28, b[0] + 0.28, 0, 0.58, b[1], b[1] + 0.88) : boxS(b[0] - 0.25, b[0] + 0.25, 0, b[3] === 's' ? 0.66 : 0.88, b[1] - 0.25, b[1] + 0.25)));
    boxS(PAL[0], PAL[1], 0, 1.62, PAL[2], PAL[3]);
    postS(-4.4, 19.5, 0.08, 7.2);
    boxS(-12.8, -10.6, 0, 2.7, 21.5, 24.0);
  });
  AO_EXTRA.push(function (foot, disc) {
    TANKS.forEach((t) => disc(t[0], t[1], t[2] + 0.4));
    BARRELS.forEach((b) => (b[3] === 'l' ? foot(b[0] - 0.3, b[0] + 0.3, b[1], b[1] + 0.9) : disc(b[0], b[1], 0.38)));
    foot(PAL[0] - 0.1, PAL[1] + 0.1, PAL[2] - 0.1, PAL[3] + 0.1);
    disc(-4.4, 19.5, 0.3);
    foot(-13.1, -10.3, 21.2, 24.3);
  });
  // поддон 1,2 × 0,8 м: доски с тёмными щелями, снег на кромке
  function pallet(y0, Z) {
    const [x0, x1, , z1] = PAL;
    box(x0, x1, y0, y0 + 0.14, Z, z1, { F: [128, 108, 82], S: [112, 94, 72], T: [150, 128, 98] });
    for (let k = 1; k < 3; k++) { const X = lerp(x0, x1, k / 3); fill3([[X - 0.09, y0 + 0.02, Z - 0.005], [X + 0.09, y0 + 0.02, Z - 0.005], [X + 0.09, y0 + 0.11, Z - 0.005], [X - 0.09, y0 + 0.11, Z - 0.005]], css(fog([58, 50, 42], Z))); }
  }
  function drawBarrel(b, rr) {
    if (b[3] === 'l') { barrelLying(b[0], b[1], BCOL[b[2]]); return; }
    barrel(b[0], b[1], BCOL[b[2]], b[3] === 's', rr() < 0.75, rr);
    if (b[3] === 'h') {
      // наметённый холмик закрывает низ бочки
      const pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12, X = b[0] - 0.55 + 1.1 * t; pts.push([X, 0.42 * Math.sin(t * Math.PI) * (0.85 + 0.3 * rr()), b[1] - 0.32]); }
      pts.push([b[0] + 0.7, 0, b[1] - 0.6], [b[0] - 0.7, 0, b[1] - 0.6]);
      fill3(pts, css(fog([224, 229, 235], b[1])));
    }
  }
  function tankFarm() {
    const rr = Tex.rng(6502);
    // будка насосной за баками, баки, трубопровод
    box(-12.8, -10.6, 0, 2.5, 21.5, 24.0, { F: [150, 140, 120], S: [150, 140, 120], T: [226, 230, 234] });
    fill3([[-12.0, 0, 21.49], [-11.2, 0, 21.49], [-11.2, 1.9, 21.49], [-12.0, 1.9, 21.49]], css(lit([84, 80, 74], 'F', 21.5)));
    box(-12.95, -10.45, 2.5, 2.75, 21.35, 24.15, { F: [226, 230, 236], S: [214, 222, 230], T: [234, 238, 242] });
    TANKS.forEach((t) => tankV(t[0], t[1], t[2], t[3], t[4], t[5]));
    line3([-7.2, 0.7, 25.2], [-5.6, 0.7, 25.2], lw(0.12, 25, 2), css(lit([60, 64, 68], 'F', 25)));
    driftF(-10.8, -6.6, 24.6, 0.55, 6503);
    // штабель: поддон, две бочки по 100 л, второй поддон, ещё две
    pallet(0, PAL[2]);
    [[-7.62, 23.75], [-7.08, 23.75]].forEach((p) => barrel(p[0], p[1], BCOL.b, true, false, rr, 0.14));
    pallet(0.8, PAL[2]);
    [[-7.6, 23.75], [-7.1, 23.75]].forEach((p, i) => barrel(p[0], p[1], i ? BCOL.g : BCOL.o, true, true, rr, 0.94));
    BARRELS.filter((b) => b[0] < -5.6).forEach((b) => drawBarrel(b, rr));
    fence(-5.5, 19.4, 42);
    BARRELS.filter((b) => b[0] >= -5.6).forEach((b) => drawBarrel(b, rr));
  }
  // сетчатый забор вдоль дороги: полупрозрачная сетка, столбы со снежными шапками, верхняя труба, снег у низа
  function fence(X, z0, z1) {
    const top = 1.9;
    // сетка-рабица издали — лёгкая серая вуаль (ячейка 5 см не видна), гуще у столбов и внизу (налипший снег)
    x.globalAlpha = 0.2;
    fill3([[X, 0, z0], [X, top, z0], [X, top, z1], [X, 0, z1]], sideFill([64, 70, 78], 0.75, X, z0, z1));
    x.globalAlpha = 0.28;
    fill3([[X, 0, z0], [X, 0.75, z0], [X, 0.75, z1], [X, 0, z1]], css(fog([214, 220, 226], 25)));
    x.globalAlpha = 1;
    // провисшая сетка: нижняя проволока между столбами
    for (let z = z0; z < z1 - 0.1; z += 2.5) {
      const zb = Math.min(z1, z + 2.5);
      wire([X, 0.62, z], [X, 0.62, zb], 0.06, 0.008, css(lit([70, 76, 82], 'L', z), 0.6));
    }
    // нижний сугроб, наметённый на сетку
    driftSide(X, z0, z1, 0.55, 0.35, 0.8, 6504, [214, 222, 230]);
    for (let z = z0; z <= z1; z += 2.5) {
      post(X, z, 0.035, 0, top + 0.08, [72, 76, 80]);
      const c = P(X, top + 0.1, z), r = Math.max(1.2, F * 0.05 / z);
      x.fillStyle = css(fog([232, 236, 240], z)); x.fillRect(c[0] - r, c[1] - r * 0.7, 2 * r, r * 0.9);
    }
    line3([X, top, z0], [X, top, z1], lw(0.04, z0, 1.2), css(lit([80, 84, 90], 'L', 25)));
    line3([X, top + 0.03, z0], [X, top + 0.03, z1], 1, 'rgba(236,240,244,.7)');
    // табличка «ОГНЕОПАСНО» на сетке
    const pz = z0 + 0.6;
    fill3([[X + 0.02, 0.9, pz], [X + 0.02, 1.45, pz], [X + 0.02, 1.45, pz + 0.9], [X + 0.02, 0.9, pz + 0.9]], css(lit([222, 220, 212], 'L', pz)));
    fill3([[X + 0.03, 1.28, pz], [X + 0.03, 1.45, pz], [X + 0.03, 1.45, pz + 0.9], [X + 0.03, 1.28, pz + 0.9]], css(lit([164, 62, 50], 'L', pz)));
    textS('ОГНЕОПАСНО', X + 0.04, 1.08, pz + 0.06, pz + 0.84, 0.13, css(lit([150, 50, 40], 'L', pz)));
  }
  // фонарный столб у дороги: стальная опора, изогнутый кронштейн, светильник; днём свет слабый
  function lampPost(X, Z, dir) {
    post(X, Z, 0.08, -0.1, 6.9, [112, 118, 124]);
    const a = P(X, 6.9, Z), b = P(X + dir * 0.6, 7.25, Z), c = P(X + dir * 1.5, 7.3, Z);
    x.beginPath(); x.moveTo(a[0], a[1]); x.quadraticCurveTo(b[0], b[1], c[0], c[1]);
    x.lineWidth = lw(0.07, Z, 1.5); x.strokeStyle = css(fog([100, 106, 112], Z)); x.stroke();
    box(X + dir * 1.3 - 0.35, X + dir * 1.3 + 0.35, 7.12, 7.3, Z - 0.17, Z + 0.17, [92, 96, 102]);
    fill3([[X + dir * 1.3 - 0.3, 7.12, Z - 0.13], [X + dir * 1.3 + 0.3, 7.12, Z - 0.13], [X + dir * 1.3 + 0.3, 7.12, Z + 0.13], [X + dir * 1.3 - 0.3, 7.12, Z + 0.13]], 'rgb(255,232,196)');
    box(X + dir * 1.3 - 0.37, X + dir * 1.3 + 0.37, 7.3, 7.38, Z - 0.19, Z + 0.19, [230, 234, 238]);
    // пятно света на дороге: маленькое и слабое
    const g0 = P(X + dir * 1.3, 0, Z), rx = F * 2.6 / Z, ry = rx * EYE / Z * 0.9;
    const lg = x.createRadialGradient(g0[0], g0[1], 1, g0[0], g0[1], rx);
    lg.addColorStop(0, 'rgba(255,220,170,.10)'); lg.addColorStop(1, 'rgba(255,220,170,0)');
    x.save(); x.translate(g0[0], g0[1]); x.scale(1, Math.max(0.05, ry / rx)); x.translate(-g0[0], -g0[1]);
    x.fillStyle = lg; x.beginPath(); x.arc(g0[0], g0[1], rx, 0, Math.PI * 2); x.fill(); x.restore();
  }

  // ---------- Арочный гараж «СКЛАД 3» справа (гофрированная полуарка, ось вдоль дороги) ----------
  const HG = { cx: 14.6, r: 6.1, z0: 27.5, z1: 47 };
  SHADOW_EXTRA.push((boxS) => boxS(HG.cx - HG.r, HG.cx + HG.r, 0, HG.r, HG.z0, HG.z1));
  function hangar() {
    const { cx, r, z0, z1 } = HG, metal = [150, 154, 158], snow = [226, 231, 236];
    const at = (th, Z) => P(cx + Math.cos(th) * r, Math.sin(th) * r, Z);
    // полосы оболочки от дальнего правого края к ближнему левому: видимые ложатся сверху
    const N = 24;
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N, am = (a0 + a1) / 2;
      const d = -SUN[0] * Math.cos(am) * -1 + SUN[1] * Math.sin(am);
      const k = 0.62 + 0.42 * Math.max(0, d) + 0.08 * Math.sin(am);
      const sn = Math.abs(am - Math.PI / 2) < 0.42 ? 1 : 0;
      const c = sn ? mul(snow, 0.9 + 0.1 * Math.sin(am)) : mul(metal, k);
      poly2([at(a0, z0), at(a1, z0), at(a1, z1), at(a0, z1)]);
      x.fillStyle = sideFill(c, 1, cx - r, z0, z1); x.fill();
    }
    // гофра: дуги поперёк оболочки, видимая левая четверть
    for (let Z = z0 + 0.6; Z < z1; Z += 0.65) {
      const c = P(cx, 0, Z), rr = F * r / Z;
      x.beginPath(); x.arc(c[0], c[1], rr, Math.PI, Math.PI * 1.5 - 0.44);
      x.strokeStyle = css(fog([96, 100, 106], Z), 0.45); x.lineWidth = Math.max(1, F * 0.05 / Z); x.stroke();
    }
    // торец: полукруг с вертикальной гофрой, ворота-рулонка, калитка, вывеска, фонарь
    const end = [];
    for (let i = 0; i <= 32; i++) end.push(at(Math.PI * i / 32, z0));
    poly2(end); x.fillStyle = css(lit([172, 174, 172], 'F', z0)); x.fill();
    x.save(); poly2(end); x.clip();
    x.strokeStyle = css(lit([130, 132, 132], 'F', z0), 0.6); x.lineWidth = 1;
    for (let X = cx - r + 0.25; X < cx + r; X += 0.25) { const a = P(X, 0, z0), b = P(X, r, z0); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
    x.restore();
    const dx0 = cx - 2.3, dx1 = cx + 2.7, dh = 4.0;
    fill3([[dx0 - 0.15, 0, z0], [dx1 + 0.15, 0, z0], [dx1 + 0.15, dh + 0.25, z0], [dx0 - 0.15, dh + 0.25, z0]], css(lit([92, 96, 100], 'F', z0)));
    fill3([[dx0, 0, z0 + 0.05], [dx1, 0, z0 + 0.05], [dx1, dh, z0 + 0.05], [dx0, dh, z0 + 0.05]], css(lit([128, 134, 138], 'F', z0)));
    x.strokeStyle = css(lit([84, 88, 92], 'F', z0), 0.7); x.lineWidth = 1;
    for (let yy = 0.2; yy < dh; yy += 0.18) { const a = P(dx0, yy, z0), b = P(dx1, yy, z0); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
    fill3([[dx0, 0, z0 + 0.05], [dx1, 0, z0 + 0.05], [dx1, 0.7, z0 + 0.05], [dx0, 0.7, z0 + 0.05]], 'rgba(60,54,48,.25)');
    fill3([[cx - 4.6, 0, z0], [cx - 3.7, 0, z0], [cx - 3.7, 2.05, z0], [cx - 4.6, 2.05, z0]], css(lit([96, 76, 64], 'F', z0)));
    // «СКЛАД 3» — трафарет на торце левее ворот, весь на виду (ворота частично за модулем ДЭС)
    textF('СКЛАД 3', cx - 3.8, 3.7, z0 - 0.02, 0.35, css(fog([60, 64, 72], z0), 0.88));
    fill3([[cx - 4.45, 3.8, z0 - 0.01], [cx - 2.05, 3.8, z0 - 0.01], [cx - 2.05, 3.84, z0 - 0.01], [cx - 4.45, 3.84, z0 - 0.01]], css(fog([60, 64, 72], z0), 0.6));
    box(cx + 0.1, cx + 0.5, dh + 1.4, dh + 1.55, z0 - 0.35, z0, [80, 84, 90]);
    // грязь и соль у земли на торце, потёки ржавчины и грязи от кромки арки
    fill3([[cx - r, 0, z0 - 0.01], [cx + r, 0, z0 - 0.01], [cx + r, 0.45, z0 - 0.01], [cx - r, 0.45, z0 - 0.01]], 'rgba(84,72,58,.2)');
    const hr = Tex.rng(6611);
    for (let k = 0; k < 10; k++) {
      const X = cx - r + 0.6 + (2 * r - 1.2) * hr(), tp = Math.sqrt(Math.max(0, r * r - (X - cx) * (X - cx))) - 0.12;
      const a = P(X, tp, z0 - 0.01), b = P(X, tp - 0.8 - 1.4 * hr(), z0 - 0.01), w = Math.max(3, F * 0.12 / z0);
      const g = x.createLinearGradient(0, a[1], 0, b[1]); g.addColorStop(0, 'rgba(92,74,60,.24)'); g.addColorStop(1, 'rgba(92,74,60,0)');
      x.fillStyle = g; x.fillRect(a[0] - w / 2, a[1], w, b[1] - a[1]);
    }
    // снег: сугроб у торца (в проезде ворот расчищено) и вдоль подошвы арки
    driftF(cx - r, dx0 - 0.4, z0, 0.9, 6601); driftF(dx1 + 0.4, cx + r, z0, 0.7, 6602);
    driftSide(cx - r + 0.05, z0 + 0.2, z1, 0.8, 0.6, 1.2, 6603, [214, 222, 230]);
  }

  // ---------- Гусеничный вездеход у обочины: видна корма и левый борт ----------
  // Кабина с наклонным лобовым стеклом впереди (дальше от нас), за ней — высокий кунг; ходовая: катки
  // с разной разметкой болтов, поддерживающие ролики, ленивец и ведущая звезда, траки ≥ 3 px; нижняя
  // треть в грязном снегу; на крыше кунга багажник и выключенный проблесковый маячок. Цвет — выцветший
  // оранжево-красный (насыщенность ≈ 0,35). След гусениц сворачивает к стоянке с дороги (см. RUTS).
  const VH = { x0: 4.75, x1: 7.15, z0: 24.4, z1: 29.8 };   // за первой опорой: столб не режет вездеход
  SHADOW_EXTRA.push((boxS) => boxS(VH.x0, VH.x1, 0.2, 2.95, VH.z0, VH.z1));
  AO_EXTRA.push((foot) => foot(VH.x0 - 0.3, VH.x1 + 0.25, VH.z0 - 0.25, VH.z1 + 0.2));
  function vehicle() {
    const { x0, x1, z0, z1 } = VH, body = [152, 114, 96], dark = [44, 46, 48], rr = Tex.rng(6801);
    const sx = x0 - 0.1, sd = (u, v) => [sx, v, u];   // плоскость левого борта гусеницы
    // правая гусеница: видна только корма
    box(x1 - 0.45, x1 + 0.1, 0.02, 0.92, z0 + 0.1, z1, { F: dark, S: dark, T: [70, 72, 74] });
    // корпус (лодка), кабина с наклонным стеклом, кунг
    box(x0 + 0.2, x1 - 0.2, 0.55, 1.32, z0 + 0.05, z1, { F: mul(body, 0.9), S: mul(body, 0.92), T: body });
    const cz0 = z1 - 1.95, cz1 = z1 - 0.1, cx = x0 + 0.18, cab = [[cz0, 1.32], [cz1, 1.32], [cz1, 1.72], [cz1 - 0.62, 2.36], [cz0, 2.36]];
    fill3(cab.map((q) => [cx, q[1], q[0]]), sideFill(body, 'Rt', cx, cz0, cz1));
    fill3([[cx - 0.01, 1.78, cz1 - 0.08], [cx - 0.01, 2.26, cz1 - 0.55], [cx - 0.01, 2.26, cz1 - 0.95], [cx - 0.01, 1.78, cz1 - 0.95]], css(fog([70, 82, 96], 22)));
    fill3([[cx - 0.01, 1.72, cz0 + 0.25], [cx - 0.01, 2.22, cz0 + 0.25], [cx - 0.01, 2.22, cz0 + 0.85], [cx - 0.01, 1.72, cz0 + 0.85]], css(fog([64, 76, 90], 22)));
    const kz0 = z0 + 0.1, kz1 = cz0 - 0.05, kc = mul(body, 1.03);
    box(x0 + 0.12, x1 - 0.12, 1.32, 2.78, kz0, kz1, { F: kc, S: kc, T: kc });
    const kd = (u, v) => [x0 + 0.11, v, u];
    [[kz0 + 0.5, kz0 + 1.2], [kz1 - 1.1, kz1 - 0.45]].forEach((w) => win(kd, w[0], w[1], 1.95, 2.42, { z: (w[0] + w[1]) / 2, f: 'Rt', fr: [74, 76, 78] }));
    line3(kd(kz0 + 1.7, 1.36), kd(kz0 + 1.7, 2.74), lw(0.02, 20, 1), css(lit(mul(body, 0.7), 'Rt', 20), 0.8));
    // грязный снег на нижней трети: брызги с гусениц на корпусе и на кунге снизу
    fill3([kd(kz0, 1.32), kd(kz0, 1.62), kd(kz1, 1.52), kd(kz1, 1.32)], 'rgba(96,84,70,.3)');
    fill3([[x0 + 0.19, 0.55, z0 + 0.06], [x0 + 0.19, 1.05, z0 + 0.06], [x0 + 0.19, 1.0, z1], [x0 + 0.19, 0.55, z1]], 'rgba(84,74,62,.35)');
    // левая гусеница: контактная тень, сплошная лента со скруглёнными концами, звезда спереди (у кабины),
    // ленивец сзади, 5 катков с тёмными ступицами внутри обвода, снег на верхней ветви
    const TS = (u, v) => P.apply(null, sd(u, v));
    fill3([[sx - 0.25, 0, z0 - 0.15], [sx + 0.55, 0, z0 - 0.15], [sx + 0.6, 0, z1 + 0.1], [sx - 0.2, 0, z1 + 0.1]], 'rgba(70,78,92,.32)');
    const loop = (ins) => {
      const R0 = 0.45 - ins, yc = 0.46, za = z0 + 0.5, zb = z1 - 0.5, pts = [];
      for (let k = 0; k <= 10; k++) { const a = Math.PI / 2 + k / 10 * Math.PI; pts.push(TS(za + Math.cos(a) * R0, yc + Math.sin(a) * R0)); }
      for (let k = 0; k <= 10; k++) { const a = -Math.PI / 2 + k / 10 * Math.PI; pts.push(TS(zb + Math.cos(a) * R0, yc + Math.sin(a) * R0)); }
      return pts;
    };
    poly2(loop(0)); x.fillStyle = css(lit([36, 38, 40], 'Rt', 21)); x.fill();
    poly2(loop(0.08)); x.fillStyle = css(lit([62, 64, 66], 'Rt', 21)); x.fill();
    const disc = (zc, yc, r, c, n, tooth) => {
      const p = [], m = n || 16;
      for (let k = 0; k < m; k++) { const a = k / m * Math.PI * 2, rr2 = tooth && (k & 1) ? r * 0.82 : r; p.push(sd(zc + Math.cos(a) * rr2, yc + Math.sin(a) * rr2)); }
      path3(p); x.fillStyle = css(lit(c, 'Rt', zc)); x.fill();
    };
    // звезда (ведущее колесо) с зубьями и ленивец
    disc(z1 - 0.5, 0.5, 0.31, [72, 74, 76], 20, true); disc(z1 - 0.5, 0.5, 0.19, [96, 96, 92]); disc(z1 - 0.5, 0.5, 0.07, [46, 48, 50]);
    disc(z0 + 0.5, 0.48, 0.3, [70, 72, 74]); disc(z0 + 0.5, 0.48, 0.22, [104, 106, 104]); disc(z0 + 0.5, 0.48, 0.08, [50, 52, 54]);
    for (let i = 0; i < 5; i++) {
      const zc = z0 + 1.15 + i * (z1 - z0 - 2.3) / 4;
      disc(zc, 0.31, 0.28, [64, 66, 68]); disc(zc, 0.31, 0.22, [112, 114, 112]); disc(zc, 0.31, 0.08, [52, 54, 56]);
    }
    // звенья: поперечные риски на нижней и верхней ветвях
    x.lineCap = 'butt';
    for (let z = z0 + 0.5; z < z1 - 0.45; z += 0.16) {
      line3(sd(z, 0.84), sd(z, 0.9), lw(0.025, z, 1), css(lit([78, 80, 82], 'Rt', z), 0.8));
      line3(sd(z, 0.02), sd(z, 0.08), lw(0.025, z, 1), css(lit([70, 72, 74], 'Rt', z), 0.8));
    }
    // снег, набитый на верхнюю ветвь и между катками у земли
    const top = [];
    for (let i = 0; i <= 12; i++) top.push(sd(lerp(z0 + 0.5, z1 - 0.6, i / 12), 0.92 + 0.05 * Math.abs(Math.sin(i * 1.9)) + 0.03 * rr()));
    top.push(sd(z1 - 0.6, 0.88), sd(z0 + 0.5, 0.88));
    fill3(top, css(lit([218, 222, 226], 'Rt', 21)));
    const cake = [];
    for (let i = 0; i <= 14; i++) cake.push(sd(lerp(z0 + 0.3, z1 - 0.3, i / 14), 0.1 + 0.07 * Math.sin(i * 2.1) + 0.05 * rr()));
    cake.push(sd(z1 - 0.3, 0.0), sd(z0 + 0.3, 0.0));
    fill3(cake, css(lit([204, 206, 204], 'Rt', 21), 0.9));
    // надгусеничная полка с налипшим снегом
    box(x0 - 0.1, x0 + 0.45, 0.95, 1.02, z0 + 0.1, z1 - 0.1, { F: dark, S: [58, 60, 62], T: [214, 220, 226] });
    fill3([sd(z0 + 0.1, 1.02), sd(z0 + 0.1, 1.07), sd(z1 - 0.3, 1.06), sd(z1 - 0.3, 1.02)], css(lit([214, 220, 226], 'Rt', 21)));
    // корма кунга: дверь с окошком, лестница, фонари, канистры, номер; грязь внизу
    const zr = kz0, mf = (u, v) => [u, v, zr - 0.01];
    fill3([mf(5.5, 1.38), mf(6.3, 1.38), mf(6.3, 2.62), mf(5.5, 2.62)], css(lit(mul(body, 0.8), 'F', zr)));
    fill3([mf(5.65, 2.15), mf(6.15, 2.15), mf(6.15, 2.5), mf(5.65, 2.5)], css(fog([66, 78, 92], zr)));
    fill3([mf(6.18, 1.92), mf(6.24, 1.92), mf(6.24, 2.0), mf(6.18, 2.0)], css(fog([40, 40, 40], zr)));
    [6.5, 6.78].forEach((X) => line3(mf(X, 1.32), mf(X, 2.8), lw(0.025, zr, 1.1), css(fog([66, 68, 70], zr))));
    for (let y = 1.5; y < 2.75; y += 0.3) line3(mf(6.5, y), mf(6.78, y), lw(0.02, zr, 1), css(fog([66, 68, 70], zr)));
    [[x0 + 0.3, 1.0], [x1 - 0.48, 1.0]].forEach((l) => fill3([[l[0], l[1], z0 + 0.04], [l[0] + 0.18, l[1], z0 + 0.04], [l[0] + 0.18, l[1] + 0.12, z0 + 0.04], [l[0], l[1] + 0.12, z0 + 0.04]], css(fog([110, 52, 46], zr))));
    fill3([[5.6, 0.72, z0 + 0.04], [6.3, 0.72, z0 + 0.04], [6.3, 0.88, z0 + 0.04], [5.6, 0.88, z0 + 0.04]], css(fog([212, 212, 206], zr)));
    textF('В 214 КТ', 5.95, 0.8, z0 + 0.03, 0.09, css(fog([40, 40, 44], zr)));
    box(x0 + 0.35, x0 + 0.75, 1.36, 1.86, z0 - 0.22, z0 + 0.08, [100, 104, 78]);
    box(x0 + 0.8, x0 + 1.2, 1.36, 1.86, z0 - 0.22, z0 + 0.08, [92, 96, 74]);
    fill3([[x0 + 0.2, 0.55, z0 + 0.04], [x1 - 0.2, 0.55, z0 + 0.04], [x1 - 0.2, 0.95, z0 + 0.04], [x0 + 0.2, 0.95, z0 + 0.04]], 'rgba(78,66,54,.35)');
    // крыша кунга: снег (передняя кромка и борт), багажник с поклажей, маячок
    fill3([[x0 + 0.08, 2.78, zr - 0.02], [x1 - 0.08, 2.78, zr - 0.02], [x1 - 0.08, 2.95, zr - 0.02], [x0 + 0.08, 2.97, zr - 0.02]], css(fog([230, 234, 238], zr)));
    fill3([kd(zr, 2.78), kd(zr, 2.96), kd(kz1, 2.93), kd(kz1, 2.78)], css(lit([226, 231, 236], 'Rt', 20)));
    [zr + 0.3, (zr + kz1) / 2, kz1 - 0.3].forEach((z) => line3([x0 + 0.2, 2.95, z], [x0 + 0.2, 3.2, z], lw(0.03, z, 1), css(lit([60, 62, 64], 'Rt', z))));
    line3([x0 + 0.2, 3.2, zr + 0.3], [x0 + 0.2, 3.2, kz1 - 0.3], lw(0.03, 20, 1), css(lit([60, 62, 64], 'Rt', 20)));
    box(x0 + 0.4, x0 + 1.5, 2.95, 3.25, zr + 0.8, zr + 2.0, { F: [92, 96, 84], S: [86, 90, 78], T: [214, 220, 226] });
    box(x0 + 0.3, x0 + 0.48, 2.95, 3.16, zr + 0.25, zr + 0.43, [176, 132, 82]);
    fill3([[x0 + 0.3, 3.16, zr + 0.24], [x0 + 0.48, 3.16, zr + 0.24], [x0 + 0.46, 3.2, zr + 0.24], [x0 + 0.32, 3.2, zr + 0.24]], css(fog([228, 232, 236], zr)));
  }

  // ---------- Земля: снежное поле и укатанная снежная дорога (карта в перспективе) ----------
  // Попиксельно — только тон и рельеф: гривы надува (резкий гребень, голубая теневая сторона),
  // заструги у камеры, продольная фактура наката на дороге. Колеи, протектор, лёд — векторами.
  function ground() {
    const n = Tex.perlin(5201), n2 = Tex.perlin(5202), n3 = Tex.perlin(5203);
    const snow = [217, 222, 227], lee = [166, 180, 200], sunny = [232, 235, 238], road = [186, 189, 193], dirt = [166, 163, 157];
    let rowY = -1, rowR = [], occ = 0;
    const ca = Math.cos(0.45), sa = Math.sin(0.45), fine = K > 0.5;
    // высота гривы (гребенчатый шум, вытянут по ветру) и застругов
    const hD = (u, v) => 1 - Math.abs(n(u * 0.05, v * 0.22));
    const hS = (u, v) => 1 - Math.abs(n2(u * 0.42 + 40, v * 1.9));
    const c = pixmap(0, CY, W, H - CY, fine ? 3 : 5, function (lx, ly, o) {
      const Z = F * EYE / Math.max(0.7, ly - CY), X = (lx - CX) * Z / F, near = Math.exp(-Z / 60);
      const edge = ROADW + 0.25 * n3(Z * 0.18, 2.7), ax = Math.abs(X);
      const rm = 1 - sm(edge - 0.35, edge + 0.15, ax);
      let col = snow;
      if (rm < 1) {
        const u = X * ca + Z * sa, v = -X * sa + Z * ca, e = 0.12;
        // освещённость склона: солнце слева и чуть со стороны камеры → светлее грани с dh/dX > 0, dh/dZ > 0
        const h0 = hD(u, v), dX = hD(u + e * ca, v - e * sa) - h0, dZ = hD(u + e * sa, v + e * ca) - h0;
        let L = (0.8 * dX + 0.42 * dZ) / e * 1.6 * (0.35 + 0.65 * near);
        if (Z < 14 && fine) {
          const s0 = hS(u, v), e2 = 0.04, sX = hS(u + e2 * ca, v - e2 * sa) - s0, sZ = hS(u + e2 * sa, v + e2 * ca) - s0;
          L += (0.8 * sX + 0.42 * sZ) / e2 * 0.07 * sm(14, 5, Z);
        }
        col = L < 0 ? mix(snow, lee, clamp(-L, 0, 0.75)) : mix(snow, sunny, clamp(L, 0, 0.8));
        col = mix(col, lee, 0.12 * (1 - h0) * near);
      }
      if (rm > 0) {
        // продольная фактура наката (тянется вдоль дороги, сходится в точку схода) и пятна грязи
        const dd = sm(0.1, 0.5, Tex.fbm(n3, X * 0.22 + 9, Z * 0.1, 2) + 0.15);
        let rc = mix(road, dirt, 0.22 * dd + 0.1 * sm(8, 40, Z));
        rc = mul(rc, 1 + 0.035 * n2(X * 2.4, Z * 0.11) * (0.4 + 0.6 * near));
        if (Z < 7 && fine) rc = mul(rc, 1 + 0.03 * n(X * 7, Z * 5) * sm(7, 3, Z));
        // колеи ближе 24 м: укатанное буро-серое дно с гроздьями песка, теневая левая стенка,
        // освещённая правая, рыхлые бортики. Центры колей считаются раз на строку (Z в строке один).
        if (Z < 24) {
          if (ly !== rowY) { rowY = ly; rowR = RUTS.map((r) => [rutX(r, Z), rutW(r, Z) * 1.15, rutA(r, Z) * (1 - sm(16, 24, Z)), r.turn]); }
          for (let i = 0; i < rowR.length; i++) {
            const q = rowR[i];
            if (q[2] <= 0.01) continue;
            const d = (X - q[0]) / q[1], ad = Math.abs(d);
            if (ad > 1.4) continue;
            const s = q[2], b = 1 - sm(0.42, 0.72, ad), wl = sm(0.42, 0.72, ad) * (1 - sm(0.9, 1.08, ad)), rim = sm(0.92, 1.06, ad) * (1 - sm(1.12, 1.4, ad));
            const gr = sm(0.15, 0.55, n2(X * 5 + i * 7, Z * 1.3));
            const bot = q[3] ? [176, 176, 174] : mix([168, 162, 154], [132, 120, 106], gr * 0.7);
            rc = mix(rc, bot, (q[3] ? 0.45 : 0.62) * b * s);
            rc = d < 0 ? mix(rc, [140, 152, 172], 0.55 * wl * s) : mix(rc, [214, 217, 220], 0.4 * wl * s);
            rc = mix(rc, [234, 237, 240], 0.5 * rim * s);
            occ = Math.max(occ, s * (1 - sm(1.0, 1.4, ad)));
          }
          // ветровая рябь (мелкие заструги) на рыхлом снегу между колеями: косые гребни поперёк ветра,
          // пятнами; светлая наветренная сторона гребня и голубоватая подветренная
          const patch = sm(-0.05, 0.3, n3(X * 0.35 + 4, Z * 0.25));
          if (patch > 0 && occ < 0.9) {
            const ph = (X * 0.85 + Z * 0.5) * 6.5 + 2.6 * n(X * 0.5 + 7, Z * 0.4), cr = Math.cos(ph);
            const k = patch * (1 - occ) * sm(16, 6, Z) * 0.6;
            rc = cr > 0 ? mix(rc, [232, 235, 239], 0.35 * cr * k) : mix(rc, [158, 170, 188], -0.3 * cr * k);
          }
          occ = 0;
        }
        // накат у камеры темнее: низ кадра не должен быть самой светлой полосой
        rc = mul(rc, 0.9 + 0.1 * sm(3, 16, Z));
        col = mix(col, rc, rm);
      }
      col = fog(col, Z);
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2];
    });
    put(c, 0, CY, W, H - CY);
  }

  // ---------- Лёгкий снегопад: три плана по глубине, общий снос ветром ----------
  // Ближние хлопья 3–4 px, средние 2 px, дальние 1 px; слегка вытянуты (1,5 : 1) под одним углом.
  // Под центральной колонкой интерфейса реже, в верхних 90 px (заголовки экранов) — ни одного.
  function snowfall() {
    if (K < 0.5) return;   // на миниатюре хлопья всё равно меньше пикселя
    const rr = Tex.rng(7101), ang = 0.38;
    for (let i = 0; i < 340; i++) {
      const fx = rr() * W, fy = 90 + rr() * (H - 90), band = rr();
      if (fx > 700 && fx < 1220 && rr() < 0.55) continue;
      const near = band < 0.16, mid = band < 0.5;
      const r = near ? 1.6 + rr() * 0.5 : mid ? 1.0 : 0.55, a = near ? 0.5 + rr() * 0.2 : mid ? 0.42 + rr() * 0.2 : 0.35 + rr() * 0.15;
      x.save(); x.translate(fx, fy); x.rotate(ang); x.scale(1.5, 1);
      x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fillStyle = 'rgba(247,249,251,' + a.toFixed(2) + ')'; x.fill();
      x.restore();
    }
  }

  // ---------- Сборка ----------
  Backgrounds.scene('snow', function (ctx, R, th, o) {
    x = ctx; K = o.scale || 1;
    x.save();
    sky();
    mountains();
    ground();
    ruts();
    icePatches();
    treads();
    drifting();
    if (K > 0.5) grit();
    manhole();
    footpath([[-3.45, 8.6], [-4.3, 8.5], [-5.2, 8.35], [-6.2, 8.2]], 0.8, 6421);
    footpath([[3.5, 8.25], [4.4, 8.1], [5.3, 7.95], [6.3, 7.85]], 0.8, 6422);
    if (K > 0.5) roadDetail();
    fgProps();
    berm(-1, [[4.3, 7.4], [9.4, 20.5], [25.5, 120]], 6301);
    berm(1, [[3.9, 6.9], [8.9, 11.2], [24.5, 27.2], [31.5, 120]], 6302);
    shadows();
    forestBelt();
    forestEdges();
    mast(-4, 150, 42);
    radome(13, 158);
    grove();
    mainBuilding();
    hangar();
    tankFarm();
    lampPost(-4.4, 19.5, 1);
    vehicle();
    moduleR();
    moduleL();
    powerLine();
    snowfall();
    x.restore();
  });
})();
