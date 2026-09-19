import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const SUPABASE_ORIGIN=`https://${QA_PROJECT_REF}.supabase.co`;
const BUILD_ROOT=path.resolve('.tmp/rc64-current-surface');
const PUBLIC_BUILD_ROOT=path.join(BUILD_ROOT,'public');
const OUT_DIR=path.resolve('recovery/admin-authenticated-real');

const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
];
const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26','iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13','iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d','iberfit_admin_bootstrap_v14',
  'iberfit_communication_bootstrap_v14','m26_backend_bootstrap_v43',
  'm26_wearable_bootstrap_v44','iberfit_exercise_catalog_public_v1',
  'iberfit_exercise_media_manifest_v1',
]);
const MIME=Object.freeze({
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon',
  '.woff':'font/woff','.woff2':'font/woff2',
});

function mimeFor(file){return MIME[path.extname(file).toLowerCase()]||'application/octet-stream';}
function safeSlug(value){return String(value||'unknown').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,80)||'unknown';}
function requestLabel(request){
  try{const url=new URL(request.url());return `${request.method().toUpperCase()} ${url.origin} ${url.pathname}`;}
  catch{return 'INVALID_REQUEST';}
}
function allowedQaRequest(request){
  let url;
  try{url=new URL(request.url());}catch{return false;}
  const method=request.method().toUpperCase();
  if(url.origin!==SUPABASE_ORIGIN)return false;
  if(method==='POST'&&url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password')return true;
  if(method==='GET'&&url.pathname==='/auth/v1/user')return true;
  if(method==='GET'&&url.pathname==='/rest/v1/domain_command_registry_v26')return true;
  if(method==='POST'&&url.pathname==='/functions/v1/iberfit-webauthn-v1')return true;
  const prefix='/rest/v1/rpc/';
  return method==='POST'&&url.pathname.startsWith(prefix)&&READ_ONLY_RPCS.has(url.pathname.slice(prefix.length));
}
function buildCandidate(base,relative){
  const candidate=path.resolve(base,relative);
  return candidate===base||candidate.startsWith(base+path.sep)?candidate:null;
}
async function readCurrentSource(relative){
  for(const base of [BUILD_ROOT,PUBLIC_BUILD_ROOT]){
    const candidate=buildCandidate(base,relative);
    if(!candidate)continue;
    try{return {body:await fs.readFile(candidate),candidate};}catch{}
  }
  return null;
}
async function fulfillCurrentSource(route,url){
  let pathname;
  try{pathname=decodeURIComponent(url.pathname||'/');}catch{
    await route.fulfill({status:400,body:'Bad Request'});return;
  }
  if(pathname==='/'||pathname==='')pathname='/index.html';
  const relative=pathname.replace(/^\/+/, '');
  const resolved=await readCurrentSource(relative);
  if(resolved){
    await route.fulfill({status:200,body:resolved.body,headers:{
      'content-type':mimeFor(resolved.candidate),'cache-control':'no-store','x-content-type-options':'nosniff',
    }});
    return;
  }
  if(!path.extname(relative)){
    try{
      const body=await fs.readFile(path.join(BUILD_ROOT,'index.html'));
      await route.fulfill({status:200,body,headers:{
        'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',
      }});
      return;
    }catch{}
  }
  await route.fulfill({status:404,body:'Not found'});
}
async function installNetworkPolicy(context,evidence){
  await context.route('**/*',async(route)=>{
    const request=route.request();
    let url;
    try{url=new URL(request.url());}catch{
      evidence.blocked.push('INVALID_URL');await route.abort('blockedbyclient');return;
    }
    if(url.origin===CANARY_ORIGIN){
      evidence.sameOrigin.push(requestLabel(request));
      await fulfillCurrentSource(route,url);return;
    }
    if(allowedQaRequest(request)){
      const label=requestLabel(request);
      evidence.qaRequests.push(label);
      if(request.method().toUpperCase()==='POST'&&url.pathname==='/functions/v1/iberfit-webauthn-v1')evidence.authMutations.push(label);
      await route.continue();return;
    }
    evidence.blocked.push(requestLabel(request));
    await route.abort('blockedbyclient');
  });
}
async function addVirtualAuthenticator(page){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{
    protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,
    isUserVerified:true,automaticPresenceSimulation:true,
  }});
  return {cdp,authenticatorId};
}
function attachPageDiagnostics(page,consoleErrors,pageErrors,label){
  page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(`${label}: ${String(message.text()||'').slice(0,500)}`);});
  page.on('pageerror',(error)=>pageErrors.push(`${label}: ${String(error?.message||error||'PAGE_ERROR').slice(0,500)}`));
}
async function expectDeviceContext(page,{name,width,height,touch}){
  const metrics=await page.evaluate(()=>({
    width:innerWidth,height:innerHeight,maxTouchPoints:navigator.maxTouchPoints,
    visualWidth:visualViewport?.width??null,visualHeight:visualViewport?.height??null,
  }));
  expect(metrics.width,`${name}: viewport width`).toBe(width);
  expect(metrics.height,`${name}: viewport height`).toBe(height);
  if(touch)expect(metrics.maxTouchPoints,`${name}: touch context`).toBeGreaterThan(0);
  else expect(metrics.maxTouchPoints,`${name}: pointer context`).toBe(0);
  return metrics;
}
async function pointerState(locator){
  if(!await locator.count())return {exists:false,inViewport:false,receivesPointer:false};
  return locator.evaluate((el)=>{
    const rect=el.getBoundingClientRect();
    const x=rect.left+rect.width/2;
    const y=rect.top+rect.height/2;
    const inViewport=rect.width>0&&rect.height>0&&x>=0&&x<=innerWidth&&y>=0&&y<=innerHeight;
    const hit=inViewport?document.elementFromPoint(x,y):null;
    return {
      exists:true,
      inViewport,
      receivesPointer:Boolean(hit&&(hit===el||el.contains(hit))),
      rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height},
      viewport:{width:innerWidth,height:innerHeight},
      hitTag:hit?.tagName||null,
      hitArea:hit?.closest?.('[data-m26-area]')?.getAttribute?.('data-m26-area')||null,
    };
  }).catch(()=>({exists:true,inViewport:false,receivesPointer:false,error:'POINTER_STATE_FAILED'}));
}
async function activate(locator,touch){if(touch)await locator.tap();else await locator.click();}
async function clickNav(page,area,{touch=false}={}){
  const compact=await page.evaluate(()=>innerWidth<=900);
  if(!compact){
    const direct=page.locator(`.m26-sidebar [data-m26-area="${area}"]:visible`).first();
    await expect(direct,`Admin sidebar navigation must expose ${area}`).toBeVisible();
    await activate(direct,touch);
    return;
  }
  const direct=page.locator(`.m26-mobile-nav > [data-m26-area="${area}"]:visible`).first();
  if(await direct.count()){
    const state=await pointerState(direct);
    expect(state.inViewport,`Admin direct mobile navigation must be inside viewport for ${area}: ${JSON.stringify(state)}`).toBe(true);
    expect(state.receivesPointer,`Admin direct mobile navigation must receive pointer for ${area}: ${JSON.stringify(state)}`).toBe(true);
    await activate(direct,touch);
    return;
  }
  const more=page.locator('details.m26-mobile-more:visible').first();
  await expect(more,`Admin responsive navigation must expose ${area}`).toBeVisible({timeout:5_000});
  const summary=more.locator(':scope > summary').first();
  await expect(summary,`Admin More trigger must expose ${area}`).toBeVisible();
  const summaryState=await pointerState(summary);
  expect(summaryState.inViewport,`Admin More trigger must be inside viewport for ${area}: ${JSON.stringify(summaryState)}`).toBe(true);
  expect(summaryState.receivesPointer,`Admin More trigger must receive pointer for ${area}: ${JSON.stringify(summaryState)}`).toBe(true);
  if(!await more.evaluate((node)=>node.open))await activate(summary,touch);
  await expect(more).toHaveAttribute('open','');
  const target=more.locator(`[data-m26-area="${area}"]:visible`).first();
  await expect(target,`Admin More menu must contain ${area}`).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  const targetState=await pointerState(target);
  expect(targetState.inViewport,`Admin More target must be inside viewport for ${area}: ${JSON.stringify(targetState)}`).toBe(true);
  expect(targetState.receivesPointer,`Admin More target must receive pointer for ${area}: ${JSON.stringify(targetState)}`).toBe(true);
  await activate(target,touch);
}
async function expectViewportHealthy(page,label){
  const metrics=await page.evaluate(()=>({innerWidth,bodyScrollWidth:document.body.scrollWidth,docScrollWidth:document.documentElement.scrollWidth}));
  expect(Math.max(metrics.bodyScrollWidth,metrics.docScrollWidth),`${label}: no horizontal overflow`).toBeLessThanOrEqual(metrics.innerWidth+2);
}
async function expectTouchTarget(locator,touch,label){
  if(!touch)return;
  const rect=await locator.evaluate((node)=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height};});
  expect(rect.height,`${label}: touch height`).toBeGreaterThanOrEqual(44);
  expect(rect.width,`${label}: touch width`).toBeGreaterThanOrEqual(44);
}
async function mobileNavGeometry(page){
  const nav=page.locator('.m26-mobile-nav:visible').first();
  await expect(nav,'mobile bottom navigation must be visible').toBeVisible();
  return nav.evaluate((el)=>{
    const rect=el.getBoundingClientRect();
    const style=getComputedStyle(el);
    const centerX=rect.left+rect.width/2;
    const centerY=rect.top+rect.height/2;
    const hit=document.elementFromPoint(centerX,Math.min(innerHeight-1,centerY));
    return {
      position:style.position,bottom:style.bottom,zIndex:style.zIndex,
      rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height},
      viewport:{width:innerWidth,height:innerHeight,scrollY,visualHeight:visualViewport?.height??null,visualOffsetTop:visualViewport?.offsetTop??null},
      receivesPointer:Boolean(hit&&(hit===el||el.contains(hit))),
    };
  });
}
async function ensureAdminFromStoredSession(page,device){
  const response=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:20_000});
  expect(response?.status(),`${device.name}: current source`).toBe(200);
  const choice=page.locator('.m26-role-choice[role="dialog"][aria-modal="true"]');
  const adminShell=page.locator('.m26-shell[data-m26-role="admin"]');
  await page.waitForFunction(()=>Boolean(
    document.querySelector('.m26-role-choice[role="dialog"][aria-modal="true"]')||
    document.querySelector('.m26-shell[data-m26-role="admin"]')
  ),null,{timeout:30_000});
  if(await choice.isVisible().catch(()=>false)){
    await expect(choice.locator('[data-m26-switch-role="client"]')).toBeVisible();
    const admin=choice.locator('[data-m26-switch-role="admin"]');
    await expect(admin).toBeVisible();
    await expect(choice.locator('[data-m26-switch-role="coach"]'),'Unauthorized Coach app must not be offered on restored session').toHaveCount(0);
    await activate(admin,device.touch);
  }
  await expect(adminShell,`${device.name}: restored authenticated Admin app`).toBeVisible({timeout:30_000});
  await expect(choice).toHaveCount(0,{timeout:10_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});
}
async function certifyAdminSurface(page,device,evidence){
  const contextMetrics=await expectDeviceContext(page,device);
  await expect(page.locator('.m26-shell[data-m26-role="admin"]'),`${device.name}: Admin shell`).toBeVisible({timeout:12_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});
  await expectViewportHealthy(page,device.name);

  let navGeometry=null;
  if(device.mobile&&device.width<=500){
    navGeometry=await mobileNavGeometry(page);
    expect(navGeometry.position,`mobile bottom navigation must stay fixed: ${JSON.stringify(navGeometry)}`).toBe('fixed');
    expect(navGeometry.rect.bottom,'mobile bottom navigation must end inside viewport').toBeLessThanOrEqual(device.height+1);
    expect(navGeometry.rect.top,'mobile bottom navigation must start inside viewport').toBeGreaterThanOrEqual(-1);
    expect(navGeometry.receivesPointer,'mobile bottom navigation must receive pointer').toBe(true);
  }

  await clickNav(page,'admin-clientes',{touch:device.touch});
  const form=page.locator('[data-admin-form="client-create"]');
  await expect(form).toBeVisible({timeout:10_000});
  const name=form.locator('input[name="name"]');
  const email=form.locator('input[name="email"]');
  const sex=form.locator('select[name="sexForNorms"]');
  await name.fill(`QA Admin ${device.name}`);
  await expect(name).toBeFocused();
  await expect(name).toHaveValue(`QA Admin ${device.name}`);
  await email.fill(`qa-admin-${safeSlug(device.name)}@example.invalid`);
  await expect(email).toBeFocused();
  await expect(email).toHaveValue(`qa-admin-${safeSlug(device.name)}@example.invalid`);
  await sex.selectOption('female');
  await expect(sex).toHaveValue('female');
  await expectTouchTarget(name,device.touch,`${device.name}: client name`);
  await expectTouchTarget(sex,device.touch,`${device.name}: client sex`);

  await clickNav(page,'admin-usuarios',{touch:device.touch});
  const search=page.locator('[data-admin-user-search]');
  if(await search.count()){
    await search.fill('qa');await expect(search).toBeFocused();
    await expectTouchTarget(search,device.touch,`${device.name}: user search`);
  }
  const status=page.locator('[data-admin-user-filter="status"]');
  if(await status.count()){
    await status.selectOption(await status.inputValue());
    await expectTouchTarget(status,device.touch,`${device.name}: status filter`);
  }

  const tour=page.locator('[data-m26-guided-tour]').first();
  if(await tour.count()&&await tour.isVisible().catch(()=>false)){
    await expect(tour).toHaveAttribute('role','dialog');
    await expect(tour).toHaveAttribute('aria-modal','false');
    const close=tour.locator('[data-m26-guided-tour-close]');
    await expect(close).toBeVisible();await close.click();
    await expect(page.locator('[data-m26-guided-tour]')).toHaveCount(0,{timeout:5_000});
    evidence.guidedTourClosedBeforeSettings=true;
  }

  if(device.touch&&device.width<=500){
    const more=page.locator('details.m26-mobile-more:visible').first();
    await expect(more,'mobile More must be visible').toBeVisible();
    const summary=more.locator(':scope > summary').first();
    await expectTouchTarget(summary,true,'mobile More');
    const summaryState=await pointerState(summary);
    expect(summaryState.inViewport,`mobile More must remain inside viewport: ${JSON.stringify(summaryState)}`).toBe(true);
    expect(summaryState.receivesPointer,`mobile More must receive pointer: ${JSON.stringify(summaryState)}`).toBe(true);
    if(!await more.evaluate((node)=>node.open))await summary.tap();
    await expect(more).toHaveAttribute('open','');
    await expect(summary).toHaveAttribute('aria-expanded','true');
    await page.keyboard.press('Escape');
    await expect(more).not.toHaveAttribute('open','');
  }else{
    const settings=page.locator('details.m26-settings-menu:visible').first();
    if(await settings.count()){
      const summary=settings.locator(':scope > summary').first();
      if(device.touch)await summary.tap();else await summary.click();
      await expect(settings).toHaveAttribute('open','');
      const target=settings.locator('[data-m26-area="admin-configuracion"]').first();
      await expect(target).toBeVisible();
      await target.scrollIntoViewIfNeeded();
      const hit=await target.evaluate((el)=>{const r=el.getBoundingClientRect();const n=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {hit:n===el||Boolean(el.contains(n)),bottom:r.bottom,height:innerHeight};});
      expect(hit.hit,`${device.name}: settings target receives pointer`).toBe(true);
      expect(hit.bottom,`${device.name}: settings target inside viewport`).toBeLessThanOrEqual(hit.height+1);
      if(device.touch)await target.tap();else await target.click();
    }
  }

  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForTimeout(80);
  await page.evaluate(()=>window.scrollTo(0,0));
  await expectViewportHealthy(page,`${device.name}-after-scroll`);
  evidence.devices.push({name:device.name,width:device.width,height:device.height,touch:device.touch,mobile:device.mobile,contextMetrics,navGeometry,passed:true});
}

