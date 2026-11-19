'use strict';

// Узоры раскрасок, набор B.
// Генераторы регистрируются через Tex.addGen(kind, fn); fn(f, R, n, n2, n3) → canvas Tex.W*S × Tex.H*S.
// Помощники: Tex.lib (pixels, vec, pal, mix, rgb, shade, fbm, perlin, rng, smooth, clamp01, blob, mk, full, grain, W, H, S).
// Узоры: snake, leopard, koi, prism, acid, scroll, stained
(function () {
  const L = Tex.lib;
  const W = L.W, H = L.H, S = L.S;
  const rgb = L.rgb, mix = L.mix, clamp01 = L.clamp01, smooth = L.smooth, fbm = L.fbm;
  const TAU = Math.PI * 2;

  // ---------- Общие помощники ----------
  // Целочисленный хэш → [0, 1): стабильная «случайность» для ячеек решёток и пикселей
  function hash(i, j, s) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  // i-й цвет раскраски; если цветов меньше — берём последний (генератор не падает на короткой палитре)
  const fc = (f, i) => rgb(f.c[Math.min(i, f.c.length - 1)]);
  const lum = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  // светлее (k > 0) или темнее (k < 0)
  const lift = (c, k) => (k >= 0 ? mix(c, [255, 255, 255], k) : mix(c, [0, 0, 0], -k));
  const css = (c, a) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a) + ')';

  // Попиксельный проход без лишних массивов: fn(x, y, o) кладёт цвет в o (x, y — координаты поля 512×192).
  // r — доля полного разрешения; при r < 1 результат мягко растягивается на весь холст.
  function shader(r, fn) {
    const w = Math.round(W * S * r), h = Math.round(H * S * r);
    const c = L.mk(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
    const kx = W / w, ky = H / h, o = [0, 0, 0];
    let p = 0;
    for (let j = 0; j < h; j++) {
      const y = (j + 0.5) * ky;
      for (let i = 0; i < w; i++) {
        fn((i + 0.5) * kx, y, o);
        d[p] = o[0]; d[p + 1] = o[1]; d[p + 2] = o[2]; d[p + 3] = 255;
        p += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (r === 1) return c;
    const out = L.full(), octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(c, 0, 0, out.width, out.height);
    return out;
  }
  // Векторный слой поверх холста в единицах поля
  function paint(c, fn) {
    const ctx = c.getContext('2d');
    ctx.save(); ctx.scale(S, S); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    fn(ctx);
    ctx.restore();
    return c;
  }
  // Четырёхлучевая искра с центром (x, y) и длиной луча s
  function star(ctx, x, y, s) {
    const w = s * 0.22;
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + w, y); ctx.lineTo(x, y + s); ctx.lineTo(x - w, y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x, y + w); ctx.lineTo(x + s, y); ctx.lineTo(x, y - w); ctx.closePath(); ctx.fill();
  }
  // Гладкий замкнутый контур через точки (квадратичные дуги через середины отрезков)
  function blobPath(ctx, P) {
    const N = P.length;
    ctx.beginPath();
    ctx.moveTo((P[N - 1][0] + P[0][0]) / 2, (P[N - 1][1] + P[0][1]) / 2);
    for (let i = 0; i < N; i++) {
      const a = P[i], b = P[(i + 1) % N];
      ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    ctx.closePath();
  }
  // Гладкая открытая линия через точки
  function linePath(ctx, P) {
    ctx.beginPath();
    ctx.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < P.length - 1; i++) ctx.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
    const e = P[P.length - 1];
    ctx.lineTo(e[0], e[1]);
  }
  // Размытие массива «скользящим окном» (строки, затем столбцы)
  function boxBlur(a, w, h, r) {
    const t = new Float32Array(a.length), inv = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let s = 0;
      for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        t[o + x] = s * inv;
        s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s * inv;
        s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x];
      }
    }
    return a;
  }
  // Гладкое поле на грубой сетке (шаг st единиц поля) с билинейной выборкой: дорогой шум считаем
  // на малой доле пикселей, а пороги и мелкие детали — уже в полном разрешении (края без «лесенки»).
  function grid(st, fn) {
    const gw = Math.ceil(W / st) + 2, gh = Math.ceil(H / st) + 2, a = new Float32Array(gw * gh), inv = 1 / st;
    for (let j = 0, k = 0; j < gh; j++) for (let i = 0; i < gw; i++, k++) a[k] = fn(i * st, j * st);
    const g = function (x, y) {
      let fx = x * inv, fy = y * inv;
      if (fx < 0) fx = 0; else if (fx > gw - 1.001) fx = gw - 1.001;
      if (fy < 0) fy = 0; else if (fy > gh - 1.001) fy = gh - 1.001;
      const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * gw + i;
      const a0 = a[k] + (a[k + 1] - a[k]) * tx, a1 = a[k + gw] + (a[k + gw + 1] - a[k + gw]) * tx;
      return a0 + (a1 - a0) * ty;
    };
    g.data = a;
    return g;
  }
  // Значение поля, ниже которого лежит доля q выборки (порог с заранее известной площадью)
  function quant(g, q) {
    const s = Float32Array.from(g.data).sort();
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  }
  // Ключ раскраски в FINISHES: варианты одного генератора различаем по нему
  function finId(f) {
    if (typeof FINISHES !== 'undefined') for (const k in FINISHES) if (FINISHES[k] === f) return k;
    return '';
  }
  // Цветовой тон 0..360
  function hueOf(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 1e-6) return 0;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  }
  // Сглаженная линия: 1 на расстоянии c, к 0 на расстоянии ±w (всё в пикселях)
  const band = (d, c, w) => { const t = 1 - Math.abs(d - c) / w; return t > 0 ? t : 0; };
  // Металлическая крошка: мягкие точки ~2 px с малой прозрачностью — только там, где ok(x, y)
  function flakes(c, R, count, ok, col, a) {
    return paint(c, (x) => {
      for (let t = 0, k = 0; t < count * 6 && k < count; t++) {
        const px = R() * W, py = R() * H;
        if (!ok(px, py)) continue;
        k++;
        x.fillStyle = css(col, a * (0.5 + R() * 0.5));
        x.beginPath(); x.arc(px, py, 0.55 + R() * 0.45, 0, TAU); x.fill();
      }
    });
  }

  // ---------- Змея (питон, мамба) ----------
  // Ромбическая чешуя: каждая чешуйка — выпуклая пластинка со светлым краем сверху-слева,
  // бликом и тёмным швом. Поверх — крупные пятна с чёрной каймой на светлой сетке, часть
  // пятен со светлым «глазком». Узор берётся в центре чешуйки, поэтому его края идут
  // ступеньками по чешуе — как на настоящей коже.
  // Зелёная палитра (мамба) даёт «древесную» змею: яркая зелёная чешуя, белые зигзаги-молнии
  // поперёк волнистой линии хребта с тёмной окантовкой и редкие белые чешуйки.
  Tex.addGen('snake', function (f, R, n, n2, n3) {
    const body = fc(f, 0), pale = fc(f, 1), ink = fc(f, 2);
    const green = pale[1] > pale[0] * 1.3 && pale[1] > pale[2] * 1.3;
    const ax = 7.4, ay = 4.8;                        // чешуйка: длина и высота ромба
    let pr = 0, pg = 0, pb = 0, pattern;
    if (!green) {
      const paleHi = lift(pale, 0.16), bodyHi = mix(body, pale, 0.24), eyeC = mix(pale, body, 0.3);
      const bx = 40 + R() * 10, by = 30 + R() * 6;   // шаг пятен
      const hw0 = 4.4 + R() * 1.4, rw = 3.6;         // полуширина светлой сетки, ширина каймы
      const gw = Math.ceil(W / bx) + 6, gh = Math.ceil(H / by) + 6;
      const PX = new Float32Array(gw * gh), PY = new Float32Array(gw * gh), EYE = new Float32Array(gw * gh), GRP = new Int32Array(gw * gh);
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          const k = j * gw + i;
          PX[k] = (i - 3 + 0.1 + 0.8 * R()) * bx;
          PY[k] = (j - 3 + 0.1 + 0.8 * R()) * by;
          EYE[k] = R() < 0.4 ? 3.4 + R() * 2.6 : 0;
          // часть соседних пятен сливается в крупные неровные «сёдла»
          GRP[k] = i > 0 && R() < 0.22 ? GRP[k - 1] : j > 0 && R() < 0.12 ? GRP[k - gw] : k;
        }
      }
      pattern = (X0, Y0) => {
        const X = X0 + 11 * fbm(n, X0 * 0.016, Y0 * 0.024, 2), Y = Y0 + 8 * fbm(n, X0 * 0.018 + 5.3, Y0 * 0.026 + 1.7, 2);
        const gi = Math.floor(X / bx) + 3, gj = Math.floor(Y / by) + 3;
        const j0 = Math.max(0, gj - 1), j1 = Math.min(gh - 1, gj + 1), i0 = Math.max(0, gi - 1), i1 = Math.min(gw - 1, gi + 1);
        let d1 = 1e9, k1 = 0, d2 = 1e9, k2 = -1;
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const k = j * gw + i, dx = PX[k] - X, dy = PY[k] - Y, d = dx * dx + dy * dy;
            if (d < d1) { d1 = d; k1 = k; }
          }
        }
        for (let j = j0; j <= j1; j++) {            // ближайшее пятно другой группы
          for (let i = i0; i <= i1; i++) {
            const k = j * gw + i;
            if (GRP[k] === GRP[k1]) continue;
            const dx = PX[k] - X, dy = PY[k] - Y, d = dx * dx + dy * dy;
            if (d < d2) { d2 = d; k2 = k; }
          }
        }
        let e = 1e3;
        if (k2 >= 0) { const sx = PX[k2] - PX[k1], sy = PY[k2] - PY[k1]; e = (d2 - d1) / (2 * Math.sqrt(sx * sx + sy * sy) + 1e-6); }
        const hw = hw0 * (0.62 + 0.76 * (0.5 + 0.5 * n2(X * 0.028, Y * 0.04)));
        let c;
        if (e < hw) c = mix(paleHi, pale, (e / hw) * (e / hw));
        else if (e < hw + rw) c = ink;
        else {
          const r1 = Math.sqrt(d1), ey = EYE[k1];
          if (ey && r1 < ey) c = eyeC;
          else if (ey && r1 < ey + 2.4) c = ink;
          else c = mix(body, bodyHi, smooth(hw + rw + 2, hw + rw + 14, e) * 0.75);
        }
        pr = c[0]; pg = c[1]; pb = c[2];
      };
    } else {
      const flk = lift(pale, 0.62), edgeC = mix(body, ink, 0.4);
      const per = 44 + R() * 8, off = R() * per, EXT = [], OFS = [];
      for (let k = 0; k < 20; k++) { EXT.push(30 + R() * 70); OFS.push((R() - 0.5) * 12); }
      pattern = (X, Y) => {
        let c = mix(body, pale, 0.42 + 0.58 * smooth(-0.25, 0.35, fbm(n2, X * 0.006, Y * 0.012, 2)));
        const dy = Y - 96 - 10 * n(X * 0.008, 3.7);                   // волнистая линия хребта
        const zig = Math.abs(((dy / 13) % 2 + 2) % 2 - 1);             // зигзаг молнии
        const xs = X - off - 8 * zig - 5 * n(X * 0.02, Y * 0.02);
        const k = Math.round(xs / per), kk = ((k % 20) + 20) % 20;
        const dist = Math.abs(xs - k * per - OFS[kk]), reach = EXT[kk] - Math.abs(dy);
        if (reach > 0) {
          const t = smooth(0, 10, reach);
          if (dist < 3.4 * t) c = flk; else if (dist < 6 * t) c = edgeC;
        }
        if (hash(Math.floor(X * 0.7), Math.floor(Y * 0.7), 21) < 0.022) c = mix(c, flk, 0.85);   // одиночные белые чешуйки
        pr = c[0]; pg = c[1]; pb = c[2];
      };
    }
    let lu = 1e9, lv = 1e9;
    return shader(1, (x, y, o) => {
      // тело слегка изгибается: решётка чешуи плавно «гуляет»
      const wx = x + 6 * n3(x * 0.0055, y * 0.009);
      const wy = y + 4.5 * n3(x * 0.006 + 7.7, y * 0.008 + 3.1);
      const u = wx / ax + wy / ay, v = wx / ax - wy / ay;
      const iu = Math.floor(u), iv = Math.floor(v);
      const eu = u - iu - 0.5, ev = v - iv - 0.5;
      if (iu !== lu || iv !== lv) { lu = iu; lv = iv; pattern((iu + iv + 1) * ax * 0.5, (iu - iv) * ay * 0.5); }   // узор — один на чешуйку
      // выпуклая чешуйка: свет сверху-слева (в решётке это сторона −u), тёмный шов по краю
      const edge = 0.5 - Math.max(Math.abs(eu), Math.abs(ev));
      const dome = smooth(0, 0.22, edge);
      let k = 0.8 + 0.18 * dome - 0.6 * eu * (1 - 0.5 * dome);
      k *= 0.4 + 0.6 * smooth(0.012, 0.09, edge);
      k *= (0.9 + 0.2 * hash(iu, iv, 5)) * (0.93 + 0.14 * n(x * 0.011, y * 0.02));
      const sp = Math.exp(-((eu + 0.17) * (eu + 0.17) + ev * ev * 0.7) * 24) * 42;
      o[0] = pr * k + sp; o[1] = pg * k + sp; o[2] = pb * k + sp * 0.92;
    });
  });

  // ---------- Леопард (леопард, чёрный леопард) ----------
  // Мех с ворсом вдоль поля, розетки из 3–5 изогнутых пятен вокруг тёмной середины и мелкие
  // сплошные пятна между ними. Края пятен «волосатые»: маску размываем и режем порогом с шумом
  // ворса. Тёмная палитра даёт чёрную пантеру: призрачные розетки на атласном отливе.
  Tex.addGen('leopard', function (f, R, n, n2, n3) {
    const base = fc(f, 0), spot = fc(f, 1), cream = fc(f, 2);
    const dark = lum(base) < 0.3;
    // середина розетки темнее и насыщеннее основы (у светлой палитры — тёплый рыжий тон)
    const d0 = mix(base, spot, dark ? 0.5 : 0.38), dl = (d0[0] + d0[1] + d0[2]) / 3;
    const deep = dark ? d0 : d0.map((v) => dl + (v - dl) * 1.6), rich = mix(base, spot, 0.14);
    const w = Math.round(W * S), h = Math.round(H * S);
    // 1) маска: красный канал — пятна, зелёный — середины розеток
    const m = L.mk(w, h), mx = m.getContext('2d');
    mx.scale(S, S);
    const sx = 35, sy = 29, sites = [];
    for (let row = 0, yy = -6; yy < H + sy; row++, yy += sy) {
      for (let xx = (row & 1 ? sx / 2 : 0) - sx / 2; xx < W + sx; xx += sx) {
        sites.push({ x: xx + (R() - 0.5) * 17, y: yy + (R() - 0.5) * 12, rr: 7.5 + R() * 4.5, ex: 1.05 + R() * 0.32,
          rot: (R() - 0.5) * 0.9, k: 3 + Math.floor(R() * 3), a0: R() * TAU, solid: R() < 0.16 });
      }
    }
    mx.fillStyle = '#00ff00';
    sites.forEach((s) => {
      if (s.solid) return;
      mx.save(); mx.translate(s.x, s.y); mx.rotate(s.rot); mx.scale(s.ex, 1);
      L.blob(mx, 0, 0, s.rr * 0.8, R);
      mx.restore();
    });
    mx.fillStyle = '#ff0000';
    sites.forEach((s) => {
      mx.save(); mx.translate(s.x, s.y); mx.rotate(s.rot); mx.scale(s.ex, 1);
      if (s.solid) {                                   // скопление сплошных пятен
        const cnt = 2 + Math.floor(R() * 3);
        for (let i = 0; i < cnt; i++) L.blob(mx, (R() - 0.5) * s.rr, (R() - 0.5) * s.rr, s.rr * (0.28 + R() * 0.22), R);
      } else {                                         // розетка: 3–5 изогнутых «запятых» по кругу
        const step = TAU / s.k;
        for (let i = 0; i < s.k; i++) {
          const a0 = s.a0 + i * step + (R() - 0.5) * 0.3, span = step * (0.5 + R() * 0.3);
          const th = s.rr * (0.42 + R() * 0.16), wob = R() * TAU;
          mx.beginPath();
          for (let q = 0; q <= 12; q++) {
            const t = q / 12, a = a0 + span * t;
            const r = s.rr * (1 + 0.08 * Math.sin(a * 3 + wob)) + th * 0.5 * (0.35 + 0.65 * Math.sin(Math.PI * t));
            mx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          for (let q = 12; q >= 0; q--) {
            const t = q / 12, a = a0 + span * t;
            const r = s.rr * (1 + 0.08 * Math.sin(a * 3 + wob)) - th * 0.5 * (0.35 + 0.65 * Math.sin(Math.PI * t));
            mx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          mx.closePath(); mx.fill();
        }
      }
      mx.restore();
    });
    // мелкие пятна между розетками
    for (let i = 0; i < 60; i++) {
      const x = R() * W, y = R() * H, r = 1.4 + R() * R() * 3;
      let ok = true;
      for (let k = 0; k < sites.length && ok; k++) {
        const s = sites[k], dx = (x - s.x) / s.ex, dy = y - s.y, lim = s.rr * 1.25 + r;
        if (dx * dx + dy * dy < lim * lim) ok = false;
      }
      if (ok) L.blob(mx, x, y, r, R);
    }
    const md = mx.getImageData(0, 0, w, h).data;
    const A = new Float32Array(w * h), B = new Float32Array(w * h);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) { const a = md[p + 3] / 65025; A[i] = md[p] * a; B[i] = md[p + 1] * a; }
    boxBlur(A, w, h, 2); boxBlur(B, w, h, 4);
    // 2) мех и пятна попиксельно
    const c = L.mk(w, h), cx = c.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
    for (let j = 0, i = 0; j < h; j++) {
      const y = (j + 0.5) / S;
      for (let q = 0; q < w; q++, i++) {
        const x = (q + 0.5) / S;
        const fur = n3(x * 0.07, y * 0.55);                // ворс вытянут вдоль поля
        let col;
        if (dark) {
          const sh = smooth(-0.1, 0.5, fbm(n2, x * 0.0028 + y * 0.0018, y * 0.0062, 2));   // широкий атласный отлив
          col = mix(base, cream, sh * sh * 0.85);
        } else {
          const v = fbm(n, x * 0.0052, y * 0.011, 3);
          col = mix(base, cream, smooth(0.1, 0.5, v) * 0.75);
          col = mix(col, rich, smooth(-0.05, -0.4, v));
        }
        const bi = B[i];
        if (bi > 0.01) col = mix(col, deep, smooth(0.08, 0.5, bi) * 0.95);
        const ai = smooth(0.32, 0.6, A[i] + 0.22 * fur);
        if (ai > 0) col = mix(col, spot, ai);
        const kf = 1 + 0.08 * fur + 0.05 * n2(x * 0.16, y * 1.3);
        const p = i * 4;
        d[p] = col[0] * kf; d[p + 1] = col[1] * kf; d[p + 2] = col[2] * kf; d[p + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return c;
  });

  // ---------- Золотые рыбки (кои) ----------
  // Пруд сверху: синяя вода от светлой лазури до тёмной глубины, сетка каустики, светлые круги
  // ряби и мазки течения, лепестки на воде. Рыбки (золотая, кохаку, танчо, санке, чёрная): тело
  // с чешуёй, спинной полосой, пятнами и бликом, вуалевый хвост и плавники с лучами, глаза,
  // мягкие тени на дне.
  Tex.addGen('koi', function (f, R, n, n2, n3) {
    const paper = fc(f, 0), orange = fc(f, 1), ink = fc(f, 2), blue = fc(f, 3);
    const white = lift(paper, 0.5), peach = mix(orange, paper, 0.5), red = mix(orange, ink, 0.12);
    const deepW = mix(blue, ink, 0.6), shoal = mix(blue, paper, 0.32);
    // вода: светлая лазурь на отмелях → насыщенная синева → тёмная глубина, сверху сетка каустики
    const c = shader(0.5, (x, y, o) => {
      const wash = fbm(n, x * 0.0062, y * 0.0105, 3);
      let col = mix(shoal, blue, smooth(-0.32, 0.05, wash));
      col = mix(col, deepW, smooth(0.0, 0.42, wash) * 0.85);
      const cw = 0.8 * fbm(n3, x * 0.018, y * 0.028, 2);
      const rid = 1 - Math.abs(n2(x * 0.03 + cw, y * 0.048 - cw));
      col = mix(col, white, 0.42 * smooth(0.86, 0.97, rid) * (1 - smooth(0.1, 0.4, wash) * 0.7));
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2];
    });
    // рыбки: x, y, курс, длина тела, изгиб, порода
    // композиция подобрана так, чтобы рыбки попадали и на клинок ножей (правая часть поля),
    // и на приклад, ствольную коробку и магазин винтовок
    const FISH = [
      [178, 86, 0.18, 88, 0.42, 'gold'], [316, 58, Math.PI + 0.15, 64, -0.3, 'kohaku'],
      [420, 92, 0.85, 72, 0.32, 'gold'], [478, 152, 1.45, 40, -0.3, 'tancho'],
      [64, 52, 0.55, 66, -0.3, 'gold'], [76, 150, -0.35, 58, 0.36, 'black'],
      [256, 30, 3.05, 56, 0.3, 'tancho'], [214, 156, 1.2, 52, 0.3, 'sanke'],
    ].map((a) => ({ x: a[0] + (R() - 0.5) * 8, y: a[1] + (R() - 0.5) * 6, a: a[2] + (R() - 0.5) * 0.2,
      L: a[3] * (1.04 + R() * 0.12), bend: a[4] * (0.8 + R() * 0.4), kind: a[5], ph: R() * TAU }));
    // точка рыбы: s — вдоль тела (0 — основание хвоста, 1 — нос), l — поперёк, в единицах поля
    function fp(F, s, l) {
      const sp = F.bend * F.L * 0.34 * (1 - s) * (1 - s);
      const lx = (s - 0.55) * F.L, ly = sp + l, ca = Math.cos(F.a), sa = Math.sin(F.a);
      return [F.x + lx * ca - ly * sa, F.y + lx * sa + ly * ca];
    }
    const wid = (F, s) => F.L * (0.03 * (1 - s) + 0.172 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(Math.max(0, s), 1.25))), 0.62));
    function bodyPts(F) {
      const P = [];
      for (let i = 0; i <= 20; i++) { const s = i / 20; P.push(fp(F, s, -wid(F, s))); }
      for (let i = 19; i >= 1; i--) { const s = i / 20; P.push(fp(F, s, wid(F, s))); }
      return P;
    }
    // лопасть вуалевого хвоста (side = ±1), края слегка волнуются
    const LOBE = [[0, 0.012], [-0.1, 0.07], [-0.24, 0.16], [-0.4, 0.25], [-0.56, 0.3], [-0.67, 0.29], [-0.66, 0.22], [-0.6, 0.17], [-0.56, 0.1], [-0.5, 0.05], [-0.42, 0.012]];
    const lobePts = (F, side) => LOBE.map((p, i) => fp(F, p[0], side * F.L * (p[1] + (i > 2 ? 0.022 * Math.sin(i * 1.4 + F.ph + side) : 0))));
    // плавник-веер: база на теле в точке s, форма в долях L
    const FAN = [[0, 0], [-0.03, 0.09], [-0.1, 0.16], [-0.18, 0.15], [-0.17, 0.07], [-0.08, 0.01]];
    const finPts = (F, s, side, k) => { const w0 = wid(F, s) * 0.8; return FAN.map((p) => fp(F, s + p[0] * k, side * (w0 + p[1] * F.L * k))); };
    const STY = {
      gold: { body: mix(orange, paper, 0.16), band: red, bandA: 0.3, fin: orange, fin2: peach, ray: red, sc: white },
      kohaku: { body: white, band: mix(white, blue, 0.25), bandA: 0.1, fin: white, fin2: mix(white, orange, 0.3), ray: mix(paper, ink, 0.3), sc: white },
      black: { body: mix(ink, blue, 0.1), band: mix(ink, blue, 0.45), bandA: 0.22, fin: ink, fin2: mix(ink, blue, 0.4), ray: mix(ink, blue, 0.6), sc: mix(ink, white, 0.5) },
    };
    STY.tancho = STY.kohaku; STY.sanke = STY.kohaku;
    function silhouette(x, F) {
      [-1, 1].forEach((sd) => { blobPath(x, lobePts(F, sd)); x.fill(); blobPath(x, finPts(F, 0.7, sd, 1)); x.fill(); });
      blobPath(x, bodyPts(F)); x.fill();
    }
    function drawFish(x, F) {
      const st = STY[F.kind], b0 = fp(F, 0, 0);
      // хвост
      [-1, 1].forEach((sd) => {
        const P = lobePts(F, sd), tip = fp(F, -0.6, sd * 0.28 * F.L);
        const g = x.createLinearGradient(b0[0], b0[1], tip[0], tip[1]);
        g.addColorStop(0, css(st.fin, 0.88)); g.addColorStop(1, css(st.fin2, 0.32));
        x.fillStyle = g; blobPath(x, P); x.fill();
        x.strokeStyle = css(st.ray, 0.38); x.lineWidth = 0.35;
        x.beginPath();
        for (let i = 3; i < P.length - 1; i++) { x.moveTo(b0[0], b0[1]); x.quadraticCurveTo((b0[0] * 0.4 + P[i][0] * 0.6), (b0[1] * 0.4 + P[i][1] * 0.6) + sd * 0.6, P[i][0], P[i][1]); }
        x.stroke();
        x.strokeStyle = css(white, 0.35); x.lineWidth = 0.45; blobPath(x, P); x.stroke();
      });
      // грудные и брюшные плавники (под телом)
      [[0.7, 1], [0.36, 0.62]].forEach((q) => {
        [-1, 1].forEach((sd) => {
          const P = finPts(F, q[0], sd, q[1]), base = P[0];
          const g = x.createLinearGradient(base[0], base[1], P[3][0], P[3][1]);
          g.addColorStop(0, css(st.fin, 0.8)); g.addColorStop(1, css(st.fin2, 0.35));
          x.fillStyle = g; blobPath(x, P); x.fill();
          x.strokeStyle = css(st.ray, 0.35); x.lineWidth = 0.3;
          x.beginPath(); for (let i = 1; i < 5; i++) { x.moveTo(base[0], base[1]); x.lineTo(P[i][0], P[i][1]); } x.stroke();
        });
      });
      // тело
      const B = bodyPts(F);
      x.fillStyle = css(st.body); blobPath(x, B); x.fill();
      x.save(); blobPath(x, B); x.clip();
      const spine = [];
      for (let i = 0; i <= 12; i++) spine.push(fp(F, 0.02 + i * 0.08, 0));
      // пятна пород
      if (F.kind === 'kohaku' || F.kind === 'sanke') {
        x.fillStyle = css(red);
        const cnt = 2 + Math.floor(R() * 2);
        for (let i = 0; i < cnt; i++) { const p = fp(F, 0.3 + (i + R() * 0.6) * 0.55 / cnt, (R() - 0.5) * 0.12 * F.L); L.blob(x, p[0], p[1], F.L * (0.1 + R() * 0.07), R); }
      }
      if (F.kind === 'tancho') { const p = fp(F, 0.85, 0); x.fillStyle = css(red); x.beginPath(); x.arc(p[0], p[1], F.L * 0.072, 0, TAU); x.fill(); }
      if (F.kind === 'sanke') {
        x.fillStyle = css(ink, 0.92);
        for (let i = 0; i < 4; i++) { const p = fp(F, 0.2 + R() * 0.55, (R() - 0.5) * 0.24 * F.L); L.blob(x, p[0], p[1], F.L * (0.025 + R() * 0.035), R); }
      }
      if (F.kind === 'gold') { const p = fp(F, 0.86, 0); x.fillStyle = css(white, 0.4); L.blob(x, p[0], p[1], F.L * 0.08, R); }
      // спинная полоса (объём), тёмная кромка
      [0.26, 0.17, 0.08].forEach((k) => { x.strokeStyle = css(st.band, st.bandA); x.lineWidth = F.L * k; linePath(x, spine); x.stroke(); });
      x.strokeStyle = css(mix(st.body, ink, 0.45), 0.32); x.lineWidth = F.L * 0.09; blobPath(x, B); x.stroke();
      // чешуя
      x.strokeStyle = css(st.sc, 0.24); x.lineWidth = 0.35;
      x.beginPath();
      for (let s = 0.12, row = 0; s < 0.8; s += 0.052, row++) {
        const wv = wid(F, s);
        for (let l = -wv * 0.85; l <= wv * 0.85; l += F.L * 0.046) {
          const p = fp(F, s + (row & 1 ? 0.026 : 0), l), a = F.a + Math.PI;
          x.moveTo(p[0] + Math.cos(a - 1.1) * F.L * 0.03, p[1] + Math.sin(a - 1.1) * F.L * 0.03);
          x.arc(p[0], p[1], F.L * 0.03, a - 1.1, a + 1.1);
        }
      }
      x.stroke();
      // жаберная крышка и блик на спине
      const g1 = fp(F, 0.79, -wid(F, 0.79) * 0.95), g2 = fp(F, 0.84, 0), g3 = fp(F, 0.79, wid(F, 0.79) * 0.95);
      x.strokeStyle = css(ink, 0.2); x.lineWidth = 0.55;
      x.beginPath(); x.moveTo(g1[0], g1[1]); x.quadraticCurveTo(g2[0], g2[1], g3[0], g3[1]); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = F.L * 0.022;
      linePath(x, spine.slice(4, 11).map((p) => [p[0] - 0.6, p[1] - 0.8])); x.stroke();
      x.restore();
      // спинной плавник — узкая линза вдоль хребта
      const D = [];
      for (let i = 0; i <= 8; i++) D.push(fp(F, 0.22 + i * 0.05, -0.022 * F.L * Math.sin(Math.PI * i / 8)));
      for (let i = 7; i >= 1; i--) D.push(fp(F, 0.22 + i * 0.05, 0.022 * F.L * Math.sin(Math.PI * i / 8)));
      x.fillStyle = css(mix(st.fin, ink, 0.25), 0.5); blobPath(x, D); x.fill();
      // глаза
      [-1, 1].forEach((sd) => {
        const p = fp(F, 0.9, sd * wid(F, 0.9) * 0.74);
        x.fillStyle = css(mix(orange, paper, 0.35)); x.beginPath(); x.arc(p[0], p[1], F.L * 0.034, 0, TAU); x.fill();
        x.fillStyle = css(ink); x.beginPath(); x.arc(p[0], p[1], F.L * 0.024, 0, TAU); x.fill();
        x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(p[0] - F.L * 0.009, p[1] - F.L * 0.009, F.L * 0.009, 0, TAU); x.fill();
      });
    }
    return paint(c, (x) => {
      // мазки течения
      for (let i = 0; i < 6; i++) {
        const y0 = 14 + i * 32 + (R() - 0.5) * 14, ph = R() * TAU, amp = 3 + R() * 4, P = [];
        for (let xx = -20; xx <= W + 20; xx += 12) P.push([xx, y0 + amp * Math.sin(xx * 0.021 + ph) + 2 * Math.sin(xx * 0.057 + ph * 2)]);
        x.strokeStyle = css(white, 0.1 + R() * 0.08); x.lineWidth = 0.8 + R() * 0.8;
        linePath(x, P); x.stroke();
      }
      // круги ряби (прерывистые)
      for (let i = 0; i < 7; i++) {
        const rx = R() * W, ry = R() * H, r0 = 5 + R() * 9;
        for (let q = 0; q < 3; q++) {
          x.strokeStyle = css(white, 0.5 - q * 0.14); x.lineWidth = 1.1 - q * 0.25;
          for (let s = 0; s < 3; s++) {
            const a0 = R() * TAU;
            x.beginPath(); x.arc(rx, ry, r0 * (1 + q * 0.6), a0, a0 + 0.8 + R() * 1.4); x.stroke();
          }
        }
      }
      // тени рыб на дне: силуэты в низком разрешении, растянутые — мягкий край без фильтров
      const sh = L.mk(W / 4, H / 4), sx = sh.getContext('2d');
      sx.scale(0.25, 0.25); sx.translate(5, 7);
      sx.fillStyle = css(mix(blue, ink, 0.75));
      FISH.forEach((F) => silhouette(sx, F));
      x.save(); x.globalAlpha = 0.45; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(sh, 0, 0, W, H);
      x.restore();
      FISH.slice().sort((a, b) => a.L - b.L).forEach((F) => drawFish(x, F));
      // лепестки на воде
      for (let i = 0; i < 6; i++) {
        const px = R() * W, py = R() * H, a = R() * TAU, s = 3 + R() * 2.5;
        x.save(); x.translate(px, py); x.rotate(a);
        x.fillStyle = css(mix(blue, ink, 0.5), 0.18); x.beginPath(); x.ellipse(1.2, 1.8, s, s * 0.62, 0, 0, TAU); x.fill();
        x.fillStyle = css(mix(peach, white, 0.35));
        x.beginPath(); x.moveTo(-s, 0); x.quadraticCurveTo(-s * 0.2, -s * 0.85, s, -s * 0.12); x.lineTo(s * 0.62, 0); x.lineTo(s, s * 0.12); x.quadraticCurveTo(-s * 0.2, s * 0.85, -s, 0); x.fill();
        x.strokeStyle = css(orange, 0.35); x.lineWidth = 0.3; x.beginPath(); x.moveTo(-s * 0.9, 0); x.lineTo(s * 0.4, 0); x.stroke();
        x.restore();
      }
      // пузырьки у голов
      FISH.forEach((F, i) => {
        if (i % 2) return;
        for (let k = 0; k < 3; k++) {
          const p = fp(F, 1.12 + k * 0.1 + R() * 0.05, (R() - 0.5) * 0.15 * F.L), r = 0.7 + R() * 1.1;
          x.fillStyle = 'rgba(255,255,255,.18)'; x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 0.4;
          x.beginPath(); x.arc(p[0], p[1], r, 0, TAU); x.fill(); x.stroke();
        }
      });
    });
  });

  // ---------- Призма: тёмный «кэнди»-металл с закрученными озёрами яркого цвета ----------
  // Двойное искажение крупного шума даёт плавные вихри, как у самоцветных кэнди-покрасок:
  // много спокойного тёмного металла, в нём — светящиеся озёра (глубокий цвет → яркий →
  // светлое ядро) с шелковистыми струйками по течению и мягким ореолом. Сверху —
  // металлическая крошка и редкие звёздочки-искры.
  Tex.addGen('prism', function (f, R, n, n2, n3) {
    const dark = fc(f, 0), hot = fc(f, 1), glow = fc(f, 2), deep = fc(f, 3);
    const deepD = mix(dark, deep, 0.75);
    const sc = 0.0046 + R() * 0.001, wq = 3.0 + R() * 0.6, ph = R() * TAU, sh = (R() - 0.5) * 0.06;
    let fr = 0, fq = 0;
    function field(x, y) {
      const px = x * sc, py = y * sc * 1.2;
      const qx = fbm(n, px, py, 3), qy = fbm(n2, px + 5.2, py + 1.3, 3);
      const rx = fbm(n, px + wq * qx + 1.7, py + wq * qy + 9.2, 3), ry = fbm(n2, px + wq * qx + 8.3, py + wq * qy + 2.8, 3);
      fr = rx - ry; fq = qx;
      return fbm(n3, px + 3.3 * rx, py + 3.3 * ry, 4) + sh;
    }
    const c = shader(0.625, (x, y, o) => {
      const t = 0.5 + 1.55 * field(x, y);
      // металл: почти чёрный с широким глубоким переливом (флоп кэнди-краски)
      const flop = 0.5 + 0.5 * Math.sin(x * sc * 2.2 + y * sc * 1.6 + 2.6 * fq + ph);
      let col = mix(dark, deepD, 0.25 + 0.55 * flop * flop);
      col = mix(col, deep, smooth(0.34, 0.5, t) * 0.8);                 // ореол вокруг озера
      const a = smooth(0.47, 0.6, t);
      if (a > 0) {
        let pc = mix(deep, hot, smooth(0.47, 0.66, t));
        pc = mix(pc, glow, smooth(0.7, 0.95, t) * 0.92);                // светлое ядро
        const silk = 0.93 + 0.11 * (0.5 + 0.5 * Math.sin(t * 34 + fr * 9));   // струйки по течению
        col = mix(col, [pc[0] * silk, pc[1] * silk, pc[2] * silk], a);
      }
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2];
    });
    const thr = (0.66 - 0.5) / 1.55;                                     // искры — только в ярких озёрах
    // металлическая крошка: попиксельная зернистость и редкие блёстки
    const ctx = c.getContext('2d'), img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0, p = 0; p < d.length; i++, p += 4) {
      const hv = hash(i, 17, 5);
      if (hv > 0.993) {
        const k = 0.35 + 0.65 * (hv - 0.993) / 0.007;
        d[p] += (glow[0] - d[p]) * k; d[p + 1] += (glow[1] - d[p + 1]) * k; d[p + 2] += (glow[2] - d[p + 2]) * k;
      } else {
        const k = 0.93 + 0.14 * hash(i, 3, 9);
        d[p] *= k; d[p + 1] *= k; d[p + 2] *= k;
      }
    }
    ctx.putImageData(img, 0, 0);
    // искры в озёрах
    return paint(c, (x) => {
      x.fillStyle = '#fff'; x.shadowColor = css(glow); x.shadowBlur = 5 * S;
      for (let t = 0, placed = 0; t < 400 && placed < 13; t++) {
        const px = 4 + R() * (W - 8), py = 4 + R() * (H - 8);
        if (field(px, py) < thr + 0.04) continue;
        placed++;
        x.globalAlpha = 0.55 + R() * 0.45;
        star(x, px, py, 1.8 + R() * 3.2);
      }
    });
  });

  // ---------- Кислотное травление ----------
  // Зеркальная сталь (≈70 % поверхности) с продольными рисками; кислота выела крупные рваные «укусы»
  // и мелкие спутники-раковины. Внутри травления — три чёткие ступени-террасы (каждая со своим тоном
  // и тёмной ступенькой в 1 px, со стороны света — светлая грань), по краю — яркая кайма-«прилив»
  // и тонкая цвета побежалости (солома → синева). Вниз от укусов стекают длинные сужающиеся потёки.
  // Поле травления считается на грубой сетке, порог сглаживается по градиенту — края плавные.
  Tex.addGen('acid', function (f, R, n, n2, n3) {
    const steel = fc(f, 0), etch = fc(f, 1), bright = fc(f, 2);
    const TONE = [mix(steel, etch, 0.4), mix(steel, etch, 0.64), mix(steel, etch, 0.88)];
    const stepC = lift(etch, -0.5), rimC = lift(bright, 0.5), straw = [214, 176, 98], tblue = [92, 118, 178];
    // укусы: по одному на каждую крупную окрашенную зону (приклад, коробка, магазин, цевьё, клинок, кольцо)
    const B = [];
    [[80, 92], [196, 66], [262, 140], [334, 64], [408, 54], [436, 136], [56, 152], [160, 146], [478, 96]].forEach((p) =>
      B.push([p[0] + (R() - 0.5) * 22, p[1] + (R() - 0.5) * 14, 15 + R() * 8, R() * Math.PI, 0.55 + R() * 0.4]));
    for (let i = 0; i < 9; i++) B.push([R() * W, R() * H, 7 + R() * 7, R() * Math.PI, 0.6 + R() * 0.4]);
    B.forEach((q) => { q.push(Math.cos(q[3]), Math.sin(q[3])); });
    const ca = Math.cos(0.52), sa = Math.sin(0.52);                  // шум повёрнут на 30°: края не липнут к осям
    const E = grid(1.25, (x, y) => {
      const u = x * ca - y * sa, v = x * sa + y * ca;
      const wx = x + 13 * fbm(n2, u * 0.013, v * 0.017, 2), wy = y + 9 * fbm(n3, u * 0.014 + 4.1, v * 0.016 + 2.3, 2);
      let b = 0;
      for (let k = 0; k < B.length; k++) {
        const q = B[k], dx = wx - q[0], dy = wy - q[1];
        const ex = dx * q[5] + dy * q[6], ey = (dy * q[5] - dx * q[6]) / q[4];
        const d = Math.sqrt(ex * ex + ey * ey) / q[2];
        if (d < 2) b = Math.max(b, 1 - d * 0.5);
      }
      const wu = wx * ca - wy * sa, wv = wx * sa + wy * ca;
      return 0.62 * b * b + 0.5 * fbm(n, wu * 0.021, wv * 0.027, 3);
    });
    const LV = [quant(E, 0.7), quant(E, 0.835), quant(E, 0.93)];   // ≈30 % травления, из них ступени 55 % и 25 %
    // широкие мягкие отражения полированной стали
    const RF = grid(3, (x, y) => 0.6 * Math.sin((x * 0.75 + y * 1.9) * 0.011 + 2.2 * fbm(n3, x * 0.004, y * 0.007, 2)) + 0.5 * fbm(n3, x * 0.009 + 7, y * 0.016, 2));
    const c = shader(1, (x, y, o) => {
      const rf = RF(x, y);
      let col = mix(steel, bright, 0.2 + 0.62 * smooth(-0.45, 0.55, rf));
      col = mix(col, mix(steel, etch, 0.32), smooth(-0.2, -0.75, rf) * 0.55);
      const br = 1 + 0.035 * n(x * 0.006, y * 1.35);                  // продольные риски
      const e = E(x, y);
      if (e > LV[0] - 0.12) {
        const gx = E(x + 0.8, y) - E(x - 0.8, y), gy = E(x, y + 0.8) - E(x, y - 0.8);
        const g = Math.sqrt(gx * gx + gy * gy) / 1.6 + 1e-5;
        const d0 = (e - LV[0]) / g * S;                              // до края травления, px (>0 — внутри)
        if (d0 < -1.4) {                                             // побежалость: солома → синева
          const t = clamp01((-d0 - 1.4) / 7);
          col = mix(col, mix(straw, tblue, t), 0.3 * (1 - t) * (1 - t));
        }
        col = mix(col, rimC, band(d0, -1, 1.25) * 0.95);             // кайма-«прилив»
        if (d0 > -0.5) {
          const d1 = (e - LV[1]) / g * S, d2 = (e - LV[2]) / g * S;
          let tc = TONE[0];
          if (d1 > -0.5) tc = mix(tc, TONE[1], clamp01(d1 + 0.5));
          if (d2 > -0.5) tc = mix(tc, TONE[2], clamp01(d2 + 0.5));
          // матовое дно: мелкое кристаллическое зерно и редкие мягкие искорки
          const px = Math.floor(x * S), py = Math.floor(y * S), hv = hash(px >> 1, py >> 1, 7);
          let k = 0.93 + 0.1 * hv;
          if (hash(px, py, 11) > 0.988) k += 0.16;
          tc = [tc[0] * k, tc[1] * k, tc[2] * k];
          col = mix(col, tc, clamp01(d0 + 0.5));
          // ступеньки: тёмная линия 1 px; стенка, обращённая к свету (низ-право), — светлая грань
          const lit = -(gx + gy) / (g * 1.6 * 1.4142);
          const dk = 0.62 - 0.3 * lit, hl = Math.max(0, lit) * 0.55;
          col = mix(col, stepC, Math.min(1, band(d0, 0.75, 1.05) * dk));
          col = mix(col, stepC, Math.min(1, band(d1, 0.75, 1.05) * dk * 0.9));
          col = mix(col, stepC, Math.min(1, band(d2, 0.75, 1.05) * dk * 0.85));
          col = mix(col, rimC, band(d1, 1.9, 0.9) * hl + band(d2, 1.9, 0.9) * hl);
        }
      }
      o[0] = col[0] * br; o[1] = col[1] * br; o[2] = col[2] * br;
    });
    // потёки: старт на нижнем крае укуса, длинная сужающаяся струйка с каплей на конце
    const starts = [];
    for (let x = 6; x < W - 6; x += 2.5) {
      for (let y = 4; y < H - 16; y += 1.5) {
        if (E(x, y) >= LV[0] && E(x, y + 1.5) < LV[0]) starts.push([x, y + 1]);
      }
    }
    for (let i = starts.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = starts[i]; starts[i] = starts[j]; starts[j] = t; }
    const drips = [];
    starts.forEach((p) => {
      if (drips.length >= 26) return;
      if (drips.some((d) => Math.abs(d[0] - p[0]) < 9 && Math.abs(d[1] - p[1]) < 30)) return;
      drips.push([p[0], p[1], 12 + R() * R() * 46, 1.3 + R() * 1.3, R() * TAU]);
    });
    // раковины-спутники: у края травления, снаружи
    const pits = [];
    for (let t = 0; t < 4000 && pits.length < 46; t++) {
      const px = R() * W, py = R() * H, e = E(px, py);
      if (e > LV[0] - 0.1 && e < LV[0] - 0.025) pits.push([px, py, 0.7 + R() * R() * 2.4]);
    }
    const t0 = css(TONE[0]), t1 = css(TONE[1]), sk = css(stepC, 0.85), rim = css(rimC, 0.9);
    return paint(c, (x) => {
      drips.forEach((d) => {
        const x0 = d[0], y0 = d[1], len = d[2], w0 = d[3], ph = d[4], N = 14, Lp = [], Rp = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N, yy = y0 - 2 + (len + 2) * t, xx = x0 + 1.1 * Math.sin(t * len * 0.09 + ph) * t;
          const hw = w0 * Math.pow(1 - t * 0.86, 1.4);
          Lp.push([xx - hw, yy]); Rp.push([xx + hw, yy]);
        }
        const tip = Lp[N], bead = (Lp[N][0] + Rp[N][0]) / 2, br = w0 * 0.55;
        x.beginPath(); x.moveTo(Lp[0][0], Lp[0][1]);
        for (let i = 1; i <= N; i++) x.lineTo(Lp[i][0], Lp[i][1]);
        x.arc(bead, tip[1], br, Math.PI, 0, true);
        for (let i = N; i >= 0; i--) x.lineTo(Rp[i][0], Rp[i][1]);
        x.lineWidth = 1.15; x.strokeStyle = rim; x.stroke();     // кайма по бокам струйки
        x.fillStyle = t0; x.fill();
        x.beginPath(); x.moveTo(Lp[1][0] + 0.35, Lp[1][1]);
        for (let i = 2; i <= N; i++) x.lineTo(Lp[i][0] + 0.35, Lp[i][1]);
        x.lineWidth = 0.55; x.strokeStyle = sk; x.stroke();      // тёмная ступенька по левому краю
      });
      pits.forEach((p) => {
        x.beginPath(); x.arc(p[0], p[1], p[2] + 0.45, 0, TAU); x.fillStyle = rim; x.fill();
        x.beginPath(); x.arc(p[0], p[1], p[2], 0, TAU); x.fillStyle = t1; x.fill();
        x.beginPath(); x.arc(p[0], p[1], p[2] * 0.82, Math.PI * 0.85, Math.PI * 1.65); x.lineWidth = 0.5; x.strokeStyle = sk; x.stroke();
      });
      // редкие царапины от галтовки
      [['rgba(255,255,255,.14)', 0.35], ['rgba(0,0,0,.1)', 0.35]].forEach((g) => {
        x.strokeStyle = g[0]; x.lineWidth = g[1];
        x.beginPath();
        for (let i = 0; i < 40; i++) {
          const px = R() * W, py = R() * H, len = 3 + R() * R() * 18, a = (R() - 0.5) * 0.5;
          x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
        }
        x.stroke();
      });
    });
  });

  // ---------- Чеканка: серебро с гравированными завитками аканта ----------
  // Зачернённый («чернь») пунсонный фон; по нему три ряда стеблей-волн, в каждой «бухте» волны — спираль-
  // завиток с листьями аканта и розеткой на конце, на гребнях — пары листьев, на перегибах —
  // усики. Рельеф: светлый гребень ленты, тёмная гравированная обводка, штриховка на теневой
  // стороне, светлый отсвет сверху-слева и тень снизу-справа от всего орнамента.
  Tex.addGen('scroll', function (f, R, n) {
    const silver = fc(f, 0), dk = fc(f, 1), hi = fc(f, 2);
    // фон зачернён, как серебро с чернью: светлый орнамент читается даже на миниатюре
    const ground = lift(dk, -0.5), groundHi = lift(dk, -0.12);
    const c = shader(1, (x, y, o) => {
      const col = mix(ground, groundHi, smooth(-0.3, 0.45, fbm(n, x * 0.0065, y * 0.011, 2)));
      const hv = hash(Math.floor(x * 0.95), Math.floor(y * 0.95), 9);
      const k = hv > 0.62 ? 0.74 : hv < 0.2 ? 1.16 : 0.97;
      o[0] = col[0] * k; o[1] = col[1] * k; o[2] = col[2] * k;
    });
    const orn = L.full(), ox = orn.getContext('2d');
    ox.scale(S, S); ox.lineJoin = 'round'; ox.lineCap = 'round';
    const cSil = css(silver), cHi = css(hi, 0.85), cDk = css(dk, 0.95);
    // лента вдоль ломаной P, ширина wf(t)
    function ribbon(P, wf) {
      const N = P.length, A = [], B = [], T = [];
      for (let i = 0; i < N; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(N - 1, i + 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        const hw = wf(i / (N - 1)) / 2;
        T.push([-ty, tx, hw]);
        A.push([P[i][0] - ty * hw, P[i][1] + tx * hw]);
        B.push([P[i][0] + ty * hw, P[i][1] - tx * hw]);
      }
      ox.beginPath();
      ox.moveTo(A[0][0], A[0][1]);
      for (let i = 1; i < N; i++) ox.lineTo(A[i][0], A[i][1]);
      for (let i = N - 1; i >= 0; i--) ox.lineTo(B[i][0], B[i][1]);
      ox.closePath();
      ox.fillStyle = cSil; ox.fill();
      ox.lineWidth = 0.75; ox.strokeStyle = cDk; ox.stroke();
      // штрихи на теневой стороне и светлый гребень на освещённой
      ox.beginPath();
      for (let i = 1; i < N - 1; i += 2) {
        const t = T[i], s = (t[0] + t[1]) > 0 ? 1 : -1;
        ox.moveTo(P[i][0] + t[0] * s * t[2] * 0.95, P[i][1] + t[1] * s * t[2] * 0.95);
        ox.lineTo(P[i][0] + t[0] * s * t[2] * 0.2, P[i][1] + t[1] * s * t[2] * 0.2);
      }
      ox.lineWidth = 0.42; ox.strokeStyle = css(dk, 0.55); ox.stroke();
      ox.beginPath();
      for (let i = 0; i < N; i++) {
        const t = T[i], s = (t[0] + t[1]) > 0 ? -1 : 1, px = P[i][0] + t[0] * s * t[2] * 0.3, py = P[i][1] + t[1] * s * t[2] * 0.3;
        if (i === 0) ox.moveTo(px, py); else ox.lineTo(px, py);
      }
      ox.lineWidth = Math.max(0.5, wf(0.3) * 0.22); ox.strokeStyle = cHi; ox.stroke();
    }
    // лист аканта: изогнутая ось, лопасти по одной стороне (side), жилки
    function leaf(x0, y0, ang, len, wd, curl, side) {
      const N = 14, ax = [], Lp = [], Rp = [];
      let px = x0, py = y0, a = ang;
      for (let i = 0; i <= N; i++) {
        ax.push([px, py, a]);
        a += curl / N; px += Math.cos(a) * len / N; py += Math.sin(a) * len / N;
      }
      for (let i = 0; i <= N; i++) {
        const t = i / N, q = ax[i], wv = wd * Math.sin(Math.PI * Math.pow(t, 0.7));
        const lob = 0.7 + 0.3 * Math.abs(Math.cos(t * 3 * Math.PI));
        const nx = -Math.sin(q[2]) * side, ny = Math.cos(q[2]) * side;
        Lp.push([q[0] + nx * wv * lob, q[1] + ny * wv * lob]);
        Rp.push([q[0] - nx * wv * 0.6, q[1] - ny * wv * 0.6]);
      }
      ox.beginPath();
      ox.moveTo(Lp[0][0], Lp[0][1]);
      for (let i = 1; i <= N; i++) ox.lineTo(Lp[i][0], Lp[i][1]);
      for (let i = N; i >= 0; i--) ox.lineTo(Rp[i][0], Rp[i][1]);
      ox.closePath();
      ox.fillStyle = cSil; ox.fill();
      ox.lineWidth = 0.7; ox.strokeStyle = cDk; ox.stroke();
      // светлая сторона лопастей и жилки
      ox.beginPath(); ox.moveTo(ax[1][0], ax[1][1]);
      for (let i = 2; i < N; i++) { const q = ax[i], t = i / N, wv = wd * Math.sin(Math.PI * Math.pow(t, 0.7)) * 0.45; ox.lineTo(q[0] - Math.sin(q[2]) * side * wv, q[1] + Math.cos(q[2]) * side * wv); }
      ox.lineWidth = Math.max(0.6, wd * 0.28); ox.strokeStyle = cHi; ox.stroke();
      ox.beginPath(); ox.moveTo(ax[0][0], ax[0][1]);
      for (let i = 1; i < N; i++) ox.lineTo(ax[i][0], ax[i][1]);
      [5, 10].forEach((i) => { ox.moveTo(ax[i][0], ax[i][1]); ox.lineTo(Lp[i][0] * 0.75 + ax[i][0] * 0.25, Lp[i][1] * 0.75 + ax[i][1] * 0.25); });
      ox.lineWidth = 0.45; ox.strokeStyle = css(dk, 0.7); ox.stroke();
    }
    function rosette(x0, y0, r) {
      ox.lineWidth = 0.55; ox.strokeStyle = cDk;
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6;
        ox.fillStyle = cSil; ox.beginPath(); ox.ellipse(x0 + Math.cos(a) * r * 0.55, y0 + Math.sin(a) * r * 0.55, r * 0.5, r * 0.3, a, 0, TAU); ox.fill(); ox.stroke();
      }
      ox.fillStyle = css(hi); ox.beginPath(); ox.arc(x0, y0, r * 0.36, 0, TAU); ox.fill(); ox.stroke();
    }
    // спираль: центр, начальный радиус, начальный угол, направление, витки, ширина ленты
    function spiral(cx, cy, r0, th0, dir, turns, w0) {
      const P = [], Phi = turns * TAU;
      for (let ph = 0; ph <= Phi; ph += 0.05) {
        const r = r0 * (1 - 0.8 * ph / Phi), a = th0 + dir * ph;
        P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      ribbon(P, (t) => w0 * (1 - 0.68 * t));
      return P;
    }
    const lam = 148 + R() * 14, A = 13.5;
    [31, 96, 161].forEach((yc) => {
      const x0 = R() * lam, sy = (x) => yc + A * Math.sin(TAU * (x - x0) / lam);
      const bays = [];
      for (let k = -3; k < 12; k++) {
        const xm = x0 + lam / 4 + k * lam / 2;
        if (xm > -lam * 0.4 && xm < W + lam * 0.4) bays.push([xm, k & 1 ? -1 : 1]);
      }
      // пары листьев на выпуклой стороне гребней (под стеблем)
      bays.forEach((b) => {
        const xm = b[0], up = b[1], y0 = sy(xm) + up * 1.5, base = up > 0 ? Math.PI / 2 : -Math.PI / 2;
        leaf(xm, y0, base - 0.75 * up, 13 + R() * 4, 4.8, -0.6 * up, up);
        leaf(xm, y0, base + 0.75 * up, 13 + R() * 4, 4.8, 0.6 * up, -up);
      });
      // стебель
      const stem = [];
      for (let xx = -30; xx <= W + 30; xx += 1.6) stem.push([xx, sy(xx)]);
      ribbon(stem, () => 4.8);
      // завитки в бухтах: разный размер и число витков, чтобы ряд не выглядел штампованным
      bays.forEach((b) => {
        const xm = b[0], up = b[1], r0 = 19 + R() * 8;
        const th0 = up > 0 ? Math.PI / 2 : -Math.PI / 2, dir = up > 0 ? -1 : 1;
        const cy = sy(xm) - up * r0;
        const P = spiral(xm, cy, r0, th0, dir, 1.05 + R() * 0.35, 4.8);
        [0.9, 1.8, 2.7, 3.6].forEach((ph, i) => {
          const idx = Math.min(P.length - 2, Math.round(ph / 0.05)), p = P[idx], q = P[idx + 1];
          const tx = q[0] - p[0], ty = q[1] - p[1], tl = Math.hypot(tx, ty) || 1;
          const rx = p[0] - xm, ry = p[1] - cy, rl = Math.hypot(rx, ry) || 1;
          const dx = tx / tl * 0.75 + rx / rl * 0.65, dy = ty / tl * 0.75 + ry / rl * 0.65;
          const k = 1 - i * 0.2, side = (-Math.sin(Math.atan2(dy, dx)) * rx + Math.cos(Math.atan2(dy, dx)) * ry) > 0 ? 1 : -1;
          leaf(p[0] + rx / rl * 1.8, p[1] + ry / rl * 1.8, Math.atan2(dy, dx), 12 * k + 3, 4.4 * k + 0.8, dir * 0.9, side);
        });
        const e = P[P.length - 1];
        rosette(e[0] * 0.6 + xm * 0.4, e[1] * 0.6 + cy * 0.4, 3.4);
      });
      // усики на перегибах стебля
      bays.forEach((b, i) => {
        const xz = b[0] + lam / 4, yz = sy(xz), up = i & 1 ? 1 : -1;
        const r0 = 4.5, cx = xz + 2, cy = yz + up * (r0 + 1.5);
        const P = [];
        for (let ph = 0; ph <= 1.5 * TAU; ph += 0.12) {
          const r = r0 * (1 - 0.7 * ph / (1.5 * TAU)), a = (up > 0 ? -Math.PI / 2 : Math.PI / 2) + (up > 0 ? 1 : -1) * ph;
          P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        ribbon(P, (t) => 1.5 * (1 - 0.5 * t));
      });
    });
    // рельеф: отсвет сверху-слева, затем тень снизу-справа
    const cx = c.getContext('2d');
    cx.save();
    cx.shadowColor = 'rgba(255,255,255,.4)'; cx.shadowOffsetX = -1.2; cx.shadowOffsetY = -1.2; cx.shadowBlur = 1;
    cx.drawImage(orn, 0, 0);
    cx.shadowColor = 'rgba(0,0,0,.62)'; cx.shadowOffsetX = 2; cx.shadowOffsetY = 2.6; cx.shadowBlur = 3;
    cx.drawImage(orn, 0, 0);
    cx.restore();
    return c;
  });

  // ---------- Витраж: окна-розы и мозаика стекла в свинцовой оплётке ----------
  // Две розы: ступица с лепестками, 8 синих стрельчатых лепестков с золотыми окошками и
  // красными уголками, 16 круглых «очей» на красном, синий обод из 32 долек и толстая рамка.
  // Вокруг — мозаика из ячеек Вороного (больше синего и красного, как в готике).
  // Стекло светится к середине куска, у каждого куска своя плотность, волнистые свили и
  // пузырьки; свинец — выпуклый, с бликом по гребню.
  Tex.addGen('stained', function (f, R, n, n2, n3) {
    const lead = fc(f, 0), leadHi = lift(lead, 0.42);
    const G = [1, 2, 3, 4].map((i) => fc(f, i));
    const RED = 0, BLUE = 1, YEL = 2, GRN = 3;
    const roses = [[132 + (R() - 0.5) * 8, 96, 100], [388 + (R() - 0.5) * 8, 96, 100]];
    const cs = 21, gw = Math.ceil(W / cs) + 4, gh = Math.ceil(H / cs) + 4;
    const VX = new Float32Array(gw * gh), VY = new Float32Array(gw * gh), VC = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const k = j * gw + i, r = R();
        VX[k] = (i - 2 + 0.1 + 0.8 * R()) * cs; VY[k] = (j - 2 + 0.1 + 0.8 * R()) * cs;
        VC[k] = r < 0.42 ? BLUE : r < 0.72 ? RED : r < 0.86 ? YEL : GRN;   // как в готике: больше синего и красного
      }
    }
    let gi = 0, pid = 0, sd = 0, lw = 1;
    // учёт ближайшей свинцовой жилки: d — расстояние до её оси, hw — полуширина
    function feat(d, hw) { const s = d - hw; if (s < sd) { sd = s; lw = hw; } }
    const spoke = (r, fu, D) => r * Math.sin(Math.min(fu, 1 - fu) * D);
    function rose(dx, dy, Rr, ri) {
      const r = Math.sqrt(dx * dx + dy * dy) + 1e-6, rho = r / Rr, th = Math.atan2(dy, dx);
      const id = ri * 1000;
      if (rho > 0.965) { gi = -1; pid = 0; feat(Math.abs(rho - 1.005) * Rr, 0.04 * Rr); return; }
      if (rho < 0.14) {                                   // ступица
        feat((0.14 - rho) * Rr, 1.1);
        feat(Math.abs(rho - 0.062) * Rr, 0.8);
        if (rho < 0.062) { gi = YEL; pid = id + 1; return; }
        const u = th / (TAU / 8) + 8.5, seg = Math.floor(u) % 8, fu = u - Math.floor(u);
        feat(spoke(r, fu, TAU / 8), 0.7);
        gi = seg & 1 ? GRN : RED; pid = id + 10 + seg; return;
      }
      if (rho < 0.47) {                                   // 8 стрельчатых лепестков
        const N = 8, D = TAU / N, u = th / D + N + 0.5, seg = Math.floor(u) % N, fu = u - Math.floor(u);
        const phi = (fu - 0.5) * D, uu = Math.min(1, Math.abs(phi) / (D / 2));
        feat((rho - 0.14) * Rr, 1.3);
        feat((0.47 - rho) * Rr, 1.8);
        feat(spoke(r, fu, D), 1.1);
        const ra = 0.355 + 0.085 * Math.pow(1 - uu, 0.65);
        const dra = 0.085 * 0.65 * Math.min(3, Math.pow(Math.max(1e-3, 1 - uu), -0.35)) / (D / 2);
        const g = rho - ra;
        feat(Math.abs(g) / Math.sqrt(1 / (Rr * Rr) + dra * dra / (r * r)), 1.05);
        if (g < 0) {
          const lx = r * Math.cos(phi) - 0.275 * Rr, ly = r * Math.sin(phi), dc = Math.sqrt(lx * lx + ly * ly), rc = 0.06 * Rr;
          feat(Math.abs(dc - rc), 0.85);
          if (dc < rc) { gi = YEL; pid = id + 40 + seg; } else { gi = BLUE; pid = id + 60 + seg; }
        } else { gi = RED; pid = id + 80 + seg; }
        return;
      }
      if (rho < 0.84) {                                   // 16 круглых окон на красном
        const N = 16, D = TAU / N, u = th / D + N + 0.5, seg = Math.floor(u) % N, fu = u - Math.floor(u);
        const phi = (fu - 0.5) * D;
        feat((rho - 0.47) * Rr, 1.8);
        feat((0.84 - rho) * Rr, 1.6);
        feat(spoke(r, fu, D), 1.0);
        const lx = r * Math.cos(phi) - 0.655 * Rr, ly = r * Math.sin(phi), dc = Math.sqrt(lx * lx + ly * ly);
        const rc = 0.1 * Rr;
        feat(Math.abs(dc - rc), 0.95);
        if (dc < rc) { gi = seg & 1 ? GRN : YEL; pid = id + 150 + seg; } else { gi = RED; pid = id + 180 + seg; }
        return;
      }
      const N = 32, D = TAU / N, u = th / D + N, seg = Math.floor(u) % N, fu = u - Math.floor(u);   // 32 дольки
      feat((rho - 0.84) * Rr, 1.6);
      feat((0.965 - rho) * Rr, 1.4);
      feat(spoke(r, fu, D), 0.95);
      gi = BLUE; pid = id + 300 + seg;
    }
    function mosaic(x, y) {
      const i0 = Math.floor(x / cs) + 2, j0 = Math.floor(y / cs) + 2;
      let d1 = 1e9, d2 = 1e9, k1 = 0, k2 = 0;
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        for (let i = i0 - 1; i <= i0 + 1; i++) {
          const k = j * gw + i, dx = VX[k] - x, dy = VY[k] - y, d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; k2 = k1; d1 = d; k1 = k; } else if (d < d2) { d2 = d; k2 = k; }
        }
      }
      const sx = VX[k2] - VX[k1], sy = VY[k2] - VY[k1];
      feat((d2 - d1) / (2 * Math.sqrt(sx * sx + sy * sy) + 1e-6), 1.1);
      gi = VC[k1]; pid = 5000 + k1;
    }
    return shader(1, (x, y, o) => {
      let best = 0, br = 1e9;
      for (let i = 0; i < roses.length; i++) {
        const q = roses[i], dx = x - q[0], dy = y - q[1], r2 = (dx * dx + dy * dy) / (q[2] * q[2]);
        if (r2 < br) { br = r2; best = i; }
      }
      const q = roses[best];
      sd = 1e9; lw = 1;
      if (br < 1.045 * 1.045) rose(x - q[0], y - q[1], q[2], best);
      else { mosaic(x, y); feat(Math.abs(Math.sqrt(br) - 1.005) * q[2], 0.04 * q[2]); }
      const la = 1 - smooth(-0.35, 0.35, sd);             // доля свинца со сглаженной кромкой
      let cr = 0, cg = 0, cb = 0;
      if (la < 1 && gi >= 0) {
        const g = G[gi];
        const v = 0.84 + 0.3 * hash(pid, 7, 3);                             // плотность куска
        const lt = 0.58 + 0.52 * smooth(0, 6.5, sd);                        // свет к середине куска
        const st = 1 + 0.1 * n2(x * 0.05 + 0.5 * n3(x * 0.02, y * 0.03), y * 0.16);   // свили
        const ill = (0.88 + 0.24 * fbm(n, x * 0.006, y * 0.01, 2)) * (1 + 0.16 * Math.exp(-br * 2.5));
        const k = v * lt * st * ill;
        cr = g[0] * k; cg = g[1] * k; cb = g[2] * k;
        if (hash(Math.floor(x * 0.7), Math.floor(y * 0.7), pid) > 0.994) { cr += 80; cg += 80; cb += 80; }   // пузырёк
      }
      const prof = clamp01(-sd / lw), lk = Math.pow(prof, 1.5) * 0.85;
      const lr = lead[0] + (leadHi[0] - lead[0]) * lk, lg = lead[1] + (leadHi[1] - lead[1]) * lk, lb = lead[2] + (leadHi[2] - lead[2]) * lk;
      o[0] = cr + (lr - cr) * la; o[1] = cg + (lg - cg) * la; o[2] = cb + (lb - cb) * la;
    });
  });
})();
