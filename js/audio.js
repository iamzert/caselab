'use strict';

// Все звуки синтезируются через WebAudio — никаких внешних файлов.
const Sfx = (function () {
  let ctx = null;
  let master = null;
  let enabled = true;
  let paused = false;

  function ensure() {
    if (!enabled || paused) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.3;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }

  // Возвращает { src, g } — чтобы длинный звук можно было оборвать (пропуск эффекта)
  function tone(freq, dur, type, vol, delay, toFreq) {
    const c = ensure();
    if (!c) return null;
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    return { src: o, g: g };
  }

  // Белый шум (один буфер на всё) через фильтр со скользящей частотой.
  // swell — плавное нарастание до конца вместо щелчка в начале.
  let nbuf = null;
  function noise(dur, vol, delay, type, f0, f1, swell) {
    const c = ensure();
    if (!c) return null;
    if (!nbuf) {
      const len = Math.floor(c.sampleRate * 1.5);
      nbuf = c.createBuffer(1, len, c.sampleRate);
      const d = nbuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = c.currentTime + (delay || 0);
    const src = c.createBufferSource();
    src.buffer = nbuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = type === 'bandpass' ? 1.4 : 0.7;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    if (swell) {
      g.gain.exponentialRampToValueAtTime(vol, t0 + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.12);
    } else {
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.15);
    return { src: src, g: g };
  }

  // Колокольчик: основной тон и два негармонических призвука, которые гаснут быстрее
  function bell(freq, dur, vol, delay) {
    tone(freq, dur, 'sine', vol, delay);
    tone(freq * 2.76, dur * 0.45, 'sine', vol * 0.32, delay);
    tone(freq * 5.4, dur * 0.2, 'sine', vol * 0.12, delay);
  }

  const WIN = [
    [523, 659, 784],
    [523, 659, 784, 1047],
    [587, 740, 880, 1175],
    [659, 831, 988, 1319, 1568],
    [784, 988, 1175, 1568, 1976],
    [523, 659, 784, 1047, 1319, 1568, 2093],
  ];

  return {
    click: function () { tone(520 + Math.random() * 120, 0.07, 'triangle', 0.3, 0, 900); },
    tick: function () { tone(1400, 0.03, 'square', 0.06); },
    coin: function () { tone(988, 0.07, 'square', 0.13); tone(1319, 0.18, 'square', 0.13, 0.07); },
    open: function () { tone(180, 0.3, 'sawtooth', 0.12, 0, 90); },
    buy: function () { tone(660, 0.08, 'triangle', 0.3); tone(990, 0.14, 'triangle', 0.3, 0.08); },
    error: function () { tone(200, 0.15, 'square', 0.12, 0, 120); },
    upWin: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.3, 'triangle', 0.25, i * 0.08); }); },
    upLose: function () { tone(330, 0.25, 'sawtooth', 0.12, 0, 160); tone(220, 0.4, 'sawtooth', 0.1, 0.2, 90); },
    win: function (r) {
      const seq = WIN[r] || WIN[0];
      const step = r >= 4 ? 0.09 : 0.07;
      seq.forEach(function (f, i) { tone(f, 0.25, r >= 3 ? 'square' : 'triangle', r >= 3 ? 0.15 : 0.25, i * step); });
      if (r >= 4) tone(seq[seq.length - 1] * 2, 0.7, 'sine', 0.2, seq.length * step);
    },
    // Очень редкий дроп (шанс < 1 %): низкий удар с шумовым хлопком, колокольное арпеджио
    // вверх (у реликвий и артефактов — на тон выше), россыпь блёсток и высокий «звон» в конце
    rare: function (r) {
      if (!ensure()) return;
      tone(150, 0.75, 'sine', 0.5, 0, 34);
      tone(75, 0.9, 'triangle', 0.22, 0, 32);
      noise(0.55, 0.3, 0, 'lowpass', 3200, 160);
      const ch = r >= 7 ? [659.3, 830.6, 987.8, 1318.5, 1661.2, 1975.5] : [587.3, 740, 880, 1174.7, 1480, 1760];
      ch.forEach(function (f, i) { bell(f, 1.6 - i * 0.12, 0.13, 0.08 + i * 0.06); });
      for (let i = 0; i < 16; i++) tone(2600 + Math.random() * 3000, 0.045, 'sine', 0.045, 0.3 + Math.random() * 1.1);
      bell(ch[0] * 4, 1.4, 0.05, 0.5);
    },
    // Нарастание перед остановкой на очень редком предмете: шорох, поднимающийся вверх,
    // и удары «сердца». Возвращает функцию, которая обрывает звук (клик «пропустить»).
    rareRise: function (sec) {
      const c = ensure();
      if (!c) return function () {};
      sec = Math.max(0.6, Math.min(5, sec || 2));
      const nodes = [noise(sec, 0.11, 0, 'bandpass', 260, 2800, true)];
      for (let t = 0.05; t < sec - 0.2; t += 0.62) {
        nodes.push(tone(68, 0.16, 'sine', 0.42, t, 44), tone(60, 0.14, 'sine', 0.28, t + 0.17, 40));
      }
      return function () {
        const now = c.currentTime;
        nodes.forEach(function (x) {
          if (!x) return;
          try {
            x.g.gain.cancelScheduledValues(now);
            x.g.gain.setTargetAtTime(0.0001, now, 0.03);
            x.src.stop(now + 0.15);
          } catch (e) { /* узел ещё не запущен или уже остановлен */ }
        });
      };
    },
    setEnabled: function (v) {
      enabled = !!v;
      if (!ctx) return;
      if (enabled && !paused) ctx.resume().catch(function () {});
      else ctx.suspend().catch(function () {});
    },
    pause: function () { paused = true; if (ctx) ctx.suspend().catch(function () {}); },
    resume: function () { paused = false; if (ctx && enabled) ctx.resume().catch(function () {}); },
    unlock: function () { ensure(); },
  };
})();
