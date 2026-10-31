import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const stem='20261031062000_p0_free_qa_history_visibility_guard_v2';
const sql=fs.readFileSync('supabase/qa-migrations/'+stem+'.sql','utf8');
const rollback=fs.readFileSync('supabase/qa-rollbacks/'+stem+'.rollback.sql','utf8');
const functionBody=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
const marker='P0_FREE_HISTORY_VISIBILITY_GUARD_QA_V2';

test('QA only, no rollout, no destructive data changes, and reversible source guard',()=>{
  for(const item of [sql,rollback]){
    assert.match(item,/IS DISTINCT FROM 'QA'/u);
    assert.match(item,/FREE_HISTORY_ROLLOUT_MUST_BE_OFF/u);
    assert.doesNotMatch(item.split('\n').filter(l=>!l.trimStart().startsWith('--')).join('\n'),/\b(?:DELETE FROM|TRUNCATE|UPDATE public\.domain_entities_v26|INSERT INTO public\.domain_entities_v26|BYPASSRLS)\b/iu);
  }
  assert.match(sql,/2e29cd773fdb065cb07d17ab6a034c35/u);
  assert.match(rollback,/FREE_HISTORY_ROLLBACK_SOURCE_DRIFT/u);
  assert.equal(sql.split(marker).length-1,2);
});
test('the exact same role visibility predicate applies to counts and pages',()=>{
  for(const term of ["e.body->>'clientVisibilityLevel'","e.body->>'client_visibility_level'",
    "e.body->>'visibilityLevel'","e.body->>'visibility_level'","e.body->>'clientVisible'",
    "e.body->>'visible_to_client'","e.body->>'client_visible'",
    "s.body->>'clientVisibilityLevel'","s.body->>'client_visibility_level'",
    "s.body->>'visibilityLevel'","s.body->>'visibility_level'",
    "s.body->>'visibleToClient'","s.body->>'clientVisible'","s.body->>'client_visible'",
    's.client_id=e.client_id','s.entity_type=\'session\'',
    's.entity_id = (CASE','ELSE NULL::uuid END)']){
    assert.equal(functionBody.split(term).length-1,2,term);
  }
  assert.equal(functionBody.split("IN ('completado','completada','completed')").length-1,4,
    'both count/page predicates must check each completed row and linked session');
  for(const term of ["('hidden','oculta','oculto','private')","('false','0','no')"]){
    assert.ok(functionBody.includes(term));
  }
  assert.match(functionBody,/v_client_id:=public\.iberfit_client_id\(\)/u);
  assert.match(functionBody,/v_role IS DISTINCT FROM 'cliente'/u);
  assert.match(functionBody,/e.client_id=v_client_id/u);
  assert.match(functionBody,/p_limit NOT BETWEEN 1 AND 32/u);
  assert.match(functionBody,/FREE_HISTORY_REVISION_CHANGED/u);
  assert.match(functionBody,/FREE_HISTORY_PAGE_TOO_LARGE/u);
});
test('function permissions are strictly authenticated; source never grants anon or changes RLS',()=>{
  for(const item of [sql,rollback]){
    assert.match(item,/FROM PUBLIC,anon;/u);
    assert.match(item,/TO authenticated;/u);
    assert.doesNotMatch(item,/GRANT EXECUTE.*TO anon/iu);
  }
  assert.doesNotMatch(sql,/DISABLE ROW LEVEL SECURITY|DROP POLICY/iu);
});
