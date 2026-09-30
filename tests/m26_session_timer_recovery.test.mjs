import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceExpiredRest,
  createExecution,
  recordSet,
  startExecution,
} from '../src/m26/workflows/session-execution.js';
import {
  recoverExecutionTimers,
  restRemainingSeconds,
} from '../src/m26/workflows/session-timer.js';

const session={
  id:'session-timer-recovery',
  blocks:[{
    id:'block-1',
    type:'exercise',
    exerciseId:'exercise-1',
    sets:2,
    reps:'8-10',
    restSeconds:60,
    targetRpe:7,
    targetRir:3,
  }],
};

const coach={role:'coach',userId:'coach-1'};

function activeExecution(){
  const execution=createExecution({
    session,
    clientId:'client-1',
    executionId:'execution-timer-recovery',
  });
  startExecution(execution,{actor:coach});
  return execution;
}

test('recovery preserves an expired rest deadline for an active execution until auto-advance consumes it',()=>{
  const execution=activeExecution();
  recordSet(execution,session,{reps:10,load:'40 kg',rpe:7,rir:3,actor:coach});
  const deadline=Date.parse('2026-09-29T23:59:00.000Z');
  const recoveredAt=deadline+30_000;
  execution.restUntil=new Date(deadline).toISOString();

  recoverExecutionTimers(execution,recoveredAt);

  assert.equal(execution.restUntil,new Date(deadline).toISOString());
  assert.equal(restRemainingSeconds(execution,recoveredAt),0);

  advanceExpiredRest(execution,session,{actor:coach,nowMs:recoveredAt});

  assert.equal(execution.index,0);
  assert.equal(execution.setIndex,1);
  assert.equal(execution.restUntil,null);
  assert.equal(
    execution.events.filter((event)=>event.type==='REST_COMPLETED_AUTO_ADVANCE').length,
    1,
  );
});

test('recovery keeps a future rest deadline for active execution',()=>{
  const execution=activeExecution();
  const recoveredAt=Date.parse('2026-09-29T23:58:00.000Z');
  const deadline=recoveredAt+45_000;
  execution.restUntil=new Date(deadline).toISOString();

  recoverExecutionTimers(execution,recoveredAt);

  assert.equal(execution.restUntil,new Date(deadline).toISOString());
  assert.equal(restRemainingSeconds(execution,recoveredAt),45);
});

test('recovery clears stale rest state outside active execution',()=>{
  for(const status of ['ready','paused','awaiting_feedback','completed','cancelled']){
    const execution=activeExecution();
    execution.status=status;
    execution.restUntil='2026-09-30T00:30:00.000Z';

    recoverExecutionTimers(execution,Date.parse('2026-09-29T23:58:00.000Z'));

    assert.equal(execution.restUntil,null,`restUntil must be cleared for ${status}`);
    assert.equal(execution.activeSince,null,`activeSince must be cleared for ${status}`);
  }
});
