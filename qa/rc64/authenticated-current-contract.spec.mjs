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

async function visibleAreaTarget(page,area){
  const selector=`[data-m26-area="${area}"]:visible`;
  const direct=page.locator(selector).first();
  if(await direct.count()&&await direct.isVisible())return direct;

  const mobileMore=page.locator('details.m26-mobile-more').first();
  if(await mobileMore.count()){
    const open=await mobileMore.getAttribute('open');
    if(open===null){
      const summary=mobileMore.locator('summary').first();
      await expect(summary,`Mobile More disclosure must be available before opening ${area}`).toBeVisible({timeout:5_000});
      await summary.click({timeout:5_000});
    }
  }

  const target=page.locator(selector).first();
  await expect(target,`Area ${area} must be reachable through the visible responsive navigation`).toBeVisible({timeout:5_000});
  return target;
}

async function openArea(page,area){
  const target=await visibleAreaTarget(page,area);
  await target.click({timeout:5_000});
  await expect(
    page.locator(`[data-m26-area="${area}"][aria-current="page"]:visible`).first(),
    `Area ${area} must become active after pointer/touch navigation`,
  ).toBeVisible({timeout:5_000});
}

test('RC64.2B current WebAuthn contract authenticates QA Coach and Client without mutations',async({browser})=>{
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
          await expect(
            page.locator('details.m26-settings-menu').first(),
            'Native settings control must accept pointer/touch interaction after login',
          ).toHaveAttribute('open','',{timeout:5_000});
        }

        await openArea(page,'actividad');
        const energyInput=page.locator('form[data-engagement-form="checkin"] input[name="energy"]').first();
        const notesInput=page.locator('form[data-engagement-form="checkin"] textarea[name="notes"]').first();
        await expect(energyInput,'Activity numeric input must be visible on every responsive layout').toBeVisible({timeout:5_000});
        await energyInput.fill('7');
        await expect(energyInput).toHaveValue('7');
        await expect(notesInput,'Activity textarea must be visible on every responsive layout').toBeVisible({timeout:5_000});
        await notesInput.fill('responsive interaction probe');
        await page.waitForTimeout(350);
        await expect(
          page.locator('form[data-engagement-form="checkin"] input[name="energy"]').first(),
          'Focused numeric input must survive progressive controller renders without being ejected',
        ).toHaveValue('7');
        await expect(
          page.locator('form[data-engagement-form="checkin"] textarea[name="notes"]').first(),
          'Focused textarea must survive progressive controller renders without being ejected',
        ).toHaveValue('responsive interaction probe');

        await openArea(page,'ajustes');
        const localeSelect=page.locator('[data-m26-ui-locale]').first();
        await expect(localeSelect,'Locale select must be interactive after authenticated startup').toBeVisible({timeout:5_000});
        const localeState=await localeSelect.evaluate((node)=>({
          current:node.value,
          options:[...node.options].map((option)=>option.value).filter(Boolean),
        }));
        expect(localeState.options.length).toBeGreaterThan(1);
        const nextLocale=localeState.options.find((value)=>value!==localeState.current);
        expect(nextLocale).toBeTruthy();
        await localeSelect.selectOption(nextLocale);
        await expect(
          page.locator('[data-m26-ui-locale]').first(),
          'Locale select change must complete even when the shell rerenders after the native change event',
        ).toHaveValue(nextLocale,{timeout:5_000});

        const notificationToggle=page.locator('[data-m26-preference="notifications.sessionReminders"]').first();
        await expect(notificationToggle,'Preference checkbox must remain touch/click interactive').toBeVisible({timeout:5_000});
        const beforeToggle=await notificationToggle.isChecked();
        await notificationToggle.click({timeout:5_000});
        await expect(
          page.locator('[data-m26-preference="notifications.sessionReminders"]').first(),
          'Preference checkbox state must survive the shell rerender',
        ).toBeChecked({checked:!beforeToggle,timeout:5_000});
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
        responsiveControlsVerified:account.role==='client',
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
