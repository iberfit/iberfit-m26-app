import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  renderExpedienteRoute,
  renderProgressRoute,
} from '../src/m26/modules/route-render.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function point(at,overrides={}){
  return {
    executionId:`e-${at}`,
    at,
    setCount:3,
    totalReps:null,
    bestReps:null,
    totalSeconds:null,
    maxLoadKg:null,
    loadLabels:[],
    averageRpe:7,
    averageRir:3,
    volumeKgReps:null,
    knownLoadSets:0,
    ...overrides,
  };
}

function exercise({
  id,
  name,
  history,
  latest,
  bestLoadKg=null,
  bestVolumeKgReps=null,
  loadCoverage=null,
}){
  return {
    exerciseId:id,
    exerciseName:name,
    sessions:history.length,
    totalSets:history.reduce((sum,row)=>sum+Number(row.setCount||0),0),
    firstAt:history[0]?.at||null,
    lastAt:history.at(-1)?.at||null,
    latest:latest||history.at(-1)||{},
    bestLoadKg,
    bestVolumeKgReps,
    loadCoverage,
    dataQuality:history.length>=2?'media':'limitada',
    loadTrend:{direction:'indeterminate',label:'Sin comparación suficiente'},
    repsTrend:{direction:'indeterminate',label:'Sin comparación suficiente'},
    volumeTrend:{direction:'indeterminate',label:'Sin comparación suficiente'},
    rpeTrend:{direction:'indeterminate',label:'Sin comparación suficiente'},
    rirTrend:{direction:'indeterminate',label:'Sin comparación suficiente'},
    history,
  };
}

function progressFixture(){
  const squatHistory=[
    point('2026-08-20T11:00:00.000Z',{maxLoadKg:20,bestReps:10,totalReps:30,volumeKgReps:600,knownLoadSets:3,loadLabels:['20 kg']}),
    point('2026-08-27T11:00:00.000Z',{maxLoadKg:22.5,bestReps:9,totalReps:27,volumeKgReps:607.5,knownLoadSets:3,loadLabels:['22.5 kg']}),
    point('2026-09-03T11:00:00.000Z',{maxLoadKg:25,bestReps:8,totalReps:24,volumeKgReps:600,knownLoadSets:3,loadLabels:['25 kg']}),
  ];

  const plankHistory=[
    point('2026-08-22T11:00:00.000Z',{totalSeconds:120}),
    point('2026-08-29T11:00:00.000Z',{totalSeconds:150}),
    point('2026-09-05T11:00:00.000Z',{totalSeconds:165}),
  ];

  const bodyweightHistory=[
    point('2026-08-24T11:00:00.000Z',{bestReps:8,totalReps:24,loadLabels:['Peso corporal']}),
    point('2026-08-31T11:00:00.000Z',{bestReps:10,totalReps:30,loadLabels:['Peso corporal']}),
  ];

  const singleHistory=[
    point('2026-09-04T11:00:00.000Z',{bestReps:12,totalReps:36}),
  ];

  return {
    totalExercises:4,
    exercises:[
      exercise({
        id:'squat',
        name:'Sentadilla',
        history:squatHistory,
        bestLoadKg:25,
        bestVolumeKgReps:607.5,
        loadCoverage:1,
      }),
      exercise({
        id:'plank',
        name:'Plancha',
        history:plankHistory,
      }),
      exercise({
        id:'pushup',
        name:'Flexiones',
        history:bodyweightHistory,
      }),
      exercise({
        id:'single',
        name:'Ejercicio nuevo',
        history:singleHistory,
      }),
    ],
  };
}

function summaryFixture(){
  return {
    days:28,
    dataQuality:'alta',
    adherence:.75,
    completedSessions:3,
    plannedSessions:4,
    averageRpe:7,
    volume:600,
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
    volumeDelta:null,
    lastExecutionAt:null,
  };
}

test('Exercise Analytics V2 selects the most covered comparable metric per exercise',()=>{
  const html=renderProgressRoute({
    role:'coach',
    summary:summaryFixture(),
    signal:{label:'Al día',level:'neutral'},
    timeline:[],
    longitudinal:null,
    alerts:[],
    planExecution:null,
    exerciseProgress:progressFixture(),
  });

  assert.match(html,/data-m26-exercise-analytics="v2"/u);
  assert.match(html,/data-m26-exercise-chart-metric="maxLoadKg"/u);
  assert.match(html,/data-m26-exercise-chart-metric="totalSeconds"/u);
  assert.match(html,/data-m26-exercise-chart-metric="bestReps"/u);
  assert.match(html,/data-m26-exercise-chart-state="insufficient"/u);
  assert.match(html,/data-reference-label="Máximo registrado"/u);
  assert.match(html,/data-tone="neutral"/u);
  assert.match(html,/Métrica con mayor cobertura comparable/u);
  assert.doesNotMatch(html,/data-reference-value="0"/u);
  assert.doesNotMatch(html,/sesiónes/u);
});

