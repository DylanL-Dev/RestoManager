# RestoManager V3 — comptes par identifiant + mot de passe

## Décision retenue

L'interface de connexion demande un **identifiant**, pas une adresse e-mail.
Supabase Auth utilise néanmoins en interne des adresses **techniques fictives** réservées aux deux comptes, créées manuellement par un administrateur :

| Identifiant saisi | Adresse technique Auth | Rôle attendu |
|---|---|---|
| `reception` | `reception@accounts.restomanager.example.com` | `reception` |
| `admin-fb` | `admin-fb@accounts.restomanager.example.com` | `fb_admin` |

Ces adresses sont des identifiants techniques, **pas des boîtes mail**. Le domaine `example.com` est réservé à la documentation. Aucune validation d'e-mail par les employés n'est possible ou requise : l'administrateur doit créer et confirmer les comptes via **Supabase → Authentication → Users → Add user** avec confirmation automatique, si l'interface le permet. Ne pas utiliser l'inscription publique pour ces comptes.

Définir **deux mots de passe longs et distincts**, jamais dans GitHub, ChatGPT ou les scripts SQL. Les adresses techniques ne sont **pas des secrets** ; seule l'authentification Supabase protège l'accès. La récupération par e-mail ne fonctionne pas avec ces alias : prévoir une réinitialisation manuelle par un administrateur. Si Supabase refuse ces adresses fictives, il faudra choisir une autre stratégie d'authentification sécurisée plutôt que d'activer une fausse validation.

## Attribution des rôles

Après avoir créé les deux utilisateurs dans Auth, exécuter dans le SQL Editor :

```sql
begin;
insert into public.staff_profiles(user_id,role,display_name,active)
select id,'reception','Réception',true
from auth.users where lower(email)='reception@accounts.restomanager.example.com'
on conflict(user_id) do update set role=excluded.role,display_name=excluded.display_name,active=true;

insert into public.staff_profiles(user_id,role,display_name,active)
select id,'fb_admin','Administration F&B',true
from auth.users where lower(email)='admin-fb@accounts.restomanager.example.com'
on conflict(user_id) do update set role=excluded.role,display_name=excluded.display_name,active=true;
commit;
```

Vérifier ensuite :

```sql
select u.email,p.role,p.active
from public.staff_profiles p join auth.users u on u.id=p.user_id
where u.email in (
'reception@accounts.restomanager.example.com',
'admin-fb@accounts.restomanager.example.com'
);
```

Il faut **exactement deux lignes**, actives, avec les rôles correspondants. Si l'une manque, arrêter et vérifier le compte Auth avant de continuer.

## Limites de cette première version

- Le choix d'identifiant est **limité aux deux comptes prédéfinis**. Pour davantage d'utilisateurs, prévoir une résolution sécurisée côté serveur, avec contrôle anti-abus.
- La page de connexion est une **préversion isolée** : elle ne protège pas encore `index.html` ni les anciens mécanismes de stockage local.
- Le compte Réception est partagé : l'audit ne permet pas d'identifier individuellement l'employé.
- Les droits sont contrôlés par les politiques RLS et les fonctions SQL, pas par le seul JavaScript.
- Aucun mot de passe ou clé `service_role` ne doit être intégré au dépôt.
- Ne pas modifier la branche GitHub Pages officielle avant les tests de connexion, de concurrence, des droits et du temps réel.
