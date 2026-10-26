import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isQaPrivateAvatarRead,isQaMissingPrivateAvatarResponse,unexpectedQaResourceErrors} from '../qa/rc64/secure-current-source-auth.mjs';

const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const AVATAR=QA+'/storage/v1/object/authenticated/iberfit-profile-avatars/11111111-1111-4111-8111-111111111111/avatar.webp?cacheNonce=1782034421194-2';
const request=(url=AVATAR,method='GET',headers={authorization:'Bearer qa.synthetic.token'})=>({
  url:()=>url,method:()=>method,headers:()=>headers
});
const response=(code='NoSuchKey',error='not_found',status=400,req=request())=>({
  request:()=>req,status:()=>status,json:async()=>({code,error})
});

test('U26 only an authenticated, precise missing private avatar qualifies as optional absence',async()=>{
  assert.equal(isQaPrivateAvatarRead(request()),true);
  assert.equal(await isQaMissingPrivateAvatarResponse(response()),true);
  assert.equal(await isQaMissingPrivateAvatarResponse(response('NoSuchKey','not_found',404)),true);
  assert.equal(await isQaMissingPrivateAvatarResponse(response('InvalidJWT','unauthorized',400)),false);
  assert.equal(await isQaMissingPrivateAvatarResponse(response('AccessDenied','unauthorized',403)),false);
  assert.equal(await isQaMissingPrivateAvatarResponse(response('NoSuchKey','not_found',400,request(AVATAR,'POST'))),false);
  assert.equal(await isQaMissingPrivateAvatarResponse(response('NoSuchKey','not_found',400,request(AVATAR,'GET',{}))),false);
  assert.equal(await isQaMissingPrivateAvatarResponse(response('NoSuchKey','not_found',400,
    request(QA+'/storage/v1/object/authenticated/other-bucket/private.png'))),false);
});

test('U26 unmatched HTTP 400 console errors still fail, never blanket whitelist',()=>{
  const expected='Failed to load resource: the server responded with a status of 400 ()';
  const other='Failed to load resource: the server responded with a status of 403 ()';
  assert.deepEqual(unexpectedQaResourceErrors([expected,expected],2),[]);
  assert.deepEqual(unexpectedQaResourceErrors([expected,expected,expected],2),[expected]);
  assert.deepEqual(unexpectedQaResourceErrors([expected,other],1),[other]);
  assert.deepEqual(unexpectedQaResourceErrors([other,expected],1),[other]);
  assert.deepEqual(unexpectedQaResourceErrors([expected],0),[expected]);
});

test('U26 real Coach QA gate matches each unexpected 400 to a verified response, keeping policy and page assertions',()=>{
  const source=readFileSync(new URL('../qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs',import.meta.url),'utf8');
  assert.match(source,/isQaMissingPrivateAvatarResponse\(response\)/u);
  assert.match(source,/const errorResponses=await Promise\.all\(errorResponseChecks\)/u);
  assert.match(source,/expect\(errorResponses\.filter\(\(item\)=>!item\.knownMissing\)/u);
  assert.match(source,/unexpectedQaResourceErrors\(consoleErrors,absentAvatarCount\)/u);
  assert.match(source,/expect\(evidence\.blocked,'No business mutation or foreign request may be attempted'\)\.toEqual\(\[\]\)/u);
  assert.match(source,/expect\(pageErrors,'Authenticated Coach page must remain clean'\)\.toEqual\(\[\]\)/u);
  assert.doesNotMatch(source,/consoleErrors\.length\s*=\s*0|(?:^|\n)\s*consoleErrors\s*=\s*\[\]|evidence\.blocked\.length\s*=\s*0/u);
});
