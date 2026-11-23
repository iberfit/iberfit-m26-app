import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {attestM44ExternalEscrow} from '../scripts/ops/m44_external_escrow_digest_parity.mjs';

const synthetic=Object.freeze({
  GEMINI_API_KEY:'synthetic-only-google-credential-not-real',
  GOOGLE_API_KEY:'synthetic-only-fallback-credential-not-real',
  IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY:'synthetic-private-vapid-not-real-0123456789',
  IBERFIT_WEB_PUSH_VAPID_PUBLIC_KEY:'synthetic-public-vapid-not-real-9876543210',
  IBERFIT_WEB_PUSH_VAPID_SUBJECT:'mailto:test@example.invalid'
});
const hashed=name=>({name,value:createHash('sha256').update(synthetic[name]).digest('hex')});
const list=names=>names.map(hashed);
const make=()=>({
  managedSecrets:list(Object.keys(synthetic)),
  candidates:{...synthetic},
  smtpCandidate:'synthetic-smtp-password-never-used'
});
const inspect=args=>attestM44ExternalEscrow(args);

test('five independent credentials match SHA256 without authorizing release',()=>{
  const p=inspect(make());
  assert.equal(p.managedExternalNames,5);
  assert.equal(p.matchingIndependentCandidates,5);
  assert.equal(p.digestMetadataCompatible,true);
  assert.equal(p.aiCandidateMatched,true);
  assert.equal(p.vapidCandidateMatched,true);
  assert.equal(p.allConfiguredExternalCandidatesMatched,true);
  assert.equal(p.smtpCandidatePresent,true);
  assert.equal(p.smtpPasswordMatchVerified,false);
  assert.equal(p.liveProviderContinuityVerified,false);
  assert.equal(p.fullPlatformRecoveryCertified,false);
  assert.equal(p.productionActivationAuthorized,false);
  for(const value of Object.values(synthetic))
    assert.equal(JSON.stringify(p).includes(value),false);
});
test('fallback-only AI can match, provided three VAPID candidates match',()=>{
  const q=make();
  q.managedSecrets=q.managedSecrets.filter(x=>x.name!=='GEMINI_API_KEY');
  delete q.candidates.GEMINI_API_KEY;
  const p=inspect(q);
  assert.equal(p.allConfiguredExternalCandidatesMatched,true);
  assert.equal(p.managedExternalNames,4);
});
test('configured primary Gemini takes priority over backup fallback',()=>{
  const q=make();
  delete q.candidates.GEMINI_API_KEY;
  const p=inspect(q);
  assert.equal(p.aiCandidateMatched,false);
  assert.equal(p.allConfiguredExternalCandidatesMatched,false);
});
test('one missing or rotated protected credential blocks exact parity',()=>{
  for(const x of Object.keys(synthetic)){
    const q=make();q.candidates[x]='rotated-or-missing-wrong-credential';
    const p=inspect(q);
    assert.equal(p.allConfiguredExternalCandidatesMatched,false,x);
    assert.equal(p.productionActivationAuthorized,false);
  }
});
test('plaintext, redaction, null and unsupported digest format cannot be called matched',()=>{
  for(const x of ['actual-but-unsafe-secret','sha256:'+('f'.repeat(64)),null,'******',1]){
    const q=make();q.managedSecrets[0].value=x;
    const p=inspect(q);
    assert.equal(p.digestMetadataCompatible,false);
    assert.equal(p.allConfiguredExternalCandidatesMatched,false);
  }
});
test('absence of escrow values is a valid NO-GO signal without errors',()=>{
  const q=make();q.candidates={};q.smtpCandidate='';
  const p=inspect(q);
  assert.equal(p.matchingIndependentCandidates,0);
  assert.equal(p.smtpCandidatePresent,false);
  assert.equal(p.productionActivationAuthorized,false);
});
test('no external edge secrets cannot be misclassified as recovered',()=>{
  const q=make();q.managedSecrets=[];
  const p=inspect(q);
  assert.equal(p.managedExternalNames,0);
  assert.equal(p.digestMetadataCompatible,false);
  assert.equal(p.allConfiguredExternalCandidatesMatched,false);
});
test('irrelevant provider-managed names may exist, but duplicates and bad names are blocked',()=>{
  const q=make();q.managedSecrets.push({name:'SUPABASE_URL',value:'not-sensitive'});
  assert.equal(inspect(q).matchingIndependentCandidates,5);
  q.managedSecrets.push(hashed('GEMINI_API_KEY'));
  assert.throws(()=>inspect(q),/M44_EXTERNAL_ESCROW_METADATA_DUPLICATE/u);
  const z=make();z.managedSecrets.push({name:'BAD/NAME',value:'mock'});
  assert.throws(()=>inspect(z),/M44_EXTERNAL_ESCROW_METADATA_SHAPE_INVALID/u);
});
test('unknown local candidates and malformed inputs fail closed',()=>{
  for(const mutation of [
    q=>{q.candidates.UNKNOWN_API_KEY='value';},
    q=>{q.managedSecrets={};},
    q=>{q.candidates=[];},
  ]){
    const q=make();mutation(q);
    assert.throws(()=>inspect(q),/M44_EXTERNAL_ESCROW_/u);
  }
});
test('never claim hosted SMTP credential equality from presence alone',()=>{
  const q=make();
  q.smtpCandidate='long-synthetic-smtp-no-source-digest';
  const p=inspect(q);
  assert.equal(p.smtpCandidatePresent,true);
  assert.equal(p.smtpPasswordMatchVerified,false);
  assert.equal(p.fullPlatformRecoveryCertified,false);
});
