import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base='supabase/release-procedures/gx_connected360_document_storage_boundary_v1';
const sql=readFileSync(base+'.sql','utf8'), rollback=readFileSync(base+'.rollback.sql','utf8');
const fixture=readFileSync('qa/sql/connected360-document/storage_boundary.sql','utf8');
test('closed staged installation does not remove existing storage fences or grant RPC access',()=>{
 for(const value of ['gx_document_canonical_closed_v1','gx_document_projected_closed_v1','gx_document_issuance_closed_v1','gx_document_bus_internal_v1','GX_DOCUMENT_STORAGE_PREREQUISITES']) assert.ok(sql.includes(value),value);
 assert.doesNotMatch(sql,/\bDROP CONSTRAINT|\bGRANT EXECUTE|\bGRANT INSERT/);
});
test('transaction-bound permit is private, exact and not a spoofable session flag',()=>{
 for(const value of ['transaction_id xid8 PRIMARY KEY','FORCE ROW LEVEL SECURITY','REVOKE ALL ON TABLE private.gx_document_write_permit_v1 FROM PUBLIC,anon,authenticated,service_role','w.transaction_id=pg_current_xact_id_if_assigned()','w.actor_id=auth.uid()','w.target_status=p_status AND w.revision=p_revision','w.request_id','w.material_sha256=private.gx_document_publication_material_sha_v1','gx_document_accepted_material_matches_v1']) assert.ok(sql.includes(value),value);
 assert.doesNotMatch(sql,/set_config\s*\(/i);
});
test('internal adapter opens permit only around actual bus and closes after validated readback',()=>{
 const entry=sql.split('d:=replace(d,entry,$patch$')[1].split('$patch$);')[0];
 const finish=sql.split('d:=replace(d,finish,$patch$')[1].split('$patch$);')[0];
 assert.ok(entry.indexOf('INSERT INTO private.gx_document_write_permit_v1')<entry.indexOf('result:=private.gx_document_bus_internal_v1(command);'));
 assert.ok(finish.indexOf('DELETE FROM private.gx_document_write_permit_v1')<finish.indexOf('RETURN jsonb_build_object'));
 assert.ok(finish.includes('GX_DOCUMENT_STORAGE_PERMIT_MISSING'));
 assert.ok(rollback.includes(entry));assert.ok(rollback.includes(finish));
});
test('canonical transition guard denies reclassification, stale revision, unauthorized material and lineage removal',()=>{
 for(const value of ['IF NOT marked OR','NEW.entity_type IS DISTINCT FROM prior.entity_type','NEW.entity_id IS DISTINCT FROM prior.entity_id','NEW.client_id IS DISTINCT FROM prior.client_id','NEW.revision IS DISTINCT FROM prior.revision+1',"NEW.body->>'status' IS DISTINCT FROM NEW.status::text",'GX_DOCUMENT_CANONICAL_MATERIAL_CHANGED','GX_DOCUMENT_CANONICAL_PERMIT_REQUIRED',"prior.status::text='borrador' AND NEW.status::text='aprobado'","prior.status::text='aprobado' AND NEW.status::text='publicado'"]) assert.ok(sql.includes(value),value);
});
test('projection must match canonical revision and material, with only public allowlist, including legacy second update',()=>{
 for(const value of ['d.revision IS DISTINCT FROM NEW.revision','canonical_status IS DISTINCT FROM NEW.status::text','gx_document_publication_material_sha_v1(NEW.id,NEW.client_id,d.body) IS DISTINCT FROM new_sha','GX_DOCUMENT_PROJECTED_PRIVATE_FIELDS','GX_DOCUMENT_PROJECTED_PRIVATE_MISMATCH','GX_DOCUMENT_PROJECTED_REPLAY_CHANGED','GX_DOCUMENT_PROJECTED_PERMIT_REQUIRED','(NEW.revision IN (OLD.revision,OLD.revision+1)) IS NOT TRUE']) assert.ok(sql.includes(value),value);
});
test('terminal paths preserve lineage and require actor authorization without current source consent',()=>{
 for(const value of ['gx_document_terminal_actor_v1','private.m26_v49_live_session()','public.iberfit_require_privileged_assurance_v65d()',"prior.status::text='publicado' AND NEW.status::text='retirado'",'GX_DOCUMENT_CANONICAL_TERMINAL_DENIED','GX_DOCUMENT_PROJECTED_TERMINAL_DENIED']) assert.ok(sql.includes(value),value);
});
test('rollback refuses existing material or residual permits and preserves original bus',()=>{
 for(const value of ['GX_DOCUMENT_STORAGE_ROLLBACK_REQUIRES_CLOSED_EMPTY_FENCE','GX_DOCUMENT_STORAGE_TRANSITION_ROLLBACK_DRIFT','DROP TABLE private.gx_document_write_permit_v1 RESTRICT','result:=private.gx_document_bus_internal_v1(command);']) assert.ok(rollback.includes(value),value);
 assert.doesNotMatch(rollback,/\bCASCADE\b|\bDELETE FROM public\./);
});
test('new PG17 fixture tests direct writes, second update, no persisted permit, rollback and data integrity',()=>{
 for(const value of ['no API permit insertion','valid material without private transaction permit denied','failed command rolls back permit and storage','failure left no permit or partial approval','authorized storage approval including second update','authorized storage publication including second update','permit consumed after publication','private projection field denied','projection lineage removal denied','canonical reclassification denied','GX_DOCUMENT_STORAGE_BOUNDARY_PG17_OK','ON CONFLICT(entity_type,entity_id) DO UPDATE']) assert.ok(fixture.includes(value),value);
});

test('canonical upsert locks and verifies existing row before INSERT phase',()=>{assert.ok(sql.includes('FROM public.domain_entities_v26 WHERE entity_type=NEW.entity_type AND entity_id=NEW.entity_id FOR UPDATE NOWAIT'));assert.ok(sql.includes("IF NOT FOUND THEN RAISE EXCEPTION 'GX_DOCUMENT_CANONICAL_WRITE_DENIED'"));assert.ok(sql.includes('prior:=OLD'));});
