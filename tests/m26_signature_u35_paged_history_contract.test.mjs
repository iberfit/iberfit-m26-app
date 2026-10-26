import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../qa/signature-u35/privileged-history-page-v1.qa.sql',import.meta.url),'utf8');

test('U35 paged history remains QA-only, private and not auto-migrated',()=>{
  assert.match(sql,/create or replace function private\.iberfit_privileged_history_page_u35_qa\(/i);
  assert.match(sql,/revoke all on function private\.iberfit_privileged_history_page_u35_qa[\s\S]+from public,anon,authenticated,service_role/iu);
  assert.doesNotMatch(sql,/grant\s+execute/iu);
  assert.doesNotMatch(sql,/\bdelete\s+from\b|\btruncate\b|\bupdate\s+public\./iu);
});
test('U35 database authorization denies Client/anon/foreign Coach and caps page size',()=>{
  for(const fragment of [
    'auth.uid() is null','v_role not in (\'coach\',\'admin\')',
    'public.iberfit_can_access_client_v26(p_client_id)',
    'public.iberfit_canary_enabled_v26(p_client_id)',
    'not exists (select 1 from public.clients c where c.id=p_client_id)',
    'p_limit<1 or p_limit>32',
  ])assert.ok(sql.includes(fragment),fragment);
  assert.ok(sql.includes("p_section is null or p_section not in"),"null section denied");
  assert.ok(sql.includes("public.iberfit_can_access_client_v26(p_client_id) is not true"),"NULL-safe access guard");
  assert.ok(sql.includes("public.iberfit_canary_enabled_v26(p_client_id) is not true"),"NULL-safe canary guard");
  assert.match(sql,/stable security definer[\s\S]+set search_path = ''/iu);
});
test('U35 cursor is deterministic, reversible and detects concurrently changed history',()=>{
  for(const fragment of [
    'v_before_at is null','e.updated_at desc,e.entity_type desc,e.entity_id desc',
    'e.created_at desc,e.id desc','e.updated_at desc,e.id desc',
    'U35_HISTORY_SNAPSHOT_CHANGED_RESTART',
    'p_expected_count is not null and v_total<>p_expected_count',
    'order by e.rn',
    "'remoteRevisions',v_revisions",
  ])assert.ok(sql.includes(fragment),fragment);
  assert.equal((sql.match(/limit \(p_limit\+1\)/giu)||[]).length,3);
});
test('U35 never uses SQL dynamic string interpolation or weak table-grant workaround',()=>{
  assert.doesNotMatch(sql,/\bexecute\s+(format|v_sql|p_)/iu);
  assert.doesNotMatch(sql,/\bset\s+statement_timeout\b|\balter\s+role\b|\bdisable\s+row\s+level\s+security\b/iu);
  assert.match(sql,/p_section not in \('m26Entities','domainEvents','sessionExecutions'\)/iu);
});
