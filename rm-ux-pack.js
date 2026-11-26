/* =========================================================
   RestoManager — Pack UX v1
   À charger en fin de <body>, APRÈS tous les autres scripts.
   Lecture seule : ce fichier n'écrit jamais dans Supabase.
   ========================================================= */
(() => {
  if (window.RestoUX) return;                       // évite un double chargement
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TZ = 'Europe/Paris';

  /* ---------------- Outils dates ---------------- */
  const isoDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);   // AAAA-MM-JJ
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fmt = (iso, opts) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...opts }).format(new Date(iso + 'T12:00:00Z'));
  const nowHM = () => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date());
  const hourNow = () => parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date()), 10);
  const plural = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;

  /* ---------------- Statistiques (à partir des réservations déjà chargées) ---------------- */
  const SERVED = new Set(['completed', 'released', 'seated', 'arrived']);
  const SEATED = new Set(['seated', 'arrived']);
  const EXPECTED = new Set(['reserved', 'confirmed', 'late']);

  function stats() {
    const list = Array.isArray(window.RestoSharedReservations) ? window.RestoSharedReservations : [];
    const today = isoDay(new Date());
    const g = r => Number(r.guests) || 0;
    const of = day => list.filter(r => r.date === day);
    const served = day => of(day).filter(r => SERVED.has(r.status)).reduce((s, r) => s + g(r), 0);

    const t = of(today);
    const expected = t.filter(r => EXPECTED.has(r.status));
    const nextTime = expected.map(r => r.time).filter(Boolean).sort()[0] || null;
    const servedToday = served(today);

    const days = [];
    for (let i = 13; i >= 0; i--) { const d = addDays(today, -i); days.push({ d, v: served(d) }); }
    const best = days.reduce((a, b) => (b.v > a.v ? b : a), days[0]);

    const servedRes = t.filter(r => SERVED.has(r.status));
    const hotel = servedRes.filter(r => r.type === 'hotel').reduce((s, r) => s + g(r), 0);
    const tomorrow = of(addDays(today, 1)).filter(r => EXPECTED.has(r.status));

    return {
      today, days, best,
      servedToday,
      seatedNow: t.filter(r => SEATED.has(r.status)).reduce((s, r) => s + g(r), 0),
      expectedCovers: expected.reduce((s, r) => s + g(r), 0),
      expectedCount: expected.length,
      nextTime,
      noShows: t.filter(r => r.status === 'no_show').length,
      lastWeek: served(addDays(today, -7)),
      hotelShare: servedToday ? Math.round((hotel / servedToday) * 100) : null,
      tomorrowCount: tomorrow.length,
      tomorrowCovers: tomorrow.reduce((s, r) => s + g(r), 0),
    };
  }

  /* ---------------- Carte "Ce soir" ---------------- */
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function chip(value, label, mod, i) {
    const c = el('span', 'rm-chip' + (mod ? ' ' + mod : ''));
    c.style.setProperty('--rm-i', i);
    c.append(el('b', null, value), document.createTextNode(label));
    return c;
  }

  function headline(s) {
    const h = hourNow();
    if (s.seatedNow || s.expectedCount) {
      const parts = [];
      if (s.seatedNow) parts.push(`${plural(s.seatedNow, 'couvert')} en salle`);
      if (s.expectedCovers) parts.push(`${plural(s.expectedCovers, 'couvert')} encore ${s.expectedCovers > 1 ? 'attendus' : 'attendu'}`);
      if (s.nextTime) parts.push(`prochaine arrivée à ${s.nextTime.replace(':', 'h')}`);
      return { title: 'Service en cours', sub: parts.join(' · '), progress: s.servedToday / Math.max(1, s.servedToday + s.expectedCovers) };
    }
    if (s.servedToday) {
      const delta = s.servedToday - s.lastWeek;
      const sub = s.lastWeek
        ? (delta >= 0 ? `${delta === 0 ? 'Autant' : '+' + delta + ' couverts'} par rapport à la semaine dernière.` : `${delta} couverts par rapport à la semaine dernière.`)
        : 'Merci à toute l’équipe pour ce service.';
      return { title: `Beau travail : ${plural(s.servedToday, 'couvert')} ${s.servedToday > 1 ? 'servis' : 'servi'} aujourd’hui`, sub, progress: 1 };
    }
    if (h >= 21) return { title: 'Soirée calme, rien en attente', sub: 'Aucune réservation ce soir. Les passages que vous ajoutez apparaissent ici en direct.', progress: 0 };
    if (h < 11) return { title: 'Bonjour, la salle est prête', sub: 'Aucune réservation pour le moment. Les nouvelles arrivées apparaîtront ici en direct.', progress: 0 };
    return { title: 'Rien en attente pour l’instant', sub: 'Les réservations et passages du jour apparaîtront ici en direct.', progress: 0 };
  }

  function buildHero(s) {
    const hero = el('section', 'rm-hero');
    hero.setAttribute('aria-label', 'Résumé du service');

    /* Colonne gauche */
    const main = el('div', 'rm-hero-main');
    const eyebrow = el('span', 'rm-eyebrow');
    eyebrow.append(el('span', 'rm-dot'), el('span', 'rm-clock', `Aujourd’hui · ${nowHM()}`));
    const hl = headline(s);
    main.append(eyebrow, el('h2', 'rm-hero-title', hl.title), el('p', 'rm-hero-sub', hl.sub));
    if (s.seatedNow || s.expectedCount) {
      const bar = el('div', 'rm-hero-progress'); const fill = el('i');
      bar.append(fill); main.append(bar);
      requestAnimationFrame(() => requestAnimationFrame(() => fill.style.setProperty('--rm-p', hl.progress.toFixed(3))));
    }
    const chips = el('div', 'rm-chips');
    let i = 0;
    chips.append(chip(String(s.servedToday), 'couverts servis', null, i++));
    if (s.lastWeek || s.servedToday) {
      const d = s.servedToday - s.lastWeek;
      chips.append(chip((d > 0 ? '+' : '') + d, `vs ${fmt(s.today, { weekday: 'long' })} dernier`, d > 0 ? 'rm-up' : d < 0 ? 'rm-down' : null, i++));
    }
    if (s.noShows) chips.append(chip(String(s.noShows), s.noShows > 1 ? 'absents' : 'absent', 'rm-down', i++));
    if (s.hotelShare != null) chips.append(chip(s.hotelShare + ' %', 'clients de l’hôtel', null, i++));
    chips.append(chip(String(s.tomorrowCovers), `couverts demain (${plural(s.tomorrowCount, 'résa')})`, null, i++));
    main.append(chips);

    /* Colonne droite : 14 derniers jours */
    const chart = el('div', 'rm-hero-chart');
    const head = el('div', 'rm-chart-head');
    const total = s.days.reduce((a, b) => a + b.v, 0);
    head.append(el('span', null, 'Couverts servis · 14 derniers jours'), el('b', null, String(total)));
    const bars = el('div', 'rm-bars'); bars.setAttribute('role', 'img');
    bars.setAttribute('aria-label', 'Couverts servis par jour sur 14 jours : ' + s.days.map(x => `${fmt(x.d, { day: 'numeric', month: 'short' })} ${x.v}`).join(', '));
    const labels = el('div', 'rm-days'); labels.setAttribute('aria-hidden', 'true');
    const max = Math.max(1, ...s.days.map(x => x.v));
    s.days.forEach((x, k) => {
      const b = el('div', 'rm-bar' + (x.d === s.today ? ' rm-today' : '') + (x === s.best && x.v ? ' rm-best' : ''));
      b.dataset.tip = `${fmt(x.d, { weekday: 'short', day: 'numeric', month: 'short' })} · ${x.v}`;
      b.style.setProperty('--rm-i', k);
      const fill = el('i'); fill.style.setProperty('--rm-h', (x.v / max * 100).toFixed(1) + '%');
      b.append(fill); bars.append(b);
      labels.append(el('span', x.d === s.today ? 'rm-today' : null, fmt(x.d, { weekday: 'narrow' })));
    });
    const foot = el('div', 'rm-chart-foot');
    if (s.best.v) foot.append(document.createTextNode('Meilleur jour récent : '), el('b', null, `${fmt(s.best.d, { weekday: 'long', day: 'numeric', month: 'long' })} · ${s.best.v} couverts`));
    else foot.textContent = 'Les couverts servis s’afficheront ici jour après jour.';
    chart.append(head, bars, labels, foot);

    const grid = el('div', 'rm-hero-grid');
    grid.append(main, chart);
    hero.append(grid);
    return hero;
  }

  let heroSig = '';
  let previewUntil = 0;
  function renderHero(force) {
    const screen = document.querySelector('section.appScreen#tables, section.appScreen.appScreenActive');
    const anchor = document.querySelector('#tables .kpis') || document.querySelector('.appScreen .kpis');
    if (!anchor || !screen) return;
    const s = stats();
    const sig = JSON.stringify([s.servedToday, s.seatedNow, s.expectedCovers, s.noShows, s.nextTime, s.tomorrowCovers, s.days.map(d => d.v), hourNow() >= 21]);
    const existing = document.querySelector('.rm-hero');
    if (!force && existing && Date.now() < previewUntil) return;   // un aperçu est affiché
    if (!force && existing && sig === heroSig && existing.isConnected) return;
    const first = !existing;
    heroSig = sig;
    const hero = buildHero(s);
    if (first && !reduce) hero.classList.add('rm-enter');
    if (existing) existing.replaceWith(hero); else anchor.before(hero);
  }
  setInterval(() => { const c = document.querySelector('.rm-clock'); if (c) c.textContent = `Aujourd’hui · ${nowHM()}`; }, 20000);

  /* ---------------- Textes explicatifs repliés ---------------- */
  const CLAMP_MIN = 80;
  function clampLongTexts() {
    document.querySelectorAll('.appScreen p, .appScreen .muted, .appScreen small').forEach(p => {
      if (p.dataset.rmClamp || p.closest('form, dialog, [role="dialog"], .rm-hero, .rm-res-empty, .rm-empty-state, .rm-toast')) return;
      if (p.textContent.trim().length < CLAMP_MIN || p.querySelector('input, button, a, select')) return;
      if (!p.offsetParent) return;          // écran caché : on vérifiera quand il sera visible
      p.dataset.rmClamp = '1';
      p.classList.add('rm-clamp');
      if (p.scrollHeight <= p.clientHeight + 2 && p.scrollWidth <= p.clientWidth + 2) {
        // Le texte tient déjà sur une ligne : on ne replie pas.
        p.classList.remove('rm-clamp');
        return;
      }
      p.tabIndex = 0;
      p.setAttribute('role', 'button');
      p.setAttribute('aria-expanded', 'false');
      const toggle = () => { const o = p.classList.toggle('rm-open'); p.setAttribute('aria-expanded', String(o)); };
      p.addEventListener('click', toggle);
      p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
  }

  /* ---------------- Entrée en cascade ---------------- */
  const REVEAL_SEL = '.appScreenActive .quickAction, .appScreenActive .kpi, .appScreenActive > section, .appScreenActive .panel, .appScreenActive .tableCard';
  function stagger() {
    if (reduce) return;
    const els = [...document.querySelectorAll(REVEAL_SEL)].filter(n => !n.dataset.rmSeen);
    const vh = innerHeight;
    let k = 0;
    els.forEach(n => {
      n.dataset.rmSeen = '1';
      if (n.getBoundingClientRect().top > vh * 1.5) return;      // hors écran : pas d'animation inutile
      n.style.setProperty('--rm-i', Math.min(k++, 14));
      n.classList.add('rm-reveal');
    });
    requestAnimationFrame(() => requestAnimationFrame(() => els.forEach(n => n.classList.add('rm-in'))));
    setTimeout(() => els.forEach(n => n.classList.remove('rm-reveal', 'rm-in')), 1600);  // nettoyage
  }

  /* ---------------- Compteurs animés ---------------- */
  const NUM_RE = /^\s*(\d+)\s*(%?)\s*$/;
  const lastNum = new WeakMap();
  const counting = new WeakSet();
  function countTo(n, from, to, suffix) {
    if (reduce) return;
    counting.add(n);
    const t0 = performance.now(), dur = 650;
    const step = now => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      n.textContent = Math.round(from + (to - from) * e) + suffix;
      if (t < 1) requestAnimationFrame(step);
      else { counting.delete(n); n.classList.remove('rm-bump'); void n.offsetWidth; n.classList.add('rm-bump'); }
    };
    requestAnimationFrame(step);
  }
  function scanNumbers() {
    document.querySelectorAll('.kpi strong, .currentOccupancy strong, .rmLiveGauge strong').forEach(n => {
      if (n.children.length || counting.has(n)) return;
      const m = n.textContent.match(NUM_RE); if (!m) return;
      const v = +m[1], prev = lastNum.get(n);
      lastNum.set(n, v);
      if (prev !== undefined && prev !== v) countTo(n, prev, v, m[2] ? ' ' + m[2] : '');
    });
  }

  /* ---------------- Tables : onde quand l'état change ---------------- */
  const lastState = new Map();
  function scanTables() {
    document.querySelectorAll('.tableCard').forEach(c => {
      const key = c.querySelector('.num')?.textContent.trim(); if (!key) return;
      const state = c.className.replace(/\brm-\S+/g, '').trim();
      const prev = lastState.get(key);
      lastState.set(key, state);
      if (prev && prev !== state && !reduce) {
        c.classList.remove('rm-flash'); void c.offsetWidth; c.classList.add('rm-flash');
        setTimeout(() => c.classList.remove('rm-flash'), 1000);
      }
    });
  }

  /* ---------------- Vibration légère au toucher (Android) ---------------- */
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' && e.target.closest('.quickAction, .kpiInteractive, .tableCard')) navigator.vibrate?.(8);
  }, { passive: true });

  /* ---------------- Boucle d'observation ---------------- */
  let queued = false;
  function tick(screenChanged) {
    if (screenChanged) {
      document.querySelectorAll('.appScreenActive [data-rm-seen]').forEach(n => delete n.dataset.rmSeen);
      stagger();
    }
    renderHero(false);
    clampLongTexts();
    scanNumbers();
    scanTables();
  }
  new MutationObserver(muts => {
    const screenChanged = muts.some(m => m.type === 'attributes' && m.attributeName === 'class' &&
      m.target.classList?.contains('appScreenActive') && !String(m.oldValue).includes('appScreenActive'));
    if (screenChanged) { tick(true); return; }
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; tick(false); });
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });

  setInterval(() => renderHero(false), 15000);   // filet de sécurité si les données changent sans toucher au DOM

  tick(true);
  window.RestoUX = {
    refresh: () => renderHero(true),
    stats,
    /* Aperçu d'un état fictif, pour tester le design sans toucher aux données :
       RestoUX.preview({ seatedNow: 12, expectedCovers: 8, expectedCount: 3, nextTime: '21:15', servedToday: 12 }) */
    preview(over = {}) {
      const hero = buildHero({ ...stats(), ...over });
      hero.classList.add('rm-enter');
      document.querySelector('.rm-hero')?.replaceWith(hero);
      previewUntil = Date.now() + 30000;   // l'aperçu reste 30 s puis les vraies données reviennent
    },
  };
})();

