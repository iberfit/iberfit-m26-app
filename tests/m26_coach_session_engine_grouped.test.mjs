import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createExecution,
  startExecution,
  currentStep,
  nextExecutionStep,
  recordSet,
  advanceExecution,
  retreatExecution,
  addExecutionSet,
  addExtraSetAndAdvance,
} from '../src/m26/workflows/session-execution.js';

const coach={role:'coach',userId:'coach-regression'};

function groupedSession(type,exerciseIds,rounds=2,{legacyNested=false}={}){
  const prescriptions=Object.fromEntries(
    exerciseIds.map((exerciseId,index)=>[
      exerciseId,
      {
        reps:String(8+index),
        plannedLoad:String(30+index*10),
        restSeconds:30,
        tempo:'2-0-2',
        targetRpe:7,
        targetRir:3,
        prescriptionNotes:'cue-'+exerciseId,
      },
    ]),
  );
  return {
    id:'session-'+type,
    revision:7,
    title:'Grouped regression',
    blocks:[
      {
        id:'block-'+type,
        type,
        rounds,
        exerciseIds,
        prescriptions,
        ...(legacyNested
          ?{exercises:exerciseIds.map((exerciseId)=>({
              exerciseId,
              name:'Legacy '+exerciseId,
            }))}
          :{}),
      },
    ],
  };
}

function walkOrder(type,exerciseIds,rounds=2){
  const session=groupedSession(type,exerciseIds,rounds);
  const execution=createExecution({
    session,
    clientId:'client-1',
    executionId:'execution-'+type,
  });
  startExecution(execution,{actor:coach});

  const expected=[];
  for(let round=1;round<=rounds;round+=1){
    for(const exerciseId of exerciseIds)expected.push([exerciseId,round]);
  }

  const observed=[];

  for(let index=0;index<expected.length;index+=1){
    const step=currentStep(execution,session);
    assert.ok(step,'current step must exist');
    observed.push([step.exerciseId,step.setNumber]);

    assert.equal(step.exercise?.exerciseId,step.exerciseId);
    assert.equal(step.exercise?.reps,step.prescription.reps);
    assert.equal(step.roundNumber,step.setNumber);
    assert.equal(step.totalRounds,rounds);

    const next=nextExecutionStep(execution,session);
    if(index<expected.length-1){
      assert.ok(next,'next execution step must exist');
      assert.deepEqual(
        [next.exerciseId,next.setNumber],
        expected[index+1],
        'peek must match the exact step advanceExecution will use',
      );
    }else{
      assert.equal(next,null,'final live step must not invent another step');
    }

    recordSet(execution,session,{
      reps:8,
      load:'40',
      rpe:7,
      rir:3,
      actor:coach,
    });

    if(index<expected.length-1){
      advanceExecution(execution,{actor:coach});
      const advanced=currentStep(execution,session);
      assert.deepEqual(
        [advanced.exerciseId,advanced.setNumber],
        expected[index+1],
        'advanceExecution must consume canonical interleaved order',
      );
    }
  }

  assert.deepEqual(observed,expected);
}

test('biserie executes A1 -> B1 -> A2 -> B2',()=>{
  walkOrder('biserie',['A','B'],2);
});

test('history review peek follows the same planned step as advanceExecution',()=>{
  const session=groupedSession('biserie',['A','B'],2);
  const execution=createExecution({
    session,
    clientId:'client-history',
    executionId:'execution-history-review',
  });
  startExecution(execution,{actor:coach});

  recordSet(execution,session,{reps:8,load:'40',rpe:7,rir:3,actor:coach});
  advanceExecution(execution,{actor:coach}); // B1

  recordSet(execution,session,{reps:8,load:'40',rpe:7,rir:3,actor:coach});
  advanceExecution(execution,{actor:coach}); // A2

  recordSet(execution,session,{reps:8,load:'40',rpe:7,rir:3,actor:coach});
  advanceExecution(execution,{actor:coach}); // B2 unresolved

  retreatExecution(execution,{actor:coach}); // A2
  retreatExecution(execution,{actor:coach}); // B1

  assert.equal(execution.reviewingHistory,true);

  const peek=nextExecutionStep(execution,session);

  assert.deepEqual(
    [peek.exerciseId,peek.setNumber],
    ['A',2],
    'historical peek must follow planned A2, not jump to unresolved B2',
  );

  advanceExecution(execution,{actor:coach});

  const advanced=currentStep(execution,session);
  assert.deepEqual(
    [advanced.exerciseId,advanced.setNumber],
    ['A',2],
    'advanceExecution and UI peek must agree while reviewing history',
  );
});

