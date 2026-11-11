import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/qa-migrations/20261111033000_p0_qa_bootstrap_revision_visibility_index.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261111033000_p0_qa_bootstrap_revision_visibility_index.rollback.sql',import.meta.url),'utf8');
const oldHash='243c5df0f05cb35fffd3cf777a5932c5',newHash='5b9547e2230994fa96cb6cb629f8fb2d';
const oldBlock="    v_payload:=jsonb_set(v_payload,'{remoteRevisions}',coalesce((\n      select jsonb_object_agg(entry.key,entry.value)\n      from jsonb_each(coalesce(v_payload->'remoteRevisions','{}'::jsonb)) entry\n      where split_part(entry.key,':',1) not in ('planning','session','report')\n         or exists (\n           select 1\n           from jsonb_array_elements(coalesce(v_payload#>'{data,m26Entities}','[]'::jsonb)) item\n           where item->>'entityType'=split_part(entry.key,':',1)\n             and item->>'entityId'=split_part(entry.key,':',2)\n         )\n    ),'{}'::jsonb),true);";
const newBlock="    -- P0 QA ONLY: hash the already-redacted revision visibility once.\n    -- Use the original two-field split_part semantics, including extra ':'.\n    v_payload:=jsonb_set(v_payload,'{remoteRevisions}',coalesce((\n      with visible_revision_keys as materialized (\n        select coalesce(jsonb_object_agg(\n          (item->>'entityType')||':'||(item->>'entityId'),'true'::jsonb\n        ),'{}'::jsonb) as allowed\n        from jsonb_array_elements(coalesce(v_payload#>'{data,m26Entities}','[]'::jsonb)) item\n        where item->>'entityType' is not null\n          and item->>'entityId' is not null\n          and position(':' in item->>'entityType')=0\n          and position(':' in item->>'entityId')=0\n      )\n      select jsonb_object_agg(entry.key,entry.value)\n      from jsonb_each(coalesce(v_payload->'remoteRevisions','{}'::jsonb)) entry\n      cross join visible_revision_keys k\n      where split_part(entry.key,':',1) not in ('planning','session','report')\n         or k.allowed ? (split_part(entry.key,':',1)||':'||split_part(entry.key,':',2))\n    ),'{}'::jsonb),true);";
function def(sql){
  const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26()');
  const marker='\n$function$';
  const end=sql.indexOf(marker,start);
  assert.ok(start>=0&&end>start);
  return sql.slice(start,end+marker.length);
}
test('QA-only, immutable version-fingerprint source/ACL/ownership preflight and rollback',()=>{
  for(const [sql,expected,after] of [[migration,oldHash,newHash],[rollback,newHash,oldHash]]){
    assert.ok(sql.includes("s.key='environment' AND s.value#>>'{}'='QA'"));
    assert.ok(sql.includes(expected)&&sql.includes(after));
    assert.match(sql,/p\.prosecdef AND p\.provolatile='s'/);
    assert.ok(sql.includes("p.proconfig @> ARRAY['search_path="));
    assert.ok(sql.includes("pg_get_userbyid(p.proowner)='postgres'"));
    assert.ok(sql.includes("has_function_privilege('authenticated'"));
    assert.ok(sql.includes("has_function_privilege('service_role'"));
    assert.ok(sql.includes("NOT has_function_privilege('anon'"));
    assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|REVOKE)\s+(?:TABLE|FUNCTION|ON|INTO|FROM)\b/i);
  }
});
test('The optimized function equals the old one after exactly one substitution',()=>{
  const updated=def(migration),previous=def(rollback);
  assert.equal(updated.split(newBlock).length,2);
  assert.equal(previous.split(oldBlock).length,2);
  assert.equal(updated.replace(newBlock,oldBlock),previous);
  assert.match(updated,/STABLE SECURITY DEFINER/);
  assert.match(updated,/SET search_path TO ''/);
  assert.ok(updated.includes("where item->>'entityType' is not null"));
  assert.ok(updated.includes("and position(':' in item->>'entityId')=0"));
});
test('Revision-key membership preserves split_part semantics including malformed keys',()=>{
  const items=[
    {entityType:'planning',entityId:'a'},{entityType:'session',entityId:'b'},
    {entityType:'report',entityId:'c'},{entityType:'session',entityId:'b'},
    {entityType:'session',entityId:'abc:bad'},{entityType:'broken:kind',entityId:'e'},
    {entityType:'session',entityId:null},{entityType:null,entityId:'f'},
  ];
  const revisions={'planning:a':1,'session:b':2,'report:c':3,'session:b:extra':4,
    'planning:secret':5,'session:abc:bad':6,'broken:kind:e':7,'other:x':8,'session:':9};
  const original=Object.fromEntries(Object.entries(revisions).filter(([key])=>{
    const [kind,id]=key.split(':');
    return !['planning','session','report'].includes(kind)||
      items.some(x=>x.entityType===kind&&x.entityId===id);
  }));
  const eligible=new Set(items.filter(x=>x.entityType!==null&&x.entityId!==null
    &&!String(x.entityType).includes(':')&&!String(x.entityId).includes(':'))
    .map(x=>x.entityType+':'+x.entityId));
  const optimized=Object.fromEntries(Object.entries(revisions).filter(([key])=>{
    const [kind,id]=key.split(':');
    return !['planning','session','report'].includes(kind)||eligible.has(kind+':'+id);
  }));
  assert.deepEqual(optimized,original);
  assert.equal(optimized['planning:secret'],undefined);
  assert.equal(optimized['session:b:extra'],4);
});
test('Sonar only exempts exact immutable SQL snapshots from duplication',()=>{
  const config=readFileSync(new URL('../.sonarcloud.properties',import.meta.url),'utf8');
  const line=config.split('\n').find(l=>l.startsWith('sonar.cpd.exclusions='));
  const paths=line.slice('sonar.cpd.exclusions='.length).split(',');
  assert.equal(paths.length,new Set(paths).size);
  for(const file of ['supabase/qa-migrations/20261111033000_p0_qa_bootstrap_revision_visibility_index.sql','supabase/qa-rollbacks/20261111033000_p0_qa_bootstrap_revision_visibility_index.rollback.sql'])assert.equal(paths.filter(x=>x===file).length,1);
  assert.ok(paths.every(x=>x.endsWith('.sql')&&!/[?*]/.test(x)));
  assert.ok(!config.includes('sonar.exclusions='));
});
