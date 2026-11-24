'use strict';

// Первый вход на 3 минуты: бесплатный кейс, подсказки про апгрейд и фарм. Раунд 7 — агент onboarding (tools/plans/R7_SPEC.md).
// Только для нового игрока (в сохранении нет ни одного действия); существующим — никогда.
// Порядок: регистрация (или «Играть как гость» на Яндексе) → окно офлайн-дохода, если есть → шаги:
//   case  — открыть бесплатный кейс «Новобранец»: первый дроп назначен заранее (G.queueOwn) — яркий предмет
//           редкости 4 этого кейса, дороже кейса, но не ломает экономику (≈ 13 открытий «Новобранца»);
//   drop  — кейс открыт, ждём, пока игрок закроет окно с дропом;
//   up    — подсказка у вкладки «Апгрейды», up2 — на самом экране апгрейда;
//   farm  — подсказка у вкладки «Фарм», farm2 — у монеты;
//   end   — «Готово».
// Подсказка — небольшой стеклянный пузырь с уголком-стрелкой у нужного элемента, 1–2 строки, кнопки
// «Дальше» и «Пропустить» (пропуск закрывает весь онбординг). Затемнения экрана нет.
// Состояние — G.S.ext.onb: { s: шаг | 'off', r: почему закончен ('done' | 'skip' | 'old') }.
// После перезагрузки — продолжение с того же шага; закончен или пропущен — ничего.
const Onb = (function () {
  const t = G.t;
  const STEPS = ['case', 'drop', 'up', 'up2', 'farm', 'farm2', 'end'];
  // Назначенный первый дроп: по порядку — первый, что есть в бесплатном кейсе; иначе самый дешёвый редкости 4–5
  const PRIZE = ['ar47_tiger', 'p57_goldfish', 'smg5_scales'];

  Object.assign(I18N.ru, {
    onb_case: 'Первый кейс — за наш счёт. Открывай!',
    onb_up: 'Апгрейды: поставь предмет и рискни получить дороже.',
    onb_up2: 'Поставь свой предмет, выбери цель — колесо покажет шанс.',
    onb_farm: 'Фарм: монеты за клики и доход, даже когда тебя нет.',
    onb_farm2: 'Жми на монету. Прокачка ускоряет доход.',
    onb_end: 'Всё готово. Открывай кейсы и качай уровень — удачи!',
    onb_next: 'Дальше', onb_skip: 'Пропустить', onb_open: 'Открыть', onb_fin: 'Готово',
  });
  Object.assign(I18N.en, {
    onb_case: 'Your first case is on us. Open it!',
    onb_up: 'Upgrades: stake an item and try for a pricier one.',
    onb_up2: 'Stake your item, pick a target — the wheel shows the odds.',
    onb_farm: 'Farm: coins for clicks and income even while you are away.',
    onb_farm2: 'Tap the coin. Upgrades boost your income.',
    onb_end: 'All set. Open cases and level up — good luck!',
    onb_next: 'Next', onb_skip: 'Skip', onb_open: 'Open', onb_fin: 'Done',
  });

  G.ext('onb', {
    def: () => ({ s: '' }),   // '' — ещё не решено (решает boot по сохранению)
    clean: (v) => {
      if (!v || typeof v !== 'object') return null;
      const s = v.s === 'off' || STEPS.indexOf(v.s) >= 0 ? v.s : '';
      const o = { s: s };
      if (s === 'off') o.r = ['done', 'skip', 'old'].indexOf(v.r) >= 0 ? v.r : 'done';
      if (v.tk === 1) o.tk = 1;   // билет на случай, если бесплатный кейс по таймеру не готов, уже выдан
      return o;
    },
  });
  const st = () => G.extOf('onb');

  // В сохранении уже есть игра — это не новый игрок
  function played(S) {
    return S.opened > 0 || S.inv.length > 0 || S.clicks > 0 || S.upgrades > 0 || S.total > 0 ||
      Object.keys(S.found || {}).length > 0 || (S.daily && S.daily.streak > 0) || (S.feed && S.feed.length > 0);
  }

  function prizeSkin() {
    const c = CASE_BY_ID[FREE_CASE_ID];
    if (!c) return '';
    const own = PRIZE.filter((s) => c.items.indexOf(s) >= 0)[0];
    if (own) return own;
    const pool = c.items.filter((s) => SKINS[s] && (SKINS[s].r === 4 || SKINS[s].r === 5))
      .sort((a, b) => SKINS[a].value - SKINS[b].value);
    return pool[0] || '';
  }

  let active = false;     // онбординг идёт в этой сессии (после регистрации и окон)
  let queued = false;     // назначенный дроп уже поставлен в очередь (очередь живёт только в памяти)
  let bubble = null, hl = null, raf = 0, shownStep = '', scrolledStep = '';

  // Решение «новый / не новый» — сразу после загрузки сохранения, до любых действий (main.js)
  function boot() {
    if (G.demo) return;
    const o = st();
    if (o.s === '') {
      if (played(G.S)) { o.s = 'off'; o.r = 'old'; } else o.s = 'case';
    }
  }

  function setStep(s, why) {
    const o = st();
    o.s = s;
    if (s === 'off') o.r = why || 'done';
    G.save(true);
    if (s === 'off') { stop(); return; }
    render();
  }
  function next() {
    const o = st();
    const i = STEPS.indexOf(o.s);
    if (i < 0 || i >= STEPS.length - 1) setStep('off', 'done');
    else setStep(STEPS[i + 1]);
  }
  function skip() { setStep('off', 'skip'); }

  // ================= Куда указывает подсказка =================
  const shown = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    // за краем экрана — тоже годится: при входе в шаг элемент прокручивается к центру
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  // первый видимый по порядку селекторов (а не по порядку в документе)
  const first = (sel) => {
    const list = sel.split(',');
    for (let i = 0; i < list.length; i++) {
      const el = Array.prototype.filter.call(document.querySelectorAll(list[i]), shown)[0];
      if (el) return el;
    }
    return null;
  };
  // Вкладка раздела: верхнее меню на компьютере, нижнее — на телефоне
  const navBtn = (id) => first('.topnav [data-id="' + id + '"], #tabbar [data-id="' + id + '"]');
  const openBtn = () => first('#cp-open-free, #cp-open-tk');

  function target(s) {
    const scr = UI.screen ? UI.screen() : '';
    if (s === 'case') return openBtn() || navBtn('cases');
    if (s === 'up') return navBtn('upgrade');
    if (s === 'up2') return (scr === 'upgrade' && first('#up-inv > :first-child, #up-stake, #up-ring')) || navBtn('upgrade');
    if (s === 'farm') return navBtn('farm');
    if (s === 'farm2') return (scr === 'farm' && first('#big-coin')) || navBtn('farm');
    if (s === 'end') return navBtn('cases') || first('#hdr .logo');
    return null;
  }

  // «Дальше»: в шаге с кейсом — открыть его (или перейти к нему), в остальных — следующий шаг
  function onNext() {
    const s = st().s;
    if (s === 'case') {
      const b = openBtn();
      if (b) b.click(); else UI.actions['case'](FREE_CASE_ID);
      return;
    }
    if (s === 'up') { UI.showScreen('upgrade'); setStep('up2'); return; }
    if (s === 'farm') { UI.showScreen('farm'); setStep('farm2'); return; }
    if (s === 'end' && UI.screen() !== 'cases' && !UI.isSpinning()) UI.showScreen('cases');
    next();
  }

  // Вход в шаг — один раз, когда на экране нет окон и прокрутки
  let entered = '';
  function enter(s) {
    if (entered === s) return;
    entered = s;
    const scr = UI.screen ? UI.screen() : '';
    if (s === 'case') {
      if (!queued) { const sk = prizeSkin(); if (sk && G.queueOwn(sk, FREE_CASE_ID)) queued = true; }
      // бесплатный кейс по таймеру занят (редкий случай) — один билет на «Новобранца» вместо него
      const o = st();
      if (Date.now() < G.S.freeAt && !o.tk && G.ticketCount(FREE_CASE_ID) <= 0) { G.grantTicket(FREE_CASE_ID, 1); o.tk = 1; G.save(true); }
      if (!openBtn()) UI.actions['case'](FREE_CASE_ID);
    } else if (s === 'up2' && scr !== 'upgrade') UI.showScreen('upgrade');
    else if (s === 'farm2' && scr !== 'farm') UI.showScreen('farm');
  }

  // ================= Пузырь =================
  function textOf(s) { return t('onb_' + (s === 'case' ? 'case' : s)); }
  function btnOf(s) { return t(s === 'case' ? 'onb_open' : s === 'end' ? 'onb_fin' : 'onb_next'); }

  function render() {
    shownStep = '';   // перерисовать содержимое в следующем кадре
  }

  function build(s) {
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'onb';
      bubble.setAttribute('role', 'dialog');
      bubble.addEventListener('click', (e) => {
        // data-oa, а не data-onb: тот стоит на <html>, и closest нашёл бы его при клике по тексту
        const b = e.target.closest('[data-oa]');
        if (!b || !bubble || !bubble.contains(b)) return;
        Sfx.unlock();
        if (b.getAttribute('data-oa') === 'skip') skip(); else onNext();
      });
      document.body.appendChild(bubble);
    }
    bubble.innerHTML = '<i class="onb-ar"></i><p class="onb-t">' + textOf(s) + '</p><div class="onb-b">' +
      (s === 'end' ? '' : '<button class="onb-skip" data-oa="skip">' + t('onb_skip') + '</button>') +
      '<button class="btn primary onb-go" data-oa="next">' + btnOf(s) + '</button></div>';
    bubble.classList.remove('in');
    void bubble.offsetWidth;
    bubble.classList.add('in');
    shownStep = s + G.lang;
  }

  function setHl(el) {
    if (hl === el) return;
    if (hl) hl.classList.remove('onb-hl');
    hl = el;
    if (hl) hl.classList.add('onb-hl');
  }

  // Пока пузырь виден, на <html> стоит data-onb="1": по нему новые тосты ждут (агент glass), чтобы не лечь на подсказку
  const root = document.documentElement;
  function mark(on) {
    if (on) { if (root.getAttribute('data-onb') !== '1') root.setAttribute('data-onb', '1'); }
    else if (root.hasAttribute('data-onb')) root.removeAttribute('data-onb');
  }

  function hide() {
    if (bubble) bubble.hidden = true;
    mark(false);
    setHl(null);
  }

  // Уголок-стрелка смотрит на элемент. Стороны пробуются по порядку (у монеты и карточки предмета — сбоку,
  // чтобы не закрыть их и подписи под ними); не влезло никуда — туда, где больше места.
  // Пузырь не ложится на тосты: сторона, где он задел бы видимый тост, пропускается; если задевает везде —
  // пузырь ждёт, пока тосты погаснут (новые тосты в это время не придерживаются — data-onb снят).
  // У вкладок меню — только снизу или сверху: сбоку пузырь лёг бы на шапку или нижнее меню
  const SIDES = { case: 'btrl', up2: 'rblt', farm2: 'rlbt' };
  function toastRects() {
    const box = document.getElementById('toasts');
    if (!box || !box.firstElementChild) return [];
    return Array.prototype.map.call(box.children, (e) => e.getBoundingClientRect())
      .filter((q) => q.width > 0 && q.height > 0);
  }
  function place(el, s) {
    const r = el.getBoundingClientRect();
    const W = innerWidth, H = innerHeight, gap = 12, pad = 8, m = 6;
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const room = { b: H - r.bottom - gap - pad, t: r.top - gap - pad, r: W - r.right - gap - pad, l: r.left - gap - pad };
    const need = { b: bh, t: bh, r: bw, l: bw };
    const pref = (SIDES[s] || 'bt').split('');
    const fits = pref.filter((k) => room[k] >= need[k]);
    const order = fits.length ? fits : [room.b >= room.t ? 'b' : 't'];
    const at = (side) => {
      let left, top;
      if (side === 'b' || side === 't') {
        top = side === 'b' ? r.bottom + gap : r.top - gap - bh;
        left = r.left + r.width / 2 - bw / 2;
      } else {
        left = side === 'r' ? r.right + gap : r.left - gap - bw;
        top = r.top + r.height / 2 - bh / 2;
      }
      return [Math.max(pad, Math.min(W - bw - pad, left)), Math.max(pad, Math.min(H - bh - pad, top))];
    };
    const ts = toastRects();
    const hits = (p) => ts.some((q) => p[0] < q.right + m && p[0] + bw > q.left - m && p[1] < q.bottom + m && p[1] + bh > q.top - m);
    let side = '', pos = null;
    for (let i = 0; i < order.length; i++) {
      const p = at(order[i]);
      if (!hits(p)) { side = order[i]; pos = p; break; }
    }
    if (!pos) return false;
    const left = pos[0], top = pos[1];
    bubble.style.left = Math.round(left) + 'px';
    bubble.style.top = Math.round(top) + 'px';
    bubble.setAttribute('data-side', side);
    const ax = Math.max(14, Math.min(bw - 14, r.left + r.width / 2 - left));
    const ay = Math.max(14, Math.min(bh - 14, r.top + r.height / 2 - top));
    bubble.style.setProperty('--ax', Math.round(ax) + 'px');
    bubble.style.setProperty('--ay', Math.round(ay) + 'px');
    return true;
  }

  // ================= Кадр =================
  // Пока открыто окно, крутится рулетка или вкладка скрыта — пузыря нет (окна не перекрываем)
  function busy() {
    const mr = document.getElementById('modal-root');
    return (mr && mr.classList.contains('show')) || (UI.isSpinning && UI.isSpinning()) || !!document.getElementById('loader');
  }

  function frame() {
    raf = 0;
    if (!active) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const s = st().s;
    if (STEPS.indexOf(s) < 0) { stop(); return; }
    if (busy()) { hide(); return; }
    const scr = UI.screen ? UI.screen() : '';
    // сам перешёл в нужный раздел — подсказка следует за ним
    if (s === 'drop') { setStep('up'); return; }
    if (s === 'up' && scr === 'upgrade') { setStep('up2'); return; }
    if (s === 'farm' && scr === 'farm') { setStep('farm2'); return; }
    enter(s);
    const el = target(s);
    if (!el) { hide(); return; }
    const rr = el.getBoundingClientRect();
    if (scrolledStep === s && (rr.bottom < 0 || rr.top > innerHeight)) { hide(); return; }   // игрок сам увёл элемент с экрана
    if (scrolledStep !== s) {
      scrolledStep = s;
      const r = el.getBoundingClientRect();
      if (r.top < 60 || r.bottom > innerHeight - 60) el.scrollIntoView({ block: 'center' });
    }
    const fresh = shownStep !== s + G.lang || !bubble;
    if (fresh) build(s);   // шаг или язык сменились — новый текст
    const was = !bubble.hidden && !fresh;
    bubble.hidden = false;   // видимым — чтобы измерить размер; без отрисовки кадра это не мелькает
    if (!place(el, s)) { hide(); return; }   // все стороны заняты тостами — ждём
    if (!was && !fresh) { bubble.classList.remove('in'); void bubble.offsetWidth; bubble.classList.add('in'); }
    mark(true);
    setHl(el);
  }

  function loop() { if (!raf && active) raf = requestAnimationFrame(frame); }

  function stop() {
    active = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    setHl(null);
    mark(false);
    if (bubble) { bubble.remove(); bubble = null; }
    shownStep = '';
  }

  // Кейс открыт (любой — игрок уже понял, как) — ждём, пока закроется окно с дропом
  G.on('open', () => { if (active && st().s === 'case') { st().s = 'drop'; G.save(true); render(); } });

  // Старт после регистрации / выбора гостя и окна офлайн-дохода (main.js). Окна, открытые позже
  // (уровень, подарок), пузырь просто пережидает.
  function start() {
    if (G.demo || STEPS.indexOf(st().s) < 0) return;
    active = true;
    loop();
  }

  return { boot: boot, start: start, skip: skip, state: () => st().s };
})();
