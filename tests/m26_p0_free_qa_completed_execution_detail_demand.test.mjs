import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const migration=get('../supabase/qa-migrations/20261116024000_p0_free_qa_completed_execution_detail_demand_v1.sql');
const rollback=get('../supabase/qa-rollbacks/20261116024000_p0_free_qa_completed_execution_detail_demand_v1.rollback.sql');
const enable=get('../supabase/qa-rollouts/20261116024000_p0_free_qa_completed_execution_detail_demand_v1.enable.sql');
const disable=get('../supabase/qa-rollouts/20261116024000_p0_free_qa_completed_execution_detail_demand_v1.disable.sql');
test('P0 QA migration is default OFF with exact source hashes and unchanged grants',()=>{
 assert.match(migration,/P0_FREE_QA_SOURCE_OR_PROJECT_DRIFT/u);
 assert.match(migration,/P0_FREE_QA_POST_DDL_SECURITY_OR_HASH_DRIFT/u);
 assert.match(migration,/proacl/u);
 assert.match(migration,/'88220acc54e26bb1ee91332d9b89a3b3'/u);
 assert.match(migration,/'0813cbe612bf24b2f08f99bf42a96662'/u);
 assert.match(migration,/prosecdef/u);
 assert.match(migration,/provolatile/u);
 assert.match(migration,/v_defer_completed_execution_details := v_defer_completed_blocks/u);
 assert.match(migration,/free_client_completed_execution_details_demand_qa_v1/u);
 assert.match(migration,/iberfit_client_completed_history_page_free_v1/u);
 assert.match(migration,/LIMIT 12/u);
 assert.match(migration,/visibleToClient/u);
 assert.match(migration,/clientVisibilityLevel/u);
 assert.match(migration,/source_session/u);
 assert.match(migration,/'ae01c1771319b99f0404612a4b84fd2a'/u);
 assert.doesNotMatch(migration,/INSERT INTO public\.domain_entities_v26|DELETE FROM public\.domain_entities_v26|TRUNCATE|GRANT |REVOKE |ALTER TABLE /iu);
 assert.doesNotMatch(migration,/pjhmrhejsoofmouedavw|prod\.iberfit\.cl|SUPABASE_SERVICE_ROLE_KEY/iu);
});
test('P0 QA rollback is inverse and checked; rollout cannot affect PROD',()=>{
 for(const s of [rollback,enable,disable]){
  assert.match(s,/IS DISTINCT FROM 'QA'/u);
  assert.doesNotMatch(s,/pjhmrhejsoofmouedavw|SUPABASE_SERVICE_ROLE_KEY/iu);
 }
 assert.match(rollback,/P0_FREE_QA_ROLLBACK_VERIFICATION_FAILED/u);
 assert.match(rollback,/v_new_arm,v_old_arm/u);
 assert.match(enable,/ROUTE_DOES_NOT_EXIST|free_client_completed_execution_details_demand_qa_v1/u);
 assert.match(enable,/ON CONFLICT \(key\) DO UPDATE/u);
 assert.match(disable,/'false'::jsonb/u);
});
test('P0 read-only on-demand history remains the full source with owner and snapshot checks',()=>{
 const frontend=get('../src/m26/app/client-history-demand-controller.js');
 const pager=get('../src/m26/domain/client-completed-history-pager.js');
 const sql=get('../supabase/qa-migrations/20261031034500_free_qa_client_history_page_v1.sql');
 assert.match(frontend,/explicit:true/u);
 assert.match(frontend,/sections:\['session','session_execution'\]/u);
 assert.match(pager,/SNAPSHOT_OR_COUNT_CHANGED/u);
 assert.match(sql,/auth\.uid\(\)/u);
 assert.match(sql,/domain_entities_v26/u);
 assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public\.iberfit_client_completed_history_page_free_v1/u);
});
