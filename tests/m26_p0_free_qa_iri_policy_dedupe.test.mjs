import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base='20261117142114_p0_free_qa_iri_duplicate_read_policy_v1';
const up=readFileSync('supabase/qa-migrations/'+base+'.sql','utf8');
const down=readFileSync('supabase/qa-rollbacks/'+base+'_rollback.sql','utf8');
const strip=s=>s.replace(/--[^\n]*/gu,'');

test('QA IRI duplicate read policy consolidation changes no authorized predicate',()=>{
 for(const sql of [up,down]){
  assert.match(strip(sql),/^\s*BEGIN\s*;/iu);
  assert.match(strip(sql),/\bCOMMIT\s*;\s*$/iu);
  assert.match(sql,/lock_timeout='1500ms'/u);
  assert.match(sql,/key='environment'/u);
  assert.match(sql,/IS DISTINCT FROM 'QA'/u);
  assert.match(sql,/8e39f8cd8bc1fee7502232acf50aadd9/u);
  assert.match(sql,/relrowsecurity/u);
  assert.match(sql,/ARRAY\['authenticated'\]::name\[\]/u);
  assert.match(sql,/polcmd='r'/u);
  assert.doesNotMatch(strip(sql),/\b(?:UPDATE|DELETE|TRUNCATE|INSERT|GRANT|REVOKE|ALTER TABLE|DISABLE ROW LEVEL SECURITY)\b/iu);
 }
 assert.match(strip(up),/DROP POLICY iri_report_issuance_read_manager_v2 ON public\.iri_report_issuances_v1/iu);
 assert.equal((strip(up).match(/\bDROP POLICY\b/giu)||[]).length,1);
 assert.match(strip(down),/CREATE POLICY iri_report_issuance_read_manager_v2[\s\S]*FOR SELECT TO authenticated[\s\S]*USING \(public\.iberfit_can_manage_iri_private_v1\(client_id\)\)/iu);
 assert.equal((strip(down).match(/\bCREATE POLICY\b/giu)||[]).length,1);
 assert.match(up,/P0_FREE_QA_IRI_POSTCHECK_FAILED/u);
 assert.match(down,/P0_FREE_QA_IRI_ROLLBACK_POSTCHECK/u);
});
