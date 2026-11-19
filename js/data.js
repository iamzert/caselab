'use strict';

// ============================================================
// Каталог предметов. Названия оружия и раскрасок вымышленные.
// Свою картинку предмету можно задать так (файл положить в img/):
//   SKIN_IMAGES['ar47_tiger'] = 'img/ar47_tiger.png';
// ============================================================

const SKIN_IMAGES = {};

// w — вес редкости в обычных кейсах. Ножи и перчатки (special) очень дорогие,
// поэтому их вес маленький: отдача кейса остаётся прежней, а нож — редкая удача.
const RARITIES = [
  { id: 'common',    color: '#a9b4c2', w: 40 },
  { id: 'uncommon',  color: '#5fd068', w: 30 },
  { id: 'rare',      color: '#4f8dff', w: 18 },
  { id: 'epic',      color: '#9d5cff', w: 7.5 },
  { id: 'legendary', color: '#e14bd6', w: 3 },
  { id: 'mythic',    color: '#ff4f4f', w: 1.2 },
  { id: 'special',   color: '#ffb92e', w: 0.012 },
  { id: 'relic',     color: '#2ef2ff', w: 0.0004 },
  { id: 'ultra',     color: '#ff5ccd', w: 0.00001 },
];
// Базовая цена предмета по редкости (дальше умножается на оружие и раскраску).
// Ножи и перчатки — от ~25 000, реликвии — от 1 000 000, артефакты — от 100 000 000.
const RAR_BASE = [0.45, 1.4, 4.8, 17, 62, 230, 40000, 1000000, 50000000];

// Износ: диапазон float, шанс выпадения и множитель цены
const WEARS = [
  { id: 'fn', min: 0.00, max: 0.07, p: 0.10, mult: 1.5 },
  { id: 'mw', min: 0.07, max: 0.15, p: 0.20, mult: 1.2 },
  { id: 'ft', min: 0.15, max: 0.38, p: 0.40, mult: 1.0 },
  { id: 'ww', min: 0.38, max: 0.45, p: 0.15, mult: 0.8 },
  { id: 'bs', min: 0.45, max: 1.00, p: 0.15, mult: 0.65 },
];
const WEAR_EV = WEARS.reduce((s, w) => s + w.p * w.mult, 0);

// Названия вымышленные; силуэты повторяют реальные типы оружия (геометрия — js/geo_*.js).
const WEAPONS = {
  // Пистолеты
  p17:   { type: 'pistol',  mult: 0.8,  name: { ru: 'Гарда-17', en: 'Garda-17' } },
  psd:   { type: 'pistol',  mult: 0.9,  name: { ru: 'Тихоня-SD', en: 'Hush-SD' } },
  p2k:   { type: 'pistol',  mult: 0.8,  name: { ru: 'Страж-2000', en: 'Warden-2000' } },
  p250:  { type: 'pistol',  mult: 0.75, name: { ru: 'Шмель-250', en: 'Bumblebee-250' } },
  p57:   { type: 'pistol',  mult: 0.85, name: { ru: 'Пятак-57', en: 'Nickel-57' } },
  tec:   { type: 'pistol',  mult: 0.8,  name: { ru: 'Тайпан-9', en: 'Taipan-9' } },
  cz:    { type: 'pistol',  mult: 0.8,  name: { ru: 'Чекан-75', en: 'Chekan-75' } },
  duo:   { type: 'pistol',  mult: 0.85, name: { ru: 'Близнецы', en: 'Gemini' } },
  p50:   { type: 'pistol',  mult: 1.0,  name: { ru: 'Кобра-50', en: 'Cobra-50' } },
  r8:    { type: 'pistol',  mult: 0.85, name: { ru: 'Барабан-8', en: 'Drum-8' } },
  // Пистолеты-пулемёты
  smg10: { type: 'smg',     mult: 0.85, name: { ru: 'Оса-10', en: 'Wasp-10' } },
  smg9:  { type: 'smg',     mult: 0.8,  name: { ru: 'Гадюка-9', en: 'Viper-9' } },
  smg7:  { type: 'smg',     mult: 0.85, name: { ru: 'Хорёк-7', en: 'Ferret-7' } },
  smg5:  { type: 'smg',     mult: 0.85, name: { ru: 'Шёпот-5', en: 'Whisper-5' } },
  smg45: { type: 'smg',     mult: 0.9,  name: { ru: 'Шершень-45', en: 'Hornet-45' } },
  p90:   { type: 'smg',     mult: 0.95, name: { ru: 'Пульсар-90', en: 'Pulsar-90' } },
  bzn:   { type: 'smg',     mult: 0.75, name: { ru: 'Шнек-19', en: 'Auger-19' } },
  // Автоматы
  ar47:  { type: 'rifle',   mult: 1.4,  name: { ru: 'Штурм-47', en: 'Storm-47' } },
  ar4:   { type: 'rifle',   mult: 1.3,  name: { ru: 'Сокол-4', en: 'Falcon-4' } },
  ar4s:  { type: 'rifle',   mult: 1.3,  name: { ru: 'Сокол-4S', en: 'Falcon-4S' } },
  gal:   { type: 'rifle',   mult: 1.0,  name: { ru: 'Гюрза-AR', en: 'Gyurza AR' } },
  fam:   { type: 'rifle',   mult: 1.0,  name: { ru: 'Фанфара', en: 'Fanfare' } },
  sg5:   { type: 'rifle',   mult: 1.1,  name: { ru: 'Скат-553', en: 'Stingray-553' } },
  aug:   { type: 'rifle',   mult: 1.1,  name: { ru: 'Авангард', en: 'Vanguard' } },
  // Снайперские винтовки
  sr338: { type: 'sniper',  mult: 1.7,  name: { ru: 'Гром-338', en: 'Thunder-338' } },
  sr08:  { type: 'sniper',  mult: 1.1,  name: { ru: 'Ястреб-08', en: 'Hawk-08' } },
  scar:  { type: 'sniper',  mult: 1.0,  name: { ru: 'Беркут-20', en: 'Berkut-20' } },
  g3:    { type: 'sniper',  mult: 1.0,  name: { ru: 'Филин-3', en: 'Eagle Owl-3' } },
  // Дробовики и пулемёты
  sg12:  { type: 'shotgun', mult: 0.75, name: { ru: 'Молот-12', en: 'Sledge-12' } },
  xm:    { type: 'shotgun', mult: 0.85, name: { ru: 'Кувалда-14', en: 'Maul-14' } },
  sawn:  { type: 'shotgun', mult: 0.7,  name: { ru: 'Обрез', en: 'Sawn-Off' } },
  mag7:  { type: 'shotgun', mult: 0.75, name: { ru: 'Таран-7', en: 'Ram-7' } },
  m249:  { type: 'mg',      mult: 0.9,  name: { ru: 'Ливень-249', en: 'Downpour-249' } },
  neg:   { type: 'mg',      mult: 0.9,  name: { ru: 'Шквал', en: 'Squall' } },
  // Ножи
  kar:   { type: 'knife',   mult: 2.2,  star: true, name: { ru: 'Керамбит', en: 'Karambit' } },
  bfly:  { type: 'knife',   mult: 2.0,  star: true, name: { ru: 'Нож-бабочка', en: 'Balisong' } },
  m9:    { type: 'knife',   mult: 1.9,  star: true, name: { ru: 'Штык-нож М9', en: 'M9 Bayonet' } },
  talon: { type: 'knife',   mult: 1.8,  star: true, name: { ru: 'Ястребиный клюв', en: 'Hawkbill' } },
  skel:  { type: 'knife',   mult: 1.7,  star: true, name: { ru: 'Скелетный нож', en: 'Skeleton Knife' } },
  bay:   { type: 'knife',   mult: 1.5,  star: true, name: { ru: 'Штык-нож', en: 'Bayonet' } },
  classic: { type: 'knife', mult: 1.45, star: true, name: { ru: 'Классический нож', en: 'Classic Knife' } },
  kukri: { type: 'knife',   mult: 1.4,  star: true, name: { ru: 'Кукри', en: 'Kukri' } },
  flip:  { type: 'knife',   mult: 1.35, star: true, name: { ru: 'Складной нож', en: 'Flip Knife' } },
  nomad: { type: 'knife',   mult: 1.3,  star: true, name: { ru: 'Кочевник', en: 'Nomad Knife' } },
  stil:  { type: 'knife',   mult: 1.25, star: true, name: { ru: 'Стилет', en: 'Stiletto' } },
  para:  { type: 'knife',   mult: 1.1,  star: true, name: { ru: 'Паракордовый нож', en: 'Paracord Knife' } },
  bear:  { type: 'knife',   mult: 1.1,  star: true, name: { ru: 'Медвежий нож', en: 'Grizzly Knife' } },
  falc:  { type: 'knife',   mult: 1.1,  star: true, name: { ru: 'Фальшион', en: 'Falchion' } },
  surv:  { type: 'knife',   mult: 1.05, star: true, name: { ru: 'Нож выживания', en: 'Survival Knife' } },
  bowie: { type: 'knife',   mult: 1.05, star: true, name: { ru: 'Нож Боуи', en: 'Bowie Knife' } },
  hunt:  { type: 'knife',   mult: 1.0,  star: true, name: { ru: 'Охотничий нож', en: 'Hunting Knife' } },
  nav:   { type: 'knife',   mult: 0.95, star: true, name: { ru: 'Наваха', en: 'Navaja' } },
  gut:   { type: 'knife',   mult: 0.9,  star: true, name: { ru: 'Нож с крюком', en: 'Gut Knife' } },
  push:  { type: 'knife',   mult: 0.85, star: true, name: { ru: 'Тычковые ножи', en: 'Push Daggers' } },
  // Перчатки
  glsp:  { type: 'gloves',  mult: 1.8,  star: true, name: { ru: 'Спортивные перчатки', en: 'Athletic Gloves' } },
  gltc:  { type: 'gloves',  mult: 1.4,  star: true, name: { ru: 'Тактические перчатки', en: 'Tactical Gloves' } },
  glmo:  { type: 'gloves',  mult: 1.35, star: true, name: { ru: 'Мотоперчатки', en: 'Moto Gloves' } },
  gldr:  { type: 'gloves',  mult: 1.3,  star: true, name: { ru: 'Водительские перчатки', en: 'Driver Gloves' } },
  glsh:  { type: 'gloves',  mult: 1.2,  star: true, name: { ru: 'Штурмовые перчатки', en: 'Assault Gloves' } },
  glwr:  { type: 'gloves',  mult: 1.1,  star: true, name: { ru: 'Обмотки', en: 'Hand Wraps' } },
};

