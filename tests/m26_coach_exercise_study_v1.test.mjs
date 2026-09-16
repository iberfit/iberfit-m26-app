import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderProgressRoute} from '../src/m26/modules/route-render.js';
import {__progressContinuityInternals} from '../src/m26/ui/progress-continuity.js';

function summaryFixture(){
  return {
    days:28,
    dataQuality:'alta',
    adherence:.75,
    completedSessions:3,
    plannedSessions:4,
    averageRpe:7.4,
    volume:720,
    iriCurrent:null,
    iriDelta:null,
    evolution:null,
    iri2:null,
    checkins:0,
    checkinAverage:{},
    wearable:{
      metrics:{},
      providers:[],
      daysWithData:0,
      freshness:'sin_datos',
      quality:'limitada',
    },
    unconfirmedExecutions:0,
    volumeDelta:12,
    lastExecutionAt:null,
  };
}

function metric({
  name,
  unit,
  first,
  latest,
  percentageDelta,
  absoluteDelta,
}){
  return {
    metric:name,
    unit,
    comparableKey:name,
    points:[
      {completedAt:'2026-08-20T11:00:00.000Z',executionId:'exec-1',value:first},
      {completedAt:'2026-08-27T11:00:00.000Z',executionId:'exec-2',value:(first+latest)/2},
      {completedAt:'2026-09-03T11:00:00.000Z',executionId:'exec-3',value:latest},
    ],
    pointCount:3,
    first:{completedAt:'2026-08-20T11:00:00.000Z',executionId:'exec-1',value:first},
    latest:{completedAt:'2026-09-03T11:00:00.000Z',executionId:'exec-3',value:latest},
    absoluteDelta,
    percentageDelta,
    direction:absoluteDelta>0?'up':absoluteDelta<0?'down':'flat',
    comparable:true,
  };
}

function performanceFixture(){
  const load=metric({
    name:'load',
    unit:'kg',
    first:20,
    latest:25,
    absoluteDelta:5,
    percentageDelta:25,
  });
  const repsPerSet=metric({
    name:'repsPerSet',
    unit:'rep/serie',
    first:8,
    latest:10,
    absoluteDelta:2,
    percentageDelta:25,
  });
  const volume=metric({
    name:'volumeKg',
    unit:'kg·rep',
    first:480,
    latest:750,
    absoluteDelta:270,
    percentageDelta:56.3,
  });
  const rpe=metric({
    name:'averageRpe',
    unit:'RPE',
    first:8,
    latest:7.5,
    absoluteDelta:-0.5,
    percentageDelta:-6.3,
  });

  return [{
    exerciseId:'squat',
    exerciseName:'Sentadilla goblet',
    facts:{
      clientId:'client-1',
      exerciseId:'squat',
      exposureCount:3,
      trend:{
        exerciseId:'squat',
        clientId:'client-1',
        averageGapDays:7,
        primaryMetric:'load',
        metrics:{
          load,
          volumeKg:volume,
          totalReps:repsPerSet,
          repsPerSet,
          totalSeconds:{comparable:false,points:[]},
          secondsPerSet:{comparable:false,points:[]},
          averageRpe:rpe,
          averageRir:{comparable:false,points:[]},
        },
      },
    },
    coachAssessment:{
      status:'progress',
      confidence:'high',
      label:'Evolución',
      symbol:'↑',
      tone:'success',
      colorEligible:true,
      causalMetric:'load',
      basis:'Mayor resistencia con rendimiento conservado y esfuerzo no claramente peor.',
      evidence:{
        loadDeltaPercent:11.1,
        outputDeltaPercent:5,
        rpeDelta:-0.5,
        rirDelta:0.5,
      },
      methodology:'deterministic-comparable-performance-v1',
    },
  }];
}

