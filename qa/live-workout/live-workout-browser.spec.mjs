import {test,expect} from '@playwright/test';

async function open(page,role){
  await page.goto('/qa/live-workout/fixture.html?role='+role,{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_LIVE_WORKOUT_QA__?.mounted===true)).toBe(true);
  await expect(page.locator('#qa-root')).toHaveAttribute('data-qa-role',role);
}

async function state(page){
  return page.evaluate(()=>globalThis.__IBERFIT_LIVE_WORKOUT_QA__.state());
}

async function fillCurrentSet(page,{reps='9',load='20 kg',rpe='7',rir='3'}={}){
  await page.locator('[data-set-field="reps"]').fill(reps);
  await page.locator('[data-set-field="load"]').fill(load);
  await page.locator('[data-set-field="rpe"]').fill(rpe);
  await page.locator('[data-set-field="rir"]').fill(rir);
}

test('Coach recorre pausa, descanso, corrección, serie extra, omisión y cierre por el controller real',async({page})=>{
  await open(page,'coach');
  await page.locator('[data-session-action="start"]').click();
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible();

  const quick=page.locator('[data-session-coach-quick-controls]');
  await expect(quick).toBeVisible();
  await expect(quick.locator('[data-session-action="pause"]')).toHaveCount(1);
  await quick.locator('[data-session-action="pause"]').click();
  await expect(page.locator('[data-session-live-state="paused"]')).toBeVisible();
  await page.locator('[data-session-action="resume"]').click();
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible();

  await fillCurrentSet(page,{reps:'8',load:'20 kg',rpe:'7',rir:'3'});
  await page.locator('[data-session-action="complete-set"]').click();
  await expect(page.locator('[data-session-live-state="rest"]')).toBeVisible();
  await page.locator('[data-session-action="rest-plus"]').click();
  await page.locator('[data-session-action="rest-minus"]').click();

  const correction=page.locator('[data-session-rest-correction]');
  await correction.locator('summary').click();
  await correction.locator('[data-set-field="reps"]').fill('9');
  await correction.locator('[data-session-action="correct-set"]').click();
  await expect.poll(async()=>Object.values((await state(page)).results)[0]?.reps).toBe(9);

  await page.locator('[data-session-action="next"]').click();
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible();
  await fillCurrentSet(page,{reps:'9',load:'20 kg',rpe:'7.5',rir:'2'});
  await page.locator('[data-session-action="complete-set"]').click();
  await expect(page.locator('[data-session-action="extra-set-now"]')).toBeVisible();
  await page.locator('[data-session-action="extra-set-now"]').click();
  await expect(page.locator('[data-session-live-entry]')).toBeVisible();
  await expect(page.locator('.m26-session-live-entry .m26-eyebrow')).toContainText('Serie 3 de 3');

  await fillCurrentSet(page,{reps:'8',load:'20 kg',rpe:'8',rir:'2'});
  await page.locator('[data-session-action="complete-set"]').click();
  await page.locator('[data-session-action="next"]').click();
  await expect(page.locator('[data-session-live-entry]')).toBeVisible();

  const secondary=page.locator('details.m26-session-live-secondary-context');
  await secondary.locator(':scope > summary').click();
  const adjustments=secondary.locator('details.m26-session-options').filter({hasText:'Ajustes y alternativas'}).first();
  await adjustments.locator('summary').click();
  await adjustments.locator('[data-session-skip-exercise-reason]').fill('Fatiga técnica controlada');
  await adjustments.locator('[data-session-action="skip-exercise"]').click();

  await expect(page.locator('[data-session-live-state="feedback"]')).toBeVisible();
  await page.locator('[data-session-feedback-rpe]').fill('8');
  await page.locator('[data-session-feedback-comment]').fill('Sesión QA completada con buena tolerancia');
  await page.locator('[data-session-action="finish"]').click();
  await expect(page.locator('[data-session-live-state="completed"]')).toBeVisible();

  const finalState=await state(page);
  expect(finalState.status).toBe('completed');
  expect(finalState.errors).toEqual([]);
  expect(finalState.telemetry).toContain('pause');
  expect(finalState.telemetry).toContain('resume');
  expect(finalState.telemetry).toContain('stop:finish');
  expect(finalState.events.some((item)=>item.type==='SET_CORRECTED')).toBe(true);
  expect(finalState.events.some((item)=>item.type==='EXTRA_SET_STARTED')).toBe(true);
  expect(finalState.events.some((item)=>item.type==='EXERCISE_SKIPPED')).toBe(true);
  expect(finalState.events.filter((item)=>item.type==='REST_ADJUSTED')).toHaveLength(2);
  expect(finalState.feedback?.sessionRpe).toBe(8);
});

