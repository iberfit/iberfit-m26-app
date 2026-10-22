import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createM26Transport,M26_QA_PROJECT_REF,M26_QA_SUPABASE_ORIGIN,
 M26_PRODUCTION_PROJECT_REF,M26_PRODUCTION_SUPABASE_ORIGIN,
} from '../src/m26/supabase-transport.js';

const CLIENT='10000000-0000-4000-8000-000000000001';
const ENTITY='20000000-0000-4000-8000-000000000001';
const EXEC='20000000-0000-4000-8000-000000000002';
const DATE='2026-10-21T12:00:00.000Z';
const TOKEN='synthetic-local-test-token';
const PAGE_SCHEMA='iberfit.u35.privileged-history-page.qa.v1';
const core=()=>({
 environment:'QA',user:{role:'coach',id:'qa-coach'},
 remoteRevisions:{['session:'+ENTITY]:1},
 data:{
   clients:[{id:CLIENT}],m26Entities:[],domainEvents:[],sessionExecutions:[],
   reports:[{safe:true}],checkins:[{safe:true}],
 },
});
function row(section){
 if(section==='m26Entities')return {
   entityType:'session',entityId:ENTITY,clientId:CLIENT,status:'published',
   revision:1,body:{title:'synthetic'},updatedAt:DATE,
 };
 if(section==='domainEvents')return {client_id:CLIENT,id:2,created_at:DATE};
 return {client_id:CLIENT,id:EXEC,updated_at:DATE};
}
function response(payload,status=200){
 return new Response(JSON.stringify(payload),{
   status,headers:{'content-type':'application/json; charset=utf-8'},
 });
}
function makeTransport(onRequest,{environment='QA'}={}){
 const calls=[];
 const isQA=environment==='QA';
 const transport=createM26Transport({
   enabled:true,qaOnly:isQA,
   projectRef:isQA?M26_QA_PROJECT_REF:M26_PRODUCTION_PROJECT_REF,
   url:isQA?M26_QA_SUPABASE_ORIGIN:M26_PRODUCTION_SUPABASE_ORIGIN,
   version:'SIGNATURE-U39-QA-SYNTHETIC',publishableKey:'synthetic-test-key',
   timeoutMs:8000,
 },{
   fetchImpl:async(url,options)=>{
     const pathname=new URL(url).pathname;
     const params=options.body?JSON.parse(options.body):{};
     calls.push({pathname,params,authorization:options.headers.authorization,
       method:options.method});
     return onRequest(pathname,params,calls.length);
   },
 });
 return {transport,calls};
}
function pageFor(section,records=[row(section)],rest={}){
 return {
   schema:PAGE_SCHEMA,section,snapshotAt:'2026-10-21T13:00:00.000Z',
   totalCount:records.length,hasMore:false,nextCursor:null,records,
   remoteRevisions:section==='m26Entities'
     ?{['session:'+ENTITY]:1}:{},
   ...rest,
 };
}
function happyFetch(path,params){
 if(path.endsWith('/iberfit_bootstrap_v26_core_u37_qa'))
   return response(core());
 if(path.endsWith('/iberfit_privileged_history_page_u38_qa'))
   return response(pageFor(params.p_section));
 throw new Error('U39_UNEXPECTED_ENDPOINT');
}
test('U39 loads all three histories atomically, never invokes legacy bootstrap and preserves other collections',async()=>{
 const {transport,calls}=makeTransport(happyFetch);
 const snapshot=await transport.bootstrapQaCoachWithHistory(TOKEN);
 assert.deepEqual(snapshot.data.checkins,[{safe:true}]);
 assert.deepEqual(snapshot.data.reports,[{safe:true}]);
 for(const section of ['m26Entities','domainEvents','sessionExecutions'])
   assert.equal(snapshot.data[section].length,1);
 assert.equal(snapshot.remoteRevisions['session:'+ENTITY],1);
 assert.equal(calls.length,4);
 assert.ok(calls.every(c=>c.authorization==='Bearer '+TOKEN&&c.method==='POST'));
 assert.ok(calls.every(c=>!c.pathname.endsWith('/iberfit_bootstrap_v26')));
});
test('U39 automatically halves only explicit byte-budget pages without retrying auth or unrelated HTTP500',async()=>{
 const {transport,calls}=makeTransport((path,params)=>{
   if(path.endsWith('/iberfit_bootstrap_v26_core_u37_qa'))return response(core());
   if(params.p_section==='m26Entities'&&params.p_limit>128)
     return response({code:'54000',message:'U38_PAGE_BODY_BUDGET_EXCEEDED'},500);
   return response(pageFor(params.p_section));
 });
 const result=await transport.bootstrapQaCoachWithHistory(TOKEN);
 assert.equal(result.data.m26Entities.length,1);
 assert.deepEqual(calls.filter(c=>c.params.p_section==='m26Entities').map(c=>c.params.p_limit),[256,128]);
 assert.equal(calls.filter(c=>c.params.p_section==='domainEvents')[0].params.p_limit,512);
 assert.equal(calls.filter(c=>c.params.p_section==='sessionExecutions')[0].params.p_limit,64);
 for(const status of [401,403,500]){
   const f=makeTransport(path=>{
     if(path.endsWith('/iberfit_bootstrap_v26_core_u37_qa'))return response(core());
     return response({code:'57014',message:'SQL server error'},status);
   });
   await assert.rejects(f.transport.bootstrapQaCoachWithHistory(TOKEN));
   assert.equal(f.calls.length<=4,true,'fail-closed without unbounded retries');
 }
});
test('U39 rejects malformed, unauthorized and foreign-client records with no output',async()=>{
 for(const problem of ['wrong-client','bad-cas','missing-pages']){
  const f=makeTransport((path,params)=>{
    if(path.endsWith('/iberfit_bootstrap_v26_core_u37_qa'))return response(core());
    if(problem==='missing-pages'&&params.p_section==='domainEvents')
      return response({code:'42501',message:'permission denied'},403);
    if(problem==='wrong-client'&&params.p_section==='domainEvents')
      return response(pageFor('domainEvents',[{...row('domainEvents'),client_id:EXEC}]));
    if(problem==='bad-cas'&&params.p_section==='m26Entities')
      return response(pageFor('m26Entities',[{...row('m26Entities'),revision:10}]));
    return response(pageFor(params.p_section));
  });
  await assert.rejects(f.transport.bootstrapQaCoachWithHistory(TOKEN));
 }
});
test('U39 rejects superseded authentication during requests before any store publication',async()=>{
 let calls=0;
 const f=makeTransport(happyFetch);
 await assert.rejects(f.transport.bootstrapQaCoachWithHistory(TOKEN,{
   assertOwner:()=>{if(++calls>1)throw new Error('M26_HYDRATION_STALE_SESSION');},
 }),/M26_HYDRATION_STALE_SESSION/);
 assert.equal(f.calls.length,1,'stale identity must not issue subsequent page reads');
});
test('U39 cannot start in production or receive a Client core as privileged',async()=>{
 const prod=makeTransport(()=>response(core()),{environment:'PROD'});
 await assert.rejects(prod.transport.bootstrapQaCoachWithHistory(TOKEN),/U39_QA_ONLY/);
 assert.equal(prod.calls.length,0);
 const bad=makeTransport((path,params)=>{
   if(path.endsWith('/iberfit_bootstrap_v26_core_u37_qa'))
     return response({...core(),user:{role:'client'}});
   return response(pageFor(params.p_section));
 });
 await assert.rejects(bad.transport.bootstrapQaCoachWithHistory(TOKEN),/U39_COACH_CORE_CONTEXT_INVALID/);
 assert.equal(bad.calls.length,1);
});
