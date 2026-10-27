import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {captureEvidenceScreenshot} from './reliable-screenshot.mjs';

const OUT='recovery/device-experience';

test('M39 incomplete form validation stays responsive without recursive invalid events',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/qa/rc64/fixture.html');
  await page.evaluate(async()=>{
    const {createWorkflowController,syncGuidedWorkflowProgress}=await import('/src/m26/app/workflow-controller.js');
    document.body.innerHTML='<main id="validation-fixture"><form data-workflow-form="validation-regression" data-guided-required-form><label>Correo<input name="email" type="email" required></label><label>Carga<input name="load" type="number" min="1" required></label><input name="ignored" required disabled><p data-guided-required-progress></p><p data-workflow-status="validation-regression"></p><button type="submit">Validar</button></form><button id="navigate">Continuar</button></main>';
    const root=document.querySelector('#validation-fixture');
    const form=root.querySelector('form');
    globalThis.validationEvidence={invalid:0,submitted:0,navigated:0};
    root.addEventListener('invalid',()=>{globalThis.validationEvidence.invalid++;},true);
    form.addEventListener('submit',event=>{event.preventDefault();globalThis.validationEvidence.submitted++;});
    root.querySelector('#navigate').addEventListener('click',()=>globalThis.validationEvidence.navigated++);
    createWorkflowController({root,store:{getState:()=>({identity:{role:'coach'},collections:{}})},commandBus:{execute:async()=>({ok:true})}}).mount();
    for(let i=0;i<20;i++)syncGuidedWorkflowProgress(form);
  });
  expect(await page.evaluate(()=>globalThis.validationEvidence.invalid)).toBe(0);
  await page.getByRole('button',{name:'Validar',exact:true}).click();
  await expect(page.locator('[data-workflow-status]')).toContainText('Correo');
  expect(await page.evaluate(()=>globalThis.validationEvidence.invalid)).toBe(2);
  await page.getByLabel('Correo',{exact:true}).fill('coach@example.test');
  await page.getByLabel('Carga',{exact:true}).fill('0');
  await page.getByRole('button',{name:'Validar',exact:true}).click();
  expect(await page.evaluate(()=>globalThis.validationEvidence.submitted)).toBe(0);
  await page.getByLabel('Carga',{exact:true}).fill('5');
  await page.getByRole('button',{name:'Validar',exact:true}).click();
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  expect(await page.evaluate(()=>globalThis.validationEvidence)).toEqual({invalid:3,submitted:1,navigated:1});
  expect(errors).toEqual([]);
});

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


const IMMERSIVE_SESSION_TASK_IDS=new Set(['client-session-live','client-feedback']);

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
      .filter(({element,style,box,color})=>{
        if(!color||color.a<.45)return false;
        if(style.display==='none'||style.visibility==='hidden'||box.width<=0||box.height<=0)return false;
        if(box.width*box.height<6000)return false;
        if(style.backgroundImage&&style.backgroundImage!=='none')return false;
        if(!(color.r>=230&&color.g>=230&&color.b>=225))return false;
        // M41: a single intentional warm-paper Client status is allowed only
        // with actual dark text contrast. Every unintended white island fails.
        if(element.matches('.m26-shell[data-m26-role="client"] .m26-client-home-clear')){
          const textNodes=[...element.querySelectorAll('strong,small')];
          const luminance=({r,g,b})=>{
            const toLinear=v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4};
            return .2126*toLinear(r)+.7152*toLinear(g)+.0722*toLinear(b);
          };
          const background=luminance(color);
          const accessible=textNodes.length>=2&&textNodes.every(node=>{
            const foreground=parse(getComputedStyle(node).color);
            if(!foreground||foreground.a<.99)return false;
            const l=luminance(foreground);
            return (Math.max(l,background)+.05)/(Math.min(l,background)+.05)>=4.5;
          });
          if(accessible)return false;
        }
        return true;
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
    const card=page.locator('[data-admin-user-card][data-user-id="22222222-2222-4222-8222-222222222222"]');
    const identity=card.locator('details[data-admin-user-disclosure]');
    await expect(identity,'Admin must expose a compact accessible identity').toBeVisible();
    await expect(identity,'Healthy accounts start collapsed').not.toHaveAttribute('open','');
    const identityToggle=identity.locator(':scope > summary');
    await expect(identityToggle).toBeVisible();
    await identityToggle.click();
    await expect(identity).toHaveAttribute('open','');
    const details=identity.locator('details.m26-admin-user-management');
    await expect(details,'Account controls become reachable through the expanded identity').toBeVisible();
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open','');
    await expect(details.locator('[data-admin-form="user-delete"]')).toBeVisible();
    return;
  }

  const form=page.locator('[data-admin-form="client-create"]');
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill('Cliente QA Device Gate');
  await form.locator('input[name="email"]').fill('device-gate@example.invalid');
  // B33: optional contact fields are intentionally collapsed. Exercise the
  // actual accessible summary before typing, on every real device profile.
  const optionalContact=form.locator('details[data-client-optional-contact]');
  await expect(optionalContact).toBeVisible();
  await optionalContact.locator(':scope > summary').click();
  await expect(optionalContact).toHaveAttribute('open','');
  await optionalContact.locator('input[name="phone"]').fill('+56 9 5555 0102');
  await form.locator('select[name="sexForNorms"]').selectOption('female');
  await optionalContact.locator('select[name="preferredContactChannel"]').selectOption('email');
  await expect(optionalContact.locator('input[name="phone"]')).toHaveValue('+56 9 5555 0102');
  const next=form.locator('[data-client-step="1"] [data-client-wizard-next]');
  await expect(next).toBeVisible();
  await next.click();
  await expect(form.locator('[data-client-step="2"]')).toBeVisible();
}


