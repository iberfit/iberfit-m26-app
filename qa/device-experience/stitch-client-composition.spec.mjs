import {test,expect} from '@playwright/test';
import axe from 'axe-core';

// Real renderer and navigation, synthetic empty state; no authenticated acceptance.
test('Stitch Client composition keeps the primary decision and vertical working destinations',async({page})=>{
  await page.goto('/qa/visual/signature-route-shell.fixture.html?role=client&body=real');
  const route=page.locator('.m26-client-home-stitch-v23');
  await expect(route).toBeVisible();
  await expect(route.locator('.m26-client-home-primary-zone')).toBeVisible();
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
