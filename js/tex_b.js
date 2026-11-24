'use strict';

// Узоры раскрасок, набор B.
// Генераторы регистрируются через Tex.addGen(kind, fn); fn(f, R, n, n2, n3) → canvas Tex.W*S × Tex.H*S.
// Помощники: Tex.lib (pixels, vec, pal, mix, rgb, shade, fbm, perlin, rng, smooth, clamp01, blob, mk, full, grain, W, H, S).
// Узоры: snake, leopard, koi, prism, acid, scroll, stained
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

  // Ключ раскраски в FINISHES: варианты одного генератора различаем по нему
  function finId(f) {
    if (typeof FINISHES !== 'undefined') for (const k in FINISHES) if (FINISHES[k] === f) return k;
    return '';
  }
  const frac = (v) => v - Math.floor(v);

  // Пятна на сетке с дрожанием (ряды сдвинуты на полшага). near(x, y) — эллиптическое расстояние до ближайшего
  // центра в долях его радиуса (1 — край пятна).
  function spots(R, cw, ch, rx, ry, jit) {
    const nx = Math.ceil(W / cw) + 2, ny = Math.ceil(H / ch) + 2, P = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = 0.8 + R() * 0.4;
        P.push([(i - 0.5 + (j & 1) * 0.5 + (R() - 0.5) * jit) * cw, (j - 0.5 + (R() - 0.5) * jit) * ch, 1 / (rx * k), 1 / (ry * k)]);
      }
    }
    return function (x, y) {
      const ci = Math.floor(x / cw + 0.5), cj = Math.floor(y / ch + 0.5);
      let best = 9;
      for (let j = Math.max(0, cj - 1); j <= Math.min(ny - 1, cj + 1); j++) {
        for (let i = Math.max(0, ci - 1); i <= Math.min(nx - 1, ci + 1); i++) {
          const p = P[j * nx + i], dx = (x - p[0]) * p[2], dy = (y - p[1]) * p[3], d = dx * dx + dy * dy;
          if (d < best) best = d;
        }
      }
      return Math.sqrt(best);
    };
  }
  // Ромбическая чешуя шагом cell: 0 на шве между чешуйками, 1 в середине чешуйки
  function scale(x, y, cell) {
    const u = (x * 0.7 + y) / cell, v = (x * 0.7 - y) / cell;
    return 2 * Math.min(0.5 - Math.abs(frac(u) - 0.5), 0.5 - Math.abs(frac(v) - 0.5));
  }

  // ===================================================================================
  // Змея (snake): питон — редкие крупные тёмные «сёдла» с чёрной каймой по светлой коже;
  // мамба — ровная зелень с крупной мягкой чешуёй. Чешуя едва заметна, рисунок читается пятнами.
  // ===================================================================================
  Tex.addGen('snake', function (f, R, n, n2) {
    const A = fc(f, 0), B = fc(f, 1), C = fc(f, 2), ox = R() * 50;
    if (finId(f) === 'mamba') {
      return soft(512, (x, y, o) => {
        lerp(o, A, B, 0.35 + 0.5 * smooth(-0.35, 0.35, fbm(n, x * 0.005 + ox, y * 0.012, 2)));
        const s = scale(x, y, 18);
        toward(o, C, 0.1 * (1 - smooth(0, 0.3, s)));
        toward(o, B, 0.06 * smooth(0.5, 1, s));
      }).c;
    }
    const sp = spots(R, 84, 70, 36, 21, 0.7);
    return soft(384, (x, y, o) => {
      lerp(o, B, A, 0.12 * (n(x * 0.008 + ox, y * 0.016) + 0.5));
      const d = sp(x, y) + 0.34 * n2(x * 0.022, y * 0.03);   // рваный край седла
      toward(o, C, smooth(1.05, 0.97, d));
      toward(o, A, smooth(0.9, 0.82, d));
      toward(o, C, 0.06 * (1 - smooth(0, 0.3, scale(x, y, 14))));
    }).c;
  });

  // ===================================================================================
  // Леопард (leopard): ~50 крупных розеток — разорванное кольцо из 3–4 мазков и подкрашенная середина.
  // ===================================================================================
  Tex.addGen('leopard', function (f, R, n) {
    const A = fc(f, 0), B = fc(f, 1), C = fc(f, 2), ox = R() * 50;
    const L0 = soft(128, (x, y, o) => lerp(o, A, C, 0.15 + 0.45 * smooth(-0.3, 0.35, fbm(n, x * 0.006 + ox, y * 0.012, 2))));
    const ctx = L0.ctx, cw = 58, ch = 48, mid = css(lerp([0, 0, 0], A, B, 0.18), 0.8), spot = css(B, 0.95);
    for (let j = -1; j * ch < H + ch; j++) {
      for (let i = -1; i * cw < W + cw; i++) {
        const x = (i + (j & 1) * 0.5 + (R() - 0.5) * 0.6) * cw, y = (j + 0.5 + (R() - 0.5) * 0.5) * ch;
        const r = 13 + R() * 6, sq = 0.75 + R() * 0.25;
        ctx.save(); ctx.translate(x, y); ctx.rotate(R() * TAU); ctx.scale(1, sq);
        ctx.fillStyle = mid;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, TAU); ctx.fill();
        // разорванное кольцо: 3–4 толстых мазка разной длины и толщины с круглыми концами
        ctx.strokeStyle = spot;
        const k = 3 + ((R() * 2) | 0);
        for (let q = 0; q < k; q++) {
          const a = q * TAU / k + R() * 0.35, span = TAU / k * (0.5 + R() * 0.3);
          ctx.lineWidth = r * (0.42 + R() * 0.22);
          ctx.beginPath(); ctx.arc(0, 0, r, a, a + span); ctx.stroke();
        }
        ctx.restore();
      }
    }
    return L0.c;
  });

  // ===================================================================================
  // Золотые рыбки (koi): спокойная вода и три крупные рыбки — золотая, кохаку и сансёку.
  // ===================================================================================
  // Рыбка: нос смотрит по углу a, длина len; body — цвет тела, fin — плавников, marks(ctx, len, w) — пятна по телу
  function fish(ctx, x, y, a, len, body, fin, marks) {
    const w = len * 0.3;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = css(fin, 0.7);
    ctx.beginPath(); ctx.moveTo(-len * 0.27, 0);
    ctx.quadraticCurveTo(-len * 0.45, -w * 0.25, -len * 0.64, -w * 0.8);
    ctx.quadraticCurveTo(-len * 0.5, 0, -len * 0.64, w * 0.8);
    ctx.quadraticCurveTo(-len * 0.45, w * 0.25, -len * 0.27, 0);
    ctx.fill();
    [-1, 1].forEach((k) => { ctx.beginPath(); ctx.ellipse(len * 0.1, k * w * 0.52, len * 0.1, w * 0.2, k * 0.8, 0, TAU); ctx.fill(); });
    ctx.beginPath();
    ctx.moveTo(len * 0.5, 0);
    ctx.bezierCurveTo(len * 0.46, -w * 0.58, len * 0.02, -w * 0.62, -len * 0.3, -w * 0.09);
    ctx.lineTo(-len * 0.3, w * 0.09);
    ctx.bezierCurveTo(len * 0.02, w * 0.62, len * 0.46, w * 0.58, len * 0.5, 0);
    ctx.closePath();
    ctx.fillStyle = css(body); ctx.fill();
    ctx.clip();
    if (marks) marks(ctx, len, w);
    ctx.restore();
  }
  function patch(ctx, col, x, y, rx, ry) { ctx.fillStyle = css(col); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
  Tex.addGen('koi', function (f, R, n) {
    const paper = fc(f, 0), orange = fc(f, 1), ink = fc(f, 2), blue = fc(f, 3);
    const shoal = lerp([0, 0, 0], blue, paper, 0.3), deep = lerp([0, 0, 0], blue, ink, 0.45), ox = R() * 50;
    const L0 = soft(192, (x, y, o) => {
      const v = fbm(n, x * 0.005 + ox, y * 0.01, 3);
      lerp(o, shoal, blue, smooth(-0.35, 0.05, v));
      toward(o, deep, smooth(0, 0.4, v) * 0.6);
    });
    const ctx = L0.ctx, j = () => (R() - 0.5);
    fish(ctx, W * (0.2 + j() * 0.06), H * (0.58 + j() * 0.12), -0.25 + j() * 0.4, 118, orange, orange, null);
    fish(ctx, W * (0.52 + j() * 0.06), H * (0.36 + j() * 0.1), Math.PI + 0.2 + j() * 0.3, 106, paper, paper, (c, l, w) => {
      patch(c, orange, l * 0.28, -w * 0.05, l * 0.18, w * 0.45);
      patch(c, orange, -l * 0.08, w * 0.15, l * 0.14, w * 0.4);
    });
    fish(ctx, W * (0.8 + j() * 0.05), H * (0.6 + j() * 0.12), -0.55 + j() * 0.3, 112, paper, orange, (c, l, w) => {
      patch(c, orange, l * 0.12, -w * 0.15, l * 0.25, w * 0.45);
      patch(c, ink, -l * 0.12, w * 0.2, l * 0.07, w * 0.2);
      patch(c, ink, l * 0.3, w * 0.28, l * 0.05, w * 0.15);
    });
    return L0.c;
  });

  // ===================================================================================
  // Призма (prism): глубокий цвет с широкими плавными разводами и редкими светлыми прожилками.
  // ===================================================================================
  Tex.addGen('prism', function (f, R, n, n2) {
    const c = f.c.map(rgb), rp = ramp([c[0], c[3 % c.length], c[1]]), V = c[2], ox = R() * 50, oy = R() * 50;
    return soft(256, (x, y, o) => {
      const w = fbm(n2, x * 0.0036 + ox, y * 0.0075, 2);
      const v = fbm(n, x * 0.0042 + w * 1.5 + ox, y * 0.0105 + w + oy, 3);
      rp(smooth(-0.38, 0.38, v), o);
      const s = 1 - Math.abs(v - 0.14) * 4.5;   // прожилка
      if (s > 0) toward(o, V, s * s * 0.4);
    }).c;
  });

  // ===================================================================================
  // Кислотное травление (acid): светлая шлифованная сталь и 4–5 крупных мягких тёмных пятен травления.
  // ===================================================================================
  Tex.addGen('acid', function (f, R, n, n2, n3) {
    const A = fc(f, 0), D = fc(f, 1), Lt = fc(f, 2), ox = R() * 50, oy = R() * 50;
    return soft(384, (x, y, o) => {
      lerp(o, A, Lt, 0.25 + 0.3 * (fbm(n3, x * 0.006, y * 0.014, 2) + 0.5));
      const e = fbm(n, x * 0.0075 + ox, y * 0.015 + oy, 3) + 0.06 * n2(x * 0.05, y * 0.05);
      toward(o, D, 0.62 * smooth(0.1, 0.16, e) + 0.12 * smooth(0.22, 0.32, e));
      const b = 1 + n2(x * 0.004 + 7, y * 1.6) * 0.07;   // шлифовка
      o[0] *= b; o[1] *= b; o[2] *= b;
    }).c;
  });

  // ===================================================================================
  // Чеканка (scroll): ровное серебро и одна крупная лоза-волна вдоль оружия с завитками на гребнях и листьями.
  // ===================================================================================
  Tex.addGen('scroll', function (f, R, n) {
    const A = fc(f, 0), D = fc(f, 1), Lt = fc(f, 2), ox = R() * 50;
    const L0 = soft(96, (x, y, o) => lerp(o, A, Lt, 0.15 + 0.35 * (fbm(n, x * 0.006 + ox, y * 0.012, 2) + 0.5)));
    const ctx = L0.ctx, amp = 36, P = 250, ph = R() * P, yc = H / 2;
    const yAt = (x) => yc + amp * Math.sin(TAU * (x - ph) / P);
    ctx.strokeStyle = css(D, 0.8); ctx.lineWidth = 4.5;
    ctx.beginPath();
    for (let x = -10; x <= W + 10; x += 4) { if (x === -10) ctx.moveTo(x, yAt(x)); else ctx.lineTo(x, yAt(x)); }
    ctx.stroke();
    // гребни волны: x = ph + P/4 + k·P/2
    for (let xg = ph + P / 4 - P; xg < W + P; xg += P / 2) {
      const yg = yAt(xg), sg = yg > yc ? 1 : -1, r = 36;
      const cx = xg + r * 0.35, cy = yg + sg * r, a0 = Math.atan2(yg - cy, xg - cx), dir = sg > 0 ? -1 : 1;
      ctx.lineWidth = 3.6; ctx.beginPath();
      for (let t = 0; t <= 1.0001; t += 0.025) {
        const a = a0 + dir * t * 1.7 * TAU, rr = r * (1 - t * 0.86);
        if (t === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.stroke();
      // по листу с обеих сторон стебля между гребнями
      [P / 4 - 20, P / 4 + 20].forEach((dx, q) => {
        const xl = xg + dx, yl = yAt(xl), sd = q ? -sg : sg, la = Math.atan2(sd, q ? 0.7 : -0.7), ll = 34;
        const tx = xl + Math.cos(la) * ll, ty = yl + Math.sin(la) * ll, nx = -Math.sin(la) * 10, ny = Math.cos(la) * 10;
        ctx.beginPath(); ctx.moveTo(xl, yl);
        ctx.quadraticCurveTo((xl + tx) / 2 + nx, (yl + ty) / 2 + ny, tx, ty);
        ctx.quadraticCurveTo((xl + tx) / 2 - nx, (yl + ty) / 2 - ny, xl, yl);
        ctx.fillStyle = css(D, 0.45); ctx.fill();
        ctx.lineWidth = 2; ctx.stroke();
      });
    }
    return L0.c;
  });

  // ===================================================================================
  // Витраж (stained): одна большая роза (кольца лепестков) поверх 12–16 крупных стёкол со свинцовой оплёткой.
  // ===================================================================================
  Tex.addGen('stained', function (f, R, n) {
    const c = f.c.map(rgb), K = c[0], G = c.slice(1), ng = G.length;
    const pts = [];
    for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) pts.push([(i + 0.2 + R() * 0.6) * W / 7, (j + 0.2 + R() * 0.6) * H / 2, G[(i * 2 + j + (R() * 2 | 0)) % ng]]);
    const L0 = soft(512, (x, y, o) => {
      let d1 = 1e9, d2 = 1e9, best = null;
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k], dx = x - p[0], dy = y - p[1], d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; best = p[2]; } else if (d < d2) d2 = d;
      }
      lerp(o, best, K, 0.2 + 0.18 * (fbm(n, x * 0.012, y * 0.02, 2) + 0.5));
      const e = Math.sqrt(d2) - Math.sqrt(d1);
      if (e < 4) toward(o, K, smooth(4, 2.5, e));
    });
    const ctx = L0.ctx, cx = W * (0.5 + R() * 0.12), cy = H / 2, R0 = 90;
    const seg = (r0, r1, a0, a1, col) => {
      ctx.beginPath(); ctx.arc(cx, cy, r1, a0, a1); ctx.arc(cx, cy, r0, a1, a0, true); ctx.closePath();
      ctx.fillStyle = css(col); ctx.fill(); ctx.stroke();
    };
    ctx.strokeStyle = css(K); ctx.lineWidth = 4;
    const rot = R() * TAU;
    for (let i = 0; i < 16; i++) seg(62, R0, rot + i * TAU / 16, rot + (i + 1) * TAU / 16, G[(i & 1) ? 1 % ng : 0]);
    for (let i = 0; i < 8; i++) seg(30, 62, rot + i * TAU / 8, rot + (i + 1) * TAU / 8, G[(i & 1) ? 3 % ng : 2 % ng]);
    for (let i = 0; i < 4; i++) seg(11, 30, rot + i * TAU / 4, rot + (i + 1) * TAU / 4, G[(i & 1) ? 1 % ng : 0]);
    ctx.fillStyle = css(G[2 % ng]); ctx.beginPath(); ctx.arc(cx, cy, 11, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, R0, 0, TAU); ctx.stroke();
    return L0.c;
  });

})();
