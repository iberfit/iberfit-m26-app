import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sessionCommandFailureOutcome} from '../src/m26/workflows/session-sync-recovery-ui.js';

const draft={clientId:'client-m40',title:'SESIÓN Carrera',durationMinutes:45,blocks:[{id:'block-running-1',type:'exercise',exerciseId:'RUN-1'}]};
const catalog={get:(id)=>id==='RUN-1'?{name_es:'Carrera continua'}:null};

test('M40 running exercise missing a goal has an actionable error and input focus',()=>{
  const result=sessionCommandFailureOutcome(new Error('M26_SESSION_DRAFT_INVALID:metrics:RUN-1'),{action:'preview',role:'coach',draft,catalog});
  assert.equal(result.status,'retry');
  assert.equal(result.code,'M26_SESSION_DRAFT_INVALID');
  assert.match(result.message,/tiempo o distancia/);
  assert.match(result.message,/Carrera continua/);
  assert.doesNotMatch(result.message,/repeticiones obligatorias/);
  assert.equal(result.focusSelector,'[data-block-id="block-running-1"][data-session-block-field="plannedDurationMinutes"]');
});

test('M40 bad session metadata identifies the exact field, not an opaque failure',()=>{
  const samples=[
    ['title',/título/,'[data-session-draft-field="title"]'],
    ['durationMinutes',/10 y 240/,'[data-session-draft-field="durationMinutes"]'],
    ['deliveryModality',/realizará/,'[data-session-draft-field="deliveryModality"]'],
    ['blocks',/ejercicio/,'[data-session-search]']
  ];
  for(const [code,expected,selector] of samples){
    const result=sessionCommandFailureOutcome(new Error('M26_SESSION_DRAFT_INVALID:'+code),{action:'preview',draft,catalog});
    assert.match(result.message,expected);
    assert.equal(result.focusSelector,selector);
  }
});

test('M40 distinguishes invalid prescription, storage failure, server rejection and missing preview',()=>{
  const prescription=sessionCommandFailureOutcome(new Error('M26_SESSION_DRAFT_INVALID:prescription:RUN-1'),{action:'preview',draft,catalog});
  assert.match(prescription.message,/series.*descansos/);
  const storage=sessionCommandFailureOutcome(new Error('M26_SESSION_DRAFT_SAVE_FAILED'),{action:'save-draft',draft,catalog});
  assert.equal(storage.status,'retry');
  assert.match(storage.message,/almacenamiento/);
  assert.doesNotMatch(storage.message,/campos obligatorios/);
  const rejected=sessionCommandFailureOutcome({result:{response:{reason:'ENTITY_NOT_FOUND'}}},{action:'publish',draft,catalog});
  assert.match(rejected.message,/servidor/);
  const preview=sessionCommandFailureOutcome(new Error('M26_SESSION_PREVIEW_REQUIRED'),{action:'publish',draft,catalog});
  assert.match(preview.message,/Revisa primero/);
});

test('M40 review is a local validation action, not a forced remote/local-storage gate',()=>{
  const controller=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  assert.ok(controller.includes("if(!['preview','edit-preview','publish'].includes(action))await flushAutosave(context)"));
  assert.ok(controller.includes("else if(outcome.ok&&['preview','edit-preview'].includes(action))"));
  assert.ok(controller.includes("Revisión disponible, pero el borrador aún no se pudo guardar."));
  assert.ok(controller.includes("draft:context?.draft,catalog:context?.catalog"));
  assert.ok(app.includes("sessionCommandFailureOutcome(error,{role:store.getState().identity?.role,draft:sessionUi.draft,catalog})"));
});

test('M40 publish action still enforces the review and domain validation',()=>{
  const builder=readFileSync(new URL('../src/m26/workflows/session-builder.js',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.ok(builder.includes("if(draft.previewAccepted!==true)throw new Error('M26_SESSION_PREVIEW_REQUIRED')"));
  assert.ok(builder.includes('const check=validateSessionDraft(draft,catalog);'));
  assert.ok(controller.includes("case 'preview': acceptSessionPreview(draft,catalog)"));
  assert.ok(controller.includes("case 'publish': {"));
});
