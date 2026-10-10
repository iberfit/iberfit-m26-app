import {test,expect} from '@playwright/test';

const LOCAL_ORIGIN='http://127.0.0.1:4196';
const PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const SUPABASE_ORIGIN=`https://${PROJECT_REF}.supabase.co`;
const LANGUAGE_KEY='iberfit:m26:ui-language';


test('auth recovers from a hung password request without reload or mixed-language UI',async({browser})=>{
  const email='freeze.probe@iberfit.invalid';
  const loginCredential=['freeze','probe','credential'].join('-');

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
    await expect(page.locator('#m26-auth-title')).toHaveText('Your IBERFIT space');

    const emailInput=page.locator('input[name="email"]');
    const passwordInput=page.locator('#m26-login-password');
    const rememberInput=page.locator('#m26-remember-email');
    const submit=page.locator('form[data-auth-form="login"] button[type="submit"]');

    await emailInput.fill(email);
    await passwordInput.fill(loginCredential);
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
      /(?:Could not connect\. Check your internet connection and try again\.|Access is taking longer than expected\. Check your connection and try again\.)/u,
      {timeout:20_000},
    );
    await expect(notice).not.toContainText('Code:');

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


test('failed full-app import offers usable bootstrap login and dispatches a single password request',async({browser})=>{
  // Hermetic regression for the real fallback path; no requests reach Supabase.
  // The minimal form is intentionally hidden until full-app boot fails.
  const email='bootstrap.probe@iberfit.invalid';
  const loginCredential=['hermetic','bootstrap','probe'].join('-');
  const context=await browser.newContext({
    baseURL:LOCAL_ORIGIN,
    locale:'es-CL',
    timezoneId:'America/Santiago',
    serviceWorkers:'block',
    viewport:{width:820,height:1180},
    hasTouch:true,
  });
  let failedImports=0;
  let passwordRequests=0;
  const trappedPasswordRoutes=[];
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
      if(url.pathname==='/src/m26/app/application.js'){
        failedImports+=1;
        await route.abort('failed');
        return;
      }
      await route.continue();
      return;
    }
    if(
      url.origin===SUPABASE_ORIGIN&&
      request.method().toUpperCase()==='POST'&&
      url.pathname==='/auth/v1/token'&&
      url.searchParams.get('grant_type')==='password'
    ){
      passwordRequests+=1;
      trappedPasswordRoutes.push(route);
      return;
    }
    unexpectedExternal.push(
      `${request.method().toUpperCase()} ${url.origin===SUPABASE_ORIGIN?'qa-supabase':'external'} ${url.pathname}`,
    );
    await route.abort('blockedbyclient');
  });

  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',(error)=>errors.push(String(error?.message||error||'PAGE_ERROR').slice(0,250)));
  try{
    const response=await page.goto('/',{waitUntil:'domcontentloaded',timeout:15_000});
    expect(response?.ok()).toBeTruthy();

    const form=page.locator('form[data-auth-form="login"]');
    const submit=form.locator('button[type="submit"]');
    const card=page.locator('.m26-auth-card');
    // Real production recovery path: module load fails, bootstrap stays interactive.
    await expect(page.locator('[data-minimal-auth-repair]')).toBeVisible({timeout:12_000});
    await expect(form).toBeVisible();
    await expect(submit).toBeEnabled();
    await expect(card).toHaveAttribute('aria-busy','false');

    await form.locator('input[name="email"]').fill(email);
    await form.locator('input[name="password"]').fill(loginCredential);
    const navigationCount=await page.evaluate(()=>performance.getEntriesByType('navigation').length);

    await submit.click();
    await expect.poll(()=>passwordRequests,{timeout:7_000}).toBe(1);
    await expect(card).toHaveAttribute('aria-busy','true');
    await expect(submit).toBeDisabled();

    // Let the transport's own 12s timeout abort this held request.
    // Aborting the route externally creates a different browser network error,
    // which may correctly trigger the transport's bounded transient retry.
    await expect(card).toHaveAttribute('aria-busy','false',{timeout:20_000});
    await expect(submit).toBeEnabled();
    await expect(page.locator('[data-minimal-auth-notice]')).toContainText(
      'Puedes reintentar sin borrar tus datos.',
    );
    await expect(form.locator('input[name="email"]')).toHaveValue(email);
    expect(await page.evaluate(()=>performance.getEntriesByType('navigation').length)).toBe(navigationCount);
    expect(failedImports).toBe(1);
    expect(passwordRequests).toBe(1);
    expect(unexpectedExternal).toEqual([]);
    expect(errors).toEqual([]);
  }finally{
    for(const route of trappedPasswordRoutes)await route.abort('timedout').catch(()=>{});
    await context.close().catch(()=>{});
  }
});


