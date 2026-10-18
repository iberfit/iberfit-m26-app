import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const files={
  qaMigration:'../supabase/qa-migrations/20261018223000_p0_client_bootstrap_early_safe_projection_qa_v1.sql',
  qaRollback:'../supabase/qa-rollbacks/p0_client_bootstrap_early_safe_projection_qa_v1.rollback.sql',
  prodMigration:'../supabase/migrations/20261018223000_p0_client_bootstrap_early_safe_projection_prod_v1.sql',
  prodRollback:'../supabase/rollbacks/p0_client_bootstrap_early_safe_projection_prod_v1.rollback.sql',
};
const v=Object.fromEntries(Object.entries(files).map(([key,path])=>[key,fs.readFileSync(new URL(path,import.meta.url),'utf8')]));
const executable=s=>s.split('\n').filter(x=>!x.trim().startsWith('--')).join('\n');
test('QA/PROD early projection migrations fail closed on environment-specific baselines',()=>{
  assert.match(v.qaMigration,/8896151785169af347449df0c5199709/);
  assert.match(v.qaMigration,/ce0cbff2a99e28bff593132a350de595/);
  assert.match(v.prodMigration,/e62108e529544f3987e1be3f5ba1a2e2/);
  assert.match(v.prodMigration,/6ca1d901bb26ceedccfb7dc15945451d/);
  assert.match(v.prodRollback,/6ca1d901bb26ceedccfb7dc15945451d/);
  assert.match(v.prodRollback,/e62108e529544f3987e1be3f5ba1a2e2/);
});
test('early Client-only projection uses existing M43 safe projectors and preserves all other roles',()=>{
  for(const s of [v.qaMigration,v.prodMigration]){
    assert.match(s,/case when v_role='cliente' then public\.iberfit_m43_client_safe_session_v2\(to_jsonb\(s\)\) else to_jsonb\(s\) end/);
    assert.match(s,/case when v_role='cliente' then public\.iberfit_m43_client_safe_execution_v1\(to_jsonb\(e\)\) else to_jsonb\(e\) end/);
    for(const type of ['planning','session','session_execution'])assert.ok(s.includes("v_role='cliente' and e.entity_type='"+type+"'"));
    assert.match(s,/STABLE SECURITY DEFINER/);
    assert.match(s,/SET search_path TO ''/);
    assert.match(s,/P0_(QA|PROD)_EARLY_PROJECTION_SECURITY_ATTRIBUTES_CHANGED/);
    assert.doesNotMatch(executable(s),/\b(?:ALTER ROLE|GRANT|REVOKE|DROP|TRUNCATE|DELETE FROM|UPDATE .*SET|statement_timeout)\b/i);
  }
});
test('rollback exact and no early projection remains',()=>{
 for(const [env,s] of [['QA',v.qaRollback],['PROD',v.prodRollback]]){
   assert.match(s,new RegExp('P0_'+env+'_EARLY_PROJECTION_ROLLBACK_REVIEW_REQUIRED'));
   assert.doesNotMatch(s,/case when v_role='cliente' then public\.iberfit_m43_client_safe_session_v2\(to_jsonb\(s\)\)/);
   assert.match(s,/STABLE SECURITY DEFINER/);
   assert.doesNotMatch(executable(s),/\b(?:ALTER ROLE|GRANT|REVOKE|DROP|TRUNCATE|DELETE FROM|UPDATE .*SET|statement_timeout)\b/i);
 }
});
