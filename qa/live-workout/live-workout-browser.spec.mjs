import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

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
  await expect(page.locator('#qa-shell')).toHaveAttribute('data-m26-role','client');
  expect(await page.locator('#qa-root').evaluate(el=>Boolean(el.closest('.m26-shell > .m26-workspace .m26-main')))).toBe(true);
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
  await expect(page.locator('#qa-shell')).toHaveAttribute('data-m26-role','coach');
  expect(await page.locator('#qa-root').evaluate(el=>Boolean(el.closest('.m26-shell > .m26-workspace .m26-main')))).toBe(true);
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
    // U71 · The published session must live in the same real role workspace
    // as the live workout, not outside it in document.body. The production
    // controller remains mounted only on #qa-root (separate sibling).
    const area=document.createElement('section');area.id='qa-client-session-previews';
    area.innerHTML=renderRc39Route(vm);
    const workspace=document.querySelector('#qa-shell > .m26-workspace');
    if(!workspace)throw new Error('U71_CLIENT_SESSION_WORKSPACE_MISSING');
    workspace.appendChild(area);
  });
  const direct=page.locator('#qa-client-session-previews [data-rc39-session="coach"]');
  const guided=page.locator('#qa-client-session-previews [data-rc39-session="guided"]');
  await expect(page.locator('#qa-shell > .m26-workspace > #qa-client-session-previews')).toHaveCount(1);
  await expect(direct).toContainText('Fuerza con Coach');
  await expect(direct).toContainText('50 min');
  await expect(direct).not.toContainText('Press de pecho');
  await expect(direct.locator('details.m26-session-preview-disclosure')).toHaveCount(0);
  await expect(guided.locator('details.m26-session-preview-disclosure')).toHaveCount(1);
  const readyCta=guided.locator('[data-workflow-action="start-published-session"]');
  await expect(readyCta,'U48 start action is immediately visible without opening exercise details').toBeVisible();
  await expect(readyCta).toBeEnabled();
  await expect(readyCta).toHaveCount(1);
  await expect(readyCta).toHaveAttribute('data-entity-id','guided');
  // Strictly verify the native closed -> open transition by real pointer/touch.
  const disclosure=guided.locator('details.m26-session-preview-disclosure');
  await expect(disclosure).not.toHaveAttribute('open','');
  await activatePublishedPreview(guided,testInfo);
  await expect(guided.locator('details.m26-session-preview-disclosure'),
    'Actual pointer interaction must open the native preview before any launch').toHaveAttribute('open','');
  await expect(guided.locator('.m26-session-preview-exercise h5')).toHaveText('Press de pecho');

  // U78 · Native prescription, not nested decorative cards. The missing
  // exercise media remains explicitly labelled and legible; no fake photo.
  const surface=await guided.locator('.m26-session-preview-block').first().evaluate(el=>{
    const block=getComputedStyle(el);
    const label=el.querySelector('h4');
    const fallback=el.querySelector('.m26-exercise-media-fallback');
    const fallbackText=fallback?.querySelector('span,small');
    const f=fallback?getComputedStyle(fallback):null;
    const ink=fallbackText?getComputedStyle(fallbackText):null;
    const rgb=(value)=>String(value).match(/\d+/g)?.slice(0,3).map(Number)||[];
    const luminance=(value)=>{
      const triplet=rgb(value);
      if(triplet.length<3)return 0;
      const linear=triplet.map(n=>{
        const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
      });
      return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
    };
    const bg=luminance(f?.backgroundColor),fg=luminance(ink?.color);
    return {background:block.backgroundColor,borderRadius:block.borderRadius,
      label:label?.textContent?.trim(),fallback:Boolean(fallback),
      mediaText:fallbackText?.textContent?.trim(),
      contrast:(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)};
  });
  expect(surface.background,'The exercise list should not nest another decorative panel')
    .toBe('rgba(0, 0, 0, 0)');
  expect(surface.borderRadius).toBe('0px');
  expect(surface.fallback,'Keep the honest missing-media state').toBe(true);
  expect(surface.mediaText).toContain('Sin referencia visual');
  expect(surface.contrast,'Exercise media fallback needs WCAG AA contrast').toBeGreaterThanOrEqual(4.5);

  // U81: genuine values in the existing description list, visually grouped
  // into one editorial band rather than decorative per-value mini-cards.
  const factStrip=await guided.locator('.m26-session-preview-facts').first().evaluate(el=>{
    const surface=getComputedStyle(el);
    const datum=el.querySelector(':scope > div');
    const value=el.querySelector(':scope > div dd');
    return {
      display:surface.display,
      columns:surface.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
      surfaceBorder:surface.borderTopWidth,
      datumBackground:datum?getComputedStyle(datum).backgroundColor:null,
      valueFont:value?parseFloat(getComputedStyle(value).fontSize):0,
      allFacts:el.querySelectorAll(':scope > div').length,
      completeEntries:[...el.querySelectorAll(':scope > div')].every(row=>{
        const term=row.querySelector(':scope > dt'),definition=row.querySelector(':scope > dd');
        const value=definition?getComputedStyle(definition):null;
        return Boolean(term?.textContent.trim()&&definition?.textContent.trim()&&
          value?.display!=='none'&&value?.visibility!=='hidden');
      })
    };
  });
  expect(factStrip.display).toBe('grid');
  expect(factStrip.columns,'Stitch-style two-column compact Client facts').toBe(2);
  expect(factStrip.surfaceBorder).toBe('1px');
  expect(factStrip.datumBackground,'No new metric mini-cards').toBe('rgba(0, 0, 0, 0)');
  expect(factStrip.valueFont,'Real values remain legible on touch').toBeGreaterThanOrEqual(16);
  expect(factStrip.allFacts,'A prescription must have actual data').toBeGreaterThan(0);
  expect(factStrip.completeEntries,'No prescribed fields can disappear').toBe(true);

  await expect(guided).toContainText('8-10');
  await expect(guided).toContainText('Sin referencia visual');
  await expect(readyCta).toHaveText('Preparar entrenamiento');
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

  // U69 desktop evidence: production .m26-shell uses sidebar + content grid,
  // but this isolated fixture has no sidebar. Never certify a 70px column.
  if((testInfo.project.use.viewport?.width||0)>=1024){
    const dimensions=await screen.evaluate(el=>{
      const rect=el.getBoundingClientRect();
      const parent=el.closest('.m26-shell');
      return {width:rect.width,viewport:document.documentElement.clientWidth,
        shellDisplay:getComputedStyle(parent).display,workspace:Boolean(el.closest('.m26-workspace'))};
    });
    expect(dimensions.workspace).toBe(true);
    expect(dimensions.shellDisplay).toBe('block');
    expect(dimensions.width,'Desktop preview must occupy its actual reading column').toBeGreaterThanOrEqual(650);
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  }

  // U67: this isolated QA must use the same CSS scoping hierarchy as
  // production. Previously it omitted .m26-workspace, so the screenshots
  // showed inline eyebrow/title and missed premium surface declarations.
  const surface=await screen.locator('.m26-client-sessions-brief').evaluate(el=>{
    const eyebrow=el.querySelector(':scope > .m26-eyebrow');
    const title=el.querySelector(':scope > strong');
    const copy=el.querySelector(':scope > p');
    const a=eyebrow?.getBoundingClientRect();
    const b=title?.getBoundingClientRect();
    const c=copy?.getBoundingClientRect();
    const box=el.getBoundingClientRect();
    const css=getComputedStyle(el);
    return {
      hasWorkspace:Boolean(el.closest('.m26-shell > .m26-workspace')),
      display:css.display,
      columns:css.gridTemplateColumns,
      text:el.textContent?.trim(),
      outerWidth:box.width,
      labelEnds:a?.bottom||0,titleStarts:b?.top||0,
      titleEnds:b?.bottom||0,copyStarts:c?.top||0,
      textWrap:getComputedStyle(title).overflowWrap,
    };
  });
  expect(surface.hasWorkspace,'QA must match the production shell CSS ancestry').toBe(true);
  expect(surface.display,'Client status must use the actual premium grid').toBe('grid');
  expect(surface.labelEnds,'Eyebrow must appear above the title').toBeLessThan(surface.titleStarts);
  expect(surface.titleEnds,'Title must appear above explanation').toBeLessThan(surface.copyStarts);
  expect(surface.outerWidth).toBeGreaterThan(180);
  expect(surface.textWrap).not.toBe('normal');

  await expect(screen.locator('[data-rc39-session]')).toHaveCount(2);
  // U73 · Count is editorial metadata for the entire session grid, not
  // a third desktop column that squeezes both session cards.
  const captionGeometry=await screen.locator('.m26-rc39-week').evaluate(el=>{
    const count=el.querySelector(':scope > .m26-session-available-summary');
    const card=el.querySelector(':scope > .m26-rc39-session-card');
    const r=el.getBoundingClientRect(),c=count?.getBoundingClientRect(),b=card?.getBoundingClientRect();
    return {gridWidth:r.width,captionWidth:c?.width||0,captionBottom:c?.bottom||0,
      firstCardTop:b?.top||0,captionLeft:c?.left||0,gridLeft:r.left};
  });
  expect(captionGeometry.captionWidth,'Ready-session caption must span the full session grid')
    .toBeGreaterThanOrEqual(captionGeometry.gridWidth*.93);
  expect(captionGeometry.captionBottom,'Session cards must start below the caption row')
    .toBeLessThanOrEqual(captionGeometry.firstCardTop+1);
  if((testInfo.project.use.viewport?.width||0)>=1200){
    const gridColumns=await screen.locator('.m26-rc39-week').evaluate(el=>
      getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
    expect(gridColumns,'Two published sessions must not leave a third blank desktop column').toBe(2);
  }
  expect(Math.abs(captionGeometry.captionLeft-captionGeometry.gridLeft))
    .toBeLessThanOrEqual(2);

  await expect(page.locator('body')).not.toContainText('QA_PRIVATE_COACH_NOTE_NEVER_CLIENT');
  await expect(page.locator('body')).not.toContainText('QA_PRIVATE_SUPERVISED_NEVER_CLIENT');
  const led=screen.locator('[data-rc39-session="qa-published-supervised"]');
  const self=screen.locator('[data-rc39-session="qa-published-guided"]');
  await expect(led).toContainText('Esta sesión la dirige tu Coach');
  await expect(led.locator('.m26-session-preview-disclosure')).toHaveCount(0);
  await expect(led.locator('[data-workflow-action="start-published-session"]')).toHaveCount(0);
  await expect(self).toContainText('Fuerza autónoma');
  // U72: a narrow card on a wide viewport must remain readable.
  // Unlike document-overflow checks, this catches copy squeezed to a
  // single-character column by a viewport-scoped two-column CSS rule.
  const experienceGeometry=await self.locator('.m26-session-experience').evaluate(el=>{
    const copy=el.querySelector('.m26-session-experience__copy');
    const heading=copy?.querySelector('h4');
    const e=el.getBoundingClientRect(),c=copy?.getBoundingClientRect();
    const h=heading?.getBoundingClientRect();
    return {
      cardWidth:e.width,copyWidth:c?.width||0,headingHeight:h?.height||0,
      lineHeight:heading?Number.parseFloat(getComputedStyle(heading).lineHeight):0,
      overflow:el.scrollWidth>el.clientWidth+1,
      heading:heading?.textContent?.trim()||'',
    };
  });
  expect(experienceGeometry.copyWidth,'Session context may not collapse into vertical letters')
    .toBeGreaterThanOrEqual(Math.min(170,experienceGeometry.cardWidth*.65));
  expect(experienceGeometry.lineHeight).toBeGreaterThan(0);
  expect(experienceGeometry.headingHeight,'The context heading must remain a readable three-line maximum')
    .toBeLessThanOrEqual(experienceGeometry.lineHeight*3.5);
  expect(experienceGeometry.overflow).toBe(false);
  expect(experienceGeometry.heading).toContain('IBERFIT');
  const directStart=self.locator('[data-workflow-action="start-published-session"]');
  await expect(directStart,'U48 guided Client Play must be available without disclosure').toBeVisible();
  await expect(directStart).toBeEnabled();
  await expect(directStart).toHaveCount(1);
  await expect(directStart).toHaveAttribute('data-entity-id','qa-published-guided');
  await activatePublishedPreview(self,testInfo);
  await expect(self.locator('details.m26-session-preview-disclosure'),
    'Client preview must open by a real tap, including mobile WebKit').toHaveAttribute('open','');
  const start=self.locator('[data-workflow-action="start-published-session"]');
  await expect(start).toBeVisible();
  await expect(start).toHaveText('Preparar entrenamiento');
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
      const compactBrief=await screen.locator('.m26-client-sessions-brief').evaluate(el=>{
        const eyebrow=el.querySelector(':scope > .m26-eyebrow').getBoundingClientRect();
        const title=el.querySelector(':scope > strong').getBoundingClientRect();
        const copy=el.querySelector(':scope > p').getBoundingClientRect();
        const boundary=el.getBoundingClientRect();
        return {
          display:getComputedStyle(el).display,
          eyebrowBottom:eyebrow.bottom,titleTop:title.top,
          titleBottom:title.bottom,copyTop:copy.top,
          left:boundary.left,right:boundary.right,viewport:document.documentElement.clientWidth,
        };
      });
      expect(compactBrief.display).toBe('grid');
      expect(compactBrief.titleTop).toBeGreaterThan(compactBrief.eyebrowBottom);
      expect(compactBrief.copyTop).toBeGreaterThan(compactBrief.titleBottom);
      expect(compactBrief.left).toBeGreaterThanOrEqual(-1);
      expect(compactBrief.right).toBeLessThanOrEqual(compactBrief.viewport+1);

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
    // U75 · The controller serializes writes. A Client must never race the
    // acknowledgement or activate a control blocked by the sticky dock.
    await expect.poll(()=>page.locator('#qa-workout').getAttribute('data-m26-session-action-pending'))
      .toBeNull();
    const continueNow=page.locator('#qa-workout [data-session-action="next"]');
    await expect(continueNow).toBeEnabled();
    await continueNow.scrollIntoViewIfNeeded();
    const exposed=await continueNow.evaluate(button=>{
      const rect=button.getBoundingClientRect();
      const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
      const atPoint=document.elementFromPoint(x,y);
      return atPoint===button||button.contains(atPoint);
    });
    expect(exposed,'Continue now must not sit beneath the sticky session control dock').toBe(true);
    await continueNow.click();
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


// U77 · Canonical 43-route visual geometry certification in the already-running
// isolated browser matrix. Uses the real route renderer + synthetic identity,
// performs no network writes, and MUST NOT be described as authenticated QA.
// A route can fit the viewport and still be unreadable (one-letter columns).
const u77Inventory=JSON.parse(readFileSync(new URL('../visual/signature-360-coverage.json',import.meta.url),'utf8'));
for(const role of ['client','coach','admin']){
  test('SIGNATURE U77 · Canonical 43-route readability and role safety · '+role,async({page},testInfo)=>{
    const errors=[],mutations=[];
    page.on('pageerror',error=>errors.push(String(error.message||error).slice(0,240)));
    page.on('request',request=>{
      if(!['GET','HEAD'].includes(request.method()))mutations.push(request.method());
    });
    await page.goto('/qa/visual/signature-route-shell.fixture.html?role='+role+'&body=real',
      {waitUntil:'domcontentloaded'});
    await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.bodyMode))
      .toBe('real-synthetic');
    const entries=u77Inventory.roles[role];
    expect(entries.length).toBe(role==='client'?9:17);
    // U80: all 43 canonical route bodies need individual evidence, not only
    // the final route left on-screen at the end of a test. Reuse the existing
    // read-only synthetic fixture and browser project, with zero extra HTTP.
    // JPEG at CSS resolution bounds artifact size without hiding long pages.
    // These are NOT authenticated screenshots or Stitch fidelity approvals.
    const visualEvidenceProject=['live-workout-mobile-chromium','live-workout-desktop-chromium']
      .includes(testInfo.project.name);
    const visualEvidenceAreas=[];
    const scrollEvidence={};
    const visualEvidenceDir='recovery/signature-published-sessions/u80/'+testInfo.project.name+'/'+role;
    if(visualEvidenceProject){
      const {mkdir}=await import('node:fs/promises');
      await mkdir(visualEvidenceDir,{recursive:true});
    }
    for(const {area} of entries){
      const previousErrorCount=errors.length;
      await page.evaluate(target=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__.navigate(target),area);
      await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__.area()),
        {message:role+' '+area+' route switch'}).toBe(area);
      if(area==='admin-media-review'){
        await expect.poll(()=>page.evaluate(()=>Boolean(
          document.querySelector('link[data-m26-media-review-style]')?.sheet
        )),{message:'Use actual admin media-review stylesheet'}).toBe(true);
      }
      const metrics=await page.evaluate(()=>{
        const root=document.querySelector('.m26-shell');
        const main=document.querySelector('.m26-main');
        const body=main?.querySelector('.m26-client-route-shell,.m26-route,.m26-admin-route,.m26-communication-route,.m26-rc39-planning,.m26-rc39-sessions,[data-admin-media-review-route]');
        const heading=body?.querySelector('h1,h2,h3')||main?.querySelector('h1,h2,h3');
        const bodyRect=body?.getBoundingClientRect(),hRect=heading?.getBoundingClientRect();
        const style=heading?getComputedStyle(heading):null;
        const fontSize=Number.parseFloat(style?.fontSize)||16;
        const lineHeight=Number.parseFloat(style?.lineHeight)||fontSize*1.25;
        return {
          role:root?.dataset.m26Role,
          body:Boolean(bodyRect&&bodyRect.width>10&&bodyRect.height>10),
          heading:String(heading?.textContent||'').trim(),
          headingWidth:hRect?.width||0,
          headingLines:hRect&&lineHeight>0?hRect.height/lineHeight:0,
          bodyWidth:bodyRect?.width||0,
          pageWidth:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth),
          viewport:document.documentElement.clientWidth,
          inert:main?.inert||false,
          placeholder:Boolean(main?.querySelector('.m26-route-placeholder')),
        };
      });
      expect(errors.slice(previousErrorCount),role+' '+area+' runtime errors').toEqual([]);
      expect(metrics.role,role+' '+area+' never cross a role boundary').toBe(role);
      expect(metrics.body,role+' '+area+' genuine route must be visible').toBe(true);
      expect(metrics.placeholder,role+' '+area+' must not substitute fake route markup').toBe(false);
      expect(metrics.inert,role+' '+area+' main must not freeze').toBe(false);
      expect(metrics.heading.length,role+' '+area+' title required').toBeGreaterThan(0);
      expect(metrics.pageWidth,role+' '+area+' zero horizontal overflow').toBeLessThanOrEqual(metrics.viewport+2);
      if(metrics.heading.length>=12){
        expect(metrics.headingWidth,role+' '+area+' text column must remain readable')
          .toBeGreaterThanOrEqual(Math.min(135,Math.max(90,metrics.viewport*.28)));
        expect(metrics.headingLines,role+' '+area+' no letter-by-letter vertical headings')
          .toBeLessThanOrEqual(Math.max(5,Math.ceil(metrics.heading.length/5)));
      }
      if(visualEvidenceProject){
        // Persist to the already-uploaded synthetic QA artifact directory.
        // testInfo.attach alone would be discarded on a SUCCESS workflow run.
        await page.screenshot({
          path:visualEvidenceDir+'/'+area+'.jpg',
          type:'jpeg',quality:68,fullPage:true,scale:'css',animations:'disabled',caret:'hide'
        });
        // U82: fullPage only captures the document, not necessarily a nested
        // scrollable workspace. Preserve an end-of-scroll viewport when a
        // genuine scroll root exists, and record geometry if none does.
        const scroll=await page.evaluate(()=>{
          const route=document.querySelector('.m26-main .m26-client-route-shell,.m26-main .m26-route,.m26-main .m26-admin-route');
          const candidates=[
            ['client-route-scrollport',document.querySelector(
              '.m26-shell[data-m26-role="client"] .m26-client-route-shell > :not(.m26-client-bottom-nav-layer)'
            )],
            ['document',document.scrollingElement],
            ['main',document.querySelector('.m26-main')],
            ['workspace',document.querySelector('.m26-workspace')],
            ['body',document.body],
          ];
          const inspected=candidates.filter(([,node])=>node).map(([name,node])=>({
            name,node,range:Math.max(0,node.scrollHeight-node.clientHeight),
            overflow:getComputedStyle(node).overflowY
          }));
          const reachable=inspected.filter(item=>item.range>24&&
            (item.name==='document'||/auto|scroll/.test(item.overflow)))
            .sort((a,b)=>b.range-a.range);
          let target=null,moved=0;
          for(const item of reachable){
            const prior=item.node.scrollTop;
            item.node.scrollTop=item.node.scrollHeight;
            const delta=item.node.scrollTop-prior;
            if(delta>12){target=item.name;moved=delta;break;}
          }
          return {
            viewportHeight:document.documentElement.clientHeight,
            documentHeight:document.scrollingElement?.scrollHeight||0,
            routeHeight:Math.round(route?.getBoundingClientRect().height||0),
            scrollTarget:target,
            moved:Math.round(moved),
            candidateRanges:inspected.map(({name,range,overflow})=>({name,range,overflow}))
          };
        });
        if(scroll.scrollTarget&&scroll.moved>12){
          await page.screenshot({
            path:visualEvidenceDir+'/'+area+'-scrolled.jpg',
            type:'jpeg',quality:68,fullPage:false,scale:'css',
            animations:'disabled',caret:'hide'
          });
        }
        // Restore ordinary navigation behavior before loading the next route.
        await page.evaluate(()=>{
          for(const node of [document.scrollingElement,document.querySelector('.m26-main'),
            document.querySelector('.m26-workspace'),document.body]){
            if(node)node.scrollTop=0;
          }
        });
        scrollEvidence[area]=scroll;
        visualEvidenceAreas.push(area);
      }
    }
    if(visualEvidenceProject){
      expect(visualEvidenceAreas,role+' all canonical areas must have evidence')
        .toEqual(entries.map(item=>item.area));
      const manifest={
        schema:'iberfit.signature.visual-evidence.v1',
        renderer:'real-route-renderer',
        identity:'synthetic',
        authenticated:false,
        stitchParityCertified:false,
        project:testInfo.project.name,
        viewport:testInfo.project.use.viewport,
        role,
        areas:visualEvidenceAreas,
        scrollEvidence,
        evidenceScope:'synthetic navigation geometry and top/end frames, never authenticated'
      };
      const {writeFile}=await import('node:fs/promises');
      await writeFile(visualEvidenceDir+'/manifest.json',JSON.stringify(manifest,null,2),'utf8');
    }
    expect(mutations,role+' must never write to a remote backend in static visual QA').toEqual([]);
    expect(errors,role+' must be free of page errors').toEqual([]);
    // Tablet/WebKit keep their original final frame. Mobile/desktop now have
    // complete, individually named per-route evidence plus a truthful manifest.
    if(!visualEvidenceProject){
      const image=await page.screenshot({fullPage:false,animations:'disabled',caret:'hide'});
      await testInfo.attach('signature-u77-'+role+'-'+testInfo.project.name+'.png',
        {body:image,contentType:'image/png'});
    }
  });
}

