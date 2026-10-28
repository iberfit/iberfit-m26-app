/**
 * SIGNATURE U56 — one-shot, synthetic, QA-only Coach UI publication.
 * The normal WebAuthn gate stays read-only. A trusted Canary push with the
 * exact U56 merge-title opt-in is the sole authorizer for this positive test.
 * No JWT, full command body, client identifier or password is serialized.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const QA_ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const CANARY_ORIGIN='https://m26-canary.iberfit.cl';

export function allowedU56SyntheticWrite(request,scope){
  if(process.env.M26_QA_U56_PUBLISH!=='true'||!scope?.enabled||
     !UUID.test(String(scope.clientId||''))||request.method().toUpperCase()!=='POST')return false;
  let url,body;
  try{
    url=new URL(request.url());
    body=request.postDataJSON();
    const headers=request.headers();
    const bearer=String(headers.authorization||headers.Authorization||'');
    if(!/^Bearer [A-Za-z0-9_.~-]+$/u.test(bearer)||/service[_-]?role|supabase_secret/iu.test(bearer))return false;
  }catch{return false;}
  if(url.origin!==QA_ORIGIN)return false;
  const prefix='/rest/v1/rpc/';
  if(!url.pathname.startsWith(prefix))return false;
  const rpc=url.pathname.slice(prefix.length);
  if(rpc==='m26_draft_upsert_v431'){
    const p=body?.p_payload;
    if(p?.clientId!==scope.clientId||p.scope!=='session-builder'||
       p?.draft?.title!==scope.title||p.draft.clientId!==scope.clientId)return false;
    scope.draftWrites=(scope.draftWrites||0)+1;
    return true;
  }
  if(rpc==='m26_draft_delete_v431'){
    if(body?.p_client_id!==scope.clientId||body?.p_scope!=='session-builder')return false;
    scope.draftDeletes=(scope.draftDeletes||0)+1;
    return true;
  }
  if(!['iberfit_command_preflight_v26','iberfit_execute_command_v26'].includes(rpc))return false;
  const cmd=body?.p_command,patch=cmd?.payload?.patch;
  if(cmd?.type!=='SESION_PUBLICAR'||cmd.entityType!=='session'||
     cmd.clientId!==scope.clientId||!UUID.test(String(cmd.entityId||''))||
     !UUID.test(String(cmd.operationId||''))||cmd.previewAccepted!==true||
     cmd.baseRevision!==0||patch?.id!==cmd.entityId||
     patch?.clientId!==scope.clientId||patch.title!==scope.title||
     patch.visibleToClient!==true||patch.deliveryModality!=='guiada_en_app'||
     !Array.isArray(patch.blocks)||patch.blocks.length!==2)return false;
  const fingerprint=JSON.stringify(cmd);
  if(scope.sessionId&&scope.sessionId!==cmd.entityId)return false;
  if(scope.fingerprint&&scope.fingerprint!==fingerprint)return false;
  // The command remains in memory only; evidence contains no IDs/payloads.
  scope.fingerprint=fingerprint;
  scope.sessionId=cmd.entityId;
  scope.operationId=cmd.operationId;
  if(rpc==='iberfit_command_preflight_v26'){
    if((scope.preflights||0)>1)return false;
    scope.preflights=(scope.preflights||0)+1;
  }else{
    if((scope.executions||0)>1)return false;
    scope.executions=(scope.executions||0)+1;
  }
  return true;
}

export async function openU56ClientReadOnly(browser,installPolicy,writeScope=null){
  const {expect}=await import('@playwright/test');
  for(const key of ['M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT'])
    expect(process.env[key],'U56 requires real synthetic QA credentials and run ID').toBeTruthy();
  expect(process.env.M26_QA_CLIENT_A_EMAIL).toBe('qa.rc74.client-a@iberfit.cl');
  const context=await browser.newContext({
    locale:'es-ES',timezoneId:'America/Santiago',
    serviceWorkers:'block',viewport:{width:390,height:844},hasTouch:true,
  });
  const evidence={blocked:[],qaRequests:[],webauthnActions:[]};
  await installPolicy(context,evidence,writeScope);
  const page=await context.newPage(),pageErrors=[];
  let clientId=null;
  page.on('pageerror',error=>pageErrors.push(String(error?.message||'PAGE_ERROR').slice(0,150)));
  page.on('response',async(response)=>{
    try{
      const url=new URL(response.url());
      if(url.origin!==QA_ORIGIN||url.pathname!=='/rest/v1/rpc/iberfit_bootstrap_v26'||
        response.status()!==200)return;
      const body=await response.json(),id=String(body?.user?.clientId||'');
      if(['client','cliente'].includes(String(body?.user?.role||'').toLowerCase())&&UUID.test(id))
        clientId=id;
    }catch{}
  });
  try{
    await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:25_000});
    await page.getByRole('textbox',{name:'Correo',exact:true}).fill(process.env.M26_QA_CLIENT_A_EMAIL);
    await page.locator('#m26-login-password').fill(process.env.M26_QA_CLIENT_A_PASSWORD);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await expect(page.locator('.m26-shell[data-m26-role="client"]')).toBeVisible({timeout:40_000});
    await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:25_000});
    await expect.poll(()=>clientId,{timeout:15_000}).toMatch(UUID);
    expect(pageErrors,'Client QA must have no page errors').toEqual([]);
    expect(evidence.blocked,'Client must remain read-only').toEqual([]);
    return {context,page,evidence,pageErrors,clientId};
  }catch(error){await context.close().catch(()=>{});throw error;}
}

export async function certifyU56OnlineCoachPublish({
  page,context,cdp,client,scope,evidence,setDevice,
}){
  const {expect}=await import('@playwright/test');
  expect(scope.clientId).toBe(client.clientId);
  expect(scope.title).toMatch(/^QA U56 · Coach UI [0-9]{1,20}-[0-9]{1,5}$/u);
  await setDevice(page,cdp,{name:'u56-publish',width:1440,height:1000,mobile:false,touch:false});
  await expect(page.locator('[data-session-action="publish"]').first()).toBeEnabled();
  let ack=false;
  page.on('response',async(response)=>{
    try{
      if(response.status()!==200||
         new URL(response.url()).pathname!=='/rest/v1/rpc/iberfit_execute_command_v26')return;
      const sent=response.request().postDataJSON()?.p_command;
      if(sent?.operationId!==scope.operationId||sent?.entityId!==scope.sessionId)return;
      const body=await response.json();
      if(body?.kind==='ack'&&Number(body?.remoteRevision)>=1)ack=true;
    }catch{}
  });
  scope.enabled=true;
  await context.setOffline(false);
  await page.locator('[data-session-action="publish"]').first().click();
  await expect.poll(()=>ack,{timeout:40_000,message:'UI publish requires genuine server ACK'})
    .toBe(true);
  // The server ACK is irreversible evidence even if later Client read-back fails.
  evidence.businessMutationsPerformed=true;
  evidence.u56OnlineCoachPublish={verified:false,serverAck:true,clientVisible:false,
    backendMutationCertified:true,clientReadOnly:true,executionStarted:false,qaOnly:true};
  // The command bus can send an authenticated, server-validated execute
  // directly. A separate client-side preflight is optional, not evidence of
  // whether the server validated or committed the publication.
  expect(scope.preflights||0,'Zero or one optional preflight').toBeLessThanOrEqual(1);
  expect(scope.executions,'Exactly one validated publication command').toBe(1);
  await client.page.reload({waitUntil:'domcontentloaded',timeout:25_000});
  await expect(client.page.locator('.m26-shell[data-m26-role="client"]')).toBeVisible({timeout:45_000});
  await expect(client.page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:30_000});
  await client.page.locator('[data-m26-area="sesion"]:visible').first().click();
  const card=client.page.locator('[data-rc39-session]').filter({hasText:scope.title});
  await expect(card,'The exact synthetic Client must see one published session')
    .toHaveCount(1,{timeout:25_000});
  expect(await card.getAttribute('data-rc39-session')).toBe(scope.sessionId);
  const preview=card.locator('details.m26-session-preview-disclosure');
  await expect(preview).toBeVisible();
  await preview.locator(':scope > summary').click();
  await expect(card.locator('[data-workflow-action="start-published-session"]'),
    'Guided publication must provide Client start CTA').toHaveCount(1);
  expect(client.evidence.blocked,'No forbidden Client requests').toEqual([]);
  expect(client.pageErrors,'Client UI must not throw').toEqual([]);
  expect(evidence.blocked,'No unrelated Coach mutation').toEqual([]);
  evidence.u56OnlineCoachPublish={
    verified:true,serverAck:true,clientVisible:true,backendMutationCertified:true,
    clientReadOnly:true,executionStarted:false,qaOnly:true,
    preflights:scope.preflights||0,executions:scope.executions,
  };
  evidence.businessMutationsPerformed=true;
}


/**
 * SIGNATURE U57. Resume the already-confirmed U56 publication without creating
 * a second session, sending a command or touching production. A live Client
 * account must receive the exact synthetic session generated by the failed
 * post-ACK test, and must see a guided start CTA in the actual product UI.
 */
