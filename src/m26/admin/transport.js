import {createM26Transport} from '../supabase-transport.js';

const RPC=Object.freeze({context:'iberfit_application_context_v14',bootstrap:'iberfit_admin_bootstrap_v14',execute:'iberfit_admin_execute_v14'});
const MISSING=/PGRST202|not find the function|M26_HTTP_404/i;
const DEFAULT_TIMEOUT_MS=12_000;
const PRIVILEGED_WEBAUTHN_FACTOR_ID='65000000-0000-4000-8000-000000000002';

function requestTimeout(runtime){
  return Math.max(1_000,Math.min(Number(runtime?.timeoutMs||DEFAULT_TIMEOUT_MS),30_000));
}

export function createAdminTransport({runtime,fetchImpl=globalThis.fetch}={}){
  const url=new URL(String(runtime?.url||''));
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('M26_ADMIN_HTTPS_REQUIRED');
  const key=String(runtime?.publishableKey||runtime?.anonKey||'');
  const timeoutMs=requestTimeout(runtime);
  const authTransport=createM26Transport(runtime,{fetchImpl});

  async function rpc(name,token,params={}){
    if(!token)throw new Error('M26_AUTH_REQUIRED');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(`${url.origin}/rest/v1/rpc/${name}`,{
        method:'POST',
        credentials:'omit',
        cache:'no-store',
        redirect:'error',
        referrerPolicy:'no-referrer',
        signal:controller.signal,
        headers:{
          apikey:key,
          authorization:`Bearer ${token}`,
          'content-type':'application/json',
          'x-client-info':`iberfit-m26-admin/${runtime?.version||'26.0.0'}`,
        },
        body:JSON.stringify(params),
      });
      const body=response.status===204
        ?null
        :(response.headers?.get?.('content-type')||'').includes('json')
          ?await response.json().catch(()=>({}))
          :await response.text().catch(()=>'');
      if(!response.ok){
        const error=new Error(body?.message||body?.error||`M26_HTTP_${response.status}`);
        error.status=response.status;
        throw error;
      }
      return Array.isArray(body)&&body.length===1?body[0]:body;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('M26_TIMEOUT');
      throw error;
    }finally{
      clearTimeout(timer);
    }
  }

  async function optional(name,token,params={}){
    try{
      const data=await rpc(name,token,params);
      if(data?.ok!==true)throw new Error('M26_EXTENSION_NOT_CONFIRMED');
      return Object.freeze({available:true,reason:null,data:Object.freeze({...data,available:true})});
    }catch(error){
      if(error?.status===403)return Object.freeze({available:false,reason:'forbidden',data:null});
      if(error?.status===404||MISSING.test(String(error?.message||error)))return Object.freeze({available:false,reason:'missing',data:null});
      throw error;
    }
  }

  return Object.freeze({
    applicationContextOptional:(token)=>optional(RPC.context,token),
    bootstrapOptional:(token)=>optional(RPC.bootstrap,token),
    privilegedWebAuthnFactorId:PRIVILEGED_WEBAUTHN_FACTOR_ID,
    authAssuranceContext:(token)=>authTransport.authAssuranceContext(token),
    authUser:(token)=>authTransport.authUser(token),
    challengeWebAuthn:(token,factorId)=>authTransport.challengeWebAuthn(token,factorId),
    verifyWebAuthn:(token,payload)=>authTransport.verifyWebAuthn(token,payload),
    execute:async(token,command)=>{
      const result=await rpc(RPC.execute,token,{p_command:command});
      if(result?.ok!==true||!['ack','duplicate'].includes(String(result?.kind||'').toLowerCase()))throw new Error('M26_ADMIN_MUTATION_NOT_CONFIRMED');
      return Object.freeze({...result});
    },
  });
}
