import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

const migrationPath=
  'docs/sql/RC59_0C2_TELEMETRY_BACKEND_MIGRATION_DRAFT.sql';
const rollbackPath=
  'docs/sql/RC59_0C2_TELEMETRY_BACKEND_ROLLBACK_DRAFT.sql';
const preflightPath=
  'docs/sql/RC59_0C2_CANONICAL_PREFLIGHT_READ_ONLY.sql';

const migration=read(migrationPath);
const rollback=read(rollbackPath);
const preflight=read(preflightPath);
const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
const doc=read(
  'docs/RC59_0C2_TELEMETRY_BACKEND_MIGRATION_READ_ONLY_DESIGN.md'
);

function stripSqlComments(value){
  return value
    .replace(/--.*$/gmu,'')
    .replace(/\/\*[\s\S]*?\*\//gu,'');
}

test('RC59.0C2 drafts viven fuera de supabase migrations',()=>{
  assert.equal(
    migrationPath.startsWith('supabase/migrations/'),
    false
  );
  assert.equal(
    rollbackPath.startsWith('supabase/migrations/'),
    false
  );
  assert.match(doc,/MIGRATION_AUTO_APPLY_RISK=BLOCKED/u);
});

test('RC59.0C2 migration draft aborta antes de cualquier DDL',()=>{
  const sentinel=migration.indexOf(
    "raise exception 'RC59_0C2_DESIGN_ONLY_DO_NOT_APPLY'"
  );
  const firstCreate=migration.indexOf('create or replace function');

  assert.ok(sentinel>migration.indexOf('begin;'));
  assert.ok(firstCreate>sentinel);
  assert.match(migration,/DESIGN ONLY\. DO NOT APPLY\./u);
});

test('RC59.0C2 rollback draft tambien tiene sentinel',()=>{
  const sentinel=rollback.indexOf(
    "raise exception 'RC59_0C2_ROLLBACK_DESIGN_ONLY_DO_NOT_APPLY'"
  );
  const firstDrop=rollback.indexOf('drop function');

  assert.ok(sentinel>rollback.indexOf('begin;'));
  assert.ok(firstDrop>sentinel);
});

test('RC59.0C2 preflight es estrictamente read only',()=>{
  const sql=stripSqlComments(preflight);

  assert.doesNotMatch(
    sql,
    /\b(?:insert|update|delete|create|drop|alter|grant|revoke|truncate)\b/iu
  );
  assert.match(sql,/to_regclass\(/u);
  assert.match(sql,/to_regprocedure\(/u);
  assert.match(sql,/pg_get_functiondef/u);
  assert.match(sql,/pg_catalog\.pg_policies/u);
});

test('RC59.0C2 raw table preserva evento y unicidad idempotente',()=>{
  assert.match(
    migration,
    /create table public\.m26_telemetry_events_v59/u
  );
  assert.match(migration,/canonical_event jsonb not null/u);
  assert.match(
    migration,
    /unique\s*\(\s*client_id,\s*event_id\s*\)/u
  );
  assert.match(migration,/expires_at timestamptz not null/u);
  assert.match(migration,/interval '180 days'/u);
});

test('RC59.0C2 no aplica filtro fisiologico 25 a 240 al raw',()=>{
  const validator=migration.slice(
    migration.indexOf(
      'create or replace function public.m26_telemetry_event_valid_v59'
    ),
    migration.indexOf(
      'create table public.m26_telemetry_events_v59'
    )
  );

  assert.doesNotMatch(validator,/25\s*(?:and|to)\s*240/iu);
  assert.match(
    validator,
    /jsonb_typeof\(p_event #> '\{raw,heartRateBpm\}'\) <> 'number'/u
  );
});

test('RC59.0C2 soporta providers live RC59 actuales',()=>{
  for(const provider of [
    'apple_health',
    'wear_os_health_services',
    'ble_direct',
  ]){
    assert.match(migration,new RegExp(`'${provider}'`,'u'));
  }
});

test('RC59.0C2 bloquea hardware IDs y secretos recursivamente',()=>{
  for(const forbidden of [
    'deviceid',
    'macaddress',
    'gattid',
    'serialnumber',
    'accesstoken',
    'refreshtoken',
    'servicerole',
  ]){
    assert.match(migration,new RegExp(`'${forbidden}'`,'u'));
  }
  assert.match(
    migration,
    /m26_telemetry_json_safe_v59\(v_child\)/u
  );
});

test('RC59.0C2 usa frontera especifica de telemetria sin bypass Admin',()=>{
  const helper=migration.slice(
    migration.indexOf(
      'create or replace function public.m26_telemetry_can_access_client_v59'
    ),
    migration.indexOf(
      'create or replace function public.m26_telemetry_json_safe_v59'
    )
  );
  const importRpc=migration.slice(
    migration.indexOf(
      'create or replace function public.m26_telemetry_import_v59'
    ),
    migration.indexOf(
      'create or replace function public.m26_telemetry_read_page_v59'
    )
  );

  assert.match(helper,/target_client = public\.iberfit_client_id\(\)/u);
  assert.match(
    helper,
    /public\.iberfit_coach_client_assignments/u
  );
  assert.match(
    helper,
    /public\.iberfit_organization_memberships/u
  );
  assert.match(helper,/a\.coach_user_id = auth\.uid\(\)/u);
  assert.match(helper,/a\.status = 'active'/u);
  assert.match(helper,/m\.status = 'active'/u);
  assert.match(helper,/a\.starts_at <= current_date/u);
  assert.match(helper,/a\.ends_at >= current_date/u);

  assert.doesNotMatch(helper,/iberfit_role/u);
  assert.doesNotMatch(helper,/public\.client_assignments\b/u);
  assert.doesNotMatch(helper,/\badmin\b/iu);

  assert.match(
    importRpc,
    /public\.m26_telemetry_can_access_client_v59\(v_client_id\)/u
  );
  assert.match(importRpc,/M26_RC59_CLIENT_SCOPE_FORBIDDEN/u);
  assert.doesNotMatch(importRpc,/jwt|role_claim|current_setting/iu);

  assert.doesNotMatch(
    migration,
    /public\.is_assigned_coach\(/u
  );
});

test('RC59.0C2 direct raw table grants permanecen revocados',()=>{
  assert.match(
    migration,
    /revoke all\s+on public\.m26_telemetry_events_v59\s+from public, anon, authenticated;/u
  );
  assert.doesNotMatch(
    migration,
    /grant\s+(?:select|insert|update|delete)[\s\S]{0,100}m26_telemetry_events_v59[\s\S]{0,100}authenticated/iu
  );
});

test('RC59.0C2 ACK remoto coincide con contrato C0',()=>{
  for(const field of [
    'acceptedEventIds',
    'duplicateEventIds',
    'rejectedEventIds',
    'rejectedReasons',
  ]){
    assert.match(migration,new RegExp(`'${field}'`,'u'));
  }
  assert.match(migration,/M26_RC59_EVENT_ID_COLLISION/u);
  assert.match(
    migration,
    /jsonb_array_length\(v_events\) > 100/u
  );
  assert.match(
    migration,
    /v_payload_bytes > 192000/u
  );
});

test('RC59.0C2 audita por batch sin duplicar raw por evento',()=>{
  assert.match(
    migration,
    /create table public\.m26_telemetry_import_batches_v59/u
  );
  assert.match(migration,/payload_bytes integer not null/u);
  assert.doesNotMatch(
    migration,
    /m26_audit_row_v43\(\)/u
  );
  assert.match(doc,/PER_SAMPLE_GENERIC_AUDIT_TRIGGER=FALSE/u);
});

test('RC59.0C2 Admin role solo no concede raw',()=>{
  assert.match(
    migration,
    /Admin role by itself receives no raw access/u
  );
  assert.match(
    migration,
    /m26_telemetry_can_access_client_v59/u
  );
  assert.doesNotMatch(
    migration,
    /public\.is_assigned_coach\(/u
  );
  assert.match(doc,/ADMIN_ROLE_ALONE_RAW_ACCESS=FALSE/u);
  assert.match(doc,/AUTHORIZATION_DRIFT_DETECTED=TRUE/u);
  assert.match(doc,/AUTHORIZATION_DRIFT_RESOLVED_IN_DRAFT=TRUE/u);
});

test('RC59.0C2 define read export delete y retention sin apply',()=>{
  assert.match(
    migration,
    /m26_telemetry_read_page_v59/u
  );
  assert.match(
    migration,
    /m26_telemetry_delete_own_v59/u
  );
  assert.match(
    migration,
    /m26_telemetry_purge_expired_v59/u
  );
  assert.match(
    migration,
    /from public, anon, authenticated;/u
  );
  assert.match(doc,/SUPABASE_TOUCHED=FALSE/u);
  assert.match(doc,/BACKEND_MUTATION=FALSE/u);
});

test('RC59.0C2 design histórico permanece válido tras apply canónico',()=>{
  assert.match(
    roadmap,
    /RC59_0C2C=CANONICAL_APPLIED/u
  );
  assert.match(
    roadmap,
    /RC59_0=IN_PROGRESS_RC59_0C3_REMOTE_OUTBOX_UPLOAD/u
  );
  assert.match(
    doc,
    /NEXT_PRODUCT_ACTION=CURRENT_VISUAL_SANDBOX_CLIENT_COACH_ADMIN/u
  );
});