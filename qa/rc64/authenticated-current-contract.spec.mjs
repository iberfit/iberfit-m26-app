import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const LOCAL_ORIGIN='http://127.0.0.1:4196';
const PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const SUPABASE_ORIGIN=`https://${PROJECT_REF}.supabase.co`;
const ASSURANCE_PATH='/rest/v1/rpc/iberfit_privileged_assurance_context_v65d';
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

function allowedExternalRequest(request){
  const url=new URL(request.url());
  const method=request.method().toUpperCase();
  if(url.origin!==SUPABASE_ORIGIN)return false;

  if(
    method==='POST'&&
    url.pathname==='/auth/v1/token'&&
    url.searchParams.get('grant_type')==='password'
  )return true;

  if(method==='GET'&&url.pathname==='/auth/v1/user')return true;
  if(method==='GET'&&url.pathname==='/rest/v1/domain_command_registry_v26')return true;

  const rpcPrefix='/rest/v1/rpc/';
  if(method==='POST'&&url.pathname.startsWith(rpcPrefix)){
    return READ_ONLY_RPCS.has(url.pathname.slice(rpcPrefix.length));
  }

  return false;
}

function safeRequestLabel(request){
  try{
    const url=new URL(request.url());
    const origin=url.origin===SUPABASE_ORIGIN?'qa-supabase':url.origin===LOCAL_ORIGIN?'local':'external';
    return `${request.method().toUpperCase()} ${origin} ${url.pathname.slice(0,160)}`;
  }catch{
    return 'INVALID_REQUEST';
  }
}

async function readAssurance(response){
  expect(response.status(),'Assurance RPC must answer successfully').toBe(200);
  const payload=await response.json();
  expect(payload&&typeof payload==='object').toBeTruthy();
  return payload;
}

