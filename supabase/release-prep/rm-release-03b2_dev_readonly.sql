-- DEV only. Records schema metadata and privileges, never business rows.
begin read only;

select current_setting('server_version') as postgres_version,
       current_user as executor,
       pg_has_role(current_user, 'resto_service_writer', 'SET') as can_transfer_ownership,
       has_schema_privilege('resto_service_writer', 'public', 'CREATE') as writer_public_create,
       has_schema_privilege('resto_service_writer', 'private', 'CREATE') as writer_private_create,
       has_schema_privilege('authenticated', 'private', 'USAGE') as authenticated_private_usage,
       has_schema_privilege('anon', 'private', 'USAGE') as anon_private_usage,
       (select rolconfig from pg_roles where rolname = 'authenticator') as authenticator_settings;

with functions(signature) as (values
 ('public.service_sync_state_v1()'),
 ('private.rm012_sync_api()'),
 ('private.current_staff_role()'),
 ('private.staff_restaurant()'),
 ('private.lock_restaurant_mutation_v1()'),
 ('private.lock_direct_service_mutation_v1()'),
 ('private.restaurant_service_open_at_v1(uuid,timestamptz)'),
 ('public.install_walkin_group_v3(uuid[],integer,text,text)'),
 ('public.change_reservation_status_v3(uuid,text,text)'),
 ('public.apply_smart_placement_v3(uuid,jsonb)'),
 ('public.apply_smart_placement_v4(uuid,jsonb,boolean,boolean)'),
 ('public.move_seated_party_v1(uuid,uuid,uuid)'),
 ('public.seat_reservation_v1(uuid,text,uuid)'),
 ('public.seat_with_release_v1(uuid,text,uuid,uuid[],boolean)'),
 ('public.quick_release_v1(uuid,uuid,uuid[],boolean)'),
 ('private.quick_release_v1(uuid,uuid,uuid[],boolean)'),
 ('private.lock_express_service_v1(text)'),
 ('public.express_seat_v1(text,uuid,text,uuid,jsonb)'),
 ('private.express_seat_v1(text,uuid,text,uuid,jsonb)'),
 ('public.express_walkin_v1(text,uuid,integer,text,text)'),
 ('private.express_walkin_v1(text,uuid,integer,text,text)')
)
select signature, pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,
       p.proconfig as config, p.proacl as acl, md5(p.prosrc) as source_hash,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('resto_service_writer', p.oid, 'EXECUTE') as writer_exec,
       pg_get_functiondef(p.oid) as definition
from functions left join pg_proc p on p.oid = to_regprocedure(signature)
order by signature;

with expected(relation) as (values
 ('public.reservations'), ('public.reservation_tables'), ('public.table_holds'),
 ('public.restaurant_rooms'), ('public.restaurant_tables'), ('public.restaurant_hours'),
 ('public.restaurant_service_changes'), ('public.table_fusion_links'), ('public.placement_events'),
 ('private.quick_release_receipts'), ('private.quick_release_audit')
)
select expected.relation, pg_get_userbyid(c.relowner) as owner, c.relacl as acl,
       c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
       array(select t.tgname from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal order by t.tgname) as triggers,
       array(select p.pubname from pg_publication_tables p
             where p.schemaname = n.nspname and p.tablename = c.relname order by p.pubname) as publications,
       (select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p
        where p.schemaname = n.nspname and p.tablename = c.relname) as policies
from expected left join pg_class c on c.oid = to_regclass(expected.relation)
left join pg_namespace n on n.oid = c.relnamespace
order by expected.relation;

commit;
