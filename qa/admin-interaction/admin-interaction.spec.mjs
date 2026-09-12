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
    const metrics=await page.locator('.m26-admin-form select').first().evaluate((el)=>{
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
