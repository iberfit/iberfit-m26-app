import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 materializeQaSanitizerRollback,SOURCE_PATH,ROLLBACK_TEMPLATE_PATH,
 SOURCE_SHA256,ROLLBACK_SHA256,
} from '../scripts/release/materialize_qa_sanitizer_rollback.mjs';
import {createHash} from 'node:crypto';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
test('M1 QA sanitizer rollback is byte-identical to reviewed reversible SQL',()=>{
 const output=materializeQaSanitizerRollback();
 assert.equal(hash(output),ROLLBACK_SHA256);
 assert.equal(hash(read(SOURCE_PATH)),SOURCE_SHA256);
 assert.match(output,/M1_QA_ENVIRONMENT_REQUIRED/u);
 assert.match(output,/M1_QA_EMPTY_EXECUTION_ROLLBACK_SOURCE_DRIFT/u);
 assert.match(output,/M1_QA_EMPTY_EXECUTION_ROLLBACK_READBACK_FAILED/u);
 const template=read(ROLLBACK_TEMPLATE_PATH);
 assert.match(template,/M1_QA_SANITIZER_ROLLBACK_MATERIALIZATION_REQUIRED/u);
 assert.doesNotMatch(template,/EXECUTE v_changed/u);
});
test('QA sanitizer materialization rejects source drift and tampered template',()=>{
 assert.throws(()=>materializeQaSanitizerRollback({readSource:path=>
  path===SOURCE_PATH?read(path)+' altered':read(path)}),/M1_QA_SANITIZER_SOURCE_DRIFT/u);
 assert.throws(()=>materializeQaSanitizerRollback({readSource:path=>
  path===ROLLBACK_TEMPLATE_PATH?read(path).replace('ROLLBACK_MATERIALIZATION_REQUIRED','BYPASS'):read(path)}),/M1_QA_SANITIZER_TEMPLATE_DRIFT/u);
});
