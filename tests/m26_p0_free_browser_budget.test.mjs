import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyQaFreeBrowserWireBudget,QA_FREE_BOOTSTRAP_BUDGET} from '../qa/rc64/qa-supabase-wire-meter.mjs';

const device=(bootstrap)=>({
 schema:'iberfit.qa.supabase.browser-wire.v1',
 metric:'playwright.responseBodySize',billableEgressVerified:false,
 extraSupabaseRequests:0,invalidMeasurements:0,
 requests:bootstrap+20,responseBodyBytes:bootstrap*300_000+100_000,
 byCategory:{bootstrap:{requests:bootstrap,responseBodyBytes:bootstrap*300_000}},
});
const report=(mobile,desktop)=>({
 schema:'iberfit.qa.supabase.browser-wire-report.v1',
 synthetic:true,productionTouched:false,billableEgressVerified:false,
 mobile:device(mobile),desktop:device(desktop),
});

test('free QA real browser budget verifies measured 7/5 and tolerates a small real-workflow margin',()=>{
 assert.deepEqual(QA_FREE_BOOTSTRAP_BUDGET,{mobile:8,desktop:6,total:14});
 const proof=verifyQaFreeBrowserWireBudget(report(7,5));
 assert.equal(proof.verified,true);
 assert.deepEqual(proof.counts,{mobile:7,desktop:5,total:12});
 assert.equal(verifyQaFreeBrowserWireBudget(report(8,6)).verified,true);
});
test('regression to prior 11 mobile and 7 desktop bootstraps fails closed',()=>{
 for(const [a,b,part] of [[11,5,'mobile'],[7,7,'desktop'],[9,7,'mobile']]){
  assert.throws(()=>verifyQaFreeBrowserWireBudget(report(a,b)),
    new RegExp('M43_QA_FREE_BOOTSTRAP_REGRESSION:'+part));
 }
});
test('invalid or incomplete wire evidence never satisfies the saving gate',()=>{
 const valid=report(7,5);
 for(const invalid of [
   {...valid,productionTouched:true},
   {...valid,billableEgressVerified:true},
   {...valid,mobile:{...valid.mobile,invalidMeasurements:1}},
   {...valid,desktop:{...valid.desktop,extraSupabaseRequests:1}},
   {...valid,mobile:{...valid.mobile,byCategory:{}}},
   {...valid,desktop:{...valid.desktop,responseBodyBytes:0}},
 ])assert.throws(()=>verifyQaFreeBrowserWireBudget(invalid),/M43_QA_FREE_/u);
});
test('other real QA fixture cannot receive A-only saving certification',()=>{
 const skip=verifyQaFreeBrowserWireBudget(report(11,7),{fixture:'B'});
 assert.equal(skip.verified,false);
 assert.equal(skip.reason,'qa-b-not-in-rollout');
 assert.throws(()=>verifyQaFreeBrowserWireBudget(report(7,5),{fixture:'C'}),
  /M43_QA_FREE_FIXTURE_INVALID/u);
});
test('reason diagnostics are synthetic QA-only, fixed vocabulary and passive',()=>{
 const app=readFileSync('src/m26/app/application.js','utf8');
 const spec=readFileSync('qa/rc64/m43-client-interactive.spec.mjs','utf8');
 assert.match(app,/runtime\.qaOnly===true&&runtime\.canary===true/u);
 assert.match(app,/freeClientProgressAckDeferredQa===true/u);
 assert.match(app,/qa\.rc74\.client-a@iberfit\.cl/u);
 assert.match(app,/qaStage\('rc64-hydrate-reason-'\+category\)/u);
 assert.match(spec,/observeQaHydrationReasons\(page\)/u);
 assert.match(spec,/observeQaHydrationReasons\(desktopPage\)/u);
 assert.match(spec,/verifyQaFreeBrowserWireBudget\(baseWireEvidence,\{fixture:OWNER_FIXTURE\}\)/u);
 assert.doesNotMatch(spec,/localStorage\.setItem\(['"]hydrationReasons/u);
});
