import {test,expect} from '@playwright/test';

test('Coach primary session action preserves the appointment context through the real workflow controller',async({page},testInfo)=>{
  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/coach-form-continuity.fixture.html');
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__?.mounted===true)).toBe(true);
  await page.evaluate(async()=>{
    const [{renderSessionsRoute},{buildNextSessionPreparation},{createWorkflowController}]=await Promise.all([
      import('/src/m26/modules/route-render.js'),
      import('/src/m26/intelligence/next-session-prep.js'),
      import('/src/m26/app/workflow-controller.js'),
    ]);
    const clientId='context-client-qa';
    const sessions=[
      {id:'scheduled-qa',clientId,status:'publicado',title:'Sesión de la cita',revision:1},
      {id:'other-qa',clientId,status:'publicado',title:'Otro plan',revision:99},
    ];
    const state={identity:{id:'coach-qa',role:'coach'},selectedClientId:clientId,collections:{
      clients:[{id:clientId,name:'Cliente sintético',trainingServiceStatus:'active'}],sessions,
      appointments:[{id:'appointment-qa',clientId,sessionId:'scheduled-qa',status:'confirmada',startAt:'2026-10-08T12:00:00Z',endAt:'2026-10-08T13:00:00Z'}],
      sessionExecutions:[],trainingCycles:[],checkins:[],iriAssessments:[],m26Entities:[],
    }};
    const root=document.createElement('div');root.id='session-context-qa';root.className='m26-shell';
    document.querySelector('#qa-root').replaceWith(root);
    root.innerHTML=renderSessionsRoute({role:'coach',serviceKind:'training',serviceActive:true,canBuild:true,
      sessions:sessions.map(s=>({...s,publication:{status:'published',visibleToClient:true}})),sessionCounts:{published:2},executions:[],
      nextSessionPreparation:buildNextSessionPreparation(state,clientId,{now:new Date('2026-10-08T12:15:00Z')}),
    });
    root.addEventListener('m26:start-session',event=>{root.dataset.openedSession=event.detail.session.id;root.dataset.openedClient=event.detail.clientId;});
    createWorkflowController({root,store:{getState:()=>state},commandBus:{execute:async()=>{throw new Error('QA_UNEXPECTED_WRITE');}},catalog:{list:()=>[]}}).mount();
  });
  const start=page.getByRole('button',{name:'Iniciar sesión programada',exact:true});
  await expect(start).toBeEnabled();
  await expect(start).toHaveAttribute('data-entity-id','scheduled-qa');
  if(testInfo.project.use.hasTouch)await start.tap();
  else {await start.focus();await page.keyboard.press('Enter');}
  await expect(page.locator('#session-context-qa')).toHaveAttribute('data-opened-session','scheduled-qa');
  await expect(page.locator('#session-context-qa')).toHaveAttribute('data-opened-client','context-client-qa');
  expect(errors).toEqual([]);
});

async function queueCoachRefreshDuringNextTouchRelease(page){
  await page.evaluate(()=>{
    const root=document.querySelector('#qa-root');
    if(!root)throw new Error('QA_COACH_FORM_ROOT_MISSING');
    root.addEventListener('pointerup',()=>{
      globalThis.__IBERFIT_COACH_FORM_QA__?.forceExternalRender?.();
    },{capture:true,once:true});
  });
}

async function forceExternalRenderDuringNextPointerDownCapture(page){
  await page.evaluate(()=>{
    const root=document.querySelector('#qa-root');
    if(!root)throw new Error('QA_COACH_FORM_ROOT_MISSING');
    root.addEventListener('pointerdown',()=>{
      globalThis.__IBERFIT_COACH_FORM_QA__?.queueShellRefresh?.();
    },{capture:true,once:true});
  });
}

