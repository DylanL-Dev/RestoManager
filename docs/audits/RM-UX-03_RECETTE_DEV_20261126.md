# RM-UX-03 — Recette Premium Experience sur DEV

Recette Codex du 26 novembre 2026, suivie dans [#242](https://github.com/DylanL-Dev/RestoManager/issues/242). GitHub DEV et le [déploiement Render](https://dashboard.render.com/static/srv-dbm8o15g1s2s73cemju0/deploys/dep-dc3cr7vlot8c739q7ol0) correspondaient à `608fba98536653de2825a869873bd23c6896cbc0`. Le diff depuis `40016d9` (#244) contient uniquement la documentation consolidée par #254. Le HTML de connexion servi sur Render correspond à celui du dépôt.

La [PR #244](https://github.com/DylanL-Dev/RestoManager/pull/244) couvre la connexion premium, la progression d’inscription, les états de chargement et le récapitulatif de réservation publique. Elle harmonise aussi les cibles tactiles de Gestion et la transition de thème des liens ouvrant une fiche de réservation.

## Résultats observés

| Surface | Vérifications et résultat |
| --- | --- |
| Render DEV | 18 affichages Chromium à 390, 768 et 1440 px. Connexion, inscription, formulaire Créateur, redirection de l’accès équipe sans session, portail démo et état de repli du portail connecté. Zéro débordement horizontal et zéro violation axe WCAG A/AA détectée dans ces états. Les appels à Supabase ont été bloqués dans ce passage. |
| Connexion et inscription | 6 largeurs pour la connexion avec SDK Auth simulé, 7 pour l’inscription. Visibilité du mot de passe, clavier, mouvement réduit, étapes, variantes hôtel et indépendant, validation et absence de création de compte dans l’aperçu. |
| Créateur | 5 largeurs, console authentifiée sur jeu fictif, navigation, icônes, thèmes et axe. Le formulaire externe et la console locale ont été revus séparément. |
| Restaurant et Réception | 14 passages de Gestion (7 largeurs × 2 rôles), 17 contrôles Tables et 110 scénarios d’interface équipe. Navigation clavier, droits visibles de chaque rôle, lecture des états de table, arrivées, actions métier et conservation des brouillons lors des conflits ou de la reconnexion simulée. Motion réduit et contrastes contrôlés sur les états couverts. |
| Portail | 16 scénarios de démonstration sur la base DEV. Sur PostgreSQL jetable, parcours client et annulation réussis aux 7 largeurs, confirmation d’une demande de groupe par le Restaurant et lecture Réception à 390, 768 et 1440 px. |
| PWA | 12 contrôles de cache, de mise à jour et de brouillons, à la racine et sous `/RestoManager`. |

Le premier passage de la suite équipe a échoué sur la position de défilement après fermeture d’une confirmation par Échap (386 px au lieu de 217 px). Les 110 scénarios ont réussi au passage suivant. Le défaut de défilement reste à reproduire de façon stable avant correction. Le passage Supabase Realtime isolé a d’abord été bloqué par l’espace disque de Docker lors de l’installation de l’image Realtime. Les scénarios simulés valident le comportement de l’interface et des brouillons. Le suivi GitHub consigne séparément les résultats du transport Realtime. L’authentification réelle sur Render et les appareils physiques restent à vérifier.

## Défaut corrigé sur la branche Codex

Dans le portail connecté, changer le nombre de couverts déclenche une requête de disponibilité. En tabulant vers le champ date pendant l’attente, le clavier revenait au nombre de couverts à la réponse. La reproduction à 390 px est passée de `visitDate` → `party-3` sur DEV à `visitDate` → `visitDate` sur la branche de travail.

Le rendu restaure le contrôle utilisé au moment de la réponse si celui-ci est recréé dans le formulaire. Quand le clavier se trouve déjà au pied de page, il y reste. Le scénario automatisé retarde deux réponses pour couvrir les deux cas. La disponibilité et les opérations de réservation utilisent les mêmes appels.

## Prochain lot proposé dans #242

Prioriser côté terrain la permutation atomique [#265](https://github.com/DylanL-Dev/RestoManager/issues/265), puis instruire le parcours d’accueil du [mode Coup de feu](https://github.com/DylanL-Dev/RestoManager/issues/268) avec Restaurant et Réception. Les critères métier restent dans leurs tickets. Tester notamment sur tablette de pupitre avec deux collègues, des affectations provisoires et un état physique incomplet.

Pour RM-UX-03, proposer un lot ciblé sur la continuité du parcours client. À 390 px, les blocs de présentation de l’inscription et du portail occupent une grande partie du premier écran. Rapprocher la première action utile du début de page, harmoniser la priorité visuelle de l’action principale et vérifier le clavier sur les retours asynchrones (chargement, indisponibilité, vérification et erreur). Conserver les repères vert sapin, Lucide et les transitions brèves. Le correctif de focus constitue le premier changement testable du lot.

Critères proposés pour ce lot : première action utile visible à 390 × 844 px, champs et cibles tactiles vérifiés à 390, 768 et 1440 px, parcours au clavier et à 200 % de zoom, mouvement réduit, cohérence du récapitulatif après changement de date ou d’horaire et conservation de la saisie en cas de réponse tardive. Réserver les fichiers partagés avec #259/#260 avant de coder la suite.
