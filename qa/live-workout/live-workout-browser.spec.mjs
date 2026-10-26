import {test,expect} from '@playwright/test';

async function open(page,role,scenario='strength'){
  await page.goto('/qa/live-workout/fixture.html?role='+role+'&scenario='+scenario,{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_LIVE_WORKOUT_QA__?.mounted===true)).toBe(true);
  await expect(page.locator('#qa-root')).toHaveAttribute('data-qa-role',role);
}

async function state(page){
  return page.evaluate(()=>globalThis.__IBERFIT_LIVE_WORKOUT_QA__.state());
}

async function activatePublishedPreview(card,testInfo){
  const summary=card.locator('details.m26-session-preview-disclosure > summary');
  await expect(summary).toBeVisible();
  // Touch viewport: a real touch gesture. Desktop: a real mouse pointer.
  // Preserve native <summary> behavior, never set <details open> through JS.
  if(testInfo.project.use?.hasTouch)await summary.tap();
  else await summary.click();
}

async function fillCurrentSet(page,{reps='9',load='20 kg',rpe='7',rir='3'}={}){
  await page.locator('[data-set-field="reps"]').fill(reps);
  await page.locator('[data-set-field="load"]').fill(load);
  await page.locator('[data-set-field="rpe"]').fill(rpe);
  await page.locator('[data-set-field="rir"]').fill(rir);
}

test('SIGNATURE U21: Cliente pausa, reanuda y mantiene el borrador en 320 px',async({page})=>{
  await page.setViewportSize({width:320,height:740});
  await open(page,'client');
  await page.locator('[data-session-action="start"]').click();
  const quick=page.locator('[data-session-client-quick-controls]');
  await expect(quick).toBeVisible();
  await expect(page.locator('[data-session-coach-quick-controls]')).toHaveCount(0);
  const pause=quick.locator('[data-session-action="pause"]');
  await expect(pause).toBeVisible();
  const geometry=await pause.evaluate((element)=>{
    const box=element.getBoundingClientRect();
    return {left:box.left,right:box.right,width:box.width,height:box.height,viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth};
  });
  expect(geometry.width).toBeGreaterThanOrEqual(44);
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport+1);
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport+1);
  await fillCurrentSet(page,{reps:'10',load:'18 kg',rpe:'8',rir:'2'});
  await pause.click();
  await expect(page.locator('[data-session-live-state="paused"]')).toBeVisible();
  await page.locator('[data-session-action="resume"]').click();
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible();
  await expect(page.locator('[data-set-field="reps"]')).toHaveValue('10');
  await expect(page.locator('[data-set-field="load"]')).toHaveValue('18 kg');
  await expect(page.locator('[data-set-field="rpe"]')).toHaveValue('8');
  const completeAction=page.locator('[data-session-action="complete-set"]');
  await expect(completeAction).toBeVisible();
  const formLayout=await page.evaluate(()=>{
    const fields=document.querySelector('.m26-session-set-fields');
    const action=document.querySelector('[data-session-action="complete-set"]');
    return {grid:getComputedStyle(fields).display,ctaPosition:getComputedStyle(action).position,scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth};
  });
  expect(formLayout.grid).toBe('grid');
  expect(formLayout.ctaPosition).toBe('static');
  expect(formLayout.scroll).toBeLessThanOrEqual(formLayout.width+1);
  await completeAction.click();
  await expect(page.locator('[data-session-live-state="rest"]')).toBeVisible();
  await expect(page.locator('[data-session-client-quick-controls] [data-session-action="pause"]')).toBeVisible();
  await page.locator('[data-session-client-quick-controls] [data-session-action="pause"]').click();
  await expect(page.locator('[data-session-live-state="paused"]')).toBeVisible();
  await page.locator('[data-session-action="resume"]').click();
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible();
  await expect(page.locator('[data-session-rest-focus]')).toBeVisible();
  expect((await state(page)).errors).toEqual([]);
});

