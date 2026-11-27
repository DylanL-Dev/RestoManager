-- Candidate DEV. Validate against the hosted schema and authorize separately before applying.
begin;

create table if not exists private.quick_release_receipts (
 reservation_id uuid primary key references public.reservations(id) on delete cascade,
 restaurant_id uuid not null,
 actor_id uuid not null,
 release_version uuid not null,
 previous_released_at timestamptz,
 expires_at timestamptz not null
);
create index if not exists quick_release_receipts_expiry
 on private.quick_release_receipts(restaurant_id,expires_at);
alter table private.quick_release_receipts enable row level security;
alter table private.quick_release_receipts force row level security;
revoke all on private.quick_release_receipts from public,anon,authenticated;
grant select,insert,update,delete on private.quick_release_receipts to resto_service_writer;
drop policy if exists quick_release_receipts_tenant on private.quick_release_receipts;
create policy quick_release_receipts_tenant on private.quick_release_receipts
 to resto_service_writer using (restaurant_id=private.staff_restaurant())
 with check (restaurant_id=private.staff_restaurant());

create or replace function private.quick_release_v1(
 p_reservation_id uuid,p_expected_version uuid,p_table_ids uuid[],p_undo boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 venue uuid:=private.lock_restaurant_mutation_v1();
 current_row public.reservations%rowtype;
 receipt private.quick_release_receipts%rowtype;
 assigned uuid[];
 table_key uuid;
 next_version uuid;
begin
 if private.current_staff_role() is distinct from 'fb_admin' then
  raise exception 'Action réservée à l’équipe en salle.' using errcode='42501';
 end if;
 select * into current_row from public.reservations
 where id=p_reservation_id and restaurant_id=venue for update;
 -- Use the same refusal for an unknown reservation or changed installation.
 if not found or current_row.edit_version is distinct from p_expected_version then
  raise exception 'Ce client n’est plus installé sur ces tables. Vérifiez le plan.' using errcode='40001';
 end if;
 select array_agg(table_id order by table_id) into assigned from public.reservation_tables
 where reservation_id=p_reservation_id and restaurant_id=venue;
 if assigned is null or assigned is distinct from array(select t from unnest(p_table_ids) as t order by t) then
  raise exception 'Ce client n’est plus installé sur ces tables. Vérifiez le plan.' using errcode='40001';
 end if;

 if p_undo is false then
  if current_row.status<>'seated' then
   raise exception 'Ce client n’est plus installé sur ces tables. Vérifiez le plan.' using errcode='40001';
  end if;
  perform public.change_reservation_status_v3(p_reservation_id,'seated','released');
  select edit_version into strict next_version from public.reservations where id=p_reservation_id;
  delete from private.quick_release_receipts
  where restaurant_id=venue and expires_at<=clock_timestamp();
  insert into private.quick_release_receipts
   (reservation_id,restaurant_id,actor_id,release_version,previous_released_at,expires_at)
  values (p_reservation_id,venue,auth.uid(),next_version,current_row.released_at,clock_timestamp()+interval '8 seconds')
  on conflict (reservation_id) do update set actor_id=excluded.actor_id,release_version=excluded.release_version,
   previous_released_at=excluded.previous_released_at,expires_at=excluded.expires_at;
  return next_version;
 end if;

 select * into receipt from private.quick_release_receipts
 where reservation_id=p_reservation_id and restaurant_id=venue and actor_id=auth.uid()
  and release_version=p_expected_version;
 if p_undo is distinct from true or current_row.status<>'released' or
    receipt.expires_at is null or receipt.expires_at<=clock_timestamp() then
  raise exception 'Annulation impossible : cette libération a expiré ou le service a changé.' using errcode='40001';
 end if;
 foreach table_key in array assigned loop
  perform pg_advisory_xact_lock(hashtextextended(table_key::text,0));
  if not exists(select 1 from public.restaurant_tables where id=table_key and restaurant_id=venue and active)
     or exists(
      select 1 from public.reservation_tables a join public.reservations r on r.id=a.reservation_id
      where a.restaurant_id=venue and a.table_id=table_key and r.id<>p_reservation_id and r.status='seated'
     ) then
   raise exception 'Annulation impossible : cette table a été réoccupée ou désactivée.' using errcode='23P01';
  end if;
 end loop;
 if receipt.expires_at<=clock_timestamp() then
  raise exception 'Annulation impossible : cette libération a expiré.' using errcode='40001';
 end if;
 -- Restore the original installation time and assignments. Existing reservation
 -- triggers provide the same service revision, guards and Realtime signals.
 update public.reservations set status='seated',released_at=receipt.previous_released_at,updated_at=clock_timestamp()
 where id=p_reservation_id returning edit_version into next_version;
 delete from private.quick_release_receipts where reservation_id=p_reservation_id;
 return next_version;
end $$;

alter function private.quick_release_v1(uuid,uuid,uuid[],boolean) owner to resto_service_writer;
revoke all on function private.quick_release_v1(uuid,uuid,uuid[],boolean) from public,anon;
grant execute on function private.quick_release_v1(uuid,uuid,uuid[],boolean) to authenticated;

create or replace function public.quick_release_v1(
 p_reservation_id uuid,p_expected_version uuid,p_table_ids uuid[],p_undo boolean
) returns uuid language sql security invoker set search_path='' as $$
 select private.quick_release_v1($1,$2,$3,$4);
$$;
revoke all on function public.quick_release_v1(uuid,uuid,uuid[],boolean) from public,anon;
grant execute on function public.quick_release_v1(uuid,uuid,uuid[],boolean) to authenticated;

create or replace function public.service_sync_state_v1()
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_set(state,'{capabilities,quick_release}','1'::jsonb)
 from (select private.rm012_sync_api() as state) snapshot;
$$;
commit;
