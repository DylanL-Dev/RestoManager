# RestoManager — RM-005 : inventaire frontend avant transfert ciblé

Date : **14 novembre 2026**.
**Statut : audit uniquement. AUCUN frontend RM-005 transféré à MAIN ou V3.**

## Résultat du comparatif HTML de chargement

- `v3-connected.html` MAIN référence **45** ressources JS/CSS.
- `v3-connected.html` DEV référence **54** ressources JS/CSS.
- **9 imports supplémentaires** sur DEV sont **absents des fichiers MAIN** (existence vérifiée par GitHub).
- **19 imports communs** ont un paramètre de version/cache différent. Cela n'implique pas que tous les fichiers aient changé ; il faut comparer leur contenu et leurs dépendances avant toute promotion.
- **Aucun import supprimé** dans la liste DEV comparée à MAIN.

### Neuf ressources RM-005 indispensables, pas encore chargées sur MAIN

| Ordre HTML DEV | Ressource | Rôle à vérifier |
|---:|---|---|
| 2 | `ui/booking-slot-cards.css` | Cartes visuelles de créneaux |
| 10 | `service-v3-fusion-builder.css` | Fusion des tables |
| 11 | `service-v3-management-categories.css` | Gestion et catégories/salles |
| 34 | `service-v3-weekly-schedule.css` | Éditeur de planning hebdomadaire |
| 36 | `service-v3-weekly-schedule.js` | Logique de planning sept jours |
| 44 | `service-v3-slot-capacity.js` | Calcul de capacité des créneaux |
| 45 | `service-v3-arrival-preview.css` | Aperçu instantané des arrivées |
| 46 | `service-v3-booking-director-choices.js` | Choix des créneaux/formulaires |
| 47 | `service-v3-arrival-preview.js` | Affichage des arrivées en direct |

### Imports déjà présents mais versionnés différemment

`lucide-local.js`, `service-v3-reservation-list-rm005.css`,
`service-v3-passage-cards.css`, `resto-errors.js`,
`reservation-engine.js`, `service-v3.js`, `reservation-edit.js`,
`service-v3-reservations.js`, `service-v3-walkin-fast.js`,
`service-v3-table-choices.js`, `service-v3-passage-cards.js`,
`service-v3-table-admin.js`, `service-v3-screens.js`,
`service-v3-fusions.js`, `service-v3-shifts.js`,
`service-v3-select-picker.js`, `reception-service-overview.js`,
`v3-connected-auth.js`, `v3-supabase-booking.js`.

Attention : `service-v3-reservation-list-rm005.css`, `service-v3-passage-cards.css` et `service-v3-passage-cards.js` **existent déjà dans MAIN** et sont chargés. Certains statuts d'ajout du comparatif de commits reflètent le graphe Git divergent, **pas** l'absence du fichier sur MAIN. Leur contenu doit être comparé, pas rajouté comme « nouveau module ».

## Blocage de transfert brut de DEV

DEV et MAIN ont divergé lourdement. DEV possède `restomanager-env.js` et des variantes de connexion/login qui ne doivent pas forcer un environnement de test en production. Il faut préserver les règles côté MAIN :
- La cible Supabase PROD actuelle de `supabase-service-bridge.js` et de `supabase-login.js`.
- Les comptes, droits Réception et Restaurant déjà publiés.
- L'ordre des scripts, les versions de cache PWA et les dépendances entre modules.
- Les réservations, chambres, fusions et modifications simultanées gérées par les fonctions SQL réellement publiées.
- Ne jamais faire un merge global `feature/v3-supabase-full-clone` → MAIN ou un copier-coller aveugle du HTML DEV.

## Ordre conseillé de préparation frontend (sans publication)

1. Dépendances : compare réel des blobs MAIN/DEV et des appels RPC ; conserver les adaptations PROD des dernières branches.
2. Design : charger les 9 ressources réellement absentes de MAIN avec leurs styles et icônes requis ; ne pas déclarer qu'un changement de cache-version est un changement fonctionnel à lui seul.
3. Interactions : adapter `reservation-engine.js`, `service-v3-shifts.js`, réservation, passage et fusion **aux migrations serveur effectivement approuvées**.
4. Droits : Réception ne choisit pas/manipule pas les tables ; Restaurant gère la salle. Client Hôtel par défaut ; nom extérieur obligatoire ; aucun faux état « arrivé ».
5. Recette : Node, navigateur Réception/Restaurant, mobile/tablette/PC, reconnexion/offline, planning samedi/dimanche, DST, forte affluence, nombre de couverts et arrivées.
6. Préparer une PR frontend **distincte et draft**, sans la fusionner tant que la phase SQL et la sauvegarde/restauration ne sont pas validées.

**Point métier :** le samedi sans service du midi décrit par l'utilisateur aujourd'hui ne vaut pas instruction de fermer tous les samedis. Aucun calendrier de PROD n'a été changé pour ce motif.

**État de publication : GO impossible tant que la sauvegarde/restauration des données PROD et la recette sur copie complète du schéma PROD manquent.**
