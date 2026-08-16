import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createDataTrust,
  longitudinalMetricTrust,
  wearableSummaryTrust,
  wearableRecordTrust,
  challengeEvaluationTrust,
  renderDataTrustStrip,
} from '../src/m26/data-experience/data-trust.js';
import {
  renderLongitudinalDataExperience,
} from '../src/m26/data-experience/longitudinal-ui.js';
import {
  buildLongitudinalAggregation,
} from '../src/m26/intelligence/longitudinal-aggregation.js';
import {
  evaluateChallenge,
} from '../src/m26/engagement/challenge-metrics.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const NOW=new Date('2026-08-16T12:00:00.000Z');
const CLIENT='CLIENT-RC596';

function day(offset){
  const date=new Date(NOW);
  date.setUTCDate(date.getUTCDate()-offset);
  return date.toISOString().slice(0,10);
}

function stateFixture(){
  return {
    collections:{
      wearableDailySummaries:Array.from({length:28},(_,offset)=>({
        clientId:CLIENT,
        provider:'health_connect',
        date:day(offset),
        steps:8000,
        activeMinutes:45,
        sleepMinutes:440,
        restingHeartRate:59,
        hrvMs:48,
        vfcMethod:'rmssd',
        activeEnergyKcal:480,
        workoutMinutes:38,
        quality:'alta',
        sourceUpdatedAt:`${day(offset)}T23:00:00.000Z`,
      })),
      appointments:[
        {id:'A1',clientId:CLIENT,scheduledAt:`${day(2)}T10:00:00.000Z`,status:'completed'},
        {id:'A2',clientId:CLIENT,scheduledAt:`${day(9)}T10:00:00.000Z`,status:'completed'},
        {id:'A3',clientId:CLIENT,scheduledAt:`${day(16)}T10:00:00.000Z`,status:'planned'},
      ],
      sessionExecutions:[],
      checkins:[],
      iriAssessments:[],
      habits:[],
      habitLogs:[],
    },
  };
}

test('RC59.6 contrato normaliza procedencia fecha calidad cobertura dato y método',()=>{
  const trust=createDataTrust({
    source:'health_connect',
    observedAt:'2026-08-16',
    quality:'alta',
    coverage:0.75,
    missing:false,
    method:'rmssd',
    providers:['health_connect'],
  });

  assert.equal(trust.sourceLabel,'Health Connect');
  assert.equal(trust.observedAt,'2026-08-16');
  assert.equal(trust.qualityLabel,'Alta');
  assert.equal(trust.coverageLabel,'75 %');
  assert.equal(trust.missingLabel,'Dato disponible');
  assert.equal(trust.methodLabel,'VFC · RMSSD');
});

test('RC59.6 agregado longitudinal expone confianza por métrica incluida VFC',()=>{
  const aggregate=buildLongitudinalAggregation(stateFixture(),CLIENT,{now:NOW});
  const steps=longitudinalMetricTrust(
    aggregate.windows.d28.metrics.steps,
    aggregate.dataTrust
  );
  const hrv=longitudinalMetricTrust(
    aggregate.windows.d28.metrics.hrvMs,
    aggregate.dataTrust
  );

  assert.equal(steps.observedAt,'2026-08-16');
  assert.equal(steps.coverage,1);
  assert.equal(steps.quality,'alta');
  assert.equal(steps.missing,false);
  assert.equal(steps.method,'daily_provider_mean');
  assert.deepEqual(steps.providers,['health_connect']);
  assert.equal(hrv.method,'rmssd');
});

test('RC59.6 resumen wearable hace visible fecha cobertura calidad y ausencia',()=>{
  const trust=wearableSummaryTrust({
    days:7,
    daysWithData:5,
    providers:['health_connect'],
    latestDate:'2026-08-16',
    quality:'media',
  });
  assert.equal(trust.coverageLabel,'71 %');
  assert.equal(trust.qualityLabel,'Media');
  assert.equal(trust.observedAt,'2026-08-16');
  assert.equal(trust.missing,false);

  const missing=wearableSummaryTrust({days:7,daysWithData:0,providers:[],quality:'limitada'});
  assert.equal(missing.missing,true);
  assert.equal(missing.coverage,0);
  assert.equal(missing.observedAt,null);
});

test('RC59.6 registro diario preserva procedencia fecha calidad y método VFC',()=>{
  const trust=wearableRecordTrust({
    provider:'health_connect',
    date:'2026-08-16',
    quality:'alta',
    vfcMethod:'rmssd',
    metrics:{steps:9000,hrvMs:51},
  });
  assert.equal(trust.sourceLabel,'Health Connect');
  assert.equal(trust.observedAt,'2026-08-16');
  assert.equal(trust.quality,'alta');
  assert.equal(trust.method,'rmssd');
  assert.equal(trust.missing,false);
});

