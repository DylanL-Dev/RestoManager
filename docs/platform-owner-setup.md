# Compte Créateur RestoManager — préparation sécurisée (BUG-01)

## État
Cette fonctionnalité est préparée mais **ne crée pas de compte et ne donne pas de droits d'administration automatiquement**.

Le modèle d'accès est distinct des comptes `fb_admin` (équipe Restaurant) et `reception` (Réception). Un utilisateur de la plateforme peut se connecter à `creator.html` seulement si une **ligne active** existe dans `public.platform_admins` pour son identifiant Supabase Auth. Tous les autres utilisateurs sont refusés.

## Étapes d'activation en production

1. Le propriétaire choisit une **adresse e-mail personnelle pour l'administration**, idéalement différente de son compte de service. Ne jamais demander son mot de passe dans un chat, un ticket GitHub ou un document.
2. Un administrateur du projet Supabase crée et vérifie cet utilisateur depuis **Authentication → Users** (préférer l'invitation ou un flux de mot de passe sécurisé, et configurer MFA avant l'accès réel aux signalements). Il récupère l'UUID exact de cet utilisateur **après vérification de son identité**.
3. Après validation de la PR et contrôle de l'environnement isolé, exécuter **en session administrative** le fichier `supabase/scripts/platform_owner_foundation.sql`. Vérifier qu'il n'a modifié aucun rôle ni aucune table métier existants.
4. Un administrateur SQL habilité active **uniquement l'UUID vérifié** :
   ```sql
   insert into public.platform_admins (user_id, role, active)
   values ('UUID_AUTH_VÉRIFIÉ'::uuid, 'platform_admin', true)
   on conflict (user_id)
   do update set active = excluded.active;
   ```
   Ne pas mettre d'UUID ni d'email personnel dans le dépôt Git.
5. Tester `creator.html` avec le compte Créateur, puis avec les deux comptes d'équipe : seul le propriétaire doit voir l'espace de préparation. Les autres n'ont accès à aucune donnée d'administration.
6. **Définir avant BUG-01 la RLS des futurs signalements** : insertion limitée au restaurant du membre authentifié, lecture privée du seul administrateur actif, autorisation vérifiée en base à chaque requête. Ne pas se contenter de cacher un menu.

## Vérifications SQL (lecture seule)

```sql
select relrowsecurity, relforcerowsecurity
from pg_class where oid = 'public.platform_admins'::regclass;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'platform_admins'
order by grantee, privilege_type;

select policyname, cmd, roles, qual
from pg_policies
where schemaname='public' and tablename='platform_admins';
```

## Révocation d'urgence

Pour couper immédiatement l'accès aux nouvelles requêtes authentifiées :

```sql
update public.platform_admins
set active = false
where user_id = 'UUID_AUTH_VÉRIFIÉ'::uuid;
```

Révoquer également les sessions de l'utilisateur via les contrôles Supabase Auth.

## Sécurité et séparation

- Le rôle `platform_admin` **n'est pas** une variante de `staff_profiles.role`. Le compte Créateur ne reçoit aucun `restaurant_id` ni autorisation d'effectuer des opérations de service.
- La simple visibilité du panneau Créateur **n'autorise aucune lecture** des données Restaurant et Réception.
- Le navigateur utilise la **clé publique** Supabase uniquement. Aucun secret `service_role` n'est embarqué.
- Les utilisateurs ne peuvent ni s'ajouter eux-mêmes à `platform_admins` ni élever leurs droits : pas de `INSERT`, `UPDATE` ou `DELETE` côté `authenticated`.
- Les futurs rapports de bug ne seront pas visibles aux employés. BUG-01 doit disposer de ses propres politiques de sécurité et d'une validation d'isolation multi-établissement.
- Les applications Restaurant et Créateur partagent temporairement les sessions Supabase du même domaine Render : se connecter comme Créateur dans le même navigateur remplace la session d'équipe. À terme, réserver un domaine ou un profil navigateur distinct à l'administration.
- `creator.html` n'est **pas une console Supabase** : elle affiche seulement un état d'accès vérifié. L'accès aux rapports sera développé séparément.

## Publication

Ne pas fusionner ni déployer l'interface Créateur tant que le schéma `platform_admins` n'a pas été vérifié dans un environnement isolé puis activé dans le projet ciblé. Une mise en ligne avant activation afficherait simplement un refus d'accès, sans octroyer de droits.
