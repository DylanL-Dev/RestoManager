# RM-015.1 — Portail public, architecture et limites de démonstration

Mission explicitement autorisée le 18/11/2026, après lecture de l’issue [#173](https://github.com/DylanL-Dev/RestoManager/issues/173) et de ses commentaires (aucun). La présente instruction autorise l’interface de démonstration, pas les réservations réelles décrites dans le cahier des charges global. La maquette annoncée n’est disponible ni dans le message ni dans l’issue ; aucune fidélité pixel à pixel n’est prétendue. La proposition reprend les contraintes visuelles explicites : vert/blanc, cartes arrondies, ombres discrètes et Lucide.

## Point de départ et audit

DEV `62d8fdae2e4451268fb1db3b858c8b62a02dcab3`, branche `feature/rm015-public-demo`, sauvegarde distante préalable `backup/rm0151-dev-before-20261118`. MAIN et V3 ne sont pas modifiées.

- `reservation-engine.js` décrit aussi les tables internes, états de service et réglages locaux ; sa réutilisation publique exposerait un modèle inutile et ne fournirait aucune garantie de disponibilité serveur.
- `booking-availability.js` interprète les choix internes : les simples places restantes ne sont pas une capacité de réservation publique. Aucun compteur de places n’est inventé.
- `booking-draft.js` crée/prolonge des maintiens authentifiés, gère l’idempotence et les reprises de confirmation. Le portail ne l’importe pas et n’appelle aucun de ses RPC.
- `v3-supabase-booking.js`, `supabase-service-bridge.js`, snapshots et modules de synchronisation chargent des données salariées. Ils restent exclus de l’entrée et de l’artefact publics.
- Les migrations existantes révoquent les fonctions métier à `anon`. Aucune règle n’est élargie et aucune nouvelle politique/RPC/migration n’est créée.
- Les styles RM-013 sont liés à des écrans internes. Le portail reprend leur vocabulaire visuel avec une feuille dédiée ; `lucide-local.js` est réutilisé tel quel, sans réseau.
- Le service worker RM-014 pouvait renvoyer `v3-connected.html` en secours pour toute navigation de la même origine. Son filtre exclut désormais `/reservation/` et cette page ne participe pas aux accusés de réception de mise à jour salariés. Cache interne et version publiée du tableau de bord inchangés.

Le skill Supabase a servi à vérifier la frontière publique/privée. Documentation officielle API/changelog consultée ; aucune fonctionnalité Supabase n’est implémentée et aucun appel à une base partagée n’a été nécessaire.

## Séparation et architecture multi-établissements

`reservation/index.html` est une véritable entrée indépendante. Aucun compte, menu salarié, tableau interne, script d’authentification ou client Supabase. Une CSP bloque toute connexion de données (`connect-src 'none'`) et toute soumission HTML (`form-action 'none'`). Les liens personnels sont placés dans le fragment de l’URL et le referrer est supprimé.

`model.js` expose un registre immuable de configurations publiques fictives, une résolution de slug refusant les établissements inconnus, les dates Europe/Paris, les validations et la fonction `publicURL(base, slug)`. Les horaires, services, fermetures, horizon et nombre de personnes sont propres à chaque configuration. L’Épicerie est une fiche du registre ; `le-jardin-demo` est un deuxième établissement entièrement fictif, utilisé pour les tests d’isolation. Le contrôleur ne contient pas de règles métier spécifiques à L’Épicerie.

URL de recette : `/reservation/?restaurant=a-lepicerie-rouen`. Le QR code d’un établissement doit encoder cette URL canonique retournée par `publicURL`, jamais un lien personnel de client. Des URL courtes `/r/{slug}` et une configuration diffusée par serveur pourront remplacer le registre sans changer le parcours.

`demo.js` est l’unique adaptateur d’enregistrement. Il utilise un espace `sessionStorage` distinct par slug, ou la mémoire si le stockage est interdit. Les jetons sont aléatoires (32 octets), expirent après 30 minutes, n’embarquent aucune coordonnée dans l’URL et sont vérifiés avec le restaurant. Révision locale, rejet des liens mal formés/inconnus/expirés, annulation idempotente et refus de modification après annulation sont simulés. Les valeurs sont échappées avant affichage et un enregistrement local mal formé est rejeté.

**Ce jeton local n’est pas un lien signé par un serveur.** Le modèle est une simulation, accessible uniquement dans la même session d’onglet ; il ne garantit ni sécurité de production, ni synchronisation entre appareils, ni concurrence transactionnelle. Le stockage de session peut être copié par le navigateur lors de la duplication d’un onglet ; ne pas le considérer comme une autorité de sécurité. L’expiration est vérifiée à l’accès, qui efface alors l’enregistrement expiré ; le nouvel exemple ou la fermeture de l’onglet efface aussi les données fictives. Aucun engagement de conservation réelle n’est annoncé.

`npm run build:public-demo` produit un artefact isolé `dist/public-demo` de huit fichiers statiques. Il contient seulement le portail, les icônes locales et le favicon. Aucun fichier salarié, URL Supabase, SDK ou secret. Cette préparation permet un futur hébergement sur une origine distincte ; elle n’active aucun site de production.

Le clone Render actuel sert déjà le dépôt DEV entier pour les recettes salariées. Le portail y est un chemin distinct ; il n’est pas prétendu que les fichiers statiques historiques des tableaux de bord deviennent inaccessibles par URL sur cette même origine. Les protections d’authentification existantes demeurent, et le portail ne charge ni ne propose ces écrans. L’origine et l’artefact publics dédiés sont nécessaires à la publication réelle.

## RM-015.2 — décisions et travaux requis avant toute réservation réelle

1. API publique dédiée renvoyant uniquement le restaurant et des créneaux autorisés. Aucune exposition `anon` des tables internes, aucune clé de service dans le navigateur.
2. Réutiliser côté serveur la source de vérité : tables compatibles, fusions autorisées, occupations y compris veille/minuit, maintiens, durées, planning, fermetures, quotas Web et réserve hôtel/passages. Revalidation atomique au clic final, verrous/contraintes, clé d’idempotence, TTL et contrôle de doubles soumissions.
3. Création source Web avec états distincts (confirmation ≠ arrivée), journal, règles de modification/annulation et notifications RM-014 autorisées. Confirmation immédiate ou demande à valider à décider ; aucun mode réel activé dans cette phase.
4. Jetons de gestion serveur à forte entropie, hachés au stockage, expiration/révocation/anti-rejeu, vérification stricte du tenant et protections des changements sensibles. Pas de données client dans les URL/logs.
5. Emails transactionnels asynchrones et reprises sans recréer la réservation, signalement des échecs durables. Choisir le prestataire et l’adresse d’envoi.
6. Anti-abus : limitations IP/contact, quotas de demandes, limites de charge/payload, CAPTCHA progressif, protections des maintiens. Tests de concurrence, isolation/RLS, échecs réseau et charge sur base éphémère.
7. Configuration et identité officielles par établissement : logo/photo autorisés, horaires réels, fermetures, coordonnées, conditions, politique d’annulation, responsable et durée de conservation RGPD. Ces valeurs restent à valider et ne sont pas déduites de cette démonstration.
8. Domaine public séparé, URL/QR par établissement, en-têtes CSP et `frame-ancestors` côté hébergeur, journalisation minimale, stratégie de déploiement sans accès aux assets internes.
9. Comparaison avec la maquette lorsqu’elle sera fournie et recette avec de vrais utilisateurs. Les essais automatiques ne remplacent pas ces validations.

Toute migration sera préparée et testée sur une base isolée, avec impacts présentés avant application à une base partagée. Cette phase n’en nécessite aucune.
