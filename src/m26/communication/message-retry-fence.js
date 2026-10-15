// IBERFIT M45: in-memory replay identity for ambiguous message delivery.
// No drafts or recipient IDs are written to browser storage.
export function createMessageRetryFence({newId,maxPending=64}={}){
  const pending=new Map();
  const generate=typeof newId==='function'?newId:()=>(
    globalThis.crypto?.randomUUID?.()||`M45-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  const limit=Math.max(1,Math.min(256,Math.floor(Number(maxPending)||64)));
  function forSend(threadId,body){
    const key=String(threadId||'').trim();
    const content=String(body||'').trim();
    if(!key||!content)throw new Error('M45_MESSAGE_RETRY_INVALID');
    const previous=pending.get(key);
    if(previous?.body===content)return previous.operationId;
    const operationId=String(generate()||'').trim();
    if(!operationId)throw new Error('M45_MESSAGE_OPERATION_ID_INVALID');
    pending.delete(key);
    if(pending.size>=limit)pending.delete(pending.keys().next().value);
    pending.set(key,{body:content,operationId});
    return operationId;
  }
  function acknowledged(threadId,operationId){
    const key=String(threadId||'').trim();
    if(pending.get(key)?.operationId!==operationId)return false;
    pending.delete(key);
    return true;
  }
  return Object.freeze({
    forSend,
    acknowledged,
    clear(){pending.clear();},
    get size(){return pending.size;},
  });
}
