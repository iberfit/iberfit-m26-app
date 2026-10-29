import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {m43QaRunMarkers} from '../../scripts/remote-gates/m43-qa-fixture-safety.mjs';
import {
  CANARY_ORIGIN,QA_PROJECT_REF,SUPABASE_ORIGIN,installCurrentSourceQaNetworkPolicy,
} from './secure-current-source-auth.mjs';

// Isolated synthetic run: Coach publishes in the upstream real QA writer;
// Client must actually tap START, PAUSE, RESUME, COMPLETE SET, NEXT and FINISH.
// This is NOT the completed read-only M43 historical session.
// The browser must read the exact same synthetic QA writer attempt even
// when GitHub reruns a failed browser job without recreating the fixture.
// A GitHub Actions job without verified writer provenance must fail closed.
const WRITER_ATTEMPT=process.env.M26_M43_WRITER_ATTEMPT;
const OWNER_FIXTURE=process.env.M26_M43_FIXTURE_CLIENT_LABEL||'A';
if(!['A','B'].includes(OWNER_FIXTURE)||
   (process.env.GITHUB_ACTIONS==='true'&&!process.env.M26_M43_FIXTURE_CLIENT_LABEL))
  throw Error('M43_INTERACTIVE_FIXTURE_PROVENANCE_MISSING');
const ownerEmail=()=>process.env['M26_QA_CLIENT_'+OWNER_FIXTURE+'_EMAIL'];
const ownerPassword=()=>process.env['M26_QA_CLIENT_'+OWNER_FIXTURE+'_PASSWORD'];
if(process.env.GITHUB_ACTIONS==='true'&&!WRITER_ATTEMPT)
  throw Error('M43_QA_WRITER_ATTESTATION_REQUIRED');
const LIVE=m43QaRunMarkers({runId:process.env.GITHUB_RUN_ID,attempt:WRITER_ATTEMPT||process.env.GITHUB_RUN_ATTEMPT})
  .interactiveSessionTitle;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26',
  'iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13',
  'iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d',
  'iberfit_communication_bootstrap_v14',
  'm26_backend_bootstrap_v43','m26_wearable_bootstrap_v44',
  'iberfit_exercise_catalog_public_v1',
  'iberfit_exercise_measurement_profiles_public_v1',
  'iberfit_exercise_media_manifest_v1',
]);
const WRITES=new Set([
  'SESION_INICIAR','EJECUCION_PAUSAR','EJECUCION_REANUDAR',
  'EJECUCION_GUARDAR_PROGRESO','EJECUCION_COMPLETAR',
]);

