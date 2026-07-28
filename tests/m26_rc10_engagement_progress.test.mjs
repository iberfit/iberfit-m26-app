import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionState, stateFromBootstrap } from '../src/m26/production-state.js';
import { computeProgressSummary, buildProgressTimeline } from '../src/m26/engagement/progress-engine.js';
import { deriveAdherenceAlerts } from '../src/m26/engagement/adherence-engine.js';
import { engagementCapabilities, M26_ENGAGEMENT_EXTENSION_REGISTRY } from '../src/m26/engagement/activity-capabilities.js';
import { createMemoryEngagementDraftRepository, validateCheckinDraft } from '../src/m26/engagement/activity-drafts.js';
import { buildVerificationCenter, refreshVerificationState } from '../src/m26/engagement/conflict-center.js';
import { createShellViewModel } from '../src/m26/shell/shell-view-model.js';
import { createRouteViewModel } from '../src/m26/modules/route-view-model.js';
import { renderRouteView } from '../src/m26/modules/route-render.js';
import { M26_COMMAND_TYPES } from '../src/m26/command-catalog.js';
import { navigationForRole } from '../src/m26/shell/navigation.js';

const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const now=new Date('2026-07-19T12:00:00Z');
function snapshot(overrides={}){
  return {
    user:{id:'61227666-d8b4-4d1e-aa08-2405ad2000db',role:'client',clientId,name:'Cliente QA'},
    canary:{active:true,version:'rc10'},environment:'qa',serverTime:now.toISOString(),
    data:{
      clients:[{id:clientId,name:'Cliente Prueba IBERFIT',modality:'Híbrido',status:'activo'}],
      appointments:[
        {id:'a1',clientId,startAt:'2026-07-02T10:00:00Z',status:'completado'},
        {id:'a2',clientId,startAt:'2026-07-09T10:00:00Z',status:'confirmado'},
        {id:'a3',clientId,startAt:'2026-07-16T10:00:00Z',status:'confirmado'},
      ],
      sessionExecutions:[{id:'e1',clientId,completedAt:'2026-07-02T11:00:00Z',status:'completed',results:[{reps:10,loadKg:10,rpe:7},{reps:8,loadKg:12,rpe:8}]}],
      iriAssessments:[{id:'i2',clientId,evaluatedAt:'2026-07-18',score:72,status:'completado'},{id:'i1',clientId,evaluatedAt:'2026-06-01',score:67,status:'completado'}],
      checkins:[{id:'c1',clientId,createdAt:'2026-07-18T09:00:00Z',energy:4,sleep:4,stress:8,pain:6}],
      habits:[{id:'h1',clientId,title:'Caminar',status:'activo'}],habitLogs:[],privateNotes:[],
      ...overrides,
    },
  };
}
function hydrated(data=snapshot()){return stateFromBootstrap(data,createProductionState());}

test('progreso calcula adherencia, RPE, volumen e IRI sin convertir ausencias en cero',()=>{
  const summary=computeProgressSummary(hydrated(),clientId,{now,days:28});
  assert.equal(summary.plannedSessions,3);assert.equal(summary.completedSessions,1);assert.equal(summary.adherence,0.333);
  assert.equal(summary.averageRpe,7.5);assert.equal(summary.volume,196);assert.equal(summary.iriDelta,null);assert.equal(summary.iriAssessmentCount,2);
  const empty=computeProgressSummary(hydrated(snapshot({appointments:[],sessionExecutions:[],iriAssessments:[],checkins:[]})),clientId,{now});
  assert.equal(empty.adherence,null);assert.equal(empty.averageRpe,null);assert.equal(empty.iriCurrent,null);
});

test('alertas son explicables y priorizan dolor, recuperación y adherencia',()=>{
  const alerts=deriveAdherenceAlerts(hydrated(),clientId,{now});
  assert.equal(alerts[0].id,'pain-high');
  assert.ok(alerts.some((item)=>item.id==='recovery-context'));
  assert.ok(alerts.some((item)=>item.id==='adherence-low'));
  assert.ok(alerts.every((item)=>item.detail&&item.action&&item.source));
});

test('cronología mezcla IRI, ejecuciones y check-ins confirmados',()=>{
  const rows=buildProgressTimeline(hydrated(),clientId,{now,days:90});
  assert.ok(rows.some((item)=>item.kind==='iri'));
  assert.ok(rows.some((item)=>item.kind==='execution'));
  assert.ok(rows.some((item)=>item.kind==='checkin'));
});

