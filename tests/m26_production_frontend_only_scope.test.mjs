import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  evaluateFrontendOnlyChanges,
  verifyFrontendOnlyLiveIdentity,verifyFrozenQaArtifacts,FROZEN_QA_INERT_BLOBS,
} from '../scripts/release/verify_frontend_only_promotion.mjs';

const BASE='069ba68298dd57181a62cc88ce6c31112ac92176';
const TARGET='d7e6412abe53c8fb51d1b7e22e8180bece73670e';
const accepted=[
  'src/m26/ui/client-bottom-nav.css',
  'src/m26/onboarding/client-contextual-guide.js',
  'qa/rc64/authenticated-visual-evidence.spec.mjs',
  'tests/m26_client_dynamic_guidance_community.test.mjs',
  'docs/PRODUCTION_STATE.md',
  '.github/workflows/production-promote.yml',
  'supabase/migrations/20261017220957_p0_rc29_client_internal_events_performance_qa_v1.sql',
  'supabase/rollbacks/p0_rc29_client_internal_events_performance_v1.rollback.sql',
  'supabase/qa-migrations/20261022_u50_client_direct_publication_scope.sql',
  'supabase/qa-rollbacks/20261022_u50_client_direct_publication_scope.sql',
];

test('frontend-only candidate leaves backend untouched and explicitly tracks unapplied migrations',()=>{
  const proof=evaluateFrontendOnlyChanges({
    sourceSha:TARGET,expectedPreviousLiveSha:BASE,changedPaths:accepted,
  });
  assert.equal(proof.ok,true);
  assert.equal(proof.backendServicesDeployed,false);
  assert.equal(proof.hostedAuthMutated,false);
  assert.equal(proof.productionSqlApplied,false);
  assert.equal(proof.unappliedMigrationFileCount,4);
  assert.equal(proof.changedFileCount,accepted.length);
});

test('backend/auth changes and unknown Supabase paths always block frontend-only delivery',()=>{
  for(const path of [
    'supabase/functions/iberfit-iri-report-emission-v1/index.ts',
    'supabase/functions/iberfit-evolution-report-emission-v1/storage-recovery.js',
    'supabase/config.toml',
    'backend/production/edge-functions/iberfit-webauthn-v1/index.ts',
    'scripts/auth/sync-hosted-auth-security.mjs',
    'supabase/templates/iberfit-recovery.html',
    'supabase/qa-migrations/fake-runtime.ts',
    'supabase/qa-rollbacks/embedded-script.js',
    'supabase/qa-migrations/subfolder/unreviewed.sql',
  ]){
    assert.throws(()=>evaluateFrontendOnlyChanges({
      sourceSha:TARGET,expectedPreviousLiveSha:BASE,changedPaths:[...accepted,path],
    }),/FRONTEND_ONLY_BACKEND_CHANGED/,path);
  }
});

