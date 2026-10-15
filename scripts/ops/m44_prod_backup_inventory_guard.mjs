// M44 production inventory gate. Delegates to the existing IBERFIT data-safety
// evaluator so Canary reviews and PROD promotion cannot disagree on recoverability.
// Managed inventory is NOT a successful restoration test.
import {evaluateBackupReadiness} from '../data-safety/check_prod_backup_readiness.mjs';
export const PROD_REF='pjhmrhejsoofmouedavw';
export const MAX_AGE_MS=48*60*60*1000;
const prefix='M44_PROD_BACKUP_';
export function certifyBackupInventory(payload,{nowMs=Date.now()}={}){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||!Array.isArray(payload.backups))
  throw Error(prefix+'INVENTORY_INVALID');
 if(!Number.isFinite(nowMs)||nowMs<=0)throw Error(prefix+'CLOCK_INVALID');
 let proof;
 try{
  proof=evaluateBackupReadiness(payload,{nowMs,maxDailyBackupAgeHours:MAX_AGE_MS/3600000});
 }catch(error){
  const message=String(error?.message||'').replace(/[^A-Z0-9_.:-]/g,'').slice(0,100);
  if(message==='PROD_BACKUP_COMPLETED_BACKUP_MISSING')
   throw Error(prefix+'NO_RECENT_COMPLETED_SNAPSHOT');
  if(message.startsWith('PROD_BACKUP_'))
   throw Error(prefix+message.slice('PROD_BACKUP_'.length));
  throw Error(prefix+'MANAGED_READINESS_UNKNOWN');
 }
 if(proof.ageHours<0)throw Error(prefix+'SNAPSHOT_FROM_FUTURE');
 const recent=(payload.backups||[])
  .filter(b=>b?.status==='COMPLETED'&&Number.isFinite(Date.parse(b.inserted_at||'')))
  .sort((a,b)=>Date.parse(b.inserted_at)-Date.parse(a.inserted_at))[0]||null;
 return Object.freeze({
  ready:true,project:PROD_REF,method:'supabase-managed-inventory',
  mode:proof.mode,backupUtc:proof.latestBackupAt,
  backupAgeHours:Math.ceil(proof.ageHours),
  physical:proof.mode==='PITR'||recent?.is_physical_backup===true,
  restoreTestVerified:false,
 });
}
export async function verifyBackupInventory({projectRef,accessToken,
  fetchImpl=globalThis.fetch,nowMs=Date.now()}={}){
 if(projectRef!==PROD_REF)throw Error(prefix+'WRONG_PROJECT');
 if(typeof accessToken!=='string'||accessToken.length<16)
  throw Error(prefix+'MANAGEMENT_TOKEN_MISSING');
 if(typeof fetchImpl!=='function')throw Error(prefix+'FETCH_UNAVAILABLE');
 let response;
 try{
  response=await fetchImpl('https://api.supabase.com/v1/projects/'+PROD_REF+'/database/backups',{
   method:'GET',
   headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},
   signal:AbortSignal.timeout(20000),
  });
 }catch{throw Error(prefix+'API_UNREACHABLE');}
 if(!response?.ok)
  throw Error(prefix+'API_HTTP_'+(Number.isInteger(response?.status)?response.status:'UNKNOWN'));
 let data;
 try{data=await response.json();}catch{throw Error(prefix+'API_NON_JSON');}
 return certifyBackupInventory(data,{nowMs});
}
if(process.argv[1]?.endsWith('/m44_prod_backup_inventory_guard.mjs')){
 verifyBackupInventory({projectRef:process.env.PROD_SUPABASE_REF,
  accessToken:process.env.SUPABASE_ACCESS_TOKEN})
 .then(x=>process.stdout.write('M44_PROD_BACKUP_INVENTORY_READY:'+x.mode+
   ':'+x.backupUtc+':restore_test_NOT_verified\n'))
 .catch(e=>{process.stderr.write(String(e?.message||prefix+'CHECK_FAILED')+'\n');process.exitCode=1;});
}