function exerciseProgressFixture(){
  const history=[
    {
      executionId:'exec-1',
      at:'2026-08-20T11:00:00.000Z',
      setCount:3,
      totalReps:24,
      bestReps:8,
      totalSeconds:null,
      maxLoadKg:20,
      loadLabels:['20 kg'],
      averageRpe:8,
      averageRir:2,
      volumeKgReps:480,
      knownLoadSets:3,
    },
    {
      executionId:'exec-2',
      at:'2026-08-27T11:00:00.000Z',
      setCount:3,
      totalReps:27,
      bestReps:9,
      totalSeconds:null,
      maxLoadKg:22.5,
      loadLabels:['22.5 kg'],
      averageRpe:8,
      averageRir:2,
      volumeKgReps:607.5,
      knownLoadSets:3,
    },
    {
      executionId:'exec-3',
      at:'2026-09-03T11:00:00.000Z',
      setCount:3,
      totalReps:30,
      bestReps:10,
      totalSeconds:null,
      maxLoadKg:25,
      loadLabels:['25 kg'],
      averageRpe:7.5,
      averageRir:2.5,
      volumeKgReps:750,
      knownLoadSets:3,
    },
  ];

  return {
    totalExercises:1,
    totalExecutions:3,
    exercises:[{
      exerciseId:'squat',
      exerciseName:'Sentadilla goblet',
      sessions:3,
      totalSets:9,
      firstAt:history[0].at,
      lastAt:history.at(-1).at,
      latest:history.at(-1),
      bestLoadKg:25,
      bestVolumeKgReps:750,
      loadCoverage:1,
      dataQuality:'media',
      loadTrend:{direction:'up',delta:2.5,label:'+2.5 kg'},
      repsTrend:{direction:'up',delta:1,label:'+1 reps'},
      volumeTrend:{direction:'up',delta:23.5,label:'+23.5%'},
      rpeTrend:{direction:'down',delta:-0.5,label:'-0.5 RPE'},
      rirTrend:{direction:'up',delta:0.5,label:'+0.5 RIR'},
      history,
    }],
  };
}

function render(role){
  return renderProgressRoute({
    role,
    summary:summaryFixture(),
    signal:{label:'Al día',level:'neutral'},
    timeline:[],
    longitudinal:null,
    alerts:[],
    planExecution:null,
    exerciseProgress:exerciseProgressFixture(),
    exercisePerformance:performanceFixture(),
  });
}

test('Coach Exercise Study exposes longitudinal percentages, cadence, coverage and professional reading',()=>{
  const html=render('coach');

  assert.match(html,/data-m26-coach-exercise-study-summary/u);
  assert.match(html,/data-m26-coach-exercise-study/u);
  assert.match(html,/data-m26-exercise-decision-state="progress"/u);
  assert.match(html,/Estudio longitudinal del ejercicio/u);
  assert.match(html,/25% desde la primera referencia comparable/u);
  assert.match(html,/56\.3% desde la primera referencia comparable/u);
  assert.match(html,/7 días/u);
  assert.match(html,/Cobertura de carga/u);
  assert.match(html,/>100%</u);
  assert.match(html,/Carga vs anterior \+11\.1%/u);
  assert.match(html,/Rendimiento vs anterior \+5%/u);
  assert.match(html,/Confianza Alta/u);
  assert.match(html,/dato → contexto → entrenador decide/u);
  assert.doesNotMatch(html,/score global|puntuación global|readiness score/iu);
});

test('Coach Exercise Study renders multiple evidence charts and only colors the deterministic causal metric',()=>{
  const html=render('coach');

  for(const key of ['load','repsPerSet','volumeKg','averageRpe']){
    assert.match(
      html,
      new RegExp(`data-m26-coach-exercise-chart="${key}"`,'u'),
    );
  }

  assert.match(
    html,
    /data-m26-coach-exercise-chart="load"[\s\S]*?data-tone="positive"/u,
  );
  assert.match(
    html,
    /data-m26-coach-exercise-chart="volumeKg"[\s\S]*?data-tone="neutral"/u,
  );
});


test('Coach Exercise Study never converts missing metrics into zero',()=>{
  const performance=performanceFixture();
  performance[0].facts.trend.averageGapDays=null;
  performance[0].facts.trend.metrics.volumeKg={
    comparable:false,
    points:[],
    latest:null,
    first:null,
    absoluteDelta:null,
    percentageDelta:null,
  };
  performance[0].coachAssessment.evidence.loadDeltaPercent=null;
  performance[0].coachAssessment.evidence.outputDeltaPercent=null;
  performance[0].coachAssessment.evidence.rpeDelta=null;
  performance[0].coachAssessment.evidence.rirDelta=null;

  const progress=exerciseProgressFixture();
  progress.exercises[0].loadCoverage=null;

  const html=renderProgressRoute({
    role:'coach',
    summary:summaryFixture(),
    signal:{label:'Al día',level:'neutral'},
    timeline:[],
    longitudinal:null,
    alerts:[],
    planExecution:null,
    exerciseProgress:progress,
    exercisePerformance:performance,
  });

  assert.match(html,/Sin cadencia comparable/u);
  assert.match(html,/Cobertura de carga[\s\S]*?Sin dato/u);
  assert.match(html,/Volumen[\s\S]*?Sin dato comparable/u);
  assert.doesNotMatch(html,/Carga vs anterior \+?0%/u);
  assert.doesNotMatch(html,/Rendimiento vs anterior \+?0%/u);
});