test('RC64.2B current WebAuthn contract authenticates QA Coach and Client without mutations',async({browser},testInfo)=>{
  const missing=required.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);

  const accounts=[
    {
      name:'coach',
      role:'coach',
      expectedEmail:'qa.rc74.coach@iberfit.cl',
      email:process.env.M26_QA_COACH_EMAIL,
      password:process.env.M26_QA_COACH_PASSWORD,
    },
    {
      name:'client_a',
      role:'client',
      expectedEmail:'qa.rc74.client-a@iberfit.cl',
      email:process.env.M26_QA_CLIENT_A_EMAIL,
      password:process.env.M26_QA_CLIENT_A_PASSWORD,
    },
  ];

  const evidenceRoles=[];

  for(const account of accounts){
    expect(String(account.email||'').toLowerCase()).toBe(account.expectedEmail);
    expect(String(account.password||'').length).toBeGreaterThanOrEqual(8);

    const context=await browser.newContext({
      baseURL:LOCAL_ORIGIN,
      locale:'es-ES',
      timezoneId:'America/Santiago',
      serviceWorkers:'block',
    });

    const blockedRequests=[];
    const externalRequestFailures=[];
    const consoleErrors=[];
    const pageErrors=[];

    await context.route('**/*',async(route)=>{
      const request=route.request();
      let url;
      try{url=new URL(request.url());}
      catch{
        blockedRequests.push('INVALID_URL');
        await route.abort('blockedbyclient');
        return;
      }

      if(url.origin===LOCAL_ORIGIN||allowedExternalRequest(request)){
        await route.continue();
        return;
      }

      blockedRequests.push(safeRequestLabel(request));
      await route.abort('blockedbyclient');
    });

    const page=await context.newPage();
    const projectName=String(testInfo.project.name||'');
    const touchProfile=/tablet|mobile/iu.test(projectName);
    const cpuThrottleRate=touchProfile?6:3;
    const cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpuThrottleRate});

    page.on('requestfailed',(request)=>{
      try{
        const url=new URL(request.url());
        if(url.origin!==LOCAL_ORIGIN&&!blockedRequests.includes(safeRequestLabel(request))){
          externalRequestFailures.push(safeRequestLabel(request));
        }
      }catch{
        externalRequestFailures.push('INVALID_FAILED_REQUEST');
      }
    });
    page.on('console',(message)=>{
      if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,500));
    });
    page.on('pageerror',(error)=>{
      pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,500));
    });

    try{
      console.log(`RC64_2B_CURRENT_ACCOUNT_BEGIN:${account.name}`);
      const navigation=await page.goto('/',{waitUntil:'networkidle',timeout:15_000});
      expect(navigation?.ok()).toBeTruthy();

      await page.getByRole('textbox',{name:'Correo',exact:true}).fill(account.email);
      await page.locator('#m26-login-password').fill(account.password);

      const assuranceResponsePromise=page.waitForResponse(
        (response)=>{
          try{
            const url=new URL(response.url());
            return url.origin===SUPABASE_ORIGIN&&url.pathname===ASSURANCE_PATH;
          }catch{return false;}
        },
        {timeout:AUTH_FLOW_TIMEOUT_MS},
      );

      await page.getByRole('button',{name:'Entrar',exact:true}).click();
      const assurance=await readAssurance(await assuranceResponsePromise);

      const shell=page.locator(`.m26-shell[data-m26-role="${account.role}"]`);
      if(account.role==='coach'){
        expect(assurance.privileged).toBe(true);
        expect(assurance.mfaRequired).toBe(true);
        expect(assurance.webauthnRequired).toBe(true);
        expect(assurance.iberfitAssurance).not.toBe('verified');
        await expect(
          shell,
          'Privileged Coach shell must remain unavailable until IBERFIT WebAuthn assurance is verified',
        ).toHaveCount(0,{timeout:5_000});
        await expect(
          page.locator('#m26-auth-title'),
          'Coach must stop at the fail-closed WebAuthn gate before privileged bootstrap',
        ).toBeVisible({timeout:5_000});
        await expect(
          page.locator('[data-auth-action="mfa-continue-webauthn"]'),
          'Coach WebAuthn gate must expose the same-device verification action',
        ).toBeVisible({timeout:5_000});
        expect(
          assurance.emailOtpAvailable,
          'Local QA origin must remain outside the privileged email-assurance allowlist',
        ).toBe(false);
        await expect(
          page.locator('[data-auth-action="mfa-send-email-code"]'),
          'Untrusted/local origins must not expose the privileged email-code fallback',
        ).toHaveCount(0,{timeout:5_000});
      }else{
        expect(assurance.mfaRequired).toBe(false);
        await expect(
          shell,
          `Authenticated ${account.name} shell must render when no privileged WebAuthn gate is required`,
        ).toHaveCount(1,{timeout:25_000});
        await expect(shell).toBeVisible({timeout:5_000});
        await expect(
          page.locator('[data-m26-action="logout"]'),
          'Authenticated client must retain a semantic logout action even when session controls live inside Settings',
        ).toHaveCount(1,{timeout:5_000});

        await expect(
          page.locator('[data-m26-interactive="ready"]'),
          'Authenticated workspace must declare interaction readiness before optional controllers finish mounting',
        ).toHaveCount(1,{timeout:5_000});

        const targetAreaButton=page.locator('[data-m26-area]:not([aria-current="page"]):not([disabled]):visible').first();
        await expect(targetAreaButton,'Authenticated workspace must expose at least one visible enabled navigation target for the active responsive layout').toBeVisible({timeout:5_000});
        const targetArea=await targetAreaButton.getAttribute('data-m26-area');
        expect(targetArea).toBeTruthy();
        await targetAreaButton.click({timeout:5_000});
        await expect(
          page.locator(`[data-m26-area="${targetArea}"][aria-current="page"]:visible`).first(),
          'Navigation click must remain responsive on the visible desktop/tablet/mobile navigation surface while post-auth controllers mount progressively',
        ).toBeVisible({timeout:5_000});

        const settingsSummary=page.locator('details.m26-settings-menu > summary').first();
        if(await settingsSummary.count()){
          await settingsSummary.click({timeout:5_000});
          const settingsMenu=page.locator('details.m26-settings-menu').first();
          await expect(
            settingsMenu,
            'Native settings control must accept pointer/touch interaction after login',
          ).toHaveAttribute('open','',{timeout:5_000});

          const localeSelector=page.locator('[data-m26-ui-locale]').first();
          await expect(
            localeSelector,
            'Native locale selector must remain usable while authenticated controllers continue mounting',
          ).toBeVisible({timeout:5_000});
          await expect(localeSelector).toBeEnabled({timeout:5_000});
          await localeSelector.focus();
          const originalLocale=await localeSelector.inputValue();
          const localeOptions=await localeSelector.locator('option').evaluateAll((options)=>
            options.map((option)=>String(option.value||'')).filter(Boolean)
          );
          expect(localeOptions.length,'Locale selector must expose more than one real option for interaction QA').toBeGreaterThan(1);
          const alternateLocale=localeOptions.find((value)=>value!==originalLocale);
          expect(alternateLocale).toBeTruthy();

          await localeSelector.selectOption(alternateLocale);
          const updatedLocaleSelector=page.locator('[data-m26-ui-locale]').first();
          await expect(
            settingsMenu,
            'Changing a native selector must not collapse Settings or eject the user',
          ).toHaveAttribute('open','',{timeout:5_000});
          await expect(updatedLocaleSelector).toHaveValue(alternateLocale,{timeout:5_000});
          await expect(
            updatedLocaleSelector,
            'Shell rerender must restore focus to the replacement native selector',
          ).toBeFocused({timeout:5_000});

          await updatedLocaleSelector.selectOption(originalLocale);
          const restoredLocaleSelector=page.locator('[data-m26-ui-locale]').first();
          await expect(settingsMenu).toHaveAttribute('open','',{timeout:5_000});
          await expect(restoredLocaleSelector).toHaveValue(originalLocale,{timeout:5_000});
          await expect(restoredLocaleSelector).toBeFocused({timeout:5_000});
        }

        const eventLoopDelay=await page.evaluate(()=>new Promise((resolve)=>{
          const started=performance.now();
          setTimeout(()=>resolve(Math.max(0,performance.now()-started)),0);
        }));
        expect(
          Number(eventLoopDelay),
          'Authenticated workspace must return control to the event loop under CPU throttling',
        ).toBeLessThan(1_500);

        await expect(
          page.locator('.m26-shell'),
          'Authenticated shell must remain interactive after throttled navigation and settings interactions',
        ).toHaveAttribute('data-m26-role',account.role,{timeout:5_000});
      }

      const quality=await page.evaluate(async()=>{
        const collector=await globalThis.__IBERFIT_M26_QUALITY_OBSERVABILITY_READY__;
        return collector?.snapshot?.()||null;
      });
      expect(quality?.schemaVersion).toBe('iberfit.quality-runtime-observability.v1');
      expect(quality?.storage).toBe('memory-only');
      expect(quality?.transport).toBe('none');
      expect(quality?.identityIncluded).toBe(false);
      expect(quality?.healthDataIncluded).toBe(false);

      expect(blockedRequests,'Authenticated startup attempted a non-read-only or foreign request').toEqual([]);
      expect(externalRequestFailures).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);

      evidenceRoles.push(Object.freeze({
        role:account.role,
        authenticated:true,
        applicationAuthorized:account.role!=='coach',
        privilegedGate:account.role==='coach'?'webauthn-required':'not-required',
        assurance:Object.freeze({
          privileged:assurance.privileged===true,
          mfaRequired:assurance.mfaRequired===true,
          webauthnRequired:assurance.webauthnRequired===true,
          iberfitAssurance:String(assurance.iberfitAssurance||''),
        }),
        blockedRequests:0,
        externalRequestFailures:0,
        consoleErrors:0,
        pageErrors:0,
        qualityObservability:'memory-only-no-transport',
        interactionVerified:account.role==='client',
        cpuThrottleRate,
        touchProfile,
      }));

      console.log(`RC64_2B_CURRENT_ACCOUNT_PASS:${account.name}`);
    }finally{
      await context.close().catch(()=>{});
    }
  }

  const evidence=Object.freeze({
    schema:'iberfit.rc64.2b.authenticated-current-contract.v3',
    source:'current-source-qa-surface',
    projectRef:PROJECT_REF,
    mode:'authenticated-readonly-browser',
    mutationsPerformed:false,
    identityPersisted:false,
    healthDataPersisted:false,
    credentialsPersisted:false,
    privilegedMutationGateVerifiedSeparately:true,
    roles:evidenceRoles,
  });

  await mkdir('recovery',{recursive:true});
  await writeFile(
    'recovery/RC64_2B_AUTHENTICATED_SMOKE.json',
    `${JSON.stringify(evidence,null,2)}\n`,
    'utf8',
  );
});
