'use strict';

// Публичный профиль игрока (клик по нику в живой ленте и по строке лидерборда). Раунд 7 — агент social (tools/plans/R7_SPEC.md).
// PubProfile.open(p) — окно на стекле модалки (94 %): аватар и рамка, ник, уровень и ранг, витрина, лучший предмет,
// стоимость инвентаря. p — открытые данные игрока из сообщения живой ленты (js/live.js):
// { k — открытый id, n — ник, a — аватар, l — уровень, w — стоимость инвентаря, b — [скин, износ] лучший предмет,
//   sc — [[скин, износ], …] витрина, wx — опыт за неделю, fr — рамка, t — когда пришли данные (мс), me — свой }.
// Строка лидерборда Яндекса приходит как { n, photo, l?, w?, b?, ya: 1 } — показываем то, что есть.
// Свой профиль (p.me или свой открытый id) — переход на экран «Профиль». Данные чужие: всё экранируется.
Object.assign(I18N.ru, {
  pp_lv: 'Уровень {n}', pp_worth: 'Стоимость инвентаря', pp_best: 'Лучший предмет', pp_show: 'Витрина',
  pp_week: 'Опыт за неделю', pp_seen: 'Данные: {t}', pp_no_show: 'Игрок пока ничего не поставил на витрину',
  pp_no_best: 'Нет данных', pp_close: 'Закрыть', pp_old: 'Игрок пока не делится данными профиля — видно только его дроп',
});
Object.assign(I18N.en, {
  pp_lv: 'Level {n}', pp_worth: 'Inventory value', pp_best: 'Best item', pp_show: 'Showcase',
  pp_week: 'XP this week', pp_seen: 'Data: {t}', pp_no_show: 'Nothing on display yet',
  pp_no_best: 'No data', pp_close: 'Close', pp_old: 'This player does not share profile data yet — only the drop is visible',
});

