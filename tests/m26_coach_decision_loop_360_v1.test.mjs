import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  renderExpedienteRoute,
  renderSessionsRoute,
} from '../src/m26/modules/route-render.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';

function prep(overrides={}){
  return {
    kind:'next-session-preparation',
    clientId,
    session:{id:'session-1',title:'Fuerza A',status:'publicado',startable:true,source:'appointment'},
    appointment:{id:'appt-1',startAt:'2026-10-06T14:00:00Z',endAt:'2026-10-06T15:00:00Z',modality:'presencial',location:'IBERFIT'},
    iri:null,
    progress:{
      plannedSessions:4,
      completedSessions:3,
      adherence:.75,
      adherencePercent:75,
      averageRpe:7.4,
      lastExecutionRpe:8,
      lastExecutionAt:'2026-10-04T14:00:00Z',
      latestCheckinAt:'2026-10-05T10:00:00Z',
      latestCheckin:{energy:7,sleep:7,stress:3,pain:0,fatigue:4,motivation:8},
      checkinAverage:null,
      dataQuality:'media',
      unconfirmedExecutions:0,
    },
    lastExecution:{
      id:'execution-1',
      sessionId:'session-0',
      completedAt:'2026-10-04T14:00:00Z',
      feedback:{sessionRpe:8,comment:'Buena sesión.',pain:false,painNotes:null},
    },
    exerciseMemory:[],
    decisions:{
      total:0,
      openCount:0,
      closedCount:0,
      overdueCount:0,
      dueTodayCount:0,
      open:[],
      recentClosed:[],
      needsReview:null,
    },
    reviewRequired:false,
    reviewReasons:[],
    evidence:{
      dataQuality:'media',
      exerciseMemories:0,
      openDecisions:0,
      hasIri:false,
      hasRecentExecution:true,
      hasRecentCheckin:true,
    },
    safety:{
      automaticLoadChange:false,
      automaticExerciseChange:false,
      automaticClinicalDecision:false,
      coachConfirmationRequired:true,
      note:'Resumen informativo para el Coach. No modifica cargas, ejercicios, planificación ni mensajes automáticamente.',
    },
    ...overrides,
  };
}

test('expediente Coach exposes one canonical Action Outcome host for the selected client',()=>{
  const html=renderExpedienteRoute({
    kind:'expediente',
    role:'coach',
    serviceKind:'training',
    summary:{
      id:clientId,
      name:'Ana Demo',
      modality:'Presencial',
      status:'Activa',
      accessKnown:true,
      access:'Activo',
      profile:{completeness:100,missing:[],primaryObjective:'Fuerza'},
      iri:null,
      experience:{serviceKind:'training',stageLabel:'Seguimiento activo'},
      cycle:null,
      nextAppointment:null,
      nextAction:{label:'Revisar seguimiento',area:'progreso'},
      counts:{sessions:1,executions:1},
    },
    progress:{
      lastExecutionAt:'2026-10-04T14:00:00Z',
      lastExecutionRpe:8,
      adherence:.75,
      completedSessions:3,
      plannedSessions:4,
      unconfirmedExecutions:0,
      latestCheckin:null,
      wearable:{metrics:{},providers:[],daysWithData:0,latestDate:null,freshness:'sin_datos',quality:'limitada'},
    },
    exercisePerformance:[],
    exerciseProgress:{totalExercises:0,items:[]},
    nextSessionPreparation:prep(),
    coachCockpit:{items:[]},
    alerts:[],
    alertSignal:{label:'Seguimiento al día',level:'neutral'},
  });

  assert.match(html,/data-coach-client-workspace/u);
  assert.match(html,/data-action-outcome-host/u);
  assert.match(html,/data-action-outcome-mode="workspace"/u);
  assert.match(html,new RegExp(`data-client-id="${clientId}"`,'u'));
  assert.match(html,/Señal → decisión → acción → resultado/u);
});

