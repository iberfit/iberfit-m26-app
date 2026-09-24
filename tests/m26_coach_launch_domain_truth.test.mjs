import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionExecutionIsCompleted,sessionExecutionDate} from '../src/m26/domain/session-execution-truth.js';
import {projectCollectionsForRole,projectIdentityForRole} from '../src/m26/security/role-projection.js';

test('session completion truth accepts real DB shape and rejects non-completed execution states',()=>{
  const raw={id:'e1',client_id:'c1',execution_status:'cerrada_confirmada',remote_confirmed_at:'2026-09-24T12:00:00Z'};
  assert.equal(sessionExecutionIsCompleted(raw),true);
  assert.equal(sessionExecutionDate(raw),'2026-09-24T12:00:00Z');
  assert.equal(sessionExecutionIsCompleted({...raw,execution_status:'cierre_rechazado'}),false);
  assert.equal(sessionExecutionIsCompleted({...raw,execution_status:'activa'}),false);
  assert.equal(sessionExecutionIsCompleted({status:'completada'}),true);
});

test('client projection preserves only safe execution truth fields needed by progress logic',()=>{
  const user={id:'u1',role:'client',clientId:'c1'};
  const projected=projectCollectionsForRole({sessionExecutions:[{id:'e1',client_id:'c1',execution_status:'cerrada_confirmada',remote_confirmed_at:'2026-09-24T12:00:00Z',summary:{secret:'not projected'}}]},user,['sessionExecutions']);
  assert.equal(projected.sessionExecutions.length,1);
  assert.equal(projected.sessionExecutions[0].executionStatus,'cerrada_confirmada');
  assert.equal(projected.sessionExecutions[0].completedAt,'2026-09-24T12:00:00Z');
  assert.equal('summary' in projected.sessionExecutions[0],false);
});

test('Coach identity projection retains own email and membership status evidence',()=>{
  const identity=projectIdentityForRole({id:'coach-1',role:'coach',name:'Coach',email:'coach@iberfit.cl',status:'active'});
  assert.equal(identity.email,'coach@iberfit.cl');
  assert.equal(identity.status,'active');
});
