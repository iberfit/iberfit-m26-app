import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyM44RestoreFailure} from '../scripts/ops/m44_managed_pg_restore_failure.mjs';

test('M44 restore errors produce bounded non-sensitive classifications only',()=>{
 const synthetic=[
  ['ERROR: permission denied for schema public','PERMISSION_OR_OWNER'],
  ['ERROR: relation "missing" does not exist','MISSING_DEPENDENCY'],
  ['ERROR: column "obsolete" does not exist','COLUMN_SCHEMA_DRIFT'],
  ['ERROR: insert violates foreign key constraint "fk_client"','FOREIGN_KEY_INTEGRITY'],
  ['ERROR: duplicate key value violates unique constraint','UNIQUE_CONFLICT'],
  ['pg_restore: error: COPY failed for table "secret"','POSTGRES_COPY_FAILED'],
  ['ERROR: role "pg_test" does not exist','MISSING_ROLE_OR_TYPE'],
  ['server closed the connection unexpectedly','CONNECTION_OR_POOLER']
 ];
 for(const [raw,expected] of synthetic){
  const actual=classifyM44RestoreFailure(raw,{status:1});
  assert.equal(actual.code,'M44_MANAGED_SQL_'+expected);
  assert.equal(actual.redacted,true);
  assert.equal(actual.exit,1);
  assert.equal(actual.prodWritesAuthorized,false);
  assert.equal(actual.managedRestorationCertified,false);
  assert.doesNotMatch(JSON.stringify(actual),/secret|obsolete|fk_client|pg_test|schema public/iu);
 }
});
test('M44 never prints unknown SQLSTATE or arbitrary SQL excerpts',()=>{
 const confidential='Client email someone@example.test\nINSERT INTO private.x VALUES (''sensitive'')\nSQLSTATE ZZZZZ';
 const r=classifyM44RestoreFailure(confidential,{status:1});
 assert.equal(r.code,'M44_MANAGED_SQL_UNKNOWN');
 assert.equal(r.sqlstate,null);
 assert.doesNotMatch(JSON.stringify(r),/someone|sensitive|ZZZZZ/iu);
});
test('Known SQLSTATE wins over untrusted text and records only safe code',()=>{
 const r=classifyM44RestoreFailure('SQLSTATE 23503\nclient personal material',{status:1});
 assert.equal(r.code,'M44_MANAGED_SQL_FOREIGN_KEY_INTEGRITY');
 assert.equal(r.sqlstate,'23503');
});
test('Timeout and oversized output are controlled, never raw subprocess errors',()=>{
 assert.equal(classifyM44RestoreFailure('private SQL',{error:{code:'ETIMEDOUT'}}).code,'M44_MANAGED_SQL_PROCESS_TIMEOUT');
 assert.equal(classifyM44RestoreFailure('private SQL',{error:{code:'ENOBUFS'}}).code,'M44_MANAGED_SQL_PROCESS_OUTPUT_LIMIT');
});
test('The manager consumes classification without logging pg_restore stderr/stdout',()=>{
 const source=readFileSync('scripts/ops/m44_managed_real_recovery.mjs','utf8');
 assert.match(source,/classifyM44RestoreFailure\(res\.stderr,res\)/u);
 assert.match(source,/M44_MANAGED_RESTORE_FAILURE_CLASS=/u);
 assert.doesNotMatch(source,/console\.(log|error)\s*\([^)]*res\.stderr/u);
 assert.doesNotMatch(source,/console\.(log|error)\s*\([^)]*res\.stdout/u);
 assert.match(source,/MANAGED_SQL_RESTORE_FAILED_CLOSED/u);
});
