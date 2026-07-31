import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {normalizeFirstSessionDraft} from '../src/m26/workflows/iri-first-session.js';
import {buildIriReportHtml} from '../src/m26/workflows/iri-report-document.js';
import {renderHoyRoute,renderIriRoute} from '../src/m26/modules/route-render.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

function validDraft(){
  return normalizeFirstSessionDraft({
    assessmentDate:'2026-07-28',birthDate:'1992-04-11',sexForNorms:'female',email:'qa@example.com',phone:'+56 9 1111 2222',modality:'hibrido',trainingAddress:'Dirección QA',primaryObjective:'Mejorar fuerza general',trainingExperience:'Intermedia',availability:'Dos tardes',screeningAccepted:'on',
    weightKg:'64.2',heightCm:'166',bodyFatPercent:'27.4',leanMassKg:'46.6',muscleMassKg:'43.9',bodyWaterPercent:'51.8',waistCm:'74',visceralFatLevel:'6',bodyCompositionMethod:'bioimpedancia-segmental',bodyCompositionDevice:'Equipo QA',measurementConditions:'Mañana, antes de entrenar e hidratación habitual.',
    ankleLeft1:'8',ankleLeft2:'8.2',ankleLeft3:'8.1',ankleRight1:'7.5',ankleRight2:'7.7',ankleRight3:'7.6',posteriorLeft1:'24',posteriorLeft2:'25',posteriorLeft3:'24.5',posteriorRight1:'22',posteriorRight2:'22.5',posteriorRight3:'22.2',hipRotationResult:'Simétrica',squatDepth:'Paralela',
    chairStand30s:'18',chairStandValid:'on',pushVariant:'standard',pushUps:'12',pushValid:'on',trxRowRepetitions:'15',trxValid:'on',frontPlankSeconds:'55',
    cardioProtocol:'ymca-3min-standard',stepHeightCm:'30.5',cadenceBpm:'96',cardioDurationSeconds:'180',stepFinalHr:'156',stepOneMinuteHr:'127',cardioValid:'on',
    diagnosisStrengths:'Buena tolerancia',diagnosisPriorities:'Mejorar tracción',coachInterpretation:'Interpretación profesional suficiente y prudente.',trainingImplications:'Priorizar técnica, control y progresión conservadora.',initialPlan:'Plan inicial progresivo de cuatro semanas con seguimiento.',reviewAccepted:'on',
  },{id:'IRI-RC36'},'CLIENT-RC36');
}

test('Informe IRI elimina el radar no normativo y presenta evidencia explícita por áreas',()=>{
  const html=buildIriReportHtml({draft:validDraft(),variant:'client',clientName:'Cliente QA',coachName:'Coach QA',logoUrl:'/public/isotipo-iberfit.png'});
  assert.match(html,/Evidencia por áreas/);
  assert.match(html,/Sin puntuación global/);
  assert.match(html,/Composición corporal/);
  assert.match(html,/Cardiorrespiratorio/);
  assert.doesNotMatch(html,/class="radar"|radar-value|Perfil por dominios/);
  const source=read('src/m26/workflows/iri-report-document.js');
  assert.doesNotMatch(source,/function radarChart|function domainVisuals/);
});


