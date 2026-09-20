import {mkdir} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const OUT_DIR='recovery/device-experience/role-genie-onboarding';
const ROLES=['coach','admin'];

function slug(value){
  return String(value||'unknown').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,80)||'unknown';
}

async function expectViewportSafe(page,dialog){
  const metrics=await dialog.evaluate((node)=>{
    const rect=node.getBoundingClientRect();
    return {
      left:rect.left,
      top:rect.top,
      right:rect.right,
      bottom:rect.bottom,
      width:rect.width,
      height:rect.height,
      viewportWidth:innerWidth,
      viewportHeight:innerHeight,
      scrollWidth:document.documentElement.scrollWidth,
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.top).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth+1);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight+1);
  expect(metrics.width).toBeGreaterThan(220);
  expect(metrics.height).toBeGreaterThan(120);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth+1);
}

async function expectTouchControls(dialog){
  const controls=await dialog.locator('button:visible').evaluateAll((nodes)=>nodes.map((node)=>{
    const rect=node.getBoundingClientRect();
    return {width:rect.width,height:rect.height,label:String(node.textContent||node.getAttribute('aria-label')||'').trim()};
  }));
  expect(controls.length).toBeGreaterThanOrEqual(2);
  for(const control of controls){
    expect(control.width,`${control.label}: touch width`).toBeGreaterThanOrEqual(44);
    expect(control.height,`${control.label}: touch height`).toBeGreaterThanOrEqual(44);
  }
}

for(const role of ROLES){
  test(`${role} Genie-led onboarding completes, reopens and remains device-safe`,async({page},testInfo)=>{
    await mkdir(OUT_DIR,{recursive:true});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(`/qa/rc64/role-guided-onboarding.fixture.html?role=${role}`,{waitUntil:'domcontentloaded'});

    await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ROLE_GENIE_QA__?.mounted===true)).toBe(true);
    const fixture=await page.evaluate(()=>({
      role:globalThis.__IBERFIT_ROLE_GENIE_QA__?.role,
      trackLength:globalThis.__IBERFIT_ROLE_GENIE_QA__?.trackLength,
      scopeKey:globalThis.__IBERFIT_ROLE_GENIE_QA__?.scopeKey,
    }));
    expect(fixture.role).toBe(role);
    expect(fixture.trackLength).toBe(7);
    expect(fixture.scopeKey).toMatch(new RegExp(`^iberfit\\.m26\\.guided-onboarding\\.v1:${role}:[a-f0-9]{8}$`,'u'));

    const dialog=page.locator('[data-m26-guided-tour]');
    await expect(dialog).toBeVisible({timeout:5_000});
    await expect(dialog).toHaveClass(/\bis-genie-led\b/u);
    await expect(dialog).toHaveAttribute('data-m26-guided-tour-role',role);
    await expect(dialog.locator('[data-m26-guided-tour-genie]')).toHaveCount(1);
    await expect(dialog.locator('[data-m26-client-genie]')).toHaveCount(1);
    await expect(dialog.locator('progress')).toHaveCount(0);
    await expect(page.locator('[data-m26-guided-tour-target-active="true"]')).toHaveCount(1);
    await expect(dialog.locator('[data-m26-guided-tour-next]')).toBeFocused({timeout:5_000});
    await expectViewportSafe(page,dialog);
    await expectTouchControls(dialog);

    const genieAnimations=await dialog.locator('[data-m26-guided-tour-genie] *').evaluateAll((nodes)=>[...new Set(nodes.map((node)=>getComputedStyle(node).animationName))]);
    expect(genieAnimations.every((name)=>name==='none')).toBe(true);

    await page.screenshot({
      path:`${OUT_DIR}/${role}-${slug(testInfo.project.name)}-first.png`,
      fullPage:true,
      animations:'disabled',
      caret:'hide',
    });

    for(let index=0;index<fixture.trackLength;index+=1){
      const state=await page.evaluate(()=>globalThis.__IBERFIT_ROLE_GENIE_QA__?.state?.());
      expect(state?.status).toBe('in-progress');
      expect(state?.activeStepId).toBeTruthy();
      await expect(page.locator('[data-m26-guided-tour-target-active="true"]')).toHaveCount(1);
      await expectViewportSafe(page,dialog);

      if(index===fixture.trackLength-1){
        await page.screenshot({
          path:`${OUT_DIR}/${role}-${slug(testInfo.project.name)}-final.png`,
          fullPage:true,
          animations:'disabled',
          caret:'hide',
        });
      }

      await dialog.locator('[data-m26-guided-tour-next]').click();
      if(index<fixture.trackLength-1){
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('[data-m26-guided-tour-next]')).toBeFocused();
      }
    }

    await expect(dialog).toHaveCount(0,{timeout:5_000});
    await expect(page.locator('[data-m26-guided-tour-target-active="true"]')).toHaveCount(0);
    const completed=await page.evaluate(()=>globalThis.__IBERFIT_ROLE_GENIE_QA__?.state?.());
    expect(completed?.status).toBe('completed');
    expect(completed?.onboardingCompletedVersion).toBe(2);
    expect(completed?.activeStepId).toBeNull();

    const launcher=page.locator('[data-progressive-onboarding-launcher]');
    await expect(launcher).toHaveAttribute('data-m26-guided-tour-open','');
    await launcher.click();
    await expect(dialog).toBeVisible({timeout:5_000});
    await expect(dialog).toHaveAttribute('data-m26-guided-tour-role',role);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0,{timeout:5_000});
    await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ROLE_GENIE_QA__?.openChanges?.().includes(false)===true)).toBe(true);

    const paused=await page.evaluate(()=>({
      state:globalThis.__IBERFIT_ROLE_GENIE_QA__?.state?.(),
      openChanges:globalThis.__IBERFIT_ROLE_GENIE_QA__?.openChanges?.(),
    }));
    expect(paused.state?.status).toBe('in-progress');
    expect(paused.openChanges).toContain(true);
    expect(paused.openChanges).toContain(false);
  });
}
