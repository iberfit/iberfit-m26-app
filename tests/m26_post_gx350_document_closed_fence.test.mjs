import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const prefix='supabase/release-procedures/gx_connected360_document_';
const sql=read(prefix+'closed_fence_v1.sql'),rollback=read(prefix+'closed_fence_v1.rollback.sql');
const reader=read(prefix+'read_boundaries_v1.sql'),readerRollback=read(prefix+'read_boundaries_v1.rollback.sql');
const pg17=read('qa/sql/connected360-document/closed_fence.sql');
const runner=read('scripts/data-safety/gx_document_consent_isolated_pg17.sh');
const constraints=['gx_document_canonical_closed_v1','gx_document_projected_closed_v1','gx_document_issuance_closed_v1'];
test('closed fence is independent, transactionally validated, bounded and does not rewrite data',()=>{
 assert.match(sql,/BEGIN;[\s\S]*lock_timeout='3s'[\s\S]*statement_timeout='30s'[\s\S]*IN ACCESS EXCLUSIVE MODE/);
 for(const name of constraints){assert.ok(sql.includes('ADD CONSTRAINT '+name+' CHECK'));assert.ok(rollback.includes('DROP CONSTRAINT '+name));assert.ok(reader.includes(name));}
 assert.match(sql,/entity_type IS DISTINCT FROM 'report' OR NOT private\.gx_document_has_external_v1\(body\)/);
 assert.match(sql,/NOT private\.gx_document_has_external_v1\(content\)/);assert.match(sql,/NOT private\.gx_document_has_external_v1\(source_snapshot\)/);
 assert.doesNotMatch(sql,/NOT VALID|DISABLE|CREATE POLICY|INSERT INTO|DELETE FROM|UPDATE public\./);
});
test('reserved marker is normalized in a single independent immutable helper, no data lookup or public execution',()=>{
 assert.match(sql,/IMMUTABLE SECURITY INVOKER SET search_path TO ''/);
 assert.match(sql,/lower\(regexp_replace\(coalesce\(e->>'source',''\),'\^\[\[:space:\]\]\+','','g'\)\) LIKE 'connected360:%'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.gx_document_has_external_v1\(jsonb\) FROM PUBLIC,anon,authenticated,service_role/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION private\.gx_document_has_external_v1\(jsonb\) TO authenticated,service_role;/);
 assert.doesNotMatch(reader,/CREATE FUNCTION private\.gx_document_has_external_v1/);
 assert.doesNotMatch(readerRollback,/DROP FUNCTION private\.gx_document_has_external_v1/);
});
test('read layer cannot be installed before validated storage fence and rollback cannot remove a dependent fence',()=>{
 assert.match(reader,/to_regprocedure\('private\.gx_document_has_external_v1\(jsonb\)'\) IS NULL/);
 assert.match(reader,/contype='c' AND convalidated/);
 assert.match(rollback,/to_regprocedure\('private\.gx_document_read_visible_v1\(uuid,uuid,jsonb\)'\) IS NOT NULL/);
 assert.ok(rollback.indexOf('GX_DOCUMENT_CLOSED_FENCE_ROLLBACK_REQUIRES_PROTECTION')<rollback.indexOf('DROP CONSTRAINT'));
 assert.doesNotMatch(rollback,/CASCADE|DELETE FROM|TRUNCATE/);
});
test('isolated PG17 harness tests exact fence constraint, ordinary writes, service role, and rollback before lifecycle',()=>{
 assert.match(pg17,/\\ir .*gx_connected360_document_closed_fence_v1\.sql/);
 assert.match(pg17,/GET STACKED DIAGNOSTICS actual=CONSTRAINT_NAME/);
 assert.match(pg17,/SET ROLE service_role/);
 assert.match(pg17,/GX_FENCE_SERVICE_ROLE_BYPASS/);
 assert.match(pg17,/original report history retained/);
 assert.match(pg17,/\\ir .*gx_connected360_document_closed_fence_v1\.rollback\.sql/);
 assert.ok(runner.indexOf('connected360-document/closed_fence.sql')<runner.indexOf('connected360-document/lifecycle.sql'));
 assert.match(pg17,/GX_DOCUMENT_CLOSED_FENCE_PG17_OK/);
});