// kind — способ генерации текстуры (см. art_tex.js), c — цвета, gloss — сила блика (0..1)
const FINISHES = {
  plain:    { kind: 'gloss',    c: ['#4a4f57', '#2a2d33'], gloss: 0.2, mult: 0.8, name: { ru: 'Заводская окраска', en: 'Factory Coat' } },
  urban:    { kind: 'camo',     c: ['#6b7079', '#3e434b', '#9aa0a8', '#24272c'], mult: 0.9, name: { ru: 'Городской камуфляж', en: 'Urban Camo' } },
  forest:   { kind: 'camo',     c: ['#58653a', '#33401f', '#8a8550', '#1f2614'], mult: 0.9, name: { ru: 'Лесной камуфляж', en: 'Woodland' } },
  sand:     { kind: 'camo',     c: ['#c2a878', '#8f7449', '#e3d2a8', '#5e4a2c'], mult: 0.9, name: { ru: 'Песчаная буря', en: 'Sandstorm' } },
  arctic:   { kind: 'camo',     c: ['#e8eef3', '#a8b9c9', '#ffffff', '#6f8396'], mult: 1.0, name: { ru: 'Арктика', en: 'Arctic' } },
  carbon:   { kind: 'carbon',   c: ['#15171b', '#3a3f48'], gloss: 0.6, mult: 1.0, name: { ru: 'Карбон', en: 'Carbon' } },
  rust:     { kind: 'noise',    c: ['#8a4a22', '#c46c34', '#3e1d0c'], mult: 0.85, name: { ru: 'Ржавчина', en: 'Rust' } },
  navy:     { kind: 'stripes',  c: ['#1d3766', '#e8edf5'], gloss: 0.35, mult: 1.0, name: { ru: 'Морской', en: 'Navy' } },
  cherry:   { kind: 'gloss',    c: ['#e3243d', '#6e0b1a'], gloss: 0.9, mult: 1.1, name: { ru: 'Вишнёвый лак', en: 'Cherry Lacquer' } },
  mint:     { kind: 'gloss',    c: ['#8fefcf', '#2b8f70'], gloss: 0.7, mult: 1.0, name: { ru: 'Мятный', en: 'Mint' } },
  tiger:    { kind: 'tiger',    c: ['#f28c18', '#140d05', '#ffc061'], mult: 1.3, name: { ru: 'Тигровый', en: 'Tiger' } },
  zebra:    { kind: 'tiger',    c: ['#f2f2f2', '#121212', '#ffffff'], mult: 1.1, name: { ru: 'Зебра', en: 'Zebra' } },
  neon:     { kind: 'grad',     c: ['#ff2fb3', '#7a3cff', '#19e6ff'], gloss: 0.8, mult: 1.3, name: { ru: 'Неоновый всплеск', en: 'Neon Rush' } },
  sunset:   { kind: 'grad',     c: ['#ffb02e', '#ff4f5e', '#5b26b0'], gloss: 0.7, mult: 1.2, name: { ru: 'Закат', en: 'Sunset' } },
  aurora:   { kind: 'grad',     c: ['#2bffb0', '#2b8dff', '#a24bff'], gloss: 0.8, mult: 1.4, name: { ru: 'Северное сияние', en: 'Aurora' } },
  toxic:    { kind: 'hex',      c: ['#111a0c', '#8dff2b'], mult: 1.2, name: { ru: 'Токсин', en: 'Toxin' } },
  honey:    { kind: 'hex',      c: ['#3d2600', '#ffc42b'], mult: 1.2, name: { ru: 'Соты', en: 'Honeycomb' } },
  digital:  { kind: 'pixel',    c: ['#2a4a7a', '#6fa0e0', '#16294a', '#9cc2f0'], mult: 1.0, name: { ru: 'Цифра', en: 'Digital' } },
  retro:    { kind: 'pixel',    c: ['#ff5c8a', '#ffd23f', '#2ec4b6', '#3d2a6b'], mult: 1.2, name: { ru: 'Ретро-пиксель', en: 'Retro Pixel' } },
  marble:   { kind: 'marble',   c: ['#14104a', '#b33bff', '#ffd1f4', '#3a8bff'], gloss: 0.9, mult: 1.5, name: { ru: 'Мраморный вихрь', en: 'Marble Swirl' } },
  fade:     { kind: 'grad',     c: ['#ffe14a', '#ff5fa2', '#7d4dff'], gloss: 1.0, mult: 1.6, name: { ru: 'Градиент', en: 'Gradient' } },
  ocean:    { kind: 'waves',    c: ['#06284a', '#1590c0', '#a8ecff'], gloss: 0.5, mult: 1.2, name: { ru: 'Глубина', en: 'Deep Sea' } },
  lava:     { kind: 'cracks',   c: ['#140906', '#ff4d12', '#ffd23a'], mult: 1.4, name: { ru: 'Лава', en: 'Lava' } },
  gilded:   { kind: 'metal',    c: ['#fff3b8', '#d8a21c', '#6e4a00'], gloss: 1.0, mult: 1.6, name: { ru: 'Позолота', en: 'Gilded' } },
  chrome:   { kind: 'metal',    c: ['#ffffff', '#a3adb8', '#363c46'], gloss: 1.0, mult: 1.3, name: { ru: 'Хром', en: 'Chrome' } },
  frost:    { kind: 'grad',     c: ['#ffffff', '#9fe3ff', '#2f7fd0'], gloss: 0.9, mult: 1.3, name: { ru: 'Ледяной клык', en: 'Ice Fang' } },
  scales:   { kind: 'scales',   c: ['#3d0808', '#c8281f', '#ffb02e'], gloss: 0.6, mult: 1.5, name: { ru: 'Драконья чешуя', en: 'Dragon Scale' } },
  galaxy:   { kind: 'stars',    c: ['#07051a', '#5b2bbf', '#ff5fd0', '#ffffff'], gloss: 0.7, mult: 1.7, name: { ru: 'Галактика', en: 'Galaxy' } },
  cyber:    { kind: 'stripes',  c: ['#ffd400', '#111111'], gloss: 0.4, mult: 1.2, name: { ru: 'Киберпанк', en: 'Cyberpunk' } },
  sakura:   { kind: 'dots',     c: ['#ffe3ef', '#ff6fa8', '#ffffff', '#c73b7a'], gloss: 0.5, mult: 1.2, name: { ru: 'Сакура', en: 'Sakura' } },
  damascus: { kind: 'damascus', c: ['#d4d8de', '#5d636b', '#23272d'], gloss: 0.8, mult: 1.45, name: { ru: 'Дамасская сталь', en: 'Damascus' } },
  temper:   { kind: 'patina',   c: ['#1f46ff', '#9a3cff', '#e8ad3c', '#8a9099'], gloss: 0.9, mult: 1.5, name: { ru: 'Калёная сталь', en: 'Heat Tempered' } },
  proto:    { kind: 'panel',    c: ['#eceff3', '#ff7a1a', '#1b1d22'], gloss: 0.5, mult: 1.35, name: { ru: 'Прототип', en: 'Prototype' } },
  splash:   { kind: 'splatter', c: ['#20232a', '#ff3d7f', '#2de0ff'], gloss: 0.4, mult: 1.15, name: { ru: 'Клякса', en: 'Splash' } },
  circuit:  { kind: 'circuit',  c: ['#07140f', '#2bff9a', '#0f3d2a'], gloss: 0.3, mult: 1.25, name: { ru: 'Микросхема', en: 'Circuitry' } },
  jungle:   { kind: 'camo',     c: ['#3f5a2a', '#24361a', '#6f8a3c', '#141f0e'], mult: 0.95, name: { ru: 'Джунгли', en: 'Jungle' } },
  midnight: { kind: 'camo',     c: ['#2a3550', '#161d2e', '#475a80', '#0b0f19'], mult: 1.0, name: { ru: 'Полночь', en: 'Midnight' } },
  bronze:   { kind: 'metal',    c: ['#ffd9a8', '#b8763a', '#4a2a10'], gloss: 0.9, mult: 1.1, name: { ru: 'Бронза', en: 'Bronze' } },
  glacier:  { kind: 'waves',    c: ['#0d3a5c', '#5fc4e8', '#eafaff'], gloss: 0.6, mult: 1.2, name: { ru: 'Ледник', en: 'Glacier' } },
  scorch:   { kind: 'grad',     c: ['#ffe36b', '#ff7a1a', '#c4161c'], gloss: 0.8, mult: 1.3, name: { ru: 'Пекло', en: 'Scorch' } },
  amethyst: { kind: 'grad',     c: ['#f0b3ff', '#8a2be2', '#1d0a3a'], gloss: 0.8, mult: 1.3, name: { ru: 'Аметист', en: 'Amethyst' } },
  garnet:   { kind: 'metal',    c: ['#ffb3c1', '#d1123f', '#4a0414'], gloss: 1.0, mult: 1.35, name: { ru: 'Гранат', en: 'Garnet' } },
  cobalt:   { kind: 'metal',    c: ['#b8d4ff', '#1f5fe0', '#071a4a'], gloss: 1.0, mult: 1.35, name: { ru: 'Кобальт', en: 'Cobalt' } },
  malachite:{ kind: 'metal',    c: ['#b8ffd9', '#12a35a', '#03301a'], gloss: 1.0, mult: 1.35, name: { ru: 'Малахит', en: 'Malachite' } },
  // Раскраски реликвий
  dragon:   { kind: 'flame',    c: ['#160302', '#a3150b', '#ff5a14', '#ffc93c'], gloss: 0.75, mult: 1.8, name: { ru: 'Драконье пламя', en: 'Dragonfire' } },
  opal:     { kind: 'opal',     c: ['#06070d', '#17e3c4', '#3b6bff', '#ff4fd8', '#ffb340'], gloss: 1.0, mult: 1.9, name: { ru: 'Чёрный опал', en: 'Black Opal' } },
  emperor:  { kind: 'filigree', c: ['#fff1b0', '#d9a520', '#6b4300', '#c0182f', '#2f6bff'], gloss: 1.0, mult: 2.0, name: { ru: 'Император', en: 'Emperor' } },
  crystal:  { kind: 'crystal',  c: ['#f4fbff', '#a6dcff', '#3f74b0', '#ffffff'], gloss: 1.0, mult: 2.2, name: { ru: 'Алмаз', en: 'Diamond' } },
  // Новые раскраски (узоры рисуют генераторы из js/tex_*.js; пока генератора нет — глянцевая заливка)
  webred:     { kind: 'web', c: ['#120707', '#d8202a', '#ff6a6a'], gloss: 0.4, mult: 1.45, name: { ru: 'Паутина', en: 'Spiderweb' } },
  webice:     { kind: 'web', c: ['#0b1c2c', '#cfefff', '#6fc7ff'], gloss: 0.5, mult: 1.3, name: { ru: 'Иней', en: 'Hoarfrost Web' } },
  storm:      { kind: 'lightning', c: ['#0d0820', '#7a4dff', '#e8dcff'], gloss: 0.6, mult: 1.5, name: { ru: 'Гроза', en: 'Thunderstorm' } },
  livewire:   { kind: 'lightning', c: ['#121212', '#ffd400', '#fff6b0'], gloss: 0.5, mult: 1.35, name: { ru: 'Под напряжением', en: 'Live Wire' } },
  varnish:    { kind: 'wood', c: ['#5a3418', '#8a5a2e', '#2e1a0b'], gloss: 0.55, mult: 0.95, name: { ru: 'Лакированное дерево', en: 'Varnished Wood' } },
  plywood:    { kind: 'wood', c: ['#3a3f2a', '#7a5a3a', '#c8a060', '#2a2018'], gloss: 0.45, mult: 1.1, name: { ru: 'Слоистое дерево', en: 'Layered Wood' } },
  netting:    { kind: 'mesh', c: ['#4a4a36', '#2a2a1e', '#8a8a62'], gloss: 0.2, mult: 0.85, name: { ru: 'Маскировочная сеть', en: 'Camo Net' } },
  comic:      { kind: 'halftone', c: ['#ffdf3a', '#e8203a', '#101010', '#ffffff'], gloss: 0.5, mult: 1.3, name: { ru: 'Комикс', en: 'Comic' } },
  popart:     { kind: 'halftone', c: ['#2ad0ff', '#ff3fa0', '#101010', '#fff4c0'], gloss: 0.5, mult: 1.45, name: { ru: 'Поп-арт', en: 'Pop Art' } },
  tags:       { kind: 'graffiti', c: ['#2a2d33', '#ff4f8b', '#3dffb5', '#ffd23f'], gloss: 0.4, mult: 1.3, name: { ru: 'Граффити', en: 'Graffiti' } },
  street:     { kind: 'graffiti', c: ['#d8d2c4', '#1a1a1a', '#ff6a1a', '#2a7fff'], gloss: 0.35, mult: 1.15, name: { ru: 'Улица', en: 'Street Art' } },
  schematic:  { kind: 'blueprint', c: ['#0f3a78', '#d8ecff', '#5a9ee8'], gloss: 0.3, mult: 1.1, name: { ru: 'Чертёж', en: 'Schematic' } },
  topo:       { kind: 'topo', c: ['#2a3a24', '#c8d89a', '#5a7a3a'], gloss: 0.3, mult: 1, name: { ru: 'Топография', en: 'Topography' } },
  thermal:    { kind: 'topo', c: ['#1a0040', '#ff2a6a', '#ffd23f', '#2a8fff'], gloss: 0.5, mult: 1.45, name: { ru: 'Тепловизор', en: 'Thermal' } },
  python:     { kind: 'snake', c: ['#3a3020', '#c8b07a', '#1a140a'], gloss: 0.5, mult: 1.3, name: { ru: 'Питон', en: 'Python' } },
  mamba:      { kind: 'snake', c: ['#0f2a14', '#5fd068', '#0a140a'], gloss: 0.5, mult: 1.3, name: { ru: 'Мамба', en: 'Mamba' } },
  leopard:    { kind: 'leopard', c: ['#d8a85a', '#2a1a0a', '#f0d090'], gloss: 0.35, mult: 1.15, name: { ru: 'Леопард', en: 'Leopard' } },
  blackleo:   { kind: 'leopard', c: ['#2a2a2e', '#0a0a0c', '#5a5a62'], gloss: 0.4, mult: 1.25, name: { ru: 'Чёрный леопард', en: 'Black Leopard' } },
  goldfish:   { kind: 'koi', c: ['#f4f0e8', '#ff5a1a', '#101418', '#2a6aff'], gloss: 0.6, mult: 1.5, name: { ru: 'Золотые рыбки', en: 'Goldfish' } },
  bloodmoon:  { kind: 'prism', c: ['#1a0004', '#ff1a3a', '#ff8aa0', '#5a000c'], gloss: 1, mult: 1.75, name: { ru: 'Кровавая луна', en: 'Blood Moon' } },
  polarnight: { kind: 'prism', c: ['#000a20', '#1a6aff', '#9ad0ff', '#001a5a'], gloss: 1, mult: 1.75, name: { ru: 'Полярная ночь', en: 'Polar Night' } },
  jadepool:   { kind: 'prism', c: ['#001a0c', '#1aff7a', '#b0ffd8', '#00401a'], gloss: 1, mult: 1.8, name: { ru: 'Нефритовый омут', en: 'Jade Pool' } },
  obsidian:   { kind: 'prism', c: ['#05030c', '#5a3a8a', '#c8b0ff', '#1a1030'], gloss: 1, mult: 1.7, name: { ru: 'Обсидиан', en: 'Obsidian' } },
  acidwash:   { kind: 'acid', c: ['#b8bec6', '#3a4048', '#e8ecf0'], gloss: 0.8, mult: 1.3, name: { ru: 'Кислотное травление', en: 'Acid Wash' } },
  chased:     { kind: 'scroll', c: ['#d8dee6', '#5a6270', '#ffffff'], gloss: 0.9, mult: 1.5, name: { ru: 'Чеканка', en: 'Chased Silver' } },
  rosewindow: { kind: 'stained', c: ['#101010', '#ff3a3a', '#3a7aff', '#ffd23f', '#3dff8a'], gloss: 0.7, mult: 1.45, name: { ru: 'Витраж', en: 'Rose Window' } },
  icecrack:   { kind: 'ice', c: ['#d8f4ff', '#5ab8f0', '#ffffff', '#1a4a7a'], gloss: 0.9, mult: 1.45, name: { ru: 'Трещины льда', en: 'Cracked Ice' } },
  smoke:      { kind: 'smoke', c: ['#0c0c10', '#5a5a6a', '#c8c8d8'], gloss: 0.5, mult: 1.15, name: { ru: 'Дым', en: 'Smoke' } },
  baroque:    { kind: 'damask', c: ['#2a0a14', '#c8a050', '#5a1a2a'], gloss: 0.7, mult: 1.45, name: { ru: 'Барокко', en: 'Baroque' } },
  kintsugi:   { kind: 'kintsugi', c: ['#141414', '#ffd36b', '#2a2a2a'], gloss: 0.8, mult: 1.7, name: { ru: 'Кинцуги', en: 'Kintsugi' } },
  kevlar:     { kind: 'kevlar', c: ['#3a3420', '#c8b060', '#1a160a'], gloss: 0.5, mult: 1.1, name: { ru: 'Кевлар', en: 'Kevlar' } },
  hazard:     { kind: 'hazard', c: ['#ffd400', '#101010', '#ff6a00'], gloss: 0.4, mult: 0.95, name: { ru: 'Опасность', en: 'Hazard' } },
  titanium:   { kind: 'anodized', c: ['#3a2aff', '#ff3aa0', '#ffd23f', '#3dffd0'], gloss: 0.9, mult: 1.5, name: { ru: 'Анодированный титан', en: 'Anodized Titanium' } },
  firetribal: { kind: 'tribal', c: ['#0a0a0a', '#ff5a00', '#ffd23f'], gloss: 0.5, mult: 1.3, name: { ru: 'Огненный трайбл', en: 'Fire Tribal' } },
  // ✧ Артефакты 100М+ (уровень 8): «Королевский» — только в одноимённом кейсе, остальные — в кейсах раздела артефактов
  royal:      { kind: 'royal', c: ['#2a0a4a', '#ffd36b', '#fff1b0', '#8a3ad0', '#ff3a6a'], gloss: 1, mult: 3, excl: true, name: { ru: 'Королевский', en: 'Royal' } },
  supernova:  { kind: 'supernova', c: ['#05020c', '#ff4fd8', '#ffe6a0', '#3dc8ff'], gloss: 1, mult: 2.8, ultra: true, name: { ru: 'Сверхновая', en: 'Supernova' } },
  blackhole:  { kind: 'blackhole', c: ['#000000', '#ff9a1a', '#fff0c0', '#6a2aff'], gloss: 1, mult: 2.7, ultra: true, name: { ru: 'Чёрная дыра', en: 'Black Hole' } },
  liquidgold: { kind: 'liquidgold', c: ['#3a2400', '#ffd36b', '#fff8d8', '#a86a00'], gloss: 1, mult: 2.6, ultra: true, name: { ru: 'Жидкое золото', en: 'Liquid Gold' } },
  abyss:      { kind: 'abyss', c: ['#020814', '#1affd8', '#8a3aff', '#e8ffff'], gloss: 1, mult: 2.5, ultra: true, name: { ru: 'Кристалл бездны', en: 'Abyss Crystal' } },
};

