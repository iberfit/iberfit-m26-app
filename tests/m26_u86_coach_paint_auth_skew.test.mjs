import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAX_QA_FUTURE_IAT_RESPONSES,shouldAwaitFinalAssuranceResponse} from '../qa/rc64/assurance-clock-skew-gate.mjs';

test('U86 QA waits only for bounded, typed PostgREST future-issued JWT recovery',()=>{
  const error={status:401,body:{code:'PGRST303',message:'JWT issued at future'}};
  assert.equal(MAX_QA_FUTURE_IAT_RESPONSES,3);
  for(const observedSkewResponses of [0,1,2]){
    assert.equal(shouldAwaitFinalAssuranceResponse({...error,observedSkewResponses}),true);
  }
  for(const observedSkewResponses of [-1,3,4,NaN]){
    assert.equal(shouldAwaitFinalAssuranceResponse({...error,observedSkewResponses}),false);
  }
  for(const mutation of [
    {status:403},{status:200},{body:{code:'PGRST303',message:'JWT expired'}},
    {body:{code:'PGRST301',message:'JWT issued at future'}},
    {body:{code:'PGRST303',message:'invalid signature'}},
    {body:null},
  ])assert.equal(shouldAwaitFinalAssuranceResponse({...error,...mutation}),false);
});

test('U86 authenticated QA keeps the original timeout and rejects all unrelated 401s',()=>{
  const source=readFileSync(new URL('../qa/rc64/authenticated-current-contract.spec.mjs',import.meta.url),'utf8');
  assert.match(source,/page\.waitForResponse\(async\(response\)=>/u);
  assert.match(source,/shouldAwaitFinalAssuranceResponse\(/u);
  assert.match(source,/if\(response\.status\(\)!==401\)return true/u);
  assert.match(source,/timeout:AUTH_FLOW_TIMEOUT_MS/u);
  assert.match(source,/assurance=await readAssurance\(outcome\.response\)/u);
  assert.match(source,/expect\(response\.status\(\),'Assurance RPC must answer successfully'\)\.toBe\(200\)/u);
});

test('U86 Coach directory optimizes only its initial painting, keeping accessible cards and 5s SLA',()=>{
  const renderer=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const styles=readFileSync(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8');
  const realQa=readFileSync(new URL('../qa/signature-u26-authenticated-professional-routes.mjs',import.meta.url),'utf8');
  assert.match(renderer,/m26-route m26-client-directory-route/u);
  assert.match(styles,/\.m26-shell\[data-m26-role="coach"\] \.m26-client-directory-route > \* \{\s*animation: none/u);
  assert.match(styles,/\.m26-shell\[data-m26-role="coach"\] \.m26-client-directory-route \.m26-client-card \{\s*content-visibility: auto;/u);
  assert.match(styles,/contain-intrinsic-size: auto 11rem/u);
  assert.match(realQa,/toBeLessThanOrEqual\(5_000\)/u);
  assert.match(realQa,/scriptDurationsMs/u);
  assert.doesNotMatch(realQa,/script\.sourceURL/u);
});
