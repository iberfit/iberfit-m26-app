import {test,expect} from '@playwright/test';

function rgb(value){
  const match=String(value||'').match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/u);
  return match?match.slice(1,4).map(Number):null;
}
function luminanceApprox(tuple){
  if(!tuple)return null;
  return tuple.reduce((sum,value)=>sum+value,0)/3;
}
async function metrics(locator){
  return locator.evaluate((element)=>{
    const style=getComputedStyle(element);
    const box=element.getBoundingClientRect();
    return {
      color:style.color,
      backgroundColor:style.backgroundColor,
      caretColor:style.caretColor,
      colorScheme:style.colorScheme,
      fontSize:parseFloat(style.fontSize),
      height:box.height,
      scrollMarginBlockStart:style.scrollMarginBlockStart,
      scrollMarginBlockEnd:style.scrollMarginBlockEnd,
    };
  });
}

test('authenticated fields stay dark legible and focus-safe across browser/device matrix',async({page},testInfo)=>{
  const errors=[];
  page.on('pageerror',(error)=>errors.push(String(error?.message||error)));
  page.on('console',(message)=>{if(message.type()==='error')errors.push('console:'+message.text());});

  await page.goto('/qa/admin-interaction/fixture.html?route=clients',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ADMIN_INTERACTION_QA__?.mounted===true)).toBe(true);

  const form=page.locator('[data-admin-form="client-create"]');
  const name=form.locator('input[name="name"]');
  const email=form.locator('input[name="email"]');
  await name.fill('Control visual IBERFIT');
  await email.fill('control.visual.qa@example.com');
  await name.focus();
  await expect(name).toBeFocused();

  const inputMetrics=await metrics(name);
  const inputBg=luminanceApprox(rgb(inputMetrics.backgroundColor));
  const inputFg=luminanceApprox(rgb(inputMetrics.color));
  expect(inputMetrics.colorScheme.toLowerCase()).toContain('dark');
  expect(inputBg,'authenticated input must remain materially dark').not.toBeNull();
  expect(inputBg).toBeLessThan(110);
  expect(inputFg,'authenticated input text must remain light').not.toBeNull();
  expect(inputFg).toBeGreaterThan(150);
  expect(inputMetrics.caretColor).not.toBe(inputMetrics.backgroundColor);
  expect(parseFloat(inputMetrics.scrollMarginBlockStart)).toBeGreaterThanOrEqual(80);
  expect(parseFloat(inputMetrics.scrollMarginBlockEnd)).toBeGreaterThanOrEqual(90);

  await form.locator('[data-client-step="1"] [data-client-wizard-next]').click();
  await expect(form.locator('[data-client-step="2"]')).toBeVisible();
  const modality=form.locator('select[name="modality"]');
  await modality.focus();
  await expect(modality).toBeFocused();
  const selectMetrics=await metrics(modality);
  const selectBg=luminanceApprox(rgb(selectMetrics.backgroundColor));
  const selectFg=luminanceApprox(rgb(selectMetrics.color));
  expect(selectMetrics.colorScheme.toLowerCase()).toContain('dark');
  expect(selectBg).not.toBeNull();
  expect(selectBg).toBeLessThan(110);
  expect(selectFg).not.toBeNull();
  expect(selectFg).toBeGreaterThan(150);

  if(/mobile|tablet/u.test(testInfo.project.name)){
    expect(inputMetrics.fontSize).toBeGreaterThanOrEqual(16);
    expect(selectMetrics.fontSize).toBeGreaterThanOrEqual(16);
    expect(inputMetrics.height).toBeGreaterThanOrEqual(44);
    expect(selectMetrics.height).toBeGreaterThanOrEqual(44);
  }

  expect(errors).toEqual([]);
});
