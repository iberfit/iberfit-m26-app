import {materializeU72QaRollback} from '../scripts/release/materialize_u72_prod_sql.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/qa-migrations/20261113013000_m1_u72_dated_pause_resume_qa_v1.sql',import.meta.url),'utf8');
const reverse=materializeU72QaRollback();
test('U72 pause/resume migration is QA-only and preserves U31 receipts and old SQL contracts',()=>{
 assert.match(sql,/M1_U72_QA_SOURCE_OR_STATE_DRIFT/u);
 assert.ok(sql.includes("value#>>'{}'='QA'"));
 assert.match(sql,/OCURRENCIA_PAUSAR/u);
 assert.match(sql,/OCURRENCIA_REANUDAR/u);
 assert.match(sql,/active_execution_client:/u);
 assert.match(sql,/pg_advisory_xact_lock/u);
 assert.match(sql,/command_receipts_v26/u);
 assert.match(sql,/OPERATION_ID_REUSED/u);
 assert.match(sql,/executionBaseRevision/u);
 assert.match(sql,/EXECUTION_PAUSED/u);
 assert.match(sql,/U72_EXECUTION_INTEGRITY_DRIFT/u);
 assert.match(sql,/U72_TYPED_CAS_LOST/u);
 assert.match(sql,/M1_U72_QA_POSTINSTALL_SECURITY_DRIFT/u);
 for(const role of ['PUBLIC','anon','authenticated','service_role'])assert.ok(sql.includes(role));
 assert.match(reverse,/M1_U72_QA_ROLLBACK_UNSAFE/u);
 assert.match(reverse,/M1_U72_QA_ROLLBACK_DRIFT/u);
 assert.ok(reverse.includes('DROP FUNCTION private.iberfit_u72_occurrence_pause_resume_v1'));
});

test('U72 QA precedence repair has exact source hashes and no direct grants',()=>{
  const fix=readFileSync(new URL('../supabase/qa-migrations/20261113015000_m1_u72_payload_shape_precedence_qa_v1.sql',import.meta.url),'utf8');
  const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261113015000_m1_u72_payload_shape_precedence_qa_v1.rollback.sql',import.meta.url),'utf8');
  assert.ok(fix.includes("((p_command->'payload')-'executionId'-'executionBaseRevision')"));
  assert.match(fix,/U72_PRECEDENCE_SOURCE_DRIFT/u);
  assert.match(fix,/U72_PRECEDENCE_CANDIDATE_DRIFT/u);
  assert.match(fix,/U72_PRECEDENCE_READBACK_OR_ACL_DRIFT/u);
  assert.match(rollback,/U72_PRECEDENCE_ROLLBACK_UNSAFE/u);
  assert.match(rollback,/U72_PRECEDENCE_ROLLBACK_READBACK_FAILED/u);
  assert.doesNotMatch(fix,/\bDROP TABLE\b|\bTRUNCATE\b/iu);
});