const SECTIONS = [
  { id: 'ultra',       name: { ru: 'Артефакты 100М+', en: 'Artifacts 100M+' } },
  { id: 'starter',     name: { ru: 'Стартовые', en: 'Starter' } },
  { id: 'weapons',     name: { ru: 'Оружейные', en: 'Weapon cases' } },
  { id: 'collections', name: { ru: 'Коллекции', en: 'Collections' } },
  { id: 'knives',      name: { ru: 'Ножевые', en: 'Knife cases' } },
  { id: 'gloves',      name: { ru: 'Перчатки', en: 'Gloves' } },
  { id: 'premium',     name: { ru: 'Премиум', en: 'Premium' } },
  { id: 'relics',      name: { ru: 'Реликвии 1М+', en: 'Relics 1M+' } },
  { id: 'series',      name: { ru: 'Серии', en: 'Series' } },
];

// art: [основной цвет, акцент, форма эмблемы, оружие на эмблеме, раскраска эмблемы?]
// paint — раскраска самого ящика (необязательно).
// items: "оружие_раскраска:редкость". mode 'inv' — дорогие выпадают реже (вес ~ 1/цена²).
const CASES_RAW = [
  { id: 'rookie', sec: 'starter', name: { ru: 'Новобранец', en: 'Rookie' }, art: ['#5b636e', '#f2a83b', 'diamond', 'p17'],
    items: 'p17_plain:0 smg10_urban:0 sg12_sand:0 psd_forest:0 p50_urban:1 smg45_digital:1 ar4_forest:1 ar47_rust:2 sr08_arctic:2 p17_neon:3 ar47_tiger:4' },
  { id: 'patrol', sec: 'starter', name: { ru: 'Патруль', en: 'Patrol' }, art: ['#2c4566', '#79c8ff', 'shield', 'ar4'],
    items: 'p17_urban:0 sg12_plain:0 smg10_sand:0 psd_navy:1 smg45_urban:1 sr08_forest:1 ar4_digital:2 p50_cherry:2 smg10_retro:3 ar4_carbon:3 sr338_navy:4 ar47_sunset:5' },
  { id: 'garage', sec: 'starter', name: { ru: 'Гараж', en: 'Garage' }, art: ['#6a4a2c', '#ffb54a', 'hex', 'sg12'],
    items: 'sg12_rust:0 p17_sand:0 smg45_plain:0 ar47_urban:1 p50_mint:1 smg10_carbon:2 sr08_cyber:2 psd_honey:3 ar4_cyber:4 sr338_lava:5' },

  { id: 'pistols', sec: 'weapons', name: { ru: 'Пистолетный', en: 'Sidearms' }, art: ['#393d45', '#ff6a3d', 'circle', 'p50'],
    items: 'p17_urban:0 psd_plain:0 p50_sand:1 p17_digital:1 psd_cherry:2 p50_carbon:2 p17_tiger:3 psd_aurora:3 p50_gilded:4 p50_marble:5' },
  { id: 'rifles', sec: 'weapons', name: { ru: 'Штурмовой', en: 'Assault' }, art: ['#46552d', '#d6ff6a', 'diamond', 'ar47'],
    items: 'ar4_plain:0 ar47_sand:0 ar4_urban:1 ar47_forest:1 ar4_mint:2 ar47_digital:2 ar4_neon:3 ar47_cyber:3 ar4_ocean:4 ar47_honey:4 ar47_fade:5 ar4_galaxy:5' },
  { id: 'snipers', sec: 'weapons', name: { ru: 'Снайперский', en: 'Marksman' }, art: ['#202c3b', '#62c6ff', 'circle', 'sr338'],
    items: 'sr08_plain:0 sr08_sand:0 sr338_urban:1 sr08_navy:1 sr338_carbon:2 sr08_mint:2 sr338_tiger:3 sr08_frost:3 sr338_sunset:4 sr338_galaxy:5' },
  { id: 'cqb', sec: 'weapons', name: { ru: 'Ближний бой', en: 'Close Quarters' }, art: ['#5c2a2a', '#ffcd66', 'shield', 'smg10'],
    items: 'sg12_urban:0 smg10_plain:0 smg45_forest:0 sg12_navy:1 smg10_digital:1 smg45_cherry:2 sg12_carbon:2 smg10_toxic:3 sg12_tiger:3 smg45_aurora:4 sg12_gilded:5' },

  { id: 'neon', sec: 'collections', paint: 'neon', name: { ru: 'Неон', en: 'Neon' }, art: ['#26124a', '#ff35b8', 'hex', 'ar4', 'neon'],
    items: 'psd_retro:1 sg12_retro:1 smg45_cyber:2 sr08_cyber:2 p50_neon:3 ar4_neon:3 ar47_aurora:4 sr338_neon:5 kar_neon:6' },
  { id: 'elements', sec: 'collections', paint: 'lava', name: { ru: 'Стихии', en: 'Elements' }, art: ['#1e3a4a', '#ff6a2a', 'circle', 'ar47', 'frost'],
    items: 'p17_frost:1 smg10_ocean:1 sg12_lava:2 psd_toxic:2 ar4_frost:3 sr08_ocean:3 p50_lava:4 ar47_toxic:4 sr338_frost:5 bay_lava:6' },
  { id: 'metal', sec: 'collections', paint: 'carbon', name: { ru: 'Драгметалл', en: 'Precious Metal' }, art: ['#3f444c', '#e9c25a', 'diamond', 'sr338', 'gilded'],
    items: 'p17_chrome:1 smg45_carbon:1 sg12_chrome:2 sr08_carbon:2 psd_gilded:3 ar4_chrome:3 sr338_chrome:4 ar47_gilded:5 stil_gilded:6 kar_chrome:6' },
  { id: 'wild', sec: 'collections', paint: 'tiger', name: { ru: 'Дикая природа', en: 'Wildlife' }, art: ['#3b4a22', '#1a1208', 'shield', 'p50', 'scales'],
    items: 'p17_zebra:1 smg10_tiger:1 sg12_zebra:2 psd_sakura:2 ar4_zebra:3 sr08_tiger:3 p50_scales:4 ar47_zebra:4 sr338_scales:5 hunt_tiger:6 bfly_scales:6' },
  { id: 'lab', sec: 'collections', paint: 'proto', name: { ru: 'Лаборатория', en: 'Laboratory' }, art: ['#e4e7eb', '#ff7a1a', 'hex', 'smg45', 'circuit'],
    items: 'psd_splash:1 smg45_circuit:1 sg12_proto:2 p17_circuit:2 sr08_proto:3 smg10_splash:3 ar4_proto:4 p50_circuit:4 ar47_proto:5 sr338_circuit:5 stil_damascus:6' },

  { id: 'k_hunt', sec: 'knives', mode: 'inv', name: { ru: 'Охотник', en: 'Hunter' }, art: ['#2f3d33', '#d7dee2', 'diamond', 'hunt'],
    items: 'hunt_plain:6 hunt_urban:6 hunt_forest:6 hunt_rust:6 hunt_tiger:6 hunt_damascus:6 hunt_ocean:6 hunt_fade:6' },
  { id: 'k_bay', sec: 'knives', mode: 'inv', name: { ru: 'Штык', en: 'Bayonet' }, art: ['#24323f', '#d7dee2', 'diamond', 'bay'],
    items: 'bay_plain:6 bay_urban:6 bay_carbon:6 bay_lava:6 bay_temper:6 bay_frost:6 bay_marble:6 bay_fade:6' },
  { id: 'k_kar', sec: 'knives', mode: 'inv', name: { ru: 'Коготь', en: 'Claw' }, art: ['#13424a', '#d7dee2', 'diamond', 'kar'],
    items: 'kar_plain:6 kar_forest:6 kar_carbon:6 kar_chrome:6 kar_damascus:6 kar_neon:6 kar_marble:6 kar_fade:6 kar_galaxy:6' },
  { id: 'k_bfly', sec: 'knives', mode: 'inv', name: { ru: 'Бабочка', en: 'Butterfly' }, art: ['#2b2350', '#d7dee2', 'diamond', 'bfly'],
    items: 'bfly_urban:6 bfly_rust:6 bfly_navy:6 bfly_temper:6 bfly_scales:6 bfly_aurora:6 bfly_fade:6 bfly_galaxy:6' },

  { id: 'gloves', sec: 'gloves', mode: 'inv', name: { ru: 'Перчаточный', en: 'Gloves' }, art: ['#4a1f22', '#ffd36b', 'shield', 'glsp', 'cherry'],
    items: 'glsp_urban:6 glsp_carbon:6 glsp_neon:6 glsp_marble:6 gltc_forest:6 gltc_sand:6 gltc_cyber:6 gltc_galaxy:6' },
  { id: 'starfall', sec: 'premium', mode: 'inv', paint: 'galaxy', name: { ru: 'Звездопад', en: 'Starfall' }, art: ['#160f33', '#c9b4ff', 'hex', 'kar', 'galaxy'],
    items: 'ar4_galaxy:5 sr338_galaxy:5 ar47_fade:5 p50_marble:5 stil_galaxy:6 kar_galaxy:6 bfly_galaxy:6 gltc_galaxy:6' },
  { id: 'regalia', sec: 'premium', mode: 'inv', paint: 'gilded', name: { ru: 'Регалии', en: 'Regalia' }, art: ['#d9c27a', '#2a1d05', 'shield', 'bfly', 'fade'],
    items: 'ar47_gilded:5 stil_gilded:6 kar_temper:6 kar_fade:6 bfly_fade:6 kar_galaxy:6 bfly_galaxy:6 glsp_marble:6 kar_marble:6' },

  // Королевский — самый дорогой кейс игры: только ✧ артефакты с эксклюзивной раскраской «Королевский»
  { id: 'royal', sec: 'ultra', mode: 'inv', pow: 0.9, paint: 'royal', name: { ru: 'Королевский', en: 'Royal' }, art: ['#4a2577', '#ffd36b', 'shield', 'kar', 'royal'],
    items: 'kar_royal:8 bfly_royal:8 m9_royal:8 talon_royal:8 skel_royal:8 glsp_royal:8 ar47_royal:8 sr338_royal:8 ar4s_royal:8 bay_royal:8' },

  // Реликвии: pow — насколько резко падает шанс с ценой (вес ~ 1/цена^pow)
  { id: 'legends', sec: 'relics', mode: 'inv', pow: 1, paint: 'dragon', name: { ru: 'Арсенал легенд', en: 'Legends Arsenal' }, art: ['#2a0b08', '#ffb02e', 'shield', 'ar47', 'dragon'],
    items: 'ar47_fade:5 ar4_galaxy:5 sr338_galaxy:5 p50_marble:5 sr338_circuit:5 p50_emperor:7 ar4_crystal:7 ar47_dragon:7 ar47_emperor:7 sr338_dragon:7 sr338_opal:7' },
  { id: 'reliquary', sec: 'relics', mode: 'inv', pow: 1.4, paint: 'opal', name: { ru: 'Реликварий', en: 'Reliquary' }, art: ['#07080f', '#2ef2ff', 'hex', 'kar', 'crystal'],
    items: 'hunt_fade:6 bay_fade:6 kar_fade:6 bfly_galaxy:6 hunt_crystal:7 bay_dragon:7 stil_emperor:7 gltc_dragon:7 kar_dragon:7 kar_opal:7 bfly_opal:7 bfly_emperor:7 bfly_crystal:7 kar_crystal:7' },
  { id: 'k_stil', sec: 'knives', mode: 'inv', name: { ru: 'Стилет', en: 'Stiletto' }, art: ['#3a2a40', '#d7dee2', 'diamond', 'stil'],
    items: 'stil_gilded:6 stil_damascus:6 stil_galaxy:6' },
  { id: 'k_m9', sec: 'knives', mode: 'inv', name: { ru: 'Штык М9', en: 'M9' }, art: ['#30363f', '#d7dee2', 'diamond', 'm9'],
    items: 'm9_plain:6' },
  { id: 'k_talon', sec: 'knives', mode: 'inv', name: { ru: 'Клюв', en: 'Hawkbill' }, art: ['#3b2a22', '#d7dee2', 'diamond', 'talon'],
    items: 'talon_plain:6' },
  { id: 'k_skel', sec: 'knives', mode: 'inv', name: { ru: 'Скелет', en: 'Skeleton' }, art: ['#252a33', '#d7dee2', 'diamond', 'skel'],
    items: 'skel_plain:6' },
  { id: 'k_classic', sec: 'knives', mode: 'inv', name: { ru: 'Классика', en: 'Classic' }, art: ['#33322c', '#d7dee2', 'diamond', 'classic'],
    items: 'classic_plain:6' },
  { id: 'k_kukri', sec: 'knives', mode: 'inv', name: { ru: 'Кукри', en: 'Kukri' }, art: ['#2e3a2a', '#d7dee2', 'diamond', 'kukri'],
    items: 'kukri_plain:6' },
  { id: 'k_flip', sec: 'knives', mode: 'inv', name: { ru: 'Флип', en: 'Flip' }, art: ['#2a3446', '#d7dee2', 'diamond', 'flip'],
    items: 'flip_plain:6' },
  { id: 'k_nomad', sec: 'knives', mode: 'inv', name: { ru: 'Кочевник', en: 'Nomad' }, art: ['#43352a', '#d7dee2', 'diamond', 'nomad'],
    items: 'nomad_plain:6' },
  { id: 'k_para', sec: 'knives', mode: 'inv', name: { ru: 'Паракорд', en: 'Paracord' }, art: ['#33402e', '#d7dee2', 'diamond', 'para'],
    items: 'para_plain:6' },
  { id: 'k_bear', sec: 'knives', mode: 'inv', name: { ru: 'Медведь', en: 'Grizzly' }, art: ['#3d2f26', '#d7dee2', 'diamond', 'bear'],
    items: 'bear_plain:6' },
  { id: 'k_falc', sec: 'knives', mode: 'inv', name: { ru: 'Фальшион', en: 'Falchion' }, art: ['#2c2d3f', '#d7dee2', 'diamond', 'falc'],
    items: 'falc_plain:6' },
  { id: 'k_surv', sec: 'knives', mode: 'inv', name: { ru: 'Выживший', en: 'Survivor' }, art: ['#3a3f2a', '#d7dee2', 'diamond', 'surv'],
    items: 'surv_plain:6' },
  { id: 'k_bowie', sec: 'knives', mode: 'inv', name: { ru: 'Боуи', en: 'Bowie' }, art: ['#402a22', '#d7dee2', 'diamond', 'bowie'],
    items: 'bowie_plain:6' },
  { id: 'k_nav', sec: 'knives', mode: 'inv', name: { ru: 'Наваха', en: 'Navaja' }, art: ['#3c2436', '#d7dee2', 'diamond', 'nav'],
    items: 'nav_plain:6' },
  { id: 'k_gut', sec: 'knives', mode: 'inv', name: { ru: 'Крюк', en: 'Gut' }, art: ['#263a3f', '#d7dee2', 'diamond', 'gut'],
    items: 'gut_plain:6' },
  { id: 'k_push', sec: 'knives', mode: 'inv', name: { ru: 'Тычок', en: 'Push' }, art: ['#3a2626', '#d7dee2', 'diamond', 'push'],
    items: 'push_plain:6' },
  { id: 'gloves2', sec: 'gloves', mode: 'inv', name: { ru: 'Байкер', en: 'Biker' }, art: ['#2b2f38', '#ff7a3d', 'shield', 'glmo'],
    items: 'glmo_plain:6 gldr_plain:6' },
  { id: 'gloves3', sec: 'gloves', mode: 'inv', name: { ru: 'Ринг', en: 'Ring' }, art: ['#3a1f24', '#ff4f5e', 'shield', 'glwr'],
    items: 'glwr_plain:6 glsh_plain:6' },
  { id: 'treasury', sec: 'relics', mode: 'inv', pow: 1.4, paint: 'crystal', name: { ru: 'Сокровищница', en: 'Treasury' }, art: ['#0b1a24', '#7fe8ff', 'hex', 'm9', 'opal'],
    items: 'm9_crystal:7 talon_opal:7' },
  { id: 'trophies', sec: 'relics', mode: 'inv', pow: 1, paint: 'emperor', name: { ru: 'Трофеи', en: 'Trophies' }, art: ['#2a1508', '#ffcf5a', 'shield', 'aug', 'dragon'],
    items: 'aug_dragon:7 scar_emperor:7' },
];

