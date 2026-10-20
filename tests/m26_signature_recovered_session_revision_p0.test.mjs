import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createExecution,buildStartExecutionCommand} from '../src/m26/workflows/session-execution.js';
import {createExecutionSnapshot,validateExecutionSnapshot} from '../src/m26/workflows/session-recovery.js';

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
  const cold=source.slice(source.indexOf('async function restoreExecution(){'),source.indexOf('async function restoreExecutionAfterAuthentication(){'));
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
