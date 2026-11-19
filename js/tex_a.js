'use strict';

// Узоры раскрасок, набор A.
// Генераторы регистрируются через Tex.addGen(kind, fn); fn(f, R, n, n2, n3) → canvas Tex.W*S × Tex.H*S.
// Помощники: Tex.lib (pixels, vec, pal, mix, rgb, shade, fbm, perlin, rng, smooth, clamp01, blob, mk, full, grain, W, H, S).
// Узоры: web, lightning, wood, mesh, halftone, graffiti, blueprint, topo
// Все узоры детерминированы (только R и шумы n, n2, n3) и рисуются целиком на всё поле 512×192 — без плиток и швов.
(function () {
  const L = Tex.lib;
  const W = L.W, H = L.H, S = L.S, TAU = Math.PI * 2;
  const rgb = L.rgb, mix = L.mix, fbm = L.fbm, clamp01 = L.clamp01, smooth = L.smooth;

  // ---------- Общие помощники ----------
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const css = (c, a) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a) + ')';
  // k > 0 — светлее (к белому), k < 0 — темнее (к чёрному)
  const tone = (c, k) => (k >= 0 ? mix(c, [255, 255, 255], k) : mix(c, [0, 0, 0], -k));
  const chroma = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

  // Палитра из rgb-массивов (L.pal принимает только hex)
  function ramp(cols) {
    const m = cols.length - 1;
    return function (t) {
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const f = t * m, i = f >= m ? m - 1 : Math.floor(f), u = f - i, a = cols[i], b = cols[i + 1];
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    };
  }

  // Пустой слой во всё поле; ctx уже масштабирован под единицы поля
  function layer() {
    const c = L.full(), ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return { c: c, ctx: ctx };
  }

  // Попиксельная отрисовка в полном разрешении; fn(x, y, out) пишет цвет в out (без лишних массивов)
  function raster(fn) {
    const c = L.full(), w = c.width, h = c.height, ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h), d = img.data, out = [0, 0, 0];
    let o = 0;
    for (let j = 0; j < h; j++) {
      const y = (j + 0.5) / S;
      for (let i = 0; i < w; i++) {
        fn((i + 0.5) / S, y, out);
        d[o] = out[0]; d[o + 1] = out[1]; d[o + 2] = out[2]; d[o + 3] = 255;
        o += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // Скалярное поле на сетке с шагом step (в единицах поля) и билинейной выборкой; знает свои min/max
  function field(step, fn) {
    const gw = Math.ceil(W / step) + 3, gh = Math.ceil(H / step) + 3, a = new Float32Array(gw * gh);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const v = fn((i - 1) * step, (j - 1) * step);
        a[j * gw + i] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const get = function (x, y) {
      let fx = x / step + 1, fy = y / step + 1;
      if (fx < 0) fx = 0; else if (fx > gw - 1.001) fx = gw - 1.001;
      if (fy < 0) fy = 0; else if (fy > gh - 1.001) fy = gh - 1.001;
      const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, o = j * gw + i;
      const a0 = a[o] + (a[o + 1] - a[o]) * u, a1 = a[o + gw] + (a[o + gw + 1] - a[o + gw]) * u;
      return a0 + (a1 - a0) * v;
    };
    get.lo = lo; get.hi = hi; get.data = a; get.gw = gw; get.gh = gh; get.step = step;
    return get;
  }

  // Мягкое размытие слоя: уменьшение и обратное увеличение (дёшево и одинаково во всех браузерах)
  function soften(src, k) {
    const sw = Math.max(2, Math.round(src.width / k)), sh = Math.max(2, Math.round(src.height / k));
    const a = L.mk(sw, sh), actx = a.getContext('2d');
    actx.imageSmoothingEnabled = true; actx.imageSmoothingQuality = 'high';
    actx.drawImage(src, 0, 0, sw, sh);
    const out = L.mk(src.width, src.height), octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
    octx.drawImage(a, 0, 0, out.width, out.height);
    return out;
  }

  // id раскраски по её записи (у одного узора бывают разные макеты для разных раскрасок)
  function idOf(f) {
    if (typeof FINISHES !== 'undefined') for (const k in FINISHES) if (FINISHES[k] === f) return k;
    return '';
  }

  // Ломаная многоугольника
  function poly(ctx, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) { if (i) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]); }
    ctx.closePath();
  }

  // ===================================================================================
  // Паутина (web): одна крупная асимметричная сеть (ступица над клинком / ствольной коробкой) и соседняя
  // порванная сеть слева, у них общая рамочная нить. Радиусы кончаются ровно на рамке, рамка уходит за край
  // поля — свободно висящих прямых нет; у разрывов — провисшие обрывки с каплей. Тёплая версия: лак цвета
  // бычьей крови, нити от золота у ступицы к гранату по краям, бусины золотой росы и паук; холодная —
  // ледяные нити со свечением, иней по нитям и крупные бусины льда.
  // ===================================================================================
  // Ближайшее пересечение луча с многоугольником
  function rayHit(ox, oy, dx, dy, pts) {
    let best = 1e4;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a[0] - ox) * ey - (a[1] - oy) * ex) / den, u = ((a[0] - ox) * dy - (a[1] - oy) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best;
  }
  // Сеть: ступица (hx, hy), рамка frame, m радиусов, шаг спирали sp, разрыв tear { a, w, r0, r1 }
  function buildWeb(R, hx, hy, frame, m, sp, tear) {
    const a0 = R() * TAU, ang = [], len = [];
    for (let i = 0; i < m; i++) {
      const a = a0 + (i + (R() - 0.5) * 0.4) * TAU / m;
      ang.push(a); len.push(rayHit(hx, hy, Math.cos(a), Math.sin(a), frame));
    }
    const hub = 2.4 + sp * 0.3, r0 = hub + sp * 1.3;
    const angD = (a) => Math.abs(Math.atan2(Math.sin(a - tear.a), Math.cos(a - tear.a)));
    const spokes = [], seg = [], ends = [];
    for (let i = 0; i < m; i++) {
      const ca = Math.cos(ang[i]), sa = Math.sin(ang[i]);
      if (angD(ang[i]) < tear.w * 0.8) {
        // порванный радиус: два обрывка, концы повисают
        const c0 = tear.r0 + R() * 16, c1 = tear.r1 - R() * 16;
        spokes.push([hub, c0, ca, sa]); ends.push([hx + ca * c0, hy + sa * c0]);
        if (c1 < len[i] - 4) { spokes.push([c1, len[i], ca, sa]); ends.push([hx + ca * c1, hy + sa * c1]); }
      } else spokes.push([hub, len[i], ca, sa]);
    }
    // ловчая спираль: витки между соседними радиусами, провисают к центру; у рамки и в разрыве обрываются
    const turns = Math.ceil(Math.max.apply(null, len) / sp) + 1;
    for (let k = 0; k < turns * m; k++) {
      const i = k % m, i1 = (i + 1) % m, ra = r0 + k / m * sp, rb = r0 + (k + 1) / m * sp;
      if (ra > len[i] * 0.93 - sp || rb > len[i1] * 0.93 - sp) continue;
      let a2 = ang[i1];
      if (a2 <= ang[i]) a2 += TAU;
      const rm = (ra + rb) / 2;
      if (angD((ang[i] + a2) / 2) < tear.w && rm > tear.r0 && rm < tear.r1) continue;
      const x1 = hx + Math.cos(ang[i]) * ra, y1 = hy + Math.sin(ang[i]) * ra, x2 = hx + Math.cos(a2) * rb, y2 = hy + Math.sin(a2) * rb;
      if (Math.max(x1, x2) < -6 || Math.min(x1, x2) > W + 6 || Math.max(y1, y2) < -6 || Math.min(y1, y2) > H + 6) continue;
      if (R() < 0.018) { ends.push([x1, y1]); continue; }                       // редкая лопнувшая петля
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dc = Math.hypot(mx - hx, my - hy) || 1;
      const bow = Math.hypot(x2 - x1, y2 - y1) * (0.2 + R() * 0.12);
      seg.push([x1, y1, mx - (mx - hx) / dc * bow, my - (my - hy) / dc * bow, x2, y2, rm]);
    }
    return { hx: hx, hy: hy, hub: hub, spokes: spokes, seg: seg, ends: ends, frame: frame };
  }
  // Точка и касательная квадратичной кривой отрезка спирали
  function qAt(s, t) {
    const u = 1 - t;
    return [u * u * s[0] + 2 * u * t * s[2] + t * t * s[4], u * u * s[1] + 2 * u * t * s[3] + t * t * s[5],
      2 * u * (s[2] - s[0]) + 2 * t * (s[4] - s[2]), 2 * u * (s[3] - s[1]) + 2 * t * (s[5] - s[3])];
  }

  Tex.addGen('web', function (f, R, n, n2) {
    const base = rgb(f.c[0]), ca = rgb(f.c[1]), cb = rgb(f.c[2]);
    const core = lum(ca) >= lum(cb) ? ca : cb, glow = core === ca ? cb : ca;
    const icy = core[2] > core[0] + 20;
    let c;
    if (icy) {
      const deep = tone(base, -0.6), lift = mix(base, glow, 0.32);
      c = L.pixels(0.5, (x, y) => {
        const v = fbm(n, x * 0.0055, y * 0.01, 4), w = fbm(n2, x * 0.02, y * 0.034, 3);
        const t = clamp01(0.5 + v * 1.3 + w * 0.3);
        return mix(mix(deep, base, smooth(0.05, 0.6, t)), lift, smooth(0.62, 1.05, t) * 0.75);
      });
    } else {
      // лак цвета бычьей крови: тёмные заливы и тёплые натёки
      const deep = [15, 3, 6], mid = mix(base, glow, 0.2), sheen = mix(base, glow, 0.42);
      c = L.pixels(0.5, (x, y) => {
        const v = fbm(n, x * 0.005, y * 0.011, 4), w = fbm(n2, x * 0.014, y * 0.05, 2);
        const t = clamp01(0.5 + v * 1.4 + w * 0.25);
        return mix(mix(deep, mid, smooth(0.08, 0.62, t)), sheen, smooth(0.7, 1.02, t) * 0.55);
      });
    }
    const ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // две сети с общей рамочной нитью TL–Lm–BL; все вершины рамок, кроме Lm, за краем поля
    const TL = [176 + R() * 24, -28], Lm = [156 + R() * 18, 84 + R() * 26], BL = [198 + R() * 30, H + 30];
    const frameA = [TL, [W + 36, -24 + R() * 20], [W + 30, 112 + R() * 40], [420 + R() * 50, H + 38], BL, Lm];
    const frameB = [[-34, -26], TL, Lm, BL, [-30, H + 34]];
    const A = buildWeb(R, 322 + R() * 40, 60 + R() * 20, frameA, 26 + Math.floor(R() * 4), 7.2 + R() * 0.8,
      { a: -1.9 + (R() - 0.5) * 0.5, w: 0.34, r0: 34 + R() * 10, r1: 130 });
    const B = buildWeb(R, 76 + R() * 22, 104 + R() * 18, frameB, 17 + Math.floor(R() * 3), 6.4 + R() * 0.6,
      { a: -0.6 + (R() - 0.5) * 0.4, w: 0.42, r0: 30 + R() * 8, r1: 96 });
    // цвет нити по удалению от ступицы
    const NB = 7;
    const ramp3 = icy ? ramp([tone(core, 0.3), core, mix(core, glow, 0.5)]) : ramp([[255, 204, 110], [255, 112, 54], [205, 32, 54]]);
    const webPaths = (wb, scale) => {
      const band = (r) => Math.max(0, Math.min(NB - 1, Math.floor(r / scale * NB)));
      const sp = [], sg = [], all = new Path2D();
      for (let b = 0; b < NB; b++) { sp.push(new Path2D()); sg.push(new Path2D()); }
      wb.spokes.forEach((s) => {
        let r = s[0];
        while (r < s[1] - 0.01) {
          const b = band(r + 0.01), rr = b === NB - 1 ? s[1] : Math.min(s[1], Math.max(r + 0.5, (b + 1) * scale / NB));
          sp[b].moveTo(wb.hx + s[2] * r, wb.hy + s[3] * r); sp[b].lineTo(wb.hx + s[2] * rr, wb.hy + s[3] * rr);
          r = rr;
        }
      });
      wb.seg.forEach((s) => { const b = band(s[6]); sg[b].moveTo(s[0], s[1]); sg[b].quadraticCurveTo(s[2], s[3], s[4], s[5]); });
      const fr = new Path2D();
      wb.frame.forEach((q, i) => { if (i) fr.lineTo(q[0], q[1]); else fr.moveTo(q[0], q[1]); });
      fr.closePath();
      for (let b = 0; b < NB; b++) { all.addPath(sp[b]); all.addPath(sg[b]); }
      all.addPath(fr);
      return { sp: sp, sg: sg, fr: fr, all: all };
    };
    const PA = webPaths(A, 200), PB = webPaths(B, 120);
    // обрывки у разрывов: провисают под собственным весом
    const hang = new Path2D(), tips = [];
    [A, B].forEach((wb) => wb.ends.forEach((e) => {
      const dx = (R() - 0.5) * 16, l = 8 + R() * 16;
      hang.moveTo(e[0], e[1]); hang.bezierCurveTo(e[0] + dx * 0.15, e[1] + l * 0.55, e[0] + dx * 0.9, e[1] + l * 0.75, e[0] + dx, e[1] + l);
      tips.push([e[0] + dx, e[1] + l]);
    }));
    if (!icy) {
      // тёплый отсвет лака у главной ступицы
      const g = ctx.createRadialGradient(A.hx, A.hy, 0, A.hx, A.hy, 120);
      g.addColorStop(0, 'rgba(255,120,60,.14)'); g.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = g; ctx.fillRect(A.hx - 120, A.hy - 120, 240, 240);
      // тень нитей: нити лежат на лаке
      ctx.save(); ctx.translate(0.8, 1.1);
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.7; ctx.stroke(PA.all); ctx.stroke(PB.all); ctx.stroke(hang);
      ctx.restore();
    } else {
      // ледяное свечение: размытый след нитей поверх фона
      const gl = layer();
      gl.ctx.strokeStyle = css(glow); gl.ctx.lineWidth = 2.4; gl.ctx.stroke(PA.all); gl.ctx.lineWidth = 1.7; gl.ctx.stroke(PB.all);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.85; ctx.drawImage(soften(gl.c, 5), 0, 0);
      ctx.restore();
    }
    // рамка, радиусы, спираль: задняя сеть тоньше и темнее
    const strokeWeb = (P, ws, wg, wf, dim) => {
      ctx.strokeStyle = css(mix(ramp3(0.8), base, dim)); ctx.lineWidth = wf; ctx.stroke(P.fr);
      for (let b = 0; b < NB; b++) {
        const cc = css(mix(ramp3((b + 0.5) / NB), base, dim));
        ctx.strokeStyle = cc;
        ctx.lineWidth = ws; ctx.stroke(P.sp[b]);
        ctx.lineWidth = wg; ctx.stroke(P.sg[b]);
      }
    };
    strokeWeb(PB, 1.0, 0.8, 1.8, icy ? 0.3 : 0.22);
    strokeWeb(PA, 1.3, 0.95, 2.1, 0);
    ctx.strokeStyle = css(mix(ramp3(0.6), base, 0.1)); ctx.lineWidth = 0.8; ctx.stroke(hang);
    // светлая сердцевина нитей главной сети (металлический блеск / ледяная нить)
    ctx.save(); ctx.translate(-0.2, -0.3);
    ctx.strokeStyle = icy ? css(tone(core, 0.6), 0.9) : 'rgba(255,236,190,.55)'; ctx.lineWidth = 0.4;
    for (let b = 0; b < NB; b++) { ctx.stroke(PA.sp[b]); ctx.stroke(PA.sg[b]); }
    ctx.restore();
    // плотный клубок в центре каждой сети
    [A, B].forEach((wb) => {
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const r = wb.hub * (0.6 + k * 0.45);
        for (let a = 0; a <= 8; a++) {
          const an = a / 8 * TAU, rr = r * (0.75 + R() * 0.5), x = wb.hx + Math.cos(an) * rr, y = wb.hy + Math.sin(an) * rr;
          if (a) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
      }
      ctx.strokeStyle = css(ramp3(0)); ctx.lineWidth = 0.6; ctx.stroke();
    });
    // иней по нитям (холодная версия): короткие иглы по обе стороны
    if (icy) {
      ctx.beginPath();
      A.seg.forEach((s) => {
        const len = Math.hypot(s[4] - s[0], s[5] - s[1]) + 1;
        for (let t = R() * 0.2; t < 1; t += 2.8 / len) {
          const q = qAt(s, t), tl = Math.hypot(q[2], q[3]) || 1, tx = q[2] / tl, ty = q[3] / tl;
          const k = R() < 0.5 ? 1 : -1, l = 0.8 + R() * 2, sk = (R() - 0.5) * 1.2;
          ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + (-ty * k + tx * sk) * l, q[1] + (tx * k + ty * sk) * l);
        }
      });
      ctx.strokeStyle = css(core, 0.6); ctx.lineWidth = 0.4; ctx.stroke();
    }
    // роса: мелкие бусины нанизаны на витки спирали, крупные капли висят в нижних точках витков
    const bHi = icy ? [255, 255, 255] : [255, 250, 222], bBody = icy ? tone(core, 0.15) : [255, 196, 74], bRim = icy ? tone(glow, -0.4) : [150, 66, 14];
    const shP = new Path2D(), bdP = new Path2D(), hiP = new Path2D();
    const small = (x, y, r) => {
      shP.moveTo(x + r * 1.35, y + r * 0.5); shP.arc(x + r * 0.35, y + r * 0.5, r, 0, TAU);
      bdP.moveTo(x + r, y); bdP.arc(x, y, r, 0, TAU);
      hiP.moveTo(x - r * 0.1, y - r * 0.35); hiP.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, TAU);
    };
    const big = [];
    A.seg.forEach((s) => {
      if (s[6] < 24 || R() > (icy ? 0.1 : 0.2)) return;
      const len = Math.hypot(s[4] - s[0], s[5] - s[1]), step = icy ? 5 : 3.4;
      let i = 0;
      for (let t = 0.1; t < 0.92; t += step / (len + 1), i++) { const q = qAt(s, t); small(q[0], q[1], (icy ? 0.75 : 0.5) + (i % 2) * 0.3 + R() * 0.15); }
    });
    for (let i = 0; i < (icy ? 46 : 34); i++) {
      const wb = R() < 0.78 ? A : B;
      if (!wb.seg.length) continue;
      const s = wb.seg[Math.floor(R() * wb.seg.length)], q = qAt(s, 0.4 + R() * 0.2);
      big.push([q[0], q[1] + 0.6, (icy ? 1.4 : 1.1) + R() * (icy ? 1.4 : 1.1)]);
    }
    tips.forEach((t) => big.push([t[0], t[1] + 1, 1.1 + R() * 0.7]));
    ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fill(shP);
    ctx.fillStyle = css(bBody); ctx.fill(bdP);
    ctx.fillStyle = css(bHi, 0.95); ctx.fill(hiP);
    big.forEach((b) => {
      const x = b[0], y = b[1], r = b[2];
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.5, r, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.06, x, y, r);
      g.addColorStop(0, css(bHi)); g.addColorStop(0.42, css(bBody)); g.addColorStop(1, css(bRim));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    });
    if (icy) {
      // искры-звёздочки льда на крупных бусинах
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 0.35; ctx.beginPath();
      big.forEach((b, i) => {
        if (i % 4) return;
        const l = b[2] * 2.2;
        ctx.moveTo(b[0] - l, b[1] - b[2] * 0.3); ctx.lineTo(b[0] + l, b[1] - b[2] * 0.3);
        ctx.moveTo(b[0] - b[2] * 0.3, b[1] - l); ctx.lineTo(b[0] - b[2] * 0.3, b[1] + l);
      });
      ctx.stroke();
      return c;
    }
    // паук у главной ступицы: тёмный силуэт, золотая метка-песочные часы, блик
    const sx = A.hx + 5, sy = Math.max(18, Math.min(H - 18, A.hy)), sa = R() * TAU, body = [12, 3, 5];
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(sa);
    ctx.strokeStyle = css(body); ctx.lineWidth = 1;
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < 4; k++) {
        const th = 0.45 + k * 0.72, kx = 1.6 + Math.cos(th) * 5.8, ky = side * Math.sin(th) * 5.8;
        ctx.beginPath(); ctx.moveTo(1.6, 0); ctx.lineTo(kx, ky);
        ctx.lineTo(kx + Math.cos(th * 0.9) * 5.8, ky + side * (Math.sin(th * 0.9) * 5.8 + 2.2));
        ctx.stroke();
      }
    }
    ctx.fillStyle = css(body);
    ctx.beginPath(); ctx.ellipse(-4.4, 0, 4.8, 3.8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(1.6, 0, 2.7, 2.3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,90,.5)'; ctx.lineWidth = 0.45;
    ctx.beginPath(); ctx.ellipse(-4.4, 0, 4.8, 3.8, 0, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
    ctx.fillStyle = css(bBody);
    ctx.beginPath(); ctx.moveTo(-6.2, -1.5); ctx.lineTo(-2.6, -1.5); ctx.lineTo(-4.4, 0); ctx.lineTo(-2.6, 1.5); ctx.lineTo(-6.2, 1.5); ctx.lineTo(-4.4, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath(); ctx.ellipse(-5.4, -2, 1.4, 0.6, -0.3, 0, TAU); ctx.fill();
    ctx.restore();
    return c;
  });

  // ===================================================================================
  // Молния (lightning): фрактальные разряды. Цветной фон — грозовые тучи и удары молний;
  // нейтральный (чёрный) фон — выжженные фигуры Лихтенберга с дугами между ними.
  // ===================================================================================
  // Рекурсивное смещение середины — естественная «рваная» ломаная
  // Крупный масштаб — почти прямой путь, мелкий — резкие изломы (как у настоящей молнии)
  function crack(R, x0, y0, x1, y1, disp, minLen, pts) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
    if (d < minLen) { pts.push([x1, y1]); return; }
    const off = (R() - 0.5) * (d > 36 ? disp * 0.62 : disp * 1.45) * d;
    const mx = (x0 + x1) / 2 - dy / d * off, my = (y0 + y1) / 2 + dx / d * off;
    crack(R, x0, y0, mx, my, disp, minLen, pts);
    crack(R, mx, my, x1, y1, disp, minLen, pts);
  }
  // Разряд с ветвями: в list попадают { pts, w }
  function strike(R, x0, y0, x1, y1, w, depth, list) {
    const pts = [[x0, y0]];
    crack(R, x0, y0, x1, y1, 0.5, 2.4, pts);
    list.push({ pts: pts, w: w });
    if (depth <= 0) return;
    const nb = 2 + Math.floor(R() * 3), full = Math.hypot(x1 - x0, y1 - y0);
    for (let k = 0; k < nb; k++) {
      const i = Math.min(pts.length - 4, 1 + Math.floor(R() * pts.length * 0.8));
      if (i < 1) continue;
      const p = pts[i], q = pts[i + 3];
      const da = Math.atan2(q[1] - p[1], q[0] - p[0]) + (R() < 0.5 ? -1 : 1) * (0.3 + R() * 0.7);
      const len = full * (0.16 + R() * 0.3);
      strike(R, p[0], p[1], p[0] + Math.cos(da) * len, p[1] + Math.sin(da) * len, w * 0.55, depth - 1, list);
    }
  }
  // Фигура Лихтенберга: ветвь делится на 2–3 и истончается
  function tree(R, x, y, a, len, w, depth, list) {
    const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
    const pts = [[x, y]];
    crack(R, x, y, x1, y1, 0.55, 1.8, pts);
    list.push({ pts: pts, w: w });
    if (depth <= 0 || w < 0.24) return;
    const nb = R() < 0.3 ? 3 : 2;
    for (let k = 0; k < nb; k++) {
      const da = (k - (nb - 1) / 2) * (0.42 + R() * 0.45) + (R() - 0.5) * 0.35;
      tree(R, x1, y1, a + da, len * (0.66 + R() * 0.22), w * (0.6 + R() * 0.12), depth - 1, list);
    }
  }
  function strokeBolts(ctx, list, style, wk, wmin, minW) {
    ctx.strokeStyle = style;
    list.forEach((b) => {
      if (b.w < (minW || 0)) return;
      ctx.lineWidth = Math.max(wmin, b.w * wk);
      ctx.beginPath();
      ctx.moveTo(b.pts[0][0], b.pts[0][1]);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i][0], b.pts[i][1]);
      ctx.stroke();
    });
  }

  Tex.addGen('lightning', function (f, R, n, n2, n3) {
    const base = rgb(f.c[0]), arc = rgb(f.c[1]), hot = rgb(f.c[2]);
    const storm = chroma(base) > 10;
    const bolts = [];
    let c;
    if (storm) {
      // грозовые тучи: завихрённый шум, подсвеченные края
      const P = ramp([tone(base, -0.5), base, mix(base, arc, 0.3), mix(base, arc, 0.56), mix(arc, hot, 0.42)]);
      const D = field(1.6, (x, y) => {
        const wx = 40 * fbm(n2, x * 0.006, y * 0.012, 2), wy = 18 * fbm(n3, x * 0.006 + 3, y * 0.012, 2);
        return fbm(n, (x + wx) * 0.0075, (y + wy) * 0.015, 5);
      });
      c = L.pixels(0.5, (x, y) => {
        // клубы туч: светлые «шапки» сверху, тёмное брюхо снизу
        const d = D(x, y), lit = D(x, y - 6) - d;
        return P(clamp01(0.44 + d * 1.5 + lit * 2.4 + 0.06 * n3(x * 0.04, y * 0.06)) * 0.96);
      });
      // два «ползущих» разряда вдоль оружия и три удара сверху вниз
      strike(R, -10, 55 + R() * 40, W + 10, 80 + R() * 50, 2.5, 3, bolts);
      strike(R, W + 10, 30 + R() * 30, -10, 120 + R() * 50, 1.9, 3, bolts);
      for (let i = 0; i < 3; i++) {
        const x = 30 + i * 170 + R() * 110;
        strike(R, x, -8, x + (R() - 0.5) * 200, H + 8, 1.3 + R() * 0.6, 2, bolts);
      }
    } else {
      // тёмный металл с продольной шлифовкой и копотью
      c = L.pixels(0.5, (x, y) => {
        const v = fbm(n, x * 0.008, y * 0.016, 4), s = n2(x * 0.004, y * 0.32);
        const k = 1 + 0.9 * v + 0.35 * s;
        return [base[0] * k + 6, base[1] * k + 6, base[2] * k + 6];
      });
      // фигуры Лихтенберга растут от краёв поля и снизу
      tree(R, -4, 70 + R() * 50, (R() - 0.5) * 0.4, 44, 2.6, 8, bolts);
      tree(R, W + 4, 60 + R() * 60, Math.PI + (R() - 0.5) * 0.4, 44, 2.6, 8, bolts);
      tree(R, 170 + R() * 60, H + 4, -Math.PI / 2 + (R() - 0.5) * 0.5, 36, 2.2, 7, bolts);
      tree(R, 330 + R() * 60, -4, Math.PI / 2 + (R() - 0.5) * 0.5, 34, 2.1, 7, bolts);
      tree(R, 20 + R() * 40, -4, 1.1 + R() * 0.3, 26, 1.6, 6, bolts);
      tree(R, W - 30 - R() * 40, H + 4, -2.0 - R() * 0.3, 26, 1.6, 6, bolts);
      // дуги между фигурами
      strike(R, 110, 80 + R() * 30, 400, 85 + R() * 30, 1.5, 1, bolts);
    }
    const ctx = c.getContext('2d');
    if (storm) {
      // косой дождь — едва заметные штрихи
      ctx.save(); ctx.scale(S, S);
      ctx.strokeStyle = css(hot, 0.09); ctx.lineWidth = 0.45; ctx.beginPath();
      for (let i = 0; i < 320; i++) { const x = R() * (W + 40) - 20, y = R() * H, l = 5 + R() * 10; ctx.moveTo(x, y); ctx.lineTo(x - l * 0.28, y + l); }
      ctx.stroke();
      ctx.restore();
    } else {
      // копоть: ветви будто выжжены в поверхности
      const s = layer();
      strokeBolts(s.ctx, bolts, '#000', 3.2, 1.2);
      ctx.globalAlpha = 0.7; ctx.drawImage(soften(s.c, 4), 0, 0); ctx.globalAlpha = 1;
    }
    // ореол: размытый след только крупных ветвей подсвечивает фон (мелкие не заливают всё светом)
    const g = layer();
    strokeBolts(g.ctx, bolts, css(arc), 3.2, 0.8, storm ? 0.5 : 0.9);
    const far = soften(soften(g.c, 6), 3), near = soften(g.c, 3);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = storm ? 0.75 : 0.5; ctx.drawImage(far, 0, 0);
    ctx.globalAlpha = storm ? 0.4 : 0.3; ctx.drawImage(near, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.scale(S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // тело разряда, раскалённая сердцевина, белая нить в самых толстых
    ctx.shadowColor = css(arc); ctx.shadowBlur = 2.5 * S;
    strokeBolts(ctx, bolts, css(arc, 0.95), 1.05, 0.3);
    ctx.shadowBlur = 0;
    strokeBolts(ctx, bolts, css(hot), 0.55, 0.22, 0.3);
    strokeBolts(ctx, bolts, 'rgba(255,255,255,.95)', 0.22, 0.25, 0.9);
    // искры у концов ветвей
    ctx.fillStyle = css(hot);
    bolts.forEach((b) => {
      if (b.w > 0.6 || R() > 0.35) return;
      const p = b.pts[b.pts.length - 1];
      ctx.globalAlpha = 0.5 + R() * 0.5;
      ctx.beginPath(); ctx.arc(p[0] + (R() - 0.5) * 4, p[1] + (R() - 0.5) * 4, 0.35 + R() * 0.6, 0, TAU); ctx.fill();
    });
    ctx.restore();
    return c;
  });

  // ===================================================================================
  // Дерево (wood). 3 цвета — лакированная доска: годичные кольца среза бревна («соборы»),
  // поры по волокну, сучки. 4 цвета — клеёный шпон (ламинат ложи): рельеф режет стопку цветных слоёв.
  // ===================================================================================
  function plank(R, n, n2, n3, col) {
    const mid = col[0], light = col[1], dark = col[2];
    const early = mix(light, mid, 0.14), late = mix(mid, dark, 0.86), pore = tone(dark, -0.4);
    const yc = 70 + R() * 50, ringW = 5.4 + R() * 1.4;
    const knots = [];
    for (let i = 0; i < 2; i++) knots.push([70 + R() * 380, 25 + R() * 140, 4 + R() * 3.5]);
    // медленные составляющие считаются на грубой сетке — так в 2–3 раза быстрее при том же виде
    const warp = field(3, (x, y) => 26 * fbm(n, x * 0.0028, y * 0.005 + 1.7, 3));
    const depth = field(3, (x) => 30 + 34 * (0.5 + fbm(n3, x * 0.003 + 3.3, 0.5, 3)));
    const tintF = field(3, (x, y) => clamp01(0.5 + 1.2 * fbm(n, x * 0.0016 + 7, y * 0.004, 2)));
    const curl = field(3, (x, y) => 7 * fbm(n3, x * 0.004, y * 0.012, 2));
    const fine = field(1.5, (x, y) => 2.4 * fbm(n2, x * 0.008, y * 0.03, 2));
    return raster((x, y, out) => {
      let dy = y - yc + warp(x, y) + 0.8 * n2(x * 0.018, y * 0.09);
      let kd = 9;
      for (let k = 0; k < knots.length; k++) {
        const K = knots[k], ex = (x - K[0]) * 0.42, ey = y - K[1], d2 = ex * ex + ey * ey, s2 = K[2] * K[2];
        dy += (ey >= 0 ? 1 : -1) * s2 * 5 / (d2 + s2 * 1.4);          // кольца огибают сучок
        kd = Math.min(kd, Math.sqrt(d2) / K[2]);
      }
      const z = depth(x, 0);                                             // глубина среза меняется вдоль доски
      const r = Math.sqrt(dy * dy + z * z) + fine(x, y);
      const t = r / ringW, fr = t - Math.floor(t);
      const lt = smooth(0.42, 0.9, fr) * (1 - smooth(0.9, 0.995, fr));  // поздняя древесина — тёмная полоса кольца
      let c = mix(early, light, tintF(x, y) * 0.55);
      c = mix(c, late, lt * 0.85);
      const p = n2(x * 0.07, r * 1.25);                                  // поры вытянуты вдоль колец
      c = mix(c, pore, smooth(0.16, 0.42, p) * (0.4 + 0.35 * lt));
      if (kd < 1.15) {                                                   // сучок: свои кольца внутри и тёмная кайма
        const inner = 1 - smooth(0.82, 0.95, kd), rim = smooth(0.72, 0.92, kd) * (1 - smooth(0.98, 1.15, kd));
        const kr = 0.5 + 0.5 * Math.sin(kd * 19);
        c = mix(c, mix(mix(mid, late, 0.45), late, kr), inner * 0.9);
        c = mix(c, pore, rim * 0.85);
      }
      // волокна и «переливы» лака поперёк волокон (свилеватость)
      const fib = 1 + 0.07 * n3(x * 0.22, r * 3.1) + 0.07 * Math.sin(x * 0.13 + curl(x, y));
      out[0] = c[0] * fib * 1.08; out[1] = c[1] * fib * 1.01; out[2] = c[2] * fib * 0.88;
    });
  }

  function laminate(R, n, n2, n3, col) {
    // последовательность слоёв: цвета по кругу, изредка сдвоенные, у каждого слоя своя толщина и оттенок
    const order = [1, 2, 0, 3];
    const NL = 160, B = [0], cols = [];
    let k = Math.floor(R() * 4);
    for (let i = 0; i < NL; i++) {
      if (R() > 0.18) k++;
      cols.push(tone(col[order[k % 4]], (R() - 0.5) * 0.18));
      B.push(B[i] + 0.65 + R() * 0.7);
    }
    const glue = tone(col[3], -0.45);
    const hf = field(1.25, (x, y) => y * 0.0062 + 0.62 * fbm(n, x * 0.0045, y * 0.0085, 4) + 0.12 * fbm(n2, x * 0.016, y * 0.03, 2));
    const K = 30, t0 = hf.lo * K - 2, e = 0.6;
    return raster((x, y, out) => {
      const h = hf(x, y);
      const gx = (hf(x + e, y) - hf(x - e, y)) / (2 * e), gy = (hf(x, y + e) - hf(x, y - e)) / (2 * e);
      const t = h * K - t0;
      let i = Math.max(0, Math.min(NL - 1, Math.floor(t)));       // примерный слой, затем уточнение по границам
      while (i > 0 && t < B[i]) i--;
      while (i < NL - 1 && t >= B[i + 1]) i++;
      const c = cols[i];
      // рельеф: свет сверху-слева, слои как ступени
      const fr = (t - B[i]) / (B[i + 1] - B[i]);
      const sh = 1 + (-gx * 0.7 - gy * 0.9) * 9 + (fr - 0.5) * 0.08;
      // волокна шпона
      const fib = 1 + 0.12 * n3(x * 0.05, t * 6.5) + 0.06 * n2(x * 0.16, t * 14);
      // клеевой шов: тёмная линия постоянной ширины в пикселях
      const gpx = Math.hypot(gx, gy) * K / S + 1e-6;
      const dpx = Math.min(t - B[i], B[i + 1] - t) / gpx;
      const gl = (1 - smooth(0.25, 1.05, dpx)) * 0.75;
      const m = sh * fib;
      out[0] = (c[0] * m) * (1 - gl) + glue[0] * gl;
      out[1] = (c[1] * m) * (1 - gl) + glue[1] * gl;
      out[2] = (c[2] * m) * (1 - gl) + glue[2] * gl;
    });
  }

  Tex.addGen('wood', function (f, R, n, n2, n3) {
    const col = f.c.map(rgb);
    return col.length >= 4 ? laminate(R, n, n2, n3, col) : plank(R, n, n2, n3, col);
  });

  // ===================================================================================
  // Маскировочная сеть (mesh): тёмная глубина под сетью, ромбическая сеть из витого шнура с узлами
  // и густая «листва» — лоскуты-листья с зубчатым краем в два слоя (под сетью и поверх) с тенями.
  // ===================================================================================
  // Лоскут-лист: вытянутый, с зубчатыми краями и сгибом по центру; точки контура
  function leafPts(R, x, y, s, a, wk) {
    const pts = [], k = 10, ca = Math.cos(a), sa = Math.sin(a);
    const put = (u, v) => pts.push([x + u * ca - v * sa, y + u * sa + v * ca]);
    for (let i = 0; i <= k; i++) { const t = i / k; put(t * s, Math.sin(Math.PI * Math.pow(t, 0.75)) * s * wk * (0.75 + (i % 2) * 0.35 + R() * 0.12)); }
    for (let i = k - 1; i >= 1; i--) { const t = i / k; put(t * s, -Math.sin(Math.PI * Math.pow(t, 0.75)) * s * wk * (0.75 + (i % 2) * 0.35 + R() * 0.12)); }
    return { pts: pts, k: k, x: x, y: y, tx: x + ca * s, ty: y + sa * s };
  }

  Tex.addGen('mesh', function (f, R, n, n2, n3) {
    const c0 = rgb(f.c[0]), c1 = rgb(f.c[1]), c2 = rgb(f.c[2]);
    // глубина под сетью: тёмная, с мягкими пятнами
    const deep = tone(c1, -0.5), dim = mix(c1, c0, 0.35);
    const c = L.pixels(0.5, (x, y) => mix(deep, dim, smooth(-0.25, 0.3, fbm(n, x * 0.01, y * 0.018, 3))));
    const ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // слой листвы рисуется отдельно и кладётся одним проходом тени
    const foliage = (count, cols, smin, smax) => {
      const lay = layer(), lc = lay.ctx;
      for (let i = 0; i < count; i++) {
        const lf = leafPts(R, R() * (W + 40) - 20, R() * (H + 40) - 20, smin + R() * (smax - smin), R() * TAU, 0.28 + R() * 0.1);
        const col = cols[Math.floor(R() * cols.length)];
        lc.fillStyle = css(col); poly(lc, lf.pts); lc.fill();
        lc.strokeStyle = 'rgba(0,0,0,.32)'; lc.lineWidth = 0.45; lc.stroke();
        lc.fillStyle = css(tone(col, 0.16), 0.6); poly(lc, lf.pts.slice(0, lf.k + 1)); lc.fill();   // светлая половинка (сгиб)
        lc.strokeStyle = css(tone(col, -0.38), 0.85); lc.lineWidth = 0.55;
        lc.beginPath(); lc.moveTo(lf.x, lf.y); lc.lineTo(lf.tx, lf.ty); lc.stroke();
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.shadowColor = 'rgba(0,0,0,.62)'; ctx.shadowBlur = 3.5 * S; ctx.shadowOffsetX = 1.4 * S; ctx.shadowOffsetY = 2.4 * S;
      ctx.drawImage(lay.c, 0, 0);
      ctx.restore();
    };
    foliage(170, [tone(c1, -0.12), c1, mix(c1, c0, 0.5), c0], 14, 28);
    // узлы: ромбическая решётка, плавно изогнутая шумом (сеть провисает)
    const sp = 16, a = 0.6, ux = Math.cos(a) * sp, uy = Math.sin(a) * sp, ox = R() * sp, oy = R() * sp;
    const knots = new Map(), key = (i, j) => (i + 200) * 1000 + j + 200;
    for (let i = -14; i <= 46; i++) {
      for (let j = -30; j <= 34; j++) {
        const x = ox + (i + j) * ux, y = oy + (i - j) * uy;
        if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
        const dx = 6 * fbm(n2, x * 0.011, y * 0.011, 2), dy = 6 * fbm(n3, x * 0.011 + 3.7, y * 0.011, 2);
        knots.set(key(i, j), [x + dx, y + dy + 2]);
      }
    }
    const cords = new Path2D(), kn = new Path2D(), knHi = new Path2D();
    knots.forEach((p, kk) => {
      const i = Math.floor(kk / 1000) - 200, j = kk % 1000 - 200;
      [[i + 1, j], [i, j + 1]].forEach((q) => {
        const o = knots.get(key(q[0], q[1]));
        if (!o) return;
        const mx = (p[0] + o[0]) / 2, my = (p[1] + o[1]) / 2, l = Math.hypot(o[0] - p[0], o[1] - p[1]) || 1;
        const w = (R() - 0.5) * 2;
        cords.moveTo(p[0], p[1]);
        cords.quadraticCurveTo(mx - (o[1] - p[1]) / l * w, my + (o[0] - p[0]) / l * w + 1.2, o[0], o[1]);
      });
      kn.moveTo(p[0] + 2.1, p[1]); kn.arc(p[0], p[1], 2.1, 0, TAU);
      knHi.moveTo(p[0] + 0.7, p[1] - 0.5); knHi.arc(p[0] - 0.4, p[1] - 0.5, 1.1, 0, TAU);
    });
    // шнур: тень, тёмное тело, светлый шнур, витки, блик
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 2.2 * S; ctx.shadowOffsetX = 1.3 * S; ctx.shadowOffsetY = 2.2 * S;
    ctx.strokeStyle = css(tone(c1, -0.4)); ctx.lineWidth = 2.7; ctx.stroke(cords);
    ctx.restore();
    ctx.strokeStyle = css(tone(mix(c2, c0, 0.2), 0.04)); ctx.lineWidth = 1.8; ctx.stroke(cords);
    ctx.save();
    ctx.setLineDash([0.8, 1.3]); ctx.strokeStyle = css(tone(c1, -0.1), 0.5); ctx.lineWidth = 1.8; ctx.stroke(cords);
    ctx.restore();
    ctx.save();
    ctx.translate(-0.3, -0.45); ctx.strokeStyle = css(tone(c2, 0.35), 0.55); ctx.lineWidth = 0.5; ctx.stroke(cords);
    ctx.restore();
    ctx.fillStyle = css(tone(c1, -0.25)); ctx.fill(kn);
    ctx.fillStyle = css(mix(c2, c0, 0.15), 0.9); ctx.fill(knHi);
    // верхний слой листвы — светлее и крупнее
    foliage(190, [c0, tone(c0, 0.1), mix(c0, c2, 0.5), c2, tone(c2, 0.15), mix(c1, c0, 0.4)], 15, 32);
    return c;
  });

  // ===================================================================================
  // Комикс / поп-арт (halftone). Палитра «фон, акцент, контур, бумага», но два разных макета:
  //  comic — страница комикса: сетка панелей с белыми полями, линии скорости, взрыв с надписью, большая звезда;
  //  pop   — поп-арт: крупные цветные блоки с толстым контуром, крупные точки Бен-Дэй, мишень, полосы
  //          и одно огромное звукоподражание через середину поля (ствольная коробка и магазин).
  // ===================================================================================
  // Оставляет часть многоугольника, где nx*x + ny*y >= d
  function clipHalf(pts, nx, ny, d) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const sp = p[0] * nx + p[1] * ny - d, sq = q[0] * nx + q[1] * ny - d;
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out;
  }
  function bbox(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    return [Math.max(-4, x0), Math.max(-4, y0), Math.min(W + 4, x1), Math.min(H + 4, y1)];
  }
  // Косая прямая через (xt, 0) и (xb, H) в виде нормали и смещения
  function slant(xt, xb) { const len = Math.hypot(xb - xt, H); return [H / len, -(xb - xt) / len, H * xt / len]; }
  function burstPts(R, x, y, r0, r1, k, rot, sq) {
    const pts = [];
    for (let i = 0; i < k * 2; i++) {
      const a = rot + i / (k * 2) * TAU + (R() - 0.5) * 0.12, r = (i % 2 ? r1 : r0) * (0.8 + R() * 0.38);
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * (sq || 0.8)]);
    }
    return pts;
  }
  function starPts(x, y, r, inner, rot) {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = rot - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * inner : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    return pts;
  }
  // Растр точек под углом ang в прямоугольнике b; радиус rf(x, y)
  function dotScreen(ctx, b, col, ang, step, rf) {
    const ca = Math.cos(ang), sa = Math.sin(ang), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const half = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + step;
    ctx.fillStyle = col; ctx.beginPath();
    for (let v = -half; v <= half; v += step) {
      for (let u = -half; u <= half; u += step) {
        const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca;
        if (x < b[0] - step || x > b[2] + step || y < b[1] - step || y > b[3] + step) continue;
        const r = rf(x, y);
        if (r < 0.3) continue;
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
      }
    }
    ctx.fill();
  }
  function fillB(ctx, b, col) { ctx.fillStyle = col; ctx.fillRect(b[0] - 2, b[1] - 2, b[2] - b[0] + 4, b[3] - b[1] + 4); }
  // Лучи из точки (cx, cy) в прямоугольнике b
  function rays(ctx, R, b, cx, cy, bg, fg, cnt) {
    fillB(ctx, b, bg);
    ctx.fillStyle = fg; ctx.beginPath();
    for (let i = 0; i < cnt; i++) {
      const a = i / cnt * TAU + R() * 0.08, w = 0.03 + R() * 0.05;
      ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - w) * 700, cy + Math.sin(a - w) * 700); ctx.lineTo(cx + Math.cos(a + w) * 700, cy + Math.sin(a + w) * 700);
      ctx.closePath();
    }
    ctx.fill();
  }
  const SFX = ['POW!', 'BAM!', 'ZAP!', 'BOOM!', 'WHAM!', 'KAPOW!', 'BANG!', 'CRASH!'];
  const POPW = ['BLAM!', 'KRAK!', 'ZOK!', 'WHAP!', 'SPLAT!', 'BZZT!'];
  const SFX_FONT = '900 italic SIZEpx Impact, "Arial Black", "Segoe UI Black", sans-serif';
  function sfxFont(ctx, size) { ctx.font = SFX_FONT.replace('SIZE', size.toFixed(1)); }

  // ---------- Страница комикса ----------
  function comicPage(R, ctx, A, B, K, P) {
    fillB(ctx, [0, 0, W, H], P);
    const g = 2.8, rect = [[-30, -30], [W + 30, -30], [W + 30, H + 30], [-30, H + 30]];
    const cuts = [114 + R() * 20, 250 + R() * 22, 380 + R() * 22].map((x) => { const sl = (R() - 0.5) * 0.32; return slant(x - sl * H / 2, x + sl * H / 2); });
    const colP = [];
    for (let k = 0; k <= cuts.length; k++) {
      let p = rect;
      if (k > 0) p = clipHalf(p, cuts[k - 1][0], cuts[k - 1][1], cuts[k - 1][2] + g);
      if (k < cuts.length) p = clipHalf(p, -cuts[k][0], -cuts[k][1], -(cuts[k][2] - g));
      colP.push(p);
    }
    const split = (pts, yh) => {
      const s2 = (R() - 0.5) * 0.28, ln = Math.hypot(s2, 1), nx = -s2 / ln, ny = 1 / ln, d = nx * W / 2 + ny * yh;
      return [clipHalf(pts, -nx, -ny, -(d - g)), clipHalf(pts, nx, ny, d + g)];
    };
    const c0 = split(colP[0], 74 + R() * 18), c2 = split(colP[2], 84 + R() * 18);
    const word = SFX[Math.floor(R() * SFX.length)];
    const panels = [[c0[0], 'action'], [c0[1], 'dots'], [colP[1], 'boom'], [c2[0], 'zoom'], [c2[1], 'streak'], [colP[3], 'star']];
    const shadowOn = () => { ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowOffsetX = 1.6 * S; ctx.shadowOffsetY = 1.6 * S; };
    panels.forEach((pp) => {
      const pts = pp[0];
      if (pts.length < 3) return;
      const b = bbox(pts), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, bw = b[2] - b[0], bh = b[3] - b[1];
      ctx.save();
      poly(ctx, pts); ctx.clip();
      if (pp[1] === 'dots') {
        // точки Бен-Дэй: красные на жёлтом, растут сверху вниз
        fillB(ctx, b, A);
        dotScreen(ctx, b, B, 0.785, 7, (x, y) => 0.8 + 2.7 * clamp01((y - b[1]) / bh));
      } else if (pp[1] === 'action' || pp[1] === 'streak') {
        // линии движения: сужающиеся штрихи вдоль одного направления
        const red = pp[1] === 'action';
        fillB(ctx, b, red ? B : A);
        const an = red ? 0 : -0.42, ca = Math.cos(an), sa = Math.sin(an);
        for (let i = 0; i < 26; i++) {
          const x = b[0] - 40 + R() * (bw + 40), y = b[1] - 30 + R() * (bh + 60), l = 30 + R() * 90, w = 0.8 + R() * 3.4;
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.lineTo(x + ca * l + sa * w, y + sa * l - ca * w); ctx.lineTo(x + ca * l - sa * w, y + sa * l + ca * w); ctx.closePath();
          ctx.fillStyle = red ? (i % 3 ? A : P) : (i % 3 ? B : K); ctx.fill();
        }
      } else if (pp[1] === 'zoom') {
        // «наезд камеры»: тонкие клинья сходятся к фокусу, в центре — красный круг с восклицанием
        const fx = cx + (R() - 0.5) * bw * 0.3, fy = cy + (R() - 0.5) * bh * 0.3;
        fillB(ctx, b, A);
        ctx.fillStyle = K; ctx.beginPath();
        for (let i = 0; i < 64; i++) {
          const a = i / 64 * TAU + R() * 0.05, w = 0.006 + R() * 0.016, r0 = 16 + R() * 12;
          ctx.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0);
          ctx.lineTo(fx + Math.cos(a - w) * 400, fy + Math.sin(a - w) * 400); ctx.lineTo(fx + Math.cos(a + w) * 400, fy + Math.sin(a + w) * 400);
          ctx.closePath();
        }
        ctx.fill();
        ctx.save(); shadowOn();
        ctx.beginPath(); ctx.arc(fx, fy, 11, 0, TAU); ctx.fillStyle = B; ctx.fill(); ctx.restore();
        ctx.lineWidth = 2; ctx.strokeStyle = K; ctx.stroke();
        sfxFont(ctx, 17); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeText('!', fx + 0.5, fy + 1); ctx.fillStyle = P; ctx.fillText('!', fx + 0.5, fy + 1);
      } else if (pp[1] === 'boom') {
        // большой взрыв: лучи, три слоя зубчатой вспышки и надпись
        const bx = cx + (R() - 0.5) * 10, by = cy + 4 + (R() - 0.5) * 12, r = Math.min(74, bw * 0.56);
        rays(ctx, R, b, bx, by, A, B, 28);
        const outer = burstPts(R, bx, by, r, r * 0.66, 12 + Math.floor(R() * 3), R() * TAU, 0.86);
        const mid = burstPts(R, bx, by, r * 0.78, r * 0.52, 10 + Math.floor(R() * 3), R() * TAU, 0.86);
        const inner = burstPts(R, bx, by, r * 0.56, r * 0.38, 9, R() * TAU, 0.86);
        ctx.save(); shadowOn(); poly(ctx, outer); ctx.fillStyle = P; ctx.fill(); ctx.restore();
        ctx.lineWidth = 2.6; ctx.strokeStyle = K; ctx.stroke();
        poly(ctx, mid); ctx.fillStyle = B; ctx.fill(); ctx.lineWidth = 1.6; ctx.stroke();
        poly(ctx, inner); ctx.fillStyle = A; ctx.fill();
        ctx.save();
        ctx.translate(bx, by + 2); ctx.rotate(-0.16 + (R() - 0.5) * 0.1);
        let size = r * 0.56;
        sfxFont(ctx, size);
        const tw = ctx.measureText(word).width;
        if (tw > r * 1.55) { size *= r * 1.55 / tw; sfxFont(ctx, size); }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = size * 0.24; ctx.strokeStyle = K;
        ctx.strokeText(word, size * 0.07, size * 0.08); ctx.fillStyle = K; ctx.fillText(word, size * 0.07, size * 0.08);
        ctx.strokeText(word, 0, 0); ctx.fillStyle = A; ctx.fillText(word, 0, 0);
        ctx.restore();
      } else {
        // большая звезда на красном с белыми точками и штрихами удара
        fillB(ctx, b, B);
        dotScreen(ctx, b, P, 0.3, 6.4, () => 1.35);
        const sx = cx + (R() - 0.5) * 12, sy = cy + 4, sr = Math.min(66, bw * 0.5, bh * 0.46);
        ctx.strokeStyle = K; ctx.lineWidth = 1.8; ctx.beginPath();
        for (let i = 0; i < 14; i++) {
          const a = i / 14 * TAU + R() * 0.2, r0 = sr * 1.08, r1 = sr * (1.25 + R() * 0.3);
          ctx.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0); ctx.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
        }
        ctx.stroke();
        const st = starPts(sx, sy, sr, 0.46, (R() - 0.5) * 0.3);
        ctx.save(); shadowOn(); poly(ctx, st); ctx.fillStyle = A; ctx.fill(); ctx.restore();
        ctx.lineWidth = 2.6; ctx.strokeStyle = K; ctx.stroke();
        // объём лучей звезды: тёмная половина каждого луча
        ctx.fillStyle = 'rgba(160,60,0,.22)'; ctx.beginPath();
        for (let i = 0; i < 10; i += 2) { ctx.moveTo(sx, sy); ctx.lineTo(st[i][0], st[i][1]); ctx.lineTo(st[(i + 1) % 10][0], st[(i + 1) % 10][1]); ctx.closePath(); }
        ctx.fill();
        ctx.strokeStyle = P; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(sx - sr * 0.28, sy - sr * 0.38); ctx.lineTo(sx - sr * 0.12, sy - sr * 0.66); ctx.stroke();
      }
      ctx.restore();
      ctx.lineWidth = 2.4; ctx.strokeStyle = K; poly(ctx, pts); ctx.stroke();
    });
    // пузырь реплики на стыке панелей
    const bx = 150 + R() * 200, by = 22 + R() * 10, txt = R() < 0.5 ? 'WOW!' : 'NO WAY!';
    sfxFont(ctx, 13);
    const bw2 = Math.max(26, ctx.measureText(txt).width * 0.62 + 8);
    ctx.beginPath(); ctx.ellipse(bx, by, bw2, 13, 0, 0, TAU);
    ctx.moveTo(bx + 4, by + 11); ctx.lineTo(bx + 15, by + 25); ctx.lineTo(bx + 13, by + 9);
    ctx.fillStyle = P; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = K; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = K; ctx.fillText(txt, bx, by + 1);
  }

  // ---------- Поп-арт: блоки, крупные точки и одно огромное слово ----------
  function popArt(R, ctx, A, B, K, P) {
    const Y = '#ffe23a';                                                // жёлтый — третий «печатный» цвет для слова
    const rect = [[-30, -30], [W + 30, -30], [W + 30, H + 30], [-30, H + 30]];
    const L1 = slant(140 + R() * 22, 104 + R() * 20), L2 = slant(338 + R() * 18, 384 + R() * 18);
    const left = clipHalf(rect, -L1[0], -L1[1], -L1[2]);
    const mid = clipHalf(clipHalf(rect, L1[0], L1[1], L1[2]), -L2[0], -L2[1], -L2[2]);
    const right = clipHalf(rect, L2[0], L2[1], L2[2]);
    const yh = 98 + R() * 12, s2 = -0.12 - R() * 0.1, ln = Math.hypot(s2, 1), hn = [-s2 / ln, 1 / ln], hd = hn[0] * 430 + hn[1] * yh;
    const rt = clipHalf(right, -hn[0], -hn[1], -hd), rb = clipHalf(right, hn[0], hn[1], hd);
    const block = (pts, fn) => { ctx.save(); poly(ctx, pts); ctx.clip(); fn(bbox(pts)); ctx.restore(); };
    // левый блок: пурпур с голубыми точками, растущими по диагонали (приклад, кольцо ножа, рукояти)
    block(left, (b) => {
      fillB(ctx, b, B);
      dotScreen(ctx, b, A, 0.785, 10, (x, y) => 1.5 + 3.3 * clamp01((x - b[0]) / 170 * 0.5 + y / H * 0.6));
    });
    // средний блок: голубой с пурпурными точками — мельче сверху, крупнее к магазину
    block(mid, (b) => {
      fillB(ctx, b, A);
      dotScreen(ctx, b, B, 0.26, 11, (x, y) => 1.6 + 3.5 * clamp01(y / H));
    });
    // правый верх: кремовый с плотными пурпурными точками и голубой мишенью
    block(rt, (b) => {
      fillB(ctx, b, P);
      dotScreen(ctx, b, B, 0.26, 8.5, (x, y) => 2.2 + 1.3 * clamp01((x - b[0]) / 150));
      const tx = 446 + R() * 22, ty = 40 + R() * 12;
      for (let k = 4; k >= 1; k--) {
        ctx.beginPath(); ctx.arc(tx, ty, k * 12.5, 0, TAU);
        ctx.fillStyle = k % 2 ? A : (k === 2 ? B : P); ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = K; ctx.stroke();
      }
    });
    // правый низ: пурпур с голубыми косыми полосами (изгиб клинка ножа)
    block(rb, (b) => {
      fillB(ctx, b, B);
      ctx.strokeStyle = A; ctx.lineWidth = 6.5; ctx.lineCap = 'butt'; ctx.beginPath();
      for (let s = b[0] - 160; s < b[2] + 40; s += 14) { ctx.moveTo(s, b[3] + 6); ctx.lineTo(s + (b[3] - b[1]) + 12, b[1] - 6); }
      ctx.stroke(); ctx.lineCap = 'round';
    });
    // толстые границы блоков
    ctx.strokeStyle = K; ctx.lineWidth = 4.2;
    [left, mid, rt, rb].forEach((p) => { poly(ctx, p); ctx.stroke(); });
    // огромное слово: жёлтая заливка с пурпурными точками снизу, толстый контур, жёсткая тень
    const word = POPW[Math.floor(R() * POPW.length)];
    const wx = 250 + (R() - 0.5) * 18, wy = 116 + (R() - 0.5) * 8, rot = -0.08 + (R() - 0.5) * 0.05;
    let size = 96;
    sfxFont(ctx, size);
    const tw = ctx.measureText(word).width;
    if (tw > 270) { size *= 270 / tw; sfxFont(ctx, size); }
    const put = (cv, fn) => { cv.save(); cv.translate(wx, wy); cv.rotate(rot); sfxFont(cv, size); cv.textAlign = 'center'; cv.textBaseline = 'middle'; cv.lineJoin = 'round'; fn(cv); cv.restore(); };
    put(ctx, (cv) => {
      // жёсткая тень пурпуром (не чёрным — магазин и рукоять остаются цветными), затем контур
      cv.lineWidth = size * 0.1; cv.strokeStyle = B; cv.fillStyle = B;
      cv.strokeText(word, size * 0.06, size * 0.06); cv.fillText(word, size * 0.06, size * 0.06);
      cv.strokeStyle = K; cv.lineWidth = size * 0.1;
      cv.strokeText(word, size * 0.06, size * 0.06);
      cv.strokeText(word, 0, 0);
    });
    const fl = layer(), fc = fl.ctx;
    put(fc, (cv) => { cv.fillStyle = Y; cv.fillText(word, 0, 0); });
    fc.globalCompositeOperation = 'source-atop';
    dotScreen(fc, [wx - 160, wy - 60, wx + 160, wy + 60], B, 0.26, 6.2, (x, y) => 2.4 * clamp01((y - wy + 4) / 34));
    fc.fillStyle = 'rgba(255,255,255,.85)';
    put(fc, (cv) => { cv.fillRect(-tw, -size * 0.3, tw * 2, size * 0.07); });
    ctx.drawImage(fl.c, 0, 0, W, H);
    put(ctx, (cv) => { cv.lineWidth = size * 0.035; cv.strokeStyle = K; cv.strokeText(word, 0, 0); });
  }

  Tex.addGen('halftone', function (f, R) {
    const id = idOf(f), pop = id === 'popart' || (id !== 'comic' && lum(rgb(f.c[3])) < 250);
    const lay = layer();
    (pop ? popArt : comicPage)(R, lay.ctx, f.c[0], f.c[1], f.c[2], f.c[3]);
    return lay.c;
  });

  // ===================================================================================
  // Граффити (graffiti): бетонная стена, закраски-«бафф» и мазки валика, цветные облака аэрозоля,
  // фон из подписей-хендстайлов (слитные петли), трафаретов с перемычками и пузырьковых «тро-апов»,
  // поверх — 3–4 компактных «куска»: объёмные буквы с выдавливанием, двухцветной заливкой, мягким бликом
  // аэрозоля, пузырьками-бликами и сужающимися подтёками с каплей. У каждой раскраски свой набор слов.
  // ===================================================================================
  const GRAF_WORDS = {
    tags: ['LUCKY', 'HYPE', 'FAME', 'LOOT', 'GLOW', 'NOVA', 'JOLT', 'FLEX', 'VIBE'],
    street: ['ZINC', 'MURAL', 'CREW', 'METRO', 'ECHO', 'BLOCK', 'ALLEY', 'TRAIN', 'KING'],
  };
  const THROWS = ['OK', 'ZX', 'MK', 'RA', 'JO', 'EK', 'SV', 'TY'];
  const PIECE_FONT = '900 SIZEpx "Arial Black", Impact, "Segoe UI Black", sans-serif';

  // Подтёк: ширина w у кромки буквы сужается до w/3, на конце капля 1.6× конечной толщины
  function drip(ctx, R, x, y, len, w, col, ink) {
    const w1 = w / 3, sx = (R() - 0.5) * 1.8, y1 = y + len, rb = w1 * 0.8;
    const shape = new Path2D();
    shape.moveTo(x - w * 0.8, y - 0.6);
    shape.quadraticCurveTo(x - w * 0.5, y + 0.2, x - w * 0.5, y + w * 0.9);
    shape.quadraticCurveTo(x + sx * 0.4 - w * 0.36, y + len * 0.55, x + sx - w1 / 2, y1);
    shape.arc(x + sx, y1, rb, Math.PI, 0, true);
    shape.quadraticCurveTo(x + sx * 0.4 + w * 0.36, y + len * 0.55, x + w * 0.5, y + w * 0.9);
    shape.quadraticCurveTo(x + w * 0.5, y + 0.2, x + w * 0.8, y - 0.6);
    shape.closePath();
    shape.moveTo(x + sx + rb * 1.6, y1 + rb * 0.6);
    shape.arc(x + sx, y1 + rb * 0.6, rb * 1.6, 0, TAU);                // капля на конце
    ctx.lineWidth = 1.1; ctx.strokeStyle = css(ink, 0.55); ctx.stroke(shape);
    ctx.fillStyle = css(col); ctx.fill(shape);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.ellipse(x + sx - rb * 0.6, y1 + rb * 0.1, rb * 0.5, rb * 0.7, 0.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.45;
    ctx.beginPath(); ctx.moveTo(x - w * 0.25, y + w); ctx.quadraticCurveTo(x + sx * 0.4 - w * 0.2, y + len * 0.55, x + sx - w1 * 0.3, y1 - rb); ctx.stroke();
  }

  Tex.addGen('graffiti', function (f, R, n, n2, n3) {
    const id = idOf(f), col = f.c.map(rgb), wall = col[0];
    const darkWall = lum(wall) < 110;
    let paints = col.slice(1).filter((c) => lum(c) > 60);
    if (!paints.length) paints = [col[1]];
    const ink = col.slice(1).find((c) => lum(c) < 60) || [18, 18, 20];
    const chrome = darkWall ? [228, 232, 238] : [252, 250, 244];
    const pc = (i) => paints[((i % paints.length) + paints.length) % paints.length];
    const pool = (GRAF_WORDS[id] || (darkWall ? GRAF_WORDS.tags : GRAF_WORDS.street)).slice();
    // стена: бетон с пятнами, порами и швами блоков
    const c = raster((x, y, out) => {
      const v = fbm(n, x * 0.012, y * 0.02, 4) * 0.55 + fbm(n2, x * 0.05, y * 0.07, 2) * 0.3;
      let k = 1 + v * 0.38;
      if (n3(x * 0.85, y * 0.85) > 0.38) k *= 0.8;
      const row = Math.floor(y / 48), bx = (x + (row % 2) * 48) % 96, by = y % 48;
      if (by < 1.1 || bx < 1.1) k *= 0.84; else if (by < 2 || bx < 2) k *= 1.06;
      out[0] = wall[0] * k; out[1] = wall[1] * k; out[2] = wall[2] * k;
    });
    const ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // мазок валика: широкая полоса с рваными торцами и продольными полосами
    const roller = (x0, y0, x1, y1, w, cc, a) => {
      const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len, nx = -uy, ny = ux;
      const pts = [], k = 10;
      for (let i = 0; i <= k; i++) { const t = i / k, j = (R() - 0.5) * w * 0.12; pts.push([x0 + ux * len * t + nx * (-w / 2 + j), y0 + uy * len * t + ny * (-w / 2 + j)]); }
      for (let i = 1; i < 6; i++) { const e = R() * 7; pts.push([x1 + ux * e + nx * (-w / 2 + w * i / 6), y1 + uy * e + ny * (-w / 2 + w * i / 6)]); }
      for (let i = k; i >= 0; i--) { const t = i / k, j = (R() - 0.5) * w * 0.12; pts.push([x0 + ux * len * t + nx * (w / 2 + j), y0 + uy * len * t + ny * (w / 2 + j)]); }
      for (let i = 5; i > 0; i--) { const e = R() * 7; pts.push([x0 - ux * e + nx * (-w / 2 + w * i / 6), y0 - uy * e + ny * (-w / 2 + w * i / 6)]); }
      ctx.save();
      poly(ctx, pts); ctx.fillStyle = css(cc, a); ctx.fill();
      ctx.clip();
      ctx.lineCap = 'butt';
      for (let i = 0; i < 12; i++) {
        const o = (R() - 0.5) * w, wl = 0.5 + R() * 2.2;
        ctx.strokeStyle = css(tone(cc, (R() - 0.5) * 0.35), 0.2 + R() * 0.25); ctx.lineWidth = wl;
        ctx.beginPath(); ctx.moveTo(x0 - ux * 10 + nx * o, y0 - uy * 10 + ny * o); ctx.lineTo(x1 + ux * 10 + nx * o, y1 + uy * 10 + ny * o); ctx.stroke();
      }
      ctx.restore();
    };
    // 1) бафф цветом стены и 4 мазка краской: приклад, магазин, верх (затворы пистолетов), правый край
    roller(250 + R() * 60, 40 + R() * 20, 420 + R() * 60, 46 + R() * 20, 54 + R() * 12, darkWall ? tone(wall, 0.12) : tone(wall, -0.09), 0.9);
    roller(-14, 84 + R() * 16, 150 + R() * 20, 78 + R() * 16, 30 + R() * 8, pc(0), darkWall ? 0.7 : 0.85);
    roller(206 + R() * 16, 112 + R() * 10, 300 + R() * 16, 182 + R() * 10, 26 + R() * 6, pc(1), darkWall ? 0.7 : 0.85);
    roller(40 + R() * 30, 22 + R() * 8, 300 + R() * 40, 18 + R() * 10, 15 + R() * 5, pc(2), 0.6);
    roller(360 + R() * 30, 158 + R() * 14, W + 16, 126 + R() * 14, 28 + R() * 8, pc(0), 0.55);
    // 2) облака аэрозоля
    for (let i = 0; i < 7; i++) {
      const x = (i + 0.2 + R() * 0.6) / 7 * W, y = 30 + R() * (H - 60), r = 36 + R() * 50, p = pc(i + 1);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, css(p, 0.5)); g.addColorStop(0.6, css(p, 0.2)); g.addColorStop(1, css(p, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 3) хендстайлы: слитные петли с наклоном и подчёркиванием-росчерком
    const handstyle = (x, y, s, cc, w, rot) => {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(rot); ctx.transform(1, 0, -0.32, 1, 0, 0);
      ctx.beginPath(); ctx.moveTo(0, 0);
      let px = 0;
      const k = 4 + Math.floor(R() * 4);
      for (let i = 0; i < k; i++) {
        const t = R(), wl = (5 + R() * 5) * s, h = (7 + R() * 9) * s;
        if (t < 0.38) {                                                     // петля вверх (l, h, b)
          ctx.bezierCurveTo(px + wl * 0.9, -h * 0.35, px + wl * 0.95, -h * 1.15, px + wl * 0.45, -h * 1.1);
          ctx.bezierCurveTo(px + wl * 0.05, -h * 1.0, px + wl * 0.2, -h * 0.05, px + wl, 0);
        } else if (t < 0.72) {                                              // горбы (n, m)
          ctx.bezierCurveTo(px + wl * 0.05, -h * 0.75, px + wl * 0.95, -h * 0.75, px + wl, 0);
        } else {                                                            // нижняя петля (g, y)
          ctx.bezierCurveTo(px + wl * 0.85, h * 0.2, px + wl * 0.9, h * 0.95, px + wl * 0.45, h * 0.9);
          ctx.bezierCurveTo(px, h * 0.85, px + wl * 0.3, -h * 0.05, px + wl, 0);
        }
        px += wl;
      }
      ctx.moveTo(-4 * s, 6 * s);
      ctx.bezierCurveTo(px * 0.4, 13 * s, px - 6 * s, 3 * s, px + 9 * s, -7 * s);
      ctx.strokeStyle = cc; ctx.lineWidth = w; ctx.stroke();
      if (R() < 0.5) { ctx.beginPath(); ctx.arc(px + 12 * s, -12 * s, 1.1 * s + w * 0.4, 0, TAU); ctx.fillStyle = cc; ctx.fill(); }
      ctx.restore();
    };
    for (let i = 0; i < 12; i++) {
      const x = (i % 6) / 6 * W + R() * 50, y = (i < 6 ? 18 : 110) + R() * 70;
      const cc = i % 3 === 0 ? css(pc(i), 0.85) : css(darkWall ? chrome : ink, 0.55 + R() * 0.3);
      handstyle(x, y, 0.8 + R() * 0.5, cc, 1.1 + R() * 0.9, (R() - 0.5) * 0.35);
    }
    // 4) трафареты: корона и звезда с перемычками, мягкий ореол распыления
    const st = layer(), sc = st.ctx;
    const stencil = (kind, x, y, s, cc) => {
      sc.save(); sc.translate(x, y); sc.rotate((R() - 0.5) * 0.4); sc.scale(s, s);
      sc.fillStyle = css(cc);
      if (kind === 0) {
        poly(sc, [[-1, 0.55], [1, 0.55], [1.12, -0.5], [0.52, -0.02], [0, -0.78], [-0.52, -0.02], [-1.12, -0.5]]); sc.fill();
        [[-1.12, -0.62], [0, -0.92], [1.12, -0.62]].forEach((q) => { sc.beginPath(); sc.arc(q[0], q[1], 0.16, 0, TAU); sc.fill(); });
        sc.globalCompositeOperation = 'destination-out';
        sc.fillRect(-1.2, 0.22, 2.4, 0.09);
        [-0.5, 0, 0.5].forEach((u) => { sc.beginPath(); sc.arc(u, 0.38, 0.09, 0, TAU); sc.fill(); });
      } else {
        poly(sc, starPts(0, 0, 1, 0.45, 0)); sc.fill();
        sc.globalCompositeOperation = 'destination-out';
        sc.lineWidth = 0.09; sc.strokeStyle = '#000';
        sc.beginPath(); sc.moveTo(0, 0); sc.lineTo(0, -1); sc.moveTo(0, 0); sc.lineTo(0.62, 0.8); sc.stroke();
      }
      sc.restore();
    };
    stencil(0, 452 + R() * 30, 34 + R() * 14, 15 + R() * 4, darkWall ? chrome : ink);
    stencil(1, 196 + R() * 30, 164 + R() * 10, 13 + R() * 3, pc(2));
    stencil(1, 30 + R() * 30, 30 + R() * 14, 11 + R() * 3, pc(1));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowColor = css(darkWall ? chrome : ink, 0.55); ctx.shadowBlur = 3 * S;
    ctx.globalAlpha = 0.92; ctx.drawImage(st.c, 0, 0);
    ctx.restore();
    // 5) пузырьковые «тро-апы»: толстая круглая обводка, одна заливка
    const throws = THROWS.slice();
    const throwUp = (cx, cy, size, fill, line) => {
      const t = throws.splice(Math.floor(R() * throws.length), 1)[0] || 'OK';
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((R() - 0.5) * 0.24);
      ctx.font = PIECE_FONT.replace('SIZE', size.toFixed(1)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = css(line); ctx.lineWidth = size * 0.46; ctx.strokeText(t, 0, 0);
      ctx.strokeStyle = css(fill); ctx.lineWidth = size * 0.3; ctx.strokeText(t, 0, 0);
      ctx.fillStyle = css(fill); ctx.fillText(t, 0, 0);
      ctx.strokeStyle = css(line, 0.6); ctx.lineWidth = size * 0.035; ctx.strokeText(t, 0, 0);
      ctx.restore();
    };
    throwUp(212 + R() * 30, 46 + R() * 10, 24 + R() * 5, darkWall ? chrome : pc(1), ink);
    throwUp(40 + R() * 30, 160 + R() * 10, 22 + R() * 4, darkWall ? pc(2) : chrome, ink);

    // 6) основные «куски»
    const fillLay = layer(), fctx = fillLay.ctx;
    const pieces = [], drips = [];
    const piece = (cx, cy, size, sch) => {
      const word = pool.splice(Math.floor(R() * pool.length), 1)[0] || 'ART';
      ctx.font = fctx.font = PIECE_FONT.replace('SIZE', size.toFixed(1));
      const letters = [];
      let x = 0;
      for (const ch of word) {
        const w = ctx.measureText(ch).width;
        letters.push({ ch: ch, x: x + w / 2, w: w, dy: (R() - 0.5) * size * 0.12, a: (R() - 0.5) * 0.12, s: 0.96 + R() * 0.1 });
        x += w * 0.86;
      }
      const span = x + letters[letters.length - 1].w * 0.14, ox = cx - span / 2, base = cy + size * 0.36, rot = (R() - 0.5) * 0.1;
      const each = (cv, fn) => letters.forEach((lt) => {
        cv.save(); cv.translate(ox + lt.x, base + lt.dy); cv.rotate(rot + lt.a); cv.scale(lt.s, lt.s); fn(cv, lt); cv.restore();
      });
      const ow = size * 0.24;
      ctx.textAlign = fctx.textAlign = 'center';
      // выдавливание (3D) тёмным оттенком обводки
      const ext = css(tone(sch.edge, -0.6));
      for (let k = 6; k >= 1; k--) each(ctx, (cv, lt) => { cv.lineWidth = ow + 2.2; cv.strokeStyle = ext; cv.strokeText(lt.ch, k * 0.7, k * 0.85); });
      each(ctx, (cv, lt) => { cv.lineWidth = ow + 2.4; cv.strokeStyle = css(ink); cv.strokeText(lt.ch, 0, 0); });
      each(ctx, (cv, lt) => { cv.lineWidth = ow; cv.strokeStyle = css(sch.edge); cv.strokeText(lt.ch, 0, 0); });
      each(ctx, (cv, lt) => { cv.lineWidth = size * 0.08; cv.strokeStyle = css(ink); cv.strokeText(lt.ch, 0, 0); });
      each(fctx, (cv, lt) => { cv.fillStyle = css(sch.top); cv.fillText(lt.ch, 0, 0); });
      pieces.push({ ox: ox, base: base, span: span, size: size, sch: sch, letters: letters, each: each });
      letters.forEach((lt) => {
        if (R() < 0.6) drips.push([ox + lt.x + (R() - 0.5) * lt.w * 0.45, base + lt.dy + size * 0.1, 6 + R() * R() * 26, 2.6 + R() * 1.2, sch.bot]);
      });
    };
    const scheme = (i) => ({ top: pc(i), bot: paints.length > 2 ? pc(i + 2) : tone(pc(i), -0.32), edge: darkWall ? (i % 2 ? chrome : pc(i + 1)) : (i % 2 ? pc(i + 1) : chrome) });
    // места: ствольная коробка / верх клинка, приклад / кольцо, изгиб клинка, магазин
    piece(318 + R() * 26, 60 + R() * 10, 40 + R() * 4, scheme(0));
    piece(96 + R() * 20, 98 + R() * 10, 36 + R() * 4, scheme(1));
    piece(446 + R() * 14, 146 + R() * 8, 30 + R() * 3, scheme(2));
    piece(262 + R() * 10, 150 + R() * 8, 26 + R() * 3, scheme(3));
    // эффекты внутри букв: нижняя часть другим цветом по волнистому разделу, мягкий блик, пузырьки
    fctx.globalCompositeOperation = 'source-atop';
    pieces.forEach((p) => {
      const ys = p.base - p.size * (0.3 + R() * 0.08), x0 = p.ox - 16, x1 = p.ox + p.span + 16, ph = R() * 6;
      const wave = new Path2D();
      wave.moveTo(x0, ys);
      for (let x = x0; x <= x1; x += 4) wave.lineTo(x, ys + Math.sin(x * 0.12 + ph) * 2.2);
      const lower = new Path2D(wave);
      lower.lineTo(x1, p.base + p.size); lower.lineTo(x0, p.base + p.size); lower.closePath();
      const g = fctx.createLinearGradient(0, ys, 0, p.base + 4);
      g.addColorStop(0, css(p.sch.bot)); g.addColorStop(1, css(tone(p.sch.bot, -0.3)));
      fctx.fillStyle = g; fctx.fill(lower);
      fctx.strokeStyle = 'rgba(255,255,255,.6)'; fctx.lineWidth = 0.9; fctx.stroke(wave);
      p.letters.forEach((lt) => {
        const x = p.ox + lt.x - lt.w * 0.16, y = p.base + lt.dy - p.size * 0.52, r = p.size * 0.4;
        const gg = fctx.createRadialGradient(x, y, 0, x, y, r);
        gg.addColorStop(0, 'rgba(255,255,255,.55)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
        fctx.fillStyle = gg; fctx.fillRect(x - r, y - r, r * 2, r * 2);
        fctx.fillStyle = 'rgba(255,255,255,.9)';
        fctx.beginPath(); fctx.ellipse(x - lt.w * 0.04, y + p.size * 0.04, p.size * 0.05, p.size * 0.028, -0.6, 0, TAU); fctx.fill();
        fctx.beginPath(); fctx.arc(x + p.size * 0.06, y - p.size * 0.01, p.size * 0.018, 0, TAU); fctx.fill();
      });
    });
    fctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(fillLay.c, 0, 0, W, H);
    // тонкий контур поверх заливки разделяет наложенные буквы
    pieces.forEach((p) => {
      ctx.font = PIECE_FONT.replace('SIZE', p.size.toFixed(1)); ctx.textAlign = 'center';
      p.each(ctx, (cv, lt) => { cv.lineWidth = p.size * 0.025; cv.strokeStyle = css(ink, 0.8); cv.strokeText(lt.ch, 0, 0); });
    });
    // подтёки
    drips.forEach((d) => drip(ctx, R, d[0], d[1], d[2], d[3], d[4], ink));
    // брызги и туман аэрозоля вокруг кусков
    pieces.forEach((p, k) => {
      const cx = p.ox + p.span / 2, cy = p.base - p.size * 0.35;
      for (let i = 0; i < 160; i++) {
        const a = R() * TAU, d = p.span * (0.45 + Math.pow(R(), 0.5) * 0.35);
        ctx.fillStyle = css(i % 4 ? p.sch.top : ink, 0.3 + R() * 0.45);
        ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.5, 0.5 + R() * 0.8, 0.5 + R() * 0.8);
      }
    });
    // поры стены поверх краски
    ctx.fillStyle = darkWall ? 'rgba(0,0,0,.3)' : 'rgba(40,36,30,.25)';
    for (let i = 0; i < 1300; i++) ctx.fillRect(R() * W, R() * H, 0.4 + R() * 0.6, 0.4 + R() * 0.6);
    return c;
  });

  // ===================================================================================
  // Чертёж (blueprint): синька с сеткой, шестерни в зацеплении, пружина, болт с резьбой,
  // сечение со штриховкой, размерные линии, выноски и штамп.
  // ===================================================================================
  function gearPath(ctx, cx, cy, r, teeth, depth, rot) {
    ctx.beginPath();
    const ri = r - depth, s = TAU / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = rot + i * s;
      const pts = [[ri, a - s * 0.5], [ri, a - s * 0.27], [r, a - s * 0.13], [r, a + s * 0.13], [ri, a + s * 0.27]];
      pts.forEach((p, k) => {
        const x = cx + Math.cos(p[1]) * p[0], y = cy + Math.sin(p[1]) * p[0];
        if (i === 0 && k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
    }
    ctx.closePath();
  }
  function arrowHead(ctx, x, y, a) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(a) * 4.2 - Math.sin(a) * 1.3, y - Math.sin(a) * 4.2 + Math.cos(a) * 1.3);
    ctx.lineTo(x - Math.cos(a) * 4.2 + Math.sin(a) * 1.3, y - Math.sin(a) * 4.2 - Math.cos(a) * 1.3);
    ctx.closePath(); ctx.fill();
  }
  function dimLine(ctx, x0, y0, x1, y1, text) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    arrowHead(ctx, x0, y0, a + Math.PI); arrowHead(ctx, x1, y1, a);
    ctx.save();
    ctx.translate((x0 + x1) / 2, (y0 + y1) / 2); ctx.rotate(a);
    ctx.textAlign = 'center'; ctx.fillText(text, 0, -2.2);
    ctx.restore();
  }

  Tex.addGen('blueprint', function (f, R, n, n2) {
    const paper = rgb(f.c[0]), ink = rgb(f.c[1]), mid = rgb(f.c[2]);
    const c = L.pixels(0.5, (x, y) => {
      const v = fbm(n, x * 0.006, y * 0.01, 4), w = fbm(n2, x * 0.03, y * 0.05, 2);
      const ex = (x - W / 2) / (W / 2), ey = (y - H / 2) / (H / 2);
      const k = 1 + v * 0.22 + w * 0.06 - 0.14 * ex * ex - 0.2 * ey * ey;
      return [paper[0] * k, paper[1] * k, paper[2] * k];
    });
    const ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // сетка
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += 8) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.strokeStyle = css(mid, 0.2); ctx.lineWidth = 0.35; ctx.stroke();
    ctx.beginPath();
    for (let x = 0; x <= W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.strokeStyle = css(mid, 0.42); ctx.lineWidth = 0.6; ctx.stroke();
    // всё остальное — белыми линиями с лёгким «растеканием»
    const line = css(ink, 0.92), thin = css(ink, 0.55);
    ctx.shadowColor = css(ink, 0.45); ctx.shadowBlur = 2 * S;
    ctx.strokeStyle = line; ctx.fillStyle = line;
    const centerLine = (x0, y0, x1, y1) => {
      ctx.save(); ctx.setLineDash([10, 2.5, 2, 2.5]); ctx.strokeStyle = thin; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
    };
    // большая шестерня
    const ax = 112 + (R() - 0.5) * 16, ay = 96, ar = 60, rot = R() * TAU;
    ctx.lineWidth = 1.3; gearPath(ctx, ax, ay, ar, 22, 7, rot); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ax, ay, ar * 0.26, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(ax, ay, ar * 0.13, 0, TAU); ctx.stroke();
    ctx.strokeRect(ax - 2.2, ay - ar * 0.13 - 3.4, 4.4, 4.4);
    for (let i = 0; i < 6; i++) {
      const a = rot + i * TAU / 6;
      ctx.beginPath(); ctx.arc(ax + Math.cos(a) * ar * 0.58, ay + Math.sin(a) * ar * 0.58, ar * 0.13, 0, TAU); ctx.stroke();
    }
    ctx.save(); ctx.setLineDash([6, 2, 1.5, 2]); ctx.strokeStyle = thin; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(ax, ay, ar - 3.5, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(ax, ay, ar * 0.58, 0, TAU); ctx.stroke();
    ctx.restore();
    centerLine(ax - ar - 14, ay, ax + ar + 14, ay); centerLine(ax, ay - ar - 14, ax, ay + ar + 14);
    // малая шестерня в зацеплении
    const ma = -0.62, br = 34, bx = ax + Math.cos(ma) * (ar + br - 6.2), by = ay + Math.sin(ma) * (ar + br - 6.2);
    ctx.lineWidth = 1.2; gearPath(ctx, bx, by, br, 13, 6, R() * TAU); ctx.stroke();
    ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(bx, by, br * 0.32, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx, by, br * 0.15, 0, TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + 0.4;
      ctx.beginPath(); ctx.arc(bx + Math.cos(a) * br * 0.6, by + Math.sin(a) * br * 0.6, br * 0.12, 0, TAU); ctx.stroke();
    }
    centerLine(bx - br - 10, by, bx + br + 10, by); centerLine(bx, by - br - 10, bx, by + br + 10);
    // размеры
    ctx.lineWidth = 0.6; ctx.font = '600 6.5px Arial, sans-serif';
    ctx.beginPath(); ctx.moveTo(ax - ar, ay + 6); ctx.lineTo(ax - ar, 184); ctx.moveTo(ax + ar, ay + 6); ctx.lineTo(ax + ar, 184); ctx.stroke();
    dimLine(ctx, ax - ar, 180, ax + ar, 180, 'Ø120 · Z22 · m5');
    const la = -2.25;                                     // выноска влево-вверх, подпись не заходит на примечания
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(la) * (br + 16), by + Math.sin(la) * (br + 16)); ctx.lineTo(bx + Math.cos(la) * (br + 16) - 22, by + Math.sin(la) * (br + 16)); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillText('R34 · Z13', bx + Math.cos(la) * (br + 16) - 22, by + Math.sin(la) * (br + 16) - 2);
    // пружина
    const sx = 236, sy = 150;
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.ellipse(sx + 6 + i * 9.5, sy, 5.2, 13, 0.32, 0, TAU); ctx.stroke(); }
    ctx.strokeRect(sx - 2, sy - 15, 4, 30); ctx.strokeRect(sx + 99, sy - 15, 4, 30);
    centerLine(sx - 12, sy, sx + 116, sy);
    ctx.textAlign = 'left'; ctx.fillText('SPRING  k = 4.2 N/mm', sx, sy + 26);
    // сечение А-А со штриховкой
    const tx = 300 + (R() - 0.5) * 10, ty = 62;
    ctx.save();
    ctx.beginPath(); ctx.arc(tx, ty, 26, 0, TAU); ctx.arc(tx, ty, 15, 0, TAU);
    ctx.clip('evenodd');
    ctx.lineWidth = 0.5; ctx.beginPath();
    for (let s = -60; s < 60; s += 3.4) { ctx.moveTo(tx + s - 30, ty + 30); ctx.lineTo(tx + s + 30, ty - 30); }
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(tx, ty, 26, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(tx, ty, 15, 0, TAU); ctx.stroke();
    centerLine(tx - 34, ty, tx + 34, ty); centerLine(tx, ty - 34, tx, ty + 34);
    ctx.textAlign = 'center'; ctx.fillText('SECTION A-A', tx, ty + 40);
    // болт с резьбой (вид сбоку)
    const hx = 366, hy = 84;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(hx, hy - 16, 20, 32);
    ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(hx, hy - 6); ctx.lineTo(hx + 20, hy - 6); ctx.moveTo(hx, hy + 6); ctx.lineTo(hx + 20, hy + 6); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(hx + 20, hy - 11); ctx.lineTo(hx + 52, hy - 11);
    for (let x = hx + 52; x < hx + 118; x += 3.4) { ctx.lineTo(x + 1.7, hy - 13); ctx.lineTo(x + 3.4, hy - 11); }
    ctx.lineTo(hx + 124, hy - 7); ctx.lineTo(hx + 124, hy + 7); ctx.lineTo(hx + 118, hy + 11);
    for (let x = hx + 118; x > hx + 52; x -= 3.4) { ctx.lineTo(x - 1.7, hy + 13); ctx.lineTo(x - 3.4, hy + 11); }
    ctx.lineTo(hx + 20, hy + 11); ctx.stroke();
    ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(hx + 52, hy - 9); ctx.lineTo(hx + 118, hy - 9); ctx.moveTo(hx + 52, hy + 9); ctx.lineTo(hx + 118, hy + 9); ctx.stroke();
    centerLine(hx - 8, hy, hx + 134, hy);
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(hx + 20, hy - 18); ctx.lineTo(hx + 20, hy - 34); ctx.moveTo(hx + 124, hy - 10); ctx.lineTo(hx + 124, hy - 34); ctx.stroke();
    dimLine(ctx, hx + 20, hy - 30, hx + 124, hy - 30, '104.5');
    ctx.textAlign = 'left'; ctx.fillText('M22 × 2.5', hx + 70, hy + 24);
    ctx.save(); ctx.setLineDash([3, 2]); ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.arc(hx + 100, hy + 2, 15, 0, TAU); ctx.stroke(); ctx.restore();
    ctx.fillText('B', hx + 114, hy - 12);
    // штамп
    const sx0 = 398, sy0 = 140, sw = 110, sh = 46;
    ctx.lineWidth = 1.1; ctx.strokeRect(sx0, sy0, sw, sh);
    ctx.lineWidth = 0.5; ctx.beginPath();
    [11.5, 23, 34.5].forEach((d) => { ctx.moveTo(sx0, sy0 + d); ctx.lineTo(sx0 + sw, sy0 + d); });
    ctx.moveTo(sx0 + 58, sy0 + 11.5); ctx.lineTo(sx0 + 58, sy0 + sh);
    ctx.stroke();
    ctx.font = '700 7px Arial, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('CL ARMS · R&D DIVISION', sx0 + 4, sy0 + 8.6);
    ctx.font = '600 5.6px Arial, sans-serif';
    ctx.fillText('DWG 47-A113', sx0 + 4, sy0 + 19.5); ctx.fillText('SCALE 1:2', sx0 + 62, sy0 + 19.5);
    ctx.fillText('MAT 4140 STEEL', sx0 + 4, sy0 + 31); ctx.fillText('SHEET 3 / 7', sx0 + 62, sy0 + 31);
    ctx.fillText('DRAWN  K.V.', sx0 + 4, sy0 + 42.5); ctx.fillText('REV  C', sx0 + 62, sy0 + 42.5);
    // примечания и строительные линии
    ctx.font = '600 5.2px Arial, sans-serif';
    ctx.fillText('NOTES: 1. BREAK ALL EDGES 0.2   2. HARDEN 52 HRC   3. TOL ±0.05', 252, 12);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = css(ink, 0.22); ctx.lineWidth = 0.45; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const y = 20 + R() * 150; ctx.moveTo(0, y); ctx.lineTo(W, y + (R() - 0.5) * 30); }
    ctx.stroke();
    return c;
  });

  // ===================================================================================
  // Топография (topo). 3 цвета — карта: сглаженный рельеф (без «волосков»), спокойная двухтонная олива,
  // тонкие полупрозрачные горизонтали и каждая пятая — толстая светлая с 3–4 подписями высот вдоль линии,
  // вершины, тропа, репер. 4 цвета — тепловизор: 6 тепловых пятен по всему полю (одно в левой трети,
  // одно в правой половине), 8 жёстких изотерм с тёмным контуром между ними, строки развёртки; без HUD.
  // ===================================================================================
  function topoMap(R, n, n2, n3, col) {
    const low = col[0], ink = col[1], mid = col[2];
    const hills = [[300 + R() * 90, 50 + R() * 40, 70 + R() * 30, 0.32], [60 + R() * 70, 100 + R() * 40, 60 + R() * 20, 0.26], [200 + R() * 60, 150 + R() * 30, 50, -0.2]];
    const hf = field(2, (x, y) => {
      const wx = 22 * fbm(n2, x * 0.005, y * 0.009, 2), wy = 14 * fbm(n3, x * 0.005 + 5.2, y * 0.009 + 1.3, 2);
      let v = fbm(n, (x + wx) * 0.0062, (y + wy) * 0.011, 3);
      for (let i = 0; i < hills.length; i++) {
        const q = hills[i], dx = (x + wx - q[0]) / q[2], dy = (y + wy - q[1]) / (q[2] * 0.62);
        v += q[3] * Math.exp(-(dx * dx + dy * dy));
      }
      return v;
    });
    const lo = hf.lo, span = hf.hi - hf.lo || 1, e = 1.2, levels = 20;
    const b0 = mix(low, mid, 0.12), b1 = mix(low, mid, 0.6), hiInk = tone(ink, 0.25), thin = mix(ink, b0, 0.15);
    const lv = (x, y) => (hf(x, y) - lo) / span * levels;
    const c = raster((x, y, out) => {
      const h = (hf(x, y) - lo) / span;
      const gx = (hf(x + e, y) - hf(x - e, y)) / (2 * e * span), gy = (hf(x, y + e) - hf(x, y - e)) / (2 * e * span);
      const sh = 1 + Math.max(-0.07, Math.min(0.07, (-gx * 0.6 - gy * 0.8) * 16));    // слабая отмывка
      const t = smooth(0.4, 0.62, h);
      const r = (b0[0] + (b1[0] - b0[0]) * t) * sh, g = (b0[1] + (b1[1] - b0[1]) * t) * sh, b = (b0[2] + (b1[2] - b0[2]) * t) * sh;
      const v = h * levels, fl = Math.floor(v + 0.5), dv = Math.abs(v - fl);
      const pd = dv / (Math.hypot(gx, gy) * levels / S + 1e-6);                         // расстояние до линии в пикселях
      const idx = fl % 5 === 0, hw = idx ? 1.5 : 0.55;
      const la = (1 - smooth(hw - 0.55, hw + 0.75, pd)) * (idx ? 0.95 : 0.5), lc = idx ? hiInk : thin;
      out[0] = r + (lc[0] - r) * la; out[1] = g + (lc[1] - g) * la; out[2] = b + (lc[2] - b) * la;
    });
    const ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // координатная сетка — едва заметная, без подписей
    ctx.strokeStyle = css(ink, 0.13); ctx.lineWidth = 0.5; ctx.beginPath();
    for (let x = 32; x < W; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 32; y < H; y += 64) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    // тропа
    ctx.save();
    ctx.setLineDash([4, 2.6]); ctx.strokeStyle = css(mix(ink, [210, 96, 52], 0.55), 0.85); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(-5, 40 + R() * 110);
    for (let i = 1; i <= 4; i++) ctx.quadraticCurveTo(i * 128 - 64, 20 + R() * (H - 40), i * 128, 30 + R() * 130);
    ctx.stroke();
    ctx.restore();
    // вершины — треугольники без подписей
    ctx.fillStyle = css(hiInk, 0.9);
    hills.forEach((q) => {
      if (q[3] < 0) return;
      let best = null;
      for (let y = q[1] - 30; y <= q[1] + 30; y += 3) for (let x = q[0] - 40; x <= q[0] + 40; x += 3) {
        if (x < 10 || x > W - 10 || y < 10 || y > H - 10) continue;
        const v = hf(x, y); if (!best || v > best[2]) best = [x, y, v];
      }
      if (!best) return;
      ctx.beginPath(); ctx.moveTo(best[0], best[1] - 3.4); ctx.lineTo(best[0] + 3, best[1] + 2); ctx.lineTo(best[0] - 3, best[1] + 2); ctx.closePath(); ctx.fill();
    });
    // подписи высот только на утолщённых горизонталях: не больше 4, вдоль линии, с «вырезом» в линии
    ctx.font = '700 8.5px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let placed = 0;
    [70, 190, 315, 440].forEach((x0) => {
      if (placed >= 4) return;
      const x = x0 + (R() - 0.5) * 30;
      for (let y = 24; y < H - 24; y += 1) {
        const a = lv(x, y), b = lv(x, y + 1), k = Math.floor(Math.max(a, b) / 5) * 5;
        if (k <= 0 || (a - k) * (b - k) > 0) continue;
        const gx = lv(x + 1, y) - lv(x - 1, y), gy = lv(x, y + 1) - lv(x, y - 1);
        let ang = Math.atan2(gy, gx) + Math.PI / 2;
        if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        if (Math.abs(ang) > 0.9) continue;
        const txt = String(400 + k * 40);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        const tw = ctx.measureText(txt).width + 4;
        ctx.fillStyle = css(mix(b0, b1, 0.5)); ctx.fillRect(-tw / 2, -4.6, tw, 9.2);
        ctx.fillStyle = css(hiInk); ctx.fillText(txt, 0, 0.4);
        ctx.restore();
        placed++;
        break;
      }
    });
    // репер
    const bx = 200 + R() * 150, by = 40 + R() * 110;
    ctx.strokeStyle = css(hiInk, 0.85); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, TAU); ctx.moveTo(bx - 6, by); ctx.lineTo(bx + 6, by); ctx.moveTo(bx, by - 6); ctx.lineTo(bx, by + 6); ctx.stroke();
    return c;
  }

  function thermal(R, n, n2, n3, col) {
    const P = ramp([tone(col[0], -0.2), mix(col[0], col[3], 0.35), mix(col[0], col[3], 0.7), col[3], mix(col[3], col[1], 0.55), col[1],
      mix(col[1], col[2], 0.55), col[2], tone(col[2], 0.85)]);
    // пятна тепла: [x, y, размер, вытянутость, поворот, сила]; места подобраны под приклад, коробку, магазин, клинок
    const slots = [[72, 102, 50], [196, 52, 40], [262, 140, 40], [354, 64, 48], [458, 130, 38], [150, 122, 26]];
    const src = [];
    slots.forEach((q) => {
      // главное ядро и 2 боковых лепестка — пятно неправильной формы, как тепло на металле
      const x = q[0] + (R() - 0.5) * 28, y = q[1] + (R() - 0.5) * 18, r = q[2] * (0.85 + R() * 0.3);
      src.push([x, y, r, 0.55 + R() * 0.3, R() * Math.PI, 1.05 + R() * 0.12]);
      for (let k = 0; k < 2; k++) {
        const a = R() * TAU, d = r * (0.55 + R() * 0.4);
        src.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, r * (0.45 + R() * 0.25), 0.5 + R() * 0.4, R() * Math.PI, 0.45 + R() * 0.3]);
      }
    });
    // тёплые «дорожки» между соседними пятнами — металл проводит тепло
    const lanes = [];
    for (let i = 0; i + 1 < slots.length; i++) if (R() < 0.6) lanes.push([slots[i][0], slots[i][1], slots[i + 1][0], slots[i + 1][1]]);
    const hf = field(2, (x, y) => {
      const wx = 18 * fbm(n2, x * 0.016, y * 0.026, 3), wy = 13 * fbm(n3, x * 0.016 + 4.1, y * 0.026, 3);
      let v = 0.13 + 0.34 * fbm(n, x * 0.0065, y * 0.012, 3);
      for (let i = 0; i < src.length; i++) {
        const s = src[i], dx = x + wx - s[0], dy = y + wy - s[1], ca = Math.cos(s[4]), sa = Math.sin(s[4]);
        const u = (dx * ca + dy * sa) / s[2], w = (-dx * sa + dy * ca) / (s[2] * s[3]);
        v += s[5] * Math.exp(-(u * u + w * w) * 1.6);
      }
      for (let i = 0; i < lanes.length; i++) {
        const l = lanes[i], ex = l[2] - l[0], ey = l[3] - l[1], ll = ex * ex + ey * ey;
        const t = Math.max(0, Math.min(1, ((x + wx - l[0]) * ex + (y + wy - l[1]) * ey) / ll));
        const px = l[0] + ex * t - x - wx, py = l[1] + ey * t - y - wy;
        v += 0.22 * Math.exp(-(px * px + py * py) / 160);
      }
      return v;
    });
    const NB = 8, e = 1;
    const c = raster((x, y, out) => {
      const tc = hf(x, y) + 0.015 * n3(x * 1.1, y * 1.1), t = clamp01(tc);
      const q = Math.min(NB - 1, Math.floor(t * NB));
      const p = P(q / (NB - 1));
      // тонкий тёмный контур на границе изотерм
      const gx = (hf(x + e, y) - hf(x - e, y)) / (2 * e), gy = (hf(x, y + e) - hf(x, y - e)) / (2 * e);
      const fr = t * NB - Math.floor(t * NB), dd = tc >= 1 ? 9 : Math.min(fr, 1 - fr) / (Math.hypot(gx, gy) * NB / S + 1e-6);
      let k = 1 - (1 - smooth(0.35, 1.1, dd)) * 0.4;
      if (Math.floor(y * S) % 3 === 0) k *= 0.9;                                       // строки развёртки
      out[0] = p[0] * k; out[1] = p[1] * k; out[2] = p[2] * k;
    });
    return c;
  }

  Tex.addGen('topo', function (f, R, n, n2, n3) {
    const col = f.c.map(rgb);
    return col.length >= 4 ? thermal(R, n, n2, n3, col) : topoMap(R, n, n2, n3, col);
  });
})();
