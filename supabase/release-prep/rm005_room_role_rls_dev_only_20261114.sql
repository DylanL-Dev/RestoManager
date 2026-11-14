-- RM-005 — DEV CLONE only until separately authorized for PROD.
-- Supabase restaurant_rooms: the historical same_restaurant FOR ALL policy
-- is PERMISSIVE and overlaps the role-specific policies (OR semantics).
-- That allows 'reception' users of the venue to issue direct room changes.
-- The writer_access policy for resto_service_writer is intentionally preserved.
--
-- Replaces ONLY restaurant_rooms policies. No rooms, UUIDs, tables or bookings
-- are modified. Apply through Supabase migration tooling after review.
DROP POLICY IF EXISTS same_restaurant ON public.restaurant_rooms;
DROP POLICY IF EXISTS rooms_staff_read ON public.restaurant_rooms;
DROP POLICY IF EXISTS rooms_admin_insert ON public.restaurant_rooms;
DROP POLICY IF EXISTS rooms_admin_update ON public.restaurant_rooms;

CREATE POLICY rooms_staff_read ON public.restaurant_rooms
 FOR SELECT TO authenticated
 USING (
  restaurant_id=(SELECT private.staff_restaurant())
  AND (SELECT private.current_staff_role()) IN ('reception','fb_admin')
 );

CREATE POLICY rooms_admin_insert ON public.restaurant_rooms
 FOR INSERT TO authenticated
 WITH CHECK (
  restaurant_id=(SELECT private.staff_restaurant())
  AND (SELECT private.current_staff_role())='fb_admin'
 );

CREATE POLICY rooms_admin_update ON public.restaurant_rooms
 FOR UPDATE TO authenticated
 USING (
  restaurant_id=(SELECT private.staff_restaurant())
  AND (SELECT private.current_staff_role())='fb_admin'
 )
 WITH CHECK (
  restaurant_id=(SELECT private.staff_restaurant())
  AND (SELECT private.current_staff_role())='fb_admin'
 );
