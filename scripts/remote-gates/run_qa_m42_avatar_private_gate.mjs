/**
 * M42 real QA-only Storage security: synthetic Client A/B and assigned Coach.
 * Publishable key + user JWT only. No PROD endpoints and no service role.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {profileAvatarPath,AVATAR_BUCKET} from '../../src/m26/profile/client-avatar.js';
import {isFutureIssuedJwtClockSkew} from '../../src/m26/supabase-transport.js';

const REF='gjztkdwfmunnzhtvxrsu',BASE='https://'+REF+'.supabase.co';
const NAMES=['M26_PROJECT_REF','M26_QA_ONLY','M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY',
 'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD','M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
 'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD'];
const evidence={schema:'iberfit.m42.avatar-private-real-qa.v1',environment:'QA',synthetic:true,
 productionTouched:false,serviceRoleUsed:false,checks:[],phase:'init',passed:false,cleanupConfirmed:false};
function check(ok,label){if(!ok)throw Error('M42_AVATAR_QA_'+label);evidence.checks.push(label);}
function ensureQa(){
 for(const n of NAMES)if(!process.env[n])throw Error('M42_AVATAR_QA_ENV_MISSING_'+n);
 if(process.env.M26_PROJECT_REF!==REF||process.env.M26_QA_ONLY!=='true'||
  new URL(process.env.M26_SUPABASE_URL).origin!==BASE)throw Error('M42_AVATAR_QA_PRODUCTION_FORBIDDEN');
 if(/service[_-]?role|supabase_secret/iu.test(process.env.M26_SUPABASE_PUBLISHABLE_KEY))
  throw Error('M42_AVATAR_QA_SECRET_KEY_FORBIDDEN');
}
async function send(path,{method='GET',token,json,bytes,upsert=false,readBytes=false}={}){
 const u=new URL(path,BASE);
 if(u.origin!==BASE||u.username||u.password||
  !['/storage/v1/','/auth/v1/','/rest/v1/'].some(prefix=>u.pathname.startsWith(prefix)))
  throw Error('M42_AVATAR_QA_EGRESS_DENIED');
 const r=await fetch(u,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),
  headers:{apikey:process.env.M26_SUPABASE_PUBLISHABLE_KEY,
   ...(token?{authorization:'Bearer '+token}:{}),
   ...(json?{'content-type':'application/json'}:{}),
   ...(bytes?{'content-type':'image/webp'}:{}),
   ...(upsert?{'x-upsert':'true'}:{})},
  body:json?JSON.stringify(json):bytes});
 const isJson=r.headers.get('content-type')?.includes('application/json');
 const body=isJson?await r.json().catch(()=>null):null;
 const blob=!isJson?Buffer.from(await r.arrayBuffer()):null;
 return {ok:r.ok,status:r.status,body,bytes:readBytes?blob:null};
}
async function login(email,password){
 const r=await send('/auth/v1/token?grant_type=password',{method:'POST',json:{email,password}});
 check(r.ok&&typeof r.body?.access_token==='string','AUTHENTICATION');
 return r.body.access_token;
}
async function rpc(name,token,json={}){
 const path='/rest/v1/rpc/'+name;
 let r=await send(path,{method:'POST',token,json});
 // M42 only retries canonical read bootstrap on an exact future-issued JWT
 // PostgREST signature. No fallback for generic 401/403, expired JWT,
 // authentication failures or any mutating RPC.
 if(name==='iberfit_bootstrap_v26'){
  let retries=0;
  while(isFutureIssuedJwtClockSkew({status:r.status,body:r.body})&&retries<3){
   await new Promise(resolve=>setTimeout(resolve,[350,800,1300][retries++]));
   r=await send(path,{method:'POST',token,json});
  }
 }
 // Record ONLY HTTP status and a well-formed PostgREST code, never token,
 // body, claims, identity or error text in published QA evidence.
 const code=String(r.body?.code||'').trim();
 const safeCode=/^[A-Z0-9]{3,12}$/u.test(code)?'_'+code:'';
 check(r.ok,'RPC_'+name.toUpperCase()+(r.ok?'':'_HTTP_'+r.status+safeCode));
 return r.body;
}
const denied=(r,label)=>check(!r.ok&&[400,401,403,404].includes(r.status),label);
const own=id=>profileAvatarPath(id);
const upload=id=>'/storage/v1/object/'+AVATAR_BUCKET+'/'+own(id);
const privateUrl=id=>'/storage/v1/object/authenticated/'+AVATAR_BUCKET+'/'+own(id);
const privateInfo=id=>'/storage/v1/object/info/authenticated/'+AVATAR_BUCKET+'/'+own(id);
const uncachedPrivate=id=>privateUrl(id)+'?cacheNonce='+randomUUID();
const publicUrl=id=>'/storage/v1/object/public/'+AVATAR_BUCKET+'/'+own(id);
const remove=()=>'/storage/v1/object/'+AVATAR_BUCKET;
const picture=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64');
// Confirm deletion via the object metadata endpoint (not CDN-served media),
// then require an independently uncached authenticated download to disappear.
// Do not treat HTTP 200 from DELETE alone as evidence of removal.
async function confirmRemoved(token,id,label){
  let infoGone=false,mediaGone=false;
  for(let attempt=0;attempt<13;attempt++){
    const [info,media]=await Promise.all([
      send(privateInfo(id),{token}),
      send(uncachedPrivate(id),{token}),
    ]);
    infoGone=!info.ok&&[400,404].includes(info.status);
    mediaGone=!media.ok&&[400,404].includes(media.status);
    if(infoGone&&mediaGone)break;
    if(attempt<12)await new Promise(resolve=>setTimeout(resolve,2000));
  }
  check(infoGone&&mediaGone,label);
}
async function main(){
 ensureQa();
 check(picture.subarray(0,4).toString()==='RIFF'&&picture.subarray(8,12).toString()==='WEBP','WEBP_SYNTHETIC');
 const [coach,a,b]=await Promise.all([
  login(process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD),
  login(process.env.M26_QA_CLIENT_A_EMAIL,process.env.M26_QA_CLIENT_A_PASSWORD),
  login(process.env.M26_QA_CLIENT_B_EMAIL,process.env.M26_QA_CLIENT_B_PASSWORD)]);
 const [env,ca,cb,role]=await Promise.all([
  rpc('iberfit_environment',a),rpc('iberfit_bootstrap_v26',a),
  rpc('iberfit_bootstrap_v26',b),rpc('iberfit_current_role_v26',coach)]);
 check(env?.environment==='QA'&&env.productionBlocked===true&&env.realDataAllowed===false,'QA_NOT_PRODUCTION');
 check(role==='coach'&&['client','cliente'].includes(String(ca?.user?.role||'').toLowerCase()),'ACTOR_ROLE');
 const idA=String(ca?.user?.clientId||''),idB=String(cb?.user?.clientId||'');
 check(/^[a-f0-9-]{36}$/iu.test(idA)&&/^[a-f0-9-]{36}$/iu.test(idB)&&idA!==idB,'TWO_CLIENTS');
 check(await rpc('iberfit_can_manage_iri_private_v1',coach,{p_client_id:idA})===true,'COACH_ASSIGNED');
 const before=await send(privateUrl(idA),{token:a,readBytes:true});
 if(before.ok){
  // Recover ONLY the byte-for-byte synthetic 1×1 QA fixture left by the
  // previous failed migration gate. Never erase another avatar opportunistically.
  check(Boolean(before.bytes)&&before.bytes.equals(picture),'PREEXISTING_PHOTO_NOT_SYNTHETIC');
  const cleanup=await send(remove(),{method:'DELETE',token:a,json:{prefixes:[own(idA)]}});
  check(cleanup.ok,'RECOVER_OLD_SYNTHETIC_AVATAR');
  await confirmRemoved(a,idA,'RECOVERY_CLEANUP_CONFIRMED');
 }else check([400,404].includes(before.status),'NO_EXISTING_PHOTO');
 evidence.phase='authenticated';
 let touched=false;
 try{
  await denied(await send(publicUrl(idA),{token:a}),'PRIVATE_NO_PUBLIC_DOWNLOAD');
  await denied(await send(privateUrl(idA),{token:b}),'OTHER_CLIENT_CANNOT_DOWNLOAD');
  touched=true;
  await denied(await send(upload(idA),{method:'POST',token:b,bytes:picture,upsert:true}),
    'OTHER_CLIENT_CANNOT_UPLOAD');
  await denied(await send(upload(idA),{method:'POST',token:coach,bytes:picture,upsert:true}),
    'COACH_CANNOT_UPLOAD');
  check((await send(upload(idA),{method:'POST',token:a,bytes:picture,upsert:true})).ok,'OWNER_UPLOAD_PRIVATE_WEBP');
  check((await send(privateUrl(idA),{token:a})).ok,'OWNER_READ');
  check((await send(privateUrl(idA),{token:coach})).ok,'COACH_ASSIGNED_READ');
  await denied(await send(privateUrl(idA),{token:b}),'OTHER_CLIENT_CANNOT_READ');
  await denied(await send(privateUrl(idA)),'ANON_CANNOT_READ');
  await denied(await send(publicUrl(idA),{token:a}),'NO_PUBLIC_FALLBACK');
  check((await send(upload(idA),{method:'POST',token:a,bytes:picture,upsert:true})).ok,'OWNER_REPLACE');
  // Storage may return HTTP 200 with zero deleted rows when RLS hides the target.
  // The authoritative proof is that the owner's private object remains readable.
  await send(remove(),{method:'DELETE',token:coach,json:{prefixes:[own(idA)]}});
  check((await send(privateUrl(idA),{token:a})).ok,'COACH_CANNOT_REMOVE');
  evidence.phase='owner-and-cross-role';
 }finally{
  if(touched){
   const removed=await send(remove(),{method:'DELETE',token:a,json:{prefixes:[own(idA)]}});
   check(removed.ok,'OWNER_DELETE');
   await confirmRemoved(a,idA,'DELETE_REMOTE_CONFIRMED');
   evidence.cleanupConfirmed=true;
  }
 }
 check(evidence.cleanupConfirmed,'NO_QA_ARTIFACT_LEFT');
 evidence.phase='complete';evidence.passed=true;
}
try{await main();}catch(e){
 evidence.errorCode=String(e?.message||'UNKNOWN').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/giu,'[ID]').slice(0,130);
 process.exitCode=1;
}finally{
 await mkdir('recovery/m42-qa',{recursive:true});
 await writeFile('recovery/m42-qa/avatar-private-real-write.json',JSON.stringify(evidence,null,2)+'\n');
 console.log('M42_AVATAR_QA='+JSON.stringify({passed:evidence.passed,phase:evidence.phase,
  checks:evidence.checks.length,cleanupConfirmed:evidence.cleanupConfirmed,error:evidence.errorCode||null}));
}
