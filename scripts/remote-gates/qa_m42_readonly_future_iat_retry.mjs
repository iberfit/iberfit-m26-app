// M42 synthetic QA-only: bounded repeat of TWO read-only endpoints.
// Protects against clock skew immediately after Auth issues a new JWT.
// Never refreshes or swaps token, never retries arbitrary 401/403 or any write.
import {isFutureIssuedJwtClockSkew} from '../../src/m26/supabase-transport.js';

const QA_CLOCK_SKEW_READS=new Set(['iberfit_bootstrap_v26','iberfit_current_role_v26','iberfit_client_id']);
const RETRY_DELAYS=Object.freeze([350,800,1300]);
export async function qaM42ReadOnlyRpcWithFutureIatRetry({
  name,token,json={},send,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
}={}){
  if(typeof send!=='function'||typeof sleep!=='function'
    ||typeof name!=='string'||!/^[a-z][a-z0-9_]{1,99}$/u.test(name)
    ||typeof token!=='string'||!token)throw Error('M42_QA_READ_RPC_INVALID_INPUT');
  const path='/rest/v1/rpc/'+name;
  const call=()=>send(path,{method:'POST',token,json});
  let response=await call();
  if(!QA_CLOCK_SKEW_READS.has(name))return response;
  for(const ms of RETRY_DELAYS){
    if(!isFutureIssuedJwtClockSkew({status:response?.status,body:response?.body}))break;
    await sleep(ms);
    response=await call();
  }
  return response;
}
