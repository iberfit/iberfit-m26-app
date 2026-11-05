import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REF,BASE,RPCS,denied,safeEvidence} from '../scripts/remote-gates/qa_u60_closed_hosted_jwt_gate.mjs';
test('U66 fixed QA origin and two explicit closed RPCs',()=>{
 assert.equal(REF,'gjztkdwfmunnzhtvxrsu');
 assert.equal(BASE,'https://'+REF+'.supabase.co');
 assert.deepEqual(RPCS,['iberfit_occurrence_api_u60_v1','iberfit_occurrence_detail_v1']);
});
test('U66 no accidental HTTP success or server error treated as authorization denied',()=>{
 for(const http of [200,201,204,400,429,500,503])assert.throws(()=>denied(http,{}));
 for(const http of [401,403])assert.equal(denied(http,{}),true);
 assert.equal(denied(404,{code:'PGRST202'}),true);
 assert.throws(()=>denied(404,{code:'PGRST116'}));
});
test('U66 evidence is restricted to anonymous check labels',()=>{
 const out=safeEvidence(['test:coach:closed']);
 assert.equal(out.prodTouched,false);
 assert.equal(out.userRowsTouched,false);
 assert.equal(out.u60GrantsOpened,false);
 assert.equal(out.passed,true);
 assert.deepEqual(out.tests,['test:coach:closed']);
 assert.equal(JSON.stringify(out).includes('password'),false);
});
test('U66 no service-role auth or production in source',()=>{
 const src=readFileSync(new URL('../scripts/remote-gates/qa_u60_closed_hosted_jwt_gate.mjs',import.meta.url),'utf8');
 assert.match(src,/M26_QA_ONLY/);
 assert.match(src,/M26_QA_CLIENT_A_PASSWORD/);
 assert.match(src,/M26_QA_CLIENT_B_PASSWORD/);
 assert.match(src,/M26_QA_COACH_PASSWORD/);
 assert.match(src,/productionBlocked===true/);
 assert.doesNotMatch(src,/pjhmrhejsoofmouedavw/);
 assert.doesNotMatch(src,/service[_-]?role.*Bearer|SUPABASE_SERVICE_ROLE_KEY/);
});
