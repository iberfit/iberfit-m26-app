// Operational audit only. No writes, credentials or authenticated scope.
// An aborted 1-row public read may be a transient edge/TLS failure; never
// mask a second failure, an authorization denial, or non-2xx responses.
export async function readOnlyPublicProbeWithRetry(read,{delay=()=>Promise.resolve()}={}){
  if(typeof read!=='function')throw new Error('IBERFIT_PUBLIC_PROBE_READER_REQUIRED');
  try{return await read();}
  catch(error){
    if(!['AbortError','TimeoutError','TypeError'].includes(String(error?.name||'')))throw error;
    await delay();
    return await read();
  }
}
