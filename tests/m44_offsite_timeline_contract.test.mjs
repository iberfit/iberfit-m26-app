import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {SCHEMA,measureOffsiteTimeline} from '../scripts/ops/m44_offsite_timeline_contract.mjs';

const fixture=()=>({
 schema:SCHEMA,
 workflow:{
  id:38888628869,
  sourceSha:'48d4ae327272ab2016cd0298788aa0af8981a63a',
  status:'completed',conclusion:'success',
  startedAt:'2026-10-16T10:39:07Z',finishedAt:'2026-10-16T10:42:58Z',
  artifactSha256:'3fd6a9aff8beda8342973da357824d04b3f6ef6508ba381d2495cea25a7d18bd',
  artifactBytes:32143146
 },
 drive:{
  createdAt:'2026-10-16T10:44:43.988Z',
  verifiedAt:'2026-10-16T10:45:43.988Z',
  sha256:'3fd6a9aff8beda8342973da357824d04b3f6ef6508ba381d2495cea25a7d18bd',
  bytes:32143146,shared:false,ownerCount:1
 }
});
test('actual GH/Drive observation measures transport but never RTO or RPO',()=>{
 const m=measureOffsiteTimeline(fixture());
 assert.equal(m.workflowExecutionSeconds,231);
 assert.equal(m.externalTransferSeconds,106);
 assert.equal(m.fromWorkflowStartToOffsiteSeconds,337);
 assert.equal(m.driveReadbackDelaySeconds,60);
 assert.equal(m.digestEqual,true);
 for(const k of [
  'providerProvenanceAuthenticatedByThisCheck','operatorKeyRestorationVerified',
  'sourceDatabaseSnapshotTimestampVerified','lastDurableWriteTimestampVerified',
  'exactDatabaseStorageConsistencyVerified','fullPlatformRestoreMeasured',
  'rtoCertified','rpoCertified','platformRecoveryVerified'
 ]) assert.equal(m[k],false,k);
 assert.equal(m.rtoSeconds,null);
 assert.equal(m.rpoSeconds,null);
});
test('tampered checksum or artifact provenance and ambiguous privacy are rejected',()=>{
 for(const mutation of [
  o=>o.workflow.artifactSha256='a'.repeat(64),
  o=>o.drive.sha256='not-valid',
  o=>o.drive.bytes=1234,
  o=>o.workflow.status='in_progress',
  o=>o.workflow.conclusion='failure',
  o=>o.drive.shared=true,
  o=>o.drive.ownerCount=2,
  o=>o.workflow.sourceSha='notsha'
 ]){
  const o=fixture();mutation(o);
  assert.throws(()=>measureOffsiteTimeline(o),/IBERFIT_M44_OFFSITE_TIMELINE_/);
 }
});
test('out-of-order, malformed and unbounded timestamps are rejected',()=>{
 for(const mutate of [
  x=>x.workflow.finishedAt='2026-10-16T10:30:00Z',
  x=>x.drive.createdAt='2026-10-16T10:31:00Z',
  x=>x.drive.verifiedAt='2026-10-16T10:40:00Z',
  x=>x.workflow.startedAt='2026-10-16 10:39:07',
  x=>x.workflow.startedAt='not-a-date',
  x=>x.workflow.startedAt='2026-13-16T10:39:07Z',
  x=>x.workflow.startedAt='2026-10-16T09:00:00Z',
  x=>x.drive.createdAt='2026-10-18T10:42:59Z'
 ]){
  const o=fixture();mutate(o);
  assert.throws(()=>measureOffsiteTimeline(o),/IBERFIT_M44_OFFSITE_TIMELINE_/);
 }
});
test('future or invalid observer clocks fail closed even if sequence seems valid',()=>{
 const snapshot=fixture();
 assert.throws(()=>measureOffsiteTimeline(snapshot,{nowMs:Date.parse('2026-10-16T10:42:00Z')}),
   /EVENT_FROM_FUTURE/);
 assert.throws(()=>measureOffsiteTimeline(snapshot,{nowMs:NaN}),
   /CLOCK_INVALID/);
 const far=fixture();
 far.workflow.startedAt='2099-10-16T10:39:07Z';
 far.workflow.finishedAt='2099-10-16T10:42:58Z';
 far.drive.createdAt='2099-10-16T10:44:43.988Z';
 far.drive.verifiedAt='2099-10-16T10:45:43.988Z';
 assert.throws(()=>measureOffsiteTimeline(far),/EVENT_FROM_FUTURE/);
});
test('exact object schemas prevent unapproved metadata and secrets entering evidence',()=>{
 for(const mutation of [
  x=>{x.secret='NEVER-PERSIST-ME';},
  x=>{x.workflow.privateDatabaseUrl='NEVER-PERSIST-ME';},
  x=>{x.drive.ownerEmail='owner@example.test';},
  x=>{delete x.drive.shared;},
  x=>{delete x.workflow.id;},
  x=>{x.schema='iberfit.m44.platform-recovered.v1';},
  x=>{x.workflow.artifactBytes='32143146';}
 ]){
  const o=fixture();mutation(o);
  assert.throws(()=>measureOffsiteTimeline(o),/IBERFIT_M44_OFFSITE_TIMELINE_/);
 }
});
test('CLI accepts private JSON safely and emits only bounded durations and NOT certified',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iberfit-m44-time-'));
 try{
  const p=path.join(dir,'timing.json'),ln=path.join(dir,'link.json');
  const call=f=>spawnSync(process.execPath,
   ['scripts/ops/m44_offsite_timeline_contract.mjs',f],{encoding:'utf8'});
  fs.writeFileSync(p,JSON.stringify(fixture()),{mode:0o600});
  const ok=call(p);assert.equal(ok.status,0,ok.stderr);
  assert.match(ok.stdout,/workflow_seconds=231:offsite_seconds=337:RTO_UNVERIFIED:RPO_UNVERIFIED/);
  assert.doesNotMatch(ok.stdout,/38888628869|48d4ae|3fd6a9|owner@|pass|jwt/i);
  fs.symlinkSync(p,ln);
  const denied=call(ln);assert.notEqual(denied.status,0);
  assert.match(denied.stderr,/FILE_INVALID/);
  const bad=fixture();bad.workflow.artifactSha256='f'.repeat(64);
  fs.writeFileSync(p,JSON.stringify(bad));
  const failed=call(p);assert.notEqual(failed.status,0);
  assert.doesNotMatch(failed.stderr,/3fd6a9|38888628869|owner@|passphrase/i);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('existing production backup gate is not relaxed by timing metric',()=>{
 const p=fs.readFileSync('scripts/ops/m44_prod_backup_inventory_guard.mjs','utf8');
 assert.match(p,/MAX_OFFSITE_RELEASE_AGE_MS=2\*60\*60\*1000/);
 assert.match(p,/PLATFORM_RECOVERY_UNVERIFIED/);
 assert.match(p,/platformRecoveryVerified!==true/);
 assert.doesNotMatch(p,/m44_offsite_timeline_contract/);
});
