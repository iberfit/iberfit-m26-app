import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExerciseMediaFinalizations, buildExerciseMediaUpserts } from '../scripts/exercise-media/autowire.mjs';

const inputSchema = 'iberfit.exercise.media.autowire-input.v2';

function exercise(id, name = 'Ejercicio') {
  return {
    id,
    name_es: name,
    pattern: 'fuerza',
    equipment: 'peso corporal',
    primary_muscles: ['cuádriceps'],
    secondary_muscles: ['glúteos'],
  };
}

function media(id, overrides = {}) {
  return {
    schema: 'iberfit.exercise.visual.v1',
    style: 'iberfit-premium-movement-pair-v1',
    revision: 1,
    bucket: 'iberfit-exercise-media',
    movement: { kind: 'movement', path: `${id}/movement.webp`, mime: 'image/webp', width: 1122, height: 1402, sha256: null },
    thumbnail: { kind: 'thumbnail', path: `${id}/thumbnail.webp`, mime: 'image/webp', width: 561, height: 701, sha256: null },
    start: { kind: 'start', path: `${id}/start.webp`, mime: 'image/webp', width: 1122, height: 1402, sha256: null },
    end: { kind: 'end', path: `${id}/end.webp`, mime: 'image/webp', width: 1122, height: 1402, sha256: null },
    muscles: { primary: ['cuádriceps'], secondary: ['glúteos'] },
    generatedAt: '2026-09-05T20:00:00.000Z',
    published: true,
    clientVisible: true,
    coachVisible: true,
    qa: { biomechanics: 'approved', visual: 'approved' },
    provenance: { rightsBasis: 'iberfit_owned', sourceRef: 'IBERFIT_GENERATED', licenseLabel: 'IBERFIT owned visual' },
    ...overrides,
  };
}

function manifest(items) {
  return { schema: inputSchema, items };
}

test('autowire enlaza únicamente por exercise_id canónico exacto y emite el RPC runtime', () => {
  const catalog = [exercise('squat-a', 'Sentadilla'), exercise('squat-b', 'Sentadilla')];
  const result = buildExerciseMediaFinalizations(catalog, manifest([
    { exercise_id: 'squat-b', slug: 'sentadilla', media: media('squat-b') },
    { exercise_id: 'squat-a', slug: 'sentadilla', media: media('squat-a') },
  ]), { generatedAt: '2026-09-05T20:01:00.000Z' });

  assert.deepEqual(result.finalizations.map((item) => item.exercise_id), ['squat-a', 'squat-b']);
  assert.equal(result.finalizations[0].rpc, 'iberfit_finalize_exercise_media_v1');
  assert.equal(result.finalizations[0].args.p_exercise_id, 'squat-a');
  assert.equal(result.finalizations[0].args.p_manifest.movement.path, 'squat-a/movement.webp');
  assert.equal(result.finalizations[1].args.p_manifest.movement.path, 'squat-b/movement.webp');
  assert.deepEqual(result.identity, { field: 'exercise_id', matching: 'exact', slug_authoritative: false });
  assert.equal(result.publication.resulting_media_status, 'aprobado');
  assert.equal(result.publication.runtime_manifest_rpc, 'iberfit_exercise_media_manifest_v1');
  assert.equal(result.publication.app_link, 'automatic');
});

test('el alias histórico buildExerciseMediaUpserts usa el plan seguro v3, sin upsert directo', () => {
  const result = buildExerciseMediaUpserts([exercise('bench')], manifest([{ exercise_id: 'bench', media: media('bench') }]), { generatedAt: 'fixed' });
  assert.equal(result.schema, 'iberfit.exercise.media.autowire.v3');
  assert.equal('upserts' in result, false);
  assert.equal(result.finalizations.length, 1);
});

