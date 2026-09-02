const MISSING=/PGRST202|not find the function|M26_HTTP_404/i;
const DEFAULT_TIMEOUT_MS=12_000;

function requestTimeout(runtime){
  return Math.max(1_000,Math.min(Number(runtime?.timeoutMs||DEFAULT_TIMEOUT_MS),30_000));
}

export function createCommunicationTransport({runtime,fetchImpl=globalThis.fetch}={}){
  const url=new URL(String(runtime?.url||''));
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('M26_COMMUNICATION_HTTPS_REQUIRED');
  const key=String(runtime?.publishableKey||runtime?.anonKey||'');
  const timeoutMs=requestTimeout(runtime);

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
          'x-client-info':`iberfit-m26-communication/${runtime?.version||'26.0.0'}`,
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

  return Object.freeze({
    bootstrapOptional:async(token,{application}={})=>{
      if(!['client','coach'].includes(application))return Object.freeze({available:false,reason:'unsupported',data:null});
      try{
        const data=await rpc('iberfit_communication_bootstrap_v14',token,{p_application:application});
        return Object.freeze({available:true,reason:null,data});
      }catch(error){
        if(error?.status===404||MISSING.test(String(error?.message||error)))return Object.freeze({available:false,reason:'missing',data:null});
        throw error;
      }
    },
    execute:async(token,command,{application}={})=>{
      const result=await rpc('iberfit_communication_execute_v14',token,{p_application:application,p_command:command});
      if(result?.ok!==true||!['ack','duplicate'].includes(String(result?.kind||'').toLowerCase()))throw new Error('M26_COMMUNICATION_MUTATION_NOT_CONFIRMED');
      return result;
    },
  });
}
