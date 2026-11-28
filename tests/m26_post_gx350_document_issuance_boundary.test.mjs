import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base='supabase/release-procedures/gx_connected360_document_issuance_boundary_v1';
const sql=readFileSync(base+'.sql','utf8'),rollback=readFileSync(base+'.rollback.sql','utf8');
test('issuance guard requires exact service scope, digest, path and immutable material; leaves all closed constraints',()=>{
 for(const x of ['gx_document_pdf_service_lock_v1(NEW.report_id,NEW.client_id,NEW.report_revision,NEW.source_snapshot,NEW.issued_by)','NEW.source_sha256 IS DISTINCT FROM encode(sha256','NEW.artifact_path IS DISTINCT FROM','GX_DOCUMENT_ISSUANCE_IMMUTABLE','to_jsonb(NEW)-ARRAY','gx_document_terminal_actor_v1(OLD.client_id','gx_document_issuance_closed_v1','has_table_privilege','BEFORE INSERT OR UPDATE'])assert.ok(sql.includes(x),x);
 assert.doesNotMatch(sql,/DROP CONSTRAINT|GRANT EXECUTE|DELETE FROM/);
 assert.doesNotMatch(rollback,/CASCADE|DELETE FROM/);
});
test('legacy professional evidence check preserved and exact reversible anchors retained',()=>{
 for(const x of ['be9f09c1851b5cc3e618fef03aaaa757','4644f631db0575fffcb5c66198e217cf']){assert.ok(sql.includes(x));assert.ok(rollback.includes(x));}
 const patches=[...sql.matchAll(/\$p\$([\s\S]*?)\$p\$/g)].map(x=>x[1]);assert.equal(patches.length,2);for(const p of patches)assert.ok(rollback.includes(p));
 assert.ok(sql.includes('gx_document_other_evidence_current_v1(NEW.client_id,NEW.content)'));
});
