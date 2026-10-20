import {test,expect} from '@playwright/test';

/* Runs the real production shell controller, navigation and CSS against
 * synthetic identity and route bodies. It is not authenticated QA evidence,
 * nor does it establish functional acceptance of the 43 business screens. */
const roles=['client','coach','admin'];
const canonicalWidths=new Set([320,390,768,1024,1440]);
const primaryTarget={client:'planificacion',coach:'clientes',admin:'admin-usuarios'};
const moreTarget={client:'mensajes',coach:'ajustes',admin:'admin-configuracion'};

for(const role of roles){
  test('SIGNATURE U23 '+role+' · real controls, focus and safe mobile drawer',async({page},testInfo)=>{
    const width=testInfo.project.use.viewport?.width;
    test.skip(!canonicalWidths.has(width),'Canonical SIGNATURE viewport sampling only.');
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto('/qa/visual/signature-route-shell.fixture.html?role='+role);
    await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.role)).toBe(role);
    const nav=page.locator(width<=900?'.m26-mobile-nav':'.m26-sidebar');
    await expect(nav).toBeVisible();
    // Real physical control interaction; programmatic store.navigate alone is insufficient.
    await nav.locator('[data-m26-area="'+primaryTarget[role]+'"]').click();
    await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.area())).toBe(primaryTarget[role]);
    await expect(page.locator('.m26-shell')).toHaveAttribute('data-m26-role',role);
    await expect(page.locator('.m26-main')).not.toHaveAttribute('inert','');
    await expect(page.locator('.m26-topbar')).not.toHaveAttribute('inert','');
    await expect(page.locator('.m26-main')).toBeFocused();

    if(width<=900){
      // Every quick action and «Más» must remain physically within the viewport,
      // especially 320px where an older min 58px grid caused dock scrolling.
      const targets=await page.locator('.m26-mobile-nav > .m26-nav-item, .m26-mobile-nav > .m26-mobile-more > summary')
        .evaluateAll(nodes=>nodes.map(node=>{
          const rect=node.getBoundingClientRect();
          return {name:String(node.textContent||'').trim(),left:rect.left,right:rect.right,width:rect.width,height:rect.height};
        }));
      expect(targets.length).toBe(5);
      for(const target of targets){
        expect(target.left,role+' '+width+' '+target.name+' left').toBeGreaterThanOrEqual(-1);
        expect(target.right,role+' '+width+' '+target.name+' right').toBeLessThanOrEqual(width+1);
        expect(target.width,role+' '+width+' '+target.name+' width').toBeGreaterThanOrEqual(44);
        expect(target.height,role+' '+width+' '+target.name+' height').toBeGreaterThanOrEqual(44);
      }
      const more=page.locator('details.m26-mobile-more');
      const summary=more.locator(':scope > summary');
      await summary.click();
      await expect(more).toHaveAttribute('open','');
      await expect(page.locator('.m26-main')).toHaveAttribute('inert','');
      await expect(page.locator('.m26-topbar')).toHaveAttribute('inert','');
      const secondary=more.locator('.m26-mobile-more-menu [data-m26-area="'+moreTarget[role]+'"]');
      await expect(secondary).toBeVisible();
      await secondary.click();
      await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.area())).toBe(moreTarget[role]);
      await expect(page.locator('.m26-main')).not.toHaveAttribute('inert','');
      await expect(page.locator('.m26-topbar')).not.toHaveAttribute('inert','');
      await expect(page.locator('.m26-main')).toBeFocused();
      await expect(page.locator('details.m26-mobile-more')).not.toHaveAttribute('open','');

      await page.locator('details.m26-mobile-more > summary').click();
      await expect(page.locator('details.m26-mobile-more')).toHaveAttribute('open','');
      await page.keyboard.press('Escape');
      await expect(page.locator('details.m26-mobile-more')).not.toHaveAttribute('open','');
      await expect(page.locator('details.m26-mobile-more > summary')).toBeFocused();
      await expect(page.locator('.m26-main')).not.toHaveAttribute('inert','');
      await expect(page.locator('.m26-topbar')).not.toHaveAttribute('inert','');
    }
    expect(pageErrors).toEqual([]);
  });
}