/* =========================================================
   v2 — Notifications en direct, palette Ctrl+K, célébration
   Toujours en lecture seule : la palette ne fait que cliquer
   sur des liens et boutons qui existent déjà dans l'app.
   ========================================================= */
(() => {
  if (!window.RestoUX || window.RestoUX.v2) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    seat: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 18h14"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    x: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
    party: '<path d="M5.8 11.3 2 22l10.7-3.8"/><path d="M4 3h.01M22 8h.01M15 2h.01M22 20h.01"/><path d="m22 2-2.2.7a2.9 2.9 0 0 0-1.8 3.5v0a2.9 2.9 0 0 1-1.9 3.5L14 10"/><path d="M8.6 9.4a4 4 0 0 1 6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    user: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    sync: '<path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  };
  const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  /* =================== 1. Notifications =================== */
  const wrap = el('div', 'rm-toasts');
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');
  document.body.append(wrap);

  function toast({ title, text, icon = 'plus', tone = 'ok', ms = 6000 }) {
    const t = el('div', 'rm-toast');
    t.dataset.tone = tone;
    t.style.setProperty('--rm-toast-ms', ms + 'ms');
    const ic = el('div', 'rm-toast-icon'); ic.innerHTML = svg(icon);
    const body = el('div'); body.append(el('b', null, title), el('span', null, text || ''));
    const close = el('button', 'rm-toast-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Fermer');
    const timer = el('i', 'rm-toast-timer');
    t.append(ic, body, close, timer);
    wrap.append(t);
    while (wrap.children.length > 4) wrap.firstElementChild.remove();
    let left = ms, start = Date.now(), handle;
    const dismiss = () => {
      clearTimeout(handle);
      if (reduce) return t.remove();
      t.classList.add('rm-out'); setTimeout(() => t.remove(), 240);
    };
    const arm = () => { start = Date.now(); handle = setTimeout(dismiss, left); };
    t.addEventListener('mouseenter', () => { clearTimeout(handle); left -= Date.now() - start; });
    t.addEventListener('mouseleave', arm);
    close.addEventListener('click', dismiss);
    // Mobile : glisser la notification vers la droite pour la fermer
    let x0 = null, dx = 0;
    t.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' || e.target === close) return; x0 = e.clientX; dx = 0; t.classList.add('rm-swiping'); clearTimeout(handle); });
    t.addEventListener('pointermove', e => { if (x0 === null) return; dx = Math.max(0, e.clientX - x0); t.style.transform = `translateX(${dx}px)`; t.style.opacity = String(Math.max(.2, 1 - dx / 220)); });
    const end = () => {
      if (x0 === null) return; x0 = null; t.classList.remove('rm-swiping');
      if (dx > 80) { t.classList.add('rm-swiped'); t.style.transform = 'translateX(110%)'; t.style.opacity = '0'; setTimeout(() => t.remove(), 230); }
      else { t.style.transform = ''; t.style.opacity = ''; arm(); }
    };
    t.addEventListener('pointerup', end); t.addEventListener('pointercancel', end);
    arm();
    return t;
  }

  /* Changements venus d'ailleurs (collègue, réservation en ligne) :
     on ignore ceux qui suivent une action locale, l'app a déjà ses propres confirmations. */
  let lastLocal = 0;
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { lastLocal = Date.now(); }, { capture: true, passive: true }));

  const TZ = 'Europe/Paris';
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const dayLabel = iso => iso === today() ? 'ce soir' :
    new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00Z'));
  const tablesLabel = r => (Array.isArray(r.tables) && r.tables.length) ? `Table ${r.tables.join(' + ')}` : 'Table à attribuer';
  const covers = r => { const n = Number(r.guests) || 0; return `${n} couvert${n > 1 ? 's' : ''}`; };
  const hhmm = t => (t || '').slice(0, 5).replace(':', 'h');

  let snap = null;
  function snapshot() {
    const m = new Map();
    (Array.isArray(window.RestoSharedReservations) ? window.RestoSharedReservations : [])
      .forEach(r => r && r.id && m.set(r.id, { s: r.status, d: r.date, r }));
    return m;
  }
  function diff() {
    const now = snapshot();
    if (!snap) { snap = now; return; }
    const remote = Date.now() - lastLocal > 4000;
    const t = today();
    if (remote) {
      let shown = 0;
      for (const [id, cur] of now) {
        if (shown >= 3) break;
        const prev = snap.get(id), r = cur.r;
        if (cur.d < t) continue;                                    // l'historique ne nous intéresse pas
        if (!prev) {
          toast({ title: 'Nouvelle réservation', text: `${covers(r)} · ${dayLabel(r.date)} à ${hhmm(r.time)}`, icon: 'plus', tone: 'info' });
          shown++;
        } else if (prev.s !== cur.s) {
          if (cur.s === 'arrived' || cur.s === 'seated') toast({ title: 'Clients installés', text: `${tablesLabel(r)} · ${covers(r)}`, icon: 'seat' });
          else if (cur.s === 'completed' || cur.s === 'released') toast({ title: 'Table libérée', text: `${tablesLabel(r)} est de nouveau disponible`, icon: 'out' });
          else if (cur.s === 'cancelled') toast({ title: 'Réservation annulée', text: `${covers(r)} · ${dayLabel(r.date)} à ${hhmm(r.time)}`, icon: 'x', tone: 'warn' });
          else if (cur.s === 'no_show') toast({ title: 'Absence notée', text: `${tablesLabel(r)} · ${hhmm(r.time)}`, icon: 'alert', tone: 'warn' });
          else if (cur.s === 'late') toast({ title: 'Client en retard', text: `${tablesLabel(r)} · prévu à ${hhmm(r.time)}`, icon: 'clock', tone: 'warn' });
          else continue;
          shown++;
        }
      }
    }
    snap = now;
    checkRecord();
  }
  setInterval(diff, 3000);

  /* =================== 2. Célébration de record =================== */
  function confetti() {
    if (reduce) return;
    const c = el('canvas', 'rm-confetti'); document.body.append(c);
    const ctx = c.getContext('2d'), dpr = devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const colors = ['#6fd3a4', '#146c55', '#b8f0d2', '#ffd166', '#ffffff'];
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .35,
      vx: (Math.random() - .5) * 14, vy: -Math.random() * 13 - 4,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 4,
      a: Math.random() * Math.PI, va: (Math.random() - .5) * .4,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = performance.now();
    (function frame(now) {
      const k = (now - t0) / 1800;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(p => {
        p.vy += .38; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - k); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (k < 1) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }
  function checkRecord() {
    const s = window.RestoUX.stats();
    const past = s.days.slice(0, -1).map(d => d.v);
    const prevBest = Math.max(0, ...past);
    const key = 'rmux-record-' + s.today;
    if (s.servedToday > 0 && prevBest > 0 && s.servedToday > prevBest && s.servedToday > Number(store.get(key) || 0)) {
      store.set(key, String(s.servedToday));
      confetti();
      toast({ title: 'Nouveau record sur 14 jours !', text: `${s.servedToday} couverts servis aujourd’hui (précédent : ${prevBest}). Bravo l’équipe.`, icon: 'party', tone: 'party', ms: 9000 });
    }
  }

  /* =================== 3. Palette de commandes =================== */
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const MOD = isMac ? '⌘' : 'Ctrl';
  const click = sel => () => { const n = typeof sel === 'function' ? sel() : document.querySelector(sel); n?.click(); };
  const byLabel = re => () => [...document.querySelectorAll('button, a')].find(b => re.test(b.getAttribute('aria-label') || b.textContent || ''));
  const COMMANDS = [
    { group: 'Aller à', label: 'Tables et tableau de bord', icon: 'grid', keys: 'G T', words: 'tables salle accueil tableau bord', run: click('nav.sidebar a[href="#tables"]') },
    { group: 'Aller à', label: 'Réservations', icon: 'cal', keys: 'G R', words: 'reservations liste planning', run: click('nav.sidebar a[href="#reservations"]') },
    { group: 'Aller à', label: 'Ajouter un client', icon: 'user', keys: 'G N', words: 'nouveau client reservation ajouter creer', run: click('nav.sidebar a[href="#reservationForm"]') },
    { group: 'Aller à', label: 'Passages', icon: 'clock', keys: 'G P', words: 'passage walk-in sans reservation', run: click('nav.sidebar a[href="#passages"]') },
    { group: 'Aller à', label: 'Gestion', icon: 'gear', keys: 'G G', words: 'gestion administration parametres reglages', run: click('nav.sidebar a[href="#administration"]') },
    { group: 'Actions', label: 'Mode Coup de feu', icon: 'zap', words: 'coup de feu rush express rapide', run: click('.rmExpressLaunch') },
    { group: 'Actions', label: 'Notifications', icon: 'bell', words: 'notifications alertes cloche', run: click(byLabel(/^Notifications/)) },
    { group: 'Actions', label: 'Actualiser les données', icon: 'sync', words: 'actualiser rafraichir sync recharger', run: click(byLabel(/Actualiser les données/)) },
    { group: 'Actions', label: 'Aide et entraînement', icon: 'help', words: 'aide guide formation faq', run: click(byLabel(/Aide et entraînement/)) },
  ];
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function searchClient(q) {
    document.querySelector('nav.sidebar a[href="#reservations"]')?.click();
    setTimeout(() => {
      const input = document.getElementById('reservationQuery');
      if (!input) return;
      input.value = q;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }, 350);
  }

  let open = null;
  function openPalette() {
    if (open) return;
    store.set('rmux-palette-used', '1');
    hint?.remove();
    const back = el('div', 'rm-palette-backdrop');
    const box = el('div', 'rm-palette');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Palette de commandes');
    const bar = el('label', 'rm-palette-input'); bar.innerHTML = svg('search');
    const input = el('input'); input.placeholder = 'Aller à, lancer une action, chercher un client…';
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', 'rm-palette-list');
    bar.append(input, el('span', 'rm-kbd', 'Échap'));
    const list = el('ul', 'rm-palette-list'); list.id = 'rm-palette-list'; list.setAttribute('role', 'listbox');
    const foot = el('div', 'rm-palette-foot');
    foot.append(el('span', null, '↑ ↓ pour naviguer'), el('span', null, 'Entrée pour valider'), el('span', null, `${MOD} K pour ouvrir`));
    box.append(bar, list, foot); back.append(box); document.body.append(back);

    let items = [], sel = 0;
    const render = () => {
      const q = norm(input.value.trim());
      // Les correspondances dans le titre passent avant celles dans les mots-clés
      const score = c => { const l = norm(c.label); return l.startsWith(q) ? 0 : l.includes(q) ? 1 : norm(c.words).includes(q) ? 2 : 9; };
      items = q ? COMMANDS.filter(c => score(c) < 9).sort((a, b) => score(a) - score(b) || COMMANDS.indexOf(a) - COMMANDS.indexOf(b)) : COMMANDS.slice();
      if (q.length >= 2) items.push({ group: 'Rechercher', label: `Chercher « ${input.value.trim()} » dans les réservations`, icon: 'search', run: () => searchClient(input.value.trim()) });
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.replaceChildren();
      if (!items.length) { list.append(el('li', 'rm-palette-empty', 'Aucun résultat')); return; }
      let g = null;
      items.forEach((c, i) => {
        // Sans recherche : titres de groupes. Avec recherche : liste triée par pertinence.
        const header = q ? (c.group === 'Rechercher' ? 'Rechercher' : 'Résultats') : c.group;
        if (header !== g) { g = header; list.append(el('li', 'rm-palette-group', g)); }
        const li = el('li', 'rm-palette-item'); li.setAttribute('role', 'option'); li.id = 'rm-opt-' + i;
        li.setAttribute('aria-selected', String(i === sel));
        li.innerHTML = svg(c.icon);
        li.append(el('span', null, c.label));
        if (c.keys) li.append(el('span', 'rm-kbd', c.keys));
        li.addEventListener('mousemove', () => { if (sel !== i) { sel = i; mark(); } });
        li.addEventListener('click', () => run(i));
        list.append(li);
      });
      input.setAttribute('aria-activedescendant', 'rm-opt-' + sel);
    };
    const mark = () => {
      list.querySelectorAll('.rm-palette-item').forEach(li => li.setAttribute('aria-selected', String(li.id === 'rm-opt-' + sel)));
      input.setAttribute('aria-activedescendant', 'rm-opt-' + sel);
      list.querySelector('#rm-opt-' + sel)?.scrollIntoView({ block: 'nearest' });
    };
    const run = i => { const c = items[i]; close(); c?.run(); };
    const close = () => { back.remove(); open = null; prevFocus?.focus?.(); };
    const prevFocus = document.activeElement;

    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, items.length); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(1, items.length); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') e.preventDefault();               // le focus reste dans la palette
    });
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    render(); input.focus();
    open = { close };
  }

  /* Raccourcis clavier : Ctrl/⌘+K ou « / » ouvrent la palette ; G puis T/R/N/P/G pour naviguer */
  const typing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  let gPending = 0;
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open ? open.close() : openPalette(); return; }
    if (open || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const appDialog = [...document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]')]
      .some(d => !d.classList.contains('rm-palette') && d.getClientRects().length);
    if (appDialog) return;                                       // une fenêtre de l'app est ouverte
    if (e.key === '/') { e.preventDefault(); openPalette(); return; }
    const k = e.key.toLowerCase();
    if (k === 'g' && !gPending) { gPending = Date.now(); return; }
    if (gPending && Date.now() - gPending < 1200) {
      const target = { t: '#tables', r: '#reservations', n: '#reservationForm', p: '#passages', g: '#administration' }[k];
      gPending = 0;
      if (target) { e.preventDefault(); document.querySelector(`nav.sidebar a[href="${target}"]`)?.click(); }
    } else gPending = 0;
  });

  /* Petite pastille de découverte, jusqu'à la première utilisation */
  let hint = null;
  if (!store.get('rmux-palette-used') && matchMedia('(hover: hover)').matches) {
    hint = el('button', 'rm-palette-hint'); hint.type = 'button';
    hint.append(el('span', null, 'Astuce : tout trouver en un geste'), el('span', 'rm-kbd', `${MOD} K`));
    hint.addEventListener('click', openPalette);
    document.body.append(hint);
    setTimeout(() => { hint?.remove(); }, 12000);
  }

  diff();
  Object.assign(window.RestoUX, {
    v2: true,
    toast,
    palette: openPalette,
    /* Pour tester l'animation de record sans toucher aux données */
    celebrate: () => { confetti(); toast({ title: 'Nouveau record sur 14 jours !', text: 'Aperçu de la célébration.', icon: 'party', tone: 'party', ms: 9000 }); },
  });
})();

