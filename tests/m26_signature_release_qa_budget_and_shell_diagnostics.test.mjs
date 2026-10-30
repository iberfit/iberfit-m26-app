import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const coach=readFileSync('qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs','utf8');
const client=readFileSync('qa/rc64/authenticated-current-contract.spec.mjs','utf8');

test('Coach retains original authenticated 420s budget plus strictly bounded offline authoring',()=>{
  assert.match(coach,/test\.setTimeout\(720_000\)/u);
  assert.match(coach,/authenticatedJourneyStartedAt=Date\.now\(\)/u);
  assert.match(coach,/toBeLessThanOrEqual\(420_000\)/u);
  assert.match(coach,/offlineAuthoringStartedAt=Date\.now\(\)/u);
  assert.match(coach,/toBeLessThanOrEqual\(240_000\)/u);
  assert.match(coach,/certifyOfflineCoachAuthoring\(page,context,cdp,evidence,pageErrors\)/u);
  assert.match(coach,/await context\.setOffline\(true\)/u);
  assert.match(coach,/expect\(evidence\.blocked,/u);
  assert.match(coach,/No server-side publication or command preflight may be attempted/u);
  assert.doesNotMatch(coach,/toBeLessThanOrEqual\(500_000\)/u);
});
test('Client route SLA stays five seconds and failure captures bounded shell render phases',()=>{
  assert.match(client,/toBeLessThanOrEqual\(5_000\)/u);
  assert.match(client,/event\.isTrusted!==true/u);
  assert.match(client,/shellRouteTimings\.slice\(-24\)/u);
  assert.match(client,/phase:String\(x\.phase/u);
  assert.match(client,/elapsedMs:Number\.isFinite\(x\.elapsedMs\)/u);
  assert.match(client,/atMs:Number\.isFinite\(x\.atMs\)/u);
  assert.match(client,/pointerAtMs:pointerAt===null/u);
  assert.doesNotMatch(client,/toBeLessThanOrEqual\(6_000\)/u);
});

test('Shell clock is QA-only and uses monotonic performance.now for pointer-to-commit breakdown',()=>{
  const source=readFileSync('src/m26/shell/shell-controller.js','utf8');
  assert.match(source,/if\(!qa\|\|!Array\.isArray\(qa\.appStageTimes\)\)return/u);
  assert.match(source,/performance\?\.now\?\.\(\)/u);
  assert.match(source,/atMs:Math\.round/u);
  assert.match(source,/route-click/u);
  assert.match(source,/route-commit/u);
});

test('Login mounts all critical session actions before interactive without forcing idle full-page layout',()=>{
  const session=readFileSync('src/m26/workflows/session-controller.js','utf8');
  const start=session.indexOf('return Object.freeze({mount(){if(mounted)return;');
  const end=session.indexOf('},destroy(){if(!mounted)return;',start);
  assert.ok(start>=0&&end>start);
  const mount=session.slice(start,end);
  for(const token of [
    "root.addEventListener('click',captureSessionEntryIntent,true)",
    "root.addEventListener('click',click)",
    "root.addEventListener('input',input)",
    "root.addEventListener('change',change)",
    "root.addEventListener('keydown',keydown)",
    "root.addEventListener('m26:shell-rendered',onShellRendered)",
  ])assert.ok(mount.includes(token),token);
  assert.match(mount,/if\(active\?\.draft\|\|active\?\.execution\)/u);
  assert.ok(mount.indexOf('mounted=true')<mount.indexOf('if(active?.draft||active?.execution)'));
  const rendered=session.slice(session.indexOf('function onShellRendered()'),session.indexOf('function focusSessionRecoveryField',session.indexOf('function onShellRendered()')));
  for(const token of ['bindSessionStickyTop()','hydrateActiveSetDraft(getContext())','syncLiveAddExerciseControl(getContext())','syncFinishControl(getContext())','ensureSessionClockTicker(getContext())'])assert.ok(rendered.includes(token),token);
  const app=readFileSync('src/m26/app/application.js','utf8');
  assert.ok(app.indexOf('sessionController.mount()')<app.indexOf("root.dataset.m26SessionEntryReady='ready'"));
  assert.ok(app.indexOf("root.dataset.m26SessionEntryReady='ready'")<app.indexOf("root.dataset.m26Interactive='ready'"));
});
