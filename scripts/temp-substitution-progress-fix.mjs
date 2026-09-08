import fs from 'node:fs';

function replaceOnce(text,from,to,label){
  const count=text.split(from).length-1;
  if(count!==1)throw new Error(`${label}: expected 1 match, got ${count}`);
  return text.replace(from,to);
}

const sourcePath='src/m26/workflows/session-execution.js';
let source=fs.readFileSync(sourcePath,'utf8');
source=replaceOnce(source,
`export function substituteExercise(execution,session,{fromExerciseId,toExerciseId,catalog,reason,actor=null}={}){
  const safeReason=requireReason(reason,'M26_EXECUTION_SUBSTITUTION_REASON_REQUIRED');`,
`function occurrenceHasResolvedSet(execution,item){
  if(!item)return false;
  for(let setNumber=1;setNumber<=Number(item.sets||0);setNumber+=1){
    const step={...item,setNumber,totalSets:item.sets};
    if(executionResultForStep(execution,step,setNumber)||skippedSetForStep(execution,step,setNumber))return true;
  }
  return false;
}
export function substituteExercise(execution,session,{fromExerciseId,toExerciseId,catalog,reason,actor=null}={}){
  const safeReason=requireReason(reason,'M26_EXECUTION_SUBSTITUTION_REASON_REQUIRED');`,
'add occurrence progress guard');
source=replaceOnce(source,
`  const item=execution.queue[itemIndex];
  if(itemIndex===execution.index){
    const step={...item,setNumber:execution.setIndex+1,totalSets:item.sets};
    if(executionResultForStep(execution,step))throw new Error('M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED');
    clearActiveSetDraft(execution);
  }
  item.exerciseId=toExerciseId;`,
`  const item=execution.queue[itemIndex];
  if(itemIndex===execution.index){
    if(occurrenceHasResolvedSet(execution,item))throw new Error('M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED');
    clearActiveSetDraft(execution);
  }
  item.exerciseId=toExerciseId;`,
'protect current occurrence after any resolved set');
fs.writeFileSync(sourcePath,source);

const testPath='tests/m26_session_substitution_progress.test.mjs';
fs.writeFileSync(testPath,`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport {createExerciseCatalog} from '../src/m26/exercises/catalog.js';\nimport {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';\nimport {createExecution,startExecution,recordSet,advanceExecution,skipExecutionSet,substituteExercise} from '../src/m26/workflows/session-execution.js';\n\nconst data=JSON.parse(fs.readFileSync(new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url)));\nconst catalog=createExerciseCatalog(data);\nfunction setup(){\n  const session=createSessionDraft({clientId:'c-substitution'});\n  const from=catalog.list()[0].id;\n  const to=catalog.list()[1].id;\n  addCatalogExercise(session,from,catalog,{sets:2,reps:'10'});\n  const execution=createExecution({session,clientId:'c-substitution',executionId:'exec-substitution'});\n  return {session,execution,from,to};\n}\n\ntest('substitution remains allowed before the occurrence has progress',()=>{\n  const {session,execution,from,to}=setup();\n  substituteExercise(execution,session,{fromExerciseId:from,toExerciseId:to,catalog,reason:'Alternativa previa'});\n  assert.equal(execution.queue[0].exerciseId,to);\n});\n\ntest('substitution is blocked after an earlier set was recorded',()=>{\n  const {session,execution,from,to}=setup();\n  startExecution(execution);\n  recordSet(execution,session,{reps:10,rpe:7});\n  advanceExecution(execution);\n  assert.equal(execution.setIndex,1);\n  assert.throws(()=>substituteExercise(execution,session,{fromExerciseId:from,toExerciseId:to,catalog,reason:'Cambio tardío'}),/M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED/);\n  assert.equal(execution.queue[0].exerciseId,from);\n  assert.ok(execution.results[from+':1']);\n});\n\ntest('substitution is blocked after an earlier set was explicitly skipped',()=>{\n  const {session,execution,from,to}=setup();\n  startExecution(execution);\n  skipExecutionSet(execution,session,{reason:'Molestia puntual'});\n  assert.equal(execution.setIndex,1);\n  assert.throws(()=>substituteExercise(execution,session,{fromExerciseId:from,toExerciseId:to,catalog,reason:'Cambio tardío'}),/M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED/);\n  assert.equal(execution.queue[0].exerciseId,from);\n  assert.ok(execution.skippedSets[from+':1']);\n});\n`);
