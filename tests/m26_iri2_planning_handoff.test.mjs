import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderPlanningRoute} from '../src/m26/modules/route-render.js';

function vm(overrides={}){
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

test('planning shows confirmed IRI context and only seeds an editable internal draft',()=>{
  const html=renderPlanningRoute(vm());
  assert.match(html,/data-iri-planning-context/u);
  assert.match(html,/Revisión del Coach obligatoria/u);
  assert.match(html,/no crea, valida ni publica un plan automáticamente/u);
  assert.match(html,/data-workflow-form="planning" data-iri-seeded="true"/u);
  assert.match(html,/name="weeklyFrequency"[^>]+value="3"/u);
  assert.match(html,/name="sessionDurationMinutes"[^>]+value="55"/u);
  assert.match(html,/value="hibrido" selected/u);
  assert.match(html,/Ciclo IRI confirmado de ocho semanas\./u);
  assert.match(html,/data-workflow-action="validate-plan"/u);
  assert.doesNotMatch(html,/data-workflow-action="publish-plan"[^>]*data-auto/ui);
});

test('existing cycle values always win over the IRI planning seed',()=>{
  const html=renderPlanningRoute(vm({
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

test('client planning never exposes internal IRI decision context',()=>{
  const html=renderPlanningRoute(vm({role:'client',canEdit:false}));
  assert.doesNotMatch(html,/data-iri-planning-context/u);
  assert.doesNotMatch(html,/Revisión del Coach obligatoria/u);
  assert.doesNotMatch(html,/data-workflow-form="planning"/u);
});

test('planning view model derives the seed only from confirmed IRI assessments',()=>{
  const source=fs.readFileSync(new URL('../src/m26/modules/route-view-model.js',import.meta.url),'utf8');
  assert.match(source,/filter\(\(record\)=>compactIri\(record\)\?\.confirmed\)/u);
  assert.match(source,/confirmedFirstSessionDraft\(record,clientId\)/u);
  assert.match(source,/buildIri2PlanningSeed\(\{decisionLog,profile\}\)/u);
  assert.match(source,/iriPlanningSeed=canEdit\?/u);
});
