import test from 'node:test';
import assert from 'node:assert/strict';
import {isAuthorizedQaAvatarRead} from '../qa/admin-webauthn-recurring/avatar-read-policy.js';
const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const ID='57f56a87-d04e-47d5-b1cc-8d4939d7c804';
const path='/storage/v1/object/authenticated/iberfit-profile-avatars/'+ID+'/avatar.webp';
const req=({method='GET',host=QA,url=path,headers={authorization:'Bearer '+('A'.repeat(45)),apikey:'sb_publishable_'+'B'.repeat(30)}}={})=>({method:()=>method,url:()=>host+url,headers:()=>headers});
test('Authenticated QA client avatar GET passes only with verified exact private path',()=>{
 assert.equal(isAuthorizedQaAvatarRead(req({url:path+'?cacheNonce=123'}),{origin:QA}),true);
 assert.equal(isAuthorizedQaAvatarRead(req(),{origin:QA}),true);
});
test('QA does not permit foreign host, write, non-avatar storage or missing auth',()=>{
 const cases=[
  req({method:'POST'}),req({method:'DELETE'}),req({method:'PUT'}),
  req({host:'https://pjhmrhejsoofmouedavw.supabase.co'}),
  req({host:'https://foreign.example'}),
  req({url:'/storage/v1/object/public/iberfit-profile-avatars/'+ID+'/avatar.webp'}),
  req({url:'/storage/v1/object/authenticated/iberfit-profile-avatars/'+ID+'/id.png'}),
  req({url:'/storage/v1/object/authenticated/iberfit-profile-avatars/../../secret/avatar.webp'}),
  req({url:path+'?download=1'}),
  req({headers:{apikey:'sb_publishable_'+'B'.repeat(30)}}),
  req({headers:{authorization:'Bearer '+('A'.repeat(45))}}),
 ];
 for(const r of cases)assert.equal(isAuthorizedQaAvatarRead(r,{origin:QA}),false,r.method()+' '+r.url());
});

test('Admin QA missing-avatar classification uses strict verified response, never masks arbitrary 400',async()=>{
 const {isQaMissingPrivateAvatarResponse,unexpectedQaResourceErrors}=await import('../qa/rc64/secure-current-source-auth.mjs');
 const req=()=>({url:()=>QA+path,method:()=> 'GET',headers:()=>({authorization:'Bearer '+('A'.repeat(45)),apikey:'sb_publishable_'+'B'.repeat(30)})});
 const response=(status,code,origin=QA)=>({
  status:()=>status,request:()=>({...req(),url:()=>origin+path}),
  json:async()=>({code,error:code==='Unauthorized'?'unauthorized':'not found'}),
 });
 assert.equal(await isQaMissingPrivateAvatarResponse(response(400,'NoSuchKey')),true);
 assert.equal(await isQaMissingPrivateAvatarResponse(response(404,'not_found')),true);
 assert.equal(await isQaMissingPrivateAvatarResponse(response(400,'Unauthorized')),false);
 assert.equal(await isQaMissingPrivateAvatarResponse(response(403,'NoSuchKey')),false);
 assert.equal(await isQaMissingPrivateAvatarResponse(response(400,'NoSuchKey','https://untrusted.example')),false);
 const errors=['Failed to load resource: the server responded with a status of 400 ()','Unknown security error'];
 assert.deepEqual(unexpectedQaResourceErrors(errors,1),['Unknown security error']);
 assert.deepEqual(unexpectedQaResourceErrors(errors,0),errors);
});
test('Admin real QA console requires RLS-verified missing-avatar result and fails closed otherwise',async()=>{
 const {readFileSync}=await import('node:fs');
 const s=readFileSync('qa/admin-webauthn-recurring/admin-webauthn-recurring.spec.mjs','utf8');
 assert.match(s,/isQaMissingPrivateAvatarResponse\(response\)/u);
 assert.match(s,/isAuthorizedQaAvatarRead\(response\.request\(\),\{origin:SUPABASE_ORIGIN\}\)/u);
 assert.match(s,/expect\(unexpectedAvatar,/u);
 assert.match(s,/unexpectedQaResourceErrors\(consoleErrors,missingAvatar\.length\)/u);
 assert.match(s,/await Promise\.all\(avatarChecks\)/u);
 assert.doesNotMatch(s,/consoleErrors\.filter\(/u);
});
