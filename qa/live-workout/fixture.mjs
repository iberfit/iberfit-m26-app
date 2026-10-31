import {createExecution} from '../../src/m26/workflows/session-execution.js';
import {createSessionController} from '../../src/m26/workflows/session-controller.js';
import {renderGuidedExecution} from '../../src/m26/workflows/session-ui.js';
import {createActionState} from '../../src/m26/ui/action-state.js';
import {projectCollectionsForRole} from '../../src/m26/security/role-projection.js';

const root=document.querySelector('#qa-root');
if(!root)throw new Error('QA_LIVE_WORKOUT_ROOT_MISSING');

const params=new URLSearchParams(location.search);
const role=params.get('role')==='client'?'client':'coach';
const scenario=params.get('scenario')==='sports'?'sports':'strength';
const qaShell=root.closest('.m26-shell');
if(!qaShell||!root.closest('.m26-workspace'))throw new Error('QA_LIVE_WORKOUT_CSS_SCOPE_MISSING');
qaShell.dataset.m26Role=role;
const CLIENT='22222222-2222-4222-8222-222222222222';

const exercises=Object.freeze([
  Object.freeze({id:'qa-goblet-squat',name_es:'Sentadilla goblet',pattern:'sentadilla',cues:['Pecho estable','Rodillas acompañan la línea del pie']}),
  Object.freeze({id:'qa-split-squat',name_es:'Zancada dividida',pattern:'sentadilla',cues:['Controla la bajada','Mantén estabilidad']}),
  Object.freeze({id:'qa-row',name_es:'Remo con banda',pattern:'tirón',cues:['Hombros lejos de las orejas','Controla el retorno']}),
  Object.freeze({id:'qa-row-alt',name_es:'Remo unilateral',pattern:'tirón',cues:['Tronco estable','Recorrido completo']}),
  Object.freeze({id:'qa-carrera-continua',name_es:'Carrera continua',pattern:'locomoción',measurement_profile:'endurance',cues:['Ritmo sostenible']}),
  Object.freeze({id:'qa-natacion-crol',name_es:'Natación crol en piscina',pattern:'acuático',measurement_profile:'endurance',cues:['Nado controlado']}),
]);

const catalog=Object.freeze({
  get(id){return exercises.find((item)=>item.id===id)||null;},
  has(id){return exercises.some((item)=>item.id===id);},
  list(){return [...exercises];},
  search(query='',filters={}){
    const term=String(query||'').trim().toLowerCase();
    const pattern=String(filters?.pattern||'').trim().toLowerCase();
    return exercises.filter((item)=>{
      if(pattern&&String(item.pattern||'').toLowerCase()!==pattern)return false;
      if(!term)return true;
      return String(item.name_es||'').toLowerCase().includes(term);
    });
  },
});

const defaultSession=Object.freeze({
  id:'qa-live-workout-session',
  clientId:CLIENT,
  title:'Sesión QA Live Workout',
  durationMinutes:50,
  status:'published',
  blocks:Object.freeze([
    Object.freeze({
      id:'qa-block-squat',
      type:'exercise',
      exerciseId:'qa-goblet-squat',
      sets:2,
      reps:'8-10',
      plannedLoad:'20 kg',
      restSeconds:60,
      tempo:'controlado',
      targetRpe:7,
      targetRir:3,
      prescriptionNotes:'Prioriza técnica estable.',
      progression:'Progresa solo con ejecución confirmada.',
      alternativeId:'qa-split-squat',
    }),
    Object.freeze({
      id:'qa-block-row',
      type:'exercise',
      exerciseId:'qa-row',
      sets:1,
      reps:'10-12',
      plannedLoad:'Banda media',
      restSeconds:45,
      tempo:'controlado',
      targetRpe:7,
      targetRir:3,
      prescriptionNotes:'Mantén escápulas controladas.',
      progression:'Aumenta tensión solo si la técnica se conserva.',
      alternativeId:'qa-row-alt',
    }),
  ]),
});

