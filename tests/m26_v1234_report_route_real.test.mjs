import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {normalizeFirstSessionDraft} from '../src/m26/workflows/iri-first-session.js';
import {buildIriReportHtml,__iriReportInternals} from '../src/m26/workflows/iri-report-document.js';

const read=(relative)=>fs.readFileSync(new URL(`../${relative}`,import.meta.url),'utf8');
const normalizeLineEndings=(value)=>String(value).replace(/\r\n?/gu,'\n');

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
  const expected=normalizeLineEndings(__iriReportInternals.REPORT_STYLESHEET);
  assert.ok(normalizeLineEndings(css).startsWith(expected));
  assert.ok(normalizeLineEndings(css.replace(/\n/gu,'\r\n')).startsWith(expected));
  assert.match(css,/\.pdf-page/);
  assert.match(css,/\.report-page-content/);
  assert.match(css,/iri-report-fit-82/);
  assert.match(css,/\.iri-report-toolbar/);
  assert.match(css,/@media print\{\.iri-report-toolbar\{display:none!important\}\}/);
});

test('el HTML generado no depende de atributos style bloqueables por CSP',()=>{
  const html=buildIriReportHtml({draft:reportDraft(),variant:'client',clientName:'Cliente QA',coachName:'Coach QA'});
  assert.equal((html.match(/class="pdf-page/g)||[]).length,7);
  assert.doesNotMatch(html,/\sstyle="/u);
  assert.match(html,/w-pct-\d+/);
  assert.match(html,/col-w-\d+/);
  assert.match(html,/class="report-page-content"/);
  assert.match(html,/report-page-2/);
  const external=buildIriReportHtml({draft:reportDraft(),variant:'client',clientName:'Cliente QA',coachName:'Coach QA',stylesheetHref:'https://m26-canary.iberfit.cl/m26/iri-report.css?v=m26-rc45-6-launch-hardening-v1'});
  assert.match(external,/rel="stylesheet"[^>]+data-iri-report-stylesheet/);
  assert.doesNotMatch(external,/<style>/);
});

test('el renderizador primario usa CSS same-origin permitido por CSP y bloquea impresión sin maquetación',()=>{
  const source=read('src/m26/workflows/iri-report-document.js');
  const page=read('src/m26/workflows/iri-report-page.js');
  assert.match(source,/openWindow\('about:blank','_blank'\)/);
  assert.match(source,/directIriReportHtml/);
  assert.doesNotMatch(source,/document\.write\s*\(/);
  assert.match(source,/parseFromString\(String\(html\|\|''\),'text\/html'\)/);
  assert.match(source,/doc\.importNode\(parsed\.documentElement,true\)/);
  assert.match(source,/doc\.replaceChild\(imported,doc\.documentElement\)/);
  assert.match(source,/data-iri-report-stylesheet/);
  assert.match(source,/reportLayoutReady/);
  assert.match(source,/fitReportPages/);
  assert.match(source,/reportPageContentFits/);
  assert.match(source,/Encabezados y pies de página/);
  assert.match(source,/M26_IRI_REPORT_LAYOUT_NOT_READY/);
  assert.match(source,/m26-rc45-6-launch-hardening-v1/);
  assert.doesNotMatch(source,/localStorage\.setItem\(token/);
  assert.doesNotMatch(source,/\/m26\/iri-report\.html#/);
  assert.match(page,/localStorage\.getItem\(token\)/);
  assert.match(page,/CLIENT_PAGE_COUNT=7/);
  assert.match(page,/COACH_MIN_PAGE_COUNT=13/);
  assert.match(page,/Imprimir o guardar como PDF/);
});

test('el service worker precarga la ruta real y sus recursos',()=>{
  const sw=read('public/m26/sw.js');
  for(const asset of ['/m26/iri-report.html','/m26/iri-report.css','/src/m26/workflows/iri-report-page.js'])assert.match(sw,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('las fechas del informe conservan el día civil exacto y no desplazan por zona horaria',()=>{
  assert.equal(__iriReportInternals.dateLabel('2026-07-31'),'31 de julio de 2026');
  assert.equal(__iriReportInternals.dateLabel('2026-07-31T23:45:00-04:00'),'31 de julio de 2026');
  assert.equal(__iriReportInternals.dateLabel('31/07/2026'),'31 de julio de 2026');
  assert.equal(__iriReportInternals.dateLabel('2026-02-30','Por definir'),'Por definir');
  assert.equal(__iriReportInternals.dateLabel('','Por definir'),'Por definir');
});

test('la página resumen mantiene estado, fecha y controles dentro de su caja A4',()=>{
  const css=read('public/m26/iri-report.css');
  assert.match(css,/\.report-page-2 \.report-page-content\{min-height:100%;display:flex;flex-direction:column\}/);
  assert.match(css,/\.report-page-2 \.summary-band\{margin-top:auto;/);
  assert.match(css,/\.pdf-page\.m26-premium-report-v2 main\{height:229mm;/);
  assert.match(css,/\.evidence-item\.is-skipped>div\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css,/\.evidence-item\.is-skipped>div strong\{justify-self:start;max-width:100%/);
  assert.match(css,/\.pdf-page\.m26-premium-report-v2 footer\{position:absolute;z-index:2\}/);
  assert.match(css,/\.iri-report-toolbar\{position:relative;/);
  assert.doesNotMatch(css,/\.iri-report-toolbar\{position:fixed;/);
  const html=buildIriReportHtml({draft:reportDraft(),variant:'client',clientName:'Cliente QA',coachName:'Coach QA'});
  assert.match(html,/30 de julio de 2026/);
  assert.match(html,/No evaluado/);
});
