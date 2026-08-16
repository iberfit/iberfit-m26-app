import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rc46 = readFileSync(
  'docs/evidence/rc59-c2d/retired-august-migrations/20260809185000_rc46_strict_coach_assignment_scope.sql',
  'utf8'
);

const rc461 = readFileSync(
  'docs/evidence/rc59-c2d/retired-august-migrations/20260809230500_rc46_1_compatibility_closure.sql',
  'utf8'
);

test('RC46 preserves the historical PostgreSQL input parameter name', () => {
  assert.match(
    rc46,
    /create or replace function public\.is_assigned_coach\s*\(\s*target_client uuid\s*\)/i
  );
  assert.doesNotMatch(
    rc46,
    /create or replace function public\.is_assigned_coach\s*\(\s*p_client_id uuid/i
  );
});

test('RC46.1 restores Admin compatibility while Coach remains assignment-scoped', () => {
  assert.match(
    rc461,
    /when public\.iberfit_current_role_v26\(\)='admin' then true/i
  );
  assert.match(
    rc461,
    /when public\.iberfit_current_role_v26\(\)<>'coach' then false/i
  );
  assert.match(rc461, /from public\.iberfit_coach_client_assignments a/i);
  assert.match(rc461, /join public\.iberfit_organization_memberships m/i);
  assert.match(rc461, /a\.coach_user_id=auth\.uid\(\)/i);
  assert.match(rc461, /a\.client_id=target_client::text/i);
});

test('RC46.1 permits an active Coach with zero accessible canaries to hydrate empty', () => {
  assert.match(
    rc461,
    /create or replace function public\.iberfit_bootstrap_v26_rc46_base\(\)/i
  );
  assert.match(
    rc461,
    /if not v_has_canary and v_role <> 'coach' then/i
  );
  assert.match(
    rc461,
    /v_old_call constant text := 'public\.iberfit_bootstrap_v26_rc29\(\)'/i
  );
  assert.match(
    rc461,
    /v_new_call constant text := 'public\.iberfit_bootstrap_v26_rc46_base\(\)'/i
  );
});

test('RC46.1 protects historical dependencies and uses structural helper validation', () => {
  assert.match(rc461, /M26_RC461_HISTORICAL_RC29_CHANGED/i);
  assert.match(rc461, /M26_RC461_DEPENDENT_POLICY_DEFINITIONS_CHANGED/i);
  assert.match(rc461, /M26_RC461_DEPENDENT_FUNCTION_DEFINITIONS_CHANGED/i);
  assert.match(rc461, /M26_RC461_ASSIGNMENT_HELPER_PROPERTIES_INVALID/i);
  assert.doesNotMatch(
    rc461,
    /position\('client_assignments' in v_helper\)/i
  );
});
