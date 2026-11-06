import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const pushPaths=(content)=>{
  const match=content.match(/\n  push:\n([\s\S]*?)(?=\n  workflow_dispatch:|\npermissions:)/u);
  assert.ok(match,'protected push workflow must be declared');
  return match[1];
};
test('UNIVERSAL final production gates always run against changes to actual Coach/Admin navigation QA',()=>{
  const source='qa/signature-u26-authenticated-professional-routes.mjs';
  for(const path of [
    '.github/workflows/coach-webauthn-recurring.yml',
    '.github/workflows/admin-webauthn-recurring.yml',
    '.github/workflows/remote-gates.yml',
  ]){
    const workflow=read(path);
    const push=pushPaths(workflow);
    assert.match(push,/branches:\s*(?:\[canary\/rc74-4\]|[\s\S]*?- canary\/rc74-4)/u,path+': only protected Canary');
    assert.ok(push.includes("'"+source+"'"),path+': real navigation QA must trigger authenticated exact-SHA proof');
    assert.ok(push.includes("'tests/m26_signature_u26_*.test.mjs'"),path+': related QA regressions must retrigger proof');
    assert.ok(push.includes("'"+path+"'"),path+': any gate policy change must retrigger itself');
  }
});
test('UNIVERSAL protected promotion still demands every real exact-SHA source gate',()=>{
  const body=read('scripts/release/verify_source_qa_gates.mjs');
  for(const name of [
    'IBERFIT M26 CI','IBERFIT Canary Exact Deploy',
    'IBERFIT Coach WebAuthn Recurring','IBERFIT Admin WebAuthn Recurring',
    'IBERFIT Device Experience Gate','IBERFIT M26 Gates remotos de solo lectura',
    'IBERFIT M26 Continuous App Audit'
  ])assert.ok(body.includes("'"+name+"'"),name+' must remain required');
  assert.match(body,/last\.status!=='completed'\|\|last\.conclusion!=='success'/u);
  assert.match(body,/run\?\.head_sha===sha/u);
});
