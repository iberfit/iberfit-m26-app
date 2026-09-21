import test from 'node:test';
import assert from 'node:assert/strict';

import {coachLaunchReadiness} from '../src/m26/onboarding/coach-launch-readiness.js';
import {progressiveOnboardingProgress} from '../src/m26/onboarding/progressive-onboarding.js';
import {filterSnapshotForAssignmentScope} from '../src/m26/shared/integration-context.js';

function completeTour(role='coach'){
  const visited=role==='coach'
    ?['coach-today','coach-clients','coach-agenda','coach-library','coach-verification']
    :[];
  return progressiveOnboardingProgress({role,visited});
}

function client(id='c1',overrides={}){
  return {id,name:`Cliente ${id}`,...overrides};
}

function completeProfile(clientId='c1',overrides={}){
  return {
    id:`profile-${clientId}`,
    clientId,
    initialAssessmentMode:'deferred',
    birthDate:'1990-01-10',
    email:`${clientId}@example.test`,
    phone:'+56911111111',
    modality:'online',
    ...overrides,
  };
}

function validCycle(clientId='c1',overrides={}){
  return {
    id:`cycle-${clientId}`,
    clientId,
    name:'Primer ciclo',
    startDate:'2026-09-21',
    endDate:'2026-10-19',
    goal:'Crear una base de trabajo segura',
    ...overrides,
  };
}

function collections({clients=[],clientProfiles=[],trainingCycles=[]}={}){
  return {clients,clientProfiles,trainingCycles};
}

test('tour Coach completado sin cliente operativo no declara readiness',()=>{
  const result=coachLaunchReadiness({
    role:'coach',
    progress:completeTour(),
    collections:collections(),
  });
  assert.equal(result.tourCompleted,true);
  assert.equal(result.clientReady,false);
  assert.equal(result.ready,false);
  assert.equal(result.nextRequirement,'client');
});

test('cliente operativo sin hito de Planificación no declara readiness',()=>{
  const result=coachLaunchReadiness({
    role:'coach',
    progress:completeTour(),
    collections:collections({
      clients:[client()],
      clientProfiles:[completeProfile()],
    }),
  });
  assert.equal(result.clientReady,true);
  assert.equal(result.planningReady,false);
  assert.equal(result.ready,false);
  assert.equal(result.nextRequirement,'planning');
});

test('tour + cliente operativo + ciclo validable persistido declara readiness',()=>{
  const result=coachLaunchReadiness({
    role:'coach',
    progress:completeTour(),
    collections:collections({
      clients:[client()],
      clientProfiles:[completeProfile()],
      trainingCycles:[validCycle()],
    }),
  });
  assert.equal(result.ready,true);
  assert.equal(result.nextRequirement,null);
});

test('datos de otro Coach no cuentan tras el scope canónico por asignación',()=>{
  const raw={
    data:{
      clients:[client('mine'),client('other')],
      clientProfiles:[completeProfile('mine'),completeProfile('other')],
      trainingCycles:[validCycle('other')],
    },
  };
  const scoped=filterSnapshotForAssignmentScope(raw,{
    available:true,
    membershipStatus:'active',
    assignmentScopeEnforced:true,
    assignedClientIds:['mine'],
    revision:2,
  },'coach');
  const result=coachLaunchReadiness({
    role:'coach',
    progress:completeTour(),
    collections:scoped.data,
  });
  assert.deepEqual(scoped.data.clients.map((item)=>item.id),['mine']);
  assert.equal(scoped.data.trainingCycles.length,0);
  assert.equal(result.clientReady,true);
  assert.equal(result.planningReady,false);
  assert.equal(result.ready,false);
});

test('expediente incompleto o draft visible no cuenta como cliente operativo',()=>{
  const result=coachLaunchReadiness({
    role:'coach',
    progress:completeTour(),
    collections:collections({
      clients:[client()],
      clientProfiles:[completeProfile('c1',{phone:null})],
      trainingCycles:[validCycle()],
    }),
  });
  assert.equal(result.clientReady,false);
  assert.equal(result.planningReady,false);
  assert.equal(result.ready,false);
});

test('colecciones ausentes o indeterminadas fallan cerradas',()=>{
  const result=coachLaunchReadiness({role:'coach',progress:completeTour(),collections:null});
  assert.equal(result.ready,false);
  assert.equal(result.nextRequirement,'data');
});

test('Cliente y Admin no adquieren semántica de readiness Coach',()=>{
  for(const role of ['client','admin']){
    const result=coachLaunchReadiness({
      role,
      progress:{completed:true},
      collections:collections({
        clients:[client()],
        clientProfiles:[completeProfile()],
        trainingCycles:[validCycle()],
      }),
    });
    assert.equal(result.applicable,false);
    assert.equal(result.ready,null);
  }
});

test('completion del tour conserva su significado histórico de navegación',()=>{
  const progress=completeTour();
  assert.equal(progress.completed,true);
  assert.equal(progress.completedCount,progress.total);
});
