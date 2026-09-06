import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProgressHub} from '../src/m26/engagement/index.js';

const NOW=new Date('2026-09-06T12:00:00Z');

function sampleState(){
  return {
    collections:{
      appointments:[
        {id:'a1',clientId:'c1',status:'completed',scheduledAt:'2026-08-20T10:00:00Z'},
        {id:'a2',clientId:'c1',status:'completed',scheduledAt:'2026-08-27T10:00:00Z'},
        {id:'a3',clientId:'c1',status:'completed',scheduledAt:'2026-09-03T10:00:00Z'},
      ],
      sessions:[{id:'s1',clientId:'c1',blocks:[{exerciseId:'squat',exerciseName:'Sentadilla'}]}],
      sessionExecutions:[
        {id:'e1',clientId:'c1',sessionId:'s1',appointmentId:'a1',status:'completed',syncStatus:'clean',completedAt:'2026-08-20T11:00:00Z',results:{x:{exerciseId:'squat',reps:8,loadKg:40,rpe:7}}},
        {id:'e2',clientId:'c1',sessionId:'s1',appointmentId:'a2',status:'completed',syncStatus:'clean',completedAt:'2026-08-27T11:00:00Z',results:{x:{exerciseId:'squat',reps:8,loadKg:45,rpe:7}}},
        {id:'e3',clientId:'c1',sessionId:'s1',appointmentId:'a3',status:'completed',syncStatus:'clean',completedAt:'2026-09-03T11:00:00Z',results:{x:{exerciseId:'squat',reps:8,loadKg:50,rpe:7}}},
      ],
      iriAssessments:[{id:'iri1',clientId:'c1',assessmentDate:'2026-09-01T10:00:00Z',stepFinalHr:150,stepOneMinuteHr:115,bodyComposition:{weightKg:70},strengthPatterns:{squat:1}}],
      checkins:[
        {id:'ch1',clientId:'c1',createdAt:'2026-09-01T08:00:00Z',energy:8,sleep:7,stress:3,pain:1},
        {id:'ch2',clientId:'c1',createdAt:'2026-09-03T08:00:00Z',energy:8,sleep:8,stress:2,pain:1},
        {id:'ch3',clientId:'c1',createdAt:'2026-09-05T08:00:00Z',energy:7,sleep:7,stress:3,pain:1},
      ],
      wearableDailySummaries:[],
    },
    pendingOperations:[],conflicts:[],rejectedOperations:[],
  };
}

test('Progress Hub aggregates existing evidence without a global score',()=>{
  const hub=buildProgressHub(sampleState(),'c1',{now:NOW});
  assert.equal(hub.clientId,'c1');
  assert.equal(hub.totalPillars,6);
  assert.equal(hub.pillars.length,6);
  assert.equal(Object.hasOwn(hub,'score'),false);
  assert.match(hub.note,/sin convertirlas en una puntuación global/u);
  assert.deepEqual(hub.pillars.map((pillar)=>pillar.id),['consistency','strength','volume','wellbeing','iri','activity']);
});

test('Progress Hub strength uses repeated confirmed exercise evidence',()=>{
  const hub=buildProgressHub(sampleState(),'c1',{now:NOW});
  const strength=hub.pillars.find((pillar)=>pillar.id==='strength');
  assert.equal(strength.value,1);
  assert.match(strength.evidence,/1 con al menos una señal ascendente/u);
  assert.equal(strength.source,'sessionExecutions');
});

test('Progress Hub preserves missing device data as insufficient instead of zero',()=>{
  const hub=buildProgressHub(sampleState(),'c1',{now:NOW});
  const activity=hub.pillars.find((pillar)=>pillar.id==='activity');
  assert.equal(activity.status,'insufficient');
  assert.equal(activity.value,null);
  assert.match(activity.evidence,/Sin datos recientes/u);
});

test('Progress Hub stays isolated by clientId',()=>{
  const state=sampleState();
  state.collections.sessionExecutions.push({id:'other',clientId:'c2',sessionId:'s1',status:'completed',syncStatus:'clean',completedAt:'2026-09-05T11:00:00Z',results:{x:{exerciseId:'squat',reps:20,loadKg:200}}});
  const hub=buildProgressHub(state,'c1',{now:NOW});
  const strength=hub.pillars.find((pillar)=>pillar.id==='strength');
  assert.equal(strength.value,1);
  assert.doesNotMatch(strength.context,/4 ejecuciones/u);
});

test('Progress Hub returns null without a client',()=>{
  assert.equal(buildProgressHub(sampleState(),null,{now:NOW}),null);
});