async function mouseDownUpOn(page,locator){
  const box=await locator.boundingBox();
  expect(box,'Control must expose a stable pointer box').not.toBeNull();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.up();
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


test('real mouse release keeps Coach text and native select controls stable when a capture-phase refresh races pointerdown',async({page,browserName},testInfo)=>{
  const errors=browserErrors(page);
  const touchProject=/mobile|tablet/iu.test(testInfo.project.name);
  await page.goto('/qa/admin-interaction/coach-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__?.mounted===true)).toBe(true);

  // Keep the topbar client option present before entering the protected form.
  // Changing shell data while the form lease is active is intentionally deferred.
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__.setClientScenario('one'));
  await expect(page.locator('[data-m26-client-select] option[value="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]')).toHaveCount(1);

  const details=page.locator('[data-client-onboarding]');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open','');

  const form=page.locator('[data-workflow-form="client-onboarding"]');
  const name=form.locator('input[name="name"]');
  await name.evaluate((node)=>{node.dataset.qaStableIdentity='real-mouse-name';});
  await rememberStableNode(name,'real-mouse-name');
  await forceExternalRenderDuringNextPointerDownCapture(page);
  await mouseDownUpOn(page,name);
  await page.waitForTimeout(120);

  await expect(name,'Mouse release must leave the same text field focused').toBeFocused();
  await expectStableNode(name,'real-mouse-name');
  await expect(name).toHaveAttribute('data-qa-stable-identity','real-mouse-name');
  await expect(details,'Opening a text field must not collapse the client-create disclosure').toHaveAttribute('open','');
  await page.keyboard.type('Cliente un clic');
  await expect(name).toHaveValue('Cliente un clic');

  const sex=form.locator('select[name="sexForNorms"]');
  await sex.evaluate((node)=>{node.dataset.qaStableIdentity='real-mouse-sex';});
  await rememberStableNode(sex,'real-mouse-sex');
  await forceExternalRenderDuringNextPointerDownCapture(page);
  await mouseDownUpOn(page,sex);
  await page.waitForTimeout(120);

  await expectStableNode(sex,'real-mouse-sex');
  await expect(sex).toHaveAttribute('data-qa-stable-identity','real-mouse-sex');
  await expect(details).toHaveAttribute('open','');
  if(touchProject){
    await sex.selectOption('female');
    await expect(sex).toHaveValue('female');
  }else{
    await expect(sex,'Desktop native select must retain focus after a complete mouse click').toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(sex).not.toHaveValue('');
  }

  const clientSelector=page.locator('[data-m26-client-select]');
  await expect(clientSelector).toBeVisible();
  await clientSelector.evaluate((node)=>{node.dataset.qaStableIdentity='topbar-client-select';});
  await rememberStableNode(clientSelector,'topbar-client-select');
  await forceExternalRenderDuringNextPointerDownCapture(page);
  await mouseDownUpOn(page,clientSelector);
  await page.waitForTimeout(120);

  await expectStableNode(clientSelector,'topbar-client-select');
  await expect(clientSelector).toHaveAttribute('data-qa-stable-identity','topbar-client-select');
  if(touchProject){
    await clientSelector.selectOption('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  }else{
    await expect(clientSelector,'Desktop topbar client dropdown must retain focus after a complete mouse click').toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('[data-m26-client-select]')).toHaveValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

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


test('Coach adapts an exact published session copy from preparation using touch or keyboard without writing',async({page},testInfo)=>{
  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/coach-form-continuity.fixture.html');
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__?.mounted===true)).toBe(true);
  await page.evaluate(async()=>{
    const [{renderSessionsRoute},{buildNextSessionPreparation},{createWorkflowController}]=await Promise.all([
      import('/src/m26/modules/route-render.js'),
      import('/src/m26/intelligence/next-session-prep.js'),
      import('/src/m26/app/workflow-controller.js'),
    ]);
    const clientId='context-copy-client-qa';
    const sessions=[
      {id:'scheduled-copy-qa',clientId,status:'publicado',title:'Sesión de la cita',revision:1},
      {id:'newer-copy-qa',clientId,status:'publicado',title:'Otra sesión publicada',revision:99},
    ];
    const state={identity:{id:'coach-qa',role:'coach'},selectedClientId:clientId,collections:{
      clients:[{id:clientId,name:'Cliente sintético',trainingServiceStatus:'active'}],sessions,
      appointments:[{id:'appointment-copy-qa',clientId,sessionId:'scheduled-copy-qa',status:'confirmada',startAt:'2026-10-08T12:00:00Z',endAt:'2026-10-08T13:00:00Z'}],
      sessionExecutions:[],trainingCycles:[],checkins:[],iriAssessments:[],m26Entities:[],
    }};
    const root=document.createElement('div');root.id='session-copy-qa';root.className='m26-shell';
    document.querySelector('#qa-root').replaceWith(root);
    root.innerHTML=renderSessionsRoute({
      role:'coach',serviceKind:'training',serviceActive:true,canBuild:true,
      sessions:sessions.map((s)=>({...s,publication:{status:'published',visibleToClient:true}})),
      sessionCounts:{published:2},executions:[],
      nextSessionPreparation:buildNextSessionPreparation(state,clientId,{now:new Date('2026-10-08T12:15:00Z')}),
    });
    root.addEventListener('m26:open-session-builder',(event)=>{
      root.dataset.copySession=event.detail.sourceSession?.id||'';
      root.dataset.copyClient=event.detail.clientId||'';
    });
    createWorkflowController({root,store:{getState:()=>state},commandBus:{execute:async()=>{throw Error('QA_UNEXPECTED_WRITE');}},catalog:{list:()=>[]}}).mount();
  });
  const adapt=page.getByRole('button',{name:'Adaptar una copia de esta sesión',exact:true});
  await expect(adapt).toBeEnabled();
  await expect(adapt).toHaveAttribute('data-entity-id','scheduled-copy-qa');
  if(testInfo.project.use.hasTouch)await adapt.tap();
  else{await adapt.focus();await page.keyboard.press('Enter');}
  await expect(page.locator('#session-copy-qa')).toHaveAttribute('data-copy-session','scheduled-copy-qa');
  await expect(page.locator('#session-copy-qa')).toHaveAttribute('data-copy-client','context-copy-client-qa');
  expect(errors).toEqual([]);
});


test('Coach closure preserves exact recorded pain feedback without false effort values on mobile/tablet/desktop',async({page})=>{
  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/coach-form-continuity.fixture.html');
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__?.mounted===true)).toBe(true);
  await page.evaluate(async()=>{
    const {renderGuidedExecution}=await import('/src/m26/workflows/session-ui.js');
    const root=document.createElement('section');root.id='coach-closure-qa';
    root.className='m26-shell';document.body.append(root);
    root.innerHTML=renderGuidedExecution({
      role:'coach',
      execution:{id:'qa-close',clientId:'qa-client-closure',sessionId:'qa-session',
        status:'completed',syncStatus:'clean',queue:[],results:{},events:[],
        feedback:{sessionRpe:null,comment:'Molestia <script>no-ejecutar</script>',pain:true,painNotes:'Rodilla & tobillo'}},
      session:{id:'qa-session',clientId:'qa-client-closure',title:'Sesión sintética'},
    });
  });
  const root=page.locator('#coach-closure-qa');
  await expect(root.locator('[data-session-final-feedback]')).toContainText('Rodilla & tobillo');
  await expect(root.locator('[data-session-final-feedback]')).toContainText('Molestias registradas para seguimiento');
  await expect(root.locator('[data-session-final-feedback]')).toContainText('Molestia <script>no-ejecutar</script>');
  await expect(root.locator('script')).toHaveCount(0);
  await expect(root.getByRole('button',{name:'Revisar seguimiento'})).toBeVisible();
  await expect(root).not.toContainText('RPE de sesión 0/10');
  expect(errors).toEqual([]);
});

