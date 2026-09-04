import {createClient} from 'npm:@supabase/supabase-js@2.112.4';

const PROD_REF='pjhmrhejsoofmouedavw';
const QA_REF='gjztkdwfmunnzhtvxrsu';
const FUNCTION_VERSION='rc74-13-client-access-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const MAX_BODY=32_000;
const RETENTION_TABLES=[
  'beta_incidents_v16',
  'beta_participants_v16',
  'consent_acceptances_v17',
  'data_subject_requests_v17',
  'device_conflict_trials',
  'incident_register_v17',
];

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

function environment(){
  const url=String(Deno.env.get('SUPABASE_URL')||'').trim();
  let ref='';
  try{ref=new URL(url).hostname.split('.')[0]||'';}catch{}
  if(ref===PROD_REF)return Object.freeze({ref,url,origins:new Set(['https://app.iberfit.cl','https://coach.iberfit.cl']),redirectTo:'https://app.iberfit.cl/m26/activate.html'});
  if(ref===QA_REF)return Object.freeze({ref,url,origins:new Set(['https://m26-canary.iberfit.cl']),redirectTo:'https://m26-canary.iberfit.cl/m26/activate.html'});
  throw new Error('M26_CLIENT_ACCESS_PROJECT_FORBIDDEN');
}

