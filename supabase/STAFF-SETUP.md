# RestoManager V3 — activation des comptes de test

La V3 publiée sur GitHub Pages reste indépendante de cette branche de développement.

## Comptes à créer dans Supabase

Dans **Authentication → Users → Add user**, créer deux comptes avec des adresses e-mail distinctes :

- **Réception** : un compte partagé par le personnel de réception.
- **F&B** : un compte administrateur pour le restaurant.

Utiliser des mots de passe robustes, uniques, et les communiquer hors de GitHub et de ChatGPT. Vérifier les comptes avant de leur attribuer un rôle.

## Attribution des rôles

Dans le **SQL Editor** du projet Supabase, remplacer les deux adresses ci-dessous par les adresses exactes des comptes créés. Ne jamais insérer un mot de passe dans ce script.

```sql
begin;
insert into public.staff_profiles (user_id, role, display_name, active)
select id, 'reception', 'Réception', true
from auth.users where lower(email) = lower('RECEPTION_EMAIL_A_REMPLACER')
on conflict (user_id) do update
set role = excluded.role, display_name = excluded.display_name, active = true;

insert into public.staff_profiles (user_id, role, display_name, active)
select id, 'fb_admin', 'Administration F&B', true
from auth.users where lower(email) = lower('FB_EMAIL_A_REMPLACER')
on conflict (user_id) do update
set role = excluded.role, display_name = excluded.display_name, active = true;
commit;
```

**Contrôle obligatoire :** les deux comptes doivent apparaître avec leurs rôles respectifs :

```sql
select u.email, p.role, p.active
from public.staff_profiles p
join auth.users u on u.id = p.user_id
where p.role in ('reception', 'fb_admin');
```

Si l'une des adresses ne correspond à aucun compte Auth, l'insertion correspondante ne crée aucune ligne : vérifier le résultat avant de poursuivre.

## Sécurité et périmètre

- Ne pas mettre de clé `service_role`, de mot de passe ni de jeton secret dans les fichiers GitHub.
- Le rôle est attribué côté serveur dans `staff_profiles`, jamais depuis les métadonnées modifiables par l'utilisateur.
- L'accès Réception est partagé : l'historique ne permet pas de distinguer individuellement les employés utilisant le même compte.
- Ne pas basculer GitHub Pages vers cette branche avant validation de la connexion, de la synchronisation, de la gestion des conflits et des tests multi-appareils.
- Les réservations de l'interface officielle sont encore locales : aucune synchronisation de production n'est active.
