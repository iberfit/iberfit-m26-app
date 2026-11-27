import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAtomicSql,validateMarker,classifyEdgeState,classifyCatalogState,verifyCanaryIdentity} from '../scripts/ops/gx350_prod_activation.mjs';
import {GX350_CANDIDATE,GX350_PREVIOUS_LIVE,verifyCandidateFiles,assertGx350ProdProof} from '../scripts/release/verify_gx350_preactivated.mjs';
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

test('resume accepts only the exact prior or candidate bundle and JWT policy',()=>{
 const f={slug:'iberfit-iri-report-emission-v1',prodVersion:4,prodBundle:'a'.repeat(64),qaBundle:'b'.repeat(64),verifyJwt:false};
 const e={slug:f.slug,status:'ACTIVE',version:5,verify_jwt:false,ezbr_sha256:f.prodBundle};
 assert.equal(classifyEdgeState([e],f),'prior');
 assert.equal(classifyEdgeState([{...e,ezbr_sha256:f.qaBundle}],f),'candidate');
 assert.throws(()=>classifyEdgeState([{...e,ezbr_sha256:'c'.repeat(64)}],f),/EDGE_STATE_UNKNOWN/);
 assert.throws(()=>classifyEdgeState([{...e,verify_jwt:true}],f),/EDGE_STATE_DRIFT/);
 assert.throws(()=>classifyEdgeState([e,e],f),/EDGE_STATE_DRIFT/);
 assert.throws(()=>classifyCatalogState([],[]),/SQL_STATE_UNKNOWN/);
});


test('Canary identity matches the actual QA version manifest and rejects mixed environments',()=>{
 const source=GX350_CANDIDATE;
 const live={sourceSha:source,sourceBranch:'canary/rc74-4',projectRef:'gjztkdwfmunnzhtvxrsu',environment:'QA',qaOnly:true,production:false};
 assert.equal(verifyCanaryIdentity(live,source),true);
 for(const patch of [{environment:'CANARY'},{environment:'PRODUCTION'},{qaOnly:false},{production:true},{projectRef:'pjhmrhejsoofmouedavw'},{sourceSha:GX350_PREVIOUS_LIVE},{sourceBranch:'main'}])assert.throws(()=>verifyCanaryIdentity({...live,...patch},source),/CANARY_LIVE_DRIFT/);
});

test('provider package prefix never substitutes for exact candidate bytes or complete inventory',()=>{
 const f={slug:'example-edge',candidate:[{name:'index.ts',blob:'ce013625030ba8dba906f756967f9e9ca394464a'},{name:'vendor/dep.js',blob:'ce013625030ba8dba906f756967f9e9ca394464a'}]};
 const good=[{name:'example-edge/index.ts',bytes:Buffer.from('hello\n')},{name:'example-edge/vendor/dep.js',bytes:Buffer.from('hello\n')}];
 assert.equal(verifyCandidateFiles(f,good),2);
 const entry='/tmp/provider/source/index.ts';
 const absolute=good.map(x=>({...x,name:'file:///tmp/provider/source/'+x.name.slice('example-edge/'.length)}));
 assert.equal(verifyCandidateFiles(f,absolute,entry),2);
 assert.throws(()=>verifyCandidateFiles(f,absolute,'/tmp/other/source/index.ts'),/FILE_PATH/);
 assert.throws(()=>verifyCandidateFiles(f,[good[0]]),/FILE_COUNT/);
 assert.throws(()=>verifyCandidateFiles(f,[good[0],good[0]]),/SOURCE_DRIFT/);
 assert.throws(()=>verifyCandidateFiles(f,[good[0],{...good[1],bytes:Buffer.from('wrong')}]),/SOURCE_DRIFT/);
 assert.throws(()=>verifyCandidateFiles(f,[good[0],{...good[1],name:'vendor/dep.js'}]),/FILE_PATH/);
 assert.throws(()=>assertGx350ProdProof([],{snapshots:[]}),/PROOF_REQUIRED/);
});
