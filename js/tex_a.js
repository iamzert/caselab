'use strict';

// Узоры раскрасок, набор A.
// Генераторы регистрируются через Tex.addGen(kind, fn); fn(f, R, n, n2, n3) → canvas Tex.W*S × Tex.H*S.
// Помощники: Tex.lib (pixels, vec, pal, mix, rgb, shade, fbm, perlin, rng, smooth, clamp01, blob, mk, full, grain, W, H, S).
// Узоры: web, lightning, wood, mesh, halftone, graffiti, blueprint, topo
// Раунд 6: эти узоры рисуются только на обычном оружии (ножи, перчатки и дорогие скины — камни, js/tex_gem.js),
// поэтому они спокойные: крупный масштаб, мало мотивов, мягкий шум. Только цвет и рисунок — без запечённых
// бликов и теней (объём даёт свет в art.js). Цвета — из f.c. Все узоры детерминированы (только R и шумы).
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

  // Пустой слой во всё поле; ctx уже в единицах поля
  function layer() {
    const c = full(), ctx = c.getContext('2d');
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

  // Ключ раскраски в FINISHES: варианты одного генератора различаем по нему
  function finId(f) {
    if (typeof FINISHES !== 'undefined') for (const k in FINISHES) if (FINISHES[k] === f) return k;
    return '';
  }
  const frac = (v) => v - Math.floor(v);

  // ===================================================================================
  // Паутина (web): тёмный лак с мягким свечением у ступицы и одна крупная сеть —
  // 11 радиусов и редкие провисшие витки. Тёплая (webred) и холодная (webice) версии — только цвета.
  // ===================================================================================
  Tex.addGen('web', function (f, R, n) {
    const K = fc(f, 0), A = fc(f, 1), Lt = fc(f, 2);
    const hx = W * (0.55 + R() * 0.13), hy = H * (0.36 + R() * 0.26), ox = R() * 50;
    const L0 = soft(128, (x, y, o) => {
      const dx = (x - hx) / 150, dy = (y - hy) / 110;
      lerp(o, K, A, 0.08 + 0.24 * Math.exp(-(dx * dx + dy * dy)) + 0.08 * (fbm(n, x * 0.006 + ox, y * 0.012, 2) + 0.5));
    });
    const ctx = L0.ctx, m = 11, a0 = R() * TAU, ang = [];
    for (let i = 0; i < m; i++) ang.push(a0 + i * TAU / m + (R() - 0.5) * 0.3);
    const spokes = new Path2D(), rings = new Path2D();
    ang.forEach((a) => { spokes.moveTo(hx, hy); spokes.lineTo(hx + Math.cos(a) * 640, hy + Math.sin(a) * 640); });
    for (let r = 14, k = 0; r < 600; k++, r += 21 + k * 1.2) {
      for (let i = 0; i < m; i++) {
        const a = ang[i], b = ang[(i + 1) % m], ra = r * (0.96 + R() * 0.08), rb = r * (0.96 + R() * 0.08);
        const x0 = hx + Math.cos(a) * ra, y0 = hy + Math.sin(a) * ra, x1 = hx + Math.cos(b) * rb, y1 = hy + Math.sin(b) * rb;
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;   // виток провисает к ступице
        rings.moveTo(x0, y0); rings.quadraticCurveTo(hx + (mx - hx) * 0.86, hy + (my - hy) * 0.86, x1, y1);
      }
    }
    ctx.strokeStyle = css(A, 0.28); ctx.lineWidth = 3.6; ctx.stroke(spokes); ctx.lineWidth = 3; ctx.stroke(rings);
    ctx.strokeStyle = css(Lt, 0.9); ctx.lineWidth = 1.6; ctx.stroke(spokes); ctx.lineWidth = 1.25; ctx.stroke(rings);
    return L0.c;
  });

  // ===================================================================================
  // Молния (lightning): тёмное грозовое небо с мягкими тучами и две длинные молнии с парой ветвей.
  // ===================================================================================
  Tex.addGen('lightning', function (f, R, n) {
    const K = fc(f, 0), A = fc(f, 1), Lt = fc(f, 2), ox = R() * 50, oy = R() * 50;
    const L0 = soft(160, (x, y, o) => lerp(o, K, A, 0.05 + 0.2 * smooth(-0.1, 0.45, fbm(n, x * 0.006 + ox, y * 0.014 + oy, 3))));
    const ctx = L0.ctx, bolts = [], twigs = [];
    for (let b = 0; b < 2; b++) {
      const ya = H * (0.2 + 0.5 * b + R() * 0.25), yb = H * (0.75 - 0.5 * b + (R() - 0.5) * 0.3);
      const p = jag(R, -10, ya, W + 10, yb, 0.16, 7);
      bolts.push(p);
      for (let k = 0; k < 2; k++) {
        const s = p[20 + ((R() * 80) | 0)], dir = Math.atan2(yb - ya, W) + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.5), len = 60 + R() * 60;
        twigs.push(jag(R, s[0], s[1], s[0] + Math.cos(dir) * len, s[1] + Math.sin(dir) * len, 0.2, 4));
      }
    }
    strokes(ctx, bolts, [[A, 0.16, 12], [A, 0.4, 5], [Lt, 1, 1.9]]);
    strokes(ctx, twigs, [[A, 0.16, 7], [A, 0.4, 3], [Lt, 0.9, 1.1]]);
    return L0.c;
  });

  // ===================================================================================
  // Дерево (wood): лакированный массив — широкие мягкие годовые слои; слоистое дерево — 6–8 крупных
  // волнистых слоёв разных пород.
  // ===================================================================================
  Tex.addGen('wood', function (f, R, n, n2) {
    const c = f.c.map(rgb), ox = R() * 50, oy = R() * 50;
    if (c.length >= 4) {
      const P = [c[1], c[2], c[1], c[3], c[0], c[2]], np = P.length;
      return soft(384, (x, y, o) => {
        const g = y * 0.032 + fbm(n, x * 0.003 + ox, y * 0.006 + oy, 3) * 2.6 + 20;
        const k = Math.floor(g), u = g - k;
        lerp(o, P[k % np], P[(k + 1) % np], smooth(0.86, 1, u));
        toward(o, c[3], 0.12 * (1 - smooth(0, 0.08, u)));   // тонкий клеевой шов между слоями
        const t = 1 + n2(x * 0.02, y * 0.5) * 0.06;
        o[0] *= t; o[1] *= t; o[2] *= t;
      }).c;
    }
    const A = c[0], B = c[1], D = c[2];
    return soft(384, (x, y, o) => {
      const g = y * 0.055 + fbm(n, x * 0.0035 + ox, y * 0.009 + oy, 2) * 3;
      const s = 0.5 + 0.5 * Math.sin(g * TAU);
      lerp(o, B, A, s * 0.8);
      toward(o, D, 0.35 * smooth(0.82, 1, s));
      const t = 1 + n2(x * 0.02, y * 0.6) * 0.05;   // поры вдоль волокна
      o[0] *= t; o[1] *= t; o[2] *= t;
    }).c;
  });

  // ===================================================================================
  // Маскировочная сеть (mesh): крупные мягкие пятна камуфляжа и редкая ромбическая сеть поверх.
  // ===================================================================================
  Tex.addGen('mesh', function (f, R, n) {
    const A = fc(f, 0), D = fc(f, 1), Lt = fc(f, 2), ox = R() * 50, oy = R() * 50;
    const L0 = soft(192, (x, y, o) => {
      const v = fbm(n, x * 0.0075 + ox, y * 0.014 + oy, 3);
      lerp(o, A, D, smooth(0.08, 0.14, v));
      toward(o, Lt, 0.5 * smooth(-0.14, -0.2, v));
    });
    const ctx = L0.ctx, st = 20, net = new Path2D();
    for (let k = -H; k < W + H; k += st) { net.moveTo(k, 0); net.lineTo(k + H, H); net.moveTo(k + H, 0); net.lineTo(k, H); }
    ctx.strokeStyle = css(D, 0.4); ctx.lineWidth = 1.3; ctx.stroke(net);
    return L0.c;
  });

  // ===================================================================================
  // Полутон (halftone): комикс — три крупные панели (крупные точки, лучи, точки) без надписей;
  // поп-арт — две панели с крупным растром и большая мишень.
  // ===================================================================================
  // Растр точек под углом 45° в текущем клипе; радиус точки — доля шага, rf(x, y) → 0..0.5
  function dots(ctx, col, step, rf) {
    ctx.fillStyle = css(col);
    ctx.beginPath();
    for (let j = -1, row = 0; j * step * 0.5 < H + step; j++, row++) {
      const y = j * step * 0.5;
      for (let x = (row & 1) * step * 0.5 - step; x < W + step; x += step) {
        const r = rf(x, y) * step;
        if (r > 0.4) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
      }
    }
    ctx.fill();
  }
  // Панель: многоугольник pts, заливка base, затем draw(ctx) внутри клипа
  function panel(ctx, pts, base, draw) {
    ctx.save();
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.fillStyle = css(base); ctx.fill(); ctx.clip();
    if (draw) draw(ctx);
    ctx.restore();
  }
  // Межпанельный пробел: светлая полоса с чёрными кромками
  function gutter(ctx, x0, x1, paper, ink) {
    ctx.beginPath(); ctx.moveTo(x0, -5); ctx.lineTo(x1, H + 5);
    ctx.strokeStyle = css(ink); ctx.lineWidth = 12; ctx.stroke();
    ctx.strokeStyle = css(paper); ctx.lineWidth = 6; ctx.stroke();
  }
  Tex.addGen('halftone', function (f, R) {
    const c = f.c.map(rgb), A = c[0], B = c[1], ink = c[2], paper = c[3 % c.length];
    const L0 = layer(), ctx = L0.ctx;
    if (finId(f) === 'popart') {
      const g = W * (0.4 + R() * 0.1), tx = W * (0.74 + R() * 0.06), ty = H * (0.45 + R() * 0.1);
      panel(ctx, [[-5, -5], [g + 30, -5], [g - 30, H + 5], [-5, H + 5]], A, (x) => dots(x, B, 15, (px) => 0.12 + 0.3 * (px / g)));
      panel(ctx, [[g + 30, -5], [W + 5, -5], [W + 5, H + 5], [g - 30, H + 5]], B, (x) => dots(x, A, 15, (px, py) => 0.42 - 0.3 * Math.min(1, Math.hypot(px - tx, py - ty) / 200)));
      [[78, paper], [60, ink], [52, B], [34, ink], [27, A], [12, paper]].forEach((r) => {
        ctx.fillStyle = css(r[1]); ctx.beginPath(); ctx.arc(tx, ty, r[0], 0, TAU); ctx.fill();
      });
      gutter(ctx, g + 30, g - 30, paper, ink);
      return L0.c;
    }
    const g1 = W * (0.33 + R() * 0.06), g2 = W * (0.66 + R() * 0.06), cx = (g1 + g2) / 2, cy = H * (0.4 + R() * 0.2);
    panel(ctx, [[-5, -5], [g1 + 18, -5], [g1 - 18, H + 5], [-5, H + 5]], B, (x) => dots(x, A, 14, (px) => 0.4 - 0.25 * (px / g1)));
    panel(ctx, [[g1 + 18, -5], [g2 - 18, -5], [g2 + 18, H + 5], [g1 - 18, H + 5]], A, (x) => {
      x.fillStyle = css(B, 0.6);   // лучи мягче точек: панель не перетягивает внимание
      for (let i = 0; i < 12; i += 2) {
        const a = i * TAU / 12, b = (i + 1) * TAU / 12;
        x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * 400, cy + Math.sin(a) * 400); x.lineTo(cx + Math.cos(b) * 400, cy + Math.sin(b) * 400); x.closePath(); x.fill();
      }
    });
    panel(ctx, [[g2 - 18, -5], [W + 5, -5], [W + 5, H + 5], [g2 + 18, H + 5]], paper, (x) => dots(x, B, 14, (px, py) => 0.12 + 0.3 * (py / H)));
    gutter(ctx, g1 + 18, g1 - 18, paper, ink);
    gutter(ctx, g2 - 18, g2 + 18, paper, ink);
    return L0.c;
  });

  // ===================================================================================
  // Граффити (graffiti): стена с двумя мягкими облаками краски и один крупный элемент:
  // «Граффити» (tags) — объёмное слово-тег, «Улица» (street) — широкая стрелка-свуш; под ними пара подтёков.
  // ===================================================================================
  const GRAF_WORDS = ['LOOT', 'HYPE', 'FAME', 'ZINC', 'GLOW'];
  const PIECE_FONT = '900 SIZEpx "Arial Black", Impact, "Segoe UI Black", sans-serif';
  function drips(ctx, R, col, x0, x1, y, k) {
    ctx.strokeStyle = css(col); ctx.fillStyle = css(col); ctx.lineWidth = 4.5;
    for (let i = 0; i < k; i++) {
      const x = x0 + (x1 - x0) * (i + 0.3 + R() * 0.4) / k, len = 18 + R() * 34;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y + len, 3.6, 0, TAU); ctx.fill();
    }
  }
  Tex.addGen('graffiti', function (f, R, n) {
    const c = f.c.map(rgb), wall = c[0], lum = (v) => 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2];
    const rest = c.slice(1).sort((a, b) => lum(a) - lum(b));
    const ink = lum(rest[0]) < lum(wall) * 0.5 ? rest.shift() : tone(wall, -0.7);
    const acc = rest.length ? rest : [tone(wall, 0.5)], a1 = acc[0], a2 = acc[1 % acc.length], a3 = acc[2 % acc.length];
    const ox = R() * 50;
    const L0 = soft(128, (x, y, o) => lerp(o, wall, tone(wall, lum(wall) > 128 ? -0.25 : 0.25), 0.5 * (fbm(n, x * 0.01 + ox, y * 0.02, 3) + 0.5)));
    const ctx = L0.ctx;
    // облака из баллончика
    [[W * (0.2 + R() * 0.1), a2], [W * (0.7 + R() * 0.1), a3]].forEach((p) => {
      const y = H * (0.3 + R() * 0.4), g = ctx.createRadialGradient(p[0], y, 0, p[0], y, 120);
      g.addColorStop(0, css(p[1], 0.55)); g.addColorStop(1, css(p[1], 0));
      ctx.fillStyle = g; ctx.fillRect(p[0] - 120, y - 120, 240, 240);
    });
    if (finId(f) === 'street') {
      // свуш: широкая дуга со стрелкой
      const y0 = H * (0.72 + R() * 0.08), y1 = H * (0.25 + R() * 0.08);
      const sw = new Path2D();
      sw.moveTo(30, y0); sw.bezierCurveTo(W * 0.35, y0 + 30, W * 0.55, y1 - 10, W - 70, y1);
      const head = new Path2D();
      head.moveTo(W - 92, y1 - 30); head.lineTo(W - 28, y1 - 2); head.lineTo(W - 84, y1 + 30); head.closePath();
      ctx.strokeStyle = css(ink); ctx.lineWidth = 32; ctx.stroke(sw); ctx.lineWidth = 12; ctx.stroke(head);
      ctx.fillStyle = css(ink); ctx.fill(head);
      ctx.strokeStyle = css(a1); ctx.lineWidth = 20; ctx.stroke(sw);
      ctx.fillStyle = css(a1); ctx.fill(head);
      drips(ctx, R, a1, W * 0.3, W * 0.5, H * 0.62, 3);
      return L0.c;
    }
    const word = GRAF_WORDS[(R() * GRAF_WORDS.length) | 0], cx = W * (0.5 + (R() - 0.5) * 0.1), cy = H * 0.56;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.07);
    ctx.font = PIECE_FONT.replace('SIZE', 96); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(word).width, sc = Math.min(1, 330 / tw);
    ctx.scale(sc, 1);
    ctx.strokeStyle = css(ink); ctx.lineWidth = 16; ctx.strokeText(word, 0, 0);
    ctx.strokeStyle = css(a2); ctx.lineWidth = 7; ctx.strokeText(word, 0, 0);
    ctx.fillStyle = css(a1); ctx.fillText(word, 0, 0);
    ctx.restore();
    drips(ctx, R, a1, cx - 120, cx + 120, cy + 34, 3);
    return L0.c;
  });

  // ===================================================================================
  // Чертёж (blueprint): синька с редкой сеткой, одна крупная шестерня и окружность с перекрестием. Без надписей.
  // ===================================================================================
  function gearPath(p, cx, cy, r, teeth, depth, rot) {
    const st = TAU / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = rot + i * st, pts = [[a, r - depth], [a + st * 0.18, r], [a + st * 0.5, r], [a + st * 0.68, r - depth]];
      pts.forEach((q, k) => { const x = cx + Math.cos(q[0]) * q[1], y = cy + Math.sin(q[0]) * q[1]; if (!i && !k) p.moveTo(x, y); else p.lineTo(x, y); });
    }
    p.closePath();
  }
  Tex.addGen('blueprint', function (f, R, n) {
    const K = fc(f, 0), Lt = fc(f, 1), M = fc(f, 2), ox = R() * 50;
    const L0 = soft(64, (x, y, o) => lerp(o, K, M, 0.12 * (fbm(n, x * 0.006 + ox, y * 0.012, 2) + 0.5)));
    const ctx = L0.ctx, minor = new Path2D(), major = new Path2D();
    for (let x = 0; x <= W; x += 16) ((x % 64) ? minor : major).moveTo(x, 0), ((x % 64) ? minor : major).lineTo(x, H);
    for (let y = 0; y <= H; y += 16) ((y % 64) ? minor : major).moveTo(0, y), ((y % 64) ? minor : major).lineTo(W, y);
    ctx.strokeStyle = css(M, 0.22); ctx.lineWidth = 0.7; ctx.stroke(minor);
    ctx.strokeStyle = css(M, 0.42); ctx.lineWidth = 1.1; ctx.stroke(major);
    const gx = W * (0.56 + R() * 0.1), gy = H * 0.5, gr = 66, cx2 = W * (0.18 + R() * 0.06), cy2 = H * (0.42 + R() * 0.16);
    const draw = new Path2D();
    gearPath(draw, gx, gy, gr, 14, 10, R() * TAU);
    [[gx, gy, 26], [gx, gy, 9], [cx2, cy2, 42], [cx2, cy2, 16]].forEach((c) => { draw.moveTo(c[0] + c[2], c[1]); draw.arc(c[0], c[1], c[2], 0, TAU); });
    ctx.strokeStyle = css(Lt, 0.85); ctx.lineWidth = 1.9; ctx.stroke(draw);
    // осевые линии — штрихпунктир
    const axis = new Path2D();
    [[gx, gy, 92], [cx2, cy2, 60]].forEach((c) => { axis.moveTo(c[0] - c[2], c[1]); axis.lineTo(c[0] + c[2], c[1]); axis.moveTo(c[0], c[1] - c[2]); axis.lineTo(c[0], c[1] + c[2]); });
    ctx.setLineDash([14, 4, 3, 4]); ctx.strokeStyle = css(Lt, 0.55); ctx.lineWidth = 1; ctx.stroke(axis); ctx.setLineDash([]);
    return L0.c;
  });

  // ===================================================================================
  // Топография (topo): мягкий рельеф и редкие горизонтали (каждая четвёртая толще) без подписей;
  // тепловизор (thermal) — плавная тепловая карта с мягкими ступенями.
  // ===================================================================================
  Tex.addGen('topo', function (f, R, n) {
    const c = f.c.map(rgb), ox = R() * 50, oy = R() * 50;
    if (c.length >= 4) {
      const rp = ramp([c[0], c[3], c[1], c[2]]);
      return soft(192, (x, y, o) => {
        const t = smooth(-0.35, 0.45, fbm(n, x * 0.0045 + ox, y * 0.0095 + oy, 3)) * 6, k = Math.floor(t);
        rp((k + smooth(0.7, 1, t - k)) / 6, o);
      }).c;
    }
    const K = c[0], Lt = c[1], M = c[2];
    // высоты на сетке 384×144, затем горизонтали постоянной толщины по градиенту
    const gw = 384, gh = 144, kx = W / gw, ky = H / gh, h = new Float32Array(gw * gh);
    for (let j = 0, q = 0; j < gh; j++) for (let i = 0; i < gw; i++, q++) h[q] = fbm(n, (i + 0.5) * kx * 0.0055 + ox, (j + 0.5) * ky * 0.0105 + oy, 3) * 5;
    const sm = mk(gw, gh), sctx = sm.getContext('2d'), img = sctx.createImageData(gw, gh), d = img.data, o = [0, 0, 0];
    for (let j = 0, q = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++, q++) {
        const v = h[q], gx = h[q + (i < gw - 1 ? 1 : 0)] - h[q - (i > 0 ? 1 : 0)], gy = h[q + (j < gh - 1 ? gw : 0)] - h[q - (j > 0 ? gw : 0)];
        lerp(o, K, M, 0.25 + 0.5 * smooth(-2.5, 2.5, v));
        const g = Math.hypot(gx, gy) * 0.5 + 1e-4, k = Math.round(v), dist = Math.abs(v - k) / g;   // в пикселях сетки
        const wdt = (k & 3) === 0 ? 1.2 : 0.6;
        toward(o, Lt, 0.55 * smooth(wdt + 0.7, wdt, dist));
        d[q * 4] = o[0]; d[q * 4 + 1] = o[1]; d[q * 4 + 2] = o[2]; d[q * 4 + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
    const L0 = layer();
    L0.ctx.setTransform(1, 0, 0, 1, 0, 0);
    L0.ctx.imageSmoothingEnabled = true; L0.ctx.imageSmoothingQuality = 'high';
    L0.ctx.drawImage(sm, 0, 0, L0.c.width, L0.c.height);
    return L0.c;
  });

})();
