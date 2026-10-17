import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {test,expect} from '@playwright/test';

const RELEASE_SHA='0105eef1581db8c3d57c7827a3006a624b7368b4';
const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const QA_REF='gjztkdwfmunnzhtvxrsu';
const QA_ORIGIN='https://'+QA_REF+'.supabase.co';
const BUILD_ROOT=path.resolve('.tmp/rc64-current-surface');
const PUBLIC_BUILD_ROOT=path.join(BUILD_ROOT,'public');
const OUT_DIR=path.resolve('recovery/m45-release-cert');
const WEBAUTHN_PATH='/functions/v1/iberfit-webauthn-v1';
const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
];
const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26','iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13','iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d','iberfit_communication_bootstrap_v14',
  'm26_backend_bootstrap_v43','m26_wearable_bootstrap_v44',
  'iberfit_exercise_catalog_public_v1','iberfit_exercise_media_manifest_v1',
  'iberfit_exercise_measurement_profiles_public_v1',
  'iberfit_notification_preferences_status_v1',
]);
const MIME=Object.freeze({
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2',
});

const fp=(value)=>createHash('sha256').update(QA_REF+':'+String(value||'')).digest('hex').slice(0,16);
function mimeFor(file){return MIME[path.extname(file).toLowerCase()]||'application/octet-stream';}
function safeCandidate(base,relative){const candidate=path.resolve(base,relative);return candidate===base||candidate.startsWith(base+path.sep)?candidate:null;}
async function currentSource(relative){
  for(const base of [BUILD_ROOT,PUBLIC_BUILD_ROOT]){
    const candidate=safeCandidate(base,relative);if(!candidate)continue;
    try{return {body:await readFile(candidate),candidate};}catch{}
  }
  return null;
}
async function fulfillCurrentSource(route,url){
  let pathname=decodeURIComponent(url.pathname||'/');if(pathname==='/'||pathname==='')pathname='/index.html';
  const relative=pathname.replace(/^\\/+/, '');const resolved=await currentSource(relative);
  if(resolved){
    await route.fulfill({status:200,body:resolved.body,headers:{'content-type':mimeFor(resolved.candidate),'cache-control':'no-store','x-content-type-options':'nosniff'}});
    return;
  }
  if(!path.extname(relative)){
    try{
      const body=await readFile(path.join(BUILD_ROOT,'index.html'));
      await route.fulfill({status:200,body,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
      return;
    }catch{}
  }
  await route.fulfill({status:404,body:'Not found'});
}
function readOnlyPushConfig(request,url,method){
  if(method!=='POST'||url.pathname!=='/functions/v1/iberfit-web-push-sender-v1')return false;
  try{const body=request.postDataJSON();return body?.action==='config'&&Object.keys(body).length===1;}catch{return false;}
}
function allowedBrowserRequest(request){
  let url;try{url=new URL(request.url());}catch{return false;}
  const method=request.method().toUpperCase();
  if(url.origin!==QA_ORIGIN)return false;
  if(method==='POST'&&url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password')return true;
  if(method==='POST'&&url.pathname==='/auth/v1/logout')return true;
  if(method==='GET'&&url.pathname==='/auth/v1/user')return true;
  if(method==='GET'&&url.pathname==='/rest/v1/domain_command_registry_v26')return true;
  if(method==='POST'&&url.pathname===WEBAUTHN_PATH)return true;
  if(readOnlyPushConfig(request,url,method))return true;
  const prefix='/rest/v1/rpc/';
  return method==='POST'&&url.pathname.startsWith(prefix)&&READ_ONLY_RPCS.has(url.pathname.slice(prefix.length));
}
async function installPolicy(context,evidence,session){
  await context.route('**/*',async(route)=>{
    const request=route.request();let url;
    try{url=new URL(request.url());}catch{evidence.blocked.push('INVALID_URL');await route.abort('blockedbyclient');return;}
    if(url.origin===CANARY_ORIGIN){await fulfillCurrentSource(route,url);return;}
    if(allowedBrowserRequest(request)){
      const auth=String(request.headers()?.authorization||'');
      if(auth.startsWith('Bearer ')&&auth.length>100)session.coachToken=auth.slice(7);
      if(url.pathname===WEBAUTHN_PATH){
        try{evidence.webauthnActions.push(String(request.postDataJSON()?.action||'unknown'));}catch{}
      }
      await route.continue();return;
    }
    evidence.blocked.push(request.method().toUpperCase()+' '+url.origin+' '+url.pathname);
    await route.abort('blockedbyclient');
  });
}
async function addAuthenticator(page){
  const cdp=await page.context().newCDPSession(page);await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{
    protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,
  }});
  return {cdp,authenticatorId};
}
async function loginCoach(page,email,password){
  await expect(page.getByRole('textbox',{name:'Correo',exact:true})).toBeVisible({timeout:20_000});
  await page.getByRole('textbox',{name:'Correo',exact:true}).fill(email);
  await page.locator('#m26-login-password').fill(password);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  const mfa=page.locator('[data-auth-action="mfa-continue-webauthn"]');
  await expect(mfa,'Coach must remain fail-closed until WebAuthn').toBeVisible({timeout:20_000});
  await mfa.click();
  await expect(page.locator('.m26-shell[data-m26-role="coach"]')).toBeVisible({timeout:30_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:15_000});
}
function apiHeaders(token){
  return {
    apikey:String(process.env.M26_SUPABASE_PUBLISHABLE_KEY),
    authorization:'Bearer '+token,
    'content-type':'application/json',
    origin:CANARY_ORIGIN,
  };
}
async function login(request,email,password){
  const response=await request.post(QA_ORIGIN+'/auth/v1/token?grant_type=password',{
    headers:{apikey:String(process.env.M26_SUPABASE_PUBLISHABLE_KEY),'content-type':'application/json'},
    data:{email,password},timeout:30_000,
  });
  expect(response.ok(),'QA synthetic login').toBe(true);
  const body=await response.json();
  expect(body?.access_token).toBeTruthy();expect(body?.user?.id).toBeTruthy();
  return {token:body.access_token,userId:body.user.id};
}
async function rpcRaw(request,token,name,params={}){
  const response=await request.post(QA_ORIGIN+'/rest/v1/rpc/'+name,{
    headers:apiHeaders(token),data:params,timeout:30_000,
  });
  let body=null;try{body=await response.json();}catch{body=null;}
  if(Array.isArray(body)&&body.length===1)body=body[0];
  return {response,body};
}
async function rpc(request,token,name,params={}){
  const {response,body}=await rpcRaw(request,token,name,params);
  expect(response.ok(),name+' must succeed').toBe(true);
  return body;
}
function assertAck(body,label,{duplicate=false}={}){
  expect(String(body?.kind||'').toLowerCase(),label+' kind').toBe(duplicate?'duplicate':'ack');
  expect(body?.ok,label+' ok').toBe(true);
}
function command({type,entityType,entityId,clientId,baseRevision=0,payload={}}){
  return {
    operationId:randomUUID(),type,entityType,entityId,clientId,baseRevision,
    conflictSensitive:true,reason:null,previewAccepted:false,payload,
  };
}

test('M45 release cert: Coach WebAuthn + communication isolation + push ownership + agenda',async({browser})=>{
  expect(REQUIRED.filter((name)=>!process.env[name]),'Missing authorized QA env').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(QA_ORIGIN);
  const marker='M45-E2E-'+String(process.env.GITHUB_RUN_ID||Date.now());
  const evidence={
    schema:'iberfit.m45.release-cert.v1',releaseSha:RELEASE_SHA,qaOnly:true,synthetic:true,realPersonData:false,
    marker,webauthnActions:[],blocked:[],coachAssurance:false,communication:{},push:{},agenda:{},cleanup:{},
    sourceRunId:String(process.env.GITHUB_RUN_ID||''),generatedAt:null,
  };
  const context=await browser.newContext({
    ignoreHTTPSErrors:false,locale:'es-ES',timezoneId:'America/Santiago',
    serviceWorkers:'block',viewport:{width:1440,height:1000},hasTouch:true,
  });
  const session={coachToken:''};
  await installPolicy(context,evidence,session);
  const page=await context.newPage();
  const {cdp,authenticatorId}=await addAuthenticator(page);
  let clientA=null,clientB=null,clientAId='',clientBId='',threadId='',appointmentId='',appointmentRevision=0;
  let originalCoachMessages=null,pushEndpoint='';
  const operationIds=[];
  try{
    const navigation=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:25_000});
    expect(navigation?.ok()).toBeTruthy();
    await loginCoach(page,process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD);
    expect(evidence.webauthnActions).toContain('registration-options');
    expect(evidence.webauthnActions).toContain('registration-verify');
    expect(session.coachToken,'Verified Coach bearer captured').toBeTruthy();

    const assurance=await rpc(context.request,session.coachToken,'iberfit_privileged_assurance_context_v65d',{});
    expect(assurance?.ok).toBe(true);expect(assurance?.privileged).toBe(true);expect(assurance?.iberfitAssurance).toBe('verified');
    evidence.coachAssurance=true;

    [clientA,clientB]=await Promise.all([
      login(context.request,process.env.M26_QA_CLIENT_A_EMAIL,process.env.M26_QA_CLIENT_A_PASSWORD),
      login(context.request,process.env.M26_QA_CLIENT_B_EMAIL,process.env.M26_QA_CLIENT_B_PASSWORD),
    ]);
    const [bootA,bootB]=await Promise.all([
      rpc(context.request,clientA.token,'iberfit_bootstrap_v26',{}),
      rpc(context.request,clientB.token,'iberfit_bootstrap_v26',{}),
    ]);
    clientAId=String(bootA?.user?.clientId||bootA?.user?.client_id||'');
    clientBId=String(bootB?.user?.clientId||bootB?.user?.client_id||'');
    expect(clientAId).toMatch(/^[0-9a-f-]{36}$/i);expect(clientBId).toMatch(/^[0-9a-f-]{36}$/i);expect(clientAId).not.toBe(clientBId);
    evidence.clientFingerprints={a:fp(clientAId),b:fp(clientBId)};

    // COMMUNICATION: Coach -> Client A -> Coach, duplicate receipt and Client B isolation.
    const openOp=randomUUID();operationIds.push(openOp);
    const opened=await rpc(context.request,session.coachToken,'iberfit_communication_execute_v14',{
      p_application:'coach',p_command:{operationId:openOp,type:'MESSAGE_THREAD_OPEN',entityId:randomUUID(),baseRevision:0,payload:{clientId:clientAId,subject:marker}},
    });
    assertAck(opened,'thread open');threadId=String(opened.threadId||'');expect(threadId).toMatch(/^[0-9a-f-]{36}$/i);

    const sendOp=randomUUID();operationIds.push(sendOp);
    const sendCommand={operationId:sendOp,type:'MESSAGE_SEND',entityId:threadId,baseRevision:Number(opened.revision||0),payload:{threadId,body:marker+' coach'}};
    const sent=await rpc(context.request,session.coachToken,'iberfit_communication_execute_v14',{p_application:'coach',p_command:sendCommand});
    assertAck(sent,'coach send');
    const duplicate=await rpc(context.request,session.coachToken,'iberfit_communication_execute_v14',{p_application:'coach',p_command:sendCommand});
    assertAck(duplicate,'coach send duplicate',{duplicate:true});

    const aComm=await rpc(context.request,clientA.token,'iberfit_communication_bootstrap_v14',{p_application:'client'});
    const bComm=await rpc(context.request,clientB.token,'iberfit_communication_bootstrap_v14',{p_application:'client'});
    expect(aComm?.threads?.some((x)=>String(x.id)===threadId)).toBe(true);
    expect(aComm?.messages?.some((x)=>String(x.threadId)===threadId&&String(x.body)===marker+' coach')).toBe(true);
    expect(bComm?.threads?.some((x)=>String(x.id)===threadId)).toBe(false);
    expect(bComm?.messages?.some((x)=>String(x.threadId)===threadId)).toBe(false);

    const bDenied=await rpcRaw(context.request,clientB.token,'iberfit_communication_execute_v14',{
      p_application:'client',p_command:{operationId:randomUUID(),type:'MESSAGE_SEND',entityId:threadId,baseRevision:0,payload:{threadId,body:marker+' forbidden'}},
    });
    expect(bDenied.response.status()).toBe(403);

    const readOp=randomUUID();operationIds.push(readOp);
    const readAck=await rpc(context.request,clientA.token,'iberfit_communication_execute_v14',{
      p_application:'client',p_command:{operationId:readOp,type:'MESSAGE_MARK_READ',entityId:threadId,baseRevision:0,payload:{threadId}},
    });
    assertAck(readAck,'client read');

    const replyOp=randomUUID();operationIds.push(replyOp);
    const reply=await rpc(context.request,clientA.token,'iberfit_communication_execute_v14',{
      p_application:'client',p_command:{operationId:replyOp,type:'MESSAGE_SEND',entityId:threadId,baseRevision:0,payload:{threadId,body:marker+' client'}},
    });
    assertAck(reply,'client reply');
    const coachComm=await rpc(context.request,session.coachToken,'iberfit_communication_bootstrap_v14',{p_application:'coach'});
    expect(coachComm?.messages?.some((x)=>String(x.threadId)===threadId&&String(x.body)===marker+' client')).toBe(true);
    evidence.communication={passed:true,threadId,duplicateReceipt:true,clientBIsolation:true,readReceipt:true,replyVisible:true};

    // NOTIFICATION PREFERENCES: mutate one key then restore exact original value.
    const prefBefore=await rpc(context.request,clientA.token,'iberfit_notification_preferences_status_v1',{});
    originalCoachMessages=Boolean(prefBefore?.preferences?.coachMessages);
    const prefChanged=await rpc(context.request,clientA.token,'iberfit_notification_preferences_upsert_v1',{p_preferences:{coachMessages:!originalCoachMessages}});
    expect(prefChanged?.ok).toBe(true);expect(Boolean(prefChanged?.preferences?.coachMessages)).toBe(!originalCoachMessages);

    // PUSH ownership: fake QA endpoint, no external dispatch. B cannot hijack/revoke A's row.
    pushEndpoint='https://push.invalid/iberfit/'+marker.toLowerCase();
    const subscription={endpoint:pushEndpoint,expirationTime:null,keys:{p256dh:'A'.repeat(80),auth:'B'.repeat(24)}};
    const pushUpsert=await rpc(context.request,clientA.token,'iberfit_web_push_upsert_v1',{p_subscription:subscription});
    expect(pushUpsert?.ok).toBe(true);expect(pushUpsert?.active).toBe(true);
    const pushStatusA=await rpc(context.request,clientA.token,'iberfit_web_push_status_v1',{p_endpoint:pushEndpoint});
    expect(pushStatusA?.active).toBe(true);
    const pushHijack=await rpcRaw(context.request,clientB.token,'iberfit_web_push_upsert_v1',{p_subscription:subscription});
    expect(pushHijack.response.status()).toBe(403);
    const bRevoke=await rpc(context.request,clientB.token,'iberfit_web_push_revoke_v1',{p_endpoint:pushEndpoint});
    expect(Number(bRevoke?.deletedCount||0)).toBe(0);
    const stillA=await rpc(context.request,clientA.token,'iberfit_web_push_status_v1',{p_endpoint:pushEndpoint});
    expect(stillA?.active).toBe(true);
    const aRevoke=await rpc(context.request,clientA.token,'iberfit_web_push_revoke_v1',{p_endpoint:pushEndpoint});
    expect(Number(aRevoke?.deletedCount||0)).toBeGreaterThanOrEqual(1);
    evidence.push={passed:true,ownershipFence:true,revokeFence:true,externalDeliveryAttempted:false,degradedReason:'CI has no real external PushSubscription endpoint'};

    // AGENDA: create + confirm Coach appointment, Client A change request, Client B denied, Coach resolves.
    appointmentId=randomUUID();
    const start=new Date(Date.now()+24*60*60*1000);const end=new Date(start.getTime()+60*60*1000);
    const create=command({
      type:'CITA_CREAR',entityType:'appointment',entityId:appointmentId,clientId:clientAId,
      payload:{appointment:{title:marker,startAt:start.toISOString(),endAt:end.toISOString(),modality:'online',notes:'QA synthetic release cert'}},
    });
    operationIds.push(create.operationId);
    const createAck=await rpc(context.request,session.coachToken,'iberfit_execute_command_v26',{p_command:create});
    expect(String(createAck?.kind||'').toLowerCase()).toBe('ack');appointmentRevision=Number(createAck.remoteRevision||0);expect(appointmentRevision).toBe(1);

    const confirm=command({type:'CITA_CONFIRMAR',entityType:'appointment',entityId:appointmentId,clientId:clientAId,baseRevision:appointmentRevision,payload:{patch:{}}});
    operationIds.push(confirm.operationId);
    const confirmAck=await rpc(context.request,session.coachToken,'iberfit_execute_command_v26',{p_command:confirm});
    expect(String(confirmAck?.kind||'').toLowerCase()).toBe('ack');appointmentRevision=Number(confirmAck.remoteRevision||0);expect(appointmentRevision).toBe(2);

    const bootAfter=await rpc(context.request,clientA.token,'iberfit_bootstrap_v26',{});
    const visibleAppointment=(bootAfter?.data?.appointments||[]).find((x)=>String(x.id||x.entityId||x.entity_id)===appointmentId);
    expect(visibleAppointment,'Client A must see confirmed synthetic appointment').toBeTruthy();

    const change=await rpc(context.request,clientA.token,'iberfit_request_appointment_change_v13',{
      p_appointment_id:appointmentId,p_client_id:clientAId,p_reason:marker+' request',
    });
    expect(change?.ok).toBe(true);const requestId=String(change.requestId||'');expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
    const bChange=await rpcRaw(context.request,clientB.token,'iberfit_request_appointment_change_v13',{
      p_appointment_id:appointmentId,p_client_id:clientAId,p_reason:marker+' forbidden',
    });
    expect(bChange.response.status()).toBe(403);
    const coachRequests=await rpc(context.request,session.coachToken,'iberfit_appointment_change_requests_v13',{});
    expect(coachRequests?.requests?.some((x)=>String(x.id)===requestId&&String(x.appointmentId)===appointmentId)).toBe(true);
    const resolved=await rpc(context.request,session.coachToken,'iberfit_resolve_appointment_change_v13',{
      p_request_id:requestId,p_resolution:'accepted',p_note:marker+' accepted',
    });
    expect(resolved?.ok).toBe(true);expect(resolved?.status).toBe('accepted');
    const aRequests=await rpc(context.request,clientA.token,'iberfit_appointment_change_requests_v13',{});
    expect(aRequests?.requests?.some((x)=>String(x.id)===requestId&&String(x.status)==='accepted')).toBe(true);
    evidence.agenda={passed:true,appointmentId,requestId,clientBIsolation:true,changeResolved:true};

    const cancel=command({
      type:'CITA_CANCELAR',entityType:'appointment',entityId:appointmentId,clientId:clientAId,baseRevision:appointmentRevision,
      payload:{reason:marker+' cleanup',patch:{}},
    });
    operationIds.push(cancel.operationId);
    const cancelAck=await rpc(context.request,session.coachToken,'iberfit_execute_command_v26',{p_command:cancel});
    expect(String(cancelAck?.kind||'').toLowerCase()).toBe('ack');appointmentRevision=Number(cancelAck.remoteRevision||0);
    evidence.cleanup.appointmentCancelled=true;

    expect(evidence.blocked,'Browser may contact only current source and allowlisted QA services').toEqual([]);
    evidence.passed=true;
  }finally{
    if(clientA?.token&&originalCoachMessages!==null){
      try{
        const restored=await rpc(context.request,clientA.token,'iberfit_notification_preferences_upsert_v1',{p_preferences:{coachMessages:originalCoachMessages}});
        evidence.cleanup.notificationPreferenceRestored=Boolean(restored?.preferences?.coachMessages)===originalCoachMessages;
      }catch(error){evidence.cleanup.notificationPreferenceRestored=false;evidence.cleanup.preferenceError=String(error?.message||error).slice(0,120);}
    }
    if(clientA?.token&&pushEndpoint){
      try{await rpc(context.request,clientA.token,'iberfit_web_push_revoke_v1',{p_endpoint:pushEndpoint});evidence.cleanup.pushRevoked=true;}
      catch{evidence.cleanup.pushRevoked=false;}
    }
    evidence.operationIds=operationIds;
    evidence.generatedAt=new Date().toISOString();
    await mkdir(OUT_DIR,{recursive:true});
    await writeFile(path.join(OUT_DIR,'evidence.json'),JSON.stringify(evidence,null,2)+'\n','utf8');
    console.log('M45_RELEASE_CERT_EVIDENCE='+JSON.stringify(evidence));
    await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId}).catch(()=>{});
    await cdp.send('WebAuthn.disable').catch(()=>{});
    await context.close().catch(()=>{});
  }
  expect(evidence.passed).toBe(true);
  expect(evidence.coachAssurance).toBe(true);
  expect(evidence.communication?.passed).toBe(true);
  expect(evidence.push?.passed).toBe(true);
  expect(evidence.agenda?.passed).toBe(true);
});
