import {test,expect} from '@playwright/test';

function browserErrors(page){
  const errors=[];
  page.on('pageerror',(error)=>errors.push(String(error?.message||error)));
  page.on('console',(message)=>{if(message.type()==='error')errors.push(`console:${message.text()}`);});
  return errors;
}

async function queueRenderOnNextRelease(page,{direct=false}={}){
  await page.evaluate(({direct})=>{
    const root=document.querySelector('#qa-root');
    if(!root)throw new Error('QA_REAL_CLIENT_ONBOARDING_ROOT_MISSING');
    root.addEventListener('pointerup',()=>{
      const api=globalThis.__IBERFIT_REAL_CLIENT_ONBOARDING_QA__;
      if(direct)api?.forceExternalRender?.();
      else api?.queueShellRefresh?.();
    },{capture:true,once:true});
  },{direct});
}

async function rememberNode(locator,key){
  await locator.evaluate((node,key)=>{
    globalThis.__IBERFIT_REAL_ONBOARDING_NODES__=globalThis.__IBERFIT_REAL_ONBOARDING_NODES__||Object.create(null);
    globalThis.__IBERFIT_REAL_ONBOARDING_NODES__[key]=node;
  },key);
}

async function expectSameNode(locator,key){
  expect(await locator.evaluate((node,key)=>globalThis.__IBERFIT_REAL_ONBOARDING_NODES__?.[key]===node,key),key).toBe(true);
}

async function activate(page,locator,touch){
  await locator.scrollIntoViewIfNeeded();
  if(touch){
    await locator.tap();
    return;
  }
  const box=await locator.boundingBox();
  expect(box,'editable control must have a pointer box').not.toBeNull();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.up();
}

test('canonical client onboarding survives release, rerender races and keeps every editable control usable',async({page,browserName},testInfo)=>{
  const errors=browserErrors(page);
  const touch=/mobile|tablet/iu.test(testInfo.project.name);
  await page.goto('/qa/admin-interaction/real-client-onboarding.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_REAL_CLIENT_ONBOARDING_QA__?.mounted===true)).toBe(true);

  const details=page.locator('[data-client-onboarding]');
  await expect(details).toBeVisible();
  if(!await details.evaluate((node)=>node.open))await details.locator('summary').click();
  await expect(details).toHaveJSProperty('open',true);

  const form=page.locator('[data-workflow-form="client-onboarding"]');
  await expect(form).toBeVisible();
  await form.evaluate((node)=>{node.dataset.qaCanonicalIdentity='client-onboarding';});

  const name=form.locator('input[name="name"]');
  await rememberNode(name,'name');
  await queueRenderOnNextRelease(page,{direct:true});
  await activate(page,name,touch);
  await page.waitForTimeout(180);
  await expectSameNode(name,'name');
  await expect(name).toBeFocused();
  await page.keyboard.type('Cliente foco real QA');
  await expect(name).toHaveValue('Cliente foco real QA');

  // Release the controller's delayed stale local draft only after the user has edited.
  // The workflow controller must keep the user's live edit authoritative.
  await page.evaluate(()=>globalThis.__IBERFIT_REAL_CLIENT_ONBOARDING_QA__?.releaseDraftLoad?.());
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_REAL_CLIENT_ONBOARDING_QA__?.draftLoadResolved?.()===true)).toBe(true);
  await expect(name).toHaveValue('Cliente foco real QA');

  const email=form.locator('input[name="email"]');
  await expect(email).toHaveValue('');
  await queueRenderOnNextRelease(page);
  await activate(page,email,touch);
  await page.waitForTimeout(180);
  await expect(email).toBeFocused();
  await page.keyboard.type('foco.real.qa@example.com');
  await expect(email).toHaveValue('foco.real.qa@example.com');
  await expect(name).toHaveValue('Cliente foco real QA');

  const birthDate=form.locator('input[name="birthDate"]');
  await queueRenderOnNextRelease(page,{direct:true});
  await activate(page,birthDate,touch);
  await birthDate.fill('1990-05-14');
  await expect(birthDate).toHaveValue('1990-05-14');

  const sex=form.locator('select[name="sexForNorms"]');
  await rememberNode(sex,'sexForNorms');
  await queueRenderOnNextRelease(page,{direct:true});
  await activate(page,sex,touch);
  await page.waitForTimeout(120);
  await expectSameNode(sex,'sexForNorms');
  if(!touch)await expect(sex).toBeFocused();
  await sex.selectOption('female');
  await expect(sex).toHaveValue('female');

  const channel=form.locator('select[name="preferredContactChannel"]');
  await rememberNode(channel,'preferredContactChannel');
  await queueRenderOnNextRelease(page);
  await activate(page,channel,touch);
  await page.waitForTimeout(120);
  await expectSameNode(channel,'preferredContactChannel');
  await channel.selectOption({label:'Correo electrónico'});
  await expect(channel).toHaveValue('Correo electrónico');

  const access=form.locator('textarea[name="accessInstructions"]');
  await queueRenderOnNextRelease(page,{direct:true});
  await activate(page,access,touch);
  await page.waitForTimeout(180);
  await expect(access).toBeFocused();
  await page.keyboard.type('Acceso por conserjería, llamar al llegar.');
  await expect(access).toHaveValue('Acceso por conserjería, llamar al llegar.');

  const search=page.locator('[data-client-search]');
  await rememberNode(search,'clientSearch');
  await queueRenderOnNextRelease(page,{direct:true});
  await activate(page,search,touch);
  await page.waitForTimeout(180);
  await expectSameNode(search,'clientSearch');
  await expect(search).toBeFocused();
  await page.keyboard.type('María');
  await expect(search).toHaveValue('María');

  const iriFilter=page.locator('[data-client-filter="iri"]');
  await rememberNode(iriFilter,'iriFilter');
  await queueRenderOnNextRelease(page);
  await activate(page,iriFilter,touch);
  await page.waitForTimeout(120);
  await expectSameNode(iriFilter,'iriFilter');
  await iriFilter.selectOption('pending');
  await expect(iriFilter).toHaveValue('pending');

  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_REAL_CLIENT_ONBOARDING_QA__?.draftSaveCount?.()||0)).toBeGreaterThan(0);
  await expect(form).toHaveAttribute('data-qa-canonical-identity','client-onboarding');
  await expect(name).toHaveValue('Cliente foco real QA');
  await expect(email).toHaveValue('foco.real.qa@example.com');
  await expect(birthDate).toHaveValue('1990-05-14');
  await expect(sex).toHaveValue('female');
  await expect(channel).toHaveValue('Correo electrónico');
  await expect(access).toHaveValue('Acceso por conserjería, llamar al llegar.');
  await expect(details).toHaveJSProperty('open',true);
  expect(await page.evaluate(()=>globalThis.__IBERFIT_REAL_CLIENT_ONBOARDING_QA__?.activeArea())).toBe('clientes');

  if(touch){
    for(const control of [name,email,sex,channel,access,search,iriFilter]){
      const metrics=await control.evaluate((node)=>({height:node.getBoundingClientRect().height,fontSize:parseFloat(getComputedStyle(node).fontSize)}));
      expect(metrics.height).toBeGreaterThanOrEqual(44);
      expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
    }
  }

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});
