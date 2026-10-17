import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {test,expect} from '@playwright/test';

const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const QA_ORIGIN='https://'+QA_PROJECT_REF+'.supabase.co';
const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const BUILD_ROOT=path.resolve('.tmp/rc64-current-surface');
const PUBLIC_BUILD_ROOT=path.join(BUILD_ROOT,'public');
const OUT_DIR=path.resolve('recovery/m45-release-cert');
const SESSION_KEY='iberfit:m26:session:v1';
const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
];
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'};

function safeCandidate(base,relative){
  const candidate=path.resolve(base,relative);
  return candidate===base||candidate.startsWith(base+path.sep)?candidate:null;
}
async function currentSource(relative){
  for(const base of [BUILD_ROOT,PUBLIC_BUILD_ROOT]){
    const candidate=safeCandidate(base,relative);
    if(!candidate)continue;
    try{return {body:await readFile(candidate),candidate};}catch{}
  }
  return null;
}
async function fulfillCurrentSource(route,url){
  let pathname=decodeURIComponent(url.pathname||'/');
  if(pathname==='/'||pathname==='')pathname='/index.html';
  const relative=pathname.startsWith('/')?pathname.slice(1):pathname;
  const resolved=await currentSource(relative);
  if(resolved){
    const ext=path.extname(resolved.candidate).toLowerCase();
    await route.fulfill({status:200,body:resolved.body,headers:{'content-type':MIME[ext]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'}});
    return;
  }
  if(!path.extname(relative)){
    const body=await readFile(path.join(BUILD_ROOT,'index.html'));
    await route.fulfill({status:200,body,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
    return;
  }
  await route.fulfill({status:404,body:'Not found'});
}
async function installNetworkFence(context,evidence){
  await context.route('**/*',async(route)=>{
    let url;
    try{url=new URL(route.request().url());}catch{evidence.blocked.push('INVALID_URL');await route.abort('blockedbyclient');return;}
    if(url.origin===CANARY_ORIGIN){await fulfillCurrentSource(route,url);return;}
    if(url.origin===QA_ORIGIN){evidence.qaRequestCount+=1;await route.continue();return;}
    evidence.blocked.push(url.origin+url.pathname);
    await route.abort('blockedbyclient');
  });
}
async function addVirtualAuthenticator(page){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const added=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  return {cdp,authenticatorId:added.authenticatorId};
}
async function loginCoachWebAuthn(page,email,password){
  await expect(page.getByRole('textbox',{name:'Correo',exact:true})).toBeVisible({timeout:20_000});
  await page.getByRole('textbox',{name:'Correo',exact:true}).fill(email);
  await page.locator('#m26-login-password').fill(password);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  const button=page.locator('[data-auth-action="mfa-continue-webauthn"]');
  await expect(button).toBeVisible({timeout:20_000});
  await button.click();
  await expect(page.locator('.m26-shell[data-m26-role="coach"]')).toBeVisible({timeout:30_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:15_000});
}
async function coachToken(page){
  const value=await page.evaluate((key)=>{
    try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}
  },SESSION_KEY);
  if(!value?.token||value.token.length<100)throw new Error('M45_COACH_SESSION_TOKEN_MISSING');
  return value.token;
}
function apiHeaders(token){
  const headers={apikey:process.env.M26_SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json',origin:CANARY_ORIGIN};
  if(token)headers.authorization='Bearer '+token;
  return headers;
}
async function request(pathname,{token,body,method='POST'}={}){
  const response=await fetch(QA_ORIGIN+pathname,{method,headers:apiHeaders(token),body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20_000)});
  const payload=await response.json().catch(()=>null);
  return {ok:response.ok,status:response.status,body:payload};
}
async function rpc(name,token,body={}){
  const result=await request('/rest/v1/rpc/'+name,{token,body});
  if(!result.ok)throw new Error('M45_RPC_'+name+'_HTTP_'+result.status+':'+String(result.body?.message||result.body?.error||''));
  return result.body;
}
async function login(email,password){
  const result=await request('/auth/v1/token?grant_type=password',{body:{email,password}});
  if(!result.ok||!result.body?.access_token||!result.body?.user?.id)throw new Error('M45_CLIENT_LOGIN_FAILED_'+result.status);
  return {token:result.body.access_token,userId:result.body.user.id};
}
function clientIdFromBootstrap(body,label){
  const role=String(body?.user?.role||'').toLowerCase();
  const id=String(body?.user?.clientId||body?.user?.client_id||'');
  if(!['client','cliente'].includes(role)||!/^[0-9a-f-]{36}$/iu.test(id))throw new Error(label+'_BOOTSTRAP_INVALID');
  return id;
}
function command(type,entityType,entityId,clientId,payload,extra={}){
  return {
    operationId:extra.operationId||randomUUID(),
    type,entityType,entityId,clientId,
    baseRevision:Number(extra.baseRevision||0),
    conflictSensitive:Boolean(extra.conflictSensitive),
    reason:extra.reason??null,
    previewAccepted:false,
    payload:payload||{},
  };
}
function hash(value){
  return createHash('sha256').update(String(value)).digest('hex').slice(0,16);
}

test('M45 real QA Coach-Client write E2E on frozen Canary source',async({browser})=>{
  const missing=REQUIRED.filter((name)=>!process.env[name]);
  expect(missing).toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(QA_ORIGIN);
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);

  const runId=String(process.env.GITHUB_RUN_ID||'local');
  const marker='M45-QA-CERT-'+runId+'-'+randomUUID().slice(0,8);
  const evidence={
    schema:'iberfit.m45.release-cert.v1',
    generatedAt:new Date().toISOString(),
    sourceSha:String(process.env.GITHUB_SHA||''),
    projectRef:QA_PROJECT_REF,
    qaOnly:true,
    realPersonData:false,
    serviceRoleUsed:false,
    coachWebAuthnVerified:false,
    coachAssuranceVerified:false,
    messaging:{},
    agenda:{},
    push:{physicalDeliveryCertified:false,reason:'External push-provider delivery is not exercised by this deterministic CI gate.'},
    cleanup:{productLevelAppointmentCancel:false,pushRevoked:false,preferencesRestored:false,adminFixtureCleanupRequired:true},
    opaqueIds:{},
    operationIds:[],
    marker,
    blocked:[],
    qaRequestCount:0,
  };
  const context=await browser.newContext({ignoreHTTPSErrors:false,locale:'es-ES',timezoneId:'America/Santiago',serviceWorkers:'block'});
  await installNetworkFence(context,evidence);
  const page=await context.newPage();
  const {cdp,authenticatorId}=await addVirtualAuthenticator(page);
  try{
    const response=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:25_000});
    expect(response?.status()).toBe(200);
    await loginCoachWebAuthn(page,process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD);

    const logout=page.locator('[data-m26-action="logout"]').first();
    await expect(logout).toHaveCount(1);
    await logout.evaluate((element)=>element.click());
    await expect(page.getByRole('textbox',{name:'Correo',exact:true})).toBeVisible({timeout:20_000});
    await loginCoachWebAuthn(page,process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD);
    const coach= {token:await coachToken(page)};

    const assurance=await rpc('iberfit_privileged_assurance_context_v65d',coach.token,{});
    if(assurance?.iberfitAssurance!=='verified'||assurance?.privileged!==true)throw new Error('M45_COACH_ASSURANCE_NOT_VERIFIED');
    evidence.coachWebAuthnVerified=true;
    evidence.coachAssuranceVerified=true;

    const [clientA,clientB]=await Promise.all([
      login(process.env.M26_QA_CLIENT_A_EMAIL,process.env.M26_QA_CLIENT_A_PASSWORD),
      login(process.env.M26_QA_CLIENT_B_EMAIL,process.env.M26_QA_CLIENT_B_PASSWORD),
    ]);
    const [bootstrapA,bootstrapB]=await Promise.all([
      rpc('iberfit_bootstrap_v26',clientA.token,{}),
      rpc('iberfit_bootstrap_v26',clientB.token,{}),
    ]);
    const clientAId=clientIdFromBootstrap(bootstrapA,'CLIENT_A');
    const clientBId=clientIdFromBootstrap(bootstrapB,'CLIENT_B');
    if(clientAId===clientBId)throw new Error('M45_CLIENT_FIXTURES_NOT_DISTINCT');

    const coachBefore=await rpc('iberfit_communication_bootstrap_v14',coach.token,{p_application:'coach'});
    let thread=(Array.isArray(coachBefore?.threads)?coachBefore.threads:[]).find((item)=>String(item?.clientId||'')===clientAId);
    const threadPreexisting=Boolean(thread?.id);
    let threadId=String(thread?.id||'');
    if(!threadId){
      const openOp=randomUUID();evidence.operationIds.push(openOp);
      const opened=await rpc('iberfit_communication_execute_v14',coach.token,{p_application:'coach',p_command:{operationId:openOp,type:'MESSAGE_THREAD_OPEN',entityId:'',baseRevision:0,payload:{clientId:clientAId,subject:marker}}});
      if(opened?.ok!==true||String(opened?.kind).toLowerCase()!=='ack'||!opened?.threadId)throw new Error('M45_THREAD_OPEN_NOT_ACK');
      threadId=String(opened.threadId);
    }
    evidence.messaging.threadPreexisting=threadPreexisting;
    evidence.opaqueIds.threadId=threadId;

    const coachMessageBody=marker+' coach-to-client';
    const coachSendOp=randomUUID();evidence.operationIds.push(coachSendOp);
    const coachSend=await rpc('iberfit_communication_execute_v14',coach.token,{p_application:'coach',p_command:{operationId:coachSendOp,type:'MESSAGE_SEND',entityId:threadId,baseRevision:0,payload:{threadId,body:coachMessageBody}}});
    if(coachSend?.ok!==true||String(coachSend?.kind).toLowerCase()!=='ack'||!coachSend?.messageId)throw new Error('M45_COACH_MESSAGE_NOT_ACK');
    evidence.opaqueIds.coachMessageId=String(coachSend.messageId);

    const replay=await rpc('iberfit_communication_execute_v14',coach.token,{p_application:'coach',p_command:{operationId:coachSendOp,type:'MESSAGE_SEND',entityId:threadId,baseRevision:0,payload:{threadId,body:coachMessageBody}}});
    if(String(replay?.kind).toLowerCase()!=='duplicate'||String(replay?.messageId)!==String(coachSend.messageId))throw new Error('M45_MESSAGE_IDEMPOTENCY_FAILED');

    const clientView=await rpc('iberfit_communication_bootstrap_v14',clientA.token,{p_application:'client'});
    const visibleMessage=(Array.isArray(clientView?.messages)?clientView.messages:[]).find((item)=>String(item?.id)===String(coachSend.messageId));
    if(!visibleMessage||String(visibleMessage.body)!==coachMessageBody)throw new Error('M45_CLIENT_A_MESSAGE_NOT_VISIBLE');
    const notificationA=(Array.isArray(clientView?.notifications)?clientView.notifications:[]).find((item)=>String(item?.actionEntityId||'')===threadId&&String(item?.body||'')===coachMessageBody);
    if(notificationA?.id)evidence.opaqueIds.clientNotificationId=String(notificationA.id);

    const clientBView=await rpc('iberfit_communication_bootstrap_v14',clientB.token,{p_application:'client'});
    if((Array.isArray(clientBView?.threads)?clientBView.threads:[]).some((item)=>String(item?.id)===threadId))throw new Error('M45_CLIENT_B_THREAD_LEAK');
    if((Array.isArray(clientBView?.messages)?clientBView.messages:[]).some((item)=>String(item?.id)===String(coachSend.messageId)))throw new Error('M45_CLIENT_B_MESSAGE_LEAK');
    const crossSend=await request('/rest/v1/rpc/iberfit_communication_execute_v14',{token:clientB.token,body:{p_application:'client',p_command:{operationId:randomUUID(),type:'MESSAGE_SEND',entityId:threadId,baseRevision:0,payload:{threadId,body:marker+' forbidden'}}}});
    if(![400,403].includes(crossSend.status))throw new Error('M45_CLIENT_B_CROSS_SEND_NOT_DENIED_'+crossSend.status);

    const readOp=randomUUID();evidence.operationIds.push(readOp);
    const readAck=await rpc('iberfit_communication_execute_v14',clientA.token,{p_application:'client',p_command:{operationId:readOp,type:'MESSAGE_MARK_READ',entityId:threadId,baseRevision:0,payload:{threadId}}});
    if(readAck?.ok!==true||String(readAck?.kind).toLowerCase()!=='ack')throw new Error('M45_CLIENT_READ_NOT_ACK');

    const clientReplyBody=marker+' client-to-coach';
    const replyOp=randomUUID();evidence.operationIds.push(replyOp);
    const reply=await rpc('iberfit_communication_execute_v14',clientA.token,{p_application:'client',p_command:{operationId:replyOp,type:'MESSAGE_SEND',entityId:threadId,baseRevision:0,payload:{threadId,body:clientReplyBody}}});
    if(reply?.ok!==true||!reply?.messageId)throw new Error('M45_CLIENT_REPLY_NOT_ACK');
    evidence.opaqueIds.clientMessageId=String(reply.messageId);

    const coachView=await rpc('iberfit_communication_bootstrap_v14',coach.token,{p_application:'coach'});
    const replySeen=(Array.isArray(coachView?.messages)?coachView.messages:[]).find((item)=>String(item?.id)===String(reply.messageId));
    if(!replySeen||String(replySeen.body)!==clientReplyBody)throw new Error('M45_COACH_REPLY_NOT_VISIBLE');
    const notificationCoach=(Array.isArray(coachView?.notifications)?coachView.notifications:[]).find((item)=>String(item?.actionEntityId||'')===threadId&&String(item?.body||'')===clientReplyBody);
    if(notificationCoach?.id)evidence.opaqueIds.coachNotificationId=String(notificationCoach.id);

    const coachReadOp=randomUUID();evidence.operationIds.push(coachReadOp);
    await rpc('iberfit_communication_execute_v14',coach.token,{p_application:'coach',p_command:{operationId:coachReadOp,type:'MESSAGE_MARK_READ',entityId:threadId,baseRevision:0,payload:{threadId}}});
    const clientAfterRead=await rpc('iberfit_communication_bootstrap_v14',clientA.token,{p_application:'client'});
    const coachMessageAfterRead=(Array.isArray(clientAfterRead?.messages)?clientAfterRead.messages:[]).find((item)=>String(item?.id)===String(coachSend.messageId));
    if(!coachMessageAfterRead?.readByClientAt)throw new Error('M45_CLIENT_READ_RECEIPT_MISSING');
    const coachAfterRead=await rpc('iberfit_communication_bootstrap_v14',coach.token,{p_application:'coach'});
    const clientReplyAfterRead=(Array.isArray(coachAfterRead?.messages)?coachAfterRead.messages:[]).find((item)=>String(item?.id)===String(reply.messageId));
    if(!clientReplyAfterRead?.readByCoachAt)throw new Error('M45_COACH_READ_RECEIPT_MISSING');

    evidence.messaging={...evidence.messaging,coachToClientAck:true,idempotentReplay:true,clientReadReceipt:true,clientToCoachAck:true,coachReadReceipt:true,clientBIsolated:true,crossClientWriteDenied:true};

    const prefBefore=await rpc('iberfit_notification_preferences_status_v1',clientA.token,{});
    const oldCoachMessages=Boolean(prefBefore?.preferences?.coachMessages);
    const toggled=await rpc('iberfit_notification_preferences_upsert_v1',clientA.token,{p_preferences:{coachMessages:!oldCoachMessages}});
    if(toggled?.ok!==true||Boolean(toggled?.preferences?.coachMessages)===oldCoachMessages)throw new Error('M45_NOTIFICATION_PREF_UPDATE_FAILED');
    const restored=await rpc('iberfit_notification_preferences_upsert_v1',clientA.token,{p_preferences:{coachMessages:oldCoachMessages}});
    if(restored?.ok!==true||Boolean(restored?.preferences?.coachMessages)!==oldCoachMessages)throw new Error('M45_NOTIFICATION_PREF_RESTORE_FAILED');
    evidence.cleanup.preferencesRestored=true;

    const pushConfig=await request('/functions/v1/iberfit-web-push-sender-v1',{token:clientA.token,body:{action:'config'}});
    if(!pushConfig.ok||pushConfig.body?.ok!==true||pushConfig.body?.configured!==true||String(pushConfig.body?.publicKey||'').length<40)throw new Error('M45_PUSH_CONFIG_NOT_READY');
    const endpoint='https://push.invalid/iberfit/'+runId+'/'+randomUUID();
    const fakeSubscription={endpoint,expirationTime:null,keys:{p256dh:'A'.repeat(88),auth:'B'.repeat(24)}};
    const pushUpsert=await rpc('iberfit_web_push_upsert_v1',clientA.token,{p_subscription:fakeSubscription});
    if(pushUpsert?.ok!==true||pushUpsert?.active!==true)throw new Error('M45_PUSH_UPSERT_FAILED');
    const pushStatus=await rpc('iberfit_web_push_status_v1',clientA.token,{p_endpoint:endpoint});
    if(pushStatus?.ok!==true||pushStatus?.active!==true)throw new Error('M45_PUSH_STATUS_FAILED');
    const pushCross=await request('/rest/v1/rpc/iberfit_web_push_upsert_v1',{token:clientB.token,body:{p_subscription:fakeSubscription}});
    if(![400,403].includes(pushCross.status))throw new Error('M45_PUSH_CROSS_ACTOR_NOT_DENIED_'+pushCross.status);
    const pushRevoke=await rpc('iberfit_web_push_revoke_v1',clientA.token,{p_endpoint:endpoint});
    if(pushRevoke?.ok!==true||Number(pushRevoke?.deletedCount)!==1)throw new Error('M45_PUSH_REVOKE_COUNT_INVALID');
    const pushAfter=await rpc('iberfit_web_push_status_v1',clientA.token,{p_endpoint:endpoint});
    if(pushAfter?.active===true)throw new Error('M45_PUSH_REVOKE_NOT_EFFECTIVE');
    evidence.push={...evidence.push,configReady:true,upsertConfirmed:true,statusConfirmed:true,crossActorDenied:true,revokeConfirmed:true};
    evidence.cleanup.pushRevoked=true;

    const appointmentId=randomUUID();
    const startAt=new Date(Date.now()+24*60*60*1000).toISOString();
    const endAt=new Date(Date.now()+25*60*60*1000).toISOString();
    const createAppointment=command('CITA_CREAR','appointment',appointmentId,clientAId,{appointment:{startAt,endAt,title:marker,modality:'online'}},{conflictSensitive:true});
    evidence.operationIds.push(createAppointment.operationId);
    const appointmentPreflight=await rpc('iberfit_command_preflight_v26',coach.token,{p_command:createAppointment});
    if(String(appointmentPreflight?.kind).toLowerCase()!=='ack')throw new Error('M45_APPOINTMENT_PREFLIGHT_'+String(appointmentPreflight?.reason||appointmentPreflight?.kind));
    const appointmentCreate=await rpc('iberfit_execute_command_v26',coach.token,{p_command:createAppointment});
    if(String(appointmentCreate?.kind).toLowerCase()!=='ack')throw new Error('M45_APPOINTMENT_CREATE_'+String(appointmentCreate?.reason||appointmentCreate?.kind));
    evidence.opaqueIds.appointmentId=appointmentId;

    const change=await rpc('iberfit_request_appointment_change_v13',clientA.token,{p_appointment_id:appointmentId,p_client_id:clientAId,p_reason:'QA '+marker});
    if(change?.ok!==true||!change?.requestId||String(change?.status)!=='pending')throw new Error('M45_APPOINTMENT_CHANGE_REQUEST_FAILED');
    evidence.opaqueIds.appointmentChangeRequestId=String(change.requestId);

    const crossChange=await request('/rest/v1/rpc/iberfit_request_appointment_change_v13',{token:clientB.token,body:{p_appointment_id:appointmentId,p_client_id:clientAId,p_reason:'QA forbidden '+marker}});
    if(![400,403].includes(crossChange.status))throw new Error('M45_APPOINTMENT_CROSS_CLIENT_NOT_DENIED_'+crossChange.status);

    const resolved=await rpc('iberfit_resolve_appointment_change_v13',coach.token,{p_request_id:String(change.requestId),p_resolution:'accepted',p_note:'QA '+marker});
    if(resolved?.ok!==true||String(resolved?.status)!=='accepted')throw new Error('M45_APPOINTMENT_RESOLVE_FAILED');
    evidence.agenda={appointmentCreated:true,clientChangeRequested:true,crossClientDenied:true,coachResolutionAccepted:true};

    const cancel=command('CITA_CANCELAR','appointment',appointmentId,clientAId,{patch:{}},{baseRevision:Number(appointmentCreate.remoteRevision||1),conflictSensitive:true,reason:'QA cleanup '+marker});
    evidence.operationIds.push(cancel.operationId);
    const cancelResult=await rpc('iberfit_execute_command_v26',coach.token,{p_command:cancel});
    if(String(cancelResult?.kind).toLowerCase()!=='ack')throw new Error('M45_APPOINTMENT_CANCEL_CLEANUP_FAILED');
    evidence.cleanup.productLevelAppointmentCancel=true;

    evidence.actorFingerprints={clientA:hash(clientA.userId),clientB:hash(clientB.userId)};
    await mkdir(OUT_DIR,{recursive:true});
    await writeFile(path.join(OUT_DIR,'evidence.json'),JSON.stringify(evidence,null,2)+'\n','utf8');
  }finally{
    await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId}).catch(()=>{});
    await cdp.send('WebAuthn.disable').catch(()=>{});
    await context.close().catch(()=>{});
  }
});
