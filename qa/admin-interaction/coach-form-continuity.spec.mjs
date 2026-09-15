import {test,expect} from '@playwright/test';

async function queueCoachRefreshDuringNextTouchRelease(page){
  await page.evaluate(()=>{
    const root=document.querySelector('#qa-root');
    if(!root)throw new Error('QA_COACH_FORM_ROOT_MISSING');
    root.addEventListener('pointerup',()=>{
      globalThis.__IBERFIT_COACH_FORM_QA__?.queueShellRefresh?.();
    },{capture:true,once:true});
  });
}

function browserErrors(page){
  const errors=[];
  page.on('pageerror',(error)=>errors.push(String(error?.message||error)));
  page.on('console',(message)=>{if(message.type()==='error')errors.push('console:'+message.text());});
  return errors;
}


test('Coach create-client disclosure and text focus survive touch release plus a real shell rerender',async({page},testInfo)=>{
  const touchProject=testInfo.project.name.includes('mobile')||testInfo.project.name.includes('tablet');
  test.skip(!touchProject,'Touch-release regression only applies to touch projects.');

  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/coach-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__?.mounted===true)).toBe(true);

  const details=page.locator('[data-client-onboarding]');
  const summary=details.locator('summary');
  await queueCoachRefreshDuringNextTouchRelease(page);
  await summary.tap();
  await page.waitForTimeout(320);
  await expect(details).toHaveAttribute('open','');

  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.queueShellRefresh());
  await page.waitForTimeout(320);
  await expect(details).toHaveAttribute('open','');

  const name=details.locator('input[name="name"]');
  await queueCoachRefreshDuringNextTouchRelease(page);
  await name.tap();
  await page.waitForTimeout(320);
  await expect(name).toBeFocused();
  await page.keyboard.type('Persistente al soltar',{delay:6});
  await expect(name).toHaveValue('Persistente al soltar');
  await page.waitForTimeout(950);
  await expect(name).toBeFocused();
  await expect(details).toHaveAttribute('open','');

  expect(errors).toEqual([]);
});

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

  await name.scrollIntoViewIfNeeded();
  await name.click();
  await expect(name).toBeFocused();

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


async function rememberStableNode(locator,key){
  await locator.evaluate((node,stableKey)=>{
    globalThis.__IBERFIT_COACH_STABLE_NODES__=globalThis.__IBERFIT_COACH_STABLE_NODES__||Object.create(null);
    globalThis.__IBERFIT_COACH_STABLE_NODES__[stableKey]=node;
  },key);
}

async function expectStableNode(locator,key){
  const same=await locator.evaluate((node,stableKey)=>globalThis.__IBERFIT_COACH_STABLE_NODES__?.[stableKey]===node,key);
  expect(same,key+' must preserve the exact active DOM node').toBe(true);
}

async function refreshWhileSelecting(page,locator,key,value){
  await rememberStableNode(locator,key);
  await locator.click();
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.startRefreshBurst({count:24,intervalMs:8}));
  await locator.selectOption(value);
  await expect(locator).toHaveValue(value);
  await expectStableNode(locator,key);
}

test('Coach client list filters keep their exact DOM nodes through store refresh and controller hydration',async({page,browserName})=>{
  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/coach-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__?.mounted===true)).toBe(true);

  const search=page.locator('[data-client-search]');
  await rememberStableNode(search,'client-search');
  await search.click();
  await expect(search).toBeFocused();
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.startRefreshBurst({count:36,intervalMs:7}));
  await page.keyboard.type('ana seguimiento',{delay:9});
  await expect(search).toHaveValue('ana seguimiento');
  await expect(search).toBeFocused();
  await expectStableNode(search,'client-search');

  await refreshWhileSelecting(page,page.locator('[data-client-filter="iri"]'),'filter-iri','completed');
  await refreshWhileSelecting(page,page.locator('[data-client-filter="modality"]'),'filter-modality','online');
  await refreshWhileSelecting(page,page.locator('[data-client-filter="stage"]'),'filter-stage','active');
  await refreshWhileSelecting(page,page.locator('[data-client-sort]'),'filter-sort','name');

  const viewName=page.locator('[data-coach-view-name]');
  await rememberStableNode(viewName,'view-name');
  await viewName.click();
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.startRefreshBurst({count:28,intervalMs:8}));
  await page.keyboard.type('Vista QA estable',{delay:8});
  await expect(viewName).toHaveValue('Vista QA estable');
  await expect(viewName).toBeFocused();
  await expectStableNode(viewName,'view-name');

  await page.locator('[data-coach-save-view]').click();
  const saved=page.locator('[data-coach-saved-view]');
  await expect(saved.locator('option')).toContainText(['Seleccionar vista…','Vista QA estable']);
  await rememberStableNode(saved,'saved-view');
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.startRefreshBurst({count:20,intervalMs:8}));
  await saved.selectOption({label:'Vista QA estable'});
  await expect(saved).not.toHaveValue('');
  await expectStableNode(saved,'saved-view');

  await page.evaluate(()=>document.activeElement?.blur?.());
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.setClientScenario('one'));
  await expect(page.locator('.m26-client-card h3').filter({hasText:/^Ana Pérez$/u})).toHaveCount(1);
  await expect(page.locator('[data-client-search]')).toBeVisible();

  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.setClientScenario('zero'));
  await expect(page.getByText('Todavía no hay clientes',{exact:true})).toBeVisible();
  await expect(page.locator('[data-client-search]')).toBeVisible();

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});

