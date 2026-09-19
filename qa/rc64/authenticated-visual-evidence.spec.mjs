import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {
  CANARY_ORIGIN,
  QA_PROJECT_REF,
  SUPABASE_ORIGIN,
  installCurrentSourceQaNetworkPolicy,
  qaRequestLabel,
} from './secure-current-source-auth.mjs';

const OUT_DIR='recovery/rc64-authenticated-visual';
const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
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

function safeSlug(value){return String(value||'unknown').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,80)||'unknown';}
async function settleVisual(page){
  await page.evaluate(async()=>{await document.fonts?.ready;document.documentElement.setAttribute('data-rc64-visual-evidence','authenticated-readonly');});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(120);
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
async function capture(page,{account,project,state,suffix=''}){
  await settleVisual(page);
  const variant=String(suffix||'').trim()?`-${safeSlug(suffix)}`:'';
  const file=`${safeSlug(account.role)}-${safeSlug(account.name)}-${safeSlug(project)}${variant}.png`;
  await page.screenshot({
    path:`${OUT_DIR}/${file}`,
    fullPage:true,
    animations:'disabled',
    caret:'hide',
    mask:[page.locator('input[type="email"]'),page.locator('input[type="password"]')],
  });
  return {role:account.role,account:account.name,state,project:safeSlug(project),file,syntheticQa:true};
}

test('authenticated visual evidence uses Client-only QA plus privileged Coach gate and remains business read-only',async({browser},testInfo)=>{
  const missing=REQUIRED.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);
  await mkdir(OUT_DIR,{recursive:true});

  const accounts=[
    {name:'client_b',role:'client',expectedEmail:'qa.rc74.client-b@iberfit.cl',email:process.env.M26_QA_CLIENT_B_EMAIL,password:process.env.M26_QA_CLIENT_B_PASSWORD},
    {name:'coach',role:'coach',expectedEmail:'qa.rc74.coach@iberfit.cl',email:process.env.M26_QA_COACH_EMAIL,password:process.env.M26_QA_COACH_PASSWORD},
  ];
  const captures=[];
  const projectUse=testInfo.project.use||{};

  for(const account of accounts){
    expect(String(account.email||'').toLowerCase()).toBe(account.expectedEmail);
    const context=await browser.newContext({
      baseURL:CANARY_ORIGIN,
      locale:'es-ES',
      timezoneId:'America/Santiago',
      serviceWorkers:'block',
      reducedMotion:'reduce',
      viewport:projectUse.viewport,
      hasTouch:Boolean(projectUse.hasTouch),
      isMobile:Boolean(projectUse.isMobile),
    });
    const blocked=[];
    const unexpectedFailures=[];
    const consoleErrors=[];
    const pageErrors=[];
    await installCurrentSourceQaNetworkPolicy(context,{
      readOnlyRpcs:READ_ONLY_RPCS,
      onBlocked:(label)=>blocked.push(label),
    });
    const page=await context.newPage();
    page.on('requestfailed',(request)=>{const label=qaRequestLabel(request);if(!blocked.includes(label))unexpectedFailures.push(label);});
    page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,400));});
    page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,400)));

    try{
      const navigation=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:20_000});
      expect(navigation?.ok()).toBeTruthy();
      await page.getByRole('textbox',{name:'Correo',exact:true}).fill(account.email);
      await page.locator('#m26-login-password').fill(account.password);
      await page.getByRole('button',{name:'Entrar',exact:true}).click();

      if(account.role==='coach'){
        await expect(page.locator('.m26-shell[data-m26-role="coach"]')).toHaveCount(0,{timeout:10_000});
        await expect(page.locator('#m26-auth-title')).toBeVisible({timeout:10_000});
        await expect(page.locator('[data-auth-action="mfa-continue-webauthn"]')).toBeVisible({timeout:5_000});
        captures.push(await capture(page,{account,project:testInfo.project.name,state:'privileged-webauthn-gate'}));
      }else{
        const shell=page.locator('.m26-shell[data-m26-role="client"]');
        await expect(shell,'Client-only visual fixture must open Client without privileged MFA').toBeVisible({timeout:25_000});
        await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});
        await expect(page.locator('.m26-role-choice[role="dialog"]')).toHaveCount(0);
        await dismissGuidance(page);
        await expect(page.locator('.m26-route').first()).toBeVisible({timeout:10_000});
        captures.push(await capture(page,{account,project:testInfo.project.name,state:'authenticated-shell'}));

        const progressNav=page.locator('[data-m26-area="progreso"]:visible').first();
        await expect(progressNav).toBeVisible({timeout:5_000});
        await progressNav.click();
        await expect(page.locator('[data-client-progress-stage]')).toBeVisible({timeout:10_000});
        await expect(page.locator('[data-m27-cliente-360]')).toHaveCount(0);
        await expect(page.locator('[data-m26-area="progreso"][aria-current="page"]:visible').first()).toBeVisible({timeout:5_000});
        const exerciseAnalyticsCount=await page.locator('[data-m26-exercise-analytics="v2"]').count();
        captures.push({...(await capture(page,{account,project:testInfo.project.name,state:'authenticated-progress',suffix:'progress'})),exerciseAnalyticsCount});
      }

      expect(blocked,'Visual evidence attempted a business mutation or foreign request').toEqual([]);
      expect(unexpectedFailures).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }finally{
      await context.close().catch(()=>{});
    }
  }

  const evidence={
    schema:'iberfit.rc64.authenticated-visual-evidence.v3',
    source:'current-source-intercepted-at-canary-origin',
    projectRef:QA_PROJECT_REF,
    project:safeSlug(testInfo.project.name),
    mode:'authenticated-readonly-visual',
    mutationsPerformed:false,
    businessMutationsPerformed:false,
    authMutationPerformed:false,
    credentialsPersisted:false,
    screenshotsContainSyntheticQaSurface:true,
    captures,
    admin:{captured:false,reason:'privileged-multiapp-auth-covered-by-fail-closed-contract-gate'},
  };
  await writeFile(`${OUT_DIR}/${safeSlug(testInfo.project.name)}.json`,`${JSON.stringify(evidence,null,2)}\n`,'utf8');
});