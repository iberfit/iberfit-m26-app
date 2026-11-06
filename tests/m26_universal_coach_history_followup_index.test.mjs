import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFollowUpClientScopeIndex,FOLLOWUP_SCOPE_COLLECTIONS} from '../src/m26/modules/client-followup-scope.js';
import {computeProgressSummary,buildPlanExecutionSummary} from '../src/m26/engagement/progress-engine.js';
import {deriveCoachHomeDecisionAlerts} from '../src/m26/experience/coach-cockpit.js';
import {buildRetentionHealth} from '../src/m26/engagement/retention-health.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';
import {augmentRc39ViewModel} from '../src/m26/rc39/view-model.js';

const now=new Date('2026-11-06T12:00:00.000Z');
function fixture(){
  const collections={clients:[{id:'alpha'},{id:'beta'},{id:'iri-only'}],
    appointments:[],sessionExecutions:[],checkins:[],iriAssessments:[],
    wearableDailySummaries:[],trainingCycles:[],sessions:[],reports:[]};
  for(let i=0;i<600;i++){
    collections.sessionExecutions.push({
      id:'exec-'+i,clientId:i%2?'beta':'alpha',
      status:'completed',completedAt:'2026-11-01T12:00:00Z',
      results:[{exerciseId:'ex-1',reps:8,loadKg:12,rpe:7}],
      historyMetadata:{notes:'verified'.repeat(180)},
    });
  }
  collections.appointments.push(
    {id:'a1',clientId:'alpha',status:'confirmed',startAt:'2026-11-01T12:00:00Z'},
    {id:'b1',clientId:'beta',status:'completed',startAt:'2026-11-02T12:00:00Z'},
    {id:'pending',clientId:'alpha',status:'propuesta',startAt:'2026-11-03T12:00:00Z'});
  collections.checkins.push({id:'c1',clientId:'alpha',date:'2026-11-04',energy:5,sleep:6});
  collections.sessionExecutions.push({id:'conflict',clientId:'alpha',
    body:{clientId:'beta',status:'completed',completedAt:'2026-11-03'}});
  collections.iriAssessments.push({id:'initial',clientId:'alpha',
    assessmentType:'inicial',status:'borrador'});
  return {identity:{id:'coach-a',role:'coach'},selectedClientId:'alpha',
    collections,pendingOperations:[],conflicts:[],rejectedOperations:[]};
}
test('UNIVERSAL: one bounded follow-up index does not truncate or mutate the Coach archive',()=>{
  const state=fixture();
  assert.deepEqual(FOLLOWUP_SCOPE_COLLECTIONS,[
    'appointments','sessionExecutions','sessions','checkins',
    'wearableDailySummaries','iriAssessments','trainingCycles',
    'clientProfiles','m26Entities','domainEvents']);
  const scopes=buildFollowUpClientScopeIndex(state,['alpha','beta','iri-only','alpha']);
  assert.equal(scopes.size,3);
  assert.equal(scopes.get('alpha').collections.sessionExecutions.length,301);
  assert.equal(scopes.get('beta').collections.sessionExecutions.length,301);
  assert.equal(scopes.get('iri-only').collections.sessionExecutions.length,0);
  assert.equal(state.collections.sessionExecutions.length,601);
  assert.equal(scopes.get('alpha').identity,state.identity);
  assert.ok(Object.isFrozen(scopes.get('alpha').collections.sessionExecutions));
});
test('UNIVERSAL: 7/28/90 progress and Coach alerts remain exactly equivalent with all archived history',()=>{
  for(const role of ['coach','admin']){
    const state=fixture();state.identity.role=role;
    const scopes=buildFollowUpClientScopeIndex(state,['alpha','beta','iri-only']);
    for(const owner of ['alpha','beta','iri-only']){
      for(const days of [7,28,90]){
        assert.deepEqual(
          computeProgressSummary(scopes.get(owner),owner,{now,days}),
          computeProgressSummary(state,owner,{now,days}),role+'/'+owner+'/'+days);
      }
      const summary=computeProgressSummary(state,owner,{now,days:28});
      assert.deepEqual(
        deriveCoachHomeDecisionAlerts(scopes.get(owner),owner,{now,summary}),
        deriveCoachHomeDecisionAlerts(state,owner,{now,summary}),
        role+'/'+owner+'/alerts');
    }
  }
});
test('UNIVERSAL: an initial IRI cannot silently count as longitudinal evolution',()=>{
  const state=fixture(),scope=buildFollowUpClientScopeIndex(state,['alpha']).get('alpha');
  const output=computeProgressSummary(scope,'alpha',{now,days:28});
  assert.deepEqual(output,computeProgressSummary(state,'alpha',{now,days:28}));
  assert.equal(output.iriDelta,null);
  assert.equal(output.iriBaseline?.available??false,false);
});
test('UNIVERSAL: Clients uses the scope index without new RPC, truncation or feature gate',()=>{
  const route=readFileSync(new URL('../src/m26/modules/route-view-model.js',import.meta.url),'utf8');
  const clients=route.slice(route.indexOf("if (area === 'clientes')"),route.indexOf("if (area === 'expediente')"));
  assert.match(clients,/buildFollowUpClientScopeIndex\(/u);
  assert.match(clients,/clientsOverview\(state,now\)/u);
  assert.match(clients,/buildClientFollowUpSummary\(/u);
  assert.doesNotMatch(clients,/fetch\(|\.rpc\(|truncate\(/u);
});

test('UNIVERSAL: indexed plans retain ownerless shared sessions and never mix other owners',()=>{
  const state=fixture();
  state.collections.sessions=[
    {id:'alpha-plan',clientId:'alpha',title:'Plan Alpha',blocks:[{exerciseId:'a',sets:3}]},
    {id:'beta-plan',clientId:'beta',title:'Plan Beta',blocks:[{exerciseId:'b',sets:2}]},
    {id:'shared-template',title:'Shared original template',blocks:[{exerciseId:'c',sets:4}]},
    {id:'contradicting-owner',clientId:'alpha',body:{clientId:'beta'},blocks:[]},
  ];
  const index=buildFollowUpClientScopeIndex(state,['alpha','beta','iri-only']);
  assert.deepEqual(index.get('alpha').collections.sessions.map(x=>x.id),
    ['alpha-plan','shared-template','contradicting-owner']);
  assert.deepEqual(index.get('beta').collections.sessions.map(x=>x.id),
    ['beta-plan','shared-template','contradicting-owner']);
  assert.deepEqual(index.get('iri-only').collections.sessions.map(x=>x.id),
    ['shared-template']);
  for(const owner of ['alpha','beta','iri-only']){
    for(const days of [7,28,90]){
      assert.deepEqual(
        buildPlanExecutionSummary(index.get(owner),owner,{now,days}),
        buildPlanExecutionSummary(state,owner,{now,days}),
        owner+'/'+days+' - plan/execution equality');
    }
  }
  assert.equal(state.collections.sessions.length,4,'original prescription data not mutated');
});

test('UNIVERSAL retention signals remain identical with 38-page Coach history and commercial activity',()=>{
  const state=fixture();
  state.collections.clientProfiles=[
    {id:'profile-a',clientId:'alpha',updatedAt:'2026-11-01T12:00:00Z',weeklyFrequency:2},
    {id:'profile-b',clientId:'beta',updatedAt:'2026-11-01T12:00:00Z'},
  ];
  state.collections.m26Entities=[
    {id:'renewal-a',clientId:'alpha',entityType:'commercial',body:{
      clientId:'alpha',renewalStatus:'upcoming',renewalDate:'2026-11-08'}},
    {id:'renewal-b',clientId:'beta',entityType:'commercial',body:{
      clientId:'beta',renewalStatus:'current'}},
    {id:'conflicting',clientId:'alpha',body:{clientId:'beta',entityType:'commercial'}},
  ];
  state.collections.domainEvents=[
    {id:'event-a',clientId:'alpha',eventName:'renovacion_confirmada',
      actorRole:'coach',occurredAt:'2026-11-04T10:00:00Z'},
    {id:'event-b',clientId:'beta',eventName:'renovacion_confirmada',
      actorRole:'admin',occurredAt:'2026-11-04T10:00:00Z'},
  ];
  const original=structuredClone(state);
  const index=buildFollowUpClientScopeIndex(state,['alpha','beta','iri-only']);
  for(const clientId of ['alpha','beta','iri-only']){
    assert.deepEqual(buildRetentionHealth(index.get(clientId),clientId,{now}),
      buildRetentionHealth(state,clientId,{now}),clientId+' retention parity');
  }
  assert.deepEqual(state,original,'owner archive was never mutated');
  assert.equal(index.get('alpha').collections.domainEvents.length,1);
  assert.equal(index.get('beta').collections.domainEvents.length,1);
  assert.equal(index.get('alpha').collections.m26Entities.length,2);
  assert.equal(index.get('beta').collections.m26Entities.length,2);
});

test('UNIVERSAL one single directory index feeds follow-up AND retention, no history re-scan per client',()=>{
  const state=fixture();state.identity.role='coach';
  const shell={identity:{role:'coach'},activeArea:'clientes'};
  const source=readFileSync(new URL('../src/m26/modules/route-view-model.js',import.meta.url),'utf8');
  const wrapper=source.slice(source.indexOf('export function createRouteViewModel('));
  assert.match(wrapper,/const clientScopeIndex=effectiveShellVm/u);
  assert.match(wrapper,/\{clientScopeIndex\}/u);
  const vm=readFileSync(new URL('../src/m26/rc39/view-model.js',import.meta.url),'utf8');
  assert.match(vm,/enrichClientRetention\(client,scopes\.get\(String\(client\?\.id/u);
  const result=createRouteViewModel(shell,state,now);
  assert.equal(result.kind,'clientes');
  assert.equal(result.clients.length,3);
  // Direct RC39 consumers must preserve both role and same history semantics.
  const direct=augmentRc39ViewModel({kind:'clientes',clients:result.clients},shell,state,now);
  assert.equal(direct.clients.length,3);
  for(const item of result.clients){
    const expected=buildRetentionHealth(state,item.id,{now});
    assert.deepEqual(item.retentionHealth,expected,item.id);
    assert.deepEqual(direct.clients.find(x=>x.id===item.id).retentionHealth,expected,item.id);
  }
});
