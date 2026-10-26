import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderHoyRoute,renderRouteView} from '../src/m26/modules/route-render.js';

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
    upcoming:[{id:'a1',sessionId:'s1',statusRaw:'confirmada',title:'Fuerza y potencia',dateLabel:'18:00',modality:'Presencial'}],
    rc39:{sessionProjections:[{
      id:'s1',
      visible:true,
      canClientExecute:true,
      canClientStart:true,
      session:{title:'Fuerza y potencia',blocks:[{id:'b1',exerciseId:'squat',name:'Sentadilla'}]},
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
      canClientStart:true,
      session:{title:'Sesión A',blocks:[{id:'b1',exerciseId:'squat',name:'Sentadilla'}]},
    }]},
  }));
  assert.match(html,/class="m26-today-action is-primary" data-workflow-action="start-published-session" data-entity-id="s1"/u);
  assert.match(html,/Entrenar ahora/u);
});

test('Client Home exposes only useful daily context and progressively discloses secondary destinations',()=>{
  const html=renderHoyRoute(vm());
  assert.match(html,/Próxima cita/u);
  assert.match(html,/Sin cita programada/u);
  assert.doesNotMatch(html,/Por confirmar/u,'an empty calendar must not imply a pending reservation');
  assert.match(html,/data-m26-area="sesion" aria-label="Ver mis sesiones"/u);
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
  const actionStyle=css.match(/\.m26-client-home-primary-zone \.m26-today-action\.is-primary\{([^}]+)\}/u)?.[1]||'';
  const touchHeight=Number(actionStyle.match(/min-height:([0-9.]+)rem/u)?.[1]||0);
  assert.ok(touchHeight>=6.8,'primary mobile action may grow but never shrink below the established touch height');
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
  assert.match(pending,/Consulta el estado de tu evaluación/u);

  const completed=renderHoyRoute(vm());
  assert.doesNotMatch(completed,/<span>Diagnóstico IRI<\/span>/u);
  assert.match(completed,/>Informes<\/button>/u);
});

test('Client Home keeps status-only initial IRI provisional until confirmed',()=>{
  const html=renderHoyRoute(vm({
    clients:[{
      id:'c1',
      name:'Cynthia',
      cycle:{name:'Fuerza Base'},
      iri:{confirmed:false,status:'Completada',processLabel:'Completada'},
      nextAction:{area:'actividad',label:'Registrar bienestar',reason:'Actualiza tu estado de hoy.'},
    }],
  }));
  assert.match(html,/<span>Diagnóstico IRI<\/span>/u);
  assert.match(html,/Consulta el estado de tu evaluación/u);
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
    upcoming:[{id:'a1',sessionId:'s1',statusRaw:'confirmada',title:'Fuerza y potencia',dateLabel:'18:00',modality:'Presencial'}],
    rc39:{sessionProjections:[{
      id:'s1',
      visible:true,
      canClientExecute:true,
      canClientStart:true,
      session:{title:'Fuerza y potencia',blocks:[{id:'b1',exerciseId:'squat',name:'Sentadilla'}]},
    }]},
  }));
  assert.match(html,/Entrenar ahora/u);
  assert.doesNotMatch(html,/m26-client-home-agenda/u);
});

