-- RM-017.2.2 DEV — Mandatory official SIRET verification before new Auth user
-- creation and before initial restaurant provisioning.
-- All gates remain CLOSED; external API failures fail closed. Never apply to PROD.
BEGIN;
ALTER TABLE public.rm017_establishment_profiles
 ADD COLUMN siret text,
 ADD COLUMN siren text,
 ADD COLUMN verified_legal_name text,
 ADD COLUMN siret_verified_at timestamptz;
ALTER TABLE public.rm017_establishment_profiles
 ADD CONSTRAINT rm01722_registered_siret_format CHECK
 (siret IS NULL OR (siret ~ '^[0-9]{14}$'
                    AND siren=substring(siret from 1 for 9)
                    AND verified_legal_name IS NOT NULL
                    AND siret_verified_at IS NOT NULL));
CREATE UNIQUE INDEX rm01722_registered_siret_unique
 ON public.rm017_establishment_profiles(siret) WHERE siret IS NOT NULL;

-- Only the DEV server's service_role RPC can insert official registry evidence.
-- Never grant authenticated/anon INSERT to this table or expose private schema.
CREATE TABLE private.rm017_siret_prechecks(
 email text PRIMARY KEY,
 siret text NOT NULL CHECK (siret ~ '^[0-9]{14}$'),
 siren text NOT NULL CHECK (siren ~ '^[0-9]{9}$'),
 establishment_type text NOT NULL CHECK(establishment_type IN ('hotel','independent')),
 legal_name text NOT NULL CHECK (length(legal_name) BETWEEN 2 AND 180),
 city text NOT NULL CHECK(length(city) BETWEEN 2 AND 80),
 checked_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 consumed_restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
 CHECK (substring(siret from 1 for 9)=siren)
);
ALTER TABLE private.rm017_siret_prechecks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.rm017_siret_prechecks FROM PUBLIC,anon,authenticated;

-- Per-invitation hourly lookup ceiling to avoid consuming public API quotas.
CREATE TABLE private.rm017_siret_lookup_attempts(
 email text PRIMARY KEY,
 window_started_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 20)
);
ALTER TABLE private.rm017_siret_lookup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.rm017_siret_lookup_attempts FROM PUBLIC,anon,authenticated;