test('SIGNATURE U21: Coach conserva controles rápidos operativos con teclado',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await open(page,'coach');
  await page.locator('[data-session-action="start"]').click();
  const actions=page.locator('[data-session-coach-quick-controls]');
  await expect(actions).toBeVisible();
  await expect(actions.locator('[data-session-open-substitution]')).toHaveCount(1);
  await expect(actions.locator('[data-session-action="pause"]')).toHaveCount(1);
  await actions.locator('[data-session-action="pause"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-session-live-state="paused"]')).toBeVisible();
  await page.locator('[data-session-action="resume"]').click();
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible();
  const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width+1);
  expect((await state(page)).errors).toEqual([]);
});

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


test('SIGNATURE Coach controls stay within 320px after advancing to the next set',async({page})=>{
  await open(page,'coach');
  await page.locator('[data-session-action="start"]').click();
  await fillCurrentSet(page,{reps:'8',load:'20 kg',rpe:'7',rir:'3'});
  await page.locator('[data-session-action="complete-set"]').click();
  await page.locator('[data-session-action="next"]').click();
  await page.setViewportSize({width:320,height:740});
  const quick=page.locator('[data-session-coach-quick-controls]');
  await expect(quick).toBeVisible();
  await expect(quick.locator('button')).toHaveCount(3);
  await quick.scrollIntoViewIfNeeded();
  const geometry=await quick.evaluate(el=>{
    const viewport=document.documentElement.clientWidth;
    const buttons=[...el.querySelectorAll('button')].map(button=>{
      const rect=button.getBoundingClientRect();
      return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height};
    });
    const overlaps=buttons.some((a,i)=>buttons.slice(i+1).some(b=>
      Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&
      Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1));
    const overflowing=[...document.querySelectorAll('body *')].flatMap(node=>{
      const rect=node.getBoundingClientRect();
      return rect.right>viewport+1||rect.left< -1
        ?[{tag:node.tagName,className:String(node.className?.baseVal??node.className??'').slice(0,96),left:Math.round(rect.left),right:Math.round(rect.right)}]
        :[];
    }).slice(0,12);
    return {viewport,documentWidth:document.documentElement.scrollWidth,buttons,overlaps,overflowing};
  });
  expect(geometry.documentWidth,'Overflowing elements: '+JSON.stringify(geometry.overflowing)).toBeLessThanOrEqual(geometry.viewport+1);
  expect(geometry.overlaps).toBe(false);
  for(const button of geometry.buttons){
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.left).toBeGreaterThanOrEqual(-1);
    expect(button.right).toBeLessThanOrEqual(geometry.viewport+1);
  }
  await quick.locator('[data-session-action="pause"]').click();
  await expect(page.locator('[data-session-live-state="paused"]')).toBeVisible();
  expect((await state(page)).errors).toEqual([]);
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

