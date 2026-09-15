import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {initialAssessmentPostCreateArea} from '../src/m26/domain/initial-assessment.js';
import {legacyClientDraftPayload} from '../src/m26/workflows/client-onboarding.js';
import {
  normalizeFirstSessionDraft,
  validateFirstSessionDraft,
  buildIriCommandDraftFromFirstSession,
} from '../src/m26/workflows/iri-first-session.js';
import {
  buildIri2DecisionLog,
  buildIriPlanningSeed,
  buildIri2LongitudinalProfile,
  iri2ComparisonSummary,
  IRI_INITIAL_DIAGNOSTIC_KIND,
} from '../src/m26/workflows/iri-2-longitudinal.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {
  createSessionDraft,
  addCatalogExercise,
  acceptSessionPreview,
  validateSessionDraft,
  buildPublishSessionCommand,
} from '../src/m26/workflows/session-builder.js';
import {
  createExecution,
  startExecution,
  recordSet,
  advanceExecution,
  finishExecution,
  buildExecutionCommand,
  markExecutionSync,
} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {buildProgressHub} from '../src/m26/engagement/index.js';

const catalog=createExerciseCatalog(
  JSON.parse(fs.readFileSync(new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url))),
);

const CLIENT_ID='2e8bd266-bff9-4c08-a2ae-e7fdb718a921';
const IRI_ID='475b7ef3-05f1-4dd4-aaf6-c9030d889078';
const EXECUTION_ID='95df6f29-d8f0-4761-9ca5-f514cedc9b20';

function onboardingInput(){
  return {
    name:'Cliente jornada real',
    email:'daily.journey@example.com',
    phone:'+56 9 5555 1111',
    birthDate:'1990-02-03',
    sexForNorms:'female',
    modality:'hibrido',
    weeklyFrequency:'3',
    sessionDurationMinutes:'60',
    primaryObjective:'Mejorar fuerza y condición física de forma progresiva.',
    trainingAddress:'Av. IBERFIT 123',
    commune:'Las Condes',
    preferredSchedule:'Lunes, miércoles y viernes',
    equipment:'TRX, mancuernas',
  };
}

function iriRaw(profile){
  return {
    assessmentDate:'2026-09-14',
    birthDate:profile.birthDate,
    sexForNorms:profile.sexForNorms,
    email:profile.email,
    phone:profile.phone,
    modality:profile.modality,
    trainingAddress:profile.trainingAddress,
    primaryObjective:profile.primaryObjective,
    trainingExperience:'Intermedia',
    availability:'Tres sesiones por semana',
    screeningAccepted:'on',

    weightKg:'65',
    heightCm:'165',
    bodyFatPercent:'25',
    bodyCompositionMethod:'Bioimpedancia',
    bodyCompositionDevice:'IBERFIT',

    mobilitySkipped:'on',
    mobilitySkipReason:'No necesaria para este contrato de continuidad.',

    chairStand30s:'15',
    chairHeightCm:'45',
    chairStandValid:'on',
    pushVariant:'standard',
    pushUps:'10',
    pushValid:'on',
    trxRowRepetitions:'12',
    trxValid:'on',
    frontPlankSeconds:'45',

    cardioSkipped:'on',
    cardioSkipReason:'No necesario para este contrato de continuidad.',

    diagnosisStrengths:'Buena adherencia y control técnico',
    diagnosisPriorities:'Fuerza tren inferior\nControl técnico',
    coachInterpretation:'Perfil apto para iniciar una progresión individualizada y revisable.',
    trainingImplications:'Priorizar técnica, progresión gradual y control de la respuesta.',
    initialPlan:'Ciclo inicial de ocho semanas con tres sesiones semanales de fuerza.',
    recommendedFrequency:'3 sesiones por semana',
    reevaluationDate:'2026-11-14',
    reviewAccepted:'on',
  };
}

