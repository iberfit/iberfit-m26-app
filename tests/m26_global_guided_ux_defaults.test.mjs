import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {normalizeClientProfile} from '../src/m26/domain/client-profile.js';

const routeSource=fs.readFileSync(
  new URL('../src/m26/modules/route-render.js',import.meta.url),
  'utf8'
);
const controllerSource=fs.readFileSync(
  new URL('../src/m26/app/workflow-controller.js',import.meta.url),
  'utf8'
);

function sliceBetween(source,startToken,endToken){
  const start=source.indexOf(startToken);
  const end=source.indexOf(endToken,start+startToken.length);
  assert.ok(start>=0&&end>start,`Missing slice ${startToken}`);
  return source.slice(start,end);
}

test('Planificación usa solo ciclo, IRI o perfil confirmado y nunca inventa 2/60/híbrido',()=>{
  const source=sliceBetween(
    routeSource,
    'export function renderPlanningRoute(vm){',
    'export function renderAgendaRoute(vm)'
  );
  assert.match(source,/profile=vm\.profile\|\|\{\}/);
  assert.match(source,/profile\.modality\|\|''/);
  assert.match(source,/profile\.weeklyFrequency\|\|''/);
  assert.match(source,/profile\.sessionDurationMinutes\|\|''/);
  assert.doesNotMatch(source,/suggestedModality\|\|'hibrido'/);
  assert.doesNotMatch(source,/suggestedWeeklyFrequency\|\|2/);
  assert.doesNotMatch(source,/suggestedSessionDurationMinutes\|\|60/);
  assert.match(source,/name="modality" required><option value="">Seleccionar modalidad/);
  assert.match(source,/data-guided-required-form/);
  assert.match(source,/data-guided-required-progress/);
});

test('Inteligencia reutiliza contexto confirmado y no fuerza fuerza/50/intermedio/TRX',()=>{
  const source=sliceBetween(
    routeSource,
    'export function renderIntelligenceRoute(vm){',
    'function rc71ChallengeStatus'
  );
  assert.match(source,/profile\.primaryObjective\|\|''/);
  assert.match(source,/profile\.sessionDurationMinutes\|\|''/);
  assert.match(source,/profile\.modality/);
  assert.match(source,/profile\.equipment/);
  assert.doesNotMatch(source,/name="goal" value="fuerza"/);
  assert.doesNotMatch(source,/name="durationMinutes" value="50"/);
  assert.doesNotMatch(source,/selected>Intermedio/);
  assert.doesNotMatch(source,/value="TRX,mancuernas"/);
  assert.match(source,/Seleccionar experiencia/);
  assert.match(source,/Seleccionar modalidad/);
  assert.match(source,/data-guided-required-progress/);
});

test('hábitos y check-in no inventan decisiones y participan en la guía global',()=>{
  assert.match(routeSource,/data-engagement-form="habit-definition" data-guided-required-form/);
  assert.match(routeSource,/name="unit" maxlength="40" placeholder="Ej\. veces, minutos, días"/);
  assert.doesNotMatch(routeSource,/name="unit" maxlength="40" value="veces"/);
  assert.match(routeSource,/name="frequency" required><option value="">Seleccionar frecuencia/);
  assert.match(routeSource,/data-engagement-form="checkin" data-guided-required-form/);
});

test('Agenda e informes muestran progreso de datos obligatorios',()=>{
  assert.match(routeSource,/data-workflow-form="appointment" data-guided-required-form/);
  assert.match(routeSource,/data-workflow-form="report-approval" data-guided-required-form/);
  const count=(routeSource.match(/data-guided-required-progress/g)||[]).length;
  assert.ok(count>=6,`Expected guided progress on multiple workflows, got ${count}`);
});

test('controlador global recalcula progreso también después del autofill de Agenda',()=>{
  assert.match(controllerSource,/guidedRequiredProgress/);
  assert.match(controllerSource,/syncGuidedWorkflowProgress\(appointmentForm\)/);
  assert.match(controllerSource,/root\.querySelectorAll\?\.\('\[data-guided-required-form\]'\)/);
});

test('perfil normalizado conserva contexto confirmado reutilizable sin inventarlo',()=>{
  const profile=normalizeClientProfile({
    experienceLevel:'Intermedia',
    trainingHistory:'2 años de fuerza',
    currentTraining:'2 sesiones semanales',
    primaryObjective:'Mejorar fuerza general',
    equipment:['TRX','mancuernas'],
    modality:'presencial',
    weeklyFrequency:2,
    sessionDurationMinutes:60,
  },{});
  assert.equal(profile.experienceLevel,'Intermedia');
  assert.equal(profile.trainingHistory,'2 años de fuerza');
  assert.equal(profile.currentTraining,'2 sesiones semanales');
  assert.equal(profile.primaryObjective,'Mejorar fuerza general');
  assert.deepEqual(profile.equipment,['TRX','mancuernas']);
  assert.equal(profile.weeklyFrequency,2);
  assert.equal(profile.sessionDurationMinutes,60);

  const empty=normalizeClientProfile({},{});
  assert.equal(empty.experienceLevel,null);
  assert.equal(empty.trainingHistory,null);
  assert.equal(empty.currentTraining,null);
  assert.equal(empty.weeklyFrequency,null);
  assert.equal(empty.sessionDurationMinutes,null);
});