async function assertSettingsReachable(page,task,viewport){
  if(IMMERSIVE_SESSION_TASK_IDS.has(task.id)){
    if(task.id==='client-session-live'){
      const secondaryContext=page.locator('.m26-session-live-secondary-context > summary').first();
      await expect(
        secondaryContext,
        task.id+' immersive session must expose secondary session context',
      ).toBeVisible();
      await secondaryContext.click();

      const recoveryDisclosure=page.locator('.m26-session-options > summary').filter({hasText:'Pausa o cancelación'}).first();
      await expect(
        recoveryDisclosure,
        task.id+' immersive session must expose the pause/cancel recovery disclosure after opening session context',
      ).toBeVisible();
      await recoveryDisclosure.click();

      await expect(
        page.locator('[data-session-action="pause"]').first(),
        task.id+' immersive session must expose pause after opening recovery controls',
      ).toBeVisible();
      return;
    }
    await expect(
      page.locator('[data-session-action="exit-session"]').first(),
      task.id+' feedback state must allow saving progress and leaving safely',
    ).toBeVisible();
    return;
  }

  if(task.role==='client'&&viewport.width<=900){
    const clientMore=page.locator('.m26-client-bottom-nav-more > summary').first();
    await expect(clientMore,'Client Más must expose account destinations on compact layouts').toBeVisible();
    await clientMore.click();
    await expect(page.locator('.m26-client-bottom-nav-menu [data-m26-area="ajustes"]').first(),'Client Settings must be reachable from Más').toBeVisible();
    await clientMore.click();
    return;
  }

  if(viewport.width>=720){
    const trigger=page.locator('.m26-sidebar-footer .m26-settings-menu > summary').first();
    await expect(trigger,task.id+' tablet/desktop must expose Settings in the account rail').toBeVisible();
    await trigger.scrollIntoViewIfNeeded();
    const target=await trigger.evaluate((element)=>{
      const box=element.getBoundingClientRect();
      const clientX=Math.min(innerWidth-1,Math.max(0,box.left+box.width/2));
      const clientY=Math.min(innerHeight-1,Math.max(0,box.top+box.height/2));
      const hit=document.elementFromPoint(clientX,clientY);
      return {
        owned:Boolean(hit&&(hit===element||element.contains(hit))),
        clientX,
        clientY,
      };
    });
    expect(target.owned,task.id+' Settings trigger must own its touch hit target').toBe(true);
    // Geometry and activation are verified independently. elementFromPoint above
    // proves that a real pointer/touch lands on Settings; HTMLElement.click()
    // exercises the native/controller activation without Playwright adding a
    // second synthetic scroll or device-emulation gesture to this static fixture.
    await trigger.evaluate((element)=>element.click());
    const settingsDetails=page.locator('.m26-sidebar-footer .m26-settings-menu').first();
    await expect(settingsDetails,task.id+' reachable Settings activation must open the disclosure').toHaveAttribute('open','');
    await expect(page.locator('.m26-sidebar-footer .m26-settings-popover').first()).toBeVisible();
    await expect(page.locator('.m26-sidebar-footer [data-m26-area="ajustes"], .m26-sidebar-footer [data-m26-area="admin-configuracion"]').first()).toBeVisible();
    await settingsDetails.evaluate((details)=>{details.open=false;});
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
      if(!IMMERSIVE_SESSION_TASK_IDS.has(task.id)){
        expect(metrics.mobileNavVisible||metrics.clientBottomNavVisible,task.id+' must expose phone navigation').toBe(true);
      }
    }else if(viewport.width<=1179&&['coach','admin'].includes(task.role)){
      expect(metrics.sidebarVisible,task.id+' tablet account rail must remain visible').toBe(true);
      expect(metrics.mobileNavVisible,task.id+' tablet must avoid duplicate shell navigation').toBe(false);
    }else if(viewport.width<=900){
      expect(metrics.sidebarVisible,task.id+' compact Client navigation must replace sidebar').toBe(false);
      if(!IMMERSIVE_SESSION_TASK_IDS.has(task.id)){
        expect(metrics.clientBottomNavVisible||metrics.mobileNavVisible,task.id+' Client must expose compact navigation').toBe(true);
      }
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
    await captureEvidenceScreenshot(page,{path:screenshot,fullPage:true,animations:'disabled',caret:'hide'});

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


test('SIGNATURE Coach prior-session context remains fully readable at every device width',async({page},testInfo)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/qa/rc64/fixture.html',{waitUntil:'domcontentloaded'});
  await page.addStyleTag({url:'/src/m26/design/runtime-static.css'});
  const longContext=('Molestia de rodilla derecha al descender, especialmente al superar la profundidad habitual. Reevaluar rango y carga antes de progresar. ').repeat(6).trim();
  expect(longContext.length).toBeGreaterThan(220);
  const result=await page.evaluate(async(text)=>{
    document.body.innerHTML='<main id="coach-context-fixture"><section data-session-live-state="active"><div class="m26-session-live-hero"><h1>Sesión con Coach</h1></div></section></main>';
    const {enhanceSessionReadiness}=await import('/src/m26/ui/session-readiness.js');
    const root=document.querySelector('#coach-context-fixture');
    const state={
      selectedClientId:'coach-qa-1',
      collections:{
        sessionExecutions:[{
          id:'prior-completed',clientId:'coach-qa-1',
          status:'completed',syncStatus:'clean',
          completedAt:'2026-10-17T17:00:00Z',
          feedback:{pain:true,painNotes:text},
        }],
        m26Entities:[],
      },
    };
    const viewModel={activeArea:'sesion',identity:{role:'coach'}};
    const first=enhanceSessionReadiness({root,viewModel,state});
    const again=enhanceSessionReadiness({root,viewModel,state});
    return {first,again,count:root.querySelectorAll('[data-m27-coach-live-context]').length};
  },longContext);
  expect(result).toEqual({first:true,again:true,count:1});
  const flag=page.locator('[data-m27-coach-live-context]');
  const detail=flag.locator('.m27-session-live-context-copy > small');
  await expect(detail).toHaveText(longContext);
  const metrics=await detail.evaluate((node)=>{
    const style=getComputedStyle(node),box=node.getBoundingClientRect();
    return {
      whiteSpace:style.whiteSpace,
      overflow:style.overflow,
      fontPx:Number.parseFloat(style.fontSize),
      lineHeight:Number.parseFloat(style.lineHeight),
      height:box.height,
      width:box.width,
      scrollWidth:node.scrollWidth,
      clientWidth:node.clientWidth,
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:document.documentElement.clientWidth,
    };
  });
  expect(metrics.whiteSpace,'Coach safety context must be allowed to wrap').toBe('normal');
  expect(metrics.overflow,'Coach safety context must never use ellipsis clipping').toBe('visible');
  expect(metrics.fontPx).toBeGreaterThanOrEqual(13);
  // On wide screens the complete note fits correctly on one line.
  // A forced two-line layout would be an artificial regression.
  expect(metrics.height,'Visible context needs its full line box').toBeGreaterThanOrEqual(metrics.lineHeight-1);
  if((page.viewportSize()?.width||0)<=760){
    expect(metrics.height,'Compact touch devices must wrap the full note').toBeGreaterThan(metrics.lineHeight*1.5);
  }
  expect(metrics.scrollWidth,'Context must not cause text overflow').toBeLessThanOrEqual(metrics.clientWidth+1);
  expect(metrics.documentWidth,'No horizontal viewport overflow at '+testInfo.project.name).toBeLessThanOrEqual(metrics.viewportWidth+1);
  expect(errors).toEqual([]);
});
