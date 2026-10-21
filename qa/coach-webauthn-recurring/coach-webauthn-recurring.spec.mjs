import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '@playwright/test';
import {isQaPrivateAvatarRead} from '../rc64/secure-current-source-auth.mjs';
import {isQaMissingPrivateAvatarResponse,unexpectedQaResourceErrors} from '../rc64/secure-current-source-auth.mjs';
import {isQaIriSignedPhotoRead,qaIriPrivatePhotoEvidenceLabel} from './qa-iri-signed-photo-read.mjs';
import {auditAuthenticatedProfessionalRoutes} from '../signature-u26-authenticated-professional-routes.mjs';
import {isQaBootstrapRequest,sanitizeQaBootstrapResponse,summarizeQaBootstrapSamples} from './qa-bootstrap-response-metrics.mjs';

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
  'iberfit_exercise_measurement_profiles_public_v1',
]);
// U26: exact QA-only IRI data projections observed in authenticated Coach routes.
// Verified 20-Oct-2026 on QA: RLS enabled + authenticated SELECT for each table.
const U26_IRI_READONLY_TABLES=new Set([
  'iri_consents_v1','iri_photogrammetry_captures_v1',
  'iri_photogrammetry_analyses_v1','iri_photogrammetry_analyses_v2',
  'iri_photo_report_permissions_v1','iri_external_reports_v26',
]);
const U26_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function authenticatedQaRequest(request){
  const headers=request.headers?.()||{};
  return /^Bearer [A-Za-z0-9_.~-]+$/u.test(String(headers.authorization||headers.Authorization||''));
}
function approvedIriDraftRead(request){
  try{
    const body=request.postDataJSON();
    if(!body||typeof body!=='object'||Array.isArray(body))return false;
    const keys=Object.keys(body);
    return keys.length>0&&keys.every(key=>['p_client_id','p_assessment_id'].includes(key))&&
      keys.every(key=>body[key]===null||U26_UUID.test(String(body[key])));
  }catch{return false;}
}
const MIME=Object.freeze({
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2',
});

