import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createM26Transport,M26_QA_PROJECT_REF,M26_PRODUCTION_PROJECT_REF} from '../src/m26/supabase-transport.js';
import {createDocumentCoachApi} from '../src/m26/wearables/document-coach-api.js';
const reportId='11111111-1111-4111-8111-111111111111',clientId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333';
const args={reportId,clientId,reportRevision:2,provider:'apple_health'};
const receipt={schema:'iberfit.connected360.document-coach-receipt.v1',requestId,...args,revision:0,decision:'pending'};
const qa={enabled:true,qaOnly:true,host:'m26-canary.iberfit.cl',canary:true,projectRef:M26_QA_PROJECT_REF,url:`https://${M26_QA_PROJECT_REF}.supabase.co`,publishableKey:'sb_publishable_QA_test_not_a_real_key'};
function fixture({runtime=qa,enabled=true,reply=receipt}={}){
 const calls=[];const transport=createM26Transport(runtime,{connected360DocumentCandidate:enabled,fetchImpl:async(url,init)=>{
  calls.push({path:new URL(url).pathname,body:JSON.parse(init.body),auth:init.headers.authorization,cache:init.cache});return {ok:true,status:200,headers:{get:k=>k==='content-type'?'application/json':null},json:async()=>reply};
 }});return {transport,calls};
}
test('Coach exact staged RPC does not submit client, identity, proof or decision',async()=>{
 const {transport,calls}=fixture();assert.deepEqual(await transport.connected360DocumentCandidateRequest('token',args),receipt);
 assert.deepEqual(calls,[{path:'/rest/v1/rpc/iberfit_gx_document_request_v1',body:{p_report:reportId,p_provider:'apple_health',p_expected_revision:2},auth:'Bearer token',cache:'no-store'}]);
});
test('production and disabled harness fail without network',async()=>{
 for(const f of [fixture({enabled:false}),fixture({runtime:{...qa,qaOnly:false,projectRef:M26_PRODUCTION_PROJECT_REF,url:`https://${M26_PRODUCTION_PROJECT_REF}.supabase.co`}})]){
  await assert.rejects(f.transport.connected360DocumentCandidateRequest('token',args),/QA_ONLY/);assert.equal(f.calls.length,0);
 }
});
test('substituted report, provider, client, revision or authorization claim rejected',async()=>{
 for(const reply of [{...receipt,reportId:requestId},{...receipt,clientId:requestId},{...receipt,provider:'health_connect'},{...receipt,reportRevision:3},{...receipt,decision:'accepted'},{...receipt,authorized:true}])await assert.rejects(fixture({reply}).transport.connected360DocumentCandidateRequest('token',args),/REVIEW_INVALID/);
});
test('an explicit retry can return historical withdrawal without reactivating it',async()=>{
 const withdrawn={...receipt,revision:2,decision:'withdrawn'};assert.deepEqual(await fixture({reply:withdrawn}).transport.connected360DocumentCandidateRequest('token',args),withdrawn);
});
test('malformed inputs and cancellation prevent requests',async()=>{
 const {transport,calls}=fixture();for(const a of [{...args,reportId:null},{...args,reportRevision:2147483648},{...args,provider:'other'}])await assert.rejects(transport.connected360DocumentCandidateRequest('token',a),/ARGUMENTS_INVALID/);
 const c=new AbortController();c.abort();await assert.rejects(transport.connected360DocumentCandidateRequest('token',args,{signal:c.signal}),/REQUEST_CANCELLED/);assert.equal(calls.length,0);
});
test('explicit confirmation and assurance before request; report switch blocks dispatch',async()=>{
 let scope={...args,role:'coach',actorId:'actor',lease:{}};let resolve,assured=0;const {transport,calls}=fixture();
 const api=createDocumentCoachApi({transport,getScope:()=>scope,getToken:async()=> 'token',ensureAssurance:()=>{assured++;return new Promise(r=>resolve=r);}});
 await assert.rejects(api.request({provider:'apple_health'}),/NOT_CONFIRMED/);assert.equal(assured,0);
 const pending=api.request({provider:'apple_health',confirmed:true});await Promise.resolve();scope={...scope,reportRevision:3};resolve();await assert.rejects(pending,/SCOPE_CHANGED/);assert.equal(calls.length,0);
});
test('valid explicit request and late receipt discarded on session switch',async()=>{
 let scope={...args,role:'coach',actorId:'actor',lease:{}};const {transport}=fixture();
 const api=createDocumentCoachApi({transport,getScope:()=>scope,getToken:async()=> 'token',ensureAssurance:async()=>{}});
 assert.deepEqual(await api.request({provider:'apple_health',confirmed:true}),receipt);
 let finish,entered;const ready=new Promise(r=>entered=r);let writes=0;
 const late=createDocumentCoachApi({transport:{...transport,connected360DocumentCandidateRequest:()=>{writes++;entered();return new Promise(r=>finish=r);}},getScope:()=>scope,getToken:async()=> 'token',ensureAssurance:async()=>{}});
 const pending=late.request({provider:'apple_health',confirmed:true});await ready;scope=null;finish(receipt);await assert.rejects(pending,/SCOPE_CHANGED/);assert.equal(writes,1);
});
test('Coach facade delegates existing authority and stays closed; rollback preserves ledger',()=>{
 const sql=readFileSync(new URL('../supabase/release-procedures/gx_connected360_document_coach_rpc_staged_v1.sql',import.meta.url),'utf8');
 assert.match(sql,/private\.gx_document_request_create_v1\(p_report,p_provider,p_expected_revision\)/);assert.match(sql,/coach_id=actor/);assert.match(sql,/m26_v49_live_session\(\) IS DISTINCT FROM true/);assert.match(sql,/role::text='admin'/);assert.match(sql,/FOR SHARE/);assert.match(sql,/ORDER BY revision DESC LIMIT 1/);assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/);assert.doesNotMatch(sql,/GRANT EXECUTE|INSERT INTO|UPDATE private|DELETE FROM/i);
 const rollback=readFileSync(new URL('../supabase/release-procedures/gx_connected360_document_coach_rpc_staged_v1.rollback.sql',import.meta.url),'utf8');assert.doesNotMatch(rollback,/DROP TABLE|DELETE FROM|CASCADE/i);
});

