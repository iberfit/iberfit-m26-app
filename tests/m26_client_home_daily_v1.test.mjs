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
  assert.match(html,/class="m26-today-action is-primary" data-m26-area="actividad"/u);
  assert.match(html,/Registrar cómo estoy/u);
  assert.doesNotMatch(html,/m26-client-home-agenda/u);
  assert.doesNotMatch(html,/Sin sesión confirmada hoy/u);
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
    /class="m26-today-action is-primary" data-workflow-action="start-published-session" data-entity-id="s1"/u,
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
    /class="m26-today-action is-primary" data-m26-area="sesion"/u,
  );
  assert.match(html,/Abrir mis sesiones/u);
  assert.match(html,/Tienes 1 sesión disponible/u);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/u);
});

test('Client Home exposes only useful daily context and progressively discloses secondary destinations',()=>{
  const html=renderHoyRoute(vm());
  assert.match(html,/Próxima cita/u);
  assert.match(html,/Por confirmar/u);
  assert.match(html,/Tu plan/u);
  assert.match(html,/Fuerza Base/u);
  assert.doesNotMatch(html,/<span>Diagnóstico IRI<\/span>/u);
  assert.doesNotMatch(html,/Baseline confirmado/u);
  assert.match(html,/class="m26-client-home-secondary-disclosure"/u);
  assert.match(html,/<summary data-m26-client-guide="secondary-actions">/u);
  assert.match(html,/Más para ti/u);
  assert.match(html,/class="m26-client-home-secondary-actions"/u);
  assert.match(html,/>Bienestar<\/button>/u);
  assert.match(html,/>Mensajes<\/button>/u);
  assert.match(html,/>Informes<\/button>/u);
  assert.doesNotMatch(html,/m26-client-home-actions/u);
  assert.doesNotMatch(html,/m26-client-home-agenda/u);
});

test('Client Home hides unavailable communication from secondary daily shortcuts',()=>{
  const html=renderHoyRoute(vm({
    clientGuide:{communicationAvailable:false},
  }));
  assert.match(html,/Bienestar, informes y retos/u);
  assert.doesNotMatch(html,/data-m26-area="mensajes"/u);
  assert.doesNotMatch(html,/>Mensajes<\/button>/u);

  const available=renderHoyRoute(vm({
    clientGuide:{communicationAvailable:true},
  }));
  assert.match(available,/Bienestar, mensajes, informes y retos/u);
  assert.match(available,/data-m26-area="mensajes">Mensajes<\/button>/u);
});

test('Client Home never repeats the same next action below the primary action',()=>{
  const same=renderHoyRoute(vm());
  assert.doesNotMatch(same,/m26-client-home-context-action/u);

  const distinct=renderHoyRoute(vm({
    clients:[{
      id:'c1',
      name:'Cynthia',
      cycle:{name:'Fuerza Base'},
      iri:{confirmed:true,processLabel:'Baseline confirmado'},
      nextAction:{area:'planificacion',label:'Revisar planificación',reason:'Hay un cambio confirmado en el plan.'},
    }],
  }));
  assert.match(distinct,/class="m26-client-home-context-action" data-m26-area="planificacion"/u);
  assert.match(distinct,/Revisar mi planificación/u);
});

test('Client Home has explicit mobile-first responsive hierarchy',()=>{
  assert.match(css,/CLIENT HOME V1 · PREMIUM DAILY MOBILE EXPERIENCE/u);
  assert.match(css,/\.m26-client-home-primary-zone \.m26-today-action\.is-primary\{[\s\S]*?min-height:6\.8rem/u);
  assert.match(css,/\.m26-client-home-glance\{[\s\S]*?repeat\(auto-fit,minmax\(13rem,1fr\)\)/u);
  assert.match(css,/\.m26-client-home-secondary-disclosure > summary\{[\s\S]*?min-height:44px/u);
  assert.match(css,/@media\(max-width:680px\)[\s\S]*?\.m26-client-home-glance\{[\s\S]*?grid-template-columns:1fr/u);
  assert.match(css,/@media\(max-width:680px\)[\s\S]*?\.m26-client-home-secondary-actions\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u);
  assert.match(css,/@media\(max-width:680px\)[\s\S]*?\.m26-client-home-context-action\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/u);
  assert.match(css,/\.m26-client-home-status\{[\s\S]*?border-left:1px solid/u);
});

test('Client Home keeps IRI visible only while the initial diagnosis is still pending',()=>{
  const pending=renderHoyRoute(vm({
    clients:[{
      id:'c1',
      name:'Cynthia',
      cycle:{name:'Fuerza Base'},
      iri:{confirmed:false,processLabel:'En preparación'},
      nextAction:{area:'actividad',label:'Registrar bienestar',reason:'Actualiza tu estado de hoy.'},
    }],
  }));
  assert.match(pending,/<span>Diagnóstico IRI<\/span>/u);
  assert.match(pending,/En preparación/u);
  assert.match(pending,/Completa tu punto de partida/u);

  const completed=renderHoyRoute(vm());
  assert.doesNotMatch(completed,/<span>Diagnóstico IRI<\/span>/u);
  assert.match(completed,/>Informes<\/button>/u);
});

test('Client Home treats legacy IRI status Completada as completed daily context',()=>{
  const html=renderHoyRoute(vm({
    clients:[{
      id:'c1',
      name:'Cynthia',
      cycle:{name:'Fuerza Base'},
      iri:{confirmed:false,status:'Completada',processLabel:'Completada'},
      nextAction:{area:'actividad',label:'Registrar bienestar',reason:'Actualiza tu estado de hoy.'},
    }],
  }));
  assert.doesNotMatch(html,/<span>Diagnóstico IRI<\/span>/u);
  assert.match(html,/data-m26-area="informes">Informes<\/button>/u);
});

test('Client Home does not duplicate the primary runnable session in the agenda',()=>{
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
  assert.match(html,/Entrenar ahora/u);
  assert.doesNotMatch(html,/m26-client-home-agenda/u);
});

test('stable Client Home copy is translated',()=>{
  for(const phrase of [
    'Tu sesión de hoy',
    'Entrenar ahora',
    'Abrir mis sesiones',
    'Próxima cita',
    'Diagnóstico IRI',
    'Completa tu punto de partida',
    'Más para ti',
    'Bienestar, informes',
    'Bienestar, informes y retos',
    'Próximas sesiones',
    'Registrar cómo estoy',
  ])assert.ok(i18n.includes(phrase),phrase);
});


test('Client Home keeps Client-safe destinations without exposing Coach-only agenda or IRI routes',()=>{
  const html=renderHoyRoute(vm());
  assert.match(html,/data-m26-area="sesion"[\s\S]*?<span>Próxima cita<\/span>/u);
  assert.match(html,/data-m26-area="informes">Informes<\/button>/u);
  assert.doesNotMatch(html,/<span>Diagnóstico IRI<\/span>/u);
  assert.doesNotMatch(html,/data-m26-area="agenda"/u);
  assert.doesNotMatch(html,/data-m26-area="iri"/u);
});