test('Cliente usa Comenzar entrenamiento y Guardar y salir sin Leave workout ni perder borrador',async({page})=>{
  await open(page,'client');
  const launch=page.locator('[data-session-action="start"]');
  await expect(launch).toHaveText('Comenzar entrenamiento');
  await launch.click();
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible();

  const exit=page.locator('.m26-session-live-quick-exit [data-session-action="exit-session"]');
  await expect(exit).toBeVisible();
  const bounds=await exit.boundingBox();
  expect(bounds?.height||0).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Leave workout',{exact:true})).toHaveCount(0);

  await page.locator('[data-set-field="reps"]').fill('11');
  await page.locator('[data-set-field="load"]').fill('22 kg');
  await exit.click();
  await expect.poll(async()=>(await state(page)).exits).toBe(1);
  const persisted=await state(page);
  expect(persisted.status).toBe('active');
  expect(persisted.persistedCount).toBeGreaterThan(0);
  expect(persisted.lastPersisted?.execution?.activeSetDraft?.values?.reps).toBe('11');
  expect(persisted.lastPersisted?.execution?.activeSetDraft?.values?.load).toBe('22 kg');
  expect(persisted.errors).toEqual([]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Leave workout',{exact:true})).toHaveCount(0);
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

test('M43: Cliente ejecuta running y natación con metas proyectadas, datos reales y feedback en navegador',async({page})=>{
  await open(page,'client','sports');
  const ready=page.locator('[data-session-ready-sport-preview]');
  await expect(ready).toBeVisible();
  await expect(ready).toContainText('06:00 min/km');
  await expect(ready).toContainText('02:20 min/100 m (objetivo)');
  await expect(page.locator('body')).not.toContainText('QA_PRIVATE_COACH_NOTE_NEVER_CLIENT');
  await expect(page.locator('body')).not.toContainText('QA_PRIVATE_SESSION');
  await page.locator('[data-session-action="start"]').click();
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible();

  const running=page.locator('[data-session-cardio-entry]');
  await running.locator('[data-set-field="durationMinutes"]').fill('30');
  await running.locator('[data-set-field="distanceKm"]').fill('5');
  await running.locator('details > summary').click();
  await running.locator('[data-set-field="paceMinPerKm"]').fill('06:00');
  await running.locator('[data-set-field="rpe"]').fill('6');
  await page.locator('[data-session-action="complete-set"]').click();
  await expect.poll(async()=>Object.values((await state(page)).results).length).toBe(1);
  await page.locator('[data-session-action="next"]').click();
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible();

  const swimming=page.locator('[data-session-cardio-entry]');
  await expect.poll(async()=>{const value=await state(page);return value.queue[value.index]?.exerciseId;}).toBe('qa-natacion-crol');
  await expect(page.locator('[data-session-live-entry]')).toContainText('Registra tiempo y metros nadados');
  await swimming.locator('[data-set-field="durationMinutes"]').fill('10');
  await swimming.locator('[data-set-field="distanceM"]').fill('400');
  await swimming.locator('details > summary').click();
  await swimming.locator('[data-set-field="pacePer100M"]').fill('02:25');
  await swimming.locator('[data-set-field="rpe"]').fill('7');
  await page.locator('[data-session-action="complete-set"]').click();
  await expect.poll(async()=>Object.values((await state(page)).results).length).toBe(2);
  await page.locator('[data-session-action="next"]').click();
  await expect(page.locator('[data-session-live-state="feedback"]')).toBeVisible();
  await page.locator('[data-session-feedback-rpe]').fill('7');
  await page.locator('[data-session-feedback-comment]').fill('Carrera y natación completadas; objetivos diferenciados');
  await page.locator('[data-session-action="finish"]').click();
  await expect(page.locator('[data-session-live-state="completed"]')).toBeVisible();

  const actual=await state(page);
  expect(actual.errors).toEqual([]);
  expect(actual.feedback.sessionRpe).toBe(7);
  const rows=Object.values(actual.results);
  expect(rows[0].distanceKm).toBe(5);
  expect(rows[0].paceMinPerKm).toBe('06:00');
  expect(rows[1].distanceM).toBe(400);
  expect(rows[1].pacePer100M).toBe('02:25');
  expect(rows[1].paceMinPerKm).toBeNull();
  expect(actual.queue[1].prescription.plannedPacePer100M).toBe('02:20');
  const bounds=await page.evaluate(()=>({
    scroll:document.documentElement.scrollWidth,
    viewport:document.documentElement.clientWidth,
  }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.viewport+1);
});

test('Canary sesión programada y guiada: previa completa sin fuga privada ni overflow móvil',async({page},testInfo)=>{
  await open(page,'client');
  await page.evaluate(async()=>{
    const {renderRc39Route}=await import('/src/m26/rc39/route-render.js');
    const blocks=[{type:'exercise',exerciseId:'qa-press',sets:3,reps:'8-10',restSeconds:60,targetRpe:7,cues:['Progresión técnica']}];
    const session=(id,ownership,visibility)=>({
      id,title:id==='guided'?'Fuerza autónoma':'Fuerza con Coach',status:'published',
      deliveryModality:ownership==='coach_led'?'presencial':'guiada_en_app',
      deliveryOwnership:ownership,durationMinutes:50,blocks,privateCoachNote:'QA_PRIVATE_NO_CLIENT',
    });
    const projection=(id,ownership,visibility)=>({
      id,title:id==='guided'?'Fuerza autónoma':'Fuerza con Coach',
      ownership,visibility,visible:true,modality:ownership==='coach_led'?'presencial':'guiada_en_app',
      canClientExecute:ownership!=='coach_led',canClientStart:ownership!=='coach_led',
      session:session(id,ownership,visibility),appointmentId:null,
    });
    const vm={kind:'sesion',role:'client',serviceActive:true,selectedClient:{modality:'hibrido'},
      rc39:{sessionProjections:[projection('coach','coach_led','summary_only'),projection('guided','guided_in_app','full')],appointments:[]},
      sessionPreviewAssets:{catalog:[{id:'qa-press',name_es:'Press de pecho',equipment:'Mancuernas',
        cues:['Escápulas estables'],instructions_es:['Descenso controlado']}],mediaMap:null}};
    const area=document.createElement('section');area.id='qa-client-session-previews';
    area.innerHTML=renderRc39Route(vm);document.body.appendChild(area);
  });
  const direct=page.locator('#qa-client-session-previews [data-rc39-session="coach"]');
  const guided=page.locator('#qa-client-session-previews [data-rc39-session="guided"]');
  await expect(direct).toContainText('Fuerza con Coach');
  await expect(direct).toContainText('50 min');
  await expect(direct).not.toContainText('Press de pecho');
  await expect(direct.locator('details.m26-session-preview-disclosure')).toHaveCount(0);
  await expect(guided.locator('details.m26-session-preview-disclosure')).toHaveCount(1);
  await activatePublishedPreview(guided,testInfo);
  await expect(guided.locator('details.m26-session-preview-disclosure'),
    'Actual pointer interaction must open the native preview before any launch').toHaveAttribute('open','');
  await expect(guided.locator('.m26-session-preview-exercise h5')).toHaveText('Press de pecho');
  await expect(guided).toContainText('8-10');
  await expect(guided).toContainText('Sin referencia visual');
  await expect(guided.locator('[data-workflow-action="start-published-session"]')).toHaveText('Comenzar entrenamiento');
  await expect(page.locator('#qa-client-session-previews')).not.toContainText('QA_PRIVATE_NO_CLIENT');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const geometry=await guided.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width+1);
});


test('SIGNATURE published mixed Client route separates real guided preview and Coach-led supervision',async({page},testInfo)=>{
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/qa/live-workout/published-sessions.fixture.html?scenario=mixed',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__?.mounted)).toBe(true);
  const screen=page.locator('.m26-rc39-sessions');
  await expect(screen).toHaveAttribute('data-client-session-state','ready');
  await expect(screen.locator('[data-rc39-session]')).toHaveCount(2);
  await expect(page.locator('body')).not.toContainText('QA_PRIVATE_COACH_NOTE_NEVER_CLIENT');
  await expect(page.locator('body')).not.toContainText('QA_PRIVATE_SUPERVISED_NEVER_CLIENT');
  const led=screen.locator('[data-rc39-session="qa-published-supervised"]');
  const self=screen.locator('[data-rc39-session="qa-published-guided"]');
  await expect(led).toContainText('Esta sesión la dirige tu Coach');
  await expect(led.locator('.m26-session-preview-disclosure')).toHaveCount(0);
  await expect(led.locator('[data-workflow-action="start-published-session"]')).toHaveCount(0);
  await expect(self).toContainText('Fuerza autónoma');
  await expect(self.locator('[data-workflow-action="start-published-session"]')).toBeHidden();
  await activatePublishedPreview(self,testInfo);
  await expect(self.locator('details.m26-session-preview-disclosure'),
    'Client preview must open by a real tap, including mobile WebKit').toHaveAttribute('open','');
  const start=self.locator('[data-workflow-action="start-published-session"]');
  await expect(start).toBeVisible();
  await expect(self).toContainText('Press de pecho');
  await expect(self).toContainText('Remo TRX');
  await expect(self).toContainText('3-1-1');
  await expect(self).toContainText('RPE');
  // A missing exercise image must remain legible in the *computed* theme.
  // This checks the actual painted CSS in Chromium and WebKit, not only a
  // stylesheet substring; an absent image cannot justify unreadable text.
  const fallbackContrast=await self.locator('.m26-session-preview-media .m26-exercise-media-fallback').first().evaluate(el=>{
    const parse=(color)=>(String(color).match(/\d+(?:\.\d+)?/gu)||[]).slice(0,3).map(Number);
    const luminance=(color)=>{
      const rgb=parse(color).map(v=>{
        const normalized=v/255;
        return normalized<=0.04045?normalized/12.92:((normalized+0.055)/1.055)**2.4;
      });
      if(rgb.length!==3||rgb.some(v=>!Number.isFinite(v)))return null;
      return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
    };
    const contrast=(fg,bg)=>{
      const a=luminance(fg),b=luminance(bg);
      return a===null||b===null?0:(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    };
    const bg=getComputedStyle(el).backgroundColor;
    const title=el.querySelector('span'),caption=el.querySelector('small');
    return {
      background:bg,
      title:contrast(getComputedStyle(title).color,bg),
      caption:contrast(getComputedStyle(caption).color,bg),
    };
  });
  expect(fallbackContrast.background,'missing-media fallback needs an opaque matte surface').toMatch(/^rgb\(/u);
  expect(fallbackContrast.title,'fallback title must reach WCAG AA 4.5:1').toBeGreaterThanOrEqual(4.5);
  expect(fallbackContrast.caption,'fallback instruction must reach WCAG AA 4.5:1').toBeGreaterThanOrEqual(4.5);
  const metrics=await page.evaluate(()=>{
    const button=document.querySelector('[data-rc39-session="qa-published-guided"] [data-workflow-action="start-published-session"]');
    const rect=button?.getBoundingClientRect();
    return {
      buttonWidth:rect?.width||0,buttonHeight:rect?.height||0,
      docOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
      buttonUsable:Boolean(button&&!button.disabled),
    };
  });
  expect(metrics.buttonUsable).toBe(true);
  expect(metrics.buttonHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.buttonWidth).toBeGreaterThanOrEqual(44);
  expect(metrics.docOverflow).toBe(false);
  if(testInfo.project.name.includes('mobile')||testInfo.project.name.includes('desktop')){
    const {mkdir}=await import('node:fs/promises');
    const out='recovery/signature-published-sessions';
    await mkdir(out,{recursive:true});
    await page.screenshot({path:out+'/'+testInfo.project.name+'-mixed-preview.png',fullPage:true,animations:'disabled'});
    if(testInfo.project.name==='live-workout-mobile-chromium'){
      await page.setViewportSize({width:320,height:740});
      const compact=await page.evaluate(()=>{
        const target=document.querySelector('[data-rc39-session="qa-published-guided"] [data-workflow-action="start-published-session"]');
        const rect=target?.getBoundingClientRect();
        return {
          horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
          startHeight:rect?.height||0,startWidth:rect?.width||0,
        };
      });
      expect(compact.horizontalOverflow,'320 px must never hide a published-session action sideways').toBe(false);
      expect(compact.startHeight).toBeGreaterThanOrEqual(44);
      expect(compact.startWidth).toBeGreaterThanOrEqual(44);
      await page.screenshot({path:out+'/live-workout-mobile-320-chromium-mixed-preview.png',fullPage:true,animations:'disabled'});
    }
  }
  expect(errors).toEqual([]);
});

test('SIGNATURE published autonomous preview leads to actual Client execution without duplicate launch',async({page},testInfo)=>{
  await page.goto('/qa/live-workout/published-sessions.fixture.html?scenario=mixed',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__?.mounted)).toBe(true);
  const guided=page.locator('[data-rc39-session="qa-published-guided"]');
  await activatePublishedPreview(guided,testInfo);
  await expect(guided.locator('details.m26-session-preview-disclosure'),
    'Actual pointer interaction must open the native preview before any launch').toHaveAttribute('open','');
  await guided.locator('[data-workflow-action="start-published-session"]').click();
  await expect(page.locator('#qa-workout [data-session-action="start"]')).toHaveText('Comenzar entrenamiento');
  let state=await page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__.state());
  expect(state.launchCount).toBe(1);
  expect(state.attempts).toEqual([{id:'qa-published-guided',ok:true}]);
  await page.locator('#qa-workout [data-session-action="start"]').click();
  await expect(page.locator('#qa-workout [data-session-live-state="active"]')).toBeVisible();
  await expect(page.locator('#qa-workout [data-session-coach-quick-controls]')).toHaveCount(0);
  await page.locator('#qa-workout [data-set-field="reps"]').fill('9');
  await page.locator('#qa-workout [data-set-field="load"]').fill('12 kg');
  await page.locator('#qa-workout [data-set-field="rpe"]').fill('7');
  await page.locator('#qa-workout [data-set-field="rir"]').fill('3');
  await expect(page.locator('#qa-workout [data-set-field="reps"]')).toHaveValue('9');
  await expect(page.locator('#qa-workout [data-set-field="load"]')).toHaveValue('12 kg');
  await expect(page.locator('#qa-workout [data-set-field="rpe"]')).toHaveValue('7');
  await expect(page.locator('#qa-workout [data-set-field="rir"]')).toHaveValue('3');
  await page.locator('#qa-workout [data-session-action="complete-set"]').click();
  try{
    await expect.poll(async()=>{
      const v=await page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__.state());
      return Object.keys(v.results).length;
    }).toBeGreaterThan(0);
  }catch(error){
    const v=await page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__.state());
    throw new Error('SIGNATURE_PUBLISHED_SET_NOT_RECORDED:'+JSON.stringify({
      status:v.status,errors:v.errors,lastSetInput:v.lastSetInput,
      events:v.events.map(e=>e.type).slice(-8),saved:v.saved,
    }),{cause:error});
  }
  state=await page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__.state());
  expect(state.launchCount).toBe(1);
  expect(state.errors).toEqual([]);
  expect(state.events.length).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
});