test('rutas progreso y actividad renderizan datos reales y bloquean falsa confirmación',()=>{
  const state=hydrated();state.activeArea='progreso';
  let shell=createShellViewModel(state);let vm=createRouteViewModel(shell,state,now);let html=renderRouteView(vm);
  assert.equal(vm.kind,'progreso');assert.match(html,/Progreso y adherencia/);assert.match(html,/33%/);assert.doesNotMatch(html,/onclick=/i);
  state.activeArea='actividad';shell=createShellViewModel(state);vm=createRouteViewModel(shell,state,now);html=renderRouteView(vm);
  assert.equal(vm.kind,'actividad');assert.equal(vm.capabilities.checkins.ready,false);assert.match(html,/Guardar borrador/);assert.match(html,/data-engagement-action="submit-checkin" disabled aria-disabled="true">Enviar registro de bienestar/);
});

test('extensiones no contaminan el contrato canónico de 44 comandos',()=>{
  assert.equal(M26_COMMAND_TYPES.length,44);assert.equal(M26_ENGAGEMENT_EXTENSION_REGISTRY.length,8);
  const canonical=new Set(M26_COMMAND_TYPES);assert.ok(M26_ENGAGEMENT_EXTENSION_REGISTRY.every((item)=>!canonical.has(item.type)));
  const caps=engagementCapabilities(M26_COMMAND_TYPES);assert.equal(caps.checkins.ready,false);assert.deepEqual(caps.checkins.missing,['CHECKIN_REGISTRAR']);
  const future=engagementCapabilities([...M26_COMMAND_TYPES,...M26_ENGAGEMENT_EXTENSION_REGISTRY.map((x)=>x.type)]);assert.equal(future.checkins.ready,true);assert.equal(future.habits.ready,true);assert.equal(future.privateNotes.ready,true);
});

test('borradores de check-in se validan y aíslan por propietario',async()=>{
  const valid=validateCheckinDraft({energy:6,sleep:7,stress:4,pain:1,notes:'Bien'});assert.equal(valid.ok,true);
  assert.equal(validateCheckinDraft({energy:6}).ok,false);
  const a=createMemoryEngagementDraftRepository({ownerId:'user-a'});const b=createMemoryEngagementDraftRepository({ownerId:'user-b'});
  await a.save(clientId,'checkin',valid.value);assert.ok(await a.load(clientId,'checkin'));assert.equal(await b.load(clientId,'checkin'),undefined);
});

test('centro de verificación separa pendientes, conflictos y rechazadas',async()=>{
  const state=hydrated();state.pendingOperations=[{operationId:'p',type:'EJECUCION_GUARDAR_PROGRESO',entityType:'session_execution',entityId:'e',clientId,status:'pending',retryable:true}];state.conflicts=[{operationId:'c',type:'PLAN_PUBLICAR',entityType:'planning',entityId:'pl',clientId,status:'conflict',retryable:false}];state.rejectedOperations=[{operationId:'r',type:'CITA_CANCELAR',entityType:'appointment',entityId:'a',clientId,status:'rejected',retryable:false}];
  const center=buildVerificationCenter(state);assert.deepEqual(center.summary,{pending:1,conflicts:1,rejected:1,total:3});assert.equal(center.deploymentBlocked,true);assert.deepEqual(center.pending[0].actions,['retry','inspect']);
  let projected=null;const repository={async list(){return [{operationId:'x',type:'T',entityType:'session',entityId:'s',clientId,status:'pending'}];}};const store={projectOperations(records){projected=records;},getState(){return {...state,pendingOperations:projected,conflicts:[],rejectedOperations:[]};}};
  const refreshed=await refreshVerificationState({repository,store});assert.equal(refreshed.summary.pending,1);
});

test('Coach recibe progreso, actividad y notas; Cliente nunca recibe notas privadas',()=>{
  const coach=navigationForRole('coach');assert.ok(coach.context.some((item)=>item.key==='progreso'));assert.ok(coach.context.some((item)=>item.key==='actividad'));assert.ok(coach.context.some((item)=>item.key==='notas'));
  const client=navigationForRole('client');assert.ok(client.primary.some((item)=>item.key==='progreso'));assert.ok(client.context.some((item)=>item.key==='actividad'));assert.ok(!client.context.some((item)=>item.key==='notas'));
});