test('Client executes exact synthetic guided workout through real UI and confirms server history',async({page,context},testInfo)=>{
  for(const name of ['M26_PROJECT_REF','M26_QA_ONLY','M26_SUPABASE_URL',
    'M26_SUPABASE_PUBLISHABLE_KEY','M26_QA_CLIENT_'+OWNER_FIXTURE+'_EMAIL','M26_QA_CLIENT_'+OWNER_FIXTURE+'_PASSWORD']){
    expect(process.env[name],name+' required').toBeTruthy();
  }
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(ownerEmail()).toBe('qa.rc74.client-'+OWNER_FIXTURE.toLowerCase()+'@iberfit.cl');
  expect(process.env.M26_SUPABASE_PUBLISHABLE_KEY).not.toMatch(/service[_-]?role|supabase_secret/iu);

  let clientId=null,sessionId=null,executionId=null;
  const allowed=[],confirmedProgress=[],blocked=[],pageErrors=[],unexpectedHttp=[];
  // No business write is allowed until this Client has obtained its own ID
  // from the real server and selected the exact run-marked synthetic card.
  function allowExactSyntheticWrite(request){
    if(!UUID.test(clientId||'')||!UUID.test(sessionId||''))return false;
    if(request.method()!=='POST')return false;
    const raw=request.postDataJSON();
    const cmd=raw?.p_command;
    if(!cmd||!WRITES.has(cmd.type)||String(cmd.clientId||'')!==clientId||
      !UUID.test(String(cmd.operationId||'')))return false;
    if(cmd.type==='SESION_INICIAR'){
      if(cmd.entityType!=='session'||String(cmd.entityId)!==sessionId||
        !UUID.test(String(cmd.payload?.executionId||'')))return false;
      const nextId=String(cmd.payload.executionId);
      if(executionId!==null&&executionId!==nextId)return false;
      executionId=nextId;
    }else if(!executionId||cmd.entityType!=='session_execution'||
      String(cmd.entityId)!==executionId)return false;
    // Record only non-sensitive operation identity and transition shape.
    // Both COMPLETE SET and NEXT persist through this same RPC type.
    const snapshot=cmd.payload?.progressSnapshot;
    allowed.push({type:cmd.type,rpc:new URL(request.url()).pathname.split('/').at(-1),
      operationId:String(cmd.operationId),
      ...(cmd.type==='EJECUCION_GUARDAR_PROGRESO'?{
        progressStatus:String(snapshot?.status||''),
        resultCount:Object.keys(snapshot?.results||{}).length,
        stepIndex:Number(snapshot?.index),setIndex:Number(snapshot?.setIndex),
      }:{}),
    });
    return true;
  }
  await installCurrentSourceQaNetworkPolicy(context,{
    readOnlyRpcs:READ_ONLY_RPCS,
    allowQaSyntheticWrite:allowExactSyntheticWrite,
    onBlocked:label=>blocked.push(label),
  });
  page.on('pageerror',error=>pageErrors.push(String(error?.message||error).slice(0,180)));
  page.on('response',async response=>{
    try{
      const url=new URL(response.url());
      if(url.origin!==SUPABASE_ORIGIN)return;
      if(response.status()>=500)unexpectedHttp.push(String(response.status())+' '+url.pathname);
      if(url.pathname==='/rest/v1/rpc/iberfit_execute_command_v26'&&response.status()===200){
        const submitted=response.request().postDataJSON()?.p_command;
        if(submitted?.type==='EJECUCION_GUARDAR_PROGRESO'
          &&String(submitted.entityId)===executionId){
          const ack=await response.json();
          if(ack?.kind==='ack'&&String(ack?.operationId)===String(submitted.operationId))
            confirmedProgress.push(String(submitted.operationId));
        }
      }
      if(url.pathname==='/rest/v1/rpc/iberfit_bootstrap_v26'&&response.status()===200){
        const body=await response.json();
        const value=String(body?.user?.clientId||'');
        if(['client','cliente'].includes(String(body?.user?.role||''))&&UUID.test(value))
          clientId=value;
      }
    }catch{}
  });
  await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:25_000});
  await page.getByRole('textbox',{name:'Correo',exact:true}).fill(ownerEmail());
  await page.locator('#m26-login-password').fill(ownerPassword());
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.locator('.m26-shell[data-m26-role="client"]')).toBeVisible({timeout:40_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:25_000});
  await expect.poll(()=>clientId,{timeout:12_000}).toMatch(UUID);
  const welcome=page.locator('[data-m26-client-guided-welcome]');
  if(await welcome.isVisible().catch(()=>false)){
    const pause=page.locator('[data-m26-client-guided-welcome-pause]').first();
    if(await pause.count())await pause.click();
  }
  const tourClose=page.locator('[data-m26-guided-tour-close]:visible').first();
  if(await tourClose.count())await tourClose.click();
  const contextClose=page.locator('[data-m26-client-context-guide-close]:visible').first();
  if(await contextClose.count())await contextClose.click();
  await page.locator('[data-m26-area="sesion"]:visible').first().click();
  await expect(page.locator('[data-m26-controllers="ready"]')).toHaveCount(1,{timeout:25_000});
  const card=page.locator('[data-rc39-session]').filter({hasText:LIVE});
  await expect(card,'Only this GitHub run synthetic Client session is startable').toHaveCount(1,{timeout:20_000});
  sessionId=await card.getAttribute('data-rc39-session');
  expect(sessionId).toMatch(UUID);
  const disclosure=card.locator('details.m26-session-preview-disclosure');
  await expect(disclosure).toBeVisible();
  await disclosure.locator(':scope > summary').click();
  const entry=card.locator('[data-workflow-action="start-published-session"]');
  await expect(entry).toBeVisible();
  await entry.click();
  const live=page.locator('[data-session-live-state]');
  await expect(live,'Clicking the real Client CTA opens an executable session').toBeVisible({timeout:20_000});
  if(await page.locator('[data-session-live-state="ready"]').count()){
    await expect(page.locator('[data-session-focus-dock].is-inline')).toHaveCount(1);
    await page.locator('[data-session-action="start"]').click();
  }
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible({timeout:25_000});
  await expect.poll(()=>allowed.some(x=>x.type==='SESION_INICIAR'),{timeout:12_000}).toBe(true);
  // The server must have confirmed start before any set can be accepted.
  await page.locator('[data-session-action="pause"]').first().click();
  await expect(page.locator('[data-session-live-state="paused"]')).toBeVisible({timeout:20_000});
  await expect(page.locator('[data-session-focus-dock].is-inline')).toHaveCount(1);
  await expect(page.locator('[data-session-paused-early-controls]')).toBeVisible();
  await expect(page.locator('[data-session-action="resume"]'),'Resume must be inside a real mobile touch viewport').toBeInViewport({ratio:0.75});
  await page.locator('[data-session-action="resume"]').click();
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible({timeout:20_000});
  await page.locator('[data-set-field="reps"]').first().fill('8');
  await page.locator('[data-set-field="load"]').first().fill('20 kg');
  await page.locator('[data-set-field="rpe"]').first().fill('7');
  await expect(page.locator('[data-session-action="complete-set"]')).toHaveCount(1);
  const dockPrimary=page.locator('[data-session-focus-dock]:not(.is-inline) .m27-session-focus-primary');
  await expect(dockPrimary,'Mobile live-set dock is a real, touchable UI button').toBeVisible();
  await dockPrimary.click();
  await expect(page.locator('[data-session-rest-focus]')).toBeVisible({timeout:20_000});
  await expect(page.locator('[data-session-action="next"]')).toHaveCount(1);
  await expect(dockPrimary,'Live rest dock stays touchable').toBeVisible();
  // The Client must not lose a tap while the previous set's remote mutation
  // is still pending. Wait for real server acknowledgement, then tap.
  await expect.poll(()=>confirmedProgress.length,{timeout:20_000}).toBe(1);
  await expect(page.locator('[data-m26-session-action-pending="true"]')).toHaveCount(0,{timeout:20_000});
  await expect(page.locator('[data-session-action="next"]')).toBeEnabled({timeout:20_000});
  await expect(dockPrimary).toBeEnabled({timeout:20_000});
  await dockPrimary.click();
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible({timeout:20_000});
  // Advancing the rest-to-next-set cursor is a distinct persisted transition.
  await expect.poll(()=>confirmedProgress.length,{timeout:20_000}).toBe(2);
  // Completing one set must not advance straight to feedback. Confirm that
  // the rest leads to a genuine second set with independently entered results.
  await page.locator('[data-set-field="reps"]').first().fill('8');
  await page.locator('[data-set-field="load"]').first().fill('20 kg');
  await page.locator('[data-set-field="rpe"]').first().fill('8');
  await expect(page.locator('[data-session-action="complete-set"]')).toHaveCount(1);
  await expect(dockPrimary,'Second set is reachable without scroll interception').toBeVisible();
  await dockPrimary.click();
  await expect(page.locator('[data-session-action="next"]')).toHaveCount(1);
  await expect.poll(()=>confirmedProgress.length,{timeout:20_000}).toBe(3);
  await expect(page.locator('[data-m26-session-action-pending="true"]')).toHaveCount(0,{timeout:20_000});
  await expect(page.locator('[data-session-action="next"]')).toBeEnabled({timeout:20_000});
  await expect(dockPrimary).toBeEnabled({timeout:20_000});
  await dockPrimary.click();
  await expect(page.locator('[data-session-live-state="feedback"]')).toBeVisible({timeout:20_000});
  await expect.poll(()=>confirmedProgress.length,{timeout:20_000}).toBe(4);
  await page.locator('[data-session-feedback-rpe]').fill('7');
  await page.locator('[data-session-feedback-comment]').fill('IBERFIT QA M43 · feedback sintético UI');
  await expect(page.locator('[data-session-focus-dock].is-inline')).toHaveCount(1);
  // The final action must be genuinely reachable in the immersive touch
  // scrollport, not dispatched artificially or force-clicked.
  const finish=page.locator('[data-session-action="finish"]');
  await expect(finish).toBeEnabled({timeout:20_000});
  await finish.scrollIntoViewIfNeeded({timeout:10_000});
  await expect(finish,'Client can reach final feedback action').toBeInViewport({ratio:0.75});
  const scroll=await page.evaluate(()=>{
    const main=document.querySelector('.m26-shell[data-m26-role="client"] .m26-main');
    return {overflow:getComputedStyle(main).overflowY,top:main.scrollTop,
      available:main.scrollHeight-main.clientHeight};
  });
  expect(scroll.overflow).toBe('auto');
  expect(scroll.available).toBeGreaterThan(0);
  expect(scroll.top).toBeGreaterThan(0);
  await finish.click();
  await expect(page.locator('[data-session-live-state="completed"]')).toBeVisible({timeout:25_000});
  await expect(page.locator('[data-session-live-state="completed"]')).toContainText('Confirmada');
  // The two completed sets AND the two explicit NEXT transitions each need
  // a separate, server-ACKed progress snapshot. Duplicates or late writes fail.
  // Inspect the actual request log, not only persisted history or UI state.
  function assertNoPostTerminalRequests(stage){
    const terminalIndex=allowed.findIndex(row=>row.type==='EJECUCION_COMPLETAR'
      &&row.rpc==='iberfit_execute_command_v26');
    expect(terminalIndex,stage+': completion transport must have been sent').toBeGreaterThanOrEqual(0);
    const progress=allowed.filter(row=>row.type==='EJECUCION_GUARDAR_PROGRESO'
      &&row.rpc==='iberfit_execute_command_v26');
    expect(progress,stage+': two completed sets and two distinct NEXT transitions').toHaveLength(4);
    expect(new Set(progress.map(row=>row.operationId)).size,
      stage+': no duplicated progress transport operation').toBe(4);
    expect(new Set(confirmedProgress).size,
      stage+': each progress transition needs its own matching server ACK').toBe(4);
    expect(progress.map(row=>row.resultCount),
      stage+': NEXT must not invent extra recorded sets').toEqual([1,1,2,2]);
    expect(progress.map(row=>row.progressStatus),
      stage+': final NEXT must reach feedback, not mutate after completion')
      .toEqual(['active','active','active','awaiting_feedback']);
    expect(progress[0].stepIndex+':'+progress[0].setIndex).not.toBe(progress[1].stepIndex+':'+progress[1].setIndex);
    expect(progress[2].stepIndex+':'+progress[2].setIndex).not.toBe(progress[3].stepIndex+':'+progress[3].setIndex);
    expect(allowed.slice(terminalIndex+1),
      stage+': no further command request may follow completion').toEqual([]);
  }
  assertNoPostTerminalRequests('after confirmed completion');
  await expect.poll(()=>allowed.some(x=>x.type==='EJECUCION_COMPLETAR'),{timeout:10_000}).toBe(true);
  await page.locator('[data-session-action="exit-session"]').first().click();
  await expect(page.locator('[data-m27-session-surface="sessions"]')).toBeVisible({timeout:25_000});
  const completed=page.locator('[data-m43-session-history] [data-m43-completed-session]').filter({hasText:LIVE});
  await expect(completed,'Completed workout must reach real Client history exactly once').toHaveCount(1,{timeout:25_000});
  await expect(completed).toContainText('Completada');
  // The page shows recorded sets, not the number of completed sessions.
  // This synthetic workout has two independently ACKed, persisted set results.
  // One matching history card above protects against duplicate completions.
  await expect(completed).toContainText('2 registros');
  await expect(page.locator('[data-rc39-session]').filter({hasText:LIVE})).toHaveCount(0);

  // U53: a local completion card is not enough. Prove the exact server-backed
  // history survives a full app restart with the same real QA Client account.
  // No new write (including a duplicate finish) may be issued on refresh.
  const writesBeforeReload=allowed.length;
  await page.reload({waitUntil:'domcontentloaded',timeout:25_000});
  await expect(page.locator('.m26-shell[data-m26-role="client"]'),
    'Client must restore its authenticated shell after a real page reload').toBeVisible({timeout:40_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:25_000});
  const reloadWelcome=page.locator('[data-m26-client-guided-welcome]');
  if(await reloadWelcome.isVisible().catch(()=>false)){
    const pause=page.locator('[data-m26-client-guided-welcome-pause]').first();
    if(await pause.count())await pause.click();
  }
  const reloadTourClose=page.locator('[data-m26-guided-tour-close]:visible').first();
  if(await reloadTourClose.count())await reloadTourClose.click();
  const reloadContextClose=page.locator('[data-m26-client-context-guide-close]:visible').first();
  if(await reloadContextClose.count())await reloadContextClose.click();
  await page.locator('[data-m26-area="sesion"]:visible').first().click();
  await expect(page.locator('[data-m26-controllers="ready"]')).toHaveCount(1,{timeout:25_000});
  await expect(page.locator('[data-m27-session-surface="sessions"]')).toBeVisible({timeout:25_000});
  const recovered=page.locator('[data-m43-session-history] [data-m43-completed-session]')
    .filter({hasText:LIVE});
  await expect(recovered,'Completed session must survive real reload exactly once').toHaveCount(1,{timeout:25_000});
  await expect(recovered).toContainText('Completada');
  await expect(recovered,'Both server-ACKed sets must survive a new bootstrap')
    .toContainText('2 registros');
  await expect(page.locator('[data-rc39-session]').filter({hasText:LIVE}),
    'Completed session must never return to startable cards after refresh').toHaveCount(0);
  expect(allowed,'Reloading confirmed history must not replay or duplicate writes')
    .toHaveLength(writesBeforeReload);
  assertNoPostTerminalRequests('after full authenticated reload');

  const source=await page.evaluate(()=>({
    width:document.documentElement.clientWidth,
    scroll:document.documentElement.scrollWidth,
  }));
  expect(source.scroll,'No horizontal overflow during a real mobile workout').toBeLessThanOrEqual(source.width+2);
  expect(allowed.filter(x=>x.type==='SESION_INICIAR'&&x.rpc==='iberfit_execute_command_v26')).toHaveLength(1);
  expect(allowed.filter(x=>x.type==='EJECUCION_COMPLETAR'&&x.rpc==='iberfit_execute_command_v26')).toHaveLength(1);
  expect(blocked.filter(x=>/iberfit_execute_command_v26|iberfit_command_preflight_v26/.test(x))).toEqual([]);
  expect(unexpectedHttp).toEqual([]);
  expect(pageErrors).toEqual([]);
  const dir=join('recovery','m43-qa','browser-interactive');
  await mkdir(dir,{recursive:true});
  await page.screenshot({path:join(dir,'m43-client-mobile-completed.png'),fullPage:true});
  await testInfo.attach('m43-interactive-client-evidence',{
    body:Buffer.from(JSON.stringify({schema:'iberfit.m43.interactive-ui.v1',
      runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,
      allowedActions:[...new Set(allowed.map(x=>x.type))],
      networkErrors:unexpectedHttp.length,blockedWrites:0,completed:true,
      restoredAfterReload:true,confirmedSetCount:2,confirmedProgressTransitions:4,historyEntriesAfterReload:1,
      writesAfterReload:allowed.length-writesBeforeReload},null,2)),
    contentType:'application/json',
  });
});
