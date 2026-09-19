import {mkdir} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {
  CANARY_ORIGIN,
  QA_PROJECT_REF,
  SUPABASE_ORIGIN,
  installCurrentSourceQaNetworkPolicy,
} from './secure-current-source-auth.mjs';

const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
];
const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26',
  'iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13',
  'iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d',
  'iberfit_communication_bootstrap_v14',
  'iberfit_web_push_status_v1',
  'm26_backend_bootstrap_v43',
  'm26_wearable_bootstrap_v44',
  'iberfit_exercise_catalog_public_v1',
  'iberfit_exercise_media_manifest_v1',
]);

function slug(value){return String(value||'unknown').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,80)||'unknown';}
async function expectJourneyState(page,{area,title,state}){
  const canonical=page.locator(`[data-m26-area="${area}"][aria-current="page"]`);
  await expect.poll(()=>canonical.count(),{message:`Genie must set canonical shell area ${area}`,timeout:8_000}).toBeGreaterThan(0);
  const routeSurface=area==='mensajes'
    ?page.locator('[data-client-bottom-nav-route="communication"],[data-client-bottom-nav-route="communication-unavailable"]').first()
    :page.locator(`[data-client-bottom-nav-route="${area}"]`).first();
  await expect(routeSurface,`Genie must render the visible route surface for ${area}`).toBeVisible({timeout:8_000});

  const welcome=page.locator('[data-m26-client-guided-welcome]');
  await expect(welcome).toBeVisible({timeout:8_000});
  await expect(welcome.locator('#m26-client-guided-welcome-title')).toHaveText(title,{timeout:5_000});
  const presence=page.locator('[data-m26-client-guided-welcome-presence]');
  await expect(presence).toHaveAttribute('data-m26-client-guide-state',state);
  await expect(presence.locator('[data-m26-client-genie]'),'Guided welcome must render the vector Genie').toHaveCount(1);
  await expect(presence.locator('img'),'Genie presence must not fall back to a raster mascot').toHaveCount(0);
  const presenceBox=await presence.boundingBox();
  const mobile=Number(page.viewportSize()?.width||0)<=690;
  expect(presenceBox?.height||0).toBeGreaterThanOrEqual(mobile?110:120);
  expect(presenceBox?.height||0).toBeLessThanOrEqual(mobile?150:180);
  await expect(welcome).toHaveAttribute('data-m26-client-guide-side',/^(left|right)$/u);
  await expect(page.locator('[data-m26-client-context-guide]')).toHaveCount(0);
  await expect(page.locator('[data-m26-guided-tour]')).toHaveCount(0);

  if(mobile){
    const dialogBox=await welcome.boundingBox();
    const nav=page.locator('.m26-client-bottom-nav:visible').first();
    await expect(nav).toBeVisible();
    const navBox=await nav.boundingBox();
    const dialogBottom=(dialogBox?.y??Infinity)+(dialogBox?.height??0);
    expect(dialogBottom,'Genie dialogue must finish above fixed Client navigation').toBeLessThanOrEqual((navBox?.y??0)-4);
  }
}

