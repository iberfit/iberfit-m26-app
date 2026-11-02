import {test,expect} from '@playwright/test';
import axe from 'axe-core';

// Real renderer and navigation, synthetic empty state; no authenticated acceptance.
test('Stitch Client composition keeps the primary decision and vertical working destinations',async({page})=>{
  await page.goto('/qa/visual/signature-route-shell.fixture.html?role=client&body=real');
  const route=page.locator('.m26-client-home-stitch-v23');
  await expect(route).toBeVisible();
  await expect(route.locator('.m26-client-home-primary-zone')).toBeVisible();
  // R39 · Editorial calendar is real product content, not a raster screenshot.
  // All 7 dates retain semantic calendar days in mobile, tablet and desktop.
  const week=route.locator('[data-client-week-rail]');
  await expect(week).toBeVisible();
  await expect(week.locator('li time[datetime]')).toHaveCount(7);
  await expect(week.locator('button[data-m26-area="planificacion"]')).toHaveCount(1);

  await expect(route.locator('.m26-client-home-hero .m26-client-home-status')).toHaveCount(0);
  await expect(route.locator('.m26-today-action.is-primary')).toHaveCount(1);
  const buttons=route.locator('.m26-client-home-compass-actions button');
  await expect(buttons).toHaveCount(3);
  const bounds=await buttons.evaluateAll(items=>items.map(el=>{
    const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,left:r.left,right:r.right};
  }));
  for(let i=0;i<bounds.length;i++){
    expect(bounds[i].height).toBeGreaterThanOrEqual(44);
    if(i)expect(bounds[i].top).toBeGreaterThanOrEqual(bounds[i-1].bottom);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
  await page.addScriptTag({content:axe.source});
  const accessibility=await page.evaluate(async()=>{
    const result=await axe.run('.m26-client-home-stitch-v23',{runOnly:['wcag2a','wcag2aa','wcag21aa']});
    return result.violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.length}));
  });
  expect(accessibility).toEqual([]);
  await buttons.first().click();
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__.area())).toBe('sesion');
});

// U65 visual evidence uses genuine production renderer with an isolated,
// synthetic fully published session; it never asserts authenticated acceptance.
test('Stitch published session shows honest technical depth and native touch disclosure',async({page},testInfo)=>{
  const width=testInfo.project.use.viewport?.width;
  test.skip(![320,390,1440].includes(width),'Canonical phone and desktop evidence only.');
  await page.goto('/qa/visual/signature-route-shell.fixture.html?role=client&body=real');
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.bodyMode)).toBe('real-synthetic');
  await page.evaluate(async()=>{
    const {renderHoyRoute}=await import('/src/m26/modules/route-render.js');
    const clientId='10000000-0000-4000-8000-000000006511';
    const id='10000000-0000-4000-8000-000000006512';
    const session={id,clientId,status:'disponible',deliveryModality:'guiada_en_app',
      deliveryOwnership:'guided_in_app',clientVisibilityLevel:'full',
      body:{id,clientId,blocks:[
        {type:'exercise',exerciseId:'e1',name:'Movilidad y activación'},
        {type:'exercise',exerciseId:'e2',name:'Fuerza de tren inferior'},
      ]}};
    const view={role:'client',serviceKind:'training',
      clients:[{id:clientId,name:'Cliente sintético',serviceActive:true}],
      appointments:[],upcoming:[],operations:{},rc39:{sessionProjections:[
        {id,visible:true,visibility:'full',canClientStart:true,session,appointmentId:null},
      ]}};
    const route=document.querySelector('.m26-client-home-stitch-v23');
    if(!route)throw new Error('U65_REAL_ROUTE_MISSING');
    route.outerHTML=renderHoyRoute(view);
  });
  const route=page.locator('.m26-client-home-stitch-v23');
  const detail=route.locator('.m26-client-stitch-session-details');
  await expect(route.locator('[data-client-session-preview]')).toBeVisible();
  await expect(route.locator('[data-workflow-action="start-published-session"]')).toHaveCount(1);
  await expect(detail.locator('summary')).toContainText('Ver ejercicios');
  await expect(route.locator('[data-client-session-preview]')).toHaveAttribute('aria-label','Ejercicios de tu entrenamiento');
  await expect(route.locator('.m26-client-stitch-session-facts')).toContainText('Entrenamiento preparado');
  await expect(detail).not.toHaveAttribute('open', '');
  await detail.locator('summary').click();
  await expect(detail).toHaveAttribute('open','');
  await expect(detail.locator('li')).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
  await page.addScriptTag({content:axe.source});
  const accessibility=await page.evaluate(async()=>{
    const result=await axe.run('.m26-client-home-stitch-v23',{runOnly:['wcag2a','wcag2aa','wcag21aa']});
    return result.violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.length}));
  });
  expect(accessibility).toEqual([]);
  const image=await page.screenshot({fullPage:true,animations:'disabled',caret:'hide'});
  await testInfo.attach('stitch-u65-real-render-synthetic-'+testInfo.project.name+'.png',{body:image,contentType:'image/png'});
});

