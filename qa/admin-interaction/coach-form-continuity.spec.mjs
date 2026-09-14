import {test,expect} from '@playwright/test';

function browserErrors(page){
  const errors=[];
  page.on('pageerror',(error)=>errors.push(String(error?.message||error)));
  page.on('console',(message)=>{if(message.type()==='error')errors.push('console:'+message.text());});
  return errors;
}

test('Coach client onboarding inputs and selects survive background shell refreshes',async({page,browserName})=>{
  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/coach-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__?.mounted===true)).toBe(true);

  const details=page.locator('[data-client-onboarding]');
  await expect(details).toBeVisible();
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open','');

  const form=page.locator('[data-workflow-form="client-onboarding"]');
  await expect(form).toBeVisible();
  await form.evaluate((node)=>{node.dataset.qaFormIdentity='coach-onboarding-stable';});

  const name=form.locator('input[name="name"]');
  await name.click();
  await expect(name).toBeFocused();
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.startRefreshBurst({count:40,intervalMs:7}));
  await page.keyboard.type('Cliente estable mientras actualiza',{delay:12});
  await expect(name).toHaveValue('Cliente estable mientras actualiza');
  await expect(name).toBeFocused();
  await expect(form).toHaveAttribute('data-qa-form-identity','coach-onboarding-stable');

  const email=form.locator('input[name="email"]');
  await email.click();
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.queueShellRefresh());
  await page.keyboard.type('cliente.estable@example.com',{delay:8});
  await expect(email).toHaveValue('cliente.estable@example.com');
  await expect(form).toHaveAttribute('data-qa-form-identity','coach-onboarding-stable');

  const sex=form.locator('select[name="sexForNorms"]');
  await sex.click();
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.startRefreshBurst({count:18,intervalMs:10}));
  await sex.selectOption('female');
  await expect(sex).toHaveValue('female');
  await expect(form).toHaveAttribute('data-qa-form-identity','coach-onboarding-stable');

  const channel=form.locator('select[name="preferredContactChannel"]');
  await channel.selectOption('Correo electrónico');
  await expect(channel).toHaveValue('Correo electrónico');

  const hit=await name.evaluate((node)=>{
    const box=node.getBoundingClientRect();
    const top=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
    return top===node||Boolean(node.contains?.(top));
  });
  expect(hit,'No decorative layer may intercept form controls').toBe(true);

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});

test('Coach productivity is a dark V3 surface and its controls remain interactive',async({page,browserName})=>{
  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/coach-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__?.mounted===true)).toBe(true);

  const toolbar=page.locator('[data-coach-productivity-toolbar]');
  await expect(toolbar).toBeVisible();
  const visual=await toolbar.evaluate((node)=>{
    const style=getComputedStyle(node);
    const input=node.querySelector('[data-coach-view-name]');
    const select=node.querySelector('[data-coach-saved-view]');
    return {
      backgroundImage:style.backgroundImage,
      color:style.color,
      inputBackground:input?getComputedStyle(input).backgroundColor:'',
      selectBackground:select?getComputedStyle(select).backgroundColor:'',
    };
  });
  expect(visual.backgroundImage).toContain('linear-gradient');
  expect(visual.backgroundImage).not.toContain('rgb(255, 255, 255)');
  expect(visual.inputBackground).not.toBe('rgb(255, 255, 255)');
  expect(visual.selectBackground).not.toBe('rgb(255, 255, 255)');

  const viewName=toolbar.locator('[data-coach-view-name]');
  await viewName.click();
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.startRefreshBurst({count:28,intervalMs:8}));
  await page.keyboard.type('Seguimiento activo',{delay:10});
  await expect(viewName).toHaveValue('Seguimiento activo');

  const saved=toolbar.locator('[data-coach-saved-view]');
  await saved.click();
  await expect(saved).toBeFocused();

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});