test('Coach Progreso exposes native quick navigation to summary attention and exercise study',()=>{
  const html=renderProgressRoute({
    role:'coach',
    summary:summaryFixture(),
    signal:{label:'Al día',level:'neutral'},
    timeline:[],
    longitudinal:null,
    alerts:[],
    planExecution:null,
    exerciseProgress:progressFixture(),
  });

  assert.match(html,/data-m27-progress-quicknav/u);
  assert.match(html,/href="#m26-progress-summary"/u);
  assert.match(html,/href="#m26-progress-attention"/u);
  assert.match(html,/href="#m26-progress-exercises"/u);
  assert.match(html,/id="m26-progress-summary"/u);
  assert.match(html,/id="m26-progress-attention"/u);
  assert.match(html,/id="m26-progress-exercises"/u);
});

test('Exercise Analytics V2 never treats ambiguous load text as kg',()=>{
  const html=renderProgressRoute({
    role:'coach',
    summary:summaryFixture(),
    signal:{label:'Al día',level:'neutral'},
    timeline:[],
    longitudinal:null,
    alerts:[],
    planExecution:null,
    exerciseProgress:progressFixture(),
  });

  const flexionesStart=html.indexOf('Flexiones');
  const nextCard=html.indexOf('Ejercicio nuevo',flexionesStart);
  const flexiones=html.slice(flexionesStart,nextCard);

  assert.match(flexiones,/data-m26-exercise-chart-metric="bestReps"/u);
  assert.doesNotMatch(flexiones,/data-m26-exercise-chart-metric="maxLoadKg"/u);
  assert.doesNotMatch(flexiones,/data-reference-value="0"/u);
  assert.match(flexiones,/Peso corporal/u);
});

test('Exercise Analytics V2 preserves factual table and avoids automatic progress judgement',()=>{
  const html=renderProgressRoute({
    role:'coach',
    summary:summaryFixture(),
    signal:{label:'Al día',level:'neutral'},
    timeline:[],
    longitudinal:null,
    alerts:[],
    planExecution:null,
    exerciseProgress:progressFixture(),
  });

  assert.match(html,/m26-exercise-progress-table/u);
  assert.match(html,/Carga/u);
  assert.match(html,/Mejor reps/u);
  assert.match(html,/Segundos/u);
  assert.match(html,/RPE/u);
  assert.match(html,/RIR/u);
  assert.match(html,/Volumen/u);
  assert.match(html,/no se interpreta automáticamente como mejora o retroceso/u);
  assert.doesNotMatch(html,/readiness score|score global|puntuación global/iu);
});

test('Exercise Analytics V2 uses compact chart density inside Cliente 360 without hiding the table',()=>{
  const html=renderExpedienteRoute({
    summary:{
      name:'Cliente Uno',
      modality:'Presencial',
      status:'Activo',
      access:'Activo',
      accessKnown:true,
      iri:null,
      profile:{completeness:100,missing:[]},
      counts:{sessions:3,executions:3},
      cycle:null,
      nextAppointment:null,
    },
    progress:summaryFixture(),
    coachCockpit:{items:[]},
    alerts:[],
    alertSignal:{label:'Al día'},
    exercisePerformance:[],
    exerciseProgress:progressFixture(),
  });

  assert.match(html,/data-density="compact"/u);
  assert.match(html,/m26-exercise-progress-echart/u);
  assert.match(html,/m26-exercise-progress-table/u);
});

test('Exercise Analytics V2 responsive CSS keeps charts readable on mobile and forced colors',()=>{
  const css=read('src/m26/design/primitives.css');
  const start=css.indexOf('/* IBERFIT Exercise Analytics V2');
  assert.ok(start>=0);
  const block=css.slice(start,css.indexOf('/* IBERFIT Data Intelligence V1',start));

  for(const selector of [
    '.m26-exercise-progress-chart',
    '.m26-exercise-progress-chart-heading',
    '.m26-exercise-progress-echart',
  ]){
    assert.ok(block.includes(selector),`missing ${selector}`);
  }

  assert.match(block,/@media \(max-width: 560px\)/u);
  assert.match(block,/@media \(forced-colors: active\)/u);
  assert.match(block,/@media print/u);
});
