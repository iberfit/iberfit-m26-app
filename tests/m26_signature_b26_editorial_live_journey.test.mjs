import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderReadyWorkoutRoadmap} from '../src/m26/workflows/session-ui.js';
import {createExecution} from '../src/m26/workflows/session-execution.js';

const css=readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
const make=(ownership,count=8)=>({
  id:'b26-'+ownership,clientId:'client-b26',title:'Plan real',status:'disponible',
  deliveryModality:ownership==='coach_led'?'presencial':'guiada_en_app',
  deliveryOwnership:ownership,visibleToClient:true,clientVisibilityLevel:'full',
  blocks:Array.from({length:count},(_,i)=>({
    id:'b'+i,type:'exercise',exerciseId:'e'+i,sets:2,reps:'10',plannedLoad:'12 kg',
  })),
});
const catalog={get:id=>({id,name_es:id==='e1'?'<img src=x onerror=alert(1)>':'Ejercicio '+id})};

test('B26 editorial: Cliente ve cantidad real, todas las prescripciones y nada ejecutado',()=>{
  const session=make('client_autonomous');
  const html=renderReadyWorkoutRoadmap({session,execution:createExecution({session,clientId:session.clientId}),catalog,role:'client'});
  assert.match(html,/data-signature-ready-playback="autonomous"/);
  assert.match(html,/data-ready-step-count="8"/);
  assert.match(html,/8 pasos previstos/);
  assert.match(html,/Objetivos planificados, no resultados/);
  assert.match(html,/Ver los 3 pasos restantes/);
  assert.match(html,/<ol start="6">/);
  assert.match(html,/Ejercicio e7/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<img src=x/);
});

test('B26 Coach mantiene lenguaje profesional y propiedad de sesión',()=>{
  const session=make('coach_led',1);
  const html=renderReadyWorkoutRoadmap({session,execution:createExecution({session,clientId:session.clientId}),catalog,role:'coach'});
  assert.match(html,/data-signature-ready-playback="supervised"/);
  assert.match(html,/Orden de trabajo/);
  assert.match(html,/1 paso previsto/);
  assert.match(html,/Ejecuta el Coach/);
  assert.match(html,/cargas previstas no son resultados/);
  assert.doesNotMatch(html,/ready-roadmap-more/);
});

test('B26 interfaz sin animación repetida de rutas y con garantías a 320 px',()=>{
  assert.doesNotMatch(css,/@keyframes iberfit-premium-route-enter/);
  assert.match(css,/m26-ready-roadmap-more:not\(\[open\]\)>ol\{display:none\}/);
  assert.match(css,/m26-ready-roadmap-more summary:focus-visible/);
  assert.match(css,/@media\(max-width:580px\)/);
  assert.match(css,/@media\(forced-colors:active\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  for(const role of ['client','coach','admin'])assert.match(css,new RegExp('data-m26-role="'+role+'"'));
});

test('B26 IRI: botón estable sin doble toggle móvil y navegación por teclado',()=>{
  const controller=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  const renderer=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.match(renderer,/data-iri-setup-toggle aria-expanded="false" aria-controls="m26-iri-setup-content"/);
  assert.match(renderer,/data-iri-setup-content hidden/);
  assert.match(controller,/setupToggle\.setAttribute\('aria-expanded',open\?'true':'false'\)/);
  assert.doesNotMatch(controller,/details\.open=!details\.open/);
  assert.match(css,/\[data-iri-setup-content\]\[hidden\]\{display:none\}/);
});
