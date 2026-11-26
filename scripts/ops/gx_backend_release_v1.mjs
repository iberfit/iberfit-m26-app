// Deterministic, local-only SQL assembler. Never opens a database connection.
// The caller must independently verify release gates and the intended project.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const BASE='99933fd7e8ce557f2b98c01be0ff9b612d0292a9';
const NAMES=Object.freeze(['gx_goal_measurement_v1','gx_followup_v1','gx_followup_recent_v1','gx_followup_detail_v1','gx_publication_v1','gx_report_proof_v1','gx_report_evidence_v1','gx_report_guards_v1','gx_admin_create_replay_v1']);
const prefix='supabase/release-procedures/';
const sha=s=>createHash('sha256').update(s).digest('hex');
const tx=/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;\s*$/gmi;
export function unwrapReleaseSql(source){
 if(typeof source!=='string'||!source.trim()||source.includes('\0'))throw Error('GX_RELEASE_SQL_INVALID');
 const matches=[...source.matchAll(tx)];
 if(!matches.length)return source.trimEnd();
 if(matches.length!==2||matches[0][1].toUpperCase()!=='BEGIN'||matches[1][1].toUpperCase()!=='COMMIT'||source.slice(matches[1].index+matches[1][0].length).trim())throw Error('GX_RELEASE_TRANSACTION_UNSAFE');
 // Only an outer BEGIN preceded by comments/whitespace is accepted.
 const header=source.slice(0,matches[0].index);if(header.split('\n').some(line=>line.trim()&&!line.trimStart().startsWith('--')))throw Error('GX_RELEASE_TRANSACTION_UNSAFE');
 return (header+'\n'+source.slice(matches[0].index+matches[0][0].length,matches[1].index)).trimEnd();
}
export function composeGxBackendRelease(contract,read,{mode='install',dryRun=false}={}){
 if(!contract||contract.schemaVersion!==1||contract.base!==BASE||!Array.isArray(contract.steps)||contract.steps.length!==NAMES.length||!['install','rollback'].includes(mode)||typeof dryRun!=='boolean'||typeof read!=='function')throw Error('GX_RELEASE_CONTRACT_INVALID');
 const parts=contract.steps.map((step,i)=>{
  const name=NAMES[i];if(step?.name!==name||step.install!==prefix+name+'.sql'||step.rollback!==prefix+name+'.rollback.sql')throw Error('GX_RELEASE_ORDER_INVALID');
  // Check both directions even when assembling only one; rollback must be available.
  const contents={};for(const direction of ['install','rollback']){const source=read(step[direction]);if(typeof source!=='string'||sha(source)!==step[direction+'Sha256'])throw Error('GX_RELEASE_HASH_MISMATCH:'+step[direction]);contents[direction]=unwrapReleaseSql(source);}
  return '-- '+name+' ('+mode+')\n'+contents[mode];
 });
 if(mode==='rollback')parts.reverse();
 return ['BEGIN;',"SET LOCAL lock_timeout='3s';","SET LOCAL statement_timeout='30s';",...parts,dryRun?'ROLLBACK;':'COMMIT;',''].join('\n');
}
export function readGxBackendRelease(root){const read=p=>fs.readFileSync(path.join(root,p),'utf8');return {contract:JSON.parse(read(prefix+'gx_backend_release_v1.json')),read};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);if(args.some(a=>!['install','rollback','--dry-run','--check'].includes(a))||args.filter(a=>['install','rollback'].includes(a)).length>1||args.includes('--check')&&args.includes('--dry-run'))throw Error('Uso: node scripts/ops/gx_backend_release_v1.mjs [install|rollback] [--dry-run|--check]');
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),{contract,read}=readGxBackendRelease(root);
 const mode=args.includes('rollback')?'rollback':'install';const sql=composeGxBackendRelease(contract,read,{mode,dryRun:args.includes('--dry-run')});
 if(args.includes('--check'))console.log(JSON.stringify({steps:contract.steps.length,mode,sha256:sha(sql),bytes:Buffer.byteLength(sql),checked:true}));else process.stdout.write(sql);
}
