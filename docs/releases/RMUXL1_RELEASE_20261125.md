# RM-RELEASE-UX-L1 — Fiche de livraison candidate (L1-A, Restaurant / Réception)

**25/11/2026 — candidate, non publiée.** Issue #261 · tableau #258. Préparée par Claude Code (relais de Codex).

## Références figées

| | SHA |
| --- | --- |
| Source UX (DEV, LIVE sur Render DEV) | `608fba98536653de2825a869873bd23c6896cbc0` |
| Base V3 | `1633a8a6aa0c3fc0f09326694d4db027fe089bc1` |
| Base MAIN | `d852c19eb8b37554f435729f494856daf79ab9ae` |
| Arbres V3 et MAIN | identiques (`5699cea7…`) |

## Méthode

1. **Attribution :** pour chaque fichier, V3 est comparé à DEV **juste avant les PR UX** (`2001be0` pour Restaurant/Réception, `e575591` pour le Créateur, `dbd2ec0` pour la connexion). Quand ils sont égaux, tout l'écart V3 → DEV vient de l'UX.
2. **Report :** seul le patch UX `2001be0 → 608fba9` est appliqué à V3, en fusion à trois voies. Les conflits portent uniquement sur des valeurs propres à DEV et sont résolus en faveur de la production :
   - métadonnées de version et de canal de `v3-connected.html` ;
   - nom du cache de `sw.js` ;
   - CSS du lien RM-018.
3. **MAIN :** le même commit est repris par cherry-pick sur `d852c19`. L'arbre obtenu est **identique** à celui de la candidate V3, donc les tests valent pour les deux.

## Contenu (L1-A)

| Fonction | MAIN/V3 | DEV | PR | Dépendances | Statut |
| --- | --- | --- | --- | --- | --- |
| Animations discrètes Restaurant/Réception (`service-v3-motion.js`), respect de `prefers-reduced-motion` | — | ✔ | #240, #243 | Aucune (JS/CSS local) | **GO candidate** |
| Frise des arrivées partagée, jauges d'occupation réelles, graphique de charge des créneaux, conseil de service, raccourcis vers les fiches | — | ✔ | #243 | Données déjà lues (snapshots) ; **aucune RPC, aucune colonne nouvelle** | **GO candidate** |
| Retour ciblé des notifications | — | ✔ | #243 | — | **GO candidate** |
| Cibles tactiles de 44 px et contrastes (salles, thème) | partiel | ✔ | #244 (partie service) | — | **GO candidate** |
| Connexion premium (`login.html`) | ancienne | ✔ | #244 | **Fichier protégé PROD** (empreinte du manifeste), icône absente de V3 | **HOLD → lot L1-B** (accord explicite requis) |
| Créateur : animations et menu (#238/#239) | — | ✔ | #238, #239 | Coque Créateur RM-020.1–020.4 (`creator-shell.*`), supervision, assistance RM-019 | **HOLD** (lot Créateur distinct) |
| Portail de réservation premium | RM-015.13 | ✔ | #244 | Portail PROD actif, Edge Function | **HOLD** (recette portail dédiée) |
| Inscription premium (RM-017) | — | ✔ | #244 | Migrations RM-017, Auth, SIRET | **EXCLUDE** |
| Lien des mentions RM-018 | — | ✔ | RM-018 | Pages légales non validées | **EXCLUDE** |
| SDK local et CSP (#259/#260) | — | non fusionné | — | Lot S1 | **EXCLUDE** |

**Fichiers modifiés :**
- application : `service-v3-motion.js` (nouveau), `service-v3.css`, `service-v3.js`, `service-v3-reservations.js`, `reception-service-overview.js`, `service-v3-reminders.js`, `service-v3-notifications.css`, `service-v3-management-categories.css`, `v3-connected.html`, `sw.js` ;
- version et suivi : `app-release.json` (version `2026.11.25-rmuxl1-main` et note « Nouveautés »), `docs/releases/RMUXL1_RELEASE_MANIFEST_20261125.json` ;
- tests UX importés et adaptés au cache PROD.

**Non touchés (vérifié) :** `restomanager-env.js`, `supabase-login.js`, `supabase-service-bridge.js`, `creator-auth.js`, `login.html`, `service-v3-screens.js`, `package-lock.json` (empreintes du manifeste identiques), aucun SQL, aucun workflow, `reservation/runtime.json` (portail ouvert conservé).

## Relecture sécurité (Claude)

- **Auth / RLS / SQL :** aucun fichier de connexion, aucune migration, aucune fonction serveur. Aucun nouvel appel `rpc`, `from`, `fetch` ni WebSocket dans le code ajouté.
- **Injection :** aucun nouveau `innerHTML`, `insertAdjacentHTML`, `eval` ni `new Function`.
- **Cache / PWA :**
  - nouveau nom de cache, donc l'ancien est nettoyé à l'activation lorsqu'aucun onglet n'en dépend ;
  - `service-v3-motion.js` est précaché ;
  - pas de `skipWaiting` automatique : l'actualisation reste protégée par le contrôle des saisies en cours.
- **CSP :** non concerné (RM-SEC-04 reste dans le lot S1). Le nouveau code n'ajoute aucun script inline.
- **Données :** les jauges et la frise lisent les réservations déjà synchronisées ; capacité, droits et règles de réservation sont inchangés (fichiers métier non modifiés).

## Tests réalisés sur la candidate (arbre identique V3 / MAIN)

- `test:syntax` : 176 fichiers, 0 échec ; `npm test` : **232/232**, dont RM-014 production (empreintes des fichiers protégés, version cohérente, dépendances hors ligne) et les tests UX importés.
- `release-guard` (contrôle statique, local) : réussi, cible PROD verrouillée.
- Navigateur, données fictives, garde-fou réseau anti-Supabase actif (**0 requête**) : mission2 10, mission3 110, tables 17, gestion 14 (également en mode PWA 14), assistance 14, planning 3, salles 3, Créateur 3 + 4, notifications 14 / cycle de vie 24 / glissement 14 / PWA 12.
- `rm016-learning` : échec d'environnement connu (Chromium local), identique sur MAIN en RM-AUDIT-02 et réussi en CI : à confirmer par la CI de la PR.
- Non réalisés : appareils physiques et vraie connexion PROD (interdite). Ils restent pour la recette après accord.

## Rollback

- **Avant publication :** sauvegardes `backup/rmuxl1-v3-before-20261125` (`1633a8a`) et `backup/rmuxl1-main-before-20261125` (`d852c19`), à créer juste avant la fusion autorisée.
- **Retour arrière :** revert du commit de fusion sur V3 puis MAIN, ou retour aux SHAs de sauvegarde par PR. Aucune donnée ni migration à défaire.
- **Postes déjà mis à jour :** au rechargement suivant, la version précédente revient avec son propre nom de cache.

## Prérequis avant publication

1. Accord de la direction **distinct pour V3, puis pour MAIN**.
2. CI de la PR candidate V3 au vert, `release-guard` compris.
3. Recette fonctionnelle sur le poste Réception et la tablette Restaurant. Le même code UX est déjà LIVE sur Render DEV (`608fba9`) ; la publication PROD (GitHub Pages depuis MAIN) n'intervient qu'après l'accord MAIN.
