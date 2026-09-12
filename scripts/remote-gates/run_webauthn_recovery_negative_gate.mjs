import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const SUPABASE_ORIGIN=`https://${PROJECT_REF}.supabase.co`;
const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const required=[
  'M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_QA_CLIENT_A_EMAIL',
  'M26_QA_CLIENT_A_PASSWORD',
];
const missing=required.filter((name)=>!process.env[name]);
if(missing.length)throw new Error(`WEBAUTHN_RECOVERY_QA_ENV_MISSING:${missing.join(',')}`);

const key=String(process.env.M26_SUPABASE_PUBLISHABLE_KEY||'');
if(!key||/service[_-]?role/iu.test(key))throw new Error('WEBAUTHN_RECOVERY_SERVICE_ROLE_FORBIDDEN');

function fingerprint(value){
  return createHash('sha256').update(`${PROJECT_REF}:${String(value||'')}`).digest('hex').slice(0,16);
}
async function readJson(response){
  const text=await response.text();
  try{return text?JSON.parse(text):null;}catch{return null;}
}

const login=await fetch(`${SUPABASE_ORIGIN}/auth/v1/token?grant_type=password`,{
  method:'POST',
  redirect:'error',
  signal:AbortSignal.timeout(20_000),
  headers:{apikey:key,'content-type':'application/json'},
  body:JSON.stringify({
    email:process.env.M26_QA_CLIENT_A_EMAIL,
    password:process.env.M26_QA_CLIENT_A_PASSWORD,
  }),
});
const auth=await readJson(login);
if(!login.ok||!auth?.access_token||!auth?.user?.id)throw new Error(`WEBAUTHN_RECOVERY_LOGIN_FAILED:${login.status}`);

const probe=await fetch(`${SUPABASE_ORIGIN}/rest/v1/rpc/iberfit_recover_privileged_device_v1`,{
  method:'POST',
  redirect:'error',
  signal:AbortSignal.timeout(20_000),
  headers:{
    apikey:key,
    authorization:`Bearer ${auth.access_token}`,
    'content-type':'application/json',
    origin:CANARY_ORIGIN,
  },
  body:'{}',
});
const body=await readJson(probe);
const message=String(body?.message||body?.code||body?.hint||'');
if(probe.status!==403||!/M26_WEBAUTHN_RECOVERY_PROOF_REQUIRED/u.test(message)){
  throw new Error(`WEBAUTHN_RECOVERY_NORMAL_SESSION_NOT_REJECTED:${probe.status}:${message.slice(0,120)}`);
}

const evidence={
  schema:'iberfit.webauthn-recovery-negative-qa.v1',
  generatedAt:new Date().toISOString(),
  projectRef:PROJECT_REF,
  qaOnly:true,
  serviceRoleUsed:false,
  actorFingerprint:fingerprint(auth.user.id),
  normalAuthenticatedSessionRejected:true,
  status:probe.status,
  expectedCode:'M26_WEBAUTHN_RECOVERY_PROOF_REQUIRED',
  mutationsPerformed:false,
};
await mkdir('recovery',{recursive:true});
await writeFile('recovery/P0_WEBAUTHN_RECOVERY_NEGATIVE_QA.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
