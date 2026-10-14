import test from 'node:test';
import assert from 'node:assert/strict';
import {createExecution} from '../src/m26/workflows/session-execution.js';
import {dispatchSessionAction} from '../src/m26/workflows/session-controller.js';

const CLIENT='client-m43',OTHER='other-m43';
const source={
  id:'session-m43',clientId:CLIENT,status:'disponible',
  visibleToClient:true,clientVisibilityLevel:'full',
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
  blocks:[{id:'b-1',type:'exercise',exerciseId:'run-m43',
    sets:1,reps:'',restSeconds:0,targetRpe:6,targetRir:0,
    plannedDistanceKm:5,plannedDurationMinutes:30}],
};
const input=(session,actor={role:'client',clientId:CLIENT})=>{
  const execution=createExecution({session,clientId:CLIENT,executionId:'m43-exec'});
  return {action:'start',session,execution,actor,sessionRevision:2,online:true};
};

test('M43 Client start respects availability, visibility and prior remote start',()=>{
  for(const [name,patch] of Object.entries({
    drafted:{status:'borrador'},
    approved:{status:'aprobada'},
    onlyPublished:{status:'publicada'},
    hidden:{visibleToClient:false},
    withdrawn:{status:'retirado'},
    inProgress:{status:'en_curso'},
    private:{clientVisibilityLevel:'hidden'},
  })){
    const session={...source,...patch};
    const args=input(session);
    assert.throws(()=>dispatchSessionAction(args),/M43_CLIENT_SESSION_NOT_READY|M28_SESSION_COACH_LED_CLIENT_START_FORBIDDEN/,name);
    assert.equal(args.execution.status,'ready',name+' must not start local execution');
    assert.equal(args.execution.events.length,0);
  }
});

test('M43 start forbids cross-client actor or session/transport identity mismatches',()=>{
  const actorMismatch=input(source,{role:'client',clientId:OTHER});
  assert.throws(()=>dispatchSessionAction(actorMismatch),/M43_CLIENT_EXECUTION_SCOPE_CONFLICT/);
  assert.equal(actorMismatch.execution.status,'ready');
  const sessionMismatch=input(source);
  sessionMismatch.execution.sessionId='session-another';
  assert.throws(()=>dispatchSessionAction(sessionMismatch),/M43_CLIENT_EXECUTION_SCOPE_CONFLICT/);
  assert.equal(sessionMismatch.execution.events.length,0);
});

test('M43 valid autonomous start still works and creates one real domain event',()=>{
  const args=input(source);
  const result=dispatchSessionAction(args);
  assert.equal(result.kind,'execution');
  assert.equal(args.execution.status,'active');
  assert.equal(args.execution.events.filter(x=>x.type==='SESSION_STARTED').length,1);
  assert.throws(()=>dispatchSessionAction(args),/M26_EXECUTION_NOT_READY/);
  assert.equal(args.execution.events.filter(x=>x.type==='SESSION_STARTED').length,1);
});

test('M43 Coach-led session remains Coach-only even when the client sees its summary',()=>{
  const session={...source,deliveryModality:'presencial',deliveryOwnership:'coach_led',
    clientVisibilityLevel:'summary_only'};
  const args=input(session);
  assert.throws(()=>dispatchSessionAction(args),/M28_SESSION_COACH_LED_CLIENT_START_FORBIDDEN/);
  assert.equal(args.execution.status,'ready');
});
