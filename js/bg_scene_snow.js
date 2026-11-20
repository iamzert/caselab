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
  // направление на солнце (единичный вектор): слева, немного сзади, низко над горизонтом
  const SUN = (function () { const v = [-0.8, 0.43, -0.42], l = Math.hypot(v[0], v[1], v[2]); return v.map((c) => c / l); })();
  const SHX = -SUN[0] / SUN[1], SHZ = -SUN[2] / SUN[1];   // смещение тени на земле на 1 м высоты
  const HAZE = [182, 190, 197], ZH = 350;                  // цвет и глубина дымки (м)

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

  // ---------- Небо: сплошная облачность в перспективе ----------
  function sky() {
    const n = Tex.perlin(5101), n2 = Tex.perlin(5102);
    const top = [96, 108, 121], mid = [141, 151, 160], low = [184, 190, 195], hb = CY + 14;
    const c = pixmap(0, 0, W, hb, 4, function (lx, ly, o) {
      const t = ly / hb;
      let col = t < 0.6 ? mix(top, mid, sm(0, 0.6, t)) : mix(mid, low, sm(0.6, 1, t));
      // нижняя кромка облаков — плоскость над нами: к горизонту клочья мельчают и бледнеют
      const e = Math.max(0, CY + 8 - ly) / F, d = 1 / (e + 0.025);
      const u = (lx - CX) / F * d, amp = sm(0.0, 0.2, e);
      const cl = Tex.fbm(n, u * 0.5 + 7.3, d * 0.85, 4), big = n2(u * 0.13 + 40, d * 0.22);
      const k = 1 + amp * (0.1 * cl + 0.07 * big) + 0.05 * (1 - lx / W) * (1 - t);
      o[0] = col[0] * k; o[1] = col[1] * k; o[2] = col[2] * k;
    });
    put(c, 0, 0, W, hb);
  }

  // ---------- Горы: дальний хребет (снег и скалы) и ближние лесистые склоны ----------
  // Силуэт — огибающая «конусов» вершин с изломом; рельеф — гребенчатый шум с тенью от света слева.
  const PEAKS = [[-80, 392, 300], [330, 352, 320], [690, 322, 250], [925, 386, 170], [1185, 296, 300], [1530, 358, 260], [1960, 392, 300]];
  function ridgeFar(px, n) {
    let y = 1e9;
    for (let i = 0; i < PEAKS.length; i++) {
      const p = PEAKS[i], d = Math.abs(px - p[0]) / p[2];
      y = Math.min(y, p[1] + d * (1 + 0.25 * d) * 95);
    }
    return y + 16 * Tex.fbm(n, px * 0.006, 3.3, 4) + 5 * n(px * 0.045, 8.1);
  }
  function ridgeNear(px, n) {
    const side = Math.abs(px - CX) / CX;
    return 470 - 78 * Math.pow(side, 1.4) + 12 * Tex.fbm(n, px * 0.004, 1.7, 3) + 3 * n(px * 0.05, 4.4);
  }
  function mountains() {
    const n = Tex.perlin(5301), n2 = Tex.perlin(5302), n3 = Tex.perlin(5303);
    const top = 240, bot = CY + 4, step = Math.max(2, 1 / K);
    const w = Math.round(W / step), h = Math.round((bot - top) / step);
    const rf = new Float32Array(w), rn = new Float32Array(w), E = new Float32Array(w * h);
    // для каждого столбца — «своя» вершина (та, что даёт огибающую): левый склон на свету, правый в тени
    const own = new Int16Array(w);
    for (let i = 0; i < w; i++) {
      const px = (i + 0.5) * step;
      rf[i] = ridgeFar(px, n); rn[i] = ridgeNear(px, n2);
      let best = 1e9;
      for (let p = 0; p < PEAKS.length; p++) {
        const q = PEAKS[p], dd = Math.abs(px - q[0]) / q[2], y = q[1] + dd * (1 + 0.25 * dd) * 95;
        if (y < best) { best = y; own[i] = p; }
      }
    }
    // поле высот: рёбра и кулуары вытянуты по линии падения (частота по y ниже, чем по x)
    for (let j = 0; j < h; j++) {
      const py = top + (j + 0.5) * step;
      for (let i = 0; i < w; i++) {
        const px = (i + 0.5) * step, dep = py - rf[i];
        if (dep < -2 || py > rn[i] + 2) continue;
        const wx = 18 * n2(px * 0.004, py * 0.01);
        const r1 = 1 - Math.abs(n(px * 0.0105 + wx * 0.01, py * 0.0042));
        const r2 = 1 - Math.abs(n3(px * 0.028, py * 0.011 + 5));
        E[j * w + i] = r1 * r1 + r2 * r2 * 0.4;
      }
    }
    const c = cnv(w, h), cx = c.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
    const snowL = [194, 201, 209], snowS = [146, 158, 173], rockL = [100, 102, 106], rockS = [70, 76, 86];
    const hz = [170, 179, 188], tree = [50, 62, 62], tsnow = [178, 188, 196];
    for (let j = 0; j < h; j++) {
      const py = top + (j + 0.5) * step;
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4, px = (i + 0.5) * step;
        if (py < rf[i] - 1) { d[k + 3] = 0; continue; }
        let col;
        if (py < rn[i]) {
          // грань своей вершины: гребень от пика слегка гуляет; рёбра — производная поля высот по x
          const pk = PEAKS[own[i]], dep = py - rf[i];
          const crest = pk[0] + (py - pk[1]) * 0.35 + 22 * n2(py * 0.02, pk[0] * 0.01);
          const face = sm(-14, 14, crest - px);
          const e0 = E[j * w + Math.max(0, i - 1)], e1 = E[j * w + Math.min(w - 1, i + 1)];
          const g = (e1 - e0) / (2 * step) * 26;
          const lt = clamp(0.28 + 0.5 * face + g * 0.55, 0, 1);
          // скалы — на крутых рёбрах ближе к гребню, снег держится в кулуарах
          const rock = sm(0.3, 0.75, Math.abs(g) * 0.9 + 0.45 * Tex.fbm(n3, px * 0.016, py * 0.03, 2) - dep * 0.0025);
          col = mix(mix(snowS, snowL, lt), mix(rockS, rockL, lt), rock * 0.8);
          col = mix(col, hz, 0.46 + 0.4 * sm(rf[i] + 10, CY - 30, py));
        } else {
          // ближние склоны под ельником: тёмная хвоя с пятнами снега
          const t = Tex.fbm(n3, px * 0.05, py * 0.08, 2), s2 = n(px * 0.21, py * 0.31);
          col = mix(tree, tsnow, clamp(0.3 + t * 0.9 + s2 * 0.5, 0, 0.85));
          col = mix(col, mul(col, 0.8), sm(rn[i], rn[i] + 3, py) * (1 - sm(rn[i] + 3, rn[i] + 18, py)));
          col = mix(col, hz, 0.36 + 0.25 * sm(rn[i], CY, py));
        }
        const a = py < rf[i] ? (py - rf[i] + 1) : 1;
        d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255 * a;
      }
    }
    cx.putImageData(img, 0, 0);
    put(c, 0, top, W, h * step);
    // низкая облачность цепляется за склоны: рваные полосы тумана поперёк хребта
    const mist = pixmap(0, 300, W, 190, 4, function (lx, ly, o) {
      const t = (ly - 300) / 190, band = Math.exp(-Math.pow((t - 0.42) / 0.2, 2)) * 0.8 + sm(0.6, 1, t) * 0.75;
      const v = Tex.fbm(n2, lx * 0.0028, ly * 0.016 + 3, 4);
      o[0] = 186; o[1] = 193; o[2] = 199; o[3] = 255 * clamp(band * (0.25 + v * 1.6), 0, 0.9);
    });
    put(mist, 0, 300, W, 190);
  }

  // ---------- Ели: силуэт ярусами с провисшими лапами и снегом на верхней стороне ----------
  // Ярусы неровные (лапы разной длины, с провалами), верхушка — тонкий шпиль, лёгкий наклон.
  // Снег — отдельные комья на верхней стороне лап, не на каждом ярусе, слева (к свету) чаще.
  function spruce(bx, by, hgt, rr, col, snowCol, snowAmt) {
    const tiers = clamp(Math.round(hgt / 5.5), 3, 18), w = hgt * (0.16 + 0.08 * rr());
    const lean = (rr() - 0.5) * hgt * 0.04, spire = hgt * (0.07 + 0.06 * rr()), th = (hgt * 0.95 - spire) / tiers;
    const Lp = [], Rp = [], br = [];
    for (let i = 0; i < tiers; i++) {
      const t = (i + 1) / tiers, cx = bx + lean * (1 - t);
      const y = by - hgt + spire + (hgt * 0.95 - spire) * t + (rr() - 0.5) * th * 0.5;
      const base = w * (0.1 + 0.9 * Math.pow(t, 0.9));
      const hl = base * (rr() < 0.12 ? 0.45 : 0.72 + 0.5 * rr()), hr = base * (rr() < 0.12 ? 0.45 : 0.72 + 0.5 * rr());
      const dl = th * (0.05 + 0.35 * rr()), dr = th * (0.05 + 0.35 * rr());
      Lp.push([cx - hl * (0.3 + 0.25 * rr()), y - th * (0.55 + 0.3 * rr())], [cx - hl, y + dl]);
      Rp.push([cx + hr * (0.3 + 0.25 * rr()), y - th * (0.55 + 0.3 * rr())], [cx + hr, y + dr]);
      br.push([cx, y, hl, hr, dl, dr]);
    }
    const tw = Math.max(0.8, hgt * 0.025);
    x.beginPath(); x.moveTo(bx + lean, by - hgt);
    for (let i = 0; i < Rp.length; i++) x.lineTo(Rp[i][0], Rp[i][1]);
    x.lineTo(bx + tw, by - th * 0.6); x.lineTo(bx + tw, by); x.lineTo(bx - tw, by); x.lineTo(bx - tw, by - th * 0.6);
    for (let i = Lp.length - 1; i >= 0; i--) x.lineTo(Lp[i][0], Lp[i][1]);
    x.closePath(); x.fillStyle = col; x.fill();
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
    const dc = P(X + hw + 0.8, Hm * 0.5, Z), dr = F * 0.85 / Z;
    x.fillStyle = css(fog([200, 202, 204], Z)); x.beginPath(); x.ellipse(dc[0], dc[1], dr * 0.55, dr, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = css(fog([150, 154, 160], Z)); x.beginPath(); x.ellipse(dc[0] + dr * 0.12, dc[1], dr * 0.3, dr * 0.8, 0, 0, Math.PI * 2); x.fill();
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

  function mainBuilding() {
    const z = 110, x0 = -15, x1 = 9, yb = 1.0, yt = 7.8, d = 12;
    const wallC = [116, 128, 140];
    // подполье на сваях: тёмная щель, сваи, снег под ним
    box(x0, x1, 0, yb, z + 0.6, z + d, [64, 70, 78]);
    for (let X = x0 + 0.5; X < x1; X += 3) box(X, X + 0.3, 0, yb, z + 0.4, z + 0.7, [44, 48, 54]);
    box(x0, x1, yb, yt, z, z + d, { F: wallC, S: wallC, T: [220, 224, 228] });
    // межэтажный пояс и верхний фриз с надписью
    fill3([[x0, 4.25, z], [x1, 4.25, z], [x1, 4.6, z], [x0, 4.6, z]], css(lit([84, 94, 104], 'F', z)));
    fill3([[x0, 7.0, z], [x1, 7.0, z], [x1, yt, z], [x0, yt, z]], css(lit([176, 172, 160], 'F', z)));
    textF('СТАНЦИЯ', -9.2, 7.4, z - 0.05, 0.55, css(fog([70, 62, 56], z)));
    // окна: два ряда, часть горит тёплым
    const litSet = { 3: 1, 17: 1, 22: 1 };
    let k = 0;
    for (let row = 0; row < 2; row++) {
      for (let X = x0 + 0.9; X < x1 - 1; X += 1.85) {
        k++;
        if (row === 0 && X > -2.8 && X < 2.2) continue;
        win((u, v) => [u, v, z], X, X + 1.1, row ? 5.0 : 1.95, row ? 6.35 : 3.35, { z: z, f: 'F', lit: litSet[k], blind: k % 5 === 0 ? 0.4 : 0 });
      }
    }
    // тамбур входа с козырьком, двойная дверь, ступени
    box(-2.4, 2.4, yb, 4.0, z - 3.2, z, { F: [140, 146, 150], S: [140, 146, 150], T: [220, 224, 228] });
    fill3([[-1.0, yb, z - 3.21], [1.0, yb, z - 3.21], [1.0, 3.1, z - 3.21], [-1.0, 3.1, z - 3.21]], css(fog([58, 62, 68], z)));
    fill3([[-0.05, yb, z - 3.22], [0.05, yb, z - 3.22], [0.05, 3.1, z - 3.22], [-0.05, 3.1, z - 3.22]], css(fog([120, 124, 128], z)));
    box(-2.9, 2.9, 4.0, 4.6, z - 4.2, z, { F: [220, 224, 228], S: [196, 202, 208], T: [226, 230, 234] });
    for (let s = 0; s < 3; s++) box(-2.0, 2.0, s * 0.33, (s + 1) * 0.33, z - 4.2 + s * 0.35, z - 3.2, { F: [150, 150, 148], T: [214, 218, 222] });
    // снег на крыше с карнизом и сугробы вдоль фасада
    fill3([[x0 - 0.1, yt, z - 0.15], [x1 + 0.1, yt, z - 0.15], [x1 + 0.1, yt + 0.5, z - 0.15], [x0 - 0.1, yt + 0.5, z - 0.15]], css(fog([224, 228, 232], z)));
    box(-11, -9.2, yt, yt + 1.4, z + 2, z + 3.5, [120, 124, 128]);
    box(4.5, 6.8, yt, yt + 1.1, z + 3, z + 4.5, [130, 132, 134]);
    line3([-6, yt, z + 4], [-6, yt + 5, z + 4], 1.2, css(fog([60, 64, 70], z)));
    driftF(x0, -3.2, z, 1.1, 5601); driftF(3.2, x1, z, 1.0, 5602);
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
      const hh = lerp(h0, h1, t) * (0.75 + 0.5 * (n(z * 0.45, 1.3) * 0.5 + 0.5));
      top.push([xw + dir * 0.05, hh, z]); foot.push([xw + dir * sp * (0.8 + 0.4 * (n(z * 0.3, 7.1) * 0.5 + 0.5)), 0, z]);
    }
    const pts = top.concat(foot.reverse());
    const zm = (z0 + z1) / 2, a = P(xw, h0, zm), b = P(xw + dir * sp, 0, zm);
    const g = x.createLinearGradient(0, a[1], 0, b[1]);
    const c = col || [204, 213, 224];
    g.addColorStop(0, css(fog(mul(c, 1.04), zm))); g.addColorStop(1, css(fog(mul(c, 0.94), zm)));
    fill3(pts, g);
    // светлая кромка гребня
    x.beginPath(); top.forEach((p, i) => { const s = P(p[0], p[1], p[2]); if (i) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); });
    x.strokeStyle = css(fog([232, 236, 240], zm), 0.8); x.lineWidth = 1.5; x.stroke();
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
    driftSide(xw - 0.1, z0, z1, 0.8, 0.5, 1.9, 6102, [198, 208, 220]);
    // стена из профнастила, грязь снизу, цокольный отлив, угловой нащельник
    fill3([[xw, yf, z0], [xw, yt, z0], [xw, yt, z1], [xw, yf, z1]], sideFill(wallC, 'L', xw, z0, z1));
    ribs(xw, z0, z1, yf + 0.2, yt - 0.05, 0.32, wallC, 'L');
    [[0, 0.45, 0.2], [0.45, 0.9, 0.08]].forEach((b) => fill3([[xw, yf + b[0], z0], [xw, yf + b[1], z0], [xw, yf + b[1], z1], [xw, yf + b[0], z1]], 'rgba(46,34,30,' + b[2] + ')'));
    fill3([[xw, yf, z0], [xw, yf + 0.18, z0], [xw, yf + 0.18, z1], [xw, yf, z1]], sideFill([92, 96, 102], 'L', xw, z0, z1));
    fill3([[xw, yf, z1 - 0.14], [xw, yt, z1 - 0.14], [xw, yt, z1], [xw, yf, z1]], dk([214, 212, 204], z1));
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
    // табличка «ЛАБ-2»
    fill3([m(12.17, 2.62), m(12.17, 2.98), m(12.62, 2.98), m(12.62, 2.62)], dk([60, 88, 124], 12.4));
    textS('ЛАБ-2', xw + 0.01, 2.8, 12.2, 12.59, 0.2, css(lit([236, 238, 240], 'L', 12.4)));
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

  // ---------- Ближний правый модуль: дизельная электростанция «ДЭС» ----------
  function moduleR() {
    const xw = 7.2, xb = 11, z0 = 3, z1 = 13.5, yf = 1.1, yt = 4.2, wallC = [180, 178, 168];
    const m = (u, v) => [xw, v, u], m2 = (u, v) => [xw + 0.14, v, u];
    const lt = (c, z) => css(lit(c, 'Rt', z));
    underGap(xw, xb, z0, z1, yf, 2.5);
    driftSide(xw + 0.1, z0, z1, 0.7, 0.45, 1.6, 6202, [214, 222, 230]);
    fill3([[xw, yf, z0], [xw, yt, z0], [xw, yt, z1], [xw, yf, z1]], sideFill(wallC, 'Rt', xw, z0, z1));
    // цокольная полоса, стыки сэндвич-панелей (горизонтальные через 1 м, вертикальные через 3 м)
    fill3([[xw, yf, z0], [xw, yf + 0.55, z0], [xw, yf + 0.55, z1], [xw, yf, z1]], sideFill([88, 106, 124], 'Rt', xw, z0, z1));
    x.lineCap = 'butt';
    [yf + 0.55, 2.65, 3.65].forEach((yy) => line3([xw, yy, z0], [xw, yy, z1], 1.3, css(lit([120, 118, 110], 'Rt', 9), 0.8)));
    for (let z = 4.5; z < z1; z += 3) line3([xw, yf, z], [xw, yt, z], lw(0.03, z, 1.2), css(lit([128, 126, 118], 'Rt', z), 0.8));
    fill3([[xw, yf, z1 - 0.14], [xw, yt, z1 - 0.14], [xw, yt, z1], [xw, yf, z1]], lt([150, 152, 150], z1));
    // жалюзийная решётка радиатора с копотью над ней
    fill3([m(7.9, 1.9), m(7.9, 3.65), m(9.9, 3.65), m(9.9, 1.9)], lt([74, 78, 82], 8.9));
    for (let yy = 1.98; yy < 3.6; yy += 0.11) {
      fill3([m2(7.98, yy), m2(7.98, yy + 0.05), m2(9.82, yy + 0.05), m2(9.82, yy)], lt([150, 152, 150], 8.9));
    }
    const sa = P(xw, 3.65, 8.9), sb = P(xw, 4.15, 8.9), sg = x.createLinearGradient(0, sa[1], 0, sb[1]);
    sg.addColorStop(0, 'rgba(40,38,36,.35)'); sg.addColorStop(1, 'rgba(40,38,36,0)');
    fill3([m(7.8, 3.65), m(7.8, 4.15), m(10.0, 4.15), m(10.0, 3.65)], sg);
    // дверь, табличка «ДЭС», знак «высокое напряжение», маленькое окно
    fill3([m(10.82, yf), m(10.82, yf + 2.14), m(11.86, yf + 2.14), m(11.86, yf)], lt([84, 88, 92], 11.3));
    fill3([m2(10.9, yf), m2(10.9, yf + 2.05), m2(11.78, yf + 2.05), m2(11.78, yf)], lt([96, 110, 120], 11.3));
    fill3([m2(10.9, yf), m2(10.9, yf + 0.3), m2(11.78, yf + 0.3), m2(11.78, yf)], 'rgba(40,36,32,.3)');
    fill3([m2(10.95, 2.1), m2(10.95, 2.16), m2(11.05, 2.16), m2(11.05, 2.1)], css(fog([34, 36, 38], 11.3)));
    fill3([m(12.0, 2.62), m(12.0, 3.02), m(12.62, 3.02), m(12.62, 2.62)], lt([60, 88, 124], 12.3));
    textS('ДЭС', xw - 0.01, 2.82, 12.05, 12.57, 0.24, css(lit([238, 240, 242], 'Rt', 12.3)));
    const t0 = m(12.1, 2.0), t1 = m(12.5, 2.0), t2 = m(12.3, 2.42);
    path3([t0, t1, t2]); x.fillStyle = lt([196, 166, 70], 12.3); x.fill();
    x.strokeStyle = css(fog([30, 30, 30], 12.3)); x.lineWidth = 1.1; x.stroke();
    const b0 = P.apply(null, m(12.32, 2.34)), b1 = P.apply(null, m(12.27, 2.18)), b2 = P.apply(null, m(12.33, 2.18)), b3 = P.apply(null, m(12.28, 2.04));
    x.beginPath(); x.moveTo(b0[0], b0[1]); x.lineTo(b1[0], b1[1]); x.lineTo(b2[0], b2[1]); x.lineTo(b3[0], b3[1]); x.stroke();
    win(m, 12.85, 13.3, 2.4, 3.3, { z: 13.1, f: 'Rt', m2: m2, blind: 0.3 });
    // козырёк, фонарь, крыльцо поперёк стены к дороге
    box(xw - 0.9, xw, 3.55, 3.65, 10.6, 12.1, [100, 104, 110]);
    box(xw - 0.96, xw, 3.65, 3.82, 10.55, 12.15, { F: [226, 230, 236], S: [230, 234, 240], T: [236, 240, 244] });
    box(xw - 0.2, xw, 3.34, 3.5, 11.25, 11.45, [60, 62, 66]);
    fill3([[xw - 0.18, 3.34, 11.27], [xw - 0.02, 3.34, 11.27], [xw - 0.02, 3.34, 11.43], [xw - 0.18, 3.34, 11.43]], 'rgb(255,226,178)');
    const lp = P(xw - 0.1, 3.25, 11.35), lr = F * 1.4 / 11.35, lg = x.createRadialGradient(lp[0], lp[1], 1, lp[0], lp[1], lr);
    lg.addColorStop(0, 'rgba(255,214,160,.18)'); lg.addColorStop(1, 'rgba(255,214,160,0)');
    x.fillStyle = lg; x.fillRect(lp[0] - lr, lp[1] - lr * 0.4, 2 * lr, lr * 1.6);
    const rise = yf / 5, gr = [74, 80, 84], sn = { F: [226, 231, 236], S: [230, 234, 240], T: [234, 238, 242] };
    box(xw - 1.1, xw, yf - 0.08, yf, 10.65, 12.05, gr); box(xw - 1.05, xw, yf, yf + 0.05, 10.7, 12.0, sn);
    for (let i = 0; i < 4; i++) {
      const yy = yf - (i + 1) * rise, xa = xw - 1.1 - (i + 1) * 0.3;
      box(xa, xa + 0.3, yy - 0.05, yy, 10.75, 11.95, gr); box(xa + 0.02, xa + 0.3, yy, yy + 0.04, 10.78, 11.92, sn);
    }
    [10.72, 11.95].forEach((zz) => {
      line3([xw - 1.1, yf + 1.0, zz], [xw - 2.3, 1.0, zz], lw(0.045, zz, 1.3), lt([60, 66, 70], zz));
      line3([xw - 1.1, yf, zz], [xw - 1.1, yf + 1.0, zz], lw(0.045, zz, 1.3), lt([60, 66, 70], zz));
      line3([xw - 2.3, 0.1, zz], [xw - 2.3, 1.0, zz], lw(0.045, zz, 1.3), lt([60, 66, 70], zz));
    });
    // крыша: выхлопные трубы с колпаками и копотью, затем снег с карнизом
    [[8.6, 9.3], [8.9, 10.2]].forEach((v, i) => {
      post(v[0], v[1], 0.16, yt, yt + 1.7 + i * 0.25, [92, 70, 58]);
      box(v[0] - 0.24, v[0] + 0.24, yt + 1.7 + i * 0.25, yt + 1.78 + i * 0.25, v[1] - 0.24, v[1] + 0.24, [60, 50, 46]);
    });
    roofSnowSide(xw, z0, z1, yt + 0.12, 0.4, 6201);
    fill3([[xw - 0.28, yt + 0.25, 8.6], [xw - 0.28, yt + 0.5, 8.9], [xw - 0.28, yt + 0.5, 10.6], [xw - 0.28, yt + 0.25, 10.9]], 'rgba(70,66,62,.22)');
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
    wire([PX + 0.45, 6.6, POLES[0]], [-6.8, 3.95, 15.9], 0.6, 0.018, col(15));
    wire([PX + 0.95, 8.15, POLES[0]], [7.2, 4.0, 12.8], 0.25, 0.025, col(13));
  }

  // ---------- Отвалы снега вдоль дороги (после грейдера): видна внутренняя грань и гребень ----------
  const ROADW = 3.8;
  function berm(dir, segs, seed) {
    const n = Tex.perlin(seed), rr = Tex.rng(seed + 1);
    segs.forEach(function (sg) {
      const crest = [], foot = [], N = 46;
      for (let i = 0; i <= N; i++) {
        const z = sg[0] * Math.pow(sg[1] / sg[0], i / N), e = Math.min(1, (z - sg[0]) / 0.8, (sg[1] - z) / 0.8);
        const hh = (0.38 + 0.2 * n(z * 0.21, 1.1) + 0.1 * n(z * 0.9, 3.3) + 0.04 * n(z * 3.1, 6.6)) * Math.max(0.15, e);
        crest.push([dir * (ROADW + 0.45 + 0.15 * n(z * 0.4, 9.2)), hh, z]);
        foot.push([dir * (ROADW - 0.05 + 0.12 * n(z * 0.5, 5.4)), 0, z]);
      }
      const zm = Math.sqrt(sg[0] * sg[1]), f = dir < 0 ? 0.84 : 1.0;
      // внутренняя грань: у подножия грязная (брызги с дороги), к гребню чище
      const a = P(crest[N >> 1][0], crest[N >> 1][1], zm), b = P(foot[N >> 1][0], 0, zm);
      const g = x.createLinearGradient(0, a[1], 0, b[1]);
      g.addColorStop(0, css(fog(mul([222, 228, 234], f), zm))); g.addColorStop(0.6, css(fog(mul([196, 199, 200], f), zm)));
      g.addColorStop(1, css(fog(mul([162, 160, 154], f), zm)));
      fill3(crest.concat(foot.slice().reverse()), g);
      x.beginPath(); crest.forEach((p, i) => { const s = P(p[0], p[1], p[2]); if (i) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); });
      x.strokeStyle = css(fog([236, 240, 244], zm), 0.9); x.lineWidth = 1.4; x.stroke();
      x.beginPath(); foot.forEach((p, i) => { const s = P(p[0], 0, p[2]); if (i) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); });
      x.strokeStyle = 'rgba(70,66,60,.25)'; x.lineWidth = 1.2; x.stroke();
      // комья и глыбы, вывороченные отвалом
      // слоистые полосы от ножа грейдера и угловатые комья (тёмная нижняя грань, светлый верх)
      [0.12, 0.24, 0.33].forEach(function (yy, li) {
        x.beginPath();
        crest.forEach((p, i) => {
          const y2 = Math.min(p[1] * 0.92, yy * (0.92 + 0.08 * li)), q = P(lerp(foot[i][0], p[0], y2 / Math.max(0.01, p[1])), y2, p[2]);
          if (i) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]);
        });
        x.strokeStyle = css(fog(mul([150, 152, 150], f), zm), 0.18); x.lineWidth = 1.2; x.stroke();
      });
      for (let k = 0; k < 30; k++) {
        const z = sg[0] + (sg[1] - sg[0]) * Math.pow(rr(), 2), s = 0.04 + rr() * 0.09;
        if (z > 30) continue;
        const X = dir * (ROADW + 0.1 + rr() * 0.35), Y = 0.03 + rr() * 0.25, c = P(X, Y, z), r = F * s / z;
        const pts = [];
        for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2 + rr() * 0.6; pts.push([c[0] + Math.cos(a) * r * (0.7 + 0.5 * rr()), c[1] + Math.sin(a) * r * 0.6 * (0.7 + 0.5 * rr())]); }
        poly2(pts); x.fillStyle = css(fog(mul([168, 172, 176], f), z), 0.7); x.fill();
        poly2(pts.map((q) => [q[0] - r * 0.1, q[1] - r * 0.22])); x.fillStyle = css(fog(mul([222, 226, 230], f), z), 0.85); x.fill();
      }
    });
  }

  // ---------- Падающие тени: маска в 1/4 разрешения, мягкие края, умножение голубым ----------
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    pts.forEach((p) => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  const gP = (X, Y, Z) => P(X + Y * SHX, 0, Z + Y * SHZ);   // тень точки на земле в экранных координатах
  function shadows() {
    const c = cnv(W * K * 0.25, H * K * 0.25), s = c.getContext('2d');
    s.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
    const tint = 'rgb(0,0,0)';
    const shape = (pts) => { s.beginPath(); pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]))); s.closePath(); s.fillStyle = tint; s.fill(); };
    const boxS = (x0, x1, y0, y1, z0, z1) => {
      const pts = [];
      [x0, x1].forEach((X) => [y0, y1].forEach((Y) => [z0, z1].forEach((Z) => pts.push(gP(X, Y, Z)))));
      shape(hull(pts));
    };
    const postS = (X, Z, r, y1) => shape([gP(X - r, 0, Z), gP(X + r, 0, Z), gP(X + r, y1, Z), gP(X - r, y1, Z)]);
    // модули на сваях (корпус со снегом на крыше), сваи, антенна на крыше лаборатории
    boxS(-10.6, -6.5, 1.35, 4.95, 4, 16.5);
    for (let z = 4.4; z < 16.5; z += 2.4) postS(-7.0, z, 0.1, 1.35);
    postS(-8.6, 16, 0.05, 8.4);
    boxS(7.2, 11, 1.1, 4.8, 3, 13.5);
    POLES.forEach((z) => postS(PX, z, 0.13, 8.5));
    SHADOW_EXTRA.forEach((f) => f(boxS, postS, shape));
    // полутень: маску размываем, окрашиваем в холодный серо-голубой и умножаем на снег
    tintMul(c, 0.34, 3.4, 'rgb(4,30,66)');
    // контактные тени (ambient occlusion) у оснований: плотнее и уже, мягкий край
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
    foot(-6.9, -5.4, 8.1, 8.8); foot(4.6, 6.2, 10.6, 12.1);   // низ лестниц
    tintMul(a, 0.5, 3.2, 'rgb(14,30,56)');
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

  // ---------- Мелкие детали дороги у камеры: грунтозацепы, протектор, песок ----------
  function rutC(i, Z, n, n2) { return RUTS[i][0] + 0.28 * n(Z * 0.028, i * 3.7) + 0.05 * n2(Z * 0.35, i * 1.3); }
  function rutW(i, Z, n3) { return RUTS[i][1] * (1 + 0.4 * n3(Z * 0.07, i * 2.1)); }
  // Комья наката и льда (отваливаются с гусениц и с отвала): чаще у обочин, угловатые, со своей тенью
  function roadDetail() {
    const rr = Tex.rng(6401);
    for (let k = 0; k < 60; k++) {
      const side = rr() < 0.5 ? -1 : 1, edgeT = Math.pow(rr(), 0.6);
      const Z = 3.4 + Math.pow(rr(), 1.5) * 18, X = side * (ROADW - 0.25) * edgeT;
      const s = (0.035 + rr() * 0.06) * (rr() < 0.12 ? 1.9 : 1), r = F * s / Z;
      if (r < 1.6) continue;
      const c = P(X, 0, Z), nv = 6 + Math.floor(rr() * 3), pts = [];
      for (let j = 0; j < nv; j++) {
        const a = (j + rr() * 0.6) / nv * Math.PI * 2, rad = r * (0.55 + 0.55 * rr());
        pts.push([c[0] + Math.cos(a) * rad, c[1] - Math.abs(Math.sin(a)) * rad * 0.55 * (a > Math.PI ? 1.6 : 0.25)]);
      }
      const dirty = rr() < 0.55, base = dirty ? [158, 152, 142] : [204, 209, 214];
      // тень лежит вправо-вглубь (солнце слева), затем тёмный бок и светлый верх
      poly2(pts.map((q) => [q[0] + r * 0.7, q[1] + r * 0.05])); x.fillStyle = 'rgba(64,74,92,0.2)'; x.fill();
      poly2(pts); x.fillStyle = css(fog(mul(base, 0.8), Z)); x.fill();
      poly2(pts.map((q) => [lerp(q[0], c[0] - r * 0.25, 0.32), lerp(q[1], c[1] - r * 0.5, 0.32)]));
      x.fillStyle = css(fog(mul(base, 1.07), Z)); x.fill();
    }
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
  // бочка 200 л: обручи, снежная шапка (или голая крышка)
  function barrel(X, Z, c, snow, lying) {
    const r = 0.29, h = 0.88;
    cylBody(X, Z, r, 0, h, c, Z);
    x.strokeStyle = css(fog(mul(c, 0.55), Z), 0.8); x.lineWidth = Math.max(1, F * 0.018 / Z);
    [0.3, 0.6].forEach((t) => { const a = ring(X, h * t, Z, r, Math.PI, 0, 10); x.beginPath(); a.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke(); });
    const top = ring(X, h, Z, r * 1.0, 0, Math.PI * 2, 18);
    poly2(top); x.fillStyle = css(fog(mul(c, 0.8), Z)); x.fill();
    if (snow) {
      const s = ring(X, h + 0.05, Z, r * 0.96, 0, Math.PI * 2, 18);
      poly2(s); x.fillStyle = css(fog([228, 232, 237], Z)); x.fill();
    }
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
    if (label) textF(label, X + r * 0.12, h * 0.62, Z - r * 0.99, 0.42, css(fog([116, 68, 58], Z), 0.78));
    // вертикальная лестница с дугами ограждения у левого края
    const lx = X - r * 0.62, lz = Z - r * 0.78, lc = css(fog([64, 68, 72], Z));
    line3([lx - 0.22, 0.3, lz], [lx - 0.22, h + 1.0, lz], 1.3, lc); line3([lx + 0.22, 0.3, lz], [lx + 0.22, h + 1.0, lz], 1.3, lc);
    for (let yy = 0.6; yy < h; yy += 0.3) line3([lx - 0.22, yy, lz], [lx + 0.22, yy, lz], 1, lc);
    for (let yy = 2.4; yy < h + 1; yy += 0.9) { const a = P(lx, yy, lz - 0.35), rw = F * 0.38 / lz; x.beginPath(); x.ellipse(a[0], a[1], rw, rw * 0.18, 0, 0, Math.PI); x.strokeStyle = lc; x.lineWidth = 1; x.stroke(); }
    // перила по верху и снег на кромке крыши
    const tr = ring(X, h + 1.0, Z, r * 0.98, Math.PI, 0, 16);
    x.beginPath(); tr.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.strokeStyle = lc; x.lineWidth = 1.2; x.stroke();
    const t0 = ring(X, h, Z, r * 1.01, Math.PI, 0, 18), t1 = ring(X, h + 0.16, Z, r * 0.97, 0, Math.PI, 18);
    poly2(t0.concat(t1)); x.fillStyle = css(fog([228, 232, 236], Z)); x.fill();
  }

  // ---------- Склад ГСМ слева: два бака, будка насосной, сетчатый забор, бочки, фонарный столб ----------
  const TANKS = [[-9.4, 33.5, 2.1, 5.4, [170, 172, 168], 'ГСМ-2'], [-8.7, 26.5, 2.1, 5.4, [184, 186, 182], 'ГСМ-1']];
  const BARRELS = (function () {
    const rr = Tex.rng(6501), out = [], cols = [[78, 90, 104], [116, 74, 60], [98, 100, 80], [86, 88, 90], [126, 112, 80]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      if (rr() < 0.18) continue;
      out.push([-5.05 + j * 0.62 + rr() * 0.06, 19.9 + i * 0.64 + rr() * 0.08, cols[Math.floor(rr() * cols.length)], rr() < 0.8]);
    }
    for (let i = 0; i < 6; i++) out.push([-7.4 + (i % 3) * 0.62, 23.2 + Math.floor(i / 3) * 0.66, cols[i % 4], true]);
    return out.sort((a, b) => b[1] - a[1]);
  })();
  SHADOW_EXTRA.push(function (boxS, postS) {
    TANKS.forEach((t) => boxS(t[0] - t[2] * 0.8, t[0] + t[2] * 0.8, 0, t[3] + 0.2, t[1] - t[2] * 0.8, t[1] + t[2] * 0.8));
    BARRELS.forEach((b) => boxS(b[0] - 0.26, b[0] + 0.26, 0, 0.9, b[1] - 0.26, b[1] + 0.26));
    postS(-4.4, 19.5, 0.08, 7.2);
    boxS(-12.8, -10.6, 0, 2.7, 21.5, 24.0);
  });
  AO_EXTRA.push(function (foot, disc) {
    TANKS.forEach((t) => disc(t[0], t[1], t[2] + 0.4));
    BARRELS.forEach((b) => disc(b[0], b[1], 0.42));
    disc(-4.4, 19.5, 0.3);
    foot(-13.1, -10.3, 21.2, 24.3);
  });
  function tankFarm() {
    // будка насосной за баками, баки, трубопровод
    box(-12.8, -10.6, 0, 2.5, 21.5, 24.0, { F: [150, 140, 120], S: [150, 140, 120], T: [226, 230, 234] });
    fill3([[-12.0, 0, 21.49], [-11.2, 0, 21.49], [-11.2, 1.9, 21.49], [-12.0, 1.9, 21.49]], css(lit([84, 80, 74], 'F', 21.5)));
    box(-12.95, -10.45, 2.5, 2.75, 21.35, 24.15, { F: [226, 230, 236], S: [214, 222, 230], T: [234, 238, 242] });
    TANKS.forEach((t) => tankV(t[0], t[1], t[2], t[3], t[4], t[5]));
    line3([-7.2, 0.7, 25.2], [-5.6, 0.7, 25.2], lw(0.12, 25, 2), css(lit([60, 64, 68], 'F', 25)));
    driftF(-10.8, -6.6, 24.6, 0.55, 6503);
    BARRELS.filter((b) => b[0] < -5.6).forEach((b) => barrel(b[0], b[1], b[2], b[3]));
    fence(-5.5, 19.4, 42);
    BARRELS.filter((b) => b[0] >= -5.6).forEach((b) => barrel(b[0], b[1], b[2], b[3]));
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
    fill3([[cx - 1.5, dh + 0.5, z0], [cx + 1.9, dh + 0.5, z0], [cx + 1.9, dh + 1.15, z0], [cx - 1.5, dh + 1.15, z0]], css(lit([226, 224, 216], 'F', z0)));
    textF('СКЛАД 3', cx + 0.2, dh + 0.83, z0 - 0.02, 0.4, css(fog([52, 56, 64], z0)));
    box(cx + 0.1, cx + 0.5, dh + 1.4, dh + 1.55, z0 - 0.35, z0, [80, 84, 90]);
    // снег: сугроб у торца (в проезде ворот расчищено) и вдоль подошвы арки
    driftF(cx - r, dx0 - 0.4, z0, 0.9, 6601); driftF(dx1 + 0.4, cx + r, z0, 0.7, 6602);
    driftSide(cx - r + 0.05, z0 + 0.2, z1, 0.8, 0.6, 1.2, 6603, [214, 222, 230]);
  }

  // ---------- Гусеничный вездеход у обочины: видна корма и левый борт ----------
  const VH = { x0: 4.75, x1: 7.15, z0: 18.2, z1: 23.6 };
  SHADOW_EXTRA.push((boxS) => boxS(VH.x0, VH.x1, 0.2, 2.75, VH.z0, VH.z1));
  AO_EXTRA.push((foot) => foot(VH.x0 - 0.3, VH.x1 + 0.25, VH.z0 - 0.25, VH.z1 + 0.2));
  function vehicle() {
    const { x0, x1, z0, z1 } = VH, body = [160, 116, 70], dark = [46, 48, 50];
    // гусеница левого борта с катками
    box(x0 - 0.1, x0 + 0.45, 0.02, 0.95, z0, z1, { F: dark, S: [60, 62, 64], T: [70, 72, 74] });
    for (let i = 0; i < 6; i++) {
      const zc = z0 + 0.55 + i * (z1 - z0 - 1.1) / 5, pts = [];
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; pts.push(P(x0 - 0.11, 0.42 + Math.sin(a) * 0.36, zc + Math.cos(a) * 0.36)); }
      poly2(pts); x.fillStyle = css(lit([82, 86, 88], 'Rt', zc)); x.fill();
      const hub = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; hub.push(P(x0 - 0.12, 0.42 + Math.sin(a) * 0.12, zc + Math.cos(a) * 0.12)); }
      poly2(hub); x.fillStyle = css(lit([120, 122, 120], 'Rt', zc)); x.fill();
    }
    box(x0 - 0.1, x0 + 0.45, 0.8, 0.95, z0 + 0.1, z1 - 0.1, { F: dark, S: [52, 54, 56], T: [212, 218, 224] });
    box(x1 - 0.45, x1 + 0.1, 0.02, 0.95, z0, z1, { F: dark, S: dark, T: [70, 72, 74] });
    // корпус и кабина-кунг
    box(x0 + 0.2, x1 - 0.2, 0.6, 1.55, z0 + 0.05, z1, { F: body, S: body, T: body });
    box(x0 + 0.15, x1 - 0.15, 1.55, 2.7, z0 + 0.15, z1 - 0.4, { F: mul(body, 1.04), S: mul(body, 1.04), T: body });
    const m = (u, v) => [x0 + 0.15, v, u];
    [[z0 + 0.6, z0 + 1.5], [z0 + 1.8, z0 + 2.7], [z1 - 1.6, z1 - 0.7]].forEach((w) => win(m, w[0], w[1], 1.85, 2.4, { z: (w[0] + w[1]) / 2, f: 'Rt', fr: [70, 72, 74] }));
    // корма: дверь с окошком, фонари, канистры, поперечная полоса грязи
    const zr = z0 + 0.15, mf = (u, v) => [u, v, zr];
    fill3([mf(5.55, 1.6), mf(6.35, 1.6), mf(6.35, 2.6), mf(5.55, 2.6)], css(lit(mul(body, 0.82), 'F', zr)));
    fill3([mf(5.7, 2.15), mf(6.2, 2.15), mf(6.2, 2.5), mf(5.7, 2.5)], css(fog([70, 80, 92], zr)));
    [[x0 + 0.3, 1.25], [x1 - 0.45, 1.25]].forEach((l) => fill3([[l[0], l[1], z0 + 0.03], [l[0] + 0.16, l[1], z0 + 0.03], [l[0] + 0.16, l[1] + 0.1, z0 + 0.03], [l[0], l[1] + 0.1, z0 + 0.03]], css(fog([150, 50, 40], zr))));
    box(x1 - 0.95, x1 - 0.5, 0.9, 1.45, z0 - 0.2, z0 + 0.05, [96, 104, 78]);
    fill3([[x0 + 0.2, 0.6, z0 + 0.04], [x1 - 0.2, 0.6, z0 + 0.04], [x1 - 0.2, 0.95, z0 + 0.04], [x0 + 0.2, 0.95, z0 + 0.04]], 'rgba(70,60,50,.35)');
    // снег на крыше кунга (вид снизу — только передняя кромка) и на крыльях гусениц
    fill3([[x0 + 0.1, 2.7, z0 + 0.12], [x1 - 0.1, 2.7, z0 + 0.12], [x1 - 0.1, 2.9, z0 + 0.12], [x0 + 0.1, 2.9, z0 + 0.12]], css(fog([228, 232, 236], zr)));
    fill3([[x0 + 0.1, 2.7, z0 + 0.12], [x0 + 0.1, 2.9, z0 + 0.12], [x0 + 0.1, 2.9, z1 - 0.4], [x0 + 0.1, 2.7, z1 - 0.4]], css(lit([226, 231, 236], 'Rt', 21)));
  }

  // ---------- Земля: снежное поле и укатанная дорога (карта в перспективе) ----------
  // колеи: центр X, полуширина, сила (две основные пары и пара блуждающих следов)
  const RUTS = [[-2.35, 0.28, 0.9], [-0.8, 0.26, 0.8], [0.62, 0.38, 0.7], [2.25, 0.38, 0.75], [-1.55, 0.2, 0.35], [1.4, 0.28, 0.3]];
  // целочисленный хеш → [0,1): зерно песка и наста привязано к миру, а не к пикселям
  function hash2(i, j) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function ground() {
    const n = Tex.perlin(5201), n2 = Tex.perlin(5202), n3 = Tex.perlin(5203);
    const snow = [214, 219, 223], hollow = [176, 189, 203], road = [184, 182, 176], dirt = [144, 135, 120];
    const slush = [136, 130, 120], glaze = [194, 201, 208], ice = [203, 210, 216];
    const top = CY;
    const c = pixmap(0, top, W, H - top, 3, function (lx, ly, o) {
      const Z = F * EYE / Math.max(0.7, ly - CY), X = (lx - CX) * Z / F;
      const near = Math.exp(-Z / 70);
      // наметённые волны: светлее склоны, обращённые к солнцу (слева)
      const s = 0.09, h0 = n(X * s, Z * s), h1 = n((X + 0.42) * s, (Z + 0.22) * s);
      const shadeK = (h1 - h0) * 9 * near;
      const rip = n2(X * 0.8, Z * 0.22) * sm(25, 3, Z);
      let col = mix(snow, hollow, clamp(0.25 - shadeK * 0.9 + rip * 0.25 + h0 * 0.3, 0, 1));
      // зернистость наста вблизи
      if (Z < 12) col = mul(col, 1 + (hash2(Math.floor(X / 0.025), Math.floor(Z / 0.025)) - 0.5) * 0.05 * sm(12, 4, Z));
      // дорога
      const edge = ROADW + 0.25 * n3(Z * 0.18, 2.7);
      const rm = 1 - sm(edge - 0.35, edge + 0.15, Math.abs(X));
      if (rm > 0) {
        let rc = road, inRut = 0;
        const dd = sm(0.1, 0.5, Tex.fbm(n3, X * 0.22 + 9, Z * 0.1, 3) + 0.15);
        rc = mix(rc, dirt, 0.34 * dd);
        for (let i = 0; i < RUTS.length; i++) {
          const r = RUTS[i], xr = rutC(i, Z, n, n2), hw = rutW(i, Z, n3), dx = Math.abs(X - xr);
          const v = (1 - sm(hw * 0.45, hw * 1.2, dx)) * r[2] * (0.75 + 0.5 * n2(Z * 0.12 + 3, i));
          if (v <= 0) continue;
          inRut = Math.max(inRut, v);
          rc = mix(rc, slush, 0.5 * v);
          // накатанный лёд в середине колеи отражает пасмурное небо
          rc = mix(rc, glaze, 0.42 * v * (1 - sm(0, hw * 0.45, dx)) * sm(30, 5, Z));
          // отпечатки протектора «ёлочкой»: рвутся пятнами, только вблизи (дальше — муар)
          if (Z < 8.5 && i < 4) {
            const ph = Z / 0.19 + 2.2 * n2(Z * 0.25, i * 7.7) + dx * (i & 1 ? 1.4 : -1.4), f = ph - Math.floor(ph);
            const keep = sm(-0.05, 0.3, n3(Z * 0.8 + i * 5, X * 1.5)) * sm(8.5, 4, Z) * (1 - sm(hw * 0.55, hw * 0.95, dx)) * v;
            rc = mul(rc, 1 + keep * (f < 0.35 ? -0.08 : f < 0.5 ? 0.05 : 0));
          }
        }
        // песок пятнами, гуще в колеях; вдали зерно гаснет в общий тон
        if (Z < 16) {
          const hs = hash2(Math.floor(X / 0.016) + 7919, Math.floor(Z / 0.016));
          const zone = sm(-0.1, 0.45, Tex.fbm(n, X * 0.45 + 20, Z * 0.3, 2) + 0.25 * inRut), fade = sm(16, 6, Z);
          if (hs < 0.11 * zone) rc = mix(rc, hs < 0.035 * zone ? [84, 70, 56] : [122, 106, 86], 0.7 * fade);
          else if (hs > 0.988) rc = mix(rc, [236, 238, 240], 0.55 * fade);
        }
        rc = mix(rc, dirt, 0.18 * sm(5, 40, Z) * dd);
        // гладкие ледяные проплешины между колеями
        const ic = sm(0.3, 0.38, Tex.fbm(n2, X * 0.35 + 3, Z * 0.18 + 11, 2)) * (1 - inRut * 0.6);
        rc = mix(rc, ice, 0.5 * ic);
        rc = mul(rc, 1 + n2(X * 1.6, Z * 0.9) * 0.05 * near);
        col = mix(col, rc, rm);
      }
      col = fog(col, Z);
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2];
    });
    put(c, 0, top, W, H - top);
  }

  // ---------- Сборка ----------
  Backgrounds.scene('snow', function (ctx, R, th, o) {
    x = ctx; K = o.scale || 1;
    x.save();
    sky();
    mountains();
    ground();
    roadDetail();
    berm(-1, [[3, 7.4], [9.4, 20.5], [25.5, 120]], 6301);
    berm(1, [[3, 10.4], [12.4, 16.6], [24.5, 27.2], [31.5, 120]], 6302);
    shadows();
    forestBelt();
    forestEdges();
    mast(-4, 150, 42);
    radome(13, 158);
    mainBuilding();
    hangar();
    tankFarm();
    lampPost(-4.4, 19.5, 1);
    vehicle();
    moduleR();
    moduleL();
    powerLine();
    x.restore();
  });
})();
