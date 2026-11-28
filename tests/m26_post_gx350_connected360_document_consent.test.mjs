import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=load('supabase/release-procedures/gx_connected360_document_consent_v1.sql');
const rollback=load('supabase/release-procedures/gx_connected360_document_consent_v1.rollback.sql');
const create=sql.slice(sql.indexOf('CREATE FUNCTION private.gx_document_request_create_v1'),sql.indexOf('CREATE FUNCTION private.gx_document_request_decide_v1'));
const decide=sql.slice(sql.indexOf('CREATE FUNCTION private.gx_document_request_decide_v1'),sql.indexOf('CREATE FUNCTION private.gx_document_request_review_v1'));
const review=sql.slice(sql.indexOf('CREATE FUNCTION private.gx_document_request_review_v1'));
const proof=sql.slice(sql.indexOf('CREATE FUNCTION private.gx_document_request_proof_v1'),sql.indexOf('-- Read-time proof:'));
test('document authorization private candidate adds no public access or publication bypass',()=>{
 assert.equal((sql.match(/FORCE ROW LEVEL SECURITY/g)||[]).length,2);
 assert.equal((sql.match(/SECURITY INVOKER SET search_path TO ''/g)||[]).length,12);
 assert.doesNotMatch(sql,/\bGRANT\b|SECURITY DEFINER|CREATE FUNCTION public\.|UPDATE public\.|DELETE FROM/u);
 assert.match(sql,/REVOKE ALL ON TABLE .* FROM PUBLIC,anon,authenticated,service_role/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION .* FROM PUBLIC,anon,authenticated,service_role/u);
});
test('coach request requires live identity assurance, exact private weekly draft and current assignment',()=>{
 for(const p of [/auth.jwt\(\)->>'role' IS DISTINCT FROM 'authenticated'/u,/m26_v49_live_session/u,/iberfit_require_privileged_assurance_v65d/u,/created_by=auth.uid\(\) AND status='borrador' AND audience='coach' FOR SHARE/u,/r.revision IS DISTINCT FROM p_expected_revision/u,/r.report_type IS DISTINCT FROM 'weekly'/u,/iberfit_can_access_client_v26/u,/is_assigned_coach/u,/HAVING count\(\*\)=1/u])assert.match(create,p);
 assert.match(proof,/g.consent_revision=q.consultation_revision/u);
 assert.match(proof,/g.revoked_at IS NULL/u);
 assert.match(proof,/FOR SHARE OF g,a,b/u);
 assert.match(proof,/m26_v49_eligible_assignments/u);
 assert.match(proof,/g.source_grant_id=q.source_grant_id AND g.source_cursor=q.source_cursor/u);
});
test('document consent is bound to current owner, both hashes, report revision and source proof',()=>{
 for(const p of [/owner_id=auth.uid\(\) AND client_id=public.iberfit_client_id\(\)/u,/q.draft_sha256 IS DISTINCT FROM p_draft_sha/u,/q.evidence_sha256 IS DISTINCT FROM p_evidence_sha/u,/r.revision IS DISTINCT FROM q.report_revision/u,/gx_document_draft_sha_v1\(r\) IS DISTINCT FROM q.draft_sha256/u,/proof->>'evidenceSha256' IS DISTINCT FROM q.evidence_sha256/u,/context->>'organizationId' IS DISTINCT FROM q.organization_id::text/u])assert.match(decide,p);
 assert.match(sql,/'reportId',r.id,'clientId',r.client_id,'revision',r.revision,'title',r.title/u);
 assert.match(sql,/'reportType',r.report_type,'content',r.content/u);
});
test('immutable request and append-only decision CAS; only same latest exact replay accepted',()=>{
 assert.match(sql,/UNIQUE\(report_id,report_revision,coach_id,provider,consultation_revision,draft_sha256,evidence_sha256\)/u);
 assert.match(sql,/operation_id uuid NOT NULL UNIQUE/u);
 assert.match(sql,/PRIMARY KEY\(request_id,revision\)/u);
 assert.match(decide,/current_revision<>p_expected_revision/u);
 assert.equal((decide.match(/'operationId',p_operation/g)||[]).length,2);
 assert.match(decide,/prior.operation_id=p_operation AND prior.decision=p_decision AND prior.revision=p_expected_revision\+1/u);
 assert.match(decide,/current_decision='pending' AND p_decision IN \('accepted','declined'\)\) OR \(current_decision='accepted' AND p_decision='withdrawn'\)/u);
 assert.doesNotMatch(sql,/\bUPDATE private\.|\bDELETE FROM/u);
 assert.ok(decide.indexOf('FOR UPDATE')<decide.indexOf('ORDER BY revision DESC LIMIT 1'));
 assert.match(decide,/current_setting\('transaction_isolation'\) IS DISTINCT FROM 'read committed'/u);
});
test('withdrawal does not require source connection and history cannot be discarded by rollback',()=>{
 const acceptance=decide.slice(decide.indexOf("IF p_decision='accepted' THEN"),decide.indexOf('PERFORM 1 FROM private.gx_connected360_document_request_v1'));
 assert.match(acceptance,/gx_document_request_proof_v1\(q\)/u);
 assert.equal((decide.match(/gx_document_request_proof_v1\(q\)/g)||[]).length,1);
 assert.match(rollback,/GX_DOCUMENT_CONSENT_ROLLBACK_REQUIRES_HISTORY_RETENTION/u);
 assert.doesNotMatch(rollback,/\bCASCADE\b/u);
});

