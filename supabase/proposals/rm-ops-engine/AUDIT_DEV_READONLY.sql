-- RM-OPS ENGINE — audit en LECTURE SEULE du catalogue Supabase DEV.
-- À exécuter par le propriétaire dans l'éditeur SQL du projet DEV (jamais PROD).
-- Aucune écriture : uniquement des SELECT sur le catalogue PostgreSQL.
-- Compare chaque fonction critique à l'export versionné du 10/11/2026
-- (tests/postgres/dev-snapshot-20261110.sql) via l'empreinte md5 de son code.
with expected(name,md5_snapshot) as (values
 ('public.apply_smart_placement_v3','4d7538c16784ba283ab62ead4c8a4054'),
 ('public.change_reservation_status_v3','78c68db77852165acfb41fafac990ce9'),
 ('public.install_walkin_group_v3','73537b35c57af08fa69c709ab094b837'),
 ('public.install_walkin_v3','98204f6e4fbd45c096373301ad4d9d2b'),
 ('public.update_reservation_v4','1c5166115e4ea7275f5c88d088074266'),
 ('public.acquire_table_hold_v2','b3dc00b25140bc4889c4d8fc6a058c62'),
 ('private.confirm_reservation_v3','84e137b9d41f497f579e6daecebaec95'),
 ('private.lock_restaurant_mutation_v1','2aacd12b7bb48704e6bb818b351eddb3'),
 ('private.bump_reservation_edit_version','d22c189f1d9453c4af5fcb56d95984f9'),
 ('private.invalidate_reservation_edit_version','26a5e30b1fbeda72005e1df9bd7e22fb')
), actual as (
 select n.nspname||'.'||p.proname as name,md5(p.prosrc) md5_now,p.prosecdef security_definer,
  coalesce(array_to_string(p.proconfig,','),'') config,
  has_function_privilege('anon',p.oid,'execute') anon_exec,
  has_function_privilege('authenticated',p.oid,'execute') auth_exec
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private')
)
select 'function' as kind,e.name,
 case when a.name is null then 'ABSENT' when a.md5_now=e.md5_snapshot then 'IDENTIQUE 10/11' else 'MODIFIÉE depuis 10/11' end as status,
 a.security_definer,a.config,a.anon_exec,a.auth_exec
from expected e left join (select distinct on (name) * from actual order by name) a on a.name=e.name
union all
select 'trigger',c.relname||'.'||t.tgname,'présent',null,pg_get_triggerdef(t.oid),null,null
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where not t.tgisinternal and n.nspname='public' and c.relname in ('reservations','reservation_tables','table_holds')
union all
select 'policy',schemaname||'.'||tablename||'.'||policyname,cmd,null,coalesce(qual,'')||' | '||coalesce(with_check,''),null,null
 from pg_policies where schemaname='public' and tablename in ('reservations','reservation_tables','table_holds','restaurant_tables')
union all
select 'proposal',x,case when to_regclass(x) is null and to_regprocedure(x) is null then 'absente (attendu)' else 'PRÉSENTE' end,null,null,null,null
 from unnest(array['public.placement_events','public.apply_smart_placement_v4(uuid,jsonb,boolean,boolean)','public.seat_with_release_v1(uuid,text,uuid,uuid[],boolean)','public.move_seated_party_v1(uuid,uuid,uuid)']) x
order by 1,2;
