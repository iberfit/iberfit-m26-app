import {mkdir} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const APP_URL=String(process.env.M26_PROD_APP_URL||'https://app.iberfit.cl').replace(/\/+$/u,'');
const SOURCE_SHA=String(process.env.M26_PROD_SOURCE_SHA||'').trim();

test('production entry renders, remains interactive and exposes recovery without authentication',async({page,request},testInfo)=>{
  expect(SOURCE_SHA).toMatch(/^[0-9a-f]{40}$/u);

  const pageErrors=[];
  page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,500)));

  const response=await page.goto(`${APP_URL}/?production-entry-smoke=${SOURCE_SHA.slice(0,12)}`,{
    waitUntil:'domcontentloaded',
    timeout:30_000,
  });
  expect(response?.ok(),'Production root must answer successfully').toBeTruthy();

  const versionResponse=await request.get(
    `${APP_URL}/m26/version.json?production-entry-smoke=${SOURCE_SHA}.${Date.now()}`,
    {headers:{'cache-control':'no-cache','pragma':'no-cache'},timeout:15_000},
  );
  expect(versionResponse.ok()).toBeTruthy();
  const version=await versionResponse.json();
  expect(version.sourceSha).toBe(SOURCE_SHA);
  expect(version.environment).toBe('PRODUCTION');
  expect(version.production).toBe(true);
  expect(version.qaOnly).toBe(false);

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
