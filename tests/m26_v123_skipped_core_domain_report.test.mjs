import test from 'node:test';
import assert from 'node:assert/strict';

import {buildIriCommand} from '../src/m26/workflows/iri-workflow.js';
import {
  buildIriCommandDraftFromFirstSession,
  coreDomainCoverage,
  normalizeFirstSessionDraft,
  validateFirstSessionDraft,
} from '../src/m26/workflows/iri-first-session.js';
import {buildIriReportHtml} from '../src/m26/workflows/iri-report-document.js';

function raw(overrides={}){
  return {
    assessmentDate:'2026-07-30',birthDate:'1990-06-12',sexForNorms:'female',email:'qa@example.com',phone:'+56 9 1111 2222',modality:'hibrido',trainingAddress:'Dirección QA',primaryObjective:'Mejorar fuerza y salud general',trainingExperience:'Intermedia',availability:'Dos tardes',screeningAccepted:'on',
    weightKg:'64',heightCm:'165',waistCm:'74',
    ankleLeft1:'8',ankleRight1:'8',posteriorLeft1:'24',posteriorRight1:'24',hipRotationResult:'Simétrica',squatDepth:'Paralela',
    chairStand30s:'18',chairStandValid:'on',pushVariant:'standard',pushUps:'10',pushValid:'on',trxRowRepetitions:'14',trxValid:'on',frontPlankSeconds:'45',
    cardioSkipped:'on',cardioSkipReason:'No se realizó por falta de tiempo en la sesión.',
    diagnosisStrengths:'Buena fuerza funcional',diagnosisPriorities:'Completar evaluación cardiorrespiratoria',coachInterpretation:'Perfil funcional suficiente para iniciar una planificación prudente.',trainingImplications:'Iniciar fuerza y movilidad con progresión conservadora.',initialPlan:'Plan inicial de cuatro semanas con seguimiento y reevaluación.',recommendedFrequency:'2 sesiones por semana',reviewAccepted:'on',
    ...overrides,
  };
}

test('un dominio objetivo no evaluado con motivo permite cerrar el IRI cuando existen otros dos',()=>{
  const draft=normalizeFirstSessionDraft(raw(),{id:'11111111-1111-4111-8111-111111111111'},'CLIENT-QA');
  const coverage=coreDomainCoverage(draft);
  assert.deepEqual(coverage.states,{bodyComposition:true,strength:true,cardio:false});
  assert.equal(coverage.measured,2);
  assert.equal(validateFirstSessionDraft(draft).ok,true);
  const commandDraft=buildIriCommandDraftFromFirstSession(draft,{id:'11111111-1111-4111-8111-111111111111'});
  assert.equal(commandDraft.stepFinalHr,null);
  assert.equal(commandDraft.stepOneMinuteHr,null);
  assert.equal(commandDraft.cardio.skipped,true);
  const command=buildIriCommand(commandDraft,0);
  assert.equal(command.payload.patch.deltaFc,null);
  assert.equal(command.payload.patch.evidenceCoverage.measured,2);
});

test('dos dominios objetivos omitidos siguen bloqueando la confirmación con error explícito',()=>{
  const draft=normalizeFirstSessionDraft(raw({bodyCompositionSkipped:'on',bodyCompositionSkipReason:'No disponible'}),{id:'11111111-1111-4111-8111-111111111111'},'CLIENT-QA');
  const check=validateFirstSessionDraft(draft);
  assert.equal(check.ok,false);
  assert.ok(check.byStep.revision.includes('coreDomains'));
  assert.throws(()=>buildIriCommandDraftFromFirstSession(draft,{id:'11111111-1111-4111-8111-111111111111'}),/M26_IRI_FIRST_SESSION_INVALID/);
});

test('informe Cliente documenta cardio no evaluado sin inventar FC, delta, baremo ni clasificación',()=>{
  const draft=normalizeFirstSessionDraft(raw(),{id:'11111111-1111-4111-8111-111111111111'},'CLIENT-QA');
  const html=buildIriReportHtml({draft,variant:'client',clientName:'Adriana QA',coachName:'Coach QA',logoUrl:'/public/isotipo-iberfit.png'});
  assert.equal((html.match(/class="pdf-page/g)||[]).length,7);
  assert.match(html,/NO EVALUADO/);
  assert.match(html,/No se realizó por falta de tiempo en la sesión/);
  assert.match(html,/No se calculan frecuencia cardiaca final, recuperación, ΔFC, baremo ni clasificación cardiorrespiratoria/);
  assert.doesNotMatch(html,/FC final 0 lpm|recuperación 0 lpm/);
});

test('informe Coach conserva trazabilidad explícita de la ausencia cardiorrespiratoria',()=>{
  const draft=normalizeFirstSessionDraft(raw(),{id:'11111111-1111-4111-8111-111111111111'},'CLIENT-QA');
  const html=buildIriReportHtml({draft,variant:'coach',clientName:'Adriana QA',coachName:'Coach QA',clientId:'CLIENT-QA',logoUrl:'/public/isotipo-iberfit.png'});
  assert.match(html,/Sin medición cardiorrespiratoria/);
  assert.match(html,/FC final<\/span><strong>No calculada/);
  assert.match(html,/Baremo<\/span><strong>No aplicado/);
  assert.match(html,/Clasificación<\/span><strong>No emitida/);
});
