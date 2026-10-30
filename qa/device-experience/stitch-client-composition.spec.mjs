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
