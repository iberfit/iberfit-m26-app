
import test from 'node:test';
import assert from 'node:assert/strict';
import {prioritizeClientSessionItems} from '../src/m26/rc39/client-session-priority.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
const mk=(id,at,ready=true,supervised=false)=>({
 id,title:'Sesión '+id,visible:true,visibility:supervised?'summary_only':'full',
 ownership:supervised?'coach_led':'guided_in_app',modality:supervised?'presencial':'guiada_en_app',
 canClientExecute:ready&&!supervised,canClientStart:ready&&!supervised,
 session:{id,status:ready?'disponible':'publicado',publishedAt:at,
 deliveryModality:supervised?'presencial':'guiada_en_app',
 deliveryOwnership:supervised?'coach_led':'guided_in_app',
 clientVisibilityLevel:supervised?'summary_only':'full',
 blocks:[{exerciseId:'remo',name:'Remo',sets:1,reps:8}]}
});
const render=(kind,records,active=true)=>renderRc39Route({
 kind,role:'client',serviceActive:active,selectedClient:{modality:'hibrido'},
 rc39:{planningItems:records,sessionProjections:records,appointments:[]},clientAppointments:[]
});
test('U48 newest authorized running is visible before session archive, without dropping old sessions',()=>{
 const items=Array.from({length:8},(_,i)=>mk('s'+i,'2026-09-01T10:00:00Z'));
 items.push(mk('running','2026-10-28T17:50:00Z'));
 const ordered=prioritizeClientSessionItems(items,x=>x.canClientExecute);
 assert.equal(ordered[0].id,'running');assert.equal(items[0].id,'s0');
 const html=render('sesion',items),at=id=>html.indexOf('data-rc39-session="'+id+'"');
 assert.ok(at('running')>=0&&at('running')<html.indexOf('data-signature-session-archive'));
 assert.ok(at('running')<at('s0'));
 assert.match(html,/data-session-available-count="9"/);
 for(let i=0;i<8;i++)assert.ok(at('s'+i)>=0);
});
test('U48 Client has one ready CTA outside the optional exercise disclosure',()=>{
 const html=render('sesion',[mk('running','2026-10-28T17:50:00Z')]);
 const start=html.indexOf('data-workflow-action="start-published-session"');
 const preview=html.indexOf('m26-session-preview-disclosure');
 const close=html.indexOf('</details>',preview);
 assert.equal((html.match(/data-workflow-action="start-published-session"/g)||[]).length,1);
 assert.ok(start>close);assert.match(html,/Preparar entrenamiento/);
});
test('U48 never offers autonomous start for paused, supervised or non-ready sessions',()=>{
 for(const [item,active] of [
   [mk('supervised','2026-10-28T17:00:00Z',false,true),true],
   [mk('unpublished','2026-10-28T17:00:00Z',false),true],
   [mk('paused','2026-10-28T17:00:00Z'),false]
 ])assert.doesNotMatch(render('sesion',[item],active),/data-workflow-action="start-published-session"/);
});
test('U48 Planning and Sessions prioritize same last published authorized workout',()=>{
 const items=[mk('old','2026-09-01T10:00:00Z'),mk('running','2026-10-28T17:50:00Z')];
 for(const kind of ['planificacion','sesion']){
  const html=render(kind,items);
  assert.ok(html.indexOf('data-rc39-session="running"')<html.indexOf('data-rc39-session="old"'));
 }
});
