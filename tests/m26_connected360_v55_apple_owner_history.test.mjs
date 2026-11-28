import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connected360AppleActivityPage,connected360ActivityPage} from '../src/m26/wearables/v46-production-summary.js';
const now=new Date('2026-11-28T14:00:00Z');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const row={id:id(1),sport:'swimming',startedAt:'2026-11-28T10:00:00.123456Z',endedAt:'2026-11-28T11:00:00.123456Z',activeSeconds:3000,distanceMeters:1500,authorizationState:'current',linkedToTraining:false};
const page={ok:true,schema:'iberfit.connected360.apple.activity-page.v1',provider:'apple_health',exerciseEvidence:[row],nextCursor:null};
test('Apple owner history distinguishes active from total pace and preserves retained provenance',()=>{
 const a=connected360AppleActivityPage(page,{now}).rows[0];
 assert.equal(a.measurements.activePaceSecondsPer100m,200);
 assert.equal(a.measurements.activeSeconds,3000);
 assert.equal(a.measurements.elapsedSeconds,3600);
 assert.equal(a.provider,'apple_health');
 assert.equal(connected360AppleActivityPage({...page,exerciseEvidence:[{...row,authorizationState:'retained',distanceMeters:null}]},{now}).rows[0].measurements.activePaceSecondsPer100m,null);
 assert.throws(()=>connected360ActivityPage(page,{now}));
});
test('Apple owner reader rejects fields outside minimal contract or bad duration',()=>{
 for(const v of [{...row,avgBpm:140},{...row,source_record_key:'a'.repeat(64)},{...row,linkedToTraining:true},{...row,authorizationState:'unknown'},{...row,activeSeconds:4000},{...row,distanceMeters:'1500'},{...row,endedAt:'2026-11-31T11:00:00.123456Z'}])
  assert.throws(()=>connected360AppleActivityPage({...page,exerciseEvidence:[v]},{now}));
});
test('keyset pagination keeps exact microseconds and rejects order, duplicates and bogus next cursor',()=>{
 const rows=Array.from({length:20},(_,i)=>({...row,id:id(20-i)}));
 const last=rows.at(-1),nextCursor={id:last.id,startedAt:last.startedAt};
 const result=connected360AppleActivityPage({...page,exerciseEvidence:rows,nextCursor},{now});
 assert.deepEqual(result.nextCursor,nextCursor);
 assert.throws(()=>connected360AppleActivityPage({...page,exerciseEvidence:rows.slice().reverse()},{now}));
 assert.throws(()=>connected360AppleActivityPage({...page,exerciseEvidence:[row,row]},{now}));
 assert.throws(()=>connected360AppleActivityPage({...page,nextCursor},{now}));
 assert.throws(()=>connected360AppleActivityPage(page,{now,cursor:nextCursor}));
 const earlier={...row,id:id(30),startedAt:'2026-11-28T10:00:00.123455Z'};
 assert.equal(connected360AppleActivityPage({...page,exerciseEvidence:[earlier]},{now,cursor:nextCursor}).rows.length,1);
});
test('candidate owner SQL reuses privacy fence, has no professional access or data mutation',()=>{
 const s=readFileSync(new URL('../supabase/release-procedures/connected360_v55_apple_owner_history_v1.sql',import.meta.url),'utf8');
 const r=readFileSync(new URL('../supabase/release-procedures/connected360_v55_apple_owner_history_v1.rollback.sql',import.meta.url),'utf8');
 for(const pattern of [/private\.m26_v53_apple_exercise_status\(\)/u,/w\.owner_user_id=v_owner AND w\.client_id=v_client AND w\.provider='apple_health'/u,/w\.revocation_cursor=\(v_status->>'revocationCursor'\)::bigint/u,/LIMIT 21/u,/LIMIT 20/u,/'current' ELSE 'retained'/u,/SECURITY INVOKER SET search_path TO ''/u])assert.match(s,pattern);
 assert.doesNotMatch(s,/\bINSERT INTO\b|\bDELETE FROM\b|\bUPDATE public\b|heart_rate|source_record_key|CREATE TABLE/u);
 assert.doesNotMatch(r,/\bDELETE FROM\b|DROP TABLE|TRUNCATE/u);
});

test('Apple history preserves missing active duration without fabricating active pace or rejecting other rows',()=>{
 const a=connected360AppleActivityPage({...page,exerciseEvidence:[{...row,activeSeconds:null}]},{now}).rows[0];
 assert.equal(a.measurements.activeSeconds,null);assert.equal(a.measurements.activePaceSecondsPer100m,null);
 assert.equal(a.measurements.elapsedSeconds,3600);
 assert.ok(!a.dayDetail.includes('Duración activa'));assert.ok(!a.dayDetail.includes('Ritmo activo'));
 for(const activeSeconds of [0,-1,'3000',undefined])assert.throws(()=>connected360AppleActivityPage({...page,exerciseEvidence:[{...row,activeSeconds}]},{now}));
});
