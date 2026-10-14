// M42 · Auth-scoped single-flight for Builder and Live Workout entry.
export function createWorkspaceEntryGate({getScope}={}){
  if(typeof getScope!=='function')throw new Error('M42_WORKSPACE_SCOPE_REQUIRED');
  let generation=0,active=null;
  function cancel(){++generation;active=null;}
  function run(key,task){
    const request=String(key||'').trim();
    if(!request||typeof task!=='function')throw new Error('M42_WORKSPACE_ENTRY_REQUIRED');
    const scope=String(getScope()||'');
    if(active){
      if(active.key===request&&active.scope===scope)return active.promise;
      throw new Error('M42_WORKSPACE_ENTRY_BUSY');
    }
    const epoch=generation,entry={key:request,scope,promise:null};
    active=entry;
    const isCurrent=()=>active===entry&&generation===epoch&&String(getScope()||'')===scope;
    const promise=Promise.resolve().then(async()=>{
      if(!isCurrent())return false;
      const result=await task({isCurrent});
      return isCurrent()?result:false;
    }).finally(()=>{if(active===entry)active=null;});
    entry.promise=promise;
    return promise;
  }
  return Object.freeze({run,cancel,isBusy:()=>Boolean(active)});
}
