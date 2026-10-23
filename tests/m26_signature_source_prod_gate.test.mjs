import test from 'node:test';
import assert from 'node:assert/strict';
import {verifySourceQaGates} from '../scripts/release/verify_source_qa_gates.mjs';
import {readFileSync} from 'node:fs';
const SHA='a'.repeat(40),OTHER='b'.repeat(40);
const names=['IBERFIT M26 CI','IBERFIT Canary Exact Deploy',
  'IBERFIT Coach WebAuthn Recurring','IBERFIT Admin WebAuthn Recurring',
  'IBERFIT Device Experience Gate','IBERFIT M26 Gates remotos de solo lectura',
  'IBERFIT M26 Continuous App Audit'];
const run=(name,rest={})=>({
 name,head_sha:SHA,head_branch:'canary/rc74-4',event:'push',
 status:'completed',conclusion:'success',created_at:'2026-10-20T19:00:00Z',
 updated_at:'2026-10-20T19:10:00Z',id:42,...rest
});
const inventory=(rows=names.map(name=>run(name)))=>({total_count:rows.length,workflow_runs:rows});
test('SIGNATURE production source requires exact seven real green QA, device, audit and network gates',()=>{
 assert.equal(verifySourceQaGates(inventory(),SHA).length,7);
 for(const name of names){
   assert.throws(()=>verifySourceQaGates(inventory(names.filter(n=>n!==name).map(run)),SHA),/SIGNATURE_GATE_MISSING/u);
 }
});
test('SIGNATURE release rejects wrong SHA, foreign branch, PR-only and skipped checks',()=>{
 for(const patch of [
   {head_sha:OTHER},{head_branch:'release/prod-'+SHA.slice(0,12)},
   {event:'pull_request'},{status:'completed',conclusion:'skipped'},
   {status:'in_progress',conclusion:null},{status:'completed',conclusion:'failure'},
 ]){
   const list=names.map(n=>run(n,n===names[2]?patch:{}));
   assert.throws(()=>verifySourceQaGates(inventory(list),SHA),/SIGNATURE_GATE_/u);
 }
 assert.throws(()=>verifySourceQaGates(inventory(),OTHER),/SIGNATURE_GATE_MISSING/u);
 assert.throws(()=>verifySourceQaGates({total_count:101,workflow_runs:names.map(run)},SHA),/TRUNCATED/u);
});
test('SIGNATURE latest failed result defeats an older successful check',()=>{
 const list=[...names.map(run),run(names[2],{
   id:43,updated_at:'2026-10-20T20:10:00Z',conclusion:'failure',
 })];
 assert.throws(()=>verifySourceQaGates(inventory(list),SHA),/NOT_GREEN/u);
});
test('SIGNATURE deploy flow must check real gates before artifact deployment',()=>{
 const src=readFileSync(new URL('../.github/workflows/production-promote.yml',import.meta.url),'utf8');
 const check=src.indexOf('node scripts/release/verify_source_qa_gates.mjs');
 const wrangler=src.indexOf('pages deploy .tmp/rc64-current-surface');
 assert.ok(check>=0&&wrangler>check,'production deploy requires exact source gate first');
 assert.match(src,/GH_ACTIONS_TOKEN: \$\{\{ github\.token \}\}/u);
});

test('SIGNATURE promotion rejects green WebAuthn if Device, Remote or Audit have failed',()=>{
 for(const name of ['IBERFIT Device Experience Gate',
                     'IBERFIT M26 Gates remotos de solo lectura',
                     'IBERFIT M26 Continuous App Audit']){
   const list=names.map(n=>run(n,n===name?{conclusion:'failure'}:{}));
   assert.throws(()=>verifySourceQaGates(inventory(list),SHA),/SIGNATURE_GATE_NOT_GREEN/u);
 }
});
test('SIGNATURE release requires latest exact push success for a previous remote failure',()=>{
 const first=names.map(run);
 const later=run('IBERFIT M26 Gates remotos de solo lectura',{
   id:43,updated_at:'2026-10-21T19:10:00Z',conclusion:'failure',
 });
 assert.throws(()=>verifySourceQaGates(inventory([...first,later]),SHA),/NOT_GREEN/u);
 const after=run('IBERFIT M26 Gates remotos de solo lectura',{
   id:44,updated_at:'2026-10-22T19:10:00Z',conclusion:'success',
 });
 assert.equal(verifySourceQaGates(inventory([...first,later,after]),SHA).length,7);
});