// ---------- Полный каталог ----------
// Кроме предметов из кейсов выше, каталог дополняется до SKIN_TOTAL. Редкость нового
// предмета зависит от уровня раскраски (FIN_TIER); ножи и перчатки — всегда ★,
// раскраски реликвий — ✦. Новые предметы раскладываются по кейсам автоматически.
const SKIN_TOTAL = 1500;
// Первые 512 предметов собираются по старому правилу из старых видов оружия и раскрасок —
// так у игроков не пропадают предметы, выбитые до расширения каталога.
const OLD_TOTAL = 512;
const OLD_WEAPONS = ['p17', 'p50', 'psd', 'smg10', 'smg45', 'sg12', 'ar47', 'ar4', 'sr338', 'sr08', 'kar', 'bfly', 'bay', 'stil', 'hunt', 'glsp', 'gltc'];
const OLD_FINISHES = ['plain', 'urban', 'forest', 'sand', 'arctic', 'carbon', 'rust', 'navy', 'cherry', 'mint', 'tiger', 'zebra', 'neon', 'sunset',
  'aurora', 'toxic', 'honey', 'digital', 'retro', 'marble', 'fade', 'ocean', 'lava', 'gilded', 'chrome', 'frost', 'scales', 'galaxy', 'cyber',
  'sakura', 'damascus', 'temper', 'proto', 'splash', 'circuit', 'jungle', 'midnight', 'bronze', 'glacier', 'scorch', 'amethyst', 'garnet',
  'cobalt', 'malachite', 'dragon', 'opal', 'emperor', 'crystal'];
