import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {buildNextSessionPreparation,buildTrainingSinceLastCoachReview,summarizeConfirmedSessionSets} from '../src/m26/intelligence/next-session-prep.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';
import {renderExpedienteRoute,renderSessionsRoute} from '../src/m26/modules/route-render.js';

const clientId='11111111-1111-4111-8111-111111111111';
const now=new Date('2026-09-13T18:00:00Z');

function baseState(){
  return {
    selectedClientId:clientId,
    identity:{id:'coach-1',role:'coach'},
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
    collections:{
      clients:[{id:clientId,name:'Cliente QA'}],
      appointments:[{
        id:'appt-1',clientId,status:'confirmada',
        sessionId:'session-published',
        startAt:'2026-09-14T14:00:00Z',
        endAt:'2026-09-14T15:00:00Z',
        modality:'presencial',
        location:'Estudio IBERFIT',
      }],
      sessions:[{
        id:'session-published',clientId,status:'publicado',revision:3,
        title:'Fuerza A',
        blocks:[{id:'b1',type:'exercise',exerciseId:'squat',sets:3}],
        updatedAt:'2026-09-12T12:00:00Z',
      }],
      sessionExecutions:[{
        id:'exec-confirmed',clientId,status:'completed',syncStatus:'clean',
        sessionId:'session-published',completedAt:'2026-09-11T14:45:00Z',
        results:{
          'squat:1':{exerciseId:'squat',setNumber:1,reps:8,load:'50 kg',rpe:7,rir:3,completedAt:'2026-09-11T14:10:00Z'},
          'squat:2':{exerciseId:'squat',setNumber:2,reps:8,load:'52.5 kg',rpe:8,rir:2,completedAt:'2026-09-11T14:15:00Z'},
        },
        feedback:{sessionRpe:8,comment:'Sesión sólida.',pain:false},
      }],
      checkins:[{
        id:'checkin-1',clientId,recordedAt:'2026-09-13T09:00:00Z',
        energy:7,sleep:8,stress:3,pain:1,fatigue:4,motivation:8,
      }],
      iriAssessments:[{
        id:'iri-1',clientId,status:'completada',
        assessmentDate:'2026-08-01',
        firstSessionCompletedAt:'2026-08-01T12:00:00Z',
      }],
      m26Entities:[{
        entityType:'action_outcome',
        entityId:'22222222-2222-4222-8222-222222222222',
        clientId,status:'abierto',revision:1,
        body:{
          id:'22222222-2222-4222-8222-222222222222',
          clientId,status:'abierto',revision:1,visibleToClient:false,
          signalSource:'session',
          signalSummary:'RPE alto en accesorios.',
          decisionSummary:'Mantener técnica y revisar densidad.',
          interventionType:'recovery',
          interventionSummary:'Más descanso entre bloques.',
          expectedOutcome:'RPE estable.',
          reviewAt:'2026-09-12',
          createdAt:'2026-09-10T12:00:00Z',
          updatedAt:'2026-09-10T12:00:00Z',
        },
      }],
      trainingCycles:[],reports:[],clientProfiles:[],wearableDailySummaries:[],
      wearableConnections:[],habitLogs:[],habits:[],privateNotes:[],
      intelligenceRuns:[],iriExternalReports:[],
    },
  };
}

test('Coach last closed review is one-pass, owner-scoped, civil-date valid and stable on ties',()=>{
  const state=baseState();
  const closed=[
    ...Array.from({length:1200},(_,i)=>({
      id:'old-'+i,clientId,status:'cerrado',reviewedAt:'2026-08-25',
    })),
    {id:'foreign',clientId:'someone-else',status:'cerrado',reviewedAt:'2026-09-12'},
    {id:'invalid-calendar',clientId,status:'cerrado',reviewedAt:'2026-09-31'},
    {id:'future',clientId,status:'cerrado',reviewedAt:'2026-09-14'},
    {id:'still-open',clientId,status:'abierto',reviewedAt:'2026-09-12'},
    {id:'latest-first',clientId,status:'cerrado',reviewedAt:'2026-09-10'},
    {id:'latest-tie',clientId,status:'cerrado',reviewedAt:'2026-09-10'},
    {id:'earlier',clientId,status:'cerrado',reviewedAt:'2026-09-09'},
  ];
  const before=structuredClone(closed);
  const result=buildTrainingSinceLastCoachReview(state,clientId,{
    now,outcomes:{closed},
  });
  assert.equal(result.available,true);
  assert.equal(result.reviewId,'latest-first','equal dates preserve the earliest input');
  assert.equal(result.reviewedAt,'2026-09-10');
  assert.equal(result.confirmedSessions,1,'only confirmed training since the review is counted');
  assert.equal(result.latestSessionAt,'2026-09-11');
  assert.equal(Object.isFrozen(result),true);
  assert.deepEqual(closed,before,'the selection never sorts or mutates the input');
  assert.equal(buildTrainingSinceLastCoachReview(state,clientId,{
    now,outcomes:{closed:[{id:'invalid',clientId,status:'cerrado',reviewedAt:'2026-09-31'}]},
  }).reason,'no-closed-review');
});

