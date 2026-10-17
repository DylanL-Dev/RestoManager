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

## Utilisation prévue des outils 2D

- Un clic/toucher sélectionne ; glisser déplace la sélection. « Propriétés » ouvre
  le formulaire détaillé ; double-clic également sur ordinateur.
- Maj/Ctrl/clic ajoute ou retire un objet ; « Sélection multiple » permet les
  touches successives au doigt. Glisser sur le fond avec la souris trace un rectangle.
- Les poignées de coin dimensionnent ; la poignée ronde tourne autour du centre.
- Bouton central souris : déplacer la vue. Deux doigts : zoomer et déplacer.
- Flèches : 10 cm, Maj/flèches : 1 cm. Ctrl/Cmd A : tout sélectionner ; D : dupliquer ;
  Z : annuler ; Maj Z ou Y : rétablir ; Suppr : supprimer après confirmation.
- Le magnétisme peut être désactivé. Les guides montrent les alignements proposés.
- Les collisions restent visibles dans le brouillon ; l'enregistrement exige de
  résoudre les chevauchements des objets solides. Les zones/ouvertures sont superposables.

## Lot B — résultats

Contrôleur de brouillon séparé, sans modifier les opérations de service. Historique
borné à 60 opérations, transformations depuis un état initial commun et rendu des
mouvements coalescé avec requestAnimationFrame. Les poignées conservent leur capture
de pointeur ; un second doigt restaure le geste et sa sélection avant le pincement.
Magnétisme : alignements voisins/salle prioritaires, grille de 10 cm en repli.
La sélection tactile multiple conserve le groupe pendant un glisser ; un toucher
sans déplacement retire un membre. Nouveaux objets placés au centre visible.

18 scénarios unitaires contrôleur couvrent notamment historique, transformations
locales/groupées, pointeurs, sélection tactile, annulation, duplication et suppression
protégée. Le test existant de zoom inclut désormais une translation pure à deux doigts.

Validation navigateur du lot B : **14/14 scénarios** Chromium desktop 1440×1000,
smartphone tactile 390×844 et tablette tactile 820×1180. Rotation, déplacement et
redimensionnement orientés, rectangle/groupe, duplication/suppression, historique,
magnétisme, centre visible, dimensions de salle, migration, rechargement, annulation
et associations de réservations validés sans erreur JavaScript. Les propriétés
conservent les dimensions et angles libres sans arrondi. Les profils tactiles sont
une émulation Chromium, pas une certification Android matérielle.

## Lot C — rendu 3D

Three.js **0.180.0 (r180)** et OrbitControls sont inclus localement avec leur licence
MIT. Seuls les modules minifiés nécessaires sont chargés au premier affichage 3D.
Pas de CDN, image générée ni texture externe. Le modèle conserve les centres X/Z,
les dimensions, les couleurs et le signe de rotation correspondant aux coordonnées
2D. Les empreintes du mobilier reprennent les dessins 2D, assises comprises.

Maillages instanciés et géométries/matériaux partagés ; éclairage simple, pas d'ombres
coûteuses, ratio pixels plafonné et rendu à la demande. Numéros via CanvasTexture
128×64. Caméra orbitale, zoom/déplacement, réinitialisation et synchronisation du
brouillon. Indisponibilité ou perte WebGL : retour 2D sans toucher aux données.

Première validation : 7/7 scénarios navigateur avec WebGL logiciel SwiftShader.
Avec 100 tables, avant et après six cycles de modifications : **104 appels de dessin,
3 géométries, 100 textures, 4 programmes**, sans accumulation. Ces résultats mesurent
la structure et la stabilité des ressources ; ils ne certifient pas les FPS sur téléphone.

Après revue visuelle : numéros conservés à 26 pixels CSS de hauteur et cadrage
adapté au format portrait. Les tests mesurent leur projection à l'écran ; ils
vérifient aussi l'absence de boucle de rendu au repos. Les 7 scénarios navigateur
3D et 13 scénarios de modèle/matrices/imports Three.js passent.
