import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const migration = read(
  'supabase/migrations/20260804061500_rc43_operational_backend.sql',
);

const rollback = read(
  'backend/RC43_OPERATIONAL_BACKEND_ROLLBACK.sql',
);

const transport = read(
  'src/m26/supabase-transport.js',
);

const application = read(
  'src/m26/app/application.js',
);

const pkg = JSON.parse(
  read('package.json'),
);

test('RC43 es una migracion aditiva y transaccional', () => {
  assert.match(migration, /^-- IBERFIT M26 RC43/u);
  assert.match(migration, /\nbegin;\n/u);
  assert.match(migration, /\ncommit;\s*$/u);
  assert.doesNotMatch(migration, /\bdb reset\b/iu);
  assert.doesNotMatch(migration, /\bdrop table\b/iu);
  assert.doesNotMatch(
    migration,
    /pjhmrhejsoofmouedavw/u,
  );
});

test('RC43 exige contratos backend existentes', () => {
  for (const contract of [
    'public.clients',
    'public.iberfit_client_id()',
    'public.is_assigned_coach(uuid)',
    'public.iberfit_bootstrap_v26()',
    'public.iberfit_command_preflight_v26(jsonb)',
    'public.iberfit_execute_command_v26(jsonb)',
  ]) {
    assert.ok(migration.includes(contract));
  }
});

test('RC43 crea seis tablas con RLS', () => {
  for (const table of [
    'm26_schema_releases_v43',
    'm26_client_measurements_v43',
    'm26_training_plans_v43',
    'm26_training_sessions_v43',
    'm26_messages_v43',
    'm26_audit_events_v43',
  ]) {
    assert.ok(migration.includes(`public.${table}`));
  }

  const rlsMatches = migration.match(
    /enable row level security/gu,
  );

  assert.equal(rlsMatches?.length, 6);
});

test('RC43 bloquea secretos y acceso anonimo', () => {
  assert.match(
    migration,
    /m26_json_safe_v43/u,
  );

  assert.match(
    migration,
    /revoke all[\s\S]*from anon, authenticated/iu,
  );

  assert.doesNotMatch(
    migration,
    /\bservice_role\b(?!')/iu,
  );
});

test('RC43 publica salud, bootstrap y escrituras', () => {
  for (const rpc of [
    'm26_backend_health_v43',
    'm26_backend_bootstrap_v43',
    'm26_record_measurement_v43',
    'm26_save_training_session_v43',
    'm26_send_message_v43',
  ]) {
    assert.ok(migration.includes(rpc));
    assert.ok(transport.includes(rpc));
  }
});

test('RC43 participa en la hidratacion autenticada', () => {
  assert.ok(
    application.includes(
      'transport.backendBootstrap(currentToken())',
    ),
  );

  assert.ok(
    application.includes(
      'commandRegistry:installed,reason,backendV43,rc39:',
    ),
  );
});

test('RC43 tiene rollback manual guardado', () => {
  assert.match(
    rollback,
    /M26_RC43_ROLLBACK_NOT_AUTHORIZED/u,
  );

  assert.match(
    rollback,
    /iberfit\.allow_rc43_rollback/u,
  );

  assert.match(
    rollback,
    /\ncommit;\s*$/u,
  );
});

test('RC43 registra validacion y build', () => {
  assert.equal(
    pkg.scripts['test:m26:rc43'],
    'node --test tests/m26_rc43_operational_backend.test.mjs',
  );

  assert.ok(
    pkg.scripts['build:rc43:canary'].includes(
      'patch_rc43_canary_runtime_source.mjs',
    ),
  );

  assert.ok(
    pkg.scripts['build:rc43:canary'].includes(
      'generate_rc43_runtime_config.mjs',
    ),
  );

  assert.ok(
    pkg.scripts['build:rc43:canary'].includes(
      'verify_rc43_canary_candidate.mjs',
    ),
  );
});
