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

  function tone(freq, dur, type, vol, delay, toFreq) {
    const c = ensure();
    if (!c) return;
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
