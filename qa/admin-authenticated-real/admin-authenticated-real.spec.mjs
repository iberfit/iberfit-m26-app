import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const SUPABASE_ORIGIN=`https://${QA_PROJECT_REF}.supabase.co`;
const BUILD_ROOT=path.resolve('.tmp/rc64-current-surface');
const OUT_DIR=path.resolve('recovery/admin-authenticated-real');

const REQUIRED=[
  'M26_SUPABASE_URL',
  'M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_PROJECT_REF',
  'M26_QA_ONLY',
  'M26_QA_CLIENT_A_EMAIL',
  'M26_QA_CLIENT_A_PASSWORD',
];

const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26',
  'iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13',
  'iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d',
  'iberfit_admin_bootstrap_v14',
  'iberfit_communication_bootstrap_v14',
  'm26_backend_bootstrap_v43',
  'm26_wearable_bootstrap_v44',
  'iberfit_exercise_catalog_public_v1',
  'iberfit_exercise_media_manifest_v1',
]);

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
function safeSlug(value){return String(value||'unknown').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,80)||'unknown';}
function requestLabel(request){
  try{
    const url=new URL(request.url());
    return `${request.method().toUpperCase()} ${url.origin} ${url.pathname}`;
  }catch{return 'INVALID_REQUEST';}
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
    await route.fulfill({status:404,body:'Not found'});
  }
}
async function installNetworkPolicy(context,evidence){
  await context.route('**/*',async(route)=>{
    const request=route.request();
    let url;
    try{url=new URL(request.url());}catch{
      evidence.blocked.push('INVALID_URL');
      await route.abort('blockedbyclient');
      return;
    }
    if(url.origin===CANARY_ORIGIN){
      evidence.sameOrigin.push(requestLabel(request));
      await fulfillCurrentSource(route,url);
      return;
    }
    if(allowedQaRequest(request)){
      const label=requestLabel(request);
      evidence.qaRequests.push(label);
      if(
        request.method().toUpperCase()==='POST'&&
        url.pathname==='/functions/v1/iberfit-webauthn-v1'
      )evidence.authMutations.push(label);
      await route.continue();
      return;
    }
    evidence.blocked.push(requestLabel(request));
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
async function setDevice(page,cdp,{name,width,height,mobile,touch}){
  await page.setViewportSize({width,height});
  await cdp.send('Emulation.setDeviceMetricsOverride',{
    width,height,deviceScaleFactor:1,mobile:Boolean(mobile),
    screenWidth:width,screenHeight:height,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled',{
    enabled:Boolean(touch),
    maxTouchPoints:touch?5:1,
  });
  const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,maxTouchPoints:navigator.maxTouchPoints}));
  expect(metrics.width,`${name}: viewport width`).toBe(width);
  expect(metrics.height,`${name}: viewport height`).toBe(height);
  if(touch)expect(metrics.maxTouchPoints,`${name}: touch emulation`).toBeGreaterThan(0);
  return Object.freeze({name,width,height,mobile:Boolean(mobile),touch:Boolean(touch)});
}
async function clickNav(page,area,{touch=false}={}){
  const direct=page.locator(`[data-m26-area="${area}"]:visible`).first();
  if(await direct.count()&&await direct.isVisible().catch(()=>false)){
    if(touch)await direct.tap(); else await direct.click();
    return;
  }
  const more=page.locator('details.m26-mobile-more:visible').first();
  await expect(more,`Admin responsive navigation must expose ${area}`).toBeVisible();
  const summary=more.locator(':scope > summary').first();
  if(touch)await summary.tap(); else await summary.click();
  await expect(more).toHaveAttribute('open','');
  const target=more.locator(`[data-m26-area="${area}"]:visible`).first();
  await expect(target).toBeVisible();
  if(touch)await target.tap(); else await target.click();
}
async function expectViewportHealthy(page,label){
  const metrics=await page.evaluate(()=>({
    innerWidth,
    bodyScrollWidth:document.body.scrollWidth,
    docScrollWidth:document.documentElement.scrollWidth,
    bodyScrollHeight:document.body.scrollHeight,
    docScrollHeight:document.documentElement.scrollHeight,
  }));
  expect(
    Math.max(metrics.bodyScrollWidth,metrics.docScrollWidth),
    `${label}: no horizontal overflow`,
  ).toBeLessThanOrEqual(metrics.innerWidth+2);
}
async function expectTouchTarget(locator,touch,label){
  if(!touch)return;
  const metrics=await locator.evaluate((node)=>{
    const rect=node.getBoundingClientRect();
    return {width:rect.width,height:rect.height,fontSize:parseFloat(getComputedStyle(node).fontSize)};
  });
  expect(metrics.height,`${label}: touch height`).toBeGreaterThanOrEqual(44);
  expect(metrics.width,`${label}: touch width`).toBeGreaterThanOrEqual(44);
}
async function certifyAdminSurface(page,cdp,device,evidence){
  await setDevice(page,cdp,device);
  await page.waitForTimeout(180);
  const shell=page.locator('.m26-shell[data-m26-role="admin"]');
  await expect(shell,`${device.name}: authenticated Admin shell`).toBeVisible({timeout:12_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});
  await expectViewportHealthy(page,device.name);

  await clickNav(page,'admin-clientes',{touch:device.touch});
  await expect(page.locator('[data-admin-form="client-create"]')).toBeVisible({timeout:10_000});
  const clientForm=page.locator('[data-admin-form="client-create"]');
  const name=clientForm.locator('input[name="name"]');
  const email=clientForm.locator('input[name="email"]');
  await name.fill(`QA Admin ${device.name}`);
  await expect(name).toBeFocused();
  await expect(name).toHaveValue(`QA Admin ${device.name}`);
  await email.fill(`qa-admin-${safeSlug(device.name)}@example.invalid`);
  await expect(email).toBeFocused();
  await expect(email).toHaveValue(`qa-admin-${safeSlug(device.name)}@example.invalid`);
  const sex=clientForm.locator('select[name="sexForNorms"]');
  await sex.selectOption('female');
  await expect(sex).toHaveValue('female');
  await expectTouchTarget(name,device.touch,`${device.name}: client name`);
  await expectTouchTarget(sex,device.touch,`${device.name}: client sex select`);

  await clickNav(page,'admin-usuarios',{touch:device.touch});
  const search=page.locator('[data-admin-user-search]');
  if(await search.count()){
    await search.fill('qa');
    await expect(search).toBeFocused();
    await expectTouchTarget(search,device.touch,`${device.name}: user search`);
  }
  const status=page.locator('[data-admin-user-filter="status"]');
  if(await status.count()){
    const current=await status.inputValue();
    await status.selectOption(current);
    await expectTouchTarget(status,device.touch,`${device.name}: status filter`);
  }

  const guidedTour=page.locator('[data-m26-guided-tour]').first();
  if(await guidedTour.count()&&await guidedTour.isVisible().catch(()=>false)){
    await expect(guidedTour).toHaveAttribute('role','dialog');
    await expect(guidedTour,'IBERFIT guide is deliberately non-modal').toHaveAttribute('aria-modal','false');
    const closeGuide=guidedTour.locator('[data-m26-guided-tour-close]');
    await expect(closeGuide).toBeVisible();
    await closeGuide.click();
    await expect(page.locator('[data-m26-guided-tour]')).toHaveCount(0,{timeout:5_000});
    evidence.guidedTourClosedBeforeSettings=true;
  }

  if(device.touch&&device.width<=500){
    const more=page.locator('details.m26-mobile-more:visible').first();
    await expect(more).toBeVisible();
    const summary=more.locator(':scope > summary').first();
    await expectTouchTarget(summary,true,'mobile More');
    await summary.tap();
    await expect(more).toHaveAttribute('open','');
    await expect(summary).toHaveAttribute('aria-expanded','true');
    await page.keyboard.press('Escape');
    await expect(more).not.toHaveAttribute('open','');
  }else{
    const settings=page.locator('details.m26-settings-menu:visible').first();
    if(await settings.count()){
      const summary=settings.locator(':scope > summary').first();
      await expect(summary).toBeVisible();
      if(device.touch)await summary.tap();else await summary.click();
      await expect(settings).toHaveAttribute('open','');
      const target=settings.locator('[data-m26-area="admin-configuracion"]').first();
      await expect(target).toBeVisible();
      await target.scrollIntoViewIfNeeded();
      const hit=await target.evaluate((el)=>{
        const r=el.getBoundingClientRect();
        const n=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
        return {hit:n===el||Boolean(el.contains(n)),bottom:r.bottom,height:innerHeight};
      });
      expect(hit.hit,`${device.name}: settings target receives pointer`).toBe(true);
      expect(hit.bottom,`${device.name}: settings target inside viewport`).toBeLessThanOrEqual(hit.height+1);
      if(device.touch)await target.tap();else await target.click();
    }
  }

  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForTimeout(80);
  await page.evaluate(()=>window.scrollTo(0,0));
  await expectViewportHealthy(page,`${device.name}-after-scroll`);
  evidence.devices.push({name:device.name,width:device.width,height:device.height,touch:device.touch,passed:true});
}

