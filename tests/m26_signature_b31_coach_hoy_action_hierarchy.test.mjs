import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderRouteView} from '../src/m26/modules/route-render.js';

function coachVm(overrides={}){
  return {
    kind:'hoy',role:'coach',clients:[],appointments:[],upcoming:[],
    proposals:[],operations:{},
    coachCockpit:{totalClients:0,items:[],attentionCount:0},
    ...overrides,
  };
}
function quickNav(html){
  const nav=html.match(/<nav class="m26-coach-home-quick"[\s\S]*?<\/nav>/u)?.[0];
  assert.ok(nav,'Coach Hoy keeps its visible quick destinations');
  return nav;
}
function destinations(nav){
  return [...nav.matchAll(/data-m26-area="([^"]+)"/gu)].map(match=>match[1]);
}

test('B3.1: empty Coach portfolio prioritizes Clients once and preserves other quick routes',()=>{
  const html=renderRouteView(coachVm());
  const nav=quickNav(html);
  assert.match(html,/class="m26-primary-action" data-m26-area="clientes"/u);
  assert.deepEqual(destinations(nav),['planificacion','agenda']);
  assert.match(nav,/aria-label="Acciones rápidas"/u);
  assert.match(html,/Sin clientes asignados/u);
});

test('B3.1: healthy portfolio puts agenda in hero without duplicate global quick action',()=>{
  const clients=[{id:'client-a',name:'Cliente A',serviceActive:true}];
  const html=renderRouteView(coachVm({clients,coachCockpit:{totalClients:1,items:[],attentionCount:0}}));
  assert.match(html,/class="m26-primary-action" data-m26-area="agenda"/u);
  assert.deepEqual(destinations(quickNav(html)),['clientes','planificacion']);
  assert.match(html,/Abrir agenda completa/u,'Agenda remains reachable from its section');
});

test('B3.1: a client-scoped priority never hides the global client or agenda routes',()=>{
  const clients=[{id:'client-a',name:'Cliente A',serviceActive:true}];
  const html=renderRouteView(coachVm({
    clients,
    coachCockpit:{totalClients:1,items:[],attentionCount:1,riskFocus:{
      kind:'critical',clientId:'client-a',clientName:'Cliente A',reason:'Atención justificada',
    }},
  }));
  assert.match(html,/data-m26-coach-action="true" data-m26-client-id="client-a" data-m26-target-area="expediente"/u);
  assert.deepEqual(destinations(quickNav(html)),['clientes','planificacion','agenda']);
});

test('B3.1: operational conflicts keep all global destinations without routing to a client',()=>{
  const html=renderRouteView(coachVm({operations:{conflicts:1}}));
  assert.match(html,/class="m26-primary-action" data-m26-area="verificacion"/u);
  assert.deepEqual(destinations(quickNav(html)),['clientes','planificacion','agenda']);
});

test('B3.1: visual contract stays Coach-scoped and keyboard/touch-friendly',()=>{
  const css=readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  const block=css.split('/* SIGNATURE B3.1')[1]?.split('.m26-shell[data-m26-role="coach"] :is(.m26-client-card')[0]||'';
  assert.ok(block,'Coach Hoy command strip has a dedicated styling contract');
  assert.match(block,/data-m26-role="coach"/u);
  assert.match(block,/min-height:44px/u);
  assert.match(block,/:focus-visible/u);
  assert.match(block,/max-width:520px/u);
  assert.doesNotMatch(block,/!important/u,'New hierarchy adds no cascade overrides');
});
