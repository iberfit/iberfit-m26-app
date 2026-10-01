import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DEFAULT_MANIFEST=path.join(ROOT,'supabase/templates/iberfit-hosted-auth-email-manifest.json');
const DEFAULT_ROLLBACK_STATE=path.join(ROOT,'recovery/hosted-auth-emails/prod-before.json');
const API_ORIGIN='https://api.supabase.com';
const PROD_REF='pjhmrhejsoofmouedavw';
const EXACT_CONFIRMATION='SYNC_IBERFIT_AUTH_EMAILS_PROD';
const EXACT_ROLLBACK_CONFIRMATION='RESTORE_IBERFIT_AUTH_EMAILS_PROD';
const ROLLBACK_SCHEMA='iberfit.auth-email-hosted.rollback.v1';
const PROD_SITE_URL='https://app.iberfit.cl/';
const LEGACY_ISOTYPE_URL='https://app.iberfit.cl/isotipo-iberfit.png';
const PUBLIC_ISOTYPE_URL='https://app.iberfit.cl/public/isotipo-iberfit.png';
const PUBLIC_EMAIL_ISOTYPE_URL='https://app.iberfit.cl/public/iberfit-email-isotipo.png';
const LEGACY_HERO_URL='https://app.iberfit.cl/iberfit-email-access-hero.jpg';
const PUBLIC_HERO_URL='https://app.iberfit.cl/public/iberfit-email-access-hero.jpg';

const sha256=(value)=>crypto.createHash('sha256').update(value).digest('hex');
const nonEmpty=(value)=>typeof value==='string'&&value.trim().length>0;
const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const fail=(code)=>{throw new Error(code);};

function replaceQuotedAssetRef(html,from,to){
  return String(html)
    .replaceAll(`"${from}"`,`"${to}"`)
    .replaceAll(`'${from}'`,`'${to}'`);
}

