import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/m26/supabase-transport.js','utf8').replace(/\r\n?/gu,'\n');

function functionBody(name){
  const start=source.indexOf(`async function ${name}`);
  assert.notEqual(start,-1,`missing ${name}`);
  const next=source.indexOf('\n  async function ',start+1);
  return source.slice(start,next===-1?source.length:next);
}

test('production may use the canonical V12 client onboarding transport',()=>{
  for(const name of ['clientOnboardingPreflight','createClientDraft']){
    const body=functionBody(name);
    assert.doesNotMatch(body,/M26_CLIENT_CREATE_CANARY_ONLY/u,`${name} must not be blocked outside canary`);
  }
  assert.match(functionBody('clientOnboardingPreflight'),/CLIENT_ONBOARDING_RPC\.preflight/u);
  assert.match(functionBody('createClientDraft'),/CLIENT_ONBOARDING_RPC\.create/u);
});

test('runtime still isolates QA canary from production projects',()=>{
  assert.match(source,/const qaOnly = canary \|\| raw\?\.qaOnly === true;/u);
  assert.match(source,/M26_PRODUCTION_PROJECT_REF='pjhmrhejsoofmouedavw'/u);
  assert.match(source,/M26_QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu'/u);
});
