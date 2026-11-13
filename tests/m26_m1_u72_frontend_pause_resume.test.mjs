import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOccurrenceWorkoutDraft,buildOccurrenceWorkoutCommand,applyOccurrenceWorkoutAck,rehydrateOccurrenceWorkoutDraft} from '../src/m26/workflows/occurrence-workout-draft.js';
import {buildOccurrenceScopedCommand} from '../src/m26/domain/occurrence-commands.js';
import {M26_ACTION_REGISTRY} from '../src/m26/ui/interactive-audit.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';
const C='10000000-0000-4000-8000-000000000102',S='10000000-0000-4000-8000-000000000103',O='10000000-0000-4000-8000-000000000105',E='10000000-0000-4000-8000-000000000107';
const op=n=>'10000000-0000-4000-8000-0000000001'+String(n).padStart(2,'0');
const blocks=[{id:'base',type:'exercise',exerciseId:'squat',sets:1,reps:'8'}];
const queue=[{blockId:'base',exerciseId:'squat',sets:1,prescription:{reps:'8'}}];
const source={clientId:C,sessionId:S,blocks,queue};
const occurrence={id:O,clientId:C,sessionId:S,localDate:'2026-11-12',timeZone:'America/Santiago',status:'confirmada',revision:1,executionId:null};
const ack=(cmd,rev,execRev,x={})=>({kind:'ack',operationId:cmd.operationId,entityId:O,executionId:E,status:'en_curso',remoteRevision:rev,executionRevision:execRev,...x});
test('U72 date pause and resume need exact independent CAS and server ACK',()=>{
 const d=createOccurrenceWorkoutDraft({occurrence,prescriptionSnapshot:source,executionId:E});
 const start=buildOccurrenceWorkoutCommand(d,{action:'start',operationId:op(10)});
 applyOccurrenceWorkoutAck(d,start,ack(start,2,1));
 const pause=buildOccurrenceWorkoutCommand(d,{action:'pause',operationId:op(11)});
 assert.equal(pause.type,'OCURRENCIA_PAUSAR');assert.deepEqual(Object.keys(pause.payload),['executionId','executionBaseRevision']);
 assert.equal(pause.payload.executionBaseRevision,1);assert.equal(d.execution.status,'active');
 assert.throws(()=>applyOccurrenceWorkoutAck(d,pause,ack(pause,2,2,{executionStatus:'en_curso',accumulatedActiveMs:1200,activeSince:null})),/ACK_U72_CLOCK_INVALID/);
 assert.equal(d.execution.status,'active');
 applyOccurrenceWorkoutAck(d,pause,ack(pause,2,2,{executionStatus:'pausada',accumulatedActiveMs:1200,activeSince:null,serverAt:'2026-11-12T12:00:03Z'}));
 assert.equal(d.execution.status,'paused');assert.equal(d.execution.accumulatedActiveMs,1200);
 assert.throws(()=>buildOccurrenceWorkoutCommand(d,{action:'progress',operationId:op(12)}),/PROGRESS_NOT_READY/);
 const resume=buildOccurrenceWorkoutCommand(d,{action:'resume',operationId:op(12)});
 assert.equal(resume.payload.executionBaseRevision,2);
 applyOccurrenceWorkoutAck(d,resume,ack(resume,2,3,{executionStatus:'en_curso',accumulatedActiveMs:1200,activeSince:'2026-11-12T12:01:00Z'}));
 assert.equal(d.execution.status,'active');assert.equal(d.execution.activeSince,'2026-11-12T12:01:00Z');
 assert.equal(d.occurrenceRevision,2);assert.equal(d.executionRevision,3);
});
test('U72 paused private rehydration retains server clock and owner scope',()=>{
 const body={id:E,clientId:C,sessionId:S,occurrenceId:O,status:'pausada',revision:2,
  startedAt:'2026-11-12T12:00:00Z',pausedAt:'2026-11-12T12:00:03Z',activeSince:null,accumulatedActiveMs:3000,
  sourceSnapshot:source,queue,results:{},skippedSets:{},events:[]};
 const d=rehydrateOccurrenceWorkoutDraft({occurrence:{...occurrence,status:'en_curso',revision:2,executionId:E},prescriptionSnapshot:source,executionBody:body});
 assert.equal(d.execution.status,'paused');assert.equal(d.execution.accumulatedActiveMs,3000);assert.equal(d.execution.activeSince,null);
});
test('U72 exact command fields and translated Coach Client UI controls',()=>{
 const cmd=buildOccurrenceScopedCommand({type:'OCURRENCIA_PAUSAR',operationId:op(13),clientId:C,occurrenceId:O,baseRevision:2,executionId:E,executionBaseRevision:3});
 assert.deepEqual(Object.keys(cmd.payload),['executionId','executionBaseRevision']);
 assert.equal(Object.isFrozen(cmd.payload),true);
 const ui=readFileSync(new URL('../src/m26/workflows/occurrence-qa-ui.js',import.meta.url),'utf8');
 for(const action of ['pause','resume']){
  assert.deepEqual(M26_ACTION_REGISTRY['u60-'+action].roles,['coach','client']);
  assert.ok(ui.includes('data-iberdates-action="u60-'+action+'"'));
  assert.ok(ui.includes('await runtime.workout.'+action+'()'));
 }
 for(const label of ['Pausar entrenamiento','Reanudar entrenamiento','Tiempo activo confirmado']){
  for(const language of ['en','fr','pt'])assert.notEqual(iberfitSurfaceTranslate(label,{language}),label);
 }
 assert.match(ui,/data-u60-paused/u);
});
