'use strict';

// Отрисовка кейсов (оружейных ящиков) на canvas. Пользуется рендером оружия и объёмным светом из art.js.
// Вызывается из очереди Art (ключ c:<id кейса>), результат кэшируется там же.
const Crate = (function () {
  const { mk, gray, relight, drawWeapon, W } = Art._lib;

  // ---------- Кейс (оружейный ящик) ----------
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function poly(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
  }
  function metalGrad(ctx, y0, y1, light) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    if (light) { g.addColorStop(0, '#f2f4f7'); g.addColorStop(0.45, '#aab1ba'); g.addColorStop(1, '#5b616a'); }
    else { g.addColorStop(0, '#4a5059'); g.addColorStop(0.5, '#2a2e34'); g.addColorStop(1, '#16181b'); }
    return g;
  }

  // Рельеф ящика: корпус — ровный фон, детали приподняты, швы и пазы утоплены
  function crateRelief(x, mode, shape) {
    const H = mode === 'h';
    const v = (h, g) => gray(H ? h : g);
    x.fillStyle = v(0.5, 0.3); x.fillRect(0, 0, 512, 384);
    x.lineCap = 'round'; x.lineJoin = 'round';
    // кромка крышки и шов
    x.fillStyle = v(0.56, 0.32); x.fillRect(60, 150, 332, 54);
    x.fillStyle = v(0.3, 0.1); x.fillRect(60, 204, 332, 4);
    poly(x, [[392, 204], [452, 160], [452, 164], [392, 208]]); x.fill();
    // рёбра жёсткости
    [244, 284].forEach((y) => {
      x.fillStyle = v(0.62, 0.35); x.fillRect(78, y, 296, 9);
      poly(x, [[392, y + 2], [452, y - 44], [452, y - 38], [392, y + 8]]); x.fill();
    });
    // уголки
    x.fillStyle = v(0.78, 0.85);
    CORNERS.forEach((pts) => { poly(x, pts); x.fill(); });
    // винты
    SCREWS.forEach((p) => {
      if (H) { const g = x.createRadialGradient(p[0], p[1], 0, p[0], p[1], 3.5); g.addColorStop(0, gray(1)); g.addColorStop(1, gray(0.8)); x.fillStyle = g; }
      else x.fillStyle = gray(0.95);
      x.beginPath(); x.arc(p[0], p[1], 3.5, 0, Math.PI * 2); x.fill();
    });
    // защёлки
    [124, 292].forEach((lx) => {
      x.fillStyle = v(0.86, 0.95); rrect(x, lx, 184, 36, 42, 5); x.fill();
      x.fillStyle = v(0.7, 0.7); rrect(x, lx + 7, 191, 22, 28, 4); x.fill();
      x.fillStyle = v(0.9, 0.95); rrect(x, lx + 9, 172, 18, 12, 3); x.fill();
    });
    // ручка
    x.fillStyle = v(0.7, 0.4);
    poly(x, [[206, 134], [226, 134], [240, 122], [220, 122]]); x.fill();
    poly(x, [[296, 134], [316, 134], [330, 122], [310, 122]]); x.fill();
    x.lineWidth = 12; x.strokeStyle = v(0.92, 0.5);
    x.beginPath(); x.moveTo(224, 128); x.bezierCurveTo(232, 100, 310, 100, 316, 128); x.stroke();
    // боковая ручка
    x.fillStyle = v(0.72, 0.4); poly(x, [[404, 238], [440, 212], [440, 226], [404, 252]]); x.fill();
    // наклейка — тонкая, почти без рельефа и блеска
    x.save(); x.translate(300, 160); x.rotate(-0.02); x.fillStyle = v(0.6, 0.05); x.fillRect(0, 0, 72, 30); x.restore();
    // эмблема: приподнятая рамка и утопленное поле
    x.fillStyle = v(0.76, 0.75); shape(x, 1); x.fill();
    x.fillStyle = v(0.6, 0.55); shape(x, 0.84); x.fill();
  }

  const CORNERS = [[[60, 150], [98, 150], [98, 160], [70, 160], [70, 188], [60, 188]],
    [[392, 150], [354, 150], [354, 160], [382, 160], [382, 188], [392, 188]],
    [[60, 330], [98, 330], [98, 320], [70, 320], [70, 292], [60, 292]],
    [[392, 330], [354, 330], [354, 320], [382, 320], [382, 292], [392, 292]]];
  const SCREWS = [[66, 156], [386, 156], [66, 324], [386, 324]];

  // Контур эмблемы ящика
  function emblemPath(x, kind, cx, cy, k) {
    x.beginPath();
    switch (kind) {
      case 'circle': x.arc(cx, cy, 44 * k, 0, Math.PI * 2); break;
      case 'shield':
        x.moveTo(cx - 44 * k, cy - 40 * k); x.lineTo(cx + 44 * k, cy - 40 * k); x.lineTo(cx + 44 * k, cy - 2 * k);
        x.quadraticCurveTo(cx + 44 * k, cy + 32 * k, cx, cy + 46 * k);
        x.quadraticCurveTo(cx - 44 * k, cy + 32 * k, cx - 44 * k, cy - 2 * k); x.closePath(); break;
      case 'hex':
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x.lineTo(cx + 46 * k * Math.cos(a), cy + 42 * k * Math.sin(a)); }
        x.closePath(); break;
      default:
        x.moveTo(cx, cy - 46 * k); x.lineTo(cx + 46 * k, cy); x.lineTo(cx, cy + 46 * k); x.lineTo(cx - 46 * k, cy); x.closePath();
    }
  }

  function buildCrate(c) {
    // Рисуем в координатах 512×384, но обрезаем пустые поля вокруг ящика
    const cv = mk(432, 268), ctx = cv.getContext('2d');
    ctx.translate(-40, -84);
    const a = c.art, main = a[0], acc = a[1];
    const shade = Tex.shade;
    const tex = c.paint ? Tex.get(c.paint) : null;
    const grime = Tex.grime();

    // тень на полу
    ctx.save();
    ctx.translate(256, 336); ctx.scale(1, 0.16);
    const sg = ctx.createRadialGradient(0, 0, 10, 0, 0, 240);
    sg.addColorStop(0, 'rgba(0,0,0,.6)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, 240, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const FRONT = () => rrect(ctx, 60, 150, 332, 180, 10);
    const TOP = () => poly(ctx, [[60, 152], [392, 152], [452, 106], [124, 104]]);
    const SIDE = () => poly(ctx, [[390, 152], [452, 106], [452, 288], [392, 330]]);

    function face(pathFn, base, x, y, w, h, over) {
      ctx.save();
      pathFn(); ctx.clip();
      ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
      if (tex) ctx.drawImage(tex, x, y, w, h);
      ctx.fillStyle = Tex.polymer(ctx); ctx.fillRect(x, y, w, h);   // литой пластик
      const g = ctx.createLinearGradient(over[0], over[1], over[2], over[3]);
      over[4].forEach((s) => g.addColorStop(s[0], s[1]));
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.3; ctx.drawImage(grime, x, y, w, h); ctx.globalAlpha = 1;
      ctx.restore();
    }

    face(SIDE, shade(main, -0.32), 390, 104, 64, 228, [390, 0, 452, 0, [[0, 'rgba(0,0,0,.42)'], [1, 'rgba(0,0,0,.6)']]]);
    face(TOP, shade(main, 0.16), 60, 104, 392, 50, [0, 152, 0, 104, [[0, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,.04)']]]);
    face(FRONT, main, 60, 150, 332, 180, [0, 150, 0, 330, [[0, 'rgba(255,255,255,.1)'], [0.3, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.3)']]]);

    // крышка: шов и выпуклость
    ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(62, 152, 328, 52);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(60, 204, 332, 4);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(60, 208, 332, 1.5);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; poly(ctx, [[392, 204], [452, 160], [452, 164], [392, 208]]); ctx.fill();

    // рёбра жёсткости
    [244, 284].forEach((y) => {
      const g = ctx.createLinearGradient(0, y, 0, y + 9);
      g.addColorStop(0, 'rgba(255,255,255,.2)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.4)');
      ctx.fillStyle = g; ctx.fillRect(78, y, 296, 9);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; poly(ctx, [[392, y + 2], [452, y - 44], [452, y - 38], [392, y + 8]]); ctx.fill();
    });

    // грани
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.moveTo(66, 151); ctx.lineTo(386, 151); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.moveTo(392, 152); ctx.lineTo(392, 326); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(126, 105); ctx.lineTo(450, 106); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.moveTo(61, 160); ctx.lineTo(61, 322); ctx.stroke();

    // потёртости по кромкам
    const RS = Tex.rng(Math.floor(hash01('scuff' + c.id) * 1e9) + 3);
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const top = RS() < 0.5;
      const x0 = top ? 70 + RS() * 310 : (RS() < 0.5 ? 61 + RS() * 4 : 388 + RS() * 3);
      const y0 = top ? 151 + RS() * 3 : 160 + RS() * 160;
      const len = 3 + RS() * 12;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.12 + RS() * 0.2) + ')';
      ctx.lineWidth = 0.6 + RS() * 1.2;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      if (top) ctx.lineTo(x0 + len, y0 + (RS() - 0.5) * 2); else ctx.lineTo(x0 + (RS() - 0.5) * 2, y0 + len);
      ctx.stroke();
    }

    // металлические уголки с винтами
    ctx.fillStyle = metalGrad(ctx, 150, 330, false);
    CORNERS.forEach((pts) => {
      poly(ctx, pts); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.stroke();
    });
    SCREWS.forEach((p) => {
      const g = ctx.createRadialGradient(p[0] - 1, p[1] - 1, 0.5, p[0], p[1], 3.5);
      g.addColorStop(0, '#f0f2f5'); g.addColorStop(1, '#5b616a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2); ctx.fill();
    });

    // защёлки
    [124, 292].forEach((x) => {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; rrect(ctx, x + 2, 186, 36, 42, 5); ctx.fill();
      ctx.fillStyle = metalGrad(ctx, 184, 226, true); rrect(ctx, x, 184, 36, 42, 5); ctx.fill();
      ctx.fillStyle = metalGrad(ctx, 190, 222, false); rrect(ctx, x + 7, 191, 22, 28, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 9, 193, 18, 2);
      ctx.fillStyle = metalGrad(ctx, 172, 184, true); rrect(ctx, x + 9, 172, 18, 12, 3); ctx.fill();
      ctx.fillStyle = '#1a1c20'; ctx.beginPath(); ctx.arc(x + 18, 222, 3, 0, Math.PI * 2); ctx.fill();
    });

    // ручка сверху
    ctx.fillStyle = '#1c1e22';
    poly(ctx, [[206, 134], [226, 134], [240, 122], [220, 122]]); ctx.fill();
    poly(ctx, [[296, 134], [316, 134], [330, 122], [310, 122]]); ctx.fill();
    ctx.lineCap = 'round';
    ctx.lineWidth = 12; ctx.strokeStyle = '#15171a';
    ctx.beginPath(); ctx.moveTo(224, 128); ctx.bezierCurveTo(232, 100, 310, 100, 316, 128); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(228, 122); ctx.bezierCurveTo(236, 101, 306, 101, 312, 122); ctx.stroke();

    // боковая ручка и ножки
    ctx.fillStyle = '#16181b';
    poly(ctx, [[404, 238], [440, 212], [440, 226], [404, 252]]); ctx.fill();
    ctx.fillRect(74, 328, 40, 8); ctx.fillRect(338, 328, 40, 8);
    poly(ctx, [[430, 296], [446, 284], [446, 292], [430, 304]]); ctx.fill();

    // наклейка со штрихкодом
    ctx.save();
    ctx.translate(300, 160); ctx.rotate(-0.02);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(2, 2, 72, 30);
    ctx.fillStyle = '#e8ebee'; ctx.fillRect(0, 0, 72, 30);
    const R = Tex.rng(Math.floor(hash01(c.id) * 1e9) + 7);
    ctx.fillStyle = '#111';
    for (let x = 5; x < 52; x += 2 + Math.floor(R() * 3)) ctx.fillRect(x, 5, 1 + Math.floor(R() * 2), 14);
    ctx.font = 'bold 7px Arial, sans-serif';
    ctx.fillText('CL-' + String(CASES.indexOf(c) + 1).padStart(2, '0'), 5, 27);
    ctx.fillStyle = acc; ctx.fillRect(56, 5, 11, 20);
    ctx.restore();

    // маркировка на боку
    ctx.save();
    ctx.translate(404, 314); ctx.transform(1, -0.767, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillText('CASE·LAB', 0, 0);
    ctx.restore();

    // эмблема
    const cx = 226, cy = 268;
    const shapePath = (k) => emblemPath(ctx, a[2], cx, cy, k);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    shapePath(1);
    const eg = ctx.createLinearGradient(0, cy - 46, 0, cy + 46);
    eg.addColorStop(0, shade(acc, 0.35)); eg.addColorStop(0.5, acc); eg.addColorStop(1, shade(acc, -0.25));
    ctx.fillStyle = eg; ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.45)'; shapePath(1); ctx.stroke();
    shapePath(0.84);
    const ig = ctx.createRadialGradient(cx, cy - 20, 5, cx, cy, 50);
    ig.addColorStop(0, shade(main, -0.25)); ig.addColorStop(1, shade(main, -0.7));
    ctx.fillStyle = ig; ctx.fill();
    ctx.save();
    shapePath(0.84); ctx.clip();
    ctx.translate(cx - 40, cy - 16); ctx.scale(80 / W, 80 / W);
    if (a[4]) drawWeapon(ctx, a[3], a[4], { px: 80 / W, shadow: false });
    else drawWeapon(ctx, a[3], null, { mono: acc });
    ctx.restore();

    // объём деталей
    const hc = mk(432, 268), gc = mk(432, 268);
    [[hc, 'h'], [gc, 'g']].forEach((m) => {
      const x = m[0].getContext('2d');
      x.translate(-40, -84);
      crateRelief(x, m[1], (xx, k) => emblemPath(xx, a[2], cx, cy, k));
    });
    relight(cv, hc, gc, { mask: 'alpha', k: 5, r: 1.1, spec: 0.8, ao: 1.6 });
    return cv;
  }

  return { build: buildCrate };
})();
