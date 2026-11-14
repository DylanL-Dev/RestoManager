-- RM-005 PostgreSQL 17 TEST ONLY — synthetic baseline, no real RestoManager data.
CREATE SCHEMA private;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE resto_service_writer NOLOGIN;

CREATE OR REPLACE FUNCTION private.staff_restaurant() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION private.current_staff_role() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;

CREATE TABLE public.restaurant_hours (
  id integer NOT NULL,
  lunch_enabled boolean NOT NULL,
  lunch_start time NOT NULL,
  lunch_end time NOT NULL,
  dinner_enabled boolean NOT NULL,
  dinner_start time NOT NULL,
  dinner_end time NOT NULL,
  duration integer NOT NULL,
  restaurant_id uuid NOT NULL,
  PRIMARY KEY (restaurant_id,id)
);
ALTER TABLE public.restaurant_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY same_restaurant ON public.restaurant_hours
  FOR SELECT TO authenticated,resto_service_writer
  USING (restaurant_id=(SELECT private.staff_restaurant()));
CREATE POLICY staff_read ON public.restaurant_hours
  FOR SELECT TO authenticated
  USING (restaurant_id=(SELECT private.staff_restaurant())
    AND (SELECT private.current_staff_role()) IN ('fb_admin','reception'));
CREATE POLICY admin_edit ON public.restaurant_hours
  FOR UPDATE TO authenticated
  USING (restaurant_id=(SELECT private.staff_restaurant())
    AND (SELECT private.current_staff_role())='fb_admin')
  WITH CHECK (restaurant_id=(SELECT private.staff_restaurant())
    AND (SELECT private.current_staff_role())='fb_admin');
CREATE POLICY writer_access ON public.restaurant_hours
  FOR ALL TO resto_service_writer USING (true) WITH CHECK (true);

INSERT INTO public.restaurant_hours
(id,lunch_enabled,lunch_start,lunch_end,dinner_enabled,dinner_start,dinner_end,duration,restaurant_id)
VALUES
(1,true,'12:00','14:30',true,'19:00','21:30',60,'10000000-0000-4000-8000-000000000001'),
(1,false,'12:00','14:30',false,'19:00','21:30',90,'10000000-0000-4000-8000-000000000002');
