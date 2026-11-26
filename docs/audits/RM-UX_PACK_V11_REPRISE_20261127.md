# RM-UX — Reprise du pack v11 (27/11/2026)

## Références et périmètre
- Demande du propriétaire : reprendre la PR #279 après interruption de Codex.
- Source intacte : `57a8034f9dbdfd95e1dd8d478fffe7f7aedc9985`. Base DEV relevée : `a8d7c2e7641654800445c621d3bee60801ca8ea5`.
- Issue #242. Branche de reprise distincte. Pas de modification de la branche Codex, #269, V3, MAIN, Supabase ou des workflows.

## Diagnostic initial
- 16/18 workflows réussis sur #279 ; 486/486 unitaires.
- Playwright mocks : Mission 3, 768 px, assertion de même ligne des cartes recommandées (run 45909394295). Animation rm-pop déplace et redimensionne chaque carte avec un délai différent : cause plausible, à confirmer en CI.
- Public booking : axe color-contrast sur :root à 390 px, run 45909394467. Les journaux d'origine ne détaillent pas le nœud ni les couleurs.
- Les états arrived et seated étaient confondus dans les statistiques et les notifications. Le compteur animé réécrivait le texte des KPI natifs. Les fonds de sélection devenaient transparents pendant le mouvement des pastilles.

## Correctifs candidats
- Carte recommandée : animation de contour sans translation, échelle ni fondu ; maintien des dispositions flex natives. Fond natif des sélections conservé, pastilles décoratives à contour.
- Contrastes de textes renforcés et suppression du fondu des panneaux métier ; notices métier non repliées automatiquement. Contrastes en mode sombre traités sur les éléments ajoutés.
- Statistiques selon les états canoniques : completed/released terminés, seated installés déclarés (y compris les dossiers précédents non libérés), arrived dans les attendus ; prochaine heure non passée. Résumé lié au snapshot et au contexte de session ; pas de valeur fictive injectée dans le dashboard. Le graphe historique précise le périmètre des données chargées. Le record automatique est suspendu tant que la couverture historique n'est pas prouvée.
- Animation KPI uniquement visuelle, sans écriture de textContent. Notifications de départ ne prétendent pas qu'une table est libre ; pas de faux installé. Réinitialisation des notifications du pack au changement de contexte.
- Cache et deux URLs de ressources versionnés 11.1. CSP, rôles, scripts métier, moteur et migrations inchangés. Écritures Express toujours interdites.
- Tests ciblés ajoutés : compteurs, changement de tenant, KPI, animation cartes. Assertion axe d'origine conservée ; journal enrichi en cas d'échec.

## Validation
Compilation JavaScript du pack et du test via le moteur JS réussie. Les tests Node et navigateur n'ont pas été exécutés localement dans cette session. CI GitHub à exécuter sur le candidat, puis revue visuelle smartphone/tablette/PC, clair/sombre et deux rôles. Le diagnostic contraste reste une hypothèse tant que la suite axe ne passe pas. Aucun déploiement ni fusion.

## Finalisation de la PR #280

La CI de `653db4a4fe0a83f41cef66a9d2dbb39e2356c730` a terminé à 16/18. Le contrôle des icônes a trouvé deux éléments Lucide non rendus au moment de la vérification après clôture automatique dans [RM‑012](https://github.com/DylanL-Dev/RestoManager/actions/runs/45910768427). L’insertion du panneau résout désormais ses icônes immédiatement. L’audit [RM‑015.2](https://github.com/DylanL-Dev/RestoManager/actions/runs/45910768185) a relevé des rapports de contraste de 1,01 à 1,55 sur trois textes de réservation après le passage au thème sombre à 768 px. Les cartes gardent le fond du thème et le retour visuel de survol conserve son ombre. Les deux assertions de CI sont conservées.

La carte du tableau de bord adapte son graphique de quatorze jours et ses compteurs à sa propre largeur. Les sous-titres de Passages et les horaires du suivi Réception ont un contraste renforcé dans les deux thèmes. Les filtres natifs masqués gardent une largeur de 1 px dans la barre des tables pour éviter le débordement à 768 px. Les effets du pack restent ponctuels et respectent la préférence de mouvement réduit. La palette utilise Lucide local, retrouve le focus à la fermeture et attend une décision sur le brouillon avant de lancer une recherche. Réception accède au suivi du service en consultation. Le Mode Coup de feu connecté conserve son verrou d’écriture.

Les tests utilisent Chromium, des comptes et établissements de recette, et des bases jetables. Deux tentatives locales de la suite Realtime ont échoué au téléchargement de l’image Docker épinglée faute d’espace disque. Les workflows GitHub isolés couvrent Auth, RLS, Realtime et la synchronisation des réservations Web. Les résultats du candidat et le déploiement Render DEV sont rattachés au [suivi #242](https://github.com/DylanL-Dev/RestoManager/issues/242).
