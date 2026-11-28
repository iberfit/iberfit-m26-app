-- Candidate: read boundaries only. The existing GX326 write guards remain
-- closed to Connected360 until the canonical mutation/issuance gate is certified.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.domain_entities_v26,public.reports,public.iberfit_evolution_report_issuances_v1 IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
DECLARE probe jsonb; source text;
BEGIN
 -- The deployed GX350 baseline does NOT recognize the external marker.
 -- Require the closed-by-default reassessment/report guard before this layer.
 IF to_regprocedure('private.iberfit_gx_reassessment_body_current_v1(uuid,jsonb)') IS NULL THEN RAISE EXCEPTION 'GX_DOCUMENT_READ_REQUIRES_CLOSED_EXTERNAL_GUARD'; END IF;
 FOREACH source IN ARRAY ARRAY['connected360:health_connect:synthetic', E' \tCONNECTED360:apple_health:synthetic'] LOOP
  probe:=jsonb_build_object('reportType','weekly','evidence',jsonb_build_array(jsonb_build_object('source',source)));
  IF private.iberfit_gx_report_body_has_refs_v1(probe) IS DISTINCT FROM true
  OR private.iberfit_gx_report_body_current_v1('00000000-0000-4000-8000-000000000001'::uuid,probe) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'GX_DOCUMENT_READ_REQUIRES_CLOSED_EXTERNAL_GUARD'; END IF;
 END LOOP;
 IF to_regprocedure('private.gx_document_has_external_v1(jsonb)') IS NULL
 OR (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 OR to_regprocedure('private.gx_document_publication_current_v1(uuid,uuid,jsonb)') IS NULL
 OR md5(pg_get_functiondef('public.iberfit_m44_prepare_evolution_report_issue_v1(uuid)'::regprocedure)) IS DISTINCT FROM '61b5ec624800951afd06bfbe2e635490'
 OR md5(pg_get_functiondef('public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)'::regprocedure)) IS DISTINCT FROM 'fc964fabfd797e0a5cd1a8ed3aeb9aee'
 OR md5(pg_get_functiondef('private.iberfit_gx_report_write_guard_v1()'::regprocedure)) IS DISTINCT FROM 'be9f09c1851b5cc3e618fef03aaaa757'
 OR md5(pg_get_functiondef('private.iberfit_gx_issuance_write_guard_v1()'::regprocedure)) IS DISTINCT FROM '4644f631db0575fffcb5c66198e217cf'
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.reports'::regclass AND tgname='gx326_report_evidence_guard' AND tgenabled='O')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND tgname='gx326_issuance_evidence_guard' AND tgenabled='O')
 OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.reports'::regclass,'public.domain_entities_v26'::regclass) AND NOT relrowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolbypassrls OR rolsuper))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_READ_BOUNDARY_DRIFT'; END IF;
END $preflight$;
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM public.reports WHERE private.gx_document_has_external_v1(content))
 OR EXISTS(SELECT 1 FROM public.domain_entities_v26 WHERE entity_type='report' AND private.gx_document_has_external_v1(body))
 OR EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 WHERE private.gx_document_has_external_v1(source_snapshot))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_READ_BOUNDARY_EXISTING_EXTERNAL_MATERIAL'; END IF;
