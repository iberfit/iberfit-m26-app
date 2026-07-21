export function createConfirmedExecutor({commandBus,store,draftStore,rehydrate}){
  if(!commandBus?.execute||!store?.projectOperations) throw new Error('M26_EXECUTOR_DEPENDENCIES_REQUIRED');
  return async function executeConfirmed({command,draftRef}){
    const result=await commandBus.execute(command);
    const operations=await commandBus.pending();
    store.projectOperations(operations);
    if(result.ok){ if(draftRef) draftStore?.remove(draftRef.scope,draftRef.clientId,draftRef.entityId); if(typeof rehydrate==='function') await rehydrate({reason:result.kind,response:result.response}); store.acknowledge(result.response); }
    return result;
  };
}
