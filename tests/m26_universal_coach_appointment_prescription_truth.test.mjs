import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNextSessionPreparation} from '../src/m26/intelligence/next-session-prep.js';
import {renderSessionsRoute} from '../src/m26/modules/route-render.js';

const owner='client-coach-qa';
const now=new Date('2026-11-12T12:00:00Z');
const local={id:'training-fitness',clientId:owner,status:'publicado',title:'Pierna intensidad alta',
  updatedAt:'2026-11-11T20:00:00Z'};
const linked={id:'training-linked',clientId:owner,status:'publicado',title:'Sesión acordada con el Coach',
  updatedAt:'2026-11-10T20:00:00Z'};
const appointment=(sessionId)=>({id:'appointment-real',clientId:owner,sessionId,status:'confirmada',
  startAt:'2026-11-13T14:00:00Z',endAt:'2026-11-13T15:00:00Z'});
const state=(sessions,sessionId)=>({collections:{
 clients:[{id:owner,name:'Cliente sintético'}],
 appointments:[appointment(sessionId)],sessions,sessionExecutions:[],
 m26Entities:[],iriAssessments:[],checkins:[],trainingCycles:[],
}});

test('Coach never sees another published prescription as the linked confirmed appointment',()=>{
 const data=state([local],'training-missing');
 const prep=buildNextSessionPreparation(data,owner,{now});
 assert.equal(prep.appointment.id,'appointment-real');
 assert.equal(prep.session.id,null);
 assert.equal(prep.session.title,null);
 assert.equal(prep.session.source,'appointment-mismatch');
 assert.equal(prep.session.startable,false);
 assert.ok(prep.reviewRequired);
 assert.ok(prep.reviewReasons.some(r=>r.kind==='appointment-session-mismatch'));
 assert.equal(prep.safety.coachConfirmationRequired,true);
 const html=renderSessionsRoute({role:'coach',nextSessionPreparation:prep,sessions:data.collections.sessions,
   actor:{role:'coach'},selectedClientId:owner});
 assert.doesNotMatch(html,/Próxima sesión<\/span>\s*<strong>Pierna intensidad alta/u);
 assert.match(html,/Revisa la vinculación antes de iniciar/u);
});

test('Cross-client linked prescriptions do not leak into coach preparation or fall back to another client plan',()=>{
 const foreign={id:'training-foreign',clientId:'other-client',status:'publicado',title:'Privado ajeno'};
 const prep=buildNextSessionPreparation(state([local,foreign],'training-foreign'),owner,{now});
 assert.equal(prep.session.id,null);
 assert.equal(prep.session.title,null);
 assert.equal(prep.session.startable,false);
 assert.equal(prep.session.source,'appointment-mismatch');
});

test('Exact linked plan takes precedence over newer unrelated plan; unlinked appointment keeps existing fallback',()=>{
 const attached=buildNextSessionPreparation(state([local,linked],linked.id),owner,{now});
 assert.equal(attached.session.id,linked.id);
 assert.equal(attached.session.title,linked.title);
 assert.equal(attached.session.source,'appointment');
 assert.equal(attached.session.startable,true);
 const unlinked=buildNextSessionPreparation(state([local,linked],null),owner,{now});
 assert.equal(unlinked.session.id,local.id);
 assert.equal(unlinked.session.source,'published');
});
