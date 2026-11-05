-- RestoManager V3: propagate F&B fusion changes to connected clients.
-- Apply once to the Supabase V3 project after reviewing the existing publication.
-- This does not change RLS or grant additional table privileges.
DO $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_publication_tables
  WHERE pubname='supabase_realtime'
    AND schemaname='public'
    AND tablename='table_fusion_links'
 ) THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.table_fusion_links;
 END IF;
END $$;