// Старые виды оружия получают по OLD_EXTRA новых раскрасок, остальное место — новым видам
const OLD_EXTRA = 5;
const FIN_TIER = {
  plain: 0, urban: 0, forest: 0, sand: 0,
  arctic: 1, rust: 1, navy: 1, digital: 1, jungle: 1, midnight: 1,
  carbon: 2, mint: 2, cherry: 2, zebra: 2, retro: 2, splash: 2, circuit: 2, bronze: 2,
  tiger: 3, cyber: 3, honey: 3, toxic: 3, sakura: 3, ocean: 3, frost: 3, proto: 3, glacier: 3,
  neon: 4, sunset: 4, aurora: 4, chrome: 4, scales: 4, lava: 4, scorch: 4, amethyst: 4, garnet: 4, cobalt: 4, malachite: 4,
  marble: 5, fade: 5, gilded: 5, galaxy: 5, damascus: 5, temper: 5,
  dragon: 7, opal: 7, emperor: 7, crystal: 7,
  // новые раскраски
  netting: 0,
  varnish: 1, topo: 1, hazard: 1,
  plywood: 2, street: 2, schematic: 2, leopard: 2, smoke: 2, kevlar: 2,
  webice: 3, livewire: 3, comic: 3, tags: 3, python: 3, mamba: 3, blackleo: 3, acidwash: 3, firetribal: 3,
  webred: 4, storm: 4, popart: 4, thermal: 4, goldfish: 4, chased: 4, rosewindow: 4, icecrack: 4, baroque: 4, titanium: 4,
  bloodmoon: 5, polarnight: 5, jadepool: 5, obsidian: 5, kintsugi: 5,
  // ✧ артефакты
  royal: 8, supernova: 8, blackhole: 8, liquidgold: 8, abyss: 8,
};
// Семейства раскрасок — по ним собираются кейсы раздела «Серии»
const FIN_FAMILY = {
  plain: 'field', urban: 'field', forest: 'field', sand: 'field', arctic: 'field', jungle: 'field', midnight: 'field', digital: 'field', navy: 'field',
  chrome: 'metal', gilded: 'metal', bronze: 'metal', garnet: 'metal', cobalt: 'metal', malachite: 'metal', carbon: 'metal', damascus: 'metal', temper: 'metal', rust: 'metal',
  neon: 'neon', sunset: 'neon', aurora: 'neon', fade: 'neon', scorch: 'neon', amethyst: 'neon', retro: 'neon', cyber: 'neon', circuit: 'neon', toxic: 'neon', proto: 'neon',
  tiger: 'wild', zebra: 'wild', scales: 'wild', honey: 'wild', sakura: 'wild', mint: 'wild', cherry: 'wild',
  lava: 'elem', frost: 'elem', glacier: 'elem', ocean: 'elem', marble: 'elem', galaxy: 'elem', splash: 'elem',
  webred: 'wild', python: 'wild', mamba: 'wild', leopard: 'wild', blackleo: 'wild', goldfish: 'wild',
  webice: 'elem', storm: 'elem', bloodmoon: 'elem', polarnight: 'elem', jadepool: 'elem', obsidian: 'elem', icecrack: 'elem', smoke: 'elem',
  livewire: 'neon', comic: 'neon', popart: 'neon', tags: 'neon', street: 'neon', schematic: 'neon', thermal: 'neon', rosewindow: 'neon', firetribal: 'neon',
  varnish: 'field', plywood: 'field', netting: 'field', topo: 'field', hazard: 'field',
  acidwash: 'metal', chased: 'metal', baroque: 'metal', kintsugi: 'metal', kevlar: 'metal', titanium: 'metal',
};
const SERIES_STYLE = {
  field: { art: ['#4b5638', '#d8e0a0'], names: [['Разведка', 'Recon'], ['Рубеж', 'Frontier'], ['Дозор', 'Watch'], ['Блокпост', 'Checkpoint'], ['Окоп', 'Trench']] },
  metal: { art: ['#3d4148', '#f0c75a'], names: [['Кузница', 'Forge'], ['Слиток', 'Ingot'], ['Сплав', 'Alloy'], ['Броня', 'Armor'], ['Наковальня', 'Anvil']] },
  neon:  { art: ['#231046', '#ff3fd0'], names: [['Импульс', 'Pulse'], ['Вспышка', 'Flash'], ['Сигнал', 'Signal'], ['Неоновая ночь', 'Neon Night'], ['Разряд', 'Discharge']] },
  wild:  { art: ['#3f2a14', '#ffb347'], names: [['Хищник', 'Predator'], ['Сафари', 'Safari'], ['Логово', 'Lair'], ['Клык', 'Fang'], ['Стая', 'Pack']] },
  elem:  { art: ['#14324a', '#62e0ff'], names: [['Шторм', 'Tempest'], ['Вулкан', 'Volcano'], ['Прилив', 'Tide'], ['Метель', 'Blizzard'], ['Туманность', 'Nebula']] },
};
const SERIES_SIZE = 14;
// Кейсы для новых видов оружия: свободные предметы раскладываются по темам, по THEME_SIZE в кейсе
const THEME_OF = {
  smg9: 'smgs', smg7: 'smgs', smg5: 'smgs', p90: 'smgs', bzn: 'smgs',
  xm: 'heavy', sawn: 'heavy', mag7: 'heavy', m249: 'heavy', neg: 'heavy',
  p2k: 'duel', p250: 'duel', p57: 'duel', tec: 'duel', cz: 'duel', duo: 'duel', r8: 'duel',
  ar4s: 'assault', gal: 'assault', fam: 'assault', sg5: 'assault', aug: 'assault',
  scar: 'longshot', g3: 'longshot',
};
const THEME_STYLE = {
  smgs: { art: ['#22343a', '#5ce0c6', 'hex'], alt: [['#2a2440', '#9b7bff'], ['#3a3322', '#ffd04a']], names: [['Скорострел', 'Rapid Fire'], ['Очередь', 'Burst'], ['Шквальный огонь', 'Suppression'], ['Трассер', 'Tracer'], ['Ближний круг', 'Close Circle'], ['Отдача', 'Recoil']] },
  heavy: { art: ['#3a2a1c', '#ff9a3d', 'shield'], alt: [['#26302a', '#7dff8a'], ['#33262c', '#ff5e7a']], names: [['Тяжёлый калибр', 'Heavy Caliber'], ['Картечь', 'Buckshot'], ['Лента', 'Ammo Belt'], ['Таран', 'Breacher'], ['Заслон', 'Bulwark'], ['Броня', 'Plating']] },
  duel: { art: ['#2f2438', '#ff6fb0', 'circle'], alt: [['#1f3038', '#55d0ff'], ['#382c1f', '#ffb347'], ['#262b33', '#e8eef5']], names: [['Дуэль', 'Duel'], ['Кобура', 'Holster'], ['Вестерн', 'Western'], ['Шериф', 'Sheriff'], ['Перестрелка', 'Shootout'], ['Секундант', 'Second']] },
  assault: { art: ['#2c3524', '#c8f05a', 'diamond'], alt: [['#35241f', '#ff7a3d'], ['#1f2a38', '#62c6ff']], names: [['Передовая', 'Frontline'], ['Рейд', 'Raid'], ['Десант', 'Airborne'], ['Плацдарм', 'Bridgehead'], ['Штурмовой отряд', 'Strike Team'], ['Прорыв', 'Breakthrough']] },
  longshot: { art: ['#1f2b3a', '#7ab8ff', 'circle'], alt: [['#2e2a22', '#f2d28a']], names: [['Дальний выстрел', 'Longshot'], ['Оптика', 'Optics'], ['Высота', 'High Ground'], ['Засада', 'Ambush']] },
};
const THEME_SIZE = 36;
// Артефакты 100М+: на каждую ультра-раскраску (FIN_TIER 8) — свой кейс с ножами, перчатками и лучшим огнестрелом.
// Только виды оружия с множителем от 1.3, поэтому каждый предмет дороже 100 000 000.
(function ultraCases() {
  const ULTRA_W = ['kar', 'bfly', 'm9', 'talon', 'skel', 'bay', 'classic', 'kukri', 'glsp', 'gltc', 'ar47', 'ar4s', 'sr338'];
  const MAINS = ['#1a0f2e', '#0c1f2a', '#2a1508', '#0f2418', '#2a0c1c', '#101828'];
  Object.keys(FINISHES).filter(function (f) { return FIN_TIER[f] === 8 && !FINISHES[f].excl; }).forEach(function (f, i) {
    let ws = ULTRA_W.filter(function (w) { return hash01('ultra:' + f + ':' + w) < 0.72; });
    if (ws.length < 5) ws = ws.concat(['kar', 'bfly', 'glsp', 'ar47', 'm9']).filter(function (w, k, a) { return a.indexOf(w) === k; });
    const c = FINISHES[f].c;
    CASES_RAW.push({
      id: 'ultra_' + f, sec: 'ultra', mode: 'inv', pow: 1.15, paint: f, name: FINISHES[f].name,
      art: [MAINS[i % MAINS.length], c[1] || c[0], ['hex', 'diamond', 'circle', 'shield'][i % 4], ws[0], f],
      items: ws.map(function (w) { return w + '_' + f + ':8'; }).join(' '),
    });
  });
})();

