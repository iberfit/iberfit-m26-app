import '../../src/m26/data-experience/echarts-element.js';
import {renderProgressRoute} from '../../src/m26/modules/route-render.js';
import {renderM26Shell} from '../../src/m26/shell/shell-render.js';
import {createShellViewModel} from '../../src/m26/shell/shell-view-model.js';
import {resolveAdaptiveLayout} from '../../src/m26/shell/shell-controller.js';
import {enhanceProgressContinuity} from '../../src/m26/ui/progress-continuity.js';

const root=document.querySelector('#qa-root');
if(!root)throw new Error('QA_COACH_PROGRESS_ROOT_MISSING');

const COACH='11111111-1111-4111-8111-111111111111';
const CLIENT='22222222-2222-4222-8222-222222222222';
const FIXED_NOW='2026-09-16T12:00:00.000Z';

const state={
  identity:{
    id:COACH,
    name:'Carlos · Coach QA',
    email:'coach.visual.qa@iberfit.cl',
    role:'coach',
    authorizedRoles:['coach'],
  },
  hydration:{status:'ready',serverTime:FIXED_NOW},
  activeArea:'progreso',
  selectedClientId:CLIENT,
  pendingOperations:[],
  conflicts:[],
  rejectedOperations:[],
  metrics:{},
  collections:{
    clients:[{id:CLIENT,name:'Ana Torres',modality:'hibrido',status:'active'}],
    appointments:[],
    sessions:[],
    clientProfiles:[],
    clientAccess:[],
    iriAssessments:[],
    reports:[],
    trainingCycles:[],
    sessionExecutions:[],
  },
};

function history(prefix,loads,reps,rpes){
  return loads.map((load,index)=>({
    executionId:`${prefix}-${index+1}`,
    at:`2026-0${8+Math.floor(index/2)}-${String(20+index*7).padStart(2,'0')}T11:00:00.000Z`,
    setCount:3,
    totalReps:reps[index]*3,
    bestReps:reps[index],
    totalSeconds:null,
    maxLoadKg:load,
    loadLabels:[`${load} kg`],
    averageRpe:rpes[index],
    averageRir:Math.max(0,10-rpes[index]),
    volumeKgReps:load*reps[index]*3,
    knownLoadSets:3,
  }));
}

function exercise(id,name,rows){
  const latest=rows.at(-1)||{};
  return {
    exerciseId:id,
    exerciseName:name,
    sessions:rows.length,
    totalSets:rows.reduce((sum,row)=>sum+row.setCount,0),
    firstAt:rows[0]?.at||null,
    lastAt:latest.at||null,
    latest,
    bestLoadKg:Math.max(...rows.map(row=>Number(row.maxLoadKg||0))),
    bestVolumeKgReps:Math.max(...rows.map(row=>Number(row.volumeKgReps||0))),
    loadCoverage:rows.length?1:null,
    dataQuality:rows.length>=3?'alta':rows.length>=2?'media':'limitada',
    loadTrend:{direction:'indeterminate',label:'Comparación profesional disponible'},
    repsTrend:{direction:'indeterminate',label:'Comparación profesional disponible'},
    volumeTrend:{direction:'indeterminate',label:'Comparación profesional disponible'},
    rpeTrend:{direction:'indeterminate',label:'Comparación profesional disponible'},
    rirTrend:{direction:'indeterminate',label:'Comparación profesional disponible'},
    history:rows,
  };
}

function metric(name,unit,values){
  const points=values.map((value,index)=>({
    completedAt:`2026-0${8+Math.floor(index/2)}-${String(20+index*7).padStart(2,'0')}T11:00:00.000Z`,
    executionId:`${name}-${index+1}`,
    value,
  }));
  const first=points[0]||null;
  const latest=points.at(-1)||null;
  const absoluteDelta=first&&latest?latest.value-first.value:null;
  const percentageDelta=first&&latest&&first.value!==0?((latest.value-first.value)/first.value)*100:null;
  return {
    metric:name,
    unit,
    comparableKey:name,
    points,
    pointCount:points.length,
    first,
    latest,
    absoluteDelta,
    percentageDelta,
    direction:absoluteDelta>0?'up':absoluteDelta<0?'down':'flat',
    comparable:points.length>=2,
  };
}

