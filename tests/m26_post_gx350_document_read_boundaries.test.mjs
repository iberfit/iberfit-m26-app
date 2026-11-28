import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const prefix='supabase/release-procedures/gx_connected360_document_read_boundaries_v1';
const sql=read(prefix+'.sql'), rollback=read(prefix+'.rollback.sql');
const original=read('supabase/release-procedures/gx_report_guards_v1.sql');
const section=(start,end)=>sql.slice(sql.indexOf(start),sql.indexOf(end));
const visibility=section('CREATE FUNCTION private.gx_document_read_scope_v1','REVOKE ALL ON FUNCTION private.gx_document_read_scope_v1');
const other=section('CREATE FUNCTION private.gx_document_other_evidence_current_v1','REVOKE ALL ON FUNCTION private.gx_document_other_evidence_current_v1');
const anchors=s=>Array.from(s.matchAll(/\b(old|new):=\$a\$(.*?)\$a\$;/gs),m=>m[2]);
test('M44 read wrappers change exactly one validation expression and reverse byte-for-byte',()=>{
 const [a,b,c,d]=anchors(sql),[br,ar,dr,cr]=anchors(rollback);
 assert.equal(a,ar);assert.equal(b,br);assert.equal(c,cr);assert.equal(d,dr);
 for(const [old,replacement] of [[a,b],[c,d]]){
  assert.equal(original.split(old).length,2);
  const candidate=original.replace(old,replacement);
  assert.equal(candidate.replace(replacement,old),original);
  assert.ok(replacement.includes('ELSE '+old+' END'));
 }
 assert.match(b,/gx_document_read_visible_v1\(p_report_id,\(prepared->>'clientId'\)::uuid,prepared->'sourceSnapshot'\)/);
 assert.match(d,/gx_document_read_visible_v1\(\(result->>'reportId'\)::uuid,v_client,snapshot\)/);
 for(const hash of ['61b5ec624800951afd06bfbe2e635490','fc964fabfd797e0a5cd1a8ed3aeb9aee']){
  assert.ok(sql.includes(hash));assert.ok(rollback.includes(hash));
 }
});
test('read access requires live authenticated identity, exact subject or original assigned Coach; no admin exception',()=>{
 assert.match(visibility,/STABLE SECURITY DEFINER SET search_path TO ''/);
 for(const check of ["auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'",'private.m26_v49_live_session() IS DISTINCT FROM true', 'WHERE id=p_report AND client_id=p_client','public.iberfit_client_id() IS DISTINCT FROM p_client','actor IS DISTINCT FROM r.created_by','public.iberfit_can_access_client_v26(p_client)','public.is_assigned_coach(p_client)','ELSE RETURN false; END IF;','gx_document_publication_current_v1(p_report,p_client,p_body) IS TRUE','gx_document_other_evidence_current_v1(p_client,p_body) IS TRUE']) assert.ok(visibility.includes(check),check);
 assert.doesNotMatch(visibility,/FOR (UPDATE|SHARE)|role_name='admin'|INSERT INTO|UPDATE public\./);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.gx_document_read_visible_v1\(uuid,uuid,jsonb\) FROM PUBLIC,anon,authenticated,service_role;/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION private\.gx_document_read_visible_v1\(uuid,uuid,jsonb\) TO authenticated;/);
});
test('all authenticated report reads retain existing RLS with an additional restriction',()=>{
 assert.match(sql,/CREATE POLICY gx_document_projected_read_v1 ON public\.reports AS RESTRICTIVE FOR SELECT TO authenticated/);
 assert.match(sql,/CREATE POLICY gx_document_canonical_read_v1 ON public\.domain_entities_v26 AS RESTRICTIVE FOR SELECT TO authenticated/);
 assert.match(sql,/THEN private\.gx_document_read_scope_v1\(id,client_id,content,true\) ELSE true END/);
 assert.match(sql,/THEN public\.iberfit_current_role_v26\(\)='coach' AND private\.gx_document_read_scope_v1\(entity_id,client_id,body,true\) ELSE true END/);
 assert.doesNotMatch(sql,/DROP POLICY|CREATE TRIGGER|CREATE OR REPLACE FUNCTION private\.iberfit_gx_report_body_current_v1|DISABLE ROW LEVEL SECURITY/);
 assert.match(sql,/gx326_report_evidence_guard/);assert.match(sql,/gx326_issuance_evidence_guard/);
});
test('existing professional evidence is checked independently, not bypassed by external consent',()=>{
 assert.match(other,/IF NOT private\.gx_document_has_external_v1\(p_body\) THEN/);
 assert.match(other,/jsonb_agg\(e ORDER BY ord\)/);
 assert.match(other,/WHERE NOT private\.gx_document_has_external_v1\(jsonb_build_object\('evidence',jsonb_build_array\(e\)\)\)/);
 assert.match(other,/iberfit_gx_report_body_current_v1\(p_client,jsonb_set\(p_body,'\{evidence\}',other_rows\)\) IS TRUE/);
 assert.match(visibility,/gx_document_publication_current_v1\(p_report,p_client,p_body\) IS TRUE\s+AND private\.gx_document_other_evidence_current_v1/);
});
test('rollback cannot expose existing external material and restores original wrapper definitions before removing restrictions',()=>{
 for(const p of ['public.reports','public.domain_entities_v26','public.iberfit_evolution_report_issuances_v1']){
  assert.ok(sql.includes(p));assert.ok(rollback.includes(p));
 }
 assert.match(rollback,/GX_DOCUMENT_READ_ROLLBACK_REQUIRES_PROTECTION/);
 assert.ok(rollback.indexOf('GX_DOCUMENT_READ_ROLLBACK_REQUIRES_PROTECTION')<rollback.indexOf('DROP POLICY'));
 assert.match(rollback,/md5\(replace\(d,old,new\)\) IS DISTINCT FROM/);
 assert.doesNotMatch(rollback,/\bCASCADE\b|DELETE FROM|TRUNCATE/);
});

