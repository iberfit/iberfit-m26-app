import {test,expect} from '@playwright/test';

function capturePageErrors(page){
  const errors=[];
  page.on('pageerror',(error)=>errors.push(String(error?.message||error)));
  page.on('console',(message)=>{
    if(message.type()==='error')errors.push('console:'+message.text());
  });
  return errors;
}

test('Admin user inputs, dropdowns and filters remain interactive through a real controller rerender',async({page,browserName})=>{
  const errors=capturePageErrors(page);
  await page.goto('/qa/admin-interaction/fixture.html?route=users',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ADMIN_INTERACTION_QA__?.mounted===true)).toBe(true);

  const search=page.locator('[data-admin-user-search]');
  await search.click();
  await search.fill('coach.interaccion@iberfit.cl');
  await expect(search).toHaveValue('coach.interaccion@iberfit.cl');
  await expect(search).toBeFocused();
  await expect(page.locator('[data-admin-user-visible-count]')).toHaveText('1');

  const statusFilter=page.locator('[data-admin-user-filter="status"]');
  const roleFilter=page.locator('[data-admin-user-filter="role"]');
  await statusFilter.selectOption('active');
  await roleFilter.selectOption('coach');
  await expect(statusFilter).toHaveValue('active');
  await expect(roleFilter).toHaveValue('coach');
  await expect(page.locator('[data-admin-user-visible-count]')).toHaveText('1');

  const coachCard=page.locator('[data-admin-user-card][data-user-id="22222222-2222-4222-8222-222222222222"]');
  await expect(coachCard).toBeVisible();

  const details=coachCard.locator('details.m26-admin-user-management');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open','');

  const roleForm=details.locator('[data-admin-form="role-change"]');
  await roleForm.locator('select[name="action"]').selectOption('revoke');
  await roleForm.locator('select[name="role"]').selectOption('coach');
  const roleReason=roleForm.locator('textarea[name="reason"]');
  await roleReason.click();
  await roleReason.fill('Certificación de interacción QA');
  await expect(roleReason).toHaveValue('Certificación de interacción QA');
  await expect(roleReason).toBeFocused();

  const deleteForm=details.locator('[data-admin-form="user-delete"]');
  await deleteForm.locator('input[name="confirmAcknowledged"]').check();
  const confirmValue=deleteForm.locator('input[name="confirmValue"]');
  await confirmValue.fill('coach.interaccion@iberfit.cl');
  await expect(confirmValue).toHaveValue('coach.interaccion@iberfit.cl');
  const confirmPhrase=deleteForm.locator('input[name="confirmPhrase"]');
  await confirmPhrase.fill('ELIMINAR');
  await expect(confirmPhrase).toHaveValue('ELIMINAR');
  const deleteReason=deleteForm.locator('textarea[name="reason"]');
  await deleteReason.fill('Baja QA no enviada');
  await expect(deleteReason).toHaveValue('Baja QA no enviada');

  const statusForm=details.locator('[data-admin-form="user-status"]');
  await statusForm.locator('select[name="status"]').selectOption('suspended');
  await statusForm.locator('textarea[name="reason"]').fill('Cambio QA controlado');
  await statusForm.locator('button[type="submit"]').click();

  await expect(search).toHaveValue('coach.interaccion@iberfit.cl');
  await expect(statusFilter).toHaveValue('active');
  await expect(roleFilter).toHaveValue('coach');
  await expect(page.locator('[data-admin-user-visible-count]')).toHaveText('0');

  await statusFilter.selectOption('suspended');
  await expect(page.locator('[data-admin-user-visible-count]')).toHaveText('1');
  await expect(coachCard).toBeVisible();

  if(test.info().project.name.includes('mobile')||test.info().project.name.includes('tablet')){
    await expect(statusFilter).toBeVisible();
    await expect(statusFilter).toBeEnabled();
    const metrics=await statusFilter.evaluate((el)=>{
      const rect=el.getBoundingClientRect();
      return {height:rect.height,fontSize:parseFloat(getComputedStyle(el).fontSize)};
    });
    expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
  }

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});

