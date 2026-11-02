import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const prefix='20261031213500_p0_free_qa_legacy_compact_refs_v1';
const sql=readFileSync('supabase/qa-migrations/'+prefix+'.sql','utf8');
const rollback=readFileSync('supabase/qa-rollbacks/'+prefix+'.rollback.sql','utf8');
const source=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
const oldSource=rollback.slice(rollback.indexOf('CREATE OR REPLACE FUNCTION'));
test('migration and rollback are QA-only, drift-guarded, with no history DML',()=>{
  for(const input of [sql,rollback]){
    assert.match(input,/IS DISTINCT FROM 'QA'/u);
    assert.match(input,/md5|SOURCE_DRIFT/u);
    assert.match(input,/FLAG_MUST_BE_OFF/u);
    const body=input.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n');
    assert.doesNotMatch(body,/\b(?:TRUNCATE|DELETE FROM|UPDATE public\.(?:sessions|session_executions|domain_entities_v26)|DROP TABLE|ALTER TABLE|DISABLE ROW LEVEL SECURITY|GRANT EXECUTE|BYPASSRLS)\b/iu);
    assert.match(input,/STABLE SECURITY DEFINER/u);
    assert.match(input,/SET search_path TO ''/u);
    assert.match(input,/public\.iberfit_bootstrap_v26_rc29\(\)/u);
  }
  assert.match(sql,/2a18f2469160b962d85b159746cb3a1d/u);
  assert.doesNotMatch(rollback,/v_compact_legacy_refs boolean/u);
});
test('the new switch is off by default, requires the previously scoped synthetic QA Client',()=>{
  assert.match(source,/v_compact_legacy_refs boolean := false/u);
  assert.match(source,/v_compact_legacy_refs := v_defer_completed_blocks/u);
  assert.match(source,/free_client_compact_legacy_refs_qa/u);
  assert.match(source,/s\.key='environment' AND s\.value#>>'\{\}'='QA'/u);
  assert.match(source,/qa\.rc74\.client-a@iberfit\.cl/u);
  assert.match(source,/free_client_completed_history_demand_qa/u);
  assert.doesNotMatch(sql,/\bINSERT INTO public\.iberfit_system_settings\b/iu);
});
test('every {id} substitution checks same owner, uuid, revision and canonical JSON body',()=>{
  for(const [a,type] of [['s','session'],['e','session_execution']]){
    for(const exp of [
      "d.entity_type='"+type+"'",
      "d.entity_id="+a+".id AND d.client_id="+a+".client_id",
      "d.revision="+a+".revision",
      "jsonb_typeof(d.body)='object'",
      "coalesce(d.body->>'id',"+a+".id::text)="+a+".id::text",
      "coalesce(d.body->>'clientId',d.body->>'client_id',"+a+".client_id::text)="+a+".client_id::text",
      "THEN jsonb_build_object('id',"+a+".id)",
    ]) assert.ok(source.includes(exp),exp);
  }
  assert.match(source,/d\.body->>'visibleToClient'/u);
  assert.match(source,/else to_jsonb\(s\) end/u);
  assert.match(source,/else to_jsonb\(e\) end/u);
  assert.match(source,/public\.iberfit_m43_client_safe_session_v2\(to_jsonb\(s\)\)/u);
  assert.match(source,/public\.iberfit_m43_client_safe_execution_v1\(jsonb_build_object\('id',e\.id,'revision',e\.revision\)\)/u);
});
test('canonical history and progress before an explicit click are not cut',()=>{
  assert.match(source,/'m26Entities',coalesce/u);
  assert.match(source,/when v_role='cliente' and e\.entity_type='session_execution' then public\.iberfit_m43_client_safe_execution_v1\(e\.body\)/u);
  assert.match(source,/v_defer_completed_blocks/u);
  assert.match(source,/v_keep_completed_sessions/u);
  assert.doesNotMatch(source,/'results'\s*,\s*'\[\]'/u);
});
test('rollback is an exact original function restoring both full legacy projections',()=>{
  assert.match(oldSource,/select jsonb_agg\(case when v_role='cliente' then public\.iberfit_m43_client_safe_session_v2\(to_jsonb\(s\)\) else to_jsonb\(s\) end\)/u);
  assert.match(oldSource,/select jsonb_agg\(case when v_role='cliente' then public\.iberfit_m43_client_safe_execution_v1\(jsonb_build_object\('id',e\.id,'revision',e\.revision\)\) else to_jsonb\(e\) end\)/u);
  assert.doesNotMatch(oldSource,/v_compact_legacy_refs|P0_FREE_QA_COMPACT_REF_V1/u);
  assert.match(rollback,/P0_FREE_COMPACT_ROLLBACK_SOURCE_DRIFT/u);
});
