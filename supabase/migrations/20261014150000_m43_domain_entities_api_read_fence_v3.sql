-- M43 DATA API confidentiality: RLS filters rows, not sensitive JSONB columns.
-- All canonical domain reads in app use role-aware SECURITY DEFINER RPCs.
-- Do not grant direct Data API SELECT of body/publishedSnapshot/events to Client.
BEGIN;
REVOKE SELECT ON TABLE public.domain_entities_v26 FROM PUBLIC, anon, authenticated;
COMMIT;
