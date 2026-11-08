# RestoManager — V3 connectée à Supabase

**RestoManager** est une application web responsive de gestion des réservations, des salles, des tables et du service en restauration. Elle s'adresse aux équipes **Restaurant** et **Réception**, avec une base commune Supabase, des mises à jour entre postes et une logique de placement assisté.

> **Statut au 8 novembre 2026 :** branche d'intégration V3, avec Missions 2 et 3 intégrées. Cette version reste distincte de la branche officiellement utilisée au restaurant. Les scénarios automatisés et la base d'intégration ont été contrôlés ; ils ne remplacent pas la recette terrain sur appareils physiques et comptes réels.
>
> **« Intelligence » = algorithmes métier explicables**, pas intelligence artificielle générative. Les recommandations sont calculées à partir des capacités, horaires, réservations, blocages, fusions et règles de service.

## Accès et branches

| Environnement | Lien / référence | Rôle |
| --- | --- | --- |
| **Application V3 intégration** | [Ouvrir RestoManager sur Render](https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html) | Tests et validation de la version connectée |
| **Branche Full Clone** | `feature/v3-supabase-full-clone` | Développement / intégration Supabase |
| **Version opérationnelle préservée** | `feature/refonte-service-responsive-v3` | Ne pas modifier pendant les travaux V3 connectée |
| **Branche principale Git** | `main` | Ne pas fusionner sans décision explicite |

`index.html` et `service-v3.html` redirigent vers `v3-connected.html` sur Full Clone. L'interface possède cinq écrans de navigation : **Tables, Réservations, Ajouter, Service, Gestion**. Le même produit s'adapte au téléphone, à la tablette et à l'ordinateur ; il peut être utilisé en mode application web installable selon les possibilités du navigateur.

## Fonctionnalités métier

### Réservations et clients

- Création de réservations pour **clients de l'hôtel** ou **clients extérieurs**, avec date, heure, nombre de couverts, durée, table ou fusion compatible.
- Informations complémentaires : **numéro de chambre**, nom, notes de service, allergies et demandes particulières. La chambre et l'identité du client sont distinctes ; un client extérieur dont le nom est numérique ne devient pas automatiquement un client hôtel.
- Modification, annulation, recherche par informations disponibles, historique et statuts de service.
- **Confirmation et maintien temporaire** des tables pendant la saisie : une disponibilité provisoire n'est pas une réservation définitive.
- **Contrôle anti-doublon** des créneaux incompatibles, des tables occupées et des chambres hôtel déjà réservées sur des horaires chevauchants.
- **Édition concurrente sécurisée (CONC-01)** : jeton `edit_version`, refus d'une modification fondée sur une fiche périmée, conservation de la saisie et rechargement explicite.
- **Changement de chambre fiable (FUN-02)** : la modification est persistée dans `hotel_room` et reste cohérente pour les contrôles, recherches et notifications.
- Notes et allergies historiques inchangées préservées ; les nouvelles saisies au-delà des limites applicatives sont signalées, pas tronquées silencieusement.

### Salles, tables et service

- Gestion des salles et des tables : numéros, capacités, activation, déplacement autorisé et contrôles de cohérence.
- Vue **Tables du service** avec états textuels : libre, attendu, arrivé, présent/installé et indisponible, selon le contexte.
- Filtres par salle et état, fiches de table et actions contextuelles.
- **Passages sans réservation** : installation rapide d'un groupe sur une table compatible, avec autorisations réservées à l'équipe Restaurant.
- Enregistrement de l'arrivée, installation, libération de table après départ et contrôles avant changement de statut.
- **Fusions autorisées de 2 ou 3 tables** : vérification des salles, capacités, conflits et affectations ; aucune extension à 4 tables ou plus n'est annoncée comme disponible.
- Suivi des clients encore attendus, des retards et des arrivées à venir.
- **Clôture de service partagée via Supabase**, séparée des anciennes clôtures locales. Les services passés sont protégés contre les modifications non autorisées.

### Horaires, affluence, recherche et rapports

- Paramétrage des services midi/soir et de la **durée par défaut d'occupation** (options de 30 à 180 minutes dans l'interface).
- Vérification de la cohérence entre heures souhaitées, horaires autorisés, durée et disponibilité réelle.
- Tableau d'affluence : couverts prévus, occupation, arrivées et **retards qui restent visibles lors du changement de créneau**.
- Suggestions de créneaux moins chargés et indication de la pression de service.
- Recherche et suivi des réservations, des tables occupées et des clients à libérer.
- Historique et statistiques dérivés des statuts, avec export **PDF** côté navigateur ; le chargement du générateur PDF peut nécessiter une connexion réseau.

