-- Connected RestoManager read-only hold snapshot access.
-- Staff-facing RLS already requires same restaurant and role.
-- Never expose owner_token or allow direct hold writes to authenticated users.
grant select (id,table_id,draft_role,held_by,starts_at,ends_at,expires_at,created_at)
on public.table_holds to authenticated;
