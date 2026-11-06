import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFollowUpClientScopeIndex,FOLLOWUP_SCOPE_COLLECTIONS} from '../src/m26/modules/client-followup-scope.js';
import {computeProgressSummary} from '../src/m26/engagement/progress-engine.js';
import {deriveCoachHomeDecisionAlerts} from '../src/m26/experience/coach-cockpit.js';

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
    'appointments','sessionExecutions','checkins',
    'wearableDailySummaries','iriAssessments','trainingCycles']);
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
