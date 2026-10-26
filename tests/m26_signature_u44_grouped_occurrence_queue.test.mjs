import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=readFileSync(new URL('../supabase/migrations/20261025203500_signature_u32_private_coach_occurrence_batch_v1.sql',import.meta.url),'utf8');
const r=readFileSync(new URL('../supabase/rollbacks/20261025203500_signature_u32_private_coach_occurrence_batch_v1.rollback.sql',import.meta.url),'utf8');
const q=readFileSync(new URL('../qa/sql/signature_u44_grouped_execution_queue_rollback_probe.sql',import.meta.url),'utf8');
test('U44 all five grouped types generate U31-ready per-exercise queue members',()=>{
 assert.match(m,/CREATE FUNCTION private\.iberfit_u32_build_execution_queue_v1\(p_blocks jsonb\)/u);
 assert.match(m,/t IN \('biserie','triserie','circuito','amrap','tabata'\)/u);
 assert.match(m,/'queue',private\.iberfit_u32_build_execution_queue_v1\(v_source\.body->'blocks'\)/u);
 assert.match(m,/'groupOrder',idx,'groupSize',size_group/u);
 assert.match(q,/U44_U31_START_VALIDATOR_REJECTED_QUEUE/u);
 assert.match(q,/U44_GROUPED_EXECUTION_QUEUE_QA_PASS/u);
});
test('U44 unsupported, empty and malformed groups fail closed; rollback preserves history',()=>{
 assert.match(m,/U44_UNKNOWN_BLOCK_TYPE/u);
 assert.match(m,/U44_GROUP_PRESCRIPTION_INVALID/u);
 assert.match(m,/U44_QUEUE_TOO_LARGE/u);
 assert.match(q,/U44_ZERO_SETS_ACCEPTED/u);
 assert.match(q,/U44_INVALID_PRESCRIPTION_ACCEPTED/u);
 assert.match(r,/DROP FUNCTION private\.iberfit_u32_build_execution_queue_v1\(jsonb\)/u);
 assert.doesNotMatch(r,/DELETE FROM|TRUNCATE|DROP TABLE/iu);
});

test('U44 migration delimiters and function declarations remain singular (regression: duplicate SQL from string replacement)',()=>{
  const count=(source,needle)=>source.split(needle).length-1;
  assert.equal(count(m,'CREATE FUNCTION private.iberfit_u32_create_occurrences_batch_v1('),1);
  assert.equal(count(m,'CREATE FUNCTION private.iberfit_u32_build_execution_queue_v1('),1);
  assert.equal(count(m,'$u32$'),2,'one open and one close for the U32 handler');
  assert.equal(count(m,'$queue$'),2,'one open and one close for the U44 queue');
  assert.equal(count(m,'v_snapshot:=jsonb_build_object('),1);
  assert.equal(count(m,"'queue',private.iberfit_u32_build_execution_queue_v1("),1);
  assert.equal(count(r,'DROP FUNCTION private.iberfit_u32_create_occurrences_batch_v1(jsonb);'),1);
  assert.equal(count(r,'DROP FUNCTION private.iberfit_u32_build_execution_queue_v1(jsonb);'),1);
});
