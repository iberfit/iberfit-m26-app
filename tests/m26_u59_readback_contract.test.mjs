import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('U59 is read-only and guarded by exact first push, never by PR or a rerun',()=>{
  const wf=source('.github/workflows/coach-webauthn-recurring.yml');
  const spec=source('qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs');
  assert.match(wf,/M26_QA_U59_READBACK:.*github\.event_name == 'push'.*github\.run_attempt == 1.*SIGNATURE U59:/u);
  assert.match(wf,/startsWith\(github\.event\.head_commit\.message, 'SIGNATURE U59R:'\)/u);
  assert.match(spec,/if\(process\.env\.M26_QA_U59_READBACK==='true'\)/u);
  assert.match(spec,/certifyU59CoachConfirmedReadback\(/u);
  assert.match(spec,/M26_QA_U56_PUBLISH','M26_QA_U58_EXECUTE/u);
});
test('U59 readback is independent and requires actual Client completion + reload and Coach MFA context',()=>{
  const helper=source('qa/coach-webauthn-recurring/u59-coach-readback.mjs');
  assert.match(helper,/openU56ClientReadOnly/u);
  assert.match(helper,/data-m43-completed-session/u);
  assert.match(helper,/toContainText\('4 registros'\)/u);
  assert.match(helper,/data-m26-interactive="ready"/u);
  assert.match(helper,/openReadbackArea\('progreso'/u);
  assert.match(helper,/openReadbackArea\('expediente'/u);
  assert.match(helper,/independentCoachMfa:true/u);
  assert.match(helper,/backendMutationCertified:false/u);
  assert.doesNotMatch(helper,/supabase\.from\(.+\)\.insert|iberfit_execute_command_v26|service_role/u);
});
test('U59 keeps the one-time U58S write trigger intact without empowering U59',()=>{
  const wf=source('.github/workflows/coach-webauthn-recurring.yml');
  assert.match(wf,/startsWith\(github\.event\.head_commit\.message, 'SIGNATURE U58S:'\)/u);
  const match=wf.match(/M26_QA_U58_EXECUTE: ([^\n]+)/u);
  assert.ok(match);
  assert.doesNotMatch(match[1],/U59/u);
});

test('U59R reads Coach online before the offline U55 authoring isolation',()=>{
 const spec=source('qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs');
 const readback=spec.indexOf('await certifyU59CoachConfirmedReadback({');
 const offline=spec.indexOf('u56Scope.title=await certifyOfflineCoachAuthoring(');
 assert.ok(readback>0&&offline>readback,'Readback MUST precede U55 offline isolation');
 const helper=source('qa/coach-webauthn-recurring/u59-coach-readback.mjs');
 assert.doesNotMatch(helper,/openCertifiedCoachArea\(/u);
 assert.match(helper,/openReadbackArea\('progreso'/u);
 assert.match(helper,/openReadbackArea\('expediente'/u);
 assert.match(helper,/m26-shell\[data-m26-role="coach"\]/u);
 assert.match(helper,/aria-current="page"/u);
 assert.match(helper,/backendMutationCertified:false/u);
});
