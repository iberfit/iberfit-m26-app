import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  appointmentCancellationDecision,buildCancelAppointmentCommand,
} from '../src/m26/workflows/agenda-workflow.js';

const clientId='client-1',sessionId='session-1';
const appointment={id:'appointment-1',clientId,sessionId,status:'confirmada',revision:3};
const withRows=other=>({
  appointment,clientId,appointments:[appointment],occurrences:[],executions:[],...other,
});
test('UNIVERSAL Coach cancela cita ordinaria sin DELETE y con motivo y CAS',()=>{
  assert.deepEqual(appointmentCancellationDecision(withRows()),{ok:true,code:null});
  const command=buildCancelAppointmentCommand({
    clientId,appointmentId:appointment.id,reason:' Cambio de disponibilidad  '},3);
  assert.equal(command.type,'CITA_CANCELAR');
  assert.equal(command.entityType,'appointment');
  assert.equal(command.entityId,appointment.id);
  assert.equal(command.baseRevision,3);
  assert.equal(command.reason,'Cambio de disponibilidad');
  assert.equal(command.payload.patch.cancellationReason,'Cambio de disponibilidad');
  assert.equal(Object.hasOwn(command.payload,'delete'),false);
  assert.equal(Object.hasOwn(command.payload.patch,'sessionId'),false);
  for(const reason of ['', '  ', 'x'])assert.throws(()=>
    buildCancelAppointmentCommand({clientId,appointmentId:appointment.id,reason},3),
    /M26_APPOINTMENT_CANCEL_CONTEXT_REQUIRED/);
});
test('UNIVERSAL bloquea citas realizadas/canceladas y propietario o alcance incorrectos',()=>{
  for(const status of ['realizada','cancelada','ausencia_cliente','ausencia_coach']){
    assert.equal(appointmentCancellationDecision(withRows({
      appointment:{...appointment,status},
    })).ok,false);
  }
  assert.throws(()=>appointmentCancellationDecision(withRows({clientId:'foreign'})),
    /M26_APPOINTMENT_CANCEL_SCOPE_FORBIDDEN/);
  assert.throws(()=>appointmentCancellationDecision(withRows({
    appointment:{...appointment,clientId:''},
  })),/M26_APPOINTMENT_CANCEL_SCOPE_FORBIDDEN/);
});
test('UNIVERSAL nunca cancela un enlace de ocurrencia U60 desde el comando legado',()=>{
  const linked={id:'occ-1',clientId,sessionId,appointmentId:appointment.id,status:'confirmada'};
  assert.deepEqual(appointmentCancellationDecision(withRows({
    occurrences:[linked],
  })),{ok:false,code:'M26_APPOINTMENT_OCCURRENCE_REQUIRES_TRANSITION'});
  assert.deepEqual(appointmentCancellationDecision(withRows({
    appointments:[appointment,{...appointment,id:'appointment-2'}],
  })),{ok:false,code:'M26_APPOINTMENT_DATED_EXECUTOR_REQUIRED'});
});
test('UNIVERSAL protege ejecuciones activas incluso si la Agenda marca confirmada',()=>{
  for(const status of ['en_curso','activa','ready','']){
    const d=appointmentCancellationDecision(withRows({executions:[
      {id:'exec-1',clientId,sessionId,status},
    ]}));
    assert.deepEqual(d,{ok:false,code:'M26_APPOINTMENT_SESSION_EXECUTION_OPEN'});
  }
  assert.equal(appointmentCancellationDecision(withRows({executions:[
    {id:'exec-1',clientId,sessionId,status:'completed'},
    {id:'exec-other',clientId,sessionId:'other',status:'active'},
    {id:'exec-foreign',clientId:'other',sessionId,status:'active'},
  ]})).ok,true);
});
test('UNIVERSAL la UI ofrece cancelacion solo al Coach, con razon y lectura autorizada',()=>{
  const agenda=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const rc39=readFileSync(new URL('../src/m26/rc39/route-render.js',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  for(const src of [agenda,rc39]){
    assert.match(src,/data-appointment-cancel-reason/);
    assert.match(src,/data-workflow-action="cancel-appointment"/);
  }
  assert.match(controller,/appointment-cancel-preflight/);
  assert.match(controller,/M26_APPOINTMENT_CANCEL_ACTOR_CHANGED/);
  assert.match(controller,/appointmentCancellationDecision/);
  const fx=controller.slice(controller.indexOf('async function cancelAppointment('),
    controller.indexOf('function reuseSession(',controller.indexOf('async function cancelAppointment(')));
  assert.ok(fx.indexOf("refreshState({reason:'appointment-cancel-preflight'})")<
    fx.indexOf('buildCancelAppointmentCommand('));
  assert.ok(fx.indexOf('appointmentCancellationDecision(')<
    fx.indexOf('buildCancelAppointmentCommand('));
});
