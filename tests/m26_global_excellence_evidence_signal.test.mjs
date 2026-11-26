import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceNumber,currentWearableEvidence} from '../src/m26/domain/evidence-signal.js';
import {buildIberfitDecisionBrief} from '../src/m26/intelligence/decision-brief.js';
import {buildAdherenceWindows} from '../src/m26/engagement/progress-continuity.js';

test('GX06 rejects coercion and non-decimal strings without losing measured zero',()=>{
  for(const value of [null,undefined,true,false,[],[2],{},'', '  ','0x7','0b11','Infinity','NaN',Infinity,NaN]){
    assert.equal(evidenceNumber(value),null,String(value));
  }
  assert.equal(evidenceNumber(0),0);
  assert.equal(evidenceNumber('7.5',{min:1,max:10}),7.5);
  assert.equal(evidenceNumber('1.5',{integer:true}),null);
  assert.equal(evidenceNumber(-1,{min:0}),null);
});
test('GX19 wearable needs eligible current days and a single explicit provider',()=>{
  const wearable={daysWithData:3,decision:{eligible:true,currentEvidenceDays:2,providers:['health_connect']}};
  assert.deepEqual(currentWearableEvidence(wearable),{eligible:true,days:2,availableDays:3,provider:'health_connect',quality:'limitada'});
  for(const decision of [{providers:['a','b']},{providers:[' ']},{currentEvidenceDays:'0x2'},{currentEvidenceDays:4},{eligible:false}]){
    const bad={...wearable,decision:{...wearable.decision,...decision}};
    assert.equal(currentWearableEvidence(bad).days,null);
    assert.equal(buildIberfitDecisionBrief({summary:{wearable:bad}}).signals.some(x=>x.includes('datos actuales de dispositivo')),false);
  }
  assert.equal(currentWearableEvidence(null).availableDays,null);
});
test('GX07 unknown planning does not imply a confirmed absence of sessions',()=>{
  const unknown=buildIberfitDecisionBrief({summary:{averageRpe:'0x7'}});
  assert.match(unknown.nextStep,/Confirmar si existe planificación/u);
  assert.equal(unknown.signals.some(x=>x.includes('RPE medio confirmado')),false);
  const knownEmpty=buildIberfitDecisionBrief({summary:{plannedSessions:0}});
  assert.match(knownEmpty.nextStep,/Revisar la planificación/u);
});
test('GX10 legacy booked count absence stays unknown while real zero stays zero',()=>{
  const state={collections:{}};
  const legacy={clientId:'c1',days:28,plannedSessions:0,completedSessions:0,adherence:null};
  const [unknown]=buildAdherenceWindows(state,'c1',{windows:[28],summaries:{28:legacy}});
  assert.equal(unknown.completedSessions,null);
  assert.equal(unknown.unconfirmedExecutions,null);
  const [known]=buildAdherenceWindows(state,'c1',{windows:[28],summaries:{28:{...legacy,scheduledCompletedSessions:0,unconfirmedExecutions:0}}});
  assert.equal(known.completedSessions,0);
  assert.equal(known.unconfirmedExecutions,0);
  assert.equal(known.adherence,null);
});

import {buildExercisePerformanceMemory,listExercisePerformanceMemories} from '../src/m26/engagement/exercise-performance-engine.js';
test('GX09 uses one confirmed dated revision per execution and excludes conflicts and future sessions',()=>{
  const now=new Date('2026-11-25T12:00:00Z');
  const entry=(id,revision,loadKg,extra={})=>({id,revision,clientId:'c1',status:'completed',
    syncStatus:'clean',completedAt:'2026-11-24T12:00:00Z',
    results:{x:{exerciseId:'squat',reps:8,loadKg}},...extra});
  const latest=entry('e1',2,50);
  const state={collections:{sessionExecutions:[
    entry('e1',1,40),latest,{...latest},
    entry('e2',1,60),entry('e2',1,65),
    entry('future',1,80,{completedAt:'2026-11-26T12:00:00Z'}),
    entry('created',1,90,{completedAt:null,createdAt:'2026-11-24T12:00:00Z'}),
    entry('skipped',1,100,{results:{x:{exerciseId:'squat',reps:8,loadKg:100,skipped:true}}}),
    entry('other',1,110,{clientId:'c2'}),
  ]}};
  const memory=buildExercisePerformanceMemory(state,'c1','squat',{now});
  assert.equal(memory.exposureCount,1);
  assert.equal(memory.excludedConflictingExposures,1);
  assert.equal(memory.latest.executionId,'e1');
  const [fromList]=listExercisePerformanceMemories(state,'c1',{now});
  assert.deepEqual(fromList,memory);
});

import {selectInitialIriBaseline} from '../src/m26/workflows/iri-2-longitudinal.js';
import {buildPremiumReportPortfolio} from '../src/m26/workflows/report-workflow.js';
import {buildNextSessionPreparation} from '../src/m26/intelligence/next-session-prep.js';
import {buildProgressHub,buildPeriodProgressEvidence} from '../src/m26/engagement/progress-hub.js';

