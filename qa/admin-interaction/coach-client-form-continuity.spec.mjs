import {test,expect} from '@playwright/test';

function browserErrors(page){
  const errors=[];
  page.on('pageerror',(error)=>errors.push(String(error?.message||error)));
  page.on('console',(message)=>{if(message.type()==='error')errors.push('console:'+message.text());});
  return errors;
}

test('Coach client onboarding keeps native inputs and selects stable across shell refreshes',async({page,browserName},testInfo)=>{
  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/coach-client-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_CLIENT_FORM_QA__?.mounted===true)).toBe(true);

  const details=page.locator('[data-client-onboarding]');
  await expect(details).toBeVisible();
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open','');

  const form=page.locator('[data-workflow-form="client-onboarding"]');
  const name=form.locator('input[name="name"]');
  const email=form.locator('input[name="email"]');
  const sex=form.locator('select[name="sexForNorms"]');
  const channel=form.locator('select[name="preferredContactChannel"]');

  await name.fill('Cliente Coach QA');
  await email.fill('coach.form.qa@example.com');

  await email.focus();
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_CLIENT_FORM_QA__.queueShellRefresh());
  await page.waitForTimeout(40);
  await expect(email).toBeFocused();
  await expect(email).toHaveValue('coach.form.qa@example.com');
  await expect(name).toHaveValue('Cliente Coach QA');

  await sex.click();
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_CLIENT_FORM_QA__.queueShellRefresh());
  await sex.selectOption('female');
  await expect(sex).toHaveValue('female');
  await expect(name).toHaveValue('Cliente Coach QA');

  await channel.selectOption('Correo electrónico');
  await expect(channel).toHaveValue('Correo electrónico');

  const history=form.locator('textarea[name="trainingHistory"]');
  await history.fill('Entrenamiento previo estable; prueba de continuidad del formulario.');
  await history.focus();
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_CLIENT_FORM_QA__.queueShellRefresh());
  await page.waitForTimeout(40);
  await expect(history).toBeFocused();
  await expect(history).toHaveValue('Entrenamiento previo estable; prueba de continuidad del formulario.');

  const touch=testInfo.project.name.includes('mobile')||testInfo.project.name.includes('tablet');
  if(touch){
    const metrics=await Promise.all([
      sex.evaluate((el)=>({height:el.getBoundingClientRect().height,fontSize:parseFloat(getComputedStyle(el).fontSize)})),
      name.evaluate((el)=>({height:el.getBoundingClientRect().height,fontSize:parseFloat(getComputedStyle(el).fontSize)})),
    ]);
    for(const item of metrics){
      expect(item.height).toBeGreaterThanOrEqual(44);
      expect(item.fontSize).toBeGreaterThanOrEqual(16);
    }
  }

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});

test('Coach productivity surface is dark V3 and its controls remain interactive',async({page,browserName})=>{
  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/coach-client-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_CLIENT_FORM_QA__?.mounted===true)).toBe(true);

  const toolbar=page.locator('[data-coach-productivity-toolbar]');
  await expect(toolbar).toBeVisible();
  const visual=await toolbar.evaluate((node)=>{
    const style=getComputedStyle(node);
    return {backgroundImage:style.backgroundImage,color:style.color};
  });
  expect(visual.backgroundImage).not.toContain('255, 253, 248');
  expect(visual.backgroundImage).not.toContain('248, 244, 235');

  const name=toolbar.locator('[data-coach-view-name]');
  const select=toolbar.locator('[data-coach-saved-view]');
  await name.fill('Seguimiento QA');
  await expect(name).toHaveValue('Seguimiento QA');
  await select.click();
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_CLIENT_FORM_QA__.queueShellRefresh());
  await expect(select).toBeFocused();

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});
