import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCommandBus,createMemoryKeyValueStore,createKeyValueOperationRepository} from '../src/m26/index.js';
import {mutationFeedback,publicationActionKey} from '../src/m26/workflows/mutation-feedback.js';
import {createSessionDraft,addCatalogExercise,acceptSessionPreview,validateSessionDraft,buildPublishSessionCommand} from '../src/m26/workflows/session-builder.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {validateReportDraft} from '../src/m26/workflows/report-workflow.js';
import {dispatchSessionAction} from '../src/m26/workflows/session-controller.js';

const command={
 type:'EJECUCION_GUARDAR_PROGRESO',
 entityType:'session_execution',entityId:'execution-m39',clientId:'client-m39',
 baseRevision:0,payload:{progressSnapshot:{id:'execution-m39'}},
};

test('M39 a confirmed remote ACK survives a failed UI rehydrate',async()=>{
  const repository=createKeyValueOperationRepository({storage:createMemoryKeyValueStore(),ownerId:'coach-m39'});
  let executed=0;
  const bus=createCommandBus({
    repository,getToken:async()=> 'token',
    transport:{preflight:async()=>({}),execute:async()=>{
      executed+=1;return {kind:'ack',remoteRevision:1};
    }},
    rehydrate:async()=>{throw Error('FETCH_REMOTE_TIMEOUT');},
  });
  const result=await bus.execute({...command,operationId:'op-m39-success'});
  assert.equal(result.ok,true);
  assert.equal(result.kind,'ack');
  assert.equal(result.refreshOk,false);
  assert.equal(result.refreshPending,true);
  assert.equal(executed,1);
  assert.deepEqual(await repository.list(),[],'ack must not be reinserted as pending after UI refresh failure');
  const feedback=mutationFeedback(result,{success:'Sesión publicada.'});
  assert.equal(feedback.confirmed,true);
  assert.equal(feedback.retryMutation,false);
  assert.match(feedback.message,/servidor confirmó/);
});

test('M39 a real rejection remains a rejection and preserves diagnostics',async()=>{
  const repository=createKeyValueOperationRepository({storage:createMemoryKeyValueStore(),ownerId:'coach-m39'});
  const bus=createCommandBus({
    repository,getToken:async()=> 'token',
    transport:{preflight:async()=>({}),execute:async()=>({kind:'rejected',reason:'ENTITY_NOT_FOUND'})},
  });
  const result=await bus.execute({...command,operationId:'op-m39-reject'});
  assert.equal(result.ok,false);
  assert.equal(result.kind,'rejected');
  assert.equal(mutationFeedback(result).confirmed,false);
  assert.match(mutationFeedback(result).message,/servidor no encontró/);
  assert.equal((await repository.list())[0].status,'rejected');
});

test('M39 distinguishes missing preview, stale revision, authorization and network',()=>{
  const cases=[
    [{ok:false,response:{reason:'PREVIEW_NOT_CONFIRMED'}},/revisión previa/],
    [{ok:false,response:{reason:'REVISION_MISMATCH'}},/cambió en otro dispositivo/],
    [{ok:false,response:{reason:'FORBIDDEN'}},/permisos/],
    [{ok:false,kind:'pending',response:{reason:'NETWORK_TIMEOUT'}},/respuesta del servidor/],
    [{ok:false,response:{reason:'TRAINING_SERVICE_NOT_ACTIVE'}},/servicio de entrenamiento/],
  ];
  for(const [input,match] of cases){
    const outcome=mutationFeedback(input);
    assert.equal(outcome.confirmed,false);
    assert.equal(outcome.retryMutation,false);
    assert.match(outcome.message,match);
    if(/NETWORK|TIMEOUT/.test(String(input.response?.reason)))assert.doesNotMatch(outcome.message,/campos obligatorios/);
  }
});

test('M39 one semantic publication key serializes multiple publish buttons for the same record',()=>{
  const first=publicationActionKey({action:'manage-publication',entity:'session',entityId:'s-1',clientId:'c-1'});
  assert.equal(first,publicationActionKey({action:'manage-publication',entity:'session',entityId:'s-1',clientId:'c-1'}));
  assert.notEqual(first,publicationActionKey({action:'manage-publication',entity:'report',entityId:'s-1',clientId:'c-1'}));
  assert.notEqual(first,publicationActionKey({action:'manage-publication',entity:'session',entityId:'s-2',clientId:'c-1'}));
  assert.ok(publicationActionKey({action:'approve-report',entityId:'r-1',clientId:'c-1'}));
  assert.equal(publicationActionKey({action:'save-iri-draft',clientId:'c-1'}),null,'local save is not a remote mutation');
});

test('M39 a partial session can be saved without preview or required publish fields',()=>{
  const draft=createSessionDraft({clientId:'c-1'});
  assert.equal(draft.blocks.length,0);
  const saved=dispatchSessionAction({action:'save-draft',draft});
  assert.equal(saved.kind,'draft');
  assert.equal(saved.value,draft);
  assert.equal(draft.previewAccepted,false);
  assert.throws(()=>dispatchSessionAction({action:'publish',draft,catalog:{has:()=>false},online:true}),/M26_SESSION_DRAFT_INVALID/);
});

test('M39 form routes surface precise validation and keep partial IRI draft saves working',()=>{
 const source=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
 assert.ok(source.includes("addEventListener('invalid',onInvalid,true)"));
 assert.ok(source.includes("removeEventListener('invalid',onInvalid,true)"));
 assert.ok(source.includes("button.getAttribute('data-workflow-action')!=='save-iri-draft'"));
 assert.ok(source.includes("if(key&&inFlightMutations.has(key))return"));
 assert.ok(source.includes("inFlightMutations.delete(key)"));
 assert.ok(source.includes('mutationFeedback(result'));
 assert.ok(source.includes("El servidor confirmó el ciclo. La vista todavía no refleja"));
 assert.ok(source.includes("El servidor confirmó la cita, pero la Agenda aún no refleja"));
});