test('next-session brief consolidates confirmed context without mutating state',()=>{
  const state=baseState();
  const before=structuredClone(state);
  const prep=buildNextSessionPreparation(state,clientId,{
    now,
    exerciseName:(id)=>id==='squat'?'Sentadilla':id,
  });

  assert.equal(prep.kind,'next-session-preparation');
  assert.equal(prep.session.id,'session-published');
  assert.equal(prep.session.startable,true);
  assert.equal(prep.session.source,'appointment');
  assert.equal(prep.appointment.id,'appt-1');
  assert.equal(prep.progress.lastExecutionRpe,7.5);
  assert.equal(prep.progress.latestCheckin.pain,1);
  assert.equal(prep.lastExecution.feedback.comment,'Sesión sólida.');
  assert.equal(prep.exerciseMemory[0].exerciseName,'Sentadilla');
  assert.equal(prep.exerciseMemory[0].lastLoad,'52.5 kg');
  assert.equal(prep.decisions.total,1);
  assert.equal(prep.decisions.openCount,1);
  assert.equal(prep.decisions.closedCount,0);
  assert.equal(prep.decisions.overdueCount,1);
  assert.equal(prep.decisions.recentClosed.length,0);
  assert.equal(prep.decisions.needsReview?.id,'22222222-2222-4222-8222-222222222222');
  assert.equal(prep.reviewRequired,true);
  assert.ok(prep.reviewReasons.some((item)=>item.kind==='decision-overdue'));
  assert.ok(prep.reviewReasons.some((item)=>item.kind==='wellbeing'));
  assert.deepEqual(prep.safety,{
    automaticLoadChange:false,
    automaticExerciseChange:false,
    automaticClinicalDecision:false,
    coachConfirmationRequired:true,
    note:'Resumen informativo para el Coach. No modifica cargas, ejercicios, planificación ni mensajes automáticamente.',
  });
  assert.deepEqual(state,before);
});

test('unconfirmed latest execution is excluded from Coach evidence',()=>{
  const state=baseState();
  state.collections.sessionExecutions.push({
    id:'exec-pending',clientId,status:'completed',syncStatus:'pending',
    sessionId:'session-published',completedAt:'2026-09-13T12:00:00Z',
    results:{'squat:1':{exerciseId:'squat',setNumber:1,reps:2,load:'100 kg',rpe:10}},
    feedback:{sessionRpe:10,comment:'NO DEBE APARECER',pain:true},
  });
  state.pendingOperations.push({
    type:'EJECUCION_COMPLETAR',entityId:'exec-pending',clientId,
  });

  const prep=buildNextSessionPreparation(state,clientId,{now});
  assert.equal(prep.lastExecution.id,'exec-confirmed');
  assert.equal(prep.lastExecution.feedback.comment,'Sesión sólida.');
  assert.notEqual(prep.exerciseMemory[0]?.lastLoad,'100 kg');
  assert.ok(prep.progress.unconfirmedExecutions>=1);
  assert.ok(prep.reviewReasons.some((item)=>item.kind==='data'));
});

test('draft fallback is reviewable but never startable',()=>{
  const state=baseState();
  state.collections.appointments=[];
  state.collections.sessions=[{
    id:'session-draft',clientId,status:'borrador',revision:4,
    title:'Borrador de fuerza',updatedAt:'2026-09-13T12:00:00Z',
  }];

  const prep=buildNextSessionPreparation(state,clientId,{now});
  assert.equal(prep.session.id,'session-draft');
  assert.equal(prep.session.status,'borrador');
  assert.equal(prep.session.startable,false);
  assert.equal(prep.session.source,'draft-fallback');

  const html=renderSessionsRoute({
    kind:'sesion',role:'coach',canBuild:true,
    sessions:[],sessionCounts:{published:0},executions:[],
    nextSessionPreparation:prep,
  });
  assert.match(html,/Preparar próxima sesión/u);
  assert.match(html,/Continuar o crear sesión/u);
  assert.doesNotMatch(html,/Adaptar una copia de esta sesión/u);
  assert.doesNotMatch(html,/Comenzar entrenamiento preparado/u);
});

