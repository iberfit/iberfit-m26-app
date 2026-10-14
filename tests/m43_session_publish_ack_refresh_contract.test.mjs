import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicationAckRefreshOutcome,dispatchSessionAction} from '../src/m26/workflows/session-controller.js';
import {createCommandBus} from '../src/m26/command-bus.js';
import {createMemoryPersistentOperationRepository} from '../src/m26/platform/offline-command-repository.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise,acceptSessionPreview,buildPublishSessionCommand,updateSessionDraft} from '../src/m26/workflows/session-builder.js';

test('M43: successful server ACK remains successful when the onPublished UI refresh rejects',async()=>{
  const remoteAck={ok:true,kind:'ack',response:{kind:'ack',remoteRevision:1}};
  let calls=0;
  const state=await publicationAckRefreshOutcome(remoteAck,async()=>{
    calls++;
    throw new Error('M43_SHELL_REFRESH_TIMEOUT');
  });
  assert.equal(state.ackConfirmed,true);
  assert.equal(state.refreshOk,false);
  assert.match(state.error.message,/SHELL_REFRESH_TIMEOUT/);
  assert.equal(calls,1);
  assert.equal(remoteAck.ok,true);
});

test('M43: rejected / unacknowledged result must not be converted into a successful publication',async()=>{
  const missing={kind:'command',type:'SESION_PUBLICAR'};
  await assert.rejects(
    ()=>publicationAckRefreshOutcome(missing,async()=>{throw new Error('RENDER_FAILURE');}),
    /RENDER_FAILURE/
  );
  const result=await publicationAckRefreshOutcome(missing,async()=>{});
  assert.equal(result.ackConfirmed,false);
  assert.equal(result.refreshOk,true);
});

test('M43: remote publication receipt survives both hydration and UI callback errors without replay',async()=>{
  const clientId='m43-ack-client';
  const catalog=createExerciseCatalog([{id:'m43-run',name_es:'Carrera continua',measurement_profile:'endurance'}]);
  const draft=createSessionDraft({clientId,title:'Carrera del bloque',durationMinutes:45});
  addCatalogExercise(draft,'m43-run',catalog,{plannedDistanceKm:'5',plannedDurationMinutes:'30'});
  acceptSessionPreview(draft,catalog);
  const repository=createMemoryPersistentOperationRepository({ownerId:'m43-refresh-persist'});
  let remoteWrites=0;
  const bus=createCommandBus({repository,getRole:()=> 'coach',getToken:async()=> 'synthetic',
    transport:{preflight:async()=>({}),execute:async()=>{
      remoteWrites++;
      return {kind:'ack',remoteRevision:1};
    }},
    rehydrate:async()=>{throw new Error('CANONICAL_REFRESH_UNAVAILABLE');},
  });
  const ack=await bus.execute(buildPublishSessionCommand(draft,catalog));
  assert.equal(ack.ok,true);
  assert.equal(ack.refreshPending,true);
  const local=await publicationAckRefreshOutcome(ack,async()=>{throw new Error('M43_ON_PUBLISHED_FAILED');});
  assert.equal(local.ackConfirmed,true);
  assert.equal(local.refreshOk,false);
  assert.equal((await bus.flushPending({limit:5})).attempted,0);
  assert.equal(remoteWrites,1);
  assert.equal((await repository.list()).filter(x=>x.status==='pending').length,0);
});

