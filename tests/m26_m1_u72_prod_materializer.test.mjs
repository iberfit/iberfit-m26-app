import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256Sql,materializeU72ProductionSql,materializeU72QaRollback,materializeU72ProductionRollbackWrapper,U72_SOURCE,U72_TEMPLATE,U72_OUTPUT_SHA,U72_SOURCE_SHA} from '../scripts/release/materialize_u72_prod_sql.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('M1 U72 materialization restores the exact pre-reviewed PROD SQL bytes',()=>{
 for(const kind of ['install','rollback']){
  const sql=materializeU72ProductionSql(kind);
  assert.equal(sha256Sql(sql),U72_OUTPUT_SHA[kind]);
  assert.match(sql,/M1_U72_PROD_ENVIRONMENT_DENIED/u);
  assert.match(sql,/\nBEGIN;[\s\S]*\nCOMMIT;\s*$/u);
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
   path===U72_SOURCE.install?read(path)+' -- tampered':read(path)}),
   /M1_U72_QA_CANONICAL_SOURCE_DRIFT/u);
  assert.throws(()=>materializeU72ProductionSql(kind,{readSource:path=>
   path===U72_TEMPLATE[kind]?
     (kind==='rollback'?read(path).replace('M1_U72_PROD_ROLLBACK_WRAPPER_REQUIRED','TAMPERED'):
       read(path).replace('BEGIN;','BEGIN; -- tampered')):read(path)}),
   kind==='rollback'?/M1_U72_PROD_ROLLBACK_TEMPLATE_DRIFT/u:/M1_U72_PROD_SQL_OUTPUT_DRIFT/u);
  assert.throws(()=>materializeU72ProductionSql(kind,{readSource:path=>
   path===U72_TEMPLATE[kind]?read(path).replace('M1_U72_MATERIALIZATION_REQUIRED','M1_U72_UNSAFE'):read(path)}),
   kind==='rollback'?/M1_U72_PROD_ROLLBACK_TEMPLATE_DRIFT/u:/M1_U72_TEMPLATE_MARKER_INVALID/u);
 }
 assert.throws(()=>materializeU72ProductionSql('qa'),/M1_U72_UNKNOWN_PROCEDURE/u);
});

test('QA U72 rollback is materialized from immutable forward source without duplicate function bodies',()=>{
 const reverse=materializeU72QaRollback();
 assert.equal(sha256Sql(reverse),U72_SOURCE_SHA.rollback);
 assert.match(reverse,/M1_U72_QA_ROLLBACK_UNSAFE/u);
 assert.match(reverse,/DROP FUNCTION private\.iberfit_u72_occurrence_pause_resume_v1/u);
 const tmpl=read(U72_SOURCE.rollback);
 assert.match(tmpl,/M1_U72_QA_ROLLBACK_MATERIALIZATION_REQUIRED/u);
 assert.doesNotMatch(tmpl,/^CREATE OR REPLACE FUNCTION/mu);
 assert.throws(()=>materializeU72QaRollback({readSource:path=>
   path===U72_SOURCE.install?read(path)+' -- altered':read(path)}),
   /M1_U72_QA_CANONICAL_SOURCE_DRIFT/u);
 assert.throws(()=>materializeU72QaRollback({readSource:path=>
   path===U72_SOURCE.rollback?read(path).replace('M1_U72_QA_ROLLBACK_MATERIALIZATION_REQUIRED','SILENT'):read(path)}),
   /M1_U72_QA_ROLLBACK_TEMPLATE_DRIFT/u);
});

test('rollback wrapper retains exact approved preflight and ACL while avoiding a second source copy',()=>{
 const wrapper=materializeU72ProductionRollbackWrapper();
 assert.match(wrapper,/M1_U72_PROD_ENVIRONMENT_DENIED/u);
 assert.match(wrapper,/M1_U72_PROD_AUTH_ACL_DRIFT/u);
 assert.match(wrapper,/M1_U72_PROD_MUST_BE_CLOSED_AND_DRAINED/u);
 const sql=materializeU72ProductionSql('rollback');
 assert.equal(sha256Sql(sql),U72_OUTPUT_SHA.rollback);
 assert.throws(()=>materializeU72ProductionRollbackWrapper({readSource:path=>
  path===U72_TEMPLATE.install?read(path).replace('BEGIN;','BEGIN; -- drift'):read(path)}),
  /M1_U72_PROD_INSTALL_TEMPLATE_DRIFT/u);
});
