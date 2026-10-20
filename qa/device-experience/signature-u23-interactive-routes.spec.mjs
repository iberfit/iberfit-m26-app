import {test,expect} from '@playwright/test';

/* Real production shell controller, CSS and Client bottom nav against
 * synthetic identity and route body. NOT authenticated or functional
 * acceptance of the 43 business screens. */
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

    const clientDock=page.locator('.m26-client-bottom-nav');
    const shellMobile=page.locator('.m26-mobile-nav');
    const sideBar=page.locator('.m26-sidebar');
    const surface=await clientDock.isVisible()?'client':
      await shellMobile.isVisible()?'shell':'sidebar';
    const nav=surface==='client'?clientDock:surface==='shell'?shellMobile:sideBar;
    await expect(nav).toBeVisible();
    if(role==='client' && width<=640){
      expect(surface,'Client must use its genuine production bottom dock on phone').toBe('client');
      await expect(shellMobile).not.toBeVisible();
    }
    await nav.locator('[data-m26-area="'+primaryTarget[role]+'"]').click();
    await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.area())).toBe(primaryTarget[role]);
    await expect(page.locator('.m26-shell')).toHaveAttribute('data-m26-role',role);
    await expect(page.locator('.m26-main')).not.toHaveAttribute('inert','');
    await expect(page.locator('.m26-topbar')).not.toHaveAttribute('inert','');
    await expect(page.locator('.m26-main')).toBeFocused();

    if(surface!=='sidebar'){
      // Real visible controls, not nominal viewport assumptions:
      // compact phone -> shell dock or Client's independent production dock;
      // medium-touch tablet -> sidebar (tested by its physical primary tap).
      const selectors=surface==='client'
        ?'.m26-client-bottom-nav > .m26-client-bottom-nav-item, .m26-client-bottom-nav-more > summary'
        :'.m26-mobile-nav > .m26-nav-item, .m26-mobile-more > summary';
      const targets=await page.locator(selectors).evaluateAll(nodes=>nodes.map(node=>{
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
      const moreSelector=surface==='client'
        ?'details.m26-client-bottom-nav-more'
        :'details.m26-mobile-more';
      const more=page.locator(moreSelector);
      const summary=more.locator(':scope > summary');
      await summary.click();
      await expect(more).toHaveAttribute('open','');
      await expect(summary).toHaveAttribute('aria-expanded','true');
      if(surface==='shell'){
        await expect(page.locator('.m26-main')).toHaveAttribute('inert','');
        await expect(page.locator('.m26-topbar')).toHaveAttribute('inert','');
      }
      const secondary=more.locator('[data-m26-area="'+moreTarget[role]+'"]');
      await expect(secondary).toBeVisible();
      await secondary.click();
      await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.area())).toBe(moreTarget[role]);
      await expect(page.locator('.m26-main')).not.toHaveAttribute('inert','');
      await expect(page.locator('.m26-topbar')).not.toHaveAttribute('inert','');
      await expect(page.locator('.m26-main')).toBeFocused();
      await expect(page.locator(moreSelector)).not.toHaveAttribute('open','');

      await page.locator(moreSelector+' > summary').click();
      await expect(page.locator(moreSelector)).toHaveAttribute('open','');
      await page.keyboard.press('Escape');
      await expect(page.locator(moreSelector)).not.toHaveAttribute('open','');
      await expect(page.locator(moreSelector+' > summary')).toHaveAttribute('aria-expanded','false');
      await expect(page.locator(moreSelector+' > summary')).toBeFocused();
      await expect(page.locator('.m26-main')).not.toHaveAttribute('inert','');
      await expect(page.locator('.m26-topbar')).not.toHaveAttribute('inert','');
    }
    expect(pageErrors).toEqual([]);
  });
}