test('Informe IRI aplica la dirección visual ultra premium IBERFIT sin solapamientos',()=>{
  const source=read('src/m26/workflows/iri-report-document.js');
  assert.match(source,/PREMIUM_RC36_CSS/);
  assert.match(source,/m26-premium-report-v2/);
  assert.match(source,/class="cover-lockup"/);
  assert.match(source,/class="cover-isotipo"/);
  assert.match(source,/Entrenamiento personal<br>con criterio/);
  assert.match(source,/class="section-tab"/);
  assert.match(source,/overflow-wrap:anywhere/);
  assert.match(source,/word-break:normal/);
  assert.match(source,/linear-gradient\(145deg,#123d2c 0%,#08251a/);
  assert.match(source,/premium-watermark/);
});

test('Bioimpedancia queda orientada por método, equipo y condiciones sin exigir grasa corporal',()=>{
  const html=renderIriRoute({current:{id:'IRI-RC36'},currentSummary:{coverageCount:0,coverageLabel:'0 de 3 dominios de resultado registrados',processLabel:'Evaluación en preparación',confirmed:false,domains:{cardiovascular:false,bodyComposition:false,strength:false}},profile:{birthDate:'1992-04-11',sexForNorms:'female',sexForNormsLabel:'Mujer',email:'qa@example.com',phone:'+56 9 1111 2222',modality:'hibrido',modalityLabel:'Híbrida',trainingAddress:'Dirección QA'},canEdit:true,history:[]});
  assert.match(html,/Proceso guiado de 7 etapas/);
  assert.match(html,/3 dominios de resultado/);
  assert.match(html,/Bioimpedancia segmental/);
  assert.match(html,/Equipo y modelo/);
  assert.match(html,/Hora, hidratación, ingesta previa/);
  assert.match(html,/name="bodyFatPercent"/);
  assert.doesNotMatch(html,/name="bodyFatPercent"[^>]*required/);
});

test('Inicio Cliente ofrece acciones propias y nunca le pide completar el IRI del entrenador',()=>{
  const client={id:'CLIENT-RC36',name:'Cliente QA',modality:'Híbrida',status:'Activo',accessKnown:true,iri:{confirmed:false,processLabel:'Evaluación en preparación',coverageLabel:'0 de 3 dominios de resultado registrados'},cycle:null,report:null,nextAppointment:null,profile:{}};
  const html=renderHoyRoute({role:'client',clients:[client],proposals:[],appointments:[],upcoming:[],operations:{pending:0,conflicts:0,rejected:0}});
  assert.match(html,/Registrar cómo estás hoy/);
  assert.match(html,/Registrar bienestar/);
  assert.match(html,/Ver planificación/);
  assert.match(html,/Abrir sesiones/);
  assert.match(html,/Consultar informes/);
  assert.doesNotMatch(html,/Iniciar diagnóstico IRI|Completa y confirma los datos antes de planificar/);
});

test('Modelo IRI distingue proceso de 7 etapas y dominios de resultado',()=>{
  const source=read('src/m26/modules/route-view-model.js');
  assert.match(source,/processLabel/);
  assert.match(source,/7 de 7 etapas completadas/);
  assert.match(source,/3 dominios de resultado registrados/);
  assert.match(source,/confirmed/);
});

test('CI reconoce canary rc36 y conserva evidencia propia',()=>{
  const ci=read('.github/workflows/ci.yml');
  const pkg=JSON.parse(read('package.json'));
  assert.match(ci,/Validar RC36 canary/);
  assert.match(ci,/refs\/heads\/canary\/rc36/);
  assert.match(ci,/rc36-evidencia-validacion/);
  assert.equal(pkg.scripts['test:m26:rc36'],'node --test tests/m26_rc36_iri_client_product.test.mjs');
  assert.equal(pkg.scripts['validate:rc36:ci'],'node scripts/run_rc36_ci_validation.mjs');
});
test('Runtime canary identifica RC36 y renueva caché sin alterar RC35',()=>{
  const generator=read('scripts/generate_rc35_runtime_config.mjs');
  const verifier=read('scripts/verify_rc35_canary_candidate.mjs');
  assert.match(generator,/DEPLOY_BRANCH === 'canary\/rc36'/);
  assert.match(generator,/26\.0\.0-canary\.36/);
  assert.match(generator,/IBERFIT_M26_CANARY_RC36/);
  assert.match(generator,/SOURCE_RELEASE = IS_RC36 \? 'RC36' : 'RC35'/);
  assert.match(generator,/m26-rc36-canary-v5/);
  assert.match(generator,/m26-rc35-canary-v1/);
  assert.match(verifier,/EXPECTED_RC36/);
  assert.match(verifier,/EXPECTED_SOURCE_RELEASE/);
  assert.match(verifier,/m26-rc36-canary-v5/);
});
