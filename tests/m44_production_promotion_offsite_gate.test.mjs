import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync('.github/workflows/production-promote.yml','utf8');
const readiness=readFileSync('scripts/data-safety/check_m44_offsite_recovery_readiness.mjs','utf8');

test('production promotion accepts only the same fresh restore-tested M44 proof as data safety',()=>{
  assert.match(workflow,/permissions:\s*\n\s*contents: read\s*\n\s*actions: read/);
  assert.match(workflow,/GH_ACTIONS_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow,/GITHUB_REPOSITORY: \$\{\{ github\.repository \}\}/);
  assert.match(workflow,/M44_PROD_BACKUP_NO_RECENT_COMPLETED_SNAPSHOT/);
  assert.match(workflow,/scripts\/data-safety\/check_m44_offsite_recovery_readiness\.mjs/);
  assert.match(workflow,/actions\/workflows\/m44-encrypted-disaster-recovery\.yml\/runs/);
  assert.match(workflow,/actions\/runs\/\$run_id\/jobs\?per_page=100/);
  assert.match(workflow,/actions\/runs\/\$run_id\/artifacts\?per_page=100/);
  assert.match(workflow,/compare\/\$run_sha\.\.\.\$\{SOURCE_SHA\}/);
  assert.match(workflow,/M44_OFFSITE_RELEASE_SOURCE_NOT_DESCENDANT/);
  assert.match(workflow,/proof\.restoreTestVerified!==true/);
  assert.match(workflow,/proof\.productionMigrationApproved!==true/);
  assert.match(workflow,/proof\.platformRecoveryVerified!==false/);
  assert.doesNotMatch(workflow,/IBERFIT_M44_DRIVE_FILE_ID/);
});

test('offsite release evidence remains time-bounded and never overclaims full platform recovery',()=>{
  assert.match(readiness,/DEFAULT_MAX_OFFSITE_AGE_HOURS=2/);
  assert.match(readiness,/restoreTestVerified:true/);
  assert.match(readiness,/productionMigrationApproved:true/);
  assert.match(readiness,/platformRecoveryVerified:false/);
  assert.match(readiness,/hostedAuthVerified:false/);
  assert.match(readiness,/vaultRootKeyVerified:false/);
  assert.match(readiness,/edgeSecretsVerified:false/);
});
