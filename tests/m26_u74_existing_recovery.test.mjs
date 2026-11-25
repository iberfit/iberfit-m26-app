import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkHistoricFixture} from '../scripts/remote-gates/qa_u74_existing_recovery.mjs';
const source={schema:'iberfit.u71.qa-authenticated-dated-e2e.v1',stage:'prepare-browser',
 status:'QA_BROWSER_FIXTURE_READY',project:'QA',writesApplied:true,prodTouched:false,
 sha:'4f1595cfda0bbfc76911f2f7d37e6e7cea51fa33',runId:'45627237403',
 createdAt:new Date().toISOString(),appointmentless:true,serviceRole:false,
 fixture:{clientId:'10000000-0000-4000-8000-000000000001',
  sessionId:'20000000-0000-4000-8000-000000000001',
  occurrenceId:'30000000-0000-4000-8000-000000000001',
  futureOccurrenceId:'40000000-0000-4000-8000-000000000001',
  stepsExpected:1,appointmentless:true,localDate:'2026-11-25',futureDate:'2026-12-02'}};
test('Historic QA-only interrupted fixture binds exact SHA, run, owner and two dates',()=>{
 assert.equal(checkHistoricFixture(source).stepsExpected,1);
 for(const mutation of [
  {sha:'wrong'},{runId:'45627237404'},{project:'PROD'},
  {writesApplied:false},{status:'QA_BROWSER_HOSTED_E2E_SUCCESS'},
  {fixture:{...source.fixture,occurrenceId:source.fixture.futureOccurrenceId}},
  {fixture:{...source.fixture,stepsExpected:2}},
  {fixture:{...source.fixture,appointmentless:false}},{serviceRole:true},
  {fixture:{...source.fixture,clientId:'not-a-uuid'}},
 ])assert.throws(()=>checkHistoricFixture({...source,...mutation}),/U74_RECOVERY_/u);
});
test('U74 recovery is bounded to existing QA owner and preserves historical data',()=>{
 const script=readFileSync('scripts/remote-gates/qa_u74_existing_recovery.mjs','utf8');
 const workflow=readFileSync('.github/workflows/u74-qa-recover-existing.yml','utf8');
 const browser=readFileSync('qa/rc64/u74-recover-existing.spec.mjs','utf8');
 assert.match(script,/GITHUB_RUN_ATTEMPT/u);
 assert.match(script,/SERVER_STATE_MOVED/u);
 assert.match(script,/OLD_PROVENANCE_EXPIRED/u);
 assert.match(script,/CLIENT_B_READ_EXPOSED/u);
 assert.match(script,/mode==='verify'\?'completada':'en_curso'/u);
 assert.doesNotMatch(script,/DELETE FROM|TRUNCATE|service_role|pjhmrhejsoofmouedavw/iu);
 assert.match(workflow,/github\.run_attempt == 1/u);
 assert.match(workflow,/github\.run_attempt == 2/u);
 assert.match(workflow,/environment: m26-canary-readonly/u);
 assert.doesNotMatch(workflow,/workflow_dispatch|SUPABASE_SERVICE_ROLE_KEY|IBERFIT_PROD_DATABASE_URL/u);
 assert.match(browser,/isQaScopedDatedSyntheticWrite\(request,f\)/u);
 assert.match(browser,/OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_COMPLETAR/u);
 assert.doesNotMatch(browser,/OCURRENCIA_CANCELAR|OCURRENCIAS_CREAR_LOTE|service_role|pjhmrhejsoofmouedavw/u);
});
