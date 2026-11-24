'use strict';

// Кейсы на canvas — настоящие ящики разных типов. Семейства корпусов со своим силуэтом, фурнитурой
// и материалами:
//   mil    — армейский стальной ящик: штамповка, заклёпки, рычажные замки, полозья;
//            варианты — широкий ящик, высокий «цинк» с боковым рычагом, длинный оружейный;
//   flight — кофр: панели из ламината (или карбона), алюминиевые профили, шаровые углы,
//            замки-«бабочки», утопленные ручки;
//   hard   — защитный кейс из матового пластика: литой корпус со скруглёнными углами, откидные
//            замки в нишах, ручка, клапан давления, литые рёбра;
//   crate / pres / trunk — дерево: ящик из досок (трафарет, верёвочные ручки, уголки),
//            шкатулка из ореха под лаком с латунной табличкой, сундук в коже с ремнями;
//   safe   — сейф: толстые стенки, дверца на петлях, кодовый диск или клавиатура, штурвал, болты;
//   lux    — артефактные кофры, у каждого свой силуэт: ларец со сводом в коже, дипломат, футляр-овал
//            в рояльном лаке, восьмигранная шкатулка из корня ореха, реликварий с двускатной кровлей;
//            металл с гравировкой резцом и чеканкой, без колец и свечений.
// Стиль каждого кейса выводится из его данных (раздел, id, цвета, форма эмблемы, оружие, раскраска) —
// детерминированно, без правок data.js. Ножевые кейсы показывают свой нож крупно (окно с поролоном,
// гравировка на табличке, трафарет). Кислотные цвета приглушаются до «дорогих» оттенков, а раскраска
// кейса идёт только вставкой или наклейкой — сами раскраски предметов не меняются.
// Камера справа спереди сверху, свет сверху слева (как у картинок предметов); объём деталей даёт
// relight из art.js по картам высот и блеска. Вызывается из очереди Art (ключ c:<id кейса>):
// Crate.build(c) → canvas 432×268.
const Crate = (function () {
  const { mk, gray, relight, drawWeapon } = Art._lib;
  const CW = 432, CH = 268, TAU = Math.PI * 2;
  const MAXW = 382, MAXH = 224, BASE = 242;      // рамка ящика на холсте и линия пола

  // ---------- Вектора, цвет, случайность ----------
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rgbOf = (c) => (typeof c === 'string' ? Tex.rgb(c) : c);
  function css(c, a) {
    c = rgbOf(c);
    const r = Math.round(clamp(c[0], 0, 255)), g = Math.round(clamp(c[1], 0, 255)), b = Math.round(clamp(c[2], 0, 255));
    return a == null ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  const mixc = (a, b, t) => { a = rgbOf(a); b = rgbOf(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  const mul = (c, k) => { c = rgbOf(c); return [c[0] * k, c[1] * k, c[2] * k]; };
  const WHITE = [255, 255, 255];
  function toHsl(c) {
    c = rgbOf(c);
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
    }
    return [h, s, l];
  }
  function fromHsl(h, s, l) {
    if (!s) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  // «Настоящая краска»: насыщенность не выше smax, светлота в пределах [l0, l1]
  function tame(c, smax, l0, l1) { const h = toHsl(c); return fromHsl(h[0], Math.min(h[1], smax), clamp(h[2], l0, l1)); }
  const lum = (c) => { c = rgbOf(c); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; };
  function seedOf(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 1; }
  const rngOf = (s) => Tex.rng(seedOf(s));
  const pick = (R, a) => a[Math.floor(R() * a.length) % a.length];

  // ---------- Камера ----------
  // Камера справа спереди сверху, чуть повёрнута к ящику: виден перед, правый бок и крышка.
  // Вертикали остаются вертикальными (двухточечная перспектива, как у предметной съёмки).
  const CAM = [450, 370, -900], FOC = 900, YAW = 8 * Math.PI / 180, YC = Math.cos(YAW), YS = Math.sin(YAW);
  let OX = 0, OY = 0, SC = 1;
  function proj(x, y, z) {
    const px = x - CAM[0], py = y - CAM[1], pz = z - CAM[2];
    const k = FOC * SC / (-px * YS + pz * YC);
    return [OX + (px * YC + pz * YS) * k, OY - py * k];
  }
  const P3 = (q) => proj(q[0], q[1], q[2]);
  // Вписать ящик в холст: одна рамка для всех семейств, низ — на линии пола
  function fit(pts) {
    OX = 0; OY = 0; SC = 1;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    pts.forEach((q) => { const p = P3(q); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    SC = Math.min(MAXW / (x1 - x0), MAXH / (y1 - y0));
    OX = CW / 2 - (x0 + x1) / 2 * SC;
    OY = BASE - y1 * SC;
  }
  // пикселей на единицу мира около точки (для шаров и кругов в экранных координатах)
  function pxAt(q) { const a = P3(q), b = proj(q[0] + 1, q[1], q[2]); return Math.hypot(b[0] - a[0], b[1] - a[1]); }

  // ---------- Свет ----------
  // Ключевой свет сверху слева спереди и слабая заливка справа; перед ящика — эталон (1.0)
  const L1 = unit([-0.5, 0.8, -0.55]), L2 = unit([0.85, 0.25, -0.45]);
  const lightRaw = (n) => 0.4 + 0.62 * Math.max(0, dot(n, L1)) + 0.22 * Math.max(0, dot(n, L2));
  const LF0 = lightRaw([0, 0, -1]);
  const lightOf = (n) => lightRaw(n) / LF0;

  // ---------- Слои: цвет (c), карта высот (h), карта блеска (g) ----------
  // Каждая операция повторяется на трёх холстах; по высотам и блеску relight даёт фаски, затенение и блики.
  let LC = null, LH = null, LG = null, POST = [], CUR = null;
  function each(fn) {
    fn2(LC, 'c'); fn2(LH, 'h'); fn2(LG, 'g');
    function fn2(x, m) { x.save(); fn(x, m); x.restore(); }
  }

  // ---------- Грани и тела ----------
  // Грань по углам tl, tr, br, bl (вид снаружи): локальные координаты (s, t) — вправо и вниз по грани
  function faceOf(tl, tr, br, bl) {
    const u = unit(sub(tr, tl)), v = unit(sub(bl, tl)), n = unit(cross(u, v));
    const F = { tl: tl, tr: tr, br: br, bl: bl, u: u, v: v, n: n, w: len(sub(tr, tl)), h: len(sub(bl, tl)), outline: null };
    F.lit = lightOf(n);
    F.vis = dot(n, sub(CAM, tl)) > 0.01;
    F.p = (s, t) => proj(tl[0] + u[0] * s + v[0] * t, tl[1] + u[1] * s + v[1] * t, tl[2] + u[2] * s + v[2] * t);
    // локальная аффинная матрица в точке (s, t): единица грани → пиксели (для мелких деталей и надписей)
    F.at = (x, s, t) => {
      const a = F.p(s, t), b = F.p(s + 1, t), c = F.p(s, t + 1);
      x.setTransform(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1], a[0], a[1]);
    };
    // точный контур по точкам грани (крупные детали — без искажений перспективы)
    F.pp = (x, pts) => { x.beginPath(); pts.forEach((q, i) => { const p = F.p(q[0], q[1]); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.closePath(); };
    F.out = (x) => {
      x.beginPath();
      (F.outline || [tl, tr, br, bl]).forEach((q, i) => { const p = P3(q); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); });
      x.closePath();
    };
    F.lg = (x, s0, t0, s1, t1) => { const a = F.p(s0, t0), b = F.p(s1, t1); return x.createLinearGradient(a[0], a[1], b[0], b[1]); };
    return F;
  }
  function cuboid(x0, x1, y0, y1, z0, z1) {
    const B = {
      x0: x0, x1: x1, y0: y0, y1: y1, z0: z0, z1: z1, w: x1 - x0, h: y1 - y0, d: z1 - z0,
      front: faceOf([x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]),
      right: faceOf([x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [x1, y0, z0]),
      top: faceOf([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]),
      pts: [[x0, y0, z0], [x1, y0, z0], [x0, y1, z0], [x1, y1, z0], [x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1]],
    };
    B.right.zr = [z0, z1, x1, (y0 + y1) / 2];
    return B;
  }
  // Усечённая пирамида (скошенная крышка): низ w0×d0 на y0, верх w1×d1 на y1
  function frustum(w0, d0, w1, d1, y0, y1) {
    const a = w0 / 2, b = d0 / 2, c = w1 / 2, d = d1 / 2;
    return {
      front: faceOf([-c, y1, -d], [c, y1, -d], [a, y0, -b], [-a, y0, -b]),
      right: faceOf([c, y1, -d], [c, y1, d], [a, y0, b], [a, y0, -b]),
      left: faceOf([-c, y1, d], [-c, y1, -d], [-a, y0, -b], [-a, y0, b]),
      back: faceOf([c, y1, d], [-c, y1, d], [-a, y0, b], [a, y0, b]),
      top: faceOf([-c, y1, d], [c, y1, d], [c, y1, -d], [-c, y1, -d]),
      pts: [[-a, y0, -b], [a, y0, -b], [a, y0, b], [-a, y0, b], [-c, y1, -d], [c, y1, -d], [c, y1, d], [-c, y1, d]],
    };
  }
  // Контур в плане (x, z) со скруглёнными углами, против часовой при взгляде сверху
  function rplan(W, D, r, n) {
    const pts = [], C = [[W / 2 - r, -D / 2 + r, -Math.PI / 2], [W / 2 - r, D / 2 - r, 0], [-W / 2 + r, D / 2 - r, Math.PI / 2], [-W / 2 + r, -D / 2 + r, Math.PI]];
    C.forEach((q) => { for (let i = 0; i <= n; i++) { const a = q[2] + i / n * Math.PI / 2; pts.push([q[0] + Math.cos(a) * r, q[1] + Math.sin(a) * r]); } });
    return pts;
  }
  // Литой корпус со скруглёнными вертикальными рёбрами: стенки по сегментам (свет — по нормали каждого)
  function rbox(W, D, r, y0, y1, mat, opt) {
    opt = opt || {};
    const plan = rplan(W, D, r, 5);
    plan.forEach((a, i) => {
      const b = plan[(i + 1) % plan.length], d = unit([b[0] - a[0], 0, b[1] - a[1]]), e = 0.6;
      const F = faceOf([a[0] - d[0] * e, y1, a[1] - d[2] * e], [b[0] + d[0] * e, y1, b[1] + d[2] * e],
        [b[0] + d[0] * e, y0, b[1] + d[2] * e], [a[0] - d[0] * e, y0, a[1] - d[2] * e]);
      F.zr = [-D / 2, D / 2, W / 2, (y0 + y1) / 2];
      if (F.vis) paintFace(F, mat, opt);
    });
    const top = faceOf([-W / 2, y1, D / 2], [W / 2, y1, D / 2], [W / 2, y1, -D / 2], [-W / 2, y1, -D / 2]);
    top.outline = plan.map((q) => [q[0], y1, q[1]]);
    if (!opt.noTop) paintFace(top, mat, opt);
    const B = {
      W: W, D: D, r: r, y0: y0, y1: y1, plan: plan, top: top,
      front: faceOf([-W / 2, y1, -D / 2], [W / 2, y1, -D / 2], [W / 2, y0, -D / 2], [-W / 2, y0, -D / 2]),
      right: faceOf([W / 2, y1, -D / 2], [W / 2, y1, D / 2], [W / 2, y0, D / 2], [W / 2, y0, -D / 2]),
    };
    // блик по верхней кромке
    if (!opt.noEdge) {
      const k = 6, rim = plan.slice(3 * k).concat(plan.slice(0, k + 1)).map((q) => [q[0], y1, q[1]]);
      rimLine(rim, mat.edge != null ? mat.edge : 0.16);
    }
    return B;
  }
  const rboxPts = (W, D, y0, y1) => cuboid(-W / 2, W / 2, y0, y1, -D / 2, D / 2).pts;

  // ---------- Мелкие узоры (создаются один раз) ----------
  const TILES = {};
  function tile(key, w, h, draw) { if (!TILES[key]) { const c = mk(w, h); draw(c.getContext('2d'), w, h); TILES[key] = c; } return TILES[key]; }
  // маска потёртостей: неровные пятна
  function speckle() {
    return tile('speck', 128, 128, (x) => {
      const img = x.createImageData(128, 128), d = img.data, n = Tex.perlin(4711), R = Tex.rng(4712);
      for (let j = 0; j < 128; j++) {
        for (let i = 0; i < 128; i++) d[(j * 128 + i) * 4 + 3] = Tex.fbm(n, i * 0.08, j * 0.08, 3) + (R() - 0.5) * 0.4 > 0.17 ? 255 : 0;
      }
      x.putImageData(img, 0, 0);
    });
  }
  // фактура кожи (мелкие зёрна), бесшовная
  function pebbleTile() {
    return tile('peb', 48, 48, (x) => {
      const R = Tex.rng(905);
      for (let i = 0; i < 190; i++) {
        const px = R() * 48, py = R() * 48, r = 0.8 + R() * 1.5;
        for (let dx = -48; dx <= 48; dx += 48) {
          for (let dy = -48; dy <= 48; dy += 48) {
            x.beginPath(); x.arc(px + dx, py + dy, r, 0, TAU);
            x.fillStyle = 'rgba(255,255,255,.06)'; x.fill();
            x.lineWidth = 0.5; x.strokeStyle = 'rgba(0,0,0,.2)'; x.stroke();
          }
        }
      }
    });
  }
  // карбон: саржевое плетение 2×2
  function carbonTile() {
    return tile('carb', 16, 16, (x) => {
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const hor = (i + j) % 4 < 2, x0 = i * 4, y0 = j * 4;
          const g = hor ? x.createLinearGradient(0, y0, 0, y0 + 4) : x.createLinearGradient(x0, 0, x0 + 4, 0);
          g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.45, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(0,0,0,.5)');
          x.fillStyle = g; x.fillRect(x0, y0, 4, 4);
        }
      }
    });
  }
  // «апельсиновая корка» ABS-пластика кофров: мелкие лунки
  function dimpleTile() {
    return tile('dimp', 6, 6, (x) => {
      const g = x.createRadialGradient(2.4, 2.4, 0.2, 3, 3, 2.6);
      g.addColorStop(0, 'rgba(0,0,0,.16)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,255,255,.08)');
      x.fillStyle = g; x.fillRect(0, 0, 6, 6);
    });
  }
  // Доски: продольные волокна, «соборные» дуги колец, поры, редкие сучки (лёгкая замена большой текстуры)
  function woodTile(key, col) {
    return tile('wood:' + key, 512, 72, (x, w, h) => {
      const R = Tex.rng(seedOf(key)), n = Tex.perlin(seedOf(key) + 3);
      x.fillStyle = css(col[0]); x.fillRect(0, 0, w, h);
      for (let i = 0; i < 30; i++) {
        x.fillStyle = css(R() < 0.5 ? col[1] : col[2], 0.06 + R() * 0.12);
        x.fillRect(0, R() * h, w, 1 + R() * 6);
      }
      x.lineCap = 'round';
      for (let k = 0; k < 9; k++) {                                    // кольца на срезе — вытянутые дуги
        const cx = R() * w, cy = h * (0.15 + R() * 0.7), dir = R() < 0.5 ? 1 : -1;
        for (let r = 0; r < 8; r++) {
          const a = 26 + r * (14 + R() * 8), b = 2 + r * (2.2 + R() * 0.8);
          x.beginPath();
          for (let i = 0; i <= 24; i++) {
            const t = -1 + i / 12, px = cx + t * a, py = cy + dir * b * (1 - t * t) + 1.2 * n(px * 0.02, cy * 0.1 + r);
            if (i) x.lineTo(px, py); else x.moveTo(px, py);
          }
          x.strokeStyle = css(col[2], 0.16 + R() * 0.18); x.lineWidth = 0.6 + R() * 1.2; x.stroke();
        }
      }
      for (let i = 0; i < 46; i++) {                                    // волокна
        const y0 = R() * h, amp = 1 + R() * 2.5;
        x.beginPath();
        for (let px = -8; px <= w + 8; px += 8) { const y = y0 + amp * n(px * 0.006, y0 * 0.05 + i); if (px > -8) x.lineTo(px, y); else x.moveTo(px, y); }
        x.strokeStyle = css(R() < 0.75 ? col[2] : col[1], 0.08 + R() * 0.2); x.lineWidth = 0.35 + R() * 0.9; x.stroke();
      }
      for (let i = 0; i < 420; i++) {                                   // поры
        x.fillStyle = css(col[2], 0.2 + R() * 0.25);
        x.fillRect(R() * w, R() * h, 1.5 + R() * 4, 0.6);
      }
      for (let k = 0; k < 2; k++) {                                     // сучок
        const cx = 60 + R() * (w - 120), cy = h * (0.25 + R() * 0.5), r = 3 + R() * 3;
        for (let i = 4; i >= 0; i--) {
          x.beginPath(); x.ellipse(cx, cy, r * (1 + i * 0.9), r * (0.55 + i * 0.35), 0, 0, TAU);
          x.strokeStyle = css(col[2], 0.18); x.lineWidth = 0.8; x.stroke();
        }
        x.beginPath(); x.ellipse(cx, cy, r, r * 0.6, 0, 0, TAU); x.fillStyle = css(mul(col[2], 0.8), 0.85); x.fill();
      }
    });
  }
  const WOOD = {
    pine: [[176, 132, 82], [204, 162, 108], [120, 80, 44]],
    oak: [[146, 104, 62], [176, 134, 86], [92, 60, 32]],
    walnut: [[92, 58, 34], [122, 82, 52], [46, 26, 14]],
    mahog: [[112, 46, 28], [146, 70, 44], [60, 20, 10]],
    ebony: [[50, 38, 32], [74, 58, 48], [22, 16, 12]],
    ash: [[188, 168, 132], [214, 196, 160], [140, 118, 86]],
  };

  // ---------- Материалы ----------
  // c — альбедо, g — блеск (карта блеска), tex(x, F) — фактура в цветовом слое (внутри клипа грани)
  const grainOn = (x, n, a) => {
    x.save(); if (a != null) x.globalAlpha = a;
    for (let i = 0; i < n; i++) { x.fillStyle = Tex.polymer(x); x.fillRect(0, 0, CW, CH); }
    x.restore();
  };
  let GX = 0, GY = 0;     // сдвиг пятен грязи для текущего кейса
  function grimeOn(x, a) { x.save(); x.globalAlpha = a; x.drawImage(Tex.grime(), -GX, -GY, CW * 1.8, CH * 1.8); x.restore(); }
  function patternOn(x, F, tl, a, k) {
    x.save(); F.at(x, 0, 0); if (k) x.scale(k, k);
    // запас по краям: у скошенных граней (трапеции) локальные оси косые — узор должен покрыть весь контур
    const mg = (20 + Math.max(F.w, F.h) * 0.6) / (k || 1);
    x.globalAlpha = a; x.fillStyle = x.createPattern(tl, 'repeat'); x.fillRect(-mg, -mg, F.w / (k || 1) + 2 * mg, F.h / (k || 1) + 2 * mg);
    x.restore();
  }
  const matPaint = (c, g, grime) => ({ c: rgbOf(c), g: g == null ? 0.3 : g, edge: 0.2, tex: (x) => { grainOn(x, 1); grimeOn(x, grime == null ? 0.13 : grime); } });
  const matPlastic = (c) => ({ c: rgbOf(c), g: 0.16, edge: 0.07, tex: (x) => { grainOn(x, 1, 0.55); grimeOn(x, 0.04); } });
  const matLaminate = (c, kind) => ({ c: rgbOf(c), g: 0.24, edge: 0.1, tex: (x, F) => {
    grainOn(x, 1);
    if (kind === 'dimple') patternOn(x, F, dimpleTile(), 0.5, 1);
    else if (kind === 'carbon') patternOn(x, F, carbonTile(), 0.9, 0.55);
    grimeOn(x, 0.06);
  } });
  const matLeather = (c) => ({ c: rgbOf(c), g: 0.26, edge: 0.1, tex: (x, F) => { patternOn(x, F, pebbleTile(), 1, 0.7); grainOn(x, 1); grimeOn(x, 0.16); } });
  const matCanvas = (c) => ({ c: rgbOf(c), g: 0.1, edge: 0.07, tex: (x, F) => { patternOn(x, F, canvasTile(), 1, 0.75); grainOn(x, 1, 0.6); grimeOn(x, 0.16); } });
  // парусина: полотняное плетение
  function canvasTile() {
    return tile('canv', 8, 8, (x) => {
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          const up = ((i >> 1) + (j >> 1)) % 2 === 0;
          x.fillStyle = up ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.14)'; x.fillRect(i, j, 1, 1);
        }
      }
    });
  }
  const matLacquer = (c, g) => ({ c: rgbOf(c), g: g || 0.7, edge: 0.22, gloss: true, tex: (x) => { grainOn(x, 1, 0.3); } });
  const matMetal = (kind) => ({ c: METAL[kind][1], g: 0.85, edge: 0.4, tex: (x, F) => { patternOn(x, F, brushTile(), 0.9, 1); } });
  function brushTile() {
    return tile('brush', 128, 32, (x) => { x.fillStyle = Tex.brushed(x); x.fillRect(0, 0, 128, 32); x.fillStyle = Tex.brushed(x); x.fillRect(0, 0, 128, 32); });
  }

  // ---------- Металлы и палитры фурнитуры ----------
  const METAL = {
    steel: [[232, 236, 240], [172, 179, 187], [102, 109, 118], [56, 61, 68]],
    dark: [[126, 131, 139], [72, 77, 84], [42, 45, 50], [20, 22, 25]],
    alu: [[214, 219, 225], [162, 168, 176], [114, 120, 128], [74, 79, 86]],
    brass: [[236, 214, 160], [186, 146, 78], [118, 86, 38], [60, 42, 16]],
    gold: [[250, 226, 160], [206, 160, 72], [130, 90, 30], [64, 42, 12]],
    silver: [[255, 255, 255], [212, 217, 223], [140, 147, 156], [74, 80, 88]],
    bronze: [[236, 194, 148], [176, 118, 66], [108, 66, 32], [56, 32, 14]],
    black: [[96, 100, 106], [48, 51, 56], [28, 30, 33], [14, 15, 17]],
    oxsil: [[206, 211, 218], [128, 134, 143], [74, 79, 88], [34, 37, 43]],      // чернёное серебро
    oxgold: [[226, 196, 128], [150, 112, 50], [92, 64, 24], [44, 30, 10]],
  };
  const paintPal = (c) => { c = rgbOf(c); return [mixc(c, WHITE, 0.24), c, mul(c, 0.7), mul(c, 0.42)]; };
  const palOf = (k) => (typeof k === 'string' && METAL[k] ? METAL[k] : Array.isArray(k) && Array.isArray(k[0]) ? k : paintPal(k));
  // вертикальный градиент палитры в локальных координатах (y0 → y1) с освещённостью грани L
  function grad(x, pal, L, y0, y1) {
    const g = x.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, css(mul(pal[0], L))); g.addColorStop(0.38, css(mul(pal[1], L)));
    g.addColorStop(0.82, css(mul(pal[2], L))); g.addColorStop(1, css(mul(pal[3], L)));
    return g;
  }
  // Заливка текущего пути детали: цвет (градиент палитры, тень вниз-вправо), высота h, блеск g
  function part(x, m, L, pal, h, g, y0, y1, sh) {
    if (m === 'h') { x.fillStyle = gray(h); x.fill(); return; }
    if (m === 'g') { x.fillStyle = gray(g); x.fill(); return; }
    if (sh) {
      x.save(); x.shadowColor = 'rgba(0,0,0,' + sh + ')'; x.shadowBlur = 2.6; x.shadowOffsetX = 1; x.shadowOffsetY = 1.7;
      x.fillStyle = '#000'; x.fill(); x.restore();
    }
    x.fillStyle = grad(x, palOf(pal), L, y0, y1); x.fill();
  }
  function rr(x, x0, y0, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    x.beginPath(); x.moveTo(x0 + r, y0);
    x.arcTo(x0 + w, y0, x0 + w, y0 + h, r); x.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
    x.arcTo(x0, y0 + h, x0, y0, r); x.arcTo(x0, y0, x0 + w, y0, r); x.closePath();
  }
  function rrPts(x0, y0, w, h, r) {
    if (r <= 0) return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
    const pts = [], n = 4;
    const arc = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    arc(x0 + w - r, y0 + r, -Math.PI / 2); arc(x0 + w - r, y0 + h - r, 0); arc(x0 + r, y0 + h - r, Math.PI / 2); arc(x0 + r, y0 + r, Math.PI);
    return pts;
  }
  // Панель на грани по точному контуру: { pal | c, h, g, sh, k, gs: [s0, t0, s1, t1], tex(x) }
  function slab(F, pts, o) {
    let t0 = 1e9, t1 = -1e9, s0 = 1e9, s1 = -1e9;
    pts.forEach((q) => { s0 = Math.min(s0, q[0]); s1 = Math.max(s1, q[0]); t0 = Math.min(t0, q[1]); t1 = Math.max(t1, q[1]); });
    const gs = o.gs || [(s0 + s1) / 2, t0, (s0 + s1) / 2, t1];
    each((x, m) => {
      F.pp(x, pts);
      if (m === 'h') { x.fillStyle = o.hf ? o.hf(x, gs) : gray(o.h); x.fill(); return; }
      if (m === 'g') { x.fillStyle = gray(o.g); x.fill(); return; }
      if (o.sh) {
        x.save(); x.shadowColor = 'rgba(0,0,0,' + o.sh + ')'; x.shadowBlur = o.sb || 3; x.shadowOffsetX = 1.2; x.shadowOffsetY = 1.9;
        x.fillStyle = '#000'; x.fill(); x.restore();
      }
      const L = F.lit * (o.k || 1);
      if (o.pal) {
        const p = palOf(o.pal), g = F.lg(x, gs[0], gs[1], gs[2], gs[3]);
        g.addColorStop(0, css(mul(p[0], L))); g.addColorStop(0.42, css(mul(p[1], L))); g.addColorStop(0.85, css(mul(p[2], L))); g.addColorStop(1, css(mul(p[3], L)));
        x.fillStyle = g;
      } else x.fillStyle = css(mul(o.c, L));
      x.fill();
      if (o.tex) { x.save(); x.clip(); o.tex(x); x.restore(); }
    });
  }

  // ---------- Покраска граней ----------
  function paintFace(F, mat, opt) {
    if (!F.vis) return;
    opt = opt || {};
    each((x, m) => {
      F.out(x);
      if (m === 'h') { x.fillStyle = gray(opt.h != null ? opt.h : 0.5); x.fill(); return; }
      if (m === 'g') { x.fillStyle = gray(mat.g); x.fill(); return; }
      x.clip();
      x.fillStyle = css(mul(mat.c, F.lit * (opt.k || 1))); x.fillRect(0, 0, CW, CH);
      if (mat.tex) mat.tex(x, F);
      if (!opt.flat) faceLight(x, F, mat, opt);
    });
  }
  // Мягкие перепады света по грани: крышка светлее к переднему краю (и блик софтбокса),
  // стенки темнеют к полу, бок — к задней кромке
  function faceLight(x, F, mat, opt) {
    const n = F.n;
    if (n[1] > 0.55) {
      const g = F.lg(x, F.w / 2, 0, F.w / 2, F.h);
      g.addColorStop(0, 'rgba(0,0,0,.16)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,' + (0.05 + mat.g * 0.08) + ')');
      x.fillStyle = g; x.fillRect(0, 0, CW, CH);
      x.save(); F.at(x, F.w * 0.36, F.h * 0.62);
      const r = Math.max(F.w, F.h) * 0.5, hg = x.createRadialGradient(0, 0, 0, 0, 0, r);
      const a = mat.gloss ? 0.16 : 0.04 + mat.g * 0.08;
      hg.addColorStop(0, 'rgba(255,255,255,' + a + ')'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = hg; x.fillRect(-r, -r, 2 * r, 2 * r);
      x.restore();
      return;
    }
    let p0, p1;
    if (F.zr) { p0 = proj(F.zr[2], F.tl[1], F.zr[0]); p1 = proj(F.zr[2], F.bl[1], F.zr[0]); }
    else { p0 = F.p(F.w / 2, 0); p1 = F.p(F.w / 2, F.h); }
    const g = x.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
    g.addColorStop(0, 'rgba(255,255,255,' + (opt.top0 != null ? opt.top0 : 0.05) + ')'); g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (opt.floor ? 0.24 : 0.12) + ')');
    x.fillStyle = g; x.fillRect(0, 0, CW, CH);
    if (F.zr && n[0] > 0.02) {
      const a = proj(F.zr[2], F.zr[3], F.zr[0]), b = proj(F.zr[2], F.zr[3], F.zr[1]);
      const g2 = x.createLinearGradient(a[0], a[1], b[0], b[1]);
      const kz = clamp((n[0] - 0.02) / 0.5, 0, 1);                       // плавно: у скруглённых углов без ступеньки
      g2.addColorStop(0, 'rgba(255,255,255,' + 0.03 * kz + ')'); g2.addColorStop(1, 'rgba(0,0,0,' + 0.16 * kz + ')');
      x.fillStyle = g2; x.fillRect(0, 0, CW, CH);
    }
    if (mat.gloss && n[2] < -0.5 && F.w > 40) {          // лак: отражение софтбокса — мягкая наклонная полоса
      const a = F.p(F.w * 0.1, 0), b = F.p(F.w * 0.42, F.h);
      const g3 = x.createLinearGradient(a[0], a[1], b[0], b[1]);
      g3.addColorStop(0, 'rgba(255,255,255,0)'); g3.addColorStop(0.5, 'rgba(255,255,255,.07)'); g3.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g3; x.fillRect(0, 0, CW, CH);
    }
  }
  // Кромки: тонкий блик по ребру и «валик» в карте высот — ребро скруглено
  function edgeLine(a, b, k, wd) {
    const p = P3(a), q = P3(b);
    each((x, m) => {
      x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.lineCap = 'round';
      if (m === 'c') { x.strokeStyle = 'rgba(255,255,255,' + k + ')'; x.lineWidth = 1.1; }
      else if (m === 'h') { x.strokeStyle = gray(0.56); x.lineWidth = wd || 2.2; }
      else { x.strokeStyle = gray(0.55); x.lineWidth = 1.6; }
      x.stroke();
    });
  }
  function rimLine(pts3, k) {
    const ps = pts3.map(P3);
    each((x, m) => {
      x.beginPath(); ps.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.lineJoin = 'round';
      if (m === 'c') { x.strokeStyle = 'rgba(255,255,255,' + k + ')'; x.lineWidth = 1.1; }
      else if (m === 'h') { x.strokeStyle = gray(0.56); x.lineWidth = 2.2; }
      else { x.strokeStyle = gray(0.55); x.lineWidth = 1.6; }
      x.stroke();
    });
  }
  // Сколы краски вдоль ребра: голый металл с тёмной каймой
  function chips(a, b, R, n, bare) {
    const p = P3(a), q = P3(b), x = LC, dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    x.save();
    for (let i = 0; i < n; i++) {
      const t = R(), off = (R() - 0.5) * 3.2, cx = p[0] + dx * t + nx * off, cy = p[1] + dy * t + ny * off;
      const r = 0.35 + R() * R() * 2.4, k = 5 + Math.floor(R() * 3), pts = [];
      for (let j = 0; j < k; j++) { const ang = j / k * TAU, rr2 = r * (0.55 + R() * 0.7); pts.push([cx + Math.cos(ang) * rr2 * (1.1 + Math.abs(dx) / L), cy + Math.sin(ang) * rr2 * (1.1 + Math.abs(dy) / L)]); }
      x.beginPath(); pts.forEach((pp, j) => (j ? x.lineTo(pp[0], pp[1]) : x.moveTo(pp[0], pp[1]))); x.closePath();
      x.fillStyle = 'rgba(24,20,16,.5)'; x.fill();
      x.fillStyle = css(bare || [150, 154, 158], 0.55 + R() * 0.35);
      x.beginPath(); pts.forEach((pp, j) => { const ex = cx + (pp[0] - cx) * 0.62 - 0.3, ey = cy + (pp[1] - cy) * 0.62 - 0.3; if (j) x.lineTo(ex, ey); else x.moveTo(ex, ey); }); x.closePath(); x.fill();
    }
    x.restore();
  }
  // Царапины на грани: тонкие светлые штрихи
  function scratches(F, R, n, a) {
    const x = LC; x.save(); x.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const s = R() * F.w, t = R() * F.h, l = 4 + R() * 18, ang = (R() - 0.5) * 1.2 + (R() < 0.5 ? 0 : Math.PI / 2);
      const p = F.p(s, t), q = F.p(s + Math.cos(ang) * l, t + Math.sin(ang) * l);
      x.strokeStyle = 'rgba(235,238,242,' + (a * (0.4 + R() * 0.6)) + ')'; x.lineWidth = 0.4 + R() * 0.5;
      x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke();
    }
    x.restore();
  }
  // Стандартная покраска коробки: бок, перед, крышка, блики по рёбрам, сколы
  function paintBox(B, mat, opt) {
    opt = opt || {};
    paintFace(B.right, mat, opt);
    paintFace(B.front, mat, opt);
    if (!opt.noTop) paintFace(B.top, mat, opt);
    if (opt.noEdge) return;
    const k = mat.edge != null ? mat.edge : 0.16;
    if (!opt.noTop) { edgeLine([B.x0, B.y1, B.z0], [B.x1, B.y1, B.z0], k * 1.3); edgeLine([B.x1, B.y1, B.z0], [B.x1, B.y1, B.z1], k); }
    edgeLine([B.x1, B.y1, B.z0], [B.x1, B.y0, B.z0], k * 0.9);
    if (opt.chips) {
      const R = opt.chips, bare = opt.bare;
      if (!opt.noTop) { chips([B.x0, B.y1, B.z0], [B.x1, B.y1, B.z0], R, 34, bare); chips([B.x1, B.y1, B.z0], [B.x1, B.y1, B.z1], R, 14, bare); }
      chips([B.x1, B.y1, B.z0], [B.x1, B.y0, B.z0], R, 14, bare);
      chips([B.x0, B.y1, B.z0], [B.x0, B.y0, B.z0], R, 10, bare);
      chips([B.x0, B.y0, B.z0], [B.x1, B.y0, B.z0], R, 16, bare);
    }
  }
  // Тень под свесом крышки на корпусе (полоса у шва)
  function seamShade(F, d, a) {
    each((x, m) => {
      if (m !== 'c' || !F.vis) return;
      F.pp(x, [[0, 0], [F.w, 0], [F.w, d], [0, d]]);
      const g = F.lg(x, 0, 0, 0, d); g.addColorStop(0, 'rgba(0,0,0,' + (a || 0.42) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fill();
    });
  }
  // Шов/паз по точкам грани: тёмная линия, канавка в карте высот
  function groove(F, pts, w, a, closed) {
    each((x, m) => {
      x.beginPath();
      pts.forEach((q, i) => { const p = F.p(q[0], q[1]); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); });
      if (closed) x.closePath();
      x.lineJoin = 'round';
      if (m === 'c') { x.strokeStyle = 'rgba(0,0,0,' + (a || 0.55) + ')'; x.lineWidth = w; x.stroke(); }
      else if (m === 'h') { x.strokeStyle = gray(0.3); x.lineWidth = w + 0.6; x.stroke(); }
    });
  }
  // Тень на полу: широкая мягкая (уходит вправо-назад от света) и плотная у самого основания
  function floorShadow(x0, x1, z0, z1) {
    const x = LC, far = 4000;
    const poly = (dx, dz, g) => {
      const pts = [[x0 - g + dx, z0 - g + dz], [x1 + g + dx, z0 - g + dz], [x1 + g + dx, z1 + g + dz], [x0 - g + dx, z1 + g + dz]].map((q) => proj(q[0], 0, q[1]));
      x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0] + far, p[1]) : x.moveTo(p[0] + far, p[1]))); x.closePath();
    };
    x.save(); x.fillStyle = '#000'; x.shadowOffsetX = -far; x.shadowOffsetY = 0;
    x.shadowColor = 'rgba(0,0,0,.3)'; x.shadowBlur = 18; poly(10, 18, 3); x.fill();
    x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 9; poly(5, 8, 1); x.fill();
    x.shadowColor = 'rgba(0,0,0,.75)'; x.shadowBlur = 2.5; poly(0, 0, 0); x.fill();
    x.restore();
  }

  // ---------- Мелкая фурнитура (локальные координаты грани, центр детали в (s, t)) ----------
  function rivet(F, s, t, r, pal, flat) {
    const p = palOf(pal || 'steel');
    each((x, m) => {
      F.at(x, s, t); x.beginPath(); x.arc(0, 0, r, 0, TAU);
      if (m === 'h') {
        const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, gray(flat ? 0.64 : 0.74)); g.addColorStop(1, gray(0.56));
        x.fillStyle = g; x.fill(); return;
      }
      if (m === 'g') { x.fillStyle = gray(0.75); x.fill(); return; }
      const g = x.createRadialGradient(-r * 0.35, -r * 0.42, r * 0.06, 0, 0, r * 1.05);
      g.addColorStop(0, css(mul(p[0], F.lit))); g.addColorStop(0.55, css(mul(p[1], F.lit))); g.addColorStop(1, css(mul(p[3], F.lit)));
      x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 1.3; x.shadowOffsetX = 0.6; x.shadowOffsetY = 0.9;
      x.fillStyle = g; x.fill();
    });
  }
  // Винт: шлиц, крест или шестигранник
  function screw(F, s, t, r, kind, rot, pal) {
    rivet(F, s, t, r, pal, true);
    each((x, m) => {
      if (m === 'g') return;
      F.at(x, s, t); x.rotate(rot || 0);
      const dark = m === 'c' ? 'rgba(10,11,13,.7)' : gray(0.48);
      if (kind === 'hex') {
        x.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; x.lineTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45); } x.closePath();
        x.fillStyle = dark; x.fill(); return;
      }
      x.strokeStyle = dark; x.lineWidth = r * 0.3; x.beginPath();
      x.moveTo(-r * 0.62, 0); x.lineTo(r * 0.62, 0);
      if (kind === 'cross') { x.moveTo(0, -r * 0.62); x.lineTo(0, r * 0.62); }
      x.stroke();
    });
  }
  // Ряд заклёпок вдоль отрезка грани
  function rivetRow(F, s0, t0, s1, t1, step, r, pal) {
    const L = Math.hypot(s1 - s0, t1 - t0), n = Math.max(1, Math.round(L / step));
    for (let i = 0; i <= n; i++) rivet(F, s0 + (s1 - s0) * i / n, t0 + (t1 - t0) * i / n, r, pal);
  }

  // ---------- Замки ----------
  // Рычажный (армейский): скоба на крышке, основание и откидной рычаг на корпусе; t — линия шва
  function latchLever(F, s, t, w, pal) {
    const L = F.lit, h = w * 1.2;
    each((x, m) => {
      F.at(x, s, t);
      rr(x, -w * 0.3, -w * 0.52, w * 0.6, w * 0.38, 1.5); part(x, m, L, pal, 0.6, 0.5, -w * 0.52, -w * 0.14, 0.45);
      rr(x, -w * 0.5, 1.5, w, h * 0.66, 2); part(x, m, L, pal, 0.6, 0.45, 1.5, 1.5 + h * 0.66, 0.5);
      rr(x, -w * 0.34, -w * 0.3, w * 0.68, h * 0.92, 2.5); part(x, m, L, pal, 0.74, 0.6, -w * 0.3, h * 0.62, 0.55);
      if (m !== 'g') { rr(x, -w * 0.1, -w * 0.16, w * 0.2, h * 0.58, w * 0.1); x.fillStyle = m === 'h' ? gray(0.8) : css(mul(palOf(pal)[0], L), 0.4); x.fill(); }
      rr(x, -w * 0.38, h * 0.5, w * 0.76, h * 0.13, h * 0.065); part(x, m, L, pal, 0.8, 0.7, h * 0.5, h * 0.63, 0);
    });
    rivet(F, s - w * 0.38, t + 1.5 + h * 0.52, 1.5, pal);
    rivet(F, s + w * 0.38, t + 1.5 + h * 0.52, 1.5, pal);
  }
  // Кулачковый зажим с кольцом (тяжёлые ящики)
  function latchClamp(F, s, t, w, pal) {
    const L = F.lit;
    each((x, m) => {
      F.at(x, s, t);
      rr(x, -w * 0.5, -w * 0.42, w, w * 0.32, 1.5); part(x, m, L, pal, 0.6, 0.5, -w * 0.42, -w * 0.1, 0.45);
      rr(x, -w * 0.42, 2, w * 0.84, w * 0.72, 2); part(x, m, L, pal, 0.62, 0.45, 2, 2 + w * 0.72, 0.5);
      x.beginPath(); x.arc(0, w * 0.32, w * 0.2, 0, TAU); part(x, m, L, pal, 0.76, 0.6, w * 0.12, w * 0.52, 0.5);
      x.beginPath(); x.arc(0, w * 0.32, w * 0.09, 0, TAU);
      if (m === 'c') { x.fillStyle = 'rgba(0,0,0,.6)'; x.fill(); } else if (m === 'h') { x.fillStyle = gray(0.6); x.fill(); }
      // кольцо, откинутое вниз
      x.beginPath(); x.ellipse(0, w * 0.82, w * 0.26, w * 0.17, 0, 0, TAU); x.lineWidth = w * 0.08;
      if (m === 'c') { x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 2; x.shadowOffsetX = 1; x.shadowOffsetY = 1.5; x.strokeStyle = css(mul(palOf(pal)[2], L)); x.stroke(); x.restore(); }
      else { x.strokeStyle = gray(m === 'h' ? 0.72 : 0.6); x.stroke(); }
    });
  }
  // Откидной замок пластикового кейса в литой нише
  function latchToggle(F, s, t, w, h, pal, dark) {
    const L = F.lit;
    each((x, m) => {
      F.at(x, s, t);
      rr(x, -w / 2 - 3.5, -h * 0.34 - 2.5, w + 7, h + 6, 3.5);
      if (m === 'c') { x.fillStyle = css(mul(dark, L)); x.fill(); } else { x.fillStyle = gray(m === 'h' ? 0.38 : 0.12); x.fill(); }
      rr(x, -w / 2, -h * 0.34, w, h, 2.5); part(x, m, L, pal, 0.64, 0.28, -h * 0.34, h * 0.66, 0.55);
      rr(x, -w / 2 + 1.5, -h * 0.34 - 3, w - 3, 6, 2); part(x, m, L, pal, 0.68, 0.3, -h * 0.34 - 3, -h * 0.34 + 3, 0);
      for (let i = 0; i < 3; i++) {
        x.beginPath(); x.rect(-w / 2 + 3, h * 0.3 + i * 3.4, w - 6, 1.3);
        if (m === 'c') { x.fillStyle = 'rgba(0,0,0,.4)'; x.fill(); } else if (m === 'h') { x.fillStyle = gray(0.55); x.fill(); }
      }
      x.beginPath(); x.rect(-w / 2 + 1, h * 0.6, w - 2, 3);
      if (m === 'c') { x.fillStyle = 'rgba(0,0,0,.35)'; x.fill(); }
    });
  }
  // Замок-«бабочка» кофра: квадратная пластина с чашкой и сложенными «крыльями»; ответная скоба на крышке
  function latchButterfly(F, s, t, sz) {
    const L = F.lit, al = METAL.silver, r = sz * 0.34;
    each((x, m) => {
      F.at(x, s, t);
      rr(x, -sz * 0.24, -sz * 0.5 - 8, sz * 0.48, 10, 1.5); part(x, m, L, al, 0.62, 0.85, -sz * 0.5 - 8, -sz * 0.5 + 2, 0.4);
      rr(x, -sz / 2, -sz / 2, sz, sz, 2.5); part(x, m, L, al, 0.6, 0.9, -sz / 2, sz / 2, 0.5);
      x.beginPath(); x.arc(0, 0, r, 0, TAU);
      if (m === 'c') { const g = x.createLinearGradient(0, -r, 0, r); g.addColorStop(0, css(mul([52, 56, 62], L))); g.addColorStop(1, css(mul([158, 164, 172], L))); x.fillStyle = g; x.fill(); }
      else { x.fillStyle = gray(m === 'h' ? 0.42 : 0.7); x.fill(); }
      [-1, 1].forEach((k) => { x.beginPath(); x.ellipse(k * r * 0.48, 0, r * 0.46, r * 0.3, 0, 0, TAU); part(x, m, L, al, 0.66, 1, -r * 0.3, r * 0.3, 0.45); });
      x.beginPath(); x.arc(0, 0, r * 0.2, 0, TAU); part(x, m, L, al, 0.72, 1, -r * 0.2, r * 0.2, 0);
    });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((d) => rivet(F, s + d[0] * sz * 0.38, t + d[1] * sz * 0.38, 1.3, 'silver'));
  }
  // Защёлка с навесной петлёй (деревянный ящик): петля на крышке, накладка через шов, скоба
  function hasp(F, s, t, w, pal, lock) {
    const L = F.lit;
    each((x, m) => {
      F.at(x, s, t);
      rr(x, -w * 0.5, -w * 0.9, w, w * 0.5, 1); part(x, m, L, pal, 0.6, 0.45, -w * 0.9, -w * 0.4, 0.45);
      x.beginPath(); x.rect(-w * 0.55, -w * 0.48, w * 1.1, w * 0.18); part(x, m, L, pal, 0.68, 0.55, -w * 0.48, -w * 0.3, 0.3);
      rr(x, -w * 0.28, -w * 0.4, w * 0.56, w * 1.5, 1.5); part(x, m, L, pal, 0.66, 0.5, -w * 0.4, w * 1.1, 0.5);
      rr(x, -w * 0.1, w * 0.62, w * 0.2, w * 0.36, w * 0.08);
      if (m === 'c') { x.fillStyle = 'rgba(0,0,0,.7)'; x.fill(); } else if (m === 'h') { x.fillStyle = gray(0.4); x.fill(); }
    });
    [[-0.32, -0.66], [0.32, -0.66], [0, 0.1]].forEach((q) => rivet(F, s + q[0] * w, t + q[1] * w, 1.1, pal));
    if (lock) padlock(F, s, t + w * 0.95, w * 0.9, lock);
  }
  // Навесной замок
  function padlock(F, s, t, w, pal) {
    const L = F.lit;
    each((x, m) => {
      F.at(x, s, t);
      x.beginPath(); x.arc(0, w * 0.1, w * 0.3, Math.PI, 0); x.lineWidth = w * 0.14;
      if (m === 'c') { x.strokeStyle = css(mul(METAL.steel[1], L)); x.stroke(); } else { x.strokeStyle = gray(m === 'h' ? 0.7 : 0.8); x.stroke(); }
      rr(x, -w * 0.45, w * 0.12, w * 0.9, w * 0.78, w * 0.12); part(x, m, L, pal, 0.74, 0.8, w * 0.12, w * 0.9, 0.55);
      x.beginPath(); x.arc(0, w * 0.44, w * 0.08, 0, TAU); x.rect(-w * 0.03, w * 0.44, w * 0.06, w * 0.2);
      if (m === 'c') { x.fillStyle = 'rgba(0,0,0,.6)'; x.fill(); }
    });
  }
  // Маленький латунный замочек шкатулки
  function catchSmall(F, s, t, w, pal) {
    const L = F.lit;
    each((x, m) => {
      F.at(x, s, t);
      rr(x, -w * 0.32, -w * 0.62, w * 0.64, w * 0.4, 1); part(x, m, L, pal, 0.6, 0.85, -w * 0.62, -w * 0.22, 0.4);
      rr(x, -w * 0.5, 0, w, w * 0.62, 1.2); part(x, m, L, pal, 0.6, 0.85, 0, w * 0.62, 0.45);
      rr(x, -w * 0.2, -w * 0.36, w * 0.4, w * 0.82, w * 0.1); part(x, m, L, pal, 0.7, 0.95, -w * 0.36, w * 0.46, 0.45);
    });
  }
  // Латунная накладка с замочной скважиной
  function keyhole(F, s, t, w, pal) {
    const L = F.lit;
    each((x, m) => {
      F.at(x, s, t);
      x.beginPath(); x.moveTo(0, -w * 0.62); x.quadraticCurveTo(w * 0.52, -w * 0.5, w * 0.5, 0); x.quadraticCurveTo(w * 0.52, w * 0.5, 0, w * 0.62);
      x.quadraticCurveTo(-w * 0.52, w * 0.5, -w * 0.5, 0); x.quadraticCurveTo(-w * 0.52, -w * 0.5, 0, -w * 0.62); x.closePath();
      part(x, m, L, pal, 0.62, 0.9, -w * 0.62, w * 0.62, 0.45);
      x.beginPath(); x.arc(0, -w * 0.08, w * 0.11, 0, TAU); x.moveTo(-w * 0.05, -w * 0.04); x.lineTo(w * 0.05, -w * 0.04); x.lineTo(w * 0.09, w * 0.3); x.lineTo(-w * 0.09, w * 0.3); x.closePath();
      if (m === 'c') { x.fillStyle = '#0c0b0a'; x.fill(); } else if (m === 'h') { x.fillStyle = gray(0.3); x.fill(); }
    });
  }

  // ---------- Ручки ----------
  // Откидная ручка-скоба: висит вниз между двумя кронштейнами
  function bailHandle(F, s, t, w, pal, drop) {
    const L = F.lit, p = palOf(pal), dr = drop || 20;
    const path = (x) => {
      x.beginPath(); x.moveTo(-w / 2, 1); x.lineTo(-w / 2, dr * 0.55); x.quadraticCurveTo(-w / 2, dr, -w / 2 + 9, dr);
      x.lineTo(w / 2 - 9, dr); x.quadraticCurveTo(w / 2, dr, w / 2, dr * 0.55); x.lineTo(w / 2, 1);
    };
    each((x, m) => {
      F.at(x, s, t); x.lineCap = 'round'; x.lineJoin = 'round';
      [-1, 1].forEach((k) => { rr(x, k * w / 2 - 6, -6, 12, 12, 2); part(x, m, L, pal, 0.62, 0.5, -6, 6, 0.45); });
      path(x);
      if (m === 'c') {
        x.save(); x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 3; x.shadowOffsetX = 1.6; x.shadowOffsetY = 2.6;
        x.lineWidth = 4.4; x.strokeStyle = css(mul(p[2], L)); x.stroke(); x.restore();
        x.translate(-0.5, -0.9); path(x); x.lineWidth = 1.5; x.strokeStyle = css(mul(p[0], L), 0.75); x.stroke();
      } else { x.lineWidth = 4.4; x.strokeStyle = gray(m === 'h' ? 0.74 : 0.6); x.stroke(); }
    });
    rivet(F, s - w / 2, t - 1, 1.6, pal); rivet(F, s + w / 2, t - 1, 1.6, pal);
  }
  // Утопленная ручка кофра: пластина с чашкой и откидной перекладиной
  function recessHandle(F, s, t, w, h, pal) {
    const L = F.lit, al = pal || METAL.silver;
    each((x, m) => {
      F.at(x, s, t);
      rr(x, -w / 2, -h / 2, w, h, 4); part(x, m, L, al, 0.6, 0.85, -h / 2, h / 2, 0.45);
      rr(x, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 3);
      if (m === 'c') { const g = x.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, css(mul([34, 37, 42], L))); g.addColorStop(1, css(mul([104, 109, 116], L))); x.fillStyle = g; x.fill(); }
      else { x.fillStyle = gray(m === 'h' ? 0.34 : 0.6); x.fill(); }
      rr(x, -w * 0.36, -h * 0.1, w * 0.72, h * 0.3, h * 0.15); part(x, m, L, METAL.black, 0.52, 0.3, -h * 0.1, h * 0.2, 0.5);
    });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((d) => rivet(F, s + d[0] * (w / 2 - 2.6), t + d[1] * (h / 2 - 2.6), 1.1, 'silver'));
  }
  // Верёвочная ручка в деревянных колодках
  function ropeHandle(F, s, t, w, wood) {
    const L = F.lit, rope = [176, 154, 112];
    const path = (x) => { x.beginPath(); x.moveTo(-w / 2 + 4, 2); x.bezierCurveTo(-w / 2 + 6, 26, w / 2 - 6, 26, w / 2 - 4, 2); };
    each((x, m) => {
      F.at(x, s, t); x.lineCap = 'round';
      path(x);
      if (m === 'c') {
        x.save(); x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 3; x.shadowOffsetX = 1.5; x.shadowOffsetY = 2.5;
        x.lineWidth = 5.2; x.strokeStyle = css(mul(rope, L * 0.86)); x.stroke(); x.restore();
        x.setLineDash([1.6, 2.2]); x.lineWidth = 5; x.strokeStyle = css(mul(rope, L * 0.55), 0.7); x.stroke();
        x.setLineDash([]); x.translate(-0.4, -0.8); path(x); x.lineWidth = 1.4; x.strokeStyle = css(mul(rope, L * 1.15), 0.6); x.stroke();
      } else { x.lineWidth = 5.2; x.strokeStyle = gray(m === 'h' ? 0.74 : 0.1); x.stroke(); }
      [-1, 1].forEach((k) => { rr(x, k * w / 2 - 8, -8, 16, 14, 1.5); part(x, m, L, paintPal(wood), 0.66, 0.15, -8, 6, 0.5); });
    });
  }
  // Ручка из ремня в латунных петлях
  function strapHandle(F, s, t, w, leather, pal) {
    const L = F.lit, lp = paintPal(leather);
    each((x, m) => {
      F.at(x, s, t);
      [-1, 1].forEach((k) => { rr(x, k * w / 2 - 5, -5, 10, 10, 2); part(x, m, L, pal, 0.64, 0.85, -5, 5, 0.45); });
      x.beginPath(); x.moveTo(-w / 2 + 2, -2); x.bezierCurveTo(-w / 2 + 8, 14, w / 2 - 8, 14, w / 2 - 2, -2);
      x.lineTo(w / 2 - 2, 5); x.bezierCurveTo(w / 2 - 8, 22, -w / 2 + 8, 22, -w / 2 + 2, 5); x.closePath();
      part(x, m, L, lp, 0.7, 0.3, 0, 20, 0.55);
      if (m === 'c') {
        x.beginPath(); x.moveTo(-w / 2 + 5, 1.5); x.bezierCurveTo(-w / 2 + 10, 16, w / 2 - 10, 16, w / 2 - 5, 1.5);
        x.setLineDash([1.6, 1.4]); x.lineWidth = 0.5; x.strokeStyle = css(mixc(lp[0], WHITE, 0.3), 0.6); x.stroke();
      }
    });
  }
  // Литая ручка пластикового кейса (откинута вниз)
  function carryHandle(F, s, t, w, pal, rub) {
    const L = F.lit;
    each((x, m) => {
      F.at(x, s, t);
      [-1, 1].forEach((k) => { rr(x, k * (w / 2 - 6) - 7, -5, 14, 13, 3); part(x, m, L, pal, 0.63, 0.25, -5, 8, 0.45); });
      rr(x, -w / 2 + 3, 5, w - 6, 12, 6); part(x, m, L, rub, 0.74, 0.12, 5, 17, 0.55);
      if (m === 'c') { for (let i = -3; i <= 3; i++) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(i * (w - 20) / 7 - 0.6, 7, 1.2, 8); } }
    });
  }
  // Складная ручка, лежащая на крышке (цинк)
  function topHandle(F, s, t, w, pal) {
    const L = F.lit, p = palOf(pal);
    each((x, m) => {
      F.at(x, s, t); x.lineCap = 'round';
      [-1, 1].forEach((k) => { rr(x, k * w / 2 - 5, -6, 10, 12, 2); part(x, m, L, pal, 0.62, 0.5, -6, 6, 0.4); });
      x.beginPath(); x.moveTo(-w / 2, 0); x.lineTo(-w / 2 + 6, 16); x.lineTo(w / 2 - 6, 16); x.lineTo(w / 2, 0);
      if (m === 'c') { x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 2; x.shadowOffsetX = 1; x.shadowOffsetY = 1.5; x.lineWidth = 3; x.strokeStyle = css(mul(p[2], L)); x.stroke(); x.restore(); }
      else { x.lineWidth = 3; x.strokeStyle = gray(m === 'h' ? 0.7 : 0.6); x.stroke(); }
      rr(x, -w * 0.3, 12.5, w * 0.6, 7, 3.5); part(x, m, L, pal, 0.74, 0.5, 12.5, 19.5, 0.4);
    });
  }

  // ---------- Углы ----------
  // L-образная накладка у угла грани: (cs, ct) — угол, sx, sy — направления внутрь (±1)
  function cornerL(F, cs, ct, sx, sy, a, b, pal, riv) {
    const L = F.lit;
    each((x, m) => {
      F.at(x, cs, ct); x.scale(sx, sy);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(a, 0); x.lineTo(a, b); x.lineTo(b, b); x.lineTo(b, a); x.lineTo(0, a); x.closePath();
      part(x, m, L, pal, 0.62, 0.55, 0, a, 0.45);
    });
    if (riv !== false) rivet(F, cs + sx * b * 0.5, ct + sy * b * 0.5, 1.6, pal);
  }
  // Треугольная «лапка» у угла (кофр, сундук): скруглённая гипотенуза
  function cornerTri(F, cs, ct, sx, sy, a, pal, nails) {
    const L = F.lit;
    each((x, m) => {
      F.at(x, cs, ct); x.scale(sx, sy);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(a, 0); x.quadraticCurveTo(a * 0.42, a * 0.42, 0, a); x.closePath();
      part(x, m, L, pal, 0.64, 0.9, 0, a, 0.45);
    });
    if (nails) { rivet(F, cs + sx * a * 0.22, ct + sy * a * 0.22, 1, pal); }
  }
  // Шар на вершине (кофр): хромированная сфера
  function ball(q, r, pal) {
    const p = P3(q), k = pxAt(q) * r, c = palOf(pal || 'silver');
    each((x, m) => {
      x.beginPath(); x.arc(p[0], p[1], k, 0, TAU);
      if (m === 'h') { const g = x.createRadialGradient(p[0], p[1], 0, p[0], p[1], k); g.addColorStop(0, gray(0.92)); g.addColorStop(1, gray(0.6)); x.fillStyle = g; x.fill(); return; }
      if (m === 'g') { x.fillStyle = gray(1); x.fill(); return; }
      x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 3; x.shadowOffsetX = 1.2; x.shadowOffsetY = 2;
      const g = x.createRadialGradient(p[0] - k * 0.38, p[1] - k * 0.42, k * 0.06, p[0], p[1], k);
      g.addColorStop(0, css(c[0])); g.addColorStop(0.35, css(c[1])); g.addColorStop(0.8, css(c[2])); g.addColorStop(1, css(c[3]));
      x.fillStyle = g; x.fill(); x.restore();
    });
  }

  // ---------- Трафаретный шрифт ----------
  // Буквы — штрихи на сетке 4×6 (M, W — 5×6); разрывы между штрихами — перемычки трафарета.
  const O_ = [[1.5, 0, 1, 0, 0, 1, 0, 5, 1, 6, 1.5, 6], [2.5, 0, 3, 0, 4, 1, 4, 5, 3, 6, 2.5, 6]];
  const GLY = {
    A: [[0, 6, 0, 1.4, 1, 0, 1.5, 0], [2.5, 0, 3, 0, 4, 1.4, 4, 6], [0.6, 3.4, 3.4, 3.4]],
    B: [[0, 0, 0, 6], [1, 0, 3, 0, 4, 0.9, 4, 2, 3.1, 2.9, 1, 2.9], [1, 3.1, 3.1, 3.1, 4, 4, 4, 5.1, 3, 6, 1, 6]],
    C: [[4, 1.1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 4.9]],
    D: [[0, 0, 0, 6], [1, 0, 2.6, 0, 4, 1.4, 4, 4.6, 2.6, 6, 1, 6]],
    E: [[0, 0, 0, 6], [1, 0, 4, 0], [1, 3, 3.4, 3], [1, 6, 4, 6]],
    F: [[0, 0, 0, 6], [1, 0, 4, 0], [1, 3, 3.4, 3]],
    G: [[4, 1.1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 3.3, 2.3, 3.3]],
    H: [[0, 0, 0, 6], [4, 0, 4, 6], [0.6, 3, 3.4, 3]],
    I: [[0, 0, 0, 6]],
    J: [[4, 0, 4, 5, 3, 6, 1, 6, 0, 5, 0, 4.2]],
    K: [[0, 0, 0, 6], [4, 0, 1.3, 3, 4, 6]],
    L: [[0, 0, 0, 6, 4, 6]],
    M: [[0, 6, 0, 0, 2.5, 3.6, 5, 0, 5, 6]],
    N: [[0, 6, 0, 0, 4, 6, 4, 0]],
    O: O_,
    P: [[0, 0, 0, 6], [1, 0, 3, 0, 4, 1, 4, 2.3, 3, 3.3, 1, 3.3]],
    Q: O_.concat([[2.6, 4.4, 4.3, 6.3]]),
    R: [[0, 0, 0, 6], [1, 0, 3, 0, 4, 1, 4, 2, 3, 3, 1, 3], [2.3, 3, 4, 6]],
    S: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 2, 1, 3, 3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5]],
    T: [[0, 0, 4, 0], [2, 1, 2, 6]],
    U: [[0, 0, 0, 5, 1, 6, 3, 6, 4, 5, 4, 0]],
    V: [[0, 0, 2, 6, 4, 0]],
    W: [[0, 0, 1.2, 6, 2.5, 1.8, 3.8, 6, 5, 0]],
    X: [[0, 0, 4, 6], [4, 0, 0, 6]],
    Y: [[0, 0, 2, 3, 4, 0], [2, 3, 2, 6]],
    Z: [[0, 0, 4, 0, 0, 6, 4, 6]],
    0: O_,
    1: [[0, 1.2, 1.4, 0, 1.4, 6]],
    2: [[0, 1, 1, 0, 3, 0, 4, 1, 4, 2.2, 0, 6, 4, 6]],
    3: [[0, 0, 4, 0, 1.8, 2.6, 3, 2.6, 4, 3.6, 4, 5, 3, 6, 1, 6, 0, 5]],
    4: [[3, 6, 3, 0, 0, 4.2, 4.2, 4.2]],
    5: [[4, 0, 0.2, 0, 0, 2.7, 3, 2.7, 4, 3.7, 4, 5, 3, 6, 0, 6]],
    6: [[3.6, 0, 1.4, 0, 0, 1.4, 0, 5, 1, 6, 3, 6, 4, 5, 4, 3.8, 3, 2.8, 1, 2.8]],
    7: [[0, 0, 4, 0, 1.4, 6]],
    8: [[1.5, 0, 1, 0, 0, 1, 0, 2, 1, 2.9, 3, 3.1, 4, 4, 4, 5, 3, 6, 2.5, 6], [2.5, 0, 3, 0, 4, 1, 4, 2, 3, 2.9, 1, 3.1, 0, 4, 0, 5, 1, 6, 1.5, 6]],
    9: [[0.4, 6, 2.6, 6, 4, 4.6, 4, 1, 3, 0, 1, 0, 0, 1, 0, 2.2, 1, 3.2, 3, 3.2]],
    '-': [[0.5, 3, 3.5, 3]], '.': [[0.4, 5.3, 0.4, 6]], '/': [[3.3, 0, 0.7, 6]], ':': [[0.4, 1.4, 0.4, 2.2], [0.4, 4.4, 0.4, 5.2]],
    '·': [[0.4, 2.6, 0.4, 3.4]], '×': [[0.6, 1.8, 3.4, 4.6], [3.4, 1.8, 0.6, 4.6]], '№': [[0, 6, 0, 0, 3, 6, 3, 0], [4.4, 1.4, 5.6, 1.4], [4.4, 3, 5.6, 3]],
  };
  const ADV = {};
  function advOf(ch) {
    if (ADV[ch] != null) return ADV[ch];
    const g = GLY[ch];
    let mx = 0;
    if (g) g.forEach((s) => { for (let i = 0; i < s.length; i += 2) mx = Math.max(mx, s[i]); });
    ADV[ch] = g ? mx + 2 : 2.8;
    return ADV[ch];
  }
  function textW(str, size) { let w = 0; for (const ch of str) w += advOf(ch); return (w - 2 + 1.2) * size / 6; }
  // Строка трафаретом: левый верхний угол в (0, 0), высота букв size
  function stencilText(x, str, size, col, lw) {
    const k = size / 6;
    x.save(); x.scale(k, k); x.translate(0.6, 0.6);
    x.lineWidth = lw || 1.2; x.lineCap = 'butt'; x.lineJoin = 'miter'; x.miterLimit = 3; x.strokeStyle = col;
    let cx = 0;
    for (const ch of str) {
      const g = GLY[ch];
      if (g) {
        g.forEach((s) => { x.beginPath(); for (let i = 0; i < s.length; i += 2) { if (i) x.lineTo(cx + s[i], s[i + 1]); else x.moveTo(cx + s[i], s[i + 1]); } x.stroke(); });
      }
      cx += advOf(ch);
    }
    x.restore();
  }

  // ---------- Декали: надписи, наклейки, гравировки ----------
  // Рисуются плоско на отдельном холсте (DPX пикселей на единицу) и кладутся на грань по её локальной матрице
  const DPX = 2.5;
  function canv(w, h) { const c = mk(Math.max(1, Math.ceil(w * DPX)), Math.max(1, Math.ceil(h * DPX))), x = c.getContext('2d'); x.scale(DPX, DPX); return [c, x]; }
  function tinted(c, col) { const t = mk(c.width, c.height), x = t.getContext('2d'); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, t.width, t.height); return t; }
  function litCanvas(c, L) {
    if (Math.abs(L - 1) < 0.03) return c;
    const x = c.getContext('2d');
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop';
    x.fillStyle = L < 1 ? 'rgba(0,0,0,' + clamp(1 - L, 0, 0.9) + ')' : 'rgba(255,255,255,' + clamp((L - 1) * 0.5, 0, 0.3) + ')';
    x.fillRect(0, 0, c.width, c.height); x.restore();
    return c;
  }
  // Потёртость декали: выбить пятна по маске шума
  function wearCanvas(c, R, a) {
    const x = c.getContext('2d'), sp = speckle(), k = (0.45 + R() * 0.6) * DPX;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-out'; x.globalAlpha = a;
    const ox = -R() * 128 * k, oy = -R() * 128 * k;
    for (let yy = oy; yy < c.height; yy += 128 * k) for (let xx = ox; xx < c.width; xx += 128 * k) x.drawImage(sp, xx, yy, 128 * k, 128 * k);
    x.restore();
    return c;
  }
  // Положить декаль: центр (s, t), размер w×h; затенение — как у грани; hv/gv — высота и блеск (по маске)
  function putDecal(F, s, t, c, w, h, o) {
    o = o || {};
    const x = LC; x.save(); F.at(x, s, t); if (o.rot) x.rotate(o.rot);
    if (o.alpha != null) x.globalAlpha = o.alpha;
    if (o.op) x.globalCompositeOperation = o.op;
    x.drawImage(o.raw ? c : litCanvas(c, F.lit * (o.k || 1)), -w / 2, -h / 2, w, h);
    x.restore();
    [[LH, o.hv], [LG, o.gv]].forEach((p) => {
      if (p[1] == null) return;
      const y = p[0]; y.save(); F.at(y, s, t); if (o.rot) y.rotate(o.rot); y.drawImage(tinted(c, gray(p[1])), -w / 2, -h / 2, w, h); y.restore();
    });
  }
  // Надпись трафаретом (краска с лёгким напылением и потёртостями)
  function stencilDecal(str, size, col, R, wear) {
    const w = textW(str, size) + 2, h = size * 7.2 / 6 + 2, cc = canv(w, h), x = cc[1];
    x.translate(1, 1);
    x.save(); x.globalAlpha = 0.14; stencilText(x, str, size, col, 1.8); x.restore();
    stencilText(x, str, size, col);
    if (wear) wearCanvas(cc[0], R, wear);
    return { c: cc[0], w: w, h: h };
  }
  function stencil(F, s, t, str, size, col, R, o) {
    o = o || {};
    const d = stencilDecal(str, size, col, R, o.wear == null ? 0.35 : o.wear);
    const dx = o.align === 'left' ? d.w / 2 : o.align === 'right' ? -d.w / 2 : 0;
    putDecal(F, s + dx, t, d.c, d.w, d.h, { rot: o.rot, alpha: o.alpha == null ? 0.88 : o.alpha });
    return d.w;
  }
  // Печатный текст (этикетки, таблички)
  function txt(x, str, X, Y, size, col, o) {
    o = o || {};
    x.font = (o.w || 'bold') + ' ' + size + 'px ' + (o.serif ? 'Georgia, "Times New Roman", serif' : 'Arial, Helvetica, sans-serif');
    x.fillStyle = col; x.textAlign = o.align || 'left'; x.textBaseline = 'alphabetic';
    if (o.sx) { x.save(); x.translate(X, Y); x.scale(o.sx, 1); x.fillText(str, 0, 0); x.restore(); } else x.fillText(str, X, Y);
  }
  // Бумажная этикетка: штрихкод, матричный код, накладная или отметка ОТК
  function paperLabel(w, h, kind, S, R) {
    const cc = canv(w, h), x = cc[1], ink = '#17191c';
    x.fillStyle = css(mixc([234, 230, 219], S.acc, 0.05)); x.fillRect(0, 0, w, h);
    const lines = (x0, y0, n, lw, step) => { for (let i = 0; i < n; i++) { x.fillStyle = 'rgba(23,25,28,' + (0.5 + R() * 0.3) + ')'; x.fillRect(x0, y0 + i * step, lw * (0.45 + R() * 0.55), step * 0.42); } };
    if (kind === 'bar') {
      x.fillStyle = css(S.acc); x.fillRect(0, 0, w, h * 0.16);
      txt(x, 'CASE·LAB', 2, h * 0.13, h * 0.12, '#fff', {});
      x.fillStyle = ink;
      for (let px = 3; px < w * 0.62; px += 0.6 + Math.floor(R() * 3) * 0.5) { const bw = 0.35 + Math.floor(R() * 3) * 0.35; x.fillRect(px, h * 0.28, bw, h * 0.4); px += bw; }
      txt(x, S.code.sn, 3, h * 0.84, h * 0.12, ink, { w: 'normal' });
      lines(w * 0.68, h * 0.3, 4, w * 0.28, h * 0.13);
    } else if (kind === 'qr') {
      const n = 13, cs = Math.min(h * 0.8, w * 0.4) / n, x0 = 3, y0 = (h - cs * n) / 2;
      x.fillStyle = ink;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (R() < 0.46) x.fillRect(x0 + i * cs, y0 + j * cs, cs + 0.05, cs + 0.05);
      [[0, 0], [n - 4, 0], [0, n - 4]].forEach((q) => {
        x.fillStyle = '#ebe7dc'; x.fillRect(x0 + q[0] * cs, y0 + q[1] * cs, cs * 4, cs * 4);
        x.fillStyle = ink; x.fillRect(x0 + q[0] * cs, y0 + q[1] * cs, cs * 3.5, cs * 3.5);
        x.fillStyle = '#ebe7dc'; x.fillRect(x0 + (q[0] + 0.5) * cs, y0 + (q[1] + 0.5) * cs, cs * 2.5, cs * 2.5);
        x.fillStyle = ink; x.fillRect(x0 + (q[0] + 1) * cs, y0 + (q[1] + 1) * cs, cs * 1.5, cs * 1.5);
      });
      const tx = x0 + cs * n + 3;
      txt(x, S.code.cl, tx, h * 0.3, h * 0.17, ink, {});
      txt(x, S.code.lot, tx, h * 0.52, h * 0.11, ink, { w: 'normal' });
      lines(tx, h * 0.62, 3, w - tx - 3, h * 0.11);
    } else if (kind === 'ship') {
      x.strokeStyle = ink; x.lineWidth = 0.5; x.strokeRect(1.5, 1.5, w - 3, h - 3);
      txt(x, 'CASE·LAB', 3.5, h * 0.3, h * 0.2, ink, {});
      x.fillStyle = ink; x.fillRect(1.5, h * 0.38, w - 3, 0.5);
      txt(x, 'FROM: ' + S.code.lot, 3.5, h * 0.55, h * 0.11, ink, { w: 'normal' });
      txt(x, 'GW ' + S.code.kg, 3.5, h * 0.72, h * 0.11, ink, { w: 'normal' });
      txt(x, S.code.batch, w - 3.5, h * 0.88, h * 0.13, ink, { align: 'right' });
    } else {
      txt(x, 'QC', 3, h * 0.36, h * 0.24, ink, {});
      lines(3, h * 0.48, 3, w * 0.5, h * 0.14);
      x.save(); x.translate(w * 0.72, h * 0.5); x.rotate(-0.25);
      x.strokeStyle = css(S.ink, 0.8); x.lineWidth = 0.7; x.beginPath(); x.arc(0, 0, h * 0.34, 0, TAU); x.stroke();
      x.beginPath(); x.arc(0, 0, h * 0.24, 0, TAU); x.stroke();
      txt(x, 'OK', 0, h * 0.07, h * 0.18, css(S.ink, 0.85), { align: 'center' });
      x.restore();
    }
    // старение: пятна и выцветание
    x.save(); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.18; x.drawImage(Tex.grime(), -R() * 100, -R() * 80, 220, 160); x.restore();
    wearCanvas(cc[0], R, 0.18);
    return cc[0];
  }
  function label(F, s, t, w, h, kind, S, R, rot) {
    const c = paperLabel(w, h, kind, S, R);
    each((x, m) => {
      if (m !== 'c') return;
      x.save(); F.at(x, s, t); x.rotate(rot || 0); x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 1.5; x.shadowOffsetX = 0.5; x.shadowOffsetY = 0.8;
      x.fillStyle = '#000'; x.fillRect(-w / 2, -h / 2, w, h); x.restore();
    });
    putDecal(F, s, t, c, w, h, { rot: rot, gv: 0.12, hv: 0.52 });
  }
  // Штамп ОТК чернилами
  function inkStamp(F, s, t, r, S, R) {
    const cc = canv(r * 2 + 2, r * 2 + 2), x = cc[1], col = css(S.ink, 0.85);
    x.translate(r + 1, r + 1); x.rotate((R() - 0.5) * 0.8);
    x.strokeStyle = col; x.lineWidth = r * 0.07; x.beginPath(); x.arc(0, 0, r * 0.94, 0, TAU); x.stroke();
    x.lineWidth = r * 0.04; x.beginPath(); x.arc(0, 0, r * 0.7, 0, TAU); x.stroke();
    txt(x, 'CASE·LAB', 0, -r * 0.74, r * 0.2, col, { align: 'center' });
    txt(x, S.code.batch, 0, r * 0.14, r * 0.34, col, { align: 'center' });
    txt(x, 'QC ' + (1 + Math.floor(R() * 9)), 0, r * 0.9, r * 0.2, col, { align: 'center' });
    wearCanvas(cc[0], R, 0.5);
    putDecal(F, s, t, cc[0], r * 2 + 2, r * 2 + 2, { alpha: 0.75 });
  }
  // Предупреждающий знак: треугольник с «!» или молнией, «верх» (стрелки), «хрупкое» (бокал)
  function warnSign(F, s, t, sz, kind, S, R) {
    const cc = canv(sz, sz), x = cc[1];
    if (kind === 'up') {
      x.fillStyle = S.sten;
      [0.28, 0.72].forEach((k) => { x.beginPath(); x.moveTo(sz * k, sz * 0.1); x.lineTo(sz * (k + 0.17), sz * 0.36); x.lineTo(sz * (k + 0.06), sz * 0.36); x.lineTo(sz * (k + 0.06), sz * 0.74); x.lineTo(sz * (k - 0.06), sz * 0.74); x.lineTo(sz * (k - 0.06), sz * 0.36); x.lineTo(sz * (k - 0.17), sz * 0.36); x.closePath(); x.fill(); });
      x.fillRect(sz * 0.08, sz * 0.82, sz * 0.84, sz * 0.08);
      wearCanvas(cc[0], R, 0.3);
      putDecal(F, s, t, cc[0], sz, sz, { alpha: 0.85 });
      return;
    }
    if (kind === 'glass') {
      x.fillStyle = '#ece8de'; x.fillRect(0, 0, sz, sz);
      x.strokeStyle = '#a3262b'; x.fillStyle = '#a3262b'; x.lineWidth = sz * 0.06;
      x.beginPath(); x.moveTo(sz * 0.32, sz * 0.14); x.lineTo(sz * 0.68, sz * 0.14); x.quadraticCurveTo(sz * 0.7, sz * 0.5, sz * 0.5, sz * 0.52); x.quadraticCurveTo(sz * 0.3, sz * 0.5, sz * 0.32, sz * 0.14); x.fill();
      x.beginPath(); x.moveTo(sz * 0.5, sz * 0.52); x.lineTo(sz * 0.5, sz * 0.78); x.moveTo(sz * 0.34, sz * 0.82); x.lineTo(sz * 0.66, sz * 0.82); x.stroke();
      wearCanvas(cc[0], R, 0.12);
      putDecal(F, s, t, cc[0], sz, sz, { gv: 0.12 });
      return;
    }
    const yel = [214, 172, 52];
    x.beginPath(); x.moveTo(sz / 2, sz * 0.06); x.lineTo(sz * 0.96, sz * 0.9); x.lineTo(sz * 0.04, sz * 0.9); x.closePath();
    x.fillStyle = css(yel); x.fill(); x.lineWidth = sz * 0.07; x.strokeStyle = '#16171a'; x.lineJoin = 'round'; x.stroke();
    x.fillStyle = '#16171a';
    if (kind === 'volt') {
      x.beginPath(); x.moveTo(sz * 0.54, sz * 0.3); x.lineTo(sz * 0.4, sz * 0.6); x.lineTo(sz * 0.5, sz * 0.6); x.lineTo(sz * 0.45, sz * 0.82); x.lineTo(sz * 0.62, sz * 0.5); x.lineTo(sz * 0.52, sz * 0.5); x.closePath(); x.fill();
    } else { x.fillRect(sz * 0.46, sz * 0.34, sz * 0.08, sz * 0.32); x.fillRect(sz * 0.46, sz * 0.72, sz * 0.08, sz * 0.08); }
    wearCanvas(cc[0], R, 0.15);
    putDecal(F, s, t, cc[0], sz, sz, { gv: 0.14 });
  }
  // Пломба-лента через шов крышки
  function sealTape(F, s, t, w, h, S, R) {
    const cc = canv(w, h), x = cc[1];
    x.fillStyle = css(mixc([228, 224, 214], S.acc, 0.08)); x.fillRect(0, 0, w, h);
    x.fillStyle = css(mul(S.acc, 0.8)); x.fillRect(0, 0, w, h * 0.12); x.fillRect(0, h * 0.88, w, h * 0.12);
    x.save(); x.translate(w * 0.62, h * 0.5); x.rotate(-Math.PI / 2);
    txt(x, 'SEALED · CASE·LAB', 0, w * 0.12, w * 0.28, '#24262a', { align: 'center' });
    x.restore();
    txt(x, S.code.batch, w * 0.5, h * 0.82, w * 0.22, '#24262a', { align: 'center', w: 'normal' });
    wearCanvas(cc[0], R, 0.2);
    putDecal(F, s, t, cc[0], w, h, { gv: 0.2, rot: (R() - 0.5) * 0.06 });
  }
  // Цветная маркировочная полоса (краска)
  function band(F, t0, t1, col, s0, s1) {
    const a = s0 || 0, b = s1 || F.w;
    each((x, m) => {
      if (m !== 'c') return;
      F.pp(x, [[a, t0], [b, t0], [b, t1], [a, t1]]);
      x.fillStyle = css(mul(col, F.lit), 0.82); x.fill();
      x.save(); x.clip(); grimeOn(x, 0.25); x.restore();
    });
  }

  // ---------- Оружие на ящике ----------
  // Рамка силуэта оружия в координатах модели (кэш)
  const WB = {};
  function wbox(id) {
    if (WB[id]) return WB[id];
    const c = mk(256, 96), x = c.getContext('2d');
    x.scale(0.5, 0.5); drawWeapon(x, id, null, { mono: '#fff' });
    const d = x.getImageData(0, 0, 256, 96).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let j = 0; j < 96; j++) for (let i = 0; i < 256; i++) if (d[(j * 256 + i) * 4 + 3] > 24) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
    WB[id] = x1 < 0 ? { x0: 0, y0: 0, x1: 512, y1: 192 } : { x0: x0 * 2, y0: y0 * 2, x1: (x1 + 1) * 2, y1: (y1 + 1) * 2 };
    return WB[id];
  }
  // Оружие в декали w×h (по центру, стволом/клинком влево, как картинки предметов): { mono } или { fin }
  function weaponDecal(id, w, h, how) {
    const cc = canv(w, h), x = cc[1];
    const b = wbox(id), bw = b.x1 - b.x0, bh = b.y1 - b.y0, k = Math.min(w / bw, h / bh);
    x.translate(w / 2, h / 2); x.scale(-k, k); x.translate(-(b.x0 + bw / 2), -(b.y0 + bh / 2));
    if (how.mono) drawWeapon(x, id, null, { mono: how.mono });
    else drawWeapon(x, id, how.fin || 'plain', { px: k * DPX, shadow: false });
    return cc[0];
  }
  // Трафарет оружия краской (с напылением и потёртостями)
  function weaponStencil(F, s, t, w, h, S, R, o) {
    o = o || {};
    const m = weaponDecal(S.weap, w, h, { mono: o.col || S.sten });
    const cc = canv(w, h), x = cc[1];
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 0.2; x.drawImage(m, -1.5, 0); x.drawImage(m, 1.5, 0); x.drawImage(m, 0, -1.5); x.drawImage(m, 0, 1.5);
    x.globalAlpha = 1; x.drawImage(m, 0, 0);
    wearCanvas(cc[0], R, o.wear == null ? 0.4 : o.wear);
    putDecal(F, s, t, cc[0], w, h, { alpha: o.alpha == null ? 0.9 : o.alpha });
  }
  // Гравировка оружия на металле: тёмный силуэт с бликом по нижней кромке и штриховкой
  function weaponEngrave(F, s, t, w, h, S, pal) {
    const p = palOf(pal), m = weaponDecal(S.weap, w, h, { mono: '#fff' });
    const c = mk(m.width, m.height), x = c.getContext('2d');
    x.drawImage(tinted(m, css(p[0])), 2, 2.2);
    x.drawImage(tinted(m, css(mul(p[3], 0.75))), 0, 0);
    x.globalCompositeOperation = 'source-atop'; x.strokeStyle = css(p[2], 0.55); x.lineWidth = 1.1;
    for (let i = -c.height; i < c.width; i += 4) { x.beginPath(); x.moveTo(i, c.height); x.lineTo(i + c.height * 0.7, 0); x.stroke(); }
    putDecal(F, s, t, c, w, h, { hv: 0.5, gv: 0.45 });
  }
  // Рельеф оружия (чеканка на медальоне реликвария): металл с объёмом из карты высот
  function weaponRelief(F, s, t, w, h, S, pal) {
    const p = palOf(pal), m = weaponDecal(S.weap, w, h, { mono: '#fff' });
    const c = mk(m.width, m.height), x = c.getContext('2d');
    x.drawImage(m, 0, 0);
    x.globalCompositeOperation = 'source-in';
    const g = x.createLinearGradient(0, 0, 0, c.height); g.addColorStop(0, css(p[0])); g.addColorStop(0.5, css(p[1])); g.addColorStop(1, css(p[2]));
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    each((y, mm) => {
      if (mm !== 'c') return;
      y.save(); F.at(y, s, t); y.shadowColor = 'rgba(0,0,0,.6)'; y.shadowBlur = 2.5; y.shadowOffsetX = 1; y.shadowOffsetY = 1.6;
      y.drawImage(tinted(m, '#000'), -w / 2, -h / 2, w, h); y.restore();
    });
    putDecal(F, s, t, c, w, h, { hv: 0.8, gv: 0.95 });
  }
  // Тиснение по коже: вдавленный тёмный силуэт со светлой нижней кромкой
  function weaponEmboss(F, s, t, w, h, S, col) {
    const m = weaponDecal(S.weap, w, h, { mono: '#fff' });
    const c = mk(m.width, m.height), x = c.getContext('2d');
    x.drawImage(tinted(m, css(mixc(col, WHITE, 0.3), 0.85)), 1.8, 2);
    x.drawImage(tinted(m, css(mul(col, 0.42))), 0, 0);
    putDecal(F, s, t, c, w, h, { hv: 0.5 });
  }
  // Печать оружия на наклейке/шильде (в раскраске эмблемы или заводской)
  function weaponPrint(F, s, t, w, h, S, o) {
    o = o || {};
    const c = weaponDecal(S.weap, w, h, o.mono ? { mono: o.mono } : { fin: S.fin });
    putDecal(F, s, t, c, w, h, { alpha: o.alpha, hv: o.hv, gv: o.gv });
  }
  // Окно с поролоном: нож (или оружие) лежит в вырезе, рамка на винтах, стекло
  function weaponWindow(F, s, t, w, h, S, R, frame) {
    const L = F.lit, b = 6.5, fr = frame || 'silver';
    slab(F, rrPts(s - w / 2, t - h / 2, w, h, 3), { pal: fr, h: 0.66, g: 0.85, sh: 0.45 });
    const inner = rrPts(s - w / 2 + b, t - h / 2 + b, w - 2 * b, h - 2 * b, 2);
    const iw = w - 2 * b, ih = h - 2 * b;
    const sil = weaponDecal(S.weap, iw - 14, ih - 12, { mono: '#fff' });
    const knife = litCanvas(weaponDecal(S.weap, iw - 14, ih - 12, { fin: S.fin || 'plain' }), 0.9);
    // вырез: силуэт, раздутый во все стороны
    const cut = mk(sil.width + 16, sil.height + 16), cx = cut.getContext('2d');
    for (let a = 0; a < 16; a++) cx.drawImage(sil, 8 + Math.cos(a / 16 * TAU) * 6, 8 + Math.sin(a / 16 * TAU) * 6);
    const cw = (iw - 14) * (cut.width / sil.width), ch = (ih - 12) * (cut.height / sil.height);
    each((x, m) => {
      F.pp(x, inner);
      if (m === 'h') { x.fillStyle = gray(0.34); x.fill(); }
      else if (m === 'g') { x.fillStyle = gray(0.04); x.fill(); }
      else { x.fillStyle = css(mul(S.foam, L)); x.fill(); }
      x.save(); x.clip();
      if (m === 'c') {
        grainOn(x, 3);
        // тень рамки на поролоне (свет сверху слева)
        x.save();
        x.shadowColor = 'rgba(0,0,0,.7)'; x.shadowBlur = 6; x.shadowOffsetX = 2.5; x.shadowOffsetY = 3.5;
        x.beginPath();
        [rrPts(s - w / 2 - 30, t - h / 2 - 30, w + 60, h + 60, 0), inner].forEach((pts) => {
          pts.forEach((q, i) => { const p = F.p(q[0], q[1]); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); });
          x.closePath();
        });
        x.fillStyle = '#000'; x.fill('evenodd'); x.restore();
      }
      F.at(x, s, t);
      x.drawImage(tinted(cut, m === 'c' ? css(mul([12, 13, 15], L)) : gray(m === 'h' ? 0.16 : 0.02)), -cw / 2, -ch / 2, cw, ch);
      if (m === 'c') {
        x.globalAlpha = 0.55; x.drawImage(tinted(sil, '#000'), -(iw - 14) / 2 + 1.5, -(ih - 12) / 2 + 2, iw - 14, ih - 12); x.globalAlpha = 1;
        x.drawImage(knife, -(iw - 14) / 2 - 0.5, -(ih - 12) / 2 - 0.8, iw - 14, ih - 12);
      } else x.drawImage(tinted(sil, gray(m === 'h' ? 0.46 : 0.7)), -(iw - 14) / 2 - 0.5, -(ih - 12) / 2 - 0.8, iw - 14, ih - 12);
      x.restore();
    });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((d) => screw(F, s + d[0] * (w / 2 - 3.3), t + d[1] * (h / 2 - 3.3), 1.5, 'hex', 0, fr));
    // стекло — после света: едва заметный косой отблеск и светлая кромка
    POST.push(() => {
      const x = LC; x.save(); F.pp(x, inner); x.clip();
      const g = F.lg(x, s - w / 2, t - h / 2, s - w / 2 + h * 0.9, t + h / 2);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.08)');
      g.addColorStop(0.62, 'rgba(255,255,255,.03)'); g.addColorStop(0.7, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, CW, CH);
      x.restore();
    });
  }
  // Наклейка с оружием (винил): тёмная или светлая основа, тонкая рамка, подписи
  function weaponSticker(F, s, t, w, h, S, R, o) {
    o = o || {};
    const cc = canv(w, h), x = cc[1], dark = o.dark !== false;
    const bg = dark ? mixc([22, 24, 28], S.body, 0.25) : [232, 229, 220];
    rr(x, 0, 0, w, h, 2); x.fillStyle = css(bg); x.fill();
    x.strokeStyle = css(S.acc, 0.85); x.lineWidth = 0.6; rr(x, 2, 2, w - 4, h - 4, 1.5); x.stroke();
    x.fillStyle = css(S.acc); x.fillRect(2, h - 6.5, w * 0.34, 1.2);
    txt(x, 'CASE·LAB', 4.5, 8.5, 4.2, dark ? 'rgba(235,238,242,.85)' : '#1b1d21', {});
    txt(x, S.code.cl + ' · ' + S.code.model, w - 4.5, 8.5, 3.6, css(dark ? mixc(S.acc, WHITE, 0.3) : mul(S.acc, 0.7)), { align: 'right', w: 'normal' });
    const wd = weaponDecal(S.weap, w - 14, h - 22, S.fin && !S.neon ? { fin: S.fin } : { mono: css(dark ? mixc(S.acc, WHITE, 0.15) : mul(S.acc, 0.85)) });
    x.drawImage(wd, 7, 11, w - 14, h - 22);
    x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.12; x.drawImage(Tex.grime(), -R() * 90, -R() * 70, 200, 150);
    wearCanvas(cc[0], R, 0.1);
    each((y, m) => {
      if (m !== 'c') return;
      y.save(); F.at(y, s, t); y.shadowColor = 'rgba(0,0,0,.35)'; y.shadowBlur = 1.4; y.shadowOffsetX = 0.5; y.shadowOffsetY = 0.8;
      rr(y, -w / 2, -h / 2, w, h, 2); y.fillStyle = '#000'; y.fill(); y.restore();
    });
    putDecal(F, s, t, cc[0], w, h, { gv: 0.4, hv: 0.52 });
  }
  // Металлическая табличка на винтах (гравировка оружия или надписи)
  function plate(F, s, t, w, h, pal, o) {
    o = o || {};
    slab(F, rrPts(s - w / 2, t - h / 2, w, h, o.r == null ? 2 : o.r), { pal: pal, h: 0.62, g: 0.9, sh: 0.45 });
    if (o.line !== false) groove(F, rrPts(s - w / 2 + 3, t - h / 2 + 3, w - 6, h - 6, 1.2), 0.5, 0.3, true);
    if (o.screws !== false) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((d) => screw(F, s + d[0] * (w / 2 - 4), t + d[1] * (h / 2 - 4), 1.5, o.screw || 'slot', d[0] * 0.6, pal));
  }
  // Гравированная надпись на табличке
  function engraveText(F, s, t, str, size, pal, o) {
    o = o || {};
    const p = palOf(pal), x0 = canv(1, 1)[1];
    x0.font = 'bold ' + size + 'px ' + (o.serif ? 'Georgia, serif' : 'Arial, sans-serif');
    const w = x0.measureText(str).width * (o.sx || 1) + 2, h = size * 1.3;
    const cc = canv(w, h), x = cc[1];
    txt(x, str, w / 2 + 0.35, h * 0.8 + 0.35, size, css(p[0]), { align: 'center', serif: o.serif, sx: o.sx });
    txt(x, str, w / 2, h * 0.8, size, css(mul(p[3], 0.8)), { align: 'center', serif: o.serif, sx: o.sx });
    putDecal(F, s, t, cc[0], w, h, { hv: 0.54 });
  }
  // Эмблема-контур (ромб, щит, шестигранник, круг) — для рамок трафарета и медальонов
  function shapePath(x, kind, r) {
    x.beginPath();
    switch (kind) {
      case 'circle': x.arc(0, 0, r, 0, TAU); break;
      case 'shield':
        x.moveTo(-r, -r * 0.9); x.lineTo(r, -r * 0.9); x.lineTo(r, -r * 0.05);
        x.quadraticCurveTo(r, r * 0.72, 0, r * 1.04); x.quadraticCurveTo(-r, r * 0.72, -r, -r * 0.05); x.closePath(); break;
      case 'hex': for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x.lineTo(r * 1.06 * Math.cos(a), r * 0.92 * Math.sin(a)); } x.closePath(); break;
      default: x.moveTo(0, -r); x.lineTo(r * 1.15, 0); x.lineTo(0, r); x.lineTo(-r * 1.15, 0); x.closePath();
    }
  }
  // Вставка из раскраски кейса: приглушённая (меньше насыщенности и яркости), в тонкой рамке
  function inlay(F, s, t, w, h, fin, o) {
    o = o || {};
    if (!fin || !FINISHES[fin]) return;
    const tex = Tex.get(fin), R = o.R || Tex.rng(7);
    const sh = Math.min(tex.height, tex.width * h / w) / (o.zoom || 1), sw = sh * w / h;     // zoom — крупнее узор
    const sx = R() * (tex.width - sw), sy = R() * Math.max(0, tex.height - sh);
    each((x, m) => {
      if (o.shape) { F.at(x, s, t); o.shape(x); x.setTransform(1, 0, 0, 1, 0, 0); }
      else F.pp(x, rrPts(s - w / 2, t - h / 2, w, h, o.r || 0));
      if (m === 'h') { x.fillStyle = gray(o.h || 0.47); x.fill(); return; }
      if (m === 'g') { x.fillStyle = gray(o.g == null ? 0.55 : o.g); x.fill(); return; }
      x.clip();
      F.at(x, s, t); if (o.soft) x.filter = 'blur(' + o.soft + 'px)'; x.drawImage(tex, sx, sy, sw, sh, -w / 2, -h / 2, w, h); x.filter = 'none';
      x.setTransform(1, 0, 0, 1, 0, 0);
      const ds = o.desat == null ? 0.55 : o.desat, kk = o.k || 0.78;
      x.globalCompositeOperation = 'saturation'; x.fillStyle = 'rgba(128,128,128,' + (CUR && CUR.neon ? Math.max(ds, 0.78) : ds) + ')'; x.fillRect(0, 0, CW, CH);
      x.globalCompositeOperation = 'multiply'; x.fillStyle = css(mul([255, 250, 240], clamp(F.lit * (CUR && CUR.neon ? Math.min(kk, 0.7) : kk), 0, 1))); x.fillRect(0, 0, CW, CH);
      x.globalCompositeOperation = 'source-over';
      const g = F.lg(x, s, t - h / 2, s, t + h / 2); g.addColorStop(0, 'rgba(255,255,255,.08)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.18)');
      x.fillStyle = g; x.fillRect(0, 0, CW, CH);
    });
  }

  // ---------- Сейф: диск, клавиатура, штурвал, рычаг, петли ----------
  function dial(F, s, t, r, pal) {
    const L = F.lit, p = palOf(pal);
    each((x, m) => {
      F.at(x, s, t);
      x.beginPath(); x.arc(0, 0, r * 1.18, 0, TAU); part(x, m, L, pal, 0.6, 0.85, -r * 1.18, r * 1.18, 0.45);   // розетка
      x.beginPath(); x.arc(0, 0, r, 0, TAU); part(x, m, L, METAL.black, 0.68, 0.6, -r, r, 0.5);                // диск
      if (m === 'c') {
        x.strokeStyle = css(mul(p[0], L), 0.9);
        for (let i = 0; i < 50; i++) {
          const a = i / 50 * TAU - Math.PI / 2, l = i % 5 ? 0.12 : 0.22;
          x.lineWidth = i % 5 ? 0.45 : 0.8; x.beginPath(); x.moveTo(Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94); x.lineTo(Math.cos(a) * r * (0.94 - l), Math.sin(a) * r * (0.94 - l)); x.stroke();
        }
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * TAU - Math.PI / 2;
          txt(x, String(i * 10), Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6 + r * 0.06, r * 0.15, css(mul(p[0], L), 0.85), { align: 'center' });
        }
        x.fillStyle = css(mul(p[1], L)); x.beginPath(); x.moveTo(0, -r * 1.13); x.lineTo(r * 0.07, -r * 1.24); x.lineTo(-r * 0.07, -r * 1.24); x.closePath(); x.fill();
      }
      x.beginPath(); x.arc(0, 0, r * 0.36, 0, TAU); part(x, m, L, METAL.black, 0.8, 0.7, -r * 0.36, r * 0.36, 0.5);
      if (m === 'c') { x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 0.5; for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; x.beginPath(); x.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); x.lineTo(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36); x.stroke(); } }
    });
  }
  function keypad(F, s, t, w, h, pal) {
    const L = F.lit, kb = METAL.black;
    each((x, m) => {
      F.at(x, s, t);
      rr(x, -w / 2, -h / 2, w, h, 3); part(x, m, L, pal, 0.62, 0.85, -h / 2, h / 2, 0.5);
      rr(x, -w / 2 + 4, -h / 2 + 4, w - 8, h * 0.2, 1.5);
      if (m === 'c') { const g = x.createLinearGradient(0, -h / 2, 0, -h / 2 + h * 0.2 + 4); g.addColorStop(0, css(mul([40, 52, 46], L))); g.addColorStop(1, css(mul([22, 30, 27], L))); x.fillStyle = g; x.fill(); txt(x, '- - - -', 0, -h / 2 + h * 0.16, h * 0.1, 'rgba(160,200,170,.45)', { align: 'center' }); }
      else { x.fillStyle = gray(m === 'h' ? 0.52 : 0.9); x.fill(); }
      const bw = (w - 14) / 3, bh = (h * 0.7 - 10) / 4;
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 3; i++) {
          const bx = -w / 2 + 5 + i * (bw + 2), by = -h / 2 + h * 0.3 + j * (bh + 2);
          rr(x, bx, by, bw, bh, 1.2); part(x, m, L, kb, 0.7, 0.4, by, by + bh, 0.3);
          if (m === 'c') txt(x, '123456789*0#'[j * 3 + i], bx + bw / 2, by + bh * 0.72, bh * 0.55, 'rgba(225,228,232,.7)', { align: 'center' });
        }
      }
    });
  }
  // Штурвал на 3–4 спицах с шарами на концах
  function wheel(F, s, t, r, n, pal) {
    const L = F.lit, p = palOf(pal);
    each((x, m) => {
      F.at(x, s, t); x.lineCap = 'round';
      x.beginPath(); x.arc(0, 0, r * 0.32, 0, TAU); part(x, m, L, pal, 0.66, 0.9, -r * 0.32, r * 0.32, 0.5);
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU - Math.PI / 2 + 0.3, ex = Math.cos(a) * r, ey = Math.sin(a) * r;
        x.beginPath(); x.moveTo(0, 0); x.lineTo(ex, ey);
        if (m === 'c') { x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 2.5; x.shadowOffsetX = 1.2; x.shadowOffsetY = 2; x.lineWidth = r * 0.16; x.strokeStyle = css(mul(p[2], L)); x.stroke(); x.restore(); x.lineWidth = r * 0.06; x.strokeStyle = css(mul(p[0], L), 0.7); x.stroke(); }
        else { x.lineWidth = r * 0.16; x.strokeStyle = gray(m === 'h' ? 0.76 : 0.9); x.stroke(); }
        x.beginPath(); x.arc(ex, ey, r * 0.17, 0, TAU); part(x, m, L, pal, 0.82, 1, ey - r * 0.17, ey + r * 0.17, 0.5);
      }
      x.beginPath(); x.arc(0, 0, r * 0.14, 0, TAU); part(x, m, L, pal, 0.86, 1, -r * 0.14, r * 0.14, 0);
    });
  }
  // Рычаг-ручка (Т-образная)
  function lever(F, s, t, w, pal) {
    const L = F.lit;
    each((x, m) => {
      F.at(x, s, t);
      x.beginPath(); x.arc(0, 0, w * 0.22, 0, TAU); part(x, m, L, pal, 0.64, 0.9, -w * 0.22, w * 0.22, 0.45);
      rr(x, -w * 0.07, -w * 0.05, w * 0.14, w * 0.62, w * 0.07); part(x, m, L, pal, 0.74, 0.95, -w * 0.05, w * 0.57, 0.5);
      rr(x, -w * 0.32, w * 0.5, w * 0.64, w * 0.15, w * 0.075); part(x, m, L, pal, 0.8, 1, w * 0.5, w * 0.65, 0.5);
      x.beginPath(); x.arc(0, 0, w * 0.1, 0, TAU); part(x, m, L, pal, 0.78, 1, -w * 0.1, w * 0.1, 0);
    });
  }
  // Цилиндрическая петля (вертикальная)
  function hingeBarrel(F, s, t, w, h, pal) {
    const L = F.lit, p = palOf(pal);
    each((x, m) => {
      F.at(x, s, t);
      rr(x, -w / 2, -h / 2, w, h, w * 0.35);
      if (m === 'c') {
        x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 3; x.shadowOffsetX = 1.4; x.shadowOffsetY = 2; x.fillStyle = '#000'; x.fill(); x.restore();
        const g = x.createLinearGradient(-w / 2, 0, w / 2, 0);
        g.addColorStop(0, css(mul(p[2], L))); g.addColorStop(0.3, css(mul(p[0], L))); g.addColorStop(0.65, css(mul(p[1], L))); g.addColorStop(1, css(mul(p[3], L)));
        x.fillStyle = g; x.fill();
        x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(-w / 2, -0.5, w, 1);
      } else { x.fillStyle = gray(m === 'h' ? 0.78 : 0.85); x.fill(); }
    });
  }
  // Болт-шестигранник
  function bolt(F, s, t, r, pal) {
    const L = F.lit;
    each((x, m) => {
      F.at(x, s, t);
      x.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath();
      part(x, m, L, pal, 0.7, 0.75, -r, r, 0.45);
      x.beginPath(); x.arc(0, 0, r * 0.62, 0, TAU);
      if (m === 'c') { x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 0.4; x.stroke(); } else if (m === 'h') { x.fillStyle = gray(0.74); x.fill(); }
    });
  }

  // =====================================================================
  //  Семейства
  // =====================================================================
  // ---------- Армейский стальной ящик ----------
  function famMil(S) {
    const R = S.R, v = S.v;
    const W = v === 'ammo' ? 236 : v === 'long' ? 356 : 300;
    const D = v === 'ammo' ? 112 : v === 'long' ? 132 : 166;
    const Hb = v === 'ammo' ? 150 : v === 'long' ? 82 : 100 + Math.round(R() * 10);
    const Hl = v === 'ammo' ? 30 : v === 'long' ? 32 : 30 + Math.round(R() * 12);
    const sk = v === 'ammo' ? 0 : 7, o = v === 'ammo' ? 2.5 : 3;
    const y0 = sk, ys = y0 + Hb, yt = ys + Hl;
    const body = cuboid(-W / 2, W / 2, y0, ys, -D / 2, D / 2);
    const lid = cuboid(-W / 2 - o, W / 2 + o, ys, yt, -D / 2 - o, D / 2 + o);
    fit(body.pts.concat(lid.pts));
    floorShadow(-W / 2, W / 2, -D / 2, D / 2);
    const paint = matPaint(S.body, 0.32), pal = paintPal(S.body), hw = S.zinc ? 'steel' : pal;
    if (sk) {
      [[-W / 2 + 12, -W / 2 + 38], [W / 2 - 38, W / 2 - 12]].forEach((r) =>
        paintBox(cuboid(r[0], r[1], 0, sk, -D / 2 + 5, D / 2 - 5), matPaint(mul(S.body, 0.55), 0.2, 0.3), { noEdge: true }));
    }
    paintBox(body, paint, { noTop: true, floor: !sk, chips: R, bare: [150, 152, 150] });
    paintBox(lid, paint, { chips: R, bare: [158, 160, 158] });
    seamShade(body.front, 8); seamShade(body.right, 8);
    const F = body.front, Sd = body.right, LF = lid.front, LR = lid.right, T = lid.top;
    // штамповка: рёбра, панель или вертикальные усилители
    const rib = (G, s0, s1, t, hh) => slab(G, rrPts(s0, t - hh / 2, s1 - s0, hh, hh / 2), { pal: pal, h: 0.6, g: 0.34, gs: [0, t - hh / 2, 0, t + hh / 2], k: 1.02 });
    const pan = (G, s0, t0, w, h) => {
      slab(G, rrPts(s0, t0, w, h, 6), { pal: [mixc(S.body, WHITE, 0.12), S.body, mul(S.body, 0.9), mul(S.body, 0.75)], h: 0.57, g: 0.32 });
      groove(G, rrPts(s0, t0, w, h, 6), 0.8, 0.35, true);
    };
    if (S.ribs === 'h') { [0.38, 0.72].forEach((k) => { rib(F, 18, W - 18, Hb * k, 8); rib(Sd, 16, D - 16, Hb * k, 8); }); }
    else if (S.ribs === 'panel') { pan(F, 20, 16, W - 40, Hb - 30); pan(Sd, 16, 16, D - 32, Hb - 30); }
    else { [24, 38, W - 38, W - 24].forEach((s) => slab(F, rrPts(s - 3.5, 14, 7, Hb - 28, 3.5), { pal: pal, h: 0.6, g: 0.34, gs: [s - 3.5, 0, s + 3.5, 0] })); rib(Sd, 16, D - 16, Hb * 0.5, 9); }
    // крышка: продольные рёбра или выдавленная панель сверху
    if (S.lidRibs) { [0.25, 0.5, 0.75].forEach((k) => slab(T, rrPts(T.w * k - 5, 12, 10, T.h - 24, 5), { pal: pal, h: 0.6, g: 0.34, gs: [T.w * k - 5, 0, T.w * k + 5, 0], k: 1.02 })); }
    else pan(T, 18, 14, T.w - 36, T.h - 28);
    // углы и заклёпки
    if (S.corners) {
      const cl = (G, cs, ct, sx, sy) => cornerL(G, cs, ct, sx, sy, 22, 7, hw);
      cl(F, 0, Hb, 1, -1); cl(F, W, Hb, -1, -1); cl(LF, 0, 0, 1, 1); cl(LF, LF.w, 0, -1, 1);
      cl(Sd, Sd.w, Hb, -1, -1); cl(LR, LR.w, 0, -1, 1); cl(Sd, 0, Hb, 1, -1); cl(LR, 0, 0, 1, 1);
    }
    if (S.rivets) {
      rivetRow(LF, 14, Hl - 7, LF.w - 14, Hl - 7, 26, 1.6, pal);
      rivetRow(F, 7, 12, 7, Hb - 12, 18, 1.5, pal); rivetRow(F, W - 7, 12, W - 7, Hb - 12, 18, 1.5, pal);
    }
    // замки
    const nl = v === 'long' && !S.knife ? 3 : 2, ls = nl === 3 ? [0.15, 0.5, 0.85] : v === 'long' ? [0.13, 0.87] : [0.2, 0.8];
    ls.forEach((k) => (S.latch === 'clamp' ? latchClamp(F, W * k, 0, 22, hw) : latchLever(F, W * k, 0, 20, hw)));
    // ручки: скобы по бокам, у цинка — складная сверху и рычаг сбоку
    if (v === 'ammo') {
      topHandle(T, T.w / 2, T.h * 0.42, 70, hw);
      slab(LR, rrPts(10, 6, LR.w - 20, Hl - 12, 3), { pal: hw, h: 0.68, g: 0.55, sh: 0.4 });
      rivet(LR, 16, Hl / 2, 2, hw); rivet(LR, LR.w - 16, Hl / 2, 2, hw);
      bailHandle(Sd, D / 2, Hb * 0.22, 46, hw, 18);
    } else bailHandle(Sd, D / 2, Hb * 0.22, Math.min(64, D * 0.4), hw, 18);
    // маркировка
    const sten = S.sten, cx = W / 2;
    if (S.knife) {
      plate(F, cx, Hb * 0.6, W * 0.6, Hb * 0.54, S.zinc ? 'steel' : 'dark', { screw: 'hex' });
      weaponEngrave(F, cx, Hb * 0.6, W * 0.6 - 24, Hb * 0.54 - 14, S, S.zinc ? 'steel' : 'dark');
    } else {
      const ew = v === 'ammo' ? W * 0.5 : W * 0.34, eh = v === 'ammo' ? Hb * 0.26 : Hb * 0.36;
      weaponStencil(F, v === 'ammo' ? cx : W * 0.38, v === 'ammo' ? Hb * 0.62 : Hb * 0.58, ew, eh, S, R);
    }
    const tl = S.knife ? Hb * 0.19 : v === 'ammo' ? Hb * 0.26 : Hb * 0.25;
    stencil(F, cx, tl, S.code.cl + ' ' + S.code.model, S.knife ? 7 : v === 'long' ? 9 : 10, sten, R);
    if (v === 'ammo') stencil(F, cx, Hb * 0.88, S.code.lot, 7, sten, R);
    else if (!S.knife) {
      if (R() < 0.5) label(F, W * 0.76, Hb * 0.6, 50, 30, pick(R, ['bar', 'qr', 'ship']), S, R, (R() - 0.5) * 0.06);
      else inkStamp(F, W * 0.76, Hb * 0.6, 15, S, R);
    }
    stencil(LF, LF.w / 2, Hl / 2, 'CASE·LAB', 7, sten, R, { alpha: 0.75 });
    stencil(Sd, D / 2, Hb * 0.62, S.code.lot, 7, sten, R);
    stencil(Sd, D / 2, Hb * 0.8, S.code.kg, 6, sten, R, { alpha: 0.7 });
    if (S.band) band(F, Hb * 0.86, Hb * 0.93, S.bandCol);
    if (v === 'crate' && !S.knife && S.seal) sealTape(F, W * 0.36, 1, 9, 26, S, R);
    if (S.inlayFin) inlay(T, T.w * 0.5, T.h * 0.5, T.w * 0.4, T.h * 0.36, S.inlayFin, { R: R, r: 2 });
    else if (v !== 'ammo') stencil(T, T.w / 2, T.h * 0.5, S.code.name, 13, sten, R, { alpha: 0.62 });
    scratches(T, R, 18, 0.18); scratches(F, R, 10, 0.14);
  }

  // ---------- Кофр ----------
  function famFlight(S) {
    const R = S.R, v = S.v;
    const W = v === 'long' ? 360 : v === 'flat' ? 304 : 296, D = v === 'long' ? 134 : v === 'flat' ? 186 : 168;
    const H = v === 'long' ? 112 : v === 'flat' ? 108 : 148, Hl = Math.round(H * (v === 'flat' ? 0.4 : 0.34)), yf = 4;
    const box = cuboid(-W / 2, W / 2, yf, yf + H, -D / 2, D / 2);
    fit(box.pts);
    floorShadow(-W / 2, W / 2, -D / 2, D / 2);
    [[-W / 2 + 8, -D / 2 + 8], [W / 2 - 22, -D / 2 + 8], [W / 2 - 22, D / 2 - 22]].forEach((q) => paintBox(cuboid(q[0], q[0] + 14, 0, yf, q[1], q[1] + 14), matPlastic([30, 31, 34]), { noEdge: true }));
    const panel = matLaminate(S.body, S.panel);
    paintBox(box, panel);
    const F = box.front, Sd = box.right, T = box.top, e = 8, al = S.edges === 'black' ? 'black' : 'alu';
    const ballPal = S.edges === 'black' ? 'dark' : 'silver';
    // маркировка панелей — до профилей (профили лежат поверх)
    if (S.knife) weaponWindow(F, W / 2, Hl + (H - Hl) / 2 + 2, Math.min(W * 0.66, 220), (H - Hl) - 30, S, R, S.edges === 'black' ? 'silver' : 'black');
    else if (S.inlayFin && v !== 'long') {
      inlay(F, W / 2, Hl + (H - Hl) / 2, W * 0.46, (H - Hl) * 0.5, S.inlayFin, { R: R });
      groove(F, rrPts(W / 2 - W * 0.23, Hl + (H - Hl) / 2 - (H - Hl) * 0.25, W * 0.46, (H - Hl) * 0.5, 0), 0.8, 0.4, true);
      weaponPrint(F, W / 2, Hl + (H - Hl) / 2, W * 0.36, (H - Hl) * 0.36, S, { gv: 0.5 });
    } else weaponSticker(F, W * 0.42, Hl + (H - Hl) / 2 + 2, Math.min(W * 0.42, 140), (H - Hl) * 0.62, S, R);
    if (!S.knife) {
      if (R() < 0.6) warnSign(F, W * 0.82, Hl + (H - Hl) * 0.5, 22, R() < 0.5 ? 'glass' : 'warn', S, R);
      else label(F, W * 0.8, Hl + (H - Hl) * 0.48, 40, 26, 'qr', S, R, 0);
    }
    stencil(T, T.w / 2, T.h * (v === 'long' ? 0.25 : v === 'flat' ? 0.34 : 0.5), S.code.name, v === 'std' ? 12 : 10, S.sten, R, { alpha: 0.8, wear: 0.25 });
    stencil(T, 18, T.h - 16, 'CASE·LAB', 6, S.sten, R, { align: 'left', alpha: 0.7, wear: 0.2 });
    label(Sd, D * 0.66, H * 0.62, 36, 22, pick(R, ['bar', 'ship']), S, R, (R() - 0.5) * 0.05);
    stencil(F, e + 10, Hl * 0.52, S.code.cl, 7, S.sten, R, { align: 'left', alpha: 0.7 });
    // профили по рёбрам
    const strips = (G) => {
      const w = G.w, h = G.h;
      const GS = [[0, 0, 0, e], [0, h, 0, h - e], [0, 0, e, 0], [w, 0, w - e, 0]];
      [[[0, 0], [w, 0], [w, e], [0, e]], [[0, h - e], [w, h - e], [w, h], [0, h]], [[0, 0], [e, 0], [e, h], [0, h]], [[w - e, 0], [w, 0], [w, h], [w - e, h]]].forEach((pts, i) => {
        const gs = GS[i];
        slab(G, pts, { pal: al, h: 0.64, g: al === 'black' ? 0.5 : 0.8, gs: gs, sh: 0.3, sb: 2, tex: (x) => patternOn(x, G, brushTile(), 0.6, 1) });
      });
      groove(G, [[e, e], [w - e, e], [w - e, h - e], [e, h - e]], 0.7, 0.35, true);
    };
    strips(T); strips(Sd); strips(F);
    // пояс по шву крышки (двойной профиль)
    const valance = (G) => {
      slab(G, [[e - 1, Hl - 6], [G.w - e + 1, Hl - 6], [G.w - e + 1, Hl + 6], [e - 1, Hl + 6]], { pal: al, h: 0.62, g: 0.85, sh: 0.35, tex: (x) => patternOn(x, G, brushTile(), 0.6, 1) });
      groove(G, [[e, Hl], [G.w - e, Hl]], 1.1, 0.7);
    };
    valance(F); valance(Sd);
    // заклёпки по профилям
    const rv = (G, step) => {
      rivetRow(G, e / 2, 16, e / 2, G.h - 16, step, 1.1, ballPal); rivetRow(G, G.w - e / 2, 16, G.w - e / 2, G.h - 16, step, 1.1, ballPal);
      rivetRow(G, 18, e / 2, G.w - 18, e / 2, step, 1.1, ballPal); rivetRow(G, 18, G.h - e / 2, G.w - 18, G.h - e / 2, step, 1.1, ballPal);
    };
    rv(F, 24); rv(Sd, 24);
    // шаровые углы и лапки
    const C = [[box.x0, box.y1, box.z0], [box.x1, box.y1, box.z0], [box.x0, box.y0, box.z0], [box.x1, box.y0, box.z0], [box.x1, box.y1, box.z1], [box.x1, box.y0, box.z1], [box.x0, box.y1, box.z1]];
    if (S.balls) {
      cornerTri(F, 0, 0, 1, 1, 20, al); cornerTri(F, W, 0, -1, 1, 20, al); cornerTri(F, 0, H, 1, -1, 20, al); cornerTri(F, W, H, -1, -1, 20, al);
      cornerTri(Sd, 0, 0, 1, 1, 20, al); cornerTri(Sd, D, 0, -1, 1, 20, al); cornerTri(Sd, 0, H, 1, -1, 20, al); cornerTri(Sd, D, H, -1, -1, 20, al);
      cornerTri(T, 0, 0, 1, 1, 20, al); cornerTri(T, W, 0, -1, 1, 20, al); cornerTri(T, 0, D, 1, -1, 20, al); cornerTri(T, W, D, -1, -1, 20, al);
      C.forEach((q) => ball(q, 7.4, ballPal));
    } else {
      // плоские уголки-накладки
      [[F, 0, 0, 1, 1], [F, W, 0, -1, 1], [F, 0, H, 1, -1], [F, W, H, -1, -1], [Sd, D, 0, -1, 1], [Sd, D, H, -1, -1], [Sd, 0, 0, 1, 1], [Sd, 0, H, 1, -1]].forEach((q) => cornerL(q[0], q[1], q[2], q[3], q[4], 26, 12, 'black', false));
    }
    // замки и ручки
    (v === 'long' ? [0.16, 0.5, 0.84] : [0.22, 0.78]).forEach((k) => latchButterfly(F, W * k, Hl, 22));
    if (v === 'long') { recessHandle(T, T.w * 0.5, T.h * 0.5, 70, 26); latchButterfly(Sd, D / 2, Hl, 20); }
    else recessHandle(Sd, D / 2, Hl + (H - Hl) * 0.42, 66, 28);
    if (v === 'flat') recessHandle(T, T.w * 0.5, T.h * 0.62, 70, 26);
  }

  // ---------- Пластиковый защитный кейс ----------
  function famHard(S) {
    const R = S.R, v = S.v;
    const W = v === 'flat' ? 300 : v === 'tall' ? 252 : 296, D = v === 'flat' ? 196 : v === 'tall' ? 150 : 166;
    const H = v === 'flat' ? 98 : v === 'tall' ? 178 : 142, r = v === 'tall' ? 12 : 14, yf = 4;
    const Hl = Math.round(H * 0.36), ys = yf + H - Hl, yt = yf + H;
    fit(rboxPts(W + 6, D + 6, 0, yt));
    floorShadow(-W / 2, W / 2, -D / 2, D / 2);
    const mat = matPlastic(S.body), dark = mul(S.body, 0.6), pal = paintPal(mixc(S.body, WHITE, 0.04)), rub = METAL.black;
    [[-W / 2 + 14, -D / 2 + 10], [W / 2 - 30, -D / 2 + 10], [W / 2 - 30, D / 2 - 26]].forEach((q) => paintBox(cuboid(q[0], q[0] + 16, 0, yf, q[1], q[1] + 16), matPlastic([26, 27, 30]), { noEdge: true }));
    const body = rbox(W, D, r, yf, ys, mat, { noTop: true, floor: false });
    const lid = rbox(W + 5, D + 5, r + 2.5, ys, yt, mat, {});
    seamShade(body.front, 7, 0.5); seamShade(body.right, 7, 0.45);
    const F = body.front, Sd = body.right, LF = lid.front, T = lid.top;
    const hb = ys - yf;
    groove(F, [[r, 1.2], [W - r, 1.2]], 1.4, 0.6);
    // литые рёбра у углов
    [r + 6, r + 13, W - r - 13, W - r - 6].forEach((s) => slab(F, rrPts(s - 2.5, 8, 5, hb - 16, 2.5), { c: mixc(S.body, WHITE, 0.05), h: 0.58, g: 0.2, sh: 0.25, sb: 1.5 }));
    [[r + 8, 6], [Sd.w - r - 8, 6]].forEach((q) => slab(Sd, rrPts(q[0] - 2.5, 8, 5, hb - 16, 2.5), { c: mixc(S.body, WHITE, 0.05), h: 0.58, g: 0.2 }));
    // крышка: литая панель или рифление
    if (S.lidRibs) for (let i = 0; i < 6; i++) slab(T, rrPts(30, 22 + i * (T.h - 44) / 5 - 2, T.w - 60, 4, 2), { c: mixc(S.body, WHITE, 0.06), h: 0.6, g: 0.2 });
    else {
      slab(T, rrPts(26, 20, T.w - 52, T.h - 40, 10), { c: mixc(S.body, WHITE, 0.05), h: 0.58, g: 0.2 });
      groove(T, rrPts(26, 20, T.w - 52, T.h - 40, 10), 0.8, 0.3, true);
    }
    // эмблема
    const mid = hb * 0.55;
    if (S.knife) {
      weaponWindow(F, W / 2, mid, W * 0.56, hb * 0.66, S, R, 'black');
      carryHandle(T, T.w / 2, T.h * 0.3, 96, pal, rub);
    } else {
      if (S.inlayFin) { inlay(T, T.w / 2, T.h / 2, T.w * 0.42, T.h * 0.4, S.inlayFin, { R: R, r: 3 }); }
      else label(T, T.w / 2, T.h / 2, 74, 42, pick(R, ['bar', 'ship', 'qr']), S, R, 0);
      weaponSticker(F, W / 2, mid + 7, W * 0.42, Math.max(44, hb * 0.6), S, R);
      carryHandle(F, W / 2, 1, 92, pal, rub);
    }
    // замки и проушины под навесной замок
    const ls = v === 'flat' ? [0.18, 0.82] : [0.2, 0.8];
    ls.forEach((k) => latchToggle(F, W * k, 0, 26, 30, pal, dark));
    [0.33, 0.67].forEach((k) => {
      each((x, m) => {
        F.at(x, W * k, 0);
        rr(x, -4, -8, 8, 15, 2); part(x, m, F.lit, pal, 0.64, 0.25, -8, 7, 0.4);
        x.beginPath(); x.arc(0, 0, 1.8, 0, TAU);
        if (m === 'c') { x.fillStyle = 'rgba(0,0,0,.7)'; x.fill(); } else if (m === 'h') { x.fillStyle = gray(0.35); x.fill(); }
      });
    });
    // клапан давления
    each((x, m) => {
      F.at(x, r + 22, hb * 0.78);
      x.beginPath(); x.arc(0, 0, 8, 0, TAU); part(x, m, F.lit, rub, 0.62, 0.2, -8, 8, 0.45);
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU; x.beginPath(); x.arc(Math.cos(a) * 7.6, Math.sin(a) * 7.6, 0.9, 0, TAU);
        if (m === 'c') { x.fillStyle = 'rgba(0,0,0,.45)'; x.fill(); } else if (m === 'h') { x.fillStyle = gray(0.55); x.fill(); }
      }
      x.beginPath(); x.arc(0, 0, 3.2, 0, TAU); part(x, m, F.lit, rub, 0.7, 0.3, -3, 3, 0);
    });
    engraveText(LF, LF.w * 0.5, Hl * 0.5, 'CASE·LAB', 8, paintPal(mixc(S.body, WHITE, 0.15)), {});
    if (S.sideHandle) carryHandle(Sd, Sd.w / 2, 3, 70, pal, rub);
    stencil(Sd, Sd.w / 2, hb * (S.sideHandle ? 0.62 : 0.5), S.code.lot, 7, S.sten, R, { alpha: 0.6 });
    if (S.warn) warnSign(Sd, Sd.w * 0.3, hb * 0.66, 20, S.warn, S, R);
    else label(Sd, Sd.w * 0.3, hb * 0.66, 34, 20, 'qr', S, R, 0);
    scratches(T, R, 10, 0.1);
  }

  // ---------- Деревянный ящик из досок ----------
  function plank(F, s0, t0, w, h, wk, R, o) {
    o = o || {};
    const tex = woodTile(wk, WOOD[wk]), vert = !!o.vert, Ln = vert ? h : w, Wd = vert ? w : h;
    const pts = o.pts || rrPts(s0, t0, w, h, 0.8);
    const sh = Math.min(tex.height, Math.max(14, Wd * 1.6)), sw = Math.min(tex.width, sh * Ln / Wd);
    const sx = R() * (tex.width - sw), sy = R() * (tex.height - sh), tone = 0.86 + R() * 0.24, mg = o.outline ? 26 : 2;
    each((x, m) => {
      if (o.outline) F.out(x); else F.pp(x, pts);
      if (m === 'h') { x.fillStyle = gray(o.h || 0.5); x.fill(); return; }
      if (m === 'g') { x.fillStyle = gray(o.g || 0.1); x.fill(); return; }
      if (o.sh) { x.save(); x.shadowColor = 'rgba(0,0,0,' + o.sh + ')'; x.shadowBlur = 3; x.shadowOffsetX = 1.5; x.shadowOffsetY = 2.2; x.fillStyle = '#000'; x.fill(); x.restore(); }
      x.save(); x.clip();
      F.at(x, s0 + w / 2, t0 + h / 2); x.rotate(o.rot || (vert ? Math.PI / 2 : 0));
      x.drawImage(tex, sx, sy, sw, sh, -Ln / 2 - mg, -Wd / 2 - mg / 2, Ln + 2 * mg, Wd + mg);
      x.setTransform(1, 0, 0, 1, 0, 0);
      const k = F.lit * tone;
      x.fillStyle = k < 1 ? 'rgba(0,0,0,' + clamp(1 - k, 0, 0.8) + ')' : 'rgba(255,255,255,' + Math.min(0.3, (k - 1) * 0.6) + ')';
      x.fillRect(0, 0, CW, CH);
      if (o.paint) { x.globalAlpha = o.paintA || 0.82; x.fillStyle = css(mul(o.paint, F.lit * (0.94 + R() * 0.1))); x.fillRect(0, 0, CW, CH); x.globalAlpha = 1; grimeOn(x, 0.28); }
      if (o.stain) { x.globalCompositeOperation = 'multiply'; x.fillStyle = css(o.stain); x.fillRect(0, 0, CW, CH); x.globalCompositeOperation = 'source-over'; }
      grainOn(x, 1);
      // края доски: светлая верхняя кромка, тёмная нижняя
      const g = vert ? F.lg(x, s0, 0, s0 + w, 0) : F.lg(x, 0, t0, 0, t0 + h);
      g.addColorStop(0, 'rgba(255,255,255,.1)'); g.addColorStop(0.12, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.22)');
      x.fillStyle = g; x.fillRect(0, 0, CW, CH);
      x.restore();
    });
    if (o.paint && o.wear !== false) {     // краска стёрта по кромкам доски — видно дерево
      const a = vert ? [s0, t0] : [s0, t0], b = vert ? [s0, t0 + h] : [s0 + w, t0];
      const c2 = vert ? [s0 + w, t0] : [s0, t0 + h], d2 = vert ? [s0 + w, t0 + h] : [s0 + w, t0 + h];
      const wood = WOOD[wk][1];
      [[a, b], [c2, d2]].forEach((seg) => {
        const p0 = F.p(seg[0][0], seg[0][1]), p1 = F.p(seg[1][0], seg[1][1]);
        const x = LC; x.save();
        for (let i = 0; i < 12; i++) {
          const t = R(), cx = p0[0] + (p1[0] - p0[0]) * t, cy = p0[1] + (p1[1] - p0[1]) * t, rw = 1 + R() * 4, rh = 0.5 + R() * 1.2;
          x.fillStyle = css(mul(wood, F.lit * (0.8 + R() * 0.3)), 0.75);
          x.beginPath(); x.ellipse(cx, cy + (R() - 0.5) * 1.5, vert ? rh : rw, vert ? rw : rh, 0, 0, TAU); x.fill();
        }
        x.restore();
      });
    }
  }
  function nail(F, s, t) {
    each((x, m) => {
      F.at(x, s, t); x.beginPath(); x.arc(0, 0, 1.25, 0, TAU);
      if (m === 'c') { const g = x.createRadialGradient(-0.4, -0.4, 0.1, 0, 0, 1.3); g.addColorStop(0, css(mul([150, 150, 148], F.lit))); g.addColorStop(1, css(mul([40, 38, 36], F.lit))); x.fillStyle = g; x.fill(); }
      else { x.fillStyle = gray(m === 'h' ? 0.6 : 0.5); x.fill(); }
    });
  }
  function famCrate(S) {
    const R = S.R, v = S.v;
    const W = 312, D = 182, sk = 9, Hb = 114, Hl = 24;
    const y0 = sk, ys = y0 + Hb, yt = ys + Hl;
    const body = cuboid(-W / 2, W / 2, y0, ys, -D / 2, D / 2), lid = cuboid(-W / 2 - 2, W / 2 + 2, ys, yt, -D / 2 - 2, D / 2 + 2);
    fit(body.pts.concat(lid.pts));
    floorShadow(-W / 2, W / 2, -D / 2, D / 2);
    const wk = v === 'dark' ? 'oak' : v === 'ash' ? 'ash' : 'pine';
    const paint = v === 'army' ? S.body : null, stain = v === 'dark' ? [150, 120, 100] : null;
    const po = { paint: paint, stain: stain };
    const gapMat = matPaint(mul(WOOD[wk][2], 0.45), 0.05, 0);
    // полозья
    [[-W / 2 + 16, -W / 2 + 42], [W / 2 - 42, W / 2 - 16]].forEach((r) => {
      const b = cuboid(r[0], r[1], 0, sk, -D / 2 + 2, D / 2 - 2);
      paintFace(b.right, gapMat); plank(b.front, 0, 0, b.w, sk, wk, R, Object.assign({ vert: false }, po)); plank(b.right, 0, 0, b.d, sk, wk, R, po);
    });
    // фон щелей
    [body.front, body.right, lid.front, lid.right, lid.top].forEach((G) => paintFace(G, gapMat, { h: 0.36 }));
    const F = body.front, Sd = body.right, LF = lid.front, LR = lid.right, T = lid.top;
    const n = 4, gap = 2, ph = (Hb - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) { plank(F, 0, i * (ph + gap), W, ph, wk, R, po); plank(Sd, 0, i * (ph + gap), D, ph, wk, R, po); }
    plank(LF, 0, 0, LF.w, Hl, wk, R, po); plank(LR, 0, 0, LR.w, Hl, wk, R, po);
    const nt = 4, tg = 2, tw = (T.h - tg * (nt - 1)) / nt;
    for (let i = 0; i < nt; i++) plank(T, 0, i * (tw + tg), T.w, tw, wk, R, po);
    // раскос на передней стенке
    if (S.brace) {
      const a = [30, Hb - 6], b = [W - 30, 6], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L2 = Math.hypot(b[0] - a[0], b[1] - a[1]) + 30, bw = 20;
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, ux = Math.cos(ang), uy = Math.sin(ang);
      const pts = [[-L2 / 2, -bw / 2], [L2 / 2, -bw / 2], [L2 / 2, bw / 2], [-L2 / 2, bw / 2]].map((q) => [cx + q[0] * ux - q[1] * uy, cy + q[0] * uy + q[1] * ux]);
      const clipPts = [[26, 2], [W - 26, 2], [W - 26, Hb - 2], [26, Hb - 2]];
      plankClip(F, clipPts, () => plank(F, cx - L2 / 2, cy - bw / 2, L2, bw, wk, R, Object.assign({ pts: pts, rot: ang, h: 0.6, sh: 0.45, wear: false }, po)));
    }
    // обвязка: торцевые планки и поперечины крышки
    const cl = 24;
    plank(F, 0, 0, cl, Hb, wk, R, Object.assign({ vert: true, h: 0.62, sh: 0.5 }, po));
    plank(F, W - cl, 0, cl, Hb, wk, R, Object.assign({ vert: true, h: 0.62, sh: 0.5 }, po));
    plank(Sd, 0, 0, cl, Hb, wk, R, Object.assign({ vert: true, h: 0.62, sh: 0.5 }, po));
    plank(Sd, D - cl, 0, cl, Hb, wk, R, Object.assign({ vert: true, h: 0.62, sh: 0.5 }, po));
    plank(T, 18, 0, 26, T.h, wk, R, Object.assign({ vert: true, h: 0.62, sh: 0.45 }, po));
    plank(T, T.w - 44, 0, 26, T.h, wk, R, Object.assign({ vert: true, h: 0.62, sh: 0.45 }, po));
    seamShade(F, 6, 0.4); seamShade(Sd, 6, 0.4);
    // гвозди
    for (let i = 0; i < n; i++) { [cl / 2 - 5, cl / 2 + 5, W - cl / 2 - 5, W - cl / 2 + 5].forEach((s) => nail(F, s, i * (ph + gap) + ph / 2)); }
    for (let i = 0; i < nt; i++) [31 - 6, 31 + 6, T.w - 31 - 6, T.w - 31 + 6].forEach((s) => nail(T, s, i * (tw + tg) + tw / 2));
    // уголки и защёлки
    const iron = S.iron;
    if (S.corners) {
      [[LF, 0, 0, 1, 1], [LF, LF.w, 0, -1, 1], [F, 0, Hb, 1, -1], [F, W, Hb, -1, -1], [Sd, D, Hb, -1, -1], [LR, LR.w, 0, -1, 1]].forEach((q) => cornerL(q[0], q[1], q[2], q[3], q[4], 24, 9, iron));
    }
    [0.3, 0.7].forEach((k, i) => hasp(F, W * k, 0, 13, iron, i === 1 && S.lock ? METAL.brass : null));
    if (S.rope) ropeHandle(Sd, D / 2, Hb * 0.2, 64, WOOD[wk][0]);
    else bailHandle(Sd, D / 2, Hb * 0.22, 56, iron, 18);
    // трафареты
    const sten = S.sten, mid = W / 2;
    stencil(F, mid, ph / 2 + 1, S.code.name, 12, sten, R, { wear: 0.45 });
    stencil(LF, LF.w - 30, Hl / 2, 'CASE·LAB', 6, sten, R, { align: 'right', wear: 0.4, alpha: 0.75 });
    if (S.knife) weaponStencil(F, mid, Hb * 0.58, W * 0.62, Hb * 0.44, S, R, { wear: 0.45 });
    else {
      weaponStencil(F, mid - 26, Hb * 0.6, W * 0.42, Hb * 0.38, S, R, { wear: 0.45 });
      stencil(F, W - cl - 12, Hb * 0.62, S.code.cl, 10, sten, R, { align: 'right', wear: 0.45 });
    }
    stencil(F, mid, Hb - ph / 2, S.code.lot + '   ' + S.code.kg, 7, sten, R, { wear: 0.5 });
    warnSign(Sd, D / 2, Hb * 0.62, 26, 'up', S, R);
    if (S.inlayFin) label(Sd, D * 0.5, Hb * 0.86, 44, 18, 'ship', S, R, (R() - 0.5) * 0.05);
    stencil(T, T.w / 2, T.h * 0.55, S.code.model || S.code.cl, 18, sten, R, { alpha: 0.7, wear: 0.5 });
    if (S.inlayFin) {
      const c = paperLabel(70, 40, 'ship', S, R);
      putDecal(LF, LF.w * 0.78, Hl / 2, c, 34, 16, {});
      inlayLabel(T, T.w * 0.72, T.h * 0.5, 56, 36, S, R);
    } else if (R() < 0.6) label(T, T.w * 0.75, T.h * 0.5, 48, 30, pick(R, ['ship', 'bar']), S, R, (R() - 0.5) * 0.08);
  }
  function plankClip(F, pts, fn) {
    // клип для раскоса: временно ограничить все три слоя областью между обвязкой
    [LC, LH, LG].forEach((x) => { x.save(); F.pp(x, pts); x.clip(); });
    fn();
    [LC, LH, LG].forEach((x) => x.restore());
  }
  // Бумажная этикетка с фотографией раскраски (вставка «по-честному» — на наклейке)
  function inlayLabel(F, s, t, w, h, S, R) {
    label(F, s, t, w, h, 'ship', S, R, (R() - 0.5) * 0.06);
    inlay(F, s + w * 0.22, t + h * 0.08, w * 0.4, h * 0.6, S.inlayFin, { R: R, desat: 0.35, k: 0.92 });
  }

  // ---------- Шкатулка из дерева под лаком ----------
  function famPres(S) {
    const R = S.R;
    const flat = S.lidStyle === 'flat', plinthed = S.feet === 'plinth';
    const W = 300, D = 188, ft = plinthed ? 12 : 8, Hb = 72, Hl = flat ? 26 : 30, ch = flat ? 0 : 8;
    const y0 = ft, ys = y0 + Hb, yl = ys + Hl - ch, yt = ys + Hl;
    const body = cuboid(-W / 2, W / 2, y0, ys, -D / 2, D / 2), lid = cuboid(-W / 2 - 3, W / 2 + 3, ys, yl, -D / 2 - 3, D / 2 + 3);
    const cap = flat ? null : frustum(W + 6, D + 6, W - 14, D - 14, yl, yt);
    const base = plinthed ? cuboid(-W / 2 - 6, W / 2 + 6, 0, ft, -D / 2 - 6, D / 2 + 6) : null;
    fit(body.pts.concat(lid.pts, cap ? cap.pts : [], base ? base.pts : []));
    floorShadow(-W / 2, W / 2, -D / 2, D / 2);
    const lac = S.lacquer, wk = S.wood, pal = S.trim;
    const woodMat = lac ? matLacquer(lac, 0.7) : matLacquer(WOOD[wk][0], 0.5);
    const woodFace = (G, vert) => {
      if (!G.vis) return;
      if (lac) { paintFace(G, woodMat); return; }
      plank(G, 0, 0, G.w, G.h, wk, R, { vert: vert, g: 0.55, outline: true });
      each((x, m) => { if (m !== 'c') return; G.out(x); x.save(); x.clip(); faceLight(x, G, woodMat, {}); x.restore(); });
    };
    // основание: цоколь с профилем или ножки-«булочки»
    if (base) {
      [base.front, base.right, base.top].forEach((G) => woodFace(G));
      edgeLine(base.front.tl, base.front.tr, 0.3);
      groove(base.front, [[0, ft * 0.45], [base.front.w, ft * 0.45]], 0.6, 0.35); groove(base.right, [[0, ft * 0.45], [base.right.w, ft * 0.45]], 0.6, 0.3);
    } else {
      [[-W / 2 + 10, -D / 2 + 10], [W / 2 - 28, -D / 2 + 10], [W / 2 - 28, D / 2 - 28]].forEach((q) => paintBox(cuboid(q[0], q[0] + 18, 0, ft, q[1], q[1] + 18), lac ? matLacquer(mul(lac, 0.7)) : matLacquer(WOOD[wk][2], 0.4), { noEdge: true }));
    }
    [body.front, body.right].forEach((G) => woodFace(G));
    [lid.front, lid.right, lid.top].forEach((G) => woodFace(G));
    if (cap) {
      [cap.front, cap.right, cap.left, cap.top].forEach((G) => woodFace(G));
      edgeLine(cap.front.tl, cap.front.tr, 0.3); edgeLine(cap.front.bl, cap.front.br, 0.2);
    }
    edgeLine(lid.front.tl, lid.front.tr, 0.25); edgeLine(body.front.tr, body.front.br, 0.18); edgeLine(lid.front.tr, lid.front.br, 0.2);
    seamShade(body.front, 6, 0.5); seamShade(body.right, 6, 0.45);
    const F = body.front, Sd = body.right, LF = lid.front, T = cap ? cap.top : lid.top;
    if (flat) {   // плоская крышка: приподнятая филёнка с профилем
      slab(T, rrPts(16, 14, T.w - 32, T.h - 28, 3), { c: lac || WOOD[wk][0], h: 0.58, g: 0.55, k: 1.04, tex: (x) => { if (!lac) { x.globalAlpha = 0.5; patternOn(x, T, woodTile(wk, WOOD[wk]), 0.5, 0.6); } } });
      groove(T, rrPts(16, 14, T.w - 32, T.h - 28, 3), 0.9, 0.4, true);
    }
    // инкрустация: тонкая светлая полоса по периметру панелей
    const string = (G, ins, col) => each((x, m) => {
      G.pp(x, rrPts(ins, ins, G.w - 2 * ins, G.h - 2 * ins, 0));
      if (m === 'c') { x.strokeStyle = css(mul(col, G.lit), 0.85); x.lineWidth = 1.1; x.stroke(); }
      else if (m === 'h') { x.strokeStyle = gray(0.47); x.lineWidth = 1.2; x.stroke(); }
    });
    const strCol = lac ? palOf(pal)[1] : WOOD.ash[1];
    string(F, 7, strCol); string(T, 9, strCol); string(Sd, 7, strCol);
    // латунная табличка с гравировкой оружия
    const pw = S.knife ? W * 0.66 : W * 0.46, ph = Hb * 0.62;
    plate(F, W / 2, Hb * 0.53, pw, ph, pal, { screw: S.plateR > 4 ? 'cross' : 'slot', r: S.plateR });
    weaponEngrave(F, W / 2, Hb * 0.53, pw - 22, ph - 14, S, pal);
    // замок и уголки
    keyhole(LF, LF.w / 2, (Hl - ch) * 0.5, flat ? 12 : 13, pal);
    [[LF, 0, 0, 1, 1], [LF, LF.w, 0, -1, 1], [F, 0, Hb, 1, -1], [F, W, Hb, -1, -1], [Sd, Sd.w, Hb, -1, -1]].forEach((q) => cornerTri(q[0], q[1], q[2], q[3], q[4], 14, pal, true));
    [0.18, 0.82].forEach((k) => catchSmall(F, W * k, 0, 14, pal));
    // ручка-кольцо сбоку
    each((x, m) => {
      Sd.at(x, Sd.w / 2, Hb * 0.36);
      rr(x, -9, -5, 18, 10, 3); part(x, m, Sd.lit, pal, 0.62, 0.9, -5, 5, 0.45);
      x.beginPath(); x.ellipse(0, 9, 13, 9, 0, 0, Math.PI); x.lineWidth = 2.6;
      if (m === 'c') { x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 2; x.shadowOffsetX = 1; x.shadowOffsetY = 1.6; x.strokeStyle = css(mul(palOf(pal)[1], Sd.lit)); x.stroke(); x.restore(); }
      else { x.strokeStyle = gray(m === 'h' ? 0.72 : 0.9); x.stroke(); }
    });
    // маленькая табличка на крышке
    plate(T, T.w / 2, T.h * 0.62, 64, 15, pal, { screws: false, r: 1.5 });
    engraveText(T, T.w / 2, T.h * 0.62, 'CASE·LAB', 7, pal, {});
    if (S.inlayFin) inlay(T, T.w / 2, T.h * 0.3, T.w * 0.36, T.h * 0.26, S.inlayFin, { R: R, r: 1, desat: 0.45 });
  }

  // ---------- Сундук в коже ----------
  function famTrunk(S) {
    const R = S.R;
    const W = 296, D = 170, ft = 5, Hb = 104, Hl = 44;
    const y0 = ft, ys = y0 + Hb, yt = ys + Hl;
    const body = cuboid(-W / 2, W / 2, y0, ys, -D / 2, D / 2), lid = cuboid(-W / 2 - 1.5, W / 2 + 1.5, ys, yt, -D / 2 - 1.5, D / 2 + 1.5);
    fit(body.pts.concat(lid.pts));
    floorShadow(-W / 2, W / 2, -D / 2, D / 2);
    const lea = S.canvas ? matCanvas(S.body) : matLeather(S.body), pal = S.trim, wk = S.wood;
    [[-W / 2 + 8, -D / 2 + 8], [W / 2 - 24, -D / 2 + 8], [W / 2 - 24, D / 2 - 24]].forEach((q) => paintBox(cuboid(q[0], q[0] + 16, 0, ft, q[1], q[1] + 16), matPaint(METAL.brass[2], 0.6, 0), { noEdge: true }));
    paintBox(body, lea, { noTop: true, floor: false });
    paintBox(lid, lea);
    seamShade(body.front, 8, 0.5); seamShade(body.right, 8, 0.45);
    const F = body.front, Sd = body.right, LF = lid.front, LR = lid.right, T = lid.top;
    // деревянные планки (гнутые рейки) с прострочкой
    const slat = (G, s0, t0, w, h, vert) => {
      plank(G, s0, t0, w, h, wk, R, { vert: vert, h: 0.62, sh: 0.45, g: 0.4 });
    };
    slat(F, 0, Hb - 12, W, 12); slat(Sd, 0, Hb - 12, D, 12); slat(LF, 0, Hl - 11, LF.w, 11); slat(LR, 0, Hl - 11, LR.w, 11);
    const vs = S.straps ? [16, W - 30] : [14, 46, W - 60, W - 28];
    vs.forEach((s) => slat(F, s, 0, 14, Hb - 12, true));
    vs.forEach((s) => slat(LF, s * LF.w / W, 0, 14, Hl - 11, true));
    vs.forEach((s) => slat(T, s * T.w / W + (s < W / 2 ? 8 : -8), 0, 14, T.h, true));
    // ремни через крышку
    const strap = S.strap, sx = S.straps ? [0.3, 0.7] : [];
    sx.forEach((k) => {
      const s = W * k;
      slab(T, [[T.w * k - 9, 0], [T.w * k + 9, 0], [T.w * k + 9, T.h], [T.w * k - 9, T.h]], { pal: paintPal(strap), h: 0.6, g: 0.3, gs: [T.w * k - 9, 0, T.w * k + 9, 0] });
      slab(LF, [[LF.w * k - 9, 0], [LF.w * k + 9, 0], [LF.w * k + 9, Hl], [LF.w * k - 9, Hl]], { pal: paintPal(strap), h: 0.6, g: 0.3, gs: [LF.w * k - 9, 0, LF.w * k + 9, 0] });
      slab(F, [[s - 9, 0], [s + 9, 0], [s + 9, Hb * 0.42], [s, Hb * 0.48], [s - 9, Hb * 0.42]], { pal: paintPal(strap), h: 0.6, g: 0.3, gs: [s - 9, 0, s + 9, 0], sh: 0.35 });
      [T, LF].forEach((G) => groove(G, [[G.w * k - 6.5, 0], [G.w * k - 6.5, G.h]], 0.5, 0.25));
      // пряжка
      each((x, m) => {
        F.at(x, s, Hb * 0.2);
        rr(x, -12, -8, 24, 16, 2.5); x.lineWidth = 2.6;
        if (m === 'c') { x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 2; x.shadowOffsetX = 1; x.shadowOffsetY = 1.5; x.strokeStyle = css(mul(palOf(pal)[1], F.lit)); x.stroke(); x.restore(); x.lineWidth = 0.8; x.strokeStyle = css(mul(palOf(pal)[0], F.lit), 0.8); x.stroke(); }
        else { x.strokeStyle = gray(m === 'h' ? 0.74 : 0.9); x.stroke(); }
        x.beginPath(); x.rect(-1, -8, 2, 16); if (m === 'c') { x.fillStyle = css(mul(palOf(pal)[2], F.lit)); x.fill(); } else { x.fillStyle = gray(m === 'h' ? 0.72 : 0.9); x.fill(); }
      });
    });
    // латунные уголки и замок
    [[LF, 0, 0, 1, 1], [LF, LF.w, 0, -1, 1], [F, 0, Hb, 1, -1], [F, W, Hb, -1, -1], [Sd, Sd.w, Hb, -1, -1], [LR, LR.w, 0, -1, 1], [T, 0, 0, 1, 1], [T, T.w, 0, -1, 1], [T, T.w, T.h, -1, -1], [T, 0, T.h, 1, -1]].forEach((q) => cornerTri(q[0], q[1], q[2], q[3], q[4], 20, pal, true));
    each((x, m) => {
      F.at(x, W / 2, 0);
      rr(x, -16, -14, 32, 12, 2); part(x, m, F.lit, pal, 0.62, 0.9, -14, -2, 0.45);
      rr(x, -12, 0, 24, 22, 3); part(x, m, F.lit, pal, 0.64, 0.9, 0, 22, 0.5);
      rr(x, -5, -6, 10, 18, 2); part(x, m, F.lit, pal, 0.72, 1, -6, 12, 0.45);
      x.beginPath(); x.arc(0, 15, 1.6, 0, TAU); x.rect(-0.6, 15, 1.2, 4); if (m === 'c') { x.fillStyle = '#0c0b0a'; x.fill(); }
    });
    strapHandle(Sd, Sd.w / 2, Hb * 0.26, 52, mul(S.strap, 0.9), pal);
    // эмблема: стёганая кожаная нашивка (перчатки, нож) или тиснение
    const pw = S.knife ? 150 : 124, phh = Hb * 0.48, tan = [146, 108, 70];
    slab(F, rrPts(W / 2 - pw / 2, Hb * 0.53 - phh / 2, pw, phh, 5), { pal: paintPal(tan), h: 0.58, g: 0.3, sh: 0.35 });
    groove(F, rrPts(W / 2 - pw / 2 + 3.5, Hb * 0.53 - phh / 2 + 3.5, pw - 7, phh - 7, 3), 0.5, 0.35, true);
    each((x, m) => {
      if (m !== 'c') return;
      x.setLineDash([1.8, 1.4]); x.lineWidth = 0.6; x.strokeStyle = css(mixc(S.strap, WHITE, 0.45), 0.7);
      F.pp(x, rrPts(W / 2 - pw / 2 + 5.5, Hb * 0.53 - phh / 2 + 5.5, pw - 11, phh - 11, 2)); x.stroke();
    });
    weaponEmboss(F, W / 2, Hb * 0.53, pw - 22, phh - 16, S, tan);
    // багажная бирка на ручке
    const tag = paperLabel(30, 18, 'ship', S, R);
    putDecal(Sd, Sd.w / 2 + 30, Hb * 0.5, tag, 24, 14, { rot: 0.2, gv: 0.1 });
    stencil(LF, LF.w * 0.5, (Hl - 11) * 0.5, 'CASE·LAB', 7, css(mixc(palOf(pal)[1], WHITE, 0.2)), R, { alpha: 0.7, wear: 0.4 });
  }

  // ---------- Сейф ----------
  function famSafe(S) {
    const R = S.R, v = S.v;
    const W = 258, D = 188, pl = 12, H = 184, r = 10;
    const y0 = pl, yt = y0 + H;
    const plinth = cuboid(-W / 2 - 7, W / 2 + 7, 0, pl, -D / 2 - 7, D / 2 + 7);
    fit(plinth.pts.concat(rboxPts(W, D, y0, yt)));
    floorShadow(-W / 2 - 7, W / 2 + 7, -D / 2 - 7, D / 2 + 7);
    const enamel = matPaint(S.body, 0.5, 0.12), pal = S.trim;
    paintBox(plinth, matPaint(mul(S.body, 0.42), 0.4, 0.18), { chips: R, bare: [120, 122, 124] });
    const body = rbox(W, D, r, y0, yt, enamel, {});
    const F = body.front, Sd = body.right, T = body.top;
    const L = F.lit;
    chips(F.tl, F.tr, R, 20, [140, 140, 138]); chips(F.tr, F.br, R, 10, [140, 140, 138]);
    if (v === 'vault') {
      // круглая дверь хранилища: кольцо, ригели по кругу, штурвал
      const cx = W / 2, cy = H * 0.5, rd = Math.min(W, H) * 0.4;
      each((x, m) => {
        F.at(x, cx, cy); x.beginPath(); x.arc(0, 0, rd + 9, 0, TAU);
        if (m === 'c') { x.fillStyle = css(mul(S.body, L * 0.7)); x.fill(); } else { x.fillStyle = gray(m === 'h' ? 0.42 : 0.3); x.fill(); }
        x.beginPath(); x.arc(0, 0, rd, 0, TAU); part(x, m, L, paintPal(mixc(S.body, WHITE, 0.06)), 0.6, 0.55, -rd, rd, 0.55);
        x.beginPath(); x.arc(0, 0, rd * 0.78, 0, TAU);
        if (m === 'c') { x.strokeStyle = css(mul(palOf(pal)[1], L), 0.9); x.lineWidth = 1.2; x.stroke(); x.lineWidth = 0.6; x.beginPath(); x.arc(0, 0, rd * 0.74, 0, TAU); x.stroke(); }
      });
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; bolt(F, cx + Math.cos(a) * (rd - 9), cy + Math.sin(a) * (rd - 9), 4, pal); }
      wheel(F, cx, cy, rd * 0.5, 4, pal);
      dial(F, cx, cy, rd * 0.2, pal);
      plate(F, cx, cy - rd - 1, 70, 14, pal, { screws: false });
      engraveText(F, cx, cy - rd - 1, 'CASE·LAB', 7, pal, { serif: true });
      [[16, 20], [W - 16, 20], [16, H - 20], [W - 16, H - 20]].forEach((q) => bolt(F, q[0], q[1], 4.5, pal));
    } else {
      // дверца с зазором, филёнка, петли, болты, золотая окантовка
      const dx = 16, dw = W - 2 * dx, dh = H - 2 * dx;
      groove(F, rrPts(dx, dx, dw, dh, 6), 2, 0.75, true);
      slab(F, rrPts(dx + 14, dx + 14, dw - 28, dh - 28, 4), { pal: paintPal(mixc(S.body, WHITE, 0.05)), h: 0.56, g: 0.5, sh: 0.3 });
      each((x, m) => {
        if (m !== 'c') return;
        x.strokeStyle = css(mul(palOf(pal)[1], L), 0.9);
        x.lineWidth = 1.2; F.pp(x, rrPts(dx + 20, dx + 20, dw - 40, dh - 40, 2)); x.stroke();
        x.lineWidth = 0.5; F.pp(x, rrPts(dx + 23, dx + 23, dw - 46, dh - 46, 1)); x.stroke();
      });
      hingeBarrel(F, dx + 1, dx + 30, 9, 30, pal); hingeBarrel(F, dx + 1, H - dx - 30, 9, 30, pal);
      [[dx + 26, dx + 9], [W - dx - 9, dx + 9], [dx + 26, H - dx - 9], [W - dx - 9, H - dx - 9]].forEach((q) => bolt(F, q[0], q[1], 3.2, pal));
      plate(F, W / 2, dx + 30, 78, 15, pal, { screws: false });
      engraveText(F, W / 2, dx + 30, 'CASE·LAB', 7.5, pal, { serif: true });
      const hy = H * 0.44;
      if (v === 'keypad') { keypad(F, W * 0.36, hy, 40, 54, pal); lever(F, W * 0.7, hy - 6, 40, pal); }
      else { dial(F, W * 0.38, hy, 24, pal); if (S.wheel) wheel(F, W * 0.7, hy, 22, 3, pal); else lever(F, W * 0.7, hy - 6, 40, pal); }
      // табличка-витрина с реликвией
      const pw = dw - 56, phh = 46, py = H - dx - 14 - 30;
      slab(F, rrPts(W / 2 - pw / 2, py - phh / 2, pw, phh, 3), { pal: pal, h: 0.64, g: 0.9, sh: 0.4 });
      weaponWindow(F, W / 2, py, pw - 8, phh - 8, S, R, pal);
    }
    // бок: ручки и литая табличка
    bailHandle(Sd, Sd.w / 2, H * 0.3, 54, pal, 18);
    plate(Sd, Sd.w / 2, H * 0.62, 60, 22, pal, { screw: 'slot' });
    engraveText(Sd, Sd.w / 2, H * 0.62, 'Nº ' + S.code.sn.slice(-4), 7, pal, { serif: true });
    if (S.inlayFin) inlay(T, T.w / 2, T.h / 2, T.w * 0.34, T.h * 0.36, S.inlayFin, { R: R, r: 2, desat: 0.4 });
    scratches(T, R, 8, 0.08);
  }

  // Гравированная розетка (лепестки)
  function engraveRosette(F, s, t, r, pal) {
    const p = palOf(pal);
    each((x, m) => {
      if (m === 'g') return;
      F.at(x, s, t);
      for (let i = 0; i < 8; i++) {
        x.save(); x.rotate(i / 8 * TAU);
        x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(r * 0.35, -r * 0.5, 0, -r); x.quadraticCurveTo(-r * 0.35, -r * 0.5, 0, 0);
        if (m === 'c') { x.fillStyle = css(mul(p[1], F.lit), 0.85); x.fill(); x.lineWidth = 0.4; x.strokeStyle = css(mul(p[3], F.lit), 0.8); x.stroke(); }
        else { x.fillStyle = gray(0.62); x.fill(); }
        x.restore();
      }
      x.beginPath(); x.arc(0, 0, r * 0.22, 0, TAU);
      if (m === 'c') { x.fillStyle = css(mul(p[0], F.lit)); x.fill(); } else { x.fillStyle = gray(0.7); x.fill(); }
    });
  }

  // =====================================================================
  //  Артефактные кофры: у каждого свой силуэт — ларец со сводом, дипломат, футляр-овал,
  //  восьмигранная шкатулка, реликварий с двускатной кровлей. Благородные материалы (кожа, корень
  //  ореха, рояльный лак, серебро, золото), гравировка резцом (тёмная линия со светлой кромкой,
  //  канавка в карте высот) и чеканка (выпуклый рельеф). Без колец, шаров и свечений.
  // =====================================================================
  // Призма по контуру в плане [[x, z]…] (обход как у rplan): стенки по сегментам, верх по контуру;
  // k0/k1 — масштаб контура внизу и вверху (скос), dz — сдвиг по z
  function prism(plan, y0, y1, mat, o) {
    o = o || {};
    const k0 = o.k0 || 1, k1 = o.k1 || 1, n = plan.length, e = 0.5, walls = [];
    let W = 0, D = 0;
    plan.forEach((q) => { W = Math.max(W, Math.abs(q[0]) * 2); D = Math.max(D, Math.abs(q[1]) * 2); });
    for (let i = 0; i < n; i++) {
      const a = plan[i], b = plan[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dx = (b[0] - a[0]) / l * e, dz = (b[1] - a[1]) / l * e;
      const F = faceOf([(a[0] - dx) * k1, y1, (a[1] - dz) * k1], [(b[0] + dx) * k1, y1, (b[1] + dz) * k1],
        [(b[0] + dx) * k0, y0, (b[1] + dz) * k0], [(a[0] - dx) * k0, y0, (a[1] - dz) * k0]);
      F.zr = [-D / 2, D / 2, W / 2, (y0 + y1) / 2];
      F.seg = i;
      walls.push(F);
    }
    const top = faceOf([-W / 2 * k1, y1, D / 2 * k1], [W / 2 * k1, y1, D / 2 * k1], [W / 2 * k1, y1, -D / 2 * k1], [-W / 2 * k1, y1, -D / 2 * k1]);
    top.outline = plan.map((q) => [q[0] * k1, y1, q[1] * k1]);
    const P = { plan: plan, walls: walls, top: top, y0: y0, y1: y1, W: W, D: D, k0: k0, k1: k1 };
    // фронтальная и правая стенки — самые развёрнутые к -z и к +x
    P.front = walls.reduce((a, b) => (b.n[2] < a.n[2] ? b : a));
    P.right = walls.reduce((a, b) => (b.n[0] > a.n[0] ? b : a));
    P.pts = [];
    plan.forEach((q) => { P.pts.push([q[0] * k0, y0, q[1] * k0], [q[0] * k1, y1, q[1] * k1]); });
    if (mat) paintPrism(P, mat, o);
    return P;
  }
  function paintPrism(P, mat, o) {
    o = o || {};
    P.walls.forEach((F) => { if (F.vis) paintFace(F, mat, o); });
    if (!o.noTop) paintFace(P.top, mat, o);
    if (o.noEdge) return;
    // блик по передней верхней кромке
    const k = mat.edge != null ? mat.edge : 0.16, rim = [];
    P.walls.forEach((F) => { if (F.vis && F.n[1] < 0.9) rim.push(F.tl, F.tr); });
    if (rim.length && !o.noTop) rimLine(rim, k);
  }
  // Многоугольник в плане: прямоугольник W×D со срезанными углами c (восьмигранник)
  function octPlan(W, D, c) {
    const a = W / 2, b = D / 2;
    return [[-a + c, -b], [a - c, -b], [a, -b + c], [a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c]];
  }
  // Свод (бочарная крышка) над прямоугольником w×d от высоты y0, подъём hr; ось вдоль x.
  // Полосы по профилю (свет — по нормали каждой) и правый торец-полуэллипс.
  function vault(w, d, y0, hr, mat, n) {
    n = n || 12;
    const yz = (k) => { const th = k / n * Math.PI; return [y0 + hr * Math.sin(th), -d / 2 * Math.cos(th)]; };
    const strips = [];
    for (let i = 0; i < n; i++) {
      const a = yz(i), b = yz(Math.min(n, i + 1.25));     // внахлёст — без швов между полосами
      const F = faceOf([-w / 2, b[0], b[1]], [w / 2, b[0], b[1]], [w / 2, a[0], a[1]], [-w / 2, a[0], a[1]]);
      F.k = i;
      strips.push(F);
    }
    const prof = [];
    for (let i = 0; i <= n * 2; i++) { const q = yz(i / 2); prof.push([w / 2, q[0], q[1]]); }
    const end = faceOf([w / 2, y0 + hr, -d / 2], [w / 2, y0 + hr, d / 2], [w / 2, y0, d / 2], [w / 2, y0, -d / 2]);
    end.outline = prof;
    const V = { strips: strips, end: end, w: w, d: d, y0: y0, hr: hr, n: n, yz: yz, pts: prof.concat(prof.map((q) => [-w / 2, q[1], q[2]])) };
    if (mat) {
      // объём свода — в карте высот (свет даёт relight), и мягкий блик софтбокса в верхней трети
      strips.forEach((F) => {
        if (!F.vis) return;
        const th = (F.k + 0.5) / n * Math.PI;
        paintFace(F, mat, { flat: true, h: 0.3 + 0.32 * Math.sin(th) });
        const a = clamp(1 - Math.abs(th - 1.05) / 0.5, 0, 1) * (mat.gloss ? 0.14 : 0.06) - (th < 0.45 ? (0.45 - th) * 0.35 : 0);
        each((x, m) => { if (m !== 'c' || !a) return; F.out(x); x.fillStyle = a > 0 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + (-a) + ')'; x.fill(); });
      });
      paintFace(end, mat, {});
      rimLine(prof, mat.edge != null ? mat.edge : 0.16);
    }
    return V;
  }
  // Двускатная кровля над w×d от y0, конёк на высоте y0 + hr: передний скат и правый фронтон
  function gable(w, d, y0, hr, mat) {
    const yr = y0 + hr;
    const front = faceOf([-w / 2, yr, 0], [w / 2, yr, 0], [w / 2, y0, -d / 2], [-w / 2, y0, -d / 2]);
    const back = faceOf([w / 2, yr, 0], [-w / 2, yr, 0], [-w / 2, y0, d / 2], [w / 2, y0, d / 2]);
    const end = faceOf([w / 2, yr, -d / 2], [w / 2, yr, d / 2], [w / 2, y0, d / 2], [w / 2, y0, -d / 2]);
    end.outline = [[w / 2, y0, -d / 2], [w / 2, yr, 0], [w / 2, y0, d / 2]];
    const G = { front: front, back: back, end: end, w: w, d: d, y0: y0, yr: yr, pts: [[-w / 2, y0, -d / 2], [w / 2, y0, -d / 2], [w / 2, y0, d / 2], [-w / 2, yr, 0], [w / 2, yr, 0]] };
    if (mat) {
      [back, front, end].forEach((F) => { if (F.vis) paintFace(F, mat, {}); });
      edgeLine([-w / 2, yr, 0], [w / 2, yr, 0], mat.edge || 0.2);
      edgeLine([w / 2, yr, 0], [w / 2, y0, -d / 2], (mat.edge || 0.2) * 0.8);
    }
    return G;
  }
  // ---------- Благородные материалы ----------
  const matFineLeather = (c) => ({ c: rgbOf(c), g: 0.34, edge: 0.12, tex: (x, F) => { patternOn(x, F, pebbleTile(), 0.5, 0.42); grainOn(x, 1, 0.45); grimeOn(x, 0.03); } });
  const matPiano = (c) => ({ c: rgbOf(c), g: 0.9, edge: 0.28, gloss: true, tex: (x) => { grainOn(x, 1, 0.12); } });
  const matPolish = (kind) => ({ c: METAL[kind][1], g: 0.92, edge: 0.45, tex: (x, F) => { patternOn(x, F, brushTile(), 0.3, 1); } });
  const matBurl = (col) => ({ c: rgbOf(col[0]), g: 0.78, edge: 0.24, gloss: true, tex: (x, F) => { patternOn(x, F, burlTile(col), 1, 0.85); grainOn(x, 1, 0.2); } });
  // корень ореха: свилеватые кольца вокруг «глазков» (сдвиг шума по шуму)
  function burlTile(col) {
    return tile('burl:' + col.map((c) => c.join('.')).join('/'), 256, 256, (x, w, h) => {
      const img = x.createImageData(w, h), d = img.data, n = Tex.perlin(5151), n2 = Tex.perlin(5252), n3 = Tex.perlin(5353);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const wx = Tex.fbm(n, i * 0.011, j * 0.011, 3) * 7, wy = Tex.fbm(n2, i * 0.011, j * 0.011, 3) * 7;
          const v = Tex.fbm(n3, i * 0.022 + wx, j * 0.022 + wy, 3);
          const ring = 0.5 + 0.5 * Math.sin(v * 26), fine = 0.5 + 0.5 * Math.sin(v * 90 + i * 0.05);
          const t = clamp(0.2 + ring * 0.55 + fine * 0.2 + Tex.fbm(n, i * 0.06, j * 0.06, 2) * 0.35, 0, 1);
          const c = t < 0.5 ? mixc(col[2], col[0], t * 2) : mixc(col[0], col[1], (t - 0.5) * 2), p = (j * w + i) * 4;
          d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
        }
      }
      x.putImageData(img, 0, 0);
      const R = Tex.rng(5454);                                          // «глазки» — тёмные точки гроздьями
      for (let k = 0; k < 18; k++) {
        const cx = R() * w, cy = R() * h;
        for (let i = 0; i < 5; i++) {
          x.beginPath(); x.ellipse(cx + (R() - 0.5) * 10, cy + (R() - 0.5) * 8, 0.8 + R() * 1.4, 0.6 + R(), R() * 3, 0, TAU);
          x.fillStyle = css(mul(col[2], 0.6), 0.6 + R() * 0.3); x.fill();
        }
      }
    });
  }
  const BURL = { walnut: [[86, 50, 26], [138, 90, 48], [38, 20, 10]], amboyna: [[104, 44, 24], [156, 84, 46], [46, 16, 8]] };

  // ---------- Гравировка и чеканка ----------
  // Перо на грани: те же команды пути, что у canvas, но каждая точка (u, v) → (s, t) по аффинной M
  // и дальше в перспективе грани (кривые — ломаной). Длинные узоры не «съезжают» на сужающихся гранях.
  function pen(x, F, M) {
    let cu = 0, cv = 0, su = 0, sv = 0, has = false;
    const put = (u, v, mv) => {
      const s = M ? M[0] * u + M[2] * v + M[4] : u, t = M ? M[1] * u + M[3] * v + M[5] : v, p = F.p(s, t);
      if (mv || !has) x.moveTo(p[0], p[1]); else x.lineTo(p[0], p[1]);
      has = true; cu = u; cv = v;
    };
    const arcPts = (ou, ov, ru, rv, rot, a0, a1, ccw) => {
      let sw = a1 - a0;
      if (ccw) { if (a0 - a1 >= TAU) sw = -TAU; else { while (sw > 0) sw -= TAU; while (sw <= -TAU) sw += TAU; } }
      else if (sw >= TAU) sw = TAU; else { while (sw < 0) sw += TAU; while (sw >= TAU) sw -= TAU; }
      const n = Math.max(4, Math.ceil(Math.abs(sw) * Math.max(ru, rv) * 0.6)), c = Math.cos(rot), s = Math.sin(rot);
      for (let i = 0; i <= n; i++) {
        const a = a0 + sw * i / n, eu = Math.cos(a) * ru, ev = Math.sin(a) * rv;
        put(ou + eu * c - ev * s, ov + eu * s + ev * c);
      }
    };
    return {
      moveTo(u, v) { put(u, v, true); su = u; sv = v; },
      lineTo(u, v) { put(u, v); },
      quadraticCurveTo(a, b, u, v) { const u0 = cu, v0 = cv; for (let i = 1; i <= 8; i++) { const t = i / 8, k = 1 - t; put(k * k * u0 + 2 * k * t * a + t * t * u, k * k * v0 + 2 * k * t * b + t * t * v); } },
      bezierCurveTo(a, b, c, d, u, v) {
        const u0 = cu, v0 = cv;
        for (let i = 1; i <= 10; i++) { const t = i / 10, k = 1 - t; put(k * k * k * u0 + 3 * k * k * t * a + 3 * k * t * t * c + t * t * t * u, k * k * k * v0 + 3 * k * k * t * b + 3 * k * t * t * d + t * t * t * v); }
      },
      arc(ou, ov, r, a0, a1, ccw) { arcPts(ou, ov, r, r, 0, a0, a1, ccw); },
      ellipse(ou, ov, ru, rv, rot, a0, a1, ccw) { arcPts(ou, ov, ru, rv, rot, a0, a1, ccw); },
      rect(u, v, w, h) { put(u, v, true); put(u + w, v); put(u + w, v + h); put(u, v + h); x.closePath(); cu = su = u; cv = sv = v; },
      closePath() { x.closePath(); cu = su; cv = sv; },
    };
  }
  // пикселей на единицу грани около точки (s, t)
  const faceK = (F, s, t) => { const a = F.p(s, t), b = F.p(s + 1, t), c = F.p(s, t + 1); return Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - a[0], c[1] - a[1])); };
  // Резец: путь fn(pen) в координатах грани. Тёмная линия с бликом по нижней кромке, канавка в высотах.
  function engr(F, pal, fn, o) {
    o = o || {};
    if (!F.vis) return;
    const p = palOf(pal), k = faceK(F, F.w / 2, F.h / 2), w = (o.w || 0.6) * k, L = F.lit;
    each((x, m) => {
      if (m === 'g') return;
      if (o.clip) { x.beginPath(); o.clip(pen(x, F, o.M)); x.clip(); }
      x.lineCap = 'round'; x.lineJoin = 'round';
      const path = (dx, dy) => { x.save(); x.translate(dx, dy); x.beginPath(); fn(pen(x, F, o.M)); x.restore(); };
      if (m === 'h') { path(0, 0); x.strokeStyle = gray(o.hv || 0.5); x.lineWidth = w + 0.3; x.stroke(); return; }
      path(0.35, 0.45); x.strokeStyle = css(mul(p[0], L), 0.5); x.lineWidth = w * 0.8; x.stroke();
      path(0, 0); x.strokeStyle = css(mul(p[3], L * 0.7), o.a || 0.88); x.lineWidth = w; x.stroke();
    });
  }
  // Чеканка: выпуклый металл по пути fn(pen) (заливка палитрой сверху вниз t0 → t1, высота hv, тень)
  function relief(F, pal, fn, t0, t1, o) {
    o = o || {};
    if (!F.vis) return;
    const pp = palOf(pal), L = F.lit * (o.k || 1), sc = o.sc != null ? o.sc : F.w / 2;
    each((x, m) => {
      x.beginPath(); fn(pen(x, F, o.M));
      if (m === 'h') { x.fillStyle = gray(o.hv || 0.7); x.fill(); return; }
      if (m === 'g') { x.fillStyle = gray(o.g == null ? 0.95 : o.g); x.fill(); return; }
      const sh = o.sh == null ? 0.45 : o.sh;
      if (sh) { x.save(); x.shadowColor = 'rgba(0,0,0,' + sh + ')'; x.shadowBlur = 2.6; x.shadowOffsetX = 1; x.shadowOffsetY = 1.7; x.fillStyle = '#000'; x.fill(); x.restore(); }
      const g = F.lg(x, sc, t0, sc, t1);
      g.addColorStop(0, css(mul(pp[0], L))); g.addColorStop(0.38, css(mul(pp[1], L))); g.addColorStop(0.82, css(mul(pp[2], L))); g.addColorStop(1, css(mul(pp[3], L)));
      x.fillStyle = g; x.fill();
    });
  }
  // Лист (линза) с центром (cx, cy), длиной l, шириной wd, повёрнутый на ang
  function leafPath(x, cx, cy, l, wd, ang) {
    const c = Math.cos(ang), s = Math.sin(ang), P = (u, v) => [cx + u * c - v * s, cy + u * s + v * c];
    const a = P(-l / 2, 0), b = P(l / 2, 0), m1 = P(0, -wd), m2 = P(0, wd);
    x.moveTo(a[0], a[1]); x.quadraticCurveTo(m1[0], m1[1], b[0], b[1]); x.quadraticCurveTo(m2[0], m2[1], a[0], a[1]); x.closePath();
  }
  // Бегущий завиток (растительный орнамент) по полосе: стебель-волна, на гребнях — спирали, между — листья
  function vinePath(x, s0, t0, w, h, P) {
    const c = t0 + h / 2, A = h * 0.2, st = (s) => c + A * Math.sin(s / P * TAU);
    x.moveTo(s0, st(0));
    for (let s = 1.5; s <= w; s += 1.5) x.lineTo(s0 + s, st(s));
    for (let k = 0; (k + 0.25) * P < w - P * 0.25; k += 0.5) {
      const sp = (k + 0.25) * P, d = Math.sin(sp / P * TAU) > 0 ? 1 : -1, S0 = [s0 + sp, st(sp)];
      const C = [S0[0] + P * 0.16, c - d * h * 0.1], r0 = Math.hypot(S0[0] - C[0], S0[1] - C[1]), a0 = Math.atan2(S0[1] - C[1], S0[0] - C[0]), dir = -d;
      x.moveTo(S0[0], S0[1]);
      for (let i = 1; i <= 28; i++) { const f = i / 28, a = a0 + dir * f * TAU * 0.95, r = r0 * (1 - 0.78 * f); x.lineTo(C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r); }
      const z = (k + 0.5) * P;                                          // лист у перехода стебля через середину
      if (z < w - 2) leafPath(x, s0 + z - P * 0.06, c + d * h * 0.18, P * 0.2, h * 0.07, -d * 0.7);
    }
  }
  // Гильош: концентрические волнистые кольца (машинная гравировка на медальонах и замках)
  function guillochePath(x, s, t, rx, ry, n, waves) {
    for (let j = 1; j <= n; j++) {
      const r = j / n, ph = j * 0.45;
      for (let i = 0; i <= 96; i++) {
        const a = i / 96 * TAU, k = r * (1 + 0.07 * Math.sin(waves * a + ph)), px = s + Math.cos(a) * rx * k, py = t + Math.sin(a) * ry * k;
        if (i) x.lineTo(px, py); else x.moveTo(px, py);
      }
    }
  }
  // Волнистые линии гильоша по полосе
  function wavePath(x, s0, t0, w, h, n, P) {
    for (let j = 0; j < n; j++) {
      const ty = t0 + (j + 0.5) * h / n, a = h / n * 0.32;
      for (let s = 0; s <= w; s += 1) { const py = ty + a * Math.sin(s / P * TAU + j * 0.9); if (s) x.lineTo(s0 + s, py); else x.moveTo(s0, py); }
    }
  }
  // Картуш: прямоугольник с вогнутыми углами
  function cartPath(x, s, t, w, h, c) {
    const l = s - w / 2, r = s + w / 2, u = t - h / 2, b = t + h / 2;
    x.moveTo(l + c, u); x.lineTo(r - c, u); x.arc(r, u, c, Math.PI, Math.PI / 2, true);
    x.lineTo(r, b - c); x.arc(r, b, c, -Math.PI / 2, -Math.PI, true);
    x.lineTo(l + c, b); x.arc(l, b, c, 0, -Math.PI / 2, true);
    x.lineTo(l, u + c); x.arc(l, u, c, Math.PI / 2, 0, true); x.closePath();
  }
  // ---------- Фурнитура кофров ----------
  // Металлическая полоса с гравировкой: 'vine' — завиток, 'wave' — гильош, 'bead' — чеканный жемчужник, 'plain'
  function luxBand(F, s0, t0, s1, t1, pal, kind, o) {
    o = o || {};
    if (!F.vis) return;
    // длинную полосу кладём кусками: градиент палитры у каждого куска свой — в перспективе полоса
    // наклонена, и один градиент на всю длину «съезжает» к дальнему концу (тёмный тон на стыке граней)
    const sv = o.vert != null ? o.vert : t1 - t0 > (s1 - s0) * 1.5, nc = o.flat || sv ? 1 : Math.max(1, Math.ceil((s1 - s0) / 30));
    if (nc > 1 && o.sh) slab(F, [[s0, t0], [s1, t0], [s1, t1], [s0, t1]], { c: [0, 0, 0], h: o.hv || 0.62, g: 0.92, sh: o.sh });
    for (let i = 0; i < nc; i++) {
      const a = s0 + (s1 - s0) * i / nc, b = s0 + (s1 - s0) * (i + 1) / nc + (i < nc - 1 ? 0.4 : 0), cm = (a + b) / 2;
      slab(F, [[a, t0], [b, t0], [b, t1], [a, t1]], o.flat ? { c: palOf(pal)[1], h: o.hv || 0.62, g: 0.92, sh: o.sh } : { pal: pal, h: o.hv || 0.62, g: 0.92, gs: [sv ? s0 : cm, t0, sv ? s0 : cm, t1], sh: nc > 1 ? 0 : o.sh });
    }
    // узор — в локальной рамке полосы: u вдоль полосы, v поперёк (вертикальная полоса — снизу вверх)
    const vert = o.vert != null ? o.vert : t1 - t0 > (s1 - s0) * 1.5;
    const w = vert ? t1 - t0 : s1 - s0, h = vert ? s1 - s0 : t1 - t0;
    // off — сдвиг узора по длине (пояс из нескольких граней идёт без разрыва узора на стыках)
    const off = o.off || 0, M = vert ? [0, -1, 1, 0, s0, t1] : [1, 0, 0, 1, s0 - off, t0];
    if (h < 3.5 || kind === 'plain') return;
    const m = Math.min(1.4, h * 0.16), u0 = off, u1 = off + w, cl = (x) => x.rect(u0, -1, w, h + 2);
    engr(F, pal, (x) => { x.moveTo(u0, m); x.lineTo(u1, m); x.moveTo(u0, h - m); x.lineTo(u1, h - m); }, { w: 0.4, a: 0.6, M: M });
    if (kind === 'vine') engr(F, pal, (x) => vinePath(x, 1, m, u1 - 2, h - 2 * m, Math.max(9, (h - 2 * m) * 2.2)), { w: 0.45, M: M, clip: (x) => x.rect(u0, m, w, h - 2 * m) });
    else if (kind === 'wave') engr(F, pal, (x) => wavePath(x, off ? Math.floor(u0) : 0, m, u1 - (off ? Math.floor(u0) : 0), h - 2 * m, Math.max(2, Math.round((h - 2 * m) / 2.2)), 7), { w: 0.32, a: 0.6, M: M, clip: off ? cl : null });
    else if (kind === 'bead') {
      const r = (h - 2 * m) * 0.3, step = r * 2.7;
      relief(F, pal, (x) => { for (let s = Math.ceil((u0 - step / 2) / step) * step + step / 2; s < u1 - (off ? 0 : r); s += step) { x.moveTo(s + r, h / 2); x.arc(s, h / 2, r, 0, TAU); } }, t0, t1, { hv: 0.74, sh: 0.3, M: M });
    }
  }
  // Угловая накладка: L-образная, концы — трилистник; гравированная жилка и штифты
  function mount(F, cs, ct, sx, sy, a, wd, pal) {
    if (!F.vis) return;
    const path = (x) => {
      x.moveTo(cs, ct); x.lineTo(cs + sx * a, ct);
      x.quadraticCurveTo(cs + sx * (a + wd * 1.1), ct + sy * wd * 0.15, cs + sx * (a + wd * 0.2), ct + sy * wd * 0.62);
      x.quadraticCurveTo(cs + sx * (a - wd * 0.1), ct + sy * wd * 1.15, cs + sx * (a - wd * 0.6), ct + sy * wd);
      x.lineTo(cs + sx * wd, ct + sy * wd); x.lineTo(cs + sx * wd, ct + sy * (a - wd * 0.6));
      x.quadraticCurveTo(cs + sx * wd * 1.15, ct + sy * (a - wd * 0.1), cs + sx * wd * 0.62, ct + sy * (a + wd * 0.2));
      x.quadraticCurveTo(cs + sx * wd * 0.15, ct + sy * (a + wd * 1.1), cs, ct + sy * a); x.closePath();
    };
    relief(F, pal, path, ct, ct + sy * a, { hv: 0.66, sh: 0.5 });
    engr(F, pal, (x) => {
      x.moveTo(cs + sx * (a - wd * 0.2), ct + sy * wd * 0.5); x.lineTo(cs + sx * wd * 0.5, ct + sy * wd * 0.5); x.lineTo(cs + sx * wd * 0.5, ct + sy * (a - wd * 0.2));
      x.moveTo(cs + sx * (a + wd * 0.1), ct + sy * wd * 0.45); x.arc(cs + sx * (a - wd * 0.05), ct + sy * wd * 0.45, wd * 0.18, 0, TAU);
      x.moveTo(cs + sx * wd * 0.45 + wd * 0.18, ct + sy * (a - wd * 0.05)); x.arc(cs + sx * wd * 0.45, ct + sy * (a - wd * 0.05), wd * 0.18, 0, TAU);
    }, { w: 0.4, a: 0.7 });
    rivet(F, cs + sx * wd * 0.48, ct + sy * wd * 0.48, Math.max(1, wd * 0.16), pal);
  }
  // Накладка замка: фигурная пластина с гравировкой и скважиной
  function escutcheon(F, s, t, h, pal) {
    if (!F.vis) return;
    const w = h * 0.62, path = (x) => {
      x.moveTo(s, t - h / 2); x.bezierCurveTo(s + w * 0.35, t - h / 2, s + w * 0.2, t - h * 0.22, s + w / 2, t - h * 0.12);
      x.bezierCurveTo(s + w * 0.62, t + h * 0.08, s + w * 0.35, t + h * 0.3, s, t + h / 2);
      x.bezierCurveTo(s - w * 0.35, t + h * 0.3, s - w * 0.62, t + h * 0.08, s - w / 2, t - h * 0.12);
      x.bezierCurveTo(s - w * 0.2, t - h * 0.22, s - w * 0.35, t - h / 2, s, t - h / 2); x.closePath();
    };
    relief(F, pal, path, t - h / 2, t + h / 2, { hv: 0.68, sh: 0.5 });
    engr(F, pal, (x) => {
      x.moveTo(s, t - h * 0.4); x.bezierCurveTo(s + w * 0.25, t - h * 0.36, s + w * 0.16, t - h * 0.16, s + w * 0.38, t - h * 0.1);
      x.moveTo(s, t - h * 0.4); x.bezierCurveTo(s - w * 0.25, t - h * 0.36, s - w * 0.16, t - h * 0.16, s - w * 0.38, t - h * 0.1);
      x.moveTo(s + w * 0.3, t + h * 0.08); x.quadraticCurveTo(s + w * 0.22, t + h * 0.28, s, t + h * 0.4);
      x.moveTo(s - w * 0.3, t + h * 0.08); x.quadraticCurveTo(s - w * 0.22, t + h * 0.28, s, t + h * 0.4);
    }, { w: 0.4, a: 0.75 });
    each((x, m) => {
      if (m === 'g') return;
      F.at(x, s, t + h * 0.02); x.beginPath(); x.arc(0, -h * 0.05, h * 0.07, 0, TAU);
      x.moveTo(-h * 0.035, -h * 0.02); x.lineTo(h * 0.035, -h * 0.02); x.lineTo(h * 0.06, h * 0.16); x.lineTo(-h * 0.06, h * 0.16); x.closePath();
      if (m === 'c') { x.fillStyle = '#0b0a09'; x.fill(); } else { x.fillStyle = gray(0.3); x.fill(); }
    });
  }
  // Лавровая ветвь чеканкой вокруг медальона (две дуги листьев)
  function laurel(F, s, t, rx, ry, pal, n) {
    n = n || 9;
    relief(F, pal, (x) => {
      [-1, 1].forEach((d) => {
        for (let i = 0; i < n; i++) {
          const a = Math.PI / 2 + d * (0.35 + i / n * 2.3), px = s + Math.cos(a) * rx, py = t + Math.sin(a) * ry;
          leafPath(x, px, py, Math.min(rx, ry) * 0.34, Math.min(rx, ry) * 0.085, a + d * Math.PI / 2 - d * 0.5);
        }
      });
    }, t - ry, t + ry, { hv: 0.68, sh: 0.4 });
  }
  // Прострочка по коже: пунктир нитью и проколы в высотах
  function stitch(F, pts, col, closed) {
    if (!F.vis) return;
    each((x, m) => {
      if (m === 'g') return;
      x.beginPath(); pts.forEach((q, i) => { const p = F.p(q[0], q[1]); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); });
      if (closed) x.closePath();
      x.setLineDash([1.9, 1.3]); x.lineCap = 'butt';
      if (m === 'c') { x.strokeStyle = css(mul(col, F.lit), 0.85); x.lineWidth = 0.75; x.stroke(); }
      else { x.strokeStyle = gray(0.44); x.lineWidth = 0.9; x.stroke(); }
    });
  }
  // Тиснение золотом по коже: двойная рамка и угловые веточки
  function goldTool(F, s0, t0, w, h, pal) {
    if (!F.vis) return;
    const p = palOf(pal);
    each((x, m) => {
      if (m === 'g') return;
      const x0 = x, P = pen(x, F);
      x0.beginPath(); P.rect(s0, t0, w, h); P.rect(s0 + 2.2, t0 + 2.2, w - 4.4, h - 4.4);
      [[s0 + 2.2, t0 + 2.2, 1, 1], [s0 + w - 2.2, t0 + 2.2, -1, 1], [s0 + w - 2.2, t0 + h - 2.2, -1, -1], [s0 + 2.2, t0 + h - 2.2, 1, -1]].forEach((q) => {
        leafPath(P, q[0] + q[2] * 5, q[1] + q[3] * 2.4, 6, 1.3, q[2] * q[3] * 0.35);
        leafPath(P, q[0] + q[2] * 2.4, q[1] + q[3] * 5, 6, 1.3, Math.PI / 2 - q[2] * q[3] * 0.35);
      });
      const k = faceK(F, s0 + w / 2, t0 + h / 2);
      if (m === 'h') { x.strokeStyle = gray(0.46); x.lineWidth = 0.9 * k; x.stroke(); return; }
      x.strokeStyle = css(mul(p[1], F.lit * 0.95), 0.9); x.lineWidth = 0.7 * k; x.stroke();
    });
  }
  // Оружие литьём: модель с объёмом (заводская отделка), переведённая в тон металла отделки, с чёрным
  // контуром и тенью — светлый полированный силуэт на тёмном поле узнаётся и на плитке 160×120
  function weaponCast(F, s, t, w, h, S, pal) {
    if (!F.vis) return;
    const p = palOf(pal), m = weaponDecal(S.weap, w, h, { mono: '#fff' }), k = weaponDecal(S.weap, w, h, { fin: 'plain' });
    const c = mk(m.width, m.height), x = c.getContext('2d'), W2 = c.width, H2 = c.height;
    x.drawImage(k, 0, 0);
    x.globalCompositeOperation = 'saturation'; x.fillStyle = '#808080'; x.fillRect(0, 0, W2, H2);
    x.globalCompositeOperation = 'screen'; x.fillStyle = 'rgb(92,92,92)'; x.fillRect(0, 0, W2, H2);     // тёмные рукояти — тоже металл
    x.globalCompositeOperation = 'multiply'; x.fillStyle = css(mixc(p[0], p[1], 0.45)); x.fillRect(0, 0, W2, H2);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0);
    const blk = tinted(m, '#000'), d = 0.55;
    each((y, mm) => {
      if (mm !== 'c') return;
      y.save(); F.at(y, s, t);
      y.save(); y.shadowColor = 'rgba(0,0,0,.75)'; y.shadowBlur = 2.5; y.shadowOffsetX = 1.2; y.shadowOffsetY = 1.8; y.drawImage(blk, -w / 2, -h / 2, w, h); y.restore();
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; y.drawImage(blk, -w / 2 + Math.cos(a) * d, -h / 2 + Math.sin(a) * d, w, h); }
      y.restore();
    });
    putDecal(F, s, t, c, w, h, { hv: 0.84, gv: 0.96 });
  }
  // Медальон с оружием: чеканная рамка-картуш, поле черни или эмали с тонким гильошем, литое оружие
  function weaponPlaque(F, s, t, w, h, S, pal, o) {
    o = o || {};
    if (!F.vis) return;
    const c = o.c == null ? Math.min(w, h) * 0.16 : o.c, field = o.field || mixc(S.enamel, [6, 6, 9], 0.5), pp = palOf(pal);
    const iw = w - 8, ih = h - 8, ci = c * 0.7, shp = o.oval ? (x, ww, hh) => x.ellipse(s, t, ww / 2, hh / 2, 0, 0, TAU) : (x, ww, hh, cc) => cartPath(x, s, t, ww, hh, cc);
    relief(F, pal, (x) => shp(x, w, h, c), t - h / 2, t + h / 2, { hv: 0.68, sh: 0.55, sc: s });
    engr(F, pal, (x) => shp(x, w - 3.2, h - 3.2, c * 0.85), { w: 0.35, a: 0.7 });
    each((x, m) => {
      x.beginPath(); shp(pen(x, F), iw, ih, ci);
      if (m !== 'c') { x.fillStyle = gray(m === 'h' ? 0.6 : 0.82); x.fill(); return; }
      const g = F.lg(x, s, t - ih / 2, s, t + ih / 2);
      g.addColorStop(0, css(mul(mixc(field, WHITE, 0.1), F.lit))); g.addColorStop(1, css(mul(field, F.lit * 0.75)));
      x.fillStyle = g; x.fill();
      x.clip(); x.beginPath(); wavePath(pen(x, F), s - iw / 2, t - ih / 2, iw, ih, Math.max(3, Math.round(ih / 2.6)), 9);
      x.strokeStyle = css(mul(pp[1], F.lit), 0.2); x.lineWidth = 0.45 * faceK(F, s, t); x.stroke();
    });
    weaponCast(F, s, t, iw * (o.kw || 0.86), ih * (o.kh || 0.74), S, pal);
  }
  // Литой шнур по точкам в пространстве (кант по ребру): металл с бликом, валик в карте высот
  function goldCord(pts3, pal, wd, closed) {
    const ps = pts3.map(P3), p = palOf(pal), k = pxAt(pts3[0]) * wd;
    each((x, m) => {
      x.beginPath(); ps.forEach((q, i) => (i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); if (closed) x.closePath();
      x.lineJoin = 'round'; x.lineCap = 'round';
      if (m === 'h') { x.strokeStyle = gray(0.72); x.lineWidth = k; x.stroke(); return; }
      if (m === 'g') { x.strokeStyle = gray(0.95); x.lineWidth = k; x.stroke(); return; }
      x.strokeStyle = css(p[2]); x.lineWidth = k; x.stroke();
      x.save(); x.translate(-k * 0.1, -k * 0.18); x.strokeStyle = css(p[1]); x.lineWidth = k * 0.6; x.stroke(); x.restore();
      x.save(); x.translate(-k * 0.12, -k * 0.28); x.strokeStyle = css(p[0], 0.8); x.lineWidth = k * 0.2; x.stroke(); x.restore();
    });
  }
  // ---------- Ларец ювелира: кожа, низкая ступенчатая крышка с фаской и чеканным бордюром, картуш ----------
  function luxCasket(S) {
    const R = S.R, pal = S.trim;
    const W = 250, D = 150, y1 = 12, Hb = 86, y2 = y1 + Hb, bh = 8, y3 = y2 + bh;
    const LW = W + 8, LD = D + 8, y4 = y3 + 15, ci = 11, y5 = y4 + 9;            // крышка: стенка, фаска, верх
    const base = cuboid(-W / 2 - 10, W / 2 + 10, 0, 6, -D / 2 - 10, D / 2 + 10);
    const mold = cuboid(-W / 2 - 5, W / 2 + 5, 6, y1, -D / 2 - 5, D / 2 + 5);
    const body = cuboid(-W / 2, W / 2, y1, y2, -D / 2, D / 2);
    const rim = cuboid(-W / 2 - 4, W / 2 + 4, y2, y3, -D / 2 - 4, D / 2 + 4);
    const lw = cuboid(-LW / 2, LW / 2, y3, y4, -LD / 2, LD / 2);
    const ch = frustum(LW, LD, LW - 2 * ci, LD - 2 * ci, y4, y5);
    fit(base.pts.concat(body.pts, ch.pts));
    floorShadow(-W / 2 - 10, W / 2 + 10, -D / 2 - 10, D / 2 + 10);
    const gilt = matPolish(S.trimKind), lea = matFineLeather(S.body), thread = mixc(palOf(pal)[1], S.body, 0.25);
    paintBox(base, gilt); paintBox(mold, gilt);
    luxBand(base.front, 0, 0.8, base.front.w, 5.2, pal, 'wave'); luxBand(base.right, 0, 0.8, base.right.w, 5.2, pal, 'wave');
    luxBand(mold.front, 0, 0, mold.front.w, 6, pal, 'bead'); luxBand(mold.right, 0, 0, mold.right.w, 6, pal, 'bead');
    paintBox(body, lea, { noTop: true });
    seamShade(body.front, 5, 0.45); seamShade(body.right, 5, 0.4);
    const F = body.front, Sd = body.right;
    // стенки: золочёные угловые пояса, тиснёные рамки, прострочка
    [F, Sd].forEach((G) => {
      luxBand(G, 0, 0, 12, Hb, pal, 'vine', { sh: 0.35 }); luxBand(G, G.w - 12, 0, G.w, Hb, pal, 'vine', { sh: 0.35 });
      stitch(G, [[15, 4], [G.w - 15, 4], [G.w - 15, Hb - 4], [15, Hb - 4]], thread, true);
    });
    goldTool(F, 19, 9, 36, Hb - 18, pal); goldTool(F, W - 55, 9, 36, Hb - 18, pal); goldTool(Sd, 20, 9, D - 40, Hb - 18, pal);
    [[F, 0, 0, 1, 1], [F, W, 0, -1, 1], [F, 0, Hb, 1, -1], [F, W, Hb, -1, -1], [Sd, D, 0, -1, 1], [Sd, D, Hb, -1, -1]].forEach((q) => mount(q[0], q[1], q[2], q[3], q[4], 22, 7, pal));
    // центр: картуш в эмали раскраски, в нём медальон черни с литым оружием
    const cw = 128, chh = 66, ct = Hb * 0.52;
    relief(F, pal, (x) => cartPath(x, W / 2, ct, cw + 8, chh + 8, 10), ct - chh / 2 - 4, ct + chh / 2 + 4, { hv: 0.64, sh: 0.5 });
    engr(F, pal, (x) => cartPath(x, W / 2, ct, cw + 3, chh + 3, 8), { w: 0.45 });
    each((x, m) => { x.beginPath(); cartPath(pen(x, F), W / 2, ct, cw - 2, chh - 2, 7); if (m === 'c') { x.fillStyle = css(mul(S.enamel, F.lit)); x.fill(); } else { x.fillStyle = gray(m === 'h' ? 0.56 : 0.8); x.fill(); } });
    if (S.inlayFin) inlay(F, W / 2, ct, cw - 2, chh - 2, S.inlayFin, { R: R, shape: (x) => cartPath(x, 0, 0, cw - 2, chh - 2, 7), desat: 0.5, k: 0.6, g: 0.85, h: 0.56 });
    weaponPlaque(F, W / 2, ct, 108, 48, S, pal, { c: 7 });
    // пояс крышки
    paintBox(rim, gilt);
    luxBand(rim.front, 0, 0, rim.front.w, bh, pal, 'vine'); luxBand(rim.right, 0, 0, rim.right.w, bh, pal, 'vine');
    // крышка: стенка в коже с накладкой замка, фаска, верх с чеканным бордюром и медальоном
    paintBox(lw, lea, { noTop: true });
    stitch(lw.front, [[6, 4], [lw.front.w - 6, 4]], thread); stitch(lw.right, [[6, 4], [lw.right.w - 6, 4]], thread);
    escutcheon(lw.front, lw.front.w / 2, 8, 13, pal);
    [0.25, 0.75].forEach((k) => engr(lw.front, pal, (x) => vinePath(x, lw.front.w * k - 30, 3.5, 60, 9, 15), { w: 0.4 }));
    [ch.right, ch.front].forEach((G) => paintFace(G, lea, {}));
    const T = ch.top;
    paintFace(T, lea, {});
    const tw = T.w, th = T.h, bw = 9;
    luxBand(T, 0, 0, tw, bw, pal, 'bead', { vert: false }); luxBand(T, 0, th - bw, tw, th, pal, 'vine', { vert: false });
    luxBand(T, 0, bw, bw, th - bw, pal, 'vine', { vert: true }); luxBand(T, tw - bw, bw, tw, th - bw, pal, 'vine', { vert: true });
    goldTool(T, bw + 6, bw + 5, tw - 2 * bw - 12, th - 2 * bw - 10, pal);
    const ms = tw / 2, mt = th / 2;
    relief(T, pal, (x) => x.ellipse(ms, mt, 40, 26, 0, 0, TAU), mt - 26, mt + 26, { hv: 0.66, sh: 0.5 });
    engr(T, pal, (x) => guillochePath(x, ms, mt, 38, 24, 4, 24), { w: 0.28, a: 0.55 });
    if (S.inlayFin) inlay(T, ms, mt, 56, 34, S.inlayFin, { R: R, shape: (x) => { x.beginPath(); x.ellipse(0, 0, 28, 17, 0, 0, TAU); }, desat: 0.4, k: 0.66, g: 0.95, h: 0.6 });
    laurel(T, ms, mt, 50, 33, pal, 8);
    // литые шнуры по рёбрам крышки
    const ring = (w, d, y) => [[-w / 2, y, -d / 2], [w / 2, y, -d / 2], [w / 2, y, d / 2]];
    goldCord(ring(LW, LD, y3 + 0.6), pal, 2.2); goldCord(ring(LW, LD, y4), pal, 2.4); goldCord(ring(LW - 2 * ci, LD - 2 * ci, y5), pal, 1.8);
    edgeLine([LW / 2 - ci, y5, -LD / 2 + ci], [LW / 2, y4, -LD / 2], 0.3);
  }
  // Ручка над верхней гранью: кожаная петля на двух металлических опорах (3D-кривая, толстый штрих)
  function luxHandle(x0, x1, y, z, hgt, col, pal) {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const u = i / 12 - 1, k = Math.pow(1 - Math.pow(Math.abs(u), 5), 0.2); pts.push(P3([x0 + (x1 - x0) * (u + 1) / 2, y + 3 + hgt * k, z])); }
    const k = pxAt([(x0 + x1) / 2, y + hgt, z]), wd = 7.5 * k, pp = palOf(pal);
    [x0, x1].forEach((xx) => {                                         // опоры
      const a = P3([xx, y, z]), b = P3([xx, y + 7, z]);
      each((x, m) => {
        x.beginPath(); x.ellipse(a[0], a[1], 6.5 * k, 2.6 * k, 0, 0, TAU); x.rect(a[0] - 4.5 * k, b[1], 9 * k, a[1] - b[1]);
        if (m === 'c') { const g = x.createLinearGradient(a[0] - 5 * k, 0, a[0] + 5 * k, 0); g.addColorStop(0, css(pp[2])); g.addColorStop(0.35, css(pp[0])); g.addColorStop(1, css(pp[3])); x.fillStyle = g; x.fill(); }
        else { x.fillStyle = gray(m === 'h' ? 0.8 : 0.95); x.fill(); }
      });
    });
    each((x, m) => {
      x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.lineCap = 'round'; x.lineJoin = 'round';
      if (m === 'c') {
        x.save(); x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 5; x.shadowOffsetX = 2; x.shadowOffsetY = 4; x.strokeStyle = css(mul(col, 0.8)); x.lineWidth = wd; x.stroke(); x.restore();
        x.strokeStyle = css(mul(col, 0.55)); x.lineWidth = wd; x.stroke();
        x.save(); x.translate(-0.3 * k, -1.2 * k); x.strokeStyle = css(col); x.lineWidth = wd * 0.55; x.stroke(); x.restore();
        x.save(); x.translate(-0.3 * k, -1.8 * k); x.strokeStyle = css(mixc(col, WHITE, 0.25), 0.5); x.lineWidth = wd * 0.16; x.stroke(); x.restore();
      } else { x.strokeStyle = gray(m === 'h' ? 0.85 : 0.35); x.lineWidth = wd; x.stroke(); }
    });
  }
  // Кодовый замок дипломата: пластина с гильошем, три колёсика с цифрами, кнопка
  function comboLock(F, s, t, w, h, pal) {
    relief(F, pal, (x) => x.rect(s - w / 2, t - h / 2, w, h), t - h / 2, t + h / 2, { hv: 0.68, sh: 0.5, sc: s });
    engr(F, pal, (x) => { x.rect(s - w / 2 + 1.5, t - h / 2 + 1.5, w - 3, h - 3); wavePath(x, s - w / 2 + 2, t - h / 2 + 2, w - 4, h - 4, 4, 5); }, { w: 0.28, a: 0.55 });
    for (let i = -1; i <= 1; i++) {
      const cs = s - w * 0.12 + i * w * 0.13;
      each((x, m) => {
        x.beginPath(); pen(x, F).rect(cs - w * 0.05, t - h * 0.3, w * 0.1, h * 0.6);
        if (m === 'c') { const g = F.lg(x, cs, t - h * 0.3, cs, t + h * 0.3); g.addColorStop(0, '#1a1a1c'); g.addColorStop(0.5, '#8d8f94'); g.addColorStop(1, '#141416'); x.fillStyle = g; x.fill(); }
        else { x.fillStyle = gray(m === 'h' ? 0.58 : 0.6); x.fill(); }
      });
    }
    relief(F, pal, (x) => x.rect(s + w * 0.2, t - h * 0.26, w * 0.2, h * 0.52), t - h * 0.26, t + h * 0.26, { hv: 0.76, sh: 0.4, sc: s + w * 0.3 });
  }
  // ---------- Дипломат-реликвия: стоит на ребре; кожа со стёжкой «ромб» и серебряными гвоздиками,
  //            широкая серебряная рама с чеканным завитком, крупные угловые накладки, медальон-«звезда» ----------
  function luxAttache(S) {
    const R = S.R, pal = S.trim;
    const W = 290, H = 196, D = 76, r = 13, y0 = 4, y1 = y0 + H;
    const plan = rplan(W, D, r, 4);
    fit(cuboid(-W / 2, W / 2, 0, y1 + 30, -D / 2, D / 2).pts);
    floorShadow(-W / 2, W / 2, -D / 2, D / 2);
    const lea = matFineLeather(S.body), thread = mixc(palOf(pal)[1], S.body, 0.35), silver = matPolish(S.trimKind);
    [-W / 2 + 22, W / 2 - 22].forEach((xx) => paintBox(cuboid(xx - 9, xx + 9, 0, y0 + 1, -D / 2 + 10, -D / 2 + 26), silver, { noEdge: true }));
    const B = prism(plan, y0, y1, lea, {});
    const F = B.front, Sd = B.right, T = B.top, fw = F.w, fb = 15;
    // бок и верх: окантовка шва, накладки
    luxBand(Sd, Sd.w / 2 - 5, 0, Sd.w / 2 + 5, H, pal, 'vine', { sh: 0.35 });
    luxBand(T, 6, D / 2 - 5, W - 6, D / 2 + 5, pal, 'wave', { vert: false });
    [[0, 0, 1, 1], [Sd.w, 0, -1, 1], [0, H, 1, -1], [Sd.w, H, -1, -1]].forEach((q) => mount(Sd, q[0], q[1], q[2], q[3], 18, 6, pal));
    // перед: стёжка ромбом по коже (тиснёные линии и серебряные гвоздики в узлах)
    const qs = 26, qx0 = fb, qx1 = fw - fb, qy0 = fb, qy1 = H - fb;
    const clipIn = (x) => x.rect(qx0, qy0, qx1 - qx0, qy1 - qy0);
    engr(F, mul(S.body, 0.5), (x) => {
      for (let k = -H; k < fw + H; k += qs) { x.moveTo(k, qy0); x.lineTo(k + (qy1 - qy0), qy1); x.moveTo(k + (qy1 - qy0), qy0); x.lineTo(k, qy1); }
    }, { w: 0.9, a: 0.75, hv: 0.42, clip: clipIn });
    const studs = [];
    for (let j = 0; qy0 + j * qs / 2 < qy1 + 1; j++) for (let k = (j % 2) * qs / 2; k < fw; k += qs) if (k > qx0 + 3 && k < qx1 - 3 && j > 0 && qy0 + j * qs / 2 < qy1 - 3) studs.push([k, qy0 + j * qs / 2]);
    relief(F, pal, (x) => studs.forEach((q) => { x.moveTo(q[0] + 1.5, q[1]); x.arc(q[0], q[1], 1.5, 0, TAU); }), 0, H, { hv: 0.72, sh: 0.4 });
    // широкая серебряная рама с чеканным завитком и угловые накладки
    luxBand(F, 0, 0, fw, fb, pal, 'vine', { sh: 0.4 }); luxBand(F, 0, H - fb, fw, H, pal, 'vine', { sh: 0.4 });
    luxBand(F, 0, fb, fb, H - fb, pal, 'vine', { sh: 0.4 }); luxBand(F, fw - fb, fb, fw, H - fb, pal, 'vine', { sh: 0.4 });
    stitch(F, [[fb + 4, fb + 4], [fw - fb - 4, fb + 4], [fw - fb - 4, H - fb - 4], [fb + 4, H - fb - 4]], thread, true);
    [[0, 0, 1, 1], [fw, 0, -1, 1], [0, H, 1, -1], [fw, H, -1, -1]].forEach((q) => mount(F, q[0], q[1], q[2], q[3], 44, 12, pal));
    // медальон-«звезда»: серебряный овал с гильошем-лучами, жемчужник, эмаль раскраски и литое оружие
    const ps = fw / 2, pt = H * 0.54, rx = 96, ry = 54;
    relief(F, pal, (x) => x.ellipse(ps, pt, rx, ry, 0, 0, TAU), pt - ry, pt + ry, { hv: 0.66, sh: 0.6 });
    engr(F, pal, (x) => {
      for (let i = 0; i < 96; i++) { const a = i / 96 * TAU, c = Math.cos(a), s = Math.sin(a); x.moveTo(ps + c * rx * 0.82, pt + s * ry * 0.82); x.lineTo(ps + c * (rx - 4), pt + s * (ry - 4)); }
      x.ellipse(ps, pt, rx - 2.2, ry - 2.2, 0, 0, TAU);
    }, { w: 0.32, a: 0.75 });
    relief(F, pal, (x) => { for (let i = 0; i < 64; i++) { const a = i / 64 * TAU, px = ps + Math.cos(a) * (rx * 0.8), py = pt + Math.sin(a) * (ry * 0.8); x.moveTo(px + 1.5, py); x.arc(px, py, 1.5, 0, TAU); } }, pt - ry, pt + ry, { hv: 0.74, sh: 0.3 });
    each((x, m) => { x.beginPath(); pen(x, F).ellipse(ps, pt, rx * 0.77, ry * 0.75, 0, 0, TAU); x.fillStyle = m === 'c' ? css(mul(S.enamel, F.lit)) : gray(m === 'h' ? 0.58 : 0.85); x.fill(); });
    if (S.inlayFin) inlay(F, ps, pt, rx * 1.54, ry * 1.5, S.inlayFin, { R: R, shape: (x) => { x.beginPath(); x.ellipse(0, 0, rx * 0.77, ry * 0.75, 0, 0, TAU); }, desat: 0.3, k: 0.72, g: 0.9, h: 0.58 });
    weaponPlaque(F, ps, pt, rx * 1.4, ry * 0.9, S, pal, { c: 8, kw: 0.96, kh: 0.86, field: mixc(S.enamel, [4, 3, 8], 0.65) });
    // кодовые замки в раме и ручка
    [0.2, 0.8].forEach((k) => comboLock(F, fw * k, fb / 2, 40, 13, pal));
    luxHandle(-44, 44, y1, 0, 24, mul(S.body, 1.6), pal);
  }
  // Пояс по всем видимым стенкам призмы (узор на каждой стенке — со сдвигом по длине обхода)
  function ringBand(P, t0, t1, pal, kind, o) {
    let off = 0;
    P.walls.forEach((G) => { if (G.vis) luxBand(G, -0.4, t0, G.w + 0.4, t1, pal, kind, Object.assign({ vert: false, off: off + 0.01 }, o)); off += G.w - 1; });
  }
  // ---------- Футляр-овал: рояльный лак, золотые пояса с чеканкой, медальон с камнем на крышке ----------
  function luxEtui(S) {
    const R = S.R, pal = S.trim;
    const W = 300, D = 124, r = D / 2 - 0.5, y0 = 7, y1 = 64, yb = 72, y2 = 104, y3 = 112;
    const pl = (dw) => rplan(W + dw, D + dw, r + dw / 2, 22);
    fit(cuboid(-W / 2 - 6, W / 2 + 6, 0, y3, -D / 2 - 6, D / 2 + 6).pts);
    floorShadow(-W / 2 + 26, W / 2 - 26, -D / 2 + 14, D / 2 - 14);
    const lac = matPiano(tame(S.body, 0.45, 0.07, 0.13)), gilt = matPolish(S.trimKind);
    const base = prism(pl(12), 0, y0, gilt, {});
    ringBand(base, 1, y0 - 1, pal, 'bead');
    const body = prism(pl(0), y0, y1, lac, { noTop: true });
    body.walls.forEach((G) => { if (G.vis) luxBand(G, -0.4, 10, G.w + 0.4, 11.6, pal, 'plain', { vert: false, hv: 0.58 }); });
    const band = prism(pl(6), y1, yb, gilt, {});
    ringBand(band, 0, yb - y1, pal, 'vine');
    const lid = prism(pl(3), yb, y2, lac, { noTop: true });
    lid.walls.forEach((G) => { if (G.vis) luxBand(G, -0.4, G.h - 11.6, G.w + 0.4, G.h - 10, pal, 'plain', { vert: false, hv: 0.58 }); });
    const cap = prism(pl(3), y2, y3, lac, { k1: 0.955 });
    cap.walls.forEach((G) => { if (G.vis) luxBand(G, -0.4, G.h - 1.8, G.w + 0.4, G.h, pal, 'plain', { vert: false, flat: true }); });
    // перед: накладка замка на крышке, медальон черни с литым оружием на корпусе
    const LF = lid.front, F = body.front, lh = y2 - yb, bhh = y1 - y0;
    escutcheon(LF, LF.w / 2, lh * 0.5, 22, pal);
    [0.2, 0.8].forEach((k) => engr(LF, pal, (x) => vinePath(x, LF.w * k - 26, lh * 0.5 - 5, 52, 10, 15), { w: 0.45 }));
    weaponPlaque(F, F.w / 2, bhh * 0.54, 156, 46, S, pal, { c: 7, kw: 0.92, kh: 0.84 });
    // крышка: овальный медальон — камень раскраски в золотой оправе с гильошем и жемчужником
    const T = cap.top, ts = T.w / 2, tt = T.h / 2, mx = 92, my = 42;
    relief(T, pal, (x) => x.ellipse(ts, tt, mx, my, 0, 0, TAU), tt - my, tt + my, { hv: 0.64, sh: 0.5 });
    engr(T, pal, (x) => guillochePath(x, ts, tt, mx - 1.5, my - 1.5, 4, 36), { w: 0.28, a: 0.55 });
    relief(T, pal, (x) => { for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, px = ts + Math.cos(a) * (mx - 9), py = tt + Math.sin(a) * (my - 7); x.moveTo(px + 1.5, py); x.arc(px, py, 1.5, 0, TAU); } }, tt - my, tt + my, { hv: 0.72, sh: 0.25 });
    if (S.inlayFin) {
      inlay(T, ts, tt, (mx - 12) * 2, (my - 10) * 2, S.inlayFin, { R: R, shape: (x) => { x.beginPath(); x.ellipse(0, 0, mx - 12, my - 10, 0, 0, TAU); }, desat: 0.15, k: 0.9, g: 0.95, h: 0.6 });
      // камень раскраски: тёмное ядро и светлое кольцо аккреции (цвета раскраски) под лаком
      const fc = FINISHES[S.inlayFin].c.map(rgbOf), ax = mx - 12, ay = my - 10;
      each((x, m) => {
        if (m !== 'c') return;
        x.beginPath(); pen(x, T).ellipse(ts, tt, ax, ay, 0, 0, TAU); x.clip();
        F_ring(x, 0.92, 0.62, fc[3] || fc[1], 0.35, 9); F_ring(x, 0.6, 0.12, fc[1], 0.95, 3.5); F_ring(x, 0.47, 0.06, fc[2] || WHITE, 0.9, 1.5);
        x.beginPath(); pen(x, T).ellipse(ts, tt, ax * 0.4, ay * 0.4, 0, 0, TAU); x.fillStyle = css(fc[0]); x.fill();
        const g = T.lg(x, ts, tt - ay, ts, tt + ay); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(0.45, 'rgba(255,255,255,0)');
        x.beginPath(); pen(x, T).ellipse(ts, tt, ax, ay, 0, 0, TAU); x.fillStyle = g; x.fill();
      });
      function F_ring(x, k, wk, col, a, blur) {
        x.save(); x.filter = 'blur(' + blur + 'px)'; x.beginPath(); pen(x, T).ellipse(ts, tt, ax * k, ay * k, 0, 0, TAU);
        x.lineWidth = Math.max(1.5, ay * wk * faceK(T, ts, tt)); x.strokeStyle = css(col, a); x.stroke(); x.restore();
      }
    }
    else each((x, m) => { x.beginPath(); pen(x, T).ellipse(ts, tt, mx - 12, my - 10, 0, 0, TAU); x.fillStyle = m === 'c' ? css(mul(S.enamel, T.lit)) : gray(0.6); x.fill(); });
    engr(T, pal, (x) => { x.ellipse(ts, tt, mx + 9, my + 8, 0, 0, TAU); }, { w: 0.35, a: 0.5 });
  }
  // Чеканная розетка в круглой оправе (на узких гранях шкатулки и реликвария)
  function roundel(F, s, t, r, pal) {
    relief(F, pal, (x) => x.arc(s, t, r, 0, TAU), t - r, t + r, { hv: 0.64, sh: 0.5, sc: s });
    engr(F, pal, (x) => x.arc(s, t, r - 1.6, 0, TAU), { w: 0.35, a: 0.6 });
    engraveRosette(F, s, t, r * 0.72, pal);
  }
  // ---------- Восьмигранная шкатулка: корень ореха под лаком, золочёный кант, ступенчатая крышка ----------
  function luxOcta(S) {
    const R = S.R, pal = S.trim;
    const W = 252, D = 168, c = 44, yf = 8, y0 = 16, y1 = 92, y2 = 102, y3 = 128, y4 = 133;
    const op = (dw) => octPlan(W + dw, D + dw, c + dw * 0.41);
    fit(cuboid(-W / 2 - 8, W / 2 + 8, 0, y4, -D / 2 - 8, D / 2 + 8).pts);
    floorShadow(-W / 2 + 22, W / 2 - 22, -D / 2 + 18, D / 2 - 18);
    const gilt = matPolish(S.trimKind), burl = matBurl(BURL[S.trimKind === 'gold' ? 'walnut' : 'amboyna']);
    // ножки-кронштейны под гранями-скосами, цоколь с жемчужником
    [[-1, -1], [1, -1], [1, 1]].forEach((q) => {
      const cx = q[0] * (W / 2 - c * 0.85), cz = q[1] * (D / 2 - c * 0.85);
      paintBox(cuboid(cx - 10, cx + 10, 0, yf, cz - 10, cz + 10), gilt, { noTop: true });
    });
    const base = prism(op(14), yf, y0, gilt, {});
    ringBand(base, 1, y0 - yf - 1, pal, 'bead');
    const body = prism(op(0), y0, y1, burl, { noTop: true });
    const H = y1 - y0;
    body.walls.forEach((G) => {
      if (!G.vis) return;
      luxBand(G, -0.3, 0, 4.5, H, pal, 'plain', { vert: true }); luxBand(G, G.w - 4.5, 0, G.w + 0.3, H, pal, 'plain', { vert: true });
      engr(G, pal, (x) => x.rect(11, 9, G.w - 22, H - 18), { w: 0.9, a: 0.5 });
      if (G.w < 80) roundel(G, G.w / 2, H / 2, Math.min(15, G.w * 0.28), pal);
    });
    // перед: золотой картуш с гравировкой оружия в лавре; бок — накладка с гильошем
    const F = body.front, fs = F.w / 2, ft = H * 0.52;
    weaponPlaque(F, fs, ft, 124, 50, S, pal, { c: 8, kw: 0.88, kh: 0.78 });
    const Sd = body.right;
    if (Sd.vis) {
      relief(Sd, pal, (x) => x.ellipse(Sd.w / 2, H / 2, 30, 22, 0, 0, TAU), H / 2 - 22, H / 2 + 22, { hv: 0.66, sh: 0.5, sc: Sd.w / 2 });
      engr(Sd, pal, (x) => guillochePath(x, Sd.w / 2, H / 2, 27, 19, 7, 12), { w: 0.28, a: 0.55 });
    }
    // крышка: пояс с завитком, скат из ореха, золотая площадка с вставкой раскраски
    const band = prism(op(8), y1, y2, gilt, {});
    ringBand(band, 0, y2 - y1, pal, 'vine');
    escutcheon(band.front, band.front.w / 2, (y2 - y1) / 2 + 8, 22, pal);
    const roof = prism(op(8), y2, y3, burl, { k1: 0.7 });
    const opl = (k, y) => [7, 0, 1, 2, 3].map((i) => { const q = op(8)[i]; return [q[0] * k, y, q[1] * k]; });      // видимая часть контура
    goldCord(opl(1, y2 + 0.6), pal, 2.6); goldCord(opl(0.7, y3), pal, 1.8);
    const plat = prism(op(8).map((q) => [q[0] * 0.7, q[1] * 0.7]), y3, y4, gilt, {});
    ringBand(plat, 0, y4 - y3, pal, 'wave');
    const T = plat.top, k = 0.62, ip = op(8).map((q) => [q[0] * k, q[1] * k]);
    const tp = (q) => [q[0] + T.w / 2, T.h / 2 - q[1]];
    engr(T, pal, (x) => { ip.forEach((q, i) => { const p = tp(q); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.closePath(); }, { w: 0.5 });
    if (S.inlayFin) {
      const ki = 0.54, w = (W + 8) * ki, h = (D + 8) * ki, cc = (c + 8 * 0.41) * ki;
      inlay(T, T.w / 2, T.h / 2, w, h, S.inlayFin, { R: R, shape: (x) => { x.beginPath(); octPlan(w, h, cc).forEach((q, i) => (i ? x.lineTo(q[0], -q[1]) : x.moveTo(q[0], -q[1]))); x.closePath(); }, desat: 0.2, k: 0.85, g: 0.98, h: 0.56, zoom: 3.5, soft: 1.2 });
      // лак поверх вставки: мягкий блик к переднему краю
      each((x, m) => { if (m !== 'c') return; x.beginPath(); octPlan(w, h, cc).forEach((q, i) => { const p = T.p(T.w / 2 + q[0], T.h / 2 - q[1]); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.closePath(); const g = T.lg(x, T.w / 2, T.h / 2 - h / 2, T.w / 2, T.h / 2 + h / 2); g.addColorStop(0, 'rgba(0,0,0,.12)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,250,230,.22)'); x.fillStyle = g; x.fill(); });
    }
  }
  // Чернёное серебро: тёмный металл, светлое — только кромки, жемчужник и чеканка (палитра 'silver');
  // гравировка — чернью в углублениях со светлой кромкой (палитра NIELLO)
  const matNiello = () => ({ c: [50, 53, 61], g: 0.88, edge: 0.55, tex: (x, F) => { patternOn(x, F, brushTile(), 0.22, 1); } });
  const NIELLO = [[236, 240, 246], [150, 156, 166], [64, 68, 78], [6, 7, 10]];
  // Панель с камнем раскраски в чеканной раме (картуш)
  function stonePanel(F, s, t, w, h, S, pal, R) {
    relief(F, pal, (x) => cartPath(x, s, t, w + 7, h + 7, 7), t - h / 2 - 3.5, t + h / 2 + 3.5, { hv: 0.66, sh: 0.5, sc: s });
    engr(F, NIELLO, (x) => cartPath(x, s, t, w + 2.6, h + 2.6, 5.5), { w: 0.4, a: 0.8 });
    each((x, m) => { x.beginPath(); cartPath(pen(x, F), s, t, w, h, 5); x.fillStyle = m === 'c' ? css(mul(S.enamel, F.lit * 0.9)) : gray(m === 'h' ? 0.5 : 0.85); x.fill(); });
    if (S.inlayFin) inlay(F, s, t, w, h, S.inlayFin, { R: R, shape: (x) => { x.beginPath(); cartPath(x, 0, 0, w, h, 5); }, desat: 0.35, k: 0.66, g: 0.9, h: 0.5 });
  }
  // ---------- Реликварий: чернёное серебро, низкая тяжёлая кровля в чешуе, литой конёк с навершиями ----------
  function luxChasse(S) {
    const R = S.R, pal = S.trim;
    const W = 236, D = 116, yl = 10, y0 = 18, y1 = 112, y2 = 124, hr = 30, yr = y2 + hr, H = y1 - y0, ov = 9;
    fit(cuboid(-W / 2 - ov - 3, W / 2 + ov + 3, 0, yr + 20, -D / 2 - ov - 3, D / 2 + ov + 3).pts);
    floorShadow(-W / 2 - 4, W / 2 + 4, -D / 2 - 4, D / 2 + 4);
    const nil = matNiello(), sil = matPolish(S.trimKind === 'gold' ? 'oxgold' : 'oxsil'), dk = S.trimKind === 'gold' ? 'oxgold' : 'oxsil';
    [[-1, -1], [1, -1], [1, 1]].forEach((q) => {
      const cx = q[0] * (W / 2 - 4), cz = q[1] * (D / 2 - 4);
      paintBox(cuboid(cx - 9, cx + 9, 0, yl, cz - 9, cz + 9), sil, { noTop: true });
    });
    const base = cuboid(-W / 2 - 7, W / 2 + 7, yl, y0, -D / 2 - 7, D / 2 + 7);
    paintBox(base, sil);
    luxBand(base.front, 0, 1, base.front.w, y0 - yl - 1, dk, 'bead'); luxBand(base.right, 0, 1, base.right.w, y0 - yl - 1, dk, 'bead');
    const body = cuboid(-W / 2, W / 2, y0, y1, -D / 2, D / 2);
    paintBox(body, nil, { noTop: true });
    seamShade(body.front, 6, 0.5); seamShade(body.right, 6, 0.45);
    const F = body.front, Sd = body.right;
    // перед: чернёный завиток по всему полю, два камня в картушах, по центру — медальон с литым оружием
    engr(F, NIELLO, (x) => { for (let t = 10; t < H - 14; t += 13) vinePath(x, 6, t, W - 12, 13, 22); }, { w: 0.5, a: 0.9, hv: 0.4 });
    luxBand(F, 0, 0, W, 8, dk, 'wave'); luxBand(F, 0, H - 8, W, H, dk, 'wave');
    [0.11, 0.89].forEach((k) => stonePanel(F, W * k, H / 2, 32, H - 34, S, pal, R));
    [50, W - 50].forEach((s) => {                                    // витые колонки с капителью и базой
      relief(F, pal, (x) => { x.rect(s - 4, 13, 8, H - 26); x.rect(s - 6.5, 10, 13, 4); x.rect(s - 6.5, H - 14, 13, 4); }, 10, H - 10, { hv: 0.72, sh: 0.45, sc: s });
      engr(F, NIELLO, (x) => { for (let t = 15; t < H - 15; t += 3.4) { x.moveTo(s - 4, t + 2.6); x.lineTo(s + 4, t); } }, { w: 0.4, a: 0.7 });
    });
    weaponPlaque(F, W / 2, H / 2, 122, 54, S, pal, { c: 8, kw: 0.9, kh: 0.76, field: [10, 18, 22] });
    // бок: камень в картуше и чернёный завиток
    engr(Sd, NIELLO, (x) => { for (let t = 10; t < H - 14; t += 13) vinePath(x, 6, t, D - 12, 13, 22); }, { w: 0.5, a: 0.9, hv: 0.4 });
    luxBand(Sd, 0, 0, D, 8, dk, 'wave'); luxBand(Sd, 0, H - 8, D, H, dk, 'wave');
    stonePanel(Sd, D / 2, H / 2, D - 40, H - 34, S, pal, R);
    // карниз
    const cor = cuboid(-W / 2 - 6, W / 2 + 6, y1, y2, -D / 2 - 6, D / 2 + 6);
    paintBox(cor, sil);
    luxBand(cor.front, 0, 0, cor.front.w, y2 - y1, dk, 'vine'); luxBand(cor.right, 0, 0, cor.right.w, y2 - y1, dk, 'vine');
    // низкая кровля с напуском: тёмная чешуя (чернь в швах, светлая кромка каждой чешуйки)
    const G = gable(W + 2 * ov, D + 2 * ov, y2, hr, nil), RF = G.front, E = G.end;
    engr(RF, NIELLO, (x) => {
      const st = 11;
      for (let j = 0, t = 4; t < RF.h - 6; j++, t += st * 0.55) {
        for (let s = (j % 2) * st / 2 + 2; s < RF.w; s += st) { x.moveTo(s + st / 2, t); x.arc(s, t, st / 2, 0, Math.PI); }
      }
    }, { w: 0.7, a: 0.95, hv: 0.38 });
    luxBand(RF, 0, RF.h - 7, RF.w, RF.h, pal, 'bead');
    goldCord([[-W / 2 - ov, y2, -D / 2 - ov], [W / 2 + ov, y2, -D / 2 - ov], [W / 2 + ov, y2, D / 2 + ov]], pal, 2.4);
    if (E.vis) {
      const ew = E.w, eh = E.h;
      each((x, m) => { x.beginPath(); const P = pen(x, E); P.moveTo(16, eh - 5); P.lineTo(ew / 2, 6); P.lineTo(ew - 16, eh - 5); P.closePath(); x.fillStyle = m === 'c' ? css(mul(S.enamel, E.lit)) : gray(m === 'h' ? 0.46 : 0.85); x.fill(); });
      engr(E, NIELLO, (x) => { x.moveTo(11, eh - 2.5); x.lineTo(ew / 2, 2.5); x.lineTo(ew - 11, eh - 2.5); x.closePath(); }, { w: 0.6 });
      // пальметта чеканкой, растёт из нижней кромки фронтона
      relief(E, pal, (x) => { for (let i = -3; i <= 3; i++) leafPath(x, ew / 2 + i * 4.2, eh - 9 - (3 - Math.abs(i)) * 1.6, 13 - Math.abs(i) * 1.5, 1.9, -Math.PI / 2 + i * 0.32); }, eh - 22, eh - 3, { hv: 0.7, sh: 0.4, sc: ew / 2 });
    }
    // литой ажурный конёк: сплошной гребень с чернёными четырёхлистниками и три навершия
    const cr = faceOf([-W / 2 - ov, yr + 9, 0], [W / 2 + ov, yr + 9, 0], [W / 2 + ov, yr - 1, 0], [-W / 2 - ov, yr - 1, 0]), cw = cr.w;
    relief(cr, pal, (x) => { x.moveTo(0, 10); x.lineTo(0, 3); x.quadraticCurveTo(cw / 2, 0.5, cw, 3); x.lineTo(cw, 10); x.closePath(); }, 0, 10, { hv: 0.74, sh: 0.5 });
    engr(cr, NIELLO, (x) => { for (let s = 8; s < cw - 6; s += 9) { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; x.moveTo(s + Math.cos(a) * 2.6 + 1.1, 5.6 + Math.sin(a) * 2.2); x.arc(s + Math.cos(a) * 1.5, 5.6 + Math.sin(a) * 1.3, 1.1, 0, TAU); } } x.moveTo(0, 8.6); x.lineTo(cw, 8.6); }, { w: 0.4, a: 0.95 });
    const fin = faceOf([-W / 2 - ov, yr + 24, 0], [W / 2 + ov, yr + 24, 0], [W / 2 + ov, yr + 4, 0], [-W / 2 - ov, yr + 4, 0]);
    relief(fin, pal, (x) => {
      [5, cw / 2, cw - 5].forEach((s, i) => {
        const k = i === 1 ? 1.25 : 1;
        x.moveTo(s - 2 * k, 20); x.lineTo(s + 2 * k, 20); x.lineTo(s + 1.4 * k, 12); x.lineTo(s - 1.4 * k, 12); x.closePath();
        x.moveTo(s + 3.6 * k, 10); x.arc(s, 10, 3.6 * k, 0, TAU);
        leafPath(x, s, 10 - 7 * k, 8 * k, 2.4 * k, Math.PI / 2);
      });
    }, 0, 20, { hv: 0.78, sh: 0.5 });
  }
  const LUX = { casket: luxCasket, attache: luxAttache, etui: luxEtui, octa: luxOcta, chasse: luxChasse };
  const LUX_ORDER = ['casket', 'attache', 'etui', 'octa', 'chasse'];
  const LUX_V = { royal: 'casket', ultra_supernova: 'attache', ultra_blackhole: 'etui', ultra_liquidgold: 'octa', ultra_abyss: 'chasse' };

  // =====================================================================
  //  Стиль кейса из его данных
  // =====================================================================
  // Ножевые кейсы: у каждой модели ножа — своё семейство и подача ножа
  const KNIFE_FAM = {
    bay: 'mil', m9: 'mil', knife: 'mil', kukri: 'mil',
    para: 'hard', surv: 'hard', gut: 'hard', push: 'hard',
    kar: 'flight', bfly: 'flight', talon: 'flight', skel: 'flight', stil: 'flight',
    hunt: 'pres', bowie: 'pres', classic: 'pres', nomad: 'pres', bear: 'pres',
    flip: 'trunk', nav: 'trunk', falc: 'trunk',
  };
  // Оружейные и стартовые: по типу оружия (первое — основное), тематические серии w_<тема><N> — по кругу,
  // стартовые — по порядку в разделе; особые модели — свои
  const TYPE_FAM = { pistol: ['hard', 'flight', 'mil'], smg: ['mil', 'hard', 'flight'], rifle: ['mil', 'flight', 'hard'], sniper: ['flight', 'mil'], shotgun: ['crate', 'mil', 'hard'], mg: ['mil', 'crate'] };
  const THEME_FAM = { smgs: ['hard', 'flight', 'mil'], heavy: ['mil', 'crate', 'mil'], duel: ['flight', 'hard', 'pres', 'flight'], assault: ['mil', 'flight', 'hard'], longshot: ['flight', 'mil'] };
  const START_FAM = ['mil', 'hard', 'crate'];
  const WEAPON_FAM = { r8: 'pres', zeus: 'hard' };
  // Серии и коллекции — по семейству раскраски
  const SERIES_FAM = { field: 'crate', metal: 'mil', neon: 'hard', wild: 'crate', elem: 'flight' };
  const COLL_FAM = { neon: 'flight', elem: 'flight', metal: 'flight', wild: 'crate', field: 'crate' };
  // Раскраски — «настоящие материалы» (идут материалом, а не вставкой)
  const WARM = (c) => { const h = toHsl(c)[0] * 360; return h < 75 || h > 330; };

  function styleOf(c) {
    const a = c.art, R = rngOf('crate:' + c.id);
    const wid = a[3], wt = (WEAPONS[wid] || {}).type || 'rifle';
    const fins = [c.paint, a[4]].filter((f) => f && FINISHES[f]);
    const ffam = fins.map((f) => FIN_FAMILY[f]).filter(Boolean);
    const main = rgbOf(a[0]), acc = rgbOf(a[1]);
    const neon = (c.paint ? FIN_FAMILY[c.paint] === 'neon' : ffam[0] === 'neon') && toHsl(main)[1] > 0.4;
    let fam;
    if (c.sec === 'ultra') fam = 'lux';
    else if (c.sec === 'relics') fam = 'safe';
    else if (c.sec === 'gloves' || wt === 'gloves') fam = 'trunk';
    else if (c.sec === 'knives') fam = KNIFE_FAM[wid] || ['flight', 'pres', 'hard', 'mil'][seedOf(c.id) % 4];
    else if (c.sec === 'premium') fam = c.paint && FINISHES[c.paint] && FINISHES[c.paint].kind === 'metal' ? 'pres' : 'flight';
    else if (c.sec === 'series') fam = SERIES_FAM[ffam[0]] || 'mil';
    else if (c.sec === 'collections') fam = lum(main) > 0.6 ? 'hard' : COLL_FAM[FIN_FAMILY[c.paint] || ffam[0]] || 'flight';
    else if (c.sec === 'starter') fam = START_FAM[CASES.filter((q) => q.sec === 'starter').indexOf(c) % START_FAM.length];
    else {
      const m = /^w_([a-z]+)(\d+)$/.exec(c.id), prefs = (m && THEME_FAM[m[1]]) || TYPE_FAM[wt] || TYPE_FAM.rifle;
      fam = WEAPON_FAM[wid] || prefs[(m ? +m[2] - 1 : 0) % prefs.length];
    }
    const sn = /(\d+)$/.exec(c.id), nth = sn ? +sn[1] - 1 : 0;     // номер кейса в серии
    const S = { c: c, id: c.id, R: R, fam: fam, weap: wid, fin: a[4] && FINISHES[a[4]] ? a[4] : null, shape: a[2] || 'diamond', neon: neon };
    S.knife = c.sec === 'knives';
    S.gloves = wt === 'gloves';
    // цвета: краска всегда «настоящая» — без кислотности; неон — глубокий баклажан и пыльная роза
    S.body = neon ? tame(main, 0.24, 0.12, 0.2) : tame(main, 0.42, 0.11, 0.52);
    S.acc = neon ? tame(acc, 0.42, 0.5, 0.62) : tame(acc, 0.6, 0.4, 0.68);
    const light = lum(S.body) > 0.45;
    S.sten = light ? css([34, 36, 40]) : css(tame(acc, 0.3, 0.8, 0.86));
    S.ink = WARM(acc) ? [58, 52, 120] : [130, 40, 44];
    S.foam = [34, 35, 38];
    S.trimKind = WARM(acc) ? 'gold' : 'silver';
    S.trim = S.trimKind;
    // вставка из раскраски — только приглушённо, не «весь корпус»
    const paint = c.paint && FINISHES[c.paint] ? c.paint : null;
    S.inlayFin = paint && ['plywood', 'carbon', 'gilded'].indexOf(paint) < 0 ? paint : null;
    if (!S.inlayFin && c.sec === 'ultra') S.inlayFin = a[4];
    const idx = CASES.indexOf(c) + 1, Rm = rngOf('mark:' + c.id), L2 = () => 'ABCDEFGHJKLMNPRSTUVWXZ'[Math.floor(Rm() * 22)];
    const num = (n) => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(Rm() * 10); return s; };
    S.code = {
      lot: 'LOT ' + L2() + L2() + '-' + num(3), batch: num(2) + '/' + (20 + Math.floor(Rm() * 7)),
      sn: 'S/N CL' + String(idx).padStart(2, '0') + num(4), model: String(wid || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
      cl: 'CL-' + String(idx).padStart(2, '0'), kg: (6 + Rm() * 28).toFixed(1) + ' KG',
      // английское название кейса трафаретом (только буквы шрифта), длинные — до первого слова
      name: (function () {
        const n = String((c.name && c.name.en) || c.id).toUpperCase().replace(/[^A-Z0-9 \-]/g, '').trim();
        return n.length > 15 ? n.split(' ')[0] : n;
      })(),
    };
    // варианты внутри семейства
    switch (fam) {
      case 'mil':
        S.v = S.knife ? 'long' : c.sec === 'series' ? ['crate', 'long', 'ammo', 'crate'][nth % 4]
          : wt === 'mg' || (wt === 'smg' && R() < 0.7) ? 'ammo' : (wt === 'rifle' || wt === 'sniper') && R() < 0.65 ? 'long' : 'crate';
        S.ribs = c.sec === 'series' ? ['h', 'panel', 'v', 'panel'][nth % 4] : pick(R, ['h', 'panel', 'v']);
        S.lidRibs = R() < 0.5; S.corners = R() < 0.7; S.rivets = R() < 0.6;
        S.latch = R() < 0.45 ? 'clamp' : 'lever'; S.zinc = R() < 0.35; S.seal = R() < 0.5;
        S.band = !light && R() < 0.4; S.bandCol = tame(acc, 0.32, 0.38, 0.5);
        break;
      case 'flight':
        S.v = S.knife || c.sec === 'collections' || c.sec === 'premium' ? 'std' : c.sec === 'series' ? ['std', 'long', 'flat'][nth % 3]
          : wt === 'sniper' || (wt === 'rifle' && R() < 0.5) ? 'long' : wt === 'pistol' ? 'flat' : 'std';
        S.panel = paint === 'carbon' ? 'carbon' : R() < 0.5 ? 'dimple' : 'plain';
        S.balls = R() < 0.75;
        S.edges = paint === 'carbon' || R() < 0.45 ? 'black' : 'alu';
        if (paint === 'carbon') { S.body = [40, 42, 46]; S.sten = css([214, 190, 120]); }
        break;
      case 'hard':
        S.v = c.sec === 'series' ? ['std', 'flat', 'tall', 'std'][nth % 4] : wt === 'pistol' ? 'flat' : 'std';
        S.lidRibs = c.sec === 'series' ? nth % 2 === 1 : R() < 0.5;
        S.sideHandle = S.v === 'tall' || R() < 0.4;
        S.warn = wid === 'zeus' ? 'volt' : R() < 0.35 ? 'warn' : null;
        if (light) S.body = tame(main, 0.12, 0.66, 0.8);
        break;
      case 'crate':
        S.v = ffam[0] === 'field' ? (paint === 'plywood' ? 'pine' : 'army') : ffam[0] === 'wild' ? ['pine', 'ash', 'dark'][nth % 3] : wt === 'shotgun' ? 'dark' : pick(R, ['army', 'pine', 'dark']);
        S.brace = S.v === 'pine' ? R() < 0.7 : R() < 0.3;
        S.corners = R() < 0.7; S.rope = S.v !== 'army' || R() < 0.4; S.lock = R() < 0.4;
        S.iron = S.v === 'army' ? paintPal(mul(S.body, 0.8)) : METAL.dark;
        if (S.v === 'pine') S.sten = css([30, 30, 32]);
        if (S.v === 'dark') S.sten = css([226, 220, 206]);
        break;
      case 'pres': {
        const h = toHsl(main)[0] * 360;
        S.wood = h < 25 || h > 330 ? 'mahog' : h < 170 ? 'walnut' : h < 250 ? 'ebony' : 'mahog';
        // светлый основной цвет (золото) — лак берём из тёмного акцента, а золото уходит в отделку
        S.lacquer = lum(main) > 0.45 || paint === 'gilded' ? (lum(acc) < 0.2 ? tame(acc, 0.4, 0.1, 0.16) : tame(main, 0.32, 0.4, 0.48)) : null;
        S.trim = paint === 'gilded' || S.lacquer ? 'gold' : 'brass';
        S.lidStyle = R() < 0.5 ? 'flat' : 'chamfer';
        S.feet = R() < 0.5 ? 'plinth' : 'bun';
        S.plateR = R() < 0.4 ? 10 : 2;
        break;
      }
      case 'trunk':
        S.body = tame(main, 0.45, 0.14, 0.3); S.strap = tame(mixc(main, [120, 80, 50], 0.6), 0.45, 0.22, 0.34);
        S.canvas = S.knife; S.straps = !S.knife;
        if (S.canvas) S.body = tame(main, 0.32, 0.2, 0.32);
        S.wood = S.knife ? 'walnut' : 'oak'; S.trim = S.knife || R() < 0.5 ? 'brass' : 'steel';
        if (R() < 0.5) S.strap = tame([34, 30, 28], 0.2, 0.12, 0.16);
        break;
      case 'safe':
        S.v = wid === 'm9' || c.id === 'treasury' ? 'vault' : toHsl(main)[2] < 0.06 ? 'keypad' : 'dial';
        S.wheel = R() < 0.5;
        S.body = tame(main, 0.5, 0.12, 0.26);
        S.trim = S.trimKind === 'gold' ? 'brass' : 'steel';
        break;
      case 'lux':
        // у каждого артефактного кейса свой кофр; новые артефактные кейсы — по кругу
        S.v = LUX_V[c.id] || LUX_ORDER[seedOf(c.id) % LUX_ORDER.length];
        S.body = tame(main, 0.5, 0.08, 0.17);
        S.enamel = tame(mixc(main, acc, 0.2), 0.45, 0.12, 0.22);
        S.trimKind = toHsl(acc)[0] * 360 > 290 || toHsl(acc)[0] * 360 < 15 ? 'silver' : WARM(acc) ? 'gold' : 'silver';
        S.trim = S.trimKind;
        break;
    }
    return S;
  }

  const FAMS = { mil: famMil, flight: famFlight, hard: famHard, crate: famCrate, pres: famPres, trunk: famTrunk, safe: famSafe, lux: (S) => LUX[S.v](S) };

  function buildCrate(c) {
    const cv = mk(CW, CH), hc = mk(CW, CH), gc = mk(CW, CH);
    LC = cv.getContext('2d'); LH = hc.getContext('2d'); LG = gc.getContext('2d');
    POST = [];
    const S = styleOf(c);
    CUR = S;
    GX = S.R() * CW * 0.7; GY = S.R() * CH * 0.7;
    (FAMS[S.fam] || famMil)(S);
    relight(cv, hc, gc, { mask: 'alpha', k: 5.5, r: 1.0, spec: 0.75, ao: 1.4 });
    POST.forEach((f) => f());
    LC = LH = LG = CUR = null;
    return cv;
  }

  return { build: buildCrate, styleOf: styleOf };
})();
