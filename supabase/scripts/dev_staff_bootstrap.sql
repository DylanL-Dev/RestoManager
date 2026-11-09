-- RestoManager-DEV ONLY. Run after creating two test users in Supabase Auth Dashboard.
-- Never execute against production. No passwords, secrets, or real reservations are copied.
-- This migration binds DEV-only Supabase Auth users to the restaurant's two staff roles.
BEGIN;
DO $bootstrap$
DECLARE
  v_restaurant uuid := '71b6ee5c-5cc2-4934-babd-726770345367';
  v_reception uuid;
  v_fb uuid;
BEGIN
  -- Fail closed on any database carrying real bookings or staff.
  IF EXISTS (SELECT 1 FROM public.reservations)
     OR EXISTS (SELECT 1 FROM public.staff_profiles)
     OR NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id=v_restaurant) THEN
    RAISE EXCEPTION 'Refus : cette initialisation est réservée à une base DEV vide.';
  END IF;
  SELECT id INTO v_reception FROM auth.users
   WHERE lower(email)='reception@accounts.restomanager.example.com'
     AND email_confirmed_at IS NOT NULL;
  SELECT id INTO v_fb FROM auth.users
   WHERE lower(email)='admin-fb@accounts.restomanager.example.com'
     AND email_confirmed_at IS NOT NULL;
  IF v_reception IS NULL OR v_fb IS NULL OR v_reception=v_fb THEN
    RAISE EXCEPTION 'Créer et confirmer les deux utilisateurs de test dans Supabase Auth avant de lancer ce script.';
  END IF;
  INSERT INTO public.staff_profiles (user_id, role, display_name, active, restaurant_id)
  VALUES (v_reception,'reception','Réception — TEST',true,v_restaurant),
         (v_fb,'fb_admin','Restaurant — TEST',true,v_restaurant);
END
$bootstrap$;
COMMIT;

-- After running, verify with:
-- select role, display_name, active from public.staff_profiles order by role;
-- select count(*) from public.reservations; -- must remain 0 until tests begin
