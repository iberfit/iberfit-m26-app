import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationNames=fs.readdirSync('supabase/migrations')
  .filter((name)=>/^\d{14}_rc65_c2_c3_invoker_assurance_compat\.sql$/u.test(name));
assert.equal(migrationNames.length,1,'exactly one corrective migration must exist');
const migrationPath=`supabase/migrations/${migrationNames[0]}`;
const sql=fs.readFileSync(migrationPath,'utf8').replace(/\r\n?/gu,'\n');
const original=fs.readFileSync(
  'supabase/migrations/20260830044500_rc65_c2_c3_privileged_server_enforcement.sql',
  'utf8',
).replace(/\r\n?/gu,'\n');

test('RC65 compatibility makes only the assertion helper invoker-safe for authenticated composition',()=>{
  assert.match(sql,/create or replace function public\.iberfit_require_privileged_assurance_v65d\(\)/iu);
  assert.match(sql,/security invoker/iu);
  assert.doesNotMatch(sql,/security definer/iu);
  assert.match(
    sql,
    /revoke all on function public\.iberfit_require_privileged_assurance_v65d\(\)[\s\S]*?from public,anon,authenticated;/iu,
  );
  assert.match(
    sql,
    /grant execute on function public\.iberfit_require_privileged_assurance_v65d\(\)[\s\S]*?to authenticated;/iu,
  );
  assert.match(sql,/IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED/u);
  assert.match(sql,/errcode='42501'/u);
});

test('RC65 compatibility preserves Client path without weakening RLS data RPCs',()=>{
  assert.match(sql,/m26_backend_bootstrap_v43/u);
  assert.match(sql,/m26_wearable_bootstrap_v44/u);
  assert.match(sql,/RC65_INV_COMPAT_RLS_INVOKER_CONTRACT_DRIFT/u);
  assert.match(sql,/RC65_INV_COMPAT_DATA_RPC_DEFINER_BYPASS/u);
  assert.doesNotMatch(sql,/alter\s+function\s+public\.(?:m26_backend_bootstrap_v43|m26_wearable_bootstrap_v44)[\s\S]*security\s+definer/iu);
  assert.doesNotMatch(sql,/disable\s+row\s+level\s+security/iu);
  assert.doesNotMatch(sql,/grant\s+(?:select|insert|update|delete|truncate|references|trigger)\s+on/iu);
});

test('RC65 compatibility retains the C2/C3 guard calls already injected into both Client-used RPCs',()=>{
  for(const name of ['m26_backend_bootstrap_v43','m26_wearable_bootstrap_v44']){
    assert.ok(original.includes(`'${name}'`),`original invoker inventory missing ${name}`);
  }
  assert.match(original,/p\.prosecdef=false/u);
  assert.match(original,/iberfit_require_privileged_assurance_v65d/u);
  assert.match(sql,/RC65_INV_COMPAT_GUARD_COMPOSITION_MISSING/u);
  assert.match(sql,/RC65_INV_COMPAT_DATA_RPC_GUARD_REMOVED/u);
});

test('RC65 compatibility remains QA-safe and does not introduce privileged secrets or paid MFA',()=>{
  assert.doesNotMatch(sql,/service[_-]?role|sb_secret_|password|private[_-]?key/iu);
  assert.doesNotMatch(sql,/mfa_web_authn|passkey_enabled|auth_mfa_web_authn/iu);
  assert.doesNotMatch(sql,/mpnzhsdtmybhefseokbw/iu);
  assert.match(sql,/returns no data, performs no mutation/iu);
});
