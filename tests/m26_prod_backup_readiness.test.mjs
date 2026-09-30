import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBackupReadiness } from '../scripts/data-safety/check_prod_backup_readiness.mjs';

const NOW = Date.parse('2026-09-29T03:00:00.000Z');

function dailyPayload(insertedAt, overrides = {}) {
  return {
    region: 'us-east-1',
    walg_enabled: false,
    pitr_enabled: false,
    backups: [
      {
        id: 1,
        is_physical_backup: true,
        status: 'COMPLETED',
        inserted_at: insertedAt,
      },
    ],
    physical_backup_data: null,
    ...overrides,
  };
}

test('accepts a recent completed daily production backup', () => {
  const result = evaluateBackupReadiness(dailyPayload('2026-09-28T03:30:00.000Z'), { nowMs: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'DAILY_BACKUP');
  assert.equal(result.completedBackupCount, 1);
  assert.equal(result.ageHours, 23.5);
});

test('rejects a stale daily production backup', () => {
  assert.throws(
    () => evaluateBackupReadiness(dailyPayload('2026-09-27T12:00:00.000Z'), { nowMs: NOW }),
    /PROD_BACKUP_TOO_OLD/,
  );
});

test('rejects daily mode when there is no completed backup', () => {
  const payload = dailyPayload('2026-09-28T03:30:00.000Z');
  payload.backups[0].status = 'FAILED';
  assert.throws(
    () => evaluateBackupReadiness(payload, { nowMs: NOW }),
    /PROD_BACKUP_COMPLETED_BACKUP_MISSING/,
  );
});

test('accepts PITR only with WAL-G and a physical recovery base', () => {
  const result = evaluateBackupReadiness(
    {
      region: 'us-east-1',
      walg_enabled: true,
      pitr_enabled: true,
      backups: [],
      physical_backup_data: {
        latest_physical_backup_date_unix: Math.floor(Date.parse('2026-09-25T03:00:00.000Z') / 1000),
      },
    },
    { nowMs: NOW },
  );

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'PITR');
  assert.equal(result.walgEnabled, true);
});

test('rejects an inconsistent PITR response without WAL-G', () => {
  assert.throws(
    () => evaluateBackupReadiness(
      {
        walg_enabled: false,
        pitr_enabled: true,
        backups: [],
        physical_backup_data: {
          latest_physical_backup_date_unix: Math.floor(Date.parse('2026-09-28T03:00:00.000Z') / 1000),
        },
      },
      { nowMs: NOW },
    ),
    /PROD_BACKUP_PITR_WITHOUT_WALG/,
  );
});

test('rejects PITR when no recovery base exists', () => {
  assert.throws(
    () => evaluateBackupReadiness(
      {
        walg_enabled: true,
        pitr_enabled: true,
        backups: [],
        physical_backup_data: {},
      },
      { nowMs: NOW },
    ),
    /PROD_BACKUP_PITR_RECOVERY_BASE_MISSING/,
  );
});
