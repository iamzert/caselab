'use strict';

// Геометрия оружия в системе координат 512×192 (ствол вправо, приклад слева).
// Модель — список деталей, они рисуются по порядку (сзади вперёд). Роли деталей:
//   p — раскраска, q — раскраска темнее (магазины, накладки), m — воронёный металл,
//   l — светлый металл, k — чёрный полимер / резина, g — стекло прицела,
//   s — толстая линия-деталь (скоба, ремень) [s, path, толщина],
//   d — тёмная линия: шов, паз, насечка [d, path, толщина],
//   h — светлая линия-блик [h, path, толщина], e — строчка пунктиром [e, path],
//   o — винт/заклёпка [o, cx, cy, r], t — гравировка [t, x, y, текст, размер].
// Пара (перчатки, парные пистолеты): { pair: true | { back: {...}, front: {...} }, parts: [...] }
//   true — расклад перчаток; иначе для каждой копии { x, y, rot (рад), cx, cy (центр поворота), s, flip }.
// Сами модели лежат в js/geo_*.js: каждый файл добавляет свои виды оружия в GEO.
const GEOH = (function () {
  // Прямоугольник со скруглёнными углами
  function rr(x, y, w, h, r) {
    return 'M' + (x + r) + ',' + y + ' L' + (x + w - r) + ',' + y + ' Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
      ' L' + (x + w) + ',' + (y + h - r) + ' Q' + (x + w) + ',' + (y + h) + ' ' + (x + w - r) + ',' + (y + h) +
      ' L' + (x + r) + ',' + (y + h) + ' Q' + x + ',' + (y + h) + ' ' + x + ',' + (y + h - r) +
      ' L' + x + ',' + (y + r) + ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y + ' Z ';
  }
  // Ряд прямоугольников (рёбра планки, прорези кожуха)
  function bars(x0, x1, step, y, h, w) {
    let d = '';
    for (let x = x0; x <= x1; x += step) d += 'M' + x + ',' + y + ' L' + (x + w) + ',' + y + ' L' + (x + w) + ',' + (y + h) + ' L' + x + ',' + (y + h) + ' Z ';
    return d;
  }
  // Ряд овальных прорезей
  function slots(x0, y, n, step, w, h) {
    let d = '';
    for (let i = 0; i < n; i++) d += rr(x0 + i * step, y, w, h, Math.min(w, h) / 2);
    return d;
  }
  // Вертикальные / горизонтальные штрихи (для ролей d, h)
  function vlines(x0, x1, step, y0, y1) {
    let d = '';
    for (let x = x0; x <= x1; x += step) d += 'M' + x + ',' + y0 + ' L' + x + ',' + y1 + ' ';
    return d;
  }
  function hlines(y0, y1, step, x0, x1) {
    let d = '';
    for (let y = y0; y <= y1; y += step) d += 'M' + x0 + ',' + y + ' L' + x1 + ',' + y + ' ';
    return d;
  }
  // Пила (зубья вверх) от x0 до x1 на линии y
  function saw(x0, x1, y, h, step) {
    let d = 'M' + x0 + ',' + (y + 1);
    for (let x = x0; x < x1; x += step) d += ' L' + (x + step / 2) + ',' + (y - h) + ' L' + (x + step) + ',' + (y + 1);
    return d + ' Z';
  }
  // Окружность (для колец и отверстий; вложенная окружность с evenodd даёт дырку)
  function circ(cx, cy, r) {
    return 'M' + (cx - r) + ',' + cy + ' A' + r + ',' + r + ' 0 1,0 ' + (cx + r) + ',' + cy + ' A' + r + ',' + r + ' 0 1,0 ' + (cx - r) + ',' + cy + ' Z ';
  }
  // Насечка вдоль кубической кривой p = [x0,y0, x1,y1, x2,y2, x3,y3]: штрихи по нормали внутрь детали
  function notches(p, t0, t1, n, len) {
    const at = (t) => {
      const u = 1 - t;
      return [u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
        u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]];
    };
    let d = '';
    for (let i = 0; i < n; i++) {
      const t = t0 + (t1 - t0) * i / (n - 1), a = at(t), b = at(t + 0.004);
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const l = Math.hypot(nx, ny); nx /= l; ny /= l;
      d += 'M' + (a[0] + nx * 0.6).toFixed(1) + ',' + (a[1] + ny * 0.6).toFixed(1) + ' L' + (a[0] + nx * len).toFixed(1) + ',' + (a[1] + ny * len).toFixed(1) + ' ';
    }
    return d;
  }
  // Добавить гравировку [[x, y, текст, размер], ...] в конец модели
  function engrave(parts, list) {
    list.forEach((e) => parts.push(['t', e[0], e[1], e[2], e[3]]));
    return parts;
  }
  return { rr: rr, bars: bars, slots: slots, vlines: vlines, hlines: hlines, saw: saw, circ: circ, notches: notches, engrave: engrave };
})();

const GEO = {};
