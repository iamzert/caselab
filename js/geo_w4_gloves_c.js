'use strict';

// Перчатки на общей основе кисти HAND (js/geo_hand.js): glsh «Штурмовые» и glwr «Обмотки».
// Загружается после js/geo_gloves*.js и js/geo_hand.js: GEO.<id> здесь заменяет прежнюю модель.
// Анатомия, поза и раскладка пары (HAND.PAIR) — из HAND; здесь только характерные детали вида, крупно и без ряби.
// Окрашиваемые детали без «!» — скин (на каменном скине — крашеная кожа в тон камня), с { gem: 1 } — сам камень.
(function () {
  if (typeof HAND === 'undefined') return;
  const H = HAND.HINT;
  const f1 = (v) => Math.round(v * 10) / 10;
  const pt = (p) => f1(p[0]) + ',' + f1(p[1]);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

  // ---------- Кривые в координатах модели (как в HAND, но точки уже переведены) ----------
  function cr(pts) {
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += ' C' + pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + ' ' +
        pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + pt(p2);
    }
    return d;
  }
  function shape(runs) {
    let d = 'M' + pt(runs[0][0]);
    runs.forEach((r) => { d += cr(r); });
    return d + ' Z';
  }
  function loop(pts) {
    const n = pts.length;
    let d = 'M' + pt(pts[0]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += ' C' + pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + ' ' +
        pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + pt(p2);
    }
    return d + ' Z';
  }

  // =====================================================================================
  // glsh «Штурмовые» — плотная кожаная перчатка с целыми пальцами: жёсткая накладка на тыльной стороне
  // с камнем-эмблемой посередине, твёрдые подушки на основных фалангах (рельефом, в цвет кожи), манжета с ремешком на кнопке.
  // Скин: корпус, пальцы, манжета. Свой материал (тёмная кожа): накладка и ремешок. Камень: эмблема.
  // =====================================================================================
  function assault() {
    const h = HAND.make({ cuffLen: 34, cuffW: 66, flare: 2, puff: 1.06 });
    const U = h.pt, P = [];
    const fingers = ['pinky', 'ring', 'middle', 'index'];
    P.push(['q', h.webs(), 'leather', H.web]);
    P.push(['p', h.thumb(), 'leather', H.finger]);
    fingers.forEach((n) => P.push(['p', h.finger(n), 'leather', H.finger]));
    // твёрдые подушки на основных фалангах (поверх пальца, край прячется под тыльной стороной)
    const pad = { pr: 'round', r: 3.5, h: 0.6 };
    fingers.forEach((n) => P.push(['p', h.band(n, 0.04, 0.38, 0.8), 'leather', pad]));
    // складки в средних суставах — едва заметные
    fingers.forEach((n) => P.push(['d', h.joint(n, 2), 0.6]));
    P.push(['p', h.back(), 'leather', H.leather]);
    // большой палец поверх края ладони, подушка на основной фаланге
    P.push(['p', h.thumbOver(), 'leather', H.finger]);
    P.push(['d', h.thumbFold(), 0.9]);
    P.push(['p', h.band('thumb', 0.42, 0.68, 0.78), 'leather', pad]);
    // жёсткая накладка-щит: верх по линии костяшек, к запястью сходится клином
    P.push(['p', shape([[U(74, 28), U(79.5, 9), U(77.5, -9), U(69, -26)], [U(69, -26), U(46, -26), U(19, 1)], [U(19, 1), U(47, 30), U(74, 28)]]),
      'darkleather!', { pr: 'slab', r: 3.5 }]);
        // эмблема — шестигранник-камень в середине накладки
    const C = [51, 1.5], hex = [];
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; hex.push(U(C[0] + Math.cos(a) * 17.5, C[1] + Math.sin(a) * 17)); }
    P.push(['p', shape(hex.map((p, i) => [p, mix(p, hex[(i + 1) % 6], 0.5), hex[(i + 1) % 6]])), 'gun', { pr: 'round', r: 4.5, gem: 1 }]);
    // манжета, поверх — ремешок с кнопкой
    P.push(['k', h.cuffHole()]);
    P.push(['p', h.cuff(), 'leather', H.cuff]);
    P.push(['e', h.cuffLine()]);
    P.push(['p', h.cuff(4, -16), 'darkleather!', { pr: 'round', r: 3 }]);
    P.push(['p', loop([U(3, -30), U(-15, -30), U(-15, -37), U(-6, -40), U(3, -37)]), 'darkleather!', { pr: 'round', r: 3 }]);
    const sn = U(-6, -34.5);
    P.push(['o', sn[0], sn[1], 3.2]);
    return P;
  }

  // =====================================================================================
  // glwr «Обмотки» — плоский бинт широкими витками: витки на запястье (слегка по диагонали), крест по тыльной
  // стороне, широкий виток через костяшки и виток у основания большого пальца; пальцы открыты (голая рука).
  // Концы витков срезаны по силуэту кисти — бинт огибает руку, а не торчит за край.
  // Скин: бинт. Свой материал: открытые пальцы и кожа в просветах. Камень: вставка-медальон на перекрестье бинта.
  // =====================================================================================
  // Виток поперёк кисти: кромки идут от стороны мизинца (v = vP) к стороне большого пальца (v = vT);
  // a0, a1 — u кромок у мизинца, b0, b1 — у большого пальца; bow — выгиб к пальцам; концы — по краю кисти
  function strip(U, a0, a1, b0, b1, vP, vT, bow) {
    const N = 4, e1 = [], e2 = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, v = lerp(vP, vT, t), bw = (bow || 0) * Math.sin(Math.PI * t);
      e1.push(U(lerp(a0, b0, t) + bw, v)); e2.push(U(lerp(a1, b1, t) + bw, v));
    }
    return shape([e1, [e1[N], e2[N]], e2.slice().reverse(), [e2[0], e1[0]]]);
  }
  function wraps() {
    const h = HAND.make({ cuffLen: 30, cuffW: 58, flare: 0, puff: 0.98 });
    const U = h.pt, P = [], W = { pr: 'flat' };
    const SKIN = 'tanleather!';                       // голая рука (до появления заводского материала кожи рук)
    const fingers = ['pinky', 'ring', 'middle', 'index'];
    // открытые пальцы
    P.push(['q', h.webs(), SKIN, H.web]);
    P.push(['p', h.thumb(), SKIN, H.finger]);
    fingers.forEach((n) => P.push(['p', h.finger(n), SKIN, H.finger]));
    fingers.forEach((n) => [1, 2].forEach((j) => P.push(['d', h.joint(n, j), 0.6])));
    // кисть и запястье под бинтом — кожа, видна в просветах между витками
    P.push(['p', h.back(), SKIN, H.leather]);
    P.push(['p', h.thumbOver(), SKIN, H.finger]);
    P.push(['d', h.thumbFold(), 0.8]);
    P.push(['d', h.joint('thumb', 2), 0.6]);
    // виток у основания большого пальца
    P.push(['p', h.band('thumb', 0.26, 0.5, 1), 'wrap', W]);
    // крест по тыльной стороне: два широких витка, между ними видна кожа
    P.push(['p', strip(U, 47, 66, -2, 17, -31, 30, 2), 'wrap', W]);
    P.push(['p', strip(U, -2, 17, 49, 68, -27.5, 34, 2), 'wrap', W]);
    // широкий виток через костяшки (по дуге оснований пальцев), концы — по краю кисти
    const top = [h.at('pinky', 0.15, -1), h.at('ring', 0.14, 0), h.at('middle', 0.14, 0), h.at('index', 0.15, 1)];
    const bot = [h.at('index', -0.13, 1), h.at('middle', -0.15, 0), h.at('ring', -0.15, 0), h.at('pinky', -0.19, -1)];
    P.push(['p', shape([top, [top[3], bot[0]], bot, [bot[3], top[0]]]), 'wrap', W]);
    // медальон на перекрестье
    const C = [34, 1];
    const oct = [];
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4, k = i % 2 ? 1 : 0.8; oct.push(U(C[0] + Math.cos(a) * 15 * k, C[1] + Math.sin(a) * 14 * k)); }
    P.push(['p', shape(oct.map((q, i) => [q, mix(q, oct[(i + 1) % 8], 0.5), oct[(i + 1) % 8]])), 'gun', { pr: 'round', r: 4, gem: 1 }]);
    // запястье: зев, основа и три витка по диагонали
    P.push(['k', h.cuffHole()]);
    P.push(['p', h.cuff(), 'wrap', W]);
    P.push(['p', strip(U, -32, -21, -24, -13, -29, 30), 'wrap', W]);
    P.push(['p', strip(U, -21, -9, -13, -1, -29, 30), 'wrap', W]);
    P.push(['p', strip(U, -9, 4, -1, 12, -29, 30), 'wrap', W]);
    return P;
  }

  GEO.glsh = HAND.geo(assault());
  GEO.glwr = HAND.geo(wraps());
})();
