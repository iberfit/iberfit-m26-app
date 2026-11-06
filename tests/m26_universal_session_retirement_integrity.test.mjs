import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  publicationActionsFor,assertPublicationTransition,buildPublicationCommand,sessionWithdrawalDependencies,
} from '../src/m26/workflows/publication-workflow.js';

const source={id:'session-universal-1',clientId:'client-universal-1',
  status:'publicado',revision:4,visibleToClient:true};
const now=()=>new Date('2026-11-06T04:00:00Z');

test('UNIVERSAL retirada de sesiones es solo Coach y exige motivo; Admin no recibe accion invalida',()=>{
  assert.deepEqual(publicationActionsFor({entity:'session',record:source,role:'coach'}).map(x=>x.action),['withdraw']);
  assert.deepEqual(publicationActionsFor({entity:'session',record:source,role:'admin'}).map(x=>x.action),[]);
  assert.deepEqual(publicationActionsFor({entity:'session',record:source,role:'client'}).map(x=>x.action),[]);
  assert.throws(()=>buildPublicationCommand({entity:'session',action:'withdraw',record:source,role:'admin',
    reason:'Replanificacion',now}),/M26_PUBLICATION_ROLE_FORBIDDEN/u);
  assert.throws(()=>buildPublicationCommand({entity:'session',action:'withdraw',record:source,role:'coach',
    now}),/M26_PUBLICATION_REASON_REQUIRED/u);
});

test('UNIVERSAL evita retirar prescripciones en curso aunque el wrapper indique publicada',()=>{
  for(const record of [
    {...source,status:'en_curso'},
    {...source,status:'active'},
    {...source,body:{status:'en_curso'}},
  ]){
    assert.deepEqual(publicationActionsFor({entity:'session',record,role:'coach'}),[]);
    assert.throws(()=>assertPublicationTransition({entity:'session',action:'withdraw',record,
      role:'coach',reason:'Finalizar'}),/M26_SESSION_ACTIVE_WITHDRAW_FORBIDDEN/u);
  }
});

test('UNIVERSAL la retirada es reversible editorialmente, nunca DELETE CASCADE ni perdida de ejecuciones',()=>{
  const command=buildPublicationCommand({entity:'session',action:'withdraw',record:source,role:'coach',
    reason:'Se sustituye el programa',now});
  assert.equal(command.type,'SESION_CANCELAR');
  assert.equal(command.clientId,source.clientId);
  assert.equal(command.entityId,source.id);
  assert.equal(command.baseRevision,source.revision);
  assert.equal(command.payload.patch.status,'retirado');
  assert.equal(command.payload.patch.visibleToClient,false);
  assert.equal(command.payload.patch.withdrawnAt,'2026-11-06T04:00:00.000Z');
  assert.equal(command.payload.patch.reason,'Se sustituye el programa');
  assert.equal(Object.hasOwn(command.payload.patch,'sessionExecutions'),false);
  assert.equal(Object.hasOwn(command.payload.patch,'delete'),false);
});

test('UNIVERSAL descartar borrador revalida identidad y cliente antes de borrado sincronizado',()=>{
  const source=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const start=source.indexOf('async function discardCurrentSessionDraft(){');
  const end=source.indexOf('async function restoreExecution(',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/const assertCurrentDraftScope=\(\)=>/u);
  assert.match(block,/latestActorId!==actorId/u);
  assert.match(block,/sessionUi\?\.draft!==selectedDraft/u);
  assert.match(block,/state\.collections\?\.clients/u);
  const deleteAt=block.indexOf('await transport.deleteSessionDraft(');
  assert.ok(deleteAt>0);
  const guardCalls=[...block.matchAll(/assertCurrentDraftScope\(\);/gu)].map(m=>m.index);
  assert.equal(guardCalls.length,3);
  assert.ok(guardCalls[0]<block.indexOf('await refreshSessionIfNeeded()'));
  assert.ok(guardCalls[1]<deleteAt&&guardCalls[1]>block.indexOf('await refreshSessionIfNeeded()'));
  assert.ok(guardCalls[2]>deleteAt&&guardCalls[2]<block.indexOf('await draftRepository?.remove?'));
});

test('UNIVERSAL Coach recibe explicacion de borrado logico y Cliente no puede editar',()=>{
  const src=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.match(src,/Retira la sesión de la planificación activa sin borrar el historial/u);
  assert.match(src,/finaliza o cancela cualquier entrenamiento en curso/u);
});

test('UNIVERSAL impide retirar mientras otra ejecucion, fecha o cita sigue abierta',()=>{
  const open={sessionId:source.id,clientId:source.clientId,status:'en_curso'};
  const args={record:source,executions:[],occurrences:[],appointments:[]};
  assert.deepEqual(sessionWithdrawalDependencies({...args,executions:[open]}),
    {ok:false,code:'M26_SESSION_WITHDRAW_EXECUTION_OPEN'});
  assert.deepEqual(sessionWithdrawalDependencies({...args,occurrences:[{...open,status:'confirmada'}]}),
    {ok:false,code:'M26_SESSION_WITHDRAW_OCCURRENCE_OPEN'});
  assert.deepEqual(sessionWithdrawalDependencies({...args,appointments:[{...open,status:'confirmada'}]}),
    {ok:false,code:'M26_SESSION_WITHDRAW_APPOINTMENT_OPEN'});
  assert.deepEqual(sessionWithdrawalDependencies({...args,executions:[{...open,status:'completada'}],
    occurrences:[{...open,status:'cancelada'}],appointments:[{...open,status:'realizada'}]}),
    {ok:true,code:null});
});
test('UNIVERSAL nunca bloquea otra persona, pero si datos de propietario ambiguo de la misma sesion',()=>{
  const row={sessionId:source.id,clientId:'another-client',status:'en_curso'};
  assert.equal(sessionWithdrawalDependencies({record:source,executions:[row]}).ok,true);
  assert.equal(sessionWithdrawalDependencies({record:source,executions:[{sessionId:source.id,status:'activo'}]}).ok,false);
  assert.throws(()=>sessionWithdrawalDependencies({record:{id:source.id}}),/SCOPE_REQUIRED/u);
});
test('UNIVERSAL retirada Coach reconsulta datos actuales antes de construir comando',()=>{
  const code=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  const manage=code.slice(code.indexOf('async function managePublication(button){'),
    code.indexOf('async function availableReportDrafts(',code.indexOf('async function managePublication(button){')));
  assert.match(manage,/session-withdraw-preflight/u);
  assert.match(manage,/sessionWithdrawalDependencies/u);
  assert.ok(manage.indexOf("refreshState({reason:'session-withdraw-preflight'})")<
    manage.indexOf('buildPublicationCommand('));
  assert.match(manage,/M26_SESSION_WITHDRAW_ACTOR_CHANGED/u);
});
