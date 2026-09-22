const TRANSIENT_STATUS=new Set([408,425,429,500,501,502,503,504,505,506,507,508,510,511,520,521,522,523,524,525,526,527,530]);
const DEFAULT_DELAYS_MS=Object.freeze([1000,2000,4000,8000]);

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function safeError(value){return String(value instanceof Error?value.message:value||'UNKNOWN').replace(/[\r\n\t]+/g,' ').slice(0,500);}

export async function fetchWithTransientRetry(url,options={},config={}){
  const label=String(config.label||'AUTO_FACTORY_HTTP').trim()||'AUTO_FACTORY_HTTP';
  const delays=Array.isArray(config.delaysMs)&&config.delaysMs.length?config.delaysMs.map(Number):DEFAULT_DELAYS_MS;
  const maxAttempts=delays.length+1;
  let lastNetworkError=null;

  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
    try{
      const response=await fetch(url,options);
      if(response.ok||!TRANSIENT_STATUS.has(response.status)||attempt===maxAttempts)return response;
      try{await response.arrayBuffer();}catch{}
      console.warn(`${label}_TRANSIENT_HTTP status=${response.status} attempt=${attempt}/${maxAttempts}`);
    }catch(error){
      lastNetworkError=error;
      if(attempt===maxAttempts)throw new Error(`${label}_NETWORK_EXHAUSTED:${safeError(error)}`);
      console.warn(`${label}_TRANSIENT_NETWORK attempt=${attempt}/${maxAttempts} error=${safeError(error)}`);
    }
    await sleep(Math.max(0,Number(delays[attempt-1])||0));
  }

  throw new Error(`${label}_RETRY_EXHAUSTED:${safeError(lastNetworkError)}`);
}

export const AUTO_FACTORY_TRANSIENT_STATUS=TRANSIENT_STATUS;
export const AUTO_FACTORY_RETRY_DELAYS_MS=DEFAULT_DELAYS_MS;