test('GX11/GX14 one confirmed initial diagnosis is shared by Coach and report',()=>{
  const now=new Date('2026-11-25T12:00:00Z');
  const base={clientId:'c1',status:'confirmed',assessmentType:'inicial',stepFinalHr:150,stepOneMinuteHr:120};
  const rows=[
    {...base,id:'negative',status:'unconfirmed',assessmentDate:'2026-06-01'},
    {...base,id:'undated',createdAt:'2026-06-02'},
    {...base,id:'foreign',clientId:'c2',assessmentDate:'2026-06-03'},
    {...base,id:'pending',syncStatus:'pending',assessmentDate:'2026-06-04'},
    {...base,id:'contradictory',body:{assessmentKind:'evolution-followup'},assessmentDate:'2026-06-05'},
    {...base,id:'original',assessmentDate:'2026-07-01'},
    {...base,id:'later',assessmentDate:'2026-10-01'},
    {...base,id:'future',assessmentDate:'2026-11-26'},
  ];
  const state={collections:{iriAssessments:rows}};
  assert.equal(selectInitialIriBaseline(rows,'c1',{now}).id,'original');
  assert.equal(buildNextSessionPreparation(state,'c1',{now}).iri.assessmentId,'original');
  const report=buildPremiumReportPortfolio(state,'c1',{now}).find(x=>x.id==='iri');
  assert.equal(report.sourceId,'original');assert.equal(report.ready,true);
});
test('GX09/GX26 the recent strength indicator cannot borrow old or future observations',()=>{
  const now=new Date('2026-11-25T12:00:00Z');
  const row=(id,date,loadKg)=>({id,clientId:'c1',status:'completed',syncStatus:'clean',completedAt:date,results:{a:{exerciseId:'squat',reps:8,loadKg}}});
  const old=[row('old1','2026-09-10T12:00:00Z',30),row('old2','2026-10-10T12:00:00Z',40)];
  const state={collections:{sessionExecutions:[...old,row('recent','2026-11-20T12:00:00Z',50),row('future','2026-11-26T12:00:00Z',60)]}};
  const hub=buildProgressHub(state,'c1',{now,loadDirectionForExercise:()=> 'higher-is-better'});
  assert.equal(hub.pillars.find(x=>x.id==='strength').status,'insufficient');
  assert.equal(buildExercisePerformanceMemory(state,'c1','squat',{now,from:'2026-10-28'}).exposureCount,1);
  assert.equal(buildPeriodProgressEvidence(state,'c1',{now,days:30,executions:old}).some(x=>x.id==='strength'),false);
});

import {observedLoadKg,observedSet} from '../src/m26/domain/evidence-signal.js';
import {computeProgressSummary,buildExerciseLongitudinalProgress} from '../src/m26/engagement/progress-engine.js';
import {buildPostSessionSportEvidence} from '../src/m26/workflows/report-sport-evidence.js';
import {buildPeriodizationSnapshot} from '../src/m26/planning/periodization-workbench.js';
import {reconcileSessionExecutionsForClient} from '../src/m26/domain/session-execution-truth.js';

test('GX06/GX14 shared measured kg preserves zero, rejects inconsistent units and omitted sets',()=>{
  assert.equal(observedLoadKg({load:'0 kg'}),0);
  assert.equal(observedLoadKg({load:'22,5 kg'}),22.5);
  assert.equal(observedLoadKg({load:20,loadUnit:'kg'}),20);
  for(const row of [{load:'20'},{load:[20],loadUnit:'kg'},{loadKg:20,load:'30 kg'},{loadKg:20,load:'30 lb'},{loadKg:20,loadLb:44},{loadKg:'0x20'},{loadKg:-1},{loadKg:20,skipped:true},{loadKg:20,status:'pending'}]){
    assert.equal(observedLoadKg(row),null,JSON.stringify(row));
  }
  assert.equal(observedSet({completed:false}),false);
});
test('GX06/GX09/GX26 dashboard, Coach load board and report reject incompatible records',()=>{
  const now=new Date('2026-11-25T12:00:00Z');
  const base={clientId:'c1',status:'completed',syncStatus:'clean',sport:'strength'};
  const measured={...base,id:'real',completedAt:'2026-11-24T12:00:00Z',results:{
    good:{exerciseId:'squat',reps:10,load:'20 kg',rpe:7},
    skipped:{exerciseId:'squat',reps:10,loadKg:100,skipped:true},
    contradiction:{exerciseId:'squat',reps:10,loadKg:50,load:'30 kg',rpe:99},
    coercion:{exerciseId:'squat',reps:[10],loadKg:200,rpe:'0x7'},
  }};
  const state={collections:{sessionExecutions:[
    measured,
    {...base,id:'future',completedAt:'2026-11-26T12:00:00Z',results:measured.results},
    {...base,id:'creation-only',createdAt:'2026-11-24T10:00:00Z',results:measured.results},
  ],checkins:[{id:'bad',clientId:'c1',createdAt:'2026-11-24T08:00:00Z',energy:99,pain:[10]}]}};
  const p=computeProgressSummary(state,'c1',{now});
  assert.equal(p.confirmedWorkoutExecutions,1);
  assert.equal(p.volume,200);
  assert.equal(p.averageRpe,7);
  assert.equal(p.checkins,0);
  const board=buildPeriodizationSnapshot(state,'c1',{now,cycle:{clientId:'c1',startDate:'2026-11-01',endDate:'2026-11-30'}});
  assert.equal(board.completed,1);
  assert.equal(board.weeks.reduce((n,w)=>n+(w.strengthVolume||0),0),200);
  assert.equal(buildExerciseLongitudinalProgress(state,'c1',{now}).totalExecutions,1);
  const report=buildPostSessionSportEvidence(measured,{clientId:'c1'});
  assert.equal(report.some(x=>/100 kg|50 kg|200 kg|RPE 99/.test(x.text)),false);
});
test('GX06 same revision but differing summary completion dates cannot certify chronology',()=>{
  const row={id:'typed',clientId:'c1',revision:2,status:'completed',summary:{completedAt:'2026-11-01T12:00:00Z'}};
  const state={collections:{sessionExecutions:[row,{...row,summary:{completedAt:'2026-11-24T12:00:00Z'}}]}};
  assert.equal(reconcileSessionExecutionsForClient(state,'c1').conflicts.length,1);
});
