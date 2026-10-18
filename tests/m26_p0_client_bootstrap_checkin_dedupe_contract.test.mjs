import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20261018220813_p0_client_bootstrap_checkin_dedupe_v1.sql',import.meta.url),'utf8');
const rollback=fs.readFileSync(new URL('../supabase/rollbacks/p0_client_bootstrap_checkin_dedupe_v1.rollback.sql',import.meta.url),'utf8');
const executable=(source)=>source.split('\n').filter((line)=>!line.trim().startsWith('--')).join('\n');

test('Client bootstrap removes only duplicated checkin entities from m26Entities',()=>{
  assert.match(migration,/f96b4594e4fe49a1d82e04cbb0cbc65f/);
  assert.match(migration,/P0_BOOTSTRAP_RC29_BASELINE_CHANGED_REVIEW_REQUIRED/);
  assert.match(migration,/STABLE SECURITY DEFINER/);
  assert.match(migration,/SET search_path TO ''/);
  assert.equal((migration.match(/e\.entity_type <> 'checkin'/g)||[]).length,1);
  assert.match(migration,/v_role not in \('client','cliente'\)/);
  assert.match(migration,/jsonb_object_agg\(entity_type\|\|':'\|\|entity_id::text,revision\)/);
  assert.doesNotMatch(executable(migration),/\b(?:ALTER ROLE|GRANT|REVOKE|DROP|TRUNCATE|DELETE FROM|UPDATE .*SET|statement_timeout)\b/i);
});

test('dedupe rollback is exact and fail closed',()=>{
  assert.match(rollback,/8896151785169af347449df0c5199709/);
  assert.match(rollback,/P0_BOOTSTRAP_CHECKIN_DEDUPE_ROLLBACK_REVIEW_REQUIRED/);
  assert.doesNotMatch(rollback,/e\.entity_type <> 'checkin'/);
  assert.match(rollback,/f96b4594e4fe49a1d82e04cbb0cbc65f/);
  assert.match(rollback,/STABLE SECURITY DEFINER/);
  assert.match(rollback,/SET search_path TO ''/);
  assert.doesNotMatch(executable(rollback),/\b(?:ALTER ROLE|GRANT|REVOKE|DROP|TRUNCATE|DELETE FROM|UPDATE .*SET|statement_timeout)\b/i);
});
