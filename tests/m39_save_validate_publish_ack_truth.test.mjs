import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCommandBus,createMemoryKeyValueStore,createKeyValueOperationRepository} from '../src/m26/index.js';
import {mutationFeedback,publicationActionKey} from '../src/m26/workflows/mutation-feedback.js';
import {createSessionDraft} from '../src/m26/workflows/session-builder.js';
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
