# RM-005 — QA du correctif des installations après extension des horaires

**Code contrôlé :** `440c620beaf8891d196d6c10198c738cadc1a15b` sur DEV.

## Incident de terrain
Le vendredi midi a été ouvert jusqu’à 16 h 30 et les services samedi/dimanche jusqu’à 17 h 30 sur le planning DEV ; `install_walkin_group_v3/v4` et certains contrôles de réservation utilisaient encore les colonnes historiques (fin du midi à 14 h 30).

## Correctif DEV
- Migration **appliquée exclusivement à Supabase DEV**, jamais à PROD : `supabase/migrations/20261113153000_rm005_walkin_weekly_server_dev.sql`.
- Helper interne `private.restaurant_service_open_at_v1` (jour et heure Europe/Paris, configuration par établissement, mode fermé si planning manquant), non exposé aux rôles clients.
- Sept fonctions serveur concernées conservent `SECURITY DEFINER`, contrôles de rôle, verrous, conflits, limites de capacité ; elles utilisent le calendrier partagé.
- Message de formulaire « Planning hebdomadaire » et durée réelle au lieu du texte figé 90 minutes.

## Preuves SQL en lecture seule post-migration
- Vendredi 15:30/16:30 autorisés, 16:31 fermé.
- Samedi 16:30/17:30 autorisés, 17:31 fermé.
- Dimanche 16:30 autorisé, 18:00 fermé, 19:15 autorisé.
- Autre restaurant fermé refusé.
- **10 scénarios / 10 PASS**, sept fonctions serveur / sept utilisent le helper.

## Recette
Exécuter Node, Playwright, Mission 3, PostgreSQL local et Supabase isolé sans accès PROD. Les tests automatisés ne remplacent pas un essai de passage réellement installé par le compte Restaurant sur Render DEV.

**Ne pas fusionner. Ne pas publier MAIN/V3.**