-- RestoManager DEV: reception may choose a specific table only before seating.
-- Versions and all table/hotel-room conflicts are checked by
-- private.update_reservation_v4, the same function used by the Restaurant.
-- Keep this change in DEV until the whole release is validated.
-- Privilege is temporary for transfer of function ownership, then revoked.
GRANT CREATE ON SCHEMA public TO resto_service_writer;
CREATE OR REPLACE FUNCTION public.reception_update_reservation_with_table_v1(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_start timestamptz;v_version uuid;v_updated uuid;
BEGIN
 PERFORM private.lock_restaurant_mutation_v1();
 IF auth.uid() IS NULL OR private.current_staff_role() IS DISTINCT FROM 'reception' THEN
  RAISE EXCEPTION 'Action réservée à la Réception' USING ERRCODE='42501',DETAIL='FORBIDDEN';
 END IF;
 SELECT starts_at,edit_version INTO v_start,v_version
 FROM public.reservations WHERE id=p_reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Réservation introuvable' USING ERRCODE='P0002';END IF;
 IF p_expected_version IS NULL THEN RAISE EXCEPTION 'Actualisez la fiche.' USING ERRCODE='RM002',DETAIL='MISSING_VERSION';END IF;
 IF v_version IS DISTINCT FROM p_expected_version THEN
  RAISE EXCEPTION 'Cette réservation a été modifiée.' USING ERRCODE='RM001',DETAIL='STALE_VERSION';
 END IF;
 IF p_party_size IS NULL OR p_party_size NOT BETWEEN 1 AND 50 OR p_starts_at IS NULL
  OR p_ends_at IS NULL OR p_ends_at<=p_starts_at
  OR p_ends_at-p_starts_at>interval '6 hours' THEN
  RAISE EXCEPTION 'Créneau ou couverts invalides.' USING ERRCODE='22023',DETAIL='INVALID_INPUT';
 END IF;
 IF v_start IS DISTINCT FROM p_starts_at AND (
  p_starts_at<now()-interval '5 minutes' OR NOT EXISTS(
  SELECT 1 FROM public.restaurant_hours h WHERE h.id=1 AND
   ((h.lunch_enabled AND (p_starts_at AT TIME ZONE 'Europe/Paris')::time BETWEEN h.lunch_start AND h.lunch_end)
    OR (h.dinner_enabled AND (p_starts_at AT TIME ZONE 'Europe/Paris')::time BETWEEN h.dinner_start AND h.dinner_end))
  )) THEN
  RAISE EXCEPTION 'Choisissez un créneau à venir pendant un service ouvert.'
   USING ERRCODE='22023',DETAIL='OUTSIDE_SERVICE';
 END IF;
 v_updated:=private.update_reservation_v4(
  p_reservation_id,p_expected_version,p_guest_name,p_hotel_room,
  p_party_size,p_starts_at,p_ends_at,p_table_ids,p_notes
 );
 RETURN jsonb_build_object('tables',p_table_ids,'edit_version',v_updated);
END $function$
;
ALTER FUNCTION public.reception_update_reservation_with_table_v1(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text) OWNER TO resto_service_writer;
REVOKE CREATE ON SCHEMA public FROM resto_service_writer;
REVOKE ALL ON FUNCTION public.reception_update_reservation_with_table_v1(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reception_update_reservation_with_table_v1(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text) TO authenticated;
