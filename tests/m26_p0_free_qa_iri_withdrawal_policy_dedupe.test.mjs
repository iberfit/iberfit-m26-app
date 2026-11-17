import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const n='20261117143515_p0_free_qa_iri_withdrawal_rls_duplicate_v1';
const up=readFileSync('supabase/qa-migrations/'+n+'.sql','utf8');
const down=readFileSync('supabase/qa-rollbacks/'+n+'_rollback.sql','utf8');
const raw=s=>s.replace(/--[^\n]*/gu,'');

test('QA withdrawal SELECT RLS has identical predicates and a precisely reversible rollout',()=>{
  for(const source of [up,down]){
    const code=raw(source);
    assert.match(code,/^\s*BEGIN\s*;/iu);
    assert.match(code,/\bCOMMIT\s*;\s*$/iu);
    assert.match(code,/lock_timeout='1500ms'/u);
    assert.match(code,/statement_timeout='8000ms'/u);
    assert.match(code,/IS DISTINCT FROM 'QA'/u);
    assert.match(code,/polcmd='r'/u);
    assert.match(code,/relrowsecurity/u);
    assert.match(code,/250d86448fd9a39e4ee38e33d17f03c5/u);
    assert.match(code,/ARRAY\['authenticated'\]::name\[\]/u);
    assert.doesNotMatch(code,/\b(?:UPDATE|INSERT|DELETE|TRUNCATE|GRANT|REVOKE|ALTER TABLE|DISABLE ROW LEVEL SECURITY)\b/iu);
  }
  assert.match(up,/DROP POLICY iri_report_withdrawal_read_manager_v2 ON public\.iri_report_withdrawals_v1/iu);
  assert.equal((raw(up).match(/\bDROP POLICY\b/giu)||[]).length,1);
  assert.match(down,/CREATE POLICY iri_report_withdrawal_read_manager_v2 ON public\.iri_report_withdrawals_v1[\s\S]*FOR SELECT TO authenticated/iu);
  assert.match(down,/EXISTS \(SELECT 1 FROM public\.iri_report_issuances_v1 i[\s\S]*public\.iberfit_can_manage_iri_private_v1\(i.client_id\)/iu);
  assert.equal((raw(down).match(/\bCREATE POLICY\b/giu)||[]).length,1);
});