test('next-session preparation makes follow-up the primary action only when review is required',()=>{
  const html=renderSessionsRoute({
    kind:'sesion',
    role:'coach',
    serviceKind:'training',
    serviceActive:true,
    canBuild:true,
    sessions:[],
    sessionCounts:{published:1},
    executions:[],
    nextSessionPreparation:prep({
      reviewRequired:true,
      reviewReasons:[{kind:'pain',label:'La última sesión registró dolor; revisa el contexto antes de decidir.'}],
      decisions:{
        total:1,openCount:1,closedCount:0,overdueCount:1,dueTodayCount:0,
        open:[{
          id:'decision-1',
          signalSummary:'Dolor tras la sesión.',
          decisionSummary:'Revisar dosis.',
          interventionSummary:'Mantener carga y reducir densidad.',
          expectedOutcome:'Menor dolor.',
          reviewAt:'2026-10-05',
        }],
        recentClosed:[],
        needsReview:null,
      },
    }),
  });

  assert.match(html,/class="m26-primary-action"[^>]*data-m26-coach-action="true"/u);
  assert.match(html,/data-m26-target-area="expediente"/u);
  assert.match(html,/data-m26-target-focus="action-outcome">Revisar seguimiento antes de entrenar/u);
  assert.match(html,/data-workflow-action="open-session-builder">Revisar sesión en constructor/u);
  assert.doesNotMatch(html,/class="m26-primary-action" data-workflow-action="open-session-builder"/u);
  assert.match(html,/Iniciar sesión preparada/u);
});

test('completed Coach session hands off to follow-up instead of a generic expediente action',()=>{
  const html=renderGuidedExecution({
    execution:{
      id:'execution-1',
      clientId,
      sessionId:'session-1',
      status:'completed',
      syncStatus:'clean',
      accumulatedActiveMs:3_600_000,
      results:{},
      queue:[],
      feedback:{sessionRpe:7,comment:'Correcta.',pain:false,painNotes:''},
    },
    session:{id:'session-1',clientId,title:'Fuerza A'},
    role:'coach',
  });

  assert.match(html,/Revisar seguimiento/u);
  assert.match(html,/data-m26-target-area="expediente"/u);
  assert.match(html,/La sesión está cerrada/u);
  assert.doesNotMatch(html,/>Abrir expediente</u);
});

test('Action Outcome workspace uses progressive disclosure and prioritizes pending history',()=>{
  const source=fs.readFileSync(
    new URL('../src/m26/engagement/engagement-controller.js',import.meta.url),
    'utf8',
  );
  assert.match(source,/function actionOutcomeManagerForClient\(root,clientId/u);
  assert.match(source,/function actionOutcomeTargets\(root\)/u);
  assert.match(source,/\[data-action-outcome-host\]\[data-client-id\]/u);
  assert.match(source,/workspaceMode&&\(summaryData\.overdueCount>0\|\|workspacePriority==='review'\)/u);
  assert.match(source,/const signature=`\$\{mode\}:\$\{workspacePriority\}:/u);
  assert.match(source,/className='m26-action-outcome-new'/u);
  assert.match(source,/1 · Señal y criterio/u);
  assert.match(source,/2 · Intervención/u);
  assert.match(source,/3 · Cuándo revisar/u);
  assert.match(source,/manager\.append\(summary,metrics,managerFeedback,intro,history,formDisclosure\)/u);
  assert.match(source,/setStatus\(confirmed\|\|root,'action-manager','Decisión registrada/u);
  assert.match(source,/setStatus\(confirmed\|\|root,'action-manager','Resultado confirmado/u);
});

test('decision workspace remains touch-friendly and single-column on small screens',()=>{
  const css=fs.readFileSync(
    new URL('../src/m26/design/premium-ux.css',import.meta.url),
    'utf8',
  );
  assert.match(css,/\.m26-action-outcome-manager\.is-workspace/u);
  assert.match(css,/\.m26-action-outcome-new>summary\{[\s\S]*min-height:2\.9rem/iu);
  assert.match(css,/@media \(max-width:580px\)[\s\S]*\.m26-action-outcome-fieldset\{grid-template-columns:minmax\(0,1fr\)\}/u);
});
