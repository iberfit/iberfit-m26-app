import {test,expect} from '@playwright/test';

test('Solo IRI changes the real Admin wizard immediately, survives navigation and shell replacement',async({page},testInfo)=>{
  const touch=/mobile|tablet/iu.test(testInfo.project.name);
  await page.goto('/qa/admin-interaction/fixture.html?route=clients',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ADMIN_INTERACTION_QA__?.mounted===true)).toBe(true);

  const form=page.locator('[data-admin-form="client-create"]');
  await expect(form).toBeVisible();

  await form.locator('[name="name"]').fill('Persona Solo IRI QA');
  await form.locator('[name="email"]').fill('solo.iri.qa@example.invalid');
  await form.locator('[data-client-wizard-next]').first().click();

  const serviceStep=form.locator('[data-client-step="2"]');
  await expect(serviceStep).toBeVisible();
  const intent=form.locator('[name="serviceIntent"]');
  const frequency=form.locator('[name="weeklyFrequency"]');
  const duration=form.locator('[name="sessionDurationMinutes"]');
  const assessment=form.locator('[name="initialAssessmentMode"]');
  const access=form.locator('[name="accessMode"]');
  const submit=form.locator('[data-client-create-submit]');
  const notice=form.locator('[data-client-service-mode-notice]');

  await intent.selectOption('iri_only');
  await expect(intent).toHaveValue('iri_only');
  await expect(frequency).toBeDisabled();
  await expect(duration).toBeDisabled();
  await expect(frequency.locator('xpath=..')).toHaveAttribute('hidden','');
  await expect(duration.locator('xpath=..')).toHaveAttribute('hidden','');
  await expect(assessment).toHaveValue('iri');
  await expect(assessment).toBeDisabled();
  await expect(assessment.locator('option[value="deferred"]')).toHaveAttribute('disabled','');
  await expect(access).toHaveValue('internal');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Se creará una persona con expediente IRI, sin entrenamiento activo.');
  await expect(submit).toHaveText('Crear persona Solo IRI');

  await serviceStep.locator('[data-client-wizard-prev]').click();
  await expect(form.locator('[data-client-step="1"]')).toBeVisible();
  await expect(form.locator('[name="birthDate"]')).toHaveAttribute('required','');
  await expect(form.locator('[name="sexForNorms"]')).toHaveAttribute('required','');
  await form.locator('[name="birthDate"]').fill('1990-04-10');
  await form.locator('[name="sexForNorms"]').selectOption('female');

  await form.locator('[data-client-step="1"] [data-client-wizard-next]').click();
  await expect(serviceStep).toBeVisible();
  await expect(intent).toHaveValue('iri_only');

  // Draft persistence across the same kind of DOM replacement that previously
  // caused the service mode to snap back to training.
  await page.waitForTimeout(350);
  await page.evaluate(()=>globalThis.__IBERFIT_ADMIN_INTERACTION_QA__?.forceRender?.());
  const restored=page.locator('[data-admin-form="client-create"]');
  await expect(restored.locator('[name="serviceIntent"]')).toHaveValue('iri_only');
  await expect(restored.locator('[name="weeklyFrequency"]')).toBeDisabled();
  await expect(restored.locator('[name="sessionDurationMinutes"]')).toBeDisabled();
  await expect(restored.locator('[name="initialAssessmentMode"]')).toHaveValue('iri');
  await expect(restored.locator('[name="initialAssessmentMode"]')).toBeDisabled();
  await expect(restored.locator('[name="accessMode"]')).toHaveValue('internal');

  await restored.locator('[name="serviceIntent"]').selectOption('training');
  await expect(restored.locator('[name="weeklyFrequency"]')).toBeEnabled();
  await expect(restored.locator('[name="sessionDurationMinutes"]')).toBeEnabled();
  await expect(restored.locator('[name="weeklyFrequency"]')).toHaveAttribute('required','');
  await expect(restored.locator('[name="sessionDurationMinutes"]')).toHaveAttribute('required','');
  await expect(restored.locator('[name="initialAssessmentMode"]')).toBeEnabled();
  await expect(restored.locator('[name="initialAssessmentMode"] option[value="deferred"]')).not.toHaveAttribute('disabled');
  await expect(restored.locator('[name="accessMode"]')).toHaveValue('app');

  await restored.locator('[name="serviceIntent"]').selectOption('iri_only');
  await expect(restored.locator('[name="accessMode"]')).toHaveValue('internal');

  if(touch){
    for(const name of ['serviceIntent','initialAssessmentMode','accessMode']){
      const control=restored.locator(`[name="${name}"]`);
      const box=await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
});
