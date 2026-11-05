-- Diagnostic de sécurité RestoManager V3 (lecture seule)
-- À exécuter dans Supabase SQL Editor. Ne crée aucun utilisateur et ne modifie aucune donnée.
select 'staff_profiles' as controle,count(*)::text as resultat from public.staff_profiles
union all
select 'comptes Auth',count(*)::text from auth.users;

select c.relname as table_name,c.relrowsecurity as rls_active
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
and c.relname in ('staff_profiles','restaurant_rooms','restaurant_tables','reservations','reservation_tables','table_holds','staff_password_reset_audit')
order by c.relname;

select p.tablename,p.policyname,p.cmd
from pg_policies p where p.schemaname='public'
and p.tablename in ('staff_profiles','restaurant_rooms','restaurant_tables','reservations','reservation_tables','table_holds','staff_password_reset_audit')
order by p.tablename,p.policyname;

select
 has_function_privilege('anon','public.acquire_table_hold(uuid,timestamptz,timestamptz)','EXECUTE') as anon_can_hold,
 has_function_privilege('anon','public.confirm_reservation(text,text,integer,timestamptz,timestamptz,uuid[],text)','EXECUTE') as anon_can_confirm,
 has_function_privilege('anon','public.release_table_hold(uuid)','EXECUTE') as anon_can_release,
 has_function_privilege('authenticated','public.confirm_reservation(text,text,integer,timestamptz,timestamptz,uuid[],text)','EXECUTE') as authenticated_can_call_confirm;

-- Attendu : 7 tables RLS=true ; anon_can_*=false ; authenticated_can_call_confirm=true.
-- Ce diagnostic ne remplace pas des tests réels avec sessions JWT Réception/F&B.
