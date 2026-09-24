import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20260924134500_coach_launch_identity_bootstrap_v1.sql',import.meta.url),'utf8');

test('Coach bootstrap enriches only the current authenticated identity',()=>{
  assert.match(sql,/where u\.id=auth\.uid\(\)/i);
  assert.match(sql,/m\.user_id=auth\.uid\(\)/i);
  assert.match(sql,/00000000-0000-4000-8000-000000000140/i);
  assert.match(sql,/\{user,email\}/i);
  assert.match(sql,/\{user,status\}/i);
});

test('Coach bootstrap keeps the RPC fail-closed and executable only by authenticated/service role',()=>{
  assert.match(sql,/security definer/i);
  assert.match(sql,/set search_path to ''/i);
  assert.match(sql,/revoke all on function public\.iberfit_bootstrap_v26\(\) from public/i);
  assert.match(sql,/revoke all on function public\.iberfit_bootstrap_v26\(\) from anon/i);
  assert.match(sql,/grant execute on function public\.iberfit_bootstrap_v26\(\) to authenticated/i);
  assert.match(sql,/grant execute on function public\.iberfit_bootstrap_v26\(\) to service_role/i);
  assert.doesNotMatch(sql,/grant execute[^;]*\bto anon\b/i);
});
