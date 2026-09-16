import {renderHoyRoute} from '../../src/m26/modules/route-render.js';
import {renderM26Shell} from '../../src/m26/shell/shell-render.js';
import {createShellViewModel} from '../../src/m26/shell/shell-view-model.js';
import {resolveAdaptiveLayout} from '../../src/m26/shell/shell-controller.js';

const root=document.querySelector('#qa-root');
if(!root)throw new Error('QA_COACH_TODAY_ROOT_MISSING');

const COACH='11111111-1111-4111-8111-111111111111';
const CLIENT_A='22222222-2222-4222-8222-222222222222';
const CLIENT_B='33333333-3333-4333-8333-333333333333';
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
  activeArea:'hoy',
  selectedClientId:CLIENT_A,
  pendingOperations:[],
  conflicts:[],
  rejectedOperations:[],
  metrics:{},
  collections:{
    clients:[
      {id:CLIENT_A,name:'Ana Torres',modality:'hibrido',status:'active'},
      {id:CLIENT_B,name:'Martín Rojas',modality:'presencial',status:'active'},
    ],
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

const coachLaunchJourney=Object.freeze({
  stage:'operational',
  ready:false,
  completedCount:4,
  total:6,
  percent:67,
  source:'synthetic-current-source-qa',
  clientEvidenceCount:2,
  profileVerified:false,
  accountStatusVerified:false,
  milestones:Object.freeze([
    Object.freeze({id:'invited',label:'Identidad Coach',complete:true,evidence:'Identidad autenticada visible'}),
    Object.freeze({id:'activated',label:'Primer acceso',complete:true,evidence:'Sesión autenticada confirmada'}),
    Object.freeze({id:'profile',label:'Perfil operativo',complete:false,evidence:'Pendiente de verificación administrativa'}),
    Object.freeze({id:'client',label:'Primer cliente',complete:true,evidence:'Cliente asignado dentro de tu alcance'}),
    Object.freeze({id:'planning',label:'Primera planificación',complete:true,evidence:'Sesión publicada visible'}),
    Object.freeze({id:'session',label:'Primera sesión',complete:false,evidence:'Sin sesión completada confirmada'}),
  ]),
  nextCoachAction:Object.freeze({area:'agenda',labelKey:'session'}),
});

const baseShellVm=createShellViewModel(state);
const shellVm=Object.freeze({...baseShellVm,coachLaunchJourney});

const priority=Object.freeze({
  clientId:CLIENT_A,
  clientName:'Ana Torres',
  modality:'Híbrido',
  kind:'warning',
  rank:1,
  signalLabel:'Requiere contexto',
  reason:'Revisar feedback de la última sesión',
  detail:'La adherencia reciente necesita una revisión antes de modificar la carga.',
  guidance:'Abrir expediente y confirmar contexto antes de ajustar la siguiente sesión.',
  source:'synthetic-current-source-qa',
  stage:'active',
  stageLabel:'Seguimiento activo',
  actionType:'feedback-review',
  actionTypeLabel:'Revisar feedback',
  attentionWhy:'Existe feedback reciente que puede cambiar la decisión de entrenamiento.',
  actionCtaLabel:'Revisar feedback',
  nextAction:Object.freeze({key:'review_feedback',label:'Abrir expediente',area:'expediente'}),
});

const clients=Object.freeze([
  Object.freeze({
    id:CLIENT_A,name:'Ana Torres',modality:'Híbrido',status:'Activo',accessKnown:true,
    profile:Object.freeze({primaryObjective:'Mejorar fuerza y capacidad funcional',weeklyFrequency:2}),
    iri:Object.freeze({confirmed:true,status:'Completada',coverageCount:7,coverageLabel:'7 de 7 etapas'}),
    experience:Object.freeze({stage:'active',stageLabel:'Seguimiento activo',priority:1}),
    nextAction:Object.freeze({label:'Revisar feedback',area:'expediente',reason:'Feedback pendiente de revisar'}),
    nextAppointment:null,
  }),
  Object.freeze({
    id:CLIENT_B,name:'Martín Rojas',modality:'Presencial',status:'Activo',accessKnown:true,
    profile:Object.freeze({primaryObjective:'Mejorar fuerza general',weeklyFrequency:2}),
    iri:Object.freeze({confirmed:true,status:'Completada',coverageCount:7,coverageLabel:'7 de 7 etapas'}),
    experience:Object.freeze({stage:'active',stageLabel:'Seguimiento activo',priority:3}),
    nextAction:Object.freeze({label:'Revisar seguimiento',area:'expediente',reason:'Seguimiento habitual'}),
    nextAppointment:null,
  }),
]);

const routeVm=Object.freeze({
  kind:'hoy',
  role:'coach',
  appointments:Object.freeze([]),
  proposals:Object.freeze([]),
  upcoming:Object.freeze([]),
  clients,
  coachCockpit:Object.freeze({
    totalClients:2,
    attentionCount:1,
    criticalCount:0,
    warningCount:1,
    processCount:0,
    infoCount:0,
    items:Object.freeze([priority]),
    riskFocus:priority,
  }),
  operations:Object.freeze({pending:0,conflicts:0,rejected:0}),
  alerts:Object.freeze([]),
  alertSignal:Object.freeze({level:'clear',label:'Sin alertas'}),
  serverTime:FIXED_NOW,
});

root.innerHTML=renderM26Shell(shellVm,renderHoyRoute(routeVm));

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

globalThis.__IBERFIT_COACH_TODAY_VISUAL__=Object.freeze({
  mounted:true,
  syntheticQa:true,
  currentSource:true,
  role:'coach',
  activeArea:'hoy',
  adaptiveLayout,
});
