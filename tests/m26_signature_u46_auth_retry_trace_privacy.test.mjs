import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createM26Transport,M26_QA_PROJECT_REF,M26_QA_SUPABASE_ORIGIN} from '../src/m26/supabase-transport.js';

const runtime=Object.freeze({
 enabled:true,qaOnly:true,projectRef:M26_QA_PROJECT_REF,
 url:M26_QA_SUPABASE_ORIGIN,publishableKey:'qa-public-key-test-only',
 timeoutMs:12_000,version:'qa-auth-contract'
});
function validResponse(){
 return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({
   access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',
   expires_at:1920000000,user:{id:'synthetic-client-b',email:'qa.rc74.client-b@iberfit.cl'}
 })};
}
test('U46 timeout abort gets one bounded password exchange retry and authenticates only a valid response',async()=>{
 const seen=[],delays=[];
 const transport=createM26Transport(runtime,{
   fetchImpl:async(_url,options)=>{
     seen.push({method:options.method,credentials:options.credentials,signal:options.signal});
     if(seen.length===1)throw new DOMException('simulated abort','AbortError');
     return validResponse();
   },
   authRetryDelay:async ms=>{delays.push(ms);}
 });
 const result=await transport.login('qa.rc74.client-b@iberfit.cl','synthetic-secret-pass');
 assert.equal(result.user.id,'synthetic-client-b');
 assert.equal(seen.length,2);
 assert.equal(delays.length,1);
 assert.equal(delays[0],220);
 assert.ok(seen.every(item=>item.method==='POST'&&item.credentials==='omit'&&item.signal));
});
test('U46 authorization denials never retry a password, even if the caller asks again',async()=>{
 let calls=0;
 const transport=createM26Transport(runtime,{fetchImpl:async()=>{
   calls++;
   return {ok:false,status:401,headers:{get:()=> 'application/json'},
     json:async()=>({message:'Invalid login credentials'})};
 },authRetryDelay:async()=>{throw Error('UNSAFE_RETRY');}});
 await assert.rejects(()=>transport.login('qa.rc74.client-b@iberfit.cl','synthetic-secret-pass'),/Invalid login credentials/);
 assert.equal(calls,1);
});
test('U46 two aborted password transports stop without unbounded attempts or false identity',async()=>{
 let calls=0;
 const transport=createM26Transport(runtime,{
   fetchImpl:async()=>{calls++;throw new DOMException('synthetic abort','AbortError');},
   authRetryDelay:async()=>{}
 });
 await assert.rejects(()=>transport.login('qa.rc74.client-b@iberfit.cl','synthetic-secret-pass'),/M26_TIMEOUT/);
 assert.equal(calls,2);
});
test('U46 privileged QA browser artifacts never retain plaintext password form traces',()=>{
 for(const path of [
  'playwright.admin-webauthn-recurring.config.mjs',
  'playwright.authenticated-interaction.config.mjs',
  'playwright.m43-interactive-client.config.mjs',
  'playwright.m43-authenticated-browser.config.mjs',
  'playwright.coach-webauthn-recurring.config.mjs',
  'playwright.coach-iri-document-privileged.config.mjs',
  'playwright.device-experience.config.mjs'
 ]){
   const content=readFileSync(new URL('../'+path,import.meta.url),'utf8');
   assert.match(content,/trace:\s*'off'/u,path+' must disable raw trace capture');
   assert.doesNotMatch(content,/trace:\s*'retain-on-failure'/u);
 }
});
