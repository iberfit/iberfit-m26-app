import test from 'node:test';
import assert from 'node:assert/strict';
import {
 composeM1AutonomousBackendCutover,loadM1AutonomousBundleSources,
 M1_AUTONOMOUS_FUNCTION_MD5,
} from '../scripts/release/m1_autonomous_atomic_backend_bundle.mjs';

test('M1 bundles U72, secured autonomous overlay and U60 public admission as ONE atomic transaction',()=>{
 const bundle=composeM1AutonomousBackendCutover(loadM1AutonomousBundleSources());
 assert.equal(bundle.schema,'iberfit.m1.autonomous.atomic-cutover.v1');
 assert.equal(bundle.databaseWrites,0);
 assert.equal(bundle.productionAuthorized,false);
 assert.equal(bundle.fullPlatformRecoveryCertified,false);
 assert.equal((bundle.install.match(/^BEGIN;$/gmu)||[]).length,1);
 assert.equal((bundle.install.match(/^COMMIT;$/gmu)||[]).length,1);
 assert.equal((bundle.install.match(/^GRANT EXECUTE ON FUNCTION public\.iberfit_occurrence_api_u60_v1/gmu)||[]).length,1);
 const a=bundle.install.indexOf('CREATE OR REPLACE FUNCTION private.iberfit_u72_occurrence_pause_resume_v1');
 const b=bundle.install.indexOf('IBERFIT_M1_AUTONOMOUS_DATES_V1');
 const c=bundle.install.indexOf('M1_AUTONOMOUS_RELEASE_U31_HASH_DRIFT');
 const d=bundle.install.indexOf('GRANT EXECUTE ON FUNCTION public.iberfit_occurrence_api_u60_v1');
 assert.ok(a>0&&b>a&&c>b&&d>c,'one-way U72 -> overlay -> exact hash -> grant order');
 for(const hash of Object.values(M1_AUTONOMOUS_FUNCTION_MD5))
  assert.ok(bundle.install.includes(hash),'every expected private-function hash must be checked');
 assert.match(bundle.install,/M1_AUTONOMOUS_PROD_MUST_BE_CLOSED/u);
 assert.match(bundle.install,/M1_U72_PROD_MUST_BE_CLOSED_AND_DRAINED/u);
 assert.match(bundle.install,/SET LOCAL lock_timeout='3s'/u);
});

test('M1 rollback reverses public admission, overlay and U72 without losing execution history',()=>{
 const {rollback}=composeM1AutonomousBackendCutover(loadM1AutonomousBundleSources());
 assert.equal((rollback.match(/^BEGIN;$/gmu)||[]).length,1);
 assert.equal((rollback.match(/^COMMIT;$/gmu)||[]).length,1);
 const disable=rollback.indexOf('U60_ROLLBACK_ACTIVE_TRAINING_FORBIDDEN');
 const undo=rollback.indexOf('M1_AUTONOMOUS_ROLLBACK_FIRST_CLOSE_U60');
 const u72=rollback.indexOf('M1_U72_PROD_ROLLBACK_UNSAFE_OR_DRIFT');
 assert.ok(disable>0&&undo>disable&&u72>undo,
   'rollback refuses active training before restoring U31/U33/U60, then U72');
 for(const fn of ['iberfit_u31_occurrence_transition_v1',
   'iberfit_u33_occurrence_calendar_v1','iberfit_u60_occurrence_detail_v1'])
  assert.match(rollback,new RegExp('CREATE OR REPLACE FUNCTION private\\.'+fn,'u'));
 assert.doesNotMatch(rollback,/DELETE FROM public\.training_session_occurrences_v1/iu);
 assert.doesNotMatch(rollback,/TRUNCATE public\.training_session_occurrences_v1/iu);
});

test('M1 composer fails closed on modified or missing source guard without touching PROD',()=>{
 const originals=loadM1AutonomousBundleSources();
 for(const [field,needle] of [
  ['u72','M1_U72_PROD_MUST_BE_CLOSED_AND_DRAINED'],
  ['autonomous','M1_AUTONOMOUS_PRIVATE_ACL_DRIFT'],
  ['enable','U60_PROD_RLS_EXECUTION_FENCE_DRIFT'],
  ['disable','U60_ROLLBACK_ACTIVE_TRAINING_FORBIDDEN'],
  ['autonomousRollback','M1_AUTONOMOUS_ROLLBACK_FIRST_CLOSE_U60'],
  ['u72Rollback','M1_U72_PROD_ROLLBACK_UNSAFE_OR_DRIFT'],
 ]){
  const corrupt={...originals,[field]:originals[field].replace(needle,'guard_removed')};
  assert.throws(()=>composeM1AutonomousBackendCutover(corrupt),/M1_BUNDLE_/u,field);
 }
 assert.throws(()=>composeM1AutonomousBackendCutover({...originals,
  enable:originals.enable.replace(/^COMMIT;$/mu,'')}),/TRANSACTION_CONTRACT/u);
 assert.throws(()=>composeM1AutonomousBackendCutover({...originals,
  enable:originals.enable+'\nCOMMIT;\n'}),/TRANSACTION_CONTRACT/u);
});


test('M1 autonomous cutover requests fresh M44 PROD ciphertext restore only after protected Canary merge',()=>{
 const wf=readFileSync('.github/workflows/m44-encrypted-disaster-recovery.yml','utf8');
 const push=wf.slice(wf.indexOf('  push:\\n'),wf.indexOf('  workflow_dispatch:'));
 for(const path of ['20261121_m1_autonomous_dates_guarded_overlay_v1.sql',
   '20261121_m1_autonomous_dates_guarded_overlay_v1.rollback.sql'])
  assert.ok(push.includes(path),'M44 missing protected postmerge trigger '+path);
 assert.match(wf,/branches: \['canary\/rc74-4'\]/u);
 assert.match(wf,/if: github\.event_name != 'pull_request'/u);
 assert.match(wf,/M44_FULL_PLATFORM_RECOVERY_NOT_CERTIFIED/u);
});
