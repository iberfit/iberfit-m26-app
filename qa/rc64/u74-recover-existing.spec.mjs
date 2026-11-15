import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {
 CANARY_ORIGIN,QA_PROJECT_REF,SUPABASE_ORIGIN,
 installCurrentSourceQaNetworkPolicy,isQaScopedDatedSyntheticWrite,
} from './secure-current-source-auth.mjs';
const READS=new Set([
 'iberfit_bootstrap_v26','iberfit_authorized_application_roles_v13',
 'iberfit_appointment_change_requests_v13','iberfit_application_context_v14',
 'iberfit_privileged_assurance_context_v65d','iberfit_communication_bootstrap_v14',
 'm26_backend_bootstrap_v43','m26_wearable_bootstrap_v44',
 'iberfit_exercise_catalog_public_v1','iberfit_exercise_measurement_profiles_public_v1',
 'iberfit_exercise_media_manifest_v1','iberfit_occurrence_api_u60_v1',
 'iberfit_occurrence_detail_v1',
]);
function proof(){
 const source=JSON.parse(readFileSync('.tmp/u74-old/evidence.json','utf8'));
 const ready=JSON.parse(readFileSync('.tmp/u74-first/evidence.json','utf8'));
 expect(process.env.GITHUB_ACTIONS).toBe('true');
 expect(process.env.GITHUB_RUN_ATTEMPT).toBe('2');
 expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
 expect(process.env.M26_QA_ONLY).toBe('true');
 expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
 expect(source.sha).toBe('3ee26fb00c98855d53f3c9b5cc923cf60d805a40');
 expect(String(source.runId)).toBe('43679537387');
 expect(source.status).toBe('QA_BROWSER_FIXTURE_READY');
 expect(ready.status).toBe('READ_ONLY_READY');
 expect(ready.sha).toBe(process.env.GITHUB_SHA);
 expect(ready.runId).toBe(process.env.GITHUB_RUN_ID);
 expect(ready.occurrenceId).toBe(source.fixture.occurrenceId);
 expect(source.fixture.stepsExpected).toBe(2);
 return {source,ready};
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
test('U74 existing QA only: recover exact interrupted set, close with real ACK, B denied',async({page,context,browser})=>{
 test.setTimeout(420000);
 const {source,ready}=proof(),f=source.fixture,blocked=[],errors=[],faults=[],writes=[],acks=[];
 let terminal=false;
 const permitted=request=>{
  if(terminal||!isQaScopedDatedSyntheticWrite(request,f))return false;
  const cmd=request.postDataJSON().p_payload;
  if(cmd.payload.executionId!==ready.executionId)return false;
  const expected=['OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_COMPLETAR'];
  if(cmd.type!==expected[writes.length])return false;
  writes.push({type:cmd.type,operationId:cmd.operationId});
  if(cmd.type==='OCURRENCIA_COMPLETAR')terminal=true;
  return true;
 };
 await installCurrentSourceQaNetworkPolicy(context,{readOnlyRpcs:READS,
  allowQaSyntheticWrite:permitted,onBlocked:x=>blocked.push(x)});
 page.on('pageerror',x=>errors.push(String(x?.name||'PageError').slice(0,80)));
 page.on('response',async response=>{
  try{
   const u=new URL(response.url());
   if(u.origin!==SUPABASE_ORIGIN)return;
   if(response.status()>=500)faults.push(String(response.status()));
   if(u.pathname==='/rest/v1/rpc/iberfit_occurrence_api_u60_v1'
    &&response.request().method()==='POST'){
    const sent=response.request().postDataJSON();
    if(sent.p_action==='TRANSICION'&&sent.p_payload.entityId===f.occurrenceId){
     const body=await response.json();
     if(response.status()===200&&body?.kind==='ack')acks.push(sent.p_payload.type);
    }
   }
  }catch{}
 });
 await login(page,'A');
 const panel=page.locator('[data-u60-panel]');
 await panel.locator('[name="u60Phrase"]').fill('IBERFIT-U74-RESUME-SYNTHETIC-'+process.env.GITHUB_RUN_ID);
 await panel.locator('[data-iberdates-action="u60-unlock"]').click();
 await expect(panel).toContainText('Recuperación cifrada desbloqueada',{timeout:15000});
 await panel.locator('[data-iberdates-action="u60-calendar"]').click();
 const opener=panel.locator('[data-iberdates-action="u60-open"][data-u60-id="'+f.occurrenceId+'"]');
 await expect(opener).toHaveCount(1,{timeout:25000});
 await opener.click();
 const player=panel.locator('[data-u60-workout]');
 await expect(player).toHaveAttribute('data-u60-phase','active',{timeout:25000});
 const record=player.locator('[data-iberdates-action="u60-record"]');
 await expect(record).toBeVisible({timeout:25000});
 await expect(record).toBeEnabled({timeout:25000});
 await player.locator('[name="u60Reps"]').fill('8');
 await player.locator('[name="u60Load"]').fill('20');
 await player.locator('[name="u60Rpe"]').fill('7');
 await record.click();
 await expect.poll(()=>acks.length,{timeout:30000}).toBe(1);
 await expect(panel).not.toHaveAttribute('aria-busy','true',{timeout:30000});
 await expect(player.locator('[name="u60FinalRpe"]')).toBeVisible({timeout:25000});
 await player.locator('[name="u60FinalRpe"]').fill('7');
 await player.locator('[name="u60FinalComment"]').fill('IBERFIT U74 QA sintético recuperado y confirmado');
 await player.locator('[data-iberdates-action="u60-complete"]').click();
 await expect.poll(()=>acks.length,{timeout:30000}).toBe(2);
 await expect(player).toHaveAttribute('data-u60-phase','completed',{timeout:30000});
 expect(acks).toEqual(['OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_COMPLETAR']);
 expect(new Set(writes.map(x=>x.operationId)).size).toBe(2);
 expect(blocked).toEqual([]);expect(errors).toEqual([]);expect(faults).toEqual([]);
 const other=await browser.newContext({serviceWorkers:'block'});
 try{
  const denied=[];await installCurrentSourceQaNetworkPolicy(other,{readOnlyRpcs:READS,
   onBlocked:x=>denied.push(x)});
  const b=await other.newPage();await login(b,'B');
  await b.locator('[data-iberdates-action="u60-calendar"]').click();
  await expect(b.locator('[data-u60-id="'+f.occurrenceId+'"]')).toHaveCount(0);
  expect(denied).toEqual([]);
 }finally{await other.close();}
});
