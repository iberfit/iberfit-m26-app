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
  assert.match(clientHtml,/Diagnóstico IRI/u);
});
