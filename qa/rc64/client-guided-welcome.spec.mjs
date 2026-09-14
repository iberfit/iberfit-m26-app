import {mkdir} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const LOCAL_ORIGIN='http://127.0.0.1:4196';
const PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const SUPABASE_ORIGIN=`https://${PROJECT_REF}.supabase.co`;
const ASSURANCE_PATH='/rest/v1/rpc/iberfit_privileged_assurance_context_v65d';

const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
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
  'iberfit_exercise_media_manifest_v1',
]);

function allowedExternalRequest(request){
  const url=new URL(request.url());
  const method=request.method().toUpperCase();
  if(url.origin!==SUPABASE_ORIGIN)return false;
  if(method==='POST'&&url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password')return true;
  if(method==='GET'&&url.pathname==='/auth/v1/user')return true;
  if(method==='GET'&&url.pathname==='/rest/v1/domain_command_registry_v26')return true;
  if(method==='POST'&&url.pathname.startsWith('/rest/v1/rpc/')){
    return READ_ONLY_RPCS.has(url.pathname.slice('/rest/v1/rpc/'.length));
  }
  return false;
}

function slug(value){
  return String(value||'unknown').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,80)||'unknown';
}

async function expectJourneyState(page,{area,title,state}){
  const canonical=page.locator(`[data-m26-area="${area}"][aria-current="page"]`);
  await expect.poll(
    ()=>canonical.count(),
    {message:`Genie must set canonical shell area ${area}`,timeout:8_000},
  ).toBeGreaterThan(0);

  const routeSurface=area==='mensajes'
    ?page.locator('[data-client-bottom-nav-route="communication"],[data-client-bottom-nav-route="communication-unavailable"]').first()
    :page.locator(`[data-client-bottom-nav-route="${area}"]`).first();

  await expect(
    routeSurface,
    `Genie must render the visible route surface for ${area}`,
  ).toBeVisible({timeout:8_000});

  const welcome=page.locator('[data-m26-client-guided-welcome]');
  await expect(welcome).toBeVisible({timeout:8_000});
  await expect(welcome.locator('#m26-client-guided-welcome-title')).toHaveText(title,{timeout:5_000});
  const presence=page.locator('[data-m26-client-guided-welcome-presence]');
  await expect(presence).toHaveAttribute('data-m26-client-guide-state',state);
  await expect(presence.locator('[data-m26-client-genie]'),'Guided welcome must render the vector Genie rather than the old logo placeholder').toHaveCount(1);
  await expect(presence.locator('img'),'Genie presence must not fall back to a raster mascot image').toHaveCount(0);
  const presenceBox=await presence.boundingBox();
  expect(presenceBox?.height||0,'Genie must remain legible at UI scale').toBeGreaterThanOrEqual(108);
  expect(presenceBox?.height||0,'Genie must remain a controlled guide, not a screen-dominating mascot').toBeLessThanOrEqual(154);
  await expect(
    page.locator('[data-m26-client-guided-welcome]'),
    'Genie guidance should read as a conversational speech bubble',
  ).toHaveAttribute('data-m26-client-guide-side',/^(left|right)$/u);
  await expect(page.locator('[data-m26-client-context-guide]'),'Contextual help must stay silent while the first-run journey owns the experience').toHaveCount(0);
  await expect(page.locator('[data-m26-guided-tour]'),'Legacy numbered tour must never compete with the Client Genie journey').toHaveCount(0);
}

