import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  CANARY_ORIGIN,QA_PROJECT_REF,SUPABASE_ORIGIN,
  installCurrentSourceQaNetworkPolicy,qaRequestLabel,
} from './secure-current-source-auth.mjs';

// Read-only *real* Chromium QA contract. All app bytes are served from this
// exact PR checkout, never from a possibly older live Canary deploy.
// No server writes, UI start, fake acknowledgment or cross-owner browser storage.
const EMAIL_A='qa.rc74.client-a@iberfit.cl';
const EMAIL_B='qa.rc74.client-b@iberfit.cl';
const READS=new Set([
  'iberfit_bootstrap_v26','iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13',
  'iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d',
  'iberfit_communication_bootstrap_v14','m26_backend_bootstrap_v43',
  'm26_wearable_bootstrap_v44','iberfit_exercise_catalog_public_v1',
  'iberfit_exercise_measurement_profiles_public_v1',
  'iberfit_exercise_media_manifest_v1',
  'iberfit_occurrence_api_u60_v1','iberfit_occurrence_detail_v1',
]);
function environment(){
  for(const k of ['M26_PROJECT_REF','M26_QA_ONLY','M26_SUPABASE_URL',
    'M26_SUPABASE_PUBLISHABLE_KEY','M26_QA_CLIENT_A_EMAIL',
    'M26_QA_CLIENT_A_PASSWORD','M26_QA_CLIENT_B_EMAIL',
    'M26_QA_CLIENT_B_PASSWORD'])expect(process.env[k],k).toBeTruthy();
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(process.env.M26_QA_ONLY).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(process.env.M26_QA_CLIENT_A_EMAIL.toLowerCase()).toBe(EMAIL_A);
  expect(process.env.M26_QA_CLIENT_B_EMAIL.toLowerCase()).toBe(EMAIL_B);
  expect(process.env.M26_SUPABASE_PUBLISHABLE_KEY).not.toMatch(/service[_-]?role|sb_secret_/iu);
}
async function sealNetwork(context){
  const blocked=[],failedWrites=[],httpFailures=[];
  await installCurrentSourceQaNetworkPolicy(context,{
    readOnlyRpcs:READS,
    onBlocked:label=>blocked.push(label),
  });
  context.on('request',request=>{
    const label=qaRequestLabel(request);
    if(/\/(?:rpc\/iberfit_execute_command_v26|rpc\/iberfit_command_preflight_v26)/u.test(label))
      failedWrites.push(label);
  });
  context.on('response',response=>{
    try{
      if(new URL(response.url()).origin!==SUPABASE_ORIGIN)return;
      if(response.status()>=500)httpFailures.push(response.status());
    }catch{}
  });
  return {blocked,failedWrites,httpFailures};
}
async function login(page,label){
  const suffix=label==='A'?'A':'B';
  await page.goto(CANARY_ORIGIN+'/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.getByRole('textbox',{name:'Correo',exact:true})
    .fill(process.env['M26_QA_CLIENT_'+suffix+'_EMAIL']);
  await page.locator('#m26-login-password')
    .fill(process.env['M26_QA_CLIENT_'+suffix+'_PASSWORD']);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.locator('.m26-shell[data-m26-role="client"]')).toBeVisible({timeout:45000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:20000});
  const guide=page.locator('[data-m26-client-guided-welcome-pause]:visible').first();
  if(await guide.count())await guide.click();
  const tour=page.locator('[data-m26-guided-tour-close]:visible').first();
  if(await tour.count())await tour.click();
  const context=page.locator('[data-m26-client-context-guide-close]:visible').first();
  if(await context.count())await context.click();
  const session=page.locator('[data-m26-area="sesion"]:visible').first();
  await expect(session).toBeVisible({timeout:15000});
  await session.click();
  await expect(page.locator('[data-m26-controllers="ready"]')).toHaveCount(1,{timeout:25000});
  const dated=page.locator('[data-m27-session-surface="sessions"] [data-u60-panel]');
  await expect(dated).toHaveCount(1,{timeout:15000});
  await expect(dated).toBeVisible();
  await expect(dated).toHaveAttribute('data-u60-qa-only','true');
  await expect(page.locator('.m26-client-route-shell [data-u60-panel]')).toHaveCount(1);
  await expect(page.locator('.m26-client-bottom-nav [data-u60-panel]')).toHaveCount(0);
}
async function calendar(page){
  await page.locator('[data-iberdates-action="u60-calendar"]').click();
  await expect(page.locator('[data-u60-panel] [data-iberdates-action="u60-open"]').first())
    .toBeVisible({timeout:20000});
  return page.locator('[data-u60-panel] [data-iberdates-action="u60-open"]')
    .evaluateAll(nodes=>nodes.map(n=>String(n.dataset.u60Id||'')).filter(Boolean));
}
test('QA U60 client real private calendar and player, no writes',async({page,context},info)=>{
    const width=info.project.use.viewport?.width;
    expect([1440,1024,390,320]).toContain(width);
    environment();
    const proof=await sealNetwork(context);
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e?.name||'PageError').slice(0,70)));
    await login(page,'A');
    await expect(page.locator('[data-m27-session-surface="sessions"] [data-u60-panel]')).toHaveCount(1);
    const rows=await calendar(page);
    expect(rows.length).toBeGreaterThan(0);
    const password=page.locator('[name="u60Phrase"]');
    await expect(password).toBeVisible();
    await password.fill('IBERFIT-QA-readonly-temporary-key');
    await page.locator('[data-iberdates-action="u60-unlock"]').click();
    await expect(page.getByText('Recuperación cifrada desbloqueada para esta cuenta y dispositivo.')).toBeVisible();
    const open=page.locator('[data-iberdates-action="u60-open"]').first();
    await open.scrollIntoViewIfNeeded();
    await open.click();
    await expect(page.locator('[data-u60-workout]')).toBeVisible({timeout:25000});
    await expect(page.locator('[data-u60-workout]')).toContainText('Fecha independiente');
    // A private read never starts an execution; the start command is not invoked.
    const stateText=await page.locator('[data-u60-workout]').innerText();
    expect(/Preparada|Entrenamiento en curso|Finalizado y confirmado|Fecha cancelada/u.test(stateText)).toBe(true);
    const layout=await page.evaluate(()=>({
      width:document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth,
      panel:document.querySelector('[data-u60-panel]')?.getBoundingClientRect().toJSON()||null,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width+2);
    expect(layout.panel?.left).toBeGreaterThanOrEqual(-2);
    expect(layout.panel?.right).toBeLessThanOrEqual(layout.width+2);
    expect(proof.failedWrites,'No canonical writes').toEqual([]);
    expect(proof.httpFailures,'No server 500').toEqual([]);
    expect(errors,'No browser exceptions').toEqual([]);
    const out=join('recovery','u60-qa-browser-readonly');
    await mkdir(out,{recursive:true});
    await writeFile(join(out,'u60-'+width+'-readonly.json'),JSON.stringify({
      schema:'iberfit.m1.u60.qa.browser.readonly.v1',width,
      occurrenceRowsPresent:rows.length>0,privateDetailRendered:true,
      noServerWrites:true,noServer500:true,unhandledErrors:errors.length,
      sourceSha:process.env.GITHUB_SHA||'local',
    })+'\n',{mode:0o600});
});
test('QA U60 Client B never inherits Client A rendered occurrence cards',async({page,context,browser},info)=>{
  test.skip(info.project.name!=='u60-readonly-desktop','Cross-owner pair once on desktop');
  environment();
  const a=await sealNetwork(context);
  await login(page,'A');
  const idsA=new Set(await calendar(page));
  expect(idsA.size).toBeGreaterThan(0);
  const ctxB=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  try{
    const b=await sealNetwork(ctxB);
    const other=await ctxB.newPage();
    await login(other,'B');
    await other.locator('[data-iberdates-action="u60-calendar"]').click();
    await expect(other.locator('[data-u60-panel]')).toContainText('Calendario confirmado:',{timeout:20000});
    const idsB=await other.locator('[data-u60-panel] [data-iberdates-action="u60-open"]')
      .evaluateAll(nodes=>nodes.map(n=>String(n.dataset.u60Id||'')).filter(Boolean));
    expect(idsB.filter(id=>idsA.has(id)),'No cross-owner calendar IDs').toEqual([]);
    expect(a.failedWrites).toEqual([]);
    expect(b.failedWrites).toEqual([]);
    expect(b.httpFailures).toEqual([]);
  }finally{await ctxB.close();}
});