test('U66 real renderer keeps labelled navigation, focus and zero overflow',async({page},testInfo)=>{
  const width=testInfo.project.use.viewport?.width;
  test.skip(![320,390,768,1024,1440].includes(width),'Canonical responsive fidelity sample only.');
  await page.goto('/qa/visual/signature-route-shell.fixture.html?role=client&body=real');
  const route=page.locator('.m26-client-home-stitch-v23');
  await expect(route).toBeVisible();
  const nav=route.getByRole('navigation',{name:'Tu espacio de entrenamiento'});
  await expect(nav).toBeVisible();
  await expect(nav.locator('button')).toHaveCount(3);
  await expect(route.getByRole('group',{name:'Acción principal de hoy'})).toBeVisible();
  await nav.locator('button').first().focus();
  const state=await nav.locator('button').first().evaluate(el=>{
    const x=el.getBoundingClientRect(),s=getComputedStyle(el);
    const a=el.querySelector('strong');
    return {height:x.height,width:x.width,focus:el===document.activeElement,
      label:a?.textContent?.trim(),overflow:s.overflow};
  });
  expect(state.focus).toBe(true);
  expect(state.height).toBeGreaterThanOrEqual(44);
  expect(state.width).toBeGreaterThan(100);
  expect(state.label).toBe('Entreno');
  expect(await page.evaluate(()=>Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
  await page.keyboard.press('Enter');
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.area())).toBe('sesion');
  expect(await page.evaluate(()=>Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
});


// SIGNATURE R47 · Real Client Session renderer inside the actual shell and dock.
// Synthetic prescription; no fake remote ACK and no live account/session writes.
test('R47 Client session offers one reachable authorized action before optional details, with dock clear',async({page},testInfo)=>{
  const width=testInfo.project.use.viewport?.width;
  test.skip(![320,390,768,820,1440].includes(width),'Session editorial reference device widths.');
  await page.goto('/qa/visual/signature-route-shell.fixture.html?role=client&body=real');
  await page.evaluate(async()=>{
    const {renderRc39Route}=await import('/src/m26/rc39/route-render.js');
    const id='10000000-0000-4000-8000-000000004747';
    const clientId='10000000-0000-4000-8000-000000004748';
    const projection={id,title:'Carrera suave',visible:true,visibility:'full',
      modality:'guiada_en_app',ownership:'guided_in_app',canClientStart:true,
      canClientExecute:true,appointmentId:null,
      session:{id,clientId,status:'publicado',deliveryOwnership:'guided_in_app',
        deliveryModality:'guiada_en_app',clientVisibilityLevel:'full',durationMinutes:60,
        blocks:[{id:'block1',type:'exercise',exerciseId:'e-run',
          name:'Carrera suave',sets:1,plannedDurationMinutes:35,plannedPace:'5:30',targetRpe:6}],
        coachPrivateNotes:'PRIVADO_NO_MOSTRAR'}};
    const mock={kind:'sesion',role:'client',serviceActive:true,
      selectedClient:{modality:'hibrido'},
      rc39:{role:'client',sessionProjections:[projection],appointments:[]},
      sessionPreviewAssets:{catalog:[{id:'e-run',name_es:'Carrera suave'}],mediaMap:null}};
    const target=document.querySelector('.m26-route');
    if(!target)throw Error('R47_REAL_SHELL_BODY_NOT_FOUND');
    target.outerHTML=renderRc39Route(mock);
  });
  const route=page.locator('.m26-rc39-sessions');
  const card=route.locator('.m26-rc39-session-card').first();
  await expect(card).toBeVisible();
  const action=card.locator(':scope > .m26-session-preview-actions[data-client-session-primary] > button');
  await expect(action).toBeVisible();
  await expect(action).toContainText('Preparar entrenamiento');
  await expect(card.locator('[data-workflow-action="start-published-session"]')).toHaveCount(1);
  await expect(card.locator('.m26-rc39-session-content')).toHaveCount(1);
  await expect(card.locator('.m26-rc39-session-content')).not.toHaveAttribute('open','');
  await expect(card).not.toContainText('PRIVADO_NO_MOSTRAR');
  await expect(card).not.toContainText('Contenido completo');
  // R48: do not bury the real action beneath three redundant explanation cards.
  await expect(route.locator('[data-client-sessions-brief]')).toHaveCount(0);
  await expect(route.locator('[data-signature-session-guidance]')).toHaveCount(0);
  await expect(route.locator('[data-session-available-count="1"]')).toHaveCount(0);
  const beforeScroll=await action.evaluate(el=>{
    const button=el.getBoundingClientRect();
    const dock=document.querySelector('.m26-client-bottom-nav-layer')?.getBoundingClientRect();
    return {buttonTop:button.top,buttonBottom:button.bottom,dockTop:dock?.top??innerHeight};
  });
  if(width<=390){
    expect(beforeScroll.buttonTop).toBeGreaterThanOrEqual(0);
    expect(beforeScroll.buttonBottom).toBeLessThanOrEqual(beforeScroll.dockTop+1);
  }
  await action.scrollIntoViewIfNeeded();
  await action.focus();
  const geometry=await page.evaluate(()=>{
    const b=document.querySelector('.m26-rc39-session-card [data-client-session-primary] button');
    const d=document.querySelector('.m26-rc39-session-card .m26-rc39-session-content');
    const nav=document.querySelector('.m26-client-bottom-nav-layer');
    const r=el=>{const x=el.getBoundingClientRect();return {top:x.top,bottom:x.bottom,left:x.left,right:x.right,width:x.width,height:x.height}};
    const btn=r(b),details=r(d),dock=nav?r(nav):null;
    const hit=document.elementFromPoint(btn.left+btn.width/2,btn.top+btn.height/2);
    return {btn,details,dock,focus:document.activeElement===b,
      hit:hit===b||b.contains(hit),
      horizontal:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth};
  });
  expect(geometry.btn.height).toBeGreaterThanOrEqual(52);
  expect(geometry.btn.top).toBeLessThan(geometry.details.top);
  expect(geometry.focus).toBe(true);
  expect(geometry.hit).toBe(true);
  expect(geometry.horizontal).toBeLessThanOrEqual(2);
  if(width<=390&&geometry.dock)expect(geometry.btn.bottom).toBeLessThanOrEqual(geometry.dock.top+1);
  const disclosure=card.locator('.m26-rc39-session-content');
  await disclosure.locator('summary').click();
  await expect(disclosure).toHaveAttribute('open','');
  await expect(disclosure).toContainText('Carrera suave');
  await expect(disclosure).toContainText('35 min');
  await expect(disclosure).toContainText('5:30 min/km');
  await expect(disclosure).toContainText('6 de 10');
  await expect(disclosure).toContainText('Ritmo orientativo');
  await expect(disclosure).not.toContainText('Distancia (km)');
  await expect(disclosure.locator('dt')).not.toContainText('RPE');
  await expect(card.locator('[data-workflow-action="start-published-session"]')).toHaveCount(1);
  await testInfo.attach('r47-client-session-real-render-'+testInfo.project.name+'.png',{
    body:await page.screenshot({fullPage:true,animations:'disabled',caret:'hide'}),contentType:'image/png'});
});
