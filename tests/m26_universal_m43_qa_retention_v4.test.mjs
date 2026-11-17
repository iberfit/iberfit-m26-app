import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {retainedM43HistoricalFingerprint,assessM43SyntheticFixtureBudget,M43_SYNTHETIC_SESSION_LIMIT} from '../scripts/remote-gates/m43-qa-fixture-safety.mjs';
const ledger=n=>JSON.parse(readFileSync(new URL('../scripts/remote-gates/m43-qa-retained-history-'+n+'.json',import.meta.url),'utf8'));
test('verified append-only v4 retains 601 v3 + 172 new completed QA fingerprints',()=>{
 const a=ledger('v3'),b=ledger('v4');
 assert.equal(b.schema,'iberfit.qa.m43.retained-historical-v4');
 assert.equal(b.sourceProject,'gjztkdwfmunnzhtvxrsu');
 assert.equal(b.qaOnly,true);assert.equal(b.frozenBeforeUtc,'2026-11-17T18:29:00Z');
 assert.equal(b.parentLedger,'m43-qa-retained-history-v3.json');
 assert.equal(b.parentBlobSha,'2c94a2f694500b5277c30da4bd6cdef5c4a05227');
 assert.equal(b.mode,'logical_retention_only_no_database_mutation');
 assert.equal(b.newlyVerifiedCompleteSessions,172);
 const previous=new Set(a.sha256EntityScopeRevisionAndTitle),all=b.sha256EntityScopeRevisionAndTitle;
 assert.equal(previous.size,601);assert.equal(all.length,773);assert.equal(new Set(all).size,773);
 assert.deepEqual(all,[...all].sort());
 assert.equal(all.filter(x=>previous.has(x)).length,601);assert.equal(all.filter(x=>!previous.has(x)).length,172);
 assert.ok(all.every(x=>/^[a-f0-9]{64}$/.test(x)));
 assert.match(b.selection,/one completed same-owner canonical execution/);
 assert.match(b.selection,/no appointment, active execution lock or foreign-client domain event/);
 assert.equal(M43_SYNTHETIC_SESSION_LIMIT,150);
});
test('running history can only be discounted with exact frozen hash; active or changed rows still count',()=>{
 const id='20000000-0000-4000-8000-000000000111',owner='30000000-0000-4000-8000-000000000222';
 const item={entityType:'session',entityId:id,clientId:owner,status:'completada',revision:4,
  body:{id,clientId:owner,revision:4,title:'IBERFIT QA M43 · running interactivo · run-1234-a1'}};
 const hash=createHash('sha256').update([owner,id,'completada',4,item.body.title].join(':')).digest('hex'),frozen=new Set([hash]);
 assert.equal(retainedM43HistoricalFingerprint(item,frozen),true);
 assert.equal(retainedM43HistoricalFingerprint(item,new Set()),false);
 for(const changed of [{...item,status:'en_curso'},{...item,revision:5},{...item,clientId:'other'},
  {...item,body:{...item.body,revision:5}},{...item,body:{...item.body,title:'Real Client'}}])
  assert.equal(retainedM43HistoricalFingerprint(changed,frozen),false);
 const active={...item,status:'en_curso'};
 const budget=assessM43SyntheticFixtureBudget({data:{m26Entities:Array.from({length:150},()=>active)}});
 assert.equal(budget.exhausted,true);assert.equal(budget.count,150);
});
test('v4 updates on PR or Canary push always trigger full real-write suite',()=>{
 const yaml=readFileSync(new URL('../.github/workflows/qa-real-write-cert.yml',import.meta.url),'utf8');
 assert.equal(yaml.split("'scripts/remote-gates/m43-qa-retained-history-v4.json'").length-1,2);
 assert.equal(yaml.split("'tests/m26_universal_m43_qa_retention_v4.test.mjs'").length-1,2);
});
