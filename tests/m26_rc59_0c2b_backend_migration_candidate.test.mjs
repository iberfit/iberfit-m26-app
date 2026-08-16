import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

const migrationPath=
  'docs/sql/RC59_0C2B_TELEMETRY_BACKEND_MIGRATION_CANDIDATE.sql';
const rollbackPath=
  'docs/sql/RC59_0C2B_TELEMETRY_BACKEND_ROLLBACK_CANDIDATE.sql';

const migration=read(migrationPath);
const rollback=read(rollbackPath);
const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
const doc=read(
  'docs/RC59_0C2B_TELEMETRY_BACKEND_MIGRATION_CANDIDATE.md'
);

function dollarTagsBalanced(sql){
  const tags=sql.match(/\$[A-Za-z0-9_]*\$/gu)||[];
  const counts=new Map();

  for(const tag of tags){
    counts.set(tag,(counts.get(tag)||0)+1);
  }

  return [...counts.values()].every((count)=>count%2===0);
}

test('RC59.0C2B candidate permanece fuera de supabase migrations',()=>{
  assert.equal(migrationPath.startsWith('supabase/migrations/'),false);
  assert.equal(rollbackPath.startsWith('supabase/migrations/'),false);
  assert.match(doc,/REMOTE_APPLY=FALSE/u);
  assert.match(doc,/SUPABASE_TOUCHED=FALSE/u);
});

test('RC59.0C2B es ejecutable solo con autorización local explícita',()=>{
  assert.doesNotMatch(
    migration,
    /RC59_0C2_DESIGN_ONLY_DO_NOT_APPLY/u
  );
  assert.match(
    migration,
    /iberfit\.rc59_0c2_apply_authorized/u
  );
  assert.match(
    migration,
    /RC59_0C2B_APPLY_AUTHORIZATION_REQUIRED/u
  );
  assert.match(migration,/^begin;/mu);
  assert.match(migration,/commit;\s*$/u);
  assert.equal(dollarTagsBalanced(migration),true);
});

test('RC59.0C2B fail closed ante cualquier colisión v59',()=>{
  for(const token of [
    'M26_RC59_TELEMETRY_ALREADY_PRESENT',
    'M26_RC59_TELEMETRY_BATCH_AUDIT_ALREADY_PRESENT',
    'M26_RC59_AUTH_HELPER_ALREADY_PRESENT',
    'M26_RC59_JSON_GUARD_ALREADY_PRESENT',
    'M26_RC59_EVENT_VALIDATOR_ALREADY_PRESENT',
    'M26_RC59_IMPORT_RPC_ALREADY_PRESENT',
    'M26_RC59_READ_RPC_ALREADY_PRESENT',
    'M26_RC59_DELETE_RPC_ALREADY_PRESENT',
    'M26_RC59_PURGE_RPC_ALREADY_PRESENT',
  ]){
    assert.match(migration,new RegExp(token,'u'));
  }
});

test('RC59.0C2B timestamps usan igualdad timestamptz real',()=>{
  assert.match(
    migration,
    /\(canonical_event ->> 'recordedAt'\)::timestamptz = recorded_at/u
  );
  assert.match(
    migration,
    /\(canonical_event ->> 'receivedAt'\)::timestamptz = received_at/u
  );
  assert.doesNotMatch(
    migration,
    /canonical_event ->> 'recordedAt' = recorded_at::text/u
  );
});

test('RC59.0C2B retención raw cuenta desde ingestión',()=>{
  assert.match(
    migration,
    /now\(\) \+ interval '180 days'/u
  );
  assert.doesNotMatch(
    migration,
    /\(v_event ->> 'recordedAt'\)::timestamptz\s*\+\s*interval '180 days'/u
  );
});

test('RC59.0C2B rechaza eventId repetido dentro del mismo batch',()=>{
  assert.match(
    migration,
    /group by item ->> 'eventId'/u
  );
  assert.match(
    migration,
    /having count\(\*\) > 1/u
  );
  assert.match(
    migration,
    /M26_RC59_BATCH_EVENT_ID_DUPLICATE/u
  );
});

test('RC59.0C2B mantiene autorización raw específica sin bypass Admin',()=>{
  assert.match(
    migration,
    /m26_telemetry_can_access_client_v59/u
  );
  assert.match(
    migration,
    /public\.iberfit_coach_client_assignments/u
  );
  assert.match(
    migration,
    /public\.iberfit_organization_memberships/u
  );
  assert.doesNotMatch(
    migration,
    /public\.is_assigned_coach\(/u
  );
  assert.doesNotMatch(
    migration,
    /(?:iberfit_role|role_claim|app_metadata)[\s\S]{0,120}(?:telemetry_can_access|CLIENT_SCOPE)/iu
  );
});

test('RC59.0C2B preserva raw sin filtro fisiológico BPM',()=>{
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

test('RC59.0C2B mantiene límites de batch del contrato C0',()=>{
  assert.match(migration,/jsonb_array_length\(v_events\) > 100/u);
  assert.match(migration,/v_payload_bytes > 192000/u);
  assert.match(migration,/acceptedEventIds/u);
  assert.match(migration,/duplicateEventIds/u);
  assert.match(migration,/rejectedEventIds/u);
  assert.match(migration,/rejectedReasons/u);
});

test('RC59.0C2B refuerza RLS y privilegios en postcheck',()=>{
  assert.match(
    migration,
    /force row level security/iu
  );
  assert.match(
    migration,
    /relforcerowsecurity is true/u
  );
  assert.match(
    migration,
    /M26_RC59_FORCE_RLS_POSTCHECK_FAILED/u
  );
  assert.match(
    migration,
    /M26_RC59_DIRECT_TABLE_PRIVILEGE_POSTCHECK_FAILED/u
  );
  assert.match(
    migration,
    /M26_RC59_PURGE_EXECUTE_POSTCHECK_FAILED/u
  );
});

test('RC59.0C2B rollback también requiere autorización independiente',()=>{
  assert.doesNotMatch(
    rollback,
    /RC59_0C2_ROLLBACK_DESIGN_ONLY_DO_NOT_APPLY/u
  );
  assert.match(
    rollback,
    /iberfit\.rc59_0c2_rollback_authorized/u
  );
  assert.match(
    rollback,
    /RC59_0C2B_ROLLBACK_AUTHORIZATION_REQUIRED/u
  );
  assert.match(
    rollback,
    /drop table if exists\s+public\.m26_telemetry_events_v59/iu
  );
  assert.match(
    rollback,
    /drop function if exists\s+public\.m26_telemetry_can_access_client_v59\(uuid\)/iu
  );
  assert.equal(dollarTagsBalanced(rollback),true);
});

test('RC59.0C2B candidate queda preservado tras apply canónico',()=>{
  assert.match(
    roadmap,
    /RC59_0C2C=CANONICAL_APPLIED/u
  );
  assert.match(
    roadmap,
    /RC59_0C3=CLOSED_AUTHENTICATED_RUNTIME_SMOKE/u
  );
  assert.match(
    roadmap,
    /RC59_0=CLOSED_RC59_0C3_REMOTE_OUTBOX_UPLOAD/u
  );
  assert.match(
    doc,
    /NEXT_PRODUCT_ACTION=RC59_0C2C_CANONICAL_APPLY_PREP_GUARDED/u
  );
});