test('real QA Admin authenticates with virtual WebAuthn and remains usable across desktop tablet and mobile',async({browser})=>{
  const missing=REQUIRED.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_QA_CLIENT_A_EMAIL||'').toLowerCase()).toBe('qa.rc74.client-a@iberfit.cl');
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);

  const evidence={
    schema:'iberfit.qa-admin-authenticated-real.v1',
    projectRef:QA_PROJECT_REF,
    source:'current-source-intercepted-at-canary-origin',
    canaryOrigin:CANARY_ORIGIN,
    authenticated:true,
    role:'admin',
    businessMutationsPerformed:false,
    authMutationPerformed:true,
    serviceRoleUsed:false,
    blocked:[],
    qaRequests:[],
    authMutations:[],
    sameOrigin:[],
    devices:[],
    appChoice:null,
    guidedTourClosedBeforeSettings:false,
  };

  const context=await browser.newContext({
    ignoreHTTPSErrors:false,
    locale:'es-ES',
    timezoneId:'America/Santiago',
    serviceWorkers:'block',
    viewport:{width:1440,height:1000},
    hasTouch:true,
  });
  await installNetworkPolicy(context,evidence);
  const page=await context.newPage();
  const consoleErrors=[];
  const pageErrors=[];
  page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,500));});
  page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,500)));

  const {cdp,authenticatorId}=await addVirtualAuthenticator(page);
  try{
    await setDevice(page,cdp,{name:'desktop',width:1440,height:1000,mobile:false,touch:false});
    const response=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:20_000});
    expect(response?.status()).toBe(200);

    await page.getByRole('textbox',{name:'Correo',exact:true}).fill(process.env.M26_QA_CLIENT_A_EMAIL);
    await page.locator('#m26-login-password').fill(process.env.M26_QA_CLIENT_A_PASSWORD);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();

    await expect(page.locator('#m26-auth-title')).toBeVisible({timeout:20_000});
    await expect(page.locator('[data-auth-action="mfa-continue-webauthn"]')).toBeVisible({timeout:10_000});
    await page.locator('[data-auth-action="mfa-continue-webauthn"]').click();

    const roleChoice=page.locator('.m26-role-choice[role="dialog"][aria-modal="true"]');
    await expect(roleChoice,'Multiapp identity must choose an authorized IBERFIT app after WebAuthn').toBeVisible({timeout:30_000});
    const provisionalClientShell=page.locator('.m26-shell[data-m26-role="client"]');
    await expect(provisionalClientShell,'Primary Client app remains inert until an app is chosen').toHaveAttribute('inert','');
    await expect(provisionalClientShell).toHaveAttribute('aria-hidden','true');
    const chooseClient=roleChoice.locator('[data-m26-switch-role="client"]');
    const chooseAdmin=roleChoice.locator('[data-m26-switch-role="admin"]');
    await expect(chooseClient).toBeVisible();
    await expect(chooseAdmin).toBeVisible();
    await expect(roleChoice.locator('[data-m26-switch-role="coach"]'),'Unauthorized Coach app must not be offered').toHaveCount(0);
    evidence.appChoice={shown:true,authorized:['client','admin'],selected:'admin'};
    await chooseAdmin.click();

    const adminShell=page.locator('.m26-shell[data-m26-role="admin"]');
    await expect(adminShell,'Admin app opens only after the person chooses Admin').toBeVisible({timeout:30_000});
    await expect(roleChoice).toHaveCount(0,{timeout:10_000});
    await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});

    const devices=[
      {name:'desktop',width:1440,height:1000,mobile:false,touch:false},
      {name:'tablet',width:1024,height:1366,mobile:true,touch:true},
      {name:'mobile',width:390,height:844,mobile:true,touch:true},
    ];
    for(const device of devices)await certifyAdminSurface(page,cdp,device,evidence);

    expect(evidence.blocked,'No foreign or business-mutation request may escape the QA gate').toEqual([]);
    expect(evidence.authMutations.length,'WebAuthn must be exercised against the real QA Edge').toBeGreaterThanOrEqual(2);
    expect(consoleErrors,'Admin real QA console errors').toEqual([]);
    expect(pageErrors,'Admin real QA page errors').toEqual([]);
  }finally{
    await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId}).catch(()=>{});
    await cdp.send('WebAuthn.disable').catch(()=>{});
    await context.close().catch(()=>{});
    await fs.mkdir(OUT_DIR,{recursive:true});
    await fs.writeFile(
      path.join(OUT_DIR,'evidence.json'),
      JSON.stringify({
        ...evidence,
        qaRequests:[...new Set(evidence.qaRequests)].slice(0,120),
        sameOriginRequestCount:evidence.sameOrigin.length,
        consoleErrors,
        pageErrors,
      },null,2)+'\n',
      'utf8',
    );
  }
});