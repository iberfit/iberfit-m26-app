import {test,expect} from '@playwright/test';
import {releaseQaSessionBeforeContextClose} from './qa-session-cleanup.mjs';
import {readFileSync} from 'node:fs';
import {
 CANARY_ORIGIN,QA_PROJECT_REF,SUPABASE_ORIGIN,
 installCurrentSourceQaNetworkPolicy,isQaScopedDatedSyntheticWrite,
} from './secure-current-source-auth.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const READS=new Set([
 'iberfit_bootstrap_v26','iberfit_authorized_application_roles_v13',
 'iberfit_appointment_change_requests_v13','iberfit_application_context_v14',
 'iberfit_privileged_assurance_context_v65d','iberfit_communication_bootstrap_v14',
 'm26_backend_bootstrap_v43','m26_wearable_bootstrap_v44',
 'iberfit_exercise_catalog_public_v1','iberfit_exercise_measurement_profiles_public_v1',
 'iberfit_exercise_media_manifest_v1','iberfit_occurrence_api_u60_v1',
 'iberfit_occurrence_detail_v1',
]);
function signedFixture(){
 for(const key of ['GITHUB_ACTIONS','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_SHA',
  'M26_PROJECT_REF','M26_QA_ONLY','M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD'])
  expect(process.env[key],key).toBeTruthy();
 expect(process.env.GITHUB_ACTIONS).toBe('true');
 expect(process.env.GITHUB_RUN_ATTEMPT).toBe('2');
 expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
 expect(process.env.M26_QA_ONLY).toBe('true');
 expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
 expect(process.env.M26_QA_CLIENT_A_EMAIL).toBe('qa.rc74.client-a@iberfit.cl');
 expect(process.env.M26_QA_CLIENT_B_EMAIL).toBe('qa.rc74.client-b@iberfit.cl');
 expect(process.env.M26_SUPABASE_PUBLISHABLE_KEY).not.toMatch(/service.?role|sb_secret/iu);
 const proof=JSON.parse(readFileSync('recovery/u71-qa-authenticated-workout/evidence.json','utf8'));
 expect(proof.schema).toBe('iberfit.u71.qa-authenticated-dated-e2e.v1');
 expect(proof.stage).toBe('prepare-browser');
 expect(proof.status).toBe('QA_BROWSER_FIXTURE_READY');
 expect(proof.project).toBe('QA');
 expect(proof.writesApplied).toBe(true);
 expect(proof.sha).toBe(process.env.GITHUB_SHA);
 expect(proof.runId).toBe(process.env.GITHUB_RUN_ID);
 for(const key of ['clientId','occurrenceId','futureOccurrenceId','sessionId'])
  expect(proof.fixture?.[key]).toMatch(UUID);
 expect(proof.fixture.occurrenceId).not.toBe(proof.fixture.futureOccurrenceId);
 const autonomous=process.env.M26_QA_U74_AUTONOMOUS_NO_APPOINTMENT==='true';
 expect(proof.appointmentless).toBe(autonomous);
 expect(proof.fixture.appointmentless).toBe(autonomous);
 expect(proof.fixture.stepsExpected).toBeGreaterThanOrEqual(1);
 expect(proof.fixture.stepsExpected).toBeLessThanOrEqual(40);
 return proof.fixture;
}
async function login(page,suffix){
 await page.goto(CANARY_ORIGIN+'/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.getByRole('textbox',{name:'Correo',exact:true}).fill(
  process.env['M26_QA_CLIENT_'+suffix+'_EMAIL']);
 await page.locator('#m26-login-password').fill(
  process.env['M26_QA_CLIENT_'+suffix+'_PASSWORD']);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.locator('.m26-shell[data-m26-role="client"]')).toBeVisible({timeout:45000});
 await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:25000});
 for(const selector of [
  '[data-m26-client-guided-welcome-pause]:visible',
  '[data-m26-guided-tour-close]:visible',
  '[data-m26-client-context-guide-close]:visible',
 ]){
  const node=page.locator(selector).first();
  if(await node.count())await node.click();
 }
 await page.locator('[data-m26-area="sesion"]:visible').first().click();
 await expect(page.locator('[data-m26-controllers="ready"]')).toHaveCount(1,{timeout:25000});
 await expect(page.locator('[data-u60-panel]')).toBeVisible({timeout:15000});
}
test.afterEach(async({page},testInfo)=>{
  const result=await releaseQaSessionBeforeContextClose(page);
  console.log('U74_QA_PAGE_AUTH_RELEASE='+result);
  if(testInfo.status==='passed')expect(['released','no-session']).toContain(result);
});
test('U74 real Client touch UI: signed date, pause, resume, each series, finish and cross-owner denial',async({page,context,browser})=>{
 test.setTimeout(420000);
 const f=signedFixture(),blocked=[],errors=[],serverFaults=[],writes=[],acks=[];
 let executionId=null,terminal=false;
 const allowQaSyntheticWrite=request=>{
  if(terminal||!isQaScopedDatedSyntheticWrite(request,f))return false;
  const command=request.postDataJSON().p_payload;
  if(command.type==='OCURRENCIA_INICIAR'){
   if(executionId!==null)return false;
   executionId=command.payload.executionId;
  }else if(executionId===null||executionId!==command.payload.executionId)return false;
  writes.push({type:command.type,operationId:command.operationId});
  if(command.type==='OCURRENCIA_COMPLETAR')terminal=true;
  return true;
 };
 await installCurrentSourceQaNetworkPolicy(context,{
  readOnlyRpcs:READS,allowQaSyntheticWrite,onBlocked:label=>blocked.push(label),
 });
 page.on('pageerror',error=>errors.push(String(error?.name||'PageError').slice(0,100)));
 page.on('response',async response=>{
  try{
   const url=new URL(response.url());
   if(url.origin!==SUPABASE_ORIGIN)return;
   if(response.status()>=500)serverFaults.push(String(response.status()));
   if(url.pathname==='/rest/v1/rpc/iberfit_occurrence_api_u60_v1'
    &&response.request().method()==='POST'){
    const sent=response.request().postDataJSON();
    if(sent?.p_action==='TRANSICION'&&sent?.p_payload?.entityId===f.occurrenceId){
     const body=await response.json();
     if(response.status()===200&&body?.kind==='ack')acks.push(sent.p_payload.type);
    }
   }
  }catch{}
 });
 await login(page,'A');
 const panel=page.locator('[data-u60-panel]');
 await expect(panel).toHaveAttribute('data-u60-qa-only','true');
 await panel.locator('[name="u60Phrase"]').fill(
  'IBERFIT-U74-SYNTHETIC-KEY-'+process.env.GITHUB_RUN_ID);
 await panel.locator('[data-iberdates-action="u60-unlock"]').click();
 await expect(panel).toContainText('Recuperación cifrada desbloqueada',{timeout:15000});
 await panel.locator('[data-iberdates-action="u60-calendar"]').click();
 const opener=panel.locator('[data-iberdates-action="u60-open"][data-u60-id="'+f.occurrenceId+'"]');
 await expect(opener,'only the signed date may be started').toHaveCount(1,{timeout:25000});
 await opener.scrollIntoViewIfNeeded();
 await opener.click();
 const player=panel.locator('[data-u60-workout]');
 await expect(player).toHaveAttribute('data-u60-phase','ready',{timeout:25000});
 await player.locator('[data-iberdates-action="u60-start"]').click();
 await expect(player).toHaveAttribute('data-u60-phase','active',{timeout:25000});
 await player.locator('[data-iberdates-action="u60-pause"]').click();
 await expect(player.locator('[data-iberdates-action="u60-resume"]')).toBeVisible({timeout:25000});
 await player.locator('[data-iberdates-action="u60-resume"]').click();
 await expect(player.locator('[data-iberdates-action="u60-record"]')).toBeVisible({timeout:25000});
 for(let i=0;i<f.stepsExpected;i++){
  const record=player.locator('[data-iberdates-action="u60-record"]');
  await expect(record,'each set needs its own real server ACK').toBeVisible({timeout:25000});
  await player.locator('[name="u60Reps"]').fill('8');
  await player.locator('[name="u60Load"]').fill('20');
  await player.locator('[name="u60Rpe"]').fill('7');
  await expect(record).toBeEnabled({timeout:25000});
  await record.click();
  // Playwright.click resolves before the async server CAS finishes. A
  // merely visible next button can still be busy and drop a second click.
  // Require the real progress ACK AND a settled UI after EACH observed set.
  await expect.poll(()=>acks.filter(x=>x==='OCURRENCIA_GUARDAR_PROGRESO').length,
    {timeout:30000}).toBe(i+1);
  await expect(panel).not.toHaveAttribute('aria-busy','true',{timeout:30000});
  if(i<f.stepsExpected-1){
   const next=player.locator('[data-iberdates-action="u60-record"]');
   await expect(next).toBeVisible({timeout:25000});
   await expect(next).toBeEnabled({timeout:25000});
  }
 }
 await expect(player.locator('[name="u60FinalRpe"]')).toBeVisible({timeout:25000});
 await player.locator('[name="u60FinalRpe"]').fill('7');
 await player.locator('[name="u60FinalComment"]').fill('IBERFIT U74 QA ejecución real sintética');
 await player.locator('[data-iberdates-action="u60-complete"]').click();
 await expect(player).toHaveAttribute('data-u60-phase','completed',{timeout:30000});
 const expected=['OCURRENCIA_INICIAR','OCURRENCIA_PAUSAR','OCURRENCIA_REANUDAR',
  ...Array(f.stepsExpected).fill('OCURRENCIA_GUARDAR_PROGRESO'),'OCURRENCIA_COMPLETAR'];
 expect(writes.map(x=>x.type)).toEqual(expected);
 expect(acks).toEqual(expected);
 expect(new Set(writes.map(x=>x.operationId)).size).toBe(writes.length);
 expect(terminal).toBe(true);
 expect(blocked).toEqual([]);
 expect(serverFaults).toEqual([]);
 expect(errors).toEqual([]);
 // Client B gets a fresh real JWT and must never see the other owner's date.
 const other=await browser.newContext({serviceWorkers:'block'});
 let b=null,secondaryCleanup=null,secondaryAuthenticated=false;
 try{
  const blockedB=[];
  await installCurrentSourceQaNetworkPolicy(other,{
   readOnlyRpcs:READS,onBlocked:label=>blockedB.push(label),
  });
  b=await other.newPage();
  await login(b,'B');
  secondaryAuthenticated=true;
  await b.locator('[data-iberdates-action="u60-calendar"]').click();
  await expect(b.locator('[data-u60-panel]')).toContainText('Calendario confirmado:',{timeout:25000});
  await expect(b.locator('[data-u60-id="'+f.occurrenceId+'"]')).toHaveCount(0);
  expect(blockedB).toEqual([]);
 }finally{
  try{
    if(b){
      secondaryCleanup=await releaseQaSessionBeforeContextClose(b);
      console.log('U74_QA_SECONDARY_AUTH_RELEASE='+secondaryCleanup);
    }
  }finally{await other.close();}
 }
 if(secondaryAuthenticated)expect(['released','no-session']).toContain(secondaryCleanup);
});
