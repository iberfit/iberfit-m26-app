import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {gitBlob,validateScope,verifyRepositorySources,verifyObservedSources} from '../scripts/ops/gx350_edge_scope.mjs';
const fresh=()=>JSON.parse(readFileSync(new URL('../scripts/ops/gx350_edge_scope.json',import.meta.url),'utf8'));
test('scope is exact, three functions, 14 PROD and 18 staged QA files; no authorization',()=>{
 const x=validateScope(fresh());assert.equal(x.functions.flatMap(f=>f.prod).length,14);assert.equal(x.functions.flatMap(f=>f.candidate).length,18);assert.equal(x.functions[1].importMap.liveBytesVerified,false);assert.equal(x.productionAuthorized,false);
 assert.equal(gitBlob(''),'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
});
test('reject scope, credential boundary and overclaims',()=>{
 for(const edit of [m=>m.productionAuthorized=true,m=>m.rollbackRuntimeCertified=true,m=>m.functions[0].verifyJwt=true,m=>m.functions[1].importMap.liveBytesVerified=true,m=>m.functions[0].prod[0].sourcePath='../bad',m=>m.functions[2].candidate.pop(),m=>m.candidate='x']){
 const m=fresh();edit(m);assert.throws(()=>validateScope(m),/GX350_EDGE_/);}
});
test('reject invalid byte source and wrong environment',()=>{
 assert.throws(()=>verifyRepositorySources(fresh(),()=>Buffer.from('not source')),/HASH_DRIFT/);
 assert.throws(()=>verifyObservedSources(fresh(),'prod','gjztkdwfmunnzhtvxrsu',[]),/OBSERVATION_SCOPE_INVALID/);
});
test('mock byte observation verifies names and rejects tampered, duplicate or wrong flags',()=>{
 const m=fresh(),obs=m.functions.map(f=>({slug:f.slug,status:'ACTIVE',version:f.qaVersion,ezbr_sha256:f.qaBundle,verify_jwt:f.verifyJwt,files:f.candidate.map(x=>{const content='fixture '+x.name;x.blob=gitBlob(content);return{name:f.slug+'/'+x.name,content};})}));
 assert.equal(verifyObservedSources(m,'qa',m.qaProject,obs).sourceFilesVerified,18);
 for(const edit of [a=>a[0].files[0].content+='x',a=>a[1].files[1].name=a[1].files[0].name,a=>a[2].verify_jwt=true,a=>a[2].version++,a=>a.pop()]){
 const a=structuredClone(obs);edit(a);assert.throws(()=>verifyObservedSources(m,'qa',m.qaProject,a),/GX350_EDGE_/);}
});
