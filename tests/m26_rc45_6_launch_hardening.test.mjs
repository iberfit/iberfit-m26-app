import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {iriExternalReportAppUrl} from '../src/m26/workflows/iri-external-report-controller.js';
import {buildIriReportHtml,__iriReportInternals} from '../src/m26/workflows/iri-report-document.js';
import {normalizeFirstSessionDraft} from '../src/m26/workflows/iri-first-session.js';

const CLIENT_ID='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const ASSESSMENT_ID='a82e5560-2f67-4de9-bf5b-ad3bfb289d96';
const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

function draft(){
  return normalizeFirstSessionDraft({
    assessmentDate:'2026-08-07',
    birthDate:'1990-06-12',
    sexForNorms:'female',
    email:'qa@example.com',
    phone:'+56 9 1111 2222',
    modality:'hibrido',
    trainingAddress:'Dirección QA',
    preferredSchedule:'Martes y jueves por la tarde',
    primaryObjective:'Mejorar fuerza y salud general',
    trainingExperience:'Intermedia',
    availability:'Martes y jueves por la tarde',
    screeningAccepted:'on',
    weightKg:'64',
    heightCm:'165',
    waistCm:'74',
    ankleLeft1:'8',
    ankleRight1:'7.5',
    posteriorLeft1:'24',
    posteriorRight1:'23',
    hipRotationResult:'Simétrica',
    squatDepth:'Paralela',
    chairStand30s:'18',
    chairStandValid:'on',
    pushVariant:'standard',
    pushUps:'10',
    pushValid:'on',
    trxRowRepetitions:'14',
    trxValid:'on',
    frontPlankSeconds:'45',
    cardioSkipped:'on',
    cardioSkipReason:'No realizada en esta sesión.',
    diagnosisStrengths:'Buena fuerza funcional',
    diagnosisPriorities:'Completar área cardiorrespiratoria',
    coachInterpretation:'Perfil funcional suficiente para iniciar una planificación prudente.',
    trainingImplications:'Priorizar movilidad y control del tobillo derecho, progresar la tracción y el trabajo de core lateral, y mantener una exposición gradual a patrones globales de fuerza. Las cargas se ajustarán según técnica, RPE y recuperación.',
    initialPlan:'Ciclo inicial de cuatro semanas con dos sesiones semanales de 60 minutos. Cada sesión incluirá movilidad específica, patrones básicos de fuerza, tracción, estabilidad del tronco y una dosis cardiorrespiratoria progresiva. Se registrará bienestar y respuesta para decidir cada progresión.',
    recommendedFrequency:'2 sesiones por semana',
    reviewAccepted:'on',
  },{id:ASSESSMENT_ID},CLIENT_ID);
}

test('RC45.6 evita truncamiento CSS silencioso del plan Cliente',()=>{
  const source=read('public/m26/iri-report.css');
  const embedded=read('src/m26/workflows/iri-report-document.js');
  assert.doesNotMatch(source,/\.plan-band p\{[^}]*max-height:[^}]*overflow:hidden/u);
  assert.doesNotMatch(embedded,/\.plan-band p\{[^}]*max-height:[^}]*overflow:hidden/u);
});

test('RC45.6 no duplica disponibilidad y horario cuando contienen el mismo texto',()=>{
  const html=buildIriReportHtml({draft:draft(),variant:'client'});
  assert.equal((html.match(/Martes y jueves por la tarde/gu)||[]).length,1);
});

test('RC45.6 los resúmenes cortan en un límite de palabra',()=>{
  const text='Priorizar movilidad y control del tobillo derecho, progresar la tracción y el trabajo de core lateral, y mantener una exposición gradual.';
  const out=__iriReportInternals.excerpt(text,80);
  assert.ok(out.endsWith('…'));
  const body=out.slice(0,-1);
  assert.ok(text.startsWith(body));
  assert.equal(text[body.length],' ');
  assert.ok(out.length<=80);
});

test('RC45.6 enlace de bioimpedancia es canary en canary y app en producción',()=>{
  assert.match(iriExternalReportAppUrl(ASSESSMENT_ID,{origin:'https://m26-canary.iberfit.cl'}),/^https:\/\/m26-canary\.iberfit\.cl\//u);
  assert.match(iriExternalReportAppUrl(ASSESSMENT_ID,{origin:'https://app.iberfit.cl'}),/^https:\/\/app\.iberfit\.cl\//u);
  assert.match(iriExternalReportAppUrl(ASSESSMENT_ID,{origin:'https://coach.iberfit.cl'}),/^https:\/\/app\.iberfit\.cl\//u);
  assert.throws(()=>iriExternalReportAppUrl(ASSESSMENT_ID,{origin:'https://example.com'}),/ORIGIN_INVALID/u);
});

test('RC45.6 separa decisión cardiorrespiratoria del plan inicial',()=>{
  const html=buildIriReportHtml({draft:draft(),variant:'client'});
  const decision='Priorizar movilidad y control del tobillo derecho';
  assert.ok((html.match(new RegExp(decision,'gu'))||[]).length>=2);
  const plan='Ciclo inicial de cuatro semanas';
  assert.equal((html.match(new RegExp(plan,'gu'))||[]).length,1);
});

test('RC45.6 higiene local bloquea credenciales y temporales obvios',()=>{
  const ignore=read('.gitignore');
  assert.match(ignore,/^\.wrangler\/$/mu);
  assert.match(ignore,/^supabase\/\.temp\/$/mu);
  assert.match(ignore,/^recovery\/rc45-visual\/generated\/$/mu);
});
