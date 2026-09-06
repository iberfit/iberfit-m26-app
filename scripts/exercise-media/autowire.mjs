#!/usr/bin/env node

/**
 * IBERFIT exercise media autowire.
 *
 * Converts approved exercise-media manifests into the exact RPC calls consumed
 * by the existing runtime bridge. Identity is always the canonical exercise_id;
 * names, aliases and filesystem slugs are never authoritative.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateExerciseMediaManifest } from '../../src/m26/exercises/catalog.js';

const INPUT_SCHEMA = 'iberfit.exercise.media.autowire-input.v2';
const OUTPUT_SCHEMA = 'iberfit.exercise.media.autowire.v3';
const FINALIZE_RPC = 'iberfit_finalize_exercise_media_v1';
const SAFE_EXERCISE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

function exactExerciseId(value, code) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || !SAFE_EXERCISE_ID.test(value)) {
    throw new Error(code);
  }
  return value;
}

export function extractCanonicalExercises(catalogRaw) {
  const catalog = Array.isArray(catalogRaw)
    ? catalogRaw
    : (catalogRaw?.exercises ?? catalogRaw?.data);
  if (!Array.isArray(catalog)) throw new Error('CANONICAL_CATALOG_INVALID');
  return catalog;
}

export function extractMediaItems(manifestRaw) {
  if (!manifestRaw || Array.isArray(manifestRaw) || typeof manifestRaw !== 'object') {
    throw new Error('MEDIA_MANIFEST_INVALID');
  }
  if (manifestRaw.schema !== INPUT_SCHEMA) {
    throw new Error(`MEDIA_MANIFEST_SCHEMA_INVALID:${String(manifestRaw.schema || '')}`);
  }
  if (!Array.isArray(manifestRaw.items)) throw new Error('MEDIA_MANIFEST_ITEMS_INVALID');
  return manifestRaw.items;
}

export function buildExerciseMediaFinalizations(catalogRaw, manifestRaw, { generatedAt = new Date().toISOString() } = {}) {
  const catalog = extractCanonicalExercises(catalogRaw);
  const mediaItems = extractMediaItems(manifestRaw);
  const canonicalById = new Map();

  for (const exercise of catalog) {
    const id = exactExerciseId(exercise?.id, 'CANONICAL_EXERCISE_ID_INVALID');
    if (canonicalById.has(id)) throw new Error(`DUPLICATE_CANONICAL_EXERCISE_ID:${id}`);
    canonicalById.set(id, exercise);
  }

  const mediaById = new Map();
  for (const item of mediaItems) {
    const id = exactExerciseId(item?.exercise_id, 'MEDIA_EXERCISE_ID_INVALID');
    if (mediaById.has(id)) throw new Error(`DUPLICATE_MEDIA_EXERCISE_ID:${id}`);

    const exercise = canonicalById.get(id);
    if (!exercise) throw new Error(`UNKNOWN_MEDIA_EXERCISE_ID:${id}`);
    if (!item.media || typeof item.media !== 'object' || Array.isArray(item.media)) {
      throw new Error(`MEDIA_PAYLOAD_INVALID:${id}`);
    }

    const validation = validateExerciseMediaManifest(exercise, item.media);
    if (!validation.ok) {
      throw new Error(`MEDIA_MANIFEST_INVALID:${id}:${validation.errors.join(',')}`);
    }
    mediaById.set(id, item.media);
  }

  const finalizations = [];
  const missing = [];
  for (const exercise of catalog) {
    const id = exercise.id;
    const media = mediaById.get(id);
    if (!media) {
      missing.push({ id, name: exercise.name_es || exercise.name || null });
      continue;
    }
    finalizations.push(Object.freeze({
      exercise_id: id,
      rpc: FINALIZE_RPC,
      args: Object.freeze({ p_exercise_id: id, p_manifest: media }),
    }));
  }

  return {
    schema: OUTPUT_SCHEMA,
    generated_at: generatedAt,
    identity: { field: 'exercise_id', matching: 'exact', slug_authoritative: false },
    publication: {
      mechanism: 'supabase_rpc',
      rpc: FINALIZE_RPC,
      resulting_media_status: 'aprobado',
      runtime_manifest_rpc: 'iberfit_exercise_media_manifest_v1',
      app_link: 'automatic',
    },
    totals: { catalog: catalog.length, matched: finalizations.length, missing: missing.length },
    finalizations,
    missing,
  };
}

// Backwards-compatible export name for callers created with autowire v2.
// The returned payload is intentionally v3 and no longer emits unsafe direct upserts.
export const buildExerciseMediaUpserts = buildExerciseMediaFinalizations;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

export function runCli(argv = process.argv.slice(2)) {
  const getArg = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : null;
  };
  const catalogPath = getArg('--catalog');
  const manifestPath = getArg('--manifest');
  const outPath = getArg('--out') || 'exercise-media-finalizations.json';

  if (!catalogPath || !manifestPath) {
    throw new Error('USAGE: node scripts/exercise-media/autowire.mjs --catalog <catalog.json> --manifest <media.json> [--out <file>]');
  }

  const result = buildExerciseMediaFinalizations(readJson(catalogPath), readJson(manifestPath));
  fs.writeFileSync(path.resolve(outPath), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result.totals));
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
