# Mission 3 — éditeur 2D/3D

Branche : `codex/mission-3-floor-editor-2d-3d`. Base : `52890a2`.

## Audit avant modification

Tous les fichiers suivis ont été examinés (scripts, HTML, CSS, tests ; logo PNG inventorié).
Application statique sans bundler ni dépendance déclarée ; stockage local conservé.
Le code fourni contient une vue 2D SVG avec zoom, déplacements, formulaires de
rotation/dimensions, salles, sols et brouillon. Aucun Three.js ni code 3D.
Les quatre suites Node initiales passent. Chromium démarre avec 21 tables sans
exception JavaScript ; seule une requête favicon répond 404.

Problèmes reproduits :

- Le pincement ne déplace pas la vue à écart constant ; pointeurs des objets non isolés.
- Placement automatique et validation des tables ignorent les murs et autres obstacles.
- Positions en pourcentages du coin de l'enveloppe, dimensions en mètres ; marge du
  placement automatique en pourcentage donc variable selon la taille de salle.
- Un plan invalide replie silencieusement sur les valeurs par défaut et peut ensuite
  provoquer la disparition d'associations table/réservation à la normalisation.
- Réservations/historique JSON illisibles sont remplacés puis réécrits au démarrage.
- Numéro de table extrait du libellé : `T26A` / `T27 · Terrasse` deviennent `NaN`.
- Les échecs localStorage des réservations ne bloquent pas tous les messages de succès.
- Absence de sélection multiple, poignées, historique et magnétisme.

40 rotations à 90° par formulaire conservent déjà le centre (erreur < 1e-15 m) :
ce parcours n'est pas déclaré défectueux. SAT et distance entre rectangles orientés
existent et seront réutilisés. Identifiants globaux, protections des tables liées,
salle principale et brouillon sont déjà présents et seront conservés.
Aucun curseur personnalisé bleu/blanc trouvé dans la base fournie.
`admin-auth.js` n'est pas chargé par la page ; sa réintégration est hors mission.

## Plan annoncé avant changements

A. Modèle v4 : centres en mètres, migration exacte v1-v3 sans écriture au chargement,
   conservation des données brutes, géométrie et limites orientées, collisions,
   adaptation du rendu, protections stockage et associations. Tests et commit.
B. Contrôleur 2D : sélection, poignées, transformations de groupe, historique >=30,
   duplication/suppression, clavier, magnétisme et gestes. Tests et commit.
C. Three.js local versionné, rendu à la demande, caméra orbitale et synchronisation,
   repli 2D, nettoyage ressources. Tests et commit.
D. Responsive, propriétés accessibles, catalogue, contrôles de salle, captures,
   scénarios navigateur, documentation des limites et PR sans fusion.

Les mesures FPS Android/tablette matérielles doivent être effectuées sur appareils
réels ; une émulation Chromium ne suffit pas à les certifier.

## Lot A — résultats

Format v4 : `x/y` désignent le centre en mètres ; dimensions et angles sont inchangés.
Migration par copie, lecture sans écriture, backup `restomanager_floor_plan_v1_backup_before_v4`
avant première sauvegarde d'un ancien plan. Plan illisible : avertissement visible et
édition/enregistrement bloqués ; aucune réécriture du contenu brut. Les références
numériques des réservations sont conservées même si une table manque au catalogue.

Collisions SAT et distances conservées, enveloppes orientées et limites centralisées.
Les zones, portes, fenêtres et luminaires acceptent des superpositions intentionnelles ;
les autres meubles sont des obstacles. Le placement automatique utilise une marge
physique de 12 cm et prend en compte l'architecture. Les collisions n'effacent pas
les anciens plans : elles sont signalées lors d'une nouvelle validation.

Validation : suites Node métier/stockage/éditeur passantes ; Chromium, huit rotations
90° puis sauvegarde/rechargement v4 sans exception ni mouvement du centre. Revue
indépendante de 1 000 migrations sur deux salles : identifiants, numéros et centres
conservés, source inchangée. Aucun changement de l'hébergement Pages.
