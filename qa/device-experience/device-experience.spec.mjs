import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const OUT='recovery/device-experience';

const CURRENT_SOURCE_STYLES=Object.freeze([
  '/src/m26/design/tokens.css',
  '/src/m26/design/typography.css',
  '/src/m26/design/icons.css',
  '/src/m26/design/primitives.css',
  '/src/m26/design/role-surfaces.css',
  '/src/m26/design/premium-ux.css',
  '/src/m26/design/signature-ux-v2.css',
  '/src/m26/design/dark-iberfit-v2.css',
  '/src/m26/design/iberfit-premium-v3.css',
  '/src/m26/rc39/rc39.css',
  '/src/m26/ui/client-bottom-nav.css',
]);


const TASKS=Object.freeze([
  {id:'client-hoy',role:'client',url:'/qa/rc13_visual_cases/client_hoy_mobile.html',evidence:'synthetic-current-source-ui'},
  {id:'client-progreso',role:'client',url:'/qa/rc13_visual_cases/client_progreso_tablet.html',evidence:'synthetic-current-source-ui'},
  {id:'client-session-live',role:'client',url:'/qa/rc13_visual_cases/execution_mobile.html',evidence:'synthetic-current-source-ui'},
  {id:'client-feedback',role:'client',url:'/qa/rc13_visual_cases/feedback_mobile.html',evidence:'synthetic-current-source-ui'},
  {id:'coach-hoy',role:'coach',url:'/qa/rc13_visual_cases/coach_hoy_desktop.html',evidence:'synthetic-post-assurance-ui'},
  {id:'coach-clientes',role:'coach',url:'/qa/rc13_visual_cases/coach_clientes_desktop.html',evidence:'synthetic-post-assurance-ui'},
  {id:'coach-expediente',role:'coach',url:'/qa/rc13_visual_cases/coach_expediente_tablet.html',evidence:'synthetic-post-assurance-ui'},
  {id:'coach-iri',role:'coach',url:'/qa/rc13_visual_cases/coach_iri_tablet.html',evidence:'synthetic-post-assurance-ui'},
  {id:'coach-planificacion',role:'coach',url:'/qa/rc13_visual_cases/coach_planificacion_desktop.html',evidence:'synthetic-post-assurance-ui'},
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

async function applyCurrentSourceStyles(page){
  for(const url of CURRENT_SOURCE_STYLES){
    await page.addStyleTag({url});
  }
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
    const clientBottomNav=document.querySelector('.m26-client-bottom-nav');
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
      clientBottomNavVisible:visible(clientBottomNav),
      mainWidth:mainBox?.width||0,
    };
  });
}

async function lightSurfaceViolations(page){
  return page.evaluate(()=>{
    const parse=(value)=>{
      const match=String(value||'').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\s*\)/u);
      if(!match)return null;
      return {r:Number(match[1]),g:Number(match[2]),b:Number(match[3]),a:match[4]===undefined?1:Number(match[4])};
    };
    const main=document.querySelector('.m26-main,.m26-admin-route,.m26-workspace');
    if(!main)return [];
    return [...main.querySelectorAll('*')]
      .filter((element)=>!['IMG','SVG','PATH','CANVAS','VIDEO','SOURCE'].includes(element.tagName))
      .map((element)=>{
        const style=getComputedStyle(element);
        const box=element.getBoundingClientRect();
        const color=parse(style.backgroundColor);
        return {element,style,box,color};
      })
      .filter(({style,box,color})=>{
        if(!color||color.a<.45)return false;
        if(style.display==='none'||style.visibility==='hidden'||box.width<=0||box.height<=0)return false;
        if(box.width*box.height<6000)return false;
        if(style.backgroundImage&&style.backgroundImage!=='none')return false;
        return color.r>=230&&color.g>=230&&color.b>=225;
      })
      .slice(0,12)
      .map(({element,box,color})=>({
        tag:element.tagName.toLowerCase(),
        className:String(element.className||'').slice(0,180),
        id:String(element.id||''),
        text:String(element.textContent||'').trim().replace(/\s+/gu,' ').slice(0,120),
        width:Math.round(box.width),
        height:Math.round(box.height),
        background:`rgba(${color.r},${color.g},${color.b},${color.a})`,
      }));
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
    const details=page.locator('[data-admin-user-card][data-user-id="22222222-2222-4222-8222-222222222222"]').locator('details.m26-admin-user-management');
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
  await form.locator('input[name="phone"]').fill('+56 9 5555 0102');
  await form.locator('select[name="sexForNorms"]').selectOption('female');
  await form.locator('select[name="preferredContactChannel"]').selectOption('email');
  const next=form.locator('[data-client-step="1"] [data-client-wizard-next]');
  await expect(next).toBeVisible();
  await next.click();
  await expect(form.locator('[data-client-step="2"]')).toBeVisible();
}


