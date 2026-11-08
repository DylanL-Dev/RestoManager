# BUG-01 — Signalements privés RestoManager

## Objectif validé
Aucun e-mail de notification pour l'instant. Les deux équipes utilisent **Gestion → Signaler un problème** pour remonter un bug, une question ou une suggestion. L'auteur peut fournir facultativement un prénom ou moyen de contact professionnel pour permettre une réponse ultérieure.

Le créateur se connectera à **`creator.html` avec l'identifiant temporaire `root`**, puis un mot de passe personnel choisi hors du dépôt, stocké uniquement par Supabase Auth. Il peut consulter la boîte de réception et modifier le statut (Nouveau, En cours, Résolu). Ce n'est **pas** un mot de passe root Postgres, ni une clé de service.

## Modèle de sécurité
- `public.platform_reports` contient : établissement émetteur, identifiant de l'auteur, rôle Restaurant/Réception, nature, gravité, titre, description, contact professionnel facultatif, page, date et statut.
- L'insertion exige **`submitted_by=auth.uid()`**, établissement réel de l'auteur et rôle actif. On ne peut pas déclarer un autre établissement ou collègue.
- Les comptes d'équipe **n'ont aucun droit de lecture**, même sur leurs propres signalements ; ils voient uniquement un accusé de succès de l'envoi.
- La lecture des signalements, leur suivi et la liste des établissements ne sont accordés qu'au compte administrateur actif dans `platform_admins`, via RLS Supabase.
- Un propriétaire ne peut changer que le **statut** ; il ne peut réécrire ni le texte ni l'auteur.
- Aucun rapport ni nom client n'est envoyé par e-mail dans cette version. L'équipe doit éviter les données personnelles de clients et les mots de passe.
- Pas de `service_role` côté navigateur, pas d'endpoint permettant de devenir administrateur.
- Les utilisateurs employés restent liés à leurs données de service ; le compte Créateur ne reçoit aucun rôle `fb_admin` ou `reception`.

## État d'activation Supabase — 8 novembre 2026

Les deux scripts additifs `platform_owner_foundation.sql` et `bug01_private_reports.sql` ont été appliqués au projet d'intégration Supabase après succès des tests PostgreSQL isolés. Le rôle est **inactif tant qu'aucun compte propriétaire n'est provisionné ni activé**. L'application et la boîte de réception ne doivent pas être déclarées opérationnelles sans déploiement Render et connexion `root` vérifiée.

## Installation à effectuer
1. Réviser, fusionner et tester la fondation de la [PR n°20](https://github.com/DylanL-Dev/RestoManager/pull/20) **avant** BUG-01.
2. Exécuter les scripts dans cet ordre avec une connexion administrative **uniquement après validation isolée** :
   - `supabase/scripts/platform_owner_foundation.sql`
   - `supabase/scripts/bug01_private_reports.sql`
3. Vérifier RLS, grants et lecture interdite par les comptes staff. Vérifier ensuite que les deux comptes peuvent envoyer un message. Ne jamais envoyer de test en contenant de vraies données clients.
4. Créer dans **Supabase Dashboard → Authentication → Users** un utilisateur technique avec l'adresse interne `root@accounts.restomanager.example.com`, lui **définir un mot de passe fort directement dans le tableau de bord Supabase** et confirmer le compte administrativement. L'adresse est un alias technique, **pas** une boîte e-mail fonctionnelle.
5. Relever l'UUID exact de cet utilisateur dans Supabase Auth. Après vérification, un administrateur SQL habilité exécute :
   ```sql
   insert into public.platform_admins(user_id,active)
   values ('UUID_ROOT_VÉRIFIÉ'::uuid,true)
   on conflict(user_id) do update set active=excluded.active;
   ```
   Ne jamais mettre l'UUID réel ni surtout le mot de passe dans GitHub ou dans un chat.
6. Ouvrir `creator.html` dans un profil navigateur séparé, saisir **root** et le mot de passe défini directement dans Supabase, vérifier l'accès à la boîte de réception. Tester que les comptes Restaurant/Réception ne peuvent pas lire les signalements.
7. La première authentification `root` ne permet **pas** de récupérer le mot de passe par e-mail : la boîte `.example.com` ne reçoit rien. Une réinitialisation devra être faite par un administrateur Supabase Auth tant qu'une vraie adresse n'est pas associée au compte. Prévoir une MFA et une vraie adresse avant la mise en service multi-restaurants.

## États
- `new` — Nouveau
- `reviewing` — En cours de traitement
- `resolved` — Résolu

## Opérations de suivi
Dans le dashboard Créateur, les messages sont classables par statut et identifiés par le nom complet de l'établissement. Aucun e-mail ou notification push pour l'instant ; le créateur consulte le tableau de bord lorsqu'il le souhaite.

## Activation / limitation
L'identifiant `root` n'est **pas** une mesure de sécurité ; seule la vérification du compte Supabase Auth **et** la politique RLS font foi. Ne pas activer de compte super-utilisateur partagé en production. Ce flux est temporaire en attendant un compte personnel avec MFA, adresse de récupération et délégation future.
