import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  M26_COMMAND_REGISTRY,M26_COMMAND_TYPES,validateCommandCatalog,validateCommandAgainstRegistry,
  createCommand,buildIriCommand,buildIriReportCommand,buildCycleCommand,buildPlanCommand,
  buildAppointmentCommand,buildPublishPlanCommand,createSessionDraft,addCatalogExercise,
  addTrainingGroup,closeTrainingGroup,buildPublishSessionCommand,createExecution,
  startExecution,recordSet,advanceExecution,finishExecution,buildExecutionCommand,
  buildStartExecutionCommand,buildProgressExecutionCommand,dispatchSessionAction,
  auditInteractiveMarkup,renderSessionBuilder,renderGuidedExecution
} from '../src/m26/index.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';

const records=JSON.parse(fs.readFileSync(new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url)));
const catalog=createExerciseCatalog(records);
const iri={id:'11111111-1111-4111-8111-111111111111',clientId:'c1',assessmentDate:'2026-07-19',stepFinalHr:150,stepOneMinuteHr:112,strengthPatterns:{squat:{value:10,baremo:'medio'}},bodyComposition:{weightKg:70},sexForNorms:'female',ageYears:30};

function session(){const d=createSessionDraft({clientId:'c1'});addCatalogExercise(d,catalog.list()[0].id,catalog,{sets:1,reps:'10'});d.previewAccepted=true;return d;}

test('catálogo canónico contiene exactamente 44 comandos únicos',()=>{
  assert.equal(M26_COMMAND_REGISTRY.length,44);
  assert.equal(new Set(M26_COMMAND_TYPES).size,44);
  assert.equal(validateCommandCatalog(M26_COMMAND_REGISTRY).ok,true);
});

test('contrato bloquea entidad, motivo y vista previa incorrectos',()=>{
  assert.deepEqual(validateCommandAgainstRegistry({type:'CITA_CANCELAR',entityType:'appointment',reason:''},'coach').errors,['REASON_REQUIRED']);
  assert.deepEqual(validateCommandAgainstRegistry({type:'PLAN_PUBLICAR',entityType:'planning',previewAccepted:false},'coach').errors,['PREVIEW_REQUIRED']);
  assert.deepEqual(validateCommandAgainstRegistry({type:'IRI_APROBAR',entityType:'report'},'coach').errors,['ENTITY_TYPE_MISMATCH']);
});

test('Command Bus rechaza comandos inventados antes de transportar',()=>{
  assert.throws(()=>createCommand({type:'IRI_GUARDAR',entityType:'iri',entityId:'e',clientId:'c',payload:{}}),/COMMAND_CONTRACT_INVALID/);
});

test('IRI exige una entidad remota existente antes de completar',()=>{const withoutId={...iri};delete withoutId.id;assert.throws(()=>buildIriCommand(withoutId),/REMOTE_ENTITY_REQUIRED/);});

test('workflows usan nombres, entidades y payloads reales del backend',()=>{
  const i=buildIriCommand(iri);assert.equal(i.type,'IRI_COMPLETAR');assert.ok(i.payload.patch);
  const r=buildIriReportCommand({clientId:'c1',assessmentId:iri.id,reportId:'r1'});assert.equal(r.type,'INFORME_PUBLICAR');assert.ok(r.payload.patch);
  const c=buildCycleCommand({clientId:'c1',name:'Ciclo',startDate:'2026-07-20',endDate:'2026-08-20',goal:'fuerza'});assert.equal(c.type,'PLAN_VALIDAR');assert.ok(c.payload.draft);
  const p=buildPlanCommand({clientId:'c1',cycleId:'cy1',sessions:[{id:'s1'}]});assert.equal(p.entityType,'planning');assert.ok(p.payload.draft);
  const a=buildAppointmentCommand({clientId:'c1',startAt:'2026-07-20T10:00:00Z',endAt:'2026-07-20T11:00:00Z',modality:'presencial',location:'Las Condes'});assert.ok(a.payload.appointment);
});

test('publicaciones exigen preview y tienen entidad canónica',()=>{
  const p=buildPublishPlanCommand({clientId:'c1',planId:'p1',previewAccepted:true});assert.equal(p.entityType,'planning');assert.equal(p.previewAccepted,true);
  const s=session();const c=buildPublishSessionCommand(s,catalog);assert.equal(c.entityType,'session');assert.equal(c.previewAccepted,true);
});

test('inicio remoto de sesión exige cita confirmada como contexto',()=>{
  const s=session();const x=createExecution({session:s,clientId:'c1'});const c=buildStartExecutionCommand(x,{appointmentId:'a1',sessionRevision:3});
  assert.equal(c.type,'SESION_INICIAR');assert.equal(c.entityType,'session');assert.equal(c.payload.executionId,x.id);assert.equal(c.payload.appointmentId,'a1');
});

test('progreso usa progressSnapshot y finalización usa EJECUCION_COMPLETAR',()=>{
  const s=session();const x=createExecution({session:s,clientId:'c1'});startExecution(x);recordSet(x,s,{reps:10,rpe:7});
  const progress=buildProgressExecutionCommand(x);assert.ok(progress.payload.progressSnapshot);advanceExecution(x);finishExecution(x,{sessionRpe:7,comment:'Bien'});
  assert.equal(buildExecutionCommand(x).type,'EJECUCION_COMPLETAR');
});