test('token HTTP 200 followed by stalled assurance recovers and retries without privileged bypass',async({browser})=>{
  // P0 #821: reproduce the exact missing-assurance boundary after successful
  // first factor. All identities and tokens are synthetic; no Supabase traffic.
  const email='qa.rc64.auth-821@iberfit.cl';
  const password=['synthetic','browser','only','pass'].join('-');
  const userId='11111111-1111-4111-8111-111111111111';
  const context=await browser.newContext({
    baseURL:LOCAL_ORIGIN,
    locale:'es-CL',
    timezoneId:'America/Santiago',
    serviceWorkers:'block',
    viewport:{width:1180,height:820},
    hasTouch:true,
  });
  let tokenPosts=0;
  let assurancePosts=0;
  let userReads=0;
  const heldAssurance=[];
  const unexpected=[];
  const pageErrors=[];

  await context.route('**/*',async(route)=>{
    const req=route.request();
    let url;
    try{url=new URL(req.url());}
    catch{
      unexpected.push('INVALID_URL');
      await route.abort('blockedbyclient');
      return;
    }
    if(url.origin===LOCAL_ORIGIN){
      await route.continue();
      return;
    }
    if(url.origin===SUPABASE_ORIGIN&&req.method()==='POST'&&
       url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password'){
      tokenPosts+=1;
      await route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({
          access_token:'synthetic-access-821',
          refresh_token:'synthetic-refresh-821',
          expires_at:2_000_000_000,
          user:{id:userId,email},
        }),
      });
      return;
    }
    if(url.origin===SUPABASE_ORIGIN&&req.method()==='POST'&&
       url.pathname==='/rest/v1/rpc/iberfit_privileged_assurance_context_v65d'){
      assurancePosts+=1;
      if(assurancePosts===1){
        // Do not abort externally: allow the application's real request timeout.
        heldAssurance.push(route);
        return;
      }
      await route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({
          ok:true,
          privileged:true,
          privilegedRole:'coach',
          mfaRequired:true,
          webauthnRequired:true,
          credentialEnrolled:false,
          iberfitAssurance:'required',
          supabaseAal:'aal1',
          emailOtpAvailable:false,
        }),
      });
      return;
    }
    if(url.origin===SUPABASE_ORIGIN&&req.method()==='GET'&&url.pathname==='/auth/v1/user'){
      userReads+=1;
      await route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({id:userId,email,factors:[]}),
      });
      return;
    }
    unexpected.push(`${req.method()} ${url.origin===SUPABASE_ORIGIN?'qa-supabase':'external'} ${url.pathname}`);
    await route.abort('blockedbyclient');
  });

  const page=await context.newPage();
  page.on('pageerror',error=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,200)));
  try{
    const navigation=await page.goto('/',{waitUntil:'networkidle',timeout:15_000});
    expect(navigation?.ok()).toBeTruthy();
    const form=page.locator('form[data-auth-form="login"]');
    await expect(form).toBeVisible();
    const cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});

    await form.locator('input[name="email"]').fill(email);
    await form.locator('input[name="password"]').fill(password);
    const navigationCount=await page.evaluate(()=>performance.getEntriesByType('navigation').length);
    await form.locator('button[type="submit"]').click();
    await expect.poll(()=>tokenPosts,{timeout:8_000}).toBe(1);
    await expect.poll(()=>assurancePosts,{timeout:8_000}).toBe(1);

    // Token has been accepted, but there is no second-factor assurance response.
    // Never expose a privileged shell while this request is pending.
    await expect(page.locator('.m26-shell[data-m26-role]')).toHaveCount(0);
    await expect(page.locator('.m26-auth-page[data-auth-mode="recoverable-session"]')).toBeVisible({timeout:25_000});
    const retry=page.locator('[data-auth-action="retry-session"]');
    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();
    await expect(page.locator('form[data-auth-form="login"]')).toHaveCount(0);
    await expect(page.locator('.m26-shell[data-m26-role]')).toHaveCount(0);

    // Reuse the synthetic saved first-factor session without asking for or
    // resending a password; permission checking must still require WebAuthn.
    await retry.click();
    await expect.poll(()=>assurancePosts,{timeout:8_000}).toBe(2);
    await expect.poll(()=>userReads,{timeout:8_000}).toBe(1);
    await expect(page.locator('[data-auth-action="mfa-continue-webauthn"]')).toBeVisible({timeout:8_000});
    await expect(page.locator('.m26-shell[data-m26-role]')).toHaveCount(0);
    expect(tokenPosts).toBe(1);
    expect(unexpected).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(()=>performance.getEntriesByType('navigation').length)).toBe(navigationCount);
  }finally{
    for(const route of heldAssurance)await route.abort('timedout').catch(()=>{});
    await context.close().catch(()=>{});
  }
});


