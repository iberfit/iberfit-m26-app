const DEFAULT_AUTH_OPERATION_TIMEOUT_MS=12_000;
const MIN_AUTH_OPERATION_TIMEOUT_MS=750;
const MAX_AUTH_OPERATION_TIMEOUT_MS=60_000;

function normalizedAuthOperationTimeoutMs(value){
  const numeric=Number(value);
  if(!Number.isFinite(numeric))return DEFAULT_AUTH_OPERATION_TIMEOUT_MS;
  return Math.max(
    MIN_AUTH_OPERATION_TIMEOUT_MS,
    Math.min(MAX_AUTH_OPERATION_TIMEOUT_MS,Math.round(numeric)),
  );
}

export async function withAuthOperationTimeout(operation,{
  timeoutMs=DEFAULT_AUTH_OPERATION_TIMEOUT_MS,
  code='M26_AUTH_OPERATION_TIMEOUT',
}={}){
  if(typeof operation!=='function')throw new Error('M26_AUTH_OPERATION_INVALID');
  const duration=normalizedAuthOperationTimeoutMs(timeoutMs);
  let timer=null;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error(String(code||'M26_AUTH_OPERATION_TIMEOUT'))),duration);
  });
  try{
    return await Promise.race([
      Promise.resolve().then(operation),
      timeout,
    ]);
  }finally{
    if(timer!==null)clearTimeout(timer);
  }
}

export const __authOperationTimeoutInternals=Object.freeze({
  DEFAULT_AUTH_OPERATION_TIMEOUT_MS,
  MIN_AUTH_OPERATION_TIMEOUT_MS,
  MAX_AUTH_OPERATION_TIMEOUT_MS,
  normalizedAuthOperationTimeoutMs,
});
