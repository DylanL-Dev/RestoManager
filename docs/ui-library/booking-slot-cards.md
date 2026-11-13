# Bibliothèque d’interface RestoManager — cartes de créneaux

Statut : **DEV uniquement**, référence de présentation validable sur téléphone/tablette/ordinateur.  
Source CSS réutilisable : `ui/booking-slot-cards.css`  
Logique et pictogrammes : `service-v3-booking-director-choices.js`, bibliothèque Lucide locale `lucide-local.js`.

## Règles de design

- Cartes claires et compactes. Fond blanc et bordure fine, **jamais** de double halo vert.
- 2 colonnes sur mobile, 3 sur tablette, 4 sur grand écran.
- Heure lisible, puis état de table présenté par icône **Lucide** et texte.
- Marqueur bas discret (vert / ambre / rouge / gris) selon l’état connu.
- Sélection : bordure verte fine et coche Lucide en haut à droite.
- Affluence des arrivées : petit indicateur chaleureux avec Lucide `activity`; ne jamais confondre ce seuil avec le nombre de places libres.
- « À vérifier » reste un **état inconnu** quand les données ne sont pas prêtes ; il ne doit pas devenir fictivement « Disponible ».
- Horaire : 4 cartes initiales sur mobile et bouton « Voir les autres horaires ».
- Couverts : sélection compacte, avec le mode personnalisé pour les groupes.
- Comportement : cartes non disponibles toujours explicables; aucune modification de la logique de réservation, des droits ou du calcul des capacités.
- Icônes locales accessibles sans connexion réseau externe : `check-circle-2`, `alert-circle`, `alert-triangle`, `x-circle`, `circle-help`, `activity`, `check`, `chevron-down`, `chevron-up`.

## Critères de contrôle

1. Sur téléphone, les cartes restent côte à côte, ne débordent pas, et l’heure est lisible.
2. Un seul contour apparaît sur le créneau sélectionné, avec une coche.
3. Une réservation affichant « Forte affluence » ne devient pas « Complet » si des tables compatibles subsistent.
4. En l’absence de synchronisation, la carte affiche « À vérifier » sans attribuer de fausse place libre.
5. Les icônes sont générées via la bibliothèque locale Lucide, y compris en PWA.
6. Le formulaire, les capacités, la synchronisation et les droits Réception/Restaurant sont inchangés.

Ne pas promouvoir sur V3/MAIN sans validation explicite du propriétaire du projet.
