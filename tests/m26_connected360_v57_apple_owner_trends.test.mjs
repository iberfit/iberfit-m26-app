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

const ownerTrendWith=(totals,disciplines)=>({...payload,periods:[{...payload.periods[0],...totals,disciplines},payload.periods[1]]});
const counts=(currentOnlyDays,retainedOnlyDays,mixedDays)=>({observedDays:currentOnlyDays+retainedOnlyDays+mixedDays,currentOnlyDays,retainedOnlyDays,mixedDays});
const verify=p=>connected360AppleOwnerTrends(p,{clientId,days:7,now});
test('owner trends reject fabricated mixed-generation days and uncovered authorization generations',()=>{
 const cases=[
  ownerTrendWith(counts(1,1,0),[{sport:'running',...counts(0,0,1)},{sport:'cycling',...counts(1,0,0)}]),
  ownerTrendWith(counts(1,1,0),[{sport:'running',...counts(1,0,0)},{sport:'cycling',...counts(1,0,0)}]),
  ownerTrendWith(counts(1,1,0),[{sport:'running',...counts(0,1,0)},{sport:'cycling',...counts(0,1,0)}]),
  ownerTrendWith(counts(0,0,2),[{sport:'running',...counts(2,0,0)},{sport:'cycling',...counts(0,1,0)}]),
 ];
 for(const dto of cases)assert.throws(()=>verify(dto),/M26_V57_APPLE_TRENDS_INVALID/u);
});
test('owner trends accept mixed days spanning different sports without counting them twice',()=>{
 const result=verify(ownerTrendWith(counts(0,0,1),[{sport:'running',...counts(1,0,0)},{sport:'swimming',...counts(0,1,0)}]));
 assert.equal(result.periods[0].observedDays,1);assert.equal(result.periods[0].mixedDays,1);
 assert.equal(result.periods[0].disciplines[0].mixedDays,0);
});
test('owner trend authorization invariants accept every valid three-day two-discipline synthetic history',()=>{
 // Exhaustively enumerate presence flags: none, current, retained, or both.
 // The total daily state is the OR of the two sport states, as in SQL bool_or.
 const tally=states=>counts(states.filter(x=>x===1).length,states.filter(x=>x===2).length,states.filter(x=>x===3).length);
 for(let mask=0;mask<4096;mask++){
  const a=[0,1,2].map(i=>(mask>>(2*i))&3),b=[3,4,5].map(i=>(mask>>(2*i))&3);
  const overall=tally(a.map((x,i)=>x|b[i]));
  const disciplines=[{sport:'running',...tally(a)},{sport:'swimming',...tally(b)}].filter(d=>d.observedDays>0);
  assert.equal(verify(ownerTrendWith(overall,disciplines)).periods[0].observedDays,overall.observedDays);
 }
});
