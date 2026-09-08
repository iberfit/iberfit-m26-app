const CREATE_RPC_PATH='/rest/v1/rpc/iberfit_create_client_draft_v12';
const ONBOARDING_FUNCTION_PATH='/functions/v1/iberfit-client-onboarding-v1';
const SUPABASE_ORIGINS=new Set([
  'https://gjztkdwfmunnzhtvxrsu.supabase.co',
  'https://pjhmrhejsoofmouedavw.supabase.co',
]);
const INSTALL_KEY=Symbol.for('iberfit.m26.clientOnboardingInvitationTransport.v1');
const LAST_RESULT_KEY=Symbol.for('iberfit.m26.clientOnboardingInvitationResult.v1');

function asRequest(input,init){
  try{return input instanceof Request&&!init?input:new Request(input,init);}catch{return null;}
}
function targetFor(request){
  if(!request)return null;
  let url;try{url=new URL(request.url);}catch{return null;}
  if(request.method!=='POST'||url.pathname!==CREATE_RPC_PATH||!SUPABASE_ORIGINS.has(url.origin))return null;
  return `${url.origin}${ONBOARDING_FUNCTION_PATH}`;
}
async function onboardingPayload(request){
  let parsed;try{parsed=JSON.parse(await request.clone().text());}catch{throw new Error('M26_CLIENT_DRAFT_PAYLOAD_INVALID');}
  const payload=parsed?.p_payload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('M26_CLIENT_DRAFT_PAYLOAD_INVALID');
  return payload;
}
function invitationUi(status){
  if(status==='sent')return Object.freeze({kind:'success',text:'Invitación de acceso enviada al correo del cliente.'});
  if(status==='linked_existing')return Object.freeze({kind:'success',text:'Cuenta IBERFIT existente vinculada al expediente; no se envió un correo duplicado.'});
  if(status==='error')return Object.freeze({kind:'error',text:'Expediente creado, pero el acceso no pudo enviarse. La invitación queda marcada para reintento.'});
  return Object.freeze({kind:'pending',text:'Expediente creado. Preparando el acceso del cliente…'});
}
function rememberInvitationResult(scope,payload){
  const invitation=payload?.invitation;
  if(!invitation||typeof invitation!=='object')return;
  const status=String(invitation.status||'').trim().toLowerCase();
  const ui=invitationUi(status);
  scope[LAST_RESULT_KEY]=Object.freeze({status,...ui});
  const root=scope.document?.querySelector?.('#app');
  if(root?.dispatchEvent&&typeof scope.CustomEvent==='function'){
    root.dispatchEvent(new scope.CustomEvent('m26:client-invitation-status',{bubbles:true,detail:Object.freeze({status,...ui})}));
  }
}
function installToastEnrichment(scope){
  const root=scope.document?.querySelector?.('#app');
  if(!root?.addEventListener)return;
  root.addEventListener('m26:toast',(event)=>{
    const result=scope[LAST_RESULT_KEY];
    const message=String(event?.detail?.message||'');
    if(!result||!/^Expediente de /u.test(message))return;
    try{event.detail.message=`${message} ${result.text}`;}catch{}
    scope[LAST_RESULT_KEY]=null;
  },true);
}

export function installClientOnboardingInvitationTransport(scope=globalThis){
  if(!scope||typeof scope.fetch!=='function'||typeof Request!=='function'||typeof Headers!=='function')return false;
  if(scope[INSTALL_KEY])return true;
  const originalFetch=scope.fetch.bind(scope);
  const wrapped=async(input,init)=>{
    const request=asRequest(input,init);
    const target=targetFor(request);
    if(!target)return originalFetch(input,init);
    const payload=await onboardingPayload(request);
    const headers=new Headers(request.headers);
    headers.set('content-type','application/json');
    const response=await originalFetch(target,{
      method:'POST',
      headers,
      body:JSON.stringify(payload),
      signal:request.signal,
      credentials:'omit',
      cache:'no-store',
      redirect:'error',
      referrerPolicy:'no-referrer',
    });
    try{rememberInvitationResult(scope,await response.clone().json());}catch{}
    return response;
  };
  Object.defineProperty(scope,INSTALL_KEY,{value:Object.freeze({originalFetch,wrapped}),configurable:false,enumerable:false,writable:false});
  scope.fetch=wrapped;
  installToastEnrichment(scope);
  return true;
}

export const __clientOnboardingInvitationTransportInternals=Object.freeze({
  CREATE_RPC_PATH,ONBOARDING_FUNCTION_PATH,SUPABASE_ORIGINS,targetFor,onboardingPayload,invitationUi,rememberInvitationResult,
});
