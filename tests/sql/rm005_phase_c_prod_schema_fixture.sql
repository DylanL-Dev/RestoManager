-- RM-005 Phase C PostgreSQL 17 isolated fixture. ALL IDS/DATA SYNTHETIC.
-- Used after Phase A/B + function definitions in the second test database.

-- Simulate the same staff/restaurant access model with transaction-local claims.
CREATE OR REPLACE FUNCTION private.staff_restaurant() RETURNS uuid
LANGUAGE sql STABLE SET search_path TO '' AS $$
 SELECT NULLIF(current_setting('app.test_restaurant',true),'')::uuid
$$;
CREATE OR REPLACE FUNCTION private.current_staff_role() RETURNS text
LANGUAGE sql STABLE SET search_path TO '' AS $$
 SELECT NULLIF(current_setting('app.test_role',true),'')
$$;
CREATE FUNCTION private.lock_restaurant_mutation_v1() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT private.staff_restaurant() $$;

GRANT USAGE ON SCHEMA private TO authenticated, resto_service_writer;
GRANT USAGE ON SCHEMA public TO authenticated, resto_service_writer;
GRANT EXECUTE ON FUNCTION private.staff_restaurant() TO authenticated, resto_service_writer;
GRANT EXECUTE ON FUNCTION private.current_staff_role() TO authenticated, resto_service_writer;
GRANT EXECUTE ON FUNCTION private.lock_restaurant_mutation_v1() TO authenticated, resto_service_writer;

CREATE TABLE public.restaurant_rooms(
  id uuid PRIMARY KEY, restaurant_id uuid NOT NULL, name text NOT NULL,active boolean NOT NULL
);
CREATE TABLE public.restaurant_tables(
  id uuid PRIMARY KEY, room_id uuid NOT NULL REFERENCES public.restaurant_rooms(id),
  restaurant_id uuid NOT NULL, active boolean NOT NULL,
  UNIQUE (restaurant_id,id)
);
CREATE TABLE public.table_fusion_links(
  restaurant_id uuid NOT NULL,
  table_a uuid NOT NULL, table_b uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(table_a,table_b),
  CHECK(table_a<table_b),
  FOREIGN KEY(restaurant_id,table_a) REFERENCES public.restaurant_tables(restaurant_id,id),
  FOREIGN KEY(restaurant_id,table_b) REFERENCES public.restaurant_tables(restaurant_id,id)
);
CREATE TABLE public.reservations(
  id uuid PRIMARY KEY DEFAULT '90000000-0000-4000-8000-000000000001',
  guest_name text,notes text,status text DEFAULT 'reserved'
);

ALTER TABLE public.table_fusion_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY same_restaurant ON public.table_fusion_links
  FOR ALL TO authenticated,resto_service_writer
  USING (restaurant_id=(SELECT private.staff_restaurant()))
  WITH CHECK (restaurant_id=(SELECT private.staff_restaurant()));
CREATE POLICY "fb manage fusion links" ON public.table_fusion_links
  FOR ALL TO authenticated
  USING (private.current_staff_role()='fb_admin')
  WITH CHECK (private.current_staff_role()='fb_admin');
CREATE POLICY "staff read fusion links" ON public.table_fusion_links
  FOR SELECT TO authenticated
  USING (private.current_staff_role() IN ('fb_admin','reception'));
CREATE POLICY writer_access ON public.table_fusion_links
  FOR ALL TO resto_service_writer USING (true) WITH CHECK (true);

GRANT SELECT,INSERT,UPDATE,DELETE ON public.table_fusion_links TO authenticated,resto_service_writer;
GRANT SELECT ON public.restaurant_tables,public.restaurant_rooms TO authenticated,resto_service_writer;
GRANT SELECT,INSERT,UPDATE ON public.reservations TO authenticated,resto_service_writer;

INSERT INTO public.restaurant_rooms(id,restaurant_id,name,active) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Salle 1',true),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Salle 2',true),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','Autre restaurant',true);
INSERT INTO public.restaurant_tables(id,room_id,restaurant_id,active) VALUES
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true),
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true),
 ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true),
 ('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true),
 ('40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',true),
 ('40000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002',true);
-- App claims are transaction-local; role fixtures are not real Auth users.
