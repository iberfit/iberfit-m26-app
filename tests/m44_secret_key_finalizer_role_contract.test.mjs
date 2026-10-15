import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const baselineUrl=new URL('../supabase/migrations/20261015143500_m44_immutable_evolution_pdf_ledger_v1.sql',import.meta.url);
const hardeningUrl=new URL('../supabase/migrations/20261015214000_m44_pdf_modern_service_role_guard_v1.sql',import.meta.url);
const signature='public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)';
const legacyGuard="coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'";
const modernGuard="coalesce(current_setting('role',true),'')<>'service_role'";
function fn(sql){
  const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.iberfit_m44_finalize_evolution_report_issue_v1(');
  const end=sql.indexOf('END $fn$;',start);
  assert.ok(start>=0&&end>start,'Official finalizer function must exist');
  return sql.slice(start,end+'END $fn$;'.length);
}
test('M44 modern Supabase secret authorizes finalizer using PostgREST impersonated database role, never JWT-only claims',async()=>{
  const base=await readFile(baselineUrl,'utf8'),next=await readFile(hardeningUrl,'utf8');
  const oldFn=fn(base),newFn=fn(next);
  assert.equal(oldFn.split(legacyGuard).length,2,'Baseline finalizer JWT guard changed unexpectedly');
  assert.equal(newFn,oldFn.replace(legacyGuard,modernGuard),
    'Finalizer must retain all original role/scope/revision/storage/idempotency checks without modification');
  assert.match(newFn,/SECURITY DEFINER SET search_path=''/);
  assert.match(newFn,/M44_PDF_FINALIZE_SERVICE_ONLY/);
  assert.match(newFn,/v_actor IS NULL/);
  assert.match(newFn,/client_assignments/);
  assert.match(newFn,/pg_advisory_xact_lock/);
  assert.match(newFn,/M44_PDF_FINALIZE_STALE_SOURCE/);
  assert.match(newFn,/M44_PDF_FINALIZE_STORAGE_OBJECT_MISSING/);
  assert.match(newFn,/M44_PDF_ISSUANCE_REQUEST_COLLISION/);
  assert.doesNotMatch(newFn,/request\.jwt\.claim\.role/);
  assert.doesNotMatch(newFn,/current_user\s*=|session_user\s*=/i);
});
test('M44 finalizer is executable only by service_role, with explicit postmigration ACL verification',async()=>{
  const sql=await readFile(hardeningUrl,'utf8');
  const normalized=sql.replace(/\s+/g,' ');
  assert.ok(normalized.includes('REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC, anon, authenticated;'));
  assert.ok(normalized.includes('GRANT EXECUTE ON FUNCTION '+signature+' TO service_role;'));
  for(const role of ['service_role','anon','authenticated']){
    assert.ok(normalized.includes("has_function_privilege('"+role+"','"+signature+"','EXECUTE')"),
      'Missing postmigration ACL assertion for '+role);
  }
  assert.match(sql,/m44_finalize_service_only_acl_guard/);
  assert.doesNotMatch(sql,/GRANT\s+EXECUTE[\s\S]*\bTO\s+(?:PUBLIC|anon|authenticated)\s*;/i);
});
