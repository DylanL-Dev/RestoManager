-- READ ONLY. Run before any approved production installation; no customer rows.
begin read only;
select jsonb_build_object(
 'prerequisites',jsonb_build_object(
  'ranking',to_regprocedure('private.ranked_booking_sets(uuid,uuid[],integer,timestamptz,timestamptz)') is not null,
  'fusion',to_regprocedure('private.check_fusion_selection(uuid[])') is not null,
  'closeout',to_regprocedure('private.rm012_sync_api()') is not null,
  'mutation_lock',to_regprocedure('private.lock_restaurant_mutation_v1()') is not null,
  'edit',to_regprocedure('public.update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text)') is not null,
  'weekly_hours',exists(select 1 from information_schema.columns where table_schema='public' and table_name='restaurant_hours' and column_name='weekly_schedule'),
  'arrivals',exists(select 1 from information_schema.columns where table_schema='public' and table_name='restaurant_hours' and column_name='arrival_limit_percent'),
  'storage',to_regclass('storage.buckets') is not null,
  'vault',to_regclass('vault.decrypted_secrets') is not null),
 'web_schema_present',to_regclass('private.rm015_settings') is not null,
 'web_functions',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'function',p.proname,'owner',r.rolname,'definition_md5',md5(pg_get_functiondef(p.oid))) order by n.nspname,p.proname),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname in ('public','private') and p.proname like 'rm015_%'),
 'realtime',(select coalesce(jsonb_agg(tablename order by tablename),'[]') from pg_publication_tables where pubname='supabase_realtime'),
 'critical_tables',(select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'anon_select',has_table_privilege('anon',c.oid,'select')) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('reservations','reservation_tables','restaurant_tables','table_holds'))
) as preflight;
commit;
