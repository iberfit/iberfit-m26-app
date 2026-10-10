import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const gate=readFileSync(new URL('../scripts/remote-gates/run_authenticated_readonly_gate.mjs',import.meta.url),'utf8');

test('each authenticated QA client probes V45 table with non-mutating GET and expects denied',()=>{
  const first=gate.indexOf("const v45Table=await requestResult(");
  const second=gate.indexOf("const v45Preview=await rpcResult(");
  assert.ok(first>0&&second>first);
  assert.match(gate.slice(first,second),/m26_wearable_source_daily_v45\?select=id&limit=1/u);
  assert.match(gate.slice(first,second),/method:'GET'/u);
  assert.match(gate.slice(first,second),/v45Table\.status!==403/u);
  assert.match(gate.slice(first,second),/v45Table\.body\?\.code/u);
  assert.match(gate.slice(first,second),/42501/u);
});
test('preflight negative QA probe never supplies customer data or a valid grant',()=>{
  const start=gate.indexOf("const v45Preview=await rpcResult(");
  const end=gate.indexOf("const privacy=",start);
  const section=gate.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.match(section,/m26_wearable_v45_validate_native_preview_qa_v1/u);
  assert.match(section,/p_grant_id:null,p_payload:\{records:\[\]\}/u);
  assert.match(section,/M26_CONNECTED360_V45_PREVIEW_INVALID/u);
  assert.match(section,/v45ReadOnlyGate=Object\.freeze/u);
  assert.match(section,/persisted:false/u);
  assert.doesNotMatch(section,/importWearable|insert\s+into|delete\s+from|update\s+public|reauthorize/u);
});
test('gate is per-Client, scoped to QA environment, and never outputs user identifiers',()=>{
  assert.match(gate,/for\(const session of sessions\)/u);
  assert.match(gate,/if\(expectedRole==='coach'\)/u);
  assert.match(gate,/PROJECT_REF='gjztkdwfmunnzhtvxrsu'/u);
  assert.match(gate,/connected360V45:v45ReadOnlyGate/u);
  assert.match(gate,/fingerprint\(clientId\)/u);
  assert.doesNotMatch(gate,/m26_wearable_source_daily_v45\?select=\*/u);
});
