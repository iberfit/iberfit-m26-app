// M44: local provenance gate for the exact production Edge source snapshot.
// No network calls, credentials, exports or deployments. Production live metadata
// must be supplied independently by an authorized read-only source.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
export const INVENTORY=path.join(HERE,'m44_prod_edge_recovery_sources.json');
export const EXPECTED_SCHEMA='iberfit.m44.prod.edge-recovery-source.v1';
export const PRODUCTION_REF='pjhmrhejsoofmouedavw';
const HEX40=/^[a-f0-9]{40}$/;
const HEX64=/^[a-f0-9]{64}$/;
const SLUG=/^[a-z][a-z0-9-]{1,100}$/;
const PREFIX='IBERFIT_EDGE_RECOVERY_';
// Modules imported by the live Evolution PDF function are part of its
// deployable source; index.ts alone is NOT a complete disaster-recovery copy.
// Their live PROD bytes were compared exactly with GitHub on 15/11/2026.
export const AUXILIARY_SOURCES=Object.freeze([
 Object.freeze({slug:'iberfit-evolution-report-emission-v1',
  path:'scripts/ops/m44_legacy_edge_source/iberfit-evolution-report-emission-v1-prod-20261115/pdf-renderer.js',
  git_blob_sha1:'d240795f24154e3f67c2d9740a364f83baf0f8c3'}),
 Object.freeze({slug:'iberfit-evolution-report-emission-v1',
  path:'scripts/ops/m44_legacy_edge_source/iberfit-evolution-report-emission-v1-prod-20261115/storage-recovery.js',
  git_blob_sha1:'71bd779a0186c6b30af1b2723a1309c16d8a3309'}),
]);

export function loadInventory(file=INVENTORY){
  const obj=JSON.parse(fs.readFileSync(file,'utf8'));
  if(obj?.schema!==EXPECTED_SCHEMA || obj.source_project_ref!==PRODUCTION_REF ||
     typeof obj.capture_date_utc!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(obj.capture_date_utc)||
     !Array.isArray(obj.sources)||obj.sources.length!==16)
    throw Error(PREFIX+'MANIFEST_INVALID');
  const names=new Set();
  for(const x of obj.sources){
    if(!SLUG.test(x.slug)||names.has(x.slug)||typeof x.verify_jwt!=='boolean'||
       !HEX64.test(x.live_bundle_sha256)||!HEX40.test(x.source_git_blob_sha1)||
       !['canonical','recovered_canonical_from_live','canonical_live_snapshot_pending_release','historical_live_snapshot_not_deploy_target'].includes(x.source_state)||
       typeof x.source_path!=='string'||x.source_path.startsWith('/')||
       x.source_path.split('/').some(k=>k==='..'||k==='.'||k==='')||
       !x.source_path.endsWith('.ts'))throw Error(PREFIX+'ENTRY_INVALID');
    if(x.source_state==='historical_live_snapshot_not_deploy_target'){
      // Historical production bytes are immutable recovery evidence, not deploy targets.
      if(x.slug!=='iberfit-client-onboarding-v1'||
        x.source_path!=='scripts/ops/m44_legacy_edge_source/iberfit-client-onboarding-v1-prod-20261016.ts')
        throw Error(PREFIX+'ARCHIVE_BOUNDARY_INVALID');
    }else if(x.source_state==='canonical_live_snapshot_pending_release'){
      const exactArchives={
        'iberfit-admin-client-invite-v1':'scripts/ops/m44_legacy_edge_source/iberfit-admin-client-invite-v1-prod-20261119/index.ts',
        'iberfit-evolution-report-emission-v1':'scripts/ops/m44_legacy_edge_source/iberfit-evolution-report-emission-v1-prod-20261115/index.ts',
        'iberfit-iri-report-emission-v1':'scripts/ops/m44_legacy_edge_source/iberfit-iri-report-emission-v1-prod-20261115/index.ts',
      };
      if(!Object.hasOwn(exactArchives,x.slug)||x.source_path!==exactArchives[x.slug])
        throw Error(PREFIX+'LIVE_PENDING_RELEASE_BOUNDARY_INVALID');
    }else if(x.source_path!==`supabase/functions/${x.slug}/index.ts`)
      throw Error(PREFIX+'CANONICAL_PATH_INVALID');
    names.add(x.slug);
  }
  if(names.size!==16 || !names.has('iberfit-ai')||!names.has('iberfit-client-onboarding-v1')||
    !names.has('iberfit-evolution-report-emission-v1'))
    throw Error(PREFIX+'REQUIRED_SOURCE_MISSING');
  return obj;
}

function gitBlobSha1(bytes){
 return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}

