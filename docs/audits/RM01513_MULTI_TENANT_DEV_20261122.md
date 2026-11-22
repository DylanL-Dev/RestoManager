# RM-015.13 — Préparation multi-établissements et démonstration neutre (DEV)

Date : 22 novembre 2026. Cible exclusive : `feature/v3-supabase-full-clone` + Render `restomanager-v3-supabase-integration`.

## Problème initial
La page `reservation/live.html` et les erreurs de `reservation/live.mjs` utilisaient directement l’adresse de démonstration `a-lepicerie-rouen`, même pour un restaurant indépendant futur ou un lien mal formé. La démonstration `reservation/index.html` redirigeait elle aussi par défaut vers ce slug. Aucun lien de démonstration ne doit substituer un restaurant tiers à celui demandé.

## Solution ciblée
1. **Lien public sans repli entre restaurants.** `reservation/tenant-links.mjs` valide un seul slug canonique (3–80 caractères, chiffres et tirets, sans doublons). Un slug manquant/invalide ne lance pas de requête publique et affiche une erreur neutre. Les liens vers la démo retirent toutes les chaînes de requête et le fragment privé (`#manage`).
2. **Démonstration générique.** `reservation/index.html` démarre sur une sélection de deux établissements totalement fictifs : `le-jardin-demo` (indépendant) et `hotel-des-rives-demo` (restaurant d’hôtel). La démonstration conserve ses données fictives dans un stockage local distinct par slug et ne contacte aucun backend. Le vieux jeu de données de démo nommé `a-lepicerie-rouen` reste accessible uniquement par lien explicitement fourni pour la compatibilité de tests historiques ; **aucune URL de secours ni sélection par défaut ne l'utilise**.
3. **Guide de première configuration, sans activation.** Dans Gestion → Réservations en ligne, un établissement qui n’a pas encore d’adresse publique voit « Restaurant indépendant / Restaurant d’hôtel ». Le choix hôtel est disponible **seulement si** la capacité serveur `hotelGuestsCapability` est autorisée. Le modèle de confidentialité s’adapte ; le contact RGPD, la durée de conservation réelle, les textes personnalisés, l’adresse et les réservations existantes ne sont pas modifiés. Le brouillon n’est envoyé qu’avec « Enregistrer les réglages ». Pour un établissement configuré, le profil actuel est expliqué sans modifier le mode.
4. **Déploiement futur.** Le nouveau module `reservation/tenant-links.mjs` est inclus au manifeste des fichiers publics DEV et au contrôle des actifs. Aucun token, clé, variable de base ni migration n'est ajouté. Les réservations publiques restent séparées des tableaux salariés.

## Contrôles d’isolation
- Les liens de démo et de public ne réaffectent jamais un slug à un autre en cas d'erreur.
- Deux réservations de démonstration distinctes utilisent des clés de session différentes ; les jetons ne sont pas réutilisables dans l’autre établissement.
- Le formulaire salarié exige un `restaurantId` et un utilisateur concordants, rejette une réponse dont `restaurantId` diffère et invalide ses données quand le scope change.
- Audit **lecture seule de Supabase DEV**, 22/11/2026 : RLS activée sur `restaurants`, `reservations`, `restaurant_hours`, `restaurant_tables`, `service_closures` et les tables privées `rm015_settings`, `rm015_requests`, `rm015_operations`, `rm015_audit`. La fonction `rm015_staff_v1` contrôle identité, restaurant et rôle puis appelle `private.rm015_scope(rid)`. Cet audit structurel ne se substitue pas à un test de pénétration complet de la plateforme.

## Ce qui n’est pas inclus
- Création autonome de nouveaux établissements, comptes, facturation et sélection multi-restaurant d’un même utilisateur : **à traiter dans l’inscription multi-établissements**.
- Nouvelle migration Supabase, modification RLS, secrets, paramètre public de PROD.
- Publication MAIN/V3 ou activation de réservations publiques pour un nouvel établissement.

## Recette
- `npm test` dont `tests/rm01513-multi-tenant.test.cjs`.
- `tests/browser/rm015-public.cjs` : absence de repli vers le Mercure et sélection de deux démos fictives.
- Recettes RM-015 connectées avec PostgreSQL jetable, sans réservation dans la base PROD.
- Render DEV : vérifier la page `/reservation/` (deux exemples), la page `/reservation/live.html` sans slug (erreur neutre), puis `Gestion → Réservations en ligne` (profil et configuration guidée). Aucun compte ou établissement PROD ne doit être utilisé pour enregistrer les essais.