test('deployed legacy marker gap cannot activate the read layer before the closed external guard',()=>{
 assert.match(sql,/to_regprocedure\('private\.iberfit_gx_reassessment_body_current_v1\(uuid,jsonb\)'\) IS NULL/);
 assert.match(sql,/private\.iberfit_gx_report_body_has_refs_v1\(probe\) IS DISTINCT FROM true/);
 assert.match(sql,/private\.iberfit_gx_report_body_current_v1\('00000000-0000-4000-8000-000000000001'::uuid,probe\) IS DISTINCT FROM false/);
 assert.match(sql,/GX_DOCUMENT_READ_REQUIRES_CLOSED_EXTERNAL_GUARD/);
 const gate=read('supabase/release-procedures/gx_reassessment_report_guard_v1.sql'),undo=read('supabase/release-procedures/gx_reassessment_report_guard_v1.rollback.sql');
 for(const script of [gate,undo]){
  assert.match(script,/LOCK TABLE public\.domain_entities_v26,public\.reports/);
  assert.match(script,/public\.domain_entities_v26 r WHERE r.entity_type='report' AND EXISTS/);
 }
 assert.match(undo,/GX_REASSESSMENT_ROLLBACK_REQUIRES_DOCUMENT_BOUNDARY_ROLLBACK/);
 assert.match(undo,/GX_REASSESSMENT_ROLLBACK_REQUIRES_DOCUMENT_PROTECTION/);
});


