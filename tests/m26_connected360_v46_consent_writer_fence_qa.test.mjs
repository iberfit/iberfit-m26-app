import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const m=readFileSync(new URL('../supabase/qa-migrations/20261012054000_connected360_v46_consent_writer_fence_qa.sql',import.meta.url),'utf8');
const r=readFileSync(new URL('../supabase/qa-rollbacks/20261012054000_connected360_v46_consent_writer_fence_qa.rollback.sql',import.meta.url),'utf8');

test('V46 remains the only canonical QA store for general HR and exercise evidence',()=>{
  assert.match(m,/m26_wearable_heart_rate_daily_v46/u);
  assert.match(m,/m26_wearable_exercise_evidence_v46/u);
  assert.doesNotMatch(m,/ADD COLUMN general_heart_rate/u);
  assert.match(m,/generalHeartRate/u);
  assert.match(m,/exerciseSessions/u);
  assert.match(m,/v_provider<>'health_connect'/u);
});

test('Owner and grant checked under shared revocation fence for each metric',()=>{
  for (const re of [
    /auth\.uid\(\)/u,/iberfit_client_id\(\)/u,/v_cursor>v_grant_cursor/u,
    /'iberfit:wfence:v1:'/u,/for update/u,/M26_V46_SCOPE_DENIED/u,
    /M26_V46_GRANT_STALE/u,/M26_V46_GRANT_REVOKED/u,
    /m26_wearable_v46_cleanup_on_erase_all_qa_v1/u,
    /m26_wearable_v46_cleanup_on_delete_consent_qa_v1/u,
  ]) assert.match(m,re);
  assert.match(m,/revoke all on function public\.m26_wearable_v46_import_explicit_qa_v1\(uuid,jsonb\) from public,anon/u);
  assert.doesNotMatch(m,/grant (?:insert|select|update) on public\.m26_wearable_/iu);
});

test('Non-certified QA, idempotent timestamps, and preserving rollback',()=>{
  assert.match(m,/'automatic',false/u);
  assert.match(m,/'automaticSyncCertified',false/u);
  assert.match(m,/M26_V46_HR_SAME_TIMESTAMP_CONFLICT/u);
  assert.match(m,/M26_V46_EX_SAME_TIMESTAMP_CONFLICT/u);
  assert.match(r,/revoke execute on function/u);
  assert.doesNotMatch(r,/drop table|truncate table|delete from/iu);
});
