import {test,expect} from '@playwright/test';

test('IRI entry changes the real Admin wizard immediately, survives navigation and shell replacement',async({page},testInfo)=>{
  const touch=/mobile|tablet/iu.test(testInfo.project.name);
  await page.goto('/qa/admin-interaction/fixture.html?route=clients',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ADMIN_INTERACTION_QA__?.mounted===true)).toBe(true);

  const form=page.locator('[data-admin-form="client-create"]');
  await expect(form).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.scrollingElement).scrollBehavior)).toBe('auto');

  await form.locator('[name="name"]').fill('Persona IRI QA');
  await form.locator('[name="email"]').fill('iri.qa@example.invalid');
  await form.locator('[name="birthDate"]').fill('1990-04-10');
  await form.locator('[name="sexForNorms"]').selectOption('female');
  // Observe the real DOM event path without accessing field values, so that
  // WebKit lost-click vs validity block vs re-render can be distinguished.
  await page.evaluate(()=>{
    const journal=[];
    Object.defineProperty(window,'__IBERFIT_WIZARD_CLICK_QA__',{value:journal,configurable:true});
    for(const type of ['pointerdown','pointerup','click']){
      document.addEventListener(type,(event)=>{
        const target=event.target?.closest?.('[data-client-wizard-next]');
        if(!target)return;
        const owner=target.closest('form[data-client-create-wizard]');
        journal.push({
          type,phase:'capture',step:owner?.dataset.clientCurrentStep||'missing',
          connected:target.isConnected,defaultPrevented:event.defaultPrevented,
          pointerType:typeof event.pointerType==='string'?event.pointerType:'',
        });
        if(journal.length>16)journal.shift();
      },true);
      document.addEventListener(type,(event)=>{
        const target=event.target?.closest?.('[data-client-wizard-next]');
        if(!target)return;
        const owner=target.closest('form[data-client-create-wizard]');
        journal.push({
          type,phase:'bubble',step:owner?.dataset.clientCurrentStep||'missing',
          connected:target.isConnected,defaultPrevented:event.defaultPrevented,
        });
        if(journal.length>16)journal.shift();
      });
    }
  });
  await form.locator('[data-client-wizard-next]').first().click();

  const serviceStep=form.locator('[data-client-step="2"]');
  try{
    await expect(serviceStep).toBeVisible({timeout:10_000});
  }catch(error){
    const diagnostic=await form.evaluate((node)=>({
      step:node.dataset.clientCurrentStep||'missing',
      ready:node.dataset.clientWizardReady||'missing',
      journal:window.__IBERFIT_WIZARD_CLICK_QA__||[],
      invalid:[...node.querySelectorAll('[data-client-step="1"] input,[data-client-step="1"] select,[data-client-step="1"] textarea')]
        .filter((el)=>!el.disabled&&!el.closest('[hidden]')&&el.checkValidity()===false)
        .map((el)=>({field:el.name,reason:el.validity.valueMissing?'missing':el.validity.badInput?'badInput':el.validity.typeMismatch?'typeMismatch':'other'})),
      clickedTargetPresent:!!node.querySelector('[data-client-step="1"] [data-client-wizard-next]'),
    }));
    throw new Error('IBERFIT_WEBKIT_WIZARD_CLICK_PATH_SAFE:'+JSON.stringify(diagnostic),{cause:error});
  }
  const intent=form.locator('[name="serviceIntent"]');
  const frequency=form.locator('[name="weeklyFrequency"]');
  const duration=form.locator('[name="sessionDurationMinutes"]');
  const assessment=form.locator('[name="initialAssessmentMode"]');
  const access=form.locator('[name="accessMode"]');
  const submit=form.locator('[data-client-create-submit]');
  const notice=form.locator('[data-client-service-mode-notice]');

  await intent.selectOption('iri');
  await expect(intent).toHaveValue('iri');
  await expect(frequency).toBeDisabled();
  await expect(duration).toBeDisabled();
  await expect(frequency.locator('xpath=..')).toHaveAttribute('hidden','');
  await expect(duration.locator('xpath=..')).toHaveAttribute('hidden','');
  await expect(assessment).toHaveValue('iri');
  await expect(assessment).toBeDisabled();
  await expect(assessment.locator('option[value="deferred"]')).toHaveAttribute('disabled','');
  await expect(access).toHaveValue('internal');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Se creará una persona con su evaluación IRI.');
  await expect(submit).toHaveText('Crear persona para IRI');

  await serviceStep.locator('[data-client-wizard-prev]').click();
  await expect(form.locator('[data-client-step="1"]')).toBeVisible();
  await expect(form.locator('[name="birthDate"]')).not.toHaveAttribute('required');
  await expect(form.locator('[name="sexForNorms"]')).not.toHaveAttribute('required');
  await expect(form.locator('[name="birthDate"]')).toHaveValue('1990-04-10');
  await expect(form.locator('[name="sexForNorms"]')).toHaveValue('female');

  await form.locator('[data-client-step="1"] [data-client-wizard-next]').click();
  await expect(serviceStep).toBeVisible();
  await expect(intent).toHaveValue('iri');

  // Draft persistence across the same kind of DOM replacement that previously
  // caused the service mode to snap back to training.
  await page.waitForTimeout(350);
  await page.evaluate(()=>globalThis.__IBERFIT_ADMIN_INTERACTION_QA__?.forceRender?.());
  const restored=page.locator('[data-admin-form="client-create"]');
  await expect(restored.locator('[name="serviceIntent"]')).toHaveValue('iri');
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

  await restored.locator('[name="serviceIntent"]').selectOption('iri');
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

