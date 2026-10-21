import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unexpectedCoachConsoleErrors} from '../qa/coach-webauthn-recurring/qa-verified-avatar-console.mjs';

const one='https://qa.example/storage/v1/object/authenticated/iberfit-profile-avatars/client-a/avatar.webp?cacheNonce=1792000000000-1';
const other='https://qa.example/rest/v1/rpc/private-query';
const missing={valid:true,url:one};
const resource=(url=one,text='Failed to load resource: the server responded with a status of 400 ()')=>({url,text});

test('U26 genuine optional private NoSuchKey never masks unrelated authenticated UI errors',()=>{
  assert.deepEqual(unexpectedCoachConsoleErrors([resource()],[missing]),[]);
  assert.deepEqual(unexpectedCoachConsoleErrors([resource(),resource(other)],[missing]),[resource(other)]);
  assert.deepEqual(unexpectedCoachConsoleErrors([resource(),resource()],[missing]),[resource()],
    'a single missing response must not excuse repeated errors');
  assert.deepEqual(unexpectedCoachConsoleErrors([{url:one,text:'TypeError: Cannot start session'}],[missing]),
    [{url:one,text:'TypeError: Cannot start session'}]);
  assert.deepEqual(unexpectedCoachConsoleErrors([resource(one,'Failed to load resource: the server responded with a status of 500 ()')],[missing]),
    [resource(one,'Failed to load resource: the server responded with a status of 500 ()')]);
  assert.deepEqual(unexpectedCoachConsoleErrors([resource(other)],[missing]),[resource(other)],
    'same HTTP code on a different URL is never excused');
});

test('U26 an unverified avatar error fails closed even if its URL matches',()=>{
  assert.throws(()=>unexpectedCoachConsoleErrors([resource()],[{valid:false,url:one}]),/U26_UNVERIFIED_AVATAR_RESPONSE/u);
  assert.throws(()=>unexpectedCoachConsoleErrors([resource()],[{valid:true,url:'javascript:alert(1)'}]),/U26_UNVERIFIED_AVATAR_RESPONSE/u);
});

test('U26 Coach E2E verifies server NoSuchKey and preserves blocked-request plus JS error checks',()=>{
  const source=readFileSync(new URL('../qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs',import.meta.url),'utf8');
  assert.match(source,/isQaPrivateAvatarRead\(response\.request\(\)\)/u);
  assert.match(source,/isQaMissingPrivateAvatarResponse\(response\)/u);
  assert.match(source,/unexpectedCoachConsoleErrors\(consoleErrors,confirmedMissing\)/u);
  assert.match(source,/expect\(evidence\.blocked/u);
  assert.match(source,/expect\(pageErrors/u);
  assert.doesNotMatch(source,/route\.fulfill\(\{status:200.*avatar/iu);
});