test('private approved read requires exact canonical/projection parity, current acceptance and source proof',()=>{
 const approved=section('CREATE FUNCTION private.gx_document_approved_current_v1','REVOKE ALL ON FUNCTION private.gx_document_approved_current_v1');
 for(const check of ["status::text='aprobado' AND audience='coach'", "r.content->'visibleToClient' IS DISTINCT FROM 'false'::jsonb",'r.content IS DISTINCT FROM p_body','d.revision=r.revision AND d.body=r.content','gx_document_accepted_material_matches_v1(p_report,p_client,p_body) IS DISTINCT FROM true','gx_document_request_proof_snapshot_v1(q)','IS NOT DISTINCT FROM q.evidence_sha256']) assert.ok(approved.includes(check),check);
 assert.doesNotMatch(approved,/FOR (UPDATE|SHARE)|pg_.*advisory|INSERT INTO/);
 assert.match(visibility,/IF p_allow_private IS TRUE AND role_name='coach' AND r.status::text='aprobado' AND r.audience='coach' THEN/);
 assert.match(visibility,/gx_document_approved_current_v1\(p_report,p_client,p_body\) IS TRUE\s+AND private\.gx_document_other_evidence_current_v1/);
 assert.match(visibility,/a.role::text IN \('coach','admin'\)/);
 assert.match(visibility,/a.role::text='admin'/);
 assert.match(sql,/SELECT private\.gx_document_read_scope_v1\(p_report,p_client,p_body,false\) IS TRUE/);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.gx_document_approved_current_v1\(uuid,uuid,jsonb\) FROM PUBLIC,anon,authenticated,service_role/);
 assert.ok(rollback.indexOf('DROP FUNCTION private.gx_document_read_visible_v1')<rollback.indexOf('DROP FUNCTION private.gx_document_read_scope_v1'));
 assert.ok(rollback.indexOf('DROP FUNCTION private.gx_document_read_scope_v1')<rollback.indexOf('DROP FUNCTION private.gx_document_approved_current_v1'));
});

test('PG17 candidate exercises actual restrictive policies with synthetic identities and rolls back its fixtures',()=>{
 const fixture=read('qa/sql/connected360-document/private_read.sql');
 const harness=read('scripts/data-safety/gx_document_consent_isolated_pg17.sh');
 for(const check of ['Coach approved projection','Coach approved canonical','Coach cannot use PDF before publication','owner cannot read approved private projection','foreign client denied','canonical drift denies projection','mixed Admin denied','source revocation denies private read','owner sees published material'])assert.ok(fixture.includes(check),check);
 assert.match(fixture,/SET ROLE authenticated;/);
 assert.match(fixture,/ROLLBACK;\s*\\echo GX_DOCUMENT_PRIVATE_READ_PG17_OK/);
 assert.match(harness,/fixture\.replace\(marker,fence\[fence\.index\(a\):fence\.index\(b\)\]\+read\[read\.index\(c\):read\.index\(d\)\]\)/);
});

test('published pair requires distinct M44 privacy states, exact digest and revision and allowlisted projection',()=>{
 const pair=section('CREATE FUNCTION private.gx_document_published_pair_current_v1','REVOKE ALL ON FUNCTION private.gx_document_published_pair_current_v1');
 for(const check of ["r.content->'visibleToClient'='true'::jsonb", "d.body->'visibleToClient'='false'::jsonb", "d.revision=r.revision", "r.content->>'format'='a4-premium'", "r.content-ARRAY[", "gx_document_publication_material_sha_v1(p_report,p_client,d.body)=", "gx_document_publication_material_sha_v1(p_report,p_client,r.content)=", "gx_document_publication_material_sha_v1(p_report,p_client,p_body) IS NOT NULL"]) assert.ok(pair.includes(check),check);
 assert.match(visibility,/AND private\.gx_document_published_pair_current_v1\(p_report,p_client,p_body\) IS TRUE/);
 assert.ok(rollback.indexOf('DROP FUNCTION private.gx_document_read_scope_v1')<rollback.indexOf('DROP FUNCTION private.gx_document_published_pair_current_v1'));
 const fixture=read('qa/sql/connected360-document/private_read.sql');
 for(const check of ['M44 projection strips private fields','owner never sees private canonical material','published revision drift denies projection','unexpected private fields deny projection'])assert.ok(fixture.includes(check),check);
 assert.match(read('scripts/data-safety/gx_document_consent_isolated_pg17.sh'),/20261015142000_m44_report_client_safe_publication_v1.sql/);
});
