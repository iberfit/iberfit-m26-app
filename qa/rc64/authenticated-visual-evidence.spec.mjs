import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {CLIENT_SIGNATURE_U24_AREAS,certifyClientSignatureRoute} from './signature-u24-client-route-audit.mjs';
import {
  CANARY_ORIGIN,
  QA_PROJECT_REF,
  SUPABASE_ORIGIN,
  installCurrentSourceQaNetworkPolicy,
  qaRequestLabel,
  isQaPrivateAvatarRead,
  isQaMissingPrivateAvatarResponse,
  unexpectedQaResourceErrors,
} from './secure-current-source-auth.mjs';

const OUT_DIR='recovery/rc64-authenticated-visual';
const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
];
const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26',
  'iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13',
  'iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d',
  'iberfit_communication_bootstrap_v14',
  'm26_backend_bootstrap_v43',
  'm26_wearable_bootstrap_v44',
  'iberfit_exercise_catalog_public_v1',
  'iberfit_exercise_measurement_profiles_public_v1',
  'iberfit_exercise_media_manifest_v1',
  // Verified on QA pg_proc: authenticated, self-scoped SELECT-only subscription
  // count/status; never allow subscribe, unsubscribe or push dispatch here.
  'iberfit_web_push_status_v1',
]);

function safeSlug(value){return String(value||'unknown').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,80)||'unknown';}
async function settleVisual(page){
  await page.evaluate(async()=>{await document.fonts?.ready;document.documentElement.setAttribute('data-rc64-visual-evidence','authenticated-readonly');});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(120);
}
async function dismissGuidance(page){
  const welcome=page.locator('[data-m26-client-guided-welcome]');
  await welcome.waitFor({state:'visible',timeout:3_000}).catch(()=>{});
  if(await welcome.isVisible().catch(()=>false)){
    const pause=page.locator('[data-m26-client-guided-welcome-pause]').first();
    if(await pause.count())await pause.click();
  }
  const tour=page.locator('[data-m26-guided-tour]');
  if(await tour.count()){
    const close=tour.locator('[data-m26-guided-tour-close]').first();
    if(await close.count())await close.click();
  }
}
async function capture(page,{account,project,state,suffix=''}){
  await settleVisual(page);
  const variant=String(suffix||'').trim()?`-${safeSlug(suffix)}`:'';
  const file=`${safeSlug(account.role)}-${safeSlug(account.name)}-${safeSlug(project)}${variant}.png`;
  await page.screenshot({
    path:`${OUT_DIR}/${file}`,
    fullPage:true,
    animations:'disabled',
    caret:'hide',
    mask:[page.locator('input[type="email"]'),page.locator('input[type="password"]')],
  });
  return {role:account.role,account:account.name,state,project:safeSlug(project),file,syntheticQa:true};
}