test('grupos se completan desde catálogo y no quedan decorativos',()=>{
  const d=createSessionDraft({clientId:'c1'});addTrainingGroup(d,'biserie');addCatalogExercise(d,catalog.list()[0].id,catalog);assert.ok(d.activeGroupId);addCatalogExercise(d,catalog.list()[1].id,catalog);assert.equal(d.activeGroupId,undefined);
  addTrainingGroup(d,'circuito');addCatalogExercise(d,catalog.list()[2].id,catalog);closeTrainingGroup(d);assert.equal(d.activeGroupId,undefined);
});

test('dispatcher conecta botones reales y rechaza acciones desconocidas',()=>{
  const d=createSessionDraft({clientId:'c1'});dispatchSessionAction({action:'add-exercise',draft:d,catalog,payload:{exerciseId:catalog.list()[0].id}});assert.equal(d.blocks.length,1);
  assert.throws(()=>dispatchSessionAction({action:'decorative-only',draft:d,catalog}),/ACTION_UNKNOWN/);
});

test('markup interactivo tiene acciones registradas, nombres y sin handlers inline',()=>{
  const d=session();assert.equal(auditInteractiveMarkup(renderSessionBuilder({draft:d,catalog})).ok,true);
  const x=createExecution({session:d,clientId:'c1'});startExecution(x);assert.equal(auditInteractiveMarkup(renderGuidedExecution({execution:x,session:d,catalog})).ok,true);
});

test('PWA no cachea mutaciones ni endpoints de autenticación',()=>{
  const sw=fs.readFileSync(new URL('../public/m26/sw.js',import.meta.url),'utf8');
  assert.match(sw,/request\.method!==\'GET\'/);assert.match(sw,/\/rpc\//);assert.match(sw,/\/auth\/v1\//);assert.match(sw,/SKIP_WAITING/);assert.doesNotMatch(sw,/localStorage/);
  const manifest=JSON.parse(fs.readFileSync(new URL('../public/m26/manifest.webmanifest',import.meta.url)));assert.equal(manifest.display,'standalone');assert.equal(manifest.lang,'es-ES');for(const icon of manifest.icons){const iconPath=new URL(`../public${icon.src}`,import.meta.url);assert.equal(fs.existsSync(iconPath),true,`Falta ${icon.src}`);}
});

test('todos los controles táctiles alcanzan mínimo declarado de 44 px',()=>{
  const css=fs.readFileSync(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8');assert.match(css,/\.m26-shell button\{min-height:44px/);assert.match(css,/min-height:44px/);
});

test('inicio y cierre remoto no cambian estado local antes de ACK',async()=>{
  const s=session();const x=createExecution({session:s,clientId:'c1'});
  const rejected={execute:async()=>({ok:false,kind:'rejected',response:{reason:'CONFIRMED_APPOINTMENT_REQUIRED'}})};
  const startRejected=dispatchSessionAction({action:'start',execution:x,session:s,catalog,commandBus:rejected,appointmentId:'a1'});
  await assert.rejects(startRejected.value,/M26_COMMAND_REJECTED/);assert.equal(x.status,'ready');
  const accepted={execute:async()=>({ok:true,kind:'ack',response:{executionRevision:1,remoteRevision:4}})};
  await dispatchSessionAction({action:'start',execution:x,session:s,catalog,commandBus:accepted,appointmentId:'a1'}).value;
  assert.equal(x.status,'active');assert.equal(x.revision,1);
  recordSet(x,s,{reps:10,rpe:7});advanceExecution(x);assert.equal(x.status,'awaiting_feedback');
  const finishRejected=dispatchSessionAction({action:'finish',execution:x,session:s,catalog,commandBus:rejected,payload:{sessionRpe:7,comment:'Bien'}});
  await assert.rejects(finishRejected.value,/M26_COMMAND_REJECTED/);assert.equal(x.status,'awaiting_feedback');
  await dispatchSessionAction({action:'finish',execution:x,session:s,catalog,commandBus:accepted,payload:{sessionRpe:7,comment:'Bien'}}).value;
  assert.equal(x.status,'completed');assert.equal(x.revision,4);
});

test('pausa, reanudación y cancelación tienen botones y comandos reales',async()=>{
  const s=session();const x=createExecution({session:s,clientId:'c1'});startExecution(x);x.revision=1;
  const accepted={execute:async(command)=>({ok:true,kind:'ack',response:{remoteRevision:command.baseRevision+1}})};
  await dispatchSessionAction({action:'pause',execution:x,session:s,catalog,commandBus:accepted}).value;assert.equal(x.status,'paused');
  assert.equal(auditInteractiveMarkup(renderGuidedExecution({execution:x,session:s,catalog})).ok,true);
  await dispatchSessionAction({action:'resume',execution:x,session:s,catalog,commandBus:accepted}).value;assert.equal(x.status,'active');
  await dispatchSessionAction({action:'cancel',execution:x,session:s,catalog,commandBus:accepted,payload:{reason:'Cambio de agenda'}}).value;assert.equal(x.status,'cancelled');
});
