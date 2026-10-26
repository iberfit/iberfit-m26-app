import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderReadyWorkoutRoadmap,renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {createExecution} from '../src/m26/workflows/session-execution.js';
const shared={clientId:'c1',status:'disponible',deliveryModality:'guiada_en_app',clientVisibilityLevel:'full',visibleToClient:true};
const session=(owner,count=3)=>({...shared,id:'s-'+owner,deliveryOwnership:owner,title:'Sesión IBERFIT',blocks:Array.from({length:count},(_,i)=>({id:'b'+i,type:'exercise',exerciseId:'e'+i,sets:2,reps:'10',restSeconds:45}))});
const catalog={get:id=>({id,name_es:id==='e1'?'<script>alert(1)</script>':'Ejercicio '+id}),search:()=>[]};
const execution=(record)=>createExecution({session:record,clientId:'c1'});
test('B25 Cliente autónomo revisa pasos sin progreso inventado ni XSS',()=>{
  const record=session('client_autonomous');
  const html=renderReadyWorkoutRoadmap({execution:execution(record),session:record,catalog,role:'client'});
  assert.match(html,/data-signature-ready-playback="autonomous"/);
  assert.match(html,/Entrenamiento autónomo/);
  assert.match(html,/Objetivos planificados/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>/);
});
test('B25 Cliente guiado abre reproductor con Inicio real y sin modo Coach',()=>{
  const record=session('guided_in_app');
  const html=renderGuidedExecution({execution:execution(record),session:record,catalog,role:'client'});
  assert.match(html,/data-signature-ready-playback="guided"/);
  assert.match(html,/Guiado por IBERFIT/);
  assert.match(html,/data-session-action="start"/);
  assert.doesNotMatch(html,/data-signature-ready-playback="supervised"/);
});
test('B25 Coach recibe propia preparación presencial y ejecución',()=>{
  const record={...session('coach_led'),deliveryModality:'presencial',clientVisibilityLevel:'summary_only'};
  const html=renderGuidedExecution({execution:execution(record),session:record,catalog,role:'coach'});
  assert.match(html,/data-signature-ready-playback="supervised"/);
  assert.match(html,/Ejecuta el Coach/);
  assert.match(html,/data-session-action="start"/);
  assert.match(html,/cargas previstas no son resultados/);
});
test('B25 ocho pasos conservan el plan completo en disclosure accesible',()=>{
  const record=session('guided_in_app',8);
  const html=renderReadyWorkoutRoadmap({execution:execution(record),session:record,catalog,role:'client'});
  assert.match(html,/Ver los 3 pasos restantes/);
  assert.match(html,/<details class="m26-ready-roadmap-more">/);
  assert.match(html,/<ol start="6">/);
  assert.match(html,/Ejercicio e7/);
  assert.equal((html.match(/class="m26-ready-roadmap-step"/g)||[]).length,8);
});
test('B25 tipografía, interacción, tres roles y contraste preservados',()=>{
  const css=readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
  assert.match(css,/m26-ready-roadmap-more summary:focus-visible/);
  assert.match(css,/m26-ready-roadmap-more:not\(\[open\]\)>ol\{display:none\}/);
  for(const role of ['client','coach','admin'])assert.match(css,new RegExp('m26-shell\\[data-m26-role="'+role+'"\\]'));
  assert.match(css,/@media\(forced-colors:active\)/);
});