function performance(id,name,status,{load,reps,volume,rpe,basis,colorEligible=true}){
  return {
    exerciseId:id,
    exerciseName:name,
    facts:{
      clientId:CLIENT,
      exerciseId:id,
      exposureCount:load.length,
      trend:{
        exerciseId:id,
        clientId:CLIENT,
        averageGapDays:7,
        primaryMetric:'load',
        metrics:{
          load:metric('load','kg',load),
          volumeKg:metric('volumeKg','kg·rep',volume),
          totalReps:metric('totalReps','rep',reps.map(value=>value*3)),
          repsPerSet:metric('repsPerSet','rep/serie',reps),
          totalSeconds:{comparable:false,points:[]},
          secondsPerSet:{comparable:false,points:[]},
          averageRpe:metric('averageRpe','RPE',rpe),
          averageRir:{comparable:false,points:[]},
        },
      },
    },
    coachAssessment:{
      status,
      confidence:'high',
      label:status==='regression'?'Revisar':status==='progress'?'Evolución':'Estable',
      symbol:status==='regression'?'↓':status==='progress'?'↑':'=',
      tone:'neutral',
      colorEligible,
      causalMetric:'load',
      basis,
      evidence:{
        loadDeltaPercent:load.length>1?((load.at(-1)-load.at(-2))/load.at(-2))*100:null,
        outputDeltaPercent:reps.length>1?((reps.at(-1)-reps.at(-2))/reps.at(-2))*100:null,
        rpeDelta:rpe.length>1?rpe.at(-1)-rpe.at(-2):null,
        rirDelta:null,
      },
      methodology:'deterministic-comparable-performance-v1',
    },
  };
}

const reviewHistory=history('review',[30,32,28],[10,10,8],[7,7.5,8.5]);
const progressHistory=history('progress',[16,18,20],[10,10,11],[7.5,7.5,7]);
const stableHistory=history('stable',[40,40,40],[8,8,8],[7,7,7]);
const limitedHistory=[{
  executionId:'limited-1',
  at:'2026-09-10T11:00:00.000Z',
  setCount:3,
  totalReps:30,
  bestReps:10,
  totalSeconds:null,
  maxLoadKg:12,
  loadLabels:['12 kg'],
  averageRpe:7,
  averageRir:3,
  volumeKgReps:360,
  knownLoadSets:3,
}];

const exerciseProgress={
  totalExercises:4,
  totalExecutions:10,
  exercises:[
    exercise('press','Press de pecho con mancuernas',progressHistory),
    exercise('row','Remo con mancuerna a una mano',reviewHistory),
    exercise('squat','Sentadilla goblet',stableHistory),
    exercise('raise','Elevación lateral con mancuernas',limitedHistory),
  ],
};

const exercisePerformance=[
  performance('press','Press de pecho con mancuernas','progress',{
    load:[16,18,20],
    reps:[10,10,11],
    volume:[480,540,660],
    rpe:[7.5,7.5,7],
    basis:'Mayor carga con rendimiento conservado y esfuerzo no claramente peor.',
  }),
  performance('row','Remo con mancuerna a una mano','regression',{
    load:[30,32,28],
    reps:[10,10,8],
    volume:[900,960,672],
    rpe:[7,7.5,8.5],
    basis:'La última exposición combina menor carga y menor rendimiento con mayor esfuerzo; requiere contexto antes de decidir.',
  }),
  performance('squat','Sentadilla goblet','stable',{
    load:[40,40,40],
    reps:[8,8,8],
    volume:[960,960,960],
    rpe:[7,7,7],
    basis:'Los registros comparables se mantienen estables dentro de la ventana observada.',
    colorEligible:false,
  }),
];

const summary={
  days:28,
  dataQuality:'alta',
  adherence:.83,
  completedSessions:5,
  plannedSessions:6,
  averageRpe:7.4,
  volume:864,
  iriCurrent:null,
  iriDelta:null,
  evolution:null,
  iri2:null,
  checkins:0,
  checkinAverage:{},
  wearable:{metrics:{},providers:[],daysWithData:0,freshness:'sin_datos',quality:'limitada'},
  unconfirmedExecutions:0,
  volumeDelta:8.2,
  lastExecutionAt:'2026-09-10T11:00:00.000Z',
};

const routeVm={
  kind:'progreso',
  role:'coach',
  summary,
  signal:{label:'Seguimiento activo',level:'neutral'},
  timeline:[],
  longitudinal:null,
  alerts:[],
  planExecution:null,
  exerciseProgress,
  exercisePerformance,
};

const shellVm=createShellViewModel(state);
root.innerHTML=renderM26Shell(shellVm,renderProgressRoute(routeVm));
enhanceProgressContinuity({root,viewModel:shellVm,state,now:new Date(FIXED_NOW)});

function syncAdaptiveLayout(){
  const coarsePointer=Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches);
  const touchPoints=Number(globalThis.navigator?.maxTouchPoints||0);
  const layout=resolveAdaptiveLayout({width:globalThis.innerWidth,coarsePointer,touchPoints});
  root.dataset.m26Layout=layout;
  root.dataset.m26Input=coarsePointer||touchPoints>0?'touch':'pointer';
  return layout;
}

const adaptiveLayout=syncAdaptiveLayout();
globalThis.addEventListener?.('resize',syncAdaptiveLayout,{passive:true});

globalThis.__IBERFIT_COACH_PROGRESS_VISUAL__=Object.freeze({
  mounted:true,
  syntheticQa:true,
  currentSource:true,
  role:'coach',
  activeArea:'progreso',
  adaptiveLayout,
  exerciseCount:exerciseProgress.totalExercises,
});
