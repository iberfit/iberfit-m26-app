import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const LOCAL_ORIGIN='http://127.0.0.1:4196';
const PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const SUPABASE_ORIGIN=`https://${PROJECT_REF}.supabase.co`;
const OUT_DIR='recovery/rc64-authenticated-visual';

const REQUIRED=[
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

function safeSlug(value){
  return String(value||'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu,'-')
    .replace(/^-+|-+$/gu,'')
    .slice(0,80)||'unknown';
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

async function settleVisual(page){
  await page.evaluate(async()=>{
    await document.fonts?.ready;
    document.documentElement.setAttribute('data-rc64-visual-evidence','authenticated-readonly');
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(120);
}

async function capture(page,{account,project,state}){
  await settleVisual(page);
  const file=`${safeSlug(account.role)}-${safeSlug(account.name)}-${safeSlug(project)}.png`;
  const path=`${OUT_DIR}/${file}`;
  const masks=[
    page.locator('input[type="email"]'),
    page.locator('input[type="password"]'),
  ];
  await page.screenshot({
    path,
    fullPage:true,
    animations:'disabled',
    caret:'hide',
    mask:masks,
  });
  return Object.freeze({
    role:account.role,
    account:account.name,
    state,
    project:safeSlug(project),
    file,
    syntheticQa:true,
  });
}

test('RC64 authenticated visual evidence is real QA, read-only and fail-closed',async({browser},testInfo)=>{
  const missing=REQUIRED.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);

  await mkdir(OUT_DIR,{recursive:true});

  const accounts=[
    {
      name:'client_a',
      role:'client',
      expectedEmail:'qa.rc74.client-a@iberfit.cl',
      email:process.env.M26_QA_CLIENT_A_EMAIL,
      password:process.env.M26_QA_CLIENT_A_PASSWORD,
    },
    {
      name:'coach',
      role:'coach',
      expectedEmail:'qa.rc74.coach@iberfit.cl',
      email:process.env.M26_QA_COACH_EMAIL,
      password:process.env.M26_QA_COACH_PASSWORD,
    },
  ];

  const captures=[];

  for(const account of accounts){
    expect(String(account.email||'').toLowerCase()).toBe(account.expectedEmail);
    expect(String(account.password||'').length).toBeGreaterThanOrEqual(8);

    const context=await browser.newContext({
      baseURL:LOCAL_ORIGIN,
      locale:'es-ES',
      timezoneId:'America/Santiago',
      serviceWorkers:'block',
      reducedMotion:'reduce',
    });

    const blockedRequests=[];
    const unexpectedFailures=[];
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
      const label=safeRequestLabel(request);
      if(!blockedRequests.includes(label))unexpectedFailures.push(label);
    });
    page.on('console',(message)=>{
      if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,400));
    });
    page.on('pageerror',(error)=>{
      pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,400));
    });

    try{
      const navigation=await page.goto('/',{waitUntil:'networkidle',timeout:15_000});
      expect(navigation?.ok()).toBeTruthy();

      await page.getByRole('textbox',{name:'Correo',exact:true}).fill(account.email);
      await page.locator('#m26-login-password').fill(account.password);
      await page.getByRole('button',{name:'Entrar',exact:true}).click();

      if(account.role==='coach'){
        const shell=page.locator('.m26-shell[data-m26-role="coach"]');
        await expect(shell,'Coach shell must remain unavailable before WebAuthn').toHaveCount(0,{timeout:10_000});
        await expect(page.locator('#m26-auth-title')).toBeVisible({timeout:10_000});
        await expect(page.locator('[data-auth-action="mfa-continue-webauthn"]')).toBeVisible({timeout:5_000});
        captures.push(await capture(page,{
          account,
          project:testInfo.project.name,
          state:'privileged-webauthn-gate',
        }));
      }else{
        const shell=page.locator('.m26-shell[data-m26-role="client"]');
        await expect(shell,'Client canonical shell must render after read-only authentication').toHaveCount(1,{timeout:25_000});
        await expect(shell).toBeVisible({timeout:5_000});
        await expect(page.locator('[data-m26-action="logout"]')).toHaveCount(1,{timeout:5_000});
        captures.push(await capture(page,{
          account,
          project:testInfo.project.name,
          state:'authenticated-shell',
        }));
      }

      expect(blockedRequests,'Visual evidence attempted a mutation or foreign request').toEqual([]);
      expect(unexpectedFailures).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }finally{
      await context.close().catch(()=>{});
    }
  }

  const project=safeSlug(testInfo.project.name);
  const evidence=Object.freeze({
    schema:'iberfit.rc64.authenticated-visual-evidence.v1',
    source:'current-source-qa-surface',
    projectRef:PROJECT_REF,
    project,
    mode:'authenticated-readonly-visual',
    mutationsPerformed:false,
    credentialsPersisted:false,
    screenshotsContainSyntheticQaSurface:true,
    captures,
    admin:Object.freeze({
      captured:false,
      reason:'authorized-admin-qa-account-not-configured',
    }),
  });

  await writeFile(
    `${OUT_DIR}/${project}.json`,
    `${JSON.stringify(evidence,null,2)}\n`,
    'utf8',
  );
});
