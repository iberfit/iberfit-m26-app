import {test,expect} from '@playwright/test';

const LOCAL_ORIGIN='http://127.0.0.1:4196';
const PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const SUPABASE_ORIGIN=`https://${PROJECT_REF}.supabase.co`;
const LANGUAGE_KEY='iberfit:m26:ui-language';

const required=[
  'M26_SUPABASE_URL',
  'M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_PROJECT_REF',
  'M26_QA_ONLY',
  'M26_QA_CLIENT_A_EMAIL',
  'M26_QA_CLIENT_A_PASSWORD',
];

test('auth recovers from a hung password request without reload or mixed-language UI',async({browser})=>{
  const missing=required.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);

  const email=String(process.env.M26_QA_CLIENT_A_EMAIL||'');
  const password=String(process.env.M26_QA_CLIENT_A_PASSWORD||'');
  expect(email.toLowerCase()).toBe('qa.rc74.client-a@iberfit.cl');
  expect(password.length).toBeGreaterThanOrEqual(8);

  const context=await browser.newContext({
    baseURL:LOCAL_ORIGIN,
    locale:'en-GB',
    timezoneId:'America/Santiago',
    serviceWorkers:'block',
  });

  await context.addInitScript((key)=>{
    try{globalThis.localStorage?.setItem?.(key,'en');}catch{}
  },LANGUAGE_KEY);

  let heldRoute=null;
  let heldPasswordRequest=false;
  const unexpectedExternal=[];

  await context.route('**/*',async(route)=>{
    const request=route.request();
    let url;
    try{url=new URL(request.url());}
    catch{
      unexpectedExternal.push('INVALID_URL');
      await route.abort('blockedbyclient');
      return;
    }

    if(url.origin===LOCAL_ORIGIN){
      await route.continue();
      return;
    }

    if(
      url.origin===SUPABASE_ORIGIN&&
      request.method().toUpperCase()==='POST'&&
      url.pathname==='/auth/v1/token'&&
      url.searchParams.get('grant_type')==='password'
    ){
      heldPasswordRequest=true;
      heldRoute=route;
      return;
    }

    unexpectedExternal.push(`${request.method().toUpperCase()} ${url.origin===SUPABASE_ORIGIN?'qa-supabase':'external'} ${url.pathname}`);
    await route.abort('blockedbyclient');
  });

  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,300)));

  try{
    const navigation=await page.goto('/',{waitUntil:'networkidle',timeout:15_000});
    expect(navigation?.ok()).toBeTruthy();

    await expect(page.locator('.m26-auth-page')).toBeVisible();
    await expect(page.locator('#m26-auth-title')).toHaveText('Personal training with purpose');

    const emailInput=page.locator('input[name="email"]');
    const passwordInput=page.locator('#m26-login-password');
    const rememberInput=page.locator('#m26-remember-email');
    const submit=page.locator('form[data-auth-form="login"] button[type="submit"]');

    await emailInput.fill(email);
    await passwordInput.fill(password);
    await rememberInput.check();

    const navigationEntriesBefore=await page.evaluate(
      ()=>performance.getEntriesByType('navigation').length,
    );

    await submit.click();

    await expect(submit).toHaveText('Signing in…');
    await expect(submit).toBeDisabled();
    await expect(page.locator('.m26-auth-card')).toHaveAttribute('aria-busy','true');
    await expect.poll(()=>heldPasswordRequest,{timeout:5_000}).toBe(true);

    const notice=page.locator('.m26-auth-notice.is-error');
    await expect(notice).toContainText(
      'Access is taking longer than expected. You can try again without reloading the app.',
      {timeout:25_000},
    );
    await expect(notice).toContainText('Code: M26_AUTH_UI_TIMEOUT.');

    const recoveredSubmit=page.locator('form[data-auth-form="login"] button[type="submit"]');
    const recoveredEmail=page.locator('input[name="email"]');
    const recoveredPassword=page.locator('#m26-login-password');

    await expect(page.locator('.m26-auth-card')).toHaveAttribute('aria-busy','false');
    await expect(recoveredSubmit).toBeEnabled();
    await expect(recoveredSubmit).toHaveText('Sign in');
    await expect(recoveredEmail).toHaveValue(email);
    await expect(recoveredPassword).toHaveValue('');

    const navigationEntriesAfter=await page.evaluate(
      ()=>performance.getEntriesByType('navigation').length,
    );
    expect(navigationEntriesAfter).toBe(navigationEntriesBefore);
    expect(unexpectedExternal).toEqual([]);
    expect(pageErrors).toEqual([]);
  }finally{
    if(heldRoute){
      await heldRoute.abort('timedout').catch(()=>{});
    }
    await context.close().catch(()=>{});
  }
});
