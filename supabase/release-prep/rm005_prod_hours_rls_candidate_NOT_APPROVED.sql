-- RM-005 PRODUCTION CANDIDATE — DO NOT EXECUTE WITHOUT EXPLICIT OWNER APPROVAL.
-- GitHub release-prep ONLY. Not registered as a Supabase migration.
-- This SQL was derived from the DEV policy definitions verified on 2026-11-13.
-- The preflight must verify the PROD policy inventory and its ownership at execution time.
-- In particular, preserve the dedicated `writer_access` policy for the internal writer.
--
-- TEST PLAN before any production application:
--   * Restore PROD schema into an isolated, disposable PostgreSQL instance.
--   * With two authenticated DEV/test identities: Reception UPDATE must affect zero rows;
--     Restaurant fb_admin UPDATE must affect exactly its restaurant's row; both rollback.
--   * A user assigned to another restaurant must not see/update this restaurant's hours.
--   * The internal service writer must continue to operate; test Realtime and room isolation.
--   * Abort if current PROD policy structure differs from the expected baseline.
--
-- IMPORTANT: Changing policies can affect production. Obtain authorization separately.
BEGIN;

DO $rm005_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.restaurant_hours'::regclass AND relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RM-005: restaurant_hours RLS not enabled: abort';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='restaurant_hours'
      AND policyname='same_restaurant' AND cmd='ALL'
  ) THEN
    RAISE EXCEPTION 'RM-005: expected original same_restaurant FOR ALL policy absent: abort';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='restaurant_hours'
      AND policyname='writer_access' AND cmd='ALL'
  ) THEN
    RAISE EXCEPTION 'RM-005: expected internal writer_access policy absent: abort';
  END IF;
END
$rm005_guard$;

-- Remove the permissive authenticated ALL policy; SELECT remains tenant-scoped.
DROP POLICY same_restaurant ON public.restaurant_hours;
CREATE POLICY same_restaurant ON public.restaurant_hours
  FOR SELECT TO authenticated,resto_service_writer
  USING (restaurant_id=(SELECT private.staff_restaurant()));

-- Both roles may read their own restaurant; receptionist cannot UPDATE.
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

-- Do not touch writer_access, stored hours, room data, reservations or user accounts.
-- Capture updated policy definitions, audit, and record a restore point before final COMMIT.
COMMIT;
