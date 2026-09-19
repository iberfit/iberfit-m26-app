const CANONICAL_SW_URL='/m26/iberfit-sw.js';
const CANONICAL_SW_SCOPE='/';
const INSTALL_STATE_EVENT='m26:pwa-install-state';
const MAX_PUSH_ENDPOINT_LENGTH=4096;
const MAX_PUSH_KEY_LENGTH=2048;

export function canInstallPwa(){return Boolean(globalThis.navigator&&'serviceWorker' in globalThis.navigator);}
function normalizeServiceWorkerRegistration(url,scope){
  const source=String(url||'');
  const requestedScope=String(scope||'');
  if(!source.startsWith('/m26/')||(requestedScope!=='/'&&!requestedScope.startsWith('/m26/')))throw new Error('M26_SERVICE_WORKER_SCOPE_INVALID');
  if(source==='/m26/sw.js'&&requestedScope==='/m26/')return {url:CANONICAL_SW_URL,scope:CANONICAL_SW_SCOPE,migrated:true};
  return {url:source,scope:requestedScope,migrated:false};
}
export async function registerM26ServiceWorker({url=CANONICAL_SW_URL,scope=CANONICAL_SW_SCOPE}={}){
  if(!canInstallPwa())return {supported:false,registration:null};
  const target=normalizeServiceWorkerRegistration(url,scope);
  const registration=await navigator.serviceWorker.register(target.url,{scope:target.scope,updateViaCache:'none'});
  registration.addEventListener?.('updatefound',()=>globalThis.dispatchEvent?.(new CustomEvent('m26:pwa-update',{detail:{registration}})));
  return {supported:true,registration,migrated:target.migrated};
}
export function activateWaitingWorker(registration){if(!registration?.waiting)return false;registration.waiting.postMessage({type:'SKIP_WAITING'});return true;}

export function isPwaStandalone({navigatorLike=globalThis.navigator,matchMediaLike=globalThis.matchMedia}={}){
  const displayStandalone=matchMediaLike?.('(display-mode: standalone)')?.matches===true;
  return displayStandalone||navigatorLike?.standalone===true;
}

export function detectPwaInstallPlatform(navigatorLike=globalThis.navigator){
  const ua=String(navigatorLike?.userAgent||'');
  const platform=String(navigatorLike?.platform||'');
  const touchPoints=Number(navigatorLike?.maxTouchPoints||0);
  const ipadDesktopMode=platform==='MacIntel'&&touchPoints>1;
  const ios=/iPad|iPhone|iPod/i.test(ua)||ipadDesktopMode;
  const android=/Android/i.test(ua);
  const mac=!ios&&(/Macintosh|Mac OS X/i.test(ua)||/^Mac/i.test(platform));
  const windows=/Windows/i.test(ua)||/^Win/i.test(platform);
  const safari=/Safari/i.test(ua)&&!/Chrome|CriOS|Chromium|Edg|OPR|FxiOS/i.test(ua);
  return Object.freeze({ios,android,mac,windows,safari});
}

export function manualPwaInstallGuidance(navigatorLike=globalThis.navigator){
  const platform=detectPwaInstallPlatform(navigatorLike);
  if(platform.ios){
    return Object.freeze({
      platform:'ios',
      label:'Instalar IBERFIT',
      instructions:'En Safari, toca Compartir, elige “Añadir a pantalla de inicio”, activa “Abrir como app web” si aparece y pulsa Añadir.',
    });
  }
  if(platform.mac&&platform.safari){
    return Object.freeze({
      platform:'mac-safari',
      label:'Instalar IBERFIT',
      instructions:'En Safari, abre el menú Archivo y elige “Añadir al Dock”. IBERFIT quedará disponible como una app independiente.',
    });
  }
  return null;
}

