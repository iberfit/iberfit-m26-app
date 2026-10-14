import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AVATAR_REVALIDATE_MS} from '../src/m26/profile/client-avatar.js';
const src=readFileSync(new URL('../src/m26/profile/client-avatar.js',import.meta.url),'utf8');
test('M42 avatar eventually refreshes on other-device photo changes and revocations',()=>{
  assert.equal(AVATAR_REVALIDATE_MS,120000);
  assert.match(src,/if\(missingAtStorage\|\|\[401,403,404\]\.includes\(res\.status\)\)/u);
  assert.match(src,/detail\?\.code==='NoSuchKey'/u);
  assert.match(src,/evict\(clientId\);missing\.add\(clientId\)/u);
  assert.match(src,/const fresh=Date\.now\(\)-\(checkedAt\.get\(clientId\)\|\|0\)<AVATAR_REVALIDATE_MS/u);
  assert.doesNotMatch(src,/seen=new WeakSet/u);
});
