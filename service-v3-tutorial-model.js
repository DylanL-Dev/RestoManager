/* RM-016: versioned learning content. No service data or network access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RestoLearning = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const roles = ['restaurant', 'reception'];
  const nav = screen => ['.mobileNavItem[data-nav="' + screen + '"]', '.sidebar a[href="#' + screen + '"]'];
  const step = (id, screen, target, title, text, result, extra = {}) => ({id, screen, target: Array.isArray(target) ? target : [target], title, text, result, ...extra});
  const go = (id, screen, label) => step(id, null, nav(screen), 'Ouvrir ' + label, 'Utilisez le bouton « ' + label + ' » mis en évidence.', 'Vous retrouverez les informations sur cet écran.', {navigate: screen, basics: 'menu'});
  const guide = (id, title, description, icon, screens, steps, extra = {}) => ({id, version: 1, roles, title, description, icon, screens, minutes: Math.max(1, Math.ceil(steps.length / 3)), steps, ...extra});
  const guides = [
    guide('first-steps', 'Mes premiers pas', 'Se repérer, changer d’écran et retrouver de l’aide.', 'user-round', ['tables'], [
      step('welcome', 'tables', '#teamSpace', 'Votre espace de travail', 'Le nom de votre équipe est affiché ici. Chaque équipe dispose de ses propres actions.', 'Vous savez si vous utilisez l’espace Restaurant ou Réception.', {detail: 'Le guide montre les vrais écrans, sans effectuer de réservation. Pour essayer un geste, choisissez Entraînement dans l’aide.'}),
      go('open-reservations', 'reservations', 'Réservations'),
      step('search', 'reservations', '#reservationQuery', 'Retrouver un client', 'La recherche accepte un nom ou un numéro de chambre. Une recherche retire le filtre de date.', 'Exemple fictif : en cherchant 204, vous retrouveriez les réservations de cette chambre.', {basics: 'search', essential: true}),
      step('help', null, '#rmLearningHelp', 'L’aide reste à portée de main', 'Le bouton Aide est disponible sur tous les écrans. Vous pouvez revenir ici quand vous le souhaitez.', 'Vous n’avez pas besoin de tout retenir dès aujourd’hui.', {essential: true})
    ]),
    guide('find-booking', 'Retrouver une réservation', 'Chercher par chambre ou par nom et lire la bonne fiche.', 'search', ['reservations'], [
      go('open', 'reservations', 'Réservations'),
      step('query', 'reservations', '#reservationQuery', 'Chercher la chambre ou le nom', 'Utilisez ce champ pour retrouver le client. Si la liste est vide, vérifiez l’orthographe et la date.', 'Exemple fictif : chambre 204, deux couverts à 19 h 30.', {basics: 'search', essential: true}),
      step('date', 'reservations', '#reservationDate', 'Vérifier la journée', 'La date sert à limiter la liste à une journée. Une recherche par nom ou chambre peut afficher plusieurs dates.', 'Vous vérifiez la date de la réservation avant d’agir.', {basics: 'date'}),
      step('details', 'reservations', '#reservationQuery', 'Lire la fiche avant d’accueillir', 'Sur la fiche, vérifiez l’heure, les couverts, les notes et les allergies signalées. Ouvrez le détail pour en savoir plus.', 'Deux réservations du même client peuvent concerner des journées différentes.', {basics: 'scroll', essential: true})
    ]),
    guide('new-booking', 'Ajouter une réservation', 'Choisir le client, la date, l’heure et les couverts.', 'calendar-plus', ['reservationForm'], [
      go('open', 'reservationForm', 'Ajouter'),
      step('type', 'reservationForm', '#bookingForm .bookingTypeChoices', 'Hôtel ou client extérieur ?', 'Choisissez le type de client. Pour un client de l’hôtel, renseignez sa chambre ; pour un client extérieur, son nom.', 'Exemple fictif : client de l’hôtel, chambre 204.', {essential: true}),
      step('date', 'reservationForm', '#bookingDate', 'Choisir la date du repas', 'Vérifiez le jour, le mois et l’année avant de poursuivre.', 'La réservation concerne la journée choisie, pas forcément aujourd’hui.', {basics: 'date'}),
      step('time', 'reservationForm', '#bookingTime', 'Choisir l’heure d’arrivée', 'Choisissez un horaire proposé pendant les services ouverts. Le nombre de couverts peut changer les disponibilités.', 'Exemple fictif : 19 h 30 pour deux personnes.', {basics: 'time', essential: true}),
      step('guests', 'reservationForm', '#bookingGuests', 'Compter les couverts', 'Indiquez le nombre de personnes. Vérifiez les notes et les allergies avant l’enregistrement.', 'Un couvert correspond à une personne.', {basics: 'field'}),
      step('save', 'reservationForm', '#bookingForm .bookingSubmitPrimary', 'Vérifier puis enregistrer', 'Dans le service réel, relisez vos informations puis utilisez « Ajouter la réservation ». Attendez le message de réussite.', 'Une saisie seule n’est pas une réservation enregistrée. Entraînez-vous sans risque dans la démonstration.', {basics: 'save', essential: true})
    ]),
    guide('reception-status', 'Confirmer et suivre le client', 'Distinguer une réservation confirmée d’un client installé.', 'clipboard-check', ['reservations', 'passages'], [
      step('status', 'reservations', '#reservationQuery', 'Confirmé ne veut pas dire installé', '« Confirmé · Attendu » signifie que la réservation est confirmée, mais que le client n’est pas encore installé.', 'Exemple fictif : chambre 204 confirmée pour 19 h 30, toujours attendue.', {essential: true}),
      step('confirm', 'reservations', '#reservationQuery', 'Confirmer la réservation', 'Sur une réservation à confirmer, la Réception dispose de Confirmer. Elle peut aussi modifier, signaler un retard ou annuler selon le statut.', 'La confirmation ne signifie ni arrivée ni installation à table.', {essential: true}),
      step('service', 'passages', '#receptionServiceOverview', 'Suivre sans placer', 'Cet écran présente le suivi du restaurant. La table est proposée par l’application ; le placement manuel et les actions de salle appartiennent au Restaurant.', 'La Réception ne peut ni installer, ni changer manuellement de table, ni libérer un client.')
    ], {roles: ['reception']}),
    guide('home', 'Comprendre le service', 'Lire les couverts, les attendus et les présents.', 'layout-grid', ['tables'], [
      step('numbers', 'tables', '#kpis', 'Les chiffres du service', 'Les couverts comptent les personnes. Les attendus ne sont pas encore installés ; les présents sont installés.', 'Une réservation confirmée peut rester dans les attendus.', {essential: true}),
      step('occupancy', 'tables', '#currentOccupancy', 'Lire l’occupation réelle', 'Une table occupée le reste jusqu’à la fin du suivi du client. Une durée estimée ne prouve pas son départ.', 'Vérifiez la présence réelle du client avant de terminer son suivi.', {essential: true}),
      step('sync', 'tables', ['#syncBadge', '#mobileAccountToggle'], 'Vérifier la connexion', 'Ce repère indique la connexion de l’équipe. Sur mobile, le voyant se trouve sur le menu du compte. Si la connexion manque, attendez son retour avant d’enregistrer.', 'Une erreur de connexion ne confirme jamais une opération.', {basics: 'error'})
    ]),
    guide('seat', 'Installer un client', 'Accueillir le bon client et l’installer directement.', 'utensils', ['reservations'], [
      go('open', 'reservations', 'Réservations'),
      step('find', 'reservations', '#reservationQuery', 'Retrouver le client présent', 'Cherchez sa chambre ou son nom. Vérifiez sa date, ses couverts et sa table.', 'Vous accueillez le bon groupe.', {basics: 'search'}),
      step('install', 'reservations', '.reservationMoreTrigger', 'Installer à table', 'Dans Plus d’actions (les trois points), choisissez « Installer à table ». Le Restaurant peut installer directement, sans confirmer la réservation d’abord.', 'Le statut devient « Installé » après réussite. Essayez ce geste dans Entraînement.', {fallback: '#reservationQuery', absent: 'Aucune fiche avec ce menu n’est affichée ici. Retrouvez d’abord une réservation attendue ; la démonstration permet de voir le geste.', essential: true}),
      step('check', 'tables', '#currentOccupancy', 'Vérifier le résultat', 'Après une installation réussie, le client apparaît parmi les présents et la table est occupée.', 'En cas de message d’erreur, ne supposez pas que l’installation a réussi.', {basics: 'save', essential: true})
    ], {roles: ['restaurant']}),
    guide('changes', 'Retards et changements', 'Modifier sans confondre retard, absence et annulation.', 'clock-alert', ['reservations'], [
      step('late', 'reservations', '#reservationQuery', 'Un retard n’est pas une absence', 'Retrouvez la réservation. Le menu Plus d’actions propose Retard selon son statut ; ne déclarez pas un client absent sans vérification.', 'Le client en retard reste attendu.', {essential: true}),
      step('edit', 'reservations', '#reservationQuery', 'Modifier ou annuler', 'Modifier ouvre la fiche. Relisez les changements puis enregistrez. Une annulation demande une vérification avant validation.', 'Un message confirme l’enregistrement ; une erreur conserve une incertitude.', {basics: 'save'}),
      step('table', 'reservations', '.reservationMoreTrigger', 'Changer de table', 'Dans Plus d’actions, « Changer la table » est proposé aux réservations encore attendues. Choisissez uniquement une table compatible et disponible.', 'La disponibilité est vérifiée lors de l’enregistrement.', {fallback: '#reservationQuery', essential: true})
    ], {roles: ['restaurant']}),
    guide('walkin', 'Accueillir sans réservation', 'Utiliser Passage pour installer un client qui arrive.', 'user-plus', ['passages'], [
      go('open', 'passages', 'Passage'),
      step('people', 'passages', '#walkinGuests', 'Combien de personnes ?', 'Dans Client de passage, choisissez le nombre de personnes. Indiquez la chambre ou le nom si vous le connaissez.', 'La proposition dépend des places réellement disponibles.', {basics: 'field', essential: true}),
      step('offer', 'passages', '#walkinRecommendation', 'Lire la proposition', 'Vérifiez la table proposée et les informations affichées. Si aucune table ne convient, ne forcez pas l’installation.', 'Aucune proposition ne signifie pas qu’une table occupée est libre.', {essential: true}),
      step('install', 'passages', '#walkinFeedback', 'Installer le passage', 'Dans le service réel, le bouton Installer le passage enregistre une installation immédiate. Attendez la confirmation.', 'Le client apparaît installé ; vous n’avez pas créé une simple réservation pour plus tard.', {basics: 'save'})
    ], {roles: ['restaurant']}),
    guide('release', 'Libérer une table', 'Terminer le suivi seulement après le départ réel.', 'check-check', ['passages'], [
      step('occupied', 'passages', '#quickReleaseSearch', 'Retrouver la table occupée', 'Dans Tables occupées, recherchez la chambre, le nom ou la table. Vérifiez que les clients sont réellement partis.', 'La fin estimée ne libère jamais une table toute seule.', {basics: 'search', essential: true}),
      step('release', 'passages', '#quickReleaseSearch', 'Terminer le suivi du client', 'Utilisez l’action de libération de la fiche concernée, puis vérifiez la table et les éventuels messages avant de confirmer.', 'Le client passe dans les départs une fois l’action réussie.', {essential: true}),
      step('check', 'tables', '#currentOccupancy', 'Relire l’occupation', 'Vérifiez le résultat à l’écran. Une autre réservation ou un autre groupe peut encore occuper la même table.', 'Ne considérez pas une table disponible uniquement parce qu’une durée est dépassée.', {basics: 'error'})
    ], {roles: ['restaurant']}),
    guide('availability', 'Comprendre les disponibilités', 'Comprendre pourquoi un horaire ou une table manque.', 'calendar-clock', ['reservationForm'], [
      step('hours', 'reservationForm', '#bookingTime', 'Un horaire peut être indisponible', 'Le restaurant doit être ouvert. Le nombre de personnes, la durée et les autres réservations comptent aussi.', 'Essayez un autre horaire proposé ou demandez au Restaurant.', {basics: 'time', essential: true}),
      step('guests', 'reservationForm', '#bookingGuests', 'Le bon nombre de couverts', 'Une table doit accueillir tout le groupe. Les tables occupées ou momentanément retenues peuvent être exclues.', 'Deux personnes et six personnes n’ont pas forcément les mêmes possibilités.'),
      step('message', 'reservationForm', '#bookingFeedback', 'Lire la raison avant de réessayer', 'Une absence de proposition n’est pas une panne certaine. Lisez le message, vérifiez la date, l’heure et les couverts.', 'En cas de doute, conservez votre saisie et utilisez Aide.', {basics: 'error', essential: true})
    ]),
    guide('management', 'Gestion et Assistance', 'Retrouver les horaires, les salles et les réglages.', 'settings', ['administration'], [
      step('hours', 'administration', '#manageHoursToggle', 'Ouvrir une rubrique', 'Gestion se lit rubrique par rubrique. Les horaires sont définis par jour, pour le midi et le soir.', 'Vous consultez le bon jour avant de changer un service.', {category: 'manageHours', basics: 'menu', essential: true}),
      step('rooms', 'administration', '#manageRoomsToggle', 'Salles, tables et paramètres', 'Salles regroupe les espaces. Tables règle les tables de la salle choisie. Paramètres du service contient la durée et l’apparence.', 'Une modification de réglage demande son propre enregistrement.', {category: 'manageRooms'}),
      step('support', 'administration', '#manageFeedbackToggle', 'Demander de l’aide', 'Assistance permet de poser une question, signaler un problème ou proposer une amélioration. Décrivez ce que vous essayiez de faire.', 'N’envoyez ni mot de passe ni informations personnelles de clients.', {category: 'manageFeedback', essential: true})
    ], {roles: ['restaurant']}),
    guide('reception-help', 'Horaires et Assistance', 'Lire les horaires partagés et demander de l’aide.', 'circle-help', ['administration'], [
      step('hours', 'administration', '#manageReadonlyHoursToggle', 'Consulter les horaires', 'La Réception consulte le planning partagé en lecture seule. Demandez au Restaurant de modifier ses horaires.', 'Les jours fermés sont indiqués dans le planning.', {category: 'manageReadonlyHours', essential: true}),
      step('support', 'administration', '#manageFeedbackToggle', 'Contacter l’Assistance', 'Décrivez votre question ou le problème rencontré. Ne transmettez pas de mot de passe ni de données personnelles de clients.', 'Attendez le message confirmant l’envoi.', {category: 'manageFeedback', basics: 'error', essential: true})
    ], {roles: ['reception']}),
    guide('notifications', 'Comprendre les notifications', 'Lire une alerte, la traiter et retrouver les nouveautés.', 'bell', ['tables', 'reservations', 'administration'], [
      step('bell', null, '#serviceBell', 'Ouvrir les notifications', 'La cloche rassemble les informations utiles. Son nombre indique les éléments non lus.', 'Ouvrez la cloche mise en évidence.', {open: 'notifications', essential: true}),
      step('read', null, '.rmNcTitleRow', 'Lire, puis traiter', 'Une alerte explique ce qui demande votre attention. « Voir la réservation » ouvre l’élément concerné.', 'Lire une alerte ne règle pas le problème du service.', {view: 'notifications', essential: true}),
      step('remove', null, '.rmNcTools', 'Retirer n’est pas résoudre', 'Pour une notification qui le permet, glissez la carte ou utilisez Retirer. Annuler restaure le dernier retrait sur cet appareil.', 'Une alerte métier non résolue peut rester visible ou réapparaître.', {view: 'notifications', detail: 'Les informations importantes et les mises à jour en attente ne se retirent pas comme une annonce ordinaire.'}),
      step('news', null, '.rmNcFooter', 'Quoi de neuf ?', 'Ce lien conserve l’historique des nouveautés. Une mise à jour s’effectue quand votre saisie est terminée.', 'Vous pouvez découvrir une nouveauté même après avoir retiré son annonce.', {view: 'notifications', basics: 'refresh', essential: true})
    ]),
    guide('closeout', 'Régulariser un ancien service', 'Vérifier les oublis puis clôturer la date exacte.', 'calendar-days', ['administration'], [
      step('date', 'administration', '#manageClosureToggle', 'Choisir le bon service', 'Services à régulariser permet de consulter une journée précise. Vérifiez la date avant toute action.', 'Une correction d’hier ne doit pas modifier le service d’aujourd’hui.', {category: 'manageClosure', essential: true}),
      step('check', 'administration', '#manageClosureToggle', 'Vérifier chaque oubli', 'Libérez une table ou déclarez une absence seulement après vérification. Les actions gardent une trace.', 'Aucun départ ou client absent n’est deviné automatiquement.', {category: 'manageClosure', essential: true}),
      step('close', 'administration', '#manageClosureToggle', 'Clôturer sans confusion', 'Une journée avec un blocage reste ouverte. Si la clôture automatique est activée, elle attend la fin réelle et tous les suivis finalisés.', 'La date du service et l’heure réelle de clôture sont conservées séparément.', {category: 'manageClosure'})
    ], {roles: ['restaurant'], feature: 'closeout', released: true, release: '2026.11.17-rm012.1'}),
    // Contract reserved for RM-015. No public or staff guide is exposed before publication.
    {id: 'online-booking', version: 1, roles: ['restaurant'], title: 'Réservations en ligne', screens: ['administration'], feature: 'online-booking', released: false, steps: []}
  ];
  const basics = {
    menu: 'Un menu rassemble plusieurs choix. Utilisez son titre pour l’ouvrir ; utilisez le même titre pour le refermer.',
    search: 'Touchez ou cliquez dans le champ, puis écrivez quelques lettres ou un numéro. Effacez le texte pour retirer la recherche.',
    date: 'Ouvrez le calendrier, choisissez le jour et vérifiez le mois. Le bouton Retour ferme le choix sans enregistrer une réservation.',
    time: 'Ouvrez le choix de l’heure, sélectionnez heures et minutes, puis validez ce choix. Cela n’enregistre pas encore la réservation.',
    field: 'Un champ est une zone où écrire. Sélectionnez-la, saisissez la valeur, puis relisez-la avant de continuer.',
    scroll: 'Sur téléphone ou tablette, faites glisser un doigt vers le haut pour voir la suite. Sur ordinateur, utilisez la molette ou la barre sur le côté.',
    save: 'Enregistrer transmet une modification. Attendez le message de réussite. Ne recommencez pas plusieurs fois si le résultat reste incertain.',
    error: 'Lisez le message : rien n’est confirmé s’il indique une erreur. Conservez votre saisie, vérifiez la connexion et demandez de l’aide si le doute reste.',
    refresh: 'Terminez votre saisie avant d’actualiser ou de mettre à jour. RestoManager vous prévient si des changements ne sont pas enregistrés.'
  };
  const faq = [
    {id: 'button', roles, title: 'À quoi sert ce bouton ?', text: 'Dans « Pour cet écran », choisissez le petit parcours qui correspond à votre tâche. Le guide montre le bouton dans votre écran et explique son résultat. Les vrais formulaires restent en lecture pendant la visite.', guide: 'first-steps'},
    {id: 'status', roles, title: 'Confirmé, attendu, installé : quelle différence ?', text: 'Confirmé décrit la réservation. Attendu signifie que le client n’est pas encore installé. Installé signifie qu’il est à table. Une réservation peut donc être confirmée et toujours attendue.', guide: 'home'},
    {id: 'find', roles, title: 'Je ne retrouve pas un client', text: 'Vérifiez la chambre ou le nom dans Réservations. Une recherche retire le filtre de date : vérifiez ensuite la date sur chaque fiche.', guide: 'find-booking'},
    {id: 'seat', roles: ['restaurant'], title: 'Faut-il confirmer avant d’installer ?', text: 'Non. Le Restaurant peut choisir Installer à table directement dans Plus d’actions, après avoir vérifié le client et la disponibilité.', guide: 'seat'},
    {id: 'permissions', roles: ['reception'], title: 'Pourquoi ne puis-je pas choisir la table ?', text: 'La Réception crée et confirme la réservation. L’application propose une attribution ; seul le Restaurant peut placer, changer manuellement la table, installer ou libérer.', guide: 'reception-status'},
    {id: 'availability', roles, title: 'Pourquoi cet horaire n’est-il pas proposé ?', text: 'Vérifiez les jours et services ouverts, la date et les couverts. Une table doit avoir assez de places et être disponible pendant toute la durée.', guide: 'availability'},
    {id: 'release', roles: ['restaurant'], title: 'Pourquoi la table reste-t-elle occupée ?', text: 'Le temps affiché est une estimation. Le suivi doit être terminé après le départ réel. Un autre groupe peut encore occuper la même table.', guide: 'release'},
    {id: 'lost', roles, title: 'Je n’ai pas compris. Comment revenir ?', text: 'Dans le guide, Précédent revient à l’explication précédente. En dehors du guide, le bouton Retour revient dans l’application et protège les saisies en cours.', guide: 'first-steps'},
    {id: 'error', roles, title: 'Un message d’erreur apparaît', text: basics.error, guide: 'availability'},
    {id: 'refresh', roles, title: 'Comment actualiser sans perdre ma saisie ?', text: basics.refresh, guide: 'notifications'},
    {id: 'notification', roles, title: 'J’ai lu l’alerte : pourquoi est-elle encore là ?', text: 'Marquer comme lu ne termine pas le suivi d’un client. Les alertes de service se règlent avec l’action métier adaptée, après vérification.', guide: 'notifications'},
    {id: 'support', roles, title: 'Comment demander de l’aide à l’Assistance ?', text: 'Ouvrez Gestion puis Signaler un problème. Choisissez Assistance et décrivez les étapes du problème sans joindre de mot de passe ni de données personnelles de clients.', guide: 'support'}
  ];
  const lexicon = [
    ['Couvert', 'Une personne prévue ou accueillie au restaurant.'], ['Attendu', 'Le client n’est pas encore installé à table.'],
    ['Confirmé', 'La réservation est confirmée ; le client peut encore être attendu.'], ['Installé', 'Le client est à table.'],
    ['Retard', 'L’heure prévue est dépassée ; cela ne prouve pas une absence.'], ['Absent', 'Le client n’est pas venu, après vérification.'],
    ['Passage', 'Un client accueilli sans réservation pour être installé maintenant.'], ['Libéré', 'Le départ du client a été enregistré.'],
    ['Clôture', 'L’archivage du suivi d’une journée vérifiée.']
  ];
  function available(role, features = {}) { return guides.filter(g => g.roles.includes(role) && g.released !== false && (!g.feature || features[g.feature] === true)); }
  function stepsFor(course, level) { return level === 'quick' ? course.steps.filter(s => s.essential || s.navigate || s.open) : course.steps; }
  function scope({userId, restaurantId, role}) { return userId && restaurantId && roles.includes(role) ? 'restomanager:learning:v1:' + [userId, restaurantId, role].map(encodeURIComponent).join(':') : null; }
  function progressKey(course, level) { return course.id + '@' + course.version + ':' + (level === 'quick' ? 'quick' : 'beginner'); }
  function readProgress(value, course, level) {
    const total = stepsFor(course, level).length;
    return {index: Number.isInteger(value?.index) ? Math.max(0, Math.min(total - 1, value.index)) : 0, complete: value?.complete === true, total};
  }
  function search(items, value) { const q = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); return items.filter(x => (x.title + ' ' + (x.description || x.text || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q)); }
  return Object.freeze({guides, basics, faq, lexicon, available, stepsFor, scope, progressKey, readProgress, search});
});