test('Client Genie owns first-run navigation, can pause/resume, returns to Today and hands back to contextual help',async({browser},testInfo)=>{
  const missing=REQUIRED.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);

  const context=await browser.newContext({
    baseURL:LOCAL_ORIGIN,
    locale:'es-ES',
    timezoneId:'America/Santiago',
    serviceWorkers:'block',
  });
  const blocked=[];
  await context.route('**/*',async(route)=>{
    const request=route.request();
    let url;
    try{url=new URL(request.url());}catch{blocked.push('INVALID_URL');await route.abort('blockedbyclient');return;}
    if(url.origin===LOCAL_ORIGIN||allowedExternalRequest(request)){await route.continue();return;}
    blocked.push(`${request.method()} ${url.origin} ${url.pathname}`);
    await route.abort('blockedbyclient');
  });

  const page=await context.newPage();
  const consoleErrors=[];
  const pageErrors=[];
  page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,400));});
  page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,400)));

  try{
    const navigation=await page.goto('/',{waitUntil:'networkidle',timeout:15_000});
    expect(navigation?.ok()).toBeTruthy();
    await page.getByRole('textbox',{name:'Correo',exact:true}).fill(process.env.M26_QA_CLIENT_A_EMAIL);
    await page.locator('#m26-login-password').fill(process.env.M26_QA_CLIENT_A_PASSWORD);

    const assurancePromise=page.waitForResponse((response)=>{
      try{
        const url=new URL(response.url());
        return url.origin===SUPABASE_ORIGIN&&url.pathname===ASSURANCE_PATH;
      }catch{return false;}
    },{timeout:30_000});

    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    const assurance=await assurancePromise;
    expect(assurance.status()).toBe(200);

    const shell=page.locator('.m26-shell[data-m26-role="client"]');
    await expect(shell).toHaveCount(1,{timeout:25_000});
    await expect(shell).toBeVisible({timeout:5_000});
    await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});

    await expectJourneyState(page,{
      area:'hoy',
      title:'Hola. Antes de dejarte a tu aire…',
      state:'idle',
    });

    // Pause is a real escape hatch, not a dismissal of the feature.
    await page.locator('[data-m26-client-guided-welcome-pause]').first().click();
    await expect(page.locator('[data-m26-client-guided-welcome]')).toHaveCount(0,{timeout:5_000});
    await expect(shell).not.toHaveAttribute('data-m26-client-guided-welcome-active','true');

    // Calling Guide resumes the same journey while it is incomplete.
    const manualGuide=page.locator('[data-m26-client-context-guide-open]').first();
    await expect(manualGuide).toHaveCount(1);
    await manualGuide.evaluate((node)=>node.click());
    await expectJourneyState(page,{
      area:'hoy',
      title:'Hola. Antes de dejarte a tu aire…',
      state:'idle',
    });

    await mkdir('recovery/client-genie-welcome',{recursive:true});
    await page.screenshot({
      path:`recovery/client-genie-welcome/client-genie-welcome-${slug(testInfo.project.name)}.png`,
      fullPage:true,
      animations:'disabled',
      caret:'hide',
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

    await expect(
      page.locator('.m26-client-guided-welcome-actions [data-m26-client-guided-welcome-pause]'),
      'Finish should not offer a redundant “later” action',
    ).toHaveCount(0);
    await expect(
      page.locator('[data-m26-client-guided-welcome-next]'),
      'Finish should place keyboard focus on the primary completion action',
    ).toBeFocused();

    await page.screenshot({
      path:`recovery/client-genie-welcome/client-genie-finish-${slug(testInfo.project.name)}.png`,
      fullPage:true,
      animations:'disabled',
      caret:'hide',
    });

    await page.locator('[data-m26-client-guided-welcome-next]').click({timeout:5_000});
    await expect(page.locator('[data-m26-client-guided-welcome]')).toHaveCount(0,{timeout:5_000});
    await expect.poll(
      ()=>page.locator('[data-m26-area="hoy"][aria-current="page"]').count(),
      {message:'Completion must leave the canonical shell on Today',timeout:5_000},
    ).toBeGreaterThan(0);
    await expect(page.locator('[data-client-bottom-nav-route="hoy"]').first()).toBeVisible({timeout:5_000});
    await expect(shell).not.toHaveAttribute('data-m26-client-guided-welcome-active','true');

    // After completion the same Guide control belongs to contextual help again.
    await manualGuide.evaluate((node)=>node.click());
    await expect(page.locator('[data-m26-client-context-guide]')).toBeVisible({timeout:5_000});
    await expect(page.locator('[data-m26-client-guided-welcome]')).toHaveCount(0);

    expect(blocked,'Guided welcome attempted a mutation or foreign request').toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }finally{
    await context.close().catch(()=>{});
  }
});
