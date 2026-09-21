import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '@playwright/test';

const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const SUPABASE_ORIGIN=`https://${QA_PROJECT_REF}.supabase.co`;
const BUILD_ROOT=path.resolve('.tmp/rc64-current-surface');
const PUBLIC_BUILD_ROOT=path.join(BUILD_ROOT,'public');
const OUT_DIR=path.resolve('recovery/coach-webauthn-recurring');
const WEBAUTHN_PATH='/functions/v1/iberfit-webauthn-v1';
const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
];
const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26','iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13','iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d','iberfit_communication_bootstrap_v14',
  'm26_backend_bootstrap_v43','m26_wearable_bootstrap_v44',
  'iberfit_exercise_catalog_public_v1','iberfit_exercise_media_manifest_v1',
]);
const MIME=Object.freeze({
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2',
});

function mimeFor(file){return MIME[path.extname(file).toLowerCase()]||'application/octet-stream';}
function requestLabel(request){
  try{const url=new URL(request.url());return `${request.method().toUpperCase()} ${url.origin===SUPABASE_ORIGIN?'qa-supabase':url.origin} ${url.pathname}`;}
  catch{return 'INVALID_REQUEST';}
}
function isReadOnlyPushConfig(request,url,method){
  if(method!=='POST'||url.pathname!=='/functions/v1/iberfit-web-push-sender-v1')return false;
  try{const body=request.postDataJSON();return body&&typeof body==='object'&&!Array.isArray(body)&&body.action==='config'&&Object.keys(body).length===1;}catch{return false;}
}
function allowedQaRequest(request){
  let url;try{url=new URL(request.url());}catch{return false;}
  const method=request.method().toUpperCase();
  if(url.origin!==SUPABASE_ORIGIN)return false;
  if(method==='POST'&&url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password')return true;
  if(method==='POST'&&url.pathname==='/auth/v1/logout')return true;
  if(method==='GET'&&url.pathname==='/auth/v1/user')return true;
  if(method==='GET'&&url.pathname==='/rest/v1/domain_command_registry_v26')return true;
  if(method==='POST'&&url.pathname==='/rest/v1/rpc/iberfit_notification_preferences_status_v1')return true;
  if(method==='POST'&&url.pathname===WEBAUTHN_PATH)return true;
  if(isReadOnlyPushConfig(request,url,method))return true;
  const prefix='/rest/v1/rpc/';
  return method==='POST'&&url.pathname.startsWith(prefix)&&READ_ONLY_RPCS.has(url.pathname.slice(prefix.length));
}
function safeCandidate(base,relative){const candidate=path.resolve(base,relative);return candidate===base||candidate.startsWith(base+path.sep)?candidate:null;}
async function currentSource(relative){
  for(const base of [BUILD_ROOT,PUBLIC_BUILD_ROOT]){
    const candidate=safeCandidate(base,relative);if(!candidate)continue;
    try{return {body:await readFile(candidate),candidate};}catch{}
  }
  return null;
}
async function fulfillCurrentSource(route,url){
  let pathname=decodeURIComponent(url.pathname||'/');if(pathname==='/'||pathname==='')pathname='/index.html';
  const relative=pathname.replace(/^\/+/, '');const resolved=await currentSource(relative);
  if(resolved){await route.fulfill({status:200,body:resolved.body,headers:{'content-type':mimeFor(resolved.candidate),'cache-control':'no-store','x-content-type-options':'nosniff'}});return;}
  if(!path.extname(relative)){
    try{const body=await readFile(path.join(BUILD_ROOT,'index.html'));await route.fulfill({status:200,body,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});return;}catch{}
  }
  await route.fulfill({status:404,body:'Not found'});
}
async function installPolicy(context,evidence){
  await context.route('**/*',async(route)=>{
    const request=route.request();let url;
    try{url=new URL(request.url());}catch{evidence.blocked.push('INVALID_URL');await route.abort('blockedbyclient');return;}
    if(url.origin===CANARY_ORIGIN){await fulfillCurrentSource(route,url);return;}
    if(allowedQaRequest(request)){
      const label=requestLabel(request);evidence.qaRequests.push(label);
      if(request.method().toUpperCase()==='POST'&&url.pathname===WEBAUTHN_PATH){
        try{const body=request.postDataJSON();evidence.webauthnActions.push(String(body?.action||'unknown'));}catch{evidence.webauthnActions.push('unparsed');}
      }
      await route.continue();return;
    }
    evidence.blocked.push(requestLabel(request));await route.abort('blockedbyclient');
  });
}
async function addVirtualAuthenticator(page){
  const cdp=await page.context().newCDPSession(page);await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  return {cdp,authenticatorId};
}
async function setDevice(page,cdp,{name,width,height,mobile,touch}){
  await page.setViewportSize({width,height});
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:Boolean(mobile),screenWidth:width,screenHeight:height});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:Boolean(touch),maxTouchPoints:touch?5:1});
  const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,maxTouchPoints:navigator.maxTouchPoints}));
  expect(metrics.width,`${name}: width`).toBe(width);expect(metrics.height,`${name}: height`).toBe(height);
  if(touch)expect(metrics.maxTouchPoints,`${name}: touch`).toBeGreaterThan(0);
}
async function loginAndCompleteWebAuthn(page,email,password){
  await expect(page.getByRole('textbox',{name:'Correo',exact:true})).toBeVisible({timeout:20_000});
  await page.getByRole('textbox',{name:'Correo',exact:true}).fill(email);
  await page.locator('#m26-login-password').fill(password);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  const webauthn=page.locator('[data-auth-action="mfa-continue-webauthn"]');
  await expect(webauthn,'Coach must remain fail-closed until WebAuthn').toBeVisible({timeout:20_000});
  await webauthn.click();
  await expect(page.locator('.m26-shell[data-m26-role="coach"]'),'Coach shell after verified WebAuthn').toBeVisible({timeout:30_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:15_000});
  await expect(page.locator('.m26-role-choice[role="dialog"]'),'Coach-only fixture must not receive app choice').toHaveCount(0);
}
async function verifyViewport(page,label){
  const metrics=await page.evaluate(()=>({innerWidth,body:document.body.scrollWidth,doc:document.documentElement.scrollWidth}));
  expect(Math.max(metrics.body,metrics.doc),`${label}: no horizontal overflow`).toBeLessThanOrEqual(metrics.innerWidth+2);
  const nav=page.locator('[data-m26-area]:visible').first();
  await expect(nav,`${label}: visible Coach navigation`).toBeVisible({timeout:10_000});
}

 test('Coach completes real WebAuthn registration then real WebAuthn authentication on current source',async({browser})=>{
  const missing=REQUIRED.filter((name)=>!process.env[name]);expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_QA_COACH_EMAIL||'').toLowerCase()).toBe('qa.rc74.coach@iberfit.cl');
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);

  const evidence={schema:'iberfit.qa-coach-webauthn-recurring.v1',projectRef:QA_PROJECT_REF,source:'current-source-intercepted-at-canary-origin',canaryOrigin:CANARY_ORIGIN,authenticated:true,role:'coach',businessMutationsPerformed:false,serviceRoleUsed:false,registrationVerified:false,authenticationVerified:false,mfaCompleted:false,blocked:[],qaRequests:[],webauthnActions:[],devices:[]};
  const context=await browser.newContext({ignoreHTTPSErrors:false,locale:'es-ES',timezoneId:'America/Santiago',serviceWorkers:'block',viewport:{width:1440,height:1000},hasTouch:true});
  await installPolicy(context,evidence);
  const page=await context.newPage();const consoleErrors=[];const pageErrors=[];
  page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,500));});
  page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,500)));
  const {cdp,authenticatorId}=await addVirtualAuthenticator(page);
  try{
    await setDevice(page,cdp,{name:'desktop',width:1440,height:1000,mobile:false,touch:false});
    const response=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:20_000});expect(response?.status()).toBe(200);
    await loginAndCompleteWebAuthn(page,process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD);
    expect(evidence.webauthnActions).toContain('registration-options');expect(evidence.webauthnActions).toContain('registration-verify');
    evidence.registrationVerified=true;

    const logout=page.locator('[data-m26-action="logout"]').first();
    await expect(logout,'Coach shell must expose semantic logout').toHaveCount(1,{timeout:10_000});
    await logout.evaluate((element)=>element.click());
    await expect(page.getByRole('textbox',{name:'Correo',exact:true}),'Second password ceremony must start from logged-out state').toBeVisible({timeout:20_000});

    const secondStart=evidence.webauthnActions.length;
    await loginAndCompleteWebAuthn(page,process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD);
    const secondActions=evidence.webauthnActions.slice(secondStart);
    expect(secondActions,'Second ceremony must authenticate existing credential').toContain('authentication-options');
    expect(secondActions,'Second ceremony must verify existing credential').toContain('authentication-verify');
    expect(secondActions,'Second ceremony must not silently re-enrol').not.toContain('registration-options');
    evidence.authenticationVerified=true;evidence.mfaCompleted=true;

    for(const device of [
      {name:'desktop',width:1440,height:1000,mobile:false,touch:false},
      {name:'tablet-portrait',width:1024,height:1366,mobile:true,touch:true},
      {name:'tablet-landscape',width:1366,height:1024,mobile:true,touch:true},
      {name:'mobile',width:390,height:844,mobile:true,touch:true},
    ]){
      await setDevice(page,cdp,device);await page.waitForTimeout(120);await verifyViewport(page,device.name);evidence.devices.push({...device,passed:true});
    }

    expect(evidence.blocked,'No business mutation or foreign request may be attempted').toEqual([]);
    expect(consoleErrors,'Authenticated Coach console must remain clean').toEqual([]);
    expect(pageErrors,'Authenticated Coach page must remain clean').toEqual([]);
    await mkdir(OUT_DIR,{recursive:true});await writeFile(path.join(OUT_DIR,'evidence.json'),JSON.stringify(evidence,null,2)+'\n','utf8');
  }finally{
    await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId}).catch(()=>{});
    await cdp.send('WebAuthn.disable').catch(()=>{});
    await context.close().catch(()=>{});
  }
});
