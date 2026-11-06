import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appointmentForSession,sessionRowsById,sessionIdOf,legacyStartNeedsOccurrence} from '../src/m26/rc39/session-policy.js';
import {buildFollowUpClientScopeIndex} from '../src/m26/modules/client-followup-scope.js';
import {deriveAdherenceAlerts} from '../src/m26/engagement/adherence-engine.js';
import {computeProgressSummary} from '../src/m26/engagement/progress-engine.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';
const now=new Date('2026-11-06T12:00:00Z');
function fixture(n=48){
 const collections={clients:[{id:'a',name:'A',serviceKind:'training'},
 {id:'b',name:'B',serviceKind:'training'}],appointments:[],
 sessionExecutions:[],sessions:[],checkins:[],trainingCycles:[],
 iriAssessments:[],reports:[],clientProfiles:[],clientAccess:[],
 wearableDailySummaries:[],m26Entities:[],domainEvents:[]};
 for(let i=0;i<n;i++){
  const owner=i%2?'b':'a',id='s'+i;
  collections.sessions.push({id,clientId:owner,status:'disponible',visibility:'full',
   deliveryOwnership:'guided_in_app',deliveryModality:'guiada_en_app',
   blocks:[{exerciseId:'squat',sets:2}]});
  collections.appointments.push({id:'ap'+i,sessionId:id,clientId:owner,
   status:i%3?'propuesta':'confirmada',startAt:'2026-11-08T10:00:00Z'});
  collections.sessionExecutions.push({id:'ex'+i,sessionId:id,clientId:owner,
   status:'completed',completedAt:'2026-11-02T10:00:00Z'});
 }
 collections.appointments.push(
 {id:'ap-extra',sessionId:'s0',clientId:'a',status:'confirmada',startAt:'2026-11-12T10:00:00Z'},
 {id:'ap-wrong-owner',sessionId:'s0',clientId:'b',status:'confirmada',startAt:'2026-11-09T10:00:00Z'});
 return {identity:{id:'qa-coach',role:'coach'},activeArea:'hoy',selectedClientId:'a',
 collections,pendingOperations:[],conflicts:[],rejectedOperations:[]};
}
test('U360 date index is semantically identical under mixed owners and independent dates',()=>{
 const state=fixture(),all=state.collections.appointments;
 const byId=sessionRowsById(all);
 assert.equal(byId.get('s0').length,3);
 for(const session of state.collections.sessions){
  assert.deepEqual(appointmentForSession(byId.get(sessionIdOf(session))||[],session,now),
   appointmentForSession(all,session,now),session.id);
 }
 assert.equal(appointmentForSession(byId.get('s0'),state.collections.sessions[0],now).id,'ap0');
 const dates=[{id:'o1',sessionId:'s0',clientId:'a'},
  {id:'o2',sessionId:'s0',clientId:'b'}];
 const byOccurrence=sessionRowsById(dates,row=>row.sessionId);
 for(const session of state.collections.sessions){
  const args={sessionId:session.id,clientId:session.clientId};
  assert.equal(legacyStartNeedsOccurrence({...args,appointments:all,occurrences:dates}),
   legacyStartNeedsOccurrence({...args,
    appointments:byId.get(session.id)||[],occurrences:byOccurrence.get(session.id)||[]}),
   session.id);
 }
});
test('U360 Today keeps complete history, original alerts and Coach client context',()=>{
 const state=fixture();
 const scope=buildFollowUpClientScopeIndex(state,['a','b']);
 for(const id of ['a','b']){
  assert.deepEqual(computeProgressSummary(scope.get(id),id,{now,days:28}),
   computeProgressSummary(state,id,{now,days:28}));
  assert.deepEqual(deriveAdherenceAlerts(scope.get(id),id,{now}),
   deriveAdherenceAlerts(state,id,{now}));
 }
 const vm=createRouteViewModel({activeArea:'hoy',identity:{role:'coach'}},state,now);
 assert.equal(vm.kind,'hoy');
 assert.deepEqual(vm.clients.map(x=>x.id),['a','b']);
 assert.equal(vm.rc39.sessionProjections.length,24);
 assert.equal(state.collections.sessionExecutions.length,48);
 assert.equal(scope.get('a').collections.sessionExecutions.length,24);
});
test('U360 Today uses single index and canonical independent-date policy without network fetch',()=>{
 const route=readFileSync(new URL('../src/m26/modules/route-view-model.js',import.meta.url),'utf8');
 const vm=readFileSync(new URL('../src/m26/rc39/view-model.js',import.meta.url),'utf8');
 const today=route.slice(route.indexOf("if (area === 'hoy')"),route.indexOf("if (area === 'clientes')"));
 assert.match(route,/professionalOverview=\['clientes','hoy'\]/u);
 assert.match(today,/ownerState=\(id\)=>options\.clientScopeIndex\?\.get/u);
 assert.match(vm,/const appointmentsBySession=sessionRowsById/u);
 assert.match(vm,/const occurrencesBySession=sessionRowsById/u);
 assert.match(vm,/appointmentForSession\(appointmentsBySession\.get/u);
 assert.doesNotMatch(today,/\.rpc\(|fetch\(/u);
});