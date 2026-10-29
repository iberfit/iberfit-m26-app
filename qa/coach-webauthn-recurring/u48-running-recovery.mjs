/**
 * SIGNATURE U48 — one-shot completion of already published, untouched U47
 * synthetic QA running. No second publication, no PROD writes, no rerun,
 * no service_role, no changes to unrelated Client A sessions.
 */
import {newU47Scope} from './u47-running-policy.mjs';
import {openU56ClientReadOnly} from './u56-qa-publish.mjs';

const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const SESSION='4d244c01-8966-40f1-8cc7-9e6ec46d1708';
const EXECUTION='16145839-2e7d-48e2-bf0c-e94325f5c54c';
const TITLE='QA U47 · Running 40738135729-1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export async function certifyU48ExistingRunning({browser,installPolicy,evidence,coachPage,cdp,setDevice}){
 const {expect}=await import('@playwright/test');
 if(process.env.M26_QA_U48_RUNNING!=='true'||
    process.env.M26_QA_U47_RUNNING==='true'||process.env.GITHUB_RUN_ATTEMPT!=='1'||
    process.env.M26_QA_ONLY!=='true'||process.env.M26_PROJECT_REF!=='gjztkdwfmunnzhtvxrsu')
   throw Error('U48_TRUSTED_CANARY_ONE_SHOT_ONLY');
 const scope={enabled:false};
 const client=await openU56ClientReadOnly(browser,installPolicy,scope);
 const {context,page}=client;const trace={publishedBefore:true,noSecondStart:false,
   firstTapVisible:false,progressAck:false,recoveredConfirmedProgress:false,
   skippedPreviouslyRecordedSet:false,finishAck:false,readback:false};
 let boot=null,errors=[],acked=[],httpErrors=[];
 evidence.u48Running=trace;
 page.on('pageerror',error=>errors.push(String(error?.message||'PAGE_ERROR').slice(0,140)));
 page.on('response',async response=>{
   try{
    const url=new URL(response.url());
    if(url.origin!==QA)return;
    if(response.status()>=500)httpErrors.push(String(response.status()));
    if(response.status()!==200)return;
    if(url.pathname==='/rest/v1/rpc/iberfit_bootstrap_v26'){
      const payload=await response.json();
      if(String(payload?.user?.clientId||'')===client.clientId)boot=payload.data||null;
    }
    if(url.pathname==='/rest/v1/rpc/iberfit_execute_command_v26'){
      const cmd=response.request().postDataJSON()?.p_command;
      if(!cmd||!scope.uniqueByOperation?.has(cmd.operationId))return;
      const result=await response.json();
      if(!['ack','duplicate'].includes(String(result?.kind||'').toLowerCase())||
        String(result.operationId||result.operation_id)!==cmd.operationId||
        !Number.isSafeInteger(Number(result.remoteRevision??result.remote_revision)))return;
      if(!acked.some(entry=>entry.id===cmd.operationId))acked.push({id:cmd.operationId,type:cmd.type});
    }
   }catch{}
 });
 try{
  await page.reload({waitUntil:'domcontentloaded',timeout:25_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:35_000});
  await expect.poll(()=>boot,{timeout:15_000}).not.toBeNull();
  const matching=(boot?.m26Entities||[]).filter(row=>
    String(row?.entityType||row?.entity_type||'')==='session'&&
    String(row?.entityId||row?.entity_id||row?.id||'')===SESSION);
  expect(matching,'U48 requires the one exact already published canonical QA session').toHaveLength(1);
  const record=matching[0];
  expect(String(record.status||record.body?.status)).toBe('en_curso');
  expect(String(record.body?.title||'')).toBe(TITLE);
  expect(String(record.clientId||record.client_id||record.body?.clientId||'')).toBe(client.clientId);
  expect(String(record.body?.deliveryOwnership||'')).toBe('guided_in_app');
  expect(record.body?.visibleToClient).toBe(true);
  const canonical=(boot?.m26Entities||[]).filter(row=>
    String(row?.entityType||row?.entity_type||'')==='session_execution'&&
    String(row?.entityId||row?.entity_id||row?.id||'')===EXECUTION&&
    String(row?.body?.sessionId||'')===SESSION&&
    String(row?.clientId||row?.body?.clientId||'')===client.clientId);
  // SECURITY DEFINER bootstrap intentionally strips client/session/status from
  // legacy session_executions. It exposes only id+revision, while the separately
  // scoped m26Entities canonical envelope carries the authorized lineage.
  // The hydrated Client reconciler restores these fields for the actual UI.
  const historical=(boot?.sessionExecutions||[]).filter(row=>String(row?.id||'')===EXECUTION);
  expect(canonical,'Exact canonical U47 execution must still be active').toHaveLength(1);
  expect(historical,'A single privacy-projected matching legacy execution must exist').toHaveLength(1);
  expect(String(canonical[0]?.status||canonical[0]?.body?.status)).toBe('en_curso');
  expect(String(canonical[0]?.body?.clientId||'')).toBe(client.clientId);
  expect(String(canonical[0]?.body?.sessionId||'')).toBe(SESSION);
  // Revision 2 is the same original QA execution after the first genuine
  // progress ACK. Never register its final set a second time on reentry.
  const persistedRevision=Number(canonical[0]?.revision);
  expect([1,2],'Only exact untouched or once-progressed U47 is eligible').toContain(persistedRevision);
  expect(Number(historical[0]?.revision)).toBe(persistedRevision);
  trace.recoveredConfirmedProgress=persistedRevision===2;
  expect(historical[0]?.clientId??historical[0]?.client_id??null).toBeNull();
  expect(historical[0]?.sessionId??historical[0]?.session_id??null).toBeNull();
  evidence.u48Readiness={valid:true,reason:'EXACT_EXISTING_ACTIVE_EXECUTION',
    canonicalId:EXECUTION,activeLockCount:1};
  const welcome=page.locator('[data-m26-client-guided-welcome]');
  if(await welcome.isVisible().catch(()=>false)){
    const pause=page.locator('[data-m26-client-guided-welcome-pause]').first();
    if(await pause.isVisible().catch(()=>false))await pause.click();
  }
  for(const selector of ['[data-m26-guided-tour-close]:visible',
    '[data-m26-client-context-guide-close]:visible']){
    const close=page.locator(selector).first();
    if(await close.isVisible().catch(()=>false))await close.click();
  }
  await page.locator('[data-m26-area="sesion"]:visible').first().click();
  const card=page.locator('[data-rc39-session="'+SESSION+'"]').filter({hasText:TITLE});
  await expect(card,'Previously ACKed U47 session must be unique in current UI').toHaveCount(1,{timeout:25_000});
  const archive=card.locator('xpath=ancestor::details[@data-signature-session-archive]');
  if(await archive.count()&&!(await archive.first().evaluate(el=>el.open)))
    await archive.first().locator(':scope > summary').click({timeout:5_000});
  await expect(card,'Start target cannot be hidden in collapsed archive').toBeVisible({timeout:10_000});
  const cta=card.locator('[data-workflow-action="start-published-session"]');
  await expect(cta,'Start must be visible WITHOUT expanding exercise details').toBeVisible({timeout:8_000});
  trace.firstTapVisible=true;
  Object.assign(scope,newU47Scope({stage:'execute',clientId:client.clientId,title:TITLE}),
    {sessionId:SESSION,executionId:EXECUTION,
      serverPublicationConfirmed:true,historyClean:true,enabled:true});
  // Distinguish a workspace-recovery rejection from a slow render; capture
  // only static error codes, never JWTs or private response bodies.
  await page.evaluate(()=>{
    globalThis.__u48EntryErrorCodes=[];
    globalThis.addEventListener('m26:workflow-error',event=>{
      const code=String(event?.detail?.code||'');
      if(/^M(?:26|38|42|43|48)_[A-Z0-9_]{1,95}$/u.test(code))
        globalThis.__u48EntryErrorCodes.push(code);
    },{once:true});
  });
  await cta.click({timeout:8_000});
  await expect.poll(async()=>{
    if(await page.locator('[data-session-live-state]').count())return 'OPEN';
    const error=await page.evaluate(()=>globalThis.__u48EntryErrorCodes?.[0]||'');
    return error?'ERROR:'+error:'PENDING';
  },{timeout:25_000,message:'U48 canonical recovery must open an owned session or expose a safe error code'})
    .toBe('OPEN');
  await expect(page.locator('[data-session-live-state="ready"]')).toHaveCount(0);
  await expect(page.locator('[data-session-live-state="active"]')).toBeVisible({timeout:25_000});
  expect(acked.filter(e=>e.type==='SESION_INICIAR'),'Recovery MUST NOT emit a second start').toHaveLength(0);
  trace.noSecondStart=true;
  if(persistedRevision===1){
    await page.locator('[data-set-field="distanceKm"]').first().fill('6.5');
    await page.locator('[data-set-field="durationMinutes"]').first().fill('35.8');
    await page.locator('[data-set-field="rpe"]').first().fill('7');
    const finishSet=page.locator('[data-session-live-state="active"] [data-session-action="complete-set"]');
    await expect(finishSet).toBeEnabled({timeout:20_000});
    await finishSet.click();
    await expect.poll(()=>acked.some(e=>e.type==='EJECUCION_GUARDAR_PROGRESO'),{timeout:25_000}).toBe(true);
  }else{
    // The recorded set comes only from the original RLS-backed execution.
    await expect(page.locator('[data-session-rest-focus]')).toContainText('Serie registrada',{timeout:30_000});
    await expect(page.locator('[data-session-live-state="active"] [data-session-action="complete-set"]')).toHaveCount(0);
    trace.skippedPreviouslyRecordedSet=true;
  }
  scope.setConfirmed=true;trace.progressAck=true;
  const feedback=page.locator('[data-session-live-state="feedback"]');
  if(!await feedback.isVisible().catch(()=>false)){
    const next=page.locator('[data-session-rest-focus] [data-session-action="next"]');
    await expect(page.locator('[data-session-rest-focus]')).toBeVisible({timeout:30_000});
    // HTTP ACK does not mean the previous controller operation finished.
    // Clicking while it still holds the lock can discard the only user tap.
    await expect(page.locator('[data-m26-session-action-pending="true"]'),
      'NEXT must await the full local settlement of the previous ACK').toHaveCount(0,{timeout:35_000});
    await expect(next).toBeEnabled({timeout:25_000});
    const previousProgressAcks=acked.filter(e=>e.type==='EJECUCION_GUARDAR_PROGRESO').length;
    await next.click();
    await expect(feedback,'The last recorded set must lead to feedback on one settled tap')
      .toBeVisible({timeout:35_000});
    await expect.poll(()=>acked.filter(e=>e.type==='EJECUCION_GUARDAR_PROGRESO').length,
      {timeout:30_000}).toBeGreaterThan(previousProgressAcks);
  }
  await expect(feedback).toBeVisible({timeout:20_000});
  await page.locator('[data-session-feedback-rpe]').fill('7');
  await page.locator('[data-session-feedback-comment]').fill('IBERFIT QA U48 · running sintético');
  await page.locator('[data-session-action="finish"]').click({timeout:8_000});
  await expect(page.locator('[data-session-live-state="completed"]')).toBeVisible({timeout:25_000});
  await expect.poll(()=>acked.some(e=>e.type==='EJECUCION_COMPLETAR'),{timeout:25_000}).toBe(true);
  trace.finishAck=true;
  scope.enabled=false;
  await page.locator('[data-session-action="exit-session"]').first().click();
  const history=page.locator('[data-m43-session-history] [data-m43-completed-session]')
    .filter({hasText:TITLE});
  await expect(history).toHaveCount(1,{timeout:25_000});
  const operations=scope.uniqueByOperation.size;
  await page.reload({waitUntil:'domcontentloaded',timeout:25_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:35_000});
  await page.locator('[data-m26-area="sesion"]:visible').first().click();
  await expect(page.locator('[data-m43-session-history] [data-m43-completed-session]')
    .filter({hasText:TITLE})).toHaveCount(1,{timeout:25_000});
  expect(scope.uniqueByOperation.size,'Reload cannot repeat a command').toBe(operations);
  expect(acked.filter(e=>e.type==='SESION_INICIAR')).toHaveLength(0);
  expect(acked.filter(e=>e.type==='EJECUCION_COMPLETAR')).toHaveLength(1);
  // Independently privileged Coach must observe the real training feedback,
  // not only the Client's optimistic local completion state. Never use
  // Coach context to write, re-publish or bypass Client RLS.
  expect(coachPage,'U48 requires live Coach WebAuthn context').toBeTruthy();
  await setDevice(coachPage,cdp,{name:'u48-coach-readback',width:1440,height:1000,mobile:false,touch:false});
  await expect(coachPage.locator('.m26-shell[data-m26-role="coach"]'),
    'Coach must retain independent privileged MFA before readback')
    .toBeVisible({timeout:15_000});
  const clientPicker=coachPage.locator('[data-m26-client-select]').first();
  await expect(clientPicker.locator('option[value="'+client.clientId+'"]'),
    'Coach must be assigned to the exact synthetic QA Client A').toHaveCount(1,{timeout:15_000});
  await clientPicker.selectOption(client.clientId);
  const dossier=coachPage.locator('[data-m26-area="expediente"]:visible').first();
  await expect(dossier).toBeVisible({timeout:15_000});
  await dossier.click({timeout:8_000});
  const coachWorkspace=coachPage.locator('[data-coach-client-workspace][data-client-id="'+client.clientId+'"]');
  await expect(coachWorkspace,'Coach can inspect the same authorized Client after the finish ACK')
    .toBeVisible({timeout:30_000});
  await expect(coachWorkspace,'Coach must observe actual running feedback, not an uncommitted preview')
    .toContainText('IBERFIT QA U48 · running sintético',{timeout:30_000});
  await expect(coachWorkspace).toContainText('RPE 7');
  trace.coachReadback=true;
  expect(httpErrors).toEqual([]);
  expect(errors).toEqual([]);
  expect(client.evidence.blocked).toEqual([]);
  trace.readback=true;
  evidence.u48Running={...trace,certified:true,qaOnly:true,existingFixture:true,
    independentCoachMfaReadback:true,
    withoutAppointment:true,serverAcknowledged:true,oneExecution:true,
    recoveredExistingExecutionId:EXECUTION,
    source:'real-authenticated-client'};
 }finally{
   scope.enabled=false;
   await context.close().catch(()=>{});
 }
}
