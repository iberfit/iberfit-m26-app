import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

const inventory=JSON.parse(readFileSync(new URL('../visual/signature-360-coverage.json',import.meta.url),'utf8'));
const roles=['client','coach','admin'];

for(const role of roles){
  test('SIGNATURE U22 '+role+' · route matrix + mobile recovery (synthetic shell)',async({page})=>{
    const pageErrors=[];
    page.on('pageerror',(error)=>pageErrors.push(error.message));
    await page.goto('/qa/visual/signature-route-shell.fixture.html?role='+role);
    await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.role)).toBe(role);
    const entries=inventory.roles[role];
    expect(entries.length).toBeGreaterThan(0);
    for(const {area} of entries){
      await page.evaluate((target)=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__.navigate(target),area);
      await expect.poll(()=>page.evaluate(()=>{
        // Enabled Admin Media Factory renders its own canonical route instead
        // of the fixture's placeholder; do not confuse that with a redirect.
        if(document.querySelector('[data-admin-media-review-route]'))return 'admin-media-review';
        return document.querySelector('[data-qa-current-area]')?.getAttribute('data-qa-current-area');
      }),{message:role+' '+area}).toBe(area);
      const state=await page.evaluate(()=>{
        const root=document.documentElement,body=document.body;
        const active=document.querySelector('.m26-shell [data-m26-area][aria-current="page"]');
        const selected=document.querySelector('[data-qa-current-area]');
        return {
          width:Math.max(root.scrollWidth,body.scrollWidth),
          viewport:window.innerWidth,
          active:active?.getAttribute('data-m26-area'),
          current:document.querySelector('[data-admin-media-review-route]')?'admin-media-review':selected?.getAttribute('data-qa-current-area'),
          role:document.querySelector('.m26-shell')?.getAttribute('data-m26-role'),
        };
      });
      expect(state.current).toBe(area);
      if(area==='admin-media-review'){
        await expect(page.locator('[data-media-review-live]')).toContainText('Preparando conexión segura');
        // No infinite MutationObserver -> microtask -> textContent loop:
        // this browser-side probe must resolve even without a Media service.
        expect(await page.evaluate(()=>document.querySelectorAll('link[data-m26-media-review-style]').length)).toBe(1);
      }
      expect(state.active).toBe(area);
      expect(state.role).toBe(role);
      expect(state.width,role+' '+area+' horizontal overflow').toBeLessThanOrEqual(state.viewport+2);
    }

    // Native "Más" is a disclosure of ordinary route buttons, not a WAI menu.
    const more=page.locator('details.m26-mobile-more');
    const summary=more.locator(':scope > summary');
    expect(await more.count()).toBe(1);
    await expect(more.locator('.m26-mobile-more-menu')).not.toHaveAttribute('role','menu');
    await expect(summary).not.toHaveAttribute('aria-haspopup','menu');
    const visible=await more.isVisible();
    if(visible){
      // Force a route change from outside the drawer: never resurrect old
      // "Más" state or leave the new workspace inert.
      await summary.click();
      await expect(more).toHaveAttribute('open','');
      await expect(page.locator('.m26-main')).toHaveAttribute('inert','');
      const target=entries[0].area;
      await page.evaluate((area)=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__.navigate(area),target);
      await expect.poll(()=>page.locator('[data-qa-current-area]').getAttribute('data-qa-current-area')).toBe(target);
      await expect(page.locator('details.m26-mobile-more')).not.toHaveAttribute('open','');
      await expect(page.locator('.m26-main')).not.toHaveAttribute('inert','');
      await expect(page.locator('.m26-topbar')).not.toHaveAttribute('inert','');

      await page.locator('details.m26-mobile-more > summary').click();
      await expect(page.locator('details.m26-mobile-more')).toHaveAttribute('open','');
      await page.keyboard.press('Escape');
      await expect(page.locator('details.m26-mobile-more')).not.toHaveAttribute('open','');
      await expect(page.locator('.m26-main')).not.toHaveAttribute('inert','');
      await expect(page.locator('details.m26-mobile-more > summary')).toBeFocused();
    }
    expect(pageErrors).toEqual([]);
  });
}