test('U120 exact QA source exception requires eight frozen Git blobs, never broad backend allowances',()=>{
 const qaPaths=Object.keys(FROZEN_QA_INERT_BLOBS);
 assert.equal(qaPaths.length,8);
 assert.equal(qaPaths.filter(path=>path.startsWith('supabase/functions/')).length,1);
 assert.ok(qaPaths.every(path=>
   path==='supabase/functions/iberfit-qa-webauthn-cert-broker/index.ts'
   ||/^supabase\/qa-rollouts\/2026[0-9]{10}_[a-z0-9_]+\.(?:enable|disable)\.sql$/u.test(path)));
 assert.equal(evaluateFrontendOnlyChanges({
   sourceSha:TARGET,expectedPreviousLiveSha:BASE,changedPaths:[...accepted,...qaPaths],
 }).ok,true);
 assert.deepEqual(verifyFrozenQaArtifacts({
   sourceSha:TARGET,changedPaths:qaPaths,
   blobAtSource:(sha,path)=>sha===TARGET?FROZEN_QA_INERT_BLOBS[path]:null,
 }).paths,qaPaths);
 assert.throws(()=>verifyFrozenQaArtifacts({
   sourceSha:TARGET,changedPaths:qaPaths,
 }),/FRONTEND_ONLY_QA_BLOB_READER_REQUIRED/u);
 assert.throws(()=>verifyFrozenQaArtifacts({
   sourceSha:TARGET,changedPaths:qaPaths,
   blobAtSource:()=>BASE,
 }),/FRONTEND_ONLY_QA_SOURCE_DRIFT/u);
 for(const malicious of [
  'supabase/functions/iberfit-qa-webauthn-cert-broker/other.ts',
  'supabase/functions/iberfit-webauthn-v1/index.ts',
  'supabase/qa-rollouts/20261102051000_p0_free_qa_client_body_envelope_dedup_v2.disable.sql',
  'supabase/qa-rollouts/20261103000000_unreviewed.enable.sql',
  'supabase/edge/functions.js',
  'supabase/config.toml',
 ])assert.throws(()=>evaluateFrontendOnlyChanges({
   sourceSha:TARGET,expectedPreviousLiveSha:BASE,changedPaths:[...accepted,malicious],
 }),/FRONTEND_ONLY_BACKEND_CHANGED/u,malicious);
 const source=fs.readFileSync(new URL('../scripts/release/verify_frontend_only_promotion.mjs',import.meta.url),'utf8');
 assert.match(source,/blobAtSource:\(source,path\)=>execFileSync\('git',\['rev-parse',source\+':'\+path\]/u);
 assert.match(source,/frozenQaInertArtifactsVerified:qaArtifacts\.verified/u);
});

test('fail closed on invalid SHA, empty diff or path traversal',()=>{
  for(const arg of [
    {sourceSha:'invalid',expectedPreviousLiveSha:BASE,changedPaths:accepted},
    {sourceSha:TARGET,expectedPreviousLiveSha:'invalid',changedPaths:accepted},
    {sourceSha:BASE,expectedPreviousLiveSha:BASE,changedPaths:accepted},
    {sourceSha:TARGET,expectedPreviousLiveSha:BASE,changedPaths:[]},
    {sourceSha:TARGET,expectedPreviousLiveSha:BASE,changedPaths:['../secrets']},
    {sourceSha:TARGET,expectedPreviousLiveSha:BASE,changedPaths:['src/thing\nwrong']},
  ])assert.throws(()=>evaluateFrontendOnlyChanges(arg),/FRONTEND_ONLY_/u);
});

test('source branch can proceed only against exact currently served PROD identity',()=>{
  const live={sourceSha:BASE,environment:'PRODUCTION',production:true,qaOnly:false,projectRef:'pjhmrhejsoofmouedavw'};
  assert.equal(verifyFrontendOnlyLiveIdentity(live,{
    expectedPreviousLiveSha:BASE,prodRef:'pjhmrhejsoofmouedavw',
  }),true);
  for(const mutated of [
    {sourceSha:TARGET},{environment:'QA'},{production:false},
    {qaOnly:true},{projectRef:'gjztkdwfmunnzhtvxrsu'},
  ]){
    assert.throws(()=>verifyFrontendOnlyLiveIdentity({...live,...mutated},{
      expectedPreviousLiveSha:BASE,prodRef:'pjhmrhejsoofmouedavw',
    }),/FRONTEND_ONLY_LIVE_PROD_IDENTITY_DRIFT/u);
  }
});

test('full backend promotion remains default; optional isolated frontend never mutates Edge or Hosted Auth',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/production-promote.yml',import.meta.url),'utf8');
  assert.match(workflow,/manifest\.frontendOnly!==undefined&&manifest\.frontendOnly!==true/u);
  assert.match(workflow,/RELEASE_FRONTEND_PREVIOUS_SHA_INVALID/u);
  assert.match(workflow,/RELEASE_FRONTEND_PREVIOUS_SHA_UNEXPECTED/u);
  assert.match(workflow,/FRONTEND_ONLY_RELEASE=true/u);
  assert.match(workflow,/Certify frontend-only scope against exact live PROD/u);
  assert.match(workflow,/Recheck frontend-only live PROD identity immediately before cutover/u);
  const protectedSteps=[
    'Deploy exact IRI report broker to production',
    'Deploy and verify protected M44 evolution PDF broker to production',
    'Deploy and verify guarded exercise media broker to production',
    'Assess or enable leaked-password protection in PROD',
  ];
  for(const name of protectedSteps){
    const index=workflow.indexOf('      - name: '+name);
    assert.ok(index>0,'missing backend safeguard: '+name);
    assert.match(workflow.slice(index,index+180),/if: \$\{\{ env\.FRONTEND_ONLY_RELEASE != 'true' \}\}/u,name);
  }
  assert.match(workflow,/steps\.email-otp\.outputs\.enabled == 'true' && env\.FRONTEND_ONLY_RELEASE != 'true'/u);
  assert.match(workflow,/Certify recent recoverable recovery point for M44/u);
  assert.match(workflow,/Run integral production audit read-only/u);
  assert.match(workflow,/Roll back production automatically if post-deploy certification fails/u);
  const source=fs.readFileSync(new URL('../scripts/release/verify_frontend_only_promotion.mjs',import.meta.url),'utf8');
  assert.match(source,/merge-base/);
  assert.match(source,/--is-ancestor/);
  assert.match(source,/diff','--name-only/);
  assert.match(source,/\/m26\/version\.json/);
  assert.match(source,/FRONTEND_ONLY_PROD_SCOPE_CERTIFIED/);
});