test('owner review reconstructs pending exact evidence under the same locks; no draft prose leaves the server',()=>{
 for(const p of [/owner_id=auth.uid\(\) AND client_id=public.iberfit_client_id\(\)/u,/r.revision IS DISTINCT FROM q.report_revision/u,/gx_document_draft_sha_v1\(r\) IS DISTINCT FROM q.draft_sha256/u,/proof->>'evidenceSha256' IS DISTINCT FROM q.evidence_sha256/u,/prior.revision IS NOT NULL/u,/GX_DOCUMENT_REVIEW_DECIDED/u])assert.match(review,p);
 assert.ok(review.indexOf('FOR SHARE;')<review.indexOf('gx_document_request_proof_v1(q)'));
 assert.ok(review.indexOf('gx_document_request_proof_v1(q)')<review.indexOf('PERFORM 1 FROM private.gx_connected360_document_request_v1'));
 assert.doesNotMatch(review,/r.content|coachComment|source_grant_id|source_cursor|q.owner_id|q.coach_id,/u);
 assert.match(review,/'reportTitle',r.title,'coachName',coach_name,'reportType','weekly','evidence',proof/u);
});
test('receipt-only review supports decline or withdrawal without source reads',()=>{
 const gated=review.slice(review.indexOf('IF p_preview THEN'),review.indexOf('-- Same report'));
 assert.match(gated,/gx_document_request_proof_v1\(q\)/u);
 assert.equal((review.match(/gx_document_request_proof_v1\(q\)/g)||[]).length,1);
 assert.match(review,/'revision',coalesce\(prior.revision,0\),'decision',coalesce\(prior.decision,'pending'\),'preview',NULL/u);
 assert.match(rollback,/DROP FUNCTION private.gx_document_request_review_v1\(uuid,boolean\) RESTRICT/u);
});

test('document material identity binds expected exact official source without lifecycle metadata',()=>{
 const material=sql.slice(sql.indexOf('CREATE FUNCTION private.gx_document_publication_material_sha_v1'),sql.indexOf('CREATE FUNCTION private.gx_document_expected_publication_body_v1'));
 const expected=sql.slice(sql.indexOf('CREATE FUNCTION private.gx_document_expected_publication_body_v1'),sql.indexOf('-- Caller MUST hold report row lock'));
 assert.match(sql,/publication_sha256 text NOT NULL CHECK/u);
 for(const key of ['reportId','clientId','reportType','title','periodStart','periodEnd','summary','conclusions','recommendations','evidence','activitySeries'])assert.ok(material.includes("'"+key+"'"),key);
 assert.doesNotMatch(material,/r\.revision|p_body->>'status'|coachComment|visibleToClient/u);
 assert.match(expected,/jsonb_array_length\(r.content->'evidence'\)>=12/u);
 assert.match(expected,/'connected360:'\|\|provider\|\|':'\|\|p_request::text/u);
 assert.match(expected,/r.content->'evidence'\|\|jsonb_build_array\(line\)/u);
 assert.match(create,/q.publication_sha256:=private.gx_document_expected_publication_sha_v1\(r,q.id,proof\)/u);
 for(const part of [decide,review])assert.match(part,/gx_document_expected_publication_sha_v1\(r,q.id,proof\) IS DISTINCT FROM q.publication_sha256/u);
 assert.match(rollback,/DROP FUNCTION private.gx_document_expected_publication_sha_v1\(public.reports,uuid,jsonb\) RESTRICT/u);
});

