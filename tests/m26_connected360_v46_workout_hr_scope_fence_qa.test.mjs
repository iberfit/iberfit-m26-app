import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const m=readFileSync(new URL('../supabase/qa-migrations/20261012080000_connected360_v46_workout_hr_scope_fence_qa.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261012080000_connected360_v46_workout_hr_scope_fence_qa.rollback.sql',import.meta.url),'utf8');
test('Exercise HR fields require their own explicit general heart rate authorization',()=>{
  assert.match(m,/M26_V46_WORKOUT_HR_SCOPE_DENIED/u);
  assert.match(m,/v_row \?\| array\['heartRateSamples','avgBpm','minBpm','maxBpm'\]/u);
  assert.match(m,/not \('generalHeartRate'=any\(v_scopes\)\)/u);
  assert.match(m,/M26_V46_SCOPE_DENIED/u);
  assert.match(m,/v_cursor>v_grant_cursor/u);
  assert.match(m,/auth\.uid\(\)/u);
  assert.match(m,/iberfit_client_id\(\)/u);
  assert.doesNotMatch(m,/grant execute|grant insert|automatic_sync_certified\s*=\s*true/iu);
  assert.match(rollback,/REVOKE EXECUTE/u);
});
