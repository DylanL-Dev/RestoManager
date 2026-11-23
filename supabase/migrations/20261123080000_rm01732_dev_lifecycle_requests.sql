-- RM-017.3.2 — NON DESTRUCTIVE account/establishment lifecycle queue (DEV ONLY).
-- Never apply to Supabase PROD without a separate approved release.
-- No real account, restaurant, reservation or employee is modified by this migration.
BEGIN;

-- Two independent server gates, both default CLOSED. There is deliberately no
-- delete/suspend/archive function in this release; requests are only metadata.
CREATE TABLE private.rm017_lifecycle_gate (
  id smallint PRIMARY KEY CHECK (id = 1),
  requests_enabled boolean NOT NULL DEFAULT false,
  reviews_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.rm017_lifecycle_gate (id,requests_enabled,reviews_enabled)
VALUES (1,false,false);
ALTER TABLE private.rm017_lifecycle_gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rm017_lifecycle_gate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.rm017_lifecycle_gate FROM PUBLIC,anon,authenticated;

CREATE TABLE public.rm017_lifecycle_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('account_deletion','restaurant_closure')),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','reviewing','closed_reviewed','closed_rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  CONSTRAINT rm01732_request_scope CHECK (
    (kind='account_deletion' AND restaurant_id IS NULL)
    OR (kind='restaurant_closure' AND restaurant_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX rm01732_one_active_request
 ON public.rm017_lifecycle_requests (
   requested_by,kind,COALESCE(restaurant_id,'00000000-0000-0000-0000-000000000000'::uuid)
 ) WHERE status IN ('requested','reviewing');
CREATE INDEX rm01732_admin_inbox
 ON public.rm017_lifecycle_requests (status,created_at DESC);
ALTER TABLE public.rm017_lifecycle_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rm017_lifecycle_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.rm017_lifecycle_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.rm017_lifecycle_requests TO authenticated;

-- Only the authenticated requesting user can see their own requests.
CREATE POLICY rm01732_read_self ON public.rm017_lifecycle_requests
 FOR SELECT TO authenticated
 USING (requested_by = (SELECT auth.uid()));
-- Root access is derived from the revocable, server-owned platform_admins row.
-- The platform_admins table already uses self-only SELECT RLS.
CREATE POLICY rm01732_read_active_root ON public.rm017_lifecycle_requests
 FOR SELECT TO authenticated
 USING (EXISTS (
   SELECT 1 FROM public.platform_admins AS p
   WHERE p.user_id = (SELECT auth.uid())
     AND p.role = 'platform_admin' AND p.active = true
 ));
-- No client-side INSERT, UPDATE or DELETE policy.

CREATE TABLE private.rm017_lifecycle_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES public.rm017_lifecycle_requests(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK (action IN ('requested','reviewing','closed_reviewed','closed_rejected')),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.rm017_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rm017_lifecycle_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.rm017_lifecycle_events FROM PUBLIC,anon,authenticated;

-- Request intake only: no deletion, archiving or suspension. Never trust
-- p_requested_by from a client; use the signed-in Supabase Auth user.
CREATE FUNCTION public.rm017_lifecycle_request_v1(
 p_kind text, p_restaurant_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_uid uuid := auth.uid();
 v_id uuid;
BEGIN
 IF v_uid IS NULL THEN
   RAISE EXCEPTION 'Authentification nécessaire' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM private.rm017_lifecycle_gate
   WHERE id=1 AND requests_enabled=true
 ) THEN
   RAISE EXCEPTION 'Demandes de gestion non ouvertes' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM auth.users AS u WHERE u.id=v_uid
   AND u.email_confirmed_at IS NOT NULL
   AND u.is_anonymous=false AND u.deleted_at IS NULL
 ) THEN
   RAISE EXCEPTION 'Compte non vérifié' USING ERRCODE='42501';
 END IF;
 IF p_kind='account_deletion' THEN
   IF p_restaurant_id IS NOT NULL THEN
     RAISE EXCEPTION 'La demande de compte ne cible pas un établissement'
       USING ERRCODE='22023';
   END IF;
 ELSIF p_kind='restaurant_closure' THEN
   IF p_restaurant_id IS NULL OR NOT EXISTS(
     SELECT 1 FROM public.rm017_establishment_profiles AS p
     WHERE p.restaurant_id=p_restaurant_id AND p.created_by=v_uid
   ) THEN
     RAISE EXCEPTION 'Seul le propriétaire vérifié peut demander la fermeture'
       USING ERRCODE='42501';
   END IF;
 ELSE
   RAISE EXCEPTION 'Type de demande non autorisé' USING ERRCODE='22023';
 END IF;

 INSERT INTO public.rm017_lifecycle_requests(kind,requested_by,restaurant_id)
 VALUES (p_kind,v_uid,p_restaurant_id) RETURNING id INTO v_id;
 INSERT INTO private.rm017_lifecycle_events(request_id,action,actor_id)
 VALUES (v_id,'requested',v_uid);
 RETURN pg_catalog.jsonb_build_object(
   'request_id',v_id,'status','requested','kind',p_kind,
   'execution','none','message','Demande enregistrée, aucune suppression effectuée'
 );
END;
$$;
REVOKE ALL ON FUNCTION public.rm017_lifecycle_request_v1(text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm017_lifecycle_request_v1(text,uuid)
 TO authenticated;

-- Root can ONLY annotate the request's review status. It cannot act on
-- accounts, reservations, staff, or restaurants. AAL2 and separate server
-- enablement are compulsory, even for an existing platform_admin.
CREATE FUNCTION public.rm017_lifecycle_review_v1(
 p_request_id uuid, p_decision text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_uid uuid := auth.uid();
 v_status text;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.platform_admins
   WHERE user_id=v_uid AND role='platform_admin' AND active=true
 ) THEN
   RAISE EXCEPTION 'Réservé au Créateur autorisé' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM private.rm017_lifecycle_gate
   WHERE id=1 AND reviews_enabled=true
 ) THEN
   RAISE EXCEPTION 'Examen Root non activé' USING ERRCODE='42501';
 END IF;
 IF COALESCE(auth.jwt()->>'aal','') <> 'aal2' THEN
   RAISE EXCEPTION 'Une authentification multifacteur est requise'
     USING ERRCODE='42501';
 END IF;
 IF p_decision NOT IN ('reviewing','closed_reviewed','closed_rejected')
    OR p_decision IS NULL THEN
   RAISE EXCEPTION 'Décision Root inconnue' USING ERRCODE='22023';
 END IF;

 SELECT status INTO v_status
 FROM public.rm017_lifecycle_requests
 WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Demande introuvable' USING ERRCODE='22023';
 END IF;
 IF NOT (
   (v_status='requested' AND p_decision IN ('reviewing','closed_rejected'))
   OR (v_status='reviewing' AND p_decision IN ('closed_reviewed','closed_rejected'))
 ) THEN
   RAISE EXCEPTION 'Transition interdite' USING ERRCODE='22023';
 END IF;
 UPDATE public.rm017_lifecycle_requests
 SET status=p_decision,updated_at=now(),reviewed_at=now(),reviewed_by=v_uid
 WHERE id=p_request_id;
 INSERT INTO private.rm017_lifecycle_events(request_id,action,actor_id)
 VALUES(p_request_id,p_decision,v_uid);
 RETURN pg_catalog.jsonb_build_object(
   'request_id',p_request_id,'status',p_decision,'execution','none',
   'message','Statut de suivi seulement, aucune action sur les données'
 );
END;
$$;
REVOKE ALL ON FUNCTION public.rm017_lifecycle_review_v1(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm017_lifecycle_review_v1(uuid,text)
 TO authenticated;

COMMENT ON TABLE public.rm017_lifecycle_requests IS
 'RM-017.3.2 DEV: non-destructive requests and read-only metadata; real erasure not implemented';
COMMENT ON FUNCTION public.rm017_lifecycle_review_v1(uuid,text) IS
 'Review status only, AAL2 & disabled-by-default server gate. No delete, suspension or archiving.';
COMMIT;