test('published preparation exposes explicit start action and safety copy',()=>{
  const prep=buildNextSessionPreparation(baseState(),clientId,{now});
  const html=renderSessionsRoute({
    kind:'sesion',role:'coach',canBuild:true,
    sessions:[{id:'session-published',title:'Fuerza A',publication:{status:'published',visibleToClient:true}}],
    sessionCounts:{published:1},executions:[],
    nextSessionPreparation:prep,
  });
  assert.match(html,/data-next-session-preparation/u);
  assert.match(html,/Comenzar entrenamiento preparado/u);
  assert.match(html,/data-entity-id="session-published"/u);
  assert.match(html,/no modifica cargas, ejercicios, planificación ni mensajes automáticamente/iu);
});

test('Coach dossier acts on the prepared session without forcing a second navigation choice',()=>{
  const state=baseState();
  const shell={activeArea:'expediente',identity:{id:'coach-1',role:'coach'},page:{title:'Expediente'}};
  const vm=createRouteViewModel(shell,state,now,{catalog:[{id:'squat',name:'Sentadilla'}]});
  const html=renderExpedienteRoute(vm);

  assert.match(html,/data-coach-client-workspace/u);
  assert.match(html,/Plan actual/u);
  assert.match(html,/Abrir planificación/u);
  assert.match(
    html,
    /data-workflow-action="start-published-session"[\s\S]{0,180}?data-entity-id="session-published"/u,
  );
  assert.match(html,/Comenzar entrenamiento preparado/u);
  assert.doesNotMatch(
    html,
    /data-m26-area="sesion">Comenzar entrenamiento preparado/u,
  );

  // Review signals remain visible and the direct start is secondary, so the
  // Coach keeps the final decision instead of bypassing the review context.
  assert.equal(vm.nextSessionPreparation.reviewRequired,true);
  assert.match(
    html,
    /class="m26-text-action"[\s\S]{0,180}?data-workflow-action="start-published-session"/u,
  );
});

test('Coach dossier opens the canonical builder directly when no session exists',()=>{
  const state=baseState();
  state.collections.appointments=[];
  state.collections.sessions=[];
  const shell={activeArea:'expediente',identity:{id:'coach-1',role:'coach'},page:{title:'Expediente'}};
  const vm=createRouteViewModel(shell,state,now,{catalog:[{id:'squat',name:'Sentadilla'}]});
  const html=renderExpedienteRoute(vm);

  assert.equal(vm.nextSessionPreparation.session.id,null);
  assert.match(
    html,
    /data-workflow-action="open-session-builder">Preparar sesión<\/button>/u,
  );
});

test('session route VM gives preparation to Coach/Admin, never to Cliente',()=>{
  const state=baseState();
  const coachShell={activeArea:'sesion',identity:{id:'coach-1',role:'coach'},page:{title:'Sesión'}};
  const coach=createRouteViewModel(coachShell,state,now,{catalog:[{id:'squat',name:'Sentadilla'}]});
  assert.equal(coach.kind,'sesion');
  assert.equal(coach.nextSessionPreparation?.clientId,clientId);

  const clientState=baseState();
  clientState.identity={id:'client-user',role:'client',clientId};
  const clientShell={activeArea:'sesion',identity:{id:'client-user',role:'client',clientId},page:{title:'Sesión'}};
  const client=createRouteViewModel(clientShell,clientState,now,{catalog:[{id:'squat',name:'Sentadilla'}]});
  assert.equal(client.kind,'sesion');
  assert.equal(client.nextSessionPreparation,null);
});

test('responsive preparation styling and PWA shell are protected',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/premium-ux.css',import.meta.url),'utf8');
  const sw=fs.readFileSync(new URL('../public/m26/sw.js',import.meta.url),'utf8');
  const source=fs.readFileSync(new URL('../src/m26/intelligence/next-session-prep.js',import.meta.url),'utf8');

  assert.match(css,/NEXT_SESSION_PREPARATION_V1_BEGIN/u);
  assert.match(css,/\.m26-next-session-prep/u);
  assert.match(css,/@media\(max-width:980px\)/u);
  assert.match(css,/@media\(max-width:760px\)/u);
  assert.match(css,/@media\(max-width:520px\)/u);
  assert.match(sw,/\/src\/m26\/intelligence\/next-session-prep\.js/u);
  assert.doesNotMatch(source,/automaticLoadChange:true/u);
  assert.doesNotMatch(source,/automaticExerciseChange:true/u);
  assert.doesNotMatch(source,/automaticClinicalDecision:true/u);
});

