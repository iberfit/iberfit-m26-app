import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const original=readFileSync(new URL('../supabase/qa-migrations/20261010174000_connected360_v45_authorized_preview_guard_qa.sql',import.meta.url),'utf8');
const fixed=readFileSync(new URL('../supabase/qa-migrations/20261010234000_connected360_v45_qa_preflight_coalesce_fix.sql',import.meta.url),'utf8');

test('QA migration changes exactly the two invalid qualified SQL COALESCE expressions',()=>{
  const marker='\nbegin;\n';
  assert.equal(fixed.slice(fixed.indexOf(marker)),original.replaceAll('pg_catalog.coalesce(','coalesce(').slice(original.indexOf(marker)));
  assert.equal((original.match(/pg_catalog\.coalesce\s*\(/gu)||[]).length,2);
  assert.doesNotMatch(fixed,/pg_catalog\.coalesce\s*\(/u);
  assert.match(fixed,/coalesce\(pg_catalog\.array_length/u);
  assert.match(fixed,/coalesce\(pg_catalog\.max\(e\.id\),0\)/u);
});
test('QA only preview remains SECURITY INVOKER, no writes, no client table privileges',()=>{
  assert.match(fixed,/language plpgsql security invoker set search_path=''/u);
  assert.match(fixed,/revoke all on function public\.m26_wearable_v45_validate_native_preview_qa_v1\(uuid,jsonb\)/u);
  assert.match(fixed,/grant execute on function public\.m26_wearable_v45_validate_native_preview_qa_v1\(uuid,jsonb\)\s+to authenticated;/u);
  assert.match(fixed,/M26_CONNECTED360_V45_GRANT_REVOKED/u);
  assert.match(fixed,/sourceTimestampVerified' is distinct from 'false'::jsonb/u);
  assert.match(fixed,/persisted',false/u);
  assert.doesNotMatch(fixed,/\b(insert\s+into|delete\s+from|update\s+public\.|truncate|disable\s+trigger|security definer)\b/iu);
  assert.equal(existsSync(new URL('../supabase/migrations/20261010234000_connected360_v45_qa_preflight_coalesce_fix.sql',import.meta.url)),false);
});
