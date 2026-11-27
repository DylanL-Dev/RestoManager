# Écran de démarrage 2027 — documentation d'intégration

Version : **1** · Fichiers : `rm-boot.css` (≈ 8 Ko) et `rm-boot.js` (≈ 2 Ko)

Cette couche habille l'écran « Vérification de la session… » (`#integrationLoading`) de `v3-connected.html` et anime sa disparition.

## 1. Principe

- **Présentation uniquement.** Le texte de statut, la logique de session et le moment où l'écran disparaît ne changent pas. C'est toujours `v3-connected-auth.js` qui retire `#integrationLoading` et rend la page visible (`integrationGate`).
- **Aucune donnée lue ni écrite**, aucun appel réseau.
- `role="status"` et le texte d'origine sont conservés. Les éléments ajoutés sont décoratifs (`aria-hidden`), sauf le message « connexion lente ».

## 2. Installation

Dans `v3-connected.html` :

1. Dans `<head>`, **après** la ligne `rm-ux-pack.css` :
   ```html
   <link rel="stylesheet" href="rm-boot.css?v=1">
   ```
2. **Juste après** la balise fermante de `<div id="integrationLoading">…</div>` (et non en fin de page), **sans `defer` ni `type="module"`** :
   ```html
   <script src="rm-boot.js?v=1"></script>
   ```
   Le script doit s'exécuter avant que l'authentification retire l'écran. Il est minuscule et ne bloque rien.
3. Ajouter les deux fichiers au cache de `sw.js` et augmenter la version du cache.
4. Rien d'autre à modifier. La CSP actuelle convient : fichiers de même origine, aucun script en ligne, aucune image externe.

## 3. Ce que voit l'utilisateur

| Moment | Effet | Utilité |
|---|---|---|
| 0 – 0,7 s | La pastille du logo apparaît avec un léger rebond, puis le toque se **dessine trait par trait**. | Identité de la marque ; montre tout de suite que l'app répond. |
| 0,26 – 0,5 s | « RestoManager », le statut et la barre montent en fondu, l'un après l'autre. | Lecture dans l'ordre. |
| En continu | Une **barre de progression indéterminée** glisse sous le statut. Deux halos verts dérivent très lentement en fond. Un halo doux « respire » autour du logo. | Signale que le chargement est en cours, sans fausse promesse de pourcentage. |
| Après 8 s | « La connexion prend plus de temps que prévu… » apparaît. | Évite de croire que l'app est bloquée lors d'un réseau lent (Wi-Fi d'hôtel). |
| Fin | Quand l'app retire l'écran, une copie s'efface en **s'ouvrant depuis le logo** (ouverture circulaire de 0,68 s), le logo grossit et disparaît. | Transition continue vers l'app au lieu d'une coupure sèche. |

- **Thèmes** : fond vert profond, plus sombre avec `html[data-theme="dark"]` ou un système en mode sombre (sauf `data-theme="light"`).
- **Mouvement réduit** (`prefers-reduced-motion: reduce`) : aucune animation. La barre reste fixe, le message de lenteur apparaît sans effet et la sortie est un simple fondu de 0,2 s.
- **Navigateurs sans `@property`** : la sortie devient un fondu, sans erreur.

## 4. Fonctionnement technique

- `rm-boot.js` ajoute dans `#integrationLoading` :
  - `.rm-boot-mark`, qui contient le toque en SVG en ligne (le même tracé que `asset/img/restomanager-chef-white.svg`) ;
  - `.rm-boot-bar` ;
  - `p.rm-boot-slow`.
- Un `MutationObserver` surveille le parent de l'écran. Quand l'écran est retiré, il ajoute une copie `.rm-boot-exit` (sans `id`, `aria-hidden`), puis la supprime à la fin de l'animation (1 s au maximum).
- Toutes les règles visent `#integrationLoading` ou `.rm-boot-exit`. Aucun autre élément de l'app n'est touché.

## 5. Vérifications

1. Recharger `v3-connected.html` : logo dessiné, barre animée, puis ouverture vers l'app. Console sans erreur.
2. Régler le réseau sur « Slow 3G » dans DevTools : le message de lenteur apparaît après 8 s.
3. Activer « Réduire les animations » dans le système : aucun mouvement, fondu simple.
4. Session expirée : la redirection ou l'écran de connexion se comporte comme avant.
5. Vérifier que les tests existants passent : l'écran porte toujours le même texte et le même `role="status"`.