/* =========================================================
   v3 — En-tête, menu latéral, notifications, sections
   ========================================================= */
(() => {
  if (!window.RestoUX || window.RestoUX.v3) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const TZ = 'Europe/Paris';
  const pop = (n, cls = 'rm-pop') => { if (!n || reduce) return; n.classList.remove(cls); void n.offsetWidth; n.classList.add(cls); };

  /* ---------- 1. En-tête ---------- */
  const header = $('header.top');
  const onScroll = () => header?.classList.toggle('rm-scrolled', (window.scrollY || document.documentElement.scrollTop) > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  function clock() {
    const date = $('#serviceDate'); if (!date) return;
    let c = $('.rm-hclock', date.parentElement);
    if (!c) { c = document.createElement('span'); c.className = 'rm-hclock'; c.setAttribute('aria-label', 'Heure actuelle'); date.after(c); }
    c.textContent = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date());
  }
  clock(); setInterval(clock, 15000);

  // Bouton actualiser : l'icône fait un tour complet
  $('#refreshAppBtn')?.addEventListener('click', e => pop(e.currentTarget, 'rm-spin'));
  $$('.headerQuickActions button').forEach(b => { if (/Actualiser les données/.test(b.getAttribute('aria-label') || '')) b.addEventListener('click', () => pop(b, 'rm-spin')); });

  // Cloche : sonne quand le nombre de non-lues augmente (et une fois au chargement s'il y en a)
  let lastBell = null;
  function bell() {
    const b = $('#serviceBell'), n = $('.serviceBellCount'); if (!b || !n) return;
    const v = parseInt(n.textContent, 10) || 0;
    if (lastBell === null ? v > 0 : v > lastBell) { pop(b, 'rm-ring'); pop(n); }
    lastBell = v;
  }

  /* ---------- 2. Menu latéral ---------- */
  const nav = $('nav.sidebar');
  const pill = document.createElement('span'); pill.className = 'rm-nav-pill'; pill.setAttribute('aria-hidden', 'true');
  nav?.prepend(pill);
  let pillReady = false;
  function movePill() {
    const a = $('nav.sidebar > a.selected');
    if (!a) { pill.style.opacity = '0'; return; }
    const geo = `${a.offsetWidth}|${a.offsetHeight}|${a.offsetLeft}|${a.offsetTop}`;
    if (geo === pill.dataset.geo) return;   // rien n'a bougé : on évite une boucle avec l'observateur
    pill.dataset.geo = geo;
    pill.style.opacity = '1';
    pill.style.width = a.offsetWidth + 'px';
    pill.style.height = a.offsetHeight + 'px';
    pill.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`;
    if (!pillReady) {                       // première pose sans animation
      pill.style.transition = 'none'; void pill.offsetWidth; pill.style.transition = ''; pillReady = true;
    }
  }
  addEventListener('resize', movePill);

  const KEYS = { '#tables': 'G T', '#reservations': 'G R', '#reservationForm': 'G N', '#passages': 'G P', '#administration': 'G G' };
  $$('nav.sidebar > a').forEach(a => {
    const k = KEYS[a.getAttribute('href')]; if (!k || $('.rm-nav-keys', a)) return;
    const s = document.createElement('span'); s.className = 'rm-nav-keys'; s.textContent = k; s.setAttribute('aria-hidden', 'true');
    a.append(s);
  });

  // Pastille : nombre de réservations encore attendues aujourd'hui
  let lastBadge = null;
  function navBadge() {
    const n = window.RestoUX.stats().expectedCount;
    const changed = lastBadge !== null && n !== lastBadge;
    [$('nav.sidebar > a[href="#reservations"]'), $('.mobileBottomNav .mobileNavItem[data-nav="reservations"]')].forEach(a => {
      if (a) badgeOn(a, n, changed);
    });
    lastBadge = n;
  }
  function badgeOn(a, n, changed) {
    let b = $('.rm-nav-badge', a);
    if (!n) { b?.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'rm-nav-badge'; a.insertBefore(b, $('.rm-nav-keys', a)); }
    // On n'écrit que si la valeur change : sinon l'observateur se relance en boucle
    if (b.textContent !== String(n)) {
      b.textContent = String(n);
      b.setAttribute('aria-label', `${n} réservation${n > 1 ? 's' : ''} attendue${n > 1 ? 's' : ''} aujourd’hui`);
    }
    if (changed) pop(b);
  }

  /* ---------- 3. Sections ---------- */
  function liveEyebrows() {
    $$('.occupancySectionEyebrow, .rushSectionEyebrow').forEach(e => {
      e.classList.toggle('rm-live-eyebrow', /^en direct/i.test(e.textContent.trim()));
    });
  }
  function gaugeLevel() {
    const sec = $('.currentOccupancy'), g = $('.rmLiveGauge'); if (!sec || !g) return;
    const v = parseFloat(g.style.getPropertyValue('--rm-gauge-value')) || 0;
    const lvl = v >= 85 ? 'high' : v >= 60 ? 'mid' : 'low';
    if (sec.dataset.rmLevel !== lvl) sec.dataset.rmLevel = lvl;
  }
  const EMPTY_SVG = `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="26" fill="#e7f5ec"/><circle cx="32" cy="32" r="18" fill="#fff" stroke="#9fd3b6" stroke-width="2"/>
    <path class="rm-hand" d="M32 32V20" stroke="#146c55" stroke-width="3" stroke-linecap="round"/>
    <path d="M32 32l7 4" stroke="#6fd3a4" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="2.5" fill="#146c55"/></svg>`;
  function emptyStates() {
    const up = $('#upcoming'); if (!up) return;
    const isEmpty = /^Aucune arrivée en attente\.?$/.test(up.textContent.trim());
    if (isEmpty && !$('.rm-empty-state', up)) {
      const box = document.createElement('div'); box.className = 'rm-empty-state';
      box.innerHTML = EMPTY_SVG;
      const b = document.createElement('b'); b.textContent = 'Aucune arrivée en attente';
      const s = document.createElement('small'); s.textContent = 'Les prochaines arrivées s’afficheront ici, triées par heure.';
      box.append(b, s);
      up.replaceChildren(box);
    }
  }

  // Apparition des sections au défilement (une seule fois)
  const io = 'IntersectionObserver' in window && !reduce ? new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('rm-in'); io.unobserve(e.target); setTimeout(() => e.target.classList.remove('rm-scroll-reveal', 'rm-in'), 900); } });
  }, { rootMargin: '0px 0px -8% 0px' }) : null;
  function scrollReveal() {
    if (!io) return;
    $$('.appScreenActive .currentOccupancy, .appScreenActive .rmImmediateAvailability, .appScreenActive .rushDashboard, .appScreenActive .content > .panel').forEach(s => {
      if (s.dataset.rmIo) return;
      s.dataset.rmIo = '1';
      if (s.getBoundingClientRect().top < innerHeight * .9) return;   // déjà visible : pas d'effet
      s.classList.add('rm-scroll-reveal'); io.observe(s);
    });
  }

  /* ---------- Boucle ---------- */
  let queued = false;
  function tick() { movePill(); bell(); navBadge(); liveEyebrows(); gaugeLevel(); emptyStates(); scrollReveal(); }
  new MutationObserver(() => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; tick(); });
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
  setInterval(navBadge, 5000);
  tick();
  document.fonts?.ready?.then(movePill);

  window.RestoUX.v3 = true;
  window.RestoUX.ringBell = () => pop($('#serviceBell'), 'rm-ring');
})();

/* =========================================================
   v4 — Écran Réservations
   ========================================================= */
(() => {
  if (!window.RestoUX || window.RestoUX.v4) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const TZ = 'Europe/Paris';
  const pop = n => { if (!n || reduce) return; n.classList.remove('rm-pop'); void n.offsetWidth; n.classList.add('rm-pop'); };
  const EXPECTED = new Set(['reserved', 'confirmed', 'late']);

  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const nowMin = () => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':');
    return (+p[0]) * 60 + (+p[1]);
  };
  const toMin = t => { const [h, m] = String(t || '').split(':'); return (+h) * 60 + (+m || 0); };

  /* ---------- 1. Onglets : pastille glissante + compteurs qui pulsent ---------- */
  let slider = null;
  function tabs() {
    const box = $('.reservationViewTabs'); if (!box) return;
    if (!slider || !slider.isConnected) {
      slider = document.createElement('span'); slider.className = 'rm-tab-slider'; slider.setAttribute('aria-hidden', 'true');
      box.prepend(slider); box.classList.add('rm-has-slider'); slider.dataset.first = '1';
    }
    const a = $('.reservationViewTab.isActive', box);
    if (!a || !a.offsetWidth) return;                               // écran caché : on attend
    const geo = `${a.offsetLeft}|${a.offsetTop}|${a.offsetWidth}|${a.offsetHeight}`;
    if (slider.dataset.geo === geo) return;
    slider.dataset.geo = geo;
    if (slider.dataset.first) { slider.style.transition = 'none'; }
    slider.style.width = a.offsetWidth + 'px';
    slider.style.height = a.offsetHeight + 'px';
    slider.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`;
    if (slider.dataset.first) { void slider.offsetWidth; slider.style.transition = ''; delete slider.dataset.first; }
  }
  const lastCounts = new Map();
  function counts() {
    $$('.reservationViewTab').forEach((t, i) => {
      const c = $('.rmViewCount', t); if (!c) return;
      const v = c.textContent.trim(), prev = lastCounts.get(i);
      if (prev !== undefined && prev !== v) pop(c);
      lastCounts.set(i, v);
    });
  }

  /* ---------- 2. Compte à rebours + prochaine arrivée ---------- */
  function eta() {
    const list = $('#reservationList'); if (!list || !list.offsetParent) return;
    const byId = new Map((window.RestoSharedReservations || []).map(r => [r.id, r]));
    const t = today(), now = nowMin();
    const narrow = matchMedia('(max-width: 1180px)').matches;
    let next = null, nextDiff = Infinity;
    $$('.rmBookingCard', list).forEach(card => {
      const r = byId.get(card.dataset.rmMotionKey);
      const time = $('.rmBookingTime', card); if (!time) return;
      // Écran large : sous l'heure. Tablette et mobile : sous la date, où il y a de la place.
      const host = narrow ? ($('.rmBookingClientText', card) || time) : time;
      let chip = $('.rm-eta', card);
      if (!r || r.date !== t || !EXPECTED.has(r.status)) { chip?.remove(); card.classList.remove('rm-next'); return; }
      const diff = toMin(r.time) - now;
      let text, tone;
      if (diff < -5) { text = `${-diff} min de retard`; tone = 'late'; }
      else if (diff <= 0) { text = 'Maintenant'; tone = 'now'; }
      else if (diff <= 15) { text = `Dans ${diff} min`; tone = 'soon'; }
      else if (diff < 60) { text = `Dans ${diff} min`; tone = 'info'; }
      else { const h = Math.floor(diff / 60), m = diff % 60; text = `Dans ${h} h${m ? ' ' + String(m).padStart(2, '0') : ''}`; tone = 'info'; }
      if (!chip) { chip = document.createElement('span'); chip.className = 'rm-eta'; }
      if (chip.parentElement !== host) host.append(chip);
      if (chip.textContent !== text) chip.textContent = text;
      if (chip.dataset.tone !== tone) chip.dataset.tone = tone;
      if (diff >= -5 && diff < nextDiff) { nextDiff = diff; next = card; }
    });
    $$('.rmBookingCard.rm-next', list).forEach(c => { if (c !== next) c.classList.remove('rm-next'); });
    if (next && !next.classList.contains('rm-next')) next.classList.add('rm-next');
  }

  /* ---------- 3. Surlignage de la recherche (sans modifier le DOM de l'app) ---------- */
  const canHighlight = 'highlights' in CSS && typeof Highlight === 'function';
  function highlight() {
    if (!canHighlight) return;
    const q = ($('#reservationQuery')?.value || '').trim().toLowerCase();
    if (q.length < 2) { CSS.highlights.delete('rm-search'); return; }
    const ranges = [];
    $$('#reservationList .rmBookingClientText, #reservationList .rmBookingTable, #reservationList .rmBookingOrigin').forEach(root => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const txt = n.nodeValue.toLowerCase();
        for (let i = txt.indexOf(q); i !== -1; i = txt.indexOf(q, i + q.length)) {
          const r = new Range(); r.setStart(n, i); r.setEnd(n, i + q.length); ranges.push(r);
        }
      }
    });
    CSS.highlights.set('rm-search', new Highlight(...ranges));
  }
  document.addEventListener('input', e => { if (e.target?.id === 'reservationQuery') requestAnimationFrame(highlight); });

  /* ---------- 4. État vide illustré ---------- */
  const EMPTY = `<svg viewBox="0 0 84 84" fill="none" aria-hidden="true">
    <rect x="14" y="16" width="44" height="54" rx="8" fill="#e7f5ec"/>
    <rect x="22" y="28" width="28" height="4" rx="2" fill="#9fd3b6"/><rect x="22" y="38" width="20" height="4" rx="2" fill="#9fd3b6"/><rect x="22" y="48" width="24" height="4" rx="2" fill="#c9e8d6"/>
    <g class="rm-mag"><circle cx="56" cy="50" r="12" fill="#fff" stroke="#146c55" stroke-width="4"/><path d="M65 59l8 8" stroke="#146c55" stroke-width="5" stroke-linecap="round"/></g></svg>`;
  function emptyState() {
    const panel = $('#reservations'); if (!panel || !panel.offsetParent) return;
    const list = $('#reservationList');
    const hasRows = !!$('.rmBookingCard', list);
    const msg = $$('*', list).find(e => !e.children.length && /^Aucune réservation/i.test(e.textContent.trim()) && !e.closest('.rm-res-empty'));
    if (hasRows || !msg) return;
    const q = ($('#reservationQuery')?.value || '').trim();
    const box = document.createElement('div'); box.className = 'rm-res-empty'; box.innerHTML = EMPTY;
    const b = document.createElement('b'); b.textContent = msg.textContent.trim().replace(/\.$/, '');
    const s = document.createElement('small');
    s.textContent = q ? 'Vérifiez l’orthographe, ou cherchez sur toutes les dates avec le bouton « Toutes les dates ».' : 'Changez la date ou l’onglet pour voir d’autres réservations.';
    box.append(b, s);
    msg.replaceWith(box);
  }

  /* ---------- Boucle ---------- */
  let queued = false;
  function tick() { tabs(); counts(); eta(); highlight(); emptyState(); }
  new MutationObserver(() => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; tick(); });
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', () => { if (slider) slider.dataset.geo = ''; tabs(); eta(); });
  setInterval(eta, 30000);
  tick();
  window.RestoUX.v4 = true;
})();

