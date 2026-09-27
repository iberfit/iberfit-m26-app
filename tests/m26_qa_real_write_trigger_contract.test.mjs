import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const workflow=await readFile(new URL('../.github/workflows/qa-real-write-cert.yml',import.meta.url),'utf8');

function occurrences(value){
  return workflow.split(value).length-1;
}

test('QA real-write certification reruns for database migrations and admin invite edge changes',()=>{
  assert.equal(
    occurrences("- 'supabase/migrations/**'"),
    2,
    'pull_request and Canary push must both recertify real writes after any Supabase migration',
  );
  assert.equal(
    occurrences("- 'supabase/functions/iberfit-admin-client-invite-v1/**'"),
    2,
    'pull_request and Canary push must both recertify the Admin client invitation edge contract',
  );
  assert.match(workflow,/name:\s*write-persist-idempotency-isolation/,'real-write gate identity must remain stable');
  assert.match(workflow,/M26_QA_ONLY:\s*'true'/,'real-write certification must remain QA-only');
  assert.match(workflow,/M26_PROJECT_REF:\s*gjztkdwfmunnzhtvxrsu/,'real-write certification must remain pinned to QA');
});
