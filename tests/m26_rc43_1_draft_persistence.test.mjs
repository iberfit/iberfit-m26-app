import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const migration = read(
  'supabase/migrations/20260804062500_rc43_1_session_draft_persistence.sql',
);

const rollback = read(
  'backend/RC43_1_DRAFT_PERSISTENCE_ROLLBACK.sql',
);

const transport = read(
  'src/m26/supabase-transport.js',
);

const application = read(
  'src/m26/app/application.js',
);

const sessionController = read(
  'src/m26/workflows/session-controller.js',
);

const pkg = JSON.parse(
  read('package.json'),
);

test('RC43.1 es aditiva, transaccional y Canary', () => {
  assert.match(migration, /^-- IBERFIT M26 RC43\.1/u);
  assert.match(migration, /\nbegin;\n/u);
  assert.match(migration, /\ncommit;\s*$/u);
  assert.doesNotMatch(migration, /\bdrop table\b/iu);
  assert.doesNotMatch(migration, /\bdb reset\b/iu);
  assert.doesNotMatch(
    migration,
    /pjhmrhejsoofmouedavw/u,
  );
});

test('RC43.1 crea tabla remota con RLS y aislamiento por propietario', () => {
  assert.match(
    migration,
    /create table if not exists\s+public\.m26_session_drafts_v431/iu,
  );

  assert.match(
    migration,
    /enable row level security/iu,
  );

  assert.match(
    migration,
    /owner_user_id = auth\.uid\(\)/u,
  );

  for (const policy of [
    'm26_session_drafts_read_v431',
    'm26_session_drafts_insert_v431',
    'm26_session_drafts_update_v431',
    'm26_session_drafts_delete_v431',
  ]) {
    assert.ok(migration.includes(policy));
  }
});

test('RC43.1 publica las RPC de borradores', () => {
  for (const rpc of [
    'm26_backend_health_v431',
    'm26_draft_get_v431',
    'm26_draft_upsert_v431',
    'm26_draft_delete_v431',
  ]) {
    assert.ok(migration.includes(rpc));
    assert.ok(transport.includes(rpc));
  }
});

test('RC43.1 guarda local primero y sincroniza remoto', () => {
  const localIndex = application.indexOf(
    'await draftRepository.save(clientId,SESSION_DRAFT_SCOPE,draft)',
  );

  const remoteIndex = application.indexOf(
    'await transport.upsertSessionDraft(currentToken(),',
  );

  assert.ok(localIndex >= 0);
  assert.ok(remoteIndex > localIndex);

  assert.match(
    application,
    /if\(!local&&!remote\)/u,
  );
});

test('RC43.1 recupera remoto y mantiene cache local', () => {
  assert.ok(
    application.includes(
      'await transport.getSessionDraft(currentToken(),clientId,SESSION_DRAFT_SCOPE)',
    ),
  );

  assert.ok(
    application.includes(
      'await draftRepository.save(clientId,SESSION_DRAFT_SCOPE,remoteRecord.value)',
    ),
  );

  assert.ok(
    application.includes(
      'const saved=await loadSessionDraft(clientId);',
    ),
  );
});

test('RC43.1 elimina borrador local y remoto al publicar', () => {
  assert.ok(
    application.includes(
      'await transport.deleteSessionDraft(currentToken(),clientId,SESSION_DRAFT_SCOPE)',
    ),
  );

  assert.ok(
    application.includes(
      'async function clearSessionDraft(clientId)',
    ),
  );
});

test('RC43.1 muestra diagnostico y evita error falso con fallback', () => {
  assert.ok(
    application.includes(
      "reportDiagnostic('session-draft-remote-save',error)",
    ),
  );

  assert.ok(
    application.includes(
      "Código: ${detail.code}.",
    ),
  );

  assert.ok(
    sessionController.includes(
      'Borrador guardado de forma segura.',
    ),
  );

  assert.doesNotMatch(
    sessionController,
    /Borrador guardado en este dispositivo\./u,
  );
});

test('RC43.1 dispone de rollback guardado', () => {
  assert.match(
    rollback,
    /M26_RC431_ROLLBACK_NOT_AUTHORIZED/u,
  );

  assert.match(
    rollback,
    /iberfit\.allow_rc431_rollback/u,
  );

  assert.match(
    rollback,
    /\ncommit;\s*$/u,
  );
});

test('RC43.1 registra pruebas y build reproducible', () => {
  assert.equal(
    pkg.scripts['test:m26:rc431'],
    'node --test tests/m26_rc43_1_draft_persistence.test.mjs',
  );

  assert.ok(
    pkg.scripts['validate:rc431:local'].includes(
      'validate:rc43:local',
    ),
  );

  assert.ok(
    pkg.scripts['build:rc431:canary'].includes(
      'patch_rc431_canary_runtime_source.mjs',
    ),
  );

  assert.ok(
    pkg.scripts['build:rc431:canary'].includes(
      'generate_rc431_runtime_config.mjs',
    ),
  );

  assert.ok(
    pkg.scripts['build:rc431:canary'].includes(
      'verify_rc431_canary_candidate.mjs',
    ),
  );
});
