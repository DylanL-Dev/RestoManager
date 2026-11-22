-- RM-017.2.1 / 22 novembre 2026. DEV only. No PROD or public enrollment.
-- Never open the Auth signup or RM-017 runtime flags before SMTP, email
-- confirmation, allowed redirects, Turnstile and invite-based tests pass.
BEGIN;
CREATE TABLE private.rm017_pilot_invites (
  email text PRIMARY KEY,
  establishment_type text NOT NULL CHECK (establishment_type IN ('independent','hotel')),
  expires_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  consumed_by uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 6 AND 160
      AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'),
  CHECK ((consumed_by IS NULL) = (consumed_at IS NULL))
);
ALTER TABLE private.rm017_pilot_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.rm017_pilot_invites FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE private.rm017_pilot_invites
 IS 'DEV pilot email allowlist. Empty by default; never publicly accessible. Each entry is one-time and expires.';

CREATE OR REPLACE FUNCTION public.rm017_complete_signup_v1(
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
 v_pilot_email text;
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
 -- A verified email is necessary, but never sufficient: this is a private pilot.
 -- This row is locked, expires, and is consumed atomically with provisioning.
 SELECT i.email INTO v_pilot_email
 FROM private.rm017_pilot_invites AS i
 WHERE i.email = pg_catalog.lower(pg_catalog.btrim(v_email))
   AND i.establishment_type = p_type
   AND i.active
   AND i.expires_at > now()
   AND i.consumed_at IS NULL
 FOR UPDATE;
 IF v_pilot_email IS NULL THEN
   RAISE EXCEPTION 'Inscription pilote réservée aux adresses invitées.'
     USING ERRCODE='42501';
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
 UPDATE private.rm017_pilot_invites
    SET consumed_by = v_uid, consumed_at = now()
  WHERE email = v_pilot_email AND consumed_at IS NULL;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Invitation déjà utilisée.' USING ERRCODE='42501';
 END IF;
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
 IS 'DEV RM-017.2.1: verified email + explicit expiring one-time pilot invitation; keeps database signup gate and transaction-safe tenant initialization.';
COMMIT;
