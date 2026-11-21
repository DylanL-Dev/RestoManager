-- RestoManager RM-005: READ-ONLY production preflight.
-- Run against DEV and PROD separately. No DDL/DML, no credentials, no customer rows.
-- This query returns a single audit JSON document to capture before any migration.
SELECT jsonb_pretty(
 jsonb_build_object(
  'checked_at', now(),
  'columns_restaurant_hours',
   (SELECT coalesce(jsonb_agg(column_name ORDER BY ordinal_position),'[]'::jsonb)
    FROM information_schema.columns WHERE table_schema='public' AND table_name='restaurant_hours'),
  'hour_policies',
   (SELECT coalesce(jsonb_agg(jsonb_build_object('policy',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check) ORDER BY policyname),'[]'::jsonb)
    FROM pg_policies WHERE schemaname='public' AND tablename='restaurant_hours'),
  'related_rpc_names',
   (SELECT coalesce(jsonb_agg(n.nspname||'.'||p.proname ORDER BY n.nspname,p.proname),'[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('private','public')
      AND p.proname IN ('create_fusion_chain_v1','restaurant_service_open_at_v1',
      'install_walkin_group_v3','install_walkin_group_v4','reception_booking_v3',
      'booking_draft_v3','reception_update_reservation_v4','require_named_exterior_guest',
      'reject_closed_weekly_service','validate_restaurant_weekly_schedule')),
  'reservation_trigger_names',
   (SELECT coalesce(jsonb_agg(t.tgname ORDER BY t.tgname),'[]'::jsonb)
    FROM pg_trigger t WHERE t.tgrelid='public.reservations'::regclass AND NOT t.tgisinternal),
  'restaurant_hours_summary',
   (SELECT coalesce(jsonb_agg(jsonb_build_object('restaurant_id',h.restaurant_id,
    'lunch_enabled',h.lunch_enabled,'lunch_start',h.lunch_start,'lunch_end',h.lunch_end,
    'dinner_enabled',h.dinner_enabled,'dinner_start',h.dinner_start,'dinner_end',h.dinner_end,
    'duration',h.duration) ORDER BY h.restaurant_id),'[]'::jsonb)
    FROM public.restaurant_hours h),
  'future_active_reservations_count',
   (SELECT count(*) FROM public.reservations
     WHERE starts_at >= now() AND status IN ('reserved','confirmed','late','arrived','seated'))
 )
) AS preflight_report;
