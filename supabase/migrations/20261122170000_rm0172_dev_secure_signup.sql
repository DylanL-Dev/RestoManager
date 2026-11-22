-- RM-017.2 — DEV-only onboarding, email-verified bootstrap, tenant RLS.
-- Must never be applied on Supabase PROD without separate authorization and audited release.
-- Assumes the existing public.restaurants, staff_profiles, restaurant_hours and restaurant_rooms schema.
BEGIN;

-- Existing permissive SELECT/ALL policies were OR-combined with same_restaurant.
-- They leaked tenant rows to any employee with a valid fb_admin/reception role.
ALTER POLICY reservations_staff_read ON public.reservations
 USING (restaurant_id = (select private.staff_restaurant())
        AND (select private.current_staff_role()) IN ('reception','fb_admin'));
ALTER POLICY reservation_tables_staff_read ON public.reservation_tables
 USING (restaurant_id = (select private.staff_restaurant())
        AND (select private.current_staff_role()) IN ('reception','fb_admin'));
ALTER POLICY tables_staff_read ON public.restaurant_tables
 USING (restaurant_id = (select private.staff_restaurant())
        AND (select private.current_staff_role()) IN ('reception','fb_admin'));
ALTER POLICY tables_admin_insert ON public.restaurant_tables
 WITH CHECK (restaurant_id = (select private.staff_restaurant())
             AND (select private.current_staff_role()) = 'fb_admin');
ALTER POLICY tables_admin_update ON public.restaurant_tables
 USING (restaurant_id = (select private.staff_restaurant())
        AND (select private.current_staff_role()) = 'fb_admin')
 WITH CHECK (restaurant_id = (select private.staff_restaurant())
             AND (select private.current_staff_role()) = 'fb_admin');
ALTER POLICY "fb alerts read" ON public.fb_reservation_alerts
 USING (restaurant_id = (select private.staff_restaurant())
        AND (select private.current_staff_role()) = 'fb_admin');
ALTER POLICY "fb alerts mark read" ON public.fb_reservation_alerts
 USING (restaurant_id = (select private.staff_restaurant())
        AND (select private.current_staff_role()) = 'fb_admin')
 WITH CHECK (restaurant_id = (select private.staff_restaurant())
             AND (select private.current_staff_role()) = 'fb_admin');
ALTER POLICY "fb manage fusion links" ON public.table_fusion_links
 USING (restaurant_id = (select private.staff_restaurant())
        AND (select private.current_staff_role()) = 'fb_admin')
 WITH CHECK (restaurant_id = (select private.staff_restaurant())
             AND (select private.current_staff_role()) = 'fb_admin');
ALTER POLICY "staff read fusion links" ON public.table_fusion_links
 USING (restaurant_id = (select private.staff_restaurant())
        AND (select private.current_staff_role()) IN ('reception','fb_admin'));
ALTER POLICY holds_staff_read ON public.table_holds
 USING (restaurant_id = (select private.staff_restaurant())
        AND (select private.current_staff_role()) IN ('reception','fb_admin'));
ALTER POLICY active_profile ON public.staff_profiles
 USING (active AND restaurant_id = (select private.staff_restaurant()));