const FREE_CASE_ID = 'rookie';
const START_COINS = 20;
// Средняя отдача кейса без прокачки (доля от цены).
// С максимальной «Удачей» (+2.5%/ур.) и «Торговцем» (+1%/ур.) — не выше ~95%.
const CASE_RTP = 0.72;
const LUCK_PER_LVL = 0.025;
const SELL_PER_LVL = 0.01;
// Апгрейдер: шанс = ставка / цель * UPGRADE_EDGE, но не больше UPGRADE_MAX
const UPGRADE_EDGE = 0.95;
const UPGRADE_MAX = 0.8;
const INVENTORY_MAX = 300;

// ---------- Сборка каталога ----------
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

const round2 = (x) => Math.round(x * 100) / 100;

// «Магазинная» цена, всегда округлённая ВВЕРХ, чтобы отдача кейса не превышала CASE_RTP:
// 4.49, 8.99, 13, 27, 139, 1 499 …
function nicePrice(x) {
  let p;
  if (x < 2) { p = round2(Math.ceil(x * 10) / 10 - 0.01); if (p < x) p = round2(p + 0.1); }
  else if (x < 10) { p = round2(Math.ceil(x * 2) / 2 - 0.01); if (p < x) p = round2(p + 0.5); }
  else if (x < 100) p = Math.ceil(x);
  else if (x < 1000) { p = Math.ceil(x / 10) * 10 - 1; if (p < x) p += 10; }
  else { p = Math.ceil(x / 100) * 100 - 1; if (p < x) p += 100; }
  return p;
}

