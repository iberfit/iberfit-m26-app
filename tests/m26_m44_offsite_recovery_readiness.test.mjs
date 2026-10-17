import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateM44OffsiteRecovery,
  EXPECTED_WORKFLOW_NAME,
  EXPECTED_WORKFLOW_PATH,
} from '../scripts/data-safety/check_m44_offsite_recovery_readiness.mjs';

const NOW=Date.parse('2026-10-17T01:10:00Z');
const RUN_ID=38888628869;
const SHA='48d4ae327272ab2016cd0298788aa0af8981a63a';
const job=(name,extra={})=>({
  id:extra.id||100,
  run_id:RUN_ID,
  workflow_name:EXPECTED_WORKFLOW_NAME,
  head_branch:'canary/rc74-4',
  head_sha:SHA,
  status:'completed',
  conclusion:'success',
  started_at:'2026-10-17T00:22:53Z',
  completed_at:'2026-10-17T00:24:47Z',
  name,
  steps:extra.steps||[],
});
const requiredSteps=[
  'Fail closed if protected production backup credentials are unavailable',
  'Export complete PG17 DB and all Storage object bytes to ephemeral private workspace',
  'Encrypt authenticated recovery archive before any upload',
  'Reopen ciphertext and verify restored Storage bytes in isolated workspace',
  'Publish verified encrypted archive for immediate private-drive transfer',
  'Remove all temporary plaintext and ciphertext from runner',
].map((name)=>({name,status:'completed',conclusion:'success'}));

function fixture(){
  return {
    run:{
      id:RUN_ID,name:EXPECTED_WORKFLOW_NAME,path:EXPECTED_WORKFLOW_PATH,event:'push',
      status:'completed',conclusion:'success',head_branch:'canary/rc74-4',head_sha:SHA,
      run_attempt:2,created_at:'2026-10-16T10:39:07Z',updated_at:'2026-10-17T00:24:48Z',
    },
    jobs:{jobs:[
      job('m44-encrypted-archive-and-storage-contract',{id:101}),
      job('m44-synthetic-postgresql17-restore-proof',{id:102}),
      job('m44-prod-db-storage-encrypted-backup-and-restore',{id:103,steps:requiredSteps}),
    ]},
    artifacts:{artifacts:[{
      id:12083431361,
      name:'iberfit-prod-ciphertext-'+RUN_ID,
      size_in_bytes:32143146,
      expired:false,
      created_at:'2026-10-17T00:24:44Z',
      expires_at:'2026-10-18T00:24:42Z',
      digest:'sha256:10b94c374291e593423cd3f5a9eacbc191a0f05427fb6d6db6a817ba322ec589',
      workflow_run:{id:RUN_ID,head_branch:'canary/rc74-4',head_sha:SHA},
    }]},
  };
}

test('accepts a fresh restore-tested encrypted PROD DB+Storage recovery proof',()=>{
  const x=fixture();
  const result=evaluateM44OffsiteRecovery(x.run,x.jobs,x.artifacts,{nowMs:NOW});
  assert.equal(result.ok,true);
  assert.equal(result.restoreTestVerified,true);
  assert.equal(result.productionMigrationApproved,true);
  assert.equal(result.platformRecoveryVerified,false);
  assert.equal(result.recoveryAuthority,'INDEPENDENT_ENCRYPTED_DB_STORAGE_RESTORE');
  assert.equal(result.artifactBytes,32143146);
});

test('rejects stale or future offsite evidence',()=>{
  const stale=fixture();
  assert.throws(
    ()=>evaluateM44OffsiteRecovery(stale.run,stale.jobs,stale.artifacts,{nowMs:Date.parse('2026-10-17T03:00:00Z')}),
    /M44_OFFSITE_RUN_TOO_OLD|M44_OFFSITE_PROD_JOB_TOO_OLD|M44_OFFSITE_ARTIFACT_TOO_OLD/,
  );
  const future=fixture();
  future.run.updated_at='2026-10-17T03:00:00Z';
  assert.throws(
    ()=>evaluateM44OffsiteRecovery(future.run,future.jobs,future.artifacts,{nowMs:NOW}),
    /M44_OFFSITE_RUN_TIMESTAMP_IN_FUTURE/,
  );
});

test('rejects wrong workflow branch event or failed run',()=>{
  for(const mutate of [
    (x)=>{x.run.name='Other';},
    (x)=>{x.run.path='.github/workflows/other.yml';},
    (x)=>{x.run.head_branch='main';},
    (x)=>{x.run.event='pull_request';},
    (x)=>{x.run.conclusion='failure';},
  ]){
    const x=fixture();mutate(x);
    assert.throws(()=>evaluateM44OffsiteRecovery(x.run,x.jobs,x.artifacts,{nowMs:NOW}));
  }
});

test('rejects any missing failed or mismatched required job/restore step',()=>{
  const missingJob=fixture();
  missingJob.jobs.jobs=missingJob.jobs.jobs.slice(1);
  assert.throws(()=>evaluateM44OffsiteRecovery(missingJob.run,missingJob.jobs,missingJob.artifacts,{nowMs:NOW}),/REQUIRED_JOB/);

  const failedStep=fixture();
  const prod=failedStep.jobs.jobs.find((x)=>x.name==='m44-prod-db-storage-encrypted-backup-and-restore');
  prod.steps[3]={...prod.steps[3],conclusion:'failure'};
  assert.throws(()=>evaluateM44OffsiteRecovery(failedStep.run,failedStep.jobs,failedStep.artifacts,{nowMs:NOW}),/REQUIRED_STEP/);

  const wrongSha=fixture();
  wrongSha.jobs.jobs[0].head_sha='0'.repeat(40);
  assert.throws(()=>evaluateM44OffsiteRecovery(wrongSha.run,wrongSha.jobs,wrongSha.artifacts,{nowMs:NOW}),/JOB_SHA_MISMATCH/);
});

test('rejects expired malformed implausible or wrong-run ciphertext artifacts',()=>{
  const cases=[
    (x)=>{x.artifacts.artifacts[0].expired=true;},
    (x)=>{x.artifacts.artifacts[0].digest='sha256:bad';},
    (x)=>{x.artifacts.artifacts[0].size_in_bytes=42;},
    (x)=>{x.artifacts.artifacts[0].workflow_run.id=999;},
    (x)=>{x.artifacts.artifacts[0].expires_at='2026-10-17T01:00:00Z';},
  ];
  for(const mutate of cases){
    const x=fixture();mutate(x);
    assert.throws(()=>evaluateM44OffsiteRecovery(x.run,x.jobs,x.artifacts,{nowMs:NOW}));
  }
});

test('selects newest same-name artifact from rerun and requires it to match the fresh production job',()=>{
  const x=fixture();
  x.artifacts.artifacts.push({
    ...x.artifacts.artifacts[0],
    id:12040723726,
    created_at:'2026-10-16T10:42:53Z',
    expires_at:'2026-10-17T10:42:50Z',
    digest:'sha256:3fd6a9aff8beda8342973da357824d04b3f6ef6508ba381d2495cea25a7d18bd',
  });
  const result=evaluateM44OffsiteRecovery(x.run,x.jobs,x.artifacts,{nowMs:NOW});
  assert.equal(result.artifactId,12083431361);
});