-- A profile contains information about an establishment, never credentials.
CREATE TABLE public.rm017_establishment_profiles(
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  establishment_type text NOT NULL CHECK (establishment_type IN ('independent','hotel')),
  city text NOT NULL CHECK (length(btrim(city)) BETWEEN 2 AND 80),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'configuration_required'
   CHECK (status IN ('configuration_required','configured')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rm017_establishment_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rm017_establishment_profiles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rm017_establishment_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.rm017_establishment_profiles TO authenticated;
CREATE POLICY rm017_current_restaurant_read ON public.rm017_establishment_profiles
 FOR SELECT TO authenticated USING
 (restaurant_id = (select private.staff_restaurant()) AND
  (select private.current_staff_role()) IN ('fb_admin','reception'));

-- DEV release gate: do not accept new accounts before SMTP, Confirm Email
-- and allowed redirect domains have been verified by the operator.
CREATE TABLE private.rm017_signup_gate(
 id integer PRIMARY KEY CHECK(id=1),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.rm017_signup_gate(id,enabled) VALUES(1,false);
REVOKE ALL ON TABLE private.rm017_signup_gate FROM PUBLIC,anon,authenticated;

-- Controlled transaction: no direct restaurant/profile INSERT for users.
-- JWT user_metadata is intentionally not trusted for authorization.
-- A verified authenticated user can provision one new restaurant, once.
CREATE FUNCTION public.rm017_complete_signup_v1(
 p_name text, p_city text, p_type text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_uid uuid := auth.uid();
 v_name text := pg_catalog.btrim(p_name);
 v_city text := pg_catalog.btrim(p_city);
 v_email text;
 v_restaurant uuid;
 v_previous_sub text;
 v_previous_claims text;
BEGIN
 IF v_uid IS NULL THEN
   RAISE EXCEPTION 'Inscription non autorisée' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM private.rm017_signup_gate
                WHERE id=1 AND enabled) THEN
   RAISE EXCEPTION 'Inscriptions non ouvertes dans cet environnement.'
   USING ERRCODE='42501';
 END IF;
 SELECT u.email INTO v_email FROM auth.users AS u
 WHERE u.id=v_uid AND u.email_confirmed_at IS NOT NULL
   AND u.is_anonymous = false AND u.deleted_at IS NULL
   AND u.email IS NOT NULL AND length(u.email) > 3;
 IF v_email IS NULL THEN
   RAISE EXCEPTION 'Vérifiez votre adresse email avant de continuer.'
   USING ERRCODE='42501';
 END IF;
 IF v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 90 OR
    v_city IS NULL OR length(v_city) NOT BETWEEN 2 AND 80 OR
    p_type NOT IN ('independent','hotel') OR p_type IS NULL THEN
    RAISE EXCEPTION 'Informations d’établissement invalides.'
    USING ERRCODE='22023';
 END IF;
 -- Serialize two concurrent requests from the same verified account.
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('rm017-signup:'||v_uid::text,0)
 );
 IF EXISTS (SELECT 1 FROM public.staff_profiles WHERE user_id=v_uid) THEN
   RAISE EXCEPTION 'Ce compte appartient déjà à un établissement.'
   USING ERRCODE='23505';
 END IF;
 -- The existing AFTER INSERT triggers initialize closed hours and closure policy.
 -- Their direct-service guard treats a JWT-bearing user as an existing staff
 -- member; this first-time creator has no staff profile yet.
 -- Enter the existing no-JWT administrative maintenance scope ONLY around the
 -- fixed INSERT (not around any user-controlled SQL); then restore both claims.
 -- SET LOCAL rolls back automatically if any trigger/statement raises an error.
 v_previous_sub := current_setting('request.jwt.claim.sub',true);
 v_previous_claims := current_setting('request.jwt.claims',true);
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','',true);
 PERFORM pg_catalog.set_config('request.jwt.claims','',true);
 INSERT INTO public.restaurants(name) VALUES(v_name) RETURNING id INTO v_restaurant;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',coalesce(v_previous_sub,''),true);
 PERFORM pg_catalog.set_config('request.jwt.claims',coalesce(v_previous_claims,''),true);
 INSERT INTO public.rm017_establishment_profiles
   (restaurant_id,establishment_type,city,created_by)
 VALUES (v_restaurant,p_type,v_city,v_uid);
 INSERT INTO public.staff_profiles(user_id,role,display_name,active,restaurant_id)
 VALUES (v_uid,'fb_admin','Responsable',true,v_restaurant);
 -- Existing initialize_hours and rm012_initialize_policy triggers create
 -- closed default service rules atomically on the new restaurant.
 -- Do not insert a duplicate restaurant_hours row.
 INSERT INTO public.restaurant_rooms(restaurant_id,name,active,sort_order)
 VALUES(v_restaurant,'Salle principale',true,0);
 RETURN pg_catalog.jsonb_build_object(
  'restaurant_id',v_restaurant,'type',p_type,
  'status','configuration_required');
END;
$$;
REVOKE ALL ON FUNCTION public.rm017_complete_signup_v1(text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm017_complete_signup_v1(text,text,text)
 TO authenticated;
COMMENT ON FUNCTION public.rm017_complete_signup_v1(text,text,text)
 IS 'DEV RM-017.2: bootstrap a single restaurant for an email-verified user; grants authenticated only. No public booking activation.';
COMMIT;
