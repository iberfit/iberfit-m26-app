import {test,expect} from '@playwright/test';

const SESSION_KEY='iberfit:m26:session:v1';
const DRAFT_KEY='iberfit:m26:draft:p0-browser-upgrade';
const CURRENT_CACHE='iberfit-m26-p0-browser-n-shell';
const PREVIOUS_CACHE='iberfit-m26-p0-browser-n1-shell';

async function state(request){
  const response=await request.get('/__p0/state');
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function setRelease(request,value,{optionalFail=false}={}){
  const response=await request.get(`/__p0/release?value=${encodeURIComponent(value)}&optionalFail=${optionalFail?'1':'0'}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function waitForController(page){
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker?.controller),null,{timeout:15_000});
}
async function activeWorkerUrl(page){
  return page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.ready;
    return registration.active?.scriptURL||null;
  });
}

test.beforeEach(async({context,request})=>{
  await setRelease(request,'n1');
  await context.addInitScript(()=>{
    const key='p0:pwa-navigation-count';
    const current=Number(sessionStorage.getItem(key)||0);
    sessionStorage.setItem(key,String(current+1));
  });
});

test.afterEach(async({page})=>{
  await page.evaluate(async()=>{
    const registrations=await navigator.serviceWorker?.getRegistrations?.()||[];
    await Promise.all(registrations.map((registration)=>registration.unregister()));
    const keys=await caches.keys();
    await Promise.all(keys.filter((key)=>key.startsWith('iberfit-m26-')).map((key)=>caches.delete(key)));
  }).catch(()=>{});
});

test('installed PWA upgrades N-1 to N without freezing, cross-release JS, reload loops, or local-data loss',async({page,request})=>{
  const errors=[];
  page.on('pageerror',(error)=>errors.push(`pageerror:${error.message}`));
  page.on('console',(message)=>{
    if(message.type()==='error')errors.push(`console:${message.text()}`);
  });

  const initial=await page.goto('/m26/index.html',{waitUntil:'domcontentloaded'});
  expect(initial?.ok()).toBeTruthy();
  await expect(page.getByRole('heading',{name:'Entrenamiento personal con criterio'})).toBeVisible();
  await page.waitForFunction(()=>globalThis.__IBERFIT_P0_BROWSER_RELEASE__==='n1');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  if(!await page.evaluate(()=>Boolean(navigator.serviceWorker.controller))){
    await page.reload({waitUntil:'domcontentloaded'});
  }
  await waitForController(page);
  expect(await activeWorkerUrl(page)).toContain('/m26/iberfit-sw.js');

  const saved=await page.evaluate(async({sessionKey,draftKey})=>{
    const {createSessionVault}=await import('/src/m26/app/session-vault.js');
    const vault=createSessionVault();
    const expiresAt=Math.floor(Date.now()/1000)+3600;
    const session={
      token:'p0-browser-token',
      refreshToken:'p0-browser-refresh',
      expiresAt,
      user:{id:'p0-browser-user',email:'p0-browser@example.test'},
    };
    vault.save(session);
    localStorage.setItem(draftKey,JSON.stringify({schema:'iberfit.p0.browser-draft.v1',revision:7,sets:[1,2,3]}));
    return {
      session:vault.load(),
      rawSession:localStorage.getItem(sessionKey),
      draft:localStorage.getItem(draftKey),
    };
  },{sessionKey:SESSION_KEY,draftKey:DRAFT_KEY});
  expect(saved.session?.user?.id).toBe('p0-browser-user');
  expect(saved.rawSession).toContain('p0-browser-token');
  expect(saved.draft).toContain('"revision":7');

  await setRelease(request,'n',{optionalFail:true});
  await page.evaluate(()=>sessionStorage.setItem('p0:pwa-navigation-count','0'));

  const coldStart=Date.now();
  await page.reload({waitUntil:'domcontentloaded'});

  // The pinned N-1 shell must remain immediately usable while N installs.
  await expect(page.getByRole('heading',{name:'Entrenamiento personal con criterio'})).toBeVisible({timeout:3_000});

  // The app's own update path must activate N, observe controllerchange and perform at most one reload.
  await page.waitForFunction(()=>globalThis.__IBERFIT_P0_BROWSER_RELEASE__==='n',null,{timeout:20_000});
  await waitForController(page);
  await expect(page.getByRole('heading',{name:'Entrenamiento personal con criterio'})).toBeVisible();

  const afterUpgrade=await page.evaluate(async({sessionKey,draftKey,currentCache,previousCache})=>{
    const {createSessionVault}=await import('/src/m26/app/session-vault.js');
    const vault=createSessionVault();
    const keys=await caches.keys();
    const current=await caches.open(currentCache);
    const previous=await caches.open(previousCache);
    const currentApp=await (await current.match('/m26/app.js'))?.text();
    const previousApp=await (await previous.match('/m26/app.js'))?.text();
    const controlledApp=await (await fetch('/m26/app.js',{cache:'no-store'})).text();
    const currentRequests=(await current.keys()).map((request)=>new URL(request.url).pathname);
    return {
      navigationCount:Number(sessionStorage.getItem('p0:pwa-navigation-count')||0),
      keys,
      session:vault.load(),
      rawSession:localStorage.getItem(sessionKey),
      draft:localStorage.getItem(draftKey),
      currentApp:currentApp||'',
      previousApp:previousApp||'',
      controlledApp,
      currentRequests,
      controller:navigator.serviceWorker.controller?.scriptURL||null,
    };
  },{
    sessionKey:SESSION_KEY,
    draftKey:DRAFT_KEY,
    currentCache:CURRENT_CACHE,
    previousCache:PREVIOUS_CACHE,
  });

  expect(Date.now()-coldStart).toBeLessThan(20_000);
  expect(afterUpgrade.navigationCount).toBeGreaterThanOrEqual(1);
  expect(afterUpgrade.navigationCount).toBeLessThanOrEqual(2);
  expect(afterUpgrade.keys).toContain(CURRENT_CACHE);
  expect(afterUpgrade.keys).toContain(PREVIOUS_CACHE);
  expect(afterUpgrade.currentApp).toContain("__IBERFIT_P0_BROWSER_RELEASE__='n'");
  expect(afterUpgrade.currentApp).not.toContain("__IBERFIT_P0_BROWSER_RELEASE__='n1'");
  expect(afterUpgrade.previousApp).toContain("__IBERFIT_P0_BROWSER_RELEASE__='n1'");
  expect(afterUpgrade.controlledApp).toContain("__IBERFIT_P0_BROWSER_RELEASE__='n'");
  expect(afterUpgrade.session?.user?.id).toBe('p0-browser-user');
  expect(afterUpgrade.rawSession).toContain('p0-browser-token');
  expect(afterUpgrade.draft).toContain('"revision":7');
  expect(afterUpgrade.controller).toContain('/m26/iberfit-sw.js');

  // This fixture keeps runtime disabled to avoid any backend/auth dependency.
  // Exercise the exact production WARM_RELEASE message contract against the real N worker;
  // the structural P0 test separately locks that the app emits this only after full readiness.
  await page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.ready;
    registration.active?.postMessage({type:'WARM_RELEASE'});
  });
  await expect.poll(async()=>Number((await state(request)).optionalFailures),{
    timeout:15_000,
    intervals:[100,250,500,1000],
  }).toBeGreaterThan(0);

  const warmEvidence=await page.evaluate(async({currentCache})=>{
    const cache=await caches.open(currentCache);
    return (await cache.keys()).map((request)=>new URL(request.url).pathname);
  },{currentCache:CURRENT_CACHE});
  expect(warmEvidence.length).toBeGreaterThan(9);
  expect(warmEvidence).not.toContain('/m26/iri-report.html');

  const serverEvidence=await state(request);
  expect(serverEvidence.release).toBe('n');
  expect(serverEvidence.optionalFail).toBe(true);
  expect(serverEvidence.optionalFailures).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
