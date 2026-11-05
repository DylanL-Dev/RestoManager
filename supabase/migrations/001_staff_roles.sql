-- RestoManager V3 — migration 001: identités et rôles
-- À exécuter uniquement sur le projet Supabase de TEST après relecture.
-- Aucun compte ni mot de passe n'est créé par ce script.
begin;

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('reception', 'fb_admin')),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.staff_profiles enable row level security;
revoke all on public.staff_profiles from anon;
grant select on public.staff_profiles to authenticated;

-- Chaque compte authentifié peut lire son propre profil, jamais le modifier.
drop policy if exists staff_profiles_read_self on public.staff_profiles;
create policy staff_profiles_read_self on public.staff_profiles
for select to authenticated using (user_id = (select auth.uid()));

-- Pas de politiques INSERT/UPDATE/DELETE côté client.
-- Attribution des rôles exclusivement via une opération d'administration sécurisée.
-- Ne jamais utiliser une clé service_role dans GitHub Pages.

create or replace function public.current_staff_role()
returns text language sql stable security definer
set search_path = ''
as $$
  select p.role from public.staff_profiles p
  where p.user_id = (select auth.uid()) and p.active = true
  limit 1
$$;
revoke all on function public.current_staff_role() from public, anon;
grant execute on function public.current_staff_role() to authenticated;

commit;
