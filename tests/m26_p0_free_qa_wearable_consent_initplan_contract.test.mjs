import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const id='20261117125214_p0_free_qa_wearable_consent_rls_initplan_v1';
const apply=readFileSync('supabase/qa-migrations/'+id+'.sql','utf8');
const rollback=readFileSync('supabase/qa-rollbacks/'+id+'_rollback.sql','utf8');
const executable=(s)=>s.replace(/--[^\n]*/gu,'');
const oldHash='0b38f8e1d6bf70894f2e33f29ee36e5c';
const nextHash='a6ea1799ffd432d13b6b607612f40f52';
const policy='m26_wearable_consents_read_v44';

test('P0 Free wearable QA migration stays atomic, guarded and exactly reversible',()=>{
  for(const source of [apply,rollback]){
    const body=executable(source);
    assert.match(body,/^\s*BEGIN\s*;/iu);
    assert.match(body,/\bCOMMIT\s*;\s*$/iu);
    assert.match(body,/lock_timeout='1500ms'/u);
    assert.match(body,/statement_timeout='8000ms'/u);
    assert.match(body,/key='environment'/u);
    assert.match(body,/IS DISTINCT FROM 'QA'/u);
    assert.match(body,/relrowsecurity/u);
    assert.match(body,/polpermissive/u);
    assert.match(body,/polcmd/u);
    assert.match(body,/role_names IS DISTINCT FROM ARRAY\['authenticated'\]::name\[\]/u);
    assert.equal((body.match(/\bALTER POLICY\b/giu)||[]).length,1);
    assert.match(body,new RegExp('ALTER POLICY\\s+'+policy,'iu'));
    assert.doesNotMatch(body,/\b(?:DROP|TRUNCATE|DELETE|INSERT|UPDATE|REVOKE|GRANT)\b/iu);
    assert.doesNotMatch(body,/\b(?:CREATE TABLE|CREATE FUNCTION|DISABLE ROW LEVEL SECURITY|SECURITY DEFINER)\b/iu);
  }
  assert.ok(apply.includes(oldHash)&&apply.includes(nextHash));
  assert.ok(rollback.includes(oldHash)&&rollback.includes(nextHash));
});

test('P0 Free same authorized row set, InitPlan only on stable client-id value',()=>{
  const migration=executable(apply);
  const reverse=executable(rollback);
  assert.match(migration,/USING\s*\(\(client_id\s*=\s*\(SELECT public\.iberfit_client_id\(\)\)\)\s*OR public\.is_assigned_coach\(client_id\)\)/iu);
  assert.match(reverse,/USING\s*\(\(client_id\s*=\s*public\.iberfit_client_id\(\)\)\s*OR public\.is_assigned_coach\(client_id\)\)/iu);
  assert.match(migration,/\bprovolatile\b[\s\S]*'s'/u);
  assert.match(migration,/P0_FREE_QA_CONSENT_RLS_PREFLIGHT_DRIFT/u);
  assert.match(migration,/P0_FREE_QA_CONSENT_RLS_POSTCHECK_FAILED/u);
  assert.match(reverse,/P0_FREE_QA_CONSENT_RLS_ROLLBACK_DRIFT/u);
  assert.match(reverse,/P0_FREE_QA_CONSENT_RLS_ROLLBACK_POSTCHECK/u);
  assert.doesNotMatch(migration,/\b(?:auth\.jwt\(\)|raw_user_meta_data|user_metadata)\b/iu);
});
