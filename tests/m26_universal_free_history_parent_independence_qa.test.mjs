import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const stem='20261114130000_universal_completed_dated_history_qa';
const migration=readFileSync('supabase/qa-migrations/'+stem+'.sql','utf8');
const rollback=readFileSync('supabase/qa-rollbacks/'+stem+'.rollback.sql','utf8');
const body=migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION'));
const base=rollback.slice(rollback.indexOf('CREATE OR REPLACE FUNCTION'));
const marker="AND lower(COALESCE(s.status,s.body->>'status','')) IN ('disponible','completado','completada','completed','cancelada','cancelado','cancelled')";
const old="AND lower(COALESCE(s.status,s.body->>'status','')) IN ('completado','completada','completed')";
test('Universal dated history migration is QA-only, CAS guarded, rollbackable and never writes customer data',()=>{
 for(const sql of [migration,rollback]){
  assert.match(sql,/IS DISTINCT FROM 'QA'/);
  assert.match(sql,/pg_get_functiondef/);
  assert.match(sql,/REVOKE ALL ON FUNCTION/);
  assert.match(sql,/FROM PUBLIC,anon/);
  assert.match(sql,/TO authenticated/);
  assert.doesNotMatch(sql,/GRANT EXECUTE[^;]*TO anon;/is);
  assert.doesNotMatch(sql,/\b(?:DELETE FROM|TRUNCATE|DROP TABLE|DISABLE ROW LEVEL SECURITY|ALTER POLICY|BYPASSRLS)\b/i);
  assert.match(sql,/FREE_HISTORY_AUTH_REQUIRED/);
  assert.match(sql,/FREE_HISTORY_CLIENT_ROLE_REQUIRED/);
  assert.match(sql,/FREE_HISTORY_OWNER_REQUIRED/);
 }
 assert.match(migration,/3a73617648b73eb472af6ce8e9c2ee8e/);
 assert.match(rollback,/ae01c1771319b99f0404612a4b84fd2a/);
 assert.match(migration,/free_client_completed_history_demand_qa/);
});
test('every page and its count/fingerprint include completed dated executions under published or withdrawn parents',()=>{
 assert.equal(body.split(marker).length-1,2,'count and paged cursor must match');
 assert.equal(body.split(old).length-1,0,'do not preserve completed-only parent filter');
 assert.equal(base.split(old).length-1,2,'rollback must restore exact previous visibility');
 assert.equal(base.includes(marker),false);
 for(const predicate of [
  "s.client_id=e.client_id","s.entity_type='session'",'s.entity_id = (CASE',
  "s.body->>'clientVisibilityLevel'","s.body->>'client_visibility_level'",
  "s.body->>'visibilityLevel'","s.body->>'visibility_level'",
  "s.body->>'visibleToClient'","s.body->>'visible_to_client'",
  "s.body->>'clientVisible'","s.body->>'client_visible'",
 ]) assert.equal(body.split(predicate).length-1,2,predicate+' must stay in both queries');
 assert.match(body,/e.client_id=v_client_id/);
 assert.ok(body.includes("lower(COALESCE(e.status,e.body->>'status','')) IN ('completado','completada','completed')"),'only completed child results can appear');
 assert.match(body,/p_limit NOT BETWEEN 1 AND 32/);
 assert.match(body,/FREE_HISTORY_REVISION_CHANGED/);
 assert.match(body,/FREE_HISTORY_PAGE_TOO_LARGE/);
 assert.match(body,/INTERVAL '30 minutes'/);
});
