-- RestoManager: restore security-sensitive Postgres privileges in a newly cloned
-- Supabase project. Production already has these permissions; on DEV they were
-- missing despite matching tables/functions/policies.
--
-- In Postgres 17, a role membership with INHERIT FALSE means SECURITY DEFINER
-- functions owned by resto_service_writer cannot access auth.uid().
-- Mirror the production role membership without granting any user login.
GRANT authenticated TO resto_service_writer WITH INHERIT TRUE;

-- The client deliberately reads only nonsensitive hold fields.
-- NEVER grant SELECT on owner_token (temporary secret) or restaurant_id
-- (tenant identifier). Existing RLS policies must remain enabled.
GRANT SELECT (id,table_id,held_by,starts_at,ends_at,expires_at,created_at,draft_role)
ON public.table_holds TO authenticated;
