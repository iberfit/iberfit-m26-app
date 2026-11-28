-- Staged protection of the SECURITY DEFINER bootstrap response. No new RPC,
-- no extra network request, no changes to the three closed storage CHECKs.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE environment text; main_hash text; core oid;
BEGIN
 SELECT value#>>'{}' INTO environment FROM public.iberfit_system_settings WHERE key='environment';
 main_hash:=md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure));
 core:=to_regprocedure('public.iberfit_bootstrap_v26_core_u37_qa()');
 IF to_regprocedure('private.gx_document_read_scope_v1(uuid,uuid,jsonb,boolean)') IS NULL
 OR to_regprocedure('private.gx_document_issuance_write_v1()') IS NULL
 OR (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolbypassrls OR rolsuper))
 OR (CASE environment WHEN 'QA' THEN main_hash IS DISTINCT FROM 'e460264e965db3688709101bc30e10fa' OR core IS NULL OR md5(pg_get_functiondef(core)) IS DISTINCT FROM 'e1ff01e23ee9d40e818a2dba320c3ae1'
 WHEN 'PRODUCTION' THEN main_hash IS DISTINCT FROM 'aedea9df3d4986496626e10318628c41' OR (core IS NOT NULL AND has_function_privilege('authenticated',core,'EXECUTE'))
 ELSE true END)
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname LIKE 'iberfit_bootstrap_v26%' AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND p.oid NOT IN ('public.iberfit_bootstrap_v26()'::regprocedure,coalesce(core,0::oid)))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_BOOTSTRAP_PREREQUISITES'; END IF;
END $preflight$;
-- All functions are private and invoked only inside the existing bootstrap
-- SECURITY DEFINER context. Validate the payload against the current exact
-- row, not just its marker or the historic decision recorded in the ledger.
CREATE FUNCTION private.gx_document_bootstrap_row_current_v1(p_row jsonb,p_canonical boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE r public.reports%rowtype; d public.domain_entities_v26%rowtype; v_report_id uuid; v_client_id uuid; body jsonb; expected jsonb; role_name text;
BEGIN
 body:=CASE WHEN p_canonical THEN p_row->'body' ELSE p_row->'content' END;
 IF NOT private.gx_document_has_external_v1(body) THEN RETURN true; END IF;
 v_report_id:=(CASE WHEN p_canonical THEN p_row->>'entityId' ELSE p_row->>'id' END)::uuid;
 v_client_id:=(CASE WHEN p_canonical THEN p_row->>'clientId' ELSE p_row->>'client_id' END)::uuid;
 role_name:=public.iberfit_current_role_v26();
 IF auth.uid() IS NULL OR role_name IS NULL OR role_name NOT IN ('coach','cliente') THEN RETURN false; END IF;
 IF p_canonical THEN
  IF role_name<>'coach' OR p_row->>'entityType' IS DISTINCT FROM 'report' THEN RETURN false; END IF;
  SELECT * INTO d FROM public.domain_entities_v26 e WHERE e.entity_type='report' AND e.entity_id=v_report_id AND e.client_id=v_client_id;
  RETURN FOUND AND d.body=body AND d.revision::text=p_row->>'revision' AND d.status::text=p_row->>'status'
   AND private.gx_document_read_scope_v1(v_report_id,v_client_id,body,true) IS TRUE;
 END IF;
 SELECT * INTO r FROM public.reports t WHERE t.id=v_report_id AND t.client_id=v_client_id;
 IF NOT FOUND OR r.revision::text IS DISTINCT FROM p_row->>'revision' OR r.status::text IS DISTINCT FROM p_row->>'status' OR r.audience IS DISTINCT FROM p_row->>'audience'
 OR r.title IS DISTINCT FROM p_row->>'title' OR r.summary IS DISTINCT FROM p_row->>'summary' OR r.report_type IS DISTINCT FROM p_row->>'report_type'
 OR private.gx_document_read_scope_v1(v_report_id,v_client_id,r.content,true) IS DISTINCT FROM true THEN RETURN false; END IF;
 IF role_name='coach' THEN RETURN body=r.content; END IF;
 -- Match the existing explicit M44 client-safe bootstrap projection exactly.
 expected:=jsonb_build_object('reportType',coalesce(r.content->>'reportType',r.report_type),'summary',r.summary,
 'conclusions',r.content->>'conclusions','recommendations',r.content->>'recommendations','periodStart',r.content->>'periodStart','periodEnd',r.content->>'periodEnd',
 'evidence',coalesce(r.content->'evidence','[]'::jsonb),'activitySeries',coalesce(r.content->'activitySeries','[]'::jsonb));
 RETURN body=expected AND r.status::text='publicado' AND r.audience='cliente';
EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value OR insufficient_privilege THEN RETURN false;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_bootstrap_row_current_v1(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.gx_document_bootstrap_filter_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE result jsonb:=p_payload; report_rows jsonb; entity_rows jsonb; kept_reports jsonb; kept_entities jsonb; blocked text[]; revisions jsonb; role_name text:=public.iberfit_current_role_v26();
BEGIN
 report_rows:=p_payload#>'{data,reports}'; entity_rows:=p_payload#>'{data,m26Entities}'; revisions:=p_payload->'remoteRevisions';
 IF jsonb_typeof(report_rows) IS DISTINCT FROM 'array' OR jsonb_typeof(entity_rows) IS DISTINCT FROM 'array' OR jsonb_typeof(revisions) IS DISTINCT FROM 'object' THEN
  -- Do not convert a malformed envelope into a successful empty bootstrap.
  RAISE EXCEPTION 'GX_DOCUMENT_BOOTSTRAP_ENVELOPE_INVALID' USING ERRCODE='40001';
 END IF;
 WITH rows AS MATERIALIZED (SELECT item,ord,private.gx_document_bootstrap_row_current_v1(item,false) IS TRUE AS keep FROM jsonb_array_elements(report_rows) WITH ORDINALITY a(item,ord))
 SELECT coalesce(jsonb_agg(item ORDER BY ord) FILTER(WHERE keep),'[]'::jsonb),coalesce(array_agg(item->>'id') FILTER(WHERE NOT keep),ARRAY[]::text[]) INTO kept_reports,blocked FROM rows;
 WITH rows AS MATERIALIZED (SELECT item,ord,CASE WHEN item->>'entityType'='report' THEN private.gx_document_bootstrap_row_current_v1(item,true) IS TRUE ELSE true END AS keep FROM jsonb_array_elements(entity_rows) WITH ORDINALITY a(item,ord))
 SELECT coalesce(jsonb_agg(item ORDER BY ord) FILTER(WHERE keep),'[]'::jsonb),blocked||coalesce(array_agg(item->>'entityId') FILTER(WHERE NOT keep),ARRAY[]::text[]) INTO kept_entities,blocked FROM rows;
 -- A revision key can survive independently of a filtered payload row.
 -- Check only the report keys and preserve all non-report revisions.
 SELECT coalesce(jsonb_object_agg(k.key,k.value),'{}'::jsonb) INTO revisions FROM jsonb_each(revisions) k
 WHERE split_part(k.key,':',1)<>'report' OR (
 NOT coalesce(split_part(k.key,':',2)=ANY(blocked),false)
 AND NOT EXISTS(SELECT 1 FROM public.reports r WHERE r.id=CASE WHEN split_part(k.key,':',2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN split_part(k.key,':',2)::uuid ELSE NULL END AND private.gx_document_has_external_v1(r.content) AND (role_name IS DISTINCT FROM 'coach' OR private.gx_document_read_scope_v1(r.id,r.client_id,r.content,true) IS DISTINCT FROM true))
 );
 IF kept_reports IS DISTINCT FROM report_rows THEN result:=jsonb_set(result,'{data,reports}',kept_reports); END IF;
 IF kept_entities IS DISTINCT FROM entity_rows THEN result:=jsonb_set(result,'{data,m26Entities}',kept_entities); END IF;
 IF revisions IS DISTINCT FROM p_payload->'remoteRevisions' THEN result:=jsonb_set(result,'{remoteRevisions}',revisions); END IF;
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_bootstrap_filter_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
DO $patch$
DECLARE d text; a text; b text;
BEGIN
 d:=pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure);
 a:='  return v_payload;';b:='  return private.gx_document_bootstrap_filter_v1(v_payload);';
 IF length(d)-length(replace(d,a,''))<>length(a) THEN RAISE EXCEPTION 'GX_DOCUMENT_BOOTSTRAP_ANCHOR_DRIFT'; END IF;
 EXECUTE replace(d,a,b);
 IF to_regprocedure('public.iberfit_bootstrap_v26_core_u37_qa()') IS NOT NULL AND has_function_privilege('authenticated','public.iberfit_bootstrap_v26_core_u37_qa()','EXECUTE') THEN
  d:=pg_get_functiondef('public.iberfit_bootstrap_v26_core_u37_qa()'::regprocedure);
  a:='  RETURN private.iberfit_bootstrap_v26_full_core_internal_u37_qa();';b:='  RETURN private.gx_document_bootstrap_filter_v1(private.iberfit_bootstrap_v26_full_core_internal_u37_qa());';
  IF length(d)-length(replace(d,a,''))<>length(a) THEN RAISE EXCEPTION 'GX_DOCUMENT_BOOTSTRAP_CORE_ANCHOR_DRIFT'; END IF;
  EXECUTE replace(d,a,b);
 END IF;
END $patch$;
COMMIT;
