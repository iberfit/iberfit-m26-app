#!/usr/bin/env node

/**
 * IBERFIT exercise media autowire.
 *
 * Reads a canonical exercise catalog export plus a media manifest and emits
 * idempotent Supabase upserts. Designed so the app never needs manual
 * per-exercise media edits.
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const catalogPath = getArg('--catalog');
const manifestPath = getArg('--manifest');
const outPath = getArg('--out') || 'exercise-media-upserts.json';

if (!catalogPath || !manifestPath) {
  console.error('Usage: node scripts/exercise-media/autowire.mjs --catalog <catalog.json> --manifest <media.json> [--out <file>]');
  process.exit(2);
}

const readJson = (p) => JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
const catalogRaw = readJson(catalogPath);
const manifestRaw = readJson(manifestPath);
const catalog = Array.isArray(catalogRaw) ? catalogRaw : (catalogRaw.exercises || catalogRaw.data || []);
const media = Array.isArray(manifestRaw) ? manifestRaw : (manifestRaw.items || manifestRaw.media || []);

const slugify = (s='') => s
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const bySlug = new Map();
for (const item of media) {
  const slug = slugify(item.slug || item.exercise_slug || item.name || '');
  if (!slug) continue;
  if (bySlug.has(slug)) throw new Error(`DUPLICATE_MEDIA_SLUG:${slug}`);
  bySlug.set(slug, item);
}

const upserts = [];
const missing = [];
for (const ex of catalog) {
  const slug = slugify(ex.slug || ex.exercise_slug || ex.name || ex.nombre || '');
  const m = bySlug.get(slug);
  if (!m) {
    missing.push({ id: ex.id ?? null, slug, name: ex.name || ex.nombre || null });
    continue;
  }
  if (!m.composite_url && !m.compositeUrl) throw new Error(`MEDIA_COMPOSITE_MISSING:${slug}`);
  const composite = m.composite_url || m.compositeUrl;
  const thumb = m.thumbnail_url || m.thumbnailUrl || composite;
  upserts.push({
    id: ex.id,
    slug,
    media_status: m.status || 'ready',
    media: {
      ...(ex.media || {}),
      composite_url: composite,
      thumbnail_url: thumb,
      style: m.style || 'iberfit-v1',
      qa: m.qa || { status: 'pass' },
      updated_at: new Date().toISOString()
    }
  });
}

const result = {
  schema: 'iberfit.exercise.media.autowire.v1',
  generated_at: new Date().toISOString(),
  totals: { catalog: catalog.length, matched: upserts.length, missing: missing.length },
  upserts,
  missing
};
fs.writeFileSync(path.resolve(outPath), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.totals));
