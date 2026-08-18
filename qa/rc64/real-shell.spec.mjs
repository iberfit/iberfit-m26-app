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
  await expect(page.getByRole('heading',{name:'Entrenamiento personal con criterio'})).toBeVisible();
  await expect(page.getByText('Diagnóstico, planificación, control y seguimiento.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Entrar'})).toBeDisabled();

  const warning=page.locator('.m26-notice.is-warning');
  await expect(warning).toBeVisible();
  await expect(warning).toHaveText(/\S+/u);

  const layout=await page.evaluate(()=>({
    documentWidth:document.documentElement.scrollWidth,
    viewportWidth:document.documentElement.clientWidth,
    runtimeEnabled:Boolean(globalThis.__IBERFIT_M26_RUNTIME__?.enabled),
    appMounted:Boolean(globalThis.__IBERFIT_M26_APP__),
  }));

  expect(layout.runtimeEnabled).toBe(false);
  expect(layout.appMounted).toBe(true);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth+1);
  expect(observed.externalRequests).toEqual([]);
  expect(observed.errors).toEqual([]);
});