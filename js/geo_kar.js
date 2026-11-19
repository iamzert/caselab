'use strict';

// Керамбит (kar) — главный нож игры. Формат — см. art_geo.js.
// Силуэт снят с фото настоящего керамбита (зеркально, поворот −30°): кольцо слева внизу,
// рукоять поднимается вправо к гарде, клинок-коготь уходит дугой вниз, остриё смотрит вниз.
(function () {
  const { engrave } = GEOH;

  // ---------- Помощники: кубические кривые c = [x0,y0, x1,y1, x2,y2, x3,y3] ----------
  const f1 = (v) => Math.round(v * 10) / 10;
  const pt = (p) => f1(p[0]) + ',' + f1(p[1]);
  function bez(c, t) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
    return [a * c[0] + b * c[2] + d * c[4] + e * c[6], a * c[1] + b * c[3] + d * c[5] + e * c[7]];
  }
  // Единичная касательная
  function tan(c, t) {
    const u = 1 - t;
    const x = 3 * u * u * (c[2] - c[0]) + 6 * u * t * (c[4] - c[2]) + 3 * t * t * (c[6] - c[4]);
    const y = 3 * u * u * (c[3] - c[1]) + 6 * u * t * (c[5] - c[3]) + 3 * t * t * (c[7] - c[5]);
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  }
  // Нормаль — касательная, повёрнутая на +90° (по ходу слева направо смотрит вниз)
  const nrm = (c, t) => { const k = tan(c, t); return [-k[1], k[0]]; };
  // Часть кривой между t0 и t1 (де Кастельжо)
  function split(q, t) {
    const L = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const p0 = [q[0], q[1]], p1 = [q[2], q[3]], p2 = [q[4], q[5]], p3 = [q[6], q[7]];
    const a = L(p0, p1), b = L(p1, p2), e = L(p2, p3), d = L(a, b), g = L(b, e), m = L(d, g);
    return [[p0[0], p0[1], a[0], a[1], d[0], d[1], m[0], m[1]], [m[0], m[1], g[0], g[1], e[0], e[1], p3[0], p3[1]]];
  }
  function sub(c, t0, t1) {
    if (t1 >= 1) return t0 <= 0 ? c : split(c, t0)[1];
    const l = split(c, t1)[0];
    return t0 <= 0 ? l : split(l, t0 / t1)[1];
  }
  const rev = (c) => [c[6], c[7], c[4], c[5], c[2], c[3], c[0], c[1]];
  const C = (c) => ' C' + pt([c[2], c[3]]) + ' ' + pt([c[4], c[5]]) + ' ' + pt([c[6], c[7]]);
  const M = (c) => 'M' + pt([c[0], c[1]]);
  // t, при котором монотонная по x кривая проходит через x
  function tx(c, x) {
    let a = 0, b = 1;
    const inc = c[6] > c[0];
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if ((bez(c, m)[0] < x) === inc) a = m; else b = m; }
    return (a + b) / 2;
  }
  // Смещённая кривая (по нормалям концов): ширина w0 в начале, w1 в конце
  function offs(c, w0, w1) {
    const n0 = nrm(c, 0), n1 = nrm(c, 1), wa = w0 + (w1 - w0) / 3, wb = w0 + (w1 - w0) * 2 / 3;
    return [c[0] + n0[0] * w0, c[1] + n0[1] * w0, c[2] + n0[0] * wa, c[3] + n0[1] * wa,
      c[4] + n1[0] * wb, c[5] + n1[1] * wb, c[6] + n1[0] * w1, c[7] + n1[1] * w1];
  }
  // Ход вдоль кривой от ta до tb с U-образными вырезами (джимпинг) с центрами в xs
  function teeth(c, ta, tb, xs, w, depth) {
    let d = '', t = ta;
    xs.forEach((x) => {
      const t1 = tx(c, x - w / 2), t2 = tx(c, x + w / 2), tm = tx(c, x);
      const a = bez(c, t1), b = bez(c, t2), m = bez(c, tm), na = nrm(c, t1), nb = nrm(c, t2), nm = nrm(c, tm);
      const k = depth + w * 0.6;
      d += C(sub(c, t, t1)) + ' L' + pt([a[0] + na[0] * depth, a[1] + na[1] * depth]) +
        ' Q' + pt([m[0] + nm[0] * k, m[1] + nm[1] * k]) + ' ' + pt([b[0] + nb[0] * depth, b[1] + nb[1] * depth]) + ' L' + pt(b);
      t = t2;
    });
    return d + C(sub(c, t, tb));
  }
  // Короткие штрихи-насечки по нормали от кривой (продолжение зубьев на боковину)
  function slots(c, xs, from, to) {
    return xs.map((x) => {
      const t = tx(c, x), p = bez(c, t), n = nrm(c, t);
      return 'M' + pt([p[0] + n[0] * from, p[1] + n[1] * from]) + ' L' + pt([p[0] + n[0] * to, p[1] + n[1] * to]);
    }).join(' ');
  }
  // Контур из сегментов ['C', x1,y1, x2,y2, x,y] / ['L', x,y]: путь и точки (для штриховки)
  function shape(start, segs) {
    let d = 'M' + pt(start), cur = start;
    const pts = [start];
    segs.forEach((s) => {
      if (s[0] === 'L') { cur = [s[1], s[2]]; d += ' L' + pt(cur); pts.push(cur); return; }
      const c = [cur[0], cur[1], s[1], s[2], s[3], s[4], s[5], s[6]];
      d += C(c);
      for (let i = 1; i <= 12; i++) pts.push(bez(c, i / 12));
      cur = [s[5], s[6]];
    });
    return { d: d + ' Z', pts: pts };
  }
  // Штриховка многоугольника линиями под углом ang° с шагом step, с отступом ins от края
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
  // Дуги и окружности кубическими кривыми, без команды A: рамка детали (weaponBox) для A в art.js
  // считается как «конец ± радиус» и раздувает картинку. Углы в градусах, рост угла — по часовой на экране.
  const onC = (cx, cy, r, a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  function arcC(cx, cy, r, a0, a1) {
    // разрезы на кратных 90° — опорные точки не выходят за габарит окружности
    const s = a1 > a0 ? 1 : -1, cuts = [a0];
    for (let q = (s > 0 ? Math.floor(a0 / 90) + 1 : Math.ceil(a0 / 90) - 1) * 90; s * (a1 - q) > 0.5; q += 90 * s) cuts.push(q);
    cuts.push(a1);
    let d = '';
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i] * Math.PI / 180, b = cuts[i + 1] * Math.PI / 180, k = 4 / 3 * Math.tan((b - a) / 4) * r;
      d += ' C' + pt([cx + r * Math.cos(a) - k * Math.sin(a), cy + r * Math.sin(a) + k * Math.cos(a)]) +
        ' ' + pt([cx + r * Math.cos(b) + k * Math.sin(b), cy + r * Math.sin(b) - k * Math.cos(b)]) +
        ' ' + pt([cx + r * Math.cos(b), cy + r * Math.sin(b)]);
    }
    return d;
  }
  const arc = (cx, cy, r, a0, a1) => 'M' + pt(onC(cx, cy, r, a0)) + arcC(cx, cy, r, a0, a1);
  const circ = (cx, cy, r) => arc(cx, cy, r, 0, 360) + ' Z ';

  // ---------- Опорные кривые (сняты с фото и сглажены) ----------
  const RX = 65, RY = 140.4, R = 45.3, RIN = 31.3, REND = 44.6;   // кольцо и вырез торца рукояти под него
  const TOP = [41, 91, 91, 55.9, 147.9, 30, 208, 17.8];            // спинка рукояти (огибающая зубьев у кольца)
  const THUMB = [208, 17.8, 228.1, 20.5, 248.5, 18.1, 268, 13];    // площадка под большой палец с насечкой
  const SPINE = [296, 14.5, 392.5, 18.9, 478.1, 93.6, 498.5, 187.5]; // обух клинка до острия
  const EDGE1 = [498.5, 187.5, 475.1, 163.5, 462.4, 139.1, 430, 120]; // режущая кромка: от острия
  const EDGE2 = [430, 120, 385.7, 93.8, 339.5, 88.8, 290, 102.8];      // … к гарде
  // Подпальцевые выемки (по ходу справа налево): указательный, средний, безымянный
  const IDX_R = [272.5, 115.5, 264.4, 115.5, 258.3, 74.5, 232, 74.5];
  const IDX_L = [232, 74.5, 208.3, 74.5, 206.9, 97, 202, 97];
  const MID_R = [202, 97, 196.8, 97, 196.1, 93.5, 188, 93.5];
  const MID_L = [188, 93.5, 159.2, 93.5, 158, 118.1, 151, 118.1];
  const PNK_R = [151, 118.1, 148, 118.1, 142, 115.5, 138, 115.5];
  const PNK_L = [138, 115.5, 117.5, 115.5, 117.8, 131.6, 109.3, 135.5];
  const SEAM = [268, 13, 276, 19, 282, 32, 282, 50];                // шов между рукоятью и передним больстером
  const SEAM2 = [282, 50, 282, 70, 279, 96, 272.5, 115.5];
  const RING_TEETH = [56.5, 66.8, 78, 89, 99.8];
  const THUMB_TEETH = [];
  for (let i = 0; i < 11; i++) THUMB_TEETH.push(211 + i * 5.3);

  // Передний больстер: горб над обухом, торец с круглым приливом, нижний упор-гарда
  const FRONT = ' C274,9 282,5.8 288,5.6 C292.5,5.5 295.5,8 296.5,14.5 C297.5,22 298.5,31 300.1,38.7' +
    arcC(305.5, 46.5, 9.5, -124.7, 124.7) + ' C298.8,65 297.5,85 296,99 C292,101.5 288.5,104 286.5,108.5 C284.5,113 278.5,115.5 272.5,115.5';

  // ---------- Кольцо со шпорой ----------
  const sp1 = onC(RX, RY, R, 178), sp2 = onC(RX, RY, R, 147);
  const RING = 'M' + pt(sp1) + arcC(RX, RY, R, 178, 507) + ' Q20,160.5 12.5,157 Q18.5,151 ' + pt(sp1) + ' Z ' + circ(RX, RY, RIN);

  // ---------- Клинок ----------
  const BLADE = 'M276,13.6 L296,14.5' + C(SPINE) + C(EDGE1) + C(EDGE2) + ' L276,104 Z';
  // Спуск (зона заточки) и полированная подводка кромки: смещения кромки внутрь клинка
  const G1 = offs(EDGE1, 0, 22), G2 = offs(EDGE2, 22, 28);
  const GRIND = M(EDGE1) + C(EDGE1) + C(EDGE2) + ' L276,104 L276,' + f1(G2[7]) + ' L' + pt([G2[6], G2[7]]) + C(rev(G2)) + C(rev(G1)) + ' Z';
  const E1 = offs(EDGE1, 0, 6), E2 = offs(EDGE2, 6, 4.2);
  const BEVEL = M(EDGE1) + C(EDGE1) + C(EDGE2) + ' L276,104.2 L276,' + f1(E2[7]) + ' L' + pt([E2[6], E2[7]]) + C(rev(E2)) + C(rev(E1)) + ' Z';
  const SPH = sub(offs(SPINE, 2.2, 1.6), 0.02, 0.86);              // блик вдоль обуха

  // ---------- Рукоять ----------
  const s0 = onC(RX, RY, REND, 236);
  // Чаши выемок: отдельные детали ПОД корпусом рукояти; корпус огибает их верхние кромки,
  // поэтому тень и фаска корпуса ложатся в чашу — выемка выглядит вогнутой.
  // [кривая справа, t конца, кривая слева, t начала, кромка: две кубические слева направо]
  const DISH = [
    [IDX_R, 0.07, IDX_L, 0.85, [205, 72, 220, 60.5, 234, 61], [250, 61.5, 259, 84]],
    [MID_R, 0.3, MID_L, 0.9, [153, 96, 165, 83, 178, 82], [189, 81, 196, 86]],
    [PNK_R, 0.35, PNK_L, 0.93, [112.5, 116, 124, 104.5, 134, 104], [141, 103.7, 146, 108]],
  ].map((g) => {
    const a = sub(g[0], 0, g[1]), b = sub(g[2], g[3], 1);           // контур у правого и левого концов
    const L = [b[0], b[1]], Rr = [a[6], a[7]];                       // левый и правый концы кромки
    const k1 = [L[0], L[1]].concat(g[4]), k2 = [g[4][4], g[4][5]].concat(g[5], Rr);
    const inner = sub(g[0], g[1], 1), inner2 = sub(g[2], 0, g[3]);   // дно выемки между концами
    const u1 = offs(k1, 0, -2.6), u2 = offs(k2, -2.6, 0);            // кромка, приподнятая под корпус
    return {
      rim: C(rev(k2)) + C(rev(k1)),                                  // для корпуса: справа налево
      a: a, b: b,
      d: M(inner) + C(inner) + C(inner2) + C(u1) + C(u2) + ' Z',
      // складка под кромкой: верхняя стенка чаши в тени
      crease: (function () { const c1 = offs(k1, 0.6, 2.4), c2 = offs(k2, 2.4, 0.6); return M(c1) + C(c1) + C(c2); })(),
    };
  });
  const HANDLE = 'M' + pt(s0) + ' L40.2,95.5 Q40.3,92 41,91' + teeth(TOP, 0, 1, RING_TEETH, 3.6, 4.6) +
    teeth(THUMB, 0, 1, THUMB_TEETH, 2.3, 2.5) + FRONT +
    C(DISH[0].a) + DISH[0].rim + C(DISH[0].b) + C(DISH[1].a) + DISH[1].rim + C(DISH[1].b) + C(DISH[2].a) + DISH[2].rim + C(DISH[2].b) +
    arcC(RX, RY, REND, 360 + Math.atan2(135.5 - RY, 109.3 - RX) * 180 / Math.PI, 236) + ' Z';
  const BOLSTER = 'M268,13' + FRONT + C(rev(SEAM2)) + C(rev(SEAM)) + ' Z';
  // Вставка с ромбической насечкой (сапожок над средней и безымянной выемками)
  const ptop = offs(TOP, 9.5, 13.5), pa = tx(ptop, 106), pb = tx(ptop, 207);
  const ptopS = sub(ptop, pa, pb);
  const CHK = shape([ptopS[0], ptopS[1]], [['C', ptopS[2], ptopS[3], ptopS[4], ptopS[5], ptopS[6], ptopS[7]],
    ['C', 212, 33, 217, 40, 221, 46.5], ['C', 205, 45.5, 180, 52, 160, 62], ['C', 147, 68.5, 142, 80, 132, 84.5],
    ['C', 122, 88, 108, 85, 104, 79], ['C', 100.5, 73.5, 101, 65, ptopS[0], ptopS[1]]]);
  // Рифлёная вставка у гарды
  const RIB = shape([224, 37.5], [['C', 240, 34.5, 262, 29.8, 276, 27.5], ['C', 278.2, 36, 278.6, 46, 278.5, 54],
    ['C', 278.4, 70, 276.5, 85, 272.5, 96], ['C', 270, 98.5, 266.5, 98.5, 265, 96], ['C', 252, 80, 234, 54, 224, 37.5]]);
  // Блики: верхняя кромка спинки, нижние кромки выемок (смещение внутрь на 1.6)
  const TOPH = sub(offs(TOP, 1.6, 1.6), tx(TOP, 104), 1);
  const rimH = (a, b) => { const p = offs(a, 1.6, 1.6), q = offs(b, 1.6, 1.6); return M(p) + C(p) + C(q); };
  let ribs = '', ribh = '';
  for (let i = 0; i < 12; i++) {
    const k = (i + 0.6) / 12.4;
    const l = [224 + (265 - 224) * k, 37.5 + (96 - 37.5) * k], r = [277.5 - 2 * k * k, 28.5 + (96 - 28.5) * k];
    ribs += 'M' + pt([l[0] + 2, l[1]]) + ' L' + pt([r[0] - 2, r[1]]) + ' ';
    ribh += 'M' + pt([l[0] + 2.4, l[1] + 1.3]) + ' L' + pt([r[0] - 2, r[1] + 1.3]) + ' ';
  }

  GEO.kar = [
    // кольцо (одно целое с клинком — окрашено)
    ['p', RING],
    ['d', circ(RX, RY, 38.6), 0.8],
    ['h', arc(RX, RY, 43.6, 150, 236), 1.2],
    ['h', arc(RX, RY, 33.9, 25, 155), 1.1],
    ['d', arc(RX, RY, 33.9, 205, 335), 1],
    // клинок: полотно, спуск, подводка кромки
    ['p', BLADE],
    ['p', GRIND],
    ['l', BEVEL],
    ['h', M(SPH) + C(SPH), 1.4],
    // рукоять: чаши выемок под корпусом, затем корпус
    ['k', DISH[0].d], ['k', DISH[1].d], ['k', DISH[2].d],
    ['k', HANDLE],
    ['k', CHK.d],
    ['d', hatch(CHK.pts, 35, 3.1, 0.9) + hatch(CHK.pts, -70, 3.1, 0.9), 0.6],
    ['k', RIB.d],
    ['d', ribs, 1.1],
    ['h', ribh, 0.6],
    ['k', BOLSTER],
    // джимпинг на спинке
    ['d', slots(TOP, RING_TEETH, 4.4, 8.5), 1],
    ['d', slots(THUMB, THUMB_TEETH, 2.4, 6.2), 0.8],
    ['h', M(TOPH) + C(TOPH), 1.1],
    // блики больстера: горб и торец у клинка
    ['h', 'M270,12.4 C276,8.6 282,6.9 288,6.9 C291.5,6.9 293.8,8.6 294.8,12.5', 1.1],
    ['h', 'M297.2,17 C298,25 298.8,31 299.6,36.5 M299.4,57 C298.4,68 297.6,82 296.6,95', 0.8],
    // выемки под пальцы: складка в тени под кромкой чаши и блик по нижней кромке
    ['d', DISH[0].crease + ' ' + DISH[1].crease + ' ' + DISH[2].crease, 3.2],
    ['h', rimH(IDX_R, IDX_L) + ' ' + rimH(MID_R, MID_L) + ' ' + rimH(PNK_R, PNK_L), 0.8],
    // винты: на приливе больстера и у кольца (шлиц крестом)
    ['d', circ(305.5, 46.5, 6.2), 0.8],
    ['o', 305.5, 46.5, 3.3],
    ['o', 86, 86, 3.1],
    ['d', 'M303.6,45.4 L307.4,47.6 M304.4,48.4 L306.6,44.6 M84.2,85 L87.8,87 M85,87.8 L87,84.2', 0.6],
  ];
  // клеймо на клинке (вымышленное)
  engrave(GEO.kar, [[322, 33.5, 'CL ARMS', 6.4], [322.5, 41.5, 'KRB-7  440C', 4.8]]);
})();
