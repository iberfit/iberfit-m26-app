/**
 * SIGNATURE U47 — one fresh synthetic running prescription in real QA.
 * Coach uses actual WebAuthn-protected UI; Client independently logs in and
 * uses real app actions. Every write passes the U47 JWT+scope request policy
 * AND the authoritative backend. No PROD writes; no service-role token.
 * On partial failure never reset/cancel/replay the business execution.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const QA_ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';

export async function certifyU47RunningClientLifecycle({
  page,context,cdp,client,coachScope,clientScope,evidence,setDevice,
}){
  const {expect}=await import('@playwright/test');
  if(process.env.M26_QA_U47_RUNNING!=='true'||process.env.GITHUB_RUN_ATTEMPT!=='1'||
     process.env.M26_PROJECT_REF!=='gjztkdwfmunnzhtvxrsu'||
     process.env.M26_QA_ONLY!=='true'||
     process.env.M26_QA_CLIENT_A_EMAIL!=='qa.rc74.client-a@iberfit.cl')
    throw Error('U47_TRUSTED_FIRST_CANARY_PUSH_REQUIRED');
  expect(coachScope.stage).toBe('publish');
  expect(clientScope.stage).toBe('execute');
  expect(coachScope.clientId).toBe(client.clientId);
  expect(clientScope.clientId).toBe(client.clientId);
  expect(coachScope.title).toBe(clientScope.title);
  expect(coachScope.title).toBe('QA U47 · Running '+process.env.GITHUB_RUN_ID+'-1');
  expect(coachScope.uniqueByOperation.size).toBe(0);
  expect(clientScope.uniqueByOperation.size).toBe(0);

  const trace={publicationAck:false,clientVisible:false,startAck:false,
    progressAck:false,finishAck:false,historyReloaded:false,firstTapPrepared:false};
  evidence.u47Running=trace;
  await setDevice(page,cdp,{name:'u47-running-coach',width:1440,height:1000,mobile:false,touch:false});
  const publish=page.locator('[data-session-action="publish"]').first();
  await expect(publish,'Real Coach accepted exactly one running preview').toBeEnabled({timeout:15_000});
  // Attach real HTTP ACK observation BEFORE permitting the single publish.
  const publishAcks=[];
  page.on('response',async response=>{
    try{
      if(response.status()!==200||
         new URL(response.url()).origin!==QA_ORIGIN||
         new URL(response.url()).pathname!=='/rest/v1/rpc/iberfit_execute_command_v26')return;
      const cmd=response.request().postDataJSON()?.p_command;
      if(cmd?.type!=='SESION_PUBLICAR'||cmd.clientId!==coachScope.clientId||
         cmd.entityId!==coachScope.sessionId)return;
      const ack=await response.json();
      if(ack?.kind==='ack'&&Number(ack.remoteRevision)>=2)publishAcks.push(true);
    }catch{}
  });
  coachScope.enabled=true;
  await context.setOffline(false);
  await publish.click();
  await expect.poll(()=>publishAcks.length,{timeout:40_000}).toBe(1);
  coachScope.serverPublicationConfirmed=true;
  trace.publicationAck=true;
  evidence.businessMutationsPerformed=true;
  expect(coachScope.typeCounts.get('SESION_PUBLICAR')).toBe(1);
  expect(coachScope.sessionId).toMatch(UUID);
  // Keep the already-scoped permission alive for an own-draft ACK cleanup;
  // the policy still forbids every second publication operation and any
  // publication for another session. Disable it at the verified final state.

  const clientPage=client.page;
  let latestBootstrap=null,clientPageErrors=[];
  clientPage.on('pageerror',e=>clientPageErrors.push(String(e?.message||'PAGE_ERROR').slice(0,120)));
  clientPage.on('response',async response=>{
    try{
      if(response.status()!==200||
         new URL(response.url()).origin!==QA_ORIGIN||
         new URL(response.url()).pathname!=='/rest/v1/rpc/iberfit_bootstrap_v26')return;
      const body=await response.json();
      if(body?.user?.clientId===client.clientId)latestBootstrap=body?.data||null;
    }catch{}
  });
  await clientPage.reload({waitUntil:'domcontentloaded',timeout:25_000});
  await expect(clientPage.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:35_000});
  // Dismiss contextual onboarding without altering the Client's training.
  const welcome=clientPage.locator('[data-m26-client-guided-welcome]');
  if(await welcome.isVisible().catch(()=>false)){
    const pause=clientPage.locator('[data-m26-client-guided-welcome-pause]').first();
    if(await pause.isVisible().catch(()=>false))await pause.click();
  }
  for(const selector of ['[data-m26-guided-tour-close]:visible',
    '[data-m26-client-context-guide-close]:visible']){
    const close=clientPage.locator(selector).first();
    if(await close.isVisible().catch(()=>false))await close.click();
  }
  await clientPage.locator('[data-m26-area="sesion"]:visible').first().click();
  const card=clientPage.locator('[data-rc39-session]').filter({hasText:coachScope.title});
  await expect(card,'Exact fresh running session must be actionable for Client A').toHaveCount(1,{timeout:25_000});
  const sessionId=await card.getAttribute('data-rc39-session');
  expect(sessionId).toBe(coachScope.sessionId);
  await expect.poll(()=>latestBootstrap,{timeout:10_000}).not.toBeNull();
  // The just-published UUID has never existed previously. Both server
  // projections must be present, and neither may contain a prior execution
  // of THIS newly created session. The server also enforces active locks.
  const entities=latestBootstrap?.m26Entities,history=latestBootstrap?.sessionExecutions;
  expect(Array.isArray(entities),'Authoritative canonical projection required').toBe(true);
  expect(Array.isArray(history),'Authoritative history projection required').toBe(true);
  const targetedExecution=entities.filter(item=>
    String(item?.entity_type||item?.entityType)==='session_execution'&&
    String(item?.body?.sessionId||item?.body?.session_id||'')===sessionId);
  const priorLegacy=history.filter(item=>
    String(item?.sessionId||item?.session_id||'')===sessionId);
  expect(targetedExecution,'Newly minted session cannot already have an execution').toHaveLength(0);
  expect(priorLegacy,'No pre-existing legacy execution of this new session').toHaveLength(0);
  trace.clientVisible=true;
  Object.assign(clientScope,{sessionId,serverPublicationConfirmed:true,historyClean:true});
  // The original U47 14-minute hang selected an invisible nested summary.
  // Reveal an explicitly archived card, then enforce a bounded visible CTA.
  const archive=card.locator('xpath=ancestor::details[@data-signature-session-archive]');
  if(await archive.count()&&!(await archive.first().evaluate(node=>node.open)))
    await archive.first().locator(':scope > summary').click({timeout:5000});
  await expect(card,'A workout must be visible, not only present in the DOM')
    .toBeVisible({timeout:10000});
  const action=card.locator('[data-workflow-action="start-published-session"]');
  await expect(action,'Primary CTA must be visible without opening exercise details')
    .toBeVisible({timeout:8000});
  const acceptedAcks=[],httpErrors=[];
  clientPage.on('response',async response=>{
    try{
      const url=new URL(response.url());
      if(url.origin!==QA_ORIGIN)return;
      if(response.status()>=500)httpErrors.push(response.status());
      if(response.status()!==200||url.pathname!=='/rest/v1/rpc/iberfit_execute_command_v26')return;
      const cmd=response.request().postDataJSON()?.p_command;
      if(!cmd||!clientScope.uniqueByOperation.has(cmd.operationId))return;
      const ack=await response.json();
      if(!['ack','duplicate'].includes(String(ack?.kind||'').toLowerCase()))return;
      if(String(ack?.operationId||ack?.operation_id||'')!==cmd.operationId||
         !Number.isSafeInteger(Number(ack?.remoteRevision??ack?.remote_revision)))return;
      if(!acceptedAcks.some(item=>item.operationId===cmd.operationId))
        acceptedAcks.push({operationId:cmd.operationId,type:cmd.type});
    }catch{}
  });
  clientScope.enabled=true;
  await action.click();
  const livePlayer=clientPage.locator('[data-session-live-state]');
  await expect(livePlayer,'First CTA must mount a genuine player, not fake success')
    .toBeVisible({timeout:25_000});
  trace.firstTapPrepared=true;
  if(await clientPage.locator('[data-session-live-state="ready"]').count())
    await clientPage.locator('[data-session-action="start"]').first().click();
  await expect(clientPage.locator('[data-session-live-state="active"]')).toBeVisible({timeout:25_000});
  await expect.poll(()=>acceptedAcks.some(x=>x.type==='SESION_INICIAR'),{timeout:25_000}).toBe(true);
  trace.startAck=true;
  await clientPage.locator('[data-set-field="distanceKm"]').first().fill('6.5');
  await clientPage.locator('[data-set-field="durationMinutes"]').first().fill('35.8');
  await clientPage.locator('[data-set-field="rpe"]').first().fill('7');
  const completeSet=clientPage.locator('[data-session-live-state="active"] [data-session-action="complete-set"]');
  await expect(completeSet).toBeEnabled({timeout:15_000});
  await completeSet.click();
  await expect.poll(()=>acceptedAcks.some(x=>x.type==='EJECUCION_GUARDAR_PROGRESO'),
    {timeout:25_000}).toBe(true);
  clientScope.setConfirmed=true;
  trace.progressAck=true;
  const feedback=clientPage.locator('[data-session-live-state="feedback"]');
  if(!await feedback.isVisible().catch(()=>false)){
    const advance=clientPage.locator('[data-session-rest-focus] [data-session-action="next"]');
    await expect(advance,'A one-block cardio workout must offer real progression').toBeEnabled({timeout:20_000});
    await advance.click();
  }
  await expect(feedback).toBeVisible({timeout:20_000});
  await clientPage.locator('[data-session-feedback-rpe]').fill('7');
  await clientPage.locator('[data-session-feedback-comment]')
    .fill('IBERFIT QA U47 · running 6,5 km · registro sintético verificado');
  const finish=clientPage.locator('[data-session-action="finish"]');
  await expect(finish).toBeEnabled({timeout:20_000});
  await finish.click();
  await expect(clientPage.locator('[data-session-live-state="completed"]')).toBeVisible({timeout:25_000});
  await expect.poll(()=>acceptedAcks.some(x=>x.type==='EJECUCION_COMPLETAR'),
    {timeout:20_000}).toBe(true);
  trace.finishAck=true;
  clientScope.enabled=false;
  await clientPage.locator('[data-session-action="exit-session"]').first().click();
  const historyCard=clientPage.locator('[data-m43-session-history] [data-m43-completed-session]')
    .filter({hasText:coachScope.title});
  await expect(historyCard).toHaveCount(1,{timeout:25_000});
  await expect(historyCard).toContainText('1 registro');
  const count=clientScope.uniqueByOperation.size;
  await clientPage.reload({waitUntil:'domcontentloaded',timeout:25_000});
  await expect(clientPage.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:35_000});
  await clientPage.locator('[data-m26-area="sesion"]:visible').first().click();
  await expect(clientPage.locator('[data-m43-session-history] [data-m43-completed-session]')
    .filter({hasText:coachScope.title})).toHaveCount(1,{timeout:25_000});
  expect(clientScope.uniqueByOperation.size,'Reload cannot dispatch a duplicate workout').toBe(count);
  coachScope.enabled=false;
  expect(client.evidence.blocked,'No Client request outside the one-shot QA scope').toEqual([]);
  expect(evidence.blocked,'No unrelated Coach business mutation').toEqual([]);
  expect(clientPageErrors,'No new Client page errors').toEqual([]);
  expect(httpErrors,'No QA backend 5xx during real execution').toEqual([]);
  trace.historyReloaded=true;
  evidence.u47Running={...trace,verified:true,qaOnly:true,autonomous:true,
    oneSession:true,oneStart:true,oneCompletion:true,recordedSets:1,
    serverAcknowledged:true,clientReadback:true,source:'browser-authenticated'};
}