test('Coach preparation always keeps the INITIAL IRI when newer follow-ups exist',()=>{
  const state=baseState();
  state.collections.iriAssessments=[
    {id:'initial-older',clientId,assessmentType:'inicial',assessmentDate:'2026-07-01',status:'completada'},
    {id:'followup-newest',clientId,assessmentType:'evolution-followup',assessmentDate:'2026-09-12',status:'completada'},
    {id:'initial-newer',clientId,assessmentType:'iri-initial-diagnostic',assessmentDate:'2026-08-02',status:'completada'},
    {id:'conflicting',clientId,assessmentType:'initial',body:{kind:'evolution-followup'},assessmentDate:'2026-09-13',status:'completada'},
    {id:'foreign',clientId:'another-client',assessmentType:'initial',assessmentDate:'2026-09-13',status:'completada'},
  ];
  const prep=buildNextSessionPreparation(state,clientId,{now});
  assert.equal(prep.iri?.assessmentId,'initial-newer');
  assert.equal(prep.iri?.assessmentDate,'2026-08-02');
  assert.notEqual(prep.iri?.assessmentId,'followup-newest');
});

test('only longitudinal follow-ups never manufacture a Coach initial IRI',()=>{
  const state=baseState();
  state.collections.iriAssessments=[
    {id:'follow-only',clientId,assessmentType:'evolution-followup',
      assessmentDate:'2026-09-12',status:'completada'},
  ];
  const prep=buildNextSessionPreparation(state,clientId,{now});
  assert.equal(prep.iri,null);
  assert.equal(prep.evidence.hasIri,false);
});

test('Coach next session selection retains published priority and stable ties without sorting history',()=>{
  const state=baseState();
  state.collections.appointments=[];
  state.collections.sessions=[
    {id:'draft-later',clientId,status:'borrador',updatedAt:'2026-09-13T09:00:00Z'},
    {id:'published-first',clientId,status:'publicado',updatedAt:'2026-09-12T09:00:00Z'},
    {id:'published-same-time',clientId,status:'publicado',updatedAt:'2026-09-12T09:00:00Z'},
  ];
  const prep=buildNextSessionPreparation(state,clientId,{now});
  assert.equal(prep.session.id,'published-first');
  assert.equal(prep.session.startable,true);
  assert.equal(prep.session.source,'published');
});

test('Coach wellbeing comparison uses four most recent owner records with stable ordering',()=>{
  const state=baseState();
  const olderDay=(day,energy)=>({
    id:'checkin-'+day,clientId,recordedAt:'2026-09-'+String(day).padStart(2,'0')+'T10:00:00Z',
    energy,sleep:6,stress:4,fatigue:4,motivation:6,pain:0,
  });
  state.collections.checkins=[
    olderDay(9,6),olderDay(12,2),olderDay(8,10),
    olderDay(10,6),olderDay(11,2),
    {id:'foreign-checkin',clientId:'another-client',recordedAt:'2026-09-13T10:00:00Z',
      energy:10,sleep:10,stress:0,fatigue:0,motivation:10},
  ];
  const prep=buildNextSessionPreparation(state,clientId,{now});
  assert.equal(prep.wellbeingShift.available,true);
  assert.equal(prep.wellbeingShift.checkins,4);
  const energy=prep.wellbeingShift.signals.find(item=>item.key==='energy');
  assert.equal(energy?.delta,-4);
  assert.equal(energy?.recent,2);
  assert.equal(energy?.previous,6);
});

test('Coach sees immutable prescription vs confirmed execution sets without treating missing as performed',()=>{
  const state=baseState();
  const e=state.collections.sessionExecutions[0];
  e.queue=[{blockId:'b1',exerciseId:'squat',sets:3}];
  e.planSnapshot={sessionId:'session-published',
    queue:[{blockId:'b1',exerciseId:'squat',sets:2}],
    blocks:[{id:'b1',type:'exercise',exerciseId:'squat',sets:2}]};
  e.results={'b1:squat:1':{exerciseId:'squat',reps:8,load:'50 kg'}};
  e.skippedSets={'b1:squat:2':{reason:'Revisión del Coach'}};
  const prep=buildNextSessionPreparation(state,clientId,{now});
  assert.deepEqual(prep.lastExecution.seriesEvidence,{
    plannedSets:2,executionSets:3,recordedSets:1,skippedSets:1,
    unrecordedSets:1,source:'completed-confirmed-snapshot',
  });
  const html=renderSessionsRoute({
    kind:'sesion',role:'coach',canBuild:true,serviceKind:'training',
    sessions:[],sessionCounts:{published:0},executions:[],
    nextSessionPreparation:prep,
  });
  assert.match(html,/data-m26-coach-plan-executed/u);
  assert.match(html,/Plan original: 2 series/u);
  assert.match(html,/1 registradas/u);
  assert.match(html,/1 sin registro/u);
  assert.match(html,/los datos ausentes no cuentan como realizados/u);
});

