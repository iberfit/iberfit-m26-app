import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicationAckRefreshOutcome} from '../src/m26/workflows/session-controller.js';
import {createCommandBus} from '../src/m26/command-bus.js';
import {createMemoryPersistentOperationRepository} from '../src/m26/platform/offline-command-repository.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise,acceptSessionPreview,buildPublishSessionCommand} from '../src/m26/workflows/session-builder.js';

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
