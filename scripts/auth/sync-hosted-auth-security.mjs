import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const API_ORIGIN='https://api.supabase.com';
const REQUEST_TIMEOUT_MS=12_000;
const STATE_SCHEMA='iberfit.hosted-auth-security-state.v1';
const TARGETS=Object.freeze({
  qa:Object.freeze({
    projectRef:'gjztkdwfmunnzhtvxrsu',
    confirmation:'ENABLE_IBERFIT_HIBP_QA',
    rollbackConfirmation:'ROLLBACK_IBERFIT_HIBP_QA',
  }),
  prod:Object.freeze({
    projectRef:'pjhmrhejsoofmouedavw',
    confirmation:'ENABLE_IBERFIT_HIBP_PROD',
    rollbackConfirmation:null,
  }),
});
const ALLOWED_PATCH_KEYS=new Set(['password_hibp_enabled']);

const nonEmpty=(value)=>typeof value==='string'&&value.trim().length>0;
const fail=(code)=>{throw new Error(code);};

function targetConfig(target){
  const normalized=String(target||'').trim().toLowerCase();
  const config=TARGETS[normalized];
  if(!config)fail('IBERFIT_AUTH_SECURITY_TARGET_INVALID');
  return Object.freeze({target:normalized,...config});
}
function ensureBoolean(value,code){
  if(typeof value!=='boolean')fail(code);
  return value;
}
function sanitizePatch(body){
  if(!body||typeof body!=='object'||Array.isArray(body))fail('IBERFIT_AUTH_SECURITY_PATCH_INVALID');
  const entries=Object.entries(body);
  if(entries.length!==1||!ALLOWED_PATCH_KEYS.has(entries[0][0]))fail('IBERFIT_AUTH_SECURITY_PATCH_SCOPE_INVALID');
  return Object.freeze({password_hibp_enabled:ensureBoolean(entries[0][1],'IBERFIT_AUTH_SECURITY_HIBP_BOOLEAN_REQUIRED')});
}
async function managementRequest({token,projectRef,method='GET',body}){
  if(!nonEmpty(token))fail('IBERFIT_AUTH_SECURITY_MANAGEMENT_TOKEN_REQUIRED');
  if(!/^[a-z0-9]{20}$/u.test(String(projectRef||'')))fail('IBERFIT_AUTH_SECURITY_PROJECT_REF_INVALID');
  if(!['GET','PATCH'].includes(method))fail('IBERFIT_AUTH_SECURITY_METHOD_INVALID');
  const patch=body===undefined?undefined:sanitizePatch(body);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(`${API_ORIGIN}/v1/projects/${encodeURIComponent(projectRef)}/config/auth`,{
      method,
      signal:controller.signal,
      redirect:'error',
      headers:{
        Authorization:`Bearer ${token}`,
        Accept:'application/json',
        ...(patch?{'Content-Type':'application/json'}:{}),
      },
      ...(patch?{body:JSON.stringify(patch)}:{}),
    });
    let data={};
    try{data=await response.json();}catch{}
    if(!response.ok)fail(`IBERFIT_AUTH_SECURITY_MANAGEMENT_API_${method}_${response.status}`);
    if(!data||typeof data!=='object'||Array.isArray(data))fail('IBERFIT_AUTH_SECURITY_REMOTE_CONFIG_INVALID');
    return data;
  }catch(error){
    if(error?.name==='AbortError')fail('IBERFIT_AUTH_SECURITY_MANAGEMENT_TIMEOUT');
    throw error;
  }finally{
    clearTimeout(timer);
  }
}
async function writeEvidence(file,value){
  const resolved=path.resolve(file);
  await fs.mkdir(path.dirname(resolved),{recursive:true});
  await fs.writeFile(resolved,JSON.stringify(value,null,2)+'\n','utf8');
  return resolved;
}
async function readState(file){
  const raw=JSON.parse(await fs.readFile(path.resolve(file),'utf8'));
  if(raw?.schema!==STATE_SCHEMA)fail('IBERFIT_AUTH_SECURITY_STATE_SCHEMA_INVALID');
  if(!['qa','prod'].includes(raw?.target))fail('IBERFIT_AUTH_SECURITY_STATE_TARGET_INVALID');
  if(!/^[a-z0-9]{20}$/u.test(String(raw?.projectRef||'')))fail('IBERFIT_AUTH_SECURITY_STATE_PROJECT_INVALID');
  ensureBoolean(raw?.password_hibp_enabled,'IBERFIT_AUTH_SECURITY_STATE_HIBP_INVALID');
  return raw;
}

export async function readHostedAuthSecurity({token,target}={}){
  const config=targetConfig(target);
  const remote=await managementRequest({token,projectRef:config.projectRef});
  return Object.freeze({
    target:config.target,
    projectRef:config.projectRef,
    passwordHibpEnabled:remote.password_hibp_enabled===true,
  });
}

