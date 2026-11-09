import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const variants=[
  ['QA','qa-migrations/20261109155000_u90_bootstrap_scoped_visibility_qa.sql',
    'qa-rollbacks/20261109155000_u90_bootstrap_scoped_visibility_qa.rollback.sql',
    'a8bf53fd05478bb2face12edc642dccc','a5a6f31254dc235f7f00311713401510'],
  ['PRODUCTION','migrations/20261109155100_u90_bootstrap_scoped_visibility_prod.sql',
    'rollbacks/20261109155100_u90_bootstrap_scoped_visibility_prod.rollback.sql',
    'a5c997a2c263357a99caacd90524291c','b35c18173878fa0a5e937657e30f1f5a'],
];
const read=path=>readFileSync(new URL('../supabase/'+path,import.meta.url),'utf8');
const extract=src=>src.slice(src.indexOf('CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26_rc29()')).trim().replace(/;$/u,'').trim();
const oldCTE=/with candidates as materialized \(/gu;
const newOwner=/where \(v_role='admin' or e\.client_id=any\(v_allowed_client_ids\)\)/gu;

for(const [env,path,rollback,before,after] of variants){
  test('UNIVERSAL U90 '+env+' isolated SQL source and reversible safe visibility',()=>{
    const sql=read(path),old=read(rollback),fn=extract(sql),previous=extract(old);
    assert.match(sql,/u90_environment_and_source_guard/u);
    assert.ok(sql.includes("s.value #>> '{}'='"+env+"'"));
    assert.match(sql,/u90_environment_and_source_guard/u);
    assert.doesNotMatch(sql,/\\bDO\\s+\\$u90_guard/u);
    assert.ok(sql.includes(before));
    assert.ok(old.includes(after));
    assert.equal((fn.match(oldCTE)||[]).length,0);
    assert.equal((previous.match(oldCTE)||[]).length,3);
    assert.equal((previous.match(/where exists \(select 1 from visible v where v.client_id is not distinct from e.client_id\)/gu)||[]).length,3);
    const previousDirect=(previous.match(newOwner)||[]).length;
    assert.equal((fn.match(newOwner)||[]).length,previousDirect+3);
    assert.ok(fn.includes('STABLE SECURITY DEFINER'));
    assert.ok(fn.includes("SET search_path TO ''"));
    assert.ok(fn.includes('iberfit_m43_client_safe_session_v2'));
    assert.ok(fn.includes('iberfit_m43_client_safe_execution_v1'));
    assert.ok(fn.includes('v_allowed_client_ids'));
    assert.ok(fn.includes('remoteRevisions'));
    assert.ok(fn.includes('data'));
    assert.ok(!fn.includes('select distinct client_id from public.domain_entities_v26'));
    assert.ok(!fn.includes('select distinct client_id from public.domain_events_v26'));
    assert.ok(!/GRANT |REVOKE |ALTER POLICY|DISABLE ROW LEVEL SECURITY/iu.test(sql));
  });
}

test('UNIVERSAL U90 direct visibility equals preflight CTE for null owner, Admin and scoped users',()=>{
  const owners=[null,'a','b','c'],scopes=[[],['a'],['b'],['a','b']];
  for(const role of ['admin','coach','cliente']){
    for(const scope of scopes)for(const owner of owners){
      const candidates=owners;
      const visible=candidates.filter(id=>role==='admin'||(id!==null&&scope.includes(id)));
      const old=visible.some(id=>id===owner);
      const replacement=role==='admin'||(owner!==null&&scope.includes(owner));
      assert.equal(replacement,old,JSON.stringify({role,scope,owner}));
    }
  }
});
