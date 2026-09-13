import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {buildNextSessionPreparation} from '../src/m26/intelligence/next-session-prep.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';
import {renderSessionsRoute} from '../src/m26/modules/route-render.js';

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
  assert.equal(prep.decisions.openCount,1);
  assert.equal(prep.decisions.overdueCount,1);
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
  assert.match(html,/Revisar sesión en constructor/u);
  assert.doesNotMatch(html,/Iniciar sesión preparada/u);
});

test('published preparation exposes explicit start action and safety copy',()=>{
  const prep=buildNextSessionPreparation(baseState(),clientId,{now});
  const html=renderSessionsRoute({
    kind:'sesion',role:'coach',canBuild:true,
    sessions:[{id:'session-published',title:'Fuerza A'}],
    sessionCounts:{published:1},executions:[],
    nextSessionPreparation:prep,
  });
  assert.match(html,/data-next-session-preparation/u);
  assert.match(html,/Iniciar sesión preparada/u);
  assert.match(html,/data-entity-id="session-published"/u);
  assert.match(html,/no modifica cargas, ejercicios, planificación ni mensajes automáticamente/iu);
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
