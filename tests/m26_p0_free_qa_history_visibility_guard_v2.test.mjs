import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const stem='20261031062000_p0_free_qa_history_visibility_guard_v2';
const sql=fs.readFileSync('supabase/qa-migrations/'+stem+'.sql','utf8');
const rollback=fs.readFileSync('supabase/qa-rollbacks/'+stem+'.rollback.sql','utf8');
const fn=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
const marker='P0_FREE_HISTORY_VISIBILITY_GUARD_QA_V2';

test('QA-only environment, rollout-off, rollback guard and no DML',()=>{
  for(const item of [sql,rollback]){
    assert.match(item,/IS DISTINCT FROM 'QA'/u);
    assert.match(item,/FREE_HISTORY_ROLLOUT_MUST_BE_OFF/u);
    const statements=item.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n');
    assert.doesNotMatch(statements,/\b(?:DELETE FROM|TRUNCATE|UPDATE public\.domain_entities_v26|INSERT INTO public\.domain_entities_v26|BYPASSRLS)\b/iu);
  }
  assert.match(sql,/2e29cd773fdb065cb07d17ab6a034c35/u);
  assert.match(rollback,/FREE_HISTORY_ROLLBACK_SOURCE_DRIFT/u);
  assert.equal(sql.split(marker).length-1,2);
});

test('identical complete visibility predicate for count/fingerprint and rows',()=>{
  const fragments=[
    "e.body->>'clientVisibilityLevel'","e.body->>'client_visibility_level'",
    "e.body->>'visibilityLevel'","e.body->>'visibility_level'",
    "e.body->>'visible_to_client'","e.body->>'clientVisible'","e.body->>'client_visible'",
    "s.body->>'clientVisibilityLevel'","s.body->>'client_visibility_level'",
    "s.body->>'visibilityLevel'","s.body->>'visibility_level'",
    "s.body->>'visibleToClient'","s.body->>'visible_to_client'",
    "s.body->>'clientVisible'","s.body->>'client_visible'",
    's.client_id=e.client_id',"s.entity_type='session'",
    's.entity_id = (CASE','ELSE NULL::uuid END)'
  ];
  for(const fragment of fragments)assert.equal(fn.split(fragment).length-1,2,fragment);
  assert.ok(fn.split("IN ('completado','completada','completed')").length-1>=4);
  const uuidRegexp="WHEN e.body->>'sessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"+String.fromCharCode(36)+"'";
  assert.equal(fn.split(uuidRegexp).length-1,2);
  assert.equal(fn.split("THEN (e.body->>'sessionId')::uuid ELSE NULL::uuid END)").length-1,2);
  for(const term of ["('hidden','oculta','oculto','private')","('false','0','no')"])
    assert.ok(fn.includes(term),term);
});

test('identity, ACL and pagination invariants unchanged',()=>{
  assert.match(fn,/v_client_id:=public\.iberfit_client_id\(\)/u);
  assert.match(fn,/v_role IS DISTINCT FROM 'cliente'/u);
  assert.match(fn,/e.client_id=v_client_id/u);
  assert.match(fn,/p_limit NOT BETWEEN 1 AND 32/u);
  assert.match(fn,/FREE_HISTORY_REVISION_CHANGED/u);
  assert.match(fn,/FREE_HISTORY_PAGE_TOO_LARGE/u);
  for(const item of [sql,rollback]){
    assert.match(item,/FROM PUBLIC,anon;/u);
    assert.match(item,/TO authenticated;/u);
    assert.doesNotMatch(item,/GRANT EXECUTE.*TO anon/iu);
    assert.doesNotMatch(item,/DISABLE ROW LEVEL SECURITY|DROP POLICY/iu);
  }
});
