// Read-only, offline evidence-contract gate. NEVER authorizes or performs production erasure.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PROD='pjhmrhejsoofmouedavw';
const MAX_SNAPSHOT_AGE_MS=15*60*1000;
const MAX_BACKUP_AGE_MS=2*60*60*1000;
const isRecord=(value)=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const isCount=(value)=>Number.isSafeInteger(value)&&value>=0;
const validId=(value)=>typeof value==='string'&&UUID.test(value);
const cleanDate=(value)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):NaN;

export function evaluatePersonErasureEvidence(evidence,{nowMs=Date.now()}={}){
  const blockers=[];
  const add=(code)=>{if(!blockers.includes(code))blockers.push(code);};
  if(!isRecord(evidence)){add('EVIDENCE_MISSING');return Object.freeze({inventoryComplete:false,productionMutationPermitted:false,blockers});}
  if(!Number.isFinite(nowMs)||nowMs<=0)add('CLOCK_INVALID');
  if(evidence.projectRef!==PROD||evidence.environment!=='PRODUCTION')add('ENVIRONMENT_MISMATCH');
  const age=nowMs-cleanDate(evidence.snapshotAt);
  if(!Number.isFinite(age)||age<0||age>MAX_SNAPSHOT_AGE_MS)add('SNAPSHOT_NOT_FRESH');
  if(evidence.requestedAction!=='ERASE_EXACTLY_TWO_TEST_IDENTITIES')add('SCOPE_MISMATCH');

  const protectedPerson=isRecord(evidence.protectedPerson)?evidence.protectedPerson:{};
  if(!validId(protectedPerson.clientId)||!isRecord(protectedPerson.baseline)
    ||!Number.isSafeInteger(protectedPerson.baseline.iriCount)||protectedPerson.baseline.iriCount<1
    ||!isCount(protectedPerson.baseline.photoCount)
    ||!isCount(protectedPerson.baseline.externalReportCount)
    ||protectedPerson.baseline.trainingServiceActive!==false)add('PROTECTED_BASELINE_MISSING');
  if(!protectedPerson.excludedFromDeletion)add('PROTECTED_SCOPE_NOT_EXCLUDED');

  const targets=Array.isArray(evidence.targets)?evidence.targets:[];
  if(targets.length!==2)add('TARGET_COUNT_INVALID');
  const ids=new Set();
  const authIds=new Set();
  for(let i=0;i<targets.length;i++){
    const t=targets[i];
    if(!isRecord(t)){add('TARGET_RECORD_INVALID');continue;}
    if(!validId(t.clientId)||ids.has(t.clientId)||t.clientId===protectedPerson.clientId)add('TARGET_IDENTITY_COLLISION');
    else ids.add(t.clientId);
    if(!t.exactIdentityConfirmed||!t.originalUserAuthorizationVerified||t.identityAmbiguityResolved)
      add('TARGET_IDENTITY_NOT_CONFIRMED');
    if(t.professionalAccount===true||t.adminRole===true||t.coachRole===true)add('PRIVILEGED_ACCOUNT_PROTECTED');
    if(!validId(t.authUserId)||authIds.has(t.authUserId))add('AUTH_IDENTITY_NOT_UNIQUE');
    else authIds.add(t.authUserId);
    if(!isCount(t.activeSessions)||t.activeSessions!==0||!t.sessionRevocationIndependentlyVerified)
      add('AUTH_SESSIONS_NOT_REVOKED');
    if(!t.authDeletionSupported||!t.authForeignKeysReviewed)add('AUTH_DELETION_NOT_PROVEN');
    if(!isCount(t.pendingOperations)||t.pendingOperations!==0||!t.writeFenceVerified)add('IN_FLIGHT_WRITES_NOT_FENCED');
    if(t.legalHold===true)add('LEGAL_HOLD');
    const references=Array.isArray(t.references)?t.references:[];
    if(!references.length)add('RELATION_INVENTORY_MISSING');
    for(const ref of references){
      if(!isRecord(ref)||typeof ref.relation!=='string'||!isCount(ref.count)
        ||!['remove','anonymize','preserve_non_personal'].includes(ref.disposition)
        ||!ref.reviewed||!ref.postcheckDefined||(ref.count>0&&!ref.recoveryDocumented))
        add('UNRESOLVED_DATA_RELATION');
    }
    const objects=Array.isArray(t.storageObjects)?t.storageObjects:null;
    if(!objects)add('STORAGE_INVENTORY_MISSING');
    else for(const object of objects){
      if(!isRecord(object)||!object.ownerConfirmed||!object.targetScoped
        ||!object.protectedPersonExcluded||!object.recoveryDocumented||!object.storageApiDeletionPlanned
        ||typeof object.bucket!=='string'||!object.bucket)
        add('STORAGE_OBJECT_UNVERIFIED');
    }
    if(!t.storageInventoryReconciled)add('STORAGE_INVENTORY_UNRECONCILED');
  }
  const catalog=isRecord(evidence.catalog)?evidence.catalog:{};
  if(!isCount(catalog.clientIdColumns)||catalog.clientIdColumns===0
    ||!isCount(catalog.authUserForeignKeys)||catalog.authUserForeignKeys===0
    ||catalog.unreviewedClientIdColumns!==0||catalog.unreviewedAuthForeignKeys!==0
    ||!catalog.schemaFingerprintVerified)add('SCHEMA_COVERAGE_INCOMPLETE');

  const backup=isRecord(evidence.backup)?evidence.backup:{};
  const backupAge=nowMs-cleanDate(backup.completedAt);
  if(!Number.isFinite(backupAge)||backupAge<0||backupAge>MAX_BACKUP_AGE_MS
    ||!backup.postgres?.restoreVerified||!backup.storage?.restoreVerified
    ||!backup.hostedAuth?.restoreVerified||!backup.offsiteVerified
    ||!backup.rollbackDrillVerified)add('RECOVERY_NOT_CERTIFIED');

  const assurance=isRecord(evidence.assurance)?evidence.assurance:{};
  if(!assurance.adminVerified||!assurance.privilegedWebAuthnVerified||!assurance.orgScopeVerified)
    add('PRIVILEGED_ASSURANCE_MISSING');
  if(evidence.protectedPersonPreservationProof!==true)
    add('PROTECTED_PRESERVATION_UNPROVEN');

  // A consistent self-declared JSON document is not an independent DB/Auth/Storage
  // attestation and MUST NEVER serve as an authorization token for mutating endpoints.
  return Object.freeze({
    inventoryComplete:blockers.length===0,
    productionMutationPermitted:false,
    blockers:Object.freeze(blockers),
  });
}

const direct=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(direct){
  const input=process.argv[2];
  if(!input)throw new Error('PERSON_ERASURE_PRIVATE_EVIDENCE_FILE_REQUIRED');
  const evidence=JSON.parse(fs.readFileSync(input,'utf8'));
  const result=evaluatePersonErasureEvidence(evidence);
  // No client ids, emails, object paths, health data or source evidence in stdout.
  process.stdout.write(JSON.stringify(result)+'\n');
  if(!result.inventoryComplete)process.exitCode=1;
}
