import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createM26Transport,M26_QA_PROJECT_REF,M26_PRODUCTION_PROJECT_REF} from '../src/m26/supabase-transport.js';
import {createDocumentConsentApi} from '../src/m26/wearables/document-consent-api.js';
const clientId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',operationId='33333333-3333-4333-8333-333333333333',sha='a'.repeat(64);
const token='synthetic-test-token';
const qa={enabled:true,qaOnly:true,host:'m26-canary.iberfit.cl',canary:true,projectRef:M26_QA_PROJECT_REF,url:'https://'+M26_QA_PROJECT_REF+'.supabase.co',publishableKey:'sb_publishable_QA_test_not_a_real_key'};
const prod={enabled:true,qaOnly:false,host:'app.iberfit.cl',projectRef:M26_PRODUCTION_PROJECT_REF,url:'https://'+M26_PRODUCTION_PROJECT_REF+'.supabase.co',publishableKey:'sb_publishable_PROD_test_not_a_real_key'};
const page={schema:'iberfit.connected360.document-inbox.v1',clientId,after:null,items:[],nextAfter:null};
const params={p_request:requestId,p_expected_revision:0,p_operation:operationId,p_decision:'declined',p_draft_sha:sha,p_evidence_sha:sha};
function fixture({runtime=qa,enabled=true,reply=page}={}){
 const calls=[];const transport=createM26Transport(runtime,{connected360DocumentCandidate:enabled,fetchImpl:async(url,init)=>{
  calls.push({path:new URL(url).pathname,body:JSON.parse(init.body),auth:init.headers.authorization,method:init.method,cache:init.cache});
  return {ok:true,status:200,headers:{get:k=>k==='content-type'?'application/json':null},json:async()=>reply};
 }});return {transport,calls};
}
test('exact authenticated QA inbox RPC; no client ID sent, no cache',async()=>{
 const {transport,calls}=fixture();assert.deepEqual(await transport.connected360DocumentCandidateInbox(token,clientId),page);
 assert.deepEqual(calls,[{path:'/rest/v1/rpc/iberfit_gx_document_inbox_v1',body:{p_after:null},auth:'Bearer '+token,method:'POST',cache:'no-store'}]);
});
test('default disabled and production blocked before network',async()=>{
 for(const config of [{enabled:false},{runtime:prod}]){const {transport,calls}=fixture(config);await assert.rejects(transport.connected360DocumentCandidateInbox(token,clientId),/QA_ONLY/);await assert.rejects(transport.connected360DocumentCandidateReview(token,clientId,requestId,false),/QA_ONLY/);await assert.rejects(transport.connected360DocumentCandidateDecide(token,params),/QA_ONLY/);assert.equal(calls.length,0);}
});
test('invalid request, token, decision, abort blocked before network',async()=>{
 const {transport,calls}=fixture();const c=new AbortController();c.abort();await assert.rejects(transport.connected360DocumentCandidateInbox(token,clientId,null,{signal:c.signal}),/REQUEST_CANCELLED/);
 await assert.rejects(transport.connected360DocumentCandidateInbox('',clientId),/AUTH_REQUIRED/);await assert.rejects(transport.connected360DocumentCandidateReview(token,clientId,requestId,'true'),/ARGUMENTS_INVALID/);
 for(const p of [{...params,p_extra:true},{...params,p_expected_revision:1},{...params,p_draft_sha:'bad'},{...params,p_operation:null}])await assert.rejects(transport.connected360DocumentCandidateDecide(token,p),/ARGUMENTS_INVALID/);assert.equal(calls.length,0);
});
test('foreign client, extra fields, malformed receipt rejected',async()=>{
 for(const reply of [{...page,clientId:requestId},{...page,privateData:true},[page]])await assert.rejects(fixture({reply}).transport.connected360DocumentCandidateInbox(token,clientId));
 const receipt={requestId,operationId,revision:1,decision:'declined',duplicate:false};const {transport,calls}=fixture({reply:receipt});assert.deepEqual(await transport.connected360DocumentCandidateDecide(token,params),receipt);assert.deepEqual(calls[0].body,params);
 await assert.rejects(fixture({reply:{...receipt,operationId:requestId}}).transport.connected360DocumentCandidateDecide(token,params));
});
test('adapter refuses changed scope during token refresh before dispatch',async()=>{
 let scope={ownerId:'owner',clientId,lease:{}};let resolve;let sent=0;const api=createDocumentConsentApi({getScope:()=>scope,getToken:()=>new Promise(r=>resolve=r),transport:{connected360DocumentCandidateAvailable:()=>true,connected360DocumentCandidateInbox:async()=>{sent++;return page;}}});
 const pending=api.inbox({after:null});scope={...scope,lease:{}};resolve(token);await assert.rejects(pending,/SESSION_CHANGED/);assert.equal(sent,0);
});
test('adapter discards late write receipt after logout; never retries',async()=>{
 let scope={ownerId:'owner',clientId,lease:{}};let resolve,entered;const ready=new Promise(r=>entered=r);let writes=0;
 const api=createDocumentConsentApi({getScope:()=>scope,getToken:async()=>token,transport:{connected360DocumentCandidateAvailable:()=>true,connected360DocumentCandidateDecide:()=>{writes++;entered();return new Promise(r=>resolve=r);}}});
 const pending=api.decide({params});await ready;scope=null;resolve({});await assert.rejects(pending,/SESSION_CHANGED/);assert.equal(writes,1);
});
test('adapter allows valid token rotation retaining exact lease and owner',async()=>{
 const scope={ownerId:'owner',clientId,lease:{}};const api=createDocumentConsentApi({getScope:()=>({...scope}),getToken:async()=>token,transport:fixture().transport});assert.equal(api.available(),true);assert.deepEqual(await api.inbox({after:null}),page);
});
test('staged SQL definer wrappers share strict role and session fence; no grants',()=>{
 const sql=readFileSync(new URL('../supabase/release-procedures/gx_connected360_document_rpc_staged_v1.sql',import.meta.url),'utf8');assert.equal((sql.match(/SECURITY DEFINER SET search_path TO ''/g)||[]).length,3);assert.equal((sql.match(/PERFORM private.gx_document_require_owner_v1\(\)/g)||[]).length,3);assert.match(sql,/m26_v49_live_session\(\) IS DISTINCT FROM true/);assert.match(sql,/p.user_id=actor AND p.client_id=client/);assert.match(sql,/p.role::text IN \('coach','admin'\)/);assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/);assert.doesNotMatch(sql,/GRANT EXECUTE|INSERT INTO|DELETE FROM|UPDATE private/i);
});
test('review RPC binds exact request, client and preview mode',async()=>{
 const r={schema:'iberfit.connected360.document-review.v1',requestId,reportId:operationId,reportRevision:1,clientId,provider:'apple_health',periodStart:'2026-11-21',periodEnd:'2026-11-27',draftSha256:sha,evidenceSha256:sha,revision:0,decision:'pending',preview:null};
 const {transport,calls}=fixture({reply:r});assert.deepEqual(await transport.connected360DocumentCandidateReview(token,clientId,requestId,false),r);assert.deepEqual(calls[0].body,{p_request:requestId,p_preview:false});
 await assert.rejects(transport.connected360DocumentCandidateReview(token,clientId,requestId,true),/REVIEW_INVALID/);await assert.rejects(transport.connected360DocumentCandidateReview(token,clientId,operationId,false),/REVIEW_INVALID/);
});