test('stable Client Home copy is translated',()=>{
  for(const phrase of [
    'Tu sesión de hoy',
    'Hoy · IBERFIT',
    'Tu día en IBERFIT',
    'Tu siguiente paso',
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

test('M42 Client Hoy never sends a real appointment CTA to forbidden Coach Agenda',()=>{
  const input=vm({serviceKind:'training',clients:[{
    id:'c1',name:'Cynthia',cycle:{name:'Fuerza Base'},
    iri:{confirmed:true},serviceActive:true,
    nextAction:{area:'agenda',label:'Ver próxima cita',reason:'Cita confirmada.'},
  }]});
  const html=renderHoyRoute(input);
  assert.doesNotMatch(html,/data-m26-area="agenda"/u);
  assert.match(html,/class="m26-client-home-context-action" data-m26-area="planificacion"/u);
});

test('M42 Client Hoy suppresses supplementary training CTAs during a paused service',()=>{
  const input=vm({serviceKind:'training',clients:[{
    id:'c1',name:'Cynthia',cycle:{name:'Fuerza Base'},
    serviceActive:false,trainingServiceStatus:'paused',
    nextAction:{area:'planificacion',label:'Continuar entrenamiento',reason:'Plan antiguo'},
  }],rc39:{sessionProjections:[{id:'old-session',visible:true,canClientStart:true}]}});
  const html=renderHoyRoute(input);
  assert.match(html,/Tu entrenamiento está en pausa/u);
  assert.doesNotMatch(html,/m26-client-home-context-action/u);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/u);
});

test('SIGNATURE Hoy groups orientation and primary action into one editorial region',()=>{
  const html=renderHoyRoute(vm());
  const start=html.indexOf('<section class="m26-client-home-feature"');
  const action=html.indexOf('<div class="m26-client-home-primary-zone"');
  const glance=html.indexOf('<section class="m26-client-home-glance"');
  assert.ok(start>=0&&action>start&&glance>action,'feature must precede the daily context');
  assert.match(html,/<span class="m26-client-home-kicker">Hoy · IBERFIT<\/span>/u);
  assert.doesNotMatch(html,/class="m26-client-home-action-kicker"/u,'a duplicate CTA eyebrow dilutes hierarchy');
  assert.equal((html.match(/class="m26-today-action is-primary"/gu)||[]).length,1);
});

test('SIGNATURE Hoy uses matte forest surfaces without changing role authorization',()=>{
  assert.match(css,/\.m26-client-home-feature\{[\s\S]*?grid-template-columns:minmax\(0,1\.22fr\) minmax\(18rem,\.78fr\)/u);
  assert.match(css,/\.m26-client-home-feature\{[\s\S]*?background:var\(--iberfit-color-surface-base\)/u);
  assert.doesNotMatch(css.match(/\.m26-client-home-feature\{[^}]+\}/u)?.[0]||'',/cream-100/u);
  assert.match(css,/\.m26-client-home-primary-zone\{[\s\S]*?background:var\(--iberfit-color-forest-950\)/u);
  assert.match(css,/@media\(max-width:900px\)[\s\S]*?\.m26-client-home-feature\{\s*grid-template-columns:minmax\(0,1fr\)/u);
  const paused=renderHoyRoute(vm({serviceKind:'training',clients:[{
    id:'c1',name:'Cliente de prueba',serviceActive:false,
    trainingServiceStatus:'paused',iri:{confirmed:true},
  }]}));
  assert.match(paused,/class="m26-client-home-feature"/u);
  assert.doesNotMatch(paused,/data-workflow-action="start-published-session"/u);
  const iriOnly=renderHoyRoute(vm({serviceKind:'iri',clients:[{
    id:'c1',name:'Cliente IRI',iri:{confirmed:false},
  }]}));
  assert.match(iriOnly,/Diagnóstico IRI/u);
  assert.doesNotMatch(iriOnly,/data-workflow-action="start-published-session"/u);
});

test('SIGNATURE Hoy preserves visible Client actions and never promotes empty device metrics',()=>{
  const html=renderHoyRoute(vm({wearables:{}}));
  assert.match(html,/class="m26-client-health is-empty"/u);
  assert.match(html,/data-m26-area="actividad">Ver conexión y actividad/u);
  assert.match(html,/data-m26-area="planificacion"/u);
  assert.match(html,/class="m26-client-home-secondary-disclosure"/u);
  const feature=html.match(/<section class="m26-client-home-feature"[\s\S]*?<\/section>/u)?.[0]||'';
  assert.equal((feature.match(/class="m26-today-action is-primary"/gu)||[]).length,1);
});

test('SIGNATURE Client mobile navigation keeps full accessible destinations with concise visible labels',()=>{
  const html=renderRouteView({...vm(),kind:'hoy'});
  for(const [area,aria,shortLabel] of [
    ['planificacion','Planificación','Plan'],
    ['sesion','Sesiones','Sesión'],
    ['progreso','Progreso','Avance'],
  ]){
    const item=html.match(new RegExp('<button[^>]+data-m26-area="'+area+'"[^>]+aria-label="'+aria+'"[^>]*>[\\s\\S]*?<\\/button>','u'))?.[0]||'';
    assert.ok(item,area+' retains full accessible navigation');
    assert.ok(item.includes('m26-client-bottom-nav-label-compact')&&item.includes('>'+shortLabel+'</span>'),shortLabel);
  }
});

test('SIGNATURE warm Client Today differentiates optional empty health from confirmed metrics',()=>{
  const empty=renderHoyRoute(vm({wearables:{}}));
  assert.match(empty,/<h2>Actividad a tu ritmo<\/h2>/u);
  assert.match(empty,/Puedes entrenar sin reloj\. Si decides compartir datos compatibles/u);
  assert.match(empty,/data-m26-area="actividad">Ver conexión y actividad<\/button>/u);
  assert.doesNotMatch(empty,/class="m26-client-health-metric"/u);
  const summary={summary:{daysWithData:2,metrics:{steps:4321,sleepMinutes:460,restingHeartRate:61}}};
  const confirmed=renderHoyRoute(vm({wearables:summary}));
  assert.match(confirmed,/<h2>Tu actividad, a la vista<\/h2>/u);
  assert.match(confirmed,/class="m26-client-health-metric"/u);
  assert.doesNotMatch(confirmed,/Actividad a tu ritmo/u);
  const action=css.match(/\.m26-client-home-primary-zone \.m26-today-action\.is-primary\{([^}]+)\}/u)?.[1]||'';
  assert.match(action,/border:1px solid var\(--iberfit-color-gold-500\)/u);
  assert.match(action,/border-radius:1\.35rem/u);
  assert.doesNotMatch(action,/gradient\(|translateY/u);
});
