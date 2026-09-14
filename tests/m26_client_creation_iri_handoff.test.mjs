import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {initialAssessmentPostCreateArea} from '../src/m26/domain/initial-assessment.js';
import {legacyClientDraftPayload} from '../src/m26/workflows/client-onboarding.js';
import {renderIriRoute} from '../src/m26/modules/route-render.js';

const workflow=fs.readFileSync('src/m26/app/workflow-controller.js','utf8').replace(/\r\n/g,'\n');
const progressive=fs.readFileSync('src/m26/onboarding/progressive-onboarding.js','utf8').replace(/\r\n/g,'\n');

const input={
  name:'Cliente IRI QA',
  email:'cliente.iri.qa@example.com',
  phone:'+56 9 1111 2222',
  birthDate:'1990-02-03',
  sexForNorms:'female',
  modality:'hibrido',
  weeklyFrequency:'3',
  sessionDurationMinutes:'60',
  primaryObjective:'Mejorar fuerza y condición física general.',
  trainingAddress:'Av. IBERFIT 123',
  commune:'Las Condes',
  preferredSchedule:'Lunes y jueves por la tarde',
  equipment:'TRX, mancuernas',
};

test('alta normalizada mantiene IRI como punto de partida cuando no se pospone explícitamente',()=>{
  const payload=legacyClientDraftPayload(input);
  assert.equal(payload.initialAssessmentMode,'iri');
  assert.equal(payload.profile.initialAssessmentMode,'iri');
  assert.equal(initialAssessmentPostCreateArea(payload.initialAssessmentMode),'iri');
});

test('posponer IRI es explícito y no finge un diagnóstico completado',()=>{
  const payload=legacyClientDraftPayload({...input,initialAssessmentMode:'deferred'});
  assert.equal(payload.initialAssessmentMode,'deferred');
  assert.equal(initialAssessmentPostCreateArea(payload.initialAssessmentMode),'expediente');
  assert.equal(Object.hasOwn(payload,'iriConfirmed'),false);
});

test('tras crear cliente el controlador usa una única decisión de navegación sin salto posterior por toast',()=>{
  const start=workflow.indexOf('async function createClient()');
  const end=workflow.indexOf('async function completeIri()',start);
  assert.ok(start>=0&&end>start);
  const block=workflow.slice(start,end);
  assert.match(block,/const nextArea=initialAssessmentPostCreateArea\(payload\.initialAssessmentMode\);/u);
  assert.match(block,/store\.selectClient\?\.\(created\.id\);store\.navigate\?\.\(nextArea\);onRender\(\)/u);
  assert.doesNotMatch(block,/store\.navigate\?\.\('iri'\)/u);
  assert.doesNotMatch(progressive,/pendingClientStartArea|onWorkflowToast/u);
});

test('IRI inicial recibe datos canónicos del expediente sin depender de evolución',()=>{
  const html=renderIriRoute({
    current:{id:'11111111-1111-4111-8111-111111111111',clientId:'22222222-2222-4222-8222-222222222222',status:'borrador',revision:0},
    currentSummary:{confirmed:false,processLabel:'Evaluación en preparación',coverageCount:0,coverageLabel:'0 de 3 dominios de resultado registrados',domains:{}},
    profile:{
      birthDate:input.birthDate,sexForNorms:'female',sexForNormsLabel:'Mujer',email:input.email,phone:input.phone,
      modality:'hibrido',modalityLabel:'Híbrido',weeklyFrequency:3,sessionDurationMinutes:60,
      trainingAddress:input.trainingAddress,commune:input.commune,preferredSchedule:input.preferredSchedule,
      equipment:['TRX','mancuernas'],primaryObjective:input.primaryObjective,
    },
    sourceProfile:{
      initialAssessmentMode:'iri',birthDate:input.birthDate,sexForNorms:'female',email:input.email,phone:input.phone,
      modality:'hibrido',weeklyFrequency:3,sessionDurationMinutes:60,trainingAddress:input.trainingAddress,
      commune:input.commune,preferredSchedule:input.preferredSchedule,equipment:['TRX','mancuernas'],
      primaryObjective:input.primaryObjective,
    },
    role:'coach',canEdit:true,history:[],decisionLog:{latest:null,entries:[]},
  });
  assert.match(html,/Evaluación vinculada al expediente/u);
  assert.match(html,/name="email"[^>]+value="cliente\.iri\.qa@example\.com"/u);
  assert.match(html,/name="modality"[^>]*>[\s\S]*value="hibrido" selected/u);
  assert.match(html,/name="weeklyFrequency"[^>]+value="3"/u);
  assert.match(html,/name="sessionDurationMinutes"[^>]+value="60"/u);
  assert.match(html,/name="trainingAddress"[^>]+value="Av\. IBERFIT 123"/u);
  assert.match(html,/Mejorar fuerza y condición física general\./u);
  assert.doesNotMatch(html,/Evolución longitudinal|seguimiento longitudinal/u);
});
