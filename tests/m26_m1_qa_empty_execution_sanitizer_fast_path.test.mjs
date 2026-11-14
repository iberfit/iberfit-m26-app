import {materializeQaSanitizerRollback} from '../scripts/release/materialize_qa_sanitizer_rollback.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=readFileSync(new URL('../supabase/qa-migrations/20261112225518_m1_qa_empty_execution_sanitizer_fast_path.sql',import.meta.url),'utf8');
const r=materializeQaSanitizerRollback();
test('M1 optimization is QA-only, synthetic-only, exact-SHA guarded and reversible',()=>{
  for(const sql of [f,r]){
    assert.match(sql,/s.key='environment' AND s.value#>>'\{\}'='QA'/u);
    assert.match(sql,/M1_QA_EMPTY_EXECUTION_OWNER_OR_ACL_CHANGED/u);
    assert.match(sql,/EXECUTE v_changed/u);
    const executableLines=sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n');
    assert.doesNotMatch(executableLines,/(?:^|\n)\s*(?:TRUNCATE|DROP\s+TABLE|DELETE\s+FROM|REVOKE|GRANT)\b/imu);
  }
  assert.match(f,/M1_QA_BOOTSTRAP_SOURCE_DRIFT/u);
  assert.match(f,/M1_QA_FAST_EMPTY_EXECUTION_V1/u);
  assert.match(f,/5d3e13ffc4f00c1e5f29d61fb81cd6e3/u);
  assert.match(r,/5d3e13ffc4f00c1e5f29d61fb81cd6e3/u);
  assert.match(f,/qa.rc74.client-a@iberfit.cl/u);
  assert.match(f,/qa.rc74.client-b@iberfit.cl/u);
  assert.match(f,/29f09c54467ac50aaa91bce79ebe5680/u);
  assert.match(f,/34df411a2b9ce5b60635d6db84ecd240/u);
  assert.match(f,/jsonb_agg\(/u);
  assert.match(f,/else public\.iberfit_m43_client_safe_execution_v1\(item\)/u);
  assert.match(r,/M1_QA_EMPTY_EXECUTION_ROLLBACK_SOURCE_DRIFT/u);
  assert.match(r,/M1_QA_EMPTY_EXECUTION_ROLLBACK_READBACK_FAILED/u);
});
