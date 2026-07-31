import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {normalizeFirstSessionDraft} from '../src/m26/workflows/iri-first-session.js';
import {buildIriReportHtml,__iriReportInternals} from '../src/m26/workflows/iri-report-document.js';

const read=(relative)=>fs.readFileSync(new URL(`../${relative}`,import.meta.url),'utf8');

function reportDraft(){
  return normalizeFirstSessionDraft({
    assessmentDate:'2026-07-30',birthDate:'1990-06-12',sexForNorms:'female',email:'qa@example.com',phone:'+56 9 1111 2222',modality:'hibrido',trainingAddress:'Dirección QA',primaryObjective:'Mejorar fuerza y salud general',trainingExperience:'Intermedia',availability:'Dos tardes',screeningAccepted:'on',
    weightKg:'64',heightCm:'165',waistCm:'74',
    ankleLeft1:'8',ankleRight1:'7.5',posteriorLeft1:'24',posteriorRight1:'23',hipRotationResult:'Simétrica',squatDepth:'Paralela',
    chairStand30s:'18',chairStandValid:'on',pushVariant:'standard',pushUps:'10',pushValid:'on',trxRowRepetitions:'14',trxValid:'on',frontPlankSeconds:'45',
    cardioSkipped:'on',cardioSkipReason:'No se realizó por falta de tiempo en la sesión.',
    diagnosisStrengths:'Buena fuerza funcional',diagnosisPriorities:'Completar evaluación cardiorrespiratoria',coachInterpretation:'Perfil funcional suficiente para iniciar una planificación prudente.',trainingImplications:'Iniciar fuerza y movilidad con progresión conservadora.',initialPlan:'Plan inicial de cuatro semanas con seguimiento y reevaluación.',recommendedFrequency:'2 sesiones por semana',reviewAccepted:'on',
  },{id:'11111111-1111-4111-8111-111111111111'},'CLIENT-QA');
}

test('existe una ruta HTML exclusiva para los informes y no reutiliza el shell SPA',()=>{
  const html=read('public/m26/iri-report.html');
  assert.match(html,/data-iri-report-shell/);
  assert.match(html,/href="\/m26\/iri-report\.css"/);
  assert.match(html,/src="\/src\/m26\/workflows\/iri-report-page\.js"/);
  assert.doesNotMatch(html,/id="app"|\/m26\/app\.js/);
});

test('la hoja externa contiene exactamente los estilos del informe y los controles de vista previa',()=>{
  const css=read('public/m26/iri-report.css');
  assert.ok(css.startsWith(__iriReportInternals.REPORT_STYLESHEET));
  assert.match(css,/\.pdf-page/);
  assert.match(css,/\.iri-report-toolbar/);
  assert.match(css,/@media print\{\.iri-report-toolbar\{display:none!important\}\}/);
});

test('el HTML generado no depende de atributos style bloqueables por CSP',()=>{
  const html=buildIriReportHtml({draft:reportDraft(),variant:'client',clientName:'Cliente QA',coachName:'Coach QA'});
  assert.equal((html.match(/class="pdf-page/g)||[]).length,7);
  assert.doesNotMatch(html,/\sstyle="/u);
  assert.match(html,/w-pct-\d+/);
  assert.match(html,/col-w-\d+/);
});

test('el cargador valida token, cantidad de páginas y deja una acción manual de impresión',()=>{
  const page=read('src/m26/workflows/iri-report-page.js');
  assert.match(page,/localStorage\.getItem\(token\)/);
  assert.match(page,/CLIENT_PAGE_COUNT=7/);
  assert.match(page,/COACH_MIN_PAGE_COUNT=13/);
  assert.match(page,/m26:iri-report-ready/);
  assert.match(page,/Imprimir o guardar como PDF/);
  assert.doesNotMatch(page,/document\.head\.append\(style/);
});

test('el service worker precarga la ruta real y sus recursos',()=>{
  const sw=read('public/m26/sw.js');
  for(const asset of ['/m26/iri-report.html','/m26/iri-report.css','/src/m26/workflows/iri-report-page.js'])assert.match(sw,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
