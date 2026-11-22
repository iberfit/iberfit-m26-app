// IBERFIT M44: offline, read-only source-to-archive ACL coverage.
// DOES NOT create/restore/pause projects, replay GRANT/REVOKE or log SQL/names.
// The one prior authenticated encrypted PROD archive is opened only in a
// private ephemeral GitHub runner, and erased at process completion.
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync,openSync,closeSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const REPO='iberfit/iberfit-m26-app',PROD='pjhmrhejsoofmouedavw';
const BACKUP_RUN=44944459633,BACKUP_ARTIFACT=14723146683;
const BACKUP_DIGEST='a68a5f1289bc974c0cc7ec62adfbced4325153d4271e5de278a4988bcfc913f1';
const BACKUP_BYTES=35011221;
const PREFIX='M44_OFFLINE_ACL_';
const fail=code=>{throw Error(PREFIX+code);};
const kindMap=Object.freeze({r:'TABLE',p:'TABLE',S:'SEQUENCE',v:'VIEW',m:'MATERIALIZED VIEW',f:'FOREIGN TABLE'});
const safeName=/^[A-Za-z_][A-Za-z_0-9$]{0,127}$/u;
const MAX_TOC=16*1024*1024;
function readText(response){
 if(!response?.ok)fail('SOURCE_HTTP_'+(response?.status||'UNKNOWN'));
 return response.json().catch(()=>{fail('JSON_INVALID');});
}
async function api(url,token,{method='GET',body}={}){
 const u=new URL(url);
 if(u.origin!=='https://api.github.com'&&u.origin!=='https://api.supabase.com')fail('ORIGIN_DENIED');
 const r=await fetch(u,{method,redirect:'error',signal:AbortSignal.timeout(30000),
  headers:{Authorization:'Bearer '+token,Accept:'application/json',
   ...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined});
 return readText(r);
}
export function extractArchiveRelationAclKeys(toc){
 if(typeof toc!=='string'||toc.length<70||toc.length>MAX_TOC||toc.includes('\0'))fail('TOC_INPUT_INVALID');
 const set=new Set();let allAcl=0,appEntries=0,otherAcl=0;
 const lines=toc.replace(/\r\n/g,'\n').split('\n');
 for(const line of lines){
  if(!line||line.startsWith(';'))continue;
  const m=/^\d+;\s+\d+\s+\d+\s+ACL\s+(public|private)\s+(TABLE|SEQUENCE|VIEW|MATERIALIZED VIEW|FOREIGN TABLE)\s+(.+)\s+postgres$/u.exec(line);
  if(m){
   const name=m[3].trim();
   if(!safeName.test(name))fail('TOC_IDENTIFIER_UNSUPPORTED');
   const key=[m[1],m[2],name].join('|');
   if(set.has(key))fail('TOC_RELATION_ACL_DUPLICATED');
   set.add(key);appEntries++;
  }else if(/^\d+;\s+\d+\s+\d+\s+ACL\s+/u.test(line)){
   otherAcl++;
   // An app-relation ACL with unrecognized ownership/format is a blocker.
   if(/^\d+;\s+\d+\s+\d+\s+ACL\s+(?:public|private)\s+(?:TABLE|SEQUENCE|VIEW|MATERIALIZED VIEW|FOREIGN TABLE)\s+/u.test(line))
    fail('TOC_RELATION_ACL_UNPARSEABLE');
  }
  if(/^\d+;\s+\d+\s+\d+\s+ACL\s+/u.test(line))allAcl++;
 }
 if(appEntries<110||allAcl<350||appEntries>allAcl)fail('TOC_SCOPE_UNEXPECTED');
 return Object.freeze({relationKeys:set,relationAclEntries:appEntries,totalAcl:allAcl,otherAcl});
}
export function compareArchiveRelationCoverage(rows,toc){
 const archive=extractArchiveRelationAclKeys(toc);
 if(!Array.isArray(rows)||rows.length<125||rows.length>5000)fail('SOURCE_SCOPE_INVALID');
 const source=new Set(),explicit=new Set(),byKind={TABLE:0,SEQUENCE:0,VIEW:0,'MATERIALIZED VIEW':0,'FOREIGN TABLE':0};
 for(const row of rows){
  const kind=kindMap[row?.kind],schema=row?.schema_name,name=row?.relation_name;
  if(!kind||!['public','private'].includes(schema)||!safeName.test(name)||
    typeof row.explicit_acl!=='boolean')fail('SOURCE_ROW_INVALID');
  const key=[schema,kind,name].join('|');
  if(source.has(key))fail('SOURCE_DUPLICATE_RELATION');
  source.add(key);
  if(row.explicit_acl){explicit.add(key);byKind[kind]++;}
 }
 const missing=[...explicit].filter(k=>!archive.relationKeys.has(k));
 const orphaned=[...archive.relationKeys].filter(k=>!source.has(k));
 const withoutExplicit=[...archive.relationKeys].filter(k=>source.has(k)&&!explicit.has(k));
 const result=Object.freeze({
  sourceRelations:source.size,sourceExplicitAcl:explicit.size,
  tocRelationAcl:archive.relationAclEntries,totalTocAcl:archive.totalAcl,
  missingInArchive:missing.length,archiveObjectsMissingSource:orphaned.length,
  archiveAclOnNullSource:withoutExplicit.length,byKind:Object.freeze(byKind),
  prodWrites:0,sandboxTouched:false,userRowsRead:false,
  exactManagedAclParityCertified:false
 });
 if(explicit.size<125||result.tocRelationAcl<115)fail('RELATION_COUNTS_UNEXPECTED');
 return result;
}
function exec(cmd,args,{timeout=120000,maxBuffer=16*1024*1024,env=process.env,fd=null}={}){
 const r=spawnSync(cmd,args,{encoding:fd===null?'utf8':undefined,timeout,maxBuffer,env,
   stdio:['ignore',fd===null?'pipe':fd,'pipe']});
 if(r.status!==0||r.error)fail('PRIVATE_SUBPROCESS_FAILED');
 return fd===null?r.stdout:'';
}
async function archive(dir){
 const token=process.env.GITHUB_TOKEN;
 const meta=await api('https://api.github.com/repos/'+REPO+'/actions/artifacts/'+BACKUP_ARTIFACT,token);
 const run=await api('https://api.github.com/repos/'+REPO+'/actions/runs/'+BACKUP_RUN,token);
 if(meta.expired||meta.digest!=='sha256:'+BACKUP_DIGEST||
    meta.size_in_bytes!==BACKUP_BYTES||run.conclusion!=='success'||run.status!=='completed')
   fail('PROVENANCE_OR_DIGEST_INVALID');
 const resp=await fetch('https://api.github.com/repos/'+REPO+'/actions/artifacts/'+BACKUP_ARTIFACT+'/zip',{
   headers:{Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'},
   redirect:'follow',signal:AbortSignal.timeout(180000)});
 if(!resp.ok||!resp.body)fail('ARTIFACT_DOWNLOAD_DENIED');
 let bytes=0;const parts=[];
 for await(const chunk of resp.body){
  bytes+=chunk.length;
  if(bytes>BACKUP_BYTES)fail('ARTIFACT_SIZE_INVALID');
  parts.push(Buffer.from(chunk));
 }
 const zip=Buffer.concat(parts);
 if(bytes!==BACKUP_BYTES||createHash('sha256').update(zip).digest('hex')!==BACKUP_DIGEST)
  fail('ARTIFACT_AUTHENTICITY_FAILED');
 const zipfile=join(dir,'encrypted.zip');writeFileSync(zipfile,zip,{flag:'wx',mode:0o600});
 const names=exec('unzip',['-Z1',zipfile]).trim();
 if(names!=='iberfit-prod-recovery.ibf')fail('ARCHIVE_ZIP_SCOPE_DENIED');
 const ciphertext=join(dir,'archive.ibf');
 let fd=openSync(ciphertext,'wx',0o600);
 try{exec('unzip',['-p',zipfile,names],{fd,timeout:120000,maxBuffer:1024*1024});}
 finally{closeSync(fd);}
 const tar=join(dir,'backup.tar');
 exec(process.execPath,['scripts/ops/m44_encrypted_backup_archive.mjs','decrypt',ciphertext,tar],
      {timeout:180000,maxBuffer:512*1024});
 const pg=join(dir,'database.pgcustom');fd=openSync(pg,'wx',0o600);
 try{exec('tar',['-xOf',tar,'database.pgcustom'],{fd,timeout:120000,maxBuffer:1024*1024});}
 finally{closeSync(fd);}
 return pg;
}
async function sourceRelations(){
 const query="SELECT n.nspname AS schema_name,c.relname AS relation_name,c.relkind::text AS kind,(c.relacl IS NOT NULL) AS explicit_acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m','S','f') ORDER BY n.nspname,c.relkind,c.relname";
 const v=await api('https://api.supabase.com/v1/projects/'+PROD+'/database/query',
  process.env.SUPABASE_ACCESS_TOKEN,{method:'POST',body:{query}});
 const rows=Array.isArray(v)?v:v?.result;
 if(!Array.isArray(rows))fail('SOURCE_SQL_INVALID');
 return rows;
}
async function main(){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!==REPO||
  process.env.GITHUB_EVENT_NAME!=='push'||
  process.env.GITHUB_REF!=='refs/heads/canary/rc74-4'||
  process.env.M44_OFFLINE_DIAGNOSTIC_AUTHORIZATION!=='ACL_ARCHIVE_COVERAGE_ONLY_20261122'||
  !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||'')||
  !process.env.GITHUB_TOKEN||!process.env.SUPABASE_ACCESS_TOKEN||
  String(process.env.IBERFIT_BACKUP_PASSPHRASE||'').length<32)
  fail('PROTECTED_CONTEXT_REQUIRED');
 const dir=mkdtempSync(join(tmpdir(),'m44-acl-offline-'));chmodSync(dir,0o700);
 try{
  // Only immutable backup and read-only PROD metadata; zero QA/clone operations.
  const source=await sourceRelations();
  const pg=await archive(dir);
  const toc=exec('docker',['run','--rm','-v',dir+':/work:ro','postgres:17-alpine',
    'pg_restore','--list','/work/database.pgcustom'],{timeout:120000});
  const report=compareArchiveRelationCoverage(source,toc);
  console.log('M44_OFFLINE_ACL_ARCHIVE_COVERAGE:source_relations='+report.sourceRelations+
   ':source_explicit='+report.sourceExplicitAcl+
   ':toc_app_relations='+report.tocRelationAcl+
   ':toc_all_acl='+report.totalTocAcl+
   ':missing='+report.missingInArchive+
   ':orphaned='+report.archiveObjectsMissingSource+
   ':unexpected='+report.archiveAclOnNullSource+
   ':prod_writes=0:qa_paused=0:clone_used=0:acl_restoration_NOT_certified');
  if(report.missingInArchive||report.archiveObjectsMissingSource||report.archiveAclOnNullSource)
   fail('ARCHIVE_RELATION_ACL_COVERAGE_DRIFT');
 }finally{rmSync(dir,{force:true,recursive:true,maxRetries:2});}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
 main().catch(e=>{const m=String(e?.message||'');console.error(m.startsWith(PREFIX)?m:PREFIX+'FAILED_CLOSED');process.exitCode=1;});
