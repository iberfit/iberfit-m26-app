import {createClient} from 'npm:@supabase/supabase-js@2.112.4';

const FUNCTION_VERSION='admin-user-decommission-v1.1';
const ALLOWED_ORIGINS=new Set([
  'https://m26-canary.iberfit.cl',
  'https://app.iberfit.cl',
  'https://coach.iberfit.cl',
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_BODY=80_000;

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
function codeOf(error:unknown,fallback='M26_ADMIN_USER_DECOMMISSION_FAILED'){
  const raw=String((error as {message?:string})?.message||error||'').toUpperCase();
  const match=raw.match(/\b(?:V|M26|IBERFIT)_[A-Z0-9_:-]{2,120}\b/u);
  if(match)return match[0].slice(0,120);
  if(/NOT FOUND|USER.*MISSING/u.test(raw))return 'M26_ADMIN_USER_AUTH_NOT_FOUND';
  return fallback;
}
function normalizeCommand(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('M26_ADMIN_USER_DECOMMISSION_COMMAND_INVALID');
  const command=value as Record<string,unknown>;
  if(String(command.type||'').trim().toUpperCase()!=='ADMIN_USUARIO_ELIMINAR')throw new Error('M26_ADMIN_USER_DECOMMISSION_COMMAND_INVALID');
  const operationId=String(command.operationId||'').trim();
  if(operationId.length<3||operationId.length>200||/[\u0000-\u001f\u007f]/u.test(operationId))throw new Error('M26_ADMIN_USER_DECOMMISSION_OPERATION_INVALID');
  return {command,operationId};
}
function softDeleted(user:unknown){
  if(!user||typeof user!=='object')return false;
  const value=user as Record<string,unknown>;
  return Boolean(String(value.deleted_at||'').trim());
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

  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{return reply(400,{ok:false,code:'M26_BODY_INVALID',version:FUNCTION_VERSION},origin);}
  let normalized:{command:Record<string,unknown>;operationId:string};
  try{normalized=normalizeCommand((parsed as Record<string,unknown>)?.command);}catch(error){
    return reply(400,{ok:false,code:codeOf(error,'M26_ADMIN_USER_DECOMMISSION_COMMAND_INVALID'),version:FUNCTION_VERSION},origin);
  }

  const supabaseUrl=String(Deno.env.get('SUPABASE_URL')||'').trim();
  const anonKey=String(Deno.env.get('SUPABASE_ANON_KEY')||'').trim();
  const serviceRole=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
  if(!supabaseUrl||!anonKey||!serviceRole)return reply(500,{ok:false,code:'M26_SERVER_CONFIG_MISSING',version:FUNCTION_VERSION},origin);

  const userClient=createClient(supabaseUrl,anonKey,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:authorization,Origin:origin}},
  });
  const service=createClient(supabaseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});

  try{
    const {data,error}=await userClient.rpc('iberfit_admin_execute_v14',{p_command:normalized.command});
    if(error)throw error;
    const receipt=(Array.isArray(data)?data[0]:data) as Record<string,unknown>|null;
    const targetUserId=String(receipt?.targetUserId||receipt?.entityId||'').trim();
    if(!receipt||receipt.ok!==true||!['ack','duplicate'].includes(String(receipt.kind||'').toLowerCase())||!UUID.test(targetUserId)){
      throw new Error('M26_ADMIN_USER_DECOMMISSION_RECEIPT_INVALID');
    }

    let authSoftDeleted=false;
    const {data:current,error:lookupError}=await service.auth.admin.getUserById(targetUserId);
    if(lookupError){
      if(/NOT FOUND|USER.*MISSING/i.test(String(lookupError.message||lookupError))){
        authSoftDeleted=true;
      }else{
        throw lookupError;
      }
    }else if(softDeleted(current?.user)){
      authSoftDeleted=true;
    }else{
      const {error:deleteError}=await service.auth.admin.deleteUser(targetUserId,true);
      if(deleteError)throw deleteError;
      authSoftDeleted=true;
    }

    if(!authSoftDeleted)throw new Error('M26_ADMIN_USER_AUTH_SOFT_DELETE_NOT_CONFIRMED');

    return reply(200,{
      ...receipt,
      ok:true,
      kind:String(receipt.kind||'ack'),
      version:FUNCTION_VERSION,
      authIdentitySoftDeleted:true,
    },origin);
  }catch(error){
    const errorCode=codeOf(error);
    const status=/ADMIN_REQUIRED|AUTH_REQUIRED|WEBAUTHN|ASSURANCE|FORBIDDEN|SELF|LAST_ADMIN/u.test(errorCode)?403:
      /REVISION_CONFLICT|OPERATION_COLLISION/u.test(errorCode)?409:
      /AUTH_SOFT_DELETE|SERVER_CONFIG/u.test(errorCode)?503:400;
    return reply(status,{ok:false,code:errorCode,version:FUNCTION_VERSION},origin);
  }
});