export async function verifyHostedAuthSecurity({token,target,requireHibp=true}={}){
  const current=await readHostedAuthSecurity({token,target});
  if(requireHibp&&current.passwordHibpEnabled!==true)fail('IBERFIT_AUTH_SECURITY_HIBP_REQUIRED');
  return Object.freeze({ok:true,mode:'verify',...current});
}

export async function enableHostedAuthSecurity({
  token,
  target,
  confirmation,
  statePath,
  evidencePath,
}={}){
  const config=targetConfig(target);
  if(confirmation!==config.confirmation)fail('IBERFIT_AUTH_SECURITY_EXPLICIT_CONFIRMATION_REQUIRED');
  const before=await readHostedAuthSecurity({token,target:config.target});
  if(statePath){
    await writeEvidence(statePath,Object.freeze({
      schema:STATE_SCHEMA,
      target:config.target,
      projectRef:config.projectRef,
      password_hibp_enabled:before.passwordHibpEnabled,
    }));
  }
  let changed=false;
  if(!before.passwordHibpEnabled){
    await managementRequest({
      token,
      projectRef:config.projectRef,
      method:'PATCH',
      body:{password_hibp_enabled:true},
    });
    changed=true;
  }
  const after=await readHostedAuthSecurity({token,target:config.target});
  if(after.passwordHibpEnabled!==true)fail('IBERFIT_AUTH_SECURITY_REMOTE_VERIFY_FAILED');
  const result=Object.freeze({
    ok:true,
    mode:'enable',
    target:config.target,
    projectRef:config.projectRef,
    changed,
    before:before.passwordHibpEnabled,
    after:after.passwordHibpEnabled,
  });
  if(evidencePath)await writeEvidence(evidencePath,result);
  return result;
}

export async function restoreQaHostedAuthSecurity({
  token,
  target='qa',
  confirmation,
  statePath,
  evidencePath,
}={}){
  const config=targetConfig(target);
  if(config.target!=='qa'||confirmation!==config.rollbackConfirmation)fail('IBERFIT_AUTH_SECURITY_QA_ROLLBACK_CONFIRMATION_REQUIRED');
  if(!statePath)fail('IBERFIT_AUTH_SECURITY_QA_ROLLBACK_STATE_REQUIRED');
  const previous=await readState(statePath);
  if(previous.target!=='qa'||previous.projectRef!==config.projectRef)fail('IBERFIT_AUTH_SECURITY_QA_ROLLBACK_STATE_MISMATCH');
  await managementRequest({
    token,
    projectRef:config.projectRef,
    method:'PATCH',
    body:{password_hibp_enabled:previous.password_hibp_enabled},
  });
  const after=await readHostedAuthSecurity({token,target:'qa'});
  if(after.passwordHibpEnabled!==previous.password_hibp_enabled)fail('IBERFIT_AUTH_SECURITY_QA_ROLLBACK_VERIFY_FAILED');
  const result=Object.freeze({
    ok:true,
    mode:'restore-qa',
    target:'qa',
    projectRef:config.projectRef,
    restored:previous.password_hibp_enabled,
  });
  if(evidencePath)await writeEvidence(evidencePath,result);
  return result;
}

function argumentValue(flag){
  const index=process.argv.indexOf(flag);
  if(index<0||index===process.argv.length-1)return '';
  return String(process.argv[index+1]||'');
}
async function main(){
  const mode=process.argv.includes('--enable')
    ?'enable'
    :process.argv.includes('--restore-qa')
      ?'restore-qa'
      :'verify';
  const target=argumentValue('--target')||process.env.IBERFIT_AUTH_SECURITY_TARGET||'';
  const token=process.env.SUPABASE_ACCESS_TOKEN;
  const statePath=process.env.IBERFIT_AUTH_SECURITY_STATE_PATH||'recovery/hosted-auth-security/qa-before.json';
  const evidencePath=process.env.IBERFIT_AUTH_SECURITY_EVIDENCE_PATH||`recovery/hosted-auth-security/${target||'unknown'}-${mode}.json`;
  let result;
  if(mode==='enable'){
    result=await enableHostedAuthSecurity({
      token,
      target,
      confirmation:process.env.IBERFIT_AUTH_SECURITY_CONFIRMATION,
      statePath,
      evidencePath,
    });
  }else if(mode==='restore-qa'){
    result=await restoreQaHostedAuthSecurity({
      token,
      target,
      confirmation:process.env.IBERFIT_AUTH_SECURITY_ROLLBACK_CONFIRMATION,
      statePath,
      evidencePath,
    });
  }else{
    result=await verifyHostedAuthSecurity({token,target,requireHibp:true});
    await writeEvidence(evidencePath,result);
  }
  console.log(JSON.stringify(result,null,2));
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invoked)main().catch((error)=>{
  console.error(String(error?.message||error));
  process.exitCode=1;
});

export const __hostedAuthSecurityInternals=Object.freeze({
  API_ORIGIN,
  REQUEST_TIMEOUT_MS,
  STATE_SCHEMA,
  TARGETS,
  ALLOWED_PATCH_KEYS:Object.freeze([...ALLOWED_PATCH_KEYS]),
  sanitizePatch,
});
