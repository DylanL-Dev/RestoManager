# RM-RELEASE-03 B3 — Occupants, fusions et permutations

Suivi [#293](https://github.com/DylanL-Dev/RestoManager/issues/293), [#266](https://github.com/DylanL-Dev/RestoManager/issues/266), [#268](https://github.com/DylanL-Dev/RestoManager/issues/268) et [#284](https://github.com/DylanL-Dev/RestoManager/issues/284). Base DEV `de52ab637d6c87f6d34bb500240bf4f0b9a229ab`.

## Contrat DEV

- Le navigateur exige le canal DEV, un profil Restaurant, un instantané frais et la capacité `express_service_v2=1` pour les nouveaux parcours. Le contrat v1 continue de servir les anciennes opérations avec sa capacité. Une confirmation préparée en v2 est refusée si la capacité disparaît. La simulation demeure réservée à DEV.
- Le premier essai de passage Hôtel utilise la garde chambre du #292 et le parcours natif v4 sans exception. Après `ROOM_CONFLICT`, un unique dossier concurrent autorise une proposition de confirmation. L’écran propose de voir ce dossier, d’installer un occupant distinct ou d’annuler. Le reçu privé est borné à 60 secondes et à l’établissement, l’auteur, la chambre normalisée, les couverts, les tables, la révision et le dossier rencontré. Le serveur revalide la fermeture, les tables et le conflit sous verrou avant l’exception explicite. Le navigateur invalide le choix quand le contexte, les données ou la connexion changent. Une réponse incertaine déclenche une relecture sans réécriture automatique.
- Pour une réservation fusionnée, le groupe est celui de son attribution existante. Pour un passage, les groupes de deux à quatre tables viennent des liens de fusion dans la même salle. Chaque membre est vérifié pour l’activité, le maintien, l’occupation physique et le créneau. Le groupe est choisi explicitement. L’installation et le journal sont atomiques. Les opérations de libération et d’annulation déjà en place sont réutilisées.
- Une permutation mono-table accepte de un à huit dossiers, cible comprise. Le serveur rapproche le plan des statuts, versions et affectations en base. Un dossier déplacé doit être accessible depuis la cible par une chaîne de conflits de table avec chevauchement. Le moteur v4 contrôle les affectations finales et les statuts protégés, les fusions, les maintiens, les créneaux et les changements de salle. Les écritures et leur audit partagent une transaction. Les occupants installés et les autres dossiers arrivés restent protégés.
- Le panneau CF27 conserve Lucide, les libellés de constat et les cibles tactiles. Une proposition indique une affectation à vérifier, une permutation, une réorganisation ou une fusion prévue. Les tables sans installation déclarée restent à constater sur place. La publication ne modifie ni routage ni portail public.

## Préflight et reprise

Le catalogue Supabase DEV interrogé en lecture seule a confirmé PostgreSQL 17.11, les RPC B2 et la garde NULL du #292. Le rôle interne peut exécuter la validation native des fusions et le passage v4. Le moteur de placement v4 n’est pas exécutable par `authenticated`. Les RPC B3 sont absentes de DEV.

Après validation distincte du candidat et du plan de sauvegarde DEV, confirmer ces éléments à nouveau et conserver les définitions, ACL, RLS et publications avant intervention. Le SQL B3 est une proposition indépendante. L’opérateur doit vérifier le projet DEV, les empreintes du fichier approuvé et l’état de la sauvegarde avant toute exécution. Le candidat s’arrête si le prérequis de garde #292 manque. Aucune réexécution de B2 ou du correctif chambre n’entre dans cette étape.

- Activation candidate en une transaction. [SQL B3](../../supabase/proposals/rm-ops-engine/express-service-v2.PROPOSAL.sql)
- Repli transactionnel vers B2. Le script retire les droits des deux RPC publiques et leurs points d’entrée privés, rétablit l’annonce des capacités B2, invalide les reçus B3 et recharge PostgREST. Les réservations, affectations et journaux sont conservés. [SQL retour B2](../../supabase/proposals/rm-ops-engine/express-service-v2.ROLLBACK.sql)

## Recette

Exécuter `npm ci`, `npm run test:syntax`, `npm test`, `npm run test:closeout:postgres`, `npm run test:display`, `npm run test:notifications:pwa` et `node tests/supabase/mission3.cjs --express-service-v2`. Le test Supabase local crée des comptes et des établissements fictifs pour Auth, PostgREST et Realtime. Le rush Playwright mesure le solveur et le délai de rendu sur 200 couverts, 15 ou 30 arrivées, plusieurs salles et 45 ou 70 % de tables actives. Les mesures ne constituent pas des résultats sur le service hébergé.

Pour la future recette DEV, utiliser un établissement réservé et des fixtures fictives. Vérifier d’abord l’annonce des deux capacités et la consultation avec Réception. Rejouer en transaction annulée les cas du deuxième occupant, les fusions 2/3/4, les chaînes 3–8, les refus de doublon, de plan indépendant, de maintien et de révision périmée. Vérifier les journaux et les états avant de confirmer le retour B2. La propagation Realtime entre appareils requiert une validation séparée avec deux sessions Restaurant d’un même établissement et une session d’un autre établissement dans un environnement de recette autorisé. Une transaction annulée ne peut pas valider la propagation Realtime après commit.

Les groupes fusionnés ne sont jamais déplacés automatiquement dans ce lot. Les permutations impliquant un dossier installé ou un autre dossier arrivé sont refusées. Aucune migration hébergée, fusion ni publication n’est réalisée dans cette mission.
