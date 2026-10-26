import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actorCanExecuteSession,clientSessionProjection,
  normalizePublishedSessionForExecution,sessionDeliveryModality,
  sessionVisibilityLevel,sessionRequiresConfirmedAppointment,sessionReadyToStart,
} from '../src/m26/rc39/session-policy.js';
import {createExecution,buildStartExecutionCommand} from '../src/m26/workflows/session-execution.js';
import {dispatchSessionAction} from '../src/m26/workflows/session-controller.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const blocks=[{id:'block-1',type:'exercise',exerciseId:'exercise-1',sets:2,
  reps:'10',restSeconds:60,targetRpe:7,targetRir:2}];
const make=(id,ownership,delivery='guiada_en_app',extra={})=>({
  id,clientId:'client-1',status:'disponible',revision:3,
  title:'Fuerza básica',deliveryModality:delivery,
  deliveryOwnership:ownership,clientVisibilityLevel:'full',visibleToClient:true,
  blocks:structuredClone(blocks),...extra,
});
const athlete={role:'client',clientId:'client-1'};
const coach={role:'coach',clientId:'client-1'};
const playable=record=>normalizePublishedSessionForExecution(record);

test('B24 Cliente reproduce tanto autónoma como guiada en app, sin cita ficticia',()=>{
  for(const ownership of ['client_autonomous','guided_in_app']){
    const source=make('session-'+ownership,ownership);
    const session=playable(source);
    assert.equal(actorCanExecuteSession({role:'client',session:source}),true);
    assert.equal(actorCanExecuteSession({role:'client',session}),true);
    assert.equal(sessionReadyToStart(session),true);
    assert.equal(sessionRequiresConfirmedAppointment({role:'client',session}),false);
    const execution=createExecution({session,clientId:'client-1'});
    const command=buildStartExecutionCommand(execution,{sessionRevision:session.revision});
    assert.equal(command.type,'SESION_INICIAR');
    assert.equal(command.payload.appointmentId,undefined);
    const started=dispatchSessionAction({action:'start',session,execution,actor:athlete,online:true});
    assert.equal(started.kind,'execution');
    assert.equal(execution.status,'active');
    assert.equal(execution.clientId,'client-1');
  }
});

test('B24 Coach reproduce su sesión presencial supervisada; Cliente no la inicia',()=>{
  const source=make('session-coach','coach_led','presencial',{
    clientVisibilityLevel:'summary_only',
  });
  const session=playable(source);
  assert.equal(sessionDeliveryModality(session),'presencial');
  assert.equal(sessionVisibilityLevel(session),'summary_only');
  assert.equal(actorCanExecuteSession({role:'client',session}),false);
  assert.equal(actorCanExecuteSession({role:'coach',session}),true);
  assert.equal(sessionRequiresConfirmedAppointment({role:'coach',session}),true);
  const execution=createExecution({session,clientId:'client-1'});
  const command=buildStartExecutionCommand(execution,{appointmentId:'appointment-1',sessionRevision:3});
  assert.equal(command.payload.appointmentId,'appointment-1');
  assert.throws(()=>dispatchSessionAction({action:'start',session,execution,actor:athlete}),
    /M28_SESSION_COACH_LED_CLIENT_START_FORBIDDEN/);
  assert.equal(execution.status,'ready');
  dispatchSessionAction({action:'start',session,execution,actor:coach});
  assert.equal(execution.status,'active');
});

test('B24 una modalidad presencial legada nunca se transforma en autónoma al abrir el player',()=>{
  const old=make('old-coach','guided_in_app','presencial');
  delete old.deliveryModality;
  old.modality='presencial';
  assert.equal(actorCanExecuteSession({role:'client',session:old}),false);
  const session=playable(old);
  assert.equal(sessionDeliveryModality(session),'presencial');
  assert.equal(actorCanExecuteSession({role:'client',session}),false);
});

test('B24 retirada privada en body o wrapper domina permisos obsoletos de ejecución',()=>{
  const visible=make('session-private','guided_in_app');
  for(const body of [{visibleToClient:false},{clientVisibilityLevel:'hidden'},
    {visible_to_client:'false'}]){
    const record={...visible,body:{...visible,...body}};
    assert.equal(sessionVisibilityLevel(record),'hidden');
    assert.equal(actorCanExecuteSession({role:'client',session:record}),false);
    const session=playable(record);
    assert.equal(sessionVisibilityLevel(session),'hidden');
    assert.equal(actorCanExecuteSession({role:'client',session}),false);
    assert.equal(clientSessionProjection(record).visible,false);
  }
});

test('B24 reproductores Cliente/Coach mantienen sus controles propios',()=>{
  const catalog={get:id=>({id,name_es:'Sentadilla'}),search:()=>[]};
  const athleteSession=playable(make('session-athlete','client_autonomous'));
  const coachSession=playable(make('session-coach','coach_led','presencial'));
  const athleteHtml=renderGuidedExecution({session:athleteSession,
    execution:createExecution({session:athleteSession,clientId:'client-1'}),catalog,role:'client'});
  const coachHtml=renderGuidedExecution({session:coachSession,
    execution:createExecution({session:coachSession,clientId:'client-1'}),catalog,role:'coach'});
  assert.match(athleteHtml,/data-session-action="start"/);
  assert.match(coachHtml,/data-session-action="start"/);
  assert.match(athleteHtml,/Revisa el plan y empieza cuando estés preparado/);
  assert.match(coachHtml,/Confirma el contexto y empieza a trabajar con el cliente/);
  assert.doesNotMatch(athleteHtml,/Confirma el contexto y empieza a trabajar con el cliente/);
});
