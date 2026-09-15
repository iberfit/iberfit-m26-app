import {test,expect} from '@playwright/test';

async function queueClientRefreshDuringNextTouchRelease(page){
  await page.evaluate(()=>{
    const root=document.querySelector('#qa-root');
    if(!root)throw new Error('QA_CLIENT_FORM_ROOT_MISSING');
    root.addEventListener('pointerup',()=>{
      globalThis.__IBERFIT_CLIENT_FORM_QA__?.queueShellRefresh?.();
    },{capture:true,once:true});
  });
}

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
  await queueClientRefreshDuringNextTouchRelease(page);
  await name.tap();
  await page.waitForTimeout(320);

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
    const visibleBeforeFocus=await nav.evaluate((node)=>getComputedStyle(node).display!=='none');
    if(visibleBeforeFocus){
      await expect(nav).toHaveCSS('pointer-events','none');
      await expect(nav).toHaveCSS('opacity','0');
    }
  }

  await page.keyboard.type('Cliente táctil');
  await expect(name).toHaveValue('Cliente táctil');

  const email=form.locator('input[name="email"]');
  await queueClientRefreshDuringNextTouchRelease(page);
  await email.tap();
  await page.waitForTimeout(320);
  await expect(email).toBeFocused();
  await page.keyboard.type('touch.qa@example.com');
  await expect(email).toHaveValue('touch.qa@example.com');
  await page.waitForTimeout(950);
  await expect(email).toBeFocused();

  await email.evaluate((node)=>node.blur());
  await expect.poll(()=>root.getAttribute('data-m26-text-entry-active')).toBeNull();

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});


test('label taps keep text inputs and native selects alive while a shell refresh is queued',async({page},testInfo)=>{
  const touchProject=testInfo.project.name.includes('mobile')||testInfo.project.name.includes('tablet');
  test.skip(!touchProject,'Label-tap regression targets touch pointer behavior.');

  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/client-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_CLIENT_FORM_QA__?.mounted===true)).toBe(true);

  const form=page.locator('[data-admin-form="client-create"]');
  await form.evaluate((node)=>{node.dataset.qaFormIdentity='label-tap-form';});

  const name=form.locator('input[name="name"]');
  const nameLabel=form.locator('label:has(input[name="name"])').first();
  await nameLabel.evaluate((label)=>{
    if(label.querySelector('[data-qa-label-hit]'))return;
    const marker=document.createElement('span');
    marker.setAttribute('data-qa-label-hit','name');
    marker.textContent='Nombre completo';
    label.insertBefore(marker,label.firstChild);
  });
  await queueClientRefreshDuringNextTouchRelease(page);
  await nameLabel.locator('[data-qa-label-hit="name"]').tap();
  await expect(name).toBeFocused();
  await page.keyboard.type('Cliente por label');
  await expect(name).toHaveValue('Cliente por label');
  await expect(form).toHaveAttribute('data-qa-form-identity','label-tap-form');

  const sex=form.locator('select[name="sexForNorms"]');
  const sexLabel=form.locator('label:has(select[name="sexForNorms"])').first();
  await sexLabel.evaluate((label)=>{
    if(label.querySelector('[data-qa-label-hit]'))return;
    const marker=document.createElement('span');
    marker.setAttribute('data-qa-label-hit','sex');
    marker.textContent='Sexo para baremos IRI';
    label.insertBefore(marker,label.firstChild);
  });
  await sex.evaluate((node)=>{
    globalThis.__IBERFIT_QA_SELECT_NODE__=node;
  });
  await queueClientRefreshDuringNextTouchRelease(page);
  await sexLabel.locator('[data-qa-label-hit="sex"]').tap();
  await page.waitForTimeout(120);
  const sameSelect=await sex.evaluate((node)=>globalThis.__IBERFIT_QA_SELECT_NODE__===node);
  expect(sameSelect,'Native select must not be replaced between label tap and selection').toBe(true);
  await sex.selectOption('female');
  await expect(sex).toHaveValue('female');
  await expect(name).toHaveValue('Cliente por label');

  expect(errors).toEqual([]);
});

test('real client form survives transient mobile blur while a shell refresh is queued',async({page},testInfo)=>{
  const touchProject=testInfo.project.name.includes('mobile')||testInfo.project.name.includes('tablet');
  test.skip(!touchProject,'Transient blur regression targets touch/browser keyboard behavior.');

  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/client-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_CLIENT_FORM_QA__?.mounted===true)).toBe(true);

  const form=page.locator('[data-admin-form="client-create"]');
  await form.evaluate((node)=>{node.dataset.qaFormIdentity='transient-blur-form';});
  const name=form.locator('input[name="name"]');

  await name.tap();
  await page.keyboard.type('Cliente real');
  await expect(name).toHaveValue('Cliente real');

  await page.evaluate(()=>globalThis.__IBERFIT_CLIENT_FORM_QA__.queueShellRefresh());
  await name.evaluate((node)=>node.blur());
  await page.waitForTimeout(1600);

  await expect(form).toHaveAttribute('data-qa-form-identity','transient-blur-form');
  await expect(name).toHaveValue('Cliente real');

  await name.tap();
  await page.keyboard.type(' estable');
  await expect(name).toHaveValue('Cliente real estable');

  await page.waitForTimeout(1300);
  await expect(name).toHaveValue('Cliente real estable');
  expect(errors).toEqual([]);
});