export async function certifyU57ExistingClientReadback({browser,installPolicy,evidence}){
  const {expect}=await import('@playwright/test');
  if(process.env.M26_QA_U57_VERIFY!=='true')throw Error('U57_READBACK_NOT_OPTED_IN');
  const title='QA U56 · Coach UI 39887295351-1';
  const client=await openU56ClientReadOnly(browser,installPolicy);
  try{
    const {page}=client;
    const welcome=page.locator('[data-m26-client-guided-welcome]');
    if(await welcome.isVisible().catch(()=>false)){
      const pause=page.locator('[data-m26-client-guided-welcome-pause]').first();
      if(await pause.count())await pause.click();
    }
    for(const selector of [
      '[data-m26-guided-tour-close]:visible',
      '[data-m26-client-context-guide-close]:visible',
    ]){
      const close=page.locator(selector).first();
      if(await close.count())await close.click();
    }
    await page.locator('[data-m26-area="sesion"]:visible').first().click();
    await expect(page.locator('[data-m26-controllers="ready"]'),
      'Client route must have real event handlers attached').toHaveCount(1,{timeout:25_000});
    const card=page.locator('[data-rc39-session]').filter({hasText:title});
    await expect(card,'U56 previously committed session visible exactly once to QA Client A')
      .toHaveCount(1,{timeout:25_000});
    const sessionId=await card.getAttribute('data-rc39-session');
    expect(sessionId).toMatch(UUID);
    const disclosure=card.locator('details.m26-session-preview-disclosure');
    await expect(disclosure).toBeVisible();
    await disclosure.locator(':scope > summary').click();
    const action=card.locator('[data-workflow-action="start-published-session"]');
    await expect(action,'Confirmed guided session can be started by its real Client')
      .toBeVisible({timeout:10_000});
    await page.reload({waitUntil:'domcontentloaded',timeout:25_000});
    await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:30_000});
    await page.locator('[data-m26-area="sesion"]:visible').first().click();
    const restored=page.locator('[data-rc39-session]').filter({hasText:title});
    await expect(restored,'The same U56 session must persist across a reload')
      .toHaveCount(1,{timeout:25_000});
    expect(await restored.getAttribute('data-rc39-session')).toBe(sessionId);
    expect(client.evidence.blocked,'Strictly read-only QA Client network').toEqual([]);
    expect(client.pageErrors,'No Client page errors').toEqual([]);
    evidence.u57ExistingClientReadback={verified:true,existingSession:true,
      reloadedSameSession:true,clientCanStart:true,
      qaOnly:true,businessMutationsPerformed:false,
    };
  }finally{
    await client.context.close();
  }
}
