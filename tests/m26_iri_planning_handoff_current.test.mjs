import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderPlanningRoute} from '../src/m26/modules/route-render.js';
import {buildIri2DecisionLog,buildIriPlanningSeed,iri2SnapshotFromDraft} from '../src/m26/workflows/iri-2-longitudinal.js';

function decisionDraft(){
  return iri2SnapshotFromDraft({
    id:'88888888-8888-4888-8888-888888888888',
    clientId:'57339e70-7a99-48d6-820f-7d4a51f89d9d',
    assessmentDate:'2026-06-01',
    firstSessionCompletedAt:'2026-06-01T10:00:00Z',
    body:{
      assessmentDate:'2026-06-01',
      diagnosisPriorities:'Fuerza tren inferior\nCardio',
      initialPlan:'Ciclo de ocho semanas con énfasis en fuerza y progresión cardiorrespiratoria.',
      trainingImplications:'Mantener técnica de fuerza e introducir cardio de forma progresiva.',
      recommendedFrequency:'3 sesiones por semana',
      reevaluationDate:'2026-08-01',
      reviewAccepted:true,
    },
  });
}

function planningVm(overrides={}){
  return {
    role:'coach',
    canEdit:true,
    currentCycle:null,
    iriPlanningSeed:{
      sourceAssessmentId:'IRI-PLANNING-1',
      sourceAssessmentDate:'2026-06-01',
      priorities:['Fuerza tren inferior','Cardio'],
      trainingImplications:'Mantener técnica y progresar cardio.',
      suggestedGoal:'Ciclo IRI confirmado de ocho semanas.',
      suggestedWeeklyFrequency:3,
      suggestedSessionDurationMinutes:55,
      suggestedModality:'hibrido',
      reevaluationDate:'2026-08-01',
      requiresCoachReview:true,
    },
    cycles:[],
    sessions:[],
    cycleCounts:{approved:0},
    sessionCounts:{published:0},
    ...overrides,
  };
}

test('confirmed IRI decision derives a bounded planning seed that still requires Coach review',()=>{
  const decisionLog=buildIri2DecisionLog({assessments:[decisionDraft()]});
  const seed=buildIriPlanningSeed({
    decisionLog,
    profile:{weeklyFrequency:2,sessionDurationMinutes:55,modality:'Híbrido'},
  });

  assert.equal(seed.sourceAssessmentId,'88888888-8888-4888-8888-888888888888');
  assert.equal(seed.suggestedWeeklyFrequency,3);
  assert.equal(seed.suggestedSessionDurationMinutes,55);
  assert.equal(seed.suggestedModality,'hibrido');
  assert.match(seed.suggestedGoal,/Ciclo de ocho semanas/u);
  assert.deepEqual(seed.priorities,['Fuerza tren inferior','Cardio']);
  assert.equal(seed.reevaluationDate,'2026-08-01');
  assert.equal(seed.requiresCoachReview,true);
  assert.equal('published' in seed,false);
  assert.equal('validated' in seed,false);
});

test('planning seed is absent without a reviewed confirmed decision',()=>{
  assert.equal(buildIriPlanningSeed({decisionLog:{latest:null},profile:{weeklyFrequency:2}}),null);
});

test('Coach planning displays confirmed IRI context and only seeds an editable internal draft',()=>{
  const html=renderPlanningRoute(planningVm());
  assert.match(html,/data-iri-planning-context/u);
  assert.match(html,/Revisión del Coach obligatoria/u);
  assert.match(html,/no crea, valida ni publica un plan automáticamente/u);
  assert.match(html,/data-workflow-form="planning" data-iri-seeded="true"/u);
  assert.match(html,/name="weeklyFrequency"[^>]+value="3"/u);
  assert.match(html,/name="sessionDurationMinutes"[^>]+value="55"/u);
  assert.match(html,/value="hibrido" selected/u);
  assert.match(html,/Ciclo IRI confirmado de ocho semanas\./u);
  assert.match(html,/data-workflow-action="validate-plan"/u);
  assert.doesNotMatch(html,/data-auto/ui);
});

test('existing cycle values always win over the IRI planning seed',()=>{
  const html=renderPlanningRoute(planningVm({
    currentCycle:{
      id:'CYCLE-EXISTING',
      body:{
        name:'Ciclo vigente',
        modality:'online',
        weeklyFrequency:4,
        sessionDurationMinutes:70,
        goal:'Objetivo definido manualmente por el Coach',
      },
    },
  }));
  assert.doesNotMatch(html,/data-iri-seeded="true"/u);
  assert.match(html,/name="weeklyFrequency"[^>]+value="4"/u);
  assert.match(html,/name="sessionDurationMinutes"[^>]+value="70"/u);
  assert.match(html,/value="online" selected/u);
  assert.match(html,/Objetivo definido manualmente por el Coach/u);
});

test('Client planning never exposes internal IRI decision context',()=>{
  const html=renderPlanningRoute(planningVm({role:'client',canEdit:false}));
  assert.doesNotMatch(html,/data-iri-planning-context/u);
  assert.doesNotMatch(html,/Revisión del Coach obligatoria/u);
  assert.doesNotMatch(html,/data-workflow-form="planning"/u);
});

test('planning view model derives the handoff only from confirmed IRI assessments',()=>{
  const source=fs.readFileSync(new URL('../src/m26/modules/route-view-model.js',import.meta.url),'utf8');
  assert.match(source,/filter\(\(record\)=>compactIri\(record\)\?\.confirmed\)/u);
  assert.match(source,/confirmedFirstSessionDraft\(record,clientId\)/u);
  assert.match(source,/buildIriPlanningSeed\(\{decisionLog,profile\}\)/u);
  assert.match(source,/iriPlanningSeed=canEdit\?/u);
});
