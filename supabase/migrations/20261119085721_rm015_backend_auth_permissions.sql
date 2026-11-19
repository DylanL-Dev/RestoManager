begin;
-- Hosted postgres cannot delegate USAGE on the managed Auth schema.
-- Inline the verified implementation of Supabase auth.uid(): this reads only
-- PostgREST's request identity settings, never user_metadata or an Auth table.
-- Preserve SECURITY INVOKER/DEFINER, owner, identity, ACL and search_path.
do $$begin execute format('grant rm015_public_writer to %I with inherit true, set true',current_user);end$$;
do $migration$declare f record;definition text;identity_sql text :=
 $identity$(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid)$identity$;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and
 ((p.proowner='rm015_public_writer'::regrole and p.proname like 'rm015_%')
 or p.oid='private.lock_direct_service_mutation_v1()'::regprocedure)
 and p.prosrc like '%auth.uid()%'
 loop
  definition:=replace(pg_get_functiondef(f.oid),'auth.uid()',identity_sql);
  execute definition;
 end loop;
end$migration$;
do $$begin execute format('grant rm015_public_writer to %I with inherit false, set true',current_user);end$$;
commit;