async function assertSettingsReachable(page,task,viewport){
  if(task.role==='client'){
    const clientMore=page.locator('.m26-client-bottom-nav-more > summary').first();
    if(await clientMore.count()){
      await expect(clientMore,'Client Más must expose account destinations').toBeVisible();
      await clientMore.click();
      await expect(page.locator('.m26-client-bottom-nav-menu [data-m26-area="ajustes"]').first(),'Client Settings must be reachable from Más').toBeVisible();
      await clientMore.click();
      return;
    }
  }

  if(viewport.width>=720){
    const trigger=page.locator('.m26-sidebar-footer .m26-settings-menu > summary').first();
    await expect(trigger,task.id+' tablet/desktop must expose Settings in the account rail').toBeVisible();
    await trigger.click();
    await expect(page.locator('.m26-sidebar-footer .m26-settings-popover').first()).toBeVisible();
    await expect(page.locator('.m26-sidebar-footer [data-m26-area="ajustes"], .m26-sidebar-footer [data-m26-area="admin-configuracion"]').first()).toBeVisible();
    await trigger.click();
    return;
  }

  const more=page.locator('.m26-mobile-more > summary').first();
  await expect(more,task.id+' mobile must expose Más').toBeVisible();
  await more.click();
  await expect(page.locator('.m26-mobile-more-menu [data-m26-area="ajustes"], .m26-mobile-more-menu [data-m26-area="admin-configuracion"]').first()).toBeVisible();
  await more.click();
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
    else await applyCurrentSourceStyles(page);

    const shell=page.locator('.m26-shell').first();
    await expect(shell,task.id+' must render the canonical shell').toBeVisible();
    await settle(page);

    const metrics=await layoutMetrics(page);
    expect(metrics.horizontalOverflow,task.id+' must not overflow horizontally').toBe(false);

    const lightSurfaces=await lightSurfaceViolations(page);
    expect(
      lightSurfaces,
      task.id+' contains residual large light surfaces incompatible with Premium V3: '+JSON.stringify(lightSurfaces),
    ).toEqual([]);
    expect(metrics.shellVisible).toBe(true);
    expect(metrics.mainWidth).toBeGreaterThan(viewport.width*0.55);

    if(viewport.width<=719){
      expect(metrics.sidebarVisible,task.id+' phone navigation must replace sidebar').toBe(false);
      expect(metrics.mobileNavVisible||metrics.clientBottomNavVisible,task.id+' must expose phone navigation').toBe(true);
    }else if(viewport.width<=1179&&['coach','admin'].includes(task.role)){
      expect(metrics.sidebarVisible,task.id+' tablet account rail must remain visible').toBe(true);
      expect(metrics.mobileNavVisible,task.id+' tablet must avoid duplicate shell navigation').toBe(false);
    }else if(viewport.width<=900){
      expect(metrics.sidebarVisible,task.id+' compact Client navigation must replace sidebar').toBe(false);
      expect(metrics.clientBottomNavVisible||metrics.mobileNavVisible,task.id+' Client must expose compact navigation').toBe(true);
    }else{
      expect(metrics.sidebarVisible,task.id+' desktop/tablet-landscape must expose sidebar').toBe(true);
    }

    await assertSettingsReachable(page,task,viewport);
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