test('Admin client-create wizard preserves entered values while selects and steps change',async({page,browserName})=>{
  const errors=capturePageErrors(page);
  await page.goto('/qa/admin-interaction/fixture.html?route=clients',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ADMIN_INTERACTION_QA__?.mounted===true)).toBe(true);

  const form=page.locator('[data-admin-form="client-create"]');
  await expect(form).toBeVisible();

  const name=form.locator('input[name="name"]');
  const email=form.locator('input[name="email"]');
  const phone=form.locator('input[name="phone"]');
  await name.fill('Cliente QA Interacción');
  await email.fill('cliente.qa.interaccion@example.com');
  await phone.fill('+56 9 5555 0101');
  await form.locator('select[name="sexForNorms"]').selectOption('female');
  await form.locator('select[name="preferredContactChannel"]').selectOption('email');

  await expect(name).toHaveValue('Cliente QA Interacción');
  await expect(email).toHaveValue('cliente.qa.interaccion@example.com');
  await expect(phone).toHaveValue('+56 9 5555 0101');
  await expect(form.locator('select[name="sexForNorms"]')).toHaveValue('female');
  await expect(form.locator('select[name="preferredContactChannel"]')).toHaveValue('email');

  await form.locator('[data-client-step="1"] [data-client-wizard-next]').click();
  await expect(form.locator('[data-client-step="2"]')).toBeVisible();

  const modality=form.locator('select[name="modality"]');
  const frequency=form.locator('input[name="weeklyFrequency"]');
  const duration=form.locator('input[name="sessionDurationMinutes"]');
  const assessment=form.locator('select[name="initialAssessmentMode"]');
  const zone=form.locator('input[name="zone"]');

  await modality.selectOption('Híbrido');
  await frequency.fill('2');
  await duration.fill('60');
  await assessment.selectOption('iri');
  await zone.fill('Las Condes');

  await expect(modality).toHaveValue('Híbrido');
  await expect(frequency).toHaveValue('2');
  await expect(duration).toHaveValue('60');
  await expect(assessment).toHaveValue('iri');
  await expect(zone).toHaveValue('Las Condes');

  await form.locator('[data-client-step="2"] [data-client-wizard-prev]').click();
  await expect(form.locator('[data-client-step="1"]')).toBeVisible();
  await expect(name).toHaveValue('Cliente QA Interacción');
  await expect(email).toHaveValue('cliente.qa.interaccion@example.com');
  await expect(phone).toHaveValue('+56 9 5555 0101');

  await form.locator('[data-client-step="1"] [data-client-wizard-next]').click();
  await expect(form.locator('[data-client-step="2"]')).toBeVisible();
  await expect(modality).toHaveValue('Híbrido');
  await expect(frequency).toHaveValue('2');
  await expect(duration).toHaveValue('60');
  await expect(zone).toHaveValue('Las Condes');

  await zone.click();
  await expect(zone).toBeFocused();

  if(test.info().project.name.includes('mobile')||test.info().project.name.includes('tablet')){
    const metrics=await modality.evaluate((el)=>{
      const rect=el.getBoundingClientRect();
      return {height:rect.height,fontSize:parseFloat(getComputedStyle(el).fontSize)};
    });
    expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
  }

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});


