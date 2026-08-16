import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CHALLENGE_TYPE_CATALOG,
  SAFE_CHALLENGE_METRICS,
  createChallengeDefinition,
  buildCanonicalChallengeContext,
  evaluateChallenge,
  buildPrivacySafeLeaderboard,
} from '../src/m26/engagement/challenge-metrics.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const NOW=new Date('2026-08-16T12:00:00.000Z');
const CLIENT='CLIENT-RC595';

function day(offset){
  const date=new Date(NOW);
  date.setUTCDate(date.getUTCDate()-offset);
  return date.toISOString().slice(0,10);
}

function stateFixture(){
  const wearableDailySummaries=Array.from({length:28},(_,offset)=>({
    clientId:CLIENT,
    provider:'health_connect',
    date:day(offset),
    steps:8000,
    activeMinutes:45,
    workoutMinutes:30,
    quality:'alta',
    sourceUpdatedAt:`${day(offset)}T23:00:00.000Z`,
  }));

  return {
    collections:{
      wearableDailySummaries,
      appointments:[
        {id:'A1',clientId:CLIENT,scheduledAt:`${day(2)}T10:00:00.000Z`,status:'completed'},
        {id:'A2',clientId:CLIENT,scheduledAt:`${day(9)}T10:00:00.000Z`,status:'completed'},
        {id:'A3',clientId:CLIENT,scheduledAt:`${day(16)}T10:00:00.000Z`,status:'completed'},
        {id:'A4',clientId:CLIENT,scheduledAt:`${day(23)}T10:00:00.000Z`,status:'planned'},
      ],
      sessionExecutions:[],
      checkins:[],
      iriAssessments:[],
      habits:[
        {id:'H1',clientId:CLIENT,title:'Caminar',target:1,status:'activo'},
      ],
      habitLogs:[
        {id:'HL1',clientId:CLIENT,habitId:'H1',completed:true,recordedAt:`${day(1)}T08:00:00.000Z`,status:'confirmado'},
        {id:'HL2',clientId:CLIENT,habitId:'H1',completed:true,recordedAt:`${day(3)}T08:00:00.000Z`,status:'confirmado'},
        {id:'HL3',clientId:CLIENT,habitId:'H1',completed:false,recordedAt:`${day(4)}T08:00:00.000Z`,status:'confirmado'},
      ],
    },
  };
}

test('RC59.5 define exactamente los siete tipos iniciales del roadmap',()=>{
  assert.deepEqual(
    CHALLENGE_TYPE_CATALOG.map((item)=>item.type),
    [
      'consistency',
      'sessions',
      'steps',
      'activity',
      'habits',
      'personal_progress',
      'coach_goal',
    ]
  );
});

test('RC59.5 foundation consume únicamente métricas canónicas y no sensores',()=>{
  const source=read('src/m26/engagement/challenge-metrics.js');
  const context=buildCanonicalChallengeContext(stateFixture(),CLIENT,{now:NOW});

  assert.deepEqual(
    context.canonicalSources,
    [
      'longitudinal-aggregation',
      'progress-engine',
      'engagement-habit-logs',
    ]
  );
  assert.equal(context.sensorAccess,false);
  assert.equal(context.rawTelemetryAccess,false);
  assert.doesNotMatch(source,/bridge-service|native-transport|live-telemetry|canonical-telemetry/iu);
});

test('RC59.5 constancia y sesiones derivan del progress engine canónico',()=>{
  const state=stateFixture();
  const consistency=evaluateChallenge(
    state,
    CLIENT,
    {type:'consistency',target:70,days:28},
    {now:NOW}
  );
  const sessions=evaluateChallenge(
    state,
    CLIENT,
    {type:'sessions',target:4,days:28},
    {now:NOW}
  );

  assert.equal(consistency.value,75);
  assert.equal(consistency.progressPct,100);
  assert.equal(sessions.value,3);
  assert.equal(sessions.progressPct,75);
  assert.equal(consistency.verification.source,'progress');
});

test('RC59.5 pasos y actividad usan agregado longitudinal y exigen opt in de dispositivo',()=>{
  const state=stateFixture();
  const blocked=evaluateChallenge(
    state,
    CLIENT,
    {type:'steps',target:100000,days:28,mode:'group'},
    {now:NOW,deviceOptIn:false}
  );
  assert.equal(blocked.status,'consent_required');
  assert.equal(blocked.value,null);
  assert.equal(blocked.verification.eligibleForLeaderboard,false);

  const allowed=evaluateChallenge(
    state,
    CLIENT,
    {type:'steps',target:224000,days:28,mode:'group'},
    {now:NOW,deviceOptIn:true}
  );
  assert.equal(allowed.value,224000);
  assert.equal(allowed.progressPct,100);
  assert.equal(allowed.verification.source,'longitudinal');
  assert.equal(allowed.verification.coverage,1);
  assert.deepEqual(allowed.verification.providers,['health_connect']);
});

