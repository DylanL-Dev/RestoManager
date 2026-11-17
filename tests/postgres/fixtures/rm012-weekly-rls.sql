-- RM-JOHN-02: enforce role and tenant boundaries for weekly hours on DEV.
-- The old same_restaurant ALL policy gave Reception UPDATE privileges via OR semantics.
DROP POLICY IF EXISTS same_restaurant ON public.restaurant_hours;
CREATE POLICY same_restaurant ON public.restaurant_hours
 FOR SELECT TO authenticated,resto_service_writer
 USING (restaurant_id=(SELECT private.staff_restaurant()));
DROP POLICY IF EXISTS staff_read ON public.restaurant_hours;
CREATE POLICY staff_read ON public.restaurant_hours
 FOR SELECT TO authenticated
 USING (restaurant_id=(SELECT private.staff_restaurant())
   AND (SELECT private.current_staff_role()) IN ('fb_admin','reception'));
DROP POLICY IF EXISTS admin_edit ON public.restaurant_hours;
CREATE POLICY admin_edit ON public.restaurant_hours
 FOR UPDATE TO authenticated
 USING (restaurant_id=(SELECT private.staff_restaurant())
   AND (SELECT private.current_staff_role())='fb_admin')
 WITH CHECK (restaurant_id=(SELECT private.staff_restaurant())
   AND (SELECT private.current_staff_role())='fb_admin');
-- The separate writer_access policy remains unchanged for the dedicated internal writer role.
