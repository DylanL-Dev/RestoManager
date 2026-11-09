-- RestoManager DEV / migration parity — 2026-11-09
-- Recreates the exact column-level grants already present in PROD.
-- The missing rights caused PostgreSQL 42501 on notification acknowledgment.
-- Does NOT grant broad UPDATE/INSERT access or reveal secret hold tokens.
GRANT UPDATE (read_at) ON TABLE public.fb_reservation_alerts TO authenticated;
GRANT UPDATE (read_at) ON TABLE public.reservation_change_alerts TO authenticated;
GRANT INSERT (restaurant_id, submitted_by, submitted_role, kind, severity, title, description, reply_contact, screen) ON TABLE public.platform_reports TO authenticated;
GRANT UPDATE (status) ON TABLE public.platform_reports TO authenticated;
-- RLS on the tables remains enforced (Reception/Restaurant permissions unchanged).
