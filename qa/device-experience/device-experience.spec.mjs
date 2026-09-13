import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const OUT='recovery/device-experience';

const TASKS=Object.freeze([
  {id:'client-hoy',role:'client',url:'/qa/rc13_visual_cases/client_hoy_mobile.html',evidence:'synthetic-current-source-ui'},
  {id:'client-progreso',role:'client',url:'/qa/rc13_visual_cases/client_progreso_tablet.html',evidence:'synthetic-current-source-ui'},
  {id:'client-session-live',role:'client',url:'/qa/rc13_visual_cases/execution_mobile.html',evidence:'synthetic-current-source-ui'},
  {id:'client-feedback',role:'client',url:'/qa/rc13_visual_cases/feedback_mobile.html',evidence:'synthetic-current-source-ui'},
  {id:'coach-hoy',role:'coach',url:'/qa/rc13_visual_cases/coach_hoy_desktop.html',evidence:'synthetic-post-assurance-ui'},
  {id:'coach-clientes',role:'coach',url:'/qa/rc13_visual_cases/coach_clientes_desktop.html',evidence:'synthetic-post-assurance-ui'},
  {id:'coach-expediente',role:'coach',url:'/qa/rc13_visual_cases/coach_expediente_tablet.html',evidence:'synthetic-post-assurance-ui'},
  {id:'coach-programar',role:'coach',url:'/qa/rc13_visual_cases/builder_desktop.html',evidence:'synthetic-post-assurance-ui'},
  {id:'admin-users',role:'admin',url:'/qa/admin-interaction/fixture.html?route=users',evidence:'synthetic-authorized-ui'},
  {id:'admin-client-create',role:'admin',url:'/qa/admin-interaction/fixture.html?route=clients',evidence:'synthetic-authorized-ui'},
]);

