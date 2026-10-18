import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const qaMigration=fs.readFileSync(new URL('../supabase/qa-migrations/20261018220813_p0_client_bootstrap_checkin_dedupe_qa_v1.sql',import.meta.url),'utf8');
const qaRollback=fs.readFileSync(new URL('../supabase/qa-rollbacks/p0_client_bootstrap_checkin_dedupe_qa_v1.rollback.sql',import.meta.url),'utf8');
const prodMigration=fs.readFileSync(new URL('../supabase/migrations/20261018221600_p0_client_bootstrap_checkin_dedupe_prod_v1.sql',import.meta.url),'utf8');
const prodRollback=fs.readFileSync(new URL('../supabase/rollbacks/p0_client_bootstrap_checkin_dedupe_prod_v1.rollback.sql',import.meta.url),'utf8');
const executable=(source)=>source.split('\n').filter((line)=>!line.trim().startsWith('--')).join('\n');

test('QA checkin dedupe remains bound to the QA rc29 candidate',()=>{
  assert.match(qaMigration,/f96b4594e4fe49a1d82e04cbb0cbc65f/);
  assert.match(qaMigration,/e\.entity_type <> 'checkin'/);
  assert.match(qaRollback,/8896151785169af347449df0c5199709/);
  assert.match(qaRollback,/f96b4594e4fe49a1d82e04cbb0cbc65f/);
});

test('production migration is bound to the real PROD baseline and adds only checkin dedupe',()=>{
  assert.match(prodMigration,/5c565986e5946e768cd84eb0398f76cb/);
  assert.match(prodMigration,/e62108e529544f3987e1be3f5ba1a2e2/);
  assert.equal((prodMigration.match(/v_role not in \('client','cliente'\) or e\.entity_type <> 'checkin'/g)||[]).length,1);
  assert.doesNotMatch(prodMigration,/e\.entity_type not in \('private_note','intelligence','report'\)/);
  assert.doesNotMatch(prodMigration,/case when v_role in \('client','cliente'\) then '\[\]'::jsonb/);
  assert.match(prodMigration,/STABLE SECURITY DEFINER/);
  assert.match(prodMigration,/SET search_path TO ''/);
  assert.doesNotMatch(executable(prodMigration),/\b(?:ALTER ROLE|GRANT|REVOKE|DROP|TRUNCATE|DELETE FROM|UPDATE .*SET|statement_timeout)\b/i);
});

test('production rollback restores only the exact rc29 baseline',()=>{
  assert.match(prodRollback,/e62108e529544f3987e1be3f5ba1a2e2/);
  assert.match(prodRollback,/5c565986e5946e768cd84eb0398f76cb/);
  assert.doesNotMatch(prodRollback,/v_role not in \('client','cliente'\) or e\.entity_type <> 'checkin'/);
  assert.match(prodRollback,/STABLE SECURITY DEFINER/);
  assert.match(prodRollback,/SET search_path TO ''/);
  assert.doesNotMatch(executable(prodRollback),/\b(?:ALTER ROLE|GRANT|REVOKE|DROP|TRUNCATE|DELETE FROM|UPDATE .*SET|statement_timeout)\b/i);
});
