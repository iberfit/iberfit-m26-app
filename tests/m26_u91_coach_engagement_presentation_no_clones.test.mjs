import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanonicalStore} from '../src/m26/canonical-store.js';
import {createProductionState} from '../src/m26/production-state.js';
import {createEngagementController} from '../src/m26/engagement/engagement-controller.js';

function coachStore(){
 const state=createProductionState();
 return createCanonicalStore({
  ...state,identity:{id:'verified-coach',role:'coach'},activeArea:'clientes',
  hydration:{status:'ready',error:null,refreshing:false},
  collections:{...state.collections,clients:[{id:'client-A'}],
   domainEvents:Array.from({length:1400},(_,i)=>({id:String(i),body:{detail:'x'.repeat(1400)}})),
   m26Entities:[{entityType:'renewal',clientId:'client-A',entityId:'renewal-A',revision:1,body:{status:'current'}}],
  },
 });
}
function harness(store){
 const root={
  addEventListener(){},removeEventListener(){},
  ownerDocument:{createElement:()=>({})},
  querySelectorAll:()=>[],querySelector:()=>null,
 };
 return createEngagementController({root,store,
  draftRepository:{save:async()=>{}},
  service:{capabilities:{actionOutcomeTracking:{ready:true}}},
 });
}
test('Coach presentation managers never clone full private history on repeated client navigation',()=>{
 const store=coachStore(),controller=harness(store);
 const original=globalThis.structuredClone;
 let fullClones=0;
 try{
  globalThis.structuredClone=value=>{
   if(value?.collections?.domainEvents?.length>1000)fullClones++;
   return original(value);
  };
  for(let i=0;i<5;i++){
   assert.equal(controller.ensureCommercialRenewalManagers(),true);
   assert.equal(controller.ensureActionOutcomeManagers(),true);
   if(i===2)store.navigateFast('hoy');
   if(i===3)store.navigateFast('clientes');
  }
  assert.equal(fullClones,0,'read-only Coach card enhancements never copy the entire archive');
  assert.equal(store.getState().collections.domainEvents.length,1400);
  assert.equal(fullClones,1,'explicit canonical snapshot remains defensive');
 }finally{globalThis.structuredClone=original;}
});
test('All state-changing engagement actions retain their private fresh context and server authority',()=>{
 const s=readFileSync(new URL('../src/m26/engagement/engagement-controller.js',import.meta.url),'utf8');
 assert.match(s,/function context\(\)\{const state=store\.getState\(\)/u);
 assert.match(s,/function presentationContext\(\)\{[\s\S]*getRenderSnapshot/u);
 assert.match(s,/function ensureCommercialRenewalManagers\(\)\{\s*const \{state,role\}=presentationContext\(\)/u);
 assert.match(s,/function ensureActionOutcomeManagers\(\)\{\s*const \{state,role\}=presentationContext\(\)/u);
 assert.match(s,/async function privateNote\(\)\{const \{clientId,role,state\}=context\(\)/u);
 assert.match(s,/function requireClient\(\)\{const \{clientId\}=context\(\)/u);
});

test('Coach real browser SLA is triggered by presentation manager edits on PR and Canary push',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/coach-webauthn-recurring.yml',import.meta.url),'utf8');
 const scopes=workflow.split('  push:');
 assert.equal(scopes.length,2,'PR and push events must remain separate');
 const trigger="'src/m26/engagement/engagement-controller.js'";
 assert.equal(scopes[0].split(trigger).length-1,1,'PR must trigger Coach SLA');
 assert.equal(scopes[1].split(trigger).length-1,1,'Canary push must trigger REAL Coach SLA');
 assert.ok(workflow.includes("if: github.event_name != 'pull_request'"));
 assert.ok(workflow.includes('coach-webauthn-real-qa'));
});
