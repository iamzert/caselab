'use strict';

// Процедурные текстуры раскрасок (canvas). Всё генерируется в коде, без картинок.
// Текстура покрывает всё поле оружия 512×192 и рендерится в масштабе S.
const Tex = (function () {
  const W = 512, H = 192, S = 2;   // S — пикселей на единицу модели: чем больше, тем чётче скины
  const cache = {};

  // ---------- Случайность и шум ----------
  function seedOf(str) { return Math.floor(hash01(str) * 4294967000) + 1; }
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function perlin(seed) {
    const R = rng(seed);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    const p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const gx = [1, -1, 1, -1, 1, -1, 0, 0], gy = [1, 1, -1, -1, 0, 0, 1, -1];
    return function (x, y) {
      let X = Math.floor(x), Y = Math.floor(y);
      const xf = x - X, yf = y - Y;
      X &= 255; Y &= 255;
      const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
      const aa = p[p[X] + Y] & 7, ab = p[p[X] + Y + 1] & 7, ba = p[p[X + 1] + Y] & 7, bb = p[p[X + 1] + Y + 1] & 7;
      const x1 = gx[aa] * xf + gy[aa] * yf, x2 = gx[ba] * (xf - 1) + gy[ba] * yf;
      const y1 = gx[ab] * xf + gy[ab] * (yf - 1), y2 = gx[bb] * (xf - 1) + gy[bb] * (yf - 1);
      const l1 = x1 + u * (x2 - x1), l2 = y1 + u * (y2 - y1);
      return l1 + v * (l2 - l1);
    };
  }
  function fbm(n, x, y, oct) {
    let a = 0.5, f = 1, s = 0, norm = 0;
    for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); norm += a; a *= 0.5; f *= 2.03; }
    return s / norm;
  }

  // ---------- Цвет ----------
  function rgb(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  function pal(cols) {
    const c = cols.map(rgb);
    return function (t) {
      t = clamp01(t);
      const f = t * (c.length - 1);
      const i = Math.min(c.length - 2, Math.floor(f));
      return mix(c[i], c[i + 1], f - i);
    };
  }
  function shade(hex, amt) {
    const c = rgb(hex), tg = amt > 0 ? 255 : 0, k = Math.abs(amt);
    return 'rgb(' + c.map((v) => Math.round(v + (tg - v) * k)).join(',') + ')';
  }

  // ---------- Холсты ----------
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function full() { return mk(W * S, H * S); }

  // Попиксельная генерация в пониженном разрешении r с последующим масштабированием
  // r — доля разрешения; поднимаем её в 1.6 раза (не выше 1): 0.625 → полное разрешение, 0.5 → 0.8 — узоры без мыла
  function pixels(r, fn) {
    r = Math.min(1, r * 2);
    const w = Math.round(W * S * r), h = Math.round(H * S * r);
    const c = mk(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
    const kx = W / w, ky = H / h;
    let o = 0;
    for (let j = 0; j < h; j++) {
      const y = (j + 0.5) * ky;
      for (let i = 0; i < w; i++) {
        const col = fn((i + 0.5) * kx, y);
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = col.length > 3 ? col[3] : 255;
        o += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (r >= 1) return c;
    const out = full(), octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(c, 0, 0, out.width, out.height);
    return out;
  }

  function vec(draw) {
    const c = full(), ctx = c.getContext('2d');
    ctx.scale(S, S);
    draw(ctx);
    return c;
  }

  // Мелкое зерно поверх любой текстуры — убирает «пластиковость»
  let grainTile = null;
  function grain(c, amount) {
    if (!grainTile) {
      grainTile = mk(96, 96);
      const g = grainTile.getContext('2d'), img = g.createImageData(96, 96), R = rng(77);
      for (let i = 0; i < img.data.length; i += 4) { const v = 90 + R() * 76; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
    }
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.globalAlpha = amount;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(grainTile, 'repeat');
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
    return c;
  }

  function blob(ctx, x, y, r, R) {
    const n = 9, pts = [];
    for (let k = 0; k < n; k++) { const a = k / n * 6.2832; const rad = r * (0.72 + R() * 0.5); pts.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad]); }
    ctx.beginPath();
    for (let k = 0; k <= n; k++) {
      const p = pts[k % n], q = pts[(k + 1) % n];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (k === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p[0], p[1], mx, my);
    }
    ctx.fill();
  }

  // ---------- Генераторы раскрасок ----------
  const GEN = {
    gloss(f, R, n) {
      const a = rgb(f.c[0]), b = rgb(f.c[1]);
      // узор очень плавный — половинного разрешения хватает (вид прежний, генерация вдвое быстрее)
      return pixels(0.25, (x, y) => mix(a, b, 0.22 * (0.5 + 0.7 * fbm(n, x * 0.006, y * 0.009, 2))));
    },
    grad(f) {
      return vec((ctx) => {
        const g = ctx.createLinearGradient(40, 170, 480, 20);
        g.addColorStop(0, f.c[0]); g.addColorStop(0.5, f.c[1]); g.addColorStop(1, f.c[2]);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      });
    },
    // Металл: ровный тон с мягкими крупными переливами и тонкой шлифовкой.
    // Блики не запекаем — их даёт свет (art.js); здесь только цвет и фактура.
    metal(f, R, n) {
      const hi = rgb(f.c[0]), mid = rgb(f.c[1]), lo = rgb(f.c[2]);
      const c = pixels(0.25, (x, y) => {
        const v = fbm(n, x * 0.0035, y * 0.007, 2);
        return v > 0 ? mix(mid, hi, Math.min(0.32, v * 0.75)) : mix(mid, lo, Math.min(0.26, -v * 0.6));
      });
      const ctx = c.getContext('2d');
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = brushed(ctx); ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-over';
      return c;
    },
    // Камуфляж: 3–4 крупных пятна на деталь, гладкие края, без мелкой крошки
    camo(f, R, n, n2, n3) {
      const c = f.c.map(rgb);
      // пятна крупные — хватает трети разрешения (генерация вдвое быстрее, края остаются мягкими)
      return pixels(0.17, (x, y) => {
        const wx = x + 16 * fbm(n3, x * 0.007, y * 0.007, 2);
        if (fbm(n3, wx * 0.0105 + 9, y * 0.016, 2) > 0.26) return c[3];
        if (fbm(n2, wx * 0.0075 + 5, y * 0.0125, 2) > 0.13) return c[2];
        if (fbm(n, wx * 0.006, y * 0.0105, 2) > 0.03) return c[1];
        return c[0];
      });
    },
    // Ржавчина: крупные мягкие разводы и редкие тёмные пятна вместо мелкой «сыпи»
    noise(f, R, n, n2) {
      const P = pal([f.c[2], f.c[0], f.c[1], f.c[0]]), dark = rgb(f.c[2]);
      return pixels(0.25, (x, y) => {
        const c = P(0.5 + 0.7 * fbm(n, x * 0.009, y * 0.014, 3));
        return mix(c, dark, 0.4 * smooth(0.18, 0.34, fbm(n2, x * 0.022, y * 0.03, 2)));
      });
    },
    // Карбон: плетение крупнее и мягче — на карточке читается как фактура, а не рябь
    carbon(f) {
      const q = 9, tile = mk(q * 2 * S, q * 2 * S), t = tile.getContext('2d');
      t.scale(S, S);
      const m = 'rgb(' + mix(rgb(f.c[0]), rgb(f.c[1]), 0.75).map(Math.round).join(',') + ')';
      const cell = (x, y, horiz) => {
        const g = horiz ? t.createLinearGradient(x, y, x, y + q) : t.createLinearGradient(x, y, x + q, y);
        g.addColorStop(0, f.c[0]); g.addColorStop(0.5, m); g.addColorStop(1, f.c[0]);
        t.fillStyle = g; t.fillRect(x, y, q, q);
      };
      cell(0, 0, true); cell(q, 0, false); cell(0, q, false); cell(q, q, true);
      const c = full(), ctx = c.getContext('2d');
      ctx.fillStyle = ctx.createPattern(tile, 'repeat');
      ctx.fillRect(0, 0, c.width, c.height);
      return c;
    },
    // Полосы: немного широких диагональных полос вместо частой «зебры»
    stripes(f) {
      return vec((ctx) => {
        ctx.fillStyle = f.c[0]; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.7);
        ctx.fillStyle = f.c[1];
        for (let x = -440; x < 440; x += 76) ctx.fillRect(x, -320, 30, 640);
        ctx.restore();
      });
    },
    tiger(f, R, n, n2) {
      const base = rgb(f.c[0]), dark = rgb(f.c[1]), hi = rgb(f.c[2]);
      // 5–7 широких полос поперёк оружия, к верхнему и нижнему краю сужаются в клин;
      // полосы широкие — считаем в трети разрешения (запас по времени генерации)
      return pixels(0.17, (x, y) => {
        const w = x * 0.0125 + 1.1 * fbm(n, x * 0.004, y * 0.011, 2) + 0.1 * n2(x * 0.016, y * 0.03);
        const s = Math.abs(Math.sin(w * Math.PI));
        const e = Math.abs(y - 96) / 96;
        const thr = 0.66 + 0.3 * e * e + 0.07 * n2(x * 0.01 + 3, y * 0.012);
        const body = mix(base, hi, clamp01(0.4 + 0.7 * n(x * 0.005 + 7, y * 0.008)));
        return mix(body, dark, smooth(thr - 0.03, thr + 0.03, s));
      });
    },
    // Соты: крупные ячейки, тонкие мягкие грани и редкие залитые ячейки
    hex(f, R) {
      return vec((ctx) => {
        ctx.fillStyle = f.c[0]; ctx.fillRect(0, 0, W, H);
        const s = 21, hh = Math.sqrt(3) * s;
        const cells = [];
        ctx.beginPath();
        for (let col = 0, x = 0; x < W + s * 2; col++, x += s * 1.5) {
          for (let y = (col % 2) * hh / 2 - hh; y < H + hh; y += hh) {
            ctx.moveTo(x + s, y);
            for (let k = 1; k <= 6; k++) ctx.lineTo(x + s * Math.cos(k * Math.PI / 3), y + s * Math.sin(k * Math.PI / 3));
            if (R() < 0.16) cells.push([x, y]);
          }
        }
        ctx.strokeStyle = f.c[1]; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.6;
        ctx.shadowColor = f.c[1]; ctx.shadowBlur = 3 * S;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = f.c[1];
        cells.forEach((p) => {
          ctx.globalAlpha = 0.12 + R() * 0.16;
          ctx.beginPath();
          for (let k = 0; k <= 6; k++) ctx.lineTo(p[0] + (s - 2.5) * Math.cos(k * Math.PI / 3), p[1] + (s - 2.5) * Math.sin(k * Math.PI / 3));
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      });
    },
    // Пиксельный камуфляж: крупные квадраты, плавное поле без мелкого шума
    pixel(f, R, n) {
      return vec((ctx) => {
        const c = f.c, cs = 12;
        for (let y = 0; y < H; y += cs) {
          for (let x = 0; x < W; x += cs) {
            const v = fbm(n, x * 0.0085, y * 0.015, 2);
            ctx.fillStyle = v < -0.13 ? c[2] : v < 0.04 ? c[0] : v < 0.19 ? c[1] : c[3];
            ctx.fillRect(x, y, cs, cs);
          }
        }
      });
    },
    // Мрамор: два-три широких плавных развода без мелких завихрений.
    // Светлый тон c[2] — не в палитре (иначе читается как запечённый блик), а только редкими узкими прожилками без ореола.
    marble(f, R, n, n2, n3) {
      const P = pal([f.c[0], f.c[1], f.c[3], f.c[1], f.c[0]]), vein = rgb(f.c[2]);
      return pixels(0.17, (x, y) => {
        const px = x * 0.0036, py = y * 0.0054;
        const qx = fbm(n, px, py, 2), qy = fbm(n2, px + 5.2, py + 1.3, 2);
        const v = fbm(n3, px + 1.5 * qx + 1.7, py + 1.5 * qy + 9.2, 2);
        const c = P(0.5 + 1.1 * v);
        return mix(c, vein, 0.5 * (1 - smooth(0.004, 0.014, Math.abs(v - 0.16))));
      });
    },
    // Волны: две-три широкие волны с мягкой пеной
    waves(f, R, n) {
      const deep = rgb(f.c[0]), mid = rgb(f.c[1]), foam = rgb(f.c[2]);
      return pixels(0.25, (x, y) => {
        const base = mix(mid, deep, clamp01(y / H * 0.9 + 0.25 * fbm(n, x * 0.006, y * 0.008, 2)));
        const w = Math.sin(x * 0.022 + y * 0.075 + 2 * fbm(n, x * 0.005, y * 0.009, 2));
        const c = mix(base, mid, 0.35 * smooth(0.35, 0.8, w));
        return mix(c, foam, 0.65 * smooth(0.88, 0.98, w));
      });
    },
    // Лава: редкие широкие трещины с мягким свечением
    cracks(f, R, n, n2) {
      const rock = rgb(f.c[0]), hot = rgb(f.c[1]), core = rgb(f.c[2]);
      const rock2 = [rock[0] * 1.6 + 14, rock[1] * 1.5 + 10, rock[2] * 1.5 + 8];
      return pixels(0.25, (x, y) => {
        const r = 1 - Math.abs(fbm(n, x * 0.0075, y * 0.012, 3)) * 2.3;
        let c = mix(rock, rock2, clamp01(0.5 + fbm(n2, x * 0.01, y * 0.014, 2)));
        if (r > 0.7) c = mix(c, hot, smooth(0.7, 0.88, r));
        if (r > 0.9) c = mix(c, core, smooth(0.9, 0.98, r));
        return c;
      });
    },
    // Драконья чешуя: крупные плоские чешуйки (около 110 на поле), кромка мягко уходит в c[2],
    // контур тонкий и прозрачный; объём не запекаем — его даёт свет. Тон слегка «гуляет» крупными пятнами.
    scales(f, R, n) {
      const body = rgb(f.c[1]), deep = rgb(f.c[0]), rim = rgb(f.c[2]);
      // классическая чешуя: круги касаются в ряду, ряды рисуем снизу вверх — верхний ряд прячет прямой край нижнего
      const sw = 44, sh = 22, r = sw / 2;
      // одна кромка-спрайт на все чешуйки: прозрачный центр, у края — переход к c[2]
      const sp = mk(2 * r * S, r * S), st = sp.getContext('2d');
      st.scale(S, S);
      const g = st.createRadialGradient(r, 0, 0, r, 0, r);
      g.addColorStop(0, 'rgba(' + rim.join(',') + ',0)'); g.addColorStop(0.62, 'rgba(' + rim.join(',') + ',0)');
      g.addColorStop(1, 'rgba(' + rim.join(',') + ',0.55)');
      st.fillStyle = g; st.beginPath(); st.arc(r, 0, r, 0, Math.PI); st.closePath(); st.fill();
      return vec((ctx) => {
        ctx.fillStyle = f.c[0]; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.7;
        for (let row = 0, y = Math.ceil(H / sh) * sh; y >= -sh; row++, y -= sh) {
          for (let x = (row % 2 ? sw / 2 : 0) - sw; x < W + sw; x += sw) {
            const t = fbm(n, x * 0.006, y * 0.01, 2);
            const c = t > 0 ? mix(body, rim, Math.min(0.18, t * 0.4)) : mix(body, deep, Math.min(0.3, -t * 0.7));
            ctx.fillStyle = 'rgb(' + c.map(Math.round).join(',') + ')';
            ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();   // круг целиком: верх закрывает щели между чешуйками ряда выше
            ctx.drawImage(sp, x - r, y, 2 * r, r);
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI); ctx.stroke();
          }
        }
      });
    },
    stars(f, R, n, n2, n3) {
      const P = pal([f.c[0], f.c[0], f.c[1], f.c[2], f.c[3]]);
      // туманность — пара крупных мягких облаков; звёзд немного, видны отдельные яркие
      const c = pixels(0.25, (x, y) => {
        const px = x * 0.0065, py = y * 0.01;
        const qx = fbm(n, px, py, 2), qy = fbm(n2, px + 3.1, py + 7.7, 2);
        return P(0.4 + 1.1 * fbm(n3, px + 2 * qx, py + 2 * qy, 3));
      });
      const ctx = c.getContext('2d');
      ctx.scale(S, S);
      ctx.fillStyle = f.c[3];
      for (let i = 0; i < 46; i++) {
        const big = i < 7;
        const rad = big ? 1.1 + R() * 0.8 : 0.4 + R() * 0.4;
        ctx.globalAlpha = big ? 0.95 : 0.35 + R() * 0.4;
        ctx.shadowColor = f.c[3]; ctx.shadowBlur = big ? 5 * S : 0;
        ctx.beginPath(); ctx.arc(R() * W, R() * H, rad, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      return c;
    },
    // Сакура: несколько крупных цветков по всей длине и редкие лепестки
    dots(f, R) {
      return vec((ctx) => {
        ctx.fillStyle = f.c[0]; ctx.fillRect(0, 0, W, H);
        const NF = 12;
        for (let i = 0; i < NF; i++) {
          const x = (i + 0.2 + R() * 0.6) * W / NF, y = 36 + R() * 84, r = 9 + R() * 4;   // полоса y 36..120 — там у моделей основные детали
          ctx.save(); ctx.translate(x, y); ctx.rotate(R() * 6.28);
          ctx.fillStyle = f.c[1]; ctx.globalAlpha = 0.92;
          for (let k = 0; k < 5; k++) { ctx.rotate(1.2566); ctx.beginPath(); ctx.ellipse(0, -r * 0.85, r * 0.5, r * 0.85, 0, 0, 6.2832); ctx.fill(); }
          ctx.globalAlpha = 1; ctx.fillStyle = f.c[3];
          ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, 6.2832); ctx.fill();
          ctx.fillStyle = f.c[2];
          ctx.beginPath(); ctx.arc(0, 0, r * 0.14, 0, 6.2832); ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = f.c[1];
        for (let i = 0; i < 14; i++) {
          ctx.globalAlpha = 0.55 + R() * 0.3;
          ctx.beginPath(); ctx.ellipse(R() * W, R() * H, 2.6 + R() * 2, 1.4 + R(), R() * 3, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
    },
    // Дамаск: 7–9 широких плавных слоёв стали, контраст умеренный
    damascus(f, R, n, n2) {
      const P = pal([f.c[2], f.c[1], f.c[0], f.c[1], f.c[2]]);
      return pixels(0.25, (x, y) => {
        const w = y * 0.085 + 3.2 * fbm(n, x * 0.004, y * 0.01, 2) + 0.45 * fbm(n2, x * 0.012, y * 0.02, 2);
        return P(0.1 + 0.36 * (0.5 + 0.5 * Math.sin(w * Math.PI)));
      });
    },
    // Калёная сталь: крупные мягкие зоны цветов побежалости
    patina(f, R, n, n2, n3) {
      const P = pal([f.c[3], f.c[0], f.c[1], f.c[2], f.c[3], f.c[0]]);
      // частота и искажение снижены — две-три крупные зоны цвета вместо мелких завихрений
      return pixels(0.17, (x, y) => {
        const px = x * 0.004, py = y * 0.006;
        const qx = fbm(n, px, py, 2), qy = fbm(n2, px + 2.3, py + 4.1, 2);
        return P(0.5 + 1.2 * fbm(n3, px + 1.1 * qx, py + 1.1 * qy, 2));
      });
    },
    panel(f) {
      const white = f.c[0], orange = f.c[1], black = f.c[2];
      return vec((ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, white); g.addColorStop(1, shade(white, -0.14));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // только крупные плоскости: белая панель, оранжевая диагональ, чёрные блоки и две тонкие полосы (без надписей и маркеров)
        ctx.fillStyle = orange;
        ctx.beginPath(); ctx.moveTo(120, H); ctx.lineTo(200, 0); ctx.lineTo(262, 0); ctx.lineTo(182, H); ctx.fill();
        ctx.fillStyle = black;
        ctx.beginPath(); ctx.moveTo(300, 0); ctx.lineTo(512, 0); ctx.lineTo(512, 72); ctx.lineTo(382, 72); ctx.lineTo(354, 42); ctx.lineTo(300, 42); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(92, 150); ctx.lineTo(112, H); ctx.lineTo(0, H); ctx.fill();
        ctx.fillStyle = orange; ctx.fillRect(330, 122, 182, 6); ctx.fillRect(330, 132, 120, 3);
      });
    },
    splatter(f, R) {
      return vec((ctx) => {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, shade(f.c[0], 0.1)); g.addColorStop(1, f.c[0]);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // четыре крупные кляксы вдоль оружия (цвета по очереди) с каплями и одним подтёком, плюс редкие брызги
        for (let i = 0; i < 4; i++) {
          const x = (i + 0.25 + R() * 0.5) * W / 4, y = 44 + R() * 70, r = 24 + R() * 10;
          ctx.fillStyle = f.c[1 + (i % 2)]; ctx.globalAlpha = 0.95;
          blob(ctx, x, y, r, R);
          for (let k = 0; k < 7; k++) {
            const a = R() * 6.2832, d = r * (1.15 + R() * 0.9);
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.07 + R() * 0.12), 0, 6.2832); ctx.fill();
          }
          const dx = x + (R() - 0.5) * r * 0.6, len = r * (1.2 + R() * 1.2), dw = r * 0.16;
          ctx.fillRect(dx - dw / 2, y, dw, len);
          ctx.beginPath(); ctx.arc(dx, y + len, dw * 0.85, 0, 6.2832); ctx.fill();
        }
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = f.c[1 + (i % 2)]; ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.arc(R() * W, R() * H, 1.5 + R() * 2.5, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
    },
    // Микросхема: редкая сетка, полтора десятка толстых дорожек с контактами и две микросхемы
    circuit(f, R) {
      return vec((ctx) => {
        ctx.fillStyle = f.c[0]; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = f.c[2]; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.6; ctx.beginPath();
        for (let x = 0; x < W; x += 32) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (let y = 0; y < H; y += 32) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke();
        ctx.globalAlpha = 1;
        const pads = [], NT = 16;
        ctx.beginPath();
        for (let i = 0; i < NT; i++) {
          let x = Math.round((i + R()) * W / NT / 16) * 16, y = Math.round((40 + R() * 80) / 16) * 16;
          ctx.moveTo(x, y); pads.push([x, y]);
          const steps = 2 + Math.floor(R() * 3);
          for (let s = 0; s < steps; s++) {
            const len = 16 * (1 + Math.floor(R() * 3)), dir = Math.floor(R() * 5);
            if (dir < 2) x += len; else if (dir === 2) y += len; else if (dir === 3) y -= len; else { x += len; y += len * (R() < 0.5 ? 1 : -1); }
            ctx.lineTo(x, y);
          }
          pads.push([x, y]);
        }
        ctx.strokeStyle = f.c[1]; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.shadowColor = f.c[1]; ctx.shadowBlur = 3 * S;
        ctx.stroke();
        ctx.fillStyle = f.c[1];
        pads.forEach((p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 3.6, 0, 6.2832); ctx.fill(); });
        ctx.shadowBlur = 0;
        for (let i = 0; i < 2; i++) {
          const x = (i * 0.5 + 0.1 + R() * 0.3) * W, y = 40 + R() * 60;
          ctx.fillStyle = shade(f.c[0], -0.5); ctx.fillRect(x, y, 46, 22);
          ctx.strokeStyle = f.c[1]; ctx.lineWidth = 1.4; ctx.strokeRect(x, y, 46, 22);
        }
      });
    },

    // ---------- Раскраски реликвий ----------
    // Пламя: вытянутые вдоль оружия языки огня (гребни турбулентного шума)
    flame(f, R, n, n2) {
      const P = pal([f.c[0], f.c[1], f.c[2], f.c[3], '#fffbe6']);
      return pixels(0.5, (x, y) => {
        const wx = fbm(n2, x * 0.01, y * 0.04, 2);
        const v = fbm(n, x * 0.0045 + 1.6 * wx, y * 0.034, 4);
        const ridge = clamp01(1 - Math.abs(v * 2.4));     // светлые гребни — языки пламени
        const t = clamp01(Math.pow(ridge, 2.6) * 1.2 + 0.05 + 0.06 * Math.sin(x * 0.02));
        return P(t);
      });
    },
    // Чёрный опал: тёмная основа с переливающимися цветными «искрами»
    opal(f, R, n, n2, n3) {
      const base = rgb(f.c[0]);
      const P = pal([f.c[1], f.c[2], f.c[3], f.c[4], f.c[1]]);
      return pixels(0.5, (x, y) => {
        const px = x * 0.012, py = y * 0.02;
        const wx = fbm(n, px, py, 3), wy = fbm(n2, px + 4.1, py + 2.7, 3);
        const hue = 0.5 + fbm(n3, px * 1.7 + 2.6 * wx, py * 1.7 + 2.6 * wy, 3);
        const fire = smooth(-0.12, 0.26, fbm(n2, px * 2.4 + wx * 1.5, py * 2.4 - wy * 1.5, 3));
        const c = P(clamp01(hue));
        const k = 1.1 + 0.25 * fire;
        return mix(base, [c[0] * k, c[1] * k, c[2] * k], fire * 0.95);
      });
    },
    // Император: полированное золото с гравированными завитками и редкими камнями
    filigree(f, R, n) {
      const P = pal([f.c[2], f.c[1], f.c[0], f.c[1], f.c[2]]);
      const c = pixels(0.625, (x, y) => {
        const band = 0.5 + 0.5 * Math.sin(x * 0.022 + y * 0.01 + 2 * fbm(n, x * 0.004, y * 0.008, 2));
        return P(0.25 + band * 0.6);
      });
      const ctx = c.getContext('2d');
      ctx.scale(S, S);
      ctx.lineCap = 'round';
      const curl = (cx, cy, s, dir) => {
        ctx.beginPath();
        for (let t = 0; t <= 9.5; t += 0.25) {
          const r = s * (0.25 + t * 0.11), a = dir * t;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.8;
          if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      for (let gy = 10; gy < H; gy += 26) {
        for (let gx = (gy / 26) % 2 ? 0 : 20; gx < W; gx += 40) {
          const dir = R() < 0.5 ? 1 : -1, s = 7 + R() * 3;
          ctx.strokeStyle = 'rgba(70,40,0,.62)'; ctx.lineWidth = 1.1; curl(gx, gy, s, dir);
          ctx.save(); ctx.translate(0.6, 0.6); ctx.strokeStyle = 'rgba(255,248,210,.5)'; ctx.lineWidth = 0.5; curl(gx, gy, s, dir); ctx.restore();
        }
      }
      for (let i = 0; i < 18; i++) {
        const x = R() * W, y = R() * H, col = R() < 0.5 ? f.c[3] : f.c[4];
        ctx.shadowColor = col; ctx.shadowBlur = 5 * S;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 6.2832); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x - 0.5, y - 0.5, 0.6, 0, 6.2832); ctx.fill();
      }
      return c;
    },
    // Алмаз: грани кристалла (ячейки Вороного разной яркости) и искры
    crystal(f, R) {
      const P = pal([f.c[2], f.c[1], f.c[0], f.c[3]]);
      const cell = 20, gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
      const pts = [];
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) pts.push([(i - 1 + R()) * cell, (j - 1 + R()) * cell, R()]);
      const c = pixels(0.5, (x, y) => {
        const ci = Math.floor(x / cell) + 1, cj = Math.floor(y / cell) + 1;
        let d1 = 1e9, d2 = 1e9, v = 0;
        for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
          const p = pts[j * gw + i];
          if (!p) continue;
          const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
          if (d < d1) { d2 = d1; d1 = d; v = p[2]; } else if (d < d2) d2 = d;
        }
        const edge = smooth(0, 3.2, Math.sqrt(d2) - Math.sqrt(d1));
        const shade = 0.3 + 0.7 * v * (0.75 + 0.25 * Math.sin(x * 0.05 + v * 6));
        const col = P(shade);
        const k = 0.55 + 0.45 * edge;
        return [col[0] * k + (1 - edge) * 60, col[1] * k + (1 - edge) * 70, col[2] * k + (1 - edge) * 90];
      });
      const ctx = c.getContext('2d');
      ctx.scale(S, S);
      for (let i = 0; i < 40; i++) {
        const x = R() * W, y = R() * H, s = 1.5 + R() * 3.5;
        ctx.globalAlpha = 0.5 + R() * 0.5;
        ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 4 * S;
        ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.22, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.22, y); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x, y + s * 0.22); ctx.lineTo(x + s, y); ctx.lineTo(x, y - s * 0.22); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      return c;
    },
  };

  // Текстура раскраски (кэшируется)
  function get(finishId) { return make(finishId, FINISHES[finishId]); }
  // Текстура по описанию раскраски без записи в FINISHES (заводские материалы деталей в art.js)
  function make(key, f) {
    if (cache[key]) return cache[key];
    const seed = seedOf(key);
    const R = rng(seed);
    const gen = GEN[f.kind] || GEN.gloss;
    const c = gen(f, R, perlin(seed), perlin(seed + 101), perlin(seed + 202));
    grain(c, f.kind === 'metal' ? 0.08 : 0.14);
    cache[key] = c;
    return c;
  }

  // ---------- Износ: сколы краски (общие для всех предметов) ----------
  const chipCache = {};
  const COVER = [0, 0.012, 0.04, 0.09, 0.2];
  function chips(level) {
    if (chipCache[level]) return chipCache[level];
    const r = 0.625, w = Math.round(W * S * r), h = Math.round(H * S * r);
    const n = perlin(4242), n2 = perlin(4343);
    const vals = new Float32Array(w * h);
    let o = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const x = (i + 0.5) * W / w, y = (j + 0.5) * H / h;
        vals[o++] = fbm(n, x * 0.045, y * 0.06, 4) + 0.35 * n2(x * 0.2, y * 0.2);
      }
    }
    const sorted = Array.prototype.slice.call(vals).sort((a, b) => a - b);
    const t = sorted[Math.floor(sorted.length * (1 - COVER[level]))];
    const rim = (sorted[sorted.length - 1] - t) * 0.22;
    const c = mk(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
    for (let k = 0; k < vals.length; k++) {
      const v = vals[k], p = k * 4;
      if (v > t + rim) { d[p] = 196; d[p + 1] = 201; d[p + 2] = 208; d[p + 3] = 255; }
      else if (v > t) { d[p] = 58; d[p + 1] = 62; d[p + 2] = 68; d[p + 3] = 235; }
    }
    ctx.putImageData(img, 0, 0);
    const out = full(), octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.drawImage(c, 0, 0, out.width, out.height);
    if (level >= 2) {
      const R = rng(99 + level);
      octx.scale(S, S);
      octx.strokeStyle = 'rgba(220,225,232,.55)';
      const cnt = [0, 0, 8, 16, 30][level];
      for (let i = 0; i < cnt; i++) {
        const x = R() * W, y = R() * H, len = 10 + R() * 50, a = (R() - 0.5) * 0.6;
        octx.lineWidth = 0.4 + R() * 0.7;
        octx.beginPath(); octx.moveTo(x, y); octx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); octx.stroke();
      }
    }
    chipCache[level] = out;
    return out;
  }

  // ---------- Мелкая фактура полимера и металла, грязь для ящиков ----------
  let polyTile = null;
  function polymer(ctx) {
    if (!polyTile) {
      polyTile = mk(64, 64);
      const g = polyTile.getContext('2d'), img = g.createImageData(64, 64), R = rng(5);
      for (let i = 0; i < img.data.length; i += 4) { const v = R() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 24; }
      g.putImageData(img, 0, 0);
    }
    return ctx.createPattern(polyTile, 'repeat');
  }

  // Шлифованный металл: тонкие продольные риски вместо зерна
  let brushTile = null;
  function brushed(ctx) {
    if (!brushTile) {
      const w = 256, h = 48;
      brushTile = mk(w, h);
      const g = brushTile.getContext('2d'), img = g.createImageData(w, h), R = rng(11);
      for (let y = 0; y < h; y++) {
        const base = R(), amp = 0.25 + R() * 0.5;
        for (let x = 0; x < w; x++) {
          const t = x / w * Math.PI * 2;
          const v = base * 0.6 + amp * 0.4 * (0.5 + 0.5 * Math.sin(t * (1 + (y % 3)) + base * 6));
          const p = (y * w + x) * 4;
          img.data[p] = img.data[p + 1] = img.data[p + 2] = Math.round(v * 255);
          img.data[p + 3] = 26;
        }
      }
      g.putImageData(img, 0, 0);
    }
    return ctx.createPattern(brushTile, 'repeat');
  }

  let grimeCv = null;
  function grime() {
    if (grimeCv) return grimeCv;
    const w = 256, h = 192, n = perlin(808), n2 = perlin(909);
    const c = mk(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
    let o = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const v = fbm(n, i * 0.03, j * 0.03, 4), s = n2(i * 0.3, j * 0.3);
        if (v > 0.12) { d[o] = 20; d[o + 1] = 16; d[o + 2] = 12; d[o + 3] = Math.min(150, (v - 0.12) * 600); }
        else if (s > 0.55) { d[o] = 235; d[o + 1] = 235; d[o + 2] = 235; d[o + 3] = 70; }
        o += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
    grimeCv = c;
    return c;
  }

  // Расширение: генераторы новых узоров лежат в js/tex_*.js и регистрируются через addGen.
  // Сигнатура генератора: gen(f, R, n, n2, n3) → canvas W*S × H*S (f — запись FINISHES, R — случайность, n* — шумы Перлина)
  function addGen(kind, fn) {
    GEN[kind] = fn;
    Object.keys(cache).forEach((id) => { if (FINISHES[id] && FINISHES[id].kind === kind) delete cache[id]; });
  }
  const lib = { W: W, H: H, S: S, rng: rng, perlin: perlin, fbm: fbm, rgb: rgb, mix: mix, clamp01: clamp01, smooth: smooth,
    pal: pal, shade: shade, mk: mk, full: full, pixels: pixels, vec: vec, grain: grain, blob: blob, seedOf: seedOf };

  return { W: W, H: H, S: S, get: get, make: make, chips: chips, polymer: polymer, brushed: brushed, grime: grime, rgb: rgb, shade: shade, rng: rng, perlin: perlin, fbm: fbm,
    addGen: addGen, lib: lib, hasGen: (kind) => !!GEN[kind] };
})();
