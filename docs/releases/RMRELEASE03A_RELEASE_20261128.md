# RM-RELEASE-03 A — Candidat graphique V3 puis MAIN

Suivi #284. Source DEV publiée sur Render : `1eb4ead8015f3c71dde8773b2cf5c130d225eec2`. Version cible commune `2026.11.28-rmrelease03a-main`.

## Périmètre

- Pack UX v11.1 (#280), ressources CSS/JS reprises avec leurs blobs Git exacts.
- Démarrage #281 et écran animé #285, ressources reprises à l'identique. La page conserve sa barrière d'authentification ; seul le retrait du statut visuel est ajouté au chemin déjà autorisé. Préchargement du module, fond d'accueil et repli sans JS.
- Correction d'affichage Lucide dans le rapport de clôture, PWA et annonce des nouveautés.
- Tests ciblés du pack, du statut avant autorisation et des assets de production. Les anciens contrôles d'intégrité restent actifs ; un nouveau manifeste SHA-256 remplace la référence au manifeste précédent dans le test de la livraison active.

## Garde-fous

Aucune fusion globale DEV. Routage Supabase, dépendances, CSP, portail client ouvert selon la configuration existante, Créateur et moteur de réservations conservés. Le Coup de feu et sa simulation sont exclus du lot A ; le lot B reste soumis à validation métier et serveur. Les anciens fichiers de vérification mobile ne sont pas modifiés : les tests ciblent la véritable page responsive v3-connected.html. Aucune migration, aucun workflow modifié, aucun accès Supabase PROD.

## Publication

V3 base ef08adb40acb0a31bb1c7f846a34993f1d0e4fc3, MAIN base 409ba8e26dc3776535e5d82efb582462ff558da0. Sauvegardes des bases avant fusion. Candidats distincts ; vérification des SHA, contrôles GitHub, GO direction V3 avant fusion puis GO MAIN distinct. Aucun déploiement effectué à la rédaction. La recette de l'interface en service réel reste à effectuer après publication.
