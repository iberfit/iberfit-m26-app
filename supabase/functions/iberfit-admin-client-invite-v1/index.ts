import {createClient} from 'npm:@supabase/supabase-js@2.112.4';

const FUNCTION_VERSION='admin-client-invite-v26.1';
const ALLOWED_ORIGINS=new Set([
  'https://m26-canary.iberfit.cl',
  'https://app.iberfit.cl',
  'https://coach.iberfit.cl',
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_BODY=160_000;

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
function codeOf(error:unknown,fallback='V26_INVITATION_SEND_FAILED'){
  const raw=String((error as {message?:string})?.message||error||'').toUpperCase();
  const match=raw.match(/\b(?:V|M26|IBERFIT)_[A-Z0-9_:-]{2,100}\b/u);
  if(match)return match[0].slice(0,100);
  if(/ALREADY.*REGISTER|USER.*EXISTS|ALREADY.*EXISTS/u.test(raw))return 'V26_AUTH_USER_ALREADY_EXISTS';
  if(/RATE|LIMIT/u.test(raw))return 'V26_INVITATION_RATE_LIMITED';
  return fallback;
}
function normalizeEmail(value:unknown){
  const email=String(value||'').trim().toLowerCase();
  if(email.length<5||email.length>254||!email.includes('@')||/[\u0000-\u001f\u007f]/u.test(email))throw new Error('V26_INVITATION_EMAIL_INVALID');
  return email;
}
function normalizeCommand(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('V26_INVITATION_COMMAND_INVALID');
  const command=value as Record<string,unknown>;
  if(String(command.type||'').trim().toUpperCase()!=='ADMIN_CLIENTE_CREAR')throw new Error('V26_INVITATION_COMMAND_INVALID');
  const operationId=String(command.operationId||'').trim();
  if(operationId.length<3||operationId.length>200||/[\u0000-\u001f\u007f]/u.test(operationId))throw new Error('V26_INVITATION_OPERATION_INVALID');
  return {command,operationId};
}
async function findAuthUserByEmail(service:ReturnType<typeof createClient>,email:string){
  for(let page=1;page<=10;page+=1){
    const {data,error}=await service.auth.admin.listUsers({page,perPage:1000});
    if(error)throw error;
    const user=(data?.users||[]).find((item)=>String(item.email||'').trim().toLowerCase()===email)||null;
    if(user)return user;
    if((data?.users||[]).length<1000)return null;
  }
  throw new Error('V26_AUTH_USER_LOOKUP_LIMIT');
}

Deno.serve(async(req:Request)=>{
  const origin=String(req.headers.get('origin')||'').trim().toLowerCase();
  if(req.method==='OPTIONS')return reply(ALLOWED_ORIGINS.has(origin)?204:403,{},origin);
  if(req.method!=='POST')return reply(405,{ok:false,code:'V26_METHOD_NOT_ALLOWED',version:FUNCTION_VERSION},origin);
  if(!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,code:'V26_ORIGIN_FORBIDDEN',version:FUNCTION_VERSION},origin);

  const authorization=String(req.headers.get('authorization')||'').trim();
  if(!authorization.startsWith('Bearer ')||authorization.length>20000)return reply(401,{ok:false,code:'V26_AUTH_REQUIRED',version:FUNCTION_VERSION},origin);
  const raw=await req.text();
  if(raw.length<2||raw.length>MAX_BODY)return reply(400,{ok:false,code:'V26_BODY_INVALID',version:FUNCTION_VERSION},origin);

  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{return reply(400,{ok:false,code:'V26_BODY_INVALID',version:FUNCTION_VERSION},origin);}
  let normalized:{command:Record<string,unknown>;operationId:string};
  try{normalized=normalizeCommand((parsed as Record<string,unknown>)?.command);}catch(error){return reply(400,{ok:false,code:codeOf(error,'V26_INVITATION_COMMAND_INVALID'),version:FUNCTION_VERSION},origin);}

  const supabaseUrl=String(Deno.env.get('SUPABASE_URL')||'').trim();
  const anonKey=String(Deno.env.get('SUPABASE_ANON_KEY')||'').trim();
  const serviceRole=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
  if(!supabaseUrl||!anonKey||!serviceRole)return reply(500,{ok:false,code:'V26_SERVER_CONFIG_MISSING',version:FUNCTION_VERSION},origin);

  const userClient=createClient(supabaseUrl,anonKey,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:authorization,Origin:origin}},
  });
  const service=createClient(supabaseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  const publicAuth=createClient(supabaseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  let createReceipt:Record<string,unknown>|null=null;
  let clientId='';
  let email='';
  let createdAuthUserId='';

  try{
    const {data:createData,error:createError}=await userClient.rpc('iberfit_admin_execute_v14',{p_command:normalized.command});
    if(createError)throw createError;
    const item=(Array.isArray(createData)?createData[0]:createData) as Record<string,unknown>|null;
    clientId=String(item?.clientId||item?.entityId||'').trim();
    if(!item||item.ok!==true||!UUID.test(clientId))throw new Error('V26_ADMIN_CLIENT_CREATE_INVALID_RESPONSE');
    createReceipt=item;

    const {data:prepareData,error:prepareError}=await userClient.rpc('iberfit_admin_client_invitation_prepare_v26',{p_client_id:clientId,p_operation_id:normalized.operationId});
    if(prepareError)throw prepareError;
    const prepared=(Array.isArray(prepareData)?prepareData[0]:prepareData) as Record<string,unknown>|null;
    if(!prepared||prepared.ok!==true)throw new Error('V26_INVITATION_PREPARE_INVALID_RESPONSE');
    email=normalizeEmail(prepared.email);
    if(prepared.shouldSend!==true){
      return reply(200,{...createReceipt,ok:true,version:FUNCTION_VERSION,invitation:{deliveryStatus:prepared.deliveryStatus||null,accessStatus:prepared.accessStatus||null,reason:prepared.reason||'not_required',email}},origin);
    }

    const redirectTo=`${origin}/`;
    const existing=await findAuthUserByEmail(service,email);
    let authUserId='';
    let deliveryMode='invite';

    if(existing){
      authUserId=String(existing.id||'');
      if(!UUID.test(authUserId))throw new Error('V26_AUTH_USER_INVALID');
      const {data:bindData,error:bindError}=await userClient.rpc('iberfit_admin_client_invitation_bind_v26',{p_client_id:clientId,p_auth_user_id:authUserId});
      if(bindError)throw bindError;
      if(!(Array.isArray(bindData)?bindData[0]:bindData)?.ok)throw new Error('V26_INVITATION_BIND_INVALID_RESPONSE');
      const {error:recoveryError}=await publicAuth.auth.resetPasswordForEmail(email,{redirectTo});
      if(recoveryError)throw recoveryError;
      deliveryMode='recovery-existing-user';
    }else{
      const name=String(prepared.name||'Cliente IBERFIT').trim().slice(0,200)||'Cliente IBERFIT';
      const {data:inviteData,error:inviteError}=await service.auth.admin.inviteUserByEmail(email,{redirectTo,data:{name,role:'client',client_id:clientId}});
      if(inviteError)throw inviteError;
      authUserId=String(inviteData?.user?.id||'');
      if(!UUID.test(authUserId))throw new Error('V26_INVITATION_AUTH_USER_INVALID');
      createdAuthUserId=authUserId;
      const {data:bindData,error:bindError}=await userClient.rpc('iberfit_admin_client_invitation_bind_v26',{p_client_id:clientId,p_auth_user_id:authUserId});
      if(bindError)throw bindError;
      if(!(Array.isArray(bindData)?bindData[0]:bindData)?.ok)throw new Error('V26_INVITATION_BIND_INVALID_RESPONSE');
    }

    const {data:finalData,error:finalError}=await userClient.rpc('iberfit_admin_client_invitation_finalize_v26',{p_client_id:clientId,p_operation_id:normalized.operationId,p_delivery_status:'sent',p_error_code:null});
    if(finalError)throw finalError;
    const finalized=(Array.isArray(finalData)?finalData[0]:finalData) as Record<string,unknown>|null;
    if(!finalized||finalized.ok!==true)throw new Error('V26_INVITATION_FINALIZE_INVALID_RESPONSE');
    createdAuthUserId='';
    return reply(200,{...createReceipt,ok:true,version:FUNCTION_VERSION,invitation:{...finalized,email,deliveryMode}},origin);
  }catch(error){
    const errorCode=codeOf(error);
    if(createdAuthUserId&&UUID.test(createdAuthUserId)){
      try{await service.auth.admin.deleteUser(createdAuthUserId);}catch{}
    }
    if(clientId&&UUID.test(clientId)){
      try{await userClient.rpc('iberfit_admin_client_invitation_finalize_v26',{p_client_id:clientId,p_operation_id:normalized.operationId,p_delivery_status:'error',p_error_code:errorCode});}catch{}
      return reply(200,{...(createReceipt||{}),ok:true,kind:String(createReceipt?.kind||'ack'),operationId:normalized.operationId,commandType:'ADMIN_CLIENTE_CREAR',entityId:clientId,clientId,version:FUNCTION_VERSION,invitation:{deliveryStatus:'error',accessStatus:'invitacion_pendiente',errorCode,email:email||null}},origin);
    }
    const status=/ADMIN_REQUIRED|AUTH_REQUIRED|WEBAUTHN|ASSURANCE|FORBIDDEN/u.test(errorCode)?403:400;
    return reply(status,{ok:false,code:errorCode,version:FUNCTION_VERSION},origin);
  }
});