# RM-014 — Retour de recette : « Voir les nouveautés »

Signalement propriétaire sur Render DEV le 16/11/2026. Branche `fix/rm014-release-history-navigation` depuis DEV `c73f953`. V3, MAIN et Supabase sont hors périmètre.

## Défaut reproduit

Le premier accès à l’historique stockait une clé de cache dans le conteneur partagé. Après retour aux notifications, ce conteneur gardait la clé, mais contenait des cartes de notifications. Un nouveau clic « Voir les nouveautés » pouvait changer le titre sans reconstruire le véritable historique : le cache vérifiait seulement la clé et la présence d’enfants, pas la vue affichée.

Le test ajouté échoue avant correction sur l’absence des vraies entrées `.rmNcHistoryEntry`, sans erreur JavaScript. [Trace avant correction](preuves/rm014-news-fix/before.log). Ce parcours n’était pas assez couvert par les tests précédents, qui ouvraient essentiellement l’historique depuis le pied du centre.

## Correction

Le conteneur distingue explicitement la vue notifications de la vue historique. Le cache de l’historique n’est réutilisé que si le conteneur affiche effectivement cet historique. Le rendu stable lors d’une synchronisation reste conservé. Les marqueurs lu/non lu, filtres, défilement et focus ne sont pas réinitialisés inutilement.

Nouvelle version réelle `2026.11.16-rm014.1`, avec anciennes notes conservées. Les deux scripts modifiés et le cache PWA sont versionnés pour que les navigateurs récupèrent le correctif. Les onglets restés sur la version précédente pourront proposer une mise à jour réellement publiée, avec le même garde RM-011-A ; aucune actualisation forcée ni perte de saisie.

## Validation locale

- 14 combinaisons : Restaurant/Réception × 360/390/430/768/1024/1440/1920.
- Clic réel sur la carte des nouveautés non lue avec filtre « Non lues », retour au flux puis nouveau clic sur la carte lue, fermeture/réouverture de la cloche et accès depuis Gestion. Chaque fois : vraies entrées de l’historique présentes, cartes de notifications absentes, titre/focus corrects.
- Suites de cycle de vie (24 groupes), PWA réelle/multi-onglets (12 groupes), syntaxe et tests Node réussies. Les six workflows GitHub ont confirmé le paquet avant fusion DEV (PR #161).
- Captures après clic sur la carte : [mobile](preuves/rm014-news-fix/history-from-card-fb_admin-390.png), [tablette](preuves/rm014-news-fix/history-from-card-fb_admin-768.png), [PC](preuves/rm014-news-fix/history-from-card-fb_admin-1440.png). Les vues Réception sont également conservées dans le même dossier.

Tous les essais utilisent le frontend réel avec Auth/service en mémoire et réseau externe bloqué. Aucune donnée de restaurant réelle, migration, configuration ou dépendance modifiée. Le correctif est publié sur Render DEV et sa disponibilité est vérifiée ci-dessous.


## Publication DEV vérifiée

- PR [#161](https://github.com/DylanL-Dev/RestoManager/pull/161), fusion DEV `bb2ed4bf074eb9b6917c6dc697fadd54bc2dec3a`, six workflows verts ; V3/MAIN inchangées.
- Déploiement `dep-dbtj12ei0phs73dgbk10` **LIVE**, fin `2026-11-16T16:34:36Z`, version `2026.11.16-rm014.1`.
- Dix-sept ressources répondent en HTTP 200 avec empreinte identique aux fichiers corrigés/testés ou protégés ; entrée et manifeste canoniques, ainsi que le lien de prévisualisation, vérifiés séparément après propagation du cache CDN. [Preuve du déploiement](preuves/rm014-news-fix/render-live.json). Aucun parcours authentifié sur données réelles n’est prétendu ; les clics sont validés dans le harnais isolé sur ces mêmes ressources.
- [Ouvrir la version corrigée](https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html?preview=rm014.1). Le compte rendu ne vaut pas validation utilisateur du clone.
