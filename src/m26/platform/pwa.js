const CANONICAL_SW_URL='/m26/iberfit-sw.js';
const CANONICAL_SW_SCOPE='/';
const INSTALL_STATE_EVENT='m26:pwa-install-state';

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

const DEFAULT_PUSH_STATE=Object.freeze({supported:false,secure:false,configured:false,permission:'unsupported',subscribed:false,active:false,reason:'unsupported'});
function pushText(value,max=2048){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function pushSecureContext(target=globalThis){
  if(target?.isSecureContext===true)return true;
  const protocol=String(target?.location?.protocol||'');
  const hostname=String(target?.location?.hostname||'');
  return protocol==='https:'||['localhost','127.0.0.1'].includes(hostname);
}
function pushPermission(notificationLike=globalThis.Notification){
  const value=String(notificationLike?.permission||'default').toLowerCase();
  return ['default','granted','denied'].includes(value)?value:'default';
}
function webPushSupported({target=globalThis,navigatorLike=globalThis.navigator}={}){
  return Boolean(pushSecureContext(target)&&navigatorLike&&'serviceWorker' in navigatorLike&&target?.PushManager&&target?.Notification);
}
function normalizeVapidPublicKey(value){
  const source=pushText(value,512).replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
  if(!source)return null;
  const padded=source.padEnd(Math.ceil(source.length/4)*4,'=');
  try{
    const binary=globalThis.atob?.(padded);
    if(typeof binary!=='string'||binary.length!==65)return null;
    return Uint8Array.from(binary,(character)=>character.charCodeAt(0));
  }catch{return null;}
}
function serializedPushKey(subscription,name){
  const key=subscription?.getKey?.(name);
  if(!key)return null;
  const bytes=new Uint8Array(key);
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return globalThis.btoa?.(binary)||null;
}
export function serializePushSubscription(subscription){
  if(!subscription?.endpoint)return null;
  const endpoint=pushText(subscription.endpoint,4096);
  if(!/^https:\/\//i.test(endpoint))throw new Error('M26_PUSH_ENDPOINT_INVALID');
  const p256dh=serializedPushKey(subscription,'p256dh');
  const auth=serializedPushKey(subscription,'auth');
  if(!p256dh||!auth)throw new Error('M26_PUSH_KEYS_INVALID');
  const rawExpiration=subscription.expirationTime;
  const expirationTime=rawExpiration==null?null:(Number.isFinite(Number(rawExpiration))?Number(rawExpiration):null);
  return Object.freeze({endpoint,expirationTime,keys:Object.freeze({p256dh,auth})});
}
export async function inspectWebPushState({target=globalThis,navigatorLike=globalThis.navigator,vapidPublicKey=''}={}){
  const secure=pushSecureContext(target);
  const supported=webPushSupported({target,navigatorLike});
  const configured=Boolean(normalizeVapidPublicKey(vapidPublicKey));
  if(!supported)return Object.freeze({...DEFAULT_PUSH_STATE,secure,configured,reason:secure?'unsupported':'insecure-context'});
  const permission=pushPermission(target.Notification);
  let registration=null;
  try{registration=await navigatorLike.serviceWorker.getRegistration?.('/');}catch{}
  let subscription=null;
  if(registration?.pushManager){try{subscription=await registration.pushManager.getSubscription();}catch{}}
  const subscribed=Boolean(subscription);
  const active=configured&&permission==='granted'&&subscribed;
  const reason=active?null:!configured?'not-configured':permission==='denied'?'permission-denied':permission!=='granted'?'permission-required':!registration?'service-worker-unavailable':'not-subscribed';
  return Object.freeze({supported:true,secure,configured,permission,subscribed,active,reason});
}
export async function requestWebPushPermission({target=globalThis}={}){
  if(!webPushSupported({target,navigatorLike:target?.navigator}))return Object.freeze({ok:false,permission:'unsupported',reason:'unsupported'});
  const current=pushPermission(target.Notification);
  if(current==='granted')return Object.freeze({ok:true,permission:'granted',reason:null});
  if(current==='denied')return Object.freeze({ok:false,permission:'denied',reason:'permission-denied'});
  const permission=pushPermission({permission:await target.Notification.requestPermission()});
  return Object.freeze({ok:permission==='granted',permission,reason:permission==='granted'?null:permission==='denied'?'permission-denied':'permission-dismissed'});
}
export async function subscribeWebPush({registration,vapidPublicKey,notificationLike=globalThis.Notification}={}){
  if(!registration?.pushManager)throw new Error('M26_PUSH_REGISTRATION_REQUIRED');
  if(pushPermission(notificationLike)!=='granted')throw new Error('M26_PUSH_PERMISSION_REQUIRED');
  const applicationServerKey=normalizeVapidPublicKey(vapidPublicKey);
  if(!applicationServerKey)throw new Error('M26_PUSH_VAPID_PUBLIC_KEY_INVALID');
  const existing=await registration.pushManager.getSubscription();
  const subscription=existing||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
  return Object.freeze({subscription,serialized:serializePushSubscription(subscription),created:!existing});
}
export async function unsubscribeWebPush({registration}={}){
  if(!registration?.pushManager)return Object.freeze({ok:true,changed:false});
  let subscription=null;
  try{subscription=await registration.pushManager.getSubscription();}catch{}
  if(!subscription)return Object.freeze({ok:true,changed:false});
  let ok=false;
  try{ok=await subscription.unsubscribe();}catch{}
  return Object.freeze({ok:Boolean(ok),changed:Boolean(ok)});
}
export const __webPushInternals=Object.freeze({pushSecureContext,pushPermission,webPushSupported,normalizeVapidPublicKey});

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
