'use strict';

// Фоны-локации под интерфейсом. Это собственные процедурные сцены (улица в перспективе),
// а не карты из других игр. Рисуются один раз, кэшируются и размываются через CSS.
// Свою картинку (на которую есть права) можно добавить так:
//   BG_IMAGES.push({ id: 'my', name: { ru: 'Моя карта', en: 'My map' }, src: 'img/my_bg.jpg' });
const BG_IMAGES = [];

const Backgrounds = (function () {
  const W = 960, H = 540, HOR = 262, VX = W * 0.5;

  const THEMES = [
    { id: 'none', name: { ru: 'Классика', en: 'Classic' } },
    {
      id: 'desert', name: { ru: 'Пустынный город', en: 'Desert town' },
      sky: ['#d99a55', '#efc98f', '#f8e3bd'], sun: [0.7, 0.2, '255,244,214'], far: '#caa67a',
      wall: '#d4a873', shade: '#a77c4c', trim: '#8e663b', ground: ['#cba26a', '#87623a'], road: '#b8935e',
      glass: '#2b2219', accent: '#2f6f8f', door: '#5e4027', props: ['dome', 'crates', 'palm', 'awning', 'arch'],
    },
    {
      id: 'coast', name: { ru: 'Приморский квартал', en: 'Seaside quarter' },
      sky: ['#4f9ad6', '#9ccbee', '#d8eefc'], sun: [0.24, 0.14, '255,255,236'], far: '#93adbc',
      wall: '#eadbc1', shade: '#c4ad88', trim: '#b18556', roof: '#b4553a', ground: ['#bfb096', '#776a55'], road: '#a39680',
      glass: '#273743', accent: '#3b7db4', door: '#6a4b31', props: ['hills', 'tower', 'shutters', 'plants', 'roofs'],
    },
    {
      id: 'factory', name: { ru: 'Промзона', en: 'Industrial zone' },
      sky: ['#636e78', '#919ca5', '#bfc6cb'], sun: [0.6, 0.12, '235,238,240'], far: '#737b82',
      wall: '#75706a', shade: '#524d47', trim: '#45413c', ground: ['#5b5751', '#2c2a27'], road: '#494642',
      glass: '#1c2023', accent: '#d1832e', door: '#3a3f44', props: ['chimney', 'containers', 'pipes', 'stripes', 'barrels'],
    },
    {
      id: 'snow', name: { ru: 'Северная база', en: 'Arctic base' },
      sky: ['#869fb7', '#bfcfdd', '#e4edf5'], sun: [0.32, 0.16, '255,255,255'], far: '#c7d4e0',
      wall: '#89929a', shade: '#626a72', trim: '#50575e', ground: ['#edf2f6', '#a9b9c7'], road: '#d0dae3',
      glass: '#27313a', accent: '#c94a3c', door: '#3f474e', props: ['mountains', 'pines', 'snowroof', 'drifts', 'snowfall'],
    },
    {
      id: 'night', name: { ru: 'Ночной порт', en: 'Night harbor' },
      sky: ['#060b1c', '#14214a', '#2a3a66'], sun: [0.78, 0.15, '214,226,255'], far: '#18203a',
      wall: '#2a3044', shade: '#1b2031', trim: '#131725', ground: ['#1e2332', '#0a0c13'], road: '#212637',
      glass: '#0c0f17', lit: '#ffc56b', accent: '#ff8a3d', door: '#10131c', props: ['stars', 'crane', 'containers', 'lamps', 'litwin'],
    },
  ];

  const urls = {}, thumbs = {};

  function list() {
    return THEMES.concat(BG_IMAGES.map((b) => ({ id: b.id, name: b.name, src: b.src })));
  }
  const byId = (id) => list().filter((t) => t.id === id)[0] || null;
  const has = (th, p) => (th.props || []).indexOf(p) >= 0;

  // ---------- Геометрия ----------
  // Перспективное деление стены: равные шаги в глубину сжимаются к горизонту
  const persp = (t) => (1 - 1 / (1 + 3 * t)) / 0.75;
  function qp(q, u, v) {
    const tx = q[0][0] + (q[1][0] - q[0][0]) * u, ty = q[0][1] + (q[1][1] - q[0][1]) * u;
    const bx = q[3][0] + (q[2][0] - q[3][0]) * u, by = q[3][1] + (q[2][1] - q[3][1]) * u;
    return [tx + (bx - tx) * v, ty + (by - ty) * v];
  }
  function quad(x, q, u0, v0, u1, v1) {
    const a = qp(q, u0, v0), b = qp(q, u1, v0), c = qp(q, u1, v1), d = qp(q, u0, v1);
    x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c[0], c[1]); x.lineTo(d[0], d[1]); x.closePath();
  }
  function poly(x, pts) { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); }
  function lin(x, x0, y0, x1, y1, stops) { const g = x.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }

  // ---------- Части сцены ----------
  function sky(x, th, R) {
    x.fillStyle = lin(x, 0, 0, 0, HOR + 10, th.sky); x.fillRect(0, 0, W, HOR + 10);
    const s = th.sun, sx = s[0] * W, sy = s[1] * H;
    const g = x.createRadialGradient(sx, sy, 4, sx, sy, 260);
    g.addColorStop(0, 'rgba(' + s[2] + ',1)'); g.addColorStop(0.08, 'rgba(' + s[2] + ',.85)'); g.addColorStop(1, 'rgba(' + s[2] + ',0)');
    x.fillStyle = g; x.fillRect(0, 0, W, HOR + 10);
    if (has(th, 'stars')) {
      for (let i = 0; i < 140; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.3 + R() * 0.7) + ')'; x.fillRect(R() * W, R() * HOR * 0.85, 1.4, 1.4); }
    } else {
      for (let i = 0; i < 7; i++) {
        const cx = R() * W, cy = 30 + R() * 120, rw = 60 + R() * 120;
        x.fillStyle = 'rgba(255,255,255,' + (0.12 + R() * 0.14) + ')';
        x.beginPath(); x.ellipse(cx, cy, rw, rw * 0.22, 0, 0, Math.PI * 2); x.fill();
      }
    }
  }

  function farLine(x, th, R) {
    if (has(th, 'mountains') || has(th, 'hills')) {
      x.fillStyle = th.far;
      x.beginPath(); x.moveTo(0, HOR);
      for (let px = 0; px <= W; px += 40) x.lineTo(px, HOR - (has(th, 'mountains') ? 60 + R() * 90 : 25 + R() * 35));
      x.lineTo(W, HOR); x.closePath(); x.fill();
    }
    // дальняя застройка
    for (let px = W * 0.3; px < W * 0.7; px += 14 + R() * 26) {
      const bw = 18 + R() * 40, bh = 20 + R() * 70;
      x.fillStyle = th.far; x.fillRect(px, HOR - bh, bw, bh + 2);
      if (has(th, 'litwin')) for (let k = 0; k < 4; k++) if (R() < 0.5) { x.fillStyle = th.lit; x.fillRect(px + 3 + R() * (bw - 6), HOR - bh + 4 + R() * (bh - 8), 2.5, 2.5); }
    }
    if (has(th, 'dome')) {
      x.fillStyle = th.far; x.fillRect(VX + 70, HOR - 70, 70, 70);
      x.beginPath(); x.arc(VX + 105, HOR - 70, 34, Math.PI, 0); x.fill();
      x.fillRect(VX - 150, HOR - 130, 16, 130); x.beginPath(); x.arc(VX - 142, HOR - 130, 10, Math.PI, 0); x.fill();
    }
    if (has(th, 'tower')) {
      x.fillStyle = th.shade; x.fillRect(VX - 30, HOR - 170, 46, 170);
      x.fillStyle = th.roof; poly(x, [[VX - 36, HOR - 170], [VX + 22, HOR - 170], [VX - 7, HOR - 214]]); x.fill();
      x.fillStyle = th.glass; x.fillRect(VX - 18, HOR - 150, 20, 26);
    }
    if (has(th, 'chimney')) {
      [[VX - 120, 190], [VX + 90, 150]].forEach((c) => {
        x.fillStyle = '#5a5f64'; x.fillRect(c[0], HOR - c[1], 22, c[1]);
        x.fillStyle = th.accent; x.fillRect(c[0], HOR - c[1] + 10, 22, 8);
        for (let k = 0; k < 6; k++) {
          x.fillStyle = 'rgba(200,204,208,' + (0.28 - k * 0.04) + ')';
          x.beginPath(); x.arc(c[0] + 11 + k * 24, HOR - c[1] - 14 - k * 16, 16 + k * 7, 0, Math.PI * 2); x.fill();
        }
      });
    }
    if (has(th, 'crane')) {
      x.strokeStyle = '#2c3657'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(VX + 160, HOR); x.lineTo(VX + 160, HOR - 190); x.lineTo(VX - 40, HOR - 190); x.moveTo(VX + 160, HOR - 190); x.lineTo(VX + 210, HOR - 190); x.stroke();
      x.lineWidth = 1.5; x.beginPath(); x.moveTo(VX + 10, HOR - 190); x.lineTo(VX + 10, HOR - 120); x.stroke();
      x.fillStyle = '#ff4d4d'; x.beginPath(); x.arc(VX + 160, HOR - 194, 3, 0, Math.PI * 2); x.fill();
    }
  }

  function ground(x, th) {
    x.fillStyle = lin(x, 0, HOR, 0, H, th.ground); x.fillRect(0, HOR, W, H - HOR);
    const road = [[VX - 44, HOR], [VX + 44, HOR], [W * 0.95, H], [W * 0.05, H]];
    x.fillStyle = th.road; poly(x, road); x.fill();
    x.fillStyle = 'rgba(0,0,0,.12)'; poly(x, road); x.fill();
    // разметка по центру дороги
    x.strokeStyle = 'rgba(255,255,255,.2)'; x.lineWidth = 2;
    for (let t = 0.05; t < 1; t += 0.09) {
      const y = HOR + (H - HOR) * persp(t) * 0.999;
      x.globalAlpha = 0.5 + t * 0.5;
      x.beginPath(); x.moveTo(VX, y); x.lineTo(VX, y + 10 * t + 2); x.stroke();
    }
    x.globalAlpha = 1;
  }

  // Стена здания: q — четырёхугольник [верх-ближний, верх-дальний, низ-дальний, низ-ближний]
  function wall(x, th, q, R, side) {
    x.fillStyle = th.wall; poly(x, q); x.fill();
    x.fillStyle = lin(x, q[0][0], 0, q[1][0], 0, side < 0 ? ['rgba(0,0,0,.05)', 'rgba(0,0,0,.32)'] : ['rgba(0,0,0,.28)', 'rgba(0,0,0,.02)']);
    poly(x, q); x.fill();
    // карниз и цоколь
    x.fillStyle = th.trim; quad(x, q, 0, 0, 1, 0.05); x.fill(); quad(x, q, 0, 0.9, 1, 1); x.fill();
    // окна и двери
    const cols = 5;
    for (let c = 0; c < cols; c++) {
      const u0 = persp((c + 0.22) / cols), u1 = persp((c + 0.72) / cols);
      for (let r = 0; r < 3; r++) {
        const v0 = 0.12 + r * 0.25, v1 = v0 + 0.14;
        if (r === 2 && c % 2 === 0) {
          x.fillStyle = th.door; quad(x, q, u0, 0.6, u1, 0.9); x.fill();
          if (has(th, 'arch')) { x.fillStyle = 'rgba(0,0,0,.35)'; quad(x, q, u0, 0.6, u1, 0.66); x.fill(); }
          continue;
        }
        x.fillStyle = th.glass; quad(x, q, u0, v0, u1, v1); x.fill();
        if (th.lit && R() < 0.45) { x.fillStyle = th.lit; quad(x, q, u0, v0, u1, v1); x.fill(); }
        x.fillStyle = 'rgba(255,255,255,.12)'; quad(x, q, u0, v0, u1, v0 + 0.015); x.fill();
        if (has(th, 'shutters')) { x.fillStyle = th.accent; quad(x, q, u0 - 0.02, v0, u0 + 0.01, v1); x.fill(); quad(x, q, u1 - 0.01, v0, u1 + 0.02, v1); x.fill(); }
        if (has(th, 'awning') && r === 1 && c % 2) { x.fillStyle = th.accent; quad(x, q, u0 - 0.02, v0 - 0.05, u1 + 0.02, v0); x.fill(); }
      }
    }
    if (has(th, 'stripes')) {
      for (let k = 0; k < 10; k++) { x.fillStyle = k % 2 ? '#222' : th.accent; quad(x, q, k / 10, 0.86, (k + 1) / 10, 0.9); x.fill(); }
    }
    if (has(th, 'snowroof')) { x.fillStyle = '#f2f6fa'; quad(x, q, 0, -0.03, 1, 0.03); x.fill(); }
    if (has(th, 'roofs')) { x.fillStyle = th.roof; quad(x, q, 0, -0.06, 1, 0.01); x.fill(); }
  }

  function facade(x, th, R) {
    const x0 = VX - 110, x1 = VX + 110, y0 = HOR - 150, y1 = HOR + 4;
    x.fillStyle = th.shade; x.fillRect(x0, y0, x1 - x0, y1 - y0);
    x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(x0, y0, x1 - x0, 6);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 2; r++) {
      x.fillStyle = th.lit && R() < 0.5 ? th.lit : th.glass;
      x.fillRect(x0 + 18 + c * 52, y0 + 20 + r * 44, 26, 28);
    }
    x.fillStyle = th.door; x.fillRect(VX - 26, y1 - 52, 52, 52);
    if (has(th, 'arch')) { x.beginPath(); x.arc(VX, y1 - 52, 26, Math.PI, 0); x.fill(); }
  }

  function props(x, th) {
    if (has(th, 'crates')) {
      const box = (bx, by, s, col) => {
        x.fillStyle = col; x.fillRect(bx, by - s, s, s);
        x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(bx + s, by - s, s * 0.25, s);
        x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 3; x.strokeRect(bx + 4, by - s + 4, s - 8, s - 8);
        x.beginPath(); x.moveTo(bx + 4, by - s + 4); x.lineTo(bx + s - 4, by - 4); x.stroke();
      };
      box(130, 500, 110, '#9a6b3c'); box(240, 500, 90, '#8a5e33'); box(150, 390, 80, '#a5763f');
    }
    if (has(th, 'containers')) {
      const night = th.id === 'night';
      const cont = (cx, cy, w, h, col) => {
        x.fillStyle = col; x.fillRect(cx, cy - h, w, h);
        x.fillStyle = 'rgba(0,0,0,.25)';
        for (let k = cx + 8; k < cx + w - 6; k += 14) x.fillRect(k, cy - h + 6, 4, h - 12);
      };
      cont(60, 520, 300, 120, night ? '#7a2f2a' : '#8a3b2e');
      cont(90, 400, 240, 100, night ? '#244a6e' : '#2f5f86');
      cont(W - 380, 520, 280, 110, night ? '#2f5d3a' : '#cf8a2e');
    }
    if (has(th, 'barrels')) {
      [[W - 300, 508], [W - 250, 512], [W - 200, 506]].forEach((b) => {
        x.fillStyle = '#3e5f7d'; x.fillRect(b[0], b[1] - 64, 40, 64);
        x.fillStyle = 'rgba(255,255,255,.15)'; x.fillRect(b[0] + 4, b[1] - 64, 6, 64);
        x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(b[0], b[1] - 44, 40, 4); x.fillRect(b[0], b[1] - 22, 40, 4);
      });
    }
    if (has(th, 'pipes')) {
      x.strokeStyle = '#6e7378'; x.lineWidth = 14;
      x.beginPath(); x.moveTo(W - 120, 0); x.lineTo(W - 120, 300); x.lineTo(W, 300); x.stroke();
      x.lineWidth = 9; x.strokeStyle = '#8a8f94';
      x.beginPath(); x.moveTo(0, 180); x.lineTo(240, 230); x.stroke();
    }
    if (has(th, 'palm')) {
      const palm = (px, py, hgt) => {
        x.strokeStyle = '#6d4c2c'; x.lineWidth = 12;
        x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 30, py - hgt * 0.5, px + 10, py - hgt); x.stroke();
        x.fillStyle = '#3f6b2e';
        for (let k = 0; k < 7; k++) {
          const a = -Math.PI / 2 + (k - 3) * 0.5;
          x.beginPath(); x.ellipse(px + 10 + Math.cos(a) * 50, py - hgt + Math.sin(a) * 22 + 18, 58, 12, a, 0, Math.PI * 2); x.fill();
        }
      };
      palm(W - 180, 470, 300);
      palm(330, 330, 160);
    }
    if (has(th, 'plants')) {
      for (let k = 0; k < 5; k++) { x.fillStyle = '#4f7d3a'; x.beginPath(); x.arc(W - 330 + k * 60, 460 - k * 18, 26, 0, Math.PI * 2); x.fill(); }
    }
    if (has(th, 'pines')) {
      const pine = (px, py, s) => {
        x.fillStyle = '#2f4a3c';
        for (let k = 0; k < 3; k++) { poly(x, [[px, py - s - k * s * 0.4], [px - s * 0.55, py - k * s * 0.4], [px + s * 0.55, py - k * s * 0.4]]); x.fill(); }
        x.fillStyle = 'rgba(255,255,255,.55)';
        poly(x, [[px, py - s - 0.8 * s], [px - s * 0.2, py - 0.8 * s - s * 0.6], [px + s * 0.2, py - 0.8 * s - s * 0.6]]); x.fill();
      };
      pine(120, 470, 120); pine(W - 140, 480, 140); pine(W - 260, 360, 70); pine(300, 340, 60);
    }
    if (has(th, 'drifts')) {
      x.fillStyle = '#f4f8fb';
      x.beginPath(); x.ellipse(220, H, 280, 60, 0, Math.PI, 0); x.fill();
      x.beginPath(); x.ellipse(W - 200, H, 300, 70, 0, Math.PI, 0); x.fill();
    }
    if (has(th, 'lamps')) {
      [[260, 300], [W - 260, 300], [VX - 90, HOR + 10], [VX + 90, HOR + 10]].forEach((l, i) => {
        const s = i < 2 ? 1 : 0.4;
        x.strokeStyle = '#11141d'; x.lineWidth = 6 * s;
        x.beginPath(); x.moveTo(l[0], H - (i < 2 ? 40 : 230)); x.lineTo(l[0], l[1]); x.stroke();
        const g = x.createRadialGradient(l[0], l[1], 2, l[0], l[1], 120 * s);
        g.addColorStop(0, 'rgba(255,214,150,.9)'); g.addColorStop(1, 'rgba(255,190,110,0)');
        x.fillStyle = g; x.beginPath(); x.arc(l[0], l[1], 120 * s, 0, Math.PI * 2); x.fill();
      });
    }
  }

  function finishLight(x, th, R) {
    // дымка у горизонта, снег и виньетка
    const hz = x.createLinearGradient(0, HOR - 80, 0, HOR + 60);
    hz.addColorStop(0, 'rgba(' + th.sun[2] + ',0)'); hz.addColorStop(0.5, 'rgba(' + th.sun[2] + ',.18)'); hz.addColorStop(1, 'rgba(' + th.sun[2] + ',0)');
    x.fillStyle = hz; x.fillRect(0, HOR - 80, W, 140);
    if (has(th, 'snowfall')) for (let i = 0; i < 260; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.4 + R() * 0.5) + ')'; x.beginPath(); x.arc(R() * W, R() * H, 1 + R() * 2.2, 0, Math.PI * 2); x.fill(); }
    const v = x.createRadialGradient(VX, H * 0.45, H * 0.3, VX, H * 0.5, W * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
  }

  function draw(th) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const R = Tex.rng(Math.floor(hash01('bg:' + th.id) * 1e9) + 1);
    sky(x, th, R);
    farLine(x, th, R);
    ground(x, th);
    facade(x, th, R);
    wall(x, th, [[0, 30], [VX - 120, HOR - 150], [VX - 120, HOR + 6], [0, H * 0.88]], R, -1);
    wall(x, th, [[W, 10], [VX + 120, HOR - 160], [VX + 120, HOR + 6], [W, H * 0.9]], R, 1);
    props(x, th);
    finishLight(x, th, R);
    return c;
  }

  // ---------- Публичное ----------
  function url(id, cb) {
    const th = byId(id);
    if (!th || th.id === 'none') { cb(''); return; }
    if (th.src) { cb(th.src); return; }
    if (urls[id]) { cb(urls[id]); return; }
    const c = draw(th);
    const done = (u) => { urls[id] = u; cb(u); };
    if (c.toBlob) c.toBlob((b) => done(b ? URL.createObjectURL(b) : c.toDataURL('image/jpeg', 0.85)), 'image/jpeg', 0.85);
    else done(c.toDataURL('image/jpeg', 0.85));
  }

  function thumb(id) {
    const th = byId(id);
    if (!th || th.id === 'none') return '';
    if (th.src) return th.src;
    if (!thumbs[id]) {
      const big = draw(th), c = document.createElement('canvas');
      c.width = 192; c.height = 108;
      c.getContext('2d').drawImage(big, 0, 0, 192, 108);
      thumbs[id] = c.toDataURL('image/jpeg', 0.8);
    }
    return thumbs[id];
  }

  let current = null;
  function apply(id) {
    if (!byId(id)) id = 'none';
    current = id;
    const el = document.getElementById('bg');
    if (!el) return;
    url(id, (u) => {
      if (current !== id) return;
      el.style.backgroundImage = u ? 'url("' + u + '")' : '';
      document.body.classList.toggle('has-bg', !!u);
    });
  }

  return { list: list, apply: apply, thumb: thumb, exists: (id) => !!byId(id) };
})();
