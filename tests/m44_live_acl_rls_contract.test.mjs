import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
 SCHEMA,METRICS,validateSnapshot,checkExposure,enforceExposure,compareEnvironments
} from '../scripts/ops/m44_live_acl_rls_contract.mjs';
const sample=(which='PROD')=>({
 schema:SCHEMA,captured_at:'2026-10-16T04:16:15.101073Z',
 metrics:{
  total_tables:164,public_tables:128,truncate_grants:0,unprotected_dml_grants:0,
  public_anon_delete:which==='PROD'?44:43,public_anon_trigger:51,
  public_authenticated_delete:which==='PROD'?52:51,
  public_authenticated_trigger:52,
  public_anon_insert:which==='PROD'?45:44,
  public_authenticated_insert:which==='PROD'?59:58
 }
});
test('Read-only preflight exact catalog, no customer rows and no data-changing SQL',()=>{
 const text=fs.readFileSync('scripts/ops/m44_live_acl_rls_preflight.sql','utf8');
 assert.match(text,/WHERE n\.nspname IN \('public','storage','auth','vault'\)/);
 assert.match(text,/pg_catalog\.has_table_privilege/);
 assert.match(text,/c\.relrowsecurity/);
 assert.match(text,/json_build_object/);
 const executable=text.replace(/--[^\n]*\n/g,'');
 assert.equal((executable.match(/\bSELECT\b/gi)||[]).length>=1,true);
 assert.doesNotMatch(executable,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|CALL|COPY)\s+(?:TABLE|SCHEMA|DATABASE|FROM|INTO|ON|ROLE)\b/i);
 assert.doesNotMatch(executable,/SELECT\s+\*\s+FROM\s+(?:public|storage|vault|auth)\./i);
 assert.equal(METRICS.length,10);
});
test('PROD and QA live aggregate baselines are structurally safe, not runtime-certified',()=>{
 const prod=sample('PROD'),qa=sample('QA');
 const p=enforceExposure(prod),q=enforceExposure(qa);
 for(const result of [p,q]){
  assert.equal(result.structuralPreflightPass,true);
  assert.equal(result.databaseTablesInspected,164);
  assert.equal(result.elevatedLegacyWriteGrantsPresent,true);
  for(const key of ['runtimeRlsAuthorizationVerified','securityDefinerSafetyVerified',
    'restoreRolesAclVerified','authRecoveryVerified','platformRecoveryVerified'])
   assert.equal(result[key],false,key);
 }
 const comparison=compareEnvironments(prod,qa);
 assert.equal(comparison.bothStructurallySafe,true);
 assert.equal(comparison.sameScope,true);
 assert.equal(comparison.liveSecurityParityVerified,false);
});
test('Any TRUNCATE or DML without RLS fails closed independently per environment',()=>{
 for(const key of ['truncate_grants','unprotected_dml_grants']){
  const snapshot=sample();snapshot.metrics[key]=1;
  assert.equal(checkExposure(snapshot).structuralPreflightPass,false);
  assert.throws(()=>enforceExposure(snapshot),/UNSAFE_TRUNCATE_OR_RLS_MISSING/);
  assert.equal(compareEnvironments(snapshot,sample('QA')).bothStructurallySafe,false);
 }
});
test('Malformed or ungrounded snapshots rejected without printing grants or any private values',()=>{
 for(const mutate of [
  x=>{delete x.metrics.public_anon_delete;},
  x=>{x.metrics.user_id='sensitive-id';},
  x=>{x.metrics.total_tables='164';},
  x=>{x.metrics.total_tables=0;},
  x=>{x.schema='untrusted';},
  x=>{x.captured_at='2026-10-16';},
  x=>{x.metrics.truncate_grants=-1;},
  x=>{x.metrics.public_anon_insert=1.2;},
  x=>{x.secret='never add raw data';}
 ]){
  const fixture=sample();mutate(fixture);
  assert.throws(()=>validateSnapshot(fixture),/^Error: IBERFIT_M44_LIVE_ACL_RLS_/);
 }
});
test('CLI accepts only one local JSON aggregate; fails on changed exposure and symlinks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'if-m44-rls-'));
 try{
  const file=path.join(dir,'only-counts.json'),link=path.join(dir,'symlink.json');
  const run=f=>spawnSync(process.execPath,
    ['scripts/ops/m44_live_acl_rls_contract.mjs',f],{encoding:'utf8'});
  fs.writeFileSync(file,JSON.stringify(sample()));
  const ok=run(file);
  assert.equal(ok.status,0,ok.stderr);
  assert.match(ok.stdout,/STRUCTURAL_PREFLIGHT_PASS/);
  assert.doesNotMatch(ok.stdout,/public_anon_delete|44|private|client|secret/);
  const bad=sample();bad.metrics.truncate_grants=1;
  fs.writeFileSync(file,JSON.stringify(bad));
  const result=run(file);assert.notEqual(result.status,0);
  assert.match(result.stderr,/UNSAFE_TRUNCATE_OR_RLS_MISSING/);
  assert.doesNotMatch(result.stderr,/public_anon_delete|client|secret/);
  fs.symlinkSync(file,link);
  const symlink=run(link);
  assert.notEqual(symlink.status,0);
  assert.match(symlink.stderr,/FILE_INVALID/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
