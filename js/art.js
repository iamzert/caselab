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
    const g = GEO[weaponId];
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

  // Перчатки рисуются парой: левая и зеркальная правая
  const GL_L = 130, GL_R = 382;
  function tilt(ctx) { ctx.translate(88, 150); ctx.rotate(-0.14); ctx.translate(-88, -150); }
  function pairDo(ctx, fn) {
    ctx.save(); ctx.translate(GL_R, 2); ctx.scale(-1, 1); tilt(ctx); fn(true); ctx.restore();
    ctx.save(); ctx.translate(GL_L, 0); tilt(ctx); fn(false); ctx.restore();
  }

  // Рамка вокруг силуэта (картинка обрезается по ней — мелкое оружие крупнее в карточках)
  const boxCache = {};
  function weaponBox(weaponId) {
    if (boxCache[weaponId]) return boxCache[weaponId];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
    prep(weaponId).forEach((P) => {
      if (P.role === 't') return;
      const b = P.bb;
      if (GEO[weaponId].pair) { add(GL_L + b.x0, b.y0, GL_L + b.x1, b.y1); add(GL_R - b.x1, b.y0 + 2, GL_R - b.x0, b.y1 + 2); }
      else add(b.x0, b.y0, b.x1, b.y1);
    });
    const m = GEO[weaponId].pair ? 16 : 0; // запас под наклон перчаток
    boxCache[weaponId] = { x0: x0 - 10 - m, y0: y0 - 8, x1: x1 + 12 + m, y1: y1 + 16 + m / 2 };
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
    const parts = prep(weaponId);
    if (GEO[weaponId].pair) pairDo(ctx, (back) => drawParts(ctx, parts, finishId, back ? Object.assign({}, opt, { dim: 0.22 }) : opt));
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
      if (GEO[weaponId].pair) pairDo(x, (back) => relief(x, parts, fin, m[1], back));
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
    if (GEO[weaponId].pair) pairDo(ctx, paintMask); else paintMask();
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

  // ---------- Кейс (оружейный ящик) ----------
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function poly(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
  }
  function metalGrad(ctx, y0, y1, light) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    if (light) { g.addColorStop(0, '#f2f4f7'); g.addColorStop(0.45, '#aab1ba'); g.addColorStop(1, '#5b616a'); }
    else { g.addColorStop(0, '#4a5059'); g.addColorStop(0.5, '#2a2e34'); g.addColorStop(1, '#16181b'); }
    return g;
  }

  // Рельеф ящика: корпус — ровный фон, детали приподняты, швы и пазы утоплены
  function crateRelief(x, mode, shape) {
    const H = mode === 'h';
    const v = (h, g) => gray(H ? h : g);
    x.fillStyle = v(0.5, 0.3); x.fillRect(0, 0, 512, 384);
    x.lineCap = 'round'; x.lineJoin = 'round';
    // кромка крышки и шов
    x.fillStyle = v(0.56, 0.32); x.fillRect(60, 150, 332, 54);
    x.fillStyle = v(0.3, 0.1); x.fillRect(60, 204, 332, 4);
    poly(x, [[392, 204], [452, 160], [452, 164], [392, 208]]); x.fill();
    // рёбра жёсткости
    [244, 284].forEach((y) => {
      x.fillStyle = v(0.62, 0.35); x.fillRect(78, y, 296, 9);
      poly(x, [[392, y + 2], [452, y - 44], [452, y - 38], [392, y + 8]]); x.fill();
    });
    // уголки
    x.fillStyle = v(0.78, 0.85);
    CORNERS.forEach((pts) => { poly(x, pts); x.fill(); });
    // винты
    SCREWS.forEach((p) => {
      if (H) { const g = x.createRadialGradient(p[0], p[1], 0, p[0], p[1], 3.5); g.addColorStop(0, gray(1)); g.addColorStop(1, gray(0.8)); x.fillStyle = g; }
      else x.fillStyle = gray(0.95);
      x.beginPath(); x.arc(p[0], p[1], 3.5, 0, Math.PI * 2); x.fill();
    });
    // защёлки
    [124, 292].forEach((lx) => {
      x.fillStyle = v(0.86, 0.95); rrect(x, lx, 184, 36, 42, 5); x.fill();
      x.fillStyle = v(0.7, 0.7); rrect(x, lx + 7, 191, 22, 28, 4); x.fill();
      x.fillStyle = v(0.9, 0.95); rrect(x, lx + 9, 172, 18, 12, 3); x.fill();
    });
    // ручка
    x.fillStyle = v(0.7, 0.4);
    poly(x, [[206, 134], [226, 134], [240, 122], [220, 122]]); x.fill();
    poly(x, [[296, 134], [316, 134], [330, 122], [310, 122]]); x.fill();
    x.lineWidth = 12; x.strokeStyle = v(0.92, 0.5);
    x.beginPath(); x.moveTo(224, 128); x.bezierCurveTo(232, 100, 310, 100, 316, 128); x.stroke();
    // боковая ручка
    x.fillStyle = v(0.72, 0.4); poly(x, [[404, 238], [440, 212], [440, 226], [404, 252]]); x.fill();
    // наклейка — тонкая, почти без рельефа и блеска
    x.save(); x.translate(300, 160); x.rotate(-0.02); x.fillStyle = v(0.6, 0.05); x.fillRect(0, 0, 72, 30); x.restore();
    // эмблема: приподнятая рамка и утопленное поле
    x.fillStyle = v(0.76, 0.75); shape(x, 1); x.fill();
    x.fillStyle = v(0.6, 0.55); shape(x, 0.84); x.fill();
  }

  const CORNERS = [[[60, 150], [98, 150], [98, 160], [70, 160], [70, 188], [60, 188]],
    [[392, 150], [354, 150], [354, 160], [382, 160], [382, 188], [392, 188]],
    [[60, 330], [98, 330], [98, 320], [70, 320], [70, 292], [60, 292]],
    [[392, 330], [354, 330], [354, 320], [382, 320], [382, 292], [392, 292]]];
  const SCREWS = [[66, 156], [386, 156], [66, 324], [386, 324]];

  // Контур эмблемы ящика
  function emblemPath(x, kind, cx, cy, k) {
    x.beginPath();
    switch (kind) {
      case 'circle': x.arc(cx, cy, 44 * k, 0, Math.PI * 2); break;
      case 'shield':
        x.moveTo(cx - 44 * k, cy - 40 * k); x.lineTo(cx + 44 * k, cy - 40 * k); x.lineTo(cx + 44 * k, cy - 2 * k);
        x.quadraticCurveTo(cx + 44 * k, cy + 32 * k, cx, cy + 46 * k);
        x.quadraticCurveTo(cx - 44 * k, cy + 32 * k, cx - 44 * k, cy - 2 * k); x.closePath(); break;
      case 'hex':
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x.lineTo(cx + 46 * k * Math.cos(a), cy + 42 * k * Math.sin(a)); }
        x.closePath(); break;
      default:
        x.moveTo(cx, cy - 46 * k); x.lineTo(cx + 46 * k, cy); x.lineTo(cx, cy + 46 * k); x.lineTo(cx - 46 * k, cy); x.closePath();
    }
  }

  function buildCrate(c) {
    // Рисуем в координатах 512×384, но обрезаем пустые поля вокруг ящика
    const cv = mk(432, 268), ctx = cv.getContext('2d');
    ctx.translate(-40, -84);
    const a = c.art, main = a[0], acc = a[1];
    const shade = Tex.shade;
    const tex = c.paint ? Tex.get(c.paint) : null;
    const grime = Tex.grime();

    // тень на полу
    ctx.save();
    ctx.translate(256, 336); ctx.scale(1, 0.16);
    const sg = ctx.createRadialGradient(0, 0, 10, 0, 0, 240);
    sg.addColorStop(0, 'rgba(0,0,0,.6)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, 240, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const FRONT = () => rrect(ctx, 60, 150, 332, 180, 10);
    const TOP = () => poly(ctx, [[60, 152], [392, 152], [452, 106], [124, 104]]);
    const SIDE = () => poly(ctx, [[390, 152], [452, 106], [452, 288], [392, 330]]);

    function face(pathFn, base, x, y, w, h, over) {
      ctx.save();
      pathFn(); ctx.clip();
      ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
      if (tex) ctx.drawImage(tex, x, y, w, h);
      ctx.fillStyle = Tex.polymer(ctx); ctx.fillRect(x, y, w, h);   // литой пластик
      const g = ctx.createLinearGradient(over[0], over[1], over[2], over[3]);
      over[4].forEach((s) => g.addColorStop(s[0], s[1]));
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.3; ctx.drawImage(grime, x, y, w, h); ctx.globalAlpha = 1;
      ctx.restore();
    }

    face(SIDE, shade(main, -0.32), 390, 104, 64, 228, [390, 0, 452, 0, [[0, 'rgba(0,0,0,.42)'], [1, 'rgba(0,0,0,.6)']]]);
    face(TOP, shade(main, 0.16), 60, 104, 392, 50, [0, 152, 0, 104, [[0, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,.04)']]]);
    face(FRONT, main, 60, 150, 332, 180, [0, 150, 0, 330, [[0, 'rgba(255,255,255,.1)'], [0.3, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.3)']]]);

    // крышка: шов и выпуклость
    ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(62, 152, 328, 52);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(60, 204, 332, 4);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(60, 208, 332, 1.5);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; poly(ctx, [[392, 204], [452, 160], [452, 164], [392, 208]]); ctx.fill();

    // рёбра жёсткости
    [244, 284].forEach((y) => {
      const g = ctx.createLinearGradient(0, y, 0, y + 9);
      g.addColorStop(0, 'rgba(255,255,255,.2)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.4)');
      ctx.fillStyle = g; ctx.fillRect(78, y, 296, 9);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; poly(ctx, [[392, y + 2], [452, y - 44], [452, y - 38], [392, y + 8]]); ctx.fill();
    });

    // грани
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.moveTo(66, 151); ctx.lineTo(386, 151); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.moveTo(392, 152); ctx.lineTo(392, 326); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(126, 105); ctx.lineTo(450, 106); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.moveTo(61, 160); ctx.lineTo(61, 322); ctx.stroke();

    // потёртости по кромкам
    const RS = Tex.rng(Math.floor(hash01('scuff' + c.id) * 1e9) + 3);
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const top = RS() < 0.5;
      const x0 = top ? 70 + RS() * 310 : (RS() < 0.5 ? 61 + RS() * 4 : 388 + RS() * 3);
      const y0 = top ? 151 + RS() * 3 : 160 + RS() * 160;
      const len = 3 + RS() * 12;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.12 + RS() * 0.2) + ')';
      ctx.lineWidth = 0.6 + RS() * 1.2;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      if (top) ctx.lineTo(x0 + len, y0 + (RS() - 0.5) * 2); else ctx.lineTo(x0 + (RS() - 0.5) * 2, y0 + len);
      ctx.stroke();
    }

    // металлические уголки с винтами
    ctx.fillStyle = metalGrad(ctx, 150, 330, false);
    CORNERS.forEach((pts) => {
      poly(ctx, pts); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.stroke();
    });
    SCREWS.forEach((p) => {
      const g = ctx.createRadialGradient(p[0] - 1, p[1] - 1, 0.5, p[0], p[1], 3.5);
      g.addColorStop(0, '#f0f2f5'); g.addColorStop(1, '#5b616a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2); ctx.fill();
    });

    // защёлки
    [124, 292].forEach((x) => {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; rrect(ctx, x + 2, 186, 36, 42, 5); ctx.fill();
      ctx.fillStyle = metalGrad(ctx, 184, 226, true); rrect(ctx, x, 184, 36, 42, 5); ctx.fill();
      ctx.fillStyle = metalGrad(ctx, 190, 222, false); rrect(ctx, x + 7, 191, 22, 28, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 9, 193, 18, 2);
      ctx.fillStyle = metalGrad(ctx, 172, 184, true); rrect(ctx, x + 9, 172, 18, 12, 3); ctx.fill();
      ctx.fillStyle = '#1a1c20'; ctx.beginPath(); ctx.arc(x + 18, 222, 3, 0, Math.PI * 2); ctx.fill();
    });

    // ручка сверху
    ctx.fillStyle = '#1c1e22';
    poly(ctx, [[206, 134], [226, 134], [240, 122], [220, 122]]); ctx.fill();
    poly(ctx, [[296, 134], [316, 134], [330, 122], [310, 122]]); ctx.fill();
    ctx.lineCap = 'round';
    ctx.lineWidth = 12; ctx.strokeStyle = '#15171a';
    ctx.beginPath(); ctx.moveTo(224, 128); ctx.bezierCurveTo(232, 100, 310, 100, 316, 128); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(228, 122); ctx.bezierCurveTo(236, 101, 306, 101, 312, 122); ctx.stroke();

    // боковая ручка и ножки
    ctx.fillStyle = '#16181b';
    poly(ctx, [[404, 238], [440, 212], [440, 226], [404, 252]]); ctx.fill();
    ctx.fillRect(74, 328, 40, 8); ctx.fillRect(338, 328, 40, 8);
    poly(ctx, [[430, 296], [446, 284], [446, 292], [430, 304]]); ctx.fill();

    // наклейка со штрихкодом
    ctx.save();
    ctx.translate(300, 160); ctx.rotate(-0.02);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(2, 2, 72, 30);
    ctx.fillStyle = '#e8ebee'; ctx.fillRect(0, 0, 72, 30);
    const R = Tex.rng(Math.floor(hash01(c.id) * 1e9) + 7);
    ctx.fillStyle = '#111';
    for (let x = 5; x < 52; x += 2 + Math.floor(R() * 3)) ctx.fillRect(x, 5, 1 + Math.floor(R() * 2), 14);
    ctx.font = 'bold 7px Arial, sans-serif';
    ctx.fillText('CL-' + String(CASES.indexOf(c) + 1).padStart(2, '0'), 5, 27);
    ctx.fillStyle = acc; ctx.fillRect(56, 5, 11, 20);
    ctx.restore();

    // маркировка на боку
    ctx.save();
    ctx.translate(404, 314); ctx.transform(1, -0.767, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillText('CASE·LAB', 0, 0);
    ctx.restore();

    // эмблема
    const cx = 226, cy = 268;
    const shapePath = (k) => emblemPath(ctx, a[2], cx, cy, k);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    shapePath(1);
    const eg = ctx.createLinearGradient(0, cy - 46, 0, cy + 46);
    eg.addColorStop(0, shade(acc, 0.35)); eg.addColorStop(0.5, acc); eg.addColorStop(1, shade(acc, -0.25));
    ctx.fillStyle = eg; ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.45)'; shapePath(1); ctx.stroke();
    shapePath(0.84);
    const ig = ctx.createRadialGradient(cx, cy - 20, 5, cx, cy, 50);
    ig.addColorStop(0, shade(main, -0.25)); ig.addColorStop(1, shade(main, -0.7));
    ctx.fillStyle = ig; ctx.fill();
    ctx.save();
    shapePath(0.84); ctx.clip();
    ctx.translate(cx - 40, cy - 16); ctx.scale(80 / W, 80 / W);
    if (a[4]) drawWeapon(ctx, a[3], a[4], { px: 80 / W, shadow: false });
    else drawWeapon(ctx, a[3], null, { mono: acc });
    ctx.restore();

    // объём деталей
    const hc = mk(432, 268), gc = mk(432, 268);
    [[hc, 'h'], [gc, 'g']].forEach((m) => {
      const x = m[0].getContext('2d');
      x.translate(-40, -84);
      crateRelief(x, m[1], (xx, k) => emblemPath(xx, a[2], cx, cy, k));
    });
    relight(cv, hc, gc, { mask: 'alpha', k: 5, r: 1.1, spec: 0.8, ao: 1.6 });
    return cv;
  }

  // ---------- Кэш и очередь ----------
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
      else cv = buildCrate(CASE_BY_ID[p[1]]);
    } catch (e) {
      console.error('Art render failed', key, e);
      finish(key, BLANK);
      return;
    }
    if (cv.toBlob) cv.toBlob((b) => finish(key, b ? URL.createObjectURL(b) : cv.toDataURL()), 'image/png');
    else finish(key, cv.toDataURL('image/png'));
  }

  function work() {
    scheduled = false;
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 14) produce(queue.shift());
    if (queue.length) schedule();
  }
  function schedule() { if (!scheduled) { scheduled = true; setTimeout(work, 0); } }

  function request(key) {
    if (urls[key] || pending[key]) return;
    pending[key] = 1;
    queue.push(key);
    schedule();
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
  };
})();
