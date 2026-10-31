import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const name='20261031034500_free_qa_client_history_page_v1';
const sql=readFileSync('supabase/qa-migrations/'+name+'.sql','utf8');
const back=readFileSync('supabase/qa-rollbacks/'+name+'.rollback.sql','utf8');

test('history page fail-closed QA owner-only authenticated role',()=>{
 for(const value of ['auth.uid() IS NULL',"IS DISTINCT FROM 'QA'","IS DISTINCT FROM 'cliente'",
  'public.iberfit_client_id()', 'e.client_id=v_client_id','p_section NOT IN',
  'public.iberfit_m43_client_safe_session_v2(body)',
  'public.iberfit_m43_client_safe_execution_v1(body)',
  "NOT IN ('false','0','no')", "SET search_path TO ''",
  'SECURITY DEFINER'])assert.ok(sql.includes(value),value);
 assert.doesNotMatch(sql,/p_client_id|p_owner_id|raw_user_meta_data|auth\.jwt\(\)->.*user_metadata/iu);
});
test('strict cursor bounded snapshot 30min, max page 32 and 300KB',()=>{
 for(const term of ["p_limit NOT BETWEEN 1 AND 32","INTERVAL '30 minutes'",
   "p_expected_count<>v_total","p_expected_fingerprint IS DISTINCT FROM v_fingerprint","updated_at<=v_snapshot",
   "ORDER BY e.updated_at DESC,e.entity_id DESC","LIMIT p_limit+1",
   "FREE_HISTORY_REVISION_CHANGED","FREE_HISTORY_PAGE_TOO_LARGE","octet_length(v_rows::text)>300000",
   "'hasMore'","'nextCursor'","'snapshotAt'","'fingerprint'"])
   assert.ok(sql.includes(term),term);
});
test('new function explicitly denies PUBLIC and anon; grants only authenticated',()=>{
 assert.ok(sql.includes('REVOKE ALL ON FUNCTION'));
 assert.ok(sql.includes('FROM PUBLIC,anon;'));
 assert.ok(sql.includes('TO authenticated;'));
 assert.doesNotMatch(sql,/GRANT EXECUTE.*TO anon;/is);
});
test('rollback QA-only and non-destructive',()=>{
 assert.ok(back.includes("IS DISTINCT FROM 'QA'"));
 assert.match(back,/DROP FUNCTION public\.iberfit_client_completed_history_page_free_v1/);
 for(const s of [sql,back])assert.doesNotMatch(s,/\b(?:TRUNCATE|DELETE FROM|UPDATE public\.domain_entities|INSERT INTO public\.domain_entities|BYPASSRLS)\b/i);
});
