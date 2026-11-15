import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {KEYS,SCHEMA} from '../scripts/ops/m44_auth_vault_cardinality_contract.mjs';

const SCRIPT='scripts/ops/m44_consistent_source_dump.sh';
const WORKFLOW='.github/workflows/m44-encrypted-disaster-recovery.yml';
const SNAP='00000003-0000001B-1';
const MOCK_DOCKER=String.raw`#!/usr/bin/env bash
set -euo pipefail
source=0
for part in "$@"; do
 if [[ "$part" == "-i" ]]; then source=1; fi
done
if [[ "$source" == 1 ]]; then
 cp "$MOCK_CENSUS_JSON" "$MOCK_M44_WORK/auth-vault-source.json"
 printf '%s\n' "$MOCK_SNAPSHOT" > "$MOCK_M44_WORK/source-snapshot.id"
 while IFS= read -r line; do
  if [[ "$line" == '\q' ]]; then exit 0; fi
 done
 exit 80
fi
if [[ "$MOCK_FAIL_DUMP" == "true" ]]; then exit 81; fi
[[ "$*" == *"pg_dump -Fc --snapshot="* ]] || exit 82
[[ "$*" == *"$MOCK_SNAPSHOT"* ]] || exit 83
printf 'PGDMP synthetic readonly source snapshot\n' > "$MOCK_M44_WORK/database.pgcustom"
`;
function withMock(config,check){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iberfit-m44-mvcc-'));
 const work=path.join(root,'plain'),bin=path.join(root,'bin');
 fs.mkdirSync(work);fs.mkdirSync(bin);
 try{
  const fixture={schema:SCHEMA,captured_at:'2026-11-15T03:31:27.123456Z',
   counts:Object.fromEntries(KEYS.map(key=>[key,0]))};
  config?.mutate?.(fixture);
  const census=path.join(root,'source-fixture.json');
  fs.writeFileSync(census,JSON.stringify(fixture),{mode:0o600});
  const docker=path.join(bin,'docker');
  fs.writeFileSync(docker,MOCK_DOCKER,{mode:0o700});
  const env={...process.env,PATH:bin+':'+process.env.PATH,
   IBERFIT_PROD_DATABASE_URL:'postgresql://fake:do-not-print@local.test/postgres',
   MOCK_M44_WORK:work,MOCK_CENSUS_JSON:census,
   MOCK_SNAPSHOT:config?.snapshot??SNAP,
   MOCK_FAIL_DUMP:config?.dumpFailure?'true':'false'};
  const r=spawnSync('bash',[SCRIPT,work],{env,encoding:'utf8',timeout:15000});
  if(r.error)throw r.error;
  check(r,work);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('M44 private source census shares the SAME exported MVCC snapshot as custom dump',()=>{
 const s=fs.readFileSync(SCRIPT,'utf8'),w=fs.readFileSync(WORKFLOW,'utf8');
 assert.match(s,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
 assert.match(s,/SELECT pg_export_snapshot\(\)/);
 assert.ok(s.includes(String.raw`\i /m44-census.sql`));
 assert.match(s,/pg_dump -Fc --snapshot=/);
 assert.match(s,/M44_SOURCE/);
 assert.match(w,/bash scripts\/ops\/m44_consistent_source_dump\.sh/);
 assert.match(w,/auth-vault-source\.json/);
 assert.match(w,/m44_auth_vault_cardinality_contract\.mjs/);
 assert.ok(w.indexOf('m44_auth_vault_cardinality_contract.mjs')<
  w.indexOf('IBERFIT_PROD_LOCAL_DB_AND_STORAGE_RESTORE_SUCCESS'));
 assert.match(w,/if: github.event_name != 'pull_request'/);
 assert.doesNotMatch(w,/--single-transaction[\s\S]*service_role_secret/);
});
test('Synthetic Docker contract exports source census and dump without any sensitive logs',()=>{
 withMock({},(r,work)=>{
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/SAME_MVCC_SOURCE_CENSUS_AND_PGCUSTOM_READY/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(work,'auth-vault-source.json'),'utf8')).counts,
   Object.fromEntries(KEYS.map(key=>[key,0])));
  assert.match(fs.readFileSync(path.join(work,'database.pgcustom'),'utf8'),/PGDMP/);
  assert.equal(fs.existsSync(path.join(work,'source-snapshot.id')),false);
  assert.doesNotMatch(r.stdout+r.stderr,/do-not-print|auth_users|2026-11-15|source-fixture/);
 });
});
test('Malformed census, invalid exported snapshot and dump failure all fail closed',()=>{
 for(const variant of [
  {mutate:x=>{x.counts.auth_sessions=-1;},code:'SOURCE_AUTH_VAULT_CENSUS_INVALID'},
  {snapshot:'snapshot-invalid',code:'EXPORTED_SNAPSHOT_ID_INVALID'},
  {dumpFailure:true,code:'MATCHING_SNAPSHOT_DUMP_FAILED'},
 ]){
  withMock(variant,(r,work)=>{
   assert.notEqual(r.status,0);
   assert.match(r.stderr,new RegExp(variant.code));
   assert.equal(fs.existsSync(path.join(work,'source-snapshot.id')),false);
   assert.doesNotMatch(r.stdout+r.stderr,/do-not-print|auth_sessions|source-fixture/);
  });
 }
});
