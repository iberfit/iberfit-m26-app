import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20261016182255_p0_bootstrap_jsonb_overlay_v1.sql',import.meta.url),'utf8');
const rollback=fs.readFileSync(new URL('../supabase/rollbacks/p0_bootstrap_jsonb_overlay_v1.rollback.sql',import.meta.url),'utf8');
const executable=(source)=>source.split('\n').filter((line)=>!line.trim().startsWith('--')).join('\n');

test('P0 bootstrap JSONB optimization is guarded and preserves security-definer ACL',()=>{
  assert.match(migration,/115246a2fb1aea298d023e44508c7dba/);
  assert.match(migration,/P0_BOOTSTRAP_BASELINE_CHANGED_REVIEW_REQUIRED/);
  assert.match(migration,/P0_BOOTSTRAP_SECURITY_ATTRIBUTES_CHANGED/);
  assert.doesNotMatch(executable(migration),/\bDO\s+\$/i,'migration must not include anonymous DO blocks');
  assert.match(migration,/STABLE SECURITY DEFINER/);
  assert.match(migration,/SET search_path TO ''/);
  assert.match(migration,/v_data:=v_data \|\| v_updates;/);
  assert.match(migration,/v_result:=jsonb_set\(v_result,'\{data\}',v_data,true\)/);
  assert.equal((migration.match(/v_updates:=v_updates \|\| jsonb_build_object\(/g)||[]).length,10);
  assert.equal((migration.match(/v_data:=jsonb_set\(v_data,/g)||[]).length,0);
  assert.doesNotMatch(executable(migration),/\b(?:ALTER ROLE|GRANT|REVOKE|DROP|TRUNCATE|DELETE FROM|UPDATE .*SET|statement_timeout)\b/i);
  for(const required of ["'privateNotes'","'intelligenceRuns'","'m26Entities'","'domainEvents'","'remoteRevisions'"]){
    assert.ok(migration.includes(required),required+' privacy field preserved');
  }
});

test('P0 bootstrap rollback restores the exact old JSONB transforms only from known optimized hash',()=>{
  assert.match(rollback,/7416e0d52d6fa069cf467e95420d4034/);
  assert.match(rollback,/P0_BOOTSTRAP_ROLLBACK_REVIEW_REQUIRED/);
  assert.equal((rollback.match(/v_data:=jsonb_set\(v_data,/g)||[]).length,10);
  assert.doesNotMatch(rollback,/v_data:=v_data \|\| v_updates/);
  assert.match(rollback,/STABLE SECURITY DEFINER/);
  assert.match(rollback,/SET search_path TO ''/);
});
