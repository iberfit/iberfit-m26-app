import test from 'node:test';
import assert from 'node:assert/strict';
import {planM44AclReconciliation as plan} from '../scripts/ops/m44_acl_reconciliation_plan.mjs';
const owner=['postgres','postgres','SELECT',false];
const unauth=['postgres','anon','DELETE',false];
const client=['postgres','authenticated','USAGE',false];
const execution=['postgres','anon','EXECUTE',false];
const defaultExtra=['postgres','anon','SELECT',false];
const column=['postgres','authenticated','UPDATE',false];
const table=(p)=>({name:'public:training:r',schema_name:'public',
 object_name:'training',object_type:'r',owner_name:'postgres',privileges:p});
const fn=p=>({name:'public.test(integer)',schema_name:'public',
 owner_name:'postgres',privileges:p});
const defaults=p=>({name:'public:postgres:r',schema_name:'public',
 owner_name:'postgres',object_type:'r',privileges:p});
const col=p=>({name:'public:training:notes',schema_name:'public',
 relation_name:'training',column_name:'notes',owner_name:'postgres',privileges:p});
const schema=(name,p)=>({name,owner_name:'postgres',privileges:p});
const original={
 relations:[table([owner])],functions:[fn([])],
 schemas:[schema('public',[owner,client]),schema('private',[owner])],
 defaults:[defaults([])],columns:[col([column])]
};
const restored={
 relations:[table([owner,unauth])],functions:[fn([execution])],
 schemas:[schema('public',[owner]),schema('private',[owner])],
 defaults:[defaults([defaultExtra])],columns:[col([column])]
};
test('bounded repair reverses only unexpected clone grants and replays column grants after table revokes',()=>{
 const result=plan(original,restored);
 assert.deepEqual(result.summary.relations,{source:1,restored:1,missing:0,extra:1,commands:1});
 assert.equal(result.summary.functions.extra,1);
 assert.equal(result.summary.defaults.extra,1);
 assert.equal(result.summary.schemas.missing,1);
 assert.equal(result.summary.columns.extra,0);
 assert.equal(result.commands.length,5);
 assert.match(result.commands[0],/ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE SELECT ON TABLES FROM "anon"/);
 assert.match(result.commands[1],/REVOKE EXECUTE ON FUNCTION public.test\(integer\) FROM "anon"/);
 assert.match(result.commands[2],/REVOKE DELETE ON TABLE "public"."training" FROM "anon"/);
 assert.match(result.commands[3],/GRANT UPDATE \("notes"\) ON TABLE "public"."training" TO "authenticated"/);
 assert.match(result.commands[4],/GRANT USAGE ON SCHEMA "public" TO "authenticated"/);
 assert.equal(result.executesSql,false);
 assert.equal(result.prodWrites,0);
});
test('exactly matching catalogs never revoke any permissions and never touch PROD',()=>{
 const b={...original,columns:[col([])]};
 const p=plan(b,b);
 assert.equal(p.commands.length,0);
 assert.equal(p.summary.relations.extra,0);
 assert.equal(p.requiresAtomicGuardAndPostcheck,true);
});
test('reject unexpected privilege grantors, options and grantees',()=>{
 for(const grant of [
  ['unknown','anon','DELETE',false],
  ['postgres','unknown','DELETE',false],
  ['postgres','anon','DELETE',true]
 ]){
  assert.throws(()=>plan(original,{...restored,relations:[table([owner,grant])]}),
   /M44_ACL_PLAN_/);
 }
});
test('reject missing app relations, wrong owner, and extra column privileges',()=>{
 assert.throws(()=>plan(original,{...restored,relations:[]}),/M44_ACL_PLAN_/);
 assert.throws(()=>plan(original,{...restored,functions:[{...fn([]),owner_name:'supabase_admin'}]}),/OWNER_DRIFT/);
 assert.throws(()=>plan(original,{...restored,columns:[col([column,['postgres','anon','SELECT',false]])]}),
  /UNEXPECTED_EXCESS_PRIVILEGE/);
});
test('source-to-sandbox grant comparison cannot inject a second SQL statement',()=>{
 const attempt={...restored,functions:[fn([execution]),
   {name:'public.test(integer);DROP TABLE public.training;--',
    owner_name:'postgres',privileges:[execution]}]};
 assert.throws(()=>plan(original,attempt),/M44_ACL_PLAN_/);
});

test('PG17 long function identities are supported without opening SQL injection paths',()=>{
 const sig='public.example_function('+Array.from({length:45},()=> 'integer').join(', ')+')';
 assert.ok(sig.length>128&&sig.length<512);
 const s={...original,functions:[{...fn([]),name:sig}]};
 const t={...restored,functions:[{...fn([execution]),name:sig}]};
 const p=plan(s,t);
 assert.equal(p.summary.functions.extra,1);
 assert.ok(p.commands.some(x=>x.includes('REVOKE EXECUTE ON FUNCTION '+sig)));
});
