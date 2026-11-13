-- RM-005: private helper is called from SECURITY DEFINER RPCs owned by resto_service_writer.
-- PostgreSQL requires an explicit function EXECUTE grant for that internal role.
-- Keep the helper inaccessible to ordinary browser roles and keep its schema private.
REVOKE ALL ON FUNCTION private.restaurant_service_open_at_v1(uuid,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.restaurant_service_open_at_v1(uuid,timestamptz)
  TO resto_service_writer;
-- No grants on schema private and no change to public RPC authorization.
