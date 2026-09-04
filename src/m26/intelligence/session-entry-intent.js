const pendingByRoot=new WeakMap();
const MAX_AGE_MS=30_000;

function safeId(value){return String(value||'').trim();}

export function setPendingSessionEntry(root,{clientId,sessionId}={}){
  if(!root)throw new Error('M26_SESSION_ENTRY_ROOT_REQUIRED');
  const safeClientId=safeId(clientId);
  const safeSessionId=safeId(sessionId);
  if(!safeClientId||!safeSessionId)throw new Error('M26_SESSION_ENTRY_TARGET_REQUIRED');
  const entry={clientId:safeClientId,sessionId:safeSessionId,createdAt:Date.now(),decision:null};
  pendingByRoot.set(root,entry);
  return entry;
}

export function revalidatePendingSessionEntry(root,{state,now=new Date(),buildContext,buildDecision}={}){
  const pending=peekPendingSessionEntry(root);
  if(!pending)return null;
  if(typeof buildContext!=='function'||typeof buildDecision!=='function'){
    pendingByRoot.delete(root);
    return null;
  }
  try{
    const decision=buildDecision(buildContext(state,pending.clientId,{now}));
    const next={...pending,decision};
    pendingByRoot.set(root,next);
    return next;
  }catch{
    pendingByRoot.delete(root);
    return null;
  }
}

export function peekPendingSessionEntry(root){
  const pending=root?pendingByRoot.get(root):null;
  if(!pending)return null;
  if(Date.now()-Number(pending.createdAt||0)>MAX_AGE_MS){
    pendingByRoot.delete(root);
    return null;
  }
  return pending;
}

export function consumePendingSessionEntry(root){
  const pending=peekPendingSessionEntry(root);
  if(root)pendingByRoot.delete(root);
  return pending;
}

export function clearPendingSessionEntry(root){
  if(root)pendingByRoot.delete(root);
}
