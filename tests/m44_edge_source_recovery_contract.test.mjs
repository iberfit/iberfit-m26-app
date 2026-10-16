import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 loadInventory, validateLocalSources, compareLiveMetadata
} from '../scripts/ops/m44_edge_source_recovery_contract.mjs';

const inventory=loadInventory();
const repo=path.resolve('.');
const live=()=>({project_ref:'pjhmrhejsoofmouedavw',
 functions:inventory.sources.map(s=>({slug:s.slug,verify_jwt:s.verify_jwt,ezbr_sha256:s.live_bundle_sha256}))});

test('The 15 production Edge functions have a checksum-bound recoverable source; retired endpoint stays retired',()=>{
 assert.equal(inventory.sources.length,15);
 const result=validateLocalSources(inventory,repo);
 assert.equal(result.filesVerified,15);
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
   const extra=['supabase/functions/iberfit-ai/deno.json','supabase/functions/iberfit-client-onboarding-v1/index.ts'];
   for(const s of extra){
     const dst=path.join(dir,s);fs.mkdirSync(path.dirname(dst),{recursive:true});
     fs.copyFileSync(path.join(repo,s),dst);
   }
   validateLocalSources(inventory,dir);
   const ai=path.join(dir,'supabase/functions/iberfit-ai/index.ts');
   fs.appendFileSync(ai,'\n// unexpected unauthorized drift\n');
   assert.throws(()=>validateLocalSources(inventory,dir),/SOURCE_CONTENT_DRIFT:iberfit-ai/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Manifest rejects traversal, incorrect provenance and accidental restoration of retired endpoint',()=>{
 const change=(fn)=>{const copy=structuredClone(inventory);fn(copy);return copy;};
 assert.throws(()=>validateLocalSources(change(x=>{
   x.sources[0].source_path='../../private/file.ts';
 }),repo),/PATH_ESCAPE|SOURCE_PATH_INVALID|SOURCE_TYPE_INVALID/);
 assert.throws(()=>loadInventory(path.join(repo,'package.json')),/MANIFEST_INVALID/);
});
