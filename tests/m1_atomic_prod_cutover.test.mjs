import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {M1_ATOMIC_SOURCES,stripVerifiedSqlTransaction,materializeM1AtomicProdCutover} from '../scripts/release/materialize_m1_atomic_prod_cutover.mjs';
const original=p=>readFileSync(p,'utf8');
test('Each reviewed source uses exact Git blob identity, original transaction controls',()=>{
 const sources=M1_ATOMIC_SOURCES.map(x=>({item:x,body:stripVerifiedSqlTransaction(original(x.path),x)}));
 assert.deepEqual(sources.map(x=>x.item.id),['U72_INSTALL','AUTONOMOUS_DATES','U60_ENABLE']);
 for(const {item,body} of sources){
  assert.ok(body.includes(item.proof));
  if(item.transaction){
   assert.equal(body.split('\n').filter(l=>l.trim()==='BEGIN;').length,0);
   assert.equal(body.split('\n').filter(l=>l.trim()==='COMMIT;').length,0);
  }
 }
});
test('The only production cutover script is single transaction and U72 overlay U60 ordered',()=>{
 const p=materializeM1AtomicProdCutover();
 const ls=p.sql.split('\n');
 assert.equal(ls.filter(l=>l.trim()==='BEGIN;').length,1);
 assert.equal(ls.filter(l=>l.trim()==='COMMIT;').length,1);
 assert.ok(p.sql.indexOf('STAGE U72_INSTALL')<p.sql.indexOf('STAGE AUTONOMOUS_DATES'));
 assert.ok(p.sql.indexOf('STAGE AUTONOMOUS_DATES')<p.sql.indexOf('STAGE U60_ENABLE'));
 assert.ok(p.sql.indexOf('M1_ATOMIC_FINAL_READBACK_FAILED')<p.sql.lastIndexOf('COMMIT;'));
 assert.match(p.sql,/SET LOCAL lock_timeout/);
 assert.equal(p.productionWrites,0);
 assert.equal(p.executableOnlyAfterIndependentAuthorization,true);
 assert.match(p.digest,/^[a-f0-9]{64}$/);
});
test('Any mutated source or transaction boundary is blocked instead of partially published',()=>{
 for(const item of M1_ATOMIC_SOURCES){
  assert.throws(()=>materializeM1AtomicProdCutover({readSource:path=>
   path===item.path?original(path)+'\n-- unexpected edit':original(path)}),/M1_ATOMIC_PROD_PINNED_SOURCE_DRIFT/);
  if(item.transaction)assert.throws(()=>stripVerifiedSqlTransaction(
   original(item.path).replace(/^COMMIT;$/m,'-- COMMIT removed'),item),/M1_ATOMIC_PROD_PINNED_SOURCE_DRIFT/);
 }
});
test('This is offline-only materialization, not a hidden production release',()=>{
 const s=readFileSync('scripts/release/materialize_m1_atomic_prod_cutover.mjs','utf8');
 assert.doesNotMatch(s,/supabase\.co|DATABASE_URL|SUPABASE_ACCESS_TOKEN|fetch\(/);
 const r=spawnSync(process.execPath,['scripts/release/materialize_m1_atomic_prod_cutover.mjs','--execute'],{
  env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});
 assert.equal(r.status,1);
 assert.match(r.stderr,/M1_ATOMIC_PROD_NO_EXTERNAL_ARGUMENTS/);
});

test('U72 install changes private detail before autonomous overlay preflight',()=>{
 const u72=original('supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.sql');
 const overlay=original('supabase/release-procedures/20261121_m1_autonomous_dates_guarded_overlay_v1.sql');
 const reviewed=M1_ATOMIC_SOURCES.find(x=>x.id==='AUTONOMOUS_DATES');
 // U72 first checks the closed PROD baseline, then replaces this function.
 assert.match(u72,/M1_U72_BASELINE_DETAIL_DRIFT/);
 assert.match(u72,/35862b8e4977fcf0c3d611937fe83126/);
 assert.match(u72,/M1_U72_CANDIDATE_DETAIL_DRIFT/);
 assert.match(u72,/dd1027122e0843b44529cf87dad746b5/);
 assert.equal(reviewed.blob,'97ab01d06d474fcad94d65efd751ae4b325f8f25');
 assert.match(overlay,/dd1027122e0843b44529cf87dad746b5/);
 const candidate=materializeM1AtomicProdCutover();
 assert.ok(candidate.sql.indexOf('STAGE U72_INSTALL')<candidate.sql.indexOf('STAGE AUTONOMOUS_DATES'));
 assert.equal(candidate.executableOnlyAfterIndependentAuthorization,true);
});