/* =========================================================
   v5 — Tablette et mobile
   ========================================================= */
(() => {
  if (!window.RestoUX || window.RestoUX.v5) return;
  // Hauteur de la barre de navigation du bas (mobile) : les notifications se placent au-dessus
  const root = document.documentElement;
  function bottomOffset() {
    const bar = document.querySelector('.mobileBottomNav');
    // Visible et collée en bas de l'écran (fixed ou sticky selon l'app)
    const r = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect() : null;
    const h = r && r.height && r.bottom >= root.clientHeight - 2 ? Math.round(r.height) : 0;
    const v = h + 'px';
    if (root.style.getPropertyValue('--rm-bottom-offset') !== v) root.style.setProperty('--rm-bottom-offset', v);
  }
  addEventListener('resize', bottomOffset);
  matchMedia('(max-width: 820px)').addEventListener?.('change', bottomOffset);
  bottomOffset();
  setTimeout(bottomOffset, 1000);
  window.RestoUX.v5 = true;
})();

/* =========================================================
   v6 — Écran « Ajouter un client »
   Lecture seule : on lit l'état du formulaire, on ne le remplit jamais,
   on ne clique sur rien. Les étapes ne font que faire défiler la page.
   ========================================================= */
(() => {
  if (!window.RestoUX || window.RestoUX.v6) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const val = id => ($('#' + id)?.value || '').trim();
  const visible = n => !!(n && n.offsetParent);

  /* ---------- 1. Barre d'étapes ----------
     L'app pré-remplit date, créneau, couverts et table. Une valeur proposée par défaut
     n'est pas une valeur choisie : l'étape reste « à vérifier » (pointillés + valeur affichée)
     tant que personne n'a touché à la zone correspondante. */
  const fmtDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${v}T12:00:00Z`)) : v; };
  const tableText = () => { const sel = $('#bookingTable'); const o = sel?.selectedOptions?.[0]; return (o?.textContent || '').split('·')[0].trim(); };
  const STEPS = [
    { key: 'client', label: 'Client', zone: '.bookingTypeField, #bookingHotelRoomField, #bookingClient', target: () => $('.bookingTypeField'),
      valid: () => !!$('.bookingTypeOption input:checked') && (!visible($('#bookingHotelRoom')) || !!val('bookingHotelRoom')),
      value: () => visible($('#bookingHotelRoom')) && val('bookingHotelRoom') ? 'Ch. ' + val('bookingHotelRoom') : '' },
    { key: 'date', label: 'Date', zone: '#bookingDate', target: () => $('#bookingDate')?.closest('label'),
      valid: () => !!val('bookingDate'), value: () => fmtDate(val('bookingDate')) },
    { key: 'slot', label: 'Créneau', zone: '#rmDirectorTimeChoices, #bookingTime', target: () => $('#rmDirectorTimeChoices'),
      valid: () => !!val('bookingTime'), value: () => val('bookingTime') },
    { key: 'guests', label: 'Couverts', zone: '#rmDirectorGuestChoices, #bookingGuests', target: () => $('#rmDirectorGuestChoices'),
      valid: () => Number(val('bookingGuests')) > 0, value: () => val('bookingGuests') },
    { key: 'table', label: 'Table', skip: () => window.RestoReception === true || document.documentElement.classList.contains('reception'), zone: '#bookingAutoTableInfo, #bookingTable', target: () => $('#bookingAutoTableInfo') || $('#bookingTable')?.closest('label'),
      valid: () => !!val('bookingTable'), value: () => tableText() },
    { key: 'infos', label: 'Infos', optional: true, zone: '.bookingExtraFields', target: () => $('.bookingExtraFields'),
      valid: () => !!(val('bookingAllergies') || val('bookingNotes')), value: () => '' },
  ];
  // Une zone est « touchée » dès qu'on clique, tape ou change une valeur dedans
  const touched = new Set();
  const markTouch = e => {
    const s = STEPS.find(st => e.target?.closest?.(st.zone));
    if (s && !touched.has(s.key)) { touched.add(s.key); requestAnimationFrame(updateSteps); }
  };
  ['pointerdown', 'keydown', 'input', 'change'].forEach(ev => document.addEventListener(ev, e => { if (e.isTrusted) markTouch(e); }, { capture: true, passive: true }));

  let bar = null; const lastDone = {};
  function buildSteps() {
    const form = $('#bookingForm');
    if (!form || !visible(form)) { if (touched.size) touched.clear(); return null; }   // formulaire quitté : on repart de zéro
    if (bar && bar.isConnected) return bar;
    bar = document.createElement('nav'); bar.className = 'rm-steps'; bar.setAttribute('aria-label', 'Étapes de la réservation');
    STEPS.forEach((s, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'rm-step' + (s.optional ? ' is-optional' : ''); b.dataset.step = s.key;
      const dot = document.createElement('span'); dot.className = 'rm-step-dot'; const n = document.createElement('span'); n.textContent = String(i + 1); dot.append(n);
      const l = document.createElement('span'); l.className = 'rm-step-label'; l.textContent = s.label;
      const v = document.createElement('span'); v.className = 'rm-step-value';
      b.append(dot, l, v);
      b.addEventListener('click', () => s.target()?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }));
      bar.append(b);
    });
    const prog = document.createElement('span'); prog.className = 'rm-steps-progress'; prog.append(document.createElement('i'));
    bar.append(prog);
    form.before(bar);
    return bar;
  }
  function updateSteps() {
    const b = buildSteps(); if (!b) return;
    let current = null, confirmed = 0, validCount = 0;
    const skipped = s => !!(s.skip && s.skip());   // Espace Réception : la table est attribuée par le restaurant
    const required = STEPS.filter(s => !s.optional && !skipped(s)).length;
    let shown = 0;
    STEPS.forEach(s => {
      const stepEl = $(`[data-step="${s.key}"]`, b);
      if (stepEl.hidden !== skipped(s)) stepEl.hidden = skipped(s);
      if (skipped(s)) return;
      const num = String(++shown), numEl = $('.rm-step-dot span', stepEl);
      if (numEl && numEl.textContent !== num) numEl.textContent = num;
      const el = $(`[data-step="${s.key}"]`, b);
      const valid = !!s.valid();
      const done = !!(valid && (touched.has(s.key) || s.key === 'client' || s.optional));   // le client se valide par le n° de chambre ou le type
      const proposed = valid && !done;
      if (el.classList.contains('is-done') !== done) {
        el.classList.toggle('is-done', done);
        if (done && lastDone[s.key] === false && !reduce) { el.classList.remove('rm-just-done'); void el.offsetWidth; el.classList.add('rm-just-done'); }
      }
      if (el.classList.contains('is-default') !== proposed) el.classList.toggle('is-default', proposed);
      lastDone[s.key] = done;
      const v = s.value(); const vEl = $('.rm-step-value', el);
      if (vEl.textContent !== v) vEl.textContent = v;
      const title = proposed ? `${s.label} : ${v} (proposé par défaut, à vérifier)` : done ? `${s.label} : ${v || 'fait'}` : `${s.label} : à renseigner`;
      if (el.title !== title) el.title = title;
      if (valid && !s.optional) validCount++;
      if (done && !s.optional) confirmed++;
      if (!done && !current && !s.optional) current = s.key;
    });
    if (!current) current = 'infos';
    $$('.rm-step', b).forEach(el => { const on = el.dataset.step === current; if (el.classList.contains('is-current') !== on) el.classList.toggle('is-current', on); });
    const p = (confirmed / required).toFixed(3);
    if (b.style.getPropertyValue('--rm-steps') !== p) b.style.setProperty('--rm-steps', p);
    const submit = $('.bookingSubmitPrimary');
    const ready = validCount === required;                       // l'envoi est possible dès que tout est valide
    if (submit && submit.classList.contains('rm-ready') !== ready) submit.classList.toggle('rm-ready', ready);
  }

  /* ---------- 2. Allergies renseignées + zones de texte qui s'agrandissent ---------- */
  function fields() {
    const a = $('#bookingAllergies');
    if (a) {
      const lab = a.closest('.reservationField'); const on = !!a.value.trim();
      if (lab && lab.classList.contains('rm-allergy-on') !== on) lab.classList.toggle('rm-allergy-on', on);
    }
  }
  function autosize(t) {
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = Math.min(Math.max(t.scrollHeight + 2, 92), 260) + 'px';
  }
  document.addEventListener('input', e => {
    if (e.target?.matches?.('#bookingAllergies, #bookingNotes')) { autosize(e.target); fields(); }
    if (e.target?.closest?.('#bookingForm')) requestAnimationFrame(updateSteps);
  }, { passive: true });
  document.addEventListener('change', e => { if (e.target?.closest?.('#bookingForm')) requestAnimationFrame(updateSteps); }, { passive: true });

  /* ---------- 3. Couverts : pastille glissante ---------- */
  let gslider = null;
  function guestSlider() {
    const box = $('.rmGuestQuickGrid'); if (!box) return;
    if (!gslider || !gslider.isConnected || gslider.parentElement !== box) {
      gslider = document.createElement('span'); gslider.className = 'rm-guest-slider'; gslider.setAttribute('aria-hidden', 'true');
      box.prepend(gslider); box.classList.add('rm-has-slider'); gslider.dataset.first = '1';
    }
    const a = $('.rmGuestChip[aria-pressed="true"]', box);
    if (!a || !a.offsetWidth) { if (gslider.style.opacity !== '0') gslider.style.opacity = '0'; return; }
    const geo = `${a.offsetLeft}|${a.offsetTop}|${a.offsetWidth}|${a.offsetHeight}`;
    if (gslider.dataset.geo === geo) return;
    gslider.dataset.geo = geo; gslider.style.opacity = '1';
    if (gslider.dataset.first) gslider.style.transition = 'none';
    gslider.style.width = a.offsetWidth + 'px'; gslider.style.height = a.offsetHeight + 'px';
    gslider.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`;
    if (gslider.dataset.first) { void gslider.offsetWidth; gslider.style.transition = ''; delete gslider.dataset.first; }
  }

  /* ---------- 4. Maintien de table : barre qui se vide ---------- */
  let holdTotal = 0, holdPrev = 0;
  function hold() {
    const box = $('#bookingDraft'), msg = $('#draftMessage');
    if (!box || !msg || !visible(box)) { holdTotal = 0; return; }
    const m = msg.textContent.match(/(?:(\d+)\s*min)?\s*(\d+)\s*s/);
    if (!m) return;
    const left = (+(m[1] || 0)) * 60 + (+m[2]);
    if (!holdTotal || left > holdPrev + 2) holdTotal = Math.max(left, 1);   // début ou « Prolonger »
    holdPrev = left;
    let barEl = $('.rm-hold', box);
    if (!barEl) { barEl = document.createElement('div'); barEl.className = 'rm-hold'; barEl.setAttribute('aria-hidden', 'true'); barEl.append(document.createElement('i')); msg.after(barEl); }
    const ratio = Math.max(0, Math.min(1, left / holdTotal)).toFixed(3);
    if (barEl.style.getPropertyValue('--rm-hold') !== ratio) barEl.style.setProperty('--rm-hold', ratio);
    const lvl = left <= 20 ? 'critical' : left <= 60 ? 'low' : 'ok';
    if (box.dataset.rmHold !== lvl) box.dataset.rmHold = lvl;
  }

  /* ---------- Boucle ---------- */
  let queued = false;
  function tick() { updateSteps(); fields(); guestSlider(); hold(); }
  new MutationObserver(() => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; tick(); });
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'hidden'] });
  setInterval(() => { updateSteps(); hold(); }, 1000);   // valeurs remplies par l'app sans évènement
  addEventListener('resize', () => { if (gslider) gslider.dataset.geo = ''; guestSlider(); });
  tick();
  ['bookingAllergies', 'bookingNotes'].forEach(id => autosize($('#' + id)));
  window.RestoUX.v6 = true;
})();
/* ========== v7 · Passages ========== */
(() => {
  if (!window.RestoUX || window.RestoUX.v7) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pop = (n, cls) => { if (!n || reduce) return; n.classList.remove(cls); void n.offsetWidth; n.classList.add(cls); };
  const nowMin = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':'); return (+p[0]) * 60 + (+p[1]); };
  const dur = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}` : `${m} min`;

  // Pastilles qui glissent : nombre de personnes, onglets Recommandées / Autres
  const sliders = {};
  function slide(key, boxSel, activeSel) {
    const box = $(boxSel); if (!box) return;
    let s = sliders[key];
    if (!s || !s.isConnected || s.parentElement !== box) {
      const a0 = $(activeSel, box);
      const cs = a0 && !box.classList.contains('rm-has-slider') ? getComputedStyle(a0) : null;
      s = document.createElement('span'); s.className = 'rm-slider'; s.setAttribute('aria-hidden', 'true');
      if (cs && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') s.style.background = cs.backgroundColor;
      if (cs) s.style.borderRadius = cs.borderRadius;
      box.prepend(s); box.classList.add('rm-has-slider'); s.dataset.first = '1'; sliders[key] = s;
    }
    const a = $(activeSel, box);
    if (!a || !a.offsetWidth) { if (s.style.opacity !== '0') s.style.opacity = '0'; return; }
    const geo = `${a.offsetLeft}|${a.offsetTop}|${a.offsetWidth}|${a.offsetHeight}`;
    if (s.dataset.geo === geo) return;
    s.dataset.geo = geo; s.style.opacity = '1';
    if (s.dataset.first) s.style.transition = 'none';
    s.style.width = a.offsetWidth + 'px'; s.style.height = a.offsetHeight + 'px';
    s.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`;
    if (s.dataset.first) { void s.offsetWidth; s.style.transition = ''; delete s.dataset.first; }
  }

  // Tables occupées : temps restant lu dans « Installés à HH:MM · Fin prévue HH:MM »
  function rows() {
    const list = $('#quickReleaseList'); if (!list) return;
    const now = nowMin();
    $$('.quickReleaseRow', list).forEach(row => {
      const t = $('.quickReleaseTiming', row);
      const m = t && t.textContent.match(/(\d{1,2})[:h](\d{2})\D+(\d{1,2})[:h](\d{2})/);
      if (!m) return;
      const s = +m[1] * 60 + +m[2]; let e = +m[3] * 60 + +m[4]; if (e < s) e += 1440;
      let n = now; if (n < s - 720) n += 1440;
      const left = e - n;
      const ratio = Math.max(0, Math.min(1, (n - s) / Math.max(1, e - s))).toFixed(3);
      const tone = left < 0 ? 'over' : left <= 15 ? 'soon' : 'ok';
      const text = left < 0 ? `Dépassé de ${dur(-left)}` : left === 0 ? 'Fin prévue maintenant' : `Reste ${dur(left)}`;
      let box = $('.rm-stay', row);
      if (!box) {
        box = document.createElement('div'); box.className = 'rm-stay';
        const track = document.createElement('span'); track.className = 'rm-stay-track'; track.setAttribute('aria-hidden', 'true'); track.append(document.createElement('i'));
        const chip = document.createElement('b'); chip.className = 'rm-stay-left';
        box.append(track, chip); t.after(box);
      }
      const chip = $('.rm-stay-left', box), track = $('.rm-stay-track', box);
      if (chip.textContent !== text) chip.textContent = text;
      if (track.style.getPropertyValue('--rm-stay') !== ratio) track.style.setProperty('--rm-stay', ratio);
      if (row.dataset.rmTone !== tone) row.dataset.rmTone = tone;
    });
    const empty = $('.quickReleaseEmpty', list);
    if (empty && /^Aucune table occupée/.test(empty.textContent.trim())) {
      const box = document.createElement('div'); box.className = 'rm-res-empty';
      box.innerHTML = `<svg viewBox="0 0 84 84" fill="none" aria-hidden="true"><ellipse cx="42" cy="62" rx="26" ry="6" fill="#e7f5ec"/><rect x="18" y="34" width="48" height="8" rx="4" fill="#9fd3b6"/><path d="M26 42v18M58 42v18" stroke="#9fd3b6" stroke-width="4" stroke-linecap="round"/><g class="rm-mag"><circle cx="42" cy="22" r="7" fill="#fff" stroke="#146c55" stroke-width="3"/><path d="M42 18v4l3 2" stroke="#146c55" stroke-width="2" stroke-linecap="round"/></g></svg>`;
      const b = document.createElement('b'); b.textContent = 'Aucune table occupée';
      const sm = document.createElement('small'); sm.textContent = 'Les tables installées apparaîtront ici avec le temps restant avant la fin prévue.';
      box.append(b, sm); empty.replaceWith(box);
    }
  }

  // Petits retours visuels quand une valeur change
  const last = {};
  function changed(key, v) { const was = last[key]; last[key] = v; return was !== undefined && was !== v; }
  const seenCards = new WeakSet();
  function form() {
    const g = $('#walkinGuests'); if (g && changed('guests', g.value)) pop($('.walkinGuestCount'), 'rm-bump');
    const c = $('#quickReleaseCount'); if (c && changed('count', c.textContent.trim())) pop(c, 'rm-pop');
    const sum = $('#walkinSelectedSummary'); if (sum && changed('summary', sum.textContent.trim())) pop(sum, 'rm-soft');
    let i = 0;
    $$('#walkinRecommendedCards .walkinTableCard, #walkinOtherCards .walkinTableCard').forEach(card => {
      if (seenCards.has(card)) return; seenCards.add(card);
      if (reduce || !card.offsetParent) return;
      card.style.setProperty('--rm-i', Math.min(i++, 8)); card.classList.add('rm-card-in');
      setTimeout(() => card.classList.remove('rm-card-in'), 900);
    });
    const head = $('#rmWalkinArrivalPreview .rmArrivalPreviewHead strong');
    if (head) { const on = /en direct/i.test(head.textContent); if (head.classList.contains('rm-live-eyebrow') !== on) head.classList.toggle('rm-live-eyebrow', on); }
    const btn = $('#walkinForm .walkinInstall');
    if (btn) { const ready = !!($('#walkinTable')?.value) && !btn.disabled; if (btn.classList.contains('rm-ready') !== ready) btn.classList.toggle('rm-ready', ready); }
  }

  let queued = false;
  function tick() {
    if (!$('#passages')?.offsetParent) return;
    slide('pax', '#walkinForm .walkinPaxButtons', 'button.selected');
    slide('deck', '#walkinForm .walkinDeckTabs', 'button.isActive');
    rows(); form();
  }
  new MutationObserver(() => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; tick(); });
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled'] });
  addEventListener('resize', () => { Object.values(sliders).forEach(s => { s.dataset.geo = ''; }); tick(); });
  setInterval(tick, 30000);
  tick();
  window.RestoUX.v7 = true;
})();
