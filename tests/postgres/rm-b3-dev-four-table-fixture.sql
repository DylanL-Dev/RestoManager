-- November 10 fixture bridge. The live DEV catalogue on November 28 already
-- allows four tables in both native confirmation functions. Keep the old
-- dump intact and align only the local fixture before rehearsing B3.
do $fixture$
declare
 fn regprocedure;
 body text;
 old_limit text:='cardinality(p_table_ids) not between 1 and 3';
 new_limit text:='cardinality(p_table_ids) not between 1 and 4';
begin
 foreach fn in array array[
  'private.confirm_reservation(text,text,integer,timestamptz,timestamptz,uuid[],text)'::regprocedure,
  'public.confirm_reservation_v2(text,text,integer,timestamptz,timestamptz,uuid[],uuid,text)'::regprocedure
 ] loop
  select prosrc into strict body from pg_proc where oid=fn;
  if strpos(body,new_limit)>0 then continue; end if;
  if length(body)-length(replace(body,old_limit,''))<>length(old_limit) then
   raise exception 'Fixture de confirmation historique inattendue: %',fn;
  end if;
  execute replace(pg_get_functiondef(fn),body,replace(body,old_limit,new_limit));
 end loop;
end
$fixture$;
