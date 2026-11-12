import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessM43SyntheticFixtureBudget,M43_SYNTHETIC_SESSION_LIMIT,retainedM43HistoricalFingerprint} from '../scripts/remote-gates/m43-qa-fixture-safety.mjs';

const old=JSON.parse(readFileSync(new URL('../scripts/remote-gates/m43-qa-retained-history-v1.json',import.meta.url),'utf8'));
const next=JSON.parse(readFileSync(new URL('../scripts/remote-gates/m43-qa-retained-history-v2.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('../scripts/remote-gates/m43-qa-fixture-safety.mjs',import.meta.url),'utf8');

test('M43 U92 only archives 84 additional QA completed sessions, leaving the original 477 exact fingerprints immutable',()=>{
 assert.equal(next.schema,'iberfit.qa.m43.retained-historical-v2');
 assert.equal(next.qaOnly,true);
 assert.equal(next.sourceProject,'gjztkdwfmunnzhtvxrsu');
 assert.equal(next.parentBlobSha,'c10fb0b22afdab4560ed3065b6b8953fab392934');
 assert.equal(next.mode,'logical_retention_only_no_database_mutation');
 assert.equal(old.sha256EntityScopeRevisionAndTitle.length,477);
 assert.equal(next.sha256EntityScopeRevisionAndTitle.length,561);
 assert.equal(new Set(next.sha256EntityScopeRevisionAndTitle).size,561);
 assert.ok(next.sha256EntityScopeRevisionAndTitle.every(x=>/^[a-f0-9]{64}$/u.test(x)));
 const unchanged=new Set(old.sha256EntityScopeRevisionAndTitle);
 assert.equal([...unchanged].filter(x=>next.sha256EntityScopeRevisionAndTitle.includes(x)).length,477);
 assert.equal(next.sha256EntityScopeRevisionAndTitle.filter(x=>!unchanged.has(x)).length,84);
 assert.deepEqual(next.sha256EntityScopeRevisionAndTitle,[...next.sha256EntityScopeRevisionAndTitle].sort());
 assert.match(next.selection,/no linked appointment or active execution lock/i);
 assert.match(next.selection,/exactly one completed canonical execution/i);
 assert.match(source,/m43-qa-retained-history-v3\.json/u);
 assert.equal(M43_SYNTHETIC_SESSION_LIMIT,150);
 assert.match(source,/status!=='completada'/u);
 assert.match(source,/item\.body\?\.clientId/u);
 assert.match(source,/Number\(item\.body\?\.revision\)!==revision/u);
 assert.ok(!/\b(DELETE FROM|TRUNCATE|DROP TABLE|UPDATE public\.)\b/iu.test(JSON.stringify(next)));
});

test('M43 U92 retention does not change the 150-fixture fail-closed ceiling or accept nonterminal and malformed owners',()=>{
 const completed={entityType:'session',status:'completada',entityId:'11111111-1111-4111-8111-111111111111',clientId:'22222222-2222-4222-8222-222222222222',revision:3,body:{title:'IBERFIT QA M43 · multideporte · run-12345-a1',clientId:'22222222-2222-4222-8222-222222222222',revision:3}};
 const snapshot={data:{m26Entities:Array.from({length:150},(_,i)=>({...completed,entityId:String(i).padStart(36,'0'),status:'en_curso'}))}};
 assert.equal(assessM43SyntheticFixtureBudget(snapshot).exhausted,true);
 assert.equal(retainedM43HistoricalFingerprint({...completed,status:'en_curso'}),false);
 assert.equal(retainedM43HistoricalFingerprint({...completed,clientId:'33333333-3333-4333-8333-333333333333'}),false);
 assert.equal(retainedM43HistoricalFingerprint({...completed,revision:4}),false);
});