test('RC59.5 hábitos cuentan únicamente logs confirmados y completados del hábito objetivo',()=>{
  const result=evaluateChallenge(
    stateFixture(),
    CLIENT,
    {type:'habits',habitId:'H1',target:4,days:7},
    {now:NOW}
  );

  assert.equal(result.value,2);
  assert.equal(result.progressPct,50);
  assert.equal(result.verification.source,'engagement');
});

test('RC59.5 progreso personal y objetivo Coach solo aceptan métricas competitivas seguras',()=>{
  const personal=createChallengeDefinition({
    type:'personal_progress',
    metricKey:'completedSessions',
    target:8,
    days:28,
  });
  const coach=createChallengeDefinition({
    type:'coach_goal',
    metricKey:'activeMinutes',
    target:600,
    days:28,
  });

  assert.equal(personal.coachDefined,true);
  assert.equal(coach.coachDefined,true);
  assert.throws(
    ()=>createChallengeDefinition({
      type:'coach_goal',
      metricKey:'restingHeartRate',
      target:50,
      days:28,
    }),
    /M26_CHALLENGE_METRIC_FORBIDDEN/u
  );
  assert.throws(
    ()=>createChallengeDefinition({
      type:'coach_goal',
      metricKey:'hrvMs',
      target:70,
      days:28,
    }),
    /M26_CHALLENGE_METRIC_FORBIDDEN/u
  );
  assert.equal(Object.hasOwn(SAFE_CHALLENGE_METRICS,'restingHeartRate'),false);
  assert.equal(Object.hasOwn(SAFE_CHALLENGE_METRICS,'hrvMs'),false);
});

test('RC59.5 nunca convierte FC más alta en objetivo competitivo',()=>{
  for(const metricKey of ['heartRate','maxHeartRate','bpm','pulse']){
    assert.throws(
      ()=>createChallengeDefinition({
        type:'coach_goal',
        metricKey,
        target:100,
        days:28,
      }),
      /M26_CHALLENGE_METRIC_FORBIDDEN/u
    );
  }
});

test('RC59.5 leaderboard grupal publica rango y porcentaje pero no valores sanitarios crudos',()=>{
  const challenge={type:'steps',target:100000,days:28,mode:'group'};
  const entries=[
    {participantId:'P1',alias:'A',progressPct:80,verification:{eligibleForLeaderboard:true},value:80000,rawHeartRate:[90,120]},
    {participantId:'P2',alias:'B',progressPct:100,verification:{eligibleForLeaderboard:true},value:100000,hrvMs:55},
  ];
  const leaderboard=buildPrivacySafeLeaderboard(entries,challenge);

  assert.deepEqual(leaderboard,[
    {rank:1,participantId:'P2',alias:'B',progressPct:100,completed:true},
    {rank:2,participantId:'P1',alias:'A',progressPct:80,completed:false},
  ]);
  assert.doesNotMatch(JSON.stringify(leaderboard),/80000|100000|rawHeartRate|hrvMs/iu);
});

test('RC59.5 retos personales no se convierten accidentalmente en ranking grupal',()=>{
  assert.throws(
    ()=>createChallengeDefinition({
      type:'personal_progress',
      metricKey:'completedSessions',
      target:6,
      days:28,
      mode:'group',
    }),
    /M26_CHALLENGE_GROUP_TYPE_FORBIDDEN/u
  );
});

test('RC59.5 PWA versiona foundation y conserva RC59.4 como lineage histórico',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(
    sw,
    /Historical compatibility markers retained[^\n]*m26-rc59-5[^\n]*m26-rc59-4/u
  );
  assert.match(
    sw,
    /Historical compatibility markers retained[^\n]*m26-rc59-5[^\n]*m26-rc59-4/u
  );
  assert.match(
    sw,
    /"\/src\/m26\/engagement\/challenge-metrics\.js"/u
  );
});

test('RC59.5 se exporta por engagement y cierra foundation abriendo Data Trust UX',()=>{
  const engagement=read('src/m26/engagement/index.js');
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');

  assert.match(engagement,/export \* from '\.\/challenge-metrics\.js';/u);
  assert.match(roadmap,/RC59_5=CLOSED_CHALLENGE_METRICS_FOUNDATION/u);
  assert.match(roadmap,/RC59_6=(?:IN_PROGRESS|CLOSED)_DATA_TRUST_UX/u);
  assert.match(
    roadmap,
    /PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u
  );
  assert.match(
    roadmap,
    /RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u
  );
});