test('grouped extra set preserves interleaving and rejects unsafe immediate jump',()=>{
  const session=groupedSession('biserie',['A','B'],2);
  const execution=createExecution({
    session,
    clientId:'client-extra',
    executionId:'execution-group-extra',
  });
  startExecution(execution,{actor:coach});

  recordSet(execution,session,{reps:8,load:'40',rpe:7,rir:3,actor:coach});
  advanceExecution(execution,{actor:coach}); // B1

  recordSet(execution,session,{reps:8,load:'40',rpe:7,rir:3,actor:coach});
  advanceExecution(execution,{actor:coach}); // A2

  recordSet(execution,session,{reps:8,load:'40',rpe:7,rir:3,actor:coach});

  addExecutionSet(execution,{actor:coach});

  const next=nextExecutionStep(execution,session);
  assert.deepEqual(
    [next.exerciseId,next.setNumber],
    ['B',2],
    'adding A3 must still complete B2 before the extra A set',
  );

  assert.throws(
    ()=>addExtraSetAndAdvance(execution,session,{actor:coach}),
    /M26_EXECUTION_EXTRA_SET_GROUP_ORDER_REQUIRED/,
  );

  advanceExecution(execution,{actor:coach}); // B2
  recordSet(execution,session,{reps:8,load:'40',rpe:7,rir:3,actor:coach});
  advanceExecution(execution,{actor:coach}); // A3

  const extra=currentStep(execution,session);
  assert.deepEqual([extra.exerciseId,extra.setNumber],['A',3]);
});

test('immediate extra-set fast path remains available for individual exercises',()=>{
  const session={
    id:'single-session',
    revision:1,
    title:'Single',
    blocks:[{
      id:'single-block',
      type:'exercise',
      exerciseId:'A',
      sets:1,
      reps:'8',
      plannedLoad:'40',
      restSeconds:30,
      tempo:'2-0-2',
      targetRpe:7,
      targetRir:3,
    }],
  };

  const execution=createExecution({
    session,
    clientId:'client-single',
    executionId:'execution-single-extra',
  });

  startExecution(execution,{actor:coach});
  recordSet(execution,session,{reps:8,load:'40',rpe:7,rir:3,actor:coach});

  addExtraSetAndAdvance(execution,session,{actor:coach});

  const step=currentStep(execution,session);
  assert.deepEqual([step.exerciseId,step.setNumber,step.totalSets],['A',2,2]);
});

test('triserie interleaves every exercise by round',()=>{
  walkOrder('triserie',['A','B','C'],2);
});

for(const type of ['circuito','amrap','tabata']){
  test(type+' uses the same canonical round order',()=>{
    walkOrder(type,['A','B','C'],2);
  });
}

test('grouped exercise metadata resolves from exerciseIds + prescriptions',()=>{
  const session=groupedSession('biserie',['A','B'],2);
  const execution=createExecution({
    session,
    clientId:'client-1',
    executionId:'metadata-resolution',
  });

  // Recovery must remain independent of the mutable live session.
  session.blocks=[];

  const step=currentStep(execution,session);
  assert.equal(step.exerciseId,'A');
  assert.equal(step.exercise?.exerciseId,'A');
  assert.equal(step.exercise?.reps,'8');
  assert.equal(step.exercise?.plannedLoad,'30');
  assert.equal(step.exercise?.groupType,'biserie');
  assert.equal(step.exercise?.groupOrder,0);
});

test('legacy nested grouped exercise metadata remains supported',()=>{
  const session=groupedSession(
    'biserie',
    ['A','B'],
    2,
    {legacyNested:true},
  );
  const execution=createExecution({
    session,
    clientId:'client-1',
    executionId:'legacy-metadata',
  });

  const step=currentStep(execution,session);
  assert.equal(step.exercise?.exerciseId,'A');
  assert.equal(step.exercise?.name,'Legacy A');
});

test('session UI consumes canonical nextExecutionStep instead of raw queue arithmetic',()=>{
  const source=fs.readFileSync(
    new URL('../src/m26/workflows/session-ui.js',import.meta.url),
    'utf8',
  );

  assert.match(source,/nextExecutionStep/);
  assert.doesNotMatch(
    source,
    /const next=execution\.queue\[execution\.index\+1\]/,
  );
  assert.doesNotMatch(
    source,
    /const withinCurrentExercise=execution\.setIndex\+1/,
  );
  assert.match(
    source,
    /const nextStep=nextExecutionStep\(execution,session\)/,
  );
  assert.match(
    source,
    /!currentQueueItem\?\.groupType/,
  );
  assert.doesNotMatch(
    source,
    /Number\(execution\.setIndex\)\+1>=Number\(currentQueueItem\.sets/,
  );
});

test('coach rest auto-advance recovers after background and expired rest',()=>{
  const source=fs.readFileSync(
    new URL('../src/m26/workflows/session-controller.js',import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /coachRestSuppressedSignature=null;\s*scheduleCoachRestAutoAdvance\(getContext\(\)\)/,
  );
  assert.match(
    source,
    /const delay=Math\.max\(0,deadline-Date\.now\(\)\)/,
  );
  assert.doesNotMatch(
    source,
    /const delay=deadline-Date\.now\(\);\s*if\(delay<=0\)return/,
  );
  assert.match(
    source,
    /function scheduleCoachRestAutoAdvance\(context=getContext\(\)\)\{\s*if\(coachRestAdvancePending\)return;/,
  );
});