export function createPwaInstallController({
  target=globalThis,
  navigatorLike=globalThis.navigator,
  matchMediaLike=globalThis.matchMedia,
  onChange=()=>{},
}={}){
  let deferredPrompt=null;
  let installed=isPwaStandalone({navigatorLike,matchMediaLike});
  let mounted=false;

  const getState=()=>{
    if(installed||isPwaStandalone({navigatorLike,matchMediaLike})){
      installed=true;
      return Object.freeze({available:false,installed:true,kind:'installed',label:'IBERFIT instalada',instructions:''});
    }
    if(deferredPrompt){
      return Object.freeze({
        available:true,
        installed:false,
        kind:'prompt',
        label:'Instalar IBERFIT',
        instructions:'Añade IBERFIT a este dispositivo para abrirla como una aplicación desde tu pantalla de inicio, escritorio o lanzador.',
      });
    }
    const manual=manualPwaInstallGuidance(navigatorLike);
    if(manual){
      return Object.freeze({available:true,installed:false,kind:'manual',...manual});
    }
    return Object.freeze({available:false,installed:false,kind:'unavailable',label:'',instructions:''});
  };

  const notify=()=>{try{onChange(getState());}catch{}};
  const onBeforeInstallPrompt=(event)=>{
    if(!event||typeof event.prompt!=='function')return;
    event.preventDefault?.();
    deferredPrompt=event;
    notify();
  };
  const onAppInstalled=()=>{
    deferredPrompt=null;
    installed=true;
    notify();
  };

  async function install(){
    const state=getState();
    if(state.installed)return Object.freeze({ok:true,installed:true,outcome:'installed'});
    if(state.kind==='manual')return Object.freeze({ok:false,manual:true,outcome:'manual',instructions:state.instructions});
    if(state.kind!=='prompt'||!deferredPrompt)return Object.freeze({ok:false,manual:false,outcome:'unavailable'});
    const prompt=deferredPrompt;
    deferredPrompt=null;
    try{
      await prompt.prompt();
      const choice=await prompt.userChoice;
      const outcome=String(choice?.outcome||'dismissed');
      if(outcome==='accepted')installed=true;
      notify();
      return Object.freeze({ok:outcome==='accepted',installed:outcome==='accepted',outcome});
    }catch(error){
      notify();
      throw error;
    }
  }

  function mount(){
    if(mounted)return getState();
    mounted=true;
    target.addEventListener?.('beforeinstallprompt',onBeforeInstallPrompt);
    target.addEventListener?.('appinstalled',onAppInstalled);
    notify();
    return getState();
  }
  function destroy(){
    if(!mounted)return;
    mounted=false;
    target.removeEventListener?.('beforeinstallprompt',onBeforeInstallPrompt);
    target.removeEventListener?.('appinstalled',onAppInstalled);
    deferredPrompt=null;
  }

  return Object.freeze({mount,destroy,getState,install});
}

let browserInstallController=null;
function emitBrowserInstallState(state){
  try{globalThis.dispatchEvent?.(new CustomEvent(INSTALL_STATE_EVENT,{detail:state}));}catch{}
}
export function getBrowserPwaInstallController(){
  if(browserInstallController)return browserInstallController;
  if(typeof globalThis.addEventListener!=='function'||!globalThis.navigator)return null;
  browserInstallController=createPwaInstallController({onChange:emitBrowserInstallState});
  browserInstallController.mount();
  return browserInstallController;
}