const SKINS = {};

function ensureSkin(key, r) {
  if (SKINS[key]) {
    if (SKINS[key].r !== r) console.warn('Skin rarity mismatch:', key);
    return SKINS[key];
  }
  const parts = key.split('_');
  const w = WEAPONS[parts[0]];
  const f = FINISHES[parts[1]];
  if (!w || !f) throw new Error('Unknown weapon/finish in ' + key);
  const value = Math.max(0.05, round2(RAR_BASE[r] * w.mult * f.mult * (0.9 + hash01(key) * 0.2)));
  SKINS[key] = { id: key, w: parts[0], f: parts[1], r: r, value: value };
  return SKINS[key];
}

// 1) Предметы из описанных вручную кейсов
CASES_RAW.forEach(function (c) {
  c.items.trim().split(/\s+/).forEach(function (tok) { const p = tok.split(':'); ensureSkin(p[0], Number(p[1])); });
});

// 2) Дополнить каталог до SKIN_TOTAL. Каждый раз берём вид оружия, у которого сейчас меньше
//    всего предметов, и следующую для него раскраску (порядок раскрасок задаёт хэш).
//    Сначала — до OLD_TOTAL старыми видами и раскрасками ровно как раньше, потом — всем остальным.
(function fillCatalog() {
  const count = {};
  Object.keys(SKINS).forEach(function (k) { const w = SKINS[k].w; count[w] = (count[w] || 0) + 1; });
  const isOldFin = {};
  OLD_FINISHES.forEach(function (f) { isOldFin[f] = 1; });
  // Очередь раскрасок вида оружия. relicMax — сколько раскрасок-реликвий можно огнестрелу (ножам — без ограничений в старом наборе)
  function queue(w, fins, limitStar) {
    const star = !!WEAPONS[w].star, gloves = WEAPONS[w].type === 'gloves';
    let list = fins.filter(function (f) {
      if (SKINS[w + '_' + f] || FIN_TIER[f] == null || FIN_TIER[f] >= 8 || FINISHES[f].excl) return false;
      return !(gloves && (f === 'damascus' || f === 'temper'));
    });
    if (!star || limitStar) { // не больше двух раскрасок-реликвий
      const rel = list.filter(function (f) { return FIN_TIER[f] === 7; })
        .sort(function (a, b) { return hash01(w + a) - hash01(w + b); }).slice(0, 2);
      list = list.filter(function (f) { return FIN_TIER[f] !== 7 || rel.indexOf(f) >= 0; });
    }
    list.sort(function (a, b) { return hash01('cat:' + w + ':' + a) - hash01('cat:' + w + ':' + b); });
    return { w: w, star: star, fins: list };
  }
  function fill(queues, total, cap) {
    while (Object.keys(SKINS).length < total) {
      let best = null;
      queues.forEach(function (q) {
        if (!q.fins.length || (cap && (count[q.w] || 0) >= cap[q.w])) return;
        if (!best || (count[q.w] || 0) < (count[best.w] || 0)) best = q;
      });
      if (!best) break;
      const f = best.fins.shift(), t = FIN_TIER[f];
      ensureSkin(best.w + '_' + f, t === 7 ? 7 : best.star ? 6 : t);
      count[best.w] = (count[best.w] || 0) + 1;
    }
  }
  // а) старый каталог: старые виды оружия × старые раскраски. Считаем только их — новые явные
  //    предметы (например, «Королевские») не должны сдвигать прежний порядок заполнения.
  (function () {
    const isOldW = {}, cnt = {};
    OLD_WEAPONS.forEach(function (w) { isOldW[w] = 1; });
    let tot = 0;
    Object.keys(SKINS).forEach(function (k) { const sk = SKINS[k]; if (isOldW[sk.w] && isOldFin[sk.f]) { cnt[sk.w] = (cnt[sk.w] || 0) + 1; tot++; } });
    const qs = OLD_WEAPONS.map(function (w) { return queue(w, OLD_FINISHES, false); });
    while (tot < OLD_TOTAL) {
      let best = null;
      qs.forEach(function (q) { if (q.fins.length && (!best || (cnt[q.w] || 0) < (cnt[best.w] || 0))) best = q; });
      if (!best) break;
      const f = best.fins.shift(), t = FIN_TIER[f];
      ensureSkin(best.w + '_' + f, t === 7 ? 7 : best.star ? 6 : t);
      cnt[best.w] = (cnt[best.w] || 0) + 1; count[best.w] = (count[best.w] || 0) + 1; tot++;
    }
  })();
  // б) новые раскраски для старых видов оружия
  const newFins = Object.keys(FINISHES).filter(function (f) { return !isOldFin[f]; });
  const cap = {};
  OLD_WEAPONS.forEach(function (w) { cap[w] = (count[w] || 0) + OLD_EXTRA; });
  fill(OLD_WEAPONS.map(function (w) { return queue(w, newFins, true); }), Object.keys(SKINS).length + OLD_WEAPONS.length * OLD_EXTRA, cap);
  // в) новые виды оружия — всеми раскрасками
  const isOld = {};
  OLD_WEAPONS.forEach(function (w) { isOld[w] = 1; });
  fill(Object.keys(WEAPONS).filter(function (w) { return !isOld[w]; }).map(function (w) { return queue(w, Object.keys(FINISHES), true); }), SKIN_TOTAL);
})();

