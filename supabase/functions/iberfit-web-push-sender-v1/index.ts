import {createClient} from 'npm:@supabase/supabase-js@2.112.4';
import webpush from 'npm:web-push@3.6.7';

const FUNCTION_VERSION='web-push-sender-v1.0';
const MAX_BODY=8_000;
const CLAIM_LIMIT=25;
const SEND_CONCURRENCY=5;
const ALLOWED_ORIGINS=new Set([
  'https://m26-canary.iberfit.cl',
  'https://app.iberfit.cl',
  'https://coach.iberfit.cl',
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type Claim={
  attemptId:string;
  deliveryId:string;
  notificationId:string;
  attemptCount:number;
  endpoint:string;
  keys:{p256dh:string;auth:string};
  path:string;
};

function cors(origin=''){
  const headers:Record<string,string>={
    'access-control-allow-headers':'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods':'POST, OPTIONS',
    'access-control-max-age':'600',
    'cache-control':'no-store',
    'content-type':'application/json; charset=utf-8',
    'vary':'Origin',
    'x-content-type-options':'nosniff',
  };
  if(ALLOWED_ORIGINS.has(origin))headers['access-control-allow-origin']=origin;
  return headers;
}
function reply(status:number,body:unknown,origin=''){
  return new Response(JSON.stringify(body),{status,headers:cors(origin)});
}
function safeCode(error:unknown,fallback='M26_PUSH_DELIVERY_FAILED'){
  const raw=String((error as {message?:string})?.message||error||'').toUpperCase();
  const match=raw.match(/\b(?:M26|IBERFIT|PUSH)_[A-Z0-9_:-]{2,120}\b/u);
  return (match?.[0]||fallback).slice(0,120);
}
function httpStatus(error:unknown){
  const value=Number((error as {statusCode?:number;status?:number})?.statusCode||(error as {status?:number})?.status||0);
  return Number.isInteger(value)&&value>=100&&value<=599?value:null;
}
function temporaryStatus(status:number|null){
  return status===408||status===425||status===429||Boolean(status&&status>=500);
}
function revokedStatus(status:number|null){return status===404||status===410;}
function normalizeOperationId(value:unknown){
  const operationId=String(value||'').trim();
  if(operationId.length<3||operationId.length>200||/[\u0000-\u001f\u007f]/u.test(operationId))throw new Error('M26_PUSH_DISPATCH_OPERATION_INVALID');
  return operationId;
}
function normalizeClaim(value:unknown):Claim|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const claim=value as Record<string,unknown>;
  const keys=claim.keys as Record<string,unknown>|null;
  const attemptId=String(claim.attemptId||'').trim();
  const deliveryId=String(claim.deliveryId||'').trim();
  const notificationId=String(claim.notificationId||'').trim();
  const endpoint=String(claim.endpoint||'').trim();
  const p256dh=String(keys?.p256dh||'').trim();
  const auth=String(keys?.auth||'').trim();
  const attemptCount=Number(claim.attemptCount||0);
  if(!UUID.test(attemptId)||!UUID.test(deliveryId)||!UUID.test(notificationId))return null;
  if(!endpoint.startsWith('https://')||endpoint.length>4096)return null;
  if(p256dh.length<16||p256dh.length>1024||auth.length<8||auth.length>512)return null;
  if(!Number.isInteger(attemptCount)||attemptCount<1||attemptCount>3)return null;
  return {attemptId,deliveryId,notificationId,attemptCount,endpoint,keys:{p256dh,auth},path:'/'};
}
async function processInBatches<T>(items:T[],size:number,worker:(item:T)=>Promise<void>){
  for(let offset=0;offset<items.length;offset+=size){
    await Promise.all(items.slice(offset,offset+size).map(worker));
  }
}

Deno.serve(async(req:Request)=>{
  const origin=String(req.headers.get('origin')||'').trim().toLowerCase();
  if(req.method==='OPTIONS')return reply(ALLOWED_ORIGINS.has(origin)?204:403,{},origin);
  if(req.method!=='POST')return reply(405,{ok:false,code:'M26_METHOD_NOT_ALLOWED',version:FUNCTION_VERSION},origin);
  if(!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,code:'M26_ORIGIN_FORBIDDEN',version:FUNCTION_VERSION},origin);

  const authorization=String(req.headers.get('authorization')||'').trim();
  if(!authorization.startsWith('Bearer ')||authorization.length>20000)return reply(401,{ok:false,code:'M26_AUTH_REQUIRED',version:FUNCTION_VERSION},origin);

  const raw=await req.text();
  if(raw.length<2||raw.length>MAX_BODY)return reply(400,{ok:false,code:'M26_BODY_INVALID',version:FUNCTION_VERSION},origin);
  let operationId='';
  try{
    const parsed=JSON.parse(raw) as Record<string,unknown>;
    operationId=normalizeOperationId(parsed?.operationId);
  }catch(error){
    return reply(400,{ok:false,code:safeCode(error,'M26_PUSH_DISPATCH_OPERATION_INVALID'),version:FUNCTION_VERSION},origin);
  }

  const supabaseUrl=String(Deno.env.get('SUPABASE_URL')||'').trim();
  const anonKey=String(Deno.env.get('SUPABASE_ANON_KEY')||'').trim();
  const serviceRole=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
  const vapidPublicKey=String(Deno.env.get('IBERFIT_WEB_PUSH_VAPID_PUBLIC_KEY')||'').trim();
  const vapidPrivateKey=String(Deno.env.get('IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY')||'').trim();
  const vapidSubject=String(Deno.env.get('IBERFIT_WEB_PUSH_VAPID_SUBJECT')||'').trim();
  if(!supabaseUrl||!anonKey||!serviceRole)return reply(500,{ok:false,code:'M26_SERVER_CONFIG_MISSING',version:FUNCTION_VERSION},origin);
  if(!vapidPublicKey||!vapidPrivateKey||!/^mailto:|^https:\/\//iu.test(vapidSubject)){
    return reply(503,{ok:false,code:'M26_PUSH_SERVICE_NOT_CONFIGURED',version:FUNCTION_VERSION},origin);
  }

  const userClient=createClient(supabaseUrl,anonKey,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:authorization,Origin:origin}},
  });
  const service=createClient(supabaseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});

  try{
    const {data:authorizationResult,error:authorizationError}=await userClient.rpc('iberfit_web_push_dispatch_authorize_v1',{p_operation_id:operationId});
    if(authorizationError)throw authorizationError;
    const dispatch=Array.isArray(authorizationResult)?authorizationResult[0]:authorizationResult;
    if(dispatch?.ok!==true)throw new Error('M26_PUSH_DISPATCH_NOT_AUTHORIZED');
    if(dispatch?.authorized!==true){
      return reply(200,{ok:true,processed:0,sent:0,deferred:0,duplicate:true,version:FUNCTION_VERSION},origin);
    }

    webpush.setVapidDetails(vapidSubject,vapidPublicKey,vapidPrivateKey);

    const {data:claimResult,error:claimError}=await service.rpc('iberfit_web_push_claim_v1',{p_limit:CLAIM_LIMIT});
    if(claimError)throw claimError;
    const claimEnvelope=Array.isArray(claimResult)?claimResult[0]:claimResult;
    const rawClaims=Array.isArray(claimEnvelope?.claims)?claimEnvelope.claims:[];
    const claims=rawClaims.map(normalizeClaim).filter((item):item is Claim=>Boolean(item)).slice(0,CLAIM_LIMIT);
    if(rawClaims.length!==claims.length)throw new Error('M26_PUSH_CLAIM_INVALID');

    let sent=0;
    let deferred=0;
    await processInBatches(claims,SEND_CONCURRENCY,async(claim)=>{
      let outcome:'sent'|'retry'|'revoked'|'failed'='failed';
      let status:number|null=null;
      let errorCode:string|null=null;
      try{
        const response=await webpush.sendNotification(
          {endpoint:claim.endpoint,keys:claim.keys},
          JSON.stringify({tag:'iberfit-update',path:'/'}),
          {
            TTL:300,
            urgency:'normal',
            topic:'iberfit-update',
            timeout:10_000,
          },
        );
        status=Number(response?.statusCode||201);
        outcome='sent';
        sent+=1;
      }catch(error){
        status=httpStatus(error);
        if(revokedStatus(status))outcome='revoked';
        else if(temporaryStatus(status)){
          outcome='retry';
          deferred+=1;
        }else outcome='failed';
        errorCode=status?`push_http_${status}`:safeCode(error);
      }

      const {error:finalizeError}=await service.rpc('iberfit_web_push_finalize_v1',{
        p_attempt_id:claim.attemptId,
        p_outcome:outcome,
        p_http_status:status,
        p_error_code:errorCode,
      });
      if(finalizeError)throw new Error('M26_PUSH_FINALIZE_FAILED');
    });

    return reply(200,{
      ok:true,
      processed:claims.length,
      sent,
      deferred,
      duplicate:false,
      version:FUNCTION_VERSION,
    },origin);
  }catch(error){
    const code=safeCode(error);
    const status=/AUTH|FORBIDDEN|NOT_AUTHORIZED/u.test(code)?403:
      /CONFIG/u.test(code)?503:400;
    return reply(status,{ok:false,code,version:FUNCTION_VERSION},origin);
  }
});
