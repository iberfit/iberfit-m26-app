#!/usr/bin/env node

/**
 * Publish an approved IBERFIT exercise-media finalization plan to Supabase.
 *
 * This is intentionally fail-closed: only the exact QA/PROD projects are
 * accepted, production needs a separate explicit allow flag, every referenced
 * image is checked in Storage before the catalog finalizer RPC is invoked, and
 * the plan must be the exact autowire v3 schema.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PLAN_SCHEMA = 'iberfit.exercise.media.autowire.v3';
const FINALIZE_RPC = 'iberfit_finalize_exercise_media_v1';
const TARGETS = Object.freeze({
  qa: 'https://gjztkdwfmunnzhtvxrsu.supabase.co',
  prod: 'https://pjhmrhejsoofmouedavw.supabase.co',
});
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.(?:webp|png|jpe?g)$/iu;

function cleanOrigin(value) {
  return String(value || '').trim().replace(/\/$/u, '');
}

function exactTarget(target, origin) {
  const name = String(target || '').trim().toLowerCase();
  if (!Object.hasOwn(TARGETS, name)) throw new Error('IBERFIT_MEDIA_TARGET_INVALID');
  const expected = TARGETS[name];
  const actual = cleanOrigin(origin);
  if (actual !== expected) throw new Error(`IBERFIT_MEDIA_TARGET_ORIGIN_MISMATCH:${name}`);
  return Object.freeze({ name, origin: actual });
}

function validatePlan(plan) {
  if (!plan || Array.isArray(plan) || typeof plan !== 'object') throw new Error('IBERFIT_MEDIA_PLAN_INVALID');
  if (plan.schema !== PLAN_SCHEMA) throw new Error('IBERFIT_MEDIA_PLAN_SCHEMA_INVALID');
  if (plan?.publication?.rpc !== FINALIZE_RPC || plan?.publication?.app_link !== 'automatic') {
    throw new Error('IBERFIT_MEDIA_PLAN_RUNTIME_LINK_INVALID');
  }
  if (!Array.isArray(plan.finalizations)) throw new Error('IBERFIT_MEDIA_PLAN_FINALIZATIONS_INVALID');

  const ids = new Set();
  for (const action of plan.finalizations) {
    const id = String(action?.exercise_id || '');
    if (!SAFE_ID.test(id) || id !== id.trim()) throw new Error('IBERFIT_MEDIA_PLAN_EXERCISE_ID_INVALID');
    if (ids.has(id)) throw new Error(`IBERFIT_MEDIA_PLAN_DUPLICATE:${id}`);
    ids.add(id);
    if (action.rpc !== FINALIZE_RPC) throw new Error(`IBERFIT_MEDIA_PLAN_RPC_INVALID:${id}`);
    if (action?.args?.p_exercise_id !== id || !action?.args?.p_manifest) {
      throw new Error(`IBERFIT_MEDIA_PLAN_ARGS_INVALID:${id}`);
    }
  }
  return plan;
}

function mediaAssetPaths(action) {
  const id = action.exercise_id;
  const manifest = action.args.p_manifest;
  const assets = ['movement', 'thumbnail', 'start', 'end']
    .map((kind) => manifest?.[kind])
    .filter(Boolean);
  if (!manifest?.movement) throw new Error(`IBERFIT_MEDIA_MOVEMENT_REQUIRED:${id}`);

  return assets.map((asset) => {
    const value = String(asset?.path || '').trim();
    const parts = value.split('/');
    if (parts.length !== 2 || parts[0] !== id || !SAFE_FILE.test(parts[1]) || value.includes('..')) {
      throw new Error(`IBERFIT_MEDIA_STORAGE_PATH_INVALID:${id}`);
    }
    return value;
  });
}

function storageUrl(origin, storagePath) {
  const [id, file] = storagePath.split('/');
  return `${origin}/storage/v1/object/public/iberfit-exercise-media/${encodeURIComponent(id)}/${encodeURIComponent(file)}`;
}

async function assertStoredAssets(fetchImpl, target, action) {
  for (const storagePath of mediaAssetPaths(action)) {
    const response = await fetchImpl(storageUrl(target.origin, storagePath), {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { Range: 'bytes=0-0' },
    });
    if (!response?.ok) throw new Error(`IBERFIT_MEDIA_ASSET_NOT_FOUND:${action.exercise_id}:${storagePath}:${response?.status || 0}`);
    try { await response.body?.cancel?.(); } catch {}
  }
}

async function finalizeOne(fetchImpl, target, publishableKey, accessToken, action) {
  const response = await fetchImpl(`${target.origin}/rest/v1/rpc/${FINALIZE_RPC}`, {
    method: 'POST',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'x-client-info': 'iberfit-exercise-media-publisher/1',
    },
    body: JSON.stringify(action.args),
  });
  if (!response?.ok) {
    let detail = '';
    try { detail = String(await response.text()).slice(0, 300); } catch {}
    throw new Error(`IBERFIT_MEDIA_FINALIZE_FAILED:${action.exercise_id}:${response?.status || 0}:${detail}`);
  }
  const result = await response.json();
  if (result?.ok !== true || result?.exerciseId !== action.exercise_id || result?.mediaStatus !== 'aprobado') {
    throw new Error(`IBERFIT_MEDIA_FINALIZE_RESPONSE_INVALID:${action.exercise_id}`);
  }
  return result;
}

export async function publishExerciseMediaPlan(plan, {
  target = 'qa',
  origin = TARGETS.qa,
  publishableKey = '',
  accessToken = '',
  apply = false,
  allowProduction = false,
  verifyAssets = true,
  fetchImpl = globalThis.fetch,
} = {}) {
  const validatedPlan = validatePlan(plan);
  const resolvedTarget = exactTarget(target, origin);
  if (typeof fetchImpl !== 'function') throw new Error('IBERFIT_MEDIA_FETCH_UNAVAILABLE');

  if (!apply) {
    return Object.freeze({ ok: true, applied: false, target: resolvedTarget.name, count: validatedPlan.finalizations.length });
  }
  if (resolvedTarget.name === 'prod' && allowProduction !== true) {
    throw new Error('IBERFIT_MEDIA_PRODUCTION_NOT_APPROVED');
  }
  if (String(publishableKey).length < 2 || String(accessToken).length < 20) {
    throw new Error('IBERFIT_MEDIA_PUBLISH_CREDENTIALS_REQUIRED');
  }

  const results = [];
  for (const action of validatedPlan.finalizations) {
    if (verifyAssets) await assertStoredAssets(fetchImpl, resolvedTarget, action);
    results.push(await finalizeOne(fetchImpl, resolvedTarget, publishableKey, accessToken, action));
  }

  return Object.freeze({ ok: true, applied: true, target: resolvedTarget.name, count: results.length, results: Object.freeze(results) });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const getArg = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : null;
  };
  const planPath = getArg('--plan');
  const target = (getArg('--target') || 'qa').toLowerCase();
  const apply = argv.includes('--apply');
  if (!planPath) throw new Error('USAGE: node scripts/exercise-media/publish.mjs --plan <finalizations.json> --target <qa|prod> [--apply]');

  const defaultOrigin = TARGETS[target];
  const result = await publishExerciseMediaPlan(readJson(planPath), {
    target,
    origin: env.IBERFIT_SUPABASE_URL || defaultOrigin,
    publishableKey: env.IBERFIT_SUPABASE_PUBLISHABLE_KEY || '',
    accessToken: env.IBERFIT_SUPABASE_ACCESS_TOKEN || '',
    apply,
    allowProduction: env.IBERFIT_ALLOW_PROD_MEDIA_PUBLISH === 'true',
    verifyAssets: env.IBERFIT_SKIP_MEDIA_ASSET_VERIFY !== 'true',
  });
  console.log(JSON.stringify(result));
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
