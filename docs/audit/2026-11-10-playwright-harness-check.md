# RM-AUDIT-01 / Étape 3 : tests navigateur isolés

Contrôle non destructif des corrections de harnais DEV Clone : fermeture du didacticiel, établissement au libellé complet, routage local Supabase. L'action GitHub exécute les parcours Mission 2 et Mission 3 avec Chromium simulé. Cette PR ne change pas le métier.

Nouvelle exécution CI : runner Ubuntu 24.04 épinglé après l'incompatibilité du dernier runner Ubuntu avec Playwright 1.56.1.

Deuxième passe : sélecteur réel .restoTourLater et exécution des deux suites même en cas d'échec isolé.

Troisième passage : fermeture du didacticiel également au démarrage de chaque contexte Mission 3.

Quatrième passe : suppression de la seconde assertion obsolète sur le nom complet `#teamVenue`.

Cinquième passe : test adapté au bouton Actualiser déplacé dans le menu de compte sur mobile, sans modification de l'interface.

Sixième passe : assertions des actions de réservation adaptées au menu « … », avec vérification positive du rôle Restaurant et refus côté Réception.