test('Client Genie guides a Client-only first run, can pause and completes its journey',async({browser},testInfo)=>{
  const missing=REQUIRED.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_QA_CLIENT_B_EMAIL||'').toLowerCase()).toBe('qa.rc74.client-b@iberfit.cl');

  const projectUse=testInfo.project.use||{};
  const context=await browser.newContext({
    baseURL:CANARY_ORIGIN,
    locale:'es-ES',
    timezoneId:'America/Santiago',
    serviceWorkers:'block',
    viewport:projectUse.viewport,
    hasTouch:Boolean(projectUse.hasTouch),
    isMobile:Boolean(projectUse.isMobile),
  });
  const blocked=[];
  await installCurrentSourceQaNetworkPolicy(context,{
    readOnlyRpcs:READ_ONLY_RPCS,
    onBlocked:(label)=>blocked.push(label),
  });
  const page=await context.newPage();
  const consoleErrors=[];
  const pageErrors=[];
  page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,400));});
  page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,400)));

  try{
    const navigation=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:20_000});
    expect(navigation?.ok()).toBeTruthy();
    await page.getByRole('textbox',{name:'Correo',exact:true}).fill(process.env.M26_QA_CLIENT_B_EMAIL);
    await page.locator('#m26-login-password').fill(process.env.M26_QA_CLIENT_B_PASSWORD);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();

    const shell=page.locator('.m26-shell[data-m26-role="client"]');
    await expect(shell,'Client-only first run must enter Client without privileged MFA').toBeVisible({timeout:25_000});
    await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});
    await expect(page.locator('[data-auth-action="mfa-continue-webauthn"]')).toHaveCount(0);
    await expect(page.locator('.m26-role-choice[role="dialog"]')).toHaveCount(0);

    await expectJourneyState(page,{area:'hoy',title:'Hola. Antes de dejarte a tu aire…',state:'idle'});
    await page.locator('[data-m26-client-guided-welcome-pause]').first().click();
    await expect(page.locator('[data-m26-client-guided-welcome]')).toHaveCount(0,{timeout:5_000});
    await expect(shell).not.toHaveAttribute('data-m26-client-guided-welcome-active','true');

    const manualGuide=page.locator('[data-m26-client-context-guide-open]').first();
    await expect(manualGuide).toHaveCount(1);
    await manualGuide.evaluate((node)=>node.click());
    await expectJourneyState(page,{area:'hoy',title:'Hola. Antes de dejarte a tu aire…',state:'idle'});

    await mkdir('recovery/client-genie-welcome',{recursive:true});
    await page.screenshot({
      path:`recovery/client-genie-welcome/client-genie-welcome-${slug(testInfo.project.name)}.png`,
      fullPage:true,animations:'disabled',caret:'hide',
    });

    const journey=[
      {area:'planificacion',title:'Esta es tu hoja de ruta.',state:'pointing'},
      {area:'sesion',title:'Y cuando toque entrenar, vengo contigo.',state:'pointing'},
      {area:'progreso',title:'Esto es lo que va cambiando.',state:'pointing'},
      {area:'mensajes',title:'Y si necesitas hablar, aquí.',state:'pointing'},
      {area:'hoy',title:'Ya está. Te dejo aquí.',state:'success'},
    ];
    for(const step of journey){
      await page.locator('[data-m26-client-guided-welcome-next]').click({timeout:5_000});
      await expectJourneyState(page,step);
    }

    await expect(page.locator('.m26-client-guided-welcome-actions [data-m26-client-guided-welcome-pause]')).toHaveCount(0);
    await expect(page.locator('[data-m26-client-guided-welcome-next]')).toBeFocused();
    await page.screenshot({
      path:`recovery/client-genie-welcome/client-genie-finish-${slug(testInfo.project.name)}.png`,
      fullPage:true,animations:'disabled',caret:'hide',
    });
    await page.locator('[data-m26-client-guided-welcome-next]').click({timeout:5_000});
    await expect(page.locator('[data-m26-client-guided-welcome]')).toHaveCount(0,{timeout:5_000});
    await expect.poll(()=>page.locator('[data-m26-area="hoy"][aria-current="page"]').count(),{timeout:5_000}).toBeGreaterThan(0);
    await expect(page.locator('[data-client-bottom-nav-route="hoy"]').first()).toBeVisible({timeout:5_000});
    await expect(shell).not.toHaveAttribute('data-m26-client-guided-welcome-active','true');

    await manualGuide.evaluate((node)=>node.click());
    await expect(page.locator('[data-m26-client-context-guide]')).toBeVisible({timeout:5_000});
    await expect(page.locator('[data-m26-client-guided-welcome]')).toHaveCount(0);

    expect(blocked,'Guided welcome attempted a business mutation or foreign request').toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }finally{
    await context.close().catch(()=>{});
  }
});
