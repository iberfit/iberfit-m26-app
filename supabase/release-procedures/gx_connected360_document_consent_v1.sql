-- Candidate only: private immutable request + append-only owner decisions.
-- No public RPC, no report visibility changes. Install only after V49/V56 and
-- gx_connected360_report_observations_v1 are certified in synthetic QA.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$ BEGIN
 IF to_regprocedure('private.m26_gx_connected360_report_observations_v1(uuid,uuid,text,uuid,bigint,date,date)') IS NULL
 OR to_regclass('private.m26_wearable_coach_consent_v49') IS NULL
 OR to_regclass('private.gx_connected360_document_request_v1') IS NOT NULL
 OR to_regclass('private.gx_connected360_document_decision_v1') IS NOT NULL
 THEN RAISE EXCEPTION 'GX_DOCUMENT_CONSENT_PREREQUISITES'; END IF;
END $guard$;
CREATE TABLE private.gx_connected360_document_request_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
 report_revision integer NOT NULL CHECK(report_revision>=1),
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL,
 assignment_id uuid NOT NULL,
 assignment_revision integer NOT NULL CHECK(assignment_revision>=1),
 legacy_assignment_created_at timestamptz NOT NULL,
 provider text NOT NULL CHECK(provider IN ('health_connect','apple_health')),
 source_grant_id uuid NOT NULL,
 source_cursor bigint NOT NULL CHECK(source_cursor>=0),
 consultation_revision integer NOT NULL CHECK(consultation_revision>=1),
 period_start date NOT NULL,
 period_end date NOT NULL CHECK(period_end-period_start BETWEEN 0 AND 6),
 draft_sha256 text NOT NULL CHECK(draft_sha256 ~ '^[0-9a-f]{64}$'),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 publication_sha256 text NOT NULL CHECK(publication_sha256 ~ '^[0-9a-f]{64}$'),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(owner_id<>coach_id),
 UNIQUE(report_id,report_revision,coach_id,provider,consultation_revision,draft_sha256,evidence_sha256)
);
CREATE INDEX gx_document_request_owner_idx ON private.gx_connected360_document_request_v1(owner_id,client_id,requested_at DESC);
CREATE INDEX gx_document_request_client_idx ON private.gx_connected360_document_request_v1(client_id);
CREATE INDEX gx_document_request_coach_idx ON private.gx_connected360_document_request_v1(coach_id);
CREATE TABLE private.gx_connected360_document_decision_v1(
 request_id uuid NOT NULL REFERENCES private.gx_connected360_document_request_v1(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision IN (1,2)),
 operation_id uuid NOT NULL UNIQUE,
 decision text NOT NULL CHECK((revision=1 AND decision IN ('accepted','declined')) OR (revision=2 AND decision='withdrawn')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(request_id,revision)
);
ALTER TABLE private.gx_connected360_document_request_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.gx_connected360_document_request_v1 FORCE ROW LEVEL SECURITY;
ALTER TABLE private.gx_connected360_document_decision_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.gx_connected360_document_decision_v1 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.gx_connected360_document_request_v1,private.gx_connected360_document_decision_v1 FROM PUBLIC,anon,authenticated,service_role;
-- Bind the exact private draft, including its material and server revision.
-- This is a pre-approval identity, NOT a hash of a later issued document.
CREATE FUNCTION private.gx_document_draft_sha_v1(r public.reports)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
 'reportId',r.id,'clientId',r.client_id,'revision',r.revision,'title',r.title,
 'reportType',r.report_type,'content',r.content)::text,'UTF8')),'hex')
