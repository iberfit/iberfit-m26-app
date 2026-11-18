import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {extractReferencedNames} from '../scripts/ops/m44_edge_runtime_recovery_contract.mjs';
import {
 loadInventory, validateLocalSources, compareLiveMetadata
} from '../scripts/ops/m44_edge_source_recovery_contract.mjs';

const inventory=loadInventory();
const repo=path.resolve('.');
const live=()=>({project_ref:'pjhmrhejsoofmouedavw',
 functions:inventory.sources.map(s=>({slug:s.slug,verify_jwt:s.verify_jwt,ezbr_sha256:s.live_bundle_sha256}))});

test('The 16 production Edge functions have a checksum-bound recoverable source; retired endpoint stays retired',()=>{
 assert.equal(inventory.sources.length,16);
 const result=validateLocalSources(inventory,repo);
 assert.equal(result.filesVerified,16);
 assert.equal(result.sourcePresent,true);
 assert.equal(result.liveParity,false);
 assert.equal(result.platformRecoveryVerified,undefined);
 const historical=inventory.sources.find(x=>x.slug==='iberfit-client-onboarding-v1');
 assert.match(historical.source_path,/^scripts\/ops\/m44_legacy_edge_source\//);
 assert.equal(historical.source_state,'historical_live_snapshot_not_deploy_target');
});
test('Exact live deployment metadata is a separate attestation and never certifies managed Supabase recovery',()=>{
 const result=compareLiveMetadata(live());
 assert.equal(result.liveParity,true);
 assert.equal(result.mismatchCount,0);
 assert.equal(result.platformRecoveryVerified,false);
 for(const variant of [
   x=>x.functions[0].ezbr_sha256='f'.repeat(64),
   x=>x.functions[0].verify_jwt=!x.functions[0].verify_jwt,
   x=>x.functions.pop(),
   x=>x.functions.push({slug:'rogue-new',verify_jwt:true,ezbr_sha256:'0'.repeat(64)})
 ]){
   const different=live();
   variant(different);
   assert.equal(compareLiveMetadata(different).liveParity,false);
 }
 assert.throws(()=>compareLiveMetadata({...live(),project_ref:'gjztkdwfmunnzhtvxrsu'}),/LIVE_PROVENANCE_INVALID/);
 const dup=live();dup.functions.push({...dup.functions[0]});
 assert.throws(()=>compareLiveMetadata(dup),/LIVE_DUPLICATE_OR_INVALID/);
});
test('Tampering of an archived deployed source fails closed before release',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'if-m44-edge-source-'));
 try{
   for(const s of inventory.sources){
     const src=path.join(repo,s.source_path),dst=path.join(dir,s.source_path);
     fs.mkdirSync(path.dirname(dst),{recursive:true});
     fs.copyFileSync(src,dst);
   }
   const extra=[
    'supabase/functions/iberfit-ai/deno.json',
    'supabase/functions/iberfit-client-onboarding-v1/index.ts',
    'supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js',
    'supabase/functions/iberfit-evolution-report-emission-v1/storage-recovery.js',
   ];
   for(const s of extra){
     const dst=path.join(dir,s);fs.mkdirSync(path.dirname(dst),{recursive:true});
     fs.copyFileSync(path.join(repo,s),dst);
   }
   validateLocalSources(inventory,dir);
   const ai=path.join(dir,'supabase/functions/iberfit-ai/index.ts');
   fs.appendFileSync(ai,'\n// unexpected unauthorized drift\n');
   assert.throws(()=>validateLocalSources(inventory,dir),/SOURCE_CONTENT_DRIFT:iberfit-ai/);
   fs.copyFileSync(path.join(repo,'supabase/functions/iberfit-ai/index.ts'),ai);
   const aux=path.join(dir,'supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js');
   fs.appendFileSync(aux,'\n// unexpected dependency drift\n');
   assert.throws(()=>validateLocalSources(inventory,dir),/AUXILIARY_SOURCE_DRIFT:iberfit-evolution-report-emission-v1/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Manifest rejects traversal, incorrect provenance and accidental restoration of retired endpoint',()=>{
 const change=(fn)=>{const copy=structuredClone(inventory);fn(copy);return copy;};
 assert.throws(()=>validateLocalSources(change(x=>{
   x.sources[0].source_path='../../private/file.ts';
 }),repo),/PATH_ESCAPE|SOURCE_PATH_INVALID|SOURCE_TYPE_INVALID/);
 assert.throws(()=>loadInventory(path.join(repo,'package.json')),/MANIFEST_INVALID/);
});

