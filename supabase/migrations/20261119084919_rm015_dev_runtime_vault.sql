begin;
-- No secret is generated or copied into migration history.
do $$begin
 if to_regclass('vault.decrypted_secrets') is null then
  raise exception 'Supabase Vault is required for RM015 runtime configuration';
 end if;
end$$;
create or replace function public.rm015_runtime_config_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if current_setting('role',true) is distinct from 'service_role' or auth.uid() is not null then
  raise exception 'Backend only' using errcode='42501';
 end if;
 select decrypted_secret::jsonb into result from vault.decrypted_secrets
 where name='rm015_runtime_v1';
 if result is null then raise exception 'Runtime not configured' using errcode='55000';end if;
 return result;
end$$;
alter function public.rm015_runtime_config_v1() owner to postgres;
revoke all on function public.rm015_runtime_config_v1() from public,anon,authenticated;
grant execute on function public.rm015_runtime_config_v1() to service_role;
comment on function public.rm015_runtime_config_v1() is 'Fixed RM015 Vault configuration; service-role backend only. Never grant employee/public execution.';
commit;
