# RM-OPS — Libération directe et annulation sécurisée, révision 2

Suivi #266 et #284. Base DEV 1eb4ead. Aucune migration appliquée.

## Préflight hébergé (28 novembre 2026)

Lecture du catalogue Supabase DEV uniquement, sans données clients : fonctions de statut, verrou d'établissement, version de réservation UUID, affectations, blocages, RLS et publication Realtime présents. Le rôle interne resto_service_writer est NOLOGIN, NOSUPERUSER et NOBYPASSRLS ; postgres hébergé n'est pas superuser. Le rôle interne n'a pas CREATE sur private. Le journal de régularisation RM-012 omet les changements pendant un service ouvert ; le signal de révision ne constitue pas un journal nominatif permanent.

## Proposition

- Contrat RPC quick_release_v1 et capacité quick_release=1 inchangés. La capacité n'est disponible qu'après installation SQL distinctement autorisée.
- Transfert de propriété via permission CREATE temporaire, dans la transaction, sans privilège permanent. Si CREATE existait avant, sa présence est préservée.
- Verrou d'établissement puis verrous de tables triées. La libération réutilise la transition existante. Les prédicats d'établissement sont explicites, le compte doit être actif et fb_admin.
- Annulation : même auteur, même version et ensemble de tables, huit secondes côté serveur, refus si réoccupée/désactivée ou si le contexte des réservations actives ou blocages actifs a changé. Choix prudent : un changement non incompatible peut également invalider l'annulation ; une réservation future inchangée n'empêche pas l'annulation.
- Nouveau journal privé séparé des rapports de clôture : auteur, établissement, identifiant de réservation, tables, opération, versions et heure. Ajout uniquement pour le rôle interne, RLS forcée ; aucun accès client. La politique de consultation administrative et de conservation de ce journal reste à définir avant production.
- Aucun changement des règles d'installation, des migrations existantes, du frontend, de la simulation, des workflows ou de la production.

## Recette et GO/NO-GO

Le scénario PostgreSQL jetable est rattaché à la suite RM-012 standard (pas aux variantes policy/RM015). Il teste rollback transactionnel, double application avec rôle non-superuser, absence de privilège CREATE permanent, refus inter-établissements et par rôle, concurrence, expiration, réoccupation, nouvelle attribution, blocage actif, fusions 2 et 4 tables, maintien des réservations futures inchangées et journal en service ouvert. Résultats à confirmer par la CI ; pas d'exécution de ce nouveau candidat sur le serveur hébergé.

Avant application DEV : CI sur le SHA exact, contrôle de la recette SQL dans les logs, sauvegarde du schéma et plan de retour arrière revus, GO distinct du propriétaire. La proposition n'est pas encore une migration versionnée.

Retour arrière à préparer/valider : restaurer la définition hébergée de public.service_sync_state_v1 pour retirer la capacité, retirer les droits EXECUTE des nouvelles RPC puis les supprimer si nécessaire. Ne pas supprimer le journal d'audit ni revenir en arrière sur les états de réservations déjà validés. Recharger le schéma PostgREST et vérifier le retour au parcours mode complet. Cette procédure ne doit pas être exécutée sans accord.

Après activation DEV : tests isolés avec comptes et données fictifs, deux appareils, refus et annulation, contrôles Realtime et sécurité. Aucun accès Supabase PROD. La promotion V3/MAIN et toute migration de production nécessiteraient une décision distincte.
