import {createClient} from 'npm:@supabase/supabase-js@2.112.4';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from 'npm:@simplewebauthn/server@13.3.3';

const RP_NAME='IBERFIT';
const RP_ID='iberfit.cl';
const ALLOWED_ORIGINS=new Set([
  'https://app.iberfit.cl',
  'https://coach.iberfit.cl',
]);
const FUNCTION_VERSION='final-production-free-webauthn-v1';
const CHALLENGE_TTL_MS=5*60*1000;
const ASSURANCE_TTL_MS=12*60*60*1000;
const MAX_BODY_CHARS=600_000;
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const BASE64URL_PATTERN=/^[A-Za-z0-9_-]+$/u;
const SAFE_TRANSPORTS=new Set(['ble','cable','hybrid','internal','nfc','smart-card','usb']);

function jsonKey(envName,legacyName){
  const raw=Deno.env.get(envName);
  if(raw){
    try{
      const parsed=JSON.parse(raw);
      if(parsed&&typeof parsed==='object'){
        const value=String(parsed.default||Object.values(parsed)[0]||'').trim();
        if(value)return value;
      }
    }catch{}
  }
  return String(Deno.env.get(legacyName)||'').trim();
}

function requestOrigin(req){
  const origin=String(req?.headers?.get?.('origin')||'').trim();
  return ALLOWED_ORIGINS.has(origin)?origin:null;
}

function corsHeaders(origin){
  const headers={
    'access-control-allow-headers':'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods':'POST, OPTIONS',
    'access-control-max-age':'600',
    'cache-control':'no-store',
    'content-type':'application/json; charset=utf-8',
    'vary':'Origin',
    'x-content-type-options':'nosniff',
  };
  if(origin&&ALLOWED_ORIGINS.has(origin))headers['access-control-allow-origin']=origin;
  return Object.freeze(headers);
}

function response(status,body,origin){
  return new Response(JSON.stringify(body),{status,headers:corsHeaders(origin)});
}
function safeCode(value,fallback='M26_WEBAUTHN_SERVER_FAILED'){
  const code=String(value||'').trim().toUpperCase();
  return /^[A-Z][A-Z0-9_:-]{2,100}$/u.test(code)?code:fallback;
}
function fail(status,code,origin=null){return response(status,{ok:false,code:safeCode(code)},origin);}

