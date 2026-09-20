import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../supabase/functions/iberfit-web-push-sender-v1/index.ts',import.meta.url),'utf8');

test('sender pins dependencies and requires authenticated allowed-origin requests',()=>{
  assert.match(source,/npm:@supabase\/supabase-js@2\.112\.4/);
  assert.match(source,/npm:web-push@3\.6\.7/);
  assert.match(source,/authorization\.startsWith\('Bearer '\)/);
  assert.match(source,/https:\/\/m26-canary\.iberfit\.cl/);
  assert.match(source,/https:\/\/app\.iberfit\.cl/);
  assert.match(source,/https:\/\/coach\.iberfit\.cl/);
  assert.match(source,/M26_ORIGIN_FORBIDDEN/);
});

test('public config exposes only the public VAPID key after server configuration is complete',()=>{
  assert.match(source,/requestBody\.action==='config'/);
  assert.match(source,/configured:true,publicKey:vapidPublicKey/);
  assert.doesNotMatch(source,/configured:true[^\n]*privateKey/);
  assert.match(source,/M26_PUSH_SERVICE_NOT_CONFIGURED/);
});

test('lock-screen payload is generic and contains no user or health content',()=>{
  assert.match(source,/JSON\.stringify\(\{tag:'iberfit-update',path:'\/'\}\)/);
  const sendBlock=source.slice(source.indexOf('webpush.sendNotification'),source.indexOf('const {error:finalizeError}'));
  for(const forbidden of ['clientName','recipient','message','body','weight','diagnosis','adherence','health','email']){
    assert.doesNotMatch(sendBlock,new RegExp(forbidden,'i'));
  }
});

test('sender limits concurrency, time and retry semantics',()=>{
  assert.match(source,/const CLAIM_LIMIT=25/);
  assert.match(source,/const SEND_CONCURRENCY=5/);
  assert.match(source,/TTL:300/);
  assert.match(source,/timeout:10_000/);
  assert.match(source,/status===404\|\|status===410/);
  assert.match(source,/status===408\|\|status===425\|\|status===429/);
  assert.match(source,/status&&status>=500/);
});

test('dispatch is receipt-authorized before service-role queue access',()=>{
  const authorize=source.indexOf("userClient.rpc('iberfit_web_push_dispatch_authorize_v1'");
  const claim=source.indexOf("service.rpc('iberfit_web_push_claim_v1'");
  assert.ok(authorize>0);
  assert.ok(claim>authorize);
  assert.match(source,/dispatch\?\.authorized!==true/);
});

test('sender does not log push endpoints, encryption keys or secrets',()=>{
  assert.doesNotMatch(source,/console\.(?:log|error|warn)/);
  assert.doesNotMatch(source,/JSON\.stringify\([^\n]*(?:endpoint|p256dh|privateKey)/);
});