test('real QA Admin authenticates with virtual WebAuthn and remains usable across desktop tablet and mobile',async({browser})=>{
  const missing=REQUIRED.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_QA_CLIENT_A_EMAIL||'').toLowerCase()).toBe('qa.rc74.client-a@iberfit.cl');
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);

  const evidence={schema:'iberfit.qa-admin-authenticated-real.v3',candidate:'05ade2e27fcad28feb0fe9b41bf185a37480b73a',projectRef:QA_PROJECT_REF,source:'current-source-intercepted-at-canary-origin',canaryOrigin:CANARY_ORIGIN,authenticated:true,role:'admin',businessMutationsPerformed:false,authMutationPerformed:true,serviceRoleUsed:false,blocked:[],qaRequests:[],authMutations:[],sameOrigin:[],devices:[],appChoice:null,guidedTourClosedBeforeSettings:false,freshDeviceContexts:true};
  const consoleErrors=[];const pageErrors=[];
  let authenticatedState=null;
  let authContext=null;
  let cdp=null;
  let authenticatorId=null;
  try{
    authContext=await browser.newContext({ignoreHTTPSErrors:false,locale:'es-ES',timezoneId:'America/Santiago',serviceWorkers:'block',viewport:{width:1440,height:1000},hasTouch:false,isMobile:false});
    await installNetworkPolicy(authContext,evidence);
    const page=await authContext.newPage();
    attachPageDiagnostics(page,consoleErrors,pageErrors,'auth');
    ({cdp,authenticatorId}=await addVirtualAuthenticator(page));
    const response=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:20_000});
    expect(response?.status()).toBe(200);
    await page.getByRole('textbox',{name:'Correo',exact:true}).fill(process.env.M26_QA_CLIENT_A_EMAIL);
    await page.locator('#m26-login-password').fill(process.env.M26_QA_CLIENT_A_PASSWORD);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await expect(page.locator('#m26-auth-title')).toBeVisible({timeout:20_000});
    const webauthn=page.locator('[data-auth-action="mfa-continue-webauthn"]');
    await expect(webauthn).toBeVisible({timeout:10_000});
    await webauthn.click();

    const choice=page.locator('.m26-role-choice[role="dialog"][aria-modal="true"]');
    await expect(choice,'Multiapp identity must choose an authorized IBERFIT app after WebAuthn').toBeVisible({timeout:30_000});
    const provisionalClient=page.locator('.m26-shell[data-m26-role="client"]');
    await expect(provisionalClient,'Primary Client app remains inert until an app is chosen').toHaveAttribute('inert','');
    await expect(provisionalClient).toHaveAttribute('aria-hidden','true');
    await expect(choice.locator('[data-m26-switch-role="client"]')).toBeVisible();
    const chooseAdmin=choice.locator('[data-m26-switch-role="admin"]');
    await expect(chooseAdmin).toBeVisible();
    await expect(choice.locator('[data-m26-switch-role="coach"]'),'Unauthorized Coach app must not be offered').toHaveCount(0);
    authenticatedState=await authContext.storageState();
    evidence.appChoice={shown:true,authorized:['client','admin'],selected:'admin'};
    await chooseAdmin.click();
    await expect(page.locator('.m26-shell[data-m26-role="admin"]'),'Admin app opens only after explicit choice').toBeVisible({timeout:30_000});
    await expect(choice).toHaveCount(0,{timeout:10_000});
    await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});
  }finally{
    if(cdp&&authenticatorId)await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId}).catch(()=>{});
    if(cdp)await cdp.send('WebAuthn.disable').catch(()=>{});
    if(authContext)await authContext.close().catch(()=>{});
  }

  try{
    expect(authenticatedState,'Authenticated storage state must be captured before device certification').toBeTruthy();
    for(const device of [
      {name:'desktop',width:1440,height:1000,mobile:false,touch:false},
      {name:'tablet',width:1024,height:1366,mobile:true,touch:true},
      {name:'mobile',width:390,height:844,mobile:true,touch:true},
    ]){
      const deviceContext=await browser.newContext({
        ignoreHTTPSErrors:false,locale:'es-ES',timezoneId:'America/Santiago',serviceWorkers:'block',
        viewport:{width:device.width,height:device.height},hasTouch:device.touch,isMobile:device.mobile,
        storageState:authenticatedState,
      });
      try{
        await installNetworkPolicy(deviceContext,evidence);
        const page=await deviceContext.newPage();
        attachPageDiagnostics(page,consoleErrors,pageErrors,device.name);
        await ensureAdminFromStoredSession(page,device);
        await certifyAdminSurface(page,device,evidence);
      }finally{
        await deviceContext.close().catch(()=>{});
      }
    }

    expect(evidence.blocked,'No foreign or business-mutation request may escape the QA gate').toEqual([]);
    expect(evidence.authMutations.length,'WebAuthn must be exercised against the real QA Edge').toBeGreaterThanOrEqual(2);
    expect(consoleErrors,'Admin real QA console errors').toEqual([]);
    expect(pageErrors,'Admin real QA page errors').toEqual([]);
  }finally{
    await fs.mkdir(OUT_DIR,{recursive:true});
    await fs.writeFile(path.join(OUT_DIR,'evidence.json'),JSON.stringify({...evidence,qaRequests:[...new Set(evidence.qaRequests)].slice(0,160),sameOriginRequestCount:evidence.sameOrigin.length,consoleErrors,pageErrors},null,2)+'\n','utf8');
  }
});