test('pending Coach closure never exposes the confirmed follow-up action',async({page})=>{
  await page.goto('/qa/admin-interaction/coach-form-continuity.fixture.html');
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__?.mounted===true)).toBe(true);
  await page.evaluate(async()=>{
    const {renderGuidedExecution}=await import('/src/m26/workflows/session-ui.js');
    const root=document.createElement('section');root.id='coach-close-pending-qa';
    root.className='m26-shell';document.body.append(root);
    root.innerHTML=renderGuidedExecution({
      role:'coach',execution:{id:'qa-pending',clientId:'qa-client-closure',sessionId:'qa-session',
        status:'completed',syncStatus:'pending',queue:[],results:{},events:[],
        feedback:{sessionRpe:7,comment:'Datos sin sincronizar',pain:false}},
      session:{id:'qa-session',clientId:'qa-client-closure',title:'Sesión sintética'},
    });
  });
  const root=page.locator('#coach-close-pending-qa');
  await expect(root).toContainText('pendientes de sincronización');
  await expect(root.locator('[data-m26-target-focus="action-outcome"]')).toHaveCount(0);
  await expect(root.locator('[data-session-final-feedback]')).toContainText('Datos sin sincronizar');
});


test('Coach completed-work evidence opens with touch or keyboard and keeps occurrences isolated',async({page},testInfo)=>{
  const errors=browserErrors(page);
  await page.goto('/qa/admin-interaction/coach-form-continuity.fixture.html');
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_FORM_QA__?.mounted===true)).toBe(true);
  await page.evaluate(async()=>{
    const {renderGuidedExecution}=await import('/src/m26/workflows/session-ui.js');
    const root=document.createElement('section');
    root.id='coach-completion-evidence-qa';
    root.className='m26-shell';
    document.body.append(root);
    const clientId='synthetic-coach-evidence';
    const session={id:'synthetic-session-evidence',clientId,title:'Sesión sintética',blocks:[
      {id:'block-one',type:'exercise',exerciseId:'squat',name:'Sentadilla primera'},
      {id:'block-two',type:'exercise',exerciseId:'squat',name:'Sentadilla segunda'},
    ]};
    const queue=[
      {blockId:'block-one',exerciseId:'squat',sets:2,prescription:{reps:'8-10',plannedLoad:'10 kg'}},
      {blockId:'block-two',exerciseId:'squat',sets:1,prescription:{reps:'5',plannedLoad:'20 kg'}},
    ];
    root.innerHTML=renderGuidedExecution({
      role:'coach',session,
      execution:{id:'execution-synthetic',clientId,sessionId:session.id,status:'completed',syncStatus:'clean',queue,
        results:{'block-one:squat:1':{setNumber:1,reps:8,rpe:7,load:'10 kg',notes:'Test <script>no ejecutar</script>'},
          'block-two:squat:1':{setNumber:1,reps:5,rpe:8,load:'20 kg'}},
        events:[],feedback:{sessionRpe:7,comment:'Prueba sintética',pain:false},
        planSnapshot:{sessionId:session.id,blocks:session.blocks,queue}},
    });
  });
  const panel=page.locator('#coach-completion-evidence-qa [data-coach-completion-evidence]');
  const summary=panel.locator('summary');
  await expect(summary).toHaveText('Revisar planificado y registrado');
  if(testInfo.project.use.hasTouch)await summary.tap();
  else{await summary.focus();await page.keyboard.press('Enter');}
  await expect(panel).toHaveAttribute('open','');
  await expect(panel.locator('[data-completion-evidence-block="block-one"]')).toContainText('1 de 2 series registradas');
  await expect(panel.locator('[data-completion-evidence-block="block-two"]')).toContainText('1 de 1 series registradas');
  await expect(panel.locator('[data-completion-evidence-block="block-one"]')).toContainText('Test <script>no ejecutar</script>');
  await expect(panel.locator('script')).toHaveCount(0);
  const overflow=await panel.evaluate((node)=>node.scrollWidth-node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});