// SIGNATURE R46: client dock owns a reserved layout track. This is the real
// production renderer and styles in synthetic QA, not an authenticated session.
// Prevents importing Stitch's fixed-overlay prototype into the actual app.
test('Client mobile dock stays at viewport bottom while the full route scrolls above it',async({page},testInfo)=>{
  const width=testInfo.project.use.viewport?.width;
  test.skip(![320,360,390].includes(width),'Compact mobile dock regression only.');
  const failures=[];
  page.on('pageerror',error=>failures.push(error.message));
  await page.goto('/qa/visual/signature-route-shell.fixture.html?role=client');
  await expect(page.locator('.m26-client-bottom-nav')).toBeVisible();
  const areas=inventory.roles.client.map(entry=>entry.area);
  for(const area of areas){
    await page.evaluate(next=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__.navigate(next),area);
    await expect.poll(()=>page.locator('.m26-client-route-shell')
      .getAttribute('data-client-bottom-nav-route')).toBe(area);
    const measurement=await page.evaluate(()=>{
      const shell=document.querySelector('.m26-shell[data-m26-role="client"]');
      const route=shell?.querySelector('.m26-client-route-shell');
      const dock=route?.querySelector(':scope > .m26-client-bottom-nav-layer');
      const scrollport=route?.querySelector(':scope > :not(.m26-client-bottom-nav-layer)');
      if(!shell||!route||!dock||!scrollport)return {missing:true};
      const marker=document.createElement('button');
      marker.type='button';
      marker.textContent='Última acción accesible';
      marker.style.cssText='display:block;min-height:44px;width:min(100%,260px);margin-top:1250px;';
      scrollport.append(marker);
      const box=el=>{const r=el.getBoundingClientRect();
        return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}};
      const before={dock:box(dock),scrollport:box(scrollport),
        dockPosition:getComputedStyle(dock).position,
        scrollOverflow:getComputedStyle(scrollport).overflowY,
        scrollable:scrollport.scrollHeight>scrollport.clientHeight,
        horizontal:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};
      scrollport.scrollTop=scrollport.scrollHeight;
      marker.focus({preventScroll:true});
      const target=box(marker),nav=box(dock),content=box(scrollport);
      const midX=Math.min(innerWidth-1,Math.max(0,(target.left+target.right)/2));
      const midY=Math.min(innerHeight-1,Math.max(0,(target.top+target.bottom)/2));
      const hit=document.elementFromPoint(midX,midY);
      return {before,after:{dock:nav,content,target,scrollTop:scrollport.scrollTop,
        dockBottomAtViewport:Math.abs(nav.bottom-innerHeight)<=3,
        dockDidNotMove:Math.abs(nav.top-before.dock.top)<=1,
        lastActionAboveDock:target.bottom<=nav.top-1&&target.top>=content.top-1,
        lastActionReachable:hit===marker||marker.contains(hit),
        keyboardFocus:document.activeElement===marker,
        docScrollY:window.scrollY,
        documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}};
    });
    expect(measurement.missing,area).not.toBe(true);
    expect(measurement.before.scrollOverflow,area).toBe('auto');
    expect(measurement.before.dockPosition,area).toBe('relative');
    expect(measurement.before.scrollable,area).toBe(true);
    expect(measurement.before.horizontal,area).toBe(false);
    expect(measurement.after.scrollTop,area).toBeGreaterThan(0);
    expect(measurement.after.dockBottomAtViewport,area).toBe(true);
    expect(measurement.after.dockDidNotMove,area).toBe(true);
    expect(measurement.after.lastActionAboveDock,area).toBe(true);
    expect(measurement.after.lastActionReachable,area).toBe(true);
    expect(measurement.after.keyboardFocus,area).toBe(true);
    expect(measurement.after.docScrollY,area).toBe(0);
    expect(measurement.after.documentOverflow,area).toBe(false);
  }
  expect(failures).toEqual([]);
});
