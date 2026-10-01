import {mkdir} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const APP_URL=String(process.env.M26_PROD_APP_URL||'https://app.iberfit.cl').replace(/\/+$/u,'');
const SOURCE_SHA=String(process.env.M26_PROD_SOURCE_SHA||'').trim();
const VERSION_CONVERGENCE_TIMEOUT_MS=Number(process.env.M26_PROD_VERSION_CONVERGENCE_TIMEOUT_MS||60_000);
const VERSION_STABLE_PASSES=Number(process.env.M26_PROD_VERSION_STABLE_PASSES||2);

function requirePositiveInteger(value,label){
  expect(value,`${label} must be a positive integer`).toBeGreaterThan(0);
  expect(Number.isSafeInteger(value),`${label} must be a safe integer`).toBe(true);
}

test('production entry renders, remains interactive and exposes recovery without authentication',async({page},testInfo)=>{
  expect(SOURCE_SHA).toMatch(/^[0-9a-f]{40}$/u);
  requirePositiveInteger(VERSION_CONVERGENCE_TIMEOUT_MS,'Version convergence timeout');
  requirePositiveInteger(VERSION_STABLE_PASSES,'Version stable passes');

  const pageErrors=[];
  page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,500)));
  await page.setExtraHTTPHeaders({'cache-control':'no-cache','pragma':'no-cache'});

  let stableVersionHits=0;
  let lastVersion=null;
  await expect.poll(async()=>{
    try{
      const versionResponse=await page.request.get(
        `${APP_URL}/m26/version.json?production-entry-convergence=${SOURCE_SHA}.${Date.now()}`,
        {headers:{'cache-control':'no-cache','pragma':'no-cache'},timeout:15_000},
      );
      if(!versionResponse.ok()){
        stableVersionHits=0;
        return 0;
      }
      const version=await versionResponse.json();
      lastVersion=version;
      const current=version.sourceSha===SOURCE_SHA
        &&version.environment==='PRODUCTION'
        &&version.production===true
        &&version.qaOnly===false;
      stableVersionHits=current?stableVersionHits+1:0;
      return stableVersionHits;
    }catch{
      stableVersionHits=0;
      return 0;
    }
  },{
    timeout:VERSION_CONVERGENCE_TIMEOUT_MS,
    intervals:[1_000,2_000,3_000,4_000],
    message:'Production version must converge stably before Chromium certifies interactivity',
  }).toBeGreaterThanOrEqual(VERSION_STABLE_PASSES);

  expect(lastVersion?.sourceSha).toBe(SOURCE_SHA);
  expect(lastVersion?.environment).toBe('PRODUCTION');
  expect(lastVersion?.production).toBe(true);
  expect(lastVersion?.qaOnly).toBe(false);

  await expect.poll(async()=>{
    try{
      const response=await page.goto(
        `${APP_URL}/?production-entry-smoke=${SOURCE_SHA.slice(0,12)}.${Date.now()}`,
        {waitUntil:'domcontentloaded',timeout:30_000},
      );
      if(!response?.ok())return null;
      return await page.evaluate(()=>window.__IBERFIT_M26_RUNTIME__?.sourceSha||null);
    }catch{
      return null;
    }
  },{
    timeout:VERSION_CONVERGENCE_TIMEOUT_MS,
    intervals:[1_000,2_000,3_000,4_000],
    message:'Production root and runtime must serve the promoted SHA before interaction checks',
  }).toBe(SOURCE_SHA);

  const authPage=page.locator('.m26-auth-page');
  const login=page.locator('[data-auth-form="login"]');
  await expect(authPage).toBeVisible({timeout:20_000});
  await expect(login).toBeVisible({timeout:20_000});

  await expect.poll(
    async()=>authPage.getAttribute('data-auth-state'),
    {timeout:10_000,message:'Production entry must settle into an interactive auth state'},
  ).not.toMatch(/^(?:blocked|unavailable|busy)$/u);

  const email=login.locator('input[name="email"]');
  const password=login.locator('#m26-login-password');
  const submit=login.getByRole('button',{name:'Entrar',exact:true});
  await expect(email).toBeEnabled();
  await expect(password).toBeEnabled();
  await expect(submit).toBeEnabled();

  await email.fill('production-smoke@invalid.example');
  await password.fill('IberfitSmokeOnly2026!');
  await expect(password).toHaveAttribute('type','password');

  const visibility=login.getByRole('button',{name:'Mostrar contraseña'});
  await visibility.click();
  await expect(password).toHaveAttribute('type','text');
  await login.getByRole('button',{name:'Ocultar contraseña'}).click();
  await expect(password).toHaveAttribute('type','password');

  await login.getByRole('button',{name:/Primera vez|no recuerdo mi contraseña/iu}).click();
  const recovery=page.locator('[data-auth-form="request-recovery"]');
  await expect(recovery).toBeVisible();
  await expect(recovery.locator('input[name="email"]')).toBeEnabled();
  await recovery.getByRole('button',{name:'Volver al acceso',exact:true}).click();
  await expect(page.locator('[data-auth-form="login"]')).toBeVisible();

  await page.waitForTimeout(2_000);
  await expect(page.locator('[data-auth-form="login"]')).toBeVisible();
  await expect(page.locator('[data-auth-form="login"] input[name="email"]')).toBeEnabled();
  expect(pageErrors).toEqual([]);

  await mkdir('recovery/production-entry',{recursive:true});
  await page.screenshot({
    path:`recovery/production-entry/${testInfo.project.name}.png`,
    fullPage:true,
  });
});
