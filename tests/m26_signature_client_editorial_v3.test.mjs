import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const css=readFileSync(new URL('../src/m26/design/dark-iberfit-v2.css',import.meta.url),'utf8');
const continuity=readFileSync(new URL('../src/m26/ui/progress-continuity.js',import.meta.url),'utf8');

function clientVm(overrides={}){
  return {
    role:'client',
    serviceKind:'training',
    clients:[{id:'synthetic-client',name:'Prueba de UI',cycle:{name:'Plan de fuerza'},iri:{confirmed:true}}],
    appointments:[],
    upcoming:[],
    operations:{pending:0,conflicts:0,rejected:0},
    rc39:{sessionProjections:[]},
    ...overrides,
  };
}
const client=(override={})=>[{
  id:'synthetic-client',name:'Prueba de UI',
  cycle:{name:'Plan de fuerza'},iri:{confirmed:true},...override,
}];

test('SIGNATURE Client editorial v3 is scoped and never changes Coach/Admin',()=>{
  const clientHtml=renderHoyRoute(clientVm());
  assert.match(clientHtml,/m26-client-home-v1 m26-client-home-editorial-v3/u);
  assert.match(css,/SIGNATURE 360 · CLIENT EDITORIAL V3/u);
  assert.match(css,/\.m26-shell\[data-m26-role="client"\] \.m26-client-home-editorial-v3/u);
  assert.doesNotMatch(renderHoyRoute({...clientVm(),role:'coach'}),/m26-client-home-editorial-v3/u);
  assert.doesNotMatch(renderHoyRoute({...clientVm(),role:'admin'}),/m26-client-home-editorial-v3/u);
});

test('Training journey separates planning, executable sessions and evidence-based follow-up',()=>{
  const markup=renderHoyRoute(clientVm({
    appointments:[{id:'appt',sessionId:'s1',statusRaw:'confirmada',title:'Sesión de fuerza'}],
    upcoming:[{id:'appt',sessionId:'s1',statusRaw:'confirmada',title:'Sesión de fuerza'}],
    rc39:{sessionProjections:[{id:'s1',visible:true,canClientStart:true,session:{title:'Sesión de fuerza'}}]},
  }));
  const journey=markup.match(/<section class="m26-client-home-journey"[\s\S]*?<\/section>/u)?.[0]||'';
  assert.match(journey,/data-m26-client-training-journey/u);
  assert.match(journey,/aria-labelledby="m26-client-journey-title"/u);
  assert.match(journey,/<ol class="m26-client-home-journey-steps">/u);
  assert.equal((journey.match(/<li data-journey-state=/gu)||[]).length,3);
  assert.match(journey,/Planificación<\/strong><small>Plan o sesiones disponibles/u);
  assert.match(journey,/data-journey-state="available"[\s\S]*?Sesiones<\/strong><small>Hay una sesión lista para empezar/u);
  assert.match(journey,/Seguimiento<\/strong><small>Evolución basada en registros reales/u);
  assert.doesNotMatch(journey,/Diagnóstico IRI|\d+%|Completado|Sin señales prioritarias/u);
  assert.match(markup,/data-workflow-action="start-published-session" data-entity-id="s1"/u);
});

test('Published sessions are never advertised as executable without a start permission',()=>{
  const markup=renderHoyRoute(clientVm({
    rc39:{sessionProjections:[{id:'read-only',visible:true,canClientStart:false,session:{title:'Sesión supervisada'}}]},
  }));
  const journey=markup.match(/<section class="m26-client-home-journey"[\s\S]*?<\/section>/u)?.[0]||'';
  assert.match(journey,/data-journey-state="published"/u);
  assert.match(journey,/Tienes sesiones para consultar/u);
  assert.doesNotMatch(journey,/Hay una sesión lista para empezar/u);
  assert.doesNotMatch(markup,/data-workflow-action="start-published-session"/u);
});

test('Paused training preserves history and does not promise a startable session',()=>{
  const markup=renderHoyRoute(clientVm({
    clients:client({serviceActive:false}),
    rc39:{sessionProjections:[{id:'paused-session',visible:true,canClientStart:true,session:{title:'Entrenamiento'}}]},
  }));
  const journey=markup.match(/<section class="m26-client-home-journey"[\s\S]*?<\/section>/u)?.[0]||'';
  assert.match(journey,/data-journey-state="paused"/u);
  assert.match(journey,/Servicio en pausa · historial conservado/u);
  assert.doesNotMatch(markup,/data-workflow-action="start-published-session"/u);
});

test('IRI-only membership never creates a phantom training journey',()=>{
  const markup=renderHoyRoute(clientVm({
    serviceKind:'iri_only',
    clients:client({cycle:null}),
  }));
  assert.doesNotMatch(markup,/data-m26-client-training-journey/u);
  assert.match(markup,/Tu punto de partida|Diagnóstico IRI/u);
  assert.doesNotMatch(markup,/Tu proceso de entrenamiento/u);
});

test('Mobile, motion, high contrast and touch preserve premium readability',()=>{
  const visual=css.slice(css.indexOf('SIGNATURE 360 · CLIENT EDITORIAL V3'));
  assert.match(visual,/@media\(max-width:900px\)/u);
  assert.match(visual,/@media\(max-width:680px\)/u);
  assert.match(visual,/@media\(prefers-reduced-motion:reduce\)/u);
  assert.match(visual,/@media\(forced-colors:active\)/u);
  assert.match(visual,/\.m26-client-home-journey-steps\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/u);
  assert.ok(visual.includes('grid-template-columns:repeat(3,minmax(0,1fr));'));
  assert.match(visual,/min-height:7\.2rem/u);
  assert.match(visual,/outline:3px solid #5e4521/u);
  assert.match(continuity,/\.m27-client-home-card>small\{[^}]*font-size:\.86rem/u);
  assert.doesNotMatch(visual,/\b(?:position:fixed|overflow:hidden|!important)\b/u);
});

test('New editorial journey remains intelligible in English, French and Portuguese',()=>{
  const originals=[
    'El método IBERFIT','Tu proceso de entrenamiento',
    'Planificar, entrenar y evaluar. Cada etapa con criterio.',
    'Plan o sesiones disponibles','El equipo está preparando tu plan',
    'Servicio en pausa · historial conservado',
    'Hay una sesión lista para empezar','Tienes sesiones para consultar',
    'Aparecerán aquí cuando estén publicadas','Evolución basada en registros reales',
  ];
  for(const language of ['en','fr','pt']){
    for(const source of originals){
      const translated=iberfitSurfaceTranslate(source,{language});
      assert.ok(translated&&translated!==source,language+': untranslated Client journey copy: '+source);
    }
  }
  assert.equal(
    iberfitSurfaceTranslate('Tu proceso de entrenamiento',{language:'en'}),
    'Your training journey',
  );
});

function rgb(hex){
  const values=hex.replace('#','').match(/.{2}/gu).map(v=>parseInt(v,16)/255);
  return values.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
}
function contrast(a,b){
  const lum=(c)=>rgb(c).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  const x=lum(a),y=lum(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
test('Warm materials preserve WCAG AA contrast rather than decorative opacity',()=>{
  assert.ok(contrast('#f8ecda','#183c2c')>=7,'primary action needs enhanced contrast');
  assert.ok(contrast('#c6bfaf','#182e25')>=4.5,'journey explanatory copy must be readable');
  assert.ok(contrast('#f1e6d0','#182e25')>=7,'journey headings need enhanced contrast');
});
