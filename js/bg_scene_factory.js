'use strict';

// Фон-локация «Промзона» (factory): старый завод в пасмурный день, 1920 × 1080.
// Однточечная перспектива: глаз на высоте 1,7 м, точка схода (960, 500). Мир — в метрах:
// X — вправо, Y — вверх, Z — вглубь. Проекция P(X, Y, Z) честная, поэтому все уходящие линии
// сходятся в одну точку, а ряды окон, стыки плит и столбы сами сжимаются с глубиной.
// Слева — краснокирпичный цех, справа — ангар из профлиста, над проездом — трубная эстакада,
// в конце — главный корпус с воротами, кирпичная труба и козловой кран над площадкой контейнеров.
// Свет: сплошная облачность, светлее справа сверху — мягкие тени ложатся влево, плотная контактная тень.
// Всё рисуется через преобразование контекста; попиксельные карты — на своих холстах (drawImage).
(function () {
  const W = 1920, H = 1080, F = 1000, CX = 960, CY = 500, EYE = 1.7;
  const HAZE = [168, 170, 168], ZH = 200;   // цвет и глубина промышленной дымки (м): даль светлая — фокус кадра

  let x = null, K = 1;   // контекст и масштаб текущей отрисовки (1 — фон, 0.2 — миниатюра)

  // ---------- Мелкие помощники ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function mul(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
  function css(c, a) {
    const r = Math.round(clamp(c[0], 0, 255)), g = Math.round(clamp(c[1], 0, 255)), b = Math.round(clamp(c[2], 0, 255));
    return a === undefined || a >= 1 ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, a).toFixed(3) + ')';
  }
  // целочисленный хэш → [0, 1): цвет отдельного кирпича, плиты, пятна
  function hash2(i, j) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const fog = (c, z) => mix(c, HAZE, 1 - Math.exp(-z / ZH));
  // освещённость граней при пасмурном небе, светлее справа сверху:
  // L — стены левой стороны (смотрят вправо, к светлому небу), Rt — стены правой стороны (смотрят влево),
  // F — к камере, T — верх, B — низ (подсвечен только бетоном)
  const FACE = { F: 0.86, L: 0.97, Rt: 0.8, T: 1.04, B: 0.52 };
  const lit = (c, f, z) => fog(mul(c, typeof f === 'number' ? f : FACE[f]), z);

  // ---------- Проекция ----------
  function P(X, Y, Z) { return [CX + F * X / Z, CY - F * (Y - EYE) / Z]; }
  const gy = (Z) => CY + F * EYE / Z;            // экранная высота земли на глубине Z
  const lw = (t, z, mn) => Math.max(mn || 1, F * t / z);   // толщина t (м) на глубине z, px
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
  // вертикальная стойка круглого сечения (столб, труба): r — радиус, y0..y1 — высота
  function post(X, Z, r, y0, y1, c, f) {
    const a = P(X - r, y1, Z), b = P(X + r, y0, Z), wpx = Math.max(1, b[0] - a[0]);
    const g = x.createLinearGradient(a[0], 0, a[0] + wpx, 0);
    const k = f || 1;
    g.addColorStop(0, css(fog(mul(c, 0.72 * k), Z))); g.addColorStop(0.35, css(fog(mul(c, 1.0 * k), Z)));
    g.addColorStop(0.75, css(fog(mul(c, 0.86 * k), Z))); g.addColorStop(1, css(fog(mul(c, 0.62 * k), Z)));
    x.fillStyle = g; x.fillRect(a[0], a[1], wpx, b[1] - a[1]);
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
    x.save(); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'low';
    x.drawImage(c, bx, by, bw, bh); x.restore();
  }

  // ---------- Надписи ----------
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

  // ---------- Небо: сплошная слоистая облачность ----------
  function sky() {
    const n = Tex.perlin(7101), n2 = Tex.perlin(7102);
    const top = [86, 93, 99], mid = [136, 140, 143], low = [186, 188, 185], hb = CY + 16;
    const c = pixmap(0, 0, W, hb, 5, function (lx, ly, o) {
      const t = ly / hb;
      const col = t < 0.55 ? mix(top, mid, sm(0, 0.55, t)) : mix(mid, low, sm(0.55, 1, t));
      // нижняя кромка облаков — плоскость над нами: к горизонту клочья мельчают и бледнеют
      const e = Math.max(0, CY + 6 - ly) / F, d = 1 / (e + 0.03);
      const u = (lx - CX) / F * d, amp = sm(0, 0.22, e);
      const cl = Tex.fbm(n, u * 0.42 + 3.1, d * 0.75, 3), big = n2(u * 0.11 + 20, d * 0.19);
      // справа сверху облака тоньше — там прячется солнце
      const sun = 0.07 * sm(700, 1900, lx) * sm(1, 0.15, t);
      const k = 1 + amp * (0.2 * cl + 0.12 * big) + sun;
      o[0] = col[0] * k; o[1] = col[1] * k; o[2] = col[2] * k;
    });
    put(c, 0, 0, W, hb);
  }

  // ---------- Земля: бетонные плиты проезда, старый асфальт у стен, лужи ----------
  const ROAD = 6, SLW = 2.4, SLL = 6, NSL = 5;   // полуширина проезда; плита 2,4 м поперёк × 6 м вдоль; плит в ряду
  const WALL_L = -9, WALL_R = 10;     // фасады цеха (слева) и ангара (справа)
  const slabOff = (i) => (hash2(i, 91) - 0.5) * 2.4;   // плиты уложены неровно: сдвиг поперечных швов
  // лужи в просадках плит: [X, Z, rx, rz] — центр и полуоси на земле (м); форму рвёт шум
  const PUD = [[0.8, 6.35, 1.35, 0.62], [-0.6, 10.6, 1.8, 1.1], [1.6, 12.2, 1.3, 0.9], [3.2, 17.6, 1.4, 2.6], [-3.1, 23.5, 1.2, 3.4],
    [0.7, 32, 2.4, 4.6], [-1.7, 46, 2.2, 6.5], [3.4, 57, 1.6, 7.5], [-7.2, 15.4, 0.8, 2.0]];
  const GTOP = CY + 3;      // карта земли начинается чуть ниже горизонта
  let PMASK = null;         // маска луж: альфа = доля отражения (растёт к горизонту — Френель)
  function puddleV(X, Z, n) {
    let v = -9;
    for (let i = 0; i < PUD.length; i++) {
      const p = PUD[i], dx = (X - p[0]) / p[2], dz = (Z - p[1]) / p[3];
      const r = 1 - Math.sqrt(dx * dx + dz * dz);
      if (r > v) v = r;
    }
    if (v < -0.8) return v;
    return v + 0.5 * Tex.fbm(n, X * 0.95 + 4, Z * 0.7, 3);
  }
  function ground() {
    const n = Tex.perlin(7201), n2 = Tex.perlin(7202), n3 = Tex.perlin(7203);
    const step = Math.max(3, 1 / K), bh = H - GTOP;
    const w = Math.round(W / step), h = Math.round(bh / step);
    const c = cnv(w, h), m = cnv(w, h), cc = c.getContext('2d'), mc = m.getContext('2d');
    const ci = cc.createImageData(w, h), mi = mc.createImageData(w, h), d = ci.data, md = mi.data;
    let k = 0;
    for (let j = 0; j < h; j++) {
      const ly = GTOP + (j + 0.5) * bh / h, Z = F * EYE / Math.max(0.6, ly - CY);
      const near = Math.exp(-Z / 22), grain = sm(25, 6, Z), fz = 1 - Math.exp(-Z / ZH), fk = 1 - fz;
      const hz0 = HAZE[0] * fz, hz1 = HAZE[1] * fz, hz2 = HAZE[2] * fz;
      for (let i = 0; i < w; i++, k += 4) {
        const X = ((i + 0.5) * W / w - CX) * Z / F, ax = Math.abs(X);
        if ((X < -9.7 && Z < 100) || (X > WALL_R + 0.3 && Z > 13.6 && Z < 47.5)) continue;   // под стенами — не видно
        let r, g, b;
        if (ax < ROAD) {
          // плита: свой тон, чуть темнее у швов; накатанные колеи темнее и с масляными пятнами
          const si = Math.floor((X + ROAD) / SLW), off = slabOff(si), sj = Math.floor((Z - off) / SLL);
          const u = (X + ROAD) / SLW - si, v = (Z - off) / SLL - sj;
          const e = Math.min(Math.min(u, 1 - u) * SLW, Math.min(v, 1 - v) * SLL);
          const tr = Math.max(sm(0.5, 0.12, Math.abs(X - 1.6)), sm(0.5, 0.12, Math.abs(X - 3.5))) * sm(24, 15, Z);
          let q = (0.89 + 0.15 * hash2(si + 3, sj + 40)) * (1 - 0.12 * sm(0.3, 0, e)) * (1 - 0.08 * tr);
          // выщербленный бетон: крупная зернистость вблизи и зерно заполнителя в 2–4 px
          if (Z < 25) q *= 1 + 0.06 * n(X * 3.2, Z * 3.2) * grain + 0.07 * (hash2(Math.floor(X / 0.04), Math.floor(Z / 0.04)) - 0.5) * near;
          q *= 1 + 0.06 * (hash2(i, j + 7000) - 0.5);
          // высохшие сырые пятна — с чёткой кромкой, а не мягкие кляксы
          q *= 1 - 0.11 * sm(0.1, 0.16, n2(X * 0.32 + 3, Z * 0.15 + 1));
          r = 134 * q; g = 131 * q; b = 124 * q;
          // песок и грязь у краёв проезда
          const sand = 0.32 * sm(0.7, 0.0, ROAD - ax);
          r += (118 - r) * sand; g += (108 - g) * sand; b += (90 - b) * sand;
          const oil = 0.45 * sm(0.32, 0.6, n2(X * 1.5 + 11, Z * 0.55)) * (0.35 + 0.65 * tr);
          r += (64 - r) * oil; g += (61 - g) * oil; b += (57 - b) * oil;
        } else {
          // старый асфальт вдоль стен: заплатки, щебень, грязь у фасада
          let q = 0.95 + 0.1 * n(X * 0.9, Z * 0.5);
          const pc = hash2(Math.floor(X / 1.7) + 9, Math.floor(Z / 2.3));
          if (pc < 0.3) q *= 0.84 + pc * 0.3;
          if (Z < 25) q *= 1 + 0.1 * (hash2(Math.floor(X / 0.04), Math.floor(Z / 0.04)) - 0.5) * near;
          r = 92 * q; g = 91 * q; b = 87 * q;
          const t = 0.35 * sm(0.9, 0.05, X < 0 ? X - WALL_L : WALL_R - X);
          r += (84 - r) * t; g += (86 - g) * t; b += (70 - b) * t;
        }
        // у луж — тёмная мокрая кайма; сама вода — векторной заливкой с отражением в puddles()
        const pv = puddleV(X, Z, n3);
        if (pv > -0.35) {
          const wet = 0.55 * sm(-0.35, -0.02, pv);
          r += (70 - r) * wet; g += (71 - g) * wet; b += (70 - b) * wet;
        }
        d[k] = r * fk + hz0; d[k + 1] = g * fk + hz1; d[k + 2] = b * fk + hz2; d[k + 3] = 255;
        // мокрый бетон к горизонту слабо отражает небо
        const sheen = ax < ROAD + 1 ? 0.2 * sm(10, 70, Z) : 0.08 * sm(10, 70, Z);
        md[k] = 255; md[k + 1] = 255; md[k + 2] = 255; md[k + 3] = 255 * sheen;
      }
    }
    cc.putImageData(ci, 0, 0); mc.putImageData(mi, 0, 0);
    PMASK = m;
    put(c, 0, GTOP, W, bh);
  }

  // ---------- Кирпичная кладка ----------
  // u — вдоль ряда, v — по высоте (м); du, dv — размер пикселя карты в метрах (для сглаживания швов)
  const BRICK = [124, 60, 45], MORTAR = [146, 137, 124];
  // kind: 0 — красный кирпич, 1 — силикатный (заложенные проёмы). Пишет [r, g, b] в out (без лишних массивов).
  function brick(u, v, du, dv, kind, out) {
    const course = Math.floor(v / 0.077), off = (course & 1) * 0.13;
    const bi = Math.floor((u + off) / 0.26), fu = u + off - bi * 0.26, fv = v - course * 0.077;
    const h = hash2(bi, course);
    let r, g, b;
    if (kind) { const k = 0.88 + 0.16 * h; r = 138 * k; g = 135 * k; b = 127 * k; }
    else {
      const h2 = hash2(bi * 7 + 3, course * 13 + 5);
      if (h2 < 0.07) { r = 86; g = 45; b = 37; }                 // пережжённый
      else if (h2 > 0.965) { r = 150; g = 102; b = 76; }         // светлый, недожжённый
      else { const k = 0.84 + 0.3 * h; r = BRICK[0] * k; g = BRICK[1] * k * (0.94 + 0.12 * h2); b = BRICK[2] * k; }
    }
    const dU = Math.min(fu, 0.26 - fu), dV = Math.min(fv, 0.077 - fv);
    const mu = 1 - sm(0.005 - du * 0.5, 0.005 + du * 0.5, dU), mv = 1 - sm(0.006 - dv * 0.5, 0.006 + dv * 0.5, dV);
    const mt = (mu > mv ? mu : mv) * 0.85;
    r += ((kind ? 128 : MORTAR[0]) - r) * mt; g += ((kind ? 126 : MORTAR[1]) - g) * mt; b += ((kind ? 120 : MORTAR[2]) - b) * mt;
    // где кирпич мельче пикселя — плавно к среднему тону, без муара
    const fade = sm(0.45, 0.15, Math.max(du / 0.26, dv / 0.077));
    const ar = kind ? 134 : 122, ag = kind ? 131 : 66, ab = kind ? 124 : 52;
    out[0] = ar + (r - ar) * fade; out[1] = ag + (g - ag) * fade; out[2] = ab + (b - ab) * fade;
  }

  // ---------- Левый цех «ЦЕХ 2»: стена с лопатками — попиксельно, окна и детали — векторно ----------
  const L1 = { z0: 4, z1: 54, top: 14.3, pil: 0.22, pw: 0.45 };   // pil — вынос лопатки, pw — её полуширина
  const BAYS = [9, 15, 21, 27, 33, 39, 45, 51];                   // оси пролётов между лопатками
  const FLOORS = [[1.3, 4.2, 0.36], [5.9, 8.9, 0.36], [10.3, 12.9, 0.3]];   // [низ, верх, стрела арки]
  const WHW = 1.6;                                                // полуширина окна вдоль стены
  const SEALED = [[21, 0]];                                       // окна, заложенные силикатным кирпичом
  // Карта считается по столбцам: глубина и грань зависят только от экранного x, по высоте — только Y.
  function brickWallL() {
    const n = Tex.perlin(7301), n2 = Tex.perlin(7302);
    const X0 = WALL_L, XF = WALL_L + L1.pil, bw = 800, bh = 690;
    const step = Math.max(2, 1 / K), w = Math.round(bw / step), h = Math.round(bh / step), sy = bh / h;
    const c = cnv(w, h), cc = c.getContext('2d'), img = cc.createImageData(w, h), d = img.data;
    const sill = [0, 0, 0], B = [0, 0, 0];
    for (let i = 0; i < w; i++) {
      const lx = (i + 0.5) * bw / w, s = (lx - CX) / F;
      if (s > -0.05) continue;
      const Zw = X0 / s, Zf = XF / s;
      let Z = Zw, face = 0, u = 0;
      // лопатки: передняя грань (X = XF) или ближняя боковая (Z = ось − pw), если луч в неё попал
      const kf = Math.round((Zf - 6) / 6), zp = 6 + 6 * kf;
      if (kf >= 0 && kf <= 8 && Math.abs(Zf - zp) <= L1.pw && Zf <= L1.z1) { Z = Zf; face = 1; }
      else {
        const k2 = Math.ceil((Zf + L1.pw - 6) / 6), zs = 6 + 6 * k2 - L1.pw;
        if (k2 >= 0 && k2 <= 8 && zs > Zf && zs < Zw) { Z = zs; face = 2; u = s * zs; }
      }
      if (Z < L1.z0 || Z > L1.z1) continue;
      const dv = Z / F * step, du = face === 2 ? dv : Z * Z / (F * -X0) * step;
      const uu = face === 2 ? u : Z, z2 = face === 2 ? Z + u : Z;
      const fz = 1 - Math.exp(-Z / ZH), fk = (face === 2 ? FACE.F : FACE.L) * (1 - fz);
      const hz0 = HAZE[0] * fz, hz1 = HAZE[1] * fz, hz2 = HAZE[2] * fz;
      const streak = n(z2 * 1.7, 2.3) * 0.5 + 0.5;
      // потёки под подоконниками и тень в углу у лопаток — свои для каждого столбца
      let ao = 1, bay = -1;
      const nearK = 0.82 + 0.18 * sm(4, 26, Z);   // ближний край стены темнее — кадр «в раме», даль светлее
      if (face === 0) {
        const b = BAYS[Math.max(0, Math.min(7, Math.round((Z - 9) / 6)))];
        if (Math.abs(Z - b) < WHW * 0.9) { bay = b; for (let f = 0; f < 3; f++) sill[f] = 0.4 + 0.6 * (n(Z * 6, 7.7 + f) * 0.5 + 0.5); }
        ao = 1 - 0.14 * sm(0.35, 0, Math.abs(Z - (6 + 6 * Math.round((Z - 6) / 6))) - L1.pw);
      }
      const j0 = Math.max(0, Math.floor((CY - (L1.top - EYE) * F / Z) / sy)), j1 = Math.min(h - 1, Math.ceil((CY + EYE * F / Z) / sy));
      for (let j = j0; j <= j1; j++) {
        const Y = EYE + (CY - (j + 0.5) * sy) * Z / F;
        if (Y < 0 || Y > L1.top) continue;
        // кирпич; в заложенных проёмах — силикатный
        let kind = 0;
        if (bay > 0) {
          for (let q = 0; q < SEALED.length; q++) {
            const fl = FLOORS[SEALED[q][1]];
            if (SEALED[q][0] === bay && Math.abs(Z - bay) < WHW && Y > fl[0] && Y < fl[1] + fl[2] * (1 - Math.pow((Z - bay) / WHW, 2))) kind = 1;
          }
        }
        brick(uu, Y, du, dv, kind, B);
        let r = B[0], g = B[1], b = B[2];
        // цоколь: штукатурка по бетону, местами отбита до кирпича
        if (Y < 0.85 && n2(uu * 1.4, Y * 2 + 3) > -0.5) { const q = 0.9 + 0.12 * n(uu * 2.5, Y * 3); r = 106 * q; g = 103 * q; b = 97 * q; }
        // копоть и потёки сверху, сырость снизу, крупные пятна, высолы
        let m = (1 - 0.28 * sm(10.5, L1.top, Y) * (0.5 + streak) - 0.2 * sm(1.6, 0.1, Y)) * (1 + 0.09 * n2(z2 * 0.13, Y * 0.22)) * ao * nearK;
        if (bay > 0) {
          for (let f = 0; f < 3; f++) {
            const sl = FLOORS[f][0];
            if (Y < sl && Y > sl - 1.6) m *= 1 - 0.3 * (1 - (sl - Y) / 1.6) * sill[f];
          }
        }
        r *= m; g *= m; b *= m;
        if (Y < 3.2) { const t = 0.3 * sm(0.25, 0.55, n2(z2 * 0.35 + 5, Y * 0.5)) * sm(3.2, 0.8, Y); r += (176 - r) * t; g += (170 - g) * t; b += (158 - b) * t; }
        const k = (j * w + i) * 4;
        d[k] = r * fk + hz0; d[k + 1] = g * fk + hz1; d[k + 2] = b * fk + hz2; d[k + 3] = 255;
      }
    }
    cc.putImageData(img, 0, 0);
    put(c, 0, 0, bw, bh);
  }

  // ---------- Окна цеха: проём с откосами, стальной переплёт с мелкими стёклами ----------
  const archY = (fl, t) => fl[1] + fl[2] * (1 - t * t);   // верх проёма по лучковой арке, t ∈ [−1, 1]
  function opening(X, b, fl, hw, n) {
    const pts = [[X, fl[0], b - hw], [X, fl[0], b + hw]];
    for (let i = 0; i <= n; i++) { const t = 1 - 2 * i / n; pts.push([X, archY(fl, t), b + hw * t]); }
    return pts;
  }
  const GLASS_X = WALL_L - 0.3;   // плоскость переплёта в глубине проёма
  function windowL(b, fi, seed) {
    const fl = FLOORS[fi], hw = WHW, z = b, rr = Tex.rng(seed);
    const hole = opening(WALL_L, b, fl, hw, 10);
    x.save();
    path3(hole); x.clip();
    // откос, обращённый к камере, и верхний откос (виден снизу)
    path3(hole); x.fillStyle = css(lit([104, 58, 47], 'F', z)); x.fill();
    const top0 = opening(WALL_L, b, fl, hw, 10).slice(2), top1 = opening(GLASS_X, b, fl, hw, 10).slice(2).reverse();
    if (fl[0] > EYE - 0.5) { path3(top0.concat(top1)); x.fillStyle = css(lit([92, 54, 45], 'B', z)); x.fill(); }
    // стёкла: каждое своё — грязное, отражает облака, разбитое (темно), фанера, закрашенное
    const glass = opening(GLASS_X, b, fl, hw, 10);
    path3(glass); x.save(); x.clip();
    const cols = 6, rows = fi === 2 ? 6 : 7, ytop = fl[1] + fl[2];
    const dirty = rr() < 0.3, ply = rr() < 0.2 ? 0.22 : 0.03;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const z0 = b - hw + 2 * hw * c / cols, z1 = b - hw + 2 * hw * (c + 1) / cols;
        const y0 = fl[0] + (ytop - fl[0]) * r / rows, y1 = fl[0] + (ytop - fl[0]) * (r + 1) / rows;
        const v = r / (rows - 1), q = rr();
        let col = mix([66, 72, 74], [124, 131, 134], v * 0.85 + 0.08 * rr());
        if (dirty) col = mix(col, [138, 136, 124], 0.45);
        if (q < 0.08) col = [30, 31, 31];
        else if (q < 0.08 + ply) col = mul([112, 92, 68], 0.85 + 0.25 * rr());
        else if (q > 0.95) col = [148, 156, 156];
        // у верхней кромки кадра (под заголовками экранов) стёкла приглушены — верх спокойнее
        const tk = 0.66 + 0.34 * sm(30, 230, P(GLASS_X, y1, z0)[1]);
        fill3([[GLASS_X, y0, z0], [GLASS_X, y0, z1], [GLASS_X, y1, z1], [GLASS_X, y1, z0]], css(lit(mul(col, tk), 1, z)));
      }
    }
    // переплёт: тёмный и не тоньше пикселя — читается и при размытии
    const fr = css(lit(rr() < 0.5 ? [40, 46, 45] : [62, 48, 40], 'L', z)), bw = lw(0.06, z, 1);
    x.beginPath();
    for (let c = 0; c <= cols; c++) {
      const zc = b - hw + 2 * hw * c / cols, p = P(GLASS_X, fl[0], zc), q = P(GLASS_X, ytop + 0.4, zc);
      x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]);
    }
    for (let r = 0; r <= rows; r++) {
      const yr = fl[0] + (ytop - fl[0]) * r / rows, p = P(GLASS_X, yr, b - hw), q = P(GLASS_X, yr, b + hw);
      x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]);
    }
    x.strokeStyle = fr; x.lineWidth = bw; x.stroke();
    x.restore();
    x.restore();
    // лучковая перемычка из кирпича «на ребро» над проёмом
    const arch = [], N = 12;
    for (let i = 0; i <= N; i++) { const t = -1 + 2 * i / N; arch.push([WALL_L, archY(fl, t), b + hw * t]); }
    const outer = arch.map((p) => [p[0], p[1] + 0.3, p[2]]).reverse();
    fill3(arch.concat(outer), css(lit([98, 50, 40], 'L', z), 0.8));
    if (z < 34) {
      x.beginPath();
      for (let i = 1; i < 16; i++) {
        const t = -1 + 2 * i / 16, p = P(WALL_L, archY(fl, t), b + hw * t * 1.02), q = P(WALL_L, archY(fl, t) + 0.3, b + hw * t * 1.08);
        x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]);
      }
      x.strokeStyle = css(lit(MORTAR, 'L', z), 0.45); x.lineWidth = lw(0.012, z, 0.7); x.stroke();
    }
    // отлив из оцинковки
    box(WALL_L, WALL_L + 0.1, fl[0] - 0.07, fl[0], b - hw - 0.06, b + hw + 0.06, [150, 152, 150]);
  }
  // окно, заложенное силикатным кирпичом: видна только перемычка и неглубокий откос
  function sealedL(b, fi) {
    const fl = FLOORS[fi], arch = [], N = 12;
    for (let i = 0; i <= N; i++) { const t = -1 + 2 * i / N; arch.push([WALL_L, archY(fl, t), b + WHW * t]); }
    fill3(arch.concat(arch.map((p) => [p[0], p[1] + 0.3, p[2]]).reverse()), css(lit([98, 50, 40], 'L', b), 0.8));
    box(WALL_L, WALL_L + 0.1, fl[0] - 0.07, fl[0], b - WHW - 0.06, b + WHW + 0.06, [140, 142, 140]);
    // кладка утоплена на полкирпича: тёмная кромка по дальнему откосу и под перемычкой, потёки
    const edge = [[WALL_L, fl[0], b + WHW]].concat(arch.slice().reverse());
    x.beginPath(); edge.forEach((p, i) => { const q = P(p[0], p[1], p[2]); if (i) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); });
    x.strokeStyle = css(lit([40, 34, 30], 'F', b), 0.7); x.lineWidth = lw(0.06, b, 1.2); x.stroke();
    const a0 = P(WALL_L, archY(fl, 0), b), a1 = P(WALL_L, fl[0], b), g = x.createLinearGradient(0, a0[1], 0, a1[1]);
    g.addColorStop(0, 'rgba(40,36,32,.28)'); g.addColorStop(0.5, 'rgba(40,36,32,.06)'); g.addColorStop(1, 'rgba(40,36,32,.2)');
    path3(opening(WALL_L, b, fl, WHW, 10)); x.fillStyle = g; x.fill();
  }

  // полоса с косой жёлто-чёрной разметкой на грани X = const (ступень рампы, кромка, стойка)
  function hazardS(X, y0, y1, z0, z1, wM, f) {
    const yel = [176, 146, 52], blk = [36, 35, 33], dz = y1 - y0;
    for (let zz = z0, k = 0; zz < z1; zz += wM, k++) {
      const a = Math.max(z0, zz), bq = Math.min(z1, zz + wM);
      fill3([[X, y0, a], [X, y0, bq], [X, y1, Math.min(z1, bq + dz)], [X, y1, Math.min(z1, a + dz)]], css(lit(k & 1 ? blk : yel, f, zz)));
    }
  }
  function hazardF(Z, y0, y1, x0, x1, wM) {
    const yel = [176, 146, 52], blk = [36, 35, 33], dx = y1 - y0;
    for (let xx = x0, k = 0; xx < x1; xx += wM, k++) {
      const a = Math.max(x0, xx), bq = Math.min(x1, xx + wM);
      fill3([[a, y0, Z], [bq, y0, Z], [Math.min(x1, bq + dx), y1, Z], [Math.min(x1, a + dx), y1, Z]], css(lit(k & 1 ? blk : yel, 'F', Z)));
    }
  }
  function facadeL() {
    const X = WALL_L;
    // пояски между этажами и карниз с сухариками (видны снизу — тёмные свесы)
    [5.25, 9.65].forEach((y) => box(X, X + 0.3, y, y + 0.22, L1.z0, L1.z1, { F: [112, 58, 46], S: [116, 60, 47], T: [112, 58, 46] }));
    box(X, X + 0.34, 13.55, 13.72, L1.z0, L1.z1, [110, 57, 45]);
    box(X, X + 0.4, 13.72, 13.92, L1.z0, L1.z1, [96, 50, 40]);
    for (let zz = 26; zz < L1.z1; zz += 0.52) box(X + 0.4, X + 0.5, 13.72, 13.92, zz, zz + 0.26, [112, 58, 46]);
    box(X, X + 0.55, 13.92, 14.25, L1.z0, L1.z1, [108, 56, 44]);
    box(X, X + 0.68, 14.25, 14.6, L1.z0, L1.z1, [104, 54, 43]);
    box(X, X + 0.45, 14.6, 15.25, L1.z0, L1.z1, [98, 52, 42]);
    box(X + 0.4, X + 0.52, 15.18, 15.3, L1.z0, L1.z1, [128, 130, 128]);   // жестяной отлив парапета
    // окна: на первом этаже — дверь, заложенный проём и ворота рампы
    BAYS.forEach(function (b, bi) {
      for (let fi = 0; fi < 3; fi++) {
        if (fi === 0 && (b === 15 || b === 27)) continue;
        if (SEALED.some((q) => q[0] === b && q[1] === fi)) { sealedL(b, fi); continue; }
        windowL(b, fi, 900 + bi * 7 + fi);
      }
    });
    // водостоки у лопаток: труба, хомуты, отмёт внизу
    [12, 24, 36, 48].forEach(function (zp) {
      const zt = zp - 0.65, xp = X + 0.28;
      const a = P(xp, 13.5, zt), bq = P(xp, 0.25, zt), wpx = Math.max(1, F * 0.13 / zt);
      x.fillStyle = css(lit([118, 122, 122], 'L', zt)); x.fillRect(a[0] - wpx / 2, a[1], wpx, bq[1] - a[1]);
      x.fillStyle = css(lit([70, 72, 72], 'L', zt), 0.8); x.fillRect(a[0] + wpx * 0.15, a[1], wpx * 0.3, bq[1] - a[1]);
      for (let y = 1.5; y < 13.5; y += 2.2) { const p = P(xp, y, zt); x.fillRect(p[0] - wpx * 0.6, p[1], wpx * 1.2, Math.max(1, F * 0.05 / zt)); }
      fill3([[xp - 0.07, 0.35, zt - 0.07], [xp + 0.3, 0.12, zt - 0.07], [xp + 0.3, 0.02, zt - 0.07], [xp - 0.07, 0.22, zt - 0.07]], css(lit([104, 108, 108], 'F', zt)));
    });
  }

  // ---------- Первый этаж цеха: дверь с крыльцом, табличка, щиток, рампа с воротами ----------
  function groundFloorL() {
    const X = WALL_L, zd0 = 14.45, zd1 = 15.55;
    // дверной проём: тёмная щель, откос к камере, стальное полотно
    fill3([[X, 0.45, zd0], [X, 0.45, zd1], [X, 2.62, zd1], [X, 2.62, zd0]], css(lit([34, 33, 32], 'L', 15)));
    fill3([[X, 0.45, zd1], [X - 0.25, 0.45, zd1], [X - 0.25, 2.62, zd1], [X, 2.62, zd1]], css(lit([100, 58, 47], 'F', 15)));
    fill3([[X - 0.24, 0.47, zd0 + 0.04], [X - 0.24, 0.47, zd1 - 0.03], [X - 0.24, 2.56, zd1 - 0.03], [X - 0.24, 2.56, zd0 + 0.04]], css(lit([64, 78, 74], 'L', 15)));
    fill3([[X - 0.24, 0.47, zd0 + 0.04], [X - 0.24, 0.47, zd1 - 0.03], [X - 0.24, 0.8, zd1 - 0.03], [X - 0.24, 0.8, zd0 + 0.04]], css(lit([88, 66, 52], 'L', 15), 0.7));
    box(X - 0.24, X - 0.18, 1.45, 1.52, zd1 - 0.25, zd1 - 0.12, [40, 40, 40]);
    // крыльцо в три ступени и козырёк на кронштейнах
    [[1.25, 0, 0.15], [0.95, 0.15, 0.3], [0.65, 0.3, 0.45]].forEach((s) => box(X, X + s[0], s[1], s[2], zd0 - 0.55, zd1 + 0.55, [124, 121, 114]));
    box(X, X + 1.1, 2.86, 2.95, zd0 - 0.7, zd1 + 0.7, [84, 88, 90]);
    [zd0 - 0.6, zd1 + 0.6].forEach((zz) => line3([X, 2.25, zz], [X + 1.05, 2.86, zz], lw(0.03, zz, 1), css(lit([52, 54, 56], 'L', zz))));
    // светильник над дверью
    box(X, X + 0.32, 3.25, 3.42, 14.85, 15.15, [70, 74, 76]);
    box(X + 0.18, X + 0.32, 3.18, 3.25, 14.88, 15.12, [196, 192, 176]);
    // табличка «КОРПУС 2» (без «Х»: обрезанная левой колонкой интерфейса, не читается как «×2»)
    box(X, X + 0.04, 3.55, 4.35, 13.2, 16.8, [42, 60, 84]);
    textS('КОРПУС 2', X + 0.045, 3.95, 13.45, 16.55, 0.46, css(lit([214, 216, 212], 'L', 15)));
    // щиток с молнией
    box(X, X + 0.26, 1.05, 2.05, 17.4, 18.1, [116, 120, 118]);
    fill3([[X + 0.265, 1.75, 17.6], [X + 0.265, 1.75, 17.9], [X + 0.265, 1.98, 17.75]], css(lit([186, 156, 52], 'L', 18)));
    line3([X + 0.13, 2.05, 17.75], [X + 0.13, 4.95, 17.75], lw(0.05, 17.8, 1), css(lit([52, 54, 56], 'L', 18)));
    // рампа: бетонная площадка с кромкой в жёлто-чёрную полосу, отбойники, ступени, ворота
    const zr0 = 23.2, zr1 = 30.8, XR = -7.5;
    box(X, XR, 0, 1.2, zr0, zr1, { F: [126, 123, 116], S: [118, 116, 110], T: [132, 129, 122] });
    hazardS(XR + 0.005, 0.98, 1.2, zr0, zr1, 0.32, 'L');
    hazardF(zr0 - 0.005, 0.98, 1.2, X, XR, 0.32);
    [24.3, 26.9, 29.5].forEach((zz) => box(XR, XR + 0.14, 0.5, 0.95, zz, zz + 0.32, [36, 35, 34]));
    [[0, 0.4, 22.0], [0.4, 0.8, 22.4], [0.8, 1.2, 22.8]].forEach((s) => box(X, X + 1.0, s[0], s[1], s[2], zr0, [120, 118, 112]));
    line3([X + 1.0, 1.05, 22.1], [X + 1.0, 2.15, 23.2], lw(0.04, 22.6, 1), css(lit([150, 128, 48], 'L', 22.6)));
    // рулонные ворота: короб, направляющие, ламели
    const zg0 = 25.1, zg1 = 28.9, yg0 = 1.2, yg1 = 5.0;
    fill3([[X, yg0, zg0], [X, yg0, zg1], [X, yg1, zg1], [X, yg1, zg0]], css(lit([30, 30, 30], 'L', 27)));
    fill3([[X, yg0, zg1], [X - 0.2, yg0, zg1], [X - 0.2, yg1, zg1], [X, yg1, zg1]], css(lit([96, 56, 46], 'F', 27)));
    const gx = X - 0.18, shut = 0.78;
    fill3([[gx, yg1 - (yg1 - yg0) * shut, zg0], [gx, yg1 - (yg1 - yg0) * shut, zg1 - 0.02], [gx, yg1, zg1 - 0.02], [gx, yg1, zg0]], css(lit([134, 138, 138], 'L', 27)));
    x.beginPath();
    for (let y = yg1 - (yg1 - yg0) * shut; y < yg1; y += 0.11) { const p = P(gx, y, zg0), q = P(gx, y, zg1); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    x.strokeStyle = css(lit([92, 96, 98], 'L', 27), 0.6); x.lineWidth = 1; x.stroke();
    box(X, X + 0.38, yg1, yg1 + 0.5, zg0 - 0.15, zg1 + 0.15, [120, 124, 124]);
    [zg0 - 0.12, zg1 + 0.02].forEach((zz) => box(X, X + 0.1, yg0, yg1, zz, zz + 0.1, [98, 102, 104]));
    // козырёк над рампой на тягах и прожектор
    box(X, X + 2.3, 5.72, 5.86, 24.0, 30.0, [86, 90, 92]);
    [24.3, 27, 29.7].forEach((zz) => line3([X, 7.6, zz], [X + 2.25, 5.86, zz], lw(0.03, zz, 1), css(lit([50, 52, 54], 'L', zz))));
    box(X, X + 0.5, 6.45, 6.62, 26.8, 27.2, [62, 66, 68]);
    // знак «не курить» у двери: круг на стене (в перспективе — эллипс)
    const ring = (r) => { const pts = []; for (let i = 0; i < 20; i++) { const t = i / 20 * Math.PI * 2; pts.push([X + 0.012, 1.78 + Math.sin(t) * r, 16.35 + Math.cos(t) * r]); } return pts; };
    fill3(ring(0.2), css(lit([164, 52, 46], 'L', 16.3))); fill3(ring(0.155), css(lit([222, 220, 214], 'L', 16.3)));
    fill3([[X + 0.013, 1.76, 16.23], [X + 0.013, 1.76, 16.47], [X + 0.013, 1.8, 16.47], [X + 0.013, 1.8, 16.23]], css(lit([40, 40, 40], 'L', 16.3)));
    fill3([[X + 0.014, 1.66, 16.24], [X + 0.014, 1.69, 16.24], [X + 0.014, 1.9, 16.46], [X + 0.014, 1.87, 16.46]], css(lit([164, 52, 46], 'L', 16.3)));
    // кондиционер между окном и лопаткой: решётка вентилятора, потёк конденсата
    const za = 10.7, zb = 11.45, ya = 2.2, yb = 2.8, zc = (za + zb) / 2;
    const ga = P(X + 0.01, ya, zc), gb = P(X + 0.01, 0.6, zc), gg = x.createLinearGradient(0, ga[1], 0, gb[1]);
    gg.addColorStop(0, 'rgba(36,30,26,.35)'); gg.addColorStop(1, 'rgba(36,30,26,0)');
    fill3([[X + 0.01, 0.6, za + 0.2], [X + 0.01, 0.6, zb - 0.25], [X + 0.01, ya, zb - 0.2], [X + 0.01, ya, za + 0.15]], gg);
    box(X, X + 0.3, ya, yb, za, zb, [150, 152, 148]);
    const fan = []; for (let i = 0; i < 18; i++) { const t = i / 18 * Math.PI * 2; fan.push([X + 0.305, (ya + yb) / 2 + Math.sin(t) * 0.22, zc + 0.05 + Math.cos(t) * 0.22]); }
    fill3(fan, css(lit([70, 72, 72], 'L', zc)));
    box(X, X + 0.36, ya - 0.18, ya - 0.13, za + 0.05, za + 0.12, [80, 80, 80]); box(X, X + 0.36, ya - 0.18, ya - 0.13, zb - 0.12, zb - 0.05, [80, 80, 80]);
  }

  // ---------- Дальний план: кирпичная труба с шлейфом пара, главный корпус, козловой кран ----------
  const CHIM = { X: -13, Z: 130, r0: 2.9, r1: 1.7, h: 52 };
  function chimney() {
    const X = CHIM.X, Z = CHIM.Z, r0 = CHIM.r0, r1 = CHIM.r1, Ht = CHIM.h, bc = [114, 66, 54];
    const b0 = P(X - r0, 0, Z), b1 = P(X + r0, 0, Z), t0 = P(X - r1, Ht, Z), t1 = P(X + r1, Ht, Z);
    // ствол: цилиндрическое затенение, светлее справа
    const g = x.createLinearGradient(b0[0], 0, b1[0], 0);
    g.addColorStop(0, css(fog(mul(bc, 0.6), Z))); g.addColorStop(0.45, css(fog(mul(bc, 0.88), Z)));
    g.addColorStop(0.8, css(fog(mul(bc, 1.02), Z))); g.addColorStop(1, css(fog(mul(bc, 0.84), Z)));
    poly2([b0, b1, t1, t0]); x.fillStyle = g; x.fill();
    // копоть у оголовка
    const gs = x.createLinearGradient(0, t0[1], 0, t0[1] + (b0[1] - t0[1]) * 0.3);
    gs.addColorStop(0, css(fog([38, 34, 32], Z), 0.8)); gs.addColorStop(1, css(fog([38, 34, 32], Z), 0));
    poly2([b0, b1, t1, t0]); x.fillStyle = gs; x.fill();
    // стяжные кольца и скобы ходовой лестницы
    x.beginPath();
    for (let y = 4; y < Ht - 1; y += 3.2) {
      const r = lerp(r0, r1, y / Ht), a = P(X - r, y, Z), b = P(X + r, y, Z);
      x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]);
    }
    x.strokeStyle = css(fog([44, 42, 40], Z), 0.75); x.lineWidth = 1; x.stroke();
    line3([X + r0 * 0.55, 2, Z - 0.5], [X + r1 * 0.55, Ht - 2, Z - 0.5], 1, css(fog([50, 50, 50], Z), 0.6));
    // оголовок и площадка обслуживания с ограждением
    box(X - r1 - 0.3, X + r1 + 0.3, Ht - 1.4, Ht, Z - r1, Z + r1, [74, 54, 47]);
    box(X - r1 - 0.9, X + r1 + 0.9, Ht - 6.2, Ht - 5.9, Z - r1, Z + r1, [62, 62, 62]);
    x.beginPath();
    const ra = P(X - r1 - 0.9, Ht - 5.0, Z), rb = P(X + r1 + 0.9, Ht - 5.0, Z);
    x.moveTo(ra[0], ra[1]); x.lineTo(rb[0], rb[1]);
    for (let k = 0; k <= 6; k++) { const p = P(X - r1 - 0.9 + (2 * r1 + 1.8) * k / 6, Ht - 5.9, Z), q = P(X - r1 - 0.9 + (2 * r1 + 1.8) * k / 6, Ht - 5.0, Z); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    x.strokeStyle = css(fog([58, 58, 58], Z), 0.7); x.lineWidth = 1; x.stroke();
    line3([X + r1 * 0.5, Ht, Z], [X + r1 * 0.5, Ht + 3.5, Z], 1, css(fog([50, 50, 50], Z)));
  }
  // шлейф пара сносит ветром влево; рваный край — шум, низ шлейфа темнее
  function plume() {
    const n = Tex.perlin(7401), top = P(CHIM.X, CHIM.h, CHIM.Z), sx = top[0], sy = top[1] - 4, ex = sx - 380, ey = sy - 58;
    const bx = ex - 40, by = ey - 50, bw = sx + 30 - bx, bh = sy + 40 - by;
    const c = pixmap(bx, by, bw, bh, 3, function (lx, ly, o) {
      const t = clamp((sx - lx) / (sx - ex), 0, 1);
      const cy = lerp(sy, ey, Math.pow(t, 0.75)), wd = 7 + 40 * Math.pow(t, 0.7), dy = (ly - cy) / wd;
      const nn = Tex.fbm(n, lx * 0.022 - t * 1.5, ly * 0.04, 3);
      const dens = (1 - sm(0.35, 1.1, Math.abs(dy) - 0.3 * nn)) * (1 - 0.8 * t) * sm(-0.35, 0.15, nn + 0.2 - t * 0.2) * sm(sx + 8, sx - 6, lx);
      if (dens <= 0.01) { o[3] = 0; return; }
      const sh = sm(-0.5, 0.9, dy);
      o[0] = 188 - 34 * sh; o[1] = 188 - 33 * sh; o[2] = 184 - 30 * sh; o[3] = 255 * 0.6 * dens;
    });
    put(c, bx, by, bw, bh);
  }
  // стойка с косой разметкой (столбик ворот, отбойник) — прямоугольник в плоскости Z = const
  function hazardPost(x0, x1, y0, y1, Z, step) {
    const yel = [176, 146, 52], blk = [36, 35, 33], wdt = x1 - x0;
    for (let y = y0, k = 0; y < y1; y += step, k++) {
      const a = Math.max(y0, y), b = Math.min(y1, y + step);
      fill3([[x0, a, Z], [x1, Math.min(y1, a + wdt * 0.6), Z], [x1, Math.min(y1, b + wdt * 0.6), Z], [x0, b, Z]], css(lit(k & 1 ? blk : yel, 'F', Z)));
    }
  }
  function mainHall() {
    const Z = 100, xa = -32, xb = 26, Hh = 9.5, wall = [170, 166, 156];
    fill3([[xa, 0, Z], [xb, 0, Z], [xb, Hh, Z], [xa, Hh, Z]], css(lit(wall, 'F', Z)));
    // шеды: зубья крыши со стеклом на крутой грани
    for (let a = xa; a < xb; a += 6) {
      fill3([[a, Hh, Z], [a, Hh + 3, Z], [a + 6, Hh, Z]], css(lit([152, 151, 146], 'F', Z)));
      fill3([[a, Hh, Z], [a, Hh + 3, Z], [a + 0.5, Hh + 2.75, Z], [a + 0.5, Hh, Z]], css(lit([84, 90, 94], 'F', Z)));
    }
    box(xa, xb, Hh - 0.3, Hh, Z - 0.3, Z, [112, 110, 104]);
    // швы панелей, потёки, полоса окон из стеклоблоков
    x.beginPath();
    for (let y = 1.2; y < Hh; y += 1.2) { const p = P(xa, y, Z), q = P(xb, y, Z); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    for (let X = xa; X < xb; X += 6) { const p = P(X, 0, Z), q = P(X, Hh, Z); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    x.strokeStyle = css(lit([104, 102, 96], 'F', Z), 0.55); x.lineWidth = 1; x.stroke();
    for (let X = xa + 0.5; X < xb; X += 3) {
      if (X > -4.5 && X < 10) continue;
      fill3([[X, 4.6, Z], [X + 2.3, 4.6, Z], [X + 2.3, 6.9, Z], [X, 6.9, Z]], css(lit([96, 104, 106], 'F', Z)));
    }
    // открытые ворота: тёмный пролёт, в глубине тусклый свет цеха; откатная створка сдвинута вправо
    fill3([[-3.2, 0, Z], [3.2, 0, Z], [3.2, 6.2, Z], [-3.2, 6.2, Z]], css(fog([24, 24, 24], Z)));
    fill3([[-2.4, 0, Z + 14], [2.4, 0, Z + 14], [2.4, 4.5, Z + 14], [-2.4, 4.5, Z + 14]], css(fog([50, 47, 40], Z * 0.85)));
    fill3([[-1.6, 2.6, Z + 13], [1.6, 2.6, Z + 13], [1.6, 3.1, Z + 13], [-1.6, 3.1, Z + 13]], css(fog([92, 86, 70], Z * 0.85)));
    fill3([[3.3, 0, Z - 0.3], [9.7, 0, Z - 0.3], [9.7, 6.35, Z - 0.3], [3.3, 6.35, Z - 0.3]], css(lit([82, 98, 110], 'F', Z)));
    x.beginPath();
    for (let X = 3.3; X < 9.7; X += 0.8) { const p = P(X, 0, Z - 0.3), q = P(X, 6.35, Z - 0.3); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    x.strokeStyle = css(lit([62, 74, 84], 'F', Z), 0.6); x.lineWidth = 1; x.stroke();
    hazardPost(-3.65, -3.2, 0, 6.2, Z - 0.35, 0.6);
    hazardPost(3.2, 3.65, 0, 6.2, Z - 0.6, 0.6);
    // вывеска над воротами
    fill3([[-3.6, 6.7, Z - 0.1], [3.6, 6.7, Z - 0.1], [3.6, 8.1, Z - 0.1], [-3.6, 8.1, Z - 0.1]], css(lit([46, 62, 84], 'F', Z)));
    textF('ЦЕХ 1', 0, 7.4, Z - 0.12, 0.95, css(fog([220, 222, 218], Z)));
  }
  // козловой кран над площадкой контейнеров: решётчатый пролёт с консолью над проездом
  function crane() {
    const Z = 85, ya = 12.2, yb = 13.7, xa = -4.5, xb = 34, XL = 7.6, yel = [168, 140, 72];
    const cl = (z, f) => css(lit(yel, f || 'F', z));
    // опора-«козла»: две наклонные стойки, связь, ходовая тележка на рельсе
    line3([XL, 0.9, 81], [XL, ya, 84.3], lw(0.6, 83), cl(83, 'Rt'));
    line3([XL, 0.9, 89], [XL, ya, 85.7], lw(0.6, 87), cl(87, 'Rt'));
    line3([XL, 6.2, 82.7], [XL, 6.2, 87.3], lw(0.3, 85), cl(85, 'Rt'));
    box(XL - 0.45, XL + 0.45, 0, 0.9, 80.4, 89.6, { F: [70, 68, 62], S: [96, 92, 80], T: yel });
    // пролёт: верхний и нижний пояса, раскосы на передней грани
    box(xa, xb, ya, ya + 0.32, Z - 0.8, Z + 0.8, yel);
    box(xa, xb, yb - 0.32, yb, Z - 0.8, Z + 0.8, yel);
    x.beginPath();
    for (let X = xa; X < xb - 0.1; X += 1.5) {
      const p = P(X, ya + 0.3, Z - 0.8), q = P(X + 0.75, yb - 0.3, Z - 0.8), r = P(X + 1.5, ya + 0.3, Z - 0.8);
      x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.lineTo(r[0], r[1]);
    }
    x.strokeStyle = cl(Z); x.lineWidth = lw(0.12, Z, 1.2); x.stroke();
    // тележка с лебёдкой, канаты, крюковая подвеска; кабина у опоры
    box(0.6, 3.8, yb, yb + 1.0, Z - 1.0, Z + 1.0, [150, 126, 68]);
    box(0.9, 3.5, yb + 1.0, yb + 1.25, Z - 0.8, Z + 0.8, [96, 94, 88]);
    [2.0, 2.5].forEach((X) => line3([X, ya, Z], [X, 7.2, Z], 1, css(fog([44, 44, 44], Z), 0.85)));
    box(1.8, 2.7, 6.3, 7.2, Z - 0.3, Z + 0.3, [64, 62, 56]);
    box(5.4, 7.2, 9.9, ya, Z - 1.1, Z + 1.1, [172, 148, 84]);
    fill3([[5.6, 10.6, Z - 1.11], [7.0, 10.6, Z - 1.11], [7.0, 11.8, Z - 1.11], [5.6, 11.8, Z - 1.11]], css(fog([70, 80, 86], Z)));
  }
  // соседний корпус слева за цехом: оштукатуренный, два ряда окон
  function buildingL2() {
    const X = -9.5, z0 = 57, z1 = 97, Hh = 8, wall = [146, 134, 114];
    box(-30, X, 0, Hh, z0, z1, wall);
    box(-30, X + 0.2, Hh, Hh + 0.3, z0, z1, [92, 90, 86]);
    for (let zz = z0 + 1.2; zz < z1 - 1.5; zz += 3) {
      [[1.3, 2.9], [4.5, 6.1]].forEach((r) => fill3([[X, r[0], zz], [X, r[0], zz + 1.7], [X, r[1], zz + 1.7], [X, r[1], zz]], css(lit([62, 68, 72], 'L', zz))));
    }
    fill3([[X, 0, z0], [X, 0, z1], [X, 0.7, z1], [X, 0.7, z0]], css(lit([104, 100, 92], 'L', 75)));
  }

  // ---------- Справа: ангар из профлиста (стена — попиксельно, по столбцам), ворота «СКЛАД 3» ----------
  const HG = { z0: 13, z1: 48, eave: 8.5 };
  const RIB = 0.2;   // шаг гофра (м)
  // яркость профиля трапециевидного гофра по фазе p ∈ [0, 1): гребень, грань к камере, впадина, грань от камеры
  function ribB(p) { return p < 0.2 ? 1.06 : p < 0.35 ? 1.12 : p < 0.85 ? 0.95 : 0.8; }
  function hangarWall() {
    const n = Tex.perlin(7501), n2 = Tex.perlin(7502), X0 = WALL_R;
    const bx = Math.floor(P(X0, 0, HG.z1)[0]) - 2, bxe = Math.ceil(P(X0, 0, HG.z0)[0]) + 1, bw = bxe - bx, bh = 650;
    const step = Math.max(2, 1 / K), w = Math.round(bw / step), h = Math.round(bh / step), sy = bh / h;
    const c = cnv(w, h), cc = c.getContext('2d'), img = cc.createImageData(w, h), d = img.data;
    const base = [138, 146, 148], poly = [176, 176, 164];
    for (let i = 0; i < w; i++) {
      const lx = bx + (i + 0.5) * bw / w, s = (lx - CX) / F;
      if (s <= 0.01) continue;
      const Z = X0 / s;
      if (Z < HG.z0 || Z > HG.z1) continue;
      // гофр с усреднением по ширине пикселя: где рёбра мельче 2–3 px, остаётся средний тон
      const du = Z * Z / (F * X0) * step, dp = du / RIB;
      let rb = 0;
      if (dp > 0.6) rb = 0.98;
      else for (let q = -1; q <= 1; q++) { const ph = (Z + q * du / 3) / RIB; rb += ribB(ph - Math.floor(ph)) / 3; }
      // листы по 1 м: свой оттенок, один заменён на новый, один — крашеный
      const sheet = Math.floor(Z), hs = hash2(sheet, 501);
      let br = base[0], bg = base[1], bb = base[2];
      if (hs < 0.08) { br = 160; bg = 166; bb = 166; } else if (hs > 0.94) { br = 104; bg = 124; bb = 138; }
      const tone = (0.93 + 0.1 * hash2(sheet, 77)) * rb;
      const rust = sm(0.25, 0.65, n(Z * 2.3, 1.7));   // столбцы с ржавыми подтёками от саморезов
      const fz = 1 - Math.exp(-Z / ZH), fk = FACE.Rt * (1 - fz);
      const hz0 = HAZE[0] * fz, hz1 = HAZE[1] * fz, hz2 = HAZE[2] * fz;
      const j0 = Math.max(0, Math.floor((CY - (HG.eave - EYE) * F / Z) / sy)), j1 = Math.min(h - 1, Math.ceil((CY + EYE * F / Z) / sy));
      for (let j = j0; j <= j1; j++) {
        const Y = EYE + (CY - (j + 0.5) * sy) * Z / F;
        if (Y < 0 || Y > HG.eave) continue;
        let r, g, b;
        if (Y < 0.55) { const q = 0.9 + 0.1 * n2(Z * 3, Y * 4); r = 112 * q; g = 110 * q; b = 104 * q; }
        else {
          const pc = Y > 6.9 && Y < 7.9;   // полоса светопрозрачного поликарбоната под карнизом
          const t = pc ? 1 : tone;
          r = (pc ? poly[0] : br) * t; g = (pc ? poly[1] : bg) * t; b = (pc ? poly[2] : bb) * t;
          // подтёки ржавчины ниже прогонов (через 1,6 м), грязь снизу, пятна
          const pur = (Y - 0.55) % 1.6, st = rust * sm(1.2, 0.05, pur) * 0.5;
          r += (112 - r) * st; g += (78 - g) * st; b += (60 - b) * st;
          const m = (1 - 0.3 * sm(1.6, 0.55, Y)) * (1 + 0.07 * n2(Z * 0.4, Y * 0.3)) * (1 - 0.1 * sm(7.4, 8.5, Y));
          r *= m; g *= m; b *= m;
          if (Math.abs(Y - 4.3) < 0.03) { r *= 0.75; g *= 0.75; b *= 0.75; }   // нахлёст листов
        }
        const k = (j * w + i) * 4;
        d[k] = r * fk + hz0; d[k + 1] = g * fk + hz1; d[k + 2] = b * fk + hz2; d[k + 3] = 255;
      }
    }
    cc.putImageData(img, 0, 0);
    put(c, bx, 0, bw, bh);
  }

  // торец ангара (к камере) — гофр вертикальными полосами, угловой нащельник, грязь снизу
  function hangarFront() {
    const Z = HG.z0, X0 = WALL_R, X1 = WALL_R + 3.2, top = 13;
    fill3([[X0, 0, Z], [X1, 0, Z], [X1, top, Z], [X0, top, Z]], css(lit([132, 140, 142], 'F', Z)));
    for (let X = X0; X < X1; X += RIB) {
      fill3([[X, 0.55, Z], [X + RIB * 0.22, 0.55, Z], [X + RIB * 0.22, top, Z], [X, top, Z]], css(lit([150, 158, 160], 'F', Z), 0.8));
      fill3([[X + RIB * 0.62, 0.55, Z], [X + RIB, 0.55, Z], [X + RIB, top, Z], [X + RIB * 0.62, top, Z]], css(lit([96, 102, 104], 'F', Z), 0.6));
    }
    fill3([[X0, 0, Z], [X1, 0, Z], [X1, 0.55, Z], [X0, 0.55, Z]], css(lit([110, 108, 102], 'F', Z)));
    const a = P(X0, 0.55, Z), b = P(X0, 2.2, Z), g = x.createLinearGradient(0, b[1], 0, a[1]);
    g.addColorStop(0, 'rgba(60,54,46,0)'); g.addColorStop(1, 'rgba(60,54,46,.45)');
    x.fillStyle = g; x.fillRect(a[0], b[1], P(X1, 0, Z)[0] - a[0], a[1] - b[1]);
    box(X0 - 0.06, X0 + 0.14, 0.55, top, Z - 0.08, Z, [158, 164, 164]);
    // водосток на углу, табличка «ПГ» (пожарный гидрант)
    box(X0 + 0.25, X0 + 0.39, 0.25, top, Z - 0.2, Z - 0.06, [124, 128, 128]);
    fill3([[X0 + 0.7, 2.0, Z - 0.01], [X0 + 1.3, 2.0, Z - 0.01], [X0 + 1.3, 2.45, Z - 0.01], [X0 + 0.7, 2.45, Z - 0.01]], css(lit([150, 58, 50], 'F', Z)));
    textF('ПГ', X0 + 1.0, 2.22, Z - 0.02, 0.24, css(lit([226, 222, 214], 'F', Z)));
  }
  function hangarDetails() {
    const X = WALL_R, zs = HG.z0, ze = HG.z1;
    // карниз со свесом и желоб
    box(X - 0.45, X, HG.eave, HG.eave + 0.3, zs, ze, [112, 116, 118]);
    box(X - 0.62, X - 0.45, HG.eave - 0.12, HG.eave + 0.12, zs, ze, [126, 130, 130]);
    // водостоки
    [zs + 0.35, 31.4, ze - 0.4].forEach(function (zz) {
      const a = P(X - 0.12, HG.eave, zz), b = P(X - 0.12, 0.25, zz), wpx = Math.max(1, F * 0.12 / zz);
      x.fillStyle = css(lit([120, 124, 124], 'Rt', zz)); x.fillRect(a[0] - wpx / 2, a[1], wpx, b[1] - a[1]);
      x.fillStyle = css(lit([80, 84, 84], 'Rt', zz), 0.7); x.fillRect(a[0] + wpx * 0.1, a[1], wpx * 0.35, b[1] - a[1]);
    });
    // секционные ворота: проём, полотно с филёнками, стойки в полоску
    const zg0 = 24, zg1 = 29.5, yg = 5.4;
    fill3([[X, 0, zg0], [X, 0, zg1], [X, yg, zg1], [X, yg, zg0]], css(lit([40, 40, 40], 'Rt', 26)));
    fill3([[X, 0, zg0], [X + 0.25, 0, zg0], [X + 0.25, yg, zg0], [X, yg, zg0]], css(lit([118, 122, 122], 'F', 24)));
    const gx = X + 0.24;
    fill3([[gx, 0.02, zg0], [gx, 0.02, zg1], [gx, yg, zg1], [gx, yg, zg0]], css(lit([86, 102, 114], 'Rt', 26.5)));
    x.beginPath();
    for (let y = 0.6; y < yg; y += 0.6) { const p = P(gx, y, zg0), q = P(gx, y, zg1); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    x.strokeStyle = css(lit([54, 64, 72], 'Rt', 26.5), 0.8); x.lineWidth = 1.2; x.stroke();
    fill3([[gx - 0.01, 2.6, 25.2], [gx - 0.01, 2.6, 28.3], [gx - 0.01, 3.1, 28.3], [gx - 0.01, 3.1, 25.2]], css(lit([60, 70, 76], 'Rt', 26.5), 0.8));
    box(X - 0.3, X, yg, yg + 0.45, zg0 - 0.2, zg1 + 0.2, [104, 108, 110]);
    [zg0 - 0.45, zg1 + 0.25].forEach(function (zz) {
      const r = 0.1, a = P(X - 0.4 - r, 1.15, zz), b = P(X - 0.4 + r, 0, zz), wpx = Math.max(1.5, b[0] - a[0]);
      for (let k = 0; k < 4; k++) {
        const y0 = k * 0.29, pa = P(X - 0.4, y0 + 0.29, zz), pb = P(X - 0.4, y0, zz);
        x.fillStyle = css(lit(k & 1 ? [38, 36, 34] : [180, 150, 54], 'Rt', zz)); x.fillRect(a[0], pa[1], wpx, pb[1] - pa[1] + 0.5);
      }
    });
    // калитка и вывеска
    fill3([[X, 0.1, 20.2], [X, 0.1, 21.2], [X, 2.2, 21.2], [X, 2.2, 20.2]], css(lit([70, 82, 92], 'Rt', 20.7)));
    box(X - 0.04, X, 5.95, 6.75, 24.6, 28.9, [196, 196, 188]);
    textS('СКЛАД 3', X - 0.045, 6.35, 24.9, 28.6, 0.5, css(lit([44, 48, 52], 'Rt', 26)));
    // крупная цифра на обшивке
    textS('3', X - 0.01, 4.6, 15.3, 17.6, 3.6, css(lit([206, 204, 192], 'Rt', 16), 0.75));
  }
  // верх ангара: жалюзийные решётки, настенные светильники, кабельный лоток, наружная лестница с площадкой
  function hangarExtra() {
    const X = WALL_R, Xi = X - 0.02;
    // жалюзийные решётки вентиляции: рамка, косые ламели, ржавый подтёк вниз
    [[13.7, 15.0, 5.7, 6.7], [36.5, 38.5, 5.7, 6.7]].forEach(function (v) {
      const zc = (v[0] + v[1]) / 2;
      const g = P(Xi, v[2], zc), gb = P(Xi, v[2] - 2.2, zc), gr = x.createLinearGradient(0, g[1], 0, gb[1]);
      gr.addColorStop(0, 'rgba(98,62,40,.4)'); gr.addColorStop(1, 'rgba(98,62,40,0)');
      fill3([[Xi, v[2] - 2.2, v[0] + 0.25], [Xi, v[2] - 2.2, v[1] - 0.35], [Xi, v[2], v[1] - 0.1], [Xi, v[2], v[0] + 0.1]], gr);
      box(X - 0.12, X, v[2], v[3], v[0], v[1], [92, 98, 100]);
      fill3([[X - 0.125, v[2] + 0.08, v[0] + 0.08], [X - 0.125, v[2] + 0.08, v[1] - 0.08], [X - 0.125, v[3] - 0.08, v[1] - 0.08], [X - 0.125, v[3] - 0.08, v[0] + 0.08]], css(lit([34, 36, 38], 'Rt', zc)));
      x.beginPath();
      for (let y = v[2] + 0.16; y < v[3] - 0.08; y += 0.12) { const p = P(X - 0.13, y, v[0] + 0.08), q = P(X - 0.13, y, v[1] - 0.08); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
      x.strokeStyle = css(lit([128, 134, 134], 'Rt', zc)); x.lineWidth = lw(0.045, zc, 1.5); x.stroke();
    });
    // кабельный лоток под карнизом на кронштейнах
    box(X - 0.4, X - 0.1, 7.55, 7.68, HG.z0, HG.z1, [96, 100, 100]);
    for (let z = HG.z0 + 0.8; z < HG.z1; z += 2.4) line3([X, 7.8, z], [X - 0.4, 7.55, z], lw(0.04, z, 1.4), css(lit([70, 74, 76], 'Rt', z)));
    // светильники на кронштейнах (тёплый плафон не горит — день)
    [19.0, 33.0, 43.0].forEach(function (z) {
      line3([X, 6.55, z], [X - 0.75, 6.4, z], lw(0.05, z, 1.8), css(lit([60, 64, 66], 'Rt', z)));
      box(X - 0.95, X - 0.55, 6.2, 6.42, z - 0.22, z + 0.22, [74, 78, 80]);
      box(X - 0.9, X - 0.6, 6.12, 6.2, z - 0.18, z + 0.18, [192, 190, 178]);
    });
    // наружная стальная лестница вдоль стены на площадку у двери (z 18 → 22, отметка 4,2 м)
    const s0 = 18.2, s1 = 21.9, yt = 4.2, xo = X - 1.0, sc = [72, 80, 86];
    fill3([[Xi, yt, s1 + 0.1], [Xi, yt, s1 + 1.2], [Xi, yt + 2.1, s1 + 1.2], [Xi, yt + 2.1, s1 + 0.1]], css(lit([62, 72, 80], 'Rt', 22.5)));
    fill3([[Xi - 0.01, yt + 1.2, s1 + 0.25], [Xi - 0.01, yt + 1.2, s1 + 0.45], [Xi - 0.01, yt + 1.3, s1 + 0.45], [Xi - 0.01, yt + 1.3, s1 + 0.25]], css(lit([30, 30, 30], 'Rt', 22.5)));
    box(xo, X, yt - 0.14, yt, s1, s1 + 1.6, sc);
    for (let k = 0; k < 14; k++) {
      const t = k / 14, z = lerp(s0, s1, t), yy = lerp(0, yt, t) + yt / 14;
      box(xo, X - 0.05, yy - 0.04, yy, z, z + (s1 - s0) / 14 + 0.06, [88, 94, 98]);
    }
    line3([xo, 0, s0], [xo, yt, s1], lw(0.12, 20, 2.5), css(lit(sc, 'F', 20)));
    [s1 + 0.05, s1 + 1.55].forEach((z) => line3([xo, 0, z], [xo, yt, z], lw(0.08, z, 2), css(lit(sc, 'F', z))));
    // наклонный поручень марша (жёлтый) со стойками
    const hc = css(lit([150, 132, 60], 'F', 20));
    line3([xo, 1.0, s0], [xo, yt + 1.1, s1], lw(0.05, 20, 2), hc);
    line3([xo, 0.5, s0], [xo, yt + 0.55, s1], lw(0.035, 20, 1.6), hc);
    for (let k = 0; k <= 3; k++) { const t = k / 3, z = lerp(s0, s1, t), yb = lerp(0, yt, t); line3([xo, yb, z], [xo, yb + 1.05, z], lw(0.05, z, 2), hc); }
    railing([[xo, s1], [xo, s1 + 1.6]], yt, 0.8, [150, 132, 60], 22.5);
  }
  // контейнеры на площадке за ангаром (видны в просвете у торца)
  function containers() {
    const C = [[10.4, 50.5, 0, [126, 60, 46]], [10.4, 50.5, 1, [66, 92, 116]], [10.6, 64, 0, [72, 96, 76]], [10.6, 64, 1, [150, 138, 116]],
      [10.6, 64, 2, [118, 66, 50]], [10.3, 78, 0, [116, 118, 114]], [10.3, 78, 1, [138, 110, 64]]];
    C.forEach(function (c) {
      const x0 = c[0], z0 = c[1], y0 = c[2] * 2.6, col = c[3];
      box(x0, x0 + 2.44, y0, y0 + 2.59, z0, z0 + 12.2, col);
      x.beginPath();
      for (let zz = z0 + 0.3; zz < z0 + 12.1; zz += 0.3) { const p = P(x0, y0 + 0.1, zz), q = P(x0, y0 + 2.5, zz); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
      x.strokeStyle = css(lit(mul(col, 0.75), 'Rt', z0 + 6), 0.5); x.lineWidth = 1; x.stroke();
    });
  }

  // ---------- Трубная эстакада над проездом ----------
  // горизонтальная труба вдоль X: центр на высоте yc, глубина Z, радиус r; свет сверху — низ темнее
  function pipeX(xa, xb, yc, Z, r, col, seams) {
    const a = P(xa, yc + r, Z), b = P(xb, yc - r, Z);
    const g = x.createLinearGradient(0, a[1], 0, b[1]);
    g.addColorStop(0, css(lit(mul(col, 1.1), 1, Z))); g.addColorStop(0.3, css(lit(col, 1, Z)));
    g.addColorStop(0.72, css(lit(mul(col, 0.7), 1, Z))); g.addColorStop(1, css(lit(mul(col, 0.48), 1, Z)));
    x.fillStyle = g; x.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    if (seams) {
      // листы кожуха чуть разного тона (замятые, заменённые), бандажи на стыках, подтёки снизу
      let k = 0;
      for (let X = xa; X < xb; X += seams, k++) {
        const t = hash2(k, Math.round(Z * 10)), p = P(X, yc + r, Z), q = P(Math.min(xb, X + seams), yc - r, Z);
        if (t < 0.35 || t > 0.8) { x.fillStyle = t < 0.35 ? 'rgba(40,38,34,' + (0.06 + 0.1 * t).toFixed(3) + ')' : 'rgba(230,230,224,.07)'; x.fillRect(p[0], p[1], q[0] - p[0], q[1] - p[1]); }
        if (t > 0.55 && t < 0.7) { const m = P(X, yc - r * 0.2, Z); x.fillStyle = 'rgba(96,70,50,.22)'; x.fillRect(p[0], m[1], q[0] - p[0], q[1] - m[1]); }
      }
      x.beginPath();
      for (let X = xa + seams; X < xb; X += seams) { const p = P(X, yc + r, Z), q = P(X, yc - r, Z); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
      x.strokeStyle = css(lit(mul(col, 0.62), 1, Z), 0.55); x.lineWidth = lw(0.025, Z, 1); x.stroke();
    }
  }
  const PB = { zf: 16.4, zb: 17.6, xa: -8.4, xb: 9.4, y0: 5.4, y1: 6.9 };
  function trussFace(Z, col, a) {
    const st = css(lit(col, 'F', Z), a), wd = lw(0.13, Z, 1.2);
    const seg = (p0, p1) => line3(p0, p1, wd, st);
    seg([PB.xa, PB.y0 + 0.1, Z], [PB.xb, PB.y0 + 0.1, Z]); seg([PB.xa, PB.y1 - 0.1, Z], [PB.xb, PB.y1 - 0.1, Z]);
    const n = 7, dx = (PB.xb - PB.xa) / n;
    for (let k = 0; k <= n; k++) {
      const X = PB.xa + dx * k;
      seg([X, PB.y0, Z], [X, PB.y1, Z]);
      if (k < n) seg(k < n / 2 ? [X, PB.y0, Z] : [X, PB.y1, Z], k < n / 2 ? [X + dx, PB.y1, Z] : [X + dx, PB.y0, Z]);
    }
  }
  function pipeBridge() {
    const st = [70, 78, 84], zf = PB.zf, zb = PB.zb;
    // задняя ферма и стойки (в глубине, чуть темнее)
    trussFace(zb, mul(st, 0.85));
    [PB.xa, PB.xb].forEach((X) => box(X - 0.16, X + 0.16, 0, PB.y1, zb - 0.16, zb + 0.16, st));
    // трубы: большая в изоляции, средняя в изоляции, жёлтый газопровод, ржавый паропровод
    pipeX(-9, 10, PB.y0 + 0.2 + 0.34, 17.15, 0.34, [142, 145, 143], 1.2);
    pipeX(-9, 10, 6.5, 17.05, 0.12, [100, 70, 56]);
    pipeX(-9, 10, PB.y0 + 0.2 + 0.22, 16.66, 0.22, [130, 133, 131], 1.0);
    pipeX(-9, 10, 6.45, 16.62, 0.14, [150, 128, 64]);
    // хомуты-опоры между узлами фермы и фланцы на газопроводе
    for (let k = 0; k < 7; k++) {
      const X = PB.xa + (PB.xb - PB.xa) * (k + 0.5) / 7;
      fill3([[X - 0.05, PB.y0 + 0.12, 16.6], [X + 0.05, PB.y0 + 0.12, 16.6], [X + 0.05, 6.62, 16.6], [X - 0.05, 6.62, 16.6]], css(lit([58, 62, 64], 'F', 16.6)));
      fill3([[X - 0.2, PB.y0 + 0.1, 16.6], [X + 0.2, PB.y0 + 0.1, 16.6], [X + 0.2, PB.y0 + 0.2, 16.6], [X - 0.2, PB.y0 + 0.2, 16.6]], css(lit([64, 70, 74], 'F', 16.6)));
      const fX = X + 1.1;
      fill3([[fX - 0.04, 6.27, 16.55], [fX + 0.04, 6.27, 16.55], [fX + 0.04, 6.63, 16.55], [fX - 0.04, 6.63, 16.55]], css(lit([120, 104, 54], 'F', 16.6)));
    }
    // передняя ферма, стойки с подкосами, опорные плиты
    trussFace(zf, st);
    [PB.xa, PB.xb].forEach(function (X) {
      box(X - 0.16, X + 0.16, 0, PB.y1 + 0.1, zf - 0.16, zf + 0.16, st);
      line3([X, 0.2, zf], [X, 2.4, zb], lw(0.08, 17), css(lit(st, 'F', 17)));
      box(X - 0.4, X + 0.4, 0, 0.25, zf - 0.4, zb + 0.4, [118, 116, 110]);
    });
    // ржавчина в узлах фермы и на стойках
    const rr = Tex.rng(7701);
    for (let k = 0; k < 14; k++) {
      const X = PB.xa + rr() * (PB.xb - PB.xa), y = PB.y0 + (rr() < 0.6 ? 0.05 : PB.y1 - PB.y0 - 0.15), p = P(X, y, zf - 0.1), q = P(X + 0.3 + rr() * 0.8, y - 0.12, zf - 0.1);
      x.fillStyle = 'rgba(104,66,44,' + (0.25 + rr() * 0.3).toFixed(3) + ')'; x.fillRect(p[0], p[1], q[0] - p[0], Math.max(1.5, q[1] - p[1]));
    }
    [PB.xa, PB.xb].forEach(function (X) {
      const p = P(X - 0.1, 0.9, zf - 0.17), q = P(X + 0.1, 0.25, zf - 0.17);
      x.fillStyle = 'rgba(100,64,44,.45)'; x.fillRect(p[0], p[1], q[0] - p[0], q[1] - p[1]);
    });
    // габаритная рама в косую полосу и табличка
    hazardF(zf - 0.2, 5.12, 5.42, -3.6, 3.6, 0.4);
    fill3([[-1.3, 4.72, zf - 0.21], [1.3, 4.72, zf - 0.21], [1.3, 5.08, zf - 0.21], [-1.3, 5.08, zf - 0.21]], css(lit([196, 194, 186], 'F', zf)));
    textF('ГАБАРИТ 4,5 м', 0, 4.9, zf - 0.22, 0.2, css(lit([34, 34, 34], 'F', zf)));
    // гильзы труб в стенах
    box(-9, -8.75, 5.5, 6.8, 16.35, 17.6, [96, 92, 86]);
  }
  // перила: стойки через шаг, поручень и средний пруток, бортовая полоса — по ломаной pts на высоте y0
  function railing(pts, y0, step, col, z) {
    const wr = (zz) => lw(0.05, zz, 2), c = css(lit(col, 'F', z)), cd = css(lit(mul(col, 0.7), 'F', z));
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / step));
      fill3([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y0 + 0.12, b[1]], [a[0], y0 + 0.12, a[1]]], cd);
      for (let k = 0; k <= n; k++) {
        const X = lerp(a[0], b[0], k / n), Z = lerp(a[1], b[1], k / n);
        line3([X, y0, Z], [X, y0 + 1.1, Z], wr(Z), c);
      }
      line3([a[0], y0 + 1.1, a[1]], [b[0], y0 + 1.1, b[1]], wr(Math.min(a[1], b[1])), c);
      line3([a[0], y0 + 0.58, a[1]], [b[0], y0 + 0.58, b[1]], lw(0.035, Math.min(a[1], b[1]), 1.6), c);
    }
  }
  // ходовой мостик по верху эстакады: решётчатый настил (видна изнанка), перила, лестница с ограждением
  function catwalk() {
    const st = [70, 78, 84], y = PB.y1 + 0.05, z0 = PB.zf - 0.85, z1 = PB.zf + 0.1, xa = PB.xa - 0.2, xb = PB.xb + 0.2;
    // изнанка настила: тёмная, с поперечными несущими полосами решётки
    fill3([[xa, y, z0], [xb, y, z0], [xb, y, z1], [xa, y, z1]], css(lit([46, 50, 52], 'B', 16)));
    x.beginPath();
    for (let X = xa; X <= xb; X += 0.45) { const p = P(X, y, z0), q = P(X, y, z1); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    x.strokeStyle = css(lit([96, 102, 104], 'B', 16), 0.55); x.lineWidth = 1.2; x.stroke();
    // кронштейны-консоли под настилом у каждого узла фермы
    for (let k = 0; k <= 7; k++) {
      const X = PB.xa + (PB.xb - PB.xa) * k / 7;
      line3([X, PB.y1 - 0.6, PB.zf], [X, y, z0 + 0.05], lw(0.06, 16, 1.5), css(lit(st, 'F', 16)));
    }
    // торцевая обвязка настила (швеллер) и перила по краю
    box(xa, xb, y, y + 0.16, z0, z0 + 0.06, mul(st, 1.15));
    railing([[xa, z0], [xb, z0]], y + 0.16, 1.27, [92, 100, 104], z0);
    railing([[xa, z0], [xa, z1 + 1.2]], y + 0.16, 0.7, [92, 100, 104], z0);
    // жёлтая полоса на поручне над проездом
    line3([-3.6, y + 1.27, z0], [3.6, y + 1.27, z0], lw(0.05, z0, 2), css(lit([186, 156, 52], 'F', z0), 0.9));
    // лестница с ограждением-клеткой на правой стойке
    const LX = PB.xb, LZ = PB.zf - 0.5, lx0 = LX - 0.22, lx1 = LX + 0.22, lc = [104, 108, 106];
    [lx0, lx1].forEach((X) => line3([X, 0.15, LZ], [X, y + 1.1, LZ], lw(0.05, LZ, 2), css(lit(lc, 'F', LZ))));
    x.beginPath();
    for (let yy = 0.45; yy < y; yy += 0.3) { const p = P(lx0, yy, LZ), q = P(lx1, yy, LZ); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    x.strokeStyle = css(lit(lc, 'F', LZ), 0.9); x.lineWidth = lw(0.03, LZ, 1.5); x.stroke();
    const cz = LZ - 0.38, hoop = (yy) => { const pts = []; for (let i = 0; i <= 12; i++) { const t = Math.PI * i / 12; pts.push([LX - 0.36 * Math.cos(t), yy, cz - 0.36 * Math.sin(t) + 0.0]); } return pts; };
    x.strokeStyle = css(lit(lc, 'F', LZ - 0.4)); x.lineWidth = lw(0.04, LZ, 1.8);
    for (let yy = 2.3; yy <= y + 1.0; yy += 0.75) {
      const h = hoop(yy).map((p) => P(p[0], p[1], p[2])); x.beginPath(); h.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
    }
    [0, Math.PI / 2, Math.PI].forEach((t) => line3([LX - 0.36 * Math.cos(t), 2.3, cz - 0.36 * Math.sin(t)], [LX - 0.36 * Math.cos(t), y + 1.0, cz - 0.36 * Math.sin(t)], lw(0.03, LZ, 1.5), css(lit(lc, 'F', LZ), 0.85)));
  }
  // перила на козырьке рампы (служебная площадка у двери второго этажа)
  function dockRail() {
    const X = WALL_L, y = 5.86;
    railing([[X, 24.0], [X + 2.3, 24.0], [X + 2.3, 30.0], [X, 30.0]], y, 1.0, [74, 80, 84], 27);
  }

  // ---------- Фонари и провода ----------
  // провод между точками a и b (м) с провисом sag; толщина t (м), но не тоньше 2,4 px вблизи и 1,5 px вдали —
  // иначе после размытия фона провода пропадают
  function wire(a, b, sag, t, col) {
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const k = i / 28, Z = lerp(a[2], b[2], k);
      pts.push(P(lerp(a[0], b[0], k), lerp(a[1], b[1], k) - sag * 4 * k * (1 - k), Z).concat(Z));
    }
    x.strokeStyle = col; x.lineJoin = 'round'; x.lineCap = 'round';
    for (let i = 0; i < pts.length - 1; i += 4) {
      const j = Math.min(pts.length - 1, i + 4), zm = (pts[i][2] + pts[j][2]) / 2;
      x.beginPath(); x.moveTo(pts[i][0], pts[i][1]);
      for (let k = i + 1; k <= j; k++) x.lineTo(pts[k][0], pts[k][1]);
      x.lineWidth = Math.max(lerp(2.4, 1.5, sm(12, 60, zm)), F * t / zm); x.stroke();
    }
  }
  // кронштейн с фарфоровыми изоляторами на стене X = const (s = +1 — стена слева, −1 — справа)
  function insulators(X, Y, z0, z1, s) {
    box(Math.min(X, X + 0.5 * s), Math.max(X, X + 0.5 * s), Y - 0.06, Y, z0 - 0.08, z1 + 0.08, [64, 66, 66]);
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 2 || 1) box(X + 0.42 * s - 0.035, X + 0.42 * s + 0.035, Y, Y + 0.12, z - 0.035, z + 0.035, [178, 172, 160]);
  }
  // бетонная опора с консольным светильником над проездом
  const LAMPS = [[7.0, 33], [7.0, 62]];
  function lampPost(X, Z, on) {
    const conc = [132, 130, 124];
    const a = P(X - 0.14, 9.6, Z), b = P(X + 0.14, 0, Z), t = P(X - 0.09, 9.6, Z);
    const g = x.createLinearGradient(a[0], 0, b[0], 0);
    g.addColorStop(0, css(lit(mul(conc, 0.7), 1, Z))); g.addColorStop(0.6, css(lit(conc, 1, Z))); g.addColorStop(1, css(lit(mul(conc, 0.82), 1, Z)));
    poly2([[a[0], b[1]], [b[0], b[1]], [t[0] + (b[0] - a[0]) * 0.68, t[1]], [t[0], t[1]]]); x.fillStyle = g; x.fill();
    // кронштейн, светильник «кобра»
    line3([X, 9.0, Z], [X - 1.9, 9.45, Z], lw(0.06, Z, 1.2), css(lit([66, 70, 72], 'F', Z)));
    line3([X, 8.4, Z], [X - 1.1, 9.25, Z], lw(0.04, Z, 1), css(lit([66, 70, 72], 'F', Z)));
    box(X - 2.55, X - 1.75, 9.32, 9.55, Z - 0.17, Z + 0.17, [92, 96, 98]);
    fill3([[X - 2.5, 9.32, Z - 0.13], [X - 1.85, 9.32, Z - 0.13], [X - 1.85, 9.32, Z + 0.13], [X - 2.5, 9.32, Z + 0.13]],
      css(on ? [236, 222, 186] : lit([150, 152, 148], 1, Z)));
    // таблички-номера на опоре
    fill3([[X - 0.12, 2.3, Z - 0.15], [X + 0.12, 2.3, Z - 0.15], [X + 0.12, 2.6, Z - 0.15], [X - 0.12, 2.6, Z - 0.15]], css(lit([200, 200, 194], 'F', Z)));
  }
  function wires() {
    const col = (z) => css(fog([38, 40, 42], z), 0.92);
    // питание ангара: три фазы со стены цеха (кронштейн с изоляторами) к карнизу ангара — провис над проездом
    insulators(-9, 11.55, 23.8, 24.2, 1);
    insulators(WALL_R, 8.15, 21.4, 22.0, -1);
    [[23.8, 21.4, 1.6], [24.0, 21.7, 1.68], [24.2, 22.0, 1.76]].forEach((w) => wire([-8.58, 11.67, w[0]], [9.58, 8.27, w[1]], w[2], 0.022, col(23)));
    // верхняя линия связи под карнизом цеха и слаботочка ниже
    box(-9, -8.62, 12.5, 12.58, 28.3, 28.5, [60, 62, 62]);
    wire([-8.66, 12.56, 28.4], [9.58, 8.6, 26.0], 1.8, 0.016, col(27));
    box(-9, -8.7, 10.02, 10.1, 36.1, 36.3, [60, 62, 62]);
    wire([-8.74, 10.08, 36.2], [9.58, 7.9, 39.5], 1.1, 0.016, col(38));
    // линия на опорах фонарей, отвод к цеху, к крану; спуски с карниза ангара к фонарям
    wire([7.0, 9.1, LAMPS[0][1]], [7.0, 9.1, LAMPS[1][1]], 0.7, 0.02, col(48));
    wire([7.0, 8.7, LAMPS[0][1]], [-8.95, 9.2, 39.6], 1.3, 0.02, col(36));
    wire([7.0, 9.1, LAMPS[1][1]], [7.6, 10.5, 84], 0.6, 0.02, col(70));
    wire([9.58, 8.55, 31.0], [7.06, 9.05, LAMPS[0][1]], 0.22, 0.016, col(32));
    wire([9.58, 8.55, 46.6], [7.06, 9.05, LAMPS[1][1]], 0.5, 0.016, col(54));
    // кабель по фасаду цеха на крюках под пояском: короткие провисы между крюками
    x.strokeStyle = css(fog([34, 34, 34], 30), 0.9); x.lineJoin = 'round'; x.lineCap = 'round';
    for (let z = 18.6; z < 52; z += 1.6) {
      x.beginPath();
      for (let i = 0; i <= 6; i++) { const k = i / 6, p = P(-8.74, 4.95 - 0.07 * 4 * k * (1 - k), z + 1.6 * k); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }
      x.lineWidth = Math.max(lerp(2.2, 1.4, sm(18, 50, z)), F * 0.024 / z); x.stroke();
      const h = P(-8.74, 4.95, z); x.fillStyle = css(fog([30, 30, 30], z)); x.fillRect(h[0] - 1, h[1] - 2, 2, 3);
    }
  }

  // ---------- Детали земли (векторно): швы плит, сколы, трещины, люк, решётка, разметка, трава ----------
  function gQuad(x0, x1, z0, z1, style) { fill3([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], style); }
  function gRing(X, Z, r, n) {
    x.beginPath();
    for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2, p = P(X + Math.cos(t) * r, 0, Z + Math.sin(t) * r); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }
    x.closePath();
  }
  function gLine(pts, wM, col, z) {
    x.beginPath();
    pts.forEach((p, i) => { const s = P(p[0], 0, p[1]); if (i) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); });
    x.strokeStyle = col; x.lineWidth = Math.max(0.8, F * wM / z); x.lineJoin = 'round'; x.stroke();
  }
  // лента на земле вдоль ломаной pts ([X, Z]) между смещениями a..b по нормали (нормаль — +X при движении вглубь).
  // col — строка (одна заливка) или функция глубины: тогда кусками с перекрытием, без швов
  function gStrip(pts, a, b, col) {
    const n = pts.length, A = [], B = [];
    for (let i = 0; i < n; i++) {
      const p = pts[Math.max(0, i - 1)], q = pts[Math.min(n - 1, i + 1)];
      let dx = q[0] - p[0], dz = q[1] - p[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      A.push(P(pts[i][0] + dz * a, 0, pts[i][1] - dx * a)); B.push(P(pts[i][0] + dz * b, 0, pts[i][1] - dx * b));
    }
    const piece = (s, e, style) => {
      x.beginPath(); x.moveTo(A[s][0], A[s][1]);
      for (let i = s + 1; i <= e; i++) x.lineTo(A[i][0], A[i][1]);
      for (let i = e; i >= s; i--) x.lineTo(B[i][0], B[i][1]);
      x.closePath(); x.fillStyle = style; x.fill();
    };
    if (typeof col === 'string') { piece(0, n - 1, col); return; }
    for (let s = 0; s < n - 1;) {
      let e = s + 1;
      while (e < n - 1 && e - s < 10 && pts[e][1] < pts[s][1] * 1.5 + 0.4) e++;
      piece(s, Math.min(n - 1, e + 1), col((pts[s][1] + pts[e][1]) / 2));
      s = e;
    }
  }
  // ---------- Рельсовый путь, утопленный в плиты: к воротам «ЦЕХ 1» и веткой в ворота «СКЛАД 3» ----------
  const TRK = -1.2, GA = 0.76, BR = { z0: 15.55, R: 11.2 };   // ось пути, полуколея 1520 мм, начало и радиус ветки
  // рельс: ржавая наружная кромка, головка, накатанная полоса (светлая — в ней небо), тёмный желоб изнутри
  function rail(pts, s) {
    gStrip(pts, -0.075 * s, -0.034 * s, (z) => css(fog([78, 60, 47], z)));
    gStrip(pts, -0.036 * s, 0.036 * s, (z) => css(fog([128, 126, 121], z)));
    gStrip(pts, -0.014 * s, 0.028 * s, (z) => css(fog([196, 198, 196], z)));
    gStrip(pts, 0.034 * s, 0.088 * s, (z) => css(fog([28, 27, 26], z)));
    gStrip(pts, 0.086 * s, 0.108 * s, (z) => css(fog([104, 90, 74], z)));
  }
  function tracks() {
    const main = [];
    for (let z = 2.6; z < 99.6; z = Math.min(99.6, z * 1.1)) main.push([0, z]);
    main.push([0, 99.6]);
    rail(main.map((p) => [TRK - GA, p[1]]), 1);
    rail(main.map((p) => [TRK + GA, p[1]]), -1);
    // ветка: дуга от главного пути до стены ангара; у ворот — короткая прямая
    const arc = (r) => { const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30 * Math.PI / 2; pts.push([TRK + BR.R - r * Math.cos(t), BR.z0 + r * Math.sin(t)]); } return pts; };
    const o = arc(BR.R + GA), q = arc(BR.R - GA);
    o.push([WALL_R + 0.24, o[o.length - 1][1]]); q.push([WALL_R + 0.24, q[q.length - 1][1]]);
    rail(o, 1); rail(q, -1);
  }
  // поперечный водоотводный лоток с чугунной решёткой; на переезде через путь — рифлёный стальной лист
  const DRN = { z0: 4.7, z1: 5.0 };
  function drain() {
    const z0 = DRN.z0, z1 = DRN.z1, zm = (z0 + z1) / 2, c = (col, a) => css(fog(col, zm), a);
    gQuad(-ROAD - 0.6, ROAD + 0.6, z0 - 0.09, z1 + 0.09, c([94, 92, 87]));
    gQuad(-ROAD - 0.6, ROAD + 0.6, z0 - 0.03, z0 + 0.012, c([128, 126, 120]));
    gQuad(-ROAD - 0.6, ROAD + 0.6, z1 - 0.012, z1 + 0.03, c([104, 100, 94]));
    const xa = TRK - GA - 0.3, xb = TRK + GA + 0.3;
    for (let X = -ROAD - 0.6; X < ROAD + 0.6 - 0.01; X += 1) {
      const t = hash2(Math.round(X * 10) + 40, 77), e = X + 1;
      if (e > xa && X < xb) continue;
      if (t < 0.1) { gQuad(X + 0.02, e - 0.02, z0 + 0.012, z1 - 0.012, c([26, 26, 25])); continue; }   // секции нет — провал
      gQuad(X + 0.02, e - 0.02, z0 + 0.012, z1 - 0.012, c(t > 0.86 ? [76, 64, 54] : [62, 60, 56]));
      for (let k = 0; k < 13; k++) { const xs = X + 0.07 + k * 0.068; gQuad(xs, xs + 0.034, z0 + 0.05, z1 - 0.05, c([22, 22, 21])); }
      if (t > 0.55 && t < 0.66) gQuad(X + 0.1, X + 0.45, z0 + 0.02, z1 - 0.02, c([100, 95, 84], 0.7));   // нанесло песка
    }
    gQuad(xa, xb, z0 - 0.06, z1 + 0.06, c([104, 101, 96]));
    for (let X = xa + 0.05; X < xb - 0.05; X += 0.09) gQuad(X, X + 0.03, z0 - 0.03, z1 + 0.03, c([132, 128, 122], 0.45));
    gQuad(xa, xb, z0 - 0.06, z0 - 0.04, c([60, 56, 50], 0.8));
  }
  // пятно масла/мазута: чёткий неровный край, плотная середина, брызги рядом
  function stain(X, Z, rx, rz, seed, a) {
    const rr = Tex.rng(seed), f1 = rr() * 6, f2 = rr() * 6, f3 = rr() * 6;
    const blob = (k, cx, cz) => {
      x.beginPath();
      for (let i = 0; i < 30; i++) {
        const t = i / 30 * Math.PI * 2, m = k * (1 + 0.22 * Math.sin(2 * t + f1) + 0.13 * Math.sin(5 * t + f2) + 0.07 * Math.sin(9 * t + f3));
        const p = P(cx + Math.cos(t) * rx * m, 0, cz + Math.sin(t) * rz * m);
        if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]);
      }
      x.closePath(); x.fill();
    };
    x.fillStyle = css(fog([34, 31, 27], Z), a); blob(1, X, Z);
    x.fillStyle = css(fog([24, 22, 20], Z), a * 0.7); blob(0.55, X + rx * 0.1, Z - rz * 0.05);
    for (let k = 0; k < 4; k++) blob(0.12 + rr() * 0.1, X + (rr() - 0.5) * rx * 3, Z + (rr() - 0.5) * rz * 3);
  }
  // трещина с ответвлениями: тёмная щель и светлая кромка скола с дальней стороны; ширина убывает к концам
  function crack(rr, cx, cz, a, len, w, depth) {
    const pts = [[cx, cz]], N = 14;
    // общее направление гуляет плавно, а на каждом шаге — мелкий излом: щель идёт зигзагом
    for (let i = 0; i < N; i++) { a += (rr() - 0.5) * 0.5; const zz = (rr() - 0.5) * 1.6; cx += Math.cos(a + zz) * len / N; cz += Math.sin(a + zz) * len / N; pts.push([cx, cz]); }
    const z = pts[0][1], px = F * w / z;
    if (px < 0.7) return;
    // грязь в трещине шире самой щели — куст трещин читается и после размытия
    gLine(pts, w * 3, css(fog([66, 62, 56], z), 0.2), z);
    gLine(pts.map((p) => [p[0], p[1] + w * 0.9]), w * 0.9, css(fog([172, 168, 158], z), 0.45), z);
    gLine(pts, Math.max(w, 1.6 * z / F * sm(14, 8, z)), css(fog([52, 49, 45], z), 0.8), z);
    if (depth > 0) {
      const nb = 1 + Math.floor(rr() * 2.2);
      for (let k = 0; k < nb; k++) {
        const b = pts[2 + Math.floor(rr() * (N - 2))];
        crack(rr, b[0], b[1], a + (rr() < 0.5 ? 1 : -1) * (0.5 + rr() * 0.7), len * (0.35 + rr() * 0.25), w * 0.62, depth - 1);
      }
    }
  }
  // скол кромки плиты у шва: выбитый бетон с тенью у ближнего края и светлой гранью у дальнего
  function spall(X, Z, lx, lz, seed) {
    const rr = Tex.rng(seed), pts = [];
    for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; pts.push([X + Math.cos(t) * lx * (0.7 + 0.45 * rr()), Z + Math.sin(t) * lz * (0.7 + 0.45 * rr())]); }
    const path = () => { x.beginPath(); pts.forEach((p, i) => { const s = P(p[0], 0, p[1]); if (i) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); }); x.closePath(); };
    path(); x.fillStyle = css(fog([84, 80, 72], Z)); x.fill();
    gLine(pts.slice(7, 12).concat([pts[0]]), 0.02, css(fog([164, 160, 150], Z), 0.8), Z);
    gLine(pts.slice(1, 6), 0.025, css(fog([42, 40, 36], Z), 0.75), Z);
    for (let k = 0; k < 7; k++) { const p = P(X + (rr() - 0.5) * lx, 0.002, Z + (rr() - 0.5) * lz), s = Math.max(1.2, F * 0.025 / Z); x.fillStyle = css(fog(rr() < 0.5 ? [140, 134, 124] : [56, 54, 50], Z)); x.fillRect(p[0] - s / 2, p[1] - s / 3, s, s * 0.6); }
  }
  function groundDetail() {
    const rr = Tex.rng(7601), n = Tex.perlin(7602);
    const jc = (z) => css(fog([60, 56, 48], z), 0.72);
    // продольные швы: у каждой плиты свой небольшой сдвиг — шов идёт ломаной, как на старой дороге
    for (let b = 0; b <= NSL; b++) {
      const X0 = -ROAD + b * SLW, off = slabOff(Math.min(b, NSL - 1));
      for (let j = Math.floor((3 - off) / SLL); off + j * SLL < 98; j++) {
        const z0 = Math.max(3, off + j * SLL), z1 = Math.min(98, off + (j + 1) * SLL), jx = X0 + (hash2(b + 7, j) - 0.5) * 0.08;
        for (let z = z0; z < z1; z *= 1.25) gQuad(jx - 0.022, jx + 0.022, z, Math.min(z1, z * 1.25), jc(z));
      }
    }
    // поперечные швы, сколы на некоторых углах плит у камеры
    for (let si = 0; si < NSL; si++) {
      const off = slabOff(si), x0 = -ROAD + SLW * si;
      for (let j = Math.ceil((3 - off) / SLL); off + j * SLL < 98; j++) {
        const z = off + j * SLL;
        gQuad(x0, x0 + SLW, z - 0.022, z + 0.022, jc(z));
        if (z < 26) for (let q = 0; q < 2; q++) {
          if (rr() > 0.45) continue;
          const cx = x0 + (q ? SLW : 0), cz = z, s = 0.06 + rr() * 0.1, pts = [];
          for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; pts.push(P(cx + Math.cos(a) * s * (0.6 + rr() * 0.6), 0, cz + Math.sin(a) * s * (0.6 + rr() * 0.6))); }
          poly2(pts); x.fillStyle = css(fog([76, 72, 64], z), 0.55); x.fill();
        }
      }
    }
    // заплатки из асфальта: вырезаны пилой почти прямоугольно, углы выкрошены; битумный шов, щебень в асфальте
    [[1.6, 3.85, 0.55, 0.36], [-4.0, 7.4, 0.6, 0.85], [-4.7, 9.9, 0.65, 0.55], [1.9, 14.8, 0.9, 0.8], [-2.9, 20.4, 0.6, 1.3], [3.6, 28, 0.8, 1.5]].forEach(function (pc) {
      const pts = [], cr = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let s = 0; s < 4; s++) {
        const a = cr[s], b = cr[(s + 1) % 4];
        for (let i = 0; i < 5; i++) {
          const t = i / 5, j = i ? 0.03 : 0.12;
          pts.push(P(pc[0] + (a[0] + (b[0] - a[0]) * t + j * (rr() - 0.5)) * pc[2], 0, pc[1] + (a[1] + (b[1] - a[1]) * t + j * (rr() - 0.5)) * pc[3]));
        }
      }
      poly2(pts); x.fillStyle = css(fog([92, 91, 88], pc[1])); x.fill();
      if (pc[1] < 12) {
        x.save(); x.clip();
        for (let k = 0; k < 40; k++) {
          const p = P(pc[0] + (rr() - 0.5) * pc[2] * 2, 0, pc[1] + (rr() - 0.5) * pc[3] * 2), s = F * (0.014 + rr() * 0.016) / pc[1];
          x.fillStyle = css(fog(rr() < 0.5 ? [122, 120, 114] : [64, 63, 60], pc[1]), 0.7); x.fillRect(p[0] - s / 2, p[1] - s / 4, s, s / 2);
        }
        x.restore();
      }
      poly2(pts); x.strokeStyle = css(fog([40, 39, 37], pc[1]), 0.55); x.lineWidth = Math.max(1, F * 0.02 / pc[1]); x.lineJoin = 'miter'; x.stroke();
    });
    // крупные сколы кромок плит у поперечных швов вблизи (мимо рельсов)
    for (let si = 0; si < NSL; si++) {
      const off = slabOff(si), x0 = -ROAD + SLW * si;
      for (let j = Math.ceil((3.2 - off) / SLL); off + j * SLL < 17; j++) {
        const z = off + j * SLL, sx = x0 + 0.3 + hash2(si, j + 301) * (SLW - 0.6), lx = 0.16 + 0.2 * hash2(si, j + 302);
        if (hash2(si, j + 300) > 0.8 || Math.abs(sx - TRK + GA) < lx + 0.15 || Math.abs(sx - TRK - GA) < lx + 0.15) continue;
        spall(sx, z + 0.03, lx, 0.07 + 0.06 * hash2(si, j + 303), 7650 + si * 10 + j);
      }
    }
    // масляные пятна: на стоянке погрузчика, в колее, у бочек
    [[3.5, 6.0, 0.5, 0.32, 0.5], [0.5, 8.6, 0.3, 0.2, 0.42], [4.4, 9.8, 0.42, 0.3, 0.45], [7.0, 20.4, 0.5, 0.4, 0.5],
      [5.8, 23.6, 0.4, 0.5, 0.4], [-2.7, 13.4, 0.35, 0.3, 0.38], [1.4, 24.5, 0.6, 0.5, 0.35], [3.0, 40, 0.8, 1.0, 0.3]]
      .forEach((s, i) => stain(s[0], s[1], s[2], s[3], 7660 + i, s[4]));
    // следы шин: грузовик идёт правой полосой и сворачивает в ворота склада; погрузчик — к своей стоянке
    const tyre = (path, off, w, a) => {
      gStrip(path, off - w / 2, off + w / 2, css(fog([44, 42, 38], 12), a));
      gStrip(path, off - w / 2, off - w / 2 + 0.035, css(fog([34, 32, 30], 12), a));
      gStrip(path, off + w / 2 - 0.035, off + w / 2, css(fog([34, 32, 30], 12), a));
    };
    const tp = [];
    for (let z = 2.6; z < 19.3; z *= 1.12) tp.push([2.55, z]);
    for (let i = 0; i <= 20; i++) { const t = i / 20 * Math.PI / 2; tp.push([10 - 7.45 * Math.cos(t), 19.3 + 7.45 * Math.sin(t)]); }
    tyre(tp, -0.95, 0.3, 0.2); tyre(tp, 0.95, 0.3, 0.2);
    const fp = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16, u = 1 - t; fp.push([u * u * 4.0 + 2 * u * t * 4.9 + t * t * 7.12, u * u * 11.0 + 2 * u * t * 19.0 + t * t * 21.2]); }
    tyre(fp, -0.42, 0.2, 0.18); tyre(fp, 0.42, 0.2, 0.18);
    // трещины — кустами: ствол с ответвлениями, 2–5 px вблизи
    for (let k = 0; k < 16; k++) {
      const z0 = 3.4 + Math.pow(rr(), 1.5) * 26, x0 = -5.4 + rr() * 10.8, a0 = rr() * Math.PI * 2, ln = 0.5 + rr() * 1.0, w0 = 0.012 + rr() * 0.008;
      if (Math.abs(x0 - TRK) < GA + 0.4 || (z0 > DRN.z0 - 0.8 && z0 < DRN.z1 + 0.8)) continue;
      crack(rr, x0, z0, a0, ln, w0, 2);
    }
    // лоток и рельсы — поверх всего, что лежит в плитах
    drain();
    tracks();
    // люк: бетонное кольцо, чугунная крышка с рельефом
    const MX = 2.6, MZ = 7.6;
    gRing(MX, MZ, 0.46, 36); x.fillStyle = css(fog([98, 96, 90], MZ)); x.fill();
    gRing(MX, MZ, 0.36, 36); x.fillStyle = css(fog([58, 56, 52], MZ)); x.fill();
    gRing(MX, MZ, 0.3, 36); x.strokeStyle = css(fog([92, 88, 80], MZ), 0.8); x.lineWidth = 1.2; x.stroke();
    gRing(MX, MZ, 0.17, 28); x.stroke();
    for (let i = 0; i < 8; i++) { const t = i / 8 * Math.PI * 2; gLine([[MX + Math.cos(t) * 0.17, MZ + Math.sin(t) * 0.17], [MX + Math.cos(t) * 0.3, MZ + Math.sin(t) * 0.3]], 0.012, css(fog([90, 86, 78], MZ), 0.7), MZ); }
    // ливневая решётка у края проезда
    gQuad(-6.55, -5.95, 11.2, 12.1, css(fog([70, 68, 64], 12)));
    for (let z = 11.28; z < 12.05; z += 0.09) gQuad(-6.5, -6.0, z, z + 0.04, css(fog([22, 22, 22], 12)));
    // разметка: пешеходная дорожка вдоль цеха — две выцветшие жёлтые линии, местами стёрты (лоток не красят)
    [[-5.8, -5.62], [-4.44, -4.26]].forEach(function (ln, li) {
      for (let z = 3.2; z < 92; z *= 1.05) {
        const a = 0.5 + 0.32 * n(z * 0.25, 1.5 + li * 4), z1 = z * 1.05;
        if (a > 0.32 && (z1 < DRN.z0 - 0.1 || z > DRN.z1 + 0.1)) gQuad(ln[0], ln[1], z, z1, css(fog([168, 148, 72], z), a));
      }
    });
    // заштрихованный «карман» у ворот склада: рамка и косые полосы
    const hz = [6.3, 9.7, 23.4, 30.1], yc = (z, a) => css(fog([170, 150, 74], z), a);
    gQuad(hz[0], hz[0] + 0.12, hz[2], hz[3], yc(26, 0.5)); gQuad(hz[0], hz[1], hz[2], hz[2] + 0.12, yc(23, 0.5));
    x.save(); fill3([[hz[0], 0, hz[2]], [hz[1], 0, hz[2]], [hz[1], 0, hz[3]], [hz[0], 0, hz[3]]], 'rgba(0,0,0,0)'); x.clip();
    for (let z = hz[2] - 4; z < hz[3]; z += 0.9) {
      fill3([[hz[0], 0, z], [hz[0], 0, z + 0.25], [hz[1], 0, z + 0.25 + 3.4], [hz[1], 0, z + 3.4]], yc(z + 2, 0.36 + 0.15 * n(z, 3.3)));
    }
    x.restore();
    // обломки кирпича и щебень у стен и у штабелей
    for (let k = 0; k < 40; k++) {
      const z = 5 + Math.pow(rr(), 1.4) * 20, left = rr() < 0.6;
      const X = left ? -8.95 + rr() * 1.6 : 8.6 + rr() * 1.3, s = 0.03 + rr() * 0.07, pts = [];
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + rr() * 0.5; pts.push(P(X + Math.cos(a) * s * (0.7 + rr() * 0.5), s * 0.4 * (Math.sin(a) > 0 ? 1 : 0), z + Math.sin(a) * s * 0.8)); }
      poly2(pts); x.fillStyle = css(fog(rr() < 0.45 ? [112, 62, 50] : [116, 112, 104], z), 0.9); x.fill();
    }
    // трава в швах и у стен вблизи
    for (let k = 0; k < 70; k++) {
      const z = 4 + Math.pow(rr(), 1.5) * 22, side = rr();
      const X = side < 0.35 ? -8.9 + rr() * 0.5 : side < 0.55 ? 9.5 + rr() * 0.4 : -ROAD + SLW * Math.floor(rr() * (NSL + 1)) + (rr() - 0.5) * 0.1;
      const b = P(X, 0, z), hpx = F * (0.06 + rr() * 0.1) / z, nb = 4 + Math.floor(rr() * 4);
      x.strokeStyle = css(fog(rr() < 0.5 ? [86, 92, 58] : [112, 104, 70], z), 0.85); x.lineWidth = Math.max(0.8, F * 0.008 / z); x.lineCap = 'round';
      x.beginPath();
      for (let i = 0; i < nb; i++) { const ox = (rr() - 0.5) * hpx * 1.2; x.moveTo(b[0] + ox * 0.3, b[1]); x.quadraticCurveTo(b[0] + ox * 0.6, b[1] - hpx * 0.6, b[0] + ox, b[1] - hpx * (0.6 + rr() * 0.4)); }
      x.stroke();
    }
  }

  // ---------- Тени: мягкие падающие (свет справа сверху сквозь облака) и контактные (AO) ----------
  const SHX = -0.55, SHZ = 0.25;   // смещение тени на земле на 1 м высоты
  // маска (чёрное — тень) → размытие → окраска → умножение на уже нарисованную землю
  function shadeMul(m, alpha, blurPx, tint) {
    const b = cnv(m.width, m.height), bx = b.getContext('2d');
    bx.fillStyle = '#fff'; bx.fillRect(0, 0, b.width, b.height);
    bx.globalAlpha = alpha; bx.filter = 'blur(' + Math.max(0.5, blurPx * K).toFixed(2) + 'px)'; bx.drawImage(m, 0, 0);
    bx.filter = 'none'; bx.globalAlpha = 1; bx.globalCompositeOperation = 'screen';
    bx.fillStyle = tint; bx.fillRect(0, 0, b.width, b.height);
    // только полоса земли: выше горизонта теней нет
    const y0 = Math.floor((CY - 4) / H * b.height);
    x.save(); x.globalCompositeOperation = 'multiply'; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'low';
    x.drawImage(b, 0, y0, b.width, b.height - y0, 0, y0 * H / b.height, W, H - y0 * H / b.height); x.restore();
  }
  function maskCtx(res) {
    const c = cnv(W * K * res, H * K * res), s = c.getContext('2d');
    s.setTransform(c.width / W, 0, 0, c.height / H, 0, 0); s.fillStyle = '#000';
    const poly = (pts) => { s.beginPath(); pts.forEach((q, i) => { const p = P(q[0], 0, q[1]); if (i) s.lineTo(p[0], p[1]); else s.moveTo(p[0], p[1]); }); s.closePath(); s.fill(); };
    return { c: c, s: s, poly: poly, rect: (x0, x1, z0, z1) => poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) };
  }
  // тень вертикального отрезка (столб) высотой h из точки (X, Z) — полоса на земле
  const stripS = (X, Z, h, w) => [[X - w, Z], [X + w, Z], [X + w + h * SHX, Z + h * SHZ], [X - w + h * SHX, Z + h * SHZ]];
  const PROPS_S = [];   // тени предметов первого плана: [x0, x1, z0, z1, h]
  function shadows() {
    const m = maskCtx(0.25);
    // ангар: тень стены и карниза ложится на правую половину проезда
    const e = HG.eave;
    m.poly([[WALL_R, HG.z0], [WALL_R + e * SHX, HG.z0 + e * SHZ], [WALL_R + e * SHX, HG.z1 + e * SHZ], [WALL_R, HG.z1]]);
    // эстакада: полоса поперёк проезда
    const ym = (PB.y0 + PB.y1) / 2;
    m.poly([[PB.xa + ym * SHX, PB.zf + ym * SHZ], [PB.xb + ym * SHX, PB.zf + ym * SHZ], [PB.xb + ym * SHX, PB.zb + ym * SHZ], [PB.xa + ym * SHX, PB.zb + ym * SHZ]]);
    [PB.xa, PB.xb].forEach((X) => m.poly(stripS(X, PB.zf, PB.y1, 0.16)));
    LAMPS.forEach((l) => m.poly(stripS(l[0], l[1], 9.6, 0.13)));
    PROPS_S.forEach((p) => m.poly([[p[0], p[2]], [p[1], p[2]], [p[1] + p[4] * SHX, p[3] + p[4] * SHZ], [p[0] + p[4] * SHX, p[3] + p[4] * SHZ]]));
    shadeMul(m.c, 0.34, 9, 'rgb(40,46,56)');
    // контактные тени у оснований стен и предметов
    const a = maskCtx(0.5);
    a.rect(WALL_L, WALL_L + 0.7, L1.z0, L1.z1); a.rect(-9.5, -9.1, 54, 97);
    a.rect(WALL_L, -7.3, 22, 31.1); a.rect(WALL_L, WALL_L + 1.4, 13.8, 16.2);
    a.rect(WALL_R - 0.7, WALL_R, HG.z0, HG.z1); a.rect(WALL_R, WALL_R + 3.2, HG.z0 - 0.5, HG.z0);
    a.rect(-32, 26, 99.4, 100); a.rect(10.2, 13.2, 50, 90.5);
    [PB.xa, PB.xb].forEach((X) => a.rect(X - 0.5, X + 0.5, PB.zf - 0.5, PB.zb + 0.5));
    PROPS_S.forEach((p) => a.rect(p[0] - 0.1, p[1] + 0.1, p[2] - 0.1, p[3] + 0.1));
    shadeMul(a.c, 0.5, 2.6, 'rgb(30,32,36)');
  }

  // ---------- Лужи: чёткий векторный контур, в воде — отражение уже нарисованной сцены ----------
  // Отражение — кадр, зеркальный относительно линии чуть ниже горизонта (основание дальних зданий), в половинном
  // разрешении. Доля отражения растёт к горизонту (Френель), сверху — светлый налёт неба; кромка — тёмная мокрая.
  // контур лужи p = [X, Z, rx, rz]: луч из центра до первого нуля той же функции, что даёт мокрую кайму в карте земли
  function puddleOutline(p, n) {
    const pts = [];
    for (let a = 0; a < 40; a++) {
      const t = a / 40 * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      let r0 = 0, v0 = 1, rr = 1.7;
      for (let r = 0.1; r <= 1.7; r += 0.06) {
        const v = 1 - r + 0.5 * Tex.fbm(n, (p[0] + p[2] * r * c) * 0.95 + 4, (p[1] + p[3] * r * s) * 0.7, 3);
        if (v < 0) { rr = r0 + (r - r0) * v0 / (v0 - v); break; }
        r0 = r; v0 = v;
      }
      pts.push(P(p[0] + p[2] * rr * c, 0, p[1] + p[3] * rr * s));
    }
    return pts;
  }
  function puddles() {
    const src = x.canvas, rw = Math.round(src.width / 2), rh = Math.round(src.height / 2), YM = CY + 15;
    const r = cnv(rw, rh), rc = r.getContext('2d');
    rc.setTransform(rw / W, 0, 0, -rh / H, 0, rh / H * 2 * YM);
    rc.imageSmoothingEnabled = true; rc.imageSmoothingQuality = 'low';
    rc.drawImage(src, 0, 0, W, H);
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.globalCompositeOperation = 'multiply'; rc.fillStyle = 'rgb(228,233,238)'; rc.fillRect(0, 0, rw, rh);
    // мокрый бетон к горизонту: слабое отражение по маске блеска
    if (PMASK) {
      const s = cnv(rw, rh), sc = s.getContext('2d');
      sc.drawImage(r, 0, 0); sc.globalCompositeOperation = 'destination-in';
      sc.drawImage(PMASK, 0, GTOP * rh / H, rw, (H - GTOP) * rh / H);
      const y0 = Math.floor(GTOP / H * rh);
      x.save(); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'low';
      x.drawImage(s, 0, y0, rw, rh - y0, 0, y0 * H / rh, W, H - y0 * H / rh); x.restore();
    }
    const n = Tex.perlin(7203);
    PUD.forEach(function (p) {
      const pts = puddleOutline(p, n), Z = p[1];
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      pts.forEach((q) => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
      x0 = Math.max(0, Math.floor(x0) - 2); x1 = Math.min(W, Math.ceil(x1) + 2);
      y0 = Math.max(GTOP, Math.floor(y0) - 2); y1 = Math.min(H, Math.ceil(y1) + 2);
      if (x1 - x0 < 1 || y1 - y0 < 1) return;
      const path = () => { poly2(pts); };
      x.save(); path(); x.clip();
      // дно: тёмный мокрый бетон; поверх — отражение по Френелю и светлый налёт пасмурного неба
      x.fillStyle = css(fog([56, 59, 60], Z)); x.fillRect(x0, y0, x1 - x0, y1 - y0);
      x.globalAlpha = 0.52 + 0.4 * sm(4, 40, Z); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'low';
      x.drawImage(r, x0 * rw / W, y0 * rh / H, (x1 - x0) * rw / W, (y1 - y0) * rh / H, x0, y0, x1 - x0, y1 - y0);
      x.globalAlpha = 1;
      x.fillStyle = css(fog([188, 194, 198], Z), 0.17 + 0.1 * sm(5, 40, Z)); x.fillRect(x0, y0, x1 - x0, y1 - y0);
      x.restore();
      path(); x.strokeStyle = css(fog([38, 39, 38], Z), 0.42); x.lineWidth = Math.max(1.4, F * 0.02 / Z); x.lineJoin = 'round'; x.stroke();
    });
  }

  // ---------- Первый план: поддоны, бочки «химии», еврокуб, баллоны, кабельный барабан, погрузчик ----------
  const PALLETS = [[-8.7, 10.3, 7, 0], [-8.65, 11.25, 4, 1], [8.25, 19.3, 5, 0], [8.3, 20.25, 2, 1]];   // [x0, z0, штук, сдвиг]
  // бочки одного семейства (выцветшая синяя «химия»): [X, Z, этикетка 0–2, вмятина, ржавчина, открыта, тон]
  const DRUMS = [[-7.9, 20.85, 1, 0, 0.25, 0, 1.0], [-7.27, 21.0, 0, 0.8, 0.6, 0, 0.9], [-7.95, 21.62, 2, 0.3, 0.15, 1, 1.07]];
  const IBC = [7.75, 10.05], CYL = [8.15, 11.62], CDRUM = [3.95, 5.9];   // еврокуб, стойка с баллонами, барабан
  PALLETS.forEach((p) => PROPS_S.push([p[0], p[0] + 1.2, p[1], p[1] + 0.8, p[2] * 0.144]));
  DRUMS.forEach((b) => PROPS_S.push([b[0] - 0.29, b[0] + 0.29, b[1] - 0.29, b[1] + 0.29, 0.88]));
  PROPS_S.push([-7.25, -6.37, 22.0, 22.58, 0.58], [6.45, 6.55, 12.45, 12.55, 2.3], [6.55, 7.7, 21.2, 23.6, 1.6],
    [IBC[0], IBC[0] + 1.2, IBC[1], IBC[1] + 1.0, 1.16], [CYL[0], CYL[0] + 1.3, CYL[1], CYL[1] + 0.35, 1.45],
    [CDRUM[0] - 0.55, CDRUM[0] + 0.55, CDRUM[1], CDRUM[1] + 0.62, 1.1]);
  // поддон 1,2 × 0,8 × 0,144 м: доски настила, бруски-шашки с тёмными просветами
  function pallet(x0, z0, y0, wood) {
    const x1 = x0 + 1.2, z1 = z0 + 0.8, h = 0.144;
    box(x0, x1, y0 + h - 0.022, y0 + h, z0, z1, wood);
    box(x0, x1, y0, y0 + 0.022, z0, z1, mul(wood, 0.9));
    [0, 0.55, 1.1].forEach((dx) => box(x0 + dx, x0 + dx + 0.1, y0 + 0.022, y0 + h - 0.022, z0, z0 + 0.1, mul(wood, 0.95)));
    const sx = x0 < 0 ? x1 : x0;
    [0, 0.35, 0.7].forEach((dz) => box(sx - 0.1, sx, y0 + 0.022, y0 + h - 0.022, z0 + dz, z0 + dz + 0.1, mul(wood, 0.95)));
    fill3([[x0 + 0.1, y0 + 0.022, z0], [x0 + 0.55, y0 + 0.022, z0], [x0 + 0.55, y0 + h - 0.022, z0], [x0 + 0.1, y0 + h - 0.022, z0]], css(lit([34, 30, 26], 1, z0)));
    fill3([[x0 + 0.65, y0 + 0.022, z0], [x0 + 1.1, y0 + 0.022, z0], [x0 + 1.1, y0 + h - 0.022, z0], [x0 + 0.65, y0 + h - 0.022, z0]], css(lit([34, 30, 26], 1, z0)));
  }
  // эллипс на горизонтальной плоскости Y (верх бочки, баллона): контур для заливки
  function hEll(X, Y, Z, r, n) {
    x.beginPath();
    for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2, p = P(X + Math.cos(t) * r, Y, Z + Math.sin(t) * r); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }
    x.closePath();
  }
  // вертикальный цилиндр (бочка, баллон): тело с затенением, светлее справа (там светлее небо)
  function cylBody(X, Z, r, y0, y1, col) {
    const a = P(X - r, y1, Z), b = P(X + r, y0, Z), g = x.createLinearGradient(a[0], 0, b[0], 0);
    g.addColorStop(0, css(lit(mul(col, 0.58), 1, Z))); g.addColorStop(0.4, css(lit(mul(col, 0.92), 1, Z)));
    g.addColorStop(0.78, css(lit(mul(col, 1.08), 1, Z))); g.addColorStop(1, css(lit(mul(col, 0.74), 1, Z)));
    x.fillStyle = g; x.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    return [a, b];
  }
  // бочка 200 л из одного семейства: отличаются этикеткой, вмятиной, потёками ржавчины, открытой пробкой, выгоранием
  function drum(d) {
    const X = d[0], Z = d[1], r = 0.29, h = 0.88, col = mix([52, 78, 102], [92, 102, 110], 0.25 + 0.25 * (1 - d[6])), rr = Tex.rng(Math.round(X * 100 + Z * 7));
    const ab = cylBody(X, Z, r, 0, h, mul(col, d[6])), a = ab[0], b = ab[1], wpx = b[0] - a[0];
    // зиги-обручи: тёмная канавка и светлый гребень
    [0.3, 0.6].forEach((y) => {
      const p = P(X - r, y + 0.02, Z), q = P(X, y - 0.02, Z);
      x.fillStyle = css(lit(mul(col, 0.5), 1, Z), 0.8); x.fillRect(a[0], p[1], wpx, Math.max(1, q[1] - p[1]) * 0.5);
      x.fillStyle = css(lit(mul(col, 1.3), 1, Z), 0.5); x.fillRect(a[0], p[1] + Math.max(1, q[1] - p[1]) * 0.5, wpx, Math.max(1, (q[1] - p[1]) * 0.5));
    });
    // этикетка: белый лист с полосами текста и ромбом опасности; или трафаретная надпись
    if (d[2] === 1) {
      const p = P(X - r * 0.5, 0.72, Z - r), q = P(X + r * 0.25, 0.4, Z - r);
      x.fillStyle = css(lit([206, 204, 196], 1, Z), 0.9); x.fillRect(p[0], p[1], q[0] - p[0], q[1] - p[1]);
      x.fillStyle = css(lit([60, 60, 60], 1, Z), 0.8);
      for (let k = 0; k < 3; k++) x.fillRect(p[0] + 2, p[1] + (q[1] - p[1]) * (0.22 + 0.2 * k), (q[0] - p[0]) * (0.75 - 0.15 * k), Math.max(1, (q[1] - p[1]) * 0.07));
      const c = P(X + r * 0.05, 0.53, Z - r), s = (q[0] - p[0]) * 0.16;
      poly2([[c[0], c[1] - s], [c[0] + s, c[1]], [c[0], c[1] + s], [c[0] - s, c[1]]]); x.fillStyle = css(lit([150, 98, 50], 1, Z)); x.fill();
    } else if (d[2] === 2) {
      const p = P(X - r * 0.7, 0.56, Z - r), q = P(X + r * 0.5, 0.47, Z - r);
      x.fillStyle = css(lit([200, 198, 190], 1, Z), 0.75); x.fillRect(p[0], p[1], q[0] - p[0], Math.max(1.5, q[1] - p[1]));
    }
    // вмятина: тёмная лунка с бликом по нижней кромке
    if (d[3] > 0) {
      const c = P(X - r * 0.35, 0.2 + 0.1 * d[3], Z - r), s = wpx * 0.22 * d[3];
      x.beginPath(); x.ellipse(c[0], c[1], s, s * 0.6, -0.3, 0, Math.PI * 2); x.fillStyle = css(lit(mul(col, 0.55), 1, Z), 0.75); x.fill();
      x.beginPath(); x.ellipse(c[0] + s * 0.15, c[1] + s * 0.32, s * 0.8, s * 0.25, -0.3, 0, Math.PI); x.fillStyle = css(lit(mul(col, 1.35), 1, Z), 0.5); x.fill();
    }
    // ржавчина: потёки от верхнего борта и рыжий низ
    if (d[4] > 0) {
      for (let k = 0; k < 2 + Math.round(d[4] * 4); k++) {
        const u = rr(), len = (0.15 + rr() * 0.45) * d[4] + 0.08, p = P(X - r + 2 * r * u, h, Z), q = P(X - r + 2 * r * u, h - len, Z);
        x.fillStyle = css(lit([112, 70, 46], 1, Z), 0.55); x.fillRect(p[0], p[1], Math.max(1, wpx * (0.03 + 0.04 * rr())), q[1] - p[1]);
      }
      const rb = P(X - r, 0.08 + 0.2 * d[4], Z); x.fillStyle = css(lit([100, 66, 46], 1, Z), 0.3 + 0.4 * d[4]); x.fillRect(a[0], rb[1], wpx, b[1] - rb[1]);
    }
    // крышка: эллипс, тёмная кромка, две пробки; открытая — тёмный зев
    hEll(X, h, Z, r, 24); x.fillStyle = css(lit(mul(col, 0.9), 'T', Z)); x.fill();
    x.strokeStyle = css(lit(mul(col, 0.5), 1, Z)); x.lineWidth = Math.max(1.2, F * 0.025 / Z); x.stroke();
    const c1 = P(X - 0.13, h, Z + 0.09), c2 = P(X + 0.14, h, Z + 0.1), s1 = Math.max(2, F * 0.06 / Z);
    x.fillStyle = css(lit(d[5] ? [20, 20, 20] : [44, 46, 48], 1, Z)); x.fillRect(c1[0] - s1 / 2, c1[1] - s1 / 4, s1, s1 / 2);
    x.fillStyle = css(lit([44, 46, 48], 1, Z)); x.fillRect(c2[0] - s1 / 3, c2[1] - s1 / 5, s1 * 0.66, s1 * 0.4);
  }
  // бочка на боку вдоль X: торец (эллипс) к проезду, обручи-зиги поперёк
  function drumLying(x0, Z, col) {
    const r = 0.29, x1 = x0 + 0.88, a = P(x0, 2 * r, Z), b = P(x1, 0, Z), g = x.createLinearGradient(0, a[1], 0, b[1]);
    g.addColorStop(0, css(lit(mul(col, 1.1), 1, Z))); g.addColorStop(0.45, css(lit(col, 1, Z))); g.addColorStop(1, css(lit(mul(col, 0.5), 1, Z)));
    x.fillStyle = g; x.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    [0.3, 0.58].forEach((dx) => { const p = P(x0 + dx, 2 * r, Z), q = P(x0 + dx + 0.03, 0, Z); x.fillStyle = css(lit(mul(col, 0.55), 1, Z), 0.8); x.fillRect(p[0], p[1], Math.max(1, q[0] - p[0]), q[1] - p[1]); });
    const end = []; for (let i = 0; i < 20; i++) { const t = i / 20 * Math.PI * 2; end.push([x1, r + Math.sin(t) * r, Z + Math.cos(t) * r]); }
    fill3(end, css(lit(mul(col, 0.92), 'L', Z)));
    path3(end.map((p) => [x1 + 0.001, r + (p[1] - r) * 0.82, Z + (p[2] - Z) * 0.82])); x.strokeStyle = css(lit(mul(col, 0.55), 1, Z)); x.lineWidth = Math.max(1, F * 0.015 / Z); x.stroke();
  }
  // еврокуб: белёсый бак в стальной клетке на поддоне, уровень жидкости, кран снизу, табличка
  function ibc(x0, z0) {
    const x1 = x0 + 1.2, z1 = z0 + 1.0, yb = 0.15, yt = 1.16, cage = [146, 150, 148];
    box(x0, x1, 0, yb, z0, z1, { F: [64, 66, 66], S: [74, 76, 76], T: [86, 88, 88] });
    box(x0 + 0.04, x1 - 0.04, yb, yt - 0.04, z0 + 0.04, z1 - 0.04, { F: [192, 190, 180], S: [180, 178, 168], T: [200, 198, 188] });
    const lv = yb + 0.55 * (yt - yb), dk = [112, 108, 88];
    fill3([[x0 + 0.04, yb, z0 + 0.039], [x1 - 0.04, yb, z0 + 0.039], [x1 - 0.04, lv, z0 + 0.039], [x0 + 0.04, lv, z0 + 0.039]], css(lit(dk, 'F', z0), 0.55));
    fill3([[x0 + 0.039, yb, z0 + 0.04], [x0 + 0.039, yb, z1 - 0.04], [x0 + 0.039, lv, z1 - 0.04], [x0 + 0.039, lv, z0 + 0.04]], css(lit(dk, 'Rt', z0), 0.55));
    // грязные потёки по баку
    for (let k = 0; k < 5; k++) { const X = x0 + 0.15 + 0.2 * k, p = P(X, yt - 0.05, z0 + 0.038), q = P(X + 0.04, lv - 0.1 * (k % 2), z0 + 0.038); x.fillStyle = css(lit([120, 112, 96], 'F', z0), 0.35); x.fillRect(p[0], p[1], Math.max(1, q[0] - p[0]), q[1] - p[1]); }
    x.beginPath();
    for (let k = 0; k <= 6; k++) { const X = x0 + 1.2 * k / 6, p = P(X, yb, z0), q = P(X, yt, z0); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    for (let k = 1; k <= 5; k++) { const Z = z0 + 1.0 * k / 5, p = P(x0, yb, Z), q = P(x0, yt, Z); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    for (let k = 0; k <= 4; k++) { const y = yb + 0.2 + (yt - yb - 0.2) * k / 4, p = P(x0, y, z1), q = P(x0, y, z0), s = P(x1, y, z0); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.lineTo(s[0], s[1]); }
    for (let k = 0; k <= 3; k++) { const Z = z0 + k / 3, p = P(x0, yt, Z), q = P(x1, yt, Z); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    x.strokeStyle = css(lit(cage, 1, z0)); x.lineWidth = lw(0.024, z0, 1.3); x.stroke();
    hEll((x0 + x1) / 2, yt - 0.03, (z0 + z1) / 2, 0.11, 16); x.fillStyle = css(lit([70, 72, 72], 'T', z0)); x.fill();
    box((x0 + x1) / 2 - 0.07, (x0 + x1) / 2 + 0.07, yb + 0.02, yb + 0.13, z0 - 0.08, z0, [60, 60, 60]);
    const p = P(x0 + 0.72, 0.98, z0 - 0.002), q = P(x0 + 1.05, 0.8, z0 - 0.002);
    x.fillStyle = css(lit([214, 212, 204], 'F', z0)); x.fillRect(p[0], p[1], q[0] - p[0], q[1] - p[1]);
    x.fillStyle = css(lit([70, 70, 70], 'F', z0)); x.fillRect(p[0] + 2, p[1] + (q[1] - p[1]) * 0.3, (q[0] - p[0]) * 0.7, Math.max(1, (q[1] - p[1]) * 0.12));
  }
  // стойка с баллонами (одно семейство — выцветшие голубые кислородные), цепь поперёк
  function cylRack(x0, z0) {
    const x1 = x0 + 1.3, z1 = z0 + 0.35, frm = [64, 76, 70];
    box(x0, x0 + 0.05, 0, 1.3, z1 - 0.05, z1, frm); box(x1 - 0.05, x1, 0, 1.3, z1 - 0.05, z1, frm);
    box(x0, x1, 1.22, 1.3, z1 - 0.05, z1, frm); box(x0, x1, 0.3, 0.36, z1 - 0.05, z1, frm);
    for (let k = 0; k < 4; k++) {
      const X = x0 + 0.22 + k * 0.29, Z = z0 + 0.17, r = 0.11, ht = 1.44, col = mul([92, 124, 144], [0.95, 1.1, 0.88, 0.98][k]);
      cylBody(X, Z, r, 0, ht - 0.16, col);
      // плечо, вентиль или колпак, белая полоса надписи
      const s0 = P(X - r, ht - 0.16, Z), s1 = P(X + r, ht - 0.16, Z), s2 = P(X + r * 0.45, ht - 0.05, Z), s3 = P(X - r * 0.45, ht - 0.05, Z);
      poly2([s0, s1, s2, s3]); x.fillStyle = css(lit(mul(col, 0.92), 1, Z)); x.fill();
      if (k === 2) box(X - 0.025, X + 0.025, ht - 0.05, ht + 0.05, Z - 0.025, Z + 0.025, [120, 116, 100]);
      else box(X - 0.06, X + 0.06, ht - 0.06, ht + 0.1, Z - 0.06, Z + 0.06, [52, 54, 56]);
      const a = P(X - r, 0.98, Z - r), b = P(X + r, 0.94, Z - r);
      x.fillStyle = css(lit([30, 32, 34], 1, Z), 0.75); x.fillRect(a[0], a[1], b[0] - a[0], Math.max(1, b[1] - a[1]));
      if (k === 1) { const c = P(X - r, 0.25, Z - r); x.fillStyle = css(lit([108, 72, 50], 1, Z), 0.45); x.fillRect(c[0], c[1], b[0] - a[0], P(X, 0, Z)[1] - c[1]); }
    }
    // цепь: звенья — короткие штрихи вдоль провиса
    for (let i = 0; i < 18; i++) {
      const k = i / 17, X = x0 + 0.05 + 1.2 * k, y = 1.08 - 0.06 * 4 * k * (1 - k), p = P(X, y, z0), q = P(X + 0.05, y - (i & 1 ? 0.01 : 0), z0);
      x.strokeStyle = css(lit([46, 46, 46], 1, z0)); x.lineWidth = lw(0.018, z0, 1.2); x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke();
    }
    box(x0, x0 + 0.05, 0, 1.3, z0, z0 + 0.05, frm); box(x1 - 0.05, x1, 0, 1.3, z0, z0 + 0.05, frm);
    box(x0, x1, 0, 0.06, z0, z1, frm);
  }
  // деревянный кабельный барабан на ребре: задний фланец, намотка (стопка дисков), передний фланец с досками
  function cableDrum(X, z0) {
    const R = 0.55, Yc = R, zb = z0 + 0.62, wood = [124, 106, 84];
    const disc = (Z, r) => { x.beginPath(); for (let i = 0; i < 32; i++) { const t = i / 32 * Math.PI * 2, p = P(X + Math.cos(t) * r, Yc + Math.sin(t) * r, Z); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); } x.closePath(); };
    disc(zb, R); x.fillStyle = css(lit(mul(wood, 0.6), 'F', zb)); x.fill();
    disc(zb - 0.05, R); x.fill();
    for (let z = zb - 0.06; z > z0 + 0.04; z -= 0.06) { disc(z, 0.43); x.fillStyle = css(lit([40, 40, 40], 1, z)); x.fill(); }
    // витки кабеля: светлые штрихи по верхней кромке намотки
    x.beginPath();
    for (let z = z0 + 0.08; z < zb - 0.05; z += 0.055) { const p = P(X - 0.3, Yc + 0.3, z), q = P(X + 0.05, Yc + 0.43, z); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    x.strokeStyle = css(lit([96, 96, 94], 1, z0), 0.6); x.lineWidth = lw(0.012, z0, 1); x.stroke();
    for (let z = z0 + 0.05; z >= z0; z -= 0.025) { disc(z, R); x.fillStyle = css(lit(mul(wood, z > z0 ? 0.72 : 0.95), 'F', z)); x.fill(); }
    // доски фланца, стяжные болты, отверстие под ось, трафарет
    x.save(); disc(z0, R); x.clip();
    x.beginPath();
    for (let k = -2; k <= 2; k++) { const p = P(X + k * 0.2, Yc + R, z0), q = P(X + k * 0.2, Yc - R, z0); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    x.strokeStyle = css(lit([70, 58, 46], 'F', z0), 0.8); x.lineWidth = lw(0.014, z0, 1.2); x.stroke();
    const g = P(X - R, Yc + R, z0), g2 = P(X + R, Yc - R, z0), gg = x.createLinearGradient(0, g[1], 0, g2[1]);
    gg.addColorStop(0, 'rgba(60,52,44,0)'); gg.addColorStop(1, 'rgba(60,52,44,.35)'); x.fillStyle = gg; x.fillRect(g[0], g[1], g2[0] - g[0], g2[1] - g[1]);
    x.restore();
    disc(z0 - 0.002, 0.075); x.fillStyle = css(lit([28, 26, 24], 'F', z0)); x.fill();
    for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2 + 0.3, p = P(X + Math.cos(t) * 0.3, Yc + Math.sin(t) * 0.3, z0), s = lw(0.03, z0, 2); x.fillStyle = css(lit([58, 56, 52], 'F', z0)); x.fillRect(p[0] - s / 2, p[1] - s / 2, s, s); }
    textF('КГ 3×4', X, Yc + 0.25, z0 - 0.003, 0.07, css(lit([52, 46, 38], 'F', z0), 0.8));
    // свободный конец кабеля свисает до земли
    const c0 = P(X - 0.3, Yc + 0.32, z0 + 0.3), c1 = P(X - 0.75, 0.25, z0 + 0.1), c2 = P(X - 0.95, 0, z0 - 0.3);
    x.beginPath(); x.moveTo(c0[0], c0[1]); x.quadraticCurveTo(c1[0], c1[1], c2[0], c2[1]);
    x.strokeStyle = css(lit([34, 34, 34], 1, z0)); x.lineWidth = lw(0.03, z0, 2); x.stroke();
  }
  // доска на земле от (xa, za) до (xb, zb): ближняя кромка, верх с волокнами
  function plank(xa, za, xb, zb, w, h, col) {
    const dx = xb - xa, dz = zb - za, l = Math.hypot(dx, dz), nx = -dz / l * w / 2, nz = dx / l * w / 2;
    const A = [xa - nx, za - nz], B = [xb - nx, zb - nz], C = [xb + nx, zb + nz], D = [xa + nx, za + nz], zm = (za + zb) / 2;
    fill3([[A[0] - 0.03, 0, A[1] - 0.03], [B[0] + 0.03, 0, B[1] - 0.03], [C[0] + 0.03, 0, C[1] + 0.03], [D[0] - 0.03, 0, D[1] + 0.03]], 'rgba(30,28,26,.4)');
    fill3([[A[0], 0, A[1]], [B[0], 0, B[1]], [B[0], h, B[1]], [A[0], h, A[1]]], css(lit(mul(col, 0.66), 'F', zm)));
    fill3([[B[0], 0, B[1]], [C[0], 0, C[1]], [C[0], h, C[1]], [B[0], h, B[1]]], css(lit(mul(col, 0.8), 'Rt', zm)));
    fill3([[A[0], h, A[1]], [B[0], h, B[1]], [C[0], h, C[1]], [D[0], h, D[1]]], css(lit(col, 'T', zm)));
    for (let k = 1; k < 4; k++) {
      const t = k / 4 + 0.05 * Math.sin(k * 3);
      line3([A[0] + (D[0] - A[0]) * t, h, A[1] + (D[1] - A[1]) * t], [B[0] + (C[0] - B[0]) * t, h, B[1] + (C[1] - B[1]) * t], lw(0.006, zm, 1), css(lit(mul(col, 0.7), 1, zm), 0.55));
    }
  }
  // цепь на земле вдоль ломаной: звенья по 5,5 см — плоские кольца и звенья на ребре
  function chainG(pts) {
    const S = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 0.055));
      for (let k = 0; k < n; k++) S.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, Math.atan2(b[1] - a[1], b[0] - a[0])]);
    }
    S.forEach(function (s, k) {
      const c = Math.cos(s[2]), sn = Math.sin(s[2]), Z = s[1], col = css(lit(k % 4 === 2 ? [80, 64, 52] : [46, 45, 44], 1, Z));
      x.strokeStyle = col; x.lineWidth = lw(0.01, Z, 1);
      x.beginPath();
      if (k & 1) { const p = P(s[0] - c * 0.034, 0.02, Z - sn * 0.034), q = P(s[0] + c * 0.034, 0.02, Z + sn * 0.034); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
      else for (let i = 0; i <= 10; i++) { const u = i / 10 * Math.PI * 2, X = s[0] + c * Math.cos(u) * 0.036 - sn * Math.sin(u) * 0.02, ZZ = Z + sn * Math.cos(u) * 0.036 + c * Math.sin(u) * 0.02, p = P(X, 0.006, ZZ); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }
      x.stroke();
    });
  }
  function props() {
    const wood = [116, 104, 88];
    // дальние: погрузчик, бочки у рампы, поддоны у ангара
    forklift(6.55, 21.2);
    DRUMS.slice().sort((a, b) => b[1] - a[1]).forEach(drum);
    drumLying(-7.25, 22.29, mix([52, 78, 102], [92, 102, 110], 0.4));
    PALLETS.forEach(function (p, i) {
      for (let k = 0; k < p[2]; k++) {
        const sh = (hash2(i, k) - 0.5) * 0.12 * (p[3] ? 2 : 1);
        pallet(p[0] + sh, p[1] + sh * 0.5, k * 0.144, mul(wood, 0.88 + 0.2 * hash2(k, i + 9)));
      }
    });
    // у торца ангара: стойка с баллонами, знак «5», еврокуб
    cylRack(CYL[0], CYL[1]);
    const SX = 6.5, SZ = 12.5;
    post(SX, SZ, 0.04, 0, 2.3, [128, 132, 132]);
    const c = P(SX, 2.05, SZ), rr = F * 0.3 / SZ;
    x.beginPath(); x.arc(c[0], c[1], rr, 0, Math.PI * 2); x.fillStyle = css(lit([166, 54, 46], 'F', SZ)); x.fill();
    x.beginPath(); x.arc(c[0], c[1], rr * 0.76, 0, Math.PI * 2); x.fillStyle = css(lit([214, 214, 208], 'F', SZ)); x.fill();
    textF('5', SX, 2.04, SZ, 0.24, css(lit([30, 30, 30], 'F', SZ)));
    ibc(IBC[0], IBC[1]);
    // первый план: кабельный барабан справа, доска и цепь у пути слева
    cableDrum(CDRUM[0], CDRUM[1]);
    plank(-3.15, 6.05, -1.45, 6.6, 0.2, 0.04, [118, 106, 90]);
    chainG([[-2.75, 4.2], [-2.4, 4.32], [-2.1, 4.24], [-1.85, 4.38], [-1.62, 4.5], [-1.5, 4.4]]);
  }
  // вилочный погрузчик у ворот склада: стоит вдоль проезда, противовесом к камере, вилами вглубь
  function forklift(x0, z0) {
    const x1 = x0 + 1.15, z1 = z0 + 2.3, xm = (x0 + x1) / 2, body = [140, 68, 54], steel = [52, 54, 56];
    const wheel = (Z, r) => {
      x.beginPath();
      for (let i = 0; i < 20; i++) { const t = i / 20 * Math.PI * 2, p = P(x0 - 0.03, r + Math.sin(t) * r, Z + Math.cos(t) * r); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }
      x.closePath(); x.fillStyle = css(lit([30, 30, 30], 'Rt', Z)); x.fill();
      x.beginPath();
      for (let i = 0; i < 14; i++) { const t = i / 14 * Math.PI * 2, p = P(x0 - 0.035, r + Math.sin(t) * r * 0.45, Z + Math.cos(t) * r * 0.45); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }
      x.closePath(); x.fillStyle = css(lit([120, 116, 104], 'Rt', Z)); x.fill();
    };
    // вилы и каретка (дальше всего), мачта: два швеллера, поперечина, цилиндр подъёма, цепи
    [x0 + 0.24, x1 - 0.34].forEach((X) => box(X, X + 0.1, 0.06, 0.11, z1 + 0.06, z1 + 1.2, [78, 76, 72]));
    box(x0 + 0.1, x1 - 0.1, 0.08, 0.62, z1 + 0.02, z1 + 0.07, [60, 60, 62]);
    [x0 + 0.12, x1 - 0.22].forEach(function (X) {
      box(X, X + 0.1, 0.1, 2.35, z1 - 0.12, z1, steel);
      line3([X + 0.05, 0.12, z1 - 0.121], [X + 0.05, 2.33, z1 - 0.121], lw(0.02, z1, 1), css(lit([30, 30, 32], 1, z1)));
    });
    box(x0 + 0.12, x1 - 0.12, 2.22, 2.35, z1 - 0.12, z1, steel);
    line3([xm, 0.4, z1 - 0.13], [xm, 2.0, z1 - 0.13], lw(0.05, z1, 1.5), css(lit([168, 170, 168], 1, z1)));
    [xm - 0.12, xm + 0.12].forEach((X) => line3([X, 0.5, z1 - 0.13], [X, 2.25, z1 - 0.13], lw(0.015, z1, 1), css(lit([36, 36, 36], 1, z1))));
    wheel(z1 - 0.48, 0.33);
    // кузов: капот, ступенька, сиденье со спинкой, рулевая колонка
    box(x0 + 0.02, x1 - 0.02, 0.26, 0.98, z0 + 0.52, z1 - 0.3, body);
    box(x0 - 0.02, x0 + 0.1, 0.3, 0.38, z0 + 1.0, z0 + 1.5, [44, 44, 44]);
    box(x0 + 0.3, x1 - 0.3, 0.98, 1.1, z0 + 0.72, z0 + 1.2, [36, 36, 38]);
    box(x0 + 0.3, x1 - 0.3, 1.1, 1.55, z0 + 0.66, z0 + 0.76, [40, 40, 42]);
    line3([xm, 1.0, z1 - 0.62], [xm, 1.45, z1 - 0.8], lw(0.045, z1, 1.3), css(lit([34, 34, 34], 1, z1)));
    // защитная крыша: две задние стойки прямо, передние с наклоном, рама с ламелями (видна снизу)
    const gz0 = z0 + 0.5, gz1 = z1 - 0.42, gy = 2.18;
    [[x0 + 0.04, gz1 + 0.12, gz1], [x1 - 0.1, gz1 + 0.12, gz1]].forEach((p) => line3([p[0], 0.98, p[1]], [p[0], gy, p[2]], lw(0.06, p[1], 1.6), css(lit(steel, 1, p[1]))));
    box(x0, x1, gy, gy + 0.07, gz0, gz1, steel);
    x.beginPath();
    for (let k = 1; k < 6; k++) { const X = x0 + 1.15 * k / 6, p = P(X, gy, gz0), q = P(X, gy, gz1); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); }
    x.strokeStyle = css(lit([30, 30, 32], 1, gz0)); x.lineWidth = lw(0.03, gz0, 1.2); x.stroke();
    [[x0 + 0.04, gz0], [x1 - 0.1, gz0]].forEach((p) => line3([p[0], 1.05, p[1]], [p[0], gy, p[1]], lw(0.06, p[1], 1.6), css(lit(steel, 1, p[1]))));
    box(x0 + 0.08, x0 + 0.22, gy + 0.07, gy + 0.17, gz0 + 0.04, gz0 + 0.16, [150, 112, 60]);
    // противовес: тяжёлый блок с тёмной кромкой, фонари, буксирная проушина, номер
    box(x0, x1, 0.2, 1.08, z0, z0 + 0.55, { F: mul(body, 0.86), S: mul(body, 0.92), T: mul(body, 0.95) });
    fill3([[x0, 0.96, z0 - 0.001], [x1, 0.96, z0 - 0.001], [x1, 1.08, z0 - 0.001], [x0, 1.08, z0 - 0.001]], css(lit([40, 30, 28], 'F', z0), 0.5));
    [x0 + 0.06, x1 - 0.2].forEach((X) => fill3([[X, 0.86, z0 - 0.002], [X + 0.14, 0.86, z0 - 0.002], [X + 0.14, 0.93, z0 - 0.002], [X, 0.93, z0 - 0.002]], css(lit([120, 46, 40], 'F', z0))));
    fill3([[xm - 0.08, 0.28, z0 - 0.002], [xm + 0.08, 0.28, z0 - 0.002], [xm + 0.08, 0.38, z0 - 0.002], [xm - 0.08, 0.38, z0 - 0.002]], css(lit([30, 28, 26], 'F', z0)));
    textF('07', xm, 0.62, z0 - 0.003, 0.2, css(lit([214, 210, 200], 'F', z0)));
    wheel(z0 + 0.42, 0.27);
  }
  // лёгкая виньетка по углам и успокоенный верх кадра (под заголовки экранов)
  function grade() {
    const v = x.createRadialGradient(CX, CY, H * 0.45, CX, CY, W * 0.68);
    v.addColorStop(0, 'rgba(12,14,16,0)'); v.addColorStop(1, 'rgba(12,14,16,.32)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
    // спокойная верхняя полоса под заголовки экранов: пасмурное затемнение верха
    const t = x.createLinearGradient(0, 0, 0, 180);
    t.addColorStop(0, 'rgba(14,16,20,.36)'); t.addColorStop(0.55, 'rgba(14,16,20,.12)'); t.addColorStop(1, 'rgba(14,16,20,0)');
    x.fillStyle = t; x.fillRect(0, 0, W, 180);
  }

  // ---------- Сборка ----------
  Backgrounds.scene('factory', function (ctx, R, th, o) {
    x = ctx; K = o.scale || 1;
    // ?ftime — отладка: время каждого слоя в углу кадра
    const dbg = typeof location !== 'undefined' && /[?&]ftime/.test(location.search), T = [];
    const run = (name, fn) => { const t0 = performance.now(); fn(); T.push(name + ' ' + Math.round(performance.now() - t0)); };
    x.save();
    run('sky', sky);
    run('ground', ground);
    run('gdetail', groundDetail);
    run('shadows', shadows);
    run('far', () => { chimney(); plume(); mainHall(); crane(); buildingL2(); });
    run('brickL', brickWallL);
    run('facadeL', facadeL);
    run('floorL', () => { groundFloorL(); dockRail(); });
    run('hangar', () => { containers(); hangarWall(); hangarDetails(); hangarExtra(); hangarFront(); });
    run('bridge', () => { for (let i = LAMPS.length - 1; i >= 0; i--) lampPost(LAMPS[i][0], LAMPS[i][1], i === 1); pipeBridge(); catwalk(); });
    run('puddles', puddles);
    run('props', props);
    run('wires', wires);
    run('grade', grade);
    x.restore();
    if (dbg) {
      x.save(); x.font = '22px monospace'; x.fillStyle = '#ff0'; x.fillText(T.join(' · '), 20, H - 20); x.restore();
      // то же текстом в DOM — чтобы читать время без скриншота (только в режиме ?ftime)
      if (typeof document !== 'undefined' && document.body) {
        let e = document.getElementById('ftime');
        if (!e) { e = document.createElement('div'); e.id = 'ftime'; e.style.display = 'none'; document.body.appendChild(e); }
        e.textContent = 'k' + K + ': ' + T.join(' · ');
      }
    }
  });
})();
