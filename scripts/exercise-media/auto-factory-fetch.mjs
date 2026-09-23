import fs from 'node:fs';
import path from 'node:path';

const TRANSIENT_STATUS=new Set([408,425,429,500,501,502,503,504,505,506,507,508,510,511,520,521,522,523,524,525,526,527,530]);
const DEFAULT_DELAYS_MS=Object.freeze([1000,2000,4000,8000]);
export const AUTO_FACTORY_PROVIDER_DAILY_QUOTA='AI_PROVIDER_DAILY_QUOTA_EXHAUSTED';

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function safeError(value){return String(value instanceof Error?value.message:value||'UNKNOWN').replace(/[\r\n\t]+/g,' ').slice(0,500);}

export function detectProviderCapacityReason(value){
  const detail=String(value||'');
  if(/(?:^|\D)4006(?:\D|$)/u.test(detail)&&/daily free allocation|10,?000 neurons|used up/i.test(detail))return AUTO_FACTORY_PROVIDER_DAILY_QUOTA;
  if(/used up your daily free allocation[^\n]*neurons/i.test(detail))return AUTO_FACTORY_PROVIDER_DAILY_QUOTA;
  return null;
}

function persistProviderDeferral(reason,detail,config={}){
  const target=String(config.deferFile||process.env.IBERFIT_FACTORY_DEFER_FILE||'recovery/auto-factory/provider-capacity.json').trim();
  if(!target)return;
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,`${JSON.stringify({schema:'iberfit.exercise.media.provider-deferral.v1',reason,detail:safeError(detail),created_at:new Date().toISOString()},null,2)}\n`);
}

export async function fetchWithTransientRetry(url,options={},config={}){
  const label=String(config.label||'AUTO_FACTORY_HTTP').trim()||'AUTO_FACTORY_HTTP';
  const delays=Array.isArray(config.delaysMs)&&config.delaysMs.length?config.delaysMs.map(Number):DEFAULT_DELAYS_MS;
  const maxAttempts=delays.length+1;
  let lastNetworkError=null;

  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
    try{
      const response=await fetch(url,options);
      if(!response.ok){
        let detail='';
        try{detail=await response.clone().text();}catch{}
        const reason=detectProviderCapacityReason(detail);
        if(reason){
          persistProviderDeferral(reason,detail,config);
          const error=new Error(`${reason}:${safeError(detail)}`);
          error.code=reason;
          throw error;
        }
      }
      if(response.ok||!TRANSIENT_STATUS.has(response.status)||attempt===maxAttempts)return response;
      try{await response.arrayBuffer();}catch{}
      console.warn(`${label}_TRANSIENT_HTTP status=${response.status} attempt=${attempt}/${maxAttempts}`);
    }catch(error){
      if(error?.code===AUTO_FACTORY_PROVIDER_DAILY_QUOTA)throw error;
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
