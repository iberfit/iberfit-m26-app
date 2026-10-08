import test from 'node:test';
import assert from 'node:assert/strict';
import {renderGuidedExecution,renderCoachCompletionEvidence} from '../src/m26/workflows/session-ui.js';

const clientId='synthetic-recap-client';
const queue=[
 {blockId:'first-block',exerciseId:'squat',sets:2,prescription:{reps:'8-12',plannedLoad:'10 kg',targetRpe:7,targetRir:2}},
 {blockId:'second-block',exerciseId:'squat',sets:1,prescription:{reps:'6',plannedLoad:'20 kg',targetRpe:8,targetRir:1}},
 {blockId:'group-1',exerciseId:'row',sets:2,groupType:'biserie',prescription:{reps:'10',targetRpe:null,targetRir:null}},
];
const session={id:'session-recap',clientId,title:'Entreno real',blocks:[
 {id:'first-block',type:'exercise',exerciseId:'squat',name:'Sentadilla A'},
 {id:'second-block',type:'exercise',exerciseId:'squat',name:'Sentadilla B'},
 {id:'group-1',type:'biserie',exerciseIds:['row']},
]};
const catalog={get:(id)=>id==='row'?{name_es:'Remo'}:null};
function fixture(overrides={}){return {id:'execution-recap',clientId,sessionId:session.id,status:'completed',syncStatus:'clean',
 queue,results:{
  'first-block:squat:1':{setNumber:1,reps:10,load:'10 kg',rpe:7,rir:2,notes:'Rodilla <avisar>'},
  'first-block:squat:2':{setNumber:2,reps:11,load:'11 kg',rpe:7,rir:1},
  'second-block:squat:1':{setNumber:1,reps:6,load:'20 kg',rpe:8,rir:1},
  'group-1:row:1':{setNumber:1,reps:10,load:'5 kg',rpe:8,rir:2},
 },events:[],feedback:{sessionRpe:7,comment:'Confirmado',pain:false},
 planSnapshot:{sessionId:session.id,blocks:session.blocks,queue},...overrides};}

test('records are matched by block occurrence even when an exercise repeats',()=>{
 const html=renderCoachCompletionEvidence(fixture(),session,catalog);
 assert.match(html,/data-completion-evidence-block="first-block"[\s\S]*?2 de 2 series registradas/u);
 assert.match(html,/data-completion-evidence-block="second-block"[\s\S]*?1 de 1 series registradas/u);
 assert.match(html,/Sentadilla A/u);assert.match(html,/Sentadilla B/u);
 assert.match(html,/Remo/u);
 assert.match(html,/Carga 10 kg/u);
});
test('missing sets stay unrecorded and missing effort is not inferred',()=>{
 const html=renderCoachCompletionEvidence(fixture(),session,catalog);
 assert.match(html,/1 de 2 series registradas/u);
 assert.match(html,/1 serie sin registro; no se considera realizada ni omitida/u);
 const row=html.match(/data-completion-evidence-block="group-1"[\s\S]*?<\/li>/u)?.[0];
 assert.ok(row);assert.doesNotMatch(row,/RPE 0|RIR 0/u);
});
test('recorded notes are escaped and original data is unchanged',()=>{
 const execution=fixture(),before=structuredClone(execution);
 const html=renderCoachCompletionEvidence(execution,session,catalog);
 assert.match(html,/Rodilla &lt;avisar&gt;/u);
 assert.doesNotMatch(html,/<avisar>/u);
 assert.deepEqual(execution,before);
});
test('client does not receive Coach-only plan versus recorded detail',()=>{
 const ex=fixture();
 const coach=renderGuidedExecution({execution:ex,session,catalog,role:'coach'});
 const client=renderGuidedExecution({execution:ex,session,catalog,role:'client'});
 assert.match(coach,/data-coach-completion-evidence/u);
 assert.doesNotMatch(client,/data-coach-completion-evidence/u);
});
test('historical plan snapshot wins over later modifications to the live session',()=>{
 const ex=fixture();
 const changed={...session,blocks:[{id:'first-block',type:'exercise',exerciseId:'squat',name:'Renombrado hoy'}]};
 const html=renderCoachCompletionEvidence(ex,changed,catalog);
 assert.match(html,/Sentadilla A/u);assert.doesNotMatch(html,/Renombrado hoy/u);
});
test('empty or malformed queue renders no invented evidence',()=>{
 assert.equal(renderCoachCompletionEvidence({queue:[]},session,catalog),'');
 assert.equal(renderCoachCompletionEvidence({queue:null},session,catalog),'');
});

test('the original prescription survives substitution, partial work and additional sets',()=>{
 const ex=fixture();
 ex.queue=structuredClone(queue);
 ex.queue[0].sets=1;
 ex.queue.splice(1,0,{...structuredClone(queue[0]),exerciseId:'lunge',sets:2,substitutedFromExerciseId:'squat'});
 ex.results={
  'first-block:squat:1':{setNumber:1,reps:8,rpe:7},
  'first-block:lunge:1':{setNumber:1,reps:6,rpe:8},
 };
 const extendedCatalog={get:(id)=>id==='lunge'?{name_es:'Zancadas'}:catalog.get(id)};
 const html=renderCoachCompletionEvidence(ex,session,extendedCatalog);
 const slot=html.match(/data-completion-evidence-block="first-block"[\s\S]*?(?=<\/li>\s*<li class="m26-session-completion-evidence-item")/u)?.[0];
 assert.ok(slot);
 assert.match(slot,/2 de 3 series registradas/u);
 assert.match(slot,/Previsto:[\s\S]*?2 series/u);
 assert.match(slot,/Sustitución registrada: Sentadilla A → Sentadilla A \/ Zancadas/u);
 assert.match(slot,/1 serie adicional respecto del plan original/u);
 assert.equal((html.match(/data-completion-evidence-block="first-block"/gu)||[]).length,1);
});
test('explicit omissions are distinguished from empty or unrecorded work',()=>{
 const ex=fixture();
 ex.results=structuredClone(ex.results);
 delete ex.results['second-block:squat:1'];
 ex.results['first-block:squat:2']={};
 ex.skippedSets={'second-block:squat:1':{reason:'Fatiga confirmada'}};
 const html=renderCoachCompletionEvidence(ex,session,catalog);
 assert.match(html,/Omitida explícitamente/u);
 assert.match(html,/Fatiga confirmada/u);
 assert.match(html,/1 serie omitida expresamente/u);
 assert.match(html,/1 de 2 series registradas/u);
 assert.match(html,/1 serie sin registro; no se considera realizada ni omitida/u);
 assert.doesNotMatch(html,/Serie registrada<\/strong>/u);
});
