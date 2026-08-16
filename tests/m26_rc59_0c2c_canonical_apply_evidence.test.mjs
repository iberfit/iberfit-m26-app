import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

const evidence=read(
  'docs/RC59_0C2C_CANONICAL_TELEMETRY_APPLY_EVIDENCE.md'
);
const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');

test('RC59.0C2C canonical apply queda documentado',()=>{
  assert.match(
    evidence,
    /RC59_0C2C_CANONICAL_TELEMETRY_APPLY=PASS/u
  );
  assert.match(evidence,/V59_EXPECTED_OBJECTS=9/u);
  assert.match(evidence,/V59_PRESENT_OBJECTS=9/u);
  assert.match(evidence,/V59_ABSENT_OBJECTS=0/u);
  assert.match(evidence,/ROLLBACK_REQUIRED=FALSE/u);
  assert.match(evidence,/REPEAT_APPLY_REQUIRED=FALSE/u);
});

test('RC59.0C2C registra seguridad remota observada',()=>{
  for(const token of [
    'RAW_TABLE_FORCE_RLS=PASS',
    'BATCH_TABLE_FORCE_RLS=PASS',
    'DIRECT_TABLE_PRIVILEGES_AUTHENTICATED=FALSE',
    'ADMIN_ROLE_ALONE_RAW_ACCESS=FALSE',
    'GLOBAL_IS_ASSIGNED_COACH_REUSED_FOR_TELEMETRY=FALSE',
    'PURGE_RPC_NOT_EXPOSED=PASS',
  ]){
    assert.match(evidence,new RegExp(token,'u'));
  }
});

test('RC59.0C2C registra contrato remoto C2B',()=>{
  for(const token of [
    'TIMESTAMP_TYPED_EQUALITY=PASS',
    'RECEIVED_AT_INVARIANT=PASS',
    'RETENTION_CLOCK=INGESTION_TIME',
    'INTRA_BATCH_EVENT_ID_UNIQUENESS=PASS',
    'ACK_GRANULARITY=PER_EVENT',
    'INDEX_CONTRACT=PASS',
  ]){
    assert.match(evidence,new RegExp(token,'u'));
  }
});

test('RC59.0 conserva cierre autenticado del upload remoto tras C2C',()=>{
  assert.match(roadmap,/RC59_0C2C=CANONICAL_APPLIED/u);
  assert.match(
    roadmap,
    /RC59_0C3=CLOSED_AUTHENTICATED_RUNTIME_SMOKE/u
  );
  assert.match(
    roadmap,
    /RC59_0=CLOSED_RC59_0C3_REMOTE_OUTBOX_UPLOAD/u
  );
  assert.match(
    evidence,
    /NEXT_PRODUCT_ACTION=RC59_0C3_REMOTE_OUTBOX_UPLOAD_RUNTIME/u
  );
});