async function certifyNonOverlappingClientDock(page,project,route){
  if((project.viewport?.width||0)>900){
    // Desktop pointer users intentionally have no Client dock. On tablet
    // touch, where both the shell rail and the dock are visible, check the
    // *actual hit regions*: a screenshot can conceal a clipped first icon.
    const railDock=await page.evaluate(()=>{
      const shell=document.querySelector('.m26-shell[data-m26-role="client"]');
      const sidebar=shell?.querySelector('.m26-sidebar');
      const dock=shell?.querySelector('.m26-client-bottom-nav');
      if(!sidebar||!dock||getComputedStyle(sidebar).display==='none'||
          getComputedStyle(dock.closest('.m26-client-bottom-nav-layer')).display==='none')return null;
      const rail=sidebar.getBoundingClientRect();
      const nav=dock.getBoundingClientRect();
      const first=dock.querySelector('.m26-client-bottom-nav-item');
      const firstRect=first?.getBoundingClientRect();
      const point=firstRect?document.elementFromPoint(firstRect.left+firstRect.width/2,firstRect.top+firstRect.height/2):null;
      return {
        railRight:rail.right,
        dockLeft:nav.left,
        dockRight:nav.right,
        viewportWidth:document.documentElement.clientWidth,
        firstLeft:firstRect?.left??-1,
        firstAccessible:Boolean(first&&point&&(first===point||first.contains(point))),
      };
    });
    if(railDock){
      expect(railDock.dockLeft,`${route}: tablet Cliente dock must start beyond the rail`).toBeGreaterThanOrEqual(railDock.railRight-1);
      expect(railDock.firstLeft,`${route}: first nav button cannot be hidden behind sidebar`).toBeGreaterThanOrEqual(railDock.railRight-1);
      expect(railDock.dockRight,`${route}: the dock must fit the remaining viewport width`).toBeLessThanOrEqual(railDock.viewportWidth+1);
      expect(railDock.firstAccessible,`${route}: first dock button must receive a real pointer hit`).toBe(true);
    }
    return;
  }
  const geometry=await page.evaluate(()=>{
    const shell=document.querySelector('.m26-client-route-shell');
    const scroller=shell?.querySelector(':scope > :not(.m26-client-bottom-nav-layer)');
    const layer=shell?.querySelector(':scope > .m26-client-bottom-nav-layer');
    const nav=layer?.querySelector('.m26-client-bottom-nav');
    if(!scroller||!layer||!nav)return null;
    const contentBox=scroller.getBoundingClientRect();
    const dockBox=layer.getBoundingClientRect();
    const navBox=nav.getBoundingClientRect();
    const scrollable=scroller.scrollHeight>scroller.clientHeight+2;
    const feature=scroller.querySelector('.m26-client-home-feature');
    const primary=feature?.querySelector('.m26-client-home-primary-zone');
    const featureBox=feature?.getBoundingClientRect();
    const primaryBox=primary?.getBoundingClientRect();
    const featureOwnsPrimary=!feature||Boolean(primary&&primaryBox.width>10&&primaryBox.height>48
      &&primaryBox.top>=featureBox.top-1&&primaryBox.bottom<=featureBox.bottom+2);
    scroller.scrollTop=scroller.scrollHeight;
    return {
      viewportHeight:innerHeight,
      featureOwnsPrimary,
      contentBottom:contentBox.bottom,
      dockTop:dockBox.top,
      dockBottom:dockBox.bottom,
      navTop:navBox.top,
      navBottom:navBox.bottom,
      dockPosition:getComputedStyle(layer).position,
      scrollYStyle:getComputedStyle(scroller).overflowY,
      scrollable,
      maxScroll:Math.max(0,scroller.scrollHeight-scroller.clientHeight),
      scrollTop:scroller.scrollTop,
      widthOverflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth+1,
      documentScrollY:scrollY,
      documentScrollHeight:document.documentElement.scrollHeight,
      shellBottom:document.querySelector('.m26-shell')?.getBoundingClientRect()?.bottom,
      workspaceBottom:document.querySelector('.m26-workspace')?.getBoundingClientRect()?.bottom,
      mainBottom:document.querySelector('.m26-main')?.getBoundingClientRect()?.bottom,
      routeShellBottom:shell.getBoundingClientRect().bottom,
      routeShellHeight:shell.getBoundingClientRect().height,
      routeShellFlexGrow:getComputedStyle(shell).flexGrow,
      mainHeight:document.querySelector('.m26-main')?.getBoundingClientRect()?.height,
      mainScrollTop:document.querySelector('.m26-main')?.scrollTop,
      mainOverflow:getComputedStyle(document.querySelector('.m26-main')).overflow,
      mainDisplay:getComputedStyle(document.querySelector('.m26-main')).display,
      workspaceHeight:document.querySelector('.m26-workspace')?.getBoundingClientRect()?.height,
      workspaceDisplay:getComputedStyle(document.querySelector('.m26-workspace')).display,
      workspaceDirection:getComputedStyle(document.querySelector('.m26-workspace')).flexDirection,
      scrollerHeight:scroller.getBoundingClientRect().height,
      hitNav:nav.contains(document.elementFromPoint(navBox.left+navBox.width/2,navBox.top+navBox.height/2)),
    };
  });
  if(route==='Cliente ajustes')console.log('SIGNATURE_CLIENT_SETTINGS_GEOMETRY:'+JSON.stringify(geometry));
  expect(geometry,`${route}: Client needs both the route scroller and a separate bottom dock`).not.toBeNull();
  expect(geometry.documentScrollY,`${route}: document must not scroll behind the Client dock`).toBeLessThanOrEqual(1);
  expect(geometry.mainScrollTop,`${route}: hidden main must not scroll the whole dock with contextual help`).toBeLessThanOrEqual(1);
  expect(geometry.mainOverflow,`${route}: only the nested route may scroll`).toBe('clip');
  expect(geometry.shellBottom,`${route}: Client shell stays viewport-bound`).toBeGreaterThanOrEqual(geometry.viewportHeight-2);
  expect(geometry.dockPosition,`${route}: dock must occupy its own layout row`).toBe('relative');
  expect(geometry.scrollYStyle,`${route}: content must be independently scrollable`).toBe('auto');
  expect(geometry.contentBottom,`${route}: route must end before navigation starts`).toBeLessThanOrEqual(geometry.dockTop+1);
  expect(geometry.dockBottom,`${route}: dock must remain within the visual viewport`).toBeLessThanOrEqual(geometry.viewportHeight+1);
  expect(geometry.dockBottom,`${route}: dock must not float above an unused strip`).toBeGreaterThanOrEqual(geometry.viewportHeight-14);
  expect(geometry.featureOwnsPrimary,`${route}: primary action must not be cropped by the new scrollport`).toBe(true);
  expect(geometry.hitNav,`${route}: dock must receive touch input`).toBe(true);
  expect(geometry.widthOverflow,`${route}: dock must not cause sideways scrolling`).toBe(false);
  if(geometry.scrollable){
    expect(geometry.scrollTop,`${route}: footer content must remain scroll-reachable`).toBeGreaterThanOrEqual(geometry.maxScroll-2);
  }
  await page.evaluate(()=>{
    const el=document.querySelector('.m26-client-route-shell > :not(.m26-client-bottom-nav-layer)');
    if(el)el.scrollTop=0;
  });
}