test('Admin mobile Más opens reliably and navigates through the real shell controller',async({page,browserName},testInfo)=>{
  test.skip(!testInfo.project.name.startsWith('admin-mobile-'),'Mobile disclosure regression only.');

  const errors=capturePageErrors(page);
  await page.goto('/qa/admin-interaction/mobile-shell.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ADMIN_MOBILE_SHELL_QA__?.mounted===true)).toBe(true);

  const more=page.locator('details.m26-mobile-more');
  const summary=more.locator(':scope > summary');
  const menu=more.locator('.m26-mobile-more-menu');

  await expect(more).toBeVisible();
  await expect(summary).toHaveAttribute('aria-expanded','false');
  await expect(summary).toHaveAttribute('aria-controls','m26-mobile-more-menu');
  await summary.tap();
  await expect(more).toHaveAttribute('open','');
  await expect(summary).toHaveAttribute('aria-expanded','true');
  await expect(menu).toBeVisible();
  await expect(page.locator('#m26-main')).toHaveAttribute('inert','');
  await expect(page.locator('.m26-topbar')).toHaveAttribute('inert','');
  await expect(page.locator('.m26-shell')).toHaveAttribute('data-m26-mobile-more-open','true');
  await expect(page.locator('.m26-workspace')).toHaveAttribute('data-m26-mobile-more-open','true');
  await expect(page.locator('.m26-mobile-nav')).toHaveCSS('overflow-x','visible');
  await expect(page.locator('.m26-mobile-nav')).toHaveCSS('overflow-y','visible');

  const library=menu.locator('[data-m26-area="biblioteca"]');
  await expect(library).toBeVisible();
  const hitTarget=await library.evaluate((el)=>{
    const rect=el.getBoundingClientRect();
    const x=rect.left+rect.width/2;
    const y=rect.top+rect.height/2;
    const hit=document.elementFromPoint(x,y);
    return {
      matches:hit===el||Boolean(el.contains(hit)),
      hitTag:String(hit?.tagName||''),
      hitClass:String(hit?.className||''),
      hitArea:String(hit?.getAttribute?.('data-m26-area')||''),
    };
  });
  expect(hitTarget.matches,JSON.stringify(hitTarget)).toBe(true);
  await library.tap();

  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ADMIN_MOBILE_SHELL_QA__?.activeArea())).toBe('biblioteca');
  await expect(page.locator('[data-qa-current-area="biblioteca"]')).toBeVisible();
  await expect(page.locator('#m26-main')).not.toHaveAttribute('inert','');
  await expect(page.locator('.m26-topbar')).not.toHaveAttribute('inert','');
  await expect(page.locator('.m26-shell')).not.toHaveAttribute('data-m26-mobile-more-open','true');
  await expect(page.locator('.m26-workspace')).not.toHaveAttribute('data-m26-mobile-more-open','true');

  const rerenderedMore=page.locator('details.m26-mobile-more');
  const rerenderedSummary=rerenderedMore.locator(':scope > summary');
  await expect(rerenderedMore).not.toHaveAttribute('open','');
  await rerenderedSummary.tap();
  await expect(rerenderedMore).toHaveAttribute('open','');
  await expect(rerenderedSummary).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('#m26-main')).toHaveAttribute('inert','');

  await page.keyboard.press('Escape');
  await expect(rerenderedMore).not.toHaveAttribute('open','');
  await expect(rerenderedSummary).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('#m26-main')).not.toHaveAttribute('inert','');
  await expect(page.locator('.m26-topbar')).not.toHaveAttribute('inert','');

  await rerenderedSummary.tap();
  await expect(rerenderedMore).toHaveAttribute('open','');
  await expect(page.locator('#m26-main')).toHaveAttribute('inert','');
  await rerenderedSummary.tap({position:{x:3,y:3}});
  await expect(rerenderedMore).not.toHaveAttribute('open','');
  await expect(rerenderedSummary).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('#m26-main')).not.toHaveAttribute('inert','');
  await expect(page.locator('.m26-topbar')).not.toHaveAttribute('inert','');

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});

test('Sidebar settings popover remains above workspace scrollable and receives pointer events',async({page,browserName},testInfo)=>{
  test.skip(testInfo.project.name.includes('mobile'),'Sidebar settings regression applies to desktop and tablet sidebar layouts.');

  const errors=capturePageErrors(page);
  await page.goto('/qa/admin-interaction/fixture.html?route=users',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ADMIN_INTERACTION_QA__?.mounted===true)).toBe(true);

  const settingsMenu=page.locator('.m26-settings-menu').first();
  const summary=settingsMenu.locator(':scope > summary').first();
  await expect(summary).toBeVisible();
  if(testInfo.project.name.includes('tablet'))await summary.tap();else await summary.click();
  await expect(settingsMenu).toHaveAttribute('open','');

  const popover=settingsMenu.locator('.m26-settings-popover').first();
  await expect(popover).toBeVisible();
  await expect(popover).toHaveCSS('overflow-y','auto');

  const target=settingsMenu.locator('[data-m26-area="admin-configuracion"]').first();
  await expect(target).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  const hit=await target.evaluate((el)=>{
    const rect=el.getBoundingClientRect();
    const node=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
    return {
      matches:node===el||Boolean(el.contains(node)),
      hitTag:String(node?.tagName||''),
      hitClass:String(node?.className||''),
      hitArea:String(node?.getAttribute?.('data-m26-area')||''),
      rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height},
      viewport:{width:innerWidth,height:innerHeight},
      sidebarZ:getComputedStyle(document.querySelector('.m26-sidebar')).zIndex,
      workspaceZ:getComputedStyle(document.querySelector('.m26-workspace')).zIndex,
    };
  });
  expect(hit.rect.left).toBeGreaterThanOrEqual(0);
  expect(hit.rect.right).toBeLessThanOrEqual(hit.viewport.width+1);
  expect(hit.rect.top).toBeGreaterThanOrEqual(0);
  expect(hit.rect.bottom).toBeLessThanOrEqual(hit.viewport.height+1);
  expect(hit.matches,JSON.stringify(hit)).toBe(true);
  if(testInfo.project.name.includes('tablet'))await target.tap();else await target.click();

  expect(errors,browserName+' emitted browser errors').toEqual([]);
});
