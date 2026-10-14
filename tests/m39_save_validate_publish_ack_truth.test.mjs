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

test('M39 remote ACK persists a durable tombstone if deletion fails',async()=>{
  const stored=new Map();
  let writes=0,remoteCalls=0;
  const repository={
    put:async(record)=>{writes++;stored.set(record.operationId,structuredClone(record));},
    list:async()=>[...stored.values()],
    remove:async()=>{throw new Error('LOCAL_STORAGE_CLEANUP_FAILURE');},
  };
  const bus=createCommandBus({
    repository,getToken:async()=> 'token',
    transport:{preflight:async()=>({}),execute:async()=>{
      remoteCalls++;return {kind:'ack',remoteRevision:1};
    }},
    rehydrate:async()=>{},
  });
  const result=await bus.execute({...command,operationId:'op-m39-local-cleanup'});
  assert.equal(result.ok,true);
  assert.equal(result.kind,'ack');
  assert.equal(result.localReceiptOk,true,'ACK is durably stored despite failed local delete');
  assert.equal(result.refreshPending,false);
  assert.equal(result.refreshOk,true);
  assert.equal(remoteCalls,1);
  assert.equal(writes,2,'pending write plus ACK tombstone, never a pending retry');
  assert.equal(stored.get('op-m39-local-cleanup').status,'ack');
  assert.equal(stored.get('op-m39-local-cleanup').retryable,false);
  assert.deepEqual(await bus.pending(),[],'confirmed ACK must not appear as a pending mutation');
  const flushed=await bus.flushPending({limit:3});
  assert.equal(flushed.attempted,0,'auto flush must not replay a confirmed mutation');
  assert.equal(flushed.remaining,0);
  await assert.rejects(()=>bus.retry('op-m39-local-cleanup'),/M26_OPERATION_NOT_RETRYABLE/);
  assert.equal(remoteCalls,1);
  const feedback=mutationFeedback(result);
  assert.equal(feedback.confirmed,true);
  assert.equal(feedback.retryMutation,false);
});

test('M39 remote ACK retains a session-local replay fence if deletion AND tombstone writes fail',async()=>{
  const stored=new Map();
  let remoteCalls=0,writes=0;
  const repository={
    put:async(record)=>{
      writes++;
      if(record.status==='ack')throw new Error('LOCAL_STORAGE_WRITE_FAILURE');
      stored.set(record.operationId,structuredClone(record));
    },
    list:async()=>[...stored.values()],
    remove:async()=>{throw new Error('LOCAL_STORAGE_DELETE_FAILURE');},
  };
  const bus=createCommandBus({
    repository,getToken:async()=> 'token',
    transport:{preflight:async()=>({}),execute:async()=>{remoteCalls++;return {kind:'ack',remoteRevision:1};}},
    rehydrate:async()=>{},
  });
  const input={...command,operationId:'op-m39-local-unavailable'};
  const first=await bus.execute(input);
  assert.equal(first.ok,true);
  assert.equal(first.localReceiptOk,false);
  assert.equal(first.refreshPending,true);
  assert.equal(remoteCalls,1);
  assert.equal(writes,2,'ACK fallback may fail, but must never requeue after remote confirmation');
  assert.equal(stored.get(input.operationId).status,'pending','storage corruption stays visible on disk');
  assert.deepEqual(await bus.pending(),[],'live instance treats the known ACK as settled');
  const second=await bus.execute(input);
  assert.equal(second.ok,true);
  assert.equal((await bus.retry(input.operationId)).ok,true);
  assert.equal((await bus.flushPending({limit:3})).attempted,0);
  assert.equal(remoteCalls,1,'neither a click nor retry nor automatic flush resends the ACK');
  assert.equal(mutationFeedback(first).retryMutation,false);
});

test('M39 confirmed plan validation tolerates unavailable local draft cleanup',()=>{
  const source=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  const plan=source.slice(source.indexOf('async function performValidatePlan(){'),source.indexOf('async function createAppointment(){'));
  assert.match(plan,/removeConfirmedPlanningDraft\(draftRepository,clientId,stableId\)/);
  assert.match(plan,/catch\(error\)\{[\s\S]*?localDraftOk=false/);
  assert.match(plan,/const settled=localDraftOk\?result:\{\.\.\.result,refreshPending:true,localDraftOk:false\}/);
  assert.match(plan,/return settled;/);
});

test('M39 complete cycle validation does not falsely fail on browser draft storage errors',()=>{
  const source=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  const plan=source.slice(source.indexOf('async function performValidatePlan(){'),source.indexOf('async function createAppointment(){'));
  assert.match(plan,/restorePlanningDraft\(draftRepository,clientId,visibleId\)/);
  assert.match(plan,/M43_PLAN_LOCAL_DRAFT_LOAD_UNAVAILABLE/);
  assert.match(plan,/try\{await draftRepository\?\.save\?\.\(clientId,scoped,draft\);\}/);
  assert.match(plan,/M26_PLAN_LOCAL_DRAFT_SAVE_UNAVAILABLE/);
  assert.match(plan,/M26_PLAN_DRAFT_CLEANUP_PENDING/);
  assert.match(plan,/commandBus\.execute\(buildCycleCommand\(draft,revision\)\)/);
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

test('M39/M43 report drafts stay client-scoped, preserve incomplete content and use isolated entity IDs',()=>{
 const workflow=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
 for(const literal of [
   "async function saveReportDraft(form,{silent=false}={})",
   "reportFormClientIds.get(form)!==clientId",
   "const scoped=reportDraftScope(stableId)",
   "draftRepository.save(clientId,scoped,payload)",
   "async function initializeReportForm(form)",
   "updateReportDraftChoices(form,{restoreSingle:true})",
   "String(draft?.assessmentId||'')!==String(assessmentId)",
   "function queueReportSave(form)",
   "queueReportSave(reportForm)",
   "saveReportDraft(form,{silent:true})",
   "saveReportDraft(reportForm,{silent:true})",
   "draftRepository?.remove?.(clientId,reportDraftScope(stableId))",
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
 assert.ok(save.includes('planningDraftScope(stableId)'));
 assert.ok(save.includes('draftRepository.save(clientId,scope,draft)'));
 assert.ok(!save.includes("draftRepository.save(clientId,'planning-cycle',draft)"));
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
