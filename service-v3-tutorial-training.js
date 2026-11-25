/* RM-016: opaque-origin, sandboxed practice. The document has no network capability. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RestoLearningTraining = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function trainingApp(role, scenario, token) {
    const $ = id => document.getElementById(id), main = $('exercise'), status = $('status');
    let bookingStatus = 'reserved', query = '', stage = 'search', removed = false, read = false, saved = false;
    const node = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
    const button = (text, fn, cls = '') => { const b = node('button', text, cls); b.type = 'button'; b.addEventListener('click', fn); return b; };
    const say = text => { status.textContent = text; };
    function done() { parent.postMessage({type: 'rm016:practice-complete', scenario, token}, '*'); }
    function label(text, input) { const l = node('label', text); l.append(input); return l; }
    function input(id, type = 'text', value = '') { const e = document.createElement('input'); e.id = id; e.type = type; e.value = value; return e; }
    function title(text, description) { main.replaceChildren(node('h2', text), node('p', description)); main.querySelector('h2').tabIndex = -1; }
    function result() { const box = node('section', '', 'card'); box.append(node('strong', 'Chambre 204'), node('p', 'Exemple Martin · 2 couverts · 08/11/2032 à 19 h 30'), button('Voir la fiche', () => { stage = 'detail'; render(); })); return box; }
    function renderSearch() {
      title('Retrouvez la chambre 204', 'Écrivez 204 dans Rechercher, puis ouvrez la fiche. Toutes les informations de cet exercice sont fictives.');
      const field = input('practice-search', 'search', query); field.placeholder = 'Chambre ou nom'; const list = node('div'); list.id = 'practice-results'; list.setAttribute('aria-live', 'polite');
      function filter() { query = field.value; list.replaceChildren(); if (/204|martin/i.test(query)) list.append(result()); else list.append(node('p', query ? 'Aucun résultat. Essayez 204.' : 'Les résultats apparaîtront ici.')); }
      field.addEventListener('input', filter); main.append(label('Rechercher', field), list); filter();
    }
    function renderDetail() {
      const text = bookingStatus === 'reserved' ? 'À confirmer · Attendu' : bookingStatus === 'confirmed' ? 'Confirmé · Attendu' : bookingStatus === 'seated' ? 'Installé' : 'Libéré';
      title('Chambre 204', 'Exemple fictif · 2 couverts · 08/11/2032 à 19 h 30');
      const badge = node('p', text, 'badge'); badge.id = 'practice-booking-status';
      main.append(badge, node('p', 'Note : anniversaire. Allergie signalée : fruits à coque.'));
      if (role === 'restaurant') main.append(node('p', 'Table 4 · Salle principale'));
      if (bookingStatus === 'reserved') {
        main.append(node('p', role === 'restaurant' ? 'Le client est devant vous. Ouvrez Plus d’actions (les trois points), puis choisissez Installer à table : aucune confirmation de réservation préalable n’est nécessaire.' : 'La réservation est à confirmer. Confirmer ne signifie pas que le client est installé.'));
        const action = button(role === 'restaurant' ? 'Installer à table' : 'Confirmer', () => { bookingStatus = role === 'restaurant' ? 'seated' : 'confirmed'; say(role === 'restaurant' ? 'Installation fictive réussie. La table est maintenant occupée.' : 'Confirmation fictive réussie. Le client reste attendu.'); render(); if (role === 'reception') done(); }, 'primary');
        if (role === 'restaurant') { const menu = node('details', '', 'card'); menu.append(node('summary', 'Plus d’actions (⋯)'), action); main.append(menu); } else main.append(action);
      } else if (bookingStatus === 'seated') {
        main.append(node('p', 'Le repas est terminé et les clients sont partis. La durée estimée ne libère pas la table automatiquement.'));
        main.append(button('Libérer la table', () => { stage = 'release'; render(); }, 'primary'));
      } else if (bookingStatus === 'confirmed') main.append(node('p', 'Bravo ! La Réception a confirmé la réservation. Le Restaurant se chargera de l’installation. Aucun placement manuel n’est disponible pour la Réception.', 'success'));
      else main.append(node('p', 'Bravo ! Le départ fictif est enregistré. Vous avez retrouvé, installé puis libéré le bon client.', 'success'));
      main.append(button('Retour à la liste', () => { stage = 'search'; render(); }));
    }
    function renderRelease() {
      title('Vérifier le départ', 'Exemple fictif : chambre 204, table 4. Confirmez seulement si les clients sont réellement partis.');
      main.append(button('Les clients sont partis', () => { bookingStatus = 'released'; stage = 'detail'; render(); say('Libération fictive réussie. Le suivi de ce client est terminé.'); done(); }, 'primary'), button('Revenir sans libérer', () => { stage = 'detail'; render(); }));
    }
    function renderBooking() {
      title('Créer une réservation fictive', 'Choisissez une date et un horaire, puis enregistrez l’exemple. Rien ne sera envoyé au restaurant.');
      const form = node('div'), type = document.createElement('select'); type.id = 'practice-type';
      for (const [value, text] of [['hotel', 'Client de l’hôtel'], ['external', 'Client extérieur']]) { const o = node('option', text); o.value = value; type.append(o); }
      const client = input('practice-client', 'text', '204'), clientLabel = label('Chambre', client);
      type.addEventListener('change', () => { clientLabel.firstChild.textContent = type.value === 'hotel' ? 'Chambre' : 'Nom'; client.value = ''; });
      let date = '', time = '';
      const dateButton = button('Choisir une date', () => { dates.hidden = !dates.hidden; }); dateButton.id = 'practice-date'; dateButton.setAttribute('aria-expanded', 'false');
      const dates = node('div', '', 'choices'); dates.hidden = true; dates.append(node('p', 'Calendrier d’exercice · Novembre 2032'), button('8 novembre 2032', () => { date = '08/11/2032'; dateButton.textContent = date; dateButton.setAttribute('aria-expanded', 'false'); dates.hidden = true; }));
      dateButton.addEventListener('click', () => dateButton.setAttribute('aria-expanded', String(!dates.hidden)));
      const timeButton = button('Choisir un horaire', () => { times.hidden = !times.hidden; timeButton.setAttribute('aria-expanded', String(!times.hidden)); }); timeButton.id = 'practice-time'; timeButton.setAttribute('aria-expanded', 'false');
      const times = node('div', '', 'choices'); times.hidden = true;
      times.append(button('18 h 30 · indisponible', () => say('Exemple : le service n’est pas ouvert à 18 h 30. Choisissez 19 h 30.')), button('19 h 30', () => { time = '19:30'; timeButton.textContent = '19 h 30'; times.hidden = true; timeButton.setAttribute('aria-expanded', 'false'); say('Horaire choisi. La réservation n’est pas encore enregistrée.'); }));
      const guests = input('practice-guests', 'number', '2'); guests.min = '1'; guests.max = '12';
      form.append(label('Type de client', type), clientLabel, node('span', 'Date du repas'), dateButton, dates, node('span', 'Heure d’arrivée'), timeButton, times, label('Nombre de couverts', guests));
      if (role === 'reception') form.append(node('p', 'La table sera proposée par l’application. La Réception ne la choisit pas manuellement.'));
      main.append(form, button('Enregistrer l’exemple', () => {
        if (!client.value.trim() || !date || !time || !Number.isInteger(Number(guests.value)) || Number(guests.value) < 1 || Number(guests.value) > 12) { say('Vérifiez la chambre ou le nom, la date, l’heure et les couverts. Votre saisie est conservée.'); return; }
        if (saved) return; saved = true; main.replaceChildren(node('h2', 'Exemple enregistré'), node('p', date + ' · 19 h 30 · ' + guests.value + ' couverts'), node('p', 'Bravo ! Ce message confirme la réussite dans cet exercice uniquement. Aucune vraie réservation n’a été créée.', 'success')); say('Enregistrement fictif réussi.'); done();
      }, 'primary'));
    }
    function renderNotification() {
      title('Lire une notification', 'Cet exemple vous permet de lire, retirer et restaurer une notification sans toucher au centre réel.');
      if (removed) { main.append(node('p', 'Notification retirée dans cet exercice.'), button('Annuler le retrait', () => { removed = false; say('Notification restaurée.'); renderNotification(); }, 'primary')); return; }
      const card = node('article', '', 'card'); card.append(node('h3', 'Votre nouveau centre d’aide'), node('p', read ? 'Lue' : 'Non lue'), node('p', 'Exemple fictif : découvrez les guides et les exercices sans risque.'));
      if (!read) card.append(button('Marquer comme lue', () => { read = true; renderNotification(); say('Notification lue. Lire une alerte ne résout pas un problème de service.'); }));
      const remove = () => { removed = true; renderNotification(); say('Retrait fictif réussi. Annuler permet de revenir en arrière.'); done(); };
      card.append(button('Retirer', remove, 'primary')); let start = null;
      card.addEventListener('pointerdown', e => { if (!e.target.closest('button')) start = {x: e.clientX, y: e.clientY}; });
      card.addEventListener('pointerup', e => { if (start && Math.abs(e.clientX - start.x) > 80 && Math.abs(e.clientY - start.y) < 40) remove(); start = null; });
      card.addEventListener('pointercancel', () => { start = null; }); main.append(card, node('p', 'Vous pouvez aussi glisser la carte horizontalement pour la retirer.'));
    }
    function render() { if (scenario === 'booking') renderBooking(); else if (scenario === 'notifications') renderNotification(); else if (stage === 'search') renderSearch(); else if (stage === 'release') renderRelease(); else renderDetail(); }
    $('restart').addEventListener('click', () => { bookingStatus = 'reserved'; query = ''; stage = 'search'; saved = false; removed = false; read = false; say('Exercice recommencé.'); render(); });
    render();
  }
  function documentFor({role, scenario = 'welcome', token = '', dark = false} = {}) {
    role = role === 'reception' ? 'reception' : 'restaurant';
    scenario = ['welcome', 'booking', 'notifications'].includes(scenario) ? scenario : 'welcome';
    token = /^[a-zA-Z0-9-]{1,80}$/.test(token) ? token : '';
    // RM-SEC-04: the executable script is static (its SHA-256 is allowed by the page CSP inherited by
    // this srcdoc document); per-session values travel in a non-executable JSON block.
    const config = JSON.stringify({role, scenario, token}).replace(/</g, '\\u003c');
    const script = bootScript();
    return '<!doctype html><html lang="fr"' + (dark ? ' data-theme="dark"' : '') + '><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><meta name="viewport" content="width=device-width, initial-scale=1"><style>' +
      '*{box-sizing:border-box}body{margin:0;padding:20px;font:16px/1.55 system-ui,sans-serif;color:#193f35;background:#f5faf7}h2{font-size:23px;line-height:1.3;margin:14px 0}p{margin:12px 0}button,input,select{font:inherit;border:1px solid #aac8bb;border-radius:12px;color:inherit;background:#fff;min-height:48px;padding:11px 14px}button{cursor:pointer;font-weight:650;margin:5px 8px 5px 0}input,select{display:block;width:100%;margin-top:8px}label{display:block;font-weight:650;margin:16px 0}.primary{background:#176d57;color:#fff;border-color:#176d57}.badge,.success{background:#dff3e8;border-radius:12px;padding:12px}.card,.choices{border:1px solid #b8d4c6;border-radius:16px;padding:16px;margin:14px 0;background:#fff}header{display:flex;gap:12px;justify-content:space-between;align-items:center;border-bottom:1px solid #c8ded2;padding-bottom:12px}header strong{font-size:12px;letter-spacing:.09em}#status{min-height:24px;font-weight:650}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #218767;outline-offset:3px}[hidden]{display:none!important}[data-theme=dark] body{background:#142e27;color:#e5f3ed}[data-theme=dark] button,[data-theme=dark] input,[data-theme=dark] select,[data-theme=dark] .card,[data-theme=dark] .choices{background:#203f34;color:#e5f3ed}[data-theme=dark] .primary{background:#b6e2cf;color:#153f31}[data-theme=dark] .badge,[data-theme=dark] .success{background:#254d3d}@media(max-width:400px){body{padding:14px}header{align-items:flex-start}h2{font-size:21px}button{width:100%;margin-right:0}}' +
      '</style></head><body><header><strong>ENTRAÎNEMENT · DONNÉES FICTIVES</strong><button type="button" id="restart">Recommencer</button></header><main id="exercise"></main><p id="status" role="status" aria-live="polite"></p><script type="application/json" id="rmTrainingConfig">' + config + '</script><script>' + script + '</script></body></html>';
  }
  function bootScript() {
    return '(function(){var c=JSON.parse(document.getElementById("rmTrainingConfig").textContent);(' + trainingApp.toString() + ')(c.role,c.scenario,c.token);})();';
  }
  return Object.freeze({documentFor, bootScript});
});
