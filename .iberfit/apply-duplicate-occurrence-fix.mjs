import fs from 'node:fs';

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`PATCH_ANCHOR_MISSING:${label}`);
  if(source.indexOf(needle,first+needle.length)>=0)throw new Error(`PATCH_ANCHOR_AMBIGUOUS:${label}`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

const executionPath='src/m26/workflows/session-execution.js';
let execution=fs.readFileSync(executionPath,'utf8');

execution=replaceOnce(execution,
`function resultKey(exerciseId,setNumber){return \`${'${exerciseId}'}:${'${setNumber}'}\`;}
export function previousSetDraftValues(execution){
  const item=execution?.queue?.[execution.index];
  if(!item||Number(execution.setIndex)<1)return null;
  const previous=execution.results?.[resultKey(item.exerciseId,execution.setIndex)];
  if(!previous)return null;
  return {
    reps:previous.reps==null?'':String(previous.reps),
    seconds:previous.seconds==null?'':String(previous.seconds),
    load:previous.load==null?'':String(previous.load),
    rpe:previous.rpe==null?'':String(previous.rpe),
    rir:previous.rir==null?'':String(previous.rir),
  };
}`,
`function resultKey(exerciseId,setNumber,blockId=null){
  const legacy=\`${'${exerciseId}'}:${'${setNumber}'}\`;
  return blockId?\`${'${blockId}'}:${'${legacy}'}\`:legacy;
}
function canUseLegacyEntry(execution,step,setNumber){
  if(!step?.blockId)return true;
  const occurrenceIndex=(execution?.queue||[]).findIndex((item)=>item?.blockId===step.blockId&&item?.exerciseId===step.exerciseId);
  const firstCompatibleIndex=(execution?.queue||[]).findIndex((item)=>item?.exerciseId===step.exerciseId&&Number(item?.sets||0)>=Number(setNumber));
  return occurrenceIndex>=0&&occurrenceIndex===firstCompatibleIndex;
}
function storedEntry(store,execution,step,setNumber=step?.setNumber){
  if(!store||!step?.exerciseId||!Number.isInteger(Number(setNumber))||Number(setNumber)<1)return null;
  const scopedKey=resultKey(step.exerciseId,setNumber,step.blockId||null);
  if(Object.hasOwn(store,scopedKey))return {key:scopedKey,value:store[scopedKey],legacy:false};
  const legacyKey=resultKey(step.exerciseId,setNumber);
  if(scopedKey!==legacyKey&&canUseLegacyEntry(execution,step,setNumber)&&Object.hasOwn(store,legacyKey)){
    return {key:legacyKey,value:store[legacyKey],legacy:true};
  }
  return null;
}
export function executionResultForStep(execution,step,setNumber=step?.setNumber){
  return storedEntry(execution?.results,execution,step,setNumber)?.value||null;
}
function skippedSetForStep(execution,step,setNumber=step?.setNumber){
  return storedEntry(execution?.skippedSets,execution,step,setNumber)?.value||null;
}
export function previousSetDraftValues(execution){
  const item=execution?.queue?.[execution.index];
  if(!item||Number(execution.setIndex)<1)return null;
  const previousSetNumber=Number(execution.setIndex);
  const previous=executionResultForStep(execution,{...item,setNumber:previousSetNumber,totalSets:item.sets},previousSetNumber);
  if(!previous)return null;
  return {
    reps:previous.reps==null?'':String(previous.reps),
    seconds:previous.seconds==null?'':String(previous.seconds),
    load:previous.load==null?'':String(previous.load),
    rpe:previous.rpe==null?'':String(previous.rpe),
    rir:previous.rir==null?'':String(previous.rir),
  };
}`,
'result identity helpers');

execution=replaceOnce(execution,
`  if(execution.results?.[resultKey(identity.exerciseId,identity.setNumber)]){delete execution.activeSetDraft;return null;}`,
`  if(executionResultForStep(execution,identity)){delete execution.activeSetDraft;return null;}`,
'active draft recorded guard');

execution=replaceOnce(execution,
`  return {
    exerciseId:step.exerciseId,
    setNumber:step.setNumber,`,
`  return {
    blockId:step.blockId||null,
    exerciseId:step.exerciseId,
    setNumber:step.setNumber,`,
'result block identity');

execution=replaceOnce(execution,
`  const key=resultKey(step.exerciseId,step.setNumber);
  if(execution.results[key])throw new Error('M26_EXECUTION_SET_ALREADY_RECORDED');
  const result=validatedSetResult(step,input);
  execution.results[key]=result;clearActiveSetDraft(execution);`,
`  const key=resultKey(step.exerciseId,step.setNumber,step.blockId||null);
  if(executionResultForStep(execution,step))throw new Error('M26_EXECUTION_SET_ALREADY_RECORDED');
  const result=validatedSetResult(step,input);
  execution.results[key]=result;clearActiveSetDraft(execution);`,
'record scoped set');

execution=replaceOnce(execution,
`  const key=resultKey(step.exerciseId,step.setNumber);
  const previous=execution.results[key];
  if(!previous)throw new Error('M26_EXECUTION_SET_CORRECTION_TARGET_MISSING');
  const next=validatedSetResult(step,input,previous);
  execution.results[key]=next;`,
`  const previousEntry=storedEntry(execution.results,execution,step);
  if(!previousEntry)throw new Error('M26_EXECUTION_SET_CORRECTION_TARGET_MISSING');
  const key=resultKey(step.exerciseId,step.setNumber,step.blockId||null);
  const previous=previousEntry.value;
  const next=validatedSetResult(step,input,previous);
  if(previousEntry.key!==key)delete execution.results[previousEntry.key];
  execution.results[key]=next;`,
'correct scoped set');

execution=replaceOnce(execution,
`  const item=execution.queue[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
  const key=resultKey(item.exerciseId,execution.setIndex+1);
  ensureDeviationStores(execution);
  if(!execution.results[key]&&!execution.skippedSets[key])throw new Error('M26_EXECUTION_SET_NOT_RECORDED');`,
`  const item=execution.queue[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
  const step={...item,setNumber:execution.setIndex+1,totalSets:item.sets};
  ensureDeviationStores(execution);
  if(!executionResultForStep(execution,step)&&!skippedSetForStep(execution,step))throw new Error('M26_EXECUTION_SET_NOT_RECORDED');`,
'advance scoped resolution');

execution=replaceOnce(execution,
`    const key=resultKey(item.exerciseId,execution.setIndex+1);
    if(execution.results[key])throw new Error('M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED');`,
`    const step={...item,setNumber:execution.setIndex+1,totalSets:item.sets};
    if(executionResultForStep(execution,step))throw new Error('M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED');`,
'substitution scoped guard');

execution=replaceOnce(execution,
`  const key=resultKey(step.exerciseId,step.setNumber);
  if(execution.results[key])throw new Error('M26_EXECUTION_SKIP_RECORDED_SET_FORBIDDEN');
  ensureDeviationStores(execution);
  const entry={exerciseId:step.exerciseId,setNumber:step.setNumber,reason:safeReason,at:now(),actor:actorSnapshot(actor)};`,
`  const key=resultKey(step.exerciseId,step.setNumber,step.blockId||null);
  if(executionResultForStep(execution,step))throw new Error('M26_EXECUTION_SKIP_RECORDED_SET_FORBIDDEN');
  ensureDeviationStores(execution);
  const entry={blockId:step.blockId||null,exerciseId:step.exerciseId,setNumber:step.setNumber,reason:safeReason,at:now(),actor:actorSnapshot(actor)};`,
'skip scoped set');

execution=replaceOnce(execution,
`  const currentKey=resultKey(item.exerciseId,execution.setIndex+1);
  const firstIndex=execution.results[currentKey]?execution.setIndex+1:execution.setIndex;
  if(firstIndex>=item.sets)throw new Error('M26_EXECUTION_SKIP_EXERCISE_NOTHING_REMAINING');
  for(let i=firstIndex;i<item.sets;i+=1){
    const setNumber=i+1;
    const key=resultKey(item.exerciseId,setNumber);
    execution.skippedSets[key]={exerciseId:item.exerciseId,setNumber,reason:safeReason,at:now(),actor:actorSnapshot(actor),source:'exercise_skip'};
  }
  const deviation={exerciseId:item.exerciseId,fromSetNumber:firstIndex+1,toSetNumber:item.sets,reason:safeReason,at:now(),actor:actorSnapshot(actor)};`,
`  const currentStepSnapshot={...item,setNumber:execution.setIndex+1,totalSets:item.sets};
  const firstIndex=executionResultForStep(execution,currentStepSnapshot)?execution.setIndex+1:execution.setIndex;
  if(firstIndex>=item.sets)throw new Error('M26_EXECUTION_SKIP_EXERCISE_NOTHING_REMAINING');
  for(let i=firstIndex;i<item.sets;i+=1){
    const setNumber=i+1;
    const key=resultKey(item.exerciseId,setNumber,item.blockId||null);
    execution.skippedSets[key]={blockId:item.blockId||null,exerciseId:item.exerciseId,setNumber,reason:safeReason,at:now(),actor:actorSnapshot(actor),source:'exercise_skip'};
  }
  const deviation={blockId:item.blockId||null,exerciseId:item.exerciseId,fromSetNumber:firstIndex+1,toSetNumber:item.sets,reason:safeReason,at:now(),actor:actorSnapshot(actor)};`,
'skip scoped exercise');

fs.writeFileSync(executionPath,execution);

const uiPath='src/m26/workflows/session-ui.js';
let ui=fs.readFileSync(uiPath,'utf8');
ui=replaceOnce(ui,
`import { currentStep,previousSetDraftValues } from './session-execution.js';`,
`import { currentStep,executionResultForStep,previousSetDraftValues } from './session-execution.js';`,
'ui import');
ui=replaceOnce(ui,
`  const rows=Object.values(execution?.results||{})
    .filter((result)=>
      result?.exerciseId===step?.exerciseId&&
      Number(result?.setNumber)>=1&&
      Number(result?.setNumber)<=totalSets
    )
    .sort((a,b)=>Number(a.setNumber)-Number(b.setNumber));`,
`  const rows=Array.from({length:totalSets},(_,index)=>executionResultForStep(execution,step,index+1))
    .filter(Boolean)
    .sort((a,b)=>Number(a.setNumber)-Number(b.setNumber));`,
'ui occurrence history');
fs.writeFileSync(uiPath,ui);

const testPath='tests/m26_session_duplicate_exercise_occurrence.test.mjs';
fs.writeFileSync(testPath,`import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceExecution,
  createExecution,
  currentStep,
  executionResultForStep,
  previousSetDraftValues,
  recordSet,
  skipExecutionExercise,
  skipExecutionSet,
  startExecution,
} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const exercise={id:'exercise-duplicate',name_es:'Sentadilla duplicada',pattern:'squat',cues:[]};
const catalog={
  get(id){return id===exercise.id?exercise:null;},
  search(){return [exercise];},
};
function makeSession({sets=2}={}){
  return {
    id:'session-duplicate-occurrence',clientId:'client-1',title:'Sesión duplicada',durationMinutes:45,status:'published',
    blocks:[
      {type:'exercise',id:'block-first',exerciseId:exercise.id,sets,reps:'10',restSeconds:60,tempo:'3-1-1',targetRpe:8,targetRir:2},
      {type:'exercise',id:'block-second',exerciseId:exercise.id,sets,reps:'8',restSeconds:60,tempo:'2-1-1',targetRpe:8,targetRir:2},
    ],
  };
}
function makeExecution(options){
  const session=makeSession(options);
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-duplicate'});
  startExecution(execution);
  return {session,execution};
}
function render(session,execution){return renderGuidedExecution({execution,session,catalog,mediaMap:null,role:'client'});}

test('duplicated exercise occurrences keep independent recorded sets and current history',()=>{
  const {session,execution}=makeExecution();
  recordSet(execution,session,{reps:10,load:'80 kg',rpe:8,rir:2,notes:'primera ocurrencia'});
  advanceExecution(execution);
  recordSet(execution,session,{reps:9,load:'82 kg',rpe:8.5,rir:1});
  advanceExecution(execution);

  assert.equal(currentStep(execution,session).blockId,'block-second');
  const before=render(session,execution);
  assert.doesNotMatch(before,/data-session-current-exercise-history/);
  assert.doesNotMatch(before,/80 kg/);
  assert.doesNotMatch(before,/82 kg/);

  assert.doesNotThrow(()=>recordSet(execution,session,{reps:8,load:'70 kg',rpe:7.5,rir:3,notes:'segunda ocurrencia'}));
  const keys=Object.keys(execution.results);
  assert.equal(keys.length,3);
  assert.ok(keys.some((key)=>key.includes('block-first')));
  assert.ok(keys.some((key)=>key.includes('block-second')));
  assert.equal(execution.results[keys.find((key)=>key.includes('block-second'))].blockId,'block-second');

  const html=render(session,execution);
  assert.match(html,/data-session-current-exercise-history/);
  assert.match(html,/70 kg/);
  assert.doesNotMatch(html,/80 kg/);
  assert.doesNotMatch(html,/82 kg/);
  assert.doesNotMatch(html,/primera ocurrencia/);
  assert.doesNotMatch(html,/segunda ocurrencia/);

  advanceExecution(execution);
  assert.deepEqual(previousSetDraftValues(execution),{reps:'8',seconds:'',load:'70 kg',rpe:'7.5',rir:'3'});
  recordSet(execution,session,{reps:7,load:'72 kg',rpe:8,rir:2});
  assert.equal(Object.keys(execution.results).length,4);
});

test('a skipped set in the first occurrence does not resolve the duplicated occurrence',()=>{
  const {session,execution}=makeExecution();
  skipExecutionSet(execution,session,{reason:'Molestia puntual'});
  skipExecutionExercise(execution,session,{reason:'Cerrar primer bloque'});
  assert.equal(currentStep(execution,session).blockId,'block-second');
  assert.throws(()=>advanceExecution(execution),/M26_EXECUTION_SET_NOT_RECORDED/);
  assert.doesNotThrow(()=>recordSet(execution,session,{reps:8,load:'65 kg',rpe:7,rir:3}));
  assert.doesNotThrow(()=>advanceExecution(execution));
});

test('legacy result keys are attributed only to the earliest compatible occurrence',()=>{
  const {session,execution}=makeExecution({sets:1});
  execution.results[\`${exercise.id}:1\`]={exerciseId:exercise.id,setNumber:1,reps:10,seconds:null,load:'75 kg',rpe:8,rir:2,notes:'',completedAt:new Date().toISOString()};

  const first=currentStep(execution,session);
  assert.equal(executionResultForStep(execution,first)?.load,'75 kg');
  assert.doesNotThrow(()=>advanceExecution(execution));

  const second=currentStep(execution,session);
  assert.equal(second.blockId,'block-second');
  assert.equal(executionResultForStep(execution,second),null);
  assert.throws(()=>advanceExecution(execution),/M26_EXECUTION_SET_NOT_RECORDED/);
  assert.doesNotThrow(()=>recordSet(execution,session,{reps:8,load:'68 kg',rpe:7,rir:3}));
  assert.equal(Object.keys(execution.results).length,2);
  assert.equal(render(session,execution).includes('75 kg'),false);
});
`);
