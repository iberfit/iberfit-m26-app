import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const pushPaths=path=>{
  const push=workflow(path).split(/^  push:\s*$/m)[1]?.split(/^  workflow_dispatch:\s*$/m)[0];
  assert.ok(push,path+' missing protected push trigger');
  assert.match(push,/branches:[\s\S]*canary\/rc74-4/,path+' not protected Canary');
  return [...push.matchAll(/      - '([^']+)'/g)].map(match=>match[1]);
};

test('release M44 marker recertifies exact Coach, Admin and Remote without broadening Free QA paths',()=>{
  const marker='.github/workflows/m44-encrypted-disaster-recovery.yml';
  for(const file of ['.github/workflows/coach-webauthn-recurring.yml',
    '.github/workflows/admin-webauthn-recurring.yml',
    '.github/workflows/remote-gates.yml',
    '.github/workflows/m44-encrypted-disaster-recovery.yml']){
    const paths=pushPaths(file);
    assert.ok(paths.includes(marker),file+' must rerun on M44 release marker');
    assert.equal(new Set(paths).size,paths.length,file+' has duplicate trigger path');
  }
  const remote=pushPaths('.github/workflows/remote-gates.yml');
  for(const tooBroad of ['src/**','src/m26/**','src/m26/workflows/**',
    'src/m26/ui/**','src/m26/wearables/**','public/**']){
    assert.ok(!remote.includes(tooBroad),'remote Free QA scoping regressed: '+tooBroad);
  }
});

test('exact-source release still demands all seven authenticated QA gates',()=>{
  const gate=readFileSync(new URL('../scripts/release/verify_source_qa_gates.mjs',import.meta.url),'utf8');
  for(const name of ['IBERFIT M26 CI','IBERFIT Canary Exact Deploy',
    'IBERFIT Coach WebAuthn Recurring','IBERFIT Admin WebAuthn Recurring',
    'IBERFIT Device Experience Gate','IBERFIT M26 Gates remotos de solo lectura',
    'IBERFIT M26 Continuous App Audit']){
    assert.ok(gate.includes("'"+name+"'"),'source release lost required gate '+name);
  }
});
