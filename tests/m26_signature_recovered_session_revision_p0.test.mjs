import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createExecution,buildStartExecutionCommand} from '../src/m26/workflows/session-execution.js';
import {createExecutionSnapshot,validateExecutionSnapshot} from '../src/m26/workflows/session-recovery.js';
import {dispatchSessionAction} from '../src/m26/workflows/session-controller.js';

const clientId='10000000-0000-4000-8000-000000000100';
const sessionId='10000000-0000-4000-8000-000000000101';
const session={id:sessionId,clientId,revision:8,status:'disponible',
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',clientVisibilityLevel:'full',
  blocks:[{id:'b',type:'exercise',exerciseId:'e',name:'Fuerza',sets:3,reps:'8'}]};

test('P0 recovery snapshot retains independent session revision for safe start CAS',()=>{
  const execution=createExecution({session,clientId});
  const snapshot=createExecutionSnapshot({ownerId:'coach-owner',session,execution,
    sessionRevision:session.revision});
  assert.equal(validateExecutionSnapshot(snapshot).ok,true);
  assert.equal(snapshot.sessionRevision,8);
  assert.equal(snapshot.session.revision,8);
  const command=buildStartExecutionCommand(snapshot.execution,{sessionRevision:snapshot.sessionRevision});
  assert.equal(command.type,'SESION_INICIAR');
  assert.equal(command.baseRevision,8);
  assert.equal(Object.hasOwn(command.payload,'appointmentId'),false);
});

test('P0 cold-login and in-app recovered entry retain snapshot revision with legacy fallback',()=>{
  const source=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const cold=source.slice(source.indexOf('async function restoreExecution({'),source.indexOf('async function restoreExecutionAfterAuthentication(){'));
  const warm=source.slice(source.indexOf('async function onStartSession(event){'),source.indexOf('function surfaceRoleSwitchError('));
  assert.match(cold,/resolveRecoveredSessionForEntry\(\{/u);
  assert.match(cold,/sessionRevision:snapshot\.sessionRevision\?\?snapshot\.session\.revision\?\?0/u);
  assert.match(warm,/resolveRecoveredSessionForEntry\(\{/u);
  assert.match(warm,/sessionRevision:recovered\.sessionRevision\?\?recovered\.session\.revision\?\?0/u);
  assert.match(warm,/sessionRevision:normalized\.revision/u);
  assert.match(cold,/if\(!snapshot\?\.execution\|\|!snapshot\?\.session\)return false/u);
});


test('P0 Cliente cannot enter Coach builder through a forged local event',()=>{
  const source=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const builder=source.slice(source.indexOf('async function onOpenBuilder(event){'),source.indexOf('async function onStartSession(event){'));
  assert.ok(builder.includes("['client','cliente'].includes(String(state.identity?.role||'').trim().toLowerCase())"));
  assert.ok(builder.includes("throw new Error('M26_SESSION_BUILDER_ROLE_FORBIDDEN')"));
  assert.ok(builder.indexOf('M26_SESSION_BUILDER_ROLE_FORBIDDEN')<builder.indexOf('loadSessionDraft(clientId)'));
  assert.ok(builder.includes('!visible.has(clientId)'), 'Coach client scope remains mandatory');
  assert.ok(builder.includes('createReusableSessionDraft(sourceSession,{clientId,catalog})'),
    'Coach reuse of the prescription remains available');
});

test('P0 resumed Client workout sends snapshot revision and waits for real ACK',async()=>{
  const execution=createExecution({session,clientId});
  const snapshot=createExecutionSnapshot({ownerId:'client-owner',session,execution,sessionRevision:8});
  let sent=null;
  const commandBus={execute:async command=>{
    sent=command;
    assert.equal(execution.status,'ready','do not start locally before server ACK');
    return {ok:true,kind:'applied',response:{executionRevision:1,remoteRevision:9}};
  }};
  const result=dispatchSessionAction({action:'start',execution:snapshot.execution,
    session:snapshot.session,sessionRevision:snapshot.sessionRevision,
    commandBus,actor:{role:'client',clientId},online:true});
  assert.equal(result.kind,'command');
  await result.value;
  assert.equal(sent.type,'SESION_INICIAR');
  assert.equal(sent.baseRevision,8);
  assert.equal(snapshot.execution.status,'active');
  assert.equal(snapshot.execution.revision,1);
});

test('P0 a rejected recovered start never fabricates an active local workout',async()=>{
  const execution=createExecution({session,clientId});
  const commandBus={execute:async()=>({ok:false,kind:'conflict',response:{reason:'REVISION_MISMATCH'}})};
  const result=dispatchSessionAction({action:'start',execution,session,
    sessionRevision:8,commandBus,actor:{role:'client',clientId}});
  await assert.rejects(result.value,/M26_COMMAND_CONFLICT/u);
  assert.equal(execution.status,'ready');
});
