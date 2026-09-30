import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addCatalogExercise,
  addTrainingGroup,
  createSessionDraft,
  updateSessionBlock,
  validateSessionDraft,
} from '../src/m26/workflows/session-builder.js';

import {
  addExecutionExercise,
  advanceExpiredRest,
  beginRest,
  createExecution,
  recordSet,
  startExecution,
} from '../src/m26/workflows/session-execution.js';

import {
  renderGuidedExecution,
  renderSessionBuilder,
} from '../src/m26/workflows/session-ui.js';

const exercises=new Map([
  ['squat',{
    id:'squat',
    name:'Squat',
    name_es:'Sentadilla',
    pattern:'squat',
    equipment:'peso corporal',
    primary_muscles:['cuádriceps'],
    cues:[],
  }],
  ['row',{
    id:'row',
    name:'Row',
    name_es:'Remo',
    pattern:'pull',
    equipment:'mancuernas',
    primary_muscles:['espalda'],
    cues:[],
  }],
]);

const catalog={
  get(id){return exercises.get(id)||null;},
  has(id){return exercises.has(id);},
  search(){return [...exercises.values()];},
};

const coach={role:'coach',userId:'coach-zero-rest'};

test('builder preserves an explicit numeric zero while keeping 60 as the missing default',()=>{
  const draft=createSessionDraft({
    clientId:'client-zero-rest',
    title:'Zero rest',
  });

  addCatalogExercise(
    draft,
    'squat',
    catalog,
    {sets:2,reps:'5',restSeconds:0},
  );

  assert.equal(draft.blocks[0].restSeconds,0);
  assert.equal(validateSessionDraft(draft,catalog).ok,true);

  updateSessionBlock(draft,{
    blockId:draft.blocks[0].id,
    field:'restSeconds',
    value:'0',
    catalog,
  });

  assert.equal(draft.blocks[0].restSeconds,0);
  assert.equal(validateSessionDraft(draft,catalog).ok,true);

  const legacyDefault=createSessionDraft({clientId:'client-default'});
  addCatalogExercise(legacyDefault,'squat',catalog,{sets:1,reps:'5'});
  assert.equal(legacyDefault.blocks[0].restSeconds,60);
});

test('group prescriptions preserve zero-rest transitions',()=>{
  const draft=createSessionDraft({
    clientId:'client-group-zero',
    title:'Biserie cero descanso',
  });

  addTrainingGroup(draft,'biserie',['squat','row']);
  const group=draft.blocks[0];

  for(const exerciseId of group.exerciseIds){
    updateSessionBlock(draft,{
      blockId:group.id,
      exerciseId,
      field:'restSeconds',
      value:0,
      catalog,
    });
  }

  assert.equal(group.prescriptions.squat.restSeconds,0);
  assert.equal(group.prescriptions.row.restSeconds,0);
  assert.equal(validateSessionDraft(draft,catalog).ok,true);

  const execution=createExecution({
    session:draft,
    clientId:draft.clientId,
  });

  assert.deepEqual(
    execution.queue.map((item)=>item.prescription.restSeconds),
    [0,0],
  );
});

test('coach UI exposes zero as a valid rest value and does not rewrite it to 60',()=>{
  const draft=createSessionDraft({
    clientId:'client-ui-zero',
    title:'UI zero rest',
  });

  addCatalogExercise(
    draft,
    'squat',
    catalog,
    {sets:2,reps:'5',restSeconds:0},
  );

  const builderHtml=renderSessionBuilder({
    draft,
    catalog,
    role:'coach',
  });

  assert.match(
    builderHtml,
    /value="0"[^>]*data-session-block-field="restSeconds"[^>]*min="0"/u,
  );

  const execution=createExecution({
    session:draft,
    clientId:draft.clientId,
  });

  startExecution(execution,{actor:coach});

  const liveHtml=renderGuidedExecution({
    execution,
    session:draft,
    catalog,
    role:'coach',
  });

  assert.match(
    liveHtml,
    /data-session-action="complete-set" data-rest-seconds="0"/u,
  );

  assert.match(
    liveHtml,
    /<span>Descanso<\/span>\s*<strong>0 s<\/strong>/u,
  );
});

test('zero-rest becomes immediately eligible for canonical coach auto-advance',()=>{
  const session=createSessionDraft({
    clientId:'client-auto-zero',
    title:'Auto advance zero',
  });

  addCatalogExercise(
    session,
    'squat',
    catalog,
    {sets:2,reps:'5',restSeconds:0},
  );

  const execution=createExecution({
    session,
    clientId:session.clientId,
  });

  assert.equal(execution.queue[0].prescription.restSeconds,0);

  startExecution(execution,{actor:coach});

  recordSet(execution,session,{
    reps:5,
    rpe:7,
    actor:coach,
  });

  beginRest(execution,0,{actor:coach});

  const deadline=new Date(execution.restUntil).getTime();
  assert.equal(Number.isFinite(deadline),true);

  advanceExpiredRest(
    execution,
    session,
    {
      actor:coach,
      nowMs:deadline,
    },
  );

  assert.equal(execution.index,0);
  assert.equal(execution.setIndex,1);
  assert.equal(execution.restUntil,null);
});

test('coach can add a live exercise with zero rest without coercion',()=>{
  const session=createSessionDraft({
    clientId:'client-live-zero',
    title:'Live zero',
  });

  addCatalogExercise(
    session,
    'squat',
    catalog,
    {sets:2,reps:'5',restSeconds:60},
  );

  const execution=createExecution({
    session,
    clientId:session.clientId,
  });

  startExecution(execution,{actor:coach});

  addExecutionExercise(execution,{
    exerciseId:'row',
    catalog,
    sets:1,
    reps:'10',
    restSeconds:0,
    tempo:'controlado',
    targetRpe:7,
    targetRir:3,
    actor:coach,
  });

  const added=execution.queue.find((item)=>item.liveAdded);
  assert.ok(added);
  assert.equal(added.prescription.restSeconds,0);
});
