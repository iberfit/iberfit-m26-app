import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePersonErasureEvidence} from '../scripts/data-safety/check_person_erasure_readiness.mjs';

const now=Date.parse('2026-11-10T23:00:00.000Z');
const id=(n)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const target=(n)=>({
  clientId:id(n),authUserId:id(n+10),exactIdentityConfirmed:true,
  originalUserAuthorizationVerified:true,identityAmbiguityResolved:true,
  professionalAccount:false,adminRole:false,coachRole:false,
  activeSessions:0,sessionRevocationIndependentlyVerified:true,
  authDeletionSupported:true,authForeignKeysReviewed:true,
  pendingOperations:0,writeFenceVerified:true,legalHold:false,
  references:[{relation:'public.sessions.client_id',count:1,disposition:'remove',
    reviewed:true,postcheckDefined:true,recoveryDocumented:true}],
  storageObjects:[{bucket:'private-synthetic',ownerConfirmed:true,targetScoped:true,
    protectedPersonExcluded:true,recoveryDocumented:true,storageApiDeletionPlanned:true}],
  storageInventoryReconciled:true,
});
const candidate=()=>({
  environment:'PRODUCTION',projectRef:'pjhmrhejsoofmouedavw',
  snapshotAt:'2026-11-10T22:59:00.000Z',
  requestedAction:'ERASE_EXACTLY_TWO_TEST_IDENTITIES',
  protectedPerson:{clientId:id(9),excludedFromDeletion:true,
    baseline:{iriCount:1,photoCount:5,externalReportCount:1,trainingServiceActive:false}},
  protectedPersonPreservationProof:true,
  targets:[target(1),target(2)],
  catalog:{clientIdColumns:72,authUserForeignKeys:135,
    unreviewedClientIdColumns:0,unreviewedAuthForeignKeys:0,schemaFingerprintVerified:true},
  backup:{completedAt:'2026-11-10T22:40:00.000Z',postgres:{restoreVerified:true},
    storage:{restoreVerified:true},hostedAuth:{restoreVerified:true},
    offsiteVerified:true,rollbackDrillVerified:true},
  assurance:{adminVerified:true,privilegedWebAuthnVerified:true,orgScopeVerified:true},
});
const check=(e)=>evaluatePersonErasureEvidence(e,{nowMs:now});

test('evidence contract can be complete but never authorizes irreversible production mutation',()=>{
  assert.deepEqual(check(candidate()),{
    inventoryComplete:true,productionMutationPermitted:false,blockers:[],
  });
});
test('fail closed for partial or wrong target scope and protected-person collision',()=>{
  const e=candidate();e.targets=[e.targets[0]];e.targets[0].clientId=e.protectedPerson.clientId;
  const r=check(e);assert.equal(r.inventoryComplete,false);
  assert.ok(r.blockers.includes('TARGET_COUNT_INVALID'));
  assert.ok(r.blockers.includes('TARGET_IDENTITY_COLLISION'));
});
test('an ambiguous identity or a privileged account cannot pass',()=>{
  const e=candidate();e.targets[1].exactIdentityConfirmed=false;e.targets[1].adminRole=true;e.targets[1].identityAmbiguityResolved=false;
  const r=check(e);assert.ok(r.blockers.includes('TARGET_IDENTITY_NOT_CONFIRMED'));
  assert.ok(r.blockers.includes('PRIVILEGED_ACCOUNT_PROTECTED'));
});
test('fence active sessions and queued writes before erasure',()=>{
  const e=candidate();e.targets[0].activeSessions=4;e.targets[0].pendingOperations=2;
  assert.ok(check(e).blockers.includes('AUTH_SESSIONS_NOT_REVOKED'));
  assert.ok(check(e).blockers.includes('IN_FLIGHT_WRITES_NOT_FENCED'));
});
test('catalog drift, unexplained audit history and undeclared Storage block completion',()=>{
  const e=candidate();e.catalog.unreviewedClientIdColumns=1;
  e.targets[0].references.push({relation:'public.audit_events',count:334,disposition:'unresolved'});
  e.targets[1].storageObjects[0].targetScoped=false;
  const r=check(e);
  assert.ok(r.blockers.includes('SCHEMA_COVERAGE_INCOMPLETE'));
  assert.ok(r.blockers.includes('UNRESOLVED_DATA_RELATION'));
  assert.ok(r.blockers.includes('STORAGE_OBJECT_UNVERIFIED'));
});
test('DB+Storage backup without restorable Hosted Auth is not enough',()=>{
  const e=candidate();e.backup.hostedAuth.restoreVerified=false;
  assert.ok(check(e).blockers.includes('RECOVERY_NOT_CERTIFIED'));
});
test('outdated evidence, no MFA, or unproved protected baseline blocks',()=>{
  const e=candidate();e.snapshotAt='2026-11-10T21:30:00.000Z';
  e.assurance.privilegedWebAuthnVerified=false;
  e.protectedPersonPreservationProof=false;
  const r=check(e);
  assert.ok(r.blockers.includes('SNAPSHOT_NOT_FRESH'));
  assert.ok(r.blockers.includes('PRIVILEGED_ASSURANCE_MISSING'));
  assert.ok(r.blockers.includes('PROTECTED_PRESERVATION_UNPROVEN'));
});
test('invalid input always fails without echoing IDs or private data',()=>{
  const r=check({targets:[{email:'secret@example.invalid',clientId:id(1)}]});
  assert.equal(r.inventoryComplete,false);
  assert.equal(r.productionMutationPermitted,false);
  assert.doesNotMatch(JSON.stringify(r),/secret|10000000-0000/u);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('backend/production/P0_PERSON_ERASURE_SCHEMA_CATALOG_READONLY.sql','utf8');
test('person erasure schema discovery is entirely read-only and contains no personal fixture',()=>{
  const executable=sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(executable,/\b(?:DELETE\s+FROM|UPDATE\s+\w|INSERT\s+INTO|TRUNCATE\s+|DROP\s+|ALTER\s+|CREATE\s+|GRANT\s+|REVOKE\s+|COPY\s+|EXECUTE\s+|CALL\s+)/iu);
  assert.doesNotMatch(sql,/juan\s+carlos|patricia|cintia|cynthia\s+catal[aá]n|@gmail|@yahoo/iu);
  for(const s of ['information_schema.columns','auth.users','storage.objects',
    'has_table_privilege','has_function_privilege','pg_get_constraintdef',
    'client_catalog_md5','auth_catalog_md5']){
    assert.ok(sql.includes(s),s);
  }
});
