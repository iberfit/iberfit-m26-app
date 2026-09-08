import fs from 'node:fs';

function replaceOnce(text,from,to,label){
  const count=text.split(from).length-1;
  if(count!==1)throw new Error(`${label}: expected 1 match, got ${count}`);
  return text.replace(from,to);
}

const sourcePath='src/m26/workflows/session-execution.js';
let source=fs.readFileSync(sourcePath,'utf8');

source=replaceOnce(source,
`function canUseLegacyEntry(execution,step,setNumber){
  if(!step?.blockId)return true;
  const occurrenceIndex=(execution?.queue||[]).findIndex((item)=>item?.blockId===step.blockId&&item?.exerciseId===step.exerciseId);
  const firstCompatibleIndex=(execution?.queue||[]).findIndex((item)=>item?.exerciseId===step.exerciseId&&Number(item?.sets||0)>=Number(setNumber));
  return occurrenceIndex>=0&&occurrenceIndex===firstCompatibleIndex;
}
function storedEntry`,
`function canUseLegacyEntry(execution,step,setNumber){
  if(!step?.blockId)return true;
  const occurrenceIndex=(execution?.queue||[]).findIndex((item)=>item?.blockId===step.blockId&&item?.exerciseId===step.exerciseId);
  const firstCompatibleIndex=(execution?.queue||[]).findIndex((item)=>item?.exerciseId===step.exerciseId&&Number(item?.sets||0)>=Number(setNumber));
  return occurrenceIndex>=0&&occurrenceIndex===firstCompatibleIndex;
}
function requiresScopedEntry(execution,step,setNumber=step?.setNumber){
  if(!step?.blockId||!step?.exerciseId)return false;
  const targetSet=Number(setNumber);
  if(!Number.isInteger(targetSet)||targetSet<1)return false;
  const compatible=(execution?.queue||[]).filter((item)=>item?.exerciseId===step.exerciseId&&Number(item?.sets||0)>=targetSet);
  return compatible.length>1;
}
function storageKeyForStep(execution,step,setNumber=step?.setNumber){
  return resultKey(step.exerciseId,setNumber,requiresScopedEntry(execution,step,setNumber)?step.blockId||null:null);
}
function storedEntry`,
'add scoped storage helpers');

source=replaceOnce(source,
`  return {
    blockId:step.blockId||null,
    exerciseId:step.exerciseId,`,
`  return {
    exerciseId:step.exerciseId,`,
'preserve result value shape');

source=replaceOnce(source,
`  const key=resultKey(step.exerciseId,step.setNumber,step.blockId||null);
  if(executionResultForStep(execution,step))throw new Error('M26_EXECUTION_SET_ALREADY_RECORDED');`,
`  const key=storageKeyForStep(execution,step);
  if(executionResultForStep(execution,step))throw new Error('M26_EXECUTION_SET_ALREADY_RECORDED');`,
'record storage key');

source=replaceOnce(source,
`  const key=resultKey(step.exerciseId,step.setNumber,step.blockId||null);
  const previous=previousEntry.value;`,
`  const key=storageKeyForStep(execution,step);
  const previous=previousEntry.value;`,
'correct storage key');

source=replaceOnce(source,
`  const key=resultKey(step.exerciseId,step.setNumber,step.blockId||null);
  if(executionResultForStep(execution,step))throw new Error('M26_EXECUTION_SKIP_RECORDED_SET_FORBIDDEN');
  ensureDeviationStores(execution);
  const entry={blockId:step.blockId||null,exerciseId:step.exerciseId,setNumber:step.setNumber,reason:safeReason,at:now(),actor:actorSnapshot(actor)};`,
`  const scoped=requiresScopedEntry(execution,step);
  const key=storageKeyForStep(execution,step);
  if(executionResultForStep(execution,step))throw new Error('M26_EXECUTION_SKIP_RECORDED_SET_FORBIDDEN');
  ensureDeviationStores(execution);
  const entry={...(scoped?{blockId:step.blockId||null}:{}),exerciseId:step.exerciseId,setNumber:step.setNumber,reason:safeReason,at:now(),actor:actorSnapshot(actor)};`,
'skip set storage');

source=replaceOnce(source,
`  for(let i=firstIndex;i<item.sets;i+=1){
    const setNumber=i+1;
    const key=resultKey(item.exerciseId,setNumber,item.blockId||null);
    execution.skippedSets[key]={blockId:item.blockId||null,exerciseId:item.exerciseId,setNumber,reason:safeReason,at:now(),actor:actorSnapshot(actor),source:'exercise_skip'};
  }
  const deviation={blockId:item.blockId||null,exerciseId:item.exerciseId,fromSetNumber:firstIndex+1,toSetNumber:item.sets,reason:safeReason,at:now(),actor:actorSnapshot(actor)};`,
`  let scopedOccurrence=false;
  for(let i=firstIndex;i<item.sets;i+=1){
    const setNumber=i+1;
    const step={...item,setNumber,totalSets:item.sets};
    const scoped=requiresScopedEntry(execution,step,setNumber);
    const key=storageKeyForStep(execution,step,setNumber);
    scopedOccurrence=scopedOccurrence||scoped;
    execution.skippedSets[key]={...(scoped?{blockId:item.blockId||null}:{}),exerciseId:item.exerciseId,setNumber,reason:safeReason,at:now(),actor:actorSnapshot(actor),source:'exercise_skip'};
  }
  const deviation={...(scopedOccurrence?{blockId:item.blockId||null}:{}),exerciseId:item.exerciseId,fromSetNumber:firstIndex+1,toSetNumber:item.sets,reason:safeReason,at:now(),actor:actorSnapshot(actor)};`,
'skip exercise storage');

fs.writeFileSync(sourcePath,source);

const testPath='tests/m26_session_duplicate_exercise_occurrence.test.mjs';
let test=fs.readFileSync(testPath,'utf8');
test=replaceOnce(test,
`  assert.ok(keys.some((key)=>key.includes('block-first')));
  assert.ok(keys.some((key)=>key.includes('block-second')));
  assert.equal(execution.results[keys.find((key)=>key.includes('block-second'))].blockId,'block-second');`,
`  assert.ok(keys.includes('block-first:'+exercise.id+':1'));
  assert.ok(keys.includes('block-second:'+exercise.id+':1'));
  assert.equal(execution.results['block-second:'+exercise.id+':1'].exerciseId,exercise.id);
  assert.equal(Object.hasOwn(execution.results['block-second:'+exercise.id+':1'],'blockId'),false);`,
'assert scoped key rather than stored blockId');

test += `\n\ntest('unambiguous exercise keeps the legacy result and skip storage contract',()=>{\n  const session=makeSession();\n  session.blocks=[session.blocks[0]];\n  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-legacy-contract'});\n  startExecution(execution);\n  recordSet(execution,session,{reps:10,load:'60 kg',rpe:7,rir:3});\n  assert.deepEqual(Object.keys(execution.results),[exercise.id+':1']);\n  assert.equal(Object.hasOwn(execution.results[exercise.id+':1'],'blockId'),false);\n  advanceExecution(execution);\n  skipExecutionSet(execution,session,{reason:'Ajuste puntual'});\n  assert.ok(Object.hasOwn(execution.skippedSets,exercise.id+':2'));\n  assert.equal(Object.hasOwn(execution.skippedSets[exercise.id+':2'],'blockId'),false);\n});\n`;
fs.writeFileSync(testPath,test);