test('M39 valid short clinical prose is not mislabeled as a missing report field',()=>{
  const input={clientId:'c-1',assessmentId:'iri-1',title:'Evolución',periodStart:'2026-09-01',
    periodEnd:'2026-10-13',summary:'Avanza.',conclusions:'Mejora.',recommendations:'Progresar.',reviewAccepted:true};
  assert.deepEqual(validateReportDraft(input),{ok:true,errors:[]});
  assert.equal(validateReportDraft({...input,summary:'   '}).errors.includes('summary'),true);
  assert.equal(validateReportDraft({...input,periodEnd:'2026-08-01'}).errors.includes('chronology'),true);
  assert.equal(validateReportDraft({...input,reviewAccepted:false}).errors.includes('reviewAccepted'),true);
});

test('M39 timed plank validates by a recorded duration, not fictitious repetition counts',()=>{
  const catalog=createExerciseCatalog([{id:'IBF-PLANK-TIMED',name_es:'Plancha frontal',pattern:'core',measurement_profile:'isometric'}]);
  const draft=createSessionDraft({clientId:'c-1'});
  addCatalogExercise(draft,'IBF-PLANK-TIMED',catalog);
  draft.blocks[0].reps='';
  draft.blocks[0].plannedDurationMinutes='1';
  assert.deepEqual(validateSessionDraft(draft,catalog),{ok:true,errors:[]});
  acceptSessionPreview(draft,catalog);
  assert.equal(buildPublishSessionCommand(draft,catalog,0).type,'SESION_PUBLICAR');
  draft.blocks[0].plannedDurationMinutes='';
  assert.equal(validateSessionDraft(draft,catalog).errors.some(x=>x.startsWith('prescription:')),true);
});

test('M39 reports editor supports incomplete drafts without browser constraints',()=>{
  const route=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const start=route.indexOf('data-workflow-form="report-approval"');
  const end=route.indexOf("`:`<section class=\"m26-notice is-warning",start);
  assert.ok(start>=0,'reports editor not found');
  const editor=route.slice(start,end>start?end:start+3300);
  assert.ok(editor.includes('data-workflow-action="save-report-draft"'));
  assert.ok(editor.includes('name="entityId"'));
  assert.ok(editor.includes('name="assessmentId"'));
  for(const field of ['summary','conclusions','recommendations']){
    assert.ok(editor.includes(`<textarea name="${field}" maxlength="2500" required>`));
    assert.ok(!editor.includes(`<textarea name="${field}" minlength="20"`));
  }
  assert.ok(editor.includes('type="button" data-workflow-action="save-report-draft"'));
  assert.ok(editor.includes('data-workflow-action="approve-report"'));
});

test('M39 report drafts are client-and-assessment scoped and saved without approval validation',()=>{
 const workflow=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
 for(const literal of [
   "function reportDraftScope(assessmentId)",
   "'report-approval:'+String(assessmentId||'').trim()",
   "async function saveReportDraft(form,{silent=false}={})",
   "reportFormClientIds.get(form)!==clientId",
   "draftRepository.save(clientId,reportDraftScope(assessmentId),payload)",
   "async function initializeReportForm(form)",
   "editedReportForms.has(form)",
   "String(saved.value.assessmentId||'')!==assessmentId",
   "function queueReportSave(form)",
   "queueReportSave(reportForm)",
   "saveReportDraft(form,{silent:true})",
   "saveReportDraft(reportForm,{silent:true})",
   "draftRepository?.remove?.(clientId,reportDraftScope(raw.assessmentId))",
   "reportDraftChain=write.catch(()=>{})",
 ])assert.ok(workflow.includes(literal),literal);
 const start=workflow.indexOf('async function saveReportDraft(');
 const finish=workflow.indexOf('function queueReportSave(',start);
 const save=workflow.slice(start,finish);
 assert.ok(!save.includes('ensureValidForm('));
 assert.ok(!save.includes('validateReportDraft('));
});

test('M39 planning offers a partial draft action without requiring validation',()=>{
 const route=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
 const start=route.indexOf('data-workflow-form="planning"');
 assert.ok(start>=0);
 const planning=route.slice(start,start+2800);
 assert.ok(planning.includes('type="button" data-workflow-action="save-plan-draft"'));
 assert.ok(planning.includes('data-workflow-action="validate-plan"'));
 const source=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
 const save=source.slice(source.indexOf('async function savePlanDraft('),source.indexOf('function queuePlanSave('));
 assert.ok(save.includes("draftRepository.save(clientId,'planning-cycle',draft)"));
 assert.ok(save.includes("planFormClientIds.get(form)!==clientId"));
 assert.ok(!save.includes('ensureValidForm('),'partial save must accept unfinished fields');
 assert.ok(!save.includes('validateCycleDraft('));
 assert.ok(source.includes('async function initializePlanForm(form)'));
 assert.ok(source.includes('editedPlanForms.has(form)'));
 assert.ok(source.includes('void initializePlanForm(planForm)'));
 assert.ok(source.includes("else if(action==='save-plan-draft')await savePlanDraft("));
 assert.ok(source.includes('await planDraftChain;'),'validation waits for previous local writes');
 assert.ok(source.includes('await reportDraftChain;'),'report approval waits for previous local writes');
 assert.ok(source.includes('planSaveTimer=setTimeout('));
});
