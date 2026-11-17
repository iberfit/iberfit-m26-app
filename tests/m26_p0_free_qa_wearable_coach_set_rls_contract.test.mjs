import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const name='20261117130542_p0_free_qa_wearable_coach_set_rls_v2';
const apply=readFileSync('supabase/qa-migrations/'+name+'.sql','utf8');
const reverse=readFileSync('supabase/qa-rollbacks/'+name+'_rollback.sql','utf8');
const executable=s=>s.replace(/--[^\n]*/gu,'');
const initialHash='a6ea1799ffd432d13b6b607612f40f52';
const finalHash='de7d8cbf0792c431eedae9a9591a212a';

test('QA coach-role consent RLS migration is strictly guarded and reversible',()=>{
  for(const source of [apply,reverse]){
    const code=executable(source);
    assert.match(code,/^\s*BEGIN\s*;/iu);
    assert.match(code,/\bCOMMIT\s*;\s*$/iu);
    assert.match(code,/SET LOCAL lock_timeout='1500ms'/u);
    assert.match(code,/SET LOCAL statement_timeout='8000ms'/u);
    assert.match(code,/key='environment'/u);
    assert.match(code,/IS DISTINCT FROM 'QA'/u);
    assert.match(code,/relrowsecurity/u);
    assert.match(code,/role_names IS DISTINCT FROM ARRAY\['authenticated'\]::name\[\]/u);
    assert.equal((code.match(/\bALTER POLICY\b/giu)||[]).length,1);
    assert.match(code,/ALTER POLICY m26_wearable_consents_read_v44 ON public\.m26_wearable_consents_v44/u);
    assert.doesNotMatch(code,/\b(?:DROP|TRUNCATE|DELETE|INSERT|UPDATE|GRANT|REVOKE)\b/iu);
    assert.doesNotMatch(code,/\b(?:CREATE TABLE|CREATE FUNCTION|DISABLE ROW LEVEL SECURITY)\b/iu);
  }
  assert.ok(apply.includes(initialHash)&&apply.includes(finalHash));
  assert.ok(reverse.includes(initialHash)&&reverse.includes(finalHash));
  assert.match(reverse,/P0_FREE_QA_WEARABLE_COACH_POLICY_ROLLBACK_POSTCHECK/u);
});

test('Coach/admin set-based policy preserves role, assignment and RLS dependencies',()=>{
  const code=executable(apply);
  assert.match(code,/client_id\s*=\s*\(SELECT public\.iberfit_client_id\(\)\)/iu);
  assert.match(code,/\(SELECT public\.iberfit_role\(\)\)\s*=\s*'admin'::public\.iberfit_role/iu);
  assert.match(code,/\(SELECT public\.iberfit_role\(\)\)\s*=\s*'coach'::public\.iberfit_role/iu);
  assert.match(code,/client_id IN\s*\(\s*SELECT a\.client_id\s*FROM public\.client_assignments a/iu);
  assert.match(code,/a\.coach_user_id\s*=\s*\(SELECT auth\.uid\(\)\)/iu);
  assert.match(code,/AND a\.active/iu);
  assert.match(code,/has_table_privilege\('authenticated','public\.client_assignments','SELECT'\)/iu);
  for(const sha of ['9babfaec3d7b2dac9cd6f963fd6dde3b','4975cfaf94b33c026a63526b74ecd138','7ab65588573cb47a275383cad7cddf6c','73c04c694f4c69c2005e27e17dfc0a08']){
    assert.ok(code.includes(sha),'Pinned role/assignment source contract must be exact');
  }
  assert.doesNotMatch(code,/\b(?:user_metadata|raw_user_meta_data|auth\.jwt\(\))\b/iu);
});