function safeSlug(value){
  return String(value||'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu,'-')
    .replace(/^-+|-+$/gu,'')
    .slice(0,90)||'unknown';
}

async function settle(page){
  await page.evaluate(async()=>{
    await document.fonts?.ready;
    document.documentElement.setAttribute('data-device-experience-gate','v1');
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(100);
}

async function visibleActionMetrics(page){
  return page.evaluate(()=>{
    const selector='button:enabled,a[href],select:enabled,summary,[role="button"]:not([aria-disabled="true"])';
    return [...document.querySelectorAll(selector)]
      .filter((element)=>{
        const style=getComputedStyle(element);
        const box=element.getBoundingClientRect();
        return style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0;
      })
      .slice(0,80)
      .map((element)=>{
        const box=element.getBoundingClientRect();
        return {
          tag:element.tagName.toLowerCase(),
          width:Math.round(box.width*10)/10,
          height:Math.round(box.height*10)/10,
          text:String(element.textContent||element.getAttribute('aria-label')||'').trim().slice(0,80),
        };
      });
  });
}

async function layoutMetrics(page){
  return page.evaluate(()=>{
    const root=document.documentElement;
    const body=document.body;
    const shell=document.querySelector('.m26-shell');
    const main=document.querySelector('.m26-main,.m26-workspace');
    const sidebar=document.querySelector('.m26-sidebar');
    const mobileNav=document.querySelector('.m26-mobile-nav');
    const visible=(element)=>Boolean(element&&getComputedStyle(element).display!=='none'&&element.getBoundingClientRect().width>0);
    const mainBox=main?.getBoundingClientRect?.()||null;
    return {
      viewportWidth:innerWidth,
      viewportHeight:innerHeight,
      documentWidth:Math.max(root.scrollWidth,body?.scrollWidth||0),
      horizontalOverflow:Math.max(root.scrollWidth,body?.scrollWidth||0)>innerWidth+2,
      shellVisible:visible(shell),
      sidebarVisible:visible(sidebar),
      mobileNavVisible:visible(mobileNav),
      mainWidth:mainBox?.width||0,
    };
  });
}

async function assertFocusPath(page){
  const candidate=page.locator(
    '.m26-main button:visible:enabled, .m26-main select:visible:enabled, .m26-admin-route button:visible:enabled, .m26-admin-route select:visible:enabled, .m26-admin-route summary:visible, .m26-mobile-nav button:visible:enabled, .m26-sidebar button:visible:enabled'
  ).first();
  await expect(candidate,'Each task surface must expose a focusable action').toBeVisible();
  await candidate.focus();
  await expect(candidate).toBeFocused();
}

async function exerciseAdminTask(page,task){
  await expect.poll(
    ()=>page.evaluate(()=>globalThis.__IBERFIT_ADMIN_INTERACTION_QA__?.mounted===true),
    {timeout:10_000},
  ).toBe(true);

  if(task.id==='admin-users'){
    const details=page.locator('[data-admin-user-card]').first().locator('details.m26-admin-user-management');
    await expect(details).toBeVisible();
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open','');
    await expect(details.locator('[data-admin-form="user-delete"]')).toBeVisible();
    return;
  }

  const form=page.locator('[data-admin-form="client-create"]');
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill('Cliente QA Device Gate');
  await form.locator('input[name="email"]').fill('device-gate@example.invalid');
  const next=form.locator('[data-client-step="1"] [data-client-wizard-next]');
  await expect(next).toBeVisible();
  await next.click();
  await expect(form.locator('[data-client-step="2"]')).toBeVisible();
}

test.beforeAll(async()=>{await mkdir(OUT,{recursive:true});});

test('Device Experience Gate validates representative tasks by role and device',async({page},testInfo)=>{
  const project=testInfo.project.name;
  const viewport=page.viewportSize();
  expect(viewport).not.toBeNull();
  const touch=/tablet|mobile/iu.test(project);
  const evidence=[];

  for(const task of TASKS){
    const response=await page.goto(task.url,{waitUntil:'domcontentloaded',timeout:15_000});
    expect(response?.ok(),task.id+' must load').toBeTruthy();

    if(task.role==='admin')await exerciseAdminTask(page,task);

    const shell=page.locator('.m26-shell').first();
    await expect(shell,task.id+' must render the canonical shell').toBeVisible();
    await settle(page);

    const metrics=await layoutMetrics(page);
    expect(metrics.horizontalOverflow,task.id+' must not overflow horizontally').toBe(false);
    expect(metrics.shellVisible).toBe(true);
    expect(metrics.mainWidth).toBeGreaterThan(viewport.width*0.55);

    if(viewport.width<=900){
      expect(metrics.sidebarVisible,task.id+' mobile navigation must replace sidebar').toBe(false);
      expect(metrics.mobileNavVisible,task.id+' must expose mobile navigation').toBe(true);
    }else{
      expect(metrics.sidebarVisible,task.id+' desktop/tablet-landscape must expose sidebar').toBe(true);
    }

    await assertFocusPath(page);

    const actions=await visibleActionMetrics(page);
    expect(actions.length,task.id+' must expose visible actions').toBeGreaterThan(0);
    if(touch){
      const materiallySmall=actions.filter((item)=>item.width<34||item.height<34);
      expect(
        materiallySmall,
        task.id+' touch profile contains materially undersized actions: '+JSON.stringify(materiallySmall.slice(0,6)),
      ).toEqual([]);
    }

    const screenshot=OUT+'/'+safeSlug(project)+'-'+task.id+'.png';
    await page.screenshot({path:screenshot,fullPage:true,animations:'disabled',caret:'hide'});

    evidence.push({
      task:task.id,
      role:task.role,
      evidence:task.evidence,
      viewport,
      touch,
      metrics,
      visibleActions:actions.length,
      screenshot,
      authCertified:false,
    });
  }

  const report={
    schema:'iberfit.device-experience-gate.v1',
    project,
    generatedAt:new Date().toISOString(),
    taskDifferentiation:true,
    syntheticPostAssuranceCoachUi:true,
    syntheticAuthorizedAdminUi:true,
    realAuthEvidenceProvidedBySiblingGate:'playwright.authenticated-visual.config.mjs',
    pwaEvidenceProvidedBySiblingGate:'playwright.p0-pwa-upgrade.config.mjs',
    captures:evidence,
  };
  await writeFile(OUT+'/'+safeSlug(project)+'.json',JSON.stringify(report,null,2)+'\n','utf8');
});
