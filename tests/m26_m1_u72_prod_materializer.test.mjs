import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gitBlobSha,materializeU72ProductionSql,U72_SOURCE,U72_TEMPLATE,U72_OUTPUT_SHA} from '../scripts/release/materialize_u72_prod_sql.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('M1 U72 materialization restores the exact pre-reviewed PROD SQL bytes',()=>{
 for(const kind of ['install','rollback']){
  const sql=materializeU72ProductionSql(kind);
  assert.equal(gitBlobSha(sql),U72_OUTPUT_SHA[kind]);
  assert.match(sql,/M1_U72_PROD_ENVIRONMENT_DENIED/u);
  assert.match(sql,/^BEGIN;[\s\S]*COMMIT;\s*$/u);
  assert.doesNotMatch(sql,/M1_U72_MATERIALIZATION_REQUIRED/u);
  const template=read(U72_TEMPLATE[kind]);
  assert.match(template,/M1_U72_MATERIALIZATION_REQUIRED/u);
  assert.doesNotMatch(template,/^CREATE OR REPLACE FUNCTION/mu);
  assert.doesNotMatch(template,/GRANT EXECUTE ON FUNCTION public\.iberfit_occurrence_api_u60_v1/u);
 }
});
test('tampered QA source, templates and invalid mode all fail closed',()=>{
 for(const kind of ['install','rollback']){
  assert.throws(()=>materializeU72ProductionSql(kind,{readSource:path=>
   path===U72_SOURCE[kind]?read(path)+' -- tampered':read(path)}),
   /M1_U72_QA_CANONICAL_SOURCE_DRIFT/u);
  assert.throws(()=>materializeU72ProductionSql(kind,{readSource:path=>
   path===U72_TEMPLATE[kind]?read(path).replace('BEGIN;','BEGIN; -- tampered'):read(path)}),
   /M1_U72_PROD_SQL_OUTPUT_DRIFT/u);
  assert.throws(()=>materializeU72ProductionSql(kind,{readSource:path=>
   path===U72_TEMPLATE[kind]?read(path).replace('M1_U72_MATERIALIZATION_REQUIRED','M1_U72_UNSAFE'):read(path)}),
   /M1_U72_TEMPLATE_MARKER_INVALID/u);
 }
 assert.throws(()=>materializeU72ProductionSql('qa'),/M1_U72_UNKNOWN_PROCEDURE/u);
});
