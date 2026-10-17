import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
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
      await page.getByRole('button',{name:'Entrar',exact:true}).click();

      if(account.role==='coach'){
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
              childElements:label.childElementCount,
            };
          }));
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

        captures.push(await capture(page,{account,project:testInfo.project.name,state:'authenticated-client-hoy',suffix:'hoy'}));


        // SIGNATURE 360 2/5: certify the *actual RC39 Client Plan* and its
        // confirmed-appointment panel in each authenticated QA viewport.
        const planNav=page.locator('[data-m26-area="planificacion"]:visible').first();
        await expect(planNav).toBeVisible({timeout:5_000});
        await planNav.click();
        await expect(page.locator('.m26-rc39-planning')).toBeVisible({timeout:10_000});
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
        captures.push(await capture(page,{account,project:testInfo.project.name,state:'authenticated-client-plan',suffix:'plan'}));

        const progressNav=page.locator('[data-m26-area="progreso"]:visible').first();
        await expect(progressNav).toBeVisible({timeout:5_000});
        await progressNav.click();
        await expect(page.locator('[data-client-progress-stage]')).toBeVisible({timeout:10_000});
        await expect(page.locator('[data-m27-cliente-360]')).toHaveCount(0);
        await expect(page.locator('[data-m26-area="progreso"][aria-current="page"]:visible').first()).toBeVisible({timeout:5_000});
        const exerciseAnalyticsCount=await page.locator('[data-m26-exercise-analytics="v2"]').count();
        captures.push({...(await capture(page,{account,project:testInfo.project.name,state:'authenticated-progress',suffix:'progress'})),exerciseAnalyticsCount});
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
    admin:{captured:false,reason:'privileged-multiapp-auth-covered-by-fail-closed-contract-gate'},
  };
  await writeFile(`${OUT_DIR}/${safeSlug(testInfo.project.name)}.json`,`${JSON.stringify(evidence,null,2)}\n`,'utf8');
});