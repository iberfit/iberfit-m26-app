import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProductionState,
  metricPresentation,
  stateFromBootstrap,
} from '../src/m26/production-state.js';
import { createM26Transport, resolveM26Runtime } from '../src/m26/supabase-transport.js';
import { createCommandBus, createMemoryOperationRepository } from '../src/m26/command-bus.js';
import { createCanonicalStore } from '../src/m26/canonical-store.js';

const clientId = '57339e70-7a99-48d6-820f-7d4a51f89d9d';
const userId = '61227666-d8b4-4d1e-aa08-2405ad2000db';

function bootstrap() {
  return {
    environment: 'PRODUCTION',
    serverTime: '2026-07-18T20:00:00Z',
    canary: { version: 'M26-GATE15-FREE-RC1', active: true, scope: 'allowlist' },
    user: { id: userId, role: 'client', clientId, name: 'Cliente QA M26' },
    remoteRevisions: { [`client_access:${clientId}`]: 1 },
    data: {
      clients: [{ id: clientId, name: 'Cliente Prueba IBERFIT' }],
      clientProfiles: [], clientAccess: [], iriAssessments: [], reports: [], trainingCycles: [],
      sessions: [], sessionExecutions: [], appointments: [], intelligenceRuns: [],
      domainEvents: [], coachAvailability: [], m26Entities: [],
      metrics: { checkin: null, progress: null, iri: null },
    },
  };
}

test('estado productivo M26 nace vacío y sin fixtures', () => {
  const state = createProductionState();
  assert.equal(state.collections.clients.length, 0);
  assert.equal(state.identity, null);
  assert.equal(state.selectedClientId, null);
});

test('hidratación reemplaza colecciones y selecciona solo cliente visible', () => {
  const next = stateFromBootstrap(bootstrap(), createProductionState({ selectedClientId: '00000000-0000-4000-8000-000000000000' }));
  assert.equal(next.collections.clients.length, 1);
  assert.equal(next.selectedClientId, clientId);
  assert.equal(next.hydration.status, 'ready');
});

test('ausencia de métrica se presenta como Sin registro y cero se conserva', () => {
  assert.equal(metricPresentation(null).label, 'Sin registro');
  assert.equal(metricPresentation(0).value, 0);
});

test('pages.dev no habilita backend real y canario exacto sí', () => {
  const raw = { enabled: true, url: 'https://pjhmrhejsoofmouedavw.supabase.co', publishableKey: 'public' };
  assert.equal(resolveM26Runtime(raw, { hostname: 'random.pages.dev' }).enabled, false);
  const canary = resolveM26Runtime(raw, { hostname: 'm26-canary.iberfit.cl' });
  assert.equal(canary.enabled, true);
  assert.equal(canary.qaOnly, true);
});

test('transporte usa exclusivamente RPC v26 y exige JWT', async () => {
  const calls=[];
  const runtime=resolveM26Runtime({ enabled:true, url:'https://pjhmrhejsoofmouedavw.supabase.co', publishableKey:'public' }, { hostname:'m26-canary.iberfit.cl' });
  const fetchImpl=async (url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify({ environment:'PRODUCTION', canary:{active:true}, user:{id:userId,role:'client'}, data:{} }), {status:200,headers:{'content-type':'application/json'}});
  };
  const transport=createM26Transport(runtime,{fetchImpl});
  await assert.rejects(()=>transport.bootstrap(null),/M26_AUTH_REQUIRED/);
  await transport.bootstrap('jwt');
  assert.match(calls[0].url,/iberfit_bootstrap_v26$/);
});

test('Command Bus no presenta pendiente como confirmado y rehidrata solo después de ACK', async () => {
  const repository=createMemoryOperationRepository();
  let rehydrations=0;
  const transport={
    preflight:async()=>({kind:'ack',remoteRevision:0}),
    execute:async()=>({kind:'ack',remoteRevision:1}),
  };
  const bus=createCommandBus({transport,repository,getToken:async()=> 'jwt',rehydrate:async()=>{rehydrations+=1;}});
  const result=await bus.execute({type:'CITA_CREAR',entityType:'appointment',clientId,entityId:'11111111-1111-4111-8111-111111111111',baseRevision:0,payload:{}});
  assert.equal(result.ok,true);
  assert.equal(rehydrations,1);
  assert.equal((await bus.pending()).length,0);
});

test('conflicto conserva operación sanitizada sin exponer payload', async () => {
  const repository=createMemoryOperationRepository();
  const bus=createCommandBus({
    transport:{preflight:async()=>({}),execute:async()=>({kind:'conflict',reason:'REVISION_CONFLICT'})},
    repository,getToken:async()=> 'jwt',rehydrate:async()=>{},
  });
  const result=await bus.execute({type:'IRI_APROBAR',entityType:'iri',clientId,entityId:'22222222-2222-4222-8222-222222222222',baseRevision:1,payload:{clinical:'sensitive'}});
  assert.equal(result.kind,'conflict');
  assert.equal('payload' in result.command,false);
  assert.equal((await bus.pending())[0].status,'conflict');
});

test('store canónico mantiene operaciones separadas de entidades confirmadas', () => {
  const store=createCanonicalStore();
  store.hydrate(bootstrap());
  store.projectOperations([{operationId:'op',type:'IRI_APROBAR',entityType:'iri',entityId:'e',clientId,baseRevision:0,status:'pending',payload:{secret:true}}]);
  const state=store.getState();
  assert.equal(state.collections.iriAssessments.length,0);
  assert.equal(state.pendingOperations.length,1);
  assert.equal('payload' in state.pendingOperations[0],false);
});
