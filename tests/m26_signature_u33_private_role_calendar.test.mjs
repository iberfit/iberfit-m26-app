import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261025222500_signature_u33_private_role_calendar_v1.sql',import.meta.url),'utf8');
const qa=readFileSync(new URL('../qa/sql/signature_u33_role_calendar_rollback_probe.sql',import.meta.url),'utf8');

test('U33: private calendar function enforces role, authenticated owner and bounded window',()=>{
  assert.match(sql,/CREATE FUNCTION private\.iberfit_u33_occurrence_calendar_v1\(/u);
  assert.match(sql,/STABLE SECURITY DEFINER\s+SET search_path TO ''/u);
  assert.match(sql,/auth\.uid\(\)/u);
  assert.match(sql,/v_role NOT IN \('coach','cliente'\)/u);
  assert.match(sql,/public\.iberfit_can_access_client_v26\(p_client_id\)/u);
  assert.match(sql,/up\.user_id=v_actor AND up\.client_id=p_client_id/u);
  assert.match(sql,/p_end_date-p_start_date NOT BETWEEN 0 AND 366/u);
  assert.match(sql,/p_limit NOT BETWEEN 1 AND 52/u);
  assert.match(sql,/REVOKE ALL ON FUNCTION private\.iberfit_u33_occurrence_calendar_v1\(uuid,date,date,integer\)\s+FROM PUBLIC,anon,authenticated,service_role/u);
});

test('U33: Client sees only confirmed authorized guided dates and no Coach prescription',()=>{
  assert.match(sql,/e\.body->>'deliveryModality'='guiada_en_app'/u);
  assert.match(sql,/e\.body->>'clientVisibilityLevel'='full'/u);
  assert.match(sql,/e\.body->>'visibleToClient'='true'/u);
  assert.match(sql,/o\.status IN \('confirmada','en_curso','completada'\)/u);
  assert.match(sql,/o\.status<>'confirmada' OR a\.status='confirmada'/u);
  assert.doesNotMatch(sql,/jsonb_build_object\([\s\S]*?'prescriptionSnapshot'/u);
  assert.match(qa,/U33_QA_CLIENT_PROJECTION_UNSAFE_OR_MISSING/u);
  assert.match(qa,/U33_QA_CROSS_CLIENT_CALENDAR_ACCEPTED/u);
  assert.match(qa,/U33_QA_DOWNGRADED_VISIBILITY_LEAKED/u);
  assert.match(qa,/U33_QA_CANCELLED_APPOINTMENT_VISIBLE/u);
  assert.match(qa,/U33_QA_CLIENT_CALENDAR_TRUNCATION_WRONG/u);
  assert.match(qa,/U33_QA_PRIVATE_PROJECTION_EXPOSED/u);
});

test('U33: Coach calendar includes planned rows with stable date order and truncation',()=>{
  assert.match(sql,/ORDER BY o\.local_date,o\.starts_at NULLS LAST,o\.id/u);
  assert.match(sql,/LIMIT v_limit\+1/u);
  assert.match(sql,/count\(\*\)>v_limit/u);
  assert.match(sql,/'scope',CASE WHEN v_role='cliente'/u);
  assert.match(qa,/U33_QA_COACH_MISSING_DRAFT_OR_CONFIRMED/u);
});