test('Client keeps factual exercise evolution without Coach interpretation layer',()=>{
  const html=render('client');

  assert.match(html,/data-m26-exercise-analytics="v2"/u);
  assert.match(html,/m26-exercise-progress-table/u);
  assert.doesNotMatch(html,/data-m26-coach-exercise-study/u);
  assert.doesNotMatch(html,/data-m26-exercise-decision-state/u);
  assert.doesNotMatch(html,/Lectura Coach/u);
  assert.doesNotMatch(html,/Confianza Alta/u);
});

test('Progress route view model projects exercise performance for the selected role',()=>{
  const source=fs.readFileSync(
    new URL('../src/m26/modules/route-view-model.js',import.meta.url),
    'utf8',
  );

  assert.match(source,/function buildExercisePerformanceProjection/u);
  assert.match(
    source,
    /if \(area === 'progreso'\)[\s\S]*buildExercisePerformanceProjection\([\s\S]*exercisePerformance,/u,
  );
  assert.match(
    source,
    /if \(area === 'expediente'\)[\s\S]*role,[\s\S]*exercisePerformance,/u,
  );
});

test('Coach Exercise Study CSS preserves premium responsive and accessibility contracts',()=>{
  const css=fs.readFileSync(
    new URL('../src/m26/design/primitives.css',import.meta.url),
    'utf8',
  );
  const start=css.indexOf('/* IBERFIT Coach Exercise Study V1');
  const end=css.indexOf('/* IBERFIT Data Intelligence V1',start);
  assert.ok(start>=0&&end>start);
  const block=css.slice(start,end);

  for(const selector of [
    '.m26-coach-exercise-study-summary',
    '.m26-coach-exercise-study-kpis',
    '.m26-coach-exercise-study-charts',
    '.m26-coach-exercise-study-reading',
  ]){
    assert.ok(block.includes(selector),`missing ${selector}`);
  }

  assert.match(block,/@media \(max-width: 560px\)/u);
  assert.match(block,/@media \(forced-colors: active\)/u);
  assert.match(block,/@media print/u);
});


test('Coach Exercise Study V2 adds a focused searchable workspace without changing Client rendering',()=>{
  const source=fs.readFileSync(
    new URL('../src/m26/ui/progress-continuity.js',import.meta.url),
    'utf8',
  );

  assert.match(source,/function enhanceCoachExerciseFocus/u);
  assert.match(source,/\['coach','admin'\]\.includes\(role\)/u);
  assert.match(source,/area!==['"]progreso['"]/u);
  assert.match(source,/data-m27-exercise-focus/u);
  assert.match(source,/data-m27-exercise-search/u);
  assert.match(source,/data-m27-exercise-select/u);
  assert.match(source,/data-m27-exercise-state/u);
  assert.match(source,/m27-exercise-focus-summary/u);
  assert.match(source,/m27-exercise-focus-state/u);
  assert.match(source,/item\.card\.remove\(\)/u);
  assert.match(source,/state\.active\.replaceChildren\(next\)/u);
});

test('Coach Exercise Study V2 search is accent-insensitive',()=>{
  const {exerciseFocusText}=__progressContinuityInternals;

  assert.equal(exerciseFocusText('Prensa Única'),'prensa unica');
  assert.equal(exerciseFocusText('SENTADILLA'),'sentadilla');
});

test('Coach Exercise Study decision scan uses explicit non-automatic labels',()=>{
  const {exerciseFocusDecisionMeta}=__progressContinuityInternals;

  assert.deepEqual(
    exerciseFocusDecisionMeta('review'),
    {label:'Revisar',summary:'revisar'},
  );
  assert.deepEqual(
    exerciseFocusDecisionMeta('progress'),
    {label:'Evolución',summary:'evolución'},
  );
  assert.deepEqual(
    exerciseFocusDecisionMeta('stable'),
    {label:'Estable',summary:'estable'},
  );
  assert.deepEqual(
    exerciseFocusDecisionMeta('unknown'),
    {label:'Sin comparación',summary:'sin comparación'},
  );
});
