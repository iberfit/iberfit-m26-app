import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scriptPath=path.join(root,'scripts','final_production_sql_execute.ps1');
const source=fs.readFileSync(scriptPath,'utf8').replace(/\r\n/gu,'\n');

const RELEASE_SHA='9cbe3ad29dfda0a552aa54c7e1404575b96786d4';
const SQL_SHA='30e4f4750a4df9a2c5ab8f710427aac0d2112a308309221b5188e5c09d1ea2db';
const PROJECT_REF='pjhmrhejsoofmouedavw';

test('final production executor is pinned to the exact certified release and bundle',()=>{
  for(const required of [
    RELEASE_SHA,
    SQL_SHA,
    PROJECT_REF,
    '33656032685',
    'sha256:9879456becbcdc0f851c721a14da2a9646d49da588c0948f7fefe3f238f520d2',
    'bb3c8890986f2bb0aadcf0213d2772dbcbdaf8c4',
    'final-production-promotion-sql',
    'prep/final-production-rc74-4',
    'canary/rc74-4',
  ])assert.ok(source.includes(required),`missing pin: ${required}`);

  assert.match(source,/Assert-ReleaseRefs[\s\S]*?Production SQL changed after preflight/iu);
  assert.match(source,/Get-FileHash\s+-Algorithm\s+SHA256/iu);
  assert.match(source,/artifact\[0\]\.digest\s+-ne\s+\$ExpectedArtifactDigest/iu);
});

test('executor defaults to read-only and requires two explicit mutation signals',()=>{
  assert.match(source,/\[switch\]\$Apply/iu);
  assert.match(source,/if\s*\(-not\s+\$Apply\)[\s\S]*?ProductionMutations=0/iu);
  assert.match(source,/\$ExpectedConfirmation\s*=\s*"APPLY IBERFIT PRODUCTION \$ExpectedReleaseSha"/u);
  assert.match(source,/if\s*\(\$Confirmation\s+-cne\s+\$ExpectedConfirmation\)/iu);

  assert.match(source,/default_transaction_read_only=on/iu);
  assert.match(source,/FINAL_PRODUCTION_PREFLIGHT_READONLY\.sql/iu);
  assert.match(source,/ExpectedPreflightBlobSha/iu);
});

test('mutating SQL is atomic and stops on the first database error',()=>{
  assert.match(source,/--single-transaction/iu);
  assert.match(source,/--set=ON_ERROR_STOP=1/iu);
  assert.match(source,/Production SQL promotion/iu);
  assert.match(source,/TransactionAtomic=true/iu);
});

test('database targeting is production-specific without embedding credentials',()=>{
  assert.match(source,/IBERFIT_PROD_PROJECT_REF/iu);
  assert.match(source,/PGHOST/iu);
  assert.match(source,/PGUSER/iu);
  assert.match(source,/PGPASSWORD/iu);
  assert.match(source,/PGSSLMODE/iu);
  assert.match(source,/PGSSLMODE\.ToLowerInvariant\(\)\s+-ne\s+'require'/iu);
  assert.match(source,/targetFingerprint[\s\S]*?ExpectedProjectRef/iu);
  assert.match(source,/--no-password/iu);

  assert.doesNotMatch(source,/sb_service_role_/iu);
  assert.doesNotMatch(source,/service[_-]?role\s*[:=]\s*['"][A-Za-z0-9._-]+/iu);
  assert.doesNotMatch(source,/postgres(?:ql)?:\/\//iu);
  assert.doesNotMatch(source,/supabase\.co:\d+\/postgres/iu);
});

test('executor cannot silently claim the complete launch after SQL only',()=>{
  assert.ok(source.includes('EdgeFunctionDeployed=false'));
  assert.ok(source.includes('FrontendDeployed=false'));
  assert.doesNotMatch(source,/wrangler\s+pages\s+deploy/iu);
  assert.doesNotMatch(source,/supabase\s+functions\s+deploy/iu);
});