test('SIGNATURE published guided Client finishes both real recorded sets, feedback and local checkpoint',async({page},testInfo)=>{
  await page.goto('/qa/live-workout/published-sessions.fixture.html?scenario=mixed',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__?.mounted)).toBe(true);
  const guided=page.locator('[data-rc39-session="qa-published-guided"]');
  await activatePublishedPreview(guided,testInfo);
  await expect(guided.locator('details.m26-session-preview-disclosure'),
    'Actual pointer interaction must open the native preview before any launch').toHaveAttribute('open','');
  await guided.locator('[data-workflow-action="start-published-session"]').click();
  await expect(page.locator('#qa-workout [data-session-live-state="ready"]')).toBeVisible();
  await page.locator('#qa-workout [data-session-action="start"]').click();

  for(const [index,exercise,load] of [[0,'Press de pecho','12 kg'],[1,'Remo TRX','0 kg']]){
    const live=page.locator('#qa-workout [data-session-live-state="active"]');
    await expect(live).toBeVisible();
    await expect(live).toContainText(exercise);
    await live.locator('[data-set-field="reps"]').fill(index===0?'9':'10');
    await live.locator('[data-set-field="load"]').fill(load);
    await live.locator('[data-set-field="rpe"]').fill(index===0?'7':'8');
    await live.locator('[data-set-field="rir"]').fill(index===0?'3':'2');
    await live.locator('[data-session-action="complete-set"]').click();
    await expect.poll(async()=>{
      const snapshot=await page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__.state());
      return Object.keys(snapshot.results).length;
    }).toBe(index+1);
    await page.locator('#qa-workout [data-session-action="next"]').click();
  }
  await expect(page.locator('#qa-workout [data-session-live-state="feedback"]')).toBeVisible();
  await page.locator('#qa-workout [data-session-feedback-rpe]').fill('8');
  await page.locator('#qa-workout [data-session-feedback-comment]').fill('Buena tolerancia, ejecución completada');
  await page.locator('#qa-workout [data-session-action="finish"]').click();
  await expect(page.locator('#qa-workout [data-session-live-state="completed"]')).toBeVisible();
  const result=await page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__.state());
  expect(result.launchCount).toBe(1);
  expect(result.status).toBe('completed');
  expect(Object.keys(result.results)).toHaveLength(2);
  expect(result.results[Object.keys(result.results)[0]].rpe).toBe(7);
  expect(result.results[Object.keys(result.results)[1]].rpe).toBe(8);
  expect(result.events.filter(e=>e.type==='SET_COMPLETED')).toHaveLength(2);
  expect(result.saved,'final session should leave a recoverable synthetic checkpoint').toBeGreaterThan(0);
  expect(result.errors).toEqual([]);
  await expect(page.locator('body')).not.toContainText('QA_PRIVATE_COACH_NOTE_NEVER_CLIENT');
});

