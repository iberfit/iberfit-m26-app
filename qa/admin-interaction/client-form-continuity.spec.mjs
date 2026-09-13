import {test,expect} from '@playwright/test';

function browserErrors(page){
  const errors=[];
  page.on('pageerror',(error)=>errors.push(String(error?.message||error)));
  page.on('console',(message)=>{if(message.type()==='error')errors.push('console:'+message.text());});
  return errors;
}

test('Nuevo cliente keeps inputs selects steps and textarea stable across queued shell refreshes',async({page,browserName})=>{
  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/client-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_CLIENT_FORM_QA__?.mounted===true)).toBe(true);

  const form=page.locator('[data-admin-form="client-create"]');
  await expect(form).toBeVisible();
  await form.evaluate((node)=>{node.dataset.qaFormIdentity='stable-client-create-form';});

  const name=form.locator('input[name="name"]');
  const email=form.locator('input[name="email"]');
  const phone=form.locator('input[name="phone"]');
  await name.fill('Cliente continuidad QA');
  await email.fill('continuidad.qa@example.com');
  await phone.fill('+56 9 5555 0202');

  await email.focus();
  await page.evaluate(()=>globalThis.__IBERFIT_CLIENT_FORM_QA__.queueShellRefresh());
  await page.waitForTimeout(50);
  await expect(email).toBeFocused();
  await expect(email).toHaveValue('continuidad.qa@example.com');
  await expect(form).toHaveAttribute('data-qa-form-identity','stable-client-create-form');

  const sex=form.locator('select[name="sexForNorms"]');
  await sex.click();
  await page.evaluate(()=>globalThis.__IBERFIT_CLIENT_FORM_QA__.queueShellRefresh());
  await sex.evaluate((node)=>node.blur());
  await page.waitForTimeout(50);
  await expect(form).toHaveAttribute('data-qa-form-identity','stable-client-create-form');
  await sex.selectOption('female');
  await expect(sex).toHaveValue('female');
  await expect(name).toHaveValue('Cliente continuidad QA');
  await expect(email).toHaveValue('continuidad.qa@example.com');

  await form.locator('[data-client-step="1"] [data-client-wizard-next]').click();
  await expect(form.locator('[data-client-step="2"]')).toBeVisible();
  await expect(name).toHaveValue('Cliente continuidad QA');
  await expect(sex).toHaveValue('female');

  await form.locator('select[name="modality"]').selectOption('Híbrido');
  await form.locator('input[name="weeklyFrequency"]').fill('2');
  await form.locator('input[name="sessionDurationMinutes"]').fill('60');
  const access=form.locator('textarea[name="accessInstructions"]');
  await access.fill('Acceso por conserjería; llamar al llegar.');

  await access.focus();
  await page.evaluate(()=>globalThis.__IBERFIT_CLIENT_FORM_QA__.queueShellRefresh());
  await page.waitForTimeout(50);
  await expect(access).toBeFocused();
  await expect(access).toHaveValue('Acceso por conserjería; llamar al llegar.');

  await form.locator('[data-client-step="2"] [data-client-wizard-next]').click();
  await expect(form.locator('[data-client-step="3"]')).toBeVisible();
  await expect(form.locator('select[name="modality"]')).toHaveValue('Híbrido');
  await expect(form.locator('input[name="weeklyFrequency"]')).toHaveValue('2');
  await expect(access).toHaveValue('Acceso por conserjería; llamar al llegar.');

  if(test.info().project.name.includes('mobile')||test.info().project.name.includes('tablet')){
    const controls=await Promise.all([
      form.locator('select[name="modality"]').evaluate((el)=>({height:el.getBoundingClientRect().height,fontSize:parseFloat(getComputedStyle(el).fontSize)})),
      access.evaluate((el)=>({height:el.getBoundingClientRect().height,fontSize:parseFloat(getComputedStyle(el).fontSize)})),
    ]);
    for(const metrics of controls){
      expect(metrics.height).toBeGreaterThanOrEqual(44);
      expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
    }
  }

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});
