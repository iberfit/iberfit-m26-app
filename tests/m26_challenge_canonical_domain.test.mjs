import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  M26_ENGAGEMENT_EXTENSION_REGISTRY,
  engagementCapabilities,
} from '../src/m26/engagement/activity-capabilities.js';
import {
  buildChallengeCreateCommand,
  buildChallengeUpdateCommand,
  buildChallengeArchiveCommand,
} from '../src/m26/engagement/command-builders.js';

const migrationPath='supabase/migrations/20260927043000_challenge_canonical_domain_v1.sql';
const migration=fs.readFileSync(migrationPath,'utf8').replace(/\r\n/g,'\n');
const CLIENT='11111111-1111-4111-8111-111111111111';
const CHALLENGE='22222222-2222-4222-8222-222222222222';

function registry(type){
  return M26_ENGAGEMENT_EXTENSION_REGISTRY.find((item)=>item.type===type);
}

test('challenge commands are canonical, professional-only and conflict sensitive',()=>{
  assert.deepEqual(
    ['RETO_CREAR','RETO_ACTUALIZAR','RETO_ARCHIVAR'].map((type)=>{
      const item=registry(type);
      return {
        type:item?.type,
        entityType:item?.entityType,
        roles:[...(item?.allowedRoles||[])],
        conflictSensitive:item?.conflictSensitive,
        enabled:item?.enabled,
      };
    }),
    [
      {type:'RETO_CREAR',entityType:'challenge',roles:['admin','coach'],conflictSensitive:true,enabled:true},
      {type:'RETO_ACTUALIZAR',entityType:'challenge',roles:['admin','coach'],conflictSensitive:true,enabled:true},
      {type:'RETO_ARCHIVAR',entityType:'challenge',roles:['admin','coach'],conflictSensitive:true,enabled:true},
    ]
  );
  assert.equal(registry('RETO_ARCHIVAR').requiresReason,true);
  assert.equal(registry('RETO_CREAR').bootstrapAllowed,false);
  assert.equal(engagementCapabilities(M26_ENGAGEMENT_EXTENSION_REGISTRY).challenges.ready,true);
});

test('challenge create builder emits a private canonical individual challenge',()=>{
  const command=buildChallengeCreateCommand({
    clientId:CLIENT,
    entityId:CHALLENGE,
    challenge:{
      type:'sessions',
      title:'Completar 8 sesiones',
      detail:'Objetivo de constancia confirmado por tu Coach.',
      target:8,
      days:28,
    },
  },{role:'coach'});

  assert.equal(command.type,'RETO_CREAR');
  assert.equal(command.entityType,'challenge');
  assert.equal(command.clientId,CLIENT);
  assert.equal(command.entityId,CHALLENGE);
  assert.equal(command.baseRevision,0);
  assert.deepEqual(command.payload.patch,{
    title:'Completar 8 sesiones',
    detail:'Objetivo de constancia confirmado por tu Coach.',
    type:'sessions',
    metricKey:'completedSessions',
    unit:'sesiones',
    days:28,
    mode:'individual',
    target:8,
    habitId:null,
    requiresDeviceOptIn:false,
    visibleToClient:true,
    socialSharing:false,
    rawHealthDataAllowed:false,
    automaticPrescriptionChanges:false,
    clinicalClassification:false,
  });
});

test('challenge builders reject unsupported metrics, Client mutation and invalid revisions',()=>{
  assert.throws(
    ()=>buildChallengeCreateCommand({
      clientId:CLIENT,
      entityId:CHALLENGE,
      challenge:{type:'steps',title:'Pasos',target:10000,days:7},
    },{role:'coach'}),
    /M26_CHALLENGE_TYPE_NOT_ENABLED_V1/u
  );

  assert.throws(
    ()=>buildChallengeCreateCommand({
      clientId:CLIENT,
      entityId:CHALLENGE,
      challenge:{type:'sessions',title:'Sesiones',target:4,days:28},
    },{role:'client'}),
    /ROLE_NOT_ALLOWED/u
  );

  assert.throws(
    ()=>buildChallengeUpdateCommand({
      clientId:CLIENT,
      challengeId:CHALLENGE,
      baseRevision:0,
      challenge:{type:'sessions',title:'Sesiones',target:4,days:28},
    },{role:'coach'}),
    /M26_CHALLENGE_REVISION_REQUIRED/u
  );

  assert.throws(
    ()=>buildChallengeArchiveCommand({
      clientId:CLIENT,
      challengeId:CHALLENGE,
      baseRevision:1,
      reason:'',
    },{role:'coach'}),
    /M26_CHALLENGE_ARCHIVE_REASON_REQUIRED/u
  );
});

test('migration reuses canonical domain infrastructure and creates no parallel challenge table',()=>{
  assert.match(migration,/domain_command_registry_v26/u);
  assert.match(migration,/domain_transitions_v26/u);
  assert.match(migration,/domain_entities_v26/u);
  assert.match(migration,/p_entity_type='challenge'/u);
  assert.match(migration,/iberfit_validate_challenge_entity_v1/u);
  assert.doesNotMatch(migration,/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?[^;]*challenge/iu);
});

test('challenge migration stays fail-closed and production-data-safety compatible',()=>{
  assert.match(migration,/iberfit_assert_challenge_canonical_v1/u);
  assert.match(migration,/M26_CHALLENGE_BASE_ENTITY_CHAIN_UNEXPECTED/u);
  assert.match(migration,/M26_CHALLENGE_TRIGGER_ALREADY_EXISTS/u);
  assert.doesNotMatch(migration,/\bdo\s+(?:language\s+\w+\s+)?\$/iu);
  assert.doesNotMatch(migration,/\bdrop\s+trigger\b/iu);
});

test('database contract blocks social/group and sensitive health data fail-closed',()=>{
  assert.match(migration,/M26_CHALLENGE_GROUP_REQUIRES_OPT_IN_DOMAIN/u);
  assert.match(migration,/socialSharing' is distinct from 'false'/u);
  assert.match(migration,/rawHealthDataAllowed' is distinct from 'false'/u);
  assert.match(migration,/automaticPrescriptionChanges' is distinct from 'false'/u);
  assert.match(migration,/clinicalClassification' is distinct from 'false'/u);
  assert.match(migration,/M26_CHALLENGE_SENSITIVE_DATA_FORBIDDEN/u);
  for(const token of ['heartRate','heart_rate','hrv','pain','diagnosis','rawTelemetry','rawHealthData']){
    assert.match(migration,new RegExp(token,'u'),token);
  }
});

test('database registry and transitions describe exactly create update archive lifecycle',()=>{
  for(const row of [
    "('RETO_CREAR','challenge','CREAR'",
    "('RETO_ACTUALIZAR','challenge','ACTUALIZAR'",
    "('RETO_ARCHIVAR','challenge','ARCHIVAR'",
    "('challenge','borrador','CREAR','activo')",
    "('challenge','activo','ACTUALIZAR','activo')",
    "('challenge','activo','ARCHIVAR','archivado')",
  ])assert.ok(migration.includes(row),row);

  assert.match(migration,/allowed_roles=array\['admin','coach'\]::text\[\]/u);
  assert.match(migration,/M26_CHALLENGE_COMMAND_REGISTRY_POSTCHECK_FAILED/u);
  assert.match(migration,/M26_CHALLENGE_TRANSITIONS_POSTCHECK_FAILED/u);
  assert.match(migration,/M26_CHALLENGE_TRIGGER_POSTCHECK_FAILED/u);
});
