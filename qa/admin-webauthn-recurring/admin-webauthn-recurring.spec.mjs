import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '@playwright/test';

const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const SUPABASE_ORIGIN=`https://${QA_PROJECT_REF}.supabase.co`;
const BUILD_ROOT=path.resolve('.tmp/rc64-current-surface');
const PUBLIC_BUILD_ROOT=path.join(BUILD_ROOT,'public');
const OUT_DIR=path.resolve('recovery/admin-webauthn-recurring');
const WEBAUTHN_PATH='/functions/v1/iberfit-webauthn-v1';
const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
];
const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26','iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13','iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d','iberfit_communication_bootstrap_v14',
  'iberfit_admin_bootstrap_v14','m26_backend_bootstrap_v43','m26_wearable_bootstrap_v44',
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
async function loginCompleteWebAuthnAndChooseAdmin(page,email,password){
  await expect(page.getByRole('textbox',{name:'Correo',exact:true})).toBeVisible({timeout:20_000});
  await page.getByRole('textbox',{name:'Correo',exact:true}).fill(email);
  await page.locator('#m26-login-password').fill(password);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();

  const adminShell=page.locator('.m26-shell[data-m26-role="admin"]');
  const roleChoice=page.locator('.m26-role-choice[role="dialog"][aria-modal="true"]');
  const webauthn=page.locator('[data-auth-action="mfa-continue-webauthn"]');
  await expect(adminShell,'Admin shell must remain unavailable before device proof').toHaveCount(0,{timeout:10_000});
  await expect(roleChoice,'App selector must not precede WebAuthn').toHaveCount(0);
  await expect(webauthn,'Privileged multiapp fixture must require WebAuthn').toBeVisible({timeout:20_000});
  await webauthn.click();

  await expect(roleChoice,'Client/Admin selector must appear only after WebAuthn').toBeVisible({timeout:30_000});
  const provisionalAdminShellCount=await adminShell.count();
  expect(provisionalAdminShellCount,'At most one provisional Admin shell may exist before app choice').toBeLessThanOrEqual(1);
  if(provisionalAdminShellCount===1){
    await expect(adminShell,'Rendered provisional Admin shell must remain inert until app choice').toHaveAttribute('inert','');
    await expect(adminShell).toHaveAttribute('aria-hidden','true');
  }
  const provisionalClientShell=page.locator('.m26-shell[data-m26-role="client"]');
  const provisionalClientShellCount=await provisionalClientShell.count();
  expect(provisionalClientShellCount,'At most one provisional Client shell may exist before app choice').toBeLessThanOrEqual(1);
  if(provisionalClientShellCount===1){
    await expect(provisionalClientShell,'Rendered provisional Client shell must remain inert until app choice').toHaveAttribute('inert','');
    await expect(provisionalClientShell,'Rendered provisional Client shell must leave the accessibility-hidden state').not.toHaveAttribute('aria-hidden','true');
  }
  const chooseClient=roleChoice.locator('[data-m26-switch-role="client"]');
  const chooseAdmin=roleChoice.locator('[data-m26-switch-role="admin"]');
  await expect(chooseClient).toBeVisible();
  await expect(chooseAdmin).toBeVisible();
  await expect(roleChoice.locator('[data-m26-switch-role="coach"]'),'Unauthorized Coach app must not be offered').toHaveCount(0);
  await chooseAdmin.click();
  await expect(adminShell,'Admin app must open only after explicit app choice').toBeVisible({timeout:30_000});
  await expect(adminShell,'Chosen Admin shell must become interactive').not.toHaveAttribute('inert','');
  await expect(adminShell,'Chosen Admin shell must leave the accessibility-hidden state').not.toHaveAttribute('aria-hidden','true');
  await expect(roleChoice).toHaveCount(0,{timeout:10_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:15_000});
  expect(new URL(page.url()).origin).toBe(CANARY_ORIGIN);
}
async function verifySafeAdminNavigation(page){
  const candidate=page.locator(
    '.m26-sidebar [data-m26-area]:not([aria-current="page"]):not([disabled]):visible, .m26-mobile-nav [data-m26-area]:not([aria-current="page"]):not([disabled]):visible',
  ).first();
  await expect(candidate,'Admin shell must expose a safe navigation target').toBeVisible({timeout:10_000});
  const area=await candidate.getAttribute('data-m26-area');
  expect(area).toBeTruthy();
  const touch=await page.evaluate(()=>navigator.maxTouchPoints>0);
  if(touch)await candidate.tap();else await candidate.click();
  await expect(page.locator(`[data-m26-area="${area}"][aria-current="page"]:visible`).first(),'Read-only Admin navigation must complete').toBeVisible({timeout:10_000});
  return area;
}
async function verifyMobileMoreNavigation(page){
  const more=page.locator('details.m26-mobile-more').first();
  const summary=more.locator(':scope > summary').first();
  const menu=more.locator('.m26-mobile-more-menu').first();
  await expect(more,'Authenticated Admin mobile shell must expose Más').toBeVisible({timeout:10_000});
  await expect(summary).toHaveAttribute('aria-expanded','false');
  await summary.tap();
  await expect(more).toHaveAttribute('open','');
  await expect(summary).toHaveAttribute('aria-expanded','true');
  await expect(menu).toBeVisible();
  await expect(page.locator('#m26-main')).toHaveAttribute('inert','');
  const library=menu.locator('[data-m26-area="biblioteca"]').first();
  await expect(library,'Más must expose Biblioteca for Admin').toBeVisible();
  const hitTarget=await library.evaluate((element)=>{
    const rect=element.getBoundingClientRect();
    const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
    return hit===element||Boolean(element.contains(hit));
  });
  expect(hitTarget,'Biblioteca must receive touch pointer events').toBe(true);

  const routeStateBeforeTap=await page.evaluate(()=>{
    const app=globalThis.__IBERFIT_M26_APP__;
    const state=app?.getState?.()||{};
    const root=document.querySelector('#app');
    globalThis.__IBERFIT_ADMIN_ROUTE_DIAG__={events:[]};
    root?.addEventListener?.('m26:shell-rendered',(event)=>{
      const current=app?.getState?.()||{};
      globalThis.__IBERFIT_ADMIN_ROUTE_DIAG__.events.push({
        eventArea:String(event?.detail?.area||''),
        activeArea:String(current.activeArea||''),
        role:String(current.identity?.role||''),
        title:String(document.querySelector('#m26-page-title')?.textContent||'').trim(),
        renderedAreas:[...document.querySelectorAll('[data-m26-area][aria-current="page"]')]
          .map((node)=>String(node.getAttribute('data-m26-area')||'')),
      });
    });
    return {
      activeArea:String(state.activeArea||''),
      role:String(state.identity?.role||''),
      hydration:String(state.hydration?.status||''),
      title:String(document.querySelector('#m26-page-title')?.textContent||'').trim(),
      renderedAreas:[...document.querySelectorAll('[data-m26-area][aria-current="page"]')]
        .map((node)=>String(node.getAttribute('data-m26-area')||'')),
      maxTouchPoints:Number(navigator.maxTouchPoints||0),
    };
  });

  await library.tap();
  await page.evaluate(()=>new Promise((resolve)=>queueMicrotask(resolve)));

  const routeStateAfterTap=await page.evaluate(()=>{
    const state=globalThis.__IBERFIT_M26_APP__?.getState?.()||{};
    return {
      activeArea:String(state.activeArea||''),
      role:String(state.identity?.role||''),
      hydration:String(state.hydration?.status||''),
      title:String(document.querySelector('#m26-page-title')?.textContent||'').trim(),
      renderedAreas:[...document.querySelectorAll('[data-m26-area][aria-current="page"]')]
        .map((node)=>String(node.getAttribute('data-m26-area')||'')),
      moreOpen:Boolean(document.querySelector('details.m26-mobile-more')?.open),
      events:[...(globalThis.__IBERFIT_ADMIN_ROUTE_DIAG__?.events||[])],
    };
  });

  console.log(`IBERFIT_ADMIN_MOBILE_ROUTE_DIAG=${JSON.stringify({
    before:routeStateBeforeTap,
    after:routeStateAfterTap,
  })}`);

  expect(
    routeStateAfterTap.activeArea,
    `Canonical route must commit Biblioteca. Diagnostic: ${JSON.stringify({
      before:routeStateBeforeTap,
      after:routeStateAfterTap,
    })}`,
  ).toBe('biblioteca');

  const activeMore=page.locator('details.m26-mobile-more[data-m26-more-active="true"]').first();
  await expect(page.locator('#m26-page-title'),'Mobile Más navigation must render Biblioteca').toHaveText('Biblioteca',{timeout:10_000});
  await expect(activeMore,'Más must represent the active hidden destination').toBeVisible({timeout:10_000});
  await expect(activeMore,'Más must close after navigation').not.toHaveAttribute('open','');
  await expect(activeMore.locator('[data-m26-area="biblioteca"][aria-current="page"]'),'Closed Más must retain Biblioteca as the canonical active item').toHaveCount(1);
  await expect(activeMore.locator(':scope > summary')).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('#m26-main')).not.toHaveAttribute('inert','');
  return 'biblioteca';
}
async function verifyViewport(page,label){
  const metrics=await page.evaluate(()=>({innerWidth,body:document.body.scrollWidth,doc:document.documentElement.scrollWidth}));
  expect(Math.max(metrics.body,metrics.doc),`${label}: no horizontal overflow`).toBeLessThanOrEqual(metrics.innerWidth+2);
  await expect(page.locator('.m26-shell[data-m26-role="admin"]'),`${label}: Admin shell remains visible`).toBeVisible({timeout:10_000});
}
async function certifyDevice(page,cdp,device){
  await setDevice(page,cdp,device);
  await page.waitForTimeout(120);
  await verifyViewport(page,device.name);
  const navigationArea=device.name==='mobile'?await verifyMobileMoreNavigation(page):await verifySafeAdminNavigation(page);
  const screenshot=path.join(OUT_DIR,`admin-${device.name}.png`);
  await page.screenshot({path:screenshot,fullPage:true,animations:'disabled',caret:'hide'});
  return Object.freeze({...device,passed:true,navigationArea,screenshot:path.relative(process.cwd(),screenshot).replaceAll(path.sep,'/')});
}

