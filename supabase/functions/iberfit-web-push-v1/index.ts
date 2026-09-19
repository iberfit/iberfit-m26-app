import {createClient} from 'npm:@supabase/supabase-js@2.112.4';

const FUNCTION_VERSION='web-push-v1.0';
const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const PROD_PROJECT_REF='pjhmrhejsoofmouedavw';
const APPLICATIONS=new Set(['client','coach']);

function deploymentProjectRef(value:string){
  try{
    const host=new URL(String(value||'')).hostname.toLowerCase();
    return host.match(/^([a-z0-9]{20})\.supabase\.co$/u)?.[1]||'';
  }catch{return '';}
}

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SUPABASE_ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')||'';
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const DEPLOYMENT_PROJECT_REF=deploymentProjectRef(SUPABASE_URL);
const ALLOWED_ORIGINS=new Set(
  DEPLOYMENT_PROJECT_REF===QA_PROJECT_REF
    ?['https://m26-canary.iberfit.cl']
    :DEPLOYMENT_PROJECT_REF===PROD_PROJECT_REF
      ?['https://app.iberfit.cl','https://coach.iberfit.cl']
      :[],
);

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
function bearer(req:Request){
  const raw=String(req.headers.get('authorization')||'').trim();
  return /^Bearer\s+/iu.test(raw)?raw.replace(/^Bearer\s+/iu,'').trim():'';
}
function configuredPublicKey(){
  const subject=String(Deno.env.get('IBERFIT_VAPID_SUBJECT')||'').trim();
  const publicKey=String(Deno.env.get('IBERFIT_VAPID_PUBLIC_KEY')||'').trim();
  const privateKey=String(Deno.env.get('IBERFIT_VAPID_PRIVATE_KEY')||'').trim();
  const configured=Boolean(
    subject&&
    publicKey.length>=80&&publicKey.length<=180&&
    privateKey.length>=32&&privateKey.length<=180&&
    (/^mailto:/iu.test(subject)||/^https:\/\//iu.test(subject))
  );
  return {configured,publicKey:configured?publicKey:''};
}

Deno.serve(async(req:Request)=>{
  const origin=String(req.headers.get('origin')||'').trim();
  if(req.method==='OPTIONS'){
    if(!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,code:'IBERFIT_PUSH_ORIGIN_FORBIDDEN',version:FUNCTION_VERSION},origin);
    return new Response(null,{status:204,headers:cors(origin)});
  }
  if(req.method!=='POST')return reply(405,{ok:false,code:'IBERFIT_PUSH_METHOD_NOT_ALLOWED',version:FUNCTION_VERSION},origin);
  if(!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,code:'IBERFIT_PUSH_ORIGIN_FORBIDDEN',version:FUNCTION_VERSION},origin);
  if(!SUPABASE_URL||!SUPABASE_ANON_KEY||!SUPABASE_SERVICE_ROLE_KEY){
    return reply(503,{ok:false,code:'IBERFIT_PUSH_BACKEND_NOT_CONFIGURED',version:FUNCTION_VERSION},origin);
  }

  const token=bearer(req);
  if(!token)return reply(401,{ok:false,code:'IBERFIT_PUSH_AUTH_REQUIRED',version:FUNCTION_VERSION},origin);

  const service=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await service.auth.getUser(token);
  const user=userData?.user||null;
  if(userError||!user?.id)return reply(401,{ok:false,code:'IBERFIT_PUSH_AUTH_INVALID',version:FUNCTION_VERSION},origin);

  let body:Record<string,unknown>={};
  try{
    const parsed=await req.json();
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('invalid');
    body=parsed as Record<string,unknown>;
  }catch{
    return reply(400,{ok:false,code:'IBERFIT_PUSH_BODY_INVALID',version:FUNCTION_VERSION},origin);
  }

  const action=String(body.action||'').trim().toLowerCase();
  const application=String(body.application||'').trim().toLowerCase();
  if(action!=='config')return reply(400,{ok:false,code:'IBERFIT_PUSH_ACTION_INVALID',version:FUNCTION_VERSION},origin);
  if(!APPLICATIONS.has(application))return reply(400,{ok:false,code:'IBERFIT_PUSH_APPLICATION_INVALID',version:FUNCTION_VERSION},origin);

  const userClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:`Bearer ${token}`}},
  });
  const {data:context,error:contextError}=await userClient.rpc('iberfit_application_context_v14');
  const roles=Array.isArray(context?.roles)?context.roles.map((value:unknown)=>String(value||'').toLowerCase()):[];
  if(contextError||context?.ok!==true||!roles.includes(application)){
    return reply(403,{ok:false,code:'IBERFIT_PUSH_APPLICATION_FORBIDDEN',version:FUNCTION_VERSION},origin);
  }

  const vapid=configuredPublicKey();
  return reply(200,{
    ok:true,
    configured:vapid.configured,
    publicKey:vapid.publicKey,
    application,
    privacyMode:'generic-lock-screen-copy',
    version:FUNCTION_VERSION,
  },origin);
});
