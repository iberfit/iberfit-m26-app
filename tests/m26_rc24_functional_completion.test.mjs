import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';
import {renderIntelligenceRoute,renderLibraryRoute} from '../src/m26/modules/route-render.js';

function baseState(){return {identity:{role:'coach'},selectedClientId:'c1',collections:{clients:[{id:'c1',name:'Cliente'}],clientProfiles:[{id:'p1',clientId:'c1',birthDate:'1990-07-20'}],intelligenceRuns:[]},environment:{installedCommands:[]}};}
function shell(area){return {activeArea:area,identity:{role:'coach'},page:{title:area}};}

test('inteligencia deriva la edad desde la fecha de nacimiento del expediente',()=>{
  const vm=createRouteViewModel(shell('inteligencia'),baseState(),new Date('2026-07-20T12:00:00Z'));
  assert.equal(vm.ageYears,36);
  const html=renderIntelligenceRoute(vm);
  assert.match(html,/Edad calculada/);
  assert.match(html,/value="36" readonly/);
  assert.doesNotMatch(html,/value="35"/);
});

test('inteligencia se bloquea cuando falta fecha de nacimiento',()=>{
  const state=baseState(); state.collections.clientProfiles=[];
  const vm=createRouteViewModel(shell('inteligencia'),state,new Date('2026-07-20T12:00:00Z'));
  const html=renderIntelligenceRoute(vm);
  assert.equal(vm.ageYears,null);
  assert.match(html,/Registra primero la fecha de nacimiento/);
  assert.match(html,/data-workflow-action="generate-intelligence" disabled/);
});

test('biblioteca expone los 367 ejercicios, no solo los primeros 120',()=>{
  const catalog=Array.from({length:367},(_,i)=>({id:`e${i}`,name_es:`Ejercicio ${i}`,pattern:'Patrón',equipment:'Sin equipo'}));
  const vm=createRouteViewModel(shell('biblioteca'),baseState(),new Date(),{catalog});
  assert.equal(vm.catalog.length,367);
  const html=renderLibraryRoute(vm);
  assert.match(html,/Mostrando los 367 ejercicios/);
  assert.match(html,/Ejercicio 366/);
});

test('controlador de biblioteca no conserva el límite fijo de 120',()=>{
  const source=fs.readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/limit:\s*120/);
  assert.match(source,/limit:catalog\?\.count\|\|367/);
});
