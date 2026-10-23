/**
 * SIGNATURE U58 · one existing U56 session, one real Client QA workout.
 * This file is inert unless explicitly called from a trusted canary push.
 * On unexpected failure, preserve server state for forensic recovery instead
 * of resetting Client A or silently overwriting active execution.
 */
import {createU58ExecutionScope,inspectU58CanonicalHistory,U58_EXISTING_QA_SESSION_TITLE} from './u58-execution-policy.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const QA_ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const CANARY_ORIGIN='https://m26-canary.iberfit.cl';

// A visible, explicit connectivity error permits a bounded first-factor retry.
// No other error (credentials, role or unknown state) is retryable by this gate.
export function classifyU58LoginState({clientShellVisible,connectionErrorVisible}){
  if(clientShellVisible)return 'ready';
  if(connectionErrorVisible)return 'retryable-network-error';
  return 'pending';
}

export async function certifyU58ExistingClientExecution({browser,installPolicy,evidence}){
  const {expect}=await import('@playwright/test');
  if(process.env.M26_QA_U58_EXECUTE!=='true')throw Error('U58_NOT_AUTHORIZED');
  if(process.env.M26_QA_CLIENT_A_EMAIL!=='qa.rc74.client-a@iberfit.cl'||
    !process.env.M26_QA_CLIENT_A_PASSWORD)throw Error('U58_QA_IDENTITY_MISSING');
  const context=await browser.newContext({
    locale:'es-ES',timezoneId:'America/Santiago',
    serviceWorkers:'block',viewport:{width:390,height:844},hasTouch:true,
  });
  const clientEvidence={blocked:[],qaRequests:[],webauthnActions:[]};
  const scope={enabled:false};
  let started=false,finished=false,loginAttempts=0,clientNetworkFailures=0;
  await installPolicy(context,clientEvidence,scope);
  const page=await context.newPage();
  const errors=[],acks=[],httpErrors=[];
  let clientId=null,bootstrapEntities=null,bootstrapHistory=null;
  page.on('pageerror',err=>errors.push(String(err?.message||'PAGE_ERROR').slice(0,160)));
  page.on('requestfailed',request=>{
    try{
      const url=new URL(request.url());
      if(url.origin===QA_ORIGIN&&url.pathname==='/auth/v1/token')
        clientNetworkFailures++;
    }catch{}
  });
  page.on('response',async response=>{
    try{
      const url=new URL(response.url());
      if(url.origin!==QA_ORIGIN)return;
      if(response.status()>=500)httpErrors.push(String(response.status())+' '+url.pathname);
      if(response.status()!==200)return;
      if(url.pathname==='/rest/v1/rpc/iberfit_bootstrap_v26'){
        const payload=await response.json();
        const next=String(payload?.user?.clientId||'');
        if(['client','cliente'].includes(String(payload?.user?.role||'').toLowerCase())&&UUID.test(next)){
          clientId=next;
          // Do not infer "no prior execution" from a missing/malformed
          // bootstrap collection. Absence of evidence is NOT permission.
          const data=payload?.data;
          // The canonical bootstrap exposes BOTH entity and execution
          // collections. Inspecting only the first array could miss an
          // active execution or the previous run of this exact session.
          // Do not arm a one-shot write if either collection is absent.
          const entities=Array.isArray(data?.m26Entities)?data.m26Entities:null;
          const histories=Array.isArray(data?.sessionExecutions)?data.sessionExecutions:null;
          bootstrapEntities=entities&&histories?entities:null;
          bootstrapHistory=entities&&histories?histories:null;
        }
      }
      if(url.pathname==='/rest/v1/rpc/iberfit_execute_command_v26'){
        const cmd=response.request().postDataJSON()?.p_command;
        if(!cmd||!scope.executionId)return;
        if(cmd.entityId!==scope.executionId&&
          !(cmd.type==='SESION_INICIAR'&&cmd.entityId===scope.sessionId))return;
        const ack=await response.json();
        const ackId=String(ack?.operationId||ack?.operation_id||'');
        const revision=Number(ack?.remoteRevision??ack?.remote_revision);
        if(['ack','duplicate'].includes(String(ack?.kind||'').toLowerCase())&&
          ackId===cmd.operationId&&Number.isInteger(revision)&&revision>=0&&
          !acks.some(item=>item.operationId===ackId))
          acks.push({type:String(cmd.type),revision,operationId:ackId});
      }
    }catch{}
  });
  try{
    await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:25_000});
    const clientShell=page.locator('.m26-shell[data-m26-role="client"]');
    const connectionFailure=page.getByRole('alert')
      .filter({hasText:'No fue posible conectar'});
    // Retry only a conclusively failed first-factor network attempt, before
    // any business write is armed. Unknown auth states fail closed.
    for(let attempt=1;attempt<=2;attempt++){
      loginAttempts=attempt;
      await page.getByRole('textbox',{name:'Correo',exact:true})
        .fill(process.env.M26_QA_CLIENT_A_EMAIL);
      await page.locator('#m26-login-password')
        .fill(process.env.M26_QA_CLIENT_A_PASSWORD);
      await page.getByRole('button',{name:'Entrar',exact:true}).click();
      const state=await expect.poll(async()=>classifyU58LoginState({
        clientShellVisible:await clientShell.isVisible().catch(()=>false),
        connectionErrorVisible:await connectionFailure.isVisible().catch(()=>false),
      }),{timeout:40_000,intervals:[250,500,1000]}).not.toBe('pending')
        .then(async()=>classifyU58LoginState({
          clientShellVisible:await clientShell.isVisible().catch(()=>false),
          connectionErrorVisible:await connectionFailure.isVisible().catch(()=>false),
        }));
      if(state==='ready')break;
      if(state!=='retryable-network-error'||attempt===2)
        throw Error('U58_CLIENT_LOGIN_NETWORK_UNAVAILABLE');
      await page.waitForTimeout(800);
    }
    await expect(clientShell).toBeVisible({timeout:10_000});
    await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:25_000});
    await expect.poll(()=>clientId,{timeout:15_000}).toMatch(UUID);
    for(const [selector,action] of [
      ['[data-m26-client-guided-welcome]','[data-m26-client-guided-welcome-pause]'],
      ['[data-m26-guided-tour-close]:visible',null],
      ['[data-m26-client-context-guide-close]:visible',null],
    ]){
      const node=page.locator(selector).first();
      if(await node.isVisible().catch(()=>false)){
        const button=action?page.locator(action).first():node;
        if(await button.count())await button.click();
      }
    }
    await page.locator('[data-m26-area="sesion"]:visible').first().click();
    await expect(page.locator('[data-m26-controllers="ready"]')).toHaveCount(1,{timeout:25_000});
    const card=page.locator('[data-rc39-session]').filter({hasText:U58_EXISTING_QA_SESSION_TITLE});
    await expect(card,'Only the real pre-existing U56 session can be executed').toHaveCount(1,{timeout:25_000});
    const sessionId=await card.getAttribute('data-rc39-session');
    expect(sessionId).toMatch(UUID);
    const preflight=inspectU58CanonicalHistory({
      canonicalEntities:bootstrapEntities,historicalExecutions:bootstrapHistory,
      clientId,sessionId,
    });
    evidence.u58HistoryPreflight={
      ok:preflight.ok,reason:preflight.reason,
      canonicalCount:preflight.canonicalCount,
      reconciledHistory:preflight.reconciledHistory,
      cancelledCount:preflight.cancelledCount,
    };
    expect(preflight.ok,'Canonical U58 history must reconcile with legacy history: '+
      preflight.reason).toBe(true);
    // No browser-side guess can waive the server's independent execution lock.
    // Only after both authoritative collections reconcile do we arm QA writes.
    Object.assign(scope,createU58ExecutionScope({
      clientId,sessionId,sessionTitle:U58_EXISTING_QA_SESSION_TITLE,
      confirmedNoPriorExecution:true,
    }));
    const summary=card.locator('details.m26-session-preview-disclosure > summary');
    await expect(summary).toBeVisible();
    await summary.click();
    const startCTA=card.locator('[data-workflow-action="start-published-session"]');
    await expect(startCTA).toBeVisible();
    scope.enabled=true;
    await startCTA.click();
    const live=page.locator('[data-session-live-state]');
    await expect(live).toBeVisible({timeout:20_000});
    if(await page.locator('[data-session-live-state="ready"]').count())
      await page.locator('[data-session-action="start"]').click();
    await expect(page.locator('[data-session-live-state="active"]')).toBeVisible({timeout:25_000});
    await expect.poll(()=>acks.some(x=>x.type==='SESION_INICIAR'),{timeout:20_000}).toBe(true);
    started=true;
    // Use actual Client V3 buttons. The former dock selector is absent.
    const completeSet=page.locator('[data-session-live-state="active"] [data-session-action="complete-set"]');
    // The final recorded set has a review/advance card but no active rest
    // countdown; "next" must work for BOTH rest and last-set review.
    const advanceRest=page.locator('[data-session-rest-focus] [data-session-action="next"]');
    await page.locator('[data-session-action="pause"]').first().click();
    await expect(page.locator('[data-session-live-state="paused"]')).toBeVisible({timeout:20_000});
    await page.locator('[data-session-action="resume"]').click();
    await expect(page.locator('[data-session-live-state="active"]')).toBeVisible({timeout:20_000});

    for(let n=1;n<=4;n++){
      await page.locator('[data-set-field="reps"]').first().fill('8');
      await page.locator('[data-set-field="load"]').first().fill('10 kg');
      await page.locator('[data-set-field="rpe"]').first().fill(n%2===0?'8':'7');
      await expect(completeSet,'Actual Client V3 Completar serie must be actionable')
        .toBeVisible({timeout:20_000});
      await expect(completeSet).toBeEnabled({timeout:20_000});
      await completeSet.click();
      await expect.poll(()=>acks.filter(x=>x.type==='EJECUCION_GUARDAR_PROGRESO').length,
        {timeout:25_000}).toBeGreaterThanOrEqual(n);
      await expect(page.locator('[data-session-rest-focus]'),
        'Each confirmed set must reach the genuine rest / advance state').toBeVisible({timeout:20_000});
      await expect(page.locator('[data-m26-session-action-pending="true"]')).toHaveCount(0,{timeout:20_000});
      await expect(advanceRest,'Actual Client V3 Continuar ahora must be enabled')
        .toBeEnabled({timeout:20_000});
      await advanceRest.click();
      if(n===4)break; // The last NEXT, not COMPLETE SET, opens final feedback.
      await expect(page.locator('[data-session-live-state="active"]')).toBeVisible({timeout:20_000});
    }
    await expect(page.locator('[data-session-live-state="feedback"]'),
      'Four sets must reach final feedback, not an early completion').toBeVisible({timeout:25_000});
    scope.reviewedFourSets=true;
    await page.locator('[data-session-feedback-rpe]').fill('7');
    await page.locator('[data-session-feedback-comment]')
      .fill('IBERFIT QA U58 · cierre sintético de la sesión U56');
    const finish=page.locator('[data-session-action="finish"]');
    await expect(finish).toBeEnabled({timeout:20_000});
    await finish.scrollIntoViewIfNeeded();
    await finish.click();
    await expect(page.locator('[data-session-live-state="completed"]')).toBeVisible({timeout:25_000});
    await expect.poll(()=>acks.some(x=>x.type==='EJECUCION_COMPLETAR'),
      {timeout:20_000}).toBe(true);
    finished=true;
    await page.locator('[data-session-action="exit-session"]').first().click();
    await expect(page.locator('[data-m27-session-surface="sessions"]')).toBeVisible({timeout:25_000});
    const history=page.locator('[data-m43-session-history] [data-m43-completed-session]')
      .filter({hasText:U58_EXISTING_QA_SESSION_TITLE});
    await expect(history).toHaveCount(1,{timeout:25_000});
    await expect(history).toContainText('4 registros');
    const writesBeforeReload=scope.uniqueByOperation.size;
    await page.reload({waitUntil:'domcontentloaded',timeout:25_000});
    await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:35_000});
    await page.locator('[data-m26-area="sesion"]:visible').first().click();
    await expect(page.locator('[data-m43-session-history] [data-m43-completed-session]')
      .filter({hasText:U58_EXISTING_QA_SESSION_TITLE})).toHaveCount(1,{timeout:25_000});
    expect(scope.uniqueByOperation.size,'Reload must never repeat server mutations')
      .toBe(writesBeforeReload);
    expect(clientEvidence.blocked).toEqual([]);
    expect(errors).toEqual([]);
    expect(httpErrors).toEqual([]);
    evidence.u58ExistingClientExecution={
      verified:true,started:true,finished:true,
      confirmedSetAcks:acks.filter(x=>x.type==='EJECUCION_GUARDAR_PROGRESO').length,
      priorExecutions:0,reloadedHistory:true,qaOnly:true,
    };
  }finally{
    evidence.u58ExecutionAttempt={started,finished,loginAttempts,clientNetworkFailures,
      distinctOperationCount:scope.uniqueByOperation?.size||0,
      blockedRequests:clientEvidence.blocked.length,
      serverErrors:httpErrors.length,clientPageErrors:errors.length};
    await context.close().catch(()=>{});
  }
}
