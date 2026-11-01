import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const name='20261101001000_p0_free_qa_compact_session_status_outer_parity_v2';
const migration=readFileSync('supabase/qa-migrations/'+name+'.sql','utf8');
const rollback=readFileSync('supabase/qa-rollbacks/'+name+'.rollback.sql','utf8');
const enable=readFileSync('supabase/qa-rollouts/20261031213500_p0_free_qa_legacy_compact_refs_v1.enable.sql','utf8');
const browser=readFileSync('qa/p0-free-history/live-client-a-cases.mjs','utf8');
test('new QA migration strict-source-gated with flag off and immutable historical rows',()=>{
 assert.match(migration,/IS DISTINCT FROM 'QA'/u);
 assert.match(migration,/P0_FREE_COMPACT_MUST_BE_OFF/u);
 assert.match(migration,/1c7dc6b4f8b79cba0c072323412de9bb/u);
 assert.match(rollback,/a8bf53fd05478bb2face12edc642dccc/u);
 for(const sql of [migration,rollback]){
  const actual=sql.split('\n').filter(x=>!x.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(actual,/\b(?:TRUNCATE|DELETE FROM|UPDATE public\.(?:sessions|session_executions|domain_entities_v26)|DROP TABLE|ALTER TABLE|DISABLE ROW LEVEL SECURITY|BYPASSRLS|GRANT EXECUTE)\b/iu);
  assert.match(actual,/STABLE SECURITY DEFINER/u);
  assert.match(actual,/SET search_path TO ''/u);
 }
});
test('outer post-projection Client publication check still passes only published sessions',()=>{
 const fn=migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION'));
 assert.match(fn,/THEN jsonb_build_object\('id',s\.id,'status',s\.status\)/u);
 assert.doesNotMatch(fn,/THEN jsonb_build_object\('id',s\.id\)/u);
 assert.match(fn,/s\.status::text='publicado' and s\.published_at is not null/u);
 assert.match(fn,/d\.entity_id=s\.id AND d\.client_id=s\.client_id/u);
 assert.match(fn,/d\.revision=s\.revision/u);
 assert.match(fn,/lower\(coalesce\(d\.body->>'visibleToClient','true'\)\) NOT IN \('false','0','no'\)/u);
 assert.match(fn,/public\.iberfit_m43_client_safe_session_v2\(to_jsonb\(s\)\)/u);
 assert.match(fn,/public\.iberfit_m43_client_safe_execution_v1\(jsonb_build_object\('id',e\.id,'revision',e\.revision\)\)/u);
});
test('activation requires v2 hash; real browser verifies final wire shapes not raw SQL',()=>{
 assert.match(enable,/a8bf53fd05478bb2face12edc642dccc/u);
 assert.doesNotMatch(enable,/1c7dc6b4f8b79cba0c072323412de9bb/u);
 assert.match(browser,/FINAL browser RPC after outer role\/privacy projection/u);
 assert.match(browser,/keys\.includes\('status'\)&&x\.status==='publicado'/u);
 assert.match(browser,/expect\(compact\.sessions\.resolved\)\.toBe\(compact\.sessions\.compact\)/u);
 assert.match(browser,/expect\(compact\.executions\.resolved\)\.toBe\(compact\.executions\.compact\)/u);
 assert.match(browser,/navigation must issue zero page RPCs/u);
});
