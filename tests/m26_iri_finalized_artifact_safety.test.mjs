import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finishIriArtifactDelivery} from '../supabase/functions/iberfit-iri-report-emission-v1/finalized-artifact.js';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const expected={issueRequestId:id(1),issuanceId:id(2),clientId:id(3),assessmentId:id(4),audience:'cliente',artifactHash:'a'.repeat(64),sourceHash:'b'.repeat(64)};
const path=issuance=>[expected.clientId,expected.assessmentId,expected.audience,issuance,'report.pdf'].join('/');
expected.artifactPath=path(expected.issuanceId);
const row={ok:true,reused:false,issueRequestId:expected.issueRequestId,issuanceId:expected.issuanceId,documentId:id(5),version:1,clientId:expected.clientId,assessmentId:expected.assessmentId,audience:expected.audience,artifactPath:expected.artifactPath,artifactSha256:expected.artifactHash};
function fixture({signError=false,removeError=false,emptyUrl=false}={}){
 const calls=[];
 const storage={remove:async paths=>{calls.push(['remove',paths]);if(removeError)throw Error('cleanup failed');return {error:null};},
 createSignedUrl:async(p,seconds)=>{calls.push(['sign',p,seconds]);return signError?{error:Error('network')}:{data:{signedUrl:emptyUrl?null:'https://example.invalid/signed'}};}};
 return {calls,run:final=>finishIriArtifactDelivery({final,storage,expected})};
}
test('IRI committed PDF survives failed signed URL, including empty URL',async()=>{
 for(const options of [{signError:true},{emptyUrl:true}]){
  const f=fixture(options);await assert.rejects(f.run({data:row}));
  assert.deepEqual(f.calls,[['sign',expected.artifactPath,120]]);
 }
});
test('IRI ambiguous finalizer error or malformed response cannot delete or sign any object',async()=>{
 for(const final of [{error:Error('timeout after commit')},{data:null},{data:{...row,reused:undefined}},{data:{...row,artifactPath:path(id(6))}},{data:{...row,clientId:id(9)}},{data:{...row,artifactSha256:'c'.repeat(64)}}]){
  const f=fixture();await assert.rejects(f.run(final));assert.deepEqual(f.calls,[]);
 }
});
test('IRI replay cleans only the unused upload, then opens canonical artifact even if cleanup fails',async()=>{
 const replay={...row,reused:true,issuanceId:id(6),artifactPath:path(id(6)),artifactSha256:'c'.repeat(64)};
 for(const options of [{},{removeError:true}]){
  const f=fixture(options);const result=await f.run({data:replay});
  assert.equal(result.artifactPath,path(id(6)));
  assert.equal(result.sourceSha256,expected.sourceHash);
  assert.deepEqual(f.calls,[['remove',[expected.artifactPath]],['sign',path(id(6)),120]]);
 }
});
test('IRI normal issuance and same canonical replay never delete the committed PDF',async()=>{
 for(const reused of [false,true]){
  const f=fixture();await f.run({data:{...row,reused}});
  assert.deepEqual(f.calls,[['sign',expected.artifactPath,120]]);
 }
 const source=readFileSync(new URL('../supabase/functions/iberfit-iri-report-emission-v1/index.ts',import.meta.url),'utf8');
 assert.match(source,/return finishIriArtifactDelivery\(\{/u);
 assert.doesNotMatch(source,/remove\(\[artifactPath\]\)/u);
});
