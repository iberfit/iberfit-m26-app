import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {
  CANARY_ORIGIN,QA_PROJECT_REF,SUPABASE_ORIGIN,
  installCurrentSourceQaNetworkPolicy,
} from './secure-current-source-auth.mjs';

// This checks the current-source client UI over the SAME real QA records
// created by the preceding authenticated Coach->Client RPC acceptance job.
// This is read-only; it cannot create, start or modify training.
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
const LIVE_MARKER='IBERFIT QA M43 · multideporte';
const SECRET_MARKER='IBERFIT QA M43 · ciclo no publicado';

test('M43 authenticated Cliente sees published multideporte and completed history, never unpublished cycles',async({page,context},testInfo)=>{
  const required=['M26_PROJECT_REF','M26_QA_ONLY','M26_SUPABASE_URL',
    'M26_SUPABASE_PUBLISHABLE_KEY','M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD'];
  for(const name of required)expect(process.env[name],name+' must be provided').toBeTruthy();
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(process.env.M26_QA_ONLY).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(process.env.M26_SUPABASE_PUBLISHABLE_KEY).not.toMatch(/service[_-]?role|supabase_secret/iu);

  const blocked=[];
  const errors=[];
  await installCurrentSourceQaNetworkPolicy(context,{
    readOnlyRpcs:READ_ONLY_RPCS,
    onBlocked:label=>blocked.push(label),
  });
  page.on('pageerror',e=>errors.push(String(e.message||'PAGE_ERROR').slice(0,180)));
  await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:25_000});
  await page.getByRole('textbox',{name:'Correo',exact:true}).fill(process.env.M26_QA_CLIENT_A_EMAIL);
  await page.locator('#m26-login-password').fill(process.env.M26_QA_CLIENT_A_PASSWORD);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  const shell=page.locator('.m26-shell[data-m26-role="client"]');
  await expect(shell).toBeVisible({timeout:35_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:20_000});

  // Dismiss optional onboarding without weakening role-specific navigation.
  const welcome=page.locator('[data-m26-client-guided-welcome]');
  if(await welcome.isVisible().catch(()=>false)){
    const pause=page.locator('[data-m26-client-guided-welcome-pause]').first();
    if(await pause.count())await pause.click();
  }
  const tourClose=page.locator('[data-m26-guided-tour-close]:visible').first();
  if(await tourClose.count())await tourClose.click();
  const contextClose=page.locator('[data-m26-client-context-guide-close]:visible').first();
  if(await contextClose.count())await contextClose.click();

  // Mobile, tablet and desktop all expose the same domain, with genuinely
  // rendered client projections rather than synthetic fixture markup.
  const sessionLink=page.locator('[data-m26-area="sesion"]:visible').first();
  await expect(sessionLink).toBeVisible({timeout:12_000});
  await sessionLink.click();
  // A genuine navigation must survive the full post-login progressive mount.
  // Previously the first-use guide sent the Client back to Today
  // after Sessions had rendered, leaving a transient false success.
  await expect(page.locator('[data-m26-controllers="ready"]'),
    'Client navigation must persist after progressive controller mount').toHaveCount(1,{timeout:20_000});
  await expect(page.locator('[data-m27-session-surface="sessions"]')).toBeVisible();
  // The currently shipped authenticated Client route is RC39, not the
  // legacy M26 publication route. Never certify a detached mock DOM.
  await expect(page.locator('[data-m27-session-surface="sessions"]')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Tu entrenamiento',exact:true})).toBeVisible();
  const publishedCards=page.locator('[data-rc39-session]');
  await expect(publishedCards.filter({hasText:LIVE_MARKER}).first()).toBeVisible({timeout:12_000});
  const history=page.locator('[data-m43-session-history]');
  await expect(history).toBeVisible();
  await expect(history.getByRole('heading',{name:'Sesiones realizadas'})).toBeVisible();
  await expect(history.locator('[data-m43-completed-session]').first()).toBeVisible();
  await expect(history).toContainText(LIVE_MARKER);
  // Keep synthetic QA browser evidence even on PASS. testInfo.attach alone
  // is not persisted by the line reporter used in GitHub Actions.
  const evidenceDirectory=join('recovery','m43-qa','browser');
  await mkdir(evidenceDirectory,{recursive:true});
  await page.screenshot({path:join(evidenceDirectory,`${testInfo.project.name}-sessions.png`),fullPage:true});
  const tagRects=await publishedCards.filter({hasText:LIVE_MARKER}).first()
    .locator('.m26-session-experience__capability')
    .evaluateAll(nodes=>nodes.map(node=>{
      const rect=node.getBoundingClientRect();
      return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
    }));
  for(let i=0;i<tagRects.length;i++)for(let j=i+1;j<tagRects.length;j++){
    const a=tagRects[i],b=tagRects[j];
    const dx=Math.min(a.right,b.right)-Math.max(a.left,b.left);
    const dy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    expect(dx<=1||dy<=1,'Capability pills must not overlap').toBe(true);
  }
  await expect(page.getByText(SECRET_MARKER,{exact:false})).toHaveCount(0);
  // The real QA acceptance already completed this same published session.
  // Its confirmed history must also render after a new browser login.
  await expect(page.getByText('IBERFIT QA M43 · multideporte',{exact:false}).first()).toBeVisible();
  await expect(page.locator('.m26-route').first()).toBeVisible();

  const planLink=page.locator('[data-m26-area="planificacion"]:visible').first();
  await expect(planLink).toBeVisible();
  await planLink.click();
  const planning=page.locator('[data-m27-session-surface="planning"]');
  await expect(planning).toBeVisible();
  // SIGNATURE 360 labels the current live heading "Tu planificación"; a
  // historic "Planificación ·..." locator failed despite valid Client content.
  // Keep the check scoped to the real route, never a detached fixture or shell.
  await expect(planning.getByRole('heading',{name:'Tu planificación',exact:true})).toBeVisible();
  await expect(planning.locator('article').filter({hasText:LIVE_MARKER}).first()).toBeVisible();
  await expect(page.getByText(SECRET_MARKER,{exact:false})).toHaveCount(0);
  await page.screenshot({path:join(evidenceDirectory,`${testInfo.project.name}-planning.png`),fullPage:true});
  const geometry=await page.evaluate(()=>({
    width:document.documentElement.clientWidth,
    scrollWidth:document.documentElement.scrollWidth,
    active:document.activeElement?.tagName,
  }));
  expect(geometry.scrollWidth,'No horizontal app overflow').toBeLessThanOrEqual(geometry.width+2);
  expect(errors,'No uncaught application errors').toEqual([]);
  expect(blocked.filter(x=>/\/rpc\/(?:iberfit_execute_command_v26|iberfit_command_preflight_v26)|\/rest\/v1\/(?:domain_entities_v26|sessions|training_cycles)/.test(x)),
    'Read-only browser must not attempt mutations').toEqual([]);
  await testInfo.attach('m43-client-ui-screenshot',{
    body:await page.screenshot({fullPage:false}),contentType:'image/png',
  });
});