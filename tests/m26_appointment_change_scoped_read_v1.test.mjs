import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(
  'supabase/migrations/20261006230850_appointment_change_scoped_read_v1.sql','utf8',
);
const rollback=readFileSync(
  'supabase/rollbacks/20261006230850_appointment_change_scoped_read_v1.rollback.sql','utf8',
);
const body=migration.slice(migration.indexOf('as $function$'),migration.indexOf('$function$;'));

test('#766 reads appointment changes without repeating the full authenticated snapshot',()=>{
  assert.match(migration,/create or replace function public\.iberfit_appointment_change_requests_v13_pre_v65e\(\)/iu);
  assert.doesNotMatch(body,/\b(?:select|perform)\s+public\.iberfit_bootstrap_v26\s*\(/iu);
  assert.match(migration,/from public\.appointment_change_requests r/u);
  assert.match(migration,/from public\.appointments a/u);
  assert.match(migration,/a\.id::text = r\.appointment_id/u);
  assert.match(migration,/a\.client_id::text = r\.client_id/u);
});

test('#766 preserves role, membership, privilege, identity and client visibility checks',()=>{
  assert.match(migration,/v_user uuid := auth\.uid\(\)/u);
  assert.match(migration,/V13_AUTH_REQUIRED/u);
  assert.match(migration,/public\.iberfit_application_context_v14\(\)/u);
  assert.match(migration,/membershipStatus',''\) <> 'active'/u);
  assert.match(migration,/V14_ORGANIZATION_ACCESS_SUSPENDED/u);
  assert.match(migration,/public\.iberfit_require_privileged_assurance_v65d\(\)/u);
  assert.match(migration,/public\.iberfit_current_role_v26\(\)/u);
  assert.match(migration,/public\.iberfit_client_id\(\)/u);
  assert.match(migration,/r\.requester_user_id=v_user/u);
  assert.match(migration,/r\.client_id=v_own_client/u);
  assert.match(migration,/public\.iberfit_can_access_client_v26\(a\.client_id\)/u);
  assert.match(migration,/v_role in \('coach','entrenador','admin','administrador'\)/u);
  assert.match(migration,/v_role in \('client','cliente'\)/u);
  assert.match(migration,/V13_ROLE_FORBIDDEN/u);
  assert.match(migration,/security definer/u);
  assert.match(migration,/set search_path to ''/u);
  assert.match(migration,/revoke execute on function public\.iberfit_appointment_change_requests_v13_pre_v65e\(\)[\s\S]*from public, anon, authenticated;/iu);
});

test('#766 retains the public RPC JSON contract, order, and a read-only function body',()=>{
  for(const key of ['ok','requests','id','appointmentId','clientId','reason','status','createdAt','resolvedAt','resolutionNote']){
    assert.ok(migration.includes(`'${key}'`),key);
  }
  assert.match(migration,/jsonb_agg\(jsonb_build_object\(/u);
  assert.match(migration,/order by r\.created_at desc/u);
  assert.match(migration,/\[\]'::jsonb/u);
  assert.doesNotMatch(body,/\b(?:insert\s+into|update\s+public\.|delete\s+from|truncate\s|drop\s|alter\s)\b/iu);
  assert.doesNotMatch(migration,/create or replace function public\.iberfit_appointment_change_requests_v13\(\)/iu);
});

test('#766 rollback restores exactly the previous snapshot-backed behavior',()=>{
  assert.match(rollback,/create or replace function public\.iberfit_appointment_change_requests_v13_pre_v65e\(\)/iu);
  assert.match(rollback,/select public\.iberfit_bootstrap_v26\(\) into v_snapshot;/u);
  assert.match(rollback,/v_snapshot#>'\{data,appointments\}'/u);
  assert.doesNotMatch(rollback,/\b(?:insert\s+into|delete\s+from|truncate\s|drop\s)\b/iu);
});

test('#766 QA login fails closed if appointment-change reads are unauthorized or unavailable',()=>{
  const qa=readFileSync('qa/rc64/authenticated-interaction.spec.mjs','utf8');
  assert.match(qa,/for\(const required of \['main-snapshot','command-registry','appointment-changes'\]\)/u);
  assert.match(qa,/sample\.operation===required&&sample\.status===200&&sample\.result==='finished'/u);
});

test('#766 authenticated membership and privileged assurance execute before any request-row read',()=>{
  const authCheck=body.indexOf("if v_user is null then");
  const membership=body.indexOf('public.iberfit_application_context_v14()');
  const assurance=body.indexOf('perform public.iberfit_require_privileged_assurance_v65d()');
  const rows=body.indexOf('from public.appointment_change_requests r');
  assert.ok(authCheck>=0&&membership>authCheck&&assurance>membership&&rows>assurance,
    'never read appointment-change rows before authentication, active membership and privileged assurance');
});
