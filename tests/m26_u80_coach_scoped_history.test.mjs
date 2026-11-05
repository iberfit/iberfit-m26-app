import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scopeQaCoachHistoryCore} from '../src/m26/supabase-transport.js';
import {renderReportsRoute} from '../src/m26/modules/route-render.js';

const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const core=()=>({
  environment:'QA',user:{role:'coach',id:'safe-owner'},
  data:{clients:[{id:a},{id:b}],m26Entities:[],domainEvents:[],sessionExecutions:[]},
  remoteRevisions:{['session:'+a]:3},
});

test('U80 Coach selected history keeps the full core untouched but restricts page jobs to one authorized client',()=>{
  const raw=core(),scoped=scopeQaCoachHistoryCore(raw,b);
  assert.deepEqual(scoped.data.clients,[{id:b}]);
  assert.deepEqual(raw.data.clients,[{id:a},{id:b}]);
  assert.strictEqual(scoped.remoteRevisions,raw.remoteRevisions);
  assert.strictEqual(scopeQaCoachHistoryCore(raw),raw);
});
test('U80 Coach history cannot scope a foreign client, malformed UUID or non-Coach context',()=>{
  assert.throws(()=>scopeQaCoachHistoryCore(core(),'33333333-3333-4333-8333-333333333333'),/SCOPE_FORBIDDEN/);
  assert.throws(()=>scopeQaCoachHistoryCore(core(),'foo'),/CLIENT_INVALID/);
  assert.throws(()=>scopeQaCoachHistoryCore({...core(),environment:'PRODUCTION'},a),/CORE_INVALID/);
  assert.throws(()=>scopeQaCoachHistoryCore({...core(),user:{role:'client'}},a),/CORE_INVALID/);
  assert.throws(()=>scopeQaCoachHistoryCore({...core(),data:{clients:[{id:a},{id:a}]}},a),/SCOPE_FORBIDDEN/);
});
test('U80 fails closed in normal roles, retains 20 MB cap and requires explicit Coach click for archive',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  const transport=fs.readFileSync('src/m26/supabase-transport.js','utf8');
  const validator=fs.readFileSync('src/m26/production-state.js','utf8');
  assert.match(source,/reason==='coach-history-demand'/u);
  assert.match(source,/data-m26-qa-coach-history-load/u);
  assert.match(source,/M26_COACH_HISTORY_CONCURRENT_CHANGE/u);
  assert.match(source,/M26_COACH_HISTORY_SELECTION_CHANGED/u);
  assert.match(source,/QA Coach.*progressive/u);
  assert.match(transport,/createPrivilegedHistoryAssembler\(scopedCore/u);
  assert.match(validator,/const MAX_BOOTSTRAP_BYTES=20_000_000/u);
  assert.doesNotMatch(source,/service_role|serviceRoleKey/u);
});

test('U80 Coach initial IRI remains independent of training history, while longitudinal decisions remain gated',()=>{
  const app=fs.readFileSync('src/m26/app/application.js','utf8');
  assert.ok(app.includes("if(!['clientes','ajustes','iri','informes'].includes(area))"));
  assert.ok(app.includes("initialIriOnly:true"),'Coach reports must scope to initial IRI only');
  assert.ok(app.includes("renderQaCoachHistoryGate(status)"),'Explicit archival recovery remains');
  assert.match(app,/if\(isQaCoach&&!historyReady&&\['clientes','ajustes'\]\.includes/u);
  assert.match(app,/return '<div class="m26-route">'\+gate\+'<\/div>'/u);
  assert.match(app,/M26_COACH_HISTORY_SCOPE_FORBIDDEN/u);
  assert.doesNotMatch(app,/if\(!\['clientes','ajustes'\]\.includes\(area\)\)/u);
});

test('U80 initial IRI documents remain usable without a longitudinal archive',()=>{
  const view={
    kind:'informes',role:'coach',serviceKind:'training',canManage:true,
    latestIri:{id:'confirmed-iri',revision:2},
    iriDiagnosis:{confirmed:true,assessmentId:'confirmed-iri',dateLabel:'2026-11-05',revision:2},
    reports:[{id:'private-training-report',title:'Longitudinal secret'}],
    reportCounts:{published:5},
  };
  const baseline=renderReportsRoute({...view,initialIriOnly:true});
  assert.match(baseline,/data-iri-baseline-only="true"/u);
  assert.match(baseline,/data-workflow-action="issue-client-iri-report"/u);
  assert.match(baseline,/data-workflow-action="issue-coach-iri-report"/u);
  assert.match(baseline,/data-workflow-action="generate-client-iri-report"/u);
  assert.match(baseline,/informes de evolución requieren verificar primero el historial/u);
  assert.doesNotMatch(baseline,/m26-report-editor|report-approval|save-report-draft|approve-report/u);
  assert.doesNotMatch(baseline,/Longitudinal secret|private-training-report|Sin informes de evolución preparados|5 informes/u);
  const full=renderReportsRoute(view);
  assert.match(full,/m26-report-editor/u,'Approved report tools remain after verification');
  assert.match(full,/Longitudinal secret/u,'Verified history remains available');
});

test('U80 initial IRI issuance fails closed on unconfirmed core data',()=>{
  const html=renderReportsRoute({
    kind:'informes',role:'coach',serviceKind:'training',canManage:true,
    latestIri:{id:'unconfirmed'},iriDiagnosis:{confirmed:false,assessmentId:'unconfirmed'},
    reports:[],initialIriOnly:true,
  });
  assert.match(html,/Diagnóstico IRI pendiente de confirmar/u);
  assert.doesNotMatch(html,/data-workflow-action="issue-client-iri-report"/u);
  assert.doesNotMatch(html,/m26-report-editor/u);
});
