import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRetentionHealth} from '../src/m26/engagement/index.js';

const NOW=new Date('2026-09-06T18:00:00Z');

function healthyState(){
  return {
    collections:{
      appointments:[
        {id:'a1',clientId:'c1',status:'realizada',scheduledAt:'2026-08-16T10:00:00Z'},
        {id:'a2',clientId:'c1',status:'realizada',scheduledAt:'2026-08-23T10:00:00Z'},
        {id:'a3',clientId:'c1',status:'realizada',scheduledAt:'2026-08-30T10:00:00Z'},
        {id:'a4',clientId:'c1',status:'realizada',scheduledAt:'2026-09-05T10:00:00Z'},
      ],
      sessions:[{id:'s1',clientId:'c1',blocks:[{exerciseId:'squat',exerciseName:'Sentadilla'}]}],
      sessionExecutions:[
        {id:'e1',clientId:'c1',sessionId:'s1',appointmentId:'a1',status:'completed',syncStatus:'clean',completedAt:'2026-08-16T11:00:00Z',results:{x:{exerciseId:'squat',reps:8,loadKg:40,rpe:7}}},
        {id:'e2',clientId:'c1',sessionId:'s1',appointmentId:'a2',status:'completed',syncStatus:'clean',completedAt:'2026-08-23T11:00:00Z',results:{x:{exerciseId:'squat',reps:8,loadKg:45,rpe:7}}},
        {id:'e3',clientId:'c1',sessionId:'s1',appointmentId:'a3',status:'completed',syncStatus:'clean',completedAt:'2026-08-30T11:00:00Z',results:{x:{exerciseId:'squat',reps:8,loadKg:50,rpe:7}}},
        {id:'e4',clientId:'c1',sessionId:'s1',appointmentId:'a4',status:'completed',syncStatus:'clean',completedAt:'2026-09-05T11:00:00Z',results:{x:{exerciseId:'squat',reps:8,loadKg:55,rpe:7}}},
      ],
      iriAssessments:[],
      checkins:[
        {id:'ch1',clientId:'c1',createdAt:'2026-09-02T08:00:00Z',energy:8,sleep:8,stress:2,pain:1},
        {id:'ch2',clientId:'c1',createdAt:'2026-09-05T08:00:00Z',energy:8,sleep:7,stress:3,pain:1},
      ],
      wearableDailySummaries:[
        {id:'w1',clientId:'c1',provider:'normalized_file',date:'2026-09-04',quality:'alta',metrics:{steps:9000,activeMinutes:55}},
        {id:'w2',clientId:'c1',provider:'normalized_file',date:'2026-09-05',quality:'alta',metrics:{steps:9500,activeMinutes:60}},
        {id:'w3',clientId:'c1',provider:'normalized_file',date:'2026-09-06',quality:'alta',metrics:{steps:10000,activeMinutes:62}},
      ],
      trainingCycles:[],
    },
    pendingOperations:[],conflicts:[],rejectedOperations:[],
  };
}

test('Retention Health returns green with sufficient confirmed continuity and no numeric score',()=>{
  const health=buildRetentionHealth(healthyState(),'c1',{now:NOW});
  assert.equal(health.band,'green');
  assert.equal(health.label,'Verde');
  assert.equal(health.evidenceCount,5);
  assert.equal(health.totalDomains,6);
  assert.equal(Object.hasOwn(health,'score'),false);
  assert.deepEqual(health.riskSignals,[]);
  assert.equal(health.autoMessage,false);
  assert.equal(health.autoPrescription,false);
});

test('Retention Health turns yellow for a confirmed cancellation pattern without inventing renewal risk',()=>{
  const state=healthyState();
  state.collections.appointments[3]={...state.collections.appointments[3],status:'cancelada'};
  state.collections.sessionExecutions.pop();
  const health=buildRetentionHealth(state,'c1',{now:NOW});
  const cancellations=health.factors.find((item)=>item.id==='cancellations');
  const renewal=health.factors.find((item)=>item.id==='renewal');
  assert.equal(health.band,'yellow');
  assert.equal(cancellations.status,'yellow');
  assert.match(cancellations.evidence,/1 cancelación/u);
  assert.equal(renewal.status,'insufficient');
  assert.equal(health.riskSignals.includes('renewal'),false);
});

test('Retention Health turns red on confirmed continuity breakdown',()=>{
  const state=healthyState();
  state.collections.appointments=state.collections.appointments.slice(0,3).map((item)=>({...item,status:'cancelada'}));
  state.collections.sessionExecutions=[];
  const health=buildRetentionHealth(state,'c1',{now:NOW});
  assert.equal(health.band,'red');
  assert.equal(health.label,'Rojo');
  assert.equal(health.factors.find((item)=>item.id==='cancellations').status,'red');
  assert.equal(health.nextAction.title,'Recuperar continuidad');
  assert.equal(health.requiresCoachDecision,true);
});

test('Retention Health preserves missing evidence as insufficient instead of green or zero',()=>{
  const state={collections:{appointments:[],sessionExecutions:[],iriAssessments:[],checkins:[],wearableDailySummaries:[],trainingCycles:[]},pendingOperations:[],conflicts:[],rejectedOperations:[]};
  const health=buildRetentionHealth(state,'c1',{now:NOW});
  assert.equal(health.band,'insufficient');
  assert.equal(health.evidenceCount,0);
  assert.equal(health.factors.every((item)=>item.status==='insufficient'),true);
});

test('Retention Health is isolated by clientId',()=>{
  const state=healthyState();
  state.collections.appointments.push(
    {id:'x1',clientId:'c2',status:'cancelada',scheduledAt:'2026-08-20T10:00:00Z'},
    {id:'x2',clientId:'c2',status:'cancelada',scheduledAt:'2026-08-27T10:00:00Z'},
    {id:'x3',clientId:'c2',status:'ausencia_cliente',scheduledAt:'2026-09-03T10:00:00Z'},
  );
  const health=buildRetentionHealth(state,'c1',{now:NOW});
  assert.equal(health.band,'green');
  assert.equal(health.factors.find((item)=>item.id==='cancellations').status,'green');
});

test('Retention Health fails closed without clientId',()=>{
  assert.equal(buildRetentionHealth(healthyState(),null,{now:NOW}),null);
});