$f$;
-- Match the visible material used by M44's private issued source, not the
-- changing administrative status/revision. Keep every visible row in order.
-- This is an identity primitive only; a matching digest is NOT authorization.
CREATE FUNCTION private.gx_document_publication_material_sha_v1(p_report uuid,p_client uuid,p_body jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE k text; r jsonb; rows jsonb:='[]'::jsonb; series jsonb:='[]'::jsonb;
BEGIN
 IF p_report IS NULL OR p_client IS NULL OR jsonb_typeof(p_body) IS DISTINCT FROM 'object'
 OR coalesce(p_body->>'reportId',p_body->>'id') IS DISTINCT FROM p_report::text
 OR (p_body?'id' AND p_body->>'id' IS DISTINCT FROM p_report::text)
 OR p_body->>'clientId' IS DISTINCT FROM p_client::text
 OR p_body->>'reportType' IS DISTINCT FROM 'weekly'
 OR jsonb_typeof(p_body->'evidence') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_body->'activitySeries') IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
 FOREACH k IN ARRAY ARRAY['title','periodStart','periodEnd','summary','conclusions','recommendations'] LOOP
  IF jsonb_typeof(p_body->k) IS DISTINCT FROM 'string' OR nullif(btrim(p_body->>k),'') IS NULL THEN RETURN NULL; END IF;
 END LOOP;
 IF jsonb_array_length(p_body->'evidence') NOT BETWEEN 1 AND 12 OR jsonb_array_length(p_body->'activitySeries') NOT BETWEEN 2 AND 13 THEN RETURN NULL; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_body->'evidence') LOOP
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['label','text','source','quality']::text[]<>'{}'::jsonb THEN RETURN NULL; END IF;
  FOREACH k IN ARRAY ARRAY['label','text','source'] LOOP
   IF jsonb_typeof(r->k) IS DISTINCT FROM 'string' OR nullif(btrim(r->>k),'') IS NULL THEN RETURN NULL; END IF;
  END LOOP;
  IF length(r->>'label')>120 OR length(r->>'text')>500 OR length(r->>'source')>120
   OR (r?'quality' AND jsonb_typeof(r->'quality') NOT IN ('string','null')) OR length(coalesce(r->>'quality',''))>120 THEN RETURN NULL; END IF;
  rows:=rows||jsonb_build_array(jsonb_build_object('label',r->>'label','text',r->>'text','source',r->>'source','quality',coalesce(r->>'quality','')));
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(p_body->'activitySeries') LOOP
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['from','to','count']::text[]<>'{}'::jsonb
   OR jsonb_typeof(r->'from') IS DISTINCT FROM 'string' OR jsonb_typeof(r->'to') IS DISTINCT FROM 'string'
   OR jsonb_typeof(r->'count') IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
  series:=series||jsonb_build_array(r);
 END LOOP;
 RETURN encode(sha256(convert_to(jsonb_build_object('schema','iberfit.connected360.document-material.v1',
  'reportId',p_report,'clientId',p_client,'reportType','weekly','title',p_body->>'title',
  'periodStart',p_body->>'periodStart','periodEnd',p_body->>'periodEnd','summary',p_body->>'summary',
  'conclusions',p_body->>'conclusions','recommendations',p_body->>'recommendations','evidence',rows,'activitySeries',series)::text,'UTF8')),'hex');
END $f$;
-- One canonical minimized row, generated from the server proof only. Never
-- discard an existing professional evidence row to fit the twelve-row limit.
CREATE FUNCTION private.gx_document_expected_publication_body_v1(r public.reports,p_request uuid,p_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE line jsonb; body jsonb; disciplines text; provider text:=p_proof->>'provider';
BEGIN
 IF p_request IS NULL OR r.title IS DISTINCT FROM r.content->>'title' OR r.report_type IS DISTINCT FROM 'weekly'
 OR p_proof->>'schema' IS DISTINCT FROM 'iberfit.connected360.report-observations.v1'
 OR p_proof->>'coverage' IS DISTINCT FROM 'observed-only'
 OR provider IS NULL OR provider NOT IN ('apple_health','health_connect')
 OR p_proof->>'periodStart' IS DISTINCT FROM r.content->>'periodStart' OR p_proof->>'periodEnd' IS DISTINCT FROM r.content->>'periodEnd'
 OR private.gx_document_publication_material_sha_v1(r.id,r.client_id,r.content) IS NULL THEN RETURN NULL; END IF;
 IF jsonb_array_length(r.content->'evidence')>=12 OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.content->'evidence') e WHERE lower(regexp_replace(coalesce(e->>'source',''),'^[[:space:]]+','','g')) LIKE 'connected360:%') THEN RETURN NULL; END IF;
 SELECT string_agg((CASE d->>'sport' WHEN 'running' THEN 'Carrera' WHEN 'cycling' THEN 'Ciclismo' WHEN 'walking' THEN 'Caminata' WHEN 'strength' THEN 'Fuerza' WHEN 'hiit' THEN 'HIIT' WHEN 'swimming' THEN 'Natación' WHEN 'other' THEN 'Otra actividad' END)||': '||(d->>'observedDays')||' d',', ' ORDER BY d->>'sport') INTO disciplines FROM jsonb_array_elements(p_proof->'disciplines') d;
 IF disciplines IS NULL THEN RETURN NULL; END IF;
 line:=jsonb_build_object('label',CASE provider WHEN 'apple_health' THEN 'Actividad externa · Apple Salud' ELSE 'Actividad externa · Health Connect' END,
  'text',(p_proof->>'observedDays')||' días con actividad observada. '||disciplines||'.',
  'source','connected360:'||provider||':'||p_request::text,'quality','Cobertura parcial; no son sesiones confirmadas');
 body:=jsonb_set(r.content,'{evidence}',r.content->'evidence'||jsonb_build_array(line));
 IF private.gx_document_publication_material_sha_v1(r.id,r.client_id,body) IS NULL THEN RETURN NULL; END IF;
 RETURN body;