function mimeFor(file){return MIME[path.extname(file).toLowerCase()]||'application/octet-stream';}
function requestLabel(request){
  const privateLabel=qaIriPrivatePhotoEvidenceLabel(request,{qaOrigin:SUPABASE_ORIGIN});
  if(privateLabel)return privateLabel;
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
  if(isQaPrivateAvatarRead(request))return true;
  // QA-only: exact JWT-authenticated, time-bounded private photo signing/read.
  if(isQaIriSignedPhotoRead(request,{qaOrigin:SUPABASE_ORIGIN}))return true;
  if(method==='GET'&&authenticatedQaRequest(request)&&
    /^\/rest\/v1\/[a-z][a-z0-9_]*$/u.test(url.pathname)&&
    U26_IRI_READONLY_TABLES.has(url.pathname.slice('/rest/v1/'.length)))return true;
  // Confirmed QA pg_proc: public.m26_iri_draft_get_v1 is STABLE, SECURITY INVOKER.
  if(method==='POST'&&url.pathname==='/rest/v1/rpc/m26_iri_draft_get_v1'&&
    authenticatedQaRequest(request)&&approvedIriDraftRead(request))return true;
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

// QA-only Coach navigation after a genuine WebAuthn ceremony. On mobile,
// secondary modules live under Más; never click a hidden desktop sidebar.
async function openCertifiedCoachArea(page,area){
  const destination=page.locator(`[data-m26-area="${area}"]:visible`).first();
  if(!await destination.count()){
    const more=page.locator('.m26-mobile-more:visible > summary').first();
    await expect(more,'Coach mobile Más menu must be reachable').toBeVisible({timeout:10_000});
    await more.click();
  }
  await expect(destination,'Coach must expose '+area+' navigation').toBeVisible({timeout:10_000});
  await destination.click();
  // The current item moves into the collapsed Más panel on mobile.
  // Route truth is its aria-current state AND the visible main workspace,
  // not whether the hidden menu button is visibly painted.
  await expect(page.locator(`[data-m26-area="${area}"][aria-current="page"]`).first(),
    'Coach selected route must remain active').toHaveCount(1,{timeout:12_000});
  await expect(page.getByRole('main',{name:area==='sesion'?'Sesiones':'Planificación'}),
    'Coach selected workspace must be visible').toBeVisible({timeout:12_000});
  await expect(page.locator('[data-m26-guided-tour]'),
    'Genio first-use tour must not interrupt an actively selected workspace').toHaveCount(0,{timeout:12_000});
}

 test('Coach completes real WebAuthn registration then real WebAuthn authentication on current source',async({browser})=>{
  // SIGNATURE U26 adds authenticated professional route coverage on five devices.
  // Keep individual assertions bounded; allow the full MFA+device journey to finish.
  test.setTimeout(420_000);
  const missing=REQUIRED.filter((name)=>!process.env[name]);expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_QA_COACH_EMAIL||'').toLowerCase()).toBe('qa.rc74.coach@iberfit.cl');
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);

  const evidence={signatureU26Audits:[],schema:'iberfit.qa-coach-webauthn-recurring.v1',projectRef:QA_PROJECT_REF,source:'current-source-intercepted-at-canary-origin',canaryOrigin:CANARY_ORIGIN,authenticated:true,role:'coach',businessMutationsPerformed:false,serviceRoleUsed:false,registrationVerified:false,authenticationVerified:false,mfaCompleted:false,blocked:[],qaRequests:[],webauthnActions:[],devices:[]};
  const context=await browser.newContext({ignoreHTTPSErrors:false,locale:'es-ES',timezoneId:'America/Santiago',serviceWorkers:'block',viewport:{width:1440,height:1000},hasTouch:true});
  await installPolicy(context,evidence);
  const page=await context.newPage();const consoleErrors=[];const pageErrors=[];
  // Distinguish a genuinely absent, JWT-authenticated optional QA avatar
  // from an unexpected HTTP error. Never ignore an unverified 400/404.
  const errorResponseChecks=[];
  const bootstrapChecks=[];
  page.on('requestfinished',(request)=>{
    if(!isQaBootstrapRequest(request,SUPABASE_ORIGIN))return;
    bootstrapChecks.push(Promise.resolve(request.response()).then((response)=>
      sanitizeQaBootstrapResponse({
        status:response?.status()||0,
        timing:request.timing(),
        contentLength:response?.headers()?.['content-length']??null,
      }),()=>sanitizeQaBootstrapResponse({status:0})));
  });
  page.on('requestfailed',(request)=>{
    if(isQaBootstrapRequest(request,SUPABASE_ORIGIN))
      bootstrapChecks.push(Promise.resolve(sanitizeQaBootstrapResponse({status:0,timing:request.timing()})));
  });
  async function snapshotBootstrap(){
    const results=await Promise.allSettled(bootstrapChecks);
    return summarizeQaBootstrapSamples(results.map(item=>
      item.status==='fulfilled'?item.value:sanitizeQaBootstrapResponse({status:0})));
  }
  page.on('response',(response)=>{
    if(![400,404].includes(response.status()))return;
    errorResponseChecks.push(Promise.resolve(isQaMissingPrivateAvatarResponse(response))
      .then((knownMissing)=>({status:response.status(),knownMissing}),
        ()=>({status:response.status(),knownMissing:false})));
  });
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

    // The real Coach needs an explicit synthetic client context for the
    // planning and session routes. Never select a production identity.
    const clientSelector=page.locator('[data-m26-client-select]');
    await expect(clientSelector,'Coach client context selector').toHaveCount(1);
    expect(await clientSelector.locator('option:not([value=""])').count(),
      'QA Coach must have a synthetic client to plan for').toBeGreaterThan(0);
    if(!await clientSelector.inputValue())await clientSelector.selectOption({index:1});
    await mkdir(OUT_DIR,{recursive:true});

    for(const device of [
      {name:'desktop',width:1440,height:1000,mobile:false,touch:false},
      {name:'tablet-portrait',width:1024,height:1366,mobile:true,touch:true},
      {name:'tablet-landscape',width:1366,height:1024,mobile:true,touch:true},
      {name:'mobile',width:390,height:844,mobile:true,touch:true},
      {name:'mobile-320',width:320,height:700,mobile:true,touch:true},
    ]){
      await setDevice(page,cdp,device);
      await page.waitForTimeout(120);
      await verifyViewport(page,device.name);
      await openCertifiedCoachArea(page,'sesion');
      await expect(page.locator('[data-m27-session-surface="sessions"]'),
        device.name+': Coach real session workspace').toBeVisible({timeout:12_000});
      await expect(page.getByRole('heading',{name:'Preparación y ejecución',exact:true}),
        device.name+': Coach session heading').toBeVisible();
      await page.screenshot({path:path.join(OUT_DIR,`m43-${device.name}-coach-sessions.png`),fullPage:true});

      await openCertifiedCoachArea(page,'planificacion');
      await expect(page.locator('.m26-route').first(),
        device.name+': Coach real planning route').toBeVisible({timeout:12_000});
      await verifyViewport(page,device.name+'-m43-planning');
      await page.screenshot({path:path.join(OUT_DIR,`m43-${device.name}-coach-planning.png`),fullPage:true});
      evidence.devices.push({...device,passed:true,m43CoachWorkspace:true});
      if(device.name==='desktop'||device.name==='mobile'){
        const scope=device.name==='desktop'?'desktop':'mobile';
        evidence.signatureU26Audits.push(await auditAuthenticatedProfessionalRoutes(page,{role:'coach',viewport:scope}));
      }
    }
    expect(evidence.signatureU26Audits.map(x=>x.viewport)).toEqual(['desktop','mobile']);
    evidence.m43CoachWorkspaceCertified=evidence.devices.length===5;

    expect(evidence.blocked,'No business mutation or foreign request may be attempted').toEqual([]);
    const errorResponses=await Promise.all(errorResponseChecks);
    expect(errorResponses.filter((item)=>!item.knownMissing),
      'Every HTTP 400/404 must be an authenticated, verified optional avatar absence').toEqual([]);
    const absentAvatarCount=errorResponses.filter((item)=>item.knownMissing).length;
    evidence.optionalAvatarAbsentCount=absentAvatarCount;
    expect(unexpectedQaResourceErrors(consoleErrors,absentAvatarCount),
      'Authenticated Coach console must have no unexpected errors').toEqual([]);
    expect(pageErrors,'Authenticated Coach page must remain clean').toEqual([]);
    const bootstrap=await snapshotBootstrap();
    expect(bootstrap.requestCount,'Real authenticated Coach bootstrap requests must be observed').toBeGreaterThan(0);
    expect(bootstrap.failureCount,'Every real Coach bootstrap RPC must finish without HTTP or network error').toBe(0);
  }finally{
    // Persist privacy-safe evidence even when an earlier MFA or console assertion fails.
    // Do not redact an HTTP 500 into success or swallow an unexpected page error.
    try{
      evidence.bootstrap=await snapshotBootstrap();
      await mkdir(OUT_DIR,{recursive:true});
      await writeFile(path.join(OUT_DIR,'evidence.json'),JSON.stringify(evidence,null,2)+'\n','utf8');
    }finally{
      await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId}).catch(()=>{});
      await cdp.send('WebAuthn.disable').catch(()=>{});
      await context.close().catch(()=>{});
    }
  }
});
