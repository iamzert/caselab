'use strict';

// Рендерер предметов и кейсов на canvas. Готовые картинки кэшируются как blob-URL
// и вставляются в интерфейс обычными <img> (быстро и плавно при анимации).
const Art = (function () {
  const W = Tex.W, H = Tex.H, S = Tex.S;
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const urls = {}, pending = {}, queue = [];
  let scheduled = false;
  let waiters = [];

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ---------- Подготовка геометрии ----------
  // Пока у вида оружия нет своей модели, рисуется похожая того же типа — пустых картинок не бывает.
  // Как только модель появится в js/geo_*.js, она заменит запасную сама.
  const FALLBACK = {
    m9: 'bay', talon: 'kar', skel: 'hunt', classic: 'hunt', kukri: 'falc', nomad: 'flip', para: 'hunt', bear: 'flip',
    surv: 'bowie', nav: 'flip', gut: 'hunt', push: 'stil', smg9: 'smg10', smg7: 'smg10', smg5: 'smg45', bzn: 'smg45',
    glmo: 'gltc', gldr: 'glsp', glsh: 'gltc', glwr: 'glsp',
  };
  const TYPE_FALLBACK = { pistol: 'p17', smg: 'smg10', rifle: 'ar47', sniper: 'sr08', shotgun: 'sg12', mg: 'm249', knife: 'hunt', gloves: 'glsp' };
  function geo(id) {
    return GEO[id] || GEO[FALLBACK[id]] || (WEAPONS[id] && GEO[TYPE_FALLBACK[WEAPONS[id].type]]) || null;
  }
  function bboxOf(d) {
    const t = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) || [];
    let i = 0, cmd = 'M', x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    while (i < t.length) {
      if (/[a-zA-Z]/.test(t[i])) { cmd = t[i++].toUpperCase(); if (cmd === 'Z') continue; }
      if (cmd === 'A') { const rx = +t[i], ry = +t[i + 1], x = +t[i + 5], y = +t[i + 6]; add(x - rx, y - ry); add(x + rx, y + ry); i += 7; }
      else if (cmd === 'C') { add(+t[i], +t[i + 1]); add(+t[i + 2], +t[i + 3]); add(+t[i + 4], +t[i + 5]); i += 6; }
      else if (cmd === 'Q') { add(+t[i], +t[i + 1]); add(+t[i + 2], +t[i + 3]); i += 4; }
      else if (cmd === 'M' || cmd === 'L' || cmd === 'T') { add(+t[i], +t[i + 1]); i += 2; }
      else i++;
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  const prepCache = {};
  function prep(weaponId) {
    if (prepCache[weaponId]) return prepCache[weaponId];
    const g = geo(weaponId);
    const list = (g.pair ? g.parts : g).map((p) => {
      if (p[0] === 'o') {
        const path = new Path2D();
        path.arc(p[1], p[2], p[3], 0, Math.PI * 2);
        return { role: 'o', path: path, cx: p[1], cy: p[2], r: p[3], bb: { x0: p[1] - p[3], y0: p[2] - p[3], x1: p[1] + p[3], y1: p[2] + p[3] } };
      }
      if (p[0] === 't') {
        return { role: 't', x: p[1], y: p[2], text: p[3], size: p[4], bb: { x0: p[1], y0: p[2] - p[4], x1: p[1] + p[3].length * p[4] * 0.6, y1: p[2] } };
      }
      return { role: p[0], path: new Path2D(p[1]), w: p[2] || 0, bb: bboxOf(p[1]) };
    });
    prepCache[weaponId] = list;
    return list;
  }

  // Пары: перчатки (левая и зеркальная правая) и парное оружие. Задняя копия рисуется первой и темнее.
  // pair: true — расклад перчаток; { back, front } — свой расклад: { x, y, rot, cx, cy, s, flip }.
  const GLOVE_PAIR = {
    back: { x: 382, y: 2, flip: true, rot: -0.14, cx: 88, cy: 150 },
    front: { x: 130, y: 0, rot: -0.14, cx: 88, cy: 150 },
  };
  // Матрицы [a, b, c, d, e, f] как у canvas: A·B — сначала B, потом A
  function mmul(A, B) {
    return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  }
  function pairMatrix(p) {
    let m = [1, 0, 0, 1, p.x || 0, p.y || 0];
    if (p.flip) m = mmul(m, [-1, 0, 0, 1, 0, 0]);
    if (p.s && p.s !== 1) m = mmul(m, [p.s, 0, 0, p.s, 0, 0]);
    if (p.rot) {
      const cx = p.cx || 0, cy = p.cy || 0, c = Math.cos(p.rot), s = Math.sin(p.rot);
      m = mmul(mmul(mmul(m, [1, 0, 0, 1, cx, cy]), [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    }
    return m;
  }
  const pairCache = {};
  function pairMats(weaponId) {
    if (pairCache[weaponId]) return pairCache[weaponId];
    const p = geo(weaponId).pair === true ? GLOVE_PAIR : geo(weaponId).pair;
    pairCache[weaponId] = { back: pairMatrix(p.back || {}), front: pairMatrix(p.front || {}) };
    return pairCache[weaponId];
  }
  function pairDo(ctx, weaponId, fn) {
    const M = pairMats(weaponId);
    ctx.save(); ctx.transform(M.back[0], M.back[1], M.back[2], M.back[3], M.back[4], M.back[5]); fn(true); ctx.restore();
    ctx.save(); ctx.transform(M.front[0], M.front[1], M.front[2], M.front[3], M.front[4], M.front[5]); fn(false); ctx.restore();
  }

  // Рамка вокруг силуэта (картинка обрезается по ней — мелкое оружие крупнее в карточках)
  const boxCache = {};
  function weaponBox(weaponId) {
    if (boxCache[weaponId]) return boxCache[weaponId];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    const mats = geo(weaponId).pair ? pairMats(weaponId) : null;
    prep(weaponId).forEach((P) => {
      if (P.role === 't') return;
      const b = P.bb;
      if (!mats) { add(b.x0, b.y0); add(b.x1, b.y1); return; }
      [mats.back, mats.front].forEach((m) => {
        [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].forEach((q) => add(m[0] * q[0] + m[2] * q[1] + m[4], m[1] * q[0] + m[3] * q[1] + m[5]));
      });
    });
    boxCache[weaponId] = { x0: x0 - 10, y0: y0 - 8, x1: x1 + 12, y1: y1 + 16 };
    return boxCache[weaponId];
  }

  // ---------- Материалы ----------
  const MAT = {
    m: [['#666e78', 0], ['#3e444c', 0.3], ['#262a30', 0.65], ['#15171b', 1]],
    l: [['#f4f6f8', 0], ['#c3c9d1', 0.4], ['#8a919b', 0.75], ['#5d636c', 1]],
    k: [['#3d4148', 0], ['#272a2f', 0.45], ['#17191c', 1]],
    g: [['#d6efff', 0], ['#4d6fe0', 0.45], ['#1a1240', 1]],
  };
  // Цилиндр (стволы, трубки): яркий блик ближе к верху
  const CYL = [['#1b1e22', 0], ['#5e6670', 0.16], ['#b4bbc4', 0.3], ['#4a5058', 0.45], ['#22262b', 0.78], ['#0f1012', 1]];
  function matGrad(ctx, P) {
    const g = ctx.createLinearGradient(0, P.bb.y0, 0, P.bb.y1);
    const h = P.bb.y1 - P.bb.y0, w = P.bb.x1 - P.bb.x0;
    (P.role === 'm' && h < 20 && w > 3 * h ? CYL : MAT[P.role]).forEach((s) => g.addColorStop(s[1], s[0]));
    return g;
  }

  // Фаска: светлая кромка сверху и внутренняя тень снизу — даёт объём
  function bevel(ctx, P, px, k) {
    const bb = P.bb, pad = 14;
    if ((bb.x1 - bb.x0) * (bb.y1 - bb.y0) < 120) return;
    const frame = new Path2D();
    frame.rect(bb.x0 - pad, bb.y0 - pad, bb.x1 - bb.x0 + pad * 2, bb.y1 - bb.y0 + pad * 2);
    frame.addPath(P.path);
    ctx.save();
    ctx.clip(P.path, 'evenodd');
    ctx.fillStyle = '#000';
    ctx.shadowColor = 'rgba(255,255,255,' + 0.5 * k + ')';
    ctx.shadowBlur = 2 * px; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1.5 * px;
    ctx.fill(frame, 'evenodd');
    ctx.shadowColor = 'rgba(0,0,0,' + 0.65 * k + ')';
    ctx.shadowBlur = 5 * px; ctx.shadowOffsetY = -2.5 * px;
    ctx.fill(frame, 'evenodd');
    ctx.restore();
  }

  function contactFill(ctx, P, style, px) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 4 * px;
    ctx.shadowOffsetY = 1.2 * px;
    ctx.fillStyle = style;
    ctx.fill(P.path, 'evenodd');
    ctx.restore();
  }

  function shadeFill(ctx, P, k) {
    const g = ctx.createLinearGradient(0, P.bb.y0, 0, P.bb.y1);
    g.addColorStop(0, 'rgba(255,255,255,' + 0.4 * k + ')');
    g.addColorStop(0.1, 'rgba(255,255,255,' + 0.14 * k + ')');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(0.75, 'rgba(0,0,0,' + 0.14 * k + ')');
    g.addColorStop(1, 'rgba(0,0,0,' + 0.48 * k + ')');
    ctx.fillStyle = g;
    ctx.fill(P.path, 'evenodd');
  }

  function sheen(ctx, P, gloss) {
    const g = ctx.createLinearGradient(0, P.bb.y0, 0, P.bb.y1);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.1, 'rgba(255,255,255,' + 0.38 * gloss + ')');
    g.addColorStop(0.24, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fill(P.path, 'evenodd');
    const d = ctx.createLinearGradient(150, 0, 270, 192);
    d.addColorStop(0, 'rgba(255,255,255,0)');
    d.addColorStop(0.5, 'rgba(255,255,255,' + 0.17 * gloss + ')');
    d.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = d;
    ctx.fill(P.path, 'evenodd');
  }

  function outline(ctx, P) {
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(0,0,0,.38)';
    ctx.stroke(P.path);
  }

  function dimRect(ctx, P, a) {
    ctx.fillStyle = 'rgba(0,0,0,' + a + ')';
    ctx.fillRect(P.bb.x0 - 2, P.bb.y0 - 2, P.bb.x1 - P.bb.x0 + 4, P.bb.y1 - P.bb.y0 + 4);
  }

  // ---------- Отрисовка оружия ----------
  // opt: { px — пикселей на единицу, shadow, mono — цвет силуэта, dim — затемнение }
  function drawParts(ctx, parts, finishId, opt) {
    const px = opt.px || S;
    const mono = opt.mono;
    const fin = finishId ? FINISHES[finishId] : null;
    const tex = fin && !mono ? Tex.get(finishId) : null;
    const gloss = fin ? fin.gloss || 0 : 0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (!mono && opt.shadow !== false) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 12 * px;
      ctx.shadowOffsetY = 8 * px;
      ctx.fillStyle = '#000';
      parts.forEach((P) => { if ('pqmlkgo'.indexOf(P.role) >= 0) ctx.fill(P.path, 'evenodd'); });
      ctx.restore();
    }

    parts.forEach((P) => {
      const r = P.role;
      if (mono) {
        if (r === 's') { ctx.lineWidth = P.w; ctx.strokeStyle = mono; ctx.stroke(P.path); }
        else if ('pqmlkgo'.indexOf(r) >= 0) { ctx.fillStyle = mono; ctx.fill(P.path, 'evenodd'); }
        return;
      }
      switch (r) {
        case 'p': case 'q':
          contactFill(ctx, P, fin.c[0], px);
          ctx.save();
          ctx.clip(P.path, 'evenodd');
          ctx.drawImage(tex, 0, 0, W, H);
          if (r === 'q') dimRect(ctx, P, 0.3);
          if (opt.dim) dimRect(ctx, P, opt.dim);
          ctx.restore();
          shadeFill(ctx, P, 0.85);
          if (gloss) sheen(ctx, P, gloss);
          bevel(ctx, P, px, 0.4);
          outline(ctx, P);
          break;
        case 'm': case 'l': case 'k': case 'g':
          contactFill(ctx, P, matGrad(ctx, P), px);
          if (r === 'm') { ctx.fillStyle = Tex.brushed(ctx); ctx.fill(P.path, 'evenodd'); }
          if (r === 'k') { ctx.fillStyle = Tex.polymer(ctx); ctx.fill(P.path, 'evenodd'); }
          if (opt.dim) { ctx.save(); ctx.clip(P.path, 'evenodd'); dimRect(ctx, P, opt.dim); ctx.restore(); }
          shadeFill(ctx, P, r === 'k' ? 0.5 : 0.8);
          bevel(ctx, P, px, 0.3);
          outline(ctx, P);
          break;
        case 't':
          ctx.font = '600 ' + P.size + 'px Arial, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillText(P.text, P.x, P.y + 0.7);
          ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(P.text, P.x, P.y);
          break;
        case 's':
          ctx.lineWidth = P.w; ctx.strokeStyle = '#1f2227'; ctx.stroke(P.path);
          ctx.lineWidth = P.w * 0.35; ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.stroke(P.path);
          break;
        case 'd':
          ctx.lineWidth = P.w || 1.2; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke(P.path);
          break;
        case 'h':
          ctx.lineWidth = P.w || 1.2; ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.stroke(P.path);
          break;
        case 'e':
          ctx.save(); ctx.setLineDash([4, 3]); ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.stroke(P.path); ctx.restore();
          break;
        case 'o': {
          const g = ctx.createRadialGradient(P.cx - P.r * 0.35, P.cy - P.r * 0.35, P.r * 0.1, P.cx, P.cy, P.r);
          g.addColorStop(0, '#f1f3f6'); g.addColorStop(0.55, '#9aa1ab'); g.addColorStop(1, '#4b5058');
          ctx.fillStyle = g; ctx.fill(P.path);
          ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke(P.path);
          break;
        }
      }
    });
  }

  function drawWeapon(ctx, weaponId, finishId, opt) {
    opt = opt || {};
    if (!geo(weaponId)) return;                          // модели ещё нет — эмблема ящика просто без оружия
    if (finishId && !FINISHES[finishId]) { finishId = null; opt = Object.assign({}, opt, { mono: opt.mono || '#9aa3ad' }); }
    const parts = prep(weaponId);
    if (geo(weaponId).pair) pairDo(ctx, weaponId, (back) => drawParts(ctx, parts, finishId, back ? Object.assign({}, opt, { dim: 0.22 }) : opt));
    else drawParts(ctx, parts, finishId, opt);
  }

  // ---------- Объёмный свет ----------
  // Карта высот: каждая деталь — плато своей высоты, швы, гравировка и пазы — канавки.
  // После размытия кромки становятся покатыми; по наклону считаются нормали, а по ним —
  // рассеянный свет, блики (сила зависит от карты блеска) и затенение впадин.
  const HT = { p: 0.74, q: 0.7, m: 0.8, l: 0.86, k: 0.72, g: 0.92 };
  const GLS = { m: 0.55, l: 0.95, k: 0.14, g: 1 };
  const gray = (v) => { const n = Math.max(0, Math.min(255, Math.round(v * 255))); return 'rgb(' + n + ',' + n + ',' + n + ')'; };

  function relief(ctx, parts, fin, mode, back) {
    const pg = 0.2 + 0.72 * (fin ? fin.gloss || 0 : 0);
    const off = back ? -0.12 : 0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    parts.forEach((P, i) => {
      const r = P.role;
      if (HT[r] != null) {
        if (mode === 'h') {
          ctx.fillStyle = gray(HT[r] + i * 0.0015 + off); ctx.fill(P.path, 'evenodd');
          ctx.lineWidth = 1.1; ctx.strokeStyle = gray(0.34 + off); ctx.stroke(P.path);
        } else { ctx.fillStyle = gray(r === 'p' || r === 'q' ? pg : GLS[r]); ctx.fill(P.path, 'evenodd'); }
      } else if (r === 's') {
        ctx.lineWidth = P.w; ctx.strokeStyle = gray(mode === 'h' ? 0.88 + off : 0.6); ctx.stroke(P.path);
      } else if (r === 'd' && mode === 'h') {
        ctx.lineWidth = (P.w || 1.2) + 0.4; ctx.strokeStyle = gray(0.46 + off); ctx.stroke(P.path);
      } else if (r === 'o') {
        if (mode === 'h') {
          const g = ctx.createRadialGradient(P.cx, P.cy, 0, P.cx, P.cy, P.r);
          g.addColorStop(0, gray(1 + off)); g.addColorStop(1, gray(0.8 + off));
          ctx.fillStyle = g;
        } else ctx.fillStyle = gray(0.9);
        ctx.fill(P.path);
      } else if (r === 't' && mode === 'h') {
        ctx.font = '600 ' + P.size + 'px Arial, sans-serif';
        ctx.fillStyle = gray(0.5 + off); ctx.fillText(P.text, P.x, P.y);
      }
    });
  }

  // Быстрое размытие (скользящее среднее по строкам и столбцам)
  function blur(src, w, h, r) {
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

  const unit = (v) => { const n = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / n); };
  const LV = unit([-0.5, -0.8, 0.62]);              // свет сверху слева, чуть спереди
  const HV = unit([LV[0], LV[1], LV[2] + 1]);       // полувектор для бликов
  const AMB = 0.4, KD = 0.66, FLAT = AMB + KD * LV[2];

  // opt: { k — сила наклона, spec — сила бликов, ao — сила затенения впадин, r — радиус скругления }
  function relight(c, hc, gc, opt) {
    opt = opt || {};
    const w = c.width, h = c.height, n = w * h;
    const ctx = c.getContext('2d');
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const hd = hc.getContext('2d').getImageData(0, 0, w, h).data;
    const gd = gc ? gc.getContext('2d').getImageData(0, 0, w, h).data : null;
    const h0 = new Float32Array(n);
    for (let i = 0; i < n; i++) h0[i] = hd[i * 4] / 255;
    const r1 = Math.max(1, Math.round((opt.r || 1.3) * S));
    const h1 = blur(blur(h0, w, h, r1), w, h, r1);
    const h2 = blur(blur(h1, w, h, r1 * 4), w, h, r1 * 4);
    const K = (opt.k || 6) * S;
    const SP = opt.spec != null ? opt.spec : 1;
    const AO = opt.ao != null ? opt.ao : 1.9;
    const byAlpha = opt.mask === 'alpha';   // ящики: свет везде, где есть картинка
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!byAlpha && h0[i] <= 0) continue;
        const p = i * 4;
        if (d[p + 3] < (byAlpha ? 200 : 1)) continue;
        const dx = (h1[i + 1] - h1[i - 1]) * K, dy = (h1[i + w] - h1[i - w]) * K;
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const nx = -dx * inv, ny = -dy * inv, nz = inv;
        const dif = Math.max(0, nx * LV[0] + ny * LV[1] + nz * LV[2]);
        const nh = nx * HV[0] + ny * HV[1] + nz * HV[2];
        const gl = gd ? gd[p] / 255 : 0.5;
        let s = 0;
        if (nh > 0.75 && gl > 0.02) s = Math.pow(nh, 12 + gl * 70) * gl * SP * 255;
        const cav = h2[i] - h1[i];
        const ao = cav > 0 ? Math.max(0.45, 1 - cav * AO) : 1;
        const m = (AMB + KD * dif) / FLAT * ao;
        d[p] = Math.min(255, d[p] * m + s);
        d[p + 1] = Math.min(255, d[p + 1] * m + s);
        d[p + 2] = Math.min(255, d[p + 2] * m + s);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // Рисует карту высот и блеска для оружия (с учётом пары перчаток)
  function reliefMaps(weaponId, finishId, w, h, tf) {
    const parts = prep(weaponId), fin = finishId ? FINISHES[finishId] : null;
    const hc = mk(w, h), gc = mk(w, h);
    [[hc, 'h'], [gc, 'g']].forEach((m) => {
      const x = m[0].getContext('2d');
      x.setTransform(tf[0], tf[1], tf[2], tf[3], tf[4], tf[5]);
      if (geo(weaponId).pair) pairDo(x, weaponId, (back) => relief(x, parts, fin, m[1], back));
      else relief(x, parts, fin, m[1], false);
    });
    return [hc, gc];
  }

  function buildItem(skinId) {
    const s = SKINS[skinId], b = weaponBox(s.w);
    const w = Math.round((b.x1 - b.x0) * S), h = Math.round((b.y1 - b.y0) * S);
    const tf = [S, 0, 0, S, -b.x0 * S, -b.y0 * S];
    const c = mk(w, h), ctx = c.getContext('2d');
    ctx.setTransform(tf[0], tf[1], tf[2], tf[3], tf[4], tf[5]);
    drawWeapon(ctx, s.w, s.f, { px: S });
    const maps = reliefMaps(s.w, s.f, w, h, tf);
    relight(c, maps[0], maps[1]);
    return c;
  }

  // Слой износа: сколы краски только на окрашенных частях (та же рамка, что у предмета)
  function buildWear(weaponId, level) {
    const b = weaponBox(weaponId);
    const c = mk(Math.round((b.x1 - b.x0) * S), Math.round((b.y1 - b.y0) * S)), ctx = c.getContext('2d');
    ctx.setTransform(S, 0, 0, S, -b.x0 * S, -b.y0 * S);
    const parts = prep(weaponId).filter((P) => P.role === 'p' || P.role === 'q');
    const paintMask = () => parts.forEach((P) => { ctx.fillStyle = '#fff'; ctx.fill(P.path, 'evenodd'); });
    if (geo(weaponId).pair) pairDo(ctx, weaponId, paintMask); else paintMask();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(Tex.chips(level), -b.x0 * S, -b.y0 * S);
    if (WEAPONS[weaponId].type === 'gloves') {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(70,55,40,.75)';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }

  // ---------- Кэш между запусками (IndexedDB) ----------
  // Готовые картинки сохраняются в браузере: при следующем запуске они не рисуются заново.
  // ART_VER меняется при любом изменении отрисовки — тогда старый кэш очищается.
  const ART_VER = 'd1';
  // Локальный просмотр (127.0.0.1 / localhost) — без кэша: всегда свежие картинки во время работы над графикой
  const NO_IDB = typeof location !== 'undefined' && /^(127.0.0.1|localhost)$/.test(location.hostname);
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const rq = indexedDB.open('caselab_art', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('img');
        rq.onerror = () => resolve(null);
        rq.onsuccess = () => {
          const d = rq.result;
          try {
            const st = d.transaction('img', 'readwrite').objectStore('img');
            const vr = st.get('__ver');
            vr.onsuccess = () => {
              if (vr.result !== ART_VER) { st.clear(); st.put(ART_VER, '__ver'); }
              resolve(d);
            };
            vr.onerror = () => resolve(d);
          } catch (e) { resolve(null); }
        };
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  function idbGet(key) {
    if (NO_IDB) return Promise.resolve(null);
    return db().then((d) => new Promise((resolve) => {
      if (!d) { resolve(null); return; }
      try {
        const rq = d.transaction('img', 'readonly').objectStore('img').get(key);
        rq.onsuccess = () => resolve(rq.result instanceof Blob ? rq.result : null);
        rq.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    }));
  }
  function idbPut(key, blob) {
    if (NO_IDB) return;
    db().then((d) => { if (d) { try { d.transaction('img', 'readwrite').objectStore('img').put(blob, key); } catch (e) { /* место кончилось — не страшно */ } } });
  }

  // ---------- Очередь отрисовки ----------
  function finish(key, url) {
    urls[key] = url;
    delete pending[key];
    document.querySelectorAll('img[data-art="' + key + '"]').forEach((im) => {
      im.src = url;
      im.removeAttribute('data-art');
      im.classList.remove('pend');
    });
    if (!queue.length && !Object.keys(pending).length) { const w = waiters; waiters = []; w.forEach((f) => f()); }
  }

  function produce(key) {
    const p = key.split(':');
    let cv;
    try {
      if (p[0] === 'i') cv = buildItem(p[1]);
      else if (p[0] === 'w') cv = buildWear(p[1], Number(p[2]));
      else cv = Crate.build(CASE_BY_ID[p[1]]);
    } catch (e) {
      console.error('Art render failed', key, e);
      finish(key, BLANK);
      return;
    }
    if (cv.toBlob) {
      cv.toBlob((b) => {
        if (b) { idbPut(ART_VER + ':' + key, b); finish(key, URL.createObjectURL(b)); } else finish(key, cv.toDataURL());
      }, 'image/png');
    } else finish(key, cv.toDataURL('image/png'));
  }

  // Пока крутится рулетка, не рисуем: анимация должна идти плавно (картинки для неё готовы заранее)
  const busy = () => typeof UI !== 'undefined' && UI.isSpinning && UI.isSpinning();

  function work(deadline) {
    scheduled = false;
    if (!queue.length) return;
    if (busy()) { setTimeout(schedule, 150); return; }
    const t0 = performance.now();
    do produce(queue.shift());
    while (queue.length && (deadline && deadline.timeRemaining ? deadline.timeRemaining() > 8 : performance.now() - t0 < 14));
    if (queue.length) schedule();
  }
  function schedule() {
    if (scheduled || !queue.length) return;
    scheduled = true;
    if (window.requestIdleCallback) requestIdleCallback(work, { timeout: 120 });
    else setTimeout(work, 0);
  }

  // Новые запросы встают в начало очереди (одной пачкой, в своём порядке):
  // то, что сейчас на экране, рисуется раньше того, что запрашивали до этого.
  let batch = null;
  function enqueue(key) {
    if (!batch) {
      batch = [];
      Promise.resolve().then(() => { queue.unshift.apply(queue, batch); batch = null; schedule(); });
    }
    batch.push(key);
  }

  function request(key) {
    if (urls[key] || pending[key]) return;
    pending[key] = 1;
    idbGet(ART_VER + ':' + key).then((blob) => {
      if (urls[key]) return;
      if (blob) finish(key, URL.createObjectURL(blob));
      else enqueue(key);
    });
  }

  function img(key, cls) {
    if (urls[key]) return '<img class="' + cls + '" src="' + urls[key] + '" alt="" draggable="false">';
    request(key);
    return '<img class="' + cls + ' pend" data-art="' + key + '" src="' + BLANK + '" alt="" draggable="false">';
  }

  function wearLevel(f) { return f < 0.07 ? 0 : f < 0.15 ? 1 : f < 0.38 ? 2 : f < 0.45 ? 3 : 4; }

  // ---------- Публичный интерфейс ----------
  function item(skinId, fl) {
    if (SKIN_IMAGES[skinId]) return '<span class="wimg"><img class="wb" src="' + SKIN_IMAGES[skinId] + '" alt="" draggable="false"></span>';
    const lvl = fl == null ? 0 : wearLevel(fl);
    return '<span class="wimg">' + img('i:' + skinId, 'wb') + (lvl ? img('w:' + SKINS[skinId].w + ':' + lvl, 'ww') : '') + '</span>';
  }

  function crate(c) { return img('c:' + c.id, 'crate'); }

  // Заранее отрисовать список ключей; промис завершится, когда очередь опустеет
  function prewarm(keys) {
    keys.forEach(request);
    return new Promise((resolve) => {
      if (!queue.length && !Object.keys(pending).length) resolve();
      else waiters.push(resolve);
    });
  }

  return {
    item: item, crate: crate, prewarm: prewarm,
    itemKey: (id) => 'i:' + id, crateKey: (c) => 'c:' + c.id,
    initDefs: function () {},
    // Синхронная отрисовка без очереди и кэша (для проверки картинок)
    _build: { item: buildItem, wear: buildWear, crate: (id) => Crate.build(CASE_BY_ID[id]) },
    // Общие функции рендера для js/art_crate.js
    _lib: { mk: mk, gray: gray, relight: relight, drawWeapon: drawWeapon, W: W, H: H, S: S },
  };
})();
