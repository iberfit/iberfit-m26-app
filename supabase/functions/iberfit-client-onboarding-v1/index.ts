import {createClient} from 'npm:@supabase/supabase-js@2.112.4';

const VERSION='client-onboarding-invite-v1';
const ORIGINS=new Set(['https://m26-canary.iberfit.cl','https://app.iberfit.cl','https://coach.iberfit.cl']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_BODY=120_000;

function key(jsonName,legacyName){const raw=Deno.env.get(jsonName);if(raw){try{const parsed=JSON.parse(raw);const value=String(parsed?.default||Object.values(parsed||{})[0]||'').trim();if(value)return value;}catch{}}return String(Deno.env.get(legacyName)||'').trim();}
function originOf(req:Request){const origin=String(req.headers.get('origin')||'').trim().toLowerCase();return ORIGINS.has(origin)?origin:'';}
function headers(origin:string){const h:Record<string,string>={'access-control-allow-headers':'authorization, apikey, content-type, x-client-info','access-control-allow-methods':'POST, OPTIONS','access-control-max-age':'600','cache-control':'no-store','content-type':'application/json; charset=utf-8','vary':'Origin','x-content-type-options':'nosniff'};if(origin)h['access-control-allow-origin']=origin;return h;}
function reply(status:number,body:unknown,origin:string){return new Response(JSON.stringify(body),{status,headers:headers(origin)});}
function codeOf(error:unknown,fallback='IBERFIT_INVITATION_FAILED'){const raw=String((error as {message?:unknown})?.message||error||'').toUpperCase();const match=raw.match(/IBERFIT_[A-Z0-9_:-]{3,120}|V12[A-Z0-9_:-]{3,120}|M26_[A-Z0-9_:-]{3,120}/u);return String(match?.[0]||fallback).slice(0,120);}
async function bodyOf(req:Request){const text=await req.text();if(!text||text.length>MAX_BODY)throw new Error('M26_CLIENT_DRAFT_PAYLOAD_INVALID');let value;try{value=JSON.parse(text);}catch{throw new Error('M26_CLIENT_DRAFT_PAYLOAD_INVALID');}if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('M26_CLIENT_DRAFT_PAYLOAD_INVALID');return value as Record<string,unknown>;}
function emailOf(payload:Record<string,unknown>){const profile=payload.profile&&typeof payload.profile==='object'&&!Array.isArray(payload.profile)?payload.profile as Record<string,unknown>:{};const email=String(payload.email||profile.email||'').trim().toLowerCase();if(email.length<5||email.length>254||!email.includes('@'))throw new Error('M26_AUTH_EMAIL_INVALID');return email;}
function clientIdOf(result:any){const item=Array.isArray(result)?result[0]:result;const nested=item?.data||item?.result||item?.client||item;const id=String(nested?.clientId||nested?.client_id||nested?.cliente_id||nested?.client?.id||item?.clientId||item?.client_id||'').trim();if(!UUID.test(id))throw new Error('M26_CLIENT_CREATE_INVALID_RESPONSE');return id;}
async function findUserByEmail(admin:any,email:string){for(let page=1;page<=20;page+=1){const {data,error}=await admin.auth.admin.listUsers({page,perPage:100});if(error)throw new Error('IBERFIT_INVITATION_AUTH_LOOKUP_FAILED');const users=Array.isArray(data?.users)?data.users:[];const match=users.find((user:any)=>String(user?.email||'').trim().toLowerCase()===email);if(match)return match;if(users.length<100)break;}return null;}

async function main(req:Request){
  const origin=originOf(req);if(!origin)return reply(403,{ok:false,code:'M26_CLIENT_ONBOARDING_ORIGIN_FORBIDDEN'},'');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=='POST')return reply(405,{ok:false,code:'M26_METHOD_NOT_ALLOWED'},origin);
  const authorization=String(req.headers.get('authorization')||'');if(!authorization.startsWith('Bearer '))return reply(401,{ok:false,code:'M26_AUTH_REQUIRED'},origin);
  const token=authorization.slice(7).trim();if(!token||token.length>16384)return reply(401,{ok:false,code:'M26_AUTH_REQUIRED'},origin);
  const url=String(Deno.env.get('SUPABASE_URL')||'').trim();const publishable=key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');const secret=key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');if(!url||!publishable||!secret)throw new Error('M26_SUPABASE_SERVER_CONFIG_MISSING');
  const userClient=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${token}`,Origin:origin}}});
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser(token);if(userError||!userData?.user?.id)return reply(401,{ok:false,code:'M26_AUTH_INVALID'},origin);
  const {data:context,error:contextError}=await userClient.rpc('iberfit_application_context_v14');const roles=Array.isArray(context?.roles)?context.roles.map((v:unknown)=>String(v)):[];if(contextError||context?.ok!==true||(!roles.includes('admin')&&!roles.includes('coach')))return reply(403,{ok:false,code:'M26_PRIVILEGED_ROLE_REQUIRED'},origin);
  const payload=await bodyOf(req);const email=emailOf(payload);
  const {data:preflight,error:preflightError}=await userClient.rpc('iberfit_client_onboarding_preflight_v12');if(preflightError||preflight?.ok!==true||preflight?.ready!==true)throw new Error(codeOf(preflightError,'M26_CLIENT_ONBOARDING_BACKEND_NOT_READY'));
  const {data:created,error:createError}=await userClient.rpc('iberfit_create_client_draft_v12',{p_payload:payload});if(createError)throw new Error(codeOf(createError,'M26_CLIENT_CREATE_FAILED'));
  const clientId=clientIdOf(created);
  const {data:begin,error:beginError}=await userClient.rpc('iberfit_client_invitation_begin_v26',{p_client_id:clientId,p_email:email});
  if(beginError){return reply(200,{...created,ok:true,visible:true,client_id:clientId,invitation:{status:'error',errorCode:codeOf(beginError,'IBERFIT_INVITATION_BEGIN_FAILED'),attemptCount:null},version:VERSION},origin);}
  let newlyInvitedUserId:string|null=null;
  try{
    let authUser=await findUserByEmail(admin,email);let delivery='existing';
    if(!authUser){
      const {data:invite,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:`${origin}/`,data:{iberfit_client_id:clientId,iberfit_access:'client'}});
      if(inviteError){
        authUser=await findUserByEmail(admin,email);
        if(!authUser)throw new Error(codeOf(inviteError,'IBERFIT_INVITATION_SEND_FAILED'));
      }else{
        authUser=invite?.user;delivery='sent';newlyInvitedUserId=String(authUser?.id||'');
      }
    }
    const authUserId=String(authUser?.id||'');if(!UUID.test(authUserId))throw new Error('IBERFIT_INVITATION_AUTH_USER_INVALID');
    const {data:finalized,error:finalizeError}=await userClient.rpc('iberfit_client_invitation_finalize_v26',{p_client_id:clientId,p_auth_user_id:authUserId,p_delivery:delivery});
    if(finalizeError)throw new Error(codeOf(finalizeError,'IBERFIT_INVITATION_FINALIZE_FAILED'));
    return reply(200,{...created,ok:true,visible:true,client_id:clientId,invitation:{status:String(finalized?.status||delivery),authUserId,attemptCount:Number(begin?.attemptCount||0),sentAt:finalized?.invitationSentAt||null,delivery},version:VERSION},origin);
  }catch(error){
    const errorCode=codeOf(error);
    if(newlyInvitedUserId&&UUID.test(newlyInvitedUserId)){try{await admin.auth.admin.deleteUser(newlyInvitedUserId);}catch{}}
    try{await userClient.rpc('iberfit_client_invitation_fail_v26',{p_client_id:clientId,p_error_code:errorCode});}catch{}
    return reply(200,{...created,ok:true,visible:true,client_id:clientId,invitation:{status:'error',errorCode,attemptCount:Number(begin?.attemptCount||0)},version:VERSION},origin);
  }
}

Deno.serve(async(req)=>{const origin=originOf(req);try{return await main(req);}catch(error){const code=codeOf(error,'M26_CLIENT_ONBOARDING_SERVER_FAILED');console.error(`[IBERFIT:${VERSION}] ${code}`);return reply(500,{ok:false,code,message:code},origin);}});