test('Admin completes real WebAuthn registration and authentication before explicit app choice on current source',async({browser})=>{
  const missing=REQUIRED.filter((name)=>!process.env[name]);expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_QA_CLIENT_A_EMAIL||'').toLowerCase()).toBe('qa.rc74.client-a@iberfit.cl');
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);
  await mkdir(OUT_DIR,{recursive:true});

  const evidence={schema:'iberfit.qa-admin-webauthn-recurring.v2',projectRef:QA_PROJECT_REF,source:'current-source-intercepted-at-canary-origin',canaryOrigin:CANARY_ORIGIN,authenticated:true,fixture:'qa.rc74.client-a@iberfit.cl',authorizedRoles:['client','admin'],selectedRole:'admin',businessMutationsPerformed:false,serviceRoleUsed:false,registrationVerified:false,authenticationVerified:false,mfaCompleted:false,applicationChoiceVerified:false,blocked:[],qaRequests:[],webauthnActions:[],devices:[],safeNavigationArea:null};
  const context=await browser.newContext({ignoreHTTPSErrors:false,locale:'es-ES',timezoneId:'America/Santiago',serviceWorkers:'block',viewport:{width:1440,height:1000},hasTouch:true});
  await installPolicy(context,evidence);
  const page=await context.newPage();const consoleErrors=[];const pageErrors=[];
  page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,500));});
  page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,500)));
  const {cdp,authenticatorId}=await addVirtualAuthenticator(page);
  try{
    await setDevice(page,cdp,{name:'desktop',width:1440,height:1000,mobile:false,touch:false});
    const response=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:20_000});expect(response?.status()).toBe(200);

    const firstStart=evidence.webauthnActions.length;
    await loginCompleteWebAuthnAndChooseAdmin(page,process.env.M26_QA_CLIENT_A_EMAIL,process.env.M26_QA_CLIENT_A_PASSWORD);
    const firstActions=evidence.webauthnActions.slice(firstStart);
    expect(firstActions).toContain('registration-options');expect(firstActions).toContain('registration-verify');
    expect(firstActions,'Fresh Admin fixture must register rather than authenticate an old credential').not.toContain('authentication-options');
    evidence.registrationVerified=true;evidence.applicationChoiceVerified=true;
    evidence.safeNavigationArea=await verifySafeAdminNavigation(page);

    const logout=page.locator('[data-m26-action="logout"]').first();
    await expect(logout,'Admin shell must expose semantic logout').toHaveCount(1,{timeout:10_000});
    await logout.evaluate((element)=>element.click());
    await expect(page.getByRole('textbox',{name:'Correo',exact:true}),'Second password ceremony must start from logged-out state').toBeVisible({timeout:20_000});

    const secondStart=evidence.webauthnActions.length;
    await loginCompleteWebAuthnAndChooseAdmin(page,process.env.M26_QA_CLIENT_A_EMAIL,process.env.M26_QA_CLIENT_A_PASSWORD);
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
      evidence.devices.push(await certifyDevice(page,cdp,device));
    }

    expect(evidence.blocked,'No business mutation or foreign request may be attempted').toEqual([]);
    expect(consoleErrors,'Authenticated Admin console must remain clean').toEqual([]);
    expect(pageErrors,'Authenticated Admin page must remain clean').toEqual([]);
    expect(evidence.qaRequests.some((label)=>label.includes('/rest/v1/rpc/iberfit_admin_bootstrap_v14')),'Real Admin bootstrap must be observed').toBe(true);
    await writeFile(path.join(OUT_DIR,'evidence.json'),JSON.stringify(evidence,null,2)+'\n','utf8');
  }finally{
    await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId}).catch(()=>{});
    await cdp.send('WebAuthn.disable').catch(()=>{});
    await context.close().catch(()=>{});
  }
});