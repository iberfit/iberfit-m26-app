import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  LONGITUDINAL_AGGREGATION_SCHEMA_VERSION,
  LONGITUDINAL_WINDOWS,
  buildLongitudinalAggregation,
} from '../src/m26/intelligence/longitudinal-aggregation.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const NOW=new Date('2026-08-16T12:00:00.000Z');
const CLIENT='CLIENT-RC593';

function day(offset){
  const date=new Date(NOW);
  date.setUTCDate(date.getUTCDate()-offset);
  return date.toISOString().slice(0,10);
}

function wearableRecord(offset,{
  provider='health_connect',
  steps,
  hrvMs,
  vfcMethod='rmssd',
}={}){
  const current=offset<=27;
  const baseline=offset>=28&&offset<=55;
  return {
    clientId:CLIENT,
    provider,
    date:day(offset),
    steps:steps??(current?8000:baseline?6000:5000),
    sleepMinutes:current?450:baseline?430:420,
    restingHeartRate:current?58:baseline?61:63,
    hrvMs:hrvMs??(current?50:baseline?42:38),
    vfcMethod,
    activeEnergyKcal:current?500:baseline?420:360,
    workoutMinutes:current?42:baseline?34:28,
    quality:'alta',
    sourceUpdatedAt:`${day(offset)}T23:00:00.000Z`,
  };
}

function appointment(offset,status){
  return {
    id:`A-${offset}`,
    clientId:CLIENT,
    scheduledAt:`${day(offset)}T10:00:00.000Z`,
    status,
  };
}

function stateFixture(){
  return {
    collections:{
      wearableDailySummaries:Array.from(
        {length:90},
        (_,offset)=>wearableRecord(offset)
      ),
      appointments:[
        appointment(3,'completed'),
        appointment(10,'completed'),
        appointment(17,'completed'),
        appointment(24,'planned'),
        appointment(31,'completed'),
        appointment(38,'completed'),
        appointment(45,'planned'),
        appointment(52,'planned'),
      ],
      sessionExecutions:[],
      checkins:[],
      iriAssessments:[],
    },
  };
}

test('RC59.3 construye ventanas 7 28 90 con cobertura explícita',()=>{
  const result=buildLongitudinalAggregation(
    stateFixture(),
    CLIENT,
    {now:NOW}
  );

  assert.equal(
    result.schemaVersion,
    LONGITUDINAL_AGGREGATION_SCHEMA_VERSION
  );
  assert.deepEqual(LONGITUDINAL_WINDOWS,[7,28,90]);
  assert.equal(result.windows.d7.daysWithAnyData,7);
  assert.equal(result.windows.d28.daysWithAnyData,28);
  assert.equal(result.windows.d90.daysWithAnyData,90);
  assert.equal(result.windows.d7.coverage,1);
  assert.equal(result.windows.d28.coverage,1);
  assert.equal(result.windows.d90.coverage,1);
});

test('RC59.3 baseline compara 28 dias actuales contra 28 inmediatamente previos',()=>{
  const result=buildLongitudinalAggregation(
    stateFixture(),
    CLIENT,
    {now:NOW}
  );
  const steps=result.baseline.metrics.steps;

  assert.equal(
    result.baseline.method,
    'current_28d_vs_immediately_previous_28d'
  );
  assert.equal(result.baseline.current.startDate,'2026-07-20');
  assert.equal(result.baseline.current.endDate,'2026-08-16');
  assert.equal(result.baseline.previous.startDate,'2026-06-22');
  assert.equal(result.baseline.previous.endDate,'2026-07-19');
  assert.equal(steps.comparable,true);
  assert.equal(steps.currentAverage,8000);
  assert.equal(steps.baselineAverage,6000);
  assert.equal(steps.absoluteChange,2000);
  assert.equal(steps.percentChange,33.3);
});

test('RC59.3 tendencia usa serie diaria 90d y conserva método cuantitativo',()=>{
  const result=buildLongitudinalAggregation(
    stateFixture(),
    CLIENT,
    {now:NOW}
  );
  const steps=result.trends.metrics.steps;

  assert.equal(
    result.trends.method,
    'least_squares_on_daily_provider_mean'
  );
  assert.equal(result.trends.days,90);
  assert.equal(result.trends.minimumSampleDays,7);
  assert.equal(steps.available,true);
  assert.equal(steps.sampleDays,90);
  assert.equal(steps.direction,'increasing');
  assert.ok(steps.slopePerWeek>0);
});