test('SIGNATURE Client never launches revoked, summary-only or already-started published sessions',async({page})=>{
  for(const scenario of ['summary','revoked','paused','empty']){
    await page.goto('/qa/live-workout/published-sessions.fixture.html?scenario='+scenario,{waitUntil:'domcontentloaded'});
    await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__?.mounted)).toBe(true);
    const route=page.locator('.m26-rc39-sessions');
    await expect(route.locator('[data-workflow-action="start-published-session"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('QA_PRIVATE_COACH_NOTE_NEVER_CLIENT');
    await expect(page.locator('body')).not.toContainText('QA_PRIVATE_SUPERVISED_NEVER_CLIENT');
    if(scenario==='revoked'||scenario==='empty'){
      await expect(route.locator('[data-rc39-session="qa-published-guided"]')).toHaveCount(0);
    }else{
      await expect(route.locator('[data-rc39-session="qa-published-guided"]')).toHaveCount(1);
    }
    // Deliberately forge an action in the synthetic QA page. The bridge must
    // validate against the real policy instead of trusting DOM attributes.
    await page.evaluate(()=>{
      const fake=document.createElement('button');
      fake.type='button';fake.dataset.workflowAction='start-published-session';
      fake.dataset.entityId='qa-published-guided';
      document.querySelector('#qa-published-route').append(fake);
      fake.click();fake.remove();
    });
    const status=await page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__.state());
    expect(status.attempts).toEqual([{id:'qa-published-guided',ok:false}]);
    expect(status.launchCount).toBe(0);
    expect(status.status).toBe('not_started');
    await expect(page.locator('#qa-workout [data-session-action="start"]')).toHaveCount(0);
  }
});

