import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {
  CANARY_ORIGIN,
  QA_PROJECT_REF,
  SUPABASE_ORIGIN,
  completeClientWebAuthnChoice,
  installCurrentSourceQaNetworkPolicy,
  qaRequestLabel,
} from './secure-current-source-auth.mjs';

const ASSURANCE_PATH='/rest/v1/rpc/iberfit_privileged_assurance_context_v65d';
const OPTIONAL_APPOINTMENT_READ_PATH='/rest/v1/rpc/iberfit_appointment_change_requests_v13';
const AUTH_FLOW_TIMEOUT_MS=30_000;
const required=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
];
const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26',
  'iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13',
  'iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d',
  'iberfit_communication_bootstrap_v14',
  'm26_backend_bootstrap_v43',
  'm26_wearable_bootstrap_v44',
  'iberfit_exercise_catalog_public_v1',
  'iberfit_exercise_media_manifest_v1',
]);

async function readAssurance(response){
  expect(response.status(),'Assurance RPC must answer successfully').toBe(200);
  const payload=await response.json();
  expect(payload&&typeof payload==='object').toBeTruthy();
  return payload;
}

async function dismissGuidance(page){
  const welcome=page.locator('[data-m26-client-guided-welcome]');
  await welcome.waitFor({state:'visible',timeout:3_000}).catch(()=>{});
  if(await welcome.isVisible().catch(()=>false)){
    const pause=page.locator('[data-m26-client-guided-welcome-pause]').first();
    if(await pause.count())await pause.click();
  }
  const tour=page.locator('[data-m26-guided-tour]');
  if(await tour.count()){
    const close=tour.locator('[data-m26-guided-tour-close]').first();
    if(await close.count())await close.click();
  }
}

async function verifyClientWorkspace(page,{projectName,browserName}){
  const shell=page.locator('.m26-shell[data-m26-role="client"]');
  await expect(shell).toBeVisible({timeout:10_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});
  await expect(
    page.locator('[data-m26-action="logout"]'),
    'Authenticated Client must retain a semantic logout action even when session controls live inside Settings',
  ).toHaveCount(1,{timeout:5_000});
  await dismissGuidance(page);

  const visibleNavigationTarget=page.locator(
    '.m26-client-bottom-nav [data-m26-area]:not([aria-current="page"]):not([disabled]):visible, .m26-mobile-nav [data-m26-area]:not([aria-current="page"]):not([disabled]):visible, .m26-sidebar [data-m26-area]:not([aria-current="page"]):not([disabled]):visible',
  ).first();
  await expect(visibleNavigationTarget,'Authenticated workspace must expose a visible enabled navigation target').toBeVisible({timeout:5_000});
  const targetArea=await visibleNavigationTarget.getAttribute('data-m26-area');
  expect(targetArea).toBeTruthy();
  await visibleNavigationTarget.click({timeout:5_000});
  await expect(
    page.locator(`.m26-client-bottom-nav [data-m26-area="${targetArea}"][aria-current="page"]:visible, .m26-mobile-nav [data-m26-area="${targetArea}"][aria-current="page"]:visible, .m26-sidebar [data-m26-area="${targetArea}"][aria-current="page"]:visible`).first(),
  ).toBeVisible({timeout:5_000});

  const settingsSummary=page.locator('details.m26-settings-menu > summary').first();
  const settingsSummaryVisible=await settingsSummary.count()&&await settingsSummary.isVisible().catch(()=>false);
  let settingsMenu=null;
  if(settingsSummaryVisible){
    await settingsSummary.click({timeout:5_000});
    settingsMenu=page.locator('details.m26-settings-menu').first();
    await expect(settingsMenu).toHaveAttribute('open','',{timeout:5_000});
  }else{
    const clientMore=page.locator('.m26-client-bottom-nav-more > summary:visible').first();
    await expect(clientMore,'Compact Client layouts must expose Settings through More').toBeVisible({timeout:5_000});
    await clientMore.click({timeout:5_000});
    const settingsRouteAction=page.locator('.m26-client-bottom-nav-menu [data-m26-area="ajustes"]:visible').first();
    await expect(settingsRouteAction).toBeVisible({timeout:5_000});
    await settingsRouteAction.click({timeout:5_000});
    await expect(page.locator('[data-client-bottom-nav-route="ajustes"]')).toHaveCount(1,{timeout:5_000});
  }

  const localeSelector=page.locator('[data-m26-ui-locale]:visible').first();
  await expect(localeSelector,'Visible locale selector must remain usable').toBeVisible({timeout:5_000});
  await expect(localeSelector).toBeEnabled({timeout:5_000});
  await localeSelector.focus();
  const originalLocale=await localeSelector.inputValue();
  const localeOptions=await localeSelector.locator('option').evaluateAll((options)=>options.map((option)=>String(option.value||'')).filter(Boolean));
  expect(localeOptions.length).toBeGreaterThan(1);
  const alternateLocale=localeOptions.find((value)=>value!==originalLocale);
  expect(alternateLocale).toBeTruthy();
  await localeSelector.selectOption(alternateLocale);
  const updatedLocaleSelector=page.locator('[data-m26-ui-locale]:visible').first();
  if(settingsMenu)await expect(settingsMenu).toHaveAttribute('open','',{timeout:5_000});
  else await expect(page.locator('[data-client-bottom-nav-route="ajustes"]')).toHaveCount(1,{timeout:5_000});
  await expect(updatedLocaleSelector).toHaveValue(alternateLocale,{timeout:5_000});
  await expect(updatedLocaleSelector).toBeFocused({timeout:5_000});
  await updatedLocaleSelector.selectOption(originalLocale);
  const restoredLocaleSelector=page.locator('[data-m26-ui-locale]:visible').first();
  await expect(restoredLocaleSelector).toHaveValue(originalLocale,{timeout:5_000});
  await expect(restoredLocaleSelector).toBeFocused({timeout:5_000});

  if(projectName==='authenticated-readonly-tablet-chromium'){
    const grid=page.locator('.m26-stat-grid:visible').first();
    if(await grid.count()){
      const columns=await grid.evaluate((element)=>getComputedStyle(element).gridTemplateColumns.split(/\s+/u).filter(Boolean).length);
      expect(columns,'Portrait tablet metric grid must use two readable columns').toBe(2);
    }
  }
  if(projectName==='authenticated-readonly-tablet-landscape-chromium'){
    const grid=page.locator('.m26-stat-grid:visible').first();
    if(await grid.count()){
      const columns=await grid.evaluate((element)=>getComputedStyle(element).gridTemplateColumns.split(/\s+/u).filter(Boolean).length);
      expect(columns,'Landscape tablet metric grid should preserve four-column density').toBe(4);
    }
  }

  const eventLoopDelay=await page.evaluate(()=>new Promise((resolve)=>{
    const started=performance.now();
    setTimeout(()=>resolve(Math.max(0,performance.now()-started)),0);
  }));
  expect(Number(eventLoopDelay),browserName==='chromium'?'Authenticated workspace must remain responsive under Chromium':'Authenticated workspace must remain responsive').toBeLessThan(1_500);

  const quality=await page.evaluate(async()=>{
    const collector=await globalThis.__IBERFIT_M26_QUALITY_OBSERVABILITY_READY__;
    return collector?.snapshot?.()||null;
  });
  expect(quality?.schemaVersion).toBe('iberfit.quality-runtime-observability.v1');
  expect(quality?.storage).toBe('memory-only');
  expect(quality?.transport).toBe('none');
  expect(quality?.identityIncluded).toBe(false);
  expect(quality?.healthDataIncluded).toBe(false);
}