for(const device of [
  {name:'phone-touch-cpu6',width:390,height:844,touch:true,cpu:6},
  {name:'tablet-landscape-touch-cpu6',width:1180,height:820,touch:true,cpu:6},
  {name:'desktop-pointer-cpu4',width:1440,height:900,touch:false,cpu:4},
]){
  test(`full-app delayed bootstrap delivers one click and one login POST: ${device.name}`,async({browser})=>{
    // P0 #821 pre-network path: a deliberately slow application import must
    // not lose the first user gesture after the full login becomes interactive.
    // All auth responses are hermetic. Never inspect/log credential contents.
    const account='qa.rc64.interaction-821@iberfit.cl';
    const syntheticPassword=['browser','gesture','qa','only'].join('-');
    const accountId='11111111-1111-4111-8111-111111111111';
    const context=await browser.newContext({
      baseURL:LOCAL_ORIGIN,
      locale:'es-CL',
      timezoneId:'America/Santiago',
      serviceWorkers:'block',
      viewport:{width:device.width,height:device.height},
      hasTouch:device.touch,
      isMobile:device.width<500,
    });
    let moduleRequests=0;
    let tokenPosts=0;
    let assurancePosts=0;
    let userReads=0;
    const unexpectedExternal=[];
    const errors=[];
    await context.addInitScript(()=>{
      const markers={pointerDown:0,click:0,submit:0,firstFormReady:false};
      const submitTarget=(target)=>Boolean(target?.closest?.('[data-auth-form="login"] button[type="submit"]'));
      document.addEventListener('pointerdown',(event)=>{
        if(submitTarget(event.target))markers.pointerDown+=1;
      },true);
      document.addEventListener('click',(event)=>{
        if(submitTarget(event.target))markers.click+=1;
      },true);
      document.addEventListener('submit',(event)=>{
        if(event.target?.matches?.('[data-auth-form="login"]'))markers.submit+=1;
      },true);
      globalThis.__IBERFIT_QA_GESTURE_MARKERS__=markers;
    });
    await context.route('**/*',async(route)=>{
      const req=route.request();
      let url;
      try{url=new URL(req.url());}
      catch{
        unexpectedExternal.push('INVALID_URL');
        await route.abort('blockedbyclient');
        return;
      }
      if(url.origin===LOCAL_ORIGIN){
        if(url.pathname==='/src/m26/app/application.js'){
          moduleRequests+=1;
          await new Promise(resolve=>setTimeout(resolve,1300));
        }
        await route.continue();
        return;
      }
      if(url.origin===SUPABASE_ORIGIN&&req.method()==='POST'&&
         url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password'){
        tokenPosts+=1;
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          access_token:'qa-synthetic-token-interaction-821',
          refresh_token:'qa-synthetic-refresh-interaction-821',
          expires_at:2_000_000_000,
          user:{id:accountId,email:account},
        })});
        return;
      }
      if(url.origin===SUPABASE_ORIGIN&&req.method()==='POST'&&
         url.pathname==='/rest/v1/rpc/iberfit_privileged_assurance_context_v65d'){
        assurancePosts+=1;
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          ok:true,privileged:true,privilegedRole:'coach',mfaRequired:true,
          webauthnRequired:true,credentialEnrolled:false,
          iberfitAssurance:'required',supabaseAal:'aal1',emailOtpAvailable:false,
        })});
        return;
      }
      if(url.origin===SUPABASE_ORIGIN&&req.method()==='GET'&&url.pathname==='/auth/v1/user'){
        userReads+=1;
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          id:accountId,email:account,factors:[],
        })});
        return;
      }
      unexpectedExternal.push(
        `${req.method()} ${url.origin===SUPABASE_ORIGIN?'qa-supabase':'external'} ${url.pathname}`,
      );
      await route.abort('blockedbyclient');
    });
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(String(error?.message||error||'PAGE_ERROR').slice(0,200)));
    try{
      const cdp=await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:device.cpu});
      const response=await page.goto('/',{waitUntil:'domcontentloaded',timeout:22_000});
      expect(response?.ok()).toBeTruthy();
      const form=page.locator('form[data-auth-form="login"]');
      await expect(form).toBeVisible({timeout:14_000});
      await expect(page.locator('.m26-auth-card')).toHaveAttribute('data-auth-mode','login');
      expect(await page.evaluate(()=>Boolean(globalThis.__IBERFIT_M26_APP__))).toBe(true);
      const submit=form.locator('button[type="submit"]');
      await expect(submit).toBeEnabled();
      await form.locator('input[name="email"]').fill(account);
      await form.locator('input[name="password"]').fill(syntheticPassword);
      const navigationCount=await page.evaluate(()=>performance.getEntriesByType('navigation').length);
      if(device.touch)await submit.tap();
      else await submit.click();
      await expect.poll(()=>tokenPosts,{timeout:10_000}).toBe(1);
      await expect.poll(()=>assurancePosts,{timeout:10_000}).toBe(1);
      await expect.poll(()=>userReads,{timeout:10_000}).toBe(1);
      await expect(page.locator('.m26-auth-page[data-auth-mode="mfa-required"]')).toBeVisible({timeout:10_000});
      await expect(page.locator('.m26-shell[data-m26-role]')).toHaveCount(0);

      const markers=await page.evaluate(()=>({
        pointerDown:Number(globalThis.__IBERFIT_QA_GESTURE_MARKERS__?.pointerDown||0),
        click:Number(globalThis.__IBERFIT_QA_GESTURE_MARKERS__?.click||0),
        submit:Number(globalThis.__IBERFIT_QA_GESTURE_MARKERS__?.submit||0),
      }));
      expect(markers).toEqual({pointerDown:1,click:1,submit:1});
      expect(moduleRequests).toBe(1);
      expect(tokenPosts).toBe(1);
      expect(assurancePosts).toBe(1);
      expect(userReads).toBe(1);
      expect(unexpectedExternal).toEqual([]);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>performance.getEntriesByType('navigation').length)).toBe(navigationCount);
    }finally{
      await context.close().catch(()=>{});
    }
  });
}
