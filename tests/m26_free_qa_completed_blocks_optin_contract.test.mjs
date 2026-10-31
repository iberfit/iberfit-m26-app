import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const name='20261031042000_free_qa_completed_blocks_optin_v1';
const a=readFileSync('supabase/qa-migrations/'+name+'.sql','utf8');
const b=readFileSync('supabase/qa-rollbacks/'+name+'.rollback.sql','utf8');
test('QA synthetic owner and server toggle BOTH required; default flag absent means no change',()=>{
 for(const term of ["v_role='cliente'","auth.uid()","qa.rc74.client-a@iberfit.cl",
    "free_client_completed_history_demand_qa","s.value#>>'{}'='true'",
    "FREE_HISTORY_DEFER_COMPLETED_BLOCKS_V1"])
    assert.ok(a.includes(term),term);
 assert.doesNotMatch(a,/\b(?:INSERT INTO|UPDATE public\.iberfit_system_settings|DELETE FROM|TRUNCATE)\b/i);
});
test('old completed blocks only, last 12 preserved, no revision or body disappearance',()=>{
 for(const term of ["ORDER BY e.updated_at DESC,e.entity_id DESC LIMIT 12",
   "jsonb_set(public.iberfit_m43_client_safe_session_v2(e.body)",
   "'{blocks}','[]'::jsonb,true","v_keep_completed_sessions",
   "when v_role='cliente' and e.entity_type='session_execution'"])
   assert.ok(a.includes(term),term);
 assert.ok(a.includes("NOT (e.entity_id=ANY(v_keep_completed_sessions))"));
 assert.ok(b.includes("CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26_rc29()"));
 assert.ok(b.includes("FREE_HISTORY_BOOTSTRAP_ROLLBACK_DRIFT"));
});
