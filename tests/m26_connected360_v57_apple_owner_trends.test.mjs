import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connected360AppleOwnerTrends,connected360AppleOwnerTrendParams} from '../src/m26/wearables/v46-production-summary.js';
const now=new Date('2026-11-28T14:00:00Z'),clientId='11111111-1111-4111-8111-111111111111';
const measures={observedDays:3,currentOnlyDays:1,retainedOnlyDays:1,mixedDays:1};
const payload={ok:true,schema:'iberfit.connected360.apple-owner-trends.v1',provider:'apple_health',clientId,windowDays:7,coverage:'observed-only',periods:[
 {kind:'recent',periodStart:'2026-11-21',periodEnd:'2026-11-27',...measures,disciplines:[{sport:'running',...measures}]},
 {kind:'previous',periodStart:'2026-11-14',periodEnd:'2026-11-20',observedDays:0,currentOnlyDays:0,retainedOnlyDays:0,mixedDays:0,disciplines:[]}
]};
test('owner trends compare equal finished civil windows and preserve observed-only provenance',()=>{
 const view=connected360AppleOwnerTrends(payload,{clientId,days:7,now});
 assert.equal(view.periods[0].observedDays,3);assert.equal(view.periods[0].mixedDays,1);
 assert.equal(view.periods[1].observedDays,0);assert.equal(view.coverage,'observed-only');assert.equal(view.automaticPlanChange,false);
 assert.deepEqual(connected360AppleOwnerTrendParams(365),{p_days:365});
 for(const days of [0,30,366,'7'])assert.throws(()=>connected360AppleOwnerTrendParams(days));
});
test('owner trend contract rejects cross-client, guessed complete coverage, dates and impossible counts',()=>{
 const recent=payload.periods[0];
 for(const changed of [{...payload,clientId:'22222222-2222-4222-8222-222222222222'},{...payload,coverage:'complete'},{...payload,provider:'health_connect'},{...payload,periods:[{...recent,periodEnd:'2026-11-28'},payload.periods[1]]},{...payload,periods:[{...recent,mixedDays:2},payload.periods[1]]},{...payload,periods:[{...recent,disciplines:[]},payload.periods[1]]},{...payload,periods:[{...recent,disciplines:[...recent.disciplines,...recent.disciplines]},payload.periods[1]]},{...payload,periods:[{...recent,minutes:120},payload.periods[1]]}])assert.throws(()=>connected360AppleOwnerTrends(changed,{clientId,days:7,now}));
});
test('V57 SQL is owner-only, read-only, reuses V53 fence and civil date range',()=>{
 const s=readFileSync(new URL('../supabase/release-procedures/connected360_v57_apple_owner_trends_v1.sql',import.meta.url),'utf8');
 for(const p of [/private\.m26_v53_apple_client_context\(\)/u,/private\.m26_v53_apple_exercise_status\(\)/u,/w\.owner_user_id=v_owner AND w\.client_id=v_client AND w\.provider='apple_health'/u,/GROUPING SETS/u,/p_days NOT IN \(7,28,90,365\)/u,/coverage','observed-only'/u,/SECURITY INVOKER SET search_path TO ''/u])assert.match(s,p);
 assert.doesNotMatch(s,/CREATE TABLE|CREATE INDEX|INSERT INTO|DELETE FROM|UPDATE public|source_record_key|heart_rate|distance_meters/u);
});