## Intelligence algorithmique : comment ça fonctionne

Les recommandations ne sont **ni aléatoires ni produites par un modèle d'IA**. Elles exploitent des règles métier reproductibles.

| Mécanisme | Données analysées | Décision / résultat |
| --- | --- | --- |
| **Compatibilité des tables** | Couverts demandés, capacités min./max., tables et salles actives | Écarte les tables inadaptées au groupe |
| **Contrôle des créneaux** | Début, fin, durée, réservations bloquantes, tables installées | Refuse les chevauchements impossibles ; une table physiquement occupée reste indisponible jusqu'à libération |
| **Maintiens temporaires** | Table, intervalle, expiration, compte et clé d'opération | Empêche deux collaborateurs d'obtenir simultanément la même disponibilité |
| **Classement des propositions** | Capacité suffisante, taille de la combinaison, disponibilité | Privilégie une table ou fusion de capacité adaptée et **le moins de tables possible**, plutôt qu'une très grande table inutilement mobilisée |
| **Pression des tables** | Nombre de tables compatibles encore disponibles au créneau | Indicateurs normal, chargé, critique ou complet ; calcul informatif sans attribution |
| **Lissage d'affluence** | Couverts déjà prévus dans une fenêtre horaire et limite conseillée | Signale un créneau surchargé et propose des horaires moins fréquentés |
| **Placement intelligent** | Réservation ciblée, affectations, conflits, clients déjà installés, maintiens | **Simule** une chaîne limitée de réattributions avant validation ; n'impose aucun déplacement d'un client déjà installé |
| **Affluence et retards** | Heures prévues, arrivées réelles, statut du service et fuseau Europe/Paris | Sépare couverts attendus, arrivés, installés et en retard, même après le passage à l'heure suivante |

**Détails du lissage d'affluence.** Le calcul utilise une fenêtre horaire d'une heure, une limite conseillée exprimée en pourcentage de la capacité (60 % par défaut pour cet indicateur) et recherche des alternatives par pas de **15 minutes**, jusqu'à deux heures autour de l'heure demandée. Il classe jusqu'à **trois propositions** selon le nombre de couverts déjà attendus, puis leur proximité horaire. Ce seuil est un **outil d'aide à la décision**, distinct des conflits bloquants et de la disponibilité serveur.

**Détails du placement intelligent.** Le module `smart-placement-engine.js` simule des changements de tables sans écrire en base. Il ne réorganise pas automatiquement les clients installés, les passages et les fusions considérés non déplaçables. Sa recherche est volontairement bornée (profondeur / nombre de modifications limités) ; les modifications acceptées sont ensuite **revérifiées et appliquées atomiquement côté serveur** par la fonction prévue. Une suggestion n'est donc pas une garantie d'enregistrement avant confirmation.

**Important :** l'application n'invente pas des tables libres lorsque la synchronisation est incertaine ; elle distingue l'horaire hors service, la capacité incompatible, le restaurant complet, le maintien d'un collègue, les conflits de chambre et les erreurs de lecture ou de réseau.

## Synchronisation, données et autorisations

- **Supabase Auth** pour les comptes d'équipe, avec rôles **Restaurant** et **Réception** et permissions différentes.
- **PostgreSQL / RLS** : restriction des accès au restaurant du collaborateur, et vérifications complémentaires au niveau des fonctions SQL.
- **Synchronisation Realtime** des changements entre postes autorisés.
- **Snapshots cohérents** : lecture paginée des sept collections métier (réservations, affectations, salles, tables, maintiens, fusions, horaires), révision contrôlée avant/après et publication groupée seulement si l'ensemble est valide.
- **Reconnexion et erreurs temporaires** : nouvelles tentatives espacées, états de chargement ou de consultation seule, sans présenter des données anciennes comme une confirmation.
- **Récupération après réponse ambiguë** : consultation de la clé technique d'une opération déjà engagée, afin de ne pas créer deux réservations lorsqu'une réponse de confirmation est perdue.
- **Transactions et verrous** côté base pour l'édition, la confirmation, les tables, les fusions et certaines opérations de configuration.

Les évolutions des Missions 2–3 sont décrites dans [la documentation technique](docs/mission3-validation-integration.md) et [le compte rendu de migration Supabase](docs/mission23-migration-2026-11-08.md). Le diagnostic de l'ancien écran Tables vide et sa correction figurent dans [le diagnostic d'affichage](docs/v3-table-display-diagnosis.md).

