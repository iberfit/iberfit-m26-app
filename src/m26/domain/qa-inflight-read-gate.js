// P0 Supabase Free: QA-only same-token/same-argument IN-FLIGHT reads.
// NEVER caches completed results or auth decisions; user identity is the exact
// JWT, never a role/email. All entries are evicted on success and rejection.
// A max-pending bound prevents runaway JS memory use during synthetic CI.
export function createQaInFlightReadGate({enabled=false,maxPending=64}={}){
  const active=new Map();
  let size=0;
  function run({token,name,params='',request}={}){
    if(typeof request!=='function')throw new TypeError('M26_READ_GATE_REQUEST_REQUIRED');
    if(enabled!==true)return request();
    if(typeof token!=='string'||!token||typeof name!=='string'||!name
      ||typeof params!=='string')return request();
    let bucket=active.get(token);
    const key=name+'\u0000'+params;
    if(bucket?.has(key))return bucket.get(key);
    if(size>=maxPending)return request();
    if(!bucket){bucket=new Map();active.set(token,bucket);}
    size+=1;
    const entry=bucket;
    const cleanup=()=>{
      if(entry.get(key)===shared){
        entry.delete(key);
        size-=1;
        if(entry.size===0&&active.get(token)===entry)active.delete(token);
      }
    };
    // Delayed dispatch allows same-task concurrent reads to coalesce.
    const shared=Promise.resolve().then(request).then(
      value=>{cleanup();return value;},
      error=>{cleanup();throw error;},
    );
    bucket.set(key,shared);
    return shared;
  }
  return Object.freeze({run});
}
