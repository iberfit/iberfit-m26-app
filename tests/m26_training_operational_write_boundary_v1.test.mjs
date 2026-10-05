import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(
  'supabase/migrations/20261005103000_training_operational_write_boundary_v1.sql',
  'utf8',
);
const transport=fs.readFileSync('src/m26/supabase-transport.js','utf8');
const commandBus=fs.readFileSync('src/m26/command-bus.js','utf8');
const application=fs.readFileSync('src/m26/app/application.js','utf8');

test('training operational write boundary is additive and leaves legacy RC43 compatibility untouched',()=>{
  assert.doesNotMatch(sql,/\bdrop\s+(?:table|function|policy|type|schema)\b/iu);
  assert.doesNotMatch(sql,/\bdelete\s+from\b|\bupdate\s+public\./iu);
  assert.doesNotMatch(sql,/m26_training_plans_v43|m26_training_sessions_v43|m26_save_training_session_v43/u);
});

test('anon loses all direct access and authenticated retains read-only access on canonical training tables',()=>{
  for(const table of [
    'public.training_cycles',
    'public.sessions',
    'public.session_executions',
    'public.session_events',
  ]){
    assert.ok(sql.includes(table),table);
  }
  assert.match(sql,/revoke all on table[\s\S]*public\.training_cycles,[\s\S]*public\.sessions,[\s\S]*public\.session_executions,[\s\S]*public\.session_events[\s\S]*from anon, authenticated;/u);
  assert.match(sql,/grant select on table[\s\S]*public\.training_cycles,[\s\S]*public\.sessions,[\s\S]*public\.session_executions,[\s\S]*public\.session_events[\s\S]*to authenticated;/u);
  assert.match(sql,/revoke all on table public\.active_execution_locks_v26[\s\S]*from anon, authenticated;/u);
  assert.doesNotMatch(sql,/grant\s+(?:insert|update|delete|truncate|references|trigger|maintain|all)[\s\S]*to authenticated/iu);
});

test('modern app mutation path remains Command Bus RPC rather than direct training-table writes',()=>{
  assert.match(application,/createCommandBus\(/u);
  assert.match(commandBus,/transport\.execute\(/u);
  assert.match(transport,/execute:\s*async\s*\(token, command\)[\s\S]*runtime\.rpc\.execute/u);

  for(const direct of [
    '/rest/v1/sessions',
    '/rest/v1/session_executions',
    '/rest/v1/session_events',
    '/rest/v1/training_cycles',
  ]){
    assert.equal(transport.includes(direct),false,direct);
    assert.equal(application.includes(direct),false,direct);
  }
});
