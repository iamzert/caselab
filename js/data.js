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
];
// Базовая цена предмета по редкости (дальше умножается на оружие и раскраску).
// Ножи и перчатки — от ~25 000, реликвии — от 1 000 000.
const RAR_BASE = [0.45, 1.4, 4.8, 17, 62, 230, 40000, 1000000];

// Износ: диапазон float, шанс выпадения и множитель цены
const WEARS = [
  { id: 'fn', min: 0.00, max: 0.07, p: 0.10, mult: 1.5 },
  { id: 'mw', min: 0.07, max: 0.15, p: 0.20, mult: 1.2 },
  { id: 'ft', min: 0.15, max: 0.38, p: 0.40, mult: 1.0 },
  { id: 'ww', min: 0.38, max: 0.45, p: 0.15, mult: 0.8 },
  { id: 'bs', min: 0.45, max: 1.00, p: 0.15, mult: 0.65 },
];
const WEAR_EV = WEARS.reduce((s, w) => s + w.p * w.mult, 0);

const WEAPONS = {
  p17:   { type: 'pistol',  mult: 0.8,  name: { ru: 'Гарда-17', en: 'Garda-17' } },
  p50:   { type: 'pistol',  mult: 1.0,  name: { ru: 'Кобра-50', en: 'Cobra-50' } },
  psd:   { type: 'pistol',  mult: 0.9,  name: { ru: 'Тихоня-SD', en: 'Hush-SD' } },
  smg10: { type: 'smg',     mult: 0.85, name: { ru: 'Оса-10', en: 'Wasp-10' } },
  smg45: { type: 'smg',     mult: 0.9,  name: { ru: 'Шершень-45', en: 'Hornet-45' } },
  sg12:  { type: 'shotgun', mult: 0.75, name: { ru: 'Молот-12', en: 'Sledge-12' } },
  ar47:  { type: 'rifle',   mult: 1.4,  name: { ru: 'Штурм-47', en: 'Storm-47' } },
  ar4:   { type: 'rifle',   mult: 1.3,  name: { ru: 'Сокол-4', en: 'Falcon-4' } },
  sr338: { type: 'sniper',  mult: 1.7,  name: { ru: 'Гром-338', en: 'Thunder-338' } },
  sr08:  { type: 'sniper',  mult: 1.1,  name: { ru: 'Ястреб-08', en: 'Hawk-08' } },
  kar:   { type: 'knife',   mult: 2.2,  star: true, name: { ru: 'Керамбит', en: 'Karambit' } },
  bfly:  { type: 'knife',   mult: 2.0,  star: true, name: { ru: 'Нож-бабочка', en: 'Balisong' } },
  bay:   { type: 'knife',   mult: 1.5,  star: true, name: { ru: 'Штык-нож', en: 'Bayonet' } },
  stil:  { type: 'knife',   mult: 1.25, star: true, name: { ru: 'Стилет', en: 'Stiletto' } },
  hunt:  { type: 'knife',   mult: 1.0,  star: true, name: { ru: 'Охотничий нож', en: 'Hunting Knife' } },
  glsp:  { type: 'gloves',  mult: 1.8,  star: true, name: { ru: 'Спортивные перчатки', en: 'Athletic Gloves' } },
  gltc:  { type: 'gloves',  mult: 1.4,  star: true, name: { ru: 'Тактические перчатки', en: 'Tactical Gloves' } },
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
};

