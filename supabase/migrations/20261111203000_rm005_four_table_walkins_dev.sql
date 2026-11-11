-- RM-005 / DEV ONLY: allow four connected tables for walk-in parties of 8.
-- All pre-existing authentication, row locking, occupancy, tenant and fusion checks remain unchanged.
-- Existing function bodies are patched in place so other DEV security fixes are not overwritten.
do $rm005$
declare
  target record;
  current_ddl text;
  occurrences integer;
  matches integer;
begin
  for target in
    select * from (values
      ('public','install_walkin_group_v3','cardinality(p_tables) not between 1 and 3',
       'cardinality(p_tables) not between 1 and 4'),
      ('public','confirm_reservation_v2','cardinality(p_table_ids) not between 1 and 3',
       'cardinality(p_table_ids) not between 1 and 4'),
      ('private','confirm_reservation','cardinality(p_table_ids) not between 1 and 3',
       'cardinality(p_table_ids) not between 1 and 4')
    ) as specs(schema_name,function_name,previous_guard,replacement_guard)
  loop
    select count(*), max(pg_get_functiondef(p.oid))
      into matches,current_ddl
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname=target.schema_name and p.proname=target.function_name;
    if matches<>1 then
      raise exception 'RM-005: expected one %.% function, found %',
        target.schema_name,target.function_name,matches;
    end if;
    occurrences:=(length(current_ddl)-length(replace(current_ddl,target.previous_guard,'')))
                 / length(target.previous_guard);
    if occurrences<>1 then
      raise exception 'RM-005: unexpected cardinality guard in %.% (found %)',
        target.schema_name,target.function_name,occurrences;
    end if;
    execute replace(current_ddl,target.previous_guard,target.replacement_guard);
  end loop;
end $rm005$;
