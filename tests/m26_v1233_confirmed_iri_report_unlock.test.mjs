import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderIriRoute,renderReportsRoute} from '../src/m26/modules/route-render.js';
import {
  confirmedFirstSessionDraft,
  normalizeFirstSessionDraft,
  validateFirstSessionDraft,
} from '../src/m26/workflows/iri-first-session.js';
import {buildIriReportHtml} from '../src/m26/workflows/iri-report-document.js';

function completedRecord(){
  const draft=normalizeFirstSessionDraft({
    assessmentDate:'2026-07-30',birthDate:'1990-06-12',sexForNorms:'female',email:'qa@example.com',phone:'+56 9 1111 2222',modality:'hibrido',trainingAddress:'Dirección QA',primaryObjective:'Mejorar fuerza y salud general',trainingExperience:'Intermedia',availability:'Dos tardes',screeningAccepted:'on',
    weightKg:'64',heightCm:'165',waistCm:'74',
    ankleLeft1:'8',ankleRight1:'8',posteriorLeft1:'24',posteriorRight1:'24',hipRotationResult:'Simétrica',squatDepth:'Paralela',
    chairStand30s:'18',chairStandValid:'on',pushVariant:'standard',pushUps:'10',pushValid:'on',trxRowRepetitions:'14',trxValid:'on',frontPlankSeconds:'45',
    cardioSkipped:'on',cardioSkipReason:'No se realizó por falta de tiempo en la sesión.',
    diagnosisStrengths:'Buena fuerza funcional',diagnosisPriorities:'Completar evaluación cardiorrespiratoria',coachInterpretation:'Perfil funcional suficiente para iniciar una planificación prudente.',trainingImplications:'Iniciar fuerza y movilidad con progresión conservadora.',initialPlan:'Plan inicial de cuatro semanas con seguimiento y reevaluación.',recommendedFrequency:'2 sesiones por semana',reviewAccepted:'on',
  },{id:'11111111-1111-4111-8111-111111111111'},'CLIENT-QA');
  return {
    id:draft.assessmentId,clientId:draft.clientId,
    body:{
      firstSessionSchema:draft.schema,firstSessionCompletedAt:'2026-07-30T20:00:00.000Z',assessmentDate:draft.assessmentDate,
      personProfile:draft.personProfile,interview:draft.interview,bodyComposition:draft.bodyComposition,mobility:draft.mobility,
      strengthAssessment:draft.strength,cardio:draft.cardio,diagnosis:draft.diagnosis,protocolRecords:draft.protocolRecords,
    },
  };
}

function iriVm({confirmed=true,coverageCount=2}={}){
  const record=completedRecord();
  if(!confirmed)delete record.body.firstSessionCompletedAt;
  return {
    current:record,
    currentSummary:{coverageCount,coverageLabel:`${coverageCount} de 3 dominios de resultado registrados`,processLabel:confirmed?'7 de 7 etapas completadas':'Evaluación en preparación',confirmed,domains:{cardiovascular:false,bodyComposition:true,strength:true}},
    profile:{birthDate:'1990-06-12',sexForNorms:'female',sexForNormsLabel:'Mujer',email:'qa@example.com',phone:'+56 9 1111 2222',modality:'hibrido',modalityLabel:'Híbrida',trainingAddress:'Dirección QA'},
    canEdit:true,history:[],
  };
}

function reportButton(html,action){
  const match=html.match(new RegExp(`<button[^>]*data-workflow-action="${action}"[^>]*>`));
  assert.ok(match,`botón ${action} no encontrado`);
  return match[0];
}

test('IRI confirmado con 2 de 3 dominios habilita ambos informes',()=>{
  const html=renderIriRoute(iriVm());
  assert.doesNotMatch(reportButton(html,'generate-client-iri-report'),/disabled|aria-disabled="true"/);
  assert.doesNotMatch(reportButton(html,'generate-coach-iri-report'),/disabled|aria-disabled="true"/);
  const reports=renderReportsRoute({role:'coach',canManage:true,latestIri:completedRecord(),reports:[]});
  assert.match(reports,/Documentos del IRI/);
  assert.doesNotMatch(reportButton(reports,'generate-client-iri-report'),/disabled|aria-disabled="true"/);
  assert.doesNotMatch(reportButton(reports,'generate-coach-iri-report'),/disabled|aria-disabled="true"/);
});

test('IRI no confirmado mantiene ambos informes bloqueados',()=>{
  const html=renderIriRoute(iriVm({confirmed:false}));
  assert.match(reportButton(html,'generate-client-iri-report'),/disabled/);
  assert.match(reportButton(html,'generate-coach-iri-report'),/disabled/);
});

test('el informe se reconstruye desde la entidad remota confirmada sin depender del formulario',()=>{
  const remote=completedRecord();
  const draft=confirmedFirstSessionDraft(remote,'CLIENT-QA');
  assert.equal(validateFirstSessionDraft(draft).ok,true);
  assert.equal(draft.cardio.skipped,true);
  assert.equal(draft.cardio.skipReason,'No se realizó por falta de tiempo en la sesión.');
  assert.equal(draft.strength.chairStand.repetitions,18);
  assert.equal(draft.personProfile.email,'qa@example.com');
  const html=buildIriReportHtml({draft,variant:'client',clientName:'Adriana QA',coachName:'Coach QA',logoUrl:'/public/isotipo-iberfit.png'});
  assert.equal((html.match(/class="pdf-page/g)||[]).length,7);
  assert.match(html,/NO EVALUADO/);
});

test('el controlador genera desde el IRI remoto y no vuelve a validar campos editables',()=>{
  const source=fs.readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  const start=source.indexOf('async function generateIriReport');
  const end=source.indexOf('\n\n  async function validatePlan',start);
  const block=source.slice(start,end);
  assert.match(block,/confirmedFirstSessionDraft\(confirmedRecord,clientId\)/);
  assert.doesNotMatch(block,/M26_IRI_FORM_REQUIRED|const draft=iriDraft\(form\)|assertIriRawRanges\(form\)/);
  assert.match(block,/M26_IRI_CONFIRMED_REPORT_DATA_INVALID/);
});