const SECTIONS = [
  { id: 'starter',     name: { ru: 'Стартовые', en: 'Starter' } },
  { id: 'weapons',     name: { ru: 'Оружейные', en: 'Weapon cases' } },
  { id: 'collections', name: { ru: 'Коллекции', en: 'Collections' } },
  { id: 'knives',      name: { ru: 'Ножевые', en: 'Knife cases' } },
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

  { id: 'gloves', sec: 'premium', mode: 'inv', name: { ru: 'Перчаточный', en: 'Gloves' }, art: ['#4a1f22', '#ffd36b', 'shield', 'glsp', 'cherry'],
    items: 'glsp_urban:6 glsp_carbon:6 glsp_neon:6 glsp_marble:6 gltc_forest:6 gltc_sand:6 gltc_cyber:6 gltc_galaxy:6' },
  { id: 'starfall', sec: 'premium', mode: 'inv', paint: 'galaxy', name: { ru: 'Звездопад', en: 'Starfall' }, art: ['#160f33', '#c9b4ff', 'hex', 'kar', 'galaxy'],
    items: 'ar4_galaxy:5 sr338_galaxy:5 ar47_fade:5 p50_marble:5 stil_galaxy:6 kar_galaxy:6 bfly_galaxy:6 gltc_galaxy:6' },
  { id: 'royal', sec: 'premium', mode: 'inv', paint: 'gilded', name: { ru: 'Королевский', en: 'Royal' }, art: ['#d9c27a', '#2a1d05', 'shield', 'bfly', 'fade'],
    items: 'ar47_gilded:5 stil_gilded:6 kar_temper:6 kar_fade:6 bfly_fade:6 kar_galaxy:6 bfly_galaxy:6 glsp_marble:6 kar_marble:6' },

  // Реликвии: pow — насколько резко падает шанс с ценой (вес ~ 1/цена^pow)
  { id: 'legends', sec: 'relics', mode: 'inv', pow: 1, paint: 'dragon', name: { ru: 'Арсенал легенд', en: 'Legends Arsenal' }, art: ['#2a0b08', '#ffb02e', 'shield', 'ar47', 'dragon'],
    items: 'ar47_fade:5 ar4_galaxy:5 sr338_galaxy:5 p50_marble:5 sr338_circuit:5 p50_emperor:7 ar4_crystal:7 ar47_dragon:7 ar47_emperor:7 sr338_dragon:7 sr338_opal:7' },
  { id: 'reliquary', sec: 'relics', mode: 'inv', pow: 1.4, paint: 'opal', name: { ru: 'Реликварий', en: 'Reliquary' }, art: ['#07080f', '#2ef2ff', 'hex', 'kar', 'crystal'],
    items: 'hunt_fade:6 bay_fade:6 kar_fade:6 bfly_galaxy:6 hunt_crystal:7 bay_dragon:7 stil_emperor:7 gltc_dragon:7 kar_dragon:7 kar_opal:7 bfly_opal:7 bfly_emperor:7 bfly_crystal:7 kar_crystal:7' },
  { id: 'k_stil', sec: 'knives', mode: 'inv', name: { ru: 'Стилет', en: 'Stiletto' }, art: ['#3a2a40', '#d7dee2', 'diamond', 'stil'],
    items: 'stil_gilded:6 stil_damascus:6 stil_galaxy:6' },
];

// ---------- Полный каталог ----------
// Кроме предметов из кейсов выше, каталог дополняется до SKIN_TOTAL. Редкость нового
// предмета зависит от уровня раскраски (FIN_TIER); ножи и перчатки — всегда ★,
// раскраски реликвий — ✦. Новые предметы раскладываются по кейсам автоматически.
const SKIN_TOTAL = 512;
const FIN_TIER = {
  plain: 0, urban: 0, forest: 0, sand: 0,
  arctic: 1, rust: 1, navy: 1, digital: 1, jungle: 1, midnight: 1,
  carbon: 2, mint: 2, cherry: 2, zebra: 2, retro: 2, splash: 2, circuit: 2, bronze: 2,
  tiger: 3, cyber: 3, honey: 3, toxic: 3, sakura: 3, ocean: 3, frost: 3, proto: 3, glacier: 3,
  neon: 4, sunset: 4, aurora: 4, chrome: 4, scales: 4, lava: 4, scorch: 4, amethyst: 4, garnet: 4, cobalt: 4, malachite: 4,
  marble: 5, fade: 5, gilded: 5, galaxy: 5, damascus: 5, temper: 5,
  dragon: 7, opal: 7, emperor: 7, crystal: 7,
};
// Семейства раскрасок — по ним собираются кейсы раздела «Серии»
const FIN_FAMILY = {
  plain: 'field', urban: 'field', forest: 'field', sand: 'field', arctic: 'field', jungle: 'field', midnight: 'field', digital: 'field', navy: 'field',
  chrome: 'metal', gilded: 'metal', bronze: 'metal', garnet: 'metal', cobalt: 'metal', malachite: 'metal', carbon: 'metal', damascus: 'metal', temper: 'metal', rust: 'metal',
  neon: 'neon', sunset: 'neon', aurora: 'neon', fade: 'neon', scorch: 'neon', amethyst: 'neon', retro: 'neon', cyber: 'neon', circuit: 'neon', toxic: 'neon', proto: 'neon',
  tiger: 'wild', zebra: 'wild', scales: 'wild', honey: 'wild', sakura: 'wild', mint: 'wild', cherry: 'wild',
  lava: 'elem', frost: 'elem', glacier: 'elem', ocean: 'elem', marble: 'elem', galaxy: 'elem', splash: 'elem',
};
const SERIES_STYLE = {
  field: { art: ['#4b5638', '#d8e0a0'], names: [['Разведка', 'Recon'], ['Рубеж', 'Frontier'], ['Дозор', 'Watch'], ['Блокпост', 'Checkpoint'], ['Окоп', 'Trench']] },
  metal: { art: ['#3d4148', '#f0c75a'], names: [['Кузница', 'Forge'], ['Слиток', 'Ingot'], ['Сплав', 'Alloy'], ['Броня', 'Armor'], ['Наковальня', 'Anvil']] },
  neon:  { art: ['#231046', '#ff3fd0'], names: [['Импульс', 'Pulse'], ['Вспышка', 'Flash'], ['Сигнал', 'Signal'], ['Неоновая ночь', 'Neon Night'], ['Разряд', 'Discharge']] },
  wild:  { art: ['#3f2a14', '#ffb347'], names: [['Хищник', 'Predator'], ['Сафари', 'Safari'], ['Логово', 'Lair'], ['Клык', 'Fang'], ['Стая', 'Pack']] },
  elem:  { art: ['#14324a', '#62e0ff'], names: [['Шторм', 'Tempest'], ['Вулкан', 'Volcano'], ['Прилив', 'Tide'], ['Метель', 'Blizzard'], ['Туманность', 'Nebula']] },
};
const SERIES_SIZE = 14;

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
(function fillCatalog() {
  const count = {};
  Object.keys(SKINS).forEach(function (k) { const w = SKINS[k].w; count[w] = (count[w] || 0) + 1; });
  const queues = Object.keys(WEAPONS).map(function (w) {
    const star = !!WEAPONS[w].star, gloves = WEAPONS[w].type === 'gloves';
    let fins = Object.keys(FINISHES).filter(function (f) {
      if (SKINS[w + '_' + f] || FIN_TIER[f] == null) return false;
      return !(gloves && (f === 'damascus' || f === 'temper'));
    });
    if (!star) { // у огнестрела не больше двух раскрасок-реликвий
      const rel = fins.filter(function (f) { return FIN_TIER[f] === 7; })
        .sort(function (a, b) { return hash01(w + a) - hash01(w + b); }).slice(0, 2);
      fins = fins.filter(function (f) { return FIN_TIER[f] !== 7 || rel.indexOf(f) >= 0; });
    }
    fins.sort(function (a, b) { return hash01('cat:' + w + ':' + a) - hash01('cat:' + w + ':' + b); });
    return { w: w, star: star, fins: fins };
  });
  while (Object.keys(SKINS).length < SKIN_TOTAL) {
    let best = null;
    queues.forEach(function (q) { if (q.fins.length && (!best || (count[q.w] || 0) < (count[best.w] || 0))) best = q; });
    if (!best) break;
    const f = best.fins.shift(), t = FIN_TIER[f];
    ensureSkin(best.w + '_' + f, t === 7 ? 7 : best.star ? 6 : t);
    count[best.w] = (count[best.w] || 0) + 1;
  }
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
      while (used[key(v)]) v = big ? v + 1 : round2(v + 0.01);
      used[key(v)] = 1;
      s.value = v;
    });
})();