test('current multiapp WebAuthn contract authenticates QA Coach and Client without business mutations',async({browser,browserName},testInfo)=>{
  const missing=required.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);

  const accounts=[
    {name:'coach',role:'coach',expectedEmail:'qa.rc74.coach@iberfit.cl',email:process.env.M26_QA_COACH_EMAIL,password:process.env.M26_QA_COACH_PASSWORD},
    {name:'client_a',role:'client',expectedEmail:'qa.rc74.client-a@iberfit.cl',email:process.env.M26_QA_CLIENT_A_EMAIL,password:process.env.M26_QA_CLIENT_A_PASSWORD},
  ];
  const evidenceRoles=[];
  const projectUse=testInfo.project.use||{};
  const projectName=String(testInfo.project.name||'');
  const chromiumEngine=browserName==='chromium';
  const touchProfile=/tablet|mobile/iu.test(projectName);
  const cpuThrottleRate=chromiumEngine?(touchProfile?6:3):1;

  for(const account of accounts){
    expect(String(account.email||'').toLowerCase()).toBe(account.expectedEmail);
    expect(String(account.password||'').length).toBeGreaterThanOrEqual(8);
    const context=await browser.newContext({
      baseURL:CANARY_ORIGIN,
      locale:'es-ES',
      timezoneId:'America/Santiago',
      serviceWorkers:'block',
      viewport:projectUse.viewport,
      hasTouch:Boolean(projectUse.hasTouch),
      isMobile:Boolean(projectUse.isMobile),
    });
    const blocked=[];
    const externalFailures=[];
    const optionalReadFailures=[];
    const consoleErrors=[];
    const pageErrors=[];
    const qaRequests=[];
    await installCurrentSourceQaNetworkPolicy(context,{
      readOnlyRpcs:READ_ONLY_RPCS,
      onBlocked:(label)=>blocked.push(label),
      onQaRequest:(label)=>qaRequests.push(label),
    });
    const page=await context.newPage();
    if(chromiumEngine){
      const cdp=await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpuThrottleRate});
    }
    page.on('requestfailed',(request)=>{
      const label=qaRequestLabel(request);
      if(blocked.includes(label))return;
      try{
        const url=new URL(request.url());
        if(url.origin===SUPABASE_ORIGIN&&request.method().toUpperCase()==='POST'&&url.pathname===OPTIONAL_APPOINTMENT_READ_PATH)optionalReadFailures.push(label);
        else externalFailures.push(label);
      }catch{externalFailures.push('INVALID_FAILED_REQUEST');}
    });
    page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,500));});
    page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,500)));

    try{
      console.log(`RC64_CURRENT_MULTIAPP_ACCOUNT_BEGIN:${account.name}`);
      const navigation=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:20_000});
      expect(navigation?.ok()).toBeTruthy();
      await page.getByRole('textbox',{name:'Correo',exact:true}).fill(account.email);
      await page.locator('#m26-login-password').fill(account.password);
      const assurancePromise=page.waitForResponse((response)=>{
        try{const url=new URL(response.url());return url.origin===SUPABASE_ORIGIN&&url.pathname===ASSURANCE_PATH;}catch{return false;}
      },{timeout:AUTH_FLOW_TIMEOUT_MS});
      await page.getByRole('button',{name:'Entrar',exact:true}).click();
      const assurance=await readAssurance(await assurancePromise);
      expect(assurance.mfaRequired).toBe(true);
      expect(assurance.webauthnRequired).toBe(true);
      expect(assurance.iberfitAssurance).not.toBe('verified');

      const shell=page.locator(`.m26-shell[data-m26-role="${account.role}"]`);
      const canCompleteWebAuthn=chromiumEngine&&account.role==='client';
      if(!canCompleteWebAuthn){
        await expect(shell,'Privileged shell must remain unavailable before WebAuthn').toHaveCount(0,{timeout:5_000});
        await expect(page.locator('#m26-auth-title')).toBeVisible({timeout:5_000});
        await expect(page.locator('[data-auth-action="mfa-continue-webauthn"]')).toBeVisible({timeout:5_000});
      }else{
        const auth=await completeClientWebAuthnChoice(page,{role:'client'});
        expect(auth.authorizedRoles).toEqual(['client','admin']);
        expect(auth.selectedRole).toBe('client');
        await verifyClientWorkspace(page,{projectName,browserName});
      }

      expect(blocked,'Authenticated startup attempted a business mutation or foreign request').toEqual([]);
      expect(externalFailures,'Critical authenticated requests must not fail').toEqual([]);
      expect(optionalReadFailures.length).toBeLessThanOrEqual(1);
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      if(canCompleteWebAuthn)expect(qaRequests.some((label)=>label.includes('/functions/v1/iberfit-webauthn-v1'))).toBe(true);

      evidenceRoles.push({
        role:account.role,
        authenticated:true,
        privilegedGate:'webauthn-required',
        browserEngine:browserName,
        cpuThrottleRate,
        cpuThrottled:chromiumEngine,
        touchProfile,
        mfaCompleted:canCompleteWebAuthn,
        applicationChoice:canCompleteWebAuthn?'client':null,
        interactionVerified:canCompleteWebAuthn,
        assurance:{
          privileged:assurance.privileged===true,
          mfaRequired:assurance.mfaRequired===true,
          webauthnRequired:assurance.webauthnRequired===true,
          iberfitAssurance:String(assurance.iberfitAssurance||''),
        },
        blockedRequests:0,
        externalRequestFailures:0,
        optionalReadFailures:optionalReadFailures.length,
      });
      console.log(`RC64_CURRENT_MULTIAPP_ACCOUNT_PASS:${account.name}`);
    }finally{
      await context.close().catch(()=>{});
    }
  }

  const evidence={
    schema:'iberfit.rc64.2b.authenticated-current-contract.v4',
    source:'current-source-intercepted-at-canary-origin',
    projectRef:QA_PROJECT_REF,
    mode:'authenticated-browser-multiapp',
    mutationsPerformed:false,
    businessMutationsPerformed:false,
    authMutationPerformed:chromiumEngine,
    identityPersisted:false,
    healthDataPersisted:false,
    credentialsPersisted:false,
    roles:evidenceRoles,
  };
  await mkdir('recovery',{recursive:true});
  await writeFile('recovery/RC64_2B_AUTHENTICATED_SMOKE.json',`${JSON.stringify(evidence,null,2)}\n`,'utf8');
});