END $f$;
CREATE FUNCTION private.gx_document_expected_publication_sha_v1(r public.reports,p_request uuid,p_proof jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT private.gx_document_publication_material_sha_v1(r.id,r.client_id,private.gx_document_expected_publication_body_v1(r,p_request,p_proof))
$f$;
-- Material and decision fence only, not full publication authorization. A
-- caller must also prove current provider/assignment scope and lock on write.
CREATE FUNCTION private.gx_document_accepted_material_matches_v1(p_report uuid,p_client uuid,p_body jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE q private.gx_connected360_document_request_v1%rowtype; source text; sources text[]; material text;
BEGIN
 material:=private.gx_document_publication_material_sha_v1(p_report,p_client,p_body);
 IF material IS NULL THEN RETURN false; END IF;
 SELECT array_agg(e->>'source') INTO sources FROM jsonb_array_elements(p_body->'evidence') e
 WHERE lower(regexp_replace(coalesce(e->>'source',''),'^[[:space:]]+','','g')) LIKE 'connected360:%';
 IF cardinality(sources) IS DISTINCT FROM 1 THEN RETURN false; END IF;
 source:=sources[1];
 IF source !~ '^connected360:(apple_health|health_connect):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
 SELECT * INTO q FROM private.gx_connected360_document_request_v1 x WHERE x.id=split_part(source,':',3)::uuid AND x.report_id=p_report AND x.client_id=p_client AND x.provider=split_part(source,':',2);
 IF NOT FOUND OR material IS DISTINCT FROM q.publication_sha256 THEN RETURN false; END IF;
 RETURN (SELECT d.decision='accepted' AND d.revision=1 FROM private.gx_connected360_document_decision_v1 d WHERE d.request_id=q.id ORDER BY d.revision DESC LIMIT 1) IS TRUE;
END $f$;
-- Caller MUST hold report row lock; projection acquires source fence, then
-- verify exact consultation revision and both assignment models under row locks.
CREATE FUNCTION private.gx_document_request_proof_v1(q private.gx_connected360_document_request_v1)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE proof jsonb; day date:=(pg_catalog.now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
 IF q.owner_id IS DISTINCT FROM (SELECT min(p.user_id::text)::uuid FROM public.user_profiles p WHERE p.client_id=q.client_id AND p.role::text='client' HAVING count(*)=1)
 OR EXISTS(SELECT 1 FROM public.user_application_roles p WHERE p.user_id=q.owner_id AND p.active AND p.role::text IN ('coach','admin'))
 OR NOT EXISTS(SELECT 1 FROM public.iberfit_organization_memberships m WHERE m.user_id=q.owner_id AND m.organization_id=q.organization_id AND m.status='active')
 THEN RAISE EXCEPTION 'GX_DOCUMENT_SCOPE_STALE' USING ERRCODE='42501'; END IF;
 proof:=private.m26_gx_connected360_report_observations_v1(q.owner_id,q.client_id,q.provider,q.source_grant_id,q.source_cursor,q.period_start,q.period_end);
 PERFORM 1 FROM private.m26_wearable_coach_consent_v49 g
 JOIN public.client_assignments a ON a.client_id=g.client_id AND a.coach_user_id=g.coach_user_id AND a.active AND a.created_at=g.legacy_assignment_created_at
 JOIN public.iberfit_coach_client_assignments b ON b.id=g.assignment_id AND b.revision=g.assignment_revision AND b.organization_id=q.organization_id
 WHERE g.owner_user_id=q.owner_id AND g.client_id=q.client_id AND g.coach_user_id=q.coach_id AND g.provider=q.provider
 AND g.purpose=CASE q.provider WHEN 'apple_health' THEN 'coaching-apple-exercise-days-v1' ELSE 'coaching-exercise-days-v1' END
 AND g.revoked_at IS NULL AND g.consent_revision=q.consultation_revision AND g.source_grant_id=q.source_grant_id AND g.source_cursor=q.source_cursor
 AND g.assignment_id=q.assignment_id AND g.assignment_revision=q.assignment_revision AND g.legacy_assignment_created_at=q.legacy_assignment_created_at
 AND EXISTS(SELECT 1 FROM private.m26_v49_eligible_assignments(q.client_id,q.organization_id,day) e WHERE e.coach_id=q.coach_id AND e.assignment_id=q.assignment_id AND e.assignment_revision=q.assignment_revision AND e.legacy_created_at=q.legacy_assignment_created_at)
 FOR SHARE OF g,a,b;
 IF NOT FOUND THEN RAISE EXCEPTION 'GX_DOCUMENT_SCOPE_STALE' USING ERRCODE='42501'; END IF;
 RETURN proof;
END $f$;
-- Read-time proof: same identity and scope as the locked writer, but all
-- queries use the calling statement snapshot. No write locks in RLS reads.
CREATE FUNCTION private.gx_document_request_proof_snapshot_v1(q private.gx_connected360_document_request_v1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE proof jsonb; day date:=(pg_catalog.now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
 IF q.owner_id IS DISTINCT FROM (SELECT min(p.user_id::text)::uuid FROM public.user_profiles p WHERE p.client_id=q.client_id AND p.role::text='client' HAVING count(*)=1)
 OR EXISTS(SELECT 1 FROM public.user_application_roles p WHERE p.user_id=q.owner_id AND p.active AND p.role::text IN ('coach','admin'))
 OR NOT EXISTS(SELECT 1 FROM public.iberfit_organization_memberships m WHERE m.user_id=q.owner_id AND m.organization_id=q.organization_id AND m.status='active')
 THEN RAISE EXCEPTION 'GX_DOCUMENT_SCOPE_STALE' USING ERRCODE='42501'; END IF;
 proof:=private.m26_gx_connected360_report_observations_snapshot_v1(q.owner_id,q.client_id,q.provider,q.source_grant_id,q.source_cursor,q.period_start,q.period_end);
 PERFORM 1 FROM private.m26_wearable_coach_consent_v49 g
 JOIN public.client_assignments a ON a.client_id=g.client_id AND a.coach_user_id=g.coach_user_id AND a.active AND a.created_at=g.legacy_assignment_created_at
 JOIN public.iberfit_coach_client_assignments b ON b.id=g.assignment_id AND b.revision=g.assignment_revision AND b.organization_id=q.organization_id
 WHERE g.owner_user_id=q.owner_id AND g.client_id=q.client_id AND g.coach_user_id=q.coach_id AND g.provider=q.provider
 AND g.purpose=CASE q.provider WHEN 'apple_health' THEN 'coaching-apple-exercise-days-v1' ELSE 'coaching-exercise-days-v1' END
 AND g.revoked_at IS NULL AND g.consent_revision=q.consultation_revision AND g.source_grant_id=q.source_grant_id AND g.source_cursor=q.source_cursor
 AND g.assignment_id=q.assignment_id AND g.assignment_revision=q.assignment_revision AND g.legacy_assignment_created_at=q.legacy_assignment_created_at
 AND EXISTS(SELECT 1 FROM private.m26_v49_eligible_assignments(q.client_id,q.organization_id,day) e WHERE e.coach_id=q.coach_id AND e.assignment_id=q.assignment_id AND e.assignment_revision=q.assignment_revision AND e.legacy_created_at=q.legacy_assignment_created_at);
 IF NOT FOUND THEN RAISE EXCEPTION 'GX_DOCUMENT_SCOPE_STALE' USING ERRCODE='42501'; END IF;
 RETURN proof;
END $f$;
-- Resolve only a request whose exact material and latest decision match.
-- The accepted row must still belong to the current report creator.
CREATE FUNCTION private.gx_document_publication_current_v1(p_report uuid,p_client uuid,p_body jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE q private.gx_connected360_document_request_v1%rowtype; source text; proof jsonb;
BEGIN
 IF private.gx_document_accepted_material_matches_v1(p_report,p_client,p_body) IS DISTINCT FROM true THEN RETURN false; END IF;
 SELECT e->>'source' INTO source FROM jsonb_array_elements(p_body->'evidence') e WHERE e->>'source' LIKE 'connected360:%';
 SELECT * INTO q FROM private.gx_connected360_document_request_v1 WHERE id=split_part(source,':',3)::uuid AND report_id=p_report AND client_id=p_client;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.reports r WHERE r.id=p_report AND r.client_id=p_client AND r.created_by=q.coach_id AND r.report_type='weekly' AND r.title=p_body->>'title' AND r.status::text='publicado' AND r.audience='cliente'
 AND private.gx_document_publication_material_sha_v1(r.id,r.client_id,r.content) IS NOT DISTINCT FROM q.publication_sha256) THEN RETURN false; END IF;
 proof:=private.gx_document_request_proof_snapshot_v1(q);
 RETURN (proof->>'evidenceSha256') IS NOT DISTINCT FROM q.evidence_sha256;
 EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN RETURN false;
END $f$;
-- Write-time authorization is a separate, internal fence. The report row
-- comes first, then existing source/assignment locks, then request row. The
-- last-decision read MUST be a new statement after acquiring the request lock.
-- This serializes against owner withdrawal, without widening any caller ACL.
CREATE FUNCTION private.gx_document_publication_lock_v1(p_report uuid,p_client uuid,p_body jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE r public.reports%rowtype; q private.gx_connected360_document_request_v1%rowtype; source text; proof jsonb;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' OR p_report IS NULL OR p_client IS NULL THEN RETURN false; END IF;
 IF private.gx_document_accepted_material_matches_v1(p_report,p_client,p_body) IS DISTINCT FROM true THEN RETURN false; END IF;
 SELECT * INTO r FROM public.reports WHERE id=p_report AND client_id=p_client FOR UPDATE;
 IF NOT FOUND OR r.status::text NOT IN ('borrador','aprobado','publicado') OR r.report_type IS DISTINCT FROM 'weekly' OR r.title IS DISTINCT FROM p_body->>'title' THEN RETURN false; END IF;
 SELECT e->>'source' INTO source FROM jsonb_array_elements(p_body->'evidence') e WHERE e->>'source' LIKE 'connected360:%';
 SELECT * INTO q FROM private.gx_connected360_document_request_v1 WHERE id=split_part(source,':',3)::uuid AND report_id=p_report AND client_id=p_client AND coach_id=r.created_by;
 IF NOT FOUND THEN RETURN false; END IF;
 -- First attachment must use the original authorized draft. Later transitions
 -- must retain the exact authorized material, never substitute another draft.
 IF private.gx_document_publication_material_sha_v1(r.id,r.client_id,r.content) IS DISTINCT FROM q.publication_sha256 THEN
  IF r.status::text IS DISTINCT FROM 'borrador' OR r.audience IS DISTINCT FROM 'coach' OR r.revision IS DISTINCT FROM q.report_revision
   OR private.gx_document_draft_sha_v1(r) IS DISTINCT FROM q.draft_sha256 THEN RETURN false; END IF;
 END IF;
 proof:=private.gx_document_request_proof_v1(q);
 IF proof->>'evidenceSha256' IS DISTINCT FROM q.evidence_sha256 THEN RETURN false; END IF;
 PERFORM 1 FROM private.gx_connected360_document_request_v1 WHERE id=q.id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 -- VOLATILE + read committed: fresh decision snapshot after waiting for a
 -- concurrent withdrawal. Do not return the preliminary material check.
 RETURN private.gx_document_accepted_material_matches_v1(p_report,p_client,p_body) IS TRUE;
 EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN RETURN false;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_request_proof_snapshot_v1(private.gx_connected360_document_request_v1),private.gx_document_publication_current_v1(uuid,uuid,jsonb),private.gx_document_publication_lock_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.gx_document_request_create_v1(p_report uuid,p_provider text,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE r public.reports%rowtype; g private.m26_wearable_coach_consent_v49%rowtype;
 q private.gx_connected360_document_request_v1%rowtype; context jsonb; proof jsonb;
BEGIN
 IF auth.uid() IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' OR NOT private.m26_v49_live_session() OR public.iberfit_current_role_v26() IS DISTINCT FROM 'coach'
 OR pg_catalog.current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
 OR p_provider IS NULL OR p_provider NOT IN ('health_connect','apple_health') OR p_expected_revision IS NULL
 THEN RAISE EXCEPTION 'GX_DOCUMENT_REQUEST_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM public.iberfit_require_privileged_assurance_v65d();
 context:=public.iberfit_application_context_v14();
 IF context->>'membershipStatus' IS DISTINCT FROM 'active' OR NOT coalesce(context->'roles'?'coach',false) OR coalesce(context->'roles'?'admin',false)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_REQUEST_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.reports WHERE id=p_report AND created_by=auth.uid() AND status='borrador' AND audience='coach' FOR SHARE;
 IF NOT FOUND OR r.revision IS DISTINCT FROM p_expected_revision OR r.report_type IS DISTINCT FROM 'weekly'
 OR r.content->>'reportType' IS DISTINCT FROM 'weekly' OR r.content->'visibleToClient' IS DISTINCT FROM 'false'::jsonb
 OR NOT coalesce(public.iberfit_can_access_client_v26(r.client_id),false) OR NOT coalesce(public.is_assigned_coach(r.client_id),false)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_DRAFT_STALE' USING ERRCODE='42501'; END IF;
 q.owner_id:=(SELECT min(p.user_id::text)::uuid FROM public.user_profiles p WHERE p.client_id=r.client_id AND p.role::text='client' HAVING count(*)=1);
 SELECT * INTO g FROM private.m26_wearable_coach_consent_v49 WHERE owner_user_id=q.owner_id AND client_id=r.client_id AND coach_user_id=auth.uid() AND provider=p_provider
 AND purpose=CASE p_provider WHEN 'apple_health' THEN 'coaching-apple-exercise-days-v1' ELSE 'coaching-exercise-days-v1' END AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'GX_DOCUMENT_REQUEST_FORBIDDEN' USING ERRCODE='42501'; END IF;
 q.report_id:=r.id; q.report_revision:=r.revision; q.client_id:=r.client_id; q.coach_id:=auth.uid(); q.organization_id:=(context->>'organizationId')::uuid;
 q.assignment_id:=g.assignment_id; q.assignment_revision:=g.assignment_revision; q.legacy_assignment_created_at:=g.legacy_assignment_created_at;
 q.provider:=p_provider; q.source_grant_id:=g.source_grant_id; q.source_cursor:=g.source_cursor; q.consultation_revision:=g.consent_revision;
 q.period_start:=(r.content->>'periodStart')::date; q.period_end:=(r.content->>'periodEnd')::date;
 q.draft_sha256:=private.gx_document_draft_sha_v1(r);
 proof:=private.gx_document_request_proof_v1(q); q.evidence_sha256:=proof->>'evidenceSha256';
 q.id:=gen_random_uuid();
 q.publication_sha256:=private.gx_document_expected_publication_sha_v1(r,q.id,proof);
 IF q.publication_sha256 IS NULL THEN RAISE EXCEPTION 'GX_DOCUMENT_MATERIAL_INVALID' USING ERRCODE='22023'; END IF;
 INSERT INTO private.gx_connected360_document_request_v1(id,report_id,report_revision,client_id,owner_id,coach_id,organization_id,assignment_id,assignment_revision,legacy_assignment_created_at,provider,source_grant_id,source_cursor,consultation_revision,period_start,period_end,draft_sha256,evidence_sha256,publication_sha256)
 VALUES(q.id,q.report_id,q.report_revision,q.client_id,q.owner_id,q.coach_id,q.organization_id,q.assignment_id,q.assignment_revision,q.legacy_assignment_created_at,q.provider,q.source_grant_id,q.source_cursor,q.consultation_revision,q.period_start,q.period_end,q.draft_sha256,q.evidence_sha256,q.publication_sha256)
 ON CONFLICT(report_id,report_revision,coach_id,provider,consultation_revision,draft_sha256,evidence_sha256) DO NOTHING RETURNING id INTO q.id;
 IF q.id IS NULL THEN SELECT id INTO q.id FROM private.gx_connected360_document_request_v1 x WHERE x.report_id=q.report_id AND x.report_revision=q.report_revision AND x.coach_id=q.coach_id AND x.provider=q.provider AND x.consultation_revision=q.consultation_revision AND x.draft_sha256=q.draft_sha256 AND x.evidence_sha256=q.evidence_sha256; END IF;
 RETURN jsonb_build_object('requestId',q.id,'draftSha256',q.draft_sha256,'evidence',proof);
END $f$;
-- Internal owner decision. The owner must explicitly echo both hashes of
-- the reviewed request. Decline/withdraw do NOT need live source permission.
CREATE FUNCTION private.gx_document_request_decide_v1(p_request uuid,p_expected_revision integer,p_operation uuid,p_decision text,p_draft_sha text,p_evidence_sha text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE q private.gx_connected360_document_request_v1%rowtype; prior private.gx_connected360_document_decision_v1%rowtype;
 r public.reports%rowtype; proof jsonb; context jsonb; current_revision integer; current_decision text;
BEGIN
 IF auth.uid() IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' OR NOT private.m26_v49_live_session() OR public.iberfit_current_role_v26() IS DISTINCT FROM 'cliente'
 OR pg_catalog.current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
 OR p_operation IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT IN (0,1)
 OR p_decision IS NULL OR p_decision NOT IN ('accepted','declined','withdrawn')
 THEN RAISE EXCEPTION 'GX_DOCUMENT_DECISION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM private.gx_connected360_document_request_v1 WHERE id=p_request AND owner_id=auth.uid() AND client_id=public.iberfit_client_id();
 IF NOT FOUND OR q.draft_sha256 IS DISTINCT FROM p_draft_sha OR q.evidence_sha256 IS DISTINCT FROM p_evidence_sha
 THEN RAISE EXCEPTION 'GX_DOCUMENT_DECISION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Uniform order: report -> source (accept only) -> request. Recheck owner
 -- and request identity after locking; a retry cannot revive a withdrawal.
 IF p_decision='accepted' THEN
  context:=public.iberfit_application_context_v14();
  IF context->>'membershipStatus' IS DISTINCT FROM 'active' OR context->>'organizationId' IS DISTINCT FROM q.organization_id::text
  THEN RAISE EXCEPTION 'GX_DOCUMENT_DECISION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.reports WHERE id=q.report_id AND client_id=q.client_id AND status='borrador' AND audience='coach' FOR SHARE;
  IF NOT FOUND OR r.revision IS DISTINCT FROM q.report_revision OR private.gx_document_draft_sha_v1(r) IS DISTINCT FROM q.draft_sha256
  THEN RAISE EXCEPTION 'GX_DOCUMENT_DRAFT_STALE' USING ERRCODE='40001'; END IF;
  proof:=private.gx_document_request_proof_v1(q);
  IF proof->>'evidenceSha256' IS DISTINCT FROM q.evidence_sha256 THEN RAISE EXCEPTION 'GX_DOCUMENT_EVIDENCE_STALE' USING ERRCODE='40001'; END IF;
  IF private.gx_document_expected_publication_sha_v1(r,q.id,proof) IS DISTINCT FROM q.publication_sha256 THEN RAISE EXCEPTION 'GX_DOCUMENT_MATERIAL_STALE' USING ERRCODE='40001'; END IF;
 END IF;
 PERFORM 1 FROM private.gx_connected360_document_request_v1 WHERE id=q.id AND owner_id=auth.uid() AND client_id=public.iberfit_client_id() FOR UPDATE;
 IF NOT FOUND OR NOT private.m26_v49_live_session() THEN RAISE EXCEPTION 'GX_DOCUMENT_DECISION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM private.gx_connected360_document_decision_v1 WHERE request_id=q.id ORDER BY revision DESC LIMIT 1;
 current_revision:=coalesce(prior.revision,0); current_decision:=coalesce(prior.decision,'pending');
 IF prior.operation_id=p_operation AND prior.decision=p_decision AND prior.revision=p_expected_revision+1 THEN
  RETURN jsonb_build_object('requestId',q.id,'operationId',p_operation,'revision',current_revision,'decision',current_decision,'duplicate',true);
 END IF;
 IF current_revision<>p_expected_revision OR NOT ((current_decision='pending' AND p_decision IN ('accepted','declined')) OR (current_decision='accepted' AND p_decision='withdrawn'))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_DECISION_CONFLICT' USING ERRCODE='40001'; END IF;
 INSERT INTO private.gx_connected360_document_decision_v1(request_id,revision,operation_id,decision) VALUES(q.id,current_revision+1,p_operation,p_decision);
 RETURN jsonb_build_object('requestId',q.id,'operationId',p_operation,'revision',current_revision+1,'decision',p_decision,'duplicate',false);
END $f$;
-- Exact owner review; receipt-only mode remains available after source
-- withdrawal. No general draft access or public RPC. Never return raw content.
CREATE FUNCTION private.gx_document_request_review_v1(p_request uuid,p_preview boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE q private.gx_connected360_document_request_v1%rowtype;
 r public.reports%rowtype; prior private.gx_connected360_document_decision_v1%rowtype;
 proof jsonb; context jsonb; coach_name text; receipt jsonb;
BEGIN
 IF p_request IS NULL OR p_preview IS NULL OR auth.uid() IS NULL
 OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' OR NOT private.m26_v49_live_session()
 OR public.iberfit_current_role_v26() IS DISTINCT FROM 'cliente'
 OR pg_catalog.current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
 THEN RAISE EXCEPTION 'GX_DOCUMENT_REVIEW_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM private.gx_connected360_document_request_v1
 WHERE id=p_request AND owner_id=auth.uid() AND client_id=public.iberfit_client_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'GX_DOCUMENT_REVIEW_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_preview THEN
  context:=public.iberfit_application_context_v14();
  IF context->>'membershipStatus' IS DISTINCT FROM 'active' OR context->>'organizationId' IS DISTINCT FROM q.organization_id::text
  THEN RAISE EXCEPTION 'GX_DOCUMENT_REVIEW_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.reports WHERE id=q.report_id AND client_id=q.client_id AND created_by=q.coach_id
   AND status='borrador' AND audience='coach' FOR SHARE;
  IF NOT FOUND OR r.revision IS DISTINCT FROM q.report_revision OR private.gx_document_draft_sha_v1(r) IS DISTINCT FROM q.draft_sha256
  THEN RAISE EXCEPTION 'GX_DOCUMENT_DRAFT_STALE' USING ERRCODE='40001'; END IF;
  proof:=private.gx_document_request_proof_v1(q);
  IF proof->>'evidenceSha256' IS DISTINCT FROM q.evidence_sha256
  THEN RAISE EXCEPTION 'GX_DOCUMENT_EVIDENCE_STALE' USING ERRCODE='40001'; END IF;
  IF private.gx_document_expected_publication_sha_v1(r,q.id,proof) IS DISTINCT FROM q.publication_sha256 THEN RAISE EXCEPTION 'GX_DOCUMENT_MATERIAL_STALE' USING ERRCODE='40001'; END IF;
  SELECT coalesce(nullif(pg_catalog.btrim(pg_catalog.left(pg_catalog.regexp_replace(p.display_name,'[[:cntrl:]]','','g'),160)),''),'Entrenador')
   INTO coach_name FROM public.user_profiles p WHERE p.user_id=q.coach_id AND p.role::text='coach';
  IF NOT FOUND THEN RAISE EXCEPTION 'GX_DOCUMENT_SCOPE_STALE' USING ERRCODE='42501'; END IF;
 END IF;
 -- Same report -> source -> request lock ordering as acceptance. Receipt-only
 -- mode never takes a report/source lock and exposes no draft text.
 PERFORM 1 FROM private.gx_connected360_document_request_v1 WHERE id=q.id AND owner_id=auth.uid() AND client_id=public.iberfit_client_id() FOR SHARE;
 IF NOT FOUND OR NOT private.m26_v49_live_session() THEN RAISE EXCEPTION 'GX_DOCUMENT_REVIEW_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM private.gx_connected360_document_decision_v1 WHERE request_id=q.id ORDER BY revision DESC LIMIT 1;
 receipt:=pg_catalog.jsonb_build_object('schema','iberfit.connected360.document-review.v1','requestId',q.id,
  'reportId',q.report_id,'reportRevision',q.report_revision,'clientId',q.client_id,'provider',q.provider,
  'periodStart',q.period_start,'periodEnd',q.period_end,'draftSha256',q.draft_sha256,'evidenceSha256',q.evidence_sha256,
  'revision',coalesce(prior.revision,0),'decision',coalesce(prior.decision,'pending'),'preview',NULL);
 IF p_preview THEN
  IF prior.revision IS NOT NULL THEN RAISE EXCEPTION 'GX_DOCUMENT_REVIEW_DECIDED' USING ERRCODE='40001'; END IF;
  receipt:=receipt||pg_catalog.jsonb_build_object('preview',pg_catalog.jsonb_build_object(
   'reportTitle',r.title,'coachName',coach_name,'reportType','weekly','evidence',proof));
 END IF;
 RETURN receipt;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_publication_material_sha_v1(uuid,uuid,jsonb),private.gx_document_expected_publication_body_v1(public.reports,uuid,jsonb),private.gx_document_expected_publication_sha_v1(public.reports,uuid,jsonb),private.gx_document_accepted_material_matches_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.gx_document_request_review_v1(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.gx_document_draft_sha_v1(public.reports),private.gx_document_request_proof_v1(private.gx_connected360_document_request_v1),private.gx_document_request_create_v1(uuid,text,integer),private.gx_document_request_decide_v1(uuid,integer,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