// 4) Разложить новые предметы по кейсам: ножи и перчатки — в свои ножевые кейсы,
//    реликвии — в «Реликварий» и «Арсенал легенд», остальное — в «Серии» по семействам раскрасок.
(function distribute() {
  const inCase = {}, byId = {};
  CASES_RAW.forEach(function (c) {
    byId[c.id] = c;
    c.items.trim().split(/\s+/).forEach(function (tok) { inCase[tok.split(':')[0]] = 1; });
  });
  const KNIFE_CASE = { kar: 'k_kar', bay: 'k_bay', hunt: 'k_hunt', bfly: 'k_bfly', stil: 'k_stil', glsp: 'gloves', gltc: 'gloves' };
  const loose = [];
  Object.keys(SKINS).forEach(function (k) {
    if (inCase[k]) return;
    const s = SKINS[k];
    const cid = s.r === 7 ? (WEAPONS[s.w].star ? 'reliquary' : 'legends') : s.r === 6 ? KNIFE_CASE[s.w] : null;
    if (cid) { byId[cid].items += ' ' + k + ':' + s.r; inCase[k] = 1; } else loose.push(s);
  });
  const fams = {};
  loose.forEach(function (s) { const fm = FIN_FAMILY[s.f] || 'elem'; (fams[fm] = fams[fm] || []).push(s); });
  Object.keys(SERIES_STYLE).forEach(function (fm) {
    const list = (fams[fm] || []).sort(function (a, b) { return a.value - b.value; });
    if (!list.length) return;
    const n = Math.max(1, Math.round(list.length / SERIES_SIZE)), groups = [];
    for (let i = 0; i < n; i++) groups.push([]);
    list.forEach(function (s, i) { groups[i % n].push(s); });   // в каждом кейсе — от дешёвых до дорогих
    const st = SERIES_STYLE[fm];
    groups.forEach(function (g, i) {
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

// Все предметы по возрастанию цены — для апгрейдера и коллекции
const SKIN_LIST = Object.keys(SKINS).map(function (k) { return SKINS[k]; })
  .sort(function (a, b) { return a.value - b.value; });
const TOTAL_SKINS = SKIN_LIST.length;
