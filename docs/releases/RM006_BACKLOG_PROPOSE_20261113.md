# RestoManager — RM-006 : backlog proposé et critères de recette

**Statut : CANDIDATS NON VALIDÉS — aucun développement RM-006 engagé.**
Ce document complète `docs/RM006_ROADMAP_PROPOSAL_20261113.md` ; les corrections et fonctionnalités déjà livrées dans RM-005 ne sont pas redemandées.

## Justification

Le retour utilisateur du 13/11/2026 confirme **8/8 scénarios RM-005 réussis sur DEV**. La prochaine version doit se consacrer aux bénéfices nouveaux, non aux écrans de créneaux/planning/fusions que RM-005 vient de valider.

## Décision proposée par lot

### RM-006.A — Fiabilité et supervision (priorité haute)

**A1 — Journal d'audit des actions de réservation.**
- **Problème à confirmer :** l'équipe veut savoir « qui a créé/modifié la réservation » ; distinguer métadonnées déjà présentes et informations non disponibles.
- **Avant de coder :** cartographier triggers, journaux, `created_by` / `updated_by`, droits d'accès et conservation.
- **Acceptation proposée :** après création ou modification par Réception/Restaurant, l'auteur, son rôle, la date/heure Europe/Paris et le type d'action apparaissent aux rôles habilités ; refus de consulter l'historique d'un autre restaurant.
- **Non demandé :** création d'un fichier d'identifiants sensibles ou ouverture des logs à tous les comptes.

**A2 — Assistance et suivi des signalements.**
- **Problème à confirmer :** les signalements résolus ne doivent plus gonfler le compteur « ouverts » et les menus/notifications de l'assistance doivent se fermer correctement.
- **Avant de coder :** vérifier l'état actuel des correctifs déjà livrés et les droits Root.
- **Acceptation proposée :** statut « résolu » stable après actualisation et synchronisation ; compteur = tickets réellement ouverts ; compte Réception/Restaurant ne voit ni détails internes Root ni autres établissements.

**A3 — PWA, cache et reconnexion.**
- **Objectif :** éviter les formulaires agissant sur des snapshots périmés, erreurs silencieuses et anciennes versions mobiles.
- **Acceptation proposée :** lors d'une coupure, aucune opération en écriture ne réussit artificiellement ; les brouillons sont préservés ; à la reconnexion l'état réel est rechargé ; retour d'erreur compréhensible et ressources actualisées.
- **Test :** Android PWA, tablette, PC, 2 comptes concurrents, horloge de minuit Paris, réseau interrompu puis restauré.

### RM-006.B — Ergonomie et accompagnement (priorité moyenne)

**B1 — Tutoriel guidé Réception / Restaurant.**
- **Audit préalable :** vérifier les composants didacticiel existants ; ne pas reconstruire un tutoriel déjà présent.
- **Acceptation proposée :** tutoriel activable, désactivable et repris sans masquer les actions métier ; parcours séparé par rôle ; aucune réservation de test écrite en PROD.

**B2 — Pilotage du service.**
- **Audit préalable :** indicateurs déjà implémentés en RM-005 (affluence, capacité physique, retards, arrivées) et réclamations terrain.
- **Acceptation proposée :** liste des arrivées attendues/prêtes à installer accessible sans confusion entre couverts et tables ; état « présent » et « libéré » visible immédiatement ; aucune alerte obsolète après modification sur autre appareil.
- **Non demandé :** refaire les cartes de créneaux et les boutons de couverts validés dans RM-005.

### RM-006.C — Qualité transverse (priorité moyenne/basse)

**C1 — Performance mobile et accessibilité.**
- **Avant de coder :** mesurer l'ouverture des vues sur Android, tablette et desktop ; consigner mémoire/cache et tests de navigation au clavier.
- **Acceptation proposée :** aucun débordement sur 390px, commandes tactiles suffisamment grandes, focus visible, accès aux erreurs et actions principales avec lecteur d'écran.
- **Aucun chiffre de performance cible n'est inventé** avant mesure initiale.

## Prérequis communs

- Mettre RM-005 en production selon le protocole vérifié avant de commencer une livraison RM-006.
- Faire accepter les intitulés A1–C1 et leur priorité au propriétaire.
- Créer des issues/branches RM-006 seulement après accord explicite sur le périmètre.
- Ne pas modifier MAIN, RestoManager-V3 ou Supabase PROD pour préparer RM-006.
- Garder ses PR distinctes de toute PR de publication RM-005.

## Arbitrages restant à demander au propriétaire
1. L'audit d'auteur des réservations doit-il être visible par les deux équipes ou réservé au responsable ?
2. Le module Assistance requiert-il une notification dans l'application ou seulement un compteur fiable ?
3. Le didacticiel doit-il être proposé automatiquement à la première connexion ou lancé manuellement ?
4. Quel écran du pilotage du service reçoit le plus de remarques terrain ?

**Statut final : proposition prête à être discutée, mais ni validée ni commencée.**