test('P0 mobile WebKit wizard advances repeatedly after changing a native select and returning',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='admin-mobile-webkit','Focused native-selector gesture regression.');
  test.setTimeout(90_000);
  await page.goto('/qa/admin-interaction/fixture.html?route=clients',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ADMIN_INTERACTION_QA__?.mounted===true)).toBe(true);
  const form=page.locator('[data-admin-form="client-create"]');
  await expect(form).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.scrollingElement).scrollBehavior)).toBe('auto');
  await form.locator('[name="name"]').fill('Cliente QA móvil');
  await form.locator('[name="email"]').fill('mobile.qa@example.com');
  const first=form.locator('[data-client-step="1"]');
  const second=form.locator('[data-client-step="2"]');
  const sex=form.locator('[name="sexForNorms"]');
  for(let i=0;i<8;i++){
    const option=i%2===0?'female':'male';
    await sex.selectOption(option);
    await expect(sex).toHaveValue(option);
    await first.locator('[data-client-wizard-next]').click();
    try{
      await expect(second,`Native select / wizard step transition iteration ${i+1}`).toBeVisible({timeout:4_000});
    }catch(error){
      const snapshot=await form.evaluate(node=>({
        currentStep:node.dataset.clientCurrentStep,
        invalidNames:[...node.querySelectorAll('[data-client-step="1"] input,[data-client-step="1"] select,[data-client-step="1"] textarea')]
          .filter(c=>!c.disabled&&!c.closest('[hidden]')&&!c.checkValidity()).map(c=>c.name),
        rootScrollBehavior:getComputedStyle(document.scrollingElement).scrollBehavior,
      }));
      throw new Error('IBERFIT_ADMIN_WEBKIT_REPEATED_STEP_FAILURE:'+JSON.stringify({iteration:i+1,...snapshot}),{cause:error});
    }
    await expect(form).toHaveAttribute('data-client-current-step','2');
    await second.locator('[data-client-wizard-prev]').click();
    await expect(first).toBeVisible({timeout:4_000});
  }
  await expect(form.locator('[name="name"]')).toHaveValue('Cliente QA móvil');
  await expect(form.locator('[name="email"]')).toHaveValue('mobile.qa@example.com');
});
