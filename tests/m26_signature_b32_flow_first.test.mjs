import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';

function session(id,ready=true){
  return {id,title:'Sesión '+id,visible:true,visibility:'full',ownership:'guided_in_app',
    modality:'guiada_en_app',canClientExecute:ready,canClientStart:ready,calendarVisible:false,
    session:{id,status:'publicado',publishedAt:'2026-09-01T10:00:00Z',deliveryModality:'guiada_en_app',
      deliveryOwnership:'guided_in_app',clientVisibilityLevel:'full',blocks:[{exerciseId:'remo',name:'Remo',sets:3,reps:8}]}};
}
const client=(kind,items,more={})=>({kind,role:'client',selectedClient:{modality:'hibrido'},serviceActive:true,
  rc39:{planningItems:items,sessionProjections:items,appointments:[]},clientAppointments:[],...more});
test('B32 Cliente: next action is sourced from the same published and executable policy as Start',()=>{
  const html=renderRc39Route(client('planificacion',[session('A',true),session('B',false)]));
  assert.match(html,/data-signature-planning-focus="ready"/);
  assert.match(html,/data-m26-area="sesion"/);
  assert.match(html,/data-rc39-session="A"/);
  assert.match(html,/data-rc39-session="B"/);
  assert.equal((html.match(/data-signature-planning-focus="ready"/g)||[]).length,1);
});
test('B32 Cliente: paused service never offers a ready focus or new start',()=>{
  const html=renderRc39Route(client('planificacion',[session('A')],{serviceActive:false}));
  assert.doesNotMatch(html,/data-signature-planning-focus="ready"/);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/);
});
test('B32 Cliente: native disclosure retains every published session and permitted start action',()=>{
  const items=Array.from({length:9},(_,i)=>session('s'+i,i>5));
  const p=renderRc39Route(client('planificacion',items));
  const s=renderRc39Route(client('sesion',items));
  assert.match(p,/data-signature-planning-archive/);
  assert.match(s,/data-signature-session-archive/);
  assert.ok(s.indexOf('data-rc39-session="s6"')<s.indexOf('data-rc39-session="s0"'));
  for(let i=0;i<9;i++){
    assert.match(p,new RegExp('data-rc39-session="s'+i+'"'));
    assert.match(s,new RegExp('data-rc39-session="s'+i+'"'));
  }
  assert.match(s,/data-workflow-action="start-published-session"/);
});
test('B32 Agenda: never calls an old or invalid date the next confirmed appointment',()=>{
  const past={id:'old',title:'Histórica',startAt:'2020-01-01T12:00:00Z',status:'confirmada'};
  const invalid={id:'bad',title:'Fecha inválida',startAt:'garbage',status:'confirmada'};
  const future={id:'future',title:'Próxima real',startAt:new Date(Date.now()+7*24*3600_000).toISOString(),status:'confirmada'};
  const html=renderRc39Route(client('agenda',[],{rc39:{appointments:[past,invalid,future],sessionProjections:[]}}));
  const highlighted=html.match(/<section class="m30-agenda-client-next"[^>]*>[\s\S]*?<\/section>/)?.[0];
  assert.ok(highlighted);
  assert.match(highlighted,/Próxima real/);
  assert.doesNotMatch(highlighted,/Histórica|Fecha inválida/);
  assert.match(html,/Histórica/);
});
test('B32 Admin: all open incidents and guarded resolution controls stay accessible',()=>{
  const open=Array.from({length:11},(_,i)=>({open:true,priorityRank:i<2?0:2,
    priorityLabel:i<2?'Crítica':'Normal',ownerLabel:'Sin responsable',task:{id:'t'+i,title:'Incidencia '+i,
      status:'open',priority:i<2?'critical':'normal',revision:3}}));
  const html=renderAdminRoute({admin:true,kind:'admin-operaciones',canManage:true,
    operationTriage:{open,history:[],summary:{open:11,critical:2,overdue:0,unassigned:11,history:0}}});
  assert.match(html,/data-admin-operation-more/);
  for(let i=0;i<11;i++)assert.match(html,new RegExp('Incidencia '+i+'(?:<|\\b)'));
  assert.equal((html.match(/data-admin-form="task-resolve"/g)||[]).length,11);
  assert.ok(html.indexOf('Incidencia 0')<html.indexOf('data-admin-operation-more'));
});