function decodeJwtPayload(token){
  const parts=String(token||'').split('.');
  if(parts.length!==3)throw new Error('M26_AUTH_TOKEN_INVALID');
  const raw=parts[1].replace(/-/gu,'+').replace(/_/gu,'/');
  const padded=raw+'='.repeat((4-(raw.length%4))%4);
  let binary;
  try{binary=atob(padded);}catch{throw new Error('M26_AUTH_TOKEN_INVALID');}
  const bytes=Uint8Array.from(binary,(ch)=>ch.charCodeAt(0));
  let payload;
  try{payload=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('M26_AUTH_TOKEN_INVALID');}
  return payload;
}
function bytesToBase64Url(value){
  const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
  if(bytes.byteLength<1||bytes.byteLength>16384)throw new Error('M26_WEBAUTHN_PUBLIC_KEY_INVALID');
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu,'-').replace(/\//gu,'_').replace(/=+$/u,'');
}
function base64UrlToBytes(value){
  const raw=String(value||'');
  if(!raw||raw.length>16384||!BASE64URL_PATTERN.test(raw))throw new Error('M26_WEBAUTHN_PUBLIC_KEY_INVALID');
  const base64=raw.replace(/-/gu,'+').replace(/_/gu,'/')+'='.repeat((4-(raw.length%4))%4);
  let binary;try{binary=atob(base64);}catch{throw new Error('M26_WEBAUTHN_PUBLIC_KEY_INVALID');}
  return Uint8Array.from(binary,(ch)=>ch.charCodeAt(0));
}
function normalizedTransports(value){
  if(!Array.isArray(value))return [];
  return [...new Set(value.map((item)=>String(item)).filter((item)=>SAFE_TRANSPORTS.has(item)))].slice(0,8);
}
async function parseBody(req){
  const text=await req.text();
  if(!text||text.length>MAX_BODY_CHARS)throw new Error('M26_WEBAUTHN_BODY_INVALID');
  let body;try{body=JSON.parse(text);}catch{throw new Error('M26_WEBAUTHN_BODY_INVALID');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('M26_WEBAUTHN_BODY_INVALID');
  return body;
}
function credentialResponse(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('M26_WEBAUTHN_CREDENTIAL_RESPONSE_INVALID');
  const id=String(value.id||'');
  if(!id||id.length>4096||!BASE64URL_PATTERN.test(id)||String(value.type||'')!=='public-key')throw new Error('M26_WEBAUTHN_CREDENTIAL_RESPONSE_INVALID');
  let serialized;try{serialized=JSON.stringify(value);}catch{throw new Error('M26_WEBAUTHN_CREDENTIAL_RESPONSE_INVALID');}
  if(serialized.length<20||serialized.length>512000)throw new Error('M26_WEBAUTHN_CREDENTIAL_RESPONSE_INVALID');
  return JSON.parse(serialized);
}
async function createChallenge(admin,{userId,sessionId,ceremony,challenge,origin}){
  const expiresAt=new Date(Date.now()+CHALLENGE_TTL_MS).toISOString();
  const {data,error}=await admin.from('iberfit_webauthn_challenges_v1').insert({user_id:userId,session_id:sessionId,ceremony,challenge,origin,expires_at:expiresAt}).select('id').single();
  if(error||!data?.id)throw new Error('M26_WEBAUTHN_CHALLENGE_STORE_FAILED');
  return String(data.id);
}
async function consumeChallenge(admin,{challengeId,userId,sessionId,ceremony,origin}){
  if(!UUID_PATTERN.test(String(challengeId||'')))throw new Error('M26_MFA_CHALLENGE_ID_INVALID');
  const now=new Date().toISOString();
  const {data,error}=await admin.from('iberfit_webauthn_challenges_v1').update({consumed_at:now}).eq('id',challengeId).eq('user_id',userId).eq('session_id',sessionId).eq('ceremony',ceremony).eq('origin',origin).is('consumed_at',null).gt('expires_at',now).select('challenge').maybeSingle();
  if(error||!data?.challenge)throw new Error('M26_WEBAUTHN_CHALLENGE_INVALID_OR_EXPIRED');
  return String(data.challenge);
}
async function writeAssurance(admin,{userId,sessionId,credentialId}){
  const now=new Date();const expires=new Date(now.getTime()+ASSURANCE_TTL_MS);
  const {error}=await admin.from('iberfit_privileged_assurance_v1').upsert({user_id:userId,session_id:sessionId,credential_id:credentialId,verified_at:now.toISOString(),expires_at:expires.toISOString(),revoked_at:null},{onConflict:'user_id,session_id'});
  if(error)throw new Error('M26_PRIVILEGED_ASSURANCE_STORE_FAILED');
  return expires.toISOString();
}

async function main(req){
  const origin=requestOrigin(req);
  if(!origin)return fail(403,'M26_WEBAUTHN_ORIGIN_FORBIDDEN');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(origin)});
  if(req.method!=='POST')return fail(405,'M26_METHOD_NOT_ALLOWED',origin);

  const supabaseUrl=String(Deno.env.get('SUPABASE_URL')||'').trim();
  const publishableKey=jsonKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
  const secretKey=jsonKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
  if(!supabaseUrl||!publishableKey||!secretKey)throw new Error('M26_SUPABASE_SERVER_CONFIG_MISSING');
  const authorization=String(req.headers.get('authorization')||'');
  if(!authorization.startsWith('Bearer '))return fail(401,'M26_AUTH_REQUIRED',origin);
  const token=authorization.slice(7).trim();if(!token||token.length>16384)return fail(401,'M26_AUTH_REQUIRED',origin);

  const userClient=createClient(supabaseUrl,publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${token}`}}});
  const admin=createClient(supabaseUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser(token);
  const user=userData?.user;if(userError||!user?.id)return fail(401,'M26_AUTH_INVALID',origin);
  const claims=decodeJwtPayload(token);const sessionId=String(claims?.session_id||'');
  if(!UUID_PATTERN.test(sessionId)||String(claims?.sub||'')!==String(user.id))return fail(401,'M26_AUTH_SESSION_INVALID',origin);

  const {data:context,error:contextError}=await userClient.rpc('iberfit_application_context_v14');
  if(contextError||!context?.ok)return fail(403,'M26_APPLICATION_CONTEXT_REQUIRED',origin);
  const roles=Array.isArray(context.roles)?context.roles.map((role)=>String(role)):[];
  const privilegedRole=roles.includes('admin')?'admin':roles.includes('coach')?'coach':null;
  if(!privilegedRole)return fail(403,'M26_PRIVILEGED_ROLE_REQUIRED',origin);
  const body=await parseBody(req);const action=String(body.action||'').trim();

  if(action==='registration-options'){
    const {data:existing,error:existingError}=await admin.from('iberfit_webauthn_credentials_v1').select('credential_id,transports').eq('user_id',user.id).is('revoked_at',null).limit(10);
    if(existingError)throw new Error('M26_WEBAUTHN_CREDENTIAL_READ_FAILED');
    const options=await generateRegistrationOptions({rpName:RP_NAME,rpID:RP_ID,userID:new TextEncoder().encode(String(user.id)),userName:String(user.email||user.id).slice(0,254),userDisplayName:String(user.email||'IBERFIT').slice(0,120),attestationType:'none',excludeCredentials:(existing||[]).map((item)=>({id:String(item.credential_id),transports:normalizedTransports(item.transports)})),authenticatorSelection:{residentKey:'preferred',userVerification:'required'},supportedAlgorithmIDs:[-7,-257]});
    const challengeId=await createChallenge(admin,{userId:user.id,sessionId,ceremony:'registration',challenge:options.challenge,origin});
    return response(200,{ok:true,challengeId,type:'create',credentialOptions:{publicKey:options},privilegedRole,version:FUNCTION_VERSION},origin);
  }

  if(action==='registration-verify'){
    const credential=credentialResponse(body.credentialResponse);
    const expectedChallenge=await consumeChallenge(admin,{challengeId:String(body.challengeId||''),userId:user.id,sessionId,ceremony:'registration',origin});
    let verification;try{verification=await verifyRegistrationResponse({response:credential,expectedChallenge,expectedOrigin:origin,expectedRPID:RP_ID,requireUserVerification:true});}catch{return fail(400,'M26_WEBAUTHN_REGISTRATION_VERIFICATION_FAILED',origin);}
    if(!verification?.verified||!verification.registrationInfo)return fail(400,'M26_WEBAUTHN_REGISTRATION_NOT_VERIFIED',origin);
    const info=verification.registrationInfo;const registered=info.credential;const publicKeyB64=bytesToBase64Url(registered.publicKey);const counter=Number(registered.counter||0);
    if(!Number.isSafeInteger(counter)||counter<0)throw new Error('M26_WEBAUTHN_COUNTER_INVALID');
    const transports=normalizedTransports(registered.transports||credential?.response?.transports);
    const {error:insertError}=await admin.from('iberfit_webauthn_credentials_v1').insert({user_id:user.id,credential_id:String(registered.id),public_key_b64:publicKeyB64,counter,transports,device_type:String(info.credentialDeviceType||'')||null,backed_up:Boolean(info.credentialBackedUp),friendly_name:'IBERFIT acceso seguro'});
    if(insertError)return fail(409,'M26_WEBAUTHN_CREDENTIAL_ALREADY_REGISTERED',origin);
    const expiresAt=await writeAssurance(admin,{userId:user.id,sessionId,credentialId:String(registered.id)});
    return response(200,{ok:true,verified:true,user:{id:user.id,email:user.email},privilegedRole,expiresAt,version:FUNCTION_VERSION},origin);
  }

  if(action==='authentication-options'){
    const {data:credentials,error:readError}=await admin.from('iberfit_webauthn_credentials_v1').select('credential_id,transports').eq('user_id',user.id).is('revoked_at',null).limit(10);
    if(readError)throw new Error('M26_WEBAUTHN_CREDENTIAL_READ_FAILED');if(!credentials?.length)return fail(409,'M26_WEBAUTHN_NOT_ENROLLED',origin);
    const options=await generateAuthenticationOptions({rpID:RP_ID,allowCredentials:credentials.map((item)=>({id:String(item.credential_id),transports:normalizedTransports(item.transports)})),userVerification:'required'});
    const challengeId=await createChallenge(admin,{userId:user.id,sessionId,ceremony:'authentication',challenge:options.challenge,origin});
    return response(200,{ok:true,challengeId,type:'request',credentialOptions:{publicKey:options},privilegedRole,version:FUNCTION_VERSION},origin);
  }

  if(action==='authentication-verify'){
    const credential=credentialResponse(body.credentialResponse);
    const expectedChallenge=await consumeChallenge(admin,{challengeId:String(body.challengeId||''),userId:user.id,sessionId,ceremony:'authentication',origin});
    const {data:stored,error:storedError}=await admin.from('iberfit_webauthn_credentials_v1').select('credential_id,public_key_b64,counter,transports').eq('user_id',user.id).eq('credential_id',credential.id).is('revoked_at',null).maybeSingle();
    if(storedError||!stored)return fail(404,'M26_WEBAUTHN_CREDENTIAL_NOT_FOUND',origin);
    const counter=Number(stored.counter);if(!Number.isSafeInteger(counter)||counter<0)throw new Error('M26_WEBAUTHN_COUNTER_INVALID');
    let verification;try{verification=await verifyAuthenticationResponse({response:credential,expectedChallenge,expectedOrigin:origin,expectedRPID:RP_ID,requireUserVerification:true,credential:{id:String(stored.credential_id),publicKey:base64UrlToBytes(stored.public_key_b64),counter,transports:normalizedTransports(stored.transports)}});}catch{return fail(400,'M26_WEBAUTHN_AUTHENTICATION_VERIFICATION_FAILED',origin);}
    if(!verification?.verified)return fail(400,'M26_WEBAUTHN_AUTHENTICATION_NOT_VERIFIED',origin);
    const newCounter=Number(verification.authenticationInfo?.newCounter??counter);if(!Number.isSafeInteger(newCounter)||newCounter<0)throw new Error('M26_WEBAUTHN_COUNTER_INVALID');
    const {error:updateError}=await admin.from('iberfit_webauthn_credentials_v1').update({counter:newCounter,last_used_at:new Date().toISOString()}).eq('user_id',user.id).eq('credential_id',credential.id).eq('counter',counter);
    if(updateError)throw new Error('M26_WEBAUTHN_COUNTER_UPDATE_FAILED');
    const expiresAt=await writeAssurance(admin,{userId:user.id,sessionId,credentialId:credential.id});
    return response(200,{ok:true,verified:true,user:{id:user.id,email:user.email},privilegedRole,expiresAt,version:FUNCTION_VERSION},origin);
  }
  return fail(400,'M26_WEBAUTHN_ACTION_INVALID',origin);
}

Deno.serve(async(req)=>{
  try{return await main(req);}
  catch(error){
    console.error(`[IBERFIT:${FUNCTION_VERSION}] ${safeCode(error?.message)}`);
    return fail(500,error?.message,requestOrigin(req));
  }
});