test('snapshot material check requires one exact request reference, document identity and latest acceptance',()=>{
 const check=sql.slice(sql.indexOf('CREATE FUNCTION private.gx_document_accepted_material_matches_v1'),sql.indexOf('-- Caller MUST hold report row lock'));
 assert.match(check,/STABLE SECURITY INVOKER/u);
 assert.match(check,/cardinality\(sources\) IS DISTINCT FROM 1/u);
 assert.match(check,/x.report_id=p_report AND x.client_id=p_client AND x.provider=split_part/u);
 assert.match(check,/IS DISTINCT FROM q.publication_sha256/u);
 assert.match(check,/d.decision='accepted' AND d.revision=1/u);
 assert.match(check,/ORDER BY d.revision DESC LIMIT 1\) IS TRUE/u);
 assert.doesNotMatch(check,/FOR (UPDATE|SHARE)|\bINSERT\b|\bUPDATE\b|\bDELETE\b/u);
 assert.match(rollback,/DROP FUNCTION private.gx_document_accepted_material_matches_v1\(uuid,uuid,jsonb\) RESTRICT/u);
});


test('read and write authorization use identical source/assignment scope; only writer locks',()=>{
 const snapshot=sql.slice(sql.indexOf('CREATE FUNCTION private.gx_document_request_proof_snapshot_v1'),sql.indexOf('-- Resolve only a request'));
 assert.equal(snapshot,proof.replace('gx_document_request_proof_v1(','gx_document_request_proof_snapshot_v1(').replace('VOLATILE SECURITY INVOKER','STABLE SECURITY INVOKER').replace('m26_gx_connected360_report_observations_v1(','m26_gx_connected360_report_observations_snapshot_v1(').replace('\n FOR SHARE OF g,a,b;',';'));
 const current=sql.slice(sql.indexOf('CREATE FUNCTION private.gx_document_publication_current_v1'),sql.indexOf('-- Write-time authorization'));
 assert.match(current,/STABLE SECURITY INVOKER/u);
 assert.match(current,/gx_document_accepted_material_matches_v1\(p_report,p_client,p_body\) IS DISTINCT FROM true/u);
 assert.match(current,/r.created_by=q.coach_id/u);
 assert.match(current,/r.status::text='publicado' AND r.audience='cliente'/u);
 assert.match(current,/gx_document_publication_material_sha_v1\(r.id,r.client_id,r.content\) IS NOT DISTINCT FROM q.publication_sha256/u);
 assert.match(snapshot,/m.user_id=q.owner_id AND m.organization_id=q.organization_id AND m.status='active'/u);
 assert.match(current,/gx_document_request_proof_snapshot_v1\(q\)/u);
 assert.match(current,/evidenceSha256.*IS NOT DISTINCT FROM q.evidence_sha256/u);
 assert.doesNotMatch(current,/FOR (UPDATE|SHARE)|pg_.*advisory|\bINSERT\b|\bDELETE\b/u);
});
test('publication serializes report, source and consent; rechecks latest decision after lock',()=>{
 const lock=sql.slice(sql.indexOf('CREATE FUNCTION private.gx_document_publication_lock_v1'),sql.indexOf('REVOKE ALL ON FUNCTION private.gx_document_request_proof_snapshot_v1'));
 assert.match(lock,/VOLATILE SECURITY INVOKER/u);
 assert.match(lock,/current_setting\('transaction_isolation'\) IS DISTINCT FROM 'read committed'/u);
 assert.match(lock,/coach_id=r.created_by/u);
 assert.match(lock,/r.revision IS DISTINCT FROM q.report_revision/u);
 assert.match(lock,/gx_document_draft_sha_v1\(r\) IS DISTINCT FROM q.draft_sha256/u);
 assert.match(lock,/proof->>'evidenceSha256' IS DISTINCT FROM q.evidence_sha256/u);
 assert.ok(lock.indexOf('FROM public.reports WHERE id=p_report AND client_id=p_client FOR UPDATE')<lock.indexOf('gx_document_request_proof_v1(q)'));
 assert.ok(lock.indexOf('gx_document_request_proof_v1(q)')<lock.indexOf('WHERE id=q.id FOR UPDATE'));
 assert.ok(lock.indexOf('WHERE id=q.id FOR UPDATE')<lock.lastIndexOf('gx_document_accepted_material_matches_v1(p_report,p_client,p_body)'));
 assert.match(lock,/RETURN private.gx_document_accepted_material_matches_v1\(p_report,p_client,p_body\) IS TRUE/u);
 assert.match(rollback,/DROP FUNCTION private.gx_document_publication_lock_v1\(uuid,uuid,jsonb\) RESTRICT/u);
 assert.match(rollback,/DROP FUNCTION private.gx_document_publication_current_v1\(uuid,uuid,jsonb\) RESTRICT/u);
});
