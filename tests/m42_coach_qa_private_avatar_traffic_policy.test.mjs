import test from 'node:test';
import assert from 'node:assert/strict';
import {isAuthorizedQaAvatarRead,isExpectedMissingQaAvatarResponse,isNativeMissingResourceConsoleMessage} from '../qa/coach-iri-document-privileged/qa-avatar-traffic-policy.mjs';

const qaOrigin='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const id='57f56a87-d04e-47d5-b1cc-8d4939d7c804';
const avatar=qaOrigin+'/storage/v1/object/authenticated/iberfit-profile-avatars/'+id+'/avatar.webp?cacheNonce=1792010000000-1';
const headers={authorization:'Bearer '+('a'.repeat(150)),apikey:'sb_publishable_QA_TEST_ONLY'};
const request=(url=avatar,method='GET',extra={})=>({
  url:()=>url,method:()=>method,headers:()=>({...headers,...extra}),
});

test('M42 QA: legitimate same-project authenticated avatar GET is explicitly allowed',()=>{
  assert.equal(isAuthorizedQaAvatarRead(request(),{qaOrigin}),true);
  assert.equal(isAuthorizedQaAvatarRead(request(avatar.split('?')[0]),{qaOrigin}),true);
});

test('M42 QA: never allow another tenant, path, object, tokenless read or mutation',()=>{
  const invalid=[
    [request(avatar.replace(qaOrigin,'https://pjhmrhejsoofmouedavw.supabase.co')),'wrong tenant'],
    [request(avatar,'POST'),'write operation'],
    [request(avatar.replace('iberfit-profile-avatars','iberfit-iri-issued-reports')),'wrong private bucket'],
    [request(avatar.replace('/avatar.webp','/other.webp')),'wrong object'],
    [request(avatar.replace(id,'../admin')),'traversal'],
    [request(avatar+'&token=secret'),'query token'],
    [request(avatar+'&cacheNonce=1792010000000-2'),'repeated nonce'],
    [request(avatar,'GET',{authorization:''}),'no JWT'],
    [request(avatar,'GET',{apikey:''}),'no publishable key'],
  ];
  for(const [req,caseName] of invalid)
    assert.equal(isAuthorizedQaAvatarRead(req,{qaOrigin}),false,caseName);
  assert.equal(isAuthorizedQaAvatarRead(request(),{}),false,'no implicit QA origin');
});

test('M42 QA: only authenticated avatar NoSuchKey 400 is an expected absent photo',()=>{
  assert.equal(isExpectedMissingQaAvatarResponse(request(),400,{code:'NoSuchKey'},{qaOrigin}),true);
  assert.equal(isExpectedMissingQaAvatarResponse(request(),400,{code:'Unauthorized'},{qaOrigin}),false);
  assert.equal(isExpectedMissingQaAvatarResponse(request(),403,{code:'NoSuchKey'},{qaOrigin}),false);
  assert.equal(isExpectedMissingQaAvatarResponse(request(avatar,'POST'),400,{code:'NoSuchKey'},{qaOrigin}),false);
  assert.equal(isExpectedMissingQaAvatarResponse(request(avatar,'GET',{authorization:''}),400,{code:'NoSuchKey'},{qaOrigin}),false);
  assert.equal(isExpectedMissingQaAvatarResponse(request(),400,null,{qaOrigin}),false);
  assert.equal(isNativeMissingResourceConsoleMessage('Failed to load resource: the server responded with a status of 400 ()'),true);
  assert.equal(isNativeMissingResourceConsoleMessage('Failed to load resource: the server responded with a status of 403 ()'),false);
  assert.equal(isNativeMissingResourceConsoleMessage('TypeError: fetch failed'),false);
});
