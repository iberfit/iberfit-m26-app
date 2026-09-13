import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

const css=fs.readFileSync('src/m26/design/dark-iberfit-v2.css','utf8');
const i18n=fs.readFileSync('src/m26/ui/i18n-surface-workspace.js','utf8');

function vm(overrides={}){
  return {
    role:'client',
    clients:[{
      id:'c1',
      name:'Cynthia',
      cycle:{name:'Fuerza Base'},
      iri:{confirmed:true,processLabel:'Baseline confirmado'},
      nextAction:{area:'actividad',label:'Registrar bienestar',reason:'Actualiza tu estado de hoy.'},
    }],
    appointments:[],
    upcoming:[],
    proposals:[],
    operations:{pending:0,conflicts:0,rejected:0},
    rc39:{sessionProjections:[]},
    ...overrides,
  };
}

test('Client Home starts with one dominant daily action and no generic KPI grid',()=>{
  const html=renderHoyRoute(vm());
  assert.match(html,/m26-client-home-v1/u);
  assert.match(html,/Hola, Cynthia/u);
  assert.match(html,/class="m26-today-action is-primary m26-client-home-primary" data-m26-area="actividad"/u);
  assert.match(html,/Registrar cómo estoy/u);
  assert.match(html,/Sin sesión confirmada hoy/u);
  assert.doesNotMatch(html,/m26-stat-grid/u);
  assert.doesNotMatch(html,/Tu ruta IBERFIT/u);
});

test('Client Home promotes an executable confirmed session without ambiguity',()=>{
  const html=renderHoyRoute(vm({
    appointments:[{
      id:'a1',
      sessionId:'s1',
      statusRaw:'confirmada',
      title:'Fuerza y potencia',
      dateLabel:'18:00',
      modality:'Presencial',
    }],
    rc39:{sessionProjections:[{
      id:'s1',
      visible:true,
      canClientExecute:true,
      session:{title:'Fuerza y potencia',blocks:[{id:'b1'}]},
    }]},
  }));
  assert.match(
    html,
    /class="m26-today-action is-primary m26-client-home-primary" data-workflow-action="start-published-session" data-entity-id="s1"/u,
  );
  assert.match(html,/Entrenar ahora/u);
  assert.match(html,/Fuerza y potencia/u);
  assert.match(html,/18:00/u);
});

test('Client Home opens sessions when training exists but no linked runnable appointment exists',()=>{
  const html=renderHoyRoute(vm({
    rc39:{sessionProjections:[{
      id:'s1',
      visible:true,
      canClientExecute:true,
      session:{title:'Sesión A',blocks:[{id:'b1'}]},
    }]},
  }));
  assert.match(
    html,
    /class="m26-today-action is-primary m26-client-home-primary" data-m26-area="sesion"/u,
  );
  assert.match(html,/Abrir mis sesiones/u);
  assert.match(html,/Tienes 1 sesión disponible/u);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/u);
});

test('Client Home exposes only useful daily context instead of sad-zero KPI cards',()=>{
  const html=renderHoyRoute(vm());
  assert.match(html,/Próxima cita/u);
  assert.match(html,/Por confirmar/u);
  assert.match(html,/Tu plan/u);
  assert.match(html,/Fuerza Base/u);
  assert.match(html,/Diagnóstico IRI/u);
  assert.match(html,/Baseline confirmado/u);
  assert.match(html,/Bienestar/u);
  assert.match(html,/Progreso/u);
  assert.match(html,/Entrenamientos/u);
  assert.doesNotMatch(html,/Sesiones confirmadas hoy/u);
});

test('Client Home has explicit mobile-first responsive hierarchy',()=>{
  assert.match(css,/CLIENT HOME V1 · PREMIUM DAILY MOBILE EXPERIENCE/u);
  assert.match(css,/\.m26-client-home-primary\{[\s\S]*?min-height:6\.8rem/u);
  assert.match(css,/@media\(max-width:680px\)[\s\S]*?\.m26-client-home-glance\{[\s\S]*?grid-template-columns:1fr/u);
  assert.match(css,/@media\(max-width:680px\)[\s\S]*?\.m26-client-home-actions\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/u);
});

test('stable Client Home copy is translated',()=>{
  for(const phrase of [
    'Tu sesión de hoy',
    'Entrenar ahora',
    'Abrir mis sesiones',
    'Próxima cita',
    'Diagnóstico IRI',
    'Registrar cómo estoy',
  ])assert.ok(i18n.includes(phrase),phrase);
});
