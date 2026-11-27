import {test,expect} from '@playwright/test';

function observeRuntime(page){
  const errors=[];
  const externalRequests=[];

  page.on('pageerror',(error)=>errors.push(`pageerror:${error.message}`));
  page.on('console',(message)=>{
    if(message.type()==='error')errors.push(`console:${message.text()}`);
  });
  page.on('requestfailed',(request)=>{
    errors.push(`requestfailed:${request.method()}:${request.url()}:${request.failure()?.errorText||'unknown'}`);
  });
  page.on('request',(request)=>{
    const url=new URL(request.url());
    if(!['127.0.0.1','localhost'].includes(url.hostname)&&!['data:','blob:'].includes(url.protocol)){
      externalRequests.push(request.url());
    }
  });

  return {errors,externalRequests};
}

test('preauth-disabled-runtime actual launch candidate has no console network or layout failures',async({page})=>{
  const observed=observeRuntime(page);
  const response=await page.goto('/',{waitUntil:'networkidle'});

  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle('IBERFIT');
  await expect(page.locator('html')).toHaveAttribute('lang','es-ES');
  // The current static private access shell deliberately hides the credential
  // form when runtime is disabled. Verify the settled state, not legacy copy.
  await expect(page.getByRole('heading',{name:'Acceso privado',exact:true})).toBeVisible();
  await expect(page.locator('.m26-auth-page')).toHaveAttribute('data-auth-state','unavailable');
  await expect(page.locator('.m26-auth-card')).toHaveAttribute('aria-busy','false');
  const form=page.locator('[data-auth-form="login"]');
  await expect(form).toBeHidden();
  await expect(form).toHaveAttribute('aria-hidden','true');
  await expect(form.locator('button[type="submit"]')).toBeDisabled();
  const warning=page.locator('.m26-auth-actions[role="status"]');
  await expect(warning).toBeVisible();
  await expect(warning).toHaveText('Acceso no disponible temporalmente.');

  const layout=await page.evaluate(()=>({
    documentWidth:document.documentElement.scrollWidth,
    viewportWidth:document.documentElement.clientWidth,
    runtimeEnabled:Boolean(globalThis.__IBERFIT_M26_RUNTIME__?.enabled),
    appMounted:Boolean(globalThis.__IBERFIT_M26_APP__),
  }));

  expect(layout.runtimeEnabled).toBe(false);
  expect(layout.appMounted).toBe(true);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth+1);
  const quality=await page.evaluate(async()=>{
    const collector=await globalThis.__IBERFIT_M26_QUALITY_OBSERVABILITY_READY__;
    return collector?.snapshot?.()||null;
  });
  expect(quality?.schemaVersion).toBe('iberfit.quality-runtime-observability.v1');
  expect(quality?.storage).toBe('memory-only');
  expect(quality?.transport).toBe('none');
  expect(quality?.identityIncluded).toBe(false);
  expect(quality?.healthDataIncluded).toBe(false);
  expect(quality?.runtimeErrorDetailsIncluded).toBe(false);
  expect(quality?.urlIncluded).toBe(false);
  expect(quality?.stackIncluded).toBe(false);
  expect(quality?.measurement).toBe('field-local-session');
  expect(quality?.aggregation).toBe('none');
  expect(quality?.fieldP75Claimed).toBe(false);
  expect(quality?.inpClaimed).toBe(false);
  expect(quality?.metrics?.interactionLatencyLabel).toBe('candidate-not-inp');
  expect(quality?.metrics?.runtimeErrorCount).toBe(0);
  expect(quality?.metrics?.resourceErrorCount).toBe(0);
  expect(quality?.metrics?.unhandledRejectionCount).toBe(0);
  expect(quality?.metrics?.securityPolicyViolationCount).toBe(0);
  expect(quality?.metrics).toHaveProperty('fcpMs');
  expect(quality?.metrics).toHaveProperty('lcpMs');
  expect(quality?.metrics).toHaveProperty('cls');
  expect(quality?.metrics).toHaveProperty('longFrameCount');

  expect(observed.externalRequests).toEqual([]);
  expect(observed.errors).toEqual([]);
  // Validate the local QA server matches the deployed root worker contract.
  const worker=await page.request.head('/m26/iberfit-sw.js');
  expect(worker.ok()).toBeTruthy();
  expect(worker.headers()['service-worker-allowed']).toBe('/');
  const ordinary=await page.request.head('/m26/app.js');
  expect(ordinary.headers()['service-worker-allowed']).toBeUndefined();
});