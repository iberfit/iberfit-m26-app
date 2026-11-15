import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enforcePagesOnlyBoundary,BACKEND_NO_GO}
  from '../scripts/release/enforce_frontend_only_release_boundary.mjs';
import {enforceDatedTrainingReleaseMode}
  from '../scripts/verify_production_surface.mjs';

const source='71a6fc577e9f2a6d734a62ffb258b987b8e3fddd';
const prior='1b08e418d166ae502fe6bb2df83f01d0da186d35';
const fixture=()=>({schema:'iberfit.production.release.v1',
 sourceSha:source,sourceBranch:'canary/rc74-4',target:'iberfit-m26-production',
 domain:'app.iberfit.cl',promote:true,frontendOnly:true,
 expectedPreviousLiveSha:prior});
test('only explicit frontend-only manifests are accepted',()=>{
 const result=enforcePagesOnlyBoundary(fixture());
 assert.equal(result.scope,'PAGES_FRONTEND_ONLY');
 assert.equal(result.backendMutationsAuthorized,false);
 assert.equal(result.hostedAuthMutationsAuthorized,false);
 assert.equal(result.backendRecoveryCertified,false);
});
test('full, missing and false release modes fail closed',()=>{
 for(const flag of [undefined,false,null,0,'true']){
  const x=fixture();if(flag===undefined)delete x.frontendOnly;else x.frontendOnly=flag;
  assert.throws(()=>enforcePagesOnlyBoundary(x),e=>e.message===BACKEND_NO_GO);
 }
});
test('source/target/previous LIVE drift cannot be promoted',()=>{
 for(const change of [
  m=>{m.sourceSha='short';},m=>{m.sourceBranch='main';},
  m=>{m.target='iberfit-m26-canary';},m=>{m.domain='fake.invalid';},
  m=>{m.promote=false;},m=>{m.schema='invalid';},
  m=>{m.expectedPreviousLiveSha=source;},
  m=>{m.expectedPreviousLiveSha='bad';}
 ]){
  const x=fixture();change(x);assert.throws(()=>enforcePagesOnlyBoundary(x));
 }
 assert.throws(()=>enforcePagesOnlyBoundary([]));
 assert.throws(()=>enforcePagesOnlyBoundary(null));
});
test('backend guard runs BEFORE every mutating step and frontend diff gate persists',()=>{
 const w=readFileSync(new URL('../.github/workflows/production-promote.yml',import.meta.url),'utf8');
 const manifest=w.indexOf('- name: Validate release manifest and exact source');
 const guard=w.indexOf('- name: Enforce frontend-only release boundary before any backend mutation');
 const diff=w.indexOf('- name: Certify frontend-only scope against exact live PROD');
 assert.ok(manifest>=0&&guard>manifest&&diff>guard);
 assert.equal(w.split('node scripts/release/enforce_frontend_only_release_boundary.mjs').length,2);
 assert.ok(w.includes('node scripts/release/verify_frontend_only_promotion.mjs'));
 for(const label of [
  'Deploy exact IRI report broker to production',
  'Deploy and verify protected M44 evolution PDF broker to production',
  'Deploy and verify guarded exercise media broker to production',
  'Sync and verify IBERFIT Hosted Auth emails before cutover',
  'Assess or enable leaked-password protection in PROD',
  'Preview preflight on same Pages project',
  'Deploy exact certified surface to production with Wrangler'
 ]){
  assert.ok(w.indexOf('- name: '+label)>guard,label+' is not fenced');
 }
 assert.ok(w.includes('rollback_production_on_failure.mjs'));
});

test('Pages frontend-only mode remains closed even if the bundle tries to expose U60',()=>{
  const closed={datedTrainingProductionReleased:false,
    datedTrainingProductionStartsEnabled:false};
  assert.equal(enforceDatedTrainingReleaseMode(closed,'closed'),true);
  for(const mutate of [
    m=>{m.datedTrainingProductionReleased=true;},
    m=>{m.datedTrainingProductionStartsEnabled=true;},
    m=>{delete m.datedTrainingProductionReleased;},
    m=>{delete m.datedTrainingProductionStartsEnabled;},
    m=>{m.datedTrainingProductionReleased='false';},
  ]){
    const runtime={...closed};mutate(runtime);
    assert.throws(()=>enforceDatedTrainingReleaseMode(runtime,'closed'),
      /PROD_SURFACE_DATED_RELEASE_NOT_CLOSED/u);
  }
  assert.throws(()=>enforceDatedTrainingReleaseMode(closed,'active'),
    /PROD_SURFACE_DATED_MODE_NOT_AUTHORIZED/u);
  assert.throws(()=>enforceDatedTrainingReleaseMode(closed,'recovery'),
    /PROD_SURFACE_DATED_MODE_NOT_AUTHORIZED/u);
  // General-purpose existing surface verification stays backwards compatible.
  assert.equal(enforceDatedTrainingReleaseMode(closed,undefined),true);
});
test('the protected workflow pins U60 closed at build and checks preview and LIVE',()=>{
  const w=readFileSync(new URL('../.github/workflows/production-promote.yml',import.meta.url),'utf8');
  const ver=readFileSync(new URL('../scripts/verify_production_surface.mjs',import.meta.url),'utf8');
  assert.match(w,/^  M26_U60_PROD_MODE: 'closed'$/mu);
  assert.match(w,/^  M26_VERIFY_DATED_TRAINING_MODE: 'closed'$/mu);
  assert.match(w,/grep -Fq '"datedTrainingProductionReleased": false' "\$R"/u);
  assert.match(w,/grep -Fq '"datedTrainingProductionStartsEnabled": false' "\$R"/u);
  assert.match(ver,/expectedDatedTrainingMode:process\.env\.M26_VERIFY_DATED_TRAINING_MODE/u);
  assert.match(ver,/enforceDatedTrainingReleaseMode\(runtime,expectedDatedTrainingMode\)/u);
  assert.ok(w.includes('- name: Verify app.iberfit.cl exact identity and runtime read-only'));
});
