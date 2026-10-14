import test from 'node:test';
import assert from 'node:assert/strict';
import {isQaPrivateAvatarRead,SUPABASE_ORIGIN} from '../qa/rc64/secure-current-source-auth.mjs';
const avatar='/storage/v1/object/authenticated/iberfit-profile-avatars/10000000-0000-4000-8000-000000000271/avatar.webp';
const req=(url,{method='GET',bearer=true}={})=>({
 url:()=>url,method:()=>method,
 headers:()=>bearer?{authorization:'Bearer qa-synthetic-jwt'}:{},
});
test('M42 authenticated visual network perimeter admits only private avatar GET with exact nonce',()=>{
 assert.equal(isQaPrivateAvatarRead(req(SUPABASE_ORIGIN+avatar)),true);
 assert.equal(isQaPrivateAvatarRead(req(SUPABASE_ORIGIN+avatar+'?cacheNonce=1760000000000-1')),true);
 assert.equal(isQaPrivateAvatarRead(req(SUPABASE_ORIGIN+avatar+'?cacheNonce=1760000000000-99')),true);
});
test('M42 QA rejects arbitrary query, missing token, public URL, DELETE, foreign host',()=>{
 const cases=[
  req(SUPABASE_ORIGIN+avatar+'?cacheNonce=unsafe'),
  req(SUPABASE_ORIGIN+avatar+'?cacheNonce=1760000000000-1&admin=true'),
  req(SUPABASE_ORIGIN+avatar+'?cacheNonce=1760000000000-1&cacheNonce=1760000000000-2'),
  req(SUPABASE_ORIGIN+avatar+'?token=private'),
  req(SUPABASE_ORIGIN+avatar+'?download'),
  req(SUPABASE_ORIGIN+avatar+'#fragment'),
  req(SUPABASE_ORIGIN+avatar,{method:'DELETE'}),
  req(SUPABASE_ORIGIN+avatar,{method:'POST'}),
  req(SUPABASE_ORIGIN+avatar,{bearer:false}),
  req('https://evil.example'+avatar+'?cacheNonce=1760000000000-1'),
  req(SUPABASE_ORIGIN+avatar.replace('/authenticated/','/public/')),
  req(SUPABASE_ORIGIN+avatar.replace('avatar.webp','other.webp')),
 ];
 for(const item of cases)assert.equal(isQaPrivateAvatarRead(item),false,item.url());
});
