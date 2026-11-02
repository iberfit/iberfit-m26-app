import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const daily=readFileSync('.github/workflows/daily-use-visual-evidence.yml','utf8');
const isolated=readFileSync('.github/workflows/session-qa-isolated.yml','utf8');

function assertSafeCurrentPrGate(workflow,job,next){
  const guard=workflow.split('  pr-current-head:')[1]?.split(next)[0]||'';
  const guarded=workflow.split(job)[1]||'';
  assert.ok(guard.length>500,'must inspect live PR before scheduling credentialed QA');
  assert.match(workflow,/pull-requests: read/u);
  assert.match(guard,/GITHUB_API_URL.*GITHUB_REPOSITORY.*pulls.*PR_NUMBER/u);
  assert.match(guard,/jq -r '\.draft \| tostring'/u);
  assert.match(guard,/P0_QA_SUPERSEDED_PR_SKIP/u);
  assert.match(guard,/if \[\[ "\$EVENT" != pull_request \]\]/u);
  assert.doesNotMatch(guard,/SUPABASE_(SERVICE_ROLE|PUBLISHABLE_KEY)|M26_QA_.*PASSWORD/u);
  assert.match(guarded,/needs\.pr-current-head\.outputs\.current == 'true'/u);
  assert.match(guarded,/m26-canary-readonly/u);
  assert.match(guarded,/cancel-in-progress: false/u);
}

test('P0 Supabase Free: daily-use visual QA rejects stale PR before shared credentials',()=>{
  assertSafeCurrentPrGate(daily,'  capture:','  capture:');
  assert.match(daily,/  capture:\n    needs: pr-current-head/u);
  assert.match(daily,/M26_QA_CLIENT_B_PASSWORD/u);
  assert.match(daily,/Capture authenticated Client and Coach evidence/u);
  assert.match(daily,/Capture Admin daily-use surfaces/u);
  assert.match(daily,/Capture Coach Hoy current-source visual evidence/u);
});

test('P0 Supabase Free: isolated session QA rejects stale PR but preserves offline and local browser E2E',()=>{
  assertSafeCurrentPrGate(isolated,'  qa-readonly:','  offline:');
  assert.match(isolated,/  qa-readonly:\n    needs: \[offline, pr-current-head\]/u);
  assert.match(isolated,/  offline:\n    if: github.event_name == 'workflow_dispatch'/u);
  assert.match(isolated,/  browser-live-workout:\n    needs: offline/u);
  assert.match(isolated,/Full regression without network or secrets/u);
  assert.match(isolated,/Run Live Workout browser E2E matrix/u);
  assert.match(isolated,/M26_QA_COACH_PASSWORD/u);
  assert.match(isolated,/M26_QA_CLIENT_A_PASSWORD/u);
  assert.match(isolated,/M26_QA_CLIENT_B_PASSWORD/u);
});
