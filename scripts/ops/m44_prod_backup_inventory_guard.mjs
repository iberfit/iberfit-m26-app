// M44 production backup inventory gate. Does not write to Supabase or access
// user-level records. A completed inventory entry is not proof of a tested restore.
export const PROD_REF='pjhmrhejsoofmouedavw';
export const MAX_AGE_MS=48*60*60*1000;
const prefix='M44_PROD_BACKUP_';
export function certifyBackupInventory(payload,{nowMs=Date.now()}={}){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||!Array.isArray(payload.backups))
  throw Error(prefix+'INVENTORY_INVALID');
 if(!Number.isFinite(nowMs))throw Error(prefix+'CLOCK_INVALID');
 const candidates=payload.backups.filter(b=>b&&typeof b==='object'&&
   String(b.status||'').toUpperCase()==='COMPLETED')
  .map(b=>({when:Date.parse(String(b.inserted_at||'')),
    physical:b.is_physical_backup===true}))
  .filter(x=>Number.isFinite(x.when)&&x.when<=nowMs&&nowMs-x.when<=MAX_AGE_MS)
  .sort((a,b)=>b.when-a.when);
 if(!candidates.length)throw Error(prefix+'NO_RECENT_COMPLETED_SNAPSHOT');
 const b=candidates[0];
 // Deliberately omit backup id, user data, database credentials and response body.
 return Object.freeze({ready:true,project:PROD_REF,method:'supabase-managed-inventory',
  backupUtc:new Date(b.when).toISOString(),backupAgeHours:Math.ceil((nowMs-b.when)/3600000),
  physical:b.physical,restoreTestVerified:false});
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
 .then(x=>process.stdout.write('M44_PROD_BACKUP_INVENTORY_READY:'+x.backupUtc+
  ':restore_test_NOT_verified\n'))
 .catch(e=>{process.stderr.write(String(e?.message||prefix+'CHECK_FAILED')+'\n');process.exitCode=1;});
}