test('Cliente conserva flujo limpio, puede sustituir antes de progresar y omitir una serie con motivo',async({page})=>{
  await open(page,'client');
  await page.locator('[data-session-action="start"]').click();
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible();
  await expect(page.locator('[data-session-coach-quick-controls]')).toHaveCount(0);

  const secondary=page.locator('details.m26-session-live-secondary-context');
  await secondary.locator(':scope > summary').click();
  const adjustments=secondary.locator('details.m26-session-options').filter({hasText:'Ajustes y alternativas'}).first();
  await adjustments.locator('summary').click();
  await adjustments.locator('[data-session-substitute]').selectOption('qa-split-squat');
  await adjustments.locator('[data-session-substitute-reason]').fill('Preferencia técnica QA');
  await adjustments.locator('[data-session-action="substitute"]').click();

  await expect(page.locator('.m26-session-live-hero h2')).toContainText('Zancada dividida');
  const substituted=await state(page);
  expect(substituted.events.some((item)=>item.type==='EXERCISE_SUBSTITUTED')).toBe(true);

  const skipDetails=page.locator('[data-session-live-entry] details.m26-session-options').filter({hasText:'No realizar esta serie'});
  await skipDetails.locator('summary').click();
  await skipDetails.locator('[data-session-skip-set-reason]').fill('Molestia puntual QA');
  await skipDetails.locator('[data-session-action="skip-set"]').click();

  const skipped=await state(page);
  expect(skipped.events.some((item)=>item.type==='SET_SKIPPED')).toBe(true);
  expect(Object.keys(skipped.skippedSets)).toHaveLength(1);
  expect(skipped.errors).toEqual([]);
});

test('Recovery browser flush conserva el borrador activo al ocultar o abandonar la página',async({page})=>{
  await open(page,'coach');
  await page.locator('[data-session-action="start"]').click();
  await page.locator('[data-set-field="reps"]').fill('11');
  await page.locator('[data-set-field="load"]').fill('22.5 kg');
  await page.locator('[data-set-field="rpe"]').fill('8');
  await page.locator('[data-set-field="rir"]').fill('2');

  await page.evaluate(()=>{
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect.poll(async()=>(await state(page)).persistedCount).toBeGreaterThan(0);
  const recovered=await state(page);
  expect(recovered.lastPersisted?.execution?.activeSetDraft?.values?.reps).toBe('11');
  expect(recovered.lastPersisted?.execution?.activeSetDraft?.values?.load).toBe('22.5 kg');
  expect(recovered.lastPersisted?.execution?.activeSetDraft?.values?.rpe).toBe('8');
  expect(recovered.lastPersisted?.execution?.activeSetDraft?.values?.rir).toBe('2');
  expect(recovered.errors).toEqual([]);
});

test('Live Workout no produce overflow horizontal y mantiene objetivos táctiles en viewports pequeños',async({page},testInfo)=>{
  await open(page,'coach');
  await page.locator('[data-session-action="start"]').click();

  const metrics=await page.evaluate(()=>{
    const pause=document.querySelector('[data-session-action="pause"]');
    const rect=pause?.getBoundingClientRect();
    return {
      scrollWidth:document.documentElement.scrollWidth,
      clientWidth:document.documentElement.clientWidth,
      pauseWidth:rect?.width??0,
      pauseHeight:rect?.height??0,
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth+1);
  expect(metrics.pauseWidth).toBeGreaterThanOrEqual(44);
  expect(metrics.pauseHeight).toBeGreaterThanOrEqual(44);

  if(String(testInfo.project.name).includes('mobile')){
    await expect(page.locator('[data-session-coach-quick-controls]')).toBeVisible();
    await expect(page.locator('[data-session-action="pause"]')).toBeInViewport();
  }
});