test('M43 controller makes the server ACK and UI callback two independent phases',()=>{
  const source=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.match(source,/if\(outcome\.ok&&action==='publish'\)\{\s*const publication=await publicationAckRefreshOutcome\(outcome\.value,context\.onPublished\)/);
  assert.match(source,/if\(!publication\.refreshOk\)\{/);
  assert.match(source,/actionState\.status='pending'/);
  assert.match(source,/El servidor confirmó la publicación, pero la vista todavía no se pudo actualizar/);
  assert.doesNotMatch(source,/if\(outcome\.ok&&action==='publish'\)await context\.onPublished/);
});

test('M43 same published draft reuses receipt without issuing another server publication',async()=>{
  const clientId='m43-double-publish-client';
  const catalog=createExerciseCatalog([{id:'m43-run-ack',name_es:'Carrera continua',measurement_profile:'endurance'}]);
  const draft=createSessionDraft({clientId,title:'Carrera controlada',durationMinutes:45});
  addCatalogExercise(draft,'m43-run-ack',catalog,{plannedDistanceKm:'5',plannedDurationMinutes:'30'});
  acceptSessionPreview(draft,catalog);
  let sent=0;
  const bus=createCommandBus({
    repository:createMemoryPersistentOperationRepository({ownerId:'m43-publication-receipt'}),
    getRole:()=> 'coach',getToken:async()=> 'synthetic',
    transport:{preflight:async()=>({}),execute:async()=>({kind:'ack',remoteRevision:++sent})},
    rehydrate:async()=>{throw new Error('M43_SCREEN_REFRESH_FAILED');},
  });
  const publish=()=>dispatchSessionAction({action:'publish',draft,catalog,commandBus:bus,online:true,
    actor:{id:'m43-coach',role:'coach',clientId}});
  const first=await publish().value;
  assert.equal(first.ok,true);
  assert.equal(first.refreshPending,true);
  assert.equal(sent,1);
  const repeated=await publish().value;
  assert.equal(repeated.ok,true);
  assert.equal(repeated.alreadyConfirmed,true);
  assert.equal(sent,1,'repeated click after ACK must not make a second server command');
  updateSessionDraft(draft,'title','Carrera revisada');
  assert.equal(draft.previewAccepted,false);
  acceptSessionPreview(draft,catalog);
  const revised=await publish().value;
  assert.equal(revised.ok,true);
  assert.equal(revised.alreadyConfirmed,undefined);
  assert.equal(sent,2,'a genuinely new reviewed revision may make a new command');
});

test('M43 simultaneous publish taps share one in-flight remote publication command',async()=>{
  const clientId='m43-publish-concurrent';
  const catalog=createExerciseCatalog([{id:'m43-run-pending',name_es:'Carrera continua',measurement_profile:'endurance'}]);
  const draft=createSessionDraft({clientId,title:'Carrera integrada',durationMinutes:45});
  addCatalogExercise(draft,'m43-run-pending',catalog,{plannedDistanceKm:'5',plannedDurationMinutes:'30'});
  acceptSessionPreview(draft,catalog);
  let calls=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const bus={execute:async()=>{calls++;await gate;return {ok:true,kind:'ack',response:{remoteRevision:1}};}};
  const send=()=>dispatchSessionAction({action:'publish',draft,catalog,commandBus:bus,online:true}).value;
  const first=send(),second=send();
  assert.equal(first,second);
  release();
  assert.equal((await first).ok,true);
  assert.equal(calls,1);
  assert.equal((await send()).alreadyConfirmed,true);
  assert.equal(calls,1);
});

test('M43 failed in-flight publish is retryable and never recorded as confirmed',async()=>{
  const clientId='m43-publish-retry';
  const catalog=createExerciseCatalog([{id:'m43-run-retry',name_es:'Carrera continua',measurement_profile:'endurance'}]);
  const draft=createSessionDraft({clientId,title:'Carrera de recuperación',durationMinutes:45});
  addCatalogExercise(draft,'m43-run-retry',catalog,{plannedDistanceKm:'5',plannedDurationMinutes:'30'});
  acceptSessionPreview(draft,catalog);
  let calls=0;
  const bus={execute:async()=>{calls++;if(calls===1)throw new Error('M43_RETRYABLE_NETWORK');return {ok:true,kind:'ack',response:{remoteRevision:1}};}};
  const send=()=>dispatchSessionAction({action:'publish',draft,catalog,commandBus:bus,online:true}).value;
  await assert.rejects(send(),/M43_RETRYABLE_NETWORK/);
  assert.equal((await send()).ok,true);
  assert.equal(calls,2);
});
