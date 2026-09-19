import {test,expect} from '@playwright/test';

async function forceExternalRenderDuringNextPointerDownCapture(page){
  await page.evaluate(()=>{
    const root=document.querySelector('#qa-root');
    if(!root)throw new Error('QA_CLIENT_FORM_ROOT_MISSING');
    root.addEventListener('pointerdown',()=>{
      globalThis.__IBERFIT_CLIENT_FORM_QA__?.forceExternalRender?.();
    },{capture:true,once:true});
  });
}

async function rememberStableNode(locator,key){
  await locator.evaluate((node,stableKey)=>{
    globalThis.__IBERFIT_CLIENT_STABLE_NODES__=globalThis.__IBERFIT_CLIENT_STABLE_NODES__||Object.create(null);
    globalThis.__IBERFIT_CLIENT_STABLE_NODES__[stableKey]=node;
  },key);
}

async function expectStableNode(locator,key){
  const same=await locator.evaluate((node,stableKey)=>globalThis.__IBERFIT_CLIENT_STABLE_NODES__?.[stableKey]===node,key);
  expect(same,key+' must preserve the exact active DOM node').toBe(true);
}

async function mouseDownUpOnActionableControl(page,locator){
  await locator.scrollIntoViewIfNeeded();
  await expect(locator,'Control must be visible before a raw pointer interaction').toBeVisible();
  const box=await locator.boundingBox();
  expect(box,'Control must expose a stable pointer box').not.toBeNull();
  const point={x:box.x+box.width/2,y:box.y+box.height/2};
  const unobscured=await locator.evaluate((node,{x,y})=>{
    const hit=document.elementFromPoint(x,y);
    return hit===node||Boolean(node.contains?.(hit));
  },point);
  expect(unobscured,'Control center must be unobscured before the raw pointer sequence').toBe(true);
  await page.mouse.move(point.x,point.y);
  await page.mouse.down();
  await page.mouse.up();
}

function browserErrors(page){
  const errors=[];
  page.on('pageerror',(error)=>errors.push(String(error?.message||error)));
  page.on('console',(message)=>{if(message.type()==='error')errors.push('console:'+message.text());});
  return errors;
}

test('Admin client wizard raw mouse race targets the actionable control and preserves its node',async({page,browserName},testInfo)=>{
  const errors=browserErrors(page);
  const touchProject=/mobile|tablet/iu.test(testInfo.project.name);
  await page.goto('/qa/admin-interaction/client-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_CLIENT_FORM_QA__?.mounted===true)).toBe(true);

  const form=page.locator('[data-admin-form="client-create"]');
  await expect(form).toBeVisible();

  const name=form.locator('input[name="name"]');
  await name.evaluate((node)=>{node.dataset.qaStableIdentity='admin-real-mouse-name';});
  await rememberStableNode(name,'admin-real-mouse-name');
  await forceExternalRenderDuringNextPointerDownCapture(page);
  await mouseDownUpOnActionableControl(page,name);
  await page.waitForTimeout(120);

  await expect(name).toBeFocused();
  await expectStableNode(name,'admin-real-mouse-name');
  await expect(name).toHaveAttribute('data-qa-stable-identity','admin-real-mouse-name');
  await page.keyboard.type('Cliente admin un clic');
  await expect(name).toHaveValue('Cliente admin un clic');

  const sex=form.locator('select[name="sexForNorms"]');
  await sex.evaluate((node)=>{node.dataset.qaStableIdentity='admin-real-mouse-sex';});
  await rememberStableNode(sex,'admin-real-mouse-sex');
  await forceExternalRenderDuringNextPointerDownCapture(page);
  await mouseDownUpOnActionableControl(page,sex);
  await page.waitForTimeout(120);

  await expectStableNode(sex,'admin-real-mouse-sex');
  await expect(sex).toHaveAttribute('data-qa-stable-identity','admin-real-mouse-sex');
  if(touchProject){
    await sex.selectOption('female');
    await expect(sex).toHaveValue('female');
  }else{
    await expect(sex,'Desktop native select must retain focus after a complete mouse click').toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(sex).not.toHaveValue('');
  }
  await expect(name).toHaveValue('Cliente admin un clic');
  expect(errors,browserName+' emitted browser errors').toEqual([]);
});
