import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const v='20261101115000_p0_free_qa_hidden_fixture_checkin_revisions_v1';
const migration=readFileSync('supabase/qa-migrations/'+v+'.sql','utf8');
const rollback=readFileSync('supabase/qa-rollbacks/'+v+'.rollback.sql','utf8');
const enable=readFileSync('supabase/qa-rollouts/'+v+'.enable.sql','utf8');
const disable=readFileSync('supabase/qa-rollouts/'+v+'.disable.sql','utf8');
const browser=readFileSync('qa/p0-free-history/live-client-a-cases.mjs','utf8');
test('QA source and rollback are exact-hash guarded, security-definer unchanged',()=>{
  assert.match(migration,/28fb04b495c219a632414f46ec1eb78f/u);
  assert.match(rollback,/384fc9f71774e79a6aad987ad67a0c9a/u);
  assert.match(enable,/384fc9f71774e79a6aad987ad67a0c9a/u);
  for(const body of [migration,rollback,enable,disable]){
    assert.match(body,/IS DISTINCT FROM 'QA'/u);
    const executable=body.split('\n').filter(x=>!x.trimStart().startsWith('--')).join('\n');
    assert.doesNotMatch(executable,/\b(?:TRUNCATE|DROP TABLE|UPDATE public\.(?:client_checkins_v26|domain_entities_v26)|DELETE FROM public\.(?:client_checkins_v26|domain_entities_v26)|ALTER TABLE|DISABLE ROW LEVEL SECURITY|GRANT EXECUTE|BYPASSRLS)\b/iu);
  }
  assert.match(migration,/STABLE SECURITY DEFINER/u);
  assert.match(migration,/SET search_path TO ''/u);
});
test('flag is independent, disabled by default, opt-in only after exact QA hash',()=>{
  assert.match(migration,/v_hide_qa_fixture_checkin_revisions boolean := false/u);
  assert.match(migration,/free_client_hide_qa_fixture_checkin_revisions_v1/u);
  assert.match(migration,/lower\(u\.email\)='qa\.rc74\.client-a@iberfit\.cl'/u);
  assert.match(migration,/v_role in \('client','cliente'\)/u);
  assert.doesNotMatch(migration,/\bINSERT INTO public\.iberfit_system_settings\b/iu);
  assert.match(enable,/free_client_compact_legacy_refs_qa/u);
  assert.match(disable,/DELETE FROM public\.iberfit_system_settings/u);
});
test('only previously hidden QA certification fixture revision keys can be omitted',()=>{
  assert.match(migration,/WITH hidden_keys AS MATERIALIZED/u);
  assert.match(migration,/c\.client_id=public\.iberfit_client_id\(\)/u);
  assert.match(migration,/c\.created_by=auth\.uid\(\)/u);
  assert.match(migration,/c\.status='confirmado'/u);
  assert.match(migration,/c\.notes LIKE 'IBERFIT QA write certification %'/u);
  assert.match(migration,/LEFT JOIN hidden_keys h ON h\.key=r\.key/u);
  assert.match(migration,/AND h\.key IS NULL/u);
  assert.match(migration,/r\.key not like 'private_note:%'/u);
  assert.match(migration,/r\.key not like 'intelligence:%'/u);
  assert.match(rollback,/where key not like 'private_note:%'/u);
  assert.doesNotMatch(rollback,/v_hide_qa_fixture_checkin_revisions boolean/u);
});
test('browser tests final HTTP revision parity with visible checkins without logging IDs',()=>{
  assert.match(browser,/const revisionKeys=new Set\(Object\.keys\(payload\.remoteRevisions\|\|\{\}\)/u);
  assert.match(browser,/everyVisibleMapped:/u);
  assert.match(browser,/expect\(compact\.checkinRevisions\.mapped\)\.toBe\(compact\.checkinRevisions\.visible\)/u);
  assert.match(browser,/evidence\.checkinRevisions=compact\.checkinRevisions/u);
});