test('U52 release scope accepts exactly inert QA SQL source and never marks it applied in PROD',()=>{
  const qaSql=[
    'supabase/qa-migrations/20261022_u50_client_direct_publication_scope.sql',
    'supabase/qa-rollbacks/20261022_u50_client_direct_publication_scope.sql',
  ];
  const result=evaluateFrontendOnlyChanges({
    sourceSha:TARGET,expectedPreviousLiveSha:BASE,changedPaths:qaSql,
  });
  assert.equal(result.ok,true);
  assert.equal(result.productionSqlApplied,false);
  assert.equal(result.backendServicesDeployed,false);
  assert.equal(result.hostedAuthMutated,false);
  assert.equal(result.unappliedMigrationFileCount,qaSql.length);
});

test('U121 release verifier changes require exact-source authenticated and Device QA push gates',()=>{
 const workflows=[
  ['admin-webauthn-recurring',2],
  ['coach-webauthn-recurring',2],
  ['device-experience-gate',2],
  ['remote-gates',1],
 ];
 for(const [name,count] of workflows){
  const yaml=fs.readFileSync(new URL('../.github/workflows/'+name+'.yml',import.meta.url),'utf8');
  const marker="'scripts/release/verify_frontend_only_promotion.mjs'";
  assert.equal(yaml.split(marker).length-1,count,name+' must respond to release guard changes');
  assert.match(yaml,/\bpush:\s*\n/u,name+' must run on immutable Canary push SHA');
  assert.match(yaml,/\bworkflow_dispatch:/u,name+' must preserve explicit reruns');
  assert.match(yaml,/\bbranches:.*canary\/rc74-4/u,name+' must remain Canary scoped');
 }
 const authority=fs.readFileSync(new URL('../scripts/release/verify_source_qa_gates.mjs',import.meta.url),'utf8');
 for(const name of [
  'IBERFIT Admin WebAuthn Recurring','IBERFIT Coach WebAuthn Recurring',
  'IBERFIT Device Experience Gate','IBERFIT M26 Gates remotos de solo lectura',
 ])assert.ok(authority.includes(name),'Release gate must retain '+name);
});
