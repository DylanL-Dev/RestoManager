# RM-RELEASE-03 B — Livraison groupée Coup de feu

Suivi [#266](https://github.com/DylanL-Dev/RestoManager/issues/266) et [#284](https://github.com/DylanL-Dev/RestoManager/issues/284). Le candidat reprend #289 sur DEV `374f556` et conserve le design 2027.4 et les icônes Lucide.

## Reprise de la PR #289

À `d76551e`, 9 workflows réussissaient et 9 reproduisaient la même assertion. Le suffixe du cache ne conservait plus le marqueur du démarrage `boot27v1`. Le commit `6075210` le remet en fin de version, avec un identifiant de cache neuf. Les tests et les workflows existants sont conservés. Les 18 [contrôles de #289](https://github.com/DylanL-Dev/RestoManager/pull/289/checks) ont réussi sur ce commit.

## Parcours et permissions

- Le client exige l’hôte et le canal DEV autorisés, la capacité serveur `express_service=1`, le rôle Restaurant et un instantané synchronisé. La simulation conserve ses règles.
- L’installation utilise l’identifiant de la table choisie et la révision de l’instantané. Après rafraîchissement, un aperçu modifié exige une nouvelle sélection. Le serveur vérifie la révision sous le verrou d’établissement, le statut, le jour de service et l’attribution sous verrou.
- Une permutation ou un déplacement d’un seul dossier attendu autour de la table choisie utilise le moteur v4 dans une transaction. Le dossier déjà physiquement installé reste bloquant. Les permutations complexes, les fusions d’installation et les réaffectations seules dépassent ce périmètre. La libération et l’annulation d’une fusion sont couvertes par #286.
- Le passage utilise la RPC habituelle et ses règles d’horaire, d’occupation et de chambre. L’écran utilise l’identifiant renvoyé par le serveur. Une réponse perdue exige une vérification dans le plan et ne déclenche aucune nouvelle écriture automatique.
- La libération et l’annulation réutilisent le contrôle d’auteur, la version, le délai serveur de huit secondes et le journal privé de #286. Les écritures utilisent les signaux existants de révision et Realtime.

## Préflight hébergé DEV en lecture seule

Le catalogue confirme la présence du calendrier hebdomadaire du passage, de ses droits pour `resto_service_writer` et de la publication Realtime des révisions. Le rôle interne n’est ni superutilisateur ni exempté de RLS. Les nouvelles RPC et les capacités `express_service` et `quick_release` sont absentes. La requête a porté sur le catalogue et les droits.

## Candidat SQL et retour arrière

`node scripts/prepare-rm-release-03b.cjs` assemble sur la sortie standard la proposition de moteur v4, #286 et les deux RPC Express en une seule transaction. La dernière étape retire aux clients l’accès direct aux nouveaux composants du moteur pour imposer la vérification de révision. Les RPC historiques utilisées par le mode complet conservent leurs droits. La recette vérifie l’annulation transactionnelle sur une erreur injectée, la double application côté jetable et l’absence de droit CREATE permanent.

Pour le contrôle préalable de ChatGPT, relever les définitions et ACL du catalogue DEV, conserver les valeurs actuelles de `public.service_sync_state_v1()` et revoir les politiques et droits des nouvelles fonctions. La livraison groupée reprend les commits de #289. Si cette PR est fusionnée séparément avant la livraison du lot, actualiser la base du lot et rejouer les contrôles.

L’activation sur DEV requiert des autorisations distinctes de fusion, de déploiement et d’exécution du SQL. Une fois autorisée, vérifier le frontend en consultation, puis appliquer le SQL atomique revu et confirmer les deux capacités et le rechargement du schéma PostgREST. Recetter avec des comptes et des données de test dédiés, sur deux appareils, et vérifier le journal. Pour revenir en consultation, retirer les capacités et les droits d’exécution des nouvelles RPC publiques, puis vérifier la propagation de la révision. Conserver les états déjà enregistrés, les journaux de libération et de placement et les fonctions historiques.

## Commandes de recette isolée

- `npm ci`, `npm run test:syntax` et `npm test`.
- `npm run test:display` pour le parcours Chromium et les droits simulés, et `npm run test:notifications:pwa` pour le cache.
- `node tests/postgres/rm-ops-quick-release.cjs` pour le SQL, les conflits, la permutation à deux réservations et les passages. Cette recette fait partie du job RM-012 standard existant.
- `node tests/supabase/mission3.cjs --express-service` pour les parcours sur Auth, PostgREST et Realtime locaux. Cette commande utilise des conteneurs jetables et les ports de bouclage. La procédure existante `tests/supabase/flatten-realtime.sh` permet une image à couche unique lorsque le stockage Docker est limité.

La recette locale du lot a passé 500 tests unitaires. PostgreSQL a validé la permutation atomique avec deux comptes, le refus d’une seconde écriture, l’installation et les passages hôtel et extérieur. Le test complet avec Auth, PostgREST et Realtime a couvert la permutation, l’installation, le passage, la libération et l’annulation. Un troisième compte a vérifié l’isolation d’établissement. Les trois sessions testent les rythmes et dimensions d’un téléphone, d’une tablette et d’un ordinateur dans Chromium.

Aucune fusion, publication ou migration hébergée n’est réalisée au titre de cette préparation.
