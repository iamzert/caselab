'use strict';

// =====================================================================
// Звуки «Кейс Лаб» — синтез через WebAudio, без внешних файлов.
// Схема спокойная и «дорогая»: звучат предметы, а не игровой автомат.
//  · щелчки — короткие импульсы отфильтрованного шума (контакт + корпус), без тона и писка;
//    щелчок ленты заготовлен заранее в нескольких вариантах равной энергии — все щелчки
//    одной громкости, а не «как выпадет шум»;
//  · удары — низкий синус с быстрым падением высоты, вторая гармоника (её слышно и в динамике
//    телефона) и войлочный шумовой «тук»;
//  · выигрыши — деревянные пластины под войлочной палочкой (тон + настроенный обертон ×4, как
//    у маримбы), аккорд берётся одним ударом. Чем реже предмет, тем аккорд полнее и громче
//    (≈ +1,8 дБ за ступень по A-взвешенной громкости, +1,1–1,8 дБ в полосе динамика телефона),
//    а верхняя нота с редкостью не опускается; но всегда коротко и тихо;
//  · очень редкий дроп — мягкий низкий удар, широкий аккорд и металлический тон с негармоничными
//    призвуками (как у маленькой поющей чаши); не тише самого громкого обычного выигрыша.
// Служебные звуки (кнопка, продажа, покупка, ошибка, открытие) тише самого простого выигрыша.
// Никаких квадратных и пилообразных волн, подъёмов высоты, «лесенок» нот, блёсток и подкладок.
// Уровни сверены офлайн-рендером (48 кГц, худший из 5 сидов): щелчки интерфейса ≤ −18 dBFS,
// выигрыши ≤ −10 dBFS, тоновых составляющих выше 8 кГц нет; на выходе мягкий ограничитель —
// наложения не клиппируют.
// =====================================================================
const Sfx = (function () {
  const VOL = 0.18;        // общая громкость (было 0.3)
  const LEAD = 0.015;      // запас по времени: щелчок не теряет атаку, если аудиопоток уже ушёл вперёд
  let ctx = null;
  let master = null;       // общая громкость → мягкий ограничитель → выход
  let amb = null;          // шина «с комнатой»: сухой сигнал + немного короткой реверберации
  let nbuf = null;         // белый шум, 1 с по кругу
  let ticks = [];          // заготовки щелчка ленты (AudioBuffer), играются по кругу
  let tickN = 0;
  let enabled = true;
  let paused = false;
  let unlocked = false;
  let lastTick = -1;

  const noop = function () {};
  const safe = function (p) { if (p && typeof p.catch === 'function') p.catch(noop); };
  const rnd = function (a, b) { return a + Math.random() * (b - a); };

  // Ноты (Гц): всё в ре мажоре — выигрыши разных редкостей звучат как одно семейство
  const D3 = 146.83, A3 = 220, D4 = 293.66, F4 = 349.23, Fs4 = 369.99, A4 = 440;
  const D5 = 587.33, Fs5 = 739.99, A5 = 880, Cs6 = 1108.73, E6 = 1318.51;

  // ---------- Узлы, общие для всех звуков ----------

  // Мягкий ограничитель: до −6 dBFS сигнал не трогает, выше плавно сжимает и не даёт клиппинга
  function softClip() {
    const n = 4097, cv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1) * 2 - 1, a = Math.abs(x);
      cv[i] = a <= 0.5 ? x : (x < 0 ? -1 : 1) * (0.5 + 0.45 * Math.tanh((a - 0.5) / 0.45));
    }
    return cv;
  }

  function noiseBuffer(c) {
    const n = c.sampleRate | 0, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // Небольшая комната с мягкой отделкой: отклик из затухающего шума (RT60 ≈ 0.4 с), верх гаснет
  // быстрее низа. Нужна только чтобы аккорды и удары звучали в пространстве, а не «в проводе».
  function roomIR(c) {
    const sr = c.sampleRate, n = Math.floor(sr * 0.6), b = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0, e = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const k = Math.min(0.94, 0.45 + t * 2.2);              // сглаживание растёт — хвост темнеет
        lp += (Math.random() * 2 - 1 - lp) * (1 - k);
        const v = t < 0.004 ? 0 : lp * Math.exp(-t * 6.9 / 0.4);
        d[i] = v;
        e += v * v;
      }
      const s = 1 / Math.sqrt(e || 1);                          // единичная энергия отклика
      for (let i = 0; i < n; i++) d[i] *= s;
    }
    return b;
  }

  // ---------- Заготовки щелчка ленты ----------

  // Свой генератор псевдослучайных чисел (mulberry32): заготовки одинаковы при каждом запуске
  function prng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Биквад по месту — те же формулы, что у BiquadFilterNode: 'bp' — полоса с 0 дБ в пике
  // (q линейная), 'lp' — ФНЧ (q в дБ, как в WebAudio)
  function biquad(x, type, f, q, sr) {
    const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, cw = Math.cos(w);
    const al = Math.sin(w) / (2 * (type === 'lp' ? Math.pow(10, q / 20) : q)), a0 = 1 + al;
    let b0 = al, b1 = 0, b2 = -al;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    b0 /= a0; b1 /= a0; b2 /= a0;
    const a1 = -2 * cw / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
    }
  }

  // Слои щелчка храповика: собачка соскакивает (шорох повыше), через 3,5 мс — контакт и корпус.
  // d — задержка, f/q — полоса, lp — срез верха, v — громкость, a — атака, tau — спад
  const TICK = [
    { d: 0, f: 3000, q: 0.9, lp: 5000, v: 0.22, a: 0.0003, tau: 0.001 },
    { d: 0.0035, f: 2200, q: 1.1, lp: 3960, v: 1, a: 0.0004, tau: 0.002 },
    { d: 0.0035, f: 1100, q: 2.4, lp: 2750, v: 0.75, a: 0.0008, tau: 0.005 },
  ];

  // Энергия заготовки (сумма квадратов отсчётов) — средняя энергия такого же щелчка из случайного
  // шума (замер на 20 000 щелчков). Громкость прежняя, и при любой частоте дискретизации щелчок
  // остаётся в том же балансе с остальными шумовыми звуками
  const TICK_E = 3.1;

  // Считает 16 кандидатов, приводит их к одной энергии и оставляет 5 с самым типичным пиком:
  // щелчки звучат одинаково громко, а лёгкая разница шума между вариантами остаётся
  function tickBank(c) {
    const sr = c.sampleRate, n = Math.round(sr * 0.036), pre = Math.round(sr * 0.004);
    const fade = Math.round(sr * 0.004), rand = prng(0x7c1c4);
    const cand = [];
    for (let k = 0; k < 16; k++) {
      const out = new Float32Array(n);
      TICK.forEach(function (L) {
        const x = new Float64Array(n + pre);
        for (let i = 0; i < x.length; i++) x[i] = rand() * 2 - 1;
        biquad(x, 'bp', L.f, L.q, sr);
        biquad(x, 'lp', L.lp, 0.6, sr);
        for (let i = Math.round(L.d * sr); i < n; i++) {
          const t = i / sr - L.d;
          out[i] += L.v * x[i + pre] * (t < L.a ? t / L.a : Math.exp(-(t - L.a) / L.tau));
        }
      });
      for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
      let e = 0, p = 0;
      for (let i = 0; i < n; i++) { e += out[i] * out[i]; p = Math.max(p, Math.abs(out[i])); }
      cand.push({ d: out, e: e, p: p });
    }
    cand.forEach(function (o) { o.s = Math.sqrt(TICK_E / o.e); o.pk = o.p * o.s; });
    const med = cand.map(function (o) { return o.pk; }).sort(function (a, b) { return a - b; })[cand.length >> 1];
    cand.sort(function (a, b) { return Math.abs(a.pk - med) - Math.abs(b.pk - med); });
    return cand.slice(0, 5).map(function (o) {
      const b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = o.d[i] * o.s;
      return b;
    });
  }

  function build(c) {
    master = c.createGain();
    master.gain.value = VOL;
    let out = c.destination;
    try {
      const sh = c.createWaveShaper();
      sh.curve = softClip();
      sh.connect(c.destination);
      out = sh;
    } catch (e) { /* без ограничителя */ }
    master.connect(out);
    nbuf = noiseBuffer(c);
    try { ticks = tickBank(c); } catch (e) { ticks = []; }
    amb = c.createGain();
    amb.connect(master);
    try {
      const room = c.createConvolver();
      room.normalize = false;
      room.buffer = roomIR(c);
      const send = c.createGain();
      send.gain.value = 0.3;
      amb.connect(send);
      send.connect(room);
      room.connect(master);
    } catch (e) { /* без комнаты — только сухой сигнал */ }
  }

  function ensure() {
    if (!enabled || paused) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      build(ctx);
    }
    if (ctx.state === 'suspended') safe(ctx.resume());
    return ctx;
  }

  // Время, с которого планировать звук, или −1, если звук выключен
  function now() {
    const c = ensure();
    return c ? c.currentTime + LEAD : -1;
  }

  // ---------- Примитивы ----------

  // Огибающая: 0 → v за a секунд, затем экспоненциальный спад с постоянной tau; через hold секунд
  // после атаки хвост гаснет быстрее (tau2) — звук не тянется. Возвращает момент тишины (−70 дБ).
  function env(p, t, v, a, tau, hold, tau2) {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(v, t + a);
    p.setTargetAtTime(0, t + a, tau);
    if (hold) {
      p.setTargetAtTime(0, t + a + hold, tau2);
      return t + a + hold + tau2 * 8;
    }
    return t + a + tau * 8;
  }

  // Выход голоса — в шину bus, с панорамой pan, если браузер её умеет
  function route(node, bus, pan) {
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      p.connect(bus);
    } else node.connect(bus);
  }

  // Шумовой импульс через фильтр. o: f — частота, q — добротность, type — тип фильтра
  // (по умолчанию полосовой), lp — второй фильтр, срезающий шипящий верх (у полосового скаты
  // всего 6 дБ/окт), v — громкость, a — атака, tau/hold/tau2 — спад, bus, pan
  function burst(t, o) {
    const s = ctx.createBufferSource();
    s.buffer = nbuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.value = o.f;
    f.Q.value = o.q || 1;
    s.connect(f);
    let last = f;
    if (o.lp) {
      const l = ctx.createBiquadFilter();
      l.type = 'lowpass';
      l.frequency.value = o.lp;
      l.Q.value = 0.6;
      f.connect(l);
      last = l;
    }
    const g = ctx.createGain();
    const end = env(g.gain, t, o.v, o.a || 0.0005, o.tau, o.hold, o.tau2);
    last.connect(g);
    route(g, o.bus || master, o.pan);
    s.start(t, Math.random() * 0.9);
    s.stop(end);
    return { src: s, g: g, t0: t };
  }

  // Синус. f1 — куда падает высота (постоянная drop): только вниз, как у ударенной мембраны
  function tone(t, o) {
    const s = ctx.createOscillator();
    s.type = 'sine';
    s.frequency.setValueAtTime(o.f, t);
    if (o.f1) s.frequency.setTargetAtTime(o.f1, t, o.drop || 0.02);
    const g = ctx.createGain();
    const end = env(g.gain, t, o.v, o.a || 0.002, o.tau, o.hold, o.tau2);
    s.connect(g);
    route(g, o.bus || master, o.pan);
    s.start(t);
    s.stop(end);
    return { src: s, g: g, t0: t };
  }

  // ---------- Составные звуки ----------

  // Механический щелчок: контакт (короткий шум повыше) + корпус (полоса пониже, звучит чуть дольше)
  function knock(t, hi, lo, v, body, bus) {
    burst(t, { f: hi, q: 1.1, lp: hi * 1.8, v: v, a: 0.0004, tau: 0.002, bus: bus });
    burst(t, { f: lo, q: 2.4, lp: lo * 2.5, v: v * body, a: 0.0008, tau: 0.005, bus: bus });
  }

  // Глухой удар: низкий синус с падением высоты, вторая гармоника и войлочный «тук»
  function thud(t, f, v, tau, bus) {
    return [
      tone(t, { f: f, f1: f * 0.6, drop: tau * 0.6, v: v, a: 0.0025, tau: tau, bus: bus }),
      tone(t, { f: f * 2, f1: f * 1.2, drop: tau * 0.4, v: v * 0.45, a: 0.0015, tau: tau * 0.6, bus: bus }),
      burst(t, { f: Math.max(300, f * 3.5), q: 1, lp: 1500, v: v * 0.8, a: 0.0008, tau: 0.009, bus: bus }),
    ];
  }

  // Защёлка замка: металлический контакт, короткий звон пружины (узкая полоса шума, а не тон), корпус
  function latch(t, v, p, bus) {
    burst(t, { f: 3300 * p, q: 1.2, lp: 5500, v: v * 0.5, a: 0.0003, tau: 0.0016, bus: bus });
    burst(t, { f: 2150 * p, q: 9, v: v * 0.9, a: 0.0006, tau: 0.011, bus: bus });
    burst(t, { f: 780 * p, q: 2.5, lp: 2000, v: v * 0.35, a: 0.001, tau: 0.007, bus: bus });
  }

  // Монета ложится на сукно: контакт и две металлические моды (1 : 1.73), быстро гаснут
  function clink(t, f, v, tau) {
    burst(t, { f: 3600, q: 1, lp: 6000, v: v * 0.8, a: 0.0003, tau: 0.0012 });
    tone(t, { f: f, v: v, a: 0.0008, tau: tau });
    tone(t, { f: f * 1.73, v: v * 0.5, a: 0.0006, tau: tau * 0.6 });
  }

  // Деревянная пластина под войлочной палочкой: основной тон, обертон ×4 (быстро гаснет — даёт
  // «дерево») и мягкий шумовой удар палочки
  function mallet(t, f, v, tau, pan, bus) {
    bus = bus || amb;
    tone(t, { f: f, v: v, a: 0.004, tau: tau, hold: tau * 2.2, tau2: tau * 0.4, pan: pan, bus: bus });
    tone(t, { f: f * 4, v: v * 0.12, a: 0.0015, tau: Math.min(0.06, tau * 0.25), pan: pan, bus: bus });
    burst(t, { type: 'lowpass', f: Math.min(2200, f * 3), q: 0.6, v: v * 0.35, a: 0.0008, tau: 0.004, pan: pan, bus: bus });
  }

  // Аккорд одним ударом: крайние голоса (бас и верх) вместе, средние — на 3–8 мс позже и
  // вперемешку, без «лесенки» снизу вверх. Ноты чуть разведены по панораме, басы тише верха —
  // аккорд не гудит, а верхний голос остаётся ясным
  const LAG = [0.006, 0.003, 0.008, 0.004, 0.007, 0.005];
  function chord(t, notes, v, tau) {
    const n = notes.length;
    notes.forEach(function (f, i) {
      const pan = n > 1 ? (i / (n - 1) - 0.5) * 0.5 : 0;
      const lag = i === 0 || i === n - 1 ? 0 : LAG[(i - 1) % LAG.length];
      mallet(t + lag + rnd(0, 0.0015), f, v * (0.6 + 0.4 * Math.min(1, f / D5)), tau, pan);
    });
  }

  // Металлический тон с негармоничными призвуками ×2.71 и ×5.1 (маленькая поющая чаша)
  function bowl(t, f, v, tau) {
    tone(t, { f: f, v: v, a: 0.006, tau: tau, hold: tau * 1.8, tau2: tau * 0.4, bus: amb });
    tone(t, { f: f * 2.71, v: v * 0.3, a: 0.004, tau: tau * 0.5, bus: amb });
    tone(t, { f: f * 5.1, v: v * 0.1, a: 0.003, tau: tau * 0.22, bus: amb });
  }

  // Плавно гасит уже звучащий голос, а ещё не начавшийся глушит совсем — для пропуска эффекта
  function fade(x, at) {
    if (!x) return;
    const p = x.g.gain;
    try {
      if (x.t0 > at) {
        p.cancelScheduledValues(at);
        p.setValueAtTime(0, at);
      } else {
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(at);
        else { const v = p.value; p.cancelScheduledValues(at); p.setValueAtTime(v, at); }
        p.setTargetAtTime(0, at, 0.03);
      }
      x.src.stop(at + 0.25);    // старые движки не дают вызвать stop() второй раз — тогда хватит огибающей
    } catch (e) { /* узел уже остановлен */ }
  }

  // Выигрыш по редкости 0–5: чем реже предмет, тем полнее аккорд; верхняя нота не опускается,
  // басы (D3, A3, низкий удар) добавляют вес там, где динамик его тянет.
  // v — громкость нот (подобрана по замерам: ≈ +1,8 дБ A-взвешенной громкости за ступень),
  // tau — спад, k — щелчок ленты, low — низкий удар
  const WIN = [
    { n: [A4], v: 0.148, tau: 0.08, k: 0.16 },
    { n: [D4, A4], v: 0.217, tau: 0.1, k: 0.18 },
    { n: [D4, A4, D5], v: 0.148, tau: 0.13, k: 0.2 },
    { n: [D4, A4, D5, Fs5], v: 0.16, tau: 0.16, k: 0.22 },
    { n: [D3, A3, D4, A4, D5, Fs5], v: 0.185, tau: 0.19, k: 0.24, low: 0.25 },
    { n: [D3, A3, D4, A4, D5, Fs5, A5], v: 0.176, tau: 0.22, k: 0.26, low: 0.32 },
  ];

  return {
    // Кнопка / тап по монете на «Фарме»: глухой короткий щелчок
    click: function () {
      const t = now();
      if (t < 0) return;
      const d = rnd(0.95, 1.05);
      knock(t, 1650 * d, 700 * d, 0.88, 1.3);
      tone(t, { f: 210 * d, f1: 140 * d, drop: 0.012, v: 0.26, a: 0.001, tau: 0.01 });
    },
    // Карточка ленты прошла указатель: мягкий щелчок храповика из заготовок равной энергии
    // (высота ±6 % на громкость не влияет). Чаще ~55 раз в секунду щелчки сливаются в зуммер —
    // такие пропускаем; на быстром ходу тише, к остановке отчётливее
    tick: function () {
      const c = ensure();
      if (!c || !ticks.length) return;
      const at = c.currentTime, gap = at - lastTick;
      if (gap >= 0 && gap < 0.018) return;
      lastTick = at;
      const d = rnd(0.94, 1.06);
      const v = 0.44 * (gap < 0.12 ? 0.62 + 0.38 * (gap - 0.018) / 0.102 : 1) * rnd(0.9, 1.1);
      const s = c.createBufferSource();
      s.buffer = ticks[tickN = (tickN + 1) % ticks.length];
      s.playbackRate.value = d;
      const g = c.createGain();
      g.gain.value = v * Math.sqrt(d);
      s.connect(g);
      g.connect(master);
      s.start(at + LEAD);
    },
    // Продажа / монеты: шорох купюры и две монеты, ложащиеся на сукно (тише простого выигрыша)
    coin: function () {
      const t = now();
      if (t < 0) return;
      const d = rnd(0.97, 1.03);
      burst(t, { f: 3000, q: 0.6, lp: 5000, v: 0.036, a: 0.007, tau: 0.016 });
      clink(t + 0.01, 1960 * d, 0.08, 0.032);
      clink(t + 0.048, 2380 * d, 0.052, 0.024);
    },
    // Открытие кейса: два замка щёлкают, крышка мягко встаёт на петли. Замки и удар крышки сухие,
    // без комнаты (низкий удар с реверберацией тянул хвост), в комнату идёт только тихий воздух:
    // звук укладывается в ~150 мс, первые щелчки ленты уже не попадают в хвост
    open: function () {
      const t = now();
      if (t < 0) return;
      latch(t, 1, 1);
      latch(t + 0.032, 0.85, 0.92);
      thud(t + 0.06, 100, 0.17, 0.025);
      burst(t + 0.045, { f: 600, q: 0.7, v: 0.07, a: 0.01, tau: 0.025, bus: amb });   // воздух из-под крышки
    },
    // Покупка улучшения: нажатие и отпускание тугой кнопки и тихое тональное «да»
    buy: function () {
      const t = now();
      if (t < 0) return;
      knock(t, 1500, 620, 0.57, 0.9);
      knock(t + 0.045, 2100, 880, 0.42, 0.8);
      tone(t + 0.045, { f: A5, v: 0.114, a: 0.003, tau: 0.026 });
      tone(t + 0.045, { f: A5 * 4, v: 0.0114, a: 0.0015, tau: 0.01 });
    },
    // Ошибка (не хватает монет, инвентарь полон): один мягкий низкий удар; деревянная середина
    // (~480 Гц, звучит чуть дольше удара) — чтобы его было слышно и там, где динамик не тянет бас
    error: function () {
      const t = now();
      if (t < 0) return;
      thud(t, 120, 0.33, 0.03);
      burst(t, { f: 480, q: 1.6, lp: 1400, v: 0.8, a: 0.001, tau: 0.025 });
    },
    // Апгрейд удался: защёлка и тёплый аккорд
    upWin: function () {
      const t = now();
      if (t < 0) return;
      latch(t, 0.2, 1.05, amb);
      chord(t + 0.03, [A3, D4, A4, D5, Fs5], 0.16, 0.17);
    },
    // Апгрейд не удался: глухой стук и две тихие низкие ноты вниз (малая терция)
    upLose: function () {
      const t = now();
      if (t < 0) return;
      thud(t, 92, 0.24, 0.05, amb);
      knock(t, 900, 300, 0.2, 1, amb);
      mallet(t + 0.03, F4, 0.12, 0.09);
      mallet(t + 0.15, D4, 0.1, 0.11);
    },
    // Выигрыш из кейса или награды (r — редкость, 0–5): лента встаёт на место, звучит аккорд
    win: function (r) {
      const t = now();
      if (t < 0) return;
      const w = WIN[Math.max(0, Math.min(5, r | 0))];
      knock(t, 1900, 560, w.k, 0.8, amb);
      if (w.low) thud(t, 74, w.low, 0.07, amb);
      chord(t + 0.012, w.n, w.v, w.tau);
    },
    // Очень редкий дроп (шанс < 1 %): мягкий низкий удар, широкий аккорд и вместе с ним
    // металлический тон (квинта аккорда). У реликвий и артефактов аккорд полнее, а металл звучит
    // большой септимой (реликвии) или ноной (артефакты)
    rare: function (r) {
      const t = now();
      if (t < 0) return;
      r = r | 0;
      thud(t, 84, 0.42, 0.1, amb);
      burst(t, { type: 'lowpass', f: 800, q: 0.7, v: 0.21, a: 0.003, tau: 0.04, bus: amb });   // толчок воздуха
      chord(t + 0.02, r >= 7 ? [D3, A3, D4, Fs4, A4, D5] : [D3, A3, D4, A4, D5], 0.25, 0.25);
      bowl(t + 0.02, r >= 8 ? E6 : r >= 7 ? Cs6 : A5, 0.2, 0.3);
    },
    // Докат перед очень редким предметом: тихий низкий «воздух» нарастает только по громкости
    // (высота не растёт) и мягкие парные толчки. Возвращает функцию, которая обрывает звук
    // (клик «пропустить»)
    rareRise: function (sec) {
      const c = ensure();
      if (!c) return noop;
      sec = Math.max(0.6, Math.min(5, sec || 2));
      const t = c.currentTime + LEAD;
      const s = c.createBufferSource();
      s.buffer = nbuf;
      s.loop = true;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 650;
      lp.Q.value = 0.7;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.3, t + sec);
      g.gain.setTargetAtTime(0, t + sec, 0.05);
      s.connect(lp);
      lp.connect(g);
      g.connect(master);
      s.start(t, Math.random() * 0.9);
      s.stop(t + sec + 0.5);
      const nodes = [{ src: s, g: g, t0: t }];
      for (let k = 0.08; k < sec - 0.2; k += 0.6) {
        const v = 0.2 + 0.2 * (k / sec);
        Array.prototype.push.apply(nodes, thud(t + k, 64, v, 0.05));
        Array.prototype.push.apply(nodes, thud(t + k + 0.17, 58, v * 0.6, 0.045));
      }
      return function () {
        const at = c.currentTime;
        nodes.forEach(function (x) { fade(x, at); });
      };
    },
    setEnabled: function (v) {
      enabled = !!v;
      if (!ctx) return;
      if (enabled && !paused) safe(ctx.resume());
      else safe(ctx.suspend());
    },
    pause: function () { paused = true; if (ctx) safe(ctx.suspend()); },
    resume: function () { paused = false; if (ctx && enabled) safe(ctx.resume()); },
    // Первый жест пользователя: создаём и будим контекст; беззвучный буфер — для старых iOS
    unlock: function () {
      const c = ensure();
      if (!c || unlocked) return;
      unlocked = true;
      try {
        const s = c.createBufferSource();
        s.buffer = c.createBuffer(1, 1, c.sampleRate);
        s.connect(c.destination);
        s.start(0);
      } catch (e) { /* не страшно */ }
    },
  };
})();
