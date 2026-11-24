'use strict';

// Общая анатомическая основа перчаток (HAND): кисть в позе иконок перчаток CS2 — тыльной стороной к нам,
// пальцы сомкнуты и согнуты к ладони (средние и ногтевые фаланги сокращены в перспективе), большой палец выходит
// из-под края ладони ниже указательного и идёт вдоль пальцев; запястье и манжета.
// Модели перчаток (js/geo_w4_gloves_*.js) берут отсюда контуры деталей и раскладку пары HAND.PAIR.
//
// Система координат. Кисть строится в своей системе (u, v): u — от запястья к кончикам пальцев (запястье u = 0,
// костяшки u ≈ 80…92, кончик среднего ≈ 166), v — поперёк кисти, +v к большому пальцу. В координаты модели:
// x = X0 − u·s, y = Y0 + v·s (пальцы смотрят влево, большой палец — вниз). Игра отражает картинку по горизонтали
// (MIRROR в art.js), поэтому в карточке пальцы смотрят вправо: передняя перчатка — левая рука, задняя — правая.
// Все функции возвращают строки SVG path d в координатах модели, готовые для кортежей ['p', d, …].
(function () {
  const f1 = (v) => Math.round(v * 10) / 10;
  const pt = (p) => f1(p[0]) + ',' + f1(p[1]);
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- Кривые (точки уже в координатах модели) ----------
  // Гладкий участок через точки (Катмулл — Ром → Безье); текущая точка — pts[0]
  function cr(pts) {
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += ' C' + pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + ' ' +
        pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + pt(p2);
    }
    return d;
  }
  const curve = (pts) => 'M' + pt(pts[0]) + cr(pts);
  // Замкнутый контур из гладких участков; на стыках участков — изломы
  function shape(runs) {
    let d = 'M' + pt(runs[0][0]);
    runs.forEach((r) => { d += cr(r); });
    return d + ' Z';
  }
  // Гладкий замкнутый контур без изломов
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

  // ---------- Пропорции настоящей руки (единицы кисти; ширина ладони у костяшек ≈ длине среднего пальца) ----------
  // k — костяшка (u, v); L — длина пальца от костяшки до кончика; w — ширина у основания;
  // a — направление (рад, + к большому пальцу); b — изгиб в каждом суставе (сведение пальцев к среднему)
  const FING = {
    index:  { k: [80, 25.5], L: 70, w: 19, a: 0.12, b: -0.035 },
    middle: { k: [84, 8], L: 78, w: 19.5, a: 0.03, b: -0.005 },
    ring:   { k: [81, -9], L: 74, w: 18.5, a: -0.07, b: 0.025 },
    pinky:  { k: [72, -25], L: 58, w: 15.5, a: -0.18, b: 0.045 },
  };
  // Большой палец: пясть спрятана под тыльной стороной, основная и ногтевая фаланги выходят из-под края ладони
  // ниже указательного (с зазором) и идут вдоль пальцев, кончик — вправо-вниз (как на иконках водительских перчаток)
  const THUMB = { k: [44, 32], seg: [28, 27, 21], w: [22, 20.5, 18.5, 15.5], a: 0.24, b: -0.05 };
  const NAMES = ['index', 'middle', 'ring', 'pinky'];
  const THUMB_OUT = 0.3;       // доля длины большого, откуда он рисуется поверх ладони (h.thumbOver)
  const PHAL = [0.45, 0.75];
  const CURL_B = 0.17;         // загиб пальца в каждом суставе при curl = 1 (рад, к +v — вниз, к ладони)   // доли длины пальца, где суставы (основная : средняя : ногтевая = 45 : 30 : 25)

  // ---------- Палец как трубка вдоль изогнутой средней линии ----------
  // sp: { k: [u, v] костяшка, seg: [длины звеньев], w: [у основания, сустав 1, сустав 2, у кончика], a, b }
  // Средняя линия интегрируется по углу, который плавно меняется в суставах (без изломов контура).
  function digit(sp) {
    const len = sp.seg.reduce((s, x) => s + x, 0);
    const J = [sp.seg[0] / len, (sp.seg[0] + sp.seg[1]) / len];      // доли длины, где суставы
    const ang = (d) => {                                            // угол средней линии на расстоянии d
      let a = sp.a;
      [sp.seg[0], sp.seg[0] + sp.seg[1]].forEach((j) => { a += sp.b * Math.min(1, Math.max(0, (d - j + 5) / 10)); });
      return a;
    };
    const B = -16, pts = [];                                         // шаг 1 ед.; от d = B (под тыльной стороной)
    let u = sp.k[0] + B * Math.cos(sp.a), v = sp.k[1] + B * Math.sin(sp.a);
    for (let d = B; d <= len + 1; d++) { pts.push([u, v, ang(d)]); const a = ang(d + 0.5); u += Math.cos(a); v += Math.sin(a); }
    const rT = sp.w[3] * 0.36, tc = 1 - rT / len;                    // кончик — тупой (суперэллипс), не «сосиска»
    function width(t) {
      if (t < 0) return sp.w[0];
      let w;
      if (t < J[0]) w = lerp(sp.w[0], sp.w[1], t / J[0]);
      else if (t < J[1]) w = lerp(sp.w[1], sp.w[2], (t - J[0]) / (J[1] - J[0]));
      else w = lerp(sp.w[2], sp.w[3], Math.min(1, (t - J[1]) / (tc - J[1])));
      w *= 1 + 0.02 * (Math.exp(-Math.pow((t - J[0]) / 0.05, 2)) + Math.exp(-Math.pow((t - J[1]) / 0.05, 2)));
      if (t > tc) w *= Math.pow(Math.max(0, 1 - Math.pow((t - tc) / (1 - tc), 3)), 1 / 3);
      return w;
    }
    // точка (u, v): t — доля длины от костяшки (0) до кончика (1), s — поперёк (−1…1, +1 — к большому пальцу)
    function at(t, s) {
      const d = Math.max(B, Math.min(len, t * len)) - B, i = Math.min(pts.length - 2, Math.floor(d)), f = d - i;
      const p = [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)], a = lerp(pts[i][2], pts[i + 1][2], f);
      const h = (s || 0) * width(t) / 2;
      return [p[0] - Math.sin(a) * h, p[1] + Math.cos(a) * h];
    }
    return { len: len, J: J, at: at, width: width, t0: B / len };
  }

  // ---------- Кисть по опциям ----------
  // o: { x, y — где запястье в модели; s — масштаб; cuffLen, cuffW — длина и ширина манжеты; flare — раструб;
  //      cut — пальцы обрезаны на этой доле длины (0 — целые; 0.5 ≈ середина средней фаланги); thumbCut — то же
  //      для большого; spread — разведение пальцев (1 — как в позе иконки); curl — согнутость; puff — толщина }
  // Наклон пары (рад) зашит в саму модель, а не в rot раскладки: art.js считает рамку картинки по углам
  // рамок деталей, и поворот через rot раздувает её (пара в карточке выходит мельче).
  const TILT = -0.5;
  const DEF = { x: 236, y: 82, s: 1, tilt: TILT, cuffLen: 40, cuffW: 64, flare: 4, cut: 0, thumbCut: 0, spread: 0.65, curl: 1, puff: 1 };
  function make(opts) {
    const o = Object.assign({}, DEF, opts || {});
    // (u, v) → модель: пальцами влево, затем наклон tilt вокруг середины кисти (u = 70, v = 10)
    const tc = Math.cos(o.tilt), ts = Math.sin(o.tilt);
    const M = (p) => { const x = -(p[0] - 70) * o.s, y = (p[1] - 10) * o.s;
      return [o.x - 70 * o.s + x * tc - y * ts, o.y + 10 * o.s + x * ts + y * tc]; };
    const D = {};
    NAMES.forEach((n) => {
      // curl — пальцы согнуты к ладони: средняя и ногтевая фаланги уходят от зрителя (сокращаются в перспективе),
      // а в суставах палец загибается вниз, к стороне большого пальца (+v). Кончик почти той же ширины, что основание.
      const F = FING[n], c = o.curl, w = F.w * o.puff;
      D[n] = digit({ k: F.k, seg: [F.L * 0.45, F.L * 0.3 * (1 - 0.38 * c), F.L * 0.25 * (1 - 0.5 * c)],
        w: [w, w * 0.94, w * 0.88, w * 0.82], a: F.a * o.spread, b: F.b * o.spread + CURL_B * c });
    });
    D.thumb = digit({ k: THUMB.k, seg: THUMB.seg, w: THUMB.w.map((x) => x * o.puff), a: THUMB.a, b: THUMB.b });
    const cutOf = (n) => (n === 'thumb' ? o.thumbCut : o.cut) || 1;
    const P = (n, t, s) => M(D[n].at(t, s));

    // Участок пальца между долями t0…t1 (замкнутый). Кончик (t1 = 1) — круглый; срез — чуть выпуклый.
    // k — множитель ширины (голый палец тоньше перчатки)
    function band(n, t0, t1, k) {
      const d = D[n];
      k = k || 1; t0 = Math.max(d.t0, t0); t1 = Math.min(1, t1);
      const ts = [], step = 4.5 / d.len;
      for (let t = t0; t < t1 - 1e-6; t += (t > 1 - 0.1 ? step * 0.4 : step)) ts.push(t);
      ts.push(t1);
      const A = ts.map((t) => P(n, t, k)), B = ts.map((t) => P(n, t, -k)).reverse();
      const bulge = (t, dir) => P(n, t + dir * 0.18 * k * d.width(t) / d.len, 0);
      if (t1 >= 1) return shape([A.concat(B.slice(1)), [B[B.length - 1], bulge(t0, -1), A[0]]]);
      return shape([A, [A[A.length - 1], bulge(t1, 1), B[0]], B, [B[B.length - 1], bulge(t0, -1), A[0]]]);
    }
    // Эллипс на пальце: центр в (t, s), полуоси ra вдоль пальца и rb поперёк (единицы кисти)
    function ellOn(n, t, s, ra, rb) {
      const c = D[n].at(t, s), e = D[n].at(t + 0.01, s), a = Math.atan2(e[1] - c[1], e[0] - c[0]), q = [];
      for (let i = 0; i < 8; i++) {
        const f = i * Math.PI / 4, x = Math.cos(f) * ra, y = Math.sin(f) * rb;
        q.push(M([c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]));
      }
      return loop(q);
    }
    const jt = (n, j) => (j === 0 ? 0.02 : D[n].J[j - 1]);           // доля длины сустава j (0 — костяшка)
    const lineAcross = (n, t, k, bow) => curve([P(n, t, -k), P(n, t + bow / D[n].len, 0), P(n, t, k)]);
    const lineAlong = (n, s, t0, t1) => {
      const q = [], N = Math.max(3, Math.ceil((t1 - t0) * D[n].len / 6));
      for (let i = 0; i <= N; i++) q.push(P(n, t0 + (t1 - t0) * i / N, s));
      return curve(q);
    };

    // Тень между сомкнутыми пальцами: перепонки от основания почти до кончика (рисовать ДО пальцев, ролью 'q'
    // материалом перчатки) — в щелях между пальцами видна тень, а не фон
    function webs() {
      const ord = ['pinky', 'ring', 'middle', 'index'];
      let d = '';
      for (let i = 0; i < 3; i++) {
        const A = ord[i], B = ord[i + 1], q = [];
        for (let k = 0; k <= 6; k++) q.push(P(A, -0.05 + 0.92 * k / 6, 0.5));
        for (let k = 6; k >= 0; k--) q.push(P(B, -0.05 + 0.92 * k / 6, -0.5));
        d += (d ? ' ' : '') + loop(q);
      }
      return d;
    }

    // ---------- Тыльная сторона кисти ----------
    // Край у пальцев — дуги над основанием каждого пальца, между пальцами перепонки уходят вперёд (как у руки).
    // Со стороны большого пальца край идёт по его верхней кромке — пясть большого пальца и есть «пухлое» основание.
    function back() {
      const runs = [], ord = ['pinky', 'ring', 'middle', 'index'];
      const web = (a, b) => { const p = D[a].at(0.17, 1), q = D[b].at(0.17, -1); return M([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); };
      let prev = P('pinky', -0.06, -1.02);
      ord.forEach((n, i) => {
        const next = i < 3 ? web(n, ord[i + 1]) : P('index', 0.02, 1.02);
        runs.push([prev, P(n, 0.07, -0.72), P(n, 0.085, 0), P(n, 0.07, 0.72), next]);
        prev = next;
      });
      // сторона большого пальца: край ладони от основания указательного к запястью (пясть большого — под ним)
      runs.push([prev, M([66, 38]), M([40, 35.5]), M([16, 32]), M([-2, 29])]);
      runs.push([M([-2, 29]), M([-2, -26.5])]);
      runs.push([M([-2, -26.5]), M([30, -29.5]), M([58, -32]), runs[0][0]]);
      return shape(runs);
    }
    // Точка на тыльной стороне: a — от запястья (0) к линии костяшек (1), b — от мизинца (−1) к большому (+1)
    function backAt(a, b) {
      const k = b < 0 ? lerp(D.middle.at(0, 0)[0], D.pinky.at(0, 0)[0] - 2, -b) : lerp(D.middle.at(0, 0)[0], D.index.at(0, 0)[0] - 2, b);
      const half = lerp(27, b < 0 ? 31 : 34, a);
      return M([a * k, b * half + 0.5]);
    }
    // Линия костяшек (дуга через основания пальцев) — для накладок и швов поперёк кисти
    const knuckleLine = (d) => curve([P('pinky', -0.02 - (d || 0) / 55, -1), P('pinky', -(d || 0) / 55, 0), P('ring', -(d || 0) / 70, 0),
      P('middle', -(d || 0) / 74, 0), P('index', -(d || 0) / 66, 0), P('index', -0.02 - (d || 0) / 66, 1)]);

    // ---------- Манжета ----------
    // Прямоугольник со скруглёнными концами от u = +8 (заходит на запястье) до u = −cuffLen; открытый конец шире на flare
    const cH = o.cuffW / 2, cL = o.cuffLen, fl = o.flare;
    function cuff(u0, u1) {
      u0 = u0 == null ? 8 : u0; u1 = u1 == null ? -cL : u1;
      const h = (u) => cH + fl * Math.max(0, Math.min(1, (8 - u) / (8 + cL)));
      return shape([[M([u0, -h(u0)]), M([lerp(u0, u1, 0.5), -h(lerp(u0, u1, 0.5)) - 0.6]), M([u1, -h(u1)])],
        [M([u1, -h(u1)]), M([u1 - 3, -h(u1) * 0.55]), M([u1 - 3.6, 0.5]), M([u1 - 3, h(u1) * 0.55]), M([u1, h(u1) + 1])],
        [M([u1, h(u1) + 1]), M([lerp(u0, u1, 0.5), h(lerp(u0, u1, 0.5)) + 1.4]), M([u0, h(u0) + 1])],
        [M([u0, h(u0) + 1]), M([u0 + 3, h(u0) * 0.5]), M([u0 + 3.4, 0.5]), M([u0 + 3, -h(u0) * 0.5]), M([u0, -h(u0)])]]);
    }
    // Тёмный зев манжеты (рисовать ДО манжеты: виден серпом за открытым концом)
    const cuffHole = () => { const q = [], rx = 6 + fl * 0.5, ry = cH + fl - 2;
      for (let i = 0; i < 10; i++) { const f = i * Math.PI / 5; q.push(M([-cL - 2.6 + Math.cos(f) * rx, 0.5 + Math.sin(f) * ry])); }
      return loop(q); };
    // Линия поперёк манжеты (шов, кромка подгиба): u — где (по умолчанию у открытого конца)
    const cuffLine = (u) => { u = u == null ? -cL + 5 : u; const h = cH + fl * Math.max(0, Math.min(1, (8 - u) / (8 + cL))) - 2;
      return curve([M([u, -h]), M([u - 2.6, 0.5]), M([u, h + 1])]); };
    // Линия запястья (складка между кистью и манжетой)
    const wristLine = () => curve([M([14, -26]), M([17, 0]), M([14, 27])]);

    // ---------- Готовый набор функций кисти ----------
    const J = (n) => D[n].J;
    const W = (n, t) => D[n].width(t);
    const phal = (n, k) => {                                       // фаланга k = 0 (основная), 1 (средняя), 2 (ногтевая)
      const e = [D[n].t0, J(n)[0], J(n)[1], 1], c = cutOf(n);
      return e[k] >= c ? null : band(n, k ? e[k] : -1, Math.min(e[k + 1], c));
    };
    return {
      o: o, names: NAMES.slice(),
      pt: (u, v) => M([u, v]),                                     // точка кисти (u, v) → модель
      at: (n, t, s) => P(n, t, s || 0),                            // точка на пальце (n — 'index'…'pinky' или 'thumb')
      len: (n) => D[n].len * o.s, joints: (n) => J(n).slice(), width: (n, t) => W(n, t) * o.s,
      finger: (n, cut) => band(n, -1, cut != null ? cut : cutOf(n)),
      thumb: (cut) => band('thumb', -1, cut != null ? cut : cutOf('thumb')),
      // фаланги большого пальца поверх края ладони (рисовать ПОСЛЕ back) и складка, где он выходит из-под ладони
      thumbOver: (t0, cut) => band('thumb', t0 == null ? THUMB_OUT : t0, cut != null ? cut : cutOf('thumb')),
      thumbFold: (t0) => lineAcross('thumb', t0 == null ? THUMB_OUT : t0, 0.8, 2),
      band: (n, t0, t1, k) => band(n, t0, t1, k),
      phalanx: phal,
      tip: (n, f) => band(n, 1 - (f || 0.2), 1),                   // кончик (колпачок)
      pad: (n, k) => ellOn(n, (J(n)[1] + 1) / 2 - 0.02, 0, D[n].len * (1 - J(n)[1]) * 0.34 * (k || 1), W(n, 0.85) * 0.33 * (k || 1)),
      knuckle: (n, j, k) => ellOn(n, jt(n, j || 0), 0, W(n, jt(n, j || 0)) * 0.36 * (k || 1), W(n, jt(n, j || 0)) * 0.4 * (k || 1)),
      joint: (n, j, k) => lineAcross(n, jt(n, j), k || 0.78, 1.6),     // складка поперёк пальца в суставе (открытая линия)
      edge: (n, s, t0, t1) => lineAlong(n, (s || 1) * 0.78, t0 == null ? 0.1 : t0, t1 == null ? Math.min(0.93, cutOf(n) - 0.04) : t1),
      spine: (n, t0, t1) => lineAlong(n, 0, t0 == null ? 0.05 : t0, t1 == null ? Math.min(0.95, cutOf(n) - 0.03) : t1),
      hem: (n, w) => band(n, cutOf(n) - (w || 0.07), cutOf(n)),    // подгиб на срезе беспалой перчатки
      bare: (n) => band(n, cutOf(n) - 0.06, 1, 0.84),              // голый палец, выглядывающий из среза
      ell: (n, t, s, ra, rb) => ellOn(n, t, s, ra, rb),
      back: back, backAt: backAt, webs: webs, knuckleLine: knuckleLine,
      cuff: cuff, cuffHole: cuffHole, cuffLine: cuffLine, wristLine: wristLine,
      curve: (pts) => curve(pts.map(M)), shape: (runs) => shape(runs.map((r) => r.map(M))), loop: (pts) => loop(pts.map(M)),
    };
  }

  // ---------- Подсказки формы для света (контракт R6) ----------
  const HINT = {
    leather: { pr: 'pillow', r: 6 },        // кожа тыльной стороны
    cloth: { pr: 'pillow', r: 5 },          // ткань, трикотаж
    finger: { pr: 'pillow', r: 8 },         // пальцы — надутые трубки
    web: { pr: 'flat', h: -2 },             // тень между сомкнутыми пальцами (h.webs)
    cuff: { pr: 'pillow', r: 4 },           // манжета
    plate: { pr: 'round', r: 3, gem: 1 },   // накладки, костяшки — на каменном скине становятся камнем
    dome: { pr: 'dome', gem: 1 },           // кнопки, эмблемы-купола
  };

  // ---------- Раскладка пары как на иконках CS2 ----------
  // Передняя (левая рука, большой палец внизу) — крупно; задняя — зеркальная по вертикали (правая рука, большой
  // палец сверху), мельче (0.9), сдвинута вправо на ~40 % длины кисти и выше и повёрнута на ~10° круче передней:
  // её пальцы видны отдельной группой правее передних, а ладонь закрыта передней перчаткой.
  // После MIRROR: пальцы вправо-вниз (~30°), манжеты влево-вверх. rot: + — круче (пальцы ниже).
  const PAIR = {
    back: { x: 232, y: -25, flip: true, rot: Math.PI - 2 * TILT + 0.17, cx: 166, cy: 92, s: 0.9 },
    front: { x: 0, y: 0 },
  };

  // ---------- Пример: простая кожаная перчатка (минимум деталей) — для проверки основы ----------
  // В игре на места перчаток не ставится. opts — как у make() плюс mat (заводской материал кожи).
  function basic(opts) {
    const h = make(opts), o = h.o, mat = (opts && opts.mat) || 'leather', P = [];
    const fingers = ['pinky', 'ring', 'middle', 'index'];
    if (o.cut) fingers.concat('thumb').forEach((n) => P.push(['k', h.bare(n), { pr: 'pillow', r: 6 }]));
    else P.push(['q', h.webs(), mat, HINT.web]);
    P.push(['p', h.thumb(), mat, HINT.finger]);
    fingers.forEach((n) => P.push(['p', h.finger(n), mat, HINT.finger]));
    if (o.cut) fingers.concat('thumb').forEach((n) => P.push(['p', h.hem(n), mat, HINT.cuff]));
    P.push(['p', h.back(), mat, HINT.leather]);
    P.push(['p', h.thumbOver(), mat, HINT.finger]);
    P.push(['d', h.thumbFold(), 0.8]);
    // складки в суставах — едва заметные
    fingers.forEach((n) => { [1, 2].forEach((j) => { if (h.joints(n)[j - 1] < (o.cut || 1) - 0.05) P.push(['d', h.joint(n, j), 0.6]); }); });
    if ((o.thumbCut || 1) > 0.8) P.push(['d', h.joint('thumb', 2), 0.6]);
    P.push(['k', h.cuffHole()]);
    P.push(['p', h.cuff(), mat, HINT.cuff]);
    P.push(['e', h.cuffLine()]);
    P.push(['e', h.cuffLine(3)]);
    return P;
  }

  // Готовая модель для GEO: { pair, parts }
  const geo = (parts, pair) => ({ pair: pair || PAIR, parts: parts });

  window.HAND = { make: make, basic: basic, geo: geo, PAIR: PAIR, TILT: TILT, HINT: HINT, DEF: DEF, NAMES: NAMES };
})();
