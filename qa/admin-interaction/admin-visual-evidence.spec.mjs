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
  // SIGNATURE B12 shared warm ivory: preserve matte Admin workspace and
  // assert the exact approved token rather than silently accepting any color.
  expect(vision.workspaceInk.toLowerCase()).toBe('#f7f0e3');
  // M41's finished surface is deliberately MATTE. A gradient here is a
  // visual regression, not evidence of quality. Assert actual rendered paint.
  expect(vision.workspaceBackground).toBe('none');
  // B12 warmer forest workspace remains MATTE, never a gradient or white panel.
  expect(vision.workspaceBackgroundColor).toBe('rgb(13, 25, 19)');
  expect(vision.navScheme).toContain('dark');
  expect(vision.navBackground).toBe('none');
  expect(vision.navBackgroundColor).toMatch(/rgba?\(\s*(?:13,\s*30,\s*23|11,\s*19,\s*16)/u);
  expect(vision.surfaceBackgroundImage).toBe('none');
  expect(vision.surfaceBackground).toMatch(/^rgb\(\s*(?:28,\s*48,\s*38|22,\s*40,\s*32|19,\s*34,\s*28|16,\s*29,\s*24)\s*\)$/u);
  expect(vision.workspaceBackgroundColor+' '+vision.navBackgroundColor+' '+vision.surfaceBackground)
    .not.toMatch(/rgb\(255,\s*255,\s*255\)|rgb\(243,\s*238,\s*227\)/u);

  const iconBox=await navIcon.boundingBox();
  const routeBox=await route.boundingBox();
  expect(routeBox).not.toBeNull();
  expect(iconBox).not.toBeNull();
  expect(iconBox.width).toBeLessThanOrEqual(24);
  expect(iconBox.height).toBeLessThanOrEqual(24);

  const routeRatio=viewport.width>900?0.45:0.80;
  expect(routeBox.width).toBeGreaterThan(viewport.width*routeRatio);

  // Actual browser layout checks, not only source-level CSS contracts.
  // These run on 390px and 320px with the real Admin shell and its routes.
  if(viewport.width<=390){
    const metrics=await shell.locator('.m26-mobile-nav').evaluate((nav)=>{
      const expected=['admin-inicio','admin-usuarios','admin-agenda','admin-operaciones'];
      const links=[...nav.querySelectorAll(':scope > .m26-nav-item[data-m26-area]')];
      const more=nav.querySelector(':scope > details.m26-mobile-more > summary');
      const moreRect=more?.getBoundingClientRect();
      const moreHit=moreRect?document.elementFromPoint(moreRect.left+moreRect.width/2,moreRect.top+moreRect.height/2):null;
      return {
        expected,
        navScrollWidth:nav.scrollWidth,
        navClientWidth:nav.clientWidth,
        more:{present:!!more,width:moreRect?.width||0,height:moreRect?.height||0,left:moreRect?.left||0,right:moreRect?.right||0,
          hit:!!(more&&(more===moreHit||more.contains(moreHit)))},
        links:links.map((item)=>{
        const caption=[...item.querySelectorAll(':scope > span')]
          .find((candidate)=>getComputedStyle(candidate).display!=='none');
        const style=caption?getComputedStyle(caption):null;
        const rect=item.getBoundingClientRect();
        const centerHit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
        return {
          area:item.getAttribute('data-m26-area'),
          name:item.getAttribute('aria-label')||'',
          caption:caption?.textContent?.trim()||'',
          whitespace:style?.whiteSpace||'',
          overflow:style?.overflowX||'',
          ellipsis:style?.textOverflow||'',
          textScrollWidth:caption?.scrollWidth||0,
          textClientWidth:caption?.clientWidth||0,
          width:rect.width,height:rect.height,left:rect.left,right:rect.right,
          hit:!!(centerHit&&(item===centerHit||item.contains(centerHit))),
        };
      })};
    });
    expect(metrics.navScrollWidth,`Admin dock scrolls horizontally at ${viewport.width}px`).toBeLessThanOrEqual(metrics.navClientWidth+1);
    expect(metrics.more.present,'Admin Más must remain in the dock').toBe(true);
    expect(metrics.more.height,'Más touch target too short').toBeGreaterThanOrEqual(44);
    expect(metrics.more.left,'Más escapes left viewport').toBeGreaterThanOrEqual(-1);
    expect(metrics.more.right,'Más escapes right viewport').toBeLessThanOrEqual(viewport.width+1);
    expect(metrics.more.hit,'Más blocked by overlay').toBe(true);
    // Touch the actual fifth slot; it must open and close without trapping the UI.
    const moreDetails=shell.locator('.m26-mobile-nav > details.m26-mobile-more');
    const moreSummary=moreDetails.locator(':scope > summary');
    await expect(moreSummary).toHaveAttribute('aria-expanded','false');
    await moreSummary.tap();
    await expect(moreDetails).toHaveAttribute('open','');
    await expect(moreSummary).toHaveAttribute('aria-expanded','true');
    await expect(moreDetails.locator('.m26-mobile-more-menu')).toBeVisible();
    await moreSummary.tap();
    await expect(moreDetails).not.toHaveAttribute('open','');
    await expect(moreSummary).toHaveAttribute('aria-expanded','false');
    await expect(shell.locator('#m26-main')).not.toHaveAttribute('inert','');
    expect(metrics.links).toHaveLength(4);
    expect(metrics.links.map((item)=>item.area)).toEqual(metrics.expected);
    for(const item of metrics.links){
      expect(item.name,`Full accessible name missing: ${item.area}`).toBeTruthy();
      expect(item.caption,`Compact caption missing: ${item.area}`).toBeTruthy();
      expect([...item.caption].length,`Dock caption too long: ${item.area}`).toBeLessThanOrEqual(8);
      expect(item.whitespace,`Dock caption wraps: ${item.area}`).toBe('nowrap');
      expect(item.overflow,`Dock caption spills: ${item.area}`).toBe('hidden');
      expect(item.ellipsis,`Dock caption cannot fall back: ${item.area}`).toBe('ellipsis');
      expect(item.textScrollWidth,`Dock caption is visibly truncated at ${viewport.width}px: ${item.area}`).toBeLessThanOrEqual(item.textClientWidth+1);
      expect(item.height,`Admin touch target too short: ${item.area}`).toBeGreaterThanOrEqual(44);
      expect(item.left,`Admin nav escapes left viewport: ${item.area}`).toBeGreaterThanOrEqual(-1);
      expect(item.right,`Admin nav escapes right viewport: ${item.area}`).toBeLessThanOrEqual(viewport.width+1);
      expect(item.hit,`Admin nav blocked by overlay: ${item.area}`).toBe(true);
    }
  }

  if(viewport.width<=719){
    const launcher=shell.locator('[data-coach-command-open]').first();
    if(await launcher.isVisible().catch(()=>false)){
      const launcherMetrics=await launcher.evaluate((node)=>{
        const span=node.querySelector('span');
        const kbd=node.querySelector('kbd');
        const pseudo=span?getComputedStyle(span,'::after'):null;
        return {
          visualLabel:String(pseudo?.content||'').replace(/^["']|["']$/gu,''),
          kbdDisplay:kbd?getComputedStyle(kbd).display:'',
          scrollWidth:node.scrollWidth,
          clientWidth:node.clientWidth,
        };
      });
      expect(launcherMetrics.visualLabel).toBe('Buscar');
      expect(launcherMetrics.kbdDisplay).toBe('none');
      expect(launcherMetrics.scrollWidth).toBeLessThanOrEqual(launcherMetrics.clientWidth+1);
    }
  }

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
  const identity=coach.locator('details[data-admin-user-disclosure]');
  await expect(identity).not.toHaveAttribute('open','');
  await identity.locator(':scope > summary').click();
  await expect(identity).toHaveAttribute('open','');
  const details=identity.locator('details.m26-admin-user-management');
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
  await form.locator('[data-client-optional-contact] summary').click();
  await expect(form.locator('[data-client-optional-contact]')).toHaveJSProperty('open',true);
  await form.locator('input[name="phone"]').fill('+56 9 5555 1212');
  await form.locator('input[name="birthDate"]').fill('1988-04-16');
  await form.locator('select[name="sexForNorms"]').selectOption('female');
  await form.locator('[data-client-step="1"] [data-client-wizard-next]').click();
  await expect(form.locator('[data-client-step="2"]')).toBeVisible();
  evidence.captures.push(await shot(page,project+'-admin-client-create-step2'));

  await writeFile(OUT+'/'+project+'.json',JSON.stringify(evidence,null,2)+'\n','utf8');
});