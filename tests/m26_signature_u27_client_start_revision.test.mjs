import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createExecution,buildStartExecutionCommand} from '../src/m26/workflows/session-execution.js';
import {sessionReadyToStart,actorCanExecuteSession} from '../src/m26/rc39/session-policy.js';

const clientId='10000000-0000-4000-8000-000000000100';
const sessionId='10000000-0000-4000-8000-000000000101';
const session={
  id:sessionId,clientId,status:'disponible',revision:3,
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
  clientVisibilityLevel:'full',
  blocks:[{id:'exercise-1',type:'exercise',exerciseId:'exercise-1',name:'Sentadilla',sets:3}],
};

test('P0: verified Cliente session entry carries hydrated canonical revision into SESION_INICIAR',()=>{
  const source=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const start=source.slice(source.indexOf('async function onStartSession(event)'),source.indexOf('function surfaceRoleSwitchError('));
  assert.ok(start.includes("await hydrate({reason:'session-entry-authoritative'})"),'must refresh before start');
  assert.match(start,/const current=resolveCurrentSessionForEntry\(\{state:store\.getState\(\),requested,clientId\}\)/u);
  assert.match(start,/const normalized=normalizePublishedSession\(current\)/u);
  assert.match(start,/sessionRevision:normalized\.revision,appointmentId:appointment\?\.id\|\|null/u);
  assert.ok(start.indexOf('sessionRevision:normalized.revision')>start.indexOf('resolveCurrentSessionForEntry'));
});

test('P0: nonzero canonical revision must be used for start, not the implicit zero fallback',()=>{
  assert.equal(sessionReadyToStart(session),true);
  assert.equal(actorCanExecuteSession({role:'client',session}),true);
  const execution=createExecution({session,clientId,executionId:'10000000-0000-4000-8000-000000000102'});
  const command=buildStartExecutionCommand(execution,{sessionRevision:session.revision});
  assert.equal(command.type,'SESION_INICIAR');
  assert.equal(command.entityId,sessionId);
  assert.equal(command.clientId,clientId);
  assert.equal(command.baseRevision,3);
  assert.equal(command.payload.executionId,execution.id);
  assert.equal(Object.hasOwn(command.payload,'appointmentId'),false,'unscheduled autonomous workout must not invent appointmentId');
});

test('P0: preservation keeps Coach publication/authorization barriers, no eager local start',()=>{
  const source=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const start=source.slice(source.indexOf('async function onStartSession(event)'),source.indexOf('function surfaceRoleSwitchError('));
  for(const key of ['M26_CLIENT_SCOPE_FORBIDDEN','M42_WORKSPACE_ALREADY_ACTIVE','resolveRecoveredSessionForEntry','actorCanExecuteSession','sessionReadyToStart','sessionRequiresConfirmedAppointment','createExecution']) {
    assert.ok(start.includes(key),key);
  }
  const controller=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.match(controller,/buildStartExecutionCommand\(execution,\{appointmentId:appointmentForStart,sessionRevision:payload\.sessionRevision\?\?sessionRevision\}\)/u);
  assert.match(controller,/executeAndApply\(commandBus,command,\(result\)=>\{startExecution\(execution,\{actor\}\)/u);
});
