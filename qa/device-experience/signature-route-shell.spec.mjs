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
      await expect.poll(()=>page.locator('[data-qa-current-area]').getAttribute('data-qa-current-area'),{message:role+' '+area}).toBe(area);
      const state=await page.evaluate(()=>{
        const root=document.documentElement,body=document.body;
        const active=document.querySelector('.m26-shell [data-m26-area][aria-current="page"]');
        const selected=document.querySelector('[data-qa-current-area]');
        return {
          width:Math.max(root.scrollWidth,body.scrollWidth),
          viewport:window.innerWidth,
          active:active?.getAttribute('data-m26-area'),
          current:selected?.getAttribute('data-qa-current-area'),
          role:document.querySelector('.m26-shell')?.getAttribute('data-m26-role'),
        };
      });
      expect(state.current).toBe(area);
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
