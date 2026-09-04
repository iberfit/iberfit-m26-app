import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildSessionReadinessSnapshot} from '../src/m26/ui/session-readiness.js';

const clientId='client-session-readiness';
const now=new Date('2026-09-04T12:00:00Z');

function baseState(){
  return {
    identity:{role:'client',clientId},
    collections:{
      appointments:[{
        id:'appt-today',clientId,sessionId:'session-today',
        startAt:'2026-09-04T18:00:00Z',status:'confirmed',visibleToClient:true,
        title:'Sesión de fuerza',modality:'presencial',location:'Las Condes',
      }],
      sessionExecutions:[],
      iriAssessments:[],
      checkins:[],
      wearableDailySummaries:[],
      wearableConnections:[],
      trainingCycles:[],
      clientProfiles:[],
    },
    communication:{available:true,threads:[],notifications:[]},
    pendingOperations:[],conflicts:[],rejectedOperations:[],
  };
}

test('permite inicio directo solo cuando la sesión de hoy está vinculada y no requiere revisión',()=>{
  const snapshot=buildSessionReadinessSnapshot(baseState(),clientId,{now});
  assert.equal(snapshot.level,'normal');
  assert.equal(snapshot.reviewRequired,false);
  assert.equal(snapshot.sessionId,'session-today');
  assert.equal(snapshot.directStartAllowed,true);
  assert.equal(snapshot.dataQuality,'limitada');
  assert.equal(snapshot.checkin,null);
});

test('dolor confirmado elevado convierte la entrada directa en revisión antes de entrenar',()=>{
  const state=baseState();
  state.collections.checkins.push({
    id:'checkin-pain',clientId,createdAt:'2026-09-04T10:00:00Z',
    energy:6,sleep:7,stress:4,pain:7,
  });
  const snapshot=buildSessionReadinessSnapshot(state,clientId,{now});
  assert.equal(snapshot.level,'hold');
  assert.equal(snapshot.reviewRequired,true);
  assert.equal(snapshot.directStartAllowed,false);
  assert.equal(snapshot.topAlert.id,'pain-high');
  assert.match(snapshot.title,/Revisión antes de entrenar/i);
  assert.match(snapshot.copy,/requiere revisión/i);
});

test('recuperación condicionada conserva la sesión publicada pero exige revisar contexto',()=>{
  const state=baseState();
  state.collections.checkins.push({
    id:'checkin-recovery',clientId,createdAt:'2026-09-04T10:00:00Z',
    energy:3,sleep:4,stress:5,pain:1,
  });
  const snapshot=buildSessionReadinessSnapshot(state,clientId,{now});
  assert.equal(snapshot.level,'reduced');
  assert.equal(snapshot.reviewRequired,true);
  assert.equal(snapshot.directStartAllowed,false);
  assert.equal(snapshot.topAlert.id,'recovery-context');
  assert.match(snapshot.copy,/no cambia automáticamente/i);
});

test('sin sesión vinculada nunca anuncia inicio directo',()=>{
  const state=baseState();
  state.collections.appointments[0].sessionId=null;
  const snapshot=buildSessionReadinessSnapshot(state,clientId,{now});
  assert.equal(snapshot.sessionId,null);
  assert.equal(snapshot.directStartAllowed,false);
});

test('la preparación reutiliza motores existentes y mantiene DOM y seguridad fail-closed',async()=>{
  const [ui,shell,workflow]=await Promise.all([
    readFile(new URL('../src/m26/ui/session-readiness.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8'),
  ]);
  assert.match(ui,/buildAdaptiveSessionContext/);
  assert.match(ui,/buildClientHomeSnapshot/);
  assert.match(ui,/Antes de entrenar/);
  assert.match(ui,/data-m27-session-readiness/);
  assert.match(ui,/start-published-session/);
  assert.match(ui,/data-entity-id/);
  assert.match(ui,/El plan publicado no cambia automáticamente/i);
  assert.doesNotMatch(ui,/MutationObserver/);
  assert.doesNotMatch(ui,/innerHTML/);
  assert.doesNotMatch(ui,/service[_-]?role/i);
  assert.match(shell,/enhanceProgressContinuity\(\{root,viewModel,state\}\);\s*enhanceSessionReadiness\(\{root,viewModel,state\}\);/);
  assert.match(workflow,/function startSession\(button\)/);
  assert.match(workflow,/requestedId/);
  assert.match(workflow,/data-workflow-action/);
});
