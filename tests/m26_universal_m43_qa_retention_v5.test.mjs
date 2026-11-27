import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {M43_SYNTHETIC_SESSION_LIMIT,assessM43SyntheticFixtureBudget} from '../scripts/remote-gates/m43-qa-fixture-safety.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../scripts/remote-gates/m43-qa-retained-history-'+n+'.json',import.meta.url),'utf8'));
test('GX01 append-only v5 retains 773 previous and 163 independently verified QA fingerprints',()=>{
 const a=read('v4'),b=read('v5'),before=new Set(a.sha256EntityScopeRevisionAndTitle),after=b.sha256EntityScopeRevisionAndTitle;
 assert.equal(b.schema,'iberfit.qa.m43.retained-historical-v5');
 assert.equal(b.sourceProject,'gjztkdwfmunnzhtvxrsu');assert.equal(b.qaOnly,true);
 assert.equal(b.parentLedger,'m43-qa-retained-history-v4.json');
 assert.equal(b.parentBlobSha,'3781f3ef929b76def851e78b513ab6853f54043b');
 assert.equal(b.frozenBeforeUtc,'2026-11-26T00:57:00Z');
 assert.equal(b.mode,'logical_retention_only_no_database_mutation');
 assert.equal(before.size,773);assert.equal(after.length,936);assert.equal(new Set(after).size,936);
 assert.equal(b.newlyVerifiedCompleteSessions,163);
 assert.deepEqual(b.verifiedFixtureCounts,[133,30]);
 assert.deepEqual(after,[...after].sort());
 assert.ok([...before].every(x=>after.includes(x)));
 assert.ok(after.every(x=>/^[a-f0-9]{64}$/.test(x)));
 assert.match(b.selection,/canonical same-owner completion event/);
 assert.equal(M43_SYNTHETIC_SESSION_LIMIT,150);
 const unknown=Array.from({length:150},()=>({entityType:'session',status:'disponible',body:{title:'IBERFIT QA M43 · multideporte'}}));
 assert.equal(assessM43SyntheticFixtureBudget({data:{m26Entities:unknown}}).exhausted,true);
});
test('GX01 v5 changes trigger full real-write certification on PR and Canary push',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/qa-real-write-cert.yml',import.meta.url),'utf8');
 assert.equal(workflow.split("'scripts/remote-gates/m43-qa-retained-history-v5.json'").length-1,2);
 assert.equal(workflow.split("'tests/m26_universal_m43_qa_retention_v5.test.mjs'").length-1,2);
});
