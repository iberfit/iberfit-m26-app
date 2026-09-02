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

test('retired executor remains pinned to the certified historical bundle',()=>{
  for(const required of [
    RELEASE_SHA,
    SQL_SHA,
    PROJECT_REF,
    '33656032685',
    'sha256:9879456becbcdc0f851c721a14da2a9646d49da588c0948f7fefe3f238f520d2',
    'final-production-promotion-sql',
    'prep/final-production-rc74-4',
    'canary/rc74-4',
  ])assert.ok(source.includes(required),`missing pin: ${required}`);

  assert.match(source,/Assert-ReleaseRefs/iu);
  assert.match(source,/artifact\[0\]\.digest\s+-ne\s+\$ExpectedArtifactDigest/iu);
});

test('superseded production SQL bundle cannot be applied',()=>{
  assert.match(source,/\[switch\]\$Apply/iu);
  assert.match(source,/if\s*\(\$Apply\s+-or\s+-not\s+\[string\]::IsNullOrWhiteSpace\(\$Confirmation\)\)/iu);
  assert.match(source,/SQL apply is disabled: the pinned production SQL bundle is superseded/iu);
  assert.ok(source.includes('ApplyDisabled=true'));
  assert.ok(source.includes('ProductionMutations=0'));
  assert.ok(source.includes('BLOCKED · PRODUCTION SQL BUNDLE SUPERSEDED'));
});

test('retirement records the observed production migration frontier without credentials or data',()=>{
  assert.ok(source.includes("$ObservedMigrationFloor = '20260831163404'"));
  assert.ok(source.includes("$ObservedMigrationCeiling = '20260902033214'"));
  assert.match(source,/live production already contains the RC74\.4\/RC65\/P0 production migration sequence/iu);

  assert.doesNotMatch(source,/PGPASSWORD/iu);
  assert.doesNotMatch(source,/sb_service_role_/iu);
  assert.doesNotMatch(source,/service[_-]?role\s*[:=]\s*['"][A-Za-z0-9._-]+/iu);
  assert.doesNotMatch(source,/postgres(?:ql)?:\/\//iu);
});

test('retired executor contains no production mutation command',()=>{
  assert.doesNotMatch(source,/\bpsql\b/iu);
  assert.doesNotMatch(source,/wrangler\s+pages\s+deploy/iu);
  assert.doesNotMatch(source,/supabase\s+functions\s+deploy/iu);
  assert.doesNotMatch(source,/Production SQL promotion/iu);
});
