// Canonical supplemental GX350 SQL renderer, no database access.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const TEMPLATE_SHA256='dd54514b8c25c0a3d7775f6259046f279b2edb62170bef44154fef35e59c072e';
export const DEFERRED_IRI_SHA256='7a8be01a0b6a0dc18b15c3eb085fccae4405b9f44e51ac3f1c43dadb4f0368bb';
export const readDeferredIriTemplate=()=>readFileSync(new URL('../../supabase/release-procedures/gx_admin_deferred_iri_identity_v1.sql',import.meta.url),'utf8');
const marker='__GX350_READBACK_DIRECTION__';
export const readTemplate=()=>readFileSync(new URL('../../supabase/release-procedures/gx_onboarding_scoped_readback_v1.sql',import.meta.url),'utf8');
function renderPinned(source,expectedHash,{mode='install',dryRun=false}={}){
  if(typeof source!=='string'||createHash('sha256').update(source).digest('hex')!==expectedHash)throw Error('GX350_READBACK_SOURCE_HASH_MISMATCH');
  if(!['install','rollback'].includes(mode)||typeof dryRun!=='boolean'||source.split(marker).length!==2)throw Error('GX350_READBACK_RENDER_INVALID');
  const sql=source.replace(marker,mode);
  return ['BEGIN;',"SET LOCAL lock_timeout='3s';","SET LOCAL statement_timeout='30s';",sql.trimEnd(),dryRun?'ROLLBACK;':'COMMIT;',''].join('\n');
}
export const renderScopedReadback=(source,options)=>renderPinned(source,TEMPLATE_SHA256,options);
export const renderDeferredIri=(source,options)=>renderPinned(source,DEFERRED_IRI_SHA256,options);
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(args.some(a=>!['install','rollback','--dry-run','--check','--deferred-iri'].includes(a))||args.filter(a=>['install','rollback'].includes(a)).length>1||args.filter(a=>a==='--dry-run'||a==='--check').length>1||args.filter(a=>a==='--deferred-iri').length>1)throw Error('Uso: node scripts/ops/gx350_onboarding_readback.mjs [install|rollback] [--dry-run|--check] [--deferred-iri]');
  const mode=args.includes('rollback')?'rollback':'install';
  const opts={mode,dryRun:args.includes('--dry-run')};
  const sql=args.includes('--deferred-iri')?renderDeferredIri(readDeferredIriTemplate(),opts):renderScopedReadback(readTemplate(),opts);
  if(args.includes('--check'))console.log(JSON.stringify({mode,sha256:createHash('sha256').update(sql).digest('hex'),bytes:Buffer.byteLength(sql),checked:true}));
  else process.stdout.write(sql);
}
