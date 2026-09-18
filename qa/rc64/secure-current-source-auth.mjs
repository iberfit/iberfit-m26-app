import fs from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';

export const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
export const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu';
export const SUPABASE_ORIGIN=`https://${QA_PROJECT_REF}.supabase.co`;
export const WEBAUTHN_PATH='/functions/v1/iberfit-webauthn-v1';

const BUILD_ROOT=path.resolve('.tmp/rc64-current-surface');
const MIME=Object.freeze({
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.svg':'image/svg+xml',
  '.ico':'image/x-icon',
  '.woff':'font/woff',
  '.woff2':'font/woff2',
});

function mimeFor(file){return MIME[path.extname(file).toLowerCase()]||'application/octet-stream';}
export function qaRequestLabel(request){
  try{
    const url=new URL(request.url());
    const origin=url.origin===SUPABASE_ORIGIN?'qa-supabase':url.origin===CANARY_ORIGIN?'current-source':'external';
    return `${request.method().toUpperCase()} ${origin} ${url.pathname.slice(0,180)}`;
  }catch{return 'INVALID_REQUEST';}
}

function allowedQaRequest(request,readOnlyRpcs){
  let url;
  try{url=new URL(request.url());}catch{return false;}
  const method=request.method().toUpperCase();
  if(url.origin!==SUPABASE_ORIGIN)return false;
  if(method==='POST'&&url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password')return true;
  if(method==='POST'&&url.pathname==='/auth/v1/logout')return true;
  if(method==='GET'&&url.pathname==='/auth/v1/user')return true;
  if(method==='GET'&&url.pathname==='/rest/v1/domain_command_registry_v26')return true;
  if(method==='POST'&&url.pathname===WEBAUTHN_PATH)return true;
  const prefix='/rest/v1/rpc/';
  return method==='POST'&&url.pathname.startsWith(prefix)&&readOnlyRpcs.has(url.pathname.slice(prefix.length));
}

async function fulfillCurrentSource(route,url){
  let pathname=decodeURIComponent(url.pathname||'/');
  if(pathname==='/'||pathname==='')pathname='/index.html';
  const relative=pathname.replace(/^\/+/, '');
  const candidate=path.resolve(BUILD_ROOT,relative);
  if(candidate!==BUILD_ROOT&&!candidate.startsWith(BUILD_ROOT+path.sep)){
    await route.fulfill({status:403,body:'Forbidden'});
    return;
  }
  try{
    const body=await fs.readFile(candidate);
    await route.fulfill({
      status:200,
      body,
      headers:{
        'content-type':mimeFor(candidate),
        'cache-control':'no-store',
        'x-content-type-options':'nosniff',
      },
    });
  }catch{
    const extension=path.extname(candidate);
    if(!extension){
      try{
        const body=await fs.readFile(path.join(BUILD_ROOT,'index.html'));
        await route.fulfill({
          status:200,
          body,
          headers:{
            'content-type':'text/html; charset=utf-8',
            'cache-control':'no-store',
            'x-content-type-options':'nosniff',
          },
        });
        return;
      }catch{}
    }
    await route.fulfill({status:404,body:'Not found'});
  }
}

export async function installCurrentSourceQaNetworkPolicy(context,{readOnlyRpcs,onBlocked=()=>{},onQaRequest=()=>{}}){
  const safeReadOnlyRpcs=readOnlyRpcs instanceof Set?readOnlyRpcs:new Set(readOnlyRpcs||[]);
  await context.route('**/*',async(route)=>{
    const request=route.request();
    let url;
    try{url=new URL(request.url());}catch{
      onBlocked('INVALID_URL');
      await route.abort('blockedbyclient');
      return;
    }
    if(url.origin===CANARY_ORIGIN){
      await fulfillCurrentSource(route,url);
      return;
    }
    if(allowedQaRequest(request,safeReadOnlyRpcs)){
      onQaRequest(qaRequestLabel(request));
      await route.continue();
      return;
    }
    onBlocked(qaRequestLabel(request));
    await route.abort('blockedbyclient');
  });
}

async function addVirtualAuthenticator(page){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{
    options:{
      protocol:'ctap2',
      transport:'internal',
      hasResidentKey:true,
      hasUserVerification:true,
      isUserVerified:true,
      automaticPresenceSimulation:true,
    },
  });
  return {cdp,authenticatorId};
}

export async function completeClientWebAuthnChoice(page,{role='client'}={}){
  if(role!=='client'&&role!=='admin')throw new Error(`UNSUPPORTED_APP_CHOICE:${role}`);
  await expect(page.locator('#m26-auth-title'),'MFA gate must render after password authentication').toBeVisible({timeout:20_000});
  const webauthn=page.locator('[data-auth-action="mfa-continue-webauthn"]');
  await expect(webauthn,'MFA gate must expose same-device WebAuthn').toBeVisible({timeout:10_000});
  const {cdp,authenticatorId}=await addVirtualAuthenticator(page);
  try{
    await webauthn.click();
    const roleChoice=page.locator('.m26-role-choice[role="dialog"][aria-modal="true"]');
    await expect(roleChoice,'Multiapp Client/Admin identity must choose an authorized app after WebAuthn').toBeVisible({timeout:30_000});
    const provisionalClientShell=page.locator('.m26-shell[data-m26-role="client"]');
    await expect(provisionalClientShell,'Primary Client shell must remain inert until app choice').toHaveAttribute('inert','');
    await expect(provisionalClientShell).toHaveAttribute('aria-hidden','true');
    const chooseClient=roleChoice.locator('[data-m26-switch-role="client"]');
    const chooseAdmin=roleChoice.locator('[data-m26-switch-role="admin"]');
    await expect(chooseClient).toBeVisible();
    await expect(chooseAdmin).toBeVisible();
    await expect(roleChoice.locator('[data-m26-switch-role="coach"]'),'Unauthorized Coach app must not be offered').toHaveCount(0);
    const choice=role==='admin'?chooseAdmin:chooseClient;
    await choice.click();
    const shell=page.locator(`.m26-shell[data-m26-role="${role}"]`);
    await expect(shell,`${role} app must open only after explicit app choice`).toBeVisible({timeout:30_000});
    await expect(roleChoice).toHaveCount(0,{timeout:10_000});
    await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});
    return Object.freeze({mfaVerified:true,authorizedRoles:['client','admin'],selectedRole:role});
  }finally{
    await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId}).catch(()=>{});
    await cdp.send('WebAuthn.disable').catch(()=>{});
  }
}
