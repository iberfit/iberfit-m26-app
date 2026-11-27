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

test('QA invite denial uses the exact candidate version and the same result in evidence',async()=>{
  const gate=await readFile(new URL('../scripts/remote-gates/run_qa_real_write_gate.mjs',import.meta.url),'utf8');
  const edge=await readFile(new URL('../supabase/functions/iberfit-admin-client-invite-v1/index.ts',import.meta.url),'utf8');
  const expected=gate.match(/const EXPECTED_INVITE_VERSION='(admin-client-invite-v[0-9]+\.[0-9]+)'/u)?.[1];
  const actual=edge.match(/const FUNCTION_VERSION='(admin-client-invite-v[0-9]+\.[0-9]+)'/u)?.[1];
  assert.ok(expected);assert.equal(expected,actual);
  assert.match(gate,/const inviteInvalidBearerDenied=\s*invalidInviteAuth\.status===401&&\s*String\(invalidInviteAuth\.body\?\.code\|\|''\)==='V26_AUTH_REQUIRED'&&\s*String\(invalidInviteAuth\.body\?\.version\|\|''\)===EXPECTED_INVITE_VERSION;/u);
  assert.match(gate,/if\(!inviteInvalidBearerDenied\)\s*\{/u);
  assert.match(gate,/authorization:\s*\{\s*inviteInvalidBearerDenied,/u);
  assert.doesNotMatch(gate,/admin-client-invite-v26\.4/u);
});