test('Invitation Edge preserves the deployed PROD recovery snapshot independently from the candidate',()=>{
 const historical=inventory.sources.find(s=>s.slug==='iberfit-admin-client-invite-v1');
 assert.equal(historical.source_state,'canonical_live_snapshot_pending_release');
 assert.equal(historical.source_path,'scripts/ops/m44_legacy_edge_source/iberfit-admin-client-invite-v1-prod-20261117.ts');
 const archived=fs.readFileSync(path.join(repo,historical.source_path),'utf8');
 const candidate=fs.readFileSync(path.join(repo,'supabase/functions/iberfit-admin-client-invite-v1/index.ts'),'utf8');
 assert.notEqual(archived,candidate);
 assert.match(archived,/admin-client-invite-v26\.5/u);
 assert.match(candidate,/admin-client-invite-v26\.6/u);
});

test('M44 active LIVE invitation retains immutable recoverable bytes; candidate is separately SHA-bound',()=>{
 const manifest=JSON.parse(fs.readFileSync(
  'scripts/ops/m44_edge_candidate_iberfit_admin_invite_v1.json','utf8'));
 assert.deepEqual(Object.keys(manifest).sort(),[
  'schema','project_ref','slug','live_archive_path','live_archive_git_blob_sha1',
  'candidate_source_path','candidate_git_blob_sha1','parent_canary_sha',
  'external_live_attestation','production_release_approved'].sort());
 assert.equal(manifest.schema,'iberfit.m44.edge-release-candidate.v1');
 assert.equal(manifest.project_ref,'pjhmrhejsoofmouedavw');
 assert.equal(manifest.slug,'iberfit-admin-client-invite-v1');
 assert.equal(manifest.parent_canary_sha,'6b6033e395c900c42f7a0ac6209838e895df4c83');
 assert.equal(manifest.external_live_attestation,false);
 assert.equal(manifest.production_release_approved,false);
 const historical=inventory.sources.find(s=>s.slug===manifest.slug);
 assert.equal(historical.source_state,'canonical_live_snapshot_pending_release');
 assert.equal(historical.source_path,manifest.live_archive_path);
 assert.equal(historical.source_git_blob_sha1,manifest.live_archive_git_blob_sha1);
 assert.equal(manifest.live_archive_path,
  'scripts/ops/m44_legacy_edge_source/iberfit-admin-client-invite-v1-prod-20261117.ts');
 assert.equal(manifest.candidate_source_path,
  'supabase/functions/iberfit-admin-client-invite-v1/index.ts');
 const hash=(b)=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0'))
   .update(b).digest('hex');
 const live=fs.readFileSync(manifest.live_archive_path),candidate=fs.readFileSync(manifest.candidate_source_path);
 assert.equal(hash(live),manifest.live_archive_git_blob_sha1);
 assert.equal(hash(candidate),manifest.candidate_git_blob_sha1);
 assert.equal(hash(live),'a6ee9759dbc99267fff6cbc256d6dd906109fdea');
 assert.equal(hash(candidate),'9124e4e5c46419f4cc339fed05f6be34ac67524b');
 assert.notEqual(hash(live),hash(candidate),'CANDIDATE_MUST_NOT_IMPERSONATE_LIVE');
 assert.deepEqual(extractReferencedNames(candidate.toString('utf8')),
  extractReferencedNames(live.toString('utf8')),
  'CANDIDATE_SECRET_ENV_REFERENCE_EXPANSION');
});