// 3) У каждого предмета своя цена: совпадения сдвигаем на копейку (от 100 000 — на монету)
(function uniquePrices() {
  const used = {};
  const key = function (x) { return x >= 1e5 ? String(Math.floor(x)) : x.toFixed(2); };
  Object.keys(SKINS).map(function (k) { return SKINS[k]; })
    .sort(function (a, b) { return a.value - b.value || (a.id < b.id ? -1 : 1); })
    .forEach(function (s) {
      const big = s.value >= 1e5;
      let v = big ? Math.floor(s.value) : s.value;
      if (!isFinite(v)) v = 0.05;   // защита от ошибки в данных — иначе цикл ниже не закончится
      while (used[key(v)]) v = big ? v + 1 : round2(v + 0.01);
      used[key(v)] = 1;
      s.value = v;
    });
})();

// 4) Разложить новые предметы по кейсам: ножи и перчатки — в свои кейсы, реликвии — в реликвийные,
//    огнестрел старых видов — в «Серии» по семействам раскрасок, новых видов — в тематические кейсы.
(function distribute() {
  const inCase = {}, byId = {};
  CASES_RAW.forEach(function (c) {
    byId[c.id] = c;
    c.items.trim().split(/\s+/).forEach(function (tok) { inCase[tok.split(':')[0]] = 1; });
  });
  const isOld = {};
  OLD_WEAPONS.forEach(function (w) { isOld[w] = 1; });
  const STAR_CASE = { kar: 'k_kar', bay: 'k_bay', hunt: 'k_hunt', bfly: 'k_bfly', stil: 'k_stil', glsp: 'gloves', gltc: 'gloves',
    glmo: 'gloves2', gldr: 'gloves2', glwr: 'gloves3', glsh: 'gloves3' };
  const loose = [], themed = {};
  Object.keys(SKINS).forEach(function (k) {
    if (inCase[k]) return;
    const s = SKINS[k], star = !!WEAPONS[s.w].star;
    let cid = null;
    if (s.r === 7) cid = star ? (isOld[s.w] ? 'reliquary' : 'treasury') : (isOld[s.w] ? 'legends' : 'trophies');
    else if (s.r === 6) cid = STAR_CASE[s.w] || (byId['k_' + s.w] ? 'k_' + s.w : null);
    if (cid && byId[cid]) { byId[cid].items += ' ' + k + ':' + s.r; inCase[k] = 1; return; }
    const th = THEME_OF[s.w];
    if (th) (themed[th] = themed[th] || []).push(s);
    else loose.push(s);
  });
  // Группы предметов делятся на кейсы: в каждом — от дешёвых до дорогих
  function split(list, size) {
    list.sort(function (a, b) { return a.value - b.value; });
    const n = Math.max(1, Math.round(list.length / size)), groups = [];
    for (let i = 0; i < n; i++) groups.push([]);
    list.forEach(function (s, i) { groups[i % n].push(s); });
    return groups;
  }
  const fams = {};
  loose.forEach(function (s) { const fm = FIN_FAMILY[s.f] || 'elem'; (fams[fm] = fams[fm] || []).push(s); });
  Object.keys(SERIES_STYLE).forEach(function (fm) {
    if (!fams[fm] || !fams[fm].length) return;
    const st = SERIES_STYLE[fm];
    split(fams[fm], SERIES_SIZE).forEach(function (g, i) {
      const top = g[g.length - 1];
      const nm = st.names[i] || [st.names[0][0] + ' ' + (i + 1), st.names[0][1] + ' ' + (i + 1)];
      CASES_RAW.push({
        id: 's_' + fm + (i + 1), sec: 'series', name: { ru: nm[0], en: nm[1] },
        paint: i % 2 ? top.f : null,
        art: [st.art[0], st.art[1], ['diamond', 'circle', 'shield', 'hex'][i % 4], top.w, top.f],
        items: g.map(function (s) { return s.id + ':' + s.r; }).join(' '),
      });
    });
  });
  Object.keys(THEME_STYLE).forEach(function (th) {
    if (!themed[th] || !themed[th].length) return;
    const st = THEME_STYLE[th];
    split(themed[th], THEME_SIZE).forEach(function (g, i) {
      const top = g[g.length - 1];
      const nm = st.names[i] || [st.names[0][0] + ' ' + (i + 1), st.names[0][1] + ' ' + (i + 1)];
      CASES_RAW.push({
        id: 'w_' + th + (i + 1), sec: 'weapons', name: { ru: nm[0], en: nm[1] },
        paint: i % 3 === 1 ? top.f : null,
        art: (function () { const c = i ? st.alt[(i - 1) % st.alt.length] : st.art; return [c[0], c[1], st.art[2], top.w, i % 2 ? top.f : undefined]; })(),
        items: g.map(function (s) { return s.id + ':' + s.r; }).join(' '),
      });
    });
  });
})();

// 5) Кейсы: веса выпадения, средняя отдача и цена
const CASES = CASES_RAW.map(function (c) {
  const items = c.items.trim().split(/\s+/).map(function (tok) {
    const p = tok.split(':');
    return ensureSkin(p[0], Number(p[1])).id;
  });
  let weights;
  if (c.mode === 'inv') {
    const pw = c.pow || 2;
    weights = items.map(function (id) { return Math.pow(SKINS[id].value, -pw); });
  } else {
    const cnt = {};
    items.forEach(function (id) { const r = SKINS[id].r; cnt[r] = (cnt[r] || 0) + 1; });
    weights = items.map(function (id) { const r = SKINS[id].r; return RARITIES[r].w / cnt[r]; });
  }
  let tw = 0, ev = 0;
  items.forEach(function (id, i) { tw += weights[i]; ev += weights[i] * SKINS[id].value; });
  ev = ev / tw * WEAR_EV;
  return {
    id: c.id, sec: c.sec, name: c.name, art: c.art, paint: c.paint || null, mode: c.mode || 'rar',
    items: items, weights: weights, ev: ev,
    price: c.price || nicePrice(ev / CASE_RTP),
  };
});

const CASE_BY_ID = {};
CASES.forEach(function (c) { CASE_BY_ID[c.id] = c; });

// «Королевский» — всегда самый дорогой кейс игры (страховка на случай перебалансировки)
(function royalOnTop() {
  const royal = CASE_BY_ID.royal;
  if (!royal) return;
  let max = 0;
  CASES.forEach(function (c) { if (c !== royal && c.price > max) max = c.price; });
  if (royal.price <= max) royal.price = nicePrice(max * 1.25);
})();

// Все предметы по возрастанию цены — для апгрейдера и коллекции
const SKIN_LIST = Object.keys(SKINS).map(function (k) { return SKINS[k]; })
  .sort(function (a, b) { return a.value - b.value; });
const TOTAL_SKINS = SKIN_LIST.length;
