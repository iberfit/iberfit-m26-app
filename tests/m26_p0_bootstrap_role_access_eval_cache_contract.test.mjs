import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20261018214135_p0_bootstrap_role_access_eval_cache_v1.sql',import.meta.url),'utf8');
const rollback=fs.readFileSync(new URL('../supabase/rollbacks/p0_bootstrap_role_access_eval_cache_v1.rollback.sql',import.meta.url),'utf8');
const executable=(source)=>source.split('\n').filter((line)=>!line.trim().startsWith('--')).join('\n');

test('bootstrap role/access optimization caches role evaluation without widening authorization',()=>{
  assert.match(migration,/b4cdfd4d8ce6d71e87a512ec626426b6/);
  assert.match(migration,/b2bec4b31c6edbc6bd21fe40253c752a/);
  assert.match(migration,/aa12f60d12892506c8e08b0717aa8ee2/);
  assert.match(migration,/c6e7dc2917170e35f7ec23dc31d8f964/);
  assert.match(migration,/LANGUAGE plpgsql[\s\S]*STABLE SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assert.match(migration,/v_role:=public\.iberfit_role\(\)::text/);
  assert.match(migration,/v_role:=public\.iberfit_current_role_v26\(\)/);
  assert.equal((migration.match(/v_role:=public\.iberfit_current_role_v26\(\)/g)||[]).length,1);
  assert.match(migration,/FROM public\.client_assignments a[\s\S]*a\.client_id=p_client_id[\s\S]*a\.coach_user_id=auth\.uid\(\)[\s\S]*a\.active/);
  assert.match(migration,/ELSIF v_role='cliente'[\s\S]*public\.iberfit_client_id\(\)=p_client_id/);
  assert.doesNotMatch(executable(migration),/\b(?:ALTER ROLE|GRANT|REVOKE|DROP|TRUNCATE|DELETE FROM|UPDATE .*SET|statement_timeout)\b/i);
});

test('bootstrap role/access rollback restores exact prior decision helpers from known optimized hashes',()=>{
  assert.match(rollback,/aa12f60d12892506c8e08b0717aa8ee2/);
  assert.match(rollback,/c6e7dc2917170e35f7ec23dc31d8f964/);
  assert.match(rollback,/LANGUAGE sql[\s\S]*STABLE SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assert.equal((rollback.match(/public\.iberfit_current_role_v26\(\)=/g)||[]).length,3);
  assert.match(rollback,/public\.is_assigned_coach\(p_client_id\)/);
  assert.match(rollback,/b4cdfd4d8ce6d71e87a512ec626426b6/);
  assert.match(rollback,/b2bec4b31c6edbc6bd21fe40253c752a/);
  assert.doesNotMatch(executable(rollback),/\b(?:ALTER ROLE|GRANT|REVOKE|DROP|TRUNCATE|DELETE FROM|UPDATE .*SET|statement_timeout)\b/i);
});
