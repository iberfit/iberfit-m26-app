import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {
  CANARY_ORIGIN,QA_PROJECT_REF,SUPABASE_ORIGIN,
  installCurrentSourceQaNetworkPolicy,
} from './secure-current-source-auth.mjs';

// Coach's authenticated current-source QA browser remains read-only.
// It uses the synthetic Coach credentials, never a service-role secret.
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

test('M43 authenticated Coach navigates real planning and session workspace with usable responsive controls',async({page,context},testInfo)=>{
  const required=['M26_PROJECT_REF','M26_QA_ONLY','M26_SUPABASE_URL',
    'M26_SUPABASE_PUBLISHABLE_KEY','M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD'];
  for(const name of required)expect(process.env[name],name+' must be provided').toBeTruthy();
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(process.env.M26_QA_ONLY).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(process.env.M26_SUPABASE_PUBLISHABLE_KEY).not.toMatch(/service[_-]?role|supabase_secret/iu);

  const errors=[],blocked=[];
  await installCurrentSourceQaNetworkPolicy(context,{
    readOnlyRpcs:READ_ONLY_RPCS,onBlocked:label=>blocked.push(label),
  });
  page.on('pageerror',error=>errors.push(String(error.message||'PAGE_ERROR').slice(0,180)));
  await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:25_000});
  await page.getByRole('textbox',{name:'Correo',exact:true}).fill(process.env.M26_QA_COACH_EMAIL);
  await page.locator('#m26-login-password').fill(process.env.M26_QA_COACH_PASSWORD);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.locator('.m26-shell[data-m26-role="coach"]')).toBeVisible({timeout:35_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:20_000});
  const welcome=page.locator('[data-m26-client-guided-welcome]');
  if(await welcome.isVisible().catch(()=>false)){
    const pause=page.locator('[data-m26-client-guided-welcome-pause]').first();
    if(await pause.count())await pause.click();
  }
  for(const selector of ['[data-m26-guided-tour-close]:visible','[data-m26-client-context-guide-close]:visible']){
    const close=page.locator(selector).first();
    if(await close.count())await close.click();
  }
  const directory=join('recovery','m43-qa','browser');
  await mkdir(directory,{recursive:true});

  const sessions=page.locator('[data-m26-area="sesion"]:visible').first();
  await expect(sessions).toBeVisible({timeout:12_000});
  await sessions.click();
  await expect(page.locator('[data-m27-session-surface="sessions"]')).toBeVisible({timeout:12_000});
  await expect(page.getByRole('heading',{name:'Preparación y ejecución',exact:true})).toBeVisible();
  await page.screenshot({path:join(directory,`${testInfo.project.name}-coach-sessions.png`),fullPage:true});

  const planning=page.locator('[data-m26-area="planificacion"]:visible').first();
  await expect(planning).toBeVisible({timeout:12_000});
  await planning.click();
  await expect(page.locator('.m26-route').first()).toBeVisible();
  await page.screenshot({path:join(directory,`${testInfo.project.name}-coach-planning.png`),fullPage:true});

  const geometry=await page.evaluate(()=>({
    width:document.documentElement.clientWidth,
    scrollWidth:document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth,'Coach shell must not overflow horizontally').toBeLessThanOrEqual(geometry.width+2);
  expect(errors,'No uncaught Coach runtime errors').toEqual([]);
  expect(blocked.filter(x=>/\/rpc\/(?:iberfit_execute_command_v26|iberfit_command_preflight_v26)|\/rest\/v1\/(?:domain_entities_v26|sessions|training_cycles)/.test(x)),
    'Read-only Coach browser must not attempt data mutations').toEqual([]);
});
