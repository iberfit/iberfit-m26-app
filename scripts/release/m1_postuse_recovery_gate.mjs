// M1 read-only post-use safety gate. This is NOT disaster-recovery certification.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const SQL=readFileSync(new URL('./m1_postuse_recovery_report.sql',import.meta.url),'utf8');
const PROJECT='pjhmrhejsoofmouedavw';
const NAMES=['total','autonomous_published','autonomous_completed','active','completed','missing_execution_id','execution_drift','dated_history','orphan_dated','active_locks'];
function fail(code){throw Error('M1_POSTUSE_'+code);}
export function certifyM1PostuseIntegrity(payload,environment){
 const rows=Array.isArray(payload)?payload:payload?.result;
 if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.report||
    Array.isArray(rows[0].report))fail('REPORT_SHAPE_INVALID');
 const r=rows[0].report,c=r.counts;
 if(r.schema!=='iberfit.m1.postuse.recovery.v1')fail('SCHEMA_DRIFT');
 if(!['PRODUCTION','QA'].includes(r.environment)||
    (environment&&environment!==r.environment))fail('ENVIRONMENT_DRIFT');
 if(r.rls!==true||r.u60Anonymous!==false||
    typeof r.u72Installed!=='boolean'||
    typeof r.u60Authenticated!=='boolean')fail('ACCESS_BOUNDARY_DRIFT');
 if(!c||typeof c!=='object'||Array.isArray(c))fail('COUNTS_MISSING');
 for(const k of NAMES)
   if(!Number.isSafeInteger(c[k])||c[k]<0)fail('COUNT_INVALID_'+k.toUpperCase());
 if(c.autonomous_published>c.total||c.autonomous_completed>c.autonomous_published||
    c.autonomous_completed>c.completed||c.completed>c.total||
    c.active>c.total||c.missing_execution_id>c.total||
    c.execution_drift>c.total||c.orphan_dated>c.dated_history||
    c.dated_history>c.total)fail('COUNT_RELATIONS_DRIFT');
 if(c.missing_execution_id||c.execution_drift||c.orphan_dated)
   fail('HISTORY_OR_OWNERSHIP_INTEGRITY_DRIFT');
 if(!r.u72Installed&&(r.u60Authenticated||
    c.dated_history>0||c.autonomous_published>0))
   fail('BACKEND_HISTORY_COMPATIBILITY_DRIFT');
 const used=c.autonomous_published>0||c.dated_history>0||c.active>0;
 return Object.freeze({ok:true,readOnly:true,environment:r.environment,
   total:c.total,active:c.active,completed:c.completed,
   autonomousPublished:c.autonomous_published,
   autonomousCompleted:c.autonomous_completed,
   datedHistory:c.dated_history,activeLocks:c.active_locks,
   recoveryMode:used?'FORWARD_ONLY_PRESERVE_HISTORY':'PRE_USE_CANDIDATE_ONLY',
   rollbackAuthorized:false,productionMutationAuthorized:false,
   fullPlatformRecoveryCertified:false});
}
export async function runLiveM1PostuseGate({token,project=PROJECT,fetcher=fetch}={}){
 if(project!==PROJECT||typeof token!=='string'||token.length<16)
   fail('PROD_CREDENTIAL_OR_TARGET_INVALID');
 const res=await fetcher(
  'https://api.supabase.com/v1/projects/'+PROJECT+'/database/query/read-only',
  {method:'POST',redirect:'error',
   headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},
   body:JSON.stringify({query:SQL}),signal:AbortSignal.timeout(20000)});
 if(!res?.ok)fail('READONLY_HTTP_'+String(res?.status||0));
 return certifyM1PostuseIntegrity(await res.json(),'PRODUCTION');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 if(process.env.GITHUB_ACTIONS!=='true'||
    process.env.GITHUB_REPOSITORY!=='iberfit/iberfit-m26-app'||
    process.env.PROD_SUPABASE_REF!==PROJECT||
    process.env.U60_RELEASE_ACTIVE!=='true'){
   console.error('M1_POSTUSE_PROTECTED_RELEASE_CONTEXT_REQUIRED');process.exitCode=1;
 }else{
  try{
   const proof=await runLiveM1PostuseGate({token:process.env.SUPABASE_ACCESS_TOKEN});
   console.log('M1_POSTUSE_INTEGRITY_VERIFIED mode='+proof.recoveryMode+
    ' active='+proof.active+' datedHistory='+proof.datedHistory+
    ' writes=0 platformRecoveryCertified=false');
  }catch(e){
   console.error(String(e?.message||'M1_POSTUSE_NOT_CERTIFIED'));process.exitCode=1;
  }
 }
}
