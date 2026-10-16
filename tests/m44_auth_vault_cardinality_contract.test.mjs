import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {KEYS,SCHEMA,validateAuthVaultCensus,
 compareAuthVaultCensus,compareCensusFiles} from '../scripts/ops/m44_auth_vault_cardinality_contract.mjs';

const SOURCE_FILE='scripts/ops/m44_auth_vault_census.sql';
const fixture=()=>({schema:SCHEMA,captured_at:'2026-10-16T03:11:27.123456Z',
 counts:Object.fromEntries(KEYS.map(k=>[k,0]))});
test('SQL reads one MVCC snapshot and only aggregates: no rows, secrets or credentials',()=>{
 const sql=fs.readFileSync(SOURCE_FILE,'utf8');
 assert.equal(KEYS.length,13);
 for(const key of KEYS)assert.match(sql,new RegExp("'"+key+"'"));
 const queries=[...sql.matchAll(/\(SELECT count\(\*\) FROM (\w+\.\w+)\)/g)];
 assert.equal(queries.length,KEYS.length);
 assert.ok(queries.every(q=>/^(?:auth|vault|storage)\./.test(q[1])));
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|COPY)\s+(?:TABLE|FROM|INTO|ROLE)/i);
 assert.doesNotMatch(sql,/SELECT\s+\*\s+FROM\s+(auth|vault|storage)/i);
});
test('Counts prove only cardinality; do not attest hosted Auth, secrets or privileges',()=>{
 const x=fixture(),y=fixture();
 x.counts.auth_users=3;y.counts.auth_users=3;
 x.counts.auth_identities=3;y.counts.auth_identities=3;
 assert.equal(validateAuthVaultCensus(x).tableCount,13);
 const check=compareAuthVaultCensus(x,y);
 assert.equal(check.cardinalityParity,true);
 for(const k of ['recordIdentityVerified','sourceBackupSnapshotProvenanceVerified',
   'hostedAuthVerified','vaultKeyRecoveryVerified','rolePrivilegesVerified','platformRecoveryVerified'])
  assert.equal(check[k],false);
});
test('Every material data category drifts fail closed, without returning data',()=>{
 for(const key of KEYS){
  const before=fixture(),after=fixture();after.counts[key]=1;
  const result=compareAuthVaultCensus(before,after);
  assert.deepEqual(result.mismatchCategories,[key]);
  assert.equal(result.cardinalityParity,false);
 }
});
test('Missing, extra, negative or noninteger fields and wrong schema are rejected',()=>{
 for(const change of [
  x=>delete x.counts.auth_users,
  x=>x.counts.extra_secret_name=1,
  x=>x.counts.vault_secrets=-1,
  x=>x.counts.auth_users=3.5,
  x=>x.counts.auth_users='3',
  x=>x.schema='another-project',
  x=>x.captured_at='not-a-timestamp',
  x=>x.plaintext_secret='should not be here'
 ]){const c=fixture();change(c);assert.throws(()=>validateAuthVaultCensus(c),/IBERFIT_M44_AUTH_VAULT_/);}
});
test('CLI refuses the same file, symlinks, altered counts and leaks no private info',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'if-m44-auth-vault-'));
 try{
  const src=path.join(dir,'source.json'),dst=path.join(dir,'restored.json'),link=path.join(dir,'alias.json');
  fs.writeFileSync(src,JSON.stringify(fixture()));
  fs.writeFileSync(dst,JSON.stringify(fixture()));
  fs.symlinkSync(src,link);
  assert.equal(compareCensusFiles(src,dst).cardinalityParity,true);
  assert.throws(()=>compareCensusFiles(src,src),/INDEPENDENT_FILES_REQUIRED/);
  assert.throws(()=>compareCensusFiles(src,link),/INDEPENDENT_FILES_REQUIRED/);
  const cmd=()=>spawnSync(process.execPath,
    ['scripts/ops/m44_auth_vault_cardinality_contract.mjs',src,dst],{encoding:'utf8'});
  const ok=cmd();assert.equal(ok.status,0,ok.stderr);
  assert.match(ok.stdout,/CARDINALITY_ONLY/);
  assert.doesNotMatch(ok.stdout,/2026|auth_users|customer|email/);
  const d=fixture();d.counts.storage_objects=126;fs.writeFileSync(dst,JSON.stringify(d));
  const fail=cmd();assert.notEqual(fail.status,0);
  assert.match(fail.stderr,/CARDINALITY_MISMATCH/);
  assert.doesNotMatch(fail.stderr,/storage_objects|126|customer/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
