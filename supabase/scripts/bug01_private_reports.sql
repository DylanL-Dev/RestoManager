-- BUG-01 — encrypted transport, tenant-scoped writes, platform-owner-only reads.
-- Requires platform_owner_foundation.sql. NEVER stores a password or email.
begin;
create table if not exists public.platform_reports (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id),
 submitted_by uuid not null references auth.users(id),
 submitted_role text not null check (submitted_role in ('fb_admin','reception')),
 kind text not null check (kind in ('bug','question','suggestion')),
 severity text not null default 'normal' check (severity in ('normal','urgent')),
 title text not null check (char_length(btrim(title)) between 3 and 120),
 description text not null check (char_length(btrim(description)) between 10 and 4000),
 reply_contact text check (reply_contact is null or char_length(btrim(reply_contact)) between 1 and 160),
 screen text not null default 'administration'
   check (char_length(screen) between 1 and 80),
 status text not null default 'new' check (status in ('new','reviewing','resolved')),
 created_at timestamptz not null default now()
);
create index if not exists platform_reports_owner_queue_idx
 on public.platform_reports (status,created_at desc);
create index if not exists platform_reports_restaurant_created_idx
 on public.platform_reports (restaurant_id,created_at desc);
alter table public.platform_reports enable row level security;
alter table public.platform_reports force row level security;
revoke all on public.platform_reports from public,anon,authenticated;
-- Column-scoped inserts prevent staff from setting status, created_at or ID.
grant insert(restaurant_id,submitted_by,submitted_role,kind,severity,title,description,reply_contact,screen)
 on public.platform_reports to authenticated;
-- A report is not readable even by its author: only the active platform owner.
grant select on public.platform_reports to authenticated;
-- Admins may only change status, never the reporter or contents.
grant update(status) on public.platform_reports to authenticated;

-- Owner can identify the issuing establishment; regular staff still see only
-- their own restaurant under the existing own_restaurant SELECT policy.
drop policy if exists platform_owner_restaurants on public.restaurants;
create policy platform_owner_restaurants on public.restaurants
for select to authenticated
using (exists(
 select 1 from public.platform_admins pa
 where pa.user_id=(select auth.uid())
 and pa.role='platform_admin' and pa.active=true
));

drop policy if exists platform_reports_staff_create on public.platform_reports;
create policy platform_reports_staff_create
on public.platform_reports for insert to authenticated
with check (
 submitted_by = (select auth.uid())
 and restaurant_id = (select private.staff_restaurant())
 and submitted_role = (select private.current_staff_role())
 and submitted_role in ('fb_admin','reception')
 and status = 'new'
);

drop policy if exists platform_reports_owner_read on public.platform_reports;
create policy platform_reports_owner_read
on public.platform_reports for select to authenticated
using (
 exists(
  select 1 from public.platform_admins pa
  where pa.user_id = (select auth.uid())
  and pa.active = true and pa.role = 'platform_admin'
 )
);

drop policy if exists platform_reports_owner_status on public.platform_reports;
create policy platform_reports_owner_status
on public.platform_reports for update to authenticated
using (
 exists(
  select 1 from public.platform_admins pa
  where pa.user_id = (select auth.uid())
  and pa.active = true and pa.role = 'platform_admin'
 )
)
with check (
 exists(
  select 1 from public.platform_admins pa
  where pa.user_id = (select auth.uid())
  and pa.active = true and pa.role = 'platform_admin'
 )
);
commit;
