import test from 'node:test';
import assert from 'node:assert/strict';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

const appointment=(id,title,clientId='a')=>({
  id,title,clientId,dateLabel:'Hoy, 14:00',statusRaw:'confirmada',modality:'Presencial'
});
function coach(overrides={}){
  return {
    role:'coach',clients:[{id:'a',name:'Cliente A',serviceActive:true},
      {id:'b',name:'Cliente B',serviceActive:true}],
    coachCockpit:{items:[],totalClients:2,attentionCount:0},
    operations:{pending:0,conflicts:0,rejected:0},
    proposals:[],appointments:[],upcoming:[],...overrides,
  };
}
const command=(vm)=>renderHoyRoute(vm)
  .match(/<section class="m26-coach-home-command"[\s\S]*?<\/section>/u)?.[0]||'';

test('Coach next session is the earliest still-upcoming confirmed one, not earlier historical appointment',()=>{
  const past=appointment('past','Sesión completada','a');
  const next=appointment('future','Fuerza de Cliente B','b');
  const html=command(coach({appointments:[past,next],upcoming:[next]}));
  assert.match(html,/Próxima sesión/u);
  assert.match(html,/Cliente B/u);
  assert.match(html,/data-m26-client-id="b"/u);
  assert.doesNotMatch(html,/Sesión completada/u);
});

test('Coach does not label a past session as upcoming when the only future appointment is another day',()=>{
  const past=appointment('past','Entrenamiento terminado','a');
  const tomorrow=appointment('tomorrow','Próxima semana','b');
  const html=command(coach({appointments:[past],upcoming:[tomorrow]}));
  assert.match(html,/Próxima cita/u);
  assert.match(html,/Cliente B/u);
  assert.doesNotMatch(html,/Próxima sesión/u);
  assert.doesNotMatch(html,/Entrenamiento terminado/u);
});

test('Coach agenda still retains earlier confirmed appointments as historical context',()=>{
  const past=appointment('past','Sesión de esta mañana','a');
  const html=renderHoyRoute(coach({appointments:[past]}));
  assert.match(html,/Sesión de esta mañana/u);
  assert.match(html,/Abrir agenda completa/u);
  assert.match(command(coach({appointments:[past]})),/Tu cartera está al día/u);
});

test('Coach agenda preserves earlier appointments but never offers a stale Start control',()=>{
  const past={...appointment('past','Pasada y confirmada','a'),sessionId:'session-past'};
  const next={...appointment('next','Futura y confirmada','b'),sessionId:'session-next'};
  const html=renderHoyRoute(coach({appointments:[past,next],upcoming:[next]}));
  assert.match(html,/Pasada y confirmada/u);
  assert.match(html,/Futura y confirmada/u);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session" data-entity-id="session-past"/u);
  assert.match(html,/data-workflow-action="start-published-session" data-entity-id="session-next"/u);
});

test('Coach prioritizes operational conflict over a future appointment',()=>{
  const next=appointment('future','Sesión confirmada','a');
  const html=command(coach({
    appointments:[next],upcoming:[next],
    operations:{pending:0,conflicts:1,rejected:0},
  }));
  assert.match(html,/Resolver conflicto operativo/u);
  assert.match(html,/data-m26-area="verificacion"/u);
  assert.doesNotMatch(html,/Próxima sesión/u);
});

test('Coach and Client Today stay separate; Cliente never inherits Coach priority',()=>{
  const clientHtml=renderHoyRoute({
    role:'client',serviceKind:'iri',
    clients:[{id:'a',name:'Cliente A',iri:{confirmed:true}}],
    appointments:[],upcoming:[],rc39:{sessionProjections:[]},
    operations:{pending:0,conflicts:0,rejected:0},
  });
  assert.doesNotMatch(clientHtml,/m26-coach-home-command/u);
  assert.match(clientHtml,/m26-client-home-feature/u);
  assert.match(clientHtml,/Hola, Cliente A/u);
});

test('Coach hero presents one decision and keeps the exact source evidence inside native disclosure',()=>{
  const focus=Object.freeze({kind:'warning',clientId:'a',clientName:'Cliente A',reason:'Revisar feedback',detail:'Observación confirmada',guidance:'Revisar antes de ajustar'});
  const other=Object.freeze({kind:'process',clientId:'b',clientName:'Cliente B',reason:'Actualizar planificación'});
  const vm=coach({coachCockpit:{totalClients:2,attentionCount:2,items:[focus,other],riskFocus:focus}});
  const html=renderHoyRoute(vm);
  assert.match(command(vm),/Revisar feedback/u);
  assert.match(html,/<details class="m26-coach-records-archive" data-coach-hero-context>/u);
  for(const s of ['Observación confirmada','Revisar antes de ajustar','Actualizar planificación'])assert.ok(html.includes(s));
  assert.equal((html.match(/class="m26-list-card m26-coach-priority-card"/gu)||[]).length,2);
  assert.match(html,/data-m26-client-id="a"/u);
  assert.match(html,/data-m26-select-client="b"/u);
});
test('Coach never collapses distinct follow-up or the operational conflict instead of the risk',()=>{
  const first={kind:'critical',clientId:'a',clientName:'Cliente A',reason:'Primera prioridad'};
  const second={kind:'warning',clientId:'a',clientName:'Cliente A',reason:'Segunda prioridad'};
  const cockpit={totalClients:2,attentionCount:2,items:[first,second],riskFocus:first};
  const html=renderHoyRoute(coach({coachCockpit:cockpit}));
  assert.match(html,/Segunda prioridad/u);
  assert.equal((html.match(/class="m26-list-card m26-coach-priority-card"/gu)||[]).length,2);
  const conflict=renderHoyRoute(coach({operations:{conflicts:1},coachCockpit:cockpit}));
  assert.doesNotMatch(conflict,/data-coach-hero-context/u);
});
