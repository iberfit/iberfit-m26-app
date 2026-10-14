import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isQaPrivateAvatarRead,unexpectedQaResourceErrors} from '../qa/rc64/secure-current-source-auth.mjs';
const id='10000000-0000-4000-8000-000000000271';
const root='https://gjztkdwfmunnzhtvxrsu.supabase.co/storage/v1/object/';
const target=root+'authenticated/iberfit-profile-avatars/'+id+'/avatar.webp';
const req=(url,method='GET',token='Bearer synthetic.jwt.token')=>({url:()=>url,method:()=>method,headers:()=>({authorization:token})});
test('M42 read-only test policy permits ONLY JWT-authenticated private QA avatar GET',()=>{
 assert.equal(isQaPrivateAvatarRead(req(target)),true);
 for(const m of ['POST','PUT','DELETE','PATCH','HEAD'])assert.equal(isQaPrivateAvatarRead(req(target,m)),false);
 for(const u of [
 root+'public/iberfit-profile-avatars/'+id+'/avatar.webp',
 root+'authenticated/other-bucket/'+id+'/avatar.webp',
 target+'?download=true',
 'https://pjhmrhejsoofmouedavw.supabase.co/storage/v1/object/authenticated/iberfit-profile-avatars/'+id+'/avatar.webp',
 root+'authenticated/iberfit-profile-avatars/'+id+'/iri-private.webp',
 root+'authenticated/iberfit-profile-avatars/../../other-client/avatar.webp',
 ])assert.equal(isQaPrivateAvatarRead(req(u)),false,u);
 assert.equal(isQaPrivateAvatarRead(req(target,'GET','')),false);
 assert.equal(isQaPrivateAvatarRead(req(target,'GET','Basic unsafe')),false);
});
test('M42 only a bounded missing avatar response can explain a generic Chromium resource error',()=>{
 const msg='Failed to load resource: the server responded with a status of 400 ()';
 assert.deepEqual(unexpectedQaResourceErrors([msg],1),[]);
 assert.deepEqual(unexpectedQaResourceErrors([msg,msg],1),[msg]);
 assert.deepEqual(unexpectedQaResourceErrors([msg],0),[msg]);
 assert.deepEqual(unexpectedQaResourceErrors(['Failed to load resource: net::ERR_BLOCKED_BY_CLIENT'],1),['Failed to load resource: net::ERR_BLOCKED_BY_CLIENT']);
});
test('M42 client UI uses Storage DELETE rather than upload-to-remove pseudo-path',()=>{
 const src=readFileSync(new URL('../src/m26/profile/client-avatar.js',import.meta.url),'utf8');
 const gate=readFileSync(new URL('../scripts/remote-gates/run_qa_m42_avatar_private_gate.mjs',import.meta.url),'utf8');
 assert.match(src,/fetchImpl\(resource\(AVATAR_BUCKET\),\{\s*method:'DELETE'/u);
 assert.doesNotMatch(src,/resource\('remove\/'\+AVATAR_BUCKET\)/u);
 assert.match(gate,/const remove=\(\)=>'\/storage\/v1\/object\/'\+AVATAR_BUCKET/u);
 assert.match(gate,/method:'DELETE',token:a,json:\{prefixes:/u);
 assert.match(gate,/before\.bytes\.equals\(picture\)/u);
});
