export function canInstallPwa(){return Boolean(globalThis.navigator&&'serviceWorker' in globalThis.navigator);}
export async function registerM26ServiceWorker({url='/m26/sw.js',scope='/m26/'}={}){if(!canInstallPwa())return {supported:false,registration:null};if(!String(url).startsWith('/m26/')||!String(scope).startsWith('/m26/'))throw new Error('M26_SERVICE_WORKER_SCOPE_INVALID');const registration=await navigator.serviceWorker.register(url,{scope,updateViaCache:'none'});registration.addEventListener?.('updatefound',()=>globalThis.dispatchEvent?.(new CustomEvent('m26:pwa-update',{detail:{registration}})));return {supported:true,registration};}
export function activateWaitingWorker(registration){if(!registration?.waiting)return false;registration.waiting.postMessage({type:'SKIP_WAITING'});return true;}
function connectivityEvent(online){try{return new CustomEvent('m26:connectivity',{detail:{online}});}catch{const event=new Event('m26:connectivity');Object.defineProperty(event,'detail',{value:{online}});return event;}}
export function observeConnectivity(target=globalThis,{navigatorLike=globalThis.navigator,onOnline,onOffline,emitInitial=false}={}){
  let running=null,rerun=false,stopped=false,lastDelivered=null,forceNext=false;
  const run=(_event,{force=false}={})=>{if(force)forceNext=true;rerun=true;if(running)return running;running=(async()=>{do{rerun=false;if(stopped)break;const online=navigatorLike?.onLine!==false;const shouldDeliver=forceNext||lastDelivered!==online;forceNext=false;if(!shouldDeliver)continue;lastDelivered=online;target.dispatchEvent?.(connectivityEvent(online));if(online)await onOnline?.();else await onOffline?.();}while(rerun&&!stopped);})().finally(()=>{running=null;});return running;};
  target.addEventListener?.('online',run);target.addEventListener?.('offline',run);
  if(emitInitial)void run(null,{force:true});
  const stop=()=>{stopped=true;target.removeEventListener?.('online',run);target.removeEventListener?.('offline',run);};
  stop.run=()=>run(null,{force:true});return stop;
}
export function createConnectivitySync({coordinator,target=globalThis,navigatorLike=globalThis.navigator,onResult=()=>{},onError=()=>{}}={}){
  if(!coordinator?.synchronize)throw new Error('M26_SYNC_COORDINATOR_REQUIRED');let inFlight=null;
  const sync=()=>{if(inFlight)return inFlight;inFlight=(async()=>{try{const result=await coordinator.synchronize();await onResult(result);return result;}catch(error){await onError(error);return {online:navigatorLike?.onLine!==false,attempted:0,deferred:0,results:[],error:String(error?.message||error).slice(0,240)};}})().finally(()=>{inFlight=null;});return inFlight;};
  return Object.freeze({start({emitInitial=true}={}){return observeConnectivity(target,{navigatorLike,onOnline:sync,emitInitial:Boolean(emitInitial)});},sync});
}
