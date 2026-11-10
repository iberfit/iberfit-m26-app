import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const variants=[
  ['QA','qa-migrations/20261109155000_u90_bootstrap_scoped_visibility_qa.sql',
    'qa-rollbacks/20261109155000_u90_bootstrap_scoped_visibility_qa.rollback.sql',
    'a8bf53fd05478bb2face12edc642dccc','a5a6f31254dc235f7f00311713401510'],
  ['PRODUCTION','migrations/20261109155100_u90_bootstrap_scoped_visibility_prod.sql',
    'rollbacks/20261109155100_u90_bootstrap_scoped_visibility_prod.rollback.sql',
    'a5c997a2c263357a99caacd90524291c','2be3baa2f70d51490dcd9dc0b36deecd'],
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
    assert.equal((fn.match(oldCTE)||[]).length,env==='QA'?0:1);
    assert.equal((previous.match(oldCTE)||[]).length,3);
    assert.equal((previous.match(/where exists \(select 1 from visible v where v.client_id is not distinct from e.client_id\)/gu)||[]).length,3);
    const previousDirect=(previous.match(newOwner)||[]).length;
    assert.equal((fn.match(newOwner)||[]).length,previousDirect+(env==='QA'?3:2));
    assert.ok(fn.includes('STABLE SECURITY DEFINER'));
    assert.ok(fn.includes("SET search_path TO ''"));
    assert.ok(fn.includes('iberfit_m43_client_safe_session_v2'));
    assert.ok(fn.includes('iberfit_m43_client_safe_execution_v1'));
    assert.ok(fn.includes('v_allowed_client_ids'));
    assert.ok(fn.includes('remoteRevisions'));
    assert.ok(fn.includes('data'));
    if(env==='QA')assert.ok(!fn.includes('select distinct client_id from public.domain_entities_v26'));
    else assert.match(fn,/select distinct client_id from public.domain_entities_v26/u);
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

const qaOrder=extract(read('qa-migrations/20261109162000_u90_bootstrap_preserve_order_qa.sql'));
const original=extract(read('qa-rollbacks/20261109155000_u90_bootstrap_scoped_visibility_qa.rollback.sql'));
const finalProd=extract(read('migrations/20261109155100_u90_bootstrap_scoped_visibility_prod.sql'));
const prodBaseline=extract(read('rollbacks/20261109155100_u90_bootstrap_scoped_visibility_prod.rollback.sql'));
const canonicalEntities=sql=>sql.slice(sql.indexOf("'m26Entities'"),sql.indexOf("'metrics'"));
test('UNIVERSAL U90 QA order-correction is append-only and retains the exact entity projection',()=>{
  const sql=read('qa-migrations/20261109162000_u90_bootstrap_preserve_order_qa.sql');
  assert.match(sql,/a5a6f31254dc235f7f00311713401510/u);
  assert.match(read('qa-rollbacks/20261109162000_u90_bootstrap_preserve_order_qa.rollback.sql'),/d1ecdc751a5ba5b17bb9a219756e0e48/u);
  assert.equal((qaOrder.match(oldCTE)||[]).length,1);
  assert.equal(canonicalEntities(qaOrder),canonicalEntities(original));
  assert.equal(canonicalEntities(finalProd),canonicalEntities(prodBaseline));
  assert.ok(!/\bDO\s+\$/u.test(sql));
});

test('UNIVERSAL U91 QA performance fastpath preserves M43 sanitization and rollback source',()=>{
  const sql=read('qa-migrations/20261109172500_u91_deferred_session_fast_projection_qa.sql');
  const rollback=read('qa-rollbacks/20261109172500_u91_deferred_session_fast_projection_qa.rollback.sql');
  const current=extract(sql),prior=extract(rollback);
  assert.match(sql,/u91_qa_environment_source_gate/u);
  assert.ok(sql.includes('d1ecdc751a5ba5b17bb9a219756e0e48'));
  assert.ok(rollback.includes('6e738331104794833987e82b6b6d105f'));
  assert.match(current,/then public\.iberfit_m43_client_safe_session_v2\(/u);
  assert.match(current,/jsonb_set\(CASE WHEN jsonb_typeof\(e\.body\)='object'/u);
  assert.doesNotMatch(current,/then jsonb_set\(public\.iberfit_m43_client_safe_session_v2\(e\.body\)/u);
  assert.match(prior,/then jsonb_set\(public\.iberfit_m43_client_safe_session_v2\(e\.body\)/u);
  assert.ok(current.includes("SET search_path TO ''"));
  assert.ok(current.includes('STABLE SECURITY DEFINER'));
  assert.ok(current.includes("else public.iberfit_m43_client_safe_session_v2(e.body) end"));
  assert.ok(current.includes("NOT (e.entity_id=ANY(v_keep_completed_sessions))"));
  assert.ok(current.includes("v_defer_completed_blocks"));
  assert.ok(!/\b(GRANT|REVOKE|ALTER POLICY|DROP TABLE|TRUNCATE)\b/iu.test(sql));
});

test('UNIVERSAL U91 SonarCloud duplication exemptions are exact immutable SQL artifacts only',()=>{
 const p=readFileSync(new URL('../.sonarcloud.properties',import.meta.url),'utf8');
 const match=p.match(/^sonar\.cpd\.exclusions=(.+)$/mu);
 assert.ok(match);
 const patterns=match[1].split(',');
 const p0Exact=new Set([
   'supabase/qa-migrations/20261110163500_p0_qa_bootstrap_sanitized_projection_reuse.sql',
   'supabase/qa-rollbacks/20261110163500_p0_qa_bootstrap_sanitized_projection_reuse.rollback.sql',
 ]);
 assert.equal(patterns.length,10);
 assert.equal(new Set(patterns).size,patterns.length);
 const historic=patterns.filter(entry=>!p0Exact.has(entry));
 assert.equal(historic.length,8);
 for(const entry of historic){
   assert.match(entry,/^supabase\/(?:qa-migrations|qa-rollbacks|migrations|rollbacks)\/20261109\d{6}_u9[01]_[-._a-z0-9]+\.sql$/u);
 }
 for(const path of p0Exact)assert.ok(patterns.includes(path),path);
 for(const entry of patterns){
   assert.ok(!entry.includes('*')&&!entry.includes('?'),entry);
   assert.ok(!entry.includes('/src/'),entry);
 }
 assert.ok(!p.includes('sonar.exclusions='));
});
