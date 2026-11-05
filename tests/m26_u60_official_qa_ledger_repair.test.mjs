import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QA,REPO,BRANCH,VERSIONS,buildProbeSql,extractRow,migrationFilesDigest,buildCanonicalProbeSql,U60_CANONICAL,U60_INSTALLED_ALIAS} from '../scripts/u60/qa-ledger-repair.mjs';
const sample="WITH flags AS (SELECT 0 AS ledger_rows) SELECT jsonb_build_object('schema','iberfit.u60.qa-reconciliation.v1') AS report FROM flags;";
test('Canonical QA, source branch and exactly seven migrations',()=>{
  assert.equal(QA,'gjztkdwfmunnzhtvxrsu');
  assert.equal(REPO,'iberfit/iberfit-m26-app');
  assert.equal(BRANCH,'feat/u60-training360-r50-reconciled-20261104');
  assert.deepEqual(VERSIONS,[
    '20261025182000','20261025194000','20261025203500',
    '20261025210500','20261025223000','20261025231500','20261025235500',
  ]);
});
test('Physical preflight/postflight check every original security invariant',()=>{
  for(const rows of [0,7]){
    const sql=buildProbeSql(sample,rows);
    for(const s of ['ledger_rows='+rows,'verified_functions=8','drifted_functions=0',
      'signature_count_ok','table_private','same_client_fk','execution_fk',
      'source_triggers_count','unique_index_guards','legacy_write_chain_fingerprints',
      'receipt_schema_ready','legacy_lock_shared'])assert.ok(sql.includes(s),s);
    assert.match(sql,/FROM flags;\s*$/);
  }
});
test('Cannot silently weaken ledger number or audit source',()=>{
  for(const n of [-1,1,2,3,6,8,null])assert.throws(()=>buildProbeSql(sample,n));
  assert.throws(()=>buildProbeSql('SELECT 1;',0),/CONTRACT_CHANGED/);
});
test('Only trust structured CLI rows, not copied prose',()=>{
  const row={verification:'U60_QA_PROBE_GO',ledger_rows:0,verified_functions:8,drifted_functions:0};
  assert.deepEqual(extractRow({result:{records:[row]}}),row);
  assert.deepEqual(extractRow(JSON.stringify({rows:[row]})),row);
  assert.equal(extractRow({message:'U60_QA_PROBE_GO'}),null);
});
test('Source mutation changes manifest digest',()=>{
  const a=migrationFilesDigest([{version:VERSIONS[0],content:'SELECT 1;'}]);
  const b=migrationFilesDigest([{version:VERSIONS[0],content:'SELECT 2;'}]);
  assert.match(a,/^[0-9a-f]{64}$/);
  assert.notEqual(a,b);
});
test('Supabase v3 remote QA audit always passes explicit read-only flag',()=>{
  const js=readFileSync(new URL('../scripts/u60/qa-ledger-repair.mjs',import.meta.url),'utf8');
  assert.match(js,/\['db','query','--read-only','--file'/);
  assert.match(js,/'--remote='\+QA/);
});
test('U60 exact canonical version alias requires full closed grants and five triggers',()=>{ const sql=buildCanonicalProbeSql('before'); assert.ok(sql.includes(U60_CANONICAL));assert.ok(sql.includes(U60_INSTALLED_ALIAS));assert.ok(sql.includes('functions=8 AND triggers=5'));assert.ok(sql.includes("NOT has_function_privilege('authenticated'"));assert.throws(()=>buildCanonicalProbeSql('garbage')); });
test('Repo canonical QA proof is read-only and compatible',()=>{
  const sql=readFileSync(new URL('../scripts/u60/qa_readonly_reconciliation.sql',import.meta.url),'utf8');
  const clean=sql.replace(/--[^\n]*/g,'');
  assert.doesNotMatch(clean,/\b(?:create|alter|drop|truncate|insert\s+into|update\s+\w+|delete\s+from|grant|revoke)\b/i);
  assert.match(sql,/source_functions_verified/);
  assert.match(sql,/ready_for_u60/);
  assert.doesNotThrow(()=>buildProbeSql(sql,0));
  assert.doesNotThrow(()=>buildProbeSql(sql,7));
});
