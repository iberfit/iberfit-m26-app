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

  await form.locator('[data-client-step="2"] [data-client-wizard-next]').click();
  await expect(form.locator('[data-client-step="3"]')).toBeVisible();
  await expect(form.locator('select[name="modality"]')).toHaveValue('Híbrido');
  await expect(form.locator('input[name="weeklyFrequency"]')).toHaveValue('2');
  await expect(access).toHaveValue('Acceso por conserjería; llamar al llegar.');

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});


test('touch tap gives text fields native focus before typing and releases the mobile nav',async({page,browserName},testInfo)=>{
  const touchProject=testInfo.project.name.includes('mobile')||testInfo.project.name.includes('tablet');
  test.skip(!touchProject,'Touch-entry contract only applies to touch projects.');

  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/client-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_CLIENT_FORM_QA__?.mounted===true)).toBe(true);

  await page.evaluate(()=>{
    globalThis.__IBERFIT_TOUCH_POINTERS__=[];
    document.addEventListener('pointerdown',(event)=>{
      const target=event.target?.closest?.('input,textarea');
      if(target)globalThis.__IBERFIT_TOUCH_POINTERS__.push(String(event.pointerType||''));
    },true);
  });

  const root=page.locator('#qa-root');
  const form=page.locator('[data-admin-form="client-create"]');
  const name=form.locator('input[name="name"]');
  await name.scrollIntoViewIfNeeded();
  await name.evaluate((node)=>node.blur());
  await name.tap();

  await expect(name).toBeFocused();
  await expect(root).toHaveAttribute('data-m26-text-entry-active','true');
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_TOUCH_POINTERS__?.at(-1)||'')).toBe('touch');

  const hit=await name.evaluate((node)=>{
    const rect=node.getBoundingClientRect();
    const x=rect.left+rect.width/2;
    const y=rect.top+rect.height/2;
    const top=document.elementFromPoint(x,y);
    return top===node||Boolean(node.contains?.(top));
  });
  expect(hit).toBe(true);

  const nav=page.locator('.m26-mobile-nav');
  if(await nav.count()){
    await expect(nav).toHaveCSS('pointer-events','none');
    await expect(nav).toHaveCSS('opacity','0');
  }

  await page.keyboard.type('Cliente táctil');
  await expect(name).toHaveValue('Cliente táctil');

  const email=form.locator('input[name="email"]');
  await email.tap();
  await expect(email).toBeFocused();
  await page.keyboard.type('touch.qa@example.com');
  await expect(email).toHaveValue('touch.qa@example.com');

  await email.evaluate((node)=>node.blur());
  await expect.poll(()=>root.getAttribute('data-m26-text-entry-active')).toBeNull();

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});
