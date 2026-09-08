const CREATE_RPC_PATH='/rest/v1/rpc/iberfit_create_client_draft_v12';
const ONBOARDING_FUNCTION_PATH='/functions/v1/iberfit-client-onboarding-v1';
const SUPABASE_ORIGINS=new Set([
  'https://gjztkdwfmunnzhtvxrsu.supabase.co',
  'https://pjhmrhejsoofmouedavw.supabase.co',
]);
const INSTALL_KEY=Symbol.for('iberfit.m26.clientOnboardingInvitationTransport.v1');

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
    return originalFetch(target,{
      method:'POST',
      headers,
      body:JSON.stringify(payload),
      signal:request.signal,
      credentials:'omit',
      cache:'no-store',
      redirect:'error',
      referrerPolicy:'no-referrer',
    });
  };
  Object.defineProperty(scope,INSTALL_KEY,{value:Object.freeze({originalFetch,wrapped}),configurable:false,enumerable:false,writable:false});
  scope.fetch=wrapped;
  return true;
}

export const __clientOnboardingInvitationTransportInternals=Object.freeze({
  CREATE_RPC_PATH,ONBOARDING_FUNCTION_PATH,SUPABASE_ORIGINS,targetFor,onboardingPayload,
});
