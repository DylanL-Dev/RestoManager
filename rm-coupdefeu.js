/* =====================================================================
   RestoManager 2027 · Mode Coup de feu (« CF27 »)
   Lecture seule : lit le DOM du mode Express (#rmExpress) et ajoute une
   présentation. Aucune donnée écrite, aucune règle métier touchée.
   Les seules actions sont des raccourcis déclenchés par l'utilisateur
   (touche ou clic) vers les boutons existants de l'app.
   ===================================================================== */
(() => {
  if (window.RestoCF27) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const setData = (n, k, v) => { if (!n) return; if (v == null) { if (k in n.dataset) delete n.dataset[k]; } else if (n.dataset[k] !== v) n.dataset[k] = v; };
  const setCls = (n, c, on) => { if (n && n.classList.contains(c) !== on) n.classList.toggle(c, on); };
  const setText = (n, t) => { if (n && n.textContent !== t) n.textContent = t; };
  const visible = n => !!(n && !n.hidden && n.offsetParent);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const icon = name => { const i = el('span', 'cf-i'); i.style.setProperty('--m', `var(--cf-i-${name})`); i.setAttribute('aria-hidden', 'true'); return i; };
  const buzz = () => { try { navigator.vibrate?.(8); } catch {} };

  /* ---------- Heure de référence ---------- */
  const nowMin = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':'); return (+p[0]) * 60 + (+p[1]); };
  const toMin = s => { const m = /(\d{1,2})[:h](\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const isSim = ex => /simulation/i.test($('.rmExpressAccess p', ex)?.textContent || '');
  // En simulation : horloge fictive de l'app ; sinon : heure de Paris
  const refMin = ex => (isSim(ex) ? toMin($('.rmExpressActions', ex)?.textContent) : null) ?? nowMin();
  const wrap = d => (d < -720 ? d + 1440 : d > 720 ? d - 1440 : d);
  const fmtEta = d => d < -5 ? `+${-d} min` : d <= 0 ? 'Là' : d < 60 ? `${d} min` : `${Math.floor(d / 60)} h ${String(d % 60).padStart(2, '0')}`;

  /* ---------- Découpe de texte sans changer textContent ----------
     « Ch. 348 · Groupe 2-18 » devient <span.cf-room>Ch. 348</span><span.cf-sep> · </span><span.cf-name>…
     Le texte du bouton reste identique (lecteurs d'écran, tests). */
  function split(node, a, b) {
    if (!node || node.dataset.cfSplit === node.textContent) return;
    if (node.childNodes.length !== 1 || node.firstChild.nodeType !== 3) return;
    const t = node.textContent, i = t.indexOf(' · ');
    if (i < 0) return;
    const p1 = el('span', a, t.slice(0, i)), sep = el('span', 'cf-sep', ' · '), p2 = el('span', b, t.slice(i + 3));
    node.replaceChildren(p1, sep, p2);
    node.dataset.cfSplit = node.textContent;
  }
  function splitCovers(span) {
    const cov = span && $('.cf-cov', span);
    if (!cov || cov.dataset.cfSplit === cov.textContent) return;
    const m = /^(\d+)(\s.*)$/.exec(cov.textContent);
    if (!m) return;
    cov.replaceChildren(document.createTextNode(m[1]), el('span', 'cf-cov-unit', m[2]));
    cov.dataset.cfSplit = cov.textContent;
  }

  /* ---------- File d'arrivées ---------- */
  const GROUPS = { late: 'En retard', now: 'Maintenant', soon: 'Dans 15 min', later: 'Plus tard' };
  function arrivals(ex, ref) {
    const items = $$('.rmExpressArrival', ex).map(b => {
      const strong = $('strong', b), meta = $(':scope > span', b);
      split(strong, 'cf-room', 'cf-name');
      split(meta, 'cf-time', 'cf-cov'); splitCovers(meta);
      $$(':scope > *', b).forEach(c => setCls(c, 'rm-allergy', /^allergie/i.test(c.textContent.trim())));
      const t = toMin(meta?.textContent);
      const d = t == null ? null : wrap(t - ref);
      const g = d == null ? null : d < -5 ? 'late' : d <= 5 ? 'now' : d <= 15 ? 'soon' : 'later';
      setData(b, 'rmTone', d == null ? null : d < -5 ? 'late' : d <= 0 ? 'now' : d <= 10 ? 'soon' : 'info');
      setData($('.cf-time', b), 'eta', d == null ? null : fmtEta(d));
      return { b, d, g, cov: parseInt($('.cf-cov', b)?.textContent || '0', 10) || 0 };
    });
    const count = {}; items.forEach(x => { if (x.g) count[x.g] = (count[x.g] || 0) + 1; });
    let prev = null, next = null, best = Infinity;
    items.forEach(x => {
      const first = x.g && x.g !== prev;
      setData(x.b, 'rmGroup', first ? `${GROUPS[x.g]} · ${count[x.g]}` : null);
      setData(x.b, 'rmGkey', first ? x.g : null);
      if (x.g) prev = x.g;
      if (x.d != null && x.d >= -5 && x.d < best) { best = x.d; next = x.b; }
    });
    items.forEach(x => setCls(x.b, 'rm-next', x.b === next));
    return items;
  }

  /* ---------- Pouls du service ---------- */
  let pulse = null;
  function buildPulse(ex) {
    if (pulse && pulse.isConnected) return pulse;
    pulse = el('section', 'cf-pulse'); pulse.setAttribute('aria-label', 'Affluence du service');
    const ring = el('div', 'cf-ring');
    ring.innerHTML = '<svg viewBox="0 0 54 54" aria-hidden="true"><circle class="cf-ring-bg" cx="27" cy="27" r="22"/><circle class="cf-ring-fg" cx="27" cy="27" r="22"/></svg><b></b>';
    const txt = el('div', 'cf-load-txt'); txt.append(el('b'), el('span'));
    const load = el('div', 'cf-load'); load.append(ring, txt);
    const flow = el('div', 'cf-flow'); flow.setAttribute('aria-label', 'Couverts des arrivées affichées par tranche de 10 minutes');
    ['En retard', '0–10 min', '10–20 min', '20–30 min'].forEach(l => { const s = el('div', 'cf-slot'); const bar = el('div', 'cf-bar'); bar.append(el('i'), el('b')); s.append(bar, el('span', null, l)); flow.append(s); });
    const flags = el('div', 'cf-flags');
    pulse.append(load, flow, flags);
    ($('.rmExpressRoomTabs', ex) || $('.rmExpressColumns', ex)).before(pulse);
    return pulse;
  }
  function flag(box, key, tone, ico, text) {
    let f = $(`[data-k="${key}"]`, box);
    if (!text) { f?.remove(); return; }
    if (!f) { f = el('span', 'cf-flag'); f.dataset.k = key; f.dataset.tone = tone; f.append(icon(ico), el('span')); box.append(f); }
    setText(f.lastChild, text);
  }
  function updatePulse(ex, items) {
    const p = buildPulse(ex);
    const chargeTxt = $('[data-charge-metric]', ex)?.textContent || $$('.rmExpressMetrics > span', ex).map(s => s.textContent).find(t => /charge/i.test(t)) || '';
    const m = /(\d+)\s*\/\s*(\d+)/.exec(chargeTxt);
    const cur = m ? +m[1] : 0, cap = m ? Math.max(1, +m[2]) : 1, r = Math.min(1, cur / cap);
    const level = m && cur >= cap ? 'over' : r >= .8 ? 'high' : 'ok';
    setData(p, 'level', level);
    const v = r.toFixed(3); if (p.style.getPropertyValue('--cf-load') !== v) p.style.setProperty('--cf-load', v);
    setText($('.cf-ring b', p), m ? `${Math.round((cur / cap) * 100)}%` : '–');
    setText($('.cf-load-txt b', p), m ? `${cur} / ${cap} couverts` : 'Charge');
    setText($('.cf-load-txt span', p), level === 'over' ? 'Seuil dépassé' : level === 'high' ? 'Proche du seuil' : 'Charge du service');
    // Quarts d'heure à venir, à partir des arrivées affichées
    // Une recherche ne représente pas le service entier : ne conserver aucun compteur d'un autre contexte.
    const searching = !!($('.rmExpressSearch input', ex)?.value || '').trim();
    const buckets = [0, 0, 0, 0];
    if (!searching) {
      items.forEach(x => { if (x.d == null) return; const k = x.d < -5 ? 0 : x.d <= 10 ? 1 : x.d <= 20 ? 2 : x.d <= 30 ? 3 : -1; if (k >= 0) buckets[k] += x.cov; });
    }
    const max = Math.max(1, ...buckets), peak = buckets.indexOf(Math.max(...buckets));
    $$('.cf-slot', p).forEach((s, i) => {
      const h = (buckets[i] / max).toFixed(3); const bar = $('.cf-bar', s);
      if (bar.style.getPropertyValue('--h') !== h) bar.style.setProperty('--h', h);
      setText($('b', bar), searching ? '—' : String(buckets[i]));
      setData(s, 'peak', buckets[i] > 0 && i === peak ? '' : null);
      setData(s, 'late', i === 0 && buckets[0] > 0 ? '' : null);
    });
    const verif = /(\d+)\s*à vérifier/i.exec($$('.rmExpressMetrics > span', ex).map(s => s.textContent).join(' '));
    const flags = $('.cf-flags', p);
    flag(flags, 'verif', 'warn', 'alert', verif && +verif[1] > 0 ? `${verif[1]} à vérifier` : '');
    const alert = $('.rmExpressAlert', ex);
    flag(flags, 'alert', 'danger', 'alert', alert && !alert.hidden && alert.textContent.trim() ? alert.textContent.trim().split('. ')[0] : '');
  }

  /* ---------- Salles : état non confirmé, compteurs fournis par le moteur ---------- */
  let slider = null;
  function rooms(ex) {
    const box = $('.rmExpressRoomTabs', ex); if (!box) return;
    $$(':scope > button', box).forEach(b => {
      // Ne pas extrapoler depuis le plan filtré ni conserver les données d'une autre salle.
      setData(b, 'cfFree', b.dataset.expressFree || null);
      setData(b, 'cfTone', b.dataset.expressFree ? 'neutral' : null);
    });
    if (!slider || !slider.isConnected || slider.parentElement !== box) {
      slider = el('span', 'rm-room-slider'); slider.setAttribute('aria-hidden', 'true'); box.prepend(slider); slider.dataset.first = '1';
    }
    const a = $('button[aria-pressed="true"]', box);
    if (!a || !a.offsetWidth) return;
    const geo = `${a.offsetLeft}|${a.offsetTop}|${a.offsetWidth}|${a.offsetHeight}`;
    if (slider.dataset.geo === geo) return;
    slider.dataset.geo = geo;
    if (slider.dataset.first) slider.style.transition = 'none';
    slider.style.width = a.offsetWidth + 'px'; slider.style.height = a.offsetHeight + 'px';
    slider.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`;
    if (slider.dataset.first) { void slider.offsetWidth; slider.style.transition = ''; delete slider.dataset.first; }
  }

  /* ---------- Fiche du client et tables proposées ---------- */
  function state(ex) {
    const passage = visible($('[data-passage]', ex));
    const title = ($('[data-booking] h2', ex)?.textContent || '').trim();
    const selected = passage || (!!title && !/^placement$/i.test(title));
    const install = passage ? !!$$('[data-passage] .rmExpressTile[aria-pressed="true"]', ex).length : visible($('[data-install]', ex));
    return { passage, selected, step: !selected ? 'find' : !install ? 'table' : 'install', title };
  }
  let lastTitle = null, hint = null, handle = null;
  function ticket(ex, st) {
    setData(ex, 'rmStep', st.step);
    const panel = $('[data-reservation]', ex); if (!panel) return;
    setCls(panel, 'cf-empty', st.step === 'find' && !st.passage);
    const booking = $('[data-booking]', panel);
    if (booking && st.step !== 'find') { split($('h2', booking), 'cf-room', 'cf-name'); const p = $(':scope > p', booking); split(p, 'cf-time', 'cf-cov'); }
    if (!hint || !hint.isConnected) {
      hint = el('div', 'cf-hint'); hint.setAttribute('aria-hidden', 'true');
      const a = el('span'); a.append(icon('pointer'), document.createTextNode('Touchez une arrivée'));
      const b = el('span'); const k = el('kbd', null, '/'); b.append(k, document.createTextNode(' n° de chambre ou nom'));
      const c = el('span'); const k2 = el('kbd', null, '1'); const k3 = el('kbd', null, '2'); c.append(k2, k3, document.createTextNode(' choisir une table'));
      hint.append(a, b, c); booking?.after(hint);
    }
    if (!handle || !handle.isConnected) {
      handle = el('button', 'cf-handle'); handle.type = 'button'; handle.setAttribute('aria-label', 'Réduire ou agrandir la fiche');
      handle.addEventListener('click', () => { if ('cfMin' in ex.dataset) delete ex.dataset.cfMin; else ex.dataset.cfMin = ''; });
      panel.prepend(handle);
    }
    if (st.title !== lastTitle) {
      if ('cfMin' in ex.dataset) delete ex.dataset.cfMin;
      if (lastTitle !== null && st.step !== 'find' && !reduce) {
        $$('[data-booking] > *, .rmExpressOptions > *', panel).forEach((n, i) => { n.style.setProperty('--i', i); n.classList.remove('cf-in'); void n.offsetWidth; n.classList.add('cf-in'); });
      }
      lastTitle = st.title;
    }
  }
  function options(ex) {
    const box = $('.rmExpressOptions', ex); if (!box) return;
    const tiles = $$(':scope > .rmExpressTile', box);
    let planned = null, swap = null;
    tiles.forEach((t, i) => {
      const txt = t.textContent;
      const kind = /prévue pour ce client|fusion prévue/i.test(txt) ? 'planned' :
        /échange avec/i.test(txt) ? 'swap' : /déplacements à vérifier/i.test(txt) ? 'chain' : 'check';
      setData(t, 'cfKind', kind);
      setData(t, 'cfLabel', {planned:'Prévue',swap:'Permutation',chain:'Réorganisation',check:'À vérifier'}[kind]);
      if (i < 2 && !$('kbd', t)) { const k = el('kbd', null, String(i + 1)); k.setAttribute('aria-hidden', 'true'); t.append(k); }
      if (kind === 'planned') planned = t; if (kind === 'swap') swap = t;
    });
    // Permutation : « Ch. 348 prend T19 · Ch. 349 prend T18 »
    let sw = $('.cf-swap', box.parentElement);
    const who = ($('[data-booking] .cf-room', ex)?.textContent || '').trim();
    const swapLine = swap && $$('small', swap).find(s => /échange avec/i.test(s.textContent));
    const otherName = swapLine ? swapLine.textContent.replace(/^.*échange avec\s*/i, '').trim() : '';
    if (!swap || !planned || !otherName) { if (sw) sw.hidden = true; return; }
    const tSwap = ($('strong', swap)?.textContent || '').trim(), tPlan = ($('strong', planned)?.textContent || '').trim();
    if (!sw) {
      sw = el('div', 'cf-swap'); sw.setAttribute('role', 'note');
      box.after(sw);
      swap.addEventListener('pointerenter', () => sw.classList.add('cf-hot'));
      swap.addEventListener('pointerleave', () => sw.classList.remove('cf-hot'));
    }
    const sig = `${who}|${tSwap}|${otherName}|${tPlan}`;
    if (sw.dataset.sig !== sig) {
      sw.dataset.sig = sig; sw.replaceChildren();
      const row = (a, t) => { sw.append(el('span', 'cf-swap-who', a), el('span', 'cf-swap-line'), el('span', 'cf-swap-table', t)); };
      row(who || 'Ce client', tSwap); row(otherName, tPlan);
      sw.append(el('span', 'cf-swap-note', `Si vous choisissez ${tSwap}, ${otherName} sera placé à ${tPlan}.`));
    }
    sw.hidden = false;
  }

  /* ---------- Passage spontané : choix rapide du nombre de couverts ---------- */
  function passage(ex) {
    const form = $('[data-passage] .rmExpressFields', ex); if (!form) return;
    const input = $('[data-guests]', form); if (!input) return;
    let pax = $('.cf-pax', form);
    if (!pax) {
      pax = el('div', 'cf-pax'); pax.setAttribute('role', 'group'); pax.setAttribute('aria-label', 'Nombre de couverts');
      for (let n = 1; n <= 8; n++) {
        const b = el('button', null, String(n)); b.type = 'button'; b.dataset.n = String(n); b.setAttribute('aria-label', `${n} couvert${n > 1 ? 's' : ''}`);
        b.addEventListener('click', () => { // geste de l'utilisateur : on remplit le champ de l'app comme il l'aurait fait
          input.value = String(n); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); buzz();
        });
        pax.append(b);
      }
      form.prepend(pax);
    }
    $$('button', pax).forEach(b => { const on = b.dataset.n === String(input.value); if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on)); });
  }

  /* Type de client en un toucher : boutons Extérieur / Hôtel à la place de la liste déroulante */
  function guestType(ex) {
    const sel = $('[data-passage] [data-guest-type]', ex); if (!sel) return;
    const lab = sel.closest('label'); if (!lab) return;
    let seg = $('.cf-seg', lab);
    if (!seg) {
      seg = el('div', 'cf-seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'Type de client');
      [...sel.options].forEach(o => {
        const b = el('button', null, o.textContent.trim()); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = o.value;
        b.addEventListener('click', () => { // geste de l'utilisateur : même effet que choisir dans la liste
          if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
          buzz(); requestAnimationFrame(tick);
        });
        seg.append(b);
      });
      lab.append(seg); lab.classList.add('cf-has-seg');
    }
    $$('button', seg).forEach(b => { const on = String(b.dataset.v === sel.value); if (b.getAttribute('aria-checked') !== on) b.setAttribute('aria-checked', on); });
  }

  /* ---------- Plan des tables ---------- */
  let wasOpen = false;
  function floor(ex) {
    const d = $('details[data-floor]', ex); if (!d) return;
    const tiles = $$('.rmExpressTile[data-state]', d);
    const unknown = tiles.filter(t => t.dataset.state === 'unknown').length;
    const dep = tiles.filter(t => t.dataset.state === 'departure').length;
    const sum = $('summary', d);
    if (sum) {
      setData(sum, 'rmSum', `${unknown} à contrôler sur ${tiles.length}${dep ? ` · ${dep} départ${dep > 1 ? 's' : ''} à vérifier` : ''}`);
      setData(sum, 'rmDep', dep ? '' : null);
    }
    if (!$('.cf-legend', d)) {
      const lg = el('div', 'cf-legend'); lg.setAttribute('aria-hidden', 'true');
      [['État non confirmé', 'var(--cf-muted)'], ['Prévue', 'var(--cf-info)'], ['Installée', 'var(--cf-muted)'], ['Départ à vérifier', 'var(--cf-warm)']].forEach(([l, c]) => { const s = el('span'); const i = el('i'); i.style.setProperty('--c', c); s.append(i, document.createTextNode(l)); lg.append(s); });
      sum?.after(lg);
    }
    if (!wasOpen) d.open = matchMedia('(min-width: 1440px)').matches; // grand écran : plan visible en 3e colonne ; sinon replié à l'ouverture
  }

  /* ---------- Tables bientôt attendues ---------- */
  function soon(ex, ref) {
    $$('.rmExpressTile', ex).forEach(t => {
      // Un état inconnu reste à contrôler, jamais une disponibilité physique confirmée.
      const note = $$('small', t).find(s => /^aucun client enregistré$/i.test(s.textContent.trim()));
      if (note) setCls(note, 'cf-free-note', true);
      setData(t, 'cfFree', note ? '' : null);
      const m = /prévue\s*·\s*(\d{1,2}:\d{2})/i.exec(t.textContent);
      const d = m ? wrap(toMin(m[1]) - ref) : null;
      setData(t, 'rmSoon', d != null && d >= -5 && d <= 10 ? '' : null);
    });
  }

  /* ---------- Retour d'action ---------- */
  let lastFb = '', fbTimer = 0;
  function feedback(ex) {
    const fb = $('.rmExpressFeedback', ex); if (!fb) return;
    const t = fb.textContent.trim();
    if (t && t !== lastFb) { fb.classList.remove('cf-show'); void fb.offsetWidth; fb.classList.add('cf-show'); clearTimeout(fbTimer); fbTimer = setTimeout(() => fb.classList.remove('cf-show'), 4200); buzz(); }
    if (!t) setCls(fb, 'cf-show', false);   // ne jamais écrire sans changement (sinon boucle avec l'observateur)
    lastFb = t;
  }

  /* ---------- Clavier : / recherche · ↑↓ arrivées · 1/2 table · Échap ---------- */
  addEventListener('keydown', e => {
    const ex = $('#rmExpress'); if (!ex || !ex.offsetParent || e.ctrlKey || e.metaKey || e.altKey) return;
    const tgt = e.target, typing = tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName));
    if (e.key === '/' && !typing) { const s = $('.rmExpressSearch input', ex); if (s) { e.preventDefault(); e.stopPropagation(); s.focus(); s.select(); } return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (tgt?.classList?.contains('rmExpressArrival') || tgt === $('.rmExpressSearch input', ex))) {
      const list = $$('.rmExpressArrival', ex); if (!list.length) return;
      const i = list.indexOf(tgt); const n = i < 0 ? list[0] : list[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (n) { e.preventDefault(); n.focus(); n.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    if (e.key === 'Enter' && tgt === $('.rmExpressSearch input', ex) && !e.isComposing) {
      const first = $('.rmExpressArrival', ex);
      if (first) { e.preventDefault(); first.click(); requestAnimationFrame(() => { const t = $('.rmExpressOptions > .rmExpressTile', ex); (t && visible(t) ? t : first).focus({ preventScroll: true }); }); }
      return;
    }
    if ((e.key === '1' || e.key === '2') && !typing) {
      const t = $$('.rmExpressOptions > .rmExpressTile', ex)[+e.key - 1];
      if (t && visible(t)) { e.preventDefault(); t.click(); } // raccourci : même effet qu'un clic de l'utilisateur
    }
  }, true);
  // Une table choisie (clic, toucher ou touche 1/2) : le curseur passe sur « Installer », Entrée valide
  // (écoute en phase de capture : l'app arrête la propagation du clic ; on attend la fin de son redessin,
  //  car elle replace elle-même le focus sur la table choisie)
  document.addEventListener('click', e => {
    if (!e.target.closest?.('#rmExpress .rmExpressOptions .rmExpressTile, #rmExpress [data-all-tables] .rmExpressTile')) return;
    let n = 0;
    const go = () => { const b = $('#rmExpress [data-install]:not([hidden]) .rmExpressPrimary'); if (b && visible(b)) { b.focus({ preventScroll: true }); b.scrollIntoView({ block: 'nearest' }); } if (++n < 3) setTimeout(go, 120); };
    setTimeout(go, 120);
  }, true);
  document.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && e.target.closest?.('#rmExpress .rmExpressArrival, #rmExpress button.rmExpressTile')) buzz(); }, { passive: true });

  /* ---------- Boucle ---------- */
  let queued = false;
  function tick() {
    const ex = $('#rmExpress');
    if (!ex || !ex.offsetParent) { wasOpen = false; lastTitle = null; return; }
    if (!('cf27' in ex.dataset)) ex.dataset.cf27 = '';
    setData(ex, 'rmSim', isSim(ex) ? '' : null);
    setData(ex, 'cfSync', /^À jour/.test($('[data-sync]', ex)?.textContent || '') ? 'ok' : 'pending');
    const ref = refMin(ex);
    const items = arrivals(ex, ref);
    updatePulse(ex, items);
    rooms(ex);
    const st = state(ex);
    ticket(ex, st); options(ex); passage(ex); guestType(ex); floor(ex); soon(ex, ref); feedback(ex);
    wasOpen = true;
  }
  new MutationObserver(() => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; tick(); });
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'hidden', 'data-state', 'value'] });
  addEventListener('resize', () => { if (slider) slider.dataset.geo = ''; tick(); });
  document.addEventListener('input', e => { if (e.target?.matches?.('#rmExpress [data-guests]')) requestAnimationFrame(tick); });
  document.addEventListener('change', e => { if (e.target?.matches?.('#rmExpress [data-guest-type]')) requestAnimationFrame(tick); });
  setInterval(tick, 15000);
  tick();
  window.RestoCF27 = { version: "2027.4", refresh: tick };
})();

/* CF27 · Départs & présences à vérifier — lecture seule, aucune écriture */
(() => {
  if (window.RestoCF27Departs?.version === '2027.4') return;
  window.RestoCF27Departs?.destroy?.();
  const ac = new AbortController(), sig = { signal: ac.signal };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const hm = d => Number.isFinite(d.getTime()) ? d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }) : '—';
  const root = () => $('#rmExpress');

  /* Le contexte doit être celui de l'établissement courant, jamais la première clé locale trouvée. */
  const simMode = ex => /^Simulation\s*·\s*données fictives/i.test($('[data-access]', ex)?.textContent || '');
  function contextKey() {
    const ex = root(), c = window.RestoNotificationContext;
    if (!ex || ex.hidden || c?.role !== 'fb_admin' || !c.userId || !c.restaurantId || window.RestoReception) return null;
    return JSON.stringify([c.userId, c.restaurantId, simMode(ex)]);
  }
  function source() {
    const ex = root(), scope = contextKey();
    if (!scope) return null;
    const c = window.RestoNotificationContext, sim = simMode(ex);
    if (sim) {
      try {
        const key = 'restomanager-express-fiction-v1:' + c.restaurantId;
        const saved = JSON.parse(localStorage.getItem(key));
        const now = new Date(saved?.clock);
        if (!Array.isArray(saved?.reservations) || !Number.isFinite(now.getTime())) return null;
        return { rows: saved.reservations, now, sim: true, scope };
      } catch { return null; }
    }
    const rows = window.RestoSharedReservations;
    return window.RestoSharedDataLoaded === true && window.RestoExpressSnapshotRestaurantId === c.restaurantId && Array.isArray(rows)
      ? { rows, now: new Date(), sim: false, scope } : null;
  }
  const parisParts = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function wall(d) {
    const p = Object.fromEntries(parisParts.formatToParts(d).map(({type,value}) => [type,value]));
    return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
  }
  // Convertir le jour et l'heure locale du service en instant Paris sans dépendre du fuseau de l'appareil.
  function at(date,time) {
    const target = Date.parse(date+'T'+time+':00Z');
    if (!Number.isFinite(target)) return new Date(NaN);
    let stamp = target;
    for (let i=0;i<3;i++) stamp += target-wall(new Date(stamp));
    return new Date(wall(new Date(stamp))===target ? stamp : NaN);
  }
  const tablesTxt = r => (r.tables || []).map(n => 'T' + n).join(' + ');
  const who = r => [r.client || (r.walkIn ? 'Passage' : 'Client'), r.hotelRoom ? 'Ch. ' + r.hotelRoom : '', r.guests ? r.guests + ' couv.' : '']
    .filter(Boolean).join(' · ');

  function info(num, kind) {
    const src = source(); if (!src) return null;
    const on = src.rows.filter(r => (r.tables || []).map(Number).includes(num));
    if (kind === 'departure') {
      const r = on.find(r => r.status === 'seated'); if (!r) return null;
      const start = r.seatedAt ? new Date(r.seatedAt) : at(r.date, r.time);
      const end = new Date(start.getTime() + (r.duration || 90) * 60000);
      return Number.isFinite(start.getTime()) ? { r, start, end, now: src.now, over: Math.round((src.now - end) / 60000), sim: src.sim, scope: src.scope } : null;
    }
    const today = new Date(wall(src.now)).toISOString().slice(0,10);
    const r = on.filter(r => {
      if (!['reserved','confirmed','late','arrived'].includes(r.status) || r.date !== today) return false;
      const elapsed = (wall(src.now) - Date.parse(r.date+'T'+r.time+':00Z')) / 60000;
      return elapsed >= 20 && elapsed < Number(r.duration || 90);
    }).sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0];
    if (!r) return null;
    const start = at(r.date, r.time);
    return Number.isFinite(start.getTime()) ? { r, start, now: src.now, over: Math.round((src.now - start) / 60000), sim: src.sim, scope: src.scope } : null;
  }

  /* Panneau */
  let pop, lastTile, popScope;
  function close() {
    if (!pop) return;
    pop.classList.remove('cf-show');
    const p = pop; pop = null; popScope = null;
    setTimeout(() => p.remove(), 180);
    lastTile?.focus({ preventScroll: true });
  }
  function open(tile) {
    close();
    lastTile = tile;
    popScope = contextKey(); if (!popScope) return;
    const kind = tile.dataset.state;
    const num = Number((tile.querySelector('strong')?.textContent || '').replace(/\D/g, ''));
    const d = info(num, kind);
    const dep = kind === 'departure';
    pop = document.createElement('div');
    pop.className = 'cf-dep';
    pop.dataset.kind = kind;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', `T${num} · ${dep ? 'Départ' : 'Présence'} à vérifier`);
    const h = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

    const head = h('div', 'cf-dep-head');
    head.append(h('span', 'cf-dep-ico'), h('strong', '', d ? tablesTxt(d.r) : 'T' + num),
      h('span', 'cf-dep-tag', dep ? 'Départ à vérifier' : 'Présence à vérifier'));
    const x = h('button', 'cf-dep-x'); x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); x.onclick = close;
    head.append(x);
    pop.append(head);

    if (d) {
      pop.append(h('p', 'cf-dep-who', who(d.r)));
      if (dep) {
        const total = d.end - d.start, el = d.now - d.start;
        const bar = h('div', 'cf-dep-bar');
        const fill = h('i'); fill.style.setProperty('--p', Math.min(1, total / Math.max(el, 1)));
        bar.append(fill);
        bar.setAttribute('aria-hidden', 'true');
        const ticks = h('div', 'cf-dep-ticks');
        ticks.append(h('span', '', 'Installé ' + hm(d.start)), h('span', '', 'Fin prévue ' + hm(d.end)), h('b', '', d.over > 0 ? `+${d.over} min` : 'à l’heure'));
        pop.append(bar, ticks);
        pop.append(h('p', 'cf-dep-hint', 'Va voir en salle. Si la table est partie, libère-la pour qu’elle revienne dans les propositions.'));
      } else {
        const ticks = h('div', 'cf-dep-ticks');
        ticks.append(h('span', '', 'Prévu ' + hm(d.start)), h('span', '', 'Pas encore installé'), h('b', '', d.over > 0 ? `+${d.over} min` : ''));
        pop.append(ticks);
        pop.append(h('p', 'cf-dep-hint', 'Client attendu sur cette table. S’il est là, cherche-le et installe-le ; sinon traite l’absence en mode complet.'));
      }
    } else {
      pop.append(h('p', 'cf-dep-hint', dep ? 'Temps de repas dépassé. Va voir en salle, puis libère la table en mode complet.' : 'Client attendu en retard sur cette table.'));
    }

    const acts = h('div', 'cf-dep-acts');
    if (!dep && d) {
      const find = h('button', 'cf-dep-btn', 'Chercher le client'); find.type = 'button';
      find.onclick = () => {
        const s = $('#rmExpress input[type="search"], #rmExpress [data-search] input, #rmExpress input');
        if (s) { s.value = d.r.hotelRoom || d.r.client || ''; s.dispatchEvent(new Event('input', { bubbles: true })); close(); s.focus(); }
      };
      acts.append(find);
    }
    const hook = window.RestoExpressRelease;
    const canRelease = dep && d && typeof hook?.release === 'function';
    let full;
    if (canRelease) {
      full = h('button', 'cf-dep-btn cf-dep-main cf-dep-free', `Libérer ${tablesTxt(d.r)}`); full.type = 'button';
      full.onclick = () => release(d, tile);
      acts.append(full);
    } else {
      full = h('button', 'cf-dep-btn cf-dep-main', dep ? 'Libérer en mode complet' : 'Ouvrir le mode complet'); full.type = 'button';
      full.onclick = () => { close(); $('#rmExpress [data-action="close"]')?.click(); };
      acts.append(full);
    }
    pop.append(acts);
    if (d?.sim) pop.append(h('p', 'cf-dep-sim', 'Simulation · aucune donnée réelle'));

    document.body.append(pop);
    place(tile);
    requestAnimationFrame(() => pop?.classList.add('cf-show'));
    full.focus({ preventScroll: true });
  }
  /* La présentation n'annonce une réussite qu'après confirmation explicite de l'application. */
  let toast, toastT, toastScope;
  function clearToast() {
    clearTimeout(toastT); toast?.remove(); toast = null; toastScope = null;
  }
  async function release(d, tile) {
    const hook = window.RestoExpressRelease, scope = contextKey();
    const tables = (d.r.tables || []).map(Number);
    close();
    if (!scope || scope !== d.scope || typeof hook?.release !== 'function') {
      if (scope) say('Le contexte du service a changé. Vérifiez le plan.', null, 'err', scope);
      return;
    }
    try {
      const result = await hook.release({ reservationId: d.r.id, tables });
      if (contextKey() !== scope) return;
      if (result?.ok !== true) return say(result?.message || 'Libération non confirmée. Vérifiez le plan.', null, 'err', scope);
      say(tablesTxt(d.r)+' libérée', typeof hook.undo === 'function' ? () => hook.undo({ reservationId: d.r.id, tables }) : null, null, scope);
    } catch (error) {
      if (contextKey() === scope) say(error?.message || 'Libération impossible. Vérifiez le plan.', null, 'err', scope);
    }
  }
  function say(msg, undo, tone, scope = contextKey()) {
    if (!scope || contextKey() !== scope) return;
    clearToast();
    toastScope = scope;
    toast = document.createElement('div');
    toast.className = 'cf-rel'; if (tone) toast.dataset.tone = tone;
    toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
    const t = document.createElement('span'); t.textContent = msg; toast.append(t);
    const tt = toast;
    if (undo) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Annuler';
      b.onclick = async () => {
        if (contextKey() !== scope || toast !== tt) return;
        b.disabled = true; clearTimeout(toastT);
        t.textContent = 'Annulation en cours…';
        try {
          const result = await undo();
          if (contextKey() !== scope || toast !== tt) return;
          if (result?.ok !== true) return say(result?.message || 'Annulation non confirmée. Vérifiez le plan.', null, 'err', scope);
          say('Libération annulée.', null, null, scope);
        } catch (error) {
          if (contextKey() === scope && toast === tt) say(error?.message || 'Annulation impossible.', null, 'err', scope);
        }
      };
      toast.append(b, document.createElement('i'));
    }
    document.body.append(toast);
    requestAnimationFrame(() => { if (toast === tt) tt.classList.add('cf-show'); });
    toastT = setTimeout(() => { tt.classList.remove('cf-show'); setTimeout(() => tt.remove(), 200); if (toast === tt) { toast = null; toastScope = null; } }, 8000);
  }

  function place(tile) {
    if (!pop) return;
    if (matchMedia('(max-width:760px)').matches) { pop.classList.add('cf-sheet'); return; }
    const b = tile.getBoundingClientRect(), w = 320;
    const left = Math.min(Math.max(12, b.left + b.width / 2 - w / 2), innerWidth - w - 12);
    const below = b.bottom + 10 + 240 < innerHeight;
    pop.style.left = left + 'px';
    pop.style.top = (below ? b.bottom + 10 : Math.max(12, b.top - 10 - pop.offsetHeight)) + 'px';
    pop.dataset.side = below ? 'below' : 'above';
  }

  /* Tables à vérifier : rendues interactives (aucune action sans clic) */
  function arm() {
    const scope = contextKey();
    if (pop && popScope !== scope) close();
    if (toast && toastScope !== scope) clearToast();
    if (!scope) return;
    $$('#rmExpress .rmExpressRoom .rmExpressTile[data-state="departure"], #rmExpress .rmExpressRoom .rmExpressTile[data-state="check"]').forEach(t => {
      if (t.dataset.cfArm) return;
      t.dataset.cfArm = '1';
      t.tabIndex = 0;
      t.setAttribute('role', 'button');
      t.setAttribute('aria-haspopup', 'dialog');
    });
    const flag = $('#rmExpress .cf-flag[data-k="verif"]');
    if (flag && !flag.dataset.cfArm) {
      flag.dataset.cfArm = '1'; flag.tabIndex = 0; flag.setAttribute('role', 'button');
      flag.setAttribute('aria-label', flag.textContent.trim() + ' · voir les tables');
    }
  }
  function spotlight() {
    const tiles = $$('#rmExpress .rmExpressRoom .rmExpressTile[data-state="departure"], #rmExpress .rmExpressRoom .rmExpressTile[data-state="check"]');
    if (!tiles.length) return;
    const det = tiles[0].closest('details'); if (det && !det.open) det.open = true;
    const all = $$('#rmExpress [data-cf-free]').find(b => b.tagName === 'BUTTON' && /Toutes les salles/.test(b.textContent));
    if (all && all.getAttribute('aria-pressed') !== 'true') all.click();
    requestAnimationFrame(() => {
      const t = $$('#rmExpress .rmExpressRoom .rmExpressTile[data-state="departure"], #rmExpress .rmExpressRoom .rmExpressTile[data-state="check"]');
      t[0]?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      t.forEach((e, i) => { e.classList.remove('cf-attn'); void e.offsetWidth; e.style.setProperty('--i', i); e.classList.add('cf-attn'); setTimeout(() => e.classList.remove('cf-attn'), 3200); });
      setTimeout(() => t[0]?.focus({ preventScroll: true }), 450);
    });
  }

  document.addEventListener('click', e => {
    const t = e.target.closest?.('#rmExpress .rmExpressTile[data-cf-arm]');
    if (t) { e.preventDefault(); e.stopPropagation(); return (pop && lastTile === t) ? close() : open(t); }
    if (e.target.closest?.('#rmExpress .cf-flag[data-k="verif"]')) { e.stopPropagation(); return spotlight(); }
    if (pop && !e.target.closest('.cf-dep')) close();
  }, { capture: true, signal: ac.signal });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pop) { e.stopImmediatePropagation(); return close(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('#rmExpress .rmExpressTile[data-cf-arm], #rmExpress .cf-flag[data-cf-arm]')) {
      e.preventDefault(); e.stopImmediatePropagation(); e.target.click();
    }
  }, { capture: true, signal: ac.signal });
  addEventListener('resize', () => lastTile && pop && place(lastTile), sig);
  addEventListener('scroll', () => pop && !pop.classList.contains('cf-sheet') && close(), { passive: true, signal: ac.signal });

  let raf = 0;
  const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; arm(); }); });
  mo.observe(document.body, { childList: true, subtree: true });
  arm();
  window.RestoCF27Departs = { version: '2027.4', destroy: () => { ac.abort(); mo.disconnect(); close(); clearToast(); }, open: n => { const t = $$('#rmExpress .rmExpressTile[data-cf-arm]').find(t => t.querySelector('strong')?.textContent === 'T' + n); t && open(t); }, spotlight, close };
})();