test('approval requires exact historical accepted receipt and explicit confirmation; no auto replay',async()=>{
 const scope={...args,role:'coach',actorId:'actor',lease:{}};const calls=[];
 const transport={connected360DocumentCandidateAvailable:()=>true,connected360DocumentCandidateRequest:async()=>({...receipt,decision:'accepted',revision:1}),connected360DocumentCandidateTransition:async(token,body)=>{calls.push(body);return {status:'aprobado'};}};
 const api=createDocumentCoachApi({transport,getScope:()=>scope,getToken:async()=> 'token',ensureAssurance:async()=>{},createOperationId:()=>requestId});
 await assert.rejects(api.transition({action:'approve',confirmed:true}),/NOT_CONFIRMED/);
 await api.request({provider:'apple_health',confirmed:true});
 await assert.rejects(api.transition({action:'approve'}),/NOT_CONFIRMED/);
 assert.deepEqual(await api.transition({action:'approve',confirmed:true}),{status:'aprobado'});
 assert.deepEqual(calls,[{reportId,requestId,operationId:requestId,reportRevision:2,action:'approve',previewConfirmed:false}]);
 await assert.rejects(api.transition({action:'approve',confirmed:true}),/NOT_CONFIRMED/);
});
test('publish uses only authoritative approved scope and explicit confirmation; scope change during assurance denies dispatch',async()=>{
 let scope={...args,role:'coach',actorId:'actor',lease:{},status:'aprobado',requestId};let resolve;const calls=[];
 const transport={connected360DocumentCandidateAvailable:()=>true,connected360DocumentCandidateTransition:async(token,body)=>{calls.push(body);return {status:'publicado'};}};
 const api=createDocumentCoachApi({transport,getScope:()=>scope,getToken:async()=> 'token',ensureAssurance:()=>new Promise(r=>resolve=r),createOperationId:()=>requestId});
 await assert.rejects(api.transition({action:'publish'}),/NOT_CONFIRMED/);
 const pending=api.transition({action:'publish',confirmed:true});await Promise.resolve();scope={...scope,requestId:reportId};resolve();await assert.rejects(pending,/SCOPE_CHANGED/);assert.equal(calls.length,0);
});
