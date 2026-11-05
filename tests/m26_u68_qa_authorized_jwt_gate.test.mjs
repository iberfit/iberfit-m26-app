import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REF,calendarShape,isDenied,evidence} from '../scripts/remote-gates/qa_u60_authorized_jwt_gate.mjs';
test('U68 targets QA only and checks canonical scoped RPC',()=>{
 assert.equal(REF,'gjztkdwfmunnzhtvxrsu');
 const js=readFileSync(new URL('../scripts/remote-gates/qa_u60_authorized_jwt_gate.mjs',import.meta.url),'utf8');
 assert.match(js,/iberfit_occurrence_api_u60_v1/);
 assert.match(js,/iberfit_occurrence_detail_v1/);
 assert.match(js,/M26_QA_ONLY/);
 assert.match(js,/clientA!==clientB/);
 assert.doesNotMatch(js,/pjhmrhejsoofmouedavw/);
});
test('U68 own calendar only without private/leaked raw fields',()=>{
 const valid={status:200,body:{kind:'calendar',count:0,occurrences:[]}};
 assert.equal(calendarShape(valid),true);
 assert.equal(calendarShape({status:403,body:valid.body}),false);
 assert.equal(calendarShape({status:200,body:{kind:'calendar',count:1}}),false);
 assert.equal(calendarShape({status:200,body:{...valid.body,publishedSnapshot:{}}}),false);
 assert.equal(calendarShape({status:200,body:{...valid.body,requestHash:'private'}}),false);
});
test('U68 hostile client data cannot be interpreted as denial',()=>{
 for(const status of [200,201,202,429,500,503])assert.equal(isDenied({status,body:{kind:'calendar',occurrences:[]}}),false);
 for(const status of [400,401,403,404])assert.equal(isDenied({status,body:{}}),true);
 assert.equal(isDenied({status:200,body:{kind:'rejected',reason:'CLIENT_ACCESS_DENIED'}}),true);
 assert.equal(isDenied({status:200,body:{kind:'rejected',reason:'OK'}}),false);
});
test('U68 proof never contains identities, tokens or raw health data',()=>{
 const out=evidence(['self_calendar_passed']);
 assert.equal(out.productionTouched,false);
 assert.equal(out.writeAttempted,false);
 assert.equal(out.qaOnly,true);
 assert.deepEqual(out.checks,['self_calendar_passed']);
});
