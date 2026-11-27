import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAtomicSql,validateMarker} from '../scripts/ops/gx350_prod_activation.mjs';
import {GX350_CANDIDATE,GX350_PREVIOUS_LIVE} from '../scripts/release/verify_gx350_preactivated.mjs';
test('atomic GX350 install and dry run preserve one transaction and catalog assertions',()=>{
 for(const dryRun of [true,false]){
  const s=buildAtomicSql({dryRun});
  assert.equal(s.split('\n').filter(x=>x==='BEGIN;').length,1);
  assert.equal(s.split('\n').filter(x=>x==='COMMIT;').length,dryRun?0:1);
  assert.equal(s.split('\n').filter(x=>x==='ROLLBACK;').length,dryRun?1:0);
  assert.equal(s.split('GX350_CATALOG_TRANSACTION_DRIFT').length-1,dryRun?3:2);
 }
});
test('marker rejects non-GX release, wrong previous SHA, branch, diff or parent',()=>{
 const m={schema:'iberfit.production.release.v1',promote:true,target:'iberfit-m26-production',domain:'app.iberfit.cl',frontendOnly:true,sourceBranch:'canary/rc74-4',sourceSha:GX350_CANDIDATE,expectedPreviousLiveSha:GX350_PREVIOUS_LIVE,datedTrainingMode:'active',backendActivationProof:'verified-dated-sql-edge',gx350BackendActivation:true};
 const b='release/prod-'+GX350_CANDIDATE.slice(0,12),h='a'.repeat(40),p=GX350_CANDIDATE,paths=['.iberfit/production-release.json'];
 assert.equal(validateMarker(m,b,h,p,paths),p);
 for(const patch of [{gx350BackendActivation:false},{expectedPreviousLiveSha:h},{sourceSha:h},{frontendOnly:false},{datedTrainingMode:'closed'}])assert.throws(()=>validateMarker({...m,...patch},b,h,p,paths),/MARKER_INVALID/);
 assert.throws(()=>validateMarker(m,b,h,p,[...paths,'src/m26/app.js']),/MARKER_INVALID/);
});
