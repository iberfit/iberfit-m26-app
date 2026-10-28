import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const path=(relative)=>readFileSync(new URL(relative,root),'utf8');
const qa=path('supabase/qa-migrations/20261028103000_u43_scoped_bootstrap_qa.sql');
const prod=path('supabase/migrations/20261028103000_u43_scoped_bootstrap_prod.sql');
const qaBack=path('supabase/qa-rollbacks/u43_scoped_bootstrap_qa.rollback.sql');
const prodBack=path('supabase/rollbacks/u43_scoped_bootstrap_prod.rollback.sql');
const extract=(sql)=>{
  const match=sql.match(/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26_rc29\(\)[\s\S]*?\n\$function\$;/u);
  assert.ok(match,'exact unchanged public bootstrap signature missing');
  return match[0];
};
const before=extract(qaBack);
const inject="v_role:=public.iberfit_current_role_v26();\n  -- Exact authorization parity with the original function. Compute once,\n  -- never trust frontend role labels, client inputs or user_metadata.\n  if v_role='coach' then\n    select coalesce(array_agg(distinct a.client_id),'{}'::uuid[])\n      into v_allowed_client_ids\n    from public.client_assignments a\n    where a.coach_user_id=auth.uid() and a.active;\n  elsif v_role='cliente' then\n    v_allowed_client_ids:=array[public.iberfit_client_id()];\n  end if;";
test('QA and PROD preserve the same exact SQL function, and the same original rollback',()=>{
  assert.equal(extract(qa),extract(prod));
  assert.equal(extract(qaBack),extract(prodBack));
  assert.equal((before.match(/public\.iberfit_can_access_client_v26\(/gu)||[]).length,15);
});
test('the only logic changes are the 15 equivalent cached-scope guards',()=>{
  const expected=before
    .replace('v_revisions jsonb;',"v_revisions jsonb;\n  v_allowed_client_ids uuid[] := '{}'::uuid[];")
    .replace('v_role:=public.iberfit_current_role_v26();',inject)
    .replace(/public\.iberfit_can_access_client_v26\(([^()]+)\)/gu,"(v_role='admin' or $1=any(v_allowed_client_ids))");
  assert.equal(extract(qa),expected);
});
test('SQL is strictly environment-guarded, reversible and preserves privacy contracts',()=>{
  assert.match(qa,/U43_WRONG_ENVIRONMENT_QA/u);
  assert.match(prod,/U43_WRONG_ENVIRONMENT_PRODUCTION/u);
  assert.match(qaBack,/U43_WRONG_ENVIRONMENT_QA/u);
  assert.match(prodBack,/U43_WRONG_ENVIRONMENT_PRODUCTION/u);
  for(const guard of [
    'SECURITY DEFINER','SET search_path TO',"'AUTH_REQUIRED'",
    "public.iberfit_m43_client_safe_session_v2",
    "public.iberfit_m43_client_safe_execution_v1",
    "public.iberfit_m43_client_safe_plan_v2",
    "public.iberfit_can_access_client_v26",
    "v_role not in ('client','cliente')",
  ]){
    assert.ok(before.includes(guard),'rollback guard removed: '+guard);
  }
  for(const guard of [
    "public.iberfit_m43_client_safe_session_v2",
    "public.iberfit_m43_client_safe_execution_v1",
    "public.iberfit_m43_client_safe_plan_v2",
    "v_role not in ('client','cliente')",
    "e.entity_type not in ('private_note','intelligence','report')",
    "public.iberfit_client_id()",
  ]){
    assert.ok(extract(qa).includes(guard),'privacy boundary removed: '+guard);
  }
  assert.doesNotMatch(extract(qa),/public\.iberfit_can_access_client_v26\(/u);
  assert.doesNotMatch(qa,/\b(?:DELETE FROM|TRUNCATE TABLE|DROP TABLE|UPDATE public\.)\b/iu);
});
