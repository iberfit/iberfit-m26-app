import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const sharedGroup='iberfit-qa-shared-auth-readonly';

const daily=read('.github/workflows/daily-use-visual-evidence.yml');
const device=read('.github/workflows/device-experience-gate.yml');
const remote=read('.github/workflows/remote-gates.yml');
const realWrite=read('.github/workflows/qa-real-write-cert.yml');
const adminWebauthn=read('.github/workflows/admin-webauthn-recurring.yml');
const coachWebauthn=read('.github/workflows/coach-webauthn-recurring.yml');

function jobBlock(source,start,next){
  const begin=source.indexOf(start);
  assert.notEqual(begin,-1,`missing job start: ${start}`);
  const end=next?source.indexOf(next,begin+start.length):-1;
  return source.slice(begin,end===-1?source.length:end);
}

test('shared authenticated QA jobs use one queued non-cancelling cross-workflow concurrency group',()=>{
  const dailyCapture=jobBlock(daily,'  capture:');
  const deviceAuth=jobBlock(device,'  client-coach-qa:','\n  admin-task-matrix:');
  const remotePreflight=jobBlock(remote,'  preflight:');
  const realWriteJob=jobBlock(realWrite,'  qa-real-write:');
  const adminLive=jobBlock(adminWebauthn,'  live-admin-webauthn:','\n  gate:');
  const coachLive=jobBlock(coachWebauthn,'  live-coach-webauthn:','\n  gate:');

  for(const [name,block] of [
    ['daily capture',dailyCapture],
    ['device authenticated matrix',deviceAuth],
    ['remote authenticated gate',remotePreflight],
    ['real-write certification',realWriteJob],
    ['admin WebAuthn live certification',adminLive],
    ['coach WebAuthn live certification',coachLive],
  ]){
    assert.match(block,new RegExp(`concurrency:\\s+group: ${sharedGroup}\\s+queue: max\\s+cancel-in-progress: false`,'u'),`${name} must serialize shared QA credentials`);
    assert.match(block,/environment: m26-canary-readonly/u,`${name} must remain on the authorized read-only QA environment`);
  }
});

test('synthetic and PWA device jobs are not unnecessarily serialized behind shared authenticated QA accounts',()=>{
  const admin=jobBlock(device,'  admin-task-matrix:','\n  pwa-upgrade:');
  const pwa=jobBlock(device,'  pwa-upgrade:','\n  gate:');
  assert.doesNotMatch(admin,new RegExp(sharedGroup,'u'));
  assert.doesNotMatch(pwa,new RegExp(sharedGroup,'u'));
});
