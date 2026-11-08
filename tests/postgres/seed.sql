-- Fictional identifiers and data only. Used in the disposable network-disabled DB.
truncate public.restaurants,auth.users cascade;
insert into public.restaurants(id,name) values
 ('10000000-0000-4000-8000-000000000001','Restaurant fictif A'),
 ('10000000-0000-4000-8000-000000000002','Restaurant fictif B');
update public.restaurant_hours set lunch_enabled=true,dinner_enabled=true;
insert into auth.users(id) select ('20000000-0000-4000-8000-'||lpad(x::text,12,'0'))::uuid from generate_series(1,6) x;
insert into public.staff_profiles(user_id,role,display_name,restaurant_id,active) values
 ('20000000-0000-4000-8000-000000000001','fb_admin','Restaurant fictif A1','10000000-0000-4000-8000-000000000001',true),
 ('20000000-0000-4000-8000-000000000002','fb_admin','Restaurant fictif A2','10000000-0000-4000-8000-000000000001',true),
 ('20000000-0000-4000-8000-000000000003','reception','Réception fictive A','10000000-0000-4000-8000-000000000001',true),
 ('20000000-0000-4000-8000-000000000004','fb_admin','Restaurant fictif B','10000000-0000-4000-8000-000000000002',true),
 ('20000000-0000-4000-8000-000000000005','reception','Profil fictif inactif','10000000-0000-4000-8000-000000000001',false);
insert into public.restaurant_rooms(id,name,restaurant_id) values
 ('30000000-0000-4000-8000-000000000001','Salle fictive A','10000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','Salle fictive B','10000000-0000-4000-8000-000000000002');
insert into public.restaurant_tables(id,room_id,label,seats,restaurant_id)
select ('40000000-0000-4000-8000-'||lpad(x::text,12,'0'))::uuid,
 '30000000-0000-4000-8000-000000000001',x::text,6,'10000000-0000-4000-8000-000000000001'
from generate_series(1,8) x;
insert into public.restaurant_tables(id,room_id,label,seats,restaurant_id) values
 ('40000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000002','1',6,'10000000-0000-4000-8000-000000000002');
insert into public.reservations(id,guest_name,hotel_room,party_size,starts_at,ends_at,notes,restaurant_id)
select ('50000000-0000-4000-8000-'||lpad(x::text,12,'0'))::uuid,
 'Client fictif '||x,case when x=3 then null else (100+x)::text end,2,
 ((current_timestamp at time zone 'Europe/Paris')::date+1+time '12:00') at time zone 'Europe/Paris',
 ((current_timestamp at time zone 'Europe/Paris')::date+1+time '13:30') at time zone 'Europe/Paris',
 E'Note fictive\nALLERGIES À VÉRIFIER : Noix\n'||case when x=3 then '[RESTOMANAGER:EXTERIEUR]' else '[RESTOMANAGER:HOTEL]' end,
 '10000000-0000-4000-8000-000000000001' from generate_series(1,4) x;
insert into public.reservations(id,guest_name,hotel_room,party_size,starts_at,ends_at,notes,restaurant_id)
select '50000000-0000-4000-8000-000000000009','Client fictif étranger','101',2,starts_at,ends_at,
 '[RESTOMANAGER:HOTEL]','10000000-0000-4000-8000-000000000002' from public.reservations limit 1;
insert into public.reservation_tables(reservation_id,table_id,restaurant_id)
select r.id,('40000000-0000-4000-8000-'||right(r.id::text,12))::uuid,r.restaurant_id from public.reservations r;