const PubProfile = (function () {
  const t = G.t;
  const has = Object.prototype.hasOwnProperty;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => '&#' + m.charCodeAt(0) + ';');
  const okSkin = (s) => typeof s === 'string' && has.call(SKINS, s);
  const okPair = (x) => Array.isArray(x) && okSkin(x[0]) && Number(x[1]) >= 0 && Number(x[1]) <= 1;
  const val = (x) => G.instValue({ s: x[0], f: Number(x[1]) });
  let cur = null;   // открытый сейчас профиль

  function myId() { try { return typeof Live !== 'undefined' && Live.pubId ? Live.pubId() : ''; } catch (e) { return ''; } }
  // Самые свежие известные данные игрока: из канала (Live) или из сохранённых лидербордом (7 дней)
  function freshest(p) {
    if (!p || !p.k) return p;
    let best = p;
    const take = (c) => { if (c && (c.t || 0) > (best.t || 0)) best = Object.assign({}, p, c); };
    try { if (typeof Live !== 'undefined' && Live.player) take(Live.player(p.k)); } catch (e) { /* нет канала */ }
    try { if (typeof Leaders !== 'undefined' && Leaders.card) take(Leaders.card(p.k)); } catch (e) { /* нет хранилища */ }
    return best;
  }

  function ago(ms) {
    const m = Math.floor(ms / 60000);
    if (m < 1) return t('ago_now');
    if (m < 60) return t('ago_m', { n: m });
    const h = Math.floor(m / 60);
    return h < 24 ? t('ago_h', { n: h }) : t('ago_d', { n: Math.floor(h / 24) });
  }

  // Аватар: значок проекта по id аватара, фото Яндекса, иначе первая буква ника
  function avaHTML(p) {
    const fr = typeof p.fr === 'string' && /^[a-z]{2,12}$/.test(p.fr) ? p.fr : '';
    let inner;
    if (p.a && G.AVATARS.indexOf(p.a) >= 0) inner = UI.avaIcon(p.a);
    else if (typeof p.photo === 'string' && /^https:\/\//.test(p.photo)) inner = '<img src="' + esc(p.photo) + '" alt="">';
    else inner = '<span class="pp-let">' + esc(String(p.n || '?').charAt(0).toUpperCase()) + '</span>';
    return '<div class="pp-ava xp-fr' + (p.a ? ' ico' : '') + '"' + (fr ? ' data-fr="' + fr + '"' : '') + '>' + inner + '</div>';
  }

  function tile(x) {
    if (!okPair(x)) return '<div class="pp-sl pp-sl0"></div>';
    const s = x[0], f = Number(x[1]), sk = SKINS[s];
    const nm = (G.isStar(s) ? '★ ' : '') + G.skinName(s);
    return '<div class="pp-sl r' + sk.r + '" title="' + esc(nm + ' | ' + G.finishName(s) + ' (' + UI.wearShort(f) + ')') + '">' +
      '<span class="pp-art">' + Art.item(s, f) + '</span>' +
      '<em>' + UI.COIN + G.fmt(val(x)) + '</em></div>';
  }

  function body(p) {
    const lv = Math.round(Number(p.l) || 0);
    const rank = lv > 0 && typeof XP !== 'undefined' && XP.rankOf ? XP.rankOf(lv).name : '';
    const sc = Array.isArray(p.sc) ? p.sc.filter(okPair).slice(0, 5) : [];
    const old = !p.k && !p.ya;   // старый клиент: только ник и дроп
    let h = '<div class="pp-head">' + avaHTML(p) +
      '<div class="pp-id"><b class="pp-nick">' + esc(p.n || t('guest')) + '</b>' +
      (lv > 0 ? '<span class="pp-lv"><b>' + t('pp_lv', { n: lv }) + '</b>' + (rank ? '<i></i>' + esc(rank) : '') + '</span>' : '') +
      (p.t > 0 ? '<small class="pp-seen">' + t('pp_seen', { t: ago(Math.max(0, now() - p.t)) }) + '</small>' : '') +
      '</div></div>';
    if (old) h += '<p class="pp-old">' + t('pp_old') + '</p>';
    // цифры: стоимость инвентаря и опыт за неделю (если есть)
    const cells = [];
    if (!old && p.w != null) cells.push('<div class="pp-c"><small>' + t('pp_worth') + '</small><b>' + UI.COIN + G.fmt(Number(p.w) || 0) + '</b></div>');
    if (!old && Number(p.wx) > 0) cells.push('<div class="pp-c"><small>' + t('pp_week') + '</small><b>' + G.fmtInt(Number(p.wx)) + ' XP</b></div>');
    if (cells.length) h += '<div class="pp-cells">' + cells.join('') + '</div>';
    // витрина (в таблицах Яндекса её нет — секцию не показываем)
    if (!old && !p.ya) {
      let row = '';
      for (let i = 0; i < 5; i++) row += tile(sc[i]);
      h += '<div class="pp-sec"><small class="pp-lbl">' + t('pp_show') + '</small>' +
        (sc.length ? '<div class="pp-show">' + row + '</div>' : '<div class="pp-empty">' + t('pp_no_show') + '</div>') + '</div>';
    }
    // лучший предмет
    const b = okPair(p.b) ? p.b : null;
    if (b) {
      const s = b[0], f = Number(b[1]), sk = SKINS[s];
      h += '<div class="pp-sec"><small class="pp-lbl">' + t('pp_best') + '</small>' +
        '<div class="pp-best r' + sk.r + '"><span class="pp-art">' + Art.item(s, f) + '</span>' +
        '<div class="pp-bi"><span class="pp-rar">' + t('rar_' + RARITIES[sk.r].id) + '</span>' +
        '<b>' + esc((G.isStar(s) ? '★ ' : '') + G.skinName(s)) + '</b>' +
        '<span>' + esc(G.finishName(s)) + ' · ' + UI.wearShort(f) + '</span>' +
        '<em>' + UI.COIN + G.fmt(val(b)) + '</em></div></div></div>';
    } else if (!old && !p.ya) {
      h += '<div class="pp-sec"><small class="pp-lbl">' + t('pp_best') + '</small><div class="pp-empty">' + t('pp_no_best') + '</div></div>';
    }
    return h;
  }

  function now() { try { return typeof Live !== 'undefined' && Live.now ? Live.now() : Date.now(); } catch (e) { return Date.now(); } }

  function open(p) {
    if (typeof p === 'string') p = { k: p };
    if (!p || typeof p !== 'object') return;
    const mine = myId();
    if (p.me || (p.k && mine && p.k === mine)) {
      if (document.getElementById('modal-root').classList.contains('show')) UI.closeModal(true);
      UI.showScreen('profile');
      return;
    }
    cur = freshest(p);
    UI.modal('<div class="pp" data-k="' + esc(cur.k || '') + '">' + body(cur) + '</div>' +
      '<div class="m-btns"><button class="btn" data-act="close">' + t('pp_close') + '</button></div>', { cls: 'pp-modal' });
  }

  // Пришли новые открытые данные — обновить открытое окно этого игрока на месте (без повторной анимации)
  G.on('pubcard', () => {
    const el = document.querySelector('#modal-root .pp');
    if (!el || !cur || !cur.k) return;
    const nx = freshest(cur);
    if (nx === cur || (nx.t || 0) <= (cur.t || 0)) return;
    cur = nx;
    el.innerHTML = body(cur);
  });

  return { open: open };
})();