## Validation automatisée

La branche d'intégration contient les suites suivantes :

```bash
npm ci
npm run test:syntax
npm test
node tests/v3-reservation-audit.cjs
npm run test:display
npm run test:mission2:browser
npm run test:mission3:browser
npm run test:mission3:postgres
npm run test:mission3:supabase
```

Les tests navigateur utilisent Playwright/Chromium. Les scénarios PostgreSQL et Supabase complets nécessitent leur environnement **isolé** et leurs prérequis (notamment Docker, selon le runner). Ne pas pointer ces tests vers une base partagée contenant de vraies réservations.

**Dernière validation avant cette mise à jour documentaire :** la [CI de la PR n°6](https://github.com/DylanL-Dev/RestoManager/actions/runs/42477984341) a terminé avec **4 jobs réussis** : unités, PostgreSQL isolé, navigateur simulé et Supabase local isolé. Les comptes rendus de la mission indiquent 25 fichiers de tests unitaires, 54 scénarios PostgreSQL, 2 800 assertions moteur et des contrôles HTTP/RLS/Realtime. Ces preuves ne garantissent pas à elles seules la compatibilité de tous les téléphones, de toutes les tablettes ou d'une journée de service réelle.

### Développement local

Prérequis : Node.js **22 ou plus**, Python 3, et un compte Supabase autorisé pour tester les fonctions partagées.

```bash
npm ci
npm run serve
```

Ouvrir `http://localhost:8000/v3-connected.html`. L'interface connectée refuse les modifications lorsque ses capacités SQL ou sa synchronisation ne sont pas confirmées.

## État du produit et limites actuelles

- L'isolation de deux restaurants fictifs a été testée, mais **l'inscription et le provisionnement commercial multi-restaurants ne constituent pas encore un parcours SaaS complet**. Les 23 tables (22 actives) constatées sur le projet d'intégration sont des données de cet établissement, **pas un modèle à imposer aux futurs clients**.
- Les **fusions de 4 tables et plus** ne font pas partie de la couverture validée.
- Certains réglages transversaux, notamment les règles universelles de clôture après minuit pour tous types d'établissements, restent à généraliser. Les horaires configurables ne signifient pas que toutes les règles de clôture sont personnalisables.
- Les interruptions réseau ne doivent pas être interprétées comme une prise de réservation hors ligne garantie.
- Les performances sous forte charge, les appareils physiques et une reprise intégrale d'un environnement hébergé exigent encore une recette dédiée.
- L'ancien éditeur graphique **2D/3D**, Three.js et le catalogue de mobilier ont été retirés de Full Clone. **Les tables et salles opérationnelles, leurs affectations et la compatibilité de lecture des anciennes données ne sont pas supprimées.**

## Sécurité et publication : points de vigilance

1. **Éviter de publier tout le dépôt comme racine statique Render.** Le site d'intégration utilisait `publishPath: ./` le 8 novembre 2026 ; un processus de construction devrait ne rendre publics que les assets nécessaires à l'interface, et exclure `supabase/`, `tests/`, `docs/`, les scripts internes et les dépendances de développement.
2. Examiner régulièrement les [avertissements de sécurité Supabase](https://supabase.com/docs/guides/database/database-linter) : fonctions `SECURITY DEFINER` exécutables par les utilisateurs authentifiés (à justifier fonction par fonction), protection contre les mots de passe compromis et permissions RLS.
3. Mesurer les performances en volume et vérifier les index utiles aux requêtes fréquentes.
4. Toute modification SQL, migration, rollback ou fusion affectant le service partagé doit être **coordonnée** et autorisée. Ne pas réactiver des anciennes RPC d'édition sans contrôle de version pour contourner un problème.
5. La version officielle du restaurant et `main` restent distinctes de Full Clone.

## Prochaines évolutions envisagées

- **Onboarding d'un nouvel établissement vierge** : création de ses salles, tables, capacités, rôles et horaires propres, sans données imposées.
- Réglages de clôture et changement de journée adaptés aux établissements fermant après minuit.
- Amélioration et mesure des recommandations de placement sur des services chargés, sans compromettre la sûreté transactionnelle.
- Recette terrain structurée sur smartphone, tablette et ordinateur, puis tests de charge et suivi de disponibilité.
- Industrialisation d'une publication statique ne contenant que les fichiers destinés au public.

---

**Principe directeur : une réservation confirmée doit être unique, une table réellement disponible, et une modification simultanée ne doit jamais effacer silencieusement le travail d'un collègue.**