\n// U83 · Native-resolution visual evidence for the single approved Stitch
// reference. The 43-route JPEG geometry survey remains 1x intentionally.
// This test creates one isolated dPR3 browser context, no Supabase calls.
test('SIGNATURE U83 · Cliente Hoy Retina 390 CSS px at dPR 3 produces native PNG evidence',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='live-workout-mobile-chromium',
    'One isolated 3x master frame only; do not multiply CI image costs.');
  const context=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:3,
    isMobile:true,hasTouch:true,locale:'es-ES',timezoneId:'America/Santiago',
    serviceWorkers:'block',reducedMotion:'reduce',
    baseURL:'http://127.0.0.1:4211',
  });
  try{
    const page=await context.newPage();
    const mutations=[],errors=[];
    page.on('request',request=>{
      if(!['GET','HEAD'].includes(request.method()))mutations.push(request.method());
    });
    page.on('pageerror',error=>errors.push(String(error.message||error)));
    await page.goto('/qa/visual/signature-route-shell.fixture.html?role=client&body=real',
      {waitUntil:'domcontentloaded'});
    await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.bodyMode))
      .toBe('real-synthetic');
    await expect(page.locator('.m26-client-home-stitch-v23')).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    const dpr=await page.evaluate(()=>window.devicePixelRatio);
    expect(dpr).toBe(3);
    const png=await page.screenshot({
      type:'png',scale:'device',fullPage:false,animations:'disabled',caret:'hide'
    });
    expect(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true);
    expect(png.readUInt32BE(16),'Native 390 CSS px * dPR 3 = 1170 physical pixels').toBe(1170);
    expect(png.readUInt32BE(20),'Native 844 CSS px * dPR 3 = 2532 physical pixels').toBe(2532);
    const dir='recovery/signature-published-sessions/u83';
    const {mkdir,writeFile}=await import('node:fs/promises');
    await mkdir(dir,{recursive:true});
    await writeFile(dir+'/cliente-hoy-390-dpr3.png',png);
    const scroll=await page.evaluate(()=>{
      const root=document.querySelector(
        '.m26-shell[data-m26-role="client"] .m26-client-route-shell > :not(.m26-client-bottom-nav-layer)'
      );
      if(!root)return {present:false,range:0,moved:0};
      const range=Math.max(0,root.scrollHeight-root.clientHeight);
      const prior=root.scrollTop;
      root.scrollTop=root.scrollHeight;
      return {present:true,range,moved:root.scrollTop-prior};
    });
    if(scroll.moved>12){
      const lower=await page.screenshot({
        type:'png',scale:'device',fullPage:false,animations:'disabled',caret:'hide'
      });
      expect(lower.readUInt32BE(16)).toBe(1170);
      expect(lower.readUInt32BE(20)).toBe(2532);
      await writeFile(dir+'/cliente-hoy-390-dpr3-scrolled.png',lower);
    }
    await writeFile(dir+'/manifest.json',JSON.stringify({
      schema:'iberfit.signature.retina-evidence.v1',
      role:'client',route:'hoy',viewportCss:{width:390,height:844},
      deviceScaleFactor:dpr,pngPhysical:{width:1170,height:2532},
      renderer:'real-route-renderer',identity:'synthetic',authenticated:false,
      stitchParityCertified:false,scroll,
      scope:'native-resolution QA evidence; not authenticated or visual acceptance'
    },null,2),'utf8');
    expect(mutations,'No remote writes for retina visual QA').toEqual([]);
    expect(errors,'Retina route must not produce runtime errors').toEqual([]);
  }finally{
    await context.close();
  }
});
