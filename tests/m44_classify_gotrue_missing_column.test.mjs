import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {classifyMissingColumn} from '../scripts/ops/m44_classify_gotrue_missing_column.mjs';

test('42703 diagnostics classify only known schema names', () => {
  assert.equal(classifyMissingColumn('pq: column "oauth_client_id" does not exist (SQLSTATE 42703)'), 'OAUTH_CLIENT_ID');
  assert.equal(classifyMissingColumn('error: column refresh_token_hmac_key of relation "auth.sessions" does not exist SQLSTATE 42703'), 'REFRESH_TOKEN_HMAC_KEY');
  assert.equal(classifyMissingColumn('column "private_synthetic_identity_123" does not exist SQLSTATE 42703'), 'UNLISTED');
  assert.equal(classifyMissingColumn('column "email" does not exist SQLSTATE 42703'), 'UNLISTED');
  assert.equal(classifyMissingColumn('SQLSTATE 42703 with unspecified column'), 'UNKNOWN');
  assert.equal(classifyMissingColumn('column "oauth_client_id" does not exist SQLSTATE 23505'), 'NO_42703');
  assert.equal(classifyMissingColumn('x'.repeat(4_000_001)), 'UNAVAILABLE');
  assert.equal(classifyMissingColumn(null), 'UNAVAILABLE');
});
test('CLI emits a fixed diagnostic only for expected isolated path', () => {
  const root=mkdtempSync(join(tmpdir(),'iberfit-m44-classify-'));
  try {
    const privateDir=join(root,'m44-hosted-auth-private');
    mkdirSync(privateDir);
    const privateLog=join(privateDir,'gotrue-failure-private.log');
    writeFileSync(privateLog,'user private-client-123@example.invalid: column "oauth_client_id" does not exist SQLSTATE 42703');
    const r=spawnSync(process.execPath,['scripts/ops/m44_classify_gotrue_missing_column.mjs',privateLog],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);
    assert.equal(r.stdout.trim(),'M44_AUTH_RUNTIME_42703_COLUMN_OAUTH_CLIENT_ID');
    assert.doesNotMatch(r.stdout+r.stderr,/private-client|example.invalid/);
    const wrong=join(root,'other.log');
    writeFileSync(wrong,'column "oauth_client_id" does not exist SQLSTATE 42703');
    const denied=spawnSync(process.execPath,['scripts/ops/m44_classify_gotrue_missing_column.mjs',wrong],{encoding:'utf8'});
    assert.equal(denied.stdout.trim(),'M44_AUTH_RUNTIME_42703_COLUMN_UNAVAILABLE');
  } finally {
    rmSync(root,{recursive:true,force:true});
  }
});