END $guard$;
-- Preserve the independent GX professional evidence rules. The external row
-- is removed ONLY for this validation, never from the stored or displayed body.
-- The complete original body is always checked by the document validator.
CREATE FUNCTION private.gx_document_other_evidence_current_v1(p_client uuid,p_body jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE other_rows jsonb;
BEGIN
 IF NOT private.gx_document_has_external_v1(p_body) THEN
  RETURN private.iberfit_gx_report_body_current_v1(p_client,p_body) IS TRUE;
 END IF;
 SELECT coalesce(jsonb_agg(e ORDER BY ord),'[]'::jsonb) INTO other_rows
 FROM jsonb_array_elements(p_body->'evidence') WITH ORDINALITY AS rows(e,ord)
 WHERE NOT private.gx_document_has_external_v1(jsonb_build_object('evidence',jsonb_build_array(e)));
 RETURN private.iberfit_gx_report_body_current_v1(p_client,jsonb_set(p_body,'{evidence}',other_rows)) IS TRUE;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_other_evidence_current_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Private approval is not publication. This snapshot uses the same material,
-- decision and source-proof primitives as publication_current; the distinct
-- report-state predicate is intentionally limited to approved private rows.
CREATE FUNCTION private.gx_document_approved_current_v1(p_report uuid,p_client uuid,p_body jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE q private.gx_connected360_document_request_v1%rowtype; r public.reports%rowtype; source text; proof jsonb;
BEGIN
 IF private.gx_document_accepted_material_matches_v1(p_report,p_client,p_body) IS DISTINCT FROM true THEN RETURN false; END IF;
 SELECT e->>'source' INTO source FROM jsonb_array_elements(p_body->'evidence') e WHERE e->>'source' LIKE 'connected360:%';
 SELECT * INTO q FROM private.gx_connected360_document_request_v1 WHERE id=split_part(source,':',3)::uuid AND report_id=p_report AND client_id=p_client;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO r FROM public.reports WHERE id=p_report AND client_id=p_client AND created_by=q.coach_id AND report_type='weekly' AND title=p_body->>'title' AND status::text='aprobado' AND audience='coach';
 IF NOT FOUND OR r.content->'visibleToClient' IS DISTINCT FROM 'false'::jsonb
 OR r.content IS DISTINCT FROM p_body
 OR private.gx_document_publication_material_sha_v1(r.id,r.client_id,r.content) IS DISTINCT FROM q.publication_sha256
 OR NOT EXISTS(SELECT 1 FROM public.domain_entities_v26 d WHERE d.entity_type='report' AND d.entity_id=r.id AND d.client_id=r.client_id AND d.status::text='aprobado' AND d.revision=r.revision AND d.body=r.content)
 THEN RETURN false; END IF;
 proof:=private.gx_document_request_proof_snapshot_v1(q);
 RETURN (proof->>'evidenceSha256') IS NOT DISTINCT FROM q.evidence_sha256;
 EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN RETURN false;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_approved_current_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Published canonical material stays private; the M44 projection deliberately
-- strips internal fields and changes visibleToClient. Compare only the exact
-- authorized material digest, not the two entire JSON documents.
CREATE FUNCTION private.gx_document_published_pair_current_v1(p_report uuid,p_client uuid,p_body jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT EXISTS(
  SELECT 1 FROM public.reports r JOIN public.domain_entities_v26 d
   ON d.entity_type='report' AND d.entity_id=r.id AND d.client_id=r.client_id
  WHERE r.id=p_report AND r.client_id=p_client AND r.status::text='publicado'
   AND r.audience='cliente' AND r.content->'visibleToClient'='true'::jsonb
   AND r.content->>'format'='a4-premium'
   AND r.content-ARRAY['id','clientId','reportType','title','summary','conclusions','recommendations','periodStart','periodEnd','evidence','activitySeries','format','visibleToClient']::text[]='{}'::jsonb
   AND d.status::text='publicado' AND d.revision=r.revision
   AND d.body->'visibleToClient'='false'::jsonb
   AND private.gx_document_publication_material_sha_v1(p_report,p_client,p_body) IS NOT NULL
   AND private.gx_document_publication_material_sha_v1(p_report,p_client,d.body)=private.gx_document_publication_material_sha_v1(p_report,p_client,p_body)
   AND private.gx_document_publication_material_sha_v1(p_report,p_client,r.content)=private.gx_document_publication_material_sha_v1(p_report,p_client,p_body)
 )
$f$;
REVOKE ALL ON FUNCTION private.gx_document_published_pair_current_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Restrictive row-read predicate. Only the original assigned Coach can use
-- the approved/private branch; the published-only PDF wrapper below cannot.
CREATE FUNCTION private.gx_document_read_scope_v1(p_report uuid,p_client uuid,p_body jsonb,p_allow_private boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE actor uuid:=auth.uid(); role_name text; r public.reports%rowtype;
BEGIN
 IF actor IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
 OR private.m26_v49_live_session() IS DISTINCT FROM true OR NOT private.gx_document_has_external_v1(p_body)
 THEN RETURN false; END IF;
 SELECT * INTO r FROM public.reports WHERE id=p_report AND client_id=p_client;
 IF NOT FOUND THEN RETURN false; END IF;
 role_name:=public.iberfit_current_role_v26();
 IF role_name='cliente' THEN
  IF public.iberfit_client_id() IS DISTINCT FROM p_client
  OR EXISTS(SELECT 1 FROM public.user_application_roles a WHERE a.user_id=actor AND a.active AND a.role::text IN ('coach','admin')) THEN RETURN false; END IF;
 ELSIF role_name='coach' THEN
  IF actor IS DISTINCT FROM r.created_by OR NOT coalesce(public.iberfit_can_access_client_v26(p_client),false)
  OR NOT coalesce(public.is_assigned_coach(p_client),false)
  OR EXISTS(SELECT 1 FROM public.user_application_roles a WHERE a.user_id=actor AND a.active AND a.role::text='admin') THEN RETURN false; END IF;
 ELSE RETURN false; END IF;
 IF p_allow_private IS TRUE AND role_name='coach' AND r.status::text='aprobado' AND r.audience='coach' THEN
  RETURN private.gx_document_approved_current_v1(p_report,p_client,p_body) IS TRUE
   AND private.gx_document_other_evidence_current_v1(p_client,p_body) IS TRUE;
 END IF;
 RETURN private.gx_document_publication_current_v1(p_report,p_client,p_body) IS TRUE
 AND private.gx_document_other_evidence_current_v1(p_client,p_body) IS TRUE
 AND private.gx_document_published_pair_current_v1(p_report,p_client,p_body) IS TRUE;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_read_scope_v1(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.gx_document_read_scope_v1(uuid,uuid,jsonb,boolean) TO authenticated;
-- PDF-only entry point deliberately cannot opt into the private branch.
CREATE FUNCTION private.gx_document_read_visible_v1(p_report uuid,p_client uuid,p_body jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT private.gx_document_read_scope_v1(p_report,p_client,p_body,false) IS TRUE
$f$;
REVOKE ALL ON FUNCTION private.gx_document_read_visible_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.gx_document_read_visible_v1(uuid,uuid,jsonb) TO authenticated;
CREATE POLICY gx_document_projected_read_v1 ON public.reports AS RESTRICTIVE FOR SELECT TO authenticated USING (
 CASE WHEN private.gx_document_has_external_v1(content) THEN private.gx_document_read_scope_v1(id,client_id,content,true) ELSE true END
);
CREATE POLICY gx_document_canonical_read_v1 ON public.domain_entities_v26 AS RESTRICTIVE FOR SELECT TO authenticated USING (
 CASE WHEN entity_type='report' AND private.gx_document_has_external_v1(body) THEN public.iberfit_current_role_v26()='coach' AND private.gx_document_read_scope_v1(entity_id,client_id,body,true) ELSE true END
);
-- Existing client evidence policy remains in force (closed to external rows).
-- Use the combined validator in the M44 user-scoped prepare/open wrappers.
-- The existing write guards intentionally remain unchanged (deny external).
DO $install$
DECLARE d text; old text; new text;
BEGIN
 d:=pg_get_functiondef('public.iberfit_m44_prepare_evolution_report_issue_v1(uuid)'::regprocedure);
 old:=$a$private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot')$a$;
 new:=$a$(CASE WHEN private.gx_document_has_external_v1(prepared->'sourceSnapshot') THEN private.gx_document_read_visible_v1(p_report_id,(prepared->>'clientId')::uuid,prepared->'sourceSnapshot') ELSE private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot') END)$a$;
 IF length(d)-length(replace(d,old,''))<>length(old) THEN RAISE EXCEPTION 'GX_DOCUMENT_PREPARE_ANCHOR_DRIFT'; END IF;
 EXECUTE replace(d,old,new);
 d:=pg_get_functiondef('public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)'::regprocedure);
 old:=$a$private.iberfit_gx_report_body_current_v1(v_client,snapshot)$a$;
 new:=$a$(CASE WHEN private.gx_document_has_external_v1(snapshot) THEN private.gx_document_read_visible_v1((result->>'reportId')::uuid,v_client,snapshot) ELSE private.iberfit_gx_report_body_current_v1(v_client,snapshot) END)$a$;
 IF length(d)-length(replace(d,old,''))<>length(old) THEN RAISE EXCEPTION 'GX_DOCUMENT_AUTHORIZE_ANCHOR_DRIFT'; END IF;
 EXECUTE replace(d,old,new);
END $install$;
-- Do not change the existing client predicate in this read-only stage: it
-- still denies all external material until the atomic canonical write gate.
COMMIT;