-- Fail-closed preflight. Service_role only. No enumeration via public RPC.
CREATE FUNCTION public.rm017_siret_preflight_v1(
 p_email text,p_type text,p_siret text
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$
 SELECT EXISTS(
   SELECT 1 FROM private.rm017_signup_gate g WHERE g.id=1 AND g.enabled
 ) AND EXISTS(
   SELECT 1 FROM private.rm017_pilot_invites i
   WHERE i.email=pg_catalog.lower(pg_catalog.btrim(p_email))
    AND i.establishment_type=p_type AND i.active AND i.expires_at>now()
    AND i.consumed_at IS NULL
 ) AND p_siret ~ '^[0-9]{14}$'
 AND NOT EXISTS(
   SELECT 1 FROM public.rm017_establishment_profiles e WHERE e.siret=p_siret
 );
$$;
REVOKE ALL ON FUNCTION public.rm017_siret_preflight_v1(text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm017_siret_preflight_v1(text,text,text) TO service_role;


-- Called once for each external registry lookup, never from the browser.
CREATE FUNCTION public.rm017_siret_allow_lookup_v1(
 p_email text,p_type text,p_siret text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $
DECLARE v_email text:=pg_catalog.lower(pg_catalog.btrim(p_email));
 v_attempts integer;
BEGIN
 IF NOT public.rm017_siret_preflight_v1(v_email,p_type,p_siret)
 THEN RETURN false; END IF;
 INSERT INTO private.rm017_siret_lookup_attempts(email,attempts)
 VALUES (v_email,1)
 ON CONFLICT(email) DO UPDATE
 SET attempts=CASE WHEN private.rm017_siret_lookup_attempts.window_started_at<now()-interval '1 hour'
                   THEN 1 ELSE pg_catalog.least(private.rm017_siret_lookup_attempts.attempts+1,20) END,
     window_started_at=CASE WHEN private.rm017_siret_lookup_attempts.window_started_at<now()-interval '1 hour'
                            THEN now() ELSE private.rm017_siret_lookup_attempts.window_started_at END
 RETURNING attempts INTO v_attempts;
 RETURN v_attempts<=6;
END;
$;
REVOKE ALL ON FUNCTION public.rm017_siret_allow_lookup_v1(text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm017_siret_allow_lookup_v1(text,text,text) TO service_role;

-- Called only AFTER the Edge function verified a real active matching SIRET
-- at the government registry; this function cannot be called by the browser.
CREATE FUNCTION public.rm017_record_siret_v1(
 p_email text,p_type text,p_siret text,
 p_legal_name text,p_city text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_email text:=pg_catalog.lower(pg_catalog.btrim(p_email));
 v_name text:=pg_catalog.btrim(p_legal_name);
 v_city text:=pg_catalog.btrim(p_city);
BEGIN
 IF NOT public.rm017_siret_preflight_v1(v_email,p_type,p_siret)
 OR v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 180
 OR v_city IS NULL OR length(v_city) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Vérification professionnelle refusée.' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rm01722:siret:'||p_siret,0));
 IF EXISTS(SELECT 1 FROM public.rm017_establishment_profiles e WHERE e.siret=p_siret) THEN
   RAISE EXCEPTION 'SIRET déjà enregistré.' USING ERRCODE='23505';
 END IF;
 INSERT INTO private.rm017_siret_prechecks(
  email,siret,siren,establishment_type,legal_name,city,checked_at,expires_at
 ) VALUES(
  v_email,p_siret,pg_catalog.substring(p_siret from 1 for 9),
  p_type,v_name,v_city,now(),now()+interval '48 hours'
 )
 ON CONFLICT (email) DO UPDATE SET
  siret=EXCLUDED.siret,siren=EXCLUDED.siren,
  establishment_type=EXCLUDED.establishment_type,
  legal_name=EXCLUDED.legal_name,city=EXCLUDED.city,
  checked_at=EXCLUDED.checked_at,expires_at=EXCLUDED.expires_at
 WHERE private.rm017_siret_prechecks.consumed_at IS NULL;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Vérification déjà utilisée.' USING ERRCODE='42501';
 END IF;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.rm017_record_siret_v1(text,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm017_record_siret_v1(text,text,text,text,text) TO service_role;

-- The previous email/invitation checks and closure triggers are preserved.
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
 v_siret text;
 v_siren text;
 v_legal_name text;
 v_siret_checked_at timestamptz;
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
 -- The SIRET in editable Auth metadata is only a lookup key. All proof data
 -- must have been recorded SERVER-SIDE by rm017-siret after a real official lookup.
 SELECT pg_catalog.btrim(u.raw_user_meta_data->>'rm017_siret') INTO v_siret
 FROM auth.users u WHERE u.id=v_uid;
 IF v_siret IS NULL OR v_siret !~ '^[0-9]{14}
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
   (restaurant_id,establishment_type,city,created_by,
    siret,siren,verified_legal_name,siret_verified_at)
 VALUES (v_restaurant,p_type,v_city,v_uid,
         v_siret,v_siren,v_legal_name,v_siret_checked_at);
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
 UPDATE private.rm017_siret_prechecks
    SET consumed_at=now(),consumed_restaurant_id=v_restaurant
 WHERE email=pg_catalog.lower(pg_catalog.btrim(v_email))
   AND siret=v_siret AND consumed_at IS NULL;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Vérification SIRET déjà utilisée.' USING ERRCODE='42501';
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'restaurant_id',v_restaurant,'type',p_type,
  'status','configuration_required');
END;
$$;

 THEN
   RAISE EXCEPTION 'Un SIRET vérifié est obligatoire.' USING ERRCODE='42501';
 END IF;
 SELECT p.siren,p.legal_name,p.checked_at
 INTO v_siren,v_legal_name,v_siret_checked_at
 FROM private.rm017_siret_prechecks p
 WHERE p.email=pg_catalog.lower(pg_catalog.btrim(v_email))
   AND p.siret=v_siret AND p.establishment_type=p_type
   AND p.expires_at>now() AND p.consumed_at IS NULL
 FOR UPDATE;
 IF v_siren IS NULL THEN
   RAISE EXCEPTION 'Vérification SIRET absente ou expirée.' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM public.rm017_establishment_profiles WHERE siret=v_siret) THEN
   RAISE EXCEPTION 'Établissement déjà enregistré : demandez un accès.'
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

-- Existing Auth Hook remains opt-in in Supabase Auth settings. It now also
-- requires server-verified SIRET evidence prior to creation of Auth users.
CREATE OR REPLACE FUNCTION public.rm017_before_user_created_v1(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_email text := pg_catalog.lower(pg_catalog.btrim(event->'user'->>'email'));
  v_type text := event->'user'->'user_metadata'->>'rm017_type';
  v_siret text := event->'user'->'user_metadata'->>'rm017_siret';
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.rm017_signup_gate WHERE id=1 AND enabled)
     OR v_email IS NULL OR v_type IS NULL
     OR NOT EXISTS(
        SELECT 1 FROM private.rm017_pilot_invites i
        WHERE i.email=v_email AND i.establishment_type=v_type
          AND i.active AND i.expires_at>now() AND i.consumed_at IS NULL
     )
     OR v_siret IS NULL OR v_siret !~ '^[0-9]{14}
    RETURN pg_catalog.jsonb_build_object(
      'error',pg_catalog.jsonb_build_object(
        'http_code',403,'message','Inscription sur invitation uniquement.'
      )
    );
  END IF;
  RETURN '{}'::jsonb;
END;
$$;

     OR NOT EXISTS(
        SELECT 1 FROM private.rm017_siret_prechecks p
        WHERE p.email=v_email AND p.establishment_type=v_type
          AND p.siret=v_siret AND p.expires_at>now()
          AND p.consumed_at IS NULL
     )
     OR EXISTS(
       SELECT 1 FROM public.rm017_establishment_profiles e WHERE e.siret=v_siret
     ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'error',pg_catalog.jsonb_build_object(
        'http_code',403,'message','Inscription sur invitation uniquement.'
      )
    );
  END IF;
  RETURN '{}'::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.rm017_before_user_created_v1(jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm017_before_user_created_v1(jsonb)
 TO supabase_auth_admin;

COMMENT ON FUNCTION public.rm017_complete_signup_v1(text,text,text)
 IS 'RM-017.2.2 DEV: confirmed email + invited profile + server-verified unique SIRET, atomic restaurant creation.';
COMMIT;
