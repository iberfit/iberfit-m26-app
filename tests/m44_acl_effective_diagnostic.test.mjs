import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeM44EffectiveAclDifferences as summarize} from '../scripts/ops/m44_acl_effective_diagnostic.mjs';
const row=(name,grants,owner='postgres')=>({schema_name:'public',relation_name:name,
 kind:'r',owner_name:owner,effective_privileges:grants});
const owner=['postgres','postgres','SELECT',false];
const client=['postgres','authenticated','SELECT',false];
const anon=['postgres','anon','SELECT',false];
test('identical privilege sets have zero semantic drift',()=>{
 const s=[row('one',[owner,client]),row('two',[owner])];
 const d=summarize(s,s);
 assert.deepEqual(d,{sourceRelations:2,cloneRelations:2,missingRelations:0,
  extraRelations:0,ownerMismatches:0,relationsWithGrantDrift:0,
  missingGrants:0,extraGrants:0,invalidGrantors:0,unrecognizedGrantees:0});
});
test('classify missing and unexpected grants without disclosing names',()=>{
 const d=summarize([row('secret',[owner,client])],[row('secret',[owner,anon])]);
 assert.equal(d.missingGrants,1);
 assert.equal(d.extraGrants,1);
 assert.equal(d.relationsWithGrantDrift,1);
 assert.doesNotMatch(JSON.stringify(d),/secret|authenticated|anon/);
});
test('do not confuse owner and relation drift with privilege drift',()=>{
 const d=summarize([row('one',[owner]),row('two',[owner])],
  [row('one',[owner],'supabase_admin'),row('three',[owner])]);
 assert.equal(d.ownerMismatches,1);
 assert.equal(d.missingRelations,1);
 assert.equal(d.extraRelations,1);
 assert.equal(d.missingGrants,0);
});
test('count invalid grantor and unauthorized recipient categories',()=>{
 const d=summarize([row('one',[['supabase_admin','untrusted','SELECT',true]])],
  [row('one',[owner])]);
 assert.equal(d.invalidGrantors,1);
 assert.equal(d.unrecognizedGrantees,1);
});
test('fail closed on duplicate relations and malformed grants',()=>{
 assert.throws(()=>summarize([row('one',[owner]),row('one',[owner])],
  [row('one',[owner])]),/DUPLICATE_RELATION/);
 assert.throws(()=>summarize([row('one',[owner,owner])],
  [row('one',[owner])]),/DUPLICATE_GRANT/);
 assert.throws(()=>summarize([row('one',[['postgres','anon','SELECT','false']])],
  [row('one',[owner])]),/GRANT_INVALID/);
});
