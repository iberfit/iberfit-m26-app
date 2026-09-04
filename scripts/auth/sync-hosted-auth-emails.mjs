import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DEFAULT_MANIFEST=path.join(ROOT,'supabase/templates/iberfit-hosted-auth-email-manifest.json');
const API_ORIGIN='https://api.supabase.com';
const PROD_REF='pjhmrhejsoofmouedavw';
const EXACT_CONFIRMATION='SYNC_IBERFIT_AUTH_EMAILS_PROD';

const sha256=(value)=>crypto.createHash('sha256').update(value).digest('hex');
const nonEmpty=(value)=>typeof value==='string'&&value.trim().length>0;
const fail=(code)=>{throw new Error(code);};

export async function buildHostedAuthPatch({root=ROOT,manifestPath=DEFAULT_MANIFEST}={}){
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  if(manifest?.schema!=='iberfit.auth-email-hosted.v1')fail('IBERFIT_AUTH_EMAIL_MANIFEST_SCHEMA_INVALID');
  if(manifest?.projectRef!==PROD_REF)fail('IBERFIT_AUTH_EMAIL_PROJECT_REF_INVALID');
  if(!Array.isArray(manifest.templates)||manifest.templates.length!==13)fail('IBERFIT_AUTH_EMAIL_TEMPLATE_COUNT_INVALID');
  const ids=new Set(),keys=new Set(),patch={},hashes={};
  for(const item of manifest.templates){
    if(!item?.id||ids.has(item.id))fail('IBERFIT_AUTH_EMAIL_TEMPLATE_ID_INVALID');
    ids.add(item.id);
    if(!nonEmpty(item.file)||!nonEmpty(item.subject)||!nonEmpty(item.subjectKey)||!nonEmpty(item.contentKey))fail('IBERFIT_AUTH_EMAIL_TEMPLATE_MANIFEST_INVALID');
    for(const key of [item.subjectKey,item.contentKey,item.enabledKey].filter(Boolean)){
      if(!/^mailer_(?:subjects|templates|notifications)_/.test(key)||keys.has(key))fail('IBERFIT_AUTH_EMAIL_CONFIG_KEY_INVALID');
      keys.add(key);
    }
    const absolute=path.resolve(root,item.file);
    if(!absolute.startsWith(root+path.sep))fail('IBERFIT_AUTH_EMAIL_TEMPLATE_PATH_INVALID');
    const html=await fs.readFile(absolute,'utf8');
    if(!html.includes('https://app.iberfit.cl/isotipo-iberfit.png')||!html.includes('IBERFIT'))fail(`IBERFIT_AUTH_EMAIL_BRANDING_INVALID:${item.id}`);
    if(/supabase\.co|TokenHash|service[_ -]?role|sb_secret_|service_role/iu.test(html))fail(`IBERFIT_AUTH_EMAIL_SECRET_LEAK_CONTRACT:${item.id}`);
    for(const required of item.requires||[])if(!html.includes(required))fail(`IBERFIT_AUTH_EMAIL_REQUIRED_VARIABLE_MISSING:${item.id}`);
    patch[item.subjectKey]=item.subject;
    patch[item.contentKey]=html;
    if(item.enabledKey)patch[item.enabledKey]=true;
    hashes[item.id]=sha256(html);
  }
  if(!ids.has('reauthentication'))fail('IBERFIT_AUTH_EMAIL_REAUTHENTICATION_MISSING');
  if(Object.keys(patch).some((key)=>key.startsWith('smtp_')))fail('IBERFIT_AUTH_EMAIL_SMTP_MUTATION_FORBIDDEN');
  return Object.freeze({manifest,patch:Object.freeze(patch),hashes:Object.freeze(hashes)});
}

async function managementRequest({token,projectRef,method='GET',body}){
  const response=await fetch(`${API_ORIGIN}/v1/projects/${encodeURIComponent(projectRef)}/config/auth`,{
    method,
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  let data=null;
  try{data=await response.json();}catch{}
  if(!response.ok)fail(`IBERFIT_AUTH_EMAIL_MANAGEMENT_API_${method}_${response.status}`);
  return data||{};
}

export function assertCustomSmtp(config={}){
  if(!nonEmpty(config.smtp_host)||!nonEmpty(config.smtp_admin_email)||!Number.isFinite(Number(config.smtp_port))||Number(config.smtp_port)<=0){
    fail('IBERFIT_AUTH_EMAIL_CUSTOM_SMTP_REQUIRED');
  }
  return true;
}

export async function syncHostedAuthEmails({token,projectRef=PROD_REF,confirmation,root=ROOT,manifestPath=DEFAULT_MANIFEST}={}){
  if(projectRef!==PROD_REF)fail('IBERFIT_AUTH_EMAIL_PROD_REF_REQUIRED');
  if(confirmation!==EXACT_CONFIRMATION)fail('IBERFIT_AUTH_EMAIL_EXPLICIT_CONFIRMATION_REQUIRED');
  if(!nonEmpty(token))fail('IBERFIT_AUTH_EMAIL_MANAGEMENT_TOKEN_REQUIRED');
  const built=await buildHostedAuthPatch({root,manifestPath});
  const before=await managementRequest({token,projectRef});
  assertCustomSmtp(before);
  await managementRequest({token,projectRef,method:'PATCH',body:built.patch});
  const after=await managementRequest({token,projectRef});
  for(const [key,value] of Object.entries(built.patch))if(after[key]!==value)fail(`IBERFIT_AUTH_EMAIL_REMOTE_VERIFY_FAILED:${key}`);
  return Object.freeze({ok:true,projectRef,templateCount:built.manifest.templates.length,hashes:built.hashes});
}

async function main(){
  const mode=process.argv.includes('--sync')?'sync':'check';
  const built=await buildHostedAuthPatch();
  if(mode==='check'){
    console.log(JSON.stringify({ok:true,mode,projectRef:built.manifest.projectRef,templateCount:built.manifest.templates.length,hashes:built.hashes},null,2));
    return;
  }
  const result=await syncHostedAuthEmails({
    token:process.env.SUPABASE_ACCESS_TOKEN,
    projectRef:process.env.SUPABASE_PROJECT_REF||PROD_REF,
    confirmation:process.env.IBERFIT_AUTH_EMAIL_CONFIRMATION,
  });
  console.log(JSON.stringify({...result,mode},null,2));
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invoked)main().catch((error)=>{console.error(String(error?.message||error));process.exitCode=1;});

export const __hostedAuthEmailInternals=Object.freeze({PROD_REF,EXACT_CONFIRMATION,DEFAULT_MANIFEST,sha256});
