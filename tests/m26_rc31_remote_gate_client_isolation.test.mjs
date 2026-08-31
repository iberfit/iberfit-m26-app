import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {
  RC29_QA_CLIENTS_NOT_DISTINCT,
  assertDistinctQaClientIds,
} from '../scripts/remote-gates/readonly-gate-client-isolation.mjs';

test('el gate acepta exactamente dos clientId QA distintos',()=>{
  assert.equal(assertDistinctQaClientIds(['CLI-QA-A','CLI-QA-B']),true);
});

test('el gate rechaza dos cuentas asociadas al mismo clientId',()=>{
  assert.throws(
    ()=>assertDistinctQaClientIds(['CLI-QA-A','CLI-QA-A']),
    new RegExp(RC29_QA_CLIENTS_NOT_DISTINCT),
  );
});

test('el gate rechaza IDs ausentes, vacíos o un tercer cliente inesperado',()=>{
  for(const value of [
    [],
    ['CLI-QA-A'],
    ['CLI-QA-A',''],
    ['CLI-QA-A',null],
    ['CLI-QA-A','CLI-QA-B','CLI-QA-C'],
    null,
  ]){
    assert.throws(
      ()=>assertDistinctQaClientIds(value),
      new RegExp(RC29_QA_CLIENTS_NOT_DISTINCT),
    );
  }
});

test('el gate compara IDs crudos solo en memoria y conserva huellas en evidencia',async()=>{
  const gate=await readFile(
    'scripts/remote-gates/run_authenticated_readonly_gate.mjs',
    'utf8',
  );

  assert.match(gate,/const roles=\[\];\s*const qaClientIds=\[\];/);
  assert.match(
    gate,
    /if\(expectedRole==='client'\)qaClientIds\.push\(clientId\);/,
  );
  assert.match(
    gate,
    /assertDistinctQaClientIds\(qaClientIds,RC29_QA_CLIENTS_NOT_DISTINCT\);/,
  );

  assert.doesNotMatch(
    gate,
    /roles\.filter\(\(x\)=>x\.name\.startsWith\('client_'\)\)\.map\(\(x\)=>x\.clientId\)/,
  );
  assert.doesNotMatch(gate,/\bclientId\s*:\s*clientId\b/);
  assert.match(gate,/clientFingerprint:fingerprint\(clientId\)/);
  assert.match(gate,/mutationsPerformed:false/);
});
