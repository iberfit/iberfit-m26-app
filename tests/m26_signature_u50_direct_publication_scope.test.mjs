import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const qa=read('supabase/qa-migrations/20261022_u50_client_direct_publication_scope.sql');
const qaRollback=read('supabase/qa-rollbacks/20261022_u50_client_direct_publication_scope.sql');
const prod=read('qa/signature-u40/prod-client-privacy-guarded-release.sql');
const prodRollback=read('qa/signature-u40/prod-client-privacy-guarded-rollback.sql');
const before='ce0cbff2a99e28bff593132a350de595';
const after='7fb270cb0f55f0f1f9918ac9b5d69178';
const prodBaseline='6ca1d901bb26ceedccfb7dc15945451d';

function body(sql){
  const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26_rc29()');
  assert.ok(start>=0);
  const end=sql.indexOf('$function$',sql.indexOf('$function$',start)+10);
  assert.ok(end>start);
  return sql.slice(start,end+'$function$'.length);
}
test('U50 QA canonical function and PROD release have byte-identical function body',()=>{
  assert.equal(body(prod),body(qa));
  assert.match(qa,new RegExp(before,'u'));
  assert.match(prod,new RegExp(prodBaseline,'u'));
  assert.match(qa,new RegExp(after,'u'));
  assert.match(prod,new RegExp(after,'u'));
});
test('U50 Client direct sessions and reports exclude withdrawn/draft, Coach and Admin remain unchanged',()=>{
  for(const sql of [qa,prod]){
    const directSessions=sql.split("'sessions',coalesce((")[1]?.split("'appointments',coalesce((")[0]||'';
    const directReports=sql.split("'reports',coalesce((")[1]?.split("'trainingCycles',coalesce((")[0]||'';
    assert.match(directSessions,/v_role not in \('client','cliente'\) or \(s\.status::text='publicado' and s\.published_at is not null\)/u);
    assert.match(directReports,/v_role not in \('client','cliente'\) or \(r\.status::text='publicado' and r\.published_at is not null\)/u);
    assert.match(sql,/'domainEvents',case when v_role in \('client','cliente'\) then '\[\]'::jsonb/u);
    assert.match(sql,/e\.entity_type not in \('private_note','intelligence','report'\)/u);
    assert.match(sql,/SET search_path TO ''/u);
    assert.match(sql,/STABLE SECURITY DEFINER/u);
  }
});
test('U50 QA and PROD rollbacks are pinned to exact expected fingerprints and environments',()=>{
  assert.match(qa,/='QA'/u);
  assert.match(qa,new RegExp(before,'u'));
  assert.match(qaRollback,/='QA'/u);
  assert.match(qaRollback,new RegExp(after,'u'));
  assert.match(qaRollback,new RegExp(before,'u'));
  assert.match(prod,/='PRODUCTION'/u);
  assert.match(prodRollback,/='PRODUCTION'/u);
  assert.match(prodRollback,new RegExp(after,'u'));
  assert.match(prodRollback,new RegExp(prodBaseline,'u'));
  for(const sql of [qa,qaRollback,prod,prodRollback]){
    assert.match(sql,/^BEGIN;/mu);
    assert.match(sql,/^COMMIT;/mu);
    assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDELETE FROM\b|\bALTER ROLE\b|\bGRANT\b|\bREVOKE\b/iu);
  }
});
