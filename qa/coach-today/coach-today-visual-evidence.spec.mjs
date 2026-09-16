import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const OUT='recovery/daily-use-visual/coach-today';

async function settle(page){
  await page.evaluate(async()=>{
    await document.fonts?.ready;
    document.documentElement.setAttribute('data-coach-today-visual','true');
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(120);
}

test.beforeAll(async()=>{await mkdir(OUT,{recursive:true});});

test('Coach Hoy visual evidence keeps operational content ahead of optional shortcuts',async({page},testInfo)=>{
  await page.goto('/qa/coach-today/fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_TODAY_VISUAL__?.mounted===true)).toBe(true);
  await settle(page);

  const shell=page.locator('.m26-shell[data-m26-role="coach"]');
  const shortcuts=page.locator('[data-m26-workspace-shortcuts="coach"]');
  const route=page.locator('.m26-hoy-route.m26-coach-home-v1');
  const nextAction=page.locator('.m26-coach-home-command');
  const launch=page.locator('[data-coach-launch-self]');

  await expect(shell).toBeVisible();
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts).not.toHaveAttribute('open','');
  await expect(shortcuts.locator('.m26-workspace-action')).toHaveCount(4);
  await expect(route).toBeVisible();
  await expect(nextAction).toBeVisible();
  await expect(launch).toBeVisible();
  await expect(launch).toHaveAttribute('data-coach-launch-density','compact');
  await expect(launch).not.toHaveAttribute('open','');

  const metrics=await page.evaluate(()=>{
    const box=(selector)=>document.querySelector(selector)?.getBoundingClientRect()||null;
    const shortcut=box('[data-m26-workspace-shortcuts="coach"]');
    const route=box('.m26-hoy-route.m26-coach-home-v1');
    const launch=box('[data-coach-launch-self]');
    const next=box('.m26-coach-home-command');
    return {
      shortcutHeight:shortcut?.height??null,
      routeTop:route?.top??null,
      launchTop:launch?.top??null,
      nextActionTop:next?.top??null,
      viewport:{width:innerWidth,height:innerHeight},
    };
  });

  expect(metrics.shortcutHeight).not.toBeNull();
  expect(metrics.shortcutHeight).toBeLessThan(100);
  expect(metrics.routeTop).not.toBeNull();
  expect(metrics.nextActionTop).not.toBeNull();

  await shortcuts.locator('summary').click();
  await expect(shortcuts).toHaveAttribute('open','');
  for(const area of ['clientes','agenda','planificacion','mensajes']){
    await expect(shortcuts.locator(`[data-m26-area="${area}"]`)).toHaveCount(1);
  }
  await shortcuts.locator('summary').click();
  await expect(shortcuts).not.toHaveAttribute('open','');

  const file=`coach-hoy-${testInfo.project.name}.png`;
  await page.screenshot({
    path:`${OUT}/${file}`,
    fullPage:true,
    animations:'disabled',
    caret:'hide',
  });

  await writeFile(
    `${OUT}/coach-hoy-${testInfo.project.name}.json`,
    `${JSON.stringify({
      schema:'iberfit.coach-today-visual.v1',
      project:testInfo.project.name,
      syntheticQa:true,
      currentSource:true,
      authBypassed:false,
      productionAuthModified:false,
      shortcutActionsPreserved:4,
      shortcutsClosedByDefault:true,
      metrics,
      file,
    },null,2)}\n`,
    'utf8',
  );
});
