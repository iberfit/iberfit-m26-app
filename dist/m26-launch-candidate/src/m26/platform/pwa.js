export function canInstallPwa(){return 'serviceWorker' in globalThis.navigator;}
export async function registerM26ServiceWorker({url='/m26/sw.js',scope='/'}={}){if(!canInstallPwa())return {supported:false,registration:null};const registration=await navigator.serviceWorker.register(url,{scope});registration.addEventListener?.('updatefound',()=>globalThis.dispatchEvent?.(new CustomEvent('m26:pwa-update',{detail:{registration}})));return {supported:true,registration};}
export function activateWaitingWorker(registration){if(!registration?.waiting)return false;registration.waiting.postMessage({type:'SKIP_WAITING'});return true;}
export function observeConnectivity(target=globalThis,{navigatorLike=globalThis.navigator,onOnline,onOffline}={}){
  const notify=async()=>{const online=navigatorLike?.onLine!==false;target.dispatchEvent?.(new CustomEvent('m26:connectivity',{detail:{online}}));if(online)await onOnline?.();else await onOffline?.();};
  target.addEventListener?.('online',notify);target.addEventListener?.('offline',notify);return ()=>{target.removeEventListener?.('online',notify);target.removeEventListener?.('offline',notify);};
}
export function createConnectivitySync({coordinator,target=globalThis,navigatorLike=globalThis.navigator,onResult=()=>{},onError=()=>{}}={}){
  if(!coordinator?.synchronize)throw new Error('M26_SYNC_COORDINATOR_REQUIRED');
  const sync=async()=>{try{const result=await coordinator.synchronize();onResult(result);return result;}catch(error){onError(error);return {online:navigatorLike?.onLine!==false,attempted:0,results:[],error:error.message};}};
  return Object.freeze({start(){return observeConnectivity(target,{navigatorLike,onOnline:sync});},sync});
}
