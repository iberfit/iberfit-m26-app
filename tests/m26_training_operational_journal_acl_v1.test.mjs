import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(
  'supabase/migrations/20261005111500_training_operational_journal_acl_v1.sql',
  'utf8',
);

test('canonical training journals are read-only to authenticated and closed to anon',()=>{
  for(const table of [
    'public.domain_events_v26',
    'public.command_events_v26',
    'public.command_receipts_v26',
  ])assert.ok(sql.includes(table),table);

  assert.match(sql,/revoke all on table[\s\S]*from anon, authenticated;/u);
  assert.match(sql,/grant select on table[\s\S]*to authenticated;/u);
  assert.doesNotMatch(sql,/grant\s+(?:insert|update|delete|truncate|references|trigger|maintain|all)[\s\S]*to authenticated/iu);
});

test('journal hardening is non-destructive to stored event history',()=>{
  assert.doesNotMatch(sql,/\bdrop\b|\bdelete\b|\btruncate\b|\bupdate\b/iu);
});