test('authenticated visual evidence uses Client-only QA plus privileged Coach gate and remains business read-only',async({browser},testInfo)=>{
  const missing=REQUIRED.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);
  await mkdir(OUT_DIR,{recursive:true});

  const accounts=[
    {name:'client_b',role:'client',expectedEmail:'qa.rc74.client-b@iberfit.cl',email:process.env.M26_QA_CLIENT_B_EMAIL,password:process.env.M26_QA_CLIENT_B_PASSWORD},
    {name:'coach',role:'coach',expectedEmail:'qa.rc74.coach@iberfit.cl',email:process.env.M26_QA_COACH_EMAIL,password:process.env.M26_QA_COACH_PASSWORD},
  ];
  const captures=[];
  const clientRouteAudits=[];
  const projectUse=testInfo.project.use||{};

  for(const account of accounts){
    expect(String(account.email||'').toLowerCase()).toBe(account.expectedEmail);
    const context=await browser.newContext({
      baseURL:CANARY_ORIGIN,
      locale:'es-ES',
      timezoneId:'America/Santiago',
      serviceWorkers:'block',
      reducedMotion:'reduce',
      viewport:projectUse.viewport,
      hasTouch:Boolean(projectUse.hasTouch),
      isMobile:Boolean(projectUse.isMobile),
    });
    const blocked=[];
    const unexpectedFailures=[];
    const consoleErrors=[];
    const avatarChecks=[],missingAvatar=[];
    const pageErrors=[];
    await installCurrentSourceQaNetworkPolicy(context,{
      readOnlyRpcs:READ_ONLY_RPCS,
      onBlocked:(label)=>blocked.push(label),
    });
    const page=await context.newPage();
    page.on('requestfailed',(request)=>{const label=qaRequestLabel(request);if(!blocked.includes(label))unexpectedFailures.push(label);});
    page.on('response',(response)=>{
      if(isQaPrivateAvatarRead(response.request())&&response.status()>=400){
        avatarChecks.push(isQaMissingPrivateAvatarResponse(response).then(ok=>{
          if(ok)missingAvatar.push(true);
          else unexpectedFailures.push('QA_AVATAR_UNEXPECTED_HTTP_'+response.status());
        }));
      }
    });
    page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,400));});
    page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,400)));

    try{
      const navigation=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:20_000});
      expect(navigation?.ok()).toBeTruthy();
      await page.getByRole('textbox',{name:'Correo',exact:true}).fill(account.email);
      await page.locator('#m26-login-password').fill(account.password);
      // Visual evidence must start its MFA UI clock only after the backend
      // assurance decision arrives. Password and token material stay out of logs.
      // Keep a bounded response wait and the original 5s post-decision UI SLA.
      const assuranceOutcome=account.role==='coach'
        ?page.waitForResponse((response)=>{
          try{
            const url=new URL(response.url());
            return url.origin===SUPABASE_ORIGIN&&
              url.pathname==='/rest/v1/rpc/iberfit_privileged_assurance_context_v65d';
          }catch{return false;}
        },{timeout:30_000}).then(response=>({response}),error=>({error}))
        :null;
      await page.getByRole('button',{name:'Entrar',exact:true}).click();

      if(account.role==='coach'){
        const outcome=await assuranceOutcome;
        if(outcome.error)throw new Error('RC64_VISUAL_PRIVILEGED_ASSURANCE_TIMEOUT',{cause:outcome.error});
        expect(outcome.response.status(),'Privileged assurance RPC must answer successfully').toBe(200);
        const assurance=await outcome.response.json();
        expect(assurance?.privileged,'Coach must be privileged').toBe(true);
        expect(assurance?.mfaRequired,'Coach must require MFA').toBe(true);
        expect(assurance?.webauthnRequired,'Coach must require WebAuthn').toBe(true);
        expect(assurance?.iberfitAssurance,'Coach remains fail-closed until device proof').not.toBe('verified');
        await expect(page.locator('.m26-shell[data-m26-role="coach"]')).toHaveCount(0,{timeout:10_000});
        await expect(page.locator('#m26-auth-title')).toBeVisible({timeout:10_000});
        await expect(page.locator('[data-auth-action="mfa-continue-webauthn"]')).toBeVisible({timeout:5_000});
        captures.push(await capture(page,{account,project:testInfo.project.name,state:'privileged-webauthn-gate'}));
      }else{
        const shell=page.locator('.m26-shell[data-m26-role="client"]');
        await expect(shell,'Client-only visual fixture must open Client without privileged MFA').toBeVisible({timeout:25_000});
        await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});
        await expect(page.locator('.m26-role-choice[role="dialog"]')).toHaveCount(0);
        await dismissGuidance(page);
        await expect(page.locator('.m26-route').first()).toBeVisible({timeout:10_000});
        captures.push(await capture(page,{account,project:testInfo.project.name,state:'authenticated-shell'}));

        // SIGNATURE 360: certify Client Hoy in the live authenticated surface.
        // Stay on the synthetic read-only QA account; do not start a workout or write data.
        const todayNav=page.locator('[data-m26-area="hoy"]:visible').first();
        await expect(todayNav).toBeVisible({timeout:5_000});
        await todayNav.click();
        await expect(page.locator('.m26-client-home-v1')).toBeVisible({timeout:10_000});
        const primaryAction=page.locator('.m26-client-home-primary-zone .m26-today-action.is-primary');
        await expect(primaryAction).toBeVisible({timeout:5_000});
        const layout=await page.evaluate(()=>{
          const root=document.documentElement;
          return {scrollWidth:root.scrollWidth,viewportWidth:root.clientWidth};
        });
        expect(layout.scrollWidth,'Client Hoy cannot cause horizontal document scrolling').toBeLessThanOrEqual(layout.viewportWidth+1);
        await certifyNonOverlappingClientDock(page,projectUse,'Cliente Hoy');
        const transitionMs=await primaryAction.evaluate((button)=>getComputedStyle(button)
          .transitionDuration.split(',').map((value)=>{
            const duration=String(value||'').trim();
            const numeric=Number.parseFloat(duration);
            if(!Number.isFinite(numeric))return Number.NaN;
            if(duration.endsWith('ms'))return numeric;
            if(duration.endsWith('s'))return numeric*1000;
            return Number.NaN;
          }));
        expect(transitionMs.length,'At least one computed transition duration must be reported').toBeGreaterThan(0);
        for(const milliseconds of transitionMs){
          expect(Number.isFinite(milliseconds),'Reduced-motion duration must be a finite CSS time').toBe(true);
          expect(milliseconds,'Reduced-motion accessibility allows at most one millisecond').toBeLessThanOrEqual(1);
        }
        const visibleDockLabels=page.locator('.m26-client-bottom-nav-label:visible');
        if(await visibleDockLabels.count()){
          // Range.getClientRects() is empty in Chromium 320px for the visible
          // compact text slot even when its element has a nonzero painted height.
          // Verify a real visible box, nonwrapping CSS and no vertical clipping.
          // Horizontal overflow remains contained by the dock's ellipsis styling.
          const labelMetrics=await visibleDockLabels.evaluateAll((labels)=>labels.map((label)=>{
            const style=getComputedStyle(label);
            const rect=label.getBoundingClientRect();
            return {
              label:label.textContent?.trim(),
              whiteSpace:style.whiteSpace,
              overflowX:style.overflowX,
              textOverflow:style.textOverflow,
              renderedHeight:rect.height,
              clientHeight:label.clientHeight,
              scrollHeight:label.scrollHeight,
              clientWidth:label.clientWidth,
              scrollWidth:label.scrollWidth,
              itemWidth:Math.round(label.parentElement?.getBoundingClientRect()?.width||0),
              itemPadding:getComputedStyle(label.parentElement).padding,
              itemBoxSizing:getComputedStyle(label.parentElement).boxSizing,
              itemFlexDirection:getComputedStyle(label.parentElement).flexDirection,
              textComputedWidth:getComputedStyle(label).width,
              childElements:label.childElementCount,
            };
          }));
          const clippedLabels=labelMetrics.filter((label)=>label.scrollWidth>label.clientWidth+1);
          if(clippedLabels.length){
            console.log('RC64_CLIENT_DOCK_LAYOUT_SAFE:'+JSON.stringify({
              viewportWidth:projectUse.viewport?.width||0,
              clipped:clippedLabels,
            }));
          }
          for(const label of labelMetrics){
            expect(label.whiteSpace,`Dock caption must not wrap: ${label.label}`).toBe('nowrap');
            expect(label.renderedHeight,`Dock label must be painted: ${label.label}`).toBeGreaterThan(0);
            expect(label.clientHeight,`Dock label must reserve vertical space: ${label.label}`).toBeGreaterThan(0);
            // A one-line glyph can produce a 1-2px scrollHeight excess on Chromium tablets.
            // Preserve a strict text-only, nonwrapping label and reject true second-line
            // overflow (~2x its painted height), without comparing pixel-rounded
            // intrinsic glyph dimensions as if they were line counts.
            expect(label.childElements,`Dock label must remain a single text-only caption: ${label.label}`).toBe(0);
            expect(label.scrollHeight,`Dock label cannot hide a second line: ${label.label}`).toBeLessThanOrEqual(Math.ceil(label.clientHeight*1.25));
            expect(label.scrollWidth,`Compact dock caption must fit without visible ellipsis: ${label.label}`).toBeLessThanOrEqual(label.clientWidth+1);
            expect(label.overflowX,`Dock caption must not overflow its hit target: ${label.label}`).toBe('hidden');
            expect(label.textOverflow,`Dock caption must have an accessible overflow fallback: ${label.label}`).toBe('ellipsis');
          }
          const planningNav=page.locator('button.m26-client-bottom-nav-item[data-m26-area="planificacion"]');
          await expect(planningNav).toHaveAttribute('aria-label','Planificación');
          if((projectUse.viewport?.width||0)<=690){
            await expect(planningNav.locator('.m26-client-bottom-nav-label-compact')).toHaveText('Plan');
            await expect(page.locator('button.m26-client-bottom-nav-item[data-m26-area="sesion"] .m26-client-bottom-nav-label-compact')).toHaveText('Sesión');
            await expect(page.locator('button.m26-client-bottom-nav-item[data-m26-area="progreso"] .m26-client-bottom-nav-label-compact')).toHaveText('Avance');
          }
        }
        if((projectUse.viewport?.width||0)<=680){
          const disclosure=page.locator('.m26-client-home-secondary-disclosure > summary');
          const summaryDisplay=await disclosure.evaluate((node)=>getComputedStyle(node).display);
          expect(summaryDisplay,'Mobile disclosure indicator needs a stable two-column layout').toBe('grid');
        }

        // SIGNATURE Client Editorial V3: certify actual computed warm surfaces,
        // the canonical primary action and the data-derived train/IRI split.
        const editorial=page.locator('.m26-client-home-editorial-v3');
        await expect(editorial).toBeVisible({timeout:6_000});
        const heroMaterials=await editorial.evaluate((root)=>{
          const hero=root.querySelector('.m26-client-home-hero');
          const action=root.querySelector('.m26-client-home-primary-zone');
          const button=action?.querySelector('.m26-today-action.is-primary');
          const rect=root.getBoundingClientRect();
          const visualWidth=document.documentElement.clientWidth;
          return {
            heroBg:hero?getComputedStyle(hero).backgroundColor:null,
            actionBg:action?getComputedStyle(action).backgroundColor:null,
            buttonHeight:button?.getBoundingClientRect().height??0,
            sectionWidth:rect.width,
            viewportWidth:visualWidth,
            stepCount:root.querySelectorAll('.m26-client-home-journey-steps > li').length,
            trainingSection:root.querySelectorAll('[data-m26-client-training-journey]').length,
          };
        });
        expect(heroMaterials.heroBg).toBeTruthy();
        expect(heroMaterials.actionBg).toBeTruthy();
        expect(heroMaterials.heroBg,'The warm decision panel must be visually distinct from the forest editorial hero').not.toBe(heroMaterials.actionBg);
        expect(heroMaterials.buttonHeight,'The primary action must keep a comfortable touch target').toBeGreaterThanOrEqual(48);
        expect(heroMaterials.sectionWidth,'Home must not exceed the visual viewport').toBeLessThanOrEqual(heroMaterials.viewportWidth+1);
        if(heroMaterials.trainingSection){
          expect(heroMaterials.stepCount,'Real Client training should expose exactly three descriptive stages').toBe(3);
          await expect(editorial.locator('.m26-client-home-journey-steps')).toContainText('Seguimiento');
        }else{
          await expect(editorial.locator('.m26-client-home-journey-steps')).toHaveCount(0);
        }

        clientRouteAudits.push(await certifyClientSignatureRoute(page,'hoy'));
        captures.push(await capture(page,{account,project:testInfo.project.name,state:'authenticated-client-hoy',suffix:'hoy'}));
        if((projectUse.viewport?.width||0)<=690){
          await page.evaluate(()=>{
            const content=document.querySelector('.m26-client-route-shell > :not(.m26-client-bottom-nav-layer)');
            if(content)content.scrollTop=content.scrollHeight;
          });
          captures.push(await capture(page,{account,project:testInfo.project.name,state:'authenticated-client-hoy-end',suffix:'hoy-end'}));
          await page.evaluate(()=>{
            const content=document.querySelector('.m26-client-route-shell > :not(.m26-client-bottom-nav-layer)');
            if(content)content.scrollTop=0;
          });
        }


        // SIGNATURE 360 2/5: certify the *actual RC39 Client Plan* and its
        // confirmed-appointment panel in each authenticated QA viewport.
        const planNav=page.locator('[data-m26-area="planificacion"]:visible').first();
        await expect(planNav).toBeVisible({timeout:5_000});
        await planNav.click();
        await expect(page.locator('.m26-rc39-planning')).toBeVisible({timeout:10_000});
        await certifyNonOverlappingClientDock(page,projectUse,'Tu plan');
        await expect(page.locator('.m26-rc39-planning .m26-route-intro h2')).not.toContainText('Sin modalidad');
        const pendingPlan=page.locator('.m30-planning-overview.is-pending');
        if(await pendingPlan.count()){
          await expect(pendingPlan).toContainText('Tu semana aún no está publicada');
          await expect(page.locator('.m26-rc39-planning > .m26-route-intro .m26-badge')).toHaveCount(0);
          await expect(page.locator('.m30-planning-overview-metrics')).toHaveCount(0);
          await expect(pendingPlan.locator('button[data-m26-area="actividad"]')).toBeVisible();
          await expect(page.locator('.m26-rc39-week')).toHaveCount(0);
        }else{
          await expect(page.locator('.m30-planning-overview-metrics')).toBeVisible();
        }
        const confirmedAppointments=page.locator('#m26-client-next-appointment');
        await expect(confirmedAppointments).toBeVisible({timeout:5_000});
        const appointmentCards=confirmedAppointments.locator('.m30-planning-appointment');
        if(await appointmentCards.count()){
          const allStatuses=await appointmentCards.locator('.m26-badge').allTextContents();
          expect(allStatuses.every((label)=>/confirmad|confirmed/i.test(label)),'Client Plan cannot expose unconfirmed internal appointments').toBe(true);
        }else{
          await expect(confirmedAppointments).toContainText('Sin próximas citas confirmadas');
        }
        const planningOverflow=await page.evaluate(()=>({
          scrollWidth:document.documentElement.scrollWidth,viewportWidth:document.documentElement.clientWidth,
        }));
        expect(planningOverflow.scrollWidth,'Client Plan must not overflow the document horizontally').toBeLessThanOrEqual(planningOverflow.viewportWidth+1);
        clientRouteAudits.push(await certifyClientSignatureRoute(page,'planificacion'));
        captures.push(await capture(page,{account,project:testInfo.project.name,state:'authenticated-client-plan',suffix:'plan'}));

        // SIGNATURE 360: Client Sessions must preserve Coach-led authorization,
        // preview-first launch and bottom-dock separation, even on an empty account.
        const sessionsNav=page.locator('[data-m26-area="sesion"]:visible').first();
        await expect(sessionsNav).toBeVisible({timeout:5_000});
        await sessionsNav.click();
        const sessionsRoute=page.locator('.m26-rc39-sessions');
        await expect(sessionsRoute).toBeVisible({timeout:10_000});
        await certifyNonOverlappingClientDock(page,projectUse,'Tus sesiones');
        const sessionsState=await sessionsRoute.getAttribute('data-client-session-state');
        expect(['empty','published','ready'],'Client session state must be explicit').toContain(sessionsState);
        if(sessionsState==='empty'){
          await expect(sessionsRoute.locator('[data-client-session-empty]')).toBeVisible();
          await expect(sessionsRoute.locator('button[data-m26-area="planificacion"]')).toBeVisible();
          await expect(sessionsRoute.locator('button[data-m26-area="actividad"]')).toBeVisible();
          await expect(sessionsRoute.locator('[data-workflow-action="start-published-session"]')).toHaveCount(0);
          await expect(sessionsRoute.locator('[data-m43-session-history]')).toHaveCount(0);
        }else{
          await expect(sessionsRoute.locator('.m26-rc39-session-card').first()).toBeVisible();
          const supervisedCards=sessionsRoute.locator('.m26-rc39-session-card.is-coach,.m26-rc39-session-card.is-online');
          for(const card of await supervisedCards.all()){
            await expect(card.locator('[data-workflow-action="start-published-session"]')).toHaveCount(0);
          }
          if(sessionsState==='ready'){
            // A visible first-tap CTA is deliberately OUTSIDE the optional
            // exercise-details disclosure. Verify same authorized session,
            // and never allow a hidden or supervised card to satisfy the gate.
            const actionable=sessionsRoute.locator(
              '.m26-rc39-session-card.is-autonomous[data-client-session-card-state="ready"]');
            expect(await actionable.count(),
              'At least one independently authorized ready/continuable session').toBeGreaterThan(0);
            for(const card of await actionable.all()){
              await expect(card.locator('details.m26-session-preview-disclosure > summary'),
                'Exercises stay reviewable without requiring expansion for launch').toBeVisible();
              const launch=card.locator(':scope > .m26-session-preview-actions [data-workflow-action="start-published-session"]');
              await expect(launch,'One-tap launch must belong to the same card').toHaveCount(1);
              await expect(launch).toBeVisible();
              await expect(launch).toBeEnabled();
              await expect(launch).toHaveAttribute('data-entity-id',
                await card.getAttribute('data-rc39-session'));
              await expect(launch.locator('xpath=ancestor::details')).toHaveCount(0);
            }
          }
        }
        clientRouteAudits.push(await certifyClientSignatureRoute(page,'sesion'));
        captures.push(await capture(page,{account,project:testInfo.project.name,state:'authenticated-client-sessions',suffix:'sessions'}));

        const progressNav=page.locator('[data-m26-area="progreso"]:visible').first();
        await expect(progressNav).toBeVisible({timeout:5_000});
        await progressNav.click();
        await expect(page.locator('[data-client-progress-stage]')).toBeVisible({timeout:10_000});
        await certifyNonOverlappingClientDock(page,projectUse,'Tu evolución');
        const emptyProgress=page.locator('.m26-client-progress-stage.is-empty');
        if(await emptyProgress.count()){
          await expect(page.locator('.m26-client-progress-route > .m26-route-intro.is-empty')).toBeVisible();
          await expect(page.locator('.m26-client-progress-route > .m26-route-intro .m26-badge')).toHaveCount(0);
          await expect(emptyProgress).toContainText('Tu evolución empieza con el primer registro');
          await expect(emptyProgress.locator('button[data-m26-area="actividad"]')).toBeVisible();
          await expect(emptyProgress.locator('button[data-m26-area="planificacion"]')).toBeVisible();
          await expect(page.locator('.m26-progress-overview')).toHaveCount(0);
        }
        await expect(page.locator('[data-m27-cliente-360]')).toHaveCount(0);
        await expect(page.locator('[data-m26-area="progreso"][aria-current="page"]:visible').first()).toBeVisible({timeout:5_000});
        const exerciseAnalyticsCount=await page.locator('[data-m26-exercise-analytics="v2"]').count();
        clientRouteAudits.push(await certifyClientSignatureRoute(page,'progreso'));
        captures.push({...(await capture(page,{account,project:testInfo.project.name,state:'authenticated-progress',suffix:'progress'})),exerciseAnalyticsCount});

        // SIGNATURE 360 U1: finish the *real* nine-route Client navigation.
        // Four primary routes are certified above; all five remaining routes
        // must be reachable via Más (compact/touch) or the desktop sidebar.
        // Screenshots are synthetic QA evidence, not acceptance of all route states.
        const secondaryClientAreas=['informes','actividad','mensajes','retos','ajustes'];
        for(const area of secondaryClientAreas){
          const more=page.locator('.m26-client-bottom-nav-more > summary').first();
          if(await more.isVisible().catch(()=>false)){
            await more.click();
            // One real authenticated, read-only keyboard journey per device.
            // Escape must restore focus, never leave an invisible menu overlay.
            if(area==='informes'){
              await expect(more).toHaveAttribute('aria-haspopup','menu');
              const overflow=await page.locator('.m26-client-bottom-nav-menu').evaluate(node=>({
                overflowY:getComputedStyle(node).overflowY,
                maxHeight:getComputedStyle(node).maxHeight,
              }));
              expect(overflow.overflowY,'Más must scroll on short mobile screens').toBe('auto');
              expect(Number.parseFloat(overflow.maxHeight)).toBeGreaterThan(100);
              await expect(more).toHaveAttribute('aria-expanded','true');
              const moreItems=page.locator('.m26-client-bottom-nav-menu [role="menuitem"]');
              await more.press('ArrowDown');
              await expect(moreItems.first()).toBeFocused();
              await page.keyboard.press('End');
              await expect(moreItems.last()).toBeFocused();
              await page.keyboard.press('Escape');
              await expect(more).toHaveAttribute('aria-expanded','false');
              await expect(more).toBeFocused();
              await more.click();
              await expect(more).toHaveAttribute('aria-expanded','true');
            }
            await expect(page.locator('[data-m26-client-context-guide]'),
              `${area}: opening Más must release the non-modal context guide`).toHaveCount(0);
            const destination=page.locator(`.m26-client-bottom-nav-menu [role="menuitem"][data-m26-area="${area}"]`);
            await expect(destination,`${area}: Más must retain an accessible destination`).toBeVisible({timeout:5_000});
            await destination.click({timeout:7_000});
          }else if(area==='ajustes'){
            // Desktop Settings lives in the sidebar account popover. Tablets
            // can retain the compact shell "Más" even above 900px, so discover
            // the actually visible affordance without forcing hidden elements.
            const tabletMore=page.locator('.m26-mobile-more > summary').first();
            if(await tabletMore.isVisible().catch(()=>false)){
              await tabletMore.click();
              const settings=page.locator('.m26-mobile-more-menu [data-m26-area="ajustes"]:visible').first();
              await expect(settings,'Tablet compact account menu must expose Settings').toBeVisible();
              await settings.click();
            }else{
              const touchRailSettings=page.locator('.m26-sidebar .m26-client-settings-fallback [data-m26-area="ajustes"]:visible').first();
              if(await touchRailSettings.isVisible().catch(()=>false)){
                await touchRailSettings.click();
              }else{
                const settingsMenu=page.locator('.m26-sidebar details.m26-settings-menu > summary').first();
                await expect(settingsMenu,'Desktop Client must expose Settings in the account footer').toBeVisible({timeout:6_000});
                await settingsMenu.click();
                const settingsPage=page.locator('.m26-sidebar .m26-settings-popover [data-m26-area="ajustes"]').first();
                await expect(settingsPage,'Account menu must link to full Settings').toBeVisible();
                await settingsPage.click();
              }
            }
          }else{
            const destination=page.locator(`.m26-sidebar [data-m26-area="${area}"]:visible`).first();
            await expect(destination,`${area}: desktop sidebar must retain the destination`).toBeVisible({timeout:5_000});
            await destination.click();
          }
          const routeShell=page.locator('.m26-client-route-shell').first();
          // Messages legitimately projects to "communication", or to the
          // recoverable "communication-unavailable" route on remote failure.
          // Both must be visible; neither is an authorization bypass.
          const expectedRoute=area==='mensajes'?/^(?:communication|communication-unavailable)$/u:area;
          await expect(routeShell,`${area}: navigate to real authenticated Client route`)
            .toHaveAttribute('data-client-bottom-nav-route',expectedRoute,{timeout:10_000});
          await expect(routeShell).toBeVisible();
          const routeContent=routeShell.locator(':scope > :not(.m26-client-bottom-nav-layer)').first();
          if(area==='mensajes'){
            const renderedKind=await routeShell.getAttribute('data-client-bottom-nav-route');
            if(renderedKind==='communication-unavailable'){
              await expect(routeContent.locator('[data-m45-communication-retry]'),
                'Messages unavailable state must permit a safe recovery action').toBeVisible();
            }else{
              await expect(routeContent.locator('.m26-communication-grid'),
                'Messages ready state must contain the real conversation surface').toBeVisible();
            }
          }
          await expect(routeContent,`${area}: route must render content, not just its dock`).toBeVisible({timeout:10_000});
          await expect(routeContent.locator('h2,h3').first(),`${area}: identifiable route heading`).toBeVisible();
          await expect(routeContent.locator('.m26-route-placeholder'),`${area}: route must not fall back to unavailable`).toHaveCount(0);
          await certifyNonOverlappingClientDock(page,projectUse,`Cliente ${area}`);
          clientRouteAudits.push(await certifyClientSignatureRoute(page,area));
          captures.push(await capture(page,{
            account,project:testInfo.project.name,
            state:`authenticated-client-${area}`,suffix:area,
          }));
        }
        const inspectedClientRoutes=new Set(captures.filter((item)=>
          item.role==='client'&&item.state.startsWith('authenticated-client-'))
          .map((item)=>item.state.replace(/^authenticated-client-/u,'')));
        for(const area of ['hoy','plan','sessions',...secondaryClientAreas]){
          expect(inspectedClientRoutes.has(area),`Client route evidence missing: ${area}`).toBe(true);
        }
        expect(captures.some((item)=>item.role==='client'&&item.state==='authenticated-progress'),
          'Client Progreso must retain its own authenticated screenshot').toBe(true);
        expect(clientRouteAudits.map(item=>item.area),
          'U24 requires exactly nine real read-only authenticated route-body assertions')
          .toEqual(CLIENT_SIGNATURE_U24_AREAS);
      }

      await Promise.all(avatarChecks);
      expect(blocked,'Visual evidence attempted a business mutation or foreign request').toEqual([]);
      expect(unexpectedFailures).toEqual([]);
      expect(unexpectedQaResourceErrors(consoleErrors,missingAvatar.length)).toEqual([]);
      expect(pageErrors).toEqual([]);
    }finally{
      await context.close().catch(()=>{});
    }
  }

  const evidence={
    schema:'iberfit.rc64.authenticated-visual-evidence.v3',
    source:'current-source-intercepted-at-canary-origin',
    projectRef:QA_PROJECT_REF,
    project:safeSlug(testInfo.project.name),
    mode:'authenticated-readonly-visual',
    mutationsPerformed:false,
    businessMutationsPerformed:false,
    authMutationPerformed:false,
    credentialsPersisted:false,
    screenshotsContainSyntheticQaSurface:true,
    captures,
    signatureU24:{
      schema:'iberfit.signature.client-authenticated-route-smoke.v1',
      completed:clientRouteAudits.length===CLIENT_SIGNATURE_U24_AREAS.length,
      routeAudits:clientRouteAudits,
      excludedFromAcceptance:[
        'write-success','write-error','offline','session-expired',
        'multi-device-conflict','populated-vs-empty-data-contrast',
      ],
      fullFunctionalAcceptance:false,
    },
    admin:{captured:false,reason:'privileged-multiapp-auth-covered-by-fail-closed-contract-gate'},
  };
  await writeFile(`${OUT_DIR}/${safeSlug(testInfo.project.name)}.json`,`${JSON.stringify(evidence,null,2)}\n`,'utf8');
});