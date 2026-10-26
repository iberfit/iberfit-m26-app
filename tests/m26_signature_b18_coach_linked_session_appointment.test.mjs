import test from 'node:test';
import assert from 'node:assert/strict';
import {linkableSessionsForCoachAgenda} from '../src/m26/modules/route-view-model.js';
import {renderAgendaRoute} from '../src/m26/modules/route-render.js';
const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
const S1='10000000-0000-4000-8000-000000000003';
const S2='10000000-0000-4000-8000-000000000004';
const S3='10000000-0000-4000-8000-000000000005';
const records=[
 {id:S1,clientId:A,status:'publicada',revision:1,
   body:{title:'Carrera suave',durationMinutes:36,deliveryModality:'guiada_en_app'}},
 {id:S2,clientId:B,status:'published',revision:1,
   body:{title:'Fuerza cliente B',durationMinutes:50,deliveryModality:'presencial'}},
 {id:S3,clientId:A,status:'draft',revision:1,body:{title:'No publicar'}},
];
const state=()=>({collections:{sessions:structuredClone(records)}});
test('B18 Coach selects only current public sessions for authorized clients',()=>{
 const items=linkableSessionsForCoachAgenda(state(),[A]);
 assert.deepEqual(items.map(x=>x.id),[S1]);
 assert.deepEqual(items[0],{id:S1,clientId:A,title:'Carrera suave',
   deliveryModality:'guiada_en_app',durationMinutes:36});
 assert.equal(linkableSessionsForCoachAgenda(state(),[]).length,0);
});
test('B18 stale publication is excluded when a newer withdrawal arrives',()=>{
 const s=state();s.collections.sessions.push({
   id:S1,clientId:A,status:'retirada',revision:2,body:{title:'Retirada'},
 });
 assert.deepEqual(linkableSessionsForCoachAgenda(s,[A]).map(x=>x.id),[]);
});
test('B18 Agenda links an existing session without showing another client as selected',()=>{
 const vm={role:'coach',appointments:[],clients:[
   {id:A,name:'Cliente A',profile:{modality:'Híbrido'}},
   {id:B,name:'Cliente B',profile:{modality:'Presencial'}},
 ],selectedClientId:A,linkableSessions:linkableSessionsForCoachAgenda(state(),[A,B])};
 const html=renderAgendaRoute(vm);
 assert.match(html,/<select name="sessionId" aria-describedby="m26-linked-session-help">/);
 assert.match(html,/data-client-id="10000000-0000-4000-8000-000000000001"/);
 assert.match(html,/data-session-duration="36"/);
 assert.match(html,/data-modality="guiada_en_app"/);
 assert.match(html,/Sin entrenamiento vinculado/);
 assert.match(html,/Fuerza cliente B<\/option>/);
 assert.match(html,/value="10000000-0000-4000-8000-000000000004"[^>]*disabled/);
 assert.match(html,/Crear propuesta de cita/);
});
test('B18 all labels escape catalog-controlled user text',()=>{
 const vm={role:'coach',appointments:[],clients:[{id:A,name:'Cliente A'}],
   selectedClientId:A,linkableSessions:[{id:S1,clientId:A,
     title:'Carrera <script>alert(1)</script>',deliveryModality:'guiada_en_app',
     durationMinutes:36}]};
 const html=renderAgendaRoute(vm);
 assert.ok(html.includes('Carrera &lt;script&gt;'));
 assert.equal(html.includes('<script>alert(1)</script>'),false);
});
