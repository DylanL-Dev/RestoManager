-- DEV corrective proposal after hosted recipe. No execution until explicit approval.
-- Repair SQL three-valued logic without changing legacy public signatures or permissions.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
do $room_guard$
declare
 target regprocedure:='private.confirm_reservation(text,text,integer,timestamptz,timestamptz,uuid[],text)'::regprocedure;
 old_body text;
 new_body text;
 broken text:=$old$if v_room is not null and not (v_role='fb_admin' and p_notes='[RM:WALKIN_SEPARATE_OCCUPANT_V1]' and current_setting('restomanager.second_occupant_confirmed',true)='yes') and exists ($old$;
 fixed text:=$new$if v_room is not null and not coalesce(v_role='fb_admin' and p_notes='[RM:WALKIN_SEPARATE_OCCUPANT_V1]' and current_setting('restomanager.second_occupant_confirmed',true)='yes',false) and exists ($new$;
 room_old text:=$old$where lower(btrim(r.hotel_room))=lower(v_room)$old$;
 room_new text:=$new$where r.restaurant_id=private.staff_restaurant() and lower(btrim(r.hotel_room))=lower(v_room)$new$;
begin
 select prosrc into strict old_body from pg_proc where oid=target;
 if strpos(old_body,fixed)>0 and strpos(old_body,room_new)>0 then return;end if;
 -- Fail closed on a different hosted definition; review rather than rewriting an unknown function.
 if strpos(old_body,broken)=0 or strpos(old_body,room_old)=0
 or length(old_body)-length(replace(old_body,broken,''))<>length(broken)
 or length(old_body)-length(replace(old_body,room_old,''))<>length(room_old) then
  raise exception 'Définition de confirmation différente du candidat : revoir le catalogue DEV.';
 end if;
 new_body:=replace(replace(old_body,broken,fixed),room_old,room_new);
 execute replace(pg_get_functiondef(target),old_body,new_body);
end
$room_guard$;
notify pgrst,'reload schema';
commit;
