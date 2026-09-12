import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n?/gu,'\n');

test('Admin create-client helper is no longer directly executable by authenticated sessions',()=>{
  const migration=read('supabase/migrations/20260912162500_admin_create_client_helper_least_privilege.sql');
  assert.match(migration,/revoke all on function public\.iberfit_admin_create_client_v26\(jsonb,jsonb\)/u);
  assert.match(migration,/from public,anon,authenticated/u);
});

test('The supported Admin gateway still owns client creation',()=>{
  const adminMigrationFiles=fs.readdirSync('supabase/migrations')
    .filter((name)=>name.endsWith('.sql'))
    .map((name)=>read(`supabase/migrations/${name}`))
    .join('\n');
  assert.match(adminMigrationFiles,/iberfit_admin_execute_v14\(p_command jsonb\)/u);
  assert.match(adminMigrationFiles,/return public\.iberfit_admin_create_client_v26\(p_command,v_context\)/u);
});