test('RC59.3 VFC no compara ni calcula tendencia si mezcla métodos',()=>{
  const state=stateFixture();
  state.collections.wearableDailySummaries.push(
    wearableRecord(5,{
      provider:'apple_health',
      hrvMs:70,
      vfcMethod:'sdnn',
    })
  );

  const result=buildLongitudinalAggregation(
    state,
    CLIENT,
    {now:NOW}
  );

  assert.equal(
    result.windows.d28.metrics.hrvMs.comparable,
    false
  );
  assert.equal(
    result.windows.d28.metrics.hrvMs.comparabilityReason,
    'mixed_vfc_methods'
  );
  assert.equal(
    result.baseline.metrics.hrvMs.comparable,
    false
  );
  assert.equal(
    result.trends.metrics.hrvMs.available,
    false
  );
});

test('RC59.3 agrega adherencia 7 28 90 y cambio contra baseline',()=>{
  const result=buildLongitudinalAggregation(
    stateFixture(),
    CLIENT,
    {now:NOW}
  );

  assert.equal(result.adherence.d7,1);
  assert.equal(result.adherence.d28,0.75);
  assert.equal(result.adherence.baseline28,0.5);
  assert.equal(result.adherence.change28VsPrevious28,0.25);
  assert.equal(result.adherence.d90,0.625);
});

test('RC59.3 comparativa temporal entrega valores y cobertura sin imputar faltantes',()=>{
  const state=stateFixture();
  state.collections.wearableDailySummaries=
    state.collections.wearableDailySummaries.filter(
      (record)=>record.date!==day(2)
    );

  const result=buildLongitudinalAggregation(
    state,
    CLIENT,
    {now:NOW}
  );
  const steps=result.temporalComparisons.steps;

  assert.equal(steps.d28,8000);
  assert.equal(steps.coverage7,0.857);
  assert.equal(steps.coverage28,0.964);
  assert.equal(result.dataTrust.missingData,'not_imputed');
  assert.equal(result.dataTrust.coverageAlwaysReported,true);
});

test('RC59.3 normaliza multifuente por día sin sobreponderar un proveedor',()=>{
  const state=stateFixture();
  state.collections.wearableDailySummaries.push(
    wearableRecord(0,{
      provider:'samsung_health',
      steps:10000,
    })
  );

  const result=buildLongitudinalAggregation(
    state,
    CLIENT,
    {now:NOW}
  );
  const latest=result.windows.d7.metrics.steps.points.at(-1);

  assert.equal(latest.date,'2026-08-16');
  assert.equal(latest.providerCount,2);
  assert.equal(latest.value,9000);
  assert.equal(
    result.dataTrust.multiProviderDailyPolicy,
    'equal_mean_per_day_across_providers'
  );
});

test('RC59.3 capa es informativa y no produce decisiones clínicas o prescripción',()=>{
  const result=buildLongitudinalAggregation(
    stateFixture(),
    CLIENT,
    {now:NOW}
  );
  const source=read(
    'src/m26/intelligence/longitudinal-aggregation.js'
  );

  assert.equal(
    result.decisionPolicy.automaticPrescriptionChanges,
    false
  );
  assert.equal(
    result.decisionPolicy.clinicalClassification,
    false
  );
  assert.equal(
    result.decisionPolicy.coachDecisionRequired,
    true
  );
  assert.match(
    result.decisionPolicy.rule,
    /entrenador decide/u
  );
  assert.doesNotMatch(
    source,
    /setAdjustment|rpeAdjustment|targetRpe|targetRir|automaticProgression/u
  );
});

test('RC59.3 exporta capa y versiona PWA preservando lineage RC59.2',()=>{
  const index=read('src/m26/intelligence/index.js');
  const sw=read('public/m26/sw.js');

  assert.match(index,/longitudinal-aggregation\.js/u);
  assert.match(
    sw,
    /Historical compatibility markers retained[^\n]*m26-rc59-3/u
  );
  assert.match(
    sw,
    /Historical compatibility markers retained[^\n]*m26-rc59-2/u
  );
  assert.match(
    sw,
    /"\/src\/m26\/intelligence\/longitudinal-aggregation\.js"/u
  );
});

test('RC59.3 cierra agregación longitudinal y abre Data Experience',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');

  assert.match(
    roadmap,
    /RC59_3=CLOSED_LONGITUDINAL_AGGREGATION_LAYER/u
  );
  assert.match(
    roadmap,
    /RC59_4=(?:IN_PROGRESS|CLOSED)_DATA_EXPERIENCE_ECHARTS/u
  );
  assert.match(
    roadmap,
    /RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u
  );
});