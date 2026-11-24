'use strict';

// Перчатки на общей основе кисти HAND (js/geo_hand.js): gltc (тактические), glmo (мотоперчатки).
// Загружается после js/geo_hand.js и js/geo_gloves*.js: GEO.<id> здесь заменяет прежнюю модель.
// Поза, анатомия и раскладка пары — из HAND (тыльной стороной к нам, пара «одна поверх другой со сдвигом»).
// Здесь — только характерные элементы вида, крупно и без мелкой ряби:
//   gltc — ткань (софтшелл), сегментированный щиток во всю ширину кисти, пальцы в ладонной ткани (темнее),
//          короткая манжета-липучка;
//   glmo — тёмная кожа, панцирь-купол на костяшках, гармошка на запястье, длинная крага с раструбом
//          и диагональным ремнём с пряжкой (скин — на краге).
// Скин ложится на 'p' (и темнее — на 'q'); детали с «!» — всегда своим материалом. gem: 1 — на каменном скине
// деталь становится камнем (накладка костяшек, эмблема / шайба); остальная перчатка — кожа в тон камня.
(function () {
  if (typeof HAND === 'undefined') return;
  const f1 = (v) => Math.round(v * 10) / 10;
  const pt = (p) => f1(p[0]) + ',' + f1(p[1]);
  // Гладкий замкнутый контур через точки модели (Катмулл — Ром → Безье)
  function loop(q) {
    const n = q.length;
    let d = 'M' + pt(q[0]);
    for (let i = 0; i < n; i++) {
      const p0 = q[(i + n - 1) % n], p1 = q[i], p2 = q[(i + 1) % n], p3 = q[(i + 2) % n];
      d += ' C' + pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + ' ' +
        pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + pt(p2);
    }
    return d + ' Z';
  }
  const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * (t == null ? 0.5 : t), a[1] + (b[1] - a[1]) * (t == null ? 0.5 : t)];
  const FING = ['pinky', 'ring', 'middle', 'index'];
  const HN = HAND.HINT;

  // Накладка на костяшки: один цельный щиток через основания четырёх пальцев, со стороны пальцев — бугры над
  // каждой костяшкой, к запястью — плавная дуга. t1 — насколько заходит на пальцы, a0 — нижний край (доля backAt)
  function knuckleShell(h, t1, a0, k) {
    const q = [];
    k = k || 0.92;
    // сторона пальцев: от мизинца к указательному
    FING.forEach((n, i) => {
      q.push(h.at(n, t1 * 0.55, -k));
      q.push(h.at(n, t1, 0));
      q.push(h.at(n, t1 * 0.55, k));
      if (i < 3) q.push(mid(h.at(n, -0.02, k), h.at(FING[i + 1], -0.02, -k)));
    });
    // сторона запястья: от указательного к мизинцу
    [0.86, 0.4, -0.1, -0.55, -0.9].forEach((b) => q.push(h.backAt(a0 + 0.05 * Math.abs(b), b)));
    return loop(q);
  }
  // Пазы щитка между буграми костяшек: от впадины между пальцами к запястью, до середины щитка
  function shellGrooves(h, a0) {
    return [-0.5, 0.02, 0.52].map((b, i) => {
      const v = mid(h.at(FING[i], -0.02, 0.92), h.at(FING[i + 1], -0.02, -0.92)), w = h.backAt(a0, b);
      return 'M' + pt(mid(v, w, 0.12)) + ' L' + pt(mid(v, w, 0.55));
    });
  }

  // ---------- Тактические перчатки (gltc) ----------
  // Крупный признак — сегментированный щиток во всю ширину кисти; пальцы в ладонной ткани (темнее), короткая
  // манжета-липучка.
  function tactical() {
    const h = HAND.make({ cuffLen: 20, cuffW: 60, flare: 2, puff: 1.04 });
    const P = [], soft = HN.finger;
    // пальцы и большой палец — ладонная ткань (темнее тыла), в щелях — тень
    P.push(['q', h.webs(), 'neoprene', HN.web]);
    P.push(['q', h.thumb(), 'neoprene', soft]);
    FING.forEach((n) => P.push(['q', h.finger(n), 'neoprene', soft]));
    FING.forEach((n) => P.push(['d', h.joint(n, 2, 0.7), 0.6]));
    P.push(['p', h.back(), 'cloth', HN.cloth]);
    P.push(['q', h.thumbOver(), 'neoprene', soft]);
    P.push(['d', h.thumbFold(), 0.9]);
    // щиток во всю ширину кисти: от середины тыла до оснований пальцев, бугры над костяшками (на каменном скине — камень)
    P.push(['p', knuckleShell(h, 0.14, 0.42, 1.02), 'rubber', { pr: 'slab', r: 4, h: 1.5, gem: 1 }]);
    shellGrooves(h, 0.42).forEach((d) => P.push(['d', d, 1.1]));
    // поперечный паз — щиток из двух рядов сегментов
    P.push(['d', h.curve([[56, -30], [61, -14], [63, 2], [62, 18], [58, 33]]), 1.2]);
    P.push(['e', h.curve([[44, -29], [49, -13], [51, 3], [50, 19], [46, 33]])]);
    // короткая манжета-липучка: неопрен и широкий ремень с язычком
    P.push(['k', h.cuffHole()]);
    P.push(['q', h.cuff(), 'neoprene', HN.cuff]);
    P.push(['p', h.cuff(2, -16), 'cloth', { pr: 'pillow', r: 3.5, h: 1 }]);
    P.push(['e', h.cuffLine(0)]);
    P.push(['e', h.cuffLine(-14)]);
    P.push(['p', h.shape([[[-2, 8], [-2.6, 22], [-4, 37]], [[-4, 37], [-14, 37]], [[-14, 37], [-13.4, 22], [-14, 8]], [[-14, 8], [-2, 8]]]), 'rubber', { pr: 'round', r: 2.5, h: 1.5 }]);
    return HAND.geo(P);
  }

  // ---------- Мотоперчатки (glmo) ----------
  // Крупный признак — длинная крага с явным раструбом и диагональным ремнём; кисть — тёмная кожа (свой материал),
  // на костяшках — панцирь-купол. Скин ложится на крагу (и камнем — на панцирь и пряжку).
  function moto() {
    const h = HAND.make({ cuffLen: 54, cuffW: 64, flare: 17, puff: 1.04 });
    const P = [], soft = HN.finger, rib = { pr: 'pillow', r: 2.5 };
    P.push(['q', h.webs(), 'darkleather!', HN.web]);
    P.push(['p', h.thumb(), 'darkleather!', soft]);
    FING.forEach((n) => P.push(['p', h.finger(n), 'darkleather!', soft]));
    FING.forEach((n) => [1, 2].forEach((j) => P.push(['d', h.joint(n, j, 0.75), 0.6])));
    P.push(['p', h.back(), 'darkleather!', HN.leather]);
    P.push(['p', h.thumbOver(), 'darkleather!', soft]);
    P.push(['d', h.thumbFold(), 0.9]);
    // гармошка на запястье (между кистью и крагой)
    P.push(['p', h.shape([[[21, -27.5], [21.6, 0], [21, 29.5]], [[21, 29.5], [6, 30.5]], [[6, 30.5], [6.5, 0], [6, -28.5]], [[6, -28.5], [21, -27.5]]]),
      'neoprene!', rib]);
    [17.5, 13.5].forEach((u) => P.push(['d', h.curve([[u, -27], [u + 1.2, 0], [u, 29]]), 0.9]));
    // панцирь-купол на костяшках (на каменном скине — камень)
    P.push(['p', knuckleShell(h, 0.15, 0.7, 0.96), 'gray', { pr: 'round', r: 6, h: 2.5, gem: 1 }]);
    shellGrooves(h, 0.7).forEach((d) => P.push(['d', d, 0.9]));
    // длинная крага с раструбом — окрашивается скином
    P.push(['k', h.cuffHole()]);
    P.push(['p', h.cuff(), 'leather', HN.cuff]);
    P.push(['e', h.cuffLine(4)]);
    P.push(['e', h.cuffLine()]);
    // диагональный ремень через крагу и пряжка на нём
    const cw = 32 + 17 * 0.55;
    P.push(['p', h.shape([[[2, -cw + 4], [-14, -cw + 3]], [[-14, -cw + 3], [-36, cw + 6]], [[-36, cw + 6], [-20, cw + 7]], [[-20, cw + 7], [2, -cw + 4]]]),
      'darkleather!', { pr: 'pillow', r: 3, h: 2 }]);
    P.push(['p', h.loop([[-12, -3], [-13, 5], [-20, 6.5], [-24.5, 1], [-23.5, -7], [-16.5, -8.5]]), 'gray', { pr: 'dome', gem: 1 }]);
    return HAND.geo(P);
  }

  GEO.gltc = tactical();
  GEO.glmo = moto();
})();
