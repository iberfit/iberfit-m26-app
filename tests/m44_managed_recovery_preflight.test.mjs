import test from 'node:test';
import assert from 'node:assert/strict';
import {certifyManagedRecoveryArchive as certify} from '../scripts/ops/m44_managed_recovery_preflight.mjs';
// Historical metadata fixture only; no credentials, personal records or traffic.
const fixture={
  "pin": {
    "sourceSha": "9076875af47d78284273e495dbd7fb227dbb5865",
    "digest": "cc454d92065cd88bb51df5742bdc70e1f2431dabd3ab433d0b3cd97b72d07faf",
    "runId": 46009568949,
    "artifactId": 15204490077,
    "bytes": 36015046
  },
  "run": {
    "id": 46009568949,
    "head_sha": "9076875af47d78284273e495dbd7fb227dbb5865",
    "head_branch": "canary/rc74-4",
    "path": ".github/workflows/m44-encrypted-disaster-recovery.yml",
    "event": "workflow_dispatch",
    "status": "completed",
    "conclusion": "success",
    "created_at": "2026-11-27T13:43:31Z",
    "updated_at": "2026-11-27T13:47:52Z"
  },
  "artifact": {
    "id": 15204490077,
    "name": "iberfit-prod-ciphertext-46009568949",
    "expired": false,
    "digest": "sha256:cc454d92065cd88bb51df5742bdc70e1f2431dabd3ab433d0b3cd97b72d07faf",
    "size_in_bytes": 36015046,
    "created_at": "2026-11-27T13:47:47Z",
    "expires_at": "2026-11-28T13:47:45Z",
    "workflow_run": {
      "id": 46009568949,
      "head_sha": "9076875af47d78284273e495dbd7fb227dbb5865",
      "head_branch": "canary/rc74-4"
    }
  },
  "nowMs": 1795789800000
};
test('exact archive metadata never confers restore or promotion authorization',()=>{const r=certify(fixture);assert.equal(r.metadataVerified,true);for(const k of ['ciphertextBytesVerified','archiveDecrypted','managedRecoveryVerified','platformRecoveryVerified','productionAuthorized'])assert.equal(r[k],false);});
const negatives=[
 ['PIN_INVALID',x=>x.pin.digest='x'],
 ['RUN_MISMATCH',x=>x.run.conclusion='failure'],
 ['RUN_MISMATCH',x=>x.run.head_sha='b'.repeat(40)],
 ['RUN_MISMATCH',x=>x.run.event='pull_request'],
 ['ARTIFACT_MISMATCH',x=>x.artifact.expired=true],
 ['ARTIFACT_MISMATCH',x=>x.artifact.digest='sha256:'+'0'.repeat(64)],
 ['ARTIFACT_MISMATCH',x=>x.artifact.size_in_bytes++],
 ['ARTIFACT_MISMATCH',x=>x.artifact.workflow_run.id=1],
 ['BACKUP_STALE',x=>x.nowMs=Date.parse('2026-11-27T16:00:00Z')],
 ['TIMELINE_INVALID',x=>x.artifact.created_at='2026-11-27T14:00:00Z'],
 ['ARTIFACT_EXPIRING',x=>x.artifact.expires_at='2026-11-27T14:35:00Z']
];
for(const [expected,mutate] of negatives)test(expected,()=>{const x=structuredClone(fixture);mutate(x);assert.throws(()=>certify(x),error=>error.message==='M44_MANAGED_PREFLIGHT_'+expected);});
