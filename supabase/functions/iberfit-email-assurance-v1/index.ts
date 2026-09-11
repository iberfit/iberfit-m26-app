import {createClient} from 'npm:@supabase/supabase-js@2.112.4';

const FUNCTION_VERSION='p0-email-assurance-v1';
const ASSURANCE_TTL_MS=2*60*60*1000;
const MAX_BODY_CHARS=20000;
const MAX_TOKEN_CHARS=16384;
const RECENT_PRIMARY_PASSWORD_SECONDS=15*60;
const RECENT_OTP_SECONDS=10*60;
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ALLOWED_ORIGINS=new Set([
  'https://m26-canary.iberfit.cl',
  'https://app.iberfit.cl',
  'https://coach.iberfit.cl',
]);

function requestOrigin(req){
  const origin=String(req.headers.get('origin')||'').trim().toLowerCase();
  return ALLOWED_ORIGINS.has(origin)?origin:null;
}
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
function corsHeaders(origin=''){
  const headers={
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
function response(status,body,origin=''){
  return new Response(JSON.stringify(body),{status,headers:corsHeaders(origin)});
}
function fail(status,code,origin=''){
  return response(status,{ok:false,code},origin);
}
function decodeJwtPayload(token){
  const parts=String(token||'').split('.');
  if(parts.length!==3)throw new Error('M26_AUTH_TOKEN_INVALID');
  const raw=parts[1].replace(/-/gu,'+').replace(/_/gu,'/');
  const padded=raw+'='.repeat((4-(raw.length%4))%4);
  let binary;try{binary=atob(padded);}catch{throw new Error('M26_AUTH_TOKEN_INVALID');}
  const bytes=Uint8Array.from(binary,(ch)=>ch.charCodeAt(0));
  let payload;try{payload=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('M26_AUTH_TOKEN_INVALID');}
  return payload;
}
function recentAmr(claims,method,maxAgeSeconds){
  const now=Math.floor(Date.now()/1000);
  const items=Array.isArray(claims?.amr)?claims.amr:[];
  return items.some((item)=>{
    if(String(item?.method||'')!==method)return false;
    const timestamp=Number(item?.timestamp);
    return Number.isFinite(timestamp)&&timestamp<=now+60&&timestamp>=now-maxAgeSeconds;
  });
}
async function parseBody(req){
  const text=await req.text();
  if(!text||text.length>MAX_BODY_CHARS)throw new Error('M26_EMAIL_ASSURANCE_BODY_INVALID');
  let body;try{body=JSON.parse(text);}catch{throw new Error('M26_EMAIL_ASSURANCE_BODY_INVALID');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('M26_EMAIL_ASSURANCE_BODY_INVALID');
  return body;
}

Deno.serve(async(req)=>{
  const origin=requestOrigin(req);
  if(!origin)return fail(403,'M26_EMAIL_ASSURANCE_ORIGIN_FORBIDDEN');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(origin)});
  if(req.method!=='POST')return fail(405,'M26_METHOD_NOT_ALLOWED',origin);

  try{
    const supabaseUrl=String(Deno.env.get('SUPABASE_URL')||'').trim();
    const publishableKey=jsonKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
    const secretKey=jsonKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
    if(!supabaseUrl||!publishableKey||!secretKey)throw new Error('M26_SUPABASE_SERVER_CONFIG_MISSING');

    const authorization=String(req.headers.get('authorization')||'');
    if(!authorization.startsWith('Bearer '))return fail(401,'M26_AUTH_REQUIRED',origin);
    const primaryToken=authorization.slice(7).trim();
    if(!primaryToken||primaryToken.length>MAX_TOKEN_CHARS)return fail(401,'M26_AUTH_REQUIRED',origin);

    const body=await parseBody(req);
    const otpToken=String(body.otpAccessToken||'').trim();
    if(!otpToken||otpToken.length>MAX_TOKEN_CHARS)return fail(400,'M26_EMAIL_OTP_SESSION_INVALID',origin);
    if(otpToken===primaryToken)return fail(400,'M26_EMAIL_ASSURANCE_DISTINCT_FACTORS_REQUIRED',origin);

    const primaryClaims=decodeJwtPayload(primaryToken);
    const otpClaims=decodeJwtPayload(otpToken);
    const primarySessionId=String(primaryClaims?.session_id||'');
    const otpSessionId=String(otpClaims?.session_id||'');
    const primaryUserId=String(primaryClaims?.sub||'');
    const otpUserId=String(otpClaims?.sub||'');
    if(!UUID_PATTERN.test(primarySessionId)||!UUID_PATTERN.test(otpSessionId)||primarySessionId===otpSessionId){
      return fail(401,'M26_EMAIL_ASSURANCE_SESSION_INVALID',origin);
    }
    if(!UUID_PATTERN.test(primaryUserId)||primaryUserId!==otpUserId)return fail(403,'M26_EMAIL_ASSURANCE_IDENTITY_MISMATCH',origin);
    if(!recentAmr(primaryClaims,'password',RECENT_PRIMARY_PASSWORD_SECONDS)){
      return fail(403,'M26_EMAIL_ASSURANCE_PASSWORD_RECENT_REQUIRED',origin);
    }
    if(!recentAmr(otpClaims,'otp',RECENT_OTP_SECONDS)){
      return fail(403,'M26_EMAIL_ASSURANCE_OTP_REQUIRED',origin);
    }

    const primaryClient=createClient(supabaseUrl,publishableKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:`Bearer ${primaryToken}`}},
    });
    const otpClient=createClient(supabaseUrl,publishableKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:`Bearer ${otpToken}`}},
    });
    const admin=createClient(supabaseUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

    const [primaryAuth,otpAuth]=await Promise.all([
      primaryClient.auth.getUser(primaryToken),
      otpClient.auth.getUser(otpToken),
    ]);
    const primaryUser=primaryAuth.data?.user;
    const otpUser=otpAuth.data?.user;
    if(primaryAuth.error||otpAuth.error||!primaryUser?.id||!otpUser?.id)return fail(401,'M26_EMAIL_ASSURANCE_AUTH_INVALID',origin);
    if(primaryUser.id!==otpUser.id||primaryUser.id!==primaryUserId)return fail(403,'M26_EMAIL_ASSURANCE_IDENTITY_MISMATCH',origin);
    const primaryEmail=String(primaryUser.email||'').trim().toLowerCase();
    const otpEmail=String(otpUser.email||'').trim().toLowerCase();
    if(!primaryEmail||primaryEmail!==otpEmail)return fail(403,'M26_EMAIL_ASSURANCE_EMAIL_MISMATCH',origin);

    const {data:appContext,error:contextError}=await primaryClient.rpc('iberfit_application_context_v14');
    if(contextError||!appContext?.ok)return fail(403,'M26_APPLICATION_CONTEXT_REQUIRED',origin);
    const roles=Array.isArray(appContext.roles)?appContext.roles.map((role)=>String(role)):[];
    const privilegedRole=roles.includes('admin')?'admin':roles.includes('coach')?'coach':null;
    if(!privilegedRole)return fail(403,'M26_PRIVILEGED_ROLE_REQUIRED',origin);

    const now=new Date();
    const expiresAt=new Date(now.getTime()+ASSURANCE_TTL_MS).toISOString();
    const {error:storeError}=await admin
      .from('iberfit_email_privileged_assurance_v1')
      .upsert({
        user_id:primaryUser.id,
        session_id:primarySessionId,
        otp_session_id:otpSessionId,
        verified_at:now.toISOString(),
        expires_at:expiresAt,
        revoked_at:null,
      },{onConflict:'user_id,session_id'});
    if(storeError){
      if(String(storeError.code||'')==='23505')return fail(409,'M26_EMAIL_ASSURANCE_OTP_ALREADY_USED',origin);
      throw new Error('M26_EMAIL_ASSURANCE_STORE_FAILED');
    }

    return response(200,{
      ok:true,
      verified:true,
      method:'email_otp',
      user:{id:primaryUser.id,email:primaryEmail},
      privilegedRole,
      expiresAt,
      version:FUNCTION_VERSION,
    },origin);
  }catch(error){
    const code=String(error?.message||'M26_EMAIL_ASSURANCE_SERVER_FAILED');
    try{console.error('[IBERFIT:email-assurance]',code);}catch{}
    return fail(500,/^M26_[A-Z0-9_:-]+$/u.test(code)?code:'M26_EMAIL_ASSURANCE_SERVER_FAILED',origin);
  }
});