export function validateLocalSources(inventory=loadInventory(),root=path.resolve(HERE,'../..')){
  const rootReal=fs.realpathSync(root);
  for(const item of inventory.sources){
    const full=path.resolve(rootReal,item.source_path);
    if(!full.startsWith(rootReal+path.sep))throw Error(PREFIX+'PATH_ESCAPE');
    const info=fs.lstatSync(full);
    if(!info.isFile()||info.isSymbolicLink()||info.size<20||info.size>500000)
      throw Error(PREFIX+'SOURCE_TYPE_INVALID:'+item.slug);
    if(fs.realpathSync(full)!==full)throw Error(PREFIX+'SOURCE_PATH_INVALID:'+item.slug);
    const bytes=fs.readFileSync(full);
    if(gitBlobSha1(bytes)!==item.source_git_blob_sha1)
      throw Error(PREFIX+'SOURCE_CONTENT_DRIFT:'+item.slug);
    // Never allow a historical, still-live onboarding source to silently
    // replace the deliberately retired deployable implementation.
    if(item.source_state==='historical_live_snapshot_not_deploy_target'){
      const canonical=fs.readFileSync(path.join(rootReal,'supabase/functions/iberfit-client-onboarding-v1/index.ts'),'utf8');
      if(!canonical.includes('M26_CLIENT_ONBOARDING_RETIRED')||
         !/status\s*:\s*410/.test(canonical)||
         canonical===bytes.toString('utf8'))
        throw Error(PREFIX+'ONBOARDING_RETIRED_BOUNDARY_INVALID');
    }
    if(['noop','iberfit-one-time-create-juan-v1','iberfit-p0-email-delivery-probe-20260911'].includes(item.slug)){
      if(!/status\s*:\s*410/.test(bytes.toString('utf8')))
        throw Error(PREFIX+'RETIRED_ENDPOINT_REACTIVATION:'+item.slug);
    }
    if(/(?:eyJ[a-zA-Z0-9_-]{70,}|sb_secret_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35})/.test(bytes.toString('utf8')))
      throw Error(PREFIX+'EMBEDDED_SECRET_PATTERN:'+item.slug);
  }
  for(const part of AUXILIARY_SOURCES){
    const full=path.resolve(rootReal,part.path);
    if(!full.startsWith(rootReal+path.sep))
      throw Error(PREFIX+'AUXILIARY_PATH_ESCAPE');
    const info=fs.lstatSync(full);
    if(!info.isFile()||info.isSymbolicLink()||info.size<20||info.size>500000||
       fs.realpathSync(full)!==full||
       gitBlobSha1(fs.readFileSync(full))!==part.git_blob_sha1)
      throw Error(PREFIX+'AUXILIARY_SOURCE_DRIFT:'+part.slug);
  }
  const aiDeno=path.join(rootReal,'supabase/functions/iberfit-ai/deno.json');
  if(!fs.statSync(aiDeno).isFile())throw Error(PREFIX+'AI_IMPORT_MAP_MISSING');
  return Object.freeze({filesVerified:inventory.sources.length,sourcePresent:true,liveParity:false});
}

export function compareLiveMetadata(live,inventory=loadInventory()){
  if(live?.project_ref!==PRODUCTION_REF || !Array.isArray(live.functions))
    throw Error(PREFIX+'LIVE_PROVENANCE_INVALID');
  const expected=new Map(inventory.sources.map(x=>[x.slug,x]));
  const seen=new Set(),mismatches=[];
  for(const f of live.functions){
    if(typeof f.slug!=='string'||seen.has(f.slug))throw Error(PREFIX+'LIVE_DUPLICATE_OR_INVALID');
    seen.add(f.slug);
    const baseline=expected.get(f.slug);
    if(!baseline||baseline.verify_jwt!==f.verify_jwt||
       baseline.live_bundle_sha256!==f.ezbr_sha256)
      mismatches.push(f.slug);
  }
  for(const s of expected.keys())if(!seen.has(s))mismatches.push(s);
  return Object.freeze({liveParity:mismatches.length===0,mismatchCount:mismatches.length,
   // This deliberately never implies hosted Auth/Vault/secrets are restored.
   platformRecoveryVerified:false});
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const snapshot=loadInventory();
  const source=validateLocalSources(snapshot);
  if(process.argv.length>3)throw Error(PREFIX+'USAGE_INVALID');
  if(process.argv.length===3){
    const input=fs.readFileSync(process.argv[2],'utf8');
    if(input.length>1000000)throw Error(PREFIX+'LIVE_INVENTORY_OVERSIZED');
    const result=compareLiveMetadata(JSON.parse(input),snapshot);
    if(!result.liveParity)throw Error(PREFIX+'LIVE_INVENTORY_DRIFT');
    console.log('IBERFIT_EDGE_RECOVERY_SOURCE_AND_LIVE_METADATA_PARITY:'+source.filesVerified);
  }else console.log('IBERFIT_EDGE_RECOVERY_SOURCE_SNAPSHOT_VERIFIED:'+source.filesVerified);
 }catch(e){
  const message=String(e?.message||'');
  console.error(message.startsWith(PREFIX)?message:PREFIX+'VALIDATION_FAILED');
  process.exitCode=1;
 }
}