test('autowire rechaza exercise_id desconocido aunque el nombre o slug coincidan', () => {
  const catalog = [exercise('canonical-squat', 'Sentadilla')];
  assert.throws(
    () => buildExerciseMediaFinalizations(catalog, manifest([{ exercise_id: 'other-squat', slug: 'sentadilla', media: media('other-squat') }])),
    /UNKNOWN_MEDIA_EXERCISE_ID:other-squat/,
  );
});

test('autowire rechaza IDs de media duplicados', () => {
  const catalog = [exercise('rdl')];
  assert.throws(
    () => buildExerciseMediaFinalizations(catalog, manifest([
      { exercise_id: 'rdl', media: media('rdl') },
      { exercise_id: 'rdl', media: media('rdl') },
    ])),
    /DUPLICATE_MEDIA_EXERCISE_ID:rdl/,
  );
});

test('autowire rechaza IDs canónicos duplicados', () => {
  const catalog = [exercise('bench'), exercise('bench')];
  assert.throws(
    () => buildExerciseMediaFinalizations(catalog, manifest([])),
    /DUPLICATE_CANONICAL_EXERCISE_ID:bench/,
  );
});

test('autowire rechaza exercise_id ausente o normalizado implícitamente', () => {
  const catalog = [exercise('bench')];
  assert.throws(
    () => buildExerciseMediaFinalizations(catalog, manifest([{ media: media('bench') }])),
    /MEDIA_EXERCISE_ID_INVALID/,
  );
  assert.throws(
    () => buildExerciseMediaFinalizations(catalog, manifest([{ exercise_id: ' bench ', media: media('bench') }])),
    /MEDIA_EXERCISE_ID_INVALID/,
  );
});

test('autowire exige el contrato visual canónico y QA aprobado', () => {
  const catalog = [exercise('bench')];
  assert.throws(
    () => buildExerciseMediaFinalizations(catalog, manifest([{ exercise_id: 'bench', media: media('bench', { qa: { biomechanics: 'pending', visual: 'approved' } }) }])),
    /MEDIA_MANIFEST_INVALID:bench:qa\.biomechanics/,
  );
  assert.throws(
    () => buildExerciseMediaFinalizations(catalog, manifest([{ exercise_id: 'bench', media: media('bench', { schema: 'invented.schema' }) }])),
    /MEDIA_MANIFEST_INVALID:bench:schema/,
  );
});

test('autowire rechaza rutas que pertenezcan a otro ejercicio', () => {
  const catalog = [exercise('rdl')];
  const wrong = media('rdl', { movement: { kind: 'movement', path: 'squat/movement.webp', mime: 'image/webp' } });
  assert.throws(
    () => buildExerciseMediaFinalizations(catalog, manifest([{ exercise_id: 'rdl', media: wrong }])),
    /MEDIA_MANIFEST_INVALID:rdl:movement/,
  );
});

test('autowire es determinista, no muta el catálogo y reporta faltantes', () => {
  const catalog = [exercise('squat'), exercise('rdl')];
  const before = structuredClone(catalog);
  const result = buildExerciseMediaFinalizations(catalog, manifest([{ exercise_id: 'rdl', media: media('rdl') }]), { generatedAt: 'fixed' });

  assert.deepEqual(catalog, before);
  assert.equal(result.schema, 'iberfit.exercise.media.autowire.v3');
  assert.deepEqual(result.totals, { catalog: 2, matched: 1, missing: 1 });
  assert.deepEqual(result.finalizations.map((item) => item.exercise_id), ['rdl']);
  assert.deepEqual(result.missing, [{ id: 'squat', name: 'Ejercicio' }]);
  assert.equal(result.generated_at, 'fixed');
});

test('autowire rechaza manifest sin versión de contrato v2', () => {
  const catalog = [exercise('squat')];
  assert.throws(
    () => buildExerciseMediaFinalizations(catalog, { schema: 'iberfit.exercise.media.manifest.v1', items: [] }),
    /MEDIA_MANIFEST_SCHEMA_INVALID/,
  );
});
