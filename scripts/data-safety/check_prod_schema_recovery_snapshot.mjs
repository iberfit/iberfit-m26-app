import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SCHEMA_RECOVERY_MARKER = 'iberfit.prod.schema-recovery.v1';
export const DEFAULT_MAX_SNAPSHOT_AGE_MINUTES = 15;
export const DEFAULT_MAX_FUTURE_SKEW_MINUTES = 1;

const MIN_COUNTS = Object.freeze({
  relations: 50,
  relationColumns: 100,
  routines: 20,
  constraints: 50,
  indexes: 20,
});

function writeSummary(summaryPath, summary) {
  if (!summaryPath) return;
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

function responseRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload.result)) return payload.result;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.snapshot !== undefined) return [payload];
  return null;
}

function parseSnapshotValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }
  throw new Error('PROD_SCHEMA_SNAPSHOT_VALUE_INVALID');
}

export function extractSchemaRecoverySnapshot(payload) {
  const rows = responseRows(payload);
  if (!rows || rows.length !== 1) {
    throw new Error(`PROD_SCHEMA_SNAPSHOT_ROW_COUNT_INVALID:${rows?.length ?? 'unknown'}`);
  }
  if (!Object.prototype.hasOwnProperty.call(rows[0] || {}, 'snapshot')) {
    throw new Error('PROD_SCHEMA_SNAPSHOT_FIELD_MISSING');
  }
  return parseSnapshotValue(rows[0].snapshot);
}

function requireArray(snapshot, key) {
  if (!Array.isArray(snapshot[key])) throw new Error(`PROD_SCHEMA_SNAPSHOT_ARRAY_INVALID:${key}`);
  return snapshot[key];
}

function validateRelationColumns(items) {
  for (const item of items) {
    if (!item || typeof item !== 'object') throw new Error('PROD_SCHEMA_SNAPSHOT_COLUMN_ENTRY_INVALID');
    for (const key of ['schema', 'relation', 'column', 'type']) {
      if (typeof item[key] !== 'string' || !item[key].trim()) {
        throw new Error(`PROD_SCHEMA_SNAPSHOT_COLUMN_FIELD_INVALID:${key}`);
      }
    }
  }
}

function validateRoutines(items) {
  for (const item of items) {
    if (!item || typeof item !== 'object') throw new Error('PROD_SCHEMA_SNAPSHOT_ROUTINE_ENTRY_INVALID');
    if (typeof item.schema !== 'string' || !item.schema.trim()) throw new Error('PROD_SCHEMA_SNAPSHOT_ROUTINE_SCHEMA_INVALID');
    if (typeof item.identity !== 'string' || !item.identity.trim()) throw new Error('PROD_SCHEMA_SNAPSHOT_ROUTINE_IDENTITY_INVALID');
    if (typeof item.definition !== 'string' || item.definition.trim().length < 20) {
      throw new Error('PROD_SCHEMA_SNAPSHOT_ROUTINE_DEFINITION_INVALID');
    }
  }
}

export function evaluateSchemaRecoverySnapshot(
  payload,
  {
    nowMs = Date.now(),
    maxAgeMinutes = DEFAULT_MAX_SNAPSHOT_AGE_MINUTES,
    maxFutureSkewMinutes = DEFAULT_MAX_FUTURE_SKEW_MINUTES,
    projectRef = null,
  } = {},
) {
  const snapshot = extractSchemaRecoverySnapshot(payload);
  if (snapshot.schema !== SCHEMA_RECOVERY_MARKER) throw new Error('PROD_SCHEMA_SNAPSHOT_MARKER_INVALID');
  if (!Number.isFinite(nowMs) || nowMs <= 0) throw new Error('PROD_SCHEMA_SNAPSHOT_NOW_INVALID');

  const capturedAtMs = Date.parse(snapshot.capturedAt || '');
  if (!Number.isFinite(capturedAtMs)) throw new Error('PROD_SCHEMA_SNAPSHOT_CAPTURED_AT_INVALID');
  const ageMinutes = (nowMs - capturedAtMs) / 60_000;
  if (ageMinutes < -maxFutureSkewMinutes) throw new Error('PROD_SCHEMA_SNAPSHOT_TIMESTAMP_IN_FUTURE');
  if (ageMinutes > maxAgeMinutes) throw new Error(`PROD_SCHEMA_SNAPSHOT_TOO_OLD:${ageMinutes.toFixed(2)}m`);

  if (typeof snapshot.database !== 'string' || !snapshot.database.trim()) throw new Error('PROD_SCHEMA_SNAPSHOT_DATABASE_INVALID');
  if (typeof snapshot.serverVersionNum !== 'string' || !/^\d+$/.test(snapshot.serverVersionNum)) {
    throw new Error('PROD_SCHEMA_SNAPSHOT_SERVER_VERSION_INVALID');
  }

  const collections = {};
  for (const key of ['relations','relationColumns','routines','triggers','policies','constraints','indexes','views','types']) {
    collections[key] = requireArray(snapshot, key);
  }
  for (const [key, minimum] of Object.entries(MIN_COUNTS)) {
    if (collections[key].length < minimum) {
      throw new Error(`PROD_SCHEMA_SNAPSHOT_TRUNCATED:${key}:${collections[key].length}<${minimum}`);
    }
  }

  validateRelationColumns(collections.relationColumns);
  validateRoutines(collections.routines);

  const serialized = JSON.stringify(snapshot);
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes < 10_000) throw new Error(`PROD_SCHEMA_SNAPSHOT_TOO_SMALL:${bytes}`);
  if (bytes > 10_000_000) throw new Error(`PROD_SCHEMA_SNAPSHOT_TOO_LARGE:${bytes}`);
  const sha256 = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');

  return {
    ok: true,
    mode: 'LOGICAL_SCHEMA_SNAPSHOT',
    projectRef: projectRef || null,
    capturedAt: new Date(capturedAtMs).toISOString(),
    ageMinutes: Number(ageMinutes.toFixed(2)),
    sha256,
    bytes,
    counts: Object.fromEntries(Object.entries(collections).map(([key, value]) => [key, value.length])),
  };
}

export function verifySchemaRecoverySnapshotFile({ inputPath, summaryPath, projectRef = null } = {}) {
  if (!inputPath) throw new Error('PROD_SCHEMA_SNAPSHOT_INPUT_REQUIRED');
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  try {
    const summary = evaluateSchemaRecoverySnapshot(payload, { projectRef });
    writeSummary(summaryPath, summary);
    return summary;
  } catch (error) {
    writeSummary(summaryPath, {
      ok: false,
      mode: 'LOGICAL_SCHEMA_SNAPSHOT',
      projectRef: projectRef || null,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const [inputPath, summaryPath, projectRef] = process.argv.slice(2);
  const summary = verifySchemaRecoverySnapshotFile({ inputPath, summaryPath, projectRef });
  console.log(`IBERFIT_PROD_SCHEMA_RECOVERY_READY mode=${summary.mode} sha256=${summary.sha256} bytes=${summary.bytes}`);
}