test('jornada real mantiene una sola identidad desde alta hasta progreso sin mezclar IRI inicial con evolución',()=>{
  const payload=legacyClientDraftPayload(onboardingInput());
  assert.equal(payload.initialAssessmentMode,'iri');
  assert.equal(payload.inviteClient,true);
  assert.equal(payload.accessEnabled,false);
  assert.equal(initialAssessmentPostCreateArea(payload.initialAssessmentMode),'iri');

  const iriDraft=normalizeFirstSessionDraft(
    iriRaw(payload.profile),
    {id:IRI_ID},
    CLIENT_ID,
  );
  const iriCheck=validateFirstSessionDraft(iriDraft);
  assert.equal(iriCheck.ok,true,iriCheck.errors.join(','));

  const confirmedIri={
    ...buildIriCommandDraftFromFirstSession(iriDraft,{id:IRI_ID}),
    status:'confirmed',
  };
  assert.equal(confirmedIri.clientId,CLIENT_ID);
  assert.equal(confirmedIri.id,IRI_ID);

  const initialProfile=buildIri2LongitudinalProfile({current:iriDraft,history:[]});
  assert.equal(initialProfile.semantics.phase,IRI_INITIAL_DIAGNOSTIC_KIND);
  const initialSummary=iri2ComparisonSummary(initialProfile);
  assert.equal(initialSummary.label,'Diagnóstico IRI inicial');
  assert.match(initialSummary.detail,/punto de partida/u);

  const decisionLog=buildIri2DecisionLog({assessments:[iriDraft]});
  assert.equal(decisionLog.clientId,CLIENT_ID);
  assert.equal(decisionLog.count,1);

  const seed=buildIriPlanningSeed({
    decisionLog,
    profile:{
      weeklyFrequency:payload.profile.weeklyFrequency,
      sessionDurationMinutes:payload.profile.sessionDurationMinutes,
      modality:payload.profile.modality,
    },
  });
  assert.equal(seed.sourceAssessmentId,IRI_ID);
  assert.equal(seed.requiresCoachReview,true);
  assert.equal(seed.suggestedWeeklyFrequency,3);
  assert.equal(seed.suggestedSessionDurationMinutes,60);
  assert.equal(seed.suggestedModality,'hibrido');

  const draft=createSessionDraft({clientId:CLIENT_ID});
  addCatalogExercise(draft,catalog.list()[0].id,catalog,{
    sets:2,
    reps:'10',
    restSeconds:60,
    targetRpe:7,
    targetRir:3,
    prescriptionNotes:'Priorizar técnica estable.',
  });
  assert.equal(validateSessionDraft(draft,catalog).ok,true);
  acceptSessionPreview(draft,catalog);

  const publish=buildPublishSessionCommand(draft,catalog,0);
  assert.equal(publish.type,'SESION_PUBLICAR');
  assert.equal(publish.clientId,CLIENT_ID);
  const session=publish.payload.patch;
  assert.equal(session.clientId,CLIENT_ID);
  assert.equal(session.status,'published');
  assert.equal(session.visibleToClient,true);

  const execution=createExecution({
    session,
    clientId:CLIENT_ID,
    executionId:EXECUTION_ID,
  });
  execution.appointmentId='daily-appt-1';
  startExecution(execution,{actor:{role:'client',clientId:CLIENT_ID}});

  recordSet(execution,session,{reps:10,load:'40 kg',rpe:7,rir:3});
  advanceExecution(execution);
  recordSet(execution,session,{reps:10,load:'42.5 kg',rpe:8,rir:2});
  advanceExecution(execution);
  assert.equal(execution.status,'awaiting_feedback');

  finishExecution(execution,{
    sessionRpe:8,
    comment:'Sesión completada con buena técnica.',
    pain:false,
  });
  assert.equal(execution.status,'completed');
  const completion=buildExecutionCommand(execution);
  assert.equal(completion.type,'EJECUCION_COMPLETAR');
  assert.equal(completion.clientId,CLIENT_ID);

  const clientClosure=renderGuidedExecution({
    execution,
    session,
    catalog,
    role:'client',
  });
  assert.match(clientClosure,/data-m26-area="progreso"/u);
  assert.match(clientClosure,/>Ver mi progreso</u);

  const coachClosure=renderGuidedExecution({
    execution,
    session,
    catalog,
    role:'coach',
  });
  assert.match(coachClosure,/>Abrir Cliente 360</u);
  assert.doesNotMatch(coachClosure,/>Ver mi progreso</u);

  const now=new Date('2026-09-15T12:00:00Z');
  const state={
    collections:{
      appointments:[{
        id:'daily-appt-1',
        clientId:CLIENT_ID,
        sessionId:session.id,
        status:'completed',
        scheduledAt:'2026-09-14T10:00:00Z',
      }],
      sessions:[session],
      sessionExecutions:[execution],
      iriAssessments:[confirmedIri],
      checkins:[
        {id:'daily-checkin-1',clientId:CLIENT_ID,createdAt:'2026-09-14T08:00:00Z',energy:8,sleep:7,stress:3,pain:1},
      ],
      wearableDailySummaries:[],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };

  const progress=buildProgressHub(state,CLIENT_ID,{now});
  assert.equal(progress.clientId,CLIENT_ID);
  assert.equal(Object.hasOwn(progress,'score'),false);
  assert.equal(progress.diagnosticBaseline.id,'iri-diagnosis');
  assert.equal(progress.diagnosticBaseline.available,true);
  assert.equal(progress.diagnosticBaseline.contributesToEvolution,false);
  assert.equal(progress.pillars.some((pillar)=>pillar.id==='iri'),false);
  assert.match(progress.note,/Diagnóstico IRI se conserva aparte como punto de partida/u);

  markExecutionSync(execution,'pending',{operationId:EXECUTION_ID});
  const pendingClosure=renderGuidedExecution({
    execution,
    session,
    catalog,
    role:'client',
  });
  assert.match(pendingClosure,/pendiente de sincronización/iu);
  assert.doesNotMatch(pendingClosure,/data-m26-area="progreso"/u);
});
