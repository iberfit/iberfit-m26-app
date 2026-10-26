import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {linkableSessionsForCoachAgenda,resolveCoachAppointmentSessionLink,santiagoAppointmentInstant}
  from '../src/m26/workflows/agenda-workflow.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise,updateSessionBlock}
  from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';
import {appointmentEndFromDuration} from '../src/m26/app/workflow-controller.js';
const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
const S='10000000-0000-4000-8000-000000000003';
const state=()=>({collections:{sessions:[
  {id:S,clientId:A,status:'publicada',revision:1,
    body:{title:'Carrera suave',durationMinutes:36,deliveryModality:'guiada_en_app'}},
  {id:'other',clientId:B,status:'publicada',revision:1,body:{title:'Fuera de alcance'}},
]}});

test('B19 real RC39 Agenda exposes the published session selector to the Coach',()=>{
 const linked=linkableSessionsForCoachAgenda(state(),[A,B]);
 const vm={kind:'agenda',role:'coach',
   clients:[{id:A,name:'Juan Carlos',profile:{modality:'hibrido',sessionDurationMinutes:45}},
            {id:B,name:'Otro',profile:{}}],
   selectedClientId:A,linkableSessions:linked,
   rc39:{role:'coach',appointments:[],sessionProjections:[]}};
 const html=renderRc39Route(vm);
 assert.match(html,/id="m26-agenda-proposal-form"/);
 assert.match(html,/name="sessionId"/);
 assert.match(html,/data-session-duration="36"/);
 assert.match(html,/data-modality="guiada_en_app"/);
 assert.match(html,/value="other"[^>]*disabled/);
 assert.match(html,/data-session-duration="45"/);
 assert.match(html,/America\/Santiago/);
 assert.match(html,/Etapas de la programación/);
 assert.match(html,/data-workflow-action="create-appointment"/);
});
test('B19 one eligible server-linked session, never another client, withdrawn or unapproved',()=>{
 const s=state();
 assert.equal(resolveCoachAppointmentSessionLink(s,{clientId:A,sessionId:S}).id,S);
 assert.equal(resolveCoachAppointmentSessionLink(s,{clientId:A,sessionId:''}),null);
 assert.throws(()=>resolveCoachAppointmentSessionLink(s,{clientId:B,sessionId:S}),
   /M26_APPOINTMENT_LINKED_SESSION_NOT_AVAILABLE/);
 s.collections.sessions.push({id:S,clientId:A,status:'retirada',revision:2});
 assert.throws(()=>resolveCoachAppointmentSessionLink(s,{clientId:A,sessionId:S}),
   /M26_APPOINTMENT_LINKED_SESSION_NOT_AVAILABLE/);
});
test('B19 Chile appointment time ignores machine timezone and rejects calendar drift',()=>{
 assert.equal(santiagoAppointmentInstant('2026-10-28T09:00'),'2026-10-28T12:00:00.000Z');
 assert.equal(santiagoAppointmentInstant('2026-07-28T09:00'),'2026-07-28T13:00:00.000Z');
 assert.equal(appointmentEndFromDuration('2026-10-28T09:00',36),'2026-10-28T09:36');
 assert.throws(()=>santiagoAppointmentInstant('2026-02-30T09:00'),
   /M26_APPOINTMENT_DATE_INVALID/);
 assert.throws(()=>santiagoAppointmentInstant('2026-10-28T25:00'),
   /M26_APPOINTMENT_DATE_INVALID/);
});
test('B19 Coach write boundary verifies link before CITA_CREAR, no silent omission',()=>{
 const source=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
 assert.match(source,/resolveCoachAppointmentSessionLink\(context\(\)\.state,\{clientId,sessionId:selectedId\}\)/);
 assert.match(source,/draft\.sessionId=linked\.id/);
 assert.match(source,/persistedSession/);
 assert.match(source,/santiagoAppointmentInstant\(raw\.startAt\)/);
 assert.match(source,/sessionField=form\.elements\?\.namedItem\?\.\('sessionId'\)/);
});
test('B19 running pace is prominent and its decimal duration accepts 35.75 minutes',()=>{
 const catalog=createExerciseCatalog([{id:'run',name_es:'Carrera suave',pattern:'locomoción',equipment:'sin equipo'}]);
 const draft=createSessionDraft({clientId:A});
 addCatalogExercise(draft,'run',catalog);
 const id=draft.blocks[0].id;
 updateSessionBlock(draft,{blockId:id,field:'plannedDistanceKm',value:'6.5',catalog});
 updateSessionBlock(draft,{blockId:id,field:'plannedDurationMinutes',value:'35.75',catalog});
 updateSessionBlock(draft,{blockId:id,field:'plannedPace',value:'05:30',catalog});
 const html=renderSessionBuilder({draft,catalog,role:'coach'});
 const i=html.indexOf('m26-builder-core-prescription');
 const j=html.indexOf('m26-builder-prescription-details',i);
 assert.ok(i>=0&&j>i);
 assert.match(html.slice(i,j),/data-session-block-field="plannedPace"/);
 assert.match(html.slice(i,j),/data-session-block-field="plannedDurationMinutes"[^>]*step="0.01"/);
 assert.equal((html.match(/data-session-block-field="plannedPace"/g)||[]).length,1);
});
