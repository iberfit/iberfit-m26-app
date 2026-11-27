// Canonical supplemental GX350 SQL renderer, no database access.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const TEMPLATE_SHA256='dd54514b8c25c0a3d7775f6259046f279b2edb62170bef44154fef35e59c072e';
const marker='__GX350_READBACK_DIRECTION__';
export const readTemplate=()=>readFileSync(new URL('../../supabase/release-procedures/gx_onboarding_scoped_readback_v1.sql',import.meta.url),'utf8');
export function renderScopedReadback(source,{mode='install',dryRun=false}={}){
  if(typeof source!=='string'||createHash('sha256').update(source).digest('hex')!==TEMPLATE_SHA256)throw Error('GX350_READBACK_SOURCE_HASH_MISMATCH');
  if(!['install','rollback'].includes(mode)||typeof dryRun!=='boolean'||source.split(marker).length!==2)throw Error('GX350_READBACK_RENDER_INVALID');
  const sql=source.replace(marker,mode);
  return ['BEGIN;',"SET LOCAL lock_timeout='3s';","SET LOCAL statement_timeout='30s';",sql.trimEnd(),dryRun?'ROLLBACK;':'COMMIT;',''].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(args.some(a=>!['install','rollback','--dry-run','--check'].includes(a))||args.filter(a=>['install','rollback'].includes(a)).length>1||args.filter(a=>a==='--dry-run'||a==='--check').length>1)throw Error('Uso: node scripts/ops/gx350_onboarding_readback.mjs [install|rollback] [--dry-run|--check]');
  const mode=args.includes('rollback')?'rollback':'install';
  const sql=renderScopedReadback(readTemplate(),{mode,dryRun:args.includes('--dry-run')});
  if(args.includes('--check'))console.log(JSON.stringify({mode,sha256:createHash('sha256').update(sql).digest('hex'),bytes:Buffer.byteLength(sql),checked:true}));
  else process.stdout.write(sql);
}
