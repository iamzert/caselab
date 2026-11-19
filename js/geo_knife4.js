'use strict';

// Ножи: m9 (Штык-нож М9), talon (Ястребиный клюв), skel (Скелетный нож). Формат — см. art_geo.js.
// Силуэты сняты с настоящих ножей и повёрнуты остриём вправо:
//   m9    — штык-нож: клинок с клип-скосом, пилой на обухе и прорезью-кусачками, гарда с кольцом под ствол,
//           цилиндрическая рукоять с кольцевыми рёбрами и насечкой, навершие с защёлкой;
//   talon — складной нож с серповидным клинком-«клювом» (три отверстия, джимпинг на обухе),
//           рамка-лайнеры с болстером и осью, накладки на штифтах, кольцо на торце рукояти;
//   skel  — цельный стальной «скелетный» нож: копьевидный клинок, гарда-шпоры, кольцо под палец,
//           оплётка паракордом и хвостовик с отверстием под темляк.
(function () {
  const { engrave } = GEOH;

  // ---------- Помощники построения ----------
  const r1 = (v) => Math.round(v * 10) / 10;
  const pt = (p) => r1(p[0]) + ',' + r1(p[1]);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function bz(s, t) {
    const u = 1 - t;
    return [u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0],
      u * u * u * s[0][1] + 3 * u * u * t * s[1][1] + 3 * u * t * t * s[2][1] + t * t * t * s[3][1]];
  }
  // Плавная кривая через точки (Катмулл–Ром) → кубические сегменты; pre / post — соседи для гладкого стыка
  function crSegs(pts, pre, post) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i - 1] || pre || pts[i], b = pts[i], c = pts[i + 1], e = pts[i + 2] || post || pts[i + 1];
      out.push([b, [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6], c]);
    }
    return out;
  }
  // Контур: d — строка SVG-пути, pl — плотная ломаная по нему же (для кромок, смещений, насечек)
  function Shape(p0) {
    const o = { d: 'M' + pt(p0), pl: [p0] };
    const last = () => o.pl[o.pl.length - 1];
    const seg = (s) => {
      o.d += ' C' + pt(s[1]) + ' ' + pt(s[2]) + ' ' + pt(s[3]);
      const n = Math.max(4, Math.ceil(Math.hypot(s[3][0] - s[0][0], s[3][1] - s[0][1]) / 2));
      for (let j = 1; j <= n; j++) o.pl.push(bz(s, j / n));
    };
    o.L = function () {
      for (let i = 0; i < arguments.length; i++) {
        const a = last(), b = arguments[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
        o.d += ' L' + pt(b);
        for (let j = 1; j <= n; j++) o.pl.push(lerp(a, b, j / n));
      }
      return o;
    };
    o.S = function (pts, pre, post) { crSegs([last()].concat(pts), pre, post).forEach(seg); return o; };
    o.C = function (c1, c2, p) { seg([last(), c1, c2, p]); return o; };
    o.Q = function (c, p) { const a = last(); return o.C(lerp(a, c, 2 / 3), lerp(p, c, 2 / 3), p); };
    o.P = function (pl) { pl.forEach((p) => o.L(p)); return o; };
    o.Z = () => { o.d += ' Z '; return o; };
    return o;
  }
  // Длины вдоль ломаной; точка на доле длины; часть ломаной между долями; доля длины, где ломаная проходит x
  function lens(pl) {
    const L = [0];
    for (let i = 1; i < pl.length; i++) L.push(L[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
    return L;
  }
  function at(pl, t) {
    const L = lens(pl), s = t * L[L.length - 1];
    let i = 1;
    while (i < L.length - 1 && L[i] < s) i++;
    return lerp(pl[i - 1], pl[i], Math.max(0, Math.min(1, (s - L[i - 1]) / ((L[i] - L[i - 1]) || 1))));
  }
  function cut(pl, t0, t1) {
    const L = lens(pl), tot = L[L.length - 1], out = [at(pl, t0)];
    for (let i = 1; i < pl.length - 1; i++) if (L[i] > t0 * tot && L[i] < t1 * tot) out.push(pl[i]);
    out.push(at(pl, t1));
    return out;
  }
  function tAtX(pl, x) {
    const L = lens(pl);
    for (let i = 1; i < pl.length; i++) {
      if ((pl[i][0] - x) * (pl[i - 1][0] - x) <= 0) {
        const k = (x - pl[i - 1][0]) / ((pl[i][0] - pl[i - 1][0]) || 1);
        return (L[i - 1] + (L[i] - L[i - 1]) * k) / L[L.length - 1];
      }
    }
    return 1;
  }
  // Смещение по нормали на f(t): «+» — влево по ходу (при ходе вправо — вверх)
  function offs(pl, f) {
    const L = lens(pl), tot = L[L.length - 1] || 1, n = pl.length;
    return pl.map((p, i) => {
      const a = pl[Math.max(0, i - 1)], b = pl[Math.min(n - 1, i + 1)];
      const nx = b[1] - a[1], ny = a[0] - b[0], l = Math.hypot(nx, ny) || 1;
      const d = typeof f === 'function' ? f(L[i] / tot) : f;
      return [p[0] + nx / l * d, p[1] + ny / l * d];
    });
  }
  const line = (pl) => 'M' + pl.map(pt).join(' L') + ' ';
  const closed = (pl) => line(pl) + 'Z ';
  const band = (a, b) => 'M' + a.map(pt).join(' L') + ' L' + b.slice().reverse().map(pt).join(' L') + ' Z ';
  // Полоса вдоль ломаной шириной w(t) в сторону side (+1 / −1): подточки, фаски
  const strip = (pl, w, side) => band(pl, offs(pl, (t) => (typeof w === 'function' ? w(t) : w) * side));
  // Ломаная через точки (Катмулл–Ром)
  const spl = (pts, pre, post) => Shape(pts[0]).S(pts.slice(1), pre, post).pl;
  // Джимпинг: на участке t0..t1 ломаной n V-образных зубцов глубиной dep (side −1 — вправо по ходу)
  function jimp(pl, t0, t1, n, dep, side) {
    const out = cut(pl, 0, t0);
    for (let j = 0; j < n; j++) {
      const tb = t0 + (t1 - t0) * (j + 0.5) / n, tc = t0 + (t1 - t0) * (j + 1) / n;
      const b = at(pl, tb), q = at(pl, Math.min(1, tb + 0.003)), r = at(pl, Math.max(0, tb - 0.003));
      const nx = q[1] - r[1], ny = r[0] - q[0], l = Math.hypot(nx, ny) || 1;
      out.push([b[0] + nx / l * dep * side, b[1] + ny / l * dep * side], at(pl, tc));
    }
    return out.concat(cut(pl, t1, 1).slice(1));
  }
  // Эллипс кубическими кривыми (без команды A: её рамку art.js считает с запасом и раздувает картинку)
  function ell(cx, cy, rx, ry, rot) {
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0), k = 0.5523;
    const P = (x, y) => pt([cx + x * c - y * s, cy + x * s + y * c]);
    return 'M' + P(rx, 0) + ' C' + P(rx, ry * k) + ' ' + P(rx * k, ry) + ' ' + P(0, ry) +
      ' C' + P(-rx * k, ry) + ' ' + P(-rx, ry * k) + ' ' + P(-rx, 0) +
      ' C' + P(-rx, -ry * k) + ' ' + P(-rx * k, -ry) + ' ' + P(0, -ry) +
      ' C' + P(rx * k, -ry) + ' ' + P(rx, -ry * k) + ' ' + P(rx, 0) + ' Z ';
  }
  const circ = (cx, cy, r) => ell(cx, cy, r, r, 0);
  // Дуга эллипса ломаной; углы в градусах, рост угла — по часовой на экране
  function arc(cx, cy, rx, ry, a0, a1) {
    const out = [], n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 5));
    for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    return out;
  }
  // Овальная прорезь (стадион) ломаной: центр, длина, высота, поворот (рад)
  function slotPl(cx, cy, len, h, rot) {
    const r = h / 2, a = len / 2 - r, c = Math.cos(rot || 0), s = Math.sin(rot || 0), pts = [];
    for (let i = 0; i <= 10; i++) { const t = -Math.PI / 2 + Math.PI * i / 10; pts.push([a + r * Math.cos(t), r * Math.sin(t)]); }
    for (let i = 0; i <= 10; i++) { const t = Math.PI / 2 + Math.PI * i / 10; pts.push([-a + r * Math.cos(t), r * Math.sin(t)]); }
    return pts.map((p) => [cx + p[0] * c - p[1] * s, cy + p[0] * s + p[1] * c]);
  }
  // Профиль y(x) по точкам с возрастающим x (плавно) — верх и низ рукоятей
  function prof(pts) {
    const segs = crSegs(pts);
    return function (x) {
      let s = segs[0];
      for (let i = 0; i < segs.length; i++) { s = segs[i]; if (x <= segs[i][3][0]) break; }
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (bz(s, m)[0] < x) lo = m; else hi = m; }
      return bz(s, (lo + hi) / 2)[1];
    };
  }
  // Тело между профилями верха и низа на участке x0..x1
  function body(top, bot, x0, x1) {
    const a = [], b = [];
    for (let x = x0; x < x1; x += 3) { a.push([x, top(x)]); b.push([x, bot(x)]); }
    a.push([x1, top(x1)]); b.push([x1, bot(x1)]);
    return band(a, b);
  }
  // Поясок между профилями (выступает на e) со скруглёнными углами r и чуть выпуклыми торцами
  function pill(top, bot, x0, x1, e, r) {
    const t0 = top(x0) - e, t1 = top(x1) - e, b0 = bot(x0) + e, b1 = bot(x1) + e;
    return Shape([x0 + r, t0]).L([x1 - r, t1]).Q([x1, t1], [x1, t1 + r]).Q([x1 + 1, (t1 + b1) / 2], [x1, b1 - r])
      .Q([x1, b1], [x1 - r, b1]).L([x0 + r, b0]).Q([x0, b0], [x0, b0 - r]).Q([x0 - 1, (t0 + b0) / 2], [x0, t0 + r])
      .Q([x0, t0], [x0 + r, t0]).Z();
  }
  // Штриховка многоугольника под углом ang° с шагом step и отступом ins от края (насечка)
  function hatch(poly, ang, step, ins) {
    const a = ang * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    let lo = 1e9, hi = -1e9, d = '';
    poly.forEach((p) => { const s = p[0] * nx + p[1] * ny; lo = Math.min(lo, s); hi = Math.max(hi, s); });
    for (let s = lo + step / 2; s < hi; s += step) {
      const ts = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const sp = p[0] * nx + p[1] * ny - s, sq = q[0] * nx + q[1] * ny - s;
        if ((sp < 0) !== (sq < 0)) {
          const k = sp / (sp - sq);
          ts.push((p[0] + (q[0] - p[0]) * k) * dx + (p[1] + (q[1] - p[1]) * k) * dy);
        }
      }
      ts.sort((u, v) => u - v);
      for (let i = 0; i + 1 < ts.length; i += 2) {
        const t0 = ts[i] + ins, t1 = ts[i + 1] - ins;
        if (t1 - t0 > 1.2) d += 'M' + pt([nx * s + dx * t0, ny * s + dy * t0]) + ' L' + pt([nx * s + dx * t1, ny * s + dy * t1]) + ' ';
      }
    }
    return d;
  }
  // Винт под звёздочку: головка + шлиц
  function screw(P, cx, cy, r) {
    P.push(['o', cx, cy, r]);
    const s = r * 0.55;
    P.push(['d', 'M' + pt([cx - s, cy]) + ' L' + pt([cx + s, cy]) + ' M' + pt([cx - s * 0.5, cy - s * 0.87]) + ' L' + pt([cx + s * 0.5, cy + s * 0.87]) +
      ' M' + pt([cx - s * 0.5, cy + s * 0.87]) + ' L' + pt([cx + s * 0.5, cy - s * 0.87]), 0.6]);
  }
  // Фаска отверстия: светлая дуга снизу справа, тёмная сверху слева
  function holeRim(P, cx, cy, r, w) {
    P.push(['h', line(arc(cx, cy, r + 0.9, r + 0.9, 10, 130)), w || 0.8]);
    P.push(['d', line(arc(cx, cy, r + 0.9, r + 0.9, 190, 310)), w || 0.8]);
  }

  // ---------- Штык-нож М9 ----------
  // Клинок 7″ с клип-скосом, пилой из 9 зубьев на обухе, прорезью-кусачками и долом; гарда с кольцом под ствол
  // и нижним упором; цилиндрическая рукоять с кольцевыми рёбрами; навершие с защёлкой крепления.
  GEO.m9 = (function () {
    const P = [];
    const top = prof([[40, 76.6], [80, 75.2], [120, 74.8], [160, 75.2], [204, 76.6]]);
    const bot = prof([[40, 119.4], [80, 120.8], [120, 121.2], [160, 120.8], [204, 119.4]]);

    // навершие: стальной колпак с проточками и фаской торца, сверху — защёлка крепления к винтовке
    P.push(['m', 'M52,73.4 L21,73.4 C14.5,73.4 10.8,77 10.2,83 L10.2,113 C10.8,119 14.5,122.6 21,122.6 L52,122.6 Z']);
    P.push(['d', 'M17,74.6 C15,82 15,114 17,121.4', 0.8], ['d', 'M46,74.4 L46,121.6 M41.5,74.4 L41.5,121.6', 0.7]);
    P.push(['h', 'M20,75.4 L50,75.4', 1.1], ['h', 'M12.2,84 L12.2,112', 0.8]);
    P.push(['l', 'M19,73.8 L19,70.6 Q19,68.6 21,68.6 L38,68.6 Q40,68.6 40.6,70.4 L41.6,73.8 Z']);
    P.push(['d', 'M22.5,69.6 L22.5,72.8 M25,69.6 L25,72.8 M27.5,69.6 L27.5,72.8 M30,69.6 L30,72.8', 0.6]);
    P.push(['o', 36.4, 71.3, 1.5]);

    // рукоять: полимерный цилиндр, 6 кольцевых рёбер с ромбической насечкой
    P.push(['k', body(top, bot, 48, 196)]);
    let knurl = '', hi = '', grooves = '';
    for (let i = 0; i < 6; i++) {
      const x0 = 58 + i * 22.4, x1 = x0 + 17.6;
      const rb = pill(top, bot, x0, x1, 1.5, 3.2);
      P.push(['k', rb.d]);
      knurl += hatch(rb.pl, 60, 3.4, 1.6) + hatch(rb.pl, -60, 3.4, 1.6);
      hi += 'M' + pt([x0 + 3, top(x0 + 3) + 2.4]) + ' L' + pt([x1 - 3, top(x1 - 3) + 2.4]) + ' ';
      if (i < 5) { const g = x1 + 2.4; grooves += 'M' + pt([g, top(g) + 1]) + ' L' + pt([g, bot(g) - 1]) + ' '; }
    }
    P.push(['d', knurl, 0.4], ['d', grooves, 1.3], ['h', hi, 1.1]);
    // обойма у гарды
    P.push(['m', 'M190,74 Q190,72.6 191.6,72.6 L204,72.6 L204,123.4 L191.6,123.4 Q190,123.4 190,122 Z']);
    P.push(['d', 'M196.6,73.4 L196.6,122.6', 0.8], ['h', 'M191,74.4 L203,74.4', 1]);

    // ----- клинок -----
    // обух: рикассо, пила (трапециевидные зубья), прямой участок до клипа
    function spineTo(s) {
      s.L([240, 70]);
      for (let i = 0; i < 9; i++) {
        const x = 240 + i * 11.6;
        s.L([x + 4, 70], [x + 6.2, 76.6]).Q([x + 7.8, 78.8], [x + 9.4, 76.6]).L([x + 11.6, 70]);
      }
      return s.L([366, 70]);
    }
    const clipPl = Shape([366, 70]).C([412, 78.3], [458, 86.7], [504, 95]).pl;
    const hole = slotPl(395, 86.6, 21, 8.4, 0.16);
    const blade = spineTo(Shape([206, 70])).C([412, 78.3], [458, 86.7], [504, 95])
      .C([484, 106.5], [452, 126], [398, 126]).L([206, 126]).Z();
    P.push(['p', blade.d + closed(hole)]);
    // плоскость над линией спуска (с прорезью)
    const flat = spineTo(Shape([206, 70])).P(cut(clipPl, 0, 0.9).slice(1))
      .C([452, 100.4], [420, 102.6], [380, 102.6]).L([206, 102.6]).Z();
    P.push(['p', flat.d + closed(hole)]);
    P.push(['h', 'M216,103.8 L380,103.8 C420,103.8 452,101.6 488,93.8', 0.8]);
    // дол
    P.push(['q', closed(slotPl(311, 87.4, 122, 7.4, 0))]);
    P.push(['h', 'M255,90.4 L367,90.4', 0.9], ['d', 'M255,84.4 L367,84.4', 0.7]);
    // подточка режущей кромки и скоса обуха
    const edgePl = Shape([232, 126]).L([398, 126]).C([452, 126], [484, 106.5], [504, 95]).pl;
    const ew = (t) => 9.4 * Math.min(1, t / 0.05) * (0.3 + 0.7 * Math.min(1, (1 - t) / 0.3));
    P.push(['l', strip(edgePl, ew, 1)]);
    P.push(['d', line(offs(edgePl, (t) => ew(t) + 0.3).slice(3, -2)), 0.6]);
    P.push(['l', strip(clipPl, (t) => 4.4 * Math.min(1, t / 0.12), -1)]);
    // заточенная нижняя кромка прорези-кусачек
    P.push(['l', strip(hole.slice(5, 17), 2.6, 1)]);
    // блики: вершины зубьев и обух
    let tops = '', hl = '';
    for (let i = 0; i < 9; i++) {
      const x = 240 + i * 11.6;
      tops += 'M' + r1(x + 0.6) + ',70.9 L' + r1(x + 3.4) + ',70.9 ';
      hl += 'M' + r1(x + 10.4) + ',76.2 L' + r1(x + 11.9) + ',71.6 ';      // освещённая грань впадины (внутри металла)
    }
    P.push(['h', tops + 'M207,71 L239,71 M345,71 L365,71', 1], ['h', hl, 0.7]);
    // клеймо на рикассо
    P.push(['d', circ(229.6, 99, 5.6) + circ(229.6, 99, 3.4), 0.6]);
    P.push(['d', 'M229.6,95.6 L229.6,102.4 M226.2,99 L233,99', 0.5]);

    // гарда: пластина, сверху кольцо под дульную часть, снизу упор с наклоном вперёд
    P.push(['m', 'M203,62.6 L215.4,62.6 L215.4,126.6 C216,135 217.4,143 219.6,149.4 Q220.6,153.4 216.8,153.8 L210.8,153.8 ' +
      'Q207.6,153.6 207,150.2 C205.2,142 203.6,134.4 203,126.6 Z']);
    P.push(['h', 'M204.2,64 L204.2,126 C204.6,134 206,141.6 207.8,148.4', 0.9], ['d', 'M208,151 L218.4,151', 0.6]);
    // прилив под кольцо
    P.push(['m', 'M201.4,69 L217,69 L215.6,59.4 Q209.2,55.8 202.8,59.4 Z']);
    P.push(['d', 'M202,66.4 L216.4,66.4', 0.6]);
    const RX = 209.2, RY = 41.4;
    P.push(['m', ell(RX, RY, 17, 21) + ell(RX, RY, 10.2, 14.2)]);
    P.push(['m', ell(RX, RY, 10.2, 14.2) + ell(RX + 2, RY + 1, 7.6, 12)]);        // внутренняя стенка кольца
    P.push(['h', line(arc(RX, RY, 15.6, 19.6, 192, 262)), 1.2]);
    P.push(['d', line(arc(RX, RY, 13.6, 17.6, 20, 120)), 0.7]);
    engrave(P, [[240, 99.6, 'CL ARMS · M9', 5]]);
    return P;
  })();

  // ---------- Ястребиный клюв ----------
  // Складной нож: серповидный клинок (выпуклый обух, вогнутая кромка) с тремя отверстиями и джимпингом,
  // рамка-лайнеры с болстером и осью, накладки на штифтах с медальоном, кольцо под мизинец на торце.
  GEO.talon = (function () {
    const P = [];
    const RC = [42, 133], RO = 29.5, RI = 17.2;      // кольцо
    const PV = [225, 62];                             // ось клинка
    // ----- клинок -----
    // обух — дуга окружности (поворот на 60° от основания к острию), кромка — та же дуга, сдвинутая внутрь
    const SPINE = [[228, 39], [257.8, 34.3], [287.9, 32.7], [318, 34.3], [347.8, 39], [376.9, 46.8], [405, 57.6], [431.9, 71.3],
      [457.2, 87.7], [480.6, 106.7], [501.9, 128]];
    const EDGE = [[250, 91.2], [263.5, 89], [287.9, 86.7], [312.5, 86], [337.6, 86.9], [363, 89.6], [388.7, 94.1], [414.9, 100.7],
      [441.9, 108.7], [470.6, 117.8], [501.9, 128]];
    const spinePl = spl(SPINE);
    const spineJ = jimp(spinePl, tAtX(spinePl, 240), tAtX(spinePl, 268), 7, 2.4, -1);
    const edgePl = spl(EDGE);
    const HL = [[277.4, 46.2, 5.8], [294.4, 44.8, 4.8], [310.2, 44.6, 4.8]];
    const holes = HL.map((h) => circ(h[0], h[1], h[2])).join('');
    const blade = Shape([222, 52]).P(spineJ).P(edgePl.slice().reverse().slice(1)).L([240, 90], [224, 80]).Z();
    P.push(['p', blade.d + holes]);
    // плоскость над спуском
    const GRIND = [[501.9, 128], [476.1, 111.7], [450.3, 97.2], [424.2, 84.5], [397.7, 74], [370.6, 66.1], [343.2, 60.6], [315.5, 57.6],
      [287.9, 57], [260.4, 58.9], [250, 61]];
    const flat = Shape([222, 52]).P(spineJ).S(GRIND.slice(1)).L([224, 70]).Z();
    P.push(['p', flat.d + holes]);
    P.push(['h', line(offs(spl(GRIND.slice().reverse()), -1).slice(4, -4)), 0.8]);
    // подточка вогнутой кромки и ложное лезвие у острия
    const ew = (t) => 10 * Math.min(1, t / 0.06) * (0.3 + 0.7 * Math.min(1, (1 - t) / 0.3));
    P.push(['l', strip(edgePl, ew, 1)]);
    P.push(['d', line(offs(edgePl, (t) => ew(t) + 0.3).slice(3, -12)), 0.6]);
    const sw = cut(spinePl, 0.66, 1);
    P.push(['l', strip(sw, (t) => 4.4 * Math.min(1, t / 0.2), -1)]);
    P.push(['h', line(offs(cut(spinePl, 0.2, 0.66), -1.2)), 1.1]);
    HL.forEach((h) => holeRim(P, h[0], h[1], h[2]));

    // ----- рукоять: рамка-лайнеры с болстером и кольцом -----
    const BACK = [[237, 36.8], [208, 41.4], [172, 51.4], [136, 65], [104, 80], [78, 95.6]];
    const ringA = arc(RC[0], RC[1], RO, RO, -62, -348);
    const BELLY = [[96, 141.2], [122, 121.3], [148, 121.4], [176, 100.8], [208, 102.6], [229, 96.5], [244, 90.5]];
    const FRONT = [[251.5, 78], [253, 62], [249, 47], [242, 39.6], [237, 36.8]];
    const backPl = spl(BACK.concat([ringA[0]]));
    const frame = Shape(BACK[0]).P(backPl.slice(1)).P(ringA.slice(1)).S(BELLY).S(FRONT).Z();
    P.push(['m', frame.d + circ(RC[0], RC[1], RI)]);
    P.push(['h', line(offs(cut(backPl, 0.04, 0.93), 1.3)), 1.1]);
    // накладка
    const SCALE = [[205, 46.4], [172.6, 56], [137.6, 69.3], [106, 84], [89.6, 94.6], [81, 106], [81.2, 120.4], [88, 132], [97, 136.9],
      [121.4, 117], [147.6, 117.1], [176, 96.5], [206, 98.3], [220.5, 92.8], [209, 82.5], [201, 64]];
    const sc = Shape(SCALE[0]).S(SCALE.slice(1).concat([SCALE[0]]), SCALE[SCALE.length - 1], SCALE[1]).Z();
    P.push(['q', sc.d]);
    P.push(['d', closed(offs(sc.pl, 2.8).slice(1, -1)), 0.6]);
    P.push(['d', 'M157.5,63 C160.4,76 162,90 164.8,104.2', 0.9]);
    // штифты и медальон
    [[188, 58], [178, 89], [112, 101], [100, 124]].forEach((p) => P.push(['o', p[0], p[1], 2.1]));
    P.push(['d', circ(140.5, 92.5, 5.8), 0.7], ['o', 140.5, 92.5, 4.3], ['d', circ(140.5, 92.5, 2.4), 0.5]);
    // ось с шайбой и упорный штифт
    P.push(['l', circ(PV[0], PV[1], 9.6) + circ(PV[0], PV[1], 6.2)]);
    screw(P, PV[0], PV[1], 5.8);
    P.push(['o', 240, 46, 2.2]);
    screw(P, 72.4, 111.4, 2.4);
    screw(P, 237, 83.6, 2.3);
    // кольцо: фаски
    P.push(['h', line(arc(RC[0], RC[1], RO - 1.4, RO - 1.4, 195, 255)), 1.2]);
    holeRim(P, RC[0], RC[1], RI, 0.9);
    engrave(P, [[318, 54, 'HWK-4 · N690', 5.4]]);
    return P;
  })();

  // ---------- Скелетный нож ----------
  // Цельная стальная рама: копьевидный клинок с длинным ложным лезвием и тремя отверстиями, гарда-шпоры,
  // кольцо под указательный палец, хвостовик с прорезью под темляк; рукоять оплетена паракордом.
  GEO.skel = (function () {
    const P = [];
    const HC = [222, 96], HR = 13.4, HO = 23.2;
    const ringT = arc(HC[0], HC[1], HO, HO, -146, -58), ringB = arc(HC[0], HC[1], HO, HO, 58, 146);
    const swPl = Shape([360, 78.4]).C([408, 84.2], [456, 89.8], [504, 95.4]).pl;
    // рама: хвостовик → верх рукояти → кольцо → шпора → обух → ложное лезвие → остриё → кромка → шпора → кольцо → низ
    const fr = Shape([12.4, 93.6]).S([[22, 90.2], [40, 86.6], [64, 83]]).L([ringT[0][0], 83]).P(ringT.slice(1))
      .L([237.6, 75.6]).C([239.4, 70], [242, 64.6], [249, 60.4]).C([250.6, 65.4], [251.6, 72], [252.4, 78.4]).L([360, 78.4]).P(swPl.slice(1))
      .C([482, 106.6], [444, 113.6], [392, 113.6]).L([252.4, 113.6]).C([251.6, 120.2], [250.6, 127], [249, 132]).C([242, 127.8], [239.4, 122.4], [237.6, 116.8])
      .P(ringB).L([64, 109]).S([[40, 107.4], [22, 103.8], [12.4, 100.4]]).Q([8.6, 97], [12.4, 93.6]).Z();
    const holes = circ(HC[0], HC[1], HR) + circ(263, 93, 3.6) + circ(276.4, 93, 3.2) + circ(289.2, 93, 2.8) + closed(slotPl(31, 97, 17, 6.6, 0));
    P.push(['p', fr.d + holes]);
    // плоскость клинка над спуском (с рикассо у гарды)
    const flat = Shape([252.4, 78.4]).L([360, 78.4]).P(cut(swPl, 0, 0.92).slice(1))
      .C([440, 97.6], [400, 98.6], [360, 98.6]).L([266, 98.6]).Q([257.4, 99], [257.4, 113.6]).L([252.4, 113.6]).Z();
    P.push(['p', flat.d + circ(263, 93, 3.6) + circ(276.4, 93, 3.2) + circ(289.2, 93, 2.8)]);
    const edgePl = Shape([258, 113.6]).L([392, 113.6]).C([444, 113.6], [482, 106.6], [504, 95.4]).pl;
    const ew = (t) => 5.4 * Math.min(1, t / 0.04) * (0.4 + 0.6 * Math.min(1, (1 - t) / 0.25));
    P.push(['l', strip(edgePl, ew, 1)]);
    P.push(['d', line(offs(edgePl, (t) => ew(t) + 0.3).slice(3, -2)), 0.6]);
    P.push(['l', strip(swPl, (t) => 4.2 * Math.min(1, t / 0.15), -1)]);
    P.push(['h', 'M254,79.4 L359,79.4', 1.1], ['d', 'M252.6,80 L252.6,112.2', 0.7]);
    holeRim(P, 263, 93, 3.6, 0.6); holeRim(P, 276.4, 93, 3.2, 0.6); holeRim(P, 289.2, 93, 2.8, 0.6);
    P.push(['h', 'M267,99.8 L360,99.8 C400,99.8 440,98.8 494,95.6', 0.8]);
    holeRim(P, HC[0], HC[1], HR, 1);
    P.push(['h', line(arc(HC[0], HC[1], HO - 1.3, HO - 1.3, 200, 265)), 1.1]);

    // оплётка паракордом: основа, 9 наклонных витков, узлы-обмотки по краям
    const wt = prof([[60, 78.6], [130, 77.4], [204, 76.2]]), wb = prof([[60, 113.4], [130, 114.6], [204, 115.8]]);
    P.push(['k', pill(wt, wb, 66, 200, 0, 4).d]);
    let hl = '';
    // виток: наклонный брусок со скруглёнными углами (r) — прямые длинные стороны, круглые торцы шнура
    const rq = (pts, r) => {
      const n = pts.length, k = (i) => pts[(i + n) % n];
      const near = (p, q) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, f = Math.min(0.5, r / l); return lerp(p, q, f); };
      const s = Shape(near(k(0), k(1)));
      for (let i = 1; i <= n; i++) s.L(near(k(i), k(i - 1))).Q(k(i), near(k(i), k(i + 1)));
      return s.Z();
    };
    for (let i = 0; i < 9; i++) {
      const x = 75 + i * 13.3, w = 12.2, sl = -4.4;
      const a = [x, wt(x) - 0.9], b = [x + w, wt(x + w) - 0.9], c = [x + w + sl, wb(x + w + sl) + 0.9], d = [x + sl, wb(x + sl) + 0.9];
      P.push(['k', rq([a, b, c, d], 4.2).d]);
      const u = lerp(lerp(a, b, 0.32), lerp(d, c, 0.32), 0.16), v = lerp(lerp(a, b, 0.32), lerp(d, c, 0.32), 0.84);
      hl += line([u, v]);
    }
    P.push(['h', hl, 1]);
    P.push(['k', pill(wt, wb, 62, 71, 1.2, 3).d], ['k', pill(wt, wb, 193, 203, 1.2, 3).d]);
    P.push(['h', 'M64.4,' + r1(wt(64) + 1.4) + ' L68.6,' + r1(wt(68) + 1.4) + ' M195.4,' + r1(wt(195) + 1.4) + ' L200.6,' + r1(wt(200) + 1.4), 0.9]);
    // хвостовик: блик и фаска прорези
    P.push(['h', 'M15,94.2 C24,91 40,88.6 60,85.4', 1]);
    const ly = slotPl(31, 97, 17, 6.6, 0);
    P.push(['h', line(offs(ly.slice(5, 17), 0.9)), 0.7], ['d', line(offs(ly.slice(16).concat(ly.slice(0, 6)), 0.9)), 0.7]);
    engrave(P, [[298, 96.4, 'SKL-7 · D2', 5]]);
    return P;
  })();
})();
