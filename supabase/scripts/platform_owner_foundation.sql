-- BUG-01 prerequisite: an isolated, revocable platform owner identity.
-- This file intentionally does NOT create or promote any user.
-- Run with a database administrator after the owner Auth user has been created
-- and individually verified. The staff role / restaurant data is not altered.
begin;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'platform_admin'
    check (role = 'platform_admin'),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;

revoke all on public.platform_admins from public, anon, authenticated;
grant select on public.platform_admins to authenticated;

-- Only an explicitly provisioned, active admin can see their own identity.
-- SELECT access does not imply write privileges.
drop policy if exists platform_admin_read_self on public.platform_admins;
create policy platform_admin_read_self
on public.platform_admins
for select
to authenticated
using ((select auth.uid()) = user_id and active = true);

-- Deliberately no client INSERT/UPDATE/DELETE policies, grants or RPCs.
-- Provision or revoke accounts through a trusted administrative SQL session:
--   insert into public.platform_admins(user_id,active)
--   values ('<verified auth.users.id>'::uuid,true)
--   on conflict(user_id) do update set active=excluded.active;
-- Revocation:
--   update public.platform_admins set active=false
--   where user_id='<verified auth.users.id>'::uuid;
-- Do NOT copy sample values or provide a browser-accessible admin creation API.
commit;
