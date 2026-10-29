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
