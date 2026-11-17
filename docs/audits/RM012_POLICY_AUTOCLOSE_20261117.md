# RM-012.1 — début du suivi et clôture automatique sûre

Le propriétaire a signalé six notifications antérieures à la livraison. Il demande de commencer le suivi au **17/11/2026**, puis confirme : « Oui, clôturer automatiquement si tout est finalisé ».

Branche `fix/rm012-start-date`, issue de DEV `8924ff1`, sauvegarde distante `backup/rm012-dev-before-start-date-20261117`. V3/MAIN et Supabase PROD restent hors périmètre. Le correctif vise le clone Render DEV déjà autorisé.

Activation DEV après validation : migration distante `20261117163056`, date de début 17/11/2026, clôture automatique active. Lecture vérifiée sur DEV : aucune alerte antérieure, journée sélectionnée au 17/11 et historique conservé. Le paquet `c93579f` a passé les sept workflows ; [PR #176 et preuves de publication Render](https://github.com/DylanL-Dev/RestoManager/pull/176). Les impacts ci-dessous ont été présentés avant application.

## Comportement

- La date de démarrage est enregistrée côté serveur, par établissement. Les installations existantes démarrent le 17/11/2026 ; les nouveaux établissements démarrent à leur création, selon Europe/Paris.
- Les dates précédentes disparaissent de la découverte par défaut et des notifications RM-012. Elles ne sont ni régularisées ni clôturées automatiquement. Le sélecteur de date et les archives conservent l’accès volontaire à l’historique.
- Un travail **Supabase Cron toutes les cinq minutes** vérifie les journées suivies ayant de vraies réservations. Il fonctionne application fermée, sans dépendre d’un onglet ou d’un téléphone.
- Une clôture automatique exige la fin effective calculée par les horaires existants et les fins de réservation, tous les statuts finalisés et aucun maintien temporaire actif. Aucun client n’est déclaré absent, aucune table n’est libérée et aucun statut de réservation n’est modifié par cette tâche.
- Les journées avec des oublis restent ouvertes et gardent une seule alerte RM-014. Une journée finalisée peut afficher brièvement « clôture automatique prévue » jusqu’au prochain passage du travail ; l’alerte disparaît après archivage effectif.
- Les chemins manuel et automatique partagent le même calcul, les mêmes verrous, l’unicité restaurant/date et l’insertion atomique archive/journal. Le travail saute un restaurant occupé par une mutation en cours, sans bloquer le service.
- La trace automatique est explicitement **système**, avec heure réelle, date de service séparée, `close_mode=automatic`, `closed_by=NULL` et `actor_kind=system`. Aucun employé fictif ni identité humaine empruntée n’est créé.
- Les comptes applicatifs ne peuvent appeler le travail privé, modifier le réglage de démarrage ni fabriquer une trace système. La commande historique publique en mode automatique reste refusée ; seule la tâche interne autorisée effectue les clôtures automatiques.

## Migration préparée et impacts avant application partagée

Fichier : [`20261117151709_rm012_activation_and_automatic_close.sql`](../../supabase/migrations/20261117151709_rm012_activation_and_automatic_close.sql), créé avec Supabase CLI 2.122.1, sans identifiant de fichier inventé.

| Objet | Impact |
| --- | --- |
| `service_regularization_policy` | Nouvelle table avec date de départ, activation automatique et date réelle d’activation ; une ligne par établissement, lecture Restaurant sous RLS forcée, aucun droit d’écriture applicatif |
| Réglage initial | Installation DEV existante : début explicite au 17/11/2026 et clôture automatique activée, conformément à la demande ; aucune modification d’horaires |
| Nouveaux établissements | Déclencheur interne pour créer le réglage à la date de création ; signaux de révision pour synchroniser les changements |
| Archives | `closed_by` devient nullable pour les clôtures système ; une contrainte maintient l’auteur obligatoire pour une clôture manuelle |
| Journal | Ajout `actor_kind`, anciens acteurs conservés comme `user`, auteur nullable uniquement pour une clôture système ; politiques d’insertion et contrainte empêchent l’usurpation par le writer |
| Fonctions | Filtrage serveur des journées/alertes selon la date de début ; routine d’archivage commune et travail privé exécuté sous l’administrateur, inaccessible à anon/authenticated/writer/service_role |
| Ordonnancement | Activation de l’extension **pg_cron**, déjà disponible/préchargée sur DEV mais non activée au précontrôle ; un seul travail nommé `rm012-safe-automatic-close`, planifié `*/5 * * * *` |
| Exécution | Lot de 100 journées admissibles maximum, attente évitée par verrous essayés, timeout SQL de 25 secondes dans la commande du travail ; erreurs sans noms/notes clients |
| Données métier | Aucun rattrapage, création de réservation, modification de statut ou d’horaire pendant la migration ; les clôtures ultérieures concernent uniquement de vraies journées admissibles depuis le début du suivi |

La transaction est atomique et la réapplication conserve les réglages existants et le travail unique. L’installation exige le socle RM-012 et pg_cron disponible. Les modifications de contraintes/fonctions peuvent prendre des verrous DDL ; choisir une fenêtre adaptée avant application partagée. La tâche conserve son historique dans `cron.job_run_details`. Aucune clé secrète ni service Render supplémentaire n’est nécessaire.

La politique concerne la découverte et l’automatisation RM-012. Elle ne supprime pas les réservations anciennes et ne modifie pas les contrôles existants de disponibilité, d’occupation ou les droits Réception.

## Validation isolée

PostgreSQL 17 et pg_cron **1.6.4**, comme DEV, dans un conteneur `--network none`. Le paquet Debian est épinglé et vérifié par SHA-256. L’ordonnanceur est suspendu par la configuration de test uniquement, puis explicitement réactivé pour prouver une vraie exécution sans navigateur, avec trace de réussite et absence de doublon.

Commandes :

```sh
npm run test:syntax
npm test
npm run test:closeout:postgres
RM012_POLICY=1 BROWSER_ARTIFACTS=test-results/rm012-policy-regression npm run test:closeout:postgres
node tests/postgres/rm012-policy.cjs
npm run test:closeout:browser
```

Le workflow RM-012 reproduit les deux états du serveur, les nouveaux scénarios Cron et les sept largeurs/deux rôles. Les scénarios ciblent le démarrage inclusif, l’absence de rétroactivité, les tables/attentes/arrivées, les maintiens, la protection de la journée en cours, minuit/DST, les droits, l’audit système, les courses entre actions manuelles et automatiques, les verrous occupés et le travail réel.

Résultats locaux : **229 tests Node**, **149 fichiers de syntaxe**, **15 groupes SQL/Cron supplémentaires**, **29 groupes RM-012 existants sur le nouveau schéma**, **23 groupes Playwright** aux sept largeurs/deux rôles, tous réussis. Les [preuves JSON](preuves/rm012-policy-20261117/validation.json) décrivent le paquet testé. CI complète à vérifier dans la PR avant publication.

Captures avec données fictives : [mobile](preuves/rm012-policy-20261117/automatic-closed-390.png) · [tablette](preuves/rm012-policy-20261117/automatic-closed-768.png) · [PC](preuves/rm012-policy-20261117/automatic-closed-1440.png). Elles montrent le début du suivi et l’archive automatique ; les captures de revue et de thème sombre sont dans le même dossier. Aucune donnée fictive dans un projet partagé ; aucun appel d’écriture de test sur DEV/PROD.
