import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaInFlightReadGate} from '../src/m26/domain/qa-inflight-read-gate.js';
import {createM26Transport,M26_QA_PROJECT_REF,M26_QA_SUPABASE_ORIGIN,
  M26_PRODUCTION_PROJECT_REF,M26_PRODUCTION_SUPABASE_ORIGIN} from '../src/m26/supabase-transport.js';
import {createRc39Transport} from '../src/m26/rc39/transport.js';
import {createCommunicationTransport} from '../src/m26/communication/transport.js';
import {createAdminTransport} from '../src/m26/admin/transport.js';

const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
const qaRuntime={enabled:true,qaOnly:true,projectRef:M26_QA_PROJECT_REF,
  url:M26_QA_SUPABASE_ORIGIN,publishableKey:'synthetic-test-publishable-key',
  host:'m26-canary.iberfit.cl',version:'26.0',timeoutMs:3_000};
const prodRuntime={...qaRuntime,qaOnly:false,projectRef:M26_PRODUCTION_PROJECT_REF,
  url:M26_PRODUCTION_SUPABASE_ORIGIN,host:'app.iberfit.cl'};

test('never reuse settled responses, never share across JWTs or different argument scopes',async()=>{
 const gate=createQaInFlightReadGate({enabled:true});
 let count=0;const d=defer();
 const work=()=>{count++;return d.promise;};
 const a=gate.run({token:'client-A',name:'read',params:'{}',request:work});
 const b=gate.run({token:'client-A',name:'read',params:'{}',request:work});
 const c=gate.run({token:'client-B',name:'read',params:'{}',request:work});
 const e=gate.run({token:'client-A',name:'read',params:'{"role":"coach"}',request:work});
 await tick();assert.equal(count,3);assert.strictEqual(a,b);
 d.resolve({ready:true});
 await Promise.all([a,b,c,e]);
 const later=await gate.run({token:'client-A',name:'read',params:'{}',request:work});
 assert.deepEqual(later,{ready:true});assert.equal(count,4);
});
test('rejected read clears immediately and never caches authorization denial',async()=>{
 const gate=createQaInFlightReadGate({enabled:true}),d=defer();
 let count=0;const request=()=>{count++;return count===1?d.promise:Promise.resolve('fresh');};
 const a=gate.run({token:'A',name:'assurance',params:'{}',request});
 const b=gate.run({token:'A',name:'assurance',params:'{}',request});
 await tick();assert.equal(count,1);
 d.reject(Object.assign(new Error('Forbidden'),{status:403}));
 await assert.rejects(a,/Forbidden/);
 await assert.rejects(b,/Forbidden/);
 assert.equal(await gate.run({token:'A',name:'assurance',params:'{}',request}),'fresh');
 assert.equal(count,2);
});
test('disabled PROD gate and saturation never share responses',async()=>{
 let c=0;const request=()=>{c++;return Promise.resolve(c);};
 const prod=createQaInFlightReadGate({enabled:false});
 await Promise.all([prod.run({token:'A',name:'r',request}),prod.run({token:'A',name:'r',request})]);
 assert.equal(c,2);
 const qa=createQaInFlightReadGate({enabled:true,maxPending:1}),wait=defer();
 const a=qa.run({token:'A',name:'x',request:()=>wait.promise});
 const b=qa.run({token:'B',name:'y',request});
 assert.equal(await b,3);wait.resolve(1);await a;
});
test('main QA transport coalesces only same-JWT concurrent authenticated reads',async()=>{
 const waiting=defer(),calls=[];
 const fetchImpl=async (url,opts)=>{
   calls.push({path:new URL(url).pathname,token:opts.headers.authorization,method:opts.method});
   await waiting.promise;
   return json({ok:true,privileged:false,privilegedRole:null,mfaRequired:false,
     webauthnRequired:false,credentialEnrolled:false,iberfitAssurance:'not-required',
     supabaseAal:'aal1'});
 };
 const api=createM26Transport(qaRuntime,{fetchImpl});
 const reads=Array.from({length:6},()=>api.authAssuranceContext('jwt-A'));
 await tick();assert.equal(calls.length,1);
 waiting.resolve();await Promise.all(reads);
 await api.authAssuranceContext('jwt-A');assert.equal(calls.length,2);
 await Promise.all([api.authAssuranceContext('jwt-A'),api.authAssuranceContext('jwt-B')]);
 assert.equal(calls.length,4);
 assert.equal(calls.at(-1).token,'Bearer jwt-B');
});
test('read-only coalescence is disabled on PROD and never applies to mutations',async()=>{
 let requests=0;const fetchImpl=async()=>{requests++;return json([]);};
 const prod=createM26Transport(prodRuntime,{fetchImpl});
 await Promise.all([prod.commandRegistry('jwt-A'),prod.commandRegistry('jwt-A')]);
 assert.equal(requests,2);
 const qa=createM26Transport(qaRuntime,{fetchImpl});
 await Promise.all([qa.execute('jwt-A',{type:'TEST'}),qa.execute('jwt-A',{type:'TEST'})]);
 assert.equal(requests,4,'every attempted command must independently reach server');
});
test('RC39 same-user role/appointments coalesce; cross-user requests never share',async()=>{
 const d=defer(),calls=[];
 const api=createRc39Transport({runtime:qaRuntime,fetchImpl:async(url,opts)=>{
   calls.push({path:new URL(url).pathname,token:opts.headers.authorization});
   await d.promise;
   return json({ok:true,roles:['coach'],requests:[]});
 }});
 const a=api.extensions('jwt-A'),b=api.extensions('jwt-A'),c=api.extensions('jwt-B');
 await tick();assert.equal(calls.length,4,'two role+appointment requests for each owner');
 d.resolve();await Promise.all([a,b,c]);
 const fresh=await api.extensions('jwt-A');
 assert.deepEqual(fresh.authorizedRoles,['coach']);
 assert.equal(calls.length,6,'new event requires full fresh role check');
});
test('Communication coalesces same application/status, never a different role or write',async()=>{
 const d=defer(),calls=[];
 const api=createCommunicationTransport({runtime:qaRuntime,fetchImpl:async(url,opts)=>{
   const path=new URL(url).pathname;
   calls.push({path,body:opts.body});
   await d.promise;return json({ok:true,preferences:{}});
 }});
 const a=api.bootstrapOptional('jwt-A',{application:'client'});
 const b=api.bootstrapOptional('jwt-A',{application:'client'});
 const c=api.bootstrapOptional('jwt-A',{application:'coach'});
 await tick();assert.equal(calls.length,2);
 d.resolve();await Promise.all([a,b,c]);
 await api.notificationPreferencesStatus('jwt-A');
 await api.notificationPreferencesStatus('jwt-A');
 assert.equal(calls.length,4,'complete results are not cached');
});
test('Admin context is coalesced; readback must repeat after first settles',async()=>{
 const d=defer(),calls=[];
 const api=createAdminTransport({runtime:qaRuntime,fetchImpl:async(url,opts)=>{
   calls.push(new URL(url).pathname);await d.promise;return json({ok:true,roles:['admin']});
 }});
 const a=api.applicationContextOptional('jwt-A');
 const b=api.applicationContextOptional('jwt-A');
 await tick();assert.equal(calls.length,1);
 d.resolve();await Promise.all([a,b]);
 await api.applicationContextOptional('jwt-A');
 assert.equal(calls.length,2);
});
