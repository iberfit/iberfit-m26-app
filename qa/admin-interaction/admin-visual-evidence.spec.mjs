import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const OUT='recovery/daily-use-visual';

async function settle(page){
  await page.evaluate(async()=>{
    await document.fonts?.ready;
    document.documentElement.setAttribute('data-daily-use-visual','true');
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(120);
}

async function shot(page,name){
  await settle(page);
  const path=OUT+'/'+name+'.png';
  await page.screenshot({path,fullPage:true,animations:'disabled',caret:'hide'});
  return path;
}

async function expectCanonicalAdminShell(page,{form=null}={}){
  const shell=page.locator('.m26-shell.m26-admin-shell');
  const route=shell.locator('.m26-workspace .m26-main .m26-admin-route').first();
  const viewport=page.viewportSize();
  expect(viewport).not.toBeNull();
  const navIcon=viewport.width>900
    ?shell.locator('.m26-sidebar .m26-nav-icon').first()
    :shell.locator('.m26-mobile-nav .m26-nav-icon').first();
  await expect(shell).toBeVisible();
  await expect(route).toBeVisible();
  await expect(navIcon).toBeVisible();

  const vision=await page.evaluate(()=>{
    const shell=document.querySelector('.m26-shell');
    const workspace=shell?.querySelector('.m26-workspace');
    const sidebar=shell?.querySelector('.m26-sidebar');
    const mobileNav=shell?.querySelector('.m26-mobile-nav');
    const panel=shell?.querySelector('.m26-admin-panel,.m26-admin-stat,.m26-admin-table');
    const ws=workspace?getComputedStyle(workspace):null;
    const nav=sidebar&&getComputedStyle(sidebar).display!=='none'?getComputedStyle(sidebar):(mobileNav?getComputedStyle(mobileNav):null);
    const surface=panel?getComputedStyle(panel):null;
    return {
      workspaceScheme:ws?.colorScheme||'',
      workspaceInk:ws?.getPropertyValue('--iberfit-color-text-primary').trim()||'',
      workspaceBackground:ws?.backgroundImage||'',
      workspaceBackgroundColor:ws?.backgroundColor||'',
      navScheme:nav?.colorScheme||'',
      navBackground:nav?.backgroundImage||'',
      navBackgroundColor:nav?.backgroundColor||'',
      surfaceBackground:surface?.backgroundColor||'',
      surfaceBackgroundImage:surface?.backgroundImage||'',
    };
  });
  expect(vision.workspaceScheme).toContain('dark');
  expect(vision.workspaceInk.toLowerCase()).toBe('#f5f5f0');
  expect(vision.workspaceBackground).toContain('linear-gradient');
  expect(vision.workspaceBackgroundColor).toBe('rgb(11, 19, 16)');
  expect(vision.navScheme).toContain('dark');
  expect(vision.navBackground+' '+vision.navBackgroundColor).toMatch(/linear-gradient|rgba?\(11,\s*19,\s*16/u);
  expect(vision.navBackground+' '+vision.navBackgroundColor).not.toMatch(/rgb\(255,\s*255,\s*255\)|rgb\(243,\s*238,\s*227\)/u);
  expect(vision.surfaceBackgroundImage).toContain('linear-gradient');
  expect(vision.surfaceBackgroundImage).not.toMatch(/rgb\(255,\s*255,\s*255\)|rgb\(243,\s*238,\s*227\)/u);

  const iconBox=await navIcon.boundingBox();
  const routeBox=await route.boundingBox();
  expect(routeBox).not.toBeNull();
  expect(iconBox).not.toBeNull();
  expect(iconBox.width).toBeLessThanOrEqual(24);
  expect(iconBox.height).toBeLessThanOrEqual(24);

  const routeRatio=viewport.width>900?0.45:0.80;
  expect(routeBox.width).toBeGreaterThan(viewport.width*routeRatio);

  if(form){
    const formBox=await form.boundingBox();
    expect(formBox).not.toBeNull();
    const formRatio=viewport.width>900?0.38:0.72;
    expect(formBox.width).toBeGreaterThan(viewport.width*formRatio);
  }
}

test.beforeAll(async()=>{await mkdir(OUT,{recursive:true});});

test('Admin users and client-create surfaces produce current visual evidence',async({page},testInfo)=>{
  const project=testInfo.project.name;
  const evidence={schema:'iberfit.daily-use-admin-visual.v2',project,captures:[]};

  await page.goto('/qa/admin-interaction/fixture.html?route=users',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ADMIN_INTERACTION_QA__?.mounted===true)).toBe(true);
  await expectCanonicalAdminShell(page);
  await expect(page.locator('[data-admin-user-card]').first()).toBeVisible();
  evidence.captures.push(await shot(page,project+'-admin-users'));

  const coach=page.locator('[data-admin-user-card][data-user-id="22222222-2222-4222-8222-222222222222"]');
  const details=coach.locator('details.m26-admin-user-management');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open','');
  await expect(details.locator('[data-admin-form="user-delete"]')).toBeVisible();
  evidence.captures.push(await shot(page,project+'-admin-user-management'));

  await page.goto('/qa/admin-interaction/fixture.html?route=clients',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_ADMIN_INTERACTION_QA__?.mounted===true)).toBe(true);
  const form=page.locator('[data-admin-form="client-create"]');
  await expect(form).toBeVisible();
  await expectCanonicalAdminShell(page,{form});
  evidence.captures.push(await shot(page,project+'-admin-client-create-step1'));

  await form.locator('input[name="name"]').fill('Cliente QA Visual');
  await form.locator('input[name="email"]').fill('visual@example.com');
  await form.locator('input[name="phone"]').fill('+56 9 5555 1212');
  await form.locator('[data-client-step="1"] [data-client-wizard-next]').click();
  await expect(form.locator('[data-client-step="2"]')).toBeVisible();
  evidence.captures.push(await shot(page,project+'-admin-client-create-step2'));

  await writeFile(OUT+'/'+project+'.json',JSON.stringify(evidence,null,2)+'\n','utf8');
});