import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_MAX_DAILY_BACKUP_AGE_HOURS = 36;

function parseIsoMs(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function parseUnixMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 10_000_000_000 ? numeric : numeric * 1000;
}

export function evaluateBackupReadiness(
  payload,
  {
    nowMs = Date.now(),
    maxDailyBackupAgeHours = DEFAULT_MAX_DAILY_BACKUP_AGE_HOURS,
  } = {},
) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('BACKUP_API_RESPONSE_INVALID');
  }

  if (!Number.isFinite(nowMs) || nowMs <= 0) {
    throw new Error('BACKUP_NOW_INVALID');
  }

  if (!Number.isFinite(maxDailyBackupAgeHours) || maxDailyBackupAgeHours <= 0) {
    throw new Error('BACKUP_MAX_AGE_INVALID');
  }

  const backups = Array.isArray(payload.backups) ? payload.backups : [];
  const completed = backups
    .filter((backup) => backup?.status === 'COMPLETED')
    .map((backup) => ({ ...backup, insertedAtMs: parseIsoMs(backup.inserted_at) }))
    .filter((backup) => backup.insertedAtMs !== null)
    .sort((a, b) => b.insertedAtMs - a.insertedAtMs);

  const latestCompleted = completed[0] || null;
  const latestPhysicalMs = parseUnixMs(payload.physical_backup_data?.latest_physical_backup_date_unix);
  const pitrEnabled = payload.pitr_enabled === true;
  const walgEnabled = payload.walg_enabled === true;

  if (pitrEnabled) {
    if (!walgEnabled) {
      throw new Error('PROD_BACKUP_PITR_WITHOUT_WALG');
    }

    const recoveryBaseMs = latestPhysicalMs ?? latestCompleted?.insertedAtMs ?? null;
    if (recoveryBaseMs === null) {
      throw new Error('PROD_BACKUP_PITR_RECOVERY_BASE_MISSING');
    }

    return {
      ok: true,
      mode: 'PITR',
      pitrEnabled,
      walgEnabled,
      completedBackupCount: completed.length,
      latestBackupAt: new Date(recoveryBaseMs).toISOString(),
      ageHours: Number(((nowMs - recoveryBaseMs) / 3_600_000).toFixed(2)),
    };
  }

  if (!latestCompleted) {
    throw new Error('PROD_BACKUP_COMPLETED_BACKUP_MISSING');
  }

  const ageHours = (nowMs - latestCompleted.insertedAtMs) / 3_600_000;
  if (ageHours < -1) {
    throw new Error('PROD_BACKUP_TIMESTAMP_IN_FUTURE');
  }
  if (ageHours > maxDailyBackupAgeHours) {
    throw new Error(`PROD_BACKUP_TOO_OLD:${ageHours.toFixed(2)}h`);
  }

  return {
    ok: true,
    mode: 'DAILY_BACKUP',
    pitrEnabled,
    walgEnabled,
    completedBackupCount: completed.length,
    latestBackupAt: new Date(latestCompleted.insertedAtMs).toISOString(),
    ageHours: Number(ageHours.toFixed(2)),
  };
}

export function verifyBackupReadinessFile({ inputPath, summaryPath } = {}) {
  if (!inputPath) throw new Error('BACKUP_INPUT_PATH_REQUIRED');
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const summary = evaluateBackupReadiness(payload);

  if (summaryPath) {
    fs.mkdirSync(new URL('.', pathToFileURL(summaryPath)), { recursive: true });
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }

  return summary;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const [inputPath, summaryPath] = process.argv.slice(2);
  const summary = verifyBackupReadinessFile({ inputPath, summaryPath });
  console.log(
    `IBERFIT_PROD_BACKUP_READY mode=${summary.mode} latest=${summary.latestBackupAt} ageHours=${summary.ageHours}`,
  );
}