test('SIGNATURE Coach-led appointment never converts into a Client start through a role change',async({page})=>{
  await page.goto('/qa/live-workout/published-sessions.fixture.html?scenario=mixed&role=coach',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__?.mounted)).toBe(true);
  const route=page.locator('.m26-rc39-sessions');
  await expect(route).toHaveAttribute('data-client-session-state','professional');
  await expect(route.locator('[data-rc39-session="qa-published-supervised"]')).toContainText('Revisar prescripción y vista del cliente');
  await expect(route.locator('[data-rc39-session="qa-published-supervised"] [data-workflow-action="start-published-session"]')).toHaveCount(0);
  await expect(route.locator('[data-rc39-session="qa-published-guided"] [data-workflow-action="start-published-session"]')).toHaveText('Comenzar con Coach');
  await expect(route.locator('[data-workflow-action="open-session-builder"]')).toHaveCount(1);
  const state=await page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__.state());
  expect(state.launchCount).toBe(0);
});


test('SIGNATURE B15: calendar real renderer stays accessible at 320px with two independent dates',async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:740});
  await page.goto('/qa/live-workout/published-sessions.fixture.html?scenario=mixed',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__?.mounted)).toBe(true);
  const expected=await page.evaluate(async()=>{
    const {renderRc39Route}=await import('/src/m26/rc39/route-render.js');
    const {buildClientPlanningItems}=await import('/src/m26/rc39/session-policy.js');
    const clientId='22222222-2222-4222-8222-222222222222';
    const session={
      id:'qa-b15-guided',clientId,
      title:'Fuerza y movilidad · Entrenamiento personal',
      status:'disponible',visibleToClient:true,
      deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
      clientVisibilityLevel:'full',durationMinutes:50,
      blocks:[{id:'qa-b15-block',type:'exercise',exerciseId:'qa-press',sets:3,reps:'8'}],
    };
    const booking=(id,startAt)=>({
      id,clientId,sessionId:session.id,status:'confirmada',
      visibleToClient:true,startAt,
      endAt:new Date(Date.parse(startAt)+50*60*1000).toISOString(),
      modality:'guiada_en_app',
    });
    const appointments=[
      booking('qa-b15-first','2026-10-27T15:00:00Z'),
      booking('qa-b15-second','2026-11-03T15:00:00Z'),
    ];
    const items=buildClientPlanningItems({
      sessions:[session],appointments,now:new Date('2026-10-25T12:00:00Z'),
    });
    const vm={kind:'planificacion',role:'client',serviceActive:true,
      selectedClient:{id:clientId,modality:'online'},
      rc39:{planningItems:items,appointments:[]}};
    document.querySelector('#qa-published-route').innerHTML=renderRc39Route(vm);
    return {itemCount:items.length,blocked:items.every(item=>!item.canClientStart)};
  });
  expect(expected).toEqual({itemCount:2,blocked:true});
  const nav=page.getByRole('navigation',{name:'Fechas de entrenamiento programadas'});
  await expect(nav).toBeVisible();
  const links=nav.locator('.m26-rc39-date-links>a');
  await expect(links).toHaveCount(2);
  const groups=page.locator('.m26-rc39-day-group');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toHaveAttribute('open','');
  await expect(groups.nth(1)).not.toHaveAttribute('open');
  await expect(page.locator('[data-workflow-action="start-published-session"]')).toHaveCount(0);
  const geometry=await page.evaluate(()=>{
    const target=document.querySelector('.m26-rc39-date-links>a');
    const nav=document.querySelector('.m26-rc39-date-links');
    const rect=target.getBoundingClientRect();
    return {
      docWidth:document.documentElement.scrollWidth,
      viewport:document.documentElement.clientWidth,
      tapHeight:rect.height,tapWidth:rect.width,
      scrollStyle:getComputedStyle(nav).overflowX,
    };
  });
  expect(geometry.docWidth).toBeLessThanOrEqual(geometry.viewport+1);
  expect(geometry.tapHeight).toBeGreaterThanOrEqual(44);
  expect(geometry.tapWidth).toBeGreaterThanOrEqual(44);
  expect(geometry.scrollStyle).toBe('auto');
  const summary=groups.nth(1).locator(':scope > summary.m26-rc39-day-heading');
  if(testInfo.project.use?.hasTouch)await summary.tap();
  else await summary.click();
  await expect(groups.nth(1)).toHaveAttribute('open','');
  await page.keyboard.press('Tab');
  await links.nth(0).focus();
  const outline=await links.nth(0).evaluate(el=>getComputedStyle(el).outlineStyle);
  expect(outline).toBe('solid');
  if(testInfo.project.name==='live-workout-mobile-chromium'){
    const {mkdir}=await import('node:fs/promises');
    await mkdir('recovery/signature-published-sessions',{recursive:true});
    await page.screenshot({path:'recovery/signature-published-sessions/b15-atelier-320-client-dates.png',
      fullPage:true,animations:'disabled'});
  }
});
