import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveAdaptiveExperience} from '../src/m26/experience/adaptive-experience.js';
import {deriveCoachCockpit} from '../src/m26/experience/coach-cockpit.js';
import {deriveAdminCommandCenter} from '../src/m26/admin/command-center.js';
import {createProductionState,stateFromBootstrap} from '../src/m26/production-state.js';
import {createShellViewModel} from '../src/m26/shell/shell-view-model.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';

const baseAction={key:'view_next_appointment',label:'Ver próxima cita',area:'agenda',reason:'Tienes una próxima cita confirmada.'};

test('el recorrido estructural no es desplazado por contexto adaptativo antes de estar activo',()=>{
  const result=deriveAdaptiveExperience({
    experience:{stage:'planning',stageLabel:'Planificación pendiente'},
    baseAction:{key:'prepare_plan',label:'Preparar planificación',area:'planificacion',reason:'Falta planificación.'},
    adaptiveContext:{decision:{level:'hold'},evidence:{dataQuality:'alta'}},
    role:'coach',
  });
  assert.equal(result.level,'structural');
  assert.equal(result.action.key,'prepare_plan');
  assert.equal(result.coachReviewRequired,false);
});

test('cliente activo con hold recibe una acción segura sin cambio automático de entrenamiento',()=>{
  const result=deriveAdaptiveExperience({
    experience:{stage:'active',stageLabel:'Seguimiento activo'},
    baseAction,
    adaptiveContext:{decision:{level:'hold'},evidence:{dataQuality:'alta'}},
    role:'client',
  });
  assert.equal(result.kind,'critical');
  assert.equal(result.action.area,'actividad');
  assert.equal(result.action.key,'review_wellbeing');
  assert.equal(result.coachReviewRequired,true);
  assert.match(result.reason,/Coach/);
});

test('Coach y Admin comparten prioridad pero Admin no recibe detalle sensible',()=>{
  const adaptiveContext={decision:{level:'reduced'},evidence:{dataQuality:'alta'}};
  const coach=deriveAdaptiveExperience({experience:{stage:'active'},baseAction,adaptiveContext,role:'coach'});
  const admin=deriveAdaptiveExperience({experience:{stage:'active'},baseAction,adaptiveContext,role:'admin'});
  assert.equal(coach.kind,'warning');
  assert.equal(admin.kind,'warning');
  assert.equal(coach.coachReviewRequired,true);
  assert.equal(admin.action.label,'Confirmar revisión del Coach');
  assert.doesNotMatch(`${admin.reason} ${admin.action.reason}`,/dolor|pain|sueño|stress|estrés|RPE|RIR/i);
});

test('Coach Cockpit eleva Adaptive Experience a prioridad operativa',()=>{
  const adaptive=deriveAdaptiveExperience({
    experience:{stage:'active'},baseAction,
    adaptiveContext:{decision:{level:'hold'},evidence:{}},
    role:'coach',
  });
  const cockpit=deriveCoachCockpit([{client:{id:'C1',name:'Ana',experience:{stage:'active',stageLabel:'Seguimiento activo',priority:5},nextAction:adaptive.action,adaptiveExperience:adaptive},alerts:[]}]);
  assert.equal(cockpit.criticalCount,1);
  assert.equal(cockpit.items[0].source,'adaptive-experience');
  assert.equal(cockpit.items[0].nextAction.label,'Revisar antes de entrenar');
});

test('Admin Command Center prioriza revisión Coach sin exponer el motivo sensible',()=>{
  const adaptive=deriveAdaptiveExperience({
    experience:{stage:'active'},baseAction,
    adaptiveContext:{decision:{level:'hold'},evidence:{}},
    role:'admin',
  });
  const cc=deriveAdminCommandCenter({
    clients:[{id:'C1',name:'Ana',assignments:[{id:'A1'}],coachNames:['Carlos'],experience:{stage:'active',stageLabel:'Seguimiento activo',priority:5},nextAction:adaptive.action,adaptiveExperience:adaptive}],
    coaches:[],tasks:[],
  });
  assert.equal(cc.priorities[0].kind,'critical');
  assert.equal(cc.priorities[0].action.label,'Confirmar revisión del Coach');
  assert.doesNotMatch(cc.priorities[0].action.reason,/dolor|pain|sueño|stress|estrés|RPE|RIR/i);
});

test('Hoy Cliente usa Adaptive Experience como siguiente acción cuando el recorrido está activo',()=>{
  const now=new Date('2026-08-10T12:00:00Z');
  const clientId='C1';
  const state=stateFromBootstrap({
    user:{id:'U1',role:'client',clientId,name:'Ana'},
    canary:{active:true,version:'rc50'},
    serverTime:now.toISOString(),
    data:{
      clients:[{id:clientId,name:'Ana',status:'active',modality:'online'}],
      clientProfiles:[{
        id:'P1',
        clientId,
        birthDate:'1990-05-12',
        sexForNorms:'female',
        email:'ana@example.com',
        phone:'+56912345678',
        modality:'online',
        objective:'Fuerza',
      }],
      iriAssessments:[{id:'I1',clientId,status:'completed',firstSessionCompletedAt:'2026-08-01T10:00:00Z'}],
      trainingCycles:[{id:'CY1',clientId,status:'active',name:'Ciclo 1'}],
      appointments:[{id:'A1',clientId,title:'Sesión',startAt:'2026-08-11T10:00:00Z',status:'confirmado'}],
      checkins:[{id:'CH1',clientId,createdAt:'2026-08-10T09:00:00Z',energy:5,sleep:6,stress:4,pain:8}],
      sessionExecutions:[],
    },
  },createProductionState());
  state.activeArea='hoy';
  const vm=createRouteViewModel(createShellViewModel(state),state,now);
  assert.equal(vm.kind,'hoy');
  assert.equal(vm.clients[0].profile.completeness,100);
  assert.deepEqual(vm.clients[0].profile.missing,[]);
  assert.equal(vm.clients[0].experience.stage,'active');
  assert.equal(vm.clients[0].adaptiveExperience.kind,'critical');
  assert.equal(vm.clients[0].nextAction.key,'review_wellbeing');
});
