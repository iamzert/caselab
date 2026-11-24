'use strict';

// Узоры раскрасок, набор C.
// Генераторы регистрируются через Tex.addGen(kind, fn); fn(f, R, n, n2, n3) → canvas Tex.W*S × Tex.H*S.
// Помощники: Tex.lib (pixels, vec, pal, mix, rgb, shade, fbm, perlin, rng, smooth, clamp01, blob, mk, full, grain, W, H, S).
// Узоры: ice, smoke, damask, kintsugi, kevlar, hazard, anodized, tribal
// Раунд 6: эти узоры рисуются только на обычном оружии (ножи, перчатки и дорогие скины — камни, js/tex_gem.js),
// поэтому они спокойные: крупный масштаб, мало мотивов, мягкий шум. Только цвет и рисунок — без запечённых
// бликов и теней (объём даёт свет в art.js). Цвета — из f.c.
(function () {
  const L = Tex.lib;
  const W = L.W, H = L.H, S = L.S, TAU = Math.PI * 2;
  const rgb = L.rgb, fbm = L.fbm, smooth = L.smooth, mk = L.mk, full = L.full;

  // ---------- Общие помощники ----------
  const fc = (f, i) => rgb(f.c[Math.min(i, f.c.length - 1)]);
  const css = (c, a) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a) + ')';
  // k > 0 — светлее (к белому), k < 0 — темнее (к чёрному)
  const tone = (c, k) => (k >= 0 ? L.mix(c, [255, 255, 255], k) : L.mix(c, [0, 0, 0], -k));
  // Смешивание в готовый массив o (без аллокаций в попиксельных проходах)
  function lerp(o, a, b, t) { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; }
  function toward(o, b, t) { o[0] += (b[0] - o[0]) * t; o[1] += (b[1] - o[1]) * t; o[2] += (b[2] - o[2]) * t; return o; }
  function ramp(cols) {
    const m = cols.length - 1;
    return function (t, o) {
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const fi = t * m, i = fi >= m ? m - 1 : fi | 0;
      return lerp(o, cols[i], cols[i + 1], fi - i);
    };
  }

  // Мягкое поле: попиксельно в маленькой сетке gw × (gw·H/W), затем плавное растяжение на всё поле.
  // fn(x, y, o) — x, y в единицах поля 512×192, цвет пишет в o. Возвращает { c, ctx }: ctx уже в единицах поля.
  function soft(gw, fn) {
    const gh = Math.round(gw * H / W), sm = mk(gw, gh), sctx = sm.getContext('2d');
    const img = sctx.createImageData(gw, gh), d = img.data, kx = W / gw, ky = H / gh, o = [0, 0, 0];
    let q = 0;
    for (let j = 0; j < gh; j++) {
      const y = (j + 0.5) * ky;
      for (let i = 0; i < gw; i++, q += 4) {
        fn((i + 0.5) * kx, y, o);
        d[q] = o[0]; d[q + 1] = o[1]; d[q + 2] = o[2]; d[q + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
    const c = full(), ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sm, 0, 0, c.width, c.height);
    ctx.scale(S, S); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    return { c: c, ctx: ctx };
  }

  // Ломаная трещины: середина сдвигается поперёк отрезка (disp — доля длины), depth уровней
  function jag(R, x0, y0, x1, y1, disp, depth) {
    let pts = [[x0, y0], [x1, y1]];
    for (let k = 0; k < depth; k++) {
      const nx = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], s = (R() - 0.5) * 2 * disp;
        nx.push([(a[0] + b[0]) / 2 - dy * s, (a[1] + b[1]) / 2 + dx * s], b);
      }
      pts = nx;
    }
    return pts;
  }
  function line(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }
  // Обводка в несколько проходов: [[цвет, альфа, ширина], …]
  function strokes(ctx, paths, passes) {
    passes.forEach((p) => {
      ctx.strokeStyle = css(p[0], p[1]); ctx.lineWidth = p[2];
      paths.forEach((pts) => { line(ctx, pts); ctx.stroke(); });
    });
  }

  // ===================================================================================
  // Трещины льда (ice): мягкий голубой лёд и одна крупная звезда трещин — 7 лучей и пара колец.
  // ===================================================================================
  Tex.addGen('ice', function (f, R, n) {
    const A = fc(f, 0), B = fc(f, 1), Wt = fc(f, 2), D = fc(f, 3);
    const ox = R() * 50, oy = R() * 50;
    const L0 = soft(192, (x, y, o) => {
      const v = fbm(n, x * 0.0055 + ox, y * 0.011 + oy, 3) * 0.9 + 0.5;
      lerp(o, B, A, 0.25 + 0.6 * smooth(0.2, 0.85, v));
      if (v < 0.3) toward(o, D, (0.3 - v) * 0.9);
    });
    const ctx = L0.ctx;
    const cx = W * (0.42 + R() * 0.22), cy = H * (0.38 + R() * 0.24);
    // иней у центра удара
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70);
    g.addColorStop(0, css(Wt, 0.45)); g.addColorStop(1, css(Wt, 0));
    ctx.fillStyle = g; ctx.fillRect(cx - 70, cy - 70, 140, 140);
    const m = 7, a0 = R() * TAU, rays = [], ang = [];
    for (let i = 0; i < m; i++) {
      const a = a0 + i * TAU / m + (R() - 0.5) * 0.4, len = 260 + R() * 160;
      ang.push(a);
      rays.push(jag(R, cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, 0.08, 5));
    }
    // ответвления и кольца между соседними лучами
    const extra = [];
    [42, 96].forEach((r, k) => {
      for (let i = 0; i < m; i++) {
        if (R() < 0.35 + k * 0.15) continue;
        const a = ang[i], b = ang[(i + 1) % m], rr = r * (0.85 + R() * 0.3);
        extra.push(jag(R, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, cx + Math.cos(b) * rr, cy + Math.sin(b) * rr, 0.12, 3));
      }
    });
    for (let i = 0; i < 3; i++) {
      const p = rays[(R() * m) | 0][3 + ((R() * 8) | 0)], a = R() * TAU;
      extra.push(jag(R, p[0], p[1], p[0] + Math.cos(a) * 60, p[1] + Math.sin(a) * 60, 0.15, 3));
    }
    strokes(ctx, rays.concat(extra), [[D, 0.22, 3.6], [Wt, 0.9, 1.5]]);
    return L0.c;
  });

  // ===================================================================================
  // Дым (smoke): крупные мягкие клубы вдоль оружия, тонких завитков нет.
  // ===================================================================================
  Tex.addGen('smoke', function (f, R, n, n2) {
    const A = fc(f, 0), B = fc(f, 1), C = fc(f, 2);
    const ox = R() * 50, oy = R() * 50;
    return soft(256, (x, y, o) => {
      const w = fbm(n2, x * 0.004 + ox, y * 0.009, 2);
      const v = fbm(n, x * 0.0048 + w * 1.4 + ox, y * 0.012 + w * 0.9 + oy, 3);
      lerp(o, A, B, 0.15 + smooth(-0.35, 0.35, v) * 0.7);
      const s = 1 - Math.abs(v - 0.08) * 3.2;   // широкие светлые пряди дыма
      if (s > 0) toward(o, C, s * s * 0.38);
    }).c;
  });

  // ===================================================================================
  // Барокко (damask): тёмный бархат и один ряд крупных золотых пальметт (ещё полряда — у краёв по высоте).
  // ===================================================================================
  // Правая половина пальметты в единицах высоты: от верхней точки (0, -1) к нижней (0, 1)
  const PALM = [[0.22, -0.72, 0.55, -0.55, 0.5, -0.18], [0.46, 0.16, 0.78, 0.36, 0.55, 0.66], [0.38, 0.86, 0.14, 0.8, 0, 1]];
  function palmPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    PALM.forEach((b) => ctx.bezierCurveTo(x + b[0] * s, y + b[1] * s, x + b[2] * s, y + b[3] * s, x + b[4] * s, y + b[5] * s));
    for (let i = PALM.length - 1; i >= 0; i--) {
      const b = PALM[i], e = i ? PALM[i - 1] : null;
      ctx.bezierCurveTo(x - b[2] * s, y + b[3] * s, x - b[0] * s, y + b[1] * s, e ? x - e[4] * s : x, e ? y + e[5] * s : y - s);
    }
    ctx.closePath();
  }
  function palmette(ctx, x, y, s, G, K) {
    ctx.fillStyle = css(G, 0.5); palmPath(ctx, x, y, s); ctx.fill();
    ctx.fillStyle = css(K, 1); palmPath(ctx, x, y + s * 0.08, s * 0.62); ctx.fill();
    ctx.strokeStyle = css(G, 0.55); ctx.lineWidth = s * 0.05; palmPath(ctx, x, y + s * 0.08, s * 0.44); ctx.stroke();
    // ромб в сердцевине и боковые завитки
    ctx.fillStyle = css(G, 0.6);
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.2); ctx.lineTo(x + s * 0.12, y + s * 0.1); ctx.lineTo(x, y + s * 0.4); ctx.lineTo(x - s * 0.12, y + s * 0.1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = css(G, 0.45); ctx.lineWidth = s * 0.06;
    [-1, 1].forEach((k) => {
      ctx.beginPath();
      ctx.moveTo(x + k * s * 0.55, y - s * 0.1);
      ctx.bezierCurveTo(x + k * s * 1.0, y - s * 0.3, x + k * s * 1.05, y + s * 0.25, x + k * s * 0.8, y + s * 0.2);
      ctx.stroke();
    });
  }
  Tex.addGen('damask', function (f, R, n) {
    const K = fc(f, 0), G = fc(f, 1), M = fc(f, 2);
    const L0 = soft(96, (x, y, o) => lerp(o, K, M, 0.25 + 0.3 * (fbm(n, x * 0.006, y * 0.012, 2) + 0.5)));
    const ctx = L0.ctx, s = 56, P = 150, x0 = -R() * P;
    for (let x = x0; x < W + P; x += P) {
      palmette(ctx, x, H / 2, s, G, K);
      palmette(ctx, x + P / 2, -4, s, G, K);
      palmette(ctx, x + P / 2, H + 4, s, G, K);
    }
    return L0.c;
  });

  // ===================================================================================
  // Кинцуги (kintsugi): ровная тёмная керамика и 3 длинных золотых шва с парой ответвлений.
  // ===================================================================================
  Tex.addGen('kintsugi', function (f, R, n) {
    const K = fc(f, 0), G = fc(f, 1), M = fc(f, 2);
    const L0 = soft(128, (x, y, o) => lerp(o, K, M, 0.2 + 0.45 * smooth(-0.3, 0.35, fbm(n, x * 0.005, y * 0.01, 2))));
    const ctx = L0.ctx, seams = [];
    for (let i = 0; i < 3; i++) {
      const ya = H * (0.15 + 0.35 * i + R() * 0.15), yb = H * (0.85 - 0.35 * i + (R() - 0.5) * 0.3);
      const s = jag(R, -20, ya, W + 20, yb, 0.07, 6);
      seams.push(s);
      const p = s[16 + ((R() * 30) | 0)], a = (R() < 0.5 ? -1 : 1) * (0.8 + R() * 0.8);
      seams.push(jag(R, p[0], p[1], p[0] + Math.cos(a) * 80, p[1] + Math.sin(a) * 80, 0.12, 4));
    }
    strokes(ctx, seams, [[tone(K, -0.5), 0.5, 4.4], [G, 1, 2.6], [tone(G, 0.3), 0.6, 1]]);
    return L0.c;
  });

  // ===================================================================================
  // Кевлар (kevlar): крупное саржевое плетение 2/2 низкого контраста.
  // ===================================================================================
  Tex.addGen('kevlar', function (f, R, n) {
    const A = fc(f, 0), B = fc(f, 1), D = fc(f, 2), cell = 11;
    return soft(512, (x, y, o) => {
      const u = x / cell, v = y / cell, i = Math.floor(u), j = Math.floor(v);
      const hor = ((i + j) & 3) < 2, across = hor ? v - j : u - i;
      const s = Math.sin(Math.PI * across);
      lerp(o, D, B, (hor ? 0.42 : 0.3) + 0.3 * s);
      toward(o, A, 0.2 + 0.25 * fbm(n, x * 0.008, y * 0.02, 2));
    }).c;
  });

  // ===================================================================================
  // Опасность (hazard): 6–7 широких косых полос, жёлтый плавно уходит в оранжевый. Без ленты с надписями.
  // ===================================================================================
  Tex.addGen('hazard', function (f, R, n) {
    const Y = fc(f, 0), K = fc(f, 1), O = fc(f, 2);
    const L0 = soft(64, (x, y, o) => lerp(o, Y, O, 0.4 * smooth(-0.2, 0.35, fbm(n, x * 0.006, y * 0.012, 2))));
    const ctx = L0.ctx, P = 84, w = 40, t0 = -R() * P;
    ctx.fillStyle = css(K, 0.94);
    for (let x = t0; x < W + H + P; x += P) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w - H, H); ctx.lineTo(x - H, H); ctx.closePath(); ctx.fill();
    }
    return L0.c;
  });

  // ===================================================================================
  // Анодированный титан (anodized): плавные цвета побежалости вдоль оружия по светлой шлифовке.
  // ===================================================================================
  Tex.addGen('anodized', function (f, R, n, n2) {
    const c = f.c.map(rgb), rp = ramp([c[2], c[1], c[0], c[3 % c.length]]), SIL = [196, 200, 208];
    const ox = R() * 50, dir = R() < 0.5 ? 1 : -1;
    return soft(512, (x, y, o) => {
      const u = dir > 0 ? x / W : 1 - x / W;
      rp(0.06 + u * 0.88 + fbm(n, x * 0.004 + ox, y * 0.01, 2) * 0.32, o);
      toward(o, SIL, 0.14);
      const b = 1 + n2(x * 0.004, y * 1.7) * 0.1;   // шлифовка — едва заметные продольные риски
      o[0] *= b; o[1] *= b; o[2] *= b;
    }).c;
  });

  // ===================================================================================
  // Огненный трайбл (tribal): чёрный фон и два крупных языкастых пламени (одно перевёрнуто).
  // ===================================================================================
  // Пламя: вытянутое тело вдоль основания (x0, y0) длиной len и k языков-крючков высотой до h,
  // вверх (sy = -1) или вниз (sy = 1). Каждый кусок — отдельная фигура с обводкой: слои читаются как трайбл.
  function flameParts(x0, y0, len, h, k, sy) {
    const st = len / k, out = [];
    for (let i = k - 1; i >= 0; i--) {
      const b = x0 + st * (i + 0.3), s = 0.6 + 0.4 * Math.sin(Math.PI * (i + 0.7) / (k + 0.4)), wb = st * 0.62;
      const tx = b + st * 1.25, ty = y0 + sy * h * s;
      out.push((ctx) => {
        ctx.moveTo(b - wb * 0.5, y0 + sy * h * 0.1);
        ctx.bezierCurveTo(b - wb * 0.45, y0 + sy * h * s * 0.75, tx - st * 0.75, ty, tx, ty);                   // внешняя кромка — крюк
        ctx.bezierCurveTo(tx - st * 0.45, ty - sy * h * s * 0.12, b + wb * 0.4, y0 + sy * h * s * 0.5, b + wb * 0.5, y0 + sy * h * 0.1); // внутренняя
        ctx.closePath();
      });
    }
    out.push((ctx) => {   // тело поверх оснований языков: линза, острая к хвосту
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + len * 0.45, y0 + sy * h * 0.32, x0 + len + st * 0.9, y0 + sy * h * 0.05);
      ctx.quadraticCurveTo(x0 + len * 0.5, y0 - sy * h * 0.2, x0, y0);
    });
    return out;
  }
  Tex.addGen('tribal', function (f, R, n) {
    const K = fc(f, 0), A = fc(f, 1), B = fc(f, 2);
    const L0 = soft(96, (x, y, o) => lerp(o, K, A, 0.07 * (fbm(n, x * 0.006, y * 0.012, 2) + 0.5)));
    const ctx = L0.ctx;
    function fl(x0, y0, len, h, k, sy) {
      const g = ctx.createLinearGradient(0, y0, 0, y0 + sy * h);
      g.addColorStop(0, css(A)); g.addColorStop(1, css(B));
      ctx.fillStyle = g; ctx.strokeStyle = css(tone(A, -0.6), 0.9); ctx.lineWidth = 2.2;
      flameParts(x0, y0, len, h, k, sy).forEach((p) => { ctx.beginPath(); p(ctx); ctx.fill(); ctx.stroke(); });
    }
    fl(-40 - R() * 30, H * (0.8 + R() * 0.05), 380 + R() * 60, 84, 4, -1);
    fl(W * (0.4 + R() * 0.1), H * (0.1 + R() * 0.04), 230, 58, 3, 1);
    return L0.c;
  });

})();
