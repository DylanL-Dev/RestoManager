# RM-005 — contrôle final des horaires de passage (DEV uniquement)

**Root cause** : les fonctions de passage et de réservation contrôlaient les horaires historiques `lunch_end=14:30` au lieu du calendrier par jour.

## Corrections déployées en base DEV
- `20261113153000_rm005_walkin_weekly_server_dev.sql` : fonction privée de vérification Europe/Paris et mise à jour des 7 chemins serveur, autorisations originales conservées.
- `20261113164500_rm005_weekly_helper_writer_grant_dev.sql` : autoriser seulement le rôle SQL interne `resto_service_writer` à utiliser ce helper, sans rendre l'accès direct possible aux rôles `anon` et `authenticated`.
- Aucun changement des réservations existantes, du schéma PROD, de MAIN ou de V3.

## Tests réellement exécutés sur Supabase DEV
- 10/10 frontières temporelles correctes : vendredi 16:30 ouvert / 16:31 fermé, samedi et dimanche 17:30 ouverts / 17:31 fermés ; autre restaurant fermé.
- RPC authentifiée Restaurant : `install_walkin_group_v3` **réussie** pendant vendredi midi prolongé ; transaction **ROLLBACK**.
- RPC authentifiée Réception : `reception_booking_v3` **réussie** vendredi 15:50, samedi 16:00 et dimanche 16:00 ; toutes en **ROLLBACK**.
- Vérification après tests : zéro réservation `TEST RM005 ... ROLLBACK` conservée.
- Contrôles d'accès : `anon` et `authenticated` n'ont pas accès directement au helper interne ; `resto_service_writer` l'a.

## Vérification de régression
CI Node, Playwright, PostgreSQL et Auth/RLS/Realtime local à rejouer ici.
**Ne pas fusionner ni publier MAIN / V3 avant validation terrain sur Render DEV.**