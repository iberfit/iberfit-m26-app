import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261025231500_signature_u34_coach_atomic_cancel_reschedule_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/rollbacks/20261025231500_signature_u34_coach_atomic_cancel_reschedule_v1.rollback.sql',import.meta.url),'utf8');
const qa=readFileSync(new URL('../qa/sql/signature_u34_coach_cancel_reschedule_rollback_probe.sql',import.meta.url),'utf8');
test('U34 staging: strict coach role, CAS, idempotency, private function',()=>{
 assert.match(sql,/CREATE FUNCTION private\.iberfit_u34_coach_occurrence_change_v1/u);
 assert.match(sql,/SECURITY DEFINER SET search_path TO ''/u);
 assert.match(sql,/role_name<>'coach' OR NOT public\.iberfit_can_access_client_v26/u);
 assert.match(sql,/occ\.revision<>baserev/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.iberfit_u34_coach_occurrence_change_v1/u);
 assert.doesNotMatch(sql,/\bGRANT EXECUTE\b|CREATE OR REPLACE FUNCTION public\./iu);
});
test('U34 cancellation and replacement are all-or-nothing, preserves history',()=>{
 assert.ok(sql.indexOf("'active_execution_client:'")<sql.indexOf("'schedule_client:'"));
 assert.match(sql,/public\.iberfit_persist_entity_v26\(/u);
 assert.match(sql,/U34_REPLACEMENT_NOT_APPLIED/u);
 assert.match(qa,/U34_QA_FAILED_REBOOK_CANCELLED_ORIGINAL/u);
 assert.match(qa,/U34_QA_REBOOK_REPLAY_FAILED/u);
 assert.match(qa,/U34_QA_HISTORY_NOT_PRESERVED/u);
 assert.match(qa,/U34_QA_REUSED_BATCH_ACCEPTED/u);
 assert.match(qa,/U34_QA_APPOINTMENT_DRIFT_ACCEPTED/u);
 assert.match(sql,/batch->>'duplicate' IS DISTINCT FROM 'false'/u);
});
test('U34 rollback cannot delete historical receipts',()=>{
 assert.match(rollback,/u34_rollback_requires_no_persisted_change_receipts/u);
 assert.doesNotMatch(rollback,/DELETE FROM|TRUNCATE|DROP TABLE/iu);
});

test('U34 release transforms use each exact anchor once and reverse all five changes',async()=>{
 const {readFileSync:read}=await import('node:fs');
 const base=new URL('../supabase/release-procedures/gx_u34_prescription_preservation_v1.sql',import.meta.url);
 const forward=read(base,'utf8'),rollback=read(new URL(base.href.replace(/\.sql$/u,'.rollback.sql')),'utf8');
 const pairs=s=>[...s.matchAll(/anchor_text := \$old\$([^]*?)\$old\$;\n replacement_text := \$new\$([^]*?)\$new\$;/gu)].map(m=>[m[1],m[2]]);
 assert.equal(pairs(forward).length,5);
 assert.deepEqual(pairs(rollback),pairs(forward).reverse().map(([a,b])=>[b,a]));
 for(const source of [forward,rollback]){
  assert.equal((source.match(/IF old_count<>1 THEN RAISE EXCEPTION/gu)||[]).length,5);
  assert.equal((source.match(/body := replace\(body,anchor_text,replacement_text\);/gu)||[]).length,5);
  for(const hash of ['ca01ce1428cf906ab3db3dd76f75740f','e3a461a489803b1a7e3c0823bf72e965','4f1a97e2c6feefbc1e51954ebce61dd5'])assert.ok(source.includes(hash));
  assert.match(source,/proacl IS NOT DISTINCT FROM old_acl AND proowner=old_owner/u);
 }
});
