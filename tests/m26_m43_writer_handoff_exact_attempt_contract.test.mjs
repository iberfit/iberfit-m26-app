import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectWriterArtifact,verifyWriterEvidence} from '../scripts/remote-gates/m43-writer-handoff.mjs';
const runId='40094436134',sha='1ae7fd3cc07e91043afbe920c6ac3e9c9d8e6e19';
const art=n=>({id:n,expired:false,name:`iberfit-m43-real-qa-${runId}-a${n}`,size_in_bytes:1000});
const proof=n=>({schema:'iberfit.m43.authenticated-real-qa.v1',passed:true,phase:'complete',project:'QA',
  synthetic:true,productionTouched:false,serviceRoleUsed:false,mockBackend:false,
  provenance:{runId,runAttempt:String(n),sourceSha:sha}});
test('failed-only rerun reads original successful writer attempt, not browser attempt',()=>{
  assert.deepEqual(selectWriterArtifact([art(1)],{runId,currentAttempt:2}),
    {name:`iberfit-m43-real-qa-${runId}-a1`,attempt:'1'});
  assert.deepEqual(verifyWriterEvidence(proof(1),{runId,writerAttempt:1,sourceSha:sha}),
    {runId,attempt:'1'});
});
test('a newer completed writer attempt supersedes a previous valid writer',()=>{
  assert.equal(selectWriterArtifact([art(1),art(2)],{runId,currentAttempt:2}).attempt,'2');
  assert.equal(selectWriterArtifact([art(1),art(2)],{runId,currentAttempt:1}).attempt,'1');
});
test('no writer, wrong run, failed writer or wrong source cannot certify QA',()=>{
  assert.throws(()=>selectWriterArtifact([], {runId,currentAttempt:2}),/M43_WRITER_SUCCESS_ARTIFACT_MISSING/);
  assert.throws(()=>selectWriterArtifact([art(1)], {runId:'abc',currentAttempt:2}),/INVALID/);
  for(const bad of [{...proof(1),passed:false},{...proof(1),phase:'partial'},
    {...proof(1),provenance:{...proof(1).provenance,runAttempt:'2'}},
    {...proof(1),provenance:{...proof(1).provenance,sourceSha:'f'.repeat(40)}}]){
    assert.throws(()=>verifyWriterEvidence(bad,{runId,writerAttempt:1,sourceSha:sha}),
      /M43_WRITER_HANDOFF_UNVERIFIED/);
  }
});
test('writer/browser run provenance is passed only via an authenticated evidence step',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/qa-real-write-cert.yml',import.meta.url),'utf8');
  const specs=['m43-client-real-history.spec.mjs','m43-client-interactive.spec.mjs'];
  assert.match(workflow,/m43-writer-handoff.mjs discover/);
  assert.match(workflow,/actions\/download-artifact@v4/);
  assert.match(workflow,/m43-writer-handoff.mjs verify/);
  assert.match(workflow,/M26_M43_SELECTED_WRITER_ATTEMPT:/);
  for(const spec of specs){
    const src=readFileSync(new URL('../qa/rc64/'+spec,import.meta.url),'utf8');
    assert.match(src,/M26_M43_WRITER_ATTEMPT/);
    assert.match(src,/M43_QA_WRITER_ATTESTATION_REQUIRED/);
  }
});