test('Coach summary does not invent a plan when historic execution lacks a verified immutable snapshot',()=>{
  const state=baseState();
  const e=state.collections.sessionExecutions[0];
  e.queue=[{blockId:'b1',exerciseId:'squat',sets:3}];
  e.results={'b1:squat:1':{reps:8}};
  assert.equal(summarizeConfirmedSessionSets(e),null);
  e.planSnapshot={sessionId:'some-other-session',
    queue:[{blockId:'b1',exerciseId:'squat',sets:3}]};
  assert.equal(summarizeConfirmedSessionSets(e),null);
  e.planSnapshot.sessionId=e.sessionId;
  delete e.results;
  assert.equal(summarizeConfirmedSessionSets(e),null);
  const prep=buildNextSessionPreparation(state,clientId,{now});
  assert.equal(prep.lastExecution.seriesEvidence,null);
  const html=renderSessionsRoute({kind:'sesion',role:'coach',
    sessions:[],sessionCounts:{published:0},nextSessionPreparation:prep,
    serviceKind:'training'});
  assert.doesNotMatch(html,/data-m26-coach-plan-executed/u);
});

test('two identical exercise IDs in distinct blocks cannot double-count legacy results',()=>{
  const execution={
    sessionId:'session-1',status:'completed',syncStatus:'clean',
    planSnapshot:{sessionId:'session-1',queue:[
      {blockId:'b1',exerciseId:'squat',sets:1},
      {blockId:'b2',exerciseId:'squat',sets:1},
    ]},
    queue:[
      {blockId:'b1',exerciseId:'squat',sets:1},
      {blockId:'b2',exerciseId:'squat',sets:1},
    ],
    results:{'squat:1':{reps:8}},
  };
  const report=summarizeConfirmedSessionSets(execution);
  assert.equal(report.recordedSets,1);
  assert.equal(report.unrecordedSets,1);
  execution.results['b2:squat:1']={reps:6};
  assert.equal(summarizeConfirmedSessionSets(execution).recordedSets,2);
});

test('contradictory skipped and performed set cannot be reported as confirmed evidence',()=>{
  const e={sessionId:'session-1',queue:[{blockId:'b1',exerciseId:'squat',sets:1}],
    planSnapshot:{sessionId:'session-1',queue:[{blockId:'b1',exerciseId:'squat',sets:1}]},
    results:{'b1:squat:1':{reps:8}},
    skippedSets:{'b1:squat:1':{reason:'Marca contradictoria'}}};
  assert.equal(summarizeConfirmedSessionSets(e),null);
});

test('completed owner-scoped wrapper uses canonical nested queue, and never treats missing data as zero',()=>{
  const rec={id:'wrapper',clientId,status:'completed',syncStatus:'clean',
    body:{id:'wrapper',clientId,status:'completed',syncStatus:'clean',
      sessionId:'session-published',
      planSnapshot:{sessionId:'session-published',queue:[{blockId:'b1',exerciseId:'squat',sets:2}]},
      queue:[{blockId:'b1',exerciseId:'squat',sets:2}],
      results:{'b1:squat:1':{reps:8},'b1:squat:2':{reps:false}}},
  };
  const result=summarizeConfirmedSessionSets(rec);
  assert.equal(result?.recordedSets,1);
  assert.equal(result?.unrecordedSets,1);
  rec.body.results['b1:squat:2']={reps:'8'};
  assert.equal(summarizeConfirmedSessionSets(rec)?.recordedSets,2);
});

test('Coach preview refuses pending or incomplete executions even if they carry results',()=>{
  const item={sessionId:'session-published',status:'completed',syncStatus:'pending',
    planSnapshot:{sessionId:'session-published',queue:[{blockId:'b1',exerciseId:'squat',sets:1}]},
    queue:[{blockId:'b1',exerciseId:'squat',sets:1}],
    results:{'b1:squat:1':{reps:8}}};
  assert.equal(summarizeConfirmedSessionSets(item),null);
  item.syncStatus='clean';
  item.status='active';
  assert.equal(summarizeConfirmedSessionSets(item),null);
  item.status='completed';
  assert.equal(summarizeConfirmedSessionSets(item)?.recordedSets,1);
});