const sportSession=Object.freeze({
  id:'qa-m43-sports-session',
  clientId:CLIENT,
  title:'Entrenamiento guiado · carrera y natación',
  durationMinutes:50,
  status:'disponible',
  visibleToClient:true,
  deliveryModality:'guiada_en_app',
  deliveryOwnership:'guided_in_app',
  clientVisibilityLevel:'full',
  internalNotes:'QA_PRIVATE_COACH_NOTE_NEVER_CLIENT',
  blocks:[
    {id:'qa-block-running',type:'exercise',exerciseId:'qa-carrera-continua',name:'Carrera continua',
      sets:1,reps:'',plannedDurationMinutes:'30',plannedDistanceKm:'5',
      plannedPace:'06:00',restSeconds:0,targetRpe:6,targetRir:0},
    {id:'qa-block-swim',type:'exercise',exerciseId:'qa-natacion-crol',name:'Natación crol en piscina',
      sets:1,reps:'',plannedDurationMinutes:'10',plannedDistanceM:'400',
      plannedPacePer100M:'02:20',poolLengthM:'25',restSeconds:0,targetRpe:6,targetRir:0},
  ],
});
const projectedSports=projectCollectionsForRole({
  sessions:[sportSession,{...sportSession,id:'qa-private',status:'borrador',visibleToClient:false,title:'QA_PRIVATE_SESSION'}],
},{id:'qa-client-role',role:'client',clientId:CLIENT});
if(projectedSports.sessions.length!==1)throw new Error('M43_BROWSER_CLIENT_PROJECTION_INVALID');
const session=scenario==='sports'?(role==='client'?projectedSports.sessions[0]:sportSession):defaultSession;

const execution=createExecution({session,clientId:CLIENT,executionId:'qa-live-workout-execution'});
const actionState=createActionState();
const persisted=[];
const errors=[];
const telemetry=[];
let exits=0;

const recoveryCoordinator=Object.freeze({
  async persist(payload){
    persisted.push(structuredClone(payload));
  },
  async settle(){},
  async synchronize(){
    return {online:true,flushed:0,deferred:0,remaining:0};
  },
});

const context={
  session,
  execution,
  catalog,
  actionState,
  actor:role==='coach'
    ?{role:'coach',userId:'11111111-1111-4111-8111-111111111111'}
    :{role:'client',clientId:CLIENT},
  recoveryCoordinator,
  appointmentId:'qa-live-workout-appointment',
  sessionRevision:1,
  online:true,
  onExit(){exits+=1;},
};

function render(){
  root.innerHTML=renderGuidedExecution({
    execution,
    session,
    catalog,
    actionState,
    role,
    mediaMap:null,
  });
  root.dataset.qaRole=role;
  root.dataset.qaStatus=execution.status;
}

const controller=createSessionController({
  root,
  getContext:()=>context,
  render,
  onError(error){errors.push(String(error?.message||error));},
  autosaveDelayMs:60,
  liveTelemetryController:{
    async start(){telemetry.push('start');},
    async pause(){telemetry.push('pause');},
    async resume(){telemetry.push('resume');},
    async stop(_execution,{reason}={}){telemetry.push('stop:'+String(reason||''));},
  },
  lifecycleTarget:globalThis,
  visibilityTarget:document,
});

render();
controller.mount();

globalThis.__IBERFIT_LIVE_WORKOUT_QA__=Object.freeze({
  mounted:true,
  currentSource:true,
  syntheticQa:true,
  role,
  scenario,
  state(){
    return structuredClone({
      status:execution.status,
      index:execution.index,
      setIndex:execution.setIndex,
      queue:execution.queue,
      results:execution.results,
      skippedSets:execution.skippedSets||{},
      skippedExercises:execution.skippedExercises||[],
      events:execution.events,
      feedback:execution.feedback,
      finalFeedbackDraft:execution.finalFeedbackDraft||null,
      activeSetDraft:execution.activeSetDraft||null,
      syncStatus:execution.syncStatus,
      restUntil:execution.restUntil,
      persistedCount:persisted.length,
      lastPersisted:persisted.at(-1)||null,
      errors:[...errors],
      telemetry:[...telemetry],
      exits,
    });
  },
});
