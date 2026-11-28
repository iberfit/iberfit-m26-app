-- Private receipt inbox. No public RPC, no report/evidence read, no activation.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$ BEGIN
 IF to_regclass('private.gx_connected360_document_request_v1') IS NULL
 OR to_regclass('private.gx_connected360_document_decision_v1') IS NULL
 OR to_regprocedure('private.m26_v49_live_session()') IS NULL
 THEN RAISE EXCEPTION 'GX_DOCUMENT_INBOX_PREREQUISITES'; END IF;
END $guard$;
CREATE FUNCTION private.gx_document_inbox_v1(p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE actor uuid:=auth.uid(); client uuid:=public.iberfit_client_id(); anchor_time timestamptz; result jsonb;
BEGIN
 IF actor IS NULL OR client IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
 OR NOT private.m26_v49_live_session() OR public.iberfit_current_role_v26() IS DISTINCT FROM 'cliente'
 OR NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.user_id=actor AND p.client_id=client AND p.role::text='client')
 OR EXISTS(SELECT 1 FROM public.user_application_roles p WHERE p.user_id=actor AND p.active AND p.role::text IN ('coach','admin'))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_INBOX_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Receipt-only, including stale/withdrawn grants; revocation must not require
 -- connection or consultation permission. Cursor belongs to the same owner.
 IF p_after IS NOT NULL THEN
  SELECT requested_at INTO anchor_time FROM private.gx_connected360_document_request_v1 WHERE id=p_after AND owner_id=actor AND client_id=client;
  IF NOT FOUND THEN RAISE EXCEPTION 'GX_DOCUMENT_INBOX_CURSOR_STALE' USING ERRCODE='40001'; END IF;
 END IF;
 WITH page AS MATERIALIZED (
  SELECT q.id,q.report_id,q.report_revision,q.provider,q.period_start,q.period_end,q.requested_at
  FROM private.gx_connected360_document_request_v1 q
  WHERE q.owner_id=actor AND q.client_id=client
  AND (p_after IS NULL OR (q.requested_at,q.id)<(anchor_time,p_after))
  ORDER BY q.requested_at DESC,q.id DESC LIMIT 21
 ), visible AS (
  SELECT * FROM page ORDER BY requested_at DESC,id DESC LIMIT 20
 ), receipts AS (
  SELECT v.id,v.requested_at,pg_catalog.jsonb_build_object('requestId',v.id,'reportId',v.report_id,
  'reportRevision',v.report_revision,'provider',v.provider,'periodStart',v.period_start,'periodEnd',v.period_end,
  'revision',coalesce(d.revision,0),'decision',coalesce(d.decision,'pending')) AS item
  FROM visible v LEFT JOIN LATERAL (SELECT revision,decision FROM private.gx_connected360_document_decision_v1 WHERE request_id=v.id ORDER BY revision DESC LIMIT 1) d ON true
 )
 SELECT pg_catalog.jsonb_build_object('schema','iberfit.connected360.document-inbox.v1','clientId',client,'after',p_after,
 'items',coalesce((SELECT jsonb_agg(item ORDER BY requested_at DESC,id DESC) FROM receipts),'[]'::jsonb),
 'nextAfter',CASE WHEN (SELECT count(*) FROM page)>20 THEN (SELECT id FROM visible ORDER BY requested_at,id LIMIT 1) ELSE NULL END) INTO result;
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_inbox_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