function escapeInstallText(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function registerInstallElement(){
  if(!globalThis.customElements||globalThis.customElements.get('iberfit-install-control'))return;
  const BaseElement=globalThis.HTMLElement;
  if(typeof BaseElement!=='function')return;
  globalThis.customElements.define('iberfit-install-control',class extends BaseElement{
    connectedCallback(){
      this._onState=()=>this.render();
      globalThis.addEventListener?.(INSTALL_STATE_EVENT,this._onState);
      this.render();
    }
    disconnectedCallback(){globalThis.removeEventListener?.(INSTALL_STATE_EVENT,this._onState);}
    render(){
      const controller=getBrowserPwaInstallController();
      const state=controller?.getState?.();
      if(!state?.available){this.replaceChildren();return;}
      if(state.kind==='prompt'){
        this.innerHTML=`<div class="m26-auth-install"><button type="button" data-pwa-install class="m26-text-action">${escapeInstallText(state.label)}</button><p class="m26-field-help">${escapeInstallText(state.instructions)}</p></div>`;
        this.querySelector?.('[data-pwa-install]')?.addEventListener('click',async()=>{
          const button=this.querySelector?.('[data-pwa-install]');
          if(button)button.disabled=true;
          try{await controller.install();}finally{this.render();}
        },{once:true});
        return;
      }
      this.innerHTML=`<div class="m26-auth-install"><strong>${escapeInstallText(state.label)}</strong><p class="m26-field-help">${escapeInstallText(state.instructions)}</p></div>`;
    }
  });
}

getBrowserPwaInstallController();
registerInstallElement();

function connectivityEvent(online){try{return new CustomEvent('m26:connectivity',{detail:{online}});}catch{const event=new Event('m26:connectivity');Object.defineProperty(event,'detail',{value:{online}});return event;}}
export function observeConnectivity(target=globalThis,{navigatorLike=globalThis.navigator,onOnline,onOffline,emitInitial=false,baselineCurrentState=false}={}){
  let running=null,rerun=false,stopped=false,lastDelivered=baselineCurrentState?(navigatorLike?.onLine!==false):null,forceNext=false;
  const run=(_event,{force=false}={})=>{if(force)forceNext=true;rerun=true;if(running)return running;running=(async()=>{do{rerun=false;if(stopped)break;const online=navigatorLike?.onLine!==false;const shouldDeliver=forceNext||lastDelivered!==online;forceNext=false;if(!shouldDeliver)continue;lastDelivered=online;target.dispatchEvent?.(connectivityEvent(online));if(online)await onOnline?.();else await onOffline?.();}while(rerun&&!stopped);})().finally(()=>{running=null;});return running;};
  target.addEventListener?.('online',run);target.addEventListener?.('offline',run);
  if(emitInitial)void run(null,{force:true});
  const stop=()=>{stopped=true;target.removeEventListener?.('online',run);target.removeEventListener?.('offline',run);};
  stop.run=()=>run(null,{force:true});return stop;
}
export function createConnectivitySync({coordinator,target=globalThis,navigatorLike=globalThis.navigator,onResult=()=>{},onError=()=>{}}={}){
  if(!coordinator?.synchronize)throw new Error('M26_SYNC_COORDINATOR_REQUIRED');let inFlight=null;
  const sync=()=>{if(inFlight)return inFlight;inFlight=(async()=>{try{const result=await coordinator.synchronize();await onResult(result);return result;}catch(error){await onError(error);return {online:navigatorLike?.onLine!==false,attempted:0,deferred:0,results:[],error:String(error?.message||error).slice(0,240)};}})().finally(()=>{inFlight=null;});return inFlight;};
  return Object.freeze({start({emitInitial=true}={}){const initial=Boolean(emitInitial);return observeConnectivity(target,{navigatorLike,onOnline:sync,emitInitial:initial,baselineCurrentState:!initial});},sync});
}

function hasPushFunction(value,key){
  return Boolean(value&&typeof value[key]==='function');
}

function normalizePushBase64Url(value){
  const raw=String(value||'').trim();
  if(!raw||raw.length>MAX_PUSH_KEY_LENGTH)return null;
  if(!/^[A-Za-z0-9_-]+={0,2}$/.test(raw))return null;
  return raw.replace(/=+$/,'');
}

export function urlBase64ToUint8Array(value){
  const normalized=normalizePushBase64Url(value);
  if(!normalized)throw new Error('M26_PUSH_PUBLIC_KEY_INVALID');
  const padded=`${normalized}${'='.repeat((4-normalized.length%4)%4)}`;
  const base64=padded.replace(/-/g,'+').replace(/_/g,'/');
  let binary='';
  if(typeof globalThis.atob==='function')binary=globalThis.atob(base64);
  else if(typeof Buffer!=='undefined')binary=Buffer.from(base64,'base64').toString('binary');
  else throw new Error('M26_PUSH_BASE64_UNAVAILABLE');
  return Uint8Array.from(binary,(character)=>character.charCodeAt(0));
}

export function webPushCapability({navigatorObject=globalThis.navigator,notificationApi=globalThis.Notification,pushManagerApi=globalThis.PushManager,secureContext=globalThis.isSecureContext}={}){
  const serviceWorkerSupported=Boolean(navigatorObject?.serviceWorker);
  const pushSupported=Boolean(pushManagerApi);
  const notificationsSupported=Boolean(notificationApi);
  const secure=secureContext===true;
  const permission=notificationsSupported?String(notificationApi.permission||'default'):'unsupported';
  return Object.freeze({supported:secure&&serviceWorkerSupported&&pushSupported&&notificationsSupported,secureContext:secure,serviceWorkerSupported,pushSupported,notificationsSupported,permission,denied:permission==='denied',granted:permission==='granted'});
}

function validatePushEndpoint(endpoint){
  const raw=String(endpoint||'').trim();
  if(!raw||raw.length>MAX_PUSH_ENDPOINT_LENGTH)throw new Error('M26_PUSH_ENDPOINT_INVALID');
  let url;
  try{url=new URL(raw);}catch{throw new Error('M26_PUSH_ENDPOINT_INVALID');}
  if(url.protocol!=='https:')throw new Error('M26_PUSH_ENDPOINT_INSECURE');
  return url.toString();
}

function keyFromPushSubscription(subscription,name){
  const json=typeof subscription?.toJSON==='function'?subscription.toJSON():null;
  const fromJson=normalizePushBase64Url(json?.keys?.[name]);
  if(fromJson)return fromJson;
  const buffer=subscription?.getKey?.(name);
  if(!buffer)return null;
  const bytes=new Uint8Array(buffer);
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  if(typeof globalThis.btoa!=='function')throw new Error('M26_PUSH_BASE64_UNAVAILABLE');
  return globalThis.btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export function serializeIberfitPushSubscription(subscription){
  if(!subscription)throw new Error('M26_PUSH_SUBSCRIPTION_REQUIRED');
  const endpoint=validatePushEndpoint(subscription.endpoint);
  const p256dh=keyFromPushSubscription(subscription,'p256dh');
  const auth=keyFromPushSubscription(subscription,'auth');
  if(!p256dh||!auth)throw new Error('M26_PUSH_KEYS_REQUIRED');
  return Object.freeze({endpoint,expirationTime:Number.isFinite(subscription.expirationTime)?Number(subscription.expirationTime):null,keys:Object.freeze({p256dh,auth})});
}

export async function getIberfitPushSubscription(registration){
  if(!registration?.pushManager||!hasPushFunction(registration.pushManager,'getSubscription'))return null;
  return await registration.pushManager.getSubscription();
}

export async function subscribeIberfitWebPush({registration,applicationServerKey,notificationApi=globalThis.Notification}={}){
  if(!registration?.pushManager||!hasPushFunction(registration.pushManager,'subscribe'))throw new Error('M26_PUSH_MANAGER_UNAVAILABLE');
  if(!notificationApi||typeof notificationApi.requestPermission!=='function')throw new Error('M26_NOTIFICATIONS_UNAVAILABLE');
  let permission=String(notificationApi.permission||'default');
  if(permission==='denied')throw new Error('M26_PUSH_PERMISSION_DENIED');
  if(permission!=='granted')permission=String(await notificationApi.requestPermission());
  if(permission!=='granted')throw new Error('M26_PUSH_PERMISSION_NOT_GRANTED');
  const key=urlBase64ToUint8Array(applicationServerKey);
  const existing=await getIberfitPushSubscription(registration);
  if(existing)return serializeIberfitPushSubscription(existing);
  const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  return serializeIberfitPushSubscription(subscription);
}

export async function unsubscribeIberfitWebPush(registration){
  const subscription=await getIberfitPushSubscription(registration);
  if(!subscription)return Object.freeze({unsubscribed:true,hadSubscription:false});
  const serialized=serializeIberfitPushSubscription(subscription);
  const unsubscribed=await subscription.unsubscribe();
  return Object.freeze({unsubscribed:unsubscribed===true,hadSubscription:true,endpoint:serialized.endpoint});
}