test('Coach create-client keeps all daily-use fields usable while shell state refreshes',async({page,browserName})=>{
  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/coach-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__?.mounted===true)).toBe(true);

  const details=page.locator('[data-client-onboarding]');
  await details.locator('summary').click();
  const form=page.locator('[data-workflow-form="client-onboarding"]');
  await expect(form).toBeVisible();

  const typeCases=[
    ['name','Ana Pérez'],
    ['email','ana.perez@example.com'],
    ['phone','+56955550101'],
    ['genderIdentity','Mujer'],
    ['pronouns','ella'],
    ['commune','Las Condes'],
    ['trainingAddress','Av. Apoquindo 1234'],
    ['preferredSchedule','Lunes y jueves 18:00'],
  ];
  for(const [name,value] of typeCases){
    const control=form.locator(`[name="${name}"]`);
    await rememberStableNode(control,'field-'+name);
    await control.click();
    await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.startRefreshBurst({count:18,intervalMs:7}));
    await page.keyboard.type(value,{delay:5});
    await expect(control).toHaveValue(value);
    await expect(control).toBeFocused();
    await expectStableNode(control,'field-'+name);
  }

  const birthDate=form.locator('[name="birthDate"]');
  await rememberStableNode(birthDate,'field-birthDate');
  await birthDate.fill('1991-05-20');
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.queueShellRefresh());
  await expect(birthDate).toHaveValue('1991-05-20');
  await expectStableNode(birthDate,'field-birthDate');

  const selectCases=[
    ['sexForNorms','female'],
    ['preferredContactChannel','Correo electrónico'],
    ['modality','hibrido'],
    ['locationType','Exterior'],
    ['experienceLevel','Intermedia'],
  ];
  for(const [name,value] of selectCases){
    await refreshWhileSelecting(page,form.locator(`select[name="${name}"]`),'field-'+name,value);
  }

  const numberCases=[
    ['weeklyFrequency','3'],
    ['sessionDurationMinutes','75'],
  ];
  for(const [name,value] of numberCases){
    const control=form.locator(`input[name="${name}"]`);
    await rememberStableNode(control,'field-'+name);
    await control.fill(value);
    await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.queueShellRefresh());
    await expect(control).toHaveValue(value);
    await expectStableNode(control,'field-'+name);
  }

  const textareas=[
    ['accessInstructions','Conserjería avisada.'],
    ['primaryObjective','Mejorar fuerza y capacidad funcional con seguimiento.'],
    ['trainingHistory','Entrenamiento previo irregular, sin incidencias registradas.'],
  ];
  for(const [name,value] of textareas){
    const control=form.locator(`textarea[name="${name}"]`);
    await rememberStableNode(control,'field-'+name);
    await control.click();
    await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.startRefreshBurst({count:18,intervalMs:7}));
    await page.keyboard.type(value,{delay:4});
    await expect(control).toHaveValue(value);
    await expect(control).toBeFocused();
    await expectStableNode(control,'field-'+name);
  }

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});


test('Focused form buttons never retain the persistent shell interaction lease',async({page,browserName})=>{
  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/coach-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__?.mounted===true)).toBe(true);

  const button=page.locator('[data-coach-save-view]');
  await button.focus();
  await expect(button).toBeFocused();

  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.setClientScenario('one'));
  await expect(page.locator('.m26-client-card h3').filter({hasText:/^Ana Pérez$/u})).toBeVisible();

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});