function originFor(req,env){
  const origin=String(req.headers.get('origin')||'').trim();
  return env.origins.has(origin)?origin:null;
}
function headers(origin){
  return {
    ...(origin?{'access-control-allow-origin':origin}:{}),
    'access-control-allow-headers':'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods':'POST, OPTIONS',
    'access-control-max-age':'600',
    'cache-control':'no-store',
    'content-type':'application/json; charset=utf-8',
    'vary':'Origin',
    'x-content-type-options':'nosniff',
  };
}
function reply(status,body,origin){return new Response(JSON.stringify(body),{status,headers:headers(origin)});}
function code(value,fallback='M26_CLIENT_ACCESS_FAILED'){
  const safe=String(value||'').trim().toUpperCase();
  return /^M26_[A-Z0-9_:-]{3,100}$/u.test(safe)?safe:fallback;
}
function fail(status,value,origin,extra={}){return reply(status,{ok:false,code:code(value),...extra},origin);}
async function body(req){
  const text=await req.text();
  if(!text||text.length>MAX_BODY)throw new Error('M26_CLIENT_ACCESS_BODY_INVALID');
  let parsed;try{parsed=JSON.parse(text);}catch{throw new Error('M26_CLIENT_ACCESS_BODY_INVALID');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('M26_CLIENT_ACCESS_BODY_INVALID');
  return parsed;
}
function safeClientId(value){const id=String(value||'').trim();if(!UUID.test(id))throw new Error('M26_CLIENT_ID_INVALID');return id;}
function normalizedName(value){return String(value||'').normalize('NFKC').replace(/\s+/gu,' ').trim().slice(0,160);}
function normalizedEmail(value){const email=String(value||'').trim().toLowerCase();if(email.length<5||email.length>254||!EMAIL.test(email))throw new Error('M26_CLIENT_EMAIL_INVALID');return email;}

async function contextFor(userClient){
  const {data,error}=await userClient.rpc('iberfit_application_context_v14');
  if(error||!data?.ok)throw new Error('M26_APPLICATION_CONTEXT_REQUIRED');
  const roles=Array.isArray(data.roles)?data.roles.map((item)=>String(item).toLowerCase()):[];
  const assigned=new Set(Array.isArray(data.assignedClientIds)?data.assignedClientIds.map(String):[]);
  return Object.freeze({organizationId:String(data.organizationId||''),roles:Object.freeze(roles),assigned});
}
function canManage(context,clientId){return context.roles.includes('admin')||(context.roles.includes('coach')&&context.assigned.has(clientId));}
async function requireAssurance(userClient,context){
  const {data,error}=await userClient.rpc('iberfit_privileged_assurance_context_v65d');
  if(error||!data?.ok||data.privileged!==true||data.webauthnRequired!==true||data.iberfitAssurance!=='verified')throw new Error('M26_PRIVILEGED_WEBAUTHN_REQUIRED');
  const expected=context.roles.includes('admin')?'admin':context.roles.includes('coach')?'coach':null;
  if(!expected||data.privilegedRole!==expected)throw new Error('M26_PRIVILEGED_ROLE_MISMATCH');
}

async function clientRecord(admin,clientId){
  const [{data:client,error:clientError},{data:intake,error:intakeError},{data:access,error:accessError}]=await Promise.all([
    admin.from('clients').select('id,name,modality').eq('id',clientId).maybeSingle(),
    admin.from('client_intake_profiles').select('client_id,email').eq('client_id',clientId).maybeSingle(),
    admin.from('client_access_v26').select('client_id,auth_user_id,email,access_enabled,status,invite_attempts,last_invited_at,activated_at').eq('client_id',clientId).maybeSingle(),
  ]);
  if(clientError)throw new Error('M26_CLIENT_READ_FAILED');
  if(!client?.id)throw new Error('M26_CLIENT_NOT_FOUND');
  if(intakeError)throw new Error('M26_CLIENT_INTAKE_READ_FAILED');
  if(accessError)throw new Error('M26_CLIENT_ACCESS_READ_FAILED');
  const email=normalizedEmail(intake?.email||access?.email||'');
  return Object.freeze({client,access:access||null,email});
}
async function statusPayload(admin,record){
  let auth=null;
  if(record.access?.auth_user_id){
    const {data,error}=await admin.auth.admin.getUserById(record.access.auth_user_id);
    if(!error&&data?.user)auth=data.user;
  }
  const active=record.access?.status==='active'&&record.access?.access_enabled===true;
  return Object.freeze({
    clientId:String(record.client.id),
    clientName:normalizedName(record.client.name),
    email:record.email,
    status:active?'active':record.access?.last_invited_at?'invited':'not-invited',
    accessEnabled:active,
    inviteAttempts:Number(record.access?.invite_attempts||0),
    lastInvitedAt:record.access?.last_invited_at||null,
    activatedAt:record.access?.activated_at||null,
    emailConfirmedAt:auth?.email_confirmed_at||null,
    lastSignInAt:auth?.last_sign_in_at||null,
  });
}

async function removeDraftAuthUser(admin,access,clientId){
  const authUserId=String(access?.auth_user_id||'');
  if(!UUID.test(authUserId)||access?.status==='active'||access?.access_enabled===true)return false;
  const {data:profile,error}=await admin.from('user_profiles').select('role,client_id').eq('user_id',authUserId).maybeSingle();
  if(error)throw new Error('M26_CLIENT_AUTH_PROFILE_READ_FAILED');
  if(!profile||String(profile.role)!=='client'||String(profile.client_id)!==clientId)throw new Error('M26_CLIENT_AUTH_IDENTITY_CONFLICT');
  const result=await admin.auth.admin.deleteUser(authUserId);
  if(result.error)throw new Error('M26_CLIENT_DRAFT_AUTH_DELETE_FAILED');
  return true;
}

async function invite(admin,userId,context,record,origin){
  const clientId=String(record.client.id);
  if(record.access?.status==='active'&&record.access?.access_enabled===true)return reply(200,{ok:true,alreadyActive:true,status:await statusPayload(admin,record),version:FUNCTION_VERSION},origin);
  const attempts=Number(record.access?.invite_attempts||0);
  if(!Number.isInteger(attempts)||attempts<0||attempts>=100)return fail(429,'M26_CLIENT_INVITE_LIMIT_REACHED',origin);
  if(record.access?.auth_user_id)await removeDraftAuthUser(admin,record.access,clientId);

  const clientName=normalizedName(record.client.name)||'Cliente IBERFIT';
  const invitation=await admin.auth.admin.inviteUserByEmail(record.email,{
    redirectTo:environment().redirectTo,
    data:{
      first_name:clientName.split(' ')[0]||clientName,
      client_name:clientName,
      client_id:clientId,
      iberfit_invitation:true,
      brand_name:'IBERFIT',
      brand_logo_url:'https://app.iberfit.cl/public/isotipo-iberfit.png',
      invitation_title:'Tu espacio de entrenamiento IBERFIT está listo',
    },
  });
  if(invitation.error||!invitation.data?.user?.id)throw new Error('M26_CLIENT_INVITE_SEND_FAILED');
  const authUserId=String(invitation.data.user.id);
  const now=new Date().toISOString();

  const {error:profileError}=await admin.from('user_profiles').upsert({user_id:authUserId,role:'client',client_id:clientId,display_name:clientName},{onConflict:'user_id'});
  if(profileError){await admin.auth.admin.deleteUser(authUserId).catch(()=>{});throw new Error('M26_CLIENT_PROFILE_LINK_FAILED');}
  const {error:membershipError}=await admin.from('iberfit_organization_memberships').upsert({organization_id:context.organizationId,user_id:authUserId,status:'active',revision:1,updated_at:now},{onConflict:'organization_id,user_id'});
  if(membershipError){await admin.auth.admin.deleteUser(authUserId).catch(()=>{});throw new Error('M26_CLIENT_MEMBERSHIP_LINK_FAILED');}
  const {error:accessError}=await admin.from('client_access_v26').upsert({
    client_id:clientId,
    auth_user_id:authUserId,
    email:record.email,
    access_enabled:false,
    status:'draft',
    invite_attempts:attempts+1,
    last_invited_at:now,
    activated_at:null,
    created_by:record.access?.created_by||userId,
    updated_by:userId,
    updated_at:now,
  },{onConflict:'client_id'});
  if(accessError){await admin.auth.admin.deleteUser(authUserId).catch(()=>{});throw new Error('M26_CLIENT_ACCESS_LINK_FAILED');}
  const fresh=await clientRecord(admin,clientId);
  return reply(200,{ok:true,sent:true,status:await statusPayload(admin,fresh),version:FUNCTION_VERSION},origin);
}

async function activate(admin,user,origin){
  const {data:profile,error:profileError}=await admin.from('user_profiles').select('role,client_id').eq('user_id',user.id).maybeSingle();
  if(profileError||!profile||String(profile.role)!=='client'||!UUID.test(String(profile.client_id||'')))return fail(403,'M26_CLIENT_ACTIVATION_PROFILE_REQUIRED',origin);
  const clientId=String(profile.client_id);
  const {data:access,error:accessReadError}=await admin.from('client_access_v26').select('auth_user_id,email,status').eq('client_id',clientId).maybeSingle();
  if(accessReadError||!access||String(access.auth_user_id)!==String(user.id))return fail(403,'M26_CLIENT_ACTIVATION_LINK_INVALID',origin);
  if(normalizedEmail(access.email)!==normalizedEmail(user.email))return fail(403,'M26_CLIENT_ACTIVATION_EMAIL_MISMATCH',origin);
  const now=new Date().toISOString();
  const {error}=await admin.from('client_access_v26').update({status:'active',access_enabled:true,activated_at:now,updated_by:user.id,updated_at:now}).eq('client_id',clientId).eq('auth_user_id',user.id);
  if(error)throw new Error('M26_CLIENT_ACTIVATION_UPDATE_FAILED');
  return reply(200,{ok:true,activated:true,clientId,activatedAt:now,version:FUNCTION_VERSION},origin);
}

async function retentionBlockers(admin,clientId){
  const checks=await Promise.all(RETENTION_TABLES.map(async table=>{
    const {count,error}=await admin.from(table).select('*',{count:'exact',head:true}).eq('client_id',clientId);
    if(error)throw new Error('M26_CLIENT_DELETE_PREFLIGHT_FAILED');
    return count&&count>0?{table,count}:null;
  }));
  return checks.filter(Boolean);
}

async function deleteClient(admin,userId,context,record,confirmationName,origin){
  if(!context.roles.includes('admin'))return fail(403,'M26_ADMIN_ROLE_REQUIRED',origin);
  const expected=normalizedName(record.client.name);
  if(!expected||normalizedName(confirmationName)!==expected)return fail(400,'M26_CLIENT_DELETE_CONFIRMATION_MISMATCH',origin);
  const blockers=await retentionBlockers(admin,String(record.client.id));
  if(blockers.length)return fail(409,'M26_CLIENT_DELETE_RETENTION_BLOCKED',origin,{blockers});

  const authUserId=UUID.test(String(record.access?.auth_user_id||''))?String(record.access.auth_user_id):null;
  let deleteAuthAfter=false;
  if(authUserId){
    const [{data:profile,error:profileError},{data:roles,error:rolesError}]=await Promise.all([
      admin.from('user_profiles').select('role,client_id').eq('user_id',authUserId).maybeSingle(),
      admin.from('user_application_roles').select('role,active').eq('user_id',authUserId).eq('active',true),
    ]);
    if(profileError||rolesError)throw new Error('M26_CLIENT_DELETE_AUTH_PREFLIGHT_FAILED');
    const privileged=(roles||[]).some(item=>['admin','coach'].includes(String(item.role).toLowerCase()));
    deleteAuthAfter=Boolean(profile&&String(profile.role)==='client'&&String(profile.client_id)===String(record.client.id)&&!privileged);
  }

  const {error}=await admin.from('clients').delete().eq('id',record.client.id);
  if(error)throw new Error('M26_CLIENT_DELETE_FAILED');

  let authAccountDeleted=false;
  if(authUserId&&deleteAuthAfter){
    const result=await admin.auth.admin.deleteUser(authUserId);
    authAccountDeleted=!result.error;
  }
  console.info(`[IBERFIT:${FUNCTION_VERSION}] ADMIN_CLIENT_DELETE actor=${userId} client=${record.client.id} authDeleted=${authAccountDeleted}`);
  return reply(200,{ok:true,deleted:true,clientId:String(record.client.id),authAccountDeleted,version:FUNCTION_VERSION},origin);
}

async function main(req){
  const env=environment();
  const origin=originFor(req,env);
  if(!origin)return fail(403,'M26_CLIENT_ACCESS_ORIGIN_FORBIDDEN',null);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=='POST')return fail(405,'M26_METHOD_NOT_ALLOWED',origin);

  const publishableKey=jsonKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
  const secretKey=jsonKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
  if(!env.url||!publishableKey||!secretKey)throw new Error('M26_SUPABASE_SERVER_CONFIG_MISSING');
  const authorization=String(req.headers.get('authorization')||'');
  if(!authorization.startsWith('Bearer '))return fail(401,'M26_AUTH_REQUIRED',origin);
  const token=authorization.slice(7).trim();
  if(!token||token.length>16384)return fail(401,'M26_AUTH_REQUIRED',origin);

  const userClient=createClient(env.url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${token}`}}});
  const admin=createClient(env.url,secretKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser(token);
  const user=userData?.user;
  if(userError||!user?.id)return fail(401,'M26_AUTH_INVALID',origin);

  const input=await body(req);
  const action=String(input.action||'').trim().toLowerCase();
  if(action==='activate')return activate(admin,user,origin);

  const context=await contextFor(userClient);
  const clientId=safeClientId(input.clientId);
  if(!canManage(context,clientId))return fail(403,'M26_CLIENT_ACCESS_SCOPE_FORBIDDEN',origin);
  const record=await clientRecord(admin,clientId);

  if(action==='status')return reply(200,{ok:true,status:await statusPayload(admin,record),version:FUNCTION_VERSION},origin);
  if(action==='invite'){
    await requireAssurance(userClient,context);
    return invite(admin,user.id,context,record,origin);
  }
  if(action==='delete-client'){
    await requireAssurance(userClient,context);
    return deleteClient(admin,user.id,context,record,input.confirmationName,origin);
  }
  return fail(400,'M26_CLIENT_ACCESS_ACTION_INVALID',origin);
}

Deno.serve(async req=>{
  let origin=null;
  try{const env=environment();origin=originFor(req,env);return await main(req);}
  catch(error){
    const safe=code(error?.message);
    console.error(`[IBERFIT:${FUNCTION_VERSION}] ${safe}`);
    const status=safe==='M26_CLIENT_NOT_FOUND'?404:safe.includes('AUTH_')?401:safe.includes('FORBIDDEN')||safe.includes('REQUIRED')?403:500;
    return fail(status,safe,origin);
  }
});
