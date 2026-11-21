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
const catalogValid=(list,count)=>Array.isArray(list)&&isCount(count)&&count>0&&list.length===count
  &&list.every(item=>typeof item==='string'&&item.trim()===item&&item.length>5)
  &&new Set(list).size===count;
const exactCoverage=(refs,declared)=>Array.isArray(refs)&&Array.isArray(declared)
  &&refs.length===declared.length
  &&new Set(refs.map(ref=>ref?.relation)).size===declared.length
  &&refs.every(ref=>declared.includes(ref?.relation));
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
  if(protectedPerson.excludedFromDeletion!==true)add('PROTECTED_SCOPE_NOT_EXCLUDED');

  const catalog=isRecord(evidence.catalog)?evidence.catalog:{};
  const clientRelations=catalog.clientIdRelations;
  const authRelations=catalog.authUserForeignKeyRelations;
  if(!catalogValid(clientRelations,catalog.clientIdColumns)
    ||!catalogValid(authRelations,catalog.authUserForeignKeys))
    add('CATALOG_ITEMS_NOT_COMPLETE');
  const targets=Array.isArray(evidence.targets)?evidence.targets:[];
  if(targets.length!==2)add('TARGET_COUNT_INVALID');
  const ids=new Set();
  const authIds=new Set();
  for(let i=0;i<targets.length;i++){
    const t=targets[i];
    if(!isRecord(t)){add('TARGET_RECORD_INVALID');continue;}
    if(!validId(t.clientId)||ids.has(String(t.clientId).toLowerCase())||String(t.clientId).toLowerCase()===String(protectedPerson.clientId).toLowerCase())add('TARGET_IDENTITY_COLLISION');
    else ids.add(t.clientId.toLowerCase());
    if(t.exactIdentityConfirmed!==true||t.originalUserAuthorizationVerified!==true||t.identityAmbiguityResolved!==true)
      add('TARGET_IDENTITY_NOT_CONFIRMED');
    if(t.professionalAccount!==false||t.adminRole!==false||t.coachRole!==false)add('PRIVILEGED_ACCOUNT_PROTECTED');
    if(!validId(t.authUserId)||authIds.has(String(t.authUserId).toLowerCase()))add('AUTH_IDENTITY_NOT_UNIQUE');
    else authIds.add(t.authUserId.toLowerCase());
    if(!isCount(t.activeSessions)||t.activeSessions!==0||t.sessionRevocationIndependentlyVerified!==true)
      add('AUTH_SESSIONS_NOT_REVOKED');
    if(t.authDeletionSupported!==true||t.authForeignKeysReviewed!==true)add('AUTH_DELETION_NOT_PROVEN');
    if(!isCount(t.pendingOperations)||t.pendingOperations!==0||t.writeFenceVerified!==true)add('IN_FLIGHT_WRITES_NOT_FENCED');
    if(t.legalHold!==false)add('LEGAL_HOLD');
    const references=Array.isArray(t.references)?t.references:[];
    const authReferences=Array.isArray(t.authReferences)?t.authReferences:[];
    if(!references.length||!authReferences.length)add('RELATION_INVENTORY_MISSING');
    if(!exactCoverage(references,clientRelations)||!exactCoverage(authReferences,authRelations))
      add('RELATION_COVERAGE_INCOMPLETE');
    for(const ref of [...references,...authReferences]){
      if(!isRecord(ref)||typeof ref.relation!=='string'||!isCount(ref.count)
        ||!['remove','anonymize','preserve_non_personal'].includes(ref.disposition)
        ||ref.reviewed!==true||ref.postcheckDefined!==true||(ref.count>0&&ref.recoveryDocumented!==true))
        add('UNRESOLVED_DATA_RELATION');
    }
    const objects=Array.isArray(t.storageObjects)?t.storageObjects:null;
    if(!objects||!isCount(t.storageObjectCountExpected)
      ||objects.length!==t.storageObjectCountExpected||t.storageApiListed!==true)
      add('STORAGE_INVENTORY_MISSING');
    else for(const object of objects){
      if(!isRecord(object)||object.ownerConfirmed!==true||object.targetScoped!==true
        ||object.protectedPersonExcluded!==true||object.recoveryDocumented!==true||object.storageApiDeletionPlanned!==true
        ||typeof object.bucket!=='string'||!object.bucket)
        add('STORAGE_OBJECT_UNVERIFIED');
    }
    if(t.storageInventoryReconciled!==true)add('STORAGE_INVENTORY_UNRECONCILED');
  }
  if(!isCount(catalog.clientIdColumns)||catalog.clientIdColumns===0
    ||!isCount(catalog.authUserForeignKeys)||catalog.authUserForeignKeys===0
    ||catalog.unreviewedClientIdColumns!==0||catalog.unreviewedAuthForeignKeys!==0
    ||catalog.schemaFingerprintVerified!==true)add('SCHEMA_COVERAGE_INCOMPLETE');

  const backup=isRecord(evidence.backup)?evidence.backup:{};
  const backupAge=nowMs-cleanDate(backup.completedAt);
  if(!Number.isFinite(backupAge)||backupAge<0||backupAge>MAX_BACKUP_AGE_MS
    ||backup.postgres?.restoreVerified!==true||backup.storage?.restoreVerified!==true
    ||backup.hostedAuth?.restoreVerified!==true||backup.offsiteVerified!==true
    ||backup.rollbackDrillVerified!==true)add('RECOVERY_NOT_CERTIFIED');

  const assurance=isRecord(evidence.assurance)?evidence.assurance:{};
  if(assurance.adminVerified!==true||assurance.privilegedWebAuthnVerified!==true||assurance.orgScopeVerified!==true)
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
  let evidence;
  try{evidence=JSON.parse(fs.readFileSync(input,'utf8'));}
  catch{throw new Error('PERSON_ERASURE_PRIVATE_EVIDENCE_INVALID');}
  const result=evaluatePersonErasureEvidence(evidence);
  // No client ids, emails, object paths, health data or source evidence in stdout.
  process.stdout.write(JSON.stringify(result)+'\n');
  if(!result.inventoryComplete)process.exitCode=1;
}
