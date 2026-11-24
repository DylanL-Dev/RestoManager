'use strict';
(function () {
  const M = window.RMPublicModel;
  const slug = new URLSearchParams(location.search).get('restaurant');
  const config = M.venue(slug);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const icons = () => window.lucide.createIcons();
  const card = $('booking');
  $('privacy').addEventListener('click', () => showInfo('privacy'));
  $('conditions').addEventListener('click', () => showInfo('terms'));
  $('closeInfo').addEventListener('click', () => $('infoDialog').close());
  $('infoDialog').addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...$('infoDialog').querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled)')];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  $('acceptInfo').addEventListener('click', () => {
    const cancel = $('acceptInfo').dataset.confirmCancel === 'yes'; $('infoDialog').close();
    if (cancel) { try { record = adapter.cancel(record.token, record.revision); dirty = false; render(); announce('Exemple annulé. Aucune réservation réelle concernée.'); } catch (error) { fail(error); } }
  });
  if (!config) {
    $('restaurantName').textContent = 'Retrouvez votre restaurant';
    $('restaurantSubtitle').textContent = slug ? 'Vérifiez le lien de démonstration fourni.' : 'Découvrez deux exemples sans réservation réelle.';
    $('story').hidden = true; $('portalLayout').classList.add('compact-story');
    const choices = M.examples().map(example => '<a class="secondary" href="?restaurant=' + encodeURIComponent(example.slug) + '">' + esc(example.name) + ' · ' + esc(example.subtitle) + '</a>').join('');
    card.innerHTML = '<h2 tabindex="-1">' + (slug ? 'Ce lien de démonstration n’est pas disponible' : 'Choisissez votre établissement fictif') + '</h2><p class="form-note">Aucune demande réelle ne sera transmise. Les exemples ne contiennent ni réservations ni données de clients réels.</p><div class="choice-row" aria-label="Exemples fictifs">' + choices + '</div>';
    icons(); return;
  }
  $('homeLink').href = '?restaurant=' + encodeURIComponent(slug);
  // Hotel-specific identity only; independent restaurants keep the restaurant icon.
  if (config.type === 'hotel') {
    $('homeLink').querySelector('.brand-mark [data-lucide]')?.setAttribute('data-lucide', 'hotel');
    $('story').querySelector('.cover-label [data-lucide]')?.setAttribute('data-lucide', 'hotel');
  }
  $('restaurantName').textContent = config.name;
  $('restaurantSubtitle').textContent = config.subtitle;
  $('locality').textContent = config.locality;
  $('introduction').textContent = config.introduction;
  $('description').textContent = config.description;
  document.title = config.name + ' — Réserver · Démonstration';
  let storage; try { storage = window.sessionStorage; } catch { storage = null; }
  const adapter = window.RMPublicDemo.createAdapter({ slug, storage, crypto: window.crypto });
  let draft = M.initialVisit(config);
  const blankContact = () => ({ firstName: 'Camille', lastName: 'Exemple', email: '', phone: '', notes: '', accepted: false, guestType: config.type === 'hotel' ? '' : 'external', hotelRoom: '' });
  let contact = blankContact();
  let stage = 1, errors = {}, record = null, editing = false, notice = '', busy = false, dirty = false;
  function announce(message) { $('live').textContent = message; }
  function hotelChoice() {
    if (config.type !== 'hotel') return '';
    return '<fieldset class="guest-choice"><legend>Séjournez-vous à l’hôtel ?</legend><div class="choice-row">'
      + radio('guestType', 'hotel', icon('hotel') + ' Client de l’hôtel', contact.guestType === 'hotel')
      + radio('guestType', 'external', icon('users') + ' Client extérieur', contact.guestType === 'external')
      + '</div><p class="hint">Pour réserver une table, choisissez votre situation. Aucun accès aux données réelles de l’hôtel.</p></fieldset>';
  }
  function roomFields() {
    return config.type === 'hotel' && contact.guestType === 'hotel'
      ? '<div class="hotel-stay"><h3>Votre séjour fictif à l’hôtel</h3>' + field('hotelRoom', 'Numéro de chambre fictif *', 'text', 20) + '<p class="hint">Exemple : 204. N’indiquez pas votre véritable numéro de chambre.</p></div>'
      : '';
  }
  function hotelRecap() {
    return config.type === 'hotel'
      ? '<div class="summary-row"><dt>' + icon('hotel') + 'Votre accueil</dt><dd>' + esc(contact.guestType === 'hotel' ? 'Client de l’hôtel · Chambre ' + contact.hotelRoom : 'Client extérieur') + '</dd></div>'
      : '';
  }
  function steps() { return '<ol class="steps" aria-label="Étapes de la réservation">' + ['Votre venue', 'Coordonnées', 'Récapitulatif'].map((label, index) => `<li${stage === index + 1 ? ' aria-current="step"' : ''}${stage > index + 1 ? ' class="done"' : ''}>${label}</li>`).join('') + '</ol>'; }
  function heading(title, description, symbol = 'calendar-days') { return `<div class="booking-head"><div><h2 tabindex="-1">${title}</h2><p>${description}</p></div><span class="booking-symbol">${icon(symbol)}</span></div>`; }
  function summary(includeContact = false) {
    return `<dl class="summary"><div class="summary-row"><dt>${icon('calendar-days')}Votre venue</dt><dd>${esc(M.dateLabel(draft.date))}<br>${esc(config.services[draft.service]?.label)} · ${esc(draft.time)}</dd></div><div class="summary-row"><dt>${icon('users-round')}À table</dt><dd>${draft.party} personne${draft.party > 1 ? 's' : ''}</dd></div>${includeContact ? `<div><dt>Coordonnées fictives</dt><dd>${esc(contact.firstName)} ${esc(contact.lastName)}${contact.phone ? '<br>' + esc(contact.phone) : ''}</dd></div>${contact.notes ? `<div><dt>Votre demande particulière</dt><dd>${esc(contact.notes)}</dd></div>` : ''}` : ''}${includeContact ? hotelRecap() : ''}</dl>`;
  }
  function radio(name, value, label, checked, disabled = false, extra = '') {
    const id = name + '-' + value;
    return `<div class="choice"><input type="radio" name="${name}" id="${esc(id)}" value="${esc(value)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}><label for="${esc(id)}">${label}${extra}</label></div>`;
  }
  function selectedVenue(a){
    if(!a.slots.some(s=>s.available&&s.time===draft.time))return '';
    return '<div class="rmPortalSelection"><span class="rmPortalSelectionIcon">'+icon('calendar-clock')+'</span><div><strong>Votre venue sélectionnée</strong><p>'+esc(M.relativeDateLabel(draft.date))+' · '+esc(draft.time)+' · '+Number(draft.party)+' personne'+(draft.party>1?'s':'')+'</p><small>Exemple fictif, sans réservation réelle.</small></div></div>';
  }
  function venueForm() {
    const a = M.availability(config, draft);
    return `${heading(editing ? 'Modifier votre exemple' : 'Réservez votre table', 'Quelques instants pour préparer votre venue.')}${steps()}${hotelChoice()}
      <fieldset><legend>Combien de personnes ?</legend><div class="choice-row">${Array.from({ length: config.maxParty }, (_, i) => radio('party', i + 1, i + 1, draft.party === i + 1)).join('')}</div></fieldset>
      <div class="field"><label class="field-label" for="visitDate">Quel jour ?</label><input class="date-field" type="date" id="visitDate" value="${draft.date}" min="${M.paris().date}" max="${M.addDays(M.paris().date, config.horizonDays)}" aria-describedby="dateHint"><p class="hint" id="dateHint">${esc(M.relativeDateLabel(draft.date))}</p></div>
      <fieldset><legend>Quel service ?</legend><div class="choice-row service-row">${Object.entries(config.services).map(([key, s]) => radio('service', key, icon(key === 'lunch' ? 'sun' : 'moon') + esc(s.label), draft.service === key)).join('')}</div></fieldset>
      <fieldset><legend>À quelle heure ?</legend><p class="hint" id="slotsHint">${esc(a.message)}</p>${a.slots.length ? `<div class="choice-row slots" aria-describedby="slotsHint">${a.slots.map(s => radio('time', s.time, esc(s.time), draft.time === s.time, !s.available, s.available ? '' : '<small>Non proposé</small>')).join('')}</div>` : '<p class="empty">' + esc(a.message) + '</p>'}</fieldset>
      ${notice ? '<p class="error-box" role="alert">' + esc(notice) + '</p>' : ''}
      ${selectedVenue(a)}<button class="primary" type="button" data-action="coordinates"${draft.time && a.slots.some(s => s.available && s.time === draft.time) && (config.type !== 'hotel' || ['hotel', 'external'].includes(contact.guestType)) ? '' : ' disabled'}>Continuer ${icon('arrow-up-right')}</button>
      <p class="booking-foot">${icon('check-circle-2')}Sans compte · Exercice sans engagement</p>${editing ? '<button class="text-button" type="button" data-action="abandonEdit">Conserver mon exemple actuel</button>' : ''}`;
  }
  function field(name, label, type = 'text', max = 80) {
    return `<div class="field"><label class="field-label" for="${name}">${label}</label><input type="${type}" id="${name}" name="${name}" maxlength="${max}" value="${esc(contact[name])}"${['phone'].includes(name) ? '' : ' required'} autocomplete="off"${errors[name] ? ' aria-invalid="true" aria-describedby="error-' + name + '"' : ''}>${errors[name] ? `<p class="error" id="error-${name}">${esc(errors[name])}</p>` : ''}</div>`;
  }
  function coordinatesForm() {
    return `<button class="text-button back" type="button" data-action="back">${icon('arrow-left')}Votre venue</button>${heading('Vos coordonnées', 'Uniquement des exemples fictifs pour cet essai.', 'circle-user-round')}${steps()}<p class="form-note">Les champs sont préremplis avec un exemple. N’inscrivez aucune donnée personnelle réelle.</p>
      <form id="contactForm" novalidate><div class="field-grid">${field('firstName', 'Prénom fictif')}${field('lastName', 'Nom fictif')}</div>${field('phone', 'Téléphone (facultatif)', 'tel', 30)}${roomFields()}<div class="field"><label class="field-label" for="notes">Une demande particulière ? <span class="optional">Facultatif</span></label><textarea id="notes" name="notes" maxlength="500" placeholder="Ex. : un espace pour une poussette" aria-describedby="notesHint">${esc(contact.notes)}</textarea><p class="hint" id="notesHint">500 caractères maximum. Une demande n’est pas une garantie.</p></div>
      <label class="check"><input id="accepted" type="checkbox" name="accepted"${contact.accepted ? ' checked' : ''}${errors.accepted ? ' aria-invalid="true" aria-describedby="error-accepted"' : ''}><span>J’accepte les conditions de l’exemple et j’ai lu les informations de confidentialité ci-dessous.</span></label>${errors.accepted ? '<p class="error" id="error-accepted">' + errors.accepted + '</p>' : ''}<div class="label-line"><button type="button" class="text-button" data-action="terms">Conditions</button><button type="button" class="text-button" data-action="privacy">Confidentialité</button></div><button type="submit" class="primary">Vérifier mon exemple ${icon('arrow-up-right')}</button></form>`;
  }
  function reviewForm() {
    return `<button class="text-button back" type="button" data-action="back">${icon('arrow-left')}Coordonnées</button>${heading('Tout est prêt ?', 'Vérifiez votre choix avant de terminer l’exercice.', 'clipboard-check')}${steps()}${summary(true)}<p class="form-note">Ceci est une simulation. Aucune table ne sera réservée et aucun email ne sera envoyé.</p>${notice ? '<p class="error-box" role="alert">' + esc(notice) + '</p>' : ''}<button class="primary" type="button" data-action="confirm">${editing ? 'Enregistrer la modification fictive' : 'Terminer la réservation fictive'} ${icon('check')}</button><p class="booking-foot">Vous pourrez consulter ou annuler cet exemple.</p>`;
  }
  function finished() {
    const cancelled = record.status === 'cancelled', manage = stage === 'manage';
    return `<div class="success-icon">${icon(cancelled ? 'calendar-x' : 'check-circle-2')}</div><span class="status-badge${cancelled ? ' cancelled' : ''}">${cancelled ? 'Annulation simulée' : 'Confirmation simulée'}</span>${heading(cancelled ? 'Votre exemple est annulé' : manage ? 'Votre réservation fictive' : editing ? 'Votre exemple est modifié' : 'Votre exemple est prêt', cancelled ? 'Aucune réservation réelle n’a été annulée.' : 'Aucune réservation réelle effectuée. Aucun email envoyé.', cancelled ? 'calendar-x' : 'clipboard-check')}<p class="reference">${esc(record.reference)}</p>${summary(true)}
      ${!cancelled ? `<p class="hint">${adapter.durable() ? 'Le lien de démonstration fonctionne dans cet onglet pendant 30 minutes.' : 'Le stockage est indisponible. Le lien fonctionne sur cette page jusqu’à son actualisation.'}</p><div class="button-stack">${manage ? '<button type="button" class="primary" data-action="edit">' + icon('pencil') + 'Modifier mon exemple</button><button type="button" class="danger" data-action="askCancel">Annuler mon exemple</button>' : `<a class="primary" href="?restaurant=${encodeURIComponent(slug)}#manage=${record.token}">${icon('link-2')}Consulter ou modifier mon exemple</a>`}<button type="button" class="secondary" data-action="copy">${icon('copy')}Copier le lien de démonstration</button></div>` : '<p class="form-note">Cet exemple ne peut plus être modifié. Vous pouvez recommencer le parcours.</p>'}<button type="button" class="text-button" data-action="restart">Commencer un nouvel exemple</button>`;
  }
  function render(focus = true, focusId) {
    $('portalLayout').classList.toggle('compact-story', stage !== 1);
    card.innerHTML = stage === 1 ? venueForm() : stage === 2 ? coordinatesForm() : stage === 3 ? reviewForm() : record ? finished() : `${heading('Ce lien n’est plus disponible', notice || 'Vérifiez votre lien ou recommencez l’exercice.', 'link-2')}<p class="form-note">Les liens de cet aperçu sont limités à cet onglet et expirent après 30 minutes.</p><button class="primary" type="button" data-action="restart">Créer un nouvel exemple</button>`;
    icons();
    if (focusId) $(focusId)?.focus({ preventScroll: true });
    else if (focus) { card.querySelector('h2').focus({ preventScroll: true }); card.scrollIntoView({ block: 'start' }); }
  }
  function syncContact() {
    for (const name of ['firstName', 'lastName', 'email', 'phone', 'notes', 'hotelRoom']) if ($(name)) contact[name] = $(name).value.trim();
    if (contact.guestType !== 'hotel') contact.hotelRoom = '';
    if ($('accepted')) contact.accepted = $('accepted').checked;
  }
  function readManaged() {
    const token = new URLSearchParams(location.hash.slice(1)).get('manage');
    if (!token) return;
    try { record = adapter.read(token); draft = { ...record.draft }; contact = { ...record.contact }; notice = ''; }
    catch (error) { record = null; notice = error.code === 'expired' ? 'Ce lien de démonstration a expiré.' : 'Ce lien de démonstration est inconnu dans cet onglet.'; }
    editing = false; dirty = false; stage = 'manage'; render();
  }
  function fail(error) {
    const messages = { expired: 'Le lien a expiré. Recommencez avec un nouvel exemple.', cancelled: 'Cet exemple a déjà été annulé.', conflict: 'L’exemple a changé. Rouvrez son lien avant de continuer.', invalid: 'Votre choix doit être vérifié. Revenez à votre venue.' };
    notice = messages[error.code] || 'L’exercice n’a pas pu être terminé. Réessayez sans fermer cette page.';
    if (['expired', 'not_found'].includes(error.code)) { record = null; editing = false; dirty = false; stage = 'manage'; }
    render(); announce(notice);
  }
  card.addEventListener('change', event => {
    const input = event.target;
    if (input.name === 'guestType' && config.type === 'hotel') { contact.guestType = input.value; contact.hotelRoom = ''; dirty = true; notice = ''; render(false, input.id); return; }
    if (['party', 'service', 'time'].includes(input.name)) draft[input.name] = input.name === 'party' ? Number(input.value) : input.value;
    else if (input.id === 'visitDate') draft.date = input.value;
    else { dirty = true; return; }
    if (!M.availability(config, draft).slots.some(s => s.time === draft.time && s.available)) draft.time = '';
    dirty = true; notice = ''; render(false, input.id);
  });
  card.addEventListener('input', event => { if (event.target.closest('#contactForm')) dirty = true; });
  card.addEventListener('submit', event => {
    event.preventDefault(); syncContact(); errors = M.validate(config, draft, contact);
    if (errors.venue) { stage = 1; notice = errors.venue; render(); return; }
    if (Object.keys(errors).length) { render(false); card.querySelector('[aria-invalid="true"]')?.focus(); announce('Vérifiez les champs indiqués.'); return; }
    stage = 3; render();
  });
  function showInfo(kind) {
    $('infoTitle').textContent = kind === 'privacy' ? 'Vos données dans cet aperçu' : kind === 'cancel' ? 'Annuler cet exemple ?' : 'Conditions de l’exemple';
    $('infoBody').innerHTML = kind === 'privacy' ? '<p>Utilisez uniquement des coordonnées fictives. Cet aperçu n’envoie aucune donnée de formulaire à RestoManager, au restaurant ou à un service extérieur.</p><p>Le lien expire après 30 minutes. L’exemple reste dans cet onglet jusqu’à sa fermeture, son effacement ou la vérification de son expiration. Le bouton « Commencer un nouvel exemple » l’efface. Aucun compte, suivi publicitaire ou email n’est utilisé.</p><p>Les informations de confidentialité du portail connecté sont consultables sur la page de réservation du restaurant. Cet exemple reste une simulation indépendante.</p>' : kind === 'cancel' ? '<p>Votre exemple sera marqué comme annulé et ne pourra plus être modifié. Aucune réservation réelle n’est concernée.</p>' : '<p>Les horaires, disponibilités et conditions affichés sont fictifs et ne représentent pas les horaires réels du restaurant. Aucun placement de table n’est promis.</p><p>La confirmation et l’annulation servent uniquement à essayer le parcours. Pour réserver réellement, utilisez les moyens de contact habituels de votre restaurant.</p>';
    $('acceptInfo').textContent = kind === 'cancel' ? 'Oui, annuler cet exemple' : 'J’ai compris';
    $('acceptInfo').dataset.confirmCancel = kind === 'cancel' ? 'yes' : '';
    $('infoDialog').showModal();
  }
  card.addEventListener('click', async event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || busy) return;
    if (action === 'privacy' || action === 'terms') return showInfo(action);
    if (action === 'coordinates') { stage = 2; errors = {}; render(); }
    if (action === 'back') { syncContact(); stage = Math.max(1, stage - 1); render(); }
    if (action === 'confirm') {
      busy = true;
      try {
        record = editing ? adapter.update(record.token, draft, contact, record.revision) : adapter.create(draft, contact, record?.token);
        dirty = false; notice = ''; stage = 'finished'; render(); announce('Votre exemple est enregistré uniquement dans cet onglet.');
      } catch (error) { fail(error); } finally { busy = false; }
    }
    if (action === 'edit') { editing = true; stage = 1; notice = ''; render(); }
    if (action === 'abandonEdit') { draft = { ...record.draft }; contact = { ...record.contact }; editing = false; dirty = false; stage = 'manage'; render(); }
    if (action === 'askCancel') showInfo('cancel');
    if (action === 'restart') {
      adapter.clear(); history.replaceState(null, '', location.pathname + location.search); record = null; editing = false; dirty = false; stage = 1; notice = ''; errors = {};
      draft = M.initialVisit(config); contact = blankContact(); render();
    }
    if (action === 'copy') {
      const url = new URL(location.href); url.hash = 'manage=' + record.token;
      try { await navigator.clipboard.writeText(url.href); announce('Lien de démonstration copié.'); event.target.closest('button').textContent = 'Lien copié'; }
      catch { showInfo('copy'); $('infoTitle').textContent = 'Votre lien de démonstration'; $('infoBody').textContent = url.href; $('infoBody').classList.add('hint'); }
    }
  });
  window.addEventListener('hashchange', () => { if (location.hash) readManaged(); else if (record) { stage = 'finished'; render(); } });
  window.addEventListener('beforeunload', event => { if (dirty && (stage === 2 || stage === 3 || editing)) { event.preventDefault(); event.returnValue = ''; } });
  render(false); if (location.hash) readManaged(); icons();
})();
