'use strict';
/* Public demo contract. No staff snapshot, table identifiers, SDK or credentials. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RMPublicModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const venues = {
    'a-lepicerie-rouen': {
      slug: 'a-lepicerie-rouen', name: 'À l’Épicerie',
      subtitle: 'Mercure Rouen Centre Champ-de-Mars', locality: 'Rouen, Normandie',
      introduction: 'Un moment à partager, une table à retrouver.',
      description: 'Découvrez le parcours de réservation de votre restaurant, du choix de votre venue à la gestion de votre réservation.',
      initials: 'É', maxParty: 8, horizonDays: 60, timezone: 'Europe/Paris',
      services: {
        lunch: { label: 'Midi', days: [1, 2, 3, 4, 5], times: ['12:00', '12:30', '13:00', '13:30'], full: ['12:30'] },
        dinner: { label: 'Soir', days: [0, 1, 2, 3, 4, 5, 6], times: ['19:00', '19:30', '20:00', '20:30', '21:00'], full: ['19:30'] }
      }, closedDates: ['2032-12-25']
    },
    'le-jardin-demo': {
      type: 'independent', slug: 'le-jardin-demo', name: 'Le Jardin', subtitle: 'Établissement entièrement fictif', locality: 'Ville de démonstration',
      introduction: 'Une autre adresse, le même plaisir de réserver.',
      description: 'Ce deuxième établissement fictif permet de vérifier que chaque restaurant possède son propre parcours.',
      initials: 'J', maxParty: 6, horizonDays: 30, timezone: 'Europe/Paris',
      services: { lunch: { label: 'Midi', days: [0, 1, 2, 3, 4, 5, 6], times: ['12:15', '12:45', '13:15'], full: [] }, dinner: { label: 'Soir', days: [4, 5, 6], times: ['18:30', '19:15', '20:00'], full: ['19:15'] } },
      closedDates: []
    },
    'hotel-des-rives-demo': {
      type: 'hotel', slug: 'hotel-des-rives-demo', name: 'Les Rives — Hôtel fictif',
      subtitle: 'Restaurant d’hôtel entièrement fictif', locality: 'Ville de démonstration',
      introduction: 'Un restaurant d’hôtel, les mêmes règles de disponibilité.',
      description: 'Parcours fictif pour découvrir l’accueil d’un restaurant d’hôtel, sans utiliser les données d’aucun établissement réel.',
      initials: 'R', maxParty: 8, horizonDays: 30, timezone: 'Europe/Paris',
      services: {
        lunch: { label: 'Midi', days: [1, 2, 3, 4, 5], times: ['12:00','12:30','13:00'], full: ['12:30'] },
        dinner: { label: 'Soir', days: [0, 1, 2, 3, 4, 5, 6], times: ['19:00','19:30','20:00'], full: ['19:30'] }
      }, closedDates: []
    }
  };
  function freeze(value) { Object.values(value).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(value); }
  freeze(venues);
  function venue(slug) { return Object.hasOwn(venues, slug) ? venues[slug] : null; }
  // Only fictional examples are displayed by default; real establishments are never substituted.
  function examples() { return Object.freeze(['le-jardin-demo','hotel-des-rives-demo'].map(slug => Object.freeze({slug,name:venues[slug].name,subtitle:venues[slug].subtitle,type:venues[slug].type}))); }
  function paris(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  }
  function validDate(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + 'T12:00:00Z')) && new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) === date; }
  function addDays(date, days) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
  function dateLabel(date, short = false) { return validDate(date) ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: short ? undefined : 'long', day: 'numeric', month: short ? 'short' : 'long', year: 'numeric' }).format(new Date(date + 'T12:00:00Z')) : ''; }
  function availability(config, draft, now = new Date()) {
    const today = paris(now), service = config && Object.hasOwn(config.services, draft.service) ? config.services[draft.service] : null;
    if (!config || !validDate(draft.date) || draft.date < today.date || draft.date > addDays(today.date, config.horizonDays)) return { state: 'date', slots: [], message: 'Choisissez une date dans les jours proposés.' };
    if (!Number.isInteger(draft.party) || draft.party < 1 || draft.party > config.maxParty) return { state: 'party', slots: [], message: 'Choisissez un nombre de personnes proposé.' };
    if (!service || !service.days.includes(new Date(draft.date + 'T12:00:00Z').getUTCDay()) || config.closedDates.includes(draft.date)) return { state: 'closed', slots: [], message: 'Ce service n’est pas proposé dans cet exemple. Essayez un autre service ou une autre date.' };
    const slots = service.times.map(time => ({ time, available: !(service.full.includes(time) || (draft.date === today.date && time <= today.time)) }));
    return { state: slots.some(s => s.available) ? 'available' : 'full', slots, message: slots.some(s => s.available) ? 'Horaires fictifs — aucune disponibilité réelle vérifiée.' : 'Aucun horaire proposé dans cet exemple. Essayez une autre date.' };
  }
  function initialVisit(config,now=new Date()) {
    const today=paris(now).date;
    for(const date of [today,addDays(today,1)]){
      const candidates=['lunch','dinner'].flatMap(service=>availability(config,{date,service,party:2},now).slots.filter(s=>s.available).map(s=>({date,service,time:s.time})));
      candidates.sort((a,b)=>a.time.localeCompare(b.time));if(candidates.length)return {...candidates[0],party:2,time:''};
    }
    return {party:2,date:addDays(today,1),service:'dinner',time:''};
  }
  function relativeDateLabel(date,today=paris().date){return (date===today?'Aujourd’hui · ':date===addDays(today,1)?'Demain · ':'')+dateLabel(date);}
  function validate(config, draft, contact, now) {
    const errors = {};
    if (!availability(config, draft, now).slots.some(s => s.available && s.time === draft.time)) errors.venue = 'Choisissez à nouveau votre date et un horaire proposé.';
    if (!contact.firstName?.trim() || contact.firstName.trim().length > 80) errors.firstName = 'Indiquez un prénom fictif (80 caractères maximum).';
    if (!contact.lastName?.trim() || contact.lastName.trim().length > 80) errors.lastName = 'Indiquez un nom fictif (80 caractères maximum).';
    if (contact.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) || contact.email.length > 254)) errors.email = 'Indiquez une adresse de démonstration, par exemple camille@example.test.';
    if (contact.phone && (!/^[+\d\s().-]{5,30}$/.test(contact.phone))) errors.phone = 'Vérifiez le numéro ou laissez ce champ vide.';
    if ((contact.notes || '').length > 500) errors.notes = 'Limitez votre demande à 500 caractères.';
    if (contact.accepted !== true) errors.accepted = 'Acceptez les conditions de cet exercice pour continuer.';
    return errors;
  }
  function publicURL(base, slug) {
    if (!venue(slug)) throw Error('Unknown restaurant');
    const url = new URL('reservation/', base.endsWith('/') ? base : base + '/');
    if (!['https:', 'http:'].includes(url.protocol)) throw Error('Invalid public URL');
    url.searchParams.set('restaurant', slug); return url.href;
  }
  return Object.freeze({ venue, examples, paris, validDate, addDays, dateLabel, relativeDateLabel, initialVisit, availability, validate, publicURL });
});
