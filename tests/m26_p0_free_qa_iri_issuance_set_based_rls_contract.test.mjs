import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const version='20261117154233_p0_free_qa_iri_issuance_set_based_initplan_v1';
const up=readFileSync('supabase/qa-migrations/'+version+'.sql','utf8');
const down=readFileSync('supabase/qa-rollbacks/'+version+'_rollback.sql','utf8');
const code=s=>s.replace(/--[^\n]*/gu,'');

test('IRI read optimizer is strictly QA-only and preserves RLS/grants/old helper',()=>{
 for(const sql of [up,down]){
  const c=code(sql);
  assert.match(c,/^\s*BEGIN;/u);
  assert.match(c,/\bCOMMIT;\s*$/u);
  assert.match(c,/lock_timeout = '1500ms'/u);
  assert.match(c,/statement_timeout = '10000ms'/u);
  assert.match(c,/key='environment'/u);
  assert.match(c,/IS DISTINCT FROM 'QA'/u);
  assert.match(c,/iri_report_issuance_read_manager_v1/u);
  assert.match(c,/relrowsecurity/u);
  assert.match(c,/polcmd='r'/u);
  assert.match(c,/ARRAY\['authenticated'\]::name\[\]/u);
  assert.match(c,/0a4730122eda42e36e12c8a4dc8a2220/u);
  assert.match(c,/8e39f8cd8bc1fee7502232acf50aadd9/u);
  assert.doesNotMatch(c,/\b(?:INSERT|DELETE|UPDATE|TRUNCATE|GRANT|REVOKE|CREATE POLICY|DROP POLICY|DISABLE ROW LEVEL SECURITY|DROP TABLE)\b/iu);
  assert.equal((c.match(/ALTER POLICY/gu)||[]).length,1);
 }
 assert.match(up,/md5\(pg_get_functiondef\('public\.iberfit_can_manage_iri_external_report_v12\(uuid\)'::regprocedure\)\)/u);
 assert.match(up,/md5\(pg_get_functiondef\('private\.is_assigned_coach\(uuid\)'::regprocedure\)\)/u);
 assert.match(up,/md5\(pg_get_functiondef\('private\.iberfit_role\(\)'::regprocedure\)\)/u);
 assert.match(up,/has_table_privilege\('authenticated','public\.client_assignments','SELECT'\)/u);
 assert.match(up,/client_id IN \(\s*SELECT a\.client_id FROM public\.client_assignments a/u);
 assert.match(up,/a\.coach_user_id=\(SELECT auth\.uid\(\)\) AND a\.active/u);
 assert.match(up,/OR public\.iberfit_can_manage_iri_private_v1\(client_id\)/u);
 assert.match(up,/public\.iberfit_role\(\)\)='admin'::public\.iberfit_role/u);
 assert.match(up,/public\.iberfit_role\(\)\)='coach'::public\.iberfit_role/u);
 assert.match(down,/USING \(public\.iberfit_can_manage_iri_private_v1\(client_id\)\)/u);
});

test('IRI rollback fails closed on drift rather than replacing an unrecognized policy',()=>{
 assert.match(up,/P0_FREE_QA_IRI_INITPLAN_POLICY_DRIFT/u);
 assert.match(up,/P0_FREE_QA_IRI_INITPLAN_POSTCHECK_FAILED/u);
 assert.match(down,/P0_FREE_QA_IRI_INITPLAN_ROLLBACK_DRIFT/u);
 assert.match(down,/P0_FREE_QA_IRI_INITPLAN_ROLLBACK_POSTCHECK/u);
 assert.match(up,/IS DISTINCT FROM '06ba4871f36f508b6b0852bcbe6111e2'/u);
 assert.match(up,/IS DISTINCT FROM '4975cfaf94b33c026a63526b74ecd138'/u);
 assert.match(up,/IS DISTINCT FROM '9babfaec3d7b2dac9cd6f963fd6dde3b'/u);
 assert.match(up,/IS DISTINCT FROM '73c04c694f4c69c2005e27e17dfc0a08'/u);
});