test('RC59.6 tira de confianza es visible y no esconde dato faltante',()=>{
  const html=renderDataTrustStrip(createDataTrust({
    source:'wearableDailySummaries',
    quality:'sin_datos',
    coverage:0,
    missing:true,
    method:'available_day_mean',
  }),{role:'client'});

  assert.match(html,/data-data-trust="visible"/u);
  assert.match(html,/Fuente/u);
  assert.match(html,/Fecha/u);
  assert.match(html,/Calidad/u);
  assert.match(html,/Cobertura/u);
  assert.match(html,/Dato faltante/u);
  assert.match(html,/Método/u);
});

test('RC59.6 Data Experience muestra trust por métrica para Cliente y Coach',()=>{
  const aggregate=buildLongitudinalAggregation(stateFixture(),CLIENT,{now:NOW});
  const client=renderLongitudinalDataExperience(aggregate,{role:'client'});
  const coach=renderLongitudinalDataExperience(aggregate,{role:'coach'});

  assert.match(client,/data-data-trust="visible"/u);
  assert.match(client,/Health Connect/u);
  assert.match(client,/Cobertura/u);
  assert.match(coach,/VFC · RMSSD/u);
  assert.match(coach,/Calidad/u);
});

test('RC59.6 Actividad aplica trust al resumen y a cada registro diario',()=>{
  const source=read('src/m26/modules/route-render.js');
  assert.match(source,/wearableSummaryTrust\(wearableSummary\)/u);
  assert.match(source,/wearableRecordTrust\(item\)/u);
  assert.match(source,/renderDataTrustStrip/u);
  assert.match(
    source,
    /renderDataTrustStrip\(wearableRecordTrust\(item\),\{role,compact:true\}\)/u
  );
  assert.match(
    source,
    /renderDataTrustStrip\(wearableSummaryTrust\(wearableSummary\),\{role:vm\.role\}\)/u
  );
});

test('RC59.6 reto canónico conserva asOf método y descriptor de confianza',()=>{
  const evaluation=evaluateChallenge(
    stateFixture(),
    CLIENT,
    {type:'steps',target:100000,days:28,mode:'group'},
    {now:NOW,deviceOptIn:true}
  );
  const trust=challengeEvaluationTrust(evaluation);

  assert.equal(evaluation.asOf,NOW.toISOString());
  assert.equal(evaluation.verification.method,'sum_daily_provider_mean');
  assert.equal(trust.sourceLabel,'Agregado longitudinal IBERFIT');
  assert.equal(trust.observedAt,'2026-08-16');
  assert.equal(trust.quality,'alta');
  assert.equal(trust.coverage,1);
  assert.equal(trust.missing,false);
});

test('RC59.6 consentimiento pendiente se representa como dato faltante y no elegible',()=>{
  const evaluation=evaluateChallenge(
    stateFixture(),
    CLIENT,
    {type:'steps',target:100000,days:28,mode:'group'},
    {now:NOW,deviceOptIn:false}
  );
  const trust=challengeEvaluationTrust(evaluation);

  assert.equal(evaluation.status,'consent_required');
  assert.equal(evaluation.verification.method,'consent_gate');
  assert.equal(trust.missing,true);
  assert.equal(evaluation.verification.eligibleForLeaderboard,false);
});

test('RC59.6 mantiene regla dato contexto entrenador decide y no prescribe',()=>{
  const ui=read('src/m26/data-experience/longitudinal-ui.js');
  const trust=read('src/m26/data-experience/data-trust.js');

  assert.match(ui,/Dato → contexto → entrenador decide/u);
  assert.doesNotMatch(trust,/targetRpe|targetRir|automaticProgression|setAdjustment/u);
});

test('RC59.6 PWA versiona Data Trust y preserva RC59.5 como lineage',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(sw,/VERSION='m26-rc59-6'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc59-5'/u);
  assert.match(
    sw,
    /Historical compatibility markers retained[^\n]*m26-rc59-6[^\n]*m26-rc59-5/u
  );
  assert.match(sw,/"\/src\/m26\/data-experience\/data-trust\.js"/u);
});

test('RC59.6 cierra Data Trust UX y abre Coach Productivity preservando informes premium',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(roadmap,/RC59_6=CLOSED_DATA_TRUST_UX/u);
  assert.match(roadmap,/RC60=IN_PROGRESS_COACH_PRODUCTIVITY/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
});