export function normalizeHostedAuthAssets(html=''){
  let normalized=String(html)
    .replaceAll(LEGACY_ISOTYPE_URL,PUBLIC_EMAIL_ISOTYPE_URL)
    .replaceAll(PUBLIC_ISOTYPE_URL,PUBLIC_EMAIL_ISOTYPE_URL)
    .replaceAll(LEGACY_HERO_URL,PUBLIC_HERO_URL);
  normalized=replaceQuotedAssetRef(normalized,'/public/isotipo-iberfit.png',PUBLIC_EMAIL_ISOTYPE_URL);
  normalized=replaceQuotedAssetRef(normalized,'/public/iberfit-email-isotipo.png',PUBLIC_EMAIL_ISOTYPE_URL);
  normalized=replaceQuotedAssetRef(normalized,'/public/iberfit-email-access-hero.jpg',PUBLIC_HERO_URL);
  return normalized;
}

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
    const sourceHtml=await fs.readFile(absolute,'utf8');
    const html=normalizeHostedAuthAssets(sourceHtml);
    if(!html.includes('IBERFIT'))fail(`IBERFIT_AUTH_EMAIL_BRANDING_INVALID:${item.id}`);
    if(/<img\b/iu.test(html)&&!html.includes(PUBLIC_EMAIL_ISOTYPE_URL)&&!html.includes(PUBLIC_HERO_URL))fail(`IBERFIT_AUTH_EMAIL_ASSET_URL_INVALID:${item.id}`);
    if(
      html.includes(LEGACY_ISOTYPE_URL)
      || html.includes(PUBLIC_ISOTYPE_URL)
      || html.includes(LEGACY_HERO_URL)
      || /\b(?:src|href)=["']\/public\//iu.test(html)
    )fail(`IBERFIT_AUTH_EMAIL_LEGACY_ASSET_URL:${item.id}`);
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

export function assertProductionAuthBaseline(config={}){
  if(String(config.site_url||'').trim()!==PROD_SITE_URL)fail('IBERFIT_AUTH_EMAIL_SITE_URL_REQUIRED');
  if(config.disable_signup!==true)fail('IBERFIT_AUTH_EMAIL_PUBLIC_SIGNUP_MUST_BE_DISABLED');
  if(!Number.isFinite(Number(config.password_min_length))||Number(config.password_min_length)<8)fail('IBERFIT_AUTH_EMAIL_PASSWORD_BASELINE_REQUIRED');
  if(config.external_anonymous_users_enabled===true)fail('IBERFIT_AUTH_EMAIL_ANONYMOUS_USERS_FORBIDDEN');
  if(config.mailer_autoconfirm===true)fail('IBERFIT_AUTH_EMAIL_CONFIRMATION_REQUIRED');
  if(config.mailer_allow_unverified_email_sign_ins===true)fail('IBERFIT_AUTH_EMAIL_UNVERIFIED_SIGNIN_FORBIDDEN');
  if(config.mailer_secure_email_change_enabled!==true)fail('IBERFIT_AUTH_EMAIL_SECURE_CHANGE_REQUIRED');
  return true;
}

export function assertCustomSmtp(config={}){
  const port=Number(config.smtp_port);
  if(
    !nonEmpty(config.smtp_host)
    || !nonEmpty(config.smtp_admin_email)
    || !nonEmpty(config.smtp_user)
    || !nonEmpty(config.smtp_sender_name)
    || !Number.isFinite(port)
    || port<=0
    || port>65535
  ){
    fail('IBERFIT_AUTH_EMAIL_CUSTOM_SMTP_REQUIRED');
  }
  return true;
}

export function buildHostedAuthRollbackSnapshot({config={},built,projectRef=PROD_REF,capturedAt=new Date().toISOString()}={}){
  if(projectRef!==PROD_REF)fail('IBERFIT_AUTH_EMAIL_PROD_REF_REQUIRED');
  if(!built?.patch||typeof built.patch!=='object')fail('IBERFIT_AUTH_EMAIL_ROLLBACK_BUILD_REQUIRED');
  const targetKeys=Object.keys(built.patch).sort();
  if(targetKeys.length===0)fail('IBERFIT_AUTH_EMAIL_ROLLBACK_KEYS_REQUIRED');
  const values={};
  for(const key of targetKeys){
    if(!/^mailer_(?:subjects|templates|notifications)_/.test(key)||key.startsWith('smtp_'))fail(`IBERFIT_AUTH_EMAIL_ROLLBACK_KEY_FORBIDDEN:${key}`);
    if(!hasOwn(config,key)||config[key]===undefined)fail(`IBERFIT_AUTH_EMAIL_ROLLBACK_KEY_MISSING:${key}`);
    values[key]=config[key];
  }
  return Object.freeze({
    schema:ROLLBACK_SCHEMA,
    projectRef,
    capturedAt,
    values:Object.freeze(values),
  });
}

export function validateHostedAuthRollbackSnapshot(snapshot,built,{projectRef=PROD_REF}={}){
  if(snapshot?.schema!==ROLLBACK_SCHEMA)fail('IBERFIT_AUTH_EMAIL_ROLLBACK_SCHEMA_INVALID');
  if(snapshot?.projectRef!==projectRef||projectRef!==PROD_REF)fail('IBERFIT_AUTH_EMAIL_ROLLBACK_PROJECT_REF_INVALID');
  if(!snapshot.values||typeof snapshot.values!=='object'||Array.isArray(snapshot.values))fail('IBERFIT_AUTH_EMAIL_ROLLBACK_VALUES_INVALID');
  const expected=Object.keys(built?.patch||{}).sort();
  const actual=Object.keys(snapshot.values).sort();
  if(expected.length===0||actual.length!==expected.length||actual.some((key,index)=>key!==expected[index]))fail('IBERFIT_AUTH_EMAIL_ROLLBACK_KEYSET_INVALID');
  for(const key of actual){
    if(!/^mailer_(?:subjects|templates|notifications)_/.test(key)||key.startsWith('smtp_'))fail(`IBERFIT_AUTH_EMAIL_ROLLBACK_KEY_FORBIDDEN:${key}`);
    if(snapshot.values[key]===undefined)fail(`IBERFIT_AUTH_EMAIL_ROLLBACK_VALUE_MISSING:${key}`);
  }
  return true;
}

async function writeJson(pathname,value){
  await fs.mkdir(path.dirname(pathname),{recursive:true});
  await fs.writeFile(pathname,JSON.stringify(value,null,2)+'\n','utf8');
}

export async function captureHostedAuthEmailSnapshot({token,projectRef=PROD_REF,statePath=DEFAULT_ROLLBACK_STATE,root=ROOT,manifestPath=DEFAULT_MANIFEST}={}){
  if(projectRef!==PROD_REF)fail('IBERFIT_AUTH_EMAIL_PROD_REF_REQUIRED');
  if(!nonEmpty(token))fail('IBERFIT_AUTH_EMAIL_MANAGEMENT_TOKEN_REQUIRED');
  if(!nonEmpty(statePath))fail('IBERFIT_AUTH_EMAIL_ROLLBACK_STATE_PATH_REQUIRED');
  const built=await buildHostedAuthPatch({root,manifestPath});
  const before=await managementRequest({token,projectRef});
  assertProductionAuthBaseline(before);
  assertCustomSmtp(before);
  const snapshot=buildHostedAuthRollbackSnapshot({config:before,built,projectRef});
  await writeJson(path.resolve(statePath),snapshot);
  return Object.freeze({ok:true,projectRef,keyCount:Object.keys(snapshot.values).length,statePath:path.resolve(statePath)});
}

export async function syncHostedAuthEmails({token,projectRef=PROD_REF,confirmation,root=ROOT,manifestPath=DEFAULT_MANIFEST}={}){
  if(projectRef!==PROD_REF)fail('IBERFIT_AUTH_EMAIL_PROD_REF_REQUIRED');
  if(confirmation!==EXACT_CONFIRMATION)fail('IBERFIT_AUTH_EMAIL_EXPLICIT_CONFIRMATION_REQUIRED');
  if(!nonEmpty(token))fail('IBERFIT_AUTH_EMAIL_MANAGEMENT_TOKEN_REQUIRED');
  const built=await buildHostedAuthPatch({root,manifestPath});
  const before=await managementRequest({token,projectRef});
  assertProductionAuthBaseline(before);
  assertCustomSmtp(before);
  await managementRequest({token,projectRef,method:'PATCH',body:built.patch});
  const after=await managementRequest({token,projectRef});
  for(const [key,value] of Object.entries(built.patch))if(after[key]!==value)fail(`IBERFIT_AUTH_EMAIL_REMOTE_VERIFY_FAILED:${key}`);
  return Object.freeze({ok:true,projectRef,templateCount:built.manifest.templates.length,hashes:built.hashes});
}

export async function restoreHostedAuthEmails({token,projectRef=PROD_REF,confirmation,statePath=DEFAULT_ROLLBACK_STATE,root=ROOT,manifestPath=DEFAULT_MANIFEST,evidencePath}={}){
  if(projectRef!==PROD_REF)fail('IBERFIT_AUTH_EMAIL_PROD_REF_REQUIRED');
  if(confirmation!==EXACT_ROLLBACK_CONFIRMATION)fail('IBERFIT_AUTH_EMAIL_ROLLBACK_CONFIRMATION_REQUIRED');
  if(!nonEmpty(token))fail('IBERFIT_AUTH_EMAIL_MANAGEMENT_TOKEN_REQUIRED');
  if(!nonEmpty(statePath))fail('IBERFIT_AUTH_EMAIL_ROLLBACK_STATE_PATH_REQUIRED');
  const built=await buildHostedAuthPatch({root,manifestPath});
  const snapshot=JSON.parse(await fs.readFile(path.resolve(statePath),'utf8'));
  validateHostedAuthRollbackSnapshot(snapshot,built,{projectRef});
  const current=await managementRequest({token,projectRef});
  assertProductionAuthBaseline(current);
  assertCustomSmtp(current);
  await managementRequest({token,projectRef,method:'PATCH',body:snapshot.values});
  const after=await managementRequest({token,projectRef});
  for(const [key,value] of Object.entries(snapshot.values))if(after[key]!==value)fail(`IBERFIT_AUTH_EMAIL_ROLLBACK_VERIFY_FAILED:${key}`);
  const evidence={ok:true,projectRef,restoredKeyCount:Object.keys(snapshot.values).length,snapshotCapturedAt:snapshot.capturedAt||null};
  if(nonEmpty(evidencePath))await writeJson(path.resolve(evidencePath),evidence);
  return Object.freeze(evidence);
}

async function main(){
  const requested=[
    process.argv.includes('--sync')&&'sync',
    process.argv.includes('--capture')&&'capture',
    process.argv.includes('--restore')&&'restore',
  ].filter(Boolean);
  if(requested.length>1)fail('IBERFIT_AUTH_EMAIL_MODE_CONFLICT');
  const mode=requested[0]||'check';
  const projectRef=process.env.SUPABASE_PROJECT_REF||PROD_REF;
  const statePath=process.env.IBERFIT_AUTH_EMAIL_STATE_PATH||DEFAULT_ROLLBACK_STATE;
  if(mode==='capture'){
    const result=await captureHostedAuthEmailSnapshot({token:process.env.SUPABASE_ACCESS_TOKEN,projectRef,statePath});
    console.log(JSON.stringify({...result,mode},null,2));
    return;
  }
  if(mode==='restore'){
    const result=await restoreHostedAuthEmails({
      token:process.env.SUPABASE_ACCESS_TOKEN,
      projectRef,
      confirmation:process.env.IBERFIT_AUTH_EMAIL_ROLLBACK_CONFIRMATION,
      statePath,
      evidencePath:process.env.IBERFIT_AUTH_EMAIL_ROLLBACK_EVIDENCE_PATH,
    });
    console.log(JSON.stringify({...result,mode},null,2));
    return;
  }
  const built=await buildHostedAuthPatch();
  if(mode==='check'){
    console.log(JSON.stringify({ok:true,mode,projectRef:built.manifest.projectRef,templateCount:built.manifest.templates.length,hashes:built.hashes},null,2));
    return;
  }
  const result=await syncHostedAuthEmails({
    token:process.env.SUPABASE_ACCESS_TOKEN,
    projectRef,
    confirmation:process.env.IBERFIT_AUTH_EMAIL_CONFIRMATION,
  });
  console.log(JSON.stringify({...result,mode},null,2));
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invoked)main().catch((error)=>{console.error(String(error?.message||error));process.exitCode=1;});

export const __hostedAuthEmailInternals=Object.freeze({
  PROD_REF,
  PROD_SITE_URL,
  EXACT_CONFIRMATION,
  EXACT_ROLLBACK_CONFIRMATION,
  ROLLBACK_SCHEMA,
  DEFAULT_MANIFEST,
  DEFAULT_ROLLBACK_STATE,
  LEGACY_ISOTYPE_URL,
  PUBLIC_ISOTYPE_URL,
  PUBLIC_EMAIL_ISOTYPE_URL,
  LEGACY_HERO_URL,
  PUBLIC_HERO_URL,
  sha256,
});
