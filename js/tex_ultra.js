'use strict';

// Узоры ✧ артефактов (100М+).
// Генераторы регистрируются через Tex.addGen(kind, fn); fn(f, R, n, n2, n3) → canvas Tex.W*S × Tex.H*S.
// Помощники: Tex.lib (pixels, vec, pal, mix, rgb, shade, fbm, perlin, rng, smooth, clamp01, blob, mk, full, grain, W, H, S).
// Узоры: royal, supernova, blackhole, liquidgold, abyss
// Текстура — одна плёнка на всё поле 512×192: клинки ножей видят правую часть (x ≈ 230…506), перчатки — левую
// (x ≈ 8…140), винтовки — почти всё поле. Поэтому у «сюжетных» узоров (вспышка, чёрная дыра) главный объект
// стоит справа, а второй, поменьше, — слева.
(function () {
  const L = Tex.lib;
  const W = L.W, H = L.H, S = L.S, TAU = Math.PI * 2;
  const fbm = L.fbm, mix = L.mix, smooth = L.smooth, clamp01 = L.clamp01, C = L.rgb;
  const FW = Math.round(W * S), FH = Math.round(H * S);

  // ---------- Общие помощники ----------
  // Значения на сетке (r — доля полного разрешения): { w, h, a, k — единиц поля на клетку }
  function field(r, fn) {
    const w = Math.round(FW * r), h = Math.round(FH * r), a = new Float32Array(w * h), k = W / w;
    let o = 0;
    for (let j = 0; j < h; j++) {
      const y = (j + 0.5) * k;
      for (let i = 0; i < w; i++) a[o++] = fn((i + 0.5) * k, y);
    }
    return { w: w, h: h, a: a, k: k };
  }
  // Попиксельная заливка без лишних массивов: fn(x, y, o) пишет o[0..2] (0..255)
  function raster(r, fn) {
    const w = Math.round(FW * r), h = Math.round(FH * r);
    const c = L.mk(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
    const k = W / w, o = new Float32Array(3);
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
  // Растянуть до полного размера текстуры
  function up(c) {
    if (c.width === FW) return c;
    const out = L.full(), x = out.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(c, 0, 0, out.width, out.height);
    return out;
  }
  // Таблица из 256 цветов по опорным цветам ('#hex' или [r, g, b])
  function lut(cols) {
    const cs = cols.map((c) => (typeof c === 'string' ? C(c) : c)), t = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const f = i / 255 * (cs.length - 1), k = Math.min(cs.length - 2, Math.floor(f)), c = mix(cs[k], cs[k + 1], f - k);
      t[i * 3] = c[0]; t[i * 3 + 1] = c[1]; t[i * 3 + 2] = c[2];
    }
    return t;
  }
  const li = (t) => (t <= 0 ? 0 : t >= 1 ? 765 : ((t * 255) | 0) * 3);   // индекс в таблице
  // Быстрое размытие (скользящее среднее по строкам и столбцам)
  function blurF(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h), k = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let acc = src[o] * (r + 1);
      for (let x = 1; x <= r; x++) acc += src[o + Math.min(x, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = acc * k;
        acc += src[o + Math.min(x + r + 1, w - 1)] - src[o + Math.max(x - r, 0)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = tmp[x] * (r + 1);
      for (let y = 1; y <= r; y++) acc += tmp[Math.min(y, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc * k;
        acc += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
      }
    }
    return out;
  }
  const rgba = (c, a) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
  const sq = (v) => v * v;
  // Таблица по опорам с позициями: [[0, c], [0.3, c], …, [1, c]]
  function lutAt(stops) {
    const st = stops.map((s) => [s[0], typeof s[1] === 'string' ? C(s[1]) : s[1]]), t = new Uint8ClampedArray(256 * 3);
    for (let i = 0, k = 0; i < 256; i++) {
      const v = i / 255;
      while (k < st.length - 2 && v > st[k + 1][0]) k++;
      const c = mix(st[k][1], st[k + 1][1], clamp01((v - st[k][0]) / (st[k + 1][0] - st[k][0])));
      t[i * 3] = c[0]; t[i * 3 + 1] = c[1]; t[i * 3 + 2] = c[2];
    }
    return t;
  }
  // Сплайн Кэтмулла — Рома через опорные точки: per точек на участок
  function spline(P, per) {
    const out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t, q = [0, 0];
        for (let c = 0; c < 2; c++) {
          q[c] = 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t3);
        }
        out.push(q);
      }
    }
    out.push(P[P.length - 1].slice());
    return out;
  }
  // Поле «расстояние до ломаной» на грубой сетке r: fn(x, y, res) → res[0] — расстояние со знаком (+ слева по ходу),
  // res[1] — доля длины от начала (0…1). Выборка билинейная.
  function curveField(pts, r) {
    const N = pts.length - 1, acc = [0];
    for (let i = 1; i <= N; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const tot = acc[N] || 1;
    const w = Math.round(FW * r), h = Math.round(FH * r), k = W / w, SD = new Float32Array(w * h), TT = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const x = (i + 0.5) * k, y = (j + 0.5) * k;
        let best = 1e18, bs = 0, bt = 0;
        for (let s = 0; s < N; s++) {
          const ax = pts[s][0], ay = pts[s][1], ex = pts[s + 1][0] - ax, ey = pts[s + 1][1] - ay, l2 = ex * ex + ey * ey || 1;
          let u = ((x - ax) * ex + (y - ay) * ey) / l2;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const qx = x - ax - ex * u, qy = y - ay - ey * u, dd = qx * qx + qy * qy;
          if (dd < best) { best = dd; bs = (ex * (y - ay) - ey * (x - ax)) >= 0 ? 1 : -1; bt = (acc[s] + u * (acc[s + 1] - acc[s])) / tot; }
        }
        SD[j * w + i] = Math.sqrt(best) * bs; TT[j * w + i] = bt;
      }
    }
    return function (x, y, res) {
      let gx = x / k - 0.5, gy = y / k - 0.5;
      if (gx < 0) gx = 0; if (gx > w - 1.001) gx = w - 1.001;
      if (gy < 0) gy = 0; if (gy > h - 1.001) gy = h - 1.001;
      const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, q = j * w + i;
      const a = (1 - fx) * (1 - fy), b = fx * (1 - fy), c = (1 - fx) * fy, d = fx * fy;
      res[0] = SD[q] * a + SD[q + 1] * b + SD[q + w] * c + SD[q + w + 1] * d;
      res[1] = TT[q] * a + TT[q + 1] * b + TT[q + w] * c + TT[q + w + 1] * d;
    };
  }

  // Четырёхлучевая искра (рисуется сложением света)
  function glint(ctx, x, y, s, col, a) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, rgba(col, 0.9)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    const k = s * 0.09;
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x + k, y - k, x + s, y); ctx.quadraticCurveTo(x + k, y + k, x, y + s);
    ctx.quadraticCurveTo(x - k, y + k, x - s, y); ctx.quadraticCurveTo(x - k, y - k, x, y - s);
    ctx.fill();
    ctx.restore();
  }
  // Гранёный камень: тёмный край, сочная середина, светлые грани, блик
  function gem(ctx, x, y, r, col) {
    const lt = mix(col, [255, 255, 255], 0.6), dk = mix(col, [0, 0, 0], 0.62);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
    g.addColorStop(0, rgba(lt, 1)); g.addColorStop(0.42, rgba(col, 1)); g.addColorStop(1, rgba(dk, 1));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (r > 1.8) {
      ctx.fillStyle = 'rgba(255,255,255,.2)';
      for (let k = 0; k < 8; k += 2) {
        const a0 = k * TAU / 8 - 0.4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 0.96, a0, a0 + TAU / 8); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = Math.max(0.25, r * 0.08);
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) { const a = k * TAU / 8 + 0.4; ctx.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.36, y - r * 0.4, r * 0.3, r * 0.17, -0.6, 0, TAU); ctx.fill();
  }
  function pearl(ctx, x, y, r) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#f1e6ef'); g.addColorStop(0.85, '#a893a8'); g.addColorStop(1, '#5d4a63');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  // Объёмный металл по маске: высота = размытая маска → нормали → свет, отражения, блик;
  // под металлом — мягкая тень на фоне. P — таблица цветов по освещённости (0 — тень, 1 — свет).
  const LX = -0.503, LY = -0.754, LZ = 0.4225;          // свет сверху слева
  const HX = -0.298, HY = -0.447, HZ = 0.843;           // полувектор для блика
  function metalOver(base, mask, P, o) {
    const w = base.width, h = base.height, N = w * h;
    const bctx = base.getContext('2d'), bi = bctx.getImageData(0, 0, w, h), bd = bi.data;
    const md = mask.getContext('2d').getImageData(0, 0, w, h).data;
    const a = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = md[i * 4 + 3] / 255;
    const hg = blurF(blurF(a, w, h, o.r), w, h, o.r);
    const sh = blurF(blurF(a, w, h, 3), w, h, 2);
    const K = o.k, sx = o.sx, sy = o.sy, SH = o.shadow, SP = o.spec, env = o.env;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, p = i * 4;
        const s = (y >= sy && x >= sx) ? sh[i - sy * w - sx] : 0;
        const dk = 1 - SH * s;
        let r = bd[p] * dk, g = bd[p + 1] * dk, b = bd[p + 2] * dk;
        const al = a[i];
        if (al > 0.004) {
          const gx = (hg[i + 1] - hg[i - 1]) * K, gy = (hg[i + w] - hg[i - w]) * K;
          const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
          const nx = -gx * inv, ny = -gy * inv, nz = inv;
          let t = 0.5 + 0.5 * (nx * LX + ny * LY + nz * LZ);
          if (env) t += env(x / S, y / S);
          const q = li(t);
          const nh = nx * HX + ny * HY + nz * HZ;
          const sp = nh > 0.8 ? Math.pow(nh, 36) * SP : 0;
          r += (P[q] + sp - r) * al; g += (P[q + 1] + sp - g) * al; b += (P[q + 2] + sp * 0.9 - b) * al;
        }
        bd[p] = r; bd[p + 1] = g; bd[p + 2] = b;
      }
    }
    bctx.putImageData(bi, 0, 0);
    return base;
  }

  // ---------- ♛ Королевский: пурпурный бархат, крупная золотая решётка, медальон с короной ----------
  // Решётка «огива» крупная (клетка 120×92): бархат занимает около двух третей поля. Ряд корон стоит на высоте
  // середины прямых клинков (y 94), розетки — между ними. Главный элемент — медальон (334, 74): корона над
  // большим камнем в оправе, лавровый венок и бант; он ложится на клинок керамбита и когтя и на цевьё винтовок,
  // решётка вокруг него растворяется.
  Tex.addGen('royal', function (f, R, n, n2, n3) {
    const gold = C(f.c[1]), pale = C(f.c[2]), vio = C(f.c[3]), ruby = C(f.c[4]);
    // 1) Бархат: крупные складки, ворс светится на склонах, во впадинах — глубокая тень
    const F = field(0.5, (x, y) => {
      const px = x * 0.0058, py = y * 0.0118;
      const wx = fbm(n2, px * 0.8 + 3.1, py * 0.8, 2);
      return fbm(n, px + 1.3 * wx, py + 0.5 * wx, 4) + 0.1 * fbm(n3, x * 0.045, y * 0.07, 2);
    });
    const VEL = lutAt([[0, [7, 0, 18]], [0.26, [36, 5, 72]], [0.52, [76, 14, 140]], [0.78, [120, 40, 200]], [1, [178, 104, 244]]]);
    const vel = (function () {
      const w = F.w, h = F.h, a = F.a, K = 26 / (2 * F.k);
      const c = L.mk(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const q = j * w + i;
          const gx = (a[i < w - 1 ? q + 1 : q] - a[i > 0 ? q - 1 : q]) * K, gy = (a[j < h - 1 ? q + w : q] - a[j > 0 ? q - w : q]) * K;
          const sl = Math.sqrt(gx * gx + gy * gy);
          const t = 0.2 + 0.5 * smooth(0.06, 1.0, sl) + 0.26 * (-gx * 0.55 - gy * 0.8) + 0.5 * a[q];
          const v = li(t), p = q * 4;
          d[p] = VEL[v]; d[p + 1] = VEL[v + 1]; d[p + 2] = VEL[v + 2]; d[p + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return up(c);
    })();

    // 2) Маска золота
    const mask = L.full(), m = mask.getContext('2d');
    m.scale(S, S); m.lineCap = 'round'; m.lineJoin = 'round'; m.fillStyle = m.strokeStyle = '#fff';
    const CW = 120, RH = 92, A = 60, X0 = 94, Y0 = 48, MX = 334, MY = 74;
    const sine = (xk, amp, sg) => {
      m.beginPath();
      for (let y = -10; y <= H + 10; y += 1.5) { const x = xk + sg * amp * Math.sin(Math.PI * (y - Y0) / RH); if (y === -10) m.moveTo(x, y); else m.lineTo(x, y); }
      m.stroke();
    };
    for (let k = -1; k <= 4; k++) {
      const xk = X0 + k * CW;
      m.lineWidth = 4.4; sine(xk, A, 1); sine(xk, A, -1);
      m.lineWidth = 0.75; sine(xk, A - 9, 1); sine(xk, A - 9, -1);
    }
    const cross = [], touch = [], crowns = [], roses = [];
    for (let k = -1; k <= 4; k++) {
      for (let r = -1; r <= 2; r++) {
        const x = X0 + k * CW, y = Y0 + r * RH;
        cross.push([x, y]); touch.push([x + A, y + RH / 2]); crowns.push([x, y + RH / 2 + 6]); roses.push([x + A, y]);
      }
    }
    const far = (p) => Math.hypot(p[0] - MX, p[1] - MY) > 46;          // у медальона решётки нет
    const vis = (p, pad) => p[0] > -pad && p[0] < W + pad && p[1] > -pad && p[1] < H + pad && far(p);
    const disc = (x, y, r) => { m.beginPath(); m.arc(x, y, r, 0, TAU); m.fill(); };
    // корона: обод, пять зубцов с шариками, крестик, завитки снизу
    const TX = [-13, -6.5, 0, 6.5, 13], TY = [-5, -8.5, -12, -8.5, -5];
    function crown(cx, cy, s) {
      m.beginPath();
      m.moveTo(cx - 12 * s, cy + 4 * s); m.lineTo(cx + TX[0] * s, cy + TY[0] * s);
      for (let i = 0; i < 4; i++) m.quadraticCurveTo(cx + (TX[i] + TX[i + 1]) / 2 * s, cy + 2.6 * s, cx + TX[i + 1] * s, cy + TY[i + 1] * s);
      m.lineTo(cx + 12 * s, cy + 4 * s); m.closePath(); m.fill();
      m.beginPath(); m.moveTo(cx - 13.5 * s, cy + 3 * s); m.lineTo(cx + 13.5 * s, cy + 3 * s); m.lineTo(cx + 13.5 * s, cy + 9 * s); m.lineTo(cx - 13.5 * s, cy + 9 * s); m.closePath(); m.fill();
      for (let i = 0; i < 5; i++) disc(cx + TX[i] * s, cy + (TY[i] - 1.3) * s, 2.4 * s);
      m.fillRect(cx - 0.9 * s, cy - 21 * s, 1.8 * s, 7.5 * s); m.fillRect(cx - 3.1 * s, cy - 18.6 * s, 6.2 * s, 1.8 * s);
      [-1, 1].forEach((sg) => {
        m.lineWidth = 1.1 * s; m.beginPath();
        m.moveTo(cx + sg * 2 * s, cy + 12.5 * s);
        m.bezierCurveTo(cx + sg * 8 * s, cy + 16 * s, cx + sg * 15 * s, cy + 13 * s, cx + sg * 15 * s, cy + 9.5 * s);
        m.bezierCurveTo(cx + sg * 15 * s, cy + 7.6 * s, cx + sg * 12.5 * s, cy + 7.6 * s, cx + sg * 12.6 * s, cy + 9.4 * s);
        m.stroke();
      });
    }
    // розетка: оправа камня, 8 лепестков, 4 бусины; стебли с завитками к соседним пересечениям
    function rosette(cx, cy) {
      const s = 1.45;
      disc(cx, cy, 6.6 * s);
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + TAU / 16;
        m.beginPath(); m.ellipse(cx + Math.cos(a) * 9.8 * s, cy + Math.sin(a) * 9.8 * s, 3.5 * s, 1.6 * s, a, 0, TAU); m.fill();
      }
      for (let i = 0; i < 4; i++) { const a = i * TAU / 4; disc(cx + Math.cos(a) * 14.4 * s, cy + Math.sin(a) * 14.4 * s, 1.5 * s); }
      m.lineWidth = 1.3;
      [-1, 1].forEach((sg) => {
        m.beginPath(); m.moveTo(cx + sg * 23, cy); m.lineTo(cx + sg * 52, cy); m.stroke();
        [-1, 1].forEach((sv) => {
          m.beginPath();
          m.moveTo(cx + sg * 27, cy);
          m.bezierCurveTo(cx + sg * 30, cy + sv * 9, cx + sg * 39, cy + sv * 11, cx + sg * 41, cy + sv * 7);
          m.bezierCurveTo(cx + sg * 42.6, cy + sv * 4.2, cx + sg * 38.4, cy + sv * 3.1, cx + sg * 37.8, cy + sv * 5.8);
          m.stroke();
        });
        m.beginPath(); m.moveTo(cx, cy + sg * 23); m.lineTo(cx, cy + sg * 36); m.stroke();
      });
    }
    crowns.forEach((p) => { if (vis(p, 40)) crown(p[0], p[1], 1.5); });
    roses.forEach((p) => { if (vis(p, 40)) rosette(p[0], p[1]); });
    cross.forEach((p) => {
      if (!vis(p, 10)) return;
      disc(p[0], p[1], 6);
      for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + TAU / 8; disc(p[0] + Math.cos(a) * 6.6, p[1] + Math.sin(a) * 6.6, 1.4); }
    });
    touch.forEach((p) => { if (vis(p, 10)) disc(p[0], p[1], 5); });
    // решётка растворяется вокруг медальона
    m.globalCompositeOperation = 'destination-out';
    const fg = m.createRadialGradient(MX, MY, 36, MX, MY, 60);
    fg.addColorStop(0, 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = fg; m.fillRect(MX - 62, MY - 62, 124, 124);
    m.globalCompositeOperation = 'source-over'; m.fillStyle = m.strokeStyle = '#fff';
    // медальон: лавровый венок, оправа камня с бусинами, корона, бант
    const LR = 25;
    [-1, 1].forEach((sg) => {
      const a0 = Math.PI / 2 + sg * 0.3, a1 = Math.PI / 2 + sg * 2.62, pt = (a, r) => [MX + Math.cos(a) * r, MY + 2 + Math.sin(a) * r];
      m.lineWidth = 1.7; m.beginPath();
      for (let i = 0; i <= 30; i++) { const p = pt(a0 + (a1 - a0) * i / 30, LR); if (i) m.lineTo(p[0], p[1]); else m.moveTo(p[0], p[1]); }
      m.stroke();
      for (let i = 0; i < 9; i++) {
        const a = a0 + (a1 - a0) * (i + 0.6) / 9.4, tg = a + sg * Math.PI / 2;      // направление роста ветви
        [1, -1].forEach((side) => {
          const p = pt(a, LR + side * 4.2), ang = tg - side * sg * 0.55;
          m.beginPath(); m.ellipse(p[0], p[1], 4.4 - i * 0.12, 1.75, ang, 0, TAU); m.fill();
        });
      }
    });
    disc(MX, MY, 13.2);
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; disc(MX + Math.cos(a) * 15.8, MY + Math.sin(a) * 15.8, 1.55); }
    crown(MX, MY - 29, 1.05);
    m.lineWidth = 1.4;
    [-1, 1].forEach((sg) => {
      m.beginPath(); m.ellipse(MX + sg * 6.5, MY + 29, 6, 3.2, sg * 0.35, 0, TAU); m.stroke();
      m.beginPath(); m.moveTo(MX + sg * 1.5, MY + 30); m.quadraticCurveTo(MX + sg * 7, MY + 37, MX + sg * 11, MY + 40); m.stroke();
    });
    disc(MX, MY + 29, 2.6);
    // гравировка: тонкие канавки на коронах и оправе
    m.globalCompositeOperation = 'destination-out';
    m.lineWidth = 0.7; m.beginPath();
    const groove = (cx, cy, s) => {
      m.moveTo(cx - 12.6 * s, cy + 3.2 * s); m.lineTo(cx + 12.6 * s, cy + 3.2 * s);
      m.moveTo(cx - 12.6 * s, cy + 8.6 * s); m.lineTo(cx + 12.6 * s, cy + 8.6 * s);
      [1, 3].forEach((i) => { m.moveTo(cx + TX[i] * 0.5 * s, cy + 2.4 * s); m.quadraticCurveTo(cx + TX[i] * 0.9 * s, cy - s, cx + TX[i] * s, cy + (TY[i] + 1.6) * s); });
      m.moveTo(cx, cy + 2.4 * s); m.lineTo(cx, cy + (TY[2] + 1.6) * s);
    };
    crowns.forEach((p) => { if (vis(p, 40)) groove(p[0], p[1], 1.5); });
    groove(MX, MY - 29, 1.05);
    m.moveTo(MX + 11.4, MY); m.arc(MX, MY, 11.4, 0, TAU);
    m.stroke();
    m.globalCompositeOperation = 'source-over';

    // 3) Полированное золото поверх бархата
    const GOLD = lut([[20, 9, 0], [58, 30, 2], mix(gold, [70, 34, 0], 0.62), mix(gold, [120, 60, 0], 0.4), mix(gold, [150, 80, 0], 0.18),
      gold, mix(gold, pale, 0.6), [255, 250, 225]]);
    metalOver(vel, mask, GOLD, { r: 1, k: 3.6, sx: 2, sy: 3, shadow: 0.72, spec: 240,
      env: (x, y) => 0.07 * n2(x * 0.06, y * 0.06) });

    // 4) Камни: немного, но крупные и с сильным бликом
    const ctx = vel.getContext('2d');
    ctx.save(); ctx.scale(S, S);
    const dia = [235, 240, 255], sap = [70, 90, 255];
    crowns.forEach((p) => {
      if (!vis(p, 40)) return;
      gem(ctx, p[0], p[1] + 9, 3.4, ruby); gem(ctx, p[0] - 11.4, p[1] + 9, 2.2, vio); gem(ctx, p[0] + 11.4, p[1] + 9, 2.2, vio);
      for (let i = 0; i < 5; i++) pearl(ctx, p[0] + TX[i] * 1.5, p[1] + (TY[i] - 1.3) * 1.5, 2.3);
    });
    roses.forEach((p, i) => { if (vis(p, 14)) gem(ctx, p[0], p[1], 7.2, i % 2 ? ruby : dia); });
    cross.forEach((p) => { if (vis(p, 8)) gem(ctx, p[0], p[1], 4, vio); });
    touch.forEach((p) => { if (vis(p, 8)) gem(ctx, p[0], p[1], 3.4, ruby); });
    // медальон: большой рубин в оправе, бриллианты по кругу, камни короны
    gem(ctx, MX, MY, 10.2, ruby);
    for (let i = 0; i < 12; i += 2) { const a = i * TAU / 12 + TAU / 24; gem(ctx, MX + Math.cos(a) * 15.8, MY + Math.sin(a) * 15.8, 1.9, dia); }
    gem(ctx, MX, MY - 29 + 6.3, 2.6, sap); gem(ctx, MX - 8, MY - 29 + 6.3, 1.7, dia); gem(ctx, MX + 8, MY - 29 + 6.3, 1.7, dia);
    for (let i = 0; i < 5; i++) pearl(ctx, MX + TX[i] * 1.05, MY - 29 + (TY[i] - 1.3) * 1.05, 1.7);
    // блики: звёздочки на крупных камнях
    glint(ctx, MX - 3.5, MY - 4, 15, pale, 0.95);
    roses.forEach((p) => { if (vis(p, 4) && R() < 0.75) glint(ctx, p[0] - 2.2, p[1] - 2.5, 8 + R() * 4, pale, 0.85); });
    ctx.restore();
    return vel;
  });

  // ---------- ✦ Сверхновая: белое ядро, золотая корона, ударные оболочки, волокна выброса ----------
  // Одна вспышка (336, 76): середина клинка керамбита и когтя, цевьё винтовок, верх прямых клинков.
  // Свет складывается линейно и сжимается тональной кривой 1 − e^(−k·I): белое — только маленькое ядро,
  // дальше золото, затем маджента. Две тонкие ударные оболочки: резкий передний фронт, мягкий след внутри,
  // фронт рвётся на волокна. Радиальные волокна выброса доходят до приклада, магазина и перчаток.
  Tex.addGen('supernova', function (f, R, n, n2, n3) {
    const bg = C(f.c[0]), pink = C(f.c[1]), gold = C(f.c[2]), cyan = C(f.c[3]), white = [255, 255, 255];
    const NX = 336, NY = 76, NA = 1024;
    const lin = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
    const GS = lin(mix(gold, [255, 150, 20], 0.45)), PK = lin(pink), CY = lin(cyan), DP = [0.36, 0.05, 0.42], GL = lin(gold);
    // по направлению: неровность радиуса оболочек и их разрывы (таблицы по углу без шва)
    const A1 = new Float32Array(NA), B1 = new Float32Array(NA), A2 = new Float32Array(NA), B2 = new Float32Array(NA);
    for (let i = 0; i < NA; i++) {
      const a = i / NA * TAU, c = Math.cos(a), s = Math.sin(a);
      A1[i] = 54 * (1 + 0.05 * fbm(n2, c * 2.5 + 11, s * 2.5, 2));
      B1[i] = 0.4 + 0.85 * clamp01(fbm(n3, c * 13 + 5, s * 13, 2) + 0.45);
      A2[i] = 126 * (1 + 0.04 * fbm(n2, c * 2.2 + 21, s * 2.2, 2));
      B2[i] = 0.3 + 0.9 * clamp01(fbm(n3, c * 17 + 9, s * 17, 2) + 0.4);
    }
    // пыль: тёмные пурпурные облака (грубая сетка)
    const DU = coarse(0.25, (x, y) => {
      const qx = fbm(n2, x * 0.006 + 3, y * 0.011, 2);
      return smooth(-0.25, 0.45, fbm(n3, x * 0.0085 + 1.4 * qx, y * 0.016 + 0.8 * qx, 3));
    });
    const sky = raster(0.75, (x, y, o) => {
      const dx = x - NX, dy = y - NY, d = Math.sqrt(dx * dx + dy * dy) + 0.001, ca = dx / d, sa = dy / d;
      const ai = (((Math.atan2(dy, dx) / TAU + 1) % 1) * NA) | 0;
      // ядро, корона, гало
      const core = 3.4 * Math.exp(-d / 3.2), cor = 1.5 * Math.exp(-d / 11), halo = 0.55 * Math.exp(-d / 42) + 0.13 * Math.exp(-d / 150);
      // радиальные волокна выброса: шум по направлению, медленно — по радиусу
      const ld = Math.log(d + 6);
      const v1 = fbm(n, ca * 7 + ld * 0.55, sa * 7 - ld * 0.4, 3);
      const rid = Math.pow(clamp01(1 - Math.abs(v1) * 3.3), 3);
      const clump = 0.35 + 0.9 * clamp01(n2(ca * 2.2 + ld * 1.1, sa * 2.2 + 3.1) + 0.4);
      const fil = rid * clump * smooth(6, 26, d) * (0.32 + 0.68 * Math.exp(-d / 170));
      const ft = smooth(25, 170, d);
      // ударные оболочки
      let e = d - A1[ai];
      const s1 = (e > 0 ? Math.exp(-sq(e / 0.9)) : 0.6 * Math.exp(-sq(e / 1.2)) + 0.4 * Math.exp(e / 9)) * B1[ai];
      e = d - A2[ai];
      const s2 = (e > 0 ? Math.exp(-sq(e / 1.0)) : 0.55 * Math.exp(-sq(e / 1.3)) + 0.45 * Math.exp(e / 13)) * B2[ai];
      const du = DU(x, y) * (1 - 0.6 * Math.exp(-d / 60));
      for (let c = 0; c < 3; c++) {
        const L1 = core + cor * GS[c] + halo * PK[c] + fil * (GS[c] * (1 - ft) + PK[c] * ft) * 0.95 +
          s1 * (GL[c] * 0.55 + PK[c] * 0.45) * 0.95 + s2 * CY[c] * 0.75 + du * DP[c] * 0.55 + bg[c] / 255;
        o[c] = 255 * (1 - Math.exp(-1.3 * L1));
      }
    });
    const ctx = sky.getContext('2d');
    ctx.save(); ctx.scale(S, S); ctx.globalCompositeOperation = 'lighter';
    // звёзды
    const COLS = [white, gold, pink, cyan];
    for (let i = 0; i < 300; i++) {
      const x = R() * W, y = R() * H, col = COLS[Math.floor(R() * COLS.length)];
      ctx.globalAlpha = 0.25 + 0.6 * R(); ctx.fillStyle = rgba(col, 1);
      ctx.beginPath(); ctx.arc(x, y, 0.22 + R() * 0.5, 0, TAU); ctx.fill();
    }
    // лучи: немного, тонкие и длинные, плавно сходят на нет
    const ray = (a, len, bw, col, al) => {
      const ca = Math.cos(a), sa = Math.sin(a), g = ctx.createRadialGradient(NX, NY, 0, NX, NY, len);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, rgba(col, 0.9)); g.addColorStop(0.4, rgba(col, 0.3)); g.addColorStop(1, rgba(col, 0));
      ctx.globalAlpha = al; ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(NX - sa * bw, NY + ca * bw); ctx.lineTo(NX + ca * len, NY + sa * len); ctx.lineTo(NX + sa * bw, NY - ca * bw);
      ctx.closePath(); ctx.fill();
    };
    for (let i = 0; i < 16; i++) {
      const a = (i + 0.2 + 0.6 * R()) / 16 * TAU;
      ray(a, 120 + 210 * R(), 0.6 + 0.9 * R(), R() < 0.5 ? gold : pink, 0.3 + 0.35 * R());
    }
    [[-0.07, 330, 1.7], [Math.PI - 0.07, 330, 1.7], [Math.PI / 2 - 0.07, 105, 1.3], [-Math.PI / 2 - 0.07, 105, 1.3]].forEach((q) => ray(q[0], q[1], q[2], gold, 0.85));
    // редкие искры
    for (let i = 0; i < 9; i++) {
      const a = R() * TAU, dd = 30 + R() * 260;
      glint(ctx, NX + Math.cos(a) * dd * 1.4, NY + Math.sin(a) * dd * 0.55, 3 + R() * 4, R() < 0.5 ? gold : cyan, 0.75);
    }
    ctx.restore();
    return sky;
  });

  // ---------- ● Чёрная дыра: тень горизонта, раскалённый диск, линзированная дуга, приливный поток ----------
  // Дыра стоит там, где её видит почти каждая модель: середина клинка керамбита и когтя, цевьё винтовок,
  // верх прямых клинков (центр 330, 70). Диск наклонён вниз вправо: правый край проходит по прямым клинкам,
  // левый — по ствольной коробке. Слева звезду рвут приливные силы (перчатки, кольцо керамбита, приклад):
  // её вещество широкой витой струёй идёт через приклад, рукоять и магазин и вливается в диск.
  // Фон — туманность и звёзды за дырой, искажённые гравитационной линзой.
  Tex.addGen('blackhole', function (f, R, n, n2, n3) {
    const orange = C(f.c[1]), hot = C(f.c[2]), vio = C(f.c[3]), white = [255, 255, 255];
    const HX = 330, HY = 70, RS = 17, TE = RS * 1.85, TE2 = TE * TE;     // центр, радиус тени, радиус Эйнштейна
    const TL = 0.13, CT = Math.cos(TL), ST = Math.sin(TL), QD = 0.2;     // наклон и сплюснутость диска
    const RIN = 1.5, ROUT = 8.2;                                          // диск — в радиусах тени
    // жар: 0 — темно, дальше тёмно-красный, оранжевый, золото, белый (белый — только у самой кромки)
    const DISK = lutAt([[0, [0, 0, 0]], [0.18, [64, 10, 3]], [0.36, [156, 40, 6]], [0.55, orange], [0.74, mix(orange, hot, 0.6)],
      [0.9, hot], [1, white]]);
    const RU = [206, 84, 30];                                            // ржавая пыль туманности
    // излучение диска: ρ — радиус (в RS), φ — азимут (φ = π — приближающаяся, яркая левая сторона)
    function emit(rho, ph) {
      if (rho < RIN * 0.85 || rho > ROUT) return 0;
      const prof = smooth(RIN * 0.85, RIN * 1.3, rho) * Math.pow(RIN / rho, 1.3) * (1 - smooth(ROUT * 0.55, ROUT, rho));
      const tw = ph - 2.4 * Math.log(rho), c = Math.cos(tw), s = Math.sin(tw);       // спиральная закрутка волокон
      const fl = fbm(n2, c * 1.3 + rho * 3.1, s * 1.3 - rho * 1.2, 3);
      const dop = 0.3 + 0.5 * Math.pow(1 - 0.55 * Math.cos(ph), 2.2);               // доплеровское усиление
      return prof * (0.35 + 1.45 * Math.max(0, fl + 0.2)) * dop;
    }
    // приливный поток: от звезды через приклад и рукоять к передней кромке диска
    const STAR = [54, 100];
    const SF = curveField(spline([STAR, [96, 114], [152, 108], [200, 94], [240, 82], [278, 80], [314, 88]], 12), 0.25);
    const sr = new Float32Array(2);
    // туманность (плотность с пылевыми прожилками и оттенок) — на грубой сетке, выборка через линзу
    const NEB = coarse(0.25, (x, y) => {
      const px = x * 0.0072, py = y * 0.0135;
      const qx = fbm(n, px, py, 3), qy = fbm(n3, px * 0.8 + 4.7, py * 0.8 + 2.1, 2);
      const nb = fbm(n2, px + 1.6 * qx, py + 1.6 * qy, 3) + 0.25 * fbm(n, px * 3.1 + 8, py * 3.1, 2);
      return smooth(-0.32, 0.36, nb) * (0.55 + 0.45 * smooth(400, 60, x)) * (0.38 + 0.62 * smooth(0.0, 0.12, Math.abs(qx + 0.04)));
    });
    const HUE = coarse(0.25, (x, y) => clamp01(0.22 + 2.0 * fbm(n3, x * 0.00576 + 4.7, y * 0.0108 + 2.1, 2)));   // ржавый ↔ фиолетовый
    const sky = raster(0.75, (x, y, o) => {
      const dx = x - HX, dy = y - HY, d2 = dx * dx + dy * dy, d = Math.sqrt(d2), dd = d / RS;
      let r = 0, g = 0, b = 0, E = 0;
      if (dd > 1) {
        // фон за дырой: точка-линза переносит выборку в плоскость источника (β = θ·(1 − θE²/θ²))
        const kq = 1 - TE2 / d2, sx = HX + dx * kq, sy = HY + dy * kq;
        const ring = Math.exp(-sq((d - TE) / (0.45 * RS)));                          // кольцо Эйнштейна
        const dens = NEB(sx, sy) * (1 + 1.3 * ring), ht = HUE(sx, sy);
        const halo = Math.exp(-(d - RS) / (1.5 * RS)) * 0.2, haze = Math.exp(-d / 150) * 0.07, k = dens * 0.8;
        r = 5 + (RU[0] + (vio[0] - RU[0]) * ht) * k + orange[0] * halo + vio[0] * haze;
        g = 3 + (RU[1] + (vio[1] - RU[1]) * ht) * k + orange[1] * halo + vio[1] * haze;
        b = 9 + (RU[2] + (vio[2] - RU[2]) * ht) * k + orange[2] * halo + vio[2] * haze;
        // дальняя часть диска, поднятая линзой в широкую дугу над тенью и узкую — под ней; фотонное кольцо
        if (dd < 1.75) {
          const cs = (dx * CT + dy * ST) / d, sn = (-dx * ST + dy * CT) / d, ph = Math.atan2(sn, cs);
          if (dd > 1.04) {
            if (sn < 0) E += emit(RIN + (dd - 1.04) * 11, ph) * Math.pow(-sn, 0.4) * 1.45;
            else if (dd < 1.3) E += emit(RIN + (dd - 1.04) * 26, -ph) * Math.pow(sn, 0.7) * 0.65;
          }
          E += Math.exp(-sq((dd - 1.035) / 0.032)) * (1.05 - 0.75 * cs) + Math.exp(-sq((dd - 1.1) / 0.09)) * 0.25 * (1 - 0.6 * cs);
        }
      }
      // прямое изображение диска: за тенью видна только его передняя половина
      const u = dx * CT + dy * ST, v = (-dx * ST + dy * CT) / QD, rho = Math.sqrt(u * u + v * v) / RS;
      if (rho < ROUT && (dd > 1 || v > 0)) E += emit(rho, Math.atan2(v, u)) * 0.95;
      // поток: три витые пряди, волокна вдоль течения, широкое свечение
      SF(x, y, sr);
      const t = sr[1], wd = 4 + 12 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.95)), 0.6);
      if (Math.abs(sr[0]) < wd * 3.2 && t > 0.003 && t < 0.997) {
        const s = sr[0] + wd * 0.45 * fbm(n, t * 5 + 3.3, sr[0] * 0.05 + 1.1, 2);
        const tw = t * 10.5;
        let e = 0;
        for (let i = 0; i < 3; i++) e += Math.exp(-sq((s - wd * 0.38 * Math.sin(tw + i * 2.094)) / (wd * (0.15 + 0.05 * i)))) * (1 - 0.18 * i);
        const fil = 0.5 + 0.95 * Math.max(0, fbm(n3, t * 9 + 7, s * 0.5, 2) + 0.25);
        const glow = Math.exp(-sq(s / (wd * 1.3)));
        E += (e * fil * 0.85 + glow * 0.3) * smooth(0, 0.06, t) * (1 - 0.6 * smooth(0.72, 1, t)) * (0.75 + 0.5 * (1 - t));
      }
      const q = li(1 - Math.exp(-1.45 * E));
      o[0] = r + DISK[q]; o[1] = g + DISK[q + 1]; o[2] = b + DISK[q + 2];
    });
    const ctx = sky.getContext('2d');
    ctx.save(); ctx.scale(S, S); ctx.globalCompositeOperation = 'lighter';
    // звёзды за дырой: у точечной линзы у каждой звезды два изображения, у кольца Эйнштейна они растянуты в дужки
    const SC = [white, hot, [255, 196, 150], [196, 180, 255]];
    for (let i = 0; i < 420; i++) {
      const bx = R() * (W + 40) - 20, by = R() * (H + 40) - 20, m0 = Math.pow(R(), 3), col = SC[Math.floor(R() * SC.length)];
      const ex = bx - HX, ey = by - HY, bd = Math.hypot(ex, ey) || 0.01, root = Math.sqrt(bd * bd + 4 * TE2);
      [(bd + root) / 2, (bd - root) / 2].forEach((th) => {
        const at = Math.abs(th);
        if (at < RS * 1.12) return;
        const mu = 1 / Math.abs(1 - Math.pow(TE / at, 4));
        if (mu < 0.1) return;
        const ix = HX + ex / bd * th, iy = HY + ey / bd * th;
        if (ix < -4 || ix > W + 4 || iy < -4 || iy > H + 4) return;
        const tn = Math.min(8, at / bd), rd = 1 / (1 + TE2 / (at * at)), r0 = 0.3 + 0.55 * m0;
        ctx.globalAlpha = Math.min(1, (0.22 + 0.78 * m0) * Math.min(2.5, mu));
        ctx.fillStyle = rgba(col, 1);
        ctx.beginPath(); ctx.ellipse(ix, iy, r0 * rd, r0 * tn, Math.atan2(ey, ex), 0, TAU); ctx.fill();
      });
    }
    for (let i = 0; i < 3; i++) {
      const x = 20 + R() * 470, y = 10 + R() * 170;
      if (Math.hypot(x - HX, y - HY) > TE * 2) glint(ctx, x, y, 3.5 + R() * 3, hot, 0.8);
    }
    // разорванная звезда — исток потока
    const sg = ctx.createRadialGradient(STAR[0], STAR[1], 0, STAR[0], STAR[1], 24);
    sg.addColorStop(0, 'rgba(255,255,255,1)'); sg.addColorStop(0.1, rgba(hot, 0.95)); sg.addColorStop(0.35, rgba(orange, 0.35)); sg.addColorStop(1, rgba(orange, 0));
    ctx.globalAlpha = 1; ctx.fillStyle = sg; ctx.fillRect(STAR[0] - 24, STAR[1] - 24, 48, 48);
    glint(ctx, STAR[0], STAR[1], 13, hot, 0.95);
    ctx.restore();
    return sky;
  });

  // ---------- ≈ Жидкое золото: налитый расплав — круги от капель, лужицы с мениском, зеркальные отражения ----------
  // Поверхность — карта высот: вихревой шум без вытянутости, купола-лужицы с крутым краем и круги волн от двух
  // капель (одна — на клинках и цевье, вторая — на прикладе, перчатках и кольце керамбита). Цвет — отражение
  // студийного окружения: тёмный пол, красноватый горизонт, светлое холодное небо, софтбокс. Палитра насыщенная,
  // белёсое золото — только верхние ~5 % яркости, блик ограничен ею же.
  Tex.addGen('liquidgold', function (f, R, n, n2, n3) {
    const dk = C(f.c[0]), gold = C(f.c[1]), wh = C(f.c[2]), amb = C(f.c[3]);
    const ENV = lutAt([[0, mix(dk, [0, 0, 0], 0.82)], [0.17, mix(dk, [0, 0, 0], 0.15)], [0.36, mix(amb, dk, 0.3)],
      [0.56, mix(amb, gold, 0.45)], [0.76, mix(gold, amb, 0.1)], [0.92, mix(gold, wh, 0.32)], [1, mix(gold, wh, 0.68)]]);
    const RIP = [[318, 86, 1], [84, 110, 0.75]];                        // капли: x, y, сила кругов
    const base = (x, y) => {
      const px = x * 0.0078, py = y * 0.0088;
      const qx = fbm(n, px, py, 3), qy = fbm(n2, px + 5.2, py + 1.3, 3);
      const bx = px + 1.45 * qx - 0.8 * qy, by = py + 1.45 * qy + 0.8 * qx;     // вихревая закрутка
      return fbm(n3, bx, by, 3) + 0.12 * fbm(n3, bx * 2.5 + 9.1, by * 2.5, 2);
    };
    const POOL = [];                                                     // лужицы: x, y, радиус, уровень
    for (let i = 0; i < 12 && POOL.length < 6; i++) {
      const p = [16 + R() * 480, 12 + R() * 168, 11 + R() * 13];
      if (RIP.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 46) || POOL.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < q[2] + p[2] + 14)) continue;
      p.push(base(p[0], p[1]));
      POOL.push(p);
    }
    const F = field(0.5, (x, y) => {
      let h = base(x, y);
      for (let i = 0; i < POOL.length; i++) {
        const p = POOL[i], t = Math.hypot(x - p[0], y - p[1]) / p[2];
        if (t < 1.6) {
          // купол с плоской вершиной и крутым краем (мениск) и валик вокруг
          const ins = 1 - smooth(0.82, 1.0, t);
          h = h * (1 - ins) + (p[3] + 0.085 * Math.pow(Math.max(0, 1 - t * t), 0.6)) * ins + 0.02 * Math.exp(-sq((t - 1.08) / 0.12));
        }
      }
      for (let i = 0; i < RIP.length; i++) {
        const q = RIP[i], dd = Math.hypot(x - q[0], y - q[1]);
        if (dd < 160) h += q[2] * (0.03 * Math.sin(dd * 0.56 - 1.4) * Math.exp(-dd / 52) * smooth(4, 12, dd) + 0.07 * Math.sqrt(Math.max(0, 1 - sq(dd / 5.5))));
      }
      return h;
    });
    const w = F.w, h = F.h, a = F.a;
    const GX = new Float32Array(w * h), GY = new Float32Array(w * h), K = 22 / (2 * F.k);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const q = j * w + i;
        GX[q] = (a[i < w - 1 ? q + 1 : q] - a[i > 0 ? q - 1 : q]) * K;
        GY[q] = (a[j < h - 1 ? q + w : q] - a[j > 0 ? q - w : q]) * K;
      }
    }
    const out = L.full(), ctx = out.getContext('2d'), img = ctx.createImageData(FW, FH), d = img.data;
    const sc = w / FW;
    let p = 0;
    for (let j = 0; j < FH; j++) {
      let gy = (j + 0.5) * sc - 0.5;
      if (gy < 0) gy = 0; if (gy > h - 1.001) gy = h - 1.001;
      const j0 = gy | 0, fy = gy - j0;
      for (let i = 0; i < FW; i++) {
        let gx = (i + 0.5) * sc - 0.5;
        if (gx < 0) gx = 0; if (gx > w - 1.001) gx = w - 1.001;
        const i0 = gx | 0, fx = gx - i0, q = j0 * w + i0;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const sx = GX[q] * w00 + GX[q + 1] * w10 + GX[q + w] * w01 + GX[q + w + 1] * w11;
        const sy = GY[q] * w00 + GY[q + 1] * w10 + GY[q + w] * w01 + GY[q + w + 1] * w11;
        const hv = a[q] * w00 + a[q + 1] * w10 + a[q + w] * w01 + a[q + w + 1] * w11;
        const inv = 1 / Math.sqrt(sx * sx + sy * sy + 1);
        const nx = -sx * inv, ny = -sy * inv, nz = inv, rx = 2 * nz * nx, ry = 2 * nz * ny;
        // отражение: небо сверху светлее, тёмная полоса горизонта, софтбокс, направленный свет
        const ndl = nx * LX + ny * LY + nz * LZ;
        let e = 0.5 - 0.3 * ry;
        e -= 0.27 * Math.exp(-sq((ry - 0.2) / 0.1));
        e += 0.3 * Math.exp(-(sq(rx + 0.3) + sq(ry + 0.5)) * 9);
        e += 0.36 * (ndl - 0.42);
        e *= 0.8 + 0.2 * smooth(-0.45, 0.15, hv);                 // впадины темнее
        const nh = nx * HX + ny * HY + nz * HZ;
        if (nh > 0.9) e += Math.pow(nh, 70) * 0.3;                   // блик — в пределах палитры
        const qq = li(e);
        let r = ENV[qq], g = ENV[qq + 1], b = ENV[qq + 2];
        // оттенки окружения в отражениях: красноватый горизонт, холодное небо
        const tr = Math.exp(-sq((ry - 0.08) / 0.11)) * 0.22, tb = smooth(-0.3, -0.8, ry) * 0.16;
        r *= 1 + 0.12 * tr - 0.18 * tb; g *= 1 - 0.3 * tr - 0.02 * tb; b = b * (1 - 0.5 * tr) + (150 + b * 0.4) * tb;
        d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
        p += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
    return out;
  });

  // ---------- ◆ Кристалл бездны: крупные гранёные призмы с бирюзовым свечением изнутри ----------
  // Осколки — ячейки Вороного в повёрнутом и сжатом пространстве (длинные кристаллы), края слегка изогнуты
  // плавным смещением координат. Каждый осколок — призма с гребнем вдоль оси: грань к свету светлее,
  // другая в тени; у основания (у кромок) темно, внутри — бирюзовое ядро свечения. Светлая фаска — только
  // на кромках, обращённых к свету (свет сверху слева), противоположные кромки уходят в тень. Тонкие швы
  // светятся слабо. Основа — тёмная бирюза и чернильная синева; фиолетовый — лишь в редких осколках.
  function shardLayer(R, th, el, cs, hb0, hb1) {
    const ca = Math.cos(th), sa = Math.sin(th), SU = 1 / (el * cs), SV = 1 / cs;
    const cu = [], cv = [];
    [[0, 0], [W, 0], [0, H], [W, H]].forEach((p) => { cu.push((p[0] * ca + p[1] * sa) * SU); cv.push((-p[0] * sa + p[1] * ca) * SV); });
    const u0 = Math.floor(Math.min.apply(null, cu)) - 3, v0 = Math.floor(Math.min.apply(null, cv)) - 3;
    const GW = Math.ceil(Math.max.apply(null, cu)) + 4 - u0, GH = Math.ceil(Math.max.apply(null, cv)) + 4 - v0, N = GW * GH;
    const PU = new Float32Array(N), PV = new Float32Array(N), A1 = new Float32Array(N), A2 = new Float32Array(N), HB = new Float32Array(N);
    for (let c = 0; c < N; c++) {
      PU[c] = u0 + (c % GW) + 0.05 + 0.9 * R(); PV[c] = v0 + Math.floor(c / GW) + 0.05 + 0.9 * R();
      A1[c] = R(); A2[c] = R(); HB[c] = hb0 + (hb1 - hb0) * R();
    }
    // серединные перпендикуляры к 8 соседям: нормаль (nu, nv), смещение, перевод в единицы поля, нормаль в поле
    const BN = new Float32Array(N * 48);
    for (let j = 1; j < GH - 1; j++) {
      for (let i = 1; i < GW - 1; i++) {
        const c = j * GW + i;
        let k = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const c2 = c + dj * GW + di, eu = PU[c2] - PU[c], ev = PV[c2] - PV[c], l = 1 / Math.sqrt(eu * eu + ev * ev);
            const nu = eu * l, nv = ev * l, o = c * 48 + k * 6;
            BN[o] = nu; BN[o + 1] = nv; BN[o + 2] = (PU[c2] + PU[c]) * 0.5 * nu + (PV[c2] + PV[c]) * 0.5 * nv;
            BN[o + 3] = 1 / Math.sqrt(nu * nu * SU * SU + nv * nv * SV * SV);
            const fx = nu * ca * SU - nv * sa * SV, fy = nu * sa * SU + nv * ca * SV, fl = 1 / Math.sqrt(fx * fx + fy * fy);
            BN[o + 4] = fx * fl; BN[o + 5] = fy * fl;
            k++;
          }
        }
      }
    }
    // res: [ячейка, расстояние до кромки, смещение поперёк оси, смещение вдоль оси (ед. поля), нормаль кромки x, y]
    function look(x, y, res) {
      const u = (x * ca + y * sa) * SU, v = (-x * sa + y * ca) * SV;
      const iu = Math.floor(u) - u0, iv = Math.floor(v) - v0;
      let best = 1e9, bc = 0;
      for (let j = iv - 1; j <= iv + 1; j++) {
        for (let i = iu - 1; i <= iu + 1; i++) {
          const c = j * GW + i, du = PU[c] - u, dv = PV[c] - v, dd = du * du + dv * dv;
          if (dd < best) { best = dd; bc = c; }
        }
      }
      let md = 1e9, mo = bc * 48;
      for (let o = bc * 48, e = o + 48; o < e; o += 6) {
        const dr = (BN[o + 2] - u * BN[o] - v * BN[o + 1]) * BN[o + 3];
        if (dr < md) { md = dr; mo = o; }
      }
      res[0] = bc; res[1] = md; res[2] = (v - PV[bc]) * cs; res[3] = (u - PU[bc]) * el * cs; res[4] = BN[mo + 4]; res[5] = BN[mo + 5];
    }
    return { look: look, A1: A1, A2: A2, HB: HB, ca: ca, sa: sa };
  }
  // Плавное поле на грубой сетке с билинейной выборкой
  function coarse(r, fn) {
    const F = field(r, fn), w = F.w, h = F.h, a = F.a, k = F.k;
    return function (x, y) {
      let gx = x / k - 0.5, gy = y / k - 0.5;
      if (gx < 0) gx = 0; if (gx > w - 1.001) gx = w - 1.001;
      if (gy < 0) gy = 0; if (gy > h - 1.001) gy = h - 1.001;
      const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, q = j * w + i;
      return (a[q] * (1 - fx) + a[q + 1] * fx) * (1 - fy) + (a[q + w] * (1 - fx) + a[q + w + 1] * fx) * fy;
    };
  }
  Tex.addGen('abyss', function (f, R, n, n2, n3) {
    const dk = C(f.c[0]), cy = C(f.c[1]), vi = C(f.c[2]), wh = C(f.c[3]);
    const body = [18, 64, 78], deepC = [4, 22, 34];                    // тёмная бирюза тела, чернильная глубина
    const LA = shardLayer(R, -0.42, 3.0, 21, 0, 1);
    const vx = -LA.sa, vy = LA.ca, LDX = -0.6, LDY = -0.8;               // ось «поперёк осколка» и направление на свет
    const fsg = vx * LDX + vy * LDY;                                     // какая грань призмы смотрит на свет
    const WX = coarse(0.25, (x, y) => 4.2 * fbm(n, x * 0.016, y * 0.026, 2));
    const WY = coarse(0.25, (x, y) => 3.0 * fbm(n2, x * 0.016 + 5.3, y * 0.026, 2));
    const DEP = coarse(0.25, (x, y) => 0.55 + 0.6 * smooth(-0.3, 0.35, fbm(n3, x * 0.006, y * 0.012, 3)));   // светлее / глубже
    const ra = new Float64Array(6);
    const out = raster(1, (x, y, o) => {
      LA.look(x + WX(x, y), y + WY(x, y), ra);
      const c = ra[0], md = ra[1], sv = ra[2], a1 = LA.A1[c], a2 = LA.A2[c];
      const acc = a2 > 0.9;                                              // редкий фиолетовый осколок
      const gr = acc ? vi[0] : cy[0], gg = acc ? vi[1] : cy[1], gb = acc ? vi[2] : cy[2];
      // грани призмы: гребень вдоль оси, освещённая и теневая стороны; вдоль оси — плавный переход
      const facet = sv * fsg >= 0 ? 0.55 + 0.45 * Math.min(1, Math.abs(sv) / 6) : 0.16;
      const along = 0.55 + 0.45 * Math.tanh((ra[3] * (a1 > 0.5 ? 1 : -1)) / 28);
      const base = smooth(0, 9, md);                                     // у кромок (основания граней) темно
      const dep = DEP(x, y);
      const lum = facet * along * (0.3 + 0.7 * base) * (0.55 + 0.45 * a2) * dep;
      // свечение ядра: вдоль гребня, в глубине осколка
      const core = Math.exp(-Math.abs(sv) / 5.5) * smooth(1, 9, md) * (0.12 + 0.88 * a1 * a1) * dep;
      // фаска: светлая на кромках к свету, тёмная — на противоположных
      const bev = Math.exp(-md / 1.5), lit = ra[4] * LDX + ra[5] * LDY;
      const rim = bev * Math.max(0, lit) * (0.5 + 0.5 * a2), shd = bev * Math.max(0, -lit) * 0.7;
      const seam = Math.exp(-md / 0.5) * 0.3;
      const dkf = 1 - shd;
      o[0] = (dk[0] + (deepC[0] - dk[0]) * dep + body[0] * lum * 1.6) * dkf + gr * (core * 0.62 + seam) + wh[0] * rim * 0.62;
      o[1] = (dk[1] + (deepC[1] - dk[1]) * dep + body[1] * lum * 1.6) * dkf + gg * (core * 0.62 + seam) + wh[1] * rim * 0.62;
      o[2] = (dk[2] + (deepC[2] - dk[2]) * dep + body[2] * lum * 1.6) * dkf + gb * (core * 0.62 + seam) + wh[2] * rim * 0.62;
    });
    const ctx = out.getContext('2d');
    ctx.save(); ctx.scale(S, S);
    for (let i = 0; i < 5; i++) glint(ctx, 20 + R() * 470, 10 + R() * 170, 4 + R() * 4, cy, 0.7);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = 0.15 + 0.35 * R(); ctx.fillStyle = rgba(cy, 1);
      ctx.beginPath(); ctx.arc(R() * W, R() * H, 0.25 + R() * 0.45, 0, TAU); ctx.fill();
    }
    ctx.restore();
    return out